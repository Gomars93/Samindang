// Deterministic Saju (사주/만세력) calculation engine. Pure calculation +
// data-contract module — no UI, no AI/LLM inference of clinical or myungri
// meaning anywhere in this file. See docs/MYUNGRI_CALCULATION_POLICY_PENDING.md
// for the rules that are deliberately NOT decided here.
//
// Every branch below either produces a fully-sourced pillar (library
// arithmetic only) or returns an explicit unresolved/partial state. Nothing
// is guessed.

import {
  calculateFourPillars,
  lunarToSolar,
  isValidSolarDate,
  getSolarTermsOfYear,
  LUNAR_MIN_YEAR,
  LUNAR_MAX_YEAR,
} from 'manseryeok'
import type { DayBoundary, FourPillarsDetail } from 'manseryeok'
import manseryeokPkg from '../../node_modules/manseryeok/package.json'
import {
  MYUNGRI_ALGORITHM_VERSION,
  DEFAULT_DAY_BOUNDARY,
  TRUE_SOLAR_TIME,
} from './policy'
import type { Pillars, SajuInput, SajuResult, TimeBranchKey } from './types'

export type { SajuInput, SajuResult, Pillars, TimeBranchKey } from './types'
export { MYUNGRI_ALGORITHM_VERSION, PENDING_POLICIES, DEFAULT_DAY_BOUNDARY, TRUE_SOLAR_TIME } from './policy'

const LIBRARY_VERSION: string = manseryeokPkg.version ?? '2.0.0'

/**
 * 12시진 clock ranges (KST) and their deterministic representative instant.
 *
 * Representative-time rule: the hour pillar only depends on which branch a
 * time falls in, so we name one fixed instant per branch (its midpoint) to
 * hand to the pillar-calculation library. 'ja' is the exception: its literal
 * midpoint (00:00) would cross the calendar-day boundary the patient stated,
 * so we use 23:30 on the stated date instead and rely on the jasi flag +
 * alternatives to carry the real ambiguity. This representative time is only
 * ever used to name a point *inside* an already-chosen branch — never to
 * decide which branch applies.
 */
const TIME_BRANCHES: Record<TimeBranchKey, { startHour: number; endHour: number; repHour: number; repMinute: number }> = {
  ja: { startHour: 23, endHour: 0, repHour: 23, repMinute: 30 },
  chuk: { startHour: 1, endHour: 2, repHour: 2, repMinute: 0 },
  in: { startHour: 3, endHour: 4, repHour: 4, repMinute: 0 },
  myo: { startHour: 5, endHour: 6, repHour: 6, repMinute: 0 },
  jin: { startHour: 7, endHour: 8, repHour: 8, repMinute: 0 },
  sa: { startHour: 9, endHour: 10, repHour: 10, repMinute: 0 },
  o: { startHour: 11, endHour: 12, repHour: 12, repMinute: 0 },
  mi: { startHour: 13, endHour: 14, repHour: 14, repMinute: 0 },
  sin: { startHour: 15, endHour: 16, repHour: 16, repMinute: 0 },
  yu: { startHour: 17, endHour: 18, repHour: 18, repMinute: 0 },
  sul: { startHour: 19, endHour: 20, repHour: 20, repMinute: 0 },
  hae: { startHour: 21, endHour: 22, repHour: 22, repMinute: 0 },
}

/** Neutral representative hour used only when the birth time is unknown. */
const UNKNOWN_TIME_REP_HOUR = 12
const UNKNOWN_TIME_REP_MINUTE = 0

function pillarsToStrings(detail: FourPillarsDetail): Pillars {
  return {
    year: detail.yearString,
    month: detail.monthString,
    day: detail.dayString,
    hour: detail.hourString,
  }
}

function unresolved(input: SajuInput, reason: string): SajuResult {
  return {
    status: 'unresolved',
    unresolved_reason: reason,
    input,
    normalized: null,
    pillars: null,
    alternatives: null,
    flags: {
      in_jasi_window: false,
      near_solar_term: false,
      hour_unknown: input.timeBranch === 'unknown' || input.timeBranch === null,
      lunar_leap_unresolved: input.calendarType === 'lunar' && input.lunarLeapMonth === 'unknown',
    },
    policy: {
      day_boundary: DEFAULT_DAY_BOUNDARY,
      true_solar_time: TRUE_SOLAR_TIME,
      algorithm_version: MYUNGRI_ALGORITHM_VERSION,
      pending_approval: [],
    },
    engine: {
      library: 'manseryeok',
      library_version: LIBRARY_VERSION,
      computed_at: new Date().toISOString(),
    },
  }
}

/** Parses 'YYYYMMDD'. Returns null if not an 8-digit numeric string. */
function parseBirthDateRaw(raw: string): { year: number; month: number; day: number } | null {
  if (!/^\d{8}$/.test(raw)) return null
  const year = Number(raw.slice(0, 4))
  const month = Number(raw.slice(4, 6))
  const day = Number(raw.slice(6, 8))
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return { year, month, day }
}

/** Checks whether `date` falls within 1 calendar day of any solar-term boundary in its year (or the adjacent year, for edge dates). */
function isNearSolarTerm(date: { year: number; month: number; day: number }): boolean {
  const instantMs = Date.UTC(date.year, date.month - 1, date.day, 12, 0, 0) // noon UTC, coarse day-level check
  const oneDayMs = 24 * 60 * 60 * 1000
  const terms = [
    ...getSolarTermsOfYear(date.year - 1),
    ...getSolarTermsOfYear(date.year),
    ...getSolarTermsOfYear(date.year + 1),
  ]
  return terms.some((t) => Math.abs(t.date.getTime() - instantMs) <= oneDayMs)
}

function computePillarsWithBoundary(
  solarDate: { year: number; month: number; day: number },
  hour: number,
  minute: number,
  dayBoundary: DayBoundary,
): Pillars {
  const detail = calculateFourPillars({
    year: solarDate.year,
    month: solarDate.month,
    day: solarDate.day,
    hour,
    minute,
    dayBoundary,
    // trueSolarTime intentionally omitted — see policy.ts TRUE_SOLAR_TIME.
  })
  return pillarsToStrings(detail)
}

export function computeSaju(input: SajuInput): SajuResult {
  if (input.calendarType === 'unknown') {
    return unresolved(input, '양력/음력 구분을 알 수 없어 사주를 계산할 수 없습니다.')
  }

  const parsed = parseBirthDateRaw(input.birthDateRaw)
  if (!parsed) {
    return unresolved(input, '생년월일 형식이 올바르지 않습니다 (YYYYMMDD 8자리, 유효한 날짜여야 함).')
  }

  if (input.calendarType === 'lunar' && input.lunarLeapMonth === 'unknown') {
    return unresolved(input, '윤달 여부가 확정되지 않아 음력을 양력으로 변환할 수 없습니다.')
  }

  let solarDate: { year: number; month: number; day: number }
  const lunarLeapUnresolved = false // reaching here means it's resolved or not lunar

  if (input.calendarType === 'lunar') {
    if (parsed.year < LUNAR_MIN_YEAR || parsed.year > LUNAR_MAX_YEAR) {
      return unresolved(
        input,
        `음력 지원 범위(${LUNAR_MIN_YEAR}~${LUNAR_MAX_YEAR}년)를 벗어나 변환할 수 없습니다.`,
      )
    }
    try {
      solarDate = lunarToSolar(parsed.year, parsed.month, parsed.day, input.lunarLeapMonth === 'yes')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return unresolved(input, `음력 날짜가 유효하지 않습니다: ${msg}`)
    }
  } else {
    if (!isValidSolarDate(parsed.year, parsed.month, parsed.day)) {
      return unresolved(input, '생년월일이 실재하지 않는 양력 날짜입니다.')
    }
    solarDate = parsed
  }

  const timeUnknown = input.timeBranch === 'unknown' || input.timeBranch === null
  const isJasi = input.timeBranch === 'ja'

  const hour = timeUnknown ? UNKNOWN_TIME_REP_HOUR : TIME_BRANCHES[input.timeBranch as TimeBranchKey].repHour
  const minute = timeUnknown ? UNKNOWN_TIME_REP_MINUTE : TIME_BRANCHES[input.timeBranch as TimeBranchKey].repMinute

  const defaultPillars = computePillarsWithBoundary(solarDate, hour, minute, DEFAULT_DAY_BOUNDARY)

  const nearTerm = isNearSolarTerm(solarDate)

  const pendingApproval: string[] = []
  let alternatives: SajuResult['alternatives'] = null

  if (isJasi) {
    pendingApproval.push('day_boundary')
    alternatives = {
      dayBoundary: {
        midnight: computePillarsWithBoundary(solarDate, hour, minute, 'midnight'),
        jasi: computePillarsWithBoundary(solarDate, hour, minute, 'jasi'),
        splitJasi: computePillarsWithBoundary(solarDate, hour, minute, 'splitJasi'),
      },
    }
  }

  if (nearTerm) {
    pendingApproval.push('true_solar_time')
  }

  const result: SajuResult = {
    status: timeUnknown ? 'partial' : 'resolved',
    unresolved_reason: null,
    input,
    normalized: {
      solarDate,
      timeBranch: timeUnknown ? null : (input.timeBranch as TimeBranchKey),
      hourUsed: timeUnknown ? null : hour,
      minuteUsed: timeUnknown ? null : minute,
    },
    pillars: {
      year: defaultPillars.year,
      month: defaultPillars.month,
      day: defaultPillars.day,
      hour: timeUnknown ? null : defaultPillars.hour,
    },
    alternatives,
    flags: {
      in_jasi_window: isJasi,
      near_solar_term: nearTerm,
      hour_unknown: timeUnknown,
      lunar_leap_unresolved: lunarLeapUnresolved,
    },
    policy: {
      day_boundary: DEFAULT_DAY_BOUNDARY,
      true_solar_time: TRUE_SOLAR_TIME,
      algorithm_version: MYUNGRI_ALGORITHM_VERSION,
      pending_approval: pendingApproval,
    },
    engine: {
      library: 'manseryeok',
      library_version: LIBRARY_VERSION,
      computed_at: new Date().toISOString(),
    },
  }

  return result
}
