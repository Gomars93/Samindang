/**
 * Longitudinal patient history (round 3 Phase C) — client-side types only.
 * The actual fetch lives in src/lib/serverClient.ts (getPatientHistory),
 * and the server-side computation lives in server/store.js/index.js.
 *
 * This is a RAW-FACTS-ONLY projection: no computed percentage, no
 * "호전/악화" interpretation, no improvement threshold. Each prior visit
 * exposes only what the clinician themselves already recorded that visit
 * (follow-up target baseline/post-treatment values, final assessment free
 * text, the next-reassessment plan they set) — never anything inferred.
 */
import type { FollowUpTarget, NextReassessmentPlan } from './finalAssessment'

export type PriorVisitSummary = {
  visitId: string
  submissionId: string | null
  createdAt: string
  primaryConcern: string | null
  painFollowUpTargets: FollowUpTarget[]
  herbalFollowUpTargets: FollowUpTarget[]
  /**
   * Profile-agnostic union, correct regardless of visit type: pain+herbal
   * concatenated for a submission-backed visit, or the visit's own generic
   * list for a no-submission revisit (round 4 review fix — see
   * server/store.js's getPatientHistory doc comment). Callers that want
   * "whatever this patient's most recently tracked" should read this
   * instead of concatenating painFollowUpTargets/herbalFollowUpTargets
   * themselves.
   */
  followUpTargets: FollowUpTarget[]
  /** Free text as the clinician wrote it — finalWorkingAssessment, or null if never recorded. */
  painFinalAssessmentSummary: string | null
  /** Free text as the clinician wrote it — finalPatternOrMechanism, or null if never recorded. */
  herbalFinalAssessmentSummary: string | null
  nextReassessmentPlan: NextReassessmentPlan | null
}

export type PatientHistoryResult = {
  patientId: string
  /** Most recent first. Never includes the visit currently being viewed. */
  visits: PriorVisitSummary[]
}
