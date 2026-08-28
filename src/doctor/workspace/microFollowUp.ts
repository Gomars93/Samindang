/**
 * Micro Follow-up (round 3 Phase D). A short (30-60s) patient-facing
 * check-in that reuses the PREVIOUS visit's own Follow-up Targets as
 * candidate items -- this file introduces no new "what should we re-ask"
 * rule of its own, it only packages the FollowUpTarget[] the clinician
 * already picked on an earlier visit into up to 3 candidate items, plus a
 * fixed set of always-present short questions (overall change, new
 * symptom, treatment/herbal adverse effect).
 *
 * No clinical branching lives here. A reported new symptom or adverse
 * effect never triggers an automatic safety escalation, threshold, or
 * regional routing change -- it only sets `microFollowUpNeedsAttention()`
 * to true so the clinician sees an "추가 확인 필요" flag at the next visit.
 * What happens next is always the clinician's own judgment call.
 *
 * This file defines the data model. Two separate write paths exist for a
 * MicroFollowUpResponse (server/microFollowUpStore.js + the routes in
 * server/index.js): a doctor/staff session can save one directly (e.g. a
 * clinician noting a check-in over the phone), and -- since round 4 -- the
 * PATIENT's own device can also submit one, through a completely separate,
 * un-doctor-token-gated public route (`GET`/`POST /api/follow-up-session/
 * :token`) reached via `src/screens/FollowUpScreen.tsx`'s `#follow-up=
 * <token>` hash link. That link carries a scoped, single-use capability
 * token (server/followUpSessionStore.js) rather than the doctor token --
 * `src/App.tsx` still never references any doctor-token-gated read from the
 * patient tablet app (enforced by an existing regression test), and
 * `src/lib/followUpClient.ts` structurally cannot import doctorToken.ts/
 * serverClient.ts (also enforced by a regression test) -- so the two paths
 * stay fully separate identity boundaries even though they both end up
 * calling the same `saveResponse`.
 */
import type { FollowUpTarget } from './finalAssessment'

export type MicroFollowUpCandidateItem = {
  id: string
  label: string
  /** The prior visit's own recorded values, carried forward as read-only context -- never re-labeled as if newly computed today. */
  previousBaseline: string
  previousPostTreatmentValue: string
}

/**
 * Built from the previous visit's own FollowUpTarget[] -- caps at 3 per
 * the North Star's "1-3 targets, 30-60s" budget. Keeps the clinician's own
 * prior ordering; does not re-rank or select which targets "matter most".
 */
export function microFollowUpCandidatesFromPriorTargets(prior: FollowUpTarget[]): MicroFollowUpCandidateItem[] {
  return prior.slice(0, 3).map((t) => ({
    id: t.id,
    label: t.label,
    previousBaseline: t.baseline,
    previousPostTreatmentValue: t.postTreatmentValue,
  }))
}

export type MicroFollowUpTargetRating = {
  targetId: string
  label: string
  /** Patient's own short rating for this one target today -- a raw value, same free-text-or-scale shape as the original FollowUpTarget field, never a computed score. */
  patientReportedValue: string
}

export type MicroFollowUpResponse = {
  visit_id: string
  patient_id: string
  targetRatings: MicroFollowUpTargetRating[]
  /** Patient's own short answer -- free text, never inferred. */
  overallChange: string
  newSymptomReported: boolean
  newSymptomNote: string
  adverseEffectReported: boolean
  adverseEffectNote: string
  submitted_at: string
}

export function emptyMicroFollowUpResponse(visitId: string, patientId: string): MicroFollowUpResponse {
  return {
    visit_id: visitId,
    patient_id: patientId,
    targetRatings: [],
    overallChange: '',
    newSymptomReported: false,
    newSymptomNote: '',
    adverseEffectReported: false,
    adverseEffectNote: '',
    submitted_at: '',
  }
}

/**
 * True when anything here needs a clinician's eyes before the next
 * scheduled reassessment -- purely a display flag; it never changes any
 * routing/safety computation and never selects a Safety Mini-Gate question.
 */
export function microFollowUpNeedsAttention(response: MicroFollowUpResponse): boolean {
  return response.newSymptomReported || response.adverseEffectReported
}
