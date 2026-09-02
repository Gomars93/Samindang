import assert from 'node:assert/strict'

const libraryModule = await import('./.lbp-exercise-library-v01-bundle.mjs')
const coreModule = await import('./.lbp-exercise-core-metadata-bundle.mjs')
const selectorModule = await import('./.lbp-rehab-strategy-selector-bundle.mjs')

const { LBP_EXERCISE_LIBRARY } = libraryModule
const { LBP_CORE_EXERCISE_METADATA } = coreModule
const {
  LBP_REHAB_STRATEGIES,
  LBP_REHAB_STRATEGY_LABEL_KO,
  LBP_REHAB_REGULATION_LABEL_KO,
  selectLbpRehabStrategy,
} = selectorModule

function selection(primaryStrategy, secondaryStrategy = null, regulationRelevant = false) {
  return { primaryStrategy, secondaryStrategy, regulationRelevant }
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

// 1. Taxonomy is exactly 4 strategies + separate Regulation; array is membership, not precedence.
assert.equal(LBP_REHAB_STRATEGIES.length, 4)
assert.deepEqual(new Set(LBP_REHAB_STRATEGIES), new Set([
  'SYMPTOM_RESPONSE_GUIDED_MOVEMENT',
  'PHYSICAL_FUNCTION_CAPACITY',
  'NEURAL_MOBILITY_MANAGEMENT',
  'GRADED_EXPOSURE_RETURN',
]))
assert.equal(Object.keys(LBP_REHAB_STRATEGY_LABEL_KO).length, 4)
assert.equal(LBP_REHAB_STRATEGIES.includes('REGULATION'), false)
assert.equal(typeof LBP_REHAB_REGULATION_LABEL_KO, 'string')
assert.equal('STRATEGY_PRECEDENCE_ORDER' in selectorModule, false)

// 2. No numeric score/weight anywhere in the selector output.
{
  const result = selectLbpRehabStrategy({
    targetFunction: 'WORK',
    strategySelection: selection('PHYSICAL_FUNCTION_CAPACITY', null, true),
    eligibility: [elig('LBP_FUNC_01', 'START_AS_WRITTEN'), elig('LBP_REG_01', 'START_AS_WRITTEN')],
  })
  assertNoNumericField(result)
}

// 3. Selector input contains already-resolved strategies, not raw patient/diagnosis fields.
{
  const input = {
    targetFunction: 'WALKING',
    strategySelection: selection('PHYSICAL_FUNCTION_CAPACITY'),
    eligibility: [elig('LBP_ACT_01', 'START_AS_WRITTEN')],
  }
  assert.deepEqual(new Set(Object.keys(input)), new Set(['targetFunction', 'strategySelection', 'eligibility']))
  assert.deepEqual(
    new Set(Object.keys(input.strategySelection)),
    new Set(['primaryStrategy', 'secondaryStrategy', 'regulationRelevant']),
  )
  assert.doesNotThrow(() => selectLbpRehabStrategy(input))
}

// 4. Eligibility is consumed as given; selector does not re-derive readiness.
{
  const result = selectLbpRehabStrategy({
    targetFunction: 'LIFTING',
    strategySelection: selection('PHYSICAL_FUNCTION_CAPACITY'),
    eligibility: [elig('LBP_LOAD_02', 'START_AS_WRITTEN')],
  })
  assert.equal(result.candidates.some((c) => c.exerciseId === 'LBP_LOAD_02'), true)
}

// 5 & 6. DEFER/STOP are never resurrected; only eligible states enter pools/candidates.
{
  const result = selectLbpRehabStrategy({
    targetFunction: 'WALKING',
    strategySelection: selection('PHYSICAL_FUNCTION_CAPACITY'),
    eligibility: [
      elig('LBP_ACT_01', 'DEFER_NOT_READY'),
      elig('LBP_ACT_02', 'STOP_REVIEW'),
      elig('LBP_HIP_STR_03', 'START_AS_WRITTEN'),
    ],
  })
  const allIds = [...result.candidates, ...result.eligiblePool, ...result.notSelectedToday].map((c) => c.exerciseId)
  assert.equal(allIds.includes('LBP_ACT_01'), false)
  assert.equal(allIds.includes('LBP_ACT_02'), false)
  assert.equal(allIds.includes('LBP_HIP_STR_03'), true)
}

// 7. Regression is preserved and explained, not scored down.
{
  const result = selectLbpRehabStrategy({
    targetFunction: 'LIFTING',
    strategySelection: selection('PHYSICAL_FUNCTION_CAPACITY'),
    eligibility: [elig('LBP_TRUNK_03', 'START_WITH_REGRESSION', ['QUADRUPED_TOLERATED'])],
  })
  const candidate = result.candidates.find((c) => c.exerciseId === 'LBP_TRUNK_03')
  assert.ok(candidate)
  assert.equal(candidate.eligibilityState, 'START_WITH_REGRESSION')
  assert.deepEqual(candidate.regressionRequirements, ['QUADRUPED_TOLERATED'])
  assert.match(candidate.rationaleKo, /regression/)
}

// 8. Primary/Secondary are honored exactly as upstream resolved them; selector adds no precedence rule.
{
  const result = selectLbpRehabStrategy({
    targetFunction: 'WALKING',
    strategySelection: selection('PHYSICAL_FUNCTION_CAPACITY', 'SYMPTOM_RESPONSE_GUIDED_MOVEMENT'),
    eligibility: [elig('LBP_ACT_01', 'START_AS_WRITTEN'), elig('LBP_DIR_02', 'START_AS_WRITTEN')],
  })
  assert.equal(result.status, 'RESOLVED')
  assert.equal(result.primaryStrategy, 'PHYSICAL_FUNCTION_CAPACITY')
  assert.equal(result.secondaryStrategy, 'SYMPTOM_RESPONSE_GUIDED_MOVEMENT')
  assert.equal(result.candidates.some((c) => c.slot === 'PRIMARY' && c.exerciseId === 'LBP_ACT_01'), true)
  assert.equal(result.candidates.some((c) => c.slot === 'SECONDARY' && c.exerciseId === 'LBP_DIR_02'), true)

  const unresolved = selectLbpRehabStrategy({
    targetFunction: 'WALKING',
    strategySelection: selection(null),
    eligibility: [elig('LBP_ACT_01', 'START_AS_WRITTEN')],
  })
  assert.equal(unresolved.status, 'UNRESOLVED_NO_PRIMARY_STRATEGY')
  assert.equal(unresolved.primaryStrategy, null)
  assert.ok(unresolved.gaps.some((g) => g.type === 'NO_PRIMARY_STRATEGY_RESOLVED'))
}

// 9. Secondary is optional and never fabricated.
{
  const result = selectLbpRehabStrategy({
    targetFunction: 'WALKING',
    strategySelection: selection('PHYSICAL_FUNCTION_CAPACITY'),
    eligibility: [elig('LBP_ACT_01', 'START_AS_WRITTEN')],
  })
  assert.equal(result.secondaryStrategy, null)
}

// 10. Regulation remains an adjunct and does not become Primary.
{
  const result = selectLbpRehabStrategy({
    targetFunction: 'WORK',
    strategySelection: selection('PHYSICAL_FUNCTION_CAPACITY', null, true),
    eligibility: [elig('LBP_FUNC_01', 'START_AS_WRITTEN'), elig('LBP_REG_01', 'START_AS_WRITTEN')],
  })
  assert.equal(result.primaryStrategy, 'PHYSICAL_FUNCTION_CAPACITY')
  assert.equal(result.regulationAdjunctState, 'RELEVANT')
  assert.equal(result.candidates.some((c) => c.slot === 'PRIMARY' && c.exerciseId === 'LBP_FUNC_01'), true)
  assert.equal(result.candidates.some((c) => c.slot === 'REGULATION' && c.exerciseId === 'LBP_REG_01'), true)
}

// 11. First view never exceeds 3 candidates.
{
  const result = selectLbpRehabStrategy({
    targetFunction: 'WALKING',
    strategySelection: selection('PHYSICAL_FUNCTION_CAPACITY', 'SYMPTOM_RESPONSE_GUIDED_MOVEMENT', true),
    eligibility: [
      elig('LBP_ACT_01', 'START_AS_WRITTEN'),
      elig('LBP_ACT_02', 'START_AS_WRITTEN'),
      elig('LBP_DIR_02', 'START_AS_WRITTEN'),
      elig('LBP_REG_01', 'START_AS_WRITTEN'),
    ],
  })
  assert.ok(result.candidates.length <= 3)
}

// 12. Primary/Secondary candidates require an exact Target Function link; unrelated eligible items stay audit-only.
{
  const result = selectLbpRehabStrategy({
    targetFunction: 'SLEEP',
    strategySelection: selection('PHYSICAL_FUNCTION_CAPACITY'),
    eligibility: [
      elig('LBP_LUMBAR_03', 'START_AS_WRITTEN'), // SLEEP match
      elig('LBP_ACT_01', 'START_AS_WRITTEN'), // eligible capacity item, but not SLEEP
    ],
  })
  assert.deepEqual(result.candidates.map((c) => c.exerciseId), ['LBP_LUMBAR_03'])
  assert.equal(result.candidates[0].matchesTargetFunction, true)
  assert.equal(result.notSelectedToday.some((c) => c.exerciseId === 'LBP_ACT_01'), true)
  assert.equal(result.notSelectedToday.find((c) => c.exerciseId === 'LBP_ACT_01').matchesTargetFunction, false)
}

// 13. Equal exact matches at a cutoff are surfaced as a tie, never resolved by array/catalog order.
{
  const result = selectLbpRehabStrategy({
    targetFunction: 'WALKING',
    strategySelection: selection('SYMPTOM_RESPONSE_GUIDED_MOVEMENT', 'PHYSICAL_FUNCTION_CAPACITY'),
    eligibility: [
      elig('LBP_DIR_02', 'START_AS_WRITTEN'),
      elig('LBP_ACT_01', 'START_AS_WRITTEN'),
      elig('LBP_ACT_02', 'START_AS_WRITTEN'),
    ],
  })
  assert.equal(result.candidates.some((c) => c.slot === 'SECONDARY'), false)
  const tie = result.tiedAtCutoff.find((t) => t.slot === 'SECONDARY')
  assert.ok(tie)
  assert.deepEqual(new Set(tie.exerciseIds), new Set(['LBP_ACT_01', 'LBP_ACT_02']))
}

// 14. Unshown eligible items remain auditable, never converted to negative/ineligible.
{
  const result = selectLbpRehabStrategy({
    targetFunction: 'WALKING',
    strategySelection: selection('SYMPTOM_RESPONSE_GUIDED_MOVEMENT', 'PHYSICAL_FUNCTION_CAPACITY'),
    eligibility: [
      elig('LBP_DIR_02', 'START_AS_WRITTEN'),
      elig('LBP_ACT_01', 'START_AS_WRITTEN'),
      elig('LBP_ACT_02', 'START_WITH_REGRESSION'),
    ],
  })
  for (const item of result.notSelectedToday) {
    assert.equal(['START_AS_WRITTEN', 'START_WITH_REGRESSION'].includes(item.eligibilityState), true)
    assert.equal(result.eligiblePool.some((p) => p.exerciseId === item.exerciseId), true)
  }
}

// 15. A strategy may have eligible exercises but still has an explicit gap if none match Target Function.
{
  const result = selectLbpRehabStrategy({
    targetFunction: 'SLEEP',
    strategySelection: selection('PHYSICAL_FUNCTION_CAPACITY'),
    eligibility: [elig('LBP_ACT_01', 'START_AS_WRITTEN')], // eligible but unrelated to SLEEP
  })
  assert.equal(result.candidates.length, 0)
  assert.ok(
    result.gaps.some(
      (g) => g.type === 'NO_MATCHING_ELIGIBLE_EXERCISE' && g.slot === 'PRIMARY' && g.strategy === 'PHYSICAL_FUNCTION_CAPACITY',
    ),
  )
  assert.equal(result.notSelectedToday.some((c) => c.exerciseId === 'LBP_ACT_01'), true)
}

// 16. Catalog invariants remain unchanged.
{
  assert.equal(LBP_EXERCISE_LIBRARY.length, 57)
  assert.equal(LBP_CORE_EXERCISE_METADATA.length, 20)
  const coreIds = new Set(LBP_CORE_EXERCISE_METADATA.map((item) => item.exerciseId))
  const result = selectLbpRehabStrategy({
    targetFunction: 'WORK',
    strategySelection: selection('PHYSICAL_FUNCTION_CAPACITY', null, true),
    eligibility: [elig('LBP_FUNC_01', 'START_AS_WRITTEN'), elig('LBP_REG_01', 'START_AS_WRITTEN')],
  })
  for (const candidate of [...result.candidates, ...result.eligiblePool]) {
    assert.equal(coreIds.has(candidate.exerciseId), true)
  }
}

// 17. Invalid normalized strategy selections fail structurally rather than being silently reinterpreted.
{
  assert.throws(
    () => selectLbpRehabStrategy({
      targetFunction: 'WALKING',
      strategySelection: selection(null, 'PHYSICAL_FUNCTION_CAPACITY'),
      eligibility: [],
    }),
    /Secondary rehab strategy cannot exist without a resolved Primary/,
  )

  assert.throws(
    () => selectLbpRehabStrategy({
      targetFunction: 'WALKING',
      strategySelection: selection('PHYSICAL_FUNCTION_CAPACITY', 'PHYSICAL_FUNCTION_CAPACITY'),
      eligibility: [],
    }),
    /Secondary rehab strategy must be distinct from Primary/,
  )
}

console.log('LBP Rehab Strategy Selector v0.1: PASS')
