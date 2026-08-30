// Provider-neutral outbound-messaging transport selection.
//
// Two adapters exist: bizmAdapter.js (BizM -- the provider the clinic owner
// has actually selected and is registering a real Kakao Alimtalk template
// with; see its own header for exactly which parts of its wire format are
// verified vs an unverified best-effort guess) and solapiAdapter.js (SOLAPI
// -- the original Quick Revisit scaffold provider, fully built and tested
// via its mock transport, never exercised against a real account, kept as
// non-default legacy/test code rather than deleted -- see its own header).
// Both implement the identical `{ send, state, provider }` transport
// interface messagingStore.js consumes, so switching providers -- or a
// third one later -- never touches messagingStore.js itself, only this one
// selection point.
//
// SAMINDANG_MESSAGING_PROVIDER selects which adapter this file constructs:
// 'solapi' explicitly opts back into the legacy provider (e.g. an existing
// staging environment that already has SOLAPI credentials on file); any
// other value, or unset, resolves to 'bizm' -- the owner's selected
// provider is the default, not an opt-in.
import { resolveBizmProviderState, createBizmTransport, FALLBACK_CHANNEL as BIZM_FALLBACK_CHANNEL } from './bizmAdapter.js'
import {
  resolveSolapiProviderState,
  createSolapiTransport,
  FALLBACK_CHANNEL as SOLAPI_FALLBACK_CHANNEL,
  resolveWebhookSecret,
  signWebhookBody,
  verifyWebhookSignature,
} from './solapiAdapter.js'

export function resolveMessagingProviderName(env = process.env) {
  return env.SAMINDANG_MESSAGING_PROVIDER === 'solapi' ? 'solapi' : 'bizm'
}

/** Delegates to whichever provider is actually selected. NOT a fixed
 *  state set across providers -- SOLAPI's resolveSolapiProviderState only
 *  ever returns PENDING_CREDENTIALS/MOCK/LIVE, while BizM's
 *  resolveBizmProviderState can also return PENDING_CONTRACT (see
 *  bizmAdapter.js's own doc comment on why). Any caller mapping over this
 *  function's return value must handle PENDING_CONTRACT too, not just
 *  assume the three SOLAPI-only states. */
export function resolveMessagingProviderState(env = process.env) {
  return resolveMessagingProviderName(env) === 'solapi' ? resolveSolapiProviderState(env) : resolveBizmProviderState(env)
}

/** Single entry point messagingStore.js's default construction uses --
 *  never picks an adapter directly. */
export function createMessagingTransport(env = process.env) {
  return resolveMessagingProviderName(env) === 'solapi' ? createSolapiTransport(env) : createBizmTransport(env)
}

/** The active provider's own channel-fallback map (e.g. SOLAPI's
 *  `{ KAKAO_ALIMTALK: 'SMS' }`; BizM's is currently empty -- see
 *  bizmAdapter.js's header on why). messagingStore.js reads this once per
 *  store construction rather than importing a single provider's map
 *  directly, so it never needs to know which provider is active. */
export function resolveFallbackChannelMap(env = process.env) {
  return resolveMessagingProviderName(env) === 'solapi' ? SOLAPI_FALLBACK_CHANNEL : BIZM_FALLBACK_CHANNEL
}

/** Same fallback-map lookup as resolveFallbackChannelMap, but keyed off a
 *  transport's own `provider` field (as constructed by createMessagingTransport,
 *  or explicitly injected by a caller/test -- e.g. createMessagingStore's
 *  `{ transport }` option) rather than re-reading process.env. This is what
 *  messagingStore.js actually calls: a custom-`transport` caller (a test
 *  explicitly constructing `createSolapiTransport()` to verify SOLAPI's own
 *  legacy fallback contract, for instance) must get THAT transport's real
 *  fallback map, not whatever provider process.env happens to currently
 *  select -- those two can disagree (e.g. no env vars set resolves to BizM
 *  by default, but a test may still explicitly inject a SOLAPI transport).
 *  BizM-batch independent-review finding (LOW): an unrecognized/missing
 *  provider name used to default to SOLAPI's own (non-empty,
 *  KAKAO_ALIMTALK -> SMS) fallback map -- fail-OPEN for a case that should
 *  fail closed (a caller-supplied transport that never set `.provider` at
 *  all, e.g. a future third adapter or a new test double, would silently
 *  get SOLAPI's fallback behavior attempted against it, sending an SMS via
 *  a transport that may not even implement one). Only a transport that
 *  explicitly identifies itself as `'SOLAPI'` gets SOLAPI's fallback map
 *  now; every other value (including missing/unrecognized) gets the empty
 *  map, matching this file's own BizM-is-the-fail-closed-default posture
 *  elsewhere. Verified this does not change tests/messaging.spec.mjs's
 *  Part 1.5(b) concurrency spy (asserts `fallbackEligible:false`, never
 *  exercises fallback at all) or any other existing assertion. */
export function fallbackChannelMapForProvider(providerName) {
  return providerName === 'SOLAPI' ? SOLAPI_FALLBACK_CHANNEL : BIZM_FALLBACK_CHANNEL
}

// Webhook signature verification is already provider-neutral (this
// server's own HMAC-over-raw-body scheme, independent of whichever real
// callback scheme either provider turns out to use -- see
// solapiAdapter.js's header) -- re-exported here unchanged so callers reach
// it through this generic module rather than a provider-specific one.
export { resolveWebhookSecret, signWebhookBody, verifyWebhookSignature }
