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
  /**
   * 카드 레이아웃(`layout: 'grid2'`)에서 제목 아래 보조 설명 1~2줄
   * (Routing/UX v2). 순수 presentation metadata -- clinical 의미와 무관하며
   * `value`/`id`에는 전혀 영향을 주지 않는다.
   */
  description?: string
}

/** 화면에 저장되는 선택 키 (Option.id ?? Option.value) */
export const optionKey = (o: Option): string => o.id ?? o.value

export type QuestionInput =
  | 'single_choice'
  | 'multi_choice'
  | 'numeric'
  | 'short_text'
  /**
   * 0~10 라벨형 스케일(예: LBP_12 회복 기대). 'numeric'(자유 숫자 입력, 예:
   * 전화번호 뒷자리)과는 별개 — LBP_V1에서 새로 추가.
   */
  | 'numeric_scale'

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
  /** 다중선택에서 exclusive로 동작하는 값(들) (스펙 2.4). 배열이면 각각 독립적으로 exclusive. */
  exclusive?: string | string[]
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
  /** numeric_scale 전용 */
  scale?: { min: number; max: number; minLabel: string; maxLabel: string }
  /**
   * 순수 presentation 힌트 (Routing/UX v2). `showIf`/`required`/`value`/
   * `exclusive`/`max` 등 clinical/validation 필드와 완전히 분리되어 있다 --
   * 이 값을 바꿔도 어떤 답이 유효한지, 어떤 안전 tier가 계산되는지는 전혀
   * 바뀌지 않는다. 미지정 시 기존과 동일하게 1열 리스트로 렌더링된다.
   *  - 'list'    : 1열 (기본값, safety/protected/긴 문장 질문은 반드시 이것)
   *  - 'grid2'   : 2열 카드 (짧은 카테고리 선택 화면)
   *  - 'compact3': 짧은 3지선다("네/아니요/모름" 류) 가로 배치
   *  - 'body_map': 주 통증부위 전용, PAIN_01에만 사용
   */
  layout?: 'list' | 'grid2' | 'compact3' | 'body_map'
}
