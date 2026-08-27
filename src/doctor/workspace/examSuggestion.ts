/**
 * PhysicalExamSuggestion — reusable decision-support structure for the Pain
 * Workspace's "지금 확인할 것" section (PR #24 Phase 3.2).
 *
 * IMPORTANT: this file defines the SHAPE only. It contains no rule that
 * maps a patient answer to a specific exam recommendation — that mapping is
 * an unresolved clinical decision (see docs/clinical-decision-tables/
 * PAIN_EXAM_RECOMMENDATION_TEMPLATE.md). Any PhysicalExamSuggestion[] used
 * in this codebase today is either (a) synthetic preview data clearly
 * labeled SYNTHETIC, or (b) empty. Do not add a function here that
 * generates suggestions from a DoctorPayload.
 */
import type { ExamCheckStatus, Laterality, Provenance } from './provenance'

export type ExamPriority = 'MUST_CHECK' | 'CONTEXTUAL'

export const EXAM_PRIORITY_LABEL: Record<ExamPriority, string> = {
  MUST_CHECK: '반드시 확인',
  CONTEXTUAL: '문진에 따라 추가 확인',
}

export type ExamSuggestionReason = {
  text: string
  /** Where this reasoning fact came from — almost always PATIENT_FACT or DERIVED. */
  provenance: Provenance
}

export type PhysicalExamSuggestionResult = {
  status: ExamCheckStatus
  laterality: Laterality | null
  /** Free-text clinician note, optional. Never auto-filled. */
  note: string
  /** ISO timestamp of when the clinician entered this result, null if not yet checked. */
  recordedAt: string | null
}

export function emptyExamResult(): PhysicalExamSuggestionResult {
  return { status: 'NOT_YET_CHECKED', laterality: null, note: '', recordedAt: null }
}

export type PhysicalExamSuggestion = {
  id: string
  title: string
  priority: ExamPriority
  /** Why this is being suggested — patient/derived facts only, never a diagnosis. */
  reasonFacts: ExamSuggestionReason[]
  /** Always SUGGESTED for anything actually driving today's UI (see file header). */
  source: Provenance
  result: PhysicalExamSuggestionResult
}

export function isExamPending(item: PhysicalExamSuggestion): boolean {
  return item.result.status === 'NOT_YET_CHECKED'
}

/** Groups suggestions for the A/B/C display structure Phase 3.2 asks for. */
export function groupExamSuggestions(items: PhysicalExamSuggestion[]): {
  mustCheck: PhysicalExamSuggestion[]
  contextual: PhysicalExamSuggestion[]
  stillPending: PhysicalExamSuggestion[]
} {
  return {
    mustCheck: items.filter((i) => i.priority === 'MUST_CHECK'),
    contextual: items.filter((i) => i.priority === 'CONTEXTUAL'),
    stillPending: items.filter(isExamPending),
  }
}
