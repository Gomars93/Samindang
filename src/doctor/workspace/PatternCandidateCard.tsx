/**
 * Single HerbalPatternCandidate card: 후보명 / 지지 소견 / 반증·주의 소견 /
 * 아직 확인할 것 / clinician accept-reject-hold (PR #24 Phase 4.2/6).
 */
import { PROVENANCE_BADGE } from './provenance'
import { PATTERN_CANDIDATE_STATUS_LABEL, type HerbalPatternCandidate, type PatternCandidateStatus } from './patternCandidate'

const STATUS_OPTIONS: PatternCandidateStatus[] = ['ACCEPTED', 'HELD', 'REJECTED']

export function PatternCandidateCard({
  candidate,
  onChange,
}: {
  candidate: HerbalPatternCandidate
  onChange: (next: HerbalPatternCandidate) => void
}) {
  return (
    <div className={`workspace__candidateCard workspace__candidateCard--${candidate.status.toLowerCase()}`}>
      <div className="workspace__candidateCard__head">
        <strong>{candidate.displayName}</strong>
        <span className="workspace__provBadge" title="시스템 결정지원 제안 — 확정 변증 아님">
          {PROVENANCE_BADGE[candidate.source]}
        </span>
        <span className="workspace__candidateStatusTag">{PATTERN_CANDIDATE_STATUS_LABEL[candidate.status]}</span>
      </div>

      {candidate.supportingFacts.length > 0 && (
        <div className="workspace__candidateFacts workspace__candidateFacts--support">
          <span>지지 소견</span>
          <ul>
            {candidate.supportingFacts.map((f, i) => (
              <li key={i}>{f.text}</li>
            ))}
          </ul>
        </div>
      )}

      {candidate.contradictingFacts.length > 0 && (
        <div className="workspace__candidateFacts workspace__candidateFacts--contradiction">
          <span>반증 / 주의 소견</span>
          <ul>
            {candidate.contradictingFacts.map((f, i) => (
              <li key={i}>{f.text}</li>
            ))}
          </ul>
        </div>
      )}

      {candidate.unknownChecks.length > 0 && (
        <div className="workspace__candidateFacts workspace__candidateFacts--unknown">
          <span>아직 확인할 것</span>
          <ul>
            {candidate.unknownChecks.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="workspace__candidateCard__actions" role="group" aria-label={`${candidate.displayName} 원장 판단`}>
        {STATUS_OPTIONS.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={candidate.status === s}
            className={`workspace__statusBtn${candidate.status === s ? ' workspace__statusBtn--active' : ''}`}
            onClick={() => onChange({ ...candidate, status: candidate.status === s ? 'PENDING_REVIEW' : s })}
          >
            {PATTERN_CANDIDATE_STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      <input
        type="text"
        className="workspace__noteInput"
        value={candidate.clinicianNote}
        onChange={(e) => onChange({ ...candidate, clinicianNote: e.target.value })}
        placeholder="판단 메모(선택)"
        aria-label={`${candidate.displayName} 판단 메모`}
      />
    </div>
  )
}
