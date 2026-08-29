/**
 * Identity Production Batch (round 14 continuation): the minimum usable
 * confirmation UI for linking a Clinical OS patient_uuid to a Sigma
 * chart_no + display name, using the existing doctor-authenticated
 * POST /api/crm/patient-identity endpoint (server/patientIdentityStore.js,
 * server/index.js). This repo still has no live Sigma client -- the
 * operator has already checked Sigma externally and confirms
 * 차트번호 + 환자명 here; nothing is looked up or inferred automatically.
 *
 * Explicit confirmation only: idle -> editing -> reviewing -> submitting,
 * one row at a time, no auto-submit. Cancel (from editing or reviewing)
 * discards the entered values with no network call and no state change.
 * Submit is disabled while a request is in flight, preventing a
 * double-click from firing two links. Each row mounts its own instance
 * (keyed by task_id in TodayQueueSection -- a patient with two open CRM
 * tasks legitimately gets two independent instances), so a failed
 * request or entered-but-not-submitted text in one row can never leak
 * into another row or survive a switch to a different patient -- that
 * isolation is a property of React's per-instance local state, not
 * anything this component has to implement itself.
 *
 * The reviewing step (independent-review finding #2) exists because this
 * link is IRREVERSIBLE from the UI -- there is deliberately no
 * unlink/relink/change-mapping UI (the server has no such endpoint this
 * round either) to undo a mistaken confirmation. Since that safety net
 * can't be a post-hoc "undo", it has to be a pre-commit checkpoint:
 * typed values are shown back to the operator for one explicit second
 * confirmation ("이 내용으로 연결") before the POST ever fires; "뒤로" returns
 * to editing without submitting.
 *
 * Deliberately NOT built here: unlink/relink/change-mapping UI, any
 * phone/RRN field, and any client-side identity inference -- the
 * operator's typed values are sent verbatim to the server, which is the
 * sole point of validation and conflict detection (already_linked /
 * chart_already_linked / legacy_reservation_ambiguous, surfaced via
 * IDENTITY_LINK_ERROR_LABEL).
 */
import { useState } from 'react'
import { linkPatientIdentity, type ResolvedPatientIdentity } from '../lib/serverClient'
import { IDENTITY_LINK_ERROR_LABEL } from '../crm/labels'

export type PatientIdentityLinkActionProps = {
  patientUuid: string
  onLinked: (patientUuid: string, identity: ResolvedPatientIdentity) => void
}

type Mode = 'idle' | 'editing' | 'reviewing' | 'submitting'

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

  const resetToIdle = () => {
    setMode('idle')
    setChartNo('')
    setPatientName('')
    setError(null)
  }

  if (mode === 'reviewing' || mode === 'submitting') {
    return (
      <div className="doctor__todayQueue__linkForm" role="group" aria-label="시그마 연결 확인">
        <span className="doctor__todayQueue__linkReviewText">
          {patientName} / {chartNo} 로 연결하시겠습니까?
        </span>
        <button
          type="button"
          className="doctor__todayQueue__linkSubmit"
          disabled={submitting}
          onClick={() => {
            if (submitting) return
            setMode('submitting')
            setError(null)
            linkPatientIdentity({ patientUuid, chartNo, patientName })
              .then((result) => {
                if (result.ok) {
                  onLinked(patientUuid, {
                    resolved: true,
                    sigma_chart_no: result.data.sigma_chart_no,
                    patient_name: result.data.patient_name,
                  })
                  resetToIdle()
                } else {
                  setMode('editing')
                  const base = IDENTITY_LINK_ERROR_LABEL[result.error] ?? `연결 실패: ${result.error}`
                  const existingChartNo = result.errorBody?.existing_sigma_chart_no
                  const existingName = result.errorBody?.existing_patient_name
                  const detail =
                    typeof existingChartNo === 'string' && typeof existingName === 'string'
                      ? ` (기존 연결: ${existingName} / ${existingChartNo})`
                      : ''
                  setError(`${base}${detail}`)
                }
              })
              .catch(() => {
                // Independent-review finding: without this, an unexpected
                // throw would leave `mode` stuck at 'submitting' forever --
                // every button in this view is disabled while submitting,
                // so the operator would have no way out except a reload.
                setMode('editing')
                setError('연결 실패: 알 수 없는 오류가 발생했습니다.')
              })
          }}
        >
          {submitting ? '연결 중…' : '이 내용으로 연결'}
        </button>
        <button
          type="button"
          className="doctor__todayQueue__linkCancel"
          data-action="back"
          disabled={submitting}
          onClick={() => setMode('editing')}
        >
          뒤로
        </button>
        <button
          type="button"
          className="doctor__todayQueue__linkCancel"
          data-action="discard"
          disabled={submitting}
          onClick={resetToIdle}
        >
          취소
        </button>
      </div>
    )
  }

  return (
    <form
      className="doctor__todayQueue__linkForm"
      onSubmit={(e) => {
        e.preventDefault()
        // Independent-review finding: server/index.js normalizes
        // sigma_chart_no with .trim().toUpperCase() before persisting it
        // (fixing a case-sensitivity bug that let two casings of the
        // same chart_no both succeed) -- the review step exists so the
        // operator confirms exactly what will be committed, so it must
        // show this same normalized value, not the raw typed one.
        const trimmedChartNo = chartNo.trim().toUpperCase()
        const trimmedName = patientName.trim()
        if (!trimmedChartNo || !trimmedName) {
          setError('차트번호와 환자명을 모두 입력하세요.')
          return
        }
        setChartNo(trimmedChartNo)
        setPatientName(trimmedName)
        setError(null)
        setMode('reviewing')
      }}
    >
      <input
        type="text"
        className="doctor__todayQueue__linkInput"
        placeholder="차트번호"
        aria-label="시그마 차트번호"
        value={chartNo}
        onChange={(e) => setChartNo(e.target.value)}
      />
      <input
        type="text"
        className="doctor__todayQueue__linkInput"
        placeholder="환자명"
        aria-label="환자명"
        value={patientName}
        onChange={(e) => setPatientName(e.target.value)}
      />
      <button type="submit" className="doctor__todayQueue__linkSubmit">
        확인
      </button>
      <button type="button" className="doctor__todayQueue__linkCancel" onClick={resetToIdle}>
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
