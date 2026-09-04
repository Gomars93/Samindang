/**
 * Clinician-owned Final Assessment card, parameterized for Pain or Herbal
 * (PR #24 Phase 7). Always visibly labeled "원장 최종 판단" — a system
 * SUGGESTED item is never auto-copied in here; every field starts empty
 * and is filled only by explicit clinician typing.
 */
import type {
  HerbalFinalAssessment,
  PainFinalAssessment,
} from './finalAssessment'

type Field = { key: string; label: string; value: string; placeholder: string }

/** One field's `<label>` markup, factored out of `TextFields` so §14.2's chip field can sit between two plain textarea fields inside the SAME `workspace__finalAssessment__fields` grid without nesting a second copy of that grid div. */
function TextField({ field, onChange }: { field: Field; onChange: (key: string, value: string) => void }) {
  return (
    <label className="workspace__finalAssessment__field">
      <span>{field.label}</span>
      <textarea
        rows={2}
        value={field.value}
        placeholder={field.placeholder}
        onChange={(e) => onChange(field.key, e.target.value)}
      />
    </label>
  )
}

function TextFields({
  fields,
  onChange,
  primary = false,
}: {
  fields: Field[]
  onChange: (key: string, value: string) => void
  /**
   * Round 14: the primary 판단 / 처치 / 재검 set lays out in one row where
   * there is room, so moving a field into the secondary disclosure
   * actually removes a row instead of leaving an empty grid cell.
   */
  primary?: boolean
}) {
  return (
    <div
      className={`workspace__finalAssessment__fields${primary ? ' workspace__finalAssessment__fields--primary' : ''}`}
    >
      {fields.map((f) => (
        <TextField key={f.key} field={f} onChange={onChange} />
      ))}
    </div>
  )
}

/*
 * Round 11: the default clinician action area compresses toward 판단 /
 * 처치 / 재검. Secondary fields stay in the persisted schema and stay
 * editable -- they simply stop looking mandatory on every visit. A
 * secondary field that ALREADY holds text opens automatically, so nothing
 * a clinician wrote is ever hidden from them.
 */
function SecondaryFields({
  fields,
  onChange,
}: {
  fields: Field[]
  onChange: (key: string, value: string) => void
}) {
  if (fields.length === 0) return null
  const hasContent = fields.some((f) => f.value.trim() !== '')
  return (
    <details className="workspace__optional workspace__finalAssessment__secondary" open={hasContent}>
      <summary>{`${fields.map((f) => f.label).join(' · ')} — 필요할 때 입력`}</summary>
      <TextFields fields={fields} onChange={onChange} />
    </details>
  )
}

/**
 * LBP v1 Batch 4 (§14.2, CD-2.7-2026-09-04 "처치 어휘 확정"): the 8
 * PO-approved intervention words `interventionPerformedOrPlanned` can be
 * built from, in the fixed order chips render. The persisted shape stays
 * the exact SAME free-text `string` field (no schema change, no new EMR
 * output shape) -- these chips are only a structured way to COMPOSE that
 * string; a value typed before this batch existed (any text that isn't
 * exactly one of these 8 words) is never one this list can silently
 * absorb or drop, see `parseInterventionValue` below.
 */
export const PAIN_INTERVENTION_CHIP_OPTIONS = ['침', '약침', '부항', '추나', '물리치료', '한약', '테이핑', '운동처방'] as const

/**
 * Splits the persisted comma-joined string into (a) which of the 8
 * approved words are present and (b) everything else, verbatim, joined
 * back the same way -- so a legacy free-text value (recorded before this
 * batch, or any note that just isn't one of the 8 words) is never lost, it
 * simply shows in the 기타 box instead of as a pressed chip. Opus delta
 * review defect #10: round-tripping through `composeInterventionValue` with
 * no chip/기타 edit is lossless in CONTENT (no token is ever dropped or
 * fabricated), but not always byte-identical -- chips are re-emitted in the
 * fixed canonical order (`침, 약침` even if the original string had
 * `약침, 침`), non-chip text is always moved after the chips (`침, 도수치료,
 * 부항` -> `침, 부항, 도수치료`), and comma-adjacent whitespace is normalized
 * (` 침 ,  부항 ` -> `침, 부항`). Verified by hand on all three examples.
 */
export function parseInterventionValue(value: string): { selected: Set<string>; otherText: string } {
  const tokens = value
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t !== '')
  const known: Set<string> = new Set(PAIN_INTERVENTION_CHIP_OPTIONS)
  const selected = new Set(tokens.filter((t) => known.has(t)))
  const otherTokens = tokens.filter((t) => !known.has(t))
  return { selected, otherText: otherTokens.join(', ') }
}

/** Inverse of `parseInterventionValue` -- chips first (fixed canonical order), then the 기타 text, comma-joined into the one persisted string. */
export function composeInterventionValue(selected: Set<string>, otherText: string): string {
  const parts: string[] = PAIN_INTERVENTION_CHIP_OPTIONS.filter((o) => selected.has(o))
  const other = otherText.trim()
  if (other) parts.push(other)
  return parts.join(', ')
}

/**
 * §14.2: `interventionPerformedOrPlanned`'s editor -- 8 multi-select chips
 * + one 기타 free-text box, entirely derived from the persisted `value`
 * string on every render (no separate chip-selection state to drift out of
 * sync with it).
 */
function InterventionChipField({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const { selected, otherText } = parseInterventionValue(value)
  function toggle(option: string) {
    const next = new Set(selected)
    if (next.has(option)) next.delete(option)
    else next.add(option)
    onChange(composeInterventionValue(next, otherText))
  }
  return (
    // Opus delta review defect #3: this used to be a <label>, whose
    // "labeled control" (the first labelable descendant, per the HTML spec
    // -- a <button> qualifies) was the 침 chip -- so tapping the caption or
    // any empty space inside the label toggled 침 unintentionally on a
    // touch screen. A plain <div> carries no such implicit association;
    // the chip group already has its own `aria-label` and the 기타 input
    // already has its own `aria-label`, so nothing here loses accessible
    // naming. Every other chip row in this workspace already uses a <div>
    // (ExamSuggestionCard.tsx, StructuredReassessmentCard.tsx) -- this
    // brings the intervention field into line with that convention.
    <div className="workspace__finalAssessment__field workspace__finalAssessment__field--intervention">
      <span>시행/예정 처치</span>
      <div className="workspace__examCard__statusRow" role="group" aria-label="시행/예정 처치 선택">
        {PAIN_INTERVENTION_CHIP_OPTIONS.map((opt) => (
          <button
            key={opt}
            type="button"
            aria-pressed={selected.has(opt)}
            className={`workspace__statusBtn${selected.has(opt) ? ' workspace__statusBtn--active' : ''}`}
            onClick={() => toggle(opt)}
          >
            {opt}
          </button>
        ))}
      </div>
      {/*
        LBP v1 Batch 4 (§14.2): a distinct class, NOT the shared
        `workspace__noteInput` every other free-text box in this workspace
        uses -- tests/doctor-workspace.spec.mjs's pre-existing N-2 pin
        queries the whole page for "the workspace__noteInput input" and
        expects exactly one match, so this input (unconditionally present,
        unlike every other conditionally-rendered `workspace__noteInput`)
        must not carry that exact class token even alongside another one.
        Styled identically via its own selector in workspace.css.

        Opus delta review defect #9: a plain `<input type="text">` runs the
        browser's value-sanitization algorithm on every render, which
        strips newlines -- so a legacy value recorded before this batch that
        contains a newline (`parseInterventionValue` itself preserves it
        verbatim) would lose it the moment the clinician typed even one more
        character here. Restored as a `<textarea rows={1}>` (the previous
        editor's element, before §14.2 introduced this field) so a newline
        survives editing; §14.2's own "기타 1칸" requirement is about the
        field COUNT (still exactly one), not the element type.
      */}
      <textarea
        rows={1}
        className="workspace__finalAssessment__interventionOther"
        value={otherText}
        placeholder="기타 (목록에 없는 처치)"
        aria-label="시행/예정 처치 기타"
        onChange={(e) => onChange(composeInterventionValue(selected, e.target.value))}
      />
    </div>
  )
}

export function PainFinalAssessmentCard({
  value,
  onChange,
}: {
  value: PainFinalAssessment
  onChange: (next: PainFinalAssessment) => void
}) {
  // 판단 / 처치 / 재검 -- the three the default view asks for. 처치 is a
  // chip field (InterventionChipField, §14.2), not a plain textarea, so
  // each of the three renders individually below (via `TextField`, the
  // single-field markup `TextFields` itself is built from) rather than
  // through one `TextFields` call -- that would nest a second copy of the
  // `workspace__finalAssessment__fields` grid div around the chip field.
  const finalWorkingAssessmentField: Field = {
    key: 'finalWorkingAssessment',
    label: '최종 임상 판단',
    value: value.finalWorkingAssessment,
    placeholder: '원장이 직접 입력',
  }
  const immediateRetestTargetField: Field = {
    key: 'immediateRetestTarget',
    label: '즉시 재검 대상',
    value: value.immediateRetestTarget,
    placeholder: '예: 숙일 때 통증 재현 여부',
  }
  const secondary: Field[] = [
    { key: 'treatmentFocus', label: '치료 초점', value: value.treatmentFocus, placeholder: '원장이 직접 입력' },
  ]
  const handleChange = (key: string, v: string) =>
    onChange({ ...value, [key]: v, recordedAt: new Date().toISOString() } as PainFinalAssessment)
  return (
    <section className="workspace__finalAssessment" aria-label="원장 최종 판단">
      <div className="workspace__finalAssessment__badge">원장 최종 판단</div>
      <div className="workspace__finalAssessment__fields workspace__finalAssessment__fields--primary">
        <TextField field={finalWorkingAssessmentField} onChange={handleChange} />
        <InterventionChipField
          value={value.interventionPerformedOrPlanned}
          onChange={(v) => handleChange('interventionPerformedOrPlanned', v)}
        />
        <TextField field={immediateRetestTargetField} onChange={handleChange} />
      </div>
      <SecondaryFields fields={secondary} onChange={handleChange} />
    </section>
  )
}

/*
 * Round 14: this card was the one place still opening FOUR textareas at
 * once, so a herbal record read as a form to fill rather than a decision
 * to record. It now follows the same 판단 / 처치 / 재검 split the Pain card
 * already used.
 *
 * Which field is which was decided by what it records, not by its name:
 *   판단 = 최종 변증·병기   처치 = 처방·계획   재검 = 추적할 증상
 * 치법 is the herbal analogue of Pain's 치료 초점 -- the principle behind
 * the treatment rather than the treatment itself -- so it is the field
 * that moves to secondary. 처방·계획 stays primary despite its "메모"
 * label because it is the only field recording what the patient actually
 * receives; collapsing that would have hidden 처치, not a detail.
 *
 * No chips or tap-actions were added for herbal's 처방/계획 메모. LBP v1
 * Batch 4 §14.2 (CD-2.7-1, `DECISIONS.md` 2026-09-04) DID resolve this
 * exact blocker for Pain's `interventionPerformedOrPlanned` field above --
 * the PO approved a closed 8-word intervention vocabulary (침/약침/부항/
 * 추나/물리치료/한약/테이핑/운동처방 + 기타 free text), so that field is now
 * `InterventionChipField`, not a plain textarea. Herbal's 처방/계획 메모
 * records a prescription description, not a modality pick from a fixed
 * list, so it was never the same kind of field and stays free text here --
 * this remains the one place with no approved chip vocabulary to build
 * from, not an oversight.
 *
 * Field keys, persisted shape and semantics are unchanged -- this is
 * purely which fields the default view opens.
 */
export function HerbalFinalAssessmentCard({
  value,
  onChange,
}: {
  value: HerbalFinalAssessment
  onChange: (next: HerbalFinalAssessment) => void
}) {
  const primary: Field[] = [
    {
      key: 'finalPatternOrMechanism',
      label: '최종 변증·병기',
      value: value.finalPatternOrMechanism,
      placeholder: '원장이 직접 입력',
    },
    {
      key: 'prescriptionPlanNote',
      label: '처방/계획 메모',
      value: value.prescriptionPlanNote,
      placeholder: '자동 처방 생성 없음 — 원장이 직접 입력',
    },
    { key: 'symptomsToTrack', label: '추적할 증상', value: value.symptomsToTrack, placeholder: '원장이 직접 입력' },
  ]
  const secondary: Field[] = [
    { key: 'treatmentPrinciple', label: '치법', value: value.treatmentPrinciple, placeholder: '원장이 직접 입력' },
  ]
  const handleChange = (key: string, v: string) =>
    onChange({ ...value, [key]: v, recordedAt: new Date().toISOString() } as HerbalFinalAssessment)
  return (
    <section className="workspace__finalAssessment" aria-label="최종 변증·병기 — 원장 판단">
      <div className="workspace__finalAssessment__badge">최종 변증·병기 — 원장 판단</div>
      <TextFields fields={primary} onChange={handleChange} primary />
      <SecondaryFields fields={secondary} onChange={handleChange} />
    </section>
  )
}
