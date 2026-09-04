/**
 * Single RehabSuggestion card: goal / rationale / source facts / clinician
 * accept-hold-reject + explicit adopt-into-Care-Plan action (round 3 Phase
 * I). Same "adopt, never automatic" pattern as PatternCandidateCard.tsx.
 */
import { useState } from 'react'
import { PROVENANCE_BADGE } from './provenance'
import { REHAB_SUGGESTION_STATUS_LABEL, type RehabSuggestion, type RehabSuggestionStatus } from './rehabSuggestion'

const STATUS_OPTIONS: RehabSuggestionStatus[] = ['ACCEPTED', 'HELD', 'REJECTED']

export function RehabSuggestionCard({
  suggestion,
  onChange,
  onAdoptToCarePlan,
  adoptDisabledReasonKo,
}: {
  suggestion: RehabSuggestion
  onChange: (next: RehabSuggestion) => void
  onAdoptToCarePlan?: () => void
  /**
   * LBP v1 Batch 2 (CD-2, PO-approved option A): when set, the candidate
   * card itself still renders normally — only the adopt action is disabled,
   * with this reason shown next to it. Never hide the card/section for
   * this; only Care-Plan finalization is gated (FROZEN
   * `treatmentSafetyLocked`, `src/spec/lbpLogic.ts`).
   */
  adoptDisabledReasonKo?: string
}) {
  /*
   * Batch 2.6 (E-6): follows ExamSuggestionCard.tsx's own 상세·메모 toggle
   * convention -- an always-open free-text box read as a form waiting to be
   * filled even when the clinician meant to say nothing more than the
   * accept/hold/reject decision above it.
   *
   * Delta fix (Opus review D-2): the original version starts `useState`
   * from `suggestion.clinicianFinalInstruction`, which is evaluated ONCE at
   * mount. On the SAME card instance (same `key={s.id}` in PainWorkspace.tsx),
   * an instruction arriving after mount -- a conflict reload
   * (DoctorWorkspace.tsx's `handleReloadFromConflict`) or a same-record
   * re-seed (`initialRecordUpdatedAt` advancing) -- stayed hidden forever,
   * because the toggle never re-derives from the new prop. Following
   * ExamSuggestionCard.tsx:62-73's OWN pattern (not just its UI shape) fixes
   * this: `showInstruction` derives fresh on every render, so a value that
   * shows up later is never hidden behind a stale mount-time flag.
   *
   * Closing review fix (Opus N-2): the mount-time `useState` still needs to
   * LATCH open when the card mounts with content already present, exactly
   * like `ExamSuggestionCard.tsx:62-63`'s `useState(hasDetail)` -- otherwise
   * clearing an existing instruction's text flips `showInstruction` to
   * false mid-edit, unmounting the input out from under the cursor.
   */
  const [instructionOpen, setInstructionOpen] = useState(suggestion.clinicianFinalInstruction.trim() !== '')
  const showInstruction = instructionOpen || suggestion.clinicianFinalInstruction.trim() !== ''

  return (
    <div className={`workspace__candidateCard workspace__candidateCard--${suggestion.status.toLowerCase()}`}>
      <div className="workspace__candidateCard__head">
        <strong>{suggestion.title}</strong>
        <span className="workspace__provBadge" title="시스템 결정지원 제안 — 처방된 재활 아님">
          {PROVENANCE_BADGE[suggestion.source]}
        </span>
        <span className="workspace__candidateStatusTag">{REHAB_SUGGESTION_STATUS_LABEL[suggestion.status]}</span>
      </div>

      {suggestion.goal && (
        <p className="workspace__examCard__reason">
          <strong>목표</strong> {suggestion.goal}
        </p>
      )}
      {suggestion.rationale && (
        <p className="workspace__examCard__reason">
          <strong>근거</strong> {suggestion.rationale}
        </p>
      )}

      {suggestion.sourceFacts.length > 0 && (
        <div className="workspace__candidateFacts workspace__candidateFacts--support">
          <span>근거 소견</span>
          <ul>
            {suggestion.sourceFacts.map((f, i) => (
              <li key={i}>{f.text}</li>
            ))}
          </ul>
        </div>
      )}

      {suggestion.contraindicationFacts.length > 0 && (
        <div className="workspace__candidateFacts workspace__candidateFacts--contradiction">
          <span>주의/금기</span>
          <ul>
            {suggestion.contraindicationFacts.map((f, i) => (
              <li key={i}>{f.text}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="workspace__candidateCard__actions" role="group" aria-label={`${suggestion.title} 원장 판단`}>
        {STATUS_OPTIONS.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={suggestion.status === s}
            className={`workspace__statusBtn${suggestion.status === s ? ' workspace__statusBtn--active' : ''}`}
            onClick={() => onChange({ ...suggestion, status: suggestion.status === s ? 'SUGGESTED' : s })}
          >
            {REHAB_SUGGESTION_STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      {showInstruction ? (
        <input
          type="text"
          className="workspace__noteInput"
          value={suggestion.clinicianFinalInstruction}
          onChange={(e) => onChange({ ...suggestion, clinicianFinalInstruction: e.target.value })}
          placeholder="원장이 직접 다듬은 최종 지시문(선택)"
          aria-label={`${suggestion.title} 최종 지시문`}
        />
      ) : (
        <button type="button" className="workspace__detailToggle" onClick={() => setInstructionOpen(true)}>
          최종 지시문 추가
        </button>
      )}

      {suggestion.status === 'ACCEPTED' && onAdoptToCarePlan && (
        <>
          <button
            type="button"
            className="workspace__adoptBtn"
            onClick={onAdoptToCarePlan}
            disabled={Boolean(adoptDisabledReasonKo)}
          >
            치료 계획에 가져오기 →
          </button>
          {adoptDisabledReasonKo && <p className="workspace__examCard__reason">{adoptDisabledReasonKo}</p>}
        </>
      )}
    </div>
  )
}
