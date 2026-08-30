// CRM v0.3.1 persistence layer (round 6): Episode/CrmTask, reusing the pure
// state-engine functions in src/crm/ directly rather than reimplementing
// any transition here. This file imports the .ts sources with no build
// step -- Node's own type-stripping runs them as-is, matching this
// server's existing "run directly with `node server/index.js`" contract
// (see index.js's header comment). Every relative import inside src/crm/
// carries an explicit .ts extension (tsconfig's allowImportingTsExtensions
// already permitted this) specifically so Node's ESM resolver -- unlike
// tsc/vite -- can follow it with no bundler in between.
//
// One file per Episode/CrmTask, keyed by id (episodes/<id>.json,
// tasks/<id>.json), the same convention as every other store in this
// directory. Idempotent task creation is backed by a durable dedup index
// (dedup/<sha256(dedup_key)>.json -> {task_id}) instead of the pure
// engine's in-memory existingTasks array, so "same source event -> one
// task" holds across a process restart, not only within one request --
// see createTaskStored.
import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { newEpisode } from '../src/crm/types.ts'
import {
  createCrmTask,
  resolveTask,
  snoozeTask,
  cancelTask,
  supersedeTask,
  claimTask,
  releaseExpiredClaim,
  markTaskSeen,
  computeDedupKey,
  deriveEpisodeReviewState,
  sortCrmTaskQueue,
  tasksForOwner,
  assertNoRawPhone,
  CrmConflictError,
} from '../src/crm/taskEngine.ts'
import { pauseEpisode, completeEpisode, reopenEpisode } from '../src/crm/episode.ts'
import { recalculateMedicationTasksOnStartShift } from '../src/crm/medicationCourse.ts'

export { CrmConflictError }

// Medication/Herbal-course batch: which CrmReasonCode values a
// MedicationCourse's own check-task routes may create -- single source of
// truth so server/index.js validates against the exact same set rather
// than a second, separately-maintained literal list.
export const MEDICATION_COURSE_REASON_CODES = new Set(['MEDICATION_START_CHECK', 'MEDICATION_MID_CHECK', 'MEDICATION_END_CHECK'])

export class CrmNotFoundError extends Error {
  constructor(kind, id) {
    super(`${kind} not found: ${id}`)
    this.name = 'CrmNotFoundError'
  }
}

// Episode↔Medication association integrity batch: distinct from
// CrmNotFoundError (the resource exists) and from CrmConflictError (not a
// stale-version write) -- the episode_id the caller supplied resolves to a
// real Episode, but one belonging to a DIFFERENT patient than the caller's
// own explicitly-declared context. A buggy/stale client passing episode A
// while operating in patient B's context must fail closed here, before any
// write, rather than silently attach a course to the wrong patient's
// Episode.
export class CrmOwnershipError extends Error {
  constructor(kind, id) {
    super(`${kind} ${id} does not belong to the supplied patient context`)
    this.name = 'CrmOwnershipError'
  }
}

const TERMINAL_TASK_STATUSES = new Set(['DONE', 'CANCELLED', 'SUPERSEDED'])

function episodesDir(baseDir) {
  return path.join(baseDir, 'episodes')
}
function tasksDir(baseDir) {
  return path.join(baseDir, 'tasks')
}
function dedupDir(baseDir) {
  return path.join(baseDir, 'dedup')
}
function episodePath(baseDir, id) {
  return path.join(episodesDir(baseDir), `${id}.json`)
}
function taskPath(baseDir, id) {
  return path.join(tasksDir(baseDir), `${id}.json`)
}
function dedupPath(baseDir, hash) {
  return path.join(dedupDir(baseDir), `${hash}.json`)
}
// Medication/Herbal-course batch: sibling subdirs of the same CRM baseDir,
// same file-per-id + dedup-index convention as episodes/tasks above -- a
// MedicationCourse is CRM-domain data, so it lives inside the same crm/
// directory scripts/purge-data.mjs already deletes wholesale (rm -rf
// crm/), needing no changes there or to its drift-guard test.
function medicationCoursesDir(baseDir) {
  return path.join(baseDir, 'medication-courses')
}
function medicationCourseDedupDir(baseDir) {
  return path.join(baseDir, 'medication-course-dedup')
}
function medicationCoursePath(baseDir, id) {
  return path.join(medicationCoursesDir(baseDir), `${id}.json`)
}
function medicationCourseDedupPath(baseDir, hash) {
  return path.join(medicationCourseDedupDir(baseDir), `${hash}.json`)
}

function hashDedupKey(key) {
  return createHash('sha256').update(key, 'utf8').digest('hex')
}

async function atomicWrite(filePath, data) {
  const tmp = `${filePath}.tmp`
  await writeFile(tmp, JSON.stringify(data, null, 2), 'utf8')
  await rename(tmp, filePath)
}

async function readJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'))
  } catch (err) {
    if (err.code === 'ENOENT') return null
    throw err
  }
}

const locks = new Map()
function withLock(key, fn) {
  const prev = locks.get(key) ?? Promise.resolve()
  const run = prev.then(fn, fn)
  const settled = run.then(
    () => {},
    () => {},
  )
  const cleanup = settled.finally(() => {
    if (locks.get(key) === cleanup) locks.delete(key)
  })
  locks.set(key, cleanup)
  return run
}

/**
 * @param {string} baseDir
 * @param {{ claimLeaseMinutes?: number }} [options] - claimLeaseMinutes is
 *   an operational lock duration (how long an unattended claim holds a
 *   task before it reverts to OPEN for someone else to pick up), not a
 *   clinical SLA -- same category of non-clinical default this codebase
 *   already uses for follow-up-session token TTL (followUpSessionStore.js
 *   ttlMinutes). Configurable, not hardcoded silently.
 */
export function createCrmStore(baseDir, { claimLeaseMinutes = 60 } = {}) {
  async function ensureDirs() {
    await mkdir(episodesDir(baseDir), { recursive: true })
    await mkdir(tasksDir(baseDir), { recursive: true })
    await mkdir(dedupDir(baseDir), { recursive: true })
    await mkdir(medicationCoursesDir(baseDir), { recursive: true })
    await mkdir(medicationCourseDedupDir(baseDir), { recursive: true })
  }

  /* ---------------- Episode ---------------- */

  // Idempotent create-if-absent by episode_id -- a caller may safely retry
  // a create call (e.g. after a network timeout) without minting a second
  // Episode, PROVIDED it resubmits the same episode_id. Returns
  // { episode, created } (matching the *Stored convention every other
  // create function in this file already follows -- createTaskStored/
  // createMedicationCourseStored/createMedicationCourseCheckTaskStored)
  // so the caller can tell a genuine create from a retry replay: gating a
  // one-time audit event on `created`, in particular, is what makes
  // "response lost, client retries with the same id" converge to exactly
  // one CRM_EPISODE_CREATED audit line instead of one per retry.
  async function createEpisode({ episode_id, patient_uuid, owner_clinician, now }) {
    return withLock(`episode:${episode_id}`, async () => {
      await ensureDirs()
      const existing = await readJson(episodePath(baseDir, episode_id))
      if (existing) return { episode: existing, created: false }
      const episode = newEpisode({ episode_id, patient_uuid, owner_clinician, now })
      await atomicWrite(episodePath(baseDir, episode_id), episode)
      return { episode, created: true }
    })
  }

  async function getEpisode(episode_id) {
    return readJson(episodePath(baseDir, episode_id))
  }

  // Medication/Herbal-course batch: episodes have no id known in advance
  // from the patient side alone (episode_id is a server-minted randomUUID
  // -- see the POST /api/crm/episodes route), so a UI that only knows a
  // patient_uuid needs a way to find (or determine there is none yet, and
  // must create one) that patient's own Episode(s) before it can attach a
  // MedicationCourse to one. A directory scan, same shape as
  // listTasksByEpisode below -- there is no separate by-patient index file
  // to keep in sync, so this can never drift from what is actually on
  // disk.
  async function listEpisodesByPatient(patient_uuid) {
    await ensureDirs()
    let ids
    try {
      ids = (await readdir(episodesDir(baseDir))).filter((f) => f.endsWith('.json') && !f.endsWith('.tmp')).map((f) => f.slice(0, -'.json'.length))
    } catch (err) {
      if (err.code === 'ENOENT') return []
      throw err
    }
    const out = []
    for (const id of ids) {
      const episode = await readJson(episodePath(baseDir, id))
      if (episode && episode.patient_uuid === patient_uuid) out.push(episode)
    }
    out.sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0))
    return out
  }

  async function pauseEpisodeStored(episode_id, expectedVersion, now) {
    return withLock(`episode:${episode_id}`, async () => {
      const episode = await readJson(episodePath(baseDir, episode_id))
      if (!episode) throw new CrmNotFoundError('episode', episode_id)
      const updated = pauseEpisode(episode, expectedVersion, now)
      await atomicWrite(episodePath(baseDir, episode_id), updated)
      return updated
    })
  }

  // Writes every task completeEpisode() actually changed BEFORE the
  // episode record itself, so an interruption partway through leaves the
  // episode still ACTIVE (safe to retry) rather than COMPLETED with a
  // ROUTINE task that should have been cancelled still silently open on
  // disk -- an interrupted call can never produce a half-written
  // Episode/Task pair in the unsafe direction.
  async function completeEpisodeStored(episode_id, expectedVersion, now) {
    return withLock(`episode:${episode_id}`, async () => {
      const episode = await readJson(episodePath(baseDir, episode_id))
      if (!episode) throw new CrmNotFoundError('episode', episode_id)
      const originalTasks = await listTasksByEpisode(episode_id, now)
      const { episode: updatedEpisode, tasks: updatedTasks } = completeEpisode(episode, expectedVersion, originalTasks, now)
      const originalById = new Map(originalTasks.map((t) => [t.task_id, t]))
      for (const t of updatedTasks) {
        if (t !== originalById.get(t.task_id)) {
          await withLock(`task:${t.task_id}`, () => atomicWrite(taskPath(baseDir, t.task_id), t))
        }
      }
      await atomicWrite(episodePath(baseDir, episode_id), updatedEpisode)
      return { episode: updatedEpisode, tasks: updatedTasks }
    })
  }

  async function reopenEpisodeStored(episode_id, expectedVersion, now) {
    return withLock(`episode:${episode_id}`, async () => {
      const episode = await readJson(episodePath(baseDir, episode_id))
      if (!episode) throw new CrmNotFoundError('episode', episode_id)
      const updated = reopenEpisode(episode, expectedVersion, now)
      await atomicWrite(episodePath(baseDir, episode_id), updated)
      return updated
    })
  }

  // Review-open state is never persisted as a second flag (see the
  // comment on Episode in src/crm/types.ts) -- it is derived here, live,
  // from the persisted tasks every time it is asked for.
  async function getEpisodeReviewState(episode_id, now) {
    const tasks = await listTasksByEpisode(episode_id, now)
    return deriveEpisodeReviewState(tasks, episode_id)
  }

  /* ---------------- CrmTask ---------------- */

  async function listTaskIds() {
    await ensureDirs()
    try {
      return (await readdir(tasksDir(baseDir)))
        .filter((f) => f.endsWith('.json') && !f.endsWith('.tmp'))
        .map((f) => f.slice(0, -'.json'.length))
    } catch (err) {
      if (err.code === 'ENOENT') return []
      throw err
    }
  }

  // Reads one task and, if it is CLAIMED with an expired lease, self-heals
  // it back to OPEN on disk before returning. This lazy, read-time check
  // -- no background timer -- is what makes "no permanent CLAIMED lock"
  // true after a restart: the exact same model this codebase already uses
  // for follow-up-session token expiry (followUpSessionStore.js).
  async function getTask(task_id, now) {
    return withLock(`task:${task_id}`, async () => {
      const task = await readJson(taskPath(baseDir, task_id))
      if (!task) return null
      const released = releaseExpiredClaim(task, now)
      if (released !== task) await atomicWrite(taskPath(baseDir, task_id), released)
      return released
    })
  }

  async function listTasksByEpisode(episode_id, now) {
    const ids = await listTaskIds()
    const out = []
    for (const id of ids) {
      const task = await getTask(id, now)
      if (task && task.episode_id === episode_id) out.push(task)
    }
    return out
  }

  // Round 11 (Today Queue read path): the collection reader behind
  // GET /api/crm/tasks. Reuses getTask() per id -- so an expired CLAIMED
  // lease self-heals before the item is ever handed back, exactly as it
  // already does for every other read path -- and reuses the pure
  // engine's own sortCrmTaskQueue() for ordering rather than
  // reimplementing SAFETY_REVIEW > CLINICAL_REVIEW > ROUTINE / overdue /
  // due_at / created_at priority here. Only non-terminal tasks are
  // returned; a task's first_seen_at is never written by this function --
  // it is set exclusively by the explicit markTaskSeenStored() action, so
  // merely listing the queue is never itself "exposure".
  //
  // Round 12 fix: a SNOOZED task whose due_at is still in the future is
  // excluded -- otherwise snoozeTask() (round 1) changes status/due_at
  // but the Today Queue kept showing the item immediately anyway, making
  // "snooze" a no-op from the queue's perspective. Once the already-stored
  // due_at reaches now, the task reappears as actionable -- no duration,
  // SLA, grace period, or timezone rule is invented here; only the exact
  // stored timestamp is compared against server now, the same string
  // comparison sortCrmTaskQueue() itself already uses for overdue. This
  // can never affect SAFETY_REVIEW: the pure engine's snoozeTask() already
  // refuses to put a SAFETY_REVIEW task into SNOOZED at all, so a Safety
  // task can never reach this branch.
  async function listActionableTasks(now, { ownerClinician, coverageQueue = null } = {}) {
    const ids = await listTaskIds()
    const tasks = []
    for (const id of ids) {
      const task = await getTask(id, now)
      if (!task || TERMINAL_TASK_STATUSES.has(task.status)) continue
      if (task.status === 'SNOOZED' && task.due_at && task.due_at > now) continue
      tasks.push(task)
    }
    const scoped = ownerClinician ? tasksForOwner(tasks, ownerClinician, coverageQueue) : tasks
    return sortCrmTaskQueue(scoped, now)
  }

  // Idempotent creation: computes the same dedup_key the pure engine
  // would, then durably checks/records it via the dedup index instead of
  // an in-memory array -- so "same source event -> one task" survives a
  // process restart. A dedup index pointing at an already-terminal task
  // (CANCELLED/SUPERSEDED) is treated exactly like a non-match in the
  // pure engine's own in-memory check: a new task is created and the
  // index is repointed, never a silent no-op.
  //
  // Round 7 fix: input.patient_uuid is NOT trusted as the Task's identity.
  // A Task's patient is derived from its own Episode -- the only writable
  // identity is which episode_id a Task is created against, exactly like
  // any other field on Episode/CrmTask has exactly one writer. Without
  // this, a stale/malicious caller could persist a Task whose patient_uuid
  // disagrees with its own Episode's patient_uuid, which would silently
  // misroute groupTasksForCommunication() (keyed on task.patient_uuid) to
  // the wrong patient. The Episode is loaded here, inside the store
  // boundary, specifically so no route-level validation can be bypassed by
  // calling this function directly.
  //
  // Round 8 fix (durable dedup crash window): the dedup pointer file is
  // now the durable INTENT record and is written *before* the Task file,
  // not after -- and it carries the full computed Task snapshot, not just
  // its id. This makes the two-file write recoverable across a crash at
  // either point: if the process dies after the pointer commits but
  // before the Task file lands, a retry (from a fresh createCrmStore()
  // instance, i.e. after restart) finds the pointer, finds no Task file
  // at the id it names, and simply replays the exact already-computed
  // snapshot -- never reconstructing a Task from whatever fields this
  // retry happens to carry, and never minting a second task_id for the
  // same dedup_key. Previously the order was Task-then-pointer, so a
  // crash between them left an orphaned Task with no pointer, and the
  // next retry would mint an entirely new (second) non-terminal Task for
  // the same dedup_key -- silently duplicating staff work/contact.
  //
  // Round 9 fix (upgrade compatibility): a pointer file already on disk
  // from before round 8 has the legacy shape { task_id } with no `task`
  // snapshot. Reading it with `pointer?.task` alone treats it as if no
  // pointer existed at all, which reintroduces the exact duplicate-task
  // condition round 8 closed -- just triggered by a software upgrade
  // instead of a same-version crash. Both shapes are read uniformly by
  // pointerTaskId below; a legacy pointer that still names a real Task on
  // disk is treated with the same terminal/non-terminal semantics as a
  // new-format one, and is lazily upgraded to the new { task } shape once
  // resolved, so this path only has to run once per dedup_key.
  async function createTaskStored(rawInput) {
    const episode = await getEpisode(rawInput.episode_id)
    if (!episode) throw new CrmNotFoundError('episode', rawInput.episode_id)
    const input = { ...rawInput, patient_uuid: episode.patient_uuid }
    const contactPointKey = input.do_not_contact ? 'IN_PERSON_ONLY' : (input.contactPointKey ?? 'DEFAULT')
    const dedup_key = computeDedupKey({
      patient_uuid: input.patient_uuid,
      episode_id: input.episode_id,
      task_type: input.task_type,
      source_event_id: input.source_event_id,
      contactPointKey,
    })
    const hash = hashDedupKey(dedup_key)
    return withLock(`dedup:${hash}`, async () => {
      await ensureDirs()
      const pointer = await readJson(dedupPath(baseDir, hash))
      const pointerTaskId = pointer?.task?.task_id ?? pointer?.task_id ?? null
      if (pointerTaskId) {
        const onDisk = await getTask(pointerTaskId, input.now)
        if (onDisk) {
          if (!TERMINAL_TASK_STATUSES.has(onDisk.status)) {
            if (!pointer.task) {
              // Legacy pointer resolved successfully -- lazily upgrade it
              // to the new intent-record format so a future read never
              // has to take this legacy path again for this dedup_key.
              await atomicWrite(dedupPath(baseDir, hash), { task: onDisk })
            }
            return { task: onDisk, deduped: true }
          }
          // Terminal -- treated exactly like no match, falls through to
          // mint a fresh intent below (repointing the dedup index).
        } else if (pointer.task) {
          // Recovery: a new-format intent survived a crash, but its Task
          // file never landed (process died in between). Complete that
          // exact prior attempt by replaying its already-computed
          // snapshot verbatim -- this retry's own (possibly different)
          // input is not used to reconstruct it.
          await withLock(`task:${pointerTaskId}`, () => atomicWrite(taskPath(baseDir, pointerTaskId), pointer.task))
          return { task: pointer.task, deduped: false }
        }
        // else: a legacy { task_id }-only pointer names a Task that does
        // not exist on disk. Under the pre-round-8 write order (Task
        // written before its pointer) this state could never arise from
        // an in-flight crash -- it implies external corruption/deletion,
        // and a legacy pointer carries no snapshot to replay from. Falls
        // through to mint a fresh intent below, exactly like "no pointer
        // at all", rather than silently guessing at the missing Task's
        // original fields.
      }
      const { task } = createCrmTask(input, [])
      await atomicWrite(dedupPath(baseDir, hash), { task })
      await withLock(`task:${task.task_id}`, () => atomicWrite(taskPath(baseDir, task.task_id), task))
      return { task, deduped: false }
    })
  }

  async function resolveTaskStored(task_id, expectedVersion, actorRole, now) {
    return withLock(`task:${task_id}`, async () => {
      const task = await readJson(taskPath(baseDir, task_id))
      if (!task) throw new CrmNotFoundError('task', task_id)
      const updated = resolveTask(task, expectedVersion, actorRole, now)
      if (updated !== task) await atomicWrite(taskPath(baseDir, task_id), updated)
      return updated
    })
  }

  async function snoozeTaskStored(task_id, expectedVersion, until) {
    return withLock(`task:${task_id}`, async () => {
      const task = await readJson(taskPath(baseDir, task_id))
      if (!task) throw new CrmNotFoundError('task', task_id)
      const updated = snoozeTask(task, expectedVersion, until)
      await atomicWrite(taskPath(baseDir, task_id), updated)
      return updated
    })
  }

  // cancelTask()/supersedeTask() take no expectedVersion in the pure
  // engine itself (they are unconditional except for the SAFETY_REVIEW
  // guard). Every mutating route must still require expectedVersion and
  // conflict on a stale write, so that check is enforced here at the
  // store boundary using the same CrmConflictError the rest of the engine
  // throws -- this extends the existing version semantics uniformly
  // rather than bypassing them for these two operations.
  async function cancelTaskStored(task_id, expectedVersion) {
    return withLock(`task:${task_id}`, async () => {
      const task = await readJson(taskPath(baseDir, task_id))
      if (!task) throw new CrmNotFoundError('task', task_id)
      if (task.version !== expectedVersion) throw new CrmConflictError(task_id)
      const updated = cancelTask(task)
      if (updated !== task) await atomicWrite(taskPath(baseDir, task_id), updated)
      return updated
    })
  }

  async function supersedeTaskStored(task_id, expectedVersion) {
    return withLock(`task:${task_id}`, async () => {
      const task = await readJson(taskPath(baseDir, task_id))
      if (!task) throw new CrmNotFoundError('task', task_id)
      if (task.version !== expectedVersion) throw new CrmConflictError(task_id)
      const updated = supersedeTask(task)
      if (updated !== task) await atomicWrite(taskPath(baseDir, task_id), updated)
      return updated
    })
  }

  // Self-heals an expired claim before attempting the new one, so a task
  // whose lease has already passed can actually be re-claimed instead of
  // being rejected by claimTask's own "must be OPEN/SNOOZED" guard. A
  // caller whose expectedVersion predates this self-heal correctly
  // conflicts (see tests/crm-store.spec.mjs) -- the fix is to re-fetch via
  // getTask() first, exactly as any other stale-version conflict is
  // resolved in this system.
  async function claimTaskStored(task_id, expectedVersion, claimedBy, now) {
    return withLock(`task:${task_id}`, async () => {
      const stored = await readJson(taskPath(baseDir, task_id))
      if (!stored) throw new CrmNotFoundError('task', task_id)
      const task = releaseExpiredClaim(stored, now)
      if (task !== stored) await atomicWrite(taskPath(baseDir, task_id), task)
      const claimLeaseMs = claimLeaseMinutes * 60 * 1000
      const updated = claimTask(task, expectedVersion, claimedBy, now, claimLeaseMs)
      await atomicWrite(taskPath(baseDir, task_id), updated)
      return updated
    })
  }

  // Deliberately NOT called from getTask()/listTasksByEpisode(): a plain
  // read must never itself count as "the item was exposed to a
  // clinician," and it must never fire more than once regardless of how
  // many times it's asked. The caller (a future queue UI) decides when a
  // genuine view happened and calls this explicitly.
  async function markTaskSeenStored(task_id, expectedVersion, now) {
    return withLock(`task:${task_id}`, async () => {
      const task = await readJson(taskPath(baseDir, task_id))
      if (!task) throw new CrmNotFoundError('task', task_id)
      const updated = markTaskSeen(task, expectedVersion, now)
      if (updated !== task) await atomicWrite(taskPath(baseDir, task_id), updated)
      return updated
    })
  }

  /* ---------------- MedicationCourse (Medication/Herbal-course batch) ---------------- */
  //
  // Every field this store persists is either what the source system
  // reported or an explicit human-supplied value -- never inferred from
  // `now`, never a computed offset. This module never decides WHEN a
  // check should happen; it only durably records WHAT was explicitly
  // supplied and wires it to the existing CrmTask machinery via
  // createTaskStored, which already provides idempotency, identity
  // derivation (episode.patient_uuid, never the caller's), and durable
  // dedup by source_event_id.

  async function listMedicationCourseIds() {
    await ensureDirs()
    try {
      return (await readdir(medicationCoursesDir(baseDir)))
        .filter((f) => f.endsWith('.json') && !f.endsWith('.tmp'))
        .map((f) => f.slice(0, -'.json'.length))
    } catch (err) {
      if (err.code === 'ENOENT') return []
      throw err
    }
  }

  async function getMedicationCourse(course_id) {
    return readJson(medicationCoursePath(baseDir, course_id))
  }

  async function listMedicationCoursesByEpisode(episode_id) {
    const ids = await listMedicationCourseIds()
    const out = []
    for (const id of ids) {
      const course = await readJson(medicationCoursePath(baseDir, id))
      if (course && course.episode_id === episode_id) out.push(course)
    }
    out.sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0))
    return out
  }

  // Idempotent by (episode_id, source, source_id): a duplicate source
  // event (the same prescription/dispense record reported twice, e.g. a
  // retried EMR sync) returns the ALREADY-persisted course rather than
  // minting a second one for the same real-world course. Same durable
  // intent-then-finalize two-phase write as createTaskStored above (the
  // dedup pointer commits first and carries the full snapshot, so a crash
  // between the two writes is recoverable from a fresh store instance --
  // see createTaskStored's own Round 8/9 comments for the exact failure
  // mode this closes) -- there is no legacy pointer shape to be
  // compatible with here since this is a new store, so only the new-
  // format path is needed.
  //
  // patient_uuid is derived from the Episode, never trusted from the
  // caller, for the identical reason createTaskStored does this: the only
  // writable identity is which episode_id a record is created against.
  async function createMedicationCourseStored(rawInput) {
    const episode = await getEpisode(rawInput.episode_id)
    if (!episode) throw new CrmNotFoundError('episode', rawInput.episode_id)
    // Episode↔Medication association integrity batch: expected_patient_uuid
    // is OPTIONAL -- callers that don't supply a patient context (existing
    // tests, any future non-UI caller) are unaffected -- but when the Doctor
    // UI supplies the patient it currently has open, a mismatch means
    // either a stale client (patient A→B switch raced an in-flight
    // request for A) or a genuinely wrong episode_id, and must be
    // rejected here, before the dedup lock/pointer read below, so a
    // mismatch produces zero course/task writes and zero audit events.
    if (
      typeof rawInput.expected_patient_uuid === 'string' &&
      rawInput.expected_patient_uuid &&
      rawInput.expected_patient_uuid !== episode.patient_uuid
    ) {
      throw new CrmOwnershipError('episode', rawInput.episode_id)
    }
    const source = typeof rawInput.source === 'string' ? rawInput.source : ''
    const source_id = typeof rawInput.source_id === 'string' ? rawInput.source_id : ''
    const source_timestamp = typeof rawInput.source_timestamp === 'string' ? rawInput.source_timestamp : ''
    if (!source || !source_id || !source_timestamp) {
      throw new Error('source, source_id, and source_timestamp are all required')
    }
    assertNoRawPhone(source, 'medication_course.source')
    assertNoRawPhone(source_id, 'medication_course.source_id')
    if (typeof rawInput.now !== 'string' || !rawInput.now) {
      throw new Error('now is required')
    }
    const dedup_key = `${rawInput.episode_id}|${source}|${source_id}`
    const hash = hashDedupKey(dedup_key)
    return withLock(`medication-course-dedup:${hash}`, async () => {
      await ensureDirs()
      const pointer = await readJson(medicationCourseDedupPath(baseDir, hash))
      if (pointer?.course) {
        const onDisk = await readJson(medicationCoursePath(baseDir, pointer.course.course_id))
        if (onDisk) return { course: onDisk, deduped: true }
        // Crash recovery: the intent survived, but the course file itself
        // never landed -- replay the exact already-computed snapshot,
        // never reconstructing it from this retry's own (possibly
        // different) input.
        await withLock(`medication-course:${pointer.course.course_id}`, () =>
          atomicWrite(medicationCoursePath(baseDir, pointer.course.course_id), pointer.course),
        )
        return { course: pointer.course, deduped: false }
      }
      const course = {
        course_id: rawInput.course_id,
        episode_id: rawInput.episode_id,
        patient_uuid: episode.patient_uuid,
        source,
        source_id,
        prescribed_at: typeof rawInput.prescribed_at === 'string' ? rawInput.prescribed_at : null,
        dispensed_at: typeof rawInput.dispensed_at === 'string' ? rawInput.dispensed_at : null,
        medication_start_at: typeof rawInput.medication_start_at === 'string' ? rawInput.medication_start_at : null,
        planned_duration_days: typeof rawInput.planned_duration_days === 'number' ? rawInput.planned_duration_days : null,
        source_timestamp,
        dedup_key,
        created_at: rawInput.now,
        updated_at: rawInput.now,
        version: 1,
      }
      await atomicWrite(medicationCourseDedupPath(baseDir, hash), { course })
      await withLock(`medication-course:${course.course_id}`, () => atomicWrite(medicationCoursePath(baseDir, course.course_id), course))
      return { course, deduped: false }
    })
  }

  // Creates (or, by createTaskStored's own source_event_id dedup, returns)
  // the CrmTask for one explicit medication check. due_at is REQUIRED and
  // always exactly what the caller supplied -- this function computes no
  // offset, default, or SLA of its own. expectedVersion guards against
  // creating a check against a course the caller's own view of is already
  // stale (e.g. a start-date shift happened since they last read it).
  async function createMedicationCourseCheckTaskStored(course_id, expectedVersion, reason_code, due_at, task_id, now, do_not_contact = false) {
    if (!MEDICATION_COURSE_REASON_CODES.has(reason_code)) {
      throw new Error('reason_code must be one of MEDICATION_START_CHECK/MEDICATION_MID_CHECK/MEDICATION_END_CHECK')
    }
    if (typeof due_at !== 'string' || !due_at) throw new Error('due_at is required')
    // Independent-review finding (HIGH): this used to read the course
    // and check its version with no lock at all, while
    // shiftMedicationCourseStartStored holds `medication-course:<id>` --
    // a concurrent shift-start could supersede/recreate the course's
    // tasks while a check-task creation reads a stale (pre-shift)
    // version and slips a new OPEN task in afterward, unsupersededed and
    // pointed at a stale due_at. Sharing the same lock key serializes
    // the two operations against each other, matching shift-start's own
    // locking.
    return withLock(`medication-course:${course_id}`, async () => {
      const course = await readJson(medicationCoursePath(baseDir, course_id))
      if (!course) throw new CrmNotFoundError('medication_course', course_id)
      if (course.version !== expectedVersion) throw new CrmConflictError(course_id)
      // Closing-review finding (MEDIUM): createTaskStored's own dedup key
      // includes contactPointKey, which do_not_contact overrides to
      // 'IN_PERSON_ONLY' -- and a check-task create never bumps
      // course.version. Two sequential calls with the same expectedVersion
      // but different do_not_contact therefore hashed to two DIFFERENT
      // dedup keys and minted two separate OPEN tasks for the same
      // (course, reason_code): one OUTBOUND_ALLOWED, one IN_PERSON_ONLY --
      // duplicate contact against a patient explicitly flagged
      // do-not-contact on the other task. (course_id, reason_code) is
      // made the authoritative identity here, independent of contact
      // mode: an existing non-terminal task for this reason_code is
      // always reused (its own contact_mode wins) rather than letting a
      // differing do_not_contact value on this call mint a second task.
      const existingTasks = await listTasksByEpisode(course.episode_id, now)
      const existingOpen = existingTasks.find(
        (t) =>
          t.source_type === 'MEDICATION_COURSE' &&
          t.source_id === course_id &&
          t.reason_code === reason_code &&
          !TERMINAL_TASK_STATUSES.has(t.status),
      )
      if (existingOpen) return { task: existingOpen, deduped: true }
      return createTaskStored({
        task_id,
        episode_id: course.episode_id,
        task_type: 'ROUTINE',
        reason_code,
        source_type: 'MEDICATION_COURSE',
        source_id: course_id,
        source_event_id: `${course_id}:${reason_code}`,
        source_timestamp: course.source_timestamp,
        due_at,
        owner_clinician: null,
        now,
        do_not_contact,
      })
    })
  }

  // If medication_start_at changes, every still-open (non-terminal)
  // ROUTINE task this course owns is superseded and, only for reason
  // codes the caller explicitly supplies a replacement due_at for, a new
  // check task is created -- reusing recalculateMedicationTasksOnStartShift
  // (src/crm/medicationCourse.ts) for the supersede/recalculate contract
  // itself, and createTaskStored's own dedup for the actual creation, so
  // this function invents no SLA offset of its own. replacementTasks is
  // Array<{task_id, reason_code, due_at}>, with task_id ALWAYS minted by
  // the caller (the HTTP route) -- this store never mints an id itself,
  // matching every other creation path in this file.
  //
  // Crash/restart safety: every superseded Task is written BEFORE any
  // replacement Task is created, and the course record itself (the new
  // medication_start_at + version bump) is written LAST -- the same
  // ordering invariant completeEpisodeStored above uses, for the same
  // reason. An interruption at any point leaves a state a retry safely
  // converges from: supersedeTask() is a no-op on an already-terminal
  // task, and createTaskStored() dedupes by source_event_id (stable
  // across retries since it is derived from course_id+reason_code, not
  // from the caller-minted task_id) -- so a retried shift can never
  // produce a duplicate actionable task, and a crash before the final
  // course write never silently loses the course (it is simply retried
  // with its prior, still-valid medication_start_at).
  async function shiftMedicationCourseStartStored(course_id, expectedVersion, medication_start_at, replacementTasks, now) {
    if (typeof medication_start_at !== 'string' || !medication_start_at) {
      throw new Error('medication_start_at is required')
    }
    return withLock(`medication-course:${course_id}`, async () => {
      const course = await readJson(medicationCoursePath(baseDir, course_id))
      if (!course) throw new CrmNotFoundError('medication_course', course_id)
      if (course.version !== expectedVersion) throw new CrmConflictError(course_id)

      const tasks = await listTasksByEpisode(course.episode_id, now)
      // 3rd closing-review finding (LOW): a prior round tightened this filter to
      // include source_type for "consistency" with the check-task dedup
      // pre-check -- but recalculateMedicationTasksOnStartShift (medicationCourse.ts)
      // computes `superseded` from the SAME `tasks` array using the untightened
      // (source_id, task_type) filter, and originalById below is looked up by
      // task_id from THIS `linked` set to detect true no-ops. Diverging the two
      // filters meant a task present in the looser set but absent from this
      // narrower one would resolve to `undefined` here, making
      // `t !== originalById.get(t.task_id)` always true -- breaking the DONE-task
      // immutability the comment below depends on. Reverted to match
      // medicationCourse.ts:38 exactly; do not re-diverge these without updating
      // both together.
      const linked = tasks.filter((t) => t.source_id === course_id && t.task_type === 'ROUTINE')
      const originalById = new Map(linked.map((t) => [t.task_id, t]))
      const updatedCourseSnapshot = { ...course, medication_start_at }
      const { superseded, recalculated } = recalculateMedicationTasksOnStartShift(tasks, updatedCourseSnapshot, () =>
        replacementTasks.map((r) => ({ task_id: r.task_id, due_at: r.due_at })),
      )
      // recalculateMedicationTasksOnStartShift() maps supersedeTask() over
      // every ROUTINE task linked to this course, including ones already
      // terminal (DONE/CANCELLED/SUPERSEDED) -- supersedeTask() is a no-op
      // on those and returns the SAME reference, so this filter is what
      // keeps a DONE task truly immutable: it is never rewritten to disk,
      // and it is never reported as "superseded" to the caller either.
      const actuallySuperseded = superseded.filter((t) => t !== originalById.get(t.task_id))
      for (const t of actuallySuperseded) {
        await withLock(`task:${t.task_id}`, () => atomicWrite(taskPath(baseDir, t.task_id), t))
      }
      const byReplacementId = new Map(replacementTasks.map((r) => [r.task_id, r]))
      const createdTasks = []
      for (const entry of recalculated) {
        const r = byReplacementId.get(entry.task_id)
        const { task } = await createTaskStored({
          task_id: r.task_id,
          episode_id: course.episode_id,
          task_type: 'ROUTINE',
          reason_code: r.reason_code,
          source_type: 'MEDICATION_COURSE',
          source_id: course_id,
          source_event_id: `${course_id}:${r.reason_code}`,
          source_timestamp: course.source_timestamp,
          due_at: entry.due_at,
          owner_clinician: null,
          now,
          do_not_contact: r.do_not_contact === true,
        })
        createdTasks.push(task)
      }
      const updatedCourse = { ...course, medication_start_at, updated_at: now, version: course.version + 1 }
      await atomicWrite(medicationCoursePath(baseDir, course_id), updatedCourse)
      return { course: updatedCourse, superseded: actuallySuperseded, createdTasks }
    })
  }

  return {
    createEpisode,
    getEpisode,
    listEpisodesByPatient,
    pauseEpisodeStored,
    completeEpisodeStored,
    reopenEpisodeStored,
    getEpisodeReviewState,
    listTasksByEpisode,
    listActionableTasks,
    createTaskStored,
    getTask,
    resolveTaskStored,
    snoozeTaskStored,
    getMedicationCourse,
    listMedicationCoursesByEpisode,
    createMedicationCourseStored,
    createMedicationCourseCheckTaskStored,
    shiftMedicationCourseStartStored,
    cancelTaskStored,
    supersedeTaskStored,
    claimTaskStored,
    markTaskSeenStored,
  }
}
