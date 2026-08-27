/**
 * "오늘 반드시 확인" checklist — follow-up questions, tongue, pulse,
 * abdomen, other clinician-only observations (PR #24 Phase 4.3/6).
 */
import {
  CLINICIAN_OBSERVATION_CATEGORY_LABEL,
  countStillNeedsCheck,
  type ClinicianObservationItem,
} from './clinicianObservation'

export function ClinicianObservationChecklist({
  items,
  onChangeItem,
}: {
  items: ClinicianObservationItem[]
  onChangeItem: (next: ClinicianObservationItem) => void
}) {
  if (items.length === 0) {
    return <p className="workspace__empty">오늘 확인할 항목이 없습니다.</p>
  }
  const remaining = countStillNeedsCheck(items)

  return (
    <div className="workspace__observationChecklist">
      <p className="workspace__pendingCounter" role="status">
        확인 필요 {remaining}건 / 전체 {items.length}건
      </p>
      {items.map((item) => (
        <div key={item.id} className="workspace__observationRow">
          <span className="workspace__observationCategory">
            {CLINICIAN_OBSERVATION_CATEGORY_LABEL[item.category]}
          </span>
          <span className="workspace__observationTitle">{item.title}</span>
          <input
            type="text"
            className="workspace__noteInput"
            value={item.value}
            placeholder="소견 입력"
            aria-label={`${item.title} 소견`}
            onChange={(e) => {
              const value = e.target.value
              onChangeItem({
                ...item,
                value,
                checked: value.trim() !== '',
                recordedAt: value.trim() !== '' ? new Date().toISOString() : null,
              })
            }}
          />
          <span
            className={`workspace__checkBadge${item.checked ? ' workspace__checkBadge--done' : ''}`}
            aria-hidden="true"
          >
            {item.checked ? '확인됨' : '미확인'}
          </span>
        </div>
      ))}
    </div>
  )
}
