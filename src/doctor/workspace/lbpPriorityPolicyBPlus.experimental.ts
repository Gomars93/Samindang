/*
 * EXPERIMENTAL / DRAFT ONLY — NOT PRODUCTION CLINICAL LOGIC.
 *
 * B+ preserves the original Clinical OS intent:
 * - primary-care management, not exhaustive diagnosis;
 * - safety / meaningful functional baseline first;
 * - when checks compete for limited attention, prefer information that can
 *   change today's treatment target over diagnostic refinement alone;
 * - never invent an extra patient question just to break a Hip-vs-SIJ tie;
 * - if existing information cannot distinguish equally relevant treatment
 *   targets and only one presentation slot remains, give the clinician a
 *   compact choice instead of silently privileging code order;
 * - deferred checks are preserved as unresolved, never converted to normal.
 *
 * This module changes ONLY experimental presentation priority. Candidate
 * generation, tablet facts, FROZEN safety logic, hypothesis mapping, rehab
 * mapping, and production Doctor UI remain untouched.
 */
import {
  evaluateLbpActionAdaptiveExperimentV02,
  type LbpActionContextV02,
  type LbpActionEngineOutputV02,
  type LbpDecisionCheck,
  type LbpDecisionKey,
} from './lbpActionAdaptiveEngine.v02.experimental'

export type BPlusTreatmentTargetKey = 'HIP_TREATMENT_TARGET' | 'SIJ_TREATMENT_TARGET'

export interface LbpBPlusClinicianChoiceGroup {
  id: 'LBP_CHOICE_TREATMENT_TARGET_TIE'
  titleKo: '추가 치료타깃 확인'
  reasonKo: string
  options: Array<{
    decisionKey: BPlusTreatmentTargetKey
    check: LbpDecisionCheck
  }>
  selectOneByDefault: true
  clinicianMaySelectMoreThanOne: true
  addsPatientQuestion: false
}

export interface LbpBPlusPriorityOutput {
  ruleStatus: 'DRAFT_EXPERIMENTAL'
  policy: 'PRIMARY_CARE_B_PLUS'
  routinePathway: LbpActionEngineOutputV02['routinePathway']
  treatmentFinalizationRequiresClinicianReview: boolean

  /** Concrete checks shown now. */
  checksNow: LbpDecisionCheck[]

  /**
   * A presentation choice, NOT a new clinical question. Each option is an
   * already-generated candidate check. Used only when Hip/SIJ are tied and one
   * automatic presentation slot remains.
   */
  clinicianChoiceGroups: LbpBPlusClinicianChoiceGroup[]

  /** Candidates not shown now remain explicit clinical debt. */
  deferredChecks: LbpDecisionCheck[]
  allCandidateChecks: LbpDecisionCheck[]

  presentation: {
    automaticBudget: 3
    automaticBudgetIsClinicalHardCap: false
    automaticItemsShown: number
    clinicianRequestedChecksMayExceedBudget: true
  }
}

const FOUNDATIONAL_ORDER: Partial<Record<LbpDecisionKey, number>> = {
  OBJECTIVE_NEURO_BASELINE: 100,
  NEURO_PATHWAY_NEEDED: 95,
  WALKING_FUNCTION_BASELINE: 90,
  TARGET_FUNCTION_DEFINED: 88,
  TARGET_FUNCTION_REPRODUCTION: 86,
}

const REFINEMENT_ORDER: Partial<Record<LbpDecisionKey, number>> = {
  LUMBAR_DIRECTIONAL_RESPONSE: 60,
  NEURODYNAMIC_RESPONSE: 50,
}

const TARGET_KEYS = new Set<LbpDecisionKey>([
  'HIP_TREATMENT_TARGET',
  'SIJ_TREATMENT_TARGET',
])

const PRIORITY_WEIGHT = { BLOCKING: 1000, HIGH: 100, ROUTINE: 0 } as const

function stableRank(
  candidates: LbpDecisionCheck[],
  score: (candidate: LbpDecisionCheck) => number,
): LbpDecisionCheck[] {
  return candidates
    .map((candidate, index) => ({ candidate, index, score: score(candidate) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ candidate }) => candidate)
}

function uniqueByDecisionKey(candidates: LbpDecisionCheck[]): LbpDecisionCheck[] {
  const seen = new Set<LbpDecisionKey>()
  return candidates.filter((candidate) => {
    if (seen.has(candidate.decisionKey)) return false
    seen.add(candidate.decisionKey)
    return true
  })
}

function treatmentTargetScore(candidate: LbpDecisionCheck): number {
  return PRIORITY_WEIGHT[candidate.priority]
}

function buildTieChoiceGroup(
  targets: LbpDecisionCheck[],
): LbpBPlusClinicianChoiceGroup {
  return {
    id: 'LBP_CHOICE_TREATMENT_TARGET_TIE',
    titleKo: '추가 치료타깃 확인',
    reasonKo:
      '고관절과 천장관절 모두 현재 관리전략을 바꿀 수 있는 단서가 있으나 기존 정보만으로 우선순위를 정할 근거가 충분하지 않습니다. 새 환자 질문을 추가하거나 코드 순서로 임의 선택하지 않고, 현재 진찰에서 더 직접적으로 의심되는 쪽을 원장이 선택합니다.',
    options: targets.map((check) => ({
      decisionKey: check.decisionKey as BPlusTreatmentTargetKey,
      check,
    })),
    selectOneByDefault: true,
    clinicianMaySelectMoreThanOne: true,
    addsPatientQuestion: false,
  }
}

export function evaluateLbpPriorityPolicyBPlusExperiment(
  context: LbpActionContextV02,
): LbpBPlusPriorityOutput {
  const base = evaluateLbpActionAdaptiveExperimentV02(context)
  const all = uniqueByDecisionKey(base.allCandidateChecks)

  // Safety is upstream. B+ must never use presentation priority to bypass it.
  if (base.routinePathway !== 'AVAILABLE') {
    return {
      ruleStatus: 'DRAFT_EXPERIMENTAL',
      policy: 'PRIMARY_CARE_B_PLUS',
      routinePathway: base.routinePathway,
      treatmentFinalizationRequiresClinicianReview:
        base.treatmentFinalizationRequiresClinicianReview,
      checksNow: [],
      clinicianChoiceGroups: [],
      deferredChecks: all,
      allCandidateChecks: all,
      presentation: {
        automaticBudget: 3,
        automaticBudgetIsClinicalHardCap: false,
        automaticItemsShown: 0,
        clinicianRequestedChecksMayExceedBudget: true,
      },
    }
  }

  const checksNow: LbpDecisionCheck[] = []
  const choiceGroups: LbpBPlusClinicianChoiceGroup[] = []

  // Explicit clinician concern and blocking items are never hidden by the
  // automatic cognitive budget.
  const manual = all.filter(
    (candidate) => candidate.requestedByClinician || candidate.priority === 'BLOCKING',
  )
  checksNow.push(...manual)

  const manualKeys = new Set(manual.map((item) => item.decisionKey))
  const automatic = all.filter((candidate) => !manualKeys.has(candidate.decisionKey))

  let remainingAutomaticSlots = Math.max(0, 3 - manual.length)

  // 1) Safety/tracking and core functional baselines first, but only when the
  // candidate generator has already judged them relevant to this patient.
  const foundational = stableRank(
    automatic.filter((candidate) => FOUNDATIONAL_ORDER[candidate.decisionKey] !== undefined),
    (candidate) =>
      (FOUNDATIONAL_ORDER[candidate.decisionKey] ?? 0) + PRIORITY_WEIGHT[candidate.priority],
  )

  for (const candidate of foundational) {
    if (remainingAutomaticSlots <= 0) break
    checksNow.push(candidate)
    remainingAutomaticSlots -= 1
  }

  const selectedKeys = new Set(checksNow.map((item) => item.decisionKey))
  const remainingAutomatic = automatic.filter(
    (candidate) => !selectedKeys.has(candidate.decisionKey),
  )

  // 2) If treatment-target checks compete with refinement checks, treatment
  // target comes first because it can alter what is treated today.
  const targets = stableRank(
    remainingAutomatic.filter((candidate) => TARGET_KEYS.has(candidate.decisionKey)),
    treatmentTargetScore,
  )

  if (remainingAutomaticSlots > 0 && targets.length > 0) {
    if (targets.length === 1 || remainingAutomaticSlots >= targets.length) {
      for (const target of targets) {
        if (remainingAutomaticSlots <= 0) break
        checksNow.push(target)
        remainingAutomaticSlots -= 1
      }
    } else {
      // One slot, two equally ranked treatment targets: do not manufacture a
      // patient question and do not let source-code order pick Hip over SIJ.
      const topScore = treatmentTargetScore(targets[0])
      const tiedTopTargets = targets.filter(
        (candidate) => treatmentTargetScore(candidate) === topScore,
      )

      if (tiedTopTargets.length > 1) {
        choiceGroups.push(buildTieChoiceGroup(tiedTopTargets))
        remainingAutomaticSlots -= 1
      } else {
        checksNow.push(targets[0])
        remainingAutomaticSlots -= 1
      }
    }
  }

  // 3) Diagnostic/rehab refinement uses only remaining attention. It is not
  // deleted; it stays deferred if today's higher-value management questions
  // consume the presentation budget.
  const representedKeys = new Set<LbpDecisionKey>([
    ...checksNow.map((item) => item.decisionKey),
    ...choiceGroups.flatMap((group) => group.options.map((option) => option.decisionKey)),
  ])

  const refinements = stableRank(
    automatic.filter(
      (candidate) =>
        !representedKeys.has(candidate.decisionKey) &&
        REFINEMENT_ORDER[candidate.decisionKey] !== undefined,
    ),
    (candidate) =>
      (REFINEMENT_ORDER[candidate.decisionKey] ?? 0) + PRIORITY_WEIGHT[candidate.priority],
  )

  for (const refinement of refinements) {
    if (remainingAutomaticSlots <= 0) break
    checksNow.push(refinement)
    remainingAutomaticSlots -= 1
  }

  const finalRepresentedKeys = new Set<LbpDecisionKey>([
    ...checksNow.map((item) => item.decisionKey),
    ...choiceGroups.flatMap((group) => group.options.map((option) => option.decisionKey)),
  ])
  const deferredChecks = all.filter(
    (candidate) => !finalRepresentedKeys.has(candidate.decisionKey),
  )

  const automaticItemsShown =
    checksNow.filter(
      (candidate) => !candidate.requestedByClinician && candidate.priority !== 'BLOCKING',
    ).length + choiceGroups.length

  return {
    ruleStatus: 'DRAFT_EXPERIMENTAL',
    policy: 'PRIMARY_CARE_B_PLUS',
    routinePathway: base.routinePathway,
    treatmentFinalizationRequiresClinicianReview:
      base.treatmentFinalizationRequiresClinicianReview,
    checksNow,
    clinicianChoiceGroups: choiceGroups,
    deferredChecks,
    allCandidateChecks: all,
    presentation: {
      automaticBudget: 3,
      automaticBudgetIsClinicalHardCap: false,
      automaticItemsShown,
      clinicianRequestedChecksMayExceedBudget: true,
    },
  }
}
