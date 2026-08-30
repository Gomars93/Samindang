// Audit registry regression suite (Audit registry batch). Plain node, no
// test framework: assert() prints "OK: <name>" and throws on failure --
// same convention as tests/crm-store.spec.mjs. Starts the real server via
// createApp() on an ephemeral port against a real temp data directory, then
// reads the real audit.log file it wrote (JSON Lines) -- same pattern as
// tests/server.spec.mjs's "audit log: one line per event" block.
//
// This file exists to make it structurally impossible for a future call
// site in server/index.js to write a raw event/actor string literal (which
// risks an unregistered name that logEvent() would throw on and safeAudit()
// would then silently swallow -- see server/audit.js's own header comment
// for the patient_identity_linked incident this registry was built to
// prevent) without a test failing loudly instead.
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createApp } from '../server/index.js'
import { createAuditLog, AUDIT_EVENTS, AUDIT_ACTORS, auditLogPath } from '../server/audit.js'

let passCount = 0
function assert(name, cond) {
  if (!cond) throw new Error(`FAIL: ${name}`)
  passCount++
  console.log(`OK: ${name}`)
}

async function startServer(opts) {
  const server = createApp(opts)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  return { server, base: `http://127.0.0.1:${port}` }
}

function stopServer(server) {
  return new Promise((resolve) => server.close(resolve))
}

async function readAuditLines(logPath) {
  let raw
  try {
    raw = await readFile(logPath, 'utf8')
  } catch (err) {
    if (err.code === 'ENOENT') return []
    throw err
  }
  return raw
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l))
}

const DOCTOR_TOKEN = 'audit-registry-test-token'
const AUTH_HEADERS = { 'content-type': 'application/json', 'x-doctor-token': DOCTOR_TOKEN }

async function postJson(url, body, headers = AUTH_HEADERS) {
  const res = await fetch(url, { method: 'POST', headers, body: body === undefined ? undefined : JSON.stringify(body) })
  return { status: res.status, body: await res.json() }
}

async function getJson(url, headers = AUTH_HEADERS) {
  const res = await fetch(url, { headers })
  return { status: res.status, body: await res.json() }
}

const ANSWERS = {
  targetRatings: [],
  overallChange: '좋아짐',
  newSymptomReported: false,
  newSymptomNote: '',
  adverseEffectReported: false,
  adverseEffectNote: '',
}

async function main() {
  /* =====================================================================
     Part 1: static drift-guard. This is the single most important test in
     this file -- it is what makes a FUTURE developer adding a new audit
     call site with a raw string literal (bypassing AUDIT_EVENTS/
     AUDIT_ACTORS) fail a test instead of silently risking an unregistered
     event that logEvent() throws on and safeAudit() then swallows.
     ===================================================================== */
  {
    const RAW_EVENT_LITERAL = /\bevent:\s*['"]/
    const RAW_ACTOR_LITERAL = /\bactor:\s*['"]/

    // Sanity check the regexes themselves against known-bad snippets first,
    // so a silently-broken pattern can never make the real check below
    // vacuously pass.
    assert('drift-guard: the raw-event regex actually matches a known-bad snippet', RAW_EVENT_LITERAL.test("event: 'foo'"))
    assert('drift-guard: the raw-actor regex actually matches a known-bad snippet', RAW_ACTOR_LITERAL.test("actor: 'foo'"))

    const indexSrc = await readFile(path.join(process.cwd(), 'server', 'index.js'), 'utf8')
    const rawEventMatches = indexSrc.match(new RegExp(RAW_EVENT_LITERAL, 'g')) || []
    const rawActorMatches = indexSrc.match(new RegExp(RAW_ACTOR_LITERAL, 'g')) || []
    assert('drift-guard: zero raw `event: \'...\'` string literals in server/index.js', rawEventMatches.length === 0)
    assert('drift-guard: zero raw `actor: \'...\'` string literals in server/index.js', rawActorMatches.length === 0)

    // Registry size guard: if a future round adds/removes an event or actor
    // without updating this test's requiredEvents list below, this at
    // least makes the drift visible rather than silent.
    assert('registry: AUDIT_EVENTS has exactly 37 registered event names', Object.keys(AUDIT_EVENTS).length === 37)
    assert('registry: AUDIT_ACTORS has exactly 3 registered actor names', Object.keys(AUDIT_ACTORS).length === 3)

    // Independent-review finding: the raw-literal check above only proves
    // there's no BYPASS of the registry -- it says nothing about whether a
    // *reference* to the registry is actually valid. `AUDIT_EVENTS.TYPO`
    // silently evaluates to `undefined` in plain JS (Object.freeze guards
    // writes, not reads), `ALLOWED_EVENTS.has(undefined)` is false,
    // logEvent() throws, and safeAudit() swallows it -- the exact same
    // silent-drop failure mode this whole registry exists to prevent, just
    // triggered by a typo'd property name instead of a raw string literal.
    // This check makes that class of typo loud too: every `AUDIT_EVENTS.X`/
    // `AUDIT_ACTORS.X` property actually referenced in server/index.js must
    // be a real, defined key on the registry object.
    const eventRefs = [...indexSrc.matchAll(/AUDIT_EVENTS\.([A-Z0-9_]+)/g)].map((m) => m[1])
    const actorRefs = [...indexSrc.matchAll(/AUDIT_ACTORS\.([A-Z0-9_]+)/g)].map((m) => m[1])
    assert('drift-guard: server/index.js references at least one AUDIT_EVENTS.X property (sanity, not vacuous)', eventRefs.length > 0)
    assert('drift-guard: server/index.js references at least one AUDIT_ACTORS.X property (sanity, not vacuous)', actorRefs.length > 0)
    const undefinedEventRefs = eventRefs.filter((key) => AUDIT_EVENTS[key] === undefined)
    const undefinedActorRefs = actorRefs.filter((key) => AUDIT_ACTORS[key] === undefined)
    assert(
      `drift-guard: every AUDIT_EVENTS.X property referenced in server/index.js is a real registered key (found undefined: ${undefinedEventRefs.join(', ')})`,
      undefinedEventRefs.length === 0,
    )
    assert(
      `drift-guard: every AUDIT_ACTORS.X property referenced in server/index.js is a real registered key (found undefined: ${undefinedActorRefs.join(', ')})`,
      undefinedActorRefs.length === 0,
    )
  }

  /* =====================================================================
     Part 2: per-workflow persistence proof. Drives every real HTTP
     workflow that reaches an audit call site NOT already covered by
     tests/server.spec.mjs / tests/crm-store.spec.mjs's own audit-canary
     blocks (submission_created, submission_duplicate, submission_viewed,
     status_changed, judgment_saved, visit_created, visit_activated,
     visit_cleared, patient_identity_linked), then confirms the matching
     audit.log line exists with only the allowed 6 keys.
     ===================================================================== */
  const dataRoot = await mkdtemp(path.join(tmpdir(), 'samindang-audit-workflows-'))
  const dataDir = path.join(dataRoot, 'submissions')
  const crmDir = path.join(dataRoot, 'crm')
  const { server, base } = await startServer({ dataDir, doctorToken: DOCTOR_TOKEN })
  try {
    /* ---- Station lifecycle: register, assign, reset, assign again,
       submit through it, complete ---- */
    const stationPatient = (await postJson(`${base}/api/visits`, {})).body
    const stationReg = (await postJson(`${base}/api/stations`, { name: '감사 테스트 스테이션' })).body
    const stationCred = stationReg.credential
    const stationId = stationReg.station.station_id

    const assign1 = await postJson(`${base}/api/stations/${stationId}/assign`, {
      patient_id: stationPatient.patient_id,
      delivery_mode: 'CLINIC_TABLET',
    })
    assert('workflow setup: station assign 1 -> 201', assign1.status === 201)

    const reset1 = await postJson(`${base}/api/stations/${stationId}/reset`, {})
    assert('workflow setup: station reset -> 200', reset1.status === 200)

    const assign2 = await postJson(`${base}/api/stations/${stationId}/assign`, {
      patient_id: stationPatient.patient_id,
      delivery_mode: 'CLINIC_TABLET',
    })
    assert('workflow setup: station assign 2 (after reset) -> 201', assign2.status === 201)

    const pollBody = await (await fetch(`${base}/api/station/assignment`, { headers: { 'x-station-credential': stationCred } })).json()
    assert('workflow setup: station poll reports ASSIGNED with a token', pollBody.status === 'ASSIGNED' && typeof pollBody.token === 'string')

    const submitRes = await fetch(`${base}/api/follow-up-session/${pollBody.token}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(ANSWERS),
    })
    assert('workflow setup: patient submits through the station-delivered token -> 201', submitRes.status === 201)

    const completeRes = await fetch(`${base}/api/station/complete`, { method: 'POST', headers: { 'x-station-credential': stationCred } })
    assert('workflow setup: station reports completion -> 200', completeRes.status === 200)

    /* ---- Follow-up session lifecycle: issue, reissue, invalidate ---- */
    const fusVisit = (await postJson(`${base}/api/visits`, {})).body
    const fusStart = (await postJson(`${base}/api/patients/${fusVisit.patient_id}/start-revisit`, { delivery_mode: 'PERSONAL_QR' })).body
    const fusReissue = await postJson(`${base}/api/visits/${fusStart.visit.id}/follow-up-session/reissue`, undefined)
    assert('workflow setup: follow-up-session reissue -> 200', fusReissue.status === 200)
    const fusInvalidate = await postJson(`${base}/api/visits/${fusStart.visit.id}/follow-up-session/invalidate`, undefined)
    assert('workflow setup: follow-up-session invalidate -> 200', fusInvalidate.status === 200)

    /* ---- Recorder result save ---- */
    const recorderVisit = (await postJson(`${base}/api/visits`, {})).body
    const recorderRes = await fetch(`${base}/api/visits/${recorderVisit.id}/recorder-results`, {
      method: 'POST',
      headers: AUTH_HEADERS,
      body: JSON.stringify({
        recording_id: 'audit-test-rec-1',
        transcript: '환자: 테스트 중입니다.',
        structured_note: null,
        source: { workstation_id: 'AUDIT-TEST' },
      }),
    })
    assert('workflow setup: recorder-results POST -> 201', recorderRes.status === 201)

    /* ---- Micro follow-up save (doctor-guarded direct save path) ---- */
    const microVisit = (await postJson(`${base}/api/visits`, {})).body
    const microRes = await fetch(`${base}/api/visits/${microVisit.id}/micro-follow-up`, {
      method: 'POST',
      headers: AUTH_HEADERS,
      body: JSON.stringify(ANSWERS),
    })
    assert('workflow setup: micro-follow-up direct save -> 201', microRes.status === 201)

    /* ---- Workspace save (submission) + visit workspace save (revisit) ---- */
    const submissionRes = await fetch(`${base}/api/submissions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ questionnaire_version: '1.0', session_id: 'audit-workflow-workspace', responses: { patient: {} } }),
    })
    const submission = await submissionRes.json()
    const workspaceRes = await fetch(`${base}/api/submissions/${submission.id}/workspace`, {
      method: 'PUT',
      headers: AUTH_HEADERS,
      body: JSON.stringify({ note: 'audit test workspace' }),
    })
    assert('workflow setup: submission workspace PUT -> 200', workspaceRes.status === 200)

    const visitWsPatient = (await postJson(`${base}/api/visits`, {})).body
    const visitWsStart = (await postJson(`${base}/api/patients/${visitWsPatient.patient_id}/start-revisit`, {})).body
    const visitWorkspaceRes = await fetch(`${base}/api/visits/${visitWsStart.visit.id}/workspace`, {
      method: 'PUT',
      headers: AUTH_HEADERS,
      body: JSON.stringify({ note: 'audit test visit workspace' }),
    })
    assert('workflow setup: visit workspace PUT -> 200', visitWorkspaceRes.status === 200)

    /* ---- CRM episode lifecycle: create, pause, complete, reopen ----
       reopenEpisode (src/crm/episode.ts) only accepts a LOST episode, and
       no HTTP route in this codebase ever sets an episode to LOST (there is
       no "mark lost" route yet) -- pause/complete/reopen are the only three
       transition routes that exist. To exercise the reopen AUDIT CALL SITE
       itself (the thing this file is actually testing -- not the episode
       state machine, which is already covered by src/crm's own unit tests)
       this seeds LOST directly onto the on-disk Episode file between the
       complete and reopen calls, exactly the same "write the store's own
       on-disk shape directly" technique tests/crm-store.spec.mjs already
       uses for its legacy-pointer-upgrade tests. This is not fabricating a
       passing assertion -- the reopen call itself, and the audit line it
       writes, are both genuinely exercised through the real HTTP route. */
    const crmPatient = (await postJson(`${base}/api/visits`, {})).body
    const episodeCreate = await postJson(`${base}/api/crm/episodes`, { patient_uuid: crmPatient.patient_id })
    assert('workflow setup: crm episode create -> 201', episodeCreate.status === 201)
    const episode = episodeCreate.body
    const episodePause = await postJson(`${base}/api/crm/episodes/${episode.episode_id}/pause`, { expectedVersion: episode.version })
    assert('workflow setup: crm episode pause -> 200', episodePause.status === 200)
    const episodeComplete = await postJson(`${base}/api/crm/episodes/${episode.episode_id}/complete`, { expectedVersion: episodePause.body.version })
    assert('workflow setup: crm episode complete -> 200', episodeComplete.status === 200)
    // completeEpisodeStored's HTTP response is { episode, tasks } (it may
    // also cancel ROUTINE tasks under the episode) -- not the bare episode
    // the pause/reopen routes return.
    assert('workflow setup: completed episode status is COMPLETED', episodeComplete.body.episode.status === 'COMPLETED')

    const episodeFilePath = path.join(crmDir, 'episodes', `${episode.episode_id}.json`)
    const onDiskEpisode = JSON.parse(await readFile(episodeFilePath, 'utf8'))
    assert('workflow setup: on-disk episode matches the completed version before the LOST seed', onDiskEpisode.version === episodeComplete.body.episode.version)
    onDiskEpisode.status = 'LOST'
    await writeFile(episodeFilePath, JSON.stringify(onDiskEpisode, null, 2), 'utf8')
    const episodeReopen = await postJson(`${base}/api/crm/episodes/${episode.episode_id}/reopen`, { expectedVersion: onDiskEpisode.version })
    assert('workflow setup: crm episode reopen (after seeding LOST on disk) -> 200', episodeReopen.status === 200)
    assert('workflow setup: reopened episode is ACTIVE again', episodeReopen.body.status === 'ACTIVE')

    /* ---- CRM task lifecycle A: create -> claim -> seen -> resolve ---- */
    const taskEpisode = (await postJson(`${base}/api/crm/episodes`, { patient_uuid: crmPatient.patient_id })).body
    const t1 = (
      await postJson(`${base}/api/crm/tasks`, {
        patient_uuid: crmPatient.patient_id,
        episode_id: taskEpisode.episode_id,
        task_type: 'ROUTINE',
        reason_code: 'REASSESSMENT_DUE',
        source_event_id: 'evt-audit-lifecycle-1',
      })
    ).body.task
    const claimed = (await postJson(`${base}/api/crm/tasks/${t1.task_id}/claim`, { expectedVersion: t1.version, claimedBy: 'audit-test-clinician' })).body
    assert('workflow setup: task claim -> CLAIMED', claimed.status === 'CLAIMED')
    const seen = (await postJson(`${base}/api/crm/tasks/${t1.task_id}/seen`, { expectedVersion: claimed.version })).body
    const resolved = (await postJson(`${base}/api/crm/tasks/${t1.task_id}/resolve`, { expectedVersion: seen.version })).body
    assert('workflow setup: task resolve -> DONE', resolved.status === 'DONE')

    /* ---- CRM task lifecycle B/C/D: fresh tasks for snooze/cancel/supersede
       (the task state machine does not allow e.g. resolving AND cancelling
       the same task, so each of these three gets its own freshly-created
       ROUTINE task rather than reusing t1 above). ---- */
    const t2 = (
      await postJson(`${base}/api/crm/tasks`, {
        patient_uuid: crmPatient.patient_id,
        episode_id: taskEpisode.episode_id,
        task_type: 'ROUTINE',
        reason_code: 'REASSESSMENT_DUE',
        source_event_id: 'evt-audit-lifecycle-snooze',
      })
    ).body.task
    const snoozed = await postJson(`${base}/api/crm/tasks/${t2.task_id}/snooze`, { expectedVersion: t2.version, until: '2099-01-01T00:00:00.000Z' })
    assert('workflow setup: task snooze -> SNOOZED', snoozed.body.status === 'SNOOZED')

    const t3 = (
      await postJson(`${base}/api/crm/tasks`, {
        patient_uuid: crmPatient.patient_id,
        episode_id: taskEpisode.episode_id,
        task_type: 'ROUTINE',
        reason_code: 'REASSESSMENT_DUE',
        source_event_id: 'evt-audit-lifecycle-cancel',
      })
    ).body.task
    const cancelled = await postJson(`${base}/api/crm/tasks/${t3.task_id}/cancel`, { expectedVersion: t3.version })
    assert('workflow setup: task cancel -> CANCELLED', cancelled.body.status === 'CANCELLED')

    const t4 = (
      await postJson(`${base}/api/crm/tasks`, {
        patient_uuid: crmPatient.patient_id,
        episode_id: taskEpisode.episode_id,
        task_type: 'ROUTINE',
        reason_code: 'REASSESSMENT_DUE',
        source_event_id: 'evt-audit-lifecycle-supersede',
      })
    ).body.task
    const superseded = await postJson(`${base}/api/crm/tasks/${t4.task_id}/supersede`, { expectedVersion: t4.version })
    assert('workflow setup: task supersede -> SUPERSEDED', superseded.body.status === 'SUPERSEDED')

    /* ---- Medication/Herbal-course lifecycle: create course -> check-task -> shift-start ---- */
    const medCourse = (
      await postJson(`${base}/api/crm/medication-courses`, {
        episode_id: taskEpisode.episode_id,
        source: 'audit-test-manual',
        source_id: 'audit-src-1',
        source_timestamp: '2026-01-01T00:00:00.000Z',
        medication_start_at: '2026-01-01',
      })
    ).body.course
    assert('workflow setup: medication course create -> version 1', medCourse.version === 1)
    const medCheckTask = await postJson(`${base}/api/crm/medication-courses/${medCourse.course_id}/check-tasks`, {
      expectedVersion: medCourse.version,
      reason_code: 'MEDICATION_START_CHECK',
      due_at: '2026-01-08',
    })
    assert('workflow setup: medication course check-task create -> 201', medCheckTask.status === 201)
    const medShift = await postJson(`${base}/api/crm/medication-courses/${medCourse.course_id}/shift-start`, {
      expectedVersion: medCourse.version,
      medication_start_at: '2026-01-03',
      replacement_due_dates: [],
    })
    assert('workflow setup: medication course shift-start -> version 2', medShift.body.course.version === 2)
    assert('workflow setup: medication course shift-start supersedes the open check task', medShift.body.superseded.length === 1)

    /* ---- Independent-review fix verification (Medication/Herbal-course
       batch): a malformed or duplicated replacement_due_dates entry used
       to be silently filtered out while the request still returned 200
       (already superseding the open task and losing the clinician's
       explicit reschedule). Both are now rejected with 400 before
       anything is superseded. ---- */
    const medShiftMissingDueAt = await postJson(`${base}/api/crm/medication-courses/${medCourse.course_id}/shift-start`, {
      expectedVersion: medShift.body.course.version,
      medication_start_at: '2026-01-05',
      replacement_due_dates: [{ reason_code: 'MEDICATION_START_CHECK' }],
    })
    assert('review-fix: shift-start with a missing due_at -> 400', medShiftMissingDueAt.status === 400)
    const medCourseAfterBadShift = await getJson(`${base}/api/crm/medication-courses/${medCourse.course_id}`)
    assert(
      'review-fix: the rejected shift-start left the course version unchanged',
      medCourseAfterBadShift.body.version === medShift.body.course.version,
    )

    /* ---- Closing-review fix verification (HIGH): coercing a non-array
       replacement_due_dates straight to [] made the two validation
       checks above pass VACUOUSLY (an empty array's .every()/.size
       trivially satisfy them), so a caller that sends the single
       replacement object instead of wrapping it in an array -- a classic
       client bug -- used to still get 200 with the open task already
       superseded and zero replacements created. Only an absent/null value
       may mean "no replacements"; anything else non-array is rejected. ---- */
    const medShiftNonArrayReplacements = await postJson(`${base}/api/crm/medication-courses/${medCourse.course_id}/shift-start`, {
      expectedVersion: medShift.body.course.version,
      medication_start_at: '2026-01-05',
      replacement_due_dates: { reason_code: 'MEDICATION_MID_CHECK', due_at: '2026-02-10' },
    })
    assert('review-fix: shift-start with a non-array replacement_due_dates -> 400', medShiftNonArrayReplacements.status === 400)
    const medCourseAfterNonArrayShift = await getJson(`${base}/api/crm/medication-courses/${medCourse.course_id}`)
    assert(
      'review-fix: the rejected non-array shift-start left the course version unchanged (nothing was superseded)',
      medCourseAfterNonArrayShift.body.version === medShift.body.course.version,
    )

    const medShiftDupReason = await postJson(`${base}/api/crm/medication-courses/${medCourse.course_id}/shift-start`, {
      expectedVersion: medShift.body.course.version,
      medication_start_at: '2026-01-05',
      replacement_due_dates: [
        { reason_code: 'MEDICATION_MID_CHECK', due_at: '2026-01-20' },
        { reason_code: 'MEDICATION_MID_CHECK', due_at: '2026-01-21' },
      ],
    })
    assert('review-fix: shift-start with a duplicated reason_code -> 400', medShiftDupReason.status === 400)

    /* ---- Independent-review fix verification: do_not_contact on a
       MedicationCourse check-task now flows through to the created
       CrmTask's contact_mode (it silently defaulted to OUTBOUND_ALLOWED
       before, with no way to mark an in-person-only check). ---- */
    const medCheckTaskDnc = await postJson(`${base}/api/crm/medication-courses/${medCourse.course_id}/check-tasks`, {
      expectedVersion: medShift.body.course.version,
      reason_code: 'MEDICATION_END_CHECK',
      due_at: '2026-02-01',
      do_not_contact: true,
    })
    assert('review-fix: medication check-task create with do_not_contact -> 201', medCheckTaskDnc.status === 201)
    assert('review-fix: the created task has contact_mode IN_PERSON_ONLY', medCheckTaskDnc.body.task.contact_mode === 'IN_PERSON_ONLY')

    /* ---- Independent-review fix verification: a concurrent check-task
       create and shift-start against the same course used to race (no
       shared lock at all) -- both could read the same expectedVersion and
       both succeed, leaving a check-task un-superseded by a shift that
       just moved the start date out from under it. Sharing a lock
       serializes the two calls, which has exactly two correct outcomes
       depending only on acquisition order (see the equivalent store-level
       proof in tests/medication-course.spec.mjs Part 4b): if shift wins
       the lock first, the check-task-create must then see the POST-shift
       version and conflict (409); if the check-task-create wins first, it
       must succeed AND the shift that runs after it must actually
       supersede it -- it must never come back OPEN once a shift with a
       later start date has completed. ---- */
    const raceBase = await getJson(`${base}/api/crm/medication-courses/${medCourse.course_id}`)
    const [raceCheckTask, raceShift] = await Promise.all([
      postJson(`${base}/api/crm/medication-courses/${medCourse.course_id}/check-tasks`, {
        expectedVersion: raceBase.body.version,
        reason_code: 'MEDICATION_MID_CHECK',
        due_at: '2026-03-01',
      }),
      postJson(`${base}/api/crm/medication-courses/${medCourse.course_id}/shift-start`, {
        expectedVersion: raceBase.body.version,
        medication_start_at: '2026-01-06',
        replacement_due_dates: [],
      }),
    ])
    assert('review-fix: shift-start in the race always succeeds regardless of acquisition order', raceShift.status === 200)
    assert(
      'review-fix: the concurrent check-task-create either conflicts (shift won the lock first) or succeeds (201)',
      raceCheckTask.status === 409 || raceCheckTask.status === 201,
    )
    if (raceCheckTask.status === 201) {
      const raceTaskAfter = await getJson(`${base}/api/crm/tasks/${raceCheckTask.body.task.task_id}`)
      assert(
        'review-fix: if the check-task-create won the lock first, the subsequent shift genuinely supersedes it -- never left OPEN after a shift with a later start date',
        raceTaskAfter.body.status === 'SUPERSEDED',
      )
    }

    /* ---- Independent-review fix verification: a duplicate course-create
       call (same episode/source/source_id) dedupes and must NOT re-emit
       CRM_MEDICATION_COURSE_CREATED -- checked against the audit log
       further below. ---- */
    const medCourseDup = await postJson(`${base}/api/crm/medication-courses`, {
      episode_id: taskEpisode.episode_id,
      source: 'audit-test-manual',
      source_id: 'audit-src-1',
      source_timestamp: '2026-01-01T00:00:00.000Z',
      medication_start_at: '1999-01-01',
    })
    assert('review-fix: duplicate course create -> deduped:true', medCourseDup.body.deduped === true)

    /* ---- Quick Revisit messaging lifecycle: queue -> retry -> cancel.
       Phone ends in '9998' -- solapiAdapter.js's mock transport treats that
       suffix as a deterministic RETRYABLE transient failure on every
       channel, so the message stays QUEUED (not SENT) after both the
       initial attempt and the manual retry, which is exactly what lets a
       single message reach cancelMessage's QUEUED-only guard afterward. ---- */
    const msgVisit = (await postJson(`${base}/api/visits`, {})).body
    const msgStart = (await postJson(`${base}/api/patients/${msgVisit.patient_id}/start-revisit`, {})).body
    const msgQueue = await postJson(`${base}/api/visits/${msgStart.visit.id}/messages`, {
      patient_id: msgVisit.patient_id,
      phone: '01000009998',
      follow_up_token: msgStart.token,
      // 2nd independent-review finding (MEDIUM, messaging batch): the queue
      // route now requires link's own embedded #follow-up= token to equal
      // follow_up_token exactly -- must reuse msgStart.token, not an
      // arbitrary placeholder.
      link: `https://example.invalid/#follow-up=${msgStart.token}`,
    })
    assert('workflow setup: message queue -> 201', msgQueue.status === 201)
    assert('workflow setup: message stays QUEUED after a mock transient-failure first attempt', msgQueue.body.status === 'QUEUED')
    const msgRetry = await postJson(`${base}/api/messages/${msgQueue.body.message_id}/retry`, {
      phone: '01000009998',
      // BizM-batch independent-review finding (MEDIUM): retry now verifies
      // the link's own follow-up token actually resolves to this message's
      // visit_id (see server/index.js) -- must reuse the real msgStart.token
      // issued for msgStart.visit.id, not an arbitrary never-issued value.
      link: `https://example.invalid/#follow-up=${msgStart.token}`,
    })
    assert('workflow setup: message retry -> 200', msgRetry.status === 200)
    assert('workflow setup: message still QUEUED after a second mock transient failure', msgRetry.body.status === 'QUEUED')
    const msgCancel = await postJson(`${base}/api/messages/${msgQueue.body.message_id}/cancel`, undefined)
    assert('workflow setup: message cancel -> 200', msgCancel.status === 200)
    assert('workflow setup: cancelled message status is CANCELLED', msgCancel.body.status === 'CANCELLED')

    /* ---- Now read audit.log and confirm every workflow above produced its
       matching event. The pre-existing 9 events (submission_created,
       submission_duplicate, submission_viewed, status_changed,
       judgment_saved, visit_created, visit_activated, visit_cleared,
       patient_identity_linked) already have coverage in
       tests/server.spec.mjs / tests/crm-store.spec.mjs and are not
       re-tested here -- these are the remaining 28. ---- */
    const lines = await readAuditLines(auditLogPath(dataDir))
    const hasEvent = (ev) => lines.some((l) => l.event === ev)

    const requiredEvents = [
      AUDIT_EVENTS.WORKSPACE_SAVED,
      AUDIT_EVENTS.VISIT_WORKSPACE_SAVED,
      AUDIT_EVENTS.STATION_REGISTERED,
      AUDIT_EVENTS.STATION_ASSIGNED,
      AUDIT_EVENTS.STATION_RESET,
      AUDIT_EVENTS.STATION_COMPLETED,
      AUDIT_EVENTS.FOLLOW_UP_SESSION_ISSUED,
      AUDIT_EVENTS.FOLLOW_UP_SESSION_REISSUED,
      AUDIT_EVENTS.FOLLOW_UP_SESSION_INVALIDATED,
      AUDIT_EVENTS.FOLLOW_UP_SESSION_SUBMITTED,
      AUDIT_EVENTS.RECORDER_RESULT_SAVED,
      AUDIT_EVENTS.MICRO_FOLLOW_UP_SAVED,
      AUDIT_EVENTS.CRM_EPISODE_CREATED,
      AUDIT_EVENTS.CRM_EPISODE_PAUSED,
      AUDIT_EVENTS.CRM_EPISODE_COMPLETED,
      AUDIT_EVENTS.CRM_EPISODE_REOPENED,
      AUDIT_EVENTS.CRM_TASK_CREATED,
      AUDIT_EVENTS.CRM_TASK_RESOLVED,
      AUDIT_EVENTS.CRM_TASK_SNOOZED,
      AUDIT_EVENTS.CRM_TASK_CANCELLED,
      AUDIT_EVENTS.CRM_TASK_SUPERSEDED,
      AUDIT_EVENTS.CRM_TASK_CLAIMED,
      AUDIT_EVENTS.CRM_TASK_SEEN,
      AUDIT_EVENTS.CRM_MEDICATION_COURSE_CREATED,
      AUDIT_EVENTS.CRM_MEDICATION_COURSE_START_SHIFTED,
      AUDIT_EVENTS.MESSAGE_QUEUED,
      AUDIT_EVENTS.MESSAGE_RETRIED,
      AUDIT_EVENTS.MESSAGE_CANCELLED,
    ]
    assert('workflow: exactly 28 events are asserted here (the 37-event registry minus the 9 already covered elsewhere)', requiredEvents.length === 28)
    for (const ev of requiredEvents) {
      assert(`workflow: ${ev} appears at least once in audit.log`, hasEvent(ev))
    }

    // Independent-review fix verification: exactly one real
    // MedicationCourse was ever created in this whole run (the later
    // duplicate create call above deduped) -- CRM_MEDICATION_COURSE_CREATED
    // must appear exactly once, never re-emitted on a dedup replay.
    assert(
      'review-fix: CRM_MEDICATION_COURSE_CREATED appears exactly once (the duplicate create above never re-emits it)',
      lines.filter((l) => l.event === AUDIT_EVENTS.CRM_MEDICATION_COURSE_CREATED).length === 1,
    )

    // Minimal-fields contract holds for every line this run produced, not
    // just the ones this file specifically drove.
    const allowedKeys = new Set(['ts', 'event', 'submission_id', 'actor', 'status', 'visit_id'])
    assert(
      'workflow: every audit.log line has only the allowed 6 keys',
      lines.length > 0 && lines.every((l) => Object.keys(l).every((k) => allowedKeys.has(k))),
    )
    assert(
      'workflow: every audit.log line has a valid ISO ts',
      lines.every((l) => typeof l.ts === 'string' && !Number.isNaN(Date.parse(l.ts))),
    )

    // recorder_result_saved specifics: actor is the newly-registered
    // 'recorder' actor (previously invalid -> always thrown -> always
    // swallowed by safeAudit, so this event never actually reached
    // audit.log before this batch), and recording_id must never appear --
    // logEvent's destructuring silently drops any key outside its fixed 6.
    const recorderLines = lines.filter((l) => l.event === AUDIT_EVENTS.RECORDER_RESULT_SAVED)
    assert('recorder_result_saved: at least one line was written', recorderLines.length > 0)
    assert('recorder_result_saved: actor is AUDIT_ACTORS.RECORDER on every line', recorderLines.every((l) => l.actor === AUDIT_ACTORS.RECORDER))
    assert('recorder_result_saved: no recording_id key on any line', recorderLines.every((l) => !('recording_id' in l)))

    // station_completed specifics: actor is patient (the tablet reporting
    // on the patient's behalf), not doctor.
    const stationCompletedLines = lines.filter((l) => l.event === AUDIT_EVENTS.STATION_COMPLETED)
    assert('station_completed: actor is AUDIT_ACTORS.PATIENT', stationCompletedLines.every((l) => l.actor === AUDIT_ACTORS.PATIENT))
  } finally {
    await stopServer(server)
    await rm(dataRoot, { recursive: true, force: true })
  }

  /* =====================================================================
     Part 3: unknown/malformed event contract -- logEvent() throws on an
     unregistered event or actor name, and writes nothing to disk when it
     does.
     ===================================================================== */
  {
    const tmpRoot = await mkdtemp(path.join(tmpdir(), 'samindang-audit-unknown-'))
    try {
      const dataDir = path.join(tmpRoot, 'submissions')
      const audit = createAuditLog(dataDir)

      let eventThrew = false
      try {
        await audit.logEvent({ event: 'not_a_real_event', actor: AUDIT_ACTORS.DOCTOR, submission_id: 'x' })
      } catch (err) {
        eventThrew = err instanceof Error && err.message.includes('invalid audit event')
      }
      assert('logEvent throws on an unregistered event name', eventThrew)

      let actorThrew = false
      try {
        await audit.logEvent({ event: AUDIT_EVENTS.SUBMISSION_VIEWED, actor: 'nurse', submission_id: 'x' })
      } catch (err) {
        actorThrew = err instanceof Error && err.message.includes('invalid audit actor')
      }
      assert('logEvent throws on an unregistered actor name', actorThrew)

      const linesAfterFailedAttempts = await readAuditLines(auditLogPath(dataDir))
      assert('a failed logEvent call writes nothing to audit.log', linesAfterFailedAttempts.length === 0)
    } finally {
      await rm(tmpRoot, { recursive: true, force: true })
    }
  }

  /* ---- HTTP boundary: a genuine internal audit write failure never
     surfaces to the client or breaks the request. Forces a REAL failure
     (no product code touched) by pre-creating a directory at audit.log's
     own path, so every appendFile() inside logEvent() genuinely throws
     (EISDIR) -- this is exactly the failure safeAudit()'s try/catch in
     server/index.js is documented to swallow. ---- */
  {
    const tmpRoot = await mkdtemp(path.join(tmpdir(), 'samindang-audit-blocked-'))
    try {
      const dataDir = path.join(tmpRoot, 'submissions')
      await mkdir(auditLogPath(dataDir), { recursive: true })
      const { server, base } = await startServer({ dataDir })
      try {
        const res = await fetch(`${base}/api/submissions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ questionnaire_version: '1.0', session_id: 'audit-blocked-1', responses: { patient: {} } }),
        })
        assert('a request whose audit write genuinely fails (EISDIR) still succeeds at the HTTP boundary', res.status === 201)
        const body = await res.json()
        assert('...and returns a normal, complete response body', typeof body.id === 'string' && typeof body.created_at === 'string')
      } finally {
        await stopServer(server)
      }
    } finally {
      await rm(tmpRoot, { recursive: true, force: true })
    }
  }

  /* =====================================================================
     Part 4: retry/dedup semantics -- a legitimate client retry that a
     store's own dedup guard replays must never double-write the audit
     line for the underlying event.
     ===================================================================== */
  {
    const tmpRoot = await mkdtemp(path.join(tmpdir(), 'samindang-audit-dedup-task-'))
    const dataDir = path.join(tmpRoot, 'submissions')
    const { server, base } = await startServer({ dataDir, doctorToken: DOCTOR_TOKEN })
    try {
      const visit = (await postJson(`${base}/api/visits`, {})).body
      const episode = (await postJson(`${base}/api/crm/episodes`, { patient_uuid: visit.patient_id })).body
      const beforeLines = await readAuditLines(auditLogPath(dataDir))
      const beforeCount = beforeLines.filter((l) => l.event === AUDIT_EVENTS.CRM_TASK_CREATED).length

      const taskBody = {
        patient_uuid: visit.patient_id,
        episode_id: episode.episode_id,
        task_type: 'ROUTINE',
        reason_code: 'REASSESSMENT_DUE',
        source_event_id: 'evt-audit-dedup-task',
      }
      const first = await postJson(`${base}/api/crm/tasks`, taskBody)
      const second = await postJson(`${base}/api/crm/tasks`, taskBody)
      assert('dedup setup: first create is NOT deduped', first.body.deduped === false)
      assert('dedup setup: second create with identical dedup fields IS deduped', second.body.deduped === true)

      const afterLines = await readAuditLines(auditLogPath(dataDir))
      const afterCount = afterLines.filter((l) => l.event === AUDIT_EVENTS.CRM_TASK_CREATED).length
      assert('dedup: exactly ONE crm_task_created audit line for two dedup-identical create calls', afterCount - beforeCount === 1)
    } finally {
      await stopServer(server)
      await rm(tmpRoot, { recursive: true, force: true })
    }
  }

  {
    const tmpRoot = await mkdtemp(path.join(tmpdir(), 'samindang-audit-dedup-revisit-'))
    const dataDir = path.join(tmpRoot, 'submissions')
    const { server, base } = await startServer({ dataDir, doctorToken: DOCTOR_TOKEN })
    try {
      const visit = (await postJson(`${base}/api/visits`, {})).body
      const patientId = visit.patient_id

      // Fired back-to-back with no delay, well inside the store's default
      // 5s dedup window (server/store.js's startRevisitDedupWindowMs).
      const [r1, r2] = await Promise.all([
        postJson(`${base}/api/patients/${patientId}/start-revisit`, { delivery_mode: 'PERSONAL_QR' }),
        postJson(`${base}/api/patients/${patientId}/start-revisit`, { delivery_mode: 'PERSONAL_QR' }),
      ])
      assert('revisit-start dedup: both calls resolve to the SAME visit', r1.body.visit.id === r2.body.visit.id)
      const revisitVisitId = r1.body.visit.id

      const lines = await readAuditLines(auditLogPath(dataDir))
      const visitCreatedCount = lines.filter((l) => l.event === AUDIT_EVENTS.VISIT_CREATED && l.visit_id === revisitVisitId).length
      const issuedCount = lines.filter((l) => l.event === AUDIT_EVENTS.FOLLOW_UP_SESSION_ISSUED && l.visit_id === revisitVisitId).length
      assert('revisit-start dedup: exactly ONE visit_created line for this revisit visit', visitCreatedCount === 1)
      assert('revisit-start dedup: exactly ONE follow_up_session_issued line for this revisit visit', issuedCount === 1)
    } finally {
      await stopServer(server)
      await rm(tmpRoot, { recursive: true, force: true })
    }
  }

  /* =====================================================================
     Part 5: concurrent-write safety -- many audit-generating requests
     fired in parallel must land as exactly that many clean, individually
     parseable JSON lines, never truncated or interleaved.
     ===================================================================== */
  {
    const tmpRoot = await mkdtemp(path.join(tmpdir(), 'samindang-audit-concurrent-'))
    const dataDir = path.join(tmpRoot, 'submissions')
    const { server, base } = await startServer({ dataDir, doctorToken: DOCTOR_TOKEN })
    try {
      const submissionRes = await fetch(`${base}/api/submissions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ questionnaire_version: '1.0', session_id: 'audit-concurrent-1', responses: { patient: {} } }),
      })
      const sub = await submissionRes.json()

      const beforeLines = await readAuditLines(auditLogPath(dataDir))
      const beforeCount = beforeLines.length

      const N = 50
      const results = await Promise.all(
        Array.from({ length: N }, () => fetch(`${base}/api/submissions/${sub.id}`, { headers: AUTH_HEADERS })),
      )
      assert('concurrent: all 50 concurrent GETs succeeded', results.every((r) => r.status === 200))

      const rawAfter = await readFile(auditLogPath(dataDir), 'utf8')
      const rawLines = rawAfter.trim().split('\n').filter(Boolean)
      assert(
        'concurrent: every single line in audit.log parses as clean JSON (no truncation/interleaving)',
        rawLines.every((l) => {
          try {
            JSON.parse(l)
            return true
          } catch {
            return false
          }
        }),
      )
      const afterLines = rawLines.map((l) => JSON.parse(l))
      assert('concurrent: exactly N new audit lines were appended for N concurrent audited requests', afterLines.length - beforeCount === N)
      const newSubmissionViewedCount = afterLines.filter((l) => l.event === AUDIT_EVENTS.SUBMISSION_VIEWED && l.submission_id === sub.id).length
      assert('concurrent: all N new lines are the expected submission_viewed event for this id', newSubmissionViewedCount === N)
    } finally {
      await stopServer(server)
      await rm(tmpRoot, { recursive: true, force: true })
    }
  }

  /* =====================================================================
     Part 6: Episode↔Medication association integrity batch -- HTTP-level
     retry-idempotency for episode creation. A client-minted episode_id
     replayed across a lost-response retry must converge to ONE episode
     (201 then 200) and exactly ONE crm_episode_created audit line, never
     two, mirroring the store-level coverage in tests/crm-store.spec.mjs.
     ===================================================================== */
  {
    const tmpRoot = await mkdtemp(path.join(tmpdir(), 'samindang-audit-episode-retry-'))
    const dataDir = path.join(tmpRoot, 'submissions')
    const { server, base } = await startServer({ dataDir, doctorToken: DOCTOR_TOKEN })
    try {
      const visit = (await postJson(`${base}/api/visits`, {})).body
      const episodeId = 'audit-http-retry-episode-1'

      const beforeLines = await readAuditLines(auditLogPath(dataDir))
      const beforeCount = beforeLines.filter((l) => l.event === AUDIT_EVENTS.CRM_EPISODE_CREATED).length

      const first = await postJson(`${base}/api/crm/episodes`, { patient_uuid: visit.patient_id, episode_id: episodeId })
      const second = await postJson(`${base}/api/crm/episodes`, { patient_uuid: visit.patient_id, episode_id: episodeId })
      assert('episode-retry (HTTP): first client-minted-id create -> 201', first.status === 201)
      assert('episode-retry (HTTP): retry with the same client-minted id -> 200', second.status === 200)
      assert('episode-retry (HTTP): both responses are the SAME episode_id', first.body.episode_id === second.body.episode_id)
      assert('episode-retry (HTTP): both responses report the same created_at (no overwrite on retry)', first.body.created_at === second.body.created_at)

      const afterLines = await readAuditLines(auditLogPath(dataDir))
      const afterCount = afterLines.filter((l) => l.event === AUDIT_EVENTS.CRM_EPISODE_CREATED).length
      assert('episode-retry (HTTP): exactly ONE crm_episode_created audit line for two retried create calls', afterCount - beforeCount === 1)
    } finally {
      await stopServer(server)
      await rm(tmpRoot, { recursive: true, force: true })
    }
  }

  /* =====================================================================
     Part 7: Episode↔Medication association integrity batch -- cross-patient
     ownership rejection. A MedicationCourse create request whose declared
     patient_uuid does not match the target episode's own patient_uuid must
     be rejected fail-closed (409), with zero course/dedup writes and zero
     crm_medication_course_created audit line.
     ===================================================================== */
  {
    const tmpRoot = await mkdtemp(path.join(tmpdir(), 'samindang-audit-episode-ownership-'))
    const dataDir = path.join(tmpRoot, 'submissions')
    const { server, base } = await startServer({ dataDir, doctorToken: DOCTOR_TOKEN })
    try {
      const visitA = (await postJson(`${base}/api/visits`, {})).body
      const visitB = (await postJson(`${base}/api/visits`, {})).body
      const episodeA = (await postJson(`${base}/api/crm/episodes`, { patient_uuid: visitA.patient_id })).body

      const beforeLines = await readAuditLines(auditLogPath(dataDir))
      const beforeCount = beforeLines.filter((l) => l.event === AUDIT_EVENTS.CRM_MEDICATION_COURSE_CREATED).length

      // Independent-review finding: the tamper body must otherwise be a
      // fully valid create request (real source_id/source_timestamp) --
      // an incomplete body would 400 on createMedicationCourseStored's own
      // required-field check regardless of the ownership guard, making the
      // 409 assertion below pass-by-construction instead of actually
      // discriminating the ownership check.
      const tamperBody = {
        patient_uuid: visitB.patient_id,
        episode_id: episodeA.episode_id,
        source: 'doctor_manual_entry',
        source_id: 'evt-audit-ownership-tamper',
        source_timestamp: new Date().toISOString(),
      }
      const tamperRes = await postJson(`${base}/api/crm/medication-courses`, tamperBody)
      assert('episode-ownership (HTTP): cross-patient course create is rejected -> 409', tamperRes.status === 409)

      const afterLines = await readAuditLines(auditLogPath(dataDir))
      const afterCount = afterLines.filter((l) => l.event === AUDIT_EVENTS.CRM_MEDICATION_COURSE_CREATED).length
      assert('episode-ownership (HTTP): zero new crm_medication_course_created audit lines after the rejected tamper', afterCount === beforeCount)

      const listRes = await getJson(`${base}/api/crm/episodes/${episodeA.episode_id}/medication-courses`)
      assert('episode-ownership (HTTP): zero MedicationCourses exist under the targeted episode after the rejected tamper', listRes.body.courses.length === 0)

      // Control: the exact same otherwise-valid body, but with the
      // CORRECT patient_uuid, must succeed -- proving the 409 above is
      // caused specifically by the ownership mismatch, not by some other
      // property of the request.
      const controlRes = await postJson(`${base}/api/crm/medication-courses`, { ...tamperBody, patient_uuid: visitA.patient_id })
      assert('episode-ownership (HTTP): the identical body with the CORRECT patient_uuid succeeds -> 201', controlRes.status === 201)
    } finally {
      await stopServer(server)
      await rm(tmpRoot, { recursive: true, force: true })
    }
  }

  /* =====================================================================
     Part 8: Episode↔Medication association integrity batch -- closing-
     review findings. episode_id is now client-minted input reaching
     crmStore.episodePath() (path.join) verbatim, and a client-minted id
     can collide with one already owned by a different patient -- both
     were unreachable before this batch (episode_id was always a
     server-minted randomUUID()).
     ===================================================================== */
  {
    const tmpRoot = await mkdtemp(path.join(tmpdir(), 'samindang-audit-episode-idsafety-'))
    const dataDir = path.join(tmpRoot, 'submissions')
    const { server, base } = await startServer({ dataDir, doctorToken: DOCTOR_TOKEN })
    try {
      const visit = (await postJson(`${base}/api/visits`, {})).body

      // Path-traversal-shaped episode_id must be rejected before it ever
      // reaches the filesystem -- not 200 (would mean it silently read or
      // wrote outside episodes/), not 500 (would mean an unhandled fs
      // error surfaced instead of a clean validation failure).
      for (const badId of ['../../submissions/some-record', '..%2f..%2fetc', 'a/b', 'a.json', '']) {
        const res = await postJson(`${base}/api/crm/episodes`, { patient_uuid: visit.patient_id, episode_id: badId })
        assert(`episode-id-safety (HTTP): malformed episode_id ${JSON.stringify(badId)} is rejected -> 400`, res.status === 400)
      }

      // A well-formed but cross-patient episode_id collision must fail
      // closed (409), not silently hand back the other patient's Episode.
      const visitOther = (await postJson(`${base}/api/visits`, {})).body
      const sharedId = `qa-shared-episode-id-${Date.now()}`
      const firstCreate = await postJson(`${base}/api/crm/episodes`, { patient_uuid: visit.patient_id, episode_id: sharedId })
      assert('episode-id-safety (HTTP): first create under a client-minted id -> 201', firstCreate.status === 201)
      const collision = await postJson(`${base}/api/crm/episodes`, { patient_uuid: visitOther.patient_id, episode_id: sharedId })
      assert('episode-id-safety (HTTP): reusing the same id for a DIFFERENT patient is rejected -> 409', collision.status === 409)
      assert(
        'episode-id-safety (HTTP): the rejected response never discloses the first patient\'s Episode body',
        collision.body.patient_uuid === undefined,
      )
    } finally {
      await stopServer(server)
      await rm(tmpRoot, { recursive: true, force: true })
    }
  }

  /* =====================================================================
     Part 9: 2nd independent closing-review finding (HIGH) -- the Part 8
     episode_id format guard only covered POST /api/crm/episodes.
     POST /api/crm/tasks and POST /api/crm/medication-courses also accept
     a caller-supplied episode_id and, before this fix, passed it straight
     into crmStore.getEpisode() (a bare path.join lookup) with no format
     check -- the reviewer proved this let a traversal-shaped episode_id
     read an arbitrary file under .data/ (a real patient submission
     record) and, on the tasks route, persist a Task carrying whatever
     patient_uuid that file happened to contain.
     ===================================================================== */
  {
    const tmpRoot = await mkdtemp(path.join(tmpdir(), 'samindang-audit-episode-traversal-'))
    const dataDir = path.join(tmpRoot, 'submissions')
    const { server, base } = await startServer({ dataDir, doctorToken: DOCTOR_TOKEN })
    try {
      // A real submission record to attempt to read via traversal --
      // crm/episodes/ sits at <tmpRoot>/crm/episodes/, so
      // ../../submissions/<id> walks back up to the seeded submission
      // file, exactly the shape the reviewer proved exploitable.
      const submissionRes = await fetch(`${base}/api/submissions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ questionnaire_version: '1.0', session_id: 'audit-traversal-victim', responses: { patient: {} } }),
      })
      const submission = await submissionRes.json()
      const traversalId = `../../submissions/${submission.id}`

      const visit = (await postJson(`${base}/api/visits`, {})).body

      const taskTraversal = await postJson(`${base}/api/crm/tasks`, {
        patient_uuid: visit.patient_id,
        episode_id: traversalId,
        task_type: 'ROUTINE',
        reason_code: 'REASSESSMENT_DUE',
        source_event_id: 'evt-audit-traversal-task',
      })
      assert('episode-id-safety (HTTP, tasks route): traversal-shaped episode_id is rejected -> 400, not 201', taskTraversal.status === 400)

      const courseTraversal = await postJson(`${base}/api/crm/medication-courses`, {
        episode_id: traversalId,
        source: 'doctor_manual_entry',
        source_id: 'evt-audit-traversal-course',
        source_timestamp: new Date().toISOString(),
      })
      assert('episode-id-safety (HTTP, medication-courses route): traversal-shaped episode_id is rejected -> 400, not 201', courseTraversal.status === 400)

      // Sanity: neither rejected call created a Task/MedicationCourse
      // (i.e. this isn't merely a dedup/validation coincidence).
      const tasksAfter = await getJson(`${base}/api/crm/tasks`)
      const leakedTask = tasksAfter.body.tasks?.find((t) => t.source_event_id === 'evt-audit-traversal-task')
      assert('episode-id-safety (HTTP, tasks route): no Task was persisted from the rejected traversal attempt', leakedTask === undefined)
    } finally {
      await stopServer(server)
      await rm(tmpRoot, { recursive: true, force: true })
    }
  }

  console.log(`\n${passCount} audit registry assertions passed.`)
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
