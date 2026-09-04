/**
 * "임상 가설(확정 진단 아님)" — LBP v1 Batch 2.5c (docs/
 * LBP_PRODUCTION_V1_MINIMAL_ARCHITECTURE_v0.1.md §11.4). Five independent
 * chip groups (one per pattern), the same `workspace__followUpChip` +
 * `aria-pressed` + re-click-to-deselect convention `RevisitQuickCheckCard`/
 * `NextReassessmentPlanCard` already use — 5행 × 3 chip: every pattern's
 * "nothing chosen" member (`UNJUDGED`) is `LbpHypothesisSupport`'s stored
 * default (`lbpWorkingHypothesis.ts`), but it is NOT itself a rendered
 * chip. Removed Batch 2.6 (E-2, approved `DECISIONS.md` 2026-09-04
 * "원장 화면 실측 감사 (Opus) 및 Batch 2.6 착수 / 2.5d 보류"), matching
 * `RevisitQuickCheckCard`'s own `NOT_ASSESSED` convention, which was
 * already excluded from render for the same reason: a "nothing chosen"
 * member can never be pressed toward, only cleared, by re-clicking the
 * currently active chip in a group.
 *
 * The optional patient-sentence draft box below the chips is the ONLY path
 * a hypothesis-derived sentence can reach the patient (see
 * `lbpWorkingHypothesis.ts`'s file header for the full boundary reasoning)
 * — it renders only when `patientSentenceDraftKo` returns non-null (exactly
 * one HIGHER pattern), and its button never fires anything on its own; it
 * only calls `onInsertPatientSentence`, which the caller wires to the
 * "adopt, never automatic" append into `PainCarePlan.patientInstruction`
 * (mirrors `RehabSuggestionCard.tsx`'s `onAdoptToCarePlan` prop shape).
 */
import {
  LBP_HYPOTHESIS_PATIENT_SENTENCE_FIXED_CLAUSE_KO,
  LBP_HYPOTHESIS_PATTERN_IDS,
  LBP_HYPOTHESIS_PATTERN_LABEL_KO,
  LBP_HYPOTHESIS_SUPPORT_LABEL_KO,
  LBP_HYPOTHESIS_SUPPORT_OPTIONS,
  patientSentenceDraftKo,
  type LbpHypothesisPatternId,
  type LbpHypothesisSupport,
  type LbpWorkingHypothesis,
} from './lbpWorkingHypothesis'

function ChipGroup({
  title,
  groupAriaLabel,
  activeValue,
  onSelect,
}: {
  title: string
  groupAriaLabel: string
  activeValue: LbpHypothesisSupport
  /** Receives the pressed chip's own value, or 'UNJUDGED' when the already-active (non-UNJUDGED) chip is pressed again (deselect). */
  onSelect: (next: LbpHypothesisSupport) => void
}) {
  return (
    <div className="workspace__hypothesis__group">
      <h4>{title}</h4>
      <div className="workspace__followUp__options" role="group" aria-label={groupAriaLabel}>
        {/*
         * Batch 2.6 (E-2): `UNJUDGED` ("미판단") is never rendered as its
         * own chip -- there is nothing to press it FOR (it is the untouched
         * default, and `aria-pressed` never becomes true for it either way),
         * matching the sibling convention `RevisitQuickCheckCard` already
         * uses for its own NOT_ASSESSED value (revisitQuickCheck.ts's
         * QUICK_CHECK_*_OPTIONS exclude it the same way). Clearing a pattern
         * back to UNJUDGED still works exactly as before -- re-click the
         * active chip below, which the onClick handler already resolves to
         * 'UNJUDGED'. The stored default and the clear path are unchanged;
         * only the always-visible, never-clicked button disappears.
         */}
        {LBP_HYPOTHESIS_SUPPORT_OPTIONS.filter((opt) => opt !== 'UNJUDGED').map((opt) => {
          const pressed = activeValue === opt
          return (
            <button
              key={opt}
              type="button"
              aria-pressed={pressed}
              className={`workspace__followUpChip${pressed ? ' workspace__followUpChip--active' : ''}`}
              onClick={() => onSelect(activeValue === opt ? 'UNJUDGED' : opt)}
            >
              {LBP_HYPOTHESIS_SUPPORT_LABEL_KO[opt]}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function LbpWorkingHypothesisCard({
  value,
  onChange,
  onInsertPatientSentence,
  currentPatientInstruction,
}: {
  value: LbpWorkingHypothesis
  onChange: (next: LbpWorkingHypothesis) => void
  /**
   * Present only when the caller can actually act on it (an LBP record with
   * a `painCarePlan` to insert into) — omitted entirely, the draft box still
   * renders (the clinician can read/copy it by hand) but with no button,
   * matching `RehabSuggestionCard`'s `onAdoptToCarePlan?` optionality.
   */
  onInsertPatientSentence?: (sentence: string) => void
  /**
   * Opus delta review D-2/D-3: the card must know what
   * `PainCarePlan.patientInstruction` currently holds so it can tell the
   * clinician whether today's draft is already there, or whether the field
   * still carries a DIFFERENT (stale/edited) hypothesis sentence — never to
   * auto-edit or auto-delete anything in it, the field stays clinician-owned.
   * Omitted (undefined) is treated the same as "unknown" -- falls back to
   * the plain button, exactly like before this fix.
   */
  currentPatientInstruction?: string
}) {
  function setSupport(id: LbpHypothesisPatternId, next: LbpHypothesisSupport) {
    onChange({ supports: { ...value.supports, [id]: next }, recordedAt: new Date().toISOString() })
  }

  const draft = patientSentenceDraftKo(value)
  /**
   * D-2 (second click resurrects an edited sentence) + D-3 (stale text after
   * a chip change): three states, computed from `currentPatientInstruction`
   * without ever writing to it.
   *   1. today's draft is already an exact substring -> no button, static
   *      "이미 안내문에 들어 있습니다".
   *   2. the field contains SOME generated hypothesis sentence (detected via
   *      the fixed clause every draft ends with) but not today's exact
   *      draft -> keep the button, but warn above it.
   *   3. neither -> today's plain button (unchanged behaviour).
   */
  const draftAlreadyInInstruction = Boolean(draft && currentPatientInstruction && currentPatientInstruction.includes(draft))
  const staleHypothesisInInstruction = Boolean(
    draft &&
      !draftAlreadyInInstruction &&
      currentPatientInstruction &&
      currentPatientInstruction.includes(LBP_HYPOTHESIS_PATIENT_SENTENCE_FIXED_CLAUSE_KO),
  )

  return (
    <section className="workspace__block workspace__hypothesis" aria-label="임상 가설">
      <h3>
        임상 가설(확정 진단 아님){' '}
        <span className="workspace__block__hint">원장이 직접 선택합니다. 시스템이 계산하지 않습니다.</span>
      </h3>
      {LBP_HYPOTHESIS_PATTERN_IDS.map((id) => (
        <ChipGroup
          key={id}
          title={LBP_HYPOTHESIS_PATTERN_LABEL_KO[id]}
          groupAriaLabel={`${LBP_HYPOTHESIS_PATTERN_LABEL_KO[id]} 선택`}
          activeValue={value.supports[id]}
          onSelect={(next) => setSupport(id, next)}
        />
      ))}
      {draft && (
        <div className="workspace__hypothesis__patientDraft">
          <p className="workspace__hypothesis__patientDraftText">{draft}</p>
          {draftAlreadyInInstruction ? (
            <p className="workspace__hypothesis__patientDraftStatus">이미 안내문에 들어 있습니다</p>
          ) : (
            <>
              {staleHypothesisInInstruction && (
                <p className="workspace__hypothesis__patientDraftWarning">
                  안내문에 이전 가설 문장이 남아 있습니다. 직접 확인·수정하세요.
                </p>
              )}
              {onInsertPatientSentence && (
                <button type="button" className="workspace__adoptBtn" onClick={() => onInsertPatientSentence(draft)}>
                  안내문에 넣기
                </button>
              )}
            </>
          )}
        </div>
      )}
    </section>
  )
}
