/**
 * EMR preview card — shows the composed workspace EMR text with a Copy
 * button (PR #24 Phase 9). Same UX pattern as the existing production EMR
 * panel in DoctorView.tsx (plain textarea, editable, explicit copy
 * button + feedback), kept as a separate preview surface rather than
 * replacing that panel (see emrPreview.ts's file header for why).
 */
import { useState } from 'react'

export function EmrPreviewCard({ text }: { text: string }) {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle')

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopyStatus('copied')
      setTimeout(() => setCopyStatus('idle'), 2000)
    } catch {
      setCopyStatus('error')
    }
  }

  return (
    <section className="workspace__emrPreview" aria-label="EMR 미리보기">
      <div className="workspace__emrPreview__head">
        <h4>EMR 미리보기</h4>
        <span className="workspace__emrPreview__badge">제안이 자동으로 확정 소견이 되지 않음</span>
      </div>
      <textarea className="workspace__emrPreview__text" readOnly rows={7} value={text} />
      <div className="workspace__emrPreview__actions">
        <button type="button" className="workspace__btn" onClick={handleCopy}>
          EMR용 복사
        </button>
        {copyStatus === 'copied' && <span className="workspace__copyFeedback">복사됨</span>}
        {copyStatus === 'error' && <span className="workspace__copyError">복사 실패 — 직접 선택해서 복사해주세요.</span>}
      </div>
    </section>
  )
}
