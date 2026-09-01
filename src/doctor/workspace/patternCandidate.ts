/**
 * HerbalPatternCandidate — reusable decision-support structure for the
 * Herbal Workspace's "핵심 병기 후보" section (PR #24 Phase 4.2).
 *
 * IMPORTANT: this file defines the SHAPE only, exactly like
 * examSuggestion.ts. It contains no 病機/pattern-inference engine. Any
 * HerbalPatternCandidate[] used today is either synthetic preview data
 * clearly labeled SYNTHETIC, or empty. See
 * docs/clinical-decision-tables/HERBAL_PATTERN_CANDIDATE_TEMPLATE.md for
 * where the real mapping will eventually be authored by a clinician.
 */
import type { Provenance } from './provenance'

export type PatternCandidateStatus = 'PENDING_REVIEW' | 'ACCEPTED' | 'REJECTED' | 'HELD'

export const PATTERN_CANDIDATE_STATUS_LABEL: Record<PatternCandidateStatus, string> = {
  PENDING_REVIEW: '검토 대기',
  ACCEPTED: '원장 채택',
  REJECTED: '원장 배제',
  HELD: '보류',
}

export type PatternEvidenceFact = {
  text: string
  provenance: Provenance
}

export type HerbalPatternCandidate = {
  id: string
  /** 후보명 — e.g. a clearly-marked synthetic example label, never asserted as a diagnosis. */
  displayName: string
  supportingFacts: PatternEvidenceFact[]
  contradictingFacts: PatternEvidenceFact[]
  /** 아직 확인할 것 — checks that would help confirm/rule out this candidate. */
  unknownChecks: string[]
  /** Always SUGGESTED for anything actually driving today's UI (see file header). */
  source: Provenance
  status: PatternCandidateStatus
  /** Optional clinician note explaining the accept/reject/hold decision. */
  clinicianNote: string
}

export function isPatternCandidatePending(item: HerbalPatternCandidate): boolean {
  return item.status === 'PENDING_REVIEW'
}
