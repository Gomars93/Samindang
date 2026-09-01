import assert from 'node:assert/strict'
import { evaluateLbpActionAdaptiveExperiment } from './.lbp-action-adaptive-engine-bundle.mjs'

const base = {
  visitKind: 'INITIAL',
  diseaseSafetyStatus: 'CLEAR',
  treatmentSafetyStatus: 'CLEAR',
  legSymptoms: 'ABSENT',
  radicularCue: 'ABSENT',
  walkingStandingLegPattern: 'ABSENT',
  walkingTolerance: 'NOT_RELEVANT',
  hipContributionCue: 'ABSENT',
  sijContributionCue: 'ABSENT',
  // Deliberately unassessed: absence of a cue must not be converted to normal
  // and must not cause the engine to chase every possible exam.
  objectiveNeuro: 'NOT_ASSESSED',
  neurodynamic: 'NOT_ASSESSED',
  lumbarMovement: 'NO_CLEAR_RESPONSE',
  targetFunctionAvailable: true,
  targetFunctionReproduction: 'CONCORDANT_SYMPTOM_REPRODUCTION',
  hipScreen: 'NOT_ASSESSED',
  sijScreen: 'NOT_ASSESSED',
  clinicianConcernDomains: [],
  followUp: {
    trajectory: 'NOT_DUE',
    exposure: 'UNKNOWN',
    newOrWorseningNeuroSymptom: 'NO',
  },
}

function scenario(overrides = {}) {
  return {
    ...base,
    ...overrides,
    followUp: {
      ...base.followUp,
      ...(overrides.followUp ?? {}),
    },
  }
}

function ids(output) {
  return output.checks.map((item) => item.id)
}

{
  const output = evaluateLbpActionAdaptiveExperiment(scenario())
  assert.deepEqual(ids(output), [], 'unassessed neuro/hip/SIJ without actionable cues must remain unchased')
  assert.equal(output.stopRule.satisfied, true)
}

{
  const output = evaluateLbpActionAdaptiveExperiment(
    scenario({
      legSymptoms: 'PRESENT',
      objectiveNeuro: 'NOT_PERFORMED',
    }),
  )
  assert.deepEqual(ids(output), [], 'explicit NOT_PERFORMED must not be auto-recommended again in the same visit')
  assert.ok(output.uncertaintyNotesKo.some((text) => text.includes('시행하지 않음')))
}

{
  const output = evaluateLbpActionAdaptiveExperiment(
    scenario({
      legSymptoms: 'PRESENT',
      objectiveNeuro: 'LIMITED',
    }),
  )
  assert.deepEqual(ids(output), [], 'LIMITED must not collapse to normal or start an alternate-test cascade')
  assert.ok(output.uncertaintyNotesKo.some((text) => text.includes('평가가 제한')))
}

{
  const output = evaluateLbpActionAdaptiveExperiment(
    scenario({
      clinicianConcernDomains: ['HIP'],
    }),
  )
  assert.deepEqual(ids(output), ['LBP_CHECK_HIP_CONTRIBUTION'])
  assert.equal(output.checks[0].priority, 'HIGH')
  assert.ok(output.checks[0].sourceFacts.some((item) => item.key === 'clinicianConcernDomains'))
}

{
  const output = evaluateLbpActionAdaptiveExperiment(
    scenario({
      clinicianConcernDomains: ['SIJ'],
    }),
  )
  assert.deepEqual(ids(output), ['LBP_CHECK_SIJ_CONTRIBUTION'])
  assert.equal(output.checks[0].priority, 'HIGH')
}

{
  const output = evaluateLbpActionAdaptiveExperiment(
    scenario({
      clinicianConcernDomains: ['NEURO'],
    }),
  )
  assert.deepEqual(ids(output), ['LBP_CHECK_OBJECTIVE_NEURO_BASELINE'])
  assert.ok(output.checks[0].sourceFacts.some((item) => item.key === 'clinicianConcernDomains'))
}

{
  const output = evaluateLbpActionAdaptiveExperiment(
    scenario({
      diseaseSafetyStatus: 'REVIEW_REQUIRED',
      hipScreen: 'CONTRIBUTORY',
      targetFunctionReproduction: 'CONCORDANT_SYMPTOM_REPRODUCTION',
    }),
  )
  assert.equal(output.routinePathway, 'SAFETY_REVIEW_FIRST')
  assert.deepEqual(output.actionTags, [], 'routine treatment/rehab action tags must be suppressed while disease safety review is first')
}

console.log('PASS: LBP action-adaptive second-pass boundary regressions')
