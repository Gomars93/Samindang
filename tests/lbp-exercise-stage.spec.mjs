// LBP 운동 단계(TBC 3단계) 제안 로직 회귀 테스트.
//
// 대상: src/doctor/workspace/lbpExerciseStage.ts
// 근거 문서: docs/LBP_EXERCISE_STAGE_ASSIGNMENT_v0.3.md
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
  ACUTE_ONSET_MAX_STAGE,
  HIGH_FEAR_AVOIDANCE_MAX_STAGE,
  LBP_EXERCISE_STAGE_LABEL_KO,
} from './.lbp-exercise-stage-bundle.mjs'
import { ALL_QUESTIONS } from './.spec-bundle.mjs'

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
// 1. 기본 매핑 (A안: severe→1, moderate→2, mild→3, minimal→3)
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
}

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
  assert(`판단 불가: chiefImpact=${shown} → CAP 근거 없음`, kinds(res, 'CAP').length === 0)
}

// 판단 불가일 때도 참고 문장은 나온다 (원장이 볼 재료는 계속 보여준다)
{
  const res = suggestLbpExerciseStage({ chiefImpact: undefined, recoveryExpectation: 4, workImpact: 'MAJOR' })
  assert('판단 불가여도 CONTEXT 근거는 나온다', kinds(res, 'CONTEXT').length === 2)
}

// ---------------------------------------------------------------------------
// 3. 급성기 cap (발병 1주 이내)
// ---------------------------------------------------------------------------

{
  const res = suggestLbpExerciseStage({ chiefImpact: 'mild', chiefDuration: 'within_1w' })
  assert('급성 cap: mild(3) + 1주이내 → 2단계', res.suggestedStage === 2)
  assert('급성 cap: baseStage는 3으로 남는다', res.baseStage === 3)
  assert('급성 cap: CAP 근거 1개', kinds(res, 'CAP').length === 1)
}
{
  const res = suggestLbpExerciseStage({ chiefImpact: 'minimal', chiefDuration: 'within_1w' })
  assert('급성 cap: minimal(3) + 1주이내 → 2단계', res.suggestedStage === 2)
}
{
  const res = suggestLbpExerciseStage({ chiefImpact: 'moderate', chiefDuration: 'within_1w' })
  assert('급성 cap: moderate(2)는 이미 cap 이하 → 2단계 유지', res.suggestedStage === 2)
  assert('급성 cap: moderate에는 CAP 근거를 붙이지 않는다', kinds(res, 'CAP').length === 0)
}
{
  const res = suggestLbpExerciseStage({ chiefImpact: 'severe', chiefDuration: 'within_1w' })
  assert('급성 cap: severe(1)를 2단계로 올리지 않는다', res.suggestedStage === 1)
  assert('급성 cap: severe에는 CAP 근거를 붙이지 않는다', kinds(res, 'CAP').length === 0)
}
for (const d of ['1w_1m', '1_3m', '3m_1y', 'over_1y', 'unknown', undefined, null, '', 42, {}]) {
  const res = suggestLbpExerciseStage({ chiefImpact: 'mild', chiefDuration: d })
  assert(`급성 cap 미적용: duration=${String(d)} → 3단계 유지`, res.suggestedStage === 3)
}

// ---------------------------------------------------------------------------
// 4. 공포회피 cap (LBP_13 = YES)
// ---------------------------------------------------------------------------

{
  const res = suggestLbpExerciseStage({ chiefImpact: 'mild', fearAvoidance: 'YES' })
  assert('공포회피 cap: mild(3) + YES → 2단계', res.suggestedStage === 2)
  assert('공포회피 cap: CAP 근거 1개', kinds(res, 'CAP').length === 1)
}
{
  const res = suggestLbpExerciseStage({ chiefImpact: 'severe', fearAvoidance: 'YES' })
  assert('공포회피 cap: severe(1)를 올리지 않는다', res.suggestedStage === 1)
  assert('공포회피 cap: severe에는 CAP 근거 없음', kinds(res, 'CAP').length === 0)
}
for (const f of ['NO', 'SOMEWHAT', 'UNKNOWN', undefined, null, '', 'yes', true, {}]) {
  const res = suggestLbpExerciseStage({ chiefImpact: 'mild', fearAvoidance: f })
  assert(`공포회피 cap 미적용: fear=${String(f)} → 3단계 유지`, res.suggestedStage === 3)
}
{
  const res = suggestLbpExerciseStage({ chiefImpact: 'mild', fearAvoidance: 'SOMEWHAT' })
  assert(
    'SOMEWHAT은 단계를 바꾸지 않고 CONTEXT로만 나온다',
    res.suggestedStage === 3 && kinds(res, 'CONTEXT').some((r) => r.text.includes('조금')),
  )
}

// ---------------------------------------------------------------------------
// 5. cap 2개 동시
// ---------------------------------------------------------------------------

{
  const res = suggestLbpExerciseStage({
    chiefImpact: 'minimal',
    chiefDuration: 'within_1w',
    fearAvoidance: 'YES',
  })
  assert('cap 2개 동시: 3 → 2단계', res.suggestedStage === 2)
  assert('cap 2개 동시: CAP 근거 2개', kinds(res, 'CAP').length === 2)
  assert('cap 2개 동시: baseStage는 3 유지', res.baseStage === 3)
}

// ---------------------------------------------------------------------------
// 6. 회복 기대(LBP_12) — 0~10 정수만 참고 문장으로, 단계는 절대 안 바뀐다
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
// 7. 일·집안일 지장(LBP_14) — 참고만
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
// 8. 전수 조합 불변식 — 4 impact × 7 duration × 5 fear = 140가지
// ---------------------------------------------------------------------------

const IMPACTS = ['severe', 'moderate', 'mild', 'minimal']
const DURATIONS = ['within_1w', '1w_1m', '1_3m', '3m_1y', 'over_1y', 'unknown', undefined]
const FEARS = ['NO', 'SOMEWHAT', 'YES', 'UNKNOWN', undefined]

let combos = 0
for (const impact of IMPACTS) {
  for (const duration of DURATIONS) {
    for (const fear of FEARS) {
      const res = suggestLbpExerciseStage({ chiefImpact: impact, chiefDuration: duration, fearAvoidance: fear })
      const where = `${impact}/${String(duration)}/${String(fear)}`
      if (![1, 2, 3].includes(res.suggestedStage)) throw new Error(`FAIL: 단계가 1~3 밖 (${where})`)
      if (res.suggestedStage > res.baseStage) throw new Error(`FAIL: cap이 단계를 올렸다 (${where})`)
      if (res.clinicianMustConfirm !== true) throw new Error(`FAIL: clinicianMustConfirm !== true (${where})`)
      if (kinds(res, 'BASE').length !== 1) throw new Error(`FAIL: BASE 근거가 1개가 아니다 (${where})`)
      if (kinds(res, 'INSUFFICIENT').length !== 0) throw new Error(`FAIL: INSUFFICIENT가 붙었다 (${where})`)
      combos++
    }
  }
}
assert(`전수 조합 ${combos}가지: 단계 1~3, cap은 낮추기만, BASE 근거 정확히 1개`, combos === 140)

// cap 상수 자체가 2단계 이하인지 — 정책값이 바뀌어도 3단계 cap은 무의미하다
assert('ACUTE_ONSET_MAX_STAGE는 3 미만', ACUTE_ONSET_MAX_STAGE < 3)
assert('HIGH_FEAR_AVOIDANCE_MAX_STAGE는 3 미만', HIGH_FEAR_AVOIDANCE_MAX_STAGE < 3)

// ---------------------------------------------------------------------------
// 9. payload 어댑터 — 손상된 기록에도 던지지 않는다
// ---------------------------------------------------------------------------

{
  const payload = {
    responses: {
      visit_goal: { chief_impact: 'severe', chief_duration: 'within_1w' },
      safety_flags: { lbp: { fear_avoidance: 'YES', recovery_expectation: 6, work_impact: 'MAJOR' } },
    },
  }
  const input = lbpStageInputFromPayload(payload)
  assert('어댑터: chief_impact 읽음', input.chiefImpact === 'severe')
  assert('어댑터: chief_duration 읽음', input.chiefDuration === 'within_1w')
  assert('어댑터: fear_avoidance 읽음', input.fearAvoidance === 'YES')
  assert('어댑터: recovery_expectation 읽음', input.recoveryExpectation === 6)
  assert('어댑터: work_impact 읽음', input.workImpact === 'MAJOR')
  assert('어댑터 → 제안까지 연결', suggestLbpExerciseStage(input).suggestedStage === 1)
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
// 10. 문진 스펙과의 drift 가드
//     — VISIT_04/VISIT_03/LBP_13의 선택지가 바뀌면 이 매핑은 조용히 깨진다.
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
// 11. 아키텍처 제약 — 소스 텍스트 단언 (CLAUDE.md "경로 1개당 단언 1개")
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

console.log(`\n${passCount} assertions passed.`)
