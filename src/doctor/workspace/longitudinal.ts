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
import { NEXT_REASSESSMENT_PLAN_STATUS_LABEL } from './finalAssessment'
import type { FollowUpTarget, NextReassessmentPlan, NextReassessmentPlanStatus } from './finalAssessment'

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

/** primaryConcern과 동일한 규칙의 범용 버전 -- final assessment 요약/재평가 메모 등에도 재사용한다. */
export function readablePriorVisitText(value: unknown): string | null {
  return readablePriorVisitPrimaryConcern(value)
}

/**
 * 12차 독립 리뷰 MEDIUM-3: 위 MEDIUM-2 수정은 `primaryConcern` 한 필드만
 * 방어했지만, `history`(GET /api/patients/:id/history)가 반환하는
 * `visits`/각 방문의 follow-up target 배열/최종 판단 요약/다음 재평가
 * 계획은 전부 같은 신뢰 경계(인증되지 않은 PUT
 * /api/submissions/:id/workspace가 검증 없이 저장한 workspace)에서 온다.
 * 배열 컨테이너가 배열이 아니거나(`.length`/`.map` 크래시), target의
 * label/baseline/postTreatmentValue가 wrong-typed거나(`.trim()` 크래시,
 * "[object Object]" 노출), createdAt이 wrong-typed면(가짜 1970-01-01 날짜
 * 또는 "Invalid Date") 이전 방문 카드/재진 요약 전체가 죽거나 지어낸
 * 값을 보여줄 수 있었다 -- 이 카드는 이전 방문의 raw 기록을 참고용으로만
 * 보여주는 화면이므로, 개별 target/날짜/계획 단위로 실패를 격리한다.
 */
export function asPriorVisitArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

export type ReadableFollowUpTarget = {
  id: string
  label: string
  /** "이전 baseline: ..." 형태로 이미 조립된 문구 (빈 값도 "기록 없음"으로 표현). */
  baselineText: string
  /** null이면 렌더하지 않음(진짜 미기록) -- wrong-typed면 실패 토큰 문자열. */
  postTreatmentText: string | null
}

export function readablePriorVisitFollowUpTarget(value: unknown, index: number): ReadableFollowUpTarget {
  const t = value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const id = typeof t.id === 'string' ? t.id : `unreadable-${index}`
  const label = typeof t.label === 'string' ? t.label : PRIOR_VISIT_PRIMARY_CONCERN_UNREADABLE_LABEL
  const baseline = t.baseline
  const baselineText =
    baseline === undefined || baseline === null
      ? '이전 baseline: 기록 없음'
      : typeof baseline === 'string'
        ? baseline.trim()
          ? `이전 baseline: ${baseline.trim()}`
          : '이전 baseline: 기록 없음'
        : `이전 baseline: ${PRIOR_VISIT_PRIMARY_CONCERN_UNREADABLE_LABEL}`
  const postTreatment = t.postTreatmentValue
  const postTreatmentText =
    postTreatment === undefined || postTreatment === null
      ? null
      : typeof postTreatment === 'string'
        ? postTreatment.trim() || null
        : PRIOR_VISIT_PRIMARY_CONCERN_UNREADABLE_LABEL
  return { id, label, baselineText, postTreatmentText }
}

/** createdAt이 유효한 날짜 문자열이 아니면 가짜 1970-01-01/"Invalid Date" 대신 실패 토큰을 반환한다. */
export function readablePriorVisitDateLabel(createdAt: unknown): string {
  if (typeof createdAt !== 'string') return PRIOR_VISIT_PRIMARY_CONCERN_UNREADABLE_LABEL
  const d = new Date(createdAt)
  if (Number.isNaN(d.getTime())) return PRIOR_VISIT_PRIMARY_CONCERN_UNREADABLE_LABEL
  return d.toLocaleDateString('ko-KR')
}

/** NextReassessmentPlan.status가 알려진 값이 아니면(레거시/손상) 조용히 비우는 대신 실패 토큰을 반환한다. */
export function readablePriorVisitReassessmentStatusLabel(status: unknown): string {
  if (typeof status !== 'string') return PRIOR_VISIT_PRIMARY_CONCERN_UNREADABLE_LABEL
  return NEXT_REASSESSMENT_PLAN_STATUS_LABEL[status as NextReassessmentPlanStatus] ?? PRIOR_VISIT_PRIMARY_CONCERN_UNREADABLE_LABEL
}
