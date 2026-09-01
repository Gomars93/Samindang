import assert from 'node:assert/strict'
import { evaluateLbpWorkingHypothesisExperiment } from './.lbp-working-hypothesis-bundle.mjs'

/* DRAFT PRODUCT/CLINICAL GUARDRAIL TESTS — NOT CLINICAL VALIDATION. */

const base = {
  visitKind: 'INITIAL', diseaseSafetyStatus: 'CLEAR', treatmentSafetyStatus: 'CLEAR',
  legSymptoms: 'ABSENT', radicularCue: 'ABSENT', walkingStandingLegPattern: 'ABSENT',
  walkingTolerance: 'NOT_KNOWN', hipContributionCue: 'ABSENT', sijContributionCue: 'ABSENT',
  objectiveNeuro: 'NOT_ASSESSED', neurodynamic: 'NOT_ASSESSED', lumbarMovement: 'NO_CLEAR_RESPONSE',
  targetFunctionAvailable: true, targetFunctionReproduction: 'CONCORDANT_SYMPTOM_REPRODUCTION',
  hipScreen: 'NOT_ASSESSED', sijScreen: 'NOT_ASSESSED', clinicianConcernDomains: [],
  examResultFreshness: {},
  followUp: { trajectory: 'NOT_DUE', exposure: 'UNKNOWN', newOrWorseningNeuroSymptom: 'NO' },
}

function scenario(overrides = {}) {
  return {
    ...base, ...overrides,
    examResultFreshness: { ...base.examResultFreshness, ...(overrides.examResultFreshness ?? {}) },
    followUp: { ...base.followUp, ...(overrides.followUp ?? {}) },
  }
}
function byId(output, id) { return output.hypotheses.find((item) => item.id === id) }

function common(output, label) {
  assert.equal(output.ruleStatus, 'DRAFT_EXPERIMENTAL', `${label}: production status leak`)
  assert.equal(output.finalDiagnosisClaimed, false, `${label}: final diagnosis claimed`)
  assert.equal(output.clinicianConfirmationRequired, true, `${label}: clinician confirmation removed`)
  assert.ok(!Object.hasOwn(output, 'treatment'), `${label}: hypothesis engine selected treatment`)
  assert.ok(!Object.hasOwn(output, 'exercise'), `${label}: hypothesis engine selected rehab`)
  for (const h of output.hypotheses) {
    assert.equal(h.finalDiagnosisClaimed, false)
    assert.ok(h.titleKo.length > 0 && h.whyKo.length > 0)
    assert.ok(Array.isArray(h.supportsKo) && Array.isArray(h.contradictionsKo))
    assert.ok(Array.isArray(h.meaningfulUnknownsKo) && Array.isArray(h.managementMeaningKo))
  }
}

const cases = [
  {
    id: 'H01_TARGET_FUNCTION_ALONE_NOT_LUMBAR_SOURCE',
    input: scenario({ targetFunctionReproduction: 'CONCORDANT_SYMPTOM_REPRODUCTION', lumbarMovement: 'NO_CLEAR_RESPONSE' }),
    review(o) {
      assert.equal(byId(o, 'LUMBAR_MOVEMENT_RELATED_PATTERN'), undefined)
      assert.equal(o.interpretationState, 'INSUFFICIENTLY_EXPLAINED')
    },
  },
  {
    id: 'H02_LUMBAR_MOVEMENT_CONCORDANT',
    input: scenario({ lumbarMovement: 'CONCORDANT_SYMPTOM_REPRODUCTION' }),
    review(o) {
      assert.equal(byId(o, 'LUMBAR_MOVEMENT_RELATED_PATTERN')?.supportLevel, 'HIGHER_SUPPORT')
      assert.equal(o.primaryHypothesisId, 'LUMBAR_MOVEMENT_RELATED_PATTERN')
      assert.equal(o.interpretationState, 'SINGLE_LEADING_PATTERN')
    },
  },
  {
    id: 'H03_PERIPHERALIZATION_STAYS_DESCRIPTIVE',
    input: scenario({ legSymptoms: 'PRESENT', lumbarMovement: 'PERIPHERALIZES' }),
    review(o) {
      const h = byId(o, 'LUMBAR_MOVEMENT_RELATED_PATTERN')
      assert.equal(h?.supportLevel, 'HIGHER_SUPPORT')
      assert.ok(h?.titleKo.includes('증상 반응 패턴'))
      assert.ok(h?.managementMeaningKo.some((text) => text.includes('확정하지 않습니다')))
      assert.equal(byId(o, 'RADICULAR_INVOLVEMENT'), undefined, 'peripheralization/leg symptoms alone must not auto-label radicular involvement')
    },
  },
  {
    id: 'H04_LEG_SYMPTOM_ALONE_NOT_RADICULAR',
    input: scenario({ legSymptoms: 'PRESENT' }),
    review(o) {
      assert.equal(byId(o, 'RADICULAR_INVOLVEMENT'), undefined)
      assert.equal(o.primaryHypothesisId, null)
    },
  },
  {
    id: 'H05_RADICULAR_CUE_UNASSESSED',
    input: scenario({ legSymptoms: 'PRESENT', radicularCue: 'PRESENT', objectiveNeuro: 'NOT_ASSESSED', neurodynamic: 'NOT_ASSESSED' }),
    review(o) {
      const h = byId(o, 'RADICULAR_INVOLVEMENT')
      assert.equal(h?.supportLevel, 'CONSIDER')
      assert.ok(h?.meaningfulUnknownsKo.some((text) => text.includes('근력')))
      assert.ok(h?.meaningfulUnknownsKo.some((text) => text.includes('신경가동성')))
      assert.equal(o.primaryHypothesisId, null)
    },
  },
  {
    id: 'H06_RADICULAR_CONCORDANT_NEURODYNAMIC',
    input: scenario({ legSymptoms: 'PRESENT', radicularCue: 'PRESENT', objectiveNeuro: 'NORMAL', neurodynamic: 'CONCORDANT_LEG_SYMPTOM' }),
    review(o) {
      const h = byId(o, 'RADICULAR_INVOLVEMENT')
      assert.equal(h?.supportLevel, 'HIGHER_SUPPORT')
      assert.equal(h?.contradictionsKo.some((text) => text.includes('정상')), false, 'normal objective neuro must not be treated as strong contradiction')
      assert.ok(h?.managementMeaningKo.some((text) => text.includes('정상 객관적 neuro만으로')))
      assert.ok(h?.managementMeaningKo.some((text) => text.includes('SLR/Slump')))
    },
  },
  {
    id: 'H07_OBJECTIVE_NEURO_ABNORMAL_WITH_CUE',
    input: scenario({ legSymptoms: 'PRESENT', radicularCue: 'PRESENT', objectiveNeuro: 'ABNORMAL_NON_PROGRESSIVE', neurodynamic: 'NEGATIVE' }),
    review(o) {
      const h = byId(o, 'RADICULAR_INVOLVEMENT')
      assert.equal(h?.supportLevel, 'HIGHER_SUPPORT')
      assert.ok(h?.supportsKo.some((text) => text.includes('객관적')))
      assert.ok(h?.contradictionsKo.some((text) => text.includes('추가 지지가 없음')))
    },
  },
  {
    id: 'H08_WALKING_PATTERN_BASELINE_DOES_NOT_RAISE_ETIOLOGY',
    input: scenario({ legSymptoms: 'PRESENT', walkingStandingLegPattern: 'PRESENT', walkingTolerance: 'KNOWN', objectiveNeuro: 'NORMAL' }),
    review(o) {
      const h = byId(o, 'WALKING_STANDING_LEG_PATTERN')
      assert.equal(h?.supportLevel, 'CONSIDER')
      assert.ok(h?.titleKo.includes('하지증상 패턴'))
      assert.ok(h?.managementMeaningKo.some((text) => text.includes('협착증')))
      assert.ok(h?.managementMeaningKo.some((text) => text.includes('영상검사')))
    },
  },
  {
    id: 'H09_HIP_CUE_UNASSESSED',
    input: scenario({ hipContributionCue: 'PRESENT', hipScreen: 'NOT_ASSESSED' }),
    review(o) {
      const h = byId(o, 'HIP_CONTRIBUTION')
      assert.equal(h?.supportLevel, 'CONSIDER')
      assert.ok(h?.meaningfulUnknownsKo.length > 0)
    },
  },
  {
    id: 'H10_HIP_CONTRIBUTORY',
    input: scenario({ hipContributionCue: 'PRESENT', hipScreen: 'CONTRIBUTORY' }),
    review(o) {
      assert.equal(byId(o, 'HIP_CONTRIBUTION')?.supportLevel, 'HIGHER_SUPPORT')
      assert.equal(o.primaryHypothesisId, 'HIP_CONTRIBUTION')
    },
  },
  {
    id: 'H11_HIP_NONCONTRIBUTORY',
    input: scenario({ hipContributionCue: 'PRESENT', hipScreen: 'NON_CONTRIBUTORY' }),
    review(o) {
      const h = byId(o, 'HIP_CONTRIBUTION')
      assert.equal(h?.supportLevel, 'LOWER_SUPPORT')
      assert.ok(h?.contradictionsKo.length > 0)
      assert.equal(o.primaryHypothesisId, null)
    },
  },
  {
    id: 'H12_LUMBAR_PLUS_HIP',
    input: scenario({ lumbarMovement: 'IMPROVES', hipContributionCue: 'PRESENT', hipScreen: 'CONTRIBUTORY' }),
    review(o) {
      assert.equal(byId(o, 'LUMBAR_MOVEMENT_RELATED_PATTERN')?.supportLevel, 'HIGHER_SUPPORT')
      assert.equal(byId(o, 'HIP_CONTRIBUTION')?.supportLevel, 'HIGHER_SUPPORT')
      assert.equal(o.interpretationState, 'MULTIPLE_PLAUSIBLE_CONTRIBUTORS')
      assert.equal(o.primaryHypothesisId, null)
    },
  },
  {
    id: 'H13_RADICULAR_PLUS_HIP',
    input: scenario({ legSymptoms: 'PRESENT', radicularCue: 'PRESENT', objectiveNeuro: 'ABNORMAL_NON_PROGRESSIVE', neurodynamic: 'CONCORDANT_LEG_SYMPTOM', hipContributionCue: 'PRESENT', hipScreen: 'CONTRIBUTORY' }),
    review(o) {
      assert.equal(byId(o, 'RADICULAR_INVOLVEMENT')?.supportLevel, 'HIGHER_SUPPORT')
      assert.equal(byId(o, 'HIP_CONTRIBUTION')?.supportLevel, 'HIGHER_SUPPORT')
      assert.equal(o.interpretationState, 'MULTIPLE_PLAUSIBLE_CONTRIBUTORS')
      assert.equal(o.primaryHypothesisId, null)
    },
  },
  {
    id: 'H14_CONTRADICTORY_FACTS',
    input: scenario({ legSymptoms: 'ABSENT', radicularCue: 'PRESENT', walkingStandingLegPattern: 'PRESENT' }),
    review(o) {
      assert.ok(o.warningsKo.length > 0)
      assert.equal(o.primaryHypothesisId, null)
      assert.equal(o.interpretationState, 'INSUFFICIENTLY_EXPLAINED')
      assert.equal(byId(o, 'RADICULAR_INVOLVEMENT')?.supportLevel, 'INSUFFICIENT_DATA')
      assert.equal(byId(o, 'WALKING_STANDING_LEG_PATTERN')?.supportLevel, 'INSUFFICIENT_DATA')
    },
  },
  {
    id: 'H15_SAFETY_REVIEW_FIRST',
    input: scenario({ diseaseSafetyStatus: 'REVIEW_REQUIRED', lumbarMovement: 'CONCORDANT_SYMPTOM_REPRODUCTION', hipContributionCue: 'PRESENT', hipScreen: 'CONTRIBUTORY' }),
    review(o) {
      assert.equal(o.interpretationState, 'SAFETY_FIRST')
      assert.equal(o.hypotheses.length, 0)
      assert.equal(o.primaryHypothesisId, null)
    },
  },
  {
    id: 'H16_DETERIORATION_NEW_NEURO',
    input: scenario({ visitKind: 'FOLLOW_UP', legSymptoms: 'PRESENT', radicularCue: 'PRESENT', followUp: { trajectory: 'DETERIORATING', exposure: 'ADEQUATE', newOrWorseningNeuroSymptom: 'YES' } }),
    review(o) {
      assert.equal(o.interpretationState, 'SAFETY_FIRST')
      assert.equal(o.safetyContext.routinePathway, 'SAFETY_REFRESH_FIRST')
      assert.equal(o.hypotheses.length, 0)
    },
  },
]

const snapshots = []
for (const testCase of cases) {
  const output = evaluateLbpWorkingHypothesisExperiment(testCase.input)
  common(output, testCase.id)
  testCase.review(output)
  snapshots.push({ id: testCase.id, state: output.interpretationState, primary: output.primaryHypothesisId, hypotheses: output.hypotheses.map((h) => ({ title: h.titleKo, level: h.supportLevel, support: h.supportsKo, weakening: h.contradictionsKo, unknown: h.meaningfulUnknownsKo })), warnings: output.warningsKo })
}

console.log('\nLBP explainable working-hypothesis experimental snapshots')
for (const s of snapshots) {
  console.log(`\n[${s.id}] state=${s.state}; primary=${s.primary ?? '없음'}`)
  if (!s.hypotheses.length) console.log('- routine hypotheses: 없음')
  for (const h of s.hypotheses) {
    console.log(`- ${h.title} [${h.level}]`)
    console.log(`  support: ${h.support.length ? h.support.join(' / ') : '없음'}`)
    console.log(`  weakening: ${h.weakening.length ? h.weakening.join(' / ') : '없음'}`)
    console.log(`  unknown: ${h.unknown.length ? h.unknown.join(' / ') : '없음'}`)
  }
  if (s.warnings.length) console.log(`- warnings: ${s.warnings.join(' | ')}`)
}

console.log(`\nPASS: ${cases.length} explainable working-hypothesis guardrail vignettes`)
console.log('DRAFT ONLY: hypothesis rows remain subject to clinician review before production use.')
