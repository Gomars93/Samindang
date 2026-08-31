/**
 * Doctor View 재설계 v0.2 §11.5 — EMR 요약 시트.
 *
 * 레일에는 "EMR 요약 열기" 버튼 + 상태 dot만 남기고(DoctorView.tsx), 실제
 * transcript 펼치기·textarea 편집·복사·재생성은 전부 이 시트(데스크톱 우측
 * 슬라이드 560px, overlay)로 옮긴다 — 기존 기능 계약은 그대로다.
 *
 * 자동 덮어쓰기 금지(§11.5): 사용자가 textarea를 한 번이라도 편집했으면 새
 * recording_id가 도착해도 자동으로 텍스트를 바꾸지 않는다 — 대신
 * `pendingNewSummary`가 true가 되어 상단 amber 스트립으로 선택지를 준다.
 * 이 편집/보류 상태 자체는 DoctorView가 들고 있다(시트는 상태를 소유하지
 * 않는 순수 표시 컴포넌트).
 */
import type { RecorderResult } from '../lib/serverClient'

export function EmrSheet({
  open,
  onClose,
  recorderResults,
  recorderResultsError,
  recorderUpdatedLabel,
  emrText,
  onEmrTextChange,
  onCopy,
  onRebuild,
  copyStatus,
  pendingNewSummary,
  onKeepMine,
  onReplaceWithNew,
}: {
  open: boolean
  onClose: () => void
  recorderResults: RecorderResult[] | null
  recorderResultsError: string | null
  /** "최신 갱신: N분 전" 같은, 이미 계산된 상대시간 라벨. relativeTime 계산을 이 컴포넌트에서 새로 하지 않는다. */
  recorderUpdatedLabel: string | null
  emrText: string
  onEmrTextChange: (next: string) => void
  onCopy: () => void
  onRebuild: () => void
  copyStatus: 'idle' | 'copied' | 'error'
  /** 편집 중 새 recording_id가 도착해 자동 교체를 보류한 상태인지. */
  pendingNewSummary: boolean
  onKeepMine: () => void
  onReplaceWithNew: () => void
}) {
  if (!open) return null

  return (
    <div className="doctor__emrSheetOverlay" role="presentation" onClick={onClose}>
      <aside className="doctor__emrSheet" role="dialog" aria-label="EMR 요약" onClick={(e) => e.stopPropagation()}>
        <div className="doctor__emrSheet__header">
          <h2>EMR 요약</h2>
          <button type="button" className="doctor__emrSheet__close" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>

        {pendingNewSummary && (
          <div className="doctor__emrSheet__pending">
            <p>
              새 요약 도착 — 편집 중인 내용이 있어 자동으로 바꾸지 않았습니다.
            </p>
            <div className="doctor__emrSheet__pendingActions">
              <button type="button" className="judgment__recordBtn" onClick={onKeepMine}>
                내 편집 유지
              </button>
              <button type="button" className="judgment__recordBtn" onClick={onReplaceWithNew}>
                새 요약으로 교체
              </button>
            </div>
          </div>
        )}

        {recorderResultsError ? (
          <p className="doctor__warning">녹취 결과를 불러오지 못했습니다: {recorderResultsError}</p>
        ) : !recorderResults || recorderResults.length === 0 ? (
          <p className="doctor__empty">아직 결과 없음</p>
        ) : (
          <>
            <p className="doctor__derivedLabel">
              결과 있음 — 녹음 {recorderResults.length}건{recorderUpdatedLabel ? ` (최신 갱신: ${recorderUpdatedLabel})` : ''}
            </p>
            {recorderResults.length > 1 && (
              <ul className="doctor__recorderLineage">
                {recorderResults.map((res) => (
                  <li key={res.recording_id}>{res.recording_id}</li>
                ))}
              </ul>
            )}
            <details className="doctor__secDetails">
              <summary>Transcript 원문</summary>
              <pre className="doctor__recorderTranscript">{recorderResults[0].transcript ?? '(없음)'}</pre>
            </details>
            <div className="judgment__field doctor__recorderEmrField">
              <label className="judgment__label" htmlFor="emrSummaryText">
                EMR용 요약 (plain text, 직접 수정 가능)
              </label>
              <textarea
                id="emrSummaryText"
                className="judgment__textarea"
                rows={14}
                value={emrText}
                onChange={(e) => onEmrTextChange(e.target.value)}
              />
            </div>
            <div className="judgment__actions">
              <button type="button" className="judgment__recordBtn" onClick={onCopy}>
                EMR용 복사
              </button>
              <button type="button" className="judgment__recordBtn" onClick={onRebuild}>
                요약 다시 만들기
              </button>
              {copyStatus === 'copied' && <span className="doctor__recorderCopyFeedback">복사됨</span>}
              {copyStatus === 'error' && (
                <span className="doctor__warning">복사 실패 — 직접 선택해서 복사해주세요.</span>
              )}
            </div>
          </>
        )}
      </aside>
    </div>
  )
}
