/**
 * 부위 팩 일반화 (R1~R3) — 검증 스위트.
 * docs/PAIN_REGION_PACK_GENERALIZATION_PLAN_v0.1.md §4 게이트.
 *
 * A. 요통 팩 == 옛 상수 (옮겨 적기, 새 판단 없음)
 * B. 구동 부위 결정 — TS/서버 parity (한 fixture 표)
 * C. 서버 세부문진 표 == 승인된 팩의 재질문 id
 * D. 승인 불변식 — 승인된 팩만 빈 칸 0개, 승인 전 팩은 전부 비활성
 * E. 저장 어댑터 — 요통은 옛 필드, 나머지는 regionClinical, lbp 키 금지
 * F. EMR — 부위 가설/라벨 경로, 요통 문장 불변
 * G. 추천 엔진 — 승인 전 팩은 빈 결과, 요통 차단 문장 불변
 * H. SSR — 승인 전 부위 화면에 가설/단계/방향성 카드 없음, 요통은 있음
 * I. 지운 경로 1개당 소스 단언 1개 (CLAUDE.md)
 * J. 요통 동등성 §8 + E-1~E-4 (PO 승인 2026-09-07) — PR #30 가설 교체, 방향성 라벨 팩화,
 *    신경 상태 검사 파생(D-1), 도메인·출처 게이트, 진단→운동 하드코딩 부정 단언
 */
import { readFileSync } from 'node:fs'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { REGION_PACKS, activeRegionPack, activeDrivingPack, packContentGaps } from './.region-packs-bundle.mjs'
import { drivingRegion, drivingRegionCandidates } from './.region-routing-bundle.mjs'
import {
  drivingRegion as serverDrivingRegion,
  drivingRegionCandidates as serverDrivingRegionCandidates,
  REGION_KEYS as SERVER_REGION_KEYS,
} from '../server/regionRouting.js'
import {
  DETAIL_CHECK_REGION_QUESTION_IDS,
  DETAIL_CHECK_COMMON_QUESTION_IDS,
  detailCheckQuestionIds,
  detailCheckQuestionIdsForRegion,
  detailCheckQuestionIdsForCandidates,
} from '../server/detailCheck.js'
import {
  sanitizeRegionClinicalMap,
  readRegionClinical,
  withRegionClinical,
  readRegionHypothesis,
  withRegionHypothesis,
} from './.region-clinical-state-bundle.mjs'
import { emptyWorkspaceState, deserializeWorkspaceState } from './.region-pack-persistence-bundle.mjs'
import { emptyVisitWorkspaceState, deserializeVisitWorkspaceState } from './.region-pack-visitworkspace-bundle.mjs'
import { buildPainWorkspaceEmrPreview } from './.region-pack-emrpreview-bundle.mjs'
import {
  buildRecommendationContext,
  buildLbpRecommendationContext,
  safetyReviewBlockedMessageKo,
  neuroRefreshBlockedMessageKo,
  neuroStatusFromExamResults,
} from './.region-pack-recommendation-bundle.mjs'
import { LBP_CORE_EXERCISE_METADATA } from './.region-pack-core-metadata-bundle.mjs'
import { LBP_EXERCISE_STAGE_BY_ID } from './.region-pack-stage-table-bundle.mjs'
import { LBP_EXERCISE_ELIGIBILITY_RULES } from './.region-pack-eligibility-bundle.mjs'
import {
  LBP_HYPOTHESIS_PATTERN_IDS,
  LBP_HYPOTHESIS_PATTERN_LABEL_KO,
  emptyLbpWorkingHypothesis,
} from './.region-pack-working-hypothesis-bundle.mjs'
import { LBP_TARGET_FUNCTION_OPTIONS, LBP_TARGET_FUNCTION_ID_TO_ENUM } from './.region-pack-target-function-bundle.mjs'
import { PAIN_SCENARIO_1 } from './.region-pack-fixtures-bundle.mjs'
import { DoctorWorkspace } from './.region-pack-doctor-workspace-bundle.cjs'
import { PainWorkspaceLane2, neuroUnrecordedHintForPack, LBP_NEURO_UNRECORDED_HINT_KO } from './.region-pack-pain-workspace-bundle.cjs'

let passed = 0
function assert(name, cond) {
  if (!cond) throw new Error(`FAIL: ${name}`)
  passed += 1
  console.log(`OK: ${name}`)
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

const REGION_KEYS = ['lbp', 'neck', 'shoulder', 'knee', 'hip', 'ankle_foot', 'elbow', 'wrist_hand', 'tmj']
const LBP = REGION_PACKS.lbp

// ---------------------------------------------------------------------------
// A. 요통 팩 == 옛 상수
// ---------------------------------------------------------------------------
assert('A: LBP pack is approved and labelled 허리', LBP.productionApproved === true && LBP.labelKo === '허리' && LBP.region === 'lbp')
assert('A: coreExercises ids/order == LBP_CORE_EXERCISE_METADATA', same(LBP.coreExercises.map((e) => e.exerciseId), LBP_CORE_EXERCISE_METADATA.map((m) => m.exerciseId)))
assert('A: coreExercises carry the same startingCriteria/dose/stopReview/regression as Core-20', LBP.coreExercises.every((e, i) => {
  const m = LBP_CORE_EXERCISE_METADATA[i]
  return e.displayNameKo === m.displayNameKo && same(e.startingCriteriaKo, m.startingCriteriaKo) && e.startingDoseKo === m.startingDoseKo && same(e.stopReviewKo, m.stopReviewKo) && e.regressionKo === m.regressionKo && same(e.targetFunctions, m.targetFunctions)
}))
assert('A: every LBP core row has a non-empty strategyLabelKo (domain→strategy table moved intact)', LBP.coreExercises.every((e) => e.strategyLabelKo.length > 0))
assert('A: stageTable === LBP_EXERCISE_STAGE_BY_ID', same(LBP.stageTable, LBP_EXERCISE_STAGE_BY_ID))
assert('A: eligibilityRules === LBP_EXERCISE_ELIGIBILITY_RULES', same(LBP.eligibilityRules, LBP_EXERCISE_ELIGIBILITY_RULES))
assert('A: hypothesisPatterns ids/labels == LBP 5 patterns in order', same(LBP.hypothesisPatterns.map((p) => [p.id, p.labelKo]), LBP_HYPOTHESIS_PATTERN_IDS.map((id) => [id, LBP_HYPOTHESIS_PATTERN_LABEL_KO[id]])))
assert('A: targetFunctions === LBP_TARGET_FUNCTION_OPTIONS and id→enum table identical', same(LBP.targetFunctions, LBP_TARGET_FUNCTION_OPTIONS) && same(LBP.targetFunctionIdToEnum, LBP_TARGET_FUNCTION_ID_TO_ENUM))
assert('A: directSupportByExam pins 하지직거상/슬럼프 → LBP_NEURAL_01 only', same(LBP.directSupportByExam, { lbp_exam_neurodynamic: ['LBP_NEURAL_01'] }))
assert('A: detailCheckQuestionIds == server DETAIL_CHECK_LBP set', same(LBP.detailCheckQuestionIds, ['LBP_12', 'LBP_13', 'LBP_14']))
assert('A: LBP pack has zero content gaps', packContentGaps(LBP).length === 0)

// ---------------------------------------------------------------------------
// B. 구동 부위 결정 — TS/서버 parity
// ---------------------------------------------------------------------------
const F = (flags, modules = {}) => ({ safety_flags: flags, modules })
const ROUTING_CASES = [
  ['no responses', undefined, null],
  ['not an object', 'x', null],
  ['no region flags', F({}), null],
  ['lbp only', F({ lbp: { lbp_safety_status: 'CLEAR' } }), 'lbp'],
  ['knee only', F({ knee: {} }), 'knee'],
  ['tmj only', F({ tmj: {} }), 'tmj'],
  ['neck+shoulder, NS01 SHOULDER_DOMINANT → shoulder', F({ neck: {}, shoulder: {} }, { shoulder: { primary_focus: 'SHOULDER_DOMINANT' } }), 'shoulder'],
  ['neck+shoulder, NS01 NECK_DOMINANT → neck', F({ neck: {}, shoulder: {} }, { shoulder: { primary_focus: 'NECK_DOMINANT' } }), 'neck'],
  ['neck+shoulder, NS01 SIMILAR → neck (default)', F({ neck: {}, shoulder: {} }, { shoulder: { primary_focus: 'SIMILAR' } }), 'neck'],
  ['neck+shoulder, NS01 UNKNOWN → neck', F({ neck: {}, shoulder: {} }, { shoulder: { primary_focus: 'UNKNOWN' } }), 'neck'],
  ['neck+shoulder, NS01 missing → neck', F({ neck: {}, shoulder: {} }), 'neck'],
  ['shoulder only (no neck flag) → shoulder', F({ shoulder: {} }, { shoulder: { primary_focus: 'NECK_DOMINANT' } }), 'shoulder'],
  ['lbp+hip, HIP_00 HIP_GROIN_DOMINANT → hip', F({ lbp: {}, hip: {} }, { hip: { region_discriminator: 'HIP_GROIN_DOMINANT' } }), 'hip'],
  ['lbp+hip, HIP_00 BUTTOCK_PELVIS_DOMINANT → lbp', F({ lbp: {}, hip: {} }, { hip: { region_discriminator: 'BUTTOCK_PELVIS_DOMINANT' } }), 'lbp'],
  ['lbp+hip, HIP_00 LOW_BACK_DOMINANT → lbp', F({ lbp: {}, hip: {} }, { hip: { region_discriminator: 'LOW_BACK_DOMINANT' } }), 'lbp'],
  ['lbp+hip, HIP_00 SIMILAR_OR_MULTIPLE → lbp', F({ lbp: {}, hip: {} }, { hip: { region_discriminator: 'SIMILAR_OR_MULTIPLE' } }), 'lbp'],
  ['lbp+hip, HIP_00 missing → lbp', F({ lbp: {}, hip: {} }), 'lbp'],
  ['hip only (no lbp flag) → hip', F({ hip: {} }), 'hip'],
  ['flag value false is still a recorded flag (!= null) → lbp', F({ lbp: false }), 'lbp'],
  ['flag value null is absent → null', F({ lbp: null }), null],
]
for (const [name, responses, expected] of ROUTING_CASES) {
  const ts = drivingRegion(responses)
  const srv = serverDrivingRegion(responses)
  assert(`B: ${name} — TS=${ts}`, ts === expected)
  assert(`B: ${name} — server parity`, srv === ts)
}
assert('B: server REGION_KEYS identical to TS order', same([...SERVER_REGION_KEYS], REGION_KEYS))
const CANDIDATE_CASES = [
  ['no flags → []', F({}), []],
  ['lbp only → [lbp]', F({ lbp: {} }), ['lbp']],
  ['lbp+hip, HIP_GROIN_DOMINANT → [hip, lbp] (hip first, lbp fallback)', F({ lbp: {}, hip: {} }, { hip: { region_discriminator: 'HIP_GROIN_DOMINANT' } }), ['hip', 'lbp']],
  ['lbp+hip, BUTTOCK_PELVIS_DOMINANT → [lbp] (lbp has no fallback)', F({ lbp: {}, hip: {} }, { hip: { region_discriminator: 'BUTTOCK_PELVIS_DOMINANT' } }), ['lbp']],
  ['neck+shoulder, SHOULDER_DOMINANT → [shoulder] (NO neck fallback — 2026-09-07)', F({ neck: {}, shoulder: {} }, { shoulder: { primary_focus: 'SHOULDER_DOMINANT' } }), ['shoulder']],
  ['neck+shoulder, NECK_DOMINANT → [neck]', F({ neck: {}, shoulder: {} }, { shoulder: { primary_focus: 'NECK_DOMINANT' } }), ['neck']],
  ['hip only → [hip] (fallback lbp absent from the record)', F({ hip: {} }), ['hip']],
  ['garbage → []', 'x', []],
]
for (const [name, responses, expected] of CANDIDATE_CASES) {
  assert(`B-cand: ${name}`, same(drivingRegionCandidates(responses), expected))
  assert(`B-cand: ${name} — server parity`, same(serverDrivingRegionCandidates(responses), expected))
}
// 회귀 방지: 판별 부위의 팩이 승인 전이면 같은 모집단의 승인 팩(요통)으로 후퇴한다.
assert('B-fallback: HIP_GROIN_DOMINANT patient still gets the LBP pack while the hip pack is unapproved', activeDrivingPack(F({ lbp: {}, hip: {} }, { hip: { region_discriminator: 'HIP_GROIN_DOMINANT' } })) === REGION_PACKS.lbp)
// 2026-09-07 목 활성화: 어깨 우세 환자는 목 팩으로 후퇴하지 않는다 — 안전 패널만(R2 이전과 같음). 목 우세/유사/미응답은 목 팩.
assert('B-fallback: SHOULDER_DOMINANT patient gets NO pack while the shoulder pack is unapproved (never the neck pack)', activeDrivingPack(F({ neck: {}, shoulder: {} }, { shoulder: { primary_focus: 'SHOULDER_DOMINANT' } })) === null)
assert('B-fallback: NECK_DOMINANT / SIMILAR / missing NS01 → the approved neck pack', ['NECK_DOMINANT', 'SIMILAR', undefined].every((v) => activeDrivingPack(F({ neck: {}, shoulder: {} }, v ? { shoulder: { primary_focus: v } } : {})) === REGION_PACKS.neck))
assert('B-fallback: SHOULDER_DOMINANT patient gets no pack (neither neck nor shoulder approved)', activeDrivingPack(F({ neck: {}, shoulder: {} }, { shoulder: { primary_focus: 'SHOULDER_DOMINANT' } })) === null)
assert('B-fallback: lbp-only and no-flag records', activeDrivingPack(F({ lbp: {} })) === REGION_PACKS.lbp && activeDrivingPack(F({})) === null && activeDrivingPack(undefined) === null)

// ---------------------------------------------------------------------------
// C. 서버 세부문진 표 == 승인된 팩
// ---------------------------------------------------------------------------
for (const k of REGION_KEYS) {
  const pack = REGION_PACKS[k]
  const expected = pack.productionApproved ? [...pack.detailCheckQuestionIds] : []
  const actual = [...(DETAIL_CHECK_REGION_QUESTION_IDS[k] ?? [])]
  assert(`C: server detail-check ids for ${k} == ${pack.productionApproved ? 'pack (approved)' : '[] (unapproved)'}`, same(actual, expected))
}
assert('C: server table has no key outside approved packs', Object.keys(DETAIL_CHECK_REGION_QUESTION_IDS).every((k) => REGION_PACKS[k]?.productionApproved === true))
assert('C: detailCheckQuestionIdsForRegion(null) = common only', same(detailCheckQuestionIdsForRegion(null), [...DETAIL_CHECK_COMMON_QUESTION_IDS]))
assert('C: detailCheckQuestionIdsForRegion(neck) = common + NECK_12 (approved 2026-09-07)', same(detailCheckQuestionIdsForRegion('neck'), [...DETAIL_CHECK_COMMON_QUESTION_IDS, 'NECK_12']))
assert('C: detailCheckQuestionIdsForRegion(shoulder) = common only (unapproved)', same(detailCheckQuestionIdsForRegion('shoulder'), [...DETAIL_CHECK_COMMON_QUESTION_IDS]))
assert('C: detailCheckQuestionIdsForRegion(lbp) = common + LBP 3', same(detailCheckQuestionIdsForRegion('lbp'), ['VISIT_04_SYMPTOM_IMPACT', 'LBP_12', 'LBP_13', 'LBP_14']))
assert('C: legacy detailCheckQuestionIds({isLbp}) unchanged', same(detailCheckQuestionIds({ isLbp: true }), detailCheckQuestionIdsForRegion('lbp')) && same(detailCheckQuestionIds({ isLbp: false }), detailCheckQuestionIdsForRegion(null)))
assert('C: a bogus region gets common only (no throw)', same(detailCheckQuestionIdsForRegion('__proto__'), [...DETAIL_CHECK_COMMON_QUESTION_IDS]))
assert('C-fallback: candidates [hip, lbp] → LBP ids (hip unapproved → falls back to lbp, same rule as the screen)', same(detailCheckQuestionIdsForCandidates(['hip', 'lbp']), detailCheckQuestionIdsForRegion('lbp')))
assert('C-fallback: candidates [shoulder] / [] / garbage → common only', same(detailCheckQuestionIdsForCandidates(['shoulder']), [...DETAIL_CHECK_COMMON_QUESTION_IDS]) && same(detailCheckQuestionIdsForCandidates([]), [...DETAIL_CHECK_COMMON_QUESTION_IDS]) && same(detailCheckQuestionIdsForCandidates('x'), [...DETAIL_CHECK_COMMON_QUESTION_IDS]))
assert('C-fallback: candidates [neck] → common + NECK_12', same(detailCheckQuestionIdsForCandidates(['neck']), detailCheckQuestionIdsForRegion('neck')))

// ---------------------------------------------------------------------------
// D. 승인 불변식
// ---------------------------------------------------------------------------
assert('D: registry has exactly the 9 region keys', same(Object.keys(REGION_PACKS).sort(), [...REGION_KEYS].sort()))
for (const k of REGION_KEYS) {
  const pack = REGION_PACKS[k]
  assert(`D: pack ${k}.region matches its key and label is the shared REGION_LABEL`, pack.region === k && typeof pack.labelKo === 'string' && pack.labelKo.length > 0)
  const gaps = packContentGaps(pack)
  if (pack.productionApproved) {
    assert(`D: approved pack ${k} has zero content gaps`, gaps.length === 0)
  } else {
    assert(`D: unapproved pack ${k} still has content gaps (${gaps.length}) — cannot be flipped without content`, gaps.length > 0)
    assert(`D: activeRegionPack(${k}) is null while unapproved`, activeRegionPack(k) === null)
  }
  assert(`D: ${k} target function ids all start with ${k}_tf_`, pack.targetFunctions.every((t) => t.id.startsWith(`${k}_tf_`)))
  assert(`D: ${k} custom target function maps to no enum`, pack.targetFunctions.filter((t) => t.id.endsWith('_tf_custom')).every((t) => pack.targetFunctionIdToEnum[t.id] === undefined))
  const patternIds = pack.hypothesisPatterns.map((p) => p.id)
  assert(`D: ${k} hypothesis pattern ids unique`, new Set(patternIds).size === patternIds.length)
  const exIds = pack.coreExercises.map((e) => e.exerciseId)
  assert(`D: ${k} core exercise ids unique and every one has an eligibility rule`, new Set(exIds).size === exIds.length && exIds.every((id) => pack.eligibilityRules.some((r) => r.exerciseId === id)))
  assert(`D: ${k} generateExamSuggestions never throws on an empty payload`, Array.isArray(pack.generateExamSuggestions({ responses: { safety_flags: {}, modules: {} }, flags: {} })))
  assert(`D: ${k} evaluateSafety on a non-${k} payload is not applicable`, pack.evaluateSafety({ responses: { safety_flags: {}, modules: {} }, flags: {} }, {}).applicable === false)
  assert(`D: ${k} evaluateSafety fails closed on a flagged-but-empty module`, k === 'lbp' || pack.evaluateSafety({ responses: { safety_flags: { [k]: {} }, modules: { [k]: {} } }, flags: {} }, {}).routineCareAllowed === false)
}
assert('D: activeRegionPack(lbp) is the LBP pack; activeRegionPack(null/undefined) is null', activeRegionPack('lbp') === LBP && activeRegionPack(null) === null && activeRegionPack(undefined) === null)
assert('D: exactly two approved packs today (lbp, neck — 2026-09-07)', REGION_KEYS.filter((k) => REGION_PACKS[k].productionApproved).join(',') === 'lbp,neck')
assert('D: draft packs with clinician content exist for the 6 regions found in Notion/Drive', ['neck', 'shoulder', 'knee', 'hip', 'ankle_foot', 'tmj'].every((k) => REGION_PACKS[k].hypothesisPatterns.length >= 3 && REGION_PACKS[k].coreExercises.length >= 3))
assert('D: elbow / wrist_hand are empty drafts (no clinician document found)', ['elbow', 'wrist_hand'].every((k) => REGION_PACKS[k].hypothesisPatterns.length === 0 && REGION_PACKS[k].coreExercises.length === 0))
assert('D: every draft pack says DRAFT in sourceDocument', REGION_KEYS.filter((k) => !REGION_PACKS[k].productionApproved).every((k) => /DRAFT/.test(REGION_PACKS[k].sourceDocument)))
assert('D: draft (unapproved) eligibility rules do not require stable neuro / distal stop (no such inputs exist for those regions)', REGION_KEYS.filter((k) => !REGION_PACKS[k].productionApproved).every((k) => REGION_PACKS[k].eligibilityRules.every((r) => r.requiresStableNeuro === false && r.stopOnDistalWorsening === false)))

// ---------------------------------------------------------------------------
// E. 저장 어댑터
// ---------------------------------------------------------------------------
{
  const NECK_PATTERNS = REGION_PACKS.neck.hypothesisPatterns
  assert('E: sanitizeRegionClinicalMap drops lbp and unknown keys, keeps only known non-lbp keys', same(Object.keys(sanitizeRegionClinicalMap({ lbp: {}, neck: {}, bogus: {} })), ['neck']))
  assert('E: sanitizeRegionClinicalMap of garbage is {}', same(sanitizeRegionClinicalMap('x'), {}) && same(sanitizeRegionClinicalMap(null), {}) && same(sanitizeRegionClinicalMap([1]), {}))
  const s = sanitizeRegionClinicalMap({ neck: { directionalResponse: 'FLEXION_FAVORABLE', confirmedStage: 2, workingHypothesis: { supports: { AXIAL_MOBILITY_DEFICIT: 'HIGHER', BOGUS: 'nope', 7: 'LOWER' }, recordedAt: 't' } }, knee: 'garbage' })
  assert('E: valid neck record survives (directional, stage, valid supports only)', s.neck.directionalResponse === 'FLEXION_FAVORABLE' && s.neck.confirmedStage === 2 && same(s.neck.workingHypothesis, { supports: { 7: 'LOWER', AXIAL_MOBILITY_DEFICIT: 'HIGHER' }, recordedAt: 't' }) || (s.neck.workingHypothesis.supports.AXIAL_MOBILITY_DEFICIT === 'HIGHER' && s.neck.workingHypothesis.supports.BOGUS === undefined))
  assert('E: garbage region record degrades to defaults, not dropped', s.knee.directionalResponse === 'NOT_ASSESSED' && s.knee.confirmedStage === null && same(s.knee.workingHypothesis, { supports: {}, recordedAt: null }))
  assert('E: bad stage values degrade to null', sanitizeRegionClinicalMap({ neck: { confirmedStage: '2' } }).neck.confirmedStage === null && sanitizeRegionClinicalMap({ neck: { confirmedStage: 4 } }).neck.confirmedStage === null && sanitizeRegionClinicalMap({ neck: { confirmedStage: 0 } }).neck.confirmedStage === 0)

  const empty = emptyWorkspaceState()
  assert('E: emptyWorkspaceState.regionClinical is {} (additive, schema unchanged 1.1.0)', same(empty.regionClinical, {}) && empty.schema_version === '1.1.0')
  assert('E: legacy record without regionClinical deserializes to {}', same(deserializeWorkspaceState({}).regionClinical, {}))
  const rt = deserializeWorkspaceState(JSON.parse(JSON.stringify({ ...empty, regionClinical: { neck: { directionalResponse: 'NOT_ASSESSED', confirmedStage: 1, workingHypothesis: { supports: { AXIAL_MOBILITY_DEFICIT: 'CONSIDER' }, recordedAt: null } } } })))
  assert('E: regionClinical round-trips through serialize/deserialize', rt.regionClinical.neck.confirmedStage === 1 && rt.regionClinical.neck.workingHypothesis.supports.AXIAL_MOBILITY_DEFICIT === 'CONSIDER')
  assert('E: a persisted regionClinical.lbp is dropped on load (single storage path for LBP)', deserializeWorkspaceState({ regionClinical: { lbp: { confirmedStage: 3 } } }).regionClinical.lbp === undefined)

  const lbpRead = readRegionClinical({ ...empty, lbpDirectionalResponse: 'EXTENSION_FAVORABLE', lbpConfirmedStage: 2 }, 'lbp', LBP.hypothesisPatterns)
  assert('E: readRegionClinical(lbp) reads the old three fields', lbpRead.directionalResponse === 'EXTENSION_FAVORABLE' && lbpRead.confirmedStage === 2 && same(lbpRead.workingHypothesis, emptyLbpWorkingHypothesis()))
  const w1 = withRegionClinical(empty, 'lbp', { confirmedStage: 2, directionalResponse: 'FLEXION_FAVORABLE' })
  assert('E: withRegionClinical(lbp) writes lbpConfirmedStage/lbpDirectionalResponse and never regionClinical', w1.lbpConfirmedStage === 2 && w1.lbpDirectionalResponse === 'FLEXION_FAVORABLE' && same(w1.regionClinical, {}))
  const w2 = withRegionClinical(empty, 'neck', { confirmedStage: 1 })
  assert('E: withRegionClinical(neck) writes regionClinical.neck and leaves the LBP fields untouched', w2.regionClinical.neck.confirmedStage === 1 && w2.lbpConfirmedStage === null && w2.regionClinical.neck.directionalResponse === 'NOT_ASSESSED')
  const neckRead = readRegionClinical(w2, 'neck', NECK_PATTERNS)
  assert('E: readRegionClinical(neck) prunes the hypothesis to the pack patterns (all UNJUDGED by default)', same(Object.keys(neckRead.workingHypothesis.supports), NECK_PATTERNS.map((p) => p.id)) && Object.values(neckRead.workingHypothesis.supports).every((v) => v === 'UNJUDGED'))
  const w3 = withRegionHypothesis(w2, 'neck', { supports: { AXIAL_MOBILITY_DEFICIT: 'HIGHER' }, recordedAt: 'now' })
  assert('E: withRegionHypothesis(neck) keeps confirmedStage and replaces only the hypothesis', w3.regionClinical.neck.confirmedStage === 1 && readRegionHypothesis(w3, 'neck', NECK_PATTERNS).supports.AXIAL_MOBILITY_DEFICIT === 'HIGHER')
  const vws = emptyVisitWorkspaceState()
  assert('E: VisitWorkspaceState has regionClinical {} and legacy loads to {}', same(vws.regionClinical, {}) && same(deserializeVisitWorkspaceState({}).regionClinical, {}))
  const v2 = withRegionHypothesis(vws, 'knee', { supports: { KNEE_OA: 'LOWER' }, recordedAt: null })
  assert('E: revisit hypothesis for knee round-trips through deserializeVisitWorkspaceState', deserializeVisitWorkspaceState(JSON.parse(JSON.stringify(v2))).regionClinical.knee.workingHypothesis.supports.KNEE_OA === 'LOWER')
  assert('E: withRegionHypothesis(lbp) on a revisit state writes lbpWorkingHypothesis', withRegionHypothesis(vws, 'lbp', { supports: { NEURAL: 'HIGHER' }, recordedAt: null }).lbpWorkingHypothesis.supports.NEURAL === 'HIGHER')
}

// ---------------------------------------------------------------------------
// F. EMR
// ---------------------------------------------------------------------------
{
  const empty = emptyWorkspaceState()
  const base = { primaryConcern: null, examSuggestions: [], finalAssessment: empty.painFinalAssessment, followUpTargets: [] }
  const lbpHyp = { ...emptyLbpWorkingHypothesis(), supports: { ...emptyLbpWorkingHypothesis().supports, NEURAL: 'HIGHER' } }
  assert('F: LBP hypothesis still reaches the A line unchanged', buildPainWorkspaceEmrPreview({ ...base, lbpWorkingHypothesis: lbpHyp }).includes('임상 가설: 신경근 관여 가능성 높음'))
  const neckHyp = { supports: { AXIAL_MOBILITY_DEFICIT: 'HIGHER' }, recordedAt: null }
  const neckText = buildPainWorkspaceEmrPreview({ ...base, lbpWorkingHypothesis: emptyLbpWorkingHypothesis(), regionWorkingHypothesis: { patterns: REGION_PACKS.neck.hypothesisPatterns, value: neckHyp } })
  assert('F: region hypothesis reaches the A line when the LBP one is blank', neckText.includes('임상 가설: 목 움직임 제한(축성 목통증) 가능성 높음'))
  const bothText = buildPainWorkspaceEmrPreview({ ...base, lbpWorkingHypothesis: lbpHyp, regionWorkingHypothesis: { patterns: REGION_PACKS.neck.hypothesisPatterns, value: neckHyp } })
  assert('F: LBP hypothesis takes precedence over the region one (never two 임상 가설 clauses)', bothText.includes('신경근 관여') && !bothText.includes('축성 목통증'))
  assert('F: blank region hypothesis contributes no 임상 가설 clause', !buildPainWorkspaceEmrPreview({ ...base, regionWorkingHypothesis: { patterns: REGION_PACKS.neck.hypothesisPatterns, value: { supports: {}, recordedAt: null } } }).includes('임상 가설'))
  assert('F: O line label defaults to 허리 (old sentence byte-for-byte)', buildPainWorkspaceEmrPreview({ ...base, lbpDirectionalResponse: 'FLEXION_FAVORABLE' }).includes('허리 움직임 반응: 숙이면(굴곡) 호전'))
  assert('F: O line label follows regionLabelKo', buildPainWorkspaceEmrPreview({ ...base, lbpDirectionalResponse: 'FLEXION_FAVORABLE', regionLabelKo: '목' }).includes('목 움직임 반응: 숙이면(굴곡) 호전'))
  assert('F: NOT_ASSESSED still prints no movement-response clause regardless of label', !buildPainWorkspaceEmrPreview({ ...base, lbpDirectionalResponse: 'NOT_ASSESSED', regionLabelKo: '목' }).includes('움직임 반응'))
}

// ---------------------------------------------------------------------------
// G. 추천 엔진
// ---------------------------------------------------------------------------
{
  const payload = structuredClone(PAIN_SCENARIO_1.payload)
  const ws = { ...emptyWorkspaceState(), painFollowUpTargets: [{ id: 'lbp_tf_walking', label: '걷기', baseline: '', postTreatmentValue: '' }] }
  const viaWrapper = buildLbpRecommendationContext(payload, 'NONE', ws)
  const viaPack = buildRecommendationContext(LBP, payload, { lbp_objective_motor_deficit: 'NONE' }, { directionalResponse: ws.lbpDirectionalResponse, confirmedStage: ws.lbpConfirmedStage }, ws)
  assert('G: LBP wrapper and generic engine give identical results on the same record', same(viaWrapper, viaPack))
  assert('G: LBP live record yields candidates (non-vacuous)', viaPack.candidates.length > 0 && viaPack.blocked === null)
  const kneeState = { directionalResponse: 'NOT_ASSESSED', workingHypothesis: { supports: {}, recordedAt: null }, confirmedStage: null }
  const kneePayload = structuredClone(payload)
  delete kneePayload.responses.safety_flags.lbp
  kneePayload.responses.safety_flags.knee = { knee_safety_status: 'CLEAR' }
  kneePayload.responses.modules.knee = { recent_trauma: 'NO' }
  const kneeResult = buildRecommendationContext(REGION_PACKS.knee, kneePayload, {}, kneeState, ws)
  assert('G: an unapproved pack returns the empty result (no candidates, no block, no lock) even on ITS OWN region payload', kneeResult.candidates.length === 0 && kneeResult.blocked === null && kneeResult.treatmentSafetyLocked === false && kneeResult.targetFunctionGap === null)
  const approvedKneeOnKnee = buildRecommendationContext({ ...REGION_PACKS.knee, productionApproved: true }, kneePayload, {}, kneeState, ws)
  assert('G: the same pack, hypothetically approved, DOES engage on its region payload (non-vacuous: safety recompute on a minimal module fails closed → SAFETY_REVIEW block)', approvedKneeOnKnee.blocked === 'SAFETY_REVIEW' && approvedKneeOnKnee.blockedMessageKo.includes('안전 확인(무릎)'))
  const approvedClone = { ...REGION_PACKS.knee, productionApproved: true }
  const kneeOnLbpPayload = buildRecommendationContext(approvedClone, payload, {}, kneeState, ws)
  assert('G: a (hypothetically approved) knee pack on an LBP-only payload is not applicable → empty', kneeOnLbpPayload.candidates.length === 0 && kneeOnLbpPayload.blocked === null)
  // 목(승인): 최소 모듈은 fail closed → SAFETY_REVIEW(목). 실제 CLEAR 기록의 후보 조립은 tests/neck-exercise-core.vignettes.spec.mjs.
  const neckMinimal = structuredClone(payload)
  delete neckMinimal.responses.safety_flags.lbp
  neckMinimal.responses.safety_flags.neck = { neck_safety_status: 'CLEAR' }
  neckMinimal.responses.modules.neck = { recent_trauma: 'NO' }
  const neckMinimalResult = buildRecommendationContext(REGION_PACKS.neck, neckMinimal, {}, kneeState, ws)
  assert('G: the approved neck pack on a minimal (unusable) neck module fails closed → SAFETY_REVIEW(목), never candidates', neckMinimalResult.blocked === 'SAFETY_REVIEW' && neckMinimalResult.blockedMessageKo === safetyReviewBlockedMessageKo('목'))
  assert('G: LBP safety-review block sentence is byte-for-byte the old literal', safetyReviewBlockedMessageKo('허리') === '안전 확인 전까지 일상적인 운동/치료 추천은 잠깁니다 — 위 레인1 안전 확인(허리)을 먼저 확인하세요.')
  assert('G: LBP neuro-refresh block sentence is byte-for-byte the old literal', neuroRefreshBlockedMessageKo('허리') === '새롭거나 악화되는 신경학적 변화가 있어 운동 추천보다 안전 재평가가 우선입니다 — 위 레인1 안전 확인(허리)을 참고하세요.')
}

// ---------------------------------------------------------------------------
// H. SSR — 승인 전 부위 화면에 팩 카드 없음, 요통은 있음
// ---------------------------------------------------------------------------
{
  const lbpHtml = renderToString(React.createElement(DoctorWorkspace, { payload: PAIN_SCENARIO_1.payload, synthetic: undefined }))
  assert('H: LBP live record renders 임상 가설 card, 운동 단계 card and 허리 움직임 반응', lbpHtml.includes('임상 가설(확정 진단 아님)') && lbpHtml.includes('운동 단계') && lbpHtml.includes('허리 움직임 반응'))
  const kneePayload = structuredClone(PAIN_SCENARIO_1.payload)
  delete kneePayload.responses.safety_flags.lbp
  kneePayload.responses.safety_flags.knee = { knee_safety_status: 'CLEAR' }
  kneePayload.responses.modules.knee = { recent_trauma: 'NO' }
  assert('H: mutated payload really routes to knee', drivingRegion(kneePayload.responses) === 'knee')
  const kneeHtml = renderToString(React.createElement(DoctorWorkspace, { payload: kneePayload, synthetic: undefined }))
  assert('H: unapproved knee record renders NO 임상 가설 card, NO 운동 단계 card, NO 움직임 반응 card, NO 확인 추가', !kneeHtml.includes('임상 가설(확정 진단 아님)') && !kneeHtml.includes('운동 단계') && !kneeHtml.includes('움직임 반응') && !kneeHtml.includes('확인 추가'))
  assert('H: unapproved knee record renders NO 재활/운동 제안 and NO 목표 기능 group', !kneeHtml.includes('재활/운동 제안') && !kneeHtml.includes('목표 기능(다음 방문에 같은 동작으로 비교)'))
  assert('H: unapproved knee record still renders the shared lanes (판단·처치, 다음)', kneeHtml.includes('판단·처치') && kneeHtml.includes('id="next-h2"'))
  // 2026-09-07 목 활성화: CLEAR 목 기록은 요통과 같은 카드 집합을 목 라벨로 렌더한다.
  const neckPayload = structuredClone(PAIN_SCENARIO_1.payload)
  delete neckPayload.responses.safety_flags.lbp
  neckPayload.responses.safety_flags.neck = { neck_safety_status: 'CLEAR' }
  neckPayload.responses.modules.neck = { recent_significant_trauma: 'NO', cord_concern_screen: ['NONE'], sudden_unusual_severe_neck_pain: 'NO', thunderclap_headache_screen: 'NO', vascular_associated_screen: ['NONE'], systemic_redflag_screen: ['NONE'], headache_present: 'NO' }
  assert('H: CLEAR neck payload really routes to neck and recomputes CLEAR', drivingRegion(neckPayload.responses) === 'neck' && REGION_PACKS.neck.evaluateSafety(neckPayload, {}).routineCareAllowed === true)
  const neckHtml = renderToString(React.createElement(DoctorWorkspace, { payload: neckPayload, synthetic: undefined }))
  assert('H: approved neck record renders 임상 가설 card with the PR #30 neck labels, 운동 단계 card, 목 움직임 반응 card and 확인 추가', neckHtml.includes('임상 가설(확정 진단 아님)') && neckHtml.includes('목 움직임 제한(축성 목통증)') && neckHtml.includes('운동 단계') && neckHtml.includes('목 움직임 반응') && neckHtml.includes('팔 쪽으로 퍼짐(원위부 악화)') && neckHtml.includes('확인 추가'))
  assert('H: approved neck record renders the 목표 기능 group with neck presets and never LBP ones', neckHtml.includes('컴퓨터·책상 작업') && !neckHtml.includes('허리 움직임 반응') && !neckHtml.includes('lbp_tf_'))
  const shoulderDominant = structuredClone(neckPayload)
  shoulderDominant.responses.safety_flags.shoulder = { shoulder_safety_status: 'CLEAR' }
  shoulderDominant.responses.modules.shoulder = { primary_focus: 'SHOULDER_DOMINANT' }
  const shoulderHtml = renderToString(React.createElement(DoctorWorkspace, { payload: shoulderDominant, synthetic: undefined }))
  assert('H: SHOULDER_DOMINANT record (shoulder pack unapproved) renders NO neck hypothesis / stage / 움직임 반응 cards', !shoulderHtml.includes('임상 가설(확정 진단 아님)') && !shoulderHtml.includes('운동 단계') && !shoulderHtml.includes('움직임 반응'))
}

// ---------------------------------------------------------------------------
// I. 지운 경로 1개당 소스 단언 1개
// ---------------------------------------------------------------------------
{
  const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
  const dw = src('src/doctor/workspace/DoctorWorkspace.tsx')
  assert('I-1: DoctorWorkspace no longer hardcodes isLbpRecord / buildLbpRecommendationContext / mergeLbpExamSuggestions / LBP_CLINICIAN_ADDABLE_EXAMS / appendLbpAdoptionText / suggestLbpExerciseStage', !/isLbpRecord|buildLbpRecommendationContext|mergeLbpExamSuggestions|LBP_CLINICIAN_ADDABLE_EXAMS|appendLbpAdoptionText|suggestLbpExerciseStage/.test(dw))
  assert('I-1: …and reads them through the driving region pack instead', /activeDrivingPack\(payload\.responses\)/.test(dw) && /buildRecommendationContext\(/.test(dw) && /mergeExamSuggestions\(pack\.examHelp, pack\.generateExamSuggestions\(payload\)/.test(dw) && /appendAdoptionText\(regionPack,/.test(dw) && /regionPack\?\.clinicianAddableExams/.test(dw))
  assert('I-1: the only import DoctorWorkspace keeps from lbpWorkingHypothesis is the sentence-append (D-8/D-9 guards)', /import \{ appendLbpHypothesisSentenceToPatientInstruction \} from '\.\/lbpWorkingHypothesis'/.test(dw))
  const pw = src('src/doctor/workspace/PainWorkspace.tsx')
  assert('I-2: PainWorkspace no longer imports LBP_TARGET_FUNCTION_OPTIONS / LBP_CLINICIAN_ADDABLE_EXAMS / LBP_TARGET_FUNCTION_PLACEHOLDERS', !/LBP_TARGET_FUNCTION_OPTIONS|LBP_CLINICIAN_ADDABLE_EXAMS|LBP_TARGET_FUNCTION_PLACEHOLDERS/.test(pw))
  assert('I-2: …target functions, placeholders and addable exams come from the pack', /pack\.targetFunctions/.test(pw) && /pack\.targetFunctionPlaceholders/.test(pw) && /pack\.clinicianAddableExams/.test(pw))
  assert('I-2: directional card is gated on pack.directionalResponseApplicable', /pack\.directionalResponseApplicable && \(/.test(pw))
  const rw = src('src/doctor/workspace/RevisitWorkspace.tsx')
  assert('I-3: RevisitWorkspace reads/writes the hypothesis through the region adapter', /readRegionHypothesis\(/.test(rw) && /withRegionHypothesis\(/.test(rw) && !/s\.lbpWorkingHypothesis:|lbpWorkingHypothesis: apply/.test(rw))
  const st = src('server/store.js')
  assert('I-4: server derives the candidate order with drivingRegionCandidates and asks detailCheckQuestionIdsForCandidates (no isLbp boolean)', /drivingRegionCandidates\(record\?\.submission\?\.responses\)/.test(st) && /detailCheckQuestionIdsForCandidates\(candidates\)/.test(st) && !/isLbp/.test(st.slice(st.indexOf('async function deriveDetailCheck'), st.indexOf('async function deriveDetailCheck') + 1200)))
  const ep = src('src/doctor/workspace/emrPreview.ts')
  assert('I-5: emrPreview keeps the 허리 default so the LBP O line is unchanged', /input\.regionLabelKo \?\? '허리'/.test(ep))
}

// ---------------------------------------------------------------------------
// J. 요통 동등성 §8 + E-1~E-4 (DECISIONS 2026-09-07 "추천안으로 모두 승인")
// ---------------------------------------------------------------------------
{
  const ids = (k) => REGION_PACKS[k].hypothesisPatterns.map((p) => p.id)
  // §8/§5 — PR #30 가설 상태로 교체. 목은 요통과 같은 5개.
  assert('J-§8: neck hypothesis patterns are the 5 PR #30 candidates in order', same(ids('neck'), ['AXIAL_MOBILITY_DEFICIT', 'RADICULAR_INVOLVEMENT', 'CERVICOGENIC_HEADACHE', 'MOVEMENT_COORDINATION_DEFICIT', 'SHOULDER_OR_PERIPHERAL']))
  assert('J-§8: neck has as many patterns as LBP (5)', ids('neck').length === LBP.hypothesisPatterns.length && LBP.hypothesisPatterns.length === 5)
  assert('J-§8: shoulder hypothesis patterns are the 6 PR #30 phenotypes', same(ids('shoulder'), ['RC_RELATED', 'FROZEN_SHOULDER', 'GH_OA', 'INSTABILITY_TRAUMATIC', 'INSTABILITY_ATRAUMATIC_MOTOR_CONTROL', 'CERVICAL_CONTRIBUTION']))
  assert('J-§8: knee hypothesis patterns are the 7 PR #30 phenotypes', same(ids('knee'), ['KNEE_OA', 'PATELLOFEMORAL_PAIN', 'PATELLAR_TENDINOPATHY', 'ACUTE_MENISCAL', 'DEGENERATIVE_MENISCAL', 'LIGAMENT_INSTABILITY', 'PATELLAR_INSTABILITY']))
  const ARCHIVE_PATTERN_IDS = /^(FHP|UPPER_TRAP_LEVATOR|FLAT_NECK|THORACIC_RESTRICTION|SCAPULAR_PROTRACTION|UPPER_TRAP_DOMINANT|SCAPULAR_IR_DOWNWARD|INTERNAL_ROTATION|EXTERNAL_ROTATION|STIFF_KNEE|HIP_KNEE_COUPLING)$/
  assert('J-§8: no archive 4-pattern id survives in neck/shoulder/knee', ['neck', 'shoulder', 'knee'].every((k) => ids(k).every((id) => !ARCHIVE_PATTERN_IDS.test(id))))
  assert('J-§8: MUST_EXCLUDE_* is L0 safety, never a hypothesis chip (any pack)', REGION_KEYS.every((k) => ids(k).every((id) => !/^MUST_EXCLUDE/.test(id))))
  assert('J-§8: shoulder/knee archive exercise names are preserved as candidates (8 each) and stay unapproved', ['shoulder', 'knee'].every((k) => REGION_PACKS[k].coreExercises.length === 8 && REGION_PACKS[k].productionApproved === false))
assert('J-④: neck carries the CLOSED Core 9 (archive ids all retired) and is approved with zero gaps', REGION_PACKS.neck.coreExercises.length === 9 && REGION_PACKS.neck.productionApproved === true && REGION_PACKS.neck.coreExercises.every((e) => !/^NECK_(FHP|TRAP|FLAT|THX_02)/.test(e.exerciseId)) && packContentGaps(REGION_PACKS.neck).length === 0)
  assert('J-§8: LBP pack is unchanged — patterns, exercises, labels byte-identical to the old constants', same(LBP.hypothesisPatterns.map((p) => p.id), LBP_HYPOTHESIS_PATTERN_IDS) && LBP.coreExercises.length === LBP_CORE_EXERCISE_METADATA.length && LBP.coreExercises.every((e, i) => e.exerciseId === LBP_CORE_EXERCISE_METADATA[i].exerciseId && e.strategyLabelKo === REGION_PACKS.lbp.rehabDomains.find((d) => d.id === e.domain)?.labelKo))
  assert('J-§8: hip / ankle_foot / tmj / elbow / wrist_hand still declare no PR #30 domain table (out of PR #30 scope)', ['hip', 'ankle_foot', 'tmj', 'elbow', 'wrist_hand'].every((k) => REGION_PACKS[k].rehabDomains.length === 0))

  // §3 — 방향성 반응: 목만 켠다.
  assert('J-§3: directionalResponseApplicable is true for lbp and neck only', REGION_KEYS.filter((k) => REGION_PACKS[k].directionalResponseApplicable).join(',') === 'lbp,neck')

  // E-1 — 라벨 팩화. 값 집합은 공통, 라벨만 부위별.
  const neckLabels = REGION_PACKS.neck.directionalResponseLabels
  assert('E-1: neck declares labels only for known directional values', Object.keys(neckLabels).every((v) => ['NOT_ASSESSED', 'FLEXION_FAVORABLE', 'EXTENSION_FAVORABLE', 'NO_CLEAR_DIRECTION', 'DISTAL_WORSENING', 'UNCLEAR'].includes(v)) && neckLabels.DISTAL_WORSENING === '팔 쪽으로 퍼짐(원위부 악화)')
  assert('E-1: LBP declares no label override (old strings stay the default path)', LBP.directionalResponseLabels === undefined && LBP.directionalResponseHelp === undefined)
  {
    const empty = emptyWorkspaceState()
    const base = { primaryConcern: null, examSuggestions: [], finalAssessment: empty.painFinalAssessment, followUpTargets: [] }
    assert('E-1 EMR: neck labels reach the O line with the neck region label', buildPainWorkspaceEmrPreview({ ...base, lbpDirectionalResponse: 'DISTAL_WORSENING', regionLabelKo: '목', directionalResponseLabels: neckLabels }).includes('목 움직임 반응: 팔 쪽으로 퍼짐(원위부 악화)'))
    assert('E-1 EMR: a value the pack does not override falls back to the shared label', buildPainWorkspaceEmrPreview({ ...base, lbpDirectionalResponse: 'NO_CLEAR_DIRECTION', regionLabelKo: '목', directionalResponseLabels: neckLabels }).includes('목 움직임 반응: 뚜렷한 방향 없음'))
    assert('E-1 EMR: LBP sentence without labels is byte-for-byte the old one', buildPainWorkspaceEmrPreview({ ...base, lbpDirectionalResponse: 'DISTAL_WORSENING' }).includes('허리 움직임 반응: 다리 쪽으로 퍼짐(원위부 악화)'))
    // SSR: 승인된 목 팩(가정)을 직접 넘기면 목 라벨·목 도움말이 칩에 나온다; 요통 팩은 옛 문구.
    const lane2Props = (pack, payload) => ({
      payload,
      examSuggestions: [],
      onChangeExamSuggestion: () => {},
      additionalConcernPromotion: empty.additionalConcernPromotion,
      onChangeAdditionalConcernPromotion: () => {},
      reassessment: empty.painReassessment,
      onChangeReassessment: () => {},
      regionPack: pack,
      directionalResponse: 'NOT_ASSESSED',
      onChangeDirectionalResponse: () => {},
    })
    const neckPayload = structuredClone(PAIN_SCENARIO_1.payload)
    delete neckPayload.responses.safety_flags.lbp
    neckPayload.responses.safety_flags.neck = { neck_safety_status: 'CLEAR' }
    neckPayload.responses.modules.neck = { recent_trauma: 'NO' }
    const neckHtml = renderToString(React.createElement(PainWorkspaceLane2, lane2Props({ ...REGION_PACKS.neck, productionApproved: true }, neckPayload)))
    assert('E-1 SSR: hypothetically approved neck pack renders 목 움직임 반응 with the neck chip label and neck help text', neckHtml.includes('목 움직임 반응') && neckHtml.includes('팔 쪽으로 퍼짐(원위부 악화)') && neckHtml.includes('손 쪽으로 더 퍼지는지') && !neckHtml.includes('다리 쪽으로 퍼짐'))
    const lbpHtml = renderToString(React.createElement(PainWorkspaceLane2, lane2Props(LBP, PAIN_SCENARIO_1.payload)))
    assert('E-1 SSR: LBP card still renders the old chip label and old help text', lbpHtml.includes('허리 움직임 반응') && lbpHtml.includes('다리 쪽으로 퍼짐(원위부 악화)') && lbpHtml.includes('서서 허리를 굽히고') && !lbpHtml.includes('팔 쪽으로 퍼짐'))
  }

  // E-2 — 신경 상태 검사 파생(D-1).
  const ex = (id, status) => ({ id, title: id, priority: 'CONTEXTUAL', reasonFacts: [], source: 'SUGGESTED', result: { status, laterality: null, note: '', recordedAt: null } })
  const NECK_NEURO = REGION_PACKS.neck.neuroExamIds
  assert('E-2: neck derives neuro status from exactly the C5–T1 baseline and UMN exams; both are addable exams', same(NECK_NEURO, ['neck_exam_neuro_c5_t1', 'neck_exam_umn']) && NECK_NEURO.every((id) => REGION_PACKS.neck.clinicianAddableExams.some((x) => x.id === id)))
  assert('E-2: provocation tests (Spurling/ULTT) are addable exams but NOT neuro-status exams', ['neck_exam_spurling', 'neck_exam_ultt'].every((id) => REGION_PACKS.neck.clinicianAddableExams.some((x) => x.id === id) && !NECK_NEURO.includes(id)))
  assert('E-2: lbp / shoulder / knee and every other pack declare no neuro exam ids (LBP keeps the clinician judgment field)', REGION_KEYS.filter((k) => k !== 'neck').every((k) => REGION_PACKS[k].neuroExamIds.length === 0))
  assert('E-2 unit: no ids → null (caller keeps evaluateSafety().neuroStatus)', neuroStatusFromExamResults([], [ex('neck_exam_neuro_c5_t1', 'POSITIVE')]) === null)
  assert('E-2 unit: nothing recorded → UNKNOWN, never STABLE', neuroStatusFromExamResults(NECK_NEURO, []) === 'UNKNOWN')
  assert('E-2 unit: one NEGATIVE, one absent → UNKNOWN (partial baseline is not stability)', neuroStatusFromExamResults(NECK_NEURO, [ex('neck_exam_neuro_c5_t1', 'NEGATIVE')]) === 'UNKNOWN')
  assert('E-2 unit: NEGATIVE + UNCLEAR/LIMITED/NOT_PERFORMED/NOT_YET_CHECKED → UNKNOWN', ['UNCLEAR', 'LIMITED', 'NOT_PERFORMED', 'NOT_YET_CHECKED'].every((st) => neuroStatusFromExamResults(NECK_NEURO, [ex('neck_exam_neuro_c5_t1', 'NEGATIVE'), ex('neck_exam_umn', st)]) === 'UNKNOWN'))
  assert('E-2 unit: all NEGATIVE → STABLE', neuroStatusFromExamResults(NECK_NEURO, [ex('neck_exam_neuro_c5_t1', 'NEGATIVE'), ex('neck_exam_umn', 'NEGATIVE')]) === 'STABLE')
  assert('E-2 unit: any POSITIVE → NEW_OR_WORSENING even when the other is NEGATIVE', neuroStatusFromExamResults(NECK_NEURO, [ex('neck_exam_neuro_c5_t1', 'NEGATIVE'), ex('neck_exam_umn', 'POSITIVE')]) === 'NEW_OR_WORSENING')
  {
    // 통합: 안전 CLEAR인(가정) 승인 목 팩에서 신경 검사 POSITIVE는 RF-3b 전체 차단(목 문장), 미기록은 차단 없음.
    const clearNeck = { ...REGION_PACKS.neck, productionApproved: true, evaluateSafety: () => ({ applicable: true, routineCareAllowed: true, treatmentSafetyLocked: false, neuroStatus: 'UNKNOWN' }) }
    const neckState = { directionalResponse: 'NOT_ASSESSED', workingHypothesis: { supports: {}, recordedAt: null }, confirmedStage: null }
    const wsPos = { ...emptyWorkspaceState(), painExamSuggestions: [ex('neck_exam_umn', 'POSITIVE')] }
    const pos = buildRecommendationContext(clearNeck, PAIN_SCENARIO_1.payload, {}, neckState, wsPos)
    assert('E-2 engine: POSITIVE UMN exam on a (hypothetically) CLEAR approved neck pack → NEURO_REFRESH block with the 목 sentence', pos.blocked === 'NEURO_REFRESH' && pos.blockedMessageKo === neuroRefreshBlockedMessageKo('목'))
    const none = buildRecommendationContext(clearNeck, PAIN_SCENARIO_1.payload, {}, neckState, emptyWorkspaceState())
    assert('E-2 engine: no neuro exam recorded → UNKNOWN → no block (candidates just gate on their own rules)', none.blocked === null)
    // 요통은 검사 결과가 신경 상태를 건드리지 않는다 — 원장 판단 필드가 유일한 입력(행동 0 변경).
    const ws = { ...emptyWorkspaceState(), painFollowUpTargets: [{ id: 'lbp_tf_walking', label: '걷기', baseline: '', postTreatmentValue: '' }] }
    const lbpBase = buildLbpRecommendationContext(PAIN_SCENARIO_1.payload, 'NONE', ws)
    const lbpWithPositiveExams = buildLbpRecommendationContext(PAIN_SCENARIO_1.payload, 'NONE', { ...ws, painExamSuggestions: [ex('neck_exam_umn', 'POSITIVE'), ex('lbp_exam_neuro_baseline', 'POSITIVE')] })
    assert('E-2 engine: LBP ignores exam-derived neuro status entirely (same blocked/candidate ids with or without POSITIVE exams)', lbpBase.blocked === null && lbpWithPositiveExams.blocked === null && same(lbpBase.candidates.map((c) => c.exerciseId), lbpWithPositiveExams.candidates.map((c) => c.exerciseId)))
    assert('E-2 hint: LBP hint is the old literal; neck hint names the neuro exams', neuroUnrecordedHintForPack(LBP) === LBP_NEURO_UNRECORDED_HINT_KO && LBP_NEURO_UNRECORDED_HINT_KO.includes('객관적 검사 소견') && neuroUnrecordedHintForPack(REGION_PACKS.neck).includes('C5–T1 신경학적 기준선') && neuroUnrecordedHintForPack(REGION_PACKS.neck).includes('확인 추가'))
  }

  // E-3 — 도메인 표 + 출처 게이트.
  assert('E-3: domain table sizes follow PR #30 (neck 9 / shoulder 8 / knee 11) and the LBP catalog (13)', REGION_PACKS.neck.rehabDomains.length === 9 && REGION_PACKS.shoulder.rehabDomains.length === 8 && REGION_PACKS.knee.rehabDomains.length === 11 && LBP.rehabDomains.length === 13)
  for (const k of ['lbp', 'neck', 'shoulder', 'knee']) {
    const domainIds = new Set(REGION_PACKS[k].rehabDomains.map((d) => d.id))
    assert(`E-3: every ${k} core exercise carries a domain from its own table`, REGION_PACKS[k].coreExercises.every((e) => domainIds.has(e.domain)))
    assert(`E-3: ${k} domain ids are unique`, domainIds.size === REGION_PACKS[k].rehabDomains.length)
  }
  assert('E-3: draft exercise strategy label = its domain label (the old archive pattern name is gone from the card reason line)', ['neck', 'shoulder', 'knee'].every((k) => REGION_PACKS[k].coreExercises.every((e) => e.strategyLabelKo === REGION_PACKS[k].rehabDomains.find((d) => d.id === e.domain).labelKo)) && !REGION_PACKS.neck.coreExercises.some((e) => /FHP|승모·견갑거근|플랫넥/.test(e.strategyLabelKo)))
  const PROV_FIELDS = ['hypothesisPatterns', 'targetFunctions', 'coreExercises', 'stageTable', 'clinicianAddableExams', 'directSupportByExam']
  assert('provenance: every pack declares all 6 provenance fields', REGION_KEYS.every((k) => same(Object.keys(REGION_PACKS[k].provenance).sort(), [...PROV_FIELDS].sort())))
  assert('provenance: LBP is CLINICIAN_APPROVED on every field (the only approvable value)', PROV_FIELDS.every((f) => LBP.provenance[f] === 'CLINICIAN_APPROVED'))
  assert('provenance: shoulder/knee hypotheses are PR30_FRAMEWORK and exercises are ARCHIVE_CANDIDATE; neck is CLINICIAN_APPROVED on every field', ['shoulder', 'knee'].every((k) => REGION_PACKS[k].provenance.hypothesisPatterns === 'PR30_FRAMEWORK' && REGION_PACKS[k].provenance.coreExercises === 'ARCHIVE_CANDIDATE') && PROV_FIELDS.every((f) => REGION_PACKS.neck.provenance[f] === 'CLINICIAN_APPROVED'))
  assert('provenance gate: a non-approved provenance is a content gap (shoulder lists 6 provenance gaps, one per non-approved field)', packContentGaps(REGION_PACKS.shoulder).filter((g) => g.startsWith('provenance.')).length === 6 && packContentGaps(REGION_PACKS.shoulder).includes('provenance.coreExercises = ARCHIVE_CANDIDATE (원장 확정 전)'))
  assert('provenance gate: flipping only productionApproved on a pack with non-approved provenance still leaves gaps (approval needs the provenance flipped too)', packContentGaps({ ...REGION_PACKS.shoulder, productionApproved: true }).some((g) => g.startsWith('provenance.')))
  assert('provenance gate (non-vacuous): the LBP pack with one field downgraded gains exactly that gap', same(packContentGaps({ ...LBP, provenance: { ...LBP.provenance, stageTable: 'CLAUDE_DRAFT' } }), ['provenance.stageTable = CLAUDE_DRAFT (원장 확정 전)']))
  assert('E-3 gate (non-vacuous): an LBP row with an unknown domain is a gap', packContentGaps({ ...LBP, coreExercises: [{ ...LBP.coreExercises[0], domain: 'NOPE' }, ...LBP.coreExercises.slice(1)] }).some((g) => g.includes(".domain 'NOPE'")))
  assert('E-2 gate (non-vacuous): a neuro exam id the pack cannot surface is a gap', packContentGaps({ ...LBP, neuroExamIds: ['ghost_exam'] }).some((g) => g.startsWith('neuroExamIds.ghost_exam')))

  // E-4 — 진단(가설) → 운동 하드코딩 부정 단언 (PR #30 "금지").
  const wordRe = (id) => new RegExp(`\\b${id}\\b`)
  for (const k of REGION_KEYS) {
    const pack = REGION_PACKS[k]
    const exerciseSide = JSON.stringify({ coreExercises: pack.coreExercises, eligibilityRules: pack.eligibilityRules, stageTable: pack.stageTable, directSupportByExam: pack.directSupportByExam, targetFunctionIdToEnum: pack.targetFunctionIdToEnum })
    assert(`E-4: no ${k} hypothesis pattern id appears anywhere on the exercise side (rules, stage table, exam support, TF mapping)`, pack.hypothesisPatterns.every((p) => !wordRe(p.id).test(exerciseSide)))
    const examIds = new Set([...Object.keys(pack.examHelp), ...pack.clinicianAddableExams.map((x) => x.id)])
    assert(`E-4: ${k} directSupportByExam keys are exam ids the pack can surface (never a hypothesis or diagnosis)`, Object.keys(pack.directSupportByExam).every((id) => examIds.has(id)))
    assert(`E-4: ${k} exercise/pattern ids carry no structural-diagnosis token`, !/\b(DISC|STENOSIS|FACET|IMPINGEMENT|HERNIATION|BULGE)\b/.test(JSON.stringify([pack.hypothesisPatterns.map((p) => p.id), pack.coreExercises.map((e) => e.exerciseId)])))
  }
  {
    const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
    const engine = src('src/doctor/workspace/lbpExerciseRecommendation.ts')
    assert('E-4: the recommendation engine never reads hypothesisPatterns / workingHypothesis / rehabDomains / a row domain (가설·도메인 → 운동 자동 연결 없음)', !/hypothesisPatterns|workingHypothesis|rehabDomains|\.domain\b/.test(engine))
    const elig = src('src/doctor/workspace/lbpExerciseEligibility.ts')
    assert('E-4: the eligibility engine never reads hypothesisPatterns / workingHypothesis', !/hypothesisPatterns|workingHypothesis/.test(elig))
    const pw = src('src/doctor/workspace/PainWorkspace.tsx')
    assert('E-1 source: the directional card takes labels/help from the pack', /labels=\{pack\.directionalResponseLabels\}/.test(pw) && /help=\{pack\.directionalResponseHelp\}/.test(pw) && /directionalResponseLabels: pack\?\.directionalResponseLabels/.test(pw))
    const dv = src('src/doctor/DoctorView.tsx')
    assert('E-1 source: 종결 EMR passes the same directionalResponseLabels key (key-set parity with PainWorkspace)', /directionalResponseLabels: regionPack\?\.directionalResponseLabels/.test(dv))
    const dw = src('src/doctor/workspace/DoctorWorkspace.tsx')
    assert('E-2 source: DoctorWorkspace passes the pack-derived neuro hint', /neuroUnrecordedHintKo=\{regionPack \? neuroUnrecordedHintForPack\(regionPack\) : undefined\}/.test(dw))
  }
}

console.log(`\n${passed} region-pack assertions passed.`)
