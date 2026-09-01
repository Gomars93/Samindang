/**
 * Care Plan (round 3 Phase A) — the North Star's "Treatment → Care Plan /
 * Rehab" link. Every field here is clinician-entered free text; nothing is
 * auto-generated from patient answers or from SUGGESTED decision-support
 * items. Persisted as a sibling of PainFinalAssessment/HerbalFinalAssessment
 * inside WorkspaceState.
 */

export type PainCarePlan = {
  /** 현재 치료 목표. */
  currentTreatmentGoal: string
  /** 재활 목표. */
  rehabilitationGoal: string
  /** 집에서 할 행동/운동 계획 — 원장이 직접 기록, 자동 추천 없음. */
  homeActionPlan: string
  /** 주의/당분간 피할 활동. */
  activityPrecaution: string
  /** 환자에게 전달할 안내문. */
  patientInstruction: string
  /** 다음 방문에서 확인할 것. */
  nextVisitCheckItem: string
  recordedAt: string | null
}

export function emptyPainCarePlan(): PainCarePlan {
  return {
    currentTreatmentGoal: '',
    rehabilitationGoal: '',
    homeActionPlan: '',
    activityPrecaution: '',
    patientInstruction: '',
    nextVisitCheckItem: '',
    recordedAt: null,
  }
}

export type HerbalCarePlan = {
  /** 현재 관리 목표. */
  currentManagementGoal: string
  /** 처방/한약 계획 메모 — 자동 처방 생성 없음. */
  medicationPlanNote: string
  /** 집·생활 관리. */
  homeLifestyleManagement: string
  /** 관찰할 증상. */
  symptomsToObserve: string
  /** 이상반응/연락 안내. */
  adverseEffectContactInstruction: string
  /** 다음 방문에서 확인할 것. */
  nextVisitCheckItem: string
  recordedAt: string | null
}

export function emptyHerbalCarePlan(): HerbalCarePlan {
  return {
    currentManagementGoal: '',
    medicationPlanNote: '',
    homeLifestyleManagement: '',
    symptomsToObserve: '',
    adverseEffectContactInstruction: '',
    nextVisitCheckItem: '',
    recordedAt: null,
  }
}

export function isPainCarePlanRecorded(p: PainCarePlan): boolean {
  return p.recordedAt !== null
}

export function isHerbalCarePlanRecorded(p: HerbalCarePlan): boolean {
  return p.recordedAt !== null
}
