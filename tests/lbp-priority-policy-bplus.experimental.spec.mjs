import assert from 'node:assert/strict'
import { evaluateLbpPriorityPolicyBPlusExperiment } from './.lbp-priority-policy-bplus-bundle.mjs'

/*
 * B+ PRIORITY STRESS — PRODUCT/WORKFLOW VALIDATION ONLY.
 *
 * This suite does not validate diagnosis or treatment efficacy. It verifies the
 * agreed Clinical OS intent:
 * - safety remains upstream,
 * - automatic attention stays small,
 * - treatment-target information can outrank diagnostic refinement when checks
 *   compete,
 * - Hip/SIJ ties are not broken by code order or a new patient question,
 * - deferred candidates remain unresolved rather than disappearing,
 * - clinician concern is never suppressed.
 */

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

function keys(items) {
  return items.map((item) => item.decisionKey)
}

function representedKeys(output) {
  return new Set([
    ...keys(output.checksNow),
    ...output.clinicianChoiceGroups.flatMap((group) =>
      group.options.map((option) => option.decisionKey),
    ),
    ...keys(output.deferredChecks),
  ])
}

function assertPartitionPreserved(output, label) {
  const candidateKeys = new Set(keys(output.allCandidateChecks))
  const represented = representedKeys(output)
  assert.deepEqual(represented, candidateKeys, `${label}: candidate disappeared from B+ partition`)
  assert.ok(
    output.presentation.automaticItemsShown <= 3,
    `${label}: automatic presentation exceeded cognitive budget`,
  )
}

const cases = [
  {
    label: 'SIMPLE_AXIAL',
    input: scenario({
      lumbarMovement: 'NOT_ASSESSED',
      targetFunctionReproduction: 'NOT_ASSESSED',
    }),
    check(output) {
      assert.deepEqual(
        new Set(keys(output.checksNow)),
        new Set(['TARGET_FUNCTION_REPRODUCTION', 'LUMBAR_DIRECTIONAL_RESPONSE']),
      )
      assert.equal(output.clinicianChoiceGroups.length, 0)
    },
  },
  {
    label: 'RADICULAR_ONLY',
    input: scenario({ legSymptoms: 'PRESENT', radicularCue: 'PRESENT' }),
    check(output) {
      assert.ok(keys(output.checksNow).includes('OBJECTIVE_NEURO_BASELINE'))
      assert.ok(keys(output.checksNow).includes('NEURODYNAMIC_RESPONSE'))
    },
  },
  {
    label: 'RADICULAR_WALKING_HIP',
    input: scenario({
      legSymptoms: 'PRESENT',
      radicularCue: 'PRESENT',
      walkingStandingLegPattern: 'PRESENT',
      hipContributionCue: 'PRESENT',
    }),
    check(output) {
      assert.deepEqual(
        keys(output.checksNow),
        ['OBJECTIVE_NEURO_BASELINE', 'WALKING_FUNCTION_BASELINE', 'HIP_TREATMENT_TARGET'],
      )
      assert.deepEqual(keys(output.deferredChecks), ['NEURODYNAMIC_RESPONSE'])
    },
  },
  {
    label: 'RADICULAR_WALKING_SIJ',
    input: scenario({
      legSymptoms: 'PRESENT',
      radicularCue: 'PRESENT',
      walkingStandingLegPattern: 'PRESENT',
      sijContributionCue: 'PRESENT',
    }),
    check(output) {
      assert.deepEqual(
        keys(output.checksNow),
        ['OBJECTIVE_NEURO_BASELINE', 'WALKING_FUNCTION_BASELINE', 'SIJ_TREATMENT_TARGET'],
      )
      assert.deepEqual(keys(output.deferredChecks), ['NEURODYNAMIC_RESPONSE'])
    },
  },
  {
    label: 'ALL_CUES_TIE_DOES_NOT_PRIVILEGE_HIP',
    input: scenario({
      legSymptoms: 'PRESENT',
      radicularCue: 'PRESENT',
      walkingStandingLegPattern: 'PRESENT',
      hipContributionCue: 'PRESENT',
      sijContributionCue: 'PRESENT',
    }),
    check(output) {
      assert.deepEqual(
        keys(output.checksNow),
        ['OBJECTIVE_NEURO_BASELINE', 'WALKING_FUNCTION_BASELINE'],
      )
      assert.equal(output.clinicianChoiceGroups.length, 1)
      const group = output.clinicianChoiceGroups[0]
      assert.equal(group.addsPatientQuestion, false)
      assert.equal(group.selectOneByDefault, true)
      assert.equal(group.clinicianMaySelectMoreThanOne, true)
      assert.deepEqual(
        new Set(group.options.map((option) => option.decisionKey)),
        new Set(['HIP_TREATMENT_TARGET', 'SIJ_TREATMENT_TARGET']),
      )
      assert.deepEqual(keys(output.deferredChecks), ['NEURODYNAMIC_RESPONSE'])
    },
  },
  {
    label: 'RADICULAR_HIP_SIJ_HAS_ROOM_FOR_BOTH_TARGETS',
    input: scenario({
      legSymptoms: 'PRESENT',
      radicularCue: 'PRESENT',
      hipContributionCue: 'PRESENT',
      sijContributionCue: 'PRESENT',
    }),
    check(output) {
      assert.deepEqual(
        keys(output.checksNow),
        ['OBJECTIVE_NEURO_BASELINE', 'HIP_TREATMENT_TARGET', 'SIJ_TREATMENT_TARGET'],
      )
      assert.deepEqual(keys(output.deferredChecks), ['NEURODYNAMIC_RESPONSE'])
      assert.equal(output.clinicianChoiceGroups.length, 0)
    },
  },
  {
    label: 'CLINICIAN_OVERRIDE_PRESERVED',
    input: scenario({
      legSymptoms: 'PRESENT',
      radicularCue: 'PRESENT',
      walkingStandingLegPattern: 'PRESENT',
      hipContributionCue: 'PRESENT',
      sijContributionCue: 'PRESENT',
      clinicianConcernDomains: ['NEURO', 'HIP', 'SIJ'],
    }),
    check(output) {
      const requested = output.allCandidateChecks
        .filter((item) => item.requestedByClinician)
        .map((item) => item.decisionKey)
      for (const key of requested) {
        assert.ok(keys(output.checksNow).includes(key), `clinician-requested ${key} was suppressed`)
      }
    },
  },
  {
    label: 'SAFETY_REVIEW_STAYS_UPSTREAM',
    input: scenario({ diseaseSafetyStatus: 'REVIEW_REQUIRED', hipContributionCue: 'PRESENT' }),
    check(output) {
      assert.equal(output.routinePathway, 'SAFETY_REVIEW_FIRST')
      assert.equal(output.checksNow.length, 0)
      assert.equal(output.clinicianChoiceGroups.length, 0)
    },
  },
]

for (const testCase of cases) {
  const output = evaluateLbpPriorityPolicyBPlusExperiment(testCase.input)
  assert.equal(output.ruleStatus, 'DRAFT_EXPERIMENTAL')
  assert.equal(output.policy, 'PRIMARY_CARE_B_PLUS')
  assertPartitionPreserved(output, testCase.label)
  testCase.check(output)
}

// Combination stress: preserve every generated candidate, never exceed three
// automatic presentation items, and never let a tied Hip/SIJ one-slot conflict
// silently become Hip-by-code-order.
const legStates = ['ABSENT', 'PRESENT', 'UNCERTAIN']
const binary = ['ABSENT', 'PRESENT']
let matrixCount = 0
let tieChoiceCount = 0
let maxAutomaticItems = 0

for (const legSymptoms of legStates) {
  for (const radicularCue of binary) {
    for (const walkingStandingLegPattern of binary) {
      for (const hipContributionCue of binary) {
        for (const sijContributionCue of binary) {
          const output = evaluateLbpPriorityPolicyBPlusExperiment(
            scenario({
              legSymptoms,
              radicularCue,
              walkingStandingLegPattern,
              hipContributionCue,
              sijContributionCue,
            }),
          )
          matrixCount += 1
          maxAutomaticItems = Math.max(
            maxAutomaticItems,
            output.presentation.automaticItemsShown,
          )
          assertPartitionPreserved(
            output,
            `matrix:${legSymptoms}/${radicularCue}/${walkingStandingLegPattern}/${hipContributionCue}/${sijContributionCue}`,
          )

          for (const group of output.clinicianChoiceGroups) {
            tieChoiceCount += 1
            assert.equal(group.addsPatientQuestion, false)
            assert.deepEqual(
              new Set(group.options.map((option) => option.decisionKey)),
              new Set(['HIP_TREATMENT_TARGET', 'SIJ_TREATMENT_TARGET']),
            )
          }
        }
      }
    }
  }
}

console.log('\nLBP B+ primary-care priority stress summary')
console.log(`- named scenarios: ${cases.length}`)
console.log(`- combination matrix: ${matrixCount}`)
console.log(`- max automatic presentation items: ${maxAutomaticItems}`)
console.log(`- explicit Hip/SIJ tie-choice presentations: ${tieChoiceCount}`)
console.log('- no extra patient question is introduced to break treatment-target ties')
console.log('- deferred neurodynamic/other candidates remain unresolved rather than deleted')
console.log('PASS: B+ priority preserves original primary-care Clinical OS intent')
