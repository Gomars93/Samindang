/**
 * WRIST_HAND_V1 safety-state logic.
 *
 * Two layers, same convention as elbowLogic.ts's top comment. Ground truth
 * here is `WRIST_HAND_V1_Tablet_Question_Set_v0.1.md` §5-6 (Safety Engine,
 * Flags) plus the `WRIST_HAND_V1_Tablet_Question_Set_v0.1.1.md` delta
 * (§6 infection_assessment_required WH_07A `/empty` fix) -- CLINICAL
 * DECISIONS CLOSED (Opus v0.1 review -> Tablet v0.1 -> Opus v0.2 review
 * [1 mechanical fix] -> Tablet v0.1.1 delta -> Opus final verification
 * PASS). This file is a literal port; no threshold here was invented at
 * the integration stage (`WRIST_HAND_V1_Fable_Integration_Plan_v0.1.md`
 * §17 literal invariants).
 *
 * Like kneeLogic.ts/elbowLogic.ts, WRIST_HAND_V1 does NOT reuse another
 * module's canonical safety engine -- the CLOSED Tablet doc's §3 (WH_13)
 * states explicitly that NECK_QUESTIONS is not reused (no shared
 * population), and Fable plan §3.2/§6 requires this file not to import
 * any other module's logic/adapter.
 *
 * F1-style invariant: `ELBOW_00` (arm_hand_region_discriminator) is
 * routing/tagging only and never appears in `WristHandState` or anywhere
 * in this file's computation -- see wristHandAdapter.ts's top comment and
 * coreSpec.ts's `IS_PRIMARY_WRIST_HAND_SAFETY`.
 *
 * Second, WRIST_HAND-specific invariant: `WH_04A` (prior X-ray context) is
 * likewise never in `WristHandState` -- it is pure non-gating context
 * (Tablet §3/Fable plan §9), enforced here at the type level so no
 * escalation logic can accidentally reference it.
 *
 * MISSING contract: identical to lbpLogic.ts/neckLogic.ts/shoulderLogic.ts/
 * kneeLogic.ts/elbowLogic.ts -- unanswered fields are `undefined`, never
 * `null`.
 */

// ---------------------------------------------------------------------------
// Layer 1: literal port of WRIST_HAND_V1_Tablet_Question_Set_v0.1.md §3-6
// plus the v0.1.1 delta (§6 infection_assessment_required WH_07A /empty)
// ---------------------------------------------------------------------------

export type WristHandSafetyStatus = 'CLEAR' | 'REVIEW_REQUIRED' | 'URGENT_REVIEW'
type YesNoUnknown = 'YES' | 'NO' | 'UNKNOWN'
type WristHandInfectionScreen = 'NONE' | 'LOCALIZED_STABLE' | 'FINGER_LOCALIZED_SWOLLEN_PAINFUL' | 'SYSTEMIC_OR_RAPIDLY_SPREADING' | 'UNKNOWN'
type WristHandSensoryPattern = 'MEDIAN_DISTRIBUTION' | 'ULNAR_DISTRIBUTION' | 'MULTIPLE_OR_BOTH' | 'NONE' | 'UNKNOWN'

/** WH_02 concrete urgent set -- §3/§5.1: unconditional URGENT_REVIEW, each a standalone OR trigger. */
const WH02_URGENT = new Set([
  'GROSS_DEFORMITY_OR_STILL_OUT',
  'COLD_PALE_BLUE_DIGITS',
  'MAJOR_NEW_DISTAL_NEURO_CHANGE',
  'UNCONTROLLED_HEAVY_BLEEDING',
  'SEVERE_OPEN_WOUND_WITH_DEEP_EXPOSURE',
])

/** WH_07A concrete urgent set -- §5.1 item 4: independent of WH_07's value. */
const WH07A_URGENT = new Set(['SEVERE_PAIN_WHEN_STRAIGHTENING', 'TENDS_TO_STAY_FLEXED', 'DIFFUSE_FUSIFORM_SWELLING'])

/** WH_08A concrete progressive-motor set -- §3/§6. */
const WH08A_CONCRETE = new Set(['NEW_OR_WORSENING_GRIP_PINCH_WEAKNESS', 'DROPPING_OBJECTS', 'VISIBLE_THENAR_OR_INTRINSIC_WASTING'])

/**
 * WristHandState intentionally excludes:
 * - `ELBOW_00`/arm_hand_region_discriminator (routing/tagging only, F1-style)
 * - `WH_04A` (prior X-ray context, non-gating, Fable plan §9)
 * - `WH_09`-`WH_14` (optional phenotype, never safety-relevant)
 * so none of them can be referenced by the computation below even by
 * accident -- non-gating is enforced at the type level, not just by
 * convention.
 */
export interface WristHandState {
  wrist_hand_recent_trauma?: YesNoUnknown // WH_01
  wrist_hand_deformity_neurovascular_open_injury_screen?: string[] // WH_02
  wrist_hand_post_trauma_major_function_loss?: YesNoUnknown // WH_03 (show_when WH_01 in [YES,UNKNOWN])
  wrist_hand_post_trauma_radial_thumb_base_pain?: YesNoUnknown // WH_04 (show_when WH_01 in [YES,UNKNOWN])
  wrist_hand_post_trauma_fixed_motion_block?: YesNoUnknown // WH_05 (show_when WH_01 in [YES,UNKNOWN])
  wrist_hand_wound_exposure?: string[] // WH_06
  wrist_hand_post_wound_active_motion_loss?: YesNoUnknown // WH_06A (show_when WH_06 wound/bite/UNKNOWN)
  wrist_hand_infection_broad_screen?: WristHandInfectionScreen // WH_07
  wrist_hand_flexor_sheath_followup?: string[] // WH_07A (conditional show_when, see IS_WH_07A_SHOWN in coreSpec.ts)
  wrist_hand_distal_sensory_pattern?: WristHandSensoryPattern // WH_08
  wrist_hand_motor_progression_screen?: string[] // WH_08A (show_when WH_08 != NONE)
  /** Core's computeFlags(r).general_red -- URGENT_REVIEW rule 1. */
  core_safety_already_urgent: boolean
}

export interface WristHandComputedFields {
  wrist_hand_safety_status: WristHandSafetyStatus
  fracture_imaging_consider: boolean
  tendon_injury_assessment_required: boolean
  infection_assessment_required: boolean
  neuro_assessment_required: boolean
  expedited_referral_consider: boolean
}

const arraysEqual = (a: string[] | undefined, b: string[]): boolean =>
  a !== undefined && a.length === b.length && a.every((v, i) => v === b[i])

/** WH_01 status. YES alone is never itself a review trigger (§3: 후속 문항이 실제 위험을 판단한다). */
function wh01Status(v: WristHandState['wrist_hand_recent_trauma']): { review: boolean } {
  if (v === 'UNKNOWN' || v === undefined) return { review: true }
  return { review: false } // YES or NO
}

/** show_when WH_01 in [YES, UNKNOWN] for WH_03/04/05. Missing WH_01 is not-shown (its own wh01Status already fails closed). */
function wh01Shown(v: WristHandState['wrist_hand_recent_trauma']): boolean {
  return v === 'YES' || v === 'UNKNOWN'
}

/**
 * WH_02 status. Concrete-urgent-set check runs before any NONE-array
 * validity check (same ordering as elbowLogic.ts's elbow02Status) -- a
 * genuine positive finding (including standalone bleeding/open-wound) is
 * never cancelled out by a contradictory NONE in the same malformed array.
 */
function wh02Status(v: string[] | undefined): { urgent: boolean; review: boolean } {
  if (v === undefined || !Array.isArray(v) || v.length === 0) return { urgent: false, review: true }
  if (v.some((x) => WH02_URGENT.has(x))) return { urgent: true, review: true }
  if (v.includes('UNKNOWN')) return { urgent: false, review: true }
  if (arraysEqual(v, ['NONE'])) return { urgent: false, review: false }
  return { urgent: false, review: true } // malformed
}

/** WH_03 status (show_when WH_01 in [YES,UNKNOWN]). YES -> REVIEW + fracture_imaging_consider trigger. */
function wh03Status(v: WristHandState['wrist_hand_post_trauma_major_function_loss'], shown: boolean): { review: boolean } {
  if (!shown) return { review: false }
  if (v === 'YES' || v === 'UNKNOWN' || v === undefined) return { review: true }
  return { review: false } // 'NO'
}

/** WH_04 status (show_when WH_01 in [YES,UNKNOWN]). §3/W3: never auto-escalates to URGENT. */
function wh04Status(v: WristHandState['wrist_hand_post_trauma_radial_thumb_base_pain'], shown: boolean): { review: boolean } {
  if (!shown) return { review: false }
  if (v === 'YES' || v === 'UNKNOWN' || v === undefined) return { review: true }
  return { review: false } // 'NO'
}

/** WH_05 status (show_when WH_01 in [YES,UNKNOWN]). §3/W7: YES -> REVIEW only, never blanket expedited. */
function wh05Status(v: WristHandState['wrist_hand_post_trauma_fixed_motion_block'], shown: boolean): { review: boolean } {
  if (!shown) return { review: false }
  if (v === 'YES' || v === 'UNKNOWN' || v === undefined) return { review: true }
  return { review: false } // 'NO'
}

/**
 * WH_06 status (unconditional). `HUMAN_OR_ANIMAL_BITE` is a standalone
 * REVIEW trigger independent of any infection sign in WH_07 (§3/W5 bite --
 * checked here, not combined with WH_07's value anywhere in this file).
 * The bite check runs first, before any NONE-array validity check (same
 * ordering principle as wh02Status/elbowLogic.ts's elbow02Status) so a
 * genuine bite is never cancelled out by a contradictory NONE in the same
 * malformed array. `CUT_OR_PENETRATING_WOUND` alone is a valid, non-
 * escalating exposure-only answer (§3: context for WH_06A/WH_07A only).
 */
function wh06Status(v: string[] | undefined): { bite: boolean; review: boolean } {
  if (v === undefined || !Array.isArray(v) || v.length === 0) return { bite: false, review: true }
  if (v.includes('HUMAN_OR_ANIMAL_BITE')) return { bite: true, review: true }
  if (v.includes('UNKNOWN')) return { bite: false, review: true }
  if (arraysEqual(v, ['NONE'])) return { bite: false, review: false }
  if (arraysEqual(v, ['CUT_OR_PENETRATING_WOUND'])) return { bite: false, review: false }
  return { bite: false, review: true } // malformed
}

/** WH_06A status (conditional). YES -> REVIEW + expedited + tendon flag (computed in the flag functions below). */
function wh06aStatus(v: WristHandState['wrist_hand_post_wound_active_motion_loss'], shown: boolean): { review: boolean } {
  if (!shown) return { review: false }
  if (v === 'YES' || v === 'UNKNOWN' || v === undefined) return { review: true }
  return { review: false } // 'NO'
}

/**
 * WH_07 status (unconditional, single_choice). `SYSTEMIC_OR_RAPIDLY_
 * SPREADING` is a single enum value that already combines "systemic
 * illness OR rapidly spreading redness/swelling" (Opus-verified fail-safe
 * OR, not an AND gate) -- compared as one value here, never decomposed
 * into two separately-ANDed conditions.
 */
function wh07Status(v: WristHandState['wrist_hand_infection_broad_screen']): { urgent: boolean; review: boolean } {
  if (v === 'SYSTEMIC_OR_RAPIDLY_SPREADING') return { urgent: true, review: true }
  if (v === 'LOCALIZED_STABLE' || v === 'FINGER_LOCALIZED_SWOLLEN_PAINFUL') return { urgent: false, review: true }
  if (v === 'UNKNOWN' || v === undefined) return { urgent: false, review: true }
  return { urgent: false, review: false } // 'NONE'
}

type MultiOutcome = 'CONCRETE' | 'NONE' | 'UNKNOWN' | 'INVALID'

function classifyWh07a(v: string[] | undefined): MultiOutcome {
  if (v === undefined || !Array.isArray(v) || v.length === 0) return 'INVALID'
  if (v.some((x) => WH07A_URGENT.has(x))) return 'CONCRETE'
  if (v.includes('UNKNOWN')) return 'UNKNOWN'
  if (arraysEqual(v, ['NONE'])) return 'NONE'
  return 'INVALID' // malformed / empty
}

/**
 * WH_07A status (conditional, §10/W8). Deliberately takes only `v` and
 * `shown` as arguments -- NOT `WH_07`'s value -- so it is structurally
 * impossible for this function to become AND-gated on WH_07 (Fable plan
 * §10/§17 invariant 6). Concrete positive is an independent URGENT source
 * regardless of what WH_07 was answered (including WH_07 === 'NONE').
 *
 * v0.1.1 authoritative delta: UNKNOWN/missing/malformed/**empty** all fail
 * closed to REVIEW here identically (classifyWh07a's INVALID branch covers
 * both empty array and malformed array) -- the empty case is not treated
 * as NONE/negative.
 */
function wh07aStatus(v: string[] | undefined, shown: boolean): { urgent: boolean; review: boolean; contributesInfection: boolean } {
  if (!shown) return { urgent: false, review: false, contributesInfection: false }
  const outcome = classifyWh07a(v)
  if (outcome === 'CONCRETE') return { urgent: true, review: true, contributesInfection: true }
  if (outcome === 'NONE') return { urgent: false, review: false, contributesInfection: false }
  return { urgent: false, review: true, contributesInfection: true } // UNKNOWN or INVALID(missing/malformed/empty)
}

/**
 * WH_08/WH_08A combined-condition -- §3/§6, the single most safety-critical
 * calibration in this file (mirrors elbowLogic.ts's ELBOW_09/09A
 * calibration, kneeLogic.ts's K5 DVT calibration). The one negative
 * carve-out (WH_08 concrete sensory-positive + WH_08A exact [NONE], i.e.
 * stable sensory-only) does NOT independently create REVIEW_REQUIRED --
 * deliberate de-escalation, CLOSED by Opus v0.1/v0.2/final verification.
 * Every other combination (WH_08A concrete positive, UNKNOWN, or
 * invalid/missing/empty; or WH_08 itself UNKNOWN/missing) fails closed to
 * REVIEW_REQUIRED.
 *
 * `neuro` and `expedited` are returned together from one function so they
 * cannot drift apart (same lesson as ELBOW_V1's v0.1.1 fix for
 * elbow09Contribution -- applied here from the start).
 */
function wh08aContribution(
  v08: WristHandState['wrist_hand_distal_sensory_pattern'],
  v08a: string[] | undefined,
): { review: boolean; neuro: boolean; expedited: boolean } {
  if (v08 === undefined || v08 === 'UNKNOWN') {
    return { review: true, neuro: false, expedited: false }
  }
  if (v08 === 'NONE') {
    return { review: false, neuro: false, expedited: false }
  }
  // v08 is a concrete sensory-positive pattern (MEDIAN_DISTRIBUTION/ULNAR_DISTRIBUTION/MULTIPLE_OR_BOTH)
  const outcome = classifyWh08a(v08a)
  if (outcome === 'NONE') return { review: false, neuro: false, expedited: false } // stable sensory-only de-escalation
  return { review: true, neuro: true, expedited: true } // CONCRETE / UNKNOWN / INVALID(missing/malformed/empty)
}

function classifyWh08a(v: string[] | undefined): MultiOutcome {
  if (v === undefined || !Array.isArray(v) || v.length === 0) return 'INVALID'
  if (v.some((x) => WH08A_CONCRETE.has(x))) return 'CONCRETE'
  if (v.includes('UNKNOWN')) return 'UNKNOWN'
  if (arraysEqual(v, ['NONE'])) return 'NONE'
  return 'INVALID' // malformed / empty
}

/** WH_08's own fail-closed clause (independent of WH_08A): UNKNOWN/missing -> min REVIEW. */
function wh08OwnStatus(v: WristHandState['wrist_hand_distal_sensory_pattern']): { review: boolean } {
  if (v === 'UNKNOWN' || v === undefined) return { review: true }
  return { review: false } // NONE or a concrete pattern
}

/**
 * Port of the WRIST_HAND Safety Engine (Tablet v0.1 §5.1-5.3 + v0.1.1
 * delta). URGENT_REVIEW rule 1 (`core_safety_already_urgent`) makes any
 * upstream Core global red-flag interrupt unconditionally urgent here too
 * -- same passthrough principle as elbowLogic.ts/kneeLogic.ts/
 * shoulderLogic.ts/neckLogic.ts.
 */
function wristHandSafetyStatus(s: WristHandState): WristHandSafetyStatus {
  const e01 = wh01Status(s.wrist_hand_recent_trauma)
  const e01Shown = wh01Shown(s.wrist_hand_recent_trauma)
  const e02 = wh02Status(s.wrist_hand_deformity_neurovascular_open_injury_screen)
  const e03 = wh03Status(s.wrist_hand_post_trauma_major_function_loss, e01Shown)
  const e04 = wh04Status(s.wrist_hand_post_trauma_radial_thumb_base_pain, e01Shown)
  const e05 = wh05Status(s.wrist_hand_post_trauma_fixed_motion_block, e01Shown)
  const e06 = wh06Status(s.wrist_hand_wound_exposure)
  const e06aShown = isWh06WoundShown(s.wrist_hand_wound_exposure)
  const e06a = wh06aStatus(s.wrist_hand_post_wound_active_motion_loss, e06aShown)
  const e07 = wh07Status(s.wrist_hand_infection_broad_screen)
  const e07aShown = isWh07aShown(s.wrist_hand_wound_exposure, s.wrist_hand_infection_broad_screen)
  const e07a = wh07aStatus(s.wrist_hand_flexor_sheath_followup, e07aShown)
  const e08Own = wh08OwnStatus(s.wrist_hand_distal_sensory_pattern)
  const e08a = wh08aContribution(s.wrist_hand_distal_sensory_pattern, s.wrist_hand_motor_progression_screen)

  const urgent = s.core_safety_already_urgent === true || e02.urgent || e07.urgent || e07a.urgent

  if (urgent) return 'URGENT_REVIEW'

  const review =
    e01.review ||
    e02.review ||
    e03.review ||
    e04.review ||
    e05.review ||
    e06.review ||
    e06a.review ||
    e07.review ||
    e07a.review ||
    e08Own.review ||
    e08a.review

  return review ? 'REVIEW_REQUIRED' : 'CLEAR'
}

/**
 * WH_06A show_when: WH_06 contains CUT_OR_PENETRATING_WOUND, HUMAN_OR_
 * ANIMAL_BITE, or UNKNOWN (Tablet §3). Exported so coreSpec.ts's showIf
 * and this file's own computation share one definition and cannot drift.
 */
export function isWh06WoundShown(v: string[] | undefined): boolean {
  return Array.isArray(v) && (v.includes('CUT_OR_PENETRATING_WOUND') || v.includes('HUMAN_OR_ANIMAL_BITE') || v.includes('UNKNOWN'))
}

/**
 * WH_07A show_when: WH_06 wound/bite/UNKNOWN route, OR WH_07 in
 * [FINGER_LOCALIZED_SWOLLEN_PAINFUL, UNKNOWN] (Tablet §3). Exported for the
 * same reason as isWh06WoundShown. `v07` is typed as plain `string |
 * undefined` (not `WristHandState`'s narrower field type) so coreSpec.ts's
 * `showIf` can call this directly against a raw `Responses` value without
 * re-validating the enum first.
 */
export function isWh07aShown(v06: string[] | undefined, v07: string | undefined): boolean {
  return isWh06WoundShown(v06) || v07 === 'FINGER_LOCALIZED_SWOLLEN_PAINFUL' || v07 === 'UNKNOWN'
}

/** Port of the fracture_imaging_consider flag. WH_03 or WH_04 concrete YES only -- UNKNOWN/missing never sets it. */
function fractureImagingConsider(s: WristHandState): boolean {
  return s.wrist_hand_post_trauma_major_function_loss === 'YES' || s.wrist_hand_post_trauma_radial_thumb_base_pain === 'YES'
}

/** Port of the tendon_injury_assessment_required flag. WH_06A YES only. */
function tendonInjuryAssessmentRequired(s: WristHandState): boolean {
  return s.wrist_hand_post_wound_active_motion_loss === 'YES'
}

/**
 * Port of the infection_assessment_required flag (§6 + v0.1.1 authoritative
 * delta). WH_07A's contribution comes from the same `wh07aStatus` computed
 * in wristHandSafetyStatus's shape -- recomputed here via the shared helper
 * so the /empty inclusion cannot drift from the tier-level rule.
 */
function infectionAssessmentRequired(s: WristHandState): boolean {
  const e06 = wh06Status(s.wrist_hand_wound_exposure)
  const v07 = s.wrist_hand_infection_broad_screen
  const broadGateConcern =
    v07 === 'LOCALIZED_STABLE' ||
    v07 === 'FINGER_LOCALIZED_SWOLLEN_PAINFUL' ||
    v07 === 'SYSTEMIC_OR_RAPIDLY_SPREADING' ||
    v07 === 'UNKNOWN' ||
    v07 === undefined
  const e07aShown = isWh07aShown(s.wrist_hand_wound_exposure, v07)
  const e07a = wh07aStatus(s.wrist_hand_flexor_sheath_followup, e07aShown)
  return e06.bite || broadGateConcern || e07a.contributesInfection
}

/** Port of the neuro_assessment_required flag. Shares wh08aContribution with expedited_referral_consider so they can never drift apart. */
function neuroAssessmentRequired(s: WristHandState): boolean {
  return wh08aContribution(s.wrist_hand_distal_sensory_pattern, s.wrist_hand_motor_progression_screen).neuro
}

/**
 * Port of the expedited_referral_consider flag. WH_06A YES, or the shared
 * WH_08/08A escalation contribution -- WH_05 YES (fixed motion block) is
 * deliberately absent from this OR-set (no blanket expedited rule, §5/W7).
 */
function expeditedReferralConsider(s: WristHandState): boolean {
  const e08a = wh08aContribution(s.wrist_hand_distal_sensory_pattern, s.wrist_hand_motor_progression_screen)
  return s.wrist_hand_post_wound_active_motion_loss === 'YES' || e08a.expedited
}

/**
 * `wrist_hand_safety_status !== 'CLEAR'` -- locks both routine exercise
 * recommendation and routine manual-treatment suggestion. No separate
 * manipulation-risk lock domain is defined for WRIST_HAND_V1 (CLOSED spec
 * has none), matching elbowSafetyLocked's/kneeSafetyLocked's precedent.
 */
export const wristHandSafetyLocked = (f: WristHandComputedFields): boolean => f.wrist_hand_safety_status !== 'CLEAR'

/** Port of the full WRIST_HAND_V1 computed-fields set. Always computed whenever WRIST_HAND_V1 is active for a patient (IS_PRIMARY_WRIST_HAND_SAFETY). */
export function computeWristHandFlags(state: WristHandState): WristHandComputedFields {
  return {
    wrist_hand_safety_status: wristHandSafetyStatus(state),
    fracture_imaging_consider: fractureImagingConsider(state),
    tendon_injury_assessment_required: tendonInjuryAssessmentRequired(state),
    infection_assessment_required: infectionAssessmentRequired(state),
    neuro_assessment_required: neuroAssessmentRequired(state),
    expedited_referral_consider: expeditedReferralConsider(state),
  }
}
