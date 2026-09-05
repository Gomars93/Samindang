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
import { emptyExamResult, type PhysicalExamSuggestion, type ExamSuggestionReason } from './examSuggestion'
import type { HerbalPatternCandidate, PatternEvidenceFact } from './patternCandidate'
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
import type { RehabSuggestion, RehabSourceFact } from './rehabSuggestion'
import type { AdditionalConcernPromotionState } from './additionalConcern'
import { emptyAdditionalConcernPromotion } from './additionalConcern'
import type { Provenance } from './provenance'
import { sanitizeArray, sanitizeShape, isSanitizeRecord, sanitizeStringArray } from './sanitize'
import { isValidLbpDirectionalResponse, type LbpDirectionalResponse } from './lbpExamSuggestions'
import { emptyLbpWorkingHypothesis, sanitizeLbpWorkingHypothesis, type LbpWorkingHypothesis } from './lbpWorkingHypothesis'

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
 * 14차 독립 리뷰 HIGH-1: `ExamSuggestionReason`/`PatternEvidenceFact`/
 * `RehabSourceFact`는 전부 동일한 `{text, provenance}` shape이다 -- exam
 * suggestion/pattern candidate/rehab suggestion 템플릿 안에 중첩된
 * `reasonFacts`/`supportingFacts`/`contradictingFacts`/`sourceFacts`/
 * `contraindicationFacts` 배열은 `sanitizeShape`의 배열 분기(컨테이너만
 * 확인, 원소는 그대로 통과)를 거치므로 원소가 wrong-typed면(`[null]`,
 * `[{}]`) `f.text`에서 크래시하거나("Cannot read properties of null")
 * React가 객체를 자식으로 렌더하려다 던졌다("Objects are not valid as a
 * React child") -- `previous`와 동일한 클래스의 "중첩 배열은 sanitizeShape가
 * 검증하지 못한다" 공백이다. 원소별로 `sanitizeShape`를 명시적으로 적용.
 */
const FACT_TEMPLATE: { text: string; provenance: Provenance } = {
  text: '확인 필요(값 형식 오류)',
  provenance: 'SUGGESTED',
}

function sanitizeExamSuggestion(raw: unknown): PhysicalExamSuggestion {
  const item = sanitizeShape(EXAM_SUGGESTION_TEMPLATE, raw)
  const r = isSanitizeRecord(raw) ? raw : {}
  return { ...item, reasonFacts: sanitizeArray(FACT_TEMPLATE, r.reasonFacts) as ExamSuggestionReason[] }
}

function sanitizePatternCandidate(raw: unknown): HerbalPatternCandidate {
  const item = sanitizeShape(PATTERN_CANDIDATE_TEMPLATE, raw)
  const r = isSanitizeRecord(raw) ? raw : {}
  return {
    ...item,
    supportingFacts: sanitizeArray(FACT_TEMPLATE, r.supportingFacts) as PatternEvidenceFact[],
    contradictingFacts: sanitizeArray(FACT_TEMPLATE, r.contradictingFacts) as PatternEvidenceFact[],
    unknownChecks: sanitizeStringArray(r.unknownChecks),
  }
}

function sanitizeRehabSuggestion(raw: unknown): RehabSuggestion {
  const item = sanitizeShape(REHAB_SUGGESTION_TEMPLATE, raw)
  const r = isSanitizeRecord(raw) ? raw : {}
  return {
    ...item,
    sourceFacts: sanitizeArray(FACT_TEMPLATE, r.sourceFacts) as RehabSourceFact[],
    contraindicationFacts: sanitizeArray(FACT_TEMPLATE, r.contraindicationFacts) as RehabSourceFact[],
  }
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
  /**
   * LBP v1 Batch 1 (G3): clinician-observed lumbar-movement direction
   * response. Default/invalid/legacy-missing always degrades to
   * 'NOT_ASSESSED' — never rendered or persisted as a normal/negative
   * value. Additive field, does NOT bump WORKSPACE_STATE_SCHEMA_VERSION.
   */
  lbpDirectionalResponse: LbpDirectionalResponse
  /*
   * 2026-09-05: `lbpConfirmedCapabilities`/`lbpDeniedCapabilities`를 제거했다.
   * 준비조건 게이트와 함께 사라진 필드다 — 두 배열은 EMR·재진 이어받기·환자
   * 안내문 어디에도 도달한 적이 없고(확인함), 유일한 소비자가 같은 화면의
   * 게이트였다. 옛 기록에 남아 있는 값은 역직렬화에서 조용히 무시된다(전체
   * shape을 매번 새로 만들므로 안전하다). 폐기된 PO 결정 CD-1/CD-3의 이유는
   * `DECISIONS.md` 2026-09-05 "준비조건 게이트 제거" 항목 참고.
   */
  /**
   * LBP v1 Batch 2.5c (G16, `docs/LBP_PRODUCTION_V1_MINIMAL_ARCHITECTURE_v0.1.md`
   * §11.2): the clinician's own directly-selected support level per pattern
   * — no score, no computed value, ever (see `lbpWorkingHypothesis.ts`'s
   * file header). Default `emptyLbpWorkingHypothesis()` (every pattern
   * 'UNJUDGED'). Additive field, does NOT bump WORKSPACE_STATE_SCHEMA_VERSION
   * — a legacy record with no field at all deserializes to the same empty
   * default, same convention as `lbpDirectionalResponse`/
   * `lbpConfirmedCapabilities` above.
   */
  lbpWorkingHypothesis: LbpWorkingHypothesis
  /**
   * 2026-09-05 (원장 결정, `DECISIONS.md` 같은 날짜 "준비조건 두 층" 항목):
   * 원장이 확정한 운동 단계. `null` = 아직 확정 안 함(기본).
   * 0 = 보호/안정(능동 운동 미처방), 1~3 = TBC 단계.
   *
   * 이 값이 하는 일: (1) 후보 운동을 이 단계 이하로 필터, (2) C층 준비조건
   * 12개를 이 단계에서 추정(`lbpCapabilityLayer.ts`). **제안값이 아니라
   * 확정값만 저장한다** — 제안(`suggestLbpExerciseStage`)은 매 렌더 재계산이고
   * 여기 쓰이지 않는다("adopt, never automatic").
   *
   * Additive field, does NOT bump WORKSPACE_STATE_SCHEMA_VERSION — 옛 기록은
   * `null`로 읽혀 필터·추정 모두 꺼진 기존 동작이 된다. 0~3 정수가 아닌 값은
   * 전부 `null`.
   */
  lbpConfirmedStage: 0 | 1 | 2 | 3 | null
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
    lbpDirectionalResponse: 'NOT_ASSESSED',
    lbpWorkingHypothesis: emptyLbpWorkingHypothesis(),
    lbpConfirmedStage: null,
    updated_at: null,
  }
}

/** 0~3 정수만 통과. 문자열 '1', 1.5, -1, 4, null 등은 전부 null. */
export function sanitizeLbpConfirmedStage(v: unknown): 0 | 1 | 2 | 3 | null {
  return v === 0 || v === 1 || v === 2 || v === 3 ? v : null
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
    painExamSuggestions: Array.isArray(raw.painExamSuggestions) ? raw.painExamSuggestions.map(sanitizeExamSuggestion) : [],
    painFinalAssessment: sanitizeShape(empty.painFinalAssessment, raw.painFinalAssessment),
    painFollowUpTargets: sanitizeArray(FOLLOW_UP_TARGET_TEMPLATE, raw.painFollowUpTargets),
    herbalPatternCandidates: Array.isArray(raw.herbalPatternCandidates)
      ? raw.herbalPatternCandidates.map(sanitizePatternCandidate)
      : [],
    herbalClinicianObservations: sanitizeArray(CLINICIAN_OBSERVATION_TEMPLATE, raw.herbalClinicianObservations),
    herbalFinalAssessment: sanitizeShape(empty.herbalFinalAssessment, raw.herbalFinalAssessment),
    herbalFollowUpTargets: sanitizeArray(FOLLOW_UP_TARGET_TEMPLATE, raw.herbalFollowUpTargets),
    painCarePlan: sanitizeShape(empty.painCarePlan, raw.painCarePlan),
    herbalCarePlan: sanitizeShape(empty.herbalCarePlan, raw.herbalCarePlan),
    nextReassessmentPlan: sanitizeShape(empty.nextReassessmentPlan, raw.nextReassessmentPlan),
    painReassessment: sanitizeStructuredReassessment(empty.painReassessment, raw.painReassessment),
    herbalReassessment: sanitizeStructuredReassessment(empty.herbalReassessment, raw.herbalReassessment),
    painRehabSuggestions: Array.isArray(raw.painRehabSuggestions) ? raw.painRehabSuggestions.map(sanitizeRehabSuggestion) : [],
    additionalConcernPromotion: sanitizeShape(empty.additionalConcernPromotion, raw.additionalConcernPromotion),
    lbpDirectionalResponse: isValidLbpDirectionalResponse(raw.lbpDirectionalResponse)
      ? raw.lbpDirectionalResponse
      : empty.lbpDirectionalResponse,
    lbpWorkingHypothesis: sanitizeLbpWorkingHypothesis(raw.lbpWorkingHypothesis),
    lbpConfirmedStage: sanitizeLbpConfirmedStage(raw.lbpConfirmedStage),
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
  // P0-8 (Core Reduction Phase 6 gate / Phase 5 Synthesis §2.9): `kind`
  // lets the caller distinguish an expired/missing doctor token (401/403 --
  // serverClient.ts's ServerResult already classifies this as 'auth') from
  // any other failure, so DoctorWorkspace can offer an inline "인증 만료 —
  // 토큰 다시 입력" recovery right here instead of the generic "저장
  // 실패" text. Optional so every pre-existing caller that never set it
  // keeps returning the exact same `{ ok: false }` shape as before.
  | { ok: false; conflict?: undefined; kind?: 'auth' | 'network' | 'other' }
