/**
 * 준비조건(capability) 15개의 두 층 — 원장 결정(2026-09-05) 구현.
 *
 * 배경: `lbpExerciseEligibility.ts`는 15개 준비조건이 전부 UNKNOWN이면 운동
 * 20개를 전부 DEFER_NOT_READY로 판정한다(RF-1, 의도된 fail-closed). 그 결과
 * 원장이 15개를 하나도 탭하지 않으면 화면에 운동이 하나도 뜨지 않았다.
 * 원장 지적: "이걸 매번 체크해야 돼 내가?"
 *
 * 결정: 15개를 두 층으로 나눈다.
 *
 * **A층 — 안전 금기 (3개, 절대 추정하지 않는다)**
 *   `SAFE_WALKING`, `BALANCE_WITH_SUPPORT`, `CAN_SELF_PACE`.
 *   안 되면 그 운동만 못 하는 것이 아니라 **다칠 수 있는** 조건이다(낙상·
 *   기립성·스스로 못 멈춤). 원장이 반드시 직접 확인한다. 기존 CD-1 옵션 B
 *   (확인 전 보류)가 이 3개에는 그대로 산다.
 *
 * **C층 — 단계에서 추정 (12개)**
 *   원장이 운동 단계를 확정했다면, 그 단계 이하 운동이 전제하는 자세·조절
 *   능력은 있다고 본다. "N단계 운동을 줄 수 있다"는 판단 자체가 이미 그
 *   정보를 담고 있기 때문이다 — 같은 정보를 두 번 받지 않는다.
 *   추정값은 원장이 개별적으로 끌 수 있다(`lbpDeniedCapabilities`가 우선).
 *
 * (원래 제안한 "B층 — 문진에서 유도"는 **비어 있다**. 15개 중 태블릿 문진
 * 답변으로 정직하게 유도되는 것이 없다 — 문진에 자세 수행 가능 여부를 묻는
 * 문항이 없다. 없는 층을 만들어 두지 않는다.)
 *
 * **추정 문턱은 손으로 정하지 않는다.** 각 준비조건의 최소 단계는
 *   min over { 그 조건을 요구하는 Core-20 운동 } of stage(운동)
 * 로 `LBP_EXERCISE_ELIGIBILITY_RULES` × `LBP_EXERCISE_STAGE_BY_ID`에서
 * 계산한다. 규칙표나 단계표가 바뀌면 문턱도 따라 바뀐다. 테스트가 현재
 * 계산 결과를 명시적 표로 고정해, 바뀌면 눈에 띄게 한다.
 *
 * 이 파일은 `lbpExerciseEligibility.ts`(평가기)를 **건드리지 않는다.**
 * 평가기의 규칙·UNKNOWN 의미론은 그대로이고, 바뀌는 것은 어댑터
 * (`lbpEligibilityContext.ts`)가 평가기에 넘기는 값의 출처뿐이다.
 *
 * 트레이드오프(원장 승인): C층에서 fail-closed를 포기한다. 추정이 틀리면
 * 못 하는 자세의 운동이 후보로 뜰 수 있다. 대응 — 각 운동 카드의 중단
 * 기준, 원장 채택(adopt) 전엔 환자에게 나가지 않음, 원장이 추정값을 개별로
 * 끌 수 있음. 2중 안전장치가 이미 있는데 3중을 걸어둔 상태였다.
 */

import { LBP_EXERCISE_ELIGIBILITY_RULES, type LbpExerciseCapability } from './lbpExerciseEligibility'
import { LBP_EXERCISE_STAGE_BY_ID, stageAssignmentAsNumber } from './lbpExerciseStageTable'
import type { LbpExerciseStage } from './lbpExerciseStage'

/** A층. 어떤 단계에서도 추정하지 않는다. */
export const LBP_SAFETY_CAPABILITIES: ReadonlySet<LbpExerciseCapability> = new Set<LbpExerciseCapability>([
  'SAFE_WALKING',
  'BALANCE_WITH_SUPPORT',
  'CAN_SELF_PACE',
])

export function isLbpSafetyCapability(cap: LbpExerciseCapability): boolean {
  return LBP_SAFETY_CAPABILITIES.has(cap)
}

function computeMinStageByCapability(): ReadonlyMap<LbpExerciseCapability, 1 | 2 | 3> {
  const out = new Map<LbpExerciseCapability, 1 | 2 | 3>()
  for (const rule of LBP_EXERCISE_ELIGIBILITY_RULES) {
    const assigned = LBP_EXERCISE_STAGE_BY_ID[rule.exerciseId]
    if (assigned === undefined) continue // 표에 없는 운동은 추정 근거가 되지 않는다
    const stage = stageAssignmentAsNumber(assigned)
    for (const cap of [...rule.hardRequirements, ...rule.regressibleRequirements]) {
      if (LBP_SAFETY_CAPABILITIES.has(cap)) continue
      const prev = out.get(cap)
      if (prev === undefined || stage < prev) out.set(cap, stage)
    }
  }
  return out
}

/**
 * C층 준비조건 → 추정이 켜지는 최소 단계. A층은 이 맵에 없다.
 * 모듈 로드 시 한 번 계산(규칙표·단계표는 상수).
 */
export const LBP_CAPABILITY_MIN_STAGE: ReadonlyMap<LbpExerciseCapability, 1 | 2 | 3> = computeMinStageByCapability()

/**
 * 확정 단계 `stage`에서 추정으로 YES가 되는 준비조건 목록.
 * - `null`(미확정) / `0` → 빈 배열 (추정 없음 — 0단계는 운동 자체가 없다)
 * - A층은 절대 포함되지 않는다
 * 반환 순서는 `LBP_EXERCISE_ELIGIBILITY_RULES` 순회 순서(안정적).
 */
export function inferredCapabilitiesForStage(stage: LbpExerciseStage | null): LbpExerciseCapability[] {
  if (stage === null || stage === 0) return []
  const out: LbpExerciseCapability[] = []
  for (const [cap, min] of LBP_CAPABILITY_MIN_STAGE) {
    if (min <= stage) out.push(cap)
  }
  return out
}
