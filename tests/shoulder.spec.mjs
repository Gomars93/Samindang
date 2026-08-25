// SHOULDER_V1 regression suite.
//
// Section A exercises src/spec/shoulderLogic.ts's Layer-1 engine directly
// (ShoulderState-shaped) against SHOULDER_V1_Tablet_Question_Set_v0.1.1_
// CLOSED.md §10-12 -- the CLOSED ground-truth safety logic. `neck_safety_status`
// is supplied directly as a plain input here (Layer 1 doesn't know or care
// how it was computed) -- Section B is what actually proves the adapter
// calls into the real NECK engine rather than a hand-set stub.
//
// Section B tests src/spec/shoulderAdapter.ts's toShoulderState (Layer 2):
// enum mapping, and -- most importantly -- that canonical NECK safety is
// DIRECTLY reused (calling neckAdapter.ts's toNeckState + neckLogic.ts's
// computeNeckFlags for real, not a re-implementation) per constraint #4 of
// the integration instructions.
//
// Run via `npm run test:shoulder`.

import assert from 'node:assert/strict'
import {
  computeShoulderFlags,
  shoulderSafetyLocked,
} from './.shoulder-logic-bundle.mjs'
import { toShoulderState } from './.shoulder-adapter-bundle.mjs'

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

// A fully-negative, fully-answered ShoulderState -- canonical NECK already
// CLEAR (as if computed for real), no core-level urgent flag.
const BASE_CLEAR = {
  shoulder_recent_trauma: 'NO',
  shoulder_infection_emergency_screen: 'NO',
  shoulder_nonmechanical_cardiac_gap_screen: 'NO',
  neck_safety_status: 'CLEAR',
  core_safety_already_urgent: false,
}

const clearState = (overrides = {}) => ({ ...BASE_CLEAR, ...overrides })
const safetyStatus = (state) => computeShoulderFlags(state).shoulder_safety_status
const expedited = (state) => computeShoulderFlags(state).expedited_referral_consider
const pmrConsider = (state) => computeShoulderFlags(state).pmr_or_systemic_inflammatory_pattern_consider

// --- Section A: Shoulder Safety Engine (v0.1.1 §10) -------------------------

test('A0: fully-answered valid-negative baseline is CLEAR', () => {
  assert.equal(safetyStatus(clearState()), 'CLEAR')
})

// --- canonical NECK passthrough (§10 rule 1) ---
test('canonical NECK URGENT_REVIEW -> shoulder URGENT_REVIEW (direct passthrough)', () => {
  assert.equal(safetyStatus(clearState({ neck_safety_status: 'URGENT_REVIEW' })), 'URGENT_REVIEW')
})
test('canonical NECK REVIEW_REQUIRED -> shoulder minimum REVIEW_REQUIRED, not urgent', () => {
  assert.equal(safetyStatus(clearState({ neck_safety_status: 'REVIEW_REQUIRED' })), 'REVIEW_REQUIRED')
})

// --- SH01 trauma + F3 (deliberate non-escalation of trauma alone) ---
test('F3: SH01=YES with SH02=[NONE] and SH03=NO -> CLEAR (trauma alone never escalates)', () => {
  const s = clearState({
    shoulder_recent_trauma: 'YES',
    shoulder_trauma_emergency_screen: ['NONE'],
    shoulder_acute_traumatic_cuff_concern: 'NO',
  })
  assert.equal(safetyStatus(s), 'CLEAR')
})
test('SH01=UNKNOWN -> REVIEW_REQUIRED', () => {
  assert.equal(safetyStatus(clearState({ shoulder_recent_trauma: 'UNKNOWN' })), 'REVIEW_REQUIRED')
})
test('SH01 missing -> REVIEW_REQUIRED', () => {
  const s = clearState()
  delete s.shoulder_recent_trauma
  assert.equal(safetyStatus(s), 'REVIEW_REQUIRED')
})

// --- SH02 (show_when SH01=YES) ---
test('SH02: DEFORMITY_OR_STILL_OUT -> URGENT_REVIEW', () => {
  const s = clearState({ shoulder_recent_trauma: 'YES', shoulder_trauma_emergency_screen: ['DEFORMITY_OR_STILL_OUT'] })
  assert.equal(safetyStatus(s), 'URGENT_REVIEW')
})
test('SH02: NEW_NEUROVASCULAR_CHANGE -> URGENT_REVIEW', () => {
  const s = clearState({ shoulder_recent_trauma: 'YES', shoulder_trauma_emergency_screen: ['NEW_NEUROVASCULAR_CHANGE'] })
  assert.equal(safetyStatus(s), 'URGENT_REVIEW')
})
test('SH02: SEVERE_SWELLING_OR_CANNOT_MOVE alone -> REVIEW_REQUIRED, not urgent', () => {
  const s = clearState({
    shoulder_recent_trauma: 'YES',
    shoulder_trauma_emergency_screen: ['SEVERE_SWELLING_OR_CANNOT_MOVE'],
  })
  assert.equal(safetyStatus(s), 'REVIEW_REQUIRED')
})
test('SH02: UNKNOWN (shown) -> REVIEW_REQUIRED', () => {
  const s = clearState({ shoulder_recent_trauma: 'YES', shoulder_trauma_emergency_screen: ['UNKNOWN'] })
  assert.equal(safetyStatus(s), 'REVIEW_REQUIRED')
})
test('SH02: missing while shown (SH01=YES) -> REVIEW_REQUIRED', () => {
  const s = clearState({ shoulder_recent_trauma: 'YES' })
  assert.equal(safetyStatus(s), 'REVIEW_REQUIRED')
})
test('SH02: malformed (NONE+positive) -> REVIEW_REQUIRED', () => {
  const s = clearState({
    shoulder_recent_trauma: 'YES',
    shoulder_trauma_emergency_screen: ['NONE', 'SEVERE_SWELLING_OR_CANNOT_MOVE'],
  })
  assert.equal(safetyStatus(s), 'REVIEW_REQUIRED')
})
test('SH02: not applicable when SH01=NO -- absence does not force review', () => {
  const s = clearState({ shoulder_recent_trauma: 'NO' })
  assert.equal(safetyStatus(s), 'CLEAR')
})

// --- SH03 (show_when SH01=YES) + expedited_referral_consider ---
test('SH03: YES -> REVIEW_REQUIRED, not urgent, expedited=true', () => {
  const s = clearState({
    shoulder_recent_trauma: 'YES',
    shoulder_trauma_emergency_screen: ['NONE'],
    shoulder_acute_traumatic_cuff_concern: 'YES',
  })
  assert.equal(safetyStatus(s), 'REVIEW_REQUIRED')
  assert.equal(expedited(s), true)
})
test('SH03: UNKNOWN -> REVIEW_REQUIRED, expedited=true', () => {
  const s = clearState({
    shoulder_recent_trauma: 'YES',
    shoulder_trauma_emergency_screen: ['NONE'],
    shoulder_acute_traumatic_cuff_concern: 'UNKNOWN',
  })
  assert.equal(safetyStatus(s), 'REVIEW_REQUIRED')
  assert.equal(expedited(s), true)
})
test('SH03: NO -> no contribution, expedited=false', () => {
  const s = clearState({
    shoulder_recent_trauma: 'YES',
    shoulder_trauma_emergency_screen: ['NONE'],
    shoulder_acute_traumatic_cuff_concern: 'NO',
  })
  assert.equal(safetyStatus(s), 'CLEAR')
  assert.equal(expedited(s), false)
})
test('SH03: important -- never auto-escalates to URGENT_REVIEW even when YES', () => {
  const s = clearState({
    shoulder_recent_trauma: 'YES',
    shoulder_trauma_emergency_screen: ['NONE'],
    shoulder_acute_traumatic_cuff_concern: 'YES',
  })
  assert.notEqual(safetyStatus(s), 'URGENT_REVIEW')
})
test('SH03: not applicable when SH01=NO', () => {
  const s = clearState({ shoulder_recent_trauma: 'NO', shoulder_acute_traumatic_cuff_concern: 'YES' })
  assert.equal(safetyStatus(s), 'CLEAR')
  assert.equal(expedited(s), false)
})

// --- SH04 infection ---
test('SH04: YES -> URGENT_REVIEW', () => {
  assert.equal(safetyStatus(clearState({ shoulder_infection_emergency_screen: 'YES' })), 'URGENT_REVIEW')
})
test('SH04: UNKNOWN -> REVIEW_REQUIRED', () => {
  assert.equal(safetyStatus(clearState({ shoulder_infection_emergency_screen: 'UNKNOWN' })), 'REVIEW_REQUIRED')
})
test('SH04: missing -> REVIEW_REQUIRED', () => {
  const s = clearState()
  delete s.shoulder_infection_emergency_screen
  assert.equal(safetyStatus(s), 'REVIEW_REQUIRED')
})

// --- SH05 cardiac gap ---
test('SH05: YES -> URGENT_REVIEW', () => {
  assert.equal(safetyStatus(clearState({ shoulder_nonmechanical_cardiac_gap_screen: 'YES' })), 'URGENT_REVIEW')
})
test('SH05: UNKNOWN -> REVIEW_REQUIRED', () => {
  assert.equal(safetyStatus(clearState({ shoulder_nonmechanical_cardiac_gap_screen: 'UNKNOWN' })), 'REVIEW_REQUIRED')
})
test('SH05: missing -> REVIEW_REQUIRED', () => {
  const s = clearState()
  delete s.shoulder_nonmechanical_cardiac_gap_screen
  assert.equal(safetyStatus(s), 'REVIEW_REQUIRED')
})

// --- core_safety_already_urgent (§10 rule 6) ---
test('core_safety_already_urgent=true alone -> URGENT_REVIEW', () => {
  assert.equal(safetyStatus(clearState({ core_safety_already_urgent: true })), 'URGENT_REVIEW')
})

// --- clinician exam input (§11 third trigger) ---
test('clinician_objective_cuff_weakness=NEW_WEAKNESS_AFTER_TRAUMA -> expedited=true, independent of safety status', () => {
  const s = clearState({ clinician_objective_cuff_weakness: 'NEW_WEAKNESS_AFTER_TRAUMA' })
  assert.equal(expedited(s), true)
  assert.equal(safetyStatus(s), 'CLEAR') // expedited flag is NOT a 4th safety status
})
test('clinician_objective_cuff_weakness=NONE/UNKNOWN/undefined -> expedited stays false absent SH03', () => {
  assert.equal(expedited(clearState({ clinician_objective_cuff_weakness: 'NONE' })), false)
  assert.equal(expedited(clearState({ clinician_objective_cuff_weakness: 'UNKNOWN' })), false)
  assert.equal(expedited(clearState()), false)
})

// --- SH06 PMR consider (non-escalating) ---
test('SH06: YES -> pmr_or_systemic_inflammatory_pattern_consider true, does not change safety status', () => {
  const s = clearState({ shoulder_bilateral_similar_stiff_pain: 'YES' })
  assert.equal(pmrConsider(s), true)
  assert.equal(safetyStatus(s), 'CLEAR')
})
test('SH06: NO/undefined -> pmr consider false', () => {
  assert.equal(pmrConsider(clearState({ shoulder_bilateral_similar_stiff_pain: 'NO' })), false)
  assert.equal(pmrConsider(clearState()), false)
})

// --- locks (§12) ---
test('locks: CLEAR -> not locked', () => {
  assert.equal(shoulderSafetyLocked(computeShoulderFlags(clearState())), false)
})
test('locks: REVIEW_REQUIRED -> locked', () => {
  assert.equal(shoulderSafetyLocked(computeShoulderFlags(clearState({ shoulder_recent_trauma: 'UNKNOWN' }))), true)
})
test('locks: URGENT_REVIEW -> locked', () => {
  assert.equal(shoulderSafetyLocked(computeShoulderFlags(clearState({ shoulder_infection_emergency_screen: 'YES' }))), true)
})

// --- Section B: adapter (toShoulderState) enum mapping + canonical NECK reuse

const NULL_REPRO = { source: null, raw: null, pregnant: null, pregnancy_possible: null, postpartum_1y: null, breastfeeding: null }

// Minimal fake Responses covering canonical NECK_01-05 (valid-negative) plus
// SH01-06 (valid-negative) -- mirrors tests/neck.spec.mjs's baseResponses
// convention.
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
  SH01: 'NO',
  SH04: 'NO',
  SH05: 'NO',
})

test('S1: raw SH0x fields map onto the matching ShoulderState keys', () => {
  const r = { ...baseResponses(), SH01: 'YES', SH02: ['DEFORMITY_OR_STILL_OUT'], SH06: 'YES' }
  const state = toShoulderState(r, NULL_REPRO, false, undefined)
  assert.equal(state.shoulder_recent_trauma, 'YES')
  assert.deepEqual(state.shoulder_trauma_emergency_screen, ['DEFORMITY_OR_STILL_OUT'])
  assert.equal(state.shoulder_bilateral_similar_stiff_pain, 'YES')
})

test('S2: core_safety_already_urgent passes through unchanged', () => {
  assert.equal(toShoulderState(baseResponses(), NULL_REPRO, true, undefined).core_safety_already_urgent, true)
  assert.equal(toShoulderState(baseResponses(), NULL_REPRO, false, undefined).core_safety_already_urgent, false)
})

test('S3: clinician_objective_cuff_weakness passes through unchanged', () => {
  const state = toShoulderState(baseResponses(), NULL_REPRO, false, 'NEW_WEAKNESS_AFTER_TRAUMA')
  assert.equal(state.clinician_objective_cuff_weakness, 'NEW_WEAKNESS_AFTER_TRAUMA')
})

// --- The critical "direct reuse, not reimplementation" verification -------

test('CANONICAL REUSE: NECK_03B=YES (thunderclap) makes toShoulderState.neck_safety_status URGENT_REVIEW via the real NECK engine', () => {
  const r = { ...baseResponses(), NECK_03B: 'YES' }
  const state = toShoulderState(r, NULL_REPRO, false, undefined)
  assert.equal(state.neck_safety_status, 'URGENT_REVIEW')
  // and it propagates all the way through the shoulder engine's own status,
  // with every SH0x field still valid-negative -- proving the urgent
  // classification came from NECK reuse, not from any shoulder-specific field.
  assert.equal(computeShoulderFlags(state).shoulder_safety_status, 'URGENT_REVIEW')
})

test('CANONICAL REUSE: NECK_01=YES (neck trauma, review-tier) makes shoulder status at least REVIEW_REQUIRED', () => {
  const r = { ...baseResponses(), NECK_01: 'YES' }
  const state = toShoulderState(r, NULL_REPRO, false, undefined)
  assert.equal(state.neck_safety_status, 'REVIEW_REQUIRED')
  assert.equal(computeShoulderFlags(state).shoulder_safety_status, 'REVIEW_REQUIRED')
})

test('CANONICAL REUSE: fully clean NECK_* + fully clean SH0x -> shoulder CLEAR (both engines agree)', () => {
  const state = toShoulderState(baseResponses(), NULL_REPRO, false, undefined)
  assert.equal(state.neck_safety_status, 'CLEAR')
  assert.equal(computeShoulderFlags(state).shoulder_safety_status, 'CLEAR')
})

// --- Summary ---

console.log(`tests/shoulder.spec.mjs: ${passed} passed, ${failed} failed`)
if (failed > 0) {
  for (const { name, err } of failures) {
    console.error(`\nFAIL: ${name}`)
    console.error(err.message ?? err)
  }
  process.exit(1)
}
