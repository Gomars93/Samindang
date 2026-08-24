// NECK_V1 regression suite.
//
// Section A exercises src/spec/neckLogic.ts's Layer-1 engine directly
// (NeckState-shaped) against the rules in
// NECK_V1_Tablet_Question_Set_v0.2.1_CLOSED.md §5-7 -- the CLOSED
// ground-truth safety logic, including explicit regression cases for
// erratum E1 (N10A fail-open) and E2 (N04 soft-tier invalid-N03A ordering
// inversion) that the Opus v0.2 re-review found and v0.2.1 fixed.
//
// Section B tests src/spec/neckAdapter.ts's toNeckState (Layer 2) -- enum
// case mapping, onset-bucket/medication/history-category derivation, same
// translation-risk boundary tests/lbp.spec.mjs's Section B established for
// LBP_V1.
//
// Run via `npm run test:neck` (bundles neckLogic.ts/neckAdapter.ts with
// esbuild first, matching every other test:* script's convention).

import assert from 'node:assert/strict'
import {
  computeNeckFlags,
  neckDiseaseSafetyLocked,
  neckTreatmentSafetyLocked,
  neckManipulationLocked,
} from './.neck-logic-bundle.mjs'
import { toNeckState } from './.neck-adapter-bundle.mjs'

let passed = 0
let failed = 0
const failures = []

function test(name, fn) {
  try {
    fn()
    passed += 1
  } catch (err) {
    failed += 1
    failures.push({ name, err })
  }
}

// A fully-negative, fully-answered NeckState -- every required safety field
// present and valid-negative, N10 = NO so N10A is legitimately inapplicable.
const BASE_CLEAR = {
  neck_recent_significant_trauma: 'NO',
  neck_cord_concern_screen: ['NONE'],
  neck_sudden_unusual_severe_neck_pain: 'NO',
  neck_thunderclap_headache_screen: 'NO',
  neck_vascular_associated_screen: ['NONE'],
  neck_systemic_redflag_screen: ['NONE'],
  neck_headache_present: 'NO',
  major_history_present: 'NO',
  major_history_categories: [],
  medication_present: 'NO',
  medication_categories: [],
  pregnancy_status: 'NO',
}

const clearState = (overrides = {}) => ({ ...BASE_CLEAR, ...overrides })
const safetyStatus = (state) => computeNeckFlags(state).neck_safety_status
const treatmentStatus = (state) => computeNeckFlags(state).neck_treatment_safety_status

// --- Section A: Disease Safety Engine (v0.2.1 §5) --------------------------

test('A0: fully-answered valid-negative baseline is CLEAR', () => {
  assert.equal(safetyStatus(clearState()), 'CLEAR')
})

// --- N01 trauma ---
test('N01: trauma YES -> REVIEW_REQUIRED (never urgent alone)', () => {
  assert.equal(safetyStatus(clearState({ neck_recent_significant_trauma: 'YES' })), 'REVIEW_REQUIRED')
})
test('N01: trauma UNKNOWN -> REVIEW_REQUIRED', () => {
  assert.equal(safetyStatus(clearState({ neck_recent_significant_trauma: 'UNKNOWN' })), 'REVIEW_REQUIRED')
})
test('N01: trauma missing -> REVIEW_REQUIRED', () => {
  const s = clearState()
  delete s.neck_recent_significant_trauma
  assert.equal(safetyStatus(s), 'REVIEW_REQUIRED')
})

// --- N02 cord concern screen ---
test('N02: RAPIDLY_WORSENING_LIMB_WEAKNESS -> URGENT_REVIEW', () => {
  assert.equal(safetyStatus(clearState({ neck_cord_concern_screen: ['RAPIDLY_WORSENING_LIMB_WEAKNESS'] })), 'URGENT_REVIEW')
})
test('N02: NEW_BLADDER_BOWEL_CHANGE -> URGENT_REVIEW', () => {
  assert.equal(safetyStatus(clearState({ neck_cord_concern_screen: ['NEW_BLADDER_BOWEL_CHANGE'] })), 'URGENT_REVIEW')
})
test('N02: HAND_CLUMSINESS alone -> REVIEW_REQUIRED, not urgent', () => {
  // N02A is required_when_shown but omitted here on purpose -- also asserts
  // missing N02A (when it should have been shown) fails closed to review,
  // not to CLEAR.
  assert.equal(safetyStatus(clearState({ neck_cord_concern_screen: ['HAND_CLUMSINESS'] })), 'REVIEW_REQUIRED')
})
test('N02: UNKNOWN -> REVIEW_REQUIRED', () => {
  assert.equal(safetyStatus(clearState({ neck_cord_concern_screen: ['UNKNOWN'] })), 'REVIEW_REQUIRED')
})
test('N02: missing -> REVIEW_REQUIRED', () => {
  const s = clearState()
  delete s.neck_cord_concern_screen
  assert.equal(safetyStatus(s), 'REVIEW_REQUIRED')
})
test('N02: malformed (NONE+positive) -> REVIEW_REQUIRED', () => {
  assert.equal(safetyStatus(clearState({ neck_cord_concern_screen: ['NONE', 'HAND_CLUMSINESS'] })), 'REVIEW_REQUIRED')
})

// --- N02A course (D1) ---
test('N02A: WORSENING with N02 concrete positive -> URGENT_REVIEW', () => {
  const s = clearState({ neck_cord_concern_screen: ['HAND_CLUMSINESS'], neck_cord_symptom_course: 'WORSENING' })
  assert.equal(safetyStatus(s), 'URGENT_REVIEW')
})
test('N02A: STABLE with N02 concrete positive -> REVIEW_REQUIRED, not urgent', () => {
  const s = clearState({ neck_cord_concern_screen: ['HAND_CLUMSINESS'], neck_cord_symptom_course: 'STABLE' })
  assert.equal(safetyStatus(s), 'REVIEW_REQUIRED')
})
test('N02A: already-urgent N02 stays urgent regardless of course', () => {
  const s = clearState({ neck_cord_concern_screen: ['RAPIDLY_WORSENING_LIMB_WEAKNESS'], neck_cord_symptom_course: 'IMPROVING' })
  assert.equal(safetyStatus(s), 'URGENT_REVIEW')
})
test('N02A: not evaluated when N02 has no concrete positive (course left undefined)', () => {
  // N02A should never have been shown; its absence must not itself force
  // review beyond whatever N02=[NONE] already implies (CLEAR).
  assert.equal(safetyStatus(clearState({ neck_cord_concern_screen: ['NONE'] })), 'CLEAR')
})

// --- N03A / N03B (D3 split) ---
test('N03A: YES alone -> REVIEW_REQUIRED, never auto-URGENT', () => {
  assert.equal(safetyStatus(clearState({ neck_sudden_unusual_severe_neck_pain: 'YES' })), 'REVIEW_REQUIRED')
})
test('N03A: UNKNOWN -> REVIEW_REQUIRED', () => {
  assert.equal(safetyStatus(clearState({ neck_sudden_unusual_severe_neck_pain: 'UNKNOWN' })), 'REVIEW_REQUIRED')
})
test('N03B: YES (thunderclap) -> URGENT_REVIEW', () => {
  assert.equal(safetyStatus(clearState({ neck_thunderclap_headache_screen: 'YES' })), 'URGENT_REVIEW')
})
test('N03B: UNKNOWN -> REVIEW_REQUIRED, not urgent', () => {
  assert.equal(safetyStatus(clearState({ neck_thunderclap_headache_screen: 'UNKNOWN' })), 'REVIEW_REQUIRED')
})
test('N03B: missing -> REVIEW_REQUIRED', () => {
  const s = clearState()
  delete s.neck_thunderclap_headache_screen
  assert.equal(safetyStatus(s), 'REVIEW_REQUIRED')
})

// --- N04 hard/soft tiers (D2 + E2) ---
test('N04: hard-tier positive -> URGENT_REVIEW regardless of N03A', () => {
  assert.equal(
    safetyStatus(clearState({ neck_vascular_associated_screen: ['NEW_ONE_SIDED_WEAKNESS_OR_NUMBNESS'] })),
    'URGENT_REVIEW',
  )
})
test('N04: soft-tier positive + N03A=NO (valid negative) -> REVIEW_REQUIRED, not urgent', () => {
  const s = clearState({
    neck_vascular_associated_screen: ['NEW_SEVERE_DIZZINESS_OR_FAINTNESS'],
    neck_sudden_unusual_severe_neck_pain: 'NO',
  })
  assert.equal(safetyStatus(s), 'REVIEW_REQUIRED')
})
test('N04: soft-tier positive + N03A=YES -> URGENT_REVIEW', () => {
  const s = clearState({
    neck_vascular_associated_screen: ['NEW_SEVERE_DIZZINESS_OR_FAINTNESS'],
    neck_sudden_unusual_severe_neck_pain: 'YES',
  })
  assert.equal(safetyStatus(s), 'URGENT_REVIEW')
})
test('N04: soft-tier positive + N03A=UNKNOWN -> URGENT_REVIEW', () => {
  const s = clearState({
    neck_vascular_associated_screen: ['NEW_SEVERE_DIZZINESS_OR_FAINTNESS'],
    neck_sudden_unusual_severe_neck_pain: 'UNKNOWN',
  })
  assert.equal(safetyStatus(s), 'URGENT_REVIEW')
})
test('E2 regression: soft-tier positive + N03A missing/invalid -> URGENT_REVIEW (not more permissive than UNKNOWN)', () => {
  const s = clearState({ neck_vascular_associated_screen: ['NEW_SEVERE_DIZZINESS_OR_FAINTNESS'] })
  delete s.neck_sudden_unusual_severe_neck_pain
  assert.equal(safetyStatus(s), 'URGENT_REVIEW')
})
test('N04: UNKNOWN -> REVIEW_REQUIRED', () => {
  assert.equal(safetyStatus(clearState({ neck_vascular_associated_screen: ['UNKNOWN'] })), 'REVIEW_REQUIRED')
})
test('N04: missing -> REVIEW_REQUIRED', () => {
  const s = clearState()
  delete s.neck_vascular_associated_screen
  assert.equal(safetyStatus(s), 'REVIEW_REQUIRED')
})
test('N04: malformed (NONE+UNKNOWN) -> REVIEW_REQUIRED', () => {
  assert.equal(safetyStatus(clearState({ neck_vascular_associated_screen: ['NONE', 'UNKNOWN'] })), 'REVIEW_REQUIRED')
})

// --- N05 systemic redflags + D9 Core-reuse CANCER OR ---
test('N05: PRIOR_CANCER positive -> REVIEW_REQUIRED', () => {
  assert.equal(safetyStatus(clearState({ neck_systemic_redflag_screen: ['PRIOR_CANCER'] })), 'REVIEW_REQUIRED')
})
test('N05: UNKNOWN -> REVIEW_REQUIRED', () => {
  assert.equal(safetyStatus(clearState({ neck_systemic_redflag_screen: ['UNKNOWN'] })), 'REVIEW_REQUIRED')
})
test('N05: missing -> REVIEW_REQUIRED', () => {
  const s = clearState()
  delete s.neck_systemic_redflag_screen
  assert.equal(safetyStatus(s), 'REVIEW_REQUIRED')
})
test('D9: N05=[NONE] but major_history_categories has CANCER -> REVIEW_REQUIRED (Core-reuse OR, never a negative override)', () => {
  const s = clearState({ neck_systemic_redflag_screen: ['NONE'], major_history_categories: ['CANCER'] })
  assert.equal(safetyStatus(s), 'REVIEW_REQUIRED')
})
test('D9 counter-check: N05=[NONE] + unrelated history category -> does not itself force review', () => {
  const s = clearState({
    neck_systemic_redflag_screen: ['NONE'],
    major_history_present: 'YES',
    major_history_categories: ['DIABETES'],
  })
  assert.equal(safetyStatus(s), 'CLEAR')
})

// --- N10A + E1 (the fail-open erratum) ---
test('N10: NO -> N10A inapplicable, does not force review even though N10A is undefined', () => {
  assert.equal(safetyStatus(clearState({ neck_headache_present: 'NO' })), 'CLEAR')
})
test('E1 regression: N10=UNKNOWN with N10A missing -> REVIEW_REQUIRED (v0.2 fail-open, fixed in v0.2.1)', () => {
  const s = clearState({ neck_headache_present: 'UNKNOWN' })
  assert.equal(safetyStatus(s), 'REVIEW_REQUIRED')
})
test('N10=YES, N10A=YES -> REVIEW_REQUIRED', () => {
  const s = clearState({ neck_headache_present: 'YES', neck_new_or_changed_headache: 'YES' })
  assert.equal(safetyStatus(s), 'REVIEW_REQUIRED')
})
test('N10=YES, N10A=NO -> does not force review', () => {
  const s = clearState({ neck_headache_present: 'YES', neck_new_or_changed_headache: 'NO' })
  assert.equal(safetyStatus(s), 'CLEAR')
})
test('N10=YES, N10A=UNKNOWN -> REVIEW_REQUIRED', () => {
  const s = clearState({ neck_headache_present: 'YES', neck_new_or_changed_headache: 'UNKNOWN' })
  assert.equal(safetyStatus(s), 'REVIEW_REQUIRED')
})

// --- Section A: Treatment Safety Engine (v0.2.1 §6) -------------------------

test('B0: fully-answered valid-negative baseline is treatment CLEAR', () => {
  assert.equal(treatmentStatus(clearState()), 'CLEAR')
})
test('medication_present missing -> REVIEW_REQUIRED', () => {
  const s = clearState()
  delete s.medication_present
  assert.equal(treatmentStatus(s), 'REVIEW_REQUIRED')
})
test('medication_present UNKNOWN -> REVIEW_REQUIRED', () => {
  assert.equal(treatmentStatus(clearState({ medication_present: 'UNKNOWN' })), 'REVIEW_REQUIRED')
})
test('medication_present YES + categories missing -> REVIEW_REQUIRED (cannot rule out anticoagulant use)', () => {
  const s = clearState({ medication_present: 'YES' })
  delete s.medication_categories
  assert.equal(treatmentStatus(s), 'REVIEW_REQUIRED')
})
test('medication_present YES + ANTICOAG category -> REVIEW_REQUIRED', () => {
  assert.equal(treatmentStatus(clearState({ medication_present: 'YES', medication_categories: ['ANTICOAG'] })), 'REVIEW_REQUIRED')
})
test('medication_present YES + OTHER_UNKNOWN category -> REVIEW_REQUIRED', () => {
  assert.equal(
    treatmentStatus(clearState({ medication_present: 'YES', medication_categories: ['OTHER_UNKNOWN'] })),
    'REVIEW_REQUIRED',
  )
})
test('medication_present YES + non-anticoag category -> treatment CLEAR', () => {
  assert.equal(treatmentStatus(clearState({ medication_present: 'YES', medication_categories: ['PSYCH'] })), 'CLEAR')
})
test('major_history_present YES + categories missing -> REVIEW_REQUIRED', () => {
  const s = clearState({ major_history_present: 'YES' })
  delete s.major_history_categories
  assert.equal(treatmentStatus(s), 'REVIEW_REQUIRED')
})
test('major_history_categories OSTEOPOROSIS -> REVIEW_REQUIRED', () => {
  assert.equal(treatmentStatus(clearState({ major_history_categories: ['OSTEOPOROSIS'] })), 'REVIEW_REQUIRED')
})
test('major_history_categories BLEEDING_DISORDER -> REVIEW_REQUIRED', () => {
  assert.equal(treatmentStatus(clearState({ major_history_categories: ['BLEEDING_DISORDER'] })), 'REVIEW_REQUIRED')
})
for (const v of ['YES', 'POSSIBLE', 'UNKNOWN']) {
  test(`pregnancy_status=${v} -> REVIEW_REQUIRED`, () => {
    assert.equal(treatmentStatus(clearState({ pregnancy_status: v })), 'REVIEW_REQUIRED')
  })
}
test('pregnancy_status undefined (not applicable, e.g. male patient) -> does not force review', () => {
  const s = clearState()
  delete s.pregnancy_status
  assert.equal(treatmentStatus(s), 'CLEAR')
})

// --- disease safety and treatment safety are independent dimensions ---
test('disease safety non-CLEAR does not imply treatment safety non-CLEAR', () => {
  const s = clearState({ neck_recent_significant_trauma: 'YES' })
  assert.equal(safetyStatus(s), 'REVIEW_REQUIRED')
  assert.equal(treatmentStatus(s), 'CLEAR')
})
test('treatment safety non-CLEAR does not imply disease safety non-CLEAR', () => {
  const s = clearState({ pregnancy_status: 'YES' })
  assert.equal(safetyStatus(s), 'CLEAR')
  assert.equal(treatmentStatus(s), 'REVIEW_REQUIRED')
})

// --- Section A: Intervention Locks (v0.2.1 §7, D8) --------------------------

test('locks: fully CLEAR state locks nothing', () => {
  const f = computeNeckFlags(clearState())
  assert.equal(neckDiseaseSafetyLocked(f), false)
  assert.equal(neckTreatmentSafetyLocked(f), false)
  assert.equal(neckManipulationLocked(f), false)
})
test('locks: disease-safety non-CLEAR locks BOTH exercise and manipulation', () => {
  const f = computeNeckFlags(clearState({ neck_recent_significant_trauma: 'YES' }))
  assert.equal(neckDiseaseSafetyLocked(f), true)
  assert.equal(neckManipulationLocked(f), true)
})
test('locks: treatment-safety-only non-CLEAR locks manipulation but not exercise (D8: manipulation lock is broader)', () => {
  const f = computeNeckFlags(clearState({ pregnancy_status: 'YES' }))
  assert.equal(neckDiseaseSafetyLocked(f), false)
  assert.equal(neckTreatmentSafetyLocked(f), true)
  assert.equal(neckManipulationLocked(f), true)
})

// --- Section A: radicular_support (N09, NB2) --------------------------------

const withArm = (extent, neuro) => clearState({ neck_distal_extent: extent, neck_arm_neuro_symptoms: neuro })

test('radicular: FOREARM + concrete neuro -> HIGHER_SUPPORT', () => {
  assert.equal(computeNeckFlags(withArm('FOREARM', ['NUMBNESS'])).radicular_support, 'HIGHER_SUPPORT')
})
test('radicular: HAND_FINGERS + concrete neuro -> HIGHER_SUPPORT', () => {
  assert.equal(computeNeckFlags(withArm('HAND_FINGERS', ['PARESTHESIA'])).radicular_support, 'HIGHER_SUPPORT')
})
test('radicular: SHOULDER_UPPER_ARM + concrete neuro -> CONSIDER', () => {
  assert.equal(computeNeckFlags(withArm('SHOULDER_UPPER_ARM', ['SUBJECTIVE_WEAKNESS'])).radicular_support, 'CONSIDER')
})
test('radicular: FOREARM + NONE -> CONSIDER (pure radicular pain without neuro symptoms)', () => {
  assert.equal(computeNeckFlags(withArm('FOREARM', ['NONE'])).radicular_support, 'CONSIDER')
})
test('radicular: NECK_ONLY + NONE -> LOWER_SUPPORT', () => {
  assert.equal(computeNeckFlags(withArm('NECK_ONLY', ['NONE'])).radicular_support, 'LOWER_SUPPORT')
})
test('radicular: NECK_ONLY + concrete neuro -> UNDETERMINED (unmapped combination, NB2)', () => {
  assert.equal(computeNeckFlags(withArm('NECK_ONLY', ['NUMBNESS'])).radicular_support, 'UNDETERMINED')
})
test('radicular: UNKNOWN extent -> UNDETERMINED', () => {
  assert.equal(computeNeckFlags(withArm('UNKNOWN', ['NONE'])).radicular_support, 'UNDETERMINED')
})
test('radicular: UNKNOWN present in neuro symptoms -> UNDETERMINED, never a confirmed state', () => {
  assert.equal(computeNeckFlags(withArm('FOREARM', ['UNKNOWN'])).radicular_support, 'UNDETERMINED')
})
test('radicular: missing extent/neuro -> UNDETERMINED', () => {
  assert.equal(computeNeckFlags(clearState()).radicular_support, 'UNDETERMINED')
})

// --- Section A: neuro_baseline_required -------------------------------------

test('neuro_baseline_required: true when N02 has a concrete positive', () => {
  assert.equal(
    computeNeckFlags(clearState({ neck_cord_concern_screen: ['HAND_CLUMSINESS'] })).neck_neuro_baseline_required,
    true,
  )
})
test('neuro_baseline_required: true when N09 has a concrete positive', () => {
  assert.equal(
    computeNeckFlags(clearState({ neck_arm_neuro_symptoms: ['NUMBNESS'] })).neck_neuro_baseline_required,
    true,
  )
})
test('neuro_baseline_required: false on the clear baseline', () => {
  assert.equal(computeNeckFlags(clearState()).neck_neuro_baseline_required, false)
})

// --- Section B: adapter (toNeckState) enum/onset/history/medication mapping -

const NULL_REPRO = { source: null, raw: null, pregnant: null, pregnancy_possible: null, postpartum_1y: null, breastfeeding: null }

const baseResponses = () => ({
  NECK_01: 'NO',
  NECK_02: ['NONE'],
  NECK_03A: 'NO',
  NECK_03B: 'NO',
  NECK_04: ['NONE'],
  NECK_05: ['NONE'],
  NECK_10: 'NO',
  HISTORY_01: ['none'],
  MED_USE: 'none',
  ID_03: 'male',
  VISIT_03_SYMPTOM_DURATION: 'within_1w',
})

test('S1: raw screen fields map onto the matching NeckState keys', () => {
  const r = { ...baseResponses(), NECK_01: 'YES', NECK_07: 'HAND_FINGERS', NECK_09: ['NUMBNESS'] }
  const state = toNeckState(r, NULL_REPRO)
  assert.equal(state.neck_recent_significant_trauma, 'YES')
  assert.equal(state.neck_distal_extent, 'HAND_FINGERS')
  assert.deepEqual(state.neck_arm_neuro_symptoms, ['NUMBNESS'])
})

test('S2: HISTORY_01 osteoporosis/cancer/bleeding_disorder map to uppercase categories', () => {
  const r = { ...baseResponses(), HISTORY_01: ['osteoporosis', 'cancer', 'bleeding_disorder'] }
  const state = toNeckState(r, NULL_REPRO)
  assert.equal(state.major_history_present, 'YES')
  assert.deepEqual(state.major_history_categories.sort(), ['BLEEDING_DISORDER', 'CANCER', 'OSTEOPOROSIS'])
})

test('S2: HISTORY_01=[none] -> major_history_present NO, empty categories (never a silent skip)', () => {
  const state = toNeckState(baseResponses(), NULL_REPRO)
  assert.equal(state.major_history_present, 'NO')
  assert.deepEqual(state.major_history_categories, [])
})

test('S3: MED_USE=none -> medication_present NO', () => {
  const state = toNeckState(baseResponses(), NULL_REPRO)
  assert.equal(state.medication_present, 'NO')
})

test('S3: MED_USE=unknown -> medication_present UNKNOWN, no categories claimed', () => {
  const r = { ...baseResponses(), MED_USE: 'unknown' }
  const state = toNeckState(r, NULL_REPRO)
  assert.equal(state.medication_present, 'UNKNOWN')
  assert.equal(state.medication_categories, undefined)
})

test('S3: MED_USE=yes + blood_thinner -> ANTICOAG category', () => {
  const r = { ...baseResponses(), MED_USE: 'yes', MED_TYPES: ['blood_thinner'] }
  const state = toNeckState(r, NULL_REPRO)
  assert.equal(state.medication_present, 'YES')
  assert.deepEqual(state.medication_categories, ['ANTICOAG'])
})

test('S3: MED_USE=yes + other_unknown -> OTHER_UNKNOWN category', () => {
  const r = { ...baseResponses(), MED_USE: 'yes', MED_TYPES: ['other_unknown'] }
  const state = toNeckState(r, NULL_REPRO)
  assert.deepEqual(state.medication_categories, ['OTHER_UNKNOWN'])
})

test('S3: MED_USE=yes + no MED_TYPES answer -> categories undefined (fails closed downstream, not a silent negative)', () => {
  const r = { ...baseResponses(), MED_USE: 'yes' }
  const state = toNeckState(r, NULL_REPRO)
  assert.equal(state.medication_present, 'YES')
  assert.equal(state.medication_categories, undefined)
})

test('S4: onset_bucket mapping matches lbpAdapter.ts convention', () => {
  const cases = [
    ['within_1w', 'NOT_M3_PLUS'],
    ['1w_1m', 'NOT_M3_PLUS'],
    ['1_3m', 'NOT_M3_PLUS'],
    ['3m_1y', 'M3_PLUS'],
    ['over_1y', 'M3_PLUS'],
    ['unknown', 'UNKNOWN'],
  ]
  for (const [duration, expected] of cases) {
    const r = { ...baseResponses(), VISIT_03_SYMPTOM_DURATION: duration }
    assert.equal(toNeckState(r, NULL_REPRO).onset_bucket, expected, `failed for duration=${duration}`)
  }
})

test('S5: pregnancy source===null (never asked, e.g. male patient) -> undefined, not a false negative', () => {
  const state = toNeckState(baseResponses(), NULL_REPRO)
  assert.equal(state.pregnancy_status, undefined)
})

test('S5: pregnancy answered pregnant:true -> YES', () => {
  const repro = { source: 'WOMEN_SAFETY_01', raw: ['pregnant'], pregnant: true, pregnancy_possible: false, postpartum_1y: false, breastfeeding: false }
  const state = toNeckState({ ...baseResponses(), ID_03: 'female' }, repro)
  assert.equal(state.pregnancy_status, 'YES')
})

test('S5: pregnancy answered [unknown] (source set, both null) -> UNKNOWN', () => {
  const repro = { source: 'WOMEN_SAFETY_01', raw: ['unknown'], pregnant: null, pregnancy_possible: null, postpartum_1y: null, breastfeeding: null }
  const state = toNeckState({ ...baseResponses(), ID_03: 'female' }, repro)
  assert.equal(state.pregnancy_status, 'UNKNOWN')
})

test('S5: pregnancy both explicitly false -> NO', () => {
  const repro = { source: 'WOMEN_SAFETY_01', raw: ['menopause'], pregnant: false, pregnancy_possible: false, postpartum_1y: false, breastfeeding: false }
  const state = toNeckState({ ...baseResponses(), ID_03: 'female' }, repro)
  assert.equal(state.pregnancy_status, 'NO')
})

// --- Summary ---

console.log(`tests/neck.spec.mjs: ${passed} passed, ${failed} failed`)
if (failed > 0) {
  for (const { name, err } of failures) {
    console.error(`\nFAIL: ${name}`)
    console.error(err.message ?? err)
  }
  process.exit(1)
}
