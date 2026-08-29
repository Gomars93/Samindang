// CRM v0.3.1 persistence suite (round 6): restart durability, concurrency/
// version-conflict behavior, and filesystem failure-injection at the
// server/crmStore.js store boundary. Plain node, no test framework: assert()
// prints "OK: <name>" and throws on failure -- same convention as
// tests/server.spec.mjs / tests/follow-up-session.spec.mjs. No build step:
// crmStore.js itself imports src/crm/*.ts directly via Node's native TS
// execution, so this file can just `node tests/crm-store.spec.mjs`.
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { createCrmStore, CrmConflictError, CrmNotFoundError } from '../server/crmStore.js'

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

const T0 = '2026-01-01T00:00:00.000Z'
function isoPlusMinutes(iso, minutes) {
  return new Date(Date.parse(iso) + minutes * 60 * 1000).toISOString()
}

const SAFETY_AUTH = { kind: 'EXPLICIT_HUMAN_REQUEST', requestedBy: 'doctor-test' }

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
     Part 4: failure injection on task creation -- block the tasks
     directory itself (the first write createTaskStored attempts) so the
     call fails before any file at all is written, and confirm no dedup
     pointer or task file was left behind for a subsequent, unblocked call
     to trip over.
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

      // No dedup pointer was written either (it is written strictly after
      // the task file in createTaskStored), so a retry is a clean create,
      // not a phantom dedup match against a task that does not exist.
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
      assert('create-failure: retry after unblocking creates cleanly, not a phantom dedup', deduped === false && retriedTask.status === 'OPEN')
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
