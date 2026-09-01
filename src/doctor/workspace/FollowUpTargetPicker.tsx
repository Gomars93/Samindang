/**
 * Reassessment target picker (PR #24 Phase 8) — clinician nominates 1-3
 * items to reassess at the next visit. No repeat-visit AUTO-comparison
 * (no computed 호전/악화 judgment) even though round 3/4 did add a secure,
 * patient_id-scoped prior-visit lookup (`src/doctor/workspace/
 * longitudinal.ts`, `server/store.js`'s getPatientHistory) and a capability-
 * token revisit link (`src/lib/followUpClient.ts`) elsewhere in this
 * codebase — see finalAssessment.ts's REPEAT_VISIT_AUTO_COMPARE_STATUS for
 * why the INTERPRETATION step specifically (not the linkage itself) stays
 * unimplemented: no clinician-approved improvement-threshold rule exists.
 * This component only records the *targets* the clinician nominates here,
 * never a fabricated or auto-computed prior-visit comparison.
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
  showPostTreatmentField = false,
}: {
  options: FollowUpTarget[]
  selected: FollowUpTarget[]
  onChange: (next: FollowUpTarget[]) => void
  /** Pain workspace records an immediate post-treatment value; herbal does not (mission Phase 10 scope). */
  showPostTreatmentField?: boolean
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

  function updateField(id: string, field: 'baseline' | 'postTreatmentValue', value: string) {
    onChange(selected.map((t) => (t.id === id ? { ...t, [field]: value } : t)))
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

      {selected.length > 0 && (
        <div className="workspace__followUp__values">
          {selected.map((t) => (
            <div key={t.id} className="workspace__followUp__valueRow">
              <span className="workspace__followUp__valueLabel">{t.label}</span>
              <input
                type="text"
                className="workspace__noteInput"
                value={t.baseline}
                onChange={(e) => updateField(t.id, 'baseline', e.target.value)}
                placeholder="현재(오늘) 기준값 — 선택"
                aria-label={`${t.label} 오늘 기준값`}
              />
              {showPostTreatmentField && (
                <input
                  type="text"
                  className="workspace__noteInput"
                  value={t.postTreatmentValue}
                  onChange={(e) => updateField(t.id, 'postTreatmentValue', e.target.value)}
                  placeholder="치료 직후 값 — 선택"
                  aria-label={`${t.label} 치료 직후 값`}
                />
              )}
            </div>
          ))}
        </div>
      )}

      <p className="workspace__followUp__status">{REPEAT_VISIT_AUTO_COMPARE_STATUS}</p>
    </section>
  )
}
