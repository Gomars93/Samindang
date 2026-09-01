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
// interactive docs or console. Three rounds of research went into this
// file:
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
// though still not the full authenticated contract; codeList.html and
// startTest.html, both publicly reachable pages, not behind login):
//   - Dev host confirmed: `https://dev-alimtalk-api.bizmsg.kr:1443`, with a
//     `userid` request HEADER (not an `Authorization: Bearer` scheme) for
//     partner/test operations, plus development-only direct template
//     approval and a one-day test-recipient certification step.
//   - BizM's own official RESULT-CODE table (codeList.html) confirms, by the
//     existence and naming of these codes, that the real send contract has:
//     a request body that must be a JSON ARRAY (`E100 InvalidJsonArray` --
//     "request must be a JSON array", not a single object, which is what
//     BOTH round-1 third-party guesses got wrong), a profile-key field
//     (`E102 InvalidProfileKey`), a template-code field
//     (`E103 EmptyTemplateCode`), a fully-rendered message field, not just
//     template variables (`E106 EmptyMessage`, `E107 SMSEmptyMessage`), an
//     optional per-message dedup id capped at 20 characters
//     (`E109 DuplicatedMsgId`, `E113 InvalidMsgIdLength`), a documented
//     SMS-fallback field surface (`E120 InvalidSMSProfile`,
//     `E125 InvalidSMSKind`), a button-object field
//     (`E124 InvalidButtonJsonObject`), and template/content-mismatch
//     detection at send time (`K105` template/message mismatch, `K108`
//     button mismatch -- see this file's "template/content mismatch" note
//     below on why this still cannot be surfaced to staff any more
//     specifically than a generic provider error code today).
//
// Round 3 (owner-supplied corroboration from CURRENT, actively-maintained
// third-party packages -- an npm SDK and, in a later pass of this same
// round, a Ruby gem, both versioned `2.5.1` (coincidence or the same
// upstream project mirrored across ecosystems, not established either way)
// -- explicitly flagged by the owner as "NOT SSOT," a search hint only,
// never itself sufficient to call anything verified -- but they
// independently land on the SAME production host+path+auth-header
// combination round 2's official docs pointed at, which round 1's two
// mutually-inconsistent, now-outdated third-party SDKs did not agree on):
//   - `POST https://alimtalk-api.bizmsg.kr/v2/sender/send` (the exact
//     endpoint this file already used from round 1 -- now corroborated by a
//     production, not just dev-host, source), header `userid` (matching
//     round 2's confirmed header name, now seen used against the PRODUCTION
//     endpoint too, not just the dev/partner/test operations round 2's own
//     source covered).
//   - JSON-array body with fields `message_type`/`phn`/`profile`/
//     `reserveDt`(optional, scheduled send -- irrelevant here, this store
//     always sends immediately)/`msg`/`tmplId`, and -- superseding this
//     file's earlier (WRONG, see below) assumption that a button URL is
//     configured once at template-approval time and never sent
//     per-request -- an explicitly CONSTRUCTED `button1` object shaped
//     `{ name, type: 'WL', url_mobile, [url_pc] }`, plus optional
//     `smsKind`/`msgSms`/`smsSender` (BizM provider-side SMS-fallback
//     fields -- still not implemented here, see "Channel scope" below).
//     Response is an array.
//   - This directly supersedes round 1's `tmplCode`/`message` guesses with
//     the better-corroborated `tmplId`/`msg`/`msg_type`(sic; see
//     `message_type` field below) (still not a verified schema -- see
//     below).
//
// Round 3, continued (owner-review finding, HIGH -- a real production-
// correctness defect this file had, not just an evidence upgrade): this
// file previously sent NO button field at all, only `variables.
// followup_token`, on the assumption -- stated as fact in an earlier
// version of this header, but never actually supported by any first-party
// BizM evidence -- that BizM would substitute that token into a
// pre-registered button URL template on its own. BizM's own result codes
// (`E124 InvalidButtonJsonObject`, `K108` button/template mismatch) plus
// round 3's `button1`-construction evidence directly contradict that
// assumption: the button URL is built and sent PER REQUEST, not configured
// once and left alone. Fixed: the button URL is now the same one-time
// `link` this record's follow_up_token_hash is a hash of (see
// messagingStore.js's attemptSend doc comment on why `link` is threaded
// here separately from `text`), rendered into `button1.url_mobile`/
// `url_pc`; `variables` is no longer sent to BizM at all (see
// BIZM_BUTTON_NAME/BIZM_MESSAGE_TEXT below for exactly what replaced it,
// and why the message body itself changed too -- the raw URL must live
// ONLY in the button, never inline in `msg`, to avoid a K105
// template/message mismatch against whatever the real approved template
// text turns out to be).
//
// What this means concretely for what changed in this file (rounds 2-3,
// this review cycle) vs what is STILL an unconfirmed guess:
//   CONFIRMED (elevated from guess to evidence-backed, first-party source):
//     body is a JSON ARRAY of message objects, not a single object; a
//     `userid` header carries the BizM login id for partner/test (dev host)
//     operations; a `profile` field, a template-id field, a fully rendered
//     message field, a button-object field, and an optional <=20-char
//     msgId field all exist somewhere in each array item.
//   CORROBORATED (multiple independent sources agree, still NOT verified
//     against an authenticated account -- the owner's own explicit
//     instruction): the exact production endpoint `.../v2/sender/send`; the
//     `userid` header applying there too, not just the dev host; the field
//     spellings `profile`/`tmplId`/`msg`/`phn`/`msgId`/`message_type`/
//     `button1{name,type,url_mobile,url_pc}` (this file now uses these,
//     replacing round 1's `tmplCode`/`message` guesses and the
//     button-less/`variables`-only shape -- `message_type` below is sent
//     with a specific value that has NO corroborating evidence at all for
//     correctness, only that a field by this name exists; see its own
//     inline comment).
//   STILL UNCONFIRMED (do not trust): the EXACT correct value for
//     `message_type`; the EXACT approved template message text (BIZM_
//     MESSAGE_TEXT below is a structurally-plausible placeholder, not the
//     real registered wording -- see its own comment); whether BIZM_API_KEY
//     plays any role in the real auth handshake at all (kept as a required
//     credential purely so LIVE can never be reachable without an operator
//     having provisioned every credential BizM's console issues, NOT
//     because this file knows where to place it in a request -- it is
//     deliberately NOT sent as a guessed header, since inventing a wrong
//     header is worse than omitting an unplaced credential); whether
//     `userid` alone is sufficient authentication for a real send with no
//     other secret in the request at all (plausible a real send would 401
//     without something more); the exact response array/message-id/
//     result-code shape (BIZM_RESULT_FAILURE_CODE_RE below is a targeted,
//     evidence-consistent pattern match against known result-code SHAPES,
//     not a verified response schema); and the entire webhook/callback
//     contract (still this SERVER's own placeholder HMAC scheme, see
//     below).
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
//   - button label: "상태 확인하기" (BIZM_BUTTON_NAME below) -- the button's
//     TYPE/URL-FIELD shape is round-3 corroborated, not owner-confirmed;
//     only the visible label text itself came directly from the owner.
//   - template variable substitution syntax in the BizM UI: `#{변수}`, and
//     the one variable name the template was registered with:
//     `followup_token` -- but see the round-3 finding above on why this
//     adapter no longer relies on BizM substituting that name into
//     anything; the raw one-time capability token now reaches BizM only as
//     part of `button1.url_mobile`/`url_pc` (see server/messagingStore.js's
//     module doc comment on why the raw token is never persisted anywhere,
//     including here -- it exists only as a transient part of `link` for
//     the duration of one send() call).
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
 * send as-is) plus the channel being attempted. Deterministic -- the SAME
 * (message_id, channel) pair always produces the SAME msgId, so a retry of
 * the same logical send attempt on the SAME channel (this store's own
 * message_id never changes across retries of one MessageRecord) presents
 * the identical msgId to BizM every time. If BizM's real E109
 * DuplicatedMsgId semantics do what their name implies, this gives the
 * provider itself a second, independent line of defense against a genuine
 * double-send (e.g. a timeout where our own side never learned whether the
 * first attempt actually landed) on top of this store's own dedup_key
 * check -- see messagingStore.js's module doc comment.
 *
 * Channel is included (independent-review finding, this cycle) so that a
 * same-attempt fallback to a different channel -- were BizM's SMS/LMS
 * fallback ever wired up, see "Channel scope" below -- gets a DIFFERENT
 * msgId from the primary Alimtalk attempt it followed. Without this, a
 * fallback send would present the identical msgId as the primary send that
 * just failed, and a real E109 DuplicatedMsgId check would then reject the
 * fallback as a duplicate of an attempt that never actually delivered --
 * defeating the fallback's entire purpose. Not reachable today (BizM
 * FALLBACK_CHANNEL is empty, see below), but fixed now so it cannot bite
 * silently later.
 *
 * Never derived from anything patient-identifying (only message_id, an
 * opaque server-minted id already used everywhere else in this store, and
 * channel, a fixed enum value).
 */
function deriveBizmMsgId(messageId, channel) {
  return createHash('sha256').update(`${messageId}:${channel}`, 'utf8').digest('hex').slice(0, 20)
}

// Owner-review finding (HIGH, this cycle): the approved template's patient
// capability lives in a BUTTON, not inline message text -- BizM's own
// result codes (E124 InvalidButtonJsonObject, K108 button/template
// mismatch) and round-3's corroborating evidence (button1 as
// `{name, type:'WL', url_mobile, [url_pc]}`) both confirm a per-request
// button object is part of the real contract. This file previously sent NO
// button field at all, only `variables.followup_token`, on the unconfirmed
// assumption that BizM would substitute that into a registered button
// template on its own -- unsupported by any first-party evidence. Fixed:
// the button URL (the SAME one-time follow-up `link` this record's
// follow_up_token_hash is a hash of -- see messagingStore.js's attemptSend
// doc comment on why `link` is threaded here separately from `text`) is now
// rendered directly into `button1.url_mobile`/`url_pc`, and `variables` is
// no longer sent at all (see below) -- so the real one-time URL, not an
// unverified substitution mechanism, is what the button actually carries.
const BIZM_BUTTON_NAME = '상태 확인하기' // owner-confirmed exact button label
const BIZM_BUTTON_TYPE = 'WL' // round-3 corroborated (still not first-party verified) -- "Web Link"

// Owner-review finding (HIGH, this cycle): the message body itself must
// match the APPROVED TEMPLATE'S fixed wording, not embed the raw one-time
// URL inline -- the URL now belongs exclusively in button1 (see above), and
// a K105 template/message mismatch is a real, named BizM result code for
// exactly this kind of drift. The caller's own shared `text` (built by
// server/index.js's buildRevisitMessageText, which DOES embed the link
// inline -- correct for a plain SMS/LMS fallback with no button UI element,
// but wrong for an Alimtalk send with a registered button) is therefore
// deliberately NOT used for BizM's own `msg` field; this adapter renders
// its own static, link-free, privacy-minimal text instead. This exact
// wording is still NOT the verified approved template text (that requires
// the owner's own BizM template-registration UI, which this adapter cannot
// reach) -- it is a structurally-correct placeholder (references the
// button, contains no raw URL/patient-identifying content) that must be
// reconciled with the real approved template text once known, same
// fail-closed posture as every other unverified field in this file.
const BIZM_MESSAGE_TEXT = '[삼인당한의원] 재진 확인 문진 안내\n아래 버튼을 눌러 몇 가지만 답해 주세요.'

// Owner-review finding (HIGH, this cycle): BizM's own result-code table
// names failures like K105/K108/E1xx that can accompany an HTTP 200 --
// this adapter previously treated ANY 2xx response carrying a
// providerMessageId-shaped field as success, with no check at all for a
// provider-level failure code in the same response. A real send returning
// HTTP 200 with a K108 button-mismatch failure would have been silently
// recorded as SENT. This pattern (`[A-Z]\d{3}`, matching the exact shape of
// every code this file's header documents: E100-E125, K105, K108) flags
// any response field that LOOKS like one of BizM's own named result codes
// as a failure, without needing to know the specific SUCCESS code's exact
// value (also unconfirmed) -- a targeted, evidence-consistent check, not an
// arbitrary invented sentinel.
const BIZM_RESULT_FAILURE_CODE_RE = /^[A-Z]\d{3}$/

/**
 * Live BizM transport. STILL NOT VERIFIED -- see this file's header for
 * exactly which parts are owner/result-code-evidence-backed vs still a
 * guess. Sends only KAKAO_ALIMTALK; any other channel is refused before
 * ever reaching the network (see this file's header on why SMS/LMS is out
 * of scope here despite BizM's API surface having fields for it).
 */
function createLiveBizmTransport({ apiKey, senderKey, userId, templateCode }) {
  async function send({ to, channel, link, messageId }) {
    if (channel !== 'KAKAO_ALIMTALK') {
      return { ok: false, errorCode: 'bizm_channel_unverified', retryable: false, fallbackEligible: false }
    }
    // Independent-review finding (LOW): deriveBizmMsgId hashes messageId
    // unconditionally -- a caller that omitted it (there is none today;
    // messagingStore.js's attemptSend always supplies its own message_id)
    // would previously throw inside node:crypto, escaping this function
    // uncaught. Fail closed explicitly instead, so a future caller mistake
    // becomes an ordinary non-retryable send failure (the record surfaces
    // as FAILED with a diagnosable error_code) rather than an uncaught
    // exception that could leave a MessageRecord stuck in SENDING forever
    // (see messagingStore.js's attemptSend -- it writes SENDING before
    // calling send(), and only a normal return value, never a thrown
    // exception, is what lets it record a terminal outcome).
    if (!messageId) {
      return { ok: false, errorCode: 'bizm_missing_message_id', retryable: false, fallbackEligible: false }
    }
    // Owner-review finding (HIGH): fail closed the same way for a missing
    // `link` -- without it there is no URL to put in button1 at all, and a
    // send with no capability URL delivered would be strictly worse than
    // not sending (the patient gets a message that looks legitimate but
    // whose button goes nowhere useful, or K108-fails at the provider).
    if (!link) {
      return { ok: false, errorCode: 'bizm_missing_link', retryable: false, fallbackEligible: false }
    }
    // Body shape per this file's header, rounds 2-3: a JSON ARRAY (E100
    // InvalidJsonArray) of exactly one message object here (this adapter
    // sends one recipient per call; BizM's array wrapping may exist to
    // support bulk sends in one request, which this store never needs).
    // Field key spellings (`profile`/`tmplId`/`msg`/`msgId`/`phn`/
    // `button1`) follow round 3's corroborated (still NOT verified) shape
    // -- see header. `message_type` is sent because a field by that name is
    // corroborated to exist, but 'AT' (a common "Alimtalk Text" convention
    // across similar Korean bulk-messaging APIs) has ZERO corroborating
    // evidence of being the CORRECT value for BizM specifically -- this is
    // the single least-confident guess in this entire payload, more than
    // any other field here. `msg` is BizM's own static, link-free text (see
    // BIZM_MESSAGE_TEXT above) -- never the caller's shared `text`.
    // `variables` is deliberately NOT sent at all (owner-review finding,
    // this cycle): round 1's assumption that BizM auto-substitutes a
    // `variables` map into a registered button URL has no first-party
    // support, and round 3's corroborating evidence shows the button URL
    // is instead constructed directly per-request in `button1` -- sending
    // an undocumented field as though it were part of the verified request
    // shape would misrepresent how confident this adapter actually is.
    const item = {
      message_type: 'AT',
      profile: senderKey,
      tmplId: templateCode,
      phn: to,
      msg: BIZM_MESSAGE_TEXT,
      msgId: deriveBizmMsgId(messageId, channel),
      button1: {
        name: BIZM_BUTTON_NAME,
        type: BIZM_BUTTON_TYPE,
        // The raw one-time capability URL belongs ONLY here -- never in
        // `msg`, never in `msgId` (see deriveBizmMsgId, which only ever
        // hashes messageId+channel), never logged, never persisted.
        url_mobile: link,
        url_pc: link,
      },
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
    // this tries both rather than asserting one.
    const first = Array.isArray(json) ? json[0] : json
    // Owner-review finding (HIGH): check for a provider-level failure code
    // BEFORE trusting a providerMessageId-shaped field -- HTTP 2xx alone
    // must never count as success on its own. Candidate result-code field
    // names try the most plausible ones in order, same pattern as the id
    // field lookup below.
    const resultCode = first?.code ?? first?.result ?? first?.resultCode ?? first?.result_code ?? null
    if (BIZM_RESULT_FAILURE_CODE_RE.test(String(resultCode ?? ''))) {
      // Template/button-mismatch-shaped codes (K1xx) are configuration
      // errors, not transient conditions -- never retryable. Generic E1xx
      // codes are treated the same way here since none of them (per this
      // file's header) describe a rate-limit/timeout condition; a real
      // 429/5xx is already handled above via HTTP status, independent of
      // this body-level check.
      return { ok: false, errorCode: `provider_result_${resultCode}`, retryable: false, fallbackEligible: false }
    }
    // Candidate id field names, since the real shape is unverified.
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
 *  confirmed -- even though rounds 2-3's evidence confirms BizM's API
 *  surface DOES have SMS-fallback fields (result codes E107/E120/E125, and
 *  round 3's `smsKind`/`msgSms`/`smsSender` request fields); see header. */
export const FALLBACK_CHANNEL = {}
