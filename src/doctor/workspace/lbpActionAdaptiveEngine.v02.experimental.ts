/*
 * EXPERIMENTAL / DRAFT ONLY — NOT PRODUCTION CLINICAL LOGIC.
 *
 * v0.2 wraps the v0.1 experimental engine to test three product ideas without
 * changing tablet/FROZEN logic or production CDS:
 * 1) clinically distinct Decision Keys instead of coarse management-category dedupe,
 * 2) an explicit current-vs-deferred tranche so complex patients do not receive
 *    every candidate check at once,
 * 3) visit-scoped freshness for NOT_PERFORMED/LIMITED exam states so a prior
 *    visit terminal state cannot silently suppress a current actionable check.
 *
 * No candidate is deleted merely to satisfy the presentation budget. Deferred
 * candidates remain explicit and must be reconsidered after the current tranche
 * is resolved. Clinician-requested checks are never hidden by the automatic
 * tranche budget.
 */
import {
  evaluateLbpActionAdaptiveExperiment,
  type LbpActionCheck,
  type LbpActionContext,
  type LbpActionEngineOutput,
} from './lbpActionAdaptiveEngine.experimental'

export type LbpDecisionKey =
  | 'NEURO_PATHWAY_NEEDED'
  | 'OBJECTIVE_NEURO_BASELINE'
  | 'WALKING_FUNCTION_BASELINE'
  | 'NEURODYNAMIC_RESPONSE'
  | 'TARGET_FUNCTION_DEFINED'
  | 'TARGET_FUNCTION_REPRODUCTION'
  | 'LUMBAR_DIRECTIONAL_RESPONSE'
  | 'HIP_TREATMENT_TARGET'
  | 'SIJ_TREATMENT_TARGET'

export type ExamFreshnessDomain =
  | 'OBJECTIVE_NEURO'
  | 'NEURODYNAMIC'
  | 'LUMBAR_MOVEMENT'
  | 'TARGET_FUNCTION_REPRODUCTION'
  | 'HIP_SCREEN'
  | 'SIJ_SCREEN'

export type ExamResultFreshness = 'CURRENT_VISIT' | 'PRIOR_VISIT' | 'UNKNOWN'

export interface LbpActionContextV02 extends LbpActionContext {
  /**
   * Production wiring must populate this when a terminal state can be carried
   * across visits. Missing freshness on FOLLOW_UP is intentionally treated as
   * UNKNOWN for NOT_PERFORMED/LIMITED and causes re-evaluation rather than stale
   * suppression.
   */
  examResultFreshness?: Partial<Record<ExamFreshnessDomain, ExamResultFreshness>>
}

export interface LbpDecisionCheck extends LbpActionCheck {
  decisionKey: LbpDecisionKey
  requestedByClinician: boolean
}

export interface LbpDeferredDecisionCheck extends LbpDecisionCheck {
  deferReasonKo: string
  reconsiderAfterDecisionKeys: LbpDecisionKey[]
}

export interface LbpActionEngineOutputV02 extends Omit<LbpActionEngineOutput, 'checks'> {
  checks: LbpDecisionCheck[]
  deferredChecks: LbpDeferredDecisionCheck[]
  allCandidateChecks: LbpDecisionCheck[]
  freshnessWarningsKo: string[]
  consistencyWarningsKo: string[]
  scheduling: {
    strategy: 'DECISION_TRANCHE_V0_2'
    automaticPresentationBudget: 3
    budgetIsClinicalHardCap: false
    currentDecisionKeys: LbpDecisionKey[]
    deferredDecisionKeys: LbpDecisionKey[]
  }
}

const CHECK_TO_DECISION_KEY: Record<string, LbpDecisionKey> = {
  LBP_CHECK_CLARIFY_LEG_SYMPTOM: 'NEURO_PATHWAY_NEEDED',
  LBP_CHECK_OBJECTIVE_NEURO_BASELINE: 'OBJECTIVE_NEURO_BASELINE',
  LBP_CHECK_WALKING_TOLERANCE: 'WALKING_FUNCTION_BASELINE',
  LBP_CHECK_NEURODYNAMIC: 'NEURODYNAMIC_RESPONSE',
  LBP_CHECK_DEFINE_TARGET_FUNCTION: 'TARGET_FUNCTION_DEFINED',
  LBP_CHECK_TARGET_FUNCTION_REPRODUCTION: 'TARGET_FUNCTION_REPRODUCTION',
  LBP_CHECK_LUMBAR_MOVEMENT_RESPONSE: 'LUMBAR_DIRECTIONAL_RESPONSE',
  LBP_CHECK_HIP_CONTRIBUTION: 'HIP_TREATMENT_TARGET',
  LBP_CHECK_SIJ_CONTRIBUTION: 'SIJ_TREATMENT_TARGET',
}

const TERMINAL_STATES = new Set(['NOT_PERFORMED', 'LIMITED'])

function requestedByClinician(check: LbpActionCheck): boolean {
  return check.sourceFacts.some((fact) => fact.key === 'clinicianConcernDomains')
}

function decisionKeyFor(check: LbpActionCheck): LbpDecisionKey {
  const key = CHECK_TO_DECISION_KEY[check.id]
  if (!key) {
    throw new Error(`Experimental check ${check.id} has no Decision Key; classify it before allowing it into v0.2.`)
  }
  return key
}

function asDecisionCheck(check: LbpActionCheck): LbpDecisionCheck {
  return {
    ...check,
    decisionKey: decisionKeyFor(check),
    requestedByClinician: requestedByClinician(check),
  }
}

function terminalFreshness(
  context: LbpActionContextV02,
  domain: ExamFreshnessDomain,
  status: string,
  warnings: string[],
): ExamResultFreshness {
  const explicit = context.examResultFreshness?.[domain]
  if (explicit) return explicit
  if (!TERMINAL_STATES.has(status)) return 'CURRENT_VISIT'
  if (context.visitKind !== 'FOLLOW_UP') return 'CURRENT_VISIT'

  warnings.push(
    `${domain}의 ${status} 상태에 방문시점 provenance가 없습니다. 이전 방문 결과가 현재 방문을 영구 억제하지 않도록 UNKNOWN으로 처리해 재평가 대상으로 돌립니다.`,
  )
  return 'UNKNOWN'
}

function normalizeTerminalStatus<T extends string>(
  context: LbpActionContextV02,
  domain: ExamFreshnessDomain,
  status: T,
  warnings: string[],
): T {
  if (!TERMINAL_STATES.has(status)) return status
  const freshness = terminalFreshness(context, domain, status, warnings)
  if (freshness === 'CURRENT_VISIT') return status
  return 'NOT_ASSESSED' as T
}

function normalizeVisitScopedContext(context: LbpActionContextV02): {
  normalized: LbpActionContext
  warnings: string[]
} {
  const warnings: string[] = []
  const normalized: LbpActionContext = {
    ...context,
    clinicianConcernDomains: [...(context.clinicianConcernDomains ?? [])],
    followUp: { ...context.followUp },
    objectiveNeuro: normalizeTerminalStatus(
      context,
      'OBJECTIVE_NEURO',
      context.objectiveNeuro,
      warnings,
    ),
    neurodynamic: normalizeTerminalStatus(
      context,
      'NEURODYNAMIC',
      context.neurodynamic,
      warnings,
    ),
    lumbarMovement: normalizeTerminalStatus(
      context,
      'LUMBAR_MOVEMENT',
      context.lumbarMovement,
      warnings,
    ),
    targetFunctionReproduction: normalizeTerminalStatus(
      context,
      'TARGET_FUNCTION_REPRODUCTION',
      context.targetFunctionReproduction,
      warnings,
    ),
    hipScreen: normalizeTerminalStatus(context, 'HIP_SCREEN', context.hipScreen, warnings),
    sijScreen: normalizeTerminalStatus(context, 'SIJ_SCREEN', context.sijScreen, warnings),
  }
  return { normalized, warnings }
}

function collectConsistencyWarnings(context: LbpActionContextV02): string[] {
  const warnings: string[] = []
  if (context.legSymptoms === 'ABSENT' && context.radicularCue === 'PRESENT') {
    warnings.push('하지증상 ABSENT와 radicularCue PRESENT가 동시에 입력되었습니다. adapter/derived-fact 일관성을 확인해야 합니다.')
  }
  if (context.legSymptoms === 'ABSENT' && context.walkingStandingLegPattern === 'PRESENT') {
    warnings.push('하지증상 ABSENT와 walkingStandingLegPattern PRESENT가 동시에 입력되었습니다. 환자 fact와 derived pattern의 provenance를 확인해야 합니다.')
  }
  if (context.walkingStandingLegPattern !== 'PRESENT' && context.walkingTolerance === 'KNOWN') {
    warnings.push('보행-기립 하지증상 pattern이 PRESENT가 아닌데 walkingTolerance가 KNOWN입니다. 정보 자체는 보존하되 자동으로 신경성 파행 가설로 승격하지 않습니다.')
  }
  return warnings
}

/**
 * This is a presentation/decision tranche, not a clinical omission rule.
 *
 * Rules:
 * - BLOCKING checks are always current.
 * - clinician-requested checks are always current even if this exceeds 3.
 * - remaining automatic candidates are ordered by existing priority and fill a
 *   current-visit cognitive budget of 3.
 * - every unshown automatic candidate remains explicit in deferredChecks.
 * - candidates with different Decision Keys are never deduped merely because
 *   their coarse management categories overlap.
 */
function scheduleDecisionTranche(candidates: LbpDecisionCheck[]): {
  current: LbpDecisionCheck[]
  deferred: LbpDeferredDecisionCheck[]
} {
  const current: LbpDecisionCheck[] = []
  const deferred: LbpDeferredDecisionCheck[] = []
  const seenDecisionKeys = new Set<LbpDecisionKey>()

  const uniqueCandidates = candidates.filter((candidate) => {
    if (seenDecisionKeys.has(candidate.decisionKey)) return false
    seenDecisionKeys.add(candidate.decisionKey)
    return true
  })

  const mandatory = uniqueCandidates.filter(
    (candidate) => candidate.priority === 'BLOCKING' || candidate.requestedByClinician,
  )
  for (const candidate of mandatory) current.push(candidate)

  const automatic = uniqueCandidates.filter(
    (candidate) => candidate.priority !== 'BLOCKING' && !candidate.requestedByClinician,
  )

  for (const candidate of automatic) {
    if (current.length < 3) {
      current.push(candidate)
      continue
    }
    deferred.push({
      ...candidate,
      deferReasonKo:
        '현재 방문의 우선 미해결 Decision Key가 이미 3개 있어 이 후보를 삭제하지 않고 보류합니다. 앞선 확인 결과를 반영해 실제 관리전략이 이미 충분하면 다시 열지 않을 수 있고, 여전히 독립적인 결정을 바꾸면 다음 tranche에서 다시 제안합니다.',
      reconsiderAfterDecisionKeys: current.map((item) => item.decisionKey),
    })
  }

  return { current, deferred }
}

export function evaluateLbpActionAdaptiveExperimentV02(
  context: LbpActionContextV02,
): LbpActionEngineOutputV02 {
  const freshness = normalizeVisitScopedContext(context)
  const base = evaluateLbpActionAdaptiveExperiment(freshness.normalized)
  const candidates = base.checks.map(asDecisionCheck)
  const scheduled = scheduleDecisionTranche(candidates)
  const consistencyWarningsKo = collectConsistencyWarnings(context)

  return {
    ...base,
    checks: scheduled.current,
    deferredChecks: scheduled.deferred,
    allCandidateChecks: candidates,
    freshnessWarningsKo: freshness.warnings,
    consistencyWarningsKo,
    invariantWarningsKo: [...base.invariantWarningsKo, ...consistencyWarningsKo],
    stopRule: {
      satisfied: base.stopRule.satisfied,
      reasonKo:
        scheduled.deferred.length > 0
          ? '현재 tranche만 먼저 확인합니다. 보류 후보는 삭제된 것이 아니며 앞선 결과를 반영해 독립적인 관리결정을 여전히 바꾸는 경우에만 다시 제안합니다.'
          : base.stopRule.reasonKo,
    },
    scheduling: {
      strategy: 'DECISION_TRANCHE_V0_2',
      automaticPresentationBudget: 3,
      budgetIsClinicalHardCap: false,
      currentDecisionKeys: scheduled.current.map((item) => item.decisionKey),
      deferredDecisionKeys: scheduled.deferred.map((item) => item.decisionKey),
    },
  }
}
