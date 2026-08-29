type Props = {
  value: string
  onChange: (value: string) => void
  mode: 'short_text' | 'numeric'
  maxLength?: number
  placeholder?: string
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
