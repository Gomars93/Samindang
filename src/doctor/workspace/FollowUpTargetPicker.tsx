/**
 * Reassessment target picker (PR #24 Phase 8) — clinician nominates 1-3
 * items to reassess at the next visit. No repeat-visit auto-comparison:
 * this codebase has no secure, stable patient/visit linkage today (see
 * finalAssessment.ts's REPEAT_VISIT_AUTO_COMPARE_STATUS), so this only
 * records the *targets*, never a fabricated prior-visit match.
 */
import {
  MAX_FOLLOW_UP_TARGETS,
  REPEAT_VISIT_AUTO_COMPARE_STATUS,
  type FollowUpTarget,
} from './finalAssessment'

export function FollowUpTargetPicker({
  options,
  selected,
  onChange,
}: {
  options: FollowUpTarget[]
  selected: FollowUpTarget[]
  onChange: (next: FollowUpTarget[]) => void
}) {
  const selectedIds = new Set(selected.map((t) => t.id))
  const atMax = selected.length >= MAX_FOLLOW_UP_TARGETS

  function toggle(target: FollowUpTarget) {
    if (selectedIds.has(target.id)) {
      onChange(selected.filter((t) => t.id !== target.id))
      return
    }
    if (atMax) return
    onChange([...selected, target])
  }

  return (
    <section className="workspace__followUp" aria-label="재평가 대상">
      <h4>
        재평가 대상 <span className="workspace__followUp__hint">(최대 {MAX_FOLLOW_UP_TARGETS}개)</span>
      </h4>
      <div className="workspace__followUp__options" role="group" aria-label="재평가 대상 선택">
        {options.map((opt) => {
          const isSelected = selectedIds.has(opt.id)
          return (
            <button
              key={opt.id}
              type="button"
              aria-pressed={isSelected}
              disabled={!isSelected && atMax}
              className={`workspace__followUpChip${isSelected ? ' workspace__followUpChip--active' : ''}`}
              onClick={() => toggle(opt)}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
      <p className="workspace__followUp__status">{REPEAT_VISIT_AUTO_COMPARE_STATUS}</p>
    </section>
  )
}
