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
  CrmConflictError,
} from '../src/crm/taskEngine.ts'
import { pauseEpisode, completeEpisode, reopenEpisode } from '../src/crm/episode.ts'

export { CrmConflictError }

export class CrmNotFoundError extends Error {
  constructor(kind, id) {
    super(`${kind} not found: ${id}`)
    this.name = 'CrmNotFoundError'
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
  }

  /* ---------------- Episode ---------------- */

  // Idempotent create-if-absent by episode_id -- a caller may safely retry
  // a create call (e.g. after a network timeout) without minting a second
  // Episode.
  async function createEpisode({ episode_id, patient_uuid, owner_clinician, now }) {
    return withLock(`episode:${episode_id}`, async () => {
      await ensureDirs()
      const existing = await readJson(episodePath(baseDir, episode_id))
      if (existing) return existing
      const episode = newEpisode({ episode_id, patient_uuid, owner_clinician, now })
      await atomicWrite(episodePath(baseDir, episode_id), episode)
      return episode
    })
  }

  async function getEpisode(episode_id) {
    return readJson(episodePath(baseDir, episode_id))
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
      if (pointer?.task) {
        const onDisk = await getTask(pointer.task.task_id, input.now)
        if (onDisk) {
          if (!TERMINAL_TASK_STATUSES.has(onDisk.status)) {
            return { task: onDisk, deduped: true }
          }
          // Terminal -- treated exactly like no match, falls through to
          // mint a fresh intent below (repointing the dedup index).
        } else {
          // Recovery: a prior attempt's intent survived, but its Task
          // file never landed (process died in between). Complete that
          // exact prior attempt by replaying its already-computed
          // snapshot verbatim -- this retry's own (possibly different)
          // input is not used to reconstruct it.
          await withLock(`task:${pointer.task.task_id}`, () => atomicWrite(taskPath(baseDir, pointer.task.task_id), pointer.task))
          return { task: pointer.task, deduped: false }
        }
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

  return {
    createEpisode,
    getEpisode,
    pauseEpisodeStored,
    completeEpisodeStored,
    reopenEpisodeStored,
    getEpisodeReviewState,
    listTasksByEpisode,
    createTaskStored,
    getTask,
    resolveTaskStored,
    snoozeTaskStored,
    cancelTaskStored,
    supersedeTaskStored,
    claimTaskStored,
    markTaskSeenStored,
  }
}
