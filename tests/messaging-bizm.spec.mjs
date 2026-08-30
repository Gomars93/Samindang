// BizM batch: provider-neutral transport selection + BizM adapter
// regression suite. Plain node, no test framework -- same convention as
// tests/messaging.spec.mjs. Scope: everything here is credential-free
// (mock transports only) -- BizM's live wire format is UNVERIFIED (see
// server/bizmAdapter.js's header) and out of scope for this suite.
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
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
     Part 1: resolveBizmProviderState -- the 3-state gate itself.
     ===================================================================== */
  {
    assert('BizM provider state: no credentials -> PENDING_CREDENTIALS (the real state of this deployment today)', resolveBizmProviderState({}) === 'PENDING_CREDENTIALS')
    assert(
      'BizM provider state: partial credentials (missing sender key) -> still PENDING_CREDENTIALS',
      resolveBizmProviderState({ BIZM_API_KEY: 'k' }) === 'PENDING_CREDENTIALS',
    )
    const fullCreds = { BIZM_API_KEY: 'k', BIZM_SENDER_KEY: 's' }
    assert('BizM provider state: full credentials, no force-mock -> LIVE', resolveBizmProviderState(fullCreds) === 'LIVE')
    assert(
      'BizM provider state: full credentials + SAMINDANG_BIZM_FORCE_MOCK=true -> MOCK',
      resolveBizmProviderState({ ...fullCreds, SAMINDANG_BIZM_FORCE_MOCK: 'true' }) === 'MOCK',
    )
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
      await store.queueRevisitMessage({
        visitId: 'visit-variables-1',
        patientId: 'patient-variables-1',
        phone: '01011112222',
        followUpToken: 'raw-token-value',
        text: 'fallback text',
        variables,
      })
      assert('variables passthrough: the initial send actually receives variables.followup_token', sendCalls[0].variables?.followup_token === 'raw-token-value')

      // Force a retryable failure then manually retry with different
      // variables, confirming retryMessage's own `variables` argument (not
      // some stale cached value) is what's actually sent -- same pattern
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
      })
      assert('variables passthrough (retry setup): first attempt QUEUED after the forced retryable failure', queued.record.status === 'QUEUED')
      const retried = await retryStore.retryMessage(queued.record.message_id, { phone: '01011113333', variables: { followup_token: 'tok-retry-manual' } })
      assert('variables passthrough (retry): manual retry succeeds', retried.status === 'SENT')
      const retrySendCall = sendCalls[sendCalls.length - 1]
      assert('variables passthrough (retry): the retry call carries the manually re-supplied variables, not the original queue-time ones', retrySendCall.variables?.followup_token === 'tok-retry-manual')
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
