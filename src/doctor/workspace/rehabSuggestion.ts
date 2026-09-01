/**
 * RehabSuggestion — reusable decision-support structure for rehabilitation/
 * home-exercise recommendations (round 3 Phase I), mirroring
 * examSuggestion.ts/patternCandidate.ts exactly.
 *
 * IMPORTANT: this file defines the SHAPE only. It contains no rule that
 * maps a patient fact or exam finding to a specific rehab/exercise
 * recommendation — that mapping is an unresolved clinical decision. Any
 * RehabSuggestion[] used in this codebase today is either (a) synthetic
 * preview data clearly labeled SYNTHETIC, or (b) empty. Do not add a
 * function here that generates suggestions from a DoctorPayload.
 *
 * A suggestion never becomes part of the patient-facing Care Plan unless
 * the clinician explicitly accepts it AND explicitly adopts it into the
 * Care Plan's home action plan text (same "adopt, never automatic" pattern
 * as HerbalPatternCandidate -> HerbalFinalAssessment).
 */
import type { Provenance } from './provenance'

export type RehabSuggestionStatus = 'SUGGESTED' | 'ACCEPTED' | 'HELD' | 'REJECTED'

export const REHAB_SUGGESTION_STATUS_LABEL: Record<RehabSuggestionStatus, string> = {
  SUGGESTED: '제안됨',
  ACCEPTED: '원장 채택',
  HELD: '보류',
  REJECTED: '원장 배제',
}

export type RehabSourceFact = {
  text: string
  provenance: Provenance
}

export type RehabSuggestion = {
  id: string
  title: string
  goal: string
  rationale: string
  sourceFacts: RehabSourceFact[]
  /** Only populated once a clinician-approved rule authors real contraindication facts. */
  contraindicationFacts: RehabSourceFact[]
  /** Always SUGGESTED for anything actually driving today's UI (see file header). */
  source: Provenance
  status: RehabSuggestionStatus
  /** Clinician's own final wording — starts empty, never pre-filled from `title`/`goal`. */
  clinicianFinalInstruction: string
}

export function isRehabSuggestionPending(item: RehabSuggestion): boolean {
  return item.status === 'SUGGESTED'
}
