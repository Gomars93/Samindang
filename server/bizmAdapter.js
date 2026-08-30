// BizM (비즈엠) outbound-messaging transport -- the clinic owner's actual
// selected provider for Quick Revisit delivery (replacing the SOLAPI
// scaffold as the DEFAULT provider; see messagingTransport.js's
// resolveMessagingProviderName and solapiAdapter.js's own header for why
// SOLAPI's code is kept, not deleted).
//
// ============================================================================
// CONTRACT-VERIFICATION GATE -- READ BEFORE EVER SETTING BIZM CREDENTIALS
// ============================================================================
// This adapter has TWO independent gates before a real network send can ever
// happen, not one:
//   1. Credentials configured (BIZM_API_KEY, BIZM_SENDER_KEY, BIZM_USER_ID).
//   2. SAMINDANG_BIZM_CONTRACT_VERIFIED === 'true', a SEPARATE, MANUALLY-SET
//      flag a human sets ONLY after independently confirming this adapter's
//      exact request/response/auth/callback shape against BizM's own
//      authenticated developer console -- something this sandbox's network
//      egress cannot reach (see below). Credentials alone, even genuinely
//      valid ones, are NOT sufficient to reach LIVE (see
//      resolveBizmProviderState's PENDING_CONTRACT state) -- this is the
//      direct fix for a HIGH-severity finding from an owner review of this
//      exact file: "simply adding credentials can send patient traffic
//      through a guessed protocol." That must never be possible again,
//      independent of how much better-evidenced this file's guesses get.
//
// WIRE FORMAT -- PARTIALLY EVIDENCE-BACKED, STILL NOT VERIFIED. This
// environment's network egress to bizmsg.kr/kakaoenterprise.com and related
// hosts is blocked, so this file's author could never load BizM's own
// interactive docs or console. Two rounds of research went into this file:
//
// Round 1 (two third-party open-source SDKs, mutually inconsistent, neither
// BizM's own code):
//   - posquit0/node-kakao-alimtalk-bizmsg (older, JS): host
//     `https://alimtalk-api.bizmsg.kr`, path `/v1/sender/send`, POST, body
//     fields `userId`/`profile`(=apiKey)/`message_type`/`tmplId`/`msg`/`phn`.
//   - el-ground/bizmsg-alimtalk-node-sdk (newer, TypeScript): dev host
//     `https://dev-alimtalk-api.bizmsg.kr:1443/v2/partner/...`, auth via a
//     `BIZMSGID` + `userid`/`senderKey` pair, a `keyValue` map for template
//     variable substitution.
//
// Round 2 (owner-supplied facts from BizM's OWN publicly indexed
// documentation -- an actual first-party source, not a third-party guess,
// though still not the full authenticated contract):
//   - Dev host confirmed: `https://dev-alimtalk-api.bizmsg.kr:1443`.
//   - BizM's own official RESULT-CODE table confirms, by the existence and
//     naming of these codes, that the real send contract has: a request body
//     that must be a JSON ARRAY (`E100 InvalidJsonArray` -- "request must be
//     a JSON array", not a single object, which is what BOTH round-1
//     third-party guesses got wrong), a profile-key field
//     (`E102 InvalidProfileKey`), a template-code field
//     (`E103 EmptyTemplateCode`), a fully-rendered message field, not just
//     template variables (`E106 EmptyMessage`), an optional per-message
//     dedup id capped at 20 characters (`E109 DuplicatedMsgId`,
//     `E113 InvalidMsgIdLength`), and a documented SMS-fallback field
//     surface (`E120 InvalidSMSProfile`, `E125 InvalidSMSKind`).
//   - BizM's own development API docs use a `userid` request HEADER (not an
//     `Authorization: Bearer` scheme) for partner/test operations, and
//     confirm development-only direct template approval plus a one-day
//     test-recipient certification step.
//
// What this means concretely for what changed in this file (round 2, this
// review cycle) vs what is STILL an unconfirmed guess:
//   CONFIRMED (elevated from guess to evidence-backed): body is a JSON ARRAY
//     of message objects, not a single object; a `userid` header carries the
//     BizM login id; a `profile` field, a template-code field, a fully
//     rendered `message` field, and an optional <=20-char `msgId` field all
//     exist somewhere in each array item.
//   STILL UNCONFIRMED (do not trust): the EXACT JSON key spelling for each
//     field beyond what the result-code names themselves imply (this file
//     uses `profile`/`tmplCode`/`message`/`msgId`/`phn` as the most literal
//     reading of the result-code names, not a verified schema); whether
//     BIZM_API_KEY plays any role in the real auth handshake at all (kept as
//     a required credential purely so LIVE can never be reachable without an
//     operator having provisioned every credential BizM's console issues,
//     NOT because this file knows where to place it in a request -- it is
//     deliberately NOT sent as a guessed header, since inventing a wrong
//     header is worse than omitting an unplaced credential); the exact
//     response array/message-id shape; the button-variable substitution
//     field name (still assumed to be `variables` per the owner's confirmed
//     `#{followup_token}` UI syntax, unchanged from round 1); and the entire
//     webhook/callback contract (still this SERVER's own placeholder HMAC
//     scheme, see below).
//
// NONE of this -- host, path, field names, auth, response shape, callback
// contract -- may be trusted in production without independently
// re-verifying it against BizM's real authenticated developer console/
// support once network access or direct account testing is possible, AND
// without a human explicitly setting SAMINDANG_BIZM_CONTRACT_VERIFIED=true
// only at that point. Even then, a human must confirm a real test send
// actually reaches a real phone before this is trusted in production.
//
// What IS confirmed directly from the owner (not a third-party or
// result-code inference -- the owner read these off BizM's own
// template-registration UI for the actual template being registered for
// this clinic):
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
// is an empty map), even though round 2's evidence confirms BizM's API
// surface DOES have SMS-fallback fields (E120/E125) -- per the owner's own
// explicit instruction, provider-side fallback must be implemented "only
// after the exact account API field contract is verified," which it is not.
// Guessing a second wire format on top of an already-unverified one would
// only compound the risk. If/when a real BizM SMS contract is confirmed, add
// it here the same way solapiAdapter.js's LMS/SMS branch exists, and only
// then widen FALLBACK_CHANNEL.
//
// Delivery-status webhook: BizM's own callback contract (payload shape,
// header name, signature scheme) was not found in either third-party source
// or the owner-supplied result-code evidence, and could not be verified.
// This adapter deliberately reuses the exact same provider-neutral
// HMAC-SHA256-over-raw-body verifier solapiAdapter.js already implements
// (see messagingTransport.js's resolveWebhookSecret/signWebhookBody/
// verifyWebhookSignature, re-exported unchanged from solapiAdapter.js) --
// that scheme is this SERVER's own choice of how to authenticate an inbound
// callback, independent of whichever real scheme BizM's webhook turns out to
// use. It must NEVER be described as verified BizM callback authentication
// -- it only protects this server's own webhook endpoint from arbitrary
// internet callers; a real BizM callback would not know this server's
// secret and could not satisfy it today. It must still be re-mapped to
// BizM's actual real webhook shape (which header/field BizM actually sends)
// before a real callback can be processed correctly. Because LIVE is gated
// behind SAMINDANG_BIZM_CONTRACT_VERIFIED, no real `provider_message_id`
// from an actual BizM send can exist until that gate is deliberately opened,
// so a stray webhook cannot be mistaken for a real delivery confirmation
// before then either (mock-issued ids always carry the `mockbizm_` prefix,
// see below).
import { createHash, randomBytes } from 'node:crypto'

const BIZM_SEND_ENDPOINT = 'https://alimtalk-api.bizmsg.kr/v2/sender/send'
const DEFAULT_TEMPLATE_CODE = 'SAMINDANG_FOLLOWUP_01'

/**
 * Four states -- PENDING_CREDENTIALS/PENDING_CONTRACT/MOCK/LIVE -- an
 * explicit widening of the tri-state pattern shared with
 * resolveSolapiProviderState (see solapiAdapter.js) and
 * src/crm/types.ts's ReservationSuppressionState. The extra state exists
 * because "credentials configured" and "the wire contract this file
 * implements has actually been verified against a real BizM account" are
 * two genuinely independent facts -- collapsing them into one gate (as this
 * file did before this review cycle) meant an operator finishing BizM's
 * credential-issuance step alone would silently make this adapter attempt
 * real sends through what is still, at best, an educated guess.
 *   PENDING_CREDENTIALS -- BIZM_API_KEY/BIZM_SENDER_KEY/BIZM_USER_ID not all
 *     configured. The real state of this deployment today.
 *   PENDING_CONTRACT -- full credentials ARE configured, but
 *     SAMINDANG_BIZM_CONTRACT_VERIFIED is not exactly 'true'. Resolves to
 *     the SAME mock transport as PENDING_CREDENTIALS (see
 *     createBizmTransport below) -- the distinction exists purely so a
 *     human/monitoring can tell "nothing configured yet" apart from "fully
 *     provisioned, but the wire contract is still unverified and sending is
 *     therefore still refused on purpose."
 *   MOCK -- contract verified AND full credentials configured, but
 *     SAMINDANG_BIZM_FORCE_MOCK is set -- e.g. a staging environment that
 *     has real credentials AND a verified contract on file but must never
 *     actually spend a real send.
 *   LIVE -- the only state that constructs the live transport. Requires
 *     ALL of: full credentials, an explicit human-set
 *     SAMINDANG_BIZM_CONTRACT_VERIFIED='true', and not force-mocked.
 */
export function resolveBizmProviderState(env = process.env) {
  const hasCredentials = Boolean(env.BIZM_API_KEY && env.BIZM_SENDER_KEY && env.BIZM_USER_ID)
  if (!hasCredentials) return 'PENDING_CREDENTIALS'
  if (env.SAMINDANG_BIZM_CONTRACT_VERIFIED !== 'true') return 'PENDING_CONTRACT'
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
 * adapters were ever exercised side by side (e.g. in tests), and so a real
 * inbound webhook (which could only ever carry a real BizM-issued id) can
 * never accidentally match a mock-issued record.
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
 * Derives a stable, BizM-safe (<=20 characters, per E113 InvalidMsgIdLength)
 * provider-level dedup id from OUR OWN message_id (a full UUID, too long to
 * send as-is). Deterministic -- the SAME message_id always produces the
 * SAME msgId, so a retry of the same logical send attempt (this store's own
 * message_id never changes across retries of one MessageRecord) presents
 * the identical msgId to BizM every time. If BizM's real E109
 * DuplicatedMsgId semantics do what their name implies, this gives the
 * provider itself a second, independent line of defense against a genuine
 * double-send (e.g. a timeout where our own side never learned whether the
 * first attempt actually landed) on top of this store's own dedup_key
 * check -- see messagingStore.js's module doc comment. Never derived from
 * anything patient-identifying (only message_id, an opaque server-minted
 * id already used everywhere else in this store).
 */
function deriveBizmMsgId(messageId) {
  return createHash('sha256').update(messageId, 'utf8').digest('hex').slice(0, 20)
}

/**
 * Live BizM transport. STILL NOT VERIFIED -- see this file's header for
 * exactly which parts are owner/result-code-evidence-backed vs still a
 * guess. Sends only KAKAO_ALIMTALK; any other channel is refused before
 * ever reaching the network (see this file's header on why SMS/LMS is out
 * of scope here despite BizM's API surface having fields for it).
 */
function createLiveBizmTransport({ apiKey, senderKey, userId, templateCode }) {
  async function send({ to, channel, text, variables, messageId }) {
    if (channel !== 'KAKAO_ALIMTALK') {
      return { ok: false, errorCode: 'bizm_channel_unverified', retryable: false, fallbackEligible: false }
    }
    // Body shape per this file's header, round 2: a JSON ARRAY (E100
    // InvalidJsonArray) of exactly one message object here (this adapter
    // sends one recipient per call; BizM's array wrapping may exist to
    // support bulk sends in one request, which this store never needs).
    // Field key spellings (`profile`/`tmplCode`/`message`/`msgId`/`phn`) are
    // the most literal reading of the confirmed result-code names, NOT a
    // verified schema -- see header. `message` carries the caller's
    // already-rendered text (matches E106 EmptyMessage requiring a real
    // message body, not just template variables), while `variables` is
    // still sent alongside it for the template-substitution path the owner
    // confirmed via the BizM UI (`#{followup_token}`) -- until the real
    // contract confirms which of the two BizM's send API actually consumes,
    // both are included rather than guessing which one to drop.
    const item = {
      profile: senderKey,
      tmplCode: templateCode,
      phn: to,
      message: text ?? '',
      msgId: deriveBizmMsgId(messageId),
      // See header: `followup_token` is the owner-confirmed BizM template
      // variable name. Never logged, never persisted here.
      variables: variables ?? {},
    }
    let res
    try {
      res = await fetch(BIZM_SEND_ENDPOINT, {
        method: 'POST',
        // `userid` header per this file's header, round 2 (BizM's own
        // development API docs) -- apiKey's role in the real auth handshake
        // remains unconfirmed and is deliberately NOT sent as a guessed
        // header (see header on why inventing a wrong header is worse than
        // omitting an unplaced credential); it is still required as an
        // environment credential purely so LIVE can never be reached
        // without an operator having provisioned every credential BizM's
        // console issues.
        headers: { 'content-type': 'application/json', userid: userId },
        body: JSON.stringify([item]),
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
    // Candidate response shapes, since the real shape is unverified -- BizM
    // may echo back an array (matching the request) or a single object;
    // this tries both rather than asserting one. Candidate id field names
    // similarly try the most plausible ones in order.
    const first = Array.isArray(json) ? json[0] : json
    const providerMessageId = first?.messageId ?? first?.msgKey ?? first?.msg_key ?? first?.groupId ?? null
    if (!providerMessageId) {
      return { ok: false, errorCode: 'provider_missing_message_id', retryable: true, fallbackEligible: false }
    }
    return { ok: true, providerMessageId, channelUsed: channel }
  }
  return { send, state: 'LIVE', provider: 'BIZM' }
}

/** Single entry point every caller uses -- never constructs a transport
 *  directly, mirrors solapiAdapter.js's own createSolapiTransport. Any
 *  state other than LIVE (PENDING_CREDENTIALS, PENDING_CONTRACT, MOCK)
 *  resolves to the mock transport -- see resolveBizmProviderState's own
 *  doc comment on why PENDING_CONTRACT must behave identically to
 *  PENDING_CREDENTIALS here despite being a distinct, separately
 *  observable state. */
export function createBizmTransport(env = process.env) {
  const state = resolveBizmProviderState(env)
  if (state !== 'LIVE') return createMockBizmTransport()
  return createLiveBizmTransport({
    apiKey: env.BIZM_API_KEY,
    senderKey: env.BIZM_SENDER_KEY,
    userId: env.BIZM_USER_ID,
    templateCode: env.BIZM_TEMPLATE_CODE || DEFAULT_TEMPLATE_CODE,
  })
}

/** No verified BizM SMS/LMS fallback exists -- see this file's header. An
 *  empty map means messagingStore.js's own fallback branch
 *  (`FALLBACK_CHANNEL[record.channel]`) never finds an entry for
 *  KAKAO_ALIMTALK and therefore never attempts a second channel for BizM,
 *  which is the deliberately safe behavior until a real SMS contract is
 *  confirmed -- even though round 2's result-code evidence confirms BizM's
 *  API surface DOES have SMS-fallback fields (E120/E125); see header. */
export const FALLBACK_CHANNEL = {}
