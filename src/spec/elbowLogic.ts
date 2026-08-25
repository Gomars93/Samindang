/**
 * ELBOW_V1 safety-state logic.
 *
 * Two layers, same convention as kneeLogic.ts's top comment. Ground truth
 * here is `ELBOW_V1_Tablet_Question_Set_v0.1.1.md` §10-11 (Elbow Safety
 * Engine, Flags) -- CLINICAL DECISIONS CLOSED (Opus v0.1 review -> Tablet
 * v0.1 -> Opus v0.2 review [2 mechanical fixes] -> Tablet v0.1.1 -> Opus
 * final verification PASS). This file is a literal port; no threshold here
 * was invented at the integration stage
 * (`ELBOW_V1_Fable_Integration_Plan_v0.1.md` §14 literal invariants).
 *
 * Like kneeLogic.ts (and unlike shoulderLogic.ts), ELBOW_V1 does NOT reuse
 * another module's canonical safety engine -- the CLOSED Tablet doc's §6
 * states explicitly that NECK_QUESTIONS is not reused (no shared
 * population). ELBOW_10's referred/proximal screen is therefore a
 * genuinely new, independent minimal red-flag screen.
 *
 * F1-style invariant: `ELBOW_00` (arm_hand_region_discriminator) is
 * routing/tagging only and never appears in `ElbowState` or anywhere in
 * this file's computation -- see elbowAdapter.ts's top comment and
 * coreSpec.ts's `IS_PRIMARY_ELBOW_SAFETY`.
 *
 * MISSING contract: identical to lbpLogic.ts/neckLogic.ts/shoulderLogic.ts/
 * kneeLogic.ts -- unanswered fields are `undefined`, never `null`.
 */

// ---------------------------------------------------------------------------
// Layer 1: literal port of ELBOW_V1_Tablet_Question_Set_v0.1.1.md §3-11
// ---------------------------------------------------------------------------

export type ElbowSafetyStatus = 'CLEAR' | 'REVIEW_REQUIRED' | 'URGENT_REVIEW'
type YesNoUnknown = 'YES' | 'NO' | 'UNKNOWN'
type ElbowBursalScreen = 'NONE' | 'LOCALIZED_STABLE' | 'SYSTEMIC_OR_RAPIDLY_SPREADING' | 'UNKNOWN'

/** ELBOW_02 concrete urgent set -- §3/§10: unconditional URGENT_REVIEW. */
const ELBOW02_URGENT = new Set(['GROSS_DEFORMITY_OR_STILL_OUT', 'COLD_PALE_BLUE_HAND', 'MAJOR_NEW_DISTAL_NEURO_CHANGE'])

/** ELBOW_09A concrete progressive-motor set -- §5. */
const ELBOW09A_CONCRETE = new Set(['NEW_OR_WORSENING_HAND_WEAKNESS', 'VISIBLE_MUSCLE_WASTING'])

/** ELBOW_10 concrete referred/proximal set -- §6. */
const ELBOW10_CONCRETE = new Set(['NEW_NECK_SHOULDER_SYMPTOM', 'MULTI_LEVEL_OR_BILATERAL_SENSORY_CHANGE'])

/** ELBOW_11 concrete cardiac-associated urgent set -- §6: no movement/rest AND gate. */
const ELBOW11_URGENT = new Set(['CHEST_PAIN_OR_TIGHTNESS', 'SHORTNESS_OF_BREATH', 'COLD_SWEAT', 'NAUSEA'])

export interface ElbowState {
  elbow_recent_trauma_or_sudden_load?: YesNoUnknown // ELBOW_01
  elbow_deformity_neurovascular_screen?: string[] // ELBOW_02
  elbow_spontaneously_reduced_dislocation_screen?: YesNoUnknown // ELBOW_02A (unconditional exposure)
  elbow_post_trauma_functional_loss?: YesNoUnknown // ELBOW_03 (show_when ELBOW_01 in [YES,UNKNOWN])
  elbow_distal_biceps_concern?: YesNoUnknown // ELBOW_04 (show_when ELBOW_01 in [YES,UNKNOWN])
  elbow_distal_triceps_concern?: YesNoUnknown // ELBOW_05 (show_when ELBOW_01 in [YES,UNKNOWN])
  elbow_true_locked_rom_block?: YesNoUnknown // ELBOW_06 (unconditional)
  elbow_septic_joint_emergency_screen?: YesNoUnknown // ELBOW_07 (unconditional)
  elbow_posterior_bursal_screen?: ElbowBursalScreen // ELBOW_08 (single_choice, unconditional)
  elbow_ulnar_sensory_screen?: YesNoUnknown // ELBOW_09 (unconditional)
  elbow_ulnar_motor_progression_screen?: string[] // ELBOW_09A (show_when ELBOW_09 in [YES,UNKNOWN])
  elbow_referred_proximal_screen?: string[] // ELBOW_10 (unconditional)
  elbow_cardiac_associated_screen?: string[] // ELBOW_11 (show_when !general_red)
  /** Core's computeFlags(r).general_red -- URGENT_REVIEW rule 1. */
  core_safety_already_urgent: boolean
}

export interface ElbowComputedFields {
  elbow_safety_status: ElbowSafetyStatus
  fracture_imaging_consider: boolean
  expedited_referral_consider: boolean
  neuro_assessment_required: boolean
  infection_assessment_required: boolean
}

const arraysEqual = (a: string[] | undefined, b: string[]): boolean =>
  a !== undefined && a.length === b.length && a.every((v, i) => v === b[i])

/** ELBOW_01 status. YES alone is never itself a review trigger (§3: 후속 문항이 실제 위험을 담당). */
function elbow01Status(v: ElbowState['elbow_recent_trauma_or_sudden_load']): { review: boolean } {
  if (v === 'UNKNOWN' || v === undefined) return { review: true }
  return { review: false } // YES or NO
}

/** show_when ELBOW_01 in [YES, UNKNOWN] for ELBOW_03/04/05. Missing ELBOW_01 is not-shown (its own elbow01Status already fails closed). */
function elbow01Shown(v: ElbowState['elbow_recent_trauma_or_sudden_load']): boolean {
  return v === 'YES' || v === 'UNKNOWN'
}

/**
 * ELBOW_02 status. Concrete-urgent-set check runs before any NONE-array
 * validity check (same ordering as kneeLogic.ts's knee02Status /
 * shoulderLogic.ts's sh02Status) -- a genuine positive finding is never
 * cancelled out by a contradictory NONE in the same malformed array.
 */
function elbow02Status(v: string[] | undefined): { urgent: boolean; review: boolean } {
  if (v === undefined || !Array.isArray(v) || v.length === 0) return { urgent: false, review: true }
  if (v.some((x) => ELBOW02_URGENT.has(x))) return { urgent: true, review: true }
  if (v.includes('UNKNOWN')) return { urgent: false, review: true }
  if (arraysEqual(v, ['NONE'])) return { urgent: false, review: false }
  return { urgent: false, review: true } // malformed
}

/** ELBOW_02A status -- E2: unconditional exposure, YES -> URGENT regardless of ELBOW_01. */
function elbow02aStatus(v: ElbowState['elbow_spontaneously_reduced_dislocation_screen']): {
  urgent: boolean
  review: boolean
} {
  if (v === 'YES') return { urgent: true, review: true }
  if (v === 'UNKNOWN' || v === undefined) return { urgent: false, review: true }
  return { urgent: false, review: false } // 'NO'
}

/** ELBOW_03 status (show_when ELBOW_01 in [YES,UNKNOWN]). YES -> REVIEW + fracture_imaging_consider trigger. */
function elbow03Status(v: ElbowState['elbow_post_trauma_functional_loss'], shown: boolean): { review: boolean } {
  if (!shown) return { review: false }
  if (v === 'YES' || v === 'UNKNOWN' || v === undefined) return { review: true }
  return { review: false } // 'NO'
}

/**
 * ELBOW_04 status (show_when ELBOW_01 in [YES,UNKNOWN]). §10/§11: never
 * auto-escalates to URGENT. `expedited` is deliberately NOT set on plain
 * missing (undefined) -- only explicit YES/UNKNOWN answers set the flag
 * (§11: "missing... expedited flag를 임의로 true로 만들지 않는다").
 */
function elbow04Status(
  v: ElbowState['elbow_distal_biceps_concern'],
  shown: boolean,
): { review: boolean; expedited: boolean } {
  if (!shown) return { review: false, expedited: false }
  if (v === 'YES' || v === 'UNKNOWN') return { review: true, expedited: true }
  if (v === undefined) return { review: true, expedited: false }
  return { review: false, expedited: false } // 'NO'
}

/** ELBOW_05 status (show_when ELBOW_01 in [YES,UNKNOWN]). Same missing/expedited split as elbow04Status. */
function elbow05Status(
  v: ElbowState['elbow_distal_triceps_concern'],
  shown: boolean,
): { review: boolean; expedited: boolean } {
  if (!shown) return { review: false, expedited: false }
  if (v === 'YES' || v === 'UNKNOWN') return { review: true, expedited: true }
  if (v === undefined) return { review: true, expedited: false }
  return { review: false, expedited: false } // 'NO'
}

/** ELBOW_06 status (unconditional). Same missing/expedited split. Never auto-escalates to URGENT. */
function elbow06Status(v: ElbowState['elbow_true_locked_rom_block']): { review: boolean; expedited: boolean } {
  if (v === 'YES' || v === 'UNKNOWN') return { review: true, expedited: true }
  if (v === undefined) return { review: true, expedited: false }
  return { review: false, expedited: false } // 'NO'
}

/** ELBOW_07 status (unconditional). YES -> URGENT (E1: same tier as SHOULDER SH04/KNEE KNEE_07). */
function elbow07Status(v: ElbowState['elbow_septic_joint_emergency_screen']): { urgent: boolean; review: boolean } {
  if (v === 'YES') return { urgent: true, review: true }
  if (v === 'UNKNOWN' || v === undefined) return { urgent: false, review: true }
  return { urgent: false, review: false } // 'NO'
}

/**
 * ELBOW_08 status (single_choice, unconditional). `SYSTEMIC_OR_RAPIDLY_
 * SPREADING` is a single enum value that already combines "systemic
 * illness OR rapidly spreading redness/swelling" (Opus v0.2 verified this
 * is a fail-safe OR, not an AND gate) -- it is compared as one value here,
 * never decomposed into two separately-ANDed conditions.
 */
function elbow08Status(v: ElbowState['elbow_posterior_bursal_screen']): { urgent: boolean; review: boolean } {
  if (v === 'SYSTEMIC_OR_RAPIDLY_SPREADING') return { urgent: true, review: true }
  if (v === 'LOCALIZED_STABLE') return { urgent: false, review: true }
  if (v === 'UNKNOWN' || v === undefined) return { urgent: false, review: true }
  return { urgent: false, review: false } // 'NONE'
}

type MultiOutcome = 'CONCRETE' | 'NONE' | 'UNKNOWN' | 'INVALID'

function classifyElbow09a(v: string[] | undefined): MultiOutcome {
  if (v === undefined || !Array.isArray(v) || v.length === 0) return 'INVALID'
  if (v.some((x) => ELBOW09A_CONCRETE.has(x))) return 'CONCRETE'
  if (v.includes('UNKNOWN')) return 'UNKNOWN'
  if (arraysEqual(v, ['NONE'])) return 'NONE'
  return 'INVALID' // malformed
}

/**
 * ELBOW_09/ELBOW_09A combined-condition -- §5, the single most
 * safety-critical calibration in this file (mirrors kneeLogic.ts's K5 DVT
 * calibration). The one negative carve-out (ELBOW_09 YES + ELBOW_09A exact
 * [NONE], i.e. stable sensory-only cubital tunnel symptoms) does NOT
 * independently create REVIEW_REQUIRED -- this is a deliberate
 * de-escalation, CLOSED by Opus v0.1/v0.2/final verification. Every other
 * combination (ELBOW_09A concrete positive, UNKNOWN, or invalid/missing;
 * or ELBOW_09 itself UNKNOWN/missing) fails closed to REVIEW_REQUIRED.
 *
 * `expedited` and `neuro` are returned together and MUST always agree
 * (v0.1.1 fix: Opus v0.2 found expedited_referral_consider silently
 * dropped the ELBOW_09A-ambiguous branch that neuro_assessment_required
 * already correctly included -- both flags now share this single
 * computation so they can never drift apart again).
 */
function elbow09Contribution(
  v09: ElbowState['elbow_ulnar_sensory_screen'],
  v09a: string[] | undefined,
): { review: boolean; expedited: boolean; neuro: boolean } {
  if (v09 === undefined || v09 === 'UNKNOWN') {
    return { review: true, expedited: false, neuro: false }
  }
  if (v09 === 'YES') {
    const outcome = classifyElbow09a(v09a)
    if (outcome === 'NONE') return { review: false, expedited: false, neuro: false } // stable sensory-only de-escalation
    return { review: true, expedited: true, neuro: true } // CONCRETE / UNKNOWN / INVALID(missing/malformed)
  }
  return { review: false, expedited: false, neuro: false } // 'NO'
}

/** ELBOW_10 status (unconditional). All concrete options are REVIEW_REQUIRED only (never urgent). */
function elbow10Status(v: string[] | undefined): { review: boolean } {
  if (v === undefined || !Array.isArray(v) || v.length === 0) return { review: true }
  if (v.some((x) => ELBOW10_CONCRETE.has(x))) return { review: true }
  if (v.includes('UNKNOWN')) return { review: true }
  if (arraysEqual(v, ['NONE'])) return { review: false }
  return { review: true } // malformed
}

/**
 * ELBOW_11 status (show_when !general_red). C2/§6: single-condition gate
 * only -- no movement-independent/rest-only AND qualifier. Concrete
 * positive -> URGENT (cardiac referred pain).
 */
function elbow11Status(v: string[] | undefined, shown: boolean): { urgent: boolean; review: boolean } {
  if (!shown) return { urgent: false, review: false }
  if (v === undefined || !Array.isArray(v) || v.length === 0) return { urgent: false, review: true }
  if (v.some((x) => ELBOW11_URGENT.has(x))) return { urgent: true, review: true }
  if (v.includes('UNKNOWN')) return { urgent: false, review: true }
  if (arraysEqual(v, ['NONE'])) return { urgent: false, review: false }
  return { urgent: false, review: true } // malformed
}

/**
 * Port of the Elbow Safety Engine (Tablet v0.1.1 §10). URGENT_REVIEW rule 1
 * (`core_safety_already_urgent`) makes any upstream Core global red-flag
 * interrupt unconditionally urgent here too, independent of whether
 * ELBOW_11 was ever shown/answered (it is skipped precisely when this is
 * already true) -- same passthrough principle as shoulderLogic.ts/
 * neckLogic.ts/kneeLogic.ts.
 */
function elbowSafetyStatus(s: ElbowState): ElbowSafetyStatus {
  const e01 = elbow01Status(s.elbow_recent_trauma_or_sudden_load)
  const e01Shown = elbow01Shown(s.elbow_recent_trauma_or_sudden_load)
  const e02 = elbow02Status(s.elbow_deformity_neurovascular_screen)
  const e02a = elbow02aStatus(s.elbow_spontaneously_reduced_dislocation_screen)
  const e03 = elbow03Status(s.elbow_post_trauma_functional_loss, e01Shown)
  const e04 = elbow04Status(s.elbow_distal_biceps_concern, e01Shown)
  const e05 = elbow05Status(s.elbow_distal_triceps_concern, e01Shown)
  const e06 = elbow06Status(s.elbow_true_locked_rom_block)
  const e07 = elbow07Status(s.elbow_septic_joint_emergency_screen)
  const e08 = elbow08Status(s.elbow_posterior_bursal_screen)
  const e09 = elbow09Contribution(s.elbow_ulnar_sensory_screen, s.elbow_ulnar_motor_progression_screen)
  const e10 = elbow10Status(s.elbow_referred_proximal_screen)
  // ELBOW_11 show_when: IS_PRIMARY_ELBOW_SAFETY && !general_red -- skipped precisely
  // when core_safety_already_urgent is true, which independently already makes this
  // engine urgent via the rule above, so the skip is never a fail-open (§6).
  const e11 = elbow11Status(s.elbow_cardiac_associated_screen, !s.core_safety_already_urgent)

  const urgent = s.core_safety_already_urgent === true || e02.urgent || e02a.urgent || e07.urgent || e08.urgent || e11.urgent

  if (urgent) return 'URGENT_REVIEW'

  const review =
    e01.review ||
    e02.review ||
    e02a.review ||
    e03.review ||
    e04.review ||
    e05.review ||
    e06.review ||
    e07.review ||
    e08.review ||
    e09.review ||
    e10.review ||
    e11.review

  return review ? 'REVIEW_REQUIRED' : 'CLEAR'
}

/** Port of the expedited_referral_consider flag. NOT a 4th safety status -- always computed alongside elbow_safety_status. */
function expeditedReferralConsider(s: ElbowState): boolean {
  const e01Shown = elbow01Shown(s.elbow_recent_trauma_or_sudden_load)
  const e04 = elbow04Status(s.elbow_distal_biceps_concern, e01Shown)
  const e05 = elbow05Status(s.elbow_distal_triceps_concern, e01Shown)
  const e06 = elbow06Status(s.elbow_true_locked_rom_block)
  const e09 = elbow09Contribution(s.elbow_ulnar_sensory_screen, s.elbow_ulnar_motor_progression_screen)
  return e04.expedited || e05.expedited || e06.expedited || e09.expedited
}

/** Port of the fracture_imaging_consider flag. ELBOW_03 YES only. */
function fractureImagingConsider(s: ElbowState): boolean {
  return s.elbow_post_trauma_functional_loss === 'YES'
}

/** Port of the neuro_assessment_required flag. Shares elbow09Contribution with expedited_referral_consider so they can never drift apart (v0.1.1 fix). */
function neuroAssessmentRequired(s: ElbowState): boolean {
  return elbow09Contribution(s.elbow_ulnar_sensory_screen, s.elbow_ulnar_motor_progression_screen).neuro
}

/** Port of the infection_assessment_required flag. ELBOW_07 != NO, or ELBOW_08 != NONE (both fail closed on UNKNOWN/missing). */
function infectionAssessmentRequired(s: ElbowState): boolean {
  const septicConcern = s.elbow_septic_joint_emergency_screen !== 'NO'
  const bursalConcern = s.elbow_posterior_bursal_screen !== 'NONE'
  return septicConcern || bursalConcern
}

/**
 * `elbow_safety_status !== 'CLEAR'` -- §12: locks both routine exercise
 * recommendation and routine manual-treatment suggestion. No separate
 * manipulation-risk lock domain is defined for ELBOW_V1 (CLOSED spec has
 * none), matching kneeSafetyLocked's/shoulderSafetyLocked's precedent.
 */
export const elbowSafetyLocked = (f: ElbowComputedFields): boolean => f.elbow_safety_status !== 'CLEAR'

/** Port of the full ELBOW_V1 computed-fields set. Always computed whenever ELBOW_V1 is active for a patient (IS_PRIMARY_ELBOW_SAFETY). */
export function computeElbowFlags(state: ElbowState): ElbowComputedFields {
  return {
    elbow_safety_status: elbowSafetyStatus(state),
    fracture_imaging_consider: fractureImagingConsider(state),
    expedited_referral_consider: expeditedReferralConsider(state),
    neuro_assessment_required: neuroAssessmentRequired(state),
    infection_assessment_required: infectionAssessmentRequired(state),
  }
}
