import type { Option } from '../types'

type Props = {
  options: Option[]
  value: string[]
  onChange: (value: string[]) => void
  /** `없음 / 해당 없음` 등 exclusive 값 (스펙 2.4) */
  exclusive?: string
  /** 동시에 선택할 수 없는 값 쌍 */
  conflictPairs?: [string, string][]
  /** 최대 선택 개수 (스펙 7장: 동반문제 최대 2개) */
  max?: number
}

/**
 * 다중선택.
 * 스펙 2.4:
 *   if "none" selected     -> clear all other values
 *   if any other selected  -> unselect "none"
 * 선택 완료는 화면 하단의 `선택 완료` 버튼으로 확정한다(자동 진행 없음).
 */
export function MultiChoice({
  options,
  value,
  onChange,
  exclusive,
  conflictPairs,
  max,
}: Props) {
  const nonExclusiveCount = exclusive ? value.filter((x) => x !== exclusive).length : value.length

  const toggle = (v: string) => {
    if (exclusive && v === exclusive) {
      onChange(value.includes(v) ? [] : [v])
      return
    }

    const isRemoving = value.includes(v)
    if (!isRemoving && max !== undefined && nonExclusiveCount >= max) return

    let next = isRemoving ? value.filter((x) => x !== v) : [...value, v]

    if (exclusive) next = next.filter((x) => x !== exclusive)

    // conflict: 새로 켠 값과 공존할 수 없는 값을 해제한다
    if (conflictPairs && !isRemoving) {
      for (const [a, b] of conflictPairs) {
        if (v === a) next = next.filter((x) => x !== b)
        else if (v === b) next = next.filter((x) => x !== a)
      }
    }

    onChange(next)
  }

  return (
    <div className="optionList">
      {options.map((opt) => {
        const isSelected = value.includes(opt.value)
        const disabled = !isSelected && max !== undefined && nonExclusiveCount >= max && opt.value !== exclusive
        return (
          <button
            key={opt.value}
            type="button"
            role="checkbox"
            aria-checked={isSelected}
            disabled={disabled}
            className={`option${isSelected ? ' option--selected' : ''}`}
            onClick={() => toggle(opt.value)}
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
