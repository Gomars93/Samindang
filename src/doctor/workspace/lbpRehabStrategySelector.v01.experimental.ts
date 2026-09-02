/**
 * LBP Rehab Strategy Selector v0.1
 *
 * EXPERIMENTAL PURE SELECTOR ONLY — NOT A RECOMMENDER / NOT PRODUCTION CDS.
 *
 * Scope (see `docs/LBP_REHAB_STRATEGY_DECISION_v0.1.md` for the CLOSED
 * clinical authority and `docs/LBP_REHAB_STRATEGY_SONNET_IMPLEMENTATION_BRIEF_v0.1.md`
 * for the implementation contract this file follows):
 *
 * > Among exercises that upstream Eligibility has already allowed, which
 * > 2-3 candidates most directly support the patient's Target Function and
 * > the already-resolved rehab strategy for today?
 *
 * This module does NOT:
 * - decide safety (Eligibility owns that; this module only consumes its result),
 * - diagnose,
 * - derive rehab strategy from raw patient facts, diagnosis labels, Working
 *   Hypothesis, DoctorPayload, SLR/FABER/imaging, or new questionnaire answers,
 * - use numeric scores/weights anywhere in selection.
 *
 * `strategyIntent` below is a normalized synthetic input: already-resolved
 * management intents supplied to the selector, not conclusions this module
 * derives from raw clinical findings.
 *
 * Primary/Secondary tie-break note (read before changing):
 * The CLOSED decision document does not specify which strategy becomes
 * Primary when more than one `...Relevant` flag is `true` at once. This
 * module resolves that only by taking the flags in the same fixed order the
 * strategies are declared in the CLOSED decision document
 * (`STRATEGY_PRECEDENCE_ORDER` below). That order is a deterministic
 * disambiguator for this experimental contract, not a clinical claim that
 * one strategy is more important than another. Any strategy beyond the
 * first two relevant ones is never silently dropped — it is preserved in
 * `deferredRelevantStrategies` for clinician visibility, and no candidate is
 * generated for it this visit. This is called out explicitly for Opus
 * delta-review.
 */

import type {
  LbpExerciseDomain,
  LbpExerciseTargetFunction,
} from './lbpExerciseLibrary.v01.experimental'
import { getLbpExerciseById } from './lbpExerciseLibrary.v01.experimental'
import { getLbpCoreExerciseMetadata } from './lbpExerciseCoreMetadata.v01.experimental'
import type {
  LbpExerciseCapability,
  LbpExerciseEligibilityResult,
} from './lbpExerciseEligibility.v01.experimental'

export type LbpRehabStrategy =
  | 'SYMPTOM_RESPONSE_GUIDED_MOVEMENT'
  | 'PHYSICAL_FUNCTION_CAPACITY'
  | 'NEURAL_MOBILITY_MANAGEMENT'
  | 'GRADED_EXPOSURE_RETURN'

export const LBP_REHAB_STRATEGY_LABEL_KO: Record<LbpRehabStrategy, string> = {
  SYMPTOM_RESPONSE_GUIDED_MOVEMENT: '증상반응 활용',
  PHYSICAL_FUNCTION_CAPACITY: '신체·기능능력 회복',
  NEURAL_MOBILITY_MANAGEMENT: '신경가동성 관리',
  GRADED_EXPOSURE_RETURN: '단계적 노출·복귀',
}

export const LBP_REHAB_REGULATION_LABEL_KO = '호흡·이완 보조'

/** See "Primary/Secondary tie-break note" above. */
export const STRATEGY_PRECEDENCE_ORDER: readonly LbpRehabStrategy[] = [
  'SYMPTOM_RESPONSE_GUIDED_MOVEMENT',
  'PHYSICAL_FUNCTION_CAPACITY',
  'NEURAL_MOBILITY_MANAGEMENT',
  'GRADED_EXPOSURE_RETURN',
]

export type LbpTriBoolean = boolean | 'UNKNOWN'

/**
 * Already-resolved management intents supplied to the selector. This is NOT
 * derived here from raw patient facts, diagnosis, or Working Hypothesis.
 */
export type LbpRehabStrategyIntent = {
  symptomResponseGuidedRelevant: LbpTriBoolean
  physicalFunctionCapacityRelevant: LbpTriBoolean
  neuralMobilityRelevant: LbpTriBoolean
  gradedExposureRelevant: LbpTriBoolean
  regulationRelevant: LbpTriBoolean
}

const STRATEGY_INTENT_KEY: Record<LbpRehabStrategy, keyof LbpRehabStrategyIntent> = {
  SYMPTOM_RESPONSE_GUIDED_MOVEMENT: 'symptomResponseGuidedRelevant',
  PHYSICAL_FUNCTION_CAPACITY: 'physicalFunctionCapacityRelevant',
  NEURAL_MOBILITY_MANAGEMENT: 'neuralMobilityRelevant',
  GRADED_EXPOSURE_RETURN: 'gradedExposureRelevant',
}

/**
 * Static exercise-domain -> rehab-strategy-family projection (brief §8).
 * This is a taxonomy bridge, not a diagnosis -> exercise mapping: it never
 * looks at a patient fact, only at the exercise's own catalog domain.
 */
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

const TARGET_FUNCTION_LABEL_KO: Record<LbpExerciseTargetFunction, string> = {
  FLEXION: '굴곡 동작',
  EXTENSION: '신전 동작',
  SITTING: '앉기',
  STANDING: '서기',
  WALKING: '보행',
  SIT_TO_STAND: '앉았다 일어서기',
  DRESSING: '옷 입기',
  LIFTING: '들기',
  SLEEP: '수면/침상 동작',
  WORK: '작업 복귀',
  CUSTOM: '개별 목표 동작',
}

/** Only these upstream eligibility states may ever become a candidate. */
type LbpEligibleState = 'START_AS_WRITTEN' | 'START_WITH_REGRESSION'

function isEligibleState(state: LbpExerciseEligibilityResult['state']): state is LbpEligibleState {
  return state === 'START_AS_WRITTEN' || state === 'START_WITH_REGRESSION'
}

export type LbpRehabExerciseCandidateSlot = 'PRIMARY' | 'SECONDARY' | 'REGULATION'

export type LbpRehabExerciseCandidate = {
  exerciseId: string
  slot: LbpRehabExerciseCandidateSlot
  strategy: LbpRehabStrategy | 'REGULATION'
  eligibilityState: LbpEligibleState
  matchesTargetFunction: boolean
  /** Preserved from upstream Eligibility; never recomputed here. */
  regressionRequirements: readonly LbpExerciseCapability[]
  rationaleKo: string
}

export type LbpRehabStrategyGap =
  | { type: 'NO_PRIMARY_STRATEGY_RESOLVED' }
  | {
      type: 'NO_MATCHING_ELIGIBLE_EXERCISE'
      slot: LbpRehabExerciseCandidateSlot
      strategy: LbpRehabStrategy | 'REGULATION'
    }

export type LbpRehabRegulationAdjunctState = 'RELEVANT' | 'NOT_RELEVANT' | 'UNKNOWN'

/** A cutoff where more equally-ranked candidates exist than remaining display slots. */
export type LbpRehabStrategyTie = {
  slot: LbpRehabExerciseCandidateSlot
  exerciseIds: readonly string[]
}

export type LbpRehabStrategySelectorInput = {
  targetFunction: LbpExerciseTargetFunction
  strategyIntent: LbpRehabStrategyIntent
  /** Upstream Eligibility results. This selector never recomputes them. */
  eligibility: readonly LbpExerciseEligibilityResult[]
}

export type LbpRehabStrategySelectorResult = {
  status: 'RESOLVED' | 'UNRESOLVED_NO_PRIMARY_STRATEGY'
  targetFunction: LbpExerciseTargetFunction
  primaryStrategy: LbpRehabStrategy | null
  secondaryStrategy: LbpRehabStrategy | null
  /** Relevant strategies beyond Primary/Secondary; preserved, not deleted. */
  deferredRelevantStrategies: readonly LbpRehabStrategy[]
  regulationAdjunctState: LbpRehabRegulationAdjunctState
  /** At most 3 total, per brief §9 step 6. */
  candidates: readonly LbpRehabExerciseCandidate[]
  /** Every candidate considered for Primary/Secondary/Regulation this visit, for audit. */
  eligiblePool: readonly LbpRehabExerciseCandidate[]
  /** `eligiblePool` minus `candidates` — not implicitly negative/ineligible. */
  notSelectedToday: readonly LbpRehabExerciseCandidate[]
  tiedAtCutoff: readonly LbpRehabStrategyTie[]
  gaps: readonly LbpRehabStrategyGap[]
  provenance: 'SYNTHETIC_NORMALIZED_INPUT'
}

type PoolItem = {
  exerciseId: string
  state: LbpEligibleState
  regressionRequirements: readonly LbpExerciseCapability[]
  matchesTargetFunction: boolean
}

function buildProjectedPool(
  eligibility: readonly LbpExerciseEligibilityResult[],
  targetFunction: LbpExerciseTargetFunction,
): Map<LbpRehabStrategy | 'REGULATION', PoolItem[]> {
  const byStrategy = new Map<LbpRehabStrategy | 'REGULATION', PoolItem[]>()

  for (const result of eligibility) {
    if (!isEligibleState(result.state)) continue

    const catalogItem = getLbpExerciseById(result.exerciseId)
    if (!catalogItem) {
      throw new Error(`Eligible exercise not found in catalog: ${result.exerciseId}`)
    }
    const metadata = getLbpCoreExerciseMetadata(result.exerciseId)
    if (!metadata) {
      throw new Error(`Eligible exercise is not a Core-20 item: ${result.exerciseId}`)
    }

    const strategy = STRATEGY_BY_DOMAIN[catalogItem.domain]
    const item: PoolItem = {
      exerciseId: result.exerciseId,
      state: result.state,
      regressionRequirements: result.regressionRequirements,
      matchesTargetFunction: metadata.targetFunctions.includes(targetFunction),
    }

    const bucket = byStrategy.get(strategy)
    if (bucket) bucket.push(item)
    else byStrategy.set(strategy, [item])
  }

  return byStrategy
}

function relevantStrategiesInOrder(intent: LbpRehabStrategyIntent): LbpRehabStrategy[] {
  return STRATEGY_PRECEDENCE_ORDER.filter((strategy) => intent[STRATEGY_INTENT_KEY[strategy]] === true)
}

function resolveRegulationAdjunctState(value: LbpTriBoolean): LbpRehabRegulationAdjunctState {
  if (value === true) return 'RELEVANT'
  if (value === false) return 'NOT_RELEVANT'
  return 'UNKNOWN'
}

function buildRationaleKo(
  item: PoolItem,
  strategy: LbpRehabStrategy | 'REGULATION',
  targetFunction: LbpExerciseTargetFunction,
): string {
  const strategyLabel =
    strategy === 'REGULATION' ? LBP_REHAB_REGULATION_LABEL_KO : LBP_REHAB_STRATEGY_LABEL_KO[strategy]
  const tfLabel = TARGET_FUNCTION_LABEL_KO[targetFunction]
  const base = item.matchesTargetFunction
    ? `${tfLabel} 목표와 직접 연결되는 ${strategyLabel} 운동입니다.`
    : `${strategyLabel} 방향에서 현재 이용 가능한 운동입니다 (목표기능과 정확히 일치하지는 않음).`
  return item.state === 'START_WITH_REGRESSION'
    ? `${base} 다만 기본형이 아니라 이미 정의된 낮은 단계(regression)로 시작합니다.`
    : base
}

/**
 * Fills up to `slotCapacity` (and never more than the shared `budget`
 * remaining across the whole visit) candidates for one strategy slot.
 *
 * Never breaks a tie by array order: Target-Function-matched items are
 * preferred as a group over unmatched items, but if a group is larger than
 * the remaining room, none of that group is silently trimmed — the tie is
 * recorded in `tiedAtCutoff` and the slot is left under-filled instead.
 */
function fillSlot(
  pool: PoolItem[],
  slot: LbpRehabExerciseCandidateSlot,
  strategy: LbpRehabStrategy | 'REGULATION',
  slotCapacity: number,
  budgetRemaining: number,
  targetFunction: LbpExerciseTargetFunction,
  candidatesOut: LbpRehabExerciseCandidate[],
  tiesOut: LbpRehabStrategyTie[],
): number {
  const capacity = Math.min(slotCapacity, budgetRemaining)
  if (capacity <= 0 || pool.length === 0) return 0

  const matched = pool.filter((item) => item.matchesTargetFunction)
  const unmatched = pool.filter((item) => !item.matchesTargetFunction)

  let taken: PoolItem[] = []
  for (const group of [matched, unmatched]) {
    if (group.length === 0) continue
    const room = capacity - taken.length
    if (room <= 0) break
    if (group.length <= room) {
      taken = taken.concat(group)
    } else {
      tiesOut.push({ slot, exerciseIds: group.map((item) => item.exerciseId) })
      break
    }
  }

  for (const item of taken) {
    candidatesOut.push({
      exerciseId: item.exerciseId,
      slot,
      strategy,
      eligibilityState: item.state,
      matchesTargetFunction: item.matchesTargetFunction,
      regressionRequirements: item.regressionRequirements,
      rationaleKo: buildRationaleKo(item, strategy, targetFunction),
    })
  }

  return taken.length
}

export function selectLbpRehabStrategy(
  input: LbpRehabStrategySelectorInput,
): LbpRehabStrategySelectorResult {
  const relevant = relevantStrategiesInOrder(input.strategyIntent)
  const primaryStrategy = relevant[0] ?? null
  const secondaryStrategy = relevant[1] ?? null
  const deferredRelevantStrategies = relevant.slice(2)
  const regulationAdjunctState = resolveRegulationAdjunctState(input.strategyIntent.regulationRelevant)

  const projectedPool = buildProjectedPool(input.eligibility, input.targetFunction)

  const gaps: LbpRehabStrategyGap[] = []
  if (!primaryStrategy) gaps.push({ type: 'NO_PRIMARY_STRATEGY_RESOLVED' })

  const candidates: LbpRehabExerciseCandidate[] = []
  const tiedAtCutoff: LbpRehabStrategyTie[] = []
  const eligiblePool: LbpRehabExerciseCandidate[] = []

  function auditPool(strategy: LbpRehabStrategy | 'REGULATION', slot: LbpRehabExerciseCandidateSlot) {
    const pool = projectedPool.get(strategy) ?? []
    for (const item of pool) {
      eligiblePool.push({
        exerciseId: item.exerciseId,
        slot,
        strategy,
        eligibilityState: item.state,
        matchesTargetFunction: item.matchesTargetFunction,
        regressionRequirements: item.regressionRequirements,
        rationaleKo: buildRationaleKo(item, strategy, input.targetFunction),
      })
    }
    return pool
  }

  if (primaryStrategy) {
    const pool = auditPool(primaryStrategy, 'PRIMARY')
    if (pool.length === 0) {
      gaps.push({ type: 'NO_MATCHING_ELIGIBLE_EXERCISE', slot: 'PRIMARY', strategy: primaryStrategy })
    }
    fillSlot(pool, 'PRIMARY', primaryStrategy, 2, 3 - candidates.length, input.targetFunction, candidates, tiedAtCutoff)
  }

  if (secondaryStrategy) {
    const pool = auditPool(secondaryStrategy, 'SECONDARY')
    if (pool.length === 0) {
      gaps.push({ type: 'NO_MATCHING_ELIGIBLE_EXERCISE', slot: 'SECONDARY', strategy: secondaryStrategy })
    }
    fillSlot(pool, 'SECONDARY', secondaryStrategy, 1, 3 - candidates.length, input.targetFunction, candidates, tiedAtCutoff)
  }

  if (regulationAdjunctState === 'RELEVANT') {
    const pool = auditPool('REGULATION', 'REGULATION')
    if (pool.length === 0) {
      gaps.push({ type: 'NO_MATCHING_ELIGIBLE_EXERCISE', slot: 'REGULATION', strategy: 'REGULATION' })
    }
    fillSlot(pool, 'REGULATION', 'REGULATION', 1, 3 - candidates.length, input.targetFunction, candidates, tiedAtCutoff)
  }

  const selectedIds = new Set(candidates.map((candidate) => candidate.exerciseId))
  const notSelectedToday = eligiblePool.filter((candidate) => !selectedIds.has(candidate.exerciseId))

  return {
    status: primaryStrategy ? 'RESOLVED' : 'UNRESOLVED_NO_PRIMARY_STRATEGY',
    targetFunction: input.targetFunction,
    primaryStrategy,
    secondaryStrategy,
    deferredRelevantStrategies,
    regulationAdjunctState,
    candidates,
    eligiblePool,
    notSelectedToday,
    tiedAtCutoff,
    gaps,
    provenance: 'SYNTHETIC_NORMALIZED_INPUT',
  }
}
