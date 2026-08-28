// Follow-up Session Token store (round 3: secure revisit Micro Follow-up
// linkage). Implements a one-time capability-token model, NOT a login
// system: the server never stores the plaintext token, only its SHA-256
// hash, so even reading this store's files on disk cannot reconstruct a
// usable token.
//
// One token record = one file, named by the token's hash (never the
// visit_id) so a public lookup by token is a direct file read, not a
// directory scan/comparison loop. A small secondary "pointer" file per
// visit_id tracks which token hash is currently ACTIVE for that visit, so
// "issuing a new token invalidates the old one" and "doctor asks: is there
// an active token for this visit" are both O(1) instead of a directory scan
// -- this mirrors this codebase's existing sibling-directory-per-entity
// pattern (visitStore.js/recorderResultStore.js/microFollowUpStore.js).
//
// Absolute rules enforced here:
// - plaintext token is NEVER written to disk or logged -- only returned
//   once, in-memory, from issueToken()'s return value.
// - a token is scoped to exactly one visit_id (baked into the stored
//   record; the public endpoints never accept a visit_id from the client).
// - target labels are snapshotted at issuance time and are the ONLY thing
//   a later public request can read back -- never re-resolved from live
//   clinician data, so a public reader can never see anything the token
//   wasn't explicitly issued to show.
import { randomBytes, createHash } from 'node:crypto'
import { mkdir, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'

const TOKEN_BYTES = 32 // 256 bits, well above the 128-bit minimum
// base64url alphabet only, generous length bound (32 bytes encodes to 43
// chars with no padding) -- reject anything outside this shape before ever
// hashing/looking it up, so a malformed/garbage "token" fails fast.
const TOKEN_FORMAT = /^[A-Za-z0-9_-]{32,128}$/

function tokensDir(baseDir) {
  return path.join(baseDir, 'tokens')
}
function pointersDir(baseDir) {
  return path.join(baseDir, 'by-visit')
}
function tokenPath(baseDir, tokenHash) {
  return path.join(tokensDir(baseDir), `${tokenHash}.json`)
}
function pointerPath(baseDir, visitId) {
  return path.join(pointersDir(baseDir), `${visitId}.json`)
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

export function hashToken(rawToken) {
  return createHash('sha256').update(rawToken, 'utf8').digest('hex')
}

export function isValidTokenFormat(rawToken) {
  return typeof rawToken === 'string' && TOKEN_FORMAT.test(rawToken)
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

export function createFollowUpSessionStore(baseDir, { ttlMinutes = 30 } = {}) {
  async function ensureDirs() {
    await mkdir(tokensDir(baseDir), { recursive: true })
    await mkdir(pointersDir(baseDir), { recursive: true })
  }

  // visit_id-keyed lock: issuance/reissue/invalidate for the same visit
  // always serialize, so "invalidate the previous active token, then
  // install the new pointer" can never race with itself.
  async function issueToken({ visit_id, patient_id, targets }) {
    return withLock(`visit:${visit_id}`, async () => {
      await ensureDirs()
      // Invalidate any currently-active token for this visit first -- a
      // revisit has at most one live patient link at a time.
      const pointer = await readJson(pointerPath(baseDir, visit_id))
      if (pointer?.active_token_hash) {
        await withLock(`token:${pointer.active_token_hash}`, async () => {
          const old = await readJson(tokenPath(baseDir, pointer.active_token_hash))
          if (old && old.status === 'ACTIVE') {
            old.status = 'INVALIDATED'
            old.invalidated_at = new Date().toISOString()
            await atomicWrite(tokenPath(baseDir, pointer.active_token_hash), old)
          }
        })
      }

      const rawToken = randomBytes(TOKEN_BYTES).toString('base64url')
      const tokenHash = hashToken(rawToken)
      const now = new Date().toISOString()
      const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString()
      // targets: [{id, label}] only -- the caller (server/store.js) is
      // responsible for deriving these from the clinician's own prior
      // Follow-up Targets, capped at 3, with no re-ranking. This store
      // never invents or looks up targets itself.
      const safeTargets = Array.isArray(targets)
        ? targets
            .filter((t) => t && typeof t.id === 'string' && typeof t.label === 'string')
            .slice(0, 3)
            .map((t) => ({ id: t.id, label: t.label }))
        : []
      const record = {
        token_hash: tokenHash,
        visit_id,
        patient_id,
        targets: safeTargets,
        status: 'ACTIVE',
        issued_at: now,
        expires_at: expiresAt,
        consumed_at: null,
        invalidated_at: null,
      }
      await atomicWrite(tokenPath(baseDir, tokenHash), record)
      await atomicWrite(pointerPath(baseDir, visit_id), { active_token_hash: tokenHash })
      // rawToken is returned exactly once, here, and never persisted.
      return { token: rawToken, record }
    })
  }

  // Doctor-facing status read -- never returns/reconstructs the raw token
  // (impossible; only the hash is stored). Used for "만료까지 남은 시간"/
  // "무효화" UI, not for building a patient link (that only exists at the
  // moment issueToken() returns).
  async function getActiveForVisit(visit_id) {
    const pointer = await readJson(pointerPath(baseDir, visit_id))
    if (!pointer?.active_token_hash) return null
    const record = await readJson(tokenPath(baseDir, pointer.active_token_hash))
    if (!record) return null
    return record
  }

  async function invalidateActiveForVisit(visit_id) {
    return withLock(`visit:${visit_id}`, async () => {
      const pointer = await readJson(pointerPath(baseDir, visit_id))
      if (!pointer?.active_token_hash) return null
      return withLock(`token:${pointer.active_token_hash}`, async () => {
        const record = await readJson(tokenPath(baseDir, pointer.active_token_hash))
        if (!record || record.status !== 'ACTIVE') return record
        record.status = 'INVALIDATED'
        record.invalidated_at = new Date().toISOString()
        await atomicWrite(tokenPath(baseDir, pointer.active_token_hash), record)
        return record
      })
    })
  }

  // Public-endpoint lookup: format-validate first (fails closed on garbage
  // without ever touching disk), then a single hashed-filename read -- no
  // scanning, no plaintext-token comparison loop.
  async function resolveToken(rawToken) {
    if (!isValidTokenFormat(rawToken)) return null
    const tokenHash = hashToken(rawToken)
    return readJson(tokenPath(baseDir, tokenHash))
  }

  // Round 4 review fix (durability ordering): the primitive underneath
  // consumeToken(). Validates the token is ACTIVE/unexpired, then runs the
  // caller's own durable action BEFORE committing the ACTIVE->CONSUMED
  // transition -- both still inside the same per-token lock, so no other
  // request can interleave. If actionFn throws (e.g. the durable save
  // itself fails), the token is left untouched (still ACTIVE) instead of
  // being burned: the patient can retry with the exact same one-time link
  // and their answer is never silently lost. Only after actionFn resolves
  // successfully does the token actually get consumed.
  async function consumeTokenWithAction(rawToken, actionFn) {
    if (!isValidTokenFormat(rawToken)) return { ok: false, reason: 'invalid' }
    const tokenHash = hashToken(rawToken)
    return withLock(`token:${tokenHash}`, async () => {
      const record = await readJson(tokenPath(baseDir, tokenHash))
      if (!record) return { ok: false, reason: 'invalid' }
      if (record.status === 'CONSUMED') return { ok: false, reason: 'consumed', record }
      if (record.status === 'INVALIDATED') return { ok: false, reason: 'invalidated', record }
      if (new Date(record.expires_at).getTime() < Date.now()) return { ok: false, reason: 'expired', record }
      const actionResult = await actionFn(record)
      record.status = 'CONSUMED'
      record.consumed_at = new Date().toISOString()
      await atomicWrite(tokenPath(baseDir, tokenHash), record)
      return { ok: true, record, actionResult }
    })
  }

  // Consumes atomically under the token's own lock: only an ACTIVE,
  // unexpired token can be consumed, and it can only ever succeed once --
  // a second call (double-submit) always finds status !== 'ACTIVE' and
  // fails closed. Kept as a thin wrapper over consumeTokenWithAction with a
  // no-op action for callers (and tests) that only need the plain
  // validate-and-consume behavior with no durable side effect to sequence.
  async function consumeToken(rawToken) {
    return consumeTokenWithAction(rawToken, async () => undefined)
  }

  // Retention (round 3): consumed/expired-or-invalidated token records are
  // deleted well before ordinary medical-record retention -- their only
  // purpose was a single short-lived handoff, and their audit trail (see
  // server/index.js's safeAudit calls) never includes the token itself, so
  // deleting the file loses no auditable information. `hours<=0` disables
  // cleanup (mirrors store.js's `days<=0` convention).
  async function cleanupOlderThan(hours) {
    if (!(hours > 0)) return 0
    const cutoff = Date.now() - hours * 60 * 60 * 1000
    let deleted = 0
    let files
    try {
      files = (await readdir(tokensDir(baseDir))).filter((f) => f.endsWith('.json'))
    } catch (err) {
      if (err.code === 'ENOENT') return 0
      throw err
    }
    for (const f of files) {
      const filePath = path.join(tokensDir(baseDir), f)
      try {
        const r = JSON.parse(await readFile(filePath, 'utf8'))
        const stillLive = r.status === 'ACTIVE' && new Date(r.expires_at).getTime() >= Date.now()
        if (stillLive) continue
        // For a consumed/invalidated token, age off its own timestamp; for
        // an ACTIVE-but-expired one (never consumed), age off expires_at.
        const referenceTime = r.consumed_at ?? r.invalidated_at ?? r.expires_at
        if (new Date(referenceTime).getTime() < cutoff) {
          await unlink(filePath).catch(() => {})
          deleted++
        }
      } catch {
        // 손상되거나 쓰는 중인 파일은 건드리지 않는다
      }
    }
    // Round 4 review fix: a by-visit/<visit_id>.json pointer file that
    // still points at a token_hash whose token file was just deleted above
    // (or was deleted by an earlier run) is now stale -- it can never
    // resolve to anything (getActiveForVisit's readJson just returns null
    // for the missing token file), so it's harmless to a caller, but left
    // alone it accumulates forever as a small permanent leak, one file per
    // ever-created revisit. Remove any pointer whose referenced token file
    // no longer exists.
    let pointerFiles
    try {
      pointerFiles = (await readdir(pointersDir(baseDir))).filter((f) => f.endsWith('.json'))
    } catch (err) {
      if (err.code !== 'ENOENT') throw err
      pointerFiles = []
    }
    for (const f of pointerFiles) {
      const pointerFilePath = path.join(pointersDir(baseDir), f)
      try {
        const pointer = JSON.parse(await readFile(pointerFilePath, 'utf8'))
        if (!pointer?.active_token_hash) continue
        const stillExists = await readJson(tokenPath(baseDir, pointer.active_token_hash))
        if (!stillExists) {
          await unlink(pointerFilePath).catch(() => {})
        }
      } catch {
        // 손상되거나 쓰는 중인 파일은 건드리지 않는다
      }
    }
    return deleted
  }

  async function purgeAll() {
    let deleted = 0
    for (const dir of [tokensDir(baseDir), pointersDir(baseDir)]) {
      let files
      try {
        files = (await readdir(dir)).filter((f) => f.endsWith('.json'))
      } catch (err) {
        if (err.code === 'ENOENT') continue
        throw err
      }
      for (const f of files) {
        await unlink(path.join(dir, f)).catch(() => {})
        deleted++
      }
    }
    return deleted
  }

  return {
    issueToken,
    getActiveForVisit,
    invalidateActiveForVisit,
    resolveToken,
    consumeToken,
    consumeTokenWithAction,
    cleanupOlderThan,
    purgeAll,
  }
}
