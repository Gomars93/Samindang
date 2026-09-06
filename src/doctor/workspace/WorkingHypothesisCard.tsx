/**
 * "임상 가설(확정 진단 아님)" — 부위 무관 카드. 요통 v1 Batch 2.5c의
 * `LbpWorkingHypothesisCard.tsx`(architecture §11.4)를 패턴 목록을 prop으로
 * 받게 일반화한 것이며, 요통 카드는 요통 5패턴을 넘기는 래퍼가 됐다. 마크업·
 * 클래스·문구는 요통 원본과 같다(`tests/lbp-working-hypothesis.spec.mjs`가
 * 요통 래퍼의 렌더 결과를 고정한다).
 *
 * N independent chip groups (one per pattern), the same `workspace__followUpChip`
 * + `aria-pressed` + re-click-to-deselect convention `RevisitQuickCheckCard`/
 * `NextReassessmentPlanCard` already use — N행 × 3 chip: `UNJUDGED` is the
 * stored default but is NOT itself a rendered chip (Batch 2.6 E-2).
 *
 * The optional patient-sentence draft box below the chips is the ONLY path a
 * hypothesis-derived sentence can reach the patient — it renders only when
 * `patientSentenceDraftKoFor` returns non-null (exactly one HIGHER pattern),
 * and its button never fires anything on its own; it only calls
 * `onInsertPatientSentence`, which the caller wires to the "adopt, never
 * automatic" append into `PainCarePlan.patientInstruction`.
 */
import {
  HYPOTHESIS_PATIENT_SENTENCE_FIXED_CLAUSE_KO,
  HYPOTHESIS_SUPPORT_LABEL_KO,
  HYPOTHESIS_SUPPORT_OPTIONS,
  patientSentenceDraftKoFor,
  type HypothesisPattern,
  type HypothesisSupport,
  type WorkingHypothesis,
} from './workingHypothesis'

function ChipGroup({
  title,
  groupAriaLabel,
  activeValue,
  onSelect,
}: {
  title: string
  groupAriaLabel: string
  activeValue: HypothesisSupport
  /** Receives the pressed chip's own value, or 'UNJUDGED' when the already-active (non-UNJUDGED) chip is pressed again (deselect). */
  onSelect: (next: HypothesisSupport) => void
}) {
  return (
    <div className="workspace__hypothesis__group">
      <h4>{title}</h4>
      <div className="workspace__followUp__options" role="group" aria-label={groupAriaLabel}>
        {HYPOTHESIS_SUPPORT_OPTIONS.filter((opt) => opt !== 'UNJUDGED').map((opt) => {
          const pressed = activeValue === opt
          return (
            <button
              key={opt}
              type="button"
              aria-pressed={pressed}
              className={`workspace__followUpChip${pressed ? ' workspace__followUpChip--active' : ''}`}
              onClick={() => onSelect(activeValue === opt ? 'UNJUDGED' : opt)}
            >
              {HYPOTHESIS_SUPPORT_LABEL_KO[opt]}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function WorkingHypothesisCard({
  patterns,
  value,
  onChange,
  onInsertPatientSentence,
  currentPatientInstruction,
}: {
  /** 팩의 `hypothesisPatterns`. 선언 순서가 렌더 순서다. */
  patterns: readonly HypothesisPattern[]
  value: WorkingHypothesis
  onChange: (next: WorkingHypothesis) => void
  /**
   * Present only when the caller can actually act on it (a record with a
   * `painCarePlan` to insert into) — omitted entirely, the draft box still
   * renders (the clinician can read/copy it by hand) but with no button.
   */
  onInsertPatientSentence?: (sentence: string) => void
  /**
   * Opus delta review D-2/D-3: the card must know what
   * `PainCarePlan.patientInstruction` currently holds so it can tell the
   * clinician whether today's draft is already there, or whether the field
   * still carries a DIFFERENT (stale/edited) hypothesis sentence — never to
   * auto-edit or auto-delete anything in it, the field stays clinician-owned.
   */
  currentPatientInstruction?: string
}) {
  function setSupport(id: string, next: HypothesisSupport) {
    onChange({ supports: { ...value.supports, [id]: next }, recordedAt: new Date().toISOString() })
  }

  const draft = patientSentenceDraftKoFor(patterns, value)
  const draftAlreadyInInstruction = Boolean(draft && currentPatientInstruction && currentPatientInstruction.includes(draft))
  const staleHypothesisInInstruction = Boolean(
    draft &&
      !draftAlreadyInInstruction &&
      currentPatientInstruction &&
      currentPatientInstruction.includes(HYPOTHESIS_PATIENT_SENTENCE_FIXED_CLAUSE_KO),
  )

  return (
    <section className="workspace__block workspace__hypothesis" aria-label="임상 가설">
      <h3>
        임상 가설(확정 진단 아님){' '}
        <span className="workspace__block__hint">원장이 직접 선택합니다. 시스템이 계산하지 않습니다.</span>
      </h3>
      {patterns.map((p) => (
        <ChipGroup
          key={p.id}
          title={p.labelKo}
          groupAriaLabel={`${p.labelKo} 선택`}
          activeValue={value.supports[p.id] ?? 'UNJUDGED'}
          onSelect={(next) => setSupport(p.id, next)}
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
