// Round 17 (restart-safe / multi-process correctness batch): enforces this
// server's own documented "single process owns the data dir" assumption.
// Every store's in-process withLock (server/store.js, visitStore.js,
// followUpSessionStore.js, stationStore.js, crmStore.js,
// microFollowUpStore.js, patientIdentityStore.js, recorderResultStore.js)
// and the in-memory rate limiter/activeVisit maps in server/index.js all
// carry a comment saying "this only works if exactly one process owns this
// data directory" -- but until this module, nothing actually checked that.
// Two processes racing the same data dir (e.g. an operator double-starting
// start-doctor-api.bat, or a scheduled task racing a manual start) defeat
// every one of those in-process locks, because each process's lock lives
// only in its own memory: two processes can both pass a dedup scan, both
// pass a CAS version check, both win a "no active pointer" race -- because
// neither one's lock is visible to the other. Concrete worst case: two
// processes both see no existing Sigma chart_no -> patient_uuid link and
// both durably write one, producing a duplicate irreversible identity
// link, in direct violation of this repo's approved 1:1 identity policy.
//
// This module does not make every store multi-process-safe (that would
// mean touching 8 files' worth of locking primitives for a single-process
// pilot deployment that was never meant to run that way). Instead it turns
// "two processes silently corrupt shared state" into "the second process
// refuses to start, loudly, with an operator-readable reason" -- the same
// posture checkDataDirsWritable already takes for an unwritable directory.
//
// Only wired into the real CLI boot path (`isMain()` in server/index.js),
// exactly like checkDataDirsWritable -- NOT into createApp() itself, so
// every existing test that calls createApp() directly and in-process
// (hundreds of them, many starting/stopping multiple servers against the
// same or different temp dirs within one Node process) is completely
// unaffected. A genuine multi-process test spawns real `node
// server/index.js` child processes, which do go through isMain() and this
// lock, matching how the server is actually deployed and actually raced.
//
// Design: one lock file, sibling of audit.log (same convention as every
// other cross-cutting file at the data root). Exclusive-create (`flag:
// 'wx'`) is the atomicity primitive for "am I first" -- like atomicWrite's
// rename gives a single write, but wx additionally FAILS instead of
// clobbering when the target already exists, which is exactly what "is
// someone else already here" needs. A live owner heartbeats (rewrites
// renewed_at) on an unref'd timer so it never keeps the process alive by
// itself; a lock whose renewed_at is older than staleAfterMs is presumed
// abandoned (crash, kill -9, unclean shutdown) and is safe to take over.
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { randomUUID, randomBytes } from 'node:crypto'
import { hostname } from 'node:os'
import path from 'node:path'

export class OwnerLockConflictError extends Error {
  constructor(message, holder) {
    super(message)
    this.name = 'OwnerLockConflictError'
    this.holder = holder
  }
}

export function ownerLockPath(dataDir) {
  return path.join(dataDir, '..', 'owner.lock')
}

async function atomicWrite(filePath, data) {
  // Unique tmp suffix (not just `${filePath}.tmp`) because two processes
  // racing a stale-lock takeover both write a tmp file concurrently -- if
  // they shared one tmp name, one process's writeFile could clobber the
  // other's tmp content before either renames. The final rename is still
  // the sole atomicity boundary that decides which one wins the lock file
  // itself.
  const tmp = `${filePath}.${randomBytes(6).toString('hex')}.tmp`
  await writeFile(tmp, JSON.stringify(data, null, 2), 'utf8')
  await rename(tmp, filePath)
}

async function readLock(lockPath) {
  try {
    return JSON.parse(await readFile(lockPath, 'utf8'))
  } catch {
    // ENOENT (no lock yet) and a corrupt/partially-written lock file are
    // treated identically: neither can represent a currently-live owner,
    // since a live owner only ever produces this file via a clean
    // exclusive-create or atomicWrite. Fail toward "safe to take over",
    // not toward "block forever on a broken file".
    return null
  }
}

function isFresh(record, staleAfterMs) {
  if (!record?.renewed_at) return false
  const ageMs = Date.now() - new Date(record.renewed_at).getTime()
  return Number.isFinite(ageMs) && ageMs < staleAfterMs
}

/** Read-only status check, used by scripts/purge-data.mjs before it deletes
 * everything out from under a still-live server. Never throws. */
export async function readOwnerLockStatus(dataDir, { staleAfterMs = 90000 } = {}) {
  const record = await readLock(ownerLockPath(dataDir))
  return { record, fresh: isFresh(record, staleAfterMs) }
}

export async function acquireOwnerLock(dataDir, { heartbeatMs = 15000, staleAfterMs = 90000 } = {}) {
  const lockPath = ownerLockPath(dataDir)
  await mkdir(path.dirname(lockPath), { recursive: true })
  const nonce = randomUUID()
  const pid = process.pid
  const host = hostname()

  let record
  try {
    const now = new Date().toISOString()
    record = { pid, hostname: host, nonce, acquired_at: now, renewed_at: now }
    await writeFile(lockPath, JSON.stringify(record, null, 2), { encoding: 'utf8', flag: 'wx' })
  } catch (err) {
    if (err.code !== 'EEXIST') throw err
    const existing = await readLock(lockPath)
    if (isFresh(existing, staleAfterMs)) {
      throw new OwnerLockConflictError(
        `data directory already owned by another live process (pid=${existing.pid}, host=${existing.hostname}, renewed_at=${existing.renewed_at}) -- refusing to start a second process against the same data directory`,
        existing,
      )
    }
    // Stale (or corrupt/unreadable) lock: safe to take over. Unconditional
    // atomic replace via tmp+rename, then self-verify by re-reading -- if
    // another process is taking over the same stale lock at the same
    // instant, exactly one rename wins the filesystem race and only that
    // process's nonce reads back afterward.
    const now = new Date().toISOString()
    const takeover = { pid, hostname: host, nonce, acquired_at: now, renewed_at: now }
    await atomicWrite(lockPath, takeover)
    const verify = await readLock(lockPath)
    if (verify?.nonce !== nonce) {
      throw new OwnerLockConflictError(
        `lost the race to take over an abandoned data directory lock to another process (pid=${verify?.pid ?? '?'}) -- refusing to start`,
        verify,
      )
    }
    record = takeover
  }

  let released = false
  const timer = setInterval(async () => {
    if (released) return
    try {
      const renewed = { ...record, renewed_at: new Date().toISOString() }
      await atomicWrite(lockPath, renewed)
      record = renewed
    } catch {
      // Best-effort heartbeat: a transient write failure just skips this
      // beat -- staleAfterMs (default 6x heartbeatMs) tolerates several
      // missed beats before another process would treat this lock as
      // abandoned.
    }
  }, heartbeatMs)
  timer.unref()

  async function release() {
    if (released) return
    released = true
    clearInterval(timer)
    // Only remove the lock file if it still identifies us as the owner --
    // if this process was already presumed dead and taken over (a very
    // slow shutdown past staleAfterMs), unlinking would delete the NEW
    // owner's live lock instead of our own stale one.
    const current = await readLock(lockPath)
    if (current?.nonce === nonce) {
      await unlink(lockPath).catch(() => {})
    }
  }

  return { release, pid, nonce, lockPath }
}
