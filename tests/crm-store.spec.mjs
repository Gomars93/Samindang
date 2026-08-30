// CRM v0.3.1 persistence suite (round 6-7): restart durability, concurrency/
// version-conflict behavior, filesystem failure-injection, and Task/Episode
// identity derivation, at the server/crmStore.js store boundary and the
// real /api/crm/* HTTP boundary. Plain node, no test framework: assert()
// prints "OK: <name>" and throws on failure -- same convention as
// tests/server.spec.mjs / tests/follow-up-session.spec.mjs. No build step:
// crmStore.js itself imports src/crm/*.ts directly via Node's native TS
// execution, so this file can just `node tests/crm-store.spec.mjs`.
import { access, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { randomUUID, createHash } from 'node:crypto'
import { createCrmStore, CrmConflictError, CrmNotFoundError } from '../server/crmStore.js'
import { createPatientIdentityStore, IdentityConflictError } from '../server/patientIdentityStore.js'
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

const RAW_PHONE_PATTERN = /(?:\+?82[-\s]?)?0?1[016789][-\s]?\d{3,4}[-\s]?\d{4}/
// Every id in these fixtures is a randomUUID() -- 32 hex chars with no
// digit/letter separation -- so an *unrelated* run of digits shaped like
// a phone number can appear there purely by chance (independently
// verified: this fired in a real CI-equivalent run). Strip UUID-shaped
// substrings before testing for phone-shaped strings so the check stays
// meaningful (it still catches an actual phone number anywhere else in
// the structure) without being a coin flip on every random id drawn.
const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi
function containsPhoneShapedString(value) {
  return RAW_PHONE_PATTERN.test(JSON.stringify(value).replace(UUID_PATTERN, ''))
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
      assert('dedup-crash: the intent record contains no phone-shaped string', !containsPhoneShapedString(intentAfterRemint))
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

      assert('legacy-upgrade: no phone-shaped string anywhere in the upgraded pointer', !containsPhoneShapedString(pointerAfterUpgrade))

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

  /* =====================================================================
     Part 10: Safety resolve authorization is server-derived, never
     request-body-derived (round 10 fix). Before this round,
     POST /api/crm/tasks/:id/resolve read `actorRole` straight out of the
     JSON body and passed it to the pure engine's SAFETY_REVIEW guard --
     so "Safety close authority = clinician only" was enforced by an
     editable request field, not by authenticated server context. Proves,
     at the real HTTP boundary: a caller cannot change authorization by
     sending actorRole in the body either way, the doctor-authenticated
     route resolves Safety only under server-derived clinician authority,
     and no unauthenticated request can resolve any CRM task at all. Also
     proves, directly at the store boundary, that the pure engine's own
     STAFF-cannot-resolve-SAFETY_REVIEW invariant is untouched.
     ===================================================================== */
  {
    const dataRoot = await mkdtemp(path.join(tmpdir(), 'samindang-crm-safety-authz-'))
    const { server, base } = await startServer({ dataDir: path.join(dataRoot, 'submissions'), doctorToken: 'test-doctor-token' })
    const headers = { 'content-type': 'application/json', 'x-doctor-token': 'test-doctor-token' }
    try {
      const visitRes = await fetch(`${base}/api/visits`, { method: 'POST', headers, body: JSON.stringify({}) })
      const visit = await visitRes.json()

      const epRes = await fetch(`${base}/api/crm/episodes`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ patient_uuid: visit.patient_id }),
      })
      const episode = await epRes.json()

      async function createSafetyTask(sourceEventId) {
        const res = await fetch(`${base}/api/crm/tasks`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            patient_uuid: visit.patient_id,
            episode_id: episode.episode_id,
            task_type: 'SAFETY_REVIEW',
            reason_code: 'SAFETY_REVIEW_REQUEST',
            source_event_id: sourceEventId,
            safetyAuthorization: { kind: 'EXPLICIT_HUMAN_REQUEST', requestedBy: 'doctor-test' },
          }),
        })
        const body = await res.json()
        return body.task
      }

      // 1. A caller cannot upgrade/downgrade authorization by sending
      // actorRole: 'STAFF' -- the doctor-authenticated route must still
      // resolve it (as server-derived CLINICIAN), proving the body field
      // has no effect on the outcome either way.
      const taskA = await createSafetyTask('evt-safety-authz-staff-body')
      const resolveAsStaffRes = await fetch(`${base}/api/crm/tasks/${taskA.task_id}/resolve`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ expectedVersion: taskA.version, actorRole: 'STAFF' }),
      })
      const resolvedA = await resolveAsStaffRes.json()
      assert('safety-authz: doctor-authenticated resolve succeeds even when body claims actorRole STAFF', resolveAsStaffRes.status === 200 && resolvedA.status === 'DONE')

      // 2. Sending actorRole: 'CLINICIAN' explicitly changes nothing --
      // same server-derived outcome, not a body-controlled one.
      const taskB = await createSafetyTask('evt-safety-authz-clinician-body')
      const resolveAsClinicianRes = await fetch(`${base}/api/crm/tasks/${taskB.task_id}/resolve`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ expectedVersion: taskB.version, actorRole: 'CLINICIAN' }),
      })
      const resolvedB = await resolveAsClinicianRes.json()
      assert('safety-authz: doctor-authenticated resolve succeeds identically when body claims actorRole CLINICIAN', resolveAsClinicianRes.status === 200 && resolvedB.status === 'DONE')

      // 3. Omitting actorRole entirely -- also identical, server-derived.
      const taskC = await createSafetyTask('evt-safety-authz-no-body-field')
      const resolveNoFieldRes = await fetch(`${base}/api/crm/tasks/${taskC.task_id}/resolve`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ expectedVersion: taskC.version }),
      })
      const resolvedC = await resolveNoFieldRes.json()
      assert('safety-authz: doctor-authenticated resolve succeeds with no actorRole field at all', resolveNoFieldRes.status === 200 && resolvedC.status === 'DONE')

      // 4. No unauthenticated request can resolve any CRM task -- an evil
      // Origin (the established defense-in-depth technique this suite
      // and tests/server.spec.mjs already use for "loopback + evil
      // Origin -> 403") is rejected before ever reaching the store, and
      // the targeted task is provably untouched afterward.
      const taskD = await createSafetyTask('evt-safety-authz-unauthenticated')
      const unauthResolveRes = await fetch(`${base}/api/crm/tasks/${taskD.task_id}/resolve`, {
        method: 'POST',
        headers: { ...headers, origin: 'https://evil.example' },
        body: JSON.stringify({ expectedVersion: taskD.version, actorRole: 'STAFF' }),
      })
      assert('safety-authz: an unauthenticated (evil-Origin) resolve attempt is rejected with 403', unauthResolveRes.status === 403)
      const taskDAfter = await fetch(`${base}/api/crm/tasks/${taskD.task_id}`, { headers })
      const taskDAfterBody = await taskDAfter.json()
      assert('safety-authz: the targeted task is untouched (still OPEN) after the rejected unauthenticated attempt', taskDAfterBody.status === 'OPEN')
    } finally {
      await stopServer(server)
      await rm(dataRoot, { recursive: true, force: true })
    }
  }

  /* ---- direct store-level confirmation: the pure engine's own
     STAFF-cannot-resolve-SAFETY_REVIEW invariant is untouched, even
     though the HTTP route above no longer exposes actorRole as a caller
     choice at all. ---- */
  {
    const root = await mkdtemp(path.join(tmpdir(), 'samindang-crm-safety-engine-'))
    try {
      const store = createCrmStore(root, { claimLeaseMinutes: 60 })
      const episodeId = randomUUID()
      const patientUuid = randomUUID()
      await store.createEpisode({ episode_id: episodeId, patient_uuid: patientUuid, owner_clinician: null, now: T0 })
      const { task } = await store.createTaskStored({
        task_id: randomUUID(),
        patient_uuid: patientUuid,
        episode_id: episodeId,
        task_type: 'SAFETY_REVIEW',
        reason_code: 'SAFETY_REVIEW_REQUEST',
        source_event_id: 'evt-safety-engine-invariant',
        owner_clinician: null,
        now: T0,
        safetyAuthorization: SAFETY_AUTH,
      })
      let staffResolveThrew = false
      try {
        await store.resolveTaskStored(task.task_id, task.version, 'STAFF', T0)
      } catch (err) {
        staffResolveThrew = err instanceof Error && err.message.includes('safety_review_resolution_requires_clinician')
      }
      assert('safety-authz: the pure engine still refuses to resolve SAFETY_REVIEW under STAFF authority', staffResolveThrew)
      const stillOpen = await store.getTask(task.task_id, T0)
      assert('safety-authz: the refused STAFF resolve left the SAFETY_REVIEW task untouched (still OPEN)', stillOpen.status === 'OPEN')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }

  /* =====================================================================
     Part 11: GET /api/crm/tasks -- the Today Queue read path (round 11).
     Real HTTP-boundary regressions: doctor auth required; terminal tasks
     excluded; SAFETY_REVIEW > CLINICAL_REVIEW > ROUTINE ordering; overdue
     -> due_at -> created_at ordering within a priority; an expired
     CLAIMED lease self-heals to OPEN before the item is ever listed;
     fetching the queue never sets first_seen_at; no PHI/raw-phone-shaped
     string anywhere in the response; and the optional owner_clinician
     filter reuses the pure engine's own resolveTaskOwner/tasksForOwner
     semantics rather than any hardcoded policy.
     ===================================================================== */
  {
    const dataRoot = await mkdtemp(path.join(tmpdir(), 'samindang-crm-today-queue-'))
    // claimLeaseMinutes: 0 -- a claim's lease expires at the exact instant
    // it is granted, so any later real request (even a few ms later, as
    // an actual HTTP round trip always is) observes it as already expired
    // -- a deterministic-in-practice way to exercise real self-heal over
    // real HTTP without a timing-dependent sleep.
    const { server, base } = await startServer({ dataDir: path.join(dataRoot, 'submissions'), doctorToken: 'test-doctor-token', crmClaimLeaseMinutes: 0 })
    const headers = { 'content-type': 'application/json', 'x-doctor-token': 'test-doctor-token' }
    try {
      const visitRes = await fetch(`${base}/api/visits`, { method: 'POST', headers, body: JSON.stringify({}) })
      const visit = await visitRes.json()
      const epRes = await fetch(`${base}/api/crm/episodes`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ patient_uuid: visit.patient_id }),
      })
      const episode = await epRes.json()

      async function createTask(overrides) {
        const res = await fetch(`${base}/api/crm/tasks`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            patient_uuid: visit.patient_id,
            episode_id: episode.episode_id,
            task_type: 'ROUTINE',
            reason_code: 'REASSESSMENT_DUE',
            ...overrides,
          }),
        })
        const body = await res.json()
        return body.task
      }

      const routineFuture = await createTask({ source_event_id: 'evt-tq-routine-future', due_at: '2099-01-01T00:00:00.000Z' })
      const routineOverdue = await createTask({ source_event_id: 'evt-tq-routine-overdue', due_at: '2020-01-01T00:00:00.000Z' })
      const clinical = await createTask({ source_event_id: 'evt-tq-clinical', task_type: 'CLINICAL_REVIEW' })
      const safety = await createTask({
        source_event_id: 'evt-tq-safety',
        task_type: 'SAFETY_REVIEW',
        safetyAuthorization: { kind: 'EXPLICIT_HUMAN_REQUEST', requestedBy: 'doctor-test' },
      })
      const owned = await createTask({ source_event_id: 'evt-tq-owned', owner_clinician: 'clinician-x' })
      const unowned = await createTask({ source_event_id: 'evt-tq-unowned' })

      const terminal = await createTask({ source_event_id: 'evt-tq-terminal' })
      await fetch(`${base}/api/crm/tasks/${terminal.task_id}/cancel`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ expectedVersion: terminal.version }),
      })

      const claimedTask = await createTask({ source_event_id: 'evt-tq-claimed' })
      await fetch(`${base}/api/crm/tasks/${claimedTask.task_id}/claim`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ expectedVersion: claimedTask.version, claimedBy: 'clinician-y' }),
      })

      // 1. Auth required -- the established evil-Origin defense-in-depth
      // technique this suite and tests/server.spec.mjs already use.
      const unauthRes = await fetch(`${base}/api/crm/tasks`, { headers: { ...headers, origin: 'https://evil.example' } })
      assert('today-queue: GET /api/crm/tasks without valid doctor auth is rejected with 403', unauthRes.status === 403)

      const queueRes = await fetch(`${base}/api/crm/tasks`, { headers })
      assert('today-queue: authenticated GET /api/crm/tasks returns 200', queueRes.status === 200)
      const queueBody = await queueRes.json()
      const ids = queueBody.tasks.map((t) => t.task_id)

      // 2. Terminal tasks excluded.
      assert('today-queue: the CANCELLED task is excluded from the queue', !ids.includes(terminal.task_id))

      // 3. SAFETY_REVIEW > CLINICAL_REVIEW > ROUTINE ordering.
      const safetyIdx = ids.indexOf(safety.task_id)
      const clinicalIdx = ids.indexOf(clinical.task_id)
      const firstRoutineIdx = Math.min(ids.indexOf(routineOverdue.task_id), ids.indexOf(routineFuture.task_id))
      assert('today-queue: SAFETY_REVIEW sorts before CLINICAL_REVIEW', safetyIdx !== -1 && clinicalIdx !== -1 && safetyIdx < clinicalIdx)
      assert('today-queue: CLINICAL_REVIEW sorts before ROUTINE', clinicalIdx < firstRoutineIdx)

      // 4. Overdue -> due_at -> created_at ordering within ROUTINE.
      const overdueIdx = ids.indexOf(routineOverdue.task_id)
      const futureIdx = ids.indexOf(routineFuture.task_id)
      assert('today-queue: an overdue ROUTINE task sorts before a not-yet-due one', overdueIdx !== -1 && futureIdx !== -1 && overdueIdx < futureIdx)

      // 5. An expired CLAIMED lease self-heals to OPEN before listing.
      const claimedInQueue = queueBody.tasks.find((t) => t.task_id === claimedTask.task_id)
      assert('today-queue: a task claimed under a 0-minute lease is listed already self-healed to OPEN', claimedInQueue?.status === 'OPEN' && claimedInQueue?.claimed_by === null)

      // 6. Fetching the queue never sets first_seen_at.
      assert('today-queue: no task in the response has first_seen_at set merely from being listed', queueBody.tasks.every((t) => t.first_seen_at === null))

      // 7. No PHI/raw-phone-shaped string anywhere in the response.
      assert('today-queue: the queue response contains no phone-shaped string', !containsPhoneShapedString(queueBody))

      // owner_clinician filter reuses tasksForOwner/resolveTaskOwner --
      // no hardcoded clinician policy.
      const ownedQueueRes = await fetch(`${base}/api/crm/tasks?owner_clinician=clinician-x`, { headers })
      const ownedQueueBody = await ownedQueueRes.json()
      const ownedIds = ownedQueueBody.tasks.map((t) => t.task_id)
      assert('today-queue: owner_clinician filter includes the task owned by that clinician', ownedIds.includes(owned.task_id))
      assert('today-queue: owner_clinician filter excludes an unowned task (no coverage_queue configured)', !ownedIds.includes(unowned.task_id))
    } finally {
      await stopServer(server)
      await rm(dataRoot, { recursive: true, force: true })
    }
  }

  /* =====================================================================
     Part 12: SNOOZED Routine/Clinical tasks actually defer from the Today
     Queue until their explicit stored due_at (round 12 fix). Before this,
     listActionableTasks() included every non-terminal status, so
     snoozeTask() changed status/due_at but the queue kept showing the
     item immediately -- snooze was a no-op from the queue's perspective.
     No duration/SLA/grace-period/timezone rule is invented; only the
     already-stored absolute due_at is compared to server now, exactly
     the same string comparison sortCrmTaskQueue() already uses for
     overdue. SAFETY_REVIEW can never reach SNOOZED at all (the pure
     engine's own snoozeTask() guard, unchanged), so this can never
     weaken Safety visibility.
     ===================================================================== */
  {
    const root = await mkdtemp(path.join(tmpdir(), 'samindang-crm-snooze-queue-'))
    try {
      const store = createCrmStore(root, { claimLeaseMinutes: 60 })
      const episodeId = randomUUID()
      const patientUuid = randomUUID()
      await store.createEpisode({ episode_id: episodeId, patient_uuid: patientUuid, owner_clinician: null, now: T0 })

      const { task: routine } = await store.createTaskStored({
        task_id: randomUUID(),
        patient_uuid: patientUuid,
        episode_id: episodeId,
        task_type: 'ROUTINE',
        reason_code: 'REASSESSMENT_DUE',
        source_event_id: 'evt-snooze-queue-routine',
        owner_clinician: null,
        now: T0,
      })
      const { task: clinical } = await store.createTaskStored({
        task_id: randomUUID(),
        patient_uuid: patientUuid,
        episode_id: episodeId,
        task_type: 'CLINICAL_REVIEW',
        reason_code: 'CLINICIAN_REVIEW_REQUEST',
        source_event_id: 'evt-snooze-queue-clinical',
        owner_clinician: null,
        now: T0,
      })
      const { task: safety } = await store.createTaskStored({
        task_id: randomUUID(),
        patient_uuid: patientUuid,
        episode_id: episodeId,
        task_type: 'SAFETY_REVIEW',
        reason_code: 'SAFETY_REVIEW_REQUEST',
        source_event_id: 'evt-snooze-queue-safety',
        owner_clinician: null,
        now: T0,
        safetyAuthorization: SAFETY_AUTH,
      })

      const snoozeUntil = isoPlusMinutes(T0, 60)
      const snoozedRoutine = await store.snoozeTaskStored(routine.task_id, routine.version, snoozeUntil)
      const snoozedClinical = await store.snoozeTaskStored(clinical.task_id, clinical.version, snoozeUntil)
      assert('snooze-queue: snoozeTaskStored actually records SNOOZED + the given due_at', snoozedRoutine.status === 'SNOOZED' && snoozedRoutine.due_at === snoozeUntil && snoozedClinical.status === 'SNOOZED')

      // Safety cannot be weakened: the pure engine still refuses to snooze
      // a SAFETY_REVIEW task at all.
      let safetySnoozeThrew = false
      try {
        await store.snoozeTaskStored(safety.task_id, safety.version, snoozeUntil)
      } catch (err) {
        safetySnoozeThrew = err instanceof Error && err.message.includes('safety_review_cannot_be_snoozed')
      }
      assert('snooze-queue: SAFETY_REVIEW still cannot be snoozed at all', safetySnoozeThrew)

      // Before due_at: both are hidden from the queue.
      const beforeDue = await store.listActionableTasks(T0, {})
      const beforeDueIds = beforeDue.map((t) => t.task_id)
      assert('snooze-queue: future-snoozed ROUTINE is absent from the queue before its due_at', !beforeDueIds.includes(routine.task_id))
      assert('snooze-queue: future-snoozed CLINICAL_REVIEW is absent from the queue before its due_at', !beforeDueIds.includes(clinical.task_id))
      assert('snooze-queue: SAFETY_REVIEW remains visible throughout, unaffected by snooze semantics', beforeDueIds.includes(safety.task_id))

      // Exactly AT due_at: both reappear (the boundary is inclusive).
      const atDue = await store.listActionableTasks(snoozeUntil, {})
      const atDueIds = atDue.map((t) => t.task_id)
      assert('snooze-queue: ROUTINE reappears exactly at its stored due_at', atDueIds.includes(routine.task_id))
      assert('snooze-queue: CLINICAL_REVIEW reappears exactly at its stored due_at', atDueIds.includes(clinical.task_id))

      // After due_at: still present.
      const afterDue = await store.listActionableTasks(isoPlusMinutes(T0, 120), {})
      const afterDueIds = afterDue.map((t) => t.task_id)
      assert('snooze-queue: ROUTINE stays present once past its due_at', afterDueIds.includes(routine.task_id))
      assert('snooze-queue: CLINICAL_REVIEW stays present once past its due_at', afterDueIds.includes(clinical.task_id))

      // Listing (at any of the three points above) never mutated
      // first_seen_at, and never silently resolved/cancelled/superseded
      // anything -- confirmed by reading the tasks fresh from disk.
      const routineOnDisk = await store.getTask(routine.task_id, isoPlusMinutes(T0, 120))
      const clinicalOnDisk = await store.getTask(clinical.task_id, isoPlusMinutes(T0, 120))
      assert('snooze-queue: repeated listing never set first_seen_at on the ROUTINE task', routineOnDisk.first_seen_at === null)
      assert('snooze-queue: repeated listing never set first_seen_at on the CLINICAL_REVIEW task', clinicalOnDisk.first_seen_at === null)
      assert('snooze-queue: listing never silently resolved/cancelled/superseded the ROUTINE task (still SNOOZED)', routineOnDisk.status === 'SNOOZED')
      assert('snooze-queue: listing never silently resolved/cancelled/superseded the CLINICAL_REVIEW task (still SNOOZED)', clinicalOnDisk.status === 'SNOOZED')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }

  /* ---- same fix, driven over real HTTP: a far-future snooze is hidden;
     a snooze whose until has already elapsed (relative to real wall-clock
     time by the time the queue is fetched) reappears. ---- */
  {
    const dataRoot = await mkdtemp(path.join(tmpdir(), 'samindang-crm-snooze-queue-http-'))
    const { server, base } = await startServer({ dataDir: path.join(dataRoot, 'submissions'), doctorToken: 'test-doctor-token' })
    const headers = { 'content-type': 'application/json', 'x-doctor-token': 'test-doctor-token' }
    try {
      const visitRes = await fetch(`${base}/api/visits`, { method: 'POST', headers, body: JSON.stringify({}) })
      const visit = await visitRes.json()
      const epRes = await fetch(`${base}/api/crm/episodes`, { method: 'POST', headers, body: JSON.stringify({ patient_uuid: visit.patient_id }) })
      const episode = await epRes.json()

      async function createRoutineTask(sourceEventId) {
        const res = await fetch(`${base}/api/crm/tasks`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            patient_uuid: visit.patient_id,
            episode_id: episode.episode_id,
            task_type: 'ROUTINE',
            reason_code: 'REASSESSMENT_DUE',
            source_event_id: sourceEventId,
          }),
        })
        return (await res.json()).task
      }

      const futureSnoozed = await createRoutineTask('evt-snooze-queue-http-future')
      await fetch(`${base}/api/crm/tasks/${futureSnoozed.task_id}/snooze`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ expectedVersion: futureSnoozed.version, until: '2099-01-01T00:00:00.000Z' }),
      })

      const pastSnoozed = await createRoutineTask('evt-snooze-queue-http-past')
      await fetch(`${base}/api/crm/tasks/${pastSnoozed.task_id}/snooze`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ expectedVersion: pastSnoozed.version, until: new Date(Date.now() - 1000).toISOString() }),
      })

      const queueRes = await fetch(`${base}/api/crm/tasks`, { headers })
      const queueBody = await queueRes.json()
      const ids = queueBody.tasks.map((t) => t.task_id)
      assert('snooze-queue-http: a far-future snooze is hidden from GET /api/crm/tasks', !ids.includes(futureSnoozed.task_id))
      assert('snooze-queue-http: a snooze whose until has already elapsed is present in GET /api/crm/tasks', ids.includes(pastSnoozed.task_id))

      const pastSnoozedInQueue = queueBody.tasks.find((t) => t.task_id === pastSnoozed.task_id)
      assert('snooze-queue-http: the reappeared task still has first_seen_at null (listing is not exposure)', pastSnoozedInQueue?.first_seen_at === null)

      const futureCheck = await fetch(`${base}/api/crm/tasks/${futureSnoozed.task_id}`, { headers })
      const futureCheckBody = await futureCheck.json()
      assert('snooze-queue-http: the hidden future-snoozed task is untouched on disk (still SNOOZED)', futureCheckBody.status === 'SNOOZED')
    } finally {
      await stopServer(server)
      await rm(dataRoot, { recursive: true, force: true })
    }
  }

  /* =====================================================================
     Part 13: CRM v0.3.1 round 14 -- Sigma identity-linkage layer
     (patientIdentityStore.js). Store-level first (direct calls, no HTTP),
     then the real /api/crm/patient-identity(ies) HTTP boundary, matching
     this file's existing store-then-HTTP structure for every prior fix.
     ===================================================================== */

  /* ---- store-level: 1:1 uniqueness both directions, restart durability,
     fail-closed crash recovery ---- */
  {
    const root = await mkdtemp(path.join(tmpdir(), 'samindang-identity-store-'))
    try {
      const storeA = createPatientIdentityStore(root)
      const uuidA = randomUUID()
      const uuidB = randomUUID()

      assert('identity-store: unknown patient_uuid resolves to null, never guesses', (await storeA.getIdentityByPatientUuid(uuidA)) === null)

      const linkA = await storeA.linkPatientIdentity({
        patientUuid: uuidA,
        chartNo: 'CN-1001',
        patientName: '환자A',
        confirmedBy: 'staff-1',
        now: T0,
      })
      assert('identity-store: link created with the given chart_no', linkA.sigma_chart_no === 'CN-1001')
      assert('identity-store: link created with the given name', linkA.patient_name === '환자A')
      assert('identity-store: link record carries no rrn/phone field at all', !('rrn' in linkA) && !('phone' in linkA))

      // 1:1 direction 1 -- the SAME uuid cannot silently switch charts.
      let relinkThrew = null
      try {
        await storeA.linkPatientIdentity({ patientUuid: uuidA, chartNo: 'CN-9999', patientName: '환자A', confirmedBy: 'staff-2', now: T0 })
      } catch (err) {
        relinkThrew = err
      }
      assert('identity-store: relinking an already-linked uuid throws IdentityConflictError', relinkThrew instanceof IdentityConflictError)
      assert('identity-store: relink conflict reason is already_linked', relinkThrew?.reason === 'already_linked')
      const uuidAAfterRelinkAttempt = await storeA.getIdentityByPatientUuid(uuidA)
      assert('identity-store: a rejected relink leaves the original chart_no untouched', uuidAAfterRelinkAttempt.sigma_chart_no === 'CN-1001')

      // 1:1 direction 2 -- the SAME chart_no cannot be claimed by a second uuid.
      let dupChartThrew = null
      try {
        await storeA.linkPatientIdentity({ patientUuid: uuidB, chartNo: 'CN-1001', patientName: '환자B(오기입)', confirmedBy: 'staff-1', now: T0 })
      } catch (err) {
        dupChartThrew = err
      }
      assert('identity-store: linking a chart_no already claimed by a different uuid throws IdentityConflictError', dupChartThrew instanceof IdentityConflictError)
      assert('identity-store: duplicate-chart conflict reason is chart_already_linked', dupChartThrew?.reason === 'chart_already_linked')
      assert('identity-store: uuidB has no link after the rejected duplicate-chart attempt', (await storeA.getIdentityByPatientUuid(uuidB)) === null)

      // Restart durability: a completely fresh store instance over the
      // same directory (no shared in-memory state) sees the prior link.
      const storeRestarted = createPatientIdentityStore(root)
      const afterRestart = await storeRestarted.getIdentityByPatientUuid(uuidA)
      assert('identity-store: mapping survives a fresh store instance (restart) with the same chart_no', afterRestart?.sigma_chart_no === 'CN-1001')
      assert('identity-store: mapping survives a fresh store instance (restart) with the same name', afterRestart?.patient_name === '환자A')

      // Batch read never omits a requested uuid, even when unresolved --
      // this is what lets the client tell "no mapping" apart from "this
      // uuid's identity state simply wasn't returned" (see the HTTP block
      // below for the same guarantee at the wire level).
      const batch = await storeA.getIdentitiesByPatientUuids([uuidA, uuidB])
      assert('identity-store: batch read resolves the linked uuid', batch[uuidA]?.sigma_chart_no === 'CN-1001')
      assert('identity-store: batch read explicitly returns null (not omitted) for the unlinked uuid', uuidB in batch && batch[uuidB] === null)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }

  /* ---- store-level: failure-injection crash window between the chart
     pointer write and the uuid record write -- fails closed (no usable
     link yet), and a retry after unblocking converges to one completed
     link rather than a duplicate/corrupt one. ---- */
  {
    const root = await mkdtemp(path.join(tmpdir(), 'samindang-identity-crash-'))
    try {
      const store = createPatientIdentityStore(root)
      const uuid = randomUUID()
      const chartNo = 'CN-2002'
      const chartHash = createHash('sha256').update(chartNo, 'utf8').digest('hex')

      // Block the uuid record's own tmp write path -- the THIRD write in
      // linkPatientIdentity's order (pending marker, then chart pointer,
      // then the link record), so the first two are allowed to land
      // normally.
      const linkTmpPath = path.join(root, 'links', `${uuid}.json.tmp`)
      await mkdir(linkTmpPath, { recursive: true })

      let firstAttemptThrew = false
      try {
        await store.linkPatientIdentity({ patientUuid: uuid, chartNo, patientName: '환자C', confirmedBy: 'staff-1', now: T0 })
      } catch {
        firstAttemptThrew = true
      }
      assert('identity-crash: first attempt genuinely throws when the link-record write is blocked', firstAttemptThrew)

      const chartPointerOnDisk = await readRaw(path.join(root, 'by-chart', `${chartHash}.json`))
      assert('identity-crash: the chart pointer landed durably despite the interruption', chartPointerOnDisk?.patient_uuid === uuid)
      assert('identity-crash: no usable link exists yet -- fails closed rather than half-written', (await store.getIdentityByPatientUuid(uuid)) === null)

      // Unblock (remove the directory standing in for the tmp file) and retry.
      await rm(linkTmpPath, { recursive: true, force: true })
      const recovered = await store.linkPatientIdentity({ patientUuid: uuid, chartNo, patientName: '환자C', confirmedBy: 'staff-1', now: T0 })
      assert('identity-crash: retry after unblocking converges to a completed link', recovered.sigma_chart_no === chartNo)
      assert('identity-crash: the recovered link keeps the SAME chart_no reserved by the crashed attempt, not a second reservation', recovered.patient_uuid === uuid)

      // Chart_no is still 1:1 -- no orphan second pointer was created.
      const filesInChartIndex = (await readdir(path.join(root, 'by-chart'))).filter((f) => f.endsWith('.json'))
      assert('identity-crash: exactly one chart-index pointer exists after crash + retry (no orphan reservation)', filesInChartIndex.length === 1)

      const pendingFileAfterRecovery = await readRaw(path.join(root, 'pending', `${uuid}.json`))
      assert('identity-crash: the pending-reservation marker is cleaned up once the link completes', pendingFileAfterRecovery === null)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }

  /* ---- round-14 re-review fix: crash after the chart pointer for X is
     durable but before the link record lands, THEN a retry for the SAME
     uuid with a DIFFERENT (corrected) chart_no Y. The orphaned reverse
     pointer for X must be reclaimed -- not left permanently blocking X
     from ever being claimed by whoever actually holds it -- and the
     final on-disk state must have exactly one authoritative mapping. ---- */
  {
    const root = await mkdtemp(path.join(tmpdir(), 'samindang-identity-crash-corrected-chart-'))
    try {
      const store = createPatientIdentityStore(root)
      const uuid = randomUUID()
      const staleChartNo = 'CN-3003-WRONG'
      const correctedChartNo = 'CN-3003-RIGHT'
      const staleChartHash = createHash('sha256').update(staleChartNo, 'utf8').digest('hex')
      const correctedChartHash = createHash('sha256').update(correctedChartNo, 'utf8').digest('hex')

      // Block the link record's write so the crash lands exactly after the
      // chart pointer for the (mistaken) staleChartNo is durable.
      const linkTmpPath = path.join(root, 'links', `${uuid}.json.tmp`)
      await mkdir(linkTmpPath, { recursive: true })
      let firstAttemptThrew = false
      try {
        await store.linkPatientIdentity({ patientUuid: uuid, chartNo: staleChartNo, patientName: '환자D', confirmedBy: 'staff-1', now: T0 })
      } catch {
        firstAttemptThrew = true
      }
      assert('identity-crash-corrected: first attempt (wrong chart_no) genuinely throws when blocked', firstAttemptThrew)

      const stalePointerBeforeRetry = await readRaw(path.join(root, 'by-chart', `${staleChartHash}.json`))
      assert('identity-crash-corrected: the stale chart_no reverse pointer landed durably before the crash', stalePointerBeforeRetry?.patient_uuid === uuid)

      // Unblock, then the operator retries with the CORRECTED chart_no --
      // not the one that crashed.
      await rm(linkTmpPath, { recursive: true, force: true })
      const recovered = await store.linkPatientIdentity({ patientUuid: uuid, chartNo: correctedChartNo, patientName: '환자D', confirmedBy: 'staff-1', now: T0 })
      assert('identity-crash-corrected: the retry with the corrected chart_no succeeds', recovered.sigma_chart_no === correctedChartNo)

      const finalLink = await store.getIdentityByPatientUuid(uuid)
      assert('identity-crash-corrected: the authoritative link now names the CORRECTED chart_no', finalLink.sigma_chart_no === correctedChartNo)

      const stalePointerAfterRetry = await readRaw(path.join(root, 'by-chart', `${staleChartHash}.json`))
      assert('identity-crash-corrected: the orphaned stale-chart reverse pointer was reclaimed (removed), not left dangling', stalePointerAfterRetry === null)

      const correctedPointer = await readRaw(path.join(root, 'by-chart', `${correctedChartHash}.json`))
      assert('identity-crash-corrected: the corrected chart_no now has its own reverse pointer to this uuid', correctedPointer?.patient_uuid === uuid)

      // Exactly one authoritative chart mapping/reservation survives.
      const filesInChartIndex = (await readdir(path.join(root, 'by-chart'))).filter((f) => f.endsWith('.json'))
      assert('identity-crash-corrected: exactly one chart-index pointer exists for this uuid after the corrected retry', filesInChartIndex.length === 1)

      const pendingFileAfterRecovery = await readRaw(path.join(root, 'pending', `${uuid}.json`))
      assert('identity-crash-corrected: the pending-reservation marker is cleaned up once the corrected link completes', pendingFileAfterRecovery === null)

      // The released stale chart_no can now be claimed by a DIFFERENT
      // patient -- proving it was genuinely freed, not just hidden.
      const otherUuid = randomUUID()
      const claimedByOther = await store.linkPatientIdentity({
        patientUuid: otherUuid,
        chartNo: staleChartNo,
        patientName: '다른환자',
        confirmedBy: 'staff-2',
        now: T0,
      })
      assert('identity-crash-corrected: a different patient can now claim the released stale chart_no', claimedByOther.sigma_chart_no === staleChartNo)
      assert('identity-crash-corrected: the original uuid\'s own link is untouched by the other patient claiming the released chart', (await store.getIdentityByPatientUuid(uuid)).sigma_chart_no === correctedChartNo)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }

  /* ---- round-14 re-review fix: never touch a pointer owned by a
     DIFFERENT uuid, even if that other uuid's own pending record happens
     to still name the chart_no this uuid is trying to abandon. Defense in
     depth for the reclaim step's ownership guard. ---- */
  {
    const root = await mkdtemp(path.join(tmpdir(), 'samindang-identity-crash-no-cross-uuid-reclaim-'))
    try {
      const store = createPatientIdentityStore(root)
      const uuidA = randomUUID()
      const uuidB = randomUUID()
      const chartX = 'CN-4004-X'
      const chartY = 'CN-4004-Y'

      // A crashes after reserving X, then corrects to Y (reclaiming X).
      const linkTmpPathA = path.join(root, 'links', `${uuidA}.json.tmp`)
      await mkdir(linkTmpPathA, { recursive: true })
      try {
        await store.linkPatientIdentity({ patientUuid: uuidA, chartNo: chartX, patientName: '환자A', confirmedBy: 'staff-1', now: T0 })
      } catch {
        /* expected */
      }
      await rm(linkTmpPathA, { recursive: true, force: true })
      await store.linkPatientIdentity({ patientUuid: uuidA, chartNo: chartY, patientName: '환자A', confirmedBy: 'staff-1', now: T0 })

      // B now legitimately claims the released X.
      const claimedByB = await store.linkPatientIdentity({ patientUuid: uuidB, chartNo: chartX, patientName: '환자B', confirmedBy: 'staff-1', now: T0 })
      assert('identity-cross-uuid-guard: patient B legitimately claims the released chart X', claimedByB.sigma_chart_no === chartX)

      // Both links remain fully intact and correctly attributed.
      const finalA = await store.getIdentityByPatientUuid(uuidA)
      const finalB = await store.getIdentityByPatientUuid(uuidB)
      assert('identity-cross-uuid-guard: patient A still holds Y, unaffected by B claiming X afterward', finalA.sigma_chart_no === chartY)
      assert('identity-cross-uuid-guard: patient B holds X, correctly attributed', finalB.sigma_chart_no === chartX && finalB.patient_uuid === uuidB)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }

  /* ---- Identity Production Batch Part A: legacy reconciliation. A
     pre-6e2a4b6 deployment could crash after the by-chart pointer landed
     but with no pending marker at all (that marker did not exist yet).
     Simulate that exact on-disk shape directly (bypassing the store, so
     nothing here goes through the pending-marker code path) and prove a
     later corrected-chart retry still reclaims it via the lazy scan. ---- */
  {
    const root = await mkdtemp(path.join(tmpdir(), 'samindang-identity-legacy-'))
    try {
      const store = createPatientIdentityStore(root)
      const uuid = randomUUID()
      const staleChartNo = 'CN-5005-LEGACY-WRONG'
      const correctedChartNo = 'CN-5005-LEGACY-RIGHT'
      const staleHash = createHash('sha256').update(staleChartNo, 'utf8').digest('hex')

      // Force directory creation, then hand-write the legacy orphan
      // exactly as the pre-pending-marker code would have left it: a
      // by-chart pointer, no links/<uuid>.json, and crucially NO
      // pending/<uuid>.json.
      await store.getIdentityByPatientUuid(uuid)
      await mkdir(path.join(root, 'by-chart'), { recursive: true })
      await writeFile(
        path.join(root, 'by-chart', `${staleHash}.json`),
        JSON.stringify({ sigma_chart_no: staleChartNo, patient_uuid: uuid }),
        'utf8',
      )
      assert('identity-legacy: no pending marker exists for this legacy orphan (simulates the pre-fix version)', (await readRaw(path.join(root, 'pending', `${uuid}.json`))) === null)
      assert('identity-legacy: no completed link exists yet', (await store.getIdentityByPatientUuid(uuid)) === null)

      const recovered = await store.linkPatientIdentity({ patientUuid: uuid, chartNo: correctedChartNo, patientName: '환자E', confirmedBy: 'staff-1', now: T0 })
      assert('identity-legacy: the retry with the corrected chart_no succeeds despite no pending marker', recovered.sigma_chart_no === correctedChartNo)

      const stalePointerAfter = await readRaw(path.join(root, 'by-chart', `${staleHash}.json`))
      assert('identity-legacy: the legacy orphaned pointer was reclaimed via the lazy scan', stalePointerAfter === null)

      const filesInChartIndex = (await readdir(path.join(root, 'by-chart'))).filter((f) => f.endsWith('.json'))
      assert('identity-legacy: exactly one chart-index pointer exists after legacy reclaim', filesInChartIndex.length === 1)

      const otherUuid = randomUUID()
      const claimedByOther = await store.linkPatientIdentity({ patientUuid: otherUuid, chartNo: staleChartNo, patientName: '다른환자2', confirmedBy: 'staff-2', now: T0 })
      assert('identity-legacy: a different patient can now claim the released legacy chart_no', claimedByOther.sigma_chart_no === staleChartNo)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }

  /* ---- Identity Production Batch Part A: ambiguous/corrupt legacy state
     (more than one orphaned pointer names the same uuid) must fail closed
     rather than guess which one is real. Nothing is touched. ---- */
  {
    const root = await mkdtemp(path.join(tmpdir(), 'samindang-identity-legacy-ambiguous-'))
    try {
      const store = createPatientIdentityStore(root)
      const uuid = randomUUID()
      const chartP = 'CN-6006-P'
      const chartQ = 'CN-6006-Q'
      const hashP = createHash('sha256').update(chartP, 'utf8').digest('hex')
      const hashQ = createHash('sha256').update(chartQ, 'utf8').digest('hex')

      await store.getIdentityByPatientUuid(uuid)
      await mkdir(path.join(root, 'by-chart'), { recursive: true })
      await writeFile(path.join(root, 'by-chart', `${hashP}.json`), JSON.stringify({ sigma_chart_no: chartP, patient_uuid: uuid }), 'utf8')
      await writeFile(path.join(root, 'by-chart', `${hashQ}.json`), JSON.stringify({ sigma_chart_no: chartQ, patient_uuid: uuid }), 'utf8')

      let threw = null
      try {
        await store.linkPatientIdentity({ patientUuid: uuid, chartNo: 'CN-6006-R', patientName: '환자F', confirmedBy: 'staff-1', now: T0 })
      } catch (err) {
        threw = err
      }
      assert('identity-legacy-ambiguous: a link attempt with two competing legacy orphans throws IdentityConflictError', threw instanceof IdentityConflictError)
      assert('identity-legacy-ambiguous: the conflict reason names the ambiguity explicitly', threw?.reason === 'legacy_reservation_ambiguous')

      const pointerPAfter = await readRaw(path.join(root, 'by-chart', `${hashP}.json`))
      const pointerQAfter = await readRaw(path.join(root, 'by-chart', `${hashQ}.json`))
      assert('identity-legacy-ambiguous: neither ambiguous pointer was touched (fail closed, no guessing)', pointerPAfter?.sigma_chart_no === chartP && pointerQAfter?.sigma_chart_no === chartQ)
      assert('identity-legacy-ambiguous: no link was created for the uuid', (await store.getIdentityByPatientUuid(uuid)) === null)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }

  /* ---- Independent-review finding (#6): a pending marker only ever
     tracks the SINGLE most recent reservation attempt, so a uuid can
     carry a genuine legacy orphan (pre-marker crash) under one chart_no
     AT THE SAME TIME as a pending marker (post-upgrade crash) for a
     DIFFERENT chart_no. The legacy scan must not be skipped just because
     a pending marker happens to exist -- both stale reservations must be
     reclaimed by a single corrected-retry link call. ---- */
  {
    const root = await mkdtemp(path.join(tmpdir(), 'samindang-identity-legacy-plus-pending-'))
    try {
      const store = createPatientIdentityStore(root)
      const uuid = randomUUID()
      const legacyChartNo = 'CN-7007-LEGACY'
      const pendingChartNo = 'CN-7007-PENDING'
      const correctedChartNo = 'CN-7007-CORRECTED'
      const legacyHash = createHash('sha256').update(legacyChartNo, 'utf8').digest('hex')
      const pendingHash = createHash('sha256').update(pendingChartNo, 'utf8').digest('hex')

      await store.getIdentityByPatientUuid(uuid)
      await mkdir(path.join(root, 'by-chart'), { recursive: true })
      await mkdir(path.join(root, 'pending'), { recursive: true })
      // The legacy orphan: a by-chart pointer with no pending marker of
      // its own (pre-marker crash).
      await writeFile(path.join(root, 'by-chart', `${legacyHash}.json`), JSON.stringify({ sigma_chart_no: legacyChartNo, patient_uuid: uuid }), 'utf8')
      // The pending reservation: BOTH the by-chart pointer AND the
      // pending marker (post-marker crash, tracked by the O(1) path).
      await writeFile(path.join(root, 'by-chart', `${pendingHash}.json`), JSON.stringify({ sigma_chart_no: pendingChartNo, patient_uuid: uuid }), 'utf8')
      await writeFile(path.join(root, 'pending', `${uuid}.json`), JSON.stringify({ patient_uuid: uuid, sigma_chart_no: pendingChartNo }), 'utf8')

      const recovered = await store.linkPatientIdentity({ patientUuid: uuid, chartNo: correctedChartNo, patientName: '환자G', confirmedBy: 'staff-1', now: T0 })
      assert('identity-legacy-plus-pending: the retry with the corrected chart_no succeeds', recovered.sigma_chart_no === correctedChartNo)

      const legacyPointerAfter = await readRaw(path.join(root, 'by-chart', `${legacyHash}.json`))
      const pendingPointerAfter = await readRaw(path.join(root, 'by-chart', `${pendingHash}.json`))
      assert('identity-legacy-plus-pending: the legacy orphan (reached only via the scan) was reclaimed', legacyPointerAfter === null)
      assert('identity-legacy-plus-pending: the pending-tracked orphan (reached via the O(1) path) was reclaimed', pendingPointerAfter === null)

      const filesInChartIndex = (await readdir(path.join(root, 'by-chart'))).filter((f) => f.endsWith('.json'))
      assert('identity-legacy-plus-pending: exactly one chart-index pointer exists after both reclaims', filesInChartIndex.length === 1)

      const legacyOtherUuid = randomUUID()
      const claimedLegacy = await store.linkPatientIdentity({ patientUuid: legacyOtherUuid, chartNo: legacyChartNo, patientName: '다른환자3', confirmedBy: 'staff-2', now: T0 })
      assert('identity-legacy-plus-pending: a different patient can now claim the released legacy chart_no', claimedLegacy.sigma_chart_no === legacyChartNo)

      const pendingOtherUuid = randomUUID()
      const claimedPending = await store.linkPatientIdentity({ patientUuid: pendingOtherUuid, chartNo: pendingChartNo, patientName: '다른환자4', confirmedBy: 'staff-2', now: T0 })
      assert('identity-legacy-plus-pending: a different patient can now claim the released pending chart_no', claimedPending.sigma_chart_no === pendingChartNo)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }

  /* ---- real HTTP boundary: auth, validation, 1:1 conflicts, batch read
     truthfulness, and cross-patient Task/Episode isolation. ---- */
  {
    const dataRoot = await mkdtemp(path.join(tmpdir(), 'samindang-identity-http-'))
    const { server, base } = await startServer({ dataDir: path.join(dataRoot, 'submissions'), doctorToken: 'test-doctor-token' })
    const headers = { 'content-type': 'application/json', 'x-doctor-token': 'test-doctor-token' }
    try {
      const visitARes = await fetch(`${base}/api/visits`, { method: 'POST', headers, body: JSON.stringify({}) })
      const visitA = await visitARes.json()
      const visitBRes = await fetch(`${base}/api/visits`, { method: 'POST', headers, body: JSON.stringify({}) })
      const visitB = await visitBRes.json()

      // Evil-Origin request is rejected before any store access -- the
      // same defense-in-depth technique used throughout this suite (a
      // bare no-token request from loopback is intentionally ALLOWED by
      // this server's pilot-grade trust model, so evil-Origin is what
      // actually proves the auth guard).
      const unauthedRes = await fetch(`${base}/api/crm/patient-identity`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
        body: JSON.stringify({ patient_uuid: visitA.patient_id, sigma_chart_no: 'CN-3001', patient_name: '환자A' }),
      })
      assert('identity-http: POST without doctor auth (evil-Origin) is rejected (403)', unauthedRes.status === 403)

      // Unknown patient_uuid (typo'd/never-existed) is rejected -- linking
      // can never anchor to an arbitrary identifier, same rule every other
      // patient-linking route in this codebase already enforces.
      const unknownPatientRes = await fetch(`${base}/api/crm/patient-identity`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ patient_uuid: randomUUID(), sigma_chart_no: 'CN-3002', patient_name: '환자X' }),
      })
      assert('identity-http: POST for an unknown patient_uuid is rejected (400)', unknownPatientRes.status === 400)

      // Missing chart_no/name is rejected.
      const missingFieldsRes = await fetch(`${base}/api/crm/patient-identity`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ patient_uuid: visitA.patient_id }),
      })
      assert('identity-http: POST missing sigma_chart_no/patient_name is rejected (400)', missingFieldsRes.status === 400)

      // Real link for patient A. Body includes rrn/phone fields the route
      // never reads -- proves they cannot be smuggled into persistence.
      const linkRes = await fetch(`${base}/api/crm/patient-identity`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          patient_uuid: visitA.patient_id,
          sigma_chart_no: 'CN-3001',
          patient_name: '환자A',
          rrn: '900101-1234567',
          phone: '010-1234-5678',
        }),
      })
      const linkBody = await linkRes.json()
      assert('identity-http: POST creates the link (201)', linkRes.status === 201)
      assert('identity-http: created link carries the given chart_no', linkBody.sigma_chart_no === 'CN-3001')
      assert('identity-http: created link record has no rrn field', !('rrn' in linkBody))
      assert('identity-http: created link record has no phone field', !('phone' in linkBody))

      // Directly inspect the file on disk -- not just the response body --
      // to prove rrn/phone were never written, not merely omitted from
      // this particular response shape.
      const onDisk = await readRaw(path.join(dataRoot, 'crm-identity', 'links', `${visitA.patient_id}.json`))
      assert('identity-http: the persisted file itself has no rrn field', onDisk && !('rrn' in onDisk))
      assert('identity-http: the persisted file itself has no phone field', onDisk && !('phone' in onDisk))

      // Independent-review finding: the audit call for this event named an
      // event string ('patient_identity_linked') that was never added to
      // audit.js's ALLOWED_EVENTS, so it was silently dropped every time
      // (confirmed at runtime by the reviewer, then here). A permanent
      // identity assertion must leave a real trace.
      const auditRaw = await readFile(path.join(dataRoot, 'audit.log'), 'utf8').catch(() => '')
      const auditLines = auditRaw.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))
      assert('identity-http: linking writes a patient_identity_linked audit line', auditLines.some((l) => l.event === 'patient_identity_linked'))
      assert('identity-http: the audit line carries only the allowed minimal keys (no chart_no/name/uuid)', auditLines
        .filter((l) => l.event === 'patient_identity_linked')
        .every((l) => Object.keys(l).every((k) => ['ts', 'event', 'submission_id', 'status', 'actor', 'visit_id'].includes(k))))

      // No silent overwrite -- relinking the same patient is a 409, not a
      // 200 that quietly replaces the chart_no.
      const relinkRes = await fetch(`${base}/api/crm/patient-identity`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ patient_uuid: visitA.patient_id, sigma_chart_no: 'CN-9999', patient_name: '환자A' }),
      })
      assert('identity-http: relinking an already-linked patient_uuid is rejected (409)', relinkRes.status === 409)
      const relinkBody = await relinkRes.json()
      assert('identity-http: relink conflict names the reason', relinkBody.error === 'already_linked')
      // Independent-review finding (#5): the 409 body must let the doctor
      // see WHAT this uuid is already linked to, not just that a conflict
      // exists.
      assert('identity-http: relink conflict body names the existing chart_no', relinkBody.existing_sigma_chart_no === 'CN-3001')
      assert('identity-http: relink conflict body names the existing patient name', relinkBody.existing_patient_name === '환자A')

      // No cross-patient chart collision -- patient B cannot claim patient
      // A's chart_no.
      const crossChartRes = await fetch(`${base}/api/crm/patient-identity`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ patient_uuid: visitB.patient_id, sigma_chart_no: 'CN-3001', patient_name: '환자B(오기입)' }),
      })
      assert('identity-http: linking patient B to patient A\'s chart_no is rejected (409)', crossChartRes.status === 409)
      const crossChartBody = await crossChartRes.json()
      assert('identity-http: cross-chart conflict names the reason', crossChartBody.error === 'chart_already_linked')

      // Independent-review finding (#3): trim-only normalization let two
      // different casings of the SAME chart_no defeat the 1:1 invariant.
      // Patient B retries with a differently-cased version of A's exact
      // chart_no -- must still collide, not silently succeed as a
      // "different" chart_no.
      const caseVariantRes = await fetch(`${base}/api/crm/patient-identity`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ patient_uuid: visitB.patient_id, sigma_chart_no: 'cn-3001', patient_name: '환자B(오기입)' }),
      })
      assert('identity-http: a differently-cased duplicate of an already-claimed chart_no is rejected (409)', caseVariantRes.status === 409)
      const caseVariantBody = await caseVariantRes.json()
      assert('identity-http: lowercase/uppercase chart_no collide into the same conflict reason', caseVariantBody.error === 'chart_already_linked')

      // Batch read: patient A resolves, patient B (never linked) is
      // explicitly unresolved -- proves an unresolved lookup never shows
      // another patient's identity, and the key is present (not omitted)
      // so the client can distinguish "no mapping" from "not returned".
      const batchRes = await fetch(
        `${base}/api/crm/patient-identities?patient_uuid=${encodeURIComponent(visitA.patient_id)}&patient_uuid=${encodeURIComponent(visitB.patient_id)}`,
        { headers },
      )
      const batchBody = await batchRes.json()
      assert('identity-http: batch GET resolves patient A', batchBody.identities[visitA.patient_id]?.resolved === true)
      assert('identity-http: batch GET resolved patient A carries the correct name', batchBody.identities[visitA.patient_id]?.patient_name === '환자A')
      assert('identity-http: batch GET explicitly marks patient B unresolved (never guesses/leaks patient A\'s identity)', batchBody.identities[visitB.patient_id]?.resolved === false)
      assert('identity-http: unresolved entry names a reason', batchBody.identities[visitB.patient_id]?.reason === 'no_mapping')

      // Independent-review finding (#8): a malformed patient_uuid query
      // value must never reach the store's file-path derivation -- the
      // route filters it out before the store call, so it is simply
      // absent from the response rather than causing an error or a bogus
      // filesystem lookup.
      const malformedBatchRes = await fetch(
        `${base}/api/crm/patient-identities?patient_uuid=${encodeURIComponent(visitA.patient_id)}&patient_uuid=${encodeURIComponent('../../etc/passwd')}`,
        { headers },
      )
      const malformedBatchBody = await malformedBatchRes.json()
      assert('identity-http: batch GET still returns 200 when a malformed patient_uuid is present alongside a valid one', malformedBatchRes.status === 200)
      assert('identity-http: batch GET resolves the valid uuid despite the malformed one being present', malformedBatchBody.identities[visitA.patient_id]?.resolved === true)
      assert('identity-http: batch GET drops the malformed uuid entirely rather than echoing it back', !('../../etc/passwd' in malformedBatchBody.identities))

      // Cross-patient Task/Episode isolation: create a CRM task for
      // UNLINKED patient B, confirm linking patient A's identity has zero
      // effect on it -- the Today Queue source of truth (GET
      // /api/crm/tasks) is untouched by identity-linkage operations.
      const epBRes = await fetch(`${base}/api/crm/episodes`, { method: 'POST', headers, body: JSON.stringify({ patient_uuid: visitB.patient_id }) })
      const epB = await epBRes.json()
      const taskBRes = await fetch(`${base}/api/crm/tasks`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          patient_uuid: visitB.patient_id,
          episode_id: epB.episode_id,
          task_type: 'ROUTINE',
          reason_code: 'REASSESSMENT_DUE',
          source_event_id: 'evt-identity-isolation',
        }),
      })
      const taskBBefore = (await taskBRes.json()).task

      // Now actually link patient B's identity too, then re-fetch the task.
      await fetch(`${base}/api/crm/patient-identity`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ patient_uuid: visitB.patient_id, sigma_chart_no: 'CN-4004', patient_name: '환자B' }),
      })
      const taskBAfterRes = await fetch(`${base}/api/crm/tasks/${taskBBefore.task_id}`, { headers })
      const taskBAfter = await taskBAfterRes.json()
      assert('identity-isolation: linking a patient\'s identity never rewrites their existing Task\'s patient_uuid', taskBAfter.patient_uuid === visitB.patient_id)
      assert('identity-isolation: linking a patient\'s identity never mutates Task status as a side effect', taskBAfter.status === taskBBefore.status)
      assert('identity-isolation: linking a patient\'s identity never sets first_seen_at as a side effect', taskBAfter.first_seen_at === taskBBefore.first_seen_at)

      // And patient A's identity link is untouched by patient B's link
      // having been created afterwards (both directions of isolation).
      const identityAAfterBRes = await fetch(`${base}/api/crm/patient-identities?patient_uuid=${encodeURIComponent(visitA.patient_id)}`, { headers })
      const identityAAfterB = await identityAAfterBRes.json()
      assert('identity-isolation: patient A\'s resolved identity is unaffected by patient B being linked afterwards', identityAAfterB.identities[visitA.patient_id]?.sigma_chart_no === 'CN-3001')
    } finally {
      await stopServer(server)
      await rm(dataRoot, { recursive: true, force: true })
    }
  }

  /* =====================================================================
     Purge completeness (Purge completeness batch): the original
     Independent-review finding (#7) below only proved crm-identity/ gets
     removed. Extended here to prove the FULL pilot-end-purge promise
     end-to-end -- seed one instance of every persistence family this round
     added purge coverage for (visits/ + its visit-owned workspace, crm/
     Episode+Task, crm-identity/, submissions/, audit.log), verify each one
     genuinely exists first, run the real purge script via execFileSync
     (never the store function directly -- this must prove the actual
     operator-facing script, same as the original finding below), then
     prove: nothing wanders outside the data root, every seeded family is
     gone, a second purge on the empty root is a no-op (not a crash), and a
     completely fresh server instance pointed at the purged root sees
     genuinely empty state everywhere -- no phantom recovered tasks from a
     leftover dedup pointer, no orphan identity pointer, nothing.
     ===================================================================== */
  {
    const dataRoot = await mkdtemp(path.join(tmpdir(), 'samindang-purge-full-'))
    const submissionsDir = path.join(dataRoot, 'submissions')
    // A sentinel OUTSIDE dataRoot entirely -- proves the purge script can
    // never wander past its explicit, hand-enumerated directory list (see
    // scripts/purge-data.mjs's own header comment on why it uses an
    // explicit list rather than "scan dataRoot's parent and delete
    // everything not on an exclude list").
    const sentinelRoot = await mkdtemp(path.join(tmpdir(), 'samindang-purge-sentinel-'))
    const sentinelFile = path.join(sentinelRoot, 'must-survive.txt')
    let server
    try {
      await writeFile(sentinelFile, 'must survive the purge', 'utf8')

      ;({ server } = await startServer({ dataDir: submissionsDir, doctorToken: 'test-doctor-token' }))
      const base = `http://127.0.0.1:${server.address().port}`
      const headers = { 'content-type': 'application/json', 'x-doctor-token': 'test-doctor-token' }

      /* ---- seed: one instance of every family this batch covers ---- */

      // (a) a real submission via the actual patient-facing HTTP route.
      const submissionRes = await fetch(`${base}/api/submissions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ questionnaire_version: '1.0', session_id: 'purge-seed-submission', responses: { patient: {} } }),
      })
      const submission = await submissionRes.json()
      assert('purge-full: seed submission created (201)', submissionRes.status === 201)

      // (b) a revisit visit (visits/, no submission_id) with a saved
      // visit-owned workspace -- exercises the visits/ purge coverage this
      // batch specifically added.
      const revisitPatientVisit = await (await fetch(`${base}/api/visits`, { method: 'POST', headers, body: '{}' })).json()
      const revisitStart = await (
        await fetch(`${base}/api/patients/${revisitPatientVisit.patient_id}/start-revisit`, { method: 'POST', headers, body: '{}' })
      ).json()
      const revisitVisitId = revisitStart.visit.id
      const visitWorkspaceRes = await fetch(`${base}/api/visits/${revisitVisitId}/workspace`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ note: 'purge-seed visit workspace' }),
      })
      assert('purge-full: seed visit workspace saved (200)', visitWorkspaceRes.status === 200)

      // (c) a CRM episode + task (crm/).
      const episode = await (
        await fetch(`${base}/api/crm/episodes`, { method: 'POST', headers, body: JSON.stringify({ patient_uuid: revisitPatientVisit.patient_id }) })
      ).json()
      const taskRes = await fetch(`${base}/api/crm/tasks`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          patient_uuid: episode.patient_uuid,
          episode_id: episode.episode_id,
          task_type: 'ROUTINE',
          reason_code: 'REASSESSMENT_DUE',
          source_event_id: 'evt-purge-seed',
        }),
      })
      assert('purge-full: seed CRM task created (201)', taskRes.status === 201)

      // (d) the pre-existing identity-link scenario (crm-identity/),
      // unchanged from the original Independent-review finding (#7).
      const identityStore = createPatientIdentityStore(path.join(dataRoot, 'crm-identity'))
      const identityUuid = randomUUID()
      await identityStore.linkPatientIdentity({ patientUuid: identityUuid, chartNo: 'CN-8008', patientName: '환자H', confirmedBy: 'staff-1', now: T0 })

      // (e) a station registration + assignment (stations/). Independent-
      // review finding: earlier this only exercised stations/ implicitly
      // via follow-up-sessions/, and neither had a verify-gone assertion --
      // both are seeded and checked explicitly now.
      const stationReg = await (await fetch(`${base}/api/stations`, { method: 'POST', headers, body: JSON.stringify({ name: 'purge-seed 스테이션' }) })).json()
      const stationPatientVisit = await (await fetch(`${base}/api/visits`, { method: 'POST', headers, body: '{}' })).json()
      const stationAssign = await fetch(`${base}/api/stations/${stationReg.station.station_id}/assign`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ patient_id: stationPatientVisit.patient_id, delivery_mode: 'CLINIC_TABLET' }),
      })
      assert('purge-full: seed station assignment created (201)', stationAssign.status === 201)

      // (f) a recorder result save (recorder-results/).
      const recorderVisit = await (await fetch(`${base}/api/visits`, { method: 'POST', headers, body: '{}' })).json()
      const recorderRes = await fetch(`${base}/api/visits/${recorderVisit.id}/recorder-results`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ recording_id: 'purge-seed-rec-1', transcript: '테스트', structured_note: null, source: { workstation_id: 'PURGE-SEED' } }),
      })
      assert('purge-full: seed recorder result saved (201)', recorderRes.status === 201)

      // (g) a micro-follow-up response save (micro-follow-up/).
      const microVisit = await (await fetch(`${base}/api/visits`, { method: 'POST', headers, body: '{}' })).json()
      const microRes = await fetch(`${base}/api/visits/${microVisit.id}/micro-follow-up`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ targetRatings: [], overallChange: '좋아짐', newSymptomReported: false, newSymptomNote: '', adverseEffectReported: false, adverseEffectNote: '' }),
      })
      assert('purge-full: seed micro-follow-up response saved (201)', microRes.status === 201)

      // (h) a Quick Revisit outbound message (messaging/) -- reuses the
      // revisit visit/token already minted in (b). The mock SOLAPI
      // transport (no real credentials configured in this test process)
      // sends it successfully, so it lands on disk as a real MessageRecord.
      const messageRes = await fetch(`${base}/api/visits/${revisitVisitId}/messages`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          patient_id: revisitPatientVisit.patient_id,
          phone: '01000000001',
          follow_up_token: revisitStart.token,
          link: 'https://example.invalid/#follow-up=purge-seed-token',
        }),
      })
      assert('purge-full: seed Quick Revisit message queued (201)', messageRes.status === 201)

      // (i) audit.log -- every HTTP action above already wrote to it.

      /* ---- verify-exists: every seeded family is genuinely on disk
         BEFORE the purge, so the "verify-gone" assertions below are
         meaningful and not vacuously true. ---- */
      assert('purge-full: sanity -- submission file exists before purge', (await readRaw(path.join(submissionsDir, `${submission.id}.json`))) !== null)
      const visitFileBefore = await readRaw(path.join(dataRoot, 'visits', `${revisitVisitId}.json`))
      assert('purge-full: sanity -- revisit visit file exists with its saved workspace before purge', visitFileBefore?.workspace?.note === 'purge-seed visit workspace')
      assert('purge-full: sanity -- crm episode file exists before purge', (await readRaw(path.join(dataRoot, 'crm', 'episodes', `${episode.episode_id}.json`))) !== null)
      const crmTasksBefore = (await readdir(path.join(dataRoot, 'crm', 'tasks'))).filter((f) => f.endsWith('.json'))
      assert('purge-full: sanity -- crm task file exists before purge', crmTasksBefore.length > 0)
      assert('purge-full: sanity -- crm-identity link file exists before purge', (await readRaw(path.join(dataRoot, 'crm-identity', 'links', `${identityUuid}.json`))) !== null)
      const stationsBefore = (await readdir(path.join(dataRoot, 'stations', 'stations'))).filter((f) => f.endsWith('.json'))
      assert('purge-full: sanity -- station file exists before purge', stationsBefore.length > 0)
      const recorderResultsBefore = (await readdir(path.join(dataRoot, 'recorder-results', recorderVisit.id))).filter((f) => f.endsWith('.json'))
      assert('purge-full: sanity -- recorder result file exists before purge', recorderResultsBefore.length > 0)
      assert('purge-full: sanity -- micro-follow-up response file exists before purge', (await readRaw(path.join(dataRoot, 'micro-follow-up', `${microVisit.id}.json`))) !== null)
      const followUpTokensBefore = (await readdir(path.join(dataRoot, 'follow-up-sessions', 'tokens'))).filter((f) => f.endsWith('.json'))
      assert('purge-full: sanity -- a follow-up-session token file exists before purge', followUpTokensBefore.length > 0)
      const messagingBefore = (await readdir(path.join(dataRoot, 'messaging'))).filter((f) => f.endsWith('.json'))
      assert('purge-full: sanity -- a Quick Revisit message file exists before purge', messagingBefore.length > 0)
      const auditRawBefore = await readFile(path.join(dataRoot, 'audit.log'), 'utf8').catch(() => '')
      assert('purge-full: sanity -- audit.log has content before purge', auditRawBefore.trim().length > 0)

      // Drift-guard: the exact set of top-level entries this seeding
      // produces. If a FUTURE round adds a new persistence directory
      // without updating this test (or scripts/purge-data.mjs's own
      // inventory comment), a new, unexpected entry shows up here and this
      // assertion fails loudly instead of the gap going unnoticed.
      const topLevelBeforePurge = (await readdir(dataRoot)).sort()
      const expectedTopLevel = [
        'audit.log',
        'crm',
        'crm-identity',
        'follow-up-sessions',
        'messaging',
        'micro-follow-up',
        'recorder-results',
        'stations',
        'submissions',
        'visits',
      ].sort()
      assert(
        'purge-full: drift-guard -- top-level entries under the data root are exactly what this seeding is expected to produce',
        JSON.stringify(topLevelBeforePurge) === JSON.stringify(expectedTopLevel),
      )

      // Closing-review finding (round 2, item a): the five purgeAll()
      // rewrites from a per-file unlink('*.json') loop to rm(dir,
      // {recursive:true,force:true}) close the orphan *.json.tmp gap --
      // atomicWrite (writeFile(tmp) then rename(tmp, filePath)) leaves a
      // `<file>.json.tmp` behind if the process crashes between the write
      // and the rename, and it can hold full clinical content. That fix
      // shipped with no regression test defending it, so a future round
      // silently reverting any of the five back to a `*.json` unlink loop
      // would stay green here. Seed one orphan .tmp per rm-rf'd family,
      // matching the exact filename shape atomicWrite produces, and prove
      // none of them survive the real purge script below.
      const orphanTmpPaths = [
        path.join(submissionsDir, 'orphan-purge-seed.json.tmp'),
        path.join(dataRoot, 'visits', 'orphan-purge-seed.json.tmp'),
        path.join(dataRoot, 'micro-follow-up', 'orphan-purge-seed.json.tmp'),
        path.join(dataRoot, 'follow-up-sessions', 'tokens', 'orphan-purge-seed.json.tmp'),
        path.join(dataRoot, 'stations', 'stations', 'orphan-purge-seed.json.tmp'),
        path.join(dataRoot, 'recorder-results', recorderVisit.id, 'orphan-purge-seed.json.tmp'),
        path.join(dataRoot, 'messaging', 'orphan-purge-seed.json.tmp'),
      ]
      for (const tmpPath of orphanTmpPaths) {
        await mkdir(path.dirname(tmpPath), { recursive: true })
        await writeFile(tmpPath, '{"orphan":true}', 'utf8')
      }
      for (const tmpPath of orphanTmpPaths) {
        const seeded = await access(tmpPath).then(() => true).catch(() => false)
        assert(`purge-full: sanity -- orphan .json.tmp seeded before purge (${path.relative(dataRoot, tmpPath)})`, seeded)
      }

      await stopServer(server)
      server = undefined

      /* ---- run the actual operator-facing script (not the store function
         directly) ---- */
      execFileSync(process.execPath, [path.join(process.cwd(), 'scripts', 'purge-data.mjs'), '--yes'], {
        env: { ...process.env, SAMINDANG_DATA_DIR: submissionsDir },
      })

      /* ---- sentinel outside dataRoot is completely untouched ---- */
      assert('purge-full: a sentinel file OUTSIDE the data root survives the purge untouched', (await readFile(sentinelFile, 'utf8')) === 'must survive the purge')

      /* ---- verify-gone: every seeded family ---- */
      const submissionFilesAfter = await readdir(submissionsDir).catch(() => [])
      assert('purge-full: no submission files remain', submissionFilesAfter.filter((f) => f.endsWith('.json')).length === 0)
      const visitFilesAfter = await readdir(path.join(dataRoot, 'visits')).catch(() => [])
      assert('purge-full: visits/ has no .json files remaining (or the directory itself is gone)', visitFilesAfter.filter((f) => f.endsWith('.json')).length === 0)
      // Independent-review finding: follow-up-sessions/ was seeded by this
      // test but never actually checked as gone -- a surviving live
      // capability token is exactly the class of leak this batch cares
      // about. stations/, recorder-results/, micro-follow-up/ were not
      // seeded at all before, so a leak in any of them was structurally
      // invisible to this test regardless of what the purge script did.
      const followUpTokensAfter = await readdir(path.join(dataRoot, 'follow-up-sessions', 'tokens')).catch(() => [])
      assert('purge-full: follow-up-sessions/tokens has no .json files remaining (or the directory itself is gone)', followUpTokensAfter.filter((f) => f.endsWith('.json')).length === 0)
      const stationFilesAfter = await readdir(path.join(dataRoot, 'stations', 'stations')).catch(() => [])
      assert('purge-full: stations/ has no .json files remaining (or the directory itself is gone)', stationFilesAfter.filter((f) => f.endsWith('.json')).length === 0)
      const recorderResultsAfter = await readdir(path.join(dataRoot, 'recorder-results')).catch(() => [])
      assert('purge-full: recorder-results/ is empty or gone', recorderResultsAfter.length === 0)
      const microFollowUpAfter = await readdir(path.join(dataRoot, 'micro-follow-up')).catch(() => [])
      assert('purge-full: micro-follow-up/ has no .json files remaining (or the directory itself is gone)', microFollowUpAfter.filter((f) => f.endsWith('.json')).length === 0)
      const crmDirGone = await access(path.join(dataRoot, 'crm')).then(() => false).catch(() => true)
      assert('purge-full: crm/ is gone entirely', crmDirGone)
      const identityDirGone = await access(path.join(dataRoot, 'crm-identity')).then(() => false).catch(() => true)
      assert('purge-full: crm-identity/ is gone entirely, not just submissions/', identityDirGone)
      const messagingDirGone = await access(path.join(dataRoot, 'messaging')).then(() => false).catch(() => true)
      assert('purge-full: messaging/ is gone entirely, not just submissions/', messagingDirGone)
      const auditLogGone = await access(path.join(dataRoot, 'audit.log')).then(() => false).catch(() => true)
      assert('purge-full: audit.log is gone (purgeAuditLog unlinks it)', auditLogGone)

      // Closing-review finding (round 2, item a): the orphan .json.tmp
      // seeded above per rm-rf'd family must not survive the purge. A
      // regression back to a per-file unlink('*.json') loop in any of the
      // five stores would leave its orphan behind and fail exactly this.
      for (const tmpPath of orphanTmpPaths) {
        const stillExists = await access(tmpPath).then(() => true).catch(() => false)
        assert(`purge-full: orphan .json.tmp does not survive the purge (${path.relative(dataRoot, tmpPath)})`, !stillExists)
      }

      /* ---- idempotency: running the purge again on the now-empty root
         must not throw (ENOENT-tolerant everywhere) ---- */
      let secondRunThrew = false
      try {
        execFileSync(process.execPath, [path.join(process.cwd(), 'scripts', 'purge-data.mjs'), '--yes'], {
          env: { ...process.env, SAMINDANG_DATA_DIR: submissionsDir },
        })
      } catch {
        secondRunThrew = true
      }
      assert('purge-full: running the purge script again on an already-purged root exits cleanly (idempotent)', !secondRunThrew)

      /* ---- restart-clean: a completely FRESH server instance pointed at
         the purged root sees genuinely empty state everywhere -- no
         phantom recovered tasks from a leftover dedup pointer, no orphan
         identity pointer, nothing surviving a restart. ---- */
      ;({ server } = await startServer({ dataDir: submissionsDir, doctorToken: 'test-doctor-token' }))
      const freshBase = `http://127.0.0.1:${server.address().port}`

      const submissionsAfter = await (await fetch(`${freshBase}/api/submissions`, { headers })).json()
      assert('purge-full: restart-clean -- GET /api/submissions is empty', Array.isArray(submissionsAfter) && submissionsAfter.length === 0)

      const tasksAfter = await (await fetch(`${freshBase}/api/crm/tasks`, { headers })).json()
      assert('purge-full: restart-clean -- the CRM Today Queue is empty', Array.isArray(tasksAfter.tasks) && tasksAfter.tasks.length === 0)

      const revisitsAfter = await (await fetch(`${freshBase}/api/visits/revisits`, { headers })).json()
      assert('purge-full: restart-clean -- the revisit queue is empty', Array.isArray(revisitsAfter) && revisitsAfter.length === 0)

      const stationsAfter = await (await fetch(`${freshBase}/api/stations`, { headers })).json()
      assert('purge-full: restart-clean -- the stations list is empty', Array.isArray(stationsAfter.stations) && stationsAfter.stations.length === 0)

      const messagesAfter = await (await fetch(`${freshBase}/api/visits/${revisitVisitId}/messages`, { headers })).json()
      assert('purge-full: restart-clean -- the previously-seeded visit has no surviving messages', Array.isArray(messagesAfter.messages) && messagesAfter.messages.length === 0)

      const identityAfter = await (
        await fetch(`${freshBase}/api/crm/patient-identities?patient_uuid=${encodeURIComponent(identityUuid)}`, { headers })
      ).json()
      assert(
        'purge-full: restart-clean -- the previously-linked patient_uuid resolves false (no orphan identity pointer survives)',
        identityAfter.identities[identityUuid]?.resolved === false,
      )
    } finally {
      if (server) await stopServer(server)
      await rm(dataRoot, { recursive: true, force: true })
      await rm(sentinelRoot, { recursive: true, force: true })
    }
  }

  console.log(`\n${passCount} CRM store persistence assertions passed.`)
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
