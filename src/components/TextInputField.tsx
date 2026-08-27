type Props = {
  value: string
  onChange: (value: string) => void
  mode: 'short_text' | 'numeric'
  maxLength?: number
  placeholder?: string
  /**
   * Tablet UX v2.3 §13: optional explicit "잘 모르겠어요" affordance on the
   * same screen as the numeric/text field (e.g. LBP onset age) -- opt-in,
   * absent for every other numeric/short_text question in the app.
   */
  unknownOption?: { value: string; label: string }
}

/** 짧은 자유입력 / 숫자 입력. 자동완성은 항상 off (스펙 29장) */
export function TextInputField({
  value,
  onChange,
  mode,
  maxLength,
  placeholder,
  unknownOption,
}: Props) {
  const isNumeric = mode === 'numeric'
  const isUnknownSelected = unknownOption != null && value === unknownOption.value
  // sentinel 값(예: 'UNKNOWN_AGE')이 숫자 입력창에 문자 그대로 보이면 안 되므로,
  // 그 상태에서는 입력창을 비운 채로 보여주고 아래 버튼의 selected 상태로만
  // 표시한다. 환자가 다시 숫자를 입력하면 평소처럼 그 값으로 바뀐다.
  const displayValue = isUnknownSelected ? '' : value

  return (
    <>
      <input
        className={`textField${isNumeric ? ' textField--numeric' : ''}`}
        type="text"
        inputMode={isNumeric ? 'numeric' : 'text'}
        value={displayValue}
        maxLength={maxLength}
        placeholder={placeholder}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        name={`f_${Math.random().toString(36).slice(2)}`}
        onChange={(e) => {
          const raw = e.target.value
          onChange(isNumeric ? raw.replace(/\D/g, '') : raw)
        }}
        autoFocus={!isUnknownSelected}
      />
      {unknownOption && (
        <button
          type="button"
          className={`textField__unknownBtn${isUnknownSelected ? ' textField__unknownBtn--selected' : ''}`}
          aria-pressed={isUnknownSelected}
          onClick={() => onChange(unknownOption.value)}
        >
          {unknownOption.label}
        </button>
      )}
    </>
  )
}
