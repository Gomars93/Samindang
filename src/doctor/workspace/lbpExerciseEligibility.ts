/**
 * LBP Exercise Eligibility — 안전 게이트만 남은 판정기.
 *
 * ---------------------------------------------------------------------------
 * 2026-09-05 (원장 결정): 준비조건(capability) 게이트를 **제거**했다
 * ---------------------------------------------------------------------------
 * 원장 지적: *"준비조건 15개를 내가 육안으로 빠르게 처리하면 되는 거 아닌가?"*
 *
 * 확인한 사실 두 가지:
 *
 * 1. **그 기록은 어디로도 가지 않았다.** `lbpConfirmedCapabilities`/
 *    `lbpDeniedCapabilities`는 EMR·재진 이어받기·환자 안내문 어디에도 도달하지
 *    않았고, 유일한 소비자가 같은 화면 같은 세션의 이 게이트였다. 즉 탭의 유일한
 *    효과는 "시스템이 목록을 열어주는 것"이었다 — 원장이 이미 판단을 끝낸 뒤에.
 * 2. **채택하는 행위 자체가 이미 확인이다.** 원장이 "네발기기 팔다리 뻗기"를
 *    채택한다는 것은 그 환자가 네발기기를 할 수 있다고 판단했다는 뜻이다.
 *    채택 *전에* `QUADRUPED_TOLERATED`를 따로 확인하게 한 것은 같은 질문을 두 번
 *    한 것이다.
 *
 * **임상 정보는 하나도 잃지 않는다.** 삭제한 capability enum은
 * `lbpExerciseCoreMetadata.ts`의 `startingCriteriaKo`를 기계용으로 사본한
 * 것이었고(대조 확인함 — 예: LBP_FUNC_01의 `BALANCE_WITH_SUPPORT` =
 * "낙상 위험이나 심한 기립성 증상이 별도 평가 없이 남아 있지 않음"), 사람이 읽는
 * 원본 쪽이 오히려 더 풍부하다(증상 조건 절을 함께 담는다). 그 원문이 이제 후보
 * 카드에 **시작 기준**으로 표시되고 원장이 눈으로 읽는다.
 *
 * 그래서 이 배치가 폐기하는 것은 RF-4/5/6/7/7b/10의 임상 판단이 아니라 그것을
 * 담고 있던 **중복 표현**뿐이다. 원 판단은 `startingCriteriaKo` 20행에 그대로
 * 살아 있다.
 *
 * 폐기된 PO 결정: CD-1(2026-09-02, 미확인 준비조건 → 확인 전 보류),
 * CD-3(2026-09-02, capability chip 3상태). `DECISIONS.md` 2026-09-05
 * "준비조건 게이트 제거" 항목에 이유와 함께 기록.
 *
 * ---------------------------------------------------------------------------
 * 남아 있는 안전 게이트 (이번 배치에서 한 줄도 바뀌지 않음)
 * ---------------------------------------------------------------------------
 * 1. `routineCareAllowed`      — 질환 안전(적색기·마미증후군 등) 미해결 → STOP_REVIEW
 * 2. `neuroStatus`             — NEW_OR_WORSENING → STOP_REVIEW / UNKNOWN → DEFER (RF-1:
 *                                미확인을 "안정"으로 가정하지 않는다)
 * 3. `distalSymptomResponse`   — WORSENING → STOP_REVIEW (RF-12: UNKNOWN은
 *                                "확인된 안정"이 아니지만 이 게이트만은 통과시킨다.
 *                                아직 반응을 볼 기회가 없었다는 이유로 운동을
 *                                멈추지는 않는다)
 * 4. `requiredDirectionalResponse` — 방향성 반응이 이 운동의 시작 조건과 다르면 DEFER
 *
 * 여기에 더해 이 모듈 바깥에서: `treatmentSafetyLocked`(임신 등 → 채택 잠금),
 * 각 운동의 `stopReviewKo`(카드에 표시), 그리고 **원장의 명시적 채택** —
 * 이것 없이는 어떤 운동도 환자에게 나가지 않는다.
 *
 * North Star (유지):
 * - 새 환자 질문을 만들지 않는다;
 * - UNKNOWN이 정상/준비완료가 되지 않는다;
 * - 안전 재평가가 일상적 운동 적격성보다 우선한다.
 */

import { getLbpCoreExerciseMetadata } from './lbpExerciseCoreMetadata'

export type LbpExerciseEligibilityState = 'START_AS_WRITTEN' | 'DEFER_NOT_READY' | 'STOP_REVIEW'

/**
 * RF-9(iii): Batch 1의 6값 `LbpDirectionalResponse`(`lbpExamSuggestions.ts`,
 * `DISTAL_WORSENING` 포함)와는 **다른** 5값 타입이다. 서로 대입하지 말 것 —
 * 변환은 `lbpEligibilityContext.ts` 한 곳에서만 한다.
 */
export type LbpEligibilityDirectionalResponse =
  | 'FLEXION_FAVORABLE'
  | 'EXTENSION_FAVORABLE'
  | 'NO_CLEAR_DIRECTION'
  | 'NOT_ASSESSED'
  | 'UNCLEAR'

export type LbpExerciseEligibilityContext = {
  routineCareAllowed: boolean
  neuroStatus: 'STABLE' | 'NEW_OR_WORSENING' | 'UNKNOWN'
  /**
   * RF-12: `UNKNOWN`은 "아직 읽을 운동 반응이 없다"(초진, 또는 이번 세션에
   * 방향성 반응 chip을 기록하지 않음)는 뜻이고, 기록된 `STABLE_OR_IMPROVING`과
   * 는 분명히 다르다. 아래 게이트는 리터럴 `'WORSENING'`에서만 분기한다 —
   * 반응이 아직 없다는 이유로 운동을 멈추지는 않되, UNKNOWN을 "확인된 안정"으로
   * 취급하지도 않는다.
   */
  distalSymptomResponse: 'STABLE_OR_IMPROVING' | 'WORSENING' | 'UNKNOWN'
  directionalResponse: LbpEligibilityDirectionalResponse
}

export type LbpExerciseEligibilityRule = {
  exerciseId: string
  requiredDirectionalResponse?: 'FLEXION_FAVORABLE' | 'EXTENSION_FAVORABLE'
  stopOnDistalWorsening: boolean
  requiresStableNeuro: boolean
}

export type LbpExerciseEligibilityResult = {
  exerciseId: string
  state: LbpExerciseEligibilityState
  reasonsKo: readonly string[]
}

export type EligibilityRuleOptions = {
  requiredDirectionalResponse?: 'FLEXION_FAVORABLE' | 'EXTENSION_FAVORABLE'
  stopOnDistalWorsening?: boolean
  requiresStableNeuro?: boolean
}

/**
 * 부위 팩 일반화(2026-09-06): 규칙 한 행을 만든다. `isKnownExercise`가 false를
 * 돌려주면 던진다 — Core 세트 밖의 id를 가리키는 규칙은 조용히 무시되지 않고
 * 로드 시점에 실패한다(요통 D8 fail-fast 그대로). 기본값은 요통과 같다:
 * 원위 악화 시 중단 = true, 신경 안정 필요 = true. 다른 부위 팩이 이 기본값을
 * 바꾸려면 행마다 명시한다(원장 승인 문서에 그 이유가 있어야 한다).
 */
export function buildEligibilityRule(
  isKnownExercise: (exerciseId: string) => boolean,
  exerciseId: string,
  options?: EligibilityRuleOptions,
  unknownExerciseMessage: string = 'Eligibility rule references an exercise outside the Core set',
): LbpExerciseEligibilityRule {
  if (!isKnownExercise(exerciseId)) {
    throw new Error(`${unknownExerciseMessage}: ${exerciseId}`)
  }
  return {
    exerciseId,
    requiredDirectionalResponse: options?.requiredDirectionalResponse,
    stopOnDistalWorsening: options?.stopOnDistalWorsening ?? true,
    requiresStableNeuro: options?.requiresStableNeuro ?? true,
  }
}

function rule(exerciseId: string, options?: EligibilityRuleOptions): LbpExerciseEligibilityRule {
  return buildEligibilityRule(
    (id) => getLbpCoreExerciseMetadata(id) !== undefined,
    exerciseId,
    options,
    'Eligibility rule references non-Core-20 exercise',
  )
}

/**
 * Core-20 × 안전 게이트. 어떤 규칙도 적격한 운동들 사이에 순위를 매기지 않는다.
 * 각 운동의 **시작 조건**은 이 표가 아니라 `lbpExerciseCoreMetadata.ts`의
 * `startingCriteriaKo`에 있고, 후보 카드에 그대로 표시된다.
 */
export const LBP_EXERCISE_ELIGIBILITY_RULES: readonly LbpExerciseEligibilityRule[] = [
  rule('LBP_ACT_01'),
  rule('LBP_ACT_02'),

  rule('LBP_LUMBAR_02'),
  rule('LBP_LUMBAR_03'),

  rule('LBP_DIR_02', { requiredDirectionalResponse: 'EXTENSION_FAVORABLE' }),
  rule('LBP_DIR_03', { requiredDirectionalResponse: 'EXTENSION_FAVORABLE' }),
  rule('LBP_DIR_04', { requiredDirectionalResponse: 'FLEXION_FAVORABLE' }),

  rule('LBP_HIP_MOB_01'),

  rule('LBP_DEEP_TRUNK_01'),
  rule('LBP_DEEP_TRUNK_03'),
  rule('LBP_TRUNK_03'),
  rule('LBP_TRUNK_END_01'),

  rule('LBP_HIP_STR_03'),
  rule('LBP_FUNC_01'),
  rule('LBP_FUNC_05'),
  rule('LBP_LOAD_02'),

  rule('LBP_NEURAL_01', { stopOnDistalWorsening: true, requiresStableNeuro: true }),

  rule('LBP_EXPOSURE_01', { stopOnDistalWorsening: true }),
  rule('LBP_EXPOSURE_03'),

  // 호흡·이완만은 신경학적 상태 미확인에도 보류하지 않는다 — 자세 부하가 없고,
  // 이 운동을 막을 근거가 어떤 신경학적 소견에도 없다.
  rule('LBP_REG_01', { stopOnDistalWorsening: false, requiresStableNeuro: false }),
]

/** 규칙 배열 → id 맵. 팩마다 한 번 만들어 두고 `evaluateExerciseEligibility`에 넘긴다. */
export function eligibilityRulesById(
  rules: readonly LbpExerciseEligibilityRule[],
): ReadonlyMap<string, LbpExerciseEligibilityRule> {
  return new Map(rules.map((item) => [item.exerciseId, item]))
}

const RULE_BY_ID = eligibilityRulesById(LBP_EXERCISE_ELIGIBILITY_RULES)

export function evaluateLbpExerciseEligibility(
  exerciseId: string,
  context: LbpExerciseEligibilityContext,
): LbpExerciseEligibilityResult {
  if (!RULE_BY_ID.has(exerciseId)) throw new Error(`No Core-20 eligibility rule for ${exerciseId}`)
  return evaluateExerciseEligibility(RULE_BY_ID, exerciseId, context)
}

/**
 * 부위 팩 일반화(2026-09-06): 같은 4단 안전 게이트를 임의의 규칙 맵에 대해
 * 판정한다. 게이트의 순서·문장·리터럴 비교(`=== 'WORSENING'`,
 * `=== 'UNKNOWN'`)는 요통 원본 그대로이며, 테스트가 소스 텍스트로 고정한다.
 */
export function evaluateExerciseEligibility(
  ruleById: ReadonlyMap<string, LbpExerciseEligibilityRule>,
  exerciseId: string,
  context: LbpExerciseEligibilityContext,
): LbpExerciseEligibilityResult {
  const rule = ruleById.get(exerciseId)
  if (!rule) throw new Error(`No eligibility rule for ${exerciseId}`)

  if (!context.routineCareAllowed) {
    return {
      exerciseId,
      state: 'STOP_REVIEW',
      reasonsKo: ['현재는 일반적인 운동 진행보다 안전성 재평가가 우선입니다.'],
    }
  }

  if (rule.requiresStableNeuro && context.neuroStatus === 'NEW_OR_WORSENING') {
    return {
      exerciseId,
      state: 'STOP_REVIEW',
      reasonsKo: ['새롭거나 악화되는 신경학적 변화가 있어 운동 진행보다 재평가가 우선입니다.'],
    }
  }

  // RF-12: 리터럴 'WORSENING'에서만 분기한다 — 위 `distalSymptomResponse`
  // 주석 참고.
  if (rule.stopOnDistalWorsening && context.distalSymptomResponse === 'WORSENING') {
    return {
      exerciseId,
      state: 'STOP_REVIEW',
      reasonsKo: ['하지 증상이 더 원위부로 진행하는 반응이 있어 현재 운동 진행을 중단하고 다시 평가합니다.'],
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
    }
  }

  // RF-1: 신경학적 상태 미확인을 "안정"으로 가정하지 않는다. 준비조건 게이트가
  // 사라진 뒤에도 이 게이트는 그대로다 — 미확인은 원장이 1탭으로 해소한다
  // (`ObjectiveExamFindingsCard`), 15탭이 아니라.
  if (rule.requiresStableNeuro && context.neuroStatus === 'UNKNOWN') {
    return {
      exerciseId,
      state: 'DEFER_NOT_READY',
      reasonsKo: ['신경학적 상태가 미확인이라 안정적이라고 가정하지 않습니다.'],
    }
  }

  return {
    exerciseId,
    state: 'START_AS_WRITTEN',
    reasonsKo: ['현재 확인된 정보에서는 이 운동의 안전 조건을 충족합니다 — 시작 기준은 카드에서 직접 확인하세요.'],
  }
}

export function getLbpExerciseEligibilityRule(
  exerciseId: string,
): LbpExerciseEligibilityRule | undefined {
  return RULE_BY_ID.get(exerciseId)
}

// 부위 무관 별칭 — 타입 자체에 요통 고유 의미는 없다(안전 게이트 4개는 전 부위 공통 개념).
export type ExerciseEligibilityState = LbpExerciseEligibilityState
export type ExerciseEligibilityContext = LbpExerciseEligibilityContext
export type ExerciseEligibilityRule = LbpExerciseEligibilityRule
export type ExerciseEligibilityResult = LbpExerciseEligibilityResult
