/**
 * LBP Exercise Eligibility (LBP v1 Batch 2, G6/G7).
 *
 * Ported from `lbpExerciseEligibility.v01.experimental.ts` on
 * `origin/claude/feat-lbp-action-adaptive-engine-prototype` (head `b099417`)
 * with every REQUIRED FIX from
 * `docs/LBP_EXERCISE_ELIGIBILITY_OPUS_BOUNDED_VALIDATION_v0.1.md` applied
 * inline (production dependency gate — see that doc's "Required fixes"
 * section for the full clinical reasoning behind each one; this file only
 * restates WHAT changed, not why):
 *
 *   RF-1  : the "neuroStatus === 'UNKNOWN'" check moved from AFTER the
 *           regression return to BEFORE it (still after the hard-requirement
 *           check, so `missingHardRequirements` — the capability-chip render
 *           data — is never lost). Blank-context (nothing confirmed) now
 *           evaluates 20/20 DEFER_NOT_READY, not 8/20 START_WITH_REGRESSION.
 *   RF-4  : LBP_ACT_02 — SAFE_WALKING moved from regressible to hard
 *           (matches ACT_01; a stored regression cannot fix "walking itself
 *           is unsafe").
 *   RF-5  : LBP_FUNC_01 — BALANCE_WITH_SUPPORT promoted to hard (fall/
 *           orthostatic safety precondition, not a regressible deficit);
 *           SUPPORTED_STANDING_TOLERATED stays regressible.
 *   RF-6  : posture-tolerance capabilities promoted hard where the metadata
 *           start criterion IS the posture itself (LUMBAR_02 → hard
 *           QUADRUPED_TOLERATED; TRUNK_03 → hard + QUADRUPED_TOLERATED;
 *           DEEP_TRUNK_03 → hard + SUPINE_TOLERATED; TRUNK_END_01 → hard
 *           SUPINE_TOLERATED). LUMBAR_03 and DEEP_TRUNK_01 stay regressible
 *           — their stored regression genuinely substitutes for the deficit.
 *   RF-7  : LBP_FUNC_05 — HIP_HINGE_CONTROL moved from hard to regressible
 *           (this exercise IS the hip-hinge skill practice; requiring the
 *           skill as a hard gate was circular). SUPPORTED_STANDING_TOLERATED
 *           promoted to hard (the actual safety precondition).
 *   RF-7b : LBP_LOAD_02 — LOAD_READY moved from hard to regressible (a
 *           stored "remove load, raise the start position" regression
 *           exists precisely for this deficit; HIP_HINGE_CONTROL stays hard
 *           — the safety lock is `routineCareAllowed`, not this field).
 *   RF-9(iii): this file's own directional-response type is renamed
 *           `LbpEligibilityDirectionalResponse` (was `LbpDirectionalResponse`)
 *           to avoid colliding with Batch 1's distinct 6-value
 *           `LbpDirectionalResponse` in `lbpExamSuggestions.ts` — the two
 *           are NOT the same type (this one has 5 values and no
 *           DISTAL_WORSENING; see `lbpEligibilityContext.ts` for the
 *           explicit adapter-side translation, RF-9(i)/(ii)).
 *   RF-10 : LBP_DEEP_TRUNK_01 — NATURAL_BREATHING_TOLERATED added as hard
 *           (the metadata's actual start criterion/stop-review is "can
 *           breathe naturally while holding it", not the supine posture;
 *           SUPINE_TOLERATED stays regressible).
 *   RF-12 : comment added below clarifying `distalSymptomResponse: 'UNKNOWN'`
 *           semantics (a first visit has no exercise response yet — this is
 *           expected, not a gap; see `lbpEligibilityContext.ts`'s adapter-side
 *           guard, which must never translate NOT_ASSESSED into
 *           STABLE_OR_IMPROVING).
 *
 * RF-2/RF-3/RF-3b (adapter must use recomputed safety, not the tablet-time
 * snapshot; treatment-safety gates adoption; neuro-refresh collapses the
 * whole recommendation block) live in `lbpEligibilityContext.ts` /
 * `lbpExerciseRecommendation.ts` — this file has no `DoctorPayload`/safety
 * knowledge of its own by design (North Star: "no new patient questions ...
 * ranking, diagnosis→exercise mapping ... OUT of scope" below still holds).
 * RF-8 (adoption text must include stopReviewKo, never progressionKo) and
 * RF-13 (guard unknown exercise ids before calling `evaluateLbpExerciseEligibility`)
 * are recommendation-module concerns and are implemented there.
 *
 * EXPERIMENTAL -> PRODUCTION DEPENDENCY, Batch 2: translate the already-written
 * Core-20 start/stop/regression concepts into a small, machine-readable
 * contract; answer only: "can this exercise be considered now, and at what
 * entry level?"; keep ranking, diagnosis→exercise mapping, patient-facing
 * automation, and treatment-response thresholds OUT of scope.
 *
 * North Star:
 * - no new patient questions are introduced here;
 * - normalized facts are expected to come from already-collected clinician/patient data;
 * - UNKNOWN never becomes normal/ready;
 * - safety refresh overrides routine exercise eligibility.
 */

import { getLbpCoreExerciseMetadata } from './lbpExerciseCoreMetadata'

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

/**
 * RF-9(iii): renamed from `LbpDirectionalResponse` (research branch name) —
 * this is a DIFFERENT, narrower (5-value) type from Batch 1's
 * `LbpDirectionalResponse` (`lbpExamSuggestions.ts`, 6 values, includes
 * `DISTAL_WORSENING`). Never import one where the other is expected; the
 * adapter (`lbpEligibilityContext.ts`) is the one place that translates
 * between them.
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
   * RF-12: `UNKNOWN` means "no exercise response exists yet to read" (a
   * first visit, or a visit where the clinician has not recorded a
   * directional-response chip this session) — it is expected, common, and
   * distinct from a recorded `STABLE_OR_IMPROVING`. The adapter must never
   * collapse the two; see the check below, which only ever branches on the
   * literal `'WORSENING'` value (an UNKNOWN passes through exactly like
   * STABLE_OR_IMPROVING for this specific gate, which is fine — no exercise
   * is stopped merely for lacking a response yet — but no exercise is ever
   * gated as if UNKNOWN meant "confirmed stable" either).
   */
  distalSymptomResponse: 'STABLE_OR_IMPROVING' | 'WORSENING' | 'UNKNOWN'
  directionalResponse: LbpEligibilityDirectionalResponse
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
 * DRAFT clinical translation of the already-written Core-20 metadata, RF-*
 * fixed per this file's header. No rule below ranks one eligible exercise
 * above another.
 */
export const LBP_EXERCISE_ELIGIBILITY_RULES: readonly LbpExerciseEligibilityRule[] = [
  rule('LBP_ACT_01', ['SAFE_WALKING', 'CAN_SELF_PACE'], []),
  // RF-4: SAFE_WALKING hard (was regressible) — matches ACT_01.
  rule('LBP_ACT_02', ['CAN_SELF_PACE', 'SAFE_WALKING'], []),

  // RF-6: QUADRUPED_TOLERATED hard (was regressible) — it is LUMBAR_02's
  // own start criterion, not a substitutable deficit.
  rule('LBP_LUMBAR_02', ['QUADRUPED_TOLERATED'], []),
  // Unchanged (Opus §4 no-action: the stored regression genuinely
  // substitutes for reduced supine tolerance here).
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

  // RF-10: NATURAL_BREATHING_TOLERATED hard — the metadata's real start
  // criterion/stop-review is "breathes naturally", not the supine posture.
  rule('LBP_DEEP_TRUNK_01', ['NATURAL_BREATHING_TOLERATED'], ['SUPINE_TOLERATED']),
  // RF-6: SUPINE_TOLERATED hard (was regressible) — heel slide structurally
  // requires supine.
  rule('LBP_DEEP_TRUNK_03', ['LOW_LOAD_TRUNK_CONTROL', 'SUPINE_TOLERATED'], []),
  // RF-6: QUADRUPED_TOLERATED hard (was regressible) — Bird-dog structurally
  // requires quadruped; its stored regression (arm-only/leg-only) still
  // happens WITHIN quadruped.
  rule('LBP_TRUNK_03', ['LOW_LOAD_TRUNK_CONTROL', 'QUADRUPED_TOLERATED'], []),
  // RF-6: SUPINE_TOLERATED hard (was regressible) — bridge structurally
  // requires supine.
  rule('LBP_TRUNK_END_01', ['SUPINE_TOLERATED'], []),

  rule('LBP_HIP_STR_03', [], ['SUPPORTED_STANDING_TOLERATED', 'BALANCE_WITH_SUPPORT']),
  // RF-5: BALANCE_WITH_SUPPORT promoted to hard — fall/orthostatic safety
  // precondition, not a substitutable deficit; SUPPORTED_STANDING_TOLERATED
  // stays regressible (a real stored regression — higher chair/hand support
  // — addresses it).
  rule('LBP_FUNC_01', ['BALANCE_WITH_SUPPORT'], ['SUPPORTED_STANDING_TOLERATED']),
  // RF-7: swapped — SUPPORTED_STANDING_TOLERATED is the actual safety
  // precondition (hard); HIP_HINGE_CONTROL is the skill this exercise
  // itself teaches (regressible via its own stored cue-based regression),
  // not a prerequisite for attempting it.
  rule('LBP_FUNC_05', ['SUPPORTED_STANDING_TOLERATED'], ['HIP_HINGE_CONTROL']),
  // RF-7b: LOAD_READY moved to regressible — a stored regression ("remove
  // load, raise start position") exists precisely for this deficit; the
  // safety lock is routineCareAllowed, not this field. HIP_HINGE_CONTROL
  // stays hard.
  rule('LBP_LOAD_02', ['HIP_HINGE_CONTROL'], ['LOAD_READY']),

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

  // RF-12: only the literal 'WORSENING' branches here — see this file's
  // LbpExerciseEligibilityContext doc comment for why UNKNOWN must never be
  // treated as if it meant "confirmed stable" elsewhere in this function.
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

  // RF-1 (BLOCKER fix): this check moved here from AFTER the regression
  // return below — it now runs before ANY regression-driven
  // START_WITH_REGRESSION can be reached, so an unconfirmed neurological
  // status can never be masked by a regressible capability deficit.
  // `regressionRequirements` is still included in this DEFER return (not
  // dropped) so the capability-chip UI (lbpExerciseRecommendation.ts's
  // "확인하면 시작 가능" grouping) keeps the same information it would have
  // gotten from the regression branch.
  if (rule.requiresStableNeuro && context.neuroStatus === 'UNKNOWN') {
    return {
      exerciseId,
      state: 'DEFER_NOT_READY',
      reasonsKo: ['신경학적 상태가 미확인이라 안정적이라고 가정하지 않습니다.'],
      missingHardRequirements: [],
      regressionRequirements: regressionNeeds,
    }
  }

  if (regressionNeeds.length > 0) {
    return {
      exerciseId,
      state: 'START_WITH_REGRESSION',
      reasonsKo: ['기본 운동을 그대로 시작하기보다 이미 정의된 쉬운 단계(regression)로 시작하는 편이 적절합니다.'],
      missingHardRequirements: [],
      regressionRequirements: regressionNeeds,
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
