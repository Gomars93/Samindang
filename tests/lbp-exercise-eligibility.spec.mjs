// LBP v1 Batch 2 (G6/G7) — evaluateLbpExerciseEligibility rule-table tests.
// Run via `npm run test:lbp-exercise-eligibility`.
//
// Ported from `tests/lbp-exercise-eligibility.experimental.spec.mjs` on
// `origin/claude/feat-lbp-action-adaptive-engine-prototype` with every
// assertion updated to match the RF-* fixes applied in
// `src/doctor/workspace/lbpExerciseEligibility.ts` (see that file's header
// for the exact RF-1/4/5/6/7/7b/9/10/12 mapping). RF-11(a)/(b) additions are
// new: a regressible-only-exercise-with-UNKNOWN-neuro regression test, and a
// rule-id-set === Core-20-metadata-id-set assertion.

import assert from 'node:assert/strict'
import {
  LBP_EXERCISE_ELIGIBILITY_RULES,
  evaluateLbpExerciseEligibility,
  getLbpExerciseEligibilityRule,
} from './.lbp-exercise-eligibility-bundle.mjs'
import { LBP_CORE_EXERCISE_METADATA } from './.lbp-exercise-core-metadata-bundle.mjs'

let passed = 0
const test = (name, fn) => {
  fn()
  passed += 1
  console.log(`PASS ${name}`)
}

const ALL_CAPABILITIES = [
  'SAFE_WALKING',
  'CAN_SELF_PACE',
  'QUADRUPED_TOLERATED',
  'SUPINE_TOLERATED',
  'PRONE_TOLERATED',
  'SUPPORTED_STANDING_TOLERATED',
  'SITTING_TOLERATED',
  'LOW_LOAD_TRUNK_CONTROL',
  'HIP_HINGE_CONTROL',
  'LOAD_READY',
  'BALANCE_WITH_SUPPORT',
  'FLEXION_EXPOSURE_TOLERATED',
  'EXTENSION_EXPOSURE_TOLERATED',
  'NEURAL_SLIDER_TOLERATED',
  'NATURAL_BREATHING_TOLERATED',
]

const allYes = Object.fromEntries(ALL_CAPABILITIES.map((key) => [key, 'YES']))

function context(overrides = {}) {
  return {
    routineCareAllowed: true,
    neuroStatus: 'STABLE',
    distalSymptomResponse: 'STABLE_OR_IMPROVING',
    directionalResponse: 'NO_CLEAR_DIRECTION',
    capabilities: { ...allYes },
    ...overrides,
  }
}

// ---------- 0. structural ----------

test('20 rules, unique ids, getLbpExerciseEligibilityRule matches the table', () => {
  assert.equal(LBP_EXERCISE_ELIGIBILITY_RULES.length, 20)
  assert.equal(new Set(LBP_EXERCISE_ELIGIBILITY_RULES.map((r) => r.exerciseId)).size, 20)
  for (const rule of LBP_EXERCISE_ELIGIBILITY_RULES) {
    assert.deepEqual(getLbpExerciseEligibilityRule(rule.exerciseId), rule)
  }
})

// RF-11(b): the rule id set must equal the Core-20 metadata id set exactly —
// a single missing row would otherwise only surface as a runtime throw deep
// inside a recommendation loop (D9/RF-13).
test('RF-11(b): rule id set === LBP_CORE_EXERCISE_METADATA id set', () => {
  const ruleIds = new Set(LBP_EXERCISE_ELIGIBILITY_RULES.map((r) => r.exerciseId))
  const metaIds = new Set(LBP_CORE_EXERCISE_METADATA.map((m) => m.exerciseId))
  assert.equal(ruleIds.size, metaIds.size)
  for (const id of metaIds) assert.ok(ruleIds.has(id), `missing rule for ${id}`)
  for (const id of ruleIds) assert.ok(metaIds.has(id), `rule references non-Core-20 id ${id}`)
})

// ---------- 1. safety dominance ----------

test('routineCareAllowed=false -> STOP_REVIEW for all 20, unconditionally', () => {
  for (const rule of LBP_EXERCISE_ELIGIBILITY_RULES) {
    const result = evaluateLbpExerciseEligibility(rule.exerciseId, context({ routineCareAllowed: false }))
    assert.equal(result.state, 'STOP_REVIEW')
  }
})

// ---------- 2. RF-1: UNKNOWN is never silently treated as ready ----------

test('RF-1 (blank context reproduction): neuroStatus UNKNOWN + every capability UNKNOWN -> 20/20 DEFER_NOT_READY, never START_WITH_REGRESSION', () => {
  const blank = {
    routineCareAllowed: true,
    neuroStatus: 'UNKNOWN',
    distalSymptomResponse: 'UNKNOWN',
    directionalResponse: 'NOT_ASSESSED',
    capabilities: {},
  }
  for (const rule of LBP_EXERCISE_ELIGIBILITY_RULES) {
    const result = evaluateLbpExerciseEligibility(rule.exerciseId, blank)
    assert.equal(result.state, 'DEFER_NOT_READY', `${rule.exerciseId} must DEFER in blank context (Opus D1 reproduction)`)
  }
})

// RF-11(a): the exact judgment-call case the brief names — a regressible-
// only exercise (no hard requirements) with neuroStatus UNKNOWN. Before
// RF-1, LBP_LUMBAR_03 with SUPINE_TOLERATED unconfirmed reached
// START_WITH_REGRESSION without ever consulting neuroStatus (the neuro
// check sat AFTER the regression return). This is the literal reproduction
// of that bug on a single exercise, not just the "everything blank"
// aggregate case above.
test('RF-1 regression test: LBP_LUMBAR_03 (regressible-only) with neuroStatus UNKNOWN and SUPINE_TOLERATED unconfirmed -> DEFER_NOT_READY, not START_WITH_REGRESSION', () => {
  const result = evaluateLbpExerciseEligibility(
    'LBP_LUMBAR_03',
    context({ neuroStatus: 'UNKNOWN', capabilities: { ...allYes, SUPINE_TOLERATED: 'UNKNOWN' } }),
  )
  assert.equal(result.state, 'DEFER_NOT_READY')
  assert.ok(result.regressionRequirements.includes('SUPINE_TOLERATED'), 'regression info is preserved on the DEFER return, not dropped')
})

test('neuroStatus UNKNOWN + no regressible deficit (LBP_NEURAL_01, regressibleRequirements=[]) -> DEFER_NOT_READY', () => {
  const result = evaluateLbpExerciseEligibility('LBP_NEURAL_01', context({ neuroStatus: 'UNKNOWN' }))
  assert.equal(result.state, 'DEFER_NOT_READY')
})

// Verification gate item #5's exact phrasing: a regressible-only exercise
// with EVERY capability already confirmed YES (regressionNeeds is empty --
// without RF-1 this falls all the way through to the final START_AS_WRITTEN
// return) must still DEFER on neuroStatus UNKNOWN. This is the strongest
// form of the RF-1 regression: the previous case above still had an
// unconfirmed capability to fall back on; this one has none.
test('RF-1 (strongest form): LBP_LUMBAR_03 (regressible-only) with EVERY capability confirmed YES but neuroStatus UNKNOWN -> DEFER_NOT_READY, never START_AS_WRITTEN', () => {
  const result = evaluateLbpExerciseEligibility('LBP_LUMBAR_03', context({ neuroStatus: 'UNKNOWN' }))
  assert.equal(result.state, 'DEFER_NOT_READY')
  assert.deepEqual(result.regressionRequirements, [], 'nothing is actually missing -- the DEFER is caused by neuroStatus alone')
})

test('capability UNKNOWN (hard requirement) -> DEFER_NOT_READY with missingHardRequirements populated', () => {
  // Post RF-7b, LOAD_READY is regressible on LOAD_02 — HIP_HINGE_CONTROL is
  // the one that stays hard.
  const result = evaluateLbpExerciseEligibility(
    'LBP_LOAD_02',
    context({ capabilities: { ...allYes, HIP_HINGE_CONTROL: 'UNKNOWN' } }),
  )
  assert.equal(result.state, 'DEFER_NOT_READY')
  assert.ok(result.missingHardRequirements.includes('HIP_HINGE_CONTROL'))
})

test('RF-7b: LOAD_READY unconfirmed on LBP_LOAD_02 (now regressible) -> START_WITH_REGRESSION, not DEFER', () => {
  const result = evaluateLbpExerciseEligibility(
    'LBP_LOAD_02',
    context({ capabilities: { ...allYes, LOAD_READY: 'UNKNOWN' } }),
  )
  assert.equal(result.state, 'START_WITH_REGRESSION')
  assert.deepEqual(result.regressionRequirements, ['LOAD_READY'])
})

test('a regressible deficit produces a lower-entry start, not false readiness and not automatic prohibition (LBP_LUMBAR_03, unaffected by RF-6)', () => {
  const result = evaluateLbpExerciseEligibility(
    'LBP_LUMBAR_03',
    context({ capabilities: { ...allYes, SUPINE_TOLERATED: 'NO' } }),
  )
  assert.equal(result.state, 'START_WITH_REGRESSION')
  assert.ok(result.regressionRequirements.includes('SUPINE_TOLERATED'))
})

// ---------- 3. RF-4/5/6/7/7b: hard/regressible reclassification ----------

test('RF-4: LBP_ACT_02 — SAFE_WALKING is now hard (was regressible)', () => {
  const rule = getLbpExerciseEligibilityRule('LBP_ACT_02')
  assert.deepEqual([...rule.hardRequirements].sort(), ['CAN_SELF_PACE', 'SAFE_WALKING'])
  assert.deepEqual(rule.regressibleRequirements, [])
  const result = evaluateLbpExerciseEligibility(
    'LBP_ACT_02',
    context({ capabilities: { ...allYes, SAFE_WALKING: 'UNKNOWN' } }),
  )
  assert.equal(result.state, 'DEFER_NOT_READY')
  assert.ok(result.missingHardRequirements.includes('SAFE_WALKING'))
})

test('RF-5: LBP_FUNC_01 — BALANCE_WITH_SUPPORT hard, SUPPORTED_STANDING_TOLERATED regressible', () => {
  const rule = getLbpExerciseEligibilityRule('LBP_FUNC_01')
  assert.deepEqual(rule.hardRequirements, ['BALANCE_WITH_SUPPORT'])
  assert.deepEqual(rule.regressibleRequirements, ['SUPPORTED_STANDING_TOLERATED'])
  const missingBalance = evaluateLbpExerciseEligibility(
    'LBP_FUNC_01',
    context({ capabilities: { ...allYes, BALANCE_WITH_SUPPORT: 'UNKNOWN' } }),
  )
  assert.equal(missingBalance.state, 'DEFER_NOT_READY')
  const missingStanding = evaluateLbpExerciseEligibility(
    'LBP_FUNC_01',
    context({ capabilities: { ...allYes, SUPPORTED_STANDING_TOLERATED: 'UNKNOWN' } }),
  )
  assert.equal(missingStanding.state, 'START_WITH_REGRESSION')
})

test('RF-6: LUMBAR_02/TRUNK_03/DEEP_TRUNK_03/TRUNK_END_01 posture-tolerance is hard; LUMBAR_03/DEEP_TRUNK_01 stay regressible', () => {
  assert.deepEqual(getLbpExerciseEligibilityRule('LBP_LUMBAR_02').hardRequirements, ['QUADRUPED_TOLERATED'])
  assert.deepEqual(getLbpExerciseEligibilityRule('LBP_LUMBAR_02').regressibleRequirements, [])
  assert.deepEqual(
    [...getLbpExerciseEligibilityRule('LBP_TRUNK_03').hardRequirements].sort(),
    ['LOW_LOAD_TRUNK_CONTROL', 'QUADRUPED_TOLERATED'],
  )
  assert.deepEqual(getLbpExerciseEligibilityRule('LBP_TRUNK_03').regressibleRequirements, [])
  assert.deepEqual(
    [...getLbpExerciseEligibilityRule('LBP_DEEP_TRUNK_03').hardRequirements].sort(),
    ['LOW_LOAD_TRUNK_CONTROL', 'SUPINE_TOLERATED'],
  )
  assert.deepEqual(getLbpExerciseEligibilityRule('LBP_TRUNK_END_01').hardRequirements, ['SUPINE_TOLERATED'])
  assert.deepEqual(getLbpExerciseEligibilityRule('LBP_TRUNK_END_01').regressibleRequirements, [])

  // No-action pin: these two stay regressible (Opus §4 explicit exception).
  assert.deepEqual(getLbpExerciseEligibilityRule('LBP_LUMBAR_03').hardRequirements, [])
  assert.deepEqual(getLbpExerciseEligibilityRule('LBP_LUMBAR_03').regressibleRequirements, ['SUPINE_TOLERATED'])

  const result = evaluateLbpExerciseEligibility(
    'LBP_TRUNK_END_01',
    context({ capabilities: { ...allYes, SUPINE_TOLERATED: 'NO' } }),
  )
  assert.equal(result.state, 'DEFER_NOT_READY', 'a structurally-required posture must not be START_WITH_REGRESSION')
})

test('RF-10: LBP_DEEP_TRUNK_01 — NATURAL_BREATHING_TOLERATED hard, SUPINE_TOLERATED regressible', () => {
  const rule = getLbpExerciseEligibilityRule('LBP_DEEP_TRUNK_01')
  assert.deepEqual(rule.hardRequirements, ['NATURAL_BREATHING_TOLERATED'])
  assert.deepEqual(rule.regressibleRequirements, ['SUPINE_TOLERATED'])
  const missingBreathing = evaluateLbpExerciseEligibility(
    'LBP_DEEP_TRUNK_01',
    context({ capabilities: { ...allYes, NATURAL_BREATHING_TOLERATED: 'UNKNOWN' } }),
  )
  assert.equal(missingBreathing.state, 'DEFER_NOT_READY')
})

test('RF-7: LBP_FUNC_05 — SUPPORTED_STANDING_TOLERATED hard, HIP_HINGE_CONTROL regressible (no longer circular)', () => {
  const rule = getLbpExerciseEligibilityRule('LBP_FUNC_05')
  assert.deepEqual(rule.hardRequirements, ['SUPPORTED_STANDING_TOLERATED'])
  assert.deepEqual(rule.regressibleRequirements, ['HIP_HINGE_CONTROL'])
  const noHinge = evaluateLbpExerciseEligibility(
    'LBP_FUNC_05',
    context({ capabilities: { ...allYes, HIP_HINGE_CONTROL: 'UNKNOWN' } }),
  )
  assert.equal(noHinge.state, 'START_WITH_REGRESSION', 'the exercise that TEACHES hip-hinge control must remain reachable without already having it')
})

// ---------- 4. directional rules ----------

test('directional exercise requires a favorable observed response; no diagnosis is inferred', () => {
  assert.equal(
    evaluateLbpExerciseEligibility('LBP_DIR_03', context({ directionalResponse: 'NOT_ASSESSED' })).state,
    'DEFER_NOT_READY',
  )
  assert.equal(
    evaluateLbpExerciseEligibility('LBP_DIR_03', context({ directionalResponse: 'FLEXION_FAVORABLE' })).state,
    'DEFER_NOT_READY',
  )
  assert.equal(
    evaluateLbpExerciseEligibility('LBP_DIR_03', context({ directionalResponse: 'EXTENSION_FAVORABLE' })).state,
    'START_AS_WRITTEN',
  )
})

// ---------- 5. distal worsening ----------

test('distal worsening triggers STOP_REVIEW for exercises that monitor it', () => {
  for (const id of ['LBP_DIR_02', 'LBP_DIR_03', 'LBP_DIR_04', 'LBP_NEURAL_01', 'LBP_EXPOSURE_01']) {
    const directional = id === 'LBP_DIR_04' || id === 'LBP_EXPOSURE_01' ? 'FLEXION_FAVORABLE' : 'EXTENSION_FAVORABLE'
    const result = evaluateLbpExerciseEligibility(
      id,
      context({ distalSymptomResponse: 'WORSENING', directionalResponse: directional }),
    )
    assert.equal(result.state, 'STOP_REVIEW', `${id} should stop on distal worsening`)
  }
})

test('LBP_REG_01 is the intended exception: stopOnDistalWorsening=false, requiresStableNeuro=false', () => {
  assert.equal(
    evaluateLbpExerciseEligibility('LBP_REG_01', context({ distalSymptomResponse: 'WORSENING' })).state,
    'START_AS_WRITTEN',
  )
})

// ---------- 6. new/worsening neuro ----------

test('new/worsening neuro blocks routine exercise rules', () => {
  for (const id of ['LBP_ACT_01', 'LBP_TRUNK_03', 'LBP_LOAD_02', 'LBP_NEURAL_01']) {
    assert.equal(evaluateLbpExerciseEligibility(id, context({ neuroStatus: 'NEW_OR_WORSENING' })).state, 'STOP_REVIEW')
  }
})

// ---------- 7. representative ready states (all-confirmed context) ----------

test('representative exercises reach START_AS_WRITTEN in an all-confirmed synthetic context', () => {
  for (const id of ['LBP_ACT_01', 'LBP_LUMBAR_02', 'LBP_TRUNK_03', 'LBP_FUNC_01', 'LBP_LOAD_02', 'LBP_NEURAL_01', 'LBP_REG_01']) {
    assert.equal(
      evaluateLbpExerciseEligibility(id, context({ directionalResponse: 'NO_CLEAR_DIRECTION' })).state,
      'START_AS_WRITTEN',
      `${id} should be ready in an all-ready synthetic context`,
    )
  }
})

console.log('LBP Exercise Eligibility (Batch 2, RF-* fixed): PASS')
console.log(`structured rules: ${LBP_EXERCISE_ELIGIBILITY_RULES.length}`)
console.log(`\n${passed} tests passed.`)
