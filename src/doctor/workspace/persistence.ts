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
import { emptyExamResult, type PhysicalExamSuggestion } from './examSuggestion'
import type { HerbalPatternCandidate } from './patternCandidate'
import { emptyClinicianObservation, type ClinicianObservationItem } from './clinicianObservation'
import {
  followUpTarget,
  type FollowUpTarget,
  type HerbalFinalAssessment,
  type PainFinalAssessment,
  type NextReassessmentPlan,
} from './finalAssessment'
import { emptyPainFinalAssessment, emptyHerbalFinalAssessment, emptyNextReassessmentPlan } from './finalAssessment'
import type { PainCarePlan, HerbalCarePlan } from './carePlan'
import { emptyPainCarePlan, emptyHerbalCarePlan } from './carePlan'
import { reassessmentExamItemFromPrevious, type StructuredReassessment, type PreviousExamValue } from './reassessmentExam'
import { emptyStructuredReassessment } from './reassessmentExam'
import type { RehabSuggestion } from './rehabSuggestion'
import type { AdditionalConcernPromotionState } from './additionalConcern'
import { emptyAdditionalConcernPromotion } from './additionalConcern'
import { sanitizeArray, sanitizeShape, isSanitizeRecord } from './sanitize'

const FOLLOW_UP_TARGET_TEMPLATE: FollowUpTarget = followUpTarget('', '')
const EXAM_SUGGESTION_TEMPLATE: PhysicalExamSuggestion = {
  id: '',
  title: '',
  priority: 'MUST_CHECK',
  reasonFacts: [],
  source: 'SUGGESTED',
  result: emptyExamResult(),
}
const PATTERN_CANDIDATE_TEMPLATE: HerbalPatternCandidate = {
  id: '',
  displayName: '',
  supportingFacts: [],
  contradictingFacts: [],
  unknownChecks: [],
  source: 'SUGGESTED',
  status: 'PENDING_REVIEW',
  clinicianNote: '',
}
const CLINICIAN_OBSERVATION_TEMPLATE: ClinicianObservationItem = emptyClinicianObservation('', 'OTHER', '')
const REHAB_SUGGESTION_TEMPLATE: RehabSuggestion = {
  id: '',
  title: '',
  goal: '',
  rationale: '',
  sourceFacts: [],
  contraindicationFacts: [],
  source: 'SUGGESTED',
  status: 'SUGGESTED',
  clinicianFinalInstruction: '',
}
const REASSESSMENT_ITEM_TEMPLATE: StructuredReassessment['items'][number] = reassessmentExamItemFromPrevious(
  '',
  '',
  null,
)
const PREVIOUS_EXAM_VALUE_TEMPLATE: PreviousExamValue = {
  status: 'NOT_YET_CHECKED',
  laterality: null,
  note: '',
  recordedAt: null,
}

/**
 * 13차 독립 리뷰 자체 회귀분석 (workspace-round3.spec.mjs의 기존 round-trip
 * 테스트가 발견): `sanitizeShape`의 null-템플릿 분기는 `string | null`
 * 필드(recordedAt 등)만 염두에 두고 만들어져 rawVal이 string/number/null일
 * 때만 통과시킨다 -- `previous: PreviousExamValue | null`처럼 템플릿
 * 기본값 자체가 null인 "중첩 객체 또는 null" 필드는 raw가 진짜 객체여도
 * (예: {status:'POSITIVE', laterality:'RIGHT', ...}) 이 분기를 통과하지
 * 못해 조용히 null로 떨어뜨린다 -- 즉 HIGH-2 수정 자체가 매 요청마다
 * previous(이전 소견의 raw fact)를 지워버리는 새 정보 손실을 만들었다.
 * previous는 여기서만 쓰이는 구체적 shape을 알고 있으므로 별도로
 * 처리한다.
 */
function sanitizeReassessmentItem(raw: unknown): StructuredReassessment['items'][number] {
  const item = sanitizeShape(REASSESSMENT_ITEM_TEMPLATE, raw)
  const rawPrevious = isSanitizeRecord(raw) ? raw.previous : undefined
  return {
    ...item,
    previous: isSanitizeRecord(rawPrevious) ? sanitizeShape(PREVIOUS_EXAM_VALUE_TEMPLATE, rawPrevious) : null,
  }
}

/** items[]는 element별로 sanitize하고, 나머지 필드는 sanitizeShape에 맡긴다. */
function sanitizeStructuredReassessment(empty: StructuredReassessment, raw: unknown): StructuredReassessment {
  const base = sanitizeShape(empty, raw)
  const rawItems = isSanitizeRecord(raw) ? raw.items : undefined
  return { ...base, items: Array.isArray(rawItems) ? rawItems.map(sanitizeReassessmentItem) : [] }
}

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
    painExamSuggestions: sanitizeArray(EXAM_SUGGESTION_TEMPLATE, raw.painExamSuggestions),
    painFinalAssessment: sanitizeShape(empty.painFinalAssessment, raw.painFinalAssessment),
    painFollowUpTargets: sanitizeArray(FOLLOW_UP_TARGET_TEMPLATE, raw.painFollowUpTargets),
    herbalPatternCandidates: sanitizeArray(PATTERN_CANDIDATE_TEMPLATE, raw.herbalPatternCandidates),
    herbalClinicianObservations: sanitizeArray(CLINICIAN_OBSERVATION_TEMPLATE, raw.herbalClinicianObservations),
    herbalFinalAssessment: sanitizeShape(empty.herbalFinalAssessment, raw.herbalFinalAssessment),
    herbalFollowUpTargets: sanitizeArray(FOLLOW_UP_TARGET_TEMPLATE, raw.herbalFollowUpTargets),
    painCarePlan: sanitizeShape(empty.painCarePlan, raw.painCarePlan),
    herbalCarePlan: sanitizeShape(empty.herbalCarePlan, raw.herbalCarePlan),
    nextReassessmentPlan: sanitizeShape(empty.nextReassessmentPlan, raw.nextReassessmentPlan),
    painReassessment: sanitizeStructuredReassessment(empty.painReassessment, raw.painReassessment),
    herbalReassessment: sanitizeStructuredReassessment(empty.herbalReassessment, raw.herbalReassessment),
    painRehabSuggestions: sanitizeArray(REHAB_SUGGESTION_TEMPLATE, raw.painRehabSuggestions),
    additionalConcernPromotion: sanitizeShape(empty.additionalConcernPromotion, raw.additionalConcernPromotion),
    updated_at: typeof raw.updated_at === 'string' ? raw.updated_at : null,
  }
}

/** True only when at least one field actually differs — used to skip a no-op save. */
export function workspaceStateEquals(a: WorkspaceState, b: WorkspaceState): boolean {
  const { updated_at: _a, ...restA } = a
  const { updated_at: _b, ...restB } = b
  return JSON.stringify(restA) === JSON.stringify(restB)
}

/**
 * Round 18 (stale-write conflict wiring): the outcome contract every
 * onSaveWorkspace/onSaveVisitWorkspace/onSaveJudgment caller returns.
 * `conflict` is present only for the specific case server/store.js's
 * StaleWriteError models (a caller-supplied expectedUpdatedAt precondition
 * did not match) -- carrying the server's CURRENT record so the caller can
 * offer an explicit reload without a second round trip, per this round's
 * "server-authoritative state wins after conflicts, never auto-merge"
 * directive. A plain network/other failure returns `{ ok: false }` with no
 * `conflict` field, preserving the pre-existing "will retry on next edit"
 * behavior untouched.
 */
export type WorkspaceSaveOutcome =
  | { ok: true; updatedAt: string }
  | { ok: false; conflict: { current: WorkspaceState; currentUpdatedAt: string } }
  | { ok: false; conflict?: undefined }
