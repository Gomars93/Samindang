/*
 * 통증 닥터뷰 입력 4블록(`clinicalModel.ts`) 회귀 고정.
 *
 * 읽기 블록 테스트(`pain-briefing.spec.mjs`)와 같은 자세로, **구조**를 붙든다.
 *
 *   §A 구조 상한 — 블록 4개, 행 문법 1개, 한 행의 인라인 칩 상한
 *   §B 3층 흡수 — 1층은 펼치고 2층은 `＋ 전체` 뒤로, **선택된 2층은 접지 않는다**
 *   §C 순수성 — 입력을 변형하지 않고, 같은 입력에 같은 출력
 *   §D **칩 항목을 지어내지 않는다** — 모든 라벨이 승인된 카탈로그에 실재한다
 *   §E 자유입력 상한 — 블록당 최대 1개
 *   §F 미기록 표시 — 미체크는 "정상"이 아니라 "아직 안 봤음"이다
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
  NO_FINDING_VALUE,
} from './.clinical-model.mjs'
import {
  OBSERVATION_OPTIONS_BY_CATEGORY,
  TONGUE_OPTIONS,
  PULSE_OPTIONS,
  ABDOMEN_OPTIONS,
} from './.observation-options.mjs'
import { HYPOTHESIS_SUPPORT_LABEL_KO, emptyWorkingHypothesis } from './.working-hypothesis.mjs'
import { REHAB_SUGGESTION_STATUS_LABEL } from './.rehab-suggestion.mjs'

/*
 * 검사 결과 칩만은 **테스트에 리터럴로 박는다.**
 *
 * 다른 라벨(설·맥·복, 가설 지지도, 처치 상태)은 전부 독립된 카탈로그에서
 * 오므로 그걸 import해 대조하면 된다. 그런데 검사 결과 세 칩은 모델 자신이
 * 정의하는 유일한 라벨 집합이라, `EXAM_RESULT_CHIPS`를 import해서 허용
 * 목록을 만들면 **모델이 칩을 늘릴 때 허용 목록도 같이 늘어난다** -- 자기
 * 자신을 검증하는 공허한 단언이다. 실제로 뮤테이션('애매함' 추가)이 통과했고
 * 그래서 여기 박았다. 이 셋을 바꾸려면 이 줄도 함께 고쳐야 한다(= 의도한
 * 변경임을 사람이 한 번 더 확인하게 된다).
 */
const EXPECTED_EXAM_RESULT_CHIPS = ['양성', '음성', '시행 안 함']

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
  observation: { TONGUE: '', PULSE: '', ABDOMEN: '' },
  exams: [exam('slr', 'SLR', 'MUST_CHECK'), exam('faber', 'FABER')],
  examResults: {},
  patterns: PATTERNS,
  hypothesis: emptyWorkingHypothesis(PATTERNS),
  finalAssessment: '',
  rehab: [rehab('r1', '엎드려 상체 신전')],
})

const touchedInput = () => ({
  ...emptyInput(),
  observation: { TONGUE: `${TONGUE_OPTIONS[0].label} · ${TONGUE_OPTIONS[3].label}`, PULSE: PULSE_OPTIONS[1].label, ABDOMEN: '' },
  examResults: { slr: '양성' },
  hypothesis: { supports: { disc: 'HIGHER', facet: 'LOWER' }, recordedAt: null },
  finalAssessment: '굴곡 부하에서 재현.',
  rehab: [rehab('r1', '엎드려 상체 신전', 'ACCEPTED')],
})

/* ---------------- §A 구조 상한 ---------------- */

const EXPECTED_KEYS = ['observation', 'exam', 'assessment', 'plan']

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
        Array.isArray(r.overflowChips) &&
        typeof r.key === 'string' &&
        typeof r.source === 'string' &&
        r.source.length > 0,
    ),
  )
  ok(
    `§A [${name}] 한 행의 인라인 칩이 ${MAX_INLINE_CHIPS}개를 넘지 않는다`,
    rows.every((r) => r.chips.length <= MAX_INLINE_CHIPS),
    `(최대 ${Math.max(...rows.map((r) => r.chips.length))})`,
  )
  ok(
    `§A [${name}] 한 블록 안에 행 키가 중복되지 않는다`,
    blocks.every((b) => new Set(b.rows.map((r) => r.key)).size === b.rows.length),
  )
  ok(
    `§A [${name}] 모든 칩이 라벨과 선택 상태를 가진다`,
    rows.flatMap((r) => [...r.chips, ...r.overflowChips]).every((c) => typeof c.label === 'string' && c.label.length > 0 && typeof c.selected === 'boolean'),
  )
}

/* ---------------- §B 3층 흡수 ---------------- */

{
  const blocks = buildClinicalBlocks(emptyInput())
  const obs = blocks.find((b) => b.key === 'observation')
  const tongue = obs.rows.find((r) => r.key === 'TONGUE')

  ok('§B 설진 행에 2층(`＋ 전체`)이 있다', tongue.overflowChips.length > 0, `(${tongue.overflowChips.length}개)`)
  ok(
    '§B 인라인 + 2층 = 카탈로그 전체 (칩이 사라지지 않는다)',
    tongue.chips.length + tongue.overflowChips.length === TONGUE_OPTIONS.length,
    `(${tongue.chips.length} + ${tongue.overflowChips.length} vs ${TONGUE_OPTIONS.length})`,
  )
  ok(
    '§B 인라인·2층에 같은 칩이 중복되지 않는다',
    new Set([...tongue.chips, ...tongue.overflowChips].map((c) => c.label)).size === TONGUE_OPTIONS.length,
  )
  ok(
    '§B 인라인은 1층 우선이다',
    tongue.chips.every((c) => TONGUE_OPTIONS.find((o) => o.label === c.label)?.tier === 1),
  )
}

{
  /*
   * 선택된 2층 칩은 접지 않는다 -- 기록한 소견이 `＋ 전체` 뒤에 숨으면
   * 원장이 자기가 뭘 체크했는지 못 본다.
   */
  const tier2 = TONGUE_OPTIONS.find((o) => o.tier === 2)
  ok('§B 설진 카탈로그에 2층 항목이 실제로 있다 (아래 단언이 공허하지 않도록)', tier2 != null)
  if (tier2) {
    const input = { ...emptyInput(), observation: { TONGUE: tier2.label, PULSE: '', ABDOMEN: '' } }
    const tongue = buildClinicalBlocks(input).find((b) => b.key === 'observation').rows.find((r) => r.key === 'TONGUE')
    const inlineLabels = tongue.chips.map((c) => c.label)
    ok('§B 선택된 2층 칩은 인라인으로 올라온다', inlineLabels.includes(tier2.label), `(${tier2.label})`)
    ok('§B 그 칩은 selected다', tongue.chips.find((c) => c.label === tier2.label)?.selected === true)
    ok('§B 그래도 인라인 상한은 지킨다', tongue.chips.length <= MAX_INLINE_CHIPS)
  }
}

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
  '§D 검사 결과 칩이 정확히 세 개다 (모델이 몰래 늘리지 못한다)',
  JSON.stringify([...EXAM_RESULT_CHIPS]) === JSON.stringify(EXPECTED_EXAM_RESULT_CHIPS),
  `(${[...EXAM_RESULT_CHIPS].join(', ')})`,
)

const ALLOWED_LABELS = new Set([
  ...Object.values(OBSERVATION_OPTIONS_BY_CATEGORY).flat().map((o) => o.label),
  ...Object.values(HYPOTHESIS_SUPPORT_LABEL_KO),
  ...Object.values(REHAB_SUGGESTION_STATUS_LABEL),
  // 모델이 아니라 위 리터럴을 쓴다 -- import하면 자기 검증이 된다.
  ...EXPECTED_EXAM_RESULT_CHIPS,
  NO_FINDING_VALUE,
])
ok('§D 허용 라벨 집합이 충분히 크다 (공허하지 않도록)', ALLOWED_LABELS.size > 50, `(${ALLOWED_LABELS.size}개)`)

for (const [name, input] of [
  ['빈 상태', emptyInput()],
  ['기록 후', touchedInput()],
]) {
  const labels = buildClinicalBlocks(input)
    .flatMap((b) => b.rows)
    .flatMap((r) => [...r.chips, ...r.overflowChips])
    .map((c) => c.label)
  const unknown = [...new Set(labels)].filter((l) => !ALLOWED_LABELS.has(l))
  ok(`§D [${name}] 카탈로그에 없는 칩 라벨이 없다`, unknown.length === 0, unknown.length ? `(정체불명: ${unknown.join(', ')})` : '')
}

// 소스 표기도 카탈로그를 가리켜야 한다.
{
  const rows = buildClinicalBlocks(emptyInput()).flatMap((b) => b.rows)
  ok(
    '§D 모든 행이 출처를 카탈로그로 표기한다',
    rows.every((r) => /^(observationOptions|examSuggestion|workingHypothesis|rehabSuggestion)\./.test(r.source)),
    `(${[...new Set(rows.map((r) => r.source.split('.')[0]))].join(', ')})`,
  )
}

// 모델이 한글 임상 라벨을 직접 써 넣지 않는지 소스에서도 본다.
const modelSrc = readFileSync(join(here, '..', 'src', 'doctor', 'clinical', 'clinicalModel.ts'), 'utf8')
ok('§D 모델이 카탈로그를 import한다', /from '\.\.\/workspace\/observationOptions'/.test(modelSrc))
ok(
  '§D 모델이 설·맥·복 칩 라벨을 직접 하드코딩하지 않는다',
  !PULSE_OPTIONS.some((o) => new RegExp(`'${o.label}'`).test(modelSrc)),
)

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
  ok('§F 빈 상태에서는 선택된 칩이 하나도 없다', emptyRows.flatMap((r) => [...r.chips, ...r.overflowChips]).every((c) => !c.selected))

  const touched = buildClinicalBlocks(touchedInput())
  const touchedRows = touched.flatMap((b) => b.rows)
  ok('§F 기록 후에는 untouched가 아닌 행이 있다', touchedRows.some((r) => r.untouched === false))
  ok('§F 기록 후에는 선택된 칩이 있다', touchedRows.flatMap((r) => [...r.chips, ...r.overflowChips]).some((c) => c.selected))

  // 손대지 않은 행은 여전히 untouched -- 다른 행을 기록해도 번지지 않는다.
  const abdomen = touched.find((b) => b.key === 'observation').rows.find((r) => r.key === 'ABDOMEN')
  ok('§F 기록하지 않은 행은 여전히 untouched다 (복진)', abdomen.untouched === true)

  // `특이없음`은 untouched를 해제한다 -- "봤는데 정상"과 "아직 안 봄"의 구분.
  const noFinding = buildClinicalBlocks({
    ...emptyInput(),
    observation: { TONGUE: NO_FINDING_VALUE, PULSE: '', ABDOMEN: '' },
  })
  const tongue = noFinding.find((b) => b.key === 'observation').rows.find((r) => r.key === 'TONGUE')
  ok('§F `특이없음`을 기록하면 untouched가 아니다 ("봤는데 정상" ≠ "아직 안 봄")', tongue.untouched === false)
}

// 제안이 없는 블록은 자리를 차지하지 않는다 -- 단, 원장이 직접 쓰는 곳은 남는다.
{
  const noSuggestions = buildClinicalBlocks({ ...emptyInput(), exams: [], rehab: [] })
  const keys = noSuggestions.map((b) => b.key)
  ok('§F 제안 없는 검사 블록은 빠진다', !keys.includes('exam'))
  ok('§F 제안 없는 처치 블록은 빠진다', !keys.includes('plan'))
  ok('§F 소견 블록은 비어도 남는다 (원장 입력 자리)', keys.includes('observation'))
  ok('§F 판단 블록은 비어도 남는다 (원장 입력 자리)', keys.includes('assessment'))
}

/* ---------------- 결과 ---------------- */

if (failures.length) {
  console.error(`\n✗ pain-clinical: ${failures.length}건 실패 / ${passed}건 통과\n`)
  for (const f of failures.slice(0, 25)) console.error(`  - ${f}`)
  process.exit(1)
}
console.log(`✓ pain-clinical: ${passed}건 단언 통과`)
