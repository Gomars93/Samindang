/**
 * Single RehabSuggestion card: goal / rationale / source facts / clinician
 * accept-hold-reject + explicit adopt-into-Care-Plan action (round 3 Phase
 * I). Same "adopt, never automatic" pattern as PatternCandidateCard.tsx.
 */
import { PROVENANCE_BADGE } from './provenance'
import { REHAB_SUGGESTION_STATUS_LABEL, type RehabSuggestion, type RehabSuggestionStatus } from './rehabSuggestion'

const STATUS_OPTIONS: RehabSuggestionStatus[] = ['ACCEPTED', 'HELD', 'REJECTED']

export function RehabSuggestionCard({
  suggestion,
  onChange,
  onAdoptToCarePlan,
}: {
  suggestion: RehabSuggestion
  onChange: (next: RehabSuggestion) => void
  onAdoptToCarePlan?: () => void
}) {
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

      <input
        type="text"
        className="workspace__noteInput"
        value={suggestion.clinicianFinalInstruction}
        onChange={(e) => onChange({ ...suggestion, clinicianFinalInstruction: e.target.value })}
        placeholder="원장이 직접 다듬은 최종 지시문(선택)"
        aria-label={`${suggestion.title} 최종 지시문`}
      />

      {suggestion.status === 'ACCEPTED' && onAdoptToCarePlan && (
        <button type="button" className="workspace__adoptBtn" onClick={onAdoptToCarePlan}>
          치료 계획에 가져오기 →
        </button>
      )}
    </div>
  )
}
