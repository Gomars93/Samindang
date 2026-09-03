/**
 * Single PhysicalExamSuggestion card: reason, priority, and the clinician
 * result-entry controls (PR #24 Phase 3.2/3.3/6). Rapid point-of-care entry:
 * status buttons, optional laterality, optional short note. Entering a
 * result is the only thing that moves an item out of "아직 확인 안 됨" —
 * nothing here infers a result from patient answers.
 */
import { useId, useState } from 'react'
import {
  EXAM_CHECK_STATUS_GLYPH,
  EXAM_CHECK_STATUS_LABEL,
  // Batch 2.5b: 상태 옵션 목록을 이 파일에서 손으로 들지 않는다 --
  // provenance.ts의 단일 정의를 쓴다(부분집합이 타입을 통과해 신규 상태가
  // 조용히 화면에서 누락되던 문제. 그 파일의 주석 참고).
  EXAM_CHECK_STATUS_OPTIONS,
  LATERALITY_LABEL,
  PROVENANCE_BADGE,
  type Laterality,
} from './provenance'
import { EXAM_PRIORITY_LABEL, type PhysicalExamSuggestion } from './examSuggestion'

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
  const helpId = useId()
  const [helpOpen, setHelpOpen] = useState(false)
  const pending = item.result.status === 'NOT_YET_CHECKED'

  /*
   * Round 13 (input compression): recording a result used to open a row
   * containing laterality buttons AND an always-visible free-text box, so
   * the card read as a form waiting to be filled even when the clinician
   * had already said everything they meant to. The status buttons alone
   * are a complete record; laterality and the note are optional detail.
   *
   * They now sit behind an explicit 상세·메모 toggle -- but the toggle
   * starts OPEN whenever either already holds content, so nothing a
   * clinician previously entered is hidden from them.
   *
   * Deliberately NOT done here: the round-13 review suggested relabelling
   * the actions 확인 / 특이없음. Those are not synonyms for the approved
   * result semantics -- POSITIVE is 양성/이상 소견 and NEGATIVE is
   * 음성/정상 -- and renaming them would change what the clinician is
   * asserting, which is a clinical reinterpretation this round forbids.
   * The compression here is purely about how much UI the default shows.
   */
  const hasDetail = item.result.note.trim() !== '' || item.result.laterality !== 'NOT_APPLICABLE'
  const [detailOpen, setDetailOpen] = useState(hasDetail)
  /*
   * LBP v1 Batch 2.5b (CD-2.5b-2, 권고안 PO 승인): "시행 못 함"은 사유 없이
   * 기록되면 다음 방문에서 다시 시도해야 하는지 판단할 수 없다. 그렇다고
   * 메모를 필수로 만들면 빠른 point-of-care 입력이라는 이 카드의 전제가
   * 깨진다 -- 대신 이 상태에서만 상세·메모를 자동으로 펼쳐 사유 기록을
   * 유도하고, 비워둔 채 저장하는 것도 그대로 허용한다. 파생값이므로
   * effect가 없고, 다른 상태로 바꾸면 자동 펼침도 함께 사라진다(그때
   * 이미 입력한 내용이 있으면 hasDetail이 계속 펼친 상태를 유지한다).
   */
  const showDetail = detailOpen || hasDetail || item.result.status === 'NOT_PERFORMED'

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
        {item.help && (
          <button
            type="button"
            className="workspace__helpToggle"
            aria-expanded={helpOpen}
            aria-controls={helpId}
            aria-label={`${item.title} 도움말`}
            title={`어떻게: ${item.help.howKo}\n왜: ${item.help.whyKo}`}
            onClick={() => setHelpOpen((o) => !o)}
          >
            <span aria-hidden="true">ⓘ</span>
          </button>
        )}
        <span className="workspace__provBadge" title="시스템 결정지원 제안 — 확정 소견 아님">
          {PROVENANCE_BADGE[item.source]}
        </span>
      </div>

      {item.help && helpOpen && (
        <div id={helpId} className="workspace__examCard__help">
          <p>어떻게: {item.help.howKo}</p>
          <p>왜: {item.help.whyKo}</p>
        </div>
      )}

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
        {EXAM_CHECK_STATUS_OPTIONS.map((s) => (
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
            <span aria-hidden="true">{EXAM_CHECK_STATUS_GLYPH[s]}</span> {EXAM_CHECK_STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      {!pending && !showDetail && (
        <div className="workspace__examCard__detailToggleRow">
          <button
            type="button"
            className="workspace__detailToggle"
            onClick={() => setDetailOpen(true)}
          >
            상세·메모 추가
          </button>
          {onAddToReassessment && (
            <button type="button" className="workspace__adoptBtn" onClick={onAddToReassessment}>
              재검 항목으로 추가 →
            </button>
          )}
        </div>
      )}

      {!pending && showDetail && (
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
