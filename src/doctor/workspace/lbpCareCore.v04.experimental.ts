/*
 * EXPERIMENTAL / DRAFT ONLY — NOT PRODUCTION CLINICAL LOGIC.
 *
 * v0.4 is a CORE REDUCTION projection over the v0.3 research engine.
 *
 * Goal:
 * - keep Decision Key / tranche / sufficiency / freshness machinery available
 *   as a research/reference layer;
 * - prevent those concepts from becoming mandatory product/runtime concepts;
 * - expose only the minimum care-management contract needed by a primary-care
 *   Doctor UI and downstream workflow.
 *
 * This module DOES NOT introduce new clinical mappings. It only compresses the
 * already-computed experimental state into a smaller public contract.
 */
import {
  evaluateLbpActionAdaptiveExperimentV03,
  type LbpActionContextV03,
  type LbpDecisionCheckV03,
} from './lbpActionAdaptiveEngine.v03.experimental'

export type LbpCareCoreState =
  | 'SAFETY_REVIEW_FIRST'
  | 'SAFETY_REFRESH_FIRST'
  | 'CHECKS_NEEDED'
  | 'READY_TO_MANAGE'

export type LbpCareCoreCheck = {
  id: string
  titleKo: string
  reasonKo: string
  priority: 'BLOCKING' | 'HIGH' | 'ROUTINE'
  requestedByClinician: boolean
}

export type LbpCareCoreDeferredItem = {
  id: string
  titleKo: string
  state: 'DEFERRED' | 'NOT_NEEDED_TODAY'
  reasonKo: string
}

export interface LbpCareCoreOutput {
  ruleStatus: 'DRAFT_EXPERIMENTAL'
  state: LbpCareCoreState
  canProceedWithManagement: boolean
  treatmentFinalizationRequiresClinicianReview: boolean

  /** Only checks the clinician should see now. */
  checksNow: LbpCareCoreCheck[]

  /**
   * Explicit clinical debt. These are not NORMAL/NEGATIVE; they remain
   * unresolved and may be reopened by future non-response, worsening, new cue,
   * or clinician concern.
   */
  unresolvedLater: LbpCareCoreDeferredItem[]

  /** Management outputs already supported by the experimental engine. */
  actionTags: string[]

  reassessment: {
    currentPlanNeedsReview: boolean
    reasonKo: string | null
  }

  warningsKo: string[]
  clinicianOverrideAvailable: true

  /**
   * Research-layer metadata is intentionally not exposed here:
   * Decision Keys, decision roles, tranche strategy, sufficiency internals,
   * and freshness bookkeeping stay behind this projection.
   */
  contractVersion: 'LBP_CARE_CORE_V0_4'
}

function asCoreCheck(check: LbpDecisionCheckV03): LbpCareCoreCheck {
  return {
    id: check.id,
    titleKo: check.titleKo,
    reasonKo: check.reasonKo,
    priority: check.priority,
    requestedByClinician: check.requestedByClinician,
  }
}

function deriveState(
  routinePathway: 'AVAILABLE' | 'SAFETY_REVIEW_FIRST' | 'SAFETY_REFRESH_FIRST',
  checkCount: number,
): LbpCareCoreState {
  if (routinePathway === 'SAFETY_REVIEW_FIRST') return 'SAFETY_REVIEW_FIRST'
  if (routinePathway === 'SAFETY_REFRESH_FIRST') return 'SAFETY_REFRESH_FIRST'
  if (checkCount > 0) return 'CHECKS_NEEDED'
  return 'READY_TO_MANAGE'
}

function reassessmentState(context: LbpActionContextV03): {
  currentPlanNeedsReview: boolean
  reasonKo: string | null
} {
  if (context.followUp.trajectory === 'DETERIORATING') {
    return {
      currentPlanNeedsReview: true,
      reasonKo: '증상 악화가 보고되어 기존 관리계획을 그대로 유지하기보다 안전성과 현재 전략을 다시 검토해야 합니다.',
    }
  }

  if (
    context.followUp.trajectory === 'NO_MEANINGFUL_CHANGE' &&
    context.followUp.exposure === 'ADEQUATE'
  ) {
    return {
      currentPlanNeedsReview: true,
      reasonKo: '충분한 치료·운동 노출 뒤 의미 있는 변화가 없어 현재 가설·치료 타깃·재활전략의 재평가가 필요합니다.',
    }
  }

  return { currentPlanNeedsReview: false, reasonKo: null }
}

export function evaluateLbpCareCoreExperimentV04(
  context: LbpActionContextV03,
): LbpCareCoreOutput {
  const research = evaluateLbpActionAdaptiveExperimentV03(context)
  const checksNow = research.checks.map(asCoreCheck)
  const state = deriveState(research.routinePathway, checksNow.length)

  const unresolvedLater: LbpCareCoreDeferredItem[] = [
    ...research.deferredChecks.map((item) => ({
      id: item.id,
      titleKo: item.titleKo,
      state: 'DEFERRED' as const,
      reasonKo: item.dispositionReasonKo,
    })),
    ...research.notNeededTodayChecks.map((item) => ({
      id: item.id,
      titleKo: item.titleKo,
      state: 'NOT_NEEDED_TODAY' as const,
      reasonKo: item.dispositionReasonKo,
    })),
  ]

  const warningsKo = [
    ...research.invariantWarningsKo,
    ...research.freshnessWarningsKo,
    ...research.consistencyWarningsKo,
  ].filter((value, index, values) => values.indexOf(value) === index)

  return {
    ruleStatus: 'DRAFT_EXPERIMENTAL',
    state,
    canProceedWithManagement: state === 'READY_TO_MANAGE',
    treatmentFinalizationRequiresClinicianReview:
      research.treatmentFinalizationRequiresClinicianReview,
    checksNow,
    unresolvedLater,
    actionTags: [...research.actionTags],
    reassessment: reassessmentState(context),
    warningsKo,
    clinicianOverrideAvailable: true,
    contractVersion: 'LBP_CARE_CORE_V0_4',
  }
}
