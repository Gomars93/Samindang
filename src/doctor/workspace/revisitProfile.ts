/**
 * 재진 화면이 "한약 재진"으로 도는지 판별한다 (2026-10-05, PO D1·D2 추천안 승인).
 *
 * 왜 필요한가: `RevisitWorkspace`는 문진 없는 재진을 통증·한약 구분 없이 하나로 다룬다. 그래서 한약 재진에도 통증용
 * 최종 판단 칩(시행/예정 처치·치료 초점)과 `운동 실제 시행·난이도` 그룹이 나왔다.
 *
 * 신호: 이 환자 이력에서 **가장 최근 제출(문진) 방문**의 `routing`이 통증 모듈을 포함하지 않는가. 판별식은
 * `viewProfile.ts`의 `deriveViewProfile`(초진 화면이 쓰는 것)과 같다 -- `hasPainContent`가 없으면 한약. 재진 방문 자체는
 * 프로필을 저장하지 않고(서버가 재진 요약을 통증 필드에 담는다) 직전 방문이 재진이어도 이 신호는 유지된다.
 *
 * **애매하면 통증 화면 그대로**(fail-closed): 제출이 없거나, routing이 없거나 깨졌거나(검증 없는 저장값이라 모양을
 * 다시 본다), 통증이 섞였거나(mixed), 갱년기이면 `false`다. 통증 재진의 출력은 이 모듈이 한 글자도 바꾸지 않는다.
 *
 * 입력은 `SubmissionRecord.submission`(= 저장된 문진 payload: `{ routing, responses, ... }`)이다.
 */
export function isHerbalRevisitSource(submissionPayload: unknown): boolean {
  if (submissionPayload === null || typeof submissionPayload !== 'object' || Array.isArray(submissionPayload)) return false
  const { routing, responses } = submissionPayload as { routing?: unknown; responses?: unknown }
  if (routing === null || typeof routing !== 'object' || Array.isArray(routing)) return false
  const concern = (responses as { primary_concern?: { key?: unknown } } | null | undefined)?.primary_concern
  if (concern && typeof concern === 'object' && concern.key === 'midlife') return false
  const r = routing as { primary_module?: unknown; additional_module?: unknown; questionnaire_mode?: unknown }
  // 모양을 알 수 없으면(문자열이 아닌 questionnaire_mode 등) 한약으로 단정하지 않는다.
  if (typeof r.questionnaire_mode !== 'string') return false
  const hasPainContent = r.primary_module === 'Pain' || r.additional_module === 'Pain'
  return !hasPainContent
}
