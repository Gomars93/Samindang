/**
 * Patient-facing Care Plan preview card (round 3 Phase A/J). Same
 * copy/feedback UX as EmrPreviewCard.tsx. Print opens a small isolated
 * popup window containing ONLY this plain text (never the main app DOM,
 * so the existing app has no print stylesheet to maintain and nothing
 * else on screen can ever leak into a printed page).
 */
import { useState } from 'react'

function openPrintPopup(title: string, text: string) {
  const win = window.open('', '_blank', 'width=480,height=640')
  if (!win) return false
  const escaped = text
    .split('\r\n')
    .map((line) => line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'))
    .join('<br/>')
  win.document.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>` +
      '<style>body{font-family:-apple-system,sans-serif;white-space:pre-wrap;line-height:1.6;padding:24px;font-size:14px}</style>' +
      `</head><body>${escaped}</body></html>`,
  )
  win.document.close()
  win.focus()
  win.print()
  return true
}

export function PatientCarePlanPreviewCard({ title, text }: { title: string; text: string }) {
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

  function handlePrint() {
    openPrintPopup(title, text)
  }

  return (
    <section className="workspace__patientPreview" aria-label={title}>
      <div className="workspace__patientPreview__head">
        <h4>{title}</h4>
        <span className="workspace__patientPreview__badge">환자 전달용 — 내부 판단 근거 미포함</span>
      </div>
      <textarea className="workspace__patientPreview__text" readOnly rows={7} value={text} />
      <div className="workspace__patientPreview__actions">
        <button type="button" className="workspace__btn" onClick={handleCopy}>
          복사
        </button>
        <button type="button" className="workspace__btn" onClick={handlePrint}>
          인쇄
        </button>
        {copyStatus === 'copied' && <span className="workspace__copyFeedback">복사됨</span>}
        {copyStatus === 'error' && <span className="workspace__copyError">복사 실패 — 직접 선택해서 복사해주세요.</span>}
      </div>
    </section>
  )
}
