import assert from 'node:assert/strict'

const mod = await import('./.lbp-exercise-eligibility-bundle.mjs')
const {
  LBP_EXERCISE_ELIGIBILITY_RULES,
  evaluateLbpExerciseEligibility,
  getLbpExerciseEligibilityRule,
} = mod

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

assert.equal(LBP_EXERCISE_ELIGIBILITY_RULES.length, 20)
assert.equal(new Set(LBP_EXERCISE_ELIGIBILITY_RULES.map((r) => r.exerciseId)).size, 20)
for (const rule of LBP_EXERCISE_ELIGIBILITY_RULES) {
  assert.deepEqual(getLbpExerciseEligibilityRule(rule.exerciseId), rule)
}

// Safety gate wins for every Core-20 exercise.
for (const rule of LBP_EXERCISE_ELIGIBILITY_RULES) {
  const result = evaluateLbpExerciseEligibility(rule.exerciseId, context({ routineCareAllowed: false }))
  assert.equal(result.state, 'STOP_REVIEW')
}

// UNKNOWN is never silently treated as ready.
const unknownNeuro = evaluateLbpExerciseEligibility(
  'LBP_NEURAL_01',
  context({ neuroStatus: 'UNKNOWN' }),
)
assert.equal(unknownNeuro.state, 'DEFER_NOT_READY')

const unknownHard = evaluateLbpExerciseEligibility(
  'LBP_LOAD_02',
  context({ capabilities: { ...allYes, LOAD_READY: 'UNKNOWN' } }),
)
assert.equal(unknownHard.state, 'DEFER_NOT_READY')
assert.ok(unknownHard.missingHardRequirements.includes('LOAD_READY'))

// A regressible deficit produces a lower-entry start, not false readiness and not automatic prohibition.
const birdDogRegression = evaluateLbpExerciseEligibility(
  'LBP_TRUNK_03',
  context({ capabilities: { ...allYes, QUADRUPED_TOLERATED: 'NO' } }),
)
assert.equal(birdDogRegression.state, 'START_WITH_REGRESSION')
assert.ok(birdDogRegression.regressionRequirements.includes('QUADRUPED_TOLERATED'))

// Directional exercise requires a favorable observed response; no diagnosis is inferred.
assert.equal(
  evaluateLbpExerciseEligibility(
    'LBP_DIR_03',
    context({ directionalResponse: 'NOT_ASSESSED' }),
  ).state,
  'DEFER_NOT_READY',
)
assert.equal(
  evaluateLbpExerciseEligibility(
    'LBP_DIR_03',
    context({ directionalResponse: 'FLEXION_FAVORABLE' }),
  ).state,
  'DEFER_NOT_READY',
)
assert.equal(
  evaluateLbpExerciseEligibility(
    'LBP_DIR_03',
    context({ directionalResponse: 'EXTENSION_FAVORABLE' }),
  ).state,
  'START_AS_WRITTEN',
)

// Distal worsening triggers stop/review for exercises that explicitly monitor it.
for (const id of ['LBP_DIR_02', 'LBP_DIR_03', 'LBP_DIR_04', 'LBP_NEURAL_01', 'LBP_EXPOSURE_01']) {
  const directional = id === 'LBP_DIR_04' || id === 'LBP_EXPOSURE_01'
    ? 'FLEXION_FAVORABLE'
    : 'EXTENSION_FAVORABLE'
  const result = evaluateLbpExerciseEligibility(
    id,
    context({ distalSymptomResponse: 'WORSENING', directionalResponse: directional }),
  )
  assert.equal(result.state, 'STOP_REVIEW', `${id} should stop on distal worsening`)
}

// Regulation is not falsely coupled to distal symptom logic, but the global safety gate still wins above.
assert.equal(
  evaluateLbpExerciseEligibility(
    'LBP_REG_01',
    context({ distalSymptomResponse: 'WORSENING' }),
  ).state,
  'START_AS_WRITTEN',
)

// New/worsening neuro blocks routine exercise rules when the upstream safety gate has not yet been refreshed.
for (const id of ['LBP_ACT_01', 'LBP_TRUNK_03', 'LBP_LOAD_02', 'LBP_NEURAL_01']) {
  assert.equal(
    evaluateLbpExerciseEligibility(id, context({ neuroStatus: 'NEW_OR_WORSENING' })).state,
    'STOP_REVIEW',
  )
}

// Representative ready states.
for (const id of ['LBP_ACT_01', 'LBP_LUMBAR_02', 'LBP_TRUNK_03', 'LBP_FUNC_01', 'LBP_LOAD_02', 'LBP_NEURAL_01', 'LBP_REG_01']) {
  const directionalResponse = 'NO_CLEAR_DIRECTION'
  assert.equal(
    evaluateLbpExerciseEligibility(id, context({ directionalResponse })).state,
    'START_AS_WRITTEN',
    `${id} should be ready in an all-ready synthetic context`,
  )
}

console.log('LBP Exercise Eligibility v0.1: PASS')
console.log(`structured rules: ${LBP_EXERCISE_ELIGIBILITY_RULES.length}`)
console.log('No ranking, diagnosis mapping, new patient question, or response threshold is encoded.')
