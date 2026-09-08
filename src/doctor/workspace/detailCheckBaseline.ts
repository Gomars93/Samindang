/**
 * 플로우 정렬 5/5 (세부문진) — 재진 카드가 "초진 → 오늘"로 나란히 보여줄 **초진
 * 답**을 지난 제출에서 꺼낸다.
 *
 * 2026-09-08 Fable 독립 검수 F-2: 이전 판은 `submission.responses`를 question id
 * 로 키가 달린 평평한 맵인 것처럼 훑었는데, 실제 저장 모양(coreSpec
 * `buildResponsePayload`)은 `{ patient, visit_goal, safety_flags, modules: { lbp:
 * { recovery_expectation, … }, … } }`로 **중첩**돼 있어 결과가 항상 `{}`였고 카드는
 * 늘 '초진 기록 없음'을 찍었다. `metadata.answers`도 답이 아니라 답한 시각·화면
 * (`AnswerMeta`)이라 대체 경로가 아니다.
 *
 * 그래서 재질문 id마다 `modules.<부위>.<필드>` 경로를 **명시적으로** 적는다 —
 * 서버 재질문 표(`server/detailCheck.js` DETAIL_CHECK_REGION_QUESTION_IDS)의 id
 * 집합과 글자 단위로 같아야 하고(`tests/detail-check.spec.mjs`가 단언), 각 행은
 * coreSpec의 `<필드>: r['<id>']` 줄과 대응한다. 모르는 id는 조용히 건너뛴다 —
 * 값을 지어내지 않는다(fail closed).
 */

/** 재질문 id → `responses.modules[모듈][필드]`. */
export const DETAIL_CHECK_RESPONSE_PATHS: Readonly<Record<string, readonly [module: string, field: string]>> = Object.freeze({
  LBP_12: ['lbp', 'recovery_expectation'],
  LBP_13: ['lbp', 'fear_avoidance'],
  LBP_14: ['lbp', 'work_impact'],
  NECK_12: ['neck', 'sustained_posture_aggravation'],
  SH08: ['shoulder', 'load_related_pattern'],
  KNEE_12: ['knee', 'morning_stiffness_duration'],
  KNEE_13: ['knee', 'giving_way_instability'],
  WH_11: ['wrist_hand', 'trigger_catching_pattern'],
  AF_00: ['ankle_foot', 'region_discriminator'],
})

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * 지난 제출의 `responses`(중첩 payload)에서 재질문 id별 초진 답을 문자열로 꺼낸다.
 * 문자열·유한한 숫자만 통과(척도는 숫자로 저장된다), 나머지(null/배열/객체)는 빠진다.
 */
export function baselineDetailAnswersFromResponses(responses: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (!isRecord(responses) || !isRecord(responses.modules)) return out
  const modules = responses.modules
  for (const [id, [moduleKey, field]] of Object.entries(DETAIL_CHECK_RESPONSE_PATHS)) {
    const mod = modules[moduleKey]
    if (!isRecord(mod)) continue
    const v = mod[field]
    if (typeof v === 'string') out[id] = v
    else if (typeof v === 'number' && Number.isFinite(v)) out[id] = String(v)
  }
  return out
}
