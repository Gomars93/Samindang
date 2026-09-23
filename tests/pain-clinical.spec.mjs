/*
 * 통증 닥터뷰 입력 3블록(`clinicalModel.ts`) 회귀 고정.
 *
 * 읽기 블록 테스트(`pain-briefing.spec.mjs`)와 같은 자세로, **구조**를 붙든다.
 *
 *   §A 구조 상한 — 블록 3개, 행 문법 1개, 한 행의 칩 상한
 *   §B **도메인 분리** — 한약 카탈로그(설·맥·복)가 통증 뷰로 돌아오지 못한다
 *   §C 순수성 — 입력을 변형하지 않고, 같은 입력에 같은 출력
 *   §D **칩 항목을 지어내지 않는다** — 모든 라벨이 승인된 카탈로그에 실재한다
 *   §E 자유입력 상한 — 블록당 최대 1개
 *   §F 미기록 표시 — 미체크는 "정상"이 아니라 "아직 안 봤음"이다
 *
 * §B는 실제로 난 사고를 막는다(2026-09-22)
 * ----------------------------------------
 * 처음 구현은 SOAP 네 칸을 맞추려고 OBSERVATION 블록에 **설진 24 / 맥진 22 /
 * 복진 15**를 넣었다. 그 셋은 이 저장소에서 이미 한약 진료의 것으로 분리되어
 * 있었는데(`HerbalWorkspace`만 렌더, 상태 필드명부터
 * `herbalClinicianObservations`) 통증 뷰가 같은 카탈로그를 끌어다 쓴 것이다.
 * PO가 컨택트 시트를 보고 잡았다 -- "왜 한약이랑 통증을 섞었냐".
 *
 * 앞선 §D("칩을 지어내지 않는다")로는 **잡히지 않았다.** §D는 출처가 승인된
 * 카탈로그인지만 봤고, 그 카탈로그가 **맞는 도메인의 것인지**는 보지 않았기
 * 때문이다. 그래서 §B를 출처 검증이 아니라 **도메인 검증**으로 따로 세운다.
 *
 * 실행: `npm run test:pain-clinical` (`npm run test:all`에 포함)
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  buildClinicalBlocks,
  MAX_CLINICAL_BLOCKS,
  MAX_INLINE_CHIPS,
  EXAM_RESULT_CHIPS,
} from './.clinical-model.mjs'
/*
 * 한약 카탈로그를 **쓰려고가 아니라 없음을 증명하려고** 불러온다. 실제 라벨
 * 목록과 대조해야 §B가 공허해지지 않는다 -- 문자열 몇 개를 손으로 적어두면
 * 카탈로그가 늘어날 때 새 라벨은 그냥 통과한다.
 */
import {
  OBSERVATION_OPTIONS_BY_CATEGORY,
  TONGUE_OPTIONS,
  PULSE_OPTIONS,
  ABDOMEN_OPTIONS,
} from './.observation-options.mjs'
import { HYPOTHESIS_SUPPORT_LABEL_KO, emptyWorkingHypothesis } from './.working-hypothesis.mjs'
import { EXAM_CHECK_STATUS_LABEL, LATERALITY_LABEL } from './.provenance.mjs'
import { REHAB_SUGGESTION_STATUS_LABEL } from './.rehab-suggestion.mjs'

/*
 * 검사 결과 칩 -- **독립 카탈로그(`provenance.ts`)와 대조한다.**
 *
 * 한동안은 여기 리터럴 세 개(`['양성','음성','시행 안 함']`)가 박혀 있었다.
 * 모델이 자기 어휘를 직접 정의하던 시절, `EXAM_RESULT_CHIPS`를 import해
 * 허용 목록을 만들면 공허한 자기검증이 돼서 그랬다.
 *
 * 그런데 그 세 값 자체가 틀렸다. `ExamCheckStatus`는 이미 여섯 값이고
 * (`provenance.ts`), `시행 안 함`은 승인된 `시행 못 함`에 대한 세 번째
 * 철자였다. 즉 이 리터럴은 **틀린 것을 고정하고 있었다** -- 테스트가 틀린
 * 값을 지키면 고치는 쪽이 실패한다.
 *
 * 지금은 모델이 `EXAM_CHECK_STATUS_LABEL`을 그대로 쓰므로, 그 독립 카탈로그와
 * 대조하면 된다(자기검증이 아니다). `NOT_YET_CHECKED`만 칩에서 빠지는지를
 * 따로 단언한다 -- 그건 기본 상태이지 고를 수 있는 값이 아니다.
 */
const EXPECTED_EXAM_RESULT_CHIPS = Object.entries(EXAM_CHECK_STATUS_LABEL)
  .filter(([k]) => k !== 'NOT_YET_CHECKED')
  .map(([, v]) => v)

const here = dirname(fileURLToPath(import.meta.url))
let passed = 0
const failures = []
const ok = (label, cond, extra = '') => {
  if (cond) passed += 1
  else failures.push(`${label} ${extra}`.trim())
}

const PATTERNS = [
  { id: 'disc', labelKo: '추간판성', patientEasyLabelKo: '디스크 쪽', particleKo: '과' },
  { id: 'facet', labelKo: '후관절성', patientEasyLabelKo: '관절 쪽', particleKo: '과' },
]

const exam = (id, title, priority = 'CONTEXTUAL') => ({
  id,
  title,
  priority,
  reasonFacts: [],
  source: 'SUGGESTED',
  result: {},
})

const rehab = (id, title, status = 'SUGGESTED') => ({
  id,
  title,
  goal: '',
  rationale: '',
  sourceFacts: [],
  contraindicationFacts: [],
  source: 'SUGGESTED',
  status,
  clinicianFinalInstruction: '',
})

const emptyInput = () => ({
  exams: [exam('slr', 'SLR', 'MUST_CHECK'), exam('faber', 'FABER')],
  examResults: {},
  examLateralities: {},
  patterns: PATTERNS,
  hypothesis: emptyWorkingHypothesis(PATTERNS),
  finalAssessment: '',
  rehab: [rehab('r1', '엎드려 상체 신전')],
})

const touchedInput = () => ({
  ...emptyInput(),
  examResults: { slr: 'POSITIVE' },
  examLateralities: { slr: 'LEFT' },
  hypothesis: { supports: { disc: 'HIGHER', facet: 'LOWER' }, recordedAt: null },
  finalAssessment: '굴곡 부하에서 재현.',
  rehab: [rehab('r1', '엎드려 상체 신전', 'ACCEPTED')],
})

/* ---------------- §A 구조 상한 ---------------- */

const EXPECTED_KEYS = ['exam', 'assessment', 'plan']

for (const [name, input] of [
  ['빈 상태', emptyInput()],
  ['기록 후', touchedInput()],
]) {
  const blocks = buildClinicalBlocks(input)

  ok(`§A [${name}] 블록이 ${MAX_CLINICAL_BLOCKS}개를 넘지 않는다`, blocks.length <= MAX_CLINICAL_BLOCKS, `(${blocks.length})`)
  ok(
    `§A [${name}] 블록 키와 순서가 고정이다`,
    JSON.stringify(blocks.map((b) => b.key)) === JSON.stringify(EXPECTED_KEYS),
  )
  ok(
    `§A [${name}] 모든 블록이 eyebrow와 질문 한 줄을 가진다`,
    blocks.every((b) => b.eyebrow.length > 0 && b.question.length > 0),
  )

  const rows = blocks.flatMap((b) => b.rows)
  ok(`§A [${name}] 행이 하나 이상 있다`, rows.length > 0)
  ok(
    `§A [${name}] 모든 행이 같은 모양이다 (label/chips/key/source)`,
    rows.every(
      (r) =>
        typeof r.label === 'string' &&
        r.label.length > 0 &&
        Array.isArray(r.chips) &&
        typeof r.key === 'string' &&
        typeof r.source === 'string' &&
        r.source.length > 0,
    ),
  )
  ok(
    `§A [${name}] 한 행의 칩이 ${MAX_INLINE_CHIPS}개를 넘지 않는다`,
    rows.every((r) => r.chips.length <= MAX_INLINE_CHIPS),
    `(최대 ${Math.max(...rows.map((r) => r.chips.length))})`,
  )
  ok(
    `§A [${name}] 한 블록 안에 행 키가 중복되지 않는다`,
    blocks.every((b) => new Set(b.rows.map((r) => r.key)).size === b.rows.length),
  )
  ok(
    `§A [${name}] 모든 칩이 라벨과 선택 상태를 가진다`,
    rows.flatMap((r) => r.chips).every((c) => typeof c.label === 'string' && c.label.length > 0 && typeof c.selected === 'boolean'),
  )
}

/* ---------------- §B 도메인 분리 (한약 카탈로그 차단) ---------------- */

/*
 * 통증 뷰는 설진·맥진·복진을 쓰지 않는다. PO 확인(2026-09-22): 통증 진료에서
 * 맥진을 하지 않는다. 그 셋의 실제 저장 경로는 `HerbalWorkspace` 쪽
 * `herbalClinicianObservations`이고, 여기서는 **양쪽 방향으로** 막는다:
 *
 *   (1) 출력 — 모델이 내보내는 칩 라벨에 설·맥·복 라벨이 하나도 없다
 *   (2) 소스 — 모델 파일이 한약 카탈로그를 import하지도, 라벨을 적지도 않는다
 *
 * (1)만으로는 부족하다: 블록을 조건부로 만들어두면 어떤 입력에서만 나타나고
 * 이 테스트의 두 픽스처는 통과한다. (2)만으로도 부족하다: 라벨을 다른 파일로
 * 옮겨 재수출하면 소스 스캔을 피한다. 둘 다 있어야 한다.
 */

const HERBAL_LABELS = [
  ...TONGUE_OPTIONS,
  ...PULSE_OPTIONS,
  ...ABDOMEN_OPTIONS,
].map((o) => o.label)

/*
 * 소스에 라벨이 "적혀 있는가"를 판정하는 방법.
 *
 * 단순 `src.includes(label)`로는 못 한다 -- 맥 라벨의 절반이 **한 글자**라
 * (부·침·삭·지·활·세·현…) 평범한 한국어 주석·식별자에 걸린다. 실제로 `지`가
 * `지어내지`에 걸려 처음 실행이 실패했다.
 *
 * 그래서 카탈로그 라벨이 코드에 들어올 때의 실제 모양만 본다:
 *   - 문자열 리터럴  '침'  "침"  `침`
 *   - JSX 텍스트     >침<
 * 두 글자 이상은 오탐 위험이 없으므로 그냥 포함 여부로도 본다(문자열 조합·
 * 템플릿 보간까지 잡기 위해).
 */
const escapeRe = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const writtenIn = (src, label) => {
  if (label.length >= 2 && src.includes(label)) return true
  const l = escapeRe(label)
  return new RegExp(`(['"\`]${l}['"\`]|>${l}<)`).test(src)
}

// 매처 자체가 죽어 있지 않은지 -- 심어 넣은 라벨을 실제로 잡는지 본다.
ok(
  '§B 라벨 매처가 살아 있다 (심어 넣은 라벨을 잡는다)',
  writtenIn("const x = '침'", '침') &&
    writtenIn('<span>지</span>', '지') &&
    writtenIn("const y = '담백설'", '담백설') &&
    // 그리고 평범한 한국어에는 걸리지 않는다 -- 이게 위 실패의 원인이었다.
    !writtenIn('// 칩을 지어내지 않는다', '지'),
)

ok(
  '§B 한약 카탈로그가 실제로 비어 있지 않다 (아래 단언들이 공허하지 않도록)',
  HERBAL_LABELS.length >= 50 && TONGUE_OPTIONS.length > 0 && PULSE_OPTIONS.length > 0 && ABDOMEN_OPTIONS.length > 0,
  `(${HERBAL_LABELS.length}개)`,
)

// (1) 출력 방향.
for (const [name, input] of [
  ['빈 상태', emptyInput()],
  ['기록 후', touchedInput()],
]) {
  const blocks = buildClinicalBlocks(input)
  ok(`§B [${name}] 소견(observation) 블록이 없다`, !blocks.some((b) => b.key === 'observation'), `(${blocks.map((b) => b.key).join(', ')})`)

  const emitted = new Set(blocks.flatMap((b) => b.rows).flatMap((r) => r.chips).map((c) => c.label))
  const leaked = HERBAL_LABELS.filter((l) => emitted.has(l))
  ok(`§B [${name}] 설·맥·복 칩이 하나도 나오지 않는다`, leaked.length === 0, leaked.length ? `(샌 것: ${leaked.join(', ')})` : '')

  const rowLabels = new Set(blocks.flatMap((b) => b.rows).map((r) => r.label))
  ok(
    `§B [${name}] 설진/맥진/복진 행 자체가 없다`,
    !['설진', '맥진', '복진'].some((l) => rowLabels.has(l)),
    `(${[...rowLabels].join(', ')})`,
  )
}

// (2) 소스 방향.
const modelSrc = readFileSync(join(here, '..', 'src', 'doctor', 'clinical', 'clinicalModel.ts'), 'utf8')
const viewSrc = readFileSync(join(here, '..', 'src', 'doctor', 'clinical', 'ClinicalBlocks.tsx'), 'utf8')

/*
 * 주석은 떼고 본다 -- 이 파일 헤더가 "설진·맥진·복진을 넣었던 것이 잘못이었다"고
 * 설명하고 있어서, 주석째로 스캔하면 그 설명 자체에 걸린다.
 */
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

for (const [name, src] of [
  ['clinicalModel.ts', stripComments(modelSrc)],
  ['ClinicalBlocks.tsx', stripComments(viewSrc)],
]) {
  ok(`§B [${name}] observationOptions를 import하지 않는다`, !/from '.*observationOptions'/.test(src))
  ok(`§B [${name}] ClinicianObservation\* 를 참조하지 않는다`, !/ClinicianObservation/.test(src))
  const written = HERBAL_LABELS.filter((l) => writtenIn(src, l))
  ok(`§B [${name}] 설·맥·복 라벨을 직접 적지 않는다`, written.length === 0, written.length ? `(적힌 것: ${written.join(', ')})` : '')
  ok(`§B [${name}] TONGUE/PULSE/ABDOMEN 카테고리 키를 쓰지 않는다`, !/\b(TONGUE|PULSE|ABDOMEN)\b/.test(src))
}

/*
 * 위 스캔이 주석 제거 때문에 전부 무력해지지 않았는지 확인한다 -- `stripComments`가
 * 파일을 통째로 비워버리면 모든 단언이 공허하게 통과한다.
 */
ok(
  '§B 주석 제거 후에도 소스에 코드가 남아 있다 (스캔이 공허하지 않도록)',
  stripComments(modelSrc).includes('buildClinicalBlocks') && stripComments(viewSrc).includes('ClinicalBlocks'),
)

/* ---------------- §C 순수성 ---------------- */

{
  const input = touchedInput()
  const before = JSON.stringify(input)
  buildClinicalBlocks(input)
  buildClinicalBlocks(input)
  ok('§C 입력을 변형하지 않는다', JSON.stringify(input) === before)
  ok(
    '§C 같은 입력에 같은 출력 (결정적)',
    JSON.stringify(buildClinicalBlocks(input)) === JSON.stringify(buildClinicalBlocks(input)),
  )
}

/* ---------------- §D 칩 항목을 지어내지 않는다 ---------------- */

/*
 * 모든 칩 라벨이 **승인된 카탈로그**에 실재해야 한다. 이 파일이 새 임상
 * 항목이나 새 판정값을 만드는 순간 여기서 걸린다.
 */
ok(
  '§D 검사 결과 칩이 승인된 enum 라벨 그대로다 (모델이 어휘를 새로 만들지 못한다)',
  JSON.stringify([...EXAM_RESULT_CHIPS]) === JSON.stringify(EXPECTED_EXAM_RESULT_CHIPS),
  `(${[...EXAM_RESULT_CHIPS].join(' / ')})`,
)
ok(
  '§D 대조 대상이 실제로 여섯 값짜리 enum이다 (공허하지 않도록)',
  Object.keys(EXAM_CHECK_STATUS_LABEL).length === 6 && EXPECTED_EXAM_RESULT_CHIPS.length === 5,
  `(${Object.keys(EXAM_CHECK_STATUS_LABEL).length} / ${EXPECTED_EXAM_RESULT_CHIPS.length})`,
)
ok(
  '§D `아직 확인 안 됨`은 칩으로 나오지 않는다 (기본 상태이지 고를 수 있는 값이 아니다)',
  ![...EXAM_RESULT_CHIPS].includes(EXAM_CHECK_STATUS_LABEL.NOT_YET_CHECKED),
)
ok(
  '§D 칩의 value는 라벨이 아니라 enum 값이다 (호출부가 result.status에 그대로 넣는다)',
  (() => {
    const row = buildClinicalBlocks(emptyInput()).find((b) => b.key === 'exam').rows[0]
    const values = row.chips.map((c) => c.value)
    return JSON.stringify(values) === JSON.stringify(['POSITIVE', 'NEGATIVE', 'UNCLEAR', 'LIMITED', 'NOT_PERFORMED'])
  })(),
)

/*
 * 한약 카탈로그(`OBSERVATION_OPTIONS_BY_CATEGORY`)는 **일부러 빼놨다.** 예전엔
 * 여기 들어 있었고, 그래서 설·맥·복 칩이 통증 뷰에 떠도 §D가 통과했다. 지금은
 * 그 라벨이 하나라도 나오면 아래 "정체불명" 단언에 걸리고, §B가 같은 것을
 * 소스 쪽에서 한 번 더 막는다.
 */
const ALLOWED_LABELS = new Set([
  ...Object.values(HYPOTHESIS_SUPPORT_LABEL_KO),
  // 좌/우는 `provenance.ts`의 독립 카탈로그다 -- 모델이 정의하지 않으므로
  // import해 대조해도 자기검증이 되지 않는다.
  ...Object.values(LATERALITY_LABEL),
  ...Object.values(REHAB_SUGGESTION_STATUS_LABEL),
  // 모델이 아니라 위 리터럴을 쓴다 -- import하면 자기 검증이 된다.
  ...EXPECTED_EXAM_RESULT_CHIPS,
])
ok('§D 허용 라벨 집합이 비어 있지 않다 (공허하지 않도록)', ALLOWED_LABELS.size >= 7, `(${ALLOWED_LABELS.size}개)`)
ok(
  '§D 허용 목록에 한약 카탈로그가 섞여 있지 않다',
  !Object.values(OBSERVATION_OPTIONS_BY_CATEGORY).flat().some((o) => ALLOWED_LABELS.has(o.label)),
)

for (const [name, input] of [
  ['빈 상태', emptyInput()],
  ['기록 후', touchedInput()],
]) {
  const labels = buildClinicalBlocks(input)
    .flatMap((b) => b.rows)
    .flatMap((r) => r.chips)
    .map((c) => c.label)
  const unknown = [...new Set(labels)].filter((l) => !ALLOWED_LABELS.has(l))
  ok(`§D [${name}] 카탈로그에 없는 칩 라벨이 없다`, unknown.length === 0, unknown.length ? `(정체불명: ${unknown.join(', ')})` : '')
}

// 소스 표기도 카탈로그를 가리켜야 한다.
{
  const rows = buildClinicalBlocks(emptyInput()).flatMap((b) => b.rows)
  ok(
    '§D 모든 행이 출처를 카탈로그로 표기한다',
    rows.every((r) => /^(examSuggestion|workingHypothesis|rehabSuggestion|provenance)\./.test(r.source)),
    `(${[...new Set(rows.map((r) => r.source.split('.')[0]))].join(', ')})`,
  )
}

// 모델이 검사·판단·처치 카탈로그는 계속 import하는지 본다(§B의 반대 방향).
ok('§D 모델이 판단 카탈로그를 import한다', /from '\.\.\/workspace\/workingHypothesis'/.test(modelSrc))
ok('§D 모델이 처치 카탈로그를 import한다', /from '\.\.\/workspace\/rehabSuggestion'/.test(modelSrc))

/* ---------------- §E 자유입력 상한 ---------------- */

for (const [name, input] of [
  ['빈 상태', emptyInput()],
  ['기록 후', touchedInput()],
]) {
  const blocks = buildClinicalBlocks(input)
  const withNote = blocks.filter((b) => b.note != null)
  ok(
    `§E [${name}] 자유입력이 있는 블록은 최대 1개다`,
    withNote.length <= 1,
    `(${withNote.map((b) => b.key).join(', ')})`,
  )
  ok(
    `§E [${name}] 블록당 자유입력은 1개를 넘지 않는다`,
    blocks.every((b) => b.note == null || typeof b.note.value === 'string'),
  )
  ok(`§E [${name}] 자유입력은 판단 블록에만 있다`, withNote.every((b) => b.key === 'assessment'))
}

/* ---------------- §F 미기록 표시 ---------------- */

{
  const empty = buildClinicalBlocks(emptyInput())
  const emptyRows = empty.flatMap((b) => b.rows)
  ok('§F 빈 상태에서는 모든 행이 untouched다', emptyRows.every((r) => r.untouched === true))
  ok('§F 빈 상태에서는 선택된 칩이 하나도 없다', emptyRows.flatMap((r) => r.chips).every((c) => !c.selected))

  const touched = buildClinicalBlocks(touchedInput())
  const touchedRows = touched.flatMap((b) => b.rows)
  ok('§F 기록 후에는 untouched가 아닌 행이 있다', touchedRows.some((r) => r.untouched === false))
  ok('§F 기록 후에는 선택된 칩이 있다', touchedRows.flatMap((r) => r.chips).some((c) => c.selected))

  // 손대지 않은 행은 여전히 untouched -- 다른 행을 기록해도 번지지 않는다.
  // `touchedInput`은 slr만 기록하므로 faber는 그대로 미기록이어야 한다.
  const faber = touched.find((b) => b.key === 'exam').rows.find((r) => r.key === 'faber')
  ok('§F 기록하지 않은 행은 여전히 untouched다 (FABER)', faber.untouched === true)

  // "시행 안 함"도 기록이다 -- "봤는데 안 했다"와 "아직 안 봄"은 다르다.
  const notDone = buildClinicalBlocks({ ...emptyInput(), examResults: { faber: 'NOT_PERFORMED' } })
  const faber2 = notDone.find((b) => b.key === 'exam').rows.find((r) => r.key === 'faber')
  ok('§F `시행 못 함`을 기록하면 untouched가 아니다 ("확인함" ≠ "아직 안 봄")', faber2.untouched === false)

  // 명시적 NOT_YET_CHECKED는 "아직 안 봄"과 같다 -- 호출부가 result.status를
  // 그대로 넘기므로 이 값이 실제로 들어온다.
  const explicitPending = buildClinicalBlocks({ ...emptyInput(), examResults: { faber: 'NOT_YET_CHECKED' } })
  const faber3 = explicitPending.find((b) => b.key === 'exam').rows.find((r) => r.key === 'faber')
  ok('§F NOT_YET_CHECKED는 untouched다', faber3.untouched === true)
  ok('§F NOT_YET_CHECKED에서는 어떤 칩도 켜지지 않는다', faber3.chips.every((c) => !c.selected))
}

// 제안이 없는 블록은 자리를 차지하지 않는다 -- 단, 원장이 직접 쓰는 곳은 남는다.
{
  const noSuggestions = buildClinicalBlocks({ ...emptyInput(), exams: [], rehab: [] })
  const keys = noSuggestions.map((b) => b.key)
  ok('§F 제안 없는 검사 블록은 빠진다', !keys.includes('exam'))
  ok('§F 제안 없는 처치 블록은 빠진다', !keys.includes('plan'))
  ok('§F 판단 블록은 비어도 남는다 (원장 입력 자리)', keys.includes('assessment'))
  ok('§F 그래도 소견 블록이 되살아나지는 않는다', !keys.includes('observation'), `(${keys.join(', ')})`)
}

/* ---------------- §G 좌/우 (PO 확정 2026-09-23) ---------------- */

/*
 * 기존 화면(`ExamSuggestionCard`의 `workspace__lateralityRow`)에 이미 있는
 * 입력이다. 이 모델이 그 카드를 대체할 때 **떨어뜨리면 안 되는 값**이라
 * 배선 전에 먼저 채웠다.
 *
 * 어휘는 `provenance.ts`의 `LATERALITY_LABEL` 그대로 쓴다 -- 검사 결과
 * 어휘에서 겪은 "승인된 enum과 평행한 어휘를 새로 만드는" 사고를 되풀이하지
 * 않는다(§D 참고).
 */
{
  ok(
    '§G 좌/우 카탈로그가 네 값이다 (아래 단언이 공허하지 않도록)',
    Object.keys(LATERALITY_LABEL).length === 4,
    `(${Object.keys(LATERALITY_LABEL).join(', ')})`,
  )

  const examRows = (input) => buildClinicalBlocks(input).find((b) => b.key === 'exam').rows

  // 미확인 검사에는 좌우 행이 붙지 않는다 -- 순서가 거꾸로이고 행이 두 배가 된다.
  const blank = examRows(emptyInput())
  ok('§G 빈 상태에서는 좌우 행이 하나도 없다', blank.every((r) => !r.key.endsWith('::laterality')), `(${blank.length}행)`)
  ok('§G 빈 상태에서도 검사 결과 행은 있다 (위 단언이 "행이 없다"를 뜻하지 않도록)', blank.length === 2)

  // 결과를 기록한 항목에만 붙는다.
  const oneChecked = examRows({ ...emptyInput(), examResults: { slr: 'POSITIVE' } })
  const latRows = oneChecked.filter((r) => r.key.endsWith('::laterality'))
  ok('§G 결과를 기록한 항목에만 좌우 행이 붙는다', latRows.length === 1, `(${latRows.length}개)`)
  ok('§G 그 행은 기록한 항목의 것이다', latRows[0]?.key === 'slr::laterality')
  ok('§G 라벨이 어느 검사인지 말한다', latRows[0]?.label === 'SLR 좌우')

  // 칩은 좌·우·양측 셋. `해당 없음`은 기본 상태이지 고를 수 있는 값이 아니다.
  ok(
    '§G 좌우 칩이 좌·우·양측 셋이다',
    JSON.stringify(latRows[0]?.chips.map((c) => c.label)) ===
      JSON.stringify([LATERALITY_LABEL.LEFT, LATERALITY_LABEL.RIGHT, LATERALITY_LABEL.BILATERAL]),
    `(${latRows[0]?.chips.map((c) => c.label).join(', ')})`,
  )
  ok(
    '§G `해당 없음`은 칩으로 나오지 않는다 (기본 상태이지 고를 수 있는 값이 아니다)',
    !latRows[0]?.chips.some((c) => c.label === LATERALITY_LABEL.NOT_APPLICABLE),
  )
  ok(
    '§G 칩의 value는 라벨이 아니라 enum 값이다 (호출부가 result.laterality에 그대로 넣는다)',
    JSON.stringify(latRows[0]?.chips.map((c) => c.value)) === JSON.stringify(['LEFT', 'RIGHT', 'BILATERAL']),
  )

  // 미기록 / 기록 구분.
  ok('§G 좌우 미기록이면 untouched다', latRows[0]?.untouched === true)
  ok('§G 좌우 미기록이면 선택된 칩이 없다', latRows[0]?.chips.every((c) => !c.selected))

  const recorded = examRows(touchedInput()).find((r) => r.key === 'slr::laterality')
  ok('§G 좌우를 기록하면 untouched가 아니다', recorded?.untouched === false)
  ok('§G 기록한 쪽 칩이 켜진다', recorded?.chips.find((c) => c.value === 'LEFT')?.selected === true)
  ok('§G 다른 쪽 칩은 꺼져 있다', recorded?.chips.find((c) => c.value === 'RIGHT')?.selected === false)

  // 명시적 NOT_APPLICABLE은 미기록과 같다.
  const na = examRows({ ...emptyInput(), examResults: { slr: 'POSITIVE' }, examLateralities: { slr: 'NOT_APPLICABLE' } })
    .find((r) => r.key === 'slr::laterality')
  ok('§G 명시적 `NOT_APPLICABLE`은 untouched다', na?.untouched === true)

  // 행 키가 검사 결과 행과 충돌하지 않는다(§A의 중복 키 단언과 다른 축).
  const all = examRows(touchedInput())
  ok('§G 좌우 행 키가 검사 결과 행 키와 겹치지 않는다', new Set(all.map((r) => r.key)).size === all.length)
}

/* ---------------- 결과 ---------------- */

if (failures.length) {
  console.error(`\n✗ pain-clinical: ${failures.length}건 실패 / ${passed}건 통과\n`)
  for (const f of failures.slice(0, 25)) console.error(`  - ${f}`)
  process.exit(1)
}
console.log(`✓ pain-clinical: ${passed}건 단언 통과`)
