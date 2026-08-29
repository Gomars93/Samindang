// CRM v0.3.1 -- non-clinical Episode/Task data model regression tests
// (PR #24 CRM round 1, Tests 1-20 per the approved spec comment).
// Plain node, no test framework: assert() prints "OK: <name>" and throws on
// failure. Bundled with esbuild --platform=neutral, same convention as
// tests/workspace-round3.spec.mjs.
//
// Run via `npm run test:crm-schema`.

import {
  newEpisode,
  RESERVATION_SUPPRESSION_STATE,
  isReservationSuppressionActive,
} from './.crm-types-bundle.mjs'
import {
  createCrmTask,
  taskTypeForPatientReportedConcern,
  claimTask,
  markTaskSeen,
  releaseExpiredClaim,
  resolveTask,
  isReviewOpen,
  deriveEpisodeReviewState,
  resolveTaskWithPersistence,
  snoozeTask,
  cancelTask,
  supersedeTask,
  onSigmaLookupFailure,
  sortCrmTaskQueue,
  resolveTaskOwner,
  tasksForOwner,
  groupTasksForCommunication,
  assertNoRawPhone,
  CrmConflictError,
} from './.crm-task-engine-bundle.mjs'
import {
  pauseEpisode,
  completeEpisode,
  reopenEpisode,
  applyNextReassessmentPlanToEpisode,
  supersedeFutureRoutineTasksOnCarePlanChange,
  resolveConsecutiveHerbalCourseEpisode,
} from './.crm-episode-bundle.mjs'
import { medicationTimelineAnchor, recalculateMedicationTasksOnStartShift } from './.crm-medication-course-bundle.mjs'

let passCount = 0
function assert(name, cond) {
  if (!cond) throw new Error(`FAIL: ${name}`)
  passCount++
  console.log(`OK: ${name}`)
}

const T0 = '2026-01-01T00:00:00.000Z'
const T1 = '2026-01-02T00:00:00.000Z'

function makeEpisode(overrides = {}) {
  return { ...newEpisode({ episode_id: 'ep-1', patient_uuid: 'pt-uuid-1', owner_clinician: null, now: T0 }), ...overrides }
}

/* ---------------- Test 1: explicit/upstream Safety creates Safety without CRM clinical inference ---------------- */
{
  const upstream = createCrmTask(
    {
      task_id: 't-1a',
      patient_uuid: 'pt-1',
      episode_id: 'ep-1',
      task_type: 'SAFETY_REVIEW',
      reason_code: 'SAFETY_REVIEW_REQUEST',
      source_event_id: 'evt-1a',
      owner_clinician: null,
      now: T0,
      safetyAuthorization: { kind: 'UPSTREAM_APPROVED_SIGNAL', sourceType: 'pain-safety-gate', sourceId: 'gate-1' },
    },
    [],
  )
  assert('Test 1: upstream-approved signal creates a SAFETY_REVIEW task', upstream.task.task_type === 'SAFETY_REVIEW')

  const explicit = createCrmTask(
    {
      task_id: 't-1b',
      patient_uuid: 'pt-1',
      episode_id: 'ep-1',
      task_type: 'SAFETY_REVIEW',
      reason_code: 'SAFETY_REVIEW_REQUEST',
      source_event_id: 'evt-1b',
      owner_clinician: null,
      now: T0,
      safetyAuthorization: { kind: 'EXPLICIT_HUMAN_REQUEST', requestedBy: 'dr-a' },
    },
    [],
  )
  assert('Test 1: explicit human [안전 확인 요청] creates a SAFETY_REVIEW task', explicit.task.task_type === 'SAFETY_REVIEW')

  let threw = false
  try {
    createCrmTask(
      {
        task_id: 't-1c',
        patient_uuid: 'pt-1',
        episode_id: 'ep-1',
        task_type: 'SAFETY_REVIEW',
        reason_code: 'SAFETY_REVIEW_REQUEST',
        source_event_id: 'evt-1c',
        owner_clinician: null,
        now: T0,
      },
      [],
    )
  } catch {
    threw = true
  }
  assert('Test 1: SAFETY_REVIEW without any authorization is rejected', threw)
  assert(
    'Test 1: generic patient-reported concern defaults to CLINICAL_REVIEW, never inferred as SAFETY_REVIEW',
    taskTypeForPatientReportedConcern(false) === 'CLINICAL_REVIEW',
  )
}

/* ---------------- Test 2: staff Safety DONE rejected ---------------- */
{
  const { task } = createCrmTask(
    {
      task_id: 't-2',
      patient_uuid: 'pt-1',
      episode_id: 'ep-1',
      task_type: 'SAFETY_REVIEW',
      reason_code: 'SAFETY_REVIEW_REQUEST',
      source_event_id: 'evt-2',
      owner_clinician: null,
      now: T0,
      safetyAuthorization: { kind: 'EXPLICIT_HUMAN_REQUEST', requestedBy: 'dr-a' },
    },
    [],
  )
  let threw = false
  try {
    resolveTask(task, task.version, 'STAFF', T1)
  } catch {
    threw = true
  }
  assert('Test 2: staff cannot resolve a SAFETY_REVIEW task', threw)
  const resolvedByClinician = resolveTask(task, task.version, 'CLINICIAN', T1)
  assert('Test 2: clinician can resolve a SAFETY_REVIEW task', resolvedByClinician.status === 'DONE')
}

/* ---------------- Test 3: Episode completion preserves open Safety and cancels only future Routine ---------------- */
{
  const episode = makeEpisode()
  const safety = createCrmTask(
    {
      task_id: 't-3-safety',
      patient_uuid: 'pt-1',
      episode_id: episode.episode_id,
      task_type: 'SAFETY_REVIEW',
      reason_code: 'SAFETY_REVIEW_REQUEST',
      source_event_id: 'evt-3-safety',
      owner_clinician: null,
      now: T0,
      safetyAuthorization: { kind: 'EXPLICIT_HUMAN_REQUEST', requestedBy: 'dr-a' },
    },
    [],
  ).task
  const openRoutine = createCrmTask(
    { task_id: 't-3-routine', patient_uuid: 'pt-1', episode_id: episode.episode_id, task_type: 'ROUTINE', reason_code: 'CARE_GAP', source_event_id: 'evt-3-routine', owner_clinician: null, now: T0 },
    [],
  ).task
  const doneRoutine = { ...createCrmTask(
    { task_id: 't-3-routine-done', patient_uuid: 'pt-1', episode_id: episode.episode_id, task_type: 'ROUTINE', reason_code: 'CARE_GAP', source_event_id: 'evt-3-routine-done', owner_clinician: null, now: T0 },
    [],
  ).task, status: 'DONE', resolved_at: T0 }
  const { episode: completed, tasks } = completeEpisode(episode, episode.version, [safety, openRoutine, doneRoutine], T1)
  assert('Test 3: episode status becomes COMPLETED', completed.status === 'COMPLETED')
  assert('Test 3: SAFETY_REVIEW task is untouched (still OPEN)', tasks.find((t) => t.task_id === 't-3-safety').status === 'OPEN')
  assert('Test 3: open ROUTINE task is CANCELLED', tasks.find((t) => t.task_id === 't-3-routine').status === 'CANCELLED')
  assert('Test 3: already-DONE ROUTINE task stays DONE, untouched', tasks.find((t) => t.task_id === 't-3-routine-done').status === 'DONE')
}

/* ---------------- Test 4: duplicate source event -> one task ---------------- */
{
  const first = createCrmTask(
    { task_id: 't-4a', patient_uuid: 'pt-1', episode_id: 'ep-1', task_type: 'ROUTINE', reason_code: 'REASSESSMENT_DUE', source_event_id: 'evt-4', owner_clinician: null, now: T0 },
    [],
  )
  const second = createCrmTask(
    { task_id: 't-4b', patient_uuid: 'pt-1', episode_id: 'ep-1', task_type: 'ROUTINE', reason_code: 'REASSESSMENT_DUE', source_event_id: 'evt-4', owner_clinician: null, now: T1 },
    [first.task],
  )
  assert('Test 4: duplicate source event is deduped', second.deduped === true)
  assert('Test 4: duplicate source event resolves to the original task, not a new one', second.task.task_id === 't-4a')
}

/* ---------------- Test 5: Care Plan change -> future Routine SUPERSEDED, DONE immutable ---------------- */
{
  const open = createCrmTask(
    { task_id: 't-5-open', patient_uuid: 'pt-1', episode_id: 'ep-5', task_type: 'ROUTINE', reason_code: 'CARE_GAP', source_event_id: 'evt-5-open', owner_clinician: null, now: T0 },
    [],
  ).task
  const done = { ...createCrmTask(
    { task_id: 't-5-done', patient_uuid: 'pt-1', episode_id: 'ep-5', task_type: 'ROUTINE', reason_code: 'CARE_GAP', source_event_id: 'evt-5-done', owner_clinician: null, now: T0 },
    [],
  ).task, status: 'DONE', resolved_at: T0, version: 2 }
  const result = supersedeFutureRoutineTasksOnCarePlanChange([open, done], 'ep-5')
  assert('Test 5: open future ROUTINE task becomes SUPERSEDED', result.find((t) => t.task_id === 't-5-open').status === 'SUPERSEDED')
  assert('Test 5: DONE task is immutable -- same status', result.find((t) => t.task_id === 't-5-done').status === 'DONE')
  assert('Test 5: DONE task is immutable -- same version (no write happened)', result.find((t) => t.task_id === 't-5-done').version === 2)
}

/* ---------------- Test 6: medication start date shift recalculates only future tasks ---------------- */
{
  const course = { course_id: 'course-1', episode_id: 'ep-6', patient_uuid: 'pt-1', source: 'sample', source_id: 'course-1', prescribed_at: T0, dispensed_at: T0, medication_start_at: T0, planned_duration_days: 14, source_timestamp: T0 }
  const openTask = createCrmTask(
    { task_id: 't-6-open', patient_uuid: 'pt-1', episode_id: 'ep-6', task_type: 'ROUTINE', reason_code: 'MEDICATION_MID_CHECK', source_type: 'medication_course', source_id: 'course-1', source_event_id: 'evt-6-open', owner_clinician: null, now: T0 },
    [],
  ).task
  const doneTask = { ...createCrmTask(
    { task_id: 't-6-done', patient_uuid: 'pt-1', episode_id: 'ep-6', task_type: 'ROUTINE', reason_code: 'MEDICATION_START_CHECK', source_type: 'medication_course', source_id: 'course-1', source_event_id: 'evt-6-done', owner_clinician: null, now: T0 },
    [],
  ).task, status: 'DONE', resolved_at: T0, version: 2 }
  const { superseded, recalculated } = recalculateMedicationTasksOnStartShift([openTask, doneTask], course, (c) => [
    { task_id: 't-6-new', due_at: c.medication_start_at },
  ])
  assert('Test 6: still-open task tied to the course is superseded', superseded.find((t) => t.task_id === 't-6-open').status === 'SUPERSEDED')
  assert('Test 6: DONE task tied to the course is untouched', superseded.find((t) => t.task_id === 't-6-done').status === 'DONE')
  assert('Test 6: caller supplies the recalculated due dates -- no SLA hardcoded in this module', recalculated[0].due_at === T0)
}

/* ---------------- Test 7: reassess_due -> clinician plan maintained -> flag clears, ACTIVE persists ---------------- */
{
  const episode = { ...makeEpisode(), reassess_due: true }
  const plan = { status: 'CLINICIAN_DECIDES', targetDate: '', afterVisitCount: null, note: '' }
  const updated = applyNextReassessmentPlanToEpisode(episode, plan, T1)
  assert('Test 7: CLINICIAN_DECIDES clears reassess_due', updated.reassess_due === false)
  assert('Test 7: episode status remains ACTIVE (unaffected)', updated.status === 'ACTIVE')
}

/* ---------------- Test 8: reservation suppression stays a disabled/pending fixture until Test 0 is verified ---------------- */
{
  assert('Test 8: reservation suppression state starts PENDING_TEST_0', RESERVATION_SUPPRESSION_STATE === 'PENDING_TEST_0')
  assert('Test 8: PENDING_TEST_0 is not active', isReservationSuppressionActive('PENDING_TEST_0') === false)
  assert('Test 8: DISABLED is not active', isReservationSuppressionActive('DISABLED') === false)
  assert('Test 8: only VERIFIED is active -- this fixture never fakes it', isReservationSuppressionActive('VERIFIED') === true)
}

/* ---------------- Test 9: Sigma lookup failure preserves task ---------------- */
{
  const { task } = createCrmTask(
    { task_id: 't-9', patient_uuid: 'pt-1', episode_id: 'ep-1', task_type: 'ROUTINE', reason_code: 'SIGMA_LOOKUP_FAILURE', source_event_id: 'evt-9', owner_clinician: null, now: T0 },
    [],
  )
  const claimed = claimTask(task, task.version, 'dr-a', T0, 60_000)
  const afterFailure = onSigmaLookupFailure(claimed)
  assert('Test 9: a lookup failure does not change task status', afterFailure.status === 'CLAIMED')
  assert('Test 9: a lookup failure does not bump the version (no write happened)', afterFailure.version === claimed.version)
}

/* ---------------- Test 10: communication grouping cannot absorb Safety ---------------- */
{
  const routine = createCrmTask(
    { task_id: 't-10-routine', patient_uuid: 'pt-1', episode_id: 'ep-1', task_type: 'ROUTINE', reason_code: 'CARE_GAP', source_event_id: 'evt-10-routine', owner_clinician: null, now: T0 },
    [],
  ).task
  const safety = createCrmTask(
    { task_id: 't-10-safety', patient_uuid: 'pt-1', episode_id: 'ep-1', task_type: 'SAFETY_REVIEW', reason_code: 'SAFETY_REVIEW_REQUEST', source_event_id: 'evt-10-safety', owner_clinician: null, now: T0, safetyAuthorization: { kind: 'EXPLICIT_HUMAN_REQUEST', requestedBy: 'dr-a' } },
    [],
  ).task
  const { groups, safetyExcluded } = groupTasksForCommunication([routine, safety])
  assert('Test 10: SAFETY_REVIEW is excluded from every communication group', groups.every((g) => g.every((t) => t.task_type !== 'SAFETY_REVIEW')))
  assert('Test 10: SAFETY_REVIEW surfaces separately rather than disappearing', safetyExcluded.some((t) => t.task_id === 't-10-safety'))
}

/* ---------------- Test 11: raw phone pattern absent from log/URL/audit fixtures ---------------- */
{
  let threw = false
  try {
    assertNoRawPhone('010-1234-5678', 'test-fixture')
  } catch {
    threw = true
  }
  assert('Test 11: a raw phone-shaped value is refused', threw)
  assert('Test 11: a non-phone contact-point key is accepted', (() => {
    assertNoRawPhone('DEFAULT', 'test-fixture')
    return true
  })())
  const { task } = createCrmTask(
    { task_id: 't-11', patient_uuid: 'pt-1', episode_id: 'ep-1', task_type: 'ROUTINE', reason_code: 'CARE_GAP', source_event_id: 'evt-11', owner_clinician: null, now: T0 },
    [],
  )
  assert('Test 11: a task fixture serialized to JSON contains no phone-shaped substring', !/(?:\+?82[-\s]?)?0?1[016789][-\s]?\d{3,4}[-\s]?\d{4}/.test(JSON.stringify(task)))
  assert('Test 11: CrmTask has no phone field at all', !Object.keys(task).some((k) => k.toLowerCase().includes('phone')))
}

/* ---------------- Test 12: owner clinician queue separation ---------------- */
{
  const taskA = createCrmTask(
    { task_id: 't-12a', patient_uuid: 'pt-1', episode_id: 'ep-1', task_type: 'ROUTINE', reason_code: 'CARE_GAP', source_event_id: 'evt-12a', owner_clinician: 'dr-a', now: T0 },
    [],
  ).task
  const taskB = createCrmTask(
    { task_id: 't-12b', patient_uuid: 'pt-2', episode_id: 'ep-2', task_type: 'ROUTINE', reason_code: 'CARE_GAP', source_event_id: 'evt-12b', owner_clinician: 'dr-b', now: T0 },
    [],
  ).task
  const forA = tasksForOwner([taskA, taskB], 'dr-a', null)
  assert('Test 12: owner queue for dr-a contains only dr-a\'s task', forA.length === 1 && forA[0].task_id === 't-12a')
  const forB = tasksForOwner([taskA, taskB], 'dr-b', null)
  assert('Test 12: owner queue for dr-b contains only dr-b\'s task', forB.length === 1 && forB[0].task_id === 't-12b')
}

/* ---------------- Test 13: stale concurrent completion conflicts ---------------- */
{
  const { task } = createCrmTask(
    { task_id: 't-13', patient_uuid: 'pt-1', episode_id: 'ep-1', task_type: 'ROUTINE', reason_code: 'CARE_GAP', source_event_id: 'evt-13', owner_clinician: null, now: T0 },
    [],
  )
  const claimed = claimTask(task, task.version, 'dr-a', T0, 60_000)
  const firstCompletion = resolveTask(claimed, claimed.version, 'CLINICIAN', T1)
  assert('Test 13: the first completion succeeds', firstCompletion.status === 'DONE')
  let conflict = false
  try {
    // a second actor, still holding the pre-completion version, tries to complete
    // the now-current (already-DONE) task using their stale expectedVersion
    resolveTask(firstCompletion, claimed.version, 'CLINICIAN', T1)
  } catch (err) {
    conflict = err instanceof CrmConflictError
  }
  assert('Test 13: a second stale-version completion conflicts rather than silently overwriting', conflict)
}

/* ---------------- Test 14: LOST -> ACTIVE with REOPENED event ---------------- */
{
  const lost = { ...makeEpisode(), status: 'LOST' }
  const reopened = reopenEpisode(lost, lost.version, T1)
  assert('Test 14: status becomes ACTIVE again', reopened.status === 'ACTIVE')
  assert('Test 14: REOPENED is recorded as an event, not a status', reopened.events.some((e) => e.type === 'REOPENED'))
  assert('Test 14: EpisodeStatus itself never holds "REOPENED"', reopened.status !== 'REOPENED')
}

/* ---------------- Test 15: herbal continuation vs new Episode requires explicit choice ---------------- */
{
  let threw = false
  try {
    resolveConsecutiveHerbalCourseEpisode(null, 'ep-current', 'ep-new')
  } catch {
    threw = true
  }
  assert('Test 15: a null choice is rejected -- CRM never auto-decides', threw)
  assert('Test 15: CONTINUE_EPISODE keeps the current episode', resolveConsecutiveHerbalCourseEpisode('CONTINUE_EPISODE', 'ep-current', 'ep-new') === 'ep-current')
  assert('Test 15: NEW_EPISODE starts the new episode', resolveConsecutiveHerbalCourseEpisode('NEW_EPISODE', 'ep-current', 'ep-new') === 'ep-new')
}

/* ---------------- Test 16: failed save leaves task not DONE ---------------- */
{
  const { task } = createCrmTask(
    { task_id: 't-16', patient_uuid: 'pt-1', episode_id: 'ep-1', task_type: 'ROUTINE', reason_code: 'CARE_GAP', source_event_id: 'evt-16', owner_clinician: null, now: T0 },
    [],
  )
  const db = { task } // simulates a caller's own committed store, mirroring how a real caller would only assign after a successful await
  let succeeded = false
  try {
    const updated = await resolveTaskWithPersistence(task, task.version, 'CLINICIAN', T1, async () => {
      throw new Error('simulated save failure')
    })
    db.task = updated // unreachable when persist() throws
    succeeded = true
  } catch {
    // expected: persist failed before the caller ever got a DONE task back
  }
  assert('Test 16: a throwing persist() fails the whole resolve attempt', succeeded === false)
  assert('Test 16: the caller\'s committed store was never assigned the DONE value', db.task.status !== 'DONE')
}

/* ---------------- Test 17: Safety snooze rejected/queue remains visible ---------------- */
{
  const { task } = createCrmTask(
    { task_id: 't-17', patient_uuid: 'pt-1', episode_id: 'ep-1', task_type: 'SAFETY_REVIEW', reason_code: 'SAFETY_REVIEW_REQUEST', source_event_id: 'evt-17', owner_clinician: null, now: T0, safetyAuthorization: { kind: 'EXPLICIT_HUMAN_REQUEST', requestedBy: 'dr-a' } },
    [],
  )
  let threw = false
  try {
    snoozeTask(task, task.version, T1)
  } catch {
    threw = true
  }
  assert('Test 17: snoozing a SAFETY_REVIEW task is rejected', threw)
  const queue = sortCrmTaskQueue([task], T0)
  assert('Test 17: the (unsnoozed) SAFETY_REVIEW task is still visible in the queue', queue.some((t) => t.task_id === 't-17'))
}

/* ---------------- Test 18: do_not_contact produces in-person handling and zero phone lookup ---------------- */
{
  const { task } = createCrmTask(
    { task_id: 't-18', patient_uuid: 'pt-1', episode_id: 'ep-1', task_type: 'CLINICAL_REVIEW', reason_code: 'CLINICIAN_REVIEW_REQUEST', source_event_id: 'evt-18', owner_clinician: null, now: T0, do_not_contact: true },
    [],
  )
  assert('Test 18: do_not_contact forces IN_PERSON_ONLY handling', task.contact_mode === 'IN_PERSON_ONLY')
  assert('Test 18: the task carries no phone field to look up in the first place', !Object.keys(task).some((k) => k.toLowerCase().includes('phone')))
  assert('Test 18: Safety state is unaffected by do_not_contact (this is a CLINICAL_REVIEW task, still OPEN)', task.status === 'OPEN')
}

/* ---------------- Test 19: expired claim lease returns to OPEN ---------------- */
{
  const { task } = createCrmTask(
    { task_id: 't-19', patient_uuid: 'pt-1', episode_id: 'ep-1', task_type: 'ROUTINE', reason_code: 'CARE_GAP', source_event_id: 'evt-19', owner_clinician: null, now: T0 },
    [],
  )
  const claimed = claimTask(task, task.version, 'dr-a', T0, 1000)
  const stillLive = releaseExpiredClaim(claimed, T0)
  assert('Test 19: a not-yet-expired claim stays CLAIMED', stillLive.status === 'CLAIMED')
  const farLater = new Date(Date.parse(T0) + 5000).toISOString()
  const released = releaseExpiredClaim(claimed, farLater)
  assert('Test 19: an expired claim returns to OPEN', released.status === 'OPEN')
  assert('Test 19: an expired claim clears claimed_by', released.claimed_by === null)
  const doneTask = { ...task, status: 'DONE', resolved_at: T0 }
  assert('Test 19: DONE tasks are unaffected by claim expiry', releaseExpiredClaim(doneTask, farLater).status === 'DONE')
}

/* ---------------- Test 20: owner absent routes Safety to configured coverage queue ---------------- */
{
  const { task } = createCrmTask(
    { task_id: 't-20', patient_uuid: 'pt-1', episode_id: 'ep-1', task_type: 'SAFETY_REVIEW', reason_code: 'SAFETY_REVIEW_REQUEST', source_event_id: 'evt-20', owner_clinician: null, now: T0, safetyAuthorization: { kind: 'EXPLICIT_HUMAN_REQUEST', requestedBy: 'dr-a' } },
    [],
  )
  assert('Test 20: an owner-absent task routes to a caller-configured coverage queue A', resolveTaskOwner(task, 'coverage-queue-A') === 'coverage-queue-A')
  assert('Test 20: the same logic routes to a different caller-configured queue B -- nothing is hardcoded', resolveTaskOwner(task, 'coverage-queue-B') === 'coverage-queue-B')
  assert('Test 20: an owned task keeps its own owner regardless of the coverage queue', resolveTaskOwner({ ...task, owner_clinician: 'dr-a' }, 'coverage-queue-A') === 'dr-a')
}

/* ---------------- Round 2 review fix: SAFETY_REVIEW refused directly at cancelTask/supersedeTask ---------------- */
{
  const { task: safety } = createCrmTask(
    { task_id: 't-r2-safety', patient_uuid: 'pt-1', episode_id: 'ep-1', task_type: 'SAFETY_REVIEW', reason_code: 'SAFETY_REVIEW_REQUEST', source_event_id: 'evt-r2-safety', owner_clinician: null, now: T0, safetyAuthorization: { kind: 'EXPLICIT_HUMAN_REQUEST', requestedBy: 'dr-a' } },
    [],
  )
  const safetyBeforeCancel = { ...safety }
  let cancelThrew = false
  try {
    cancelTask(safety)
  } catch {
    cancelThrew = true
  }
  assert('Round 2: cancelTask() refuses a SAFETY_REVIEW task directly, not only through completeEpisode', cancelThrew)
  assert('Round 2: the refused cancelTask() call left status unchanged', safety.status === safetyBeforeCancel.status)
  assert('Round 2: the refused cancelTask() call left version unchanged', safety.version === safetyBeforeCancel.version)

  const safetyBeforeSupersede = { ...safety }
  let supersedeThrew = false
  try {
    supersedeTask(safety)
  } catch {
    supersedeThrew = true
  }
  assert('Round 2: supersedeTask() refuses a SAFETY_REVIEW task directly, not only through supersedeFutureRoutineTasksOnCarePlanChange', supersedeThrew)
  assert('Round 2: the refused supersedeTask() call left status unchanged', safety.status === safetyBeforeSupersede.status)
  assert('Round 2: the refused supersedeTask() call left version unchanged', safety.version === safetyBeforeSupersede.version)

  const { task: routine } = createCrmTask(
    { task_id: 't-r2-routine', patient_uuid: 'pt-1', episode_id: 'ep-1', task_type: 'ROUTINE', reason_code: 'CARE_GAP', source_event_id: 'evt-r2-routine', owner_clinician: null, now: T0 },
    [],
  )
  assert('Round 2: cancelTask() still works normally for a non-Safety task', cancelTask(routine).status === 'CANCELLED')
  assert('Round 2: supersedeTask() still works normally for a non-Safety task', supersedeTask(routine).status === 'SUPERSEDED')

  const { task: clinicalReview } = createCrmTask(
    { task_id: 't-r2-clinical', patient_uuid: 'pt-1', episode_id: 'ep-1', task_type: 'CLINICAL_REVIEW', reason_code: 'CLINICIAN_REVIEW_REQUEST', source_event_id: 'evt-r2-clinical', owner_clinician: null, now: T0 },
    [],
  )
  assert('Round 2: the guard is SAFETY_REVIEW-specific -- CLINICAL_REVIEW may still be cancelled', cancelTask(clinicalReview).status === 'CANCELLED')
}

/* ---------------- Round 3 review fix: first_seen_at measures actual queue exposure, not creation ---------------- */
{
  const { task } = createCrmTask(
    { task_id: 't-r3-1', patient_uuid: 'pt-1', episode_id: 'ep-1', task_type: 'ROUTINE', reason_code: 'CARE_GAP', source_event_id: 'evt-r3-1', owner_clinician: null, now: T0 },
    [],
  )
  assert('Round 3: a newly created task has first_seen_at === null (created_at != first_seen_at)', task.first_seen_at === null)

  const firstView = markTaskSeen(task, task.version, T1)
  assert('Round 3: the first view sets first_seen_at', firstView.first_seen_at === T1)
  assert('Round 3: the first view bumps the version', firstView.version === task.version + 1)

  const T2 = '2026-01-03T00:00:00.000Z'
  const secondView = markTaskSeen(firstView, firstView.version, T2)
  assert('Round 3: a repeat view does not overwrite the original first_seen_at', secondView.first_seen_at === T1)
  assert('Round 3: a repeat view is a no-op -- same version, no write happened', secondView.version === firstView.version)

  let conflict = false
  try {
    // a stale caller, still holding the pre-view version, tries to mark seen again
    markTaskSeen(firstView, task.version, T2)
  } catch (err) {
    conflict = err instanceof CrmConflictError
  }
  assert('Round 3: a stale-version markTaskSeen() conflicts rather than silently overwriting', conflict)

  const { task: claimable } = createCrmTask(
    { task_id: 't-r3-2', patient_uuid: 'pt-1', episode_id: 'ep-1', task_type: 'ROUTINE', reason_code: 'CARE_GAP', source_event_id: 'evt-r3-2', owner_clinician: null, now: T0 },
    [],
  )
  const claimed = claimTask(claimable, claimable.version, 'dr-a', T1, 60_000)
  assert('Round 3: claiming a never-seen task does not itself set first_seen_at -- seeing, claiming and acknowledging are distinct', claimed.first_seen_at === null)
  assert('Round 3: claiming still sets its own acknowledged_at, unaffected by first_seen_at', claimed.acknowledged_at === T1)
}

/* ---------------- Round 4 review fix: review-open state derived from tasks, not a duplicated Episode flag ---------------- */
{
  const episodeId = 'ep-r4'

  // 1. creating a review task makes the derived state open
  const { task: clinicalTask } = createCrmTask(
    { task_id: 't-r4-clinical', patient_uuid: 'pt-1', episode_id: episodeId, task_type: 'CLINICAL_REVIEW', reason_code: 'CLINICIAN_REVIEW_REQUEST', source_event_id: 'evt-r4-clinical', owner_clinician: null, now: T0 },
    [],
  )
  const { task: safetyTask } = createCrmTask(
    { task_id: 't-r4-safety', patient_uuid: 'pt-1', episode_id: episodeId, task_type: 'SAFETY_REVIEW', reason_code: 'SAFETY_REVIEW_REQUEST', source_event_id: 'evt-r4-safety', owner_clinician: null, now: T0, safetyAuthorization: { kind: 'EXPLICIT_HUMAN_REQUEST', requestedBy: 'dr-a' } },
    [],
  )
  assert('Round 4: creating a CLINICAL_REVIEW task makes derived clinical_review_open true', isReviewOpen([clinicalTask, safetyTask], episodeId, 'CLINICAL_REVIEW'))
  assert('Round 4: creating a SAFETY_REVIEW task makes derived safety_review_open true', isReviewOpen([clinicalTask, safetyTask], episodeId, 'SAFETY_REVIEW'))
  const opened = deriveEpisodeReviewState([clinicalTask, safetyTask], episodeId)
  assert('Round 4: deriveEpisodeReviewState reports both open', opened.clinical_review_open === true && opened.safety_review_open === true)

  // 2. resolving/cancelling allowed review tasks clears it
  const resolvedClinical = resolveTask(clinicalTask, clinicalTask.version, 'CLINICIAN', T1)
  assert('Round 4: resolving the CLINICAL_REVIEW task clears clinical_review_open', isReviewOpen([resolvedClinical, safetyTask], episodeId, 'CLINICAL_REVIEW') === false)
  assert('Round 4: safety_review_open is unaffected by resolving the unrelated clinical task', isReviewOpen([resolvedClinical, safetyTask], episodeId, 'SAFETY_REVIEW') === true)

  const { task: cancellableClinical } = createCrmTask(
    { task_id: 't-r4-clinical-2', patient_uuid: 'pt-1', episode_id: episodeId, task_type: 'CLINICAL_REVIEW', reason_code: 'CLINICIAN_REVIEW_REQUEST', source_event_id: 'evt-r4-clinical-2', owner_clinician: null, now: T0 },
    [],
  )
  const cancelledClinical = cancelTask(cancellableClinical)
  assert('Round 4: cancelling a CLINICAL_REVIEW task also clears its open state', isReviewOpen([cancelledClinical], episodeId, 'CLINICAL_REVIEW') === false)

  const resolvedSafety = resolveTask(safetyTask, safetyTask.version, 'CLINICIAN', T1)
  assert('Round 4: clinician-resolving the SAFETY_REVIEW task clears safety_review_open', isReviewOpen([resolvedSafety], episodeId, 'SAFETY_REVIEW') === false)

  // 3. open SAFETY survives Episode completion
  const episodeForCompletion = makeEpisode({ episode_id: episodeId })
  const { task: openSafetyForCompletion } = createCrmTask(
    { task_id: 't-r4-safety-survives', patient_uuid: 'pt-1', episode_id: episodeId, task_type: 'SAFETY_REVIEW', reason_code: 'SAFETY_REVIEW_REQUEST', source_event_id: 'evt-r4-safety-survives', owner_clinician: null, now: T0, safetyAuthorization: { kind: 'EXPLICIT_HUMAN_REQUEST', requestedBy: 'dr-a' } },
    [],
  )
  const { episode: completedEpisode, tasks: tasksAfterCompletion } = completeEpisode(
    episodeForCompletion,
    episodeForCompletion.version,
    [openSafetyForCompletion],
    T1,
  )
  assert('Round 4: episode completion does not close the derived safety_review_open', isReviewOpen(tasksAfterCompletion, episodeId, 'SAFETY_REVIEW') === true)
  assert('Round 4: (sanity) the episode itself is COMPLETED', completedEpisode.status === 'COMPLETED')

  // 4. stale/failed writes cannot create a flag/task mismatch -- there is only one source of truth
  const { task: raceTask } = createCrmTask(
    { task_id: 't-r4-race', patient_uuid: 'pt-1', episode_id: episodeId, task_type: 'CLINICAL_REVIEW', reason_code: 'CLINICIAN_REVIEW_REQUEST', source_event_id: 'evt-r4-race', owner_clinician: null, now: T0 },
    [],
  )
  const openBeforeFailedWrite = isReviewOpen([raceTask], episodeId, 'CLINICAL_REVIEW')
  let conflict = false
  try {
    resolveTask(raceTask, raceTask.version + 1, 'CLINICIAN', T1)
  } catch (err) {
    conflict = err instanceof CrmConflictError
  }
  assert('Round 4: a stale-version resolve attempt conflicts rather than silently applying', conflict)
  assert(
    "Round 4: because review-open state has no separate flag, the failed write leaves derived state exactly as it was -- no mismatch is possible",
    isReviewOpen([raceTask], episodeId, 'CLINICAL_REVIEW') === openBeforeFailedWrite,
  )
}

/* ---------------- Extra: pauseEpisode never touches tasks (no auto-cancel on pause) ---------------- */
{
  const episode = makeEpisode()
  const paused = pauseEpisode(episode, episode.version, T1)
  assert('Extra: pausing an episode only changes its own status', paused.status === 'PAUSED')
  assert('Extra: medicationTimelineAnchor prefers start > dispensed > prescribed', medicationTimelineAnchor({ course_id: 'c', episode_id: 'e', patient_uuid: 'p', source: 's', source_id: 'c', prescribed_at: T0, dispensed_at: T1, medication_start_at: null, planned_duration_days: null, source_timestamp: T0 }) === T1)
}

console.log(`\n${passCount} CRM schema assertions passed.`)
