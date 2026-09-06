/**
 * Patient-facing Care Plan preview card (round 3 Phase A/J). Same
 * copy/feedback UX as EmrPreviewCard.tsx. Print opens a small isolated
 * popup window containing ONLY this plain text (never the main app DOM,
 * so the existing app has no print stylesheet to maintain and nothing
 * else on screen can ever leak into a printed page).
 */
import { useState } from 'react'
import { buildCarePlanMessageText } from './patientCarePlanPreview'

/**
 * 플로우 정렬 4/5 (환자 치료 계획 링크): the card's optional third action.
 * The handler is supplied ONLY in server mode with a real submission id
 * (DoctorView.tsx); fixtures/preview mode passes nothing and the button is
 * simply absent -- the same "no persistence without a record" rule the rest
 * of the workspace follows. The handler receives the EXACT text on screen,
 * so what the patient opens is what the doctor read, never a re-derivation.
 */
export type IssueCarePlanLinkResult = { ok: true; link: string; expiresAt: string } | { ok: false; error: string }
export type IssueCarePlanLink = (text: string) => Promise<IssueCarePlanLinkResult>

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

export function PatientCarePlanPreviewCard({
  title,
  text,
  onIssueLink,
}: {
  title: string
  text: string
  onIssueLink?: IssueCarePlanLink
}) {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle')
  const [issueState, setIssueState] = useState<
    { phase: 'idle' } | { phase: 'pending' } | { phase: 'issued'; link: string; expiresAt: string } | { phase: 'error'; error: string }
  >({ phase: 'idle' })
  const [messageCopyStatus, setMessageCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle')
  const canIssue = Boolean(onIssueLink) && text.trim() !== '' && issueState.phase !== 'pending'

  async function handleIssueLink() {
    if (!onIssueLink || !canIssue) return
    setIssueState({ phase: 'pending' })
    setMessageCopyStatus('idle')
    const result = await onIssueLink(text)
    if (!result.ok) {
      setIssueState({ phase: 'error', error: result.error })
      return
    }
    setIssueState({ phase: 'issued', link: result.link, expiresAt: result.expiresAt })
  }

  async function handleCopyMessage(message: string) {
    try {
      await navigator.clipboard.writeText(message)
      setMessageCopyStatus('copied')
      setTimeout(() => setMessageCopyStatus('idle'), 2000)
    } catch {
      setMessageCopyStatus('error')
    }
  }

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
        {onIssueLink && (
          <button type="button" className="workspace__btn" onClick={handleIssueLink} disabled={!canIssue}>
            {issueState.phase === 'pending' ? '링크 만드는 중…' : '환자 링크 만들기'}
          </button>
        )}
      </div>
      {issueState.phase === 'error' && (
        <p className="workspace__copyError" role="alert">
          {`링크를 만들지 못했습니다 — ${issueState.error}`}
        </p>
      )}
      {issueState.phase === 'issued' &&
        (() => {
          const message = buildCarePlanMessageText(issueState.link)
          return (
            <div className="workspace__carePlanLink">
              <p className="workspace__carePlanLink__hint">
                아래 문자 내용을 복사해 환자에게 보내세요. 링크를 여는 사람은 위 치료 계획 본문만 보게 됩니다 (14일간 열람,
                다시 만들면 이전 링크는 즉시 무효).
              </p>
              <textarea className="workspace__patientPreview__text" readOnly rows={4} value={message} aria-label="환자 문자 내용" />
              <div className="workspace__patientPreview__actions">
                <button type="button" className="workspace__btn" onClick={() => handleCopyMessage(message)}>
                  문자 내용 복사
                </button>
                {messageCopyStatus === 'copied' && <span className="workspace__copyFeedback">복사됨</span>}
                {messageCopyStatus === 'error' && <span className="workspace__copyError">복사 실패 — 직접 선택해서 복사해주세요.</span>}
              </div>
            </div>
          )
        })()}
    </section>
  )
}
