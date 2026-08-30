/**
 * Outbound messaging (Quick Revisit delivery) — non-clinical types shared
 * between the doctor-side client and the server's messagingStore.js.
 *
 * Scope of this round: build the full adapter/interface, mock transport,
 * idempotency/dedup, retry bookkeeping, webhook contract, and CRM-style
 * delivery-state tracking WITHOUT any real provider credentials, real
 * Kakao Alimtalk templates, or an actual live send -- those three remain
 * EXTERNAL CREDENTIAL PENDING (see server/solapiAdapter.js's header). This
 * file only describes the shape of a "did we successfully hand this
 * revisit link to the patient" record; it is not a clinical decision and
 * carries no PAIN_01/Question/showIf semantics.
 *
 * Provider: BizM (비즈엠), the clinic owner's actually-selected messaging
 * provider (see server/bizmAdapter.js's header for exactly which parts of
 * its wire format are verified vs a best-effort unverified guess), Kakao
 * Alimtalk only -- BizM's own SMS/LMS fallback contract is unverified and
 * therefore not wired (see bizmAdapter.js). SOLAPI is kept as a second,
 * non-default provider (server/solapiAdapter.js) whose own SMS/LMS
 * automatic-fallback behavior remains as originally built. See
 * server/messagingTransport.js for how the active provider is selected.
 *
 * `patient_id` here is the same server-minted randomUUID identity concept
 * used throughout this codebase (see server/visitStore.js), matching how
 * src/crm/types.ts names it `patient_uuid` for the same reason -- named to
 * match the existing follow-up-session/revisit vocabulary this feature
 * sits directly on top of (src/doctor/workspace/followUpSession.ts already
 * calls the same concept `patientId`).
 *
 * `version` (optimistic-concurrency guard) and `dedup_key` mirror
 * CrmTask's own fields in src/crm/types.ts for the same reasons documented
 * there -- this is not a new convention, it is reuse of an existing one.
 */

/** Kakao Alimtalk is always tried first; SMS/LMS is the automatic fallback. */
export type MessageChannel = 'KAKAO_ALIMTALK' | 'SMS' | 'LMS'

/** BizM is the selected/default provider; SOLAPI is kept as a second,
 *  non-default provider (see server/messagingTransport.js). A literal union
 *  (not a wider string) keeps a future third provider from being accepted
 *  anywhere this type is used without an explicit code change. */
export type MessageProvider = 'BIZM' | 'SOLAPI'

/**
 * Lifecycle, mirroring CrmTaskStatus's "one written status, no derived
 * duplicate boolean" principle:
 *   QUEUED     -> created, not yet attempted (or waiting for next retry)
 *   SENDING    -> a send attempt is in flight (set immediately before the
 *                 provider call so a crash mid-call is observable as
 *                 SENDING, not silently lost as QUEUED forever)
 *   SENT       -> provider accepted the send (has a provider_message_id);
 *                 does NOT yet mean the handset received it
 *   DELIVERED  -> provider's webhook confirmed handset delivery
 *   FAILED     -> provider rejected the send, or all channels/retries were
 *                 exhausted without a webhook confirmation
 *   CANCELLED  -> a human explicitly cancelled a still-QUEUED message
 *                 before it was ever sent (e.g. patient called the clinic
 *                 back in the meantime)
 */
export type MessageStatus = 'QUEUED' | 'SENDING' | 'SENT' | 'DELIVERED' | 'FAILED' | 'CANCELLED'

/** What this particular message is for. Only one purpose exists today
 *  (handing over a Quick Revisit's follow-up link), kept as an explicit
 *  enum rather than a free string so a future purpose can't be added by
 *  accident at a call site. */
export type MessagePurpose = 'REVISIT_LINK'

export type MessageRecord = {
  message_id: string
  visit_id: string
  patient_id: string
  purpose: MessagePurpose
  /**
   * The follow-up capability token itself is NEVER stored here (matches
   * the existing rule in server/followUpSessionStore.js and
   * server/stationStore.js that a raw one-time capability's plaintext
   * exists only where it is strictly needed). Only a SHA-256 hash is kept,
   * solely so a human reviewing delivery state can confirm "this message
   * corresponds to that issued token" without the record itself being a
   * second place capable of leaking a live capability.
   */
  follow_up_token_hash: string
  channel: MessageChannel
  /** The channel actually used to fall back to, if the primary channel's
   *  attempt failed in a way the adapter classifies as fallback-eligible
   *  (see server/solapiAdapter.js's isFallbackEligible). Null until a
   *  fallback attempt actually happens. */
  fallback_channel: MessageChannel | null
  provider: MessageProvider
  /** Set once the provider accepts the send (status >= SENT). */
  provider_message_id: string | null
  status: MessageStatus
  attempt_count: number
  max_attempts: number
  last_attempt_at: string | null
  /** Null once attempts are exhausted or the message reaches a terminal
   *  status (SENT is not terminal for delivery purposes, but IS terminal
   *  for retry purposes -- a successfully-sent message is never retried
   *  even if delivery confirmation never arrives). */
  next_retry_at: string | null
  /**
   * Idempotency key: deterministic from (visit_id, purpose), NOT
   * time-based, so retrying the exact same logical request (e.g. a
   * doctor double-tapping "빠른 재진 발송" before the first request's
   * response has rendered) reuses the existing QUEUED/SENDING/SENT
   * record instead of creating a second real send. A genuinely new
   * revisit for the same visit_id (a new follow-up-session token) gets a
   * new dedup_key because startRevisit always mints a new visit_id, never
   * reuses one -- see server/store.js's startRevisit.
   */
  dedup_key: string
  created_at: string
  updated_at: string
  version: number
  /** Sanitized machine-readable error class (e.g. "provider_rejected",
   *  "invalid_recipient") -- never a raw provider error string, which
   *  could echo back the phone number or template content. */
  error_code: string | null
}

/** What either provider adapter's transport interface returns for a single
 *  send attempt (see server/messagingTransport.js). Deliberately narrow --
 *  callers only ever branch on `ok` and (on failure) `retryable`; the raw
 *  provider response is never threaded back up to the HTTP layer or the
 *  audit log. */
export type SendResult =
  | { ok: true; providerMessageId: string; channelUsed: MessageChannel }
  | { ok: false; errorCode: string; retryable: boolean; fallbackEligible: boolean }

/** The three states either provider adapter's transport can be in (see
 *  server/bizmAdapter.js's resolveBizmProviderState / solapiAdapter.js's
 *  resolveSolapiProviderState). Mirrors src/crm/types.ts's
 *  ReservationSuppressionState pattern: the schema and logic exist and are
 *  fully exercised end-to-end via MOCK, but nothing can silently reach a
 *  real send without an explicit, deliberate move to LIVE (which
 *  additionally requires real credentials to even construct the live
 *  transport). */
export type MessagingProviderState = 'PENDING_CREDENTIALS' | 'MOCK' | 'LIVE'
