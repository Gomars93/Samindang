import assert from 'node:assert/strict'
import { evaluateLbpActionAdaptiveExperiment } from './.lbp-action-adaptive-engine-bundle.mjs'

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

function assertStructural(output, label) {
  assert.equal(output.ruleStatus, 'DRAFT_EXPERIMENTAL', `${label}: production rule leak`)
  assert.equal(output.clinicianOverrideAvailable, true, `${label}: clinician override unavailable`)
  const checkIds = ids(output)
  assert.equal(new Set(checkIds).size, checkIds.length, `${label}: duplicate check ids`)
  for (const check of output.checks) {
    assert.equal(check.ruleStatus, 'DRAFT_EXPERIMENTAL', `${label}: non-draft check leaked`)
    assert.ok(check.changesManagement.length > 0, `${label}: management-irrelevant check ${check.id}`)
    assert.ok(check.reasonKo.length > 0, `${label}: no reason for ${check.id}`)
    assert.ok(check.help.howKo.length > 0, `${label}: no how-help for ${check.id}`)
    assert.ok(check.help.whyKo.length > 0, `${label}: no why-help for ${check.id}`)
  }
}

function applyNeutralResult(input, checkId) {
  const next = structuredClone(input)
  switch (checkId) {
    case 'LBP_CHECK_CLARIFY_LEG_SYMPTOM': next.legSymptoms = 'ABSENT'; break
    case 'LBP_CHECK_OBJECTIVE_NEURO_BASELINE': next.objectiveNeuro = 'NORMAL'; break
    case 'LBP_CHECK_WALKING_TOLERANCE': next.walkingTolerance = 'KNOWN'; break
    case 'LBP_CHECK_NEURODYNAMIC': next.neurodynamic = 'NEGATIVE'; break
    case 'LBP_CHECK_HIP_CONTRIBUTION': next.hipScreen = 'NON_CONTRIBUTORY'; break
    case 'LBP_CHECK_SIJ_CONTRIBUTION': next.sijScreen = 'NON_CONTRIBUTORY'; break
    case 'LBP_CHECK_DEFINE_TARGET_FUNCTION':
      next.targetFunctionAvailable = true
      next.targetFunctionReproduction = 'NO_MEANINGFUL_PROBLEM'
      break
    case 'LBP_CHECK_TARGET_FUNCTION_REPRODUCTION': next.targetFunctionReproduction = 'NO_MEANINGFUL_PROBLEM'; break
    case 'LBP_CHECK_LUMBAR_MOVEMENT_RESPONSE': next.lumbarMovement = 'NO_CLEAR_RESPONSE'; break
    default: throw new Error(`No neutral resolution mapping for ${checkId}`)
  }
  return next
}

const cueValues = ['ABSENT', 'PRESENT', 'UNCERTAIN']
const histogram = new Map()
let cueMatrixCases = 0
let casesOverThree = 0
let maxChecks = 0
let maxCases = []
let pairwiseResolutionChecks = 0
let convergenceRuns = 0
let convergenceSteps = 0

for (const legSymptoms of cueValues) {
  for (const radicularCue of cueValues) {
    for (const walkingStandingLegPattern of cueValues) {
      for (const hipContributionCue of cueValues) {
        for (const sijContributionCue of cueValues) {
          const input = scenario({ legSymptoms, radicularCue, walkingStandingLegPattern, hipContributionCue, sijContributionCue })
          const label = `${legSymptoms}/${radicularCue}/${walkingStandingLegPattern}/${hipContributionCue}/${sijContributionCue}`
          const output = evaluateLbpActionAdaptiveExperiment(input)
          assertStructural(output, label)
          cueMatrixCases += 1

          const count = output.checks.length
          histogram.set(count, (histogram.get(count) ?? 0) + 1)
          if (count > 3) casesOverThree += 1
          if (count > maxChecks) {
            maxChecks = count
            maxCases = [{ label, checkIds: ids(output) }]
          } else if (count === maxChecks) {
            maxCases.push({ label, checkIds: ids(output) })
          }

          if (hipContributionCue !== 'PRESENT') assert.ok(!ids(output).includes('LBP_CHECK_HIP_CONTRIBUTION'), `${label}: hip uncertainty/absence auto-promoted`)
          if (sijContributionCue !== 'PRESENT') assert.ok(!ids(output).includes('LBP_CHECK_SIJ_CONTRIBUTION'), `${label}: SIJ uncertainty/absence auto-promoted`)
          if (radicularCue !== 'PRESENT') assert.ok(!ids(output).includes('LBP_CHECK_NEURODYNAMIC'), `${label}: radicular uncertainty/absence auto-promoted`)
          if (walkingStandingLegPattern !== 'PRESENT') assert.ok(!ids(output).includes('LBP_CHECK_WALKING_TOLERANCE'), `${label}: walking uncertainty/absence auto-promoted`)

          for (const checkId of ids(output)) {
            const resolvedInput = applyNeutralResult(input, checkId)
            const resolvedOutput = evaluateLbpActionAdaptiveExperiment(resolvedInput)
            assertStructural(resolvedOutput, `${label} -> ${checkId}`)
            assert.ok(!ids(resolvedOutput).includes(checkId), `${label}: ${checkId} repeated after neutral resolution`)
            const previousIds = new Set(ids(output))
            const newlyCreated = ids(resolvedOutput).filter((id) => !previousIds.has(id))
            assert.deepEqual(newlyCreated, [], `${label}: neutral resolution of ${checkId} opened unrelated checks ${newlyCreated.join(', ')}`)
            assert.ok(resolvedOutput.checks.length <= output.checks.length - 1, `${label}: resolving ${checkId} did not reduce unresolved check burden`)
            pairwiseResolutionChecks += 1
          }

          let current = input
          const seen = new Set()
          let steps = 0
          while (true) {
            const currentOutput = evaluateLbpActionAdaptiveExperiment(current)
            assertStructural(currentOutput, `${label} convergence step ${steps}`)
            if (currentOutput.checks.length === 0) break
            const signature = JSON.stringify({ current, checks: ids(currentOutput) })
            assert.ok(!seen.has(signature), `${label}: convergence loop detected`)
            seen.add(signature)
            current = applyNeutralResult(current, currentOutput.checks[0].id)
            steps += 1
            assert.ok(steps <= 8, `${label}: failed to converge within 8 neutral resolutions`)
          }
          convergenceRuns += 1
          convergenceSteps += steps
        }
      }
    }
  }
}

assert.equal(cueMatrixCases, 243, 'expected full 3^5 cue matrix')
assert.deepEqual(Object.fromEntries([...histogram.entries()].sort((a, b) => a[0] - b[0])), { 0: 16, 1: 48, 2: 84, 3: 68, 4: 24, 5: 3 }, 'candidate-burden baseline changed: review whether this is a deliberate reduction or a new cascade')
assert.equal(casesOverThree, 27, 'over-3 burden baseline changed; review before accepting')
assert.equal(maxChecks, 5, 'max candidate burden baseline changed; review before accepting')

const allCue = evaluateLbpActionAdaptiveExperiment(scenario({
  legSymptoms: 'PRESENT',
  radicularCue: 'PRESENT',
  walkingStandingLegPattern: 'PRESENT',
  hipContributionCue: 'PRESENT',
  sijContributionCue: 'PRESENT',
}))
assert.deepEqual(ids(allCue), [
  'LBP_CHECK_OBJECTIVE_NEURO_BASELINE',
  'LBP_CHECK_WALKING_TOLERANCE',
  'LBP_CHECK_NEURODYNAMIC',
  'LBP_CHECK_HIP_CONTRIBUTION',
  'LBP_CHECK_SIJ_CONTRIBUTION',
])
const coveredManagement = new Set()
const zeroMarginalByCoarseCategory = []
for (const check of allCue.checks) {
  const marginal = check.changesManagement.filter((domain) => !coveredManagement.has(domain))
  if (marginal.length === 0) zeroMarginalByCoarseCategory.push(check.id)
  for (const domain of check.changesManagement) coveredManagement.add(domain)
}
assert.deepEqual(zeroMarginalByCoarseCategory, [
  'LBP_CHECK_WALKING_TOLERANCE',
  'LBP_CHECK_NEURODYNAMIC',
  'LBP_CHECK_SIJ_CONTRIBUTION',
])

const concernDomainToCheck = {
  NEURO: 'LBP_CHECK_OBJECTIVE_NEURO_BASELINE',
  HIP: 'LBP_CHECK_HIP_CONTRIBUTION',
  SIJ: 'LBP_CHECK_SIJ_CONTRIBUTION',
  WALKING_TOLERANCE: 'LBP_CHECK_WALKING_TOLERANCE',
  LUMBAR_MOVEMENT: 'LBP_CHECK_LUMBAR_MOVEMENT_RESPONSE',
}
const concernDomains = Object.keys(concernDomainToCheck)
let overrideCases = 0
for (let mask = 0; mask < 2 ** concernDomains.length; mask += 1) {
  const selected = concernDomains.filter((_, index) => (mask & (1 << index)) !== 0)
  const output = evaluateLbpActionAdaptiveExperiment(scenario({
    clinicianConcernDomains: selected,
    lumbarMovement: selected.includes('LUMBAR_MOVEMENT') ? 'NOT_ASSESSED' : 'NO_CLEAR_RESPONSE',
  }))
  assertStructural(output, `override mask ${mask}`)
  const expected = selected.map((domain) => concernDomainToCheck[domain])
  assert.deepEqual(new Set(ids(output)), new Set(expected), `override mask ${mask}: unrelated or missing check`)
  overrideCases += 1
}
assert.equal(overrideCases, 32)

const terminalCases = [
  ['objectiveNeuro', 'LBP_CHECK_OBJECTIVE_NEURO_BASELINE', { legSymptoms: 'PRESENT' }],
  ['neurodynamic', 'LBP_CHECK_NEURODYNAMIC', { radicularCue: 'PRESENT', objectiveNeuro: 'NORMAL' }],
  ['lumbarMovement', 'LBP_CHECK_LUMBAR_MOVEMENT_RESPONSE', { clinicianConcernDomains: ['LUMBAR_MOVEMENT'] }],
  ['hipScreen', 'LBP_CHECK_HIP_CONTRIBUTION', { hipContributionCue: 'PRESENT' }],
  ['sijScreen', 'LBP_CHECK_SIJ_CONTRIBUTION', { sijContributionCue: 'PRESENT' }],
]
let terminalSuppressionCases = 0
for (const [field, checkId, extra] of terminalCases) {
  for (const terminal of ['NOT_PERFORMED', 'LIMITED']) {
    const output = evaluateLbpActionAdaptiveExperiment(scenario({ ...extra, [field]: terminal }))
    assert.ok(!ids(output).includes(checkId), `${field}=${terminal}: same-visit terminal status was re-suggested`)
    terminalSuppressionCases += 1
  }
}

const sameVisitSuppressed = evaluateLbpActionAdaptiveExperiment(scenario({ visitKind: 'INITIAL', legSymptoms: 'PRESENT', objectiveNeuro: 'NOT_PERFORMED' }))
const followUpSuppressed = evaluateLbpActionAdaptiveExperiment(scenario({ visitKind: 'FOLLOW_UP', legSymptoms: 'PRESENT', objectiveNeuro: 'NOT_PERFORMED' }))
assert.ok(!ids(sameVisitSuppressed).includes('LBP_CHECK_OBJECTIVE_NEURO_BASELINE'))
assert.ok(!ids(followUpSuppressed).includes('LBP_CHECK_OBJECTIVE_NEURO_BASELINE'))
const staleScopeGapVisible = true
assert.equal(staleScopeGapVisible, true)

let safetyCases = 0
for (const diseaseSafetyStatus of ['REVIEW_REQUIRED', 'URGENT_REVIEW']) {
  for (const legSymptoms of cueValues) {
    for (const radicularCue of cueValues) {
      for (const walkingStandingLegPattern of cueValues) {
        for (const hipContributionCue of cueValues) {
          for (const sijContributionCue of cueValues) {
            const output = evaluateLbpActionAdaptiveExperiment(scenario({
              diseaseSafetyStatus,
              legSymptoms,
              radicularCue,
              walkingStandingLegPattern,
              hipContributionCue,
              sijContributionCue,
              hipScreen: 'CONTRIBUTORY',
              sijScreen: 'CONTRIBUTORY',
              lumbarMovement: 'CENTRALIZES',
            }))
            assert.equal(output.routinePathway, 'SAFETY_REVIEW_FIRST')
            assert.deepEqual(output.checks, [])
            assert.deepEqual(output.actionTags, [])
            safetyCases += 1
          }
        }
      }
    }
  }
}
assert.equal(safetyCases, 486)

let treatmentSafetyCases = 0
for (const legSymptoms of cueValues) {
  for (const radicularCue of cueValues) {
    for (const walkingStandingLegPattern of cueValues) {
      for (const hipContributionCue of cueValues) {
        for (const sijContributionCue of cueValues) {
          const clearInput = scenario({ legSymptoms, radicularCue, walkingStandingLegPattern, hipContributionCue, sijContributionCue })
          const reviewInput = { ...clearInput, treatmentSafetyStatus: 'REVIEW_REQUIRED' }
          const clearOutput = evaluateLbpActionAdaptiveExperiment(clearInput)
          const reviewOutput = evaluateLbpActionAdaptiveExperiment(reviewInput)
          assert.deepEqual(ids(reviewOutput), ids(clearOutput), 'treatment safety review unexpectedly changed assessment candidates')
          assert.equal(reviewOutput.routinePathway, 'AVAILABLE')
          assert.equal(reviewOutput.treatmentFinalizationRequiresClinicianReview, true)
          treatmentSafetyCases += 1
        }
      }
    }
  }
}
assert.equal(treatmentSafetyCases, 243)

console.log('\nLBP Action-Adaptive Engine exhaustive experimental stress summary')
console.log(`- cue matrix: ${cueMatrixCases} cases`)
console.log(`- candidate histogram: ${JSON.stringify(Object.fromEntries([...histogram.entries()].sort((a, b) => a[0] - b[0])))}`)
console.log(`- >3 candidate cases: ${casesOverThree}/${cueMatrixCases}`)
console.log(`- max candidates: ${maxChecks}; max-case examples: ${JSON.stringify(maxCases.slice(0, 3))}`)
console.log(`- pairwise neutral-resolution checks: ${pairwiseResolutionChecks}`)
console.log(`- sequential convergence runs: ${convergenceRuns}; total neutral steps: ${convergenceSteps}`)
console.log(`- clinician override subsets: ${overrideCases}`)
console.log(`- same-visit NOT_PERFORMED/LIMITED suppression cases: ${terminalSuppressionCases}`)
console.log(`- disease-safety gate cases: ${safetyCases}`)
console.log(`- treatment-safety separation cases: ${treatmentSafetyCases}`)
console.log(`- coarse management-domain zero-marginal candidates in all-cue case: ${zeroMarginalByCoarseCategory.join(', ')}`)
console.log('- DESIGN GAP OBSERVED: exam result freshness is not visit-scoped in this prototype; prior-visit NOT_PERFORMED/LIMITED could be indistinguishable from current-visit terminal status if carried forward.')
console.log('PASS: exhaustive experimental stress matrix')
