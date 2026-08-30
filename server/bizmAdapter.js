// BizM (비즈엠) outbound-messaging transport -- the clinic owner's actual
// selected provider for Quick Revisit delivery (replacing the SOLAPI
// scaffold as the DEFAULT provider; see messagingTransport.js's
// resolveMessagingProviderName and solapiAdapter.js's own header for why
// SOLAPI's code is kept, not deleted).
//
// UNVERIFIED WIRE FORMAT -- READ BEFORE EVER SETTING BIZM_API_KEY IN A REAL
// ENVIRONMENT. Every network-access attempt this implementation's author
// made to BizM's own official documentation (bizmsg.kr, the BizMessage
// developer portal at bizmsg-web.kakaoenterprise.com, dev-alimtalk-api./
// alimtalk-api.bizmsg.kr, and the bizmessage.zendesk.com help center) was
// blocked by this environment's network egress policy -- none of BizM's own
// docs were reachable while writing this file. What follows is instead
// reconstructed from two independent third-party open-source SDKs found via
// web search (neither is BizM's own code, neither could be cross-checked
// against BizM's real docs, and they materially disagree with each other):
//   - posquit0/node-kakao-alimtalk-bizmsg (older, JS): host
//     `https://alimtalk-api.bizmsg.kr`, path `/v1/sender/send`, POST, body
//     fields `userId`/`profile`(=apiKey)/`message_type`/`tmplId`/`msg`/`phn`.
//   - el-ground/bizmsg-alimtalk-node-sdk (newer, TypeScript): dev host
//     `https://dev-alimtalk-api.bizmsg.kr:1443/v2/partner/...`, auth via a
//     `BIZMSGID` + `userid`/`senderKey` pair, a `keyValue` map for template
//     variable substitution -- but its own template-management endpoints
//     were the only ones this author could actually see the shape of; the
//     v2 SEND endpoint's own exact path/body was not visible in what was
//     fetched.
// This file picks the v2-shaped request (senderKey/templateCode/variables,
// closer to the newer SDK, and closer to how the owner separately confirmed
// BizM's own template-editor UI actually names things -- see below) as the
// working scaffold, with the v1 field names kept in a comment as the
// documented alternative to try if the v2 guess is wrong. NONE of this --
// host, path, field names, auth header, response shape -- may be trusted
// without independently re-verifying it against BizM's real developer
// console/support once network access or direct account testing is
// possible. Exactly like solapiAdapter.js's own live transport, this can
// only ever resolve to LIVE with real credentials configured (see
// resolveBizmProviderState), and even then a human must confirm a real test
// send actually reaches a real phone before this is trusted in production.
//
// What IS confirmed directly from the owner (not a third-party guess -- the
// owner read these off BizM's own template-registration UI for the actual
// template being registered for this clinic):
//   - template code: SAMINDANG_FOLLOWUP_01 (BIZM_TEMPLATE_CODE below)
//   - button label: "상태 확인하기" (button text/URL themselves are configured
//     BizM-side at template-approval time, not sent per-request by this
//     adapter -- see the module's `variables` doc below)
//   - template variable substitution syntax in the BizM UI: `#{변수}`
//   - the one variable this template needs filled per send: `followup_token`
//     -- the RAW one-time capability token (see server/messagingStore.js's
//     module doc comment on why this transport receives the raw token as a
//     `variables` value only, transient, never persisted here or by any
//     caller). The button's own target URL is expected to already be
//     registered BizM-side as something like
//     `<public follow-up base>#follow-up=#{followup_token}` (see
//     src/lib/publicFollowUpUrl.ts) so this adapter never needs to build or
//     send a URL itself -- only the bare token value.
//
// Channel scope: KAKAO_ALIMTALK only. This adapter deliberately does NOT
// implement SMS/LMS at all (`send()` fails closed with
// `fallbackEligible:false` for any other channel, and FALLBACK_CHANNEL below
// is an empty map) -- neither third-party source documented BizM's SMS wire
// format with any confidence, and the owner's own brief explicitly warns
// "do not assume BizM performs SMS/LMS fallback unless official contract
// confirms it." Guessing a second wire format on top of an already-unverified
// one would only compound the risk. If/when a real BizM SMS contract is
// confirmed, add it here the same way solapiAdapter.js's LMS/SMS branch
// exists, and only then widen FALLBACK_CHANNEL.
//
// Delivery-status webhook: BizM's own callback contract (payload shape,
// header name, signature scheme) was not found in either third-party
// source and could not be verified. This adapter deliberately reuses the
// exact same provider-neutral HMAC-SHA256-over-raw-body verifier
// solapiAdapter.js already implements (see messagingTransport.js's
// resolveWebhookSecret/signWebhookBody/verifyWebhookSignature, re-exported
// unchanged from solapiAdapter.js) -- that scheme is this SERVER's own
// choice of how to authenticate an inbound callback, independent of
// whichever real scheme BizM's webhook turns out to use, so it remains a
// reasonable fail-closed placeholder regardless of provider. It must still
// be re-mapped to BizM's actual real webhook shape (which header/field BizM
// actually sends) before a real callback can be processed correctly.
import { randomBytes } from 'node:crypto'

const BIZM_SEND_ENDPOINT = 'https://alimtalk-api.bizmsg.kr/v2/sender/send'
const DEFAULT_TEMPLATE_CODE = 'SAMINDANG_FOLLOWUP_01'

/**
 * Same three-state pattern as resolveSolapiProviderState (see
 * solapiAdapter.js) -- PENDING_CREDENTIALS is the real state of this
 * deployment today (no BizM account credentials configured anywhere),
 * MOCK is for a staging environment with real credentials on file that must
 * never actually spend a real send, LIVE is the only state that constructs
 * the (unverified) live transport.
 */
export function resolveBizmProviderState(env = process.env) {
  const hasCredentials = Boolean(env.BIZM_API_KEY && env.BIZM_SENDER_KEY)
  if (!hasCredentials) return 'PENDING_CREDENTIALS'
  if (env.SAMINDANG_BIZM_FORCE_MOCK === 'true') return 'MOCK'
  return 'LIVE'
}

/**
 * Deterministic, network-free mock transport -- identical simulated-failure
 * contract to solapiAdapter.js's own mock (same magic recipient-number
 * suffixes), so messagingStore.js's retry/fallback/webhook logic exercises
 * identically regardless of which provider is selected. providerMessageId
 * carries a `mockbizm_` prefix (distinct from SOLAPI's `mock_` prefix) so a
 * delivery-state UI or log can tell which mock produced it even if both
 * adapters were ever exercised side by side (e.g. in tests).
 */
function createMockBizmTransport() {
  async function send({ to, channel }) {
    if (channel !== 'KAKAO_ALIMTALK') {
      return { ok: false, errorCode: 'bizm_channel_unverified', retryable: false, fallbackEligible: false }
    }
    const suffix = typeof to === 'string' ? to.slice(-4) : ''
    if (suffix === '9998') {
      return { ok: false, errorCode: 'mock_transient_failure', retryable: true, fallbackEligible: false }
    }
    if (suffix === '9999') {
      return { ok: false, errorCode: 'mock_alimtalk_unreachable', retryable: false, fallbackEligible: false }
    }
    return { ok: true, providerMessageId: `mockbizm_${randomBytes(12).toString('hex')}`, channelUsed: channel }
  }
  return { send, state: 'MOCK', provider: 'BIZM' }
}

/**
 * Live BizM transport. UNVERIFIED -- see this file's header. Sends only
 * KAKAO_ALIMTALK; any other channel is refused before ever reaching the
 * network (see this file's header on why SMS/LMS is out of scope here).
 */
function createLiveBizmTransport({ apiKey, senderKey, templateCode }) {
  async function send({ to, channel, variables }) {
    if (channel !== 'KAKAO_ALIMTALK') {
      return { ok: false, errorCode: 'bizm_channel_unverified', retryable: false, fallbackEligible: false }
    }
    // Field names below are the v2-shaped guess documented in this file's
    // header (senderKey/templateCode/variables) -- if a real account proves
    // this wrong, the v1-shaped alternative was `{ userId, profile: apiKey,
    // tmplId: templateCode, msg: <fully pre-substituted text>, phn: to }`.
    const body = {
      senderKey,
      templateCode,
      phn: to,
      // The owner-confirmed template variable name is `followup_token`
      // (BizM UI substitution syntax `#{followup_token}`) -- `variables` is
      // expected to already be exactly `{ followup_token: <raw token> }`
      // when the caller is server/index.js's Quick Revisit route (see
      // messagingStore.js's queueRevisitMessage/attemptSend/retryMessage
      // `variables` passthrough). Never logged, never persisted here.
      variables: variables ?? {},
    }
    let res
    try {
      res = await fetch(BIZM_SEND_ENDPOINT, {
        method: 'POST',
        // Authorization header scheme is UNVERIFIED -- neither third-party
        // source this file's header describes showed a signing/HMAC scheme
        // the way SOLAPI's docs did, so this uses the simplest plausible
        // shape (a bearer API key) rather than inventing a signing
        // algorithm with no evidence for one. Re-verify against BizM's real
        // docs/support before this can ever run against production traffic.
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
      })
    } catch {
      return { ok: false, errorCode: 'network_error', retryable: true, fallbackEligible: false }
    }
    if (!res.ok) {
      const retryable = res.status === 429 || res.status >= 500
      return { ok: false, errorCode: `provider_http_${res.status}`, retryable, fallbackEligible: false }
    }
    let json
    try {
      json = await res.json()
    } catch {
      return { ok: false, errorCode: 'provider_bad_response', retryable: true, fallbackEligible: false }
    }
    // Candidate response id field names, since the real shape is
    // unverified -- tries the most plausible ones in order rather than
    // asserting a single guessed name.
    const providerMessageId = json?.messageId ?? json?.msgKey ?? json?.msg_key ?? json?.groupId ?? null
    if (!providerMessageId) {
      return { ok: false, errorCode: 'provider_missing_message_id', retryable: true, fallbackEligible: false }
    }
    return { ok: true, providerMessageId, channelUsed: channel }
  }
  return { send, state: 'LIVE', provider: 'BIZM' }
}

/** Single entry point every caller uses -- never constructs a transport
 *  directly, mirrors solapiAdapter.js's own createSolapiTransport. */
export function createBizmTransport(env = process.env) {
  const state = resolveBizmProviderState(env)
  if (state !== 'LIVE') return createMockBizmTransport()
  return createLiveBizmTransport({
    apiKey: env.BIZM_API_KEY,
    senderKey: env.BIZM_SENDER_KEY,
    templateCode: env.BIZM_TEMPLATE_CODE || DEFAULT_TEMPLATE_CODE,
  })
}

/** No verified BizM SMS/LMS fallback exists -- see this file's header. An
 *  empty map means messagingStore.js's own fallback branch
 *  (`FALLBACK_CHANNEL[record.channel]`) never finds an entry for
 *  KAKAO_ALIMTALK and therefore never attempts a second channel for BizM,
 *  which is the deliberately safe behavior until a real SMS contract is
 *  confirmed. */
export const FALLBACK_CHANNEL = {}
