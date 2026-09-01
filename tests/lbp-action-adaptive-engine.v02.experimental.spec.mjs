import assert from 'node:assert/strict'
import { evaluateLbpActionAdaptiveExperimentV02 } from './.lbp-action-adaptive-engine-v02-bundle.mjs'

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
    followUp: {
      ...base.followUp,
      ...(overrides.followUp ?? {}),
    },
  }
}

function ids(items) {
  return items.map((item) => item.id)
}

function decisionKeys(items) {
  return items.map((item) => item.decisionKey)
}

function assertStructural(output, label) {
  assert.equal(output.ruleStatus, 'DRAFT_EXPERIMENTAL', `${label}: production status leak`)
  assert.equal(output.scheduling.strategy, 'DECISION_TRANCHE_V0_2')
  assert.equal(output.scheduling.automaticPresentationBudget, 3)
  assert.equal(output.scheduling.budgetIsClinicalHardCap, false)

  const all = [...output.checks, ...output.deferredChecks]
  assert.equal(new Set(ids(all)).size, all.length, `${label}: duplicate check IDs across current/deferred`)
  assert.equal(new Set(decisionKeys(all)).size, all.length, `${label}: duplicate Decision Keys across current/deferred`)
  assert.deepEqual(new Set(ids(all)), new Set(ids(output.allCandidateChecks)), `${label}: candidate lost by staging`)
  assert.deepEqual(
    new Set(output.scheduling.currentDecisionKeys),
    new Set(decisionKeys(output.checks)),
    `${label}: current Decision Key telemetry mismatch`,
  )
  assert.deepEqual(
    new Set(output.scheduling.deferredDecisionKeys),
    new Set(decisionKeys(output.deferredChecks)),
    `${label}: deferred Decision Key telemetry mismatch`,
  )

  for (const check of output.deferredChecks) {
    assert.ok(check.deferReasonKo.length > 0, `${label}: deferred check missing reason`)
    assert.ok(check.reconsiderAfterDecisionKeys.length > 0, `${label}: deferred check missing reconsider keys`)
  }
}

function applyNeutralResult(input, checkId) {
  const next = structuredClone(input)
  switch (checkId) {
    case 'LBP_CHECK_CLARIFY_LEG_SYMPTOM':
      next.legSymptoms = 'ABSENT'
      break
    case 'LBP_CHECK_OBJECTIVE_NEURO_BASELINE':
      next.objectiveNeuro = 'NORMAL'
      next.examResultFreshness.OBJECTIVE_NEURO = 'CURRENT_VISIT'
      break
    case 'LBP_CHECK_WALKING_TOLERANCE':
      next.walkingTolerance = 'KNOWN'
      break
    case 'LBP_CHECK_NEURODYNAMIC':
      next.neurodynamic = 'NEGATIVE'
      next.examResultFreshness.NEURODYNAMIC = 'CURRENT_VISIT'
      break
    case 'LBP_CHECK_HIP_CONTRIBUTION':
      next.hipScreen = 'NON_CONTRIBUTORY'
      next.examResultFreshness.HIP_SCREEN = 'CURRENT_VISIT'
      break
    case 'LBP_CHECK_SIJ_CONTRIBUTION':
      next.sijScreen = 'NON_CONTRIBUTORY'
      next.examResultFreshness.SIJ_SCREEN = 'CURRENT_VISIT'
      break
    case 'LBP_CHECK_DEFINE_TARGET_FUNCTION':
      next.targetFunctionAvailable = true
      next.targetFunctionReproduction = 'NO_MEANINGFUL_PROBLEM'
      next.examResultFreshness.TARGET_FUNCTION_REPRODUCTION = 'CURRENT_VISIT'
      break
    case 'LBP_CHECK_TARGET_FUNCTION_REPRODUCTION':
      next.targetFunctionReproduction = 'NO_MEANINGFUL_PROBLEM'
      next.examResultFreshness.TARGET_FUNCTION_REPRODUCTION = 'CURRENT_VISIT'
      break
    case 'LBP_CHECK_LUMBAR_MOVEMENT_RESPONSE':
      next.lumbarMovement = 'NO_CLEAR_RESPONSE'
      next.examResultFreshness.LUMBAR_MOVEMENT = 'CURRENT_VISIT'
      break
    default:
      throw new Error(`No neutral mapping for ${checkId}`)
  }
  return next
}

const cueValues = ['ABSENT', 'PRESENT', 'UNCERTAIN']
const activeHistogram = new Map()
const candidateHistogram = new Map()
let matrixCases = 0
let deferredCases = 0
let maxActive = 0
let maxDeferred = 0
let totalCandidateCount = 0
let convergenceSteps = 0
let maxConvergenceSteps = 0

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
          const output = evaluateLbpActionAdaptiveExperimentV02(input)
          assertStructural(output, label)

          assert.ok(output.checks.length <= 3, `${label}: automatic current tranche exceeded 3`)
          matrixCases += 1
          if (output.deferredChecks.length > 0) deferredCases += 1
          maxActive = Math.max(maxActive, output.checks.length)
          maxDeferred = Math.max(maxDeferred, output.deferredChecks.length)
          totalCandidateCount += output.allCandidateChecks.length
          activeHistogram.set(output.checks.length, (activeHistogram.get(output.checks.length) ?? 0) + 1)
          candidateHistogram.set(
            output.allCandidateChecks.length,
            (candidateHistogram.get(output.allCandidateChecks.length) ?? 0) + 1,
          )

          let current = input
          let steps = 0
          const seen = new Set()
          while (true) {
            const currentOutput = evaluateLbpActionAdaptiveExperimentV02(current)
            assertStructural(currentOutput, `${label} convergence ${steps}`)
            assert.ok(currentOutput.checks.length <= 3, `${label}: convergence tranche exceeded 3`)
            if (currentOutput.allCandidateChecks.length === 0) break
            assert.ok(currentOutput.checks.length > 0, `${label}: candidates exist but no current tranche was exposed`)
            const signature = JSON.stringify({ current, active: ids(currentOutput.checks), deferred: ids(currentOutput.deferredChecks) })
            assert.ok(!seen.has(signature), `${label}: staging loop detected`)
            seen.add(signature)
            current = applyNeutralResult(current, currentOutput.checks[0].id)
            steps += 1
            assert.ok(steps <= 8, `${label}: failed to converge within 8 resolutions`)
          }
          convergenceSteps += steps
          maxConvergenceSteps = Math.max(maxConvergenceSteps, steps)
        }
      }
    }
  }
}

assert.equal(matrixCases, 243)
assert.deepEqual(
  Object.fromEntries([...candidateHistogram.entries()].sort((a, b) => a[0] - b[0])),
  { 0: 16, 1: 48, 2: 84, 3: 68, 4: 24, 5: 3 },
  'v0.2 must preserve the v0.1 candidate set; staging must not silently delete clinical questions',
)
assert.deepEqual(
  Object.fromEntries([...activeHistogram.entries()].sort((a, b) => a[0] - b[0])),
  { 0: 16, 1: 48, 2: 84, 3: 95 },
  'automatic current-tranche burden changed; review deliberately',
)
assert.equal(deferredCases, 27)
assert.equal(maxActive, 3)
assert.equal(maxDeferred, 2)
assert.equal(totalCandidateCount, 531)
assert.equal(convergenceSteps, 531, 'staging must not hide independent Decision Keys during sequential neutral resolution')
assert.equal(maxConvergenceSteps, 5)

// Worst-case automatic patient: five independent candidates remain visible to
// the engine, but only three are current. Hip/SIJ are deferred, not deleted.
{
  const output = evaluateLbpActionAdaptiveExperimentV02(
    scenario({
      legSymptoms: 'PRESENT',
      radicularCue: 'PRESENT',
      walkingStandingLegPattern: 'PRESENT',
      hipContributionCue: 'PRESENT',
      sijContributionCue: 'PRESENT',
    }),
  )
  assert.deepEqual(ids(output.allCandidateChecks), [
    'LBP_CHECK_OBJECTIVE_NEURO_BASELINE',
    'LBP_CHECK_WALKING_TOLERANCE',
    'LBP_CHECK_NEURODYNAMIC',
    'LBP_CHECK_HIP_CONTRIBUTION',
    'LBP_CHECK_SIJ_CONTRIBUTION',
  ])
  assert.deepEqual(ids(output.checks), [
    'LBP_CHECK_OBJECTIVE_NEURO_BASELINE',
    'LBP_CHECK_WALKING_TOLERANCE',
    'LBP_CHECK_NEURODYNAMIC',
  ])
  assert.deepEqual(ids(output.deferredChecks), [
    'LBP_CHECK_HIP_CONTRIBUTION',
    'LBP_CHECK_SIJ_CONTRIBUTION',
  ])
  assert.deepEqual(decisionKeys(output.allCandidateChecks), [
    'OBJECTIVE_NEURO_BASELINE',
    'WALKING_FUNCTION_BASELINE',
    'NEURODYNAMIC_RESPONSE',
    'HIP_TREATMENT_TARGET',
    'SIJ_TREATMENT_TARGET',
  ])
}

// Clinician override is an escape hatch, not subject to the automatic
// presentation budget. If the clinician explicitly requests five domains, all
// five remain current rather than being silently deferred.
{
  const output = evaluateLbpActionAdaptiveExperimentV02(
    scenario({
      clinicianConcernDomains: ['NEURO', 'HIP', 'SIJ', 'WALKING_TOLERANCE', 'LUMBAR_MOVEMENT'],
      lumbarMovement: 'NOT_ASSESSED',
    }),
  )
  assert.equal(output.checks.length, 5)
  assert.equal(output.deferredChecks.length, 0)
  assert.ok(output.checks.every((check) => check.requestedByClinician))
}

// Current-visit NOT_PERFORMED remains terminal for this visit.
{
  const output = evaluateLbpActionAdaptiveExperimentV02(
    scenario({
      visitKind: 'FOLLOW_UP',
      legSymptoms: 'PRESENT',
      objectiveNeuro: 'NOT_PERFORMED',
      examResultFreshness: { OBJECTIVE_NEURO: 'CURRENT_VISIT' },
    }),
  )
  assert.ok(!ids(output.allCandidateChecks).includes('LBP_CHECK_OBJECTIVE_NEURO_BASELINE'))
  assert.equal(output.freshnessWarningsKo.length, 0)
}

// Prior-visit NOT_PERFORMED must not suppress a current actionable neuro check.
{
  const output = evaluateLbpActionAdaptiveExperimentV02(
    scenario({
      visitKind: 'FOLLOW_UP',
      legSymptoms: 'PRESENT',
      objectiveNeuro: 'NOT_PERFORMED',
      examResultFreshness: { OBJECTIVE_NEURO: 'PRIOR_VISIT' },
    }),
  )
  assert.ok(ids(output.allCandidateChecks).includes('LBP_CHECK_OBJECTIVE_NEURO_BASELINE'))
}

// Missing freshness on a follow-up terminal state fails toward re-evaluation,
// with an explicit warning instead of silently assuming current-visit scope.
{
  const output = evaluateLbpActionAdaptiveExperimentV02(
    scenario({
      visitKind: 'FOLLOW_UP',
      legSymptoms: 'PRESENT',
      objectiveNeuro: 'LIMITED',
      examResultFreshness: {},
    }),
  )
  assert.ok(ids(output.allCandidateChecks).includes('LBP_CHECK_OBJECTIVE_NEURO_BASELINE'))
  assert.ok(output.freshnessWarningsKo.some((text) => text.includes('provenance')))
}

// Same freshness rule applies to a treatment-target branch.
{
  const prior = evaluateLbpActionAdaptiveExperimentV02(
    scenario({
      visitKind: 'FOLLOW_UP',
      hipContributionCue: 'PRESENT',
      hipScreen: 'LIMITED',
      examResultFreshness: { HIP_SCREEN: 'PRIOR_VISIT' },
    }),
  )
  assert.ok(ids(prior.allCandidateChecks).includes('LBP_CHECK_HIP_CONTRIBUTION'))

  const current = evaluateLbpActionAdaptiveExperimentV02(
    scenario({
      visitKind: 'FOLLOW_UP',
      hipContributionCue: 'PRESENT',
      hipScreen: 'LIMITED',
      examResultFreshness: { HIP_SCREEN: 'CURRENT_VISIT' },
    }),
  )
  assert.ok(!ids(current.allCandidateChecks).includes('LBP_CHECK_HIP_CONTRIBUTION'))
}

// Contradictory normalized facts stay visible as an adapter-quality warning;
// they are not silently converted into a diagnosis or hidden.
{
  const output = evaluateLbpActionAdaptiveExperimentV02(
    scenario({
      legSymptoms: 'ABSENT',
      radicularCue: 'PRESENT',
      walkingStandingLegPattern: 'PRESENT',
    }),
  )
  assert.ok(output.consistencyWarningsKo.length >= 2)
  assert.ok(output.invariantWarningsKo.length >= 2)
}

// Disease safety still dominates the whole adaptive layer, including deferred
// candidates. v0.2 must not create a hidden routine queue behind a safety gate.
{
  const output = evaluateLbpActionAdaptiveExperimentV02(
    scenario({
      diseaseSafetyStatus: 'REVIEW_REQUIRED',
      legSymptoms: 'PRESENT',
      radicularCue: 'PRESENT',
      walkingStandingLegPattern: 'PRESENT',
      hipContributionCue: 'PRESENT',
      sijContributionCue: 'PRESENT',
    }),
  )
  assert.equal(output.routinePathway, 'SAFETY_REVIEW_FIRST')
  assert.deepEqual(output.checks, [])
  assert.deepEqual(output.deferredChecks, [])
  assert.deepEqual(output.allCandidateChecks, [])
}

console.log('\nLBP Action-Adaptive Engine v0.2 experimental stress summary')
console.log(`- cue matrix: ${matrixCases} cases`)
console.log(`- preserved candidate histogram: ${JSON.stringify(Object.fromEntries([...candidateHistogram.entries()].sort((a, b) => a[0] - b[0])))}`)
console.log(`- current-tranche histogram: ${JSON.stringify(Object.fromEntries([...activeHistogram.entries()].sort((a, b) => a[0] - b[0])))}`)
console.log(`- cases with deferred candidates: ${deferredCases}/${matrixCases}`)
console.log(`- max automatic current checks: ${maxActive}`)
console.log(`- max deferred checks: ${maxDeferred}`)
console.log(`- sequential total Decision Key resolutions: ${convergenceSteps}`)
console.log(`- max sequential resolutions in one synthetic patient: ${maxConvergenceSteps}`)
console.log('PASS: v0.2 Decision Key + tranche + freshness stress suite')
