/*
 * EXPERIMENTAL / DRAFT ONLY — NOT PRODUCTION CLINICAL LOGIC.
 *
 * v0.3 stress-tests Decision Sufficiency without silently inventing the
 * clinical rule that declares a patient "sufficiently explained".
 *
 * Principle under test:
 * - candidate generation remains v0.2 / v0.1 controlled;
 * - a previously deferred candidate is NOT automatically opened just because
 *   it still exists;
 * - after the current decision tranche is resolved, a separate sufficiency
 *   state decides whether optional refinements are still needed today;
 * - SAFETY / foundational functional decisions and clinician-requested checks
 *   are never suppressed by a sufficiency shortcut;
 * - "not needed today" is explicit, not converted to NORMAL / NEGATIVE;
 * - sufficiency itself is visit-scoped and is invalidated by adequate
 *   non-response or a newly unresolved foundational decision.
 *
 * IMPORTANT: managementSufficiency is deliberately supplied by the caller in
 * this experiment. No clinical mapping from exam results -> SUFFICIENT is
 * encoded here. That mapping requires explicit clinician approval later.
 */
import {
  evaluateLbpActionAdaptiveExperimentV02,
  type LbpActionContextV02,
  type LbpActionEngineOutputV02,
  type LbpDecisionCheck,
  type LbpDecisionKey,
} from './lbpActionAdaptiveEngine.v02.experimental'

export type ManagementSufficiencyStatus =
  | 'NOT_ASSESSED'
  | 'SUFFICIENT_FOR_TODAY'
  | 'INSUFFICIENT_FOR_TODAY'
  | 'UNCERTAIN'

export type SufficiencyFreshness = 'CURRENT_VISIT' | 'PRIOR_VISIT' | 'UNKNOWN'

export interface ManagementSufficiencyAssessment {
  status: ManagementSufficiencyStatus
  freshness?: SufficiencyFreshness
  /** Decision Keys already resolved before this sufficiency judgement. */
  assessedAfterDecisionKeys?: LbpDecisionKey[]
  /** Human-readable audit reason; optional in synthetic fixtures. */
  reasonKo?: string
}

export interface LbpActionContextV03 extends LbpActionContextV02 {
  managementSufficiency?: ManagementSufficiencyAssessment
}

export type DecisionRole =
  | 'FOUNDATIONAL'
  | 'OPTIONAL_REFINEMENT'
  | 'CLINICIAN_REQUESTED'
  | 'BLOCKING'

export interface LbpDecisionCheckV03 extends LbpDecisionCheck {
  decisionRole: DecisionRole
}

export interface LbpNotNeededTodayCheck extends LbpDecisionCheckV03 {
  disposition: 'NOT_NEEDED_TODAY'
  dispositionReasonKo: string
}

export interface LbpDeferredCheckV03 extends LbpDecisionCheckV03 {
  disposition: 'DEFERRED_PENDING_SUFFICIENCY'
  dispositionReasonKo: string
}

export interface LbpActionEngineOutputV03
  extends Omit<LbpActionEngineOutputV02, 'checks' | 'deferredChecks' | 'allCandidateChecks' | 'scheduling'> {
  checks: LbpDecisionCheckV03[]
  deferredChecks: LbpDeferredCheckV03[]
  notNeededTodayChecks: LbpNotNeededTodayCheck[]
  allCandidateChecks: LbpDecisionCheckV03[]
  sufficiency: {
    requestedStatus: ManagementSufficiencyStatus
    effectiveStatus: ManagementSufficiencyStatus
    freshness: SufficiencyFreshness
    assessmentIsClinicalRule: false
    suppressionAllowed: boolean
    reasonKo: string
    warningsKo: string[]
    assessedAfterDecisionKeys: LbpDecisionKey[]
  }
  scheduling: {
    strategy: 'DECISION_SUFFICIENCY_V0_3'
    automaticPresentationBudget: 3
    budgetIsClinicalHardCap: false
    currentDecisionKeys: LbpDecisionKey[]
    deferredDecisionKeys: LbpDecisionKey[]
    notNeededTodayDecisionKeys: LbpDecisionKey[]
  }
}

/**
 * These roles are product-architecture hypotheses, not production clinical
 * semantics. Foundational means the decision is a baseline/gate needed to make
 * the visit interpretable; optional refinement means it can legitimately remain
 * unresolved if today's management is already sufficient.
 */
const FOUNDATIONAL_KEYS = new Set<LbpDecisionKey>([
  'NEURO_PATHWAY_NEEDED',
  'OBJECTIVE_NEURO_BASELINE',
  'WALKING_FUNCTION_BASELINE',
  'TARGET_FUNCTION_DEFINED',
  'TARGET_FUNCTION_REPRODUCTION',
])

function roleFor(check: LbpDecisionCheck): DecisionRole {
  if (check.priority === 'BLOCKING') return 'BLOCKING'
  if (check.requestedByClinician) return 'CLINICIAN_REQUESTED'
  if (FOUNDATIONAL_KEYS.has(check.decisionKey)) return 'FOUNDATIONAL'
  return 'OPTIONAL_REFINEMENT'
}

function withRole(check: LbpDecisionCheck): LbpDecisionCheckV03 {
  return { ...check, decisionRole: roleFor(check) }
}

function isMandatoryNow(check: LbpDecisionCheckV03): boolean {
  return (
    check.decisionRole === 'BLOCKING' ||
    check.decisionRole === 'CLINICIAN_REQUESTED' ||
    check.decisionRole === 'FOUNDATIONAL'
  )
}

function normalizedSufficiency(context: LbpActionContextV03): ManagementSufficiencyAssessment {
  return context.managementSufficiency ?? {
    status: 'NOT_ASSESSED',
    freshness: 'UNKNOWN',
    assessedAfterDecisionKeys: [],
  }
}

function resolveEffectiveSufficiency(
  context: LbpActionContextV03,
  requested: ManagementSufficiencyAssessment,
): {
  effectiveStatus: ManagementSufficiencyStatus
  freshness: SufficiencyFreshness
  suppressionAllowed: boolean
  warningsKo: string[]
} {
  const warningsKo: string[] = []
  const freshness = requested.freshness ?? 'UNKNOWN'
  const assessedAfter = requested.assessedAfterDecisionKeys ?? []
  const adequateNonResponse =
    context.followUp.trajectory === 'NO_MEANINGFUL_CHANGE' && context.followUp.exposure === 'ADEQUATE'

  if (requested.status !== 'SUFFICIENT_FOR_TODAY') {
    return {
      effectiveStatus: requested.status,
      freshness,
      suppressionAllowed: false,
      warningsKo,
    }
  }

  if (freshness !== 'CURRENT_VISIT') {
    warningsKo.push('관리전략 충분성 판정이 CURRENT_VISIT provenance가 아니므로 선택적 검사를 억제하는 근거로 사용하지 않습니다.')
    return {
      effectiveStatus: 'UNCERTAIN',
      freshness,
      suppressionAllowed: false,
      warningsKo,
    }
  }

  if (assessedAfter.length === 0) {
    warningsKo.push('SUFFICIENT_FOR_TODAY가 어떤 Decision Key 해결 뒤에 판단됐는지 기록이 없어 선택적 검사를 억제하지 않습니다.')
    return {
      effectiveStatus: 'UNCERTAIN',
      freshness,
      suppressionAllowed: false,
      warningsKo,
    }
  }

  if (adequateNonResponse) {
    warningsKo.push('충분한 치료/운동 노출 뒤 의미 있는 변화가 없어 이전의 "오늘 충분함" 판단을 무효화하고 재평가 후보를 다시 엽니다.')
    return {
      effectiveStatus: 'INSUFFICIENT_FOR_TODAY',
      freshness,
      suppressionAllowed: false,
      warningsKo,
    }
  }

  return {
    effectiveStatus: 'SUFFICIENT_FOR_TODAY',
    freshness,
    suppressionAllowed: true,
    warningsKo,
  }
}

function stageWithSufficiency(
  candidates: LbpDecisionCheckV03[],
  effectiveStatus: ManagementSufficiencyStatus,
  suppressionAllowed: boolean,
): {
  current: LbpDecisionCheckV03[]
  deferred: LbpDeferredCheckV03[]
  notNeededToday: LbpNotNeededTodayCheck[]
} {
  const current: LbpDecisionCheckV03[] = []
  const deferred: LbpDeferredDecisionCheckV03[] = []
  const notNeededToday: LbpNotNeededTodayCheck[] = []

  const unique = candidates.filter(
    (candidate, index, items) => items.findIndex((item) => item.decisionKey === candidate.decisionKey) === index,
  )

  const mandatory = unique.filter(isMandatoryNow)
  const optional = unique.filter((candidate) => !isMandatoryNow(candidate))

  // Mandatory decisions are not hidden by sufficiency or presentation budget.
  for (const candidate of mandatory) current.push(candidate)

  if (effectiveStatus === 'SUFFICIENT_FOR_TODAY' && suppressionAllowed) {
    for (const candidate of optional) {
      notNeededToday.push({
        ...candidate,
        disposition: 'NOT_NEEDED_TODAY',
        dispositionReasonKo:
          '현재 방문의 안전·기능·관리전략이 충분하다고 별도로 판단되어, 이 선택적 refinement는 정상/음성으로 간주하지 않고 오늘은 추가 확인하지 않습니다. 향후 비반응·악화·새 단서·원장 우려가 생기면 다시 열 수 있습니다.',
      })
    }
    return { current, deferred, notNeededToday }
  }

  // If management is not yet sufficient (or sufficiency is unknown), expose
  // optional refinements progressively. We preserve the v0.2 cognitive budget
  // for automatic suggestions, but do not pretend the budget itself is a
  // clinical omission rule.
  for (const candidate of optional) {
    if (current.length < 3 || candidate.requestedByClinician) {
      current.push(candidate)
    } else {
      deferred.push({
        ...candidate,
        disposition: 'DEFERRED_PENDING_SUFFICIENCY',
        dispositionReasonKo:
          '현재 우선 Decision Key를 먼저 해결한 뒤 관리전략이 충분한지 재판단합니다. 충분하면 오늘은 열지 않고, 불충분하면 다음 확인 후보로 유지합니다.',
      })
    }
  }

  return { current, deferred, notNeededToday }
}

export function evaluateLbpActionAdaptiveExperimentV03(
  context: LbpActionContextV03,
): LbpActionEngineOutputV03 {
  const v02 = evaluateLbpActionAdaptiveExperimentV02(context)
  const requestedSufficiency = normalizedSufficiency(context)
  const effective = resolveEffectiveSufficiency(context, requestedSufficiency)
  const candidates = v02.allCandidateChecks.map(withRole)
  const assessedAfterDecisionKeys = requestedSufficiency.assessedAfterDecisionKeys ?? []
  const assessedAfterSet = new Set(assessedAfterDecisionKeys)

  let effectiveStatus = effective.effectiveStatus
  let suppressionAllowed = effective.suppressionAllowed
  const sufficiencyWarningsKo = [...effective.warningsKo]

  if (suppressionAllowed) {
    const newlyUnresolvedFoundational = candidates.filter(
      (candidate) =>
        (candidate.decisionRole === 'FOUNDATIONAL' || candidate.decisionRole === 'BLOCKING') &&
        !assessedAfterSet.has(candidate.decisionKey),
    )
    if (newlyUnresolvedFoundational.length > 0) {
      suppressionAllowed = false
      effectiveStatus = 'UNCERTAIN'
      sufficiencyWarningsKo.push(
        `충분성 판정 이후 새로 미해결된 foundational Decision Key가 있습니다: ${newlyUnresolvedFoundational
          .map((item) => item.decisionKey)
          .join(', ')}. 이 결정을 먼저 확인하기 전에는 선택적 검사를 억제하지 않습니다.`,
      )
    }
  }

  const staged = stageWithSufficiency(candidates, effectiveStatus, suppressionAllowed)

  const reasonKo =
    requestedSufficiency.reasonKo ??
    (effectiveStatus === 'SUFFICIENT_FOR_TODAY'
      ? '실험 입력에서 현재 방문 관리전략이 충분한 것으로 표시되었습니다. 이 상태를 만드는 실제 임상 rule은 아직 정의하지 않았습니다.'
      : effectiveStatus === 'INSUFFICIENT_FOR_TODAY'
        ? '현재 방문 관리전략이 아직 충분하지 않은 것으로 취급되어 선택적 refinement를 계속 검토합니다.'
        : effectiveStatus === 'UNCERTAIN'
          ? '관리전략 충분성 자체가 불명확하거나 provenance/새 foundational decision 때문에 선택적 refinement를 자동으로 폐기하지 않습니다.'
          : '관리전략 충분성을 아직 평가하지 않았습니다.')

  return {
    ...v02,
    checks: staged.current,
    deferredChecks: staged.deferred,
    notNeededTodayChecks: staged.notNeededToday,
    allCandidateChecks: candidates,
    sufficiency: {
      requestedStatus: requestedSufficiency.status,
      effectiveStatus,
      freshness: effective.freshness,
      assessmentIsClinicalRule: false,
      suppressionAllowed,
      reasonKo,
      warningsKo: sufficiencyWarningsKo,
      assessedAfterDecisionKeys,
    },
    invariantWarningsKo: [...v02.invariantWarningsKo, ...sufficiencyWarningsKo],
    stopRule: {
      satisfied:
        v02.routinePathway !== 'AVAILABLE' ||
        (staged.current.length === 0 && staged.deferred.length === 0),
      reasonKo:
        staged.notNeededToday.length > 0
          ? '현재 방문 관리전략이 충분하다고 별도 판단되어 선택적 refinement를 오늘은 더 열지 않습니다. 미평가 상태는 보존되며 비반응·악화·새 단서·원장 override에서 재개방할 수 있습니다.'
          : staged.deferred.length > 0
            ? '현재 Decision Key를 먼저 해결한 뒤 sufficiency를 다시 판단합니다. 단순히 후보가 남았다는 이유만으로 다음 검사를 자동 연쇄하지 않습니다.'
            : v02.stopRule.reasonKo,
    },
    scheduling: {
      strategy: 'DECISION_SUFFICIENCY_V0_3',
      automaticPresentationBudget: 3,
      budgetIsClinicalHardCap: false,
      currentDecisionKeys: staged.current.map((item) => item.decisionKey),
      deferredDecisionKeys: staged.deferred.map((item) => item.decisionKey),
      notNeededTodayDecisionKeys: staged.notNeededToday.map((item) => item.decisionKey),
    },
  }
}
