// 손목/손 Core 10 — 엔진 구동 비네트 스위트 (2026-09-07 승인, docs/WRIST_HAND_EXERCISE_DECISIONS_v1.0_CLOSED.md §2~§8).
// Run via `npm run test:region-exercise-vignettes`.
import { REGION_PACKS, activeDrivingPack } from './.region-vignettes-packs-bundle.mjs'
import { buildRecommendationContext, safetyReviewBlockedMessageKo, neuroRefreshBlockedMessageKo } from './.region-vignettes-recommendation-bundle.mjs'
import { emptyWorkspaceState } from './.region-vignettes-persistence-bundle.mjs'
import { PAIN_SCENARIO_1 } from './.region-vignettes-fixtures-bundle.mjs'

let passed = 0
function assert(name, cond) {
  if (!cond) throw new Error(`FAIL: ${name}`)
  passed += 1
  console.log(`OK: ${name}`)
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const ids = (r) => r.candidates.map((c) => c.exerciseId).sort()
const PACK = REGION_PACKS.wrist_hand
const LABEL = PACK.labelKo

/** 안전 CLEAR 손목·손 기록 — `tests/wrist-hand.spec.mjs` BASE_CLEAR와 같은 값. */
function clearPayload(moduleOverrides = {}) {
  const p = structuredClone(PAIN_SCENARIO_1.payload)
  delete p.responses.safety_flags.lbp
  p.responses.safety_flags.wrist_hand = { wrist_hand_safety_status: 'CLEAR' }
  p.responses.modules.wrist_hand = {
    recent_trauma: 'NO',
    deformity_neurovascular_open_injury_screen: ['NONE'],
    wound_exposure: ['NONE'],
    infection_broad_screen: 'NONE',
    distal_sensory_pattern: 'NONE',
    ...moduleOverrides,
  }
  return p
}
const ex = (id, status) => ({ id, title: id, priority: 'CONTEXTUAL', reasonFacts: [], source: 'SUGGESTED', result: { status, laterality: null, note: '', recordedAt: null } })
const tf = (id) => ({ id, label: id, baseline: '', postTreatmentValue: '' })
const state = (over = {}) => ({ directionalResponse: 'NOT_ASSESSED', confirmedStage: null, ...over })
const ws = (targets, exams = []) => ({ ...emptyWorkspaceState(), painFollowUpTargets: targets, painExamSuggestions: exams })
const run = (payload, regionState, workspace) => buildRecommendationContext(PACK, payload, {}, regionState, workspace)
const GRIP = [tf('wrist_hand_tf_grip')]
const NEURO_STABLE = [ex('wrist_hand_exam_median_neuro', 'NEGATIVE')]

// 0. 전제
assert('0: wrist_hand pack approved and drives a CLEAR record', PACK.productionApproved === true && activeDrivingPack(clearPayload().responses) === PACK)
assert('0: CLEAR record recomputes CLEAR', PACK.evaluateSafety(clearPayload(), {}).routineCareAllowed === true)
assert('0: Core 10 ids as CLOSED §3 (WH_ECC_01 held)', same(PACK.coreExercises.map((e) => e.exerciseId), ['WH_EDU_01', 'WH_MOB_01', 'WH_MOB_02', 'WH_GLIDE_01', 'WH_NERVE_01', 'WH_GRIP_01', 'WH_RES_01', 'WH_THUMB_01', 'WH_HAND_01', 'WH_FUNC_01']))
assert('0: every Core row has all 7 fields and opens stop-review with the shared sentence', PACK.coreExercises.every((e) => e.startingCriteriaKo.length > 0 && e.startingDoseKo && e.acceptableResponseKo.length > 0 && e.stopReviewKo[0].startsWith('새로운 또는 진행하는 신경증상') && e.regressionKo && e.progressionKo && e.targetFunctions.length > 0))
assert('0: stage table 1단계 6 / 2단계 3 / 3단계 1', same(Object.keys(PACK.stageTable).sort(), PACK.coreExercises.map((e) => e.exerciseId).sort()) && [1, 2, 3].map((s) => Object.values(PACK.stageTable).filter((v) => v === s).length).join() === '6,3,1')
assert('0: only WH_NERVE_01 requires stable neuro; neuro exam = median objective exam (Phalen/Tinel excluded)', PACK.eligibilityRules.filter((r) => r.requiresStableNeuro).map((r) => r.exerciseId).join() === 'WH_NERVE_01' && same(PACK.neuroExamIds, ['wrist_hand_exam_median_neuro']) && PACK.eligibilityRules.every((r) => !r.stopOnDistalWorsening && !r.requiredDirectionalResponse))
assert('0: hypothesis 7, exams 8, direct-support 5 keys (Finkelstein / ulnar load / median neuro have no pair)', PACK.hypothesisPatterns.length === 7 && PACK.clinicianAddableExams.length === 8 && same(Object.keys(PACK.directSupportByExam).sort(), ['wrist_hand_exam_cmc_grind', 'wrist_hand_exam_grip', 'wrist_hand_exam_phalen_tinel', 'wrist_hand_exam_resisted_wrist', 'wrist_hand_exam_rom']))

// V1 쥐기 목표, 검사 없음 → 신경 활주만 보류
{
  const r = run(clearPayload(), state(), ws(GRIP))
  assert('V1: not blocked, 9 GRIP rows — NERVE_01 deferred because the median exam is unrecorded', r.blocked === null && ids(r).length === 9 && !ids(r).includes('WH_NERVE_01'))
  assert('V1: neuroUnrecorded hint on', r.neuroUnrecorded === true)
  const stable = run(clearPayload(), state(), ws(GRIP, NEURO_STABLE))
  assert('V1b: median exam NEGATIVE → NERVE_01 joins (10), hint off', ids(stable).length === 10 && ids(stable).includes('WH_NERVE_01') && stable.neuroUnrecorded === false)
  const unclear = run(clearPayload(), state(), ws(GRIP, [ex('wrist_hand_exam_median_neuro', 'UNCLEAR')]))
  assert('V1c: UNCLEAR is not stability → NERVE_01 still deferred', !ids(unclear).includes('WH_NERVE_01'))
}
// V2 객관적 결손 POSITIVE → 전체 차단
{
  const r = run(clearPayload(), state(), ws(GRIP, [ex('wrist_hand_exam_median_neuro', 'POSITIVE')]))
  assert('V2: median objective deficit POSITIVE → NEURO_REFRESH block with the 손목·손 sentence, zero candidates', r.blocked === 'NEURO_REFRESH' && r.blockedMessageKo === neuroRefreshBlockedMessageKo(LABEL) && r.candidates.length === 0)
  const prov = run(clearPayload(), state(), ws(GRIP, [...NEURO_STABLE, ex('wrist_hand_exam_phalen_tinel', 'POSITIVE')]))
  assert('V2b: Phalen/Tinel POSITIVE never blocks (provocation) — it promotes NERVE_01 + GLIDE_01', prov.blocked === null && same(prov.candidates.filter((c) => c.directlySupported).map((c) => c.exerciseId).sort(), ['WH_GLIDE_01', 'WH_NERVE_01']))
}
// V3 검사 → 직접 뒷받침
{
  const r = run(clearPayload(), state(), ws(GRIP, [ex('wrist_hand_exam_cmc_grind', 'POSITIVE'), ex('wrist_hand_exam_finkelstein', 'POSITIVE'), ex('wrist_hand_exam_ulnar_load', 'POSITIVE')]))
  assert('V3: CMC grind promotes THUMB_01 only; Finkelstein / ulnar load promote nothing (근거 공백 — 보조기·활동 조절 1차)', same(r.candidates.filter((c) => c.directlySupported).map((c) => c.exerciseId), ['WH_THUMB_01']))
}
// V4 단계
{
  const one = run(clearPayload(), state({ confirmedStage: 1 }), ws([tf('wrist_hand_tf_typing')], NEURO_STABLE))
  assert('V4: stage 1 + TYPING → EDU_01, MOB_01, MOB_02, GLIDE_01, NERVE_01, HAND_01', same(ids(one), ['WH_EDU_01', 'WH_GLIDE_01', 'WH_HAND_01', 'WH_MOB_01', 'WH_MOB_02', 'WH_NERVE_01']))
  const wb2 = run(clearPayload(), state({ confirmedStage: 2 }), ws([tf('wrist_hand_tf_weight_bearing')]))
  const wb3 = run(clearPayload(), state({ confirmedStage: 3 }), ws([tf('wrist_hand_tf_weight_bearing')]))
  assert('V4b: WEIGHT_BEARING at stage 2 → EDU_01, MOB_01, RES_01; stage 3 adds FUNC_01', same(ids(wb2), ['WH_EDU_01', 'WH_MOB_01', 'WH_RES_01']) && same(ids(wb3), ['WH_EDU_01', 'WH_FUNC_01', 'WH_MOB_01', 'WH_RES_01']))
  assert('V4c: stage 0 → STAGE_0 block', run(clearPayload(), state({ confirmedStage: 0 }), ws(GRIP)).blocked === 'STAGE_0')
}
// V5 안전
{
  const deform = run(clearPayload({ deformity_neurovascular_open_injury_screen: ['GROSS_DEFORMITY_OR_STILL_OUT'] }), state(), ws(GRIP))
  assert('V5: gross deformity → SAFETY_REVIEW(손목·손)', deform.blocked === 'SAFETY_REVIEW' && deform.blockedMessageKo === safetyReviewBlockedMessageKo(LABEL) && deform.candidates.length === 0)
  assert('V5b: systemic infection screen → SAFETY_REVIEW', run(clearPayload({ infection_broad_screen: 'SYSTEMIC_OR_RAPIDLY_SPREADING' }), state(), ws(GRIP)).blocked === 'SAFETY_REVIEW')
  assert('V5c: an unanswered screen fails closed', run(clearPayload({ wound_exposure: undefined }), state(), ws(GRIP)).blocked === 'SAFETY_REVIEW')
}
// V6 목표 기능·격리
{
  assert('V6: no target → NONE_SELECTED', run(clearPayload(), state(), ws([])).targetFunctionGap === 'NONE_SELECTED')
  assert('V6b: custom-only → CUSTOM_ONLY', run(clearPayload(), state(), ws([tf('wrist_hand_tf_custom')])).targetFunctionGap === 'CUSTOM_ONLY')
  const lbpWs = { ...emptyWorkspaceState(), painFollowUpTargets: [tf('lbp_tf_walking')], painExamSuggestions: [ex('wrist_hand_exam_median_neuro', 'POSITIVE')] }
  const lbp = buildRecommendationContext(REGION_PACKS.lbp, PAIN_SCENARIO_1.payload, { lbp_objective_motor_deficit: 'NONE' }, state(), lbpWs)
  assert('V6c: a POSITIVE wrist neuro exam on an LBP record does not block LBP', lbp.blocked === null && lbp.candidates.length > 0)
}

console.log(`\n${passed} wrist-hand vignette assertions passed.`)
