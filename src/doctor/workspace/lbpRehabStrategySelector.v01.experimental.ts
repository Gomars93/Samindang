/**
 * LBP Rehab Strategy Selector v0.1
 *
 * EXPERIMENTAL PURE SELECTOR ONLY — NOT A RECOMMENDER / NOT PRODUCTION CDS.
 *
 * Scope:
 * > Among exercises that upstream Eligibility has already allowed, which
 * > small set most directly supports the patient's Target Function and an
 * > already-resolved Primary/Secondary rehab strategy for today?
 *
 * Hard boundary:
 * - this module does NOT decide safety;
 * - this module does NOT diagnose;
 * - this module does NOT derive Primary/Secondary strategy from patient facts,
 *   Working Hypothesis, DoctorPayload, SLR/FABER/imaging, or questionnaire data;
 * - this module does NOT invent a strategy precedence rule;
 * - this module does NOT use numeric scores/weights.
 *
 * Primary/Secondary are normalized upstream inputs. That keeps the experimental
 * exact-exercise selector inside the CLOSED taxonomy without silently creating
 * new patient->strategy clinical semantics.
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

/** Taxonomy membership only. Array position MUST NOT be used as clinical precedence. */
export const LBP_REHAB_STRATEGIES: readonly LbpRehabStrategy[] = [
  'SYMPTOM_RESPONSE_GUIDED_MOVEMENT',
  'PHYSICAL_FUNCTION_CAPACITY',
  'NEURAL_MOBILITY_MANAGEMENT',
  'GRADED_EXPOSURE_RETURN',
]

export const LBP_REHAB_STRATEGY_LABEL_KO: Record<LbpRehabStrategy, string> = {
  SYMPTOM_RESPONSE_GUIDED_MOVEMENT: '증상반응 활용',
  PHYSICAL_FUNCTION_CAPACITY: '신체·기능능력 회복',
  NEURAL_MOBILITY_MANAGEMENT: '신경가동성 관리',
  GRADED_EXPOSURE_RETURN: '단계적 노출·복귀',
}

export const LBP_REHAB_REGULATION_LABEL_KO = '호흡·이완 보조'

export type LbpTriBoolean = boolean | 'UNKNOWN'

/**
 * Already-resolved strategy selection supplied to this exact-exercise selector.
 * How patient facts become Primary/Secondary remains OUTSIDE this module.
 */
export type LbpResolvedRehabStrategySelection = {
  primaryStrategy: LbpRehabStrategy | null
  secondaryStrategy: LbpRehabStrategy | null
  regulationRelevant: LbpTriBoolean
}

/**
 * Static exercise-domain -> rehab-strategy-family projection.
 * This is a taxonomy bridge only; it never interprets patient findings.
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
  strategySelection: LbpResolvedRehabStrategySelection
  /** Upstream Eligibility results. This selector never recomputes them. */
  eligibility: readonly LbpExerciseEligibilityResult[]
}

export type LbpRehabStrategySelectorResult = {
  status: 'RESOLVED' | 'UNRESOLVED_NO_PRIMARY_STRATEGY'
  targetFunction: LbpExerciseTargetFunction
  primaryStrategy: LbpRehabStrategy | null
  secondaryStrategy: LbpRehabStrategy | null
  regulationAdjunctState: LbpRehabRegulationAdjunctState
  /** At most 3 total. */
  candidates: readonly LbpRehabExerciseCandidate[]
  /** Every eligible item considered in the selected strategy slots for audit. */
  eligiblePool: readonly LbpRehabExerciseCandidate[]
  /** `eligiblePool` minus `candidates` — never interpreted as ineligible/negative. */
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

function validateResolvedStrategySelection(selection: LbpResolvedRehabStrategySelection): void {
  if (!selection.primaryStrategy && selection.secondaryStrategy) {
    throw new Error('Secondary rehab strategy cannot exist without a resolved Primary strategy.')
  }
  if (
    selection.primaryStrategy &&
    selection.secondaryStrategy &&
    selection.primaryStrategy === selection.secondaryStrategy
  ) {
    throw new Error('Secondary rehab strategy must be distinct from Primary strategy.')
  }
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
    : `${strategyLabel} 방향에서 현재 이용 가능한 운동이지만 ${tfLabel} 목표와 직접 연결되지는 않습니다.`
  return item.state === 'START_WITH_REGRESSION'
    ? `${base} 다만 기본형이 아니라 이미 정의된 낮은 단계(regression)로 시작합니다.`
    : base
}

function toCandidate(
  item: PoolItem,
  slot: LbpRehabExerciseCandidateSlot,
  strategy: LbpRehabStrategy | 'REGULATION',
  targetFunction: LbpExerciseTargetFunction,
): LbpRehabExerciseCandidate {
  return {
    exerciseId: item.exerciseId,
    slot,
    strategy,
    eligibilityState: item.state,
    matchesTargetFunction: item.matchesTargetFunction,
    regressionRequirements: item.regressionRequirements,
    rationaleKo: buildRationaleKo(item, strategy, targetFunction),
  }
}

/**
 * Primary/Secondary slots require an exact Target Function link.
 * If more equally eligible exact matches exist than the slot can show, this
 * module reports a tie instead of selecting a winner by source/catalog order.
 */
function fillTargetFunctionMatchedSlot(
  pool: readonly PoolItem[],
  slot: 'PRIMARY' | 'SECONDARY',
  strategy: LbpRehabStrategy,
  slotCapacity: number,
  budgetRemaining: number,
  targetFunction: LbpExerciseTargetFunction,
  candidatesOut: LbpRehabExerciseCandidate[],
  tiesOut: LbpRehabStrategyTie[],
): number {
  const capacity = Math.min(slotCapacity, budgetRemaining)
  if (capacity <= 0) return 0

  const matched = pool.filter((item) => item.matchesTargetFunction)
  if (matched.length === 0) return 0

  if (matched.length > capacity) {
    tiesOut.push({ slot, exerciseIds: matched.map((item) => item.exerciseId) })
    return 0
  }

  for (const item of matched) {
    candidatesOut.push(toCandidate(item, slot, strategy, targetFunction))
  }
  return matched.length
}

/** Regulation is an adjunct, so an exact Target Function link is not required. */
function fillRegulationSlot(
  pool: readonly PoolItem[],
  budgetRemaining: number,
  targetFunction: LbpExerciseTargetFunction,
  candidatesOut: LbpRehabExerciseCandidate[],
  tiesOut: LbpRehabStrategyTie[],
): number {
  const capacity = Math.min(1, budgetRemaining)
  if (capacity <= 0 || pool.length === 0) return 0

  if (pool.length > capacity) {
    tiesOut.push({ slot: 'REGULATION', exerciseIds: pool.map((item) => item.exerciseId) })
    return 0
  }

  candidatesOut.push(toCandidate(pool[0], 'REGULATION', 'REGULATION', targetFunction))
  return 1
}

export function selectLbpRehabStrategy(
  input: LbpRehabStrategySelectorInput,
): LbpRehabStrategySelectorResult {
  validateResolvedStrategySelection(input.strategySelection)

  const primaryStrategy = input.strategySelection.primaryStrategy
  const secondaryStrategy = input.strategySelection.secondaryStrategy
  const regulationAdjunctState = resolveRegulationAdjunctState(input.strategySelection.regulationRelevant)
  const projectedPool = buildProjectedPool(input.eligibility, input.targetFunction)

  const gaps: LbpRehabStrategyGap[] = []
  if (!primaryStrategy) gaps.push({ type: 'NO_PRIMARY_STRATEGY_RESOLVED' })

  const candidates: LbpRehabExerciseCandidate[] = []
  const tiedAtCutoff: LbpRehabStrategyTie[] = []
  const eligiblePool: LbpRehabExerciseCandidate[] = []

  function auditPool(strategy: LbpRehabStrategy | 'REGULATION', slot: LbpRehabExerciseCandidateSlot) {
    const pool = projectedPool.get(strategy) ?? []
    for (const item of pool) {
      eligiblePool.push(toCandidate(item, slot, strategy, input.targetFunction))
    }
    return pool
  }

  if (primaryStrategy) {
    const pool = auditPool(primaryStrategy, 'PRIMARY')
    const matching = pool.filter((item) => item.matchesTargetFunction)
    if (matching.length === 0) {
      gaps.push({ type: 'NO_MATCHING_ELIGIBLE_EXERCISE', slot: 'PRIMARY', strategy: primaryStrategy })
    }
    fillTargetFunctionMatchedSlot(
      pool,
      'PRIMARY',
      primaryStrategy,
      2,
      3 - candidates.length,
      input.targetFunction,
      candidates,
      tiedAtCutoff,
    )
  }

  if (secondaryStrategy) {
    const pool = auditPool(secondaryStrategy, 'SECONDARY')
    const matching = pool.filter((item) => item.matchesTargetFunction)
    if (matching.length === 0) {
      gaps.push({ type: 'NO_MATCHING_ELIGIBLE_EXERCISE', slot: 'SECONDARY', strategy: secondaryStrategy })
    }
    fillTargetFunctionMatchedSlot(
      pool,
      'SECONDARY',
      secondaryStrategy,
      1,
      3 - candidates.length,
      input.targetFunction,
      candidates,
      tiedAtCutoff,
    )
  }

  if (regulationAdjunctState === 'RELEVANT') {
    const pool = auditPool('REGULATION', 'REGULATION')
    if (pool.length === 0) {
      gaps.push({ type: 'NO_MATCHING_ELIGIBLE_EXERCISE', slot: 'REGULATION', strategy: 'REGULATION' })
    }
    fillRegulationSlot(
      pool,
      3 - candidates.length,
      input.targetFunction,
      candidates,
      tiedAtCutoff,
    )
  }

  const selectedIds = new Set(candidates.map((candidate) => candidate.exerciseId))
  const notSelectedToday = eligiblePool.filter((candidate) => !selectedIds.has(candidate.exerciseId))

  return {
    status: primaryStrategy ? 'RESOLVED' : 'UNRESOLVED_NO_PRIMARY_STRATEGY',
    targetFunction: input.targetFunction,
    primaryStrategy,
    secondaryStrategy,
    regulationAdjunctState,
    candidates,
    eligiblePool,
    notSelectedToday,
    tiedAtCutoff,
    gaps,
    provenance: 'SYNTHETIC_NORMALIZED_INPUT',
  }
}
