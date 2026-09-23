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

/* ---------------- §F 형식 오류는 미응답이 아니다 (fail-closed) ---------------- */

/*
 * 11차 독립 리뷰 HIGH-1이 `PainWorkspace.tsx`에서 고친 버그가 이 모듈에
 * 그대로 있었다. `DoctorWorkspace`에 배선하자마자
 * `doctor-workspace.spec.mjs`의 그 회귀 테스트가 여기서도 걸렸다:
 *
 *   Number(['9']) === 9
 *
 * 즉 손상된 배열이 `Number.isFinite`를 통과해 **정상 점수로 둔갑**한다.
 * 객체는 NaN이라 걸렸지만 배열은 안 걸렸다.
 *
 * 그리고 형식 오류를 `unanswered`("미응답")로 적는 것도 틀렸다 -- 미응답은
 * "환자가 답하지 않았다"는 임상적 사실이고, 데이터가 깨진 것을 그렇게 쓰면
 * 없는 사실을 지어내는 것이다. 그래서 `unreadable` 상태를 따로 뒀다.
 *
 * 판정 규칙은 `PainWorkspace.tsx`와 **같아야** 한다 -- number 타입, 유한,
 * 정수, 0~10. 같은 값을 두 화면이 다르게 읽으면 원장이 어느 쪽을 믿을지
 * 알 수 없다.
 */

const scaleFixture = PAIN.find((f) => f.payload.responses.modules?.lbp?.recovery_expectation != null)
ok('§F 0~10 척도 값을 가진 픽스처가 있다 (아래 단언이 공허하지 않도록)', scaleFixture != null)

if (scaleFixture) {
  const rowFor = (value) => {
    const p = structuredClone(scaleFixture.payload)
    p.responses.modules.lbp.recovery_expectation = value
    return buildPainBriefing(p)
      .flatMap((b) => b.rows)
      .find((r) => r.source === 'modules.lbp.recovery_expectation')
  }

  ok('§F 정상 정수는 answered다', rowFor(7)?.status === 'answered')
  ok('§F 정상 정수 값이 그대로 나온다', rowFor(7)?.value === '7 / 10')

  // 핵심: 배열. Number(['9']) === 9 이므로 순진한 isFinite 검사는 통과한다.
  const arr = rowFor(['9'])
  ok('§F 배열은 answered가 아니다 (손상된 값이 정상 점수로 둔갑하지 않는다)', arr?.status !== 'answered')
  ok('§F 배열은 unreadable이다 (미응답이 아니다 — 없는 사실을 지어내지 않는다)', arr?.status === 'unreadable')
  ok('§F 배열의 값 자리는 비어 있다 (9가 새어 나오지 않는다)', arr?.value == null)

  const obj = rowFor({ corrupted: true })
  ok('§F 객체도 unreadable이다', obj?.status === 'unreadable')

  // 범위·정수 규칙도 PainWorkspace와 같아야 한다.
  ok('§F 범위 밖(11)은 unreadable이다', rowFor(11)?.status === 'unreadable')
  ok('§F 음수(-1)는 unreadable이다', rowFor(-1)?.status === 'unreadable')
  ok('§F 소수(7.5)는 unreadable이다', rowFor(7.5)?.status === 'unreadable')
  ok('§F 숫자 문자열("7")은 unreadable이다 (태블릿은 숫자로 저장한다)', rowFor('7')?.status === 'unreadable')

  // 빈 값은 여전히 미응답 -- 형식 오류로 번지지 않는다.
  ok('§F null은 unanswered다 (형식 오류가 아니다)', rowFor(null)?.status === 'unanswered')
}

/*
 * NRS 두 행도 같은 규율을 쓴다 -- 같은 0~10 문항인데 한쪽만 막으면
 * "같은 게 두 군데, 한 쪽만 고침"이 또 난다.
 */
{
  const nrsFixture = PAIN.find((f) => f.payload.responses.modules?.pain?.nrs_now != null)
  ok('§F NRS 값을 가진 픽스처가 있다 (아래 단언이 공허하지 않도록)', nrsFixture != null)
  if (nrsFixture) {
    const nrsRowFor = (value) => {
      const p = structuredClone(nrsFixture.payload)
      p.responses.modules.pain.nrs_now = value
      return buildPainHeadline(p).rows.find((r) => r.source === 'modules.pain.nrs_now')
    }
    const normal = nrsRowFor(6)
    ok('§F NRS 정상값은 answered다', normal?.status === 'answered')
    ok('§F NRS 배열은 unreadable이다 (Number([\'9\']) === 9 함정)', nrsRowFor(['9'])?.status === 'unreadable')
    ok('§F NRS 범위 밖(11)은 unreadable이다', nrsRowFor(11)?.status === 'unreadable')
  }
}

// 렌더 쪽도 형식 오류를 "미응답"과 다른 말로 적는지 소스에서 본다 -- 저장소
// 공통 문구(`확인 필요(값 형식 오류)`)를 새로 지어내지 않고 그대로 쓴다.
{
  const view = readFileSync(join(here, '..', 'src', 'doctor', 'clinical', 'PainBriefing.tsx'), 'utf8')
  ok('§F 렌더가 unreadable을 별도 문구로 적는다', /unreadable/.test(view) && view.includes('확인 필요(값 형식 오류)'))
  ok('§F 그 문구가 미응답과 다르다', view.includes('미응답'))
}

/* ---------------- §G 접기 기준은 뷰포트가 아니라 담긴 칸이다 ---------------- */

/*
 * 브리핑 그리드는 처음에 `@media (max-width: 1180px)`로 2열→1열을 접었다.
 * 컨택트 시트(화면 전체를 쓰는 곳)에서는 맞았지만, `DoctorWorkspace`에
 * 배선하자 1440px 데스크톱에서 **가로 오버플로 143px**이 났다 -- 닥터뷰는
 * 왼쪽에 고정 요약이 있어 브리핑이 받는 실제 폭이 뷰포트보다 한참 좁은데,
 * 미디어 쿼리는 뷰포트만 보므로 2열(560+20+560=1140)을 유지했기 때문이다.
 * `tests/tablet-viewport.spec.mjs`가 잡았다.
 *
 * 실측은 그 파일이 계속 담당한다. 여기서는 **원인이 된 방식으로 되돌아가지
 * 않는지**를 소스에서 고정한다 -- 놓이는 자리마다 미디어 쿼리를 하나씩 더하는
 * 길로 가면 다음 배선에서 같은 사고가 난다.
 */
{
  const css = readFileSync(join(here, '..', 'src', 'doctor', 'clinical', 'briefing.css'), 'utf8')
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '')

  ok('§G 주석 제거 후에도 CSS가 남아 있다 (아래 단언이 공허하지 않도록)', stripped.includes('.painBriefing'))
  ok(
    '§G 그리드가 컨테이너 기준으로 접힌다 (auto-fit + minmax(min(…, 100%)))',
    /grid-template-columns:\s*repeat\(\s*auto-fit\s*,\s*minmax\(\s*min\(/.test(stripped),
  )
  ok(
    '§G 뷰포트 폭 미디어 쿼리로 열을 접지 않는다',
    !/@media[^{]*max-width[^{]*\{[^}]*\{[^}]*grid-template-columns/.test(stripped),
  )
  ok('§G 띠도 미디어 쿼리 대신 flex-wrap으로 접힌다', /\.painSnapshot\s*\{[^}]*flex-wrap:\s*wrap/.test(stripped))
  ok(
    '§G NRS 행이 고정폭을 우기지 않는다 (줄바꿈 허용)',
    /\.painSnapshot__rows\s*\{[^}]*max-width:\s*100%/.test(stripped),
  )
}

/* ---------------- §H 안전 칩: 모델이 내는 레벨마다 CSS가 있다 ---------------- */

/*
 * 2026-09-23: `painSafety--urgent`에 **규칙이 없었다.** 모델은 네 레벨을
 * 내보내는데 CSS에는 셋뿐이라, 가장 위험한 칩이 배경색 없이 기본 회색으로
 * 떴다 -- 가장 급한 신호가 가장 눈에 안 띄는 상태였다.
 *
 * 입력 3블록을 폐기하면서 `clinical.css`의 안전 칩 규칙을 `briefing.css`로
 * 옮기다가, 컨택트 시트에 `--urgent`가 7번 렌더되는데 CSS에 없다는 것이
 * 드러났다. 눈으로는 알아채기 어려운 종류의 결함이다 -- 칩은 글자가 보이고
 * 배치도 맞아서, 색 하나가 빠진 것은 나란히 놓고 비교해야 보인다.
 *
 * 그래서 **모델이 내는 레벨 집합과 CSS 규칙 집합을 대조**한다. 레벨을
 * 하나 더하면서 CSS를 잊으면 여기서 걸린다.
 */
{
  const css = readFileSync(join(here, '..', 'src', 'doctor', 'clinical', 'briefing.css'), 'utf8')
  const styled = new Set([...css.matchAll(/\.painSafety--([a-z]+)\s*\{/g)].map((m) => m[1]))

  // 모델이 실제로 내는 레벨을 소스에서 뽑는다 -- 손으로 적으면 모델이 늘 때 같이 안 는다.
  const model = readFileSync(join(here, '..', 'src', 'doctor', 'clinical', 'briefingModel.ts'), 'utf8')
  const emitted = new Set([...model.matchAll(/level:\s*'([a-z]+)'/g)].map((m) => m[1]))

  ok('§H 모델이 내는 안전 레벨이 넷이다 (아래 단언이 공허하지 않도록)', emitted.size === 4, `(${[...emitted].join(', ')})`)
  ok('§H CSS 규칙을 실제로 찾았다 (정규식이 죽지 않았다)', styled.size >= 3, `(${[...styled].join(', ')})`)

  const missing = [...emitted].filter((l) => !styled.has(l))
  ok('§H 모델이 내는 모든 레벨에 CSS 규칙이 있다', missing.length === 0, missing.length ? `(규칙 없음: ${missing.join(', ')})` : '')

  // 반대 방향 -- 쓰이지 않는 규칙을 남기지 않는다.
  const unused = [...styled].filter((l) => !emitted.has(l))
  ok('§H 쓰이지 않는 안전 칩 규칙이 없다', unused.length === 0, unused.length ? `(모델이 안 냄: ${unused.join(', ')})` : '')

  // urgent가 review와 다른 면으로 구분되는지 -- 같은 스타일이면 등급 구분이 사라진다.
  const ruleOf = (lvl) => {
    const m = css.match(new RegExp(`\\.painSafety--${lvl}\\s*\\{([^}]*)\\}`))
    return m ? m[1].replace(/\s+/g, ' ').trim() : null
  }
  ok('§H urgent와 review의 스타일이 다르다 (등급 구분)', ruleOf('urgent') !== null && ruleOf('urgent') !== ruleOf('review'))
}

/* ---------------- 결과 ---------------- */

if (failures.length) {
  console.error(`\n✗ pain-briefing: ${failures.length}건 실패 / ${passed}건 통과\n`)
  for (const f of failures.slice(0, 25)) console.error(`  - ${f}`)
  if (failures.length > 25) console.error(`  ... 외 ${failures.length - 25}건`)
  process.exit(1)
}
console.log(`✓ pain-briefing: ${passed}건 단언 통과 (픽스처 ${PAIN.length}개)`)
