import assert from 'node:assert/strict'

const selectorModule = await import('./.lbp-rehab-strategy-selector-bundle.mjs')
const { selectLbpRehabStrategy } = selectorModule

/**
 * PRODUCT/STRUCTURAL VIGNETTE HARNESS — not proof of clinical efficacy.
 *
 * Every input here is synthetic normalized strategyIntent/eligibility data
 * (brief §4/§7). No vignette derives a strategy from a raw patient fact,
 * diagnosis label, or DoctorPayload field.
 */

function intent(overrides = {}) {
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

// 1. Simple axial/functional case: one Primary, no forced Secondary, 1-2 useful candidates.
{
  const result = selectLbpRehabStrategy({
    targetFunction: 'WORK',
    strategyIntent: intent({ physicalFunctionCapacityRelevant: true }),
    eligibility: [elig('LBP_FUNC_01', 'START_AS_WRITTEN')],
  })
  assert.equal(result.primaryStrategy, 'PHYSICAL_FUNCTION_CAPACITY')
  assert.equal(result.secondaryStrategy, null)
  assert.ok(result.candidates.length >= 1 && result.candidates.length <= 2)
}

// 2. Extension-favorable + walking Target Function: symptom-response coexists with capacity, no score inflation.
{
  const result = selectLbpRehabStrategy({
    targetFunction: 'WALKING',
    strategyIntent: intent({ symptomResponseGuidedRelevant: true, physicalFunctionCapacityRelevant: true }),
    eligibility: [elig('LBP_DIR_02', 'START_AS_WRITTEN'), elig('LBP_ACT_01', 'START_AS_WRITTEN')],
  })
  assert.equal(result.primaryStrategy, 'SYMPTOM_RESPONSE_GUIDED_MOVEMENT')
  assert.equal(result.secondaryStrategy, 'PHYSICAL_FUNCTION_CAPACITY')
  assert.equal(result.candidates.some((c) => c.exerciseId === 'LBP_DIR_02'), true)
  assert.equal(result.candidates.some((c) => c.exerciseId === 'LBP_ACT_01'), true)
  for (const candidate of result.candidates) {
    assert.equal('score' in candidate, false)
    assert.equal('weight' in candidate, false)
  }
}

// 3. Stable leg-symptom case with an upstream eligible neural slider: neural candidate can appear.
{
  const result = selectLbpRehabStrategy({
    targetFunction: 'WALKING',
    strategyIntent: intent({ neuralMobilityRelevant: true }),
    eligibility: [elig('LBP_NEURAL_01', 'START_AS_WRITTEN')],
  })
  assert.equal(result.primaryStrategy, 'NEURAL_MOBILITY_MANAGEMENT')
  assert.equal(result.candidates.some((c) => c.exerciseId === 'LBP_NEURAL_01'), true)
}

// 4. Distal worsening represented upstream as STOP: selector cannot resurrect that exercise.
{
  const result = selectLbpRehabStrategy({
    targetFunction: 'WALKING',
    strategyIntent: intent({ neuralMobilityRelevant: true }),
    eligibility: [elig('LBP_NEURAL_01', 'STOP_REVIEW')],
  })
  assert.equal(result.candidates.length, 0)
  assert.equal(
    result.gaps.some((g) => g.type === 'NO_MATCHING_ELIGIBLE_EXERCISE' && g.strategy === 'NEURAL_MOBILITY_MANAGEMENT'),
    true,
  )
  const allIds = [...result.candidates, ...result.eligiblePool].map((c) => c.exerciseId)
  assert.equal(allIds.includes('LBP_NEURAL_01'), false)
}

// 5. Bending/lifting avoidance: graded-exposure strategy, only upstream-eligible exposure items.
{
  const result = selectLbpRehabStrategy({
    targetFunction: 'LIFTING',
    strategyIntent: intent({ gradedExposureRelevant: true }),
    eligibility: [elig('LBP_EXPOSURE_01', 'START_AS_WRITTEN')],
  })
  assert.equal(result.primaryStrategy, 'GRADED_EXPOSURE_RETURN')
  assert.equal(result.candidates.length, 1)
  assert.equal(result.candidates[0].exerciseId, 'LBP_EXPOSURE_01')
}

// 6. Functional Primary + Regulation relevant: Regulation stays adjunct.
{
  const result = selectLbpRehabStrategy({
    targetFunction: 'WORK',
    strategyIntent: intent({ physicalFunctionCapacityRelevant: true, regulationRelevant: true }),
    eligibility: [elig('LBP_FUNC_01', 'START_AS_WRITTEN'), elig('LBP_REG_01', 'START_AS_WRITTEN')],
  })
  assert.equal(result.primaryStrategy, 'PHYSICAL_FUNCTION_CAPACITY')
  assert.equal(result.secondaryStrategy, null)
  assert.equal(result.regulationAdjunctState, 'RELEVANT')
  assert.equal(result.candidates.some((c) => c.slot === 'PRIMARY' && c.exerciseId === 'LBP_FUNC_01'), true)
  assert.equal(result.candidates.some((c) => c.slot === 'REGULATION' && c.exerciseId === 'LBP_REG_01'), true)
  assert.ok(result.candidates.length <= 3)
}

// 7. Regulation alone without a valid Primary intent: explicit unresolved state, not a fabricated functional plan.
{
  const result = selectLbpRehabStrategy({
    targetFunction: 'SLEEP',
    strategyIntent: intent({ regulationRelevant: true }),
    eligibility: [elig('LBP_REG_01', 'START_AS_WRITTEN')],
  })
  assert.equal(result.status, 'UNRESOLVED_NO_PRIMARY_STRATEGY')
  assert.equal(result.primaryStrategy, null)
  assert.equal(result.secondaryStrategy, null)
  // Regulation itself is not fabricated into a functional strategy.
  assert.equal(result.candidates.every((c) => c.slot === 'REGULATION'), true)
  assert.equal(result.candidates.some((c) => c.exerciseId === 'LBP_REG_01'), true)
}

// 8. Lifting/work Target Function: capacity candidates matched by Target Function.
{
  const result = selectLbpRehabStrategy({
    targetFunction: 'LIFTING',
    strategyIntent: intent({ physicalFunctionCapacityRelevant: true }),
    eligibility: [elig('LBP_LOAD_02', 'START_AS_WRITTEN'), elig('LBP_ACT_01', 'START_AS_WRITTEN')],
  })
  const primary = result.candidates.filter((c) => c.slot === 'PRIMARY')
  assert.equal(primary[0].exerciseId, 'LBP_LOAD_02')
  assert.equal(primary[0].matchesTargetFunction, true)
}

// 9. Walking-limited older adult: capacity selection without an automatic stenosis diagnosis.
{
  const result = selectLbpRehabStrategy({
    targetFunction: 'WALKING',
    strategyIntent: intent({ physicalFunctionCapacityRelevant: true }),
    eligibility: [elig('LBP_ACT_02', 'START_WITH_REGRESSION')],
  })
  assert.equal(result.candidates[0].exerciseId, 'LBP_ACT_02')
  assert.equal(result.candidates[0].eligibilityState, 'START_WITH_REGRESSION')
  assert.equal(JSON.stringify(result).toLowerCase().includes('stenosis'), false)
}

// 10. Selected strategy but no eligible matching item: explicit gap.
{
  const result = selectLbpRehabStrategy({
    targetFunction: 'WORK',
    strategyIntent: intent({ gradedExposureRelevant: true }),
    eligibility: [],
  })
  assert.equal(result.candidates.length, 0)
  assert.equal(
    result.gaps.some((g) => g.type === 'NO_MATCHING_ELIGIBLE_EXERCISE' && g.strategy === 'GRADED_EXPOSURE_RETURN'),
    true,
  )
}

// 11. Bed-mobility Target Function: expose the Core-20/log-roll gap rather than invent an exercise.
{
  const result = selectLbpRehabStrategy({
    targetFunction: 'SLEEP',
    strategyIntent: intent({ physicalFunctionCapacityRelevant: true }),
    eligibility: [], // no Core-20 item is eligible for this need today
  })
  assert.equal(result.candidates.length, 0)
  assert.equal(
    result.gaps.some((g) => g.type === 'NO_MATCHING_ELIGIBLE_EXERCISE' && g.strategy === 'PHYSICAL_FUNCTION_CAPACITY'),
    true,
  )
  assert.equal(JSON.stringify(result).toLowerCase().includes('log_roll'), false)
  assert.equal(JSON.stringify(result).toLowerCase().includes('log-roll'), false)
}

// 12. Multiple relevant strategy intents: exactly one Primary + at most one Secondary, no third peer in first plan.
{
  const result = selectLbpRehabStrategy({
    targetFunction: 'WORK',
    strategyIntent: intent({
      symptomResponseGuidedRelevant: true,
      physicalFunctionCapacityRelevant: true,
      neuralMobilityRelevant: true,
      gradedExposureRelevant: true,
    }),
    eligibility: [
      elig('LBP_DIR_02', 'START_AS_WRITTEN'),
      elig('LBP_ACT_01', 'START_AS_WRITTEN'),
      elig('LBP_NEURAL_01', 'START_AS_WRITTEN'),
      elig('LBP_EXPOSURE_01', 'START_AS_WRITTEN'),
    ],
  })
  assert.equal(result.primaryStrategy, 'SYMPTOM_RESPONSE_GUIDED_MOVEMENT')
  assert.equal(result.secondaryStrategy, 'PHYSICAL_FUNCTION_CAPACITY')
  assert.deepEqual(result.deferredRelevantStrategies, ['NEURAL_MOBILITY_MANAGEMENT', 'GRADED_EXPOSURE_RETURN'])
  assert.equal(result.candidates.some((c) => c.exerciseId === 'LBP_NEURAL_01'), false)
  assert.equal(result.candidates.some((c) => c.exerciseId === 'LBP_EXPOSURE_01'), false)
  const strategiesShown = new Set(result.candidates.map((c) => c.strategy))
  assert.ok(strategiesShown.size <= 2)
}

console.log('LBP Rehab Strategy Selector v0.1 — clinical/product vignettes: PASS')
console.log('vignettes: 12')
