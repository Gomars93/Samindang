/**
 * CRM v0.3.1 — non-clinical Episode/Task data model (PR #24 CRM round 1).
 * Pure types + constructors, no React, no server, no network. This round
 * ships the schema and its state-transition rules only — no server
 * persistence route and no new UI surface are added (see DECISIONS.md's
 * CRM v0.3.1 entry for why: `NextReassessmentPlan`/Care Plan already have
 * an owning UI, and this round was scoped to the data model + regression
 * suite).
 *
 * `patient_uuid` here is the same identity concept the rest of the
 * codebase calls `patient_id` (a server-minted randomUUID, see
 * server/visitStore.js) — the field is named to match this request's
 * spec verbatim rather than introducing a second identity concept.
 *
 * Two fields exist beyond the request's enumerated "provenance/timing"
 * list, both required by other explicit requirements in the same spec:
 * `version` (optimistic-concurrency guard, required by "stale writes must
 * conflict rather than overwrite") and `dedup_key` (stored so idempotency
 * lookups do not need to recompute it) on CrmTask, and `version` on
 * Episode for the same reason.
 */

export type EpisodeStatus = 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'LOST'

/** REOPENED is an event, not a persistent status — status itself only ever holds one of EpisodeStatus. */
export type EpisodeEventType = 'REOPENED'

export type EpisodeEvent = {
  type: EpisodeEventType
  at: string
}

export type Episode = {
  episode_id: string
  patient_uuid: string
  status: EpisodeStatus
  owner_clinician: string | null
  care_gap: boolean
  reassess_due: boolean
  clinical_review_open: boolean
  safety_review_open: boolean
  created_at: string
  updated_at: string
  events: EpisodeEvent[]
  version: number
}

export function newEpisode(input: {
  episode_id: string
  patient_uuid: string
  owner_clinician: string | null
  now: string
}): Episode {
  return {
    episode_id: input.episode_id,
    patient_uuid: input.patient_uuid,
    status: 'ACTIVE',
    owner_clinician: input.owner_clinician,
    care_gap: false,
    reassess_due: false,
    clinical_review_open: false,
    safety_review_open: false,
    created_at: input.now,
    updated_at: input.now,
    events: [],
    version: 1,
  }
}

export type CrmTaskType = 'ROUTINE' | 'CLINICAL_REVIEW' | 'SAFETY_REVIEW'

export type CrmTaskStatus = 'OPEN' | 'CLAIMED' | 'IN_PROGRESS' | 'DONE' | 'SNOOZED' | 'CANCELLED' | 'SUPERSEDED'

export type CrmReasonCode =
  | 'MEDICATION_START_CHECK'
  | 'MEDICATION_MID_CHECK'
  | 'MEDICATION_END_CHECK'
  | 'REASSESSMENT_DUE'
  | 'CARE_GAP'
  | 'PATIENT_REPORTED_CONCERN'
  | 'CLINICIAN_REVIEW_REQUEST'
  | 'SAFETY_REVIEW_REQUEST'
  | 'REHAB_FOLLOWUP'
  | 'CONTACT_RETRY'
  | 'SIGMA_LOOKUP_FAILURE'

/** IN_PERSON_ONLY forces zero outbound/phone handling — see createCrmTask's do_not_contact. */
export type ContactMode = 'OUTBOUND_ALLOWED' | 'IN_PERSON_ONLY'

export type CrmTask = {
  task_id: string
  patient_uuid: string
  episode_id: string
  task_type: CrmTaskType
  reason_code: CrmReasonCode
  source_type: string | null
  source_id: string | null
  source_event_id: string | null
  source_timestamp: string | null
  created_at: string
  due_at: string | null
  assigned_to: string | null
  owner_clinician: string | null
  status: CrmTaskStatus
  claimed_by: string | null
  claimed_at: string | null
  claim_expires_at: string | null
  first_seen_at: string
  acknowledged_at: string | null
  resolved_at: string | null
  contact_mode: ContactMode
  dedup_key: string
  version: number
}

/**
 * Care Gap reservation suppression stays inactive until Test 0 (live
 * Naver-to-Sigma reservation verification, blocked pending Naver
 * integration) reports VERIFIED. This constant and guard exist so no
 * caller can accidentally treat "the schema has a field for it" as "the
 * feature is on" — see PR #24 Test 0 comments for the live verification
 * status.
 */
export type ReservationSuppressionState = 'PENDING_TEST_0' | 'VERIFIED' | 'DISABLED'

export const RESERVATION_SUPPRESSION_STATE: ReservationSuppressionState = 'PENDING_TEST_0'

export function isReservationSuppressionActive(state: ReservationSuppressionState): boolean {
  return state === 'VERIFIED'
}
