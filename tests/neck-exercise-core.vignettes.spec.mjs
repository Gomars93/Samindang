/**
 * 목 Core 9 — 엔진 구동 비네트 스위트 (2026-09-07 목 팩 승인, CLOSED §3~§8).
 *
 * 요통 `lbp-exercise-core20.vignettes.spec.mjs`는 관찰 전용(엔진을 부르지 않음)이지만,
 * 목은 팩이 R1~R3 엔진 위에서 처음으로 승인되는 부위라 **엔진을 실제로 돌려** 후보
 * 집합·차단·순위가 CLOSED 문서와 같은지 고정한다. 입력은 전부 합성이다.
 *
 * Run via `npm run test:neck-exercise-vignettes`.
 */
import { REGION_PACKS, activeDrivingPack } from './.neck-vignettes-packs-bundle.mjs'
import { buildRecommendationContext, safetyReviewBlockedMessageKo, neuroRefreshBlockedMessageKo } from './.neck-vignettes-recommendation-bundle.mjs'
import { emptyWorkspaceState } from './.neck-vignettes-persistence-bundle.mjs'
import { PAIN_SCENARIO_1 } from './.neck-vignettes-fixtures-bundle.mjs'

let passed = 0
function assert(name, cond) {
  if (!cond) throw new Error(`FAIL: ${name}`)
  passed += 1
  console.log(`OK: ${name}`)
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const ids = (r) => r.candidates.map((c) => c.exerciseId)

const NECK = REGION_PACKS.neck

/** 안전 CLEAR 목 기록 — `tests/neck.spec.mjs` BASE_CLEAR와 같은 값(모듈 키 이름은 `toNeckStateFromDoctorPayload`). */
function clearNeckPayload(moduleOverrides = {}) {
  const p = structuredClone(PAIN_SCENARIO_1.payload)
  delete p.responses.safety_flags.lbp
  p.responses.safety_flags.neck = { neck_safety_status: 'CLEAR' }
  p.responses.modules.neck = {
    recent_significant_trauma: 'NO',
    cord_concern_screen: ['NONE'],
    sudden_unusual_severe_neck_pain: 'NO',
    thunderclap_headache_screen: 'NO',
    vascular_associated_screen: ['NONE'],
    systemic_redflag_screen: ['NONE'],
    headache_present: 'NO',
    ...moduleOverrides,
  }
  return p
}
const ex = (id, status) => ({ id, title: id, priority: 'CONTEXTUAL', reasonFacts: [], source: 'SUGGESTED', result: { status, laterality: null, note: '', recordedAt: null } })
const tf = (id) => ({ id, label: id, baseline: '', postTreatmentValue: '' })
const state = (over = {}) => ({ directionalResponse: 'NOT_ASSESSED', confirmedStage: null, ...over })
const ws = (targets, exams = []) => ({ ...emptyWorkspaceState(), painFollowUpTargets: targets, painExamSuggestions: exams })
const run = (payload, regionState, workspace) => buildRecommendationContext(NECK, payload, {}, regionState, workspace)

const NEURO_STABLE = [ex('neck_exam_neuro_c5_t1', 'NEGATIVE'), ex('neck_exam_umn', 'NEGATIVE')]
const DESK = [tf('neck_tf_desk_work')]

// ---------------------------------------------------------------------------
// 0. 전제 — 팩 승인 상태·구동·안전 재계산
// ---------------------------------------------------------------------------
assert('0: neck pack is approved and drives a CLEAR neck record', NECK.productionApproved === true && activeDrivingPack(clearNeckPayload().responses) === NECK)
{
  const s = NECK.evaluateSafety(clearNeckPayload(), {})
  assert('0: CLEAR neck record recomputes CLEAR, treatment not locked, neuro UNKNOWN from safety (D-1 derives it from exams)', s.applicable && s.routineCareAllowed && !s.treatmentSafetyLocked && s.neuroStatus === 'UNKNOWN')
}
assert('0: Core 9 ids as CLOSED §3', same(NECK.coreExercises.map((e) => e.exerciseId), ['NECK_MOB_01', 'NECK_THX_01', 'NECK_DIR_01', 'NECK_DNF_01', 'NECK_DNF_02', 'NECK_EXT_01', 'NECK_SCAP_01', 'NECK_NEURAL_01', 'NECK_EXPO_01']))
assert('0: every Core row has all 7 fields non-empty (CLOSED §4)', NECK.coreExercises.every((e) => e.startingCriteriaKo.length > 0 && e.startingDoseKo && e.acceptableResponseKo.length > 0 && e.stopReviewKo.length > 0 && e.regressionKo && e.progressionKo && e.targetFunctions.length > 0))
assert('0: every Core row\'s first stop-review item is the shared neuro sentence', NECK.coreExercises.every((e) => e.stopReviewKo[0].startsWith('새로운 또는 진행하는 신경증상')))
assert('0: stage table covers exactly the Core 9 (CLOSED §5: 1단계 3 / 2단계 6)', same(Object.keys(NECK.stageTable).sort(), NECK.coreExercises.map((e) => e.exerciseId).sort()) && Object.values(NECK.stageTable).filter((v) => v === 1).length === 3 && Object.values(NECK.stageTable).filter((v) => v === 2).length === 6)
{
  const rule = (id) => NECK.eligibilityRules.find((r) => r.exerciseId === id)
  assert('0: rules — only NECK_NEURAL_01 requires stable neuro; NEURAL_01 and DIR_01 stop on distal worsening; DIR_01 requires EXTENSION_FAVORABLE (CLOSED §6)', NECK.eligibilityRules.filter((r) => r.requiresStableNeuro).map((r) => r.exerciseId).join() === 'NECK_NEURAL_01' && same(NECK.eligibilityRules.filter((r) => r.stopOnDistalWorsening).map((r) => r.exerciseId), ['NECK_DIR_01', 'NECK_NEURAL_01']) && rule('NECK_DIR_01').requiredDirectionalResponse === 'EXTENSION_FAVORABLE' && NECK.eligibilityRules.filter((r) => r.requiredDirectionalResponse).length === 1)
}
assert('0: direct-support pairs as CLOSED §7 (4 exams → 5 exercise refs; Spurling/distraction absent)', same(NECK.directSupportByExam, { neck_exam_ultt: ['NECK_NEURAL_01'], neck_exam_dnf_endurance: ['NECK_DNF_01', 'NECK_DNF_02'], neck_exam_scapular_control: ['NECK_SCAP_01'], neck_exam_crom: ['NECK_MOB_01'] }))
assert('0: target-function enums match the preset ids', same(Object.values(NECK.targetFunctionIdToEnum).sort(), ['DESK_WORK', 'LOOKING_BACK', 'OVERHEAD', 'SLEEP']) && NECK.coreExercises.every((e) => e.targetFunctions.every((t) => ['DESK_WORK', 'LOOKING_BACK', 'OVERHEAD', 'SLEEP'].includes(t))))

// ---------------------------------------------------------------------------
// V1 책상 작업 목표만, 검사 없음, 단계 미확정
// ---------------------------------------------------------------------------
{
  const r = run(clearNeckPayload(), state(), ws(DESK))
  assert('V1: not blocked, no TF gap', r.blocked === null && r.targetFunctionGap === null && r.treatmentSafetyLocked === false)
  assert('V1: 7 candidates — every DESK_WORK row except NEURAL_01 (neuro unknown) and DIR_01 (direction not assessed)', same(ids(r).sort(), ['NECK_DNF_01', 'NECK_DNF_02', 'NECK_EXPO_01', 'NECK_EXT_01', 'NECK_MOB_01', 'NECK_SCAP_01', 'NECK_THX_01']))
  assert('V1: neuroUnrecorded is true (NEURAL_01 deferred only because the baseline is unrecorded)', r.neuroUnrecorded === true)
  assert('V1: nothing is directly supported without exams or a direction', r.candidates.every((c) => c.directlySupported === false))
  assert('V1: every card carries its starting criteria, dose, stop-review and regression text', r.candidates.every((c) => c.startingCriteriaKo.length > 0 && c.startingDoseKo && c.stopReviewKo.length > 0 && c.regressionKo))
  assert('V1: strategy label on the card is the PR #30 domain label', r.candidates.find((c) => c.exerciseId === 'NECK_DNF_01').strategyLabelKo === '심부경부굴곡근 조절·지구력')
}

// ---------------------------------------------------------------------------
// V2 + 신경 기준선 두 검사 NEGATIVE → 신경 가동성 운동 해금
// ---------------------------------------------------------------------------
{
  const r = run(clearNeckPayload(), state(), ws(DESK, NEURO_STABLE))
  assert('V2: 8 candidates — NEURAL_01 now included', ids(r).length === 8 && ids(r).includes('NECK_NEURAL_01'))
  assert('V2: neuroUnrecorded false', r.neuroUnrecorded === false)
  const one = run(clearNeckPayload(), state(), ws(DESK, [ex('neck_exam_neuro_c5_t1', 'NEGATIVE')]))
  assert('V2b: only one of the two baseline exams NEGATIVE → still UNKNOWN → NEURAL_01 deferred, hint on', !ids(one).includes('NECK_NEURAL_01') && one.neuroUnrecorded === true)
}

// ---------------------------------------------------------------------------
// V3 + ULTT POSITIVE → NEURAL_01 직접 뒷받침, 앞 버킷
// ---------------------------------------------------------------------------
{
  const r = run(clearNeckPayload(), state(), ws(DESK, [...NEURO_STABLE, ex('neck_exam_ultt', 'POSITIVE')]))
  const neural = r.candidates.find((c) => c.exerciseId === 'NECK_NEURAL_01')
  assert('V3: NEURAL_01 directly supported and ranked first; the other 7 are not', neural?.directlySupported === true && ids(r)[0] === 'NECK_NEURAL_01' && r.candidates.filter((c) => c.directlySupported).length === 1)
  const spur = run(clearNeckPayload(), state(), ws(DESK, [...NEURO_STABLE, ex('neck_exam_spurling', 'POSITIVE'), ex('neck_exam_distraction', 'POSITIVE')]))
  assert('V3b: Spurling / distraction POSITIVE support NO exercise (hypothesis evidence only — "방사통이면 traction" 금지)', spur.candidates.every((c) => c.directlySupported === false) && same(ids(spur).sort(), ids(r).sort()))
  const dnf = run(clearNeckPayload(), state(), ws(DESK, [ex('neck_exam_dnf_endurance', 'POSITIVE'), ex('neck_exam_scapular_control', 'POSITIVE'), ex('neck_exam_crom', 'POSITIVE')]))
  assert('V3c: DNF / scapular / CROM POSITIVE promote exactly DNF_01, DNF_02, SCAP_01, MOB_01', same(dnf.candidates.filter((c) => c.directlySupported).map((c) => c.exerciseId).sort(), ['NECK_DNF_01', 'NECK_DNF_02', 'NECK_MOB_01', 'NECK_SCAP_01']))
}

// ---------------------------------------------------------------------------
// V4 UMN POSITIVE → 전체 차단(목 문장), C5–T1 POSITIVE도 같음
// ---------------------------------------------------------------------------
{
  for (const id of ['neck_exam_umn', 'neck_exam_neuro_c5_t1']) {
    const r = run(clearNeckPayload(), state(), ws(DESK, [ex(id, 'POSITIVE'), ex(id === 'neck_exam_umn' ? 'neck_exam_neuro_c5_t1' : 'neck_exam_umn', 'NEGATIVE')]))
    assert(`V4: ${id} POSITIVE → NEURO_REFRESH block with the 목 sentence and zero candidates`, r.blocked === 'NEURO_REFRESH' && r.blockedMessageKo === neuroRefreshBlockedMessageKo('목') && r.candidates.length === 0)
  }
}

// ---------------------------------------------------------------------------
// V5 방향성 반응 — 신전 호전이면 DIR_01 후보(직접 뒷받침); 굴곡 호전이면 아님; 원위 악화면 DIR/NEURAL 제외
// ---------------------------------------------------------------------------
{
  const extn = run(clearNeckPayload(), state({ directionalResponse: 'EXTENSION_FAVORABLE' }), ws(DESK, NEURO_STABLE))
  assert('V5: EXTENSION_FAVORABLE → DIR_01 joins (9) and is directly supported', ids(extn).length === 9 && extn.candidates.find((c) => c.exerciseId === 'NECK_DIR_01')?.directlySupported === true)
  const flex = run(clearNeckPayload(), state({ directionalResponse: 'FLEXION_FAVORABLE' }), ws(DESK, NEURO_STABLE))
  assert('V5b: FLEXION_FAVORABLE → DIR_01 absent (no flexion row in v1.0), still 8', !ids(flex).includes('NECK_DIR_01') && ids(flex).length === 8)
  const distal = run(clearNeckPayload(), state({ directionalResponse: 'DISTAL_WORSENING' }), ws(DESK, NEURO_STABLE))
  assert('V5c: DISTAL_WORSENING → DIR_01 and NEURAL_01 both out (stopOnDistalWorsening), 7 remain, no block', !ids(distal).includes('NECK_DIR_01') && !ids(distal).includes('NECK_NEURAL_01') && ids(distal).length === 7 && distal.blocked === null)
}

// ---------------------------------------------------------------------------
// V6 단계 확정 — 0단계 차단 / 1단계 3행 중 목표 일치 / 2단계 전부
// ---------------------------------------------------------------------------
{
  const zero = run(clearNeckPayload(), state({ confirmedStage: 0 }), ws(DESK, NEURO_STABLE))
  assert('V6: confirmed stage 0 → STAGE_0 block, zero candidates', zero.blocked === 'STAGE_0' && zero.candidates.length === 0 && zero.confirmedStage === 0)
  const one = run(clearNeckPayload(), state({ confirmedStage: 1, directionalResponse: 'EXTENSION_FAVORABLE' }), ws(DESK, NEURO_STABLE))
  assert('V6b: confirmed stage 1 → only the 3 stage-1 rows (MOB_01, DIR_01, DNF_01)', same(ids(one).sort(), ['NECK_DIR_01', 'NECK_DNF_01', 'NECK_MOB_01']))
  const two = run(clearNeckPayload(), state({ confirmedStage: 2, directionalResponse: 'EXTENSION_FAVORABLE' }), ws(DESK, NEURO_STABLE))
  assert('V6c: confirmed stage 2 → all 9', ids(two).length === 9)
  const three = run(clearNeckPayload(), state({ confirmedStage: 3, directionalResponse: 'EXTENSION_FAVORABLE' }), ws(DESK, NEURO_STABLE))
  assert('V6d: confirmed stage 3 → all 9 (no stage-3-only row in v1.0)', ids(three).length === 9)
}

// ---------------------------------------------------------------------------
// V7 안전 — 척수 관여 우려(REVIEW_REQUIRED) → SAFETY_REVIEW(목) 전체 차단
// ---------------------------------------------------------------------------
{
  const r = run(clearNeckPayload({ cord_concern_screen: ['HAND_CLUMSINESS'], cord_symptom_course: 'STABLE' }), state(), ws(DESK, NEURO_STABLE))
  assert('V7: cord concern → SAFETY_REVIEW block with the 목 sentence', r.blocked === 'SAFETY_REVIEW' && r.blockedMessageKo === safetyReviewBlockedMessageKo('목') && r.candidates.length === 0)
  const trauma = run(clearNeckPayload({ recent_significant_trauma: 'YES' }), state(), ws(DESK, NEURO_STABLE))
  assert('V7b: significant trauma → SAFETY_REVIEW block', trauma.blocked === 'SAFETY_REVIEW')
  const unknown = run(clearNeckPayload({ systemic_redflag_screen: [] }), state(), ws(DESK, NEURO_STABLE))
  assert('V7c: an unanswered safety screen fails closed → SAFETY_REVIEW (never CLEAR by omission)', unknown.blocked === 'SAFETY_REVIEW')
}

// ---------------------------------------------------------------------------
// V8 목표 기능 — 없음 / 자유만 / 수면만
// ---------------------------------------------------------------------------
{
  const none = run(clearNeckPayload(), state(), ws([], NEURO_STABLE))
  assert('V8: no target function → NONE_SELECTED gap, no candidates', none.targetFunctionGap === 'NONE_SELECTED' && none.candidates.length === 0)
  const custom = run(clearNeckPayload(), state(), ws([tf('neck_tf_custom')], NEURO_STABLE))
  assert('V8b: custom-only → CUSTOM_ONLY gap', custom.targetFunctionGap === 'CUSTOM_ONLY' && custom.candidates.length === 0)
  const sleep = run(clearNeckPayload(), state(), ws([tf('neck_tf_sleep')], NEURO_STABLE))
  assert('V8c: SLEEP only → DNF_01 + NEURAL_01', same(ids(sleep).sort(), ['NECK_DNF_01', 'NECK_NEURAL_01']))
  const overhead = run(clearNeckPayload(), state(), ws([tf('neck_tf_overhead')]))
  assert('V8d: OVERHEAD only → MOB_01, THX_01, EXT_01, SCAP_01', same(ids(overhead).sort(), ['NECK_EXT_01', 'NECK_MOB_01', 'NECK_SCAP_01', 'NECK_THX_01']))
  const lbpTarget = run(clearNeckPayload(), state(), ws([tf('lbp_tf_walking')], NEURO_STABLE))
  assert('V8e: an LBP target function id on a neck record is ignored → NONE_SELECTED', lbpTarget.targetFunctionGap === 'NONE_SELECTED')
}

// ---------------------------------------------------------------------------
// V9 요통 격리 — 목 검사가 요통 추천을 건드리지 않는다
// ---------------------------------------------------------------------------
{
  const lbpWs = { ...emptyWorkspaceState(), painFollowUpTargets: [tf('lbp_tf_walking')], painExamSuggestions: [ex('neck_exam_umn', 'POSITIVE')] }
  const r = buildRecommendationContext(REGION_PACKS.lbp, PAIN_SCENARIO_1.payload, { lbp_objective_motor_deficit: 'NONE' }, state(), lbpWs)
  assert('V9: a POSITIVE neck neuro exam on an LBP record does not block LBP (LBP keeps its clinician field)', r.blocked === null && r.candidates.length > 0)
}

console.log(`\n${passed} neck vignette assertions passed.`)
