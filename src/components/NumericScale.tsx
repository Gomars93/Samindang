type Props = {
  min: number
  max: number
  minLabel: string
  maxLabel: string
  value: number | null
  onSelect: (value: number) => void
}

/**
 * 0~10 라벨형 스케일 (LBP_V1 LBP_12에서 첫 사용). SingleChoice와 동일한
 * 큰 터치 타깃/선택 표시 규칙을 재사용한다 — 작은 체크박스·슬라이더 금지
 * (Master Spec 2.4/2.1). 향후 다른 MSK module에서도 재사용 가능하도록
 * `src/components/`에 둔다.
 */
export function NumericScale({ min, max, minLabel, maxLabel, value, onSelect }: Props) {
  const numbers = Array.from({ length: max - min + 1 }, (_, i) => min + i)
  return (
    <div className="numericScale">
      <div className="optionList optionList--scale" role="radiogroup">
        {numbers.map((n) => {
          const isSelected = value === n
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={isSelected}
              className={`option option--scale${isSelected ? ' option--selected' : ''}`}
              onClick={() => onSelect(n)}
            >
              {n}
            </button>
          )
        })}
      </div>
      <div className="numericScale__labels">
        <span>{minLabel}</span>
        <span>{maxLabel}</span>
      </div>
    </div>
  )
}
