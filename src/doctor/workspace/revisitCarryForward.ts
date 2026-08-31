/**
 * Routine-revisit carry-forward (round 9, split by provenance in round 10).
 *
 * A routine revisit is supposed to take a clinician seconds, not a full
 * re-typing of yesterday's judgment. This module turns the LATEST prior
 * visit's own clinician-authored text into a *suggestion* that today's
 * revisit workspace can adopt -- but only when the clinician explicitly
 * clicks to adopt it.
 *
 * Four hard rules, all enforced here rather than left to the UI:
 *
 * 1. NOTHING is auto-applied. Every function below is pure: it takes the
 *    current state and returns a new one. RevisitWorkspace calls them from
 *    a button handler and nowhere else, so a carried-forward value only
 *    ever exists because a clinician chose it.
 *
 * 2. EACH ACTION WRITES EXACTLY WHAT ITS LABEL SAYS (round 10 review fix).
 *    The first version carried the WHOLE prior `PainFinalAssessment` under
 *    a button labelled 이전 판단 유지 -- which also authored today's
 *    "시행/예정 처치" and "즉시 재검 대상". A clinician could therefore
 *    create a treatment record by clicking something that reads as
 *    affirming a judgment. The source is now split along the same line the
 *    labels draw:
 *      - `judgment`       -> 이전 판단 유지        (최종 임상 판단, 치료 초점)
 *      - `treatmentPlan`  -> 이전 처치·관리계획 유지 (시행/예정 처치,
 *                            즉시 재검 대상, and the whole Care Plan)
 *    The two field groups live in different objects on disk
 *    (`finalAssessment` vs `carePlan`), which is why `treatmentPlan`
 *    reaches into both -- it follows the meaning, not the storage shape.
 *
 * 3. OBJECTIVE FINDINGS ARE NEVER CARRIED. Structured Reassessment items,
 *    exam results, and a Follow-up Target's prior `baseline`/
 *    `postTreatmentValue` measurements are all deliberately absent from
 *    every function here. Those describe what was true at a previous
 *    visit; reproducing them as today's record would present stale
 *    measurements as fresh ones, which the provenance model forbids.
 *    Carrying a Follow-up Target forward carries only "keep tracking this
 *    thing" (id + label) -- today's values start empty.
 *
 * 4. NO CLINICAL INFERENCE. Nothing here scores, ranks, thresholds, or
 *    reinterprets. The only transformation is a field-name mapping needed
 *    because a submission-backed visit stores Pain and Herbal judgments in
 *    two parallel field sets, while a revisit has ONE generic set (see
 *    visitWorkspace.ts's doc comment -- a data-shape choice, not a
 *    clinical distinction). Where both a Pain and a Herbal counterpart
 *    hold text, both are kept, joined by a newline, so no clinician-authored
 *    text is ever silently dropped on the way across.
 */
import type { FollowUpTarget, PainFinalAssessment } from './finalAssessment'
import { MAX_FOLLOW_UP_TARGETS } from './finalAssessment'
import type { PainCarePlan } from './carePlan'
import { emptyPainCarePlan } from './carePlan'
import type { SubmissionRecord } from '../../lib/serverClient'
import type { VisitWorkspaceState } from './visitWorkspace'
import { deserializeWorkspaceState } from './persistence'

/** What 이전 판단 유지 writes, and nothing else. */
export type CarryForwardJudgment = {
  finalWorkingAssessment: string
  treatmentFocus: string
}

/** What 이전 처치·관리계획 유지 writes, and nothing else. */
export type CarryForwardTreatmentPlan = {
  interventionPerformedOrPlanned: string
  immediateRetestTarget: string
  carePlan: PainCarePlan
}

/**
 * What the latest prior visit offers to carry forward. A null member means
 * "that prior visit recorded nothing under that heading" -- the UI disables
 * the corresponding action rather than offering an empty carry-forward.
 */
export type RevisitCarryForwardSource = {
  judgment: CarryForwardJudgment | null
  treatmentPlan: CarryForwardTreatmentPlan | null
  followUpTargets: FollowUpTarget[]
}

export function emptyCarryForwardSource(): RevisitCarryForwardSource {
  return { judgment: null, treatmentPlan: null, followUpTargets: [] }
}

function joinNonEmpty(parts: (string | null | undefined)[]): string {
  return parts.map((p) => (p ?? '').trim()).filter((p) => p !== '').join('\n')
}

function hasAnyText(values: (string | null | undefined)[]): boolean {
  return values.some((v) => (v ?? '').trim() !== '')
}

/** True when the clinician has not yet written a judgment today. */
export function isJudgmentBlank(value: PainFinalAssessment): boolean {
  return !hasAnyText([value.finalWorkingAssessment, value.treatmentFocus])
}

/**
 * True when the clinician has not yet written anything today under the
 * treatment/plan heading -- checked across BOTH objects the treatment-plan
 * action writes into, so it can never half-overwrite.
 */
export function isTreatmentPlanBlank(value: PainFinalAssessment, carePlan: PainCarePlan): boolean {
  return !hasAnyText([
    value.interventionPerformedOrPlanned,
    value.immediateRetestTarget,
    carePlan.currentTreatmentGoal,
    carePlan.rehabilitationGoal,
    carePlan.homeActionPlan,
    carePlan.activityPrecaution,
    carePlan.patientInstruction,
    carePlan.nextVisitCheckItem,
  ])
}

/**
 * Source built from a SUBMISSION-backed prior visit. Pain and Herbal
 * counterparts are unioned into the revisit's single generic field set --
 * the same union the read-only recap already shows the clinician under one
 * generic label, so nothing new is being asserted here.
 */
export function carryForwardSourceFromSubmission(prior: SubmissionRecord | null): RevisitCarryForwardSource {
  // 15차 독립 리뷰 MEDIUM-1: `prior.workspace`는 인증되지 않은 PUT이 검증
  // 없이 저장한 원본이다 -- 이전에는 이걸 바로 읽어서 `joinNonEmpty`의
  // `(p ?? '').trim()`이 wrong-typed(object) 필드에서 그대로 던졌다(HIGH-1과
  // 동일한 원본 데이터, RevisitWorkspace.tsx의 priorVisitRecapLines와
  // 자매 함수). deserializeWorkspaceState로 먼저 정화한다.
  const ws = prior?.workspace ? deserializeWorkspaceState(prior.workspace) : null
  if (!ws) return emptyCarryForwardSource()

  const pain = ws.painFinalAssessment
  const herbal = ws.herbalFinalAssessment

  const judgment: CarryForwardJudgment = {
    finalWorkingAssessment: joinNonEmpty([pain?.finalWorkingAssessment, herbal?.finalPatternOrMechanism]),
    treatmentFocus: joinNonEmpty([pain?.treatmentFocus, herbal?.treatmentPrinciple]),
  }

  const painPlan = ws.painCarePlan
  const herbalPlan = ws.herbalCarePlan
  const treatmentPlan: CarryForwardTreatmentPlan = {
    interventionPerformedOrPlanned: joinNonEmpty([
      pain?.interventionPerformedOrPlanned,
      herbal?.prescriptionPlanNote,
    ]),
    // Deliberately Pain-only: the Herbal side's `symptomsToTrack` is a
    // list of things to watch over time, not an immediate retest target,
    // so it goes to the care plan's next-visit check instead.
    immediateRetestTarget: joinNonEmpty([pain?.immediateRetestTarget]),
    carePlan: {
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
    },
  }

  return {
    judgment: hasAnyText([judgment.finalWorkingAssessment, judgment.treatmentFocus]) ? judgment : null,
    treatmentPlan: treatmentPlanHasText(treatmentPlan) ? treatmentPlan : null,
    followUpTargets: trackingOnly([...(ws.painFollowUpTargets ?? []), ...(ws.herbalFollowUpTargets ?? [])]),
  }
}

/**
 * Source built from a prior visit that is itself a no-submission revisit.
 * Its workspace is already the same generic shape, so this only has to
 * split the same fields along the same line.
 */
export function carryForwardSourceFromVisitWorkspace(prior: VisitWorkspaceState | null): RevisitCarryForwardSource {
  if (!prior) return emptyCarryForwardSource()
  const judgment: CarryForwardJudgment = {
    finalWorkingAssessment: prior.finalAssessment.finalWorkingAssessment,
    treatmentFocus: prior.finalAssessment.treatmentFocus,
  }
  const treatmentPlan: CarryForwardTreatmentPlan = {
    interventionPerformedOrPlanned: prior.finalAssessment.interventionPerformedOrPlanned,
    immediateRetestTarget: prior.finalAssessment.immediateRetestTarget,
    carePlan: { ...prior.carePlan, recordedAt: null },
  }
  return {
    judgment: hasAnyText([judgment.finalWorkingAssessment, judgment.treatmentFocus]) ? judgment : null,
    treatmentPlan: treatmentPlanHasText(treatmentPlan) ? treatmentPlan : null,
    followUpTargets: trackingOnly(prior.followUpTargets ?? []),
  }
}

function treatmentPlanHasText(value: CarryForwardTreatmentPlan): boolean {
  return hasAnyText([
    value.interventionPerformedOrPlanned,
    value.immediateRetestTarget,
    value.carePlan.currentTreatmentGoal,
    value.carePlan.rehabilitationGoal,
    value.carePlan.homeActionPlan,
    value.carePlan.activityPrecaution,
    value.carePlan.patientInstruction,
    value.carePlan.nextVisitCheckItem,
  ])
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
 * 이전 판단 유지 -- adopt the prior visit's JUDGMENT as today's, stamped
 * with today's time because the clinician is affirming it now. Writes
 * `finalWorkingAssessment` and `treatmentFocus` and nothing else: it can
 * never author today's 시행/예정 처치 or 즉시 재검 대상 (round 10 review
 * fix). Never overwrites text the clinician has already written today --
 * the UI disables the action in that case, and this guard makes that a
 * property of the operation rather than of one call site.
 */
export function applyJudgmentCarryForward(
  state: VisitWorkspaceState,
  source: RevisitCarryForwardSource,
  now: string,
): VisitWorkspaceState {
  if (!source.judgment || !isJudgmentBlank(state.finalAssessment)) return state
  return {
    ...state,
    finalAssessment: {
      ...state.finalAssessment,
      finalWorkingAssessment: source.judgment.finalWorkingAssessment,
      treatmentFocus: source.judgment.treatmentFocus,
      recordedAt: now,
    },
  }
}

/**
 * 이전 처치·관리계획 유지 -- adopt the prior visit's treatment record and
 * management plan. This is the ONLY action that can write today's
 * 시행/예정 처치 / 즉시 재검 대상, alongside the Care Plan they belong
 * with. Both cards get today's timestamp, matching exactly what typing
 * into those same fields does (FinalAssessmentCard/CarePlanCard stamp
 * `recordedAt` on every edit), so a carried value and a typed value are
 * indistinguishable in status terms -- which is the honest outcome, since
 * either way the clinician committed the content by an explicit action.
 */
export function applyTreatmentPlanCarryForward(
  state: VisitWorkspaceState,
  source: RevisitCarryForwardSource,
  now: string,
): VisitWorkspaceState {
  if (!source.treatmentPlan || !isTreatmentPlanBlank(state.finalAssessment, state.carePlan)) return state
  return {
    ...state,
    finalAssessment: {
      ...state.finalAssessment,
      interventionPerformedOrPlanned: source.treatmentPlan.interventionPerformedOrPlanned,
      immediateRetestTarget: source.treatmentPlan.immediateRetestTarget,
      recordedAt: now,
    },
    carePlan: { ...source.treatmentPlan.carePlan, recordedAt: now },
  }
}

/**
 * 기존 Follow-up Target 유지 -- keep tracking the same things. Only
 * applies when today has no targets selected yet, so it can never silently
 * replace a clinician's own choice.
 */
export function applyFollowUpTargetsCarryForward(
  state: VisitWorkspaceState,
  source: RevisitCarryForwardSource,
): VisitWorkspaceState {
  if (source.followUpTargets.length === 0 || state.followUpTargets.length > 0) return state
  return { ...state, followUpTargets: source.followUpTargets.map((t) => ({ ...t })) }
}
