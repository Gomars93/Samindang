import assert from 'node:assert/strict'
import { evaluateLbpActionAdaptiveExperimentV02 } from './.lbp-action-adaptive-engine-v02-bundle.mjs'

/*
 * OBSERVATIONAL PRIORITY POLICY COMPARISON — NOT CLINICAL VALIDATION.
 *
 * This file deliberately does NOT approve any priority policy. It reuses the
 * exact same v0.2 candidate generator and compares three ways of presenting at
 * most three automatic checks in complex patients.
 *
 * Assertions are limited to product/safety invariants already agreed:
 * - disease-safety gate is upstream of this comparison,
 * - clinician-requested checks are never suppressed,
 * - no selected candidate is invented or deleted from the candidate set,
 * - automatic cognitive budget is <= 3.
 *
 * The printed scores are decision-support for design review, not evidence that
 * one clinical ordering is correct.
 */

const base = {
  visitKind: 'INITIAL',
  diseaseSafetyStatus: 'CLEAR',
  treatmentSafetyStatus: 'CLEAR',
  legSymptoms: 'ABSENT',
  radicularCue: 'ABSENT',
  walkingStandingLegPattern: 'ABSENT',
  walkingTolerance: 'NOT_KNOWN',
  hipContributionCue: 'ABSENT',
  sijContributionCue: 'ABSENT',
  objectiveNeuro: 'NOT_ASSESSED',
  neurodynamic: 'NOT_ASSESSED',
  lumbarMovement: 'NO_CLEAR_RESPONSE',
  targetFunctionAvailable: true,
  targetFunctionReproduction: 'CONCORDANT_SYMPTOM_REPRODUCTION',
  hipScreen: 'NOT_ASSESSED',
  sijScreen: 'NOT_ASSESSED',
  clinicianConcernDomains: [],
  examResultFreshness: {},
  followUp: {
    trajectory: 'NOT_DUE',
    exposure: 'UNKNOWN',
    newOrWorseningNeuroSymptom: 'NO',
  },
}

function scenario(overrides = {}) {
  return {
    ...base,
    ...overrides,
    examResultFreshness: {
      ...base.examResultFreshness,
      ...(overrides.examResultFreshness ?? {}),
    },
    followUp: {
      ...base.followUp,
      ...(overrides.followUp ?? {}),
    },
  }
}

const PRIORITY_WEIGHT = { BLOCKING: 100, HIGH: 50, ROUTINE: 10 }
const NEURO_KEYS = new Set(['NEURO_PATHWAY_NEEDED', 'OBJECTIVE_NEURO_BASELINE', 'NEURODYNAMIC_RESPONSE'])
const FUNCTION_KEYS = new Set(['TARGET_FUNCTION_DEFINED', 'TARGET_FUNCTION_REPRODUCTION', 'WALKING_FUNCTION_BASELINE'])
const TARGET_KEYS = new Set(['HIP_TREATMENT_TARGET', 'SIJ_TREATMENT_TARGET'])

function stableSortByScore(candidates, scoreFn) {
  return candidates
    .map((item, index) => ({ item, index, score: scoreFn(item, index) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ item }) => item)
}

function splitManual(candidates) {
  const manual = candidates.filter((item) => item.requestedByClinician || item.priority === 'BLOCKING')
  const automatic = candidates.filter((item) => !item.requestedByClinician && item.priority !== 'BLOCKING')
  return { manual, automatic }
}

function finalizeSelection(candidates, rankedAutomatic) {
  const { manual } = splitManual(candidates)
  const manualIds = new Set(manual.map((item) => item.id))
  const room = Math.max(0, 3 - manual.length)
  const automatic = rankedAutomatic.filter((item) => !manualIds.has(item.id)).slice(0, room)
  const selected = [...manual, ...automatic]
  const selectedIds = new Set(selected.map((item) => item.id))
  const deferred = candidates.filter((item) => !selectedIds.has(item.id))
  return { selected, deferred }
}

/*
 * Policy A — Safety + function first.
 * Easy to explain and maintain. It favors objective neuro / walking / target
 * function before etiologic or treatment-target refinements.
 */
function policyA(candidates) {
  const { automatic } = splitManual(candidates)
  const fixedOrder = new Map([
    ['OBJECTIVE_NEURO_BASELINE', 90],
    ['NEURO_PATHWAY_NEEDED', 85],
    ['WALKING_FUNCTION_BASELINE', 80],
    ['TARGET_FUNCTION_DEFINED', 75],
    ['TARGET_FUNCTION_REPRODUCTION', 70],
    ['LUMBAR_DIRECTIONAL_RESPONSE', 60],
    ['NEURODYNAMIC_RESPONSE', 50],
    ['HIP_TREATMENT_TARGET', 40],
    ['SIJ_TREATMENT_TARGET', 40],
  ])
  const ranked = stableSortByScore(
    automatic,
    (item) => (fixedOrder.get(item.decisionKey) ?? 0) + PRIORITY_WEIGHT[item.priority],
  )
  return finalizeSelection(candidates, ranked)
}

/*
 * Policy B — Safety baseline + patient-specific management target.
 * Keeps a high-value neuro baseline when neurologic/walking cues generated it,
 * but after that favors the patient's explicit functional/treatment-target cue
 * rather than always consuming the remaining slots with more neuro refinement.
 * This is a comparison hypothesis only, not an approved clinical ordering.
 */
function policyB(candidates) {
  const { automatic } = splitManual(candidates)
  const rank = new Map([
    ['OBJECTIVE_NEURO_BASELINE', 90],
    ['NEURO_PATHWAY_NEEDED', 85],
    ['WALKING_FUNCTION_BASELINE', 78],
    ['TARGET_FUNCTION_DEFINED', 76],
    ['TARGET_FUNCTION_REPRODUCTION', 74],
    ['HIP_TREATMENT_TARGET', 72],
    ['SIJ_TREATMENT_TARGET', 72],
    ['LUMBAR_DIRECTIONAL_RESPONSE', 68],
    ['NEURODYNAMIC_RESPONSE', 62],
  ])
  const ranked = stableSortByScore(
    automatic,
    (item) => (rank.get(item.decisionKey) ?? 0) + PRIORITY_WEIGHT[item.priority],
  )
  return finalizeSelection(candidates, ranked)
}

/*
 * Policy C — Dynamic marginal-value heuristic.
 * Selects sequentially. In addition to existing check priority, it rewards a
 * candidate that covers a management domain not already represented by the
 * current selection. This intentionally tests whether a generic scoring engine
 * buys enough UX/coverage benefit to justify its added complexity.
 */
function policyC(candidates) {
  const { manual, automatic } = splitManual(candidates)
  const selected = [...manual]
  const remaining = [...automatic]
  const coveredDomains = new Set(selected.flatMap((item) => item.changesManagement))

  while (selected.length < 3 && remaining.length > 0) {
    let bestIndex = 0
    let bestScore = -Infinity
    for (let i = 0; i < remaining.length; i += 1) {
      const item = remaining[i]
      const novelDomains = item.changesManagement.filter((domain) => !coveredDomains.has(domain)).length
      const breadth = item.changesManagement.length
      const structuralBonus =
        item.decisionKey === 'OBJECTIVE_NEURO_BASELINE' ? 22 :
        FUNCTION_KEYS.has(item.decisionKey) ? 16 :
        TARGET_KEYS.has(item.decisionKey) ? 15 :
        item.decisionKey === 'LUMBAR_DIRECTIONAL_RESPONSE' ? 13 :
        item.decisionKey === 'NEURODYNAMIC_RESPONSE' ? 11 : 8
      const score = PRIORITY_WEIGHT[item.priority] + structuralBonus + novelDomains * 12 + breadth * 2
      if (score > bestScore) {
        bestScore = score
        bestIndex = i
      }
    }
    const [chosen] = remaining.splice(bestIndex, 1)
    selected.push(chosen)
    for (const domain of chosen.changesManagement) coveredDomains.add(domain)
  }

  const selectedIds = new Set(selected.map((item) => item.id))
  return {
    selected,
    deferred: candidates.filter((item) => !selectedIds.has(item.id)),
  }
}

const policies = [
  { id: 'A', name: '안전·기능 우선형', select: policyA, complexityPenalty: 0 },
  { id: 'B', name: '안전 baseline + 치료변경 가능성 우선형', select: policyB, complexityPenalty: 1 },
  { id: 'C', name: '완전 동적 marginal-value형', select: policyC, complexityPenalty: 4 },
]

const cases = [
  ['SIMPLE', scenario({ lumbarMovement: 'NOT_ASSESSED', targetFunctionReproduction: 'NOT_ASSESSED' })],
  ['RADICULAR', scenario({ legSymptoms: 'PRESENT', radicularCue: 'PRESENT' })],
  ['WALKING', scenario({ legSymptoms: 'PRESENT', walkingStandingLegPattern: 'PRESENT' })],
  ['HIP', scenario({ hipContributionCue: 'PRESENT' })],
  ['SIJ', scenario({ sijContributionCue: 'PRESENT' })],
  ['LUMBAR_HIP', scenario({ lumbarMovement: 'NOT_ASSESSED', hipContributionCue: 'PRESENT' })],
  ['LUMBAR_SIJ', scenario({ lumbarMovement: 'NOT_ASSESSED', sijContributionCue: 'PRESENT' })],
  ['RADICULAR_HIP', scenario({ legSymptoms: 'PRESENT', radicularCue: 'PRESENT', hipContributionCue: 'PRESENT' })],
  ['RADICULAR_SIJ', scenario({ legSymptoms: 'PRESENT', radicularCue: 'PRESENT', sijContributionCue: 'PRESENT' })],
  ['WALKING_HIP', scenario({ legSymptoms: 'PRESENT', walkingStandingLegPattern: 'PRESENT', hipContributionCue: 'PRESENT' })],
  ['WALKING_SIJ', scenario({ legSymptoms: 'PRESENT', walkingStandingLegPattern: 'PRESENT', sijContributionCue: 'PRESENT' })],
  ['HIP_SIJ', scenario({ hipContributionCue: 'PRESENT', sijContributionCue: 'PRESENT' })],
  ['RADICULAR_WALKING_HIP', scenario({ legSymptoms: 'PRESENT', radicularCue: 'PRESENT', walkingStandingLegPattern: 'PRESENT', hipContributionCue: 'PRESENT' })],
  ['RADICULAR_WALKING_SIJ', scenario({ legSymptoms: 'PRESENT', radicularCue: 'PRESENT', walkingStandingLegPattern: 'PRESENT', sijContributionCue: 'PRESENT' })],
  ['RADICULAR_HIP_SIJ', scenario({ legSymptoms: 'PRESENT', radicularCue: 'PRESENT', hipContributionCue: 'PRESENT', sijContributionCue: 'PRESENT' })],
  ['ALL_CUES', scenario({ legSymptoms: 'PRESENT', radicularCue: 'PRESENT', walkingStandingLegPattern: 'PRESENT', hipContributionCue: 'PRESENT', sijContributionCue: 'PRESENT' })],
  ['NONRESPONSE_HIP', scenario({ visitKind: 'FOLLOW_UP', hipContributionCue: 'PRESENT', followUp: { trajectory: 'NO_MEANINGFUL_CHANGE', exposure: 'ADEQUATE', newOrWorseningNeuroSymptom: 'NO' } })],
  ['NONRESPONSE_SIJ', scenario({ visitKind: 'FOLLOW_UP', sijContributionCue: 'PRESENT', followUp: { trajectory: 'NO_MEANINGFUL_CHANGE', exposure: 'ADEQUATE', newOrWorseningNeuroSymptom: 'NO' } })],
  ['CLINICIAN_HIP', scenario({ clinicianConcernDomains: ['HIP'] })],
  ['CLINICIAN_NEURO_HIP', scenario({ clinicianConcernDomains: ['NEURO', 'HIP'] })],
]

function metricsFor(input, candidates, selection) {
  const selectedKeys = new Set(selection.selected.map((item) => item.decisionKey))
  const candidateKeys = new Set(candidates.map((item) => item.decisionKey))
  const selectedDomains = new Set(selection.selected.flatMap((item) => item.changesManagement))

  const objectiveNeuroNeeded = candidateKeys.has('OBJECTIVE_NEURO_BASELINE')
  const walkingNeeded = candidateKeys.has('WALKING_FUNCTION_BASELINE')
  const hipCandidate = candidateKeys.has('HIP_TREATMENT_TARGET')
  const sijCandidate = candidateKeys.has('SIJ_TREATMENT_TARGET')
  const anyTargetCandidate = hipCandidate || sijCandidate
  const anyTargetSelected =
    selectedKeys.has('HIP_TREATMENT_TARGET') || selectedKeys.has('SIJ_TREATMENT_TARGET')

  return {
    automaticCount: selection.selected.filter((item) => !item.requestedByClinician && item.priority !== 'BLOCKING').length,
    objectiveNeuroCoverage: !objectiveNeuroNeeded || selectedKeys.has('OBJECTIVE_NEURO_BASELINE'),
    walkingCoverage: !walkingNeeded || selectedKeys.has('WALKING_FUNCTION_BASELINE'),
    targetCoverage: !anyTargetCandidate || anyTargetSelected,
    bothTargetCoverage:
      !(hipCandidate && sijCandidate) ||
      (selectedKeys.has('HIP_TREATMENT_TARGET') && selectedKeys.has('SIJ_TREATMENT_TARGET')),
    managementDomainBreadth: selectedDomains.size,
    preservesAllCandidates: selection.selected.length + selection.deferred.length === candidates.length,
    clinicianRequestsPreserved: candidates
      .filter((item) => item.requestedByClinician)
      .every((item) => selection.selected.some((selected) => selected.id === item.id)),
    allCueBranchStarvation:
      input.radicularCue === 'PRESENT' &&
      input.walkingStandingLegPattern === 'PRESENT' &&
      anyTargetCandidate &&
      !anyTargetSelected,
  }
}

const summaries = new Map(policies.map((policy) => [policy.id, {
  cases: 0,
  totalAutomatic: 0,
  objectiveNeuroHits: 0,
  objectiveNeuroEligible: 0,
  walkingHits: 0,
  walkingEligible: 0,
  targetHits: 0,
  targetEligible: 0,
  bothTargetHits: 0,
  bothTargetEligible: 0,
  domainBreadth: 0,
  branchStarvation: 0,
  clinicianPreservation: 0,
  candidatePreservation: 0,
}]))

console.log('\nLBP complex-patient priority policy comparison')
for (const [label, input] of cases) {
  const engine = evaluateLbpActionAdaptiveExperimentV02(input)
  assert.notEqual(engine.routinePathway, 'SAFETY_REVIEW_FIRST', `${label}: safety-gated cases do not belong in priority comparison`)
  const candidates = engine.allCandidateChecks
  console.log(`\n[${label}] candidates=${candidates.map((item) => item.decisionKey).join(', ') || 'none'}`)

  for (const policy of policies) {
    const selection = policy.select(candidates)
    const metrics = metricsFor(input, candidates, selection)

    assert.ok(metrics.automaticCount <= 3, `${label}/${policy.id}: automatic cognitive budget exceeded`)
    assert.equal(metrics.preservesAllCandidates, true, `${label}/${policy.id}: candidate disappeared`)
    assert.equal(metrics.clinicianRequestsPreserved, true, `${label}/${policy.id}: clinician request was suppressed`)

    const summary = summaries.get(policy.id)
    summary.cases += 1
    summary.totalAutomatic += metrics.automaticCount
    summary.domainBreadth += metrics.managementDomainBreadth
    summary.branchStarvation += metrics.allCueBranchStarvation ? 1 : 0
    summary.clinicianPreservation += metrics.clinicianRequestsPreserved ? 1 : 0
    summary.candidatePreservation += metrics.preservesAllCandidates ? 1 : 0

    if (candidates.some((item) => item.decisionKey === 'OBJECTIVE_NEURO_BASELINE')) {
      summary.objectiveNeuroEligible += 1
      summary.objectiveNeuroHits += metrics.objectiveNeuroCoverage ? 1 : 0
    }
    if (candidates.some((item) => item.decisionKey === 'WALKING_FUNCTION_BASELINE')) {
      summary.walkingEligible += 1
      summary.walkingHits += metrics.walkingCoverage ? 1 : 0
    }
    if (candidates.some((item) => TARGET_KEYS.has(item.decisionKey))) {
      summary.targetEligible += 1
      summary.targetHits += metrics.targetCoverage ? 1 : 0
    }
    if (
      candidates.some((item) => item.decisionKey === 'HIP_TREATMENT_TARGET') &&
      candidates.some((item) => item.decisionKey === 'SIJ_TREATMENT_TARGET')
    ) {
      summary.bothTargetEligible += 1
      summary.bothTargetHits += metrics.bothTargetCoverage ? 1 : 0
    }

    console.log(
      `- ${policy.id} ${policy.name}: now=[${selection.selected.map((item) => item.decisionKey).join(', ') || 'none'}] deferred=[${selection.deferred.map((item) => item.decisionKey).join(', ') || 'none'}]`,
    )
  }
}

function rate(hit, eligible) {
  return eligible === 0 ? 1 : hit / eligible
}

const weightedResults = []
for (const policy of policies) {
  const s = summaries.get(policy.id)
  const neuroRate = rate(s.objectiveNeuroHits, s.objectiveNeuroEligible)
  const walkingRate = rate(s.walkingHits, s.walkingEligible)
  const targetRate = rate(s.targetHits, s.targetEligible)
  const bothTargetRate = rate(s.bothTargetHits, s.bothTargetEligible)
  const noStarvationRate = 1 - s.branchStarvation / s.cases
  const clickEfficiency = 1 - Math.max(0, s.totalAutomatic / s.cases - 1) / 3
  const breadthRate = Math.min(1, s.domainBreadth / s.cases / 4)
  const maintainability = Math.max(0, 1 - policy.complexityPenalty / 10)

  // Product-design weights only. These are not clinical evidence weights.
  const score =
    neuroRate * 22 +
    walkingRate * 12 +
    targetRate * 20 +
    bothTargetRate * 8 +
    noStarvationRate * 12 +
    clickEfficiency * 10 +
    breadthRate * 6 +
    maintainability * 10

  weightedResults.push({
    policy: policy.id,
    name: policy.name,
    score: Number(score.toFixed(1)),
    neuroRate,
    walkingRate,
    targetRate,
    bothTargetRate,
    noStarvationRate,
    avgAutomatic: s.totalAutomatic / s.cases,
    avgDomainBreadth: s.domainBreadth / s.cases,
    maintainability,
  })
}

weightedResults.sort((a, b) => b.score - a.score)
console.log('\nPolicy score summary — PRODUCT DESIGN OBSERVATION ONLY')
for (const row of weightedResults) {
  console.log(
    `- ${row.policy} ${row.name}: score=${row.score}, neuro=${(row.neuroRate * 100).toFixed(0)}%, walking=${(row.walkingRate * 100).toFixed(0)}%, any-target=${(row.targetRate * 100).toFixed(0)}%, both-target=${(row.bothTargetRate * 100).toFixed(0)}%, no-starvation=${(row.noStarvationRate * 100).toFixed(0)}%, avg-auto=${row.avgAutomatic.toFixed(2)}, avg-domain-breadth=${row.avgDomainBreadth.toFixed(2)}, maintainability=${(row.maintainability * 100).toFixed(0)}%`,
  )
}

console.log('\nPASS: three priority policies compared without approving any clinical ordering')
