/**
 * LBP_V1 safety-state logic.
 *
 * This file has two layers, kept deliberately separate (see
 * LBP_INTEGRATION_PLAN_DRAFT.md revision-log item 1):
 *
 * 1. `LbpState` + the pure functions below it are a literal, line-by-line
 *    port of `tablet-core/lbp_logic.py` — field names and enum values are
 *    IDENTICAL to the Python dict keys. This layer is what
 *    `tests/lbp.spec.mjs` runs the ported `test_lbp_logic.py` regression
 *    suite against, so it must never diverge from the Python source without
 *    an explicit, reviewed reason. `lbp_logic.py` is itself the output of a
 *    clinical decision closure (LBP_v1.4_임상결정_마감본.md) — treat its
 *    behavior as ground truth, not something to "improve" while porting.
 *
 * 2. `toLbpState` is a separate adapter that translates the real app's
 *    `Responses` (+ clinician judgment + patient age) into `LbpState`. All
 *    translation risk — enum case mapping, Python's `MISSING` sentinel vs.
 *    this app's `null`/`undefined`, the pregnancy-status derivation — lives
 *    here, where it is visible and independently testable, rather than
 *    hidden inside "the port".
 *
 * MISSING contract: Python's `MISSING` sentinel (a field never present in
 * `state`) is represented here as `undefined` — never `null`. Every
 * comparison against a possibly-absent field (especially `patient_age`)
 * must guard with `=== undefined` first; a bare `age < 45` on a `number |
 * undefined` would silently pass for `undefined` in JS-land if it ever
 * leaked in as `NaN`/coerced — this file avoids that class of bug by never
 * allowing `patient_age` to be anything other than `number | undefined`.
 */

// ---------------------------------------------------------------------------
// Layer 1: literal port of tablet-core/lbp_logic.py
// ---------------------------------------------------------------------------

export type LbpSafetyStatus = 'CLEAR' | 'REVIEW_REQUIRED' | 'URGENT_REVIEW'
export type TreatmentSafetyStatus = 'CLEAR' | 'REVIEW_REQUIRED'
type YesNoUnknown = 'YES' | 'NO' | 'UNKNOWN'

/**
 * Mirrors lbp_logic.py's URGENT_CES_VALUES. Exported so the real-time
 * mid-flow interrupt check (coreSpec.ts's STAFF_CHECK_TRIGGERS.LBP_04) can
 * reuse this exact list instead of duplicating it — see plan revision-log
 * item 7.
 */
export const URGENT_CES_VALUES = new Set([
  'URINARY_RETENTION',
  'BLADDER_BOWEL_CONTROL',
  'SADDLE_SENSORY_CHANGE',
  'RAPID_PROGRESSIVE_WEAKNESS',
  'SUDDEN_SEXUAL_FUNCTION_CHANGE',
])

/** Mirrors lbp_logic.py's REVIEW_HISTORY_VALUES. */
const REVIEW_HISTORY_VALUES = new Set(['CANCER', 'OSTEOPOROSIS'])

/** Mirrors lbp_logic.py's CONCRETE_LEG_EXTENT. */
const CONCRETE_LEG_EXTENT = new Set(['BUTTOCK', 'THIGH', 'BELOW_KNEE', 'FOOT'])

/** Mirrors lbp_logic.py's CONCRETE_LEG_SIDE. */
const CONCRETE_LEG_SIDE = new Set(['RIGHT', 'LEFT', 'BILATERAL'])

/** Mirrors lbp_logic.py's CONCRETE_NEURO. */
const CONCRETE_NEURO = new Set(['PARESTHESIA', 'NUMBNESS', 'SUBJECTIVE_WEAKNESS'])

/** Mirrors lbp_logic.py's TREATMENT_SAFETY_PREGNANCY_VALUES. */
const TREATMENT_SAFETY_PREGNANCY_VALUES = new Set(['YES', 'POSSIBLE', 'UNKNOWN'])

/**
 * State-dict shape matching lbp_logic.py's `state: dict` field-for-field,
 * EXCEPT `onset_pattern` — deliberately dropped, not silently ignored (see
 * plan revision-log item 12). This app has no `onset_pattern` field
 * anywhere, so Python's `onset_pattern === "TRAUMA"` disjunct in
 * `safety_status` (one of two independent ways trauma can force review) has
 * no TS equivalent and is omitted below. This is safe because the other
 * disjunct — `lbp_trauma_safety !== 'NO'` (item 4) — already covers
 * unconditional trauma escalation via `LBP_06` on its own; nothing in this
 * app can ever set `onset_pattern`, so the omitted disjunct could never
 * have fired anyway.
 */
export interface LbpState {
  lbp_distal_extent?: string
  lbp_leg_side?: 'NONE' | 'RIGHT' | 'LEFT' | 'BILATERAL' | 'UNKNOWN'
  lbp_leg_neuro_symptoms?: string[]
  lbp_ces_screen?: string[] | string
  lbp_current_redflag_screen?: string[]
  lbp_trauma_safety?: 'NO' | 'YES' | 'UNKNOWN'
  onset_bucket?: 'M3_PLUS' | 'NOT_M3_PLUS' | 'UNKNOWN'
  lbp_onset_before_45?: 'YES' | 'NO' | 'UNKNOWN'
  lbp_inflammatory_screen?: string[]
  major_history_present?: 'YES' | 'NO'
  major_history_categories?: string[]
  patient_age?: number
  patient_sex?: 'F' | 'M' | 'OTHER' | 'UNKNOWN'
  pregnancy_status?: 'YES' | 'NO' | 'POSSIBLE' | 'UNKNOWN'
  clinician_objective_motor_deficit?: 'NONE' | 'SEVERE_OR_PROGRESSIVE' | 'UNKNOWN'
}

export interface LbpComputedFields {
  leg_symptom_present: YesNoUnknown
  lbp_inflammatory_eligible: YesNoUnknown
  lbp_inflammatory_pattern_consider: boolean
  lbp_neuro_baseline_required: boolean
  lbp_fracture_risk_age_modifier: boolean
  lbp_malignancy_risk_age_modifier: boolean
  lbp_safety_status: LbpSafetyStatus
  treatment_safety_status: TreatmentSafetyStatus
}

const arraysEqual = (a: string[] | undefined, b: string[]): boolean =>
  a !== undefined && a.length === b.length && a.every((v, i) => v === b[i])

/** Port of lbp_logic.py's compute_leg_state. */
function computeLegState(s: LbpState): YesNoUnknown {
  const extent = s.lbp_distal_extent
  const side = s.lbp_leg_side
  const neuro = s.lbp_leg_neuro_symptoms
  const concrete =
    (extent !== undefined && CONCRETE_LEG_EXTENT.has(extent)) ||
    (side !== undefined && CONCRETE_LEG_SIDE.has(side)) ||
    (Array.isArray(neuro) && neuro.some((x) => CONCRETE_NEURO.has(x)))
  if (concrete) return 'YES'
  if (extent === 'BACK_ONLY' && side === 'NONE' && arraysEqual(neuro, ['NONE'])) return 'NO'
  return 'UNKNOWN'
}

/** Port of lbp_logic.py's compute_inflammatory_eligible (decision doc §5). */
function computeInflammatoryEligible(s: LbpState): YesNoUnknown {
  const onsetBucket = s.onset_bucket
  if (onsetBucket === undefined || onsetBucket === 'UNKNOWN') return 'UNKNOWN'
  if (onsetBucket !== 'M3_PLUS') return 'NO'
  const age = s.patient_age
  if (age === undefined) return 'UNKNOWN'
  if (age < 45) return 'YES'
  const onset = s.lbp_onset_before_45
  if (onset === 'YES' || onset === 'NO' || onset === 'UNKNOWN') return onset
  return 'UNKNOWN'
}

/** Port of lbp_logic.py's compute_inflammatory_pattern_consider (decision doc §5). */
function computeInflammatoryPatternConsider(s: LbpState): boolean {
  if (computeInflammatoryEligible(s) !== 'YES') return false
  const screen = s.lbp_inflammatory_screen
  return Array.isArray(screen) && screen.some((v) => v !== 'NONE' && v !== 'UNKNOWN')
}

/** Port of lbp_logic.py's compute_neuro_baseline_required (decision doc §2 proviso). */
function computeNeuroBaselineRequired(s: LbpState): boolean {
  if (s.lbp_leg_side !== 'BILATERAL') return false
  const neuro = s.lbp_leg_neuro_symptoms
  const hasConcreteNeuro = Array.isArray(neuro) && neuro.some((x) => CONCRETE_NEURO.has(x))
  return !hasConcreteNeuro
}

/** Port of lbp_logic.py's compute_fracture_risk_age_modifier (decision doc §3-2). Clinician-facing only. */
function computeFractureRiskAgeModifier(s: LbpState): boolean {
  return s.patient_age !== undefined && s.patient_age >= 75
}

/** Port of lbp_logic.py's compute_malignancy_risk_age_modifier (decision doc §3-2). Clinician-facing only. */
function computeMalignancyRiskAgeModifier(s: LbpState): boolean {
  return s.patient_age !== undefined && s.patient_age > 50
}

/**
 * Port of lbp_logic.py's compute_treatment_safety_status (decision doc §6).
 * A SEPARATE dimension from lbp_safety_status — pregnancy affects what
 * treatment can be finalized, not whether the LBP presentation itself needs
 * disease-safety review. Never merge this into lbpSafetyStatus's return
 * value.
 */
function computeTreatmentSafetyStatus(s: LbpState): TreatmentSafetyStatus {
  const pregnancyStatus = s.pregnancy_status
  if (pregnancyStatus !== undefined && TREATMENT_SAFETY_PREGNANCY_VALUES.has(pregnancyStatus)) {
    return 'REVIEW_REQUIRED'
  }
  if (pregnancyStatus === 'NO') return 'CLEAR'
  // pregnancyStatus undefined (MISSING): only a real gap if the question
  // should have fired (sex in [F,OTHER,UNKNOWN], age 10-55) but hasn't been
  // answered yet -- fail closed there. Otherwise undefined is the expected,
  // non-gap state (e.g. a male patient never gets asked at all).
  const sex = s.patient_sex
  const age = s.patient_age
  const applicable =
    (sex === 'F' || sex === 'OTHER' || sex === 'UNKNOWN') && age !== undefined && age >= 10 && age <= 55
  return applicable ? 'REVIEW_REQUIRED' : 'CLEAR'
}

/**
 * Port of lbp_logic.py's _ces_requires_review. Any shape other than exactly
 * ['NONE'] (or an urgent value present) requires review -- mirrors the
 * already-correct lbp_current_redflag_screen pattern instead of an
 * exact-equality check that would let malformed/edge states fall through to
 * CLEAR.
 */
function cesRequiresReview(ces: LbpState['lbp_ces_screen']): { urgent: boolean; review: boolean } {
  if (ces === undefined) return { urgent: false, review: true }
  const vals = Array.isArray(ces) ? ces : [ces]
  if (vals.some((v) => URGENT_CES_VALUES.has(v))) return { urgent: true, review: true }
  if (arraysEqual(vals, ['NONE'])) return { urgent: false, review: false }
  return { urgent: false, review: true } // empty, ['UNKNOWN'], ['UNKNOWN','NONE'], malformed, etc.
}

/**
 * Port of lbp_logic.py's safety_status. Disease safety only -- see
 * computeTreatmentSafetyStatus for the separate pregnancy dimension
 * (decision doc §6).
 */
function lbpSafetyStatus(s: LbpState): LbpSafetyStatus {
  const cesResult = cesRequiresReview(s.lbp_ces_screen)
  let urgent = cesResult.urgent
  const cesReview = cesResult.review

  // Decision doc §1-2: clinician-confirmed objective neurologic
  // deterioration is independent of and can escalate past the
  // patient-reported CES screen.
  if (s.clinician_objective_motor_deficit === 'SEVERE_OR_PROGRESSIVE') {
    urgent = true
  }

  if (urgent) return 'URGENT_REVIEW'

  let review = cesReview

  const current = s.lbp_current_redflag_screen
  if (current === undefined || !arraysEqual(current, ['NONE'])) {
    review = true
  }

  // lbp_trauma_safety is asked unconditionally within the module (decision
  // doc §4 / prior Opus-review fix). Python also ORs in
  // `onset_pattern === "TRAUMA"` here; that field has no equivalent in this
  // app and is omitted (see LbpState's doc comment) -- safe, since this
  // check alone already covers unconditional trauma escalation, and MISSING
  // (undefined, i.e. never answered) fails closed exactly like Python's
  // `trauma in ("YES","UNKNOWN",MISSING)`.
  if (s.lbp_trauma_safety === 'YES' || s.lbp_trauma_safety === 'UNKNOWN' || s.lbp_trauma_safety === undefined) {
    review = true
  }

  const hist = s.major_history_categories
  if (s.major_history_present === 'YES' && hist === undefined) {
    review = true // incomplete safety-relevant answer, not "no history"
  } else if (Array.isArray(hist) && hist.some((x) => REVIEW_HISTORY_VALUES.has(x))) {
    review = true
  }

  // Decision doc §2 (confirmed): bilateral + a concrete neuro feature
  // requires review. Bilateral pain ALONE does NOT -- see
  // computeNeuroBaselineRequired for that case instead.
  const neuro = s.lbp_leg_neuro_symptoms
  if (s.lbp_leg_side === 'BILATERAL' && Array.isArray(neuro) && neuro.some((x) => CONCRETE_NEURO.has(x))) {
    review = true
  }

  return review ? 'REVIEW_REQUIRED' : 'CLEAR'
}

/**
 * lbp_safety_status !== CLEAR, computed as a plain inequality. safety
 * status always returns a concrete value once called, so this is safe.
 * Decision doc §9 (fail closed) / decision-doc checklist item 18 (a
 * MISSING/not-yet-computed status must lock, never unlock).
 *
 * NOTE: lbp_logic.py's own docstring for this function claims "computed as
 * a plain equality rather than a `!= CLEAR` comparison" while its actual
 * code IS `!= CLEAR` -- that docstring is self-contradictory (flagged by
 * Opus review). Trust the code, not the prose: this MUST be `!== 'CLEAR'`.
 * Do not "fix" it to match the misleading comment.
 */
export const diseaseSafetyLocked = (f: LbpComputedFields): boolean => f.lbp_safety_status !== 'CLEAR'

/**
 * Decision doc §9: contraindication-sensitive treatment/exercise must not
 * be finalized without clinician approval when treatment_safety_status !==
 * CLEAR. Does not stop the questionnaire -- only gates recommendation
 * finalization, unlike diseaseSafetyLocked.
 */
export const treatmentSafetyLocked = (f: LbpComputedFields): boolean => f.treatment_safety_status !== 'CLEAR'

/**
 * Port of lbp_logic.py's recompute(). Always computed whenever the LBP
 * module is active -- never gated on which fields happen to be present,
 * since `undefined` is exactly one of the states these functions are
 * designed to classify.
 *
 * Unlike the Python source (which mutates `state` in place for a
 * prune-fixpoint loop), this returns a fresh object and is NOT stored back
 * into `Responses` -- see this file's top comment and plan revision-log
 * item 1/8 for why (`pruneStaleResponses` needs zero changes; LBP screen
 * `showIf` predicates call the small helpers above directly instead of
 * reading back a stored computed field).
 */
export function computeLbpFlags(state: LbpState): LbpComputedFields {
  return {
    leg_symptom_present: computeLegState(state),
    lbp_inflammatory_eligible: computeInflammatoryEligible(state),
    lbp_inflammatory_pattern_consider: computeInflammatoryPatternConsider(state),
    lbp_neuro_baseline_required: computeNeuroBaselineRequired(state),
    lbp_fracture_risk_age_modifier: computeFractureRiskAgeModifier(state),
    lbp_malignancy_risk_age_modifier: computeMalignancyRiskAgeModifier(state),
    lbp_safety_status: lbpSafetyStatus(state),
    treatment_safety_status: computeTreatmentSafetyStatus(state),
  }
}

/**
 * Exported for showIf predicates that need it before a full LbpState exists
 * (e.g. LBP_11's visibility gate, which only needs onset_bucket + age, not
 * the whole state). Kept as a thin re-export rather than a second
 * implementation.
 */
export const isInflammatoryEligible = (s: Pick<LbpState, 'onset_bucket' | 'patient_age' | 'lbp_onset_before_45'>): YesNoUnknown =>
  computeInflammatoryEligible(s)
