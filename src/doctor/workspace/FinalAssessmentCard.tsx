/**
 * Clinician-owned Final Assessment card, parameterized for Pain or Herbal
 * (PR #24 Phase 7). Always visibly labeled "원장 최종 판단" — a system
 * SUGGESTED item is never auto-copied in here; every field starts empty
 * and is filled only by explicit clinician typing.
 */
import { useState } from 'react'
import type {
  HerbalFinalAssessment,
  PainFinalAssessment,
} from './finalAssessment'

export type Field = { key: string; label: string; value: string; placeholder: string }

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

/**
 * 2026-09-06 (원장 지시 "자유입력을 최대한 피하고 진료최적화"): 접힘 disclosure가
 * **한 번 열리면 내용이 비어도 다시 닫히지 않는** 래치.
 *
 * 왜 파생식(`open={hasContent}`)이 아니라 래치인가 — CLAUDE.md 규칙 3 / Batch 2.6
 * N-2 사고: 파생식이면 원장이 글을 쓰다가 전부 지운 순간 `hasContent`가 false로
 * 떨어져 disclosure가 편집 도중 닫힌다(커서 아래에서 칸이 사라짐). 래치는
 * "내용이 있었던 적이 있으면 열어둔다"만 기억하고, 닫는 것은 원장의 손(summary
 * 클릭)에만 맡긴다. React는 prop 값이 바뀔 때만 DOM `open`을 건드리므로 원장이
 * 손으로 닫은 상태를 다음 렌더가 되돌리지 않는다.
 *
 * 렌더 중 setState는 React가 파생 상태용으로 허용하는 패턴이다(즉시 재렌더).
 */
export function useOpenOnceContent(hasContent: boolean): boolean {
  const [latched, setLatched] = useState(hasContent)
  if (hasContent && !latched) setLatched(true)
  return latched
}

/*
 * Round 11: the default clinician action area compresses toward 처치. Secondary
 * fields stay in the persisted schema and stay editable -- they simply stop
 * looking mandatory on every visit. A secondary field that ALREADY holds text
 * opens automatically, so nothing a clinician wrote is ever hidden from them.
 *
 * 2026-09-06: exported so `CarePlanCard.tsx` can collapse its own secondary
 * fields with the SAME disclosure (one summary convention, one latch) instead
 * of a second implementation.
 */
export function SecondaryFields({
  fields,
  onChange,
}: {
  fields: Field[]
  onChange: (key: string, value: string) => void
}) {
  if (fields.length === 0) return null
  const hasContent = fields.some((f) => f.value.trim() !== '')
  const open = useOpenOnceContent(hasContent)
  return (
    <details className="workspace__optional workspace__finalAssessment__secondary" open={open}>
      <summary>{`${fields.map((f) => f.label).join(' · ')} — 필요할 때 입력`}</summary>
      <TextFields fields={fields} onChange={onChange} />
    </details>
  )
}

/**
 * PO-승인 처치 어휘. `interventionPerformedOrPlanned`를 이 단어들로 조립한다.
 * 저장 형태는 여전히 같은 free-text `string`이다(스키마·EMR 출력 모양 무변경) --
 * 칩은 그 문자열을 **구조적으로 조립하는 방법**일 뿐이고, 목록에 없는 값은
 * 절대 흡수되거나 버려지지 않는다(`parseInterventionValue` 참고).
 *
 * 2026-09-23 개정 (PO 지시) -- 기록할 가치가 있는 것만 남긴다
 * ----------------------------------------------------------
 * 처음 8개는 `['침','약침','부항','추나','물리치료','한약','테이핑','운동처방']`
 * 이었다. PO 판단으로 다섯을 뺐다:
 *
 *   침 · 부항  → **기본 치료**라 매 방문 들어간다. 매번 켜는 칩은 정보가 없다.
 *   테이핑 · 물리치료 → 삼인당에서 쓰지 않는다.
 *   한약  → 통증 진료에서 거의 쓰지 않는다(한약 프로필이 따로 담당한다).
 *
 * 그리고 **도침 · 매선**을 더했다. 원장 술기 스택의 2층(구조·지속형)인데
 * 8개 목록에 애초에 없었다.
 *
 * 약침을 둘로 나눈 이유
 * ---------------------
 * PO 서술: "염증을 침·부항·약침으로 잡고 … 조직회복력이 떨어지면 미주란이나
 * 태반을 같이 쓴다." 같은 약침이라도 **겨냥하는 것이 다르다.** 하나로 묶으면
 * 그 구분이 기록에서 사라진다.
 *
 * 제제 이름(미주란·태반·봉약침…)이 아니라 **목적**으로 나눈 이유: 제제는
 * 바뀌지만 목적은 안 바뀐다. 그리고 임상지식베이스 `09_치료술기/00_INDEX.md`가
 * "재료·제제가 다르면 근거를 전용하지 않는다"고 못박았으므로, 제제는 이 칩이
 * 아니라 별도 열로 기록해야 한다(아직 미구현).
 *
 * 순서는 PO 지식베이스의 Task-Load-Capacity 층을 따른다:
 * 1층(증상 조절) → 2층(가동성·구조) → 3층(부하 능력).
 *
 * 뺀 단어는 사라지지 않는다
 * -------------------------
 * `parseInterventionValue`가 목록에 없는 토큰을 **`기타` 자유입력에 그대로**
 * 넣는다. 그래서 이 개정 이전에 `침, 부항`으로 기록된 레코드는 값이 보존되고,
 * 칩이 눌린 대신 `기타` 칸에 글로 보인다. EMR 출력도 같은 문자열 그대로다.
 * `doctor-workspace.spec.mjs`가 이를 단언한다 -- 목록을 줄이는 변경에서 가장
 * 위험한 것이 조용한 소실이고, 이 저장소는 그 사고를 네 번 겪었다.
 */
export const PAIN_INTERVENTION_CHIP_OPTIONS = [
  // 1층 -- 증상 조절
  '약침(소염)',
  '약침(재생)',
  // 2층 -- 가동성 / 구조 / 지속형
  '추나',
  '도침',
  '매선',
  // 3층 -- 부하 능력
  '운동처방',
] as const

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
  // 2026-09-06 (원장 지시): 기본으로 보이는 것은 **처치 chip 하나**다.
  // 최종 임상 판단·즉시 재검 대상은 치료 초점과 함께 "필요할 때 입력"으로
  // 접었다 — 임상 가설 chip이 EMR A줄을 이미 채우고(`emrPreview.ts`의
  // hypothesisSummary), 레인2에서 체크한 검사가 재검 대상 역할을 이미 하므로
  // 두 칸은 같은 정보를 글로 다시 쓰라는 요구였다. **삭제가 아니라 접기**다:
  // 세 필드 모두 persisted schema·EMR·환자 안내문·재진 이어받기 경로를 한
  // 줄도 바꾸지 않고 그대로 나른다(DECISIONS.md 2026-09-06 필드 × 화면 표).
  const secondary: Field[] = [
    {
      key: 'finalWorkingAssessment',
      label: '최종 임상 판단',
      value: value.finalWorkingAssessment,
      placeholder: '원장이 직접 입력',
    },
    {
      key: 'immediateRetestTarget',
      label: '즉시 재검 대상',
      value: value.immediateRetestTarget,
      placeholder: '예: 숙일 때 통증 재현 여부',
    },
    { key: 'treatmentFocus', label: '치료 초점', value: value.treatmentFocus, placeholder: '원장이 직접 입력' },
  ]
  const handleChange = (key: string, v: string) =>
    onChange({ ...value, [key]: v, recordedAt: new Date().toISOString() } as PainFinalAssessment)
  return (
    <section className="workspace__finalAssessment" aria-label="원장 최종 판단">
      <div className="workspace__finalAssessment__badge">원장 최종 판단</div>
      <div className="workspace__finalAssessment__fields workspace__finalAssessment__fields--primary">
        <InterventionChipField
          value={value.interventionPerformedOrPlanned}
          onChange={(v) => handleChange('interventionPerformedOrPlanned', v)}
        />
      </div>
      <SecondaryFields fields={secondary} onChange={handleChange} />
    </section>
  )
}

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
