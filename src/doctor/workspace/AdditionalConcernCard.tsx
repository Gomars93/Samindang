/**
 * Compact Additional Concern card (round 3 Phase H). North Star: "Primary =
 * Depth, Additional = Coverage" — this stays deliberately small, showing
 * only what module the patient's Additional concern routed to, plus an
 * explicit, optional, workspace-local "flag for deeper look today" note.
 *
 * Flagging never mutates payload.routing, never changes which SafetyPanel
 * renders, and never selects a new Safety Mini-Gate question — it is a
 * sticky note for this visit's own record-keeping only.
 */
import { CONCERN_ROLE_LABEL, type AdditionalConcernPromotionState, type AdditionalConcernSummary } from './additionalConcern'
import { PROVENANCE_BADGE } from './provenance'

export function AdditionalConcernCard({
  summary,
  promotion,
  onChangePromotion,
}: {
  summary: AdditionalConcernSummary
  promotion: AdditionalConcernPromotionState
  onChangePromotion: (next: AdditionalConcernPromotionState) => void
}) {
  const flagged = promotion.status === 'MANUALLY_FLAGGED'

  function toggleFlag() {
    onChangePromotion(
      flagged
        ? { status: 'NOT_FLAGGED', clinicianNote: promotion.clinicianNote, promotedAt: null }
        : { ...promotion, status: 'MANUALLY_FLAGGED', promotedAt: new Date().toISOString() },
    )
  }

  return (
    <section className="workspace__additionalConcern" aria-label="추가 문제">
      <div className="workspace__additionalConcern__head">
        <span className="workspace__provBadge" title="이미 계산된 라우팅 값 — 새 판단 아님">
          {PROVENANCE_BADGE[summary.source]}
        </span>
        <span className="workspace__additionalConcern__role">{CONCERN_ROLE_LABEL[summary.role]}</span>
        <strong>{summary.detailConcernLabel ?? summary.module}</strong>
      </div>
      <button
        type="button"
        aria-pressed={flagged}
        className={`workspace__followUpChip${flagged ? ' workspace__followUpChip--active' : ''}`}
        onClick={toggleFlag}
      >
        오늘 상세평가 필요로 표시
      </button>
      {flagged && (
        <input
          type="text"
          className="workspace__noteInput"
          value={promotion.clinicianNote}
          onChange={(e) => onChangePromotion({ ...promotion, clinicianNote: e.target.value })}
          placeholder="왜 오늘 더 볼지 메모(선택)"
          aria-label="추가 문제 상세평가 메모"
        />
      )}
    </section>
  )
}
