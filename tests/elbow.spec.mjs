// ELBOW_V1 regression suite.
//
// Section A exercises src/spec/elbowLogic.ts's Layer-1 engine directly
// (ElbowState-shaped) against ELBOW_V1_Tablet_Question_Set_v0.1.1.md §3-11
// -- the CLOSED ground-truth safety logic (Opus final verification PASS /
// CLINICAL DECISIONS CLOSED).
//
// Section B tests src/spec/elbowAdapter.ts's toElbowState (Layer 2): enum/
// array mapping only -- ELBOW_V1 has no cross-module canonical-safety reuse
// (unlike shoulderAdapter.ts), so there is no "direct reuse" verification
// needed here, but there IS a dedicated check that ELBOW_00 never leaks
// into ElbowState (the F1-style routing/safety separation invariant).
//
// Run via `npm run test:elbow`.

import assert from 'node:assert/strict'
import { computeElbowFlags, elbowSafetyLocked } from './.elbow-logic-bundle.mjs'
import { toElbowState } from './.elbow-adapter-bundle.mjs'

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

// A fully-answered valid-negative ElbowState.
const BASE_CLEAR = {
  elbow_recent_trauma_or_sudden_load: 'NO',
  elbow_deformity_neurovascular_screen: ['NONE'],
  elbow_spontaneously_reduced_dislocation_screen: 'NO',
  elbow_true_locked_rom_block: 'NO',
  elbow_septic_joint_emergency_screen: 'NO',
  elbow_posterior_bursal_screen: 'NONE',
  elbow_ulnar_sensory_screen: 'NO',
  elbow_referred_proximal_screen: ['NONE'],
  elbow_cardiac_associated_screen: ['NONE'],
  core_safety_already_urgent: false,
}

const clearState = (overrides = {}) => ({ ...BASE_CLEAR, ...overrides })
const status = (state) => computeElbowFlags(state).elbow_safety_status
const fractureFlag = (state) => computeElbowFlags(state).fracture_imaging_consider
const expedited = (state) => computeElbowFlags(state).expedited_referral_consider
const neuroFlag = (state) => computeElbowFlags(state).neuro_assessment_required
const infectionFlag = (state) => computeElbowFlags(state).infection_assessment_required

// --- A0: valid negative baseline ---------------------------------------

test('A0: fully-answered valid-negative baseline is CLEAR', () => {
  assert.equal(status(clearState()), 'CLEAR')
})

// --- A1: ELBOW_02 ---------------------------------------------------------

test('A1: ELBOW_02 GROSS_DEFORMITY_OR_STILL_OUT -> URGENT_REVIEW', () => {
  assert.equal(status(clearState({ elbow_deformity_neurovascular_screen: ['GROSS_DEFORMITY_OR_STILL_OUT'] })), 'URGENT_REVIEW')
})
test('A1: ELBOW_02 COLD_PALE_BLUE_HAND -> URGENT_REVIEW', () => {
  assert.equal(status(clearState({ elbow_deformity_neurovascular_screen: ['COLD_PALE_BLUE_HAND'] })), 'URGENT_REVIEW')
})
test('A1: ELBOW_02 MAJOR_NEW_DISTAL_NEURO_CHANGE -> URGENT_REVIEW', () => {
  assert.equal(status(clearState({ elbow_deformity_neurovascular_screen: ['MAJOR_NEW_DISTAL_NEURO_CHANGE'] })), 'URGENT_REVIEW')
})
test('A1: ELBOW_02 UNKNOWN -> REVIEW_REQUIRED', () => {
  assert.equal(status(clearState({ elbow_deformity_neurovascular_screen: ['UNKNOWN'] })), 'REVIEW_REQUIRED')
})
test('A1: ELBOW_02 missing -> REVIEW_REQUIRED', () => {
  const s = clearState()
  delete s.elbow_deformity_neurovascular_screen
  assert.equal(status(s), 'REVIEW_REQUIRED')
})
test('A1: ELBOW_02 malformed (NONE+urgent concrete) -> URGENT_REVIEW, never CLEAR', () => {
  const s = clearState({ elbow_deformity_neurovascular_screen: ['NONE', 'GROSS_DEFORMITY_OR_STILL_OUT'] })
  assert.equal(status(s), 'URGENT_REVIEW')
})
test('A1: ELBOW_02 malformed (unrecognized value alone) -> REVIEW_REQUIRED, never CLEAR', () => {
  const s = clearState({ elbow_deformity_neurovascular_screen: ['SOMETHING_ELSE'] })
  assert.equal(status(s), 'REVIEW_REQUIRED')
})

// --- A2: ELBOW_02A (spontaneously-reduced dislocation) --------------------

test('A2: ELBOW_02A YES -> URGENT_REVIEW', () => {
  assert.equal(status(clearState({ elbow_spontaneously_reduced_dislocation_screen: 'YES' })), 'URGENT_REVIEW')
})
test('A2: ELBOW_02A UNKNOWN -> REVIEW_REQUIRED', () => {
  assert.equal(status(clearState({ elbow_spontaneously_reduced_dislocation_screen: 'UNKNOWN' })), 'REVIEW_REQUIRED')
})
test('A2: ELBOW_02A missing -> REVIEW_REQUIRED', () => {
  const s = clearState()
  delete s.elbow_spontaneously_reduced_dislocation_screen
  assert.equal(status(s), 'REVIEW_REQUIRED')
})
test('A2: ELBOW_02A NO -> no contribution', () => {
  assert.equal(status(clearState({ elbow_spontaneously_reduced_dislocation_screen: 'NO' })), 'CLEAR')
})
test('A2: ELBOW_01=NO does not suppress ELBOW_02A YES -> still URGENT_REVIEW', () => {
  const s = clearState({ elbow_recent_trauma_or_sudden_load: 'NO', elbow_spontaneously_reduced_dislocation_screen: 'YES' })
  assert.equal(status(s), 'URGENT_REVIEW')
})

// --- A3: ELBOW_03 (show_when ELBOW_01 in [YES,UNKNOWN]) -------------------

test('A3: ELBOW_03 YES (shown) -> REVIEW_REQUIRED + fracture_imaging_consider', () => {
  const s = clearState({
    elbow_recent_trauma_or_sudden_load: 'YES',
    elbow_post_trauma_functional_loss: 'YES',
    elbow_distal_biceps_concern: 'NO',
    elbow_distal_triceps_concern: 'NO',
  })
  assert.equal(status(s), 'REVIEW_REQUIRED')
  assert.equal(fractureFlag(s), true)
})
test('A3: ELBOW_03 UNKNOWN (shown) -> REVIEW_REQUIRED', () => {
  const s = clearState({
    elbow_recent_trauma_or_sudden_load: 'YES',
    elbow_post_trauma_functional_loss: 'UNKNOWN',
    elbow_distal_biceps_concern: 'NO',
    elbow_distal_triceps_concern: 'NO',
  })
  assert.equal(status(s), 'REVIEW_REQUIRED')
})
test('A3: ELBOW_03 missing while shown -> REVIEW_REQUIRED', () => {
  const s = clearState({ elbow_recent_trauma_or_sudden_load: 'YES', elbow_distal_biceps_concern: 'NO', elbow_distal_triceps_concern: 'NO' })
  assert.equal(status(s), 'REVIEW_REQUIRED')
})
test('A3: ELBOW_03 NO -> no contribution', () => {
  // ELBOW_01=YES also shows ELBOW_04/05 -- answer them valid-negative too, to isolate ELBOW_03's own contribution.
  const s = clearState({
    elbow_recent_trauma_or_sudden_load: 'YES',
    elbow_post_trauma_functional_loss: 'NO',
    elbow_distal_biceps_concern: 'NO',
    elbow_distal_triceps_concern: 'NO',
  })
  assert.equal(status(s), 'CLEAR')
})
test('A3: ELBOW_03 not applicable when ELBOW_01=NO -- absence does not force review', () => {
  assert.equal(status(clearState({ elbow_recent_trauma_or_sudden_load: 'NO' })), 'CLEAR')
})

// --- A4/A5: ELBOW_04/ELBOW_05 (distal biceps/triceps, show_when ELBOW_01 in [YES,UNKNOWN]) --

test('A4: ELBOW_04 YES (shown) -> REVIEW_REQUIRED + expedited, never URGENT', () => {
  const s = clearState({ elbow_recent_trauma_or_sudden_load: 'YES', elbow_distal_biceps_concern: 'YES', elbow_distal_triceps_concern: 'NO' })
  assert.equal(status(s), 'REVIEW_REQUIRED')
  assert.equal(expedited(s), true)
  assert.notEqual(status(s), 'URGENT_REVIEW')
})
test('A4: ELBOW_04 UNKNOWN (shown) -> REVIEW_REQUIRED + expedited', () => {
  const s = clearState({ elbow_recent_trauma_or_sudden_load: 'YES', elbow_distal_biceps_concern: 'UNKNOWN', elbow_distal_triceps_concern: 'NO' })
  assert.equal(status(s), 'REVIEW_REQUIRED')
  assert.equal(expedited(s), true)
})
test('A4: ELBOW_04 missing while shown -> REVIEW_REQUIRED, expedited stays false', () => {
  const s = clearState({ elbow_recent_trauma_or_sudden_load: 'YES', elbow_distal_triceps_concern: 'NO' })
  assert.equal(status(s), 'REVIEW_REQUIRED')
  assert.equal(expedited(s), false)
})
test('A5: ELBOW_05 YES (shown) -> REVIEW_REQUIRED + expedited, never URGENT', () => {
  const s = clearState({ elbow_recent_trauma_or_sudden_load: 'YES', elbow_distal_biceps_concern: 'NO', elbow_distal_triceps_concern: 'YES' })
  assert.equal(status(s), 'REVIEW_REQUIRED')
  assert.equal(expedited(s), true)
  assert.notEqual(status(s), 'URGENT_REVIEW')
})
test('A5: ELBOW_05 UNKNOWN (shown) -> REVIEW_REQUIRED + expedited', () => {
  const s = clearState({ elbow_recent_trauma_or_sudden_load: 'YES', elbow_distal_biceps_concern: 'NO', elbow_distal_triceps_concern: 'UNKNOWN' })
  assert.equal(status(s), 'REVIEW_REQUIRED')
  assert.equal(expedited(s), true)
})
test('A5: ELBOW_05 missing while shown -> REVIEW_REQUIRED, expedited stays false', () => {
  const s = clearState({ elbow_recent_trauma_or_sudden_load: 'YES', elbow_distal_biceps_concern: 'NO' })
  assert.equal(status(s), 'REVIEW_REQUIRED')
  assert.equal(expedited(s), false)
})

// --- A6: ELBOW_06 (true mechanical lock, unconditional) -------------------

test('A6: ELBOW_06 YES -> REVIEW_REQUIRED + expedited', () => {
  const s = clearState({ elbow_true_locked_rom_block: 'YES' })
  assert.equal(status(s), 'REVIEW_REQUIRED')
  assert.equal(expedited(s), true)
})
test('A6: ELBOW_06 UNKNOWN -> REVIEW_REQUIRED + expedited', () => {
  const s = clearState({ elbow_true_locked_rom_block: 'UNKNOWN' })
  assert.equal(status(s), 'REVIEW_REQUIRED')
  assert.equal(expedited(s), true)
})
test('A6: ELBOW_06 missing -> REVIEW_REQUIRED, expedited stays false', () => {
  const s = clearState()
  delete s.elbow_true_locked_rom_block
  assert.equal(status(s), 'REVIEW_REQUIRED')
  assert.equal(expedited(s), false)
})
test('A6: ELBOW_06 never auto-escalates to URGENT_REVIEW', () => {
  assert.notEqual(status(clearState({ elbow_true_locked_rom_block: 'YES' })), 'URGENT_REVIEW')
})

// --- A7: ELBOW_07 septic joint (E1) ----------------------------------------

test('A7: ELBOW_07 YES -> URGENT_REVIEW', () => {
  assert.equal(status(clearState({ elbow_septic_joint_emergency_screen: 'YES' })), 'URGENT_REVIEW')
})
test('A7: ELBOW_07 UNKNOWN -> REVIEW_REQUIRED', () => {
  assert.equal(status(clearState({ elbow_septic_joint_emergency_screen: 'UNKNOWN' })), 'REVIEW_REQUIRED')
})
test('A7: ELBOW_07 missing -> REVIEW_REQUIRED', () => {
  const s = clearState()
  delete s.elbow_septic_joint_emergency_screen
  assert.equal(status(s), 'REVIEW_REQUIRED')
})

// --- A8: ELBOW_08 posterior bursal screen (E1 OR-not-AND critical regression) --

test('A8 CRITICAL: ELBOW_08 SYSTEMIC_OR_RAPIDLY_SPREADING -> URGENT_REVIEW (single enum value, not decomposed into an AND)', () => {
  assert.equal(status(clearState({ elbow_posterior_bursal_screen: 'SYSTEMIC_OR_RAPIDLY_SPREADING' })), 'URGENT_REVIEW')
})
test('A8: ELBOW_08 LOCALIZED_STABLE -> REVIEW_REQUIRED, not urgent', () => {
  const s = clearState({ elbow_posterior_bursal_screen: 'LOCALIZED_STABLE' })
  assert.equal(status(s), 'REVIEW_REQUIRED')
  assert.notEqual(status(s), 'URGENT_REVIEW')
  assert.equal(infectionFlag(s), true)
})
test('A8: ELBOW_08 UNKNOWN -> REVIEW_REQUIRED', () => {
  assert.equal(status(clearState({ elbow_posterior_bursal_screen: 'UNKNOWN' })), 'REVIEW_REQUIRED')
})
test('A8: ELBOW_08 missing -> REVIEW_REQUIRED', () => {
  const s = clearState()
  delete s.elbow_posterior_bursal_screen
  assert.equal(status(s), 'REVIEW_REQUIRED')
})
test('A8: ELBOW_08 NONE -> no contribution, infection flag false', () => {
  const s = clearState({ elbow_posterior_bursal_screen: 'NONE' })
  assert.equal(status(s), 'CLEAR')
  assert.equal(infectionFlag(s), false)
})

// --- A9/A10/A11: ELBOW_09/09A ulnar neuropathy (E5 critical de-escalation + v0.1.1 fix) --

test('A9 CRITICAL: ELBOW_09 YES + ELBOW_09A [NONE] -> CLEAR (stable sensory-only de-escalation), no flags', () => {
  const s = clearState({ elbow_ulnar_sensory_screen: 'YES', elbow_ulnar_motor_progression_screen: ['NONE'] })
  assert.equal(status(s), 'CLEAR')
  assert.equal(expedited(s), false)
  assert.equal(neuroFlag(s), false)
})
test('A10: ELBOW_09 YES + ELBOW_09A NEW_OR_WORSENING_HAND_WEAKNESS -> REVIEW + neuro + expedited', () => {
  const s = clearState({ elbow_ulnar_sensory_screen: 'YES', elbow_ulnar_motor_progression_screen: ['NEW_OR_WORSENING_HAND_WEAKNESS'] })
  assert.equal(status(s), 'REVIEW_REQUIRED')
  assert.equal(neuroFlag(s), true)
  assert.equal(expedited(s), true)
})
test('A10: ELBOW_09 YES + ELBOW_09A VISIBLE_MUSCLE_WASTING -> REVIEW + neuro + expedited', () => {
  const s = clearState({ elbow_ulnar_sensory_screen: 'YES', elbow_ulnar_motor_progression_screen: ['VISIBLE_MUSCLE_WASTING'] })
  assert.equal(status(s), 'REVIEW_REQUIRED')
  assert.equal(neuroFlag(s), true)
  assert.equal(expedited(s), true)
})
test('A11 v0.1.1 REGRESSION: ELBOW_09 YES + ELBOW_09A UNKNOWN -> REVIEW + neuro=true + expedited=true', () => {
  const s = clearState({ elbow_ulnar_sensory_screen: 'YES', elbow_ulnar_motor_progression_screen: ['UNKNOWN'] })
  assert.equal(status(s), 'REVIEW_REQUIRED')
  assert.equal(neuroFlag(s), true)
  assert.equal(expedited(s), true)
})
test('A11 v0.1.1 REGRESSION: ELBOW_09 YES + ELBOW_09A missing -> REVIEW + neuro=true + expedited=true', () => {
  const s = clearState({ elbow_ulnar_sensory_screen: 'YES' })
  assert.equal(status(s), 'REVIEW_REQUIRED')
  assert.equal(neuroFlag(s), true)
  assert.equal(expedited(s), true)
})
test('A12: ELBOW_09 UNKNOWN -> REVIEW_REQUIRED regardless of ELBOW_09A', () => {
  const s1 = clearState({ elbow_ulnar_sensory_screen: 'UNKNOWN', elbow_ulnar_motor_progression_screen: ['NONE'] })
  assert.equal(status(s1), 'REVIEW_REQUIRED')
})
test('A12: ELBOW_09 missing -> REVIEW_REQUIRED', () => {
  const s = clearState()
  delete s.elbow_ulnar_sensory_screen
  assert.equal(status(s), 'REVIEW_REQUIRED')
})
test('A12: ELBOW_09 NO -> no contribution, no flags', () => {
  const s = clearState({ elbow_ulnar_sensory_screen: 'NO' })
  assert.equal(status(s), 'CLEAR')
  assert.equal(expedited(s), false)
  assert.equal(neuroFlag(s), false)
})

// --- A13: ELBOW_10 referred/proximal (E8a) ---------------------------------

test('A13: ELBOW_10 NEW_NECK_SHOULDER_SYMPTOM -> REVIEW_REQUIRED, not urgent', () => {
  const s = clearState({ elbow_referred_proximal_screen: ['NEW_NECK_SHOULDER_SYMPTOM'] })
  assert.equal(status(s), 'REVIEW_REQUIRED')
  assert.notEqual(status(s), 'URGENT_REVIEW')
})
test('A13: ELBOW_10 MULTI_LEVEL_OR_BILATERAL_SENSORY_CHANGE -> REVIEW_REQUIRED', () => {
  assert.equal(status(clearState({ elbow_referred_proximal_screen: ['MULTI_LEVEL_OR_BILATERAL_SENSORY_CHANGE'] })), 'REVIEW_REQUIRED')
})
test('A13: ELBOW_10 UNKNOWN -> REVIEW_REQUIRED', () => {
  assert.equal(status(clearState({ elbow_referred_proximal_screen: ['UNKNOWN'] })), 'REVIEW_REQUIRED')
})
test('A13: ELBOW_10 missing -> REVIEW_REQUIRED', () => {
  const s = clearState()
  delete s.elbow_referred_proximal_screen
  assert.equal(status(s), 'REVIEW_REQUIRED')
})
test('A13: ELBOW_10 [NONE] -> no contribution', () => {
  assert.equal(status(clearState({ elbow_referred_proximal_screen: ['NONE'] })), 'CLEAR')
})

// --- A14: ELBOW_11 cardiac-associated screen (E8b, no double-barreled AND) --

test('A14: ELBOW_11 CHEST_PAIN_OR_TIGHTNESS alone -> URGENT_REVIEW (no movement/rest AND gate)', () => {
  assert.equal(status(clearState({ elbow_cardiac_associated_screen: ['CHEST_PAIN_OR_TIGHTNESS'] })), 'URGENT_REVIEW')
})
test('A14: ELBOW_11 SHORTNESS_OF_BREATH alone -> URGENT_REVIEW', () => {
  assert.equal(status(clearState({ elbow_cardiac_associated_screen: ['SHORTNESS_OF_BREATH'] })), 'URGENT_REVIEW')
})
test('A14: ELBOW_11 COLD_SWEAT alone -> URGENT_REVIEW', () => {
  assert.equal(status(clearState({ elbow_cardiac_associated_screen: ['COLD_SWEAT'] })), 'URGENT_REVIEW')
})
test('A14: ELBOW_11 NAUSEA alone -> URGENT_REVIEW', () => {
  assert.equal(status(clearState({ elbow_cardiac_associated_screen: ['NAUSEA'] })), 'URGENT_REVIEW')
})
test('A14: ELBOW_11 UNKNOWN -> REVIEW_REQUIRED, not urgent', () => {
  assert.equal(status(clearState({ elbow_cardiac_associated_screen: ['UNKNOWN'] })), 'REVIEW_REQUIRED')
})
test('A14: ELBOW_11 missing -> REVIEW_REQUIRED', () => {
  const s = clearState()
  delete s.elbow_cardiac_associated_screen
  assert.equal(status(s), 'REVIEW_REQUIRED')
})
test('A14: ELBOW_11 [NONE] -> no contribution', () => {
  assert.equal(status(clearState({ elbow_cardiac_associated_screen: ['NONE'] })), 'CLEAR')
})
test('A14: ELBOW_11 skipped (core_safety_already_urgent=true) still yields URGENT_REVIEW via passthrough, not fail-open', () => {
  const s = clearState({ core_safety_already_urgent: true })
  delete s.elbow_cardiac_associated_screen
  assert.equal(status(s), 'URGENT_REVIEW')
})

// --- A15: Core urgent passthrough -------------------------------------------

test('A15: core_safety_already_urgent=true alone -> URGENT_REVIEW', () => {
  assert.equal(status(clearState({ core_safety_already_urgent: true })), 'URGENT_REVIEW')
})

// --- A16: locks --------------------------------------------------------------

test('A16: locks -- CLEAR is not locked', () => {
  assert.equal(elbowSafetyLocked(computeElbowFlags(clearState())), false)
})
test('A16: locks -- REVIEW_REQUIRED is locked', () => {
  assert.equal(elbowSafetyLocked(computeElbowFlags(clearState({ elbow_septic_joint_emergency_screen: 'UNKNOWN' }))), true)
})
test('A16: locks -- URGENT_REVIEW is locked', () => {
  assert.equal(elbowSafetyLocked(computeElbowFlags(clearState({ elbow_septic_joint_emergency_screen: 'YES' }))), true)
})

// --- Section B: adapter (toElbowState) enum/array mapping ------------------

const baseResponses = () => ({
  ELBOW_01: 'NO',
  ELBOW_02: ['NONE'],
  ELBOW_02A: 'NO',
  ELBOW_06: 'NO',
  ELBOW_07: 'NO',
  ELBOW_08: 'NONE',
  ELBOW_09: 'NO',
  ELBOW_10: ['NONE'],
  ELBOW_11: ['NONE'],
})

test('B1: raw ELBOW_0x fields map onto the matching ElbowState keys', () => {
  const r = { ...baseResponses(), ELBOW_01: 'YES', ELBOW_02: ['COLD_PALE_BLUE_HAND'], ELBOW_03: 'YES', ELBOW_04: 'UNKNOWN' }
  const state = toElbowState(r, false)
  assert.equal(state.elbow_recent_trauma_or_sudden_load, 'YES')
  assert.deepEqual(state.elbow_deformity_neurovascular_screen, ['COLD_PALE_BLUE_HAND'])
  assert.equal(state.elbow_post_trauma_functional_loss, 'YES')
  assert.equal(state.elbow_distal_biceps_concern, 'UNKNOWN')
})

test('B2: multi-choice fields stay arrays, single_choice ELBOW_08 stays a string', () => {
  const r = { ...baseResponses(), ELBOW_09: 'YES', ELBOW_09A: ['NEW_OR_WORSENING_HAND_WEAKNESS'], ELBOW_08: 'LOCALIZED_STABLE' }
  const state = toElbowState(r, false)
  assert.deepEqual(state.elbow_ulnar_motor_progression_screen, ['NEW_OR_WORSENING_HAND_WEAKNESS'])
  assert.equal(state.elbow_posterior_bursal_screen, 'LOCALIZED_STABLE')
})

test('B3: absent fields stay undefined, not null', () => {
  const state = toElbowState({}, false)
  assert.equal(state.elbow_recent_trauma_or_sudden_load, undefined)
  assert.equal(state.elbow_deformity_neurovascular_screen, undefined)
})

test('B4: core_safety_already_urgent passes through unchanged', () => {
  assert.equal(toElbowState(baseResponses(), true).core_safety_already_urgent, true)
  assert.equal(toElbowState(baseResponses(), false).core_safety_already_urgent, false)
})

test('B5: adapter output feeds the engine end-to-end (ELBOW_02A YES -> URGENT_REVIEW via real adapter)', () => {
  const r = { ...baseResponses(), ELBOW_02A: 'YES' }
  const state = toElbowState(r, false)
  assert.equal(computeElbowFlags(state).elbow_safety_status, 'URGENT_REVIEW')
})

test('B6 F1-invariant: ELBOW_00 (routing) has no corresponding field in ElbowState even if present in Responses', () => {
  const r = { ...baseResponses(), ELBOW_00: 'ELBOW' }
  const state = toElbowState(r, false)
  assert.equal('elbow_region' in state, false)
  assert.equal('ELBOW_00' in state, false)
  assert.equal('arm_hand_region_discriminator' in state, false)
})

// --- Summary ---

console.log(`tests/elbow.spec.mjs: ${passed} passed, ${failed} failed`)
if (failed > 0) {
  for (const { name, err } of failures) {
    console.error(`\nFAIL: ${name}`)
    console.error(err.message ?? err)
  }
  process.exit(1)
}
