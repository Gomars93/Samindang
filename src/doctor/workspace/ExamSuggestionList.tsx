/**
 * "지금 확인할 것" — groups PhysicalExamSuggestions into 반드시 확인 /
 * 문진에 따라 추가 확인 / 아직 확인 안 됨 (PR #24 Phase 3.2).
 */
import { ExamSuggestionCard } from './ExamSuggestionCard'
import { groupExamSuggestions, type PhysicalExamSuggestion } from './examSuggestion'

export function ExamSuggestionList({
  items,
  onChangeItem,
  onAddToReassessment,
}: {
  items: PhysicalExamSuggestion[]
  onChangeItem: (next: PhysicalExamSuggestion) => void
  /** Round 3 Phase E: optional per-item "재검 항목으로 추가" promotion into Structured Reassessment. */
  onAddToReassessment?: (item: PhysicalExamSuggestion) => void
}) {
  if (items.length === 0) {
    return <p className="workspace__empty">이번 방문에 제안된 확인 항목이 없습니다.</p>
  }

  const { mustCheck, contextual, stillPending } = groupExamSuggestions(items)

  return (
    <div className="workspace__examSuggestions">
      {stillPending.length > 0 && (
        <p className="workspace__pendingCounter" role="status">
          아직 확인 안 됨 · {stillPending.length}건 — {stillPending.map((i) => i.title).join(', ')}
        </p>
      )}

      {mustCheck.length > 0 && (
        <div className="workspace__examGroup">
          <h4>반드시 확인</h4>
          {mustCheck.map((item) => (
            <ExamSuggestionCard
              key={item.id}
              item={item}
              onChange={onChangeItem}
              onAddToReassessment={onAddToReassessment ? () => onAddToReassessment(item) : undefined}
            />
          ))}
        </div>
      )}

      {contextual.length > 0 && (
        <div className="workspace__examGroup">
          <h4>문진에 따라 추가 확인</h4>
          {contextual.map((item) => (
            <ExamSuggestionCard
              key={item.id}
              item={item}
              onChange={onChangeItem}
              onAddToReassessment={onAddToReassessment ? () => onAddToReassessment(item) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  )
}
