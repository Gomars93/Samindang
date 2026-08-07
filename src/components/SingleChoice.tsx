import { optionKey } from '../types'
import type { Option } from '../types'

type Props = {
  options: Option[]
  value: string | null
  onSelect: (value: string) => void
}

/** 단일선택: 선택 상태만 표시하고 자동으로 넘어가지 않는다 (v1.0: `계속` 버튼으로 확정) */
export function SingleChoice({ options, value, onSelect }: Props) {
  return (
    <div className="optionList" role="radiogroup">
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
            <span>{opt.label}</span>
          </button>
        )
      })}
    </div>
  )
}
