/*
 * EXPERIMENTAL / DRAFT ONLY — NOT PRODUCTION CLINICAL LOGIC.
 *
 * Purpose:
 * - stress-test the product architecture agreed for LBP Clinical OS;
 * - keep the current tablet questionnaire, FROZEN LBP safety logic/adapter,
 *   Doctor UI, CRM, and production suggestion engines untouched;
 * - make over-questioning, rule cascades, missing-vs-negative mistakes, and
 *   management-irrelevant checks visible before any clinical rule is approved.
 *
 * This module intentionally DOES NOT:
 * - read raw DoctorPayload / tablet responses directly;
 * - compute a diagnosis or final assessment;
 * - calculate response/non-response from numeric thresholds;
 * - choose a treatment or exercise;
 * - write CRM/EMR data;
 * - replace or modify src/spec/lbpLogic.ts or src/spec/lbpAdapter.ts.
 *
 * Every rule below is DRAFT_EXPERIMENTAL. The output may be used only by
 * fixtures/tests until the corresponding clinical rows are reviewed and
 * explicitly approved for production.
 */
import type { LbpSafetyStatus, TreatmentSafetyStatus } from '../../spec/lbpLogic'
import type { Provenance } from './provenance'

export type PresentState = 'PRESENT' | 'ABSENT' | 'UNCERTAIN'
export type YesNoUnknown = 'YES' | 'NO' | 'UNKNOWN'

/**
 * NOT_ASSESSED = no result exists.
 * NOT_PERFORMED = clinician explicitly chose not to perform it this visit.
 * LIMITED = attempted, but pain/cooperation/other limitation prevented a reliable result.
 * These must never collapse to NORMAL/NEGATIVE.
 */
export type ObjectiveNeuroStatus =
  | 'NOT_ASSESSED'
  | 'NOT_PERFORMED'
  | 'LIMITED'
  | 'NORMAL'
  | 'ABNORMAL_NON_PROGRESSIVE'
  | 'SEVERE_OR_PROGRESSIVE'
  | 'UNCLEAR'

export type NeurodynamicStatus =
  | 'NOT_ASSESSED'
  | 'NOT_PERFORMED'
  | 'LIMITED'
  | 'NEGATIVE'
  | 'CONCORDANT_LEG_SYMPTOM'
  | 'NON_CONCORDANT_BACK_OR_HAMSTRING'
  | 'UNCLEAR'

export type LumbarMovementStatus =
  | 'NOT_ASSESSED'
  | 'NOT_PERFORMED'
  | 'LIMITED'
  | 'NO_CLEAR_RESPONSE'
  | 'CONCORDANT_SYMPTOM_REPRODUCTION'
  | 'IMPROVES'
  | 'CENTRALIZES'
  | 'PERIPHERALIZES'
  | 'UNCLEAR'

export type TargetFunctionReproductionStatus =
  | 'NOT_ASSESSED'
  | 'NOT_PERFORMED'
  | 'LIMITED'
  | 'CONCORDANT_SYMPTOM_REPRODUCTION'
  | 'NO_MEANINGFUL_PROBLEM'
  | 'UNCLEAR'

export type ContributionScreenStatus =
  | 'NOT_ASSESSED'
  | 'NOT_PERFORMED'
  | 'LIMITED'
  | 'NON_CONTRIBUTORY'
  | 'CONTRIBUTORY'
  | 'UNCLEAR'

export type WalkingToleranceStatus = 'KNOWN' | 'NOT_KNOWN' | 'NOT_RELEVANT'

/** Reassessment interpretation is supplied; no numeric threshold is encoded. */
export type ReassessmentTrajectory =
  | 'NOT_DUE'
  | 'IMPROVING'
  | 'NO_MEANINGFUL_CHANGE'
  | 'DETERIORATING'
  | 'UNCERTAIN'

export type TreatmentExposure = 'ADEQUATE' | 'INADEQUATE' | 'UNKNOWN'
export type VisitKind = 'INITIAL' | 'REINITIAL' | 'FOLLOW_UP'

/**
 * Manual concern is a clinician-controlled escape hatch. It does not make a
 * diagnosis; it only allows a domain to be raised even when the experimental
 * automatic cue set did not select it.
 */
export type ClinicianConcernDomain =
  | 'NEURO'
  | 'HIP'
  | 'SIJ'
  | 'WALKING_TOLERANCE'
  | 'LUMBAR_MOVEMENT'

export interface LbpActionContext {
  visitKind: VisitKind
  diseaseSafetyStatus: LbpSafetyStatus
  treatmentSafetyStatus: TreatmentSafetyStatus

  /** Existing patient/derived fact. UNCERTAIN must never be treated as ABSENT. */
  legSymptoms: PresentState
  /** A cue that makes a nerve-root/neurodynamic check potentially actionable. */
  radicularCue: PresentState
  /** Walking/standing provokes leg symptoms and walking is functionally limited. */
  walkingStandingLegPattern: PresentState
  walkingTolerance: WalkingToleranceStatus

  /** Cues are shallow screens, not diagnoses. Hip and SIJ can coexist. */
  hipContributionCue: PresentState
  sijContributionCue: PresentState

  objectiveNeuro: ObjectiveNeuroStatus
  neurodynamic: NeurodynamicStatus
  lumbarMovement: LumbarMovementStatus
  targetFunctionAvailable: boolean
  targetFunctionReproduction: TargetFunctionReproductionStatus
  hipScreen: ContributionScreenStatus
  sijScreen: ContributionScreenStatus

  /** Optional so old synthetic fixtures remain valid while the experiment evolves. */
  clinicianConcernDomains?: ClinicianConcernDomain[]

  followUp: {
    trajectory: ReassessmentTrajectory
    exposure: TreatmentExposure
    newOrWorseningNeuroSymptom: YesNoUnknown
  }
}

export type ManagementImpact =
  | 'SAFETY'
  | 'TREATMENT_TARGET'
  | 'REHAB_SELECTION'
  | 'REASSESSMENT'
  | 'IMAGING_OR_REFERRAL'

export type CheckPriority = 'BLOCKING' | 'HIGH' | 'ROUTINE'

export type ActionCheckSourceFact = {
  key: string
  labelKo: string
  provenance: Provenance
}

export interface LbpActionCheck {
  id: string
  titleKo: string
  priority: CheckPriority
  ruleStatus: 'DRAFT_EXPERIMENTAL'
  reasonKo: string
  changesManagement: ManagementImpact[]
  sourceFacts: ActionCheckSourceFact[]
  help: {
    howKo: string
    whyKo: string
  }
}

export type LbpActionTag =
  | 'TRACK_TARGET_FUNCTION'
  | 'NEURO_FOLLOW_UP_REQUIRED'
  | 'TRACK_WALKING_TOLERANCE'
  | 'DIRECTIONAL_REHAB_CANDIDATE'
  | 'DISTAL_SYMPTOM_RESPONSE_REVIEW'
  | 'INCLUDE_HIP_AS_TREATMENT_TARGET'
  | 'INCLUDE_SIJ_AS_TREATMENT_TARGET'

export type RoutinePathwayState = 'AVAILABLE' | 'SAFETY_REVIEW_FIRST' | 'SAFETY_REFRESH_FIRST'

export interface LbpActionEngineOutput {
  ruleStatus: 'DRAFT_EXPERIMENTAL'
  routinePathway: RoutinePathwayState
  treatmentFinalizationRequiresClinicianReview: boolean
  clinicianOverrideAvailable: true
  checks: LbpActionCheck[]
  actionTags: LbpActionTag[]
  uncertaintyNotesKo: string[]
  reviewNotesKo: string[]
  invariantWarningsKo: string[]
  stopRule: {
    satisfied: boolean
    reasonKo: string
  }
}

const sourceFact = (key: string, labelKo: string, provenance: Provenance): ActionCheckSourceFact => ({
  key,
  labelKo,
  provenance,
})

const PRIORITY_ORDER: Record<CheckPriority, number> = {
  BLOCKING: 0,
  HIGH: 1,
  ROUTINE: 2,
}

function hasClinicianConcern(context: LbpActionContext, domain: ClinicianConcernDomain): boolean {
  return context.clinicianConcernDomains?.includes(domain) ?? false
}

function sortChecks(checks: LbpActionCheck[]): LbpActionCheck[] {
  return checks
    .map((item, index) => ({ item, index }))
    .sort((a, b) => PRIORITY_ORDER[a.item.priority] - PRIORITY_ORDER[b.item.priority] || a.index - b.index)
    .map(({ item }) => item)
}

function addUniqueCheck(target: LbpActionCheck[], next: LbpActionCheck): void {
  if (!target.some((item) => item.id === next.id)) target.push(next)
}

function isAdequateNonResponse(context: LbpActionContext): boolean {
  return context.followUp.trajectory === 'NO_MEANINGFUL_CHANGE' && context.followUp.exposure === 'ADEQUATE'
}

function buildLegSymptomClarificationCheck(): LbpActionCheck {
  return {
    id: 'LBP_CHECK_CLARIFY_LEG_SYMPTOM',
    titleKo: '하지증상 여부 짧게 확인',
    priority: 'HIGH',
    ruleStatus: 'DRAFT_EXPERIMENTAL',
    reasonKo: '하지증상 여부가 불명확하면 신경학적 검사·추적을 할지 자체가 달라질 수 있어, 바로 검사 묶음으로 넘어가기보다 먼저 짧게 확인합니다.',
    changesManagement: ['SAFETY', 'REASSESSMENT', 'REHAB_SELECTION', 'IMAGING_OR_REFERRAL'],
    sourceFacts: [sourceFact('legSymptoms', '하지증상 여부가 불명확함', 'PATIENT_FACT')],
    help: {
      howKo: '허리 외에 둔부·허벅지·종아리·발로 내려가는 통증, 저림, 감각 둔함, 힘 빠짐 느낌이 실제로 있는지만 짧게 다시 확인합니다.',
      whyKo: '불명확을 곧바로 신경학적 이상 또는 정상으로 해석하지 않고, 필요한 진찰 깊이를 결정하기 위한 최소 확인입니다.',
    },
  }
}

function buildDefineTargetFunctionCheck(): LbpActionCheck {
  return {
    id: 'LBP_CHECK_DEFINE_TARGET_FUNCTION',
    titleKo: '목표 기능 하나 정하기',
    priority: 'HIGH',
    ruleStatus: 'DRAFT_EXPERIMENTAL',
    reasonKo: '목표 기능이 없으면 오늘 치료 타깃과 다음 방문의 성공 기준을 같은 축으로 비교하기 어렵습니다.',
    changesManagement: ['TREATMENT_TARGET', 'REASSESSMENT'],
    sourceFacts: [sourceFact('targetFunctionAvailable', '목표 기능 기준점이 아직 없음', 'DERIVED')],
    help: {
      howKo: '환자가 가장 회복하고 싶은 실제 생활동작 하나를 선택합니다. 가능한 경우 0~10 수행능력과 연결합니다.',
      whyKo: '통증점수만으로 회복을 판단하지 않고 환자가 원하는 기능의 변화를 추적하기 위한 최소 기준점입니다.',
    },
  }
}

function buildObjectiveNeuroCheck(context: LbpActionContext, priority: CheckPriority): LbpActionCheck {
  const sourceFacts: ActionCheckSourceFact[] = []
  if (context.legSymptoms === 'PRESENT') {
    sourceFacts.push(sourceFact('legSymptoms', '하지 통증·저림/신경증상이 보고됨', 'PATIENT_FACT'))
  }
  if (context.radicularCue === 'PRESENT') {
    sourceFacts.push(sourceFact('radicularCue', '신경근성 관여를 시사하는 하지증상 단서', 'PATIENT_FACT'))
  }
  if (context.walkingStandingLegPattern === 'PRESENT') {
    sourceFacts.push(sourceFact('walkingStandingLegPattern', '서기·걷기와 연관된 하지증상/기능제한', 'PATIENT_FACT'))
  }
  if (context.followUp.newOrWorseningNeuroSymptom !== 'NO') {
    sourceFacts.push(sourceFact('newOrWorseningNeuroSymptom', '새롭거나 악화된 신경증상 여부 확인 필요', 'PATIENT_FACT'))
  }
  if (hasClinicianConcern(context, 'NEURO')) {
    sourceFacts.push(sourceFact('clinicianConcernDomains', '원장이 신경학적 확인을 직접 요청함', 'OBSERVED'))
  }

  return {
    id: 'LBP_CHECK_OBJECTIVE_NEURO_BASELINE',
    titleKo: '하지 신경학적 기본검사',
    priority,
    ruleStatus: 'DRAFT_EXPERIMENTAL',
    reasonKo: '객관적 신경학적 이상 여부에 따라 안전 확인, 추적 기준, 운동 중단 기준과 추가 평가 판단이 달라질 수 있습니다.',
    changesManagement: ['SAFETY', 'REASSESSMENT', 'REHAB_SELECTION', 'IMAGING_OR_REFERRAL'],
    sourceFacts,
    help: {
      howKo: '하지의 근력·감각·반사를 빠르게 확인합니다. 이상이 있을 때만 필요한 세부 항목을 확장 기록하는 방식을 전제로 합니다.',
      whyKo: '환자가 느끼는 저림·힘 빠짐과 객관적인 신경학적 이상을 구분하기 위한 확인입니다.',
    },
  }
}

function buildNeurodynamicCheck(): LbpActionCheck {
  return {
    id: 'LBP_CHECK_NEURODYNAMIC',
    titleKo: '하지직거상 또는 슬럼프검사',
    priority: 'ROUTINE',
    ruleStatus: 'DRAFT_EXPERIMENTAL',
    reasonKo: '익숙한 하지증상의 신경긴장 반응이 확인되면 재활 선택과 증상 악화 기준을 더 구체적으로 정할 수 있습니다.',
    changesManagement: ['REHAB_SELECTION', 'REASSESSMENT'],
    sourceFacts: [sourceFact('radicularCue', '신경근성 관여를 시사하는 하지증상 단서', 'PATIENT_FACT')],
    help: {
      howKo: '하지직거상 또는 슬럼프 동작에서 환자가 평소 느끼는 하지 통증·저림이 재현되는지 봅니다. 단순 햄스트링 당김과 익숙한 하지증상을 구분합니다.',
      whyKo: '검사 각도 자체보다 평소 하지증상과 일치하는 반응인지가 현재 재활·추적 계획에 더 중요합니다.',
    },
  }
}

function buildWalkingToleranceCheck(context: LbpActionContext): LbpActionCheck {
  const sourceFacts: ActionCheckSourceFact[] = []
  if (context.walkingStandingLegPattern === 'PRESENT') {
    sourceFacts.push(sourceFact('walkingStandingLegPattern', '서기·걷기에서 하지증상 또는 기능제한이 두드러짐', 'PATIENT_FACT'))
  }
  if (hasClinicianConcern(context, 'WALKING_TOLERANCE')) {
    sourceFacts.push(sourceFact('clinicianConcernDomains', '원장이 보행 허용량 확인을 직접 요청함', 'OBSERVED'))
  }
  return {
    id: 'LBP_CHECK_WALKING_TOLERANCE',
    titleKo: '실제 보행 가능시간·거리 확인',
    priority: 'HIGH',
    ruleStatus: 'DRAFT_EXPERIMENTAL',
    reasonKo: '보행 제한이 주된 기능문제라면 통증점수보다 보행 허용량을 핵심 재평가 지표로 두는 것이 진료계획을 바꿉니다.',
    changesManagement: ['REASSESSMENT', 'REHAB_SELECTION'],
    sourceFacts,
    help: {
      howKo: '환자가 현재 증상 때문에 쉬어야 하기 전까지 실제로 걸을 수 있는 시간이나 거리를 짧게 확인합니다.',
      whyKo: '향후 호전 여부를 같은 기능지표로 비교하고 걷기·활동량 회복 계획을 조절하기 위해 확인합니다.',
    },
  }
}

function buildTargetFunctionCheck(): LbpActionCheck {
  return {
    id: 'LBP_CHECK_TARGET_FUNCTION_REPRODUCTION',
    titleKo: '목표 동작 재현',
    priority: 'ROUTINE',
    ruleStatus: 'DRAFT_EXPERIMENTAL',
    reasonKo: '환자가 가장 회복하고 싶은 동작을 실제로 확인하면 오늘 치료 타깃과 다음 재평가 기준을 같은 동작으로 연결할 수 있습니다.',
    changesManagement: ['TREATMENT_TARGET', 'REASSESSMENT'],
    sourceFacts: [sourceFact('targetFunctionAvailable', '태블릿에서 목표 기능이 확보됨', 'PATIENT_FACT')],
    help: {
      howKo: '환자가 선택한 목표 동작을 안전한 범위에서 직접 수행하게 하고 평소 증상·기능제한이 재현되는지 확인합니다.',
      whyKo: '통증점수만이 아니라 실제 생활기능의 전후 변화를 비교하기 위한 기준점입니다.',
    },
  }
}

function buildLumbarMovementCheck(context: LbpActionContext): LbpActionCheck {
  const sourceFacts = [sourceFact('lumbarMovement', '허리 움직임에 따른 증상반응이 아직 미평가', 'DERIVED')]
  if (hasClinicianConcern(context, 'LUMBAR_MOVEMENT')) {
    sourceFacts.push(sourceFact('clinicianConcernDomains', '원장이 허리 움직임 반응 확인을 직접 요청함', 'OBSERVED'))
  }
  return {
    id: 'LBP_CHECK_LUMBAR_MOVEMENT_RESPONSE',
    titleKo: '허리 움직임에 따른 증상반응',
    priority: 'ROUTINE',
    ruleStatus: 'DRAFT_EXPERIMENTAL',
    reasonKo: '특정 방향의 일관된 증상 증가·감소가 확인되면 운동 방향과 치료 후 다시 볼 동작이 달라질 수 있습니다.',
    changesManagement: ['REHAB_SELECTION', 'REASSESSMENT'],
    sourceFacts,
    help: {
      howKo: '서서 허리를 굽히고, 뒤로 젖히고, 좌우로 기울이며 평소 증상의 재현·감소를 봅니다. 하지증상이 있다면 몸쪽으로 줄거나 더 아래로 퍼지는지도 관찰합니다.',
      whyKo: '모든 방향의 각도를 기록하기 위한 검사가 아니라, 실제 운동·재평가 방향을 바꿀 만한 증상반응이 있는지 확인하기 위한 검사입니다.',
    },
  }
}

function buildHipCheck(context: LbpActionContext, priority: CheckPriority): LbpActionCheck {
  const sourceFacts: ActionCheckSourceFact[] = []
  if (context.hipContributionCue === 'PRESENT') {
    sourceFacts.push(sourceFact('hipContributionCue', '서혜부/앞쪽 허벅지/고관절 기능 관련 단서가 있음', 'PATIENT_FACT'))
  }
  if (hasClinicianConcern(context, 'HIP')) {
    sourceFacts.push(sourceFact('clinicianConcernDomains', '원장이 고관절 기여 확인을 직접 요청함', 'OBSERVED'))
  }
  return {
    id: 'LBP_CHECK_HIP_CONTRIBUTION',
    titleKo: '고관절 빠른 선별',
    priority,
    ruleStatus: 'DRAFT_EXPERIMENTAL',
    reasonKo: '고관절 기여가 확인되면 허리만 치료하는 대신 고관절을 치료·재활 타깃에 포함할 수 있어 실제 관리전략이 달라집니다.',
    changesManagement: ['TREATMENT_TARGET', 'REHAB_SELECTION'],
    sourceFacts,
    help: {
      howKo: '고관절 굽힘과 안쪽돌림을 중심으로 빠르게 움직임을 비교하고, 익숙한 증상 재현이나 뚜렷한 제한이 있을 때만 필요한 상세검사를 확장합니다.',
      whyKo: '허리와 고관절이 함께 기여하는 환자에서 실제 치료 타깃을 놓치지 않기 위한 선별입니다.',
    },
  }
}

function buildSijCheck(context: LbpActionContext, priority: CheckPriority): LbpActionCheck {
  const sourceFacts: ActionCheckSourceFact[] = []
  if (context.sijContributionCue === 'PRESENT') {
    sourceFacts.push(sourceFact('sijContributionCue', '편측 둔부/PSIS 주변 및 부하 동작 관련 단서가 있음', 'PATIENT_FACT'))
  }
  if (hasClinicianConcern(context, 'SIJ')) {
    sourceFacts.push(sourceFact('clinicianConcernDomains', '원장이 천장관절 기여 확인을 직접 요청함', 'OBSERVED'))
  }
  return {
    id: 'LBP_CHECK_SIJ_CONTRIBUTION',
    titleKo: '천장관절 기여 확인',
    priority,
    ruleStatus: 'DRAFT_EXPERIMENTAL',
    reasonKo: '현재 증상과 기능에 천장관절 기여가 의미 있게 확인되면 치료·재활 타깃이 달라질 수 있습니다.',
    changesManagement: ['TREATMENT_TARGET', 'REHAB_SELECTION'],
    sourceFacts,
    help: {
      howKo: '허리·고관절 소견과 함께 비교하면서 필요한 경우 여러 통증유발검사의 일관된 익숙한 증상 재현 여부를 확인합니다.',
      whyKo: '단일 FABER/Patrick 결과로 진단하기 위한 것이 아니라, 천장관절을 실제 치료 타깃에 포함할지 판단하기 위한 확인입니다.',
    },
  }
}

function collectActionTags(context: LbpActionContext): LbpActionTag[] {
  const tags: LbpActionTag[] = []
  if (context.targetFunctionReproduction === 'CONCORDANT_SYMPTOM_REPRODUCTION') tags.push('TRACK_TARGET_FUNCTION')
  if (context.objectiveNeuro === 'ABNORMAL_NON_PROGRESSIVE') tags.push('NEURO_FOLLOW_UP_REQUIRED')
  if (context.walkingStandingLegPattern === 'PRESENT' && context.walkingTolerance === 'KNOWN') tags.push('TRACK_WALKING_TOLERANCE')
  if (context.lumbarMovement === 'IMPROVES' || context.lumbarMovement === 'CENTRALIZES') tags.push('DIRECTIONAL_REHAB_CANDIDATE')
  if (context.lumbarMovement === 'PERIPHERALIZES') tags.push('DISTAL_SYMPTOM_RESPONSE_REVIEW')
  if (context.hipScreen === 'CONTRIBUTORY') tags.push('INCLUDE_HIP_AS_TREATMENT_TARGET')
  if (context.sijScreen === 'CONTRIBUTORY') tags.push('INCLUDE_SIJ_AS_TREATMENT_TARGET')
  return tags
}

function collectUncertaintyNotes(context: LbpActionContext): string[] {
  const notes: string[] = []
  if (context.legSymptoms === 'UNCERTAIN') notes.push('하지증상 여부가 불명확합니다. 불명확을 "없음"으로 처리하지 않습니다.')
  if (context.objectiveNeuro === 'UNCLEAR') notes.push('신경학적 기본검사 결과가 불명확합니다. 정상으로 간주하지 않습니다.')
  if (context.objectiveNeuro === 'NOT_PERFORMED') notes.push('신경학적 기본검사를 의료진이 시행하지 않음으로 기록했습니다. 정상 소견으로 바꾸지 않고 같은 방문에서 자동 재추천하지 않습니다.')
  if (context.objectiveNeuro === 'LIMITED') notes.push('신경학적 기본검사를 시도했으나 평가가 제한되었습니다. 정상으로 간주하거나 대체검사를 자동 연쇄하지 않습니다.')
  if (context.neurodynamic === 'UNCLEAR') notes.push('신경긴장검사 결과가 불명확합니다. 추가 검사를 자동 연쇄하지 않고 현재 관리전략에 필요한지 다시 판단합니다.')
  if (context.neurodynamic === 'NOT_PERFORMED') notes.push('신경긴장검사를 시행하지 않음으로 기록했습니다. 음성으로 바꾸지 않고 같은 방문에서 자동 재추천하지 않습니다.')
  if (context.neurodynamic === 'LIMITED') notes.push('신경긴장검사를 시도했으나 평가가 제한되었습니다. 음성으로 간주하지 않습니다.')
  if (context.lumbarMovement === 'UNCLEAR') notes.push('허리 움직임 반응이 불명확합니다. 방향성 운동을 자동 확정하지 않습니다.')
  if (context.lumbarMovement === 'NOT_PERFORMED') notes.push('허리 움직임 검사를 시행하지 않음으로 기록했습니다. 정상으로 바꾸지 않고 같은 방문에서 자동 재추천하지 않습니다.')
  if (context.lumbarMovement === 'LIMITED') notes.push('허리 움직임 검사를 시도했으나 평가가 제한되었습니다. 정상 반응으로 간주하지 않습니다.')
  if (context.targetFunctionReproduction === 'UNCLEAR') notes.push('목표 동작 재현 결과가 불명확합니다. 기능 기준점을 임의로 정상 처리하지 않습니다.')
  if (context.targetFunctionReproduction === 'NOT_PERFORMED') notes.push('목표 동작 재현을 시행하지 않음으로 기록했습니다. 문제 없음으로 바꾸지 않습니다.')
  if (context.targetFunctionReproduction === 'LIMITED') notes.push('목표 동작 재현이 제한되어 신뢰할 만한 결과를 얻지 못했습니다. 문제 없음으로 간주하지 않습니다.')
  if (context.hipScreen === 'UNCLEAR') notes.push('고관절 선별 결과가 불명확합니다. 고관절 기여를 긍정/부정으로 확정하지 않습니다.')
  if (context.hipScreen === 'NOT_PERFORMED') notes.push('고관절 선별을 시행하지 않음으로 기록했습니다. 비기여로 바꾸지 않습니다.')
  if (context.hipScreen === 'LIMITED') notes.push('고관절 선별이 제한되었습니다. 비기여로 간주하지 않습니다.')
  if (context.sijScreen === 'UNCLEAR') notes.push('천장관절 확인 결과가 불명확합니다. 천장관절 기여를 긍정/부정으로 확정하지 않습니다.')
  if (context.sijScreen === 'NOT_PERFORMED') notes.push('천장관절 확인을 시행하지 않음으로 기록했습니다. 비기여로 바꾸지 않습니다.')
  if (context.sijScreen === 'LIMITED') notes.push('천장관절 확인이 제한되었습니다. 비기여로 간주하지 않습니다.')
  return notes
}

/** Pure experiment engine. There is deliberately no DoctorPayload adapter. */
export function evaluateLbpActionAdaptiveExperiment(context: LbpActionContext): LbpActionEngineOutput {
  const checks: LbpActionCheck[] = []
  const reviewNotesKo: string[] = []
  const invariantWarningsKo: string[] = []
  const uncertaintyNotesKo = collectUncertaintyNotes(context)
  const treatmentFinalizationRequiresClinicianReview = context.treatmentSafetyStatus !== 'CLEAR'

  if (context.objectiveNeuro === 'SEVERE_OR_PROGRESSIVE' && context.diseaseSafetyStatus === 'CLEAR') {
    invariantWarningsKo.push('객관적 중증/진행성 근력저하가 입력됐는데 질환 안전상태가 CLEAR입니다. 기존 FROZEN safety 계산/입력 연결을 우선 확인해야 합니다.')
  }

  if (context.diseaseSafetyStatus !== 'CLEAR' || invariantWarningsKo.length > 0) {
    return {
      ruleStatus: 'DRAFT_EXPERIMENTAL',
      routinePathway: 'SAFETY_REVIEW_FIRST',
      treatmentFinalizationRequiresClinicianReview,
      clinicianOverrideAvailable: true,
      checks: [],
      actionTags: [],
      uncertaintyNotesKo,
      reviewNotesKo: ['기존 LBP 질환 안전상태가 CLEAR가 아니므로 routine MSK 추가검사·운동 추천보다 의료진 안전 확인이 우선입니다.'],
      invariantWarningsKo,
      stopRule: {
        satisfied: true,
        reasonKo: '안전 확인이 먼저이므로 routine 임상질문을 더 생성하지 않습니다.',
      },
    }
  }

  if (context.followUp.trajectory === 'DETERIORATING' || context.followUp.newOrWorseningNeuroSymptom === 'YES') {
    if (context.legSymptoms === 'PRESENT' && (context.objectiveNeuro === 'NOT_ASSESSED' || context.objectiveNeuro === 'UNCLEAR')) {
      addUniqueCheck(checks, buildObjectiveNeuroCheck(context, 'BLOCKING'))
    }
    return {
      ruleStatus: 'DRAFT_EXPERIMENTAL',
      routinePathway: 'SAFETY_REFRESH_FIRST',
      treatmentFinalizationRequiresClinicianReview,
      clinicianOverrideAvailable: true,
      checks: sortChecks(checks),
      actionTags: [],
      uncertaintyNotesKo,
      reviewNotesKo: ['악화 또는 새로운 신경증상 이벤트가 있어 기존 가설을 확장하기 전에 Safety/Neuro를 먼저 다시 확인합니다.'],
      invariantWarningsKo,
      stopRule: {
        satisfied: true,
        reasonKo: 'Safety/Neuro 재확인 전에는 Hip/SIJ/세부 진단 질문을 연쇄 생성하지 않습니다.',
      },
    }
  }

  const adequateNonResponse = isAdequateNonResponse(context)
  const insufficientExposure = context.followUp.trajectory === 'NO_MEANINGFUL_CHANGE' && context.followUp.exposure === 'INADEQUATE'

  if (insufficientExposure) {
    reviewNotesKo.push('의미 있는 변화가 적더라도 치료/운동 노출이 부족하므로 원인 감별 질문을 자동 확대하지 않습니다.')
  } else if (adequateNonResponse) {
    reviewNotesKo.push('충분한 노출 뒤에도 의미 있는 변화가 적어 현재 가설의 설명력을 재검토합니다. 다만 기존 단서가 있는 미평가 영역만 우선합니다.')
  }

  const legClarificationNeeded =
    context.legSymptoms === 'UNCERTAIN' &&
    context.radicularCue !== 'PRESENT' &&
    context.walkingStandingLegPattern !== 'PRESENT' &&
    !hasClinicianConcern(context, 'NEURO')
  if (legClarificationNeeded) addUniqueCheck(checks, buildLegSymptomClarificationCheck())

  const neuroRelevant =
    context.legSymptoms === 'PRESENT' ||
    context.radicularCue === 'PRESENT' ||
    context.walkingStandingLegPattern === 'PRESENT' ||
    hasClinicianConcern(context, 'NEURO')
  if (neuroRelevant && (context.objectiveNeuro === 'NOT_ASSESSED' || context.objectiveNeuro === 'UNCLEAR')) {
    addUniqueCheck(checks, buildObjectiveNeuroCheck(context, hasClinicianConcern(context, 'NEURO') ? 'HIGH' : 'HIGH'))
  }

  const walkingRelevant = context.walkingStandingLegPattern === 'PRESENT' || hasClinicianConcern(context, 'WALKING_TOLERANCE')
  if (walkingRelevant && context.walkingTolerance === 'NOT_KNOWN') {
    addUniqueCheck(checks, buildWalkingToleranceCheck(context))
  }

  if (context.radicularCue === 'PRESENT' && context.neurodynamic === 'NOT_ASSESSED') {
    addUniqueCheck(checks, buildNeurodynamicCheck())
  }

  if (!context.targetFunctionAvailable) {
    addUniqueCheck(checks, buildDefineTargetFunctionCheck())
  } else if (context.targetFunctionReproduction === 'NOT_ASSESSED') {
    addUniqueCheck(checks, buildTargetFunctionCheck())
  }

  if (context.lumbarMovement === 'NOT_ASSESSED' || (hasClinicianConcern(context, 'LUMBAR_MOVEMENT') && context.lumbarMovement === 'UNCLEAR')) {
    addUniqueCheck(checks, buildLumbarMovementCheck(context))
  }

  const hipRelevant = context.hipContributionCue === 'PRESENT' || hasClinicianConcern(context, 'HIP')
  if (hipRelevant && context.hipScreen === 'NOT_ASSESSED') {
    addUniqueCheck(checks, buildHipCheck(context, adequateNonResponse || hasClinicianConcern(context, 'HIP') ? 'HIGH' : 'ROUTINE'))
  }

  const sijRelevant = context.sijContributionCue === 'PRESENT' || hasClinicianConcern(context, 'SIJ')
  if (sijRelevant && context.sijScreen === 'NOT_ASSESSED') {
    addUniqueCheck(checks, buildSijCheck(context, adequateNonResponse || hasClinicianConcern(context, 'SIJ') ? 'HIGH' : 'ROUTINE'))
  }

  if (adequateNonResponse && !hipRelevant && !sijRelevant) {
    reviewNotesKo.push('비반응만을 이유로 Hip/SIJ 등 모든 미평가 영역을 자동으로 열지 않습니다. 현재 데이터에 단서가 없으면 원장이 다른 원인 검토를 선택할 수 있게 둡니다.')
  }

  const sortedChecks = sortChecks(checks)
  const stopSatisfied = sortedChecks.length === 0

  return {
    ruleStatus: 'DRAFT_EXPERIMENTAL',
    routinePathway: 'AVAILABLE',
    treatmentFinalizationRequiresClinicianReview,
    clinicianOverrideAvailable: true,
    checks: sortedChecks,
    actionTags: collectActionTags(context),
    uncertaintyNotesKo,
    reviewNotesKo,
    invariantWarningsKo,
    stopRule: {
      satisfied: stopSatisfied,
      reasonKo: stopSatisfied
        ? '현재 안전·치료 타깃·운동·재평가·영상/의뢰를 바꿀 미확인 항목이 없어 추가 확인을 생성하지 않습니다.'
        : '현재 관리전략을 바꿀 수 있는 미확인 항목만 제안합니다. 제안 결과로 관리전략이 충분히 정해지면 더 깊은 진단 질문을 생성하지 않습니다.',
    },
  }
}
