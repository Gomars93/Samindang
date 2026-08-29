/**
 * CRM v0.3.1 round 13: Korean label maps for the Doctor Today Queue UI.
 * Pure display strings only -- no clinical meaning, no thresholds, no
 * routing logic. Co-located with types.ts per the existing
 * followUpSession.ts label-map convention.
 */
import type { CrmTaskType, CrmReasonCode, CrmTaskStatus } from './types'

export const CRM_TASK_TYPE_LABEL: Record<CrmTaskType, string> = {
  SAFETY_REVIEW: '안전 검토',
  CLINICAL_REVIEW: '임상 검토',
  ROUTINE: '일반',
}

export const CRM_REASON_CODE_LABEL: Record<CrmReasonCode, string> = {
  MEDICATION_START_CHECK: '투약 시작 확인',
  MEDICATION_MID_CHECK: '투약 중간 확인',
  MEDICATION_END_CHECK: '투약 종료 확인',
  REASSESSMENT_DUE: '재평가 예정',
  CARE_GAP: '관리 공백',
  PATIENT_REPORTED_CONCERN: '환자 보고 우려사항',
  CLINICIAN_REVIEW_REQUEST: '임상의 검토 요청',
  SAFETY_REVIEW_REQUEST: '안전 검토 요청',
  REHAB_FOLLOWUP: '재활 후속',
  CONTACT_RETRY: '연락 재시도',
  SIGMA_LOOKUP_FAILURE: '시그마 조회 실패',
}

export const CRM_TASK_STATUS_LABEL: Record<CrmTaskStatus, string> = {
  OPEN: '대기',
  CLAIMED: '배정됨',
  IN_PROGRESS: '진행 중',
  DONE: '완료',
  SNOOZED: '보류',
  CANCELLED: '취소됨',
  SUPERSEDED: '대체됨',
}
