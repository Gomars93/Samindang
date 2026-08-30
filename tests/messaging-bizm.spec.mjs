// BizM batch: provider-neutral transport selection + BizM adapter
// regression suite. Plain node, no test framework -- same convention as
// tests/messaging.spec.mjs. Scope: no real network call is ever made here
// (stub credentials + a stubbed global.fetch, see Part 2b) -- BizM's live
// wire format remains UNVERIFIED (see server/bizmAdapter.js's header), so
// this suite proves the OUTGOING request shape this codebase currently
// sends matches what it documents sending, never that it matches BizM's
// real API.
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { resolveBizmProviderState, createBizmTransport, FALLBACK_CHANNEL as BIZM_FALLBACK_CHANNEL } from '../server/bizmAdapter.js'
import { resolveSolapiProviderState, FALLBACK_CHANNEL as SOLAPI_FALLBACK_CHANNEL } from '../server/solapiAdapter.js'
import {
  resolveMessagingProviderName,
  resolveMessagingProviderState,
  createMessagingTransport,
  resolveFallbackChannelMap,
} from '../server/messagingTransport.js'
import { createMessagingStore } from '../server/messagingStore.js'

let passCount = 0
function assert(name, cond) {
  if (!cond) throw new Error(`FAIL: ${name}`)
  passCount++
  console.log(`OK: ${name}`)
}

async function main() {
  /* =====================================================================
     Part 1: resolveBizmProviderState -- the 4-state gate itself. Widened
     from 3 states (PENDING_CREDENTIALS/MOCK/LIVE) to 4 after an owner
     review found credentials alone previously flipped BizM straight to
     LIVE despite the adapter's own disclosed UNVERIFIED wire format --
     PENDING_CONTRACT is the fix: a SEPARATE, human-set
     SAMINDANG_BIZM_CONTRACT_VERIFIED flag is now required in addition to
     full credentials before LIVE is ever reachable.
     ===================================================================== */
  {
    assert('BizM provider state: no credentials -> PENDING_CREDENTIALS (the real state of this deployment today)', resolveBizmProviderState({}) === 'PENDING_CREDENTIALS')
    assert(
      'BizM provider state: partial credentials (missing sender key) -> still PENDING_CREDENTIALS',
      resolveBizmProviderState({ BIZM_API_KEY: 'k' }) === 'PENDING_CREDENTIALS',
    )
    assert(
      'BizM provider state: BIZM_API_KEY + BIZM_SENDER_KEY but missing BIZM_USER_ID -> still PENDING_CREDENTIALS (userid header credential is required too)',
      resolveBizmProviderState({ BIZM_API_KEY: 'k', BIZM_SENDER_KEY: 's' }) === 'PENDING_CREDENTIALS',
    )
    const fullCreds = { BIZM_API_KEY: 'k', BIZM_SENDER_KEY: 's', BIZM_USER_ID: 'u' }
    assert(
      'BizM provider state: full credentials but SAMINDANG_BIZM_CONTRACT_VERIFIED not set -> PENDING_CONTRACT, NOT LIVE (the core fix -- credentials alone must never enable a real send through an unverified wire format)',
      resolveBizmProviderState(fullCreds) === 'PENDING_CONTRACT',
    )
    assert(
      'BizM provider state: full credentials + SAMINDANG_BIZM_CONTRACT_VERIFIED="false" -> still PENDING_CONTRACT (only the literal string "true" counts)',
      resolveBizmProviderState({ ...fullCreds, SAMINDANG_BIZM_CONTRACT_VERIFIED: 'false' }) === 'PENDING_CONTRACT',
    )
    const verifiedCreds = { ...fullCreds, SAMINDANG_BIZM_CONTRACT_VERIFIED: 'true' }
    assert('BizM provider state: full credentials + contract verified, no force-mock -> LIVE', resolveBizmProviderState(verifiedCreds) === 'LIVE')
    assert(
      'BizM provider state: full credentials + contract verified + SAMINDANG_BIZM_FORCE_MOCK=true -> MOCK',
      resolveBizmProviderState({ ...verifiedCreds, SAMINDANG_BIZM_FORCE_MOCK: 'true' }) === 'MOCK',
    )
  }

  /* =====================================================================
     Part 1b: createBizmTransport -- PENDING_CONTRACT must behave exactly
     like PENDING_CREDENTIALS (mock only), never like a step closer to LIVE.
     ===================================================================== */
  {
    const pendingContractEnv = { BIZM_API_KEY: 'k', BIZM_SENDER_KEY: 's', BIZM_USER_ID: 'u' }
    const transport = createBizmTransport(pendingContractEnv)
    assert('PENDING_CONTRACT: createBizmTransport still returns the MOCK transport, never a live one', transport.state === 'MOCK')
    assert('PENDING_CONTRACT: mock transport still identifies as BIZM', transport.provider === 'BIZM')
  }

  /* =====================================================================
     Part 2: BizM's mock transport -- channel restriction (Alimtalk only)
     and the same magic-suffix contract as SOLAPI's own mock, but with no
     verified fallback (fallbackEligible always false -- see
     bizmAdapter.js's header on why SMS/LMS is out of scope).
     ===================================================================== */
  {
    const transport = createBizmTransport({})
    assert('BizM mock: state is MOCK with no credentials configured', transport.state === 'MOCK')
    assert('BizM mock: provider identity is BIZM', transport.provider === 'BIZM')

    const alimtalkOk = await transport.send({ to: '01011112222', channel: 'KAKAO_ALIMTALK', variables: { followup_token: 'tok' } })
    assert('BizM mock: a normal Alimtalk send succeeds', alimtalkOk.ok === true && typeof alimtalkOk.providerMessageId === 'string')
    assert('BizM mock: providerMessageId carries a mockbizm_ prefix (never confusable with a real BizM id)', alimtalkOk.providerMessageId.startsWith('mockbizm_'))

    const alimtalkTransient = await transport.send({ to: '01000009998', channel: 'KAKAO_ALIMTALK' })
    assert('BizM mock: suffix 9998 is a retryable transient failure', alimtalkTransient.ok === false && alimtalkTransient.retryable === true)

    const alimtalkUnreachable = await transport.send({ to: '01000009999', channel: 'KAKAO_ALIMTALK' })
    assert('BizM mock: suffix 9999 fails closed, never fallback-eligible (no verified BizM SMS contract)', alimtalkUnreachable.ok === false && alimtalkUnreachable.fallbackEligible === false)

    const smsAttempt = await transport.send({ to: '01011112222', channel: 'SMS' })
    assert('BizM mock: any non-Alimtalk channel is refused outright (never reaches a guessed SMS wire format)', smsAttempt.ok === false && smsAttempt.errorCode === 'bizm_channel_unverified')

    assert('BizM FALLBACK_CHANNEL is an empty map (no verified fallback channel at all)', Object.keys(BIZM_FALLBACK_CHANNEL).length === 0)
  }

  /* =====================================================================
     Part 2b: the LIVE transport's outgoing request shape -- credential-free
     (network is stubbed, never actually reached; same globalThis.fetch
     override pattern tests/preview-build.spec.mjs already uses), but
     exercises the real LIVE code path (SAMINDANG_BIZM_CONTRACT_VERIFIED=
     'true' + full credentials) to prove the request this file's header
     documents as owner/result-code-evidence-backed is what actually gets
     sent: a JSON ARRAY body (not a single object -- E100 InvalidJsonArray),
     a `userid` header, a button1 object carrying the real one-time
     capability URL, a link-free static message body, and a deterministic
     <=20-char msgId derived from our own message_id (never the raw
     patient-identifying token itself).
     ===================================================================== */
  {
    const originalFetch = globalThis.fetch
    const capturedRequests = []
    globalThis.fetch = async (url, init) => {
      capturedRequests.push({ url, init })
      return {
        ok: true,
        status: 200,
        json: async () => [{ messageId: 'stub-provider-id-1' }],
      }
    }
    try {
      const liveEnv = {
        BIZM_API_KEY: 'stub-api-key',
        BIZM_SENDER_KEY: 'stub-sender-key',
        BIZM_USER_ID: 'stub-user-id',
        SAMINDANG_BIZM_CONTRACT_VERIFIED: 'true',
      }
      const liveTransport = createBizmTransport(liveEnv)
      assert('LIVE transport: state is actually LIVE with contract-verified + full credentials', liveTransport.state === 'LIVE')

      const TEST_LINK = 'https://gomars93.github.io/Samindang/followup/#follow-up=raw-one-time-token-value'
      const result1 = await liveTransport.send({
        to: '01011112222',
        channel: 'KAKAO_ALIMTALK',
        link: TEST_LINK,
        messageId: 'message-id-aaa',
      })
      assert('LIVE transport: stubbed send succeeds and returns the stubbed providerMessageId', result1.ok === true && result1.providerMessageId === 'stub-provider-id-1')
      assert('LIVE transport: exactly one fetch call made', capturedRequests.length === 1)

      const { url, init } = capturedRequests[0]
      assert('LIVE request: POSTs to the documented BizM send endpoint', url === 'https://alimtalk-api.bizmsg.kr/v2/sender/send')
      assert('LIVE request: userid header carries the BIZM_USER_ID credential (owner-confirmed dev-docs auth scheme, not a guessed Bearer token)', init.headers.userid === 'stub-user-id')
      const headerKeys = Object.keys(init.headers).map((k) => k.toLowerCase())
      assert('LIVE request: no guessed Authorization header is sent (see bizmAdapter.js header on why apiKey is not placed anywhere unconfirmed)', !headerKeys.includes('authorization'))

      const body = JSON.parse(init.body)
      assert('LIVE request: body is a JSON ARRAY, not a single object (E100 InvalidJsonArray)', Array.isArray(body))
      assert('LIVE request: array has exactly one item (this store sends one recipient per call)', body.length === 1)
      const item = body[0]
      assert('LIVE request item: message_type field is present (round-3 corroborated field, value itself unconfirmed)', typeof item.message_type === 'string' && item.message_type.length > 0)
      assert('LIVE request item: profile field carries the BIZM_SENDER_KEY value', item.profile === 'stub-sender-key')
      assert('LIVE request item: tmplId field carries the template code (round-3 corroborated field name, replacing round-1\'s tmplCode guess)', item.tmplId === 'SAMINDANG_FOLLOWUP_01')
      assert('LIVE request item: phn field carries the recipient phone', item.phn === '01011112222')
      assert('LIVE request item: msgId is a string of at most 20 characters (E113 InvalidMsgIdLength)', typeof item.msgId === 'string' && item.msgId.length <= 20 && item.msgId.length > 0)
      assert('LIVE request item: NO variables field is sent at all (owner-review finding -- the auto-substitution assumption was unsupported; see header)', !('variables' in item))

      // Owner-review finding (HIGH): the button1 object, not `variables`,
      // is where the real one-time capability URL now lives.
      assert('LIVE request item: button1 object is present', typeof item.button1 === 'object' && item.button1 !== null)
      assert('LIVE request item: button1.name matches the owner-confirmed exact button label', item.button1.name === '상태 확인하기')
      assert('LIVE request item: button1.type is the round-3-corroborated "WL" (Web Link)', item.button1.type === 'WL')
      assert('LIVE request item: button1.url_mobile carries the REAL one-time link, verbatim', item.button1.url_mobile === TEST_LINK)
      assert('LIVE request item: button1.url_pc carries the same link', item.button1.url_pc === TEST_LINK)

      // Owner-review finding (HIGH), privacy: the raw token (embedded in
      // TEST_LINK's #follow-up= fragment) must appear ONLY in
      // button1.url_mobile/url_pc -- never in `msg` (a K105 template
      // mismatch risk if the raw URL were inlined), never in `msgId`
      // (deriveBizmMsgId only ever hashes messageId+channel), and never
      // anywhere else in the outgoing item.
      const RAW_TOKEN = 'raw-one-time-token-value'
      assert('LIVE request item: msg field is BizM\'s own static, link-free text (never the caller\'s shared inline-link text)', typeof item.msg === 'string' && !item.msg.includes('http'))
      assert('LIVE request item: the raw token does NOT appear in msg', !item.msg.includes(RAW_TOKEN))
      assert('LIVE request item: the raw token does NOT appear in msgId', !item.msgId.includes(RAW_TOKEN))
      const itemWithoutButton = { ...item }
      delete itemWithoutButton.button1
      assert(
        'LIVE request item: the raw token does not leak anywhere else in the item outside button1',
        !JSON.stringify(itemWithoutButton).includes(RAW_TOKEN),
      )

      // Exact expected msgId value (not just "doesn't look like the
      // token") -- an earlier independent review found a weaker assertion
      // here vacuous. Recompute the real formula
      // (sha256(`${messageId}:${channel}`) truncated to 20 hex chars)
      // independently here and assert equality.
      const expectedMsgId = createHash('sha256').update('message-id-aaa:KAKAO_ALIMTALK', 'utf8').digest('hex').slice(0, 20)
      assert('LIVE request item: msgId matches the exact documented derivation (sha256(messageId:channel), never derivable from the raw token)', item.msgId === expectedMsgId)

      // Idempotency: the SAME (message_id, channel) pair (a retry of the
      // same logical MessageRecord on the same channel) must always
      // produce the SAME msgId, so BizM's own E109 DuplicatedMsgId
      // semantics (if real) can act as a second, provider-side line of
      // defense against a genuine double-send.
      await liveTransport.send({ to: '01011112222', channel: 'KAKAO_ALIMTALK', link: TEST_LINK, messageId: 'message-id-aaa' })
      const secondItem = JSON.parse(capturedRequests[1].init.body)[0]
      assert('LIVE request: msgId is deterministic -- the same (message_id, channel) produces the identical msgId on a second attempt', secondItem.msgId === item.msgId)

      await liveTransport.send({ to: '01011112222', channel: 'KAKAO_ALIMTALK', link: TEST_LINK, messageId: 'message-id-bbb' })
      const thirdItem = JSON.parse(capturedRequests[2].init.body)[0]
      assert('LIVE request: msgId differs for a genuinely different message_id', thirdItem.msgId !== item.msgId)

      // A genuine cross-channel divergence test (same message_id,
      // KAKAO_ALIMTALK vs SMS/LMS -> different msgId) is NOT actually
      // exercisable through this transport's public send() today --
      // send() refuses any non-KAKAO_ALIMTALK channel (the check above,
      // before deriveBizmMsgId is ever reached) as bizm_channel_unverified,
      // precisely because no SMS/LMS wire format is confirmed. So this
      // assertion re-confirms same-channel determinism instead (a genuine,
      // non-duplicate check -- it uses a message_id already sent once
      // above, on the SAME liveTransport instance, proving repeat sends
      // don't drift). The actual channel-inclusion in the hash formula IS
      // regression-tested, just not directly: the exact-formula assertion
      // above (`sha256('message-id-aaa:KAKAO_ALIMTALK')`) would fail if a
      // future change silently dropped `channel` from deriveBizmMsgId's
      // input -- that is the real safety net for the channel-scoping fix,
      // until channel-scoping can be genuinely exercised once a second
      // real channel exists.
      await liveTransport.send({ to: '01011112222', channel: 'KAKAO_ALIMTALK', link: TEST_LINK, messageId: 'message-id-aaa' })
      const fourthItem = JSON.parse(capturedRequests[3].init.body)[0]
      assert('LIVE request: same message_id + same channel, sent again -> same msgId (repeat-send determinism, not a duplicate of the earlier check)', fourthItem.msgId === item.msgId)

      // messageId omitted entirely -- independent-review finding: this used
      // to throw uncaught inside node:crypto (createHash().update(undefined)),
      // which would have escaped attemptSend's own try-less call and left
      // the MessageRecord stuck in SENDING forever (only a normal return
      // value lets attemptSend record a terminal outcome). Must now fail
      // closed as an ordinary, diagnosable send failure instead.
      const noIdResult = await liveTransport.send({ to: '01011112222', channel: 'KAKAO_ALIMTALK', link: TEST_LINK })
      assert('LIVE request: missing messageId fails closed with a diagnosable error, never throws', noIdResult.ok === false && noIdResult.errorCode === 'bizm_missing_message_id')
      assert('LIVE request: missing messageId never reaches the network at all', capturedRequests.length === 4)

      // Owner-review finding (HIGH): `link` omitted entirely -- there is no
      // capability URL to build button1 from at all, so this must also
      // fail closed rather than send a broken/pointless button (or crash
      // trying to build one from `undefined`).
      const noLinkResult = await liveTransport.send({ to: '01011112222', channel: 'KAKAO_ALIMTALK', messageId: 'message-id-ccc' })
      assert('LIVE request: missing link fails closed with a diagnosable error, never throws', noLinkResult.ok === false && noLinkResult.errorCode === 'bizm_missing_link')
      assert('LIVE request: missing link never reaches the network at all', capturedRequests.length === 4)
    } finally {
      globalThis.fetch = originalFetch
    }
  }

  /* =====================================================================
     Part 2c: owner-review finding (HIGH) -- HTTP 2xx alone must never be
     treated as success if the provider's own response body says the send
     actually failed (BizM's result codes -- K105/K108/E1xx -- can
     accompany a 200). Same globalThis.fetch stub pattern as Part 2b.
     ===================================================================== */
  {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => [{ code: 'K108', message: 'button template mismatch' }],
    })
    try {
      const liveEnv = {
        BIZM_API_KEY: 'stub-api-key',
        BIZM_SENDER_KEY: 'stub-sender-key',
        BIZM_USER_ID: 'stub-user-id',
        SAMINDANG_BIZM_CONTRACT_VERIFIED: 'true',
      }
      const liveTransport = createBizmTransport(liveEnv)
      const result = await liveTransport.send({
        to: '01011112222',
        channel: 'KAKAO_ALIMTALK',
        link: 'https://gomars93.github.io/Samindang/followup/#follow-up=tok',
        messageId: 'message-id-k108',
      })
      assert('HTTP 200 + provider result code K108 (button mismatch) is NOT treated as success', result.ok === false)
      assert('HTTP 200 + K108: errorCode surfaces the actual provider result code for diagnosis', result.errorCode === 'provider_result_K108')
      assert('HTTP 200 + K108: never retryable (a template/button config error, not transient)', result.retryable === false)
    } finally {
      globalThis.fetch = originalFetch
    }
  }

  /* =====================================================================
     Part 2d: the same HTTP-200-with-failure-code check must not produce a
     false positive against a real success response that merely happens to
     carry an unrelated string field -- only a field VALUE shaped like a
     real BizM result code (a letter followed by exactly 3 digits) is
     treated as a failure signal.
     ===================================================================== */
  {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => [{ messageId: 'real-provider-id-999', code: '0000' }],
    })
    try {
      const liveEnv = {
        BIZM_API_KEY: 'stub-api-key',
        BIZM_SENDER_KEY: 'stub-sender-key',
        BIZM_USER_ID: 'stub-user-id',
        SAMINDANG_BIZM_CONTRACT_VERIFIED: 'true',
      }
      const liveTransport = createBizmTransport(liveEnv)
      const result = await liveTransport.send({
        to: '01011112222',
        channel: 'KAKAO_ALIMTALK',
        link: 'https://gomars93.github.io/Samindang/followup/#follow-up=tok',
        messageId: 'message-id-success',
      })
      assert('a genuine success response (code "0000", 4 digits, does not match the [A-Z]\\d{3} failure pattern) is still treated as success', result.ok === true && result.providerMessageId === 'real-provider-id-999')
    } finally {
      globalThis.fetch = originalFetch
    }
  }

  /* =====================================================================
     Part 3: messagingTransport.js's provider selection -- BizM is the
     default; SOLAPI is an explicit opt-in via SAMINDANG_MESSAGING_PROVIDER.
     ===================================================================== */
  {
    assert('provider selection: no env var -> bizm (the default/selected provider)', resolveMessagingProviderName({}) === 'bizm')
    assert('provider selection: unrecognized value -> bizm (falls through to the default)', resolveMessagingProviderName({ SAMINDANG_MESSAGING_PROVIDER: 'nonsense' }) === 'bizm')
    assert('provider selection: explicit "solapi" opts back into the legacy provider', resolveMessagingProviderName({ SAMINDANG_MESSAGING_PROVIDER: 'solapi' }) === 'solapi')

    assert('provider state: delegates to BizM\'s own resolver by default', resolveMessagingProviderState({}) === resolveBizmProviderState({}))
    assert(
      'provider state: delegates to SOLAPI\'s own resolver when explicitly selected',
      resolveMessagingProviderState({ SAMINDANG_MESSAGING_PROVIDER: 'solapi' }) === resolveSolapiProviderState({ SAMINDANG_MESSAGING_PROVIDER: 'solapi' }),
    )

    const defaultTransport = createMessagingTransport({})
    assert('createMessagingTransport: default constructs a BIZM-identified transport', defaultTransport.provider === 'BIZM')
    const solapiTransport = createMessagingTransport({ SAMINDANG_MESSAGING_PROVIDER: 'solapi' })
    assert('createMessagingTransport: explicit solapi constructs a SOLAPI-identified transport', solapiTransport.provider === 'SOLAPI')

    assert('resolveFallbackChannelMap: default (bizm) is the empty map', resolveFallbackChannelMap({}) === BIZM_FALLBACK_CHANNEL)
    assert(
      'resolveFallbackChannelMap: explicit solapi is SOLAPI\'s own KAKAO_ALIMTALK -> SMS map',
      resolveFallbackChannelMap({ SAMINDANG_MESSAGING_PROVIDER: 'solapi' }) === SOLAPI_FALLBACK_CHANNEL,
    )
  }

  /* =====================================================================
     Part 4: messagingStore.js actually threads `variables` through to the
     transport's send() call -- the exact BizM Alimtalk template
     substitution payload (`{ followup_token: <raw token> }`) depends on
     this reaching the transport untouched, on both the initial send and a
     manual retry.
     ===================================================================== */
  {
    const dataRoot = await mkdtemp(path.join(tmpdir(), 'samindang-messaging-bizm-variables-'))
    try {
      const sendCalls = []
      const spyTransport = {
        provider: 'BIZM',
        async send(args) {
          sendCalls.push(args)
          return { ok: true, providerMessageId: `spy_${sendCalls.length}`, channelUsed: args.channel }
        },
      }
      const store = createMessagingStore(dataRoot, { transport: spyTransport })
      const variables = { followup_token: 'raw-token-value' }
      const link = 'https://gomars93.github.io/Samindang/followup/#follow-up=raw-token-value'
      await store.queueRevisitMessage({
        visitId: 'visit-variables-1',
        patientId: 'patient-variables-1',
        phone: '01011112222',
        followUpToken: 'raw-token-value',
        text: 'fallback text',
        variables,
        link,
      })
      assert('variables passthrough: the initial send actually receives variables.followup_token', sendCalls[0].variables?.followup_token === 'raw-token-value')
      assert('link passthrough (owner-review finding): the initial send actually receives the raw link bizmAdapter.js needs for button1', sendCalls[0].link === link)

      // Force a retryable failure then manually retry with different
      // variables/link, confirming retryMessage's own arguments (not some
      // stale cached value) are what's actually sent -- same pattern
      // tests/messaging.spec.mjs's Part 1.5(a) already uses for `text`.
      const failThenOk = {
        provider: 'BIZM',
        calls: 0,
        async send(args) {
          failThenOk.calls += 1
          sendCalls.push(args)
          if (failThenOk.calls === 1) return { ok: false, errorCode: 'spy_forced_retry', retryable: true, fallbackEligible: false }
          return { ok: true, providerMessageId: 'spy_retry_ok', channelUsed: args.channel }
        },
      }
      const retryStore = createMessagingStore(path.join(dataRoot, 'retry'), { transport: failThenOk })
      const queued = await retryStore.queueRevisitMessage({
        visitId: 'visit-variables-retry-1',
        patientId: 'patient-variables-retry-1',
        phone: '01011113333',
        followUpToken: 'tok-retry',
        variables: { followup_token: 'tok-retry' },
        link: 'https://gomars93.github.io/Samindang/followup/#follow-up=tok-retry',
      })
      assert('variables passthrough (retry setup): first attempt QUEUED after the forced retryable failure', queued.record.status === 'QUEUED')
      const retryLink = 'https://gomars93.github.io/Samindang/followup/#follow-up=tok-retry-manual'
      const retried = await retryStore.retryMessage(queued.record.message_id, {
        phone: '01011113333',
        variables: { followup_token: 'tok-retry-manual' },
        link: retryLink,
      })
      assert('variables passthrough (retry): manual retry succeeds', retried.status === 'SENT')
      const retrySendCall = sendCalls[sendCalls.length - 1]
      assert('variables passthrough (retry): the retry call carries the manually re-supplied variables, not the original queue-time ones', retrySendCall.variables?.followup_token === 'tok-retry-manual')
      assert('link passthrough (retry): the retry call carries the manually re-supplied link, not the original queue-time one', retrySendCall.link === retryLink)
    } finally {
      await rm(dataRoot, { recursive: true, force: true })
    }
  }

  console.log(`\n${passCount} BizM messaging assertions passed.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
