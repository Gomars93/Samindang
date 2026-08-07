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

/** 질문에 options가 없으면(자유입력/숫자) 원문 그대로 반환한다. */
export function optionLabel(
  qid: string,
  value: string | number | null | undefined,
): string {
  if (value === null || value === undefined) return ''
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
