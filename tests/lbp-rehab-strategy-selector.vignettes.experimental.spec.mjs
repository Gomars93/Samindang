import assert from 'node:assert/strict'

const selectorModule = await import('./.lbp-rehab-strategy-selector-bundle.mjs')
const { selectLbpRehabStrategy } = selectorModule

/**
 * PRODUCT/STRUCTURAL VIGNETTE HARNESS — not proof of clinical efficacy.
 *
 * All strategy choices below are synthetic normalized upstream decisions.
 * This harness does NOT map raw patient facts/diagnoses to strategy.
 */

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

// 1. Simple functional case: one resolved Primary, no forced Secondary, compact plan.
{
  const result = selectLbpRehabStrategy({
    targetFunction: 'WORK',
    strategySelection: selection('PHYSICAL_FUNCTION_CAPACITY'),
    eligibility: [elig('LBP_FUNC_01', 'START_AS_WRITTEN')],
  })
  assert.equal(result.primaryStrategy, 'PHYSICAL_FUNCTION_CAPACITY')
  assert.equal(result.secondaryStrategy, null)
  assert.deepEqual(result.candidates.map((c) => c.exerciseId), ['LBP_FUNC_01'])
}

// 2. Extension-response + walking plan: upstream Primary/Secondary are preserved without score inflation.
{
  const result = selectLbpRehabStrategy({
    targetFunction: 'WALKING',
    strategySelection: selection('SYMPTOM_RESPONSE_GUIDED_MOVEMENT', 'PHYSICAL_FUNCTION_CAPACITY'),
    eligibility: [elig('LBP_DIR_02', 'START_AS_WRITTEN'), elig('LBP_ACT_01', 'START_AS_WRITTEN')],
  })
  assert.equal(result.primaryStrategy, 'SYMPTOM_RESPONSE_GUIDED_MOVEMENT')
  assert.equal(result.secondaryStrategy, 'PHYSICAL_FUNCTION_CAPACITY')
  assert.equal(result.candidates.some((c) => c.exerciseId === 'LBP_DIR_02'), true)
  assert.equal(result.candidates.some((c) => c.exerciseId === 'LBP_ACT_01'), true)
  assert.equal(JSON.stringify(result).includes('score'), false)
  assert.equal(JSON.stringify(result).includes('weight'), false)
}

// 3. Stable neural-management plan with upstream eligible slider.
{
  const result = selectLbpRehabStrategy({
    targetFunction: 'WALKING',
    strategySelection: selection('NEURAL_MOBILITY_MANAGEMENT'),
    eligibility: [elig('LBP_NEURAL_01', 'START_AS_WRITTEN')],
  })
  assert.equal(result.primaryStrategy, 'NEURAL_MOBILITY_MANAGEMENT')
  assert.equal(result.candidates.some((c) => c.exerciseId === 'LBP_NEURAL_01'), true)
}

// 4. Distal worsening encoded upstream as STOP cannot be resurrected.
{
  const result = selectLbpRehabStrategy({
    targetFunction: 'WALKING',
    strategySelection: selection('NEURAL_MOBILITY_MANAGEMENT'),
    eligibility: [elig('LBP_NEURAL_01', 'STOP_REVIEW')],
  })
  assert.equal(result.candidates.length, 0)
  assert.equal(result.eligiblePool.some((c) => c.exerciseId === 'LBP_NEURAL_01'), false)
  assert.equal(
    result.gaps.some((g) => g.type === 'NO_MATCHING_ELIGIBLE_EXERCISE' && g.strategy === 'NEURAL_MOBILITY_MANAGEMENT'),
    true,
  )
}

// 5. Bending/lifting return: graded exposure only consumes upstream-eligible exposure items.
{
  const result = selectLbpRehabStrategy({
    targetFunction: 'LIFTING',
    strategySelection: selection('GRADED_EXPOSURE_RETURN'),
    eligibility: [elig('LBP_EXPOSURE_01', 'START_AS_WRITTEN')],
  })
  assert.equal(result.primaryStrategy, 'GRADED_EXPOSURE_RETURN')
  assert.deepEqual(result.candidates.map((c) => c.exerciseId), ['LBP_EXPOSURE_01'])
}

// 6. Functional Primary + Regulation: Regulation remains adjunct.
{
  const result = selectLbpRehabStrategy({
    targetFunction: 'WORK',
    strategySelection: selection('PHYSICAL_FUNCTION_CAPACITY', null, true),
    eligibility: [elig('LBP_FUNC_01', 'START_AS_WRITTEN'), elig('LBP_REG_01', 'START_AS_WRITTEN')],
  })
  assert.equal(result.primaryStrategy, 'PHYSICAL_FUNCTION_CAPACITY')
  assert.equal(result.secondaryStrategy, null)
  assert.equal(result.regulationAdjunctState, 'RELEVANT')
  assert.equal(result.candidates.some((c) => c.slot === 'PRIMARY' && c.exerciseId === 'LBP_FUNC_01'), true)
  assert.equal(result.candidates.some((c) => c.slot === 'REGULATION' && c.exerciseId === 'LBP_REG_01'), true)
}

// 7. Regulation alone: unresolved functional plan, adjunct may still be surfaced without becoming Primary.
{
  const result = selectLbpRehabStrategy({
    targetFunction: 'SLEEP',
    strategySelection: selection(null, null, true),
    eligibility: [elig('LBP_REG_01', 'START_AS_WRITTEN')],
  })
  assert.equal(result.status, 'UNRESOLVED_NO_PRIMARY_STRATEGY')
  assert.equal(result.primaryStrategy, null)
  assert.equal(result.candidates.every((c) => c.slot === 'REGULATION'), true)
  assert.equal(result.candidates.some((c) => c.exerciseId === 'LBP_REG_01'), true)
}

// 8. Lifting Target Function: exact capacity match is shown; unrelated eligible capacity item is audit-only.
{
  const result = selectLbpRehabStrategy({
    targetFunction: 'LIFTING',
    strategySelection: selection('PHYSICAL_FUNCTION_CAPACITY'),
    eligibility: [elig('LBP_LOAD_02', 'START_AS_WRITTEN'), elig('LBP_ACT_01', 'START_AS_WRITTEN')],
  })
  assert.deepEqual(result.candidates.map((c) => c.exerciseId), ['LBP_LOAD_02'])
  assert.equal(result.notSelectedToday.some((c) => c.exerciseId === 'LBP_ACT_01'), true)
}

// 9. Walking-limited older adult: capacity plan without diagnosis inference; regression preserved.
{
  const result = selectLbpRehabStrategy({
    targetFunction: 'WALKING',
    strategySelection: selection('PHYSICAL_FUNCTION_CAPACITY'),
    eligibility: [elig('LBP_ACT_02', 'START_WITH_REGRESSION')],
  })
  assert.equal(result.candidates[0].exerciseId, 'LBP_ACT_02')
  assert.equal(result.candidates[0].eligibilityState, 'START_WITH_REGRESSION')
  assert.equal(JSON.stringify(result).toLowerCase().includes('stenosis'), false)
}

// 10. Selected strategy with no eligible matching item returns an explicit gap.
{
  const result = selectLbpRehabStrategy({
    targetFunction: 'WORK',
    strategySelection: selection('GRADED_EXPOSURE_RETURN'),
    eligibility: [],
  })
  assert.equal(result.candidates.length, 0)
  assert.equal(
    result.gaps.some((g) => g.type === 'NO_MATCHING_ELIGIBLE_EXERCISE' && g.strategy === 'GRADED_EXPOSURE_RETURN'),
    true,
  )
}

// 11. Bed-mobility Target Function: unrelated eligible capacity exercise must NOT mask the Core-20/log-roll gap.
{
  const result = selectLbpRehabStrategy({
    targetFunction: 'SLEEP',
    strategySelection: selection('PHYSICAL_FUNCTION_CAPACITY'),
    eligibility: [elig('LBP_ACT_01', 'START_AS_WRITTEN')], // eligible capacity, unrelated to SLEEP
  })
  assert.equal(result.candidates.length, 0)
  assert.equal(result.notSelectedToday.some((c) => c.exerciseId === 'LBP_ACT_01'), true)
  assert.equal(
    result.gaps.some((g) => g.type === 'NO_MATCHING_ELIGIBLE_EXERCISE' && g.strategy === 'PHYSICAL_FUNCTION_CAPACITY'),
    true,
  )
  assert.equal(JSON.stringify(result).toLowerCase().includes('log_roll'), false)
  assert.equal(JSON.stringify(result).toLowerCase().includes('log-roll'), false)
}

// 12. Upstream resolves exactly Primary + optional Secondary; selector never invents a third peer strategy.
{
  const result = selectLbpRehabStrategy({
    targetFunction: 'WORK',
    strategySelection: selection('PHYSICAL_FUNCTION_CAPACITY', 'GRADED_EXPOSURE_RETURN'),
    eligibility: [
      elig('LBP_FUNC_01', 'START_AS_WRITTEN'),
      elig('LBP_EXPOSURE_01', 'START_AS_WRITTEN'),
      elig('LBP_NEURAL_01', 'START_AS_WRITTEN'),
      elig('LBP_DIR_02', 'START_AS_WRITTEN'),
    ],
  })
  assert.equal(result.primaryStrategy, 'PHYSICAL_FUNCTION_CAPACITY')
  assert.equal(result.secondaryStrategy, 'GRADED_EXPOSURE_RETURN')
  assert.equal(result.candidates.some((c) => c.exerciseId === 'LBP_FUNC_01'), true)
  assert.equal(result.candidates.some((c) => c.exerciseId === 'LBP_EXPOSURE_01'), true)
  assert.equal(result.eligiblePool.some((c) => c.exerciseId === 'LBP_NEURAL_01'), false)
  assert.equal(result.eligiblePool.some((c) => c.exerciseId === 'LBP_DIR_02'), false)
  const peerStrategies = new Set(result.candidates.filter((c) => c.slot !== 'REGULATION').map((c) => c.strategy))
  assert.ok(peerStrategies.size <= 2)
}

console.log('LBP Rehab Strategy Selector v0.1 — clinical/product vignettes: PASS')
console.log('vignettes: 12')
