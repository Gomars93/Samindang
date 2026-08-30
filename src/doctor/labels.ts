/**
 * 원장/직원용 요약 화면 전용 라벨 해석 헬퍼.
 * 저장된 enum 값을 환자가 실제로 본 한글 옵션 라벨로 되돌린다.
 * (질문/옵션 정의는 절대 여기서 새로 만들지 않고 ../spec/coreSpec의
 * ALL_QUESTIONS을 그대로 참조한다 — 라벨이 스펙과 어긋날 수 없게.)
 */
import { ALL_QUESTIONS } from '../spec/coreSpec'
import type { AnswerValue, Question } from '../types'

export const questionById: Map<string, Question> = new Map(
  ALL_QUESTIONS.map((q) => [q.id, q]),
)

/**
 * 10차 독립 리뷰 HIGH-1/HIGH-2/MEDIUM-2: AnswerValue 타입은
 * `string | number | string[] | null`이라고 주장하지만, 이 값은
 * 검증되지 않은 저장된 JSON에서 그대로 온다(레거시/손상 데이터는 이
 * 타입을 지키지 않을 수 있다) -- 이전 구현은 그런 값도 무조건
 * `String(value)`로 바꿔 "[object Object]" 같은 문자열을 그대로
 * 반환했고, 이게 EMR 미리보기(클립보드로 실제 의무기록에 붙여넣는
 * 텍스트)/환자 전달용 치료 계획/CommonSafetyBanner의 공통 위험 신호
 * 배너(7차가 만든, flags를 못 믿을 때의 대체 안전장치 그 자체)까지
 * 흘러들어갔다. string|number가 아니면 원문을 지어내지 않고 명시적
 * 실패 토큰을 반환한다.
 */
const UNREADABLE_VALUE_LABEL = '확인 필요(값 형식 오류)'

/** 질문에 options가 없으면(자유입력/숫자) 원문 그대로 반환한다. */
export function optionLabel(
  qid: string,
  value: unknown,
): string {
  if (value === null || value === undefined) return ''
  if (typeof value !== 'string' && typeof value !== 'number') return UNREADABLE_VALUE_LABEL
  const raw = String(value)
  const q = questionById.get(qid)
  const opt = q?.options?.find((o) => o.value === raw)
  return opt ? opt.label : raw
}

export function optionLabels(
  qid: string,
  values: readonly (string | number)[] | null | undefined,
): string[] {
  if (!values) return []
  return values.map((v) => optionLabel(qid, v))
}

/** AnswerValue(배열 포함) 전체를 한 번에 라벨로 바꾼다. */
export function answerLabel(qid: string, value: AnswerValue | undefined): string {
  if (value === null || value === undefined) return ''
  if (Array.isArray(value)) return optionLabels(qid, value).join(', ')
  return optionLabel(qid, value)
}

/** 화면에 표시할 라벨은 환자가 실제로 본 질문 문구를 그대로 재사용한다. */
export function questionLabel(qid: string): string {
  return questionById.get(qid)?.question ?? qid
}
