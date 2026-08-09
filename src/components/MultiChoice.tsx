import type { Option } from '../types'

type Props = {
  options: Option[]
  value: string[]
  onChange: (value: string[]) => void
  /** `없음 / 해당 없음` 등 exclusive 값 (스펙 2.4). 배열이면 각 값이 독립적으로 exclusive로 동작한다. */
  exclusive?: string | string[]
  /** 최대 선택 개수 (스펙 7장: 동반문제 최대 2개) */
  max?: number
}

const exclusiveSet = (exclusive?: string | string[]): Set<string> =>
  new Set(exclusive === undefined ? [] : Array.isArray(exclusive) ? exclusive : [exclusive])

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
  max,
}: Props) {
  const exclusives = exclusiveSet(exclusive)
  const nonExclusiveCount = value.filter((x) => !exclusives.has(x)).length

  const toggle = (v: string) => {
    if (exclusives.has(v)) {
      onChange(value.includes(v) ? [] : [v])
      return
    }

    const isRemoving = value.includes(v)
    if (!isRemoving && max !== undefined && nonExclusiveCount >= max) return

    let next = isRemoving ? value.filter((x) => x !== v) : [...value, v]

    if (exclusives.size > 0) next = next.filter((x) => !exclusives.has(x))

    onChange(next)
  }

  return (
    <div className="optionList">
      {options.map((opt) => {
        const isSelected = value.includes(opt.value)
        const disabled = !isSelected && max !== undefined && nonExclusiveCount >= max && !exclusives.has(opt.value)
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
