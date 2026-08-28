/**
 * QR rendering for the PERSONAL_QR delivery mode (round 8). Renders the
 * SAME one-time capability URL the text link already shows -- the QR is
 * purely a convenience so a patient with a smartphone can open it without
 * typing, not a second, differently-secured path.
 *
 * The encoded payload is the opaque `#follow-up=<token>` URL and nothing
 * else: never patient_id, name, phone, DOB, or target labels. That is the
 * same content already visible as text next to it, so the QR adds no new
 * disclosure surface.
 *
 * Rendered client-side only (the server never generates or stores an
 * image), so the capability never gains a second persisted representation.
 */
import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

export function FollowUpQrCode({ url }: { url: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    setDataUrl(null)
    setFailed(false)
    QRCode.toDataURL(url, { width: 220, margin: 1, errorCorrectionLevel: 'M' })
      .then((generated) => {
        if (!cancelled) setDataUrl(generated)
      })
      .catch(() => {
        // The text link beside this is always the source of truth -- a QR
        // failure must never block the staff workflow.
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [url])

  if (failed) {
    return <p className="doctor__revisitSession__hint">QR 생성에 실패했습니다 — 아래 링크를 직접 사용해 주세요.</p>
  }
  if (!dataUrl) {
    return <p className="doctor__revisitSession__hint">QR 생성 중…</p>
  }
  return (
    <div className="doctor__revisitSession__qr">
      <img src={dataUrl} alt="환자용 1회용 링크 QR 코드" width={220} height={220} />
      <p className="doctor__revisitSession__hint">환자 휴대폰으로 스캔하면 같은 1회용 링크가 열립니다.</p>
    </div>
  )
}
