import assert from 'node:assert/strict'
import { evaluateLbpCareCoreExperimentV04 } from './.lbp-care-core-v04-bundle.mjs'
import { evaluateLbpPriorityPolicyBPlusExperiment } from './.lbp-priority-policy-bplus-bundle.mjs'

/*
 * B+ PRIMARY-CARE FLOW VIGNETTES — NOT CLINICAL VALIDATION.
 *
 * Purpose: verify that the approved experimental B+ presentation rule still
 * feels like the ORIGINAL Clinical OS product intent when placed back into the
 * whole current primary-care flow:
 *
 *   patient facts -> safety/care availability -> minimal checks now
 *   -> clinician choice only when needed -> unresolved later
 *   -> reassessment trigger
 *
 * This suite does NOT add or approve hypothesis, diagnosis, treatment efficacy,
 * rehabilitation mapping, numeric response thresholds, tablet changes, or
 * production UI. Those remain separate downstream milestones.
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

function decisionKeys(items) {
  return items.map((item) => item.decisionKey)
}

function hasHangul(text) {
  return /[가-힣]/.test(text)
}

function buildFlow(input) {
  const care = evaluateLbpCareCoreExperimentV04(input)
  const priority = evaluateLbpPriorityPolicyBPlusExperiment(input)

  // B+ is presentation priority only. Safety/care/reassessment remains owned by
  // Care Core so priority policy cannot silently become a new safety engine.
  const safetyFirst =
    care.state === 'SAFETY_REVIEW_FIRST' || care.state === 'SAFETY_REFRESH_FIRST'

  const choiceOptionIds = priority.clinicianChoiceGroups.flatMap((group) =>
    group.options.map((option) => option.check.id),
  )

  return {
    state: care.state,
    canProceedWithRoutineCare: care.canProceedWithRoutineCare,
    managementPlanReadyForConfirmation:
      care.canProceedWithRoutineCare &&
      priority.checksNow.length === 0 &&
      priority.clinicianChoiceGroups.length === 0,
    checksNow: safetyFirst ? [] : priority.checksNow,
    clinicianChoiceGroups: safetyFirst ? [] : priority.clinicianChoiceGroups,
    unresolvedLater: safetyFirst
      ? priority.allCandidateChecks
      : priority.deferredChecks,
    reassessment: care.reassessment,
    warningsKo: care.warningsKo,
    allCandidateIds: ids(priority.allCandidateChecks),
    representedCandidateIds: [
      ...ids(priority.checksNow),
      ...choiceOptionIds,
      ...ids(priority.deferredChecks),
    ],
  }
}

function commonAssertions(flow, label, { allowManualOverBudget = false } = {}) {
  if (flow.state === 'SAFETY_REVIEW_FIRST' || flow.state === 'SAFETY_REFRESH_FIRST') {
    assert.equal(flow.canProceedWithRoutineCare, false, `${label}: safety state leaked routine care`)
    assert.equal(flow.managementPlanReadyForConfirmation, false)
    assert.equal(flow.checksNow.length, 0)
    assert.equal(flow.clinicianChoiceGroups.length, 0)
  } else {
    assert.equal(flow.canProceedWithRoutineCare, true, `${label}: general uncertainty became a care gate`)
  }

  const automaticItems =
    flow.checksNow.filter((check) => !check.requestedByClinician && check.priority !== 'BLOCKING').length +
    flow.clinicianChoiceGroups.length
  if (!allowManualOverBudget) {
    assert.ok(automaticItems <= 3, `${label}: B+ exceeded automatic attention budget`)
  }

  for (const check of flow.checksNow) {
    assert.ok(hasHangul(check.titleKo), `${label}: current check is not Korean-first`)
    assert.ok(hasHangul(check.reasonKo), `${label}: current check lost patient-specific reason`)
  }
  for (const group of flow.clinicianChoiceGroups) {
    assert.ok(hasHangul(group.titleKo), `${label}: choice title is not Korean-first`)
    assert.ok(hasHangul(group.reasonKo), `${label}: choice reason missing`)
    assert.equal(group.addsPatientQuestion, false, `${label}: target tie created a new patient question`)
  }

  assert.deepEqual(
    new Set(flow.representedCandidateIds),
    new Set(flow.allCandidateIds),
    `${label}: candidate disappeared between now/choice/later`,
  )
}

const vignettes = [
  {
    id: 'B01_SIMPLE_AXIAL',
    title: '단순 축성 요통 — 목표동작/움직임 반응만 짧게 확인',
    input: scenario({
      lumbarMovement: 'NOT_ASSESSED',
      targetFunctionReproduction: 'NOT_ASSESSED',
    }),
    review(flow) {
      assert.deepEqual(
        new Set(decisionKeys(flow.checksNow)),
        new Set(['TARGET_FUNCTION_REPRODUCTION', 'LUMBAR_DIRECTIONAL_RESPONSE']),
      )
      assert.equal(flow.clinicianChoiceGroups.length, 0)
      assert.equal(flow.unresolvedLater.length, 0)
    },
  },
  {
    id: 'B02_RADICULAR_ONLY',
    title: '신경근성 단서 단독 — neuro baseline + neurodynamic, 과잉 확장 없음',
    input: scenario({ legSymptoms: 'PRESENT', radicularCue: 'PRESENT' }),
    review(flow) {
      assert.deepEqual(
        decisionKeys(flow.checksNow),
        ['OBJECTIVE_NEURO_BASELINE', 'NEURODYNAMIC_RESPONSE'],
      )
    },
  },
  {
    id: 'B03_WALKING_PATTERN',
    title: '보행/기립 하지증상 — neuro baseline + 실제 보행 허용량 추적',
    input: scenario({
      legSymptoms: 'PRESENT',
      walkingStandingLegPattern: 'PRESENT',
    }),
    review(flow) {
      assert.deepEqual(
        decisionKeys(flow.checksNow),
        ['OBJECTIVE_NEURO_BASELINE', 'WALKING_FUNCTION_BASELINE'],
      )
    },
  },
  {
    id: 'B04_RADICULAR_WALKING_HIP',
    title: '신경 + 보행 + Hip 단서 — 치료타깃이 neuro refinement보다 앞설 수 있음',
    input: scenario({
      legSymptoms: 'PRESENT',
      radicularCue: 'PRESENT',
      walkingStandingLegPattern: 'PRESENT',
      hipContributionCue: 'PRESENT',
    }),
    review(flow) {
      assert.deepEqual(
        decisionKeys(flow.checksNow),
        ['OBJECTIVE_NEURO_BASELINE', 'WALKING_FUNCTION_BASELINE', 'HIP_TREATMENT_TARGET'],
      )
      assert.deepEqual(decisionKeys(flow.unresolvedLater), ['NEURODYNAMIC_RESPONSE'])
    },
  },
  {
    id: 'B05_RADICULAR_WALKING_SIJ',
    title: '신경 + 보행 + SIJ 단서 — SIJ도 Hip과 동일한 지위에서 열림',
    input: scenario({
      legSymptoms: 'PRESENT',
      radicularCue: 'PRESENT',
      walkingStandingLegPattern: 'PRESENT',
      sijContributionCue: 'PRESENT',
    }),
    review(flow) {
      assert.deepEqual(
        decisionKeys(flow.checksNow),
        ['OBJECTIVE_NEURO_BASELINE', 'WALKING_FUNCTION_BASELINE', 'SIJ_TREATMENT_TARGET'],
      )
      assert.deepEqual(decisionKeys(flow.unresolvedLater), ['NEURODYNAMIC_RESPONSE'])
    },
  },
  {
    id: 'B06_ALL_CUES_ONE_SLOT_TIE',
    title: '모든 단서 + 한 자리 — Hip/SIJ를 코드가 고르지 않고 원장 선택',
    input: scenario({
      legSymptoms: 'PRESENT',
      radicularCue: 'PRESENT',
      walkingStandingLegPattern: 'PRESENT',
      hipContributionCue: 'PRESENT',
      sijContributionCue: 'PRESENT',
    }),
    review(flow) {
      assert.deepEqual(
        decisionKeys(flow.checksNow),
        ['OBJECTIVE_NEURO_BASELINE', 'WALKING_FUNCTION_BASELINE'],
      )
      assert.equal(flow.clinicianChoiceGroups.length, 1)
      const group = flow.clinicianChoiceGroups[0]
      assert.deepEqual(
        new Set(group.options.map((option) => option.decisionKey)),
        new Set(['HIP_TREATMENT_TARGET', 'SIJ_TREATMENT_TARGET']),
      )
      assert.deepEqual(decisionKeys(flow.unresolvedLater), ['NEURODYNAMIC_RESPONSE'])
    },
  },
  {
    id: 'B07_RADICULAR_HIP_SIJ_ROOM_FOR_BOTH',
    title: '보행 baseline이 필요 없는 복합환자 — Hip/SIJ 둘 다 볼 자리가 있으면 둘 다 제시',
    input: scenario({
      legSymptoms: 'PRESENT',
      radicularCue: 'PRESENT',
      hipContributionCue: 'PRESENT',
      sijContributionCue: 'PRESENT',
    }),
    review(flow) {
      assert.deepEqual(
        decisionKeys(flow.checksNow),
        ['OBJECTIVE_NEURO_BASELINE', 'HIP_TREATMENT_TARGET', 'SIJ_TREATMENT_TARGET'],
      )
      assert.deepEqual(decisionKeys(flow.unresolvedLater), ['NEURODYNAMIC_RESPONSE'])
      assert.equal(flow.clinicianChoiceGroups.length, 0)
    },
  },
  {
    id: 'B08_HIP_SIJ_ONLY',
    title: 'Hip + SIJ 단서만 — 둘을 상호배타적 진단트리로 만들지 않음',
    input: scenario({ hipContributionCue: 'PRESENT', sijContributionCue: 'PRESENT' }),
    review(flow) {
      assert.deepEqual(
        new Set(decisionKeys(flow.checksNow)),
        new Set(['HIP_TREATMENT_TARGET', 'SIJ_TREATMENT_TARGET']),
      )
      assert.equal(flow.clinicianChoiceGroups.length, 0)
    },
  },
  {
    id: 'B09_ADEQUATE_NON_RESPONSE_HIP',
    title: '충분한 치료 후 비반응 — 계획 재검토와 단서 있는 Hip 재개방',
    input: scenario({
      visitKind: 'FOLLOW_UP',
      hipContributionCue: 'PRESENT',
      followUp: {
        trajectory: 'NO_MEANINGFUL_CHANGE',
        exposure: 'ADEQUATE',
        newOrWorseningNeuroSymptom: 'NO',
      },
    }),
    review(flow) {
      assert.equal(flow.reassessment.currentPlanNeedsReview, true)
      assert.ok(decisionKeys(flow.checksNow).includes('HIP_TREATMENT_TARGET'))
    },
  },
  {
    id: 'B10_INSUFFICIENT_EXPOSURE',
    title: '치료노출 부족 — 실패로 오인해 미평가 branch를 자동 확장하지 않음',
    input: scenario({
      visitKind: 'FOLLOW_UP',
      followUp: {
        trajectory: 'NO_MEANINGFUL_CHANGE',
        exposure: 'INADEQUATE',
        newOrWorseningNeuroSymptom: 'NO',
      },
    }),
    review(flow) {
      assert.equal(flow.reassessment.currentPlanNeedsReview, false)
      assert.equal(flow.checksNow.length, 0)
      assert.equal(flow.clinicianChoiceGroups.length, 0)
    },
  },
  {
    id: 'B11_DETERIORATION_NEW_NEURO',
    title: '악화 + 새 신경증상 — B+보다 safety refresh가 우선',
    input: scenario({
      visitKind: 'FOLLOW_UP',
      legSymptoms: 'PRESENT',
      radicularCue: 'PRESENT',
      hipContributionCue: 'PRESENT',
      followUp: {
        trajectory: 'DETERIORATING',
        exposure: 'ADEQUATE',
        newOrWorseningNeuroSymptom: 'YES',
      },
    }),
    review(flow) {
      assert.equal(flow.state, 'SAFETY_REFRESH_FIRST')
      assert.equal(flow.canProceedWithRoutineCare, false)
      assert.equal(flow.checksNow.length, 0)
      assert.equal(flow.reassessment.currentPlanNeedsReview, true)
    },
  },
  {
    id: 'B12_DISEASE_SAFETY_REVIEW',
    title: '질환 안전성 검토 필요 — 치료타깃 후보보다 안전판단 우선',
    input: scenario({
      diseaseSafetyStatus: 'REVIEW_REQUIRED',
      hipContributionCue: 'PRESENT',
      sijContributionCue: 'PRESENT',
    }),
    review(flow) {
      assert.equal(flow.state, 'SAFETY_REVIEW_FIRST')
      assert.equal(flow.canProceedWithRoutineCare, false)
      assert.equal(flow.checksNow.length, 0)
    },
  },
  {
    id: 'B13_ATYPICAL_CONTRADICTORY',
    title: '모순 입력 — 억지로 정상화하지 않고 경고를 유지',
    input: scenario({
      legSymptoms: 'ABSENT',
      radicularCue: 'PRESENT',
      walkingStandingLegPattern: 'PRESENT',
    }),
    review(flow) {
      assert.ok(flow.warningsKo.length > 0)
      assert.equal(flow.canProceedWithRoutineCare, true)
    },
  },
  {
    id: 'B14_CLINICIAN_OVERRIDE',
    title: '원장 우려 — 자동 우선순위보다 직접 확인 의도가 우선',
    input: scenario({
      legSymptoms: 'PRESENT',
      radicularCue: 'PRESENT',
      walkingStandingLegPattern: 'PRESENT',
      hipContributionCue: 'PRESENT',
      sijContributionCue: 'PRESENT',
      clinicianConcernDomains: ['NEURO', 'HIP', 'SIJ'],
    }),
    allowManualOverBudget: true,
    review(flow) {
      const requestedCandidates = flow.checksNow.filter((item) => item.requestedByClinician)
      assert.ok(requestedCandidates.length >= 3)
      assert.ok(decisionKeys(requestedCandidates).includes('OBJECTIVE_NEURO_BASELINE'))
      assert.ok(decisionKeys(requestedCandidates).includes('HIP_TREATMENT_TARGET'))
      assert.ok(decisionKeys(requestedCandidates).includes('SIJ_TREATMENT_TARGET'))
    },
  },
]

const snapshots = []
for (const vignette of vignettes) {
  const flow = buildFlow(vignette.input)
  commonAssertions(flow, vignette.id, {
    allowManualOverBudget: vignette.allowManualOverBudget ?? false,
  })
  vignette.review(flow)

  snapshots.push({
    id: vignette.id,
    title: vignette.title,
    state: flow.state,
    canProceed: flow.canProceedWithRoutineCare,
    planReady: flow.managementPlanReadyForConfirmation,
    checksNow: flow.checksNow.map((item) => item.titleKo),
    choices: flow.clinicianChoiceGroups.map(
      (group) => `${group.titleKo}: ${group.options.map((option) => option.check.titleKo).join(' vs ')}`,
    ),
    unresolvedLater: flow.unresolvedLater.map((item) => item.titleKo),
    planReview: flow.reassessment.currentPlanNeedsReview
      ? flow.reassessment.reasonKo
      : '아니오',
    warnings: flow.warningsKo,
  })
}

console.log('\nLBP B+ — North-Star primary-care flow vignette snapshots')
for (const snapshot of snapshots) {
  console.log(`\n[${snapshot.id}] ${snapshot.title}`)
  console.log(`- state: ${snapshot.state}; routine-care: ${snapshot.canProceed}; plan-ready: ${snapshot.planReady}`)
  console.log(`- 지금 확인: ${snapshot.checksNow.length ? snapshot.checksNow.join(' / ') : '없음'}`)
  console.log(`- 원장 선택: ${snapshot.choices.length ? snapshot.choices.join(' / ') : '없음'}`)
  console.log(`- 나중에 다시 볼 것: ${snapshot.unresolvedLater.length ? snapshot.unresolvedLater.join(' / ') : '없음'}`)
  console.log(`- 계획 재검토: ${snapshot.planReview}`)
  if (snapshot.warnings.length) console.log(`- warnings: ${snapshot.warnings.join(' | ')}`)
}

console.log(`\nPASS: ${vignettes.length} B+ north-star flow vignettes`)
console.log('LOCK CANDIDATE: if clinical review accepts these snapshots, stop tuning exam priority and move to explainable working hypothesis.')
