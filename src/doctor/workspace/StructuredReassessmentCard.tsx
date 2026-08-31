/**
 * Structured Reassessment (round 3 Phase E). Shows each recheck item's
 * PREVIOUS value as a plain read-only fact next to a fresh status-entry
 * control that always starts NOT_YET_CHECKED — the previous POSITIVE/
 * NEGATIVE is never pre-filled into today's result.
 */
import { useId } from 'react'
import {
  EXAM_CHECK_STATUS_GLYPH,
  EXAM_CHECK_STATUS_LABEL,
  LATERALITY_LABEL,
  PROVENANCE_BADGE,
  isValidExamStatus,
  isValidLaterality,
  type ExamCheckStatus,
  type Laterality,
} from './provenance'
import type { ReassessmentExamItem, StructuredReassessment } from './reassessmentExam'

const STATUS_OPTIONS: ExamCheckStatus[] = ['POSITIVE', 'NEGATIVE', 'UNCLEAR', 'NOT_YET_CHECKED']
const LATERALITY_OPTIONS: Laterality[] = ['LEFT', 'RIGHT', 'BILATERAL', 'NOT_APPLICABLE']

function ReassessmentItemCard({
  item,
  onChange,
}: {
  item: ReassessmentExamItem
  onChange: (next: ReassessmentExamItem) => void
}) {
  const noteId = useId()
  const pending = item.result.status === 'NOT_YET_CHECKED'

  return (
    <div className={`workspace__examCard${pending ? '' : ' workspace__examCard--done'}`}>
      <div className="workspace__examCard__head">
        <strong className="workspace__examCard__title">{item.title}</strong>
        <span className="workspace__provBadge" title="원장이 이전에 기록한 소견 — 오늘 결과 아님">
          {PROVENANCE_BADGE[item.source]}
        </span>
      </div>

      {item.previous && (
        <p className="workspace__examCard__reason">
          {/*
           * 15차 독립 리뷰 MEDIUM-2: sanitizeShape는 previous.status/laterality가
           * 문자열이라는 것만 보장할 뿐 알려진 enum 값인지는 보장하지 않는다 --
           * 손상된 값이 EXAM_CHECK_STATUS_LABEL/LATERALITY_LABEL 조회에서
           * undefined가 되어 원장 화면에 리터럴 "undefined"로 그대로 노출됐다.
           */}
          이전 소견: {isValidExamStatus(item.previous.status) ? EXAM_CHECK_STATUS_LABEL[item.previous.status] : '확인 필요(값 형식 오류)'}
          {item.previous.laterality && item.previous.laterality !== 'NOT_APPLICABLE'
            ? ` (${isValidLaterality(item.previous.laterality) ? LATERALITY_LABEL[item.previous.laterality] : '확인 필요(값 형식 오류)'})`
            : ''}
          {item.previous.note.trim() ? ` — ${item.previous.note.trim()}` : ''}
        </p>
      )}

      <div className="workspace__examCard__statusRow" role="group" aria-label={`${item.title} 오늘 결과`}>
        {STATUS_OPTIONS.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={item.result.status === s}
            className={`workspace__statusBtn${item.result.status === s ? ' workspace__statusBtn--active' : ''}`}
            onClick={() =>
              onChange({
                ...item,
                result: { ...item.result, status: s, recordedAt: s === 'NOT_YET_CHECKED' ? null : new Date().toISOString() },
              })
            }
          >
            <span aria-hidden="true">{EXAM_CHECK_STATUS_GLYPH[s]}</span> {EXAM_CHECK_STATUS_LABEL[s]}
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
        </div>
      )}
    </div>
  )
}

export function StructuredReassessmentCard({
  value,
  onChange,
  title,
}: {
  value: StructuredReassessment
  onChange: (next: StructuredReassessment) => void
  title: string
}) {
  const pendingCount = value.items.filter((i) => i.result.status === 'NOT_YET_CHECKED').length

  return (
    <section className="workspace__block" aria-label={title}>
      <h3>{title}</h3>
      {value.items.length === 0 ? (
        <p className="workspace__empty">아직 재검 항목으로 추가된 것이 없습니다.</p>
      ) : (
        <>
          {pendingCount > 0 && (
            <p className="workspace__pendingCounter" role="status">
              오늘 확인 필요 · {pendingCount}건
            </p>
          )}
          {value.items.map((item) => (
            <ReassessmentItemCard
              key={item.id}
              item={item}
              onChange={(next) => onChange({ ...value, items: value.items.map((i) => (i.id === next.id ? next : i)) })}
            />
          ))}
        </>
      )}
      <label className="workspace__finalAssessment__field">
        <span>최종 재평가</span>
        <textarea
          rows={2}
          value={value.finalReassessmentNote}
          placeholder="원장이 직접 입력 — 치료 반응 요약"
          onChange={(e) => onChange({ ...value, finalReassessmentNote: e.target.value, recordedAt: new Date().toISOString() })}
        />
      </label>
    </section>
  )
}
