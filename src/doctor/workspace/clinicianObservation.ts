/**
 * Reusable clinician-observation model for the Herbal Workspace's
 * "오늘 반드시 확인" checklist (PR #24 Phase 4.3): follow-up questions,
 * tongue, pulse, abdominal exam, and other clinician-only observations.
 *
 * Structured enough to later support approved interpretation rules, but
 * this file contains no rule that interprets a tongue/pulse/abdomen
 * finding — it only records what the clinician entered.
 */
export type ClinicianObservationCategory =
  | 'FOLLOW_UP_QUESTION'
  | 'TONGUE'
  | 'PULSE'
  | 'ABDOMEN'
  | 'OTHER'

export const CLINICIAN_OBSERVATION_CATEGORY_LABEL: Record<ClinicianObservationCategory, string> = {
  FOLLOW_UP_QUESTION: '추가 문진',
  TONGUE: '설진',
  PULSE: '맥진',
  ABDOMEN: '복진',
  OTHER: '기타 소견',
}

export type ClinicianObservationItem = {
  id: string
  category: ClinicianObservationCategory
  title: string
  /** True once the clinician has entered a value (empty string counts as not-yet-checked). */
  checked: boolean
  /** Free-text finding. Structured enough to extend later without a rewrite. */
  value: string
  recordedAt: string | null
}

export function emptyClinicianObservation(
  id: string,
  category: ClinicianObservationCategory,
  title: string,
): ClinicianObservationItem {
  return { id, category, title, checked: false, value: '', recordedAt: null }
}

/**
 * Standard herbal-visit checklist (round 2 Phase 2/8): 설진/맥진/복진 are
 * the three exam actions every herbal visit involves, plus a generic
 * follow-up-question slot. This is NOT a clinical inference — it does not
 * read any patient fact or branch on anything; it is the same fixed four
 * checklist items every time, exactly like a paper visit-note template.
 * Populating it by default (instead of only in SYNTHETIC preview data) is
 * what makes "오늘 반드시 확인" show real, usable checklist rows for a
 * real production submission instead of an empty state.
 */
export function defaultClinicianObservations(): ClinicianObservationItem[] {
  return [
    emptyClinicianObservation('obs_tongue', 'TONGUE', '설진 소견'),
    emptyClinicianObservation('obs_pulse', 'PULSE', '맥진 소견'),
    emptyClinicianObservation('obs_abdomen', 'ABDOMEN', '복진 소견'),
    emptyClinicianObservation('obs_followup', 'FOLLOW_UP_QUESTION', '추가 확인문진'),
  ]
}

export function countStillNeedsCheck(items: ClinicianObservationItem[]): number {
  return items.filter((i) => !i.checked).length
}
