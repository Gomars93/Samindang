/**
 * Midlife v0.1 원장 기록 — `docs/MIDLIFE_UI_IA_v0.2.md` §5·§6.
 *
 * 순수 타입 + 정화 + 상태 규칙. React·네트워크 코드 없음. 저장은
 * `WorkspaceState.midlifeCare`(추가형 필드, 스키마 버전 미변경)로 기존
 * submission workspace 저장 경로를 그대로 탄다 — 새 저장소·새 라우트 없음.
 *
 * 여기 있는 값은 **전부 원장이 직접 입력/선택한 것**이다. 자동 진단·점수·
 * 추천은 없다. 파생되는 것은 PO(2026-09-27)가 정한 두 표시 규칙뿐이다:
 *
 *   1. 미해결 항목: 긴급(urgent) 미해결 1개 이상 → 즉시 상단 경고,
 *      비긴급 미해결 2개 이상 → "새 치료 변경 전 정리 필요". 개수만으로
 *      위험도를 올리지 않는다(3개라서 더 위험하다고 보지 않는다).
 *   2. 가설 재검토: 경과 기록이 **연속 2회** "예상과 다름"이면 진단 가설을
 *      reopen 상태로 표시한다. "연속"은 원장이 경과 판정을 기록한 review끼리의
 *      순서다(판정을 비워둔 주차는 건너뛴다 — 없는 판정을 "예상대로"로 읽지 않는다).
 *
 * 2/4/8/12주 review는 v0.1에서 **초진 기록 한 곳에 누적**한다. 재진 화면이
 * 자동으로 이어받지는 않는다(환자 단위 에피소드 저장은 첫 5–10명 사용 후
 * 결정 — 명세 §6).
 */

import { MIDLIFE_PRIORITY_OPTIONS } from '../../spec/midlifeQuestions'
import { MAX_FOLLOW_UP_TARGETS, followUpTarget, type FollowUpTarget } from './finalAssessment'

export const MIDLIFE_LIFE_STAGES = [
  '',
  'late_reproductive',
  'early_transition',
  'late_transition',
  'postmenopause',
  'not_assessable',
] as const
export type MidlifeLifeStage = (typeof MIDLIFE_LIFE_STAGES)[number]

export const MIDLIFE_LIFE_STAGE_LABEL: Record<MidlifeLifeStage, string> = {
  '': '미정',
  late_reproductive: '가임기 후기',
  early_transition: '이행기 초기',
  late_transition: '이행기 후기',
  postmenopause: '폐경 후',
  not_assessable: '판단 어려움(수술·약물 등)',
}

/**
 * 외부 평가 상태. 명세: "recommended/ordered 수준이 아니라 pending/completed/
 * result-reviewed까지" — 결과를 원장이 확인해야 끝난다.
 */
export const MIDLIFE_REFERRAL_STATUSES = ['recommended', 'ordered', 'pending', 'completed', 'result_reviewed'] as const
export type MidlifeReferralStatus = (typeof MIDLIFE_REFERRAL_STATUSES)[number]

export const MIDLIFE_REFERRAL_STATUS_LABEL: Record<MidlifeReferralStatus, string> = {
  recommended: '권고함',
  ordered: '의뢰함',
  pending: '결과 대기',
  completed: '검사 완료(결과 미확인)',
  result_reviewed: '결과 확인함',
}

export type MidlifeReferralUrgency = 'urgent' | 'non_urgent'

export type MidlifeReferral = {
  id: string
  /** 무엇을 어디에 — 원장 자유 입력(예: "부인과 초음파"). */
  label: string
  urgency: MidlifeReferralUrgency
  status: MidlifeReferralStatus
  note: string
  updatedAt: string | null
}

export const MIDLIFE_REVIEW_WEEKS = [2, 4, 8, 12] as const
export type MidlifeReviewWeek = (typeof MIDLIFE_REVIEW_WEEKS)[number]

export const MIDLIFE_COURSE_VALUES = ['as_expected', 'deviates', 'unclear'] as const
export type MidlifeCourseVsExpected = (typeof MIDLIFE_COURSE_VALUES)[number]

export const MIDLIFE_COURSE_LABEL: Record<MidlifeCourseVsExpected, string> = {
  as_expected: '예상대로',
  deviates: '예상과 다름',
  unclear: '판단 어려움',
}

/**
 * 주차 review — **원장 판단만** 담는다(경과 판정·기록일·메모).
 *
 * PRO(주 증상·수면 만족·일상 지장)는 2026-09-29 이 모델에서 빠졌다(PO PR #59 재검수
 * BLOCKER 1 "환자 입력 PRO를 원장이 다시 타이핑하지 않는다"). 이제 환자가 재진 링크에서
 * MID_05·06·07을 직접 다시 답하고(server/detailCheck.js), 원장 화면은 그 값을
 * `PatientHistoryResult.midlifeProReports`로 읽는다. 옛 저장본의 `pro` 키는
 * sanitizeReview가 버린다(던지지 않음). nextActionConfidence는 2026-09-28에 먼저 삭제됐다.
 */
export type MidlifeReview = {
  week: MidlifeReviewWeek
  /** 원장이 기록한 날짜(YYYY-MM-DD). 빈 문자열 = 아직 안 함. */
  reviewedOn: string
  /** null = 경과 판정을 기록하지 않음(연속 판정에서 건너뜀). */
  courseVsExpected: MidlifeCourseVsExpected | null
  note: string
}

export type MidlifeCareRecord = {
  lifeStage: MidlifeLifeStage
  hypothesis: string
  refutationTrigger: string
  /** 초진/주요 review 때 쓰는 짧은 임상 예측(예: "2–4주 내 새벽 각성 빈도 감소 예상"). */
  expectedCourse: string
  nextReviewWeek: MidlifeReviewWeek | null
  referrals: MidlifeReferral[]
  /** 주차당 최대 1개, 주차 오름차순. */
  reviews: MidlifeReview[]
}

export function emptyMidlifeReview(week: MidlifeReviewWeek): MidlifeReview {
  return { week, reviewedOn: '', courseVsExpected: null, note: '' }
}

export function emptyMidlifeCareRecord(): MidlifeCareRecord {
  return {
    lifeStage: '',
    hypothesis: '',
    refutationTrigger: '',
    expectedCourse: '',
    nextReviewWeek: null,
    referrals: [],
    reviews: [],
  }
}

export function newMidlifeReferral(id: string): MidlifeReferral {
  return { id, label: '', urgency: 'non_urgent', status: 'recommended', note: '', updatedAt: null }
}

/* ---------------------------------------------------------------------------
 * 정화 — 검증 없는 PUT이 저장한 JSON에서 온다. 절대 던지지 않고, 모르는 값은
 * 빈 기본값으로 떨어뜨린다(빈 값 = "아직 기록 안 함", "이상 없음"이 아니다).
 * ------------------------------------------------------------------------- */

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

function oneOf<T extends string | number>(allowed: readonly T[], v: unknown, fallback: T): T {
  return (allowed as readonly unknown[]).includes(v) ? (v as T) : fallback
}

/** 0~10 정수만. 나머지는 전부 null. */
export function sanitizeScore(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 10 ? v : null
}

function sanitizeReferral(raw: unknown, index: number): MidlifeReferral {
  const r = isRecord(raw) ? raw : {}
  return {
    id: typeof r.id === 'string' && r.id !== '' ? r.id : `referral-${index}`,
    label: str(r.label),
    urgency: oneOf<MidlifeReferralUrgency>(['urgent', 'non_urgent'], r.urgency, 'non_urgent'),
    // 모르는 상태값은 "결과 확인함"(= 해결)으로 읽지 않는다 -- 가장 앞 단계로.
    status: oneOf<MidlifeReferralStatus>(MIDLIFE_REFERRAL_STATUSES, r.status, 'recommended'),
    note: str(r.note),
    updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : null,
  }
}

function sanitizeReview(raw: unknown): MidlifeReview | null {
  if (!isRecord(raw)) return null
  if (!(MIDLIFE_REVIEW_WEEKS as readonly unknown[]).includes(raw.week)) return null
  return {
    week: raw.week as MidlifeReviewWeek,
    reviewedOn: str(raw.reviewedOn),
    courseVsExpected: (MIDLIFE_COURSE_VALUES as readonly unknown[]).includes(raw.courseVsExpected)
      ? (raw.courseVsExpected as MidlifeCourseVsExpected)
      : null,
    note: str(raw.note),
  }
}

/** 주차 중복은 뒤의 것이 이긴다(마지막으로 저장된 값), 결과는 주차 오름차순. */
export function normalizeReviews(reviews: MidlifeReview[]): MidlifeReview[] {
  const byWeek = new Map<MidlifeReviewWeek, MidlifeReview>()
  for (const r of reviews) byWeek.set(r.week, r)
  return [...byWeek.values()].sort((a, b) => a.week - b.week)
}

export function sanitizeMidlifeCareRecord(raw: unknown): MidlifeCareRecord {
  const empty = emptyMidlifeCareRecord()
  if (!isRecord(raw)) return empty
  return {
    lifeStage: oneOf<MidlifeLifeStage>(MIDLIFE_LIFE_STAGES, raw.lifeStage, ''),
    hypothesis: str(raw.hypothesis),
    refutationTrigger: str(raw.refutationTrigger),
    expectedCourse: str(raw.expectedCourse),
    nextReviewWeek: (MIDLIFE_REVIEW_WEEKS as readonly unknown[]).includes(raw.nextReviewWeek)
      ? (raw.nextReviewWeek as MidlifeReviewWeek)
      : null,
    referrals: Array.isArray(raw.referrals) ? raw.referrals.map(sanitizeReferral) : [],
    reviews: Array.isArray(raw.reviews)
      ? normalizeReviews(raw.reviews.map(sanitizeReview).filter((r): r is MidlifeReview => r !== null))
      : [],
  }
}

/* ---------------------------------------------------------------------------
 * 상태 규칙 (PO 2026-09-27)
 * ------------------------------------------------------------------------- */

export const isReferralUnresolved = (r: MidlifeReferral): boolean => r.status !== 'result_reviewed'

export type MidlifeUnresolvedSummary = {
  urgentUnresolved: number
  nonUrgentUnresolved: number
  /** 긴급 미해결이 1개라도 있으면 즉시 상단 경고. */
  topWarning: boolean
  /** 비긴급 미해결이 2개 이상이면 새 치료 변경 전 정리 필요. */
  needsCleanup: boolean
}

export const MIDLIFE_NON_URGENT_CLEANUP_THRESHOLD = 2

export function midlifeUnresolvedSummary(referrals: MidlifeReferral[]): MidlifeUnresolvedSummary {
  const open = referrals.filter(isReferralUnresolved)
  const urgentUnresolved = open.filter((r) => r.urgency === 'urgent').length
  const nonUrgentUnresolved = open.length - urgentUnresolved
  return {
    urgentUnresolved,
    nonUrgentUnresolved,
    topWarning: urgentUnresolved >= 1,
    needsCleanup: nonUrgentUnresolved >= MIDLIFE_NON_URGENT_CLEANUP_THRESHOLD,
  }
}

/** 경과 판정이 기록된 review 중 마지막 두 개가 모두 "예상과 다름"이면 true. */
export function midlifeHypothesisReopen(reviews: MidlifeReview[]): boolean {
  const judged = normalizeReviews(reviews).filter((r) => r.courseVsExpected !== null)
  if (judged.length < 2) return false
  const [a, b] = judged.slice(-2)
  return a.courseVsExpected === 'deviates' && b.courseVsExpected === 'deviates'
}

/* ---------------------------------------------------------------------------
 * 4주 care goal (PO 2026-09-29, PR #59 재검수 BLOCKER 2)
 *
 * 전용 필드를 만들지 않고 기존 `FollowUpTarget`에 싣는다 — 갱년기 기록은 원장 화면에서
 * 한약 프로필이라 `herbalFollowUpTargets` 배열이다. 그래서 다음 재진 링크의 Micro
 * Follow-up 후보(server deriveMicroFollowUpCandidates)로 그대로 이어진다.
 * 갱년기 목표는 id 접두어로 구분하고 최대 2개, 배열 전체 상한(MAX_FOLLOW_UP_TARGETS)은
 * 기존 규칙 그대로 지킨다. 선택지는 환자 목표 문항(MID_13)과 같은 목록이다.
 * ------------------------------------------------------------------------- */

export const MIDLIFE_GOAL_ID_PREFIX = 'midlife_goal:'
export const MIDLIFE_CARE_GOAL_MAX = 2

export function midlifeGoalOptions(): FollowUpTarget[] {
  return MIDLIFE_PRIORITY_OPTIONS.map((o) => followUpTarget(`${MIDLIFE_GOAL_ID_PREFIX}${o.value}`, o.label))
}

export function isMidlifeGoal(t: FollowUpTarget): boolean {
  return typeof t?.id === 'string' && t.id.startsWith(MIDLIFE_GOAL_ID_PREFIX)
}

export function selectedMidlifeGoals(targets: FollowUpTarget[]): FollowUpTarget[] {
  return (Array.isArray(targets) ? targets : []).filter(isMidlifeGoal)
}

/**
 * 목표 하나를 켜거나 끈다. 켤 때 갱년기 목표 2개 또는 배열 전체 3개가 이미 차 있으면
 * **바꾸지 않고 같은 배열을 돌려준다**(조용히 다른 목표를 밀어내지 않는다).
 */
export function toggleMidlifeGoal(targets: FollowUpTarget[], goal: FollowUpTarget): FollowUpTarget[] {
  const list = Array.isArray(targets) ? targets : []
  if (list.some((t) => t.id === goal.id)) return list.filter((t) => t.id !== goal.id)
  if (selectedMidlifeGoals(list).length >= MIDLIFE_CARE_GOAL_MAX) return list
  if (list.length >= MAX_FOLLOW_UP_TARGETS) return list
  return [...list, goal]
}
