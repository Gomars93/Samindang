import assert from 'node:assert/strict'

const libraryModule = await import('./.lbp-exercise-library-v01-bundle.mjs')
const coreModule = await import('./.lbp-exercise-core-metadata-bundle.mjs')
const selectorModule = await import('./.lbp-rehab-strategy-selector-bundle.mjs')

const { LBP_EXERCISE_LIBRARY } = libraryModule
const { LBP_CORE_EXERCISE_METADATA } = coreModule
const {
  STRATEGY_PRECEDENCE_ORDER,
  LBP_REHAB_STRATEGY_LABEL_KO,
  LBP_REHAB_REGULATION_LABEL_KO,
  selectLbpRehabStrategy,
} = selectorModule

function noIntent(overrides = {}) {
  return {
    symptomResponseGuidedRelevant: false,
    physicalFunctionCapacityRelevant: false,
    neuralMobilityRelevant: false,
    gradedExposureRelevant: false,
    regulationRelevant: false,
    ...overrides,
  }
}

function elig(exerciseId, state, regressionRequirements = []) {
  return {
    exerciseId,
    state,
    reasonsKo: ['SYNTHETIC_TEST_REASON'],
    missingHardRequirements: [],
    regressionRequirements,
  }
}

/** Recursively asserts no field anywhere in `value` is a JS number. */
function assertNoNumericField(value, path = '$') {
  if (typeof value === 'number') {
    assert.fail(`Numeric field found at ${path} — no score/weight is allowed in this contract.`)
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoNumericField(item, `${path}[${index}]`))
    return
  }
  if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      assertNoNumericField(nested, `${path}.${key}`)
    }
  }
}

// 1. Taxonomy is exactly 4 strategies + a separate Regulation adjunct.
assert.equal(STRATEGY_PRECEDENCE_ORDER.length, 4)
assert.deepEqual(new Set(STRATEGY_PRECEDENCE_ORDER), new Set([
  'SYMPTOM_RESPONSE_GUIDED_MOVEMENT',
  'PHYSICAL_FUNCTION_CAPACITY',
  'NEURAL_MOBILITY_MANAGEMENT',
  'GRADED_EXPOSURE_RETURN',
]))
assert.equal(Object.keys(LBP_REHAB_STRATEGY_LABEL_KO).length, 4)
assert.equal(STRATEGY_PRECEDENCE_ORDER.includes('REGULATION'), false)
assert.equal(typeof LBP_REHAB_REGULATION_LABEL_KO, 'string')

// 2. No numeric score/weight anywhere in the selector's output contract.
{
  const result = selectLbpRehabStrategy({
    targetFunction: 'WALKING',
    strategyIntent: noIntent({ physicalFunctionCapacityRelevant: true, regulationRelevant: true }),
    eligibility: [elig('LBP_ACT_01', 'START_AS_WRITTEN'), elig('LBP_REG_01', 'START_AS_WRITTEN')],
  })
  assertNoNumericField(result)
}

// 3. No diagnosis / raw DoctorPayload fields are required by the input contract.
{
  const input = {
    targetFunction: 'WALKING',
    strategyIntent: noIntent({ physicalFunctionCapacityRelevant: true }),
    eligibility: [elig('LBP_ACT_01', 'START_AS_WRITTEN')],
  }
  assert.deepEqual(new Set(Object.keys(input)), new Set(['targetFunction', 'strategyIntent', 'eligibility']))
  assert.deepEqual(
    new Set(Object.keys(input.strategyIntent)),
    new Set([
      'symptomResponseGuidedRelevant',
      'physicalFunctionCapacityRelevant',
      'neuralMobilityRelevant',
      'gradedExposureRelevant',
      'regulationRelevant',
    ]),
  )
  // Never throws or requires an extra diagnosis-shaped field.
  assert.doesNotThrow(() => selectLbpRehabStrategy(input))
}

// 4. The selector consumes Eligibility state as given; it never recomputes it.
{
  // LBP_LOAD_02 normally requires HIP_HINGE_CONTROL + LOAD_READY, but this
  // selector must trust the upstream `state` field directly, not re-derive it.
  const result = selectLbpRehabStrategy({
    targetFunction: 'LIFTING',
    strategyIntent: noIntent({ physicalFunctionCapacityRelevant: true }),
    eligibility: [elig('LBP_LOAD_02', 'START_AS_WRITTEN')],
  })
  assert.equal(result.candidates.some((c) => c.exerciseId === 'LBP_LOAD_02'), true)
}

// 5 & 6. Only START_AS_WRITTEN / START_WITH_REGRESSION become candidates;
// DEFER_NOT_READY / STOP_REVIEW are never resurrected.
{
  const result = selectLbpRehabStrategy({
    targetFunction: 'WALKING',
    strategyIntent: noIntent({ physicalFunctionCapacityRelevant: true }),
    eligibility: [
      elig('LBP_ACT_01', 'DEFER_NOT_READY'),
      elig('LBP_ACT_02', 'STOP_REVIEW'),
      elig('LBP_TRUNK_03', 'START_AS_WRITTEN'),
    ],
  })
  const allIds = [...result.candidates, ...result.eligiblePool, ...result.notSelectedToday].map((c) => c.exerciseId)
  assert.equal(allIds.includes('LBP_ACT_01'), false)
  assert.equal(allIds.includes('LBP_ACT_02'), false)
}

// 7. Regression state is preserved and explained, not numerically penalized.
{
  const result = selectLbpRehabStrategy({
    targetFunction: 'LIFTING',
    strategyIntent: noIntent({ physicalFunctionCapacityRelevant: true }),
    eligibility: [elig('LBP_TRUNK_03', 'START_WITH_REGRESSION', ['QUADRUPED_TOLERATED'])],
  })
  const candidate = result.candidates.find((c) => c.exerciseId === 'LBP_TRUNK_03')
  assert.ok(candidate)
  assert.equal(candidate.eligibilityState, 'START_WITH_REGRESSION')
  assert.deepEqual(candidate.regressionRequirements, ['QUADRUPED_TOLERATED'])
  assert.match(candidate.rationaleKo, /regression/)
}

// 8. Primary is exactly one when a plan can be formed; otherwise explicit unresolved/gap.
{
  const resolved = selectLbpRehabStrategy({
    targetFunction: 'WALKING',
    strategyIntent: noIntent({ physicalFunctionCapacityRelevant: true }),
    eligibility: [elig('LBP_ACT_01', 'START_AS_WRITTEN')],
  })
  assert.equal(resolved.status, 'RESOLVED')
  assert.equal(resolved.primaryStrategy, 'PHYSICAL_FUNCTION_CAPACITY')

  const unresolved = selectLbpRehabStrategy({
    targetFunction: 'WALKING',
    strategyIntent: noIntent(),
    eligibility: [elig('LBP_ACT_01', 'START_AS_WRITTEN')],
  })
  assert.equal(unresolved.status, 'UNRESOLVED_NO_PRIMARY_STRATEGY')
  assert.equal(unresolved.primaryStrategy, null)
  assert.ok(unresolved.gaps.some((g) => g.type === 'NO_PRIMARY_STRATEGY_RESOLVED'))
}

// 9. Secondary is 0 or 1, and never forced.
{
  const noSecondary = selectLbpRehabStrategy({
    targetFunction: 'WALKING',
    strategyIntent: noIntent({ physicalFunctionCapacityRelevant: true }),
    eligibility: [elig('LBP_ACT_01', 'START_AS_WRITTEN')],
  })
  assert.equal(noSecondary.secondaryStrategy, null)

  const withSecondary = selectLbpRehabStrategy({
    targetFunction: 'WALKING',
    strategyIntent: noIntent({ symptomResponseGuidedRelevant: true, physicalFunctionCapacityRelevant: true }),
    eligibility: [elig('LBP_DIR_02', 'START_AS_WRITTEN'), elig('LBP_ACT_01', 'START_AS_WRITTEN')],
  })
  assert.equal(withSecondary.primaryStrategy, 'SYMPTOM_RESPONSE_GUIDED_MOVEMENT')
  assert.equal(withSecondary.secondaryStrategy, 'PHYSICAL_FUNCTION_CAPACITY')
}

// 10. Regulation is adjunct: it never displaces a functional Primary/Secondary by itself.
{
  const result = selectLbpRehabStrategy({
    targetFunction: 'WALKING',
    strategyIntent: noIntent({
      symptomResponseGuidedRelevant: true,
      physicalFunctionCapacityRelevant: true,
      regulationRelevant: true,
    }),
    eligibility: [
      elig('LBP_DIR_02', 'START_AS_WRITTEN'),
      elig('LBP_DIR_03', 'START_AS_WRITTEN'),
      elig('LBP_ACT_01', 'START_AS_WRITTEN'),
      elig('LBP_REG_01', 'START_AS_WRITTEN'),
    ],
  })
  assert.equal(result.candidates.length, 3)
  assert.equal(result.candidates.filter((c) => c.slot === 'PRIMARY').length, 2)
  assert.equal(result.candidates.filter((c) => c.slot === 'SECONDARY').length, 1)
  assert.equal(result.candidates.some((c) => c.slot === 'REGULATION'), false)
}

// 11. First-view exercise candidates never exceed 3.
{
  const result = selectLbpRehabStrategy({
    targetFunction: 'WORK',
    strategyIntent: noIntent({
      symptomResponseGuidedRelevant: true,
      physicalFunctionCapacityRelevant: true,
      regulationRelevant: true,
    }),
    eligibility: [
      elig('LBP_DIR_02', 'START_AS_WRITTEN'),
      elig('LBP_DIR_03', 'START_AS_WRITTEN'),
      elig('LBP_ACT_01', 'START_AS_WRITTEN'),
      elig('LBP_HIP_STR_03', 'START_AS_WRITTEN'),
      elig('LBP_REG_01', 'START_AS_WRITTEN'),
    ],
  })
  assert.ok(result.candidates.length <= 3)
}

// 12. Target Function match influences exact exercise choice inside the strategy.
{
  const result = selectLbpRehabStrategy({
    targetFunction: 'SLEEP',
    strategyIntent: noIntent({ physicalFunctionCapacityRelevant: true }),
    eligibility: [
      elig('LBP_LUMBAR_03', 'START_AS_WRITTEN'), // targetFunctions include SLEEP
      elig('LBP_HIP_STR_03', 'START_AS_WRITTEN'), // does not include SLEEP
    ],
  })
  const primaryCandidates = result.candidates.filter((c) => c.slot === 'PRIMARY')
  assert.equal(primaryCandidates.length, 2)
  assert.equal(primaryCandidates[0].exerciseId, 'LBP_LUMBAR_03')
  assert.equal(primaryCandidates[0].matchesTargetFunction, true)
  assert.equal(primaryCandidates[1].matchesTargetFunction, false)
}

// 13. Equal clinical candidates are not silently resolved by source/array order.
{
  const result = selectLbpRehabStrategy({
    targetFunction: 'SITTING',
    strategyIntent: noIntent({ gradedExposureRelevant: true }),
    eligibility: [
      elig('LBP_EXPOSURE_01', 'START_AS_WRITTEN'), // does not target SITTING
      elig('LBP_EXPOSURE_03', 'START_AS_WRITTEN'), // targets SITTING
    ],
  })
  // Only one GRADED_EXPOSURE_RETURN slot as Primary allows up to 2, so this
  // pair (1 matched + 1 unmatched) fits without a tie; force an actual tie
  // by using Secondary capacity (1) against two equally-unmatched items.
  const tieResult = selectLbpRehabStrategy({
    targetFunction: 'CUSTOM',
    strategyIntent: noIntent({ symptomResponseGuidedRelevant: true, gradedExposureRelevant: true }),
    eligibility: [
      elig('LBP_DIR_02', 'START_AS_WRITTEN'),
      elig('LBP_EXPOSURE_01', 'START_AS_WRITTEN'),
      elig('LBP_EXPOSURE_03', 'START_AS_WRITTEN'),
    ],
  })
  assert.equal(tieResult.candidates.some((c) => c.slot === 'SECONDARY'), false)
  const tie = tieResult.tiedAtCutoff.find((t) => t.slot === 'SECONDARY')
  assert.ok(tie, 'expected an explicit tie for the Secondary slot')
  assert.deepEqual(new Set(tie.exerciseIds), new Set(['LBP_EXPOSURE_01', 'LBP_EXPOSURE_03']))

  assert.ok(result) // first (non-tied) construction above also succeeds
}

// 14. Unshown eligible candidates remain auditable, not converted to negative/ineligible.
{
  const result = selectLbpRehabStrategy({
    targetFunction: 'WALKING',
    strategyIntent: noIntent({ physicalFunctionCapacityRelevant: true }),
    eligibility: [
      elig('LBP_ACT_01', 'START_AS_WRITTEN'),
      elig('LBP_ACT_02', 'START_AS_WRITTEN'),
      elig('LBP_LUMBAR_02', 'START_AS_WRITTEN'),
      elig('LBP_LUMBAR_03', 'START_AS_WRITTEN'),
      elig('LBP_HIP_MOB_01', 'START_AS_WRITTEN'),
    ],
  })
  assert.ok(result.notSelectedToday.length > 0)
  for (const item of result.notSelectedToday) {
    assert.equal(['START_AS_WRITTEN', 'START_WITH_REGRESSION'].includes(item.eligibilityState), true)
    assert.equal(result.eligiblePool.some((p) => p.exerciseId === item.exerciseId), true)
  }
}

// 15. No matching eligible exercise returns an explicit gap.
{
  const result = selectLbpRehabStrategy({
    targetFunction: 'WALKING',
    strategyIntent: noIntent({ neuralMobilityRelevant: true }),
    eligibility: [], // LBP_NEURAL_01 not eligible at all
  })
  assert.ok(
    result.gaps.some(
      (g) => g.type === 'NO_MATCHING_ELIGIBLE_EXERCISE' && g.slot === 'PRIMARY' && g.strategy === 'NEURAL_MOBILITY_MANAGEMENT',
    ),
  )
  assert.equal(result.candidates.length, 0)
}

// 16. Canonical catalog remains 57, Core-20 remains 20; no new exercise IDs are introduced.
{
  assert.equal(LBP_EXERCISE_LIBRARY.length, 57)
  assert.equal(LBP_CORE_EXERCISE_METADATA.length, 20)
  const coreIds = new Set(LBP_CORE_EXERCISE_METADATA.map((item) => item.exerciseId))
  const result = selectLbpRehabStrategy({
    targetFunction: 'WALKING',
    strategyIntent: noIntent({ physicalFunctionCapacityRelevant: true, regulationRelevant: true }),
    eligibility: [elig('LBP_ACT_01', 'START_AS_WRITTEN'), elig('LBP_REG_01', 'START_AS_WRITTEN')],
  })
  for (const candidate of [...result.candidates, ...result.eligiblePool]) {
    assert.equal(coreIds.has(candidate.exerciseId), true)
  }
}

console.log('LBP Rehab Strategy Selector v0.1: PASS')
