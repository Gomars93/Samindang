/**
 * Generic support/contradiction/unknown presentation framework, shared by
 * both the Pain and Herbal workspaces (PR #24 Phase 5).
 *
 * This module classifies ONLY pre-supplied items — it never inspects a
 * DoctorPayload or invents a new support/contradiction judgment. Callers
 * (workspace fixtures today; a future approved rule engine eventually)
 * decide what each EvidenceItem's kind is; this module just groups and
 * counts for display.
 */
import type { Provenance } from './provenance'

export type EvidenceKind = 'SUPPORT' | 'CONTRADICTION' | 'UNKNOWN'

export const EVIDENCE_KIND_LABEL: Record<EvidenceKind, string> = {
  SUPPORT: '지지',
  CONTRADICTION: '반증 / 주의',
  UNKNOWN: '확인 필요',
}

export type EvidenceItem = {
  id: string
  text: string
  kind: EvidenceKind
  /** Where this evidence item itself came from — PATIENT_FACT/DERIVED/OBSERVED are the expected values. */
  provenance: Provenance
}

export type EvidenceGroups = {
  support: EvidenceItem[]
  contradiction: EvidenceItem[]
  unknown: EvidenceItem[]
}

/** Pure grouping of already-classified items — no new classification happens here. */
export function groupEvidence(items: EvidenceItem[]): EvidenceGroups {
  return {
    support: items.filter((i) => i.kind === 'SUPPORT'),
    contradiction: items.filter((i) => i.kind === 'CONTRADICTION'),
    unknown: items.filter((i) => i.kind === 'UNKNOWN'),
  }
}
