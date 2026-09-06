/**
 * LBP v1 Batch 2 (G9/G10) — the exercise recommendation module.
 *
 * Docs ref: `LBP_PRODUCTION_V1_MINIMAL_ARCHITECTURE_v0.1.md` §2.2 ("운동
 * 추천"), `LBP_EXERCISE_ELIGIBILITY_OPUS_BOUNDED_VALIDATION_v0.1.md`
 * RF-3/RF-3b/RF-8/RF-13, `DECISIONS.md`'s 2026-09-02 "CD-1/CD-2 PO 결정"
 * entry.
 *
 * Scope, deliberately narrow (architecture §2.3 invariants, unchanged here):
 *   - Core set only (요통: Core-20), never the full catalog.
 *   - No numeric score. Ranking is exactly two buckets (directly supported
 *     by the current directional/neurodynamic response, vs. everything
 *     else) in Core declaration order within each bucket.
 *   - Derived results (candidates) are never persisted — recomputed on
 *     every call from the current payload/judgment/workspace state.
 *   - `Primary Strategy -> Secondary Strategy -> Exercise` clinician-facing
 *     workflow is CLOSED (PO decision, `DECISIONS.md` 2026-09-02 "LBP Rehab
 *     Strategy Mapping") and is NOT built here. The domain->strategy label
 *     table now lives in the 요통 팩 (`regionPacks/lbp.ts`) as a
 *     precomputed `strategyLabelKo` per Core row — still a one-line
 *     internal/explanatory "이유" label, never a clickable step, never a
 *     filter, never a ranking signal.
 *
 * 부위 팩 일반화(2026-09-06, `docs/PAIN_REGION_PACK_GENERALIZATION_PLAN_v0.1.md`
 * §3): 판단 본체는 `buildRecommendationContext(pack, …)` 하나이고, 부위마다
 * 다른 것(Core 목록·단계표·규칙·목표 기능 표·안전 재계산·직접 뒷받침 검사)은
 * 전부 `RegionPack` 값이다. 옛 요통 함수들은 요통 팩을 넘기는 래퍼로 남아
 * `tests/lbp-exercise-recommendation.spec.mjs`가 수정 없이 통과한다.
 */
import type { DoctorPayload } from '../types'
import type { ClinicianJudgment } from '../judgment'
import { buildEligibilityContextFrom } from './lbpEligibilityContext'
import { isExerciseAllowedAtStage } from './lbpExerciseStageTable'
import { LBP_STAGE_0_GUIDANCE_KO, type LbpExerciseStage } from './lbpExerciseStage'
import { eligibilityRulesById, evaluateExerciseEligibility } from './lbpExerciseEligibility'
import type { LbpDirectionalResponse } from './lbpExamSuggestions'
import { selectedTargetFunctions } from './lbpTargetFunction'
import type { FollowUpTarget } from './finalAssessment'
import type { RehabSuggestion } from './rehabSuggestion'
import type { WorkspaceState } from './persistence'
import type { RegionCoreExercise, RegionJudgmentInputs, RegionPack } from './regionPack'
import { LBP_REGION_PACK } from './regionPacks/lbp'

// 옛 위치에서 import하던 호출부/테스트를 위해 그대로 다시 export한다 — 표 자체는
// 순환 import를 피해 `lbpTargetFunction.ts`로 옮겼다.
export { LBP_TARGET_FUNCTION_ID_TO_ENUM as TARGET_FUNCTION_ID_TO_ENUM } from './lbpTargetFunction'

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
export type RecommendationCandidate = LbpRecommendationCandidate

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
   * (c) integration correction: non-null only when the record is this
   * region's, the block is not `blocked`, and the clinician has selected no
   * `<region>_tf_*` target function yet (`NONE_SELECTED`) or has selected
   * only the free-text one (`CUSTOM_ONLY`, which maps to no Core enum -- see
   * the pack's `targetFunctionIdToEnum`). Both cases mean the candidate list
   * is empty by construction (the TF filter below excludes everything), so
   * the UI shows one hint line instead of silently rendering nothing.
   */
  targetFunctionGap: 'NONE_SELECTED' | 'CUSTOM_ONLY' | null
  /**
   * 2026-09-05: 원장이 확정한 단계를 그대로 되돌려준다 — 화면이 workspaceState를
   * 또 읽지 않게. `null`이면 단계 필터·준비조건 추정 모두 꺼진 상태.
   */
  confirmedStage: LbpExerciseStage | null
  /**
   * 2026-09-05: 신경학적 상태가 미기록이라 후보 대부분이 보류된 상태. RF-1
   * 게이트는 그대로 두고(미확인을 안정으로 가정하지 않는다), 화면이 "무엇을
   * 하면 후보가 나타나는지" 한 줄로 안내하게 한다 — 이유 없이 빈 목록을
   * 보여주지 않기 위해서다.
   */
  neuroUnrecorded: boolean
}
export type RecommendationResult = LbpRecommendationResult

/** 부위별 원장 기록 중 추천이 읽는 두 값. 요통은 `WorkspaceState.lbpDirectionalResponse`/`lbpConfirmedStage`에서, 다른 부위는 `regionClinical[region]`에서 온다. */
export type RegionRecommendationState = {
  directionalResponse: LbpDirectionalResponse
  confirmedStage: LbpExerciseStage | null
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
 * screen. 부위 라벨만 팩에서 온다 — 요통은 "(허리)"로 옛 문장과 글자 단위로 같다.
 */
export function safetyReviewBlockedMessageKo(regionLabelKo: string): string {
  return `안전 확인 전까지 일상적인 운동/치료 추천은 잠깁니다 — 위 레인1 안전 확인(${regionLabelKo})을 먼저 확인하세요.`
}
export function neuroRefreshBlockedMessageKo(regionLabelKo: string): string {
  return `새롭거나 악화되는 신경학적 변화가 있어 운동 추천보다 안전 재평가가 우선입니다 — 위 레인1 안전 확인(${regionLabelKo})을 참고하세요.`
}
/** 0단계 확정 시 후보 블록 자리에 뜨는 한 줄 — 단계 카드의 안내문과 같은 문장을 쓴다(같은 상태가 두 가지로 읽히지 않게). */
export const STAGE_0_BLOCKED_MESSAGE_KO = `0단계(보호/안정) 확정 — ${LBP_STAGE_0_GUIDANCE_KO}`
export const TREATMENT_SAFETY_LOCKED_MESSAGE_KO =
  '치료 안전(임신 등) 확인 전까지 금기 민감 치료/운동은 원장 승인 없이 확정하지 않습니다.'

function toCandidate(
  meta: RegionCoreExercise,
  rule: { requiredDirectionalResponse?: string },
  directlySupportedByExam: boolean,
): LbpRecommendationCandidate {
  // (b) integration correction: an exercise is "directly supported" by an
  // exam only when the pack's `directSupportByExam` names it AND that exam
  // has been recorded POSITIVE this record (요통: LBP_NEURAL_01 ←
  // `lbp_exam_neurodynamic`). Every other ExamCheckStatus (NEGATIVE /
  // UNCLEAR / LIMITED / NOT_PERFORMED / NOT_YET_CHECKED) and the item being
  // absent all fail to establish support, and unknown is never support
  // (architecture §2.3).
  const directlySupported = rule.requiredDirectionalResponse != null || directlySupportedByExam
  return {
    exerciseId: meta.exerciseId,
    // Opus delta review defect 3: plain-Korean clinic name, never the
    // catalog's (often English) `canonicalName` — that stays reserved for
    // ID/provenance fidelity only.
    title: meta.displayNameKo,
    directlySupported,
    strategyLabelKo: meta.strategyLabelKo,
    startingCriteriaKo: meta.startingCriteriaKo,
    startingDoseKo: meta.startingDoseKo,
    stopReviewKo: meta.stopReviewKo,
    regressionKo: meta.regressionKo,
  }
}

function rankReady(items: LbpRecommendationCandidate[]): LbpRecommendationCandidate[] {
  // No numeric score (architecture §2.2): a stable two-bucket partition,
  // Core declaration order preserved within each bucket.
  return [...items.filter((i) => i.directlySupported), ...items.filter((i) => !i.directlySupported)]
}

/** 팩의 `directSupportByExam` 중 POSITIVE로 기록된 검사가 뒷받침하는 운동 id 집합. */
function directlySupportedExerciseIds(pack: RegionPack, examSuggestions: WorkspaceState['painExamSuggestions']): Set<string> {
  const out = new Set<string>()
  for (const [examId, exerciseIds] of Object.entries(pack.directSupportByExam)) {
    // Batch 2.5b: the comparison is deliberately `=== 'POSITIVE'`, not
    // `!== 'NOT_YET_CHECKED'`, so the two states added in that batch need no
    // change here -- NEGATIVE / UNCLEAR / LIMITED / NOT_PERFORMED /
    // NOT_YET_CHECKED and the item being absent all fall through.
    const exam = examSuggestions.find((i) => i.id === examId)
    if (exam?.result.status === 'POSITIVE') for (const id of exerciseIds) out.add(id)
  }
  return out
}

/**
 * §2.2/G9 (부위 무관 본체): 부위 팩 + `DoctorPayload` + 원장 객관 소견 + 부위별
 * 기록 두 값 + workspace record -> ranked, safety-gated exercise candidates.
 * Pure and safe to call on every render (nothing here is persisted by this
 * module itself). 승인되지 않은 팩(`productionApproved: false`)은 호출부가
 * 먼저 걸러야 하지만, 여기서도 빈 결과를 돌려준다(이중 안전).
 */
export function buildRecommendationContext(
  pack: RegionPack,
  payload: DoctorPayload,
  judgment: RegionJudgmentInputs,
  regionState: RegionRecommendationState,
  workspaceState: Pick<WorkspaceState, 'painFollowUpTargets' | 'painExamSuggestions'>,
): LbpRecommendationResult {
  if (!pack.productionApproved) return EMPTY_RESULT(false, null, null, null)

  // Same recomputed path as lbpEligibilityContext.ts (RF-2) — never the
  // tablet-submission-time snapshot. The pack owns the region's safety logic.
  const safety = pack.evaluateSafety(payload, judgment)
  if (!safety.applicable) return EMPTY_RESULT(false, null, null, null)

  const confirmedStage: LbpExerciseStage | null = regionState.confirmedStage ?? null
  const locked = safety.treatmentSafetyLocked
  const lockedMessage = locked ? TREATMENT_SAFETY_LOCKED_MESSAGE_KO : null

  // RF-3b: disease-safety-not-CLEAR collapses the whole block with one
  // message instead of rendering N individually STOP_REVIEW-ed cards.
  if (!safety.routineCareAllowed) {
    return EMPTY_RESULT(locked, lockedMessage, 'SAFETY_REVIEW', safetyReviewBlockedMessageKo(pack.labelKo), confirmedStage)
  }

  const context = buildEligibilityContextFrom(
    { routineCareAllowed: safety.routineCareAllowed, neuroStatus: safety.neuroStatus },
    pack.directionalResponseApplicable ? regionState.directionalResponse : 'NOT_ASSESSED',
  )

  // RF-3b: new/worsening neuro status also collapses the whole block —
  // LBP_REG_01's intentional requiresStableNeuro:false exception must never
  // read on screen as "exercise is fine, proceed" while this is true.
  if (context.neuroStatus === 'NEW_OR_WORSENING') {
    return EMPTY_RESULT(locked, lockedMessage, 'NEURO_REFRESH', neuroRefreshBlockedMessageKo(pack.labelKo), confirmedStage)
  }

  // 2026-09-05: 0단계 확정 = 능동 운동 미처방. 안전 블록(위 두 개)보다는
  // 뒤에 — 안전 재평가가 필요한 환자에게 0단계 안내문이 그 메시지를 가리면
  // 안 된다. 단계 카드 자체는 이 결과와 무관하게 항상 렌더되므로 원장이
  // 여기서 1단계로 올릴 수 있다.
  if (confirmedStage === 0) {
    return EMPTY_RESULT(locked, lockedMessage, 'STAGE_0', STAGE_0_BLOCKED_MESSAGE_KO, 0)
  }

  const targetFunctionIds = new Set(pack.targetFunctions.map((t) => t.id))
  const selectedTargets = selectedTargetFunctions(targetFunctionIds, workspaceState.painFollowUpTargets)
  const selectedTfs = new Set<string>()
  for (const t of selectedTargets) {
    const mapped = pack.targetFunctionIdToEnum[t.id]
    if (mapped) selectedTfs.add(mapped)
  }
  // (c): distinguish "nothing picked yet" from "only 기타 목표 동작 (custom,
  // free-text) picked" -- the latter has real selections but none of them
  // map to a Core enum (`targetFunctionIdToEnum` intentionally omits the
  // custom id).
  const targetFunctionGap: LbpRecommendationResult['targetFunctionGap'] =
    selectedTargets.length === 0 ? 'NONE_SELECTED' : selectedTfs.size === 0 ? 'CUSTOM_ONLY' : null

  const supportedByExam = directlySupportedExerciseIds(pack, workspaceState.painExamSuggestions)
  const ruleById = eligibilityRulesById(pack.eligibilityRules)

  const found: LbpRecommendationCandidate[] = []
  let neuroDeferred = 0

  for (const meta of pack.coreExercises) {
    // RF-13: guard before calling the engine — a rule missing for a
    // metadata id would otherwise throw (ELIG's own fail-fast, D8).
    const rule = ruleById.get(meta.exerciseId)
    if (!rule) continue
    // Architecture §2.2 "TF 일치": Core ∩ selected target function.
    if (!meta.targetFunctions.some((tf) => selectedTfs.has(tf))) continue
    // 2026-09-05: 확정 단계보다 높은 단계의 운동은 후보에서 뺀다. 미확정(null)
    // 이면 필터 없음 — 옛 기록과 아직 단계를 안 정한 오늘 기록은 기존 그대로
    // 전부 후보.
    if (!isExerciseAllowedAtStage(pack.stageTable, meta.exerciseId, confirmedStage)) continue

    const result = evaluateExerciseEligibility(ruleById, meta.exerciseId, context)
    if (result.state === 'START_AS_WRITTEN') {
      found.push(toCandidate(meta, rule, supportedByExam.has(meta.exerciseId)))
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

/**
 * §2.2/G9 (요통 래퍼): `DoctorPayload` + clinician judgment + workspace record
 * -> ranked, safety-gated exercise candidates. 요통 팩을 넘기고, 부위별 기록
 * 두 값은 옛 저장 필드 그대로 읽는다 — `workspaceState.lbpConfirmedStage`가
 * 유일한 단계 입력이다(제안 단계는 여기서 절대 읽지 않는다: "adopt, never
 * automatic").
 */
export function buildLbpRecommendationContext(
  payload: DoctorPayload,
  lbpObjectiveMotorDeficit: ClinicianJudgment['lbp_objective_motor_deficit'],
  workspaceState: WorkspaceState,
): LbpRecommendationResult {
  return buildRecommendationContext(
    LBP_REGION_PACK,
    payload,
    { lbp_objective_motor_deficit: lbpObjectiveMotorDeficit },
    { directionalResponse: workspaceState.lbpDirectionalResponse, confirmedStage: workspaceState.lbpConfirmedStage ?? null },
    workspaceState,
  )
}

// ---------------------------------------------------------------------------
// Candidate -> RehabSuggestion (merge with persisted clinician decisions)
// ---------------------------------------------------------------------------

/**
 * RF-8: `goal`/`rationale`/`sourceFacts` are built from Core metadata's
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
 * is dropped (never decided, safe to recompute away). 부위와 무관하다.
 */
export function mergeRehabSuggestions(
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

export const mergeLbpRehabSuggestions = mergeRehabSuggestions

/**
 * RF-8's other half: the exact text appended to `PainCarePlan.homeActionPlan`
 * on adopt ("adopt, never automatic" — Part D calls this only from an
 * explicit clinician click). Always dose + stop/review together; never
 * `progressionKo`. Returns null for an id outside the pack's Core set (any
 * RehabSuggestion this module did not itself generate) so the caller can
 * fall back to a generic append built from the suggestion's own title/goal.
 *
 * Opus closing review §C(i): `regressionKo` rows end without terminal
 * punctuation, so appending " 중단·재검토:" directly after them can read as
 * the opposite of what it means. The fixed " — dose 중단·재검토:" shape here
 * keeps a clear sentence boundary regardless of the row's own punctuation.
 */
export function buildAdoptionText(pack: RegionPack, exerciseId: string): string | null {
  const meta = pack.coreExercises.find((m) => m.exerciseId === exerciseId)
  if (!meta) return null
  const stopReviewJoined = meta.stopReviewKo.join('; ')
  return `${meta.displayNameKo} — ${meta.startingDoseKo} 중단·재검토: ${stopReviewJoined}`
}

export function buildLbpAdoptionText(exerciseId: string): string | null {
  return buildAdoptionText(LBP_REGION_PACK, exerciseId)
}

/** Appends the adoption line to an existing free-text home action plan, idempotently (never duplicates the exact same line) and never automatically (only ever called from an explicit clinician click — Part D). */
export function appendAdoptionText(pack: RegionPack, existingHomeActionPlan: string, suggestion: RehabSuggestion): string {
  const text =
    buildAdoptionText(pack, suggestion.id) ??
    [suggestion.title, suggestion.goal].filter((s) => s.trim().length > 0).join(' — ')
  if (!text) return existingHomeActionPlan
  if (existingHomeActionPlan.includes(text)) return existingHomeActionPlan
  return existingHomeActionPlan.trim() ? `${existingHomeActionPlan}\n${text}` : text
}

export function appendLbpAdoptionText(existingHomeActionPlan: string, suggestion: RehabSuggestion): string {
  return appendAdoptionText(LBP_REGION_PACK, existingHomeActionPlan, suggestion)
}

/** 화면 호출부(`DoctorWorkspace.tsx`)가 목표 기능 픽커에 넘기는 목록 — 팩에서 바로 읽을 수 있게 재노출. */
export function packTargetFunctions(pack: RegionPack): FollowUpTarget[] {
  return [...pack.targetFunctions]
}
