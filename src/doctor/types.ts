import type {
  buildResponsePayload,
  buildRoutingPayload,
  computeFlags,
} from '../spec/coreSpec'
import type { SajuResult } from '../saju/types'

/**
 * 완료된 문진 payload 형태 (App.tsx `phase === 'done'`과 동일한 계약).
 * fixtures.ts가 실제 builder들로 만들어낸 결과에 이 타입을 붙인다 — 손으로
 * JSON을 쓰지 않는다.
 */
export type DoctorPayload = {
  questionnaire_version: string
  session_id: string
  responses: ReturnType<typeof buildResponsePayload>
  flags: ReturnType<typeof computeFlags>
  routing: ReturnType<typeof buildRoutingPayload>
  myungri_calculation: SajuResult
  metadata: {
    session_started_at: string | null
    answers: Record<string, unknown>
    /** SOP 문진 중단 제출에만 있다(App.tsx, coreSpec QUESTIONNAIRE_HALT_TRIGGERS). 검증 없는 저장값이라 읽는 쪽이 다시 확인한다. */
    questionnaire_halted?: { at_question: string; reason: string }
  }
}

export type DoctorFixture = {
  name: string
  payload: DoctorPayload
}
