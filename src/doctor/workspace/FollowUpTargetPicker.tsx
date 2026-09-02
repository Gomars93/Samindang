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
  groups,
  placeholders,
}: {
  options: FollowUpTarget[]
  selected: FollowUpTarget[]
  onChange: (next: FollowUpTarget[]) => void
  /** Pain workspace records an immediate post-treatment value; herbal does not (mission Phase 10 scope). */
  showPostTreatmentField?: boolean
  /**
   * LBP v1 Batch 1 (G1): optional labeled sub-groups of `options`, each
   * rendered as its own heading ("목표 기능…") above its own chip row.
   * Options not covered by any group render in the original single,
   * unheaded row — so a caller that omits `groups` (every non-LBP caller)
   * renders byte-for-byte as before.
   */
  groups?: { label: string; ids: string[] }[]
  /**
   * Per-option baseline input placeholder override, keyed by target id —
   * falls back to the shared default. E.g. LBP's "기타 목표 동작" prompts
   * the clinician to type the actual movement instead of a generic hint.
   */
  placeholders?: Record<string, string>
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

  function chipRow(items: FollowUpTarget[], ariaLabel: string) {
    return (
      <div className="workspace__followUp__options" role="group" aria-label={ariaLabel}>
        {items.map((opt) => {
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
    )
  }

  const groupedIds = new Set((groups ?? []).flatMap((g) => g.ids))
  // LBP v1 Batch 1 delta fix (Opus review item 1b): a `selected` item whose
  // id is not in `options` at all (e.g. a carried-forward LBP target
  // function reaching a caller whose `options` doesn't include
  // LBP_TARGET_FUNCTION_OPTIONS) must still get a chip -- otherwise it is
  // selected with no way to see or deselect it, and if it fills the
  // MAX_FOLLOW_UP_TARGETS budget every visible chip disables with none
  // pressed. Structurally impossible: any such orphan is appended to the
  // ungrouped row.
  const optionIds = new Set(options.map((o) => o.id))
  const orphanSelected = selected.filter((t) => !optionIds.has(t.id))
  const ungrouped = [...options.filter((o) => !groupedIds.has(o.id)), ...orphanSelected]

  return (
    <section className="workspace__followUp" aria-label="재평가 대상">
      <h4>
        재평가 대상 <span className="workspace__followUp__hint">(최대 {MAX_FOLLOW_UP_TARGETS}개)</span>
      </h4>
      {groups?.map((g) => (
        <div key={g.label} className="workspace__followUp__group">
          <p className="workspace__followUp__groupLabel">{g.label}</p>
          {chipRow(
            options.filter((o) => g.ids.includes(o.id)),
            g.label,
          )}
        </div>
      ))}
      {(!groups || ungrouped.length > 0) && chipRow(ungrouped, '재평가 대상 선택')}

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
                placeholder={placeholders?.[t.id] ?? '현재(오늘) 기준값 — 선택'}
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
