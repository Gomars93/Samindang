/**
 * Longitudinal patient history (round 3 Phase C) — client-side types only.
 * The actual fetch lives in src/lib/serverClient.ts (getPatientHistory),
 * and the server-side computation lives in server/store.js/index.js.
 *
 * This is a RAW-FACTS-ONLY projection: no computed percentage, no
 * "호전/악화" interpretation, no improvement threshold. Each prior visit
 * exposes only what the clinician themselves already recorded that visit
 * (follow-up target baseline/post-treatment values, final assessment free
 * text, the next-reassessment plan they set) — never anything inferred.
 */
import type { FollowUpTarget, NextReassessmentPlan } from './finalAssessment'

export type PriorVisitSummary = {
  visitId: string
  submissionId: string | null
  createdAt: string
  primaryConcern: string | null
  painFollowUpTargets: FollowUpTarget[]
  herbalFollowUpTargets: FollowUpTarget[]
  /**
   * Profile-agnostic union, correct regardless of visit type: pain+herbal
   * concatenated for a submission-backed visit, or the visit's own generic
   * list for a no-submission revisit (round 4 review fix — see
   * server/store.js's getPatientHistory doc comment). Callers that want
   * "whatever this patient's most recently tracked" should read this
   * instead of concatenating painFollowUpTargets/herbalFollowUpTargets
   * themselves.
   */
  followUpTargets: FollowUpTarget[]
  /** Free text as the clinician wrote it — finalWorkingAssessment, or null if never recorded. */
  painFinalAssessmentSummary: string | null
  /** Free text as the clinician wrote it — finalPatternOrMechanism, or null if never recorded. */
  herbalFinalAssessmentSummary: string | null
  nextReassessmentPlan: NextReassessmentPlan | null
}

export type PatientHistoryResult = {
  patientId: string
  /** Most recent first. Never includes the visit currently being viewed. */
  visits: PriorVisitSummary[]
}

/**
 * 11차 독립 리뷰 MEDIUM-2: `primaryConcern`은 서버가 인증되지 않은 환자
 * 제출(POST /api/submissions)의 `metadata.primary_concern`을 런타임 검증
 * 없이 그대로 저장한 값이다(server/store.js). 현재 태블릿(App.tsx)은 이
 * 필드를 보내지 않지만, 레거시 레코드나 수기로 만든 LAN POST는 임의의
 * JSON(객체/배열 등)을 넣을 수 있다 -- 타입 선언(`string | null`)을
 * 신뢰하지 않고 렌더 직전에 검증해, string이 아니면 "[object Object]" 같은
 * 원문을 지어내는 대신 명시적 실패 토큰을 보여준다.
 */
export const PRIOR_VISIT_PRIMARY_CONCERN_UNREADABLE_LABEL = '확인 필요(값 형식 오류)'

export function readablePriorVisitPrimaryConcern(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string') return PRIOR_VISIT_PRIMARY_CONCERN_UNREADABLE_LABEL
  return value
}
