// Quick Revisit outbound-message delivery-state store. Provider-neutral --
// see messagingTransport.js for how BizM (the clinic owner's selected
// provider) vs SOLAPI (kept as non-default legacy code) is chosen; this
// file never imports either adapter directly.
//
// A "message" here is exactly one attempt to hand a patient their revisit
// follow-up link over SMS/Kakao Alimtalk, plus everything needed to track
// whether that attempt actually reached them. This is deliberately its own
// sibling data directory (messaging/, alongside crm/ and stations/), not
// nested under submissions/ -- a MessageRecord is operational delivery
// metadata, not a medical-record submission, and must not be swept by
// store.js's submission-retention logic (see server/index.js's
// checkDataDirsWritable/runRetention).
//
// Privacy guard (the whole reason this file never takes a raw phone
// number OR the actual message text as a persisted field): the recipient
// phone number, and the message `text` (built from the same one-time
// follow-up link this record's follow_up_token_hash is a hash of), are
// resolved by the CALLER (server/index.js's route handler, from the
// patient's own record / the doctor's own already-open session) and
// passed into queueRevisitMessage/attemptSend/retryMessage as transient
// arguments only -- used to call the transport and then discarded. Neither
// is ever written to disk here, ever included in the audit log (see
// server/index.js's safeAudit calls for this feature), or ever returned
// in any response body this store produces. The only patient-identifying
// field a MessageRecord itself persists is patient_id (the same opaque
// server-minted id used everywhere else), plus a SHA-256 hash (never the
// plaintext) of the follow-up capability token it was sent for.
//
// Idempotency/dedup: dedup_key is deterministic from (visit_id, purpose),
// not from a client-supplied idempotency header, so a doctor double-tapping
// "빠른 재진 발송" before the first request's response has rendered reuses
// the SAME record rather than creating a second real send -- see
// queueRevisitMessage's early-return path below.
//
// Retry/failure-recovery: exponential backoff (RETRY_DELAYS_MS), driven by
// server/index.js's periodic runMessageRetries() timer (mirrors the
// existing runRetention() timer pattern) scanning for due messages, plus a
// doctor-triggered manual retryMessage() for FAILED messages that have
// exhausted their automatic attempts. Kakao Alimtalk failures that are
// fallback-eligible (see solapiAdapter.js) automatically retry once
// immediately on SMS rather than waiting for the next backoff tick, since
// falling back to a different channel is not "the same attempt failing
// again" -- see attemptSend's fallback branch.
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createMessagingTransport, fallbackChannelMapForProvider } from './messagingTransport.js'

const DEFAULT_MAX_ATTEMPTS = 4
// Exponential backoff for automatic retries of a RETRYABLE failure:
// 30s, 2min, 10min. The 4th attempt (index 3) has no further delay because
// max_attempts caps at 4 -- next_retry_at is left null once attempt_count
// reaches max_attempts, which is what actually stops the retry loop; this
// array only has 3 entries because there are only 3 retries after the
// first attempt.
const RETRY_DELAYS_MS = [30_000, 120_000, 600_000]

export class MessagingConflictError extends Error {
  constructor(message) {
    super(message)
    this.name = 'MessagingConflictError'
  }
}
export class MessagingNotFoundError extends Error {
  constructor(message) {
    super(message)
    this.name = 'MessagingNotFoundError'
  }
}

function messagingDir(baseDir) {
  return path.join(baseDir)
}
function messagePath(baseDir, messageId) {
  return path.join(messagingDir(baseDir), `${messageId}.json`)
}

async function atomicWrite(filePath, data) {
  const tmp = `${filePath}.${randomUUID()}.tmp`
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

function deriveDedupKey(visitId, purpose) {
  return createHash('sha256').update(`${visitId}:${purpose}`, 'utf8').digest('hex')
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

const TERMINAL_NON_RETRY_STATUSES = new Set(['SENT', 'DELIVERED', 'CANCELLED'])

export function createMessagingStore(baseDir, { transport, maxAttempts = DEFAULT_MAX_ATTEMPTS } = {}) {
  const resolvedTransport = transport ?? createMessagingTransport()

  async function ensureDirs() {
    await mkdir(messagingDir(baseDir), { recursive: true })
  }

  async function findByDedupKey(dedupKey) {
    let files
    try {
      files = (await readdir(messagingDir(baseDir))).filter((f) => f.endsWith('.json'))
    } catch (err) {
      if (err.code === 'ENOENT') return null
      throw err
    }
    for (const f of files) {
      const record = await readJson(path.join(messagingDir(baseDir), f))
      if (record?.dedup_key === dedupKey) return record
    }
    return null
  }

  async function getMessage(messageId) {
    return readJson(messagePath(baseDir, messageId))
  }

  async function listMessagesForVisit(visitId) {
    let files
    try {
      files = (await readdir(messagingDir(baseDir))).filter((f) => f.endsWith('.json'))
    } catch (err) {
      if (err.code === 'ENOENT') return []
      throw err
    }
    const records = []
    for (const f of files) {
      const record = await readJson(path.join(messagingDir(baseDir), f))
      if (record?.visit_id === visitId) records.push(record)
    }
    records.sort((a, b) => (a.created_at < b.created_at ? -1 : 1))
    return records
  }

  async function listDueForRetry(now = new Date()) {
    let files
    try {
      files = (await readdir(messagingDir(baseDir))).filter((f) => f.endsWith('.json'))
    } catch (err) {
      if (err.code === 'ENOENT') return []
      throw err
    }
    const due = []
    for (const f of files) {
      const record = await readJson(path.join(messagingDir(baseDir), f))
      if (record?.status === 'QUEUED' && record.next_retry_at && new Date(record.next_retry_at) <= now) {
        due.push(record)
      }
    }
    return due
  }

  // Creates (or, if an identical logical request already exists, returns)
  // a QUEUED message and immediately attempts the first send. `phone`/
  // `text` are never persisted -- see the module doc comment.
  //
  // Closing-review finding (HIGH): the check-then-create sequence below
  // (findByDedupKey then atomicWrite) is the only mutating path in this
  // file that previously ran with NO lock at all -- every other operation
  // locks by message_id, but two concurrent queueRevisitMessage calls for
  // the SAME visit_id race each other before either message_id exists to
  // lock on. Reproduced: two concurrent calls both saw "not found" and
  // both created a record sharing one dedup_key, sending the patient two
  // real messages -- exactly what dedup exists to prevent. Fixed the same
  // way stationStore.js's own structurally identical scan-then-create
  // (assignRevisitToStation) is fixed: lock the ENTIRE check-and-create by
  // the dedup key itself, so a second concurrent call for the same
  // visit_id+purpose always waits for the first to finish creating (or
  // reusing) the record before it ever reads.
  async function queueRevisitMessage({ visitId, patientId, phone, followUpToken, text, variables, primaryChannel = 'KAKAO_ALIMTALK' }) {
    await ensureDirs()
    const dedupKey = deriveDedupKey(visitId, 'REVISIT_LINK')
    return withLock(`dedup:${dedupKey}`, async () => {
      const existing = await findByDedupKey(dedupKey)
      if (existing) {
        // Idempotent re-request: a message for this exact visit+purpose
        // already exists. If it already reached a terminal success state
        // or is actively in flight, hand it back unchanged rather than
        // sending a second real message. A FAILED message is intentionally
        // NOT silently re-queued here -- a doctor must explicitly call
        // retryMessage() for that, so a stale double-click long after a
        // failure was already handled some other way (e.g. staff called
        // the patient directly) can never surprise-resend.
        return { record: existing, deduped: true }
      }
      const now = new Date().toISOString()
      const record = {
        message_id: randomUUID(),
        visit_id: visitId,
        patient_id: patientId,
        purpose: 'REVISIT_LINK',
        follow_up_token_hash: hashToken(followUpToken),
        channel: primaryChannel,
        fallback_channel: null,
        // Second-pass independent-review finding (LOW): this used to
        // default to 'SOLAPI', which disagreed with
        // fallbackChannelMapForProvider's own fail-closed default (the
        // empty/BizM map) for the exact same "transport never set
        // .provider" case -- a caller-injected transport with no
        // `.provider` would get labeled SOLAPI here but then, at send time,
        // fall back-map-wise on this same SOLAPI label (a non-empty map)
        // in attemptSend, i.e. genuinely fail-open end-to-end, not just in
        // comment wording. Both defaults now agree on BizM (fail-closed:
        // empty fallback map) for an unrecognized/unset provider.
        provider: resolvedTransport.provider ?? 'BIZM',
        provider_message_id: null,
        status: 'QUEUED',
        attempt_count: 0,
        max_attempts: maxAttempts,
        last_attempt_at: null,
        next_retry_at: null,
        dedup_key: dedupKey,
        created_at: now,
        updated_at: now,
        version: 1,
        error_code: null,
      }
      await atomicWrite(messagePath(baseDir, record.message_id), record)
      // Closing-review finding (HIGH): this used to call attemptSend with
      // `{ phone, linkUrl: null, buildText: null }` -- attemptSend actually
      // destructures `{ phone, text }`, so `text` was silently `undefined`
      // on every single send, on every channel, always. The patient never
      // received the follow-up link at all. Fixed by actually threading
      // the caller-supplied `text` (the real message body, built by the
      // caller from the same one-time link this record's
      // follow_up_token_hash is a hash of -- see server/index.js's
      // buildRevisitMessageText) through to attemptSend.
      const sent = await attemptSend(record.message_id, { phone, text, variables })
      return { record: sent ?? record, deduped: false }
    })
  }

  // One send attempt, with automatic same-request fallback (Alimtalk ->
  // SMS) on a fallback-eligible failure. `phone`/`text` are the
  // caller-supplied, never-persisted inputs the transport actually needs;
  // on a later automatic retry (see runDueRetries) the caller no longer
  // has the phone number (or the one-time link `text` is built from) in
  // hand unless it cached them, which is why a RETRYABLE failure schedules
  // next_retry_at instead of this function re-deriving contact details
  // itself -- see the module doc comment on why phone numbers are never
  // persisted, and server/index.js's messagingContactCache for how the
  // caller keeps `{phone, text}` around in-process (never on disk) for the
  // retry sweep. Manual retryMessage() calls always re-supply both fresh.
  async function attemptSend(messageId, { phone, text, variables }) {
    return withLock(`message:${messageId}`, async () => {
      const record = await getMessage(messageId)
      if (!record) throw new MessagingNotFoundError('message not found')
      if (TERMINAL_NON_RETRY_STATUSES.has(record.status)) return record
      if (record.attempt_count >= record.max_attempts) {
        record.status = 'FAILED'
        record.next_retry_at = null
        record.updated_at = new Date().toISOString()
        record.version += 1
        await atomicWrite(messagePath(baseDir, messageId), record)
        return record
      }

      record.status = 'SENDING'
      record.attempt_count += 1
      record.last_attempt_at = new Date().toISOString()
      await atomicWrite(messagePath(baseDir, messageId), record)

      let result = await resolvedTransport.send({ to: phone, channel: record.channel, text, variables, messageId })

      // BizM-batch independent-review finding (LOW): keyed off the
      // RECORD's own `provider` (set once, at queue time) rather than a
      // fallback map frozen for this whole store's lifetime -- a store is
      // long-lived (one per server process), so a record queued under one
      // provider before an admin restarts the process with
      // SAMINDANG_MESSAGING_PROVIDER switched to the other would otherwise
      // silently get evaluated against the NEW provider's fallback map on
      // its next retry, even though its own `provider` field (and the
      // original send that actually reached the patient) says otherwise.
      const fallbackChannelMap = fallbackChannelMapForProvider(record.provider)
      if (!result.ok && result.fallbackEligible && fallbackChannelMap[record.channel] && !record.fallback_channel) {
        const fallbackChannel = fallbackChannelMap[record.channel]
        const fallbackResult = await resolvedTransport.send({ to: phone, channel: fallbackChannel, text, variables, messageId })
        record.fallback_channel = fallbackChannel
        if (fallbackResult.ok) {
          result = fallbackResult
        } else {
          // Keep the ORIGINAL failure's retryability -- a fallback attempt
          // that also fails should not make an otherwise-non-retryable
          // primary failure look retryable, or vice versa; the automatic
          // retry loop always retries the PRIMARY channel again next time
          // (fallback_channel is recorded but channel itself is never
          // overwritten), matching "Alimtalk primary, SMS fallback" as a
          // per-attempt behavior, not a permanent channel switch.
          result = { ...result, fallbackTried: true }
        }
      }

      const now = new Date().toISOString()
      record.updated_at = now
      record.version += 1

      if (result.ok) {
        record.status = 'SENT'
        record.provider_message_id = result.providerMessageId
        record.next_retry_at = null
        record.error_code = null
      } else {
        record.error_code = result.errorCode
        if (result.retryable && record.attempt_count < record.max_attempts) {
          record.status = 'QUEUED'
          const delay = RETRY_DELAYS_MS[Math.min(record.attempt_count - 1, RETRY_DELAYS_MS.length - 1)]
          record.next_retry_at = new Date(Date.now() + delay).toISOString()
        } else {
          record.status = 'FAILED'
          record.next_retry_at = null
        }
      }
      await atomicWrite(messagePath(baseDir, messageId), record)
      return record
    })
  }

  // Doctor-triggered manual retry. Unlike the automatic backoff loop, this
  // ignores next_retry_at (staff explicitly asked for it now) but still
  // refuses once max_attempts is exhausted or the message already reached
  // a terminal state -- a human retry cannot bypass the attempt cap, only
  // skip the WAIT between attempts.
  async function retryMessage(messageId, { phone, text, variables }) {
    const record = await getMessage(messageId)
    if (!record) throw new MessagingNotFoundError('message not found')
    if (TERMINAL_NON_RETRY_STATUSES.has(record.status)) {
      throw new MessagingConflictError(`message already ${record.status.toLowerCase()}`)
    }
    if (record.attempt_count >= record.max_attempts) {
      throw new MessagingConflictError('max attempts already reached')
    }
    return attemptSend(messageId, { phone, text, variables })
  }

  // Cancels a message that is currently QUEUED -- either never attempted
  // yet, or waiting out its backoff window for the next automatic retry
  // (queueRevisitMessage always attempts the first send inline, so
  // "never attempted" alone would make this unreachable in practice; a
  // message that just failed a retryable attempt and is sitting on
  // next_retry_at is exactly the case a doctor needs to be able to cancel,
  // e.g. the patient called back in the meantime). Cannot cancel anything
  // SENDING/SENT/DELIVERED/FAILED/already-CANCELLED -- those describe a
  // real attempt that already happened (or is happening), or a decision
  // already finalized, and cancellation cannot retract either.
  async function cancelMessage(messageId) {
    return withLock(`message:${messageId}`, async () => {
      const record = await getMessage(messageId)
      if (!record) throw new MessagingNotFoundError('message not found')
      if (record.status !== 'QUEUED') {
        throw new MessagingConflictError(`cannot cancel a message in status ${record.status}`)
      }
      record.status = 'CANCELLED'
      record.next_retry_at = null
      record.updated_at = new Date().toISOString()
      record.version += 1
      await atomicWrite(messagePath(baseDir, messageId), record)
      return record
    })
  }

  // Runs every message currently due for an automatic retry. `resolveContact`
  // is supplied by the caller (server/index.js) so this store never needs
  // to know how to look up a patient's phone number or rebuild the
  // one-time follow-up link text itself -- it only knows it needs both,
  // exactly when it needs them, and never persists either (see the module
  // doc comment on why phone numbers are never persisted -- the same
  // reasoning applies to `text`, since it is built from the same live
  // one-time capability link this record's follow_up_token_hash is a hash
  // of). resolveContact(patientId, visitId) returns `{ phone, text }` or a
  // falsy value; a resolution failure (e.g. the process restarted since
  // this was queued and the in-memory cache is now empty, or the patient
  // record was deleted after retention) is treated as a terminal failure
  // for that ONE message rather than a crash of the whole retry sweep --
  // staff can always fall back to the manual retryMessage() endpoint,
  // which takes both phone and text fresh again.
  // `onSettled(visitId, status)`, if supplied, fires once per due message
  // after its outcome for this sweep is known -- purely advisory (e.g. so
  // the caller can evict a now-terminal visit_id from its own contact
  // cache; see server/index.js's messagingContactCache). Never called for
  // a message this sweep's own try/catch swallowed an error for, and its
  // own failure must never abort the sweep either.
  async function runDueRetries(resolveContact, onSettled) {
    const due = await listDueForRetry()
    for (const record of due) {
      try {
        const contact = await resolveContact(record.patient_id, record.visit_id)
        // BizM-batch independent-review finding (LOW): this guard predates
        // `variables` -- it only ever checked `phone`/`text`, so a
        // resolveContact returning `{phone, text}` with no (or an empty)
        // `variables.followup_token` would sail through to attemptSend and
        // reach a LIVE BizM send with an empty template-substitution value,
        // producing a dead Alimtalk link marked SENT rather than failing
        // closed. Every current caller (server/index.js's
        // messagingContactCache, written on both the queue and manual-retry
        // routes) always sets `variables.followup_token`, so this only
        // tightens the fail-closed contract, it does not narrow any
        // existing legitimate path.
        if (!contact || !contact.phone || !contact.text || !contact.variables?.followup_token) {
          await withLock(`message:${record.message_id}`, async () => {
            const current = await getMessage(record.message_id)
            if (!current || TERMINAL_NON_RETRY_STATUSES.has(current.status)) return
            current.status = 'FAILED'
            current.error_code = 'recipient_unresolvable'
            current.next_retry_at = null
            current.updated_at = new Date().toISOString()
            current.version += 1
            await atomicWrite(messagePath(baseDir, record.message_id), current)
          })
          try {
            onSettled?.(record.visit_id, 'FAILED')
          } catch {
            // advisory callback failures must never affect the sweep
          }
          continue
        }
        const sent = await attemptSend(record.message_id, { phone: contact.phone, text: contact.text, variables: contact.variables })
        try {
          onSettled?.(record.visit_id, sent.status)
        } catch {
          // advisory callback failures must never affect the sweep
        }
      } catch {
        // A single message's retry failing (e.g. a lock contention edge
        // case) must never abort the sweep for every other due message.
      }
    }
    return due.length
  }

  // Webhook contract for the provider's delivery-status callback. The
  // EXACT payload shape/signature-verification scheme is EXTERNAL
  // CREDENTIAL PENDING (SOLAPI's webhook contract must be re-verified
  // against a real account before this can process a real callback) --
  // this implements a reasonable, documented shape (provider_message_id +
  // a delivered/failed status + optional error code) so the rest of the
  // pipeline (delivery-state tracking, UI) has something concrete to
  // integrate against today. Unknown provider_message_id is a no-op
  // (never throws), since a webhook for a message this deployment never
  // sent (e.g. a stale/replayed callback, or a different clinic's
  // instance on a shared provider account) must not be treated as an
  // error.
  async function handleDeliveryWebhook({ providerMessageId, delivered, errorCode }) {
    let files
    try {
      files = (await readdir(messagingDir(baseDir))).filter((f) => f.endsWith('.json'))
    } catch (err) {
      if (err.code === 'ENOENT') return { ok: true, matched: false }
      throw err
    }
    for (const f of files) {
      const record = await readJson(path.join(messagingDir(baseDir), f))
      if (record?.provider_message_id !== providerMessageId) continue
      return withLock(`message:${record.message_id}`, async () => {
        const current = await getMessage(record.message_id)
        if (!current || current.provider_message_id !== providerMessageId) return { ok: true, matched: false }
        // A DELIVERED/FAILED webhook only ever moves a message OUT of
        // SENT -- a message the store itself already marked FAILED (all
        // retries exhausted before any webhook arrived) is left alone,
        // since a late webhook describing an attempt that has since been
        // superseded by the retry/fallback logic is not authoritative
        // over the CURRENT attempt's own outcome.
        if (current.status !== 'SENT') return { ok: true, matched: true, unchanged: true }
        current.status = delivered ? 'DELIVERED' : 'FAILED'
        current.error_code = delivered ? null : (errorCode ?? 'provider_reported_undelivered')
        current.updated_at = new Date().toISOString()
        current.version += 1
        await atomicWrite(messagePath(baseDir, current.message_id), current)
        return { ok: true, matched: true, record: current }
      })
    }
    return { ok: true, matched: false }
  }

  async function purgeAll() {
    let count = 0
    try {
      count = (await readdir(messagingDir(baseDir))).filter((f) => f.endsWith('.json')).length
    } catch (err) {
      if (err.code !== 'ENOENT') throw err
    }
    await rm(messagingDir(baseDir), { recursive: true, force: true })
    return count
  }

  return {
    queueRevisitMessage,
    attemptSend,
    retryMessage,
    cancelMessage,
    getMessage,
    listMessagesForVisit,
    runDueRetries,
    handleDeliveryWebhook,
    purgeAll,
  }
}
