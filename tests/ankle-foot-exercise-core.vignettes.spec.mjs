// 발목/발 Core 15 — 엔진 구동 비네트 스위트 (2026-09-07 승인, docs/ANKLE_FOOT_EXERCISE_DECISIONS_v1.0_CLOSED.md §2~§8).
// Run via `npm run test:region-exercise-vignettes`.
import { REGION_PACKS, activeDrivingPack } from './.region-vignettes-packs-bundle.mjs'
import { buildRecommendationContext, safetyReviewBlockedMessageKo } from './.region-vignettes-recommendation-bundle.mjs'
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
const PACK = REGION_PACKS.ankle_foot
const LABEL = PACK.labelKo

/** 안전 CLEAR 발목 기록 — `tests/ankle-foot.spec.mjs` clear와 같은 값(모듈 키는 `toAnkleFootStateFromDoctorPayload`). */
function clearPayload(moduleOverrides = {}) {
  const p = structuredClone(PAIN_SCENARIO_1.payload)
  delete p.responses.safety_flags.lbp
  p.responses.safety_flags.ankle_foot = { ankle_foot_safety_status: 'CLEAR' }
  p.responses.modules.ankle_foot = {
    region_discriminator: 'ANKLE',
    recent_trauma: 'NO',
    limb_threatening_screen: ['NONE'],
    infection_screen: 'NO_CONCERN',
    progressive_neuro_screen: 'NO',
    ...moduleOverrides,
  }
  return p
}
const ex = (id, status) => ({ id, title: id, priority: 'CONTEXTUAL', reasonFacts: [], source: 'SUGGESTED', result: { status, laterality: null, note: '', recordedAt: null } })
const tf = (id) => ({ id, label: id, baseline: '', postTreatmentValue: '' })
const state = (over = {}) => ({ directionalResponse: 'NOT_ASSESSED', confirmedStage: null, ...over })
const ws = (targets, exams = []) => ({ ...emptyWorkspaceState(), painFollowUpTargets: targets, painExamSuggestions: exams })
const run = (payload, regionState, workspace) => buildRecommendationContext(PACK, payload, {}, regionState, workspace)
const WALKING = [tf('ankle_foot_tf_walking')]
const ORIGINAL_11 = ['AF_PELV_01', 'AF_PELV_02', 'AF_PELV_03', 'AF_HIPS_01', 'AF_HIPS_02', 'AF_HIPS_03', 'AF_HIPS_04', 'AF_MOB_01', 'AF_MOB_02', 'AF_MOB_03', 'AF_MOB_04']

// 0. 전제
assert('0: ankle_foot pack approved and drives a CLEAR record', PACK.productionApproved === true && activeDrivingPack(clearPayload().responses) === PACK)
assert('0: CLEAR record recomputes CLEAR', PACK.evaluateSafety(clearPayload(), {}).routineCareAllowed === true)
assert('0: Core 15 = clinician-original 11 (ids preserved) + EDU_01, BAL_01, TEND_01, PF_01', PACK.coreExercises.length === 15 && ORIGINAL_11.every((id) => PACK.coreExercises.some((e) => e.exerciseId === id)) && ['AF_EDU_01', 'AF_BAL_01', 'AF_TEND_01', 'AF_PF_01'].every((id) => PACK.coreExercises.some((e) => e.exerciseId === id)))
assert('0: original display names preserved (클램 / 힙 힌지 / 카프 레이즈 / 부드러운 착지 훈련)', ['클램', '힙 힌지', '카프 레이즈', '부드러운 착지 훈련'].every((n) => PACK.coreExercises.some((e) => e.displayNameKo === n)))
assert('0: every Core row has all 7 fields and opens stop-review with the shared sentence', PACK.coreExercises.every((e) => e.startingCriteriaKo.length > 0 && e.startingDoseKo && e.acceptableResponseKo.length > 0 && e.stopReviewKo[0].startsWith('새로운 또는 진행하는 신경증상') && e.regressionKo && e.progressionKo && e.targetFunctions.length > 0))
assert('0: the wall dorsiflexion row keeps the original "10회" dose', PACK.coreExercises.find((e) => e.exerciseId === 'AF_MOB_01').startingDoseKo.startsWith('10회(원안)'))
assert('0: stage table 1단계 7 / 2단계 7 / 3단계 1', same(Object.keys(PACK.stageTable).sort(), PACK.coreExercises.map((e) => e.exerciseId).sort()) && [1, 2, 3].map((s) => Object.values(PACK.stageTable).filter((v) => v === s).length).join() === '7,7,1')
assert('0: hypotheses = clinician 3 first + CPG 3; domains 8; exams 8; all rules default; no neuro ids; directional off', PACK.hypothesisPatterns.map((p) => p.id).join() === 'PELVIC_ALIGNMENT_LOSS,HIP_STRATEGY_LOSS,ANKLE_MOBILITY_LOSS,LATERAL_ANKLE_SPRAIN_RECOVERY,ACHILLES_TENDON_LOAD,PLANTAR_HEEL_PAIN' && PACK.rehabDomains.length === 8 && PACK.clinicianAddableExams.length === 8 && PACK.eligibilityRules.every((r) => !r.requiresStableNeuro && !r.stopOnDistalWorsening) && PACK.neuroExamIds.length === 0 && PACK.directionalResponseApplicable === false)

// V1 걷기 목표, 검사 없음
{
  const r = run(clearPayload(), state(), ws(WALKING))
  assert('V1: not blocked, 14 WALKING rows (MOB_04 착지 is RUNNING only)', r.blocked === null && ids(r).length === 14 && !ids(r).includes('AF_MOB_04'))
  assert('V1: nothing directly supported without exams; hint off', r.candidates.every((c) => c.directlySupported === false) && r.neuroUnrecorded === false)
  assert('V1: strategy label = domain label (원장 패턴명은 카드 이유줄에서 사라짐)', r.candidates.find((c) => c.exerciseId === 'AF_PELV_01').strategyLabelKo === '골반·고관절 조절')
}
// V2 검사 → 직접 뒷받침
{
  const r = run(clearPayload(), state(), ws(WALKING, [ex('ankle_foot_exam_df_lunge', 'POSITIVE'), ex('ankle_foot_exam_achilles_load', 'POSITIVE'), ex('ankle_foot_exam_weight_shift', 'POSITIVE')]))
  assert('V2: DF lunge + Achilles load + weight shift POSITIVE promote MOB_01, MOB_03, TEND_01, PELV_01/02/03', same(r.candidates.filter((c) => c.directlySupported).map((c) => c.exerciseId).sort(), ['AF_MOB_01', 'AF_MOB_03', 'AF_PELV_01', 'AF_PELV_02', 'AF_PELV_03', 'AF_TEND_01']))
  const heel = run(clearPayload(), state(), ws([tf('ankle_foot_tf_standing_long')], [ex('ankle_foot_exam_plantar_heel', 'POSITIVE')]))
  assert('V2b: plantar heel POSITIVE promotes PF_01 only', same(heel.candidates.filter((c) => c.directlySupported).map((c) => c.exerciseId), ['AF_PF_01']))
}
// V3 단계
{
  const one = run(clearPayload(), state({ confirmedStage: 1 }), ws(WALKING))
  assert('V3: stage 1 + WALKING → the 7 stage-1 rows', same(ids(one), ['AF_BAL_01', 'AF_EDU_01', 'AF_MOB_01', 'AF_MOB_03', 'AF_PELV_01', 'AF_PF_01', 'AF_TEND_01']))
  const run2 = run(clearPayload(), state({ confirmedStage: 2 }), ws([tf('ankle_foot_tf_running')]))
  const run3 = run(clearPayload(), state({ confirmedStage: 3 }), ws([tf('ankle_foot_tf_running')]))
  assert('V3b: RUNNING at stage 2 → 8 rows; stage 3 adds MOB_04 → 9', ids(run2).length === 8 && !ids(run2).includes('AF_MOB_04') && ids(run3).length === 9 && ids(run3).includes('AF_MOB_04'))
  assert('V3c: stage 0 → STAGE_0 block', run(clearPayload(), state({ confirmedStage: 0 }), ws(WALKING)).blocked === 'STAGE_0')
}
// V4 안전
{
  const bleed = run(clearPayload({ limb_threatening_screen: ['UNCONTROLLED_HEAVY_BLEEDING'] }), state(), ws(WALKING))
  assert('V4: limb-threatening screen → SAFETY_REVIEW(발목·발)', bleed.blocked === 'SAFETY_REVIEW' && bleed.blockedMessageKo === safetyReviewBlockedMessageKo(LABEL) && bleed.candidates.length === 0)
  assert('V4b: progressive distal neuro → SAFETY_REVIEW', run(clearPayload({ progressive_neuro_screen: 'NEW_OR_PROGRESSIVE_DISTAL_NUMBNESS_OR_WEAKNESS' }), state(), ws(WALKING)).blocked === 'SAFETY_REVIEW')
  assert('V4c: an unanswered screen fails closed', run(clearPayload({ infection_screen: undefined }), state(), ws(WALKING)).blocked === 'SAFETY_REVIEW')
}
// V5 목표 기능·격리
{
  const stand = run(clearPayload(), state(), ws([tf('ankle_foot_tf_standing_long')]))
  assert('V5: STANDING_LONG → EDU_01, PELV_01/02/03, MOB_02, BAL_01, PF_01', same(ids(stand), ['AF_BAL_01', 'AF_EDU_01', 'AF_MOB_02', 'AF_PELV_01', 'AF_PELV_02', 'AF_PELV_03', 'AF_PF_01']))
  assert('V5b: no target → NONE_SELECTED', run(clearPayload(), state(), ws([])).targetFunctionGap === 'NONE_SELECTED')
  assert('V5c: a knee target id on an ankle record is ignored', run(clearPayload(), state(), ws([tf('knee_tf_walking')])).targetFunctionGap === 'NONE_SELECTED')
}

console.log(`\n${passed} ankle-foot vignette assertions passed.`)
