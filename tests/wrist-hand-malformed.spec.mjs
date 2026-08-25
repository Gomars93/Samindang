// Supplemental WRIST_HAND_V1 regression: protected single_choice malformed
// runtime values must fail closed. The adapter converts any unrecognized
// string to undefined, and Layer 1's existing missing/malformed contract
// therefore yields at least REVIEW_REQUIRED without changing thresholds.

import assert from 'node:assert/strict'
import { computeWristHandFlags } from './.wrist-hand-logic-bundle.mjs'
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

const BASE = {
  WH_01: 'NO',
  WH_02: ['NONE'],
  WH_06: ['NONE'],
  WH_07: 'NONE',
  WH_08: 'NONE',
}

function flags(r) {
  return computeWristHandFlags(toWristHandState(r, false))
}

function expectReviewAndUndefined(r, stateKey) {
  const state = toWristHandState(r, false)
  assert.equal(state[stateKey], undefined)
  assert.equal(computeWristHandFlags(state).wrist_hand_safety_status, 'REVIEW_REQUIRED')
}

test('M1: WH_01 malformed enum -> undefined at adapter -> REVIEW_REQUIRED', () => {
  expectReviewAndUndefined(
    { ...BASE, WH_01: 'BAD_ENUM' },
    'wrist_hand_recent_trauma',
  )
})

test('M2: WH_03 malformed enum while shown -> undefined -> REVIEW_REQUIRED', () => {
  expectReviewAndUndefined(
    {
      ...BASE,
      WH_01: 'YES',
      WH_03: 'BAD_ENUM',
      WH_04: 'NO',
      WH_05: 'NO',
    },
    'wrist_hand_post_trauma_major_function_loss',
  )
})

test('M3: WH_04 malformed enum while shown -> undefined -> REVIEW_REQUIRED', () => {
  expectReviewAndUndefined(
    {
      ...BASE,
      WH_01: 'YES',
      WH_03: 'NO',
      WH_04: 'BAD_ENUM',
      WH_05: 'NO',
    },
    'wrist_hand_post_trauma_radial_thumb_base_pain',
  )
})

test('M4: WH_05 malformed enum while shown -> undefined -> REVIEW_REQUIRED', () => {
  expectReviewAndUndefined(
    {
      ...BASE,
      WH_01: 'YES',
      WH_03: 'NO',
      WH_04: 'NO',
      WH_05: 'BAD_ENUM',
    },
    'wrist_hand_post_trauma_fixed_motion_block',
  )
})

test('M5: WH_06A malformed enum while shown -> undefined -> REVIEW_REQUIRED', () => {
  expectReviewAndUndefined(
    {
      ...BASE,
      WH_06: ['CUT_OR_PENETRATING_WOUND'],
      WH_06A: 'BAD_ENUM',
      WH_07A: ['NONE'],
    },
    'wrist_hand_post_wound_active_motion_loss',
  )
})

test('M6: WH_07 malformed enum -> undefined -> REVIEW_REQUIRED + infection flag', () => {
  const r = { ...BASE, WH_07: 'BAD_ENUM' }
  const state = toWristHandState(r, false)
  assert.equal(state.wrist_hand_infection_broad_screen, undefined)
  const f = computeWristHandFlags(state)
  assert.equal(f.wrist_hand_safety_status, 'REVIEW_REQUIRED')
  assert.equal(f.infection_assessment_required, true)
})

test('M7: WH_08 malformed enum cannot enter stable-sensory carve-out -> REVIEW_REQUIRED', () => {
  const r = { ...BASE, WH_08: 'BAD_ENUM', WH_08A: ['NONE'] }
  const state = toWristHandState(r, false)
  assert.equal(state.wrist_hand_distal_sensory_pattern, undefined)
  const f = computeWristHandFlags(state)
  assert.equal(f.wrist_hand_safety_status, 'REVIEW_REQUIRED')
  assert.equal(f.neuro_assessment_required, false)
  assert.equal(f.expedited_referral_consider, false)
})

// Guard that the valid-negative baseline remains unchanged.
test('M8: valid-negative baseline remains CLEAR after adapter hardening', () => {
  assert.equal(flags(BASE).wrist_hand_safety_status, 'CLEAR')
})

console.log(`tests/wrist-hand-malformed.spec.mjs: ${passed} passed, ${failed} failed`)
if (failed > 0) {
  for (const { name, err } of failures) {
    console.error(`\nFAIL: ${name}`)
    console.error(err.message ?? err)
  }
  process.exit(1)
}
