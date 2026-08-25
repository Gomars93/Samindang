// KNEE_V1 regression suite.
//
// Section A exercises src/spec/kneeLogic.ts's Layer-1 engine directly
// (KneeState-shaped) against KNEE_V1_Tablet_Question_Set_v0.1.md §9-13 as
// amended by KNEE_V1_Tablet_Question_Set_v0.1.1_Amendment_CLOSED_CANDIDATE.md
// §A1-A4 -- the CLOSED ground-truth safety logic (Opus final verification
// PASS / CLINICAL DECISIONS CLOSED).
//
// Section B tests src/spec/kneeAdapter.ts's toKneeState (Layer 2): enum/
// array mapping only -- KNEE_V1 has no cross-module canonical-safety reuse
// (unlike shoulderAdapter.ts), so there is no "direct reuse" verification
// needed here.
//
// Run via `npm run test:knee`.

import assert from 'node:assert/strict'
import { computeKneeFlags, kneeSafetyLocked } from './.knee-logic-bundle.mjs'
import { toKneeState } from './.knee-adapter-bundle.mjs'

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

// A fully-answered valid-negative KneeState.
const BASE_CLEAR = {
  knee_recent_trauma_or_sudden_load: 'NO',
  knee_deformity_neurovascular_screen: ['NONE'],
  knee_spontaneously_reduced_dislocation_screen: 'NO',
  knee_true_locked_extension_block: 'NO',
  knee_unilateral_leg_dvt_symptom_screen: 'NO',
  knee_septic_joint_emergency_screen: 'NO',
  knee_referred_non_knee_redflag_screen: ['NONE'],
  core_safety_already_urgent: false,
}

const clearState = (overrides = {}) => ({ ...BASE_CLEAR, ...overrides })
const status = (state) => computeKneeFlags(state).knee_safety_status
const expedited = (state) => computeKneeFlags(state).expedited_referral_consider
const fractureFlag = (state) => computeKneeFlags(state).fracture_imaging_consider
const dvtFlag = (state) => computeKneeFlags(state).dvt_assessment_required

// --- A0: valid negative baseline ---------------------------------------

test('A0: fully-answered valid-negative baseline is CLEAR', () => {
  assert.equal(status(clearState()), 'CLEAR')
})

// --- A1: KNEE_02 ---------------------------------------------------------

test('A1: KNEE_02 GROSS_DEFORMITY_OR_STILL_OUT -> URGENT_REVIEW', () => {
  assert.equal(status(clearState({ knee_deformity_neurovascular_screen: ['GROSS_DEFORMITY_OR_STILL_OUT'] })), 'URGENT_REVIEW')
})
test('A1: KNEE_02 COLD_PALE_BLUE_FOOT -> URGENT_REVIEW', () => {
  assert.equal(status(clearState({ knee_deformity_neurovascular_screen: ['COLD_PALE_BLUE_FOOT'] })), 'URGENT_REVIEW')
})
test('A1: KNEE_02 MAJOR_NEW_DISTAL_NEURO_CHANGE -> URGENT_REVIEW', () => {
  assert.equal(status(clearState({ knee_deformity_neurovascular_screen: ['MAJOR_NEW_DISTAL_NEURO_CHANGE'] })), 'URGENT_REVIEW')
})
test('A1: KNEE_02 UNKNOWN -> REVIEW_REQUIRED', () => {
  assert.equal(status(clearState({ knee_deformity_neurovascular_screen: ['UNKNOWN'] })), 'REVIEW_REQUIRED')
})
test('A1: KNEE_02 missing -> REVIEW_REQUIRED', () => {
  const s = clearState()
  delete s.knee_deformity_neurovascular_screen
  assert.equal(status(s), 'REVIEW_REQUIRED')
})
test('A1: KNEE_02 malformed (NONE+urgent concrete) -> URGENT_REVIEW, never CLEAR', () => {
  const s = clearState({ knee_deformity_neurovascular_screen: ['NONE', 'GROSS_DEFORMITY_OR_STILL_OUT'] })
  assert.equal(status(s), 'URGENT_REVIEW')
})
test('A1: KNEE_02 malformed (unrecognized value alone) -> REVIEW_REQUIRED, never CLEAR', () => {
  const s = clearState({ knee_deformity_neurovascular_screen: ['SOMETHING_ELSE'] })
  assert.equal(status(s), 'REVIEW_REQUIRED')
})

// --- A2: KNEE_02A (K2 spontaneously-reduced dislocation) ----------------

test('A2: KNEE_02A YES -> URGENT_REVIEW', () => {
  assert.equal(status(clearState({ knee_spontaneously_reduced_dislocation_screen: 'YES' })), 'URGENT_REVIEW')
})
test('A2: KNEE_02A UNKNOWN -> REVIEW_REQUIRED', () => {
  assert.equal(status(clearState({ knee_spontaneously_reduced_dislocation_screen: 'UNKNOWN' })), 'REVIEW_REQUIRED')
})
test('A2: KNEE_02A missing -> REVIEW_REQUIRED', () => {
  const s = clearState()
  delete s.knee_spontaneously_reduced_dislocation_screen
  assert.equal(status(s), 'REVIEW_REQUIRED')
})
test('A2: KNEE_02A NO -> no contribution', () => {
  assert.equal(status(clearState({ knee_spontaneously_reduced_dislocation_screen: 'NO' })), 'CLEAR')
})
test('A2: KNEE_01=NO does not suppress KNEE_02A YES -> still URGENT_REVIEW', () => {
  const s = clearState({ knee_recent_trauma_or_sudden_load: 'NO', knee_spontaneously_reduced_dislocation_screen: 'YES' })
  assert.equal(status(s), 'URGENT_REVIEW')
})

// --- A3: KNEE_03 (show_when KNEE_01 in [YES,UNKNOWN]) --------------------

test('A3: KNEE_03 YES (shown) -> REVIEW_REQUIRED + fracture_imaging_consider', () => {
  const s = clearState({ knee_recent_trauma_or_sudden_load: 'YES', knee_post_trauma_weight_bearing_failure: 'YES' })
  assert.equal(status(s), 'REVIEW_REQUIRED')
  assert.equal(fractureFlag(s), true)
})
test('A3: KNEE_03 UNKNOWN (shown) -> REVIEW_REQUIRED', () => {
  const s = clearState({ knee_recent_trauma_or_sudden_load: 'YES', knee_post_trauma_weight_bearing_failure: 'UNKNOWN' })
  assert.equal(status(s), 'REVIEW_REQUIRED')
})
test('A3: KNEE_03 missing while shown -> REVIEW_REQUIRED', () => {
  const s = clearState({ knee_recent_trauma_or_sudden_load: 'YES' })
  assert.equal(status(s), 'REVIEW_REQUIRED')
})
test('A3: KNEE_03 NO -> no contribution', () => {
  // KNEE_01=YES also shows KNEE_04 -- answer it valid-negative too, to isolate KNEE_03's own contribution.
  const s = clearState({
    knee_recent_trauma_or_sudden_load: 'YES',
    knee_post_trauma_weight_bearing_failure: 'NO',
    knee_extensor_mechanism_concern: 'NO',
  })
  assert.equal(status(s), 'CLEAR')
})
test('A3: KNEE_03 not applicable when KNEE_01=NO -- absence does not force review', () => {
  assert.equal(status(clearState({ knee_recent_trauma_or_sudden_load: 'NO' })), 'CLEAR')
})

// --- A4: KNEE_04 (extensor mechanism, show_when KNEE_01 in [YES,UNKNOWN]) --

test('A4: KNEE_04 YES (shown) -> REVIEW_REQUIRED + expedited, never URGENT', () => {
  const s = clearState({ knee_recent_trauma_or_sudden_load: 'YES', knee_extensor_mechanism_concern: 'YES' })
  assert.equal(status(s), 'REVIEW_REQUIRED')
  assert.equal(expedited(s), true)
})
test('A4: KNEE_04 UNKNOWN (shown) -> REVIEW_REQUIRED + expedited', () => {
  const s = clearState({ knee_recent_trauma_or_sudden_load: 'YES', knee_extensor_mechanism_concern: 'UNKNOWN' })
  assert.equal(status(s), 'REVIEW_REQUIRED')
  assert.equal(expedited(s), true)
})
test('A4: KNEE_04 missing while shown -> REVIEW_REQUIRED, but expedited stays false', () => {
  const s = clearState({ knee_recent_trauma_or_sudden_load: 'YES' })
  assert.equal(status(s), 'REVIEW_REQUIRED')
  assert.equal(expedited(s), false)
})
test('A4: KNEE_04 never auto-escalates to URGENT_REVIEW even when YES', () => {
  const s = clearState({ knee_recent_trauma_or_sudden_load: 'YES', knee_extensor_mechanism_concern: 'YES' })
  assert.notEqual(status(s), 'URGENT_REVIEW')
})

// --- A5: KNEE_05 (true locked knee, unconditional) -----------------------

test('A5: KNEE_05 YES -> REVIEW_REQUIRED + expedited', () => {
  const s = clearState({ knee_true_locked_extension_block: 'YES' })
  assert.equal(status(s), 'REVIEW_REQUIRED')
  assert.equal(expedited(s), true)
})
test('A5: KNEE_05 UNKNOWN -> REVIEW_REQUIRED + expedited', () => {
  const s = clearState({ knee_true_locked_extension_block: 'UNKNOWN' })
  assert.equal(status(s), 'REVIEW_REQUIRED')
  assert.equal(expedited(s), true)
})
test('A5: KNEE_05 missing -> REVIEW_REQUIRED, expedited stays false', () => {
  const s = clearState()
  delete s.knee_true_locked_extension_block
  assert.equal(status(s), 'REVIEW_REQUIRED')
  assert.equal(expedited(s), false)
})
test('A5: KNEE_05 never auto-escalates to URGENT_REVIEW', () => {
  assert.notEqual(status(clearState({ knee_true_locked_extension_block: 'YES' })), 'URGENT_REVIEW')
})

// --- A6: DVT combined-condition -- critical regression (K5/Amendment A1) --

test('A6 CRITICAL: KNEE_06 YES + KNEE_06A [NONE] + KNEE_06B [NONE], all else clean -> CLEAR, dvt flag false', () => {
  const s = clearState({
    knee_unilateral_leg_dvt_symptom_screen: 'YES',
    knee_dvt_risk_context: ['NONE'],
    knee_dvt_pe_associated_screen: ['NONE'],
  })
  assert.equal(status(s), 'CLEAR')
  assert.equal(dvtFlag(s), false)
})
test('A6: KNEE_06 YES + KNEE_06A concrete risk -> REVIEW_REQUIRED + dvt flag true', () => {
  const s = clearState({
    knee_unilateral_leg_dvt_symptom_screen: 'YES',
    knee_dvt_risk_context: ['PRIOR_DVT_OR_PE'],
    knee_dvt_pe_associated_screen: ['NONE'],
  })
  assert.equal(status(s), 'REVIEW_REQUIRED')
  assert.equal(dvtFlag(s), true)
})
test('A6: KNEE_06 YES + KNEE_06A UNKNOWN -> REVIEW_REQUIRED + dvt flag true', () => {
  const s = clearState({
    knee_unilateral_leg_dvt_symptom_screen: 'YES',
    knee_dvt_risk_context: ['UNKNOWN'],
    knee_dvt_pe_associated_screen: ['NONE'],
  })
  assert.equal(status(s), 'REVIEW_REQUIRED')
  assert.equal(dvtFlag(s), true)
})
test('A6: KNEE_06 YES + KNEE_06A missing -> REVIEW_REQUIRED + dvt flag true', () => {
  const s = clearState({ knee_unilateral_leg_dvt_symptom_screen: 'YES', knee_dvt_pe_associated_screen: ['NONE'] })
  assert.equal(status(s), 'REVIEW_REQUIRED')
  assert.equal(dvtFlag(s), true)
})
test('A6: KNEE_06 UNKNOWN -> REVIEW_REQUIRED + dvt flag true, regardless of KNEE_06A', () => {
  const s1 = clearState({ knee_unilateral_leg_dvt_symptom_screen: 'UNKNOWN', knee_dvt_risk_context: ['NONE'] })
  assert.equal(status(s1), 'REVIEW_REQUIRED')
  assert.equal(dvtFlag(s1), true)
})
test('A6: KNEE_06 missing -> REVIEW_REQUIRED + dvt flag true', () => {
  const s = clearState()
  delete s.knee_unilateral_leg_dvt_symptom_screen
  assert.equal(status(s), 'REVIEW_REQUIRED')
  assert.equal(dvtFlag(s), true)
})
test('A6: KNEE_06 NO -> no contribution, dvt flag false', () => {
  const s = clearState({ knee_unilateral_leg_dvt_symptom_screen: 'NO' })
  assert.equal(status(s), 'CLEAR')
  assert.equal(dvtFlag(s), false)
})

// --- A7: KNEE_06B PE-type cross-check (C2: no double-barreled gate) ------

test('A7: KNEE_06B CHEST_PAIN_OR_TIGHTNESS -> URGENT_REVIEW', () => {
  const s = clearState({ knee_unilateral_leg_dvt_symptom_screen: 'YES', knee_dvt_risk_context: ['NONE'], knee_dvt_pe_associated_screen: ['CHEST_PAIN_OR_TIGHTNESS'] })
  assert.equal(status(s), 'URGENT_REVIEW')
})
test('A7: KNEE_06B SHORTNESS_OF_BREATH -> URGENT_REVIEW', () => {
  const s = clearState({ knee_unilateral_leg_dvt_symptom_screen: 'YES', knee_dvt_risk_context: ['NONE'], knee_dvt_pe_associated_screen: ['SHORTNESS_OF_BREATH'] })
  assert.equal(status(s), 'URGENT_REVIEW')
})
test('A7: KNEE_06B HEMOPTYSIS -> URGENT_REVIEW', () => {
  const s = clearState({ knee_unilateral_leg_dvt_symptom_screen: 'YES', knee_dvt_risk_context: ['NONE'], knee_dvt_pe_associated_screen: ['HEMOPTYSIS'] })
  assert.equal(status(s), 'URGENT_REVIEW')
})
test('A7: KNEE_06B fires URGENT even when KNEE_06A is explicit [NONE] -- no AND gate suppresses it', () => {
  const s = clearState({
    knee_unilateral_leg_dvt_symptom_screen: 'YES',
    knee_dvt_risk_context: ['NONE'],
    knee_dvt_pe_associated_screen: ['SHORTNESS_OF_BREATH'],
  })
  assert.equal(status(s), 'URGENT_REVIEW')
})
test('A7: KNEE_06B UNKNOWN (shown) -> REVIEW_REQUIRED, not urgent', () => {
  const s = clearState({ knee_unilateral_leg_dvt_symptom_screen: 'YES', knee_dvt_risk_context: ['NONE'], knee_dvt_pe_associated_screen: ['UNKNOWN'] })
  assert.equal(status(s), 'REVIEW_REQUIRED')
})
test('A7: KNEE_06B missing while shown -> REVIEW_REQUIRED', () => {
  const s = clearState({ knee_unilateral_leg_dvt_symptom_screen: 'YES', knee_dvt_risk_context: ['NONE'] })
  assert.equal(status(s), 'REVIEW_REQUIRED')
})
test('A7: KNEE_06B not applicable when KNEE_06=NO', () => {
  assert.equal(status(clearState({ knee_unilateral_leg_dvt_symptom_screen: 'NO' })), 'CLEAR')
})

// --- A8: KNEE_07 septic (K1) ----------------------------------------------

test('A8: KNEE_07 YES -> URGENT_REVIEW', () => {
  assert.equal(status(clearState({ knee_septic_joint_emergency_screen: 'YES' })), 'URGENT_REVIEW')
})
test('A8: KNEE_07 UNKNOWN -> REVIEW_REQUIRED', () => {
  assert.equal(status(clearState({ knee_septic_joint_emergency_screen: 'UNKNOWN' })), 'REVIEW_REQUIRED')
})
test('A8: KNEE_07 missing -> REVIEW_REQUIRED', () => {
  const s = clearState()
  delete s.knee_septic_joint_emergency_screen
  assert.equal(status(s), 'REVIEW_REQUIRED')
})

// --- A9: KNEE_08 referred/non-knee (K9) -----------------------------------

test('A9: KNEE_08 NEW_SENSORY_CHANGE -> REVIEW_REQUIRED, not urgent', () => {
  const s = clearState({ knee_referred_non_knee_redflag_screen: ['NEW_SENSORY_CHANGE'] })
  assert.equal(status(s), 'REVIEW_REQUIRED')
})
test('A9: KNEE_08 NEW_WEAKNESS -> REVIEW_REQUIRED, not urgent', () => {
  assert.equal(status(clearState({ knee_referred_non_knee_redflag_screen: ['NEW_WEAKNESS'] })), 'REVIEW_REQUIRED')
})
test('A9: KNEE_08 NEW_BLADDER_BOWEL_CONTROL_CHANGE -> REVIEW_REQUIRED, not urgent', () => {
  assert.equal(status(clearState({ knee_referred_non_knee_redflag_screen: ['NEW_BLADDER_BOWEL_CONTROL_CHANGE'] })), 'REVIEW_REQUIRED')
})
test('A9 (K9/Amendment A2): KNEE_08 hip/groin/weight-bearing option -> REVIEW_REQUIRED + fracture_imaging_consider, no new tier', () => {
  const s = clearState({
    knee_referred_non_knee_redflag_screen: ['NEW_HIP_GROIN_PAIN_OR_WEIGHT_BEARING_DIFFICULTY_NOT_EXPLAINED_BY_KNEE'],
  })
  assert.equal(status(s), 'REVIEW_REQUIRED')
  assert.notEqual(status(s), 'URGENT_REVIEW')
  assert.equal(fractureFlag(s), true)
})
test('A9: KNEE_08 UNKNOWN -> REVIEW_REQUIRED', () => {
  assert.equal(status(clearState({ knee_referred_non_knee_redflag_screen: ['UNKNOWN'] })), 'REVIEW_REQUIRED')
})
test('A9: KNEE_08 missing -> REVIEW_REQUIRED', () => {
  const s = clearState()
  delete s.knee_referred_non_knee_redflag_screen
  assert.equal(status(s), 'REVIEW_REQUIRED')
})
test('A9: KNEE_08 malformed (NONE+concrete) -> REVIEW_REQUIRED, never CLEAR', () => {
  const s = clearState({ knee_referred_non_knee_redflag_screen: ['NONE', 'NEW_WEAKNESS'] })
  assert.equal(status(s), 'REVIEW_REQUIRED')
})
test('A9: KNEE_08 [NONE] -> no contribution', () => {
  assert.equal(status(clearState({ knee_referred_non_knee_redflag_screen: ['NONE'] })), 'CLEAR')
})

// --- A10: Core urgent passthrough -----------------------------------------

test('A10: core_safety_already_urgent=true alone -> URGENT_REVIEW', () => {
  assert.equal(status(clearState({ core_safety_already_urgent: true })), 'URGENT_REVIEW')
})

// --- A11: locks ------------------------------------------------------------

test('A11: locks -- CLEAR is not locked', () => {
  assert.equal(kneeSafetyLocked(computeKneeFlags(clearState())), false)
})
test('A11: locks -- REVIEW_REQUIRED is locked', () => {
  assert.equal(kneeSafetyLocked(computeKneeFlags(clearState({ knee_septic_joint_emergency_screen: 'UNKNOWN' }))), true)
})
test('A11: locks -- URGENT_REVIEW is locked', () => {
  assert.equal(kneeSafetyLocked(computeKneeFlags(clearState({ knee_septic_joint_emergency_screen: 'YES' }))), true)
})

// --- Section B: adapter (toKneeState) enum/array mapping -------------------

const baseResponses = () => ({
  KNEE_01: 'NO',
  KNEE_02: ['NONE'],
  KNEE_02A: 'NO',
  KNEE_05: 'NO',
  KNEE_06: 'NO',
  KNEE_07: 'NO',
  KNEE_08: ['NONE'],
})

test('B1: raw KNEE_0x fields map onto the matching KneeState keys', () => {
  const r = { ...baseResponses(), KNEE_01: 'YES', KNEE_02: ['COLD_PALE_BLUE_FOOT'], KNEE_03: 'YES', KNEE_04: 'UNKNOWN' }
  const state = toKneeState(r, false)
  assert.equal(state.knee_recent_trauma_or_sudden_load, 'YES')
  assert.deepEqual(state.knee_deformity_neurovascular_screen, ['COLD_PALE_BLUE_FOOT'])
  assert.equal(state.knee_post_trauma_weight_bearing_failure, 'YES')
  assert.equal(state.knee_extensor_mechanism_concern, 'UNKNOWN')
})

test('B2: multi-choice fields stay arrays', () => {
  const r = { ...baseResponses(), KNEE_06: 'YES', KNEE_06A: ['PRIOR_DVT_OR_PE'], KNEE_06B: ['NONE'] }
  const state = toKneeState(r, false)
  assert.deepEqual(state.knee_dvt_risk_context, ['PRIOR_DVT_OR_PE'])
  assert.deepEqual(state.knee_dvt_pe_associated_screen, ['NONE'])
})

test('B3: absent fields stay undefined, not null', () => {
  const state = toKneeState({}, false)
  assert.equal(state.knee_recent_trauma_or_sudden_load, undefined)
  assert.equal(state.knee_deformity_neurovascular_screen, undefined)
})

test('B4: core_safety_already_urgent passes through unchanged', () => {
  assert.equal(toKneeState(baseResponses(), true).core_safety_already_urgent, true)
  assert.equal(toKneeState(baseResponses(), false).core_safety_already_urgent, false)
})

test('B5: adapter output feeds the engine end-to-end (KNEE_02A YES -> URGENT_REVIEW via real adapter)', () => {
  const r = { ...baseResponses(), KNEE_02A: 'YES' }
  const state = toKneeState(r, false)
  assert.equal(computeKneeFlags(state).knee_safety_status, 'URGENT_REVIEW')
})

// --- Summary ---

console.log(`tests/knee.spec.mjs: ${passed} passed, ${failed} failed`)
if (failed > 0) {
  for (const { name, err } of failures) {
    console.error(`\nFAIL: ${name}`)
    console.error(err.message ?? err)
  }
  process.exit(1)
}
