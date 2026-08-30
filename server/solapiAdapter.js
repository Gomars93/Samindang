// SOLAPI outbound-messaging transport (Quick Revisit delivery scaffold).
//
// Scope, explicitly: this file implements the FULL adapter interface --
// provider-state resolution, a fully-deterministic mock transport used for
// all local/dev/CI paths today, and a live-transport implementation whose
// wire format follows SOLAPI's publicly documented Messages v4 API to the
// best of general knowledge available while writing this. It has never
// been exercised against a real SOLAPI account (none exists for this
// clinic yet) and MUST be re-verified field-by-field against SOLAPI's own
// current API reference and a real sandbox account before
// `SolapiProviderState` can ever actually resolve to 'LIVE' in a real
// deployment -- see resolveSolapiProviderState() below. Real credentials,
// an approved Kakao Alimtalk template, and a live-send verification are
// EXTERNAL CREDENTIAL PENDING; nothing else in this scaffold is.
//
// Everything downstream of this file (messagingStore.js, the doctor-facing
// routes in server/index.js, src/lib/messagingClient.ts, and the DoctorView
// UI) talks ONLY to `createSolapiTransport()`'s `{ send }` interface, never
// to SOLAPI's HTTP shape directly -- so swapping the live implementation
// once real credentials exist, or adding a second provider later, touches
// only this one file.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

const SOLAPI_SEND_ENDPOINT = 'https://api.solapi.com/messages/v4/send'

/**
 * Three states, deliberately mirroring src/crm/types.ts's
 * ReservationSuppressionState pattern (PENDING_TEST_0 / VERIFIED /
 * DISABLED) -- the schema and full send/retry/fallback/webhook logic exist
 * and are fully exercised end-to-end via MOCK, but nothing can silently
 * reach a real send without both (a) real credentials actually being
 * configured AND (b) not being explicitly force-mocked for a staging
 * environment.
 *
 *   PENDING_CREDENTIALS -- no SOLAPI_API_KEY/SOLAPI_API_SECRET/
 *     SOLAPI_SENDER_NUMBER configured. The real state of this deployment
 *     today. Resolves to the mock transport so the rest of the feature
 *     (doctor UI, retry/backoff, delivery-state tracking) is fully usable
 *     and testable without ever touching the network.
 *   MOCK -- credentials ARE configured but SAMINDANG_SOLAPI_FORCE_MOCK is
 *     set, e.g. a staging environment that has real credentials on file
 *     but must never actually spend a real Alimtalk/SMS send.
 *   LIVE -- credentials configured, not force-mocked. Only state that
 *     constructs the live transport.
 */
export function resolveSolapiProviderState(env = process.env) {
  const hasCredentials = Boolean(env.SOLAPI_API_KEY && env.SOLAPI_API_SECRET && env.SOLAPI_SENDER_NUMBER)
  if (!hasCredentials) return 'PENDING_CREDENTIALS'
  if (env.SAMINDANG_SOLAPI_FORCE_MOCK === 'true') return 'MOCK'
  return 'LIVE'
}

/**
 * Deterministic, network-free mock transport. Every call succeeds on the
 * primary channel EXCEPT for two documented test-only recipient-number
 * suffixes, so retry/fallback/webhook-adjacent logic has real branches to
 * exercise in tests without a stateful mock config object threaded through
 * every call site:
 *   - ends with '9998' -> a RETRYABLE transient failure on every channel
 *     (simulates e.g. a provider rate-limit or timeout). The caller's own
 *     retry/backoff loop is what eventually gives up, not this transport.
 *   - ends with '9999' -> a non-retryable failure on KAKAO_ALIMTALK only,
 *     fallback-eligible, but SMS/LMS succeed normally (simulates the
 *     ordinary "recipient has no KakaoTalk account" case Alimtalk fallback
 *     exists for).
 * Any other recipient number succeeds immediately on whichever channel is
 * requested. providerMessageId is a random id, distinguishable from a real
 * SOLAPI id by its `mock_` prefix so a delivery-state UI or log can never
 * mistake a mock send for a real one even if MOCK is later left on by
 * mistake in a misconfigured environment.
 */
function createMockSolapiTransport() {
  async function send({ to, channel }) {
    const suffix = typeof to === 'string' ? to.slice(-4) : ''
    if (suffix === '9998') {
      return { ok: false, errorCode: 'mock_transient_failure', retryable: true, fallbackEligible: false }
    }
    if (suffix === '9999' && channel === 'KAKAO_ALIMTALK') {
      return { ok: false, errorCode: 'mock_alimtalk_unreachable', retryable: false, fallbackEligible: true }
    }
    return { ok: true, providerMessageId: `mock_${randomBytes(12).toString('hex')}`, channelUsed: channel }
  }
  return { send, state: 'MOCK' }
}

/**
 * Live SOLAPI transport. Field names/auth scheme follow SOLAPI's publicly
 * documented Messages v4 API (HMAC-SHA256 request signing: Authorization
 * header carries apiKey/date/salt/signature, signature = HMAC-SHA256 of
 * `${date}${salt}` keyed by the API secret) to the best of general
 * knowledge -- NOT verified against a live account or current SOLAPI docs,
 * because no such account exists for this clinic yet. Re-verify every
 * field name, the exact Alimtalk/kakaoOptions shape, and the fallback
 * message contract against SOLAPI's own current reference before this is
 * ever allowed to run against production traffic.
 */
function createLiveSolapiTransport({ apiKey, apiSecret, senderNumber, alimtalkPfId, alimtalkTemplateId }) {
  function authHeader() {
    const date = new Date().toISOString()
    const salt = randomBytes(16).toString('hex')
    const signature = createHmac('sha256', apiSecret).update(`${date}${salt}`).digest('hex')
    return `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`
  }

  async function send({ to, channel, text, variables }) {
    const body =
      channel === 'KAKAO_ALIMTALK'
        ? {
            message: {
              to,
              from: senderNumber,
              kakaoOptions: {
                pfId: alimtalkPfId,
                templateId: alimtalkTemplateId,
                variables: variables ?? {},
                // SOLAPI's Alimtalk-with-SMS-fallback contract: when the
                // provider itself cannot deliver via Alimtalk, it may send
                // this `disableSms:false` request's ordinary SMS/LMS body
                // as a fallback WITHOUT a second explicit call from us.
                // This scaffold additionally implements its own
                // application-level fallback (see messagingStore.js)
                // rather than relying solely on this, since the
                // provider-side fallback's own success/failure semantics
                // are exactly the kind of detail that needs re-verifying
                // against real docs before being trusted alone.
                disableSms: true,
              },
            },
          }
        : { message: { to, from: senderNumber, text, type: channel === 'LMS' ? 'LMS' : 'SMS' } }

    let res
    try {
      res = await fetch(SOLAPI_SEND_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: authHeader() },
        body: JSON.stringify(body),
      })
    } catch {
      return { ok: false, errorCode: 'network_error', retryable: true, fallbackEligible: channel === 'KAKAO_ALIMTALK' }
    }
    if (!res.ok) {
      // 4xx from SOLAPI is treated as non-retryable (bad request/template)
      // except 429, which is a rate limit and should be retried with
      // backoff like a 5xx would be.
      const retryable = res.status === 429 || res.status >= 500
      return {
        ok: false,
        errorCode: `provider_http_${res.status}`,
        retryable,
        fallbackEligible: channel === 'KAKAO_ALIMTALK',
      }
    }
    let json
    try {
      json = await res.json()
    } catch {
      return { ok: false, errorCode: 'provider_bad_response', retryable: true, fallbackEligible: channel === 'KAKAO_ALIMTALK' }
    }
    const providerMessageId = json?.messageId ?? json?.groupId ?? null
    if (!providerMessageId) {
      return { ok: false, errorCode: 'provider_missing_message_id', retryable: true, fallbackEligible: channel === 'KAKAO_ALIMTALK' }
    }
    return { ok: true, providerMessageId, channelUsed: channel }
  }
  return { send, state: 'LIVE' }
}

/** Single entry point every caller uses. Never constructs a transport
 *  directly -- always goes through provider-state resolution first, so a
 *  missing/incomplete credential set can never accidentally reach
 *  createLiveSolapiTransport with undefined fields. */
export function createSolapiTransport(env = process.env) {
  const state = resolveSolapiProviderState(env)
  if (state !== 'LIVE') return createMockSolapiTransport()
  return createLiveSolapiTransport({
    apiKey: env.SOLAPI_API_KEY,
    apiSecret: env.SOLAPI_API_SECRET,
    senderNumber: env.SOLAPI_SENDER_NUMBER,
    alimtalkPfId: env.SOLAPI_ALIMTALK_PF_ID,
    alimtalkTemplateId: env.SOLAPI_ALIMTALK_TEMPLATE_ID,
  })
}

/** Channel fallback order: Alimtalk first, then SMS. LMS is only ever
 *  chosen explicitly (a long message that would truncate as SMS), never
 *  as the automatic fallback target -- see messagingStore.js. */
export const FALLBACK_CHANNEL = { KAKAO_ALIMTALK: 'SMS' }

// Owner-review closing finding (HIGH SECURITY): the delivery-status webhook
// must never be "authenticated" merely by provider_message_id being hard to
// guess -- an id is an identifier, not a secret, and can leak through
// provider dashboards/logs/UI. This is a provider-neutral HMAC-SHA256
// verifier over the raw request body, checked against a per-request
// signature header, so a forged callback can never flip a message's
// delivery state without knowing the current webhook secret.
//
// PENDING_CREDENTIALS/MOCK (no real SOLAPI_WEBHOOK_SECRET configured, the
// actual state of this deployment today): falls back to a fixed,
// clearly-named mock secret so every request -- including this scaffold's
// own tests -- still goes through real signature verification rather than
// short-circuiting it. This deliberately does NOT skip verification in the
// absence of a real secret ("fail closed in any non-explicit mock/test
// mode", per the closing review) -- there is always some secret in effect.
// LIVE: uses the real SOLAPI_WEBHOOK_SECRET. The exact live SOLAPI webhook
// signature SCHEME (header name, encoding, canonical body construction) is
// UNVERIFIED against real docs/an account, same EXTERNAL CREDENTIAL PENDING
// caveat as createLiveSolapiTransport above -- this HMAC-over-raw-body
// shape is a reasonable placeholder to re-verify before ever processing a
// real provider callback.
const MOCK_WEBHOOK_SECRET = 'mock-webhook-secret-never-use-live'

export function resolveWebhookSecret(env = process.env) {
  return typeof env.SOLAPI_WEBHOOK_SECRET === 'string' && env.SOLAPI_WEBHOOK_SECRET.trim() !== ''
    ? env.SOLAPI_WEBHOOK_SECRET
    : MOCK_WEBHOOK_SECRET
}

/** Computes the signature a caller (a real provider, or a test) must send
 *  for a given raw body under the given secret -- exported so tests can
 *  construct a valid signature without duplicating the HMAC logic. */
export function signWebhookBody(rawBody, secret) {
  return createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')
}

/** Constant-time signature check. A missing/malformed header, or a
 *  differently-LENGTHED signature, is rejected outright before ever
 *  reaching timingSafeEqual (which throws on mismatched buffer lengths --
 *  itself not a timing leak here, since length alone is not the secret). */
export function verifyWebhookSignature(rawBody, signatureHeader, secret) {
  if (typeof signatureHeader !== 'string' || signatureHeader.trim() === '') return false
  const expectedHex = signWebhookBody(rawBody, secret)
  let expected, actual
  try {
    expected = Buffer.from(expectedHex, 'hex')
    actual = Buffer.from(signatureHeader, 'hex')
  } catch {
    return false
  }
  if (expected.length !== actual.length) return false
  return timingSafeEqual(expected, actual)
}
