import assert from 'node:assert/strict'
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

function decisionKeys(items) {
  return items.map((item) => item.decisionKey)
}

function assertStructural(output, label) {
  assert.equal(output.ruleStatus, 'DRAFT_EXPERIMENTAL', `${label}: production leak`)
  assert.equal(output.scheduling.strategy, 'DECISION_SUFFICIENCY_V0_3')
  assert.equal(output.sufficiency.assessmentIsClinicalRule, false, `${label}: experimental sufficiency became clinical rule`)

  const partition = [...output.checks, ...output.deferredChecks, ...output.notNeededTodayChecks]
  assert.equal(new Set(ids(partition)).size, partition.length, `${label}: duplicate check across dispositions`)
  assert.equal(new Set(decisionKeys(partition)).size, partition.length, `${label}: duplicate Decision Key across dispositions`)
  assert.deepEqual(new Set(ids(partition)), new Set(ids(output.allCandidateChecks)), `${label}: candidate lost by sufficiency staging`)

  for (const check of output.notNeededTodayChecks) {
    assert.equal(check.disposition, 'NOT_NEEDED_TODAY')
    assert.equal(check.decisionRole, 'OPTIONAL_REFINEMENT', `${label}: foundational/mandatory check suppressed`)
    assert.ok(check.dispositionReasonKo.length > 0)
  }
  for (const check of output.deferredChecks) {
    assert.equal(check.disposition, 'DEFERRED_PENDING_SUFFICIENCY')
    assert.ok(check.dispositionReasonKo.length > 0)
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

function applyAllNeutral(input, checks) {
  let next = structuredClone(input)
  for (const check of checks) next = applyNeutralResult(next, check.id)
  return next
}

const cueValues = ['ABSENT', 'PRESENT', 'UNCERTAIN']
let matrixCases = 0
let initialPresented = 0
let sufficientPolicyPerformed = 0
let sufficientPolicyNotNeeded = 0
let insufficientPolicyPerformed = 0
let maxSufficientPolicyPerformed = 0
let maxInsufficientPolicyPerformed = 0
let sufficientStoppedWithOptionalUnperformed = 0

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
          const first = evaluateLbpActionAdaptiveExperimentV03(input)
          assertStructural(first, `${label} first`)
          assert.ok(first.checks.length <= 3, `${label}: initial automatic tranche exceeded 3`)
          matrixCases += 1
          initialPresented += first.checks.length

          // Policy A (architecture-only hypothesis): resolve the first tranche,
          // then an external CURRENT_VISIT sufficiency judgement says management
          // is adequate. Remaining optional refinements should stay explicitly
          // unperformed rather than being automatically cascaded.
          let sufficientInput = applyAllNeutral(input, first.checks)
          let performedA = first.checks.length
          if (first.checks.length > 0) {
            sufficientInput.managementSufficiency = {
              status: 'SUFFICIENT_FOR_TODAY',
              freshness: 'CURRENT_VISIT',
              assessedAfterDecisionKeys: decisionKeys(first.checks),
              reasonKo: 'synthetic architecture stress input only',
            }
          }
          const afterSufficient = evaluateLbpActionAdaptiveExperimentV03(sufficientInput)
          assertStructural(afterSufficient, `${label} sufficient`)
          // If a newly unresolved foundational decision appeared, v0.3 must not
          // trust sufficiency. The existing engine should not create such an
          // unrelated cascade after neutral resolution, but keep the guard testable.
          performedA += afterSufficient.checks.length
          sufficientPolicyPerformed += performedA
          sufficientPolicyNotNeeded += afterSufficient.notNeededTodayChecks.length
          if (afterSufficient.notNeededTodayChecks.length > 0) sufficientStoppedWithOptionalUnperformed += 1
          maxSufficientPolicyPerformed = Math.max(maxSufficientPolicyPerformed, performedA)

          // Policy B: management remains insufficient. The engine must retain
          // every independent Decision Key and converge without loss.
          let insufficientInput = structuredClone(input)
          let performedB = 0
          const seen = new Set()
          while (true) {
            insufficientInput.managementSufficiency = {
              status: 'INSUFFICIENT_FOR_TODAY',
              freshness: 'CURRENT_VISIT',
              assessedAfterDecisionKeys: [],
            }
            const output = evaluateLbpActionAdaptiveExperimentV03(insufficientInput)
            assertStructural(output, `${label} insufficient ${performedB}`)
            if (output.allCandidateChecks.length === 0) break
            assert.ok(output.checks.length > 0, `${label}: candidates exist but no current check`)
            assert.ok(output.checks.length <= 3, `${label}: insufficient-policy tranche exceeded 3`)
            const signature = JSON.stringify({
              state: insufficientInput,
              checks: ids(output.checks),
              deferred: ids(output.deferredChecks),
            })
            assert.ok(!seen.has(signature), `${label}: loop under insufficient policy`)
            seen.add(signature)
            insufficientInput = applyNeutralResult(insufficientInput, output.checks[0].id)
            performedB += 1
            assert.ok(performedB <= 8, `${label}: failed to converge within 8 resolutions`)
          }
          insufficientPolicyPerformed += performedB
          maxInsufficientPolicyPerformed = Math.max(maxInsufficientPolicyPerformed, performedB)
        }
      }
    }
  }
}

assert.equal(matrixCases, 243)
assert.equal(initialPresented, 501, 'v0.3 initial presentation should preserve v0.2 current-tranche baseline')
assert.equal(
  sufficientPolicyPerformed,
  501,
  'conditional sufficiency architecture should stop after the first tranche instead of automatically consuming deferred optional refinements',
)
assert.equal(sufficientPolicyNotNeeded, 30, 'expected 30 deferred optional refinements to become explicit NOT_NEEDED_TODAY under synthetic sufficient policy')
assert.equal(sufficientStoppedWithOptionalUnperformed, 27, 'expected the same 27 complex cue cases to stop with optional refinements preserved but unperformed')
assert.equal(maxSufficientPolicyPerformed, 3)
assert.equal(insufficientPolicyPerformed, 531, 'insufficient policy must preserve all independent Decision Keys')
assert.equal(maxInsufficientPolicyPerformed, 5)

// Worst case: five candidates. After the first three are neutrally resolved and
// an external current-visit sufficiency judgement is supplied, Hip/SIJ remain
// visibly unassessed but do not automatically open today.
{
  const input = scenario({
    legSymptoms: 'PRESENT',
    radicularCue: 'PRESENT',
    walkingStandingLegPattern: 'PRESENT',
    hipContributionCue: 'PRESENT',
    sijContributionCue: 'PRESENT',
  })
  const first = evaluateLbpActionAdaptiveExperimentV03(input)
  assert.deepEqual(ids(first.checks), [
    'LBP_CHECK_OBJECTIVE_NEURO_BASELINE',
    'LBP_CHECK_WALKING_TOLERANCE',
    'LBP_CHECK_NEURODYNAMIC',
  ])
  assert.deepEqual(ids(first.deferredChecks), [
    'LBP_CHECK_HIP_CONTRIBUTION',
    'LBP_CHECK_SIJ_CONTRIBUTION',
  ])

  const afterThree = applyAllNeutral(input, first.checks)
  afterThree.managementSufficiency = {
    status: 'SUFFICIENT_FOR_TODAY',
    freshness: 'CURRENT_VISIT',
    assessedAfterDecisionKeys: decisionKeys(first.checks),
  }
  const stopped = evaluateLbpActionAdaptiveExperimentV03(afterThree)
  assert.deepEqual(ids(stopped.checks), [])
  assert.deepEqual(ids(stopped.deferredChecks), [])
  assert.deepEqual(ids(stopped.notNeededTodayChecks), [
    'LBP_CHECK_HIP_CONTRIBUTION',
    'LBP_CHECK_SIJ_CONTRIBUTION',
  ])
  assert.equal(afterThree.hipScreen, 'NOT_ASSESSED')
  assert.equal(afterThree.sijScreen, 'NOT_ASSESSED')
  assert.equal(stopped.stopRule.satisfied, true)
}

// Adequate non-response invalidates a prior/current sufficiency shortcut and
// reopens cue-supported unassessed treatment-target branches.
{
  const input = scenario({
    visitKind: 'FOLLOW_UP',
    hipContributionCue: 'PRESENT',
    sijContributionCue: 'PRESENT',
    managementSufficiency: {
      status: 'SUFFICIENT_FOR_TODAY',
      freshness: 'CURRENT_VISIT',
      assessedAfterDecisionKeys: ['LUMBAR_DIRECTIONAL_RESPONSE'],
    },
    followUp: {
      trajectory: 'NO_MEANINGFUL_CHANGE',
      exposure: 'ADEQUATE',
    },
  })
  const output = evaluateLbpActionAdaptiveExperimentV03(input)
  assert.equal(output.sufficiency.effectiveStatus, 'INSUFFICIENT_FOR_TODAY')
  assert.equal(output.sufficiency.suppressionAllowed, false)
  assert.deepEqual(new Set(ids(output.checks)), new Set(['LBP_CHECK_HIP_CONTRIBUTION', 'LBP_CHECK_SIJ_CONTRIBUTION']))
  assert.deepEqual(output.notNeededTodayChecks, [])
  assert.ok(output.sufficiency.warningsKo.some((text) => text.includes('의미 있는 변화')))
}

// Prior-visit or unknown sufficiency can never suppress current optional checks.
for (const freshness of ['PRIOR_VISIT', 'UNKNOWN']) {
  const output = evaluateLbpActionAdaptiveExperimentV03(
    scenario({
      hipContributionCue: 'PRESENT',
      managementSufficiency: {
        status: 'SUFFICIENT_FOR_TODAY',
        freshness,
        assessedAfterDecisionKeys: ['LUMBAR_DIRECTIONAL_RESPONSE'],
      },
    }),
  )
  assert.equal(output.sufficiency.suppressionAllowed, false)
  assert.ok(ids(output.checks).includes('LBP_CHECK_HIP_CONTRIBUTION'))
  assert.deepEqual(output.notNeededTodayChecks, [])
}

// Sufficiency without an audit trail of which decisions were already resolved
// is not allowed to hide optional branches.
{
  const output = evaluateLbpActionAdaptiveExperimentV03(
    scenario({
      hipContributionCue: 'PRESENT',
      managementSufficiency: {
        status: 'SUFFICIENT_FOR_TODAY',
        freshness: 'CURRENT_VISIT',
        assessedAfterDecisionKeys: [],
      },
    }),
  )
  assert.equal(output.sufficiency.suppressionAllowed, false)
  assert.ok(ids(output.checks).includes('LBP_CHECK_HIP_CONTRIBUTION'))
}

// A newly unresolved foundational decision invalidates suppression even if a
// current-visit sufficiency flag exists from an earlier decision state.
{
  const output = evaluateLbpActionAdaptiveExperimentV03(
    scenario({
      legSymptoms: 'PRESENT',
      objectiveNeuro: 'NOT_ASSESSED',
      hipContributionCue: 'PRESENT',
      managementSufficiency: {
        status: 'SUFFICIENT_FOR_TODAY',
        freshness: 'CURRENT_VISIT',
        assessedAfterDecisionKeys: ['HIP_TREATMENT_TARGET'],
      },
    }),
  )
  assert.equal(output.sufficiency.effectiveStatus, 'UNCERTAIN')
  assert.equal(output.sufficiency.suppressionAllowed, false)
  assert.ok(ids(output.checks).includes('LBP_CHECK_OBJECTIVE_NEURO_BASELINE'))
  assert.ok(ids(output.checks).includes('LBP_CHECK_HIP_CONTRIBUTION'))
  assert.ok(output.sufficiency.warningsKo.some((text) => text.includes('foundational')))
}

// Clinician override is never converted to NOT_NEEDED_TODAY by automatic
// sufficiency logic.
{
  const output = evaluateLbpActionAdaptiveExperimentV03(
    scenario({
      clinicianConcernDomains: ['HIP'],
      managementSufficiency: {
        status: 'SUFFICIENT_FOR_TODAY',
        freshness: 'CURRENT_VISIT',
        assessedAfterDecisionKeys: ['LUMBAR_DIRECTIONAL_RESPONSE'],
      },
    }),
  )
  assert.deepEqual(ids(output.checks), ['LBP_CHECK_HIP_CONTRIBUTION'])
  assert.equal(output.checks[0].decisionRole, 'CLINICIAN_REQUESTED')
  assert.deepEqual(output.notNeededTodayChecks, [])
}

// Disease safety still dominates. No hidden optional queue should sit behind a
// non-clear disease safety gate.
{
  const output = evaluateLbpActionAdaptiveExperimentV03(
    scenario({
      diseaseSafetyStatus: 'REVIEW_REQUIRED',
      legSymptoms: 'PRESENT',
      radicularCue: 'PRESENT',
      hipContributionCue: 'PRESENT',
      sijContributionCue: 'PRESENT',
      managementSufficiency: {
        status: 'SUFFICIENT_FOR_TODAY',
        freshness: 'CURRENT_VISIT',
        assessedAfterDecisionKeys: ['OBJECTIVE_NEURO_BASELINE'],
      },
    }),
  )
  assert.equal(output.routinePathway, 'SAFETY_REVIEW_FIRST')
  assert.deepEqual(output.checks, [])
  assert.deepEqual(output.deferredChecks, [])
  assert.deepEqual(output.notNeededTodayChecks, [])
  assert.deepEqual(output.allCandidateChecks, [])
}

console.log('\nLBP Action-Adaptive Engine v0.3 Decision Sufficiency stress summary')
console.log(`- cue matrix: ${matrixCases} cases`)
console.log(`- v0.2-equivalent initial checks presented: ${initialPresented}`)
console.log(`- synthetic SUFFICIENT-after-first-tranche performed checks: ${sufficientPolicyPerformed}`)
console.log(`- optional checks explicitly left NOT_NEEDED_TODAY: ${sufficientPolicyNotNeeded}`)
console.log(`- complex cases stopped without auto-opening optional refinements: ${sufficientStoppedWithOptionalUnperformed}/${matrixCases}`)
console.log(`- max performed under synthetic sufficient policy: ${maxSufficientPolicyPerformed}`)
console.log(`- INSUFFICIENT policy preserved Decision Key resolutions: ${insufficientPolicyPerformed}`)
console.log(`- max performed under insufficient policy: ${maxInsufficientPolicyPerformed}`)
console.log('PASS: v0.3 Decision Sufficiency + stale-state + reopening stress suite')
