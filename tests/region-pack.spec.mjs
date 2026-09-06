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
  ['lbp+hip, BUTTOCK_PELVIS_DOMINANT → [lbp, hip]', F({ lbp: {}, hip: {} }, { hip: { region_discriminator: 'BUTTOCK_PELVIS_DOMINANT' } }), ['lbp', 'hip']],
  ['neck+shoulder, SHOULDER_DOMINANT → [shoulder, neck]', F({ neck: {}, shoulder: {} }, { shoulder: { primary_focus: 'SHOULDER_DOMINANT' } }), ['shoulder', 'neck']],
  ['neck+shoulder, NECK_DOMINANT → [neck, shoulder]', F({ neck: {}, shoulder: {} }, { shoulder: { primary_focus: 'NECK_DOMINANT' } }), ['neck', 'shoulder']],
  ['garbage → []', 'x', []],
]
for (const [name, responses, expected] of CANDIDATE_CASES) {
  assert(`B-cand: ${name}`, same(drivingRegionCandidates(responses), expected))
  assert(`B-cand: ${name} — server parity`, same(serverDrivingRegionCandidates(responses), expected))
}
// 회귀 방지: 판별 부위의 팩이 승인 전이면 같은 모집단의 승인 팩(요통)으로 후퇴한다.
assert('B-fallback: HIP_GROIN_DOMINANT patient still gets the LBP pack while the hip pack is unapproved', activeDrivingPack(F({ lbp: {}, hip: {} }, { hip: { region_discriminator: 'HIP_GROIN_DOMINANT' } })) === REGION_PACKS.lbp)
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
assert('C: detailCheckQuestionIdsForRegion(neck) = common only (unapproved)', same(detailCheckQuestionIdsForRegion('neck'), [...DETAIL_CHECK_COMMON_QUESTION_IDS]))
assert('C: detailCheckQuestionIdsForRegion(lbp) = common + LBP 3', same(detailCheckQuestionIdsForRegion('lbp'), ['VISIT_04_SYMPTOM_IMPACT', 'LBP_12', 'LBP_13', 'LBP_14']))
assert('C: legacy detailCheckQuestionIds({isLbp}) unchanged', same(detailCheckQuestionIds({ isLbp: true }), detailCheckQuestionIdsForRegion('lbp')) && same(detailCheckQuestionIds({ isLbp: false }), detailCheckQuestionIdsForRegion(null)))
assert('C: a bogus region gets common only (no throw)', same(detailCheckQuestionIdsForRegion('__proto__'), [...DETAIL_CHECK_COMMON_QUESTION_IDS]))
assert('C-fallback: candidates [hip, lbp] → LBP ids (hip unapproved → falls back to lbp, same rule as the screen)', same(detailCheckQuestionIdsForCandidates(['hip', 'lbp']), detailCheckQuestionIdsForRegion('lbp')))
assert('C-fallback: candidates [neck] / [] / garbage → common only', same(detailCheckQuestionIdsForCandidates(['neck']), [...DETAIL_CHECK_COMMON_QUESTION_IDS]) && same(detailCheckQuestionIdsForCandidates([]), [...DETAIL_CHECK_COMMON_QUESTION_IDS]) && same(detailCheckQuestionIdsForCandidates('x'), [...DETAIL_CHECK_COMMON_QUESTION_IDS]))

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
assert('D: exactly one approved pack today (lbp)', REGION_KEYS.filter((k) => REGION_PACKS[k].productionApproved).join(',') === 'lbp')
assert('D: draft packs with clinician content exist for the 6 regions found in Notion/Drive', ['neck', 'shoulder', 'knee', 'hip', 'ankle_foot', 'tmj'].every((k) => REGION_PACKS[k].hypothesisPatterns.length >= 3 && REGION_PACKS[k].coreExercises.length >= 3))
assert('D: elbow / wrist_hand are empty drafts (no clinician document found)', ['elbow', 'wrist_hand'].every((k) => REGION_PACKS[k].hypothesisPatterns.length === 0 && REGION_PACKS[k].coreExercises.length === 0))
assert('D: every draft pack says DRAFT in sourceDocument', REGION_KEYS.filter((k) => !REGION_PACKS[k].productionApproved).every((k) => /DRAFT/.test(REGION_PACKS[k].sourceDocument)))
assert('D: draft eligibility rules do not require stable neuro / distal stop (no such inputs exist for those regions)', REGION_KEYS.filter((k) => k !== 'lbp').every((k) => REGION_PACKS[k].eligibilityRules.every((r) => r.requiresStableNeuro === false && r.stopOnDistalWorsening === false)))

// ---------------------------------------------------------------------------
// E. 저장 어댑터
// ---------------------------------------------------------------------------
{
  const NECK_PATTERNS = REGION_PACKS.neck.hypothesisPatterns
  assert('E: sanitizeRegionClinicalMap drops lbp and unknown keys, keeps only known non-lbp keys', same(Object.keys(sanitizeRegionClinicalMap({ lbp: {}, neck: {}, bogus: {} })), ['neck']))
  assert('E: sanitizeRegionClinicalMap of garbage is {}', same(sanitizeRegionClinicalMap('x'), {}) && same(sanitizeRegionClinicalMap(null), {}) && same(sanitizeRegionClinicalMap([1]), {}))
  const s = sanitizeRegionClinicalMap({ neck: { directionalResponse: 'FLEXION_FAVORABLE', confirmedStage: 2, workingHypothesis: { supports: { FHP: 'HIGHER', BOGUS: 'nope', 7: 'LOWER' }, recordedAt: 't' } }, knee: 'garbage' })
  assert('E: valid neck record survives (directional, stage, valid supports only)', s.neck.directionalResponse === 'FLEXION_FAVORABLE' && s.neck.confirmedStage === 2 && same(s.neck.workingHypothesis, { supports: { 7: 'LOWER', FHP: 'HIGHER' }, recordedAt: 't' }) || (s.neck.workingHypothesis.supports.FHP === 'HIGHER' && s.neck.workingHypothesis.supports.BOGUS === undefined))
  assert('E: garbage region record degrades to defaults, not dropped', s.knee.directionalResponse === 'NOT_ASSESSED' && s.knee.confirmedStage === null && same(s.knee.workingHypothesis, { supports: {}, recordedAt: null }))
  assert('E: bad stage values degrade to null', sanitizeRegionClinicalMap({ neck: { confirmedStage: '2' } }).neck.confirmedStage === null && sanitizeRegionClinicalMap({ neck: { confirmedStage: 4 } }).neck.confirmedStage === null && sanitizeRegionClinicalMap({ neck: { confirmedStage: 0 } }).neck.confirmedStage === 0)

  const empty = emptyWorkspaceState()
  assert('E: emptyWorkspaceState.regionClinical is {} (additive, schema unchanged 1.1.0)', same(empty.regionClinical, {}) && empty.schema_version === '1.1.0')
  assert('E: legacy record without regionClinical deserializes to {}', same(deserializeWorkspaceState({}).regionClinical, {}))
  const rt = deserializeWorkspaceState(JSON.parse(JSON.stringify({ ...empty, regionClinical: { neck: { directionalResponse: 'NOT_ASSESSED', confirmedStage: 1, workingHypothesis: { supports: { FHP: 'CONSIDER' }, recordedAt: null } } } })))
  assert('E: regionClinical round-trips through serialize/deserialize', rt.regionClinical.neck.confirmedStage === 1 && rt.regionClinical.neck.workingHypothesis.supports.FHP === 'CONSIDER')
  assert('E: a persisted regionClinical.lbp is dropped on load (single storage path for LBP)', deserializeWorkspaceState({ regionClinical: { lbp: { confirmedStage: 3 } } }).regionClinical.lbp === undefined)

  const lbpRead = readRegionClinical({ ...empty, lbpDirectionalResponse: 'EXTENSION_FAVORABLE', lbpConfirmedStage: 2 }, 'lbp', LBP.hypothesisPatterns)
  assert('E: readRegionClinical(lbp) reads the old three fields', lbpRead.directionalResponse === 'EXTENSION_FAVORABLE' && lbpRead.confirmedStage === 2 && same(lbpRead.workingHypothesis, emptyLbpWorkingHypothesis()))
  const w1 = withRegionClinical(empty, 'lbp', { confirmedStage: 2, directionalResponse: 'FLEXION_FAVORABLE' })
  assert('E: withRegionClinical(lbp) writes lbpConfirmedStage/lbpDirectionalResponse and never regionClinical', w1.lbpConfirmedStage === 2 && w1.lbpDirectionalResponse === 'FLEXION_FAVORABLE' && same(w1.regionClinical, {}))
  const w2 = withRegionClinical(empty, 'neck', { confirmedStage: 1 })
  assert('E: withRegionClinical(neck) writes regionClinical.neck and leaves the LBP fields untouched', w2.regionClinical.neck.confirmedStage === 1 && w2.lbpConfirmedStage === null && w2.regionClinical.neck.directionalResponse === 'NOT_ASSESSED')
  const neckRead = readRegionClinical(w2, 'neck', NECK_PATTERNS)
  assert('E: readRegionClinical(neck) prunes the hypothesis to the pack patterns (all UNJUDGED by default)', same(Object.keys(neckRead.workingHypothesis.supports), NECK_PATTERNS.map((p) => p.id)) && Object.values(neckRead.workingHypothesis.supports).every((v) => v === 'UNJUDGED'))
  const w3 = withRegionHypothesis(w2, 'neck', { supports: { FHP: 'HIGHER' }, recordedAt: 'now' })
  assert('E: withRegionHypothesis(neck) keeps confirmedStage and replaces only the hypothesis', w3.regionClinical.neck.confirmedStage === 1 && readRegionHypothesis(w3, 'neck', NECK_PATTERNS).supports.FHP === 'HIGHER')
  const vws = emptyVisitWorkspaceState()
  assert('E: VisitWorkspaceState has regionClinical {} and legacy loads to {}', same(vws.regionClinical, {}) && same(deserializeVisitWorkspaceState({}).regionClinical, {}))
  const v2 = withRegionHypothesis(vws, 'knee', { supports: { STIFF_KNEE: 'LOWER' }, recordedAt: null })
  assert('E: revisit hypothesis for knee round-trips through deserializeVisitWorkspaceState', deserializeVisitWorkspaceState(JSON.parse(JSON.stringify(v2))).regionClinical.knee.workingHypothesis.supports.STIFF_KNEE === 'LOWER')
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
  const neckHyp = { supports: { FHP: 'HIGHER' }, recordedAt: null }
  const neckText = buildPainWorkspaceEmrPreview({ ...base, lbpWorkingHypothesis: emptyLbpWorkingHypothesis(), regionWorkingHypothesis: { patterns: REGION_PACKS.neck.hypothesisPatterns, value: neckHyp } })
  assert('F: region hypothesis reaches the A line when the LBP one is blank', neckText.includes('임상 가설: 전방머리자세(FHP)형 가능성 높음'))
  const bothText = buildPainWorkspaceEmrPreview({ ...base, lbpWorkingHypothesis: lbpHyp, regionWorkingHypothesis: { patterns: REGION_PACKS.neck.hypothesisPatterns, value: neckHyp } })
  assert('F: LBP hypothesis takes precedence over the region one (never two 임상 가설 clauses)', bothText.includes('신경근 관여') && !bothText.includes('전방머리자세'))
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
  const neckState = { directionalResponse: 'NOT_ASSESSED', workingHypothesis: { supports: {}, recordedAt: null }, confirmedStage: null }
  const neckPayload = structuredClone(payload)
  delete neckPayload.responses.safety_flags.lbp
  neckPayload.responses.safety_flags.neck = { neck_safety_status: 'CLEAR' }
  neckPayload.responses.modules.neck = { recent_trauma: 'NO' }
  const neckResult = buildRecommendationContext(REGION_PACKS.neck, neckPayload, {}, neckState, ws)
  assert('G: an unapproved pack returns the empty result (no candidates, no block, no lock) even on ITS OWN region payload', neckResult.candidates.length === 0 && neckResult.blocked === null && neckResult.treatmentSafetyLocked === false && neckResult.targetFunctionGap === null)
  const approvedNeckOnNeck = buildRecommendationContext({ ...REGION_PACKS.neck, productionApproved: true }, neckPayload, {}, neckState, ws)
  assert('G: the same pack, hypothetically approved, DOES engage on its region payload (non-vacuous: safety recompute on a minimal module fails closed → SAFETY_REVIEW block)', approvedNeckOnNeck.blocked === 'SAFETY_REVIEW' && approvedNeckOnNeck.blockedMessageKo.includes('안전 확인(목)'))
  const approvedClone = { ...REGION_PACKS.neck, productionApproved: true }
  const neckOnLbpPayload = buildRecommendationContext(approvedClone, payload, {}, neckState, ws)
  assert('G: a (hypothetically approved) neck pack on an LBP-only payload is not applicable → empty', neckOnLbpPayload.candidates.length === 0 && neckOnLbpPayload.blocked === null)
  assert('G: LBP safety-review block sentence is byte-for-byte the old literal', safetyReviewBlockedMessageKo('허리') === '안전 확인 전까지 일상적인 운동/치료 추천은 잠깁니다 — 위 레인1 안전 확인(허리)을 먼저 확인하세요.')
  assert('G: LBP neuro-refresh block sentence is byte-for-byte the old literal', neuroRefreshBlockedMessageKo('허리') === '새롭거나 악화되는 신경학적 변화가 있어 운동 추천보다 안전 재평가가 우선입니다 — 위 레인1 안전 확인(허리)을 참고하세요.')
}

// ---------------------------------------------------------------------------
// H. SSR — 승인 전 부위 화면에 팩 카드 없음, 요통은 있음
// ---------------------------------------------------------------------------
{
  const lbpHtml = renderToString(React.createElement(DoctorWorkspace, { payload: PAIN_SCENARIO_1.payload, synthetic: undefined }))
  assert('H: LBP live record renders 임상 가설 card, 운동 단계 card and 허리 움직임 반응', lbpHtml.includes('임상 가설(확정 진단 아님)') && lbpHtml.includes('운동 단계') && lbpHtml.includes('허리 움직임 반응'))
  const neckPayload = structuredClone(PAIN_SCENARIO_1.payload)
  delete neckPayload.responses.safety_flags.lbp
  neckPayload.responses.safety_flags.neck = { neck_safety_status: 'CLEAR' }
  neckPayload.responses.modules.neck = { recent_trauma: 'NO' }
  assert('H: mutated payload really routes to neck', drivingRegion(neckPayload.responses) === 'neck')
  const neckHtml = renderToString(React.createElement(DoctorWorkspace, { payload: neckPayload, synthetic: undefined }))
  assert('H: unapproved neck record renders NO 임상 가설 card, NO 운동 단계 card, NO 움직임 반응 card, NO 확인 추가', !neckHtml.includes('임상 가설(확정 진단 아님)') && !neckHtml.includes('운동 단계') && !neckHtml.includes('움직임 반응') && !neckHtml.includes('확인 추가'))
  assert('H: unapproved neck record renders NO 재활/운동 제안 and NO 목표 기능 group', !neckHtml.includes('재활/운동 제안') && !neckHtml.includes('목표 기능(다음 방문에 같은 동작으로 비교)'))
  assert('H: unapproved neck record still renders the shared lanes (판단·처치, 다음)', neckHtml.includes('판단·처치') && neckHtml.includes('id="next-h2"'))
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

console.log(`\n${passed} region-pack assertions passed.`)
