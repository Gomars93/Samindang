/**
 * RehabSuggestion — reusable decision-support structure for rehabilitation/
 * home-exercise recommendations (round 3 Phase I), mirroring
 * examSuggestion.ts/patternCandidate.ts exactly.
 *
 * IMPORTANT: this file defines the SHAPE only. It contains no rule that
 * maps a patient fact or exam finding to a specific rehab/exercise
 * recommendation. Do not add a function HERE that generates suggestions
 * from a DoctorPayload — that responsibility, when it exists at all, lives
 * in its own separate, clinically-reviewed module.
 *
 * LBP v1 Batch 2 is the one narrow, CLOSED-and-documented exception: for
 * LBP records only, `lbpExerciseRecommendation.ts` generates
 * `RehabSuggestion[]` from `DoctorPayload` + clinician judgment + workspace
 * state, gated by `lbpExerciseEligibility.ts`'s Core-20 rules (Opus bounded
 * validation, `docs/LBP_EXERCISE_ELIGIBILITY_OPUS_BOUNDED_VALIDATION_v0.1.md`)
 * — never diagnosis-based, never a numeric score, never touching this file's
 * shape. Any other profile/region's `RehabSuggestion[]` in this codebase is
 * still either (a) synthetic preview data clearly labeled SYNTHETIC, or (b)
 * empty — the constraint above stands for everything that is not the
 * documented LBP exception.
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
