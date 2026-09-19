/**
 * LBP v1 Batch 1 (G1) — Target Function chip taxonomy for the "재평가 대상"
 * picker (FollowUpTargetPicker.tsx / finalAssessment.ts's FollowUpTarget).
 *
 * This is deliberately NOT a new field/type/screen: it is just a labeled
 * set of `FollowUpTarget` options (same shape PAIN_FOLLOW_UP_OPTIONS/
 * HERBAL_FOLLOW_UP_OPTIONS already use) so a structured "목표 기능" anchor
 * rides the exact existing tracking/history/EMR/micro-follow-up plumbing
 * that every other follow-up target already goes through -- no separate
 * persistence field, no separate render path.
 *
 * Docs ref: LBP_PRODUCTION_V1_MINIMAL_ARCHITECTURE_v0.1.md §7.2 (G1).
 */
import { followUpTarget, type FollowUpTarget } from './finalAssessment'
import type { LbpExerciseTargetFunction } from './lbpExerciseLibrary'

export const LBP_TARGET_FUNCTION_OPTIONS: FollowUpTarget[] = [
  followUpTarget('lbp_tf_walking', '걷기'),
  followUpTarget('lbp_tf_sitting', '앉기'),
  followUpTarget('lbp_tf_standing', '서기'),
  followUpTarget('lbp_tf_sit_to_stand', '앉았다 일어서기'),
  followUpTarget('lbp_tf_dressing', '옷 입기·양말 신기'),
  followUpTarget('lbp_tf_lifting', '물건 들기'),
  followUpTarget('lbp_tf_sleep', '수면·침상 동작'),
  followUpTarget('lbp_tf_work', '업무·집안일 복귀'),
  followUpTarget('lbp_tf_custom', '기타 목표 동작'),
]

const LBP_TARGET_FUNCTION_IDS = new Set(LBP_TARGET_FUNCTION_OPTIONS.map((o) => o.id))

/**
 * 태블릿 `LBP_15`(목표 task) 값 → 위 chip id. **coreSpec의 9개 값과 1:1**이며,
 * 한쪽만 늘리면 환자가 고른 목표가 원장 화면에 도달하지 못한 채 조용히 사라진다.
 * `tests/lbp-exercise-recommendation.spec.mjs`가 양방향 전사(9↔9, onto)를 단언한다.
 *
 * `OTHER` → `lbp_tf_custom`: 자유 목표는 Core-20 enum에 매칭되지 않지만(이 파일
 * 아래 `LBP_TARGET_FUNCTION_ID_TO_ENUM` 주석 참조) **재평가 대상으로는 유효**하다 —
 * 다음 방문에 같은 동작으로 비교하는 것이 목적이기 때문이다.
 */
export const LBP_TARGET_TASK_TO_CHIP_ID: Readonly<Record<string, string>> = Object.freeze({
  WALKING: 'lbp_tf_walking',
  SITTING: 'lbp_tf_sitting',
  STANDING: 'lbp_tf_standing',
  SIT_TO_STAND: 'lbp_tf_sit_to_stand',
  DRESSING: 'lbp_tf_dressing',
  LIFTING: 'lbp_tf_lifting',
  SLEEP: 'lbp_tf_sleep',
  WORK: 'lbp_tf_work',
  OTHER: 'lbp_tf_custom',
})

/**
 * 환자가 고른 목표 task 하나를 chip으로 바꾼다. 값이 없거나 모르는 값이면
 * **null** — 기본값을 지어내지 않는다(fail closed). 호출부는
 * `DoctorWorkspace.seedWorkspaceState` 하나뿐이며, **한 번도 저장된 적 없는
 * 기록에만** 적용한다(저장본을 덮어쓰지 않는다).
 */
export function lbpTargetFunctionFromPatientAnswer(raw: unknown): FollowUpTarget | null {
  if (typeof raw !== 'string') return null
  const id = LBP_TARGET_TASK_TO_CHIP_ID[raw]
  if (id === undefined) return null
  return LBP_TARGET_FUNCTION_OPTIONS.find((o) => o.id === id) ?? null
}

export function isLbpTargetFunctionId(id: string): boolean {
  return LBP_TARGET_FUNCTION_IDS.has(id)
}

export function selectedLbpTargetFunctions(targets: FollowUpTarget[]): FollowUpTarget[] {
  return selectedTargetFunctions(LBP_TARGET_FUNCTION_IDS, targets)
}

/** 부위 팩 일반화(2026-09-06): 팩의 목표 기능 id 집합에 속한 재평가 대상만 고른다. */
export function selectedTargetFunctions(ids: ReadonlySet<string>, targets: FollowUpTarget[]): FollowUpTarget[] {
  return targets.filter((t) => ids.has(t.id))
}

/**
 * `lbp_tf_*` id <-> Core-20 `targetFunctions` enum (architecture §2.2 "TF 일치").
 * 원래 `lbpExerciseRecommendation.ts`에 있던 표를 그대로 옮겼다 — 요통 팩이
 * 추천 모듈을 import하지 않고도 이 표를 가질 수 있게(순환 import 방지).
 *
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
export const LBP_TARGET_FUNCTION_ID_TO_ENUM: Record<string, LbpExerciseTargetFunction | undefined> = {
  lbp_tf_walking: 'WALKING',
  lbp_tf_sitting: 'SITTING',
  lbp_tf_standing: 'STANDING',
  lbp_tf_sit_to_stand: 'SIT_TO_STAND',
  lbp_tf_dressing: 'DRESSING',
  lbp_tf_lifting: 'LIFTING',
  lbp_tf_sleep: 'SLEEP',
  lbp_tf_work: 'WORK',
}

/**
 * "기타 목표 동작"은 라벨만으로는 무엇을 적어야 하는지 불명확하므로,
 * 기준값 입력칸에 실제 동작을 적도록 안내하는 placeholder를 별도로
 * 제공한다 (FollowUpTargetPicker의 선택적 `placeholders` prop으로 전달).
 */
export const LBP_TARGET_FUNCTION_PLACEHOLDERS: Record<string, string> = {
  lbp_tf_custom: '예: 손주 안아 올리기, 장보기 카트 밀기 — 목표 동작을 적어주세요',
}
