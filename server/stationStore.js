// Clinic tablet station registry + session assignment (round 8:
// delivery-channel-agnostic Micro Follow-up). A "station" is a physical
// tablet that lives in the clinic (접수 태블릿 1, 치료실 태블릿 1, ...),
// paired ONCE by staff and then left sitting on a waiting screen. Staff
// assign a specific, already-known patient's revisit session to a specific
// station; the station polls, picks it up, and hands the tablet to the
// patient. The patient never types a name/phone/DOB, never scans anything,
// and never sees any identifier.
//
// Security model, deliberately mirroring followUpSessionStore.js rather
// than inventing a second one:
// - a station's credential is `randomBytes(32)` (256-bit), returned in
//   plaintext exactly once at registration (inside a one-time pairing
//   link) and stored ONLY as its SHA-256 hash -- reading these files on
//   disk cannot reconstruct a usable credential.
// - a station credential authenticates the DEVICE, never a patient, and
//   grants exactly two narrow abilities: read this station's own current
//   assignment, and clear it after submission. It is not a doctor token
//   and can never reach a doctor route (see server/index.js's route
//   guards, and src/lib/stationClient.ts's structural isolation).
// - the assignment's RAW follow-up capability token is held IN MEMORY
//   ONLY, never written to disk (see `assignedTokens` below). A server
//   restart deliberately loses pending handoffs: staff simply reassigns.
//   This keeps the plaintext capability out of the filesystem entirely,
//   matching the existing rule that a follow-up token's plaintext exists
//   only in the single issuance response.
// - at most ONE active assignment per station, always. Assigning over an
//   existing pending assignment invalidates the old session's token first
//   (see server/store.js's assignSessionToStation), so a superseded
//   patient link can never stay live on a tablet nobody is watching.
import { randomBytes, createHash } from 'node:crypto'
import { mkdir, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'

const CREDENTIAL_BYTES = 32 // 256 bits, same bar as the follow-up capability token
const CREDENTIAL_FORMAT = /^[A-Za-z0-9_-]{32,128}$/
const MAX_STATION_NAME_LENGTH = 60

function stationsDir(baseDir) {
  return path.join(baseDir, 'stations')
}
function stationPath(baseDir, stationId) {
  return path.join(stationsDir(baseDir), `${stationId}.json`)
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

export function hashCredential(rawCredential) {
  return createHash('sha256').update(rawCredential, 'utf8').digest('hex')
}

export function isValidCredentialFormat(rawCredential) {
  return typeof rawCredential === 'string' && CREDENTIAL_FORMAT.test(rawCredential)
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

export function createStationStore(baseDir) {
  // stationId -> raw follow-up capability token. Never persisted (see the
  // module doc comment). Cleared on completion, reassignment, manual
  // reset, and process restart.
  const assignedTokens = new Map()

  async function ensureDirs() {
    await mkdir(stationsDir(baseDir), { recursive: true })
  }

  // Registration is a staff action (doctor-guarded route). Returns the
  // plaintext credential exactly once -- the caller renders it into a
  // one-time pairing link that is opened on the tablet itself.
  async function registerStation(name) {
    await ensureDirs()
    const trimmedName = typeof name === 'string' ? name.trim().slice(0, MAX_STATION_NAME_LENGTH) : ''
    if (!trimmedName) return null
    const rawCredential = randomBytes(CREDENTIAL_BYTES).toString('base64url')
    const credentialHash = hashCredential(rawCredential)
    const stationId = randomBytes(16).toString('hex')
    const record = {
      station_id: stationId,
      name: trimmedName,
      credential_hash: credentialHash,
      created_at: new Date().toISOString(),
      // Assignment metadata is NON-SECRET only: which visit/patient this
      // station is currently serving, for the STAFF-facing queue view. The
      // raw capability token lives in `assignedTokens` (memory) alone.
      assignment: null,
    }
    await atomicWrite(stationPath(baseDir, stationId), record)
    return { credential: rawCredential, station: record }
  }

  // Station-credential lookup for the station's own two narrow endpoints.
  // Format-validate first so garbage never touches disk, then a directory
  // scan comparing HASHES (stations are a handful of devices per clinic,
  // so an O(n) scan over a tiny set is fine -- unlike follow-up tokens,
  // which are keyed by hash filename precisely because there are many).
  async function resolveStation(rawCredential) {
    if (!isValidCredentialFormat(rawCredential)) return null
    const credentialHash = hashCredential(rawCredential)
    let files
    try {
      files = (await readdir(stationsDir(baseDir))).filter((f) => f.endsWith('.json'))
    } catch (err) {
      if (err.code === 'ENOENT') return null
      throw err
    }
    for (const f of files) {
      const record = await readJson(path.join(stationsDir(baseDir), f))
      if (record?.credential_hash === credentialHash) return record
    }
    return null
  }

  async function getStation(stationId) {
    return readJson(stationPath(baseDir, stationId))
  }

  // Staff-facing list: never includes credential_hash (no reason for the
  // browser to ever see it, even hashed).
  async function listStations() {
    let files
    try {
      files = (await readdir(stationsDir(baseDir))).filter((f) => f.endsWith('.json'))
    } catch (err) {
      if (err.code === 'ENOENT') return []
      throw err
    }
    const stations = []
    for (const f of files) {
      const record = await readJson(path.join(stationsDir(baseDir), f))
      if (!record) continue
      stations.push({
        station_id: record.station_id,
        name: record.name,
        created_at: record.created_at,
        assignment: record.assignment,
      })
    }
    stations.sort((a, b) => (a.created_at < b.created_at ? -1 : 1))
    return stations
  }

  // Installs a new assignment, returning the assignment that was displaced
  // (if any) so the caller can invalidate its now-superseded follow-up
  // token. Serialized per station so two concurrent assign calls cannot
  // both believe they won.
  async function assignSession(stationId, { visit_id, patient_id, token, delivery_mode }) {
    return withLock(`station:${stationId}`, async () => {
      const record = await getStation(stationId)
      if (!record) return { ok: false, reason: 'not_found' }
      const displaced = record.assignment
      record.assignment = {
        visit_id,
        patient_id,
        delivery_mode: delivery_mode ?? 'CLINIC_TABLET',
        status: 'WAITING',
        assigned_at: new Date().toISOString(),
      }
      await atomicWrite(stationPath(baseDir, stationId), record)
      assignedTokens.set(stationId, token)
      return { ok: true, station: record, displaced }
    })
  }

  // The station's own poll. Returns ONLY what the tablet needs to open the
  // questions: a status and (when assigned) the raw capability token. No
  // patient_id, no name, no phone, no DOB, no targets -- exactly the same
  // privacy boundary the public follow-up-session GET already enforces
  // (the station then calls that endpoint with the token like any other
  // patient device would).
  async function pollAssignment(stationId) {
    const record = await getStation(stationId)
    if (!record?.assignment) return { status: 'WAITING' }
    const token = assignedTokens.get(stationId)
    if (!token) {
      // Metadata says assigned but the in-memory token is gone (server
      // restarted). Report WAITING rather than a broken assigned state --
      // staff simply reassigns. Never invent or reconstruct a token.
      return { status: 'WAITING' }
    }
    return { status: 'ASSIGNED', token }
  }

  // Clears both halves of an assignment (memory + on-disk metadata). Used
  // by the station's own post-submit call and by staff's manual reset.
  async function clearAssignment(stationId) {
    return withLock(`station:${stationId}`, async () => {
      assignedTokens.delete(stationId)
      const record = await getStation(stationId)
      if (!record) return { ok: false, reason: 'not_found' }
      const cleared = record.assignment
      record.assignment = null
      await atomicWrite(stationPath(baseDir, stationId), record)
      return { ok: true, cleared }
    })
  }

  // Staff-facing lookup used by the revisit queue to show which station (if
  // any) a given visit is currently assigned to.
  async function findStationForVisit(visitId) {
    for (const s of await listStations()) {
      if (s.assignment?.visit_id === visitId) return s
    }
    return null
  }

  async function purgeAll() {
    assignedTokens.clear()
    let files
    try {
      files = (await readdir(stationsDir(baseDir))).filter((f) => f.endsWith('.json'))
    } catch (err) {
      if (err.code === 'ENOENT') return 0
      throw err
    }
    for (const f of files) {
      await unlink(path.join(stationsDir(baseDir), f)).catch(() => {})
    }
    return files.length
  }

  return {
    registerStation,
    resolveStation,
    getStation,
    listStations,
    assignSession,
    pollAssignment,
    clearAssignment,
    findStationForVisit,
    purgeAll,
  }
}
