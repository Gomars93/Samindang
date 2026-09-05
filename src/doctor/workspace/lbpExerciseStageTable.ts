/**
 * Core-20 운동 ↔ 단계 표 (v0.2 확정본을 코드로 옮긴 것).
 *
 * 원본: `docs/LBP_EXERCISE_LEVEL_DRAFT_v0.2.md` §"레벨 표" — 원문 4편(JOSPT
 * 2021 / Alrwaily 2016 TBC / WHO 2023 / Comachio 2024)을 직접 확인한 뒤
 * 애매행 7개를 전부 해소한 표. 분포 1단계 9 / 2단계 8 / 3단계 2 / 전 단계
 * 공통 1 = 20. **이 파일은 그 표를 옮겨 적은 것이지 새 판단이 아니다** —
 * 표를 바꾸려면 문서를 먼저 바꾼다. 테스트가 분포(9/8/2/1)와 id 집합을
 * 고정한다.
 *
 * 이 표가 하는 일 두 가지:
 * 1. **운동 목록 필터** — 원장이 확정한 단계보다 높은 단계의 운동은 후보에서
 *    빠진다(`lbpExerciseRecommendation.ts`). 확정 단계가 없으면 필터 없음.
 * 2. **준비조건 추정의 근거** — "N단계 운동을 줄 수 있다"고 원장이 판단했다면,
 *    N단계 이하 운동이 전제하는 자세·조절 능력은 있다고 본다
 *    (`lbpCapabilityLayer.ts`). 안전 관련 3개는 예외(절대 추정하지 않음).
 *
 * `'ALL'`(전 단계 공통, `LBP_FUNC_01` 앉았다 일어서기)은 어느 단계에서도
 * 후보이고, 추정 계산에서는 1단계로 취급한다.
 *
 * 0단계에는 어떤 운동도 배정되지 않는다 — 0단계는 "능동 운동 미처방"이다
 * (`lbpExerciseStage.ts`).
 */

import type { LbpExerciseStage } from './lbpExerciseStage'

export type LbpExerciseStageAssignment = 1 | 2 | 3 | 'ALL'

export const LBP_EXERCISE_STAGE_BY_ID: Readonly<Record<string, LbpExerciseStageAssignment>> = {
  LBP_ACT_01: 1,
  LBP_ACT_02: 1,
  LBP_LUMBAR_02: 1,
  LBP_LUMBAR_03: 1,
  LBP_DIR_02: 1,
  LBP_DIR_03: 1,
  LBP_DIR_04: 1,
  LBP_HIP_MOB_01: 2,
  LBP_DEEP_TRUNK_01: 2,
  LBP_DEEP_TRUNK_03: 2,
  LBP_TRUNK_03: 2,
  LBP_TRUNK_END_01: 2,
  LBP_HIP_STR_03: 2,
  LBP_FUNC_01: 'ALL',
  LBP_FUNC_05: 3,
  LBP_LOAD_02: 3,
  LBP_NEURAL_01: 1,
  LBP_EXPOSURE_01: 2,
  LBP_EXPOSURE_03: 2,
  LBP_REG_01: 1,
}

/** 추정 계산용 숫자 단계. `'ALL'` → 1. */
export function stageAssignmentAsNumber(a: LbpExerciseStageAssignment): 1 | 2 | 3 {
  return a === 'ALL' ? 1 : a
}

/**
 * 확정 단계 `stage`에서 이 운동이 후보가 될 수 있는가.
 * - `stage === null`(미확정) → 항상 true (필터 없음, 기존 동작 유지)
 * - `stage === 0` → 항상 false (능동 운동 미처방)
 * - 표에 없는 id → false (Core-20 밖의 id는 이 경로에 올 수 없다; 오면 막는다)
 */
export function isLbpExerciseAllowedAtStage(exerciseId: string, stage: LbpExerciseStage | null): boolean {
  if (stage === null) return true
  if (stage === 0) return false
  const assigned = LBP_EXERCISE_STAGE_BY_ID[exerciseId]
  if (assigned === undefined) return false
  if (assigned === 'ALL') return true
  return assigned <= stage
}
