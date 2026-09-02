// LBP v1 Batch 1 (G2/G3/G4) — generateLbpExamSuggestions/
// mergeLbpExamSuggestions/directional-response guard tests.
// Run via `npm run test:lbp-exam-suggestions`.
//
// Payloads are built through the REAL production spec builders
// (buildResponsePayload/computeFlags/buildRoutingPayload,
// coreSpec.ts, bundled fresh here) on hand-written Responses, exactly
// like src/doctor/fixtures.ts does — never a hand-typed safety_flags.lbp
// object — so a spec change breaks/matches these automatically. The one
// deliberate exception is the "손상 flags" defensive tests, which start
// from a real computed payload and then corrupt one field, mirroring the
// "가비지 상태" pattern already used in tests/doctor-workspace.spec.mjs.

import assert from 'node:assert/strict'
import {
  ALL_QUESTIONS,
  buildResponsePayload,
  buildRoutingPayload,
  computeFlags,
  pruneStaleResponses,
} from './.lbp-exam-suggestions-corespec-bundle.mjs'
import {
  generateLbpExamSuggestions,
  mergeLbpExamSuggestions,
  LBP_CLINICIAN_ADDABLE_EXAMS,
  LBP_EXAM_HELP,
  LBP_DIRECTIONAL_RESPONSE_OPTIONS,
  LBP_DIRECTIONAL_RESPONSE_HELP,
  isValidLbpDirectionalResponse,
  lbpDirectionalResponseLabel,
} from './.lbp-exam-suggestions-bundle.mjs'
import {
  LBP_TARGET_FUNCTION_OPTIONS,
  isLbpTargetFunctionId,
  selectedLbpTargetFunctions,
} from './.lbp-target-function-bundle.mjs'

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
}

// Clean, safety-CLEAR LBP baseline (mirrors PAIN_SCENARIO_1's "단순 기계적
// 요통" pattern in workspaceFixtures.ts): axial-only, no leg symptom, no
// claudication, no red flags, no trauma.
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

// A non-LBP pain payload (neck/shoulder primary concern).
const NON_LBP_BASE = {
  ID_01: '테스트2',
  ID_03: 'female',
  BIRTH_01: '19900101',
  VISIT_01: 'symptom',
  VISIT_02_SYMPTOM_MAIN: 'pain',
  VISIT_03_SYMPTOM_DURATION: '1_3m',
  VISIT_04_SYMPTOM_IMPACT: 'mild',
  SECONDARY_01: ['none'],
  SAFETY_01: ['none'],
  PAIN_01: 'neck_shoulder',
  PAIN_02: ['aching'],
  PAIN_04: 'none',
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
}

function buildPayload(patch) {
  const merged = { ...emptyResponses(), ...BASE_DEFAULTS, ...patch }
  const { responses } = pruneStaleResponses(merged)
  return {
    questionnaire_version: '1.0',
    session_id: 'lbp-exam-suggestions-test',
    responses: buildResponsePayload(responses),
    flags: computeFlags(responses),
    routing: buildRoutingPayload(responses),
    myungri_calculation: null,
    metadata: { session_started_at: null, answers: {} },
  }
}

// ---------- 1. rule table ----------

test('non-LBP payload -> []', () => {
  const payload = buildPayload(NON_LBP_BASE)
  assert.equal(payload.responses.safety_flags.lbp, null, 'sanity: this payload really is non-LBP')
  assert.deepEqual(generateLbpExamSuggestions(payload), [])
})

test('LBP CLEAR simple axial (leg symptom NO, LBP_08 NO) -> only 목표 동작 재현', () => {
  const payload = buildPayload(CLEAR_AXIAL_BASE)
  assert.equal(payload.responses.safety_flags.lbp.lbp_safety_status, 'CLEAR', 'sanity: CLEAR')
  assert.equal(payload.responses.safety_flags.lbp.leg_symptom_present, 'NO', 'sanity: leg symptom NO')
  const items = generateLbpExamSuggestions(payload)
  assert.equal(items.length, 1)
  assert.equal(items[0].id, 'lbp_exam_target_function_reproduction')
  assert.equal(items[0].title, '목표 동작 재현')
  assert.equal(items[0].priority, 'CONTEXTUAL')
  assert.equal(items[0].source, 'SUGGESTED')
  assert.equal(items[0].result.status, 'NOT_YET_CHECKED')
})

test('leg symptom YES -> + SLR/슬럼프', () => {
  const payload = buildPayload({ ...CLEAR_AXIAL_BASE, LBP_01: 'BACK_ONLY', LBP_02: ['NONE'], LBP_03: 'RIGHT' })
  assert.equal(payload.responses.safety_flags.lbp.leg_symptom_present, 'YES', 'sanity: leg symptom YES')
  assert.equal(payload.responses.safety_flags.lbp.lbp_safety_status, 'CLEAR', 'sanity: still CLEAR')
  const items = generateLbpExamSuggestions(payload)
  const ids = items.map((i) => i.id)
  assert.deepEqual(ids, ['lbp_exam_target_function_reproduction', 'lbp_exam_neurodynamic'])
  const slr = items.find((i) => i.id === 'lbp_exam_neurodynamic')
  assert.equal(slr.title, '하지직거상 또는 슬럼프검사')
})

test('LBP_08 YES (leg symptom stays UNKNOWN, via LBP_01 UNKNOWN) -> + 보행, no SLR/슬럼프', () => {
  const payload = buildPayload({
    ...CLEAR_AXIAL_BASE,
    LBP_01: 'UNKNOWN',
    LBP_03: 'NONE',
    LBP_08: 'YES',
    LBP_09: 'NO',
  })
  assert.equal(payload.responses.safety_flags.lbp.leg_symptom_present, 'UNKNOWN', 'sanity: leg symptom UNKNOWN, not YES')
  assert.equal(payload.responses.safety_flags.lbp.lbp_safety_status, 'CLEAR', 'sanity: still CLEAR')
  assert.equal(payload.responses.modules.lbp.claudication_walking, 'YES', 'sanity: LBP_08 really is YES')
  const items = generateLbpExamSuggestions(payload)
  const ids = items.map((i) => i.id)
  assert.deepEqual(ids, ['lbp_exam_target_function_reproduction', 'lbp_exam_walking_tolerance'])
  const walking = items.find((i) => i.id === 'lbp_exam_walking_tolerance')
  assert.equal(walking.title, '실제 보행 가능시간·거리 확인')
})

test('leg symptom UNKNOWN never triggers SLR/슬럼프 (UNKNOWN never triggers anything)', () => {
  const payload = buildPayload({ ...CLEAR_AXIAL_BASE, LBP_01: 'BACK_ONLY', LBP_02: ['NONE'], LBP_03: 'UNKNOWN' })
  assert.equal(payload.responses.safety_flags.lbp.leg_symptom_present, 'UNKNOWN', 'sanity: leg symptom UNKNOWN')
  const items = generateLbpExamSuggestions(payload)
  assert.ok(!items.some((i) => i.id === 'lbp_exam_neurodynamic'))
})

test('lbp_safety_status REVIEW_REQUIRED -> []', () => {
  // Trauma answered YES forces review=true even with everything else clean.
  const payload = buildPayload({ ...CLEAR_AXIAL_BASE, LBP_06: 'YES' })
  assert.equal(payload.responses.safety_flags.lbp.lbp_safety_status, 'REVIEW_REQUIRED', 'sanity: REVIEW_REQUIRED')
  assert.deepEqual(generateLbpExamSuggestions(payload), [])
})

test('lbp_safety_status URGENT_REVIEW -> []', () => {
  const payload = buildPayload({ ...CLEAR_AXIAL_BASE, LBP_04: ['URINARY_RETENTION'] })
  assert.equal(payload.responses.safety_flags.lbp.lbp_safety_status, 'URGENT_REVIEW', 'sanity: URGENT_REVIEW')
  assert.deepEqual(generateLbpExamSuggestions(payload), [])
})

test('corrupted flags (wrong-typed lbp_safety_status) -> [] (fail closed, never crash)', () => {
  const payload = buildPayload(CLEAR_AXIAL_BASE)
  payload.responses.safety_flags.lbp = { ...payload.responses.safety_flags.lbp, lbp_safety_status: 'BOGUS' }
  assert.deepEqual(generateLbpExamSuggestions(payload), [])
})

test('corrupted flags (lbp is a non-object) -> [] (fail closed, never crash)', () => {
  const payload = buildPayload(CLEAR_AXIAL_BASE)
  payload.responses.safety_flags.lbp = 'garbage'
  assert.deepEqual(generateLbpExamSuggestions(payload), [])
})

test('missing responses entirely -> [] (fail closed, never crash)', () => {
  assert.deepEqual(generateLbpExamSuggestions({}), [])
})

// ---------- 2. merge ----------

test('merge: preserves an already-recorded result on a pre-existing item', () => {
  const payload = buildPayload(CLEAR_AXIAL_BASE)
  const existing = [
    {
      id: 'lbp_exam_target_function_reproduction',
      title: '목표 동작 재현',
      priority: 'CONTEXTUAL',
      reasonFacts: [],
      source: 'SUGGESTED',
      result: { status: 'POSITIVE', laterality: null, note: '재현됨', recordedAt: '2026-01-01T00:00:00.000Z' },
    },
  ]
  const merged = mergeLbpExamSuggestions(existing, payload)
  assert.equal(merged.length, 1)
  assert.equal(merged[0].result.status, 'POSITIVE')
  assert.equal(merged[0].result.note, '재현됨')
})

test('merge: appends a newly-triggered generated id not already present', () => {
  const withLegSymptom = buildPayload({ ...CLEAR_AXIAL_BASE, LBP_01: 'BACK_ONLY', LBP_02: ['NONE'], LBP_03: 'RIGHT' })
  const existing = [
    {
      id: 'lbp_exam_target_function_reproduction',
      title: '목표 동작 재현',
      priority: 'CONTEXTUAL',
      reasonFacts: [],
      source: 'SUGGESTED',
      result: { status: 'NOT_YET_CHECKED', laterality: null, note: '', recordedAt: null },
    },
  ]
  const merged = mergeLbpExamSuggestions(existing, withLegSymptom)
  assert.deepEqual(
    merged.map((i) => i.id),
    ['lbp_exam_target_function_reproduction', 'lbp_exam_neurodynamic'],
  )
})

test('merge: reattaches help by id to a previously-persisted item (help stripped by save/reload)', () => {
  const payload = buildPayload(CLEAR_AXIAL_BASE)
  const persistedWithoutHelp = [
    {
      id: 'lbp_exam_target_function_reproduction',
      title: '목표 동작 재현',
      priority: 'CONTEXTUAL',
      reasonFacts: [],
      source: 'SUGGESTED',
      result: { status: 'NOT_YET_CHECKED', laterality: null, note: '', recordedAt: null },
      // no `help` key -- exactly what deserializeWorkspaceState produces.
    },
  ]
  const merged = mergeLbpExamSuggestions(persistedWithoutHelp, payload)
  assert.ok(merged[0].help)
  assert.equal(merged[0].help.howKo, LBP_EXAM_HELP.lbp_exam_target_function_reproduction.howKo)
})

test('merge: idempotent (merging the merge result again produces the same list)', () => {
  const payload = buildPayload({ ...CLEAR_AXIAL_BASE, LBP_01: 'UNKNOWN', LBP_03: 'NONE', LBP_08: 'YES', LBP_09: 'NO' })
  const once = mergeLbpExamSuggestions([], payload)
  const twice = mergeLbpExamSuggestions(once, payload)
  assert.deepEqual(twice, once)
})

test('merge: non-LBP payload is a no-op over an empty list', () => {
  const payload = buildPayload(NON_LBP_BASE)
  assert.deepEqual(mergeLbpExamSuggestions([], payload), [])
})

// ---------- 3. every auto/addable item: help populated, source/status correct ----------

test('every generated item carries non-empty help.howKo/whyKo, source SUGGESTED, result NOT_YET_CHECKED', () => {
  const payload = buildPayload({ ...CLEAR_AXIAL_BASE, LBP_01: 'BACK_ONLY', LBP_02: ['NONE'], LBP_03: 'RIGHT' })
  const items = generateLbpExamSuggestions(payload)
  assert.ok(items.length >= 2)
  for (const item of items) {
    assert.ok(item.help, `${item.id} missing help`)
    assert.ok(item.help.howKo.trim().length > 0, `${item.id} empty howKo`)
    assert.ok(item.help.whyKo.trim().length > 0, `${item.id} empty whyKo`)
    assert.equal(item.source, 'SUGGESTED')
    assert.equal(item.priority, 'CONTEXTUAL')
    assert.equal(item.result.status, 'NOT_YET_CHECKED')
  }
})

test('every LBP_CLINICIAN_ADDABLE_EXAMS item carries non-empty help, source SUGGESTED, empty result', () => {
  assert.equal(LBP_CLINICIAN_ADDABLE_EXAMS.length, 5)
  for (const item of LBP_CLINICIAN_ADDABLE_EXAMS) {
    assert.ok(item.help, `${item.id} missing help`)
    assert.ok(item.help.howKo.trim().length > 0, `${item.id} empty howKo`)
    assert.ok(item.help.whyKo.trim().length > 0, `${item.id} empty whyKo`)
    assert.equal(item.source, 'SUGGESTED')
    assert.equal(item.priority, 'CONTEXTUAL')
    assert.equal(item.result.status, 'NOT_YET_CHECKED')
    assert.deepEqual(item.reasonFacts, [{ text: '원장 직접 추가', provenance: 'OBSERVED' }])
  }
})

// ---------- 4. directional response ----------

test('isValidLbpDirectionalResponse: accepts every declared option, rejects garbage', () => {
  for (const opt of LBP_DIRECTIONAL_RESPONSE_OPTIONS) {
    assert.ok(isValidLbpDirectionalResponse(opt.value), opt.value)
  }
  assert.ok(!isValidLbpDirectionalResponse('BOGUS'))
  assert.ok(!isValidLbpDirectionalResponse(undefined))
  assert.ok(!isValidLbpDirectionalResponse(null))
  assert.ok(!isValidLbpDirectionalResponse(7))
})

test('LBP_DIRECTIONAL_RESPONSE_OPTIONS has exactly the 6 specified values, NOT_ASSESSED first', () => {
  assert.deepEqual(
    LBP_DIRECTIONAL_RESPONSE_OPTIONS.map((o) => o.value),
    ['NOT_ASSESSED', 'FLEXION_FAVORABLE', 'EXTENSION_FAVORABLE', 'NO_CLEAR_DIRECTION', 'DISTAL_WORSENING', 'UNCLEAR'],
  )
})

test('lbpDirectionalResponseLabel: known values resolve, help text non-empty', () => {
  assert.equal(lbpDirectionalResponseLabel('FLEXION_FAVORABLE'), '숙이면(굴곡) 호전')
  assert.ok(LBP_DIRECTIONAL_RESPONSE_HELP.howKo.trim().length > 0)
  assert.ok(LBP_DIRECTIONAL_RESPONSE_HELP.whyKo.trim().length > 0)
})

// ---------- 5. target function taxonomy ----------

test('LBP_TARGET_FUNCTION_OPTIONS has the 9 specified ids/labels, each starting empty (FollowUpTarget shape)', () => {
  const expected = [
    ['lbp_tf_walking', '걷기'],
    ['lbp_tf_sitting', '앉기'],
    ['lbp_tf_standing', '서기'],
    ['lbp_tf_sit_to_stand', '앉았다 일어서기'],
    ['lbp_tf_dressing', '옷 입기·양말 신기'],
    ['lbp_tf_lifting', '물건 들기'],
    ['lbp_tf_sleep', '수면·침상 동작'],
    ['lbp_tf_work', '업무·집안일 복귀'],
    ['lbp_tf_custom', '기타 목표 동작'],
  ]
  assert.deepEqual(
    LBP_TARGET_FUNCTION_OPTIONS.map((o) => [o.id, o.label]),
    expected,
  )
  for (const o of LBP_TARGET_FUNCTION_OPTIONS) {
    assert.equal(o.baseline, '')
    assert.equal(o.postTreatmentValue, '')
  }
})

test('isLbpTargetFunctionId / selectedLbpTargetFunctions', () => {
  assert.ok(isLbpTargetFunctionId('lbp_tf_walking'))
  assert.ok(!isLbpTargetFunctionId('pain_intensity'))
  const mixed = [
    { id: 'lbp_tf_walking', label: '걷기', baseline: '', postTreatmentValue: '' },
    { id: 'pain_intensity', label: '통증 강도', baseline: '', postTreatmentValue: '' },
  ]
  assert.deepEqual(
    selectedLbpTargetFunctions(mixed).map((t) => t.id),
    ['lbp_tf_walking'],
  )
})

console.log(`\n${passed} tests passed.`)
