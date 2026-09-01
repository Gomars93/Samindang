import assert from 'node:assert/strict'
import { evaluateLbpCareCoreExperimentV04 } from './.lbp-care-core-v04-bundle.mjs'

/*
 * OBSERVATIONAL CLINICAL VIGNETTES — NOT CLINICAL VALIDATION.
 *
 * These fixtures stress whether the reduced primary-care contract still behaves
 * like the intended Clinical OS experience. Assertions are limited to already
 * agreed product/safety invariants. They DO NOT approve a diagnosis, exam rule,
 * treatment, rehabilitation mapping, or numerical response threshold.
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

function hasHangul(text) {
  return /[가-힣]/.test(text)
}

function commonNorthStarAssertions(output, label, { allowClinicianOverrideOverBudget = false } = {}) {
  assert.equal(output.ruleStatus, 'DRAFT_EXPERIMENTAL', `${label}: production status leak`)
  assert.equal(output.contractVersion, 'LBP_CARE_CORE_V0_4')
  assert.equal(output.clinicianOverrideAvailable, true)
  assert.ok(!Object.hasOwn(output, 'diagnosis'), `${label}: reduced care core must not force a diagnosis field`)
  assert.ok(!Object.hasOwn(output, 'sufficiency'), `${label}: research sufficiency leaked into product contract`)
  assert.ok(!Object.hasOwn(output, 'scheduling'), `${label}: research tranche leaked into product contract`)

  if (!allowClinicianOverrideOverBudget) {
    assert.ok(output.checksNow.length <= 3, `${label}: automatic current checks exceeded the agreed cognitive budget`)
  }

  const nowIds = new Set(ids(output.checksNow))
  const laterIds = new Set(ids(output.unresolvedLater))
  for (const id of nowIds) {
    assert.ok(!laterIds.has(id), `${label}: the same unresolved item is both current and later`)
  }

  for (const check of output.checksNow) {
    assert.ok(check.titleKo.length > 0 && hasHangul(check.titleKo), `${label}: check title is not Korean-first`)
    assert.ok(check.reasonKo.length > 0 && hasHangul(check.reasonKo), `${label}: patient-specific/management reason is missing`)
  }
  for (const item of output.unresolvedLater) {
    assert.ok(item.titleKo.length > 0 && hasHangul(item.titleKo), `${label}: unresolved item title is not Korean-first`)
    assert.ok(item.reasonKo.length > 0, `${label}: unresolved item lost its reason`)
  }

  if (output.state === 'SAFETY_REVIEW_FIRST' || output.state === 'SAFETY_REFRESH_FIRST') {
    assert.equal(output.canProceedWithManagement, false, `${label}: safety state cannot be management-ready`)
  }
}

const vignettes = [
  {
    id: 'V01_SIMPLE_ACUTE_AXIAL',
    title: '단순 급성 축성 요통 — 추가확인은 짧아야 함',
    input: scenario({
      lumbarMovement: 'NOT_ASSESSED',
      targetFunctionReproduction: 'NOT_ASSESSED',
    }),
    review(output) {
      assert.ok(output.checksNow.length <= 2, 'simple axial case should stay very short')
      assert.equal(output.reassessment.currentPlanNeedsReview, false)
    },
  },
  {
    id: 'V02_RADICULAR_CUE',
    title: '하지 방사/저림 단서 — 신경 baseline을 놓치지 않되 진단문진 폭발 금지',
    input: scenario({
      legSymptoms: 'PRESENT',
      radicularCue: 'PRESENT',
      objectiveNeuro: 'NOT_ASSESSED',
      neurodynamic: 'NOT_ASSESSED',
    }),
    review(output) {
      assert.ok(ids(output.checksNow).includes('LBP_CHECK_OBJECTIVE_NEURO_BASELINE'))
      assert.ok(output.checksNow.length <= 3)
    },
  },
  {
    id: 'V03_WALKING_LIMITED_LEG_PATTERN',
    title: '보행/기립 연관 하지증상 — 보행기능을 outcome으로 잡고 협착 세부문진은 자동 확장하지 않음',
    input: scenario({
      legSymptoms: 'PRESENT',
      walkingStandingLegPattern: 'PRESENT',
      walkingTolerance: 'NOT_KNOWN',
      objectiveNeuro: 'NOT_ASSESSED',
    }),
    review(output) {
      assert.ok(ids(output.checksNow).includes('LBP_CHECK_WALKING_TOLERANCE'))
      assert.ok(ids(output.checksNow).includes('LBP_CHECK_OBJECTIVE_NEURO_BASELINE'))
    },
  },
  {
    id: 'V04_HIP_CAN_OPEN_EARLY',
    title: 'Hip 기여 단서 — lumbar 실패를 기다리지 않고 치료타깃 후보로 확인 가능',
    input: scenario({ hipContributionCue: 'PRESENT' }),
    review(output) {
      assert.ok(ids(output.checksNow).includes('LBP_CHECK_HIP_CONTRIBUTION'))
    },
  },
  {
    id: 'V05_SIJ_CAN_OPEN_EARLY',
    title: 'SIJ 기여 단서 — Hip 뒤에 직렬화하지 않음',
    input: scenario({ sijContributionCue: 'PRESENT' }),
    review(output) {
      assert.ok(ids(output.checksNow).includes('LBP_CHECK_SIJ_CONTRIBUTION'))
    },
  },
  {
    id: 'V06_LUMBAR_PLUS_HIP',
    title: 'Lumbar + Hip 복합 — 상호배타적 진단트리로 만들지 않음',
    input: scenario({
      lumbarMovement: 'NOT_ASSESSED',
      hipContributionCue: 'PRESENT',
    }),
    review(output) {
      assert.ok(ids(output.checksNow).includes('LBP_CHECK_HIP_CONTRIBUTION'))
      assert.ok(ids(output.checksNow).includes('LBP_CHECK_LUMBAR_MOVEMENT_RESPONSE'))
    },
  },
  {
    id: 'V07_ADEQUATE_NON_RESPONSE',
    title: '충분한 치료노출 후 비반응 — 현재 계획 재검토 + 단서 있는 미평가 영역 재개방',
    input: scenario({
      visitKind: 'FOLLOW_UP',
      hipContributionCue: 'PRESENT',
      followUp: {
        trajectory: 'NO_MEANINGFUL_CHANGE',
        exposure: 'ADEQUATE',
        newOrWorseningNeuroSymptom: 'NO',
      },
    }),
    review(output) {
      assert.equal(output.reassessment.currentPlanNeedsReview, true)
      assert.ok(ids(output.checksNow).includes('LBP_CHECK_HIP_CONTRIBUTION'))
    },
  },
  {
    id: 'V08_INSUFFICIENT_EXPOSURE',
    title: '치료노출 부족 — 치료실패로 오인해 감별을 무작정 깊게 하지 않음',
    input: scenario({
      visitKind: 'FOLLOW_UP',
      followUp: {
        trajectory: 'NO_MEANINGFUL_CHANGE',
        exposure: 'INADEQUATE',
        newOrWorseningNeuroSymptom: 'NO',
      },
    }),
    review(output) {
      assert.equal(output.reassessment.currentPlanNeedsReview, false)
      assert.ok(!ids(output.checksNow).includes('LBP_CHECK_HIP_CONTRIBUTION'))
      assert.ok(!ids(output.checksNow).includes('LBP_CHECK_SIJ_CONTRIBUTION'))
    },
  },
  {
    id: 'V09_DETERIORATION_NEW_NEURO',
    title: '악화 + 새로운 신경증상 — 일상 MSK 흐름보다 safety refresh 우선',
    input: scenario({
      visitKind: 'FOLLOW_UP',
      followUp: {
        trajectory: 'DETERIORATING',
        exposure: 'ADEQUATE',
        newOrWorseningNeuroSymptom: 'YES',
      },
    }),
    review(output) {
      assert.equal(output.state, 'SAFETY_REFRESH_FIRST')
      assert.equal(output.reassessment.currentPlanNeedsReview, true)
    },
  },
  {
    id: 'V10_ATYPICAL_CONTRADICTORY_FACTS',
    title: '모순/비정형 입력 — 억지 진단보다 경고와 임상의 판단 여지 보존',
    input: scenario({
      legSymptoms: 'ABSENT',
      radicularCue: 'PRESENT',
      walkingStandingLegPattern: 'PRESENT',
    }),
    review(output) {
      assert.ok(output.warningsKo.length > 0, 'contradictory facts should remain visible')
      assert.ok(!Object.hasOwn(output, 'diagnosis'))
    },
  },
  {
    id: 'V11_CLINICIAN_OVERRIDE',
    title: '자동 추천 밖 원장 우려 — 언제든 직접 해당 영역을 끌어올릴 수 있음',
    input: scenario({ clinicianConcernDomains: ['HIP'] }),
    allowClinicianOverrideOverBudget: true,
    review(output) {
      assert.ok(ids(output.checksNow).includes('LBP_CHECK_HIP_CONTRIBUTION'))
      assert.ok(output.checksNow.find((item) => item.id === 'LBP_CHECK_HIP_CONTRIBUTION')?.requestedByClinician)
    },
  },
  {
    id: 'V12_MULTI_CUE_COMPLEX',
    title: '복합 cue 환자 — 한 화면 3개 이하, 나머지는 삭제가 아니라 unresolved로 보존',
    input: scenario({
      legSymptoms: 'PRESENT',
      radicularCue: 'PRESENT',
      walkingStandingLegPattern: 'PRESENT',
      hipContributionCue: 'PRESENT',
      sijContributionCue: 'PRESENT',
    }),
    review(output) {
      assert.equal(output.checksNow.length, 3)
      assert.equal(output.unresolvedLater.length, 2)
      assert.deepEqual(
        new Set(ids(output.unresolvedLater)),
        new Set(['LBP_CHECK_HIP_CONTRIBUTION', 'LBP_CHECK_SIJ_CONTRIBUTION']),
      )
    },
  },
]

const snapshots = []
for (const vignette of vignettes) {
  const output = evaluateLbpCareCoreExperimentV04(vignette.input)
  commonNorthStarAssertions(output, vignette.id, {
    allowClinicianOverrideOverBudget: vignette.allowClinicianOverrideOverBudget ?? false,
  })
  vignette.review(output)

  snapshots.push({
    id: vignette.id,
    title: vignette.title,
    state: output.state,
    canProceedWithManagement: output.canProceedWithManagement,
    checksNow: output.checksNow.map((item) => item.titleKo),
    unresolvedLater: output.unresolvedLater.map((item) => `${item.titleKo} [${item.state}]`),
    actionTags: output.actionTags,
    reassessment: output.reassessment,
    warnings: output.warningsKo,
  })
}

console.log('\nLBP Care Core v0.4 — primary-care vignette observation snapshots')
for (const snapshot of snapshots) {
  console.log(`\n[${snapshot.id}] ${snapshot.title}`)
  console.log(`- state: ${snapshot.state}; management-ready: ${snapshot.canProceedWithManagement}`)
  console.log(`- 지금 확인: ${snapshot.checksNow.length > 0 ? snapshot.checksNow.join(' / ') : '없음'}`)
  console.log(`- 나중에 재검토 가능: ${snapshot.unresolvedLater.length > 0 ? snapshot.unresolvedLater.join(' / ') : '없음'}`)
  console.log(`- action tags: ${snapshot.actionTags.length > 0 ? snapshot.actionTags.join(', ') : '없음'}`)
  console.log(`- plan review: ${snapshot.reassessment.currentPlanNeedsReview ? snapshot.reassessment.reasonKo : '아니오'}`)
  if (snapshot.warnings.length > 0) console.log(`- warnings: ${snapshot.warnings.join(' | ')}`)
}

console.log(`\nPASS: ${vignettes.length} north-star primary-care vignettes (product/safety invariants only; NOT clinical validation)`)