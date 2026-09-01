import assert from 'node:assert/strict'
import { evaluateLbpCareCoreExperimentV04 } from './.lbp-care-core-v04-bundle.mjs'
import { evaluateLbpActionAdaptiveExperimentV03 } from './.lbp-action-adaptive-engine-v03-bundle.mjs'

const base = {
  visitKind: 'INITIAL',
  diseaseSafetyStatus: 'CLEAR',
  treatmentSafetyStatus: 'CLEAR',
  legSymptoms: 'ABSENT',
  radicularCue: 'ABSENT',
  walkingStandingLegPattern: 'ABSENT',
  walkingTolerance: 'NOT_KNOWN',
  hipContributionCue: 'ABSENT',
  sijContributionCue: 'ABSENT',
  objectiveNeuro: 'NOT_ASSESSED',
  neurodynamic: 'NOT_ASSESSED',
  lumbarMovement: 'NO_CLEAR_RESPONSE',
  targetFunctionAvailable: true,
  targetFunctionReproduction: 'CONCORDANT_SYMPTOM_REPRODUCTION',
  hipScreen: 'NOT_ASSESSED',
  sijScreen: 'NOT_ASSESSED',
  clinicianConcernDomains: [],
  examResultFreshness: {},
  managementSufficiency: {
    status: 'NOT_ASSESSED',
    freshness: 'UNKNOWN',
    assessedAfterDecisionKeys: [],
  },
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
    examResultFreshness: {
      ...base.examResultFreshness,
      ...(overrides.examResultFreshness ?? {}),
    },
    managementSufficiency: {
      ...base.managementSufficiency,
      ...(overrides.managementSufficiency ?? {}),
    },
    followUp: {
      ...base.followUp,
      ...(overrides.followUp ?? {}),
    },
  }
}

function ids(items) {
  return items.map((item) => item.id)
}

function keysDeep(value, target = []) {
  if (Array.isArray(value)) {
    for (const item of value) keysDeep(item, target)
    return target
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      target.push(key)
      keysDeep(child, target)
    }
  }
  return target
}

function assertCoreContract(output, label) {
  assert.equal(output.ruleStatus, 'DRAFT_EXPERIMENTAL', `${label}: production leak`)
  assert.equal(output.contractVersion, 'LBP_CARE_CORE_V0_4')
  assert.equal(output.clinicianOverrideAvailable, true)

  const forbiddenResearchKeys = new Set([
    'decisionKey',
    'decisionRole',
    'sufficiency',
    'scheduling',
    'assessedAfterDecisionKeys',
    'reconsiderAfterDecisionKeys',
  ])
  for (const key of keysDeep(output)) {
    assert.ok(!forbiddenResearchKeys.has(key), `${label}: research-layer key leaked into core contract: ${key}`)
  }

  assert.equal(
    new Set(ids(output.checksNow)).size,
    output.checksNow.length,
    `${label}: duplicate current check`,
  )
  assert.equal(
    new Set(ids(output.unresolvedLater)).size,
    output.unresolvedLater.length,
    `${label}: duplicate unresolved item`,
  )

  if (output.state === 'READY_TO_MANAGE') {
    assert.equal(output.checksNow.length, 0, `${label}: ready state cannot contain current checks`)
    assert.equal(output.canProceedWithManagement, true)
  } else {
    assert.equal(output.canProceedWithManagement, false)
  }
}

const cueValues = ['ABSENT', 'PRESENT', 'UNCERTAIN']
let matrixCases = 0
let totalCurrent = 0
let totalLater = 0
let readyCases = 0
let checksNeededCases = 0

// Core projection must be lossless relative to v0.3 dispositions while hiding
// the research machinery from the product-facing contract.
for (const legSymptoms of cueValues) {
  for (const radicularCue of cueValues) {
    for (const walkingStandingLegPattern of cueValues) {
      for (const hipContributionCue of cueValues) {
        for (const sijContributionCue of cueValues) {
          const input = scenario({
            legSymptoms,
            radicularCue,
            walkingStandingLegPattern,
            hipContributionCue,
            sijContributionCue,
          })
          const label = `${legSymptoms}/${radicularCue}/${walkingStandingLegPattern}/${hipContributionCue}/${sijContributionCue}`
          const research = evaluateLbpActionAdaptiveExperimentV03(input)
          const core = evaluateLbpCareCoreExperimentV04(input)
          assertCoreContract(core, label)

          assert.deepEqual(ids(core.checksNow), ids(research.checks), `${label}: current checks changed in projection`)
          assert.deepEqual(
            new Set(ids(core.unresolvedLater)),
            new Set([...ids(research.deferredChecks), ...ids(research.notNeededTodayChecks)]),
            `${label}: unresolved clinical debt changed in projection`,
          )
          assert.deepEqual(core.actionTags, research.actionTags, `${label}: action tags changed in projection`)
          assert.equal(
            core.treatmentFinalizationRequiresClinicianReview,
            research.treatmentFinalizationRequiresClinicianReview,
            `${label}: treatment-safety review changed in projection`,
          )

          matrixCases += 1
          totalCurrent += core.checksNow.length
          totalLater += core.unresolvedLater.length
          if (core.state === 'READY_TO_MANAGE') readyCases += 1
          if (core.state === 'CHECKS_NEEDED') checksNeededCases += 1
        }
      }
    }
  }
}

assert.equal(matrixCases, 243)
assert.equal(totalCurrent, 501, 'core projection should preserve the v0.3 initial current-check baseline')
assert.equal(totalLater, 30, 'core projection should preserve v0.3 deferred clinical debt at baseline')
assert.equal(readyCases, 16)
assert.equal(checksNeededCases, 227)

// Safety review remains the top-level state and no hidden routine queue leaks.
{
  const output = evaluateLbpCareCoreExperimentV04(
    scenario({
      diseaseSafetyStatus: 'REVIEW_REQUIRED',
      legSymptoms: 'PRESENT',
      radicularCue: 'PRESENT',
      hipContributionCue: 'PRESENT',
    }),
  )
  assertCoreContract(output, 'safety review')
  assert.equal(output.state, 'SAFETY_REVIEW_FIRST')
  assert.deepEqual(output.checksNow, [])
  assert.deepEqual(output.unresolvedLater, [])
}

// Deterioration is represented as both safety refresh and explicit plan review.
{
  const output = evaluateLbpCareCoreExperimentV04(
    scenario({
      visitKind: 'FOLLOW_UP',
      followUp: {
        trajectory: 'DETERIORATING',
        exposure: 'ADEQUATE',
        newOrWorseningNeuroSymptom: 'YES',
      },
    }),
  )
  assertCoreContract(output, 'deterioration')
  assert.equal(output.state, 'SAFETY_REFRESH_FIRST')
  assert.equal(output.reassessment.currentPlanNeedsReview, true)
}

// Adequate non-response is a management-review trigger, not an automatic
// diagnosis claim.
{
  const output = evaluateLbpCareCoreExperimentV04(
    scenario({
      visitKind: 'FOLLOW_UP',
      hipContributionCue: 'PRESENT',
      followUp: {
        trajectory: 'NO_MEANINGFUL_CHANGE',
        exposure: 'ADEQUATE',
        newOrWorseningNeuroSymptom: 'NO',
      },
    }),
  )
  assertCoreContract(output, 'adequate non-response')
  assert.equal(output.reassessment.currentPlanNeedsReview, true)
  assert.ok(output.reassessment.reasonKo.includes('재평가'))
}

// Explicit clinician concern remains visible and is not hidden by the reduced
// contract or the automatic presentation budget.
{
  const output = evaluateLbpCareCoreExperimentV04(
    scenario({
      clinicianConcernDomains: ['NEURO', 'HIP', 'SIJ', 'WALKING_TOLERANCE', 'LUMBAR_MOVEMENT'],
      lumbarMovement: 'NOT_ASSESSED',
    }),
  )
  assertCoreContract(output, 'clinician override')
  assert.equal(output.state, 'CHECKS_NEEDED')
  assert.equal(output.checksNow.length, 5)
  assert.ok(output.checksNow.every((item) => item.requestedByClinician))
}

// Synthetic current-visit sufficiency may leave optional items unresolved for
// later, but the core contract exposes only the practical disposition, not the
// sufficiency machinery itself.
{
  const input = scenario({
    hipContributionCue: 'PRESENT',
    sijContributionCue: 'PRESENT',
    managementSufficiency: {
      status: 'SUFFICIENT_FOR_TODAY',
      freshness: 'CURRENT_VISIT',
      assessedAfterDecisionKeys: ['LUMBAR_DIRECTIONAL_RESPONSE'],
    },
  })
  const output = evaluateLbpCareCoreExperimentV04(input)
  assertCoreContract(output, 'reduced sufficient state')
  assert.equal(output.state, 'READY_TO_MANAGE')
  assert.deepEqual(new Set(ids(output.unresolvedLater)), new Set(['LBP_CHECK_HIP_CONTRIBUTION', 'LBP_CHECK_SIJ_CONTRIBUTION']))
  assert.ok(output.unresolvedLater.every((item) => item.state === 'NOT_NEEDED_TODAY'))
}

console.log('\nLBP Care Core v0.4 reduction stress summary')
console.log(`- cue matrix: ${matrixCases} cases`)
console.log(`- current checks preserved: ${totalCurrent}`)
console.log(`- unresolved-later items preserved: ${totalLater}`)
console.log(`- READY_TO_MANAGE baseline cases: ${readyCases}`)
console.log(`- CHECKS_NEEDED baseline cases: ${checksNeededCases}`)
console.log('PASS: v0.4 reduced primary-care contract preserves v0.3 behavior without exposing research-layer machinery')
