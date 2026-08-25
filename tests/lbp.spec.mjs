// LBP_V1 regression suite.
//
// Section A ports tablet-core/tests/test_lbp_logic.py's 23-item checklist
// (LBP_v1.4_임상결정_마감본.md §11) 1:1 against src/spec/lbpLogic.ts's
// Layer-1 functions (LbpState-shaped, field names identical to the Python
// source) -- this is the ground-truth safety-logic regression.
//
// Section B tests src/spec/lbpAdapter.ts's toLbpState (Layer 2) -- the
// enum-case-mapping / MISSING-contract / pregnancy-mapping translation risk
// that Opus review flagged (S1/S2/S4) and that Section A's LbpState-level
// tests cannot see on their own, since they bypass the adapter entirely.
//
// Run via `npm run test:lbp` (bundles lbpLogic.ts/lbpAdapter.ts with
// esbuild first, matching every other test:* script's convention).

import assert from 'node:assert/strict'
import {
  computeLbpFlags,
  diseaseSafetyLocked,
  treatmentSafetyLocked,
} from './.lbp-logic-bundle.mjs'
import { toLbpState } from './.lbp-adapter-bundle.mjs'

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

// clear_state() equivalent from test_lbp_logic.py.
const BASE_CLEAR = {
  lbp_ces_screen: ['NONE'],
  lbp_current_redflag_screen: ['NONE'],
  lbp_trauma_safety: 'NO',
  major_history_present: 'NO',
  lbp_leg_side: 'NONE',
  lbp_leg_neuro_symptoms: ['NONE'],
}

const clearState = (overrides = {}) => ({ ...BASE_CLEAR, ...overrides })
const safetyStatus = (state) => computeLbpFlags(state).lbp_safety_status
const treatmentSafetyStatus = (state) => computeLbpFlags(state).treatment_safety_status

// --- Section A: literal port regression (test_lbp_logic.py 1:1) -----------

// --- item 1: CES positive -> URGENT_REVIEW ---
test('item1: CES positive is urgent review', () => {
  assert.equal(safetyStatus(clearState({ lbp_ces_screen: ['SADDLE_SENSORY_CHANGE'] })), 'URGENT_REVIEW')
})

// --- item 2/3/4: CES UNKNOWN/missing/malformed never CLEAR ---
test('item2: CES unknown never clear', () => {
  assert.notEqual(safetyStatus(clearState({ lbp_ces_screen: ['UNKNOWN'] })), 'CLEAR')
})

test('item3: CES missing never clear', () => {
  const state = clearState()
  delete state.lbp_ces_screen
  assert.notEqual(safetyStatus(state), 'CLEAR')
})

test('item4: CES malformed states never clear', () => {
  const badValues = [[], ['NONE', 'UNKNOWN'], ['UNKNOWN', 'NONE'], ['NONE', 'URINARY_RETENTION'], 'UNKNOWN']
  for (const bad of badValues) {
    assert.notEqual(safetyStatus(clearState({ lbp_ces_screen: bad })), 'CLEAR', `failed for ${JSON.stringify(bad)}`)
  }
  // a bare urgent string must still be caught as urgent, not merely non-clear
  assert.equal(safetyStatus(clearState({ lbp_ces_screen: 'URINARY_RETENTION' })), 'URGENT_REVIEW')
})

// --- item 5/6: bilateral + neuro vs bilateral alone ---
test('item5: bilateral with concrete neuro requires review', () => {
  const state = clearState({ lbp_leg_side: 'BILATERAL', lbp_leg_neuro_symptoms: ['NUMBNESS'] })
  assert.equal(safetyStatus(state), 'REVIEW_REQUIRED')
})

test('item6: bilateral pain alone no automatic urgent, sets neuro baseline', () => {
  const state = clearState({ lbp_leg_side: 'BILATERAL', lbp_leg_neuro_symptoms: ['NONE'] })
  assert.equal(safetyStatus(state), 'CLEAR') // not auto-escalated
  assert.equal(computeLbpFlags(state).lbp_neuro_baseline_required, true) // but flagged for clinician baseline exam
})

test('neuro baseline not required when not bilateral', () => {
  const state = clearState({ lbp_leg_side: 'RIGHT', lbp_leg_neuro_symptoms: ['NONE'] })
  assert.equal(computeLbpFlags(state).lbp_neuro_baseline_required, false)
})

// --- item 7: objective severe/progressive motor deficit -> URGENT_REVIEW ---
test('item7: objective severe/progressive deficit is urgent', () => {
  const state = clearState({ clinician_objective_motor_deficit: 'SEVERE_OR_PROGRESSIVE' })
  assert.equal(safetyStatus(state), 'URGENT_REVIEW')
})

test('objective deficit none/unassessed does not force urgent', () => {
  assert.equal(safetyStatus(clearState({ clinician_objective_motor_deficit: 'NONE' })), 'CLEAR')
  assert.equal(safetyStatus(clearState()), 'CLEAR') // not yet assessed (missing) is not itself urgent
})

test('objective deficit independent of CES', () => {
  // CES clear but clinician found severe objective deficit on exam -> still urgent
  const state = clearState({ lbp_ces_screen: ['NONE'], clinician_objective_motor_deficit: 'SEVERE_OR_PROGRESSIVE' })
  assert.equal(safetyStatus(state), 'URGENT_REVIEW')
})

// --- item 8: trauma reachable (this app has no onset_pattern -- see
// lbpLogic.ts's LbpState doc comment; trauma escalation is entirely via
// lbp_trauma_safety here) ---
test('item8: trauma yes requires review', () => {
  const state = clearState({ lbp_trauma_safety: 'YES' })
  assert.equal(safetyStatus(state), 'REVIEW_REQUIRED')
})

test('item8: trauma missing (never answered) fails closed to review', () => {
  const state = clearState()
  delete state.lbp_trauma_safety
  assert.equal(safetyStatus(state), 'REVIEW_REQUIRED')
})

test('item8: trauma unknown requires review', () => {
  assert.equal(safetyStatus(clearState({ lbp_trauma_safety: 'UNKNOWN' })), 'REVIEW_REQUIRED')
})

// --- item 9: unexplained weight loss ---
test('item9: weight loss yes requires review', () => {
  assert.equal(safetyStatus(clearState({ lbp_current_redflag_screen: ['UNEXPLAINED_WEIGHT_LOSS'] })), 'REVIEW_REQUIRED')
})

test('item9: weight loss unknown requires review', () => {
  assert.equal(safetyStatus(clearState({ lbp_current_redflag_screen: ['UNKNOWN'] })), 'REVIEW_REQUIRED')
})

// --- item 10: infection/procedure risk ---
test('item10: infection/procedure risk requires review', () => {
  assert.equal(
    safetyStatus(clearState({ lbp_current_redflag_screen: ['RECENT_SPINAL_PROCEDURE_OR_INJECTION'] })),
    'REVIEW_REQUIRED',
  )
})

test('item10: infection/procedure unknown requires review', () => {
  assert.equal(safetyStatus(clearState({ lbp_current_redflag_screen: ['UNKNOWN'] })), 'REVIEW_REQUIRED')
})

// --- item 11: age alone never triggers review ---
test('item11: age alone does not force review', () => {
  const state = clearState({ patient_age: 80 })
  assert.equal(safetyStatus(state), 'CLEAR')
  assert.equal(computeLbpFlags(state).lbp_fracture_risk_age_modifier, true) // informational only
  assert.equal(computeLbpFlags(state).lbp_malignancy_risk_age_modifier, true) // informational only
})

test('age modifiers correct thresholds', () => {
  assert.equal(computeLbpFlags({ patient_age: 75 }).lbp_fracture_risk_age_modifier, true)
  assert.equal(computeLbpFlags({ patient_age: 74 }).lbp_fracture_risk_age_modifier, false)
  assert.equal(computeLbpFlags({ patient_age: 51 }).lbp_malignancy_risk_age_modifier, true)
  assert.equal(computeLbpFlags({ patient_age: 50 }).lbp_malignancy_risk_age_modifier, false)
})

// --- item 12: inflammatory UNKNOWN never NO ---
test('item12: inflammatory eligible unknown onset_bucket stays unknown', () => {
  assert.equal(computeLbpFlags({ onset_bucket: 'UNKNOWN', patient_age: 32 }).lbp_inflammatory_eligible, 'UNKNOWN')
})

test('item12: inflammatory eligible missing onset_bucket stays unknown', () => {
  assert.equal(computeLbpFlags({ patient_age: 32 }).lbp_inflammatory_eligible, 'UNKNOWN')
})

test('inflammatory eligible age boundary still correct', () => {
  assert.equal(computeLbpFlags({ onset_bucket: 'M3_PLUS', patient_age: 44 }).lbp_inflammatory_eligible, 'YES')
  assert.equal(computeLbpFlags({ onset_bucket: 'M3_PLUS', patient_age: 45 }).lbp_inflammatory_eligible, 'UNKNOWN')
  assert.equal(
    computeLbpFlags({ onset_bucket: 'M3_PLUS', patient_age: 45, lbp_onset_before_45: 'NO' }).lbp_inflammatory_eligible,
    'NO',
  )
})

// --- item 13: formal NG65 count removed (no such computation exists) ---
test('item13: no formal criteria-count export exists', async () => {
  const mod = await import('./.lbp-logic-bundle.mjs')
  assert.equal('inflammatoryCriteriaCount' in mod, false)
  assert.equal('ng65CriteriaCount' in mod, false)
})

test('inflammatory pattern consider is boolean not a count', () => {
  const state = {
    onset_bucket: 'M3_PLUS',
    patient_age: 30,
    lbp_inflammatory_screen: ['SECOND_HALF_NIGHT_WAKING', 'BUTTOCK_PAIN'],
  }
  const result = computeLbpFlags(state).lbp_inflammatory_pattern_consider
  assert.equal(result, true)
  assert.equal(typeof result, 'boolean')
})

test('inflammatory pattern consider false when not eligible', () => {
  assert.equal(
    computeLbpFlags({ onset_bucket: 'NOT_M3_PLUS', patient_age: 30 }).lbp_inflammatory_pattern_consider,
    false,
  )
})

test('inflammatory pattern consider false when no supporting feature', () => {
  const state = { onset_bucket: 'M3_PLUS', patient_age: 30, lbp_inflammatory_screen: ['NONE'] }
  assert.equal(computeLbpFlags(state).lbp_inflammatory_pattern_consider, false)
})

// --- item 14/15/16: pregnancy / treatment safety, kept separate from disease safety ---
test('item14: pregnancy gate reachable for F/OTHER/UNKNOWN age 10-55', () => {
  for (const sex of ['F', 'OTHER', 'UNKNOWN']) {
    const state = { patient_sex: sex, patient_age: 30, pregnancy_status: 'UNKNOWN' }
    assert.equal(treatmentSafetyStatus(state), 'REVIEW_REQUIRED', `failed for sex=${sex}`)
  }
})

test('item15: pregnancy male skip is clear, not a gap', () => {
  const state = { patient_sex: 'M', patient_age: 30 } // pregnancy_status never asked -> undefined
  assert.equal(treatmentSafetyStatus(state), 'CLEAR')
})

test('pregnancy applicable but unanswered fails closed', () => {
  const state = { patient_sex: 'F', patient_age: 30 } // applicable, but not yet answered
  assert.equal(treatmentSafetyStatus(state), 'REVIEW_REQUIRED')
})

test('item16: pregnancy drives treatment safety, not disease safety', () => {
  // A patient with a fully CLEAR disease-safety picture but positive
  // pregnancy status must stay disease-CLEAR; only treatment safety flips.
  const state = clearState({ pregnancy_status: 'YES', patient_sex: 'F', patient_age: 28 })
  const flags = computeLbpFlags(state)
  assert.equal(flags.lbp_safety_status, 'CLEAR')
  assert.equal(flags.treatment_safety_status, 'REVIEW_REQUIRED')
  assert.equal(diseaseSafetyLocked(flags), false)
  assert.equal(treatmentSafetyLocked(flags), true)
})

// --- item 17/18: lock functions, fail closed ---
test('item17: disease safety locked when not clear', () => {
  const flags = computeLbpFlags(clearState({ lbp_ces_screen: ['SADDLE_SENSORY_CHANGE'] }))
  assert.equal(diseaseSafetyLocked(flags), true)
})

test('item17: disease safety unlocked only when genuinely clear', () => {
  assert.equal(diseaseSafetyLocked(computeLbpFlags(clearState())), false)
})

test('item18: missing safety state locks, does not unlock', () => {
  const state = clearState()
  delete state.lbp_ces_screen // never answered
  assert.equal(diseaseSafetyLocked(computeLbpFlags(state)), true)
})

test('treatment safety locked matches status', () => {
  assert.equal(treatmentSafetyLocked(computeLbpFlags({ patient_sex: 'M', patient_age: 30 })), false)
  assert.equal(
    treatmentSafetyLocked(computeLbpFlags({ patient_sex: 'F', patient_age: 30, pregnancy_status: 'POSSIBLE' })),
    true,
  )
})

// --- major-history incomplete-answer guard ---
test('major history present yes but categories missing requires review', () => {
  const state = clearState({ major_history_present: 'YES' }) // categories not yet answered
  assert.equal(safetyStatus(state), 'REVIEW_REQUIRED')
})

test('major history cancer requires review', () => {
  const state = clearState({ major_history_present: 'YES', major_history_categories: ['CANCER'] })
  assert.equal(safetyStatus(state), 'REVIEW_REQUIRED')
})

// --- items 19/20/21/22 are UI/spec-level, not lbpLogic.ts-level; see
// tests/doctor.spec.mjs / tests/layout-budget.spec.mjs extensions (plan
// §12) for where those actually get asserted. ---

// --- Section B: adapter (toLbpState) regression -- Opus review S1/S2/S4 ---

// Minimal fake Responses covering only what toLbpState reads. `repro` is
// the ReproductiveStatus shape coreSpec.ts's deriveReproductiveStatus
// produces (passed in directly per the plan's circular-import fix -- see
// lbpAdapter.ts's top comment).
const NULL_REPRO = { source: null, raw: null, pregnant: null, pregnancy_possible: null, postpartum_1y: null, breastfeeding: null }
const baseResponses = () => ({
  LBP_04: ['NONE'],
  LBP_05: ['NONE'],
  LBP_06: 'NO',
  LBP_03: 'NONE',
  LBP_02: ['NONE'],
  HISTORY_01: ['none'],
  ID_03: 'male',
  VISIT_03_SYMPTOM_DURATION: 'within_1w',
})

test('S1: HISTORY_01 lowercase cancer maps to uppercase CANCER end-to-end', () => {
  const r = { ...baseResponses(), HISTORY_01: ['cancer'] }
  const state = toLbpState(r, NULL_REPRO, undefined, undefined)
  assert.deepEqual(state.major_history_categories, ['CANCER'])
  assert.equal(state.major_history_present, 'YES')
  assert.equal(safetyStatus(state), 'REVIEW_REQUIRED')
})

test('S1: HISTORY_01 lowercase osteoporosis maps to uppercase OSTEOPOROSIS end-to-end', () => {
  const r = { ...baseResponses(), HISTORY_01: ['osteoporosis'] }
  const state = toLbpState(r, NULL_REPRO, undefined, undefined)
  assert.deepEqual(state.major_history_categories, ['OSTEOPOROSIS'])
  assert.equal(safetyStatus(state), 'REVIEW_REQUIRED')
})

test('S1: HISTORY_01 none maps to major_history_present NO, empty categories', () => {
  const r = baseResponses()
  const state = toLbpState(r, NULL_REPRO, undefined, undefined)
  assert.equal(state.major_history_present, 'NO')
  assert.deepEqual(state.major_history_categories, [])
})

test('S1: ID_03 female/male maps to F/M', () => {
  assert.equal(toLbpState({ ...baseResponses(), ID_03: 'female' }, NULL_REPRO, undefined, undefined).patient_sex, 'F')
  assert.equal(toLbpState({ ...baseResponses(), ID_03: 'male' }, NULL_REPRO, undefined, undefined).patient_sex, 'M')
})

test('onset_bucket mapping from VISIT_03_SYMPTOM_DURATION', () => {
  const map = { within_1w: 'NOT_M3_PLUS', '1w_1m': 'NOT_M3_PLUS', '1_3m': 'NOT_M3_PLUS', '3m_1y': 'M3_PLUS', over_1y: 'M3_PLUS', unknown: 'UNKNOWN' }
  for (const [duration, expected] of Object.entries(map)) {
    const r = { ...baseResponses(), VISIT_03_SYMPTOM_DURATION: duration }
    assert.equal(toLbpState(r, NULL_REPRO, undefined, undefined).onset_bucket, expected, `failed for duration=${duration}`)
  }
})

test('S4: pregnancy source null (never asked, e.g. male patient) -> undefined -> treatment CLEAR', () => {
  const state = toLbpState(baseResponses(), NULL_REPRO, undefined, undefined)
  assert.equal(state.pregnancy_status, undefined)
  assert.equal(treatmentSafetyStatus({ ...state, patient_sex: 'M', patient_age: 30 }), 'CLEAR')
})

test('S4: pregnancy answered [unknown] (source set, pregnant/possible both null) -> UNKNOWN -> REVIEW_REQUIRED', () => {
  const repro = { source: 'WOMEN_SAFETY_01', raw: ['unknown'], pregnant: null, pregnancy_possible: null, postpartum_1y: null, breastfeeding: null }
  const r = { ...baseResponses(), ID_03: 'female' }
  const state = toLbpState(r, repro, undefined, 30)
  assert.equal(state.pregnancy_status, 'UNKNOWN')
  assert.equal(treatmentSafetyStatus(state), 'REVIEW_REQUIRED')
})

test('S4: pregnancy answered pregnant:true -> YES -> REVIEW_REQUIRED', () => {
  const repro = { source: 'WOMEN_SAFETY_01', raw: ['pregnant'], pregnant: true, pregnancy_possible: false, postpartum_1y: false, breastfeeding: false }
  const state = toLbpState({ ...baseResponses(), ID_03: 'female' }, repro, undefined, 28)
  assert.equal(state.pregnancy_status, 'YES')
  assert.equal(treatmentSafetyStatus(state), 'REVIEW_REQUIRED')
})

test('S4: pregnancy answered none/menopause only (both explicitly false) -> NO -> CLEAR', () => {
  const repro = { source: 'WOMEN_SAFETY_01', raw: ['menopause'], pregnant: false, pregnancy_possible: false, postpartum_1y: false, breastfeeding: false }
  const state = toLbpState({ ...baseResponses(), ID_03: 'female' }, repro, undefined, 55)
  assert.equal(state.pregnancy_status, 'NO')
  assert.equal(treatmentSafetyStatus(state), 'CLEAR')
})

test('S2: MISSING patient_age (undefined) never coerces into a false age comparison', () => {
  // patient_age undefined must resolve inflammatory_eligible to UNKNOWN, not
  // silently behave like age=0 (which would wrongly satisfy age<45 -> YES).
  const state = toLbpState({ ...baseResponses(), VISIT_03_SYMPTOM_DURATION: '3m_1y' }, NULL_REPRO, undefined, undefined)
  assert.equal(state.patient_age, undefined)
  assert.equal(computeLbpFlags(state).lbp_inflammatory_eligible, 'UNKNOWN')
})

// --- Summary ---

console.log(`tests/lbp.spec.mjs: ${passed} passed, ${failed} failed`)
if (failed > 0) {
  for (const { name, err } of failures) {
    console.error(`\nFAIL: ${name}`)
    console.error(err.message ?? err)
  }
  process.exit(1)
}
