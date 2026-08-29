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
import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
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
function linkPath(baseDir, patientUuid) {
  return path.join(linksDir(baseDir), `${patientUuid}.json`)
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
   * Explicit clinician/staff confirmation action. Always locks
   * `identity:uuid:{patientUuid}` before `identity:chart:{chartNo}` (one
   * fixed order, the only place this store takes two locks at once, so
   * there is no cross-order deadlock risk).
   *
   * Crash-safety note: the chart pointer is written before the uuid
   * record (same "durable intent first" shape as crmStore.js's dedup
   * pointer). If the process dies between the two writes, the chart_no is
   * left reserved but no usable link exists yet -- getIdentityByPatientUuid
   * keeps returning null (fails closed: Today Queue keeps showing the
   * UUID fallback) rather than a half-written record, and retrying the
   * same link is safe once the process is back (the chart pointer already
   * matches this patientUuid, so it self-heals through to a completed
   * link on retry -- proven by a failure-injection test).
   */
  async function linkPatientIdentity({ patientUuid, chartNo, patientName, confirmedBy, now }) {
    await ensureDirs()
    return withLock(`identity:uuid:${patientUuid}`, () =>
      withLock(`identity:chart:${hashChartNo(chartNo)}`, async () => {
        const existingLink = await readJson(linkPath(baseDir, patientUuid))
        if (existingLink) throw new IdentityConflictError('already_linked')

        const chartPointer = await readJson(chartIndexPath(baseDir, chartNo))
        if (chartPointer && chartPointer.patient_uuid !== patientUuid) {
          throw new IdentityConflictError('chart_already_linked')
        }

        if (!chartPointer) {
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
        return record
      }),
    )
  }

  return {
    getIdentityByPatientUuid,
    getIdentitiesByPatientUuids,
    linkPatientIdentity,
  }
}
