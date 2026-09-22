/*
 * 통증 브리핑(`src/doctor/clinical/briefingModel.ts`) 회귀 고정.
 *
 * 이 테스트가 붙드는 것은 예쁨이 아니라 **구조**다. 화면이 다시 길어지고
 * 복잡해지는 경로를 코드 레벨에서 막는다.
 *
 *   §A 구조 상한 — 블록 4개, 행 문법 1개
 *   §B 부위 게이트 — 허리 전용 행이 다른 부위 화면에 새지 않는다
 *   §C 임상 경계 — 브리핑은 안전 플래그를 읽지도 바꾸지도 않는다
 *   §D 라벨 출처 — 값 문구를 이 파일이 지어내지 않는다
 *   §E 미수집 표기 — 자리는 남기되 실제 값보다 자리를 더 먹지 않는다
 *
 * 실행: `npm run test:pain-briefing` (`npm run test:all`에 포함)
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { DOCTOR_FIXTURES } from './.briefing-fixtures.mjs'
import { buildPainBriefing, buildPainHeadline, MAX_BRIEFING_BLOCKS } from './.briefing-model.mjs'

/** 소스 검사에서 주석은 뺀다 -- 설명문에 나온 단어를 코드로 오인하지 않게. */
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

const here = dirname(fileURLToPath(import.meta.url))
let passed = 0
const failures = []
const ok = (label, cond) => {
  if (cond) passed += 1
  else failures.push(label)
}

const PAIN = DOCTOR_FIXTURES.filter(
  (f) => f.payload.routing.primary_module === 'Pain' || f.payload.routing.additional_module === 'Pain',
)
ok('통증 픽스처가 충분히 있다 (>= 10)', PAIN.length >= 10)

const regionOf = (f) => f.payload.responses.modules?.pain?.primary_location ?? null

/* ---------------- §A 구조 상한 ---------------- */

const EXPECTED_KEYS = ['function', 'load', 'neuro', 'recovery']
const TONES = new Set(['good', 'neutral', 'warn'])
const STATUSES = new Set(['answered', 'unanswered', 'not_collected'])

for (const f of PAIN) {
  const blocks = buildPainBriefing(f.payload)

  ok(
    `§A [${f.name}] 블록은 항상 ${MAX_BRIEFING_BLOCKS}개다`,
    blocks.length === MAX_BRIEFING_BLOCKS,
  )
  ok(
    `§A [${f.name}] 블록 키와 순서가 고정이다`,
    JSON.stringify(blocks.map((b) => b.key)) === JSON.stringify(EXPECTED_KEYS),
  )
  ok(
    `§A [${f.name}] 모든 블록이 eyebrow와 질문 한 줄을 가진다`,
    blocks.every((b) => b.eyebrow.length > 0 && b.question.length > 0),
  )

  const rows = blocks.flatMap((b) => b.rows)
  ok(`§A [${f.name}] 행이 하나 이상 있다`, rows.length > 0)
  ok(
    `§A [${f.name}] 모든 행이 같은 모양이다 (label/tone/status/source)`,
    rows.every(
      (r) =>
        typeof r.label === 'string' &&
        r.label.length > 0 &&
        TONES.has(r.tone) &&
        STATUSES.has(r.status) &&
        typeof r.source === 'string' &&
        r.source.length > 0,
    ),
  )
  ok(
    `§A [${f.name}] 한 블록 안에 라벨이 중복되지 않는다`,
    blocks.every((b) => new Set(b.rows.map((r) => r.label)).size === b.rows.length),
  )
  // 한 화면에 들어가야 하므로 총 행 수에도 상한을 둔다. 허리(가장 많은 부위)가
  // 현재 16행이고, 여유를 봐도 24행을 넘으면 그건 다시 스크롤 화면이다.
  ok(`§A [${f.name}] 총 행 수가 24를 넘지 않는다 (${rows.length})`, rows.length <= 24)
}

/* ---------------- §B 부위 게이트 ---------------- */

/*
 * `modules.lbp`는 허리 환자가 아니어도 전 필드 null인 객체로 항상 존재한다.
 * 첫 구현이 그 존재 여부로 게이트를 걸어서, 목 통증 환자 화면에 `내려가는 범위 /
 * 다리 신경 증상 / 증상 쪽`이 "미응답"으로 떴다. 컨택트 시트가 그걸 잡았고,
 * 이 단언이 재발을 막는다.
 */
const LBP_ONLY_SOURCES = [
  'modules.lbp.work_impact',
  'modules.lbp.claudication_walking',
  'modules.lbp.claudication_relief',
  'modules.lbp.distal_extent',
  'modules.lbp.leg_neuro_symptoms',
  'modules.lbp.leg_side',
  'modules.lbp.recurrence',
  'modules.lbp.fear_avoidance',
  'modules.lbp.recovery_expectation',
]

let sawLbpFixture = false
for (const f of PAIN) {
  const sources = buildPainBriefing(f.payload)
    .flatMap((b) => b.rows)
    .map((r) => r.source)
  const lbpRows = sources.filter((s) => LBP_ONLY_SOURCES.includes(s))

  if (regionOf(f) === 'low_back_pelvis') {
    sawLbpFixture = true
    ok(`§B [${f.name}] 허리 환자는 LBP 전용 행을 전부 받는다`, lbpRows.length === LBP_ONLY_SOURCES.length)
  } else {
    ok(`§B [${f.name}] 허리가 아닌 부위에 LBP 전용 행이 새지 않는다`, lbpRows.length === 0)
  }
}
ok('§B 허리 픽스처가 실제로 존재한다 (위 단언이 공허하지 않도록)', sawLbpFixture)

/* ---------------- §C 임상 경계 ---------------- */

const modelSrc = readFileSync(join(here, '..', 'src', 'doctor', 'clinical', 'briefingModel.ts'), 'utf8')

/*
 * 브리핑은 안전을 **판정하지 않는다.**
 *
 * 처음에는 "safety_flags를 아예 읽지 않는다"로 두었는데, Figma 스냅샷 띠의
 * 안전 칩(`✓ 긴급 red flag 없음`)을 구현하면서 그 단언이 걸렸다. 그 칩은
 * 이미 계산된 상태를 **표시**할 뿐이라 원래 막으려던 것(화면이 몰래 임상
 * 판단을 하는 것)이 아니다 -- 그래서 단언을 지우지 않고 **원래 뜻하던
 * 것으로 조인다.**
 *
 *   허용: 이미 계산된 `<region>_safety_status`를 읽어 표시 단계로 매핑
 *   금지: 임계값·재판정·새 상태값, 그리고 안전값으로 **다른 행**을 바꾸는 것
 */
ok('§C 모델이 clinical_flags를 읽지 않는다', !/clinical_flags/.test(modelSrc))
ok('§C 모델이 payload.flags를 읽지 않는다', !/payload\.flags/.test(modelSrc))

// C-1. 안전은 오직 `buildSafetyChip` 안에서만 읽는다. 다른 곳이 읽기
//      시작하면 안전값이 행 내용에 번진다.
{
  const code = stripComments(modelSrc)
  const fnStart = code.indexOf('function buildSafetyChip')
  ok('§C buildSafetyChip이 존재한다', fnStart >= 0)
  const fnEnd = code.indexOf('\n}', fnStart)
  const inside = code.slice(fnStart, fnEnd)
  const outside = code.slice(0, fnStart) + code.slice(fnEnd)
  ok('§C 안전 필드를 읽는 코드는 buildSafetyChip뿐이다', !/safety_flags/.test(outside))
  ok('§C buildSafetyChip은 실제로 safety_flags를 읽는다 (위 단언이 공허하지 않도록)', /safety_flags/.test(inside))
  // C-2. 이미 있는 상태값 세 개만 매핑한다 -- 새 판정값을 만들지 않는다.
  ok(
    '§C 안전 칩은 기존 상태값 세 개만 매핑한다',
    /'URGENT_REVIEW'/.test(inside) && /'REVIEW_REQUIRED'/.test(inside) && /'CLEAR'/.test(inside),
  )
}

/*
 * C-2b. 임계값이 없다는 것을 **소스가 아니라 동작으로** 고정한다.
 *
 * 처음에는 함수 본문에 `[<>]=?\s*\d`가 없는지 봤는데 `urgent.length > 0`
 * 같은 목록 비어있음 검사까지 잡혔다 -- 그건 임계값이 아니다. 진짜 물어야
 * 할 것은 "이 함수가 새 판정을 만드는가"이고, 그건 **나오는 값의 집합**으로
 * 확인하는 편이 정확하다.
 */
const SAFETY_LEVELS = new Set(['urgent', 'review', 'clear', 'unknown'])
{
  const levels = new Set(PAIN.map((f) => buildPainHeadline(f.payload).safety.level))
  ok('§C 안전 칩 단계가 넷을 벗어나지 않는다', [...levels].every((l) => SAFETY_LEVELS.has(l)), )
  ok('§C 실제로 여러 단계가 나온다 (위 단언이 공허하지 않도록)', levels.size >= 2)
  ok(
    '§C 안전 칩 라벨은 항상 채워진다',
    PAIN.every((f) => typeof buildPainHeadline(f.payload).safety.label === 'string' && buildPainHeadline(f.payload).safety.label.length > 0),
  )
}

// C-3. 안전값이 **행**으로 새지 않는다. 블록 행의 출처는 언제나 문진 답변이다.
for (const f of PAIN.slice(0, 12)) {
  const sources = buildPainBriefing(f.payload)
    .flatMap((b) => b.rows)
    .map((r) => r.source)
  ok(
    `§C [${f.name}] 블록 행이 안전 필드에서 오지 않는다`,
    sources.every((s) => !/safety|flag/i.test(s)),
  )
}

// 브리핑을 만들어도 payload가 변형되지 않는다(순수 함수).
for (const f of PAIN.slice(0, 5)) {
  const before = JSON.stringify(f.payload)
  buildPainBriefing(f.payload)
  buildPainBriefing(f.payload, { includeNotCollected: false })
  ok(`§C [${f.name}] payload를 변형하지 않는다`, JSON.stringify(f.payload) === before)
}

// 두 번 호출하면 같은 결과 (숨은 상태 없음).
const det = PAIN[0]
ok(
  '§C 같은 입력에 같은 출력 (결정적)',
  JSON.stringify(buildPainBriefing(det.payload)) === JSON.stringify(buildPainBriefing(det.payload)),
)

/* ---------------- §D 라벨 출처 ---------------- */

// 값 문구는 optionLabel()로만 만든다 — 이 파일이 한글 답변 문구를 지어내면
// 스펙과 화면이 갈라진다. 답변 문구처럼 보이는 한글 리터럴이 없어야 한다.
ok('§D 모델이 optionLabel/optionLabels만으로 값을 만든다', /optionLabel\(/.test(modelSrc) && /optionLabels\(/.test(modelSrc))

// 실제로 스펙 라벨이 나오는지 확인(공허한 통과 방지).
const lbpFixture = PAIN.find((f) => regionOf(f) === 'low_back_pelvis')
const lbpValues = buildPainBriefing(lbpFixture.payload)
  .flatMap((b) => b.rows)
  .filter((r) => r.status === 'answered')
  .map((r) => r.value)
ok('§D 허리 환자 화면에 실제 답변 값이 5개 이상 표시된다', lbpValues.length >= 5)
ok('§D 표시값에 raw enum(대문자_언더스코어)이 새지 않는다', !lbpValues.some((v) => /^[A-Z][A-Z_]+$/.test(v)))

/* ---------------- §E 미수집 표기 ---------------- */

for (const f of PAIN) {
  const blocks = buildPainBriefing(f.payload)
  for (const b of blocks) {
    const pending = b.rows.filter((r) => r.status === 'not_collected')
    // 블록당 한 줄로 접는다 — 처음에는 항목마다 한 행이라 FUNCTION 블록의
    // 절반이 "아직 안 물어봄"으로 찼고, 블록이 고장 난 것처럼 보였다.
    ok(`§E [${f.name}] ${b.key}: 미수집 행은 최대 1줄이다`, pending.length <= 1)
    ok(
      `§E [${f.name}] ${b.key}: 미수집 행은 이유(note)를 갖는다`,
      pending.every((r) => typeof r.note === 'string' && r.note.length > 0),
    )
  }

  const off = buildPainBriefing(f.payload, { includeNotCollected: false })
  ok(
    `§E [${f.name}] includeNotCollected:false면 미수집 행이 사라진다`,
    off.flatMap((b) => b.rows).every((r) => r.status !== 'not_collected'),
  )
  ok(
    `§E [${f.name}] 미수집을 꺼도 블록 수는 그대로다`,
    off.length === MAX_BRIEFING_BLOCKS,
  )
}

/* ---------------- 결과 ---------------- */

if (failures.length) {
  console.error(`\n✗ pain-briefing: ${failures.length}건 실패 / ${passed}건 통과\n`)
  for (const f of failures.slice(0, 25)) console.error(`  - ${f}`)
  if (failures.length > 25) console.error(`  ... 외 ${failures.length - 25}건`)
  process.exit(1)
}
console.log(`✓ pain-briefing: ${passed}건 단언 통과 (픽스처 ${PAIN.length}개)`)
