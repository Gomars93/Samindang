export type AnswerValue = string | number | string[] | null

/** screen_id -> value. null = 보지 않은 질문(스펙 3.3), 'unknown'/'none'은 enum 값이므로 구분된다. */
export type Responses = Record<string, AnswerValue>

export type Option = {
  /** 저장/출력되는 enum 값 (Master Spec) */
  value: string
  label: string
  /**
   * 선택 상태 식별용 키. 생략 시 value를 사용한다.
   * 서로 다른 선택지가 같은 enum value를 갖는 경우에만 지정한다.
   * (예: v0.2 CORE_01C의 `임신 중 건강 상담` / `산후 회복 상담` → 둘 다 pregnancy_postpartum)
   */
  id?: string
}

/** 화면에 저장되는 선택 키 (Option.id ?? Option.value) */
export const optionKey = (o: Option): string => o.id ?? o.value

export type QuestionInput =
  | 'single_choice'
  | 'multi_choice'
  | 'numeric'
  | 'short_text'

export type Question = {
  /** Master Spec의 screen_id */
  id: string
  /** Master Spec의 variable */
  variable: string
  input: QuestionInput
  question: string
  helper?: string
  /** helper를 응답에 따라 동적으로 표시할 때 사용 (예: 약 복용 안내 문구) */
  helperIf?: (r: Responses) => string | undefined
  options?: Option[]
  /** 옵션을 응답에 따라 동적으로 필터링할 때 사용 (예: 동반문제에서 주호소 항목 제외) */
  optionsIf?: (r: Responses) => Option[]
  /** 다중선택에서 exclusive로 동작하는 값 (스펙 2.4) */
  exclusive?: string
  /** 다중선택 최대 선택 개수 */
  max?: number
  required: boolean
  /** 단계형 progress의 단계 라벨 */
  step: string
  /** Master Spec의 show_if. 미지정 시 always */
  showIf?: (r: Responses) => boolean
  /** numeric 전용 */
  maxLength?: number
  placeholder?: string
}
