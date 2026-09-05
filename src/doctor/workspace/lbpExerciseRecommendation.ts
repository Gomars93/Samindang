/**
 * LBP v1 Batch 2 (G9/G10) — the exercise recommendation module.
 *
 * Docs ref: `LBP_PRODUCTION_V1_MINIMAL_ARCHITECTURE_v0.1.md` §2.2 ("운동
 * 추천"), `LBP_EXERCISE_ELIGIBILITY_OPUS_BOUNDED_VALIDATION_v0.1.md`
 * RF-3/RF-3b/RF-8/RF-13, `DECISIONS.md`'s 2026-09-02 "CD-1/CD-2 PO 결정"
 * entry.
 *
 * Scope, deliberately narrow (architecture §2.3 invariants, unchanged here):
 *   - Core-20 only, never the full 57-item catalog.
 *   - No numeric score. Ranking is exactly two buckets (directly supported
 *     by the current directional/neurodynamic response, vs. everything
 *     else) in Core-20 declaration order within each bucket.
 *   - Derived results (candidates) are never persisted — recomputed on
 *     every call from the current payload/judgment/workspace state.
 *   - `Primary Strategy -> Secondary Strategy -> Exercise` clinician-facing
 *     workflow is CLOSED (PO decision, `DECISIONS.md` 2026-09-02 "LBP Rehab
 *     Strategy Mapping") and is NOT built here. The only thing reused from
 *     `lbpRehabStrategySelector.v01.experimental.ts` is its ~15-line
 *     domain->strategy static table, copied inline below, used strictly for
 *     a one-line internal/explanatory "이유" label — never a clickable
 *     step, never a filter, never a ranking signal.
 */
import type { DoctorPayload } from '../types'
import type { ClinicianJudgment } from '../judgment'
import { computeLbpFlags, treatmentSafetyLocked as treatmentSafetyLockedFrozen } from '../../spec/lbpLogic'
import { toLbpStateFromDoctorPayload, ageFromDoctorPayload } from '../../spec/lbpAdapter'
import { buildLbpEligibilityContext } from './lbpEligibilityContext'
import { isLbpExerciseAllowedAtStage } from './lbpExerciseStageTable'
import { LBP_STAGE_0_GUIDANCE_KO, type LbpExerciseStage } from './lbpExerciseStage'
import { evaluateLbpExerciseEligibility, getLbpExerciseEligibilityRule } from './lbpExerciseEligibility'
import { LBP_CORE_EXERCISE_METADATA, type LbpCoreExerciseMetadata } from './lbpExerciseCoreMetadata'
import { getLbpExerciseById, type LbpExerciseDomain, type LbpExerciseTargetFunction } from './lbpExerciseLibrary'
import { selectedLbpTargetFunctions } from './lbpTargetFunction'
import type { FollowUpTarget } from './finalAssessment'
import type { RehabSuggestion } from './rehabSuggestion'
import type { WorkspaceState } from './persistence'

// ---------------------------------------------------------------------------
// lbp_tf_* id <-> LbpExerciseTargetFunction enum (architecture §2.2 "TF 일치")
// ---------------------------------------------------------------------------

/**
 * `lbp_tf_custom` intentionally maps to nothing — a free-text goal cannot be
 * matched against Core-20 metadata's fixed enum, so it never filters an
 * exercise IN via this path (architecture §2.2, explicitly accepted).
 *
 * Opus delta review defect 8: `LBP_LUMBAR_02`'s own `targetFunctions`
 * (FLEXION/EXTENSION/CUSTOM — `lbpExerciseCoreMetadata.ts`) has no entry
 * here, so it is currently unreachable through this v1 target-function
 * picker — a clinical-scope decision (which `lbp_tf_*` chip, if any, should
 * surface cat-camel), not something this module changes on its own. Kept
 * `export`ed so `tests/lbp-exercise-recommendation.spec.mjs`'s reachability
 * test can assert the unreachable set stays exactly `{LBP_LUMBAR_02}` and
 * never grows silently.
 */
export const TARGET_FUNCTION_ID_TO_ENUM: Record<string, LbpExerciseTargetFunction | undefined> = {
  lbp_tf_walking: 'WALKING',
  lbp_tf_sitting: 'SITTING',
  lbp_tf_standing: 'STANDING',
  lbp_tf_sit_to_stand: 'SIT_TO_STAND',
  lbp_tf_dressing: 'DRESSING',
  lbp_tf_lifting: 'LIFTING',
  lbp_tf_sleep: 'SLEEP',
  lbp_tf_work: 'WORK',
}

function selectedTargetFunctionSet(followUpTargets: FollowUpTarget[]): Set<LbpExerciseTargetFunction> {
  const set = new Set<LbpExerciseTargetFunction>()
  for (const t of selectedLbpTargetFunctions(followUpTargets)) {
    const mapped = TARGET_FUNCTION_ID_TO_ENUM[t.id]
    if (mapped) set.add(mapped)
  }
  return set
}

// ---------------------------------------------------------------------------
// Domain -> Rehab Strategy static table (copied ONLY this table, per
// architecture §3 "Rehab Strategy Selector v0.1 = BYPASS", from
// `lbpRehabStrategySelector.v01.experimental.ts` on
// `origin/claude/feat-lbp-action-adaptive-engine-prototype`). Internal
// explanatory label only — never a clickable Primary/Secondary step (CLOSED,
// `DECISIONS.md` 2026-09-02).
// ---------------------------------------------------------------------------

type LbpRehabStrategy =
  | 'SYMPTOM_RESPONSE_GUIDED_MOVEMENT'
  | 'PHYSICAL_FUNCTION_CAPACITY'
  | 'NEURAL_MOBILITY_MANAGEMENT'
  | 'GRADED_EXPOSURE_RETURN'

const STRATEGY_LABEL_KO: Record<LbpRehabStrategy, string> = {
  SYMPTOM_RESPONSE_GUIDED_MOVEMENT: '증상반응 활용',
  PHYSICAL_FUNCTION_CAPACITY: '신체·기능능력 회복',
  NEURAL_MOBILITY_MANAGEMENT: '신경가동성 관리',
  GRADED_EXPOSURE_RETURN: '단계적 노출·복귀',
}

const REGULATION_LABEL_KO = '호흡·이완 보조'

const STRATEGY_BY_DOMAIN: Record<LbpExerciseDomain, LbpRehabStrategy | 'REGULATION'> = {
  DIRECTIONAL_RESPONSE: 'SYMPTOM_RESPONSE_GUIDED_MOVEMENT',
  NEURAL_MOBILITY: 'NEURAL_MOBILITY_MANAGEMENT',
  GRADED_EXPOSURE: 'GRADED_EXPOSURE_RETURN',
  MIND_BODY_REGULATION: 'REGULATION',
  ACTIVITY_AEROBIC: 'PHYSICAL_FUNCTION_CAPACITY',
  LUMBAR_MOBILITY: 'PHYSICAL_FUNCTION_CAPACITY',
  HIP_MOBILITY: 'PHYSICAL_FUNCTION_CAPACITY',
  DEEP_TRUNK_ACTIVATION: 'PHYSICAL_FUNCTION_CAPACITY',
  TRUNK_CONTROL: 'PHYSICAL_FUNCTION_CAPACITY',
  TRUNK_ENDURANCE: 'PHYSICAL_FUNCTION_CAPACITY',
  HIP_STRENGTH: 'PHYSICAL_FUNCTION_CAPACITY',
  FUNCTIONAL_STRENGTH: 'PHYSICAL_FUNCTION_CAPACITY',
  LOAD_CAPACITY: 'PHYSICAL_FUNCTION_CAPACITY',
}

function strategyLabelForDomain(domain: LbpExerciseDomain): string {
  const strategy = STRATEGY_BY_DOMAIN[domain]
  return strategy === 'REGULATION' ? REGULATION_LABEL_KO : STRATEGY_LABEL_KO[strategy]
}

// ---------------------------------------------------------------------------
// Candidate shape
// ---------------------------------------------------------------------------

export type LbpRecommendationCandidate = {
  exerciseId: string
  title: string
  /** True when a favorable directional response or (LBP_NEURAL_01) a concordant neurodynamic response directly supports this candidate — architecture §2.2 ranking rule. */
  directlySupported: boolean
  strategyLabelKo: string
  /**
   * 2026-09-05: Core-20 metadata의 `startingCriteriaKo` 원문. 준비조건 게이트를
   * 없애면서 **이 문장이 원장이 실제로 읽는 시작 조건**이 됐다 — 게이트로 막는
   * 대신 카드에 띄우고 원장이 환자를 보며 판단한다. 카드에 반드시 표시되어야
   * 하며(`candidateToRehabSuggestion`의 첫 sourceFact), 비어 있으면 안 된다.
   */
  startingCriteriaKo: readonly string[]
  startingDoseKo: string
  stopReviewKo: readonly string[]
  /** Core-20 metadata의 쉬운 단계 설명. 항상 카드에 표시된다 — 원장이 "이 환자에겐 좀 버겁겠다" 싶을 때 낮춰 줄 선택지. `progressionKo`는 여기서 절대 읽지 않는다. */
  regressionKo: string
}

/** `STAGE_0`: 원장이 0단계(보호/안정)를 확정 — 능동 운동 미처방이라 후보 블록 전체가 안내문으로 접힌다. */
export type LbpRecommendationBlockedReason = 'SAFETY_REVIEW' | 'NEURO_REFRESH' | 'STAGE_0'

export type LbpRecommendationResult = {
  /** RF-3b: non-null means the WHOLE exercise block must collapse to blockedMessageKo instead of rendering candidates. */
  blocked: LbpRecommendationBlockedReason | null
  blockedMessageKo: string | null
  /** CD-2: never changes which candidates are computed/shown — only gates adoption (Part D disables the adopt action, never the card). */
  treatmentSafetyLocked: boolean
  treatmentSafetyLockedMessageKo: string | null
  candidates: LbpRecommendationCandidate[]
  /**
   * (c) integration correction: non-null only when the record is LBP, the
   * block is not `blocked`, and the clinician has selected no `lbp_tf_*`
   * target function yet (`NONE_SELECTED`) or has selected only
   * `lbp_tf_custom` (`CUSTOM_ONLY`, which maps to no Core-20
   * `LbpExerciseTargetFunction` -- see `TARGET_FUNCTION_ID_TO_ENUM` above).
   * Both cases mean `readyCandidates`/`awaitingCapabilityCandidates` are
   * empty by construction (the TF filter below excludes everything), so the
   * UI shows one hint line instead of silently rendering nothing.
   */
  targetFunctionGap: 'NONE_SELECTED' | 'CUSTOM_ONLY' | null
  /**
   * 2026-09-05: 원장이 확정한 단계(`WorkspaceState.lbpConfirmedStage`)를
   * 그대로 되돌려준다 — 화면이 workspaceState를 또 읽지 않게. `null`이면
   * 단계 필터·준비조건 추정 모두 꺼진 상태.
   */
  confirmedStage: LbpExerciseStage | null
  /**
   * 2026-09-05: 신경학적 상태(`lbp_objective_motor_deficit`)가 미기록이라 후보
   * 대부분이 보류된 상태. RF-1 게이트는 그대로 두고(미확인을 안정으로 가정하지
   * 않는다), 화면이 "무엇을 하면 후보가 나타나는지" 한 줄로 안내하게 한다 —
   * 이유 없이 빈 목록을 보여주지 않기 위해서다.
   */
  neuroUnrecorded: boolean
}

const EMPTY_RESULT = (
  treatmentSafetyLocked: boolean,
  treatmentSafetyLockedMessageKo: string | null,
  blocked: LbpRecommendationBlockedReason | null,
  blockedMessageKo: string | null,
  confirmedStage: LbpExerciseStage | null = null,
): LbpRecommendationResult => ({
  blocked,
  blockedMessageKo,
  treatmentSafetyLocked,
  treatmentSafetyLockedMessageKo,
  candidates: [],
  targetFunctionGap: null,
  confirmedStage,
  neuroUnrecorded: false,
})

/**
 * Wording matches `LbpSafetyPanel`'s established convention (`DoctorView.tsx`)
 * so the same safety condition never reads two different ways on the same
 * screen.
 */
const SAFETY_REVIEW_BLOCKED_MESSAGE_KO =
  '안전 확인 전까지 일상적인 운동/치료 추천은 잠깁니다 — 위 레인1 안전 확인(허리)을 먼저 확인하세요.'
const NEURO_REFRESH_BLOCKED_MESSAGE_KO =
  '새롭거나 악화되는 신경학적 변화가 있어 운동 추천보다 안전 재평가가 우선입니다 — 위 레인1 안전 확인(허리)을 참고하세요.'
/** 0단계 확정 시 후보 블록 자리에 뜨는 한 줄 — 단계 카드의 안내문과 같은 문장을 쓴다(같은 상태가 두 가지로 읽히지 않게). */
export const STAGE_0_BLOCKED_MESSAGE_KO = `0단계(보호/안정) 확정 — ${LBP_STAGE_0_GUIDANCE_KO}`
export const TREATMENT_SAFETY_LOCKED_MESSAGE_KO =
  '치료 안전(임신 등) 확인 전까지 금기 민감 치료/운동은 원장 승인 없이 확정하지 않습니다.'

function toCandidate(
  meta: LbpCoreExerciseMetadata,
  rule: { requiredDirectionalResponse?: string },
  neurodynamicConcordant: boolean,
): LbpRecommendationCandidate {
  const catalogItem = getLbpExerciseById(meta.exerciseId)
  const domain = catalogItem?.domain
  // (b) integration correction: LBP_NEURAL_01 is "directly supported" only
  // when the Batch-1 exam suggestion `lbp_exam_neurodynamic` (하지직거상/
  // 슬럼프) has been recorded POSITIVE (concordant leg-symptom
  // reproduction) -- every other ExamCheckStatus (NEGATIVE / UNCLEAR /
  // LIMITED / NOT_PERFORMED / NOT_YET_CHECKED, Batch 2.5b's 6 values) and
  // the item being absent all fail to establish support, and unknown is
  // never support (architecture §2.3). Previously this was unconditional on
  // the exercise id alone.
  const directlySupported =
    rule.requiredDirectionalResponse != null || (meta.exerciseId === 'LBP_NEURAL_01' && neurodynamicConcordant)
  return {
    exerciseId: meta.exerciseId,
    // Opus delta review defect 3: plain-Korean clinic name, never the
    // catalog's (often English) `canonicalName` — that stays reserved for
    // ID/provenance fidelity only (lbpExerciseCoreMetadata.ts).
    title: meta.displayNameKo,
    directlySupported,
    strategyLabelKo: domain ? strategyLabelForDomain(domain) : '',
    startingCriteriaKo: meta.startingCriteriaKo,
    startingDoseKo: meta.startingDoseKo,
    stopReviewKo: meta.stopReviewKo,
    regressionKo: meta.regressionKo,
  }
}

function rankReady(items: LbpRecommendationCandidate[]): LbpRecommendationCandidate[] {
  // No numeric score (architecture §2.2): a stable two-bucket partition,
  // Core-20 declaration order preserved within each bucket.
  return [...items.filter((i) => i.directlySupported), ...items.filter((i) => !i.directlySupported)]
}

/**
 * §2.2/G9: `DoctorPayload` + clinician judgment + workspace record ->
 * ranked, safety-gated exercise candidates. Pure and safe to call on every
 * render (nothing here is persisted by this module itself).
 */
export function buildLbpRecommendationContext(
  payload: DoctorPayload,
  lbpObjectiveMotorDeficit: ClinicianJudgment['lbp_objective_motor_deficit'],
  workspaceState: WorkspaceState,
): LbpRecommendationResult {
  if (payload.responses.safety_flags.lbp == null) {
    return EMPTY_RESULT(false, null, null, null)
  }

  const confirmedStage: LbpExerciseStage | null = workspaceState.lbpConfirmedStage ?? null

  const age = ageFromDoctorPayload(payload.responses)
  // Same recomputed path as lbpEligibilityContext.ts (RF-2) — never the
  // tablet-submission-time snapshot.
  const state = toLbpStateFromDoctorPayload(payload.responses, lbpObjectiveMotorDeficit, age)
  const flags = computeLbpFlags(state)
  const locked = treatmentSafetyLockedFrozen(flags)
  const lockedMessage = locked ? TREATMENT_SAFETY_LOCKED_MESSAGE_KO : null

  // RF-3b: disease-safety-not-CLEAR collapses the whole block with one
  // message instead of rendering 20 individually STOP_REVIEW-ed cards.
  if (flags.lbp_safety_status !== 'CLEAR') {
    return EMPTY_RESULT(locked, lockedMessage, 'SAFETY_REVIEW', SAFETY_REVIEW_BLOCKED_MESSAGE_KO, confirmedStage)
  }

  const context = buildLbpEligibilityContext(payload, lbpObjectiveMotorDeficit, workspaceState)

  // RF-3b: new/worsening neuro status also collapses the whole block —
  // LBP_REG_01's intentional requiresStableNeuro:false exception must never
  // read on screen as "exercise is fine, proceed" while this is true.
  if (context.neuroStatus === 'NEW_OR_WORSENING') {
    return EMPTY_RESULT(locked, lockedMessage, 'NEURO_REFRESH', NEURO_REFRESH_BLOCKED_MESSAGE_KO, confirmedStage)
  }

  // 2026-09-05: 0단계 확정 = 능동 운동 미처방. 안전 블록(위 두 개)보다는
  // 뒤에 — 안전 재평가가 필요한 환자에게 0단계 안내문이 그 메시지를 가리면
  // 안 된다. 단계 카드 자체는 이 결과와 무관하게 항상 렌더되므로 원장이
  // 여기서 1단계로 올릴 수 있다.
  if (confirmedStage === 0) {
    return EMPTY_RESULT(locked, lockedMessage, 'STAGE_0', STAGE_0_BLOCKED_MESSAGE_KO, 0)
  }

  const selectedTfs = selectedTargetFunctionSet(workspaceState.painFollowUpTargets)
  // (c): distinguish "nothing picked yet" from "only 기타 목표 동작 (custom,
  // free-text) picked" -- the latter has real selections but none of them
  // map to a Core-20 LbpExerciseTargetFunction (TARGET_FUNCTION_ID_TO_ENUM
  // intentionally omits lbp_tf_custom).
  const anyLbpTfSelected = selectedLbpTargetFunctions(workspaceState.painFollowUpTargets).length > 0
  const targetFunctionGap: LbpRecommendationResult['targetFunctionGap'] = !anyLbpTfSelected
    ? 'NONE_SELECTED'
    : selectedTfs.size === 0
      ? 'CUSTOM_ONLY'
      : null

  // (b): whether the Batch-1 neurodynamic exam (하지직거상/슬럼프) has been
  // recorded POSITIVE this record -- the only condition under which
  // LBP_NEURAL_01 counts as directly supported. Batch 2.5b: the comparison
  // is deliberately `=== 'POSITIVE'`, not `!== 'NOT_YET_CHECKED'`, so the
  // two states added in that batch need no change here -- NEGATIVE /
  // UNCLEAR / LIMITED / NOT_PERFORMED / NOT_YET_CHECKED and the item being
  // absent all fall through to `false` below.
  const neurodynamicExam = workspaceState.painExamSuggestions.find((i) => i.id === 'lbp_exam_neurodynamic')
  const neurodynamicConcordant = neurodynamicExam?.result.status === 'POSITIVE'

  const found: LbpRecommendationCandidate[] = []
  let neuroDeferred = 0

  for (const meta of LBP_CORE_EXERCISE_METADATA) {
    // RF-13: guard before calling the engine — a rule missing for a
    // metadata id would otherwise throw (ELIG's own fail-fast, D8).
    const rule = getLbpExerciseEligibilityRule(meta.exerciseId)
    if (!rule) continue
    // Architecture §2.2 "TF 일치": Core-20 ∩ selected target function.
    if (!meta.targetFunctions.some((tf) => selectedTfs.has(tf))) continue
    // 2026-09-05: 확정 단계보다 높은 단계의 운동은 후보에서 뺀다
    // (`lbpExerciseStageTable.ts`). 미확정(null)이면 필터 없음 — 옛 기록과
    // 아직 단계를 안 정한 오늘 기록은 기존 그대로 전부 후보.
    if (!isLbpExerciseAllowedAtStage(meta.exerciseId, confirmedStage)) continue

    const result = evaluateLbpExerciseEligibility(meta.exerciseId, context)
    if (result.state === 'START_AS_WRITTEN') {
      found.push(toCandidate(meta, rule, neurodynamicConcordant))
      continue
    }
    // 2026-09-05: DEFER/STOP은 후보로 올리지 않는다(기존과 동일). 다만 그 사유가
    // "신경학적 상태 미확인"뿐인 경우는 세어 둔다 — 원장이 1탭으로 해소할 수 있는
    // 유일한 사유이므로 화면이 그렇게 안내한다.
    if (result.state === 'DEFER_NOT_READY' && rule.requiresStableNeuro && context.neuroStatus === 'UNKNOWN') {
      neuroDeferred++
    }
  }

  return {
    blocked: null,
    blockedMessageKo: null,
    treatmentSafetyLocked: locked,
    treatmentSafetyLockedMessageKo: lockedMessage,
    candidates: rankReady(found),
    targetFunctionGap,
    confirmedStage,
    neuroUnrecorded: neuroDeferred > 0,
  }
}

// ---------------------------------------------------------------------------
// Candidate -> RehabSuggestion (merge with persisted clinician decisions)
// ---------------------------------------------------------------------------

/**
 * RF-8: `goal`/`rationale`/`sourceFacts` are built from Core-20 metadata's
 * `startingDoseKo` + `stopReviewKo` — BOTH always appear, never dose alone.
 * `progressionKo` is never read anywhere in this module (progression is a
 * future-visit clinician decision, not v1's to hand out).
 */
export function candidateToRehabSuggestion(candidate: LbpRecommendationCandidate): RehabSuggestion {
  const stopReviewJoined = candidate.stopReviewKo.join('; ')
  return {
    id: candidate.exerciseId,
    title: candidate.title,
    goal: candidate.startingDoseKo,
    rationale: `${candidate.strategyLabelKo} — 중단·재검토: ${stopReviewJoined}`,
    sourceFacts: [
      // 2026-09-05: 시작 기준이 **첫 줄**이다. 준비조건 게이트를 없앤 뒤 원장이
      // 이 운동을 줄지 판단하는 근거가 바로 이 문장이므로, 용량보다 먼저 읽혀야
      // 한다. 테스트가 이 순서를 고정한다.
      { text: `시작 기준: ${candidate.startingCriteriaKo.join('; ')}`, provenance: 'DERIVED' },
      { text: `시작 용량: ${candidate.startingDoseKo}`, provenance: 'DERIVED' },
      // 쉬운 단계는 이제 조건부가 아니라 항상 보인다 — 시스템이 "이 환자는
      // 쉬운 단계로 시작"을 판정하지 않고, 원장이 보고 고르기 때문이다.
      { text: `쉬운 단계로 시작하려면: ${candidate.regressionKo}`, provenance: 'DERIVED' },
      { text: `중단·재검토 기준: ${stopReviewJoined}`, provenance: 'DERIVED' },
    ],
    contraindicationFacts: [],
    source: 'SUGGESTED',
    status: 'SUGGESTED',
    clinicianFinalInstruction: '',
  }
}

/**
 * Merges freshly-computed READY candidates into whatever is already saved,
 * mirroring `lbpExamSuggestions.ts`'s `mergeLbpExamSuggestions` pattern
 * (architecture §5 Batch 2 brief): a clinician's own SUGGESTED->ACCEPTED/
 * HELD/REJECTED decision on an id that is still a fresh candidate is NEVER
 * overwritten; a decided (non-SUGGESTED) item that is no longer a fresh
 * candidate is still kept (its decision already exists — e.g. it may already
 * be reflected in the Care Plan text — so the card must not silently
 * vanish); an undecided SUGGESTED item that is no longer a fresh candidate
 * is dropped (never decided, safe to recompute away).
 */
export function mergeLbpRehabSuggestions(
  existing: RehabSuggestion[],
  readyCandidates: LbpRecommendationCandidate[],
): RehabSuggestion[] {
  const fresh = readyCandidates.map(candidateToRehabSuggestion)
  const freshIds = new Set(fresh.map((f) => f.id))
  const merged = fresh.map((f) => {
    const existingMatch = existing.find((e) => e.id === f.id)
    return existingMatch
      ? { ...f, status: existingMatch.status, clinicianFinalInstruction: existingMatch.clinicianFinalInstruction }
      : f
  })
  const keptDecided = existing.filter((e) => e.status !== 'SUGGESTED' && !freshIds.has(e.id))
  return [...merged, ...keptDecided]
}

/**
 * RF-8's other half: the exact text appended to `PainCarePlan.homeActionPlan`
 * on adopt ("adopt, never automatic" — Part D calls this only from an
 * explicit clinician click). Always dose + stop/review together; never
 * `progressionKo`. Returns null for a non-Core-20 id (any RehabSuggestion
 * this module did not itself generate) so the caller can fall back to a
 * generic append built from the suggestion's own title/goal.
 *
 * Opus delta review defect 2: `options.regressed` (structurally passed by
 * the caller — see `appendLbpAdoptionText` below — never parsed from a
 * title string) appends the Core-20 metadata's own `regressionKo` after the
 * dose when this candidate was adopted as `START_WITH_REGRESSION`, so the
 * entry-level the patient actually starts at is not lost between the card
 * and the Care Plan text they take home.
 */
export function buildLbpAdoptionText(exerciseId: string): string | null {
  const meta = LBP_CORE_EXERCISE_METADATA.find((m) => m.exerciseId === exerciseId)
  const catalogItem = getLbpExerciseById(exerciseId)
  if (!meta || !catalogItem) return null
  const stopReviewJoined = meta.stopReviewKo.join('; ')
  // Opus closing review §C(i): `regressionKo` rows end without terminal
  // punctuation, so appending " 중단·재검토:" directly after them can read as
  // the opposite of what it means (e.g. "…휴식 지점을 사용 중단·재검토:" reads
  // as "stop using the rest point"). A trailing period here guarantees a
  // clear sentence boundary before "중단·재검토:" regardless of whether
  // `regressionKo` itself ends with punctuation.
  return `${meta.displayNameKo} — ${meta.startingDoseKo} 중단·재검토: ${stopReviewJoined}`
}

/** Appends the adoption line to an existing free-text home action plan, idempotently (never duplicates the exact same line) and never automatically (only ever called from an explicit clinician click — Part D). Reads `suggestion.regressed` — the structured flag `candidateToRehabSuggestion` set — rather than parsing `suggestion.title`'s "(쉬운 단계로 시작)" suffix (Opus delta review defect 2). */
export function appendLbpAdoptionText(existingHomeActionPlan: string, suggestion: RehabSuggestion): string {
  const text =
    buildLbpAdoptionText(suggestion.id) ??
    [suggestion.title, suggestion.goal].filter((s) => s.trim().length > 0).join(' — ')
  if (!text) return existingHomeActionPlan
  if (existingHomeActionPlan.includes(text)) return existingHomeActionPlan
  return existingHomeActionPlan.trim() ? `${existingHomeActionPlan}\n${text}` : text
}
