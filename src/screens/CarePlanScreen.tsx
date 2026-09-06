/**
 * 플로우 정렬 4/5 (환자 치료 계획 링크): patient-facing READ-ONLY care-plan
 * page, reached via the `#care-plan=<token>` hash link a clinician issues
 * from the "환자 전달용 치료 계획" card (PatientCarePlanPreviewCard.tsx).
 *
 * Same security boundary as FollowUpScreen.tsx: imports only
 * lib/followUpClient.ts (never serverClient.ts / doctorToken.ts), sends only
 * the opaque token, and receives only the approved patient-facing text +
 * expiry -- never an identifier, prior assessment, or clinician note.
 *
 * Deliberately DIFFERENT from FollowUpScreen in two ways:
 * - Nothing is submitted. There is no form, no button, no POST. A care-plan
 *   token can never be consumed (server refuses), so reading is idempotent.
 * - The URL is NOT scrubbed. The whole point is that the patient re-opens
 *   this link from their messages over the next days (TTL is 14 days by
 *   default), so the token must stay in the URL; the one-time follow-up
 *   screen's replaceState hygiene does not apply here.
 */
import { useEffect, useState } from 'react'
import { getCarePlanLink, type CarePlanLinkPublicView } from '../lib/followUpClient'

const UNAVAILABLE_MESSAGE: Record<string, string> = {
  EXPIRED: '링크가 만료되었습니다. 치료 계획이 필요하시면 직원에게 문의해 주세요.',
  INVALIDATED: '더 이상 사용할 수 없는 링크입니다. 새 링크가 필요하시면 직원에게 문의해 주세요.',
  CONSUMED: '더 이상 사용할 수 없는 링크입니다. 직원에게 문의해 주세요.',
  INVALID: '유효하지 않은 링크입니다. 직원에게 문의해 주세요.',
}

type Screen = 'loading' | 'view' | 'unavailable' | 'load_error'

function formatExpiry(iso: string | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`
}

export function CarePlanScreen({
  token,
  initialView,
}: {
  token: string | null
  /** Test seam only: skips the network fetch and renders this view directly. Never set by App.tsx. */
  initialView?: CarePlanLinkPublicView
}) {
  const [screen, setScreen] = useState<Screen>(() => {
    if (!initialView) return 'loading'
    return initialView.status === 'ACTIVE' ? 'view' : 'unavailable'
  })
  const [view, setView] = useState<CarePlanLinkPublicView | null>(initialView ?? null)

  useEffect(() => {
    if (initialView) return
    if (!token) {
      setScreen('load_error')
      return
    }
    let cancelled = false
    getCarePlanLink(token).then((result) => {
      if (cancelled) return
      if (!result.ok) {
        setScreen('load_error')
        return
      }
      setView(result.data)
      setScreen(result.data.status === 'ACTIVE' ? 'view' : 'unavailable')
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- token is read once at mount; the link is meant to be re-opened, not re-fetched live
  }, [])

  if (screen === 'loading') {
    return (
      <div className="center">
        <div className="center__inner">
          <p className="waitStatus" role="status">
            불러오는 중입니다
          </p>
        </div>
      </div>
    )
  }

  if (screen === 'load_error') {
    return (
      <div className="shell">
        <main className="shell__main complete">
          <div className="complete__inner">
            <h1 className="title">연결할 수 없습니다</h1>
            <p className="notice" role="alert">
              서버에 연결할 수 없습니다. 잠시 후 다시 열어 주세요.
            </p>
          </div>
        </main>
      </div>
    )
  }

  if (screen === 'unavailable') {
    const reason = view?.status ?? 'INVALID'
    return (
      <div className="shell">
        <main className="shell__main complete">
          <div className="complete__inner">
            <h1 className="title">사용할 수 없는 링크입니다</h1>
            <p className="notice" role="alert">
              {UNAVAILABLE_MESSAGE[reason] ?? UNAVAILABLE_MESSAGE.INVALID}
            </p>
          </div>
        </main>
      </div>
    )
  }

  const expiry = formatExpiry(view?.expiresAt)
  return (
    <div className="shell">
      <main className="shell__main">
        <div className="followUp carePlan">
          <h1 className="question">나의 치료 계획</h1>
          <p className="helper">삼인당한의원에서 진료 시 안내한 내용입니다. 궁금한 점은 다음 방문 때 말씀해 주세요.</p>
          <section className="followUp__section">
            <p className="carePlan__text">{view?.carePlanText ?? ''}</p>
          </section>
          {expiry && <p className="helper carePlan__expiry">{`이 페이지는 ${expiry}까지 열 수 있습니다.`}</p>}
        </div>
      </main>
    </div>
  )
}
