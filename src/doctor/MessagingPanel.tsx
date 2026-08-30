/**
 * Quick Revisit outbound messaging panel (SOLAPI scaffold). Mounted right
 * where DoctorView already shows the freshly-issued follow-up link
 * (`issuedSession`) for PERSONAL_QR/STAFF_ASSISTED/PREVISIT_LINK delivery
 * modes -- this is the automation PREVISIT_LINK's own hint text used to
 * point at as "not yet connected" (see DoctorView.tsx's PREVISIT_LINK
 * hint). CLINIC_TABLET is deliberately excluded (the tablet delivers the
 * link itself, there is no phone number involved in that flow at all).
 *
 * Privacy: this server never stores a patient's full phone number
 * anywhere (see server/index.js's messagingPhoneCache comment and
 * patientIdentityStore.js's identity policy) -- the clinician/staff member
 * confirms it fresh from the clinic's own EMR (Sigma) each time they send
 * or retry. The typed value lives only in this component's own React
 * state for the lifetime of this screen; it is never written to
 * localStorage/sessionStorage and is discarded the moment the component
 * unmounts (e.g. navigating back to the submissions list).
 *
 * Deliberately NOT built here (matches the scaffold's own documented
 * scope): live SOLAPI credential entry, template management, or delivery
 * analytics -- this panel only exercises the mock transport today (see
 * server/solapiAdapter.js's SolapiProviderState) until real credentials
 * exist (EXTERNAL CREDENTIAL PENDING).
 */
import { useEffect, useState } from 'react'
import { queueRevisitMessage, listVisitMessages, retryRevisitMessage, cancelRevisitMessage } from '../lib/serverClient'
import type { MessageRecord } from '../messaging/types'

export type MessagingPanelProps = {
  visitId: string
  patientId: string
  followUpToken: string
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

export function MessagingPanel({ visitId, patientId, followUpToken }: MessagingPanelProps) {
  const [phone, setPhone] = useState('')
  const [messages, setMessages] = useState<MessageRecord[] | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [pendingMessageId, setPendingMessageId] = useState<string | null>(null)

  // Reload whenever the visit changes (a different patient's revisit
  // session must never show a stale list from the previously-open one).
  useEffect(() => {
    let cancelled = false
    setMessages(null)
    setListError(null)
    listVisitMessages(visitId).then((result) => {
      if (cancelled) return
      if (result.ok) setMessages(result.data.messages)
      else setListError(result.error)
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
    queueRevisitMessage(visitId, { patientId, phone: trimmedPhone, followUpToken })
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
    retryRevisitMessage(messageId, trimmedPhone)
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
          {sending ? '발송 중…' : '카카오 알림톡/SMS 발송'}
        </button>
      </div>
      {actionError && <p className="doctor__revisitSession__error">{actionError}</p>}
      {listError && <p className="doctor__revisitSession__error">{listError}</p>}

      {messages && messages.length > 0 && (
        <ul className="doctor__revisitSession__messageList">
          {messages.map((m) => (
            <li key={m.message_id} className="doctor__revisitSession__messageRow">
              <span>
                {CHANNEL_LABEL[m.channel]}
                {m.fallback_channel ? ` → ${CHANNEL_LABEL[m.fallback_channel]} 대체 발송` : ''} — {STATUS_LABEL[m.status]}
                {m.status === 'FAILED' || m.status === 'QUEUED' ? ` (${m.attempt_count}/${m.max_attempts}회 시도)` : ''}
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
