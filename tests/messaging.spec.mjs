// Quick Revisit outbound messaging (SOLAPI scaffold) regression suite.
// Plain node, no test framework -- same convention as
// tests/crm-store.spec.mjs / tests/audit-registry.spec.mjs: assert()
// prints "OK: <name>" and throws on failure.
//
// Scope: this batch is explicitly API-credential-free (see
// server/solapiAdapter.js's header) -- everything here exercises the mock
// transport (SOLAPI_PROVIDER_STATE resolves to PENDING_CREDENTIALS with no
// env vars set, which is the real state of this deployment today) plus the
// full persistence/retry/fallback/webhook contract around it. Live-SOLAPI
// wire-format correctness is EXTERNAL CREDENTIAL PENDING and out of scope.
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createApp } from '../server/index.js'
import { auditLogPath } from '../server/audit.js'
import { resolveSolapiProviderState } from '../server/solapiAdapter.js'
import { createMessagingStore, hashToken } from '../server/messagingStore.js'

let passCount = 0
function assert(name, cond) {
  if (!cond) throw new Error(`FAIL: ${name}`)
  passCount++
  console.log(`OK: ${name}`)
}

async function startServer(opts) {
  const server = createApp(opts)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  return { server, base: `http://127.0.0.1:${port}` }
}
function stopServer(server) {
  return new Promise((resolve) => server.close(resolve))
}

const DOCTOR_TOKEN = 'messaging-test-token'
const AUTH_HEADERS = { 'content-type': 'application/json', 'x-doctor-token': DOCTOR_TOKEN }

async function postJson(url, body, headers = AUTH_HEADERS) {
  const res = await fetch(url, { method: 'POST', headers, body: body === undefined ? undefined : JSON.stringify(body) })
  return { status: res.status, body: await res.json() }
}
async function getJson(url, headers = AUTH_HEADERS) {
  const res = await fetch(url, { headers })
  return { status: res.status, body: await res.json() }
}

async function readAuditLines(logPath) {
  let raw
  try {
    raw = await readFile(logPath, 'utf8')
  } catch (err) {
    if (err.code === 'ENOENT') return []
    throw err
  }
  return raw.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))
}

async function main() {
  /* =====================================================================
     Part 0: resolveSolapiProviderState -- the 3-state gate itself, no
     server/HTTP involved.
     ===================================================================== */
  {
    assert(
      'provider state: no credentials -> PENDING_CREDENTIALS (the real state of this deployment today)',
      resolveSolapiProviderState({}) === 'PENDING_CREDENTIALS',
    )
    assert(
      'provider state: partial credentials (missing sender number) -> still PENDING_CREDENTIALS',
      resolveSolapiProviderState({ SOLAPI_API_KEY: 'k', SOLAPI_API_SECRET: 's' }) === 'PENDING_CREDENTIALS',
    )
    const fullCreds = { SOLAPI_API_KEY: 'k', SOLAPI_API_SECRET: 's', SOLAPI_SENDER_NUMBER: '01000000000' }
    assert('provider state: full credentials, no force-mock -> LIVE', resolveSolapiProviderState(fullCreds) === 'LIVE')
    assert(
      'provider state: full credentials + SAMINDANG_SOLAPI_FORCE_MOCK=true -> MOCK',
      resolveSolapiProviderState({ ...fullCreds, SAMINDANG_SOLAPI_FORCE_MOCK: 'true' }) === 'MOCK',
    )
  }

  /* =====================================================================
     Part 1: messagingStore unit-level -- dedup/idempotency, retry backoff
     scheduling, fallback, webhook contract, cancel guard. Uses the store
     directly (default mock transport, no server/HTTP) for tight control
     over timing assertions.
     ===================================================================== */
  {
    const dataRoot = await mkdtemp(path.join(tmpdir(), 'samindang-messaging-store-'))
    try {
      const store = createMessagingStore(dataRoot)

      // Idempotency: two queueRevisitMessage calls with the same
      // (visitId, purpose) return the SAME record, the second marked
      // deduped -- a doctor double-tapping "발송" must never send twice.
      const q1 = await store.queueRevisitMessage({ visitId: 'visit-dedup-1', patientId: 'patient-1', phone: '01011112222', followUpToken: 'tok-a' })
      assert('dedup: first queue is not deduped', q1.deduped === false)
      assert('dedup: first queue succeeds against the normal mock transport (SENT)', q1.record.status === 'SENT')
      const q2 = await store.queueRevisitMessage({ visitId: 'visit-dedup-1', patientId: 'patient-1', phone: '01011112222', followUpToken: 'tok-a' })
      assert('dedup: second queue for the same visit_id+purpose IS deduped', q2.deduped === true)
      assert('dedup: second queue returns the SAME message_id', q2.record.message_id === q1.record.message_id)

      // follow_up_token_hash is a hash, never the plaintext token.
      assert('privacy: follow_up_token_hash is not the raw token', q1.record.follow_up_token_hash !== 'tok-a')
      assert('privacy: follow_up_token_hash matches hashToken(rawToken)', q1.record.follow_up_token_hash === hashToken('tok-a'))
      assert('privacy: the persisted record has no "phone" field at all', !('phone' in q1.record))

      // Cancel guard (checked here while q1 is still freshly SENT, before
      // the late-webhook block below moves it to FAILED): cannot cancel a
      // message that has already been sent.
      let cancelSentThrew = false
      try {
        await store.cancelMessage(q1.record.message_id)
      } catch (err) {
        cancelSentThrew = err.name === 'MessagingConflictError'
      }
      assert('cancel: cannot cancel an already-SENT message', cancelSentThrew)

      // Retry/backoff: phone ending '9998' is the mock transport's
      // deterministic RETRYABLE-transient-failure sentinel (every channel).
      const before = Date.now()
      const q3 = await store.queueRevisitMessage({ visitId: 'visit-retry-1', patientId: 'patient-2', phone: '01000009998', followUpToken: 'tok-b' })
      assert('retry: a retryable failure leaves the message QUEUED (not FAILED) with attempts remaining', q3.record.status === 'QUEUED')
      assert('retry: attempt_count is 1 after the first failed attempt', q3.record.attempt_count === 1)
      assert('retry: next_retry_at is set', typeof q3.record.next_retry_at === 'string')
      const delayMs = new Date(q3.record.next_retry_at).getTime() - before
      assert('retry: first backoff delay is ~30s (RETRY_DELAYS_MS[0])', delayMs > 25_000 && delayMs < 35_000)

      const manualRetry1 = await store.retryMessage(q3.record.message_id, { phone: '01000009998' })
      assert('retry: manual retry #2 still QUEUED (still failing, attempts remain)', manualRetry1.status === 'QUEUED')
      assert('retry: attempt_count is 2 after the second failed attempt', manualRetry1.attempt_count === 2)
      const manualRetry2 = await store.retryMessage(q3.record.message_id, { phone: '01000009998' })
      assert('retry: attempt_count is 3 after the third failed attempt', manualRetry2.attempt_count === 3)
      const manualRetry3 = await store.retryMessage(q3.record.message_id, { phone: '01000009998' })
      assert('retry: attempt_count reaches max_attempts (4) on the fourth failed attempt', manualRetry3.attempt_count === 4)
      assert('retry: status is FAILED once max_attempts is reached', manualRetry3.status === 'FAILED')
      assert('retry: next_retry_at is cleared once FAILED', manualRetry3.next_retry_at === null)

      let exhaustedThrew = false
      try {
        await store.retryMessage(q3.record.message_id, { phone: '01000009998' })
      } catch (err) {
        exhaustedThrew = err.name === 'MessagingConflictError'
      }
      assert('retry: retrying an already-FAILED (attempts exhausted) message throws MessagingConflictError', exhaustedThrew)

      // Automatic same-request fallback: phone ending '9999' fails
      // KAKAO_ALIMTALK specifically (fallback-eligible), SMS succeeds.
      const q4 = await store.queueRevisitMessage({ visitId: 'visit-fallback-1', patientId: 'patient-3', phone: '01000009999', followUpToken: 'tok-c' })
      assert('fallback: overall status is SENT (the SMS fallback attempt succeeded)', q4.record.status === 'SENT')
      assert('fallback: channel is still KAKAO_ALIMTALK (the fallback never overwrites the primary channel)', q4.record.channel === 'KAKAO_ALIMTALK')
      assert('fallback: fallback_channel is recorded as SMS', q4.record.fallback_channel === 'SMS')
      assert('fallback: attempt_count is only 1 (one logical attempt, not two)', q4.record.attempt_count === 1)

      // Webhook contract.
      const q5 = await store.queueRevisitMessage({ visitId: 'visit-webhook-1', patientId: 'patient-4', phone: '01033334444', followUpToken: 'tok-d' })
      assert('webhook setup: message SENT with a provider_message_id', q5.record.status === 'SENT' && typeof q5.record.provider_message_id === 'string')

      const unknownWebhook = await store.handleDeliveryWebhook({ providerMessageId: 'mock_does_not_exist', delivered: true })
      assert('webhook: an unknown provider_message_id is a silent no-op, never an error', unknownWebhook.ok === true && unknownWebhook.matched === false)

      const deliveredWebhook = await store.handleDeliveryWebhook({ providerMessageId: q5.record.provider_message_id, delivered: true })
      assert('webhook: a delivered=true webhook for a known id transitions SENT -> DELIVERED', deliveredWebhook.record.status === 'DELIVERED')

      const staleWebhookAfterDelivered = await store.handleDeliveryWebhook({ providerMessageId: q5.record.provider_message_id, delivered: false, errorCode: 'stale' })
      assert(
        'webhook: a second webhook for an already-DELIVERED message is left unchanged (only ever moves a message OUT of SENT once)',
        staleWebhookAfterDelivered.unchanged === true,
      )
      const stillDelivered = await store.getMessage(q5.record.message_id)
      assert('webhook: the record itself is still DELIVERED after the stale second webhook', stillDelivered.status === 'DELIVERED')

      // A late webhook must never override an already-FAILED record: a
      // first delivered:false webhook moves q1 (still SENT from the dedup
      // block above) to FAILED, then a second, later delivered:true
      // webhook for the SAME provider_message_id must leave it FAILED,
      // not "resurrect" it to DELIVERED.
      const failWebhook = await store.handleDeliveryWebhook({ providerMessageId: q1.record.provider_message_id, delivered: false, errorCode: 'handset_unreachable' })
      assert('late-webhook setup: a delivered:false webhook moves SENT -> FAILED', failWebhook.record.status === 'FAILED')
      const lateWebhookOnFailed = await store.handleDeliveryWebhook({ providerMessageId: q1.record.provider_message_id, delivered: true })
      assert('late-webhook: a late delivered:true webhook for an already-FAILED message is left unchanged, not resurrected', lateWebhookOnFailed.unchanged === true)
      const stillFailed = await store.getMessage(q1.record.message_id)
      assert('late-webhook: the record itself is still FAILED after the late webhook', stillFailed.status === 'FAILED')

      // Cancel guard, continued: CAN cancel a QUEUED message waiting on its
      // next backoff retry.
      const q6 = await store.queueRevisitMessage({ visitId: 'visit-cancel-1', patientId: 'patient-5', phone: '01000009998', followUpToken: 'tok-e' })
      assert('cancel setup: message is QUEUED (transient failure, retries remain)', q6.record.status === 'QUEUED')
      const cancelled = await store.cancelMessage(q6.record.message_id)
      assert('cancel: a QUEUED message awaiting retry can be cancelled', cancelled.status === 'CANCELLED')
      assert('cancel: next_retry_at is cleared on cancel', cancelled.next_retry_at === null)
      const dueAfterCancel = await store.runDueRetries(async () => '01000009998')
      const stillCancelled = await store.getMessage(q6.record.message_id)
      assert('cancel: a cancelled message is never picked up by the automatic retry sweep', stillCancelled.status === 'CANCELLED')
      void dueAfterCancel

      // listMessagesForVisit / purgeAll basic shape.
      const forVisit = await store.listMessagesForVisit('visit-dedup-1')
      assert('listMessagesForVisit: returns exactly the one message queued for that visit', forVisit.length === 1 && forVisit[0].message_id === q1.record.message_id)
      assert('listMessagesForVisit: no entry ever carries a "phone" field', forVisit.every((m) => !('phone' in m)))

      const purgedCount = await store.purgeAll()
      // q1, q3, q4, q5, q6 each created one distinct message file (q2 was a
      // deduped re-request of q1's own visit_id, no second file).
      assert('purgeAll: purges every message file this test created (5, not 6 -- q2 was a dedup of q1)', purgedCount === 5)
    } finally {
      await rm(dataRoot, { recursive: true, force: true })
    }
  }

  /* =====================================================================
     Part 1.5: closing-review regression coverage (two HIGH findings from
     the independent review of the first version of this batch):
       (a) queueRevisitMessage previously called attemptSend with
           `{ phone, linkUrl: null, buildText: null }` while attemptSend
           destructured `{ phone, text }` -- `text` was silently undefined
           on every single send, so the transport never actually received
           the follow-up link. A spy transport here inspects exactly what
           reaches `send()`, which the mock-transport-based tests above
           cannot do (the mock only reports ok/fail, never echoes its
           input back).
       (b) queueRevisitMessage's check-then-create (findByDedupKey then
           atomicWrite) previously ran with NO lock, so two concurrent
           calls for the same visit_id could both create a record sharing
           one dedup_key and both send the patient a real message.
     ===================================================================== */
  {
    const dataRoot = await mkdtemp(path.join(tmpdir(), 'samindang-messaging-closing-review-'))
    try {
      // (a) text-delivery: a spy transport that just records every call.
      const sendCalls = []
      const spyTransport = {
        async send(args) {
          sendCalls.push(args)
          return { ok: true, providerMessageId: `spy_${sendCalls.length}`, channelUsed: args.channel }
        },
      }
      const spyStore = createMessagingStore(path.join(dataRoot, 'text-delivery'), { transport: spyTransport })

      const REAL_TEXT = '[삼인당한의원] 재진 확인 문진 안내\n아래 링크를 눌러 몇 가지만 답해 주세요.\nhttps://example.invalid/#follow-up=tok-text-check'
      await spyStore.queueRevisitMessage({ visitId: 'visit-text-1', patientId: 'patient-text-1', phone: '01011112222', followUpToken: 'tok-text-check', text: REAL_TEXT })
      assert('text-delivery: the initial queue send actually reaches the transport with the real text', sendCalls.length === 1 && sendCalls[0].text === REAL_TEXT)
      assert('text-delivery: the transport never receives undefined for text', sendCalls[0].text !== undefined)

      // Force a retryable failure to reach the manual retry path with a
      // DIFFERENT text, confirming retryMessage's own `text` argument
      // (not some stale cached value) is what's actually sent.
      const failThenRetryTransport = {
        calls: 0,
        async send(args) {
          failThenRetryTransport.calls += 1
          sendCalls.push(args)
          if (failThenRetryTransport.calls === 1) return { ok: false, errorCode: 'spy_forced_retry', retryable: true, fallbackEligible: false }
          return { ok: true, providerMessageId: 'spy_retry_ok', channelUsed: args.channel }
        },
      }
      const retryStore = createMessagingStore(path.join(dataRoot, 'text-delivery-retry'), { transport: failThenRetryTransport })
      const qRetry = await retryStore.queueRevisitMessage({ visitId: 'visit-text-2', patientId: 'patient-text-2', phone: '01033334444', followUpToken: 'tok-text-retry', text: 'first attempt text' })
      assert('text-delivery retry setup: first attempt failed retryable, still QUEUED', qRetry.record.status === 'QUEUED')
      const retried = await retryStore.retryMessage(qRetry.record.message_id, { phone: '01033334444', text: 'second attempt text' })
      assert('text-delivery: manual retry sends its OWN text argument, not the original queue call\'s', retried.status === 'SENT')
      const retryCallTexts = sendCalls.filter((c) => c.text === 'first attempt text' || c.text === 'second attempt text').map((c) => c.text)
      assert('text-delivery: both the original and the retried text actually reached the transport', retryCallTexts.includes('first attempt text') && retryCallTexts.includes('second attempt text'))

      // (b) concurrency: two simultaneous queue calls for the SAME
      // visit_id must produce exactly one real record and exactly one
      // real send -- the second must be deduped, not race past the check.
      const concurrentTransport = {
        sends: 0,
        async send(args) {
          concurrentTransport.sends += 1
          return { ok: true, providerMessageId: `concurrent_${concurrentTransport.sends}`, channelUsed: args.channel }
        },
      }
      const concurrentStore = createMessagingStore(path.join(dataRoot, 'concurrency'), { transport: concurrentTransport })
      const [c1, c2] = await Promise.all([
        concurrentStore.queueRevisitMessage({ visitId: 'visit-concurrent-1', patientId: 'patient-concurrent-1', phone: '01055556666', followUpToken: 'tok-concurrent', text: 'concurrent text' }),
        concurrentStore.queueRevisitMessage({ visitId: 'visit-concurrent-1', patientId: 'patient-concurrent-1', phone: '01055556666', followUpToken: 'tok-concurrent', text: 'concurrent text' }),
      ])
      assert('concurrency: exactly one of the two concurrent queue calls is deduped', [c1.deduped, c2.deduped].filter(Boolean).length === 1)
      assert('concurrency: both calls resolve to the SAME message_id', c1.record.message_id === c2.record.message_id)
      const allForVisit = await concurrentStore.listMessagesForVisit('visit-concurrent-1')
      assert('concurrency: exactly one record exists on disk for this visit_id (not two)', allForVisit.length === 1)
      assert('concurrency: the transport was actually invoked exactly once -- the patient was sent exactly one real message', concurrentTransport.sends === 1)
    } finally {
      await rm(dataRoot, { recursive: true, force: true })
    }
  }

  /* =====================================================================
     Part 2: HTTP boundary -- routes, auth, privacy, audit.
     ===================================================================== */
  {
    const dataRoot = await mkdtemp(path.join(tmpdir(), 'samindang-messaging-http-'))
    const dataDir = path.join(dataRoot, 'submissions')
    const { server, base } = await startServer({ dataDir, doctorToken: DOCTOR_TOKEN })
    try {
      const visit = (await postJson(`${base}/api/visits`, {})).body
      const start = (await postJson(`${base}/api/patients/${visit.patient_id}/start-revisit`, {})).body

      // Auth: doctor routes carry the same Origin-allowlist defense-in-depth
      // layer as every other doctor route (see server/index.js's doctorRoute
      // gate) -- this test suite calls over 127.0.0.1, which requireDoctor()
      // itself always treats as trusted (loopback IS the real boundary in
      // this pilot's threat model, see auth.js's header comment), so the
      // only way to exercise a genuine 403 here is a disallowed browser
      // Origin, exactly like tests/station.spec.mjs's own "evil Origin"
      // checks.
      const evil = { origin: 'https://evil.example.com' }
      const LINK = 'https://example.invalid/#follow-up=http-test-token'
      const noAuth = await fetch(`${base}/api/visits/${start.visit.id}/messages`, {
        method: 'POST',
        headers: { ...evil, 'content-type': 'application/json' },
        body: JSON.stringify({ patient_id: visit.patient_id, phone: '01055556666', follow_up_token: start.token, link: LINK }),
      })
      assert('auth: POST .../messages (evil Origin) -> 403', noAuth.status === 403)
      const noAuthList = await fetch(`${base}/api/visits/${start.visit.id}/messages`, { headers: evil })
      assert('auth: GET .../messages (evil Origin) -> 403', noAuthList.status === 403)

      // Validation.
      const missingFields = await postJson(`${base}/api/visits/${start.visit.id}/messages`, { patient_id: visit.patient_id })
      assert('validation: missing phone/follow_up_token/link -> 400', missingFields.status === 400)
      const missingLink = await postJson(`${base}/api/visits/${start.visit.id}/messages`, {
        patient_id: visit.patient_id,
        phone: '01055556666',
        follow_up_token: start.token,
      })
      assert('validation: missing link specifically -> 400 (this is the exact HIGH-1 closing-review regression)', missingLink.status === 400)
      const unknownPatient = await postJson(`${base}/api/visits/${start.visit.id}/messages`, {
        patient_id: 'not-a-real-patient-id',
        phone: '01055556666',
        follow_up_token: start.token,
        link: LINK,
      })
      assert('validation: unknown patient_id -> 400', unknownPatient.status === 400)

      // Validation: visit_id/patient_id mismatch (a real patient_id, but
      // not the one this visit_id actually belongs to).
      const otherPatientVisit = (await postJson(`${base}/api/visits`, {})).body
      const mismatched = await postJson(`${base}/api/visits/${start.visit.id}/messages`, {
        patient_id: otherPatientVisit.patient_id,
        phone: '01055556666',
        follow_up_token: start.token,
        link: LINK,
      })
      assert('validation: visit_id belonging to a DIFFERENT patient_id -> 400', mismatched.status === 400)

      // Happy path queue + list.
      const queued = await postJson(`${base}/api/visits/${start.visit.id}/messages`, {
        patient_id: visit.patient_id,
        phone: '01055556666',
        follow_up_token: start.token,
        link: LINK,
      })
      assert('queue: 201 on first queue', queued.status === 201)
      assert('queue: response has no "phone" key anywhere', !('phone' in queued.body))
      assert('queue: response has no "link" key anywhere', !('link' in queued.body))
      assert('queue: status is SENT via the mock transport', queued.body.status === 'SENT')

      const dedupRes = await postJson(`${base}/api/visits/${start.visit.id}/messages`, {
        patient_id: visit.patient_id,
        phone: '01055556666',
        follow_up_token: start.token,
        link: LINK,
      })
      assert('queue: a second identical queue call -> 200 (deduped), not a new 201', dedupRes.status === 200)
      assert('queue: dedup returns the same message_id', dedupRes.body.message_id === queued.body.message_id)

      const listRes = await getJson(`${base}/api/visits/${start.visit.id}/messages`)
      assert('list: 200 and exactly one message for this visit', listRes.status === 200 && listRes.body.messages.length === 1)
      assert('list: no message in the list carries a "phone" key', listRes.body.messages.every((m) => !('phone' in m)))

      // Manual retry route + cancel route, auth-gated the same way.
      const retryVisit = (await postJson(`${base}/api/visits`, {})).body
      const retryStart = (await postJson(`${base}/api/patients/${retryVisit.patient_id}/start-revisit`, {})).body
      const retryQueue = await postJson(`${base}/api/visits/${retryStart.visit.id}/messages`, {
        patient_id: retryVisit.patient_id,
        phone: '01000009998',
        follow_up_token: retryStart.token,
        link: LINK,
      })
      assert('retry-http setup: QUEUED after a transient mock failure', retryQueue.body.status === 'QUEUED')
      const retryNoAuth = await fetch(`${base}/api/messages/${retryQueue.body.message_id}/retry`, {
        method: 'POST',
        headers: { ...evil, 'content-type': 'application/json' },
        body: JSON.stringify({ phone: '01000009998', link: LINK }),
      })
      assert('auth: POST .../retry (evil Origin) -> 403', retryNoAuth.status === 403)
      const retryMissingPhone = await postJson(`${base}/api/messages/${retryQueue.body.message_id}/retry`, { link: LINK })
      assert('retry-http: missing phone -> 400', retryMissingPhone.status === 400)
      const retryMissingLink = await postJson(`${base}/api/messages/${retryQueue.body.message_id}/retry`, { phone: '01000009998' })
      assert('retry-http: missing link -> 400', retryMissingLink.status === 400)
      const retryOk = await postJson(`${base}/api/messages/${retryQueue.body.message_id}/retry`, { phone: '01000009998', link: LINK })
      assert('retry-http: 200 with phone+link supplied', retryOk.status === 200)
      assert('retry-http: attempt_count incremented', retryOk.body.attempt_count === 2)

      const cancelRes = await postJson(`${base}/api/messages/${retryQueue.body.message_id}/cancel`, undefined)
      assert('cancel-http: 200, CANCELLED', cancelRes.status === 200 && cancelRes.body.status === 'CANCELLED')
      const cancelAgain = await postJson(`${base}/api/messages/${retryQueue.body.message_id}/cancel`, undefined)
      assert('cancel-http: cancelling an already-CANCELLED message -> 409', cancelAgain.status === 409)

      // Webhook route: public (no doctor token needed), unknown id is a
      // safe 200 no-op, known id transitions state.
      const webhookNoToken = await fetch(`${base}/api/messages/webhook`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider_message_id: 'mock_unknown_id_entirely', delivered: true }),
      })
      assert('webhook-http: reachable with no doctor token at all -> 200', webhookNoToken.status === 200)
      const webhookBody = await webhookNoToken.json()
      assert('webhook-http: unknown id -> ok:true (no-op, never an error)', webhookBody.ok === true)

      const webhookMissingId = await fetch(`${base}/api/messages/webhook`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ delivered: true }),
      })
      assert('webhook-http: missing provider_message_id -> 400', webhookMissingId.status === 400)

      const webhookKnown = await fetch(`${base}/api/messages/webhook`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider_message_id: queued.body.provider_message_id, delivered: true }),
      })
      assert('webhook-http: known provider_message_id -> 200', webhookKnown.status === 200)
      const afterWebhook = await getJson(`${base}/api/visits/${start.visit.id}/messages`)
      const updated = afterWebhook.body.messages.find((m) => m.message_id === queued.body.message_id)
      assert('webhook-http: the matching message transitioned to DELIVERED', updated.status === 'DELIVERED')

      // Audit: audit.log never contains a phone number substring, and the
      // three new events all appear at least once from the flows above.
      const lines = await readAuditLines(auditLogPath(dataDir))
      const rawAudit = JSON.stringify(lines)
      assert('audit privacy: audit.log JSON contains no seeded phone number substring', !rawAudit.includes('01055556666') && !rawAudit.includes('01000009998'))
      assert('audit: message_queued appears at least once', lines.some((l) => l.event === 'message_queued'))
      assert('audit: message_retried appears at least once', lines.some((l) => l.event === 'message_retried'))
      assert('audit: message_cancelled appears at least once', lines.some((l) => l.event === 'message_cancelled'))
    } finally {
      await stopServer(server)
      await rm(dataRoot, { recursive: true, force: true })
    }
  }

  console.log(`\n${passCount} messaging assertions passed.`)
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
