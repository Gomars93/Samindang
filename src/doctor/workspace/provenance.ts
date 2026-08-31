/**
 * Doctor Clinical Workspace — provenance data model (PR #24 Phase 1).
 *
 * Pure types + tiny helpers, no React, no clinical content. This file exists
 * to make it structurally impossible to accidentally present a system
 * recommendation as a confirmed fact, or a clinician's not-yet-performed
 * exam as a negative finding. Every piece of information the workspace
 * renders must be tagged with exactly one of these origins.
 *
 * This module invents NO clinical thresholds, diagnoses, or interpretation
 * rules. It only defines *where information came from*, never *what it
 * means clinically*.
 */

/**
 * Where a single piece of displayed information originated.
 *
 * - PATIENT_FACT: reported directly by the patient on the tablet questionnaire.
 * - DERIVED: calculated by already-approved, already-CLOSED existing code
 *   (coreSpec.ts / *Logic.ts / *Adapter.ts computed flags, saju calculation).
 * - SUGGESTED: a decision-support recommendation (e.g. "consider checking
 *   SLR") — never a confirmed fact, never a diagnosis, never something the
 *   clinician did.
 * - OBSERVED: entered by the clinician during examination (exam result,
 *   tongue/pulse/abdomen finding).
 * - FINAL_ASSESSMENT: the clinician's own confirmed clinical judgment.
 * - PLAN: the clinician's treatment/management plan.
 * - FOLLOW_UP_TARGET: an item the clinician nominates to reassess later.
 */
export type Provenance =
  | 'PATIENT_FACT'
  | 'DERIVED'
  | 'SUGGESTED'
  | 'OBSERVED'
  | 'FINAL_ASSESSMENT'
  | 'PLAN'
  | 'FOLLOW_UP_TARGET'

export const PROVENANCE_LABEL: Record<Provenance, string> = {
  PATIENT_FACT: '환자 응답',
  DERIVED: '시스템 계산',
  SUGGESTED: '결정지원 제안',
  OBSERVED: '원장 진찰 소견',
  FINAL_ASSESSMENT: '원장 최종 판단',
  PLAN: '치료 계획',
  FOLLOW_UP_TARGET: '재평가 대상',
}

/**
 * Short badge text for compact UI (chips, small labels). Kept separate from
 * PROVENANCE_LABEL so the full label can stay descriptive while the badge
 * stays short enough not to dominate a card.
 */
export const PROVENANCE_BADGE: Record<Provenance, string> = {
  PATIENT_FACT: '환자',
  DERIVED: '계산',
  SUGGESTED: '제안',
  OBSERVED: '진찰',
  FINAL_ASSESSMENT: '원장 최종',
  PLAN: '계획',
  FOLLOW_UP_TARGET: '재평가',
}

/**
 * Generic wrapper attaching provenance to any displayed value. Use this
 * instead of a bare value whenever a UI needs to render *and visually
 * distinguish* where a fact came from.
 */
export type ProvenanceFact<T> = {
  provenance: Provenance
  value: T
  /** Optional human-readable pointer to the exact source (question id, computed-field name, exam name). */
  sourceLabel?: string
}

export function fact<T>(provenance: Provenance, value: T, sourceLabel?: string): ProvenanceFact<T> {
  return { provenance, value, sourceLabel }
}

/**
 * Tri-state (plus "not asked") for anything the patient could have reported.
 * NONE and UNKNOWN are both real patient answers and must render differently
 * from a question that was never shown/asked. Collapsing any two of these
 * three is the exact bug class this type exists to prevent.
 */
export type PatientResponseState = 'REPORTED_YES' | 'REPORTED_NONE' | 'REPORTED_UNKNOWN' | 'NOT_ASKED'

export const PATIENT_RESPONSE_STATE_LABEL: Record<PatientResponseState, string> = {
  REPORTED_YES: '있음(환자 응답)',
  REPORTED_NONE: '없음(환자 응답)',
  REPORTED_UNKNOWN: '모름(환자 응답)',
  NOT_ASKED: '질문하지 않음',
}

/**
 * Same three-plus-one distinction for anything the CLINICIAN could examine.
 * NOT_YET_CHECKED must never render or compute as NEGATIVE — that is the
 * single most safety-relevant invariant in this file. "안 물어봄/안 해봄"
 * is not "아니오".
 */
export type ExamCheckStatus = 'POSITIVE' | 'NEGATIVE' | 'UNCLEAR' | 'NOT_YET_CHECKED'

export const EXAM_CHECK_STATUS_LABEL: Record<ExamCheckStatus, string> = {
  POSITIVE: '양성/이상 소견',
  NEGATIVE: '음성/정상',
  UNCLEAR: '불명확',
  NOT_YET_CHECKED: '아직 확인 안 됨',
}

/**
 * Core Reduction P2 (Phase 7 UI spec §6.3): the button that RECORDS one of
 * these four states must not rely on color alone -- each gets its own
 * glyph prefix in the button label. Deliberately a SEPARATE map from
 * EXAM_CHECK_STATUS_LABEL above: that map is also used in narrative
 * sentences ("이전 소견: 양성/이상 소견", EMR carry-forward text via
 * RevisitWorkspace.tsx) where a bare glyph prefix would read as noise --
 * only the interactive status buttons (ExamSuggestionCard.tsx,
 * StructuredReassessmentCard.tsx) prefix with this.
 */
export const EXAM_CHECK_STATUS_GLYPH: Record<ExamCheckStatus, string> = {
  POSITIVE: '✓',
  NEGATIVE: '–',
  UNCLEAR: '?',
  NOT_YET_CHECKED: '·',
}

/** True only for a real clinician-entered result — never true for "not yet checked". */
export function isExamChecked(status: ExamCheckStatus): boolean {
  return status !== 'NOT_YET_CHECKED'
}

/**
 * 14차 독립 리뷰 MEDIUM-2 / 15차 독립 리뷰 MEDIUM-2: `sanitizeShape`의
 * typeof-매칭은 `result.status`가 어떤 문자열이든(옵션 목록 밖이어도)
 * 통과시키고, `result.laterality`(null-템플릿 필드)는 문자열/숫자/null
 * 전부 통과시킨다 -- `EXAM_CHECK_STATUS_LABEL[status]`/
 * `LATERALITY_LABEL[laterality]`가 알려진 키가 아니면 `undefined`를
 * 반환하고, 그 값이 원장이 그대로 보는/복사하는 텍스트에 리터럴
 * "undefined"로 그대로 노출된다. 14차는 emrPreview.ts에만 이 가드를
 * 두었다가 15차 독립 리뷰가 StructuredReassessmentCard.tsx/
 * RevisitWorkspace.tsx의 동일한 미가공 lookup을 찾아냈다 -- 여러 파일이
 * 공유할 수 있도록 라벨 맵과 같은 파일로 옮긴다.
 */
export function isValidExamStatus(status: unknown): status is ExamCheckStatus {
  return typeof status === 'string' && Object.prototype.hasOwnProperty.call(EXAM_CHECK_STATUS_LABEL, status)
}
export function isValidLaterality(laterality: unknown): laterality is Laterality {
  return typeof laterality === 'string' && Object.prototype.hasOwnProperty.call(LATERALITY_LABEL, laterality)
}

/**
 * Laterality — several exam findings are meaningfully left/right/bilateral.
 * Kept generic/non-clinical: this is a UI input shape, not a diagnostic
 * category.
 */
export type Laterality = 'LEFT' | 'RIGHT' | 'BILATERAL' | 'NOT_APPLICABLE'

export const LATERALITY_LABEL: Record<Laterality, string> = {
  LEFT: '좌',
  RIGHT: '우',
  BILATERAL: '양측',
  NOT_APPLICABLE: '해당 없음',
}
