/**
 * "오늘 반드시 확인" checklist — follow-up questions, tongue, pulse,
 * abdomen, other clinician-only observations (PR #24 Phase 4.3/6).
 *
 * Round 13 (tap-first entry): every row used to be a permanently open
 * free-text box, so four empty inputs sat in the default clinical view
 * demanding typing before anything could be marked done. The common case
 * — "I looked, nothing notable" — is now a single tap, and the free-text
 * box appears only when the clinician asks for it with 메모.
 *
 * Two boundaries this deliberately keeps:
 *  - The 특이없음 button writes exactly the string on its label. Nothing
 *    is inferred, scored, or reworded, and no result is ever recorded
 *    without an explicit clinician tap.
 *  - A row that already holds free text opens its note box on render, so
 *    a compressed default never hides something a clinician wrote.
 *
 * Round 14 goes one step further: when NOTHING has been observed yet, the
 * whole list collapses to one summary line plus a 빠른 입력 action. See
 * the comment on the collapse below for why that is safe.
 */
import { useState } from 'react'
import {
  CLINICIAN_OBSERVATION_CATEGORY_LABEL,
  countStillNeedsCheck,
  type ClinicianObservationItem,
} from './clinicianObservation'

/**
 * The one canned value in this file. It is stored verbatim as the
 * clinician's own wording — button label and recorded text are the same
 * string, so the record can never say more than the tap asserted.
 *
 * Deliberately NOT paired with a separate 확인 ("checked") button: a row
 * marked done with no finding at all is not a record, and the
 * "확인 필요 N건" counter above already tracks what is still outstanding.
 */
const NO_FINDING_VALUE = '특이없음'

function ObservationRow({
  item,
  onChangeItem,
  onAddToReassessment,
}: {
  item: ClinicianObservationItem
  onChangeItem: (next: ClinicianObservationItem) => void
  onAddToReassessment?: (item: ClinicianObservationItem) => void
}) {
  const trimmed = item.value.trim()
  const isNoFinding = trimmed === NO_FINDING_VALUE
  const hasFreeText = trimmed !== '' && !isNoFinding
  const [noteOpen, setNoteOpen] = useState(hasFreeText)
  const showNote = noteOpen || hasFreeText

  const record = (value: string) =>
    onChangeItem({
      ...item,
      value,
      checked: value.trim() !== '',
      recordedAt: value.trim() !== '' ? new Date().toISOString() : null,
    })

  return (
    <div className="workspace__observationRow">
      <span className="workspace__observationCategory">
        {CLINICIAN_OBSERVATION_CATEGORY_LABEL[item.category]}
      </span>
      <span className="workspace__observationTitle">{item.title}</span>

      <div className="workspace__observationRow__actions">
        <button
          type="button"
          aria-pressed={isNoFinding}
          className={`workspace__statusBtn${isNoFinding ? ' workspace__statusBtn--active' : ''}`}
          onClick={() => record(isNoFinding ? '' : NO_FINDING_VALUE)}
        >
          {NO_FINDING_VALUE}
        </button>
        {!showNote && (
          <button
            type="button"
            className="workspace__detailToggle"
            onClick={() => setNoteOpen(true)}
          >
            메모
          </button>
        )}
        {showNote && (
          <input
            type="text"
            className="workspace__noteInput"
            value={item.value}
            placeholder="소견 입력"
            aria-label={`${item.title} 소견`}
            onChange={(e) => record(e.target.value)}
          />
        )}
      </div>

      <span
        className={`workspace__checkBadge${item.checked ? ' workspace__checkBadge--done' : ''}`}
        aria-hidden="true"
      >
        {item.checked ? '확인됨' : '미확인'}
      </span>
      {onAddToReassessment && item.checked && (
        <button
          type="button"
          className="workspace__adoptBtn workspace__observationRow__adopt"
          onClick={() => onAddToReassessment(item)}
        >
          재검 항목으로 추가 →
        </button>
      )}
    </div>
  )
}

export function ClinicianObservationChecklist({
  items,
  onChangeItem,
  onAddToReassessment,
}: {
  items: ClinicianObservationItem[]
  onChangeItem: (next: ClinicianObservationItem) => void
  /** Round 3 Phase E: optional per-item "재검 항목으로 추가" promotion into Structured Reassessment. */
  onAddToReassessment?: (item: ClinicianObservationItem) => void
}) {
  const remaining = countStillNeedsCheck(items)
  /*
   * Round 14: on a record where nothing has been observed yet, four full
   * rows of controls said one thing -- "none of these are done" -- using a
   * card's worth of the default clinical view. That single fact now reads
   * as a single line, and the rows arrive on an explicit 빠른 입력.
   *
   * The moment ANY row holds a recorded observation the full checklist is
   * shown unconditionally, so a compressed default can never hide what a
   * clinician entered. Expansion is one-way within a render: once opened,
   * clearing the last value does not snap the rows shut under the hands of
   * whoever is typing.
   */
  const nothingRecorded = items.length > 0 && remaining === items.length
  const [expanded, setExpanded] = useState(false)
  const showRows = !nothingRecorded || expanded

  if (items.length === 0) {
    return <p className="workspace__empty">오늘 확인할 항목이 없습니다.</p>
  }

  if (!showRows) {
    return (
      <div className="workspace__observationChecklist workspace__observationChecklist--collapsed">
        <p className="workspace__observationSummary" role="status">
          {`${items.map((i) => CLINICIAN_OBSERVATION_CATEGORY_LABEL[i.category]).join(' · ')} — ${remaining}건 미확인`}
        </p>
        <button
          type="button"
          className="workspace__detailToggle workspace__observationSummary__open"
          onClick={() => setExpanded(true)}
        >
          빠른 입력
        </button>
      </div>
    )
  }

  return (
    <div className="workspace__observationChecklist">
      <p className="workspace__pendingCounter" role="status">
        확인 필요 {remaining}건 / 전체 {items.length}건
      </p>
      {items.map((item) => (
        <ObservationRow
          key={item.id}
          item={item}
          onChangeItem={onChangeItem}
          onAddToReassessment={onAddToReassessment}
        />
      ))}
    </div>
  )
}
