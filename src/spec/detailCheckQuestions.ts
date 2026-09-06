/**
 * 플로우 정렬 5/5 (세부문진): the fixed initial-questionnaire items a revisit
 * link re-asks once the clinician's own reassessment plan is due (server/
 * detailCheck.js decides WHEN; this module only resolves WHAT to show, by
 * id, from the one source of wording -- coreSpec). Shared by the patient
 * screen (FollowUpScreen.tsx renders them) and the doctor card
 * (MicroFollowUpCard.tsx labels today's answer next to the first-visit one).
 *
 * Fail closed: an id the spec does not know is skipped, never rendered as a
 * blank question. Only single_choice and numeric_scale are supported --
 * those are the only input kinds the four planned items use; anything else
 * is skipped for the same reason.
 */
import { ALL_QUESTIONS } from './coreSpec'
import type { Option, Question } from '../types'

export type DetailCheckQuestion =
  | { id: string; question: string; kind: 'single_choice'; options: Option[] }
  | { id: string; question: string; kind: 'numeric_scale'; scale: { min: number; max: number; minLabel: string; maxLabel: string } }

const BY_ID: ReadonlyMap<string, Question> = new Map(ALL_QUESTIONS.map((q) => [q.id, q]))

export function resolveDetailCheckQuestions(ids: readonly string[]): DetailCheckQuestion[] {
  const out: DetailCheckQuestion[] = []
  for (const id of ids) {
    const q = BY_ID.get(id)
    if (!q) continue
    if (q.input === 'single_choice' && Array.isArray(q.options) && q.options.length > 0) {
      out.push({ id, question: q.question, kind: 'single_choice', options: q.options })
    } else if (q.input === 'numeric_scale' && q.scale) {
      out.push({ id, question: q.question, kind: 'numeric_scale', scale: q.scale })
    }
  }
  return out
}

/** Doctor-side label for a stored raw value: option label for choices, `n/10`-style for scales, the raw string otherwise. */
export function describeDetailCheckValue(id: string, value: string): string {
  const q = BY_ID.get(id)
  const v = value.trim()
  if (v === '') return '응답 없음'
  if (!q) return v
  if (q.input === 'single_choice' && Array.isArray(q.options)) {
    return q.options.find((o) => o.value === v)?.label ?? v
  }
  if (q.input === 'numeric_scale' && q.scale) return `${v}/${q.scale.max}`
  return v
}

export function detailCheckQuestionText(id: string): string {
  return BY_ID.get(id)?.question ?? id
}
