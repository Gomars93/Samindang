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
// - at most ONE active assignment per station, AND at most one station per
//   visit/session. BOTH are enforced by refusing, never by displacing
//   (round 9 introduced these; round 10's review fixed the half that still
//   displaced). The reason is the same in both directions: the tablet stops
//   polling the moment a patient has the questions open, so nothing the
//   server does can change what is on that physical screen.
//     * target station already serving a DIFFERENT visit -> 'station_busy'.
//       Handing that tablet to the next patient would show them the
//       previous patient's session.
//     * this visit already assigned to ANOTHER station ->
//       'visit_assigned_elsewhere'. Round 9 "moved" the session by clearing
//       the old station's server-side assignment, but clearing a server
//       record cannot retract a raw capability the old tablet has already
//       fetched -- so a "successful" move could leave the SAME live token on
//       two physical screens while the server listed only one.
//   In both cases staff must reset the old station first. Reset revokes the
//   capability (see server/store.js's resetStation), so the next assignment
//   hands out a genuinely fresh one. A generation/heartbeat protocol that
//   can revoke an in-progress screen remotely is the alternative if
//   refusing ever proves too rigid; it would need a real compensating
//   transaction, which refusing does not.
import { randomBytes, createHash } from 'node:crypto'
import { mkdir, readdir, readFile, rename, rm, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'

const CREDENTIAL_BYTES = 32 // 256 bits, same bar as the follow-up capability token
const CREDENTIAL_FORMAT = /^[A-Za-z0-9_-]{32,128}$/
const MAX_STATION_NAME_LENGTH = 60
// Store-wide lock for the cross-station part of an assignment (the "one
// station per visit" check-and-act). Always acquired BEFORE any
// `station:<id>` lock, never after -- see assignSession's doc comment.
const ASSIGN_LOCK = 'assign:all'

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
  // stationId -> { visit_id, token }: the raw follow-up capability token,
  // stored TOGETHER with the visit it belongs to. Never persisted (see the
  // module doc comment). Cleared on completion, reassignment, manual
  // reset, and process restart.
  //
  // Round 9 review fix: keeping the visit_id alongside the token is what
  // lets pollAssignment prove the in-memory half and the on-disk half
  // describe the SAME assignment. Previously a poll that landed between
  // assignSession's disk write and its `assignedTokens.set` would hand the
  // station the PREVIOUS assignment's token under the NEW assignment's
  // metadata. Both halves are now written under the same per-station lock
  // that pollAssignment also takes, and the visit_id match is verified on
  // every read, so a torn pair fails closed to WAITING instead.
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

  // Installs a new assignment. Three guarantees, in this order:
  //
  // 1. A station already serving a DIFFERENT visit is refused
  //    ('station_busy'). Re-assigning the SAME visit to the same station is
  //    allowed and simply refreshes the handoff -- an idempotent re-hand,
  //    not a conflict.
  //
  // 2. A visit already assigned to ANOTHER station is refused
  //    ('visit_assigned_elsewhere') rather than moved. Round 10 review fix:
  //    the previous version released the old station and installed the same
  //    visit+token here, but releasing a server-side record cannot retract
  //    a capability the old tablet already fetched, so the same live token
  //    could end up on two physical screens. Worse, if this station's write
  //    then failed, the reused session was left assigned to nobody with no
  //    rollback (assignRevisitToStation deliberately never rolls back a
  //    reused session). Refusing has neither failure mode: nothing is
  //    touched unless the assignment is going to succeed. See the module
  //    doc comment.
  //
  // 3. The whole thing is serialized twice over: a store-wide assign lock
  //    makes the cross-station uniqueness check-and-act atomic against
  //    other assigns, and the per-station lock (also taken by
  //    pollAssignment and clearAssignment) makes the on-disk metadata and
  //    the in-memory token move as one.
  //
  // Lock order is always ASSIGN_LOCK -> station:<id>, and nothing acquires
  // them the other way round, so the ordering stays acyclic.
  async function assignSession(stationId, { visit_id, patient_id, token, delivery_mode }) {
    return withLock(ASSIGN_LOCK, async () => {
      const target = await getStation(stationId)
      if (!target) return { ok: false, reason: 'not_found' }
      if (target.assignment && target.assignment.visit_id !== visit_id) {
        return { ok: false, reason: 'station_busy', station: target }
      }

      // Every assign is serialized by ASSIGN_LOCK, so this scan cannot be
      // raced by another assign; a concurrent clear/complete can only free
      // a station, which makes this check conservative rather than wrong.
      for (const other of await listStations()) {
        if (other.station_id === stationId) continue
        if (other.assignment?.visit_id === visit_id) {
          return { ok: false, reason: 'visit_assigned_elsewhere', station: other }
        }
      }

      return withLock(`station:${stationId}`, async () => {
        const record = await getStation(stationId)
        if (!record) return { ok: false, reason: 'not_found' }
        if (record.assignment && record.assignment.visit_id !== visit_id) {
          return { ok: false, reason: 'station_busy', station: record }
        }
        record.assignment = {
          visit_id,
          patient_id,
          delivery_mode: delivery_mode ?? 'CLINIC_TABLET',
          status: 'WAITING',
          assigned_at: new Date().toISOString(),
        }
        await atomicWrite(stationPath(baseDir, stationId), record)
        assignedTokens.set(stationId, { visit_id, token })
        return { ok: true, station: record }
      })
    })
  }

  // The station's own poll. Returns ONLY what the tablet needs to open the
  // questions: a status and (when assigned) the raw capability token. No
  // patient_id, no name, no phone, no DOB, no targets -- exactly the same
  // privacy boundary the public follow-up-session GET already enforces
  // (the station then calls that endpoint with the token like any other
  // patient device would).
  //
  // Round 9 review fix: taken under the same per-station lock assignSession
  // and clearAssignment use, so a poll can never observe one half of an
  // assignment change, and the in-memory entry's visit_id must match the
  // on-disk assignment before its token is handed out.
  async function pollAssignment(stationId) {
    return withLock(`station:${stationId}`, async () => {
      const record = await getStation(stationId)
      if (!record?.assignment) return { status: 'WAITING' }
      const entry = assignedTokens.get(stationId)
      if (!entry || entry.visit_id !== record.assignment.visit_id) {
        // Either the in-memory token is gone (server restarted) or it
        // belongs to a different assignment than the metadata describes.
        // Report WAITING rather than a broken or mismatched assigned state
        // -- staff simply reassigns. Never invent or reconstruct a token.
        return { status: 'WAITING' }
      }
      return { status: 'ASSIGNED', token: entry.token }
    })
  }

  // Clears both halves of an assignment (memory + on-disk metadata). Used
  // by the station's own post-submit call and by staff's manual reset.
  //
  // `expectedVisitId` (round 10 review fix) makes the clear conditional:
  // staff's reset revokes the capability BEFORE freeing the station (see
  // server/store.js's resetStation), and revocation takes a visit lock it
  // may have to wait for. Passing the visit the caller decided to reset
  // means that if a different session landed on this station in the
  // meantime, the reset frees nothing rather than silently discarding an
  // assignment nobody asked it to touch. Omit it to clear unconditionally
  // (the station's own post-submit path, which is already scoped to its
  // own credential).
  async function clearAssignment(stationId, expectedVisitId = null) {
    return withLock(`station:${stationId}`, async () => {
      const record = await getStation(stationId)
      if (!record) return { ok: false, reason: 'not_found' }
      if (expectedVisitId !== null && record.assignment?.visit_id !== expectedVisitId) {
        return { ok: true, cleared: null, unchanged: true }
      }
      assignedTokens.delete(stationId)
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

  // Independent-review finding: *.json만 지우면 크래시로 남은 *.json.tmp
  // 고아 파일이 "전체 삭제" 이후에도 남는다. 디렉터리 자체를 rm -rf해
  // 파일명 패턴과 무관하게 확실히 비운다.
  async function purgeAll() {
    assignedTokens.clear()
    let count = 0
    try {
      count = (await readdir(stationsDir(baseDir))).filter((f) => f.endsWith('.json')).length
    } catch (err) {
      if (err.code !== 'ENOENT') throw err
    }
    await rm(stationsDir(baseDir), { recursive: true, force: true })
    return count
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
