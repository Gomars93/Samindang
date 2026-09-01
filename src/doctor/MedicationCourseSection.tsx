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

// Episode↔Medication association integrity batch: existing non-clinical
// Episode status labels only, for the multi-Episode picker below -- no new
// clinical meaning or priority invented here.
const EPISODE_STATUS_LABEL: Record<Episode['status'], string> = {
  ACTIVE: '진행 중',
  PAUSED: '일시중지',
  COMPLETED: '종료',
  LOST: '연락두절',
}

/**
 * 19차 독립 리뷰 MEDIUM-3: TodayQueueSection.tsx(18차)/MessagingPanel.tsx
 * (18차)에 이미 적용한 것과 동일한 가드 -- 서버가 검증 없이 그대로
 * 보내는 wire 값이 알려지지 않은 enum이면 label map 조회가 undefined가
 * 되어 bare JSX child로는 조용히 빈 칸을 렌더한다(손상된 값을 숨기는
 * fail-silent -- 이 배치가 막으려는 것과 같은 부류).
 */
function episodeStatusLabel(status: unknown): string {
  return typeof status === 'string' && Object.prototype.hasOwnProperty.call(EPISODE_STATUS_LABEL, status)
    ? EPISODE_STATUS_LABEL[status as Episode['status']]
    : '확인 필요'
}
function reasonCodeLabel(code: unknown): string {
  return typeof code === 'string' && Object.prototype.hasOwnProperty.call(CRM_REASON_CODE_LABEL, code)
    ? CRM_REASON_CODE_LABEL[code as CrmTask['reason_code']]
    : '확인 필요'
}
function taskStatusLabel(status: unknown): string {
  return typeof status === 'string' && Object.prototype.hasOwnProperty.call(CRM_TASK_STATUS_LABEL, status)
    ? CRM_TASK_STATUS_LABEL[status as CrmTask['status']]
    : '확인 필요'
}

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
  // Episode↔Medication association integrity batch: same "mint once, reuse
  // across retries, clear only on success" contract as newCourseSourceId
  // below -- a retry of a failed/lost-response 에피소드 만들기 click must
  // resubmit the SAME episode_id so the server's create-if-absent
  // semantics converge on one Episode, not a fresh one per click.
  const [newEpisodeRequestId, setNewEpisodeRequestId] = useState('')
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
    // 19차 독립 리뷰 HIGH-2: 이 두 `.then()` 체인에 catch가 없었다 --
    // 원소 자체는 이제 serverClient.ts에서 걸러지지만(HIGH-1), 어떤
    // 예기치 않은 이유로든 reject하면 `courses`/`tasks`가 이전 에피소드의
    // 값으로 조용히 남는다.
    listMedicationCoursesByEpisode(epId)
      .then((result) => {
        if (loadEpochRef.current !== epoch) return
        if (result.ok) setCourses(result.data.courses)
        else setLoadError(result.error)
      })
      .catch(() => {
        if (loadEpochRef.current === epoch) setLoadError('투약/한약 코스를 불러오지 못했습니다.')
      })
    listEpisodeTasks(epId)
      .then((result) => {
        if (loadEpochRef.current !== epoch) return
        if (result.ok) setTasks(result.data.tasks)
      })
      .catch(() => {
        if (loadEpochRef.current === epoch) setLoadError('확인 작업 목록을 불러오지 못했습니다.')
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
    // 2nd closing-review finding (MEDIUM): these four draft fields were only
    // ever cleared on a successful handleCreateCourse -- switching patients
    // mid-draft (without submitting) left them holding the PREVIOUS
    // patient's typed dates, invisible because the form itself closes here.
    // Opening a fresh draft for the new patient then silently pre-fills
    // with stale dates, one save away from writing one patient's medication
    // dates onto another's course record.
    setNewPrescribedAt('')
    setNewDispensedAt('')
    setNewStartAt('')
    setNewDurationDays('')
    setShowNewCourseForm(false)
    setNewCourseSourceId('')
    setNewEpisodeRequestId('')
    setCheckDraftByCourse({})
    setShiftDraftByCourse({})
    setManualOpen(null)
    // 19차 독립 리뷰 HIGH-2: 이 `.then()` 체인에 catch가 없었다.
    listEpisodesByPatient(patientUuid)
      .then((result) => {
        if (loadEpochRef.current !== epoch) return
        if (!result.ok) {
          setLoadError(result.error)
          return
        }
        setEpisodes(result.data.episodes)
        // Episode↔Medication association integrity batch (owner-review
        // finding): the old `find(ACTIVE) ?? episodes[0]` silently picked the
        // OLDEST episode whenever more than one existed (listEpisodesByPatient
        // sorts ascending by created_at) -- a new MedicationCourse could land
        // under an Episode the clinician never chose. Auto-select only when
        // unambiguous: a single Episode total, or a single ACTIVE one among
        // several non-active ones. Two or more ACTIVE Episodes (or two or
        // more non-active ones with none ACTIVE) leaves episodeId null so the
        // render below shows an explicit picker instead of guessing.
        const activeEpisodes = result.data.episodes.filter((e) => e.status === 'ACTIVE')
        const chosen = result.data.episodes.length === 1 ? result.data.episodes[0] : activeEpisodes.length === 1 ? activeEpisodes[0] : null
        if (chosen) {
          setEpisodeId(chosen.episode_id)
          reloadEpisodeData(chosen.episode_id, epoch)
        }
      })
      .catch(() => {
        if (loadEpochRef.current === epoch) setLoadError('에피소드 목록을 불러오지 못했습니다.')
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
    // Episode↔Medication association integrity batch: mint the request id
    // only on the FIRST attempt; a retry (busy cleared after a failed or
    // lost-response first attempt) reuses the same id so the server's
    // create-if-absent semantics converge on one Episode.
    const requestId = newEpisodeRequestId || newId()
    if (!newEpisodeRequestId) setNewEpisodeRequestId(requestId)
    setBusy(true)
    setActionError(null)
    createEpisode(patientUuid, undefined, requestId)
      .then((result) => {
        if (loadEpochRef.current !== epoch) return
        if (result.ok) {
          setEpisodes((prev) => [...(prev ?? []), result.data])
          setEpisodeId(result.data.episode_id)
          setCourses([])
          setTasks([])
          setNewEpisodeRequestId('')
        } else {
          setActionError(result.error)
        }
      })
      .catch(() => {
        // 19차 독립 리뷰 LOW-6: handleRegisterStation(17차)/
        // handleAssignToStation(17차)과 동일한 이유 -- catch가 없으면
        // rejection이 조용히 사라져 actionError가 세팅되지 않은 채 버튼이
        // 아무 반응 없이 끝난 것처럼 보였다.
        if (loadEpochRef.current === epoch) setActionError('에피소드 생성에 실패했습니다. 다시 시도해 주세요.')
      })
      .finally(() => {
        if (loadEpochRef.current === epoch) setBusy(false)
      })
  }

  // Episode↔Medication association integrity batch: the clinician's
  // explicit choice from the multi-Episode picker below -- this is a
  // synchronous selection from the already-loaded `episodes` array, no new
  // network read of its own, but the reload it triggers still needs its
  // own epoch capture like every other mutating/navigating action here.
  function handleSelectEpisode(ep: Episode) {
    const epoch = loadEpochRef.current
    setEpisodeId(ep.episode_id)
    setCourses(null)
    setTasks(null)
    reloadEpisodeData(ep.episode_id, epoch)
  }

  function handleCreateCourse() {
    if (busy || !episodeId || !newCourseSourceId) return
    const epoch = loadEpochRef.current
    setBusy(true)
    setActionError(null)
    createMedicationCourse({
      episodeId,
      patientUuid,
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
      .catch(() => {
        // 19차 독립 리뷰 LOW-6: handleCreateEpisode와 동일한 이유.
        if (loadEpochRef.current === epoch) setActionError('투약/한약 코스 생성에 실패했습니다. 다시 시도해 주세요.')
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
      .catch(() => {
        // 19차 독립 리뷰 LOW-6와 동일한 클래스: 이 handler도 catch가
        // 없으면 rejection이 조용히 사라진다.
        if (loadEpochRef.current === epoch) setActionError('확인 작업 생성에 실패했습니다. 다시 시도해 주세요.')
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
      .catch(() => {
        // 19차 독립 리뷰 LOW-6와 동일한 클래스: 이 handler도 catch가
        // 없으면 rejection이 조용히 사라진다.
        if (loadEpochRef.current === epoch) setActionError('시작일 변경에 실패했습니다. 다시 시도해 주세요.')
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

  // Episode↔Medication association integrity batch (owner-review finding):
  // more than one Episode exists and none was unambiguous enough to
  // auto-select (see the effect above) -- require an explicit choice
  // rather than silently attaching the next course to whichever one the
  // old code happened to pick.
  if (episodeId === null) {
    return (
      <section className="medCourse" aria-label="투약/한약 코스">
        <p className="workspace__empty">이 환자에게 에피소드가 여러 개 있습니다. 투약/한약 코스를 기록할 에피소드를 선택하세요.</p>
        <ul className="medCourse__episodeList">
          {episodes.map((ep) => (
            <li key={ep.episode_id}>
              <button type="button" className="judgment__recordBtn" onClick={() => handleSelectEpisode(ep)}>
                {episodeStatusLabel(ep.status)} · {formatDate(ep.created_at)}
                {ep.owner_clinician ? ` · ${ep.owner_clinician}` : ''}
              </button>
            </li>
          ))}
        </ul>
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
                    <span>{reasonCodeLabel(t.reason_code)}</span>
                    <span>
                      {OPEN_STATUSES.includes(t.status) ? `예정일 ${formatDate(t.due_at)}` : taskStatusLabel(t.status)}
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
                        // 3rd closing-review finding (NIT): clicking the already-active
                        // chip now dismisses the draft (no other affordance existed to
                        // abandon a mis-clicked reason -- it previously stuck around
                        // until a successful create, the rest of the session).
                        setCheckDraftByCourse((prev) => {
                          if (prev[course.course_id]?.reason === rc) {
                            const next = { ...prev }
                            delete next[course.course_id]
                            return next
                          }
                          return { ...prev, [course.course_id]: { reason: rc, dueAt: prev[course.course_id]?.dueAt ?? '' } }
                        })
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

              <details
                className="medCourse__shift"
                // 3rd closing-review finding (LOW): the shift-start draft was only
                // ever cleared on a SUCCESSFUL handleShiftStart -- collapsing this
                // disclosure hid an abandoned date without clearing it, so reopening
                // later re-showed it pre-filled with an already-enabled save button,
                // reading as current data. Clearing on close (not on open) means an
                // in-progress edit survives an accidental collapse/reopen, but an
                // explicitly closed one never lingers.
                onToggle={(e) => {
                  if (e.currentTarget.open) return
                  setShiftDraftByCourse((prev) => {
                    if (!(course.course_id in prev)) return prev
                    const next = { ...prev }
                    delete next[course.course_id]
                    return next
                  })
                }}
              >
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
                  setNewPrescribedAt('')
                  setNewDispensedAt('')
                  setNewStartAt('')
                  setNewDurationDays('')
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
