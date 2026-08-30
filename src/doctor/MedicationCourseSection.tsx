/**
 * Medication/Herbal-course batch: compact Doctor-facing surface for a
 * patient's MedicationCourse records. Generic across 맞춤한약/녹용/경옥고/
 * 공진단/등 -- no product hard-mapping, no timing rules invented here.
 *
 * Every date field is explicit and human-supplied (chip-first reveal, same
 * pattern as NextReassessmentPlanCard.tsx) -- this component never derives
 * medication_start_at/dispensed_at/prescribed_at/due_at from "now" or from
 * any other field. `source`/`source_id`/`source_timestamp` on a
 * course created through this UI record that IT was a manual clinician
 * entry (no EMR/pharmacy integration exists yet) -- that is provenance
 * about the record itself, not an inferred clinical date.
 *
 * "시작일 변경" only supersedes the course's existing open ROUTINE check
 * tasks (server/crmStore.js's shiftMedicationCourseStartStored) -- it
 * never auto-creates replacement check tasks with a computed due date.
 * The clinician re-schedules explicitly afterward via "확인 예약", keeping
 * every due_at traceable to a human decision.
 */
import { useEffect, useRef, useState } from 'react'
import {
  createEpisode,
  createMedicationCourse,
  createMedicationCourseCheckTask,
  listEpisodesByPatient,
  listEpisodeTasks,
  listMedicationCoursesByEpisode,
  shiftMedicationCourseStart,
  type MedicationCourseRecord,
  type MedicationCourseReasonCode,
} from '../lib/serverClient'
import type { CrmTask, Episode } from '../crm/types'
import { CRM_REASON_CODE_LABEL, CRM_TASK_STATUS_LABEL } from '../crm/labels'

const REASON_CODES: MedicationCourseReasonCode[] = ['MEDICATION_START_CHECK', 'MEDICATION_MID_CHECK', 'MEDICATION_END_CHECK']
const OPEN_STATUSES: CrmTask['status'][] = ['OPEN', 'CLAIMED', 'IN_PROGRESS', 'SNOOZED']

function formatDate(value: string | null): string {
  if (!value) return '미기록'
  return value.length >= 10 ? value.slice(0, 10) : value
}

// Independent-review finding: crypto.randomUUID() is unavailable outside a
// secure context, and this clinic LAN server is reached over plain
// http://<lan-ip> -- same guard App.tsx's own newSessionId() already uses.
function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

type CheckTaskDraft = { reason: MedicationCourseReasonCode; dueAt: string }

export function MedicationCourseSection({ patientUuid }: { patientUuid: string }) {
  const [episodes, setEpisodes] = useState<Episode[] | null>(null)
  const [episodeId, setEpisodeId] = useState<string | null>(null)
  const [courses, setCourses] = useState<MedicationCourseRecord[] | null>(null)
  const [tasks, setTasks] = useState<CrmTask[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [showNewCourseForm, setShowNewCourseForm] = useState(false)
  // Independent-review finding: minting a fresh source_id on every submit
  // defeated the store's own dedup (a lost response + resubmit created a
  // second course for the same real event). One id per open draft, reused
  // across retries of that same draft, makes a resubmit genuinely
  // idempotent -- a new id is only drawn when a NEW draft is opened.
  const [newCourseSourceId, setNewCourseSourceId] = useState('')
  const [newPrescribedAt, setNewPrescribedAt] = useState('')
  const [newDispensedAt, setNewDispensedAt] = useState('')
  const [newStartAt, setNewStartAt] = useState('')
  const [newDurationDays, setNewDurationDays] = useState('')

  const [checkDraftByCourse, setCheckDraftByCourse] = useState<Record<string, CheckTaskDraft>>({})
  const [shiftDraftByCourse, setShiftDraftByCourse] = useState<Record<string, string>>({})

  // Independent-review finding: a plain `open={courses.length > 0}` re-snaps
  // a user-collapsed section back open on every reload. `manualOpen` wins
  // once the clinician has actually toggled it; until then this falls back
  // to the auto-expand-when-non-empty heuristic.
  const [manualOpen, setManualOpen] = useState<boolean | null>(null)

  // Owner-review finding: this component is only isolated from a patient
  // switch by DoctorView.tsx's `key={selectedRecord.patient_id}` on its own
  // caller -- a real but external safety net. Every async completion below
  // (the initial load, its nested course/task reads, and every mutating
  // action's own reload) now proves it still belongs to the CURRENT load
  // epoch before committing state, so a slow/failed response for a
  // previous patient can never render under a newly-selected one even if
  // that external remount guarantee were ever weakened. Bumped exactly
  // once per patientUuid change; every in-flight promise from a prior
  // epoch captures its own epoch number in closure and compares against
  // the current ref value at completion time.
  const loadEpochRef = useRef(0)

  function reloadEpisodeData(epId: string, epoch: number) {
    listMedicationCoursesByEpisode(epId).then((result) => {
      if (loadEpochRef.current !== epoch) return
      if (result.ok) setCourses(result.data.courses)
      else setLoadError(result.error)
    })
    listEpisodeTasks(epId).then((result) => {
      if (loadEpochRef.current !== epoch) return
      if (result.ok) setTasks(result.data.tasks)
    })
  }

  useEffect(() => {
    const epoch = ++loadEpochRef.current
    setEpisodes(null)
    setEpisodeId(null)
    setCourses(null)
    setTasks(null)
    setLoadError(null)
    setActionError(null)
    setBusy(false)
    setShowNewCourseForm(false)
    setNewCourseSourceId('')
    setCheckDraftByCourse({})
    setShiftDraftByCourse({})
    setManualOpen(null)
    listEpisodesByPatient(patientUuid).then((result) => {
      if (loadEpochRef.current !== epoch) return
      if (!result.ok) {
        setLoadError(result.error)
        return
      }
      setEpisodes(result.data.episodes)
      const chosen = result.data.episodes.find((e) => e.status === 'ACTIVE') ?? result.data.episodes[0] ?? null
      if (chosen) {
        setEpisodeId(chosen.episode_id)
        reloadEpisodeData(chosen.episode_id, epoch)
      }
    })
    // Review finding (LOW): a bumped epoch alone fences setState calls, but
    // does nothing on unmount -- the unmounting instance's own ref object is
    // frozen at its last epoch, so its still-in-flight promises would pass
    // every guard. Invalidating the epoch on cleanup folds the unmount case
    // into the same mechanism instead of leaving it unfenced.
    return () => {
      loadEpochRef.current += 1
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientUuid])

  function handleCreateEpisode() {
    if (busy) return
    const epoch = loadEpochRef.current
    setBusy(true)
    setActionError(null)
    createEpisode(patientUuid)
      .then((result) => {
        if (loadEpochRef.current !== epoch) return
        if (result.ok) {
          setEpisodes((prev) => [...(prev ?? []), result.data])
          setEpisodeId(result.data.episode_id)
          setCourses([])
          setTasks([])
        } else {
          setActionError(result.error)
        }
      })
      .finally(() => {
        if (loadEpochRef.current === epoch) setBusy(false)
      })
  }

  function handleCreateCourse() {
    if (busy || !episodeId || !newCourseSourceId) return
    const epoch = loadEpochRef.current
    setBusy(true)
    setActionError(null)
    createMedicationCourse({
      episodeId,
      source: 'doctor_manual_entry',
      sourceId: newCourseSourceId,
      sourceTimestamp: new Date().toISOString(),
      prescribedAt: newPrescribedAt || null,
      dispensedAt: newDispensedAt || null,
      medicationStartAt: newStartAt || null,
      plannedDurationDays: newDurationDays.trim() === '' ? null : Number(newDurationDays),
    })
      .then((result) => {
        if (loadEpochRef.current !== epoch) return
        if (result.ok) {
          setCourses((prev) => [...(prev ?? []).filter((c) => c.course_id !== result.data.course.course_id), result.data.course])
          setShowNewCourseForm(false)
          setNewCourseSourceId('')
          setNewPrescribedAt('')
          setNewDispensedAt('')
          setNewStartAt('')
          setNewDurationDays('')
        } else {
          setActionError(result.error)
        }
      })
      .finally(() => {
        if (loadEpochRef.current === epoch) setBusy(false)
      })
  }

  function handleCreateCheckTask(course: MedicationCourseRecord) {
    const draft = checkDraftByCourse[course.course_id]
    if (busy || !draft || !draft.dueAt) return
    const epoch = loadEpochRef.current
    setBusy(true)
    setActionError(null)
    createMedicationCourseCheckTask(course.course_id, course.version, draft.reason, draft.dueAt)
      .then((result) => {
        if (loadEpochRef.current !== epoch) return
        if (result.ok) {
          if (episodeId) reloadEpisodeData(episodeId, epoch)
          setCheckDraftByCourse((prev) => {
            const next = { ...prev }
            delete next[course.course_id]
            return next
          })
        } else if (result.error === 'conflict') {
          setActionError('다른 곳에서 이미 변경되었습니다 -- 최신 상태로 새로고침합니다.')
          if (episodeId) reloadEpisodeData(episodeId, epoch)
        } else {
          setActionError(result.error)
        }
      })
      .finally(() => {
        if (loadEpochRef.current === epoch) setBusy(false)
      })
  }

  function handleShiftStart(course: MedicationCourseRecord) {
    const draftDate = shiftDraftByCourse[course.course_id]
    if (busy || !draftDate) return
    const epoch = loadEpochRef.current
    setBusy(true)
    setActionError(null)
    shiftMedicationCourseStart(course.course_id, course.version, draftDate, [])
      .then((result) => {
        if (loadEpochRef.current !== epoch) return
        if (result.ok) {
          if (episodeId) reloadEpisodeData(episodeId, epoch)
          setShiftDraftByCourse((prev) => {
            const next = { ...prev }
            delete next[course.course_id]
            return next
          })
        } else if (result.error === 'conflict') {
          setActionError('다른 곳에서 이미 변경되었습니다 -- 최신 상태로 새로고침합니다.')
          if (episodeId) reloadEpisodeData(episodeId, epoch)
        } else {
          setActionError(result.error)
        }
      })
      .finally(() => {
        if (loadEpochRef.current === epoch) setBusy(false)
      })
  }

  if (loadError) {
    return (
      <section className="medCourse" aria-label="투약/한약 코스">
        <p className="doctor__revisitSession__error">{loadError}</p>
      </section>
    )
  }

  if (episodes === null) return null

  if (episodes.length === 0) {
    return (
      <section className="medCourse" aria-label="투약/한약 코스">
        <p className="workspace__empty">이 환자의 CRM 에피소드가 아직 없습니다.</p>
        <button type="button" className="judgment__recordBtn" onClick={handleCreateEpisode} disabled={busy}>
          에피소드 만들기
        </button>
        {actionError && <p className="doctor__revisitSession__error">{actionError}</p>}
      </section>
    )
  }

  const detailsOpen = manualOpen ?? Boolean(courses && courses.length > 0)

  return (
    <details className="medCourse" open={detailsOpen} onToggle={(e) => setManualOpen(e.currentTarget.open)}>
      <summary>투약/한약 코스 {courses ? `(${courses.length})` : ''}</summary>
      <div className="medCourse__body">
        {actionError && <p className="doctor__revisitSession__error">{actionError}</p>}

        {(courses ?? []).map((course) => {
          const courseTasks = (tasks ?? []).filter(
            (t) => t.source_type === 'MEDICATION_COURSE' && t.source_id === course.course_id,
          )
          const draft = checkDraftByCourse[course.course_id]
          const shiftDraft = shiftDraftByCourse[course.course_id]
          return (
            <div key={course.course_id} className="medCourse__card">
              <p className="medCourse__provenance">
                출처: {course.source} · 기록: {formatDate(course.source_timestamp)}
              </p>
              <div className="medCourse__dates">
                <span>처방일 {formatDate(course.prescribed_at)}</span>
                <span>조제일 {formatDate(course.dispensed_at)}</span>
                <span>복용시작일 {formatDate(course.medication_start_at)}</span>
                {course.planned_duration_days !== null && <span>예정 {course.planned_duration_days}일</span>}
              </div>

              <ul className="medCourse__taskList">
                {courseTasks.length === 0 && <li className="workspace__empty">예약된 확인 작업이 없습니다.</li>}
                {courseTasks.map((t) => (
                  <li key={t.task_id} className="medCourse__taskRow">
                    <span>{CRM_REASON_CODE_LABEL[t.reason_code]}</span>
                    <span>
                      {OPEN_STATUSES.includes(t.status) ? `예정일 ${formatDate(t.due_at)}` : CRM_TASK_STATUS_LABEL[t.status]}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="medCourse__actions" role="group" aria-label="확인 작업 예약">
                <div className="medCourse__actions__chips" role="group" aria-label="확인 종류">
                  {REASON_CODES.map((rc) => (
                    <button
                      key={rc}
                      type="button"
                      aria-pressed={draft?.reason === rc}
                      className={`workspace__followUpChip${draft?.reason === rc ? ' workspace__followUpChip--active' : ''}`}
                      onClick={() =>
                        setCheckDraftByCourse((prev) => ({
                          ...prev,
                          [course.course_id]: { reason: rc, dueAt: prev[course.course_id]?.dueAt ?? '' },
                        }))
                      }
                    >
                      {CRM_REASON_CODE_LABEL[rc]}
                    </button>
                  ))}
                </div>
                {draft && (
                  <div className="medCourse__actions__row">
                    <input
                      type="date"
                      value={draft.dueAt}
                      onChange={(e) =>
                        setCheckDraftByCourse((prev) => ({ ...prev, [course.course_id]: { ...draft, dueAt: e.target.value } }))
                      }
                    />
                    <button
                      type="button"
                      className="judgment__recordBtn"
                      onClick={() => handleCreateCheckTask(course)}
                      disabled={busy || !draft.dueAt}
                    >
                      확인 예약
                    </button>
                  </div>
                )}
              </div>

              <details className="medCourse__shift">
                <summary>복용 시작일 변경</summary>
                <div className="medCourse__actions__row">
                  <input
                    type="date"
                    value={shiftDraft ?? ''}
                    onChange={(e) => setShiftDraftByCourse((prev) => ({ ...prev, [course.course_id]: e.target.value }))}
                  />
                  <button
                    type="button"
                    className="judgment__recordBtn"
                    onClick={() => handleShiftStart(course)}
                    disabled={busy || !shiftDraft}
                  >
                    변경 저장
                  </button>
                </div>
                <p className="workspace__reassessPlan__hint">
                  변경 시 이 코스의 진행 중인 확인 작업은 종료 처리되며, 새 확인 예약은 위에서 직접 다시 등록합니다.
                </p>
              </details>
            </div>
          )
        })}

        {showNewCourseForm ? (
          <div className="medCourse__newForm">
            <label className="workspace__reassessPlan__field">
              <span>처방일(선택)</span>
              <input type="date" value={newPrescribedAt} onChange={(e) => setNewPrescribedAt(e.target.value)} />
            </label>
            <label className="workspace__reassessPlan__field">
              <span>조제일(선택)</span>
              <input type="date" value={newDispensedAt} onChange={(e) => setNewDispensedAt(e.target.value)} />
            </label>
            <label className="workspace__reassessPlan__field">
              <span>복용시작일(선택)</span>
              <input type="date" value={newStartAt} onChange={(e) => setNewStartAt(e.target.value)} />
            </label>
            <label className="workspace__reassessPlan__field">
              <span>예정 복용일수(선택)</span>
              <input
                type="number"
                min={1}
                value={newDurationDays}
                onChange={(e) => setNewDurationDays(e.target.value)}
                placeholder="예: 14"
              />
            </label>
            <div className="medCourse__actions__row">
              <button type="button" className="judgment__recordBtn" onClick={handleCreateCourse} disabled={busy}>
                코스 기록 저장
              </button>
              <button
                type="button"
                className="judgment__recordBtn"
                onClick={() => {
                  setShowNewCourseForm(false)
                  setNewCourseSourceId('')
                }}
                disabled={busy}
              >
                취소
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="judgment__recordBtn"
            onClick={() => {
              setNewCourseSourceId(newId())
              setShowNewCourseForm(true)
            }}
            disabled={busy}
          >
            새 투약/한약 코스 기록
          </button>
        )}
      </div>
    </details>
  )
}
