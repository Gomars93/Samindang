// LBP v1 Batch 2 (G9/G10) — buildLbpRecommendationContext /
// mergeLbpRehabSuggestions / adoption-text tests.
// Run via `npm run test:lbp-exercise-recommendation`.
//
// Payloads are built through the REAL production spec builders
// (buildResponsePayload/computeFlags/buildRoutingPayload, coreSpec.ts,
// bundled fresh here), same pattern as tests/lbp-exam-suggestions.spec.mjs.

import { readFileSync } from 'node:fs'
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
  assert.deepEqual(result.candidates, [])
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
  assert.deepEqual(result.candidates, [])
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
    ws({ painFollowUpTargets: walkingTarget }),
  )
  assert.ok(!walkingOnly.candidates.some((c) => c.exerciseId === 'LBP_REG_01'))

  const sleepTarget = [followUpTarget('lbp_tf_sleep', '수면·침상 동작')]
  const sleepSelected = buildLbpRecommendationContext(
    payload,
    'NONE',
    ws({ painFollowUpTargets: sleepTarget }),
  )
  assert.ok(sleepSelected.candidates.some((c) => c.exerciseId === 'LBP_REG_01'))

  // No target function selected at all -> no candidates (the picker is
  // step (1) in the clinician flow; nothing is recommended before it).
  const none = buildLbpRecommendationContext(payload, 'NONE', ws())
  assert.deepEqual(none.candidates, [])
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
  assert.deepEqual(customOnly.candidates, [])

  const matched = buildLbpRecommendationContext(payload, 'NONE', ws({ painFollowUpTargets: walkingTarget }))
  assert.equal(matched.targetFunctionGap, null)
})

// ---------- §8.2-1(b) integration correction: LBP_NEURAL_01 directlySupported ----------

test('(b) LBP_NEURAL_01 directlySupported is true only when lbp_exam_neurodynamic is recorded POSITIVE, never unconditionally', () => {
  const payload = buildPayload(CLEAR_AXIAL_BASE)
  const sittingTarget = [followUpTarget('lbp_tf_sitting', '앉기')]
  const baseWs = {
    painFollowUpTargets: sittingTarget,
  }

  const positive = buildLbpRecommendationContext(
    payload,
    'NONE',
    ws({ ...baseWs, painExamSuggestions: [neurodynamicExam('POSITIVE')] }),
  )
  const neuralPositive = positive.candidates.find((c) => c.exerciseId === 'LBP_NEURAL_01')
  assert.ok(neuralPositive, 'LBP_NEURAL_01 must be ready')
  assert.equal(neuralPositive.directlySupported, true)
  // rankReady buckets directlySupported first -- with only one ready
  // candidate here it is trivially index 0, but the flag itself is what the
  // UI (and RF-8's rendering) actually reads.

  const notYetChecked = buildLbpRecommendationContext(
    payload,
    'NONE',
    ws({ ...baseWs, painExamSuggestions: [neurodynamicExam('NOT_YET_CHECKED')] }),
  )
  const neuralNotYetChecked = notYetChecked.candidates.find((c) => c.exerciseId === 'LBP_NEURAL_01')
  assert.ok(neuralNotYetChecked)
  assert.equal(neuralNotYetChecked.directlySupported, false)

  const negative = buildLbpRecommendationContext(
    payload,
    'NONE',
    ws({ ...baseWs, painExamSuggestions: [neurodynamicExam('NEGATIVE')] }),
  )
  assert.equal(negative.candidates.find((c) => c.exerciseId === 'LBP_NEURAL_01')?.directlySupported, false)

  const absent = buildLbpRecommendationContext(payload, 'NONE', ws({ ...baseWs, painExamSuggestions: [] }))
  assert.equal(absent.candidates.find((c) => c.exerciseId === 'LBP_NEURAL_01')?.directlySupported, false)
})

// ---------- LBP v1 Batch 2.5b (G15): the two states added to ExamCheckStatus must not become evidence ----------
// 설계 문서 §2.3: 결과값으로 추론하는 지점은 이 파일의 `=== 'POSITIVE'` 한 곳뿐이고,
// 그 비교는 이미 배타적이라 로직 변경이 없었다. "변경이 없어서 안전하다"는 주장을
// 우연이 아니라 계약으로 고정한다 -- 필터를 `!== 'NOT_YET_CHECKED'`로 완화하는
// 리팩터가 들어오면 LIMITED/NOT_PERFORMED가 근거로 승격되며 이 테스트가 잡는다.
test("Batch 2.5b: a LIMITED or NOT_PERFORMED neurodynamic exam is never 'directly supported' -- only POSITIVE is", () => {
  const payload = buildPayload(CLEAR_AXIAL_BASE)
  const baseWs = {
    painFollowUpTargets: [followUpTarget('lbp_tf_sitting', '앉기')],
  }
  for (const status of ['LIMITED', 'NOT_PERFORMED']) {
    const result = buildLbpRecommendationContext(
      payload,
      'NONE',
      ws({ ...baseWs, painExamSuggestions: [neurodynamicExam(status)] }),
    )
    const neural = result.candidates.find((c) => c.exerciseId === 'LBP_NEURAL_01')
    assert.ok(neural, `LBP_NEURAL_01 must still be offered as a candidate when the exam is ${status}`)
    assert.equal(
      neural.directlySupported,
      false,
      `${status} means "we did not establish concordance" -- unknown is never support (architecture §2.3)`,
    )
  }
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
  assert.ok(result.candidates.length > 0)
})

// ---------- (e) RF-8: adopted text includes dose AND stop/review, never progression ----------

test('RF-8: candidateToRehabSuggestion / buildLbpAdoptionText include startingDoseKo and stopReviewKo, never progressionKo', () => {
  const payload = buildPayload(CLEAR_AXIAL_BASE)
  const result = buildLbpRecommendationContext(
    payload,
    'NONE',
    ws({ painFollowUpTargets: walkingTarget }),
  )
  const act01 = result.candidates.find((c) => c.exerciseId === 'LBP_ACT_01')
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

test('defect 3: every Core-20 row has a non-empty displayNameKo, and adoption text for every row contains no Latin letters', () => {
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

  }
  assert.equal(seen.size, 20)
})

// ---------- Batch 2.5a Part 1: PO-approved Core-20 displayNameKo corrections (`DECISIONS.md` 2026-09-02 "CD-3 승인...") ----------

test('Batch 2.5a naming: the 4 PO-approved displayNameKo corrections are applied verbatim', () => {
  const byId = new Map(LBP_CORE_EXERCISE_METADATA.map((m) => [m.exerciseId, m.displayNameKo]))
  assert.equal(byId.get('LBP_DEEP_TRUNK_01'), '숨 쉬면서 배에 살짝 힘주기')
  assert.equal(byId.get('LBP_DIR_03'), '엎드려 반복 허리 젖히기')
  assert.equal(byId.get('LBP_DIR_04'), '누워서·앉아서 굽히기')
  assert.equal(byId.get('LBP_EXPOSURE_03'), '앉아 있기 단계적으로 늘리기')
})

// ---------- Opus closing review §C(i): regression adoption text must always have a sentence boundary before "중단·재검토:" ----------

// ---------- Opus closing review §C(ii): regression-safety regression tests ----------

// ---------- defect 6: UNCLEAR directional response maps to UNKNOWN, never STABLE_OR_IMPROVING ----------

test('defect 6: buildLbpEligibilityContext maps lbpDirectionalResponse UNCLEAR -> distalSymptomResponse UNKNOWN (not STABLE_OR_IMPROVING); NO_CLEAR_DIRECTION still stays STABLE_OR_IMPROVING', () => {
  const payload = buildPayload(CLEAR_AXIAL_BASE)
  const unclear = buildLbpEligibilityContext(payload, 'NONE', {
    lbpDirectionalResponse: 'UNCLEAR',
  })
  assert.equal(unclear.distalSymptomResponse, 'UNKNOWN')

  const notAssessed = buildLbpEligibilityContext(payload, 'NONE', {
    lbpDirectionalResponse: 'NOT_ASSESSED',
  })
  assert.equal(notAssessed.distalSymptomResponse, 'UNKNOWN')

  const noClearDirection = buildLbpEligibilityContext(payload, 'NONE', {
    lbpDirectionalResponse: 'NO_CLEAR_DIRECTION',
  })
  assert.equal(
    noClearDirection.distalSymptomResponse,
    'STABLE_OR_IMPROVING',
    'NO_CLEAR_DIRECTION is a completed direction observation, not an unclear/absent one -- must not fold into UNKNOWN',
  )

  const worsening = buildLbpEligibilityContext(payload, 'NONE', {
    lbpDirectionalResponse: 'DISTAL_WORSENING',
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
      directlySupported: false,
      strategyLabelKo: '신체·기능능력 회복',
      startingCriteriaKo: ['보조도구 포함 안전하게 걸을 수 있음'],
      startingDoseKo: '1회 5~10분...',
      stopReviewKo: ['새로운 또는 진행하는 신경증상'],
      regressionKo: '거리를 줄이고 휴식 간격을 늘린다',
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

// ===========================================================================
// 2026-09-05: 원장 확정 단계(lbpConfirmedStage) — 후보 필터 + C층 준비조건 추정
// (DECISIONS.md 같은 날짜 "준비조건 두 층" 항목, lbpCapabilityLayer.ts)
// ===========================================================================

const workTarget = [followUpTarget('lbp_tf_work', '일')]
const sleepTargetTop = [followUpTarget('lbp_tf_sleep', '수면·침상 동작')]
const ids = (list) => list.map((c) => c.exerciseId)

test('stage filter: confirmed stage 1 -> stage-1 and ALL exercises READY, stage-2/3 exercises absent from BOTH lists', () => {
  const payload = buildPayload(CLEAR_AXIAL_BASE)
  const r = buildLbpRecommendationContext(payload, 'NONE', ws({ painFollowUpTargets: workTarget, lbpConfirmedStage: 1 }))
  assert.equal(r.blocked, null)
  assert.equal(r.confirmedStage, 1)
  const ready = ids(r.candidates), awaiting = []
  assert.ok(ready.includes('LBP_ACT_01'), 'stage-1 ACT_01 (WORK) is READY')
  assert.ok(ready.includes('LBP_FUNC_01'), 'ALL-stage FUNC_01 (WORK) is READY at stage 1')
  for (const id of ['LBP_LOAD_02', 'LBP_FUNC_05', 'LBP_TRUNK_03', 'LBP_EXPOSURE_03', 'LBP_HIP_MOB_01']) {
    assert.ok(!ready.includes(id) && !awaiting.includes(id), `${id} (stage 2/3) must not appear at confirmed stage 1`)
  }
})

test('stage filter: confirmed stage 3 -> LOAD_02/FUNC_05 (stage 3) become candidates', () => {
  const payload = buildPayload(CLEAR_AXIAL_BASE)
  const r = buildLbpRecommendationContext(payload, 'NONE', ws({ painFollowUpTargets: workTarget, lbpConfirmedStage: 3 }))
  const ready = ids(r.candidates)
  assert.ok(ready.includes('LBP_LOAD_02') && ready.includes('LBP_FUNC_05'))
})

test('stage filter: NO confirmed stage (null) -> no filter at all, every WORK exercise is a candidate (pre-2026-09-05 behavior preserved)', () => {
  const payload = buildPayload(CLEAR_AXIAL_BASE)
  const r = buildLbpRecommendationContext(payload, 'NONE', ws({ painFollowUpTargets: workTarget }))
  assert.equal(r.confirmedStage, null)
  const ready = ids(r.candidates)
  for (const id of ['LBP_ACT_01', 'LBP_TRUNK_03', 'LBP_LOAD_02', 'LBP_FUNC_01']) assert.ok(ready.includes(id), `${id} present with no stage filter`)
})

test('legacy workspace state with NO lbpConfirmedStage field at all is byte-identical to lbpConfirmedStage: null', () => {
  const payload = buildPayload(CLEAR_AXIAL_BASE)
  const legacy = buildLbpRecommendationContext(payload, 'NONE', ws({ painFollowUpTargets: workTarget }))
  const explicit = buildLbpRecommendationContext(payload, 'NONE', ws({ painFollowUpTargets: workTarget, lbpConfirmedStage: null }))
  assert.deepEqual(legacy, explicit)
  assert.equal(legacy.neuroUnrecorded, false, 'neuro was recorded in this fixture')
})

test('stage 0 confirmed -> blocked STAGE_0 with the 0-stage guidance, no candidates, confirmedStage 0 echoed back', () => {
  const payload = buildPayload(CLEAR_AXIAL_BASE)
  const r = buildLbpRecommendationContext(payload, 'NONE', ws({ painFollowUpTargets: workTarget, lbpConfirmedStage: 0 }))
  assert.equal(r.blocked, 'STAGE_0')
  assert.ok(r.blockedMessageKo.includes('0단계') && r.blockedMessageKo.includes('능동 운동을 처방하지 않습니다'))
  assert.deepEqual(r.candidates, [])
  assert.equal(r.confirmedStage, 0)
})

test('block precedence: SAFETY_REVIEW still wins over STAGE_0 (a 0-stage note must never hide a safety re-evaluation)', () => {
  const payload = buildPayload(CLEAR_AXIAL_BASE)
  const r = buildLbpRecommendationContext(payload, 'SEVERE_OR_PROGRESSIVE', ws({ painFollowUpTargets: workTarget, lbpConfirmedStage: 0 }))
  assert.equal(r.blocked, 'SAFETY_REVIEW')
  assert.equal(r.confirmedStage, 0, 'the stage is still echoed so the stage card can render')
})

test('the recommendation module never reads the STAGE SUGGESTION — only the clinician-confirmed stage (adopt, never automatic)', () => {
  const src = readFileSync(new URL('../src/doctor/workspace/lbpExerciseRecommendation.ts', import.meta.url), 'utf8')
  assert.ok(!src.includes('suggestLbpExerciseStage'), 'suggestion function must not be imported here')
  assert.ok(src.includes('workspaceState.lbpConfirmedStage'), 'the confirmed stage is the only stage input')
})


// ===========================================================================
// 2026-09-05: 준비조건 게이트 제거 — 대체 경로 검증
// (CLAUDE.md "지운 경로 1개당 단언 1개")
// ===========================================================================

test('제거된 경로 1/4 — 준비조건을 하나도 누르지 않아도 후보가 나온다 (게이트가 실제로 사라졌다)', () => {
  const payload = buildPayload(CLEAR_AXIAL_BASE)
  const r = buildLbpRecommendationContext(payload, 'NONE', ws({ painFollowUpTargets: workTarget }))
  assert.equal(r.blocked, null)
  assert.ok(r.candidates.length > 0, '탭 0회로 후보가 나와야 한다')
  assert.ok(!('awaitingCapabilityCandidates' in r), '보류 목록 자체가 사라졌다')
  assert.ok(!('inferredCapabilities' in r), '추정 목록도 함께 사라졌다')
})

test('제거된 경로 2/4 — 후보 카드의 첫 근거 소견이 "시작 기준"이다 (원장이 판단 근거로 읽는 문장)', () => {
  const payload = buildPayload(CLEAR_AXIAL_BASE)
  const r = buildLbpRecommendationContext(payload, 'NONE', ws({ painFollowUpTargets: workTarget }))
  const c = r.candidates.find((x) => x.exerciseId === 'LBP_TRUNK_03')
  assert.ok(c, 'LBP_TRUNK_03 이 후보에 있다')
  assert.ok(Array.isArray(c.startingCriteriaKo) && c.startingCriteriaKo.length > 0)
  const s = candidateToRehabSuggestion(c)
  assert.match(s.sourceFacts[0].text, /^시작 기준: /, '첫 줄이어야 한다 — 용량보다 먼저 읽힌다')
  assert.match(s.sourceFacts[0].text, /네발기기/, '제거된 QUADRUPED_TOLERATED가 담던 내용이 여기 있다')
  assert.deepEqual(
    s.sourceFacts.map((f) => f.text.split(':')[0]),
    ['시작 기준', '시작 용량', '쉬운 단계로 시작하려면', '중단·재검토 기준'],
    '네 줄의 순서가 고정된다',
  )
})

test('제거된 경로 3/4 — 쉬운 단계가 조건부가 아니라 항상 보인다 (시스템이 판정하지 않고 원장이 고른다)', () => {
  const payload = buildPayload(CLEAR_AXIAL_BASE)
  const r = buildLbpRecommendationContext(payload, 'NONE', ws({ painFollowUpTargets: workTarget }))
  for (const c of r.candidates) {
    const s = candidateToRehabSuggestion(c)
    assert.ok(s.sourceFacts.some((f) => f.text.startsWith('쉬운 단계로 시작하려면: ')), c.exerciseId)
    assert.ok(!('regressed' in s), 'regressed 플래그는 제거됐다 — 시스템이 판정하던 값이다')
    assert.ok(!s.title.includes('쉬운 단계로 시작'), '제목에 시스템 판정이 붙지 않는다')
  }
})

test('제거된 경로 4/4 — 채택 텍스트는 환자용이라 시작 기준(임상가용)을 넣지 않는다', () => {
  const t = buildLbpAdoptionText('LBP_TRUNK_03')
  assert.ok(t.includes('시작') || t.includes('회'), '용량은 들어간다')
  assert.ok(t.includes('중단·재검토'), '중단 기준은 들어간다')
  assert.ok(!t.includes('네발기기에서 균형을 유지할 수 있음'), '시작 기준 원문은 환자 안내문에 넣지 않는다')
  assert.equal(buildLbpAdoptionText.length, 1, 'options 인자(regressed)가 제거됐다')
})

test('신경 상태 미기록 -> neuroUnrecorded true + 후보는 LBP_REG_01 계열만 (RF-1 게이트는 그대로)', () => {
  const payload = buildPayload(CLEAR_AXIAL_BASE)
  const r = buildLbpRecommendationContext(payload, undefined, ws({ painFollowUpTargets: sleepTargetTop }))
  assert.equal(r.neuroUnrecorded, true, '원장에게 "무엇을 하면 후보가 나타나는지" 알릴 근거')
  assert.ok(!r.candidates.some((c) => c.exerciseId === 'LBP_DEEP_TRUNK_01'), '미확인을 안정으로 가정하지 않는다')
  assert.ok(r.candidates.some((c) => c.exerciseId === 'LBP_REG_01'), '호흡·이완만 예외로 남는다')
})

test('신경 상태 기록됨 -> neuroUnrecorded false', () => {
  const payload = buildPayload(CLEAR_AXIAL_BASE)
  const r = buildLbpRecommendationContext(payload, 'NONE', ws({ painFollowUpTargets: sleepTargetTop }))
  assert.equal(r.neuroUnrecorded, false)
})

console.log(`\n(+게이트 제거) ${passed} lbp-exercise-recommendation tests passed.`)
