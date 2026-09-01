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
  objectiveNeuro: 'NORMAL',
  neurodynamic: 'NEGATIVE',
  lumbarMovement: 'NO_CLEAR_RESPONSE',
  targetFunctionAvailable: true,
  targetFunctionReproduction: 'CONCORDANT_SYMPTOM_REPRODUCTION',
  hipScreen: 'NOT_ASSESSED',
  sijScreen: 'NOT_ASSESSED',
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

function assertContainsIds(output, expected) {
  const actual = ids(output)
  for (const id of expected) assert.ok(actual.includes(id), `expected check ${id}; got ${actual.join(', ')}`)
}

function assertDoesNotContainIds(output, unexpected) {
  const actual = ids(output)
  for (const id of unexpected) assert.ok(!actual.includes(id), `unexpected check ${id}; got ${actual.join(', ')}`)
}

function assertStructuralInvariants(name, output) {
  assert.equal(output.ruleStatus, 'DRAFT_EXPERIMENTAL', `${name}: production status leak`)
  assert.equal(output.clinicianOverrideAvailable, true, `${name}: clinician override must remain available`)
  const checkIds = ids(output)
  assert.equal(new Set(checkIds).size, checkIds.length, `${name}: duplicate check ids`)
  for (const check of output.checks) {
    assert.equal(check.ruleStatus, 'DRAFT_EXPERIMENTAL', `${name}: check must stay experimental`)
    assert.ok(check.changesManagement.length > 0, `${name}: management-irrelevant check ${check.id}`)
    assert.ok(check.reasonKo.length > 0, `${name}: missing reason for ${check.id}`)
    assert.ok(check.help.howKo.length > 0, `${name}: missing how-help for ${check.id}`)
    assert.ok(check.help.whyKo.length > 0, `${name}: missing why-help for ${check.id}`)
  }
}

const results = []
function run(name, input, verify, ordinary = true) {
  const output = evaluateLbpActionAdaptiveExperiment(input)
  assertStructuralInvariants(name, output)
  verify(output)
  if (ordinary) assert.ok(output.checks.length <= 3, `${name}: ordinary flow exceeded 3 checks (${output.checks.length})`)
  results.push({ name, checks: output.checks.length, pathway: output.routinePathway })
}

run(
  'simple axial LBP stays short',
  scenario({
    lumbarMovement: 'NOT_ASSESSED',
    targetFunctionReproduction: 'NOT_ASSESSED',
  }),
  (output) => {
    assert.deepEqual(ids(output), [
      'LBP_CHECK_TARGET_FUNCTION_REPRODUCTION',
      'LBP_CHECK_LUMBAR_MOVEMENT_RESPONSE',
    ])
  },
)

run(
  'missing target function is repaired doctor-side without tablet change',
  scenario({
    targetFunctionAvailable: false,
    targetFunctionReproduction: 'NOT_ASSESSED',
    lumbarMovement: 'NOT_ASSESSED',
  }),
  (output) => {
    assertContainsIds(output, ['LBP_CHECK_DEFINE_TARGET_FUNCTION', 'LBP_CHECK_LUMBAR_MOVEMENT_RESPONSE'])
    assertDoesNotContainIds(output, ['LBP_CHECK_TARGET_FUNCTION_REPRODUCTION'])
  },
)

run(
  'uncertain leg symptom gets one clarification before neuro bundle',
  scenario({
    legSymptoms: 'UNCERTAIN',
    objectiveNeuro: 'NOT_ASSESSED',
  }),
  (output) => {
    assert.deepEqual(ids(output), ['LBP_CHECK_CLARIFY_LEG_SYMPTOM'])
    assert.ok(output.uncertaintyNotesKo.some((text) => text.includes('불명확')))
  },
)

run(
  'radicular cue opens neuro baseline plus one neurodynamic check',
  scenario({
    legSymptoms: 'PRESENT',
    radicularCue: 'PRESENT',
    objectiveNeuro: 'NOT_ASSESSED',
    neurodynamic: 'NOT_ASSESSED',
  }),
  (output) => {
    assert.deepEqual(ids(output), [
      'LBP_CHECK_OBJECTIVE_NEURO_BASELINE',
      'LBP_CHECK_NEURODYNAMIC',
    ])
  },
)

run(
  'walking-limited leg pattern tracks walking without automatic stenosis questionnaire cascade',
  scenario({
    legSymptoms: 'PRESENT',
    walkingStandingLegPattern: 'PRESENT',
    walkingTolerance: 'NOT_KNOWN',
    objectiveNeuro: 'NOT_ASSESSED',
  }),
  (output) => {
    assert.deepEqual(ids(output), [
      'LBP_CHECK_OBJECTIVE_NEURO_BASELINE',
      'LBP_CHECK_WALKING_TOLERANCE',
    ])
    assertDoesNotContainIds(output, ['LBP_CHECK_NEURODYNAMIC'])
  },
)

run(
  'hip cue can open early without waiting for lumbar failure',
  scenario({
    hipContributionCue: 'PRESENT',
    hipScreen: 'NOT_ASSESSED',
  }),
  (output) => {
    assert.deepEqual(ids(output), ['LBP_CHECK_HIP_CONTRIBUTION'])
  },
)

run(
  'SIJ cue can open early and is not forced behind hip',
  scenario({
    sijContributionCue: 'PRESENT',
    sijScreen: 'NOT_ASSESSED',
  }),
  (output) => {
    assert.deepEqual(ids(output), ['LBP_CHECK_SIJ_CONTRIBUTION'])
  },
)

run(
  'hip and SIJ remain parallel rather than mutually exclusive',
  scenario({
    hipContributionCue: 'PRESENT',
    sijContributionCue: 'PRESENT',
    hipScreen: 'NOT_ASSESSED',
    sijScreen: 'NOT_ASSESSED',
  }),
  (output) => {
    assertContainsIds(output, ['LBP_CHECK_HIP_CONTRIBUTION', 'LBP_CHECK_SIJ_CONTRIBUTION'])
  },
)

run(
  'adequate non-response only reopens cue-supported unassessed area',
  scenario({
    visitKind: 'FOLLOW_UP',
    hipContributionCue: 'PRESENT',
    hipScreen: 'NOT_ASSESSED',
    followUp: {
      trajectory: 'NO_MEANINGFUL_CHANGE',
      exposure: 'ADEQUATE',
    },
  }),
  (output) => {
    assert.deepEqual(ids(output), ['LBP_CHECK_HIP_CONTRIBUTION'])
    assert.equal(output.checks[0].priority, 'HIGH')
    assert.ok(output.reviewNotesKo.some((text) => text.includes('기존 단서')))
  },
)

run(
  'adequate non-response without cues does not open every unassessed branch',
  scenario({
    visitKind: 'FOLLOW_UP',
    followUp: {
      trajectory: 'NO_MEANINGFUL_CHANGE',
      exposure: 'ADEQUATE',
    },
  }),
  (output) => {
    assert.equal(output.checks.length, 0)
    assert.equal(output.stopRule.satisfied, true)
    assert.ok(output.reviewNotesKo.some((text) => text.includes('모든 미평가 영역을 자동으로 열지 않습니다')))
  },
)

run(
  'insufficient exposure is not used as a reason to deepen diagnosis',
  scenario({
    visitKind: 'FOLLOW_UP',
    followUp: {
      trajectory: 'NO_MEANINGFUL_CHANGE',
      exposure: 'INADEQUATE',
    },
  }),
  (output) => {
    assert.equal(output.checks.length, 0)
    assert.ok(output.reviewNotesKo.some((text) => text.includes('노출이 부족')))
  },
)

run(
  'unclear neurodynamic result stays uncertain without automatic alternate-test cascade',
  scenario({
    legSymptoms: 'PRESENT',
    radicularCue: 'PRESENT',
    objectiveNeuro: 'NORMAL',
    neurodynamic: 'UNCLEAR',
  }),
  (output) => {
    assert.equal(output.checks.length, 0)
    assert.ok(output.uncertaintyNotesKo.some((text) => text.includes('자동 연쇄하지 않고')))
  },
)

run(
  'unclear objective neuro is not treated as normal',
  scenario({
    legSymptoms: 'PRESENT',
    objectiveNeuro: 'UNCLEAR',
  }),
  (output) => {
    assert.deepEqual(ids(output), ['LBP_CHECK_OBJECTIVE_NEURO_BASELINE'])
  },
)

run(
  'treatment-safety review does not erase routine assessment but blocks finalization',
  scenario({
    treatmentSafetyStatus: 'REVIEW_REQUIRED',
    lumbarMovement: 'NOT_ASSESSED',
    targetFunctionReproduction: 'NOT_ASSESSED',
  }),
  (output) => {
    assert.equal(output.routinePathway, 'AVAILABLE')
    assert.equal(output.treatmentFinalizationRequiresClinicianReview, true)
    assert.equal(output.checks.length, 2)
  },
)

run(
  'disease safety review takes precedence and prevents routine question cascade',
  scenario({
    diseaseSafetyStatus: 'REVIEW_REQUIRED',
    hipContributionCue: 'PRESENT',
    sijContributionCue: 'PRESENT',
    lumbarMovement: 'NOT_ASSESSED',
    targetFunctionReproduction: 'NOT_ASSESSED',
  }),
  (output) => {
    assert.equal(output.routinePathway, 'SAFETY_REVIEW_FIRST')
    assert.equal(output.checks.length, 0)
  },
)

run(
  'deterioration refreshes safety and neuro before etiology expansion',
  scenario({
    visitKind: 'FOLLOW_UP',
    legSymptoms: 'PRESENT',
    hipContributionCue: 'PRESENT',
    sijContributionCue: 'PRESENT',
    objectiveNeuro: 'NOT_ASSESSED',
    followUp: {
      trajectory: 'DETERIORATING',
      exposure: 'ADEQUATE',
      newOrWorseningNeuroSymptom: 'YES',
    },
  }),
  (output) => {
    assert.equal(output.routinePathway, 'SAFETY_REFRESH_FIRST')
    assert.deepEqual(ids(output), ['LBP_CHECK_OBJECTIVE_NEURO_BASELINE'])
    assert.equal(output.checks[0].priority, 'BLOCKING')
  },
)

run(
  'inconsistent severe objective deficit and CLEAR safety fails closed',
  scenario({
    legSymptoms: 'PRESENT',
    objectiveNeuro: 'SEVERE_OR_PROGRESSIVE',
  }),
  (output) => {
    assert.equal(output.routinePathway, 'SAFETY_REVIEW_FIRST')
    assert.equal(output.checks.length, 0)
    assert.ok(output.invariantWarningsKo.length > 0)
  },
)

run(
  'resolved simple case legitimately returns zero additional checks',
  scenario(),
  (output) => {
    assert.equal(output.checks.length, 0)
    assert.equal(output.stopRule.satisfied, true)
  },
)

// Deliberately adversarial multi-cue case: the experiment exposes rather than
// silently hides an over-questioning collision. This is tracked as a stress
// metric, not treated as an ordinary-flow acceptance case.
run(
  'adversarial multi-cue collision remains visible to reviewers',
  scenario({
    legSymptoms: 'PRESENT',
    radicularCue: 'PRESENT',
    walkingStandingLegPattern: 'PRESENT',
    walkingTolerance: 'NOT_KNOWN',
    hipContributionCue: 'PRESENT',
    sijContributionCue: 'PRESENT',
    objectiveNeuro: 'NOT_ASSESSED',
    neurodynamic: 'NOT_ASSESSED',
  }),
  (output) => {
    assert.ok(output.checks.length > 3, 'stress fixture should expose the multi-branch collision for review')
    assertContainsIds(output, [
      'LBP_CHECK_OBJECTIVE_NEURO_BASELINE',
      'LBP_CHECK_WALKING_TOLERANCE',
      'LBP_CHECK_NEURODYNAMIC',
      'LBP_CHECK_HIP_CONTRIBUTION',
      'LBP_CHECK_SIJ_CONTRIBUTION',
    ])
  },
  false,
)

console.log('\nLBP Action-Adaptive Engine experimental stress summary')
for (const row of results) {
  console.log(`- ${row.name}: checks=${row.checks}, pathway=${row.pathway}`)
}
console.log(`PASS: ${results.length} scenarios`)
