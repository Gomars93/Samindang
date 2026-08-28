/**
 * Routine-revisit carry-forward (round 9 review follow-up).
 *
 * A routine revisit is supposed to take a clinician seconds, not a full
 * re-typing of yesterday's judgment. This module turns the LATEST prior
 * visit's own clinician-authored text into a *suggestion* that today's
 * revisit workspace can adopt -- but only when the clinician explicitly
 * clicks to adopt it.
 *
 * Three hard rules, all enforced here rather than left to the UI:
 *
 * 1. NOTHING is auto-applied. Every function below is pure: it takes the
 *    current state and returns a new one. RevisitWorkspace calls them from
 *    a button handler and nowhere else, so a carried-forward value only
 *    ever exists because a clinician chose it.
 *
 * 2. OBJECTIVE FINDINGS ARE NEVER CARRIED. Structured Reassessment items,
 *    exam results, and a Follow-up Target's prior `baseline`/
 *    `postTreatmentValue` measurements are all deliberately absent from
 *    every function here. Those describe what was true at a previous
 *    visit; reproducing them as today's record would present stale
 *    measurements as fresh ones, which the provenance model forbids.
 *    Carrying a Follow-up Target forward carries only "keep tracking this
 *    thing" (id + label) -- today's values start empty.
 *
 * 3. NO CLINICAL INFERENCE. Nothing here scores, ranks, thresholds, or
 *    reinterprets. The only transformation is a field-name mapping needed
 *    because a submission-backed visit stores Pain and Herbal judgments in
 *    two parallel field sets, while a revisit has ONE generic set (see
 *    visitWorkspace.ts's doc comment -- a data-shape choice, not a
 *    clinical distinction). Where both a Pain and a Herbal counterpart
 *    hold text, both are kept, joined by a newline, so no clinician-authored
 *    text is ever silently dropped on the way across.
 */
import type { FollowUpTarget, PainFinalAssessment } from './finalAssessment'
import { emptyPainFinalAssessment, MAX_FOLLOW_UP_TARGETS } from './finalAssessment'
import type { PainCarePlan } from './carePlan'
import { emptyPainCarePlan } from './carePlan'
import type { SubmissionRecord } from '../../lib/serverClient'
import type { VisitWorkspaceState } from './visitWorkspace'

/**
 * What the latest prior visit offers to carry forward. A null member means
 * "that prior visit recorded nothing here" -- the UI disables the
 * corresponding action rather than offering an empty carry-forward.
 */
export type RevisitCarryForwardSource = {
  finalAssessment: PainFinalAssessment | null
  carePlan: PainCarePlan | null
  followUpTargets: FollowUpTarget[]
}

export function emptyCarryForwardSource(): RevisitCarryForwardSource {
  return { finalAssessment: null, carePlan: null, followUpTargets: [] }
}

function joinNonEmpty(parts: (string | null | undefined)[]): string {
  return parts.map((p) => (p ?? '').trim()).filter((p) => p !== '').join('\n')
}

function hasAnyText(values: string[]): boolean {
  return values.some((v) => v.trim() !== '')
}

/** True when the clinician has not yet written anything into today's assessment. */
export function isFinalAssessmentBlank(value: PainFinalAssessment): boolean {
  return !hasAnyText([
    value.finalWorkingAssessment,
    value.treatmentFocus,
    value.interventionPerformedOrPlanned,
    value.immediateRetestTarget,
  ])
}

/** True when the clinician has not yet written anything into today's care plan. */
export function isCarePlanBlank(value: PainCarePlan): boolean {
  return !hasAnyText([
    value.currentTreatmentGoal,
    value.rehabilitationGoal,
    value.homeActionPlan,
    value.activityPrecaution,
    value.patientInstruction,
    value.nextVisitCheckItem,
  ])
}

/**
 * Source built from a SUBMISSION-backed prior visit. Pain and Herbal
 * counterparts are unioned into the revisit's single generic field set --
 * the same union the read-only recap already shows the clinician under one
 * generic label, so nothing new is being asserted here.
 */
export function carryForwardSourceFromSubmission(prior: SubmissionRecord | null): RevisitCarryForwardSource {
  const ws = prior?.workspace
  if (!ws) return emptyCarryForwardSource()

  const pain = ws.painFinalAssessment
  const herbal = ws.herbalFinalAssessment
  const finalAssessment: PainFinalAssessment = {
    ...emptyPainFinalAssessment(),
    finalWorkingAssessment: joinNonEmpty([pain?.finalWorkingAssessment, herbal?.finalPatternOrMechanism]),
    treatmentFocus: joinNonEmpty([pain?.treatmentFocus, herbal?.treatmentPrinciple]),
    interventionPerformedOrPlanned: joinNonEmpty([pain?.interventionPerformedOrPlanned, herbal?.prescriptionPlanNote]),
    // Deliberately Pain-only: the Herbal side's `symptomsToTrack` is a
    // list of things to watch over time, not an immediate retest target,
    // so it belongs on the care plan's next-visit check instead.
    immediateRetestTarget: joinNonEmpty([pain?.immediateRetestTarget]),
  }

  const painPlan = ws.painCarePlan
  const herbalPlan = ws.herbalCarePlan
  const carePlan: PainCarePlan = {
    ...emptyPainCarePlan(),
    currentTreatmentGoal: joinNonEmpty([painPlan?.currentTreatmentGoal, herbalPlan?.currentManagementGoal]),
    rehabilitationGoal: joinNonEmpty([painPlan?.rehabilitationGoal]),
    homeActionPlan: joinNonEmpty([painPlan?.homeActionPlan, herbalPlan?.homeLifestyleManagement]),
    activityPrecaution: joinNonEmpty([painPlan?.activityPrecaution]),
    // Both Herbal fields here are things the patient is told, which is
    // exactly what this generic field means -- keeping them preserves
    // clinician-authored text that has no closer counterpart.
    patientInstruction: joinNonEmpty([
      painPlan?.patientInstruction,
      herbalPlan?.medicationPlanNote,
      herbalPlan?.adverseEffectContactInstruction,
    ]),
    nextVisitCheckItem: joinNonEmpty([
      painPlan?.nextVisitCheckItem,
      herbal?.symptomsToTrack,
      herbalPlan?.symptomsToObserve,
      herbalPlan?.nextVisitCheckItem,
    ]),
  }

  return {
    finalAssessment: isFinalAssessmentBlank(finalAssessment) ? null : finalAssessment,
    carePlan: isCarePlanBlank(carePlan) ? null : carePlan,
    followUpTargets: trackingOnly([...(ws.painFollowUpTargets ?? []), ...(ws.herbalFollowUpTargets ?? [])]),
  }
}

/**
 * Source built from a prior visit that is itself a no-submission revisit.
 * Its workspace is already the same generic shape, so this is a direct
 * read with no mapping at all.
 */
export function carryForwardSourceFromVisitWorkspace(prior: VisitWorkspaceState | null): RevisitCarryForwardSource {
  if (!prior) return emptyCarryForwardSource()
  return {
    finalAssessment: isFinalAssessmentBlank(prior.finalAssessment)
      ? null
      : { ...prior.finalAssessment, recordedAt: null },
    carePlan: isCarePlanBlank(prior.carePlan) ? null : { ...prior.carePlan, recordedAt: null },
    followUpTargets: trackingOnly(prior.followUpTargets ?? []),
  }
}

/**
 * Strips a Follow-up Target down to "keep tracking this" -- id and label
 * only. The prior visit's `baseline` and `postTreatmentValue` are
 * measurements taken THEN; carrying them into today's record would be
 * exactly the auto-copying of prior objective findings this feature must
 * not do. Duplicate ids (a label tracked on both the Pain and Herbal side)
 * collapse to one entry.
 */
function trackingOnly(targets: FollowUpTarget[]): FollowUpTarget[] {
  const seen = new Set<string>()
  const out: FollowUpTarget[] = []
  for (const t of targets) {
    if (!t || typeof t.id !== 'string' || seen.has(t.id)) continue
    seen.add(t.id)
    out.push({ id: t.id, label: t.label, baseline: '', postTreatmentValue: '' })
    if (out.length >= MAX_FOLLOW_UP_TARGETS) break
  }
  return out
}

/**
 * Adopt the prior visit's judgment as today's, stamped with today's time
 * because the clinician is affirming it now. Never overwrites text the
 * clinician has already written today -- the UI disables the action in
 * that case, and this guard makes that a property of the operation rather
 * than of one call site.
 */
export function applyFinalAssessmentCarryForward(
  state: VisitWorkspaceState,
  source: RevisitCarryForwardSource,
  now: string,
): VisitWorkspaceState {
  if (!source.finalAssessment || !isFinalAssessmentBlank(state.finalAssessment)) return state
  return { ...state, finalAssessment: { ...source.finalAssessment, recordedAt: now } }
}

/** Same contract as applyFinalAssessmentCarryForward, for the care plan. */
export function applyCarePlanCarryForward(
  state: VisitWorkspaceState,
  source: RevisitCarryForwardSource,
  now: string,
): VisitWorkspaceState {
  if (!source.carePlan || !isCarePlanBlank(state.carePlan)) return state
  return { ...state, carePlan: { ...source.carePlan, recordedAt: now } }
}

/**
 * Keep tracking the same things. Only applies when today has no targets
 * selected yet, so it can never silently replace a clinician's own choice.
 */
export function applyFollowUpTargetsCarryForward(
  state: VisitWorkspaceState,
  source: RevisitCarryForwardSource,
): VisitWorkspaceState {
  if (source.followUpTargets.length === 0 || state.followUpTargets.length > 0) return state
  return { ...state, followUpTargets: source.followUpTargets.map((t) => ({ ...t })) }
}
