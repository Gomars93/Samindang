// WRIST_HAND_V1 regression suite.
//
// Section A exercises src/spec/wristHandLogic.ts's Layer-1 engine directly
// (WristHandState-shaped) against WRIST_HAND_V1_Tablet_Question_Set_v0.1.md
// §3-6 + the v0.1.1 delta -- the CLOSED ground-truth safety logic (Opus
// final verification PASS / CLINICAL DECISIONS CLOSED).
//
// Section B tests src/spec/wristHandAdapter.ts's toWristHandState (Layer 2):
// enum/array mapping only -- WRIST_HAND_V1 has no cross-module canonical-
// safety reuse, so there is no "direct reuse" verification needed here, but
// there IS a dedicated check that ELBOW_00 and WH_04A never leak into
// WristHandState (the F1-style routing/context separation invariant).
//
// Run via `npm run test:wrist-hand`.

import assert from 'node:assert/strict'
import { computeWristHandFlags, wristHandSafetyLocked, isWh06WoundShown, isWh07aShown } from './.wrist-hand-logic-bundle.mjs'
import { toWristHandState } from './.wrist-hand-adapter-bundle.mjs'

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

// A fully-answered valid-negative WristHandState.
const BASE_CLEAR = {
  wrist_hand_recent_trauma: 'NO',
  wrist_hand_deformity_neurovascular_open_injury_screen: ['NONE'],
  wrist_hand_wound_exposure: ['NONE'],
  wrist_hand_infection_broad_screen: 'NONE',
  wrist_hand_distal_sensory_pattern: 'NONE',
  core_safety_already_urgent: false,
}

const clearState = (overrides = {}) => ({ ...BASE_CLEAR, ...overrides })
const status = (state) => computeWristHandFlags(state).wrist_hand_safety_status
const fractureFlag = (state) => computeWristHandFlags(state).fracture_imaging_consider
const tendonFlag = (state) => computeWristHandFlags(state).tendon_injury_assessment_required
const infectionFlag = (state) => computeWristHandFlags(state).infection_assessment_required
const neuroFlag = (state) => computeWristHandFlags(state).neuro_assessment_required
const expedited = (state) => computeWristHandFlags(state).expedited_referral_consider

// --- A0: valid negative baseline --------------------------------------------

test('A0: fully-answered valid-negative baseline is CLEAR', () => {
  assert.equal(status(clearState()), 'CLEAR')
})

// --- A1: WH_02 deformity/NV/open-injury (W2-1 critical: bleeding/open-wound standalone) --

test('A1: WH_02 GROSS_DEFORMITY_OR_STILL_OUT -> URGENT_REVIEW', () => {
  assert.equal(status(clearState({ wrist_hand_deformity_neurovascular_open_injury_screen: ['GROSS_DEFORMITY_OR_STILL_OUT'] })), 'URGENT_REVIEW')
})
test('A1: WH_02 COLD_PALE_BLUE_DIGITS -> URGENT_REVIEW', () => {
  assert.equal(status(clearState({ wrist_hand_deformity_neurovascular_open_injury_screen: ['COLD_PALE_BLUE_DIGITS'] })), 'URGENT_REVIEW')
})
test('A1: WH_02 MAJOR_NEW_DISTAL_NEURO_CHANGE -> URGENT_REVIEW', () => {
  assert.equal(status(clearState({ wrist_hand_deformity_neurovascular_open_injury_screen: ['MAJOR_NEW_DISTAL_NEURO_CHANGE'] })), 'URGENT_REVIEW')
})
test('A1 CRITICAL W2-1: WH_02 UNCONTROLLED_HEAVY_BLEEDING alone -> URGENT_REVIEW, standalone (no AND)', () => {
  assert.equal(status(clearState({ wrist_hand_deformity_neurovascular_open_injury_screen: ['UNCONTROLLED_HEAVY_BLEEDING'] })), 'URGENT_REVIEW')
})
test('A1 CRITICAL W2-1: WH_02 SEVERE_OPEN_WOUND_WITH_DEEP_EXPOSURE alone -> URGENT_REVIEW, standalone (no AND)', () => {
  assert.equal(status(clearState({ wrist_hand_deformity_neurovascular_open_injury_screen: ['SEVERE_OPEN_WOUND_WITH_DEEP_EXPOSURE'] })), 'URGENT_REVIEW')
})
test('A1: WH_02 UNKNOWN -> REVIEW_REQUIRED', () => {
  assert.equal(status(clearState({ wrist_hand_deformity_neurovascular_open_injury_screen: ['UNKNOWN'] })), 'REVIEW_REQUIRED')
})
test('A1: WH_02 missing -> REVIEW_REQUIRED', () => {
  const s = clearState()
  delete s.wrist_hand_deformity_neurovascular_open_injury_screen
  assert.equal(status(s), 'REVIEW_REQUIRED')
})
test('A1: WH_02 empty array -> REVIEW_REQUIRED (fail-closed, not NONE)', () => {
  assert.equal(status(clearState({ wrist_hand_deformity_neurovascular_open_injury_screen: [] })), 'REVIEW_REQUIRED')
})
test('A1: WH_02 malformed (NONE+urgent concrete) -> URGENT_REVIEW, never CLEAR', () => {
  const s = clearState({ wrist_hand_deformity_neurovascular_open_injury_screen: ['NONE', 'UNCONTROLLED_HEAVY_BLEEDING'] })
  assert.equal(status(s), 'URGENT_REVIEW')
})
test('A1: WH_02 malformed (unrecognized value alone) -> REVIEW_REQUIRED, never CLEAR', () => {
  assert.equal(status(clearState({ wrist_hand_deformity_neurovascular_open_injury_screen: ['SOMETHING_ELSE'] })), 'REVIEW_REQUIRED')
})
test('A1: WH_02 [NONE] singleton -> no contribution', () => {
  assert.equal(status(clearState({ wrist_hand_deformity_neurovascular_open_injury_screen: ['NONE'] })), 'CLEAR')
})

// --- A2: WH_01 -------------------------------------------------------------

test('A2: WH_01 YES alone is not itself a review trigger', () => {
  assert.equal(status(clearState({ wrist_hand_recent_trauma: 'YES', wrist_hand_post_trauma_major_function_loss: 'NO', wrist_hand_post_trauma_radial_thumb_base_pain: 'NO', wrist_hand_post_trauma_fixed_motion_block: 'NO' })), 'CLEAR')
})
test('A2: WH_01 UNKNOWN -> REVIEW_REQUIRED', () => {
  assert.equal(status(clearState({ wrist_hand_recent_trauma: 'UNKNOWN' })), 'REVIEW_REQUIRED')
})
test('A2: WH_01 missing -> REVIEW_REQUIRED', () => {
  const s = clearState()
  delete s.wrist_hand_recent_trauma
  assert.equal(status(s), 'REVIEW_REQUIRED')
})

// --- A3/A4: WH_03/WH_04 occult fracture (W3) -------------------------------

test('A3: WH_03 YES (shown) -> REVIEW_REQUIRED + fracture_imaging_consider', () => {
  const s = clearState({ wrist_hand_recent_trauma: 'YES', wrist_hand_post_trauma_major_function_loss: 'YES', wrist_hand_post_trauma_radial_thumb_base_pain: 'NO', wrist_hand_post_trauma_fixed_motion_block: 'NO' })
  assert.equal(status(s), 'REVIEW_REQUIRED')
  assert.equal(fractureFlag(s), true)
})
test('A3: WH_03 UNKNOWN (shown) -> REVIEW_REQUIRED', () => {
  const s = clearState({ wrist_hand_recent_trauma: 'YES', wrist_hand_post_trauma_major_function_loss: 'UNKNOWN', wrist_hand_post_trauma_radial_thumb_base_pain: 'NO', wrist_hand_post_trauma_fixed_motion_block: 'NO' })
  assert.equal(status(s), 'REVIEW_REQUIRED')
})
test('A3: WH_03 missing while shown -> REVIEW_REQUIRED', () => {
  const s = clearState({ wrist_hand_recent_trauma: 'YES', wrist_hand_post_trauma_radial_thumb_base_pain: 'NO', wrist_hand_post_trauma_fixed_motion_block: 'NO' })
  assert.equal(status(s), 'REVIEW_REQUIRED')
})
test('A3: WH_03 not applicable when WH_01=NO -- absence does not force review', () => {
  assert.equal(status(clearState({ wrist_hand_recent_trauma: 'NO' })), 'CLEAR')
})
test('A4: WH_04 YES (shown) -> REVIEW_REQUIRED + fracture_imaging_consider, no auto URGENT', () => {
  const s = clearState({ wrist_hand_recent_trauma: 'YES', wrist_hand_post_trauma_major_function_loss: 'NO', wrist_hand_post_trauma_radial_thumb_base_pain: 'YES', wrist_hand_post_trauma_fixed_motion_block: 'NO' })
  assert.equal(status(s), 'REVIEW_REQUIRED')
  assert.equal(fractureFlag(s), true)
  assert.notEqual(status(s), 'URGENT_REVIEW')
})
test('A4: WH_04 UNKNOWN (shown) -> REVIEW_REQUIRED', () => {
  const s = clearState({ wrist_hand_recent_trauma: 'YES', wrist_hand_post_trauma_major_function_loss: 'NO', wrist_hand_post_trauma_radial_thumb_base_pain: 'UNKNOWN', wrist_hand_post_trauma_fixed_motion_block: 'NO' })
  assert.equal(status(s), 'REVIEW_REQUIRED')
})
test('A4: WH_04 missing while shown -> REVIEW_REQUIRED, fracture flag stays false', () => {
  const s = clearState({ wrist_hand_recent_trauma: 'YES', wrist_hand_post_trauma_major_function_loss: 'NO', wrist_hand_post_trauma_fixed_motion_block: 'NO' })
  assert.equal(status(s), 'REVIEW_REQUIRED')
  assert.equal(fractureFlag(s), false)
})

// --- A5: WH_05 fixed motion block (W7 -- REVIEW only, no blanket expedited) --

test('A5: WH_05 YES (shown) -> REVIEW_REQUIRED, expedited stays false (no blanket rule)', () => {
  const s = clearState({ wrist_hand_recent_trauma: 'YES', wrist_hand_post_trauma_major_function_loss: 'NO', wrist_hand_post_trauma_radial_thumb_base_pain: 'NO', wrist_hand_post_trauma_fixed_motion_block: 'YES' })
  assert.equal(status(s), 'REVIEW_REQUIRED')
  assert.equal(expedited(s), false)
  assert.notEqual(status(s), 'URGENT_REVIEW')
})
test('A5: WH_05 UNKNOWN (shown) -> REVIEW_REQUIRED', () => {
  const s = clearState({ wrist_hand_recent_trauma: 'YES', wrist_hand_post_trauma_major_function_loss: 'NO', wrist_hand_post_trauma_radial_thumb_base_pain: 'NO', wrist_hand_post_trauma_fixed_motion_block: 'UNKNOWN' })
  assert.equal(status(s), 'REVIEW_REQUIRED')
})
test('A5: WH_05 missing while shown -> REVIEW_REQUIRED', () => {
  const s = clearState({ wrist_hand_recent_trauma: 'YES', wrist_hand_post_trauma_major_function_loss: 'NO', wrist_hand_post_trauma_radial_thumb_base_pain: 'NO' })
  assert.equal(status(s), 'REVIEW_REQUIRED')
})

// --- A6: WH_06 wound exposure (W5 bite standalone, cut alone non-escalating) --

test('A6 CRITICAL W5: WH_06 HUMAN_OR_ANIMAL_BITE alone -> REVIEW_REQUIRED + infection flag, no infection-sign requirement', () => {
  const s = clearState({ wrist_hand_wound_exposure: ['HUMAN_OR_ANIMAL_BITE'] })
  assert.equal(status(s), 'REVIEW_REQUIRED')
  assert.equal(infectionFlag(s), true)
  assert.notEqual(status(s), 'URGENT_REVIEW')
})
test('A6: WH_06 CUT_OR_PENETRATING_WOUND alone (WH_06A/WH_07A answered valid-negative) -> no contribution (not automatic expedited/urgent, not even REVIEW)', () => {
  // CUT_OR_PENETRATING_WOUND shows both WH_06A and WH_07A (isWh06WoundShown feeds both) -- must
  // answer them valid-negative to isolate WH_06's own contribution.
  const s = clearState({
    wrist_hand_wound_exposure: ['CUT_OR_PENETRATING_WOUND'],
    wrist_hand_post_wound_active_motion_loss: 'NO',
    wrist_hand_flexor_sheath_followup: ['NONE'],
  })
  assert.equal(status(s), 'CLEAR')
  assert.equal(infectionFlag(s), false)
})
test('A6: WH_06 UNKNOWN -> REVIEW_REQUIRED', () => {
  assert.equal(status(clearState({ wrist_hand_wound_exposure: ['UNKNOWN'] })), 'REVIEW_REQUIRED')
})
test('A6: WH_06 missing -> REVIEW_REQUIRED', () => {
  const s = clearState()
  delete s.wrist_hand_wound_exposure
  assert.equal(status(s), 'REVIEW_REQUIRED')
})
test('A6: WH_06 empty array -> REVIEW_REQUIRED', () => {
  assert.equal(status(clearState({ wrist_hand_wound_exposure: [] })), 'REVIEW_REQUIRED')
})
test('A6: WH_06 malformed (NONE + CUT mixed) -> REVIEW_REQUIRED, never CLEAR', () => {
  assert.equal(status(clearState({ wrist_hand_wound_exposure: ['NONE', 'CUT_OR_PENETRATING_WOUND'] })), 'REVIEW_REQUIRED')
})
test('A6: WH_06 bite never cancelled by contradictory NONE in the same malformed array', () => {
  const s = clearState({ wrist_hand_wound_exposure: ['NONE', 'HUMAN_OR_ANIMAL_BITE'] })
  assert.equal(status(s), 'REVIEW_REQUIRED')
  assert.equal(infectionFlag(s), true)
})
test('A6: WH_06 [NONE] singleton -> no contribution', () => {
  assert.equal(status(clearState({ wrist_hand_wound_exposure: ['NONE'] })), 'CLEAR')
})

// --- A7: WH_06A active motion loss (W4) ------------------------------------

test('A7: WH_06A YES (shown via CUT) -> REVIEW_REQUIRED + tendon + expedited', () => {
  const s = clearState({ wrist_hand_wound_exposure: ['CUT_OR_PENETRATING_WOUND'], wrist_hand_post_wound_active_motion_loss: 'YES', wrist_hand_infection_broad_screen: 'NONE' })
  assert.equal(status(s), 'REVIEW_REQUIRED')
  assert.equal(tendonFlag(s), true)
  assert.equal(expedited(s), true)
  assert.notEqual(status(s), 'URGENT_REVIEW')
})
test('A7: WH_06A UNKNOWN (shown via BITE) -> REVIEW_REQUIRED', () => {
  const s = clearState({ wrist_hand_wound_exposure: ['HUMAN_OR_ANIMAL_BITE'], wrist_hand_post_wound_active_motion_loss: 'UNKNOWN' })
  assert.equal(status(s), 'REVIEW_REQUIRED')
})
test('A7: WH_06A missing while shown -> REVIEW_REQUIRED, tendon/expedited stay false', () => {
  const s = clearState({ wrist_hand_wound_exposure: ['CUT_OR_PENETRATING_WOUND'] })
  assert.equal(status(s), 'REVIEW_REQUIRED')
  assert.equal(tendonFlag(s), false)
})
test('A7: WH_06A not shown when WH_06 is [NONE] -- absence does not force review', () => {
  assert.equal(status(clearState({ wrist_hand_wound_exposure: ['NONE'] })), 'CLEAR')
})

// --- A8: WH_07 broad infection gate (W5/W8 OR-not-AND critical) -----------

test('A8 CRITICAL: WH_07 SYSTEMIC_OR_RAPIDLY_SPREADING -> URGENT_REVIEW (single enum value, not decomposed into an AND)', () => {
  assert.equal(status(clearState({ wrist_hand_infection_broad_screen: 'SYSTEMIC_OR_RAPIDLY_SPREADING' })), 'URGENT_REVIEW')
})
test('A8: WH_07 LOCALIZED_STABLE -> REVIEW_REQUIRED + infection flag, not urgent', () => {
  const s = clearState({ wrist_hand_infection_broad_screen: 'LOCALIZED_STABLE' })
  assert.equal(status(s), 'REVIEW_REQUIRED')
  assert.notEqual(status(s), 'URGENT_REVIEW')
  assert.equal(infectionFlag(s), true)
})
test('A8: WH_07 FINGER_LOCALIZED_SWOLLEN_PAINFUL -> REVIEW_REQUIRED + infection flag, not urgent by itself', () => {
  const s = clearState({ wrist_hand_infection_broad_screen: 'FINGER_LOCALIZED_SWOLLEN_PAINFUL', wrist_hand_flexor_sheath_followup: ['NONE'] })
  assert.equal(status(s), 'REVIEW_REQUIRED')
  assert.notEqual(status(s), 'URGENT_REVIEW')
  assert.equal(infectionFlag(s), true)
})
test('A8: WH_07 UNKNOWN -> REVIEW_REQUIRED + infection flag', () => {
  const s = clearState({ wrist_hand_infection_broad_screen: 'UNKNOWN' })
  assert.equal(status(s), 'REVIEW_REQUIRED')
  assert.equal(infectionFlag(s), true)
})
test('A8: WH_07 missing -> REVIEW_REQUIRED + infection flag', () => {
  const s = clearState()
  delete s.wrist_hand_infection_broad_screen
  assert.equal(status(s), 'REVIEW_REQUIRED')
  assert.equal(infectionFlag(s), true)
})
test('A8: WH_07 NONE -> no contribution, infection flag false', () => {
  const s = clearState({ wrist_hand_infection_broad_screen: 'NONE' })
  assert.equal(status(s), 'CLEAR')
  assert.equal(infectionFlag(s), false)
})

// --- A9: WH_07A flexor-sheath follow-up (W8 independent URGENT source) -----

test('A9 CRITICAL: WH_07A SEVERE_PAIN_WHEN_STRAIGHTENING alone -> URGENT_REVIEW, independent of WH_07', () => {
  const s = clearState({ wrist_hand_wound_exposure: ['CUT_OR_PENETRATING_WOUND'], wrist_hand_infection_broad_screen: 'NONE', wrist_hand_flexor_sheath_followup: ['SEVERE_PAIN_WHEN_STRAIGHTENING'] })
  assert.equal(status(s), 'URGENT_REVIEW')
})
test('A9 CRITICAL: WH_07A TENDS_TO_STAY_FLEXED alone -> URGENT_REVIEW even when WH_07=NONE', () => {
  const s = clearState({ wrist_hand_wound_exposure: ['HUMAN_OR_ANIMAL_BITE'], wrist_hand_infection_broad_screen: 'NONE', wrist_hand_flexor_sheath_followup: ['TENDS_TO_STAY_FLEXED'] })
  assert.equal(status(s), 'URGENT_REVIEW')
})
test('A9: WH_07A DIFFUSE_FUSIFORM_SWELLING alone -> URGENT_REVIEW', () => {
  const s = clearState({ wrist_hand_infection_broad_screen: 'FINGER_LOCALIZED_SWOLLEN_PAINFUL', wrist_hand_flexor_sheath_followup: ['DIFFUSE_FUSIFORM_SWELLING'] })
  assert.equal(status(s), 'URGENT_REVIEW')
})
test('A9 CRITICAL v0.1.1: WH_07A shown + empty array -> REVIEW_REQUIRED + infection_assessment_required=true (empty != NONE)', () => {
  const s = clearState({ wrist_hand_wound_exposure: ['CUT_OR_PENETRATING_WOUND'], wrist_hand_infection_broad_screen: 'NONE', wrist_hand_flexor_sheath_followup: [] })
  assert.equal(status(s), 'REVIEW_REQUIRED')
  assert.equal(infectionFlag(s), true)
  assert.notEqual(status(s), 'URGENT_REVIEW')
})
test('A9: WH_07A shown + UNKNOWN -> REVIEW_REQUIRED + infection flag', () => {
  const s = clearState({ wrist_hand_wound_exposure: ['CUT_OR_PENETRATING_WOUND'], wrist_hand_infection_broad_screen: 'NONE', wrist_hand_flexor_sheath_followup: ['UNKNOWN'] })
  assert.equal(status(s), 'REVIEW_REQUIRED')
  assert.equal(infectionFlag(s), true)
})
test('A9: WH_07A shown + missing -> REVIEW_REQUIRED + infection flag', () => {
  const s = clearState({ wrist_hand_wound_exposure: ['CUT_OR_PENETRATING_WOUND'], wrist_hand_infection_broad_screen: 'NONE' })
  delete s.wrist_hand_flexor_sheath_followup
  assert.equal(status(s), 'REVIEW_REQUIRED')
  assert.equal(infectionFlag(s), true)
})
test('A9: WH_07A shown + malformed -> REVIEW_REQUIRED + infection flag', () => {
  const s = clearState({ wrist_hand_wound_exposure: ['CUT_OR_PENETRATING_WOUND'], wrist_hand_infection_broad_screen: 'NONE', wrist_hand_flexor_sheath_followup: ['SOMETHING_ELSE'] })
  assert.equal(status(s), 'REVIEW_REQUIRED')
  assert.equal(infectionFlag(s), true)
})
test('A9: WH_07A not shown (WH_06=[NONE], WH_07=NONE) -- absence does not force review', () => {
  assert.equal(status(clearState({ wrist_hand_wound_exposure: ['NONE'], wrist_hand_infection_broad_screen: 'NONE' })), 'CLEAR')
})
test('A9: WH_07A shown via WH_07=FINGER_LOCALIZED_SWOLLEN_PAINFUL route, [NONE] -> no urgent contribution beyond WH_07 own REVIEW', () => {
  const s = clearState({ wrist_hand_infection_broad_screen: 'FINGER_LOCALIZED_SWOLLEN_PAINFUL', wrist_hand_flexor_sheath_followup: ['NONE'] })
  assert.equal(status(s), 'REVIEW_REQUIRED')
  assert.notEqual(status(s), 'URGENT_REVIEW')
})

// --- A10/A11: WH_08/WH_08A neuro calibration (W6 stable sensory-only carve-out) --

test('A10 CRITICAL: WH_08 MEDIAN_DISTRIBUTION + WH_08A [NONE] -> CLEAR (stable sensory-only de-escalation), no flags', () => {
  const s = clearState({ wrist_hand_distal_sensory_pattern: 'MEDIAN_DISTRIBUTION', wrist_hand_motor_progression_screen: ['NONE'] })
  assert.equal(status(s), 'CLEAR')
  assert.equal(neuroFlag(s), false)
  assert.equal(expedited(s), false)
})
test('A10 CRITICAL: WH_08 ULNAR_DISTRIBUTION + WH_08A [NONE] -> CLEAR, no flags', () => {
  const s = clearState({ wrist_hand_distal_sensory_pattern: 'ULNAR_DISTRIBUTION', wrist_hand_motor_progression_screen: ['NONE'] })
  assert.equal(status(s), 'CLEAR')
  assert.equal(neuroFlag(s), false)
  assert.equal(expedited(s), false)
})
test('A10: WH_08 MULTIPLE_OR_BOTH + WH_08A [NONE] -> CLEAR, no flags', () => {
  const s = clearState({ wrist_hand_distal_sensory_pattern: 'MULTIPLE_OR_BOTH', wrist_hand_motor_progression_screen: ['NONE'] })
  assert.equal(status(s), 'CLEAR')
  assert.equal(neuroFlag(s), false)
})
test('A11: WH_08 sensory-positive + WH_08A NEW_OR_WORSENING_GRIP_PINCH_WEAKNESS -> REVIEW + neuro + expedited', () => {
  const s = clearState({ wrist_hand_distal_sensory_pattern: 'MEDIAN_DISTRIBUTION', wrist_hand_motor_progression_screen: ['NEW_OR_WORSENING_GRIP_PINCH_WEAKNESS'] })
  assert.equal(status(s), 'REVIEW_REQUIRED')
  assert.equal(neuroFlag(s), true)
  assert.equal(expedited(s), true)
})
test('A11: WH_08 sensory-positive + WH_08A DROPPING_OBJECTS -> REVIEW + neuro + expedited', () => {
  const s = clearState({ wrist_hand_distal_sensory_pattern: 'ULNAR_DISTRIBUTION', wrist_hand_motor_progression_screen: ['DROPPING_OBJECTS'] })
  assert.equal(status(s), 'REVIEW_REQUIRED')
  assert.equal(neuroFlag(s), true)
  assert.equal(expedited(s), true)
})
test('A11: WH_08 sensory-positive + WH_08A VISIBLE_THENAR_OR_INTRINSIC_WASTING -> REVIEW + neuro + expedited', () => {
  const s = clearState({ wrist_hand_distal_sensory_pattern: 'MEDIAN_DISTRIBUTION', wrist_hand_motor_progression_screen: ['VISIBLE_THENAR_OR_INTRINSIC_WASTING'] })
  assert.equal(status(s), 'REVIEW_REQUIRED')
  assert.equal(neuroFlag(s), true)
  assert.equal(expedited(s), true)
})
test('A11: WH_08 sensory-positive + WH_08A UNKNOWN -> REVIEW + neuro + expedited', () => {
  const s = clearState({ wrist_hand_distal_sensory_pattern: 'ULNAR_DISTRIBUTION', wrist_hand_motor_progression_screen: ['UNKNOWN'] })
  assert.equal(status(s), 'REVIEW_REQUIRED')
  assert.equal(neuroFlag(s), true)
  assert.equal(expedited(s), true)
})
test('A11: WH_08 sensory-positive + WH_08A missing -> REVIEW + neuro + expedited', () => {
  const s = clearState({ wrist_hand_distal_sensory_pattern: 'MEDIAN_DISTRIBUTION' })
  assert.equal(status(s), 'REVIEW_REQUIRED')
  assert.equal(neuroFlag(s), true)
  assert.equal(expedited(s), true)
})
test('A11: WH_08 sensory-positive + WH_08A empty array -> REVIEW + neuro + expedited', () => {
  const s = clearState({ wrist_hand_distal_sensory_pattern: 'ULNAR_DISTRIBUTION', wrist_hand_motor_progression_screen: [] })
  assert.equal(status(s), 'REVIEW_REQUIRED')
  assert.equal(neuroFlag(s), true)
  assert.equal(expedited(s), true)
})
test('A11: WH_08 sensory-positive + WH_08A malformed -> REVIEW + neuro + expedited', () => {
  const s = clearState({ wrist_hand_distal_sensory_pattern: 'MEDIAN_DISTRIBUTION', wrist_hand_motor_progression_screen: ['SOMETHING_ELSE'] })
  assert.equal(status(s), 'REVIEW_REQUIRED')
  assert.equal(neuroFlag(s), true)
  assert.equal(expedited(s), true)
})
test('A12: WH_08 UNKNOWN -> REVIEW_REQUIRED regardless of WH_08A', () => {
  assert.equal(status(clearState({ wrist_hand_distal_sensory_pattern: 'UNKNOWN', wrist_hand_motor_progression_screen: ['NONE'] })), 'REVIEW_REQUIRED')
})
test('A12: WH_08 missing -> REVIEW_REQUIRED', () => {
  const s = clearState()
  delete s.wrist_hand_distal_sensory_pattern
  assert.equal(status(s), 'REVIEW_REQUIRED')
})
test('A12: WH_08 NONE -> CLEAR, no flags', () => {
  const s = clearState({ wrist_hand_distal_sensory_pattern: 'NONE' })
  assert.equal(status(s), 'CLEAR')
  assert.equal(neuroFlag(s), false)
  assert.equal(expedited(s), false)
})

// --- A13: Core urgent passthrough -------------------------------------------

test('A13: core_safety_already_urgent=true alone -> URGENT_REVIEW', () => {
  assert.equal(status(clearState({ core_safety_already_urgent: true })), 'URGENT_REVIEW')
})

// --- A14: show_when helpers --------------------------------------------------

test('A14: isWh06WoundShown true for CUT/BITE/UNKNOWN, false for NONE/undefined', () => {
  assert.equal(isWh06WoundShown(['CUT_OR_PENETRATING_WOUND']), true)
  assert.equal(isWh06WoundShown(['HUMAN_OR_ANIMAL_BITE']), true)
  assert.equal(isWh06WoundShown(['UNKNOWN']), true)
  assert.equal(isWh06WoundShown(['NONE']), false)
  assert.equal(isWh06WoundShown(undefined), false)
})
test('A14: isWh07aShown true via wound/bite route or WH_07 finger/unknown route', () => {
  assert.equal(isWh07aShown(['CUT_OR_PENETRATING_WOUND'], 'NONE'), true)
  assert.equal(isWh07aShown(['NONE'], 'FINGER_LOCALIZED_SWOLLEN_PAINFUL'), true)
  assert.equal(isWh07aShown(['NONE'], 'UNKNOWN'), true)
  assert.equal(isWh07aShown(['NONE'], 'NONE'), false)
  assert.equal(isWh07aShown(['NONE'], 'LOCALIZED_STABLE'), false)
})

// --- A15: locks --------------------------------------------------------------

test('A15: locks -- CLEAR is not locked', () => {
  assert.equal(wristHandSafetyLocked(computeWristHandFlags(clearState())), false)
})
test('A15: locks -- REVIEW_REQUIRED is locked', () => {
  assert.equal(wristHandSafetyLocked(computeWristHandFlags(clearState({ wrist_hand_infection_broad_screen: 'UNKNOWN' }))), true)
})
test('A15: locks -- URGENT_REVIEW is locked', () => {
  assert.equal(wristHandSafetyLocked(computeWristHandFlags(clearState({ wrist_hand_infection_broad_screen: 'SYSTEMIC_OR_RAPIDLY_SPREADING' }))), true)
})

// --- Section B: adapter (toWristHandState) enum/array mapping --------------

const baseResponses = () => ({
  WH_01: 'NO',
  WH_02: ['NONE'],
  WH_06: ['NONE'],
  WH_07: 'NONE',
  WH_08: 'NONE',
})

test('B1: raw WH_0x fields map onto the matching WristHandState keys', () => {
  const r = { ...baseResponses(), WH_01: 'YES', WH_02: ['COLD_PALE_BLUE_DIGITS'], WH_03: 'YES', WH_04: 'UNKNOWN' }
  const state = toWristHandState(r, false)
  assert.equal(state.wrist_hand_recent_trauma, 'YES')
  assert.deepEqual(state.wrist_hand_deformity_neurovascular_open_injury_screen, ['COLD_PALE_BLUE_DIGITS'])
  assert.equal(state.wrist_hand_post_trauma_major_function_loss, 'YES')
  assert.equal(state.wrist_hand_post_trauma_radial_thumb_base_pain, 'UNKNOWN')
})

test('B2: multi-choice fields stay arrays, single_choice WH_07/WH_08 stay strings', () => {
  const r = { ...baseResponses(), WH_06: ['CUT_OR_PENETRATING_WOUND'], WH_07A: ['SEVERE_PAIN_WHEN_STRAIGHTENING'], WH_07: 'LOCALIZED_STABLE', WH_08: 'ULNAR_DISTRIBUTION' }
  const state = toWristHandState(r, false)
  assert.deepEqual(state.wrist_hand_flexor_sheath_followup, ['SEVERE_PAIN_WHEN_STRAIGHTENING'])
  assert.equal(state.wrist_hand_infection_broad_screen, 'LOCALIZED_STABLE')
  assert.equal(state.wrist_hand_distal_sensory_pattern, 'ULNAR_DISTRIBUTION')
})

test('B3: absent fields stay undefined, not null', () => {
  const state = toWristHandState({}, false)
  assert.equal(state.wrist_hand_recent_trauma, undefined)
  assert.equal(state.wrist_hand_deformity_neurovascular_open_injury_screen, undefined)
})

test('B4: core_safety_already_urgent passes through unchanged', () => {
  assert.equal(toWristHandState(baseResponses(), true).core_safety_already_urgent, true)
  assert.equal(toWristHandState(baseResponses(), false).core_safety_already_urgent, false)
})

test('B5: adapter output feeds the engine end-to-end (WH_07 SYSTEMIC_OR_RAPIDLY_SPREADING -> URGENT_REVIEW via real adapter)', () => {
  const r = { ...baseResponses(), WH_07: 'SYSTEMIC_OR_RAPIDLY_SPREADING' }
  const state = toWristHandState(r, false)
  assert.equal(computeWristHandFlags(state).wrist_hand_safety_status, 'URGENT_REVIEW')
})

test('B6 F1-invariant: ELBOW_00 (shared router) has no corresponding field in WristHandState even if present in Responses', () => {
  const r = { ...baseResponses(), ELBOW_00: 'WRIST_HAND' }
  const state = toWristHandState(r, false)
  assert.equal('ELBOW_00' in state, false)
  assert.equal('arm_hand_region_discriminator' in state, false)
})

test('B7 WRIST_HAND-specific invariant: WH_04A (X-ray context) has no corresponding field in WristHandState even if present in Responses', () => {
  const r = { ...baseResponses(), WH_04A: 'DONE_TOLD_NORMAL' }
  const state = toWristHandState(r, false)
  assert.equal('WH_04A' in state, false)
  assert.equal('wrist_hand_prior_xray_context' in state, false)
})

test('B8: optional phenotype fields (WH_09-14) have no corresponding field in WristHandState even if present in Responses', () => {
  const r = { ...baseResponses(), WH_09: 'RADIAL_WRIST_THUMB_SIDE', WH_11: 'YES' }
  const state = toWristHandState(r, false)
  assert.equal('WH_09' in state, false)
  assert.equal('WH_11' in state, false)
})

// --- Summary ---

console.log(`tests/wrist-hand.spec.mjs: ${passed} passed, ${failed} failed`)
if (failed > 0) {
  for (const { name, err } of failures) {
    console.error(`\nFAIL: ${name}`)
    console.error(err.message ?? err)
  }
  process.exit(1)
}
