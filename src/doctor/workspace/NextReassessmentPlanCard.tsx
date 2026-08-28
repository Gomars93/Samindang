/**
 * "다음 상세 재평가" — NextReassessmentPlan card (round 3 Phase B).
 * Distinct from the ordinary Follow-up Target picker: this is when the
 * NEXT Structured Reassessment should happen, not what to track meanwhile.
 * No default timing is pre-selected — the clinician must explicitly pick a
 * status before any date/count/note field appears.
 */
import {
  NEXT_REASSESSMENT_PLAN_STATUS_LABEL,
  type NextReassessmentPlan,
  type NextReassessmentPlanStatus,
} from './finalAssessment'

const STATUS_OPTIONS: NextReassessmentPlanStatus[] = ['DATE', 'VISIT_COUNT', 'CLINICIAN_DECIDES']

export function NextReassessmentPlanCard({
  value,
  onChange,
}: {
  value: NextReassessmentPlan
  onChange: (next: NextReassessmentPlan) => void
}) {
  function setStatus(status: NextReassessmentPlanStatus) {
    onChange({ ...value, status: value.status === status ? 'UNSET' : status })
  }

  return (
    <section className="workspace__reassessPlan" aria-label="다음 상세 재평가">
      <h4>다음 상세 재평가</h4>
      <p className="workspace__reassessPlan__hint">
        일반 재평가 대상(위)과 다릅니다 — 다음 Structured Reassessment를 언제/어떻게 잡을지 원장이 직접 정합니다.
        기본값은 없습니다.
      </p>
      <div className="workspace__reassessPlan__options" role="group" aria-label="다음 상세 재평가 방식">
        {STATUS_OPTIONS.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={value.status === s}
            className={`workspace__followUpChip${value.status === s ? ' workspace__followUpChip--active' : ''}`}
            onClick={() => setStatus(s)}
          >
            {NEXT_REASSESSMENT_PLAN_STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      {value.status === 'DATE' && (
        <label className="workspace__reassessPlan__field">
          <span>목표 날짜</span>
          <input
            type="date"
            value={value.targetDate}
            onChange={(e) => onChange({ ...value, targetDate: e.target.value })}
          />
        </label>
      )}

      {value.status === 'VISIT_COUNT' && (
        <label className="workspace__reassessPlan__field">
          <span>몇 번째 방문 후</span>
          <input
            type="number"
            min={1}
            max={99}
            value={value.afterVisitCount ?? ''}
            onChange={(e) => {
              const n = e.target.value.trim() === '' ? null : Number(e.target.value)
              onChange({ ...value, afterVisitCount: Number.isFinite(n) ? n : null })
            }}
            placeholder="예: 3"
          />
        </label>
      )}

      {(value.status === 'DATE' || value.status === 'VISIT_COUNT' || value.status === 'CLINICIAN_DECIDES') && (
        <label className="workspace__reassessPlan__field">
          <span>메모(선택)</span>
          <input
            type="text"
            className="workspace__noteInput"
            value={value.note}
            onChange={(e) => onChange({ ...value, note: e.target.value })}
            placeholder="예: 통증 지속 시 영상검사 고려"
          />
        </label>
      )}

      {value.status === 'UNSET' && <p className="workspace__empty">아직 정하지 않았습니다.</p>}
    </section>
  )
}
