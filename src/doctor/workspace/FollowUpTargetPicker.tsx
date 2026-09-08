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
import { useState } from 'react'
import {
  MAX_FOLLOW_UP_TARGETS,
  NRS_VALUES,
  REPEAT_VISIT_AUTO_COMPARE_STATUS,
  isNrsValue,
  type FollowUpTarget,
} from './finalAssessment'

/**
 * 2026-09-06: 0~10 버튼 한 줄. 눌린 값을 다시 누르면 ''(비움). `legacyValue`가
 * 있으면(숫자 아닌 옛 자유값) 그 값을 담은 텍스트 칸을 버튼 아래에 그대로 둔다 —
 * 원장이 버튼을 눌러 명시적으로 바꾸기 전까지 옛 기록을 잃지 않는다.
 */
function NrsButtons({
  value,
  onChange,
  ariaLabel,
  legacyInput,
}: {
  value: string
  onChange: (next: string) => void
  ariaLabel: string
  legacyInput: React.ReactNode
}) {
  return (
    <div className="workspace__nrs">
      <div className="workspace__nrsRow" role="group" aria-label={ariaLabel}>
        {NRS_VALUES.map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={value === n}
            aria-label={`${ariaLabel} ${n}`}
            className={`workspace__nrsBtn${value === n ? ' workspace__nrsBtn--active' : ''}`}
            onClick={() => onChange(value === n ? '' : n)}
          >
            {n}
          </button>
        ))}
      </div>
      {legacyInput}
    </div>
  )
}

export function FollowUpTargetPicker({
  options,
  selected,
  onChange,
  showPostTreatmentField = false,
  groups,
  placeholders,
  nrsTargetIds,
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
  /**
   * 2026-09-06: 기준값·직후값을 0~10 버튼으로 받는 target id 집합(통증:
   * `PAIN_NRS_TARGET_IDS`). 생략한 호출자(한약)는 이전과 바이트 단위로 같다.
   */
  nrsTargetIds?: ReadonlySet<string>
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

  /*
   * LBP v1 Batch 4 (§14.4, CD-2.7-3 `DECISIONS.md` 2026-09-04): 치료 직후
   * 값's own explicit-open flag, per target id -- "거의 안 적는다" (PO), so
   * the input starts hidden behind a "직후 값 기록" toggle. This is NOT
   * `useState(initial value)` seeded from `t.postTreatmentValue` (Batch 2.6
   * N-2's exact regression: deriving `open` from the value at mount time,
   * then losing sync with it, unmounted the input mid-edit the moment the
   * clinician cleared the text back to ''). Instead the field actually
   * shown to the clinician is the DERIVED expression
   * `openPostTreatmentIds.has(id) || t.postTreatmentValue.trim() !== ''`
   * computed fresh at every render -- "opened by an explicit click" OR
   * "already has a value" -- so an already-recorded value always starts
   * visible, and `setPostTreatmentValue` below marks the id opened on the
   * FIRST keystroke (not only on the toggle click), so clearing the text
   * back to '' during that same edit can never flip the visibility back to
   * hidden underneath the clinician's cursor.
   */
  const [openPostTreatmentIds, setOpenPostTreatmentIds] = useState<Set<string>>(new Set())

  function openPostTreatmentField(id: string) {
    setOpenPostTreatmentIds((prev) => (prev.has(id) ? prev : new Set(prev).add(id)))
  }

  function setPostTreatmentValue(id: string, value: string) {
    openPostTreatmentField(id)
    updateField(id, 'postTreatmentValue', value)
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
          {selected.map((t) => {
            const nrs = nrsTargetIds?.has(t.id) === true
            const baselineLegacy = nrs && t.baseline.trim() !== '' && !isNrsValue(t.baseline)
            const postLegacy = nrs && t.postTreatmentValue.trim() !== '' && !isNrsValue(t.postTreatmentValue)
            const postOpen = openPostTreatmentIds.has(t.id) || t.postTreatmentValue.trim() !== ''
            const baselineInput = (
              <input
                type="text"
                className="workspace__noteInput"
                value={t.baseline}
                onChange={(e) => updateField(t.id, 'baseline', e.target.value)}
                placeholder={placeholders?.[t.id] ?? '현재(오늘) 기준값 — 선택'}
                aria-label={`${t.label} 오늘 기준값`}
              />
            )
            const postInput = (
              <input
                type="text"
                className="workspace__noteInput"
                value={t.postTreatmentValue}
                onChange={(e) => setPostTreatmentValue(t.id, e.target.value)}
                placeholder="치료 직후 값 — 선택"
                aria-label={`${t.label} 치료 직후 값`}
              />
            )
            const postToggle = (
              <button
                type="button"
                className="workspace__btn workspace__followUp__postTreatmentToggle"
                onClick={() => openPostTreatmentField(t.id)}
              >
                직후 값 기록
              </button>
            )
            if (!nrs) {
              return (
                <div key={t.id} className="workspace__followUp__valueRow">
                  <span className="workspace__followUp__valueLabel">{t.label}</span>
                  {baselineInput}
                  {showPostTreatmentField && (postOpen ? postInput : postToggle)}
                </div>
              )
            }
            // NRS 대상: 라벨 → 기준값 버튼 줄 → (직후값 토글 | 직후값 버튼 줄). 직후값의
            // 숨김/열림 규칙(§14.4, N-2 래치)은 텍스트 경로와 동일한 `postOpen`을 쓴다.
            return (
              <div key={t.id} className="workspace__followUp__valueRow workspace__followUp__valueRow--nrs">
                <span className="workspace__followUp__valueLabel">{`${t.label} (0~10)`}</span>
                <NrsButtons
                  value={t.baseline}
                  onChange={(v) => updateField(t.id, 'baseline', v)}
                  ariaLabel={`${t.label} 오늘 기준값`}
                  legacyInput={baselineLegacy ? baselineInput : null}
                />
                {showPostTreatmentField &&
                  (postOpen ? (
                    <NrsButtons
                      value={t.postTreatmentValue}
                      onChange={(v) => setPostTreatmentValue(t.id, v)}
                      ariaLabel={`${t.label} 치료 직후 값`}
                      legacyInput={postLegacy ? postInput : null}
                    />
                  ) : (
                    postToggle
                  ))}
              </div>
            )
          })}
        </div>
      )}

      <p className="workspace__followUp__status">{REPEAT_VISIT_AUTO_COMPARE_STATUS}</p>
    </section>
  )
}
