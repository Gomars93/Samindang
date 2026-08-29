// CRM v0.3.1 round 14: minimum-safe Sigma identity-linkage layer. Maps a
// Clinical OS `patient_uuid` (the existing internal random UUID, already
// authoritative everywhere in src/crm/*) to a Sigma `chart_no`, so
// doctor-facing CRM surfaces can display a name instead of a raw UUID.
//
// Scope, per the approved identity policy (PR #24 round 14 comment):
//   - the mapping stores ONLY chart_no + a display name confirmed at link
//     time -- no RRN, no phone, ever.
//   - 1:1 both directions: one patient_uuid can hold at most one link, one
//     chart_no can be claimed by at most one patient_uuid. Creating a link
//     when either side is already claimed is REJECTED (409), never
//     silently overwritten -- see linkPatientIdentity below.
//   - there is no live Sigma API integration in this codebase yet (Test 0
//     -- Naver-to-Sigma reservation verification -- is still PENDING, and
//     no Sigma client/credentials exist anywhere in this repo). "Sigma
//     lookup" for this round therefore means a human looked the patient up
//     in Sigma and is confirming the chart_no + name into Clinical OS
//     through this explicit, doctor-authenticated endpoint -- not an
//     automated network call this server makes on its own. A future round
//     can point a real Sigma lookup at chart_no without changing this
//     store's shape.
//   - linking is NEVER inferred from name/phone/DOB matching -- the caller
//     (server/index.js) requires an explicit patient_uuid that already has
//     at least one real visit (store.visitExistsForPatient), the same rule
//     every other patient-linking route in this codebase already enforces.
//
// Same file-per-entity + durable-pointer conventions as crmStore.js: one
// link record per patient_uuid (links/<uuid>.json), one reverse-uniqueness
// pointer per chart_no (by-chart/<sha256(chart_no)>.json ->
// {sigma_chart_no, patient_uuid}), each store file self-contained rather
// than sharing a util module (matching every other store in this
// directory).
//
// Round 14 re-review fix: a third directory, pending/<uuid>.json, tracks
// "this uuid's own most recent in-flight chart reservation" (patient_uuid
// + sigma_chart_no only, never exposed via any read API). Without it, a
// crash between the chart pointer write and the link-record write, then a
// RETRY WITH A DIFFERENT (corrected) chart_no, would create a second
// reverse pointer while leaving the first one permanently orphaned --
// silently violating 1:1-both-directions and permanently blocking that
// stale chart_no from ever being claimed by the real patient who holds
// it. pending/<uuid>.json is the O(1) way to detect "this uuid already
// has an incomplete reservation under a different chart_no" without
// scanning the whole by-chart/ directory. See linkPatientIdentity below.
//
// Identity Production Batch (Part A): a deployment upgraded from the
// pre-pending-marker version (f15d16f) may already carry a legacy
// orphaned reservation -- a by-chart/ pointer with no matching
// pending/<uuid>.json, because that marker did not exist yet when the
// crash happened. There is no O(1) index into "legacy" orphans (that is
// exactly the gap being closed), so recovery here is a lazy, on-demand
// scan of by-chart/ -- rather than a migration step. See
// findLegacyOrphanedReservations and its call site in linkPatientIdentity
// below.
//
// Independent-review finding (#6/#9): the scan runs on EVERY link
// attempt that reaches it, not only when there is no pending marker at
// all -- a pending marker only ever tracks the single most recent
// reservation, so a uuid can carry a genuine legacy orphan under one
// chart_no at the same time as a pending-tracked orphan under another.
// This still costs at most one scan per never-yet-linked uuid per link
// attempt (the top-of-function already_linked check returns early for
// every uuid that already has a completed link), same bound as before.
//
// chart_no normalization note: sigma_chart_no values passed into this
// store are already trim+uppercase normalized by the caller
// (server/index.js). This store has never been deployed with any
// clinic's real data (the whole identity layer is net-new on this
// unmerged PR), so there is no pre-existing lowercase-cased data to
// migrate -- if that ever changes before merge, add a one-time
// normalization pass over links/*.json and by-chart/*.json before
// relying on this invariant.
import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

export class IdentityConflictError extends Error {
  constructor(reason) {
    super(reason)
    this.name = 'IdentityConflictError'
    this.reason = reason
  }
}

function linksDir(baseDir) {
  return path.join(baseDir, 'links')
}
function chartIndexDir(baseDir) {
  return path.join(baseDir, 'by-chart')
}
function pendingDir(baseDir) {
  return path.join(baseDir, 'pending')
}
function linkPath(baseDir, patientUuid) {
  return path.join(linksDir(baseDir), `${patientUuid}.json`)
}
function pendingPath(baseDir, patientUuid) {
  return path.join(pendingDir(baseDir), `${patientUuid}.json`)
}
function hashChartNo(chartNo) {
  return createHash('sha256').update(chartNo, 'utf8').digest('hex')
}
function chartIndexPath(baseDir, chartNo) {
  return path.join(chartIndexDir(baseDir), `${hashChartNo(chartNo)}.json`)
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

async function removeFileIfExists(filePath) {
  await rm(filePath, { force: true })
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

export function createPatientIdentityStore(baseDir) {
  async function ensureDirs() {
    await mkdir(linksDir(baseDir), { recursive: true })
    await mkdir(chartIndexDir(baseDir), { recursive: true })
    await mkdir(pendingDir(baseDir), { recursive: true })
  }

  async function getIdentityByPatientUuid(patientUuid) {
    await ensureDirs()
    return readJson(linkPath(baseDir, patientUuid))
  }

  async function getIdentitiesByPatientUuids(patientUuids) {
    await ensureDirs()
    const out = {}
    for (const uuid of patientUuids) {
      out[uuid] = await readJson(linkPath(baseDir, uuid))
    }
    return out
  }

  /**
   * Identity Production Batch (Part A): scans by-chart/ for any reverse
   * pointer that names `patientUuid` under a chart_no OTHER than
   * `excludeChartNo` (the one currently being requested -- an exact match
   * there is the ordinary same-chart-recovery path and needs no special
   * handling). Called on every linkPatientIdentity attempt that reaches
   * it (see that function's own doc comment for why this is NOT gated on
   * "no pending marker exists"). Unlocked read-only scan; every match
   * this returns is re-verified under its own chart lock before anything
   * is touched (see the call site).
   */
  async function findLegacyOrphanedReservations(patientUuid, excludeChartNo) {
    let files
    try {
      files = await readdir(chartIndexDir(baseDir))
    } catch (err) {
      if (err.code === 'ENOENT') return []
      throw err
    }
    const matches = []
    for (const file of files) {
      if (!file.endsWith('.json') || file.endsWith('.tmp')) continue
      const pointer = await readJson(path.join(chartIndexDir(baseDir), file))
      if (pointer && pointer.patient_uuid === patientUuid && pointer.sigma_chart_no !== excludeChartNo) {
        matches.push(pointer)
      }
    }
    return matches
  }

  /**
   * Explicit clinician/staff confirmation action. `identity:uuid:
   * {patientUuid}` is always the outermost lock. Beyond it, this function
   * takes AT MOST ONE `identity:chart:*` lock at a time, across up to
   * three separate, strictly sequential critical sections (reclaim-old-
   * pending, reclaim-old-legacy, claim-new) -- never two chart locks held
   * simultaneously -- so there is no cross-chart lock-ordering/deadlock
   * risk anywhere in this store.
   *
   * Crash-safety: write order is (1) pending/<uuid>.json ("this uuid is
   * attempting to claim this chart_no" -- durable intent, written first,
   * same reasoning as crmStore.js's dedup pointer), (2) the by-chart
   * reverse pointer, (3) the final links/<uuid>.json record, (4) best-
   * effort cleanup of the now-redundant pending file. If the process dies
   * between (1)/(2) and (3), no usable link exists yet --
   * getIdentityByPatientUuid keeps returning null (fails closed).
   *
   * A retry with the SAME chart_no self-heals through to completion (the
   * existing reservation already matches, so steps 1-2 are no-ops).
   *
   * A retry with a DIFFERENT (corrected) chart_no first reclaims the
   * stale reservation: pending/<uuid>.json names which chart_no this uuid
   * last attempted, so a mismatch against the newly-requested chart_no is
   * detected in O(1) (no scan of by-chart/) and the orphaned reverse
   * pointer -- which by definition belongs to no completed link, since we
   * already confirmed above that links/<uuid>.json does not exist -- is
   * removed under ITS OWN chart lock before the new chart_no is claimed.
   * This is safe precisely because it is scoped to a reservation this
   * SAME uuid made and never completed; a pointer belonging to a
   * different uuid is never touched. Reclaiming (rather than merely
   * rejecting the corrected retry) is what lets the released chart_no
   * become claimable by a different patient afterward -- proven by a
   * failure-injection test.
   *
   * Identity Production Batch (Part A): after the O(1) pending-based
   * reclaim step above (a no-op unless a pending marker names a
   * DIFFERENT chart_no than the one being requested now), a lazy scan
   * ALWAYS runs looking for any other by-chart/ pointer this same uuid
   * owns under yet another chart_no -- a pending marker only ever tracks
   * the single most recent reservation, so a uuid can carry both a
   * legacy (pre-marker) orphan and a pending-tracked orphan at once, and
   * both must be reclaimed by one link call. Zero matches: proceed
   * normally. Exactly one: re-verify it under its own chart lock (the
   * scan itself is unlocked) and reclaim it the same way as the O(1)
   * path, only if it is STILL demonstrably incomplete (no completed
   * link has appeared for this uuid in the meantime). More than one
   * match is genuinely ambiguous/corrupt state -- this never guesses
   * which to reclaim; it fails closed with a distinct conflict reason
   * and touches nothing, leaving a human to resolve it directly.
   */
  async function linkPatientIdentity({ patientUuid, chartNo, patientName, confirmedBy, now }) {
    await ensureDirs()
    return withLock(`identity:uuid:${patientUuid}`, async () => {
      const existingLink = await readJson(linkPath(baseDir, patientUuid))
      if (existingLink) {
        const err = new IdentityConflictError('already_linked')
        // Independent-review finding (#5): let the caller show the doctor
        // WHAT this uuid is already linked to, instead of just "conflict"
        // -- server/index.js reads this to enrich the 409 response body.
        err.existingLink = existingLink
        throw err
      }

      const pending = await readJson(pendingPath(baseDir, patientUuid))
      if (pending && pending.sigma_chart_no !== chartNo) {
        await withLock(`identity:chart:${hashChartNo(pending.sigma_chart_no)}`, async () => {
          const stalePointer = await readJson(chartIndexPath(baseDir, pending.sigma_chart_no))
          // Defense in depth: only ever remove a pointer that still names
          // THIS uuid. Cannot legitimately be anyone else's (this uuid's
          // own pending record is what named it), but never delete on
          // trust alone.
          if (stalePointer && stalePointer.patient_uuid === patientUuid) {
            await removeFileIfExists(chartIndexPath(baseDir, pending.sigma_chart_no))
          }
        })
        await removeFileIfExists(pendingPath(baseDir, patientUuid))
      }

      // Independent-review finding (#6): this scan must NOT be gated on
      // "no pending marker at all". A pending marker only ever tracks the
      // single most recent reservation attempt, so a uuid can carry a
      // genuine legacy orphan (from before the marker existed) under a
      // wholly different chart_no AT THE SAME TIME as a pending marker
      // for yet another, more recent attempt. Running this unconditionally
      // -- excluding chartNo, the one being claimed right now, already
      // handled by the O(1) path above when it applied -- is what finds
      // that case too. This still only ever runs while `patientUuid` has
      // no completed link (the guard at the top of this function returns
      // early otherwise), so it costs at most one scan per never-yet-
      // linked uuid per link attempt, same bound as before.
      const legacyMatches = await findLegacyOrphanedReservations(patientUuid, chartNo)
      if (legacyMatches.length > 1) {
        throw new IdentityConflictError('legacy_reservation_ambiguous')
      }
      if (legacyMatches.length === 1) {
        const [legacy] = legacyMatches
        await withLock(`identity:chart:${hashChartNo(legacy.sigma_chart_no)}`, async () => {
          const stalePointer = await readJson(chartIndexPath(baseDir, legacy.sigma_chart_no))
          const stillNoLink = await readJson(linkPath(baseDir, patientUuid))
          if (stalePointer && stalePointer.patient_uuid === patientUuid && !stillNoLink) {
            await removeFileIfExists(chartIndexPath(baseDir, legacy.sigma_chart_no))
          }
        })
      }

      return withLock(`identity:chart:${hashChartNo(chartNo)}`, async () => {
        const chartPointer = await readJson(chartIndexPath(baseDir, chartNo))
        if (chartPointer && chartPointer.patient_uuid !== patientUuid) {
          throw new IdentityConflictError('chart_already_linked')
        }

        if (!chartPointer) {
          await atomicWrite(pendingPath(baseDir, patientUuid), { patient_uuid: patientUuid, sigma_chart_no: chartNo })
          await atomicWrite(chartIndexPath(baseDir, chartNo), { sigma_chart_no: chartNo, patient_uuid: patientUuid })
        }

        const record = {
          patient_uuid: patientUuid,
          sigma_chart_no: chartNo,
          patient_name: patientName,
          linked_at: now,
          confirmed_by: confirmedBy,
          version: 1,
        }
        await atomicWrite(linkPath(baseDir, patientUuid), record)
        await removeFileIfExists(pendingPath(baseDir, patientUuid))
        return record
      })
    })
  }

  return {
    getIdentityByPatientUuid,
    getIdentitiesByPatientUuids,
    linkPatientIdentity,
  }
}
