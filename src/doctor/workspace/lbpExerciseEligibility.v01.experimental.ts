/**
 * LBP Exercise Eligibility v0.1
 *
 * EXPERIMENTAL ONLY — NOT A RECOMMENDER / NOT PRODUCTION CDS.
 *
 * Purpose:
 * - translate existing Core-20 start/stop/regression concepts into a small,
 *   machine-readable contract;
 * - answer only: "can this exercise be considered now, and at what entry level?";
 * - keep ranking, diagnosis→exercise mapping, patient-facing automation, and
 *   treatment-response thresholds OUT of scope.
 *
 * North Star:
 * - no new patient questions are introduced here;
 * - normalized facts are expected to come from already-collected clinician/patient data;
 * - UNKNOWN never becomes normal/ready;
 * - safety refresh overrides routine exercise eligibility.
 */

import { getLbpCoreExerciseMetadata } from './lbpExerciseCoreMetadata.v01.experimental'

export type LbpExerciseEligibilityState =
  | 'START_AS_WRITTEN'
  | 'START_WITH_REGRESSION'
  | 'DEFER_NOT_READY'
  | 'STOP_REVIEW'

export type LbpExerciseCapability =
  | 'SAFE_WALKING'
  | 'CAN_SELF_PACE'
  | 'QUADRUPED_TOLERATED'
  | 'SUPINE_TOLERATED'
  | 'PRONE_TOLERATED'
  | 'SUPPORTED_STANDING_TOLERATED'
  | 'SITTING_TOLERATED'
  | 'LOW_LOAD_TRUNK_CONTROL'
  | 'HIP_HINGE_CONTROL'
  | 'LOAD_READY'
  | 'BALANCE_WITH_SUPPORT'
  | 'FLEXION_EXPOSURE_TOLERATED'
  | 'EXTENSION_EXPOSURE_TOLERATED'
  | 'NEURAL_SLIDER_TOLERATED'
  | 'NATURAL_BREATHING_TOLERATED'

export type LbpDirectionalResponse =
  | 'FLEXION_FAVORABLE'
  | 'EXTENSION_FAVORABLE'
  | 'NO_CLEAR_DIRECTION'
  | 'NOT_ASSESSED'
  | 'UNCLEAR'

export type LbpExerciseEligibilityContext = {
  routineCareAllowed: boolean
  neuroStatus: 'STABLE' | 'NEW_OR_WORSENING' | 'UNKNOWN'
  distalSymptomResponse: 'STABLE_OR_IMPROVING' | 'WORSENING' | 'UNKNOWN'
  directionalResponse: LbpDirectionalResponse
  capabilities: Partial<Record<LbpExerciseCapability, 'YES' | 'NO' | 'UNKNOWN'>>
}

export type LbpExerciseEligibilityRule = {
  exerciseId: string
  hardRequirements: readonly LbpExerciseCapability[]
  regressibleRequirements: readonly LbpExerciseCapability[]
  requiredDirectionalResponse?: 'FLEXION_FAVORABLE' | 'EXTENSION_FAVORABLE'
  stopOnDistalWorsening: boolean
  requiresStableNeuro: boolean
}

export type LbpExerciseEligibilityResult = {
  exerciseId: string
  state: LbpExerciseEligibilityState
  reasonsKo: readonly string[]
  missingHardRequirements: readonly LbpExerciseCapability[]
  regressionRequirements: readonly LbpExerciseCapability[]
}

function rule(
  exerciseId: string,
  hardRequirements: readonly LbpExerciseCapability[],
  regressibleRequirements: readonly LbpExerciseCapability[],
  options?: {
    requiredDirectionalResponse?: 'FLEXION_FAVORABLE' | 'EXTENSION_FAVORABLE'
    stopOnDistalWorsening?: boolean
    requiresStableNeuro?: boolean
  },
): LbpExerciseEligibilityRule {
  if (!getLbpCoreExerciseMetadata(exerciseId)) {
    throw new Error(`Eligibility rule references non-Core-20 exercise: ${exerciseId}`)
  }
  return {
    exerciseId,
    hardRequirements,
    regressibleRequirements,
    requiredDirectionalResponse: options?.requiredDirectionalResponse,
    stopOnDistalWorsening: options?.stopOnDistalWorsening ?? true,
    requiresStableNeuro: options?.requiresStableNeuro ?? true,
  }
}

/**
 * DRAFT clinical translation of the already-written Core-20 metadata.
 * No rule below ranks one eligible exercise above another.
 */
export const LBP_EXERCISE_ELIGIBILITY_RULES: readonly LbpExerciseEligibilityRule[] = [
  rule('LBP_ACT_01', ['SAFE_WALKING', 'CAN_SELF_PACE'], []),
  rule('LBP_ACT_02', ['CAN_SELF_PACE'], ['SAFE_WALKING']),

  rule('LBP_LUMBAR_02', [], ['QUADRUPED_TOLERATED']),
  rule('LBP_LUMBAR_03', [], ['SUPINE_TOLERATED']),

  rule('LBP_DIR_02', [], ['PRONE_TOLERATED'], {
    requiredDirectionalResponse: 'EXTENSION_FAVORABLE',
  }),
  rule('LBP_DIR_03', ['EXTENSION_EXPOSURE_TOLERATED'], [], {
    requiredDirectionalResponse: 'EXTENSION_FAVORABLE',
  }),
  rule('LBP_DIR_04', ['FLEXION_EXPOSURE_TOLERATED'], [], {
    requiredDirectionalResponse: 'FLEXION_FAVORABLE',
  }),

  rule('LBP_HIP_MOB_01', [], ['SUPPORTED_STANDING_TOLERATED', 'BALANCE_WITH_SUPPORT']),

  rule('LBP_DEEP_TRUNK_01', [], ['SUPINE_TOLERATED']),
  rule('LBP_DEEP_TRUNK_03', ['LOW_LOAD_TRUNK_CONTROL'], ['SUPINE_TOLERATED']),
  rule('LBP_TRUNK_03', ['LOW_LOAD_TRUNK_CONTROL'], ['QUADRUPED_TOLERATED']),
  rule('LBP_TRUNK_END_01', [], ['SUPINE_TOLERATED']),

  rule('LBP_HIP_STR_03', [], ['SUPPORTED_STANDING_TOLERATED', 'BALANCE_WITH_SUPPORT']),
  rule('LBP_FUNC_01', [], ['SUPPORTED_STANDING_TOLERATED', 'BALANCE_WITH_SUPPORT']),
  rule('LBP_FUNC_05', ['HIP_HINGE_CONTROL'], ['SUPPORTED_STANDING_TOLERATED']),
  rule('LBP_LOAD_02', ['HIP_HINGE_CONTROL', 'LOAD_READY'], []),

  rule('LBP_NEURAL_01', ['NEURAL_SLIDER_TOLERATED'], [], {
    stopOnDistalWorsening: true,
    requiresStableNeuro: true,
  }),

  rule('LBP_EXPOSURE_01', ['FLEXION_EXPOSURE_TOLERATED'], [], {
    stopOnDistalWorsening: true,
  }),
  rule('LBP_EXPOSURE_03', [], ['SITTING_TOLERATED']),

  rule('LBP_REG_01', ['NATURAL_BREATHING_TOLERATED'], [], {
    stopOnDistalWorsening: false,
    requiresStableNeuro: false,
  }),
]

const RULE_BY_ID = new Map(LBP_EXERCISE_ELIGIBILITY_RULES.map((item) => [item.exerciseId, item]))

function capabilityValue(
  context: LbpExerciseEligibilityContext,
  capability: LbpExerciseCapability,
): 'YES' | 'NO' | 'UNKNOWN' {
  return context.capabilities[capability] ?? 'UNKNOWN'
}

export function evaluateLbpExerciseEligibility(
  exerciseId: string,
  context: LbpExerciseEligibilityContext,
): LbpExerciseEligibilityResult {
  const rule = RULE_BY_ID.get(exerciseId)
  if (!rule) throw new Error(`No Core-20 eligibility rule for ${exerciseId}`)

  if (!context.routineCareAllowed) {
    return {
      exerciseId,
      state: 'STOP_REVIEW',
      reasonsKo: ['현재는 일반적인 운동 진행보다 안전성 재평가가 우선입니다.'],
      missingHardRequirements: [],
      regressionRequirements: [],
    }
  }

  if (rule.requiresStableNeuro && context.neuroStatus === 'NEW_OR_WORSENING') {
    return {
      exerciseId,
      state: 'STOP_REVIEW',
      reasonsKo: ['새롭거나 악화되는 신경학적 변화가 있어 운동 진행보다 재평가가 우선입니다.'],
      missingHardRequirements: [],
      regressionRequirements: [],
    }
  }

  if (rule.stopOnDistalWorsening && context.distalSymptomResponse === 'WORSENING') {
    return {
      exerciseId,
      state: 'STOP_REVIEW',
      reasonsKo: ['하지 증상이 더 원위부로 진행하는 반응이 있어 현재 운동 진행을 중단하고 다시 평가합니다.'],
      missingHardRequirements: [],
      regressionRequirements: [],
    }
  }

  if (
    rule.requiredDirectionalResponse &&
    context.directionalResponse !== rule.requiredDirectionalResponse
  ) {
    return {
      exerciseId,
      state: 'DEFER_NOT_READY',
      reasonsKo: [
        context.directionalResponse === 'NOT_ASSESSED' || context.directionalResponse === 'UNCLEAR'
          ? '이 운동을 선택할 근거가 되는 방향성 반응이 아직 확인되지 않았습니다.'
          : '현재 확인된 방향성 반응과 이 운동의 시작 조건이 맞지 않습니다.',
      ],
      missingHardRequirements: [],
      regressionRequirements: [],
    }
  }

  const missingHard = rule.hardRequirements.filter((capability) => capabilityValue(context, capability) !== 'YES')
  if (missingHard.length > 0) {
    return {
      exerciseId,
      state: 'DEFER_NOT_READY',
      reasonsKo: ['현재 단계에서 꼭 필요한 준비 조건이 확인되지 않아 이 운동은 보류합니다.'],
      missingHardRequirements: missingHard,
      regressionRequirements: [],
    }
  }

  const regressionNeeds = rule.regressibleRequirements.filter(
    (capability) => capabilityValue(context, capability) !== 'YES',
  )
  if (regressionNeeds.length > 0) {
    return {
      exerciseId,
      state: 'START_WITH_REGRESSION',
      reasonsKo: ['기본 운동을 그대로 시작하기보다 이미 정의된 쉬운 단계(regression)로 시작하는 편이 적절합니다.'],
      missingHardRequirements: [],
      regressionRequirements: regressionNeeds,
    }
  }

  if (rule.requiresStableNeuro && context.neuroStatus === 'UNKNOWN') {
    return {
      exerciseId,
      state: 'DEFER_NOT_READY',
      reasonsKo: ['신경학적 상태가 미확인이라 안정적이라고 가정하지 않습니다.'],
      missingHardRequirements: [],
      regressionRequirements: [],
    }
  }

  return {
    exerciseId,
    state: 'START_AS_WRITTEN',
    reasonsKo: ['현재 확인된 정보에서는 이 운동의 기본 시작 조건을 충족합니다.'],
    missingHardRequirements: [],
    regressionRequirements: [],
  }
}

export function getLbpExerciseEligibilityRule(
  exerciseId: string,
): LbpExerciseEligibilityRule | undefined {
  return RULE_BY_ID.get(exerciseId)
}
