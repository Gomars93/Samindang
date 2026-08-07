// Data contract for the deterministic Saju (사주/만세력) calculation engine.
// Pure types — no runtime logic here. See policy.ts for the pending-policy
// defaults and index.ts for the calculation itself.
//
// NOTE ON SCOPE: this contract intentionally carries only pillars + flags +
// policy metadata. No 십신/대운/용신/interpretation output is modeled here —
// none of that is computed or surfaced by this engine.

/** 12시진 (two-hour branch blocks), using the library's KST clock ranges. */
export type TimeBranchKey =
  | 'ja'
  | 'chuk'
  | 'in'
  | 'myo'
  | 'jin'
  | 'sa'
  | 'o'
  | 'mi'
  | 'sin'
  | 'yu'
  | 'sul'
  | 'hae'

export interface SajuInput {
  /** 'YYYYMMDD' exactly as the patient typed it. Never reformatted before storage. */
  birthDateRaw: string
  calendarType: 'solar' | 'lunar' | 'unknown'
  /** null when calendarType !== 'lunar' */
  lunarLeapMonth: 'yes' | 'no' | 'unknown' | null
  timeBranch: TimeBranchKey | 'unknown' | null
  timeConfidence: 'exact' | 'approximate' | null
  sex: 'male' | 'female' | null
}

export interface Pillars {
  year: string
  month: string
  day: string
  hour: string
}

export interface SajuResult {
  status: 'resolved' | 'partial' | 'unresolved'
  /** Human-readable Korean explanation; null when status === 'resolved'. */
  unresolved_reason: string | null
  /** The exact SajuInput passed in, echoed back verbatim. */
  input: SajuInput
  normalized:
    | {
        solarDate: { year: number; month: number; day: number }
        timeBranch: TimeBranchKey | null
        hourUsed: number | null
        minuteUsed: number | null
      }
    | null
  /** Conservative-default-policy result. hour is null when time is unknown. */
  pillars: { year: string; month: string; day: string; hour: string | null } | null
  /** Populated only when the jasi (23:00-00:59) window applies. */
  alternatives: { dayBoundary: { midnight: Pillars; jasi: Pillars; splitJasi: Pillars } } | null
  flags: {
    in_jasi_window: boolean
    near_solar_term: boolean
    hour_unknown: boolean
    lunar_leap_unresolved: boolean
  }
  policy: {
    day_boundary: string
    true_solar_time: string
    algorithm_version: string
    pending_approval: string[]
  }
  engine: {
    library: 'manseryeok'
    library_version: string
    computed_at: string
  }
}
