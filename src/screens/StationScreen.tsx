/**
 * Clinic tablet STATION kiosk screen (round 8: delivery-channel-agnostic
 * Micro Follow-up). This is the screen a tablet sitting at the front desk
 * or in a treatment room shows all day.
 *
 * The whole point is that an elderly patient does nothing but take the
 * tablet and answer: no name/phone/DOB typing, no QR scanning, no account,
 * no patient ID, no visit ID, no token. Staff assign a specific known
 * patient's revisit to this specific station from the doctor/reception
 * screen; this station polls, picks the session up, and hands over.
 *
 * Deliberately does NOT reimplement the question flow -- it renders the
 * existing <FollowUpScreen> with the capability token the poll returned,
 * so the clinic-tablet path and the personal-QR path submit through the
 * exact same code and persist identical data (only the delivery metadata
 * differs).
 *
 * Privacy rules this screen enforces:
 * - the waiting screen shows NO patient identifier of any kind (the poll
 *   response does not even contain one -- see stationClient.ts)
 * - no doctor token is ever involved (stationClient.ts imports neither
 *   serverClient.ts nor doctorToken.ts, enforced by a source-level test)
 * - the capability token lives only in this component's state for the
 *   duration of one patient's session, and is dropped on completion
 * - a reload/restart holds no patient answer state at all: the station
 *   simply re-polls, and a completed session has already been cleared
 *   server-side, so a finished patient's answers can never reappear
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { FollowUpScreen } from './FollowUpScreen'
import {
  completeStationAssignment,
  getStationCredential,
  pollStationAssignment,
} from '../lib/stationClient'

const POLL_INTERVAL_MS = 4000
/** How long the "감사합니다" screen stays up before returning to waiting. */
const DONE_HOLD_MS = 6000

type StationState =
  | { phase: 'unpaired' }
  | { phase: 'waiting' }
  | { phase: 'session'; token: string }
  | { phase: 'done' }

export function StationScreen() {
  const [state, setState] = useState<StationState>(() =>
    getStationCredential() ? { phase: 'waiting' } : { phase: 'unpaired' },
  )
  const [connectionError, setConnectionError] = useState(false)
  // Read inside the polling effect without making it a dependency (which
  // would tear down and rebuild the interval on every phase change).
  const phaseRef = useRef(state.phase)
  useEffect(() => {
    phaseRef.current = state.phase
  }, [state.phase])

  useEffect(() => {
    if (state.phase === 'unpaired') return
    let cancelled = false

    async function tick() {
      // Only poll while genuinely idle: never mid-session (that would
      // yank the questions out from under a patient) and never during the
      // post-submit hold.
      if (phaseRef.current !== 'waiting') return
      const result = await pollStationAssignment()
      if (cancelled) return
      if (!result.ok) {
        setConnectionError(true)
        return
      }
      setConnectionError(false)
      if (result.data.status === 'ASSIGNED' && phaseRef.current === 'waiting') {
        setState({ phase: 'session', token: result.data.token })
      }
    }

    tick()
    const timer = setInterval(tick, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [state.phase === 'unpaired'])

  const handleCompleted = useCallback(() => {
    // Drop the capability token from this component immediately, then tell
    // the server to clear the assignment so this station is free again.
    setState({ phase: 'done' })
    void completeStationAssignment()
  }, [])

  useEffect(() => {
    if (state.phase !== 'done') return
    const timer = setTimeout(() => setState({ phase: 'waiting' }), DONE_HOLD_MS)
    return () => clearTimeout(timer)
  }, [state.phase])

  if (state.phase === 'unpaired') {
    return (
      <div className="shell">
        <main className="shell__main complete">
          <div className="complete__inner">
            <h1 className="title">등록되지 않은 태블릿입니다</h1>
            <p className="helper">직원에게 문의해 주세요.</p>
          </div>
        </main>
      </div>
    )
  }

  if (state.phase === 'session') {
    return <FollowUpScreen token={state.token} onCompleted={handleCompleted} />
  }

  if (state.phase === 'done') {
    return (
      <div className="shell">
        <main className="shell__main complete">
          <div className="complete__inner station__done">
            <h1 className="title">감사합니다</h1>
            <p className="helper">직원에게 태블릿을 돌려주세요.</p>
          </div>
        </main>
      </div>
    )
  }

  // 'waiting' -- deliberately shows nothing about any patient.
  return (
    <div className="shell">
      <main className="shell__main complete">
        <div className="complete__inner station__waiting">
          <h1 className="title">삼인당</h1>
          <p className="helper">직원의 안내를 기다려 주세요.</p>
          {connectionError && (
            <p className="notice" role="status">
              서버에 연결할 수 없습니다. 직원에게 문의해 주세요.
            </p>
          )}
        </div>
      </main>
    </div>
  )
}
