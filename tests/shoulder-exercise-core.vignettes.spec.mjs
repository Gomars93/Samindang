// 어깨 Core 10 — 엔진 구동 비네트 스위트 (2026-09-07 어깨 팩 승인, docs/SHOULDER_EXERCISE_DECISIONS_v1.0_CLOSED.md §2~§8).
// 목 스위트와 같은 방식: 엔진을 실제로 돌려 후보 집합·차단·순위가 CLOSED 문서와 같은지 고정한다. 입력은 전부 합성.
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
const PACK = REGION_PACKS.shoulder
const LABEL = PACK.labelKo

/** 어깨 우세(NS01) + 목·어깨 모두 CLEAR — `tests/shoulder.spec.mjs` BASE_CLEAR와 같은 값. */
function clearPayload(moduleOverrides = {}) {
  const p = structuredClone(PAIN_SCENARIO_1.payload)
  delete p.responses.safety_flags.lbp
  p.responses.safety_flags.neck = { neck_safety_status: 'CLEAR' }
  p.responses.safety_flags.shoulder = { shoulder_safety_status: 'CLEAR' }
  p.responses.modules.neck = { recent_significant_trauma: 'NO', cord_concern_screen: ['NONE'], sudden_unusual_severe_neck_pain: 'NO', thunderclap_headache_screen: 'NO', vascular_associated_screen: ['NONE'], systemic_redflag_screen: ['NONE'], headache_present: 'NO' }
  p.responses.modules.shoulder = { primary_focus: 'SHOULDER_DOMINANT', recent_trauma: 'NO', infection_emergency_screen: 'NO', nonmechanical_cardiac_gap_screen: 'NO', bilateral_similar_stiff_pain: 'NO', ...moduleOverrides }
  return p
}
const JUDGMENT = { shoulder_objective_cuff_weakness: 'NONE' }
const ex = (id, status) => ({ id, title: id, priority: 'CONTEXTUAL', reasonFacts: [], source: 'SUGGESTED', result: { status, laterality: null, note: '', recordedAt: null } })
const tf = (id) => ({ id, label: id, baseline: '', postTreatmentValue: '' })
const state = (over = {}) => ({ directionalResponse: 'NOT_ASSESSED', confirmedStage: null, ...over })
const ws = (targets, exams = []) => ({ ...emptyWorkspaceState(), painFollowUpTargets: targets, painExamSuggestions: exams })
const run = (payload, regionState, workspace, judgment = JUDGMENT) => buildRecommendationContext(PACK, payload, judgment, regionState, workspace)
const OVERHEAD = [tf('shoulder_tf_overhead')]
const NEURO_STABLE = [ex('shoulder_exam_distal_neuro', 'NEGATIVE')]

// 0. 전제
assert('0: shoulder pack approved and drives a SHOULDER_DOMINANT record', PACK.productionApproved === true && activeDrivingPack(clearPayload().responses) === PACK)
{
  const s = PACK.evaluateSafety(clearPayload(), JUDGMENT)
  assert('0: CLEAR record recomputes CLEAR', s.applicable && s.routineCareAllowed && !s.treatmentSafetyLocked)
}
assert('0: Core 10 ids as CLOSED §3', same(PACK.coreExercises.map((e) => e.exerciseId), ['SH_EDU_01', 'SH_MOB_01', 'SH_MOB_02', 'SH_RC_01', 'SH_RC_02', 'SH_SCAP_01', 'SH_SCAP_02', 'SH_STAB_01', 'SH_OVH_01', 'SH_FUNC_01']))
assert('0: every Core row has all 7 fields', PACK.coreExercises.every((e) => e.startingCriteriaKo.length > 0 && e.startingDoseKo && e.acceptableResponseKo.length > 0 && e.stopReviewKo.length > 0 && e.regressionKo && e.progressionKo && e.targetFunctions.length > 0))
assert('0: stage table 1단계 4 / 2단계 5 / 3단계 1 covering exactly the Core 10', same(Object.keys(PACK.stageTable).sort(), PACK.coreExercises.map((e) => e.exerciseId).sort()) && [1, 2, 3].map((s) => Object.values(PACK.stageTable).filter((v) => v === s).length).join() === '4,5,1')
assert('0: all rules default (no stable-neuro / distal-stop / directional requirement); directional card off', PACK.eligibilityRules.every((r) => !r.requiresStableNeuro && !r.stopOnDistalWorsening && !r.requiredDirectionalResponse) && PACK.directionalResponseApplicable === false)
assert('0: hypothesis 7 incl. AC_LOCAL_CONTRIBUTION; exams 8 incl. the 3 added', PACK.hypothesisPatterns.length === 7 && PACK.clinicianAddableExams.length === 8 && ['shoulder_exam_scapular_control', 'shoulder_exam_distal_neuro', 'shoulder_exam_apprehension_relocation'].every((id) => PACK.clinicianAddableExams.some((x) => x.id === id)))
assert('0: direct-support pairs as CLOSED §6 (5 exams; subscap / horizontal adduction / distal neuro absent)', same(PACK.directSupportByExam, { shoulder_exam_rom: ['SH_MOB_01', 'SH_MOB_02'], shoulder_exam_empty_can: ['SH_RC_01'], shoulder_exam_er_resist: ['SH_RC_01', 'SH_RC_02'], shoulder_exam_scapular_control: ['SH_SCAP_01', 'SH_SCAP_02'], shoulder_exam_apprehension_relocation: ['SH_STAB_01'] }))
assert('0: the frozen-shoulder mobility row pins "통증 범위 내" and never "세게" (CLOSED §8)', PACK.coreExercises.find((e) => e.exerciseId === 'SH_MOB_02').startingDoseKo.includes('통증 범위 내') && PACK.coreExercises.find((e) => e.exerciseId === 'SH_MOB_02').startingDoseKo.includes('세게 늘리지 않는다'))

// V1 머리 위 목표만, 검사 없음
{
  const r = run(clearPayload(), state(), ws(OVERHEAD))
  assert('V1: not blocked, 9 OVERHEAD rows (FUNC_01 is LIFTING/DRESSING only)', r.blocked === null && same(ids(r), ['SH_EDU_01', 'SH_MOB_01', 'SH_MOB_02', 'SH_OVH_01', 'SH_RC_01', 'SH_RC_02', 'SH_SCAP_01', 'SH_SCAP_02', 'SH_STAB_01']))
  assert('V1: neuro unrecorded does NOT defer anything (no shoulder row requires stable neuro) → hint off', r.neuroUnrecorded === false)
  assert('V1: nothing directly supported without exams', r.candidates.every((c) => c.directlySupported === false))
  assert('V1: strategy label = PR #30 domain label', r.candidates.find((c) => c.exerciseId === 'SH_RC_01').strategyLabelKo === '회전근개 저항 운동')
}
// V2 검사 → 직접 뒷받침
{
  const r = run(clearPayload(), state(), ws(OVERHEAD, [...NEURO_STABLE, ex('shoulder_exam_rom', 'POSITIVE'), ex('shoulder_exam_apprehension_relocation', 'POSITIVE')]))
  assert('V2: ROM + apprehension POSITIVE promote exactly MOB_01, MOB_02, STAB_01', same(r.candidates.filter((c) => c.directlySupported).map((c) => c.exerciseId).sort(), ['SH_MOB_01', 'SH_MOB_02', 'SH_STAB_01']))
  const sub = run(clearPayload(), state(), ws(OVERHEAD, [ex('shoulder_exam_subscap_resist', 'POSITIVE'), ex('shoulder_exam_horizontal_adduction', 'POSITIVE')]))
  assert('V2b: subscap / horizontal adduction POSITIVE support NO exercise (hypothesis evidence only)', sub.candidates.every((c) => c.directlySupported === false))
}
// V3 원위 신경 검사 POSITIVE → 전체 차단
{
  const r = run(clearPayload(), state(), ws(OVERHEAD, [ex('shoulder_exam_distal_neuro', 'POSITIVE')]))
  assert('V3: distal neuro POSITIVE → NEURO_REFRESH block with the 어깨 sentence, zero candidates', r.blocked === 'NEURO_REFRESH' && r.blockedMessageKo === neuroRefreshBlockedMessageKo(LABEL) && r.candidates.length === 0)
}
// V4 단계
{
  const one = run(clearPayload(), state({ confirmedStage: 1 }), ws(OVERHEAD))
  assert('V4: stage 1 + OVERHEAD → EDU_01, MOB_01, MOB_02, RC_01', same(ids(one), ['SH_EDU_01', 'SH_MOB_01', 'SH_MOB_02', 'SH_RC_01']))
  const lift2 = run(clearPayload(), state({ confirmedStage: 2 }), ws([tf('shoulder_tf_lifting')]))
  const lift3 = run(clearPayload(), state({ confirmedStage: 3 }), ws([tf('shoulder_tf_lifting')]))
  assert('V4b: LIFTING at stage 2 → 5 rows; stage 3 adds FUNC_01 → 6', ids(lift2).length === 5 && !ids(lift2).includes('SH_FUNC_01') && ids(lift3).length === 6 && ids(lift3).includes('SH_FUNC_01'))
  const zero = run(clearPayload(), state({ confirmedStage: 0 }), ws(OVERHEAD))
  assert('V4c: stage 0 → STAGE_0 block', zero.blocked === 'STAGE_0' && zero.candidates.length === 0)
}
// V5 목표 기능
{
  const sleep = run(clearPayload(), state(), ws([tf('shoulder_tf_sleep')]))
  assert('V5: SLEEP only → EDU_01 + MOB_02', same(ids(sleep), ['SH_EDU_01', 'SH_MOB_02']))
  const none = run(clearPayload(), state(), ws([]))
  assert('V5b: no target → NONE_SELECTED gap', none.targetFunctionGap === 'NONE_SELECTED' && none.candidates.length === 0)
  const neckTf = run(clearPayload(), state(), ws([tf('neck_tf_overhead')]))
  assert('V5c: a neck target id on a shoulder record is ignored → NONE_SELECTED', neckTf.targetFunctionGap === 'NONE_SELECTED')
}
// V6 방향성 반응은 어깨에서 아무 효과가 없다
{
  const distal = run(clearPayload(), state({ directionalResponse: 'DISTAL_WORSENING' }), ws(OVERHEAD))
  assert('V6: DISTAL_WORSENING changes nothing (no directional rules)', ids(distal).length === 9 && distal.blocked === null)
}
// V7 안전 — 감염 응급 선별 YES / 미응답 fail closed / 원장 객관적 근력저하
{
  const inf = run(clearPayload({ infection_emergency_screen: 'YES' }), state(), ws(OVERHEAD))
  assert('V7: infection screen YES → SAFETY_REVIEW(어깨)', inf.blocked === 'SAFETY_REVIEW' && inf.blockedMessageKo === safetyReviewBlockedMessageKo(LABEL) && inf.candidates.length === 0)
  const unanswered = run(clearPayload({ nonmechanical_cardiac_gap_screen: undefined }), state(), ws(OVERHEAD))
  assert('V7b: an unanswered safety screen fails closed → SAFETY_REVIEW', unanswered.blocked === 'SAFETY_REVIEW')
  // 원장 객관적 근력저하 필드는 L0의 expedited_referral_consider 플래그(안전 패널)를 켤 뿐 안전 상태를 바꾸지 않는다
  // (SHOULDER_V1 §12 — 별도 잠금 도메인 없음). 엔진은 그 플래그를 읽지 않으므로 후보는 그대로다: 의뢰 판단은 원장 몫.
  const cuff = run(clearPayload({ recent_trauma: 'YES', trauma_emergency_screen: ['NONE'], acute_traumatic_cuff_concern: 'NO' }), state(), ws(OVERHEAD), { shoulder_objective_cuff_weakness: 'NEW_WEAKNESS_AFTER_TRAUMA' })
  assert('V7c: clinician cuff-weakness judgment alone never changes the L0 status → not blocked (expedited-referral flag is a panel signal, not an engine gate)', cuff.blocked === null && ids(cuff).length === 9)
}
// V8 목 격리 — 목 우세 기록은 어깨 팩이 구동하지 않는다
{
  const neckDom = clearPayload({ primary_focus: 'NECK_DOMINANT' })
  assert('V8: NECK_DOMINANT routes to the neck pack, never the shoulder pack', activeDrivingPack(neckDom.responses) === REGION_PACKS.neck)
}

console.log(`\n${passed} shoulder vignette assertions passed.`)
