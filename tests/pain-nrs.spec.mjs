/*
 * 통증 강도(NRS) — PAIN_03 / PAIN_03B 회귀 고정.
 *
 * 배경. Master Spec v0.2는 `PAIN_03 NRS`를 이 자리에 배정했고, v1.0이
 * "VISIT_04_SYMPTOM_IMPACT가 동일한 의미로 수집된다"는 근거로 **제외**했다.
 * 2026-09-22 그 판단을 뒤집었다 -- `통증 강도`와 `일상생활 영향`은 다른 축이고,
 * PO가 실제로 차트에 NRS를 따로 적고 매 재진마다 추적하고 있었다.
 *
 * 그래서 이 테스트가 붙드는 것은 두 가지다:
 *   §A 문항이 존재하고, 통증 환자 전부에게(부위 무관) 뜬다
 *   §B 재진에서 같은 id로 다시 물어 비교가 성립한다 (전 부위 공통)
 *   §C **임상 판단에 쓰이지 않는다** -- 안전/분류/운동 적격성 어디에도 안 들어감
 *   §D 닥터뷰 상단 스냅샷이 척도 행/비교 행을 만든다
 *   §E VISIT_04와 공존한다 (v1.0의 "중복" 판단을 뒤집은 근거 그 자체)
 *
 * 실행: `npm run test:pain-nrs` (`npm run test:all`에 포함)
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { ALL_QUESTIONS, CORE_QUESTIONS, buildResponsePayload } from './.spec-bundle.mjs'
import { DOCTOR_FIXTURES } from './.briefing-fixtures.mjs'
import { buildPainHeadline } from './.briefing-model.mjs'
import {
  DETAIL_CHECK_COMMON_QUESTION_IDS,
  detailCheckQuestionIdsForRegion,
} from '../server/detailCheck.js'

const here = dirname(fileURLToPath(import.meta.url))
let passed = 0
const failures = []
const ok = (label, cond) => {
  if (cond) passed += 1
  else failures.push(label)
}

const byId = new Map(ALL_QUESTIONS.map((q) => [q.id, q]))
const visibleIds = (r) => CORE_QUESTIONS.filter((q) => !q.showIf || q.showIf(r)).map((q) => q.id)

/* ---------------- §A 문항 정의와 노출 ---------------- */

for (const [id, variable] of [
  ['PAIN_03', 'pain_nrs_now'],
  ['PAIN_03B', 'pain_nrs_worst'],
]) {
  const q = byId.get(id)
  ok(`§A ${id}이 존재한다`, q != null)
  if (!q) continue
  ok(`§A ${id}은 numeric_scale이다`, q.input === 'numeric_scale')
  ok(`§A ${id}의 variable이 ${variable}이다`, q.variable === variable)
  ok(`§A ${id} 척도가 0~10이다`, q.scale?.min === 0 && q.scale?.max === 10)
  ok(
    `§A ${id} 앵커가 NRS 표준이다 (0=통증 없음)`,
    q.scale?.minLabel === '통증 없음' && /가장 심한 통증/.test(q.scale?.maxLabel ?? ''),
  )
  ok(`§A ${id}은 필수다 (추적 기준선이므로)`, q.required === true)
}

// 부위를 가리지 않는다 -- 허리만이 아니라 통증 환자 전부.
const REGIONS = [
  'low_back_pelvis',
  'neck_shoulder',
  'arm_hand',
  'leg_foot',
  'knee',
  'head_face_jaw',
  'chest_rib',
  'abdomen',
  'other',
]
for (const region of REGIONS) {
  const ids = visibleIds({ VISIT_00_INTENT: 'pain_care', PAIN_01: region })
  ok(`§A ${region}: PAIN_03이 보인다`, ids.includes('PAIN_03'))
  ok(`§A ${region}: PAIN_03B가 보인다`, ids.includes('PAIN_03B'))
}

// 통증 환자가 아니면 뜨지 않는다.
const sleepOnly = visibleIds({ VISIT_00_INTENT: 'symptom_consult', VISIT_02_SYMPTOM_MAIN: 'sleep' })
ok('§A 통증 주호소가 아니면 PAIN_03이 뜨지 않는다', !sleepOnly.includes('PAIN_03'))
ok('§A 통증 주호소가 아니면 PAIN_03B가 뜨지 않는다', !sleepOnly.includes('PAIN_03B'))

// 추가 상세로 통증을 연 환자도 받는다.
const detailPain = visibleIds({
  VISIT_00_INTENT: 'symptom_consult',
  VISIT_02_SYMPTOM_MAIN: 'sleep',
  ADDITIONAL_DETAIL_01: 'pain',
  PAIN_01: 'knee',
})
ok('§A 추가상세 pain 환자도 PAIN_03을 받는다', detailPain.includes('PAIN_03'))

/* ---------------- §B 재진 재질문 (전 부위 공통) ---------------- */

ok('§B PAIN_03이 재진 공통 재질문이다', DETAIL_CHECK_COMMON_QUESTION_IDS.includes('PAIN_03'))
ok('§B PAIN_03B가 재진 공통 재질문이다', DETAIL_CHECK_COMMON_QUESTION_IDS.includes('PAIN_03B'))
ok(
  '§B VISIT_04_SYMPTOM_IMPACT는 그대로 남아 있다 (다른 축이므로)',
  DETAIL_CHECK_COMMON_QUESTION_IDS.includes('VISIT_04_SYMPTOM_IMPACT'),
)

// 부위별 목록이 아니라 공통이어야 승인 전 부위(가슴·배·그 밖)도 추적된다.
for (const region of ['lbp', 'neck', 'shoulder', 'knee', 'wrist_hand', 'ankle_foot', null]) {
  const ids = detailCheckQuestionIdsForRegion(region)
  ok(`§B 재진(${region ?? '부위 승인 전'})에서 NRS 두 문항을 다시 묻는다`, ids.includes('PAIN_03') && ids.includes('PAIN_03B'))
}

// 재진 화면이 실제로 렌더할 수 있는 입력 종류여야 한다(detailCheckQuestions.ts는
// single_choice와 numeric_scale만 지원하고, 모르는 것은 조용히 건너뛴다).
for (const id of ['PAIN_03', 'PAIN_03B']) {
  const q = byId.get(id)
  ok(`§B ${id}은 재진 화면이 지원하는 입력 종류다`, q?.input === 'numeric_scale' && q?.scale != null)
}

/* ---------------- §C 임상 판단에 쓰이지 않는다 ---------------- */

const specDir = join(here, '..', 'src', 'spec')
const CLINICAL_FILES = [
  'coreSpec.ts',
  'lbpLogic.ts',
  'lbpAdapter.ts',
  'neckLogic.ts',
  'neckAdapter.ts',
  'shoulderLogic.ts',
  'shoulderAdapter.ts',
  'kneeLogic.ts',
  'kneeAdapter.ts',
  'elbowLogic.ts',
  'elbowAdapter.ts',
  'wristHandLogic.ts',
  'wristHandAdapter.ts',
  'ankleFootLogic.ts',
  'ankleFootAdapter.ts',
  'tmjLogic.ts',
  'tmjAdapter.ts',
  'hipLogic.ts',
  'hipAdapter.ts',
  'hipQuestions.ts',
  'tmjQuestions.ts',
]

for (const f of CLINICAL_FILES) {
  let src
  try {
    src = readFileSync(join(specDir, f), 'utf8')
  } catch {
    continue
  }
  // coreSpec은 문항 정의와 payload 조립에서 id를 쓰는 것이 정상이다 --
  // 금지하는 것은 **판단식 안에서 읽는 것**이다. 다른 파일은 언급 자체가 없어야 한다.
  if (f === 'coreSpec.ts') {
    const judged = /PAIN_03B?['"]\]\s*(===|!==|[<>]=?)/.test(src)
    ok(`§C coreSpec이 NRS 값을 비교·분기에 쓰지 않는다`, !judged)
    continue
  }
  ok(`§C ${f}가 NRS를 읽지 않는다`, !/PAIN_03|nrs_now|nrs_worst/.test(src))
}

// 값이 바뀌어도 안전 플래그는 한 글자도 안 바뀐다 -- 이게 §C의 진짜 증명이다.
const base = { VISIT_00_INTENT: 'pain_care', PAIN_01: 'low_back_pelvis', HIP_00: 'LOW_BACK_DOMINANT', LBP_01: 'BUTTOCK', LBP_02: ['NUMBNESS'] }
const flagsAt = (n) => JSON.stringify(buildResponsePayload({ ...base, PAIN_03: n, PAIN_03B: n }).safety_flags)
ok('§C NRS 0과 10의 안전 플래그가 동일하다', flagsAt(0) === flagsAt(10))
ok('§C NRS 미응답과 10의 안전 플래그가 동일하다', JSON.stringify(buildResponsePayload(base).safety_flags) === flagsAt(10))

/* ---------------- §D 닥터뷰 스냅샷 ---------------- */

const painFixtures = DOCTOR_FIXTURES.filter(
  (f) => f.payload.routing.primary_module === 'Pain' || f.payload.routing.additional_module === 'Pain',
)
ok('§D 통증 픽스처가 있다', painFixtures.length > 0)

const withNrs = painFixtures.filter((f) => typeof f.payload.responses.modules?.pain?.nrs_now === 'number')
ok('§D NRS가 payload에 실제로 실린다', withNrs.length > 0)

for (const f of withNrs.slice(0, 8)) {
  const h = buildPainHeadline(f.payload)
  ok(`§D [${f.name}] 스냅샷에 제목이 있다`, typeof h.title === 'string' && h.title.length > 0)
  ok(`§D [${f.name}] 스냅샷 행이 2개다 (지금 / 가장 아플 때)`, h.rows.length === 2)
  const now = h.rows[0]
  ok(`§D [${f.name}] 이전 값이 없으면 척도 행이다`, now.kind === 'scale' && typeof now.n === 'number')
  ok(`§D [${f.name}] 척도 행은 중립색이다 (주관 지표라 단일 값으로 겁주지 않는다)`, now.tone === 'neutral')

  // 이전 값을 주면 비교 행으로 바뀐다.
  const better = buildPainHeadline(f.payload, { now: Math.min(10, now.n + 2), worst: null })
  ok(`§D [${f.name}] 이전 값이 있으면 비교 행이 된다`, better.rows[0].kind === 'delta')
  ok(`§D [${f.name}] 좋아지면 초록이다`, better.rows[0].tone === 'good')
  const worse = buildPainHeadline(f.payload, { now: Math.max(0, now.n - 2), worst: null })
  ok(`§D [${f.name}] 나빠지면 앰버다`, worse.rows[0].tone === 'warn')
  const same = buildPainHeadline(f.payload, { now: now.n, worst: null })
  ok(`§D [${f.name}] 변화 없으면 중립이다`, same.rows[0].tone === 'neutral')
}

// 스냅샷은 4블록 상한 밖이다 -- 블록을 5개로 늘려 "한 화면" 규율을 깨지 않았다.
const modelSrc = readFileSync(join(here, '..', 'src', 'doctor', 'clinical', 'briefingModel.ts'), 'utf8')
ok('§D 블록 상한이 여전히 4다', /MAX_BRIEFING_BLOCKS = 4/.test(modelSrc))

/* ---------------- §E VISIT_04와 공존 ---------------- */

// v1.0은 이 둘을 "동일한 의미"로 보고 NRS를 지웠다. 그 판단을 뒤집었으므로
// 두 문항이 함께 살아 있어야 하고, 서로 다른 것을 재야 한다.
ok('§E VISIT_04_SYMPTOM_IMPACT가 여전히 존재한다', byId.has('VISIT_04_SYMPTOM_IMPACT'))
const v04 = byId.get('VISIT_04_SYMPTOM_IMPACT')
ok('§E VISIT_04는 4단계 선택형이다 (NRS의 11단계와 다른 해상도)', v04?.input === 'single_choice')
ok('§E NRS는 11단계 척도다', byId.get('PAIN_03')?.scale?.max === 10)

const both = visibleIds({ VISIT_00_INTENT: 'pain_care', PAIN_01: 'low_back_pelvis' })
ok('§E 통증 환자는 NRS와 일상 지장을 모두 받는다', both.includes('PAIN_03') && both.includes('VISIT_04_SYMPTOM_IMPACT'))

/* ---------------- 결과 ---------------- */

if (failures.length) {
  console.error(`\n✗ pain-nrs: ${failures.length}건 실패 / ${passed}건 통과\n`)
  for (const f of failures.slice(0, 25)) console.error(`  - ${f}`)
  if (failures.length > 25) console.error(`  ... 외 ${failures.length - 25}건`)
  process.exit(1)
}
console.log(`✓ pain-nrs: ${passed}건 단언 통과`)
