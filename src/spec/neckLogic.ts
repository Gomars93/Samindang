/**
 * NECK_V1 safety-state logic.
 *
 * Two layers, kept deliberately separate — same reasoning as lbpLogic.ts's
 * top comment, ported to a module that (unlike LBP) has no Python reference
 * implementation. The "literal port" ground truth here is
 * `NECK_V1_Tablet_Question_Set_v0.2.1_CLOSED.md` §5–§7 (Disease Safety
 * Engine, Treatment Safety, Intervention Locks) — a clinically CLOSED
 * document (Opus review PASS + erratum E1/E2 applied). Treat its rules as
 * ground truth, not something to "improve" while porting.
 *
 * 1. `NeckState` + the pure functions below are a field-for-field port of
 *    v0.2.1 §5–§7's prose rules. Field names mirror the spec's `id`s
 *    (n02 -> neck_cord_concern_screen, etc.) so a reviewer can check this
 *    against the markdown directly.
 * 2. `toNeckState` (neckAdapter.ts) is the separate, independently-tested
 *    adapter translating this app's real `Responses`/`DoctorPayload` into
 *    `NeckState`.
 *
 * MISSING contract: identical to lbpLogic.ts — an unanswered/not-yet-shown
 * field is `undefined`, never `null`. Every comparison against a
 * possibly-absent field guards with `=== undefined` (or equivalent) first.
 */

// ---------------------------------------------------------------------------
// Layer 1: literal port of NECK_V1_Tablet_Question_Set_v0.2.1_CLOSED.md §5-7
// ---------------------------------------------------------------------------

export type NeckSafetyStatus = 'CLEAR' | 'REVIEW_REQUIRED' | 'URGENT_REVIEW'
export type NeckTreatmentSafetyStatus = 'CLEAR' | 'REVIEW_REQUIRED'
type YesNoUnknown = 'YES' | 'NO' | 'UNKNOWN'

/** N02 (neck_cord_concern_screen) — the two URGENT-tier concrete values. */
const N02_URGENT = new Set(['RAPIDLY_WORSENING_LIMB_WEAKNESS', 'NEW_BLADDER_BOWEL_CHANGE'])
/** N02 — the three REVIEW-tier (non-urgent) concrete values. */
const N02_OTHER_CONCRETE = new Set(['HAND_CLUMSINESS', 'GAIT_BALANCE_CHANGE', 'BILATERAL_OR_MULTI_LIMB_NEURO'])

/** N04 (neck_vascular_associated_screen) hard-neuro tier — §5: unconditional URGENT. */
const N04_HARD = new Set([
  'NEW_VISUAL_DISTURBANCE',
  'NEW_SPEECH_OR_SWALLOWING_DIFFICULTY',
  'NEW_FACE_OR_EYELID_CHANGE',
  'NEW_ONE_SIDED_WEAKNESS_OR_NUMBNESS',
])
/** N04 soft tier — §5: URGENT only combined with a non-valid-negative N03A (E2). */
const N04_SOFT = new Set(['NEW_SEVERE_BALANCE_OR_COORDINATION_CHANGE', 'NEW_SEVERE_DIZZINESS_OR_FAINTNESS'])

/** N05 (neck_systemic_redflag_screen) concrete positive values. */
const N05_CONCRETE = new Set([
  'PRIOR_CANCER',
  'FEVER_OR_RECENT_SERIOUS_INFECTION',
  'IMMUNOSUPPRESSION',
  'RECENT_CERVICAL_PROCEDURE_OR_SURGERY',
  'UNEXPLAINED_WEIGHT_LOSS',
])

/** N09 (neck_arm_neuro_symptoms) concrete positive values. */
const N09_CONCRETE = new Set(['PARESTHESIA', 'NUMBNESS', 'SUBJECTIVE_WEAKNESS'])

/**
 * §6 treatment-safety pregnancy domain review values — mirrors
 * lbpLogic.ts's TREATMENT_SAFETY_PREGNANCY_VALUES exactly (same underlying
 * clinical rule, independently ported per-module rather than shared, same
 * convention as the rest of this codebase's module boundaries).
 */
const TREATMENT_SAFETY_PREGNANCY_VALUES = new Set(['YES', 'POSSIBLE', 'UNKNOWN'])

/** §6 major_history_categories values that force treatment-safety review. */
const TREATMENT_SAFETY_HISTORY_VALUES = new Set(['OSTEOPOROSIS', 'BLEEDING_DISORDER'])

/**
 * §13/D9: major_history_categories CANCER is a positive-only Core reuse for
 * N05's PRIOR_CANCER item (mirrors lbpLogic.ts's REVIEW_HISTORY_VALUES
 * pattern) — we only ever OR in a Core-confirmed positive on top of N05's
 * own answer; we never infer a negative from a generic HISTORY_01 answer.
 * N05 itself is still always asked in full to primary-NECK patients (no
 * skip-when-Core-confirms UX in v1 — same minimal-scope choice LBP_V1 made
 * for its own redflag screen).
 */
const N05_CANCER_REUSE_CATEGORY = 'CANCER'

export interface NeckState {
  neck_recent_significant_trauma?: YesNoUnknown // N01
  neck_cord_concern_screen?: string[] // N02
  neck_cord_symptom_course?: 'WORSENING' | 'STABLE' | 'IMPROVING' | 'UNKNOWN' // N02A
  neck_sudden_unusual_severe_neck_pain?: YesNoUnknown // N03A
  neck_thunderclap_headache_screen?: YesNoUnknown // N03B
  neck_vascular_associated_screen?: string[] // N04
  neck_systemic_redflag_screen?: string[] // N05
  neck_distal_extent?: 'NECK_ONLY' | 'SHOULDER_UPPER_ARM' | 'FOREARM' | 'HAND_FINGERS' | 'UNKNOWN' // N07
  neck_arm_neuro_symptoms?: string[] // N09
  neck_headache_present?: YesNoUnknown // N10
  neck_new_or_changed_headache?: YesNoUnknown // N10A
  neck_headache_neck_link?: YesNoUnknown // N11
  neck_sustained_posture_aggravation?: YesNoUnknown // N12
  onset_bucket?: 'M3_PLUS' | 'NOT_M3_PLUS' | 'UNKNOWN'
  patient_age?: number
  major_history_present?: 'YES' | 'NO'
  major_history_categories?: string[]
  medication_present?: 'YES' | 'NO' | 'UNKNOWN'
  medication_categories?: string[]
  pregnancy_status?: 'YES' | 'NO' | 'POSSIBLE' | 'UNKNOWN'
}

export type RadicularSupport = 'HIGHER_SUPPORT' | 'CONSIDER' | 'LOWER_SUPPORT' | 'UNDETERMINED'

export interface NeckComputedFields {
  neck_safety_status: NeckSafetyStatus
  neck_treatment_safety_status: NeckTreatmentSafetyStatus
  neck_neuro_baseline_required: boolean
  radicular_support: RadicularSupport
  cervicogenic_headache_pattern_consider: boolean
  movement_coordination_deficit_consider: boolean
}

const arraysEqual = (a: string[] | undefined, b: string[]): boolean =>
  a !== undefined && a.length === b.length && a.every((v, i) => v === b[i])

/**
 * N02 status. Mirrors lbpLogic.ts's cesRequiresReview shape/style: exactly
 * `['NONE']` is the only negative candidate; `['UNKNOWN']`, empty, missing,
 * or any malformed combination fails closed to review.
 */
function n02Status(cord: string[] | undefined): { urgent: boolean; review: boolean } {
  if (cord === undefined || !Array.isArray(cord) || cord.length === 0) return { urgent: false, review: true }
  if (cord.some((v) => N02_URGENT.has(v))) return { urgent: true, review: true }
  if (cord.some((v) => N02_OTHER_CONCRETE.has(v))) return { urgent: false, review: true }
  if (cord.includes('UNKNOWN')) return { urgent: false, review: true }
  if (arraysEqual(cord, ['NONE'])) return { urgent: false, review: false }
  return { urgent: false, review: true } // malformed
}

/**
 * Exported so coreSpec.ts's N02A `showIf` (N02A only shows "when N02 has
 * any concrete positive", §4) can reuse this exact classification instead
 * of a second implementation — same reasoning as lbpLogic.ts exporting
 * URGENT_CES_VALUES for its STAFF_CHECK_TRIGGERS reuse.
 */
export const hasNeckCordConcretePositive = (cord: string[] | undefined): boolean =>
  Array.isArray(cord) && cord.some((v) => N02_URGENT.has(v) || N02_OTHER_CONCRETE.has(v))

/** N02A status — only meaningful when N02 has a concrete positive (§4 show_when). */
function n02aStatus(course: NeckState['neck_cord_symptom_course']): { urgent: boolean; review: boolean } {
  if (course === 'WORSENING') return { urgent: true, review: true }
  if (course === 'STABLE' || course === 'IMPROVING' || course === 'UNKNOWN') return { urgent: false, review: true }
  return { urgent: false, review: true } // missing/malformed when N02A should have been shown
}

/** N03A "is a valid negative" predicate — §5 helper (E2). */
const n03aIsValidNegative = (v: NeckState['neck_sudden_unusual_severe_neck_pain']): boolean => v === 'NO'

/** N03A review status (own line in §5, independent of the E2 helper above). */
function n03aStatus(v: NeckState['neck_sudden_unusual_severe_neck_pain']): { review: boolean } {
  if (v === 'YES' || v === 'UNKNOWN' || v === undefined) return { review: true }
  return { review: false } // 'NO'
}

function n03bStatus(v: NeckState['neck_thunderclap_headache_screen']): { urgent: boolean; review: boolean } {
  if (v === 'YES') return { urgent: true, review: true }
  if (v === 'UNKNOWN' || v === undefined) return { urgent: false, review: true }
  return { urgent: false, review: false } // 'NO'
}

/** N04 status — hard/soft tiers, NONE/UNKNOWN validity, per §5 (E2 applied). */
function n04Status(
  v: string[] | undefined,
  n03a: NeckState['neck_sudden_unusual_severe_neck_pain'],
): { urgent: boolean; review: boolean } {
  if (v === undefined || !Array.isArray(v) || v.length === 0) return { urgent: false, review: true }
  if (v.some((x) => N04_HARD.has(x))) return { urgent: true, review: true }
  const hasSoft = v.some((x) => N04_SOFT.has(x))
  if (hasSoft) {
    // E2: URGENT unless N03A is a *valid* NO -- UNKNOWN/YES/invalid/missing
    // N03A all escalate, matching lbp-style "invalid is never more
    // permissive than UNKNOWN".
    return n03aIsValidNegative(n03a) ? { urgent: false, review: true } : { urgent: true, review: true }
  }
  if (v.includes('UNKNOWN')) return { urgent: false, review: true }
  if (arraysEqual(v, ['NONE'])) return { urgent: false, review: false }
  return { urgent: false, review: true } // malformed (e.g. NONE+positive, NONE+UNKNOWN)
}

/** N05 status, with the Core-reuse CANCER OR (D9) folded in as an extra positive source. */
function n05Status(
  v: string[] | undefined,
  historyCategories: string[] | undefined,
): { review: boolean } {
  const coreCancerPositive = Array.isArray(historyCategories) && historyCategories.includes(N05_CANCER_REUSE_CATEGORY)
  if (v === undefined || !Array.isArray(v) || v.length === 0) return { review: true }
  if (v.some((x) => N05_CONCRETE.has(x))) return { review: true }
  if (v.includes('UNKNOWN')) return { review: true }
  if (arraysEqual(v, ['NONE'])) return { review: coreCancerPositive }
  return { review: true } // malformed
}

/**
 * N10A status. E1: the caller only invokes this when N10 (neck_headache_present)
 * is YES or UNKNOWN -- i.e. exactly when N10A is `show_when`-eligible per
 * v0.2.1. When N10 === 'NO', N10A is legitimately not applicable and this
 * function is not called at all (not a "missing answer" gap).
 */
function n10aStatus(v: NeckState['neck_new_or_changed_headache']): { review: boolean } {
  if (v === 'YES' || v === 'UNKNOWN' || v === undefined) return { review: true }
  return { review: false } // 'NO'
}

/**
 * Port of v0.2.1 §5 Disease Safety Engine (E1/E2 applied). Independent of
 * treatment safety (see neckTreatmentSafetyStatus) -- never merge.
 */
function neckSafetyStatus(s: NeckState): NeckSafetyStatus {
  const n02 = n02Status(s.neck_cord_concern_screen)
  const n02a = hasNeckCordConcretePositive(s.neck_cord_concern_screen) ? n02aStatus(s.neck_cord_symptom_course) : null
  const n03a = n03aStatus(s.neck_sudden_unusual_severe_neck_pain)
  const n03b = n03bStatus(s.neck_thunderclap_headache_screen)
  const n04 = n04Status(s.neck_vascular_associated_screen, s.neck_sudden_unusual_severe_neck_pain)
  const n05 = n05Status(s.neck_systemic_redflag_screen, s.major_history_categories)
  // E1: N10A is only "required_when_shown" -- i.e. only a gap -- when N10 is
  // YES or UNKNOWN. N10 === 'NO' or missing means N10A was never applicable.
  const n10aApplicable = s.neck_headache_present === 'YES' || s.neck_headache_present === 'UNKNOWN'
  const n10a = n10aApplicable ? n10aStatus(s.neck_new_or_changed_headache) : { review: false }

  const urgent = n02.urgent || (n02a?.urgent ?? false) || n03b.urgent || n04.urgent
  if (urgent) return 'URGENT_REVIEW'

  const trauma = s.neck_recent_significant_trauma
  const traumaReview = trauma === 'YES' || trauma === 'UNKNOWN' || trauma === undefined

  const review =
    traumaReview ||
    n02.review ||
    (n02a?.review ?? false) ||
    n03a.review ||
    n03b.review ||
    n04.review ||
    n05.review ||
    n10a.review

  return review ? 'REVIEW_REQUIRED' : 'CLEAR'
}

/** Medication (anticoagulant) domain of §6 treatment safety. */
function medicationDomainReview(present: NeckState['medication_present'], categories: string[] | undefined): boolean {
  if (present === undefined || present === 'UNKNOWN') return true
  if (present === 'NO') return false
  // present === 'YES': categories is an optional field in this app (MED_TYPES
  // is not required) -- missing/empty means we cannot rule out anticoagulant
  // use, so fail closed exactly like lbpLogic.ts's major_history_present
  // 'YES' + undefined categories pattern.
  if (!Array.isArray(categories) || categories.length === 0) return true
  if (categories.includes('ANTICOAG') || categories.includes('OTHER_UNKNOWN')) return true
  return false
}

/** Osteoporosis/bleeding-disorder domain of §6 treatment safety. */
function historyDomainReview(present: NeckState['major_history_present'], categories: string[] | undefined): boolean {
  if (present === 'YES' && categories === undefined) return true // incomplete, not "no history"
  return Array.isArray(categories) && categories.some((x) => TREATMENT_SAFETY_HISTORY_VALUES.has(x))
}

/**
 * Pregnancy domain of §6 treatment safety. Deliberately re-implemented here
 * (not imported from lbpLogic.ts) rather than shared -- each module's port
 * stays self-contained and independently testable, matching how LBP_V1 and
 * this module each own a literal port rather than a shared abstraction.
 */
function pregnancyDomainReview(status: NeckState['pregnancy_status']): boolean {
  if (status !== undefined && TREATMENT_SAFETY_PREGNANCY_VALUES.has(status)) return true
  return false // 'NO' or undefined (not applicable) are both fine here -- unlike
  // lbpLogic.ts's version, this app has no separate "should this question
  // have fired" re-derivation available inside neckLogic.ts; the adapter is
  // responsible for supplying `undefined` only in the genuinely-not-applicable
  // case (see neckAdapter.ts's reuse of lbpAdapter.ts's mapPregnancyStatus).
}

/** Port of v0.2.1 §6 Treatment Safety Engine. */
function neckTreatmentSafetyStatus(s: NeckState): NeckTreatmentSafetyStatus {
  const review =
    medicationDomainReview(s.medication_present, s.medication_categories) ||
    historyDomainReview(s.major_history_present, s.major_history_categories) ||
    pregnancyDomainReview(s.pregnancy_status)
  return review ? 'REVIEW_REQUIRED' : 'CLEAR'
}

/** Port of v0.2.1 §4 N09 radicular_support rules (NB2: not a total mapping). */
function radicularSupport(s: NeckState): RadicularSupport {
  const extent = s.neck_distal_extent
  const neuro = s.neck_arm_neuro_symptoms
  if (extent === undefined || extent === 'UNKNOWN' || neuro === undefined) return 'UNDETERMINED'
  if (!Array.isArray(neuro) || neuro.length === 0) return 'UNDETERMINED'
  if (neuro.includes('UNKNOWN')) return 'UNDETERMINED'

  const hasConcreteNeuro = neuro.some((x) => N09_CONCRETE.has(x))
  const isNoneOnly = arraysEqual(neuro, ['NONE'])

  if ((extent === 'FOREARM' || extent === 'HAND_FINGERS') && hasConcreteNeuro) return 'HIGHER_SUPPORT'
  if (extent === 'SHOULDER_UPPER_ARM' && hasConcreteNeuro) return 'CONSIDER'
  if ((extent === 'FOREARM' || extent === 'HAND_FINGERS') && isNoneOnly) return 'CONSIDER'
  if (extent === 'NECK_ONLY' && isNoneOnly) return 'LOWER_SUPPORT'
  return 'UNDETERMINED' // unmapped combination (NB2), e.g. NECK_ONLY+concrete
}

const hasN09ConcretePositive = (neuro: string[] | undefined): boolean =>
  Array.isArray(neuro) && neuro.some((x) => N09_CONCRETE.has(x))

/**
 * `neck_safety_status !== 'CLEAR'` -- disease safety lock (§7). Locks BOTH
 * routine exercise recommendation AND cervical HVLA/chuna/traction
 * suggestion.
 */
export const neckDiseaseSafetyLocked = (f: NeckComputedFields): boolean => f.neck_safety_status !== 'CLEAR'

/**
 * `neck_treatment_safety_status !== 'CLEAR'` -- treatment safety lock (§7).
 * Locks contraindication-sensitive intervention (manipulation/traction/
 * invasive) auto-confirmation. Independent of disease safety.
 */
export const neckTreatmentSafetyLocked = (f: NeckComputedFields): boolean => f.neck_treatment_safety_status !== 'CLEAR'

/**
 * §7: "조작 lock이 운동 lock보다 우선한다" -- cervical
 * manipulation/traction is locked by EITHER disease safety OR treatment
 * safety being non-CLEAR, whereas routine exercise is locked by disease
 * safety alone. This function is therefore not just an alias of
 * neckDiseaseSafetyLocked.
 */
export const neckManipulationLocked = (f: NeckComputedFields): boolean =>
  neckDiseaseSafetyLocked(f) || neckTreatmentSafetyLocked(f)

/** Routine exercise recommendation lock (§7 disease safety lock bullet only). */
export const neckExerciseLocked = (f: NeckComputedFields): boolean => neckDiseaseSafetyLocked(f)

/**
 * Port of v0.2.1's full computed-fields set. Always computed whenever the
 * NECK module is active, never gated on which fields happen to be present --
 * `undefined` is exactly one of the states these functions classify. Not
 * stored back into `Responses` (same reasoning as lbpLogic.ts's
 * computeLbpFlags top comment).
 */
export function computeNeckFlags(state: NeckState): NeckComputedFields {
  return {
    neck_safety_status: neckSafetyStatus(state),
    neck_treatment_safety_status: neckTreatmentSafetyStatus(state),
    neck_neuro_baseline_required:
      hasNeckCordConcretePositive(state.neck_cord_concern_screen) || hasN09ConcretePositive(state.neck_arm_neuro_symptoms),
    radicular_support: radicularSupport(state),
    cervicogenic_headache_pattern_consider: state.neck_headache_neck_link === 'YES',
    movement_coordination_deficit_consider: state.neck_sustained_posture_aggravation === 'YES',
  }
}
