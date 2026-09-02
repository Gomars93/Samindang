import assert from 'node:assert/strict'
import { presentLbpWorkingHypotheses } from './.lbp-hypothesis-presentation-bundle.mjs'
import { evaluateLbpWorkingHypothesisExperiment } from './.lbp-working-hypothesis-bundle.mjs'

/* DRAFT PRODUCT/UX STRESS TESTS — NOT CLINICAL VALIDATION. */

const IDS = [
  'LUMBAR_MOVEMENT_RELATED_PATTERN',
  'RADICULAR_INVOLVEMENT',
  'WALKING_STANDING_LEG_PATTERN',
  'HIP_CONTRIBUTION',
  'SIJ_CONTRIBUTION',
]
const LEVELS = [null, 'HIGHER_SUPPORT', 'CONSIDER', 'LOWER_SUPPORT', 'INSUFFICIENT_DATA']

function fakeItem(id, level) {
  return {
    id,
    titleKo: `가설 ${id}`,
    supportLevel: level,
    ruleStatus: 'DRAFT_EXPERIMENTAL',
    supportsKo: [`support ${id}`],
    contradictionsKo: [],
    meaningfulUnknownsKo: [],
    managementMeaningKo: [`management ${id}`],
    whyKo: `why ${id}`,
    finalDiagnosisClaimed: false,
  }
}

function fakeOutput(levels, overrides = {}) {
  const hypotheses = IDS
    .map((id, index) => levels[index] ? fakeItem(id, levels[index]) : null)
    .filter(Boolean)
  return {
    ruleStatus: 'DRAFT_EXPERIMENTAL',
    interpretationState: 'MULTIPLE_PLAUSIBLE_CONTRIBUTORS',
    primaryHypothesisId: null,
    hypotheses,
    globalMeaningfulUnknownsKo: [],
    warningsKo: overrides.warningsKo ?? [],
    safetyContext: {
      routinePathway: overrides.routinePathway ?? 'AVAILABLE',
      reasonKo: overrides.reasonKo ?? 'routine available',
    },
    finalDiagnosisClaimed: false,
    clinicianConfirmationRequired: true,
  }
}

function referencedIds(presentation) {
  return [
    ...presentation.surfaceBlocks.flatMap((block) => block.hypothesisIds),
    ...presentation.collapsedGroups.flatMap((group) => group.hypothesisIds),
  ]
}

function assertPresentationInvariant(raw, presentation, label) {
  assert.equal(presentation.ruleStatus, 'DRAFT_EXPERIMENTAL', `${label}: status leak`)
  assert.equal(presentation.finalDiagnosisClaimed, false, `${label}: diagnosis leak`)
  assert.equal(presentation.clinicianConfirmationRequired, true, `${label}: clinician confirmation removed`)
  assert.equal(presentation.allHypothesesPreserved, true, `${label}: preservation flag false`)
  assert.equal(presentation.equalSupportTieBrokenByCodeOrder, false, `${label}: code-order tie break enabled`)
  assert.ok(presentation.surfaceBlocks.length <= 2, `${label}: first view became a card wall (${presentation.surfaceBlocks.length})`)
  assert.strictEqual(presentation.preservedHypotheses, raw.hypotheses, `${label}: raw hypothesis array should be preserved, not rewritten`)

  const expected = raw.hypotheses.map((item) => item.id).sort()
  const referenced = referencedIds(presentation).sort()
  assert.deepEqual(referenced, expected, `${label}: a hypothesis was deleted, duplicated, or invented by presentation`)
  assert.equal(new Set(referenced).size, referenced.length, `${label}: duplicate hypothesis reference`)

  for (const block of presentation.surfaceBlocks) {
    if (block.kind !== 'EMPTY_STATE') {
      assert.ok(block.hypothesisIds.length > 0, `${label}: non-empty surface block without hypotheses`)
    }
  }
}

let matrixCases = 0
let maxRawHypotheses = 0
let maxSurfaceBlocks = 0
let groupedHigherCases = 0
let groupedConsiderCases = 0
let singleHigherPlusConsiderCases = 0
let rawFourOrFiveCases = 0

for (const l0 of LEVELS) {
  for (const l1 of LEVELS) {
    for (const l2 of LEVELS) {
      for (const l3 of LEVELS) {
        for (const l4 of LEVELS) {
          const levels = [l0, l1, l2, l3, l4]
          const raw = fakeOutput(levels)
          const presentation = presentLbpWorkingHypotheses(raw)
          const label = levels.map((value) => value ?? 'ABSENT').join('/')
          assertPresentationInvariant(raw, presentation, label)

          matrixCases += 1
          maxRawHypotheses = Math.max(maxRawHypotheses, raw.hypotheses.length)
          maxSurfaceBlocks = Math.max(maxSurfaceBlocks, presentation.surfaceBlocks.length)
          if (raw.hypotheses.length >= 4) rawFourOrFiveCases += 1

          const higher = raw.hypotheses.filter((item) => item.supportLevel === 'HIGHER_SUPPORT')
          const consider = raw.hypotheses.filter((item) => item.supportLevel === 'CONSIDER')
          const lowerOrInsufficient = raw.hypotheses.filter((item) => ['LOWER_SUPPORT', 'INSUFFICIENT_DATA'].includes(item.supportLevel))

          const surfaceIds = presentation.surfaceBlocks.flatMap((block) => block.hypothesisIds)
          for (const item of lowerOrInsufficient) {
            assert.ok(!surfaceIds.includes(item.id), `${label}: lower/insufficient hypothesis leaked into first-view cards`)
          }

          if (higher.length >= 2) {
            groupedHigherCases += 1
            const group = presentation.surfaceBlocks.find((block) => block.id === 'LBP_HYPOTHESIS_MULTI_HIGHER')
            assert.ok(group, `${label}: equal HIGHER_SUPPORT hypotheses were not grouped`)
            assert.deepEqual([...group.hypothesisIds].sort(), higher.map((item) => item.id).sort(), `${label}: grouped higher hypotheses incomplete`)
            assert.equal(group.kind, 'GROUPED_HYPOTHESES')
            assert.equal(group.detailState, 'EXPANDED')
          }

          if (higher.length === 0 && consider.length >= 2) {
            groupedConsiderCases += 1
            const group = presentation.surfaceBlocks.find((block) => block.id === 'LBP_HYPOTHESIS_MULTI_CONSIDER')
            assert.ok(group, `${label}: equal CONSIDER hypotheses were not grouped`)
            assert.deepEqual([...group.hypothesisIds].sort(), consider.map((item) => item.id).sort(), `${label}: grouped consider hypotheses incomplete`)
          }

          if (higher.length === 1 && consider.length > 0) {
            singleHigherPlusConsiderCases += 1
            assert.equal(presentation.surfaceBlocks.length, 2, `${label}: leading + additional-consider should use two compact blocks`)
            assert.equal(presentation.surfaceBlocks[0].detailState, 'EXPANDED')
            assert.equal(presentation.surfaceBlocks[1].detailState, 'COLLAPSED')
            assert.deepEqual([...presentation.surfaceBlocks[1].hypothesisIds].sort(), consider.map((item) => item.id).sort())
          }
        }
      }
    }
  }
}

// Equal-support ties must not become a hidden primary just because source order changes.
const tieRaw = fakeOutput(['HIGHER_SUPPORT', 'HIGHER_SUPPORT', 'HIGHER_SUPPORT', null, null])
const tiePresentation = presentLbpWorkingHypotheses(tieRaw)
const reversedRaw = { ...tieRaw, hypotheses: [...tieRaw.hypotheses].reverse() }
const reversedPresentation = presentLbpWorkingHypotheses(reversedRaw)
assert.deepEqual(
  [...tiePresentation.surfaceBlocks[0].hypothesisIds].sort(),
  [...reversedPresentation.surfaceBlocks[0].hypothesisIds].sort(),
  'equal-support peers changed membership when source order was reversed',
)
assert.equal(tiePresentation.surfaceBlocks[0].kind, 'GROUPED_HYPOTHESES')
assert.equal(reversedPresentation.surfaceBlocks[0].kind, 'GROUPED_HYPOTHESES')

// Safety remains above hypothesis presentation.
const safetyRaw = fakeOutput(
  ['HIGHER_SUPPORT', 'HIGHER_SUPPORT', 'CONSIDER', 'HIGHER_SUPPORT', 'CONSIDER'],
  { routinePathway: 'SAFETY_REVIEW_FIRST', reasonKo: '안전성 검토 우선', warningsKo: ['safety warning'] },
)
const safetyPresentation = presentLbpWorkingHypotheses(safetyRaw)
assert.equal(safetyPresentation.safetyFirst, true)
assert.equal(safetyPresentation.surfaceBlocks.length, 1)
assert.equal(safetyPresentation.surfaceBlocks[0].kind, 'EMPTY_STATE')
assert.deepEqual(safetyPresentation.warningBannerKo, ['safety warning'])
// In a real working-hypothesis output the safety-first engine returns zero routine hypotheses.
// The synthetic projection still preserves any supplied raw list rather than silently deleting it.
assert.strictEqual(safetyPresentation.preservedHypotheses, safetyRaw.hypotheses)

const base = {
  visitKind: 'INITIAL', diseaseSafetyStatus: 'CLEAR', treatmentSafetyStatus: 'CLEAR',
  legSymptoms: 'ABSENT', radicularCue: 'ABSENT', walkingStandingLegPattern: 'ABSENT',
  walkingTolerance: 'NOT_KNOWN', hipContributionCue: 'ABSENT', sijContributionCue: 'ABSENT',
  objectiveNeuro: 'NOT_ASSESSED', neurodynamic: 'NOT_ASSESSED', lumbarMovement: 'NO_CLEAR_RESPONSE',
  targetFunctionAvailable: true, targetFunctionReproduction: 'CONCORDANT_SYMPTOM_REPRODUCTION',
  hipScreen: 'NOT_ASSESSED', sijScreen: 'NOT_ASSESSED', clinicianConcernDomains: [],
  examResultFreshness: {},
  followUp: { trajectory: 'NOT_DUE', exposure: 'UNKNOWN', newOrWorseningNeuroSymptom: 'NO' },
}
function scenario(overrides = {}) {
  return {
    ...base, ...overrides,
    examResultFreshness: { ...base.examResultFreshness, ...(overrides.examResultFreshness ?? {}) },
    followUp: { ...base.followUp, ...(overrides.followUp ?? {}) },
  }
}

const clinicalStress = [
  {
    id: 'P01_ALL_DOMAINS_MAX_BURDEN',
    input: scenario({
      legSymptoms: 'PRESENT', radicularCue: 'PRESENT', walkingStandingLegPattern: 'PRESENT', walkingTolerance: 'KNOWN',
      objectiveNeuro: 'ABNORMAL_NON_PROGRESSIVE', neurodynamic: 'CONCORDANT_LEG_SYMPTOM', lumbarMovement: 'IMPROVES',
      hipContributionCue: 'PRESENT', hipScreen: 'CONTRIBUTORY', sijContributionCue: 'PRESENT', sijScreen: 'CONTRIBUTORY',
    }),
    review(raw, view) {
      assert.equal(raw.hypotheses.length, 5)
      assert.equal(raw.hypotheses.filter((h) => h.supportLevel === 'HIGHER_SUPPORT').length, 4)
      assert.equal(raw.hypotheses.filter((h) => h.supportLevel === 'CONSIDER').length, 1)
      assert.equal(view.surfaceBlocks.length, 1, '5 raw hypotheses should not become 5 first-view cards')
      assert.equal(view.surfaceBlocks[0].id, 'LBP_HYPOTHESIS_MULTI_HIGHER')
      assert.equal(view.surfaceBlocks[0].hypothesisIds.length, 4)
      assert.ok(view.collapsedGroups.some((group) => group.hypothesisIds.includes('WALKING_STANDING_LEG_PATTERN')))
    },
  },
  {
    id: 'P02_FOUR_EQUAL_CONSIDER',
    input: scenario({
      legSymptoms: 'PRESENT', radicularCue: 'PRESENT', walkingStandingLegPattern: 'PRESENT',
      hipContributionCue: 'PRESENT', sijContributionCue: 'PRESENT',
    }),
    review(raw, view) {
      assert.equal(raw.hypotheses.length, 4)
      assert.ok(raw.hypotheses.every((h) => h.supportLevel === 'CONSIDER'))
      assert.equal(view.surfaceBlocks.length, 1)
      assert.equal(view.surfaceBlocks[0].id, 'LBP_HYPOTHESIS_MULTI_CONSIDER')
      assert.equal(view.surfaceBlocks[0].hypothesisIds.length, 4)
    },
  },
  {
    id: 'P03_ONE_LEADING_THREE_CONSIDER',
    input: scenario({
      lumbarMovement: 'CONCORDANT_SYMPTOM_REPRODUCTION', legSymptoms: 'PRESENT', radicularCue: 'PRESENT',
      walkingStandingLegPattern: 'PRESENT', hipContributionCue: 'PRESENT',
    }),
    review(raw, view) {
      assert.equal(raw.hypotheses.length, 4)
      assert.equal(raw.hypotheses.filter((h) => h.supportLevel === 'HIGHER_SUPPORT').length, 1)
      assert.equal(raw.hypotheses.filter((h) => h.supportLevel === 'CONSIDER').length, 3)
      assert.equal(view.surfaceBlocks.length, 2)
      assert.equal(view.surfaceBlocks[0].role, 'LEADING')
      assert.equal(view.surfaceBlocks[1].role, 'ADDITIONAL_CONSIDER')
      assert.equal(view.surfaceBlocks[1].detailState, 'COLLAPSED')
      assert.equal(view.surfaceBlocks[1].hypothesisIds.length, 3)
    },
  },
  {
    id: 'P04_CONTRADICTION_DOES_NOT_BECOME_CARD_WALL',
    input: scenario({ legSymptoms: 'ABSENT', radicularCue: 'PRESENT', walkingStandingLegPattern: 'PRESENT', hipContributionCue: 'UNCERTAIN', sijContributionCue: 'UNCERTAIN' }),
    review(raw, view) {
      assert.ok(raw.warningsKo.length > 0)
      assert.ok(raw.hypotheses.length >= 4)
      assert.ok(view.surfaceBlocks.length <= 1)
      assert.deepEqual(view.warningBannerKo, raw.warningsKo)
      assert.equal(referencedIds(view).length, raw.hypotheses.length)
    },
  },
]

const clinicalSnapshots = []
for (const testCase of clinicalStress) {
  const raw = evaluateLbpWorkingHypothesisExperiment(testCase.input)
  const view = presentLbpWorkingHypotheses(raw)
  assertPresentationInvariant(raw, view, testCase.id)
  testCase.review(raw, view)
  clinicalSnapshots.push({
    id: testCase.id,
    raw: raw.hypotheses.map((h) => `${h.id}:${h.supportLevel}`),
    surface: view.surfaceBlocks.map((b) => `${b.titleKo} [${b.hypothesisIds.join(',')}] ${b.detailState}`),
    collapsed: view.collapsedGroups.map((g) => `${g.titleKo} [${g.hypothesisIds.join(',')}]`),
  })
}

console.log('\nLBP hypothesis-presentation exhaustive stress summary')
console.log(`- synthetic support-state matrix: ${matrixCases} cases`)
console.log(`- max raw hypotheses: ${maxRawHypotheses}`)
console.log(`- raw 4–5 hypothesis cases: ${rawFourOrFiveCases}`)
console.log(`- max first-view surface blocks: ${maxSurfaceBlocks}`)
console.log(`- grouped equal HIGHER_SUPPORT cases: ${groupedHigherCases}`)
console.log(`- grouped equal CONSIDER cases: ${groupedConsiderCases}`)
console.log(`- one-leading + additional-consider compact cases: ${singleHigherPlusConsiderCases}`)
console.log('- no hypothesis deleted, duplicated, upgraded, downgraded, or chosen as an equal-support winner by presentation')

console.log('\nClinical max-burden snapshots')
for (const snapshot of clinicalSnapshots) {
  console.log(`\n[${snapshot.id}]`)
  console.log(`- raw: ${snapshot.raw.join(' / ')}`)
  console.log(`- first view: ${snapshot.surface.join(' / ') || '없음'}`)
  console.log(`- collapsed: ${snapshot.collapsed.join(' / ') || '없음'}`)
}

console.log('\nPASS: compact working-hypothesis presentation stress suite')
console.log('DRAFT ONLY: presentation compression is a UX projection and does not validate clinical hypothesis rows.')
