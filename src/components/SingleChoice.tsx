import { optionKey } from '../types'
import type { Option } from '../types'
import { Icon } from './icons'

type Props = {
  options: Option[]
  value: string | null
  onSelect: (value: string) => void
  /**
   * 순수 presentation 힌트 (Routing/UX v2, Question.layout과 동일 값).
   * 선택 로직/저장값은 전혀 바뀌지 않는다 -- CSS 배치만 바뀐다.
   */
  layout?: 'list' | 'grid2' | 'compact3' | 'body_map'
}

/** 단일선택: 선택 상태만 표시하고 자동으로 넘어가지 않는다 (v1.0: `계속` 버튼으로 확정) */
export function SingleChoice({ options, value, onSelect, layout = 'list' }: Props) {
  return (
    <div className={`optionList optionList--${layout}`} role="radiogroup">
      {options.map((opt) => {
        const key = optionKey(opt)
        const isSelected = value === key
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={isSelected}
            className={`option${isSelected ? ' option--selected' : ''}`}
            onClick={() => onSelect(key)}
          >
            <span className="option__mark" aria-hidden="true">
              {isSelected ? '✓' : ''}
            </span>
            {opt.icon && <Icon name={opt.icon} />}
            <span className="option__labelGroup">
              <span className="option__label">{opt.label}</span>
              {opt.description && <span className="option__description">{opt.description}</span>}
            </span>
          </button>
        )
      })}
    </div>
  )
}
