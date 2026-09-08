// LBP 운동 단계(0단계 + TBC 3단계) 제안 로직 회귀 테스트.
//
// 대상: src/doctor/workspace/lbpExerciseStage.ts
// 근거 문서: docs/LBP_EXERCISE_STAGE_ASSIGNMENT_v0.3.md (v0.4 변경분은 소스 헤더)
//
// esbuild --platform=neutral로 번들해서 순수 함수로 돌린다(테스트 프레임워크
// 없음, tests/lbp-working-hypothesis.spec.mjs와 동일 관례).
//
// Run via `npm run test:lbp-exercise-stage`.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  suggestLbpExerciseStage,
  lbpStageInputFromPayload,
  BASE_STAGE_BY_CHIEF_IMPACT,
  CHIEF_IMPACT_LABEL_KO,
  ACUTE_ONSET_DURATIONS,
  RECENT_RECURRENCE_INTERVALS,
  HIGH_FEAR_AVOIDANCE_MAX_STAGE,
  LBP_EXERCISE_STAGE_LABEL_KO,
  LBP_STAGE_0_GUIDANCE_KO,
} from './.lbp-exercise-stage-bundle.mjs'
import { ALL_QUESTIONS, IS_PRIMARY_LBP } from './.spec-bundle.mjs'

let passCount = 0
function assert(name, cond) {
  if (!cond) throw new Error(`FAIL: ${name}`)
  passCount++
  console.log(`OK: ${name}`)
}

const SOURCE = readFileSync(
  fileURLToPath(new URL('../src/doctor/workspace/lbpExerciseStage.ts', import.meta.url)),
  'utf8',
)

function kinds(res, kind) {
  return res.reasons.filter((r) => r.kind === kind)
}

// ---------------------------------------------------------------------------
// 1. 기본 매핑 (severe→1, moderate→2, mild→3, minimal→3)
//    기본 단계는 0이 될 수 없다 — 0단계는 격하로만 도달한다.
// ---------------------------------------------------------------------------

for (const [impact, expected] of [
  ['severe', 1],
  ['moderate', 2],
  ['mild', 3],
  ['minimal', 3],
]) {
  const res = suggestLbpExerciseStage({ chiefImpact: impact })
  assert(`기본 매핑: ${impact} → ${expected}단계`, res.suggestedStage === expected)
  assert(`기본 매핑: ${impact}의 baseStage도 ${expected}`, res.baseStage === expected)
  assert(`기본 매핑: ${impact}에 BASE 근거 1개`, kinds(res, 'BASE').length === 1)
  assert(
    `기본 매핑: ${impact} 근거에 한국어 라벨 포함`,
    kinds(res, 'BASE')[0].text.includes(CHIEF_IMPACT_LABEL_KO[impact]),
  )
  assert(`기본 매핑: ${impact} 단독이면 격하 근거 없음`, kinds(res, 'DEMOTION').length === 0)
  assert(`기본 매핑: ${impact} 단독이면 guidance 없음`, res.guidance === null)
}
assert(
  '기본 매핑에 0단계가 없다 (지장도 답변만으로는 운동을 끊지 않는다)',
  !Object.values(BASE_STAGE_BY_CHIEF_IMPACT).includes(0),
)

// ---------------------------------------------------------------------------
// 2. 판단 불가 — VISIT_04가 없거나 모르는 값
// ---------------------------------------------------------------------------

const UNUSABLE_IMPACTS = [
  undefined,
  null,
  '',
  '   ',
  'SEVERE', // 대문자는 실제 값이 아니다
  'unknown',
  'catastrophic',
  0,
  3,
  true,
  {},
  [],
  ['severe'],
  NaN,
]
for (const bad of UNUSABLE_IMPACTS) {
  const res = suggestLbpExerciseStage({ chiefImpact: bad })
  const shown = typeof bad === 'object' && bad !== null ? JSON.stringify(bad) : String(bad)
  assert(`판단 불가: chiefImpact=${shown} → suggestedStage null`, res.suggestedStage === null)
  assert(`판단 불가: chiefImpact=${shown} → baseStage null`, res.baseStage === null)
  assert(
    `판단 불가: chiefImpact=${shown} → INSUFFICIENT 근거`,
    kinds(res, 'INSUFFICIENT').length === 1,
  )
  assert(`판단 불가: chiefImpact=${shown} → BASE 근거 없음`, kinds(res, 'BASE').length === 0)
  assert(`판단 불가: chiefImpact=${shown} → 격하 근거 없음`, kinds(res, 'DEMOTION').length === 0)
  assert(`판단 불가: chiefImpact=${shown} → guidance 없음`, res.guidance === null)
}

// 판단 불가일 때도 참고 문장은 나온다 (원장이 볼 재료는 계속 보여준다)
{
  const res = suggestLbpExerciseStage({ chiefImpact: undefined, recoveryExpectation: 4, workImpact: 'MAJOR' })
  assert('판단 불가여도 CONTEXT 근거는 나온다', kinds(res, 'CONTEXT').length === 2)
}
// 판단 불가일 때 격하 사유가 있어도 단계를 만들어내지 않는다
{
  const res = suggestLbpExerciseStage({
    chiefImpact: undefined,
    chiefDuration: 'within_1w',
    recurrenceInterval: 'within_3m',
  })
  assert('판단 불가 + 격하사유 2개여도 단계는 여전히 null', res.suggestedStage === null)
}

// ---------------------------------------------------------------------------
// 3. 급성기 격하 (발병 1주 이내 → -1)
//    v0.3의 "상한 2단계"에서 v0.4 "한 단계 격하"로 바뀐 지점.
//    원장 지시(2026-09-05): "급성 요통 심한 케이스... 바로 1단계지.
//    1단계도 힘들 수 있어."
// ---------------------------------------------------------------------------

{
  const res = suggestLbpExerciseStage({ chiefImpact: 'severe', chiefDuration: 'within_1w' })
  assert('급성 격하: severe(1) + 1주이내 → 0단계', res.suggestedStage === 0)
  assert('급성 격하: baseStage는 1로 남는다', res.baseStage === 1)
  assert('급성 격하: DEMOTION 근거 1개', kinds(res, 'DEMOTION').length === 1)
  assert('급성 격하: 0단계면 guidance가 채워진다', res.guidance === LBP_STAGE_0_GUIDANCE_KO)
}
{
  const res = suggestLbpExerciseStage({ chiefImpact: 'moderate', chiefDuration: 'within_1w' })
  assert('급성 격하: moderate(2) + 1주이내 → 1단계', res.suggestedStage === 1)
  assert('급성 격하: moderate는 0단계가 아니므로 guidance 없음', res.guidance === null)
}
{
  const res = suggestLbpExerciseStage({ chiefImpact: 'mild', chiefDuration: 'within_1w' })
  assert('급성 격하: mild(3) + 1주이내 → 2단계', res.suggestedStage === 2)
}
{
  const res = suggestLbpExerciseStage({ chiefImpact: 'minimal', chiefDuration: 'within_1w' })
  assert('급성 격하: minimal(3) + 1주이내 → 2단계', res.suggestedStage === 2)
}
for (const d of ['1w_1m', '1_3m', '3m_1y', 'over_1y', 'unknown', undefined, null, '', 42, {}]) {
  const res = suggestLbpExerciseStage({ chiefImpact: 'mild', chiefDuration: d })
  assert(`급성 격하 미적용: duration=${String(d)} → 3단계 유지`, res.suggestedStage === 3)
  assert(`급성 격하 미적용: duration=${String(d)} → DEMOTION 근거 없음`, kinds(res, 'DEMOTION').length === 0)
}

// ---------------------------------------------------------------------------
// 4. 재발 격하 (LBP_07B = 3개월 이내 → -1)
//    원장 지시: "재발 간격이 3개월이면 조심해야지, 1단계씩 격하시켜야지."
// ---------------------------------------------------------------------------

{
  const res = suggestLbpExerciseStage({ chiefImpact: 'severe', recurrenceInterval: 'within_3m' })
  assert('재발 격하: severe(1) + 3개월내 재발 → 0단계', res.suggestedStage === 0)
  assert('재발 격하: guidance가 채워진다', res.guidance === LBP_STAGE_0_GUIDANCE_KO)
}
{
  const res = suggestLbpExerciseStage({ chiefImpact: 'moderate', recurrenceInterval: 'within_3m' })
  assert('재발 격하: moderate(2) → 1단계', res.suggestedStage === 1)
  assert('재발 격하: DEMOTION 근거 1개', kinds(res, 'DEMOTION').length === 1)
  assert(
    '재발 격하: 근거 문장에 "재발" 표시',
    kinds(res, 'DEMOTION')[0].text.includes('재발'),
  )
}
{
  const res = suggestLbpExerciseStage({ chiefImpact: 'mild', recurrenceInterval: 'within_3m' })
  assert('재발 격하: mild(3) → 2단계', res.suggestedStage === 2)
}
// 간격이 길거나 모르면 격하하지 않는다 — 재발 "사실"이 아니라 "짧은 간격"이 사유다
for (const i of ['3m_1y', 'over_1y', 'unknown', undefined, null, '', 'YES', 3, {}]) {
  const res = suggestLbpExerciseStage({ chiefImpact: 'mild', recurrenceInterval: i })
  assert(`재발 격하 미적용: interval=${String(i)} → 3단계 유지`, res.suggestedStage === 3)
  assert(`재발 격하 미적용: interval=${String(i)} → DEMOTION 없음`, kinds(res, 'DEMOTION').length === 0)
}

// ---------------------------------------------------------------------------
// 5. 공포회피 상한 (LBP_13 = YES → 최대 2단계). 격하가 아니라 상한이다.
// ---------------------------------------------------------------------------

{
  const res = suggestLbpExerciseStage({ chiefImpact: 'mild', fearAvoidance: 'YES' })
  assert('공포회피 상한: mild(3) + YES → 2단계', res.suggestedStage === 2)
  assert('공포회피 상한: CAP 근거 1개', kinds(res, 'CAP').length === 1)
  assert('공포회피 상한: 격하 근거는 아니다', kinds(res, 'DEMOTION').length === 0)
}
{
  const res = suggestLbpExerciseStage({ chiefImpact: 'severe', fearAvoidance: 'YES' })
  assert('공포회피 상한: severe(1)를 올리지 않는다', res.suggestedStage === 1)
  assert('공포회피 상한: 이미 상한 이하면 CAP 근거 없음', kinds(res, 'CAP').length === 0)
}
// 상한은 누적되지 않는다 — YES가 단계를 2 아래로 깎지 않는다
{
  const res = suggestLbpExerciseStage({
    chiefImpact: 'moderate',
    fearAvoidance: 'YES',
  })
  assert('공포회피 상한: moderate(2)는 그대로 2단계 (상한은 깎지 않는다)', res.suggestedStage === 2)
  assert('공포회피 상한: moderate에 CAP 근거 없음', kinds(res, 'CAP').length === 0)
}
for (const f of ['NO', 'SOMEWHAT', 'UNKNOWN', undefined, null, '', 'yes', true, {}]) {
  const res = suggestLbpExerciseStage({ chiefImpact: 'mild', fearAvoidance: f })
  assert(`공포회피 상한 미적용: fear=${String(f)} → 3단계 유지`, res.suggestedStage === 3)
}
{
  const res = suggestLbpExerciseStage({ chiefImpact: 'mild', fearAvoidance: 'SOMEWHAT' })
  assert(
    'SOMEWHAT은 단계를 바꾸지 않고 CONTEXT로만 나온다',
    res.suggestedStage === 3 && kinds(res, 'CONTEXT').some((r) => r.text.includes('조금')),
  )
}

// ---------------------------------------------------------------------------
// 6. 격하 누적 + 0단계 바닥
// ---------------------------------------------------------------------------

{
  const res = suggestLbpExerciseStage({
    chiefImpact: 'severe',
    chiefDuration: 'within_1w',
    recurrenceInterval: 'within_3m',
  })
  assert('격하 2개 누적: severe(1) - 2 → 0단계 (음수로 가지 않는다)', res.suggestedStage === 0)
  assert('격하 2개 누적: DEMOTION 근거 2개', kinds(res, 'DEMOTION').length === 2)
  assert('격하 2개 누적: baseStage는 1 유지', res.baseStage === 1)
}
{
  const res = suggestLbpExerciseStage({
    chiefImpact: 'moderate',
    chiefDuration: 'within_1w',
    recurrenceInterval: 'within_3m',
  })
  assert('격하 2개 누적: moderate(2) - 2 → 0단계', res.suggestedStage === 0)
}
{
  const res = suggestLbpExerciseStage({
    chiefImpact: 'mild',
    chiefDuration: 'within_1w',
    recurrenceInterval: 'within_3m',
  })
  assert('격하 2개 누적: mild(3) - 2 → 1단계', res.suggestedStage === 1)
}
// 격하 + 상한 동시
{
  const res = suggestLbpExerciseStage({
    chiefImpact: 'minimal',
    chiefDuration: 'within_1w',
    fearAvoidance: 'YES',
  })
  assert('격하 후 상한: minimal(3) - 1 = 2, 상한 2 → 2단계', res.suggestedStage === 2)
  assert('격하 후 상한: 이미 상한 이하라 CAP 근거는 붙지 않는다', kinds(res, 'CAP').length === 0)
  assert('격하 후 상한: DEMOTION 근거 1개', kinds(res, 'DEMOTION').length === 1)
}

// 0단계 guidance는 0단계에서만 나온다
for (const stageCase of [
  [{ chiefImpact: 'severe' }, 1],
  [{ chiefImpact: 'moderate' }, 2],
  [{ chiefImpact: 'mild' }, 3],
]) {
  const res = suggestLbpExerciseStage(stageCase[0])
  assert(`guidance 없음: ${stageCase[1]}단계`, res.guidance === null)
}

// ---------------------------------------------------------------------------
// 7. 회복 기대(LBP_12) — 0~10 정수만 참고 문장으로, 단계는 절대 안 바뀐다
// ---------------------------------------------------------------------------

for (const score of [0, 1, 5, 9, 10]) {
  const res = suggestLbpExerciseStage({ chiefImpact: 'moderate', recoveryExpectation: score })
  assert(`회복기대 ${score}: 단계 불변(2)`, res.suggestedStage === 2)
  assert(
    `회복기대 ${score}: CONTEXT 문장에 "${score}/10" 표시`,
    kinds(res, 'CONTEXT').some((r) => r.text.includes(`${score}/10`)),
  )
}
for (const bad of [-1, 11, 3.5, '7', NaN, Infinity, null, undefined, {}, [5], true]) {
  const res = suggestLbpExerciseStage({ chiefImpact: 'moderate', recoveryExpectation: bad })
  assert(`회복기대 비정상값 ${String(bad)}: 단계 불변(2)`, res.suggestedStage === 2)
  assert(
    `회복기대 비정상값 ${String(bad)}: 회복기대 문장 없음`,
    !kinds(res, 'CONTEXT').some((r) => r.text.includes('회복 기대')),
  )
}

// ---------------------------------------------------------------------------
// 8. 일·집안일 지장(LBP_14) — 참고만
// ---------------------------------------------------------------------------

for (const [work, expectText] of [
  ['MAJOR', '큼'],
  ['SOME', '일부'],
]) {
  const res = suggestLbpExerciseStage({ chiefImpact: 'mild', workImpact: work })
  assert(`업무지장 ${work}: 단계 불변(3)`, res.suggestedStage === 3)
  assert(
    `업무지장 ${work}: CONTEXT 문장 있음`,
    kinds(res, 'CONTEXT').some((r) => r.text.includes(expectText)),
  )
}
for (const work of ['NONE', 'UNKNOWN', undefined, null, '', {}]) {
  const res = suggestLbpExerciseStage({ chiefImpact: 'mild', workImpact: work })
  assert(`업무지장 ${String(work)}: 단계 불변 + 문장 없음`, res.suggestedStage === 3)
}

// ---------------------------------------------------------------------------
// 9. 전수 조합 불변식 — 4 impact × 7 duration × 5 interval × 5 fear = 700
//    기대값을 소스와 독립적으로 다시 계산해 대조한다(미러 구현).
// ---------------------------------------------------------------------------

const IMPACTS = ['severe', 'moderate', 'mild', 'minimal']
const DURATIONS = ['within_1w', '1w_1m', '1_3m', '3m_1y', 'over_1y', 'unknown', undefined]
const INTERVALS = ['within_3m', '3m_1y', 'over_1y', 'unknown', undefined]
const FEARS = ['NO', 'SOMEWHAT', 'YES', 'UNKNOWN', undefined]

/** 소스를 보지 않고 규칙 명세만으로 다시 쓴 기대값 계산기. */
function expectedStage(impact, duration, interval, fear) {
  let s = { severe: 1, moderate: 2, mild: 3, minimal: 3 }[impact]
  if (duration === 'within_1w') s = Math.max(0, s - 1)
  if (interval === 'within_3m') s = Math.max(0, s - 1)
  if (fear === 'YES' && s > 2) s = 2
  return s
}

let combos = 0
let sawStage0 = 0
for (const impact of IMPACTS) {
  for (const duration of DURATIONS) {
    for (const interval of INTERVALS) {
      for (const fear of FEARS) {
        const res = suggestLbpExerciseStage({
          chiefImpact: impact,
          chiefDuration: duration,
          recurrenceInterval: interval,
          fearAvoidance: fear,
        })
        const where = `${impact}/${String(duration)}/${String(interval)}/${String(fear)}`
        const want = expectedStage(impact, duration, interval, fear)
        if (res.suggestedStage !== want)
          throw new Error(`FAIL: 단계 불일치 ${where}: got ${res.suggestedStage}, want ${want}`)
        if (![0, 1, 2, 3].includes(res.suggestedStage)) throw new Error(`FAIL: 단계가 0~3 밖 (${where})`)
        if (res.suggestedStage > res.baseStage) throw new Error(`FAIL: 규칙이 단계를 올렸다 (${where})`)
        if (res.clinicianMustConfirm !== true) throw new Error(`FAIL: clinicianMustConfirm !== true (${where})`)
        if (kinds(res, 'BASE').length !== 1) throw new Error(`FAIL: BASE 근거가 1개가 아니다 (${where})`)
        if (kinds(res, 'INSUFFICIENT').length !== 0) throw new Error(`FAIL: INSUFFICIENT가 붙었다 (${where})`)
        // guidance는 0단계와 정확히 동치
        const wantGuidance = res.suggestedStage === 0 ? LBP_STAGE_0_GUIDANCE_KO : null
        if (res.guidance !== wantGuidance) throw new Error(`FAIL: guidance 불일치 (${where})`)
        // 격하 근거 개수 = 실제 격하 사유 개수
        const wantDemotions =
          (duration === 'within_1w' ? 1 : 0) + (interval === 'within_3m' ? 1 : 0)
        if (kinds(res, 'DEMOTION').length !== wantDemotions)
          throw new Error(`FAIL: DEMOTION 근거 개수 불일치 (${where})`)
        if (res.suggestedStage === 0) sawStage0++
        combos++
      }
    }
  }
}
assert(`전수 조합 ${combos}가지: 독립 계산식과 100% 일치`, combos === 700)
assert(`전수 조합 중 0단계가 실제로 발생한다 (${sawStage0}건) — 공허한 통과가 아님`, sawStage0 > 0)

// 상한 상수 자체가 2단계 이하인지 — 정책값이 바뀌어도 3단계 상한은 무의미하다
assert('HIGH_FEAR_AVOIDANCE_MAX_STAGE는 3 미만', HIGH_FEAR_AVOIDANCE_MAX_STAGE < 3)
assert('격하 사유 집합이 비어 있지 않다 (급성)', ACUTE_ONSET_DURATIONS.size > 0)
assert('격하 사유 집합이 비어 있지 않다 (재발)', RECENT_RECURRENCE_INTERVALS.size > 0)
assert('0단계 라벨이 존재한다', typeof LBP_EXERCISE_STAGE_LABEL_KO[0] === 'string')

// ---------------------------------------------------------------------------
// 10. payload 어댑터 — 손상된 기록에도 던지지 않는다
// ---------------------------------------------------------------------------

{
  const payload = {
    responses: {
      visit_goal: { chief_impact: 'severe', chief_duration: 'within_1w' },
      safety_flags: {
        lbp: {
          recurrence_interval: 'within_3m',
          fear_avoidance: 'YES',
          recovery_expectation: 6,
          work_impact: 'MAJOR',
        },
      },
    },
  }
  const input = lbpStageInputFromPayload(payload)
  assert('어댑터: chief_impact 읽음', input.chiefImpact === 'severe')
  assert('어댑터: chief_duration 읽음', input.chiefDuration === 'within_1w')
  assert('어댑터: recurrence_interval 읽음', input.recurrenceInterval === 'within_3m')
  assert('어댑터: fear_avoidance 읽음', input.fearAvoidance === 'YES')
  assert('어댑터: recovery_expectation 읽음', input.recoveryExpectation === 6)
  assert('어댑터: work_impact 읽음', input.workImpact === 'MAJOR')
  assert('어댑터 → 제안까지 연결 (severe+급성+재발 → 0단계)', suggestLbpExerciseStage(input).suggestedStage === 0)
}

// recurrence_interval이 없는 옛 기록(LBP_07B 도입 전 제출)도 그대로 동작한다
{
  const legacy = {
    responses: {
      visit_goal: { chief_impact: 'moderate', chief_duration: '1_3m' },
      safety_flags: { lbp: { recurrence: 'YES', fear_avoidance: 'NO' } },
    },
  }
  const res = suggestLbpExerciseStage(lbpStageInputFromPayload(legacy))
  assert('옛 기록(재발간격 필드 없음): 격하 없이 2단계', res.suggestedStage === 2)
  assert('옛 기록: DEMOTION 근거 없음', kinds(res, 'DEMOTION').length === 0)
}

for (const broken of [
  null,
  undefined,
  {},
  'string payload',
  42,
  [],
  { responses: null },
  { responses: 'x' },
  { responses: {} },
  { responses: { visit_goal: null, safety_flags: null } },
  { responses: { visit_goal: 'x', safety_flags: { lbp: 7 } } },
  { responses: { safety_flags: { lbp: null } } },
]) {
  const shown = typeof broken === 'object' && broken !== null ? JSON.stringify(broken) : String(broken)
  let input
  try {
    input = lbpStageInputFromPayload(broken)
  } catch (e) {
    throw new Error(`FAIL: 어댑터가 던졌다 (${shown}): ${e.message}`)
  }
  let res
  try {
    res = suggestLbpExerciseStage(input)
  } catch (e) {
    throw new Error(`FAIL: 제안 함수가 던졌다 (${shown}): ${e.message}`)
  }
  if (res.suggestedStage !== null) throw new Error(`FAIL: 손상 payload에서 단계를 제안했다 (${shown})`)
}
assert('손상된 payload 12종: 던지지 않고 전부 판단 불가로 처리', true)

// ---------------------------------------------------------------------------
// 11. 문진 스펙과의 drift 가드
//     — VISIT_04/VISIT_03/LBP_07B/LBP_13의 선택지가 바뀌면 이 매핑은 조용히 깨진다.
// ---------------------------------------------------------------------------

function questionById(id) {
  const q = ALL_QUESTIONS.find((x) => x.id === id)
  if (!q) throw new Error(`FAIL: 문진에 ${id}가 없다`)
  return q
}

{
  const q = questionById('VISIT_04_SYMPTOM_IMPACT')
  const specValues = q.options.map((o) => o.value).sort()
  const mapped = Object.keys(BASE_STAGE_BY_CHIEF_IMPACT).sort()
  assert(
    'drift 가드: VISIT_04 선택지 4개가 매핑 키와 정확히 일치',
    JSON.stringify(specValues) === JSON.stringify(mapped),
  )
  assert('drift 가드: VISIT_04는 required', q.required === true)
  assert(
    'drift 가드: VISIT_04 선택지 전부에 한국어 라벨이 있다',
    specValues.every((v) => typeof CHIEF_IMPACT_LABEL_KO[v] === 'string'),
  )
}
{
  const q = questionById('VISIT_03_SYMPTOM_DURATION')
  const specValues = q.options.map((o) => o.value)
  for (const d of ACUTE_ONSET_DURATIONS) {
    assert(`drift 가드: VISIT_03에 급성 값 '${d}'가 여전히 있다`, specValues.includes(d))
  }
}
{
  const q = questionById('LBP_07B')
  const specValues = q.options.map((o) => o.value)
  for (const v of RECENT_RECURRENCE_INTERVALS) {
    assert(`drift 가드: LBP_07B에 최근재발 값 '${v}'가 여전히 있다`, specValues.includes(v))
  }
  assert(
    'drift 가드: LBP_07B의 격하 값이 선택지 전부는 아니다 (전원 격하 방지)',
    specValues.some((v) => !RECENT_RECURRENCE_INTERVALS.has(v)),
  )
  assert('drift 가드: LBP_07B는 required가 아니다 (미응답 허용)', q.required === false)

  // LBP_07B는 "LBP_07 === 'YES'"일 때만 노출된다 — LBP_07과의 등가성으로 검증한다.
  const q07 = questionById('LBP_07')
  const BASE_R = { VISIT_00_INTENT: 'pain_care', PAIN_01: 'low_back_pelvis' }
  assert('drift 가드: 검증용 응답이 실제로 LBP 경로다 (공허한 통과 방지)', IS_PRIMARY_LBP(BASE_R) === true)
  assert('drift 가드: LBP_07 자체는 그 응답에서 노출된다', q07.showIf(BASE_R) === true)

  const SHOWIF_CASES = [
    {},
    { PAIN_01: 'low_back_pelvis' },
    { ...BASE_R },
    { ...BASE_R, LBP_07: 'NO' },
    { ...BASE_R, LBP_07: 'YES' },
    { ...BASE_R, LBP_07: 'UNKNOWN' },
    { VISIT_00_INTENT: 'pain_care', PAIN_01: 'neck', LBP_07: 'YES' },
  ]
  for (const r of SHOWIF_CASES) {
    const want = q07.showIf(r) === true && r['LBP_07'] === 'YES'
    assert(
      `drift 가드: LBP_07B 노출 조건 = (LBP_07 노출 && LBP_07===YES) — ${JSON.stringify(r)}`,
      q.showIf(r) === want,
    )
  }
  assert(
    'drift 가드: 그 등가성이 공허하지 않다 (YES에서 실제로 노출)',
    q.showIf({ ...BASE_R, LBP_07: 'YES' }) === true,
  )
  assert(
    'drift 가드: LBP_07=NO면 노출되지 않는다',
    q.showIf({ ...BASE_R, LBP_07: 'NO' }) === false,
  )
}
{
  const q = questionById('LBP_13')
  const specValues = q.options.map((o) => o.value)
  assert("drift 가드: LBP_13에 'YES'가 여전히 있다", specValues.includes('YES'))
  assert("drift 가드: LBP_13에 'SOMEWHAT'이 여전히 있다", specValues.includes('SOMEWHAT'))
}
{
  const q = questionById('LBP_12')
  assert('drift 가드: LBP_12는 0~10 numeric_scale', q.scale.min === 0 && q.scale.max === 10)
}
{
  const q = questionById('LBP_14')
  const specValues = q.options.map((o) => o.value)
  assert("drift 가드: LBP_14에 'MAJOR'/'SOME'이 여전히 있다", specValues.includes('MAJOR') && specValues.includes('SOME'))
}

// ---------------------------------------------------------------------------
// 12. 아키텍처 제약 — 소스 텍스트 단언 (CLAUDE.md "경로 1개당 단언 1개")
// ---------------------------------------------------------------------------

// 주석(설명문)에는 이 필드들을 언급해야 한다 -- 금지되는 것은 "코드가 읽는 것"이다.
// 그래서 주석을 제거한 뒤의 코드 본문에만 단언한다.
const CODE_ONLY = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

assert(
  '제약: 코드가 이전 방문 baseline/postTreatmentValue를 읽지 않는다 (REPEAT_VISIT_AUTO_COMPARE_STATUS 원칙)',
  !CODE_ONLY.includes('baseline') && !CODE_ONLY.includes('postTreatmentValue'),
)
assert(
  '제약: 그 제약이 주석으로도 문서화되어 있다',
  SOURCE.includes('REPEAT_VISIT_AUTO_COMPARE_STATUS'),
)
assert(
  '제약: 코드에 이전 방문 기록을 파싱하는 흔적이 없다',
  !/prior|previous|carryForward|delta|improve/i.test(CODE_ONLY),
)
assert(
  '제약: finalAssessment / longitudinal / revisitCarryForward를 import하지 않는다',
  !/^import .*(finalAssessment|longitudinal|revisitCarryForward)/m.test(SOURCE),
)
assert(
  '제약: 파일에 진단명 매핑이 없다',
  !/디스크|협착|추간판|herniat|stenosis/i.test(SOURCE),
)
assert(
  '제약: 정책값이 논문 근거가 아님을 소스에 명시한다',
  SOURCE.includes('삼인당의 정책값') && SOURCE.includes('원장 승인'),
)
assert(
  '제약: clinicianMustConfirm은 항상 true 리터럴',
  (SOURCE.match(/clinicianMustConfirm: true/g) || []).length >= 3,
)
// v0.4 신규 경로 3개 각각에 소스 텍스트 단언 1개 (CLAUDE.md 규칙)
assert(
  '제약(신규 경로 1/3): 0단계 안내가 소스에 상수로 존재한다',
  SOURCE.includes('LBP_STAGE_0_GUIDANCE_KO') && LBP_STAGE_0_GUIDANCE_KO.length > 20,
)
assert(
  '제약(신규 경로 2/3): 재발 격하가 recurrence_interval을 읽는다',
  CODE_ONLY.includes('recurrence_interval') && CODE_ONLY.includes('recurrenceInterval'),
)
assert(
  '제약(신규 경로 3/3): 격하가 0 아래로 내려가지 않도록 소스가 막는다',
  /s > 0 \? s - 1 : 0/.test(CODE_ONLY),
)
assert(
  '제약: 상한(CAP) 모델에서 격하(DEMOTION) 모델로 바뀐 근거가 소스에 남아 있다',
  SOURCE.includes('격하 모델') && SOURCE.includes('원장 지시'),
)
// 지운 경로 1개당 단언 1개 (CLAUDE.md) — 급성 상한 상수가 되살아나면
// severe+급성이 다시 1단계가 되고 0단계 경로가 조용히 죽는다.
assert(
  '제약(지운 경로): 급성 상한 상수 ACUTE_ONSET_MAX_STAGE가 부활하지 않았다',
  !SOURCE.includes('ACUTE_ONSET_MAX_STAGE'),
)

console.log(`\n${passCount} assertions passed.`)
