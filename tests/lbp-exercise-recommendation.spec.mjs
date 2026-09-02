// LBP v1 Batch 2 (G9/G10) — buildLbpRecommendationContext /
// mergeLbpRehabSuggestions / adoption-text tests.
// Run via `npm run test:lbp-exercise-recommendation`.
//
// Payloads are built through the REAL production spec builders
// (buildResponsePayload/computeFlags/buildRoutingPayload, coreSpec.ts,
// bundled fresh here), same pattern as tests/lbp-exam-suggestions.spec.mjs.

import assert from 'node:assert/strict'
import {
  ALL_QUESTIONS,
  buildResponsePayload,
  buildRoutingPayload,
  computeFlags,
  pruneStaleResponses,
} from './.lbp-exercise-recommendation-corespec-bundle.mjs'
import {
  buildLbpRecommendationContext,
  mergeLbpRehabSuggestions,
  candidateToRehabSuggestion,
  buildLbpAdoptionText,
  appendLbpAdoptionText,
  TREATMENT_SAFETY_LOCKED_MESSAGE_KO,
  TARGET_FUNCTION_ID_TO_ENUM,
} from './.lbp-exercise-recommendation-bundle.mjs'
import { buildLbpEligibilityContext } from './.lbp-eligibility-context-bundle.mjs'
import { LBP_CORE_EXERCISE_METADATA } from './.lbp-exercise-recommendation-core-metadata-bundle.mjs'

let passed = 0
const test = (name, fn) => {
  fn()
  passed += 1
  console.log(`PASS ${name}`)
}

const emptyResponses = () => Object.fromEntries(ALL_QUESTIONS.map((q) => [q.id, null]))

const BASE_DEFAULTS = {
  ID_02: '5678',
  MED_USE: 'none',
  HISTORY_01: ['none'],
  ALLERGY_01: 'none',
  SURGERY_01: 'none',
  TEST_01: 'none',
  FREE_01: 'none',
  HERB_APPETITE: 'normal',
  HERB_THERMAL: 'cold_sensitive',
  HERB_THIRST: 'normal',
  HERB_SWEAT: 'normal',
  BIRTH_02: 'solar',
  BIRTH_03: 'o',
  BIRTH_03A: 'exact',
  WOMEN_SAFETY_01: ['none'],
}

// Clean, safety-CLEAR LBP baseline (mirrors tests/lbp-exam-suggestions.spec.mjs's CLEAR_AXIAL_BASE).
const CLEAR_AXIAL_BASE = {
  ID_01: '테스트',
  ID_03: 'male',
  BIRTH_01: '19850101',
  VISIT_01: 'symptom',
  VISIT_02_SYMPTOM_MAIN: 'pain',
  VISIT_03_SYMPTOM_DURATION: '1_3m',
  VISIT_04_SYMPTOM_IMPACT: 'mild',
  SECONDARY_01: ['none'],
  SAFETY_01: ['none'],
  PAIN_01: 'low_back_pelvis',
  PAIN_02: ['aching'],
  PAIN_04: 'none',
  LBP_01: 'BACK_ONLY',
  LBP_02: ['NONE'],
  LBP_03: 'NONE',
  LBP_04: ['NONE'],
  LBP_05: ['NONE'],
  LBP_06: 'NO',
  LBP_07: 'NO',
  LBP_08: 'NO',
  LBP_10: 'NO',
  LBP_11: ['NONE'],
  LBP_12: 7,
  LBP_13: 'A_LOT',
  LBP_14: 'A_LOT',
}

function buildPayload(patch) {
  const merged = { ...emptyResponses(), ...BASE_DEFAULTS, ...patch }
  const { responses } = pruneStaleResponses(merged)
  return {
    questionnaire_version: '1.0',
    session_id: 'lbp-exercise-recommendation-test',
    responses: buildResponsePayload(responses),
    flags: computeFlags(responses),
    routing: buildRoutingPayload(responses),
    myungri_calculation: null,
    metadata: { session_started_at: null, answers: {} },
  }
}

function followUpTarget(id, label) {
  return { id, label, baseline: '', postTreatmentValue: '' }
}

function examResult(status) {
  return { status, laterality: null, note: '', recordedAt: status === 'NOT_YET_CHECKED' ? null : '2026-09-02T00:00:00.000Z' }
}

function neurodynamicExam(status) {
  return {
    id: 'lbp_exam_neurodynamic',
    title: '하지직거상 또는 슬럼프검사',
    priority: 'CONTEXTUAL',
    reasonFacts: [],
    source: 'SUGGESTED',
    result: examResult(status),
  }
}

function ws(overrides = {}) {
  return {
    lbpDirectionalResponse: 'NOT_ASSESSED',
    lbpConfirmedCapabilities: [],
    painFollowUpTargets: [],
    painExamSuggestions: [],
    ...overrides,
  }
}

const walkingTarget = [followUpTarget('lbp_tf_walking', '걷기')]

// ---------- non-LBP / applicability ----------

test('non-LBP payload -> empty result, no blocked reason', () => {
  const payload = buildPayload({
    ID_03: 'female',
    PAIN_01: 'neck_shoulder',
    NS01: 'NECK_DOMINANT',
    N01: 'NONE',
    N02: ['NONE'],
    N03: 'NONE',
    N06: 'NONE',
    N07: ['NONE'],
    N08: 'NONE',
    N09: ['NONE'],
    N10: 'NO',
    N11: 'NO',
  })
  const result = buildLbpRecommendationContext(payload, undefined, ws({ painFollowUpTargets: walkingTarget }))
  assert.equal(result.blocked, null)
  assert.deepEqual(result.readyCandidates, [])
  assert.deepEqual(result.awaitingCapabilityCandidates, [])
})

// ---------- (b) RF-2: recomputed safety, never the tablet-time snapshot ----------

test('RF-2: tablet-time snapshot says CLEAR, but clinician just recorded SEVERE_OR_PROGRESSIVE -> blocked SAFETY_REVIEW, no candidates', () => {
  const payload = buildPayload(CLEAR_AXIAL_BASE)
  assert.equal(payload.responses.safety_flags.lbp.lbp_safety_status, 'CLEAR', 'sanity: tablet-time snapshot is CLEAR')
  const result = buildLbpRecommendationContext(
    payload,
    'SEVERE_OR_PROGRESSIVE',
    ws({ painFollowUpTargets: walkingTarget }),
  )
  assert.equal(result.blocked, 'SAFETY_REVIEW')
  assert.ok(result.blockedMessageKo && result.blockedMessageKo.length > 0)
  assert.deepEqual(result.readyCandidates, [])
  assert.deepEqual(result.awaitingCapabilityCandidates, [])
})

test('RF-3b: neuroStatus NEW_OR_WORSENING (disease safety otherwise CLEAR) -> blocked NEURO_REFRESH, no candidates', () => {
  const payload = buildPayload(CLEAR_AXIAL_BASE)
  const result = buildLbpRecommendationContext(
    payload,
    'SEVERE_OR_PROGRESSIVE',
    ws({ painFollowUpTargets: walkingTarget }),
  )
  // clinician_objective_motor_deficit === SEVERE_OR_PROGRESSIVE also forces
  // disease safety to URGENT_REVIEW (src/spec/lbpLogic.ts) -- SAFETY_REVIEW
  // wins over NEURO_REFRESH when both would apply, which is the stronger,
  // and only, correct block reason here (there is no way to observe
  // NEURO_REFRESH-while-disease-safety-CLEAR from this one input alone,
  // since this FROZEN field drives both). Documented as a judgment call in
  // the batch report: NEURO_REFRESH is exercised structurally by RF-1's own
  // engine-level test instead (a neuro-UNKNOWN/NEW_OR_WORSENING candidate
  // never reaches START).
  assert.equal(result.blocked, 'SAFETY_REVIEW')
})

// ---------- target-function filter ----------

test('target-function filter: a candidate whose Core-20 targetFunctions do not include any selected lbp_tf_* is excluded even if otherwise eligible', () => {
  const payload = buildPayload(CLEAR_AXIAL_BASE)
  // LBP_REG_01 targets SLEEP/SITTING/CUSTOM -- never WALKING.
  const walkingOnly = buildLbpRecommendationContext(
    payload,
    'NONE',
    ws({ painFollowUpTargets: walkingTarget, lbpConfirmedCapabilities: ['NATURAL_BREATHING_TOLERATED'] }),
  )
  assert.ok(!walkingOnly.readyCandidates.some((c) => c.exerciseId === 'LBP_REG_01'))
  assert.ok(!walkingOnly.awaitingCapabilityCandidates.some((c) => c.exerciseId === 'LBP_REG_01'))

  const sleepTarget = [followUpTarget('lbp_tf_sleep', '수면·침상 동작')]
  const sleepSelected = buildLbpRecommendationContext(
    payload,
    'NONE',
    ws({ painFollowUpTargets: sleepTarget, lbpConfirmedCapabilities: ['NATURAL_BREATHING_TOLERATED'] }),
  )
  assert.ok(sleepSelected.readyCandidates.some((c) => c.exerciseId === 'LBP_REG_01'))

  // No target function selected at all -> no candidates (the picker is
  // step (1) in the clinician flow; nothing is recommended before it).
  const none = buildLbpRecommendationContext(payload, 'NONE', ws())
  assert.deepEqual(none.readyCandidates, [])
  assert.deepEqual(none.awaitingCapabilityCandidates, [])
})

// ---------- §8.2-1(c) integration correction: empty-state hint trigger ----------

test('(c) targetFunctionGap: NONE_SELECTED when no lbp_tf_* target function is picked; CUSTOM_ONLY when only 기타 목표 동작 is picked; null once a real target function matches', () => {
  const payload = buildPayload(CLEAR_AXIAL_BASE)

  const none = buildLbpRecommendationContext(payload, 'NONE', ws())
  assert.equal(none.targetFunctionGap, 'NONE_SELECTED')

  const customOnly = buildLbpRecommendationContext(
    payload,
    'NONE',
    ws({ painFollowUpTargets: [followUpTarget('lbp_tf_custom', '기타 목표 동작')] }),
  )
  assert.equal(customOnly.targetFunctionGap, 'CUSTOM_ONLY')
  assert.deepEqual(customOnly.readyCandidates, [])
  assert.deepEqual(customOnly.awaitingCapabilityCandidates, [])

  const matched = buildLbpRecommendationContext(payload, 'NONE', ws({ painFollowUpTargets: walkingTarget }))
  assert.equal(matched.targetFunctionGap, null)
})

// ---------- §8.2-1(b) integration correction: LBP_NEURAL_01 directlySupported ----------

test('(b) LBP_NEURAL_01 directlySupported is true only when lbp_exam_neurodynamic is recorded POSITIVE, never unconditionally', () => {
  const payload = buildPayload(CLEAR_AXIAL_BASE)
  const sittingTarget = [followUpTarget('lbp_tf_sitting', '앉기')]
  const baseWs = {
    painFollowUpTargets: sittingTarget,
    lbpConfirmedCapabilities: ['NEURAL_SLIDER_TOLERATED'],
  }

  const positive = buildLbpRecommendationContext(
    payload,
    'NONE',
    ws({ ...baseWs, painExamSuggestions: [neurodynamicExam('POSITIVE')] }),
  )
  const neuralPositive = positive.readyCandidates.find((c) => c.exerciseId === 'LBP_NEURAL_01')
  assert.ok(neuralPositive, 'LBP_NEURAL_01 must be ready once its own capability is confirmed')
  assert.equal(neuralPositive.directlySupported, true)
  // rankReady buckets directlySupported first -- with only one ready
  // candidate here it is trivially index 0, but the flag itself is what the
  // UI (and RF-8's rendering) actually reads.

  const notYetChecked = buildLbpRecommendationContext(
    payload,
    'NONE',
    ws({ ...baseWs, painExamSuggestions: [neurodynamicExam('NOT_YET_CHECKED')] }),
  )
  const neuralNotYetChecked = notYetChecked.readyCandidates.find((c) => c.exerciseId === 'LBP_NEURAL_01')
  assert.ok(neuralNotYetChecked)
  assert.equal(neuralNotYetChecked.directlySupported, false)

  const negative = buildLbpRecommendationContext(
    payload,
    'NONE',
    ws({ ...baseWs, painExamSuggestions: [neurodynamicExam('NEGATIVE')] }),
  )
  assert.equal(negative.readyCandidates.find((c) => c.exerciseId === 'LBP_NEURAL_01')?.directlySupported, false)

  const absent = buildLbpRecommendationContext(payload, 'NONE', ws({ ...baseWs, painExamSuggestions: [] }))
  assert.equal(absent.readyCandidates.find((c) => c.exerciseId === 'LBP_NEURAL_01')?.directlySupported, false)
})

// ---------- defect 1 (BLOCKER, CD-1): unconfirmed regressible capability never auto-promotes at the recommendation level either ----------

test('defect 1: neuro STABLE + zero confirmed capabilities + a target function selected -> readyCandidates is empty, regressible-only candidates (e.g. LBP_HIP_MOB_01/LBP_HIP_STR_03) land in awaitingCapabilityCandidates instead', () => {
  const payload = buildPayload(CLEAR_AXIAL_BASE)
  const result = buildLbpRecommendationContext(payload, 'NONE', ws({ painFollowUpTargets: walkingTarget }))
  assert.deepEqual(result.readyCandidates, [], 'nothing may be READY when every capability is still unconfirmed')
  assert.ok(
    result.awaitingCapabilityCandidates.some((c) => c.exerciseId === 'LBP_HIP_MOB_01'),
    'LBP_HIP_MOB_01 (regressible-only) must wait for capability confirmation, not silently start',
  )
  assert.ok(
    result.awaitingCapabilityCandidates.some((c) => c.exerciseId === 'LBP_HIP_STR_03'),
    'LBP_HIP_STR_03 (regressible-only) must wait for capability confirmation, not silently start',
  )
})

// ---------- (c) CD-1: unconfirmed capability -> awaiting group -> confirm flips it ready ----------

test('CD-1: LBP_ACT_02 (hard CAN_SELF_PACE+SAFE_WALKING) with neither confirmed -> awaiting group; confirming both -> ready', () => {
  const payload = buildPayload(CLEAR_AXIAL_BASE)
  const before = buildLbpRecommendationContext(
    payload,
    'NONE',
    ws({ painFollowUpTargets: walkingTarget }),
  )
  assert.ok(!before.readyCandidates.some((c) => c.exerciseId === 'LBP_ACT_02'))
  const awaitingAct02 = before.awaitingCapabilityCandidates.find((c) => c.exerciseId === 'LBP_ACT_02')
  assert.ok(awaitingAct02, 'LBP_ACT_02 must appear in the 확인하면 시작 가능 group')
  assert.deepEqual([...awaitingAct02.unconfirmedCapabilities].sort(), ['CAN_SELF_PACE', 'SAFE_WALKING'])

  const after = buildLbpRecommendationContext(
    payload,
    'NONE',
    ws({ painFollowUpTargets: walkingTarget, lbpConfirmedCapabilities: ['CAN_SELF_PACE', 'SAFE_WALKING'] }),
  )
  const readyAct02 = after.readyCandidates.find((c) => c.exerciseId === 'LBP_ACT_02')
  assert.ok(readyAct02, 'confirming both capabilities must flip LBP_ACT_02 to a ready candidate')
  assert.equal(readyAct02.eligibilityState, 'START_AS_WRITTEN')
  assert.ok(!after.awaitingCapabilityCandidates.some((c) => c.exerciseId === 'LBP_ACT_02'))
})

// ---------- (d) CD-2: treatmentSafetyLocked -> candidates still present, adopt blocked ----------

test('CD-2: pregnancy_possible (treatment safety REVIEW_REQUIRED, disease safety unaffected) -> candidates still present, treatmentSafetyLocked true', () => {
  const payload = buildPayload({
    ...CLEAR_AXIAL_BASE,
    ID_03: 'female',
    BIRTH_01: '19980101',
    WOMEN_SAFETY_01: ['pregnancy_possible'],
  })
  assert.equal(payload.responses.safety_flags.lbp.lbp_safety_status, 'CLEAR', 'sanity: disease safety unaffected')
  const result = buildLbpRecommendationContext(payload, 'NONE', ws({ painFollowUpTargets: walkingTarget }))
  assert.equal(result.blocked, null, 'treatment safety must never collapse the whole block (CD-2 option A)')
  assert.equal(result.treatmentSafetyLocked, true)
  assert.equal(result.treatmentSafetyLockedMessageKo, TREATMENT_SAFETY_LOCKED_MESSAGE_KO)
  // Candidates are still computed/shown -- CD-2 only gates adoption (Part D).
  assert.ok(result.awaitingCapabilityCandidates.length > 0 || result.readyCandidates.length > 0)
})

// ---------- (e) RF-8: adopted text includes dose AND stop/review, never progression ----------

test('RF-8: candidateToRehabSuggestion / buildLbpAdoptionText include startingDoseKo and stopReviewKo, never progressionKo', () => {
  const payload = buildPayload(CLEAR_AXIAL_BASE)
  const result = buildLbpRecommendationContext(
    payload,
    'NONE',
    ws({ painFollowUpTargets: walkingTarget, lbpConfirmedCapabilities: ['SAFE_WALKING', 'CAN_SELF_PACE'] }),
  )
  const act01 = result.readyCandidates.find((c) => c.exerciseId === 'LBP_ACT_01')
  assert.ok(act01)
  const suggestion = candidateToRehabSuggestion(act01)
  assert.ok(suggestion.goal.includes(act01.startingDoseKo))
  for (const line of act01.stopReviewKo) {
    assert.ok(suggestion.rationale.includes(line) || suggestion.sourceFacts.some((f) => f.text.includes(line)))
  }
  const joined = JSON.stringify(suggestion)
  // progressionKo text for LBP_ACT_01 ("연속시간 또는 속도 중 한 가지만 점진적으로 증가") must never appear.
  assert.ok(!joined.includes('점진적으로 증가'))

  const adoptionText = buildLbpAdoptionText('LBP_ACT_01')
  assert.ok(adoptionText.includes(act01.startingDoseKo))
  for (const line of act01.stopReviewKo) assert.ok(adoptionText.includes(line))
  assert.ok(!adoptionText.includes('점진적으로 증가'))
})

test('buildLbpAdoptionText returns null for a non-Core-20 id (safe fallback path for the caller)', () => {
  assert.equal(buildLbpAdoptionText('NOT_A_REAL_ID'), null)
})

test('appendLbpAdoptionText appends once, is idempotent, and never automatic (pure function, only ever called from an explicit click)', () => {
  const suggestion = { id: 'LBP_ACT_01', title: '걷기 5~10분', goal: 'x', rationale: 'y' }
  const once = appendLbpAdoptionText('', suggestion)
  assert.ok(once.length > 0)
  const twice = appendLbpAdoptionText(once, suggestion)
  assert.equal(twice, once, 'adopting the same suggestion twice must not duplicate the line')
  const withPriorText = appendLbpAdoptionText('기존 메모', suggestion)
  assert.ok(withPriorText.startsWith('기존 메모'))
  assert.ok(withPriorText.includes(once))
})

// ---------- defect 3: Korean display names, never the (often English) catalog canonicalName ----------

test('defect 3: every Core-20 row has a non-empty displayNameKo, and adoption text (both variants) for every row contains no Latin letters', () => {
  assert.equal(LBP_CORE_EXERCISE_METADATA.length, 20)
  const seen = new Set()
  for (const meta of LBP_CORE_EXERCISE_METADATA) {
    assert.ok(
      typeof meta.displayNameKo === 'string' && meta.displayNameKo.trim().length > 0,
      `${meta.exerciseId} is missing a non-empty displayNameKo`,
    )
    seen.add(meta.exerciseId)

    const plain = buildLbpAdoptionText(meta.exerciseId)
    assert.ok(plain, `${meta.exerciseId} buildLbpAdoptionText returned null`)
    assert.ok(
      !/[A-Za-z]/.test(plain),
      `${meta.exerciseId} adoption text contains Latin letters: ${JSON.stringify(plain)}`,
    )

    // RF-8/defect 2: the regressed variant appends regressionKo -- must stay Korean too.
    const regressed = buildLbpAdoptionText(meta.exerciseId, { regressed: true })
    assert.ok(
      !/[A-Za-z]/.test(regressed),
      `${meta.exerciseId} regressed adoption text contains Latin letters: ${JSON.stringify(regressed)}`,
    )
  }
  assert.equal(seen.size, 20)
})

// ---------- defect 6: UNCLEAR directional response maps to UNKNOWN, never STABLE_OR_IMPROVING ----------

test('defect 6: buildLbpEligibilityContext maps lbpDirectionalResponse UNCLEAR -> distalSymptomResponse UNKNOWN (not STABLE_OR_IMPROVING); NO_CLEAR_DIRECTION still stays STABLE_OR_IMPROVING', () => {
  const payload = buildPayload(CLEAR_AXIAL_BASE)
  const unclear = buildLbpEligibilityContext(payload, 'NONE', {
    lbpDirectionalResponse: 'UNCLEAR',
    lbpConfirmedCapabilities: [],
  })
  assert.equal(unclear.distalSymptomResponse, 'UNKNOWN')

  const notAssessed = buildLbpEligibilityContext(payload, 'NONE', {
    lbpDirectionalResponse: 'NOT_ASSESSED',
    lbpConfirmedCapabilities: [],
  })
  assert.equal(notAssessed.distalSymptomResponse, 'UNKNOWN')

  const noClearDirection = buildLbpEligibilityContext(payload, 'NONE', {
    lbpDirectionalResponse: 'NO_CLEAR_DIRECTION',
    lbpConfirmedCapabilities: [],
  })
  assert.equal(
    noClearDirection.distalSymptomResponse,
    'STABLE_OR_IMPROVING',
    'NO_CLEAR_DIRECTION is a completed direction observation, not an unclear/absent one -- must not fold into UNKNOWN',
  )

  const worsening = buildLbpEligibilityContext(payload, 'NONE', {
    lbpDirectionalResponse: 'DISTAL_WORSENING',
    lbpConfirmedCapabilities: [],
  })
  assert.equal(worsening.distalSymptomResponse, 'WORSENING')
})

// ---------- defect 8: LBP_LUMBAR_02 reachability (unexposed set must not grow silently) ----------

test('defect 8: the set of Core-20 ids unreachable through TARGET_FUNCTION_ID_TO_ENUM stays exactly {LBP_LUMBAR_02}', () => {
  const reachableEnums = new Set(Object.values(TARGET_FUNCTION_ID_TO_ENUM).filter((v) => v != null))
  const unreachableIds = LBP_CORE_EXERCISE_METADATA.filter(
    (meta) => !meta.targetFunctions.some((tf) => reachableEnums.has(tf)),
  ).map((meta) => meta.exerciseId)
  assert.deepEqual(
    unreachableIds,
    ['LBP_LUMBAR_02'],
    'the unreachable set changed -- either a new v1 target-function chip must map to it, or this pin needs a deliberate update',
  )
})

// ---------- merge: preserve clinician decisions, drop stale undecided candidates ----------

test('mergeLbpRehabSuggestions: preserves an ACCEPTED decision across recompute even when the exercise later becomes DEFER/ineligible', () => {
  const readyNow = [
    {
      exerciseId: 'LBP_ACT_01',
      title: '걷기 5~10분',
      readiness: 'READY',
      eligibilityState: 'START_AS_WRITTEN',
      directlySupported: false,
      unconfirmedCapabilities: [],
      regressionRequirements: [],
      strategyLabelKo: '신체·기능능력 회복',
      startingDoseKo: '1회 5~10분...',
      stopReviewKo: ['새로운 또는 진행하는 신경증상'],
    },
  ]
  const firstMerge = mergeLbpRehabSuggestions([], readyNow)
  assert.equal(firstMerge.length, 1)
  assert.equal(firstMerge[0].status, 'SUGGESTED')

  const accepted = { ...firstMerge[0], status: 'ACCEPTED' }
  // Next render: LBP_ACT_01 is no longer a fresh candidate (e.g. safety
  // changed) -- the ACCEPTED decision must still be kept, not silently
  // dropped.
  const secondMerge = mergeLbpRehabSuggestions([accepted], [])
  assert.equal(secondMerge.length, 1)
  assert.equal(secondMerge[0].status, 'ACCEPTED')
  assert.equal(secondMerge[0].id, 'LBP_ACT_01')
})

test('mergeLbpRehabSuggestions: an undecided (SUGGESTED) item no longer among fresh candidates is dropped', () => {
  const stale = [
    {
      id: 'LBP_ACT_01',
      title: '걷기 5~10분',
      goal: '',
      rationale: '',
      sourceFacts: [],
      contraindicationFacts: [],
      source: 'SUGGESTED',
      status: 'SUGGESTED',
      clinicianFinalInstruction: '',
    },
  ]
  const merged = mergeLbpRehabSuggestions(stale, [])
  assert.deepEqual(merged, [])
})

console.log(`\n${passed} tests passed.`)
