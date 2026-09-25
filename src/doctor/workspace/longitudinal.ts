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
import { NEXT_REASSESSMENT_PLAN_STATUS_LABEL, isNrsValue } from './finalAssessment'
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
  /**
   * 이전 방문의 NRS(0~10). 서버가 이미 **검증해서** 보낸다 -- 읽을 수 없는
   * 값은 그쪽에서 null로 떨어진다(`server/store.js`의 `readNrs`, 판정 규칙은
   * 화면 쪽 `readScale0to10`과 동일).
   *
   * 이 값이 있어야 다음 방문 화면의 **비교 행**(`지금 통증 ──── 8 → 5 ↓3`)이
   * 그려진다. 여태 그 행의 코드는 있는데 값을 나르는 경로가 없어 척도 행만
   * 보였다.
   *
   * 그래도 화면 쪽에서 한 번 더 판정한다 -- 이 타입 선언은 서버 응답에 대한
   * 약속일 뿐이고, 같은 이유로 `primaryConcern`도 `readablePriorVisitText`를
   * 거친다(11차 리뷰 MEDIUM-2).
   */
  painNrsNow: number | null
  painNrsWorst: number | null
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
/**
 * 비교에 쓸 **이전 NRS**를 고른다.
 *
 * 왜 "가장 최근 방문"이 아니라 "값이 있는 가장 최근 방문"인가
 * ---------------------------------------------------------
 * 직전 방문이 한약 단독이거나 재진 링크에 답하지 않은 방문이면 NRS가 없다.
 * 그때 `visits[0]`만 보면 값이 null이라 비교 행이 안 그려진다 -- 그 앞 방문에
 * 멀쩡한 값이 있는데도. 차트를 읽는 방식과 같게, **빈 방문은 건너뛰고 마지막
 * 측정치**와 비교한다.
 *
 * 두 값을 **같은 방문에서** 가져오는 이유
 * --------------------------------------
 * 필드별로 각각 "값이 있는 최근 방문"을 찾으면 `지금 통증`은 3주 전,
 * `가장 아플 때`는 6주 전 값이 되는 조합이 생긴다. 한 화면에 서로 다른
 * 시점의 두 값을 나란히 두면 원장이 그걸 같은 시점으로 읽는다.
 *
 * 그래서 **`nrs_now`가 있는 가장 최근 방문 하나**를 고르고, 두 값 모두 그
 * 방문에서 가져온다. 그 방문에 `nrs_worst`가 없으면 그쪽만 null이다.
 *
 * 값 검증은 하지 않는다 -- 서버가 이미 `readNrs`로 0~10 정수만 통과시키고
 * (`server/store.js`), 화면 쪽 `nrsRow`도 `readScale0to10`으로 한 번 더
 * 판정한다. 여기서 세 번째 판정을 두면 규칙이 세 군데가 된다.
 */
export function priorNrsFromHistory(
  priorVisits: PatientHistoryResult | null | undefined,
): { now: number | null; worst: number | null } {
  const visits = Array.isArray(priorVisits?.visits) ? priorVisits.visits : []
  const source = visits.find((v) => typeof v?.painNrsNow === 'number')
  if (!source) return { now: null, worst: null }
  return {
    now: source.painNrsNow,
    worst: typeof source.painNrsWorst === 'number' ? source.painNrsWorst : null,
  }
}

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

/**
 * Core Reduction P2 (Phase 5 Synthesis v1.2 §2.6-3, delta N-5, Phase 7
 * §2.3 lane2 최상단 고정 1줄 "지난번 추적"): Opus's concept ⑥ ("이전 추적
 * 항목(라벨+기준값 raw)" 복원) as one line at the top of lane2, sourced
 * from the MOST RECENT prior visit's profile-agnostic `followUpTargets`
 * union (never re-concatenating pain/herbal here -- that union already
 * exists precisely so a caller does not have to guess which profile the
 * prior visit was).
 *
 * N≥2 items join with `·` on the one line; beyond 3 the line names the
 * first 3 and reports the rest as a count (delta N-5's "표시 불가 시 외 N"
 * -- the caller renders the actual reference-jump affordance, this
 * function only counts). A wrong-typed/unreadable target's raw value
 * renders as `readablePriorVisitFollowUpTarget`'s own explicit failure
 * token, never silently compressed into "기록 없음" (UNKNOWN ≠ NO).
 */
export type LastVisitTrackedLine = { text: string; overflowCount: number }

const LAST_VISIT_TRACKED_MAX_SHOWN = 3

/**
 * 2026-09-25 (한약 NRS의 짝): 지난 기준값 옆에 **오늘 기준값**을 나란히
 * 놓는다 -- 둘 다 NRS(0~10)일 때만.
 *
 *   수면 불편 — 기준값 7 → 4 ↓3
 *
 * 왜 여기인가: 이 줄은 이미 확인 레인 맨 위에 **프로필과 무관하게** 뜨고
 * 있었고(가드 없음), 지난 기준값을 이미 싣고 있었다. 한약용 브리핑
 * 컴포넌트를 새로 만드는 것보다 이미 있는 줄에 오른쪽 절반을 채우는 쪽이
 * 정직하다.
 *
 * 계산하는 것은 **산술뿐**이다 -- 차이와 방향 화살표. `호전/악화`도, %도,
 * 판정도 만들지 않는다(`REPEAT_VISIT_AUTO_COMPARE_STATUS`가 금지하는 것은
 * 그 해석이지 이전 값 표시가 아니다 -- finalAssessment.ts의 그 상수 주석).
 * 통증 브리핑의 비교 행이 이미 같은 선을 긋고 있다.
 *
 * 둘 중 하나라도 NRS가 아니면(자유 텍스트, 미기록, 손상) 예전 문구
 * 그대로다 -- `todayTargets`를 생략한 호출자는 바이트 단위로 같다.
 *
 * `baseline` 대 `baseline`으로 짝짓는다. 지난 `postTreatmentValue`(치료
 * 직후)는 다른 시점이라 오늘 기준값과 나란히 놓으면 안 된다.
 *
 * 프로필을 가르지 않는다 -- 이 줄의 출처인 `followUpTargets`가 원래
 * 프로필 무관 union이고, 통증도 원장이 `pain_intensity` 기준값을 NRS로
 * 적었다면 같은 규칙으로 델타가 붙는다. 그쪽에도 맞는 정보다.
 */
function trackedValueText(
  priorRaw: string,
  today: { value: string; label: string } | undefined,
  priorLabel: string,
): string {
  if (today === undefined || !isNrsValue(priorRaw) || !isNrsValue(today.value)) return priorRaw
  /*
    검수 F4: **같은 자로 잰 것인지 확신할 수 없으면 델타를 만들지 않는다.**

    2026-09-25에 한약 라벨이 중립 명사에서 방향 있는 이름으로 좁아졌다
    (`수면` → `수면 불편`). 옛 방문에 `수면` 아래 맨 숫자를 적어뒀다면 그
    숫자가 "잘 잔 정도"였는지 "불편한 정도"였는지 알 수 없는데, id가 같다는
    이유로 화살표를 붙이면 **악화를 호전으로 표시**할 수 있다.

    라벨이 같을 때만 비교한다 -- 이 배치 이후 기록은 모두 새 라벨이라 다음
    방문부터 델타가 자연히 되살아난다. 라벨이 다르면 지난 값만 그대로 보여
    주고 판단은 원장에게 남긴다(지어내지 않는다).

    `HERBAL_NRS_TARGET_IDS` 주석이 "옛 값이 새 방문의 NRS 버튼으로 둔갑하는
    경로는 없다"고만 적고 이 경로를 놓쳤다 -- 그 주석도 고쳤다.
  */
  const todayValue = today.value
  if (priorLabel !== today.label) return priorRaw
  const priorN = Number(priorRaw)
  const todayN = Number(todayValue)
  const diff = Math.abs(todayN - priorN)
  const arrow = todayN < priorN ? ` ↓${diff}` : todayN > priorN ? ` ↑${diff}` : ''
  return `${priorRaw} → ${todayValue}${arrow}`
}

export function lastVisitTrackedLine(
  priorVisits: PatientHistoryResult | null | undefined,
  todayTargets?: readonly FollowUpTarget[],
): LastVisitTrackedLine | null {
  const visits = asPriorVisitArray<PriorVisitSummary>(priorVisits?.visits)
  const last = visits[0]
  if (!isRecordLike(last)) return null
  const rawTargets = asPriorVisitArray<unknown>((last as PriorVisitSummary).followUpTargets)
  if (rawTargets.length === 0) return null
  // 오늘 값은 id로 짝짓는다. 오늘 목록도 검증 없는 PUT이 만든 것이라 원소별로 방어한다.
  const todayById = new Map<string, { value: string; label: string }>()
  for (const t of asPriorVisitArray<unknown>(todayTargets)) {
    if (!isRecordLike(t)) continue
    if (typeof t.id !== 'string' || typeof t.baseline !== 'string' || typeof t.label !== 'string') continue
    if (!todayById.has(t.id)) todayById.set(t.id, { value: t.baseline.trim(), label: t.label })
  }
  const shown = rawTargets.slice(0, LAST_VISIT_TRACKED_MAX_SHOWN).map((raw, i) => {
    const t = readablePriorVisitFollowUpTarget(raw, i)
    const rawValue = t.baselineText.replace(/^이전 baseline:\s*/, '')
    return `${t.label} — 기준값 ${trackedValueText(rawValue, todayById.get(t.id), t.label)}`
  })
  return {
    text: shown.join(' · '),
    overflowCount: Math.max(0, rawTargets.length - LAST_VISIT_TRACKED_MAX_SHOWN),
  }
}

function isRecordLike(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object'
}

/**
 * §10.2 (Batch 3.1): before this, "이전에 채택한 운동" only ever read the
 * IMMEDIATELY PRIOR visit's submission -- once a patient has had two or
 * more revisits since their intake, the immediately prior visit is itself a
 * revisit (no `submissionId`) and the line silently disappeared, even
 * though the intake visit (and its accepted exercises) still exists further
 * back in the same history. This walks the same most-recent-first
 * `PatientHistoryResult['visits']` projection and returns the FIRST
 * (i.e. latest) visit that is actually submission-backed -- a pure lookup,
 * no fetch, no clinical judgment, no threshold.
 *
 * `visits` is `unknown`, not `PriorVisitSummary[]`, for the same reason as
 * every other reader in this file: it is the untrusted-PUT projection. Any
 * element that is not a record, or whose `submissionId` is not a non-empty
 * string, or whose `visitId` is not a string, carries no usable exercise
 * source -- it is skipped (not returned as a partial/guessed result) and
 * the scan continues to the next, older visit. A non-array input, or a
 * history with no submission-backed visit anywhere in it, returns `null`.
 * Never throws.
 */
export function findLatestSubmissionBackedPriorVisit(
  visits: unknown,
): { visitId: string; submissionId: string; createdAt: unknown } | null {
  const list = asPriorVisitArray<unknown>(visits)
  for (const raw of list) {
    if (!isRecordLike(raw)) continue
    const submissionId = raw.submissionId
    if (typeof submissionId !== 'string' || submissionId === '') continue
    const visitId = raw.visitId
    if (typeof visitId !== 'string') continue
    return { visitId, submissionId, createdAt: raw.createdAt }
  }
  return null
}
