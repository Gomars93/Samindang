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
import { mkdir, readdir, readFile, rename, rm, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'

const TOKEN_BYTES = 32 // 256 bits, well above the 128-bit minimum
// base64url alphabet only, generous length bound (32 bytes encodes to 43
// chars with no padding) -- reject anything outside this shape before ever
// hashing/looking it up, so a malformed/garbage "token" fails fast.
const TOKEN_FORMAT = /^[A-Za-z0-9_-]{32,128}$/

// Round 8 (delivery-channel-agnostic Micro Follow-up): delivery_mode is
// PURE OPERATIONAL METADATA describing how a session's one-time link
// reached the patient -- it never changes clinical meaning, routing,
// thresholds, or Follow-up Target selection, and this store never reads it
// for anything except passing it through. An unrecognized value is
// normalized to null rather than rejected (fail-closed on trust, not on
// availability -- a malformed delivery_mode must never block issuing a
// working link).
const DELIVERY_MODES = new Set(['CLINIC_TABLET', 'PERSONAL_QR', 'STAFF_ASSISTED', 'PREVISIT_LINK'])
function normalizeDeliveryMode(mode) {
  return typeof mode === 'string' && DELIVERY_MODES.has(mode) ? mode : null
}

// 플로우 정렬 4/5 (환자 치료 계획 링크): the same hash-only capability-token
// model now also carries a READ-ONLY patient care-plan page. `kind`
// distinguishes the two uses of one record shape:
// - 'FOLLOW_UP' (default, every pre-existing record has no `kind` field and
//   is treated as this): the Micro Follow-up questions; consumable once.
// - 'CARE_PLAN': the clinician-approved patient-facing care-plan TEXT,
//   snapshotted at issuance (never re-read from the live workspace), shown
//   read-only and NEVER consumable -- consumeTokenWithAction refuses it
//   below, so a care-plan token can never accept a submission even if it
//   somehow reached a submit path.
// `care_plan_text` is patient-facing prose only (what the doctor already
// hands over on paper/by copy) -- it is stored at rest under the token gate
// exactly like the follow-up target labels, and is capped so a broken
// client cannot persist arbitrary bulk.
const TOKEN_KINDS = new Set(['FOLLOW_UP', 'CARE_PLAN'])
export const CARE_PLAN_TEXT_MAX_CHARS = 4000
function normalizeKind(kind) {
  return typeof kind === 'string' && TOKEN_KINDS.has(kind) ? kind : 'FOLLOW_UP'
}
function normalizeCarePlanText(kind, text) {
  if (kind !== 'CARE_PLAN') return null
  return typeof text === 'string' ? text.slice(0, CARE_PLAN_TEXT_MAX_CHARS) : ''
}

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
  // always serialize.
  //
  // Round 6 review fix: this used to invalidate the previous active token
  // BEFORE the new token record + pointer were durably written -- if either
  // of those writes then failed, a previously working patient link was
  // already destroyed with nothing to replace it. Now a strict two-phase
  // swap: (1) durably write the new token record while the OLD token/
  // pointer are still completely untouched and still resolve normally, (2)
  // atomically switch the visit's pointer to the new token hash -- this is
  // the single moment the new link becomes "the" active one. Only after
  // step (2) succeeds do we best-effort invalidate the old token; if that
  // last step fails, the old token record is merely stale (still says
  // ACTIVE) but the pointer no longer references it, so it is not handed
  // out as "the" active link by getActiveForVisit -- not a correctness
  // problem for the new capability. If step (2) itself fails, the new
  // token record we just wrote in step (1) is deleted before rethrowing,
  // so issueToken leaves either a fully-installed new token+pointer or
  // (on any failure) exactly the state that existed before the call --
  // never an orphan ACTIVE token record with no pointer referencing it.
  async function issueToken({ visit_id, patient_id, targets, delivery_mode, kind, care_plan_text }) {
    return withLock(`visit:${visit_id}`, async () => {
      await ensureDirs()
      const pointer = await readJson(pointerPath(baseDir, visit_id))
      const previousActiveHash = pointer?.active_token_hash ?? null

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
      const resolvedKind = normalizeKind(kind)
      const record = {
        token_hash: tokenHash,
        visit_id,
        patient_id,
        targets: safeTargets,
        status: 'ACTIVE',
        kind: resolvedKind,
        care_plan_text: normalizeCarePlanText(resolvedKind, care_plan_text),
        delivery_mode: normalizeDeliveryMode(delivery_mode),
        issued_at: now,
        expires_at: expiresAt,
        // Round 8: set once, the first time a GET on this token succeeds
        // while ACTIVE (see markStarted below) -- an operational signal for
        // "did the patient/station actually open this," never read by any
        // clinical logic.
        patient_started_at: null,
        consumed_at: null,
        invalidated_at: null,
      }

      // Phase 1: write the new token record. The old token/pointer are
      // still fully intact at this point -- a failure here leaves zero
      // trace of this call ever happening.
      await atomicWrite(tokenPath(baseDir, tokenHash), record)

      // Phase 2: atomically switch the visit's pointer to the new token.
      // A failure here means the new capability never became "the active
      // one" -- clean up the orphaned record we just wrote and rethrow, so
      // no ACTIVE token with no referencing pointer is left behind.
      try {
        await atomicWrite(pointerPath(baseDir, visit_id), { active_token_hash: tokenHash })
      } catch (err) {
        await unlink(tokenPath(baseDir, tokenHash)).catch(() => {})
        throw err
      }

      // Phase 3: best-effort invalidate the previous token now that the
      // new one is durably installed and live. If this fails, the old
      // token record is merely left stale -- it's already unreachable via
      // getActiveForVisit since the pointer no longer names it.
      if (previousActiveHash && previousActiveHash !== tokenHash) {
        await withLock(`token:${previousActiveHash}`, async () => {
          const old = await readJson(tokenPath(baseDir, previousActiveHash))
          if (old && old.status === 'ACTIVE') {
            old.status = 'INVALIDATED'
            old.invalidated_at = new Date().toISOString()
            await atomicWrite(tokenPath(baseDir, previousActiveHash), old)
          }
        }).catch(() => {})
      }

      // rawToken is returned exactly once, here, and never persisted.
      return { token: rawToken, record }
    })
  }

  // Round 7 review fix (pointer authority): a token record's own `status`
  // field can be stale if issueToken's phase-3 best-effort invalidation
  // failed to persist after its phase-2 pointer swap already succeeded --
  // the OLD record would still say ACTIVE on disk even though a newer
  // token is now the visit's real active capability. The by-visit pointer
  // is the single source of truth for "which token is currently active for
  // this visit" (that is the whole point of phase 2 being the atomic
  // switch point), so any record read directly by hash -- bypassing the
  // pointer, as resolveToken/consumeTokenWithAction below both do for
  // O(1) lookup -- must be checked against the pointer before its ACTIVE
  // status is trusted. getActiveForVisit/invalidateActiveForVisit above
  // need no such check: they already resolve the token THROUGH the
  // pointer, so they can never observe a superseded record in the first
  // place.
  async function currentPointerHash(visit_id) {
    const pointer = await readJson(pointerPath(baseDir, visit_id))
    return pointer?.active_token_hash ?? null
  }

  function withPointerAuthority(record, tokenHash, pointerHash) {
    if (record.status !== 'ACTIVE' || pointerHash === tokenHash) return record
    // The pointer has already moved on to a different token -- this one is
    // no longer authoritative regardless of what its own status says.
    return { ...record, status: 'INVALIDATED', invalidated_at: record.invalidated_at ?? new Date().toISOString() }
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

  // Round 9 review fix (pointer-authority TOCTOU): checking the pointer is
  // not enough on its own. issueToken holds `visit:<visit_id>` for its
  // ENTIRE two-phase swap, but the public read/accept paths below reach a
  // record BY HASH and used to consult the pointer without holding that
  // lock -- so a swap could land between the record read and the pointer
  // read, or (far worse) between the check and a still-running acceptance,
  // letting a superseded token finish a submission after it had already
  // lost authority. Every by-hash path therefore now runs its whole
  // check-and-act inside the same visit-level lock, acquired in one
  // consistent order (visit -> token) that matches issueToken's own phase
  // 3 and invalidateActiveForVisit, so the ordering stays acyclic and
  // cannot deadlock. The unlocked pre-read below is used ONLY to learn
  // which visit lock to take -- a record's visit_id is immutable once
  // written -- and never to decide anything.
  //
  // Public-endpoint lookup: format-validate first (fails closed on garbage
  // without ever touching disk), then a single hashed-filename read -- no
  // scanning, no plaintext-token comparison loop. Still read-only: any
  // pointer-authority correction is computed for THIS response only, never
  // persisted -- consumeTokenWithAction below is the one that self-heals
  // the on-disk record.
  async function resolveToken(rawToken) {
    if (!isValidTokenFormat(rawToken)) return null
    const tokenHash = hashToken(rawToken)
    const probe = await readJson(tokenPath(baseDir, tokenHash))
    if (!probe) return null
    return withLock(`visit:${probe.visit_id}`, async () => {
      const record = await readJson(tokenPath(baseDir, tokenHash))
      if (!record) return null
      const pointerHash = await currentPointerHash(record.visit_id)
      return withPointerAuthority(record, tokenHash, pointerHash)
    })
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
  //
  // Round 9 review fix (TOCTOU): the whole validate -> act -> commit
  // sequence now runs inside the token's visit lock as well, so it is
  // mutually exclusive with issueToken's pointer swap for that visit. The
  // acceptance and the swap can no longer interleave in either direction:
  // if the swap wins the lock first, this call re-reads the pointer and
  // fails closed WITHOUT ever invoking actionFn (no response is saved, no
  // token is burned); if this call wins, the reissue waits and the answer
  // the patient already submitted stands.
  async function consumeTokenWithAction(rawToken, actionFn) {
    if (!isValidTokenFormat(rawToken)) return { ok: false, reason: 'invalid' }
    const tokenHash = hashToken(rawToken)
    // Unlocked pre-read ONLY to learn which visit lock to acquire.
    const probe = await readJson(tokenPath(baseDir, tokenHash))
    if (!probe) return { ok: false, reason: 'invalid' }
    return withLock(`visit:${probe.visit_id}`, async () =>
      withLock(`token:${tokenHash}`, async () => {
        const stored = await readJson(tokenPath(baseDir, tokenHash))
        if (!stored) return { ok: false, reason: 'invalid' }
        // Pointer-authority check (round 7 review fix): under both locks,
        // so this is also the safe place to self-heal a stale on-disk
        // ACTIVE status left by a failed phase-3 invalidation.
        const pointerHash = await currentPointerHash(stored.visit_id)
        const record = withPointerAuthority(stored, tokenHash, pointerHash)
        // A CARE_PLAN token is read-only by definition -- it can never be
        // consumed, whatever path tried. Refused before any status check so
        // the answer is the same regardless of the record's lifecycle.
        if (record.kind === 'CARE_PLAN') return { ok: false, reason: 'invalid', record }
        if (record.status === 'CONSUMED') return { ok: false, reason: 'consumed', record }
        if (record.status === 'INVALIDATED') {
          if (record !== stored) await atomicWrite(tokenPath(baseDir, tokenHash), record).catch(() => {})
          return { ok: false, reason: 'invalidated', record }
        }
        if (new Date(record.expires_at).getTime() < Date.now()) return { ok: false, reason: 'expired', record }
        const actionResult = await actionFn(record)
        record.status = 'CONSUMED'
        record.consumed_at = new Date().toISOString()
        await atomicWrite(tokenPath(baseDir, tokenHash), record)
        return { ok: true, record, actionResult }
      }),
    )
  }

  // Round 8 (operational timestamps): records the first moment a patient
  // (or an assigned clinic-tablet station acting on their behalf) actually
  // opened this session's questions. Best-effort and idempotent -- called
  // from the public GET route, so it must never fail that read: a write
  // error here is swallowed, and a second call is a no-op because
  // patient_started_at is only ever set when it is still null. Purely
  // operational (lets the clinic later see whether links sit unopened);
  // no clinical logic reads it.
  //
  // Round 9: takes the same visit -> token locks and re-checks pointer
  // authority as the paths above, so "every by-hash path respects the
  // pointer" is a true invariant with no documented exceptions -- a
  // superseded token cannot even record that it was opened.
  async function markStarted(rawToken) {
    if (!isValidTokenFormat(rawToken)) return
    const tokenHash = hashToken(rawToken)
    try {
      const probe = await readJson(tokenPath(baseDir, tokenHash))
      if (!probe) return
      await withLock(`visit:${probe.visit_id}`, async () =>
        withLock(`token:${tokenHash}`, async () => {
          const record = await readJson(tokenPath(baseDir, tokenHash))
          if (!record || record.status !== 'ACTIVE' || record.patient_started_at) return
          if ((await currentPointerHash(record.visit_id)) !== tokenHash) return
          record.patient_started_at = new Date().toISOString()
          await atomicWrite(tokenPath(baseDir, tokenHash), record)
        }),
      )
    } catch {
      // best-effort by design: never fail the patient's read over this
    }
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
      // Round 17 (restart-safe / multi-process correctness): this was an
      // unlocked read-check-unlink, racing issueToken's own two-phase
      // pointer swap (see its doc comment above). Sequence that actually
      // happened in a reproduction: this loop reads pointer P for visit V,
      // sees its token file missing (already aged off by the *.json loop
      // above, or by an earlier cleanup run) -- then, before this loop
      // gets to unlink P, a doctor reissues: issueToken writes a brand-new
      // token file and atomically swaps by-visit/V.json to point at it.
      // This loop, still holding its now-STALE in-memory copy of P, then
      // unlinks by-visit/V.json anyway -- destroying the pointer to the
      // capability that was JUST handed to the patient. Every subsequent
      // read of that visit's session goes through the pointer
      // (getActiveForVisit/resolveToken's pointer-authority contract, see
      // this file's round 7/9 comments), so the freshly-issued link
      // silently starts reporting as gone. Fix: take the SAME
      // `visit:<id>` lock issueToken's pointer swap uses, and RE-READ the
      // pointer from disk inside that lock before deciding to unlink --
      // exactly the same TOCTOU-closing pattern round 9 already applied to
      // the read side (getActiveForVisit/consumeTokenWithAction).
      const visitId = f.endsWith('.json') ? f.slice(0, -'.json'.length) : f
      await withLock(`visit:${visitId}`, async () => {
        try {
          // Read the pointer FRESH, inside the lock -- not the copy this
          // loop may have listed earlier -- so a concurrent issueToken
          // pointer swap can never be observed as still-dangling.
          const pointer = JSON.parse(await readFile(pointerFilePath, 'utf8'))
          if (!pointer?.active_token_hash) return
          const stillExists = await readJson(tokenPath(baseDir, pointer.active_token_hash))
          if (stillExists) return
          await unlink(pointerFilePath).catch(() => {})
        } catch {
          // 손상되거나 쓰는 중인 파일은 건드리지 않는다 (ENOENT here means
          // the pointer was already removed by a concurrent run/action --
          // also safe to just return)
        }
      })
    }
    return deleted
  }

  // Independent-review finding: *.json만 지우면 크래시로 남은 *.json.tmp
  // 고아 파일(여기서는 캡슐 토큰 자체를 담을 수 있음)이 "전체 삭제" 이후에도
  // 남는다. 각 디렉터리를 rm -rf해 파일명 패턴과 무관하게 확실히 비운다.
  async function purgeAll() {
    let deleted = 0
    for (const dir of [tokensDir(baseDir), pointersDir(baseDir)]) {
      try {
        deleted += (await readdir(dir)).filter((f) => f.endsWith('.json')).length
      } catch (err) {
        if (err.code !== 'ENOENT') throw err
      }
      await rm(dir, { recursive: true, force: true })
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
    markStarted,
    cleanupOlderThan,
    purgeAll,
  }
}
