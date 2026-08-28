/**
 * Single PhysicalExamSuggestion card: reason, priority, and the clinician
 * result-entry controls (PR #24 Phase 3.2/3.3/6). Rapid point-of-care entry:
 * status buttons, optional laterality, optional short note. Entering a
 * result is the only thing that moves an item out of "아직 확인 안 됨" —
 * nothing here infers a result from patient answers.
 */
import { useId } from 'react'
import {
  EXAM_CHECK_STATUS_LABEL,
  LATERALITY_LABEL,
  PROVENANCE_BADGE,
  type ExamCheckStatus,
  type Laterality,
} from './provenance'
import { EXAM_PRIORITY_LABEL, type PhysicalExamSuggestion } from './examSuggestion'

const STATUS_OPTIONS: ExamCheckStatus[] = ['POSITIVE', 'NEGATIVE', 'UNCLEAR', 'NOT_YET_CHECKED']
const LATERALITY_OPTIONS: Laterality[] = ['LEFT', 'RIGHT', 'BILATERAL', 'NOT_APPLICABLE']

export function ExamSuggestionCard({
  item,
  onChange,
  onAddToReassessment,
}: {
  item: PhysicalExamSuggestion
  onChange: (next: PhysicalExamSuggestion) => void
  /**
   * Round 3 Phase E: once this item has a real recorded result, the
   * clinician may explicitly promote it into the Structured Reassessment
   * list ("재검 항목으로 추가"). Never automatic -- shown only when a
   * result already exists, and never fires on its own.
   */
  onAddToReassessment?: () => void
}) {
  const noteId = useId()
  const pending = item.result.status === 'NOT_YET_CHECKED'

  return (
    <div
      className={`workspace__examCard${pending ? '' : ' workspace__examCard--done'}`}
      data-priority={item.priority}
    >
      <div className="workspace__examCard__head">
        <span className={`workspace__priorityChip workspace__priorityChip--${item.priority.toLowerCase()}`}>
          {EXAM_PRIORITY_LABEL[item.priority]}
        </span>
        <strong className="workspace__examCard__title">{item.title}</strong>
        <span className="workspace__provBadge" title="시스템 결정지원 제안 — 확정 소견 아님">
          {PROVENANCE_BADGE[item.source]}
        </span>
      </div>

      {item.reasonFacts.length > 0 && (
        <p className="workspace__examCard__reason">
          왜 확인?{' '}
          {item.reasonFacts.map((f, i) => (
            <span key={i}>
              {i > 0 && ' · '}
              {f.text}
            </span>
          ))}
        </p>
      )}

      <div className="workspace__examCard__statusRow" role="group" aria-label={`${item.title} 결과`}>
        {STATUS_OPTIONS.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={item.result.status === s}
            className={`workspace__statusBtn${item.result.status === s ? ' workspace__statusBtn--active' : ''}`}
            onClick={() =>
              onChange({
                ...item,
                result: {
                  ...item.result,
                  status: s,
                  recordedAt: s === 'NOT_YET_CHECKED' ? null : new Date().toISOString(),
                },
              })
            }
          >
            {EXAM_CHECK_STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      {!pending && (
        <div className="workspace__examCard__detailRow">
          <div className="workspace__lateralityRow" role="group" aria-label={`${item.title} 좌우`}>
            {LATERALITY_OPTIONS.map((l) => (
              <button
                key={l}
                type="button"
                aria-pressed={item.result.laterality === l}
                className={`workspace__lateralityBtn${item.result.laterality === l ? ' workspace__lateralityBtn--active' : ''}`}
                onClick={() => onChange({ ...item, result: { ...item.result, laterality: l } })}
              >
                {LATERALITY_LABEL[l]}
              </button>
            ))}
          </div>
          <label className="workspace__noteLabel" htmlFor={noteId}>
            메모(선택)
          </label>
          <input
            id={noteId}
            type="text"
            className="workspace__noteInput"
            value={item.result.note}
            onChange={(e) => onChange({ ...item, result: { ...item.result, note: e.target.value } })}
            placeholder="짧은 소견 메모"
          />
          {onAddToReassessment && (
            <button type="button" className="workspace__adoptBtn" onClick={onAddToReassessment}>
              재검 항목으로 추가 →
            </button>
          )}
        </div>
      )}
    </div>
  )
}
