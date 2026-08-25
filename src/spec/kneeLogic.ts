/**
 * KNEE_V1 safety-state logic.
 *
 * Two layers, same convention as lbpLogic.ts/neckLogic.ts/shoulderLogic.ts's
 * top comments. Ground truth here is `KNEE_V1_Tablet_Question_Set_v0.1.md`
 * §2-3/9-13 as amended by `KNEE_V1_Tablet_Question_Set_v0.1.1_Amendment_
 * CLOSED_CANDIDATE.md` §A1-A4 -- CLINICAL DECISIONS CLOSED (Opus v0.1 review
 * -> v0.1 tablet draft -> Opus v0.2 review [K5/K9/fail-closed] -> v0.1.1
 * amendment -> Opus final verification PASS). This file is a literal port;
 * no threshold here was invented at the integration stage
 * (`KNEE_V1_Fable_Integration_Plan_v0.1.md` §2 non-negotiable invariants).
 *
 * Unlike shoulderLogic.ts, KNEE_V1 does NOT reuse another module's canonical
 * safety engine -- `PAIN_01 === 'knee'` is mutually exclusive with
 * `'low_back_pelvis'`/`'neck_shoulder'` (single_choice), so there is no
 * shared patient population to reuse LBP/NECK safety against (this was
 * Opus v0.2's K9 finding). KNEE_08's referred/non-knee screen is therefore a
 * genuinely new, independent minimal red-flag screen, not a call into
 * lbpLogic.ts.
 *
 * MISSING contract: identical to lbpLogic.ts/neckLogic.ts/shoulderLogic.ts --
 * unanswered fields are `undefined`, never `null`.
 */

// ---------------------------------------------------------------------------
// Layer 1: literal port of KNEE_V1_Tablet_Question_Set_v0.1.md §9-13
// (as amended by v0.1.1 Amendment §A1-A4)
// ---------------------------------------------------------------------------

export type KneeSafetyStatus = 'CLEAR' | 'REVIEW_REQUIRED' | 'URGENT_REVIEW'
type YesNoUnknown = 'YES' | 'NO' | 'UNKNOWN'

/** KNEE_02 concrete urgent set -- §3/§11: unconditional URGENT_REVIEW. */
const KNEE02_URGENT = new Set(['GROSS_DEFORMITY_OR_STILL_OUT', 'COLD_PALE_BLUE_FOOT', 'MAJOR_NEW_DISTAL_NEURO_CHANGE'])

/** KNEE_06A DVT concrete risk set -- Amendment A1/A4. */
const KNEE06A_CONCRETE = new Set([
  'RECENT_SURGERY_HOSPITALIZATION_OR_IMMOBILITY',
  'PRIOR_DVT_OR_PE',
  'ACTIVE_CANCER',
  'PREGNANCY_PUERPERIUM_OR_HORMONAL_CONTEXT',
])

/** KNEE_06B concrete PE-type urgent set -- §4/C2: no movement/rest AND gate. */
const KNEE06B_URGENT = new Set(['CHEST_PAIN_OR_TIGHTNESS', 'SHORTNESS_OF_BREATH', 'HEMOPTYSIS'])

/** KNEE_08 hip-fracture/referred option added by Amendment A2 (K9). */
export const KNEE08_HIP_FRACTURE_OPTION = 'NEW_HIP_GROIN_PAIN_OR_WEIGHT_BEARING_DIFFICULTY_NOT_EXPLAINED_BY_KNEE'
const KNEE08_CONCRETE = new Set([
  'NEW_SENSORY_CHANGE',
  'NEW_WEAKNESS',
  'NEW_BLADDER_BOWEL_CONTROL_CHANGE',
  KNEE08_HIP_FRACTURE_OPTION,
])

export interface KneeState {
  knee_recent_trauma_or_sudden_load?: YesNoUnknown // KNEE_01
  knee_deformity_neurovascular_screen?: string[] // KNEE_02
  knee_spontaneously_reduced_dislocation_screen?: YesNoUnknown // KNEE_02A (unconditional exposure -- K2)
  knee_post_trauma_weight_bearing_failure?: YesNoUnknown // KNEE_03 (show_when KNEE_01 in [YES,UNKNOWN])
  knee_extensor_mechanism_concern?: YesNoUnknown // KNEE_04 (show_when KNEE_01 in [YES,UNKNOWN])
  knee_true_locked_extension_block?: YesNoUnknown // KNEE_05 (unconditional)
  knee_unilateral_leg_dvt_symptom_screen?: YesNoUnknown // KNEE_06 (unconditional)
  knee_dvt_risk_context?: string[] // KNEE_06A (show_when KNEE_06 in [YES,UNKNOWN])
  knee_dvt_pe_associated_screen?: string[] // KNEE_06B (show_when KNEE_06 in [YES,UNKNOWN])
  knee_septic_joint_emergency_screen?: YesNoUnknown // KNEE_07 (unconditional)
  knee_referred_non_knee_redflag_screen?: string[] // KNEE_08 (unconditional)
  /** Core's computeFlags(r).general_red -- URGENT_REVIEW rule 1. */
  core_safety_already_urgent: boolean
}

export interface KneeComputedFields {
  knee_safety_status: KneeSafetyStatus
  expedited_referral_consider: boolean
  fracture_imaging_consider: boolean
  dvt_assessment_required: boolean
}

const arraysEqual = (a: string[] | undefined, b: string[]): boolean =>
  a !== undefined && a.length === b.length && a.every((v, i) => v === b[i])

/** KNEE_01 status. YES alone is never itself a review trigger (§3: "외상 자체만으로 URGENT_REVIEW는 아님"). */
function knee01Status(v: KneeState['knee_recent_trauma_or_sudden_load']): { review: boolean } {
  if (v === 'UNKNOWN' || v === undefined) return { review: true }
  return { review: false } // YES or NO
}

/** show_when KNEE_01 in [YES, UNKNOWN] for KNEE_03/KNEE_04. Missing KNEE_01 is not-shown (its own knee01Status already fails closed). */
function knee01Shown(v: KneeState['knee_recent_trauma_or_sudden_load']): boolean {
  return v === 'YES' || v === 'UNKNOWN'
}

/**
 * KNEE_02 status. Concrete-urgent-set check runs before any NONE-array
 * validity check (same ordering as shoulderLogic.ts's sh02Status) -- a
 * genuine positive finding is never cancelled out by a contradictory NONE
 * in the same malformed array.
 */
function knee02Status(v: string[] | undefined): { urgent: boolean; review: boolean } {
  if (v === undefined || !Array.isArray(v) || v.length === 0) return { urgent: false, review: true }
  if (v.some((x) => KNEE02_URGENT.has(x))) return { urgent: true, review: true }
  if (v.includes('UNKNOWN')) return { urgent: false, review: true }
  if (arraysEqual(v, ['NONE'])) return { urgent: false, review: false }
  return { urgent: false, review: true } // malformed
}

/** KNEE_02A status -- K2: unconditional exposure, YES -> URGENT regardless of KNEE_01. */
function knee02aStatus(v: KneeState['knee_spontaneously_reduced_dislocation_screen']): {
  urgent: boolean
  review: boolean
} {
  if (v === 'YES') return { urgent: true, review: true }
  if (v === 'UNKNOWN' || v === undefined) return { urgent: false, review: true }
  return { urgent: false, review: false } // 'NO'
}

/** KNEE_03 status (show_when KNEE_01 in [YES,UNKNOWN]). YES -> REVIEW + fracture_imaging_consider trigger. */
function knee03Status(
  v: KneeState['knee_post_trauma_weight_bearing_failure'],
  shown: boolean,
): { review: boolean } {
  if (!shown) return { review: false }
  if (v === 'YES' || v === 'UNKNOWN' || v === undefined) return { review: true }
  return { review: false } // 'NO'
}

/**
 * KNEE_04 status (show_when KNEE_01 in [YES,UNKNOWN]). §11/A4: never
 * auto-escalates to URGENT. `expedited` is deliberately NOT set on plain
 * missing (undefined) -- only explicit YES/UNKNOWN answers set the flag
 * (§3 expedited_referral_consider note: "missing은 safety REVIEW를 만들지만
 * expedited flag를 임의로 true로 만들지 않는다").
 */
function knee04Status(
  v: KneeState['knee_extensor_mechanism_concern'],
  shown: boolean,
): { review: boolean; expedited: boolean } {
  if (!shown) return { review: false, expedited: false }
  if (v === 'YES' || v === 'UNKNOWN') return { review: true, expedited: true }
  if (v === undefined) return { review: true, expedited: false }
  return { review: false, expedited: false } // 'NO'
}

/** KNEE_05 status (unconditional). Same missing/expedited split as knee04Status. */
function knee05Status(v: KneeState['knee_true_locked_extension_block']): { review: boolean; expedited: boolean } {
  if (v === 'YES' || v === 'UNKNOWN') return { review: true, expedited: true }
  if (v === undefined) return { review: true, expedited: false }
  return { review: false, expedited: false } // 'NO'
}

/** show_when KNEE_06 in [YES, UNKNOWN] for KNEE_06A/KNEE_06B. */
function knee06Shown(v: KneeState['knee_unilateral_leg_dvt_symptom_screen']): boolean {
  return v === 'YES' || v === 'UNKNOWN'
}

type MultiOutcome = 'CONCRETE' | 'NONE' | 'UNKNOWN' | 'INVALID'

function classifyKnee06a(v: string[] | undefined): MultiOutcome {
  if (v === undefined || !Array.isArray(v) || v.length === 0) return 'INVALID'
  if (v.some((x) => KNEE06A_CONCRETE.has(x))) return 'CONCRETE'
  if (v.includes('UNKNOWN')) return 'UNKNOWN'
  if (arraysEqual(v, ['NONE'])) return 'NONE'
  return 'INVALID' // malformed
}

/**
 * KNEE_06/KNEE_06A combined-condition DVT calibration -- Amendment A1, the
 * single most safety-critical calibration in this file. The one and only
 * negative carve-out (KNEE_06 YES + KNEE_06A exact [NONE]) does NOT
 * independently create REVIEW_REQUIRED or dvt_assessment_required -- this is
 * a deliberate de-escalation from the original v0.1 draft's "KNEE_06 YES
 * alone -> REVIEW" rule, closed by Opus v0.2/final verification. Every other
 * combination (KNEE_06A concrete risk, UNKNOWN, or invalid/missing; or
 * KNEE_06 itself UNKNOWN/invalid/missing) fails closed to REVIEW_REQUIRED +
 * dvt_assessment_required=true.
 */
function knee06Contribution(
  v06: KneeState['knee_unilateral_leg_dvt_symptom_screen'],
  v06a: string[] | undefined,
): { review: boolean; dvtFlag: boolean } {
  if (v06 === undefined || v06 === 'UNKNOWN') {
    return { review: true, dvtFlag: true }
  }
  if (v06 === 'YES') {
    const outcome = classifyKnee06a(v06a)
    if (outcome === 'NONE') return { review: false, dvtFlag: false } // the critical negative regression
    return { review: true, dvtFlag: true } // CONCRETE / UNKNOWN / INVALID(missing/malformed)
  }
  return { review: false, dvtFlag: false } // 'NO'
}

/**
 * KNEE_06B status (show_when KNEE_06 in [YES,UNKNOWN]). C2: single-condition
 * gate only -- no movement-independent/rest-only AND qualifier (SHOULDER
 * SH05's F2 mistake is explicitly not repeated here).
 */
function knee06bStatus(v: string[] | undefined, shown: boolean): { urgent: boolean; review: boolean } {
  if (!shown) return { urgent: false, review: false }
  if (v === undefined || !Array.isArray(v) || v.length === 0) return { urgent: false, review: true }
  if (v.some((x) => KNEE06B_URGENT.has(x))) return { urgent: true, review: true }
  if (v.includes('UNKNOWN')) return { urgent: false, review: true }
  if (arraysEqual(v, ['NONE'])) return { urgent: false, review: false }
  return { urgent: false, review: true } // malformed
}

/** KNEE_07 status (unconditional). YES -> URGENT (K1: same tier as SHOULDER SH04). */
function knee07Status(v: KneeState['knee_septic_joint_emergency_screen']): { urgent: boolean; review: boolean } {
  if (v === 'YES') return { urgent: true, review: true }
  if (v === 'UNKNOWN' || v === undefined) return { urgent: false, review: true }
  return { urgent: false, review: false } // 'NO'
}

/**
 * KNEE_08 status (unconditional). All 4 concrete options are REVIEW_REQUIRED
 * only (never urgent) -- the hip/groin/weight-bearing option (K9/Amendment
 * A2) additionally sets the fracture_imaging_consider flag, reusing that
 * existing flag rather than inventing a new tier (per A2/A6 verification).
 */
function knee08Status(v: string[] | undefined): { review: boolean; fractureFlag: boolean } {
  if (v === undefined || !Array.isArray(v) || v.length === 0) return { review: true, fractureFlag: false }
  if (v.some((x) => KNEE08_CONCRETE.has(x))) {
    return { review: true, fractureFlag: v.includes(KNEE08_HIP_FRACTURE_OPTION) }
  }
  if (v.includes('UNKNOWN')) return { review: true, fractureFlag: false }
  if (arraysEqual(v, ['NONE'])) return { review: false, fractureFlag: false }
  return { review: true, fractureFlag: false } // malformed
}

/**
 * Port of the Knee Safety Engine (v0.1 §11, replaced per Amendment A4).
 * URGENT_REVIEW rule 1 (`core_safety_already_urgent`) makes any upstream
 * Core global red-flag interrupt (SAFETY_01 etc.) unconditionally urgent
 * here too, independent of whether any KNEE_* field was ever shown/answered
 * -- same passthrough principle as shoulderLogic.ts/neckLogic.ts.
 */
function kneeSafetyStatus(s: KneeState): KneeSafetyStatus {
  const k01 = knee01Status(s.knee_recent_trauma_or_sudden_load)
  const k01Shown = knee01Shown(s.knee_recent_trauma_or_sudden_load)
  const k02 = knee02Status(s.knee_deformity_neurovascular_screen)
  const k02a = knee02aStatus(s.knee_spontaneously_reduced_dislocation_screen)
  const k03 = knee03Status(s.knee_post_trauma_weight_bearing_failure, k01Shown)
  const k04 = knee04Status(s.knee_extensor_mechanism_concern, k01Shown)
  const k05 = knee05Status(s.knee_true_locked_extension_block)
  const k06Shown = knee06Shown(s.knee_unilateral_leg_dvt_symptom_screen)
  const k06 = knee06Contribution(s.knee_unilateral_leg_dvt_symptom_screen, s.knee_dvt_risk_context)
  const k06b = knee06bStatus(s.knee_dvt_pe_associated_screen, k06Shown)
  const k07 = knee07Status(s.knee_septic_joint_emergency_screen)
  const k08 = knee08Status(s.knee_referred_non_knee_redflag_screen)

  const urgent =
    s.core_safety_already_urgent === true || k02.urgent || k02a.urgent || k06b.urgent || k07.urgent

  if (urgent) return 'URGENT_REVIEW'

  const review =
    k01.review ||
    k02.review ||
    k02a.review ||
    k03.review ||
    k04.review ||
    k05.review ||
    k06.review ||
    k06b.review ||
    k07.review ||
    k08.review

  return review ? 'REVIEW_REQUIRED' : 'CLEAR'
}

/** Port of the expedited_referral_consider flag. NOT a 4th safety status -- always computed alongside knee_safety_status. */
function expeditedReferralConsider(s: KneeState): boolean {
  const k01Shown = knee01Shown(s.knee_recent_trauma_or_sudden_load)
  const k04 = knee04Status(s.knee_extensor_mechanism_concern, k01Shown)
  const k05 = knee05Status(s.knee_true_locked_extension_block)
  return k04.expedited || k05.expedited
}

/** Port of the fracture_imaging_consider flag. KNEE_03 YES, or KNEE_08's hip/groin option (K9/A2) -- reuses this same flag, no new tier. */
function fractureImagingConsider(s: KneeState): boolean {
  const isKnee03Yes = s.knee_post_trauma_weight_bearing_failure === 'YES'
  const k08 = knee08Status(s.knee_referred_non_knee_redflag_screen)
  return isKnee03Yes || k08.fractureFlag
}

/**
 * `knee_safety_status !== 'CLEAR'` -- §13: locks both routine exercise
 * recommendation and routine manual-treatment suggestion. No separate
 * manipulation-risk lock domain is defined for KNEE_V1 (CLOSED spec has
 * none), so a single lock function is correct here, matching
 * shoulderSafetyLocked's precedent.
 */
export const kneeSafetyLocked = (f: KneeComputedFields): boolean => f.knee_safety_status !== 'CLEAR'

/** Port of the full KNEE_V1 computed-fields set. Always computed whenever KNEE_V1 is active for a patient (IS_PRIMARY_KNEE). */
export function computeKneeFlags(state: KneeState): KneeComputedFields {
  return {
    knee_safety_status: kneeSafetyStatus(state),
    expedited_referral_consider: expeditedReferralConsider(state),
    fracture_imaging_consider: fractureImagingConsider(state),
    dvt_assessment_required: knee06Contribution(
      state.knee_unilateral_leg_dvt_symptom_screen,
      state.knee_dvt_risk_context,
    ).dvtFlag,
  }
}
