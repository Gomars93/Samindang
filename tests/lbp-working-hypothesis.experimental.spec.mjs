import assert from 'node:assert/strict'
import { evaluateLbpWorkingHypothesisExperiment } from './.lbp-working-hypothesis-bundle.mjs'

/*
 * EXPLAINABLE WORKING HYPOTHESIS — DRAFT / NOT CLINICAL VALIDATION.
 *
 * Tests product/clinical guardrails already agreed:
 * - safety first;
 * - no final diagnosis claim;
 * - no single-test = diagnosis shortcut;
 * - support / contradiction / unknowns are visible;
 * - multiple contributors may coexist;
 * - contradictory facts do not get forced into a confident bucket;
 * - hypothesis output does not select treatment or rehab.
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

function byId(output, id) {
  return output.hypotheses.find((item) => item.id === id)
}

function common(output, label) {
  assert.equal(output.ruleStatus, 'DRAFT_EXPERIMENTAL', `${label}: production status leak`)
  assert.equal(output.finalDiagnosisClaimed, false, `${label}: final diagnosis claimed`)
  assert.equal(output.clinicianConfirmationRequired, true, `${label}: clinician confirmation removed`)
  assert.ok(!Object.hasOwn(output, 'treatment'), `${label}: hypothesis engine selected treatment`)
  assert.ok(!Object.hasOwn(output, 'exercise'), `${label}: hypothesis engine selected rehab`)
  for (const hypothesis of output.hypotheses) {
    assert.equal(hypothesis.finalDiagnosisClaimed, false)
    assert.ok(hypothesis.titleKo.length > 0)
    assert.ok(hypothesis.whyKo.length > 0)
    assert.ok(Array.isArray(hypothesis.supportsKo))
    assert.ok(Array.isArray(hypothesis.contradictionsKo))
    assert.ok(Array.isArray(hypothesis.meaningfulUnknownsKo))
    assert.ok(Array.isArray(hypothesis.managementMeaningKo))
  }
}

const cases = [
  {
    id: 'H01_TARGET_FUNCTION_ALONE_IS_NOT_LUMBAR_SOURCE',
    title: '목표동작 재현만으로 lumbar 가설을 만들지 않음',
    input: scenario({
      targetFunctionReproduction: 'CONCORDANT_SYMPTOM_REPRODUCTION',
      lumbarMovement: 'NO_CLEAR_RESPONSE',
    }),
    review(output) {
      assert.equal(byId(output, 'MECHANICAL_LUMBAR_CONTRIBUTION'), undefined)
      assert.equal(output.interpretationState, 'INSUFFICIENTLY_EXPLAINED')
    },
  },
  {
    id: 'H02_LUMBAR_MOVEMENT_CONCORDANT',
    title: '허리 움직임에서 익숙한 증상 재현 → 기계적 lumbar pattern 지지',
    input: scenario({ lumbarMovement: 'CONCORDANT_SYMPTOM_REPRODUCTION' }),
    review(output) {
      const hypothesis = byId(output, 'MECHANICAL_LUMBAR_CONTRIBUTION')
      assert.equal(hypothesis?.supportLevel, 'HIGHER_SUPPORT')
      assert.equal(output.primaryHypothesisId, 'MECHANICAL_LUMBAR_CONTRIBUTION')
      assert.equal(output.interpretationState, 'SINGLE_LEADING_PATTERN')
    },
  },
  {
    id: 'H03_RADICULAR_CUE_UNASSESSED',
    title: '하지증상 + 신경근성 단서, 검사는 미평가 → 고려 + unknown 명시',
    input: scenario({
      legSymptoms: 'PRESENT',
      radicularCue: 'PRESENT',
      objectiveNeuro: 'NOT_ASSESSED',
      neurodynamic: 'NOT_ASSESSED',
    }),
    review(output) {
      const hypothesis = byId(output, 'RADICULAR_INVOLVEMENT')
      assert.equal(hypothesis?.supportLevel, 'CONSIDER')
      assert.ok(hypothesis?.meaningfulUnknownsKo.some((text) => text.includes('신경학적')))
      assert.ok(hypothesis?.meaningfulUnknownsKo.some((text) => text.includes('신경가동성')))
      assert.equal(output.primaryHypothesisId, null)
    },
  },
  {
    id: 'H04_RADICULAR_CONCORDANT_NEURODYNAMIC',
    title: '하지증상 + 익숙한 neurodynamic 반응 → 지지 상승, 디스크 확정 금지',
    input: scenario({
      legSymptoms: 'PRESENT',
      radicularCue: 'PRESENT',
      objectiveNeuro: 'NORMAL',
      neurodynamic: 'CONCORDANT_LEG_SYMPTOM',
    }),
    review(output) {
      const hypothesis = byId(output, 'RADICULAR_INVOLVEMENT')
      assert.equal(hypothesis?.supportLevel, 'HIGHER_SUPPORT')
      assert.ok(hypothesis?.managementMeaningKo.some((text) => text.includes('확정하지 않습니다')))
      assert.ok(hypothesis?.contradictionsKo.some((text) => text.includes('객관적 신경학적 이상')))
    },
  },
  {
    id: 'H05_OBJECTIVE_NEURO_ABNORMAL',
    title: '객관적 neuro 이상 + 하지증상 → 신경근성 관여 지지 상승',
    input: scenario({
      legSymptoms: 'PRESENT',
      radicularCue: 'PRESENT',
      objectiveNeuro: 'ABNORMAL_NON_PROGRESSIVE',
      neurodynamic: 'NEGATIVE',
    }),
    review(output) {
      const hypothesis = byId(output, 'RADICULAR_INVOLVEMENT')
      assert.equal(hypothesis?.supportLevel, 'HIGHER_SUPPORT')
      assert.ok(hypothesis?.supportsKo.some((text) => text.includes('객관적')))
      assert.ok(hypothesis?.contradictionsKo.some((text) => text.includes('신경가동성')))
    },
  },
  {
    id: 'H06_WALKING_RELATED_PATTERN',
    title: '보행 제한 하지증상 → 보행 관련 neural pattern, 협착 확정 금지',
    input: scenario({
      legSymptoms: 'PRESENT',
      walkingStandingLegPattern: 'PRESENT',
      walkingTolerance: 'KNOWN',
      objectiveNeuro: 'NORMAL',
    }),
    review(output) {
      const hypothesis = byId(output, 'WALKING_RELATED_NEURAL_PATTERN')
      assert.equal(hypothesis?.supportLevel, 'HIGHER_SUPPORT')
      assert.ok(hypothesis?.managementMeaningKo.some((text) => text.includes('척추관 협착증')))
      assert.ok(hypothesis?.managementMeaningKo.some((text) => text.includes('확정')))
    },
  },
  {
    id: 'H07_HIP_CUE_NOT_YET_SCREENED',
    title: 'Hip 단서는 있으나 미평가 → 고려, 미확인 정보 표시',
    input: scenario({ hipContributionCue: 'PRESENT', hipScreen: 'NOT_ASSESSED' }),
    review(output) {
      const hypothesis = byId(output, 'HIP_CONTRIBUTION')
      assert.equal(hypothesis?.supportLevel, 'CONSIDER')
      assert.ok(hypothesis?.meaningfulUnknownsKo.length > 0)
    },
  },
  {
    id: 'H08_HIP_CONTRIBUTORY',
    title: 'Hip 단서 + 기여 선별 양성 → Hip 기여 지지 상승',
    input: scenario({ hipContributionCue: 'PRESENT', hipScreen: 'CONTRIBUTORY' }),
    review(output) {
      const hypothesis = byId(output, 'HIP_CONTRIBUTION')
      assert.equal(hypothesis?.supportLevel, 'HIGHER_SUPPORT')
      assert.equal(output.primaryHypothesisId, 'HIP_CONTRIBUTION')
    },
  },
  {
    id: 'H09_HIP_NONCONTRIBUTORY',
    title: 'Hip 단서 있었지만 선별 비기여 → 낮은 지지, 완전 배제 아님',
    input: scenario({ hipContributionCue: 'PRESENT', hipScreen: 'NON_CONTRIBUTORY' }),
    review(output) {
      const hypothesis = byId(output, 'HIP_CONTRIBUTION')
      assert.equal(hypothesis?.supportLevel, 'LOWER_SUPPORT')
      assert.ok(hypothesis?.contradictionsKo.length > 0)
      assert.equal(output.primaryHypothesisId, null)
    },
  },
  {
    id: 'H10_LUMBAR_PLUS_HIP',
    title: 'Lumbar + Hip 모두 지지 → 단일 진단으로 압축하지 않음',
    input: scenario({
      lumbarMovement: 'IMPROVES',
      hipContributionCue: 'PRESENT',
      hipScreen: 'CONTRIBUTORY',
    }),
    review(output) {
      assert.equal(byId(output, 'MECHANICAL_LUMBAR_CONTRIBUTION')?.supportLevel, 'HIGHER_SUPPORT')
      assert.equal(byId(output, 'HIP_CONTRIBUTION')?.supportLevel, 'HIGHER_SUPPORT')
      assert.equal(output.interpretationState, 'MULTIPLE_PLAUSIBLE_CONTRIBUTORS')
      assert.equal(output.primaryHypothesisId, null)
    },
  },
  {
    id: 'H11_RADICULAR_PLUS_HIP',
    title: 'Radicular + Hip 동시 지지 → 복합 기여 허용',
    input: scenario({
      legSymptoms: 'PRESENT',
      radicularCue: 'PRESENT',
      objectiveNeuro: 'ABNORMAL_NON_PROGRESSIVE',
      neurodynamic: 'CONCORDANT_LEG_SYMPTOM',
      hipContributionCue: 'PRESENT',
      hipScreen: 'CONTRIBUTORY',
    }),
    review(output) {
      assert.equal(byId(output, 'RADICULAR_INVOLVEMENT')?.supportLevel, 'HIGHER_SUPPORT')
      assert.equal(byId(output, 'HIP_CONTRIBUTION')?.supportLevel, 'HIGHER_SUPPORT')
      assert.equal(output.interpretationState, 'MULTIPLE_PLAUSIBLE_CONTRIBUTORS')
      assert.equal(output.primaryHypothesisId, null)
    },
  },
  {
    id: 'H12_CONTRADICTORY_FACTS',
    title: '하지증상 없음 + radicular/walking cue 모순 → 자신 있게 분류하지 않음',
    input: scenario({
      legSymptoms: 'ABSENT',
      radicularCue: 'PRESENT',
      walkingStandingLegPattern: 'PRESENT',
    }),
    review(output) {
      assert.ok(output.warningsKo.length > 0)
      assert.equal(output.primaryHypothesisId, null)
      assert.equal(output.interpretationState, 'INSUFFICIENTLY_EXPLAINED')
      assert.equal(byId(output, 'RADICULAR_INVOLVEMENT')?.supportLevel, 'INSUFFICIENT_DATA')
      assert.equal(byId(output, 'WALKING_RELATED_NEURAL_PATTERN')?.supportLevel, 'INSUFFICIENT_DATA')
    },
  },
  {
    id: 'H13_SAFETY_REVIEW_FIRST',
    title: '질환 안전성 review → routine hypothesis 억제',
    input: scenario({
      diseaseSafetyStatus: 'REVIEW_REQUIRED',
      lumbarMovement: 'CONCORDANT_SYMPTOM_REPRODUCTION',
      hipContributionCue: 'PRESENT',
      hipScreen: 'CONTRIBUTORY',
    }),
    review(output) {
      assert.equal(output.interpretationState, 'SAFETY_FIRST')
      assert.equal(output.hypotheses.length, 0)
      assert.equal(output.primaryHypothesisId, null)
    },
  },
  {
    id: 'H14_DETERIORATION_NEW_NEURO',
    title: '악화 + 새 신경증상 → hypothesis보다 safety refresh',
    input: scenario({
      visitKind: 'FOLLOW_UP',
      legSymptoms: 'PRESENT',
      radicularCue: 'PRESENT',
      followUp: {
        trajectory: 'DETERIORATING',
        exposure: 'ADEQUATE',
        newOrWorseningNeuroSymptom: 'YES',
      },
    }),
    review(output) {
      assert.equal(output.interpretationState, 'SAFETY_FIRST')
      assert.equal(output.safetyContext.routinePathway, 'SAFETY_REFRESH_FIRST')
      assert.equal(output.hypotheses.length, 0)
    },
  },
]

const snapshots = []
for (const testCase of cases) {
  const output = evaluateLbpWorkingHypothesisExperiment(testCase.input)
  common(output, testCase.id)
  testCase.review(output)

  snapshots.push({
    id: testCase.id,
    title: testCase.title,
    state: output.interpretationState,
    primary: output.primaryHypothesisId,
    hypotheses: output.hypotheses.map((hypothesis) => ({
      title: hypothesis.titleKo,
      level: hypothesis.supportLevel,
      support: hypothesis.supportsKo,
      contradiction: hypothesis.contradictionsKo,
      unknown: hypothesis.meaningfulUnknownsKo,
    })),
    warnings: output.warningsKo,
  })
}

console.log('\nLBP explainable working-hypothesis experimental snapshots')
for (const snapshot of snapshots) {
  console.log(`\n[${snapshot.id}] ${snapshot.title}`)
  console.log(`- state: ${snapshot.state}; primary: ${snapshot.primary ?? '없음'}`)
  if (!snapshot.hypotheses.length) console.log('- hypotheses: routine 가설 표시 없음')
  for (const hypothesis of snapshot.hypotheses) {
    console.log(`- ${hypothesis.title} [${hypothesis.level}]`)
    console.log(`  support: ${hypothesis.support.length ? hypothesis.support.join(' / ') : '없음'}`)
    console.log(`  contradiction: ${hypothesis.contradiction.length ? hypothesis.contradiction.join(' / ') : '없음'}`)
    console.log(`  unknown: ${hypothesis.unknown.length ? hypothesis.unknown.join(' / ') : '없음'}`)
  }
  if (snapshot.warnings.length) console.log(`- warnings: ${snapshot.warnings.join(' | ')}`)
}

console.log(`\nPASS: ${cases.length} explainable working-hypothesis guardrail vignettes`)
console.log('DRAFT ONLY: clinical hypothesis rows remain subject to clinician review before production use.')
