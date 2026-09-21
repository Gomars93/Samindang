import type { ReactNode } from 'react'
import type { Option } from '../types'
import { Icon } from './icons'

type Props = {
  option: Option
  selected: boolean
  disabled?: boolean
  selectionMode: 'single' | 'multiple'
  onPress: () => void
  /**
   * Figma Option Card의 leading 슬롯. 현재 설문은 registry icon을 쓰지만,
   * 이후 부위/활동 pictogram도 같은 카드 골격을 재사용할 수 있다.
   */
  leading?: ReactNode
}

/**
 * 환자용 선택 카드의 단일 presentation 계약.
 *
 * 단일/복수 선택의 상태 계산과 저장은 각각 SingleChoice/MultiChoice가
 * 계속 담당한다. 이 컴포넌트는 Figma의 Option Card와 대응하는 마크업,
 * 선택 표식, 접근성 role/aria 상태만 공유해 두 흐름의 시각적 드리프트를
 * 막는다. clinical value를 해석하거나 변경하지 않는다.
 */
export function OptionCard({
  option,
  selected,
  disabled = false,
  selectionMode,
  onPress,
  leading,
}: Props) {
  const role = selectionMode === 'single' ? 'radio' : 'checkbox'

  return (
    <button
      type="button"
      role={role}
      aria-checked={selected}
      disabled={disabled}
      className={`option${selected ? ' option--selected' : ''}`}
      onClick={onPress}
    >
      <span className="option__mark" aria-hidden="true">
        {selected ? '✓' : ''}
      </span>
      {leading ?? (option.icon ? <Icon name={option.icon} /> : null)}
      <span className="option__labelGroup">
        <span className="option__label">{option.label}</span>
        {option.description && <span className="option__description">{option.description}</span>}
      </span>
    </button>
  )
}

