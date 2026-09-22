import { BodyMap } from '../components/BodyMap'
import { MultiChoice } from '../components/MultiChoice'
import { SingleChoice } from '../components/SingleChoice'
import { TextInputField } from '../components/TextInputField'
import { NumericScale } from '../components/NumericScale'
import type { AnswerValue, Question, Responses } from '../types'

type Props = {
  question: Question
  value: AnswerValue
  responses: Responses
  onChange: (value: AnswerValue) => void
}

/** 현재 질문의 본문 렌더링 */
export function QuestionBody({ question, value, responses, onChange }: Props) {
  const helper = question.helperIf ? question.helperIf(responses) : question.helper
  const options = question.optionsIf ? question.optionsIf(responses) : question.options
  const activityLabel =
    question.id === 'PAIN_F02' || question.id === 'PAIN_F03'
      ? [
          { value: 'SITTING', label: '오래 앉아 있기' },
          { value: 'SIT_TO_STAND', label: '앉았다 일어나기' },
          { value: 'BEND_PICK_UP', label: '숙이기·바닥 물건 집기' },
          { value: 'WALKING', label: '걷기' },
          { value: 'LIFT_CARRY', label: '물건 들기·옮기기' },
          { value: 'BED_MOBILITY', label: '돌아눕기·침대에서 일어나기' },
          { value: 'OTHER', label: '그 밖의 활동' },
        ].find((option) => option.value === responses.PAIN_F01)?.label
      : undefined

  return (
    <>
      {activityLabel && <p className="activityContextChip">{activityLabel}</p>}
      <h1 className="question">{question.question}</h1>
      {helper && <p className="helper">{helper}</p>}

      {question.input === 'single_choice' && options && question.layout === 'body_map' && (
        <BodyMap
          options={options}
          value={typeof value === 'string' ? value : null}
          onSelect={(v) => onChange(v)}
        />
      )}

      {question.input === 'single_choice' && options && question.layout !== 'body_map' && (
        <SingleChoice
          options={options}
          value={typeof value === 'string' ? value : null}
          onSelect={(v) => onChange(v)}
          layout={question.layout}
        />
      )}

      {question.input === 'multi_choice' && options && (
        <MultiChoice
          options={options}
          value={Array.isArray(value) ? value : []}
          onChange={(v) => onChange(v)}
          exclusive={question.exclusive}
          max={question.max}
          layout={question.layout}
        />
      )}

      {(question.input === 'short_text' || question.input === 'numeric') && (
        <TextInputField
          mode={question.input}
          value={typeof value === 'string' ? value : ''}
          onChange={(v) => onChange(v)}
          maxLength={question.maxLength}
          placeholder={question.placeholder}
          unknownOption={question.unknownOption}
        />
      )}

      {question.input === 'numeric_scale' && question.scale && (
        <NumericScale
          min={question.scale.min}
          max={question.scale.max}
          minLabel={question.scale.minLabel}
          maxLabel={question.scale.maxLabel}
          value={typeof value === 'number' ? value : null}
          onSelect={(v) => onChange(v)}
        />
      )}
    </>
  )
}

/** v1.0: 입력 타입과 관계없이 항상 하단 확정 버튼으로 다음 화면으로 이동한다 */
export const needsConfirmButton = (): boolean => true

export const confirmLabel = (q: Question): string => {
  if (q.input === 'multi_choice') return '선택 완료'
  if (q.input === 'single_choice') return '계속'
  return '다음'
}

export const isAnswered = (q: Question, value: AnswerValue): boolean => {
  if (q.input === 'multi_choice') return Array.isArray(value) && value.length > 0
  if (q.input === 'numeric') {
    const s = typeof value === 'string' ? value : ''
    return q.maxLength ? s.length === q.maxLength : s.length > 0
  }
  if (q.input === 'short_text') {
    return typeof value === 'string' && value.trim().length > 0
  }
  return value !== null && value !== undefined && value !== ''
}
