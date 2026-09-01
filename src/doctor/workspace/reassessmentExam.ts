/**
 * Structured Reassessment exam items (round 3 Phase E). A clinician
 * promotes a PREVIOUSLY recorded exam observation (from this visit's own
 * "지금 확인할 것" list, via an explicit "재검 항목으로 추가" action) into a
 * reassessment tracking item. The previous value is kept as a read-only raw
 * fact; today's result ALWAYS starts NOT_YET_CHECKED — a prior POSITIVE/
 * NEGATIVE is never copied forward as if it were already re-confirmed.
 *
 * This file defines the framework only. It contains no rule about which
 * exam item "should" be rechecked — that selection is always an explicit
 * clinician click.
 */
import type { ExamCheckStatus, Laterality, Provenance } from './provenance'
import { emptyExamResult, type PhysicalExamSuggestionResult } from './examSuggestion'

export type PreviousExamValue = {
  status: ExamCheckStatus
  laterality: Laterality | null
  note: string
  /** ISO timestamp of the ORIGINAL recording, not today's. */
  recordedAt: string | null
}

export type ReassessmentExamItem = {
  id: string
  title: string
  /** The prior visit's/earlier-this-visit's recorded value, shown as a raw fact for comparison — never auto-copied into `result`. */
  previous: PreviousExamValue | null
  /** Always OBSERVED — a reassessment item is only ever created from something the clinician already recorded, never a system suggestion. */
  source: Provenance
  /** Today's result. Always starts NOT_YET_CHECKED regardless of `previous.status`. */
  result: PhysicalExamSuggestionResult
}

export function reassessmentExamItemFromPrevious(
  id: string,
  title: string,
  previous: PreviousExamValue | null,
): ReassessmentExamItem {
  return {
    id,
    title,
    previous,
    source: 'OBSERVED',
    result: emptyExamResult(),
  }
}

export function isReassessmentPending(item: ReassessmentExamItem): boolean {
  return item.result.status === 'NOT_YET_CHECKED'
}

/**
 * Groups a Structured Reassessment's exam-recheck items plus the
 * clinician's own final reassessment note (round 3 Phase E/F). Pain uses
 * this for regional exam items; Herbal uses the identical shape for
 * tongue/pulse/abdomen-style observation rechecks — both are "an item the
 * clinician already recorded once, now explicitly flagged to recheck."
 */
export type StructuredReassessment = {
  items: ReassessmentExamItem[]
  /** 최종 재평가 — 원장이 직접 입력, 시행/치료 반응을 요약. */
  finalReassessmentNote: string
  recordedAt: string | null
}

export function emptyStructuredReassessment(): StructuredReassessment {
  return { items: [], finalReassessmentNote: '', recordedAt: null }
}
