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
import {
  evaluateLbpExerciseEligibility,
  getLbpExerciseEligibilityRule,
  type LbpExerciseCapability,
  type LbpExerciseEligibilityContext,
  type LbpExerciseEligibilityResult,
} from './lbpExerciseEligibility'
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

export type LbpRecommendationReadiness = 'READY' | 'AWAITING_CAPABILITY_CONFIRMATION'

export type LbpRecommendationCandidate = {
  exerciseId: string
  title: string
  readiness: LbpRecommendationReadiness
  /** Meaningful only when readiness === 'READY'. */
  eligibilityState: 'START_AS_WRITTEN' | 'START_WITH_REGRESSION'
  /** True when a favorable directional response or (LBP_NEURAL_01) a concordant neurodynamic response directly supports this candidate — architecture §2.2 ranking rule. */
  directlySupported: boolean
  /** Populated only when readiness === 'AWAITING_CAPABILITY_CONFIRMATION' (CD-1). */
  unconfirmedCapabilities: LbpExerciseCapability[]
  /** Populated only when readiness === 'READY' && eligibilityState === 'START_WITH_REGRESSION'. */
  regressionRequirements: LbpExerciseCapability[]
  strategyLabelKo: string
  startingDoseKo: string
  stopReviewKo: readonly string[]
  /** Opus delta review defect 2: Core-20 metadata's own regression description, always carried so adoption text can append it structurally when `eligibilityState === 'START_WITH_REGRESSION'` — never `progressionKo`. */
  regressionKo: string
}

export type LbpRecommendationBlockedReason = 'SAFETY_REVIEW' | 'NEURO_REFRESH'

export type LbpRecommendationResult = {
  /** RF-3b: non-null means the WHOLE exercise block must collapse to blockedMessageKo instead of rendering candidates. */
  blocked: LbpRecommendationBlockedReason | null
  blockedMessageKo: string | null
  /** CD-2: never changes which candidates are computed/shown — only gates adoption (Part D disables the adopt action, never the card). */
  treatmentSafetyLocked: boolean
  treatmentSafetyLockedMessageKo: string | null
  readyCandidates: LbpRecommendationCandidate[]
  awaitingCapabilityCandidates: LbpRecommendationCandidate[]
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
}

const EMPTY_RESULT = (
  treatmentSafetyLocked: boolean,
  treatmentSafetyLockedMessageKo: string | null,
  blocked: LbpRecommendationBlockedReason | null,
  blockedMessageKo: string | null,
): LbpRecommendationResult => ({
  blocked,
  blockedMessageKo,
  treatmentSafetyLocked,
  treatmentSafetyLockedMessageKo,
  readyCandidates: [],
  awaitingCapabilityCandidates: [],
  targetFunctionGap: null,
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
export const TREATMENT_SAFETY_LOCKED_MESSAGE_KO =
  '치료 안전(임신 등) 확인 전까지 금기 민감 치료/운동은 원장 승인 없이 확정하지 않습니다.'

function toCandidate(
  meta: LbpCoreExerciseMetadata,
  rule: { hardRequirements: readonly LbpExerciseCapability[]; regressibleRequirements: readonly LbpExerciseCapability[]; requiredDirectionalResponse?: string },
  result: LbpExerciseEligibilityResult,
  readiness: LbpRecommendationReadiness,
  neurodynamicConcordant: boolean,
): LbpRecommendationCandidate {
  const catalogItem = getLbpExerciseById(meta.exerciseId)
  const domain = catalogItem?.domain
  // (b) integration correction: LBP_NEURAL_01 is "directly supported" only
  // when the Batch-1 exam suggestion `lbp_exam_neurodynamic` (하지직거상/
  // 슬럼프) has been recorded POSITIVE (concordant leg-symptom
  // reproduction) -- NOT_YET_CHECKED / NEGATIVE / UNCLEAR / the item being
  // absent all mean "unknown", and unknown is never support (architecture
  // §2.3). Previously this was unconditional on the exercise id alone.
  const directlySupported =
    rule.requiredDirectionalResponse != null || (meta.exerciseId === 'LBP_NEURAL_01' && neurodynamicConcordant)
  return {
    exerciseId: meta.exerciseId,
    // Opus delta review defect 3: plain-Korean clinic name, never the
    // catalog's (often English) `canonicalName` — that stays reserved for
    // ID/provenance fidelity only (lbpExerciseCoreMetadata.ts).
    title: meta.displayNameKo,
    readiness,
    eligibilityState: readiness === 'READY' ? (result.state as 'START_AS_WRITTEN' | 'START_WITH_REGRESSION') : 'START_AS_WRITTEN',
    directlySupported,
    unconfirmedCapabilities:
      readiness === 'AWAITING_CAPABILITY_CONFIRMATION'
        ? [...result.missingHardRequirements, ...result.regressionRequirements]
        : [],
    regressionRequirements: readiness === 'READY' ? [...result.regressionRequirements] : [],
    strategyLabelKo: domain ? strategyLabelForDomain(domain) : '',
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
    return EMPTY_RESULT(locked, lockedMessage, 'SAFETY_REVIEW', SAFETY_REVIEW_BLOCKED_MESSAGE_KO)
  }

  const context = buildLbpEligibilityContext(payload, lbpObjectiveMotorDeficit, workspaceState)

  // RF-3b: new/worsening neuro status also collapses the whole block —
  // LBP_REG_01's intentional requiresStableNeuro:false exception must never
  // read on screen as "exercise is fine, proceed" while this is true.
  if (context.neuroStatus === 'NEW_OR_WORSENING') {
    return EMPTY_RESULT(locked, lockedMessage, 'NEURO_REFRESH', NEURO_REFRESH_BLOCKED_MESSAGE_KO)
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
  // LBP_NEURAL_01 counts as directly supported. NOT_YET_CHECKED / NEGATIVE /
  // UNCLEAR / the item being absent all fall through to `false` below.
  const neurodynamicExam = workspaceState.painExamSuggestions.find((i) => i.id === 'lbp_exam_neurodynamic')
  const neurodynamicConcordant = neurodynamicExam?.result.status === 'POSITIVE'

  const ready: LbpRecommendationCandidate[] = []
  const awaiting: LbpRecommendationCandidate[] = []

  for (const meta of LBP_CORE_EXERCISE_METADATA) {
    // RF-13: guard before calling the engine — a rule missing for a
    // metadata id would otherwise throw (ELIG's own fail-fast, D8).
    const rule = getLbpExerciseEligibilityRule(meta.exerciseId)
    if (!rule) continue
    // Architecture §2.2 "TF 일치": Core-20 ∩ selected target function.
    if (!meta.targetFunctions.some((tf) => selectedTfs.has(tf))) continue

    const result = evaluateLbpExerciseEligibility(meta.exerciseId, context)
    if (result.state === 'START_AS_WRITTEN' || result.state === 'START_WITH_REGRESSION') {
      ready.push(toCandidate(meta, rule, result, 'READY', neurodynamicConcordant))
      continue
    }
    if (result.state !== 'DEFER_NOT_READY') continue // STOP_REVIEW (e.g. distal worsening) — not a candidate, not a capability question either.

    // CD-1: is this DEFER purely a matter of unconfirmed (not directional/
    // neuro) capabilities? v1 has no negative-confirmation UI, so every
    // capability the clinician has not tapped is UNKNOWN, never 'NO' — test
    // by hypothetically confirming every capability this rule references
    // and re-evaluating, rather than string-matching `reasonsKo`.
    const optimisticCapabilities: LbpExerciseEligibilityContext['capabilities'] = { ...context.capabilities }
    for (const cap of [...rule.hardRequirements, ...rule.regressibleRequirements]) {
      optimisticCapabilities[cap] = 'YES'
    }
    const optimistic = evaluateLbpExerciseEligibility(meta.exerciseId, {
      ...context,
      capabilities: optimisticCapabilities,
    })
    if (optimistic.state === 'START_AS_WRITTEN' || optimistic.state === 'START_WITH_REGRESSION') {
      awaiting.push(toCandidate(meta, rule, result, 'AWAITING_CAPABILITY_CONFIRMATION', neurodynamicConcordant))
    }
    // Otherwise (still DEFER even with every capability confirmed — e.g. a
    // directional-response mismatch, or the RF-1 neuro-UNKNOWN gate): not a
    // capability question, so not shown at all. It reappears automatically
    // once the directional-response chip or the objective-exam judgment
    // changes (architecture §2.3: recomputed every render, nothing cached).
  }

  return {
    blocked: null,
    blockedMessageKo: null,
    treatmentSafetyLocked: locked,
    treatmentSafetyLockedMessageKo: lockedMessage,
    readyCandidates: rankReady(ready),
    awaitingCapabilityCandidates: awaiting,
    targetFunctionGap,
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
  const regressed = candidate.eligibilityState === 'START_WITH_REGRESSION'
  const regressionNote = regressed ? ' (쉬운 단계로 시작)' : ''
  return {
    id: candidate.exerciseId,
    title: `${candidate.title}${regressionNote}`,
    goal: candidate.startingDoseKo,
    rationale: `${candidate.strategyLabelKo} — 중단·재검토: ${stopReviewJoined}`,
    sourceFacts: [
      { text: `시작 용량: ${candidate.startingDoseKo}`, provenance: 'DERIVED' },
      // Opus delta review defect 2: the regression note (which entry-level
      // to actually start at) must be visible on the card itself, not only
      // baked into the adopted Care Plan text.
      ...(regressed ? [{ text: `쉬운 단계: ${candidate.regressionKo}`, provenance: 'DERIVED' as const }] : []),
      { text: `중단·재검토 기준: ${stopReviewJoined}`, provenance: 'DERIVED' },
    ],
    contraindicationFacts: [],
    source: 'SUGGESTED',
    status: 'SUGGESTED',
    clinicianFinalInstruction: '',
    // Structured carrier for appendLbpAdoptionText — never re-derived by
    // parsing `title`'s "(쉬운 단계로 시작)" suffix.
    regressed,
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
export function buildLbpAdoptionText(exerciseId: string, options?: { regressed?: boolean }): string | null {
  const meta = LBP_CORE_EXERCISE_METADATA.find((m) => m.exerciseId === exerciseId)
  const catalogItem = getLbpExerciseById(exerciseId)
  if (!meta || !catalogItem) return null
  const stopReviewJoined = meta.stopReviewKo.join('; ')
  const regressionSuffix = options?.regressed ? ` 쉬운 단계: ${meta.regressionKo}` : ''
  return `${meta.displayNameKo} — ${meta.startingDoseKo}${regressionSuffix} 중단·재검토: ${stopReviewJoined}`
}

/** Appends the adoption line to an existing free-text home action plan, idempotently (never duplicates the exact same line) and never automatically (only ever called from an explicit clinician click — Part D). Reads `suggestion.regressed` — the structured flag `candidateToRehabSuggestion` set — rather than parsing `suggestion.title`'s "(쉬운 단계로 시작)" suffix (Opus delta review defect 2). */
export function appendLbpAdoptionText(existingHomeActionPlan: string, suggestion: RehabSuggestion): string {
  const text =
    buildLbpAdoptionText(suggestion.id, { regressed: suggestion.regressed === true }) ??
    [suggestion.title, suggestion.goal].filter((s) => s.trim().length > 0).join(' — ')
  if (!text) return existingHomeActionPlan
  if (existingHomeActionPlan.includes(text)) return existingHomeActionPlan
  return existingHomeActionPlan.trim() ? `${existingHomeActionPlan}\n${text}` : text
}
