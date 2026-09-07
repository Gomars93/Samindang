// 무릎 Core 12 — 엔진 구동 비네트 스위트 (2026-09-07 무릎 팩 승인, docs/KNEE_EXERCISE_DECISIONS_v1.0_CLOSED.md §2~§8).
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
const PACK = REGION_PACKS.knee
const LABEL = PACK.labelKo

/** 안전 CLEAR 무릎 기록 — `tests/knee.spec.mjs` BASE_CLEAR와 같은 값(모듈 키는 `toKneeStateFromDoctorPayload`). */
function clearPayload(moduleOverrides = {}) {
  const p = structuredClone(PAIN_SCENARIO_1.payload)
  delete p.responses.safety_flags.lbp
  p.responses.safety_flags.knee = { knee_safety_status: 'CLEAR' }
  p.responses.modules.knee = {
    recent_trauma_or_sudden_load: 'NO',
    deformity_neurovascular_screen: ['NONE'],
    spontaneously_reduced_dislocation_screen: 'NO',
    true_locked_extension_block: 'NO',
    unilateral_leg_dvt_symptom_screen: 'NO',
    septic_joint_emergency_screen: 'NO',
    referred_non_knee_redflag_screen: ['NONE'],
    ...moduleOverrides,
  }
  return p
}
const ex = (id, status) => ({ id, title: id, priority: 'CONTEXTUAL', reasonFacts: [], source: 'SUGGESTED', result: { status, laterality: null, note: '', recordedAt: null } })
const tf = (id) => ({ id, label: id, baseline: '', postTreatmentValue: '' })
const state = (over = {}) => ({ directionalResponse: 'NOT_ASSESSED', confirmedStage: null, ...over })
const ws = (targets, exams = []) => ({ ...emptyWorkspaceState(), painFollowUpTargets: targets, painExamSuggestions: exams })
const run = (payload, regionState, workspace) => buildRecommendationContext(PACK, payload, {}, regionState, workspace)
const STAIRS = [tf('knee_tf_stairs')]

// 0. 전제
assert('0: knee pack approved and drives a CLEAR knee record', PACK.productionApproved === true && activeDrivingPack(clearPayload().responses) === PACK)
assert('0: CLEAR record recomputes CLEAR', PACK.evaluateSafety(clearPayload(), {}).routineCareAllowed === true)
assert('0: Core 12 ids as CLOSED §3 (archive VMO/90-90/adduction ids retired)', same(PACK.coreExercises.map((e) => e.exerciseId), ['KNEE_EDU_01', 'KNEE_MOB_01', 'KNEE_QUAD_01', 'KNEE_QUAD_02', 'KNEE_STEP_01', 'KNEE_GLUT_01', 'KNEE_HSC_01', 'KNEE_BAL_01', 'KNEE_PF_01', 'KNEE_TEND_01', 'KNEE_LIG_01', 'KNEE_GAIT_01']) && PACK.coreExercises.every((e) => !/^KNEE_(IR|ER|STIFF|HIP)_/.test(e.exerciseId)))
assert('0: every Core row has all 7 fields and opens stop-review with the shared sentence', PACK.coreExercises.every((e) => e.startingCriteriaKo.length > 0 && e.startingDoseKo && e.acceptableResponseKo.length > 0 && e.stopReviewKo[0].startsWith('새로운 또는 진행하는 신경증상') && e.regressionKo && e.progressionKo && e.targetFunctions.length > 0))
assert('0: stage table 1단계 4 / 2단계 6 / 3단계 2', same(Object.keys(PACK.stageTable).sort(), PACK.coreExercises.map((e) => e.exerciseId).sort()) && [1, 2, 3].map((s) => Object.values(PACK.stageTable).filter((v) => v === s).length).join() === '4,6,2')
assert('0: all rules default; no neuro exam ids; directional off', PACK.eligibilityRules.every((r) => !r.requiresStableNeuro && !r.stopOnDistalWorsening && !r.requiredDirectionalResponse) && PACK.neuroExamIds.length === 0 && PACK.directionalResponseApplicable === false)
assert('0: exams 10 (archive 4 + 6), direct-support 8 keys; effusion / joint line have no pair', PACK.clinicianAddableExams.length === 10 && Object.keys(PACK.directSupportByExam).length === 8 && !('knee_exam_effusion' in PACK.directSupportByExam) && !('knee_exam_joint_line' in PACK.directSupportByExam))
assert('0: the tendon row says load, not rest (PR #30 "건 = 휴식" 금지)', PACK.coreExercises.find((e) => e.exerciseId === 'KNEE_TEND_01').startingDoseKo.includes('휴식은 쉬는 것이 아니라 부하를 낮추는 것'))

// V1 계단 목표, 검사 없음
{
  const r = run(clearPayload(), state(), ws(STAIRS))
  assert('V1: not blocked, 11 STAIRS rows (GAIT_01 is RUNNING only)', r.blocked === null && ids(r).length === 11 && !ids(r).includes('KNEE_GAIT_01'))
  assert('V1: neuro hint off (no neuro exam ids)', r.neuroUnrecorded === false)
  assert('V1: nothing directly supported without exams', r.candidates.every((c) => c.directlySupported === false))
}
// V2 검사 → 직접 뒷받침
{
  const r = run(clearPayload(), state(), ws(STAIRS, [ex('knee_exam_tke', 'POSITIVE'), ex('knee_exam_quad_lag', 'POSITIVE'), ex('knee_exam_stability', 'POSITIVE'), ex('knee_exam_effusion', 'POSITIVE')]))
  assert('V2: TKE + quad lag + stability POSITIVE promote exactly QUAD_01, BAL_01, LIG_01; effusion promotes nothing', same(r.candidates.filter((c) => c.directlySupported).map((c) => c.exerciseId).sort(), ['KNEE_BAL_01', 'KNEE_LIG_01', 'KNEE_QUAD_01']))
  const pf = run(clearPayload(), state(), ws([tf('knee_tf_squat')], [ex('knee_exam_pf_load', 'POSITIVE')]))
  assert('V2b: PF/tendon load reproduction POSITIVE promotes PF_01 and TEND_01', same(pf.candidates.filter((c) => c.directlySupported).map((c) => c.exerciseId).sort(), ['KNEE_PF_01', 'KNEE_TEND_01']))
}
// V3 단계
{
  const one = run(clearPayload(), state({ confirmedStage: 1 }), ws(STAIRS))
  assert('V3: stage 1 + STAIRS → EDU_01, MOB_01, QUAD_01, GLUT_01', same(ids(one), ['KNEE_EDU_01', 'KNEE_GLUT_01', 'KNEE_MOB_01', 'KNEE_QUAD_01']))
  const run2 = run(clearPayload(), state({ confirmedStage: 2 }), ws([tf('knee_tf_running')]))
  const run3 = run(clearPayload(), state({ confirmedStage: 3 }), ws([tf('knee_tf_running')]))
  assert('V3b: RUNNING at stage 2 → 6 rows; stage 3 adds LIG_01 + GAIT_01 → 8', ids(run2).length === 6 && ids(run3).length === 8 && ['KNEE_LIG_01', 'KNEE_GAIT_01'].every((id) => !ids(run2).includes(id) && ids(run3).includes(id)))
  assert('V3c: stage 0 → STAGE_0 block', run(clearPayload(), state({ confirmedStage: 0 }), ws(STAIRS)).blocked === 'STAGE_0')
}
// V4 안전 — 진성 잠김 / 화농관절 / 미응답
{
  const locked = run(clearPayload({ true_locked_extension_block: 'YES' }), state(), ws(STAIRS))
  assert('V4: true locked extension block → SAFETY_REVIEW(무릎)', locked.blocked === 'SAFETY_REVIEW' && locked.blockedMessageKo === safetyReviewBlockedMessageKo(LABEL) && locked.candidates.length === 0)
  assert('V4b: septic joint screen YES → SAFETY_REVIEW', run(clearPayload({ septic_joint_emergency_screen: 'YES' }), state(), ws(STAIRS)).blocked === 'SAFETY_REVIEW')
  assert('V4c: an unanswered screen fails closed → SAFETY_REVIEW', run(clearPayload({ referred_non_knee_redflag_screen: undefined }), state(), ws(STAIRS)).blocked === 'SAFETY_REVIEW')
}
// V5 목표 기능·격리
{
  const none = run(clearPayload(), state(), ws([]))
  assert('V5: no target → NONE_SELECTED', none.targetFunctionGap === 'NONE_SELECTED' && none.candidates.length === 0)
  const lbpTf = run(clearPayload(), state(), ws([tf('lbp_tf_walking')]))
  assert('V5b: an LBP target id on a knee record is ignored', lbpTf.targetFunctionGap === 'NONE_SELECTED')
  const lbpWs = { ...emptyWorkspaceState(), painFollowUpTargets: [tf('lbp_tf_walking')], painExamSuggestions: [ex('knee_exam_stability', 'POSITIVE')] }
  const lbp = buildRecommendationContext(REGION_PACKS.lbp, PAIN_SCENARIO_1.payload, { lbp_objective_motor_deficit: 'NONE' }, state(), lbpWs)
  assert('V5c: knee exams on an LBP record neither block nor promote LBP rows', lbp.blocked === null && lbp.candidates.every((c) => c.directlySupported === false))
}

console.log(`\n${passed} knee vignette assertions passed.`)
