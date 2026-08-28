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
 * OPERATIONAL INTEGRATION REQUIRED (see North Star Phase D / this round's
 * final report): this file defines the data model, and the server carries
 * a doctor-guarded save/read contract for it (server/microFollowUpStore.js
 * + the routes in server/index.js) -- but no patient-facing SCREEN exists
 * to actually deliver these questions on the tablet. Every route on this
 * server (including the ones a Recorder workstation POSTs to) requires the
 * same doctor token; the patient tablet app deliberately never holds one
 * (src/App.tsx never references any doctor-token-gated read, enforced by
 * an existing regression test). Letting the tablet itself submit a
 * MicroFollowUpResponse for a RETURNING patient would require either (a)
 * handing the tablet doctor-token-gated read access it has never had, or
 * (b) inventing a new lookup/URL-token scheme to identify the visit
 * without one -- both are security/product decisions this round is not
 * authorized to make on its own, so the route stays doctor/staff-authenticated
 * only until a human resolves how the tablet safely learns which
 * patient_id/visit_id it is answering for.
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
