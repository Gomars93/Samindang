// CRM v0.3.1 persistence suite (round 6-7): restart durability, concurrency/
// version-conflict behavior, filesystem failure-injection, and Task/Episode
// identity derivation, at the server/crmStore.js store boundary and the
// real /api/crm/* HTTP boundary. Plain node, no test framework: assert()
// prints "OK: <name>" and throws on failure -- same convention as
// tests/server.spec.mjs / tests/follow-up-session.spec.mjs. No build step:
// crmStore.js itself imports src/crm/*.ts directly via Node's native TS
// execution, so this file can just `node tests/crm-store.spec.mjs`.
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { randomUUID, createHash } from 'node:crypto'
import { createCrmStore, CrmConflictError, CrmNotFoundError } from '../server/crmStore.js'
import { createApp } from '../server/index.js'
import { groupTasksForCommunication, computeDedupKey } from '../src/crm/taskEngine.ts'

let passCount = 0
function assert(name, cond) {
  if (!cond) throw new Error(`FAIL: ${name}`)
  passCount++
  console.log(`OK: ${name}`)
}

async function readRaw(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'))
  } catch (err) {
    if (err.code === 'ENOENT') return null
    throw err
  }
}

async function readdirDedupFiles(root) {
  try {
    return (await readdir(path.join(root, 'dedup'))).filter((f) => f.endsWith('.json') && !f.endsWith('.tmp'))
  } catch (err) {
    if (err.code === 'ENOENT') return []
    throw err
  }
}

const T0 = '2026-01-01T00:00:00.000Z'
function isoPlusMinutes(iso, minutes) {
  return new Date(Date.parse(iso) + minutes * 60 * 1000).toISOString()
}

const SAFETY_AUTH = { kind: 'EXPLICIT_HUMAN_REQUEST', requestedBy: 'doctor-test' }

async function startServer(opts) {
  const server = createApp(opts)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  return { server, base: `http://127.0.0.1:${port}` }
}

function stopServer(server) {
  return new Promise((resolve) => server.close(resolve))
}

async function main() {
  /* =====================================================================
     Part 1: restart persistence -- a fresh createCrmStore() instance
     pointed at the same baseDir (no shared in-memory state whatsoever)
     must see exactly what an earlier instance wrote, including the durable
     dedup index and self-healed claim-lease state.
     ===================================================================== */
  {
    const root = await mkdtemp(path.join(tmpdir(), 'samindang-crm-restart-'))
    try {
      const storeA = createCrmStore(root, { claimLeaseMinutes: 60 })
      const episodeId = randomUUID()
      const patientUuid = randomUUID()

      const episode = await storeA.createEpisode({ episode_id: episodeId, patient_uuid: patientUuid, owner_clinician: null, now: T0 })
      assert('restart: episode created ACTIVE version 1', episode.status === 'ACTIVE' && episode.version === 1)

      const { task: routineTask } = await storeA.createTaskStored({
        task_id: randomUUID(),
        patient_uuid: patientUuid,
        episode_id: episodeId,
        task_type: 'ROUTINE',
        reason_code: 'REASSESSMENT_DUE',
        source_event_id: 'evt-restart-routine',
        owner_clinician: null,
        now: T0,
      })
      const { task: safetyTask } = await storeA.createTaskStored({
        task_id: randomUUID(),
        patient_uuid: patientUuid,
        episode_id: episodeId,
        task_type: 'SAFETY_REVIEW',
        reason_code: 'SAFETY_REVIEW_REQUEST',
        source_event_id: 'evt-restart-safety',
        owner_clinician: null,
        now: T0,
        safetyAuthorization: SAFETY_AUTH,
      })

      // A brand-new store instance -- simulates a process restart. It
      // shares no JS object, no closure state, nothing but the directory.
      const storeB = createCrmStore(root, { claimLeaseMinutes: 60 })

      const episodeAfterRestart = await storeB.getEpisode(episodeId)
      assert('restart: episode survives with identical fields', episodeAfterRestart && episodeAfterRestart.status === 'ACTIVE' && episodeAfterRestart.version === 1)

      const tasksAfterRestart = await storeB.listTasksByEpisode(episodeId, T0)
      assert('restart: both tasks survive', tasksAfterRestart.length === 2)
      const routineAfter = tasksAfterRestart.find((t) => t.task_id === routineTask.task_id)
      const safetyAfter = tasksAfterRestart.find((t) => t.task_id === safetyTask.task_id)
      assert('restart: ROUTINE task intact', routineAfter && routineAfter.status === 'OPEN' && routineAfter.dedup_key === routineTask.dedup_key)
      assert('restart: SAFETY_REVIEW task intact and still OPEN', safetyAfter && safetyAfter.status === 'OPEN')

      // Durable dedup index: a second createTaskStored with the identical
      // dedup-key inputs, issued from the *new* instance, must return the
      // original task rather than minting a duplicate -- proving the
      // idempotency guarantee is backed by the on-disk index, not an
      // in-memory array that a restart would have wiped.
      const { task: dedupedTask, deduped } = await storeB.createTaskStored({
        task_id: randomUUID(),
        patient_uuid: patientUuid,
        episode_id: episodeId,
        task_type: 'ROUTINE',
        reason_code: 'REASSESSMENT_DUE',
        source_event_id: 'evt-restart-routine',
        owner_clinician: null,
        now: T0,
      })
      assert('restart: dedup index survives -- second create is deduped', deduped === true && dedupedTask.task_id === routineTask.task_id)

      // Claim-lease self-heal across restart: claim with a 1-minute lease
      // from storeA, then have storeB (a fresh instance, no timers of its
      // own) read the task 2 minutes later and observe it already
      // self-healed back to OPEN with no permanent CLAIMED lock.
      const storeAShortLease = createCrmStore(root, { claimLeaseMinutes: 1 })
      const claimed = await storeAShortLease.claimTaskStored(routineTask.task_id, routineAfter.version, 'clinician-x', T0)
      assert('restart: claim succeeds pre-restart', claimed.status === 'CLAIMED')
      const laterNow = isoPlusMinutes(T0, 2)
      const storeC = createCrmStore(root, { claimLeaseMinutes: 1 })
      const releasedAfterRestart = await storeC.getTask(routineTask.task_id, laterNow)
      assert('restart: expired claim self-heals to OPEN on first read after restart', releasedAfterRestart.status === 'OPEN' && releasedAfterRestart.claimed_by === null)
      // and it is actually re-claimable now, not permanently locked
      const reclaimed = await storeC.claimTaskStored(routineTask.task_id, releasedAfterRestart.version, 'clinician-y', laterNow)
      assert('restart: self-healed task is re-claimable, no permanent lock', reclaimed.status === 'CLAIMED' && reclaimed.claimed_by === 'clinician-y')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }

  /* =====================================================================
     Part 2: concurrency -- version-conflict enforcement and a genuine
     concurrent-claim race, at the store boundary.
     ===================================================================== */
  {
    const root = await mkdtemp(path.join(tmpdir(), 'samindang-crm-concurrency-'))
    try {
      const store = createCrmStore(root, { claimLeaseMinutes: 60 })
      const episodeId = randomUUID()
      const patientUuid = randomUUID()
      await store.createEpisode({ episode_id: episodeId, patient_uuid: patientUuid, owner_clinician: null, now: T0 })

      const { task } = await store.createTaskStored({
        task_id: randomUUID(),
        patient_uuid: patientUuid,
        episode_id: episodeId,
        task_type: 'ROUTINE',
        reason_code: 'REASSESSMENT_DUE',
        source_event_id: 'evt-concurrency-1',
        owner_clinician: null,
        now: T0,
      })

      // Stale-version conflicts on every mutating primitive, including the
      // two (cancel/supersede) whose pure-engine signature has no
      // expectedVersion param of its own -- the store boundary must still
      // enforce it uniformly.
      let snoozeConflicted = false
      try {
        await store.snoozeTaskStored(task.task_id, 999, isoPlusMinutes(T0, 60))
      } catch (err) {
        snoozeConflicted = err instanceof CrmConflictError
      }
      assert('concurrency: snoozeTaskStored rejects stale expectedVersion', snoozeConflicted)

      let cancelConflicted = false
      try {
        await store.cancelTaskStored(task.task_id, 999)
      } catch (err) {
        cancelConflicted = err instanceof CrmConflictError
      }
      assert('concurrency: cancelTaskStored rejects stale expectedVersion', cancelConflicted)

      let supersedeConflicted = false
      try {
        await store.supersedeTaskStored(task.task_id, 999)
      } catch (err) {
        supersedeConflicted = err instanceof CrmConflictError
      }
      assert('concurrency: supersedeTaskStored rejects stale expectedVersion', supersedeConflicted)

      // Genuine race: two concurrent claim attempts against the SAME
      // starting version, fired together. The per-task withLock() must
      // serialize them so exactly one succeeds and the other sees a
      // conflict against the version the winner already bumped -- never
      // both "succeeding" and silently overwriting each other.
      const results = await Promise.allSettled([
        store.claimTaskStored(task.task_id, task.version, 'clinician-A', T0),
        store.claimTaskStored(task.task_id, task.version, 'clinician-B', T0),
      ])
      const fulfilled = results.filter((r) => r.status === 'fulfilled')
      const rejected = results.filter((r) => r.status === 'rejected')
      assert('concurrency: exactly one concurrent claim wins', fulfilled.length === 1)
      assert('concurrency: the other concurrent claim conflicts, not silently overwritten', rejected.length === 1 && rejected[0].reason instanceof CrmConflictError)
      const finalTask = await store.getTask(task.task_id, T0)
      assert('concurrency: final claimed_by matches the single winner, no lost update', finalTask.claimed_by === fulfilled[0].value.claimed_by)

      // A not-found id is a distinct, correctly-typed error, not a generic 500.
      let notFound = false
      try {
        await store.cancelTaskStored(randomUUID(), 1)
      } catch (err) {
        notFound = err instanceof CrmNotFoundError
      }
      assert('concurrency: unknown task_id raises CrmNotFoundError', notFound)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }

  /* =====================================================================
     Part 3: failure injection -- force a genuine filesystem error partway
     through completeEpisodeStored (the one store operation that writes
     both a Task and an Episode file for one call) using the same
     file-blocks-directory EEXIST/EISDIR technique already established in
     tests/follow-up-session.spec.mjs, and prove:
       (a) the interruption cannot leave a half-written Episode/Task pair
           in the unsafe direction (a COMPLETED episode with a ROUTINE
           task that should have been cancelled left silently open), and
       (b) an open SAFETY_REVIEW task is never touched, restart or not.
     ===================================================================== */
  {
    const root = await mkdtemp(path.join(tmpdir(), 'samindang-crm-failure-injection-'))
    try {
      const store = createCrmStore(root, { claimLeaseMinutes: 60 })
      const episodeId = randomUUID()
      const patientUuid = randomUUID()
      const episode = await store.createEpisode({ episode_id: episodeId, patient_uuid: patientUuid, owner_clinician: null, now: T0 })

      const { task: routineTask } = await store.createTaskStored({
        task_id: randomUUID(),
        patient_uuid: patientUuid,
        episode_id: episodeId,
        task_type: 'ROUTINE',
        reason_code: 'REASSESSMENT_DUE',
        source_event_id: 'evt-failure-routine',
        owner_clinician: null,
        now: T0,
      })
      const { task: safetyTask } = await store.createTaskStored({
        task_id: randomUUID(),
        patient_uuid: patientUuid,
        episode_id: episodeId,
        task_type: 'SAFETY_REVIEW',
        reason_code: 'SAFETY_REVIEW_REQUEST',
        source_event_id: 'evt-failure-safety',
        owner_clinician: null,
        now: T0,
        safetyAuthorization: SAFETY_AUTH,
      })

      // Block the episode file's own atomic-write tmp path with a real
      // directory at that exact path, so completeEpisodeStored's task
      // writes (which happen first) succeed, but its final episode
      // atomicWrite genuinely throws (EISDIR) instead of being mocked.
      const episodeTmpPath = path.join(root, 'episodes', `${episodeId}.json.tmp`)
      await mkdir(episodeTmpPath, { recursive: true })

      let completeThrew = false
      try {
        await store.completeEpisodeStored(episodeId, episode.version, T0)
      } catch {
        completeThrew = true
      }
      assert('failure-injection: completeEpisodeStored genuinely throws when the episode write is blocked', completeThrew)

      // (a) No half-written pair in the unsafe direction: the episode on
      // disk must still say ACTIVE (not COMPLETED) even though the
      // ROUTINE task was already cancelled before the interruption -- an
      // interrupted call can only leave the *safer* state (still-ACTIVE
      // episode, retry-safe), never a COMPLETED episode paired with a
      // task that silently never got cancelled.
      const episodeAfterFailure = await readRaw(path.join(root, 'episodes', `${episodeId}.json`))
      assert('failure-injection: episode on disk is still ACTIVE, not COMPLETED, after the interrupted write', episodeAfterFailure.status === 'ACTIVE' && episodeAfterFailure.version === 1)
      const routineAfterFailure = await readRaw(path.join(root, 'tasks', `${routineTask.task_id}.json`))
      assert('failure-injection: the ROUTINE task write that preceded the interruption did land', routineAfterFailure.status === 'CANCELLED')

      // (b) The SAFETY_REVIEW task was never in completeEpisode's write
      // set at all (only ROUTINE tasks are touched) -- confirm it is
      // completely unaffected by the interrupted call.
      const safetyAfterFailure = await readRaw(path.join(root, 'tasks', `${safetyTask.task_id}.json`))
      assert('failure-injection: open SAFETY_REVIEW task is untouched by the interrupted completion', safetyAfterFailure.status === 'OPEN' && safetyAfterFailure.version === 1)

      // Unblock, then prove the interrupted call is safely retryable and
      // converges to a single consistent, fully-written pair -- the
      // already-cancelled task is not re-cancelled (cancelTask on an
      // already-terminal task is a no-op), and the episode now completes.
      await rm(episodeTmpPath, { recursive: true, force: true })
      const retried = await store.completeEpisodeStored(episodeId, episode.version, T0)
      assert('failure-injection: retry after unblocking converges to COMPLETED', retried.episode.status === 'COMPLETED' && retried.episode.version === 2)
      const routineAfterRetry = await readRaw(path.join(root, 'tasks', `${routineTask.task_id}.json`))
      assert('failure-injection: retried completion leaves the task consistently CANCELLED', routineAfterRetry.status === 'CANCELLED')
      const safetyAfterRetry = await readRaw(path.join(root, 'tasks', `${safetyTask.task_id}.json`))
      assert('failure-injection: SAFETY_REVIEW task still open and untouched after episode completion', safetyAfterRetry.status === 'OPEN')

      // A SAFETY_REVIEW task can never be silently lost through the
      // generic cancel/supersede primitives either -- confirmed directly
      // at the store boundary, not just through completeEpisodeStored's
      // own filter.
      let cancelRefused = false
      try {
        await store.cancelTaskStored(safetyTask.task_id, safetyAfterRetry.version)
      } catch (err) {
        cancelRefused = err instanceof Error && !(err instanceof CrmConflictError) && !(err instanceof CrmNotFoundError)
      }
      assert('failure-injection: cancelTaskStored refuses to cancel an open SAFETY_REVIEW task', cancelRefused)
      const safetyStillOpen = await readRaw(path.join(root, 'tasks', `${safetyTask.task_id}.json`))
      assert('failure-injection: refused cancel leaves SAFETY_REVIEW task untouched on disk', safetyStillOpen.status === 'OPEN' && safetyStillOpen.version === 1)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }

  /* =====================================================================
     Part 4: failure injection on task creation -- block the specific
     Task file's own write path (the SECOND write createTaskStored
     attempts, after round 8's reordering -- see Part 7 below for the full
     durable-dedup-crash-window regression) and confirm the interrupted
     call throws with no Task file on disk, then that an unblocked retry
     recovers cleanly.
     ===================================================================== */
  {
    const root = await mkdtemp(path.join(tmpdir(), 'samindang-crm-create-failure-'))
    try {
      const store = createCrmStore(root, { claimLeaseMinutes: 60 })
      const episodeId = randomUUID()
      const patientUuid = randomUUID()
      await store.createEpisode({ episode_id: episodeId, patient_uuid: patientUuid, owner_clinician: null, now: T0 })

      // Block the specific task's own tmp write path with a directory
      // (ensureDirs() already created tasks/ for real above, so this
      // targets just the one file this call will try to write).
      const taskId = randomUUID()
      const taskTmpPath = path.join(root, 'tasks', `${taskId}.json.tmp`)
      await mkdir(taskTmpPath, { recursive: true })

      let createThrew = false
      try {
        await store.createTaskStored({
          task_id: taskId,
          patient_uuid: patientUuid,
          episode_id: episodeId,
          task_type: 'ROUTINE',
          reason_code: 'REASSESSMENT_DUE',
          source_event_id: 'evt-create-failure',
          owner_clinician: null,
          now: T0,
        })
      } catch {
        createThrew = true
      }
      assert('create-failure: createTaskStored genuinely throws when its task write is blocked', createThrew)

      const taskAfterFailure = await readRaw(path.join(root, 'tasks', `${taskId}.json`))
      assert('create-failure: no task file was left behind by the interrupted create', taskAfterFailure === null)

      // Round 8: the dedup pointer WAS already durably committed before
      // the blocked task write was attempted -- it is the intent record.
      // A retry (with a fresh, different task_id, exactly as a real
      // caller's retry would supply) must recover the ORIGINAL attempt's
      // task_id from that intent record, not mint a second one.
      const dedupHashFile = (await readdirDedupFiles(root))[0]
      const pointerAfterFailure = await readRaw(path.join(root, 'dedup', dedupHashFile))
      assert('create-failure: the dedup intent record survived the blocked task write', pointerAfterFailure?.task?.task_id === taskId)

      await rm(taskTmpPath, { recursive: true, force: true })
      const { task: retriedTask, deduped } = await store.createTaskStored({
        task_id: randomUUID(),
        patient_uuid: patientUuid,
        episode_id: episodeId,
        task_type: 'ROUTINE',
        reason_code: 'REASSESSMENT_DUE',
        source_event_id: 'evt-create-failure',
        owner_clinician: null,
        now: T0,
      })
      assert('create-failure: retry after unblocking recovers cleanly, not a phantom dedup', deduped === false && retriedTask.status === 'OPEN')
      assert('create-failure: retry recovers the ORIGINAL intent\'s task_id, not the retry\'s own fresh one', retriedTask.task_id === taskId)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }

  /* =====================================================================
     Part 5: Task identity derivation at the store boundary (round 7 fix) --
     a stale/malicious caller supplying a Task patient_uuid that disagrees
     with its own Episode's patient_uuid must never get that mismatched
     identity persisted. The Task's patient_uuid is derived from the
     Episode it is created against, not from the caller's input.
     ===================================================================== */
  {
    const root = await mkdtemp(path.join(tmpdir(), 'samindang-crm-identity-'))
    try {
      const store = createCrmStore(root, { claimLeaseMinutes: 60 })
      const patientA = randomUUID()
      const patientB = randomUUID()
      const episodeForA = await store.createEpisode({ episode_id: randomUUID(), patient_uuid: patientA, owner_clinician: null, now: T0 })

      // A stale/malicious body claims episodeForA (patient A) but supplies
      // patient B's uuid as the task's patient_uuid.
      const { task: mismatchedTask } = await store.createTaskStored({
        task_id: randomUUID(),
        patient_uuid: patientB,
        episode_id: episodeForA.episode_id,
        task_type: 'ROUTINE',
        reason_code: 'REASSESSMENT_DUE',
        source_event_id: 'evt-identity-mismatch',
        owner_clinician: null,
        now: T0,
      })
      assert('identity: task persists with the EPISODE\'s patient_uuid, not the caller-supplied one', mismatchedTask.patient_uuid === patientA)
      assert('identity: task never persists the mismatched caller-supplied patient_uuid', mismatchedTask.patient_uuid !== patientB)

      const onDisk = await readRaw(path.join(root, 'tasks', `${mismatchedTask.task_id}.json`))
      assert('identity: the persisted file on disk also carries the Episode\'s patient_uuid', onDisk.patient_uuid === patientA)

      // Dedup key must also be computed against the derived identity, not
      // the caller-supplied one, or a second call with the correct
      // patient_uuid would (wrongly) be treated as a distinct task.
      const { task: secondCall, deduped } = await store.createTaskStored({
        task_id: randomUUID(),
        patient_uuid: patientA,
        episode_id: episodeForA.episode_id,
        task_type: 'ROUTINE',
        reason_code: 'REASSESSMENT_DUE',
        source_event_id: 'evt-identity-mismatch',
        owner_clinician: null,
        now: T0,
      })
      assert('identity: dedup key is computed against the derived identity, so the correctly-addressed retry dedupes to the same task', deduped === true && secondCall.task_id === mismatchedTask.task_id)

      // Patient-level communication grouping must use the corrected
      // identity -- the whole point of deriving it at persistence time.
      const { groups } = groupTasksForCommunication([mismatchedTask])
      assert('identity: patient-level grouping uses the Episode\'s patient (A), never the spoofed one (B)', groups.length === 1 && groups[0].patient_uuid === patientA)

      // Creating a task against an unknown episode_id fails closed rather
      // than persisting a Task with no real Episode to derive identity from.
      let unknownEpisodeThrew = false
      try {
        await store.createTaskStored({
          task_id: randomUUID(),
          patient_uuid: patientA,
          episode_id: randomUUID(),
          task_type: 'ROUTINE',
          reason_code: 'REASSESSMENT_DUE',
          source_event_id: 'evt-unknown-episode',
          owner_clinician: null,
          now: T0,
        })
      } catch (err) {
        unknownEpisodeThrew = err instanceof CrmNotFoundError
      }
      assert('identity: createTaskStored against an unknown episode_id raises CrmNotFoundError, no orphan task', unknownEpisodeThrew)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }

  /* =====================================================================
     Part 6: the same identity-derivation guarantee at the real HTTP API
     boundary (POST /api/crm/tasks through server/index.js's createApp()),
     not just the store function called directly -- proving the route
     cannot be used to bypass the store-boundary fix.
     ===================================================================== */
  {
    const dataRoot = await mkdtemp(path.join(tmpdir(), 'samindang-crm-identity-http-'))
    const { server, base } = await startServer({ dataDir: path.join(dataRoot, 'submissions'), doctorToken: 'test-doctor-token' })
    const headers = { 'content-type': 'application/json', 'x-doctor-token': 'test-doctor-token' }
    try {
      const visitARes = await fetch(`${base}/api/visits`, { method: 'POST', headers, body: JSON.stringify({}) })
      const visitA = await visitARes.json()
      const visitBRes = await fetch(`${base}/api/visits`, { method: 'POST', headers, body: JSON.stringify({}) })
      const visitB = await visitBRes.json()

      const epRes = await fetch(`${base}/api/crm/episodes`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ patient_uuid: visitA.patient_id }),
      })
      const episode = await epRes.json()
      assert('identity-http: episode created for patient A', episode.patient_uuid === visitA.patient_id)

      // Stale/malicious body: episode belongs to patient A, task body
      // claims patient B.
      const taskRes = await fetch(`${base}/api/crm/tasks`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          patient_uuid: visitB.patient_id,
          episode_id: episode.episode_id,
          task_type: 'ROUTINE',
          reason_code: 'REASSESSMENT_DUE',
          source_event_id: 'evt-identity-http-mismatch',
        }),
      })
      const taskBody = await taskRes.json()
      assert('identity-http: POST /api/crm/tasks returns 201 (request itself is well-formed)', taskRes.status === 201)
      assert('identity-http: persisted task carries patient A (the Episode\'s patient), not the spoofed patient B', taskBody.task.patient_uuid === visitA.patient_id)
      assert('identity-http: persisted task never carries the spoofed patient_uuid', taskBody.task.patient_uuid !== visitB.patient_id)

      const getRes = await fetch(`${base}/api/crm/tasks/${taskBody.task.task_id}`, { headers })
      const getBody = await getRes.json()
      assert('identity-http: a subsequent GET of the task also shows patient A, confirming it is what was actually persisted', getBody.patient_uuid === visitA.patient_id)
    } finally {
      await stopServer(server)
      await rm(dataRoot, { recursive: true, force: true })
    }
  }

  /* =====================================================================
     Part 7: the durable dedup crash window (round 8 fix) -- interrupt
     createTaskStored at the exact point that used to leave a duplicate:
     after the dedup intent record is durably committed but before the
     Task file itself lands. Prove that a fresh createCrmStore() instance
     (a real restart, no shared state whatsoever) retrying the same
     source event converges to exactly one authoritative non-terminal
     Task -- never a second one -- while terminal-task remint semantics
     are unchanged.
     ===================================================================== */
  {
    const root = await mkdtemp(path.join(tmpdir(), 'samindang-crm-dedup-crash-'))
    try {
      const storeA = createCrmStore(root, { claimLeaseMinutes: 60 })
      const episodeId = randomUUID()
      const patientUuid = randomUUID()
      await storeA.createEpisode({ episode_id: episodeId, patient_uuid: patientUuid, owner_clinician: null, now: T0 })

      const originalTaskId = randomUUID()
      // Block the Task file's own tmp write path -- the SECOND write in
      // createTaskStored's new order, so the dedup intent record (the
      // FIRST write) is allowed to land normally.
      const taskTmpPath = path.join(root, 'tasks', `${originalTaskId}.json.tmp`)
      await mkdir(taskTmpPath, { recursive: true })

      let firstAttemptThrew = false
      try {
        await storeA.createTaskStored({
          task_id: originalTaskId,
          patient_uuid: patientUuid,
          episode_id: episodeId,
          task_type: 'ROUTINE',
          reason_code: 'REASSESSMENT_DUE',
          source_event_id: 'evt-dedup-crash',
          owner_clinician: null,
          now: T0,
        })
      } catch {
        firstAttemptThrew = true
      }
      assert('dedup-crash: first attempt genuinely throws when the Task write is blocked (intent already committed)', firstAttemptThrew)

      const hashFile = (await readdirDedupFiles(root))[0]
      assert('dedup-crash: exactly one dedup intent record exists after the interrupted attempt', hashFile !== undefined)
      const intentAfterCrash = await readRaw(path.join(root, 'dedup', hashFile))
      assert('dedup-crash: the intent record durably names the original task_id and full snapshot', intentAfterCrash?.task?.task_id === originalTaskId && intentAfterCrash.task.status === 'OPEN')
      const taskFileAfterCrash = await readRaw(path.join(root, 'tasks', `${originalTaskId}.json`))
      assert('dedup-crash: the Task file itself does not exist yet -- only the intent survived', taskFileAfterCrash === null)

      // Unblock, then simulate an actual process restart: a completely
      // fresh createCrmStore() instance, no shared in-memory state.
      await rm(taskTmpPath, { recursive: true, force: true })
      const storeB = createCrmStore(root, { claimLeaseMinutes: 60 })

      // Retry with the same dedup-key-relevant fields but the caller's
      // own FRESH task_id (exactly what server/index.js's route actually
      // does on every call -- randomUUID() per request) to prove recovery
      // ignores the retry's own id in favor of the durable intent's.
      const { task: recovered, deduped: recoveredDeduped } = await storeB.createTaskStored({
        task_id: randomUUID(),
        patient_uuid: patientUuid,
        episode_id: episodeId,
        task_type: 'ROUTINE',
        reason_code: 'REASSESSMENT_DUE',
        source_event_id: 'evt-dedup-crash',
        owner_clinician: null,
        now: T0,
      })
      assert('dedup-crash: restart-retry recovers the ORIGINAL task_id from the intent record', recovered.task_id === originalTaskId)
      assert('dedup-crash: restart-retry reports deduped:false -- this call completes the durable creation', recoveredDeduped === false)

      const allTaskFiles = (await readdir(path.join(root, 'tasks'))).filter((f) => f.endsWith('.json') && !f.endsWith('.tmp'))
      assert('dedup-crash: exactly one Task file exists on disk after recovery -- no duplicate', allTaskFiles.length === 1)

      // A further retry now finds a real, non-terminal Task on disk and
      // dedupes normally (the ordinary path, unaffected by the fix).
      const { task: thirdCall, deduped: thirdDeduped } = await storeB.createTaskStored({
        task_id: randomUUID(),
        patient_uuid: patientUuid,
        episode_id: episodeId,
        task_type: 'ROUTINE',
        reason_code: 'REASSESSMENT_DUE',
        source_event_id: 'evt-dedup-crash',
        owner_clinician: null,
        now: T0,
      })
      assert('dedup-crash: a subsequent ordinary retry dedupes to the recovered task, not a new one', thirdDeduped === true && thirdCall.task_id === originalTaskId)

      // Terminal-task remint semantics are unchanged: once the recovered
      // task is DONE, the identical dedup-key inputs mint a genuinely NEW
      // task rather than reusing (or getting stuck on) the terminal one --
      // and that fresh mint is itself crash-safe the same way.
      const resolved = await storeB.resolveTaskStored(originalTaskId, recovered.version, 'CLINICIAN', T0)
      assert('dedup-crash: recovered task can be resolved to DONE normally', resolved.status === 'DONE')

      const { task: remint, deduped: remintDeduped } = await storeB.createTaskStored({
        task_id: randomUUID(),
        patient_uuid: patientUuid,
        episode_id: episodeId,
        task_type: 'ROUTINE',
        reason_code: 'REASSESSMENT_DUE',
        source_event_id: 'evt-dedup-crash',
        owner_clinician: null,
        now: T0,
      })
      assert('dedup-crash: same dedup key after the prior task is DONE mints a genuinely new task, not deduped', remintDeduped === false && remint.task_id !== originalTaskId)

      const hashFileAfterRemint = (await readdirDedupFiles(root))[0]
      const intentAfterRemint = await readRaw(path.join(root, 'dedup', hashFileAfterRemint))
      assert('dedup-crash: the intent record now points at the new mint, not the terminal task', intentAfterRemint.task.task_id === remint.task_id)

      // No raw phone/PHI anywhere in the intent record -- only UUID
      // references and non-PHI status fields, same invariant the pure
      // engine's own dedup_key construction already enforces.
      const RAW_PHONE_PATTERN = /(?:\+?82[-\s]?)?0?1[016789][-\s]?\d{3,4}[-\s]?\d{4}/
      assert('dedup-crash: the intent record contains no phone-shaped string', !RAW_PHONE_PATTERN.test(JSON.stringify(intentAfterRemint)))
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }

  /* =====================================================================
     Part 8: upgrade compatibility (round 9 fix) -- a dedup pointer already
     on disk in the pre-round-8 legacy shape ({task_id} only, no full
     snapshot) must not be misread as "no pointer" by the current code.
     Seeds an actual legacy-shaped pointer + Task on disk (simulating data
     left behind by an older deploy), instantiates the CURRENT store fresh
     (simulating restart/deploy), and retries the same source event.
     ===================================================================== */
  {
    const root = await mkdtemp(path.join(tmpdir(), 'samindang-crm-legacy-upgrade-'))
    try {
      const storeA = createCrmStore(root, { claimLeaseMinutes: 60 })
      const episodeId = randomUUID()
      const patientUuid = randomUUID()
      await storeA.createEpisode({ episode_id: episodeId, patient_uuid: patientUuid, owner_clinician: null, now: T0 })

      // Create a real task through the current store first, so the
      // seeded data is byte-for-byte what this store would have written,
      // then downgrade just the dedup pointer to the pre-round-8 legacy
      // shape -- exactly what an older deploy would have left on disk.
      const { task: original } = await storeA.createTaskStored({
        task_id: randomUUID(),
        patient_uuid: patientUuid,
        episode_id: episodeId,
        task_type: 'ROUTINE',
        reason_code: 'REASSESSMENT_DUE',
        source_event_id: 'evt-legacy-upgrade',
        owner_clinician: null,
        now: T0,
      })
      const hashFile = (await readdirDedupFiles(root))[0]
      const dedupFilePath = path.join(root, 'dedup', hashFile)
      await writeFile(dedupFilePath, JSON.stringify({ task_id: original.task_id }, null, 2), 'utf8')
      const seededLegacy = await readRaw(dedupFilePath)
      assert('legacy-upgrade: seeded pointer is genuinely the old {task_id}-only shape', seededLegacy.task_id === original.task_id && seededLegacy.task === undefined)

      // Simulate an actual restart/deploy: a completely fresh store
      // instance, then retry the same source event with the caller's own
      // fresh task_id (exactly what a real retry supplies).
      const storeB = createCrmStore(root, { claimLeaseMinutes: 60 })
      const { task: recovered, deduped: recoveredDeduped } = await storeB.createTaskStored({
        task_id: randomUUID(),
        patient_uuid: patientUuid,
        episode_id: episodeId,
        task_type: 'ROUTINE',
        reason_code: 'REASSESSMENT_DUE',
        source_event_id: 'evt-legacy-upgrade',
        owner_clinician: null,
        now: T0,
      })
      assert('legacy-upgrade: retry against a legacy pointer recognizes the existing task and dedupes, not a duplicate', recoveredDeduped === true && recovered.task_id === original.task_id)
      assert('legacy-upgrade: patient identity remains Episode-derived through the legacy path', recovered.patient_uuid === patientUuid)

      const allTaskFiles = (await readdir(path.join(root, 'tasks'))).filter((f) => f.endsWith('.json') && !f.endsWith('.tmp'))
      const matchingDedupKey = []
      for (const f of allTaskFiles) {
        const t = await readRaw(path.join(root, 'tasks', f))
        if (t.dedup_key === original.dedup_key) matchingDedupKey.push(t)
      }
      assert('legacy-upgrade: exactly one non-terminal Task exists for this dedup_key -- no duplicate from the upgrade', matchingDedupKey.length === 1)

      const pointerAfterUpgrade = await readRaw(dedupFilePath)
      assert('legacy-upgrade: the legacy pointer was lazily upgraded to the new intent-record shape', pointerAfterUpgrade.task?.task_id === original.task_id)

      const RAW_PHONE_PATTERN2 = /(?:\+?82[-\s]?)?0?1[016789][-\s]?\d{3,4}[-\s]?\d{4}/
      assert('legacy-upgrade: no phone-shaped string anywhere in the upgraded pointer', !RAW_PHONE_PATTERN2.test(JSON.stringify(pointerAfterUpgrade)))

      // Legacy pointer + TERMINAL Task: existing remint behavior must be
      // preserved -- resolve the task to DONE, force the pointer back to
      // the legacy shape (as if an old deploy had left it there before
      // the task was ever resolved), then retry: a genuinely new task
      // must be minted, not a reuse of the terminal one.
      const resolved = await storeB.resolveTaskStored(original.task_id, recovered.version, 'CLINICIAN', T0)
      assert('legacy-upgrade: recovered task resolves to DONE normally', resolved.status === 'DONE')
      await writeFile(dedupFilePath, JSON.stringify({ task_id: original.task_id }, null, 2), 'utf8')

      const storeC = createCrmStore(root, { claimLeaseMinutes: 60 })
      const { task: remint, deduped: remintDeduped } = await storeC.createTaskStored({
        task_id: randomUUID(),
        patient_uuid: patientUuid,
        episode_id: episodeId,
        task_type: 'ROUTINE',
        reason_code: 'REASSESSMENT_DUE',
        source_event_id: 'evt-legacy-upgrade',
        owner_clinician: null,
        now: T0,
      })
      assert('legacy-upgrade: a legacy pointer naming a now-TERMINAL task still mints a genuinely new task, not a reuse', remintDeduped === false && remint.task_id !== original.task_id)
      const pointerAfterRemint = await readRaw(dedupFilePath)
      assert('legacy-upgrade: the pointer after remint points at the new mint in the upgraded shape', pointerAfterRemint.task?.task_id === remint.task_id)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }

  /* =====================================================================
     Part 9: legacy pointer naming a MISSING Task (corruption/deletion, not
     an in-flight crash -- the pre-round-8 write order guaranteed the Task
     always existed before its pointer did). Must fail/recover explicitly
     by minting a fresh task, never throwing unhandled or silently
     guessing at the missing Task's original fields.
     ===================================================================== */
  {
    const root = await mkdtemp(path.join(tmpdir(), 'samindang-crm-legacy-missing-'))
    try {
      const store = createCrmStore(root, { claimLeaseMinutes: 60 })
      const episodeId = randomUUID()
      const patientUuid = randomUUID()
      await store.createEpisode({ episode_id: episodeId, patient_uuid: patientUuid, owner_clinician: null, now: T0 })

      const dedup_key = computeDedupKey({
        patient_uuid: patientUuid,
        episode_id: episodeId,
        task_type: 'ROUTINE',
        source_event_id: 'evt-legacy-missing',
        contactPointKey: 'DEFAULT',
      })
      const hash = createHash('sha256').update(dedup_key, 'utf8').digest('hex')
      await mkdir(path.join(root, 'dedup'), { recursive: true })
      const missingTaskId = randomUUID()
      await writeFile(path.join(root, 'dedup', `${hash}.json`), JSON.stringify({ task_id: missingTaskId }, null, 2), 'utf8')

      const { task, deduped } = await store.createTaskStored({
        task_id: randomUUID(),
        patient_uuid: patientUuid,
        episode_id: episodeId,
        task_type: 'ROUTINE',
        reason_code: 'REASSESSMENT_DUE',
        source_event_id: 'evt-legacy-missing',
        owner_clinician: null,
        now: T0,
      })
      assert('legacy-missing: a legacy pointer naming a nonexistent Task mints a fresh task explicitly, no throw', deduped === false && task.task_id !== missingTaskId)
      const stillMissing = await readRaw(path.join(root, 'tasks', `${missingTaskId}.json`))
      assert('legacy-missing: the phantom task_id the corrupt pointer named was never retroactively created', stillMissing === null)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }

  console.log(`\n${passCount} CRM store persistence assertions passed.`)
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
