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
 * 1층(증상 조절) → 2층(가동성·구조).
 *
 * 3층(운동)이 여기 없는 이유
 * --------------------------
 * `운동처방` 칩도 뺐다(2026-09-23, PO 확인). 운동은 **운동 카드**
 * (`PainExerciseSection` → `RehabSuggestion.status` 채택/보류/거절)가 이미
 * 칩으로 담당하고, 그쪽이 훨씬 많이 담는다 -- 어떤 운동인지, 채택했는지까지.
 * 이 칩은 "운동처방함" 한 단어뿐이라 같은 것을 두 번 묻는 꼴이었다.
 * 채택하면 `appendAdoptionText`가 문구를 `carePlan.homeActionPlan`에 붙이고
 * EMR P줄 `집에서 할 일:`로 나간다.
 *
 * **예외 하나 — 팔꿈치.** `regionPacks/elbow.ts`가 `exercises: []`다
 * ("PR #30 범위 밖 부위 — 도메인표 없음"). 그 부위 환자에게는 운동 카드에
 * 후보가 하나도 안 떠서, 칩까지 빼면 "운동 처방했다"를 기록할 경로가 없다.
 * 그 경우는 `기타` 자유입력이 받는다(`parseInterventionValue`가 보존을
 * 보장한다). 팔꿈치 운동 도메인표가 승인되면 자동으로 카드가 생기므로 이
 * 예외는 스스로 사라진다. `doctor-workspace.spec.mjs`가 이 공백을 단언으로
 * 고정해 뒀다 -- 나중에 "왜 팔꿈치만 다르지?"를 다시 발견하지 않도록.
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
export function parseChipValue(
  value: string,
  vocabulary: readonly string[],
): { selected: Set<string>; otherText: string } {
  const tokens = value
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t !== '')
  const known: Set<string> = new Set(vocabulary)
  const selected = new Set(tokens.filter((t) => known.has(t)))
  const otherTokens = tokens.filter((t) => !known.has(t))
  return { selected, otherText: otherTokens.join(', ') }
}

export function parseInterventionValue(value: string): { selected: Set<string>; otherText: string } {
  return parseChipValue(value, PAIN_INTERVENTION_CHIP_OPTIONS)
}

/** `parseChipValue`의 역 -- 칩 먼저(카탈로그 고정 순서), 그 다음 기타 텍스트, 쉼표 조인. */
export function composeChipValue(
  selected: Set<string>,
  otherText: string,
  vocabulary: readonly string[],
): string {
  const parts: string[] = vocabulary.filter((o) => selected.has(o))
  const other = otherText.trim()
  if (other) parts.push(other)
  return parts.join(', ')
}

/** Inverse of `parseInterventionValue` -- chips first (fixed canonical order), then the 기타 text, comma-joined into the one persisted string. */
export function composeInterventionValue(selected: Set<string>, otherText: string): string {
  return composeChipValue(selected, otherText, PAIN_INTERVENTION_CHIP_OPTIONS)
}

/**
 * 치료 초점 -- PO 지식베이스의 **Task–Load–Capacity 3층** 그대로.
 *
 * `09_치료술기/00_INDEX.md`의 운영 철학:
 *
 *   "환자 문진은 '무엇을 못 하는지'를 찾고, 원장 진찰은 그 task를 제한하는
 *    수정 가능한 병목을 찾는다. 침·약침·부항·추나·도침·매선은 병목을 줄여
 *    움직일 여지를 만드는 수단이고, 재활은 그 여지를 실제 load capacity로
 *    바꾼다."
 *
 * 같은 문서의 폴더 표가 층을 이렇게 배정한다:
 *   1층 symptom modulation        -- 침·전침, 약침, 부항
 *   2층 movement option / 국소 mechanical sensitivity -- 추나, 도침, 매선
 *   3층 capacity building         -- 재활
 *
 * 그래서 `치료 초점`은 자유입력일 이유가 없다. **오늘 어느 층을 겨냥했는가**가
 * 답이고, 값이 셋뿐이다. 자유입력이면 표현이 매번 달라져 누적되지 않는다.
 *
 * 한글 라벨은 **내 초안이다.** 영문 층 이름을 원장 서술에 맞춰 옮긴 것이고,
 * PO 승인 전이다(`HANDOFF.md` 승인 대기 목록).
 *
 * 처치 칩과 **같은 메커니즘**을 쓴다 -- 저장 형태는 여전히 같은 free-text
 * `string`이고(스키마·EMR·재진 이어받기 경로 전부 무변경), 목록에 없는 값은
 * `기타`로 그대로 보존된다. 즉 이 변경은 **아무것도 제거하지 않는다.**
 */
export const PAIN_TREATMENT_FOCUS_CHIP_OPTIONS = [
  '증상 조절',
  '가동성 확보',
  '부하 능력',
] as const

export function parseTreatmentFocusValue(value: string): { selected: Set<string>; otherText: string } {
  return parseChipValue(value, PAIN_TREATMENT_FOCUS_CHIP_OPTIONS)
}

export function composeTreatmentFocusValue(selected: Set<string>, otherText: string): string {
  return composeChipValue(selected, otherText, PAIN_TREATMENT_FOCUS_CHIP_OPTIONS)
}

/**
 * 칩 + `기타` 자유입력 한 칸짜리 필드. 저장된 문자열에서 **매 렌더 파생**하므로
 * 별도 선택 상태가 값과 어긋날 여지가 없다.
 *
 * 원래 `interventionPerformedOrPlanned` 전용(`InterventionChipField`)이었다.
 * 2026-09-23에 `치료 초점`이 같은 모양을 쓰게 되면서 어휘·라벨·placeholder를
 * props로 뺐다 -- 두 벌을 만들면 이 저장소가 세 번 겪은 "같은 게 두 군데,
 * 한 쪽만 고쳐짐"이 네 번째가 된다.
 */
function ChipField({
  value,
  onChange,
  label,
  vocabulary,
  otherPlaceholder,
  fieldClassName,
  alwaysShowOther,
}: {
  value: string
  onChange: (next: string) => void
  label: string
  vocabulary: readonly string[]
  otherPlaceholder: string
  /** 기존 처치 칩의 클래스명을 그대로 유지하기 위한 것 -- 스타일이 이미 그 이름에 붙어 있다. */
  fieldClassName: string
  /**
   * `기타` 자유입력을 **항상** 띄울지.
   *
   * 처치(`시행/예정 처치`)는 `true`다 -- 2026-09-06부터 통증 화면의 상시
   * 자유입력 **한 칸**이 바로 이것이고, `tablet-viewport.spec.mjs`의
   * `EXPECTED_OPEN_INPUTS_PAIN = 1`이 그 한 칸을 고정한다.
   *
   * 치료 초점은 `false`다. 칩 세 개면 충분하고, 상시 자유입력을 하나 더
   * 늘리면 "자유입력을 최대한 피한다"는 이번 재설계의 전제가 깨진다
   * (실제로 이 예산 핀이 1 → 2로 걸려서 발견했다).
   *
   * 그렇다고 칸을 아예 없애면 **목록에 없는 기존 값이 읽히는데 못 고치는
   * 상태**가 된다(Batch 2.6 D-1과 같은 모양). 그래서 `useOpenOnceContent`
   * 래치를 쓴다 -- 값이 있으면 열리고, **한 번 열리면 지워도 안 닫힌다.**
   * 파생식(`open={hasText}`)으로 하면 편집 도중 전부 지우는 순간 칸이
   * 사라진다(CLAUDE.md 규칙 3항, Batch 2.6 N-2 사고).
   */
  alwaysShowOther: boolean
}) {
  const { selected, otherText } = parseChipValue(value, vocabulary)
  const showOther = useOpenOnceContent(alwaysShowOther || otherText.trim() !== '')
  function toggle(option: string) {
    const next = new Set(selected)
    if (next.has(option)) next.delete(option)
    else next.add(option)
    onChange(composeChipValue(next, otherText, vocabulary))
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
    <div className={`workspace__finalAssessment__field ${fieldClassName}`}>
      <span>{label}</span>
      <div className="workspace__examCard__statusRow" role="group" aria-label={`${label} 선택`}>
        {vocabulary.map((opt) => (
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
      {showOther && (
        <textarea
          rows={1}
          className="workspace__finalAssessment__interventionOther"
          value={otherText}
          placeholder={otherPlaceholder}
          aria-label={`${label} 기타`}
          onChange={(e) => onChange(composeChipValue(selected, e.target.value, vocabulary))}
        />
      )}
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
  // 2026-09-06 (원장 지시): 기본으로 보이는 것은 **처치 chip 하나**였고,
  // 최종 임상 판단·즉시 재검 대상·치료 초점 셋은 "필요할 때 입력"으로 접었다.
  // **삭제가 아니라 접기**다: 세 필드 모두 persisted schema·EMR·환자 안내문·
  // 재진 이어받기 경로를 한 줄도 바꾸지 않고 그대로 나른다.
  //
  // 2026-09-23: 그중 **치료 초점을 접힘에서 꺼내 칩으로** 세웠다. 자유입력일
  // 이유가 없는 필드였다 -- PO 지식베이스의 Task-Load-Capacity 3층이 답이고
  // 값이 셋뿐이다(`PAIN_TREATMENT_FOCUS_CHIP_OPTIONS` 주석 참고). 접혀 있으면
  // 안 채우고, 자유입력이면 표현이 매번 달라져 누적되지 않는다.
  //
  // **제거가 아니다.** 저장 형태는 여전히 같은 free-text `string`이고 EMR
  // A줄(`치료 초점: …`)도, 재진 이어받기(`revisitCarryForward.ts`)도 그대로다.
  // 옛 자유입력 값은 `기타` 칸에 그대로 보존된다 -- 처치 칩과 같은 메커니즘.
  /*
   * 2026-09-23: `즉시 재검 대상`은 **신규 방문에서 렌더되지 않는다.**
   *
   * PO가 "치료 직후 즉시 재검"(타이밍 ①)을 하지 않기로 했다 -- 반응 측정은
   * 2주 링크와 재진 문진이 전담한다. 그 칸은 ①의 입력칸이었으므로 존재
   * 이유가 사라졌다. `revisitCarryForward.ts`에서도 함께 뺐다(편집 UI만 닫고
   * 이어받기를 남기면 오늘 방문에 편집 불가 값이 생긴다 -- Batch 2.6 D-1).
   *
   * **기존 값은 계속 보이고 고칠 수 있다.** 값이 있으면 칸이 나오고, 한 번
   * 나오면 지워도 안 사라진다(`useOpenOnceContent` 래치) -- 파생식이면 편집
   * 도중 비우는 순간 칸이 사라진다(Batch 2.6 N-2). EMR P줄도 그대로다.
   *
   * `최종 임상 판단`은 **아직 남긴다.** PO 승인은 받았지만, 서버가 그 값으로
   * `pain_final_assessment_summary`를 만들고 그게 `PriorVisitHistoryCard`의
   * 「이전 최종 판단」과 `RevisitWorkspace` 요약 줄 **두 화면**에 뜬다. 지금
   * 지우면 그 두 칸이 영구히 빈칸이 된다. 대체하려면 임상 가설 요약을 저장할
   * 새 필드가 필요하다(별도 작업, `HANDOFF.md` 참고).
   */
  const showRetestTarget = useOpenOnceContent(value.immediateRetestTarget.trim() !== '')
  const secondary: Field[] = [
    {
      key: 'finalWorkingAssessment',
      label: '최종 임상 판단',
      value: value.finalWorkingAssessment,
      placeholder: '원장이 직접 입력',
    },
    ...(showRetestTarget
      ? [
          {
            key: 'immediateRetestTarget',
            label: '즉시 재검 대상',
            value: value.immediateRetestTarget,
            placeholder: '예: 숙일 때 통증 재현 여부',
          },
        ]
      : []),
  ]
  const handleChange = (key: string, v: string) =>
    onChange({ ...value, [key]: v, recordedAt: new Date().toISOString() } as PainFinalAssessment)
  return (
    <section className="workspace__finalAssessment" aria-label="원장 최종 판단">
      <div className="workspace__finalAssessment__badge">원장 최종 판단</div>
      <div className="workspace__finalAssessment__fields workspace__finalAssessment__fields--primary">
        <ChipField
          label="시행/예정 처치"
          vocabulary={PAIN_INTERVENTION_CHIP_OPTIONS}
          otherPlaceholder="기타 (목록에 없는 처치)"
          fieldClassName="workspace__finalAssessment__field--intervention"
          alwaysShowOther
          value={value.interventionPerformedOrPlanned}
          onChange={(v) => handleChange('interventionPerformedOrPlanned', v)}
        />
        <ChipField
          label="치료 초점"
          vocabulary={PAIN_TREATMENT_FOCUS_CHIP_OPTIONS}
          otherPlaceholder="기타 (세 층으로 담기지 않는 초점)"
          fieldClassName="workspace__finalAssessment__field--intervention"
          alwaysShowOther={false}
          value={value.treatmentFocus}
          onChange={(v) => handleChange('treatmentFocus', v)}
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
