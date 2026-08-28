/**
 * Doctor Clinical Workspace — clinician-entered state persistence (PR #24
 * round 2 Phase 2, extended round 3 Phases A/B/E/H/I). Pure types +
 * (de)serialization helpers, no React, no network code (that lives in
 * src/lib/serverClient.ts, mirroring the existing saveJudgment/
 * getSubmission pattern).
 *
 * WorkspaceState bundles every piece of clinician-entered Doctor Workspace
 * state into a single object keyed to the server's existing submission
 * record (the same `id` saveJudgment already uses), NOT to session_id and
 * NOT to any patient-identifying field (name/phone/birth date). See
 * DECISIONS.md's round-2 Phase-2 entry for why: the existing store.js
 * record `id` is the only field this codebase treats as a stable,
 * collision-free identity boundary.
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
import type { FollowUpTarget, HerbalFinalAssessment, PainFinalAssessment, NextReassessmentPlan } from './finalAssessment'
import { emptyPainFinalAssessment, emptyHerbalFinalAssessment, emptyNextReassessmentPlan } from './finalAssessment'
import type { PainCarePlan, HerbalCarePlan } from './carePlan'
import { emptyPainCarePlan, emptyHerbalCarePlan } from './carePlan'
import type { StructuredReassessment } from './reassessmentExam'
import { emptyStructuredReassessment } from './reassessmentExam'
import type { RehabSuggestion } from './rehabSuggestion'
import type { AdditionalConcernPromotionState } from './additionalConcern'
import { emptyAdditionalConcernPromotion } from './additionalConcern'

/**
 * Bumped only if a future change makes an old persisted shape unreadable.
 * Deserialization below is defensive (missing/malformed fields fall back
 * to empty, never throw) specifically so an old record never blocks a
 * clinician from opening a submission. Round 3 fields are all additive —
 * a round-2 record with no round-3 fields deserializes to the round-3
 * empty defaults for those fields, so schema_version itself does not need
 * to gate anything; it is kept only as a human-readable trace.
 */
export const WORKSPACE_STATE_SCHEMA_VERSION = '1.1.0'

export type WorkspaceState = {
  schema_version: string
  painExamSuggestions: PhysicalExamSuggestion[]
  painFinalAssessment: PainFinalAssessment
  painFollowUpTargets: FollowUpTarget[]
  herbalPatternCandidates: HerbalPatternCandidate[]
  herbalClinicianObservations: ClinicianObservationItem[]
  herbalFinalAssessment: HerbalFinalAssessment
  herbalFollowUpTargets: FollowUpTarget[]
  /** Round 3 Phase A: clinician-owned Care Plan, one per profile. */
  painCarePlan: PainCarePlan
  herbalCarePlan: HerbalCarePlan
  /** Round 3 Phase B: when the NEXT Structured Reassessment should happen — distinct from ordinary follow-up targets. */
  nextReassessmentPlan: NextReassessmentPlan
  /** Round 3 Phase E: today's structured recheck of previously-recorded items, one per profile. */
  painReassessment: StructuredReassessment
  herbalReassessment: StructuredReassessment
  /** Round 3 Phase I: rehab/home-exercise suggestions. Always [] in production until clinician-approved mappings exist. */
  painRehabSuggestions: RehabSuggestion[]
  /** Round 3 Phase H: clinician's own "look at this Additional concern more closely today" note — never mutates routing. */
  additionalConcernPromotion: AdditionalConcernPromotionState
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
    painCarePlan: emptyPainCarePlan(),
    herbalCarePlan: emptyHerbalCarePlan(),
    nextReassessmentPlan: emptyNextReassessmentPlan(),
    painReassessment: emptyStructuredReassessment(),
    herbalReassessment: emptyStructuredReassessment(),
    painRehabSuggestions: [],
    additionalConcernPromotion: emptyAdditionalConcernPromotion(),
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
 * `undefined`, a round-2-only shape with no round-3 fields at all, or a
 * completely unrelated JSON shape) degrades to emptyWorkspaceState()
 * field-by-field rather than blocking the whole screen — a corrupt
 * `herbalCarePlan` must never prevent the clinician from seeing their
 * still-good `painExamSuggestions`, and a round-2 record opened after this
 * upgrade must load with clean, empty round-3 fields rather than throwing.
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
    painCarePlan: isRecord(raw.painCarePlan)
      ? { ...empty.painCarePlan, ...(raw.painCarePlan as Partial<PainCarePlan>) }
      : empty.painCarePlan,
    herbalCarePlan: isRecord(raw.herbalCarePlan)
      ? { ...empty.herbalCarePlan, ...(raw.herbalCarePlan as Partial<HerbalCarePlan>) }
      : empty.herbalCarePlan,
    nextReassessmentPlan: isRecord(raw.nextReassessmentPlan)
      ? { ...empty.nextReassessmentPlan, ...(raw.nextReassessmentPlan as Partial<NextReassessmentPlan>) }
      : empty.nextReassessmentPlan,
    painReassessment: isRecord(raw.painReassessment)
      ? {
          ...empty.painReassessment,
          ...(raw.painReassessment as Partial<StructuredReassessment>),
          items: isArray((raw.painReassessment as Record<string, unknown>).items)
            ? ((raw.painReassessment as Record<string, unknown>).items as StructuredReassessment['items'])
            : empty.painReassessment.items,
        }
      : empty.painReassessment,
    herbalReassessment: isRecord(raw.herbalReassessment)
      ? {
          ...empty.herbalReassessment,
          ...(raw.herbalReassessment as Partial<StructuredReassessment>),
          items: isArray((raw.herbalReassessment as Record<string, unknown>).items)
            ? ((raw.herbalReassessment as Record<string, unknown>).items as StructuredReassessment['items'])
            : empty.herbalReassessment.items,
        }
      : empty.herbalReassessment,
    painRehabSuggestions: isArray(raw.painRehabSuggestions)
      ? (raw.painRehabSuggestions as RehabSuggestion[])
      : empty.painRehabSuggestions,
    additionalConcernPromotion: isRecord(raw.additionalConcernPromotion)
      ? { ...empty.additionalConcernPromotion, ...(raw.additionalConcernPromotion as Partial<AdditionalConcernPromotionState>) }
      : empty.additionalConcernPromotion,
    updated_at: typeof raw.updated_at === 'string' ? raw.updated_at : null,
  }
}

/** True only when at least one field actually differs — used to skip a no-op save. */
export function workspaceStateEquals(a: WorkspaceState, b: WorkspaceState): boolean {
  const { updated_at: _a, ...restA } = a
  const { updated_at: _b, ...restB } = b
  return JSON.stringify(restA) === JSON.stringify(restB)
}
