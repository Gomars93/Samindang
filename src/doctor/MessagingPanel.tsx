/**
 * Quick Revisit outbound messaging panel. Mounted right
 * where DoctorView already shows the freshly-issued follow-up link
 * (`issuedSession`) for PERSONAL_QR/STAFF_ASSISTED/PREVISIT_LINK delivery
 * modes -- this is the automation PREVISIT_LINK's own hint text used to
 * point at as "not yet connected" (see DoctorView.tsx's PREVISIT_LINK
 * hint). CLINIC_TABLET is deliberately excluded (the tablet delivers the
 * link itself, there is no phone number involved in that flow at all).
 *
 * `link` is the SAME one-time follow-up URL DoctorView.tsx's own
 * patientFollowUpLink() already builds for the copy-link/QR paths --
 * passed down as a prop rather than rebuilt here so there is exactly one
 * place that knows the URL shape. The server builds the actual message
 * TEXT from it (server/index.js's buildRevisitMessageText) and never
 * persists either the link or the text, for the same reason it never
 * persists the phone number below.
 *
 * Privacy: this server never stores a patient's full phone number
 * anywhere (see server/index.js's messagingContactCache comment and
 * patientIdentityStore.js's identity policy) -- the clinician/staff member
 * confirms it fresh from the clinic's own EMR (Sigma) each time they send
 * or retry. The typed value lives only in this component's own React
 * state for the lifetime of this screen; it is never written to
 * localStorage/sessionStorage and is reset whenever `visitId` changes
 * (switching patients) or discarded the moment the component unmounts
 * (e.g. navigating back to the submissions list).
 *
 * Deliberately NOT built here (matches the scaffold's own documented
 * scope): live BizM credential entry, template management, or delivery
 * analytics -- this panel only exercises the mock transport today (see
 * server/bizmAdapter.js's resolveBizmProviderState) until real credentials
 * exist (EXTERNAL CREDENTIAL PENDING).
 */
import { useEffect, useState } from 'react'
import { queueRevisitMessage, listVisitMessages, retryRevisitMessage, cancelRevisitMessage } from '../lib/serverClient'
import type { MessageRecord } from '../messaging/types'

export type MessagingPanelProps = {
  visitId: string
  patientId: string
  followUpToken: string
  link: string
}

const STATUS_LABEL: Record<MessageRecord['status'], string> = {
  QUEUED: '발송 대기',
  SENDING: '발송 중',
  SENT: '발송됨',
  DELIVERED: '수신 확인됨',
  FAILED: '발송 실패',
  CANCELLED: '취소됨',
}

const CHANNEL_LABEL: Record<MessageRecord['channel'], string> = {
  KAKAO_ALIMTALK: '카카오 알림톡',
  SMS: 'SMS',
  LMS: 'LMS',
}

/**
 * 18차 독립 리뷰 MEDIUM-5: round 17이 DELIVERY_MODE_LABEL에 적용한 것과
 * 동일한 가드 -- `m.channel`/`m.fallback_channel`/`m.status`는 서버가
 * 검증 없이 그대로 돌려주는 값이므로, 알려지지 않은 값이 template
 * literal(` → ${...}`)에 들어가면 리터럴 "undefined"를 그대로 노출한다
 * (governing task 정책 5 위반).
 */
function channelLabelOrFallback(channel: unknown): string {
  return typeof channel === 'string' && Object.prototype.hasOwnProperty.call(CHANNEL_LABEL, channel)
    ? CHANNEL_LABEL[channel as MessageRecord['channel']]
    : '확인 필요'
}
function statusLabelOrFallback(status: unknown): string {
  return typeof status === 'string' && Object.prototype.hasOwnProperty.call(STATUS_LABEL, status)
    ? STATUS_LABEL[status as MessageRecord['status']]
    : '확인 필요'
}

export function MessagingPanel({ visitId, patientId, followUpToken, link }: MessagingPanelProps) {
  const [phone, setPhone] = useState('')
  const [messages, setMessages] = useState<MessageRecord[] | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [pendingMessageId, setPendingMessageId] = useState<string | null>(null)

  // Reload whenever the visit changes (a different patient's revisit
  // session must never show a stale list -- or a stale typed-in phone
  // number -- from the previously-open one). Resetting `phone` here makes
  // that isolation explicit rather than relying solely on this component
  // happening to unmount when DoctorView clears issuedSession on switch.
  useEffect(() => {
    let cancelled = false
    setMessages(null)
    setListError(null)
    setPhone('')
    // 18차 독립 리뷰 MEDIUM-5: listVisitMessages()는 이제 `messages`가
    // 배열이 아니면 스스로 fail-closed로 반환하지만, 이 호출 자체에는
    // `.catch`가 없어 다른 예기치 않은 실패가 조용히 사라질 수 있었다.
    listVisitMessages(visitId)
      .then((result) => {
        if (cancelled) return
        if (result.ok) setMessages(result.data.messages)
        else setListError(result.error)
      })
      .catch(() => {
        if (!cancelled) setListError('메시지 목록을 불러오지 못했습니다.')
      })
    return () => {
      cancelled = true
    }
  }, [visitId])

  function upsertMessage(record: MessageRecord) {
    setMessages((prev) => {
      const list = prev ?? []
      const idx = list.findIndex((m) => m.message_id === record.message_id)
      if (idx === -1) return [...list, record]
      const next = [...list]
      next[idx] = record
      return next
    })
  }

  const trimmedPhone = phone.trim()

  function handleSend() {
    if (!trimmedPhone || sending) return
    setSending(true)
    setActionError(null)
    queueRevisitMessage(visitId, { patientId, phone: trimmedPhone, followUpToken, link })
      .then((result) => {
        if (result.ok) upsertMessage(result.data)
        else setActionError(result.error)
      })
      .catch(() => setActionError('발송 요청에 실패했습니다.'))
      .finally(() => setSending(false))
  }

  function handleRetry(messageId: string) {
    if (!trimmedPhone || pendingMessageId) return
    setPendingMessageId(messageId)
    setActionError(null)
    retryRevisitMessage(messageId, trimmedPhone, link)
      .then((result) => {
        if (result.ok) upsertMessage(result.data)
        else setActionError(result.error)
      })
      .catch(() => setActionError('재시도 요청에 실패했습니다.'))
      .finally(() => setPendingMessageId(null))
  }

  function handleCancel(messageId: string) {
    if (pendingMessageId) return
    setPendingMessageId(messageId)
    setActionError(null)
    cancelRevisitMessage(messageId)
      .then((result) => {
        if (result.ok) upsertMessage(result.data)
        else setActionError(result.error)
      })
      .catch(() => setActionError('취소 요청에 실패했습니다.'))
      .finally(() => setPendingMessageId(null))
  }

  return (
    <div className="doctor__revisitSession__messaging" role="group" aria-label="문자/알림톡 발송">
      <label className="doctorField__label" htmlFor="doctor-messaging-phone">
        받는 사람 전화번호 (원내 EMR에서 직접 확인해 입력 — 이 화면을 벗어나면 사라집니다)
      </label>
      <div className="doctor__revisitSession__actions">
        <input
          id="doctor-messaging-phone"
          type="tel"
          className="workspace__noteInput"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="01012345678"
          autoComplete="off"
        />
        <button type="button" className="judgment__recordBtn" onClick={handleSend} disabled={!trimmedPhone || sending}>
          {sending ? '발송 중…' : '카카오 알림톡 발송'}
        </button>
      </div>
      {actionError && <p className="doctor__revisitSession__error">{actionError}</p>}
      {listError && <p className="doctor__revisitSession__error">{listError}</p>}

      {messages && messages.length > 0 && (
        <ul className="doctor__revisitSession__messageList">
          {messages.map((m) => (
            <li key={m.message_id} className="doctor__revisitSession__messageRow">
              <span>
                {channelLabelOrFallback(m.channel)}
                {m.fallback_channel ? ` → ${channelLabelOrFallback(m.fallback_channel)} 대체 발송` : ''} —{' '}
                {statusLabelOrFallback(m.status)}
                {m.status === 'FAILED' || m.status === 'QUEUED' ? ` (${m.attempt_count}/${m.max_attempts}회 시도)` : ''}
                {/* error_code is already a sanitized machine-readable class
                    (never a raw provider response -- see MessageRecord's own
                    field doc), safe to show staff as-is. Surfacing it here
                    (previously silent) is what lets staff distinguish e.g. a
                    provider-side template/config problem
                    (provider_http_4xx/bizm_channel_unverified) from a
                    transient network issue worth just retrying. */}
                {m.status === 'FAILED' && m.error_code ? ` — 오류: ${m.error_code}` : ''}
              </span>
              {(m.status === 'FAILED' || m.status === 'QUEUED') && (
                <button
                  type="button"
                  className="judgment__recordBtn"
                  onClick={() => handleRetry(m.message_id)}
                  disabled={!trimmedPhone || pendingMessageId === m.message_id}
                >
                  {pendingMessageId === m.message_id ? '재시도 중…' : '재시도'}
                </button>
              )}
              {m.status === 'QUEUED' && (
                <button
                  type="button"
                  className="judgment__recordBtn"
                  onClick={() => handleCancel(m.message_id)}
                  disabled={pendingMessageId === m.message_id}
                >
                  취소
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
