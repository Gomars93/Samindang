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

export function isLbpTargetFunctionId(id: string): boolean {
  return LBP_TARGET_FUNCTION_IDS.has(id)
}

export function selectedLbpTargetFunctions(targets: FollowUpTarget[]): FollowUpTarget[] {
  return targets.filter((t) => isLbpTargetFunctionId(t.id))
}

/**
 * "기타 목표 동작"은 라벨만으로는 무엇을 적어야 하는지 불명확하므로,
 * 기준값 입력칸에 실제 동작을 적도록 안내하는 placeholder를 별도로
 * 제공한다 (FollowUpTargetPicker의 선택적 `placeholders` prop으로 전달).
 */
export const LBP_TARGET_FUNCTION_PLACEHOLDERS: Record<string, string> = {
  lbp_tf_custom: '예: 손주 안아 올리기, 장보기 카트 밀기 — 목표 동작을 적어주세요',
}
