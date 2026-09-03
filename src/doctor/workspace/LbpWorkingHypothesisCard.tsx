/**
 * "임상 가설(확정 진단 아님)" — LBP v1 Batch 2.5c (docs/
 * LBP_PRODUCTION_V1_MINIMAL_ARCHITECTURE_v0.1.md §11.4). Five independent
 * chip groups (one per pattern), the same `workspace__followUpChip` +
 * `aria-pressed` + re-click-to-deselect convention `RevisitQuickCheckCard`/
 * `NextReassessmentPlanCard` already use — except every pattern's "nothing
 * chosen" member (`UNJUDGED`) is itself a rendered 4th chip here (§11.4's
 * "5행 × 4 chip"), never highlighted (`aria-pressed` stays false for it even
 * while it is the active value) so the default state still reads as zero
 * pressed chips, matching `RevisitQuickCheckCard`'s convention exactly.
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
        {LBP_HYPOTHESIS_SUPPORT_OPTIONS.map((opt) => {
          // 'UNJUDGED' is a real, clickable chip (resets straight to
          // UNJUDGED regardless of what was active) but never renders as
          // pressed itself -- the default/unset state always shows zero
          // pressed chips, same reading as every other chip group in this
          // codebase.
          const pressed = activeValue === opt && opt !== 'UNJUDGED'
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
}) {
  function setSupport(id: LbpHypothesisPatternId, next: LbpHypothesisSupport) {
    onChange({ supports: { ...value.supports, [id]: next }, recordedAt: new Date().toISOString() })
  }

  const draft = patientSentenceDraftKo(value)

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
          {onInsertPatientSentence && (
            <button type="button" className="workspace__adoptBtn" onClick={() => onInsertPatientSentence(draft)}>
              안내문에 넣기
            </button>
          )}
        </div>
      )}
    </section>
  )
}
