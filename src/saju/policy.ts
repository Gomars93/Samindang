// Pending-policy constants. Every rule here that is marked
// `approved_by_clinician: false` is a documented CONSERVATIVE default, not a
// clinical decision — the engine computes alternatives and flags them rather
// than deciding silently. See docs/MYUNGRI_CALCULATION_POLICY_PENDING.md.

export const MYUNGRI_ALGORITHM_VERSION = '1.0.0'

export const DEFAULT_DAY_BOUNDARY = 'midnight' as const
export const TRUE_SOLAR_TIME = 'not_applied' as const

export interface PendingPolicy {
  question: string
  current_default: string
  alternatives: string[]
  approved_by_clinician: false
}

export const PENDING_POLICIES: Record<
  'dayBoundary' | 'trueSolarTime' | 'hourPillarClinicalWeight',
  PendingPolicy
> = {
  dayBoundary: {
    question:
      '23:00~00:59(야자시/조자시) 출생자의 일주·시주를 어느 기준으로 계산할 것인가?',
    current_default: "'midnight' — 자정(00:00)에 날짜가 바뀐다고 보고 당일 일간을 기준으로 시주를 산출한다.",
    alternatives: [
      "'jasi' — 23시부터 다음날로 본다 (일주·시주 모두 다음날 일간 기준)",
      "'splitJasi' — 일주는 당일 유지, 시주 천간만 다음날 일간 기준",
    ],
    approved_by_clinician: false,
  },
  trueSolarTime: {
    question:
      '진태양시(眞太陽時) 보정을 적용할 것인가 (경도·균시차·과거 표준시/서머타임 보정)?',
    current_default: "'not_applied' — 환자가 말한 시계 시각을 그대로 사용, 보정 없음.",
    alternatives: [
      '서울 기준 경도(126.978) 보정 적용',
      '균시차(equation of time) 보정 적용',
      '과거 표준시/서머타임 보정 적용 (절기 경계 출생자의 월주·연주가 바뀔 수 있음)',
    ],
    approved_by_clinician: false,
  },
  hourPillarClinicalWeight: {
    question:
      '시주(時柱)를 임상적으로 얼마나 비중 있게 쓸 것인가, 그리고 출생시각 미상 환자를 어떻게 다룰 것인가?',
    current_default: "시간 미상이면 시주를 계산하지 않는다 (status: 'partial', pillars.hour = null). 추정하지 않는다.",
    alternatives: [
      '통계적으로 흔한 시간대를 대표값으로 사용 (비추천 — 추측을 감추게 됨)',
      '시주 없이도 임상 질문지에서 연/월/일주만으로 충분하다고 규정',
    ],
    approved_by_clinician: false,
  },
}
