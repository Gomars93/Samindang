// 준비조건 두 층(lbpCapabilityLayer.ts) + 운동 단계표(lbpExerciseStageTable.ts) 회귀 테스트.
//
// 원장 결정 2026-09-05: "이걸 매번 체크해야 돼 내가?" → 15개 준비조건을
// A층(안전 3개, 절대 추정 안 함) / C층(12개, 확정 단계에서 추정)으로 나눈다.
// 이 테스트는 (1) 단계표가 v0.2 문서와 같은지, (2) A층이 절대 새지 않는지,
// (3) 추정 문턱이 규칙표×단계표에서 계산한 값과 같은지를 고정한다.
//
// Run via `npm run test:lbp-capability-layer`.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  LBP_SAFETY_CAPABILITIES,
  LBP_CAPABILITY_MIN_STAGE,
  inferredCapabilitiesForStage,
  isLbpSafetyCapability,
} from './.lbp-capability-layer-bundle.mjs'
import {
  LBP_EXERCISE_STAGE_BY_ID,
  isLbpExerciseAllowedAtStage,
  stageAssignmentAsNumber,
} from './.lbp-exercise-stage-table-bundle.mjs'
import { LBP_EXERCISE_ELIGIBILITY_RULES } from './.lbp-exercise-eligibility-bundle.mjs'
import { LBP_CORE_EXERCISE_METADATA } from './.lbp-exercise-core-metadata-bundle.mjs'

let passCount = 0
function assert(name, cond) {
  if (!cond) throw new Error(`FAIL: ${name}`)
  passCount++
  console.log(`OK: ${name}`)
}
const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort())

const LAYER_SOURCE = readFileSync(fileURLToPath(new URL('../src/doctor/workspace/lbpCapabilityLayer.ts', import.meta.url)), 'utf8')
const TABLE_SOURCE = readFileSync(fileURLToPath(new URL('../src/doctor/workspace/lbpExerciseStageTable.ts', import.meta.url)), 'utf8')
const CONTEXT_SOURCE = readFileSync(fileURLToPath(new URL('../src/doctor/workspace/lbpEligibilityContext.ts', import.meta.url)), 'utf8')
const ELIG_SOURCE = readFileSync(fileURLToPath(new URL('../src/doctor/workspace/lbpExerciseEligibility.ts', import.meta.url)), 'utf8')

// ---------------------------------------------------------------------------
// 1. 단계표 = v0.2 문서 (id 집합, 분포 9/8/2/1)
// ---------------------------------------------------------------------------
{
  const tableIds = Object.keys(LBP_EXERCISE_STAGE_BY_ID)
  const metaIds = LBP_CORE_EXERCISE_METADATA.map((m) => m.exerciseId)
  assert('단계표 id 집합 = Core-20 metadata id 집합 (빠짐·추가 없음)', same(tableIds, metaIds))
  assert('단계표는 정확히 20행', tableIds.length === 20)
  const count = { 1: 0, 2: 0, 3: 0, ALL: 0 }
  for (const v of Object.values(LBP_EXERCISE_STAGE_BY_ID)) count[v]++
  assert('v0.2 분포: 1단계 9', count[1] === 9)
  assert('v0.2 분포: 2단계 8', count[2] === 8)
  assert('v0.2 분포: 3단계 2', count[3] === 2)
  assert('v0.2 분포: 전 단계 공통 1', count.ALL === 1)
  assert("전 단계 공통은 LBP_FUNC_01(앉았다 일어서기)뿐", LBP_EXERCISE_STAGE_BY_ID.LBP_FUNC_01 === 'ALL')
  // 문서 표의 대표 행 몇 개를 그대로 고정 (v0.2 §"레벨 표")
  for (const [id, want] of [
    ['LBP_ACT_01', 1], ['LBP_LUMBAR_02', 1], ['LBP_DIR_04', 1], ['LBP_NEURAL_01', 1], ['LBP_REG_01', 1],
    ['LBP_HIP_MOB_01', 2], ['LBP_TRUNK_03', 2], ['LBP_EXPOSURE_01', 2], ['LBP_EXPOSURE_03', 2],
    ['LBP_FUNC_05', 3], ['LBP_LOAD_02', 3],
  ]) {
    assert(`단계표: ${id} = ${want}`, LBP_EXERCISE_STAGE_BY_ID[id] === want)
  }
  assert("'ALL' → 숫자 1", stageAssignmentAsNumber('ALL') === 1)
  assert('숫자는 그대로', stageAssignmentAsNumber(3) === 3)
  assert('단계표 소스가 문서 v0.2를 출처로 명시한다', TABLE_SOURCE.includes('LBP_EXERCISE_LEVEL_DRAFT_v0.2.md'))
}

// ---------------------------------------------------------------------------
// 2. 단계 필터
// ---------------------------------------------------------------------------
{
  for (const id of Object.keys(LBP_EXERCISE_STAGE_BY_ID)) {
    assert(`필터: 미확정(null)이면 ${id} 허용 (기존 동작 유지)`, isLbpExerciseAllowedAtStage(id, null) === true)
    assert(`필터: 0단계면 ${id} 불허 (능동 운동 미처방)`, isLbpExerciseAllowedAtStage(id, 0) === false)
    assert(`필터: 3단계면 ${id} 허용`, isLbpExerciseAllowedAtStage(id, 3) === true)
  }
  assert('필터: 1단계에서 3단계 운동(LOAD_02) 불허', isLbpExerciseAllowedAtStage('LBP_LOAD_02', 1) === false)
  assert('필터: 2단계에서 3단계 운동(FUNC_05) 불허', isLbpExerciseAllowedAtStage('LBP_FUNC_05', 2) === false)
  assert('필터: 1단계에서 2단계 운동(TRUNK_03) 불허', isLbpExerciseAllowedAtStage('LBP_TRUNK_03', 1) === false)
  assert('필터: 2단계에서 2단계 운동(TRUNK_03) 허용', isLbpExerciseAllowedAtStage('LBP_TRUNK_03', 2) === true)
  assert('필터: 1단계에서 1단계 운동(LUMBAR_02) 허용', isLbpExerciseAllowedAtStage('LBP_LUMBAR_02', 1) === true)
  assert('필터: 전 단계 공통(FUNC_01)은 1단계에서도 허용', isLbpExerciseAllowedAtStage('LBP_FUNC_01', 1) === true)
  assert('필터: 표에 없는 id는 어느 단계에서도 불허', isLbpExerciseAllowedAtStage('LBP_NOT_A_REAL_ID', 3) === false)
  // 단조성: 허용은 단계가 오를수록 넓어지기만 한다
  for (const id of Object.keys(LBP_EXERCISE_STAGE_BY_ID)) {
    for (let s = 1; s < 3; s++) {
      if (isLbpExerciseAllowedAtStage(id, s) && !isLbpExerciseAllowedAtStage(id, s + 1))
        throw new Error(`FAIL: 단조성 위반 ${id} ${s}→${s + 1}`)
    }
  }
  assert('필터 단조성: 낮은 단계에서 허용된 운동은 높은 단계에서도 허용', true)
}

// ---------------------------------------------------------------------------
// 3. A층 — 안전 3개는 어떤 단계에서도 추정되지 않는다
// ---------------------------------------------------------------------------
{
  assert('A층은 정확히 3개', LBP_SAFETY_CAPABILITIES.size === 3)
  for (const cap of ['SAFE_WALKING', 'BALANCE_WITH_SUPPORT', 'CAN_SELF_PACE']) {
    assert(`A층: ${cap} 포함`, isLbpSafetyCapability(cap))
    assert(`A층: ${cap}는 최소단계 맵에 없다`, !LBP_CAPABILITY_MIN_STAGE.has(cap))
    for (const s of [0, 1, 2, 3, null]) {
      assert(`A층: ${cap}는 단계 ${String(s)}에서 추정되지 않는다`, !inferredCapabilitiesForStage(s).includes(cap))
    }
  }
  assert('A층: QUADRUPED_TOLERATED는 안전 조건이 아니다', !isLbpSafetyCapability('QUADRUPED_TOLERATED'))
}

// ---------------------------------------------------------------------------
// 4. C층 추정 문턱 — 규칙표 × 단계표에서 계산된 값을 명시적 표로 고정
//    (규칙표나 단계표가 바뀌면 여기가 깨져서 눈에 띈다)
// ---------------------------------------------------------------------------
{
  const WANT = {
    QUADRUPED_TOLERATED: 1, // LUMBAR_02(1)
    SUPINE_TOLERATED: 1, // LUMBAR_03(1)
    PRONE_TOLERATED: 1, // DIR_02(1)
    EXTENSION_EXPOSURE_TOLERATED: 1, // DIR_03(1)
    FLEXION_EXPOSURE_TOLERATED: 1, // DIR_04(1)
    SUPPORTED_STANDING_TOLERATED: 1, // FUNC_01(ALL→1)
    NATURAL_BREATHING_TOLERATED: 1, // REG_01(1)
    NEURAL_SLIDER_TOLERATED: 1, // NEURAL_01(1)
    LOW_LOAD_TRUNK_CONTROL: 2, // DEEP_TRUNK_03(2), TRUNK_03(2)
    SITTING_TOLERATED: 2, // EXPOSURE_03(2)
    HIP_HINGE_CONTROL: 3, // FUNC_05(3), LOAD_02(3)
    LOAD_READY: 3, // LOAD_02(3)
  }
  assert('C층은 정확히 12개 (15 − A층 3)', LBP_CAPABILITY_MIN_STAGE.size === 12)
  for (const [cap, want] of Object.entries(WANT)) {
    assert(`문턱: ${cap} = ${want}단계`, LBP_CAPABILITY_MIN_STAGE.get(cap) === want)
  }
  assert('C층 12개 = 명시 표 12개 (빠짐 없음)', same([...LBP_CAPABILITY_MIN_STAGE.keys()], Object.keys(WANT)))

  // 독립 재계산 — 규칙표와 단계표를 직접 읽어 같은 답이 나오는지
  const recomputed = new Map()
  for (const rule of LBP_EXERCISE_ELIGIBILITY_RULES) {
    const st = stageAssignmentAsNumber(LBP_EXERCISE_STAGE_BY_ID[rule.exerciseId])
    for (const cap of [...rule.hardRequirements, ...rule.regressibleRequirements]) {
      if (LBP_SAFETY_CAPABILITIES.has(cap)) continue
      const prev = recomputed.get(cap)
      if (prev === undefined || st < prev) recomputed.set(cap, st)
    }
  }
  assert(
    '문턱: 테스트 안에서 독립 재계산한 값과 모듈 값이 100% 일치',
    [...recomputed].every(([c, v]) => LBP_CAPABILITY_MIN_STAGE.get(c) === v) && recomputed.size === LBP_CAPABILITY_MIN_STAGE.size,
  )
}

// ---------------------------------------------------------------------------
// 5. 단계별 추정 목록
// ---------------------------------------------------------------------------
{
  assert('추정: 미확정(null) → 빈 배열', inferredCapabilitiesForStage(null).length === 0)
  assert('추정: 0단계 → 빈 배열 (운동 자체가 없다)', inferredCapabilitiesForStage(0).length === 0)
  const s1 = inferredCapabilitiesForStage(1), s2 = inferredCapabilitiesForStage(2), s3 = inferredCapabilitiesForStage(3)
  assert('추정: 1단계 → 8개', s1.length === 8)
  assert('추정: 2단계 → 10개', s2.length === 10)
  assert('추정: 3단계 → 12개', s3.length === 12)
  assert('추정 단조성: 1단계 ⊂ 2단계', s1.every((c) => s2.includes(c)))
  assert('추정 단조성: 2단계 ⊂ 3단계', s2.every((c) => s3.includes(c)))
  assert('추정: 1단계에 LOAD_READY 없음', !s1.includes('LOAD_READY'))
  assert('추정: 1단계에 HIP_HINGE_CONTROL 없음', !s1.includes('HIP_HINGE_CONTROL'))
  assert('추정: 1단계에 SITTING_TOLERATED 없음 (EXPOSURE_03이 2단계)', !s1.includes('SITTING_TOLERATED'))
  assert('추정: 2단계에 SITTING_TOLERATED 있음', s2.includes('SITTING_TOLERATED'))
  assert('추정: 3단계에 LOAD_READY 있음', s3.includes('LOAD_READY'))
  for (const s of [1, 2, 3]) {
    assert(`추정: ${s}단계 목록에 A층 없음`, !inferredCapabilitiesForStage(s).some((c) => LBP_SAFETY_CAPABILITIES.has(c)))
    assert(`추정: ${s}단계 목록에 중복 없음`, new Set(inferredCapabilitiesForStage(s)).size === inferredCapabilitiesForStage(s).length)
  }
}

// ---------------------------------------------------------------------------
// 6. 아키텍처 제약 — 소스 텍스트 단언 (CLAUDE.md "경로 1개당 단언 1개")
// ---------------------------------------------------------------------------
{
  assert('제약: 평가기(lbpExerciseEligibility.ts)는 이 배치에서 층/단계를 모른다', !/lbpCapabilityLayer|lbpExerciseStageTable|lbpConfirmedStage/.test(ELIG_SOURCE))
  assert('제약: 어댑터가 확인함 > 지금은 안 됨 > 추정 > UNKNOWN 순서로 읽는다',
    /confirmed\.has\(cap\) \? 'YES' : denied\.has\(cap\) \? 'NO' : inferred\.has\(cap\) \? 'YES' : 'UNKNOWN'/.test(CONTEXT_SOURCE))
  assert('제약: 어댑터가 추정 목록을 lbpCapabilityLayer에서만 가져온다', CONTEXT_SOURCE.includes("from './lbpCapabilityLayer'"))
  assert('제약: 층 모듈이 문턱을 손으로 적지 않고 계산한다', LAYER_SOURCE.includes('computeMinStageByCapability') && !/LOAD_READY:\s*3/.test(LAYER_SOURCE))
  assert('제약: 층 모듈이 B층(문진 유도)이 비어 있음을 명시한다', LAYER_SOURCE.includes('비어 있다'))
  assert('제약: 층 모듈이 트레이드오프(fail-closed 일부 포기)를 명시한다', LAYER_SOURCE.includes('fail-closed'))
}

console.log(`\n${passCount} assertions passed.`)
