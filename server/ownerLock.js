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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Read-only status check, used by scripts/purge-data.mjs before it deletes
 * everything out from under a still-live server. Never throws. */
export async function readOwnerLockStatus(dataDir, { staleAfterMs = 90000 } = {}) {
  const record = await readLock(ownerLockPath(dataDir))
  return { record, fresh: isFresh(record, staleAfterMs) }
}

// A malformed env var here must fail loudly, not silently degrade the guard
// it configures -- `Number(x)` on an unset var is fine (the caller's own
// fallback), but a SET-but-malformed one (a typo like "90s", or an empty
// string) silently becomes NaN. Two callers depend on that NOT happening in
// different ways: server/index.js's isFresh() treats a NaN staleAfterMs as
// "everything is always stale" (the lock becomes a complete no-op -- every
// process takes over immediately); scripts/purge-data.mjs found the sharper
// edge of the same bug -- `SAMINDANG_OWNER_LOCK_STALE_MS=0` (or negative)
// IS `Number.isFinite`, so a check that only validated finiteness let a
// zero/negative threshold make every lock read as stale, and the purge
// script took the lock away from (and then deleted the data under) a
// genuinely live server. Shared here, not duplicated per-caller, precisely
// so the two can't drift the way that regression happened.
//
// Third-round closing-review finding: this positivity check alone does NOT
// close that hazard -- it only rejects values that are non-positive or
// non-numeric. A SMALL positive value (e.g. `SAMINDANG_OWNER_LOCK_STALE_MS=
// 90`, the single most plausible typo for the 90000ms default: an operator
// thinking in seconds and writing the number) still passes this check, and
// still makes purge-data.mjs treat a genuinely live server's lock as stale
// -- reproduced empirically. This function cannot fix that on its own (it
// has no way to know what threshold is "too small" for a given deployment);
// see purge-data.mjs's own comment for the independent, threshold-agnostic
// defense (a raw pid-liveness probe) added alongside this to actually close
// the hazard, not just narrow it.
export function requirePositiveMs(envVar, fallback) {
  const raw = process.env[envVar]
  if (raw === undefined) return fallback
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) {
    console.error(`fatal: ${envVar}="${raw}" is not a valid positive number of milliseconds`)
    process.exit(1)
  }
  return n
}

// Closing-review finding (round 17 self-review): the original takeover --
// atomicWrite(rename) then immediately re-read and compare nonces -- is NOT
// mutual exclusion. Two processes racing the same stale lock can each
// rename in turn (P1 at T, P2 at T+epsilon) and each read back IMMEDIATELY
// after their own write; if P1's read happens before P2's rename, P1 sees
// its own nonce and proceeds -- even though P2's later rename is about to
// (or already did) overwrite it. Verified empirically: two real processes
// racing one pre-seeded stale lock with no settling step produced more than
// one simultaneous owner in roughly half of trials. A single self-read
// right after your own write can never distinguish "I'm alone" from "I'm
// about to be overwritten".
//
// Fix: after the takeover write, wait a settling window, then re-read once
// more. If nothing has overwritten this process's own nonce by then, any
// later competitor's OWN takeover attempt that started around the same
// time will have completed its own rename well within the settle window (a
// single atomicWrite is a few filesystem calls, not seconds), so by the
// time this process's settle window elapses, the file it reads is the true
// last-writer -- and if that is not this process's own nonce, this process
// lost and must not proceed.
//
// Second-round closing-review finding: an earlier version of this function
// performed this same check TWICE (a full settleMs wait, then a second,
// shorter wait-and-verify), and a second-round comment here incorrectly
// dismissed the second check as "dead weight" on the theory that the
// checked state is monotonic so a later read "can only reconfirm the same
// fact." That reasoning was wrong (third-round closing-review finding): the
// state IS monotonic once observed, but a second read can still observe a
// NEW overwrite that landed strictly between the two reads -- a competitor
// whose rename lands in [T+settleMs, T+settleMs+extra) is caught by a
// second check at T+settleMs+extra but invisible to one at T+settleMs
// alone. The second check was real extra coverage, not redundancy.
// Collapsed to a single check anyway, for simplicity, but the settle window
// itself was correspondingly LENGTHENED (DEFAULT_SETTLE_MS 300 -> 350, the
// same total wait the old two-step sequence gave in the default
// configuration) so this single check covers the same effective window the
// old two checks did, rather than silently shipping a narrower one. Any
// caller that overrides `settleMs` explicitly (server/index.js does, for
// its own env-var-configurable window) must apply the same 50ms directly
// to whatever total protection window it wants -- there is no second,
// hidden top-up happening inside this function to compensate for it.
//
// Honest limit, not fully closed by this or any single-settle-window
// design: two takeover renames arriving MORE than settleMs apart can still
// both "win" locally and both end up listening -- e.g. one process stalls
// (GC pause, disk contention, a paused VM) past the settle window after
// writing its own takeover, wakes, and a genuinely new process take over in
// between goes undetected by either side individually. In practice this
// residual is narrower than it sounds: any competitor that ARRIVES after
// the first process's takeover rename (not just after its settle window)
// sees a lock with a `renewed_at` from moments ago and refuses immediately
// via the plain `isFresh` check above, never reaching this settle-reconfirm
// code at all -- confirmed empirically (tests/owner-lock.spec.mjs's
// multi-takeover block: with several real processes racing one seeded
// stale lock, every loser refuses via `isFresh`, and this settle-reconfirm
// path only matters for processes whose *initial* EEXIST read also raced
// close enough to see the lock as still stale). This is not full
// distributed consensus -- for the realistic failure mode this module
// exists for (an operator accidentally double-starting the server, not an
// adversarial arrival stream) it converts a documented ~45% two-owner
// collision rate into something not observed in repeated real-process
// testing, without adding a database or a second lock file.
const DEFAULT_SETTLE_MS = 350

async function verifyStillOwner(lockPath, nonce) {
  const current = await readLock(lockPath)
  return current?.nonce === nonce
}

export async function acquireOwnerLock(dataDir, { heartbeatMs = 15000, staleAfterMs = 90000, settleMs = DEFAULT_SETTLE_MS, onLost } = {}) {
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
    // atomic replace via tmp+rename.
    const now = new Date().toISOString()
    const takeover = { pid, hostname: host, nonce, acquired_at: now, renewed_at: now }
    await atomicWrite(lockPath, takeover)
    // Settle-and-reconfirm (see the comment above this function) instead of
    // a single immediate self-read: wait out the settle window, then verify
    // once. Fourth-round closing-review finding: an earlier version of
    // THIS comment (not just the header above) repeated the retracted
    // "a second re-verify adds no coverage" claim -- same self-contradiction
    // the header comment above already corrects. There is only one check
    // here (not two) because DEFAULT_SETTLE_MS/settleMs were lengthened to
    // cover the same total window the old two-check sequence did, not
    // because a second check would have been redundant.
    await sleep(settleMs)
    if (!(await verifyStillOwner(lockPath, nonce))) {
      const loser = await readLock(lockPath)
      throw new OwnerLockConflictError(
        `lost the race to take over an abandoned data directory lock to another process (pid=${loser?.pid ?? '?'}) -- refusing to start`,
        loser,
      )
    }
    record = takeover
  }

  let released = false
  const timer = setInterval(async () => {
    if (released) return
    try {
      // Closing-review finding: a heartbeat that just re-writes its own
      // remembered `record` without checking what is CURRENTLY on disk can
      // silently reclaim a lock this process no longer owns. That happens
      // if this process stalls (OS sleep/hibernate, a long GC pause, a
      // paused VM) for longer than staleAfterMs: another process correctly
      // takes over while this one is stalled, but when this process wakes
      // and its next heartbeat fires, it would previously have blindly
      // atomicWrite'd the lock back to itself -- becoming a second live
      // owner alongside the legitimate new one, with the lock file lying
      // about who holds it. Read-verify ownership FIRST; only renew if
      // still genuinely ours.
      //
      // Honest residual (second-round closing-review finding): this read
      // (of what is CURRENTLY on disk) and the atomicWrite below it are
      // still two separate steps, not one atomic operation. If a
      // competitor's takeover rename lands in the gap between them, two
      // outcomes are possible: (a) our write lands after theirs -- we
      // stomp their lock, but their OWN settle-and-reconfirm check (above)
      // then correctly detects that and THEY refuse to start, so exactly
      // one owner survives; (b) our write lands before theirs -- we
      // believe we renewed and keep serving, discovering the loss only on
      // the NEXT heartbeat tick, a genuine two-live-owner window bounded by
      // heartbeatMs (15s default). This is a real, currently-untested
      // residual -- narrower than the unbounded window that existed before
      // this read-verify was added (previously this process could reclaim
      // a lock it had lost at ANY later heartbeat, forever), but not zero.
      const current = await readLock(lockPath)
      if (current?.nonce !== nonce) {
        released = true
        clearInterval(timer)
        console.error(
          `fatal: lost ownership of the data directory lock (${lockPath}) -- another process holds it now (pid=${current?.pid ?? '?'}). This process can no longer safely serve requests against this data directory.`,
        )
        if (onLost) {
          onLost()
        } else {
          process.exit(1)
        }
        return
      }
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
