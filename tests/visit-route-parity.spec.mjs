/**
 * 진입 경로 등가성(route parity) — 회귀 고정 테스트.
 *
 * 무엇을 고정하는가:
 *   같은 임상 입력이라면, 환자가 **새 첫 화면**(`VISIT_00_INTENT='pain_care'`)으로
 *   들어왔든 **레거시 경로**(`VISIT_01='symptom'` + `VISIT_02_SYMPTOM_MAIN='pain'`)로
 *   들어왔든, 보이는 문항 집합과 계산되는 안전 플래그가 **완전히 같아야 한다**.
 *
 * 왜 필요한가:
 *   `VISIT_00_INTENT`가 새 첫 질문으로 들어오면서 `coreSpec`은 정규화 함수
 *   (`primaryConcernKey`/`IS_PRIMARY_PAIN`)를 탔지만, `hipQuestions.ts`와
 *   `tmjQuestions.ts`는 raw 필드를 직접 읽는 **복제된 게이트**를 그대로 뒀다.
 *   그 결과 `pain_care`로 들어온 환자에게서
 *     - HIP_00과 그 뒤 HIP 안전 문항 전체가 뜨지 않고 `hip` 플래그가 null
 *     - HFJ_00과 TMJ 안전 문항 5개(외상·탈구 응급 선별 포함)가 뜨지 않고 `tmj`가 null
 *   이 되었다. LBP 문항은 정상으로 떴기 때문에 화면상으로는 멀쩡해 보였다.
 *
 * §A 문항 노출 등가성 / §B 안전 플래그 등가성 / §C 추가상세(pain) 경로
 * §D 소스 텍스트 단언 — 복제 게이트의 재유입 차단
 */
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { CORE_QUESTIONS, MODULE_QUESTION_IDS, buildResponsePayload } from './.spec-bundle.mjs'

const here = dirname(fileURLToPath(import.meta.url))
let passed = 0
const failures = []

const ok = (label, cond) => {
  if (cond) passed += 1
  else failures.push(label)
}
const eq = (label, a, b) => {
  const [x, y] = [JSON.stringify(a), JSON.stringify(b)]
  if (x === y) passed += 1
  else failures.push(`${label}\n    새 경로: ${x}\n    레거시 : ${y}`)
}

const visibleIds = (r) => CORE_QUESTIONS.filter((q) => !q.showIf || q.showIf(r)).map((q) => q.id)
const flags = (r) => buildResponsePayload(r).clinical_flags ?? buildResponsePayload(r).safety_flags

/**
 * 부위별 대표 시나리오. discriminator가 있는 부위는 그 값까지 채워야
 * 뒤따르는 안전 문항이 열리므로 함께 넣는다.
 */
const REGIONS = [
  { name: '허리·골반 (HIP 판별자: 고관절·사타구니)', extra: { PAIN_01: 'low_back_pelvis', HIP_00: 'HIP_GROIN_DOMINANT' } },
  { name: '허리·골반 (HIP 판별자: 허리 우세 → LBP)', extra: { PAIN_01: 'low_back_pelvis', HIP_00: 'LOW_BACK_DOMINANT' } },
  { name: '허리·골반 (HIP 판별자: 잘 모르겠음)', extra: { PAIN_01: 'low_back_pelvis', HIP_00: 'UNKNOWN' } },
  { name: '머리·얼굴·턱 (HFJ 판별자: 턱관절)', extra: { PAIN_01: 'head_face_jaw', HFJ_00: 'JAW_TMJ_MASTICATORY' } },
  { name: '머리·얼굴·턱 (HFJ 판별자: 얼굴 신경통)', extra: { PAIN_01: 'head_face_jaw', HFJ_00: 'FACIAL_NEURALGIC' } },
  { name: '머리·얼굴·턱 (HFJ 판별자: 두통 — TMJ 범위 밖)', extra: { PAIN_01: 'head_face_jaw', HFJ_00: 'HEADACHE_CRANIAL' } },
  { name: '목·어깨', extra: { PAIN_01: 'neck_shoulder' } },
  { name: '팔·손', extra: { PAIN_01: 'arm_hand' } },
  { name: '다리·발', extra: { PAIN_01: 'leg_foot' } },
  { name: '무릎', extra: { PAIN_01: 'knee' } },
  { name: '가슴·갈비뼈', extra: { PAIN_01: 'chest_rib' } },
  { name: '배 주변', extra: { PAIN_01: 'abdomen' } },
  { name: '그 밖의 부위', extra: { PAIN_01: 'other' } },
]

const newRoute = (extra) => ({ VISIT_00_INTENT: 'pain_care', ...extra })
const legacyRoute = (extra) => ({ VISIT_01: 'symptom', VISIT_02_SYMPTOM_MAIN: 'pain', ...extra })

/* ---------- §A 문항 노출 등가성 ---------- */

/**
 * 두 경로에서 **의도적으로** 다른 문항들. 이 목록은 임상 문항이 아니라
 * 문진의 "껍데기"(어느 경로로 들어왔는지, 동반문제를 어느 화면에서 묻는지)다.
 *
 *  - `VISIT_00_INTENT`  : 새 경로의 첫 질문. 레거시에는 없다.
 *  - `VISIT_01`         : 새 경로에서는 숨긴다(`showIf: VISIT_00_INTENT == null`).
 *  - `VISIT_02_SYMPTOM_MAIN` : `pain_care`는 이 단계를 건너뛴다(Tablet UX v2.1 §4).
 *  - `SECONDARY_01` ↔ `REFERENCE_SYMPTOMS_01` : 같은 "동반문제" 질문의 구/신 버전.
 *    `showIf`가 각각 `VISIT_00_INTENT == null` / `!= null`이라 **상호배타**다.
 *
 * 이 목록을 늘려서 테스트를 통과시키지 않는다 — 여기 없는 문항이 두 경로에서
 * 달라지면 그건 설계가 아니라 회귀다.
 */
const ROUTE_SHAPE_IDS = new Set([
  'VISIT_00_INTENT',
  'VISIT_01',
  'VISIT_02_SYMPTOM_MAIN',
  'SECONDARY_01',
  'REFERENCE_SYMPTOMS_01',
])

// coreSpec이 직접 내보내는 pain module 문항 목록을 기준으로 삼는다
// (테스트가 자체 prefix 목록을 따로 들고 있으면 그게 또 하나의 복제가 된다).
const PAIN_MODULE_IDS = new Set(MODULE_QUESTION_IDS.pain)
ok('§A pain module 문항 목록이 비어있지 않다', PAIN_MODULE_IDS.size > 0)

for (const { name, extra } of REGIONS) {
  const a = visibleIds(newRoute(extra))
  const b = visibleIds(legacyRoute(extra))

  // A-1. 핵심 불변식: 통증 module 문항 노출이 두 경로에서 완전히 같다.
  eq(
    `§A-1 ${name} — pain module 문항 노출이 두 경로에서 같아야 한다`,
    a.filter((id) => PAIN_MODULE_IDS.has(id)),
    b.filter((id) => PAIN_MODULE_IDS.has(id)),
  )

  // A-2. module 밖까지 포함해, 두 경로의 차이가 위에 문서화한 껍데기 문항
  //      **뿐**이어야 한다. 새로운 종류의 드리프트가 생기면 여기서 걸린다.
  const setA = new Set(a)
  const setB = new Set(b)
  const diff = [...new Set([...a, ...b])].filter((id) => setA.has(id) !== setB.has(id))
  eq(
    `§A-2 ${name} — 두 경로의 문항 차이는 문서화된 라우팅 문항뿐이어야 한다`,
    diff.filter((id) => !ROUTE_SHAPE_IDS.has(id)),
    [],
  )

  // A-3. 회귀 지점을 이름으로 못박는다: 판별자 문항이 새 경로에서 사라졌던 버그.
  if (extra.PAIN_01 === 'low_back_pelvis') {
    ok(`§A-3 ${name} — 새 경로에서 HIP_00이 보인다`, a.includes('HIP_00'))
  }
  if (extra.PAIN_01 === 'head_face_jaw') {
    ok(`§A-3 ${name} — 새 경로에서 HFJ_00이 보인다`, a.includes('HFJ_00'))
    eq(
      `§A-3 ${name} — TMJ 안전 문항 수가 두 경로에서 같아야 한다`,
      a.filter((id) => id.startsWith('TMJ_')).length,
      b.filter((id) => id.startsWith('TMJ_')).length,
    )
  }
}

/* ---------- §B 안전 플래그 등가성 ---------- */

for (const { name, extra } of REGIONS) {
  eq(`§B ${name} — 안전 플래그가 두 경로에서 같아야 한다`, flags(newRoute(extra)), flags(legacyRoute(extra)))
}

// 플래그가 "둘 다 null이라 같다"로 통과하는 공허한 성공을 막는다.
// 최소한 HIP/TMJ는 실제 플래그 객체가 계산되어야 한다.
const hipFlags = flags(newRoute({ PAIN_01: 'low_back_pelvis', HIP_00: 'HIP_GROIN_DOMINANT' })).hip
const tmjFlags = flags(newRoute({ PAIN_01: 'head_face_jaw', HFJ_00: 'JAW_TMJ_MASTICATORY' })).tmj
ok('§B 새 경로에서 hip 플래그가 실제로 계산된다 (null 아님)', hipFlags !== null && typeof hipFlags === 'object')
ok('§B 새 경로에서 tmj 플래그가 실제로 계산된다 (null 아님)', tmjFlags !== null && typeof tmjFlags === 'object')
ok(
  '§B hip 안전 상태가 판정값을 가진다',
  typeof hipFlags?.hip_safety_status === 'string' && hipFlags.hip_safety_status.length > 0,
)
ok(
  '§B tmj 안전 상태가 판정값을 가진다',
  typeof tmjFlags?.tmj_safety_status === 'string' && tmjFlags.tmj_safety_status.length > 0,
)

/* ---------- §C 추가 상세 문진(pain) 경로 ---------- */

// 주호소가 통증이 아니어도 ADDITIONAL_DETAIL_01='pain'이면 같은 MSK 모듈을 탄다.
// LBP가 이미 그렇게 동작했으므로 HIP/TMJ도 같아야 한다.
for (const extra of [
  { PAIN_01: 'low_back_pelvis', HIP_00: 'HIP_GROIN_DOMINANT' },
  { PAIN_01: 'head_face_jaw', HFJ_00: 'JAW_TMJ_MASTICATORY' },
]) {
  const detail = { VISIT_00_INTENT: 'symptom_consult', VISIT_02_SYMPTOM_MAIN: 'sleep', ADDITIONAL_DETAIL_01: 'pain', ...extra }
  const key = extra.PAIN_01 === 'low_back_pelvis' ? 'hip' : 'tmj'
  const discriminator = extra.PAIN_01 === 'low_back_pelvis' ? 'HIP_00' : 'HFJ_00'
  ok(`§C 추가상세 pain — ${discriminator}가 보인다`, visibleIds(detail).includes(discriminator))
  ok(`§C 추가상세 pain — ${key} 플래그가 계산된다`, flags(detail)[key] !== null)
}

/* ---------- §D 소스 텍스트 단언 — 복제 게이트 재유입 차단 ---------- */

// 이 버그의 원인은 "같은 판단을 두 곳에 따로 적은 것"이다. 정규화를 거치지
// 않은 raw 게이트가 src/spec/ 어디에도 다시 생기지 않도록 소스에서 막는다.
// visitRouting.ts만이 raw 필드를 읽을 자격이 있다(그게 정규화 지점이므로).
const RAW_GATE = /r\[['"]VISIT_0(1|2_SYMPTOM_MAIN)['"]\]\s*===/
const specFiles = readdirSync(join(here, '..', 'src', 'spec')).filter((f) => f.endsWith('.ts'))
const offenders = specFiles.filter((f) => {
  if (f === 'visitRouting.ts') return false
  return RAW_GATE.test(readFileSync(join(here, '..', 'src', 'spec', f), 'utf8'))
})
ok(
  `§D src/spec/ 에서 raw VISIT_01/VISIT_02_SYMPTOM_MAIN 게이트는 visitRouting.ts에만 존재해야 한다` +
    (offenders.length ? ` — 위반: ${offenders.join(', ')}` : ''),
  offenders.length === 0,
)

// visitRouting.ts가 실제로 정규화 지점인지 확인(위 단언이 공허해지지 않도록).
const routingSrc = readFileSync(join(here, '..', 'src', 'spec', 'visitRouting.ts'), 'utf8')
ok('§D visitRouting.ts가 IS_PRIMARY_PAIN을 export한다', /export const IS_PRIMARY_PAIN/.test(routingSrc))
ok('§D visitRouting.ts가 VISIT_00_INTENT를 실제로 해석한다', /VISIT_00_INTENT/.test(routingSrc))

// HIP/TMJ가 공유 게이트를 import하는지 — 복제로 되돌아가지 않았는지.
for (const f of ['hipQuestions.ts', 'tmjQuestions.ts']) {
  const src = readFileSync(join(here, '..', 'src', 'spec', f), 'utf8')
  ok(`§D ${f}가 visitRouting의 IS_PRIMARY_PAIN을 import한다`, /import \{ IS_PRIMARY_PAIN \} from '\.\/visitRouting'/.test(src))
}

/* ---------- 결과 ---------- */

if (failures.length) {
  console.error(`\n✗ visit-route-parity: ${failures.length}건 실패 / ${passed}건 통과\n`)
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}
console.log(`✓ visit-route-parity: ${passed}건 단언 통과`)
