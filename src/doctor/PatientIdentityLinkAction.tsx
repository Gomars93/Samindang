/**
 * Identity Production Batch (round 14 continuation): the minimum usable
 * confirmation UI for linking a Clinical OS patient_uuid to a Sigma
 * chart_no + display name, using the existing doctor-authenticated
 * POST /api/crm/patient-identity endpoint (server/patientIdentityStore.js,
 * server/index.js). This repo still has no live Sigma client -- the
 * operator has already checked Sigma externally and confirms
 * 차트번호 + 환자명 here; nothing is looked up or inferred automatically.
 *
 * Explicit confirmation only: idle -> editing -> submitting, one row at a
 * time, no auto-submit. Cancel discards the entered values with no
 * network call and no state change. Submit is disabled while a request is
 * in flight, preventing a double-click from firing two links. Each row
 * mounts its own instance (keyed by patient_uuid in TodayQueueSection), so
 * a failed request or entered-but-not-submitted text in one row can never
 * leak into another row or survive a switch to a different patient --
 * that isolation is a property of React's per-instance local state, not
 * anything this component has to implement itself.
 *
 * Deliberately NOT built here: unlink/relink/change-mapping UI (the
 * server has no such endpoint this round either), any phone/RRN field,
 * and any client-side identity inference -- the operator's typed values
 * are sent verbatim to the server, which is the sole point of validation
 * and conflict detection (already_linked / chart_already_linked /
 * legacy_reservation_ambiguous, surfaced via IDENTITY_LINK_ERROR_LABEL).
 */
import { useState } from 'react'
import { linkPatientIdentity, type ResolvedPatientIdentity } from '../lib/serverClient'
import { IDENTITY_LINK_ERROR_LABEL } from '../crm/labels'

export type PatientIdentityLinkActionProps = {
  patientUuid: string
  onLinked: (patientUuid: string, identity: ResolvedPatientIdentity) => void
}

type Mode = 'idle' | 'editing' | 'submitting'

export function PatientIdentityLinkAction({ patientUuid, onLinked }: PatientIdentityLinkActionProps) {
  const [mode, setMode] = useState<Mode>('idle')
  const [chartNo, setChartNo] = useState('')
  const [patientName, setPatientName] = useState('')
  const [error, setError] = useState<string | null>(null)

  if (mode === 'idle') {
    return (
      <button
        type="button"
        className="doctor__todayQueue__linkButton"
        onClick={() => {
          setError(null)
          setMode('editing')
        }}
      >
        시그마 연결
      </button>
    )
  }

  const submitting = mode === 'submitting'

  return (
    <form
      className="doctor__todayQueue__linkForm"
      onSubmit={(e) => {
        e.preventDefault()
        if (submitting) return
        const trimmedChartNo = chartNo.trim()
        const trimmedName = patientName.trim()
        if (!trimmedChartNo || !trimmedName) {
          setError('차트번호와 환자명을 모두 입력하세요.')
          return
        }
        setMode('submitting')
        setError(null)
        linkPatientIdentity({ patientUuid, chartNo: trimmedChartNo, patientName: trimmedName }).then((result) => {
          if (result.ok) {
            onLinked(patientUuid, {
              resolved: true,
              sigma_chart_no: result.data.sigma_chart_no,
              patient_name: result.data.patient_name,
            })
            setMode('idle')
            setChartNo('')
            setPatientName('')
          } else {
            setMode('editing')
            setError(IDENTITY_LINK_ERROR_LABEL[result.error] ?? `연결 실패: ${result.error}`)
          }
        })
      }}
    >
      <input
        type="text"
        className="doctor__todayQueue__linkInput"
        placeholder="차트번호"
        aria-label="시그마 차트번호"
        value={chartNo}
        disabled={submitting}
        onChange={(e) => setChartNo(e.target.value)}
      />
      <input
        type="text"
        className="doctor__todayQueue__linkInput"
        placeholder="환자명"
        aria-label="환자명"
        value={patientName}
        disabled={submitting}
        onChange={(e) => setPatientName(e.target.value)}
      />
      <button type="submit" className="doctor__todayQueue__linkSubmit" disabled={submitting}>
        {submitting ? '연결 중…' : '확인'}
      </button>
      <button
        type="button"
        className="doctor__todayQueue__linkCancel"
        disabled={submitting}
        onClick={() => {
          setMode('idle')
          setChartNo('')
          setPatientName('')
          setError(null)
        }}
      >
        취소
      </button>
      {error && (
        <span className="doctor__todayQueue__linkError" role="alert">
          {error}
        </span>
      )}
    </form>
  )
}
