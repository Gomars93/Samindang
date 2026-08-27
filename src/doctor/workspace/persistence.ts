/**
 * Doctor Clinical Workspace — clinician-entered state persistence (PR #24
 * round 2, Phase 2). Pure types + (de)serialization helpers, no React, no
 * network code (that lives in src/lib/serverClient.ts, mirroring the
 * existing saveJudgment/getSubmission pattern).
 *
 * WorkspaceState bundles every piece of clinician-entered Doctor Workspace
 * state — exam results, herbal observations, pattern-candidate review
 * status, both Final Assessment cards, and both follow-up target lists —
 * into a single object keyed to the server's existing submission record
 * (the same `id` saveJudgment already uses), NOT to session_id and NOT to
 * any patient-identifying field (name/phone/birth date). See
 * DECISIONS.md's Phase-2 entry for why: the existing store.js record `id`
 * is the only field this codebase treats as a stable, collision-free
 * identity boundary — session_id is client-generated and, while the server
 * happens to dedupe on it today, it is not the field the server API keys
 * persistence writes by (PUT /api/submissions/:id/workspace takes the
 * server record id in the URL, exactly like the existing judgment route).
 *
 * This is additive to, and does not replace, ClinicianJudgment
 * (src/doctor/judgment.ts) — that remains the untouched Myungri
 * shadow-mode audit trail plus the two FROZEN-linked objective exam
 * fields. WorkspaceState is a sibling record field on the same submission,
 * saved through its own route, never mixed with judgment's read-modify-
 * write cycle.
 */
import type { PhysicalExamSuggestion } from './examSuggestion'
import type { HerbalPatternCandidate } from './patternCandidate'
import type { ClinicianObservationItem } from './clinicianObservation'
import type { FollowUpTarget, HerbalFinalAssessment, PainFinalAssessment } from './finalAssessment'
import { emptyPainFinalAssessment, emptyHerbalFinalAssessment } from './finalAssessment'

/**
 * Bumped only if a future change makes an old persisted shape unreadable.
 * Deserialization below is defensive (missing/malformed fields fall back
 * to empty, never throw) specifically so an old record never blocks a
 * clinician from opening a submission.
 */
export const WORKSPACE_STATE_SCHEMA_VERSION = '1.0.0'

export type WorkspaceState = {
  schema_version: string
  painExamSuggestions: PhysicalExamSuggestion[]
  painFinalAssessment: PainFinalAssessment
  painFollowUpTargets: FollowUpTarget[]
  herbalPatternCandidates: HerbalPatternCandidate[]
  herbalClinicianObservations: ClinicianObservationItem[]
  herbalFinalAssessment: HerbalFinalAssessment
  herbalFollowUpTargets: FollowUpTarget[]
  /** Set by the client immediately before each save attempt (not by the server). */
  updated_at: string | null
}

export function emptyWorkspaceState(): WorkspaceState {
  return {
    schema_version: WORKSPACE_STATE_SCHEMA_VERSION,
    painExamSuggestions: [],
    painFinalAssessment: emptyPainFinalAssessment(),
    painFollowUpTargets: [],
    herbalPatternCandidates: [],
    herbalClinicianObservations: [],
    herbalFinalAssessment: emptyHerbalFinalAssessment(),
    herbalFollowUpTargets: [],
    updated_at: null,
  }
}

function isArray(v: unknown): v is unknown[] {
  return Array.isArray(v)
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

/**
 * Never throws. A malformed/partial/legacy payload (including `null`,
 * `undefined`, or a completely unrelated JSON shape) degrades to
 * emptyWorkspaceState() field-by-field rather than blocking the whole
 * screen — a corrupt `herbalFinalAssessment` must never prevent the
 * clinician from seeing their still-good `painExamSuggestions`.
 */
export function deserializeWorkspaceState(raw: unknown): WorkspaceState {
  const empty = emptyWorkspaceState()
  if (!isRecord(raw)) return empty
  return {
    schema_version: typeof raw.schema_version === 'string' ? raw.schema_version : empty.schema_version,
    painExamSuggestions: isArray(raw.painExamSuggestions)
      ? (raw.painExamSuggestions as PhysicalExamSuggestion[])
      : empty.painExamSuggestions,
    painFinalAssessment: isRecord(raw.painFinalAssessment)
      ? { ...empty.painFinalAssessment, ...(raw.painFinalAssessment as Partial<PainFinalAssessment>) }
      : empty.painFinalAssessment,
    painFollowUpTargets: isArray(raw.painFollowUpTargets)
      ? (raw.painFollowUpTargets as FollowUpTarget[])
      : empty.painFollowUpTargets,
    herbalPatternCandidates: isArray(raw.herbalPatternCandidates)
      ? (raw.herbalPatternCandidates as HerbalPatternCandidate[])
      : empty.herbalPatternCandidates,
    herbalClinicianObservations: isArray(raw.herbalClinicianObservations)
      ? (raw.herbalClinicianObservations as ClinicianObservationItem[])
      : empty.herbalClinicianObservations,
    herbalFinalAssessment: isRecord(raw.herbalFinalAssessment)
      ? { ...empty.herbalFinalAssessment, ...(raw.herbalFinalAssessment as Partial<HerbalFinalAssessment>) }
      : empty.herbalFinalAssessment,
    herbalFollowUpTargets: isArray(raw.herbalFollowUpTargets)
      ? (raw.herbalFollowUpTargets as FollowUpTarget[])
      : empty.herbalFollowUpTargets,
    updated_at: typeof raw.updated_at === 'string' ? raw.updated_at : null,
  }
}

/** True only when at least one field actually differs — used to skip a no-op save. */
export function workspaceStateEquals(a: WorkspaceState, b: WorkspaceState): boolean {
  const { updated_at: _a, ...restA } = a
  const { updated_at: _b, ...restB } = b
  return JSON.stringify(restA) === JSON.stringify(restB)
}
