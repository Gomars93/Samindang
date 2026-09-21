/*
 * 설진·맥진·복진 체크 항목 — 카탈로그 + 직렬화 계약 (PR-B1, 2026-09-21).
 *
 * 이 파일이 지키는 것 중 가장 중요한 것은 §C **왕복(round-trip)**이다.
 * 이번 배치는 `ClinicianObservationItem.value`(자유 문자열)를 그대로 두고
 * 칩 선택을 그 문자열로 직렬화하는 방식을 택했다 — 타입을 바꾸지 않아
 * persistence·EMR 조립기가 무변경이지만, 그 대가로 **문자열 파싱이 틀리면
 * 기존에 원장이 자유입력으로 적어둔 소견이 조용히 사라진다.** 그래서
 * 파싱/직렬화는 산문 주장이 아니라 여기서 실제 문자열로 고정한다.
 *
 * §D는 CLAUDE.md의 "임상 규칙 창작 금지"를 코드로 감시한다 — 툴팁에 변증
 * 귀속이 들어가지 않았는지.
 *
 * `npm run test:observation-options` (test:all에 포함).
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  TONGUE_OPTIONS,
  PULSE_OPTIONS,
  ABDOMEN_OPTIONS,
  OBSERVATION_OPTIONS_BY_CATEGORY,
  OBSERVATION_SEPARATOR,
  NO_FINDING_VALUE,
  parseObservationValue,
  formatObservationValue,
  toggleObservationChip,
} from './.observation-options-bundle.mjs'
import {
  PROMOTION_THRESHOLD,
  emptyPromotionState,
  recordTier2Use,
  promotionCandidate,
  acceptPromotion,
  declinePromotion,
  loadPromotionState,
  savePromotionState,
} from './.observation-promotion-bundle.mjs'

let passed = 0
const check = (name, cond, extra = '') => {
  assert.ok(cond, `${name} ${extra}`)
  passed += 1
  console.log(`OK: ${name}`)
}

/* ---------------- §A 카탈로그 구성 ---------------- */

const tier1 = (opts) => opts.filter((o) => o.tier === 1)
check('A-1 설진 1층은 PO 확정대로 8칸', tier1(TONGUE_OPTIONS).length === 8, `(${tier1(TONGUE_OPTIONS).length})`)
check('A-2 맥진 1층은 PO 확정대로 9칸', tier1(PULSE_OPTIONS).length === 9, `(${tier1(PULSE_OPTIONS).length})`)
check('A-3 복진 1층은 PO 확정대로 6칸', tier1(ABDOMEN_OPTIONS).length === 6, `(${tier1(ABDOMEN_OPTIONS).length})`)
check(
  'A-4 1층 합계 23칸 — 화면 부하는 오직 이 숫자로만 결정된다',
  tier1(TONGUE_OPTIONS).length + tier1(PULSE_OPTIONS).length + tier1(ABDOMEN_OPTIONS).length === 23,
)
const all = [...TONGUE_OPTIONS, ...PULSE_OPTIONS, ...ABDOMEN_OPTIONS]
check('A-5 2층이 실제로 존재한다 (＋ 전체가 빈 서랍이 아니다)', all.filter((o) => o.tier === 2).length >= 25)
check('A-6 모든 항목에 툴팁이 있다 (빈 툴팁으로 호버가 죽지 않게)', all.every((o) => o.tooltip.trim().length >= 10))
check(
  'A-7 카테고리 안에서 라벨이 중복되지 않는다 — 라벨이 곧 저장값이므로 중복은 파싱 모호성',
  Object.values(OBSERVATION_OPTIONS_BY_CATEGORY).every(
    (opts) => new Set(opts.map((o) => o.label)).size === opts.length,
  ),
)
// 구분자는 ` · `(공백-가운뎃점-공백)이지 `·` 하나가 아니다. `치흔·반대`처럼
// 공백 없는 가운뎃점을 품은 라벨은 쪼개지지 않으므로 허용된다 — 금지되는
// 것은 공백까지 포함한 구분자 전체를 라벨이 품는 경우뿐이다.
check(
  'A-8 라벨에 구분자(공백 포함)가 들어 있지 않다 — 들어가면 자기 자신이 두 토큰으로 쪼개진다',
  all.every((o) => !o.label.includes(OBSERVATION_SEPARATOR)),
)
// A-8의 산문 주장을 실제로 증명한다: 62개 라벨 하나하나가 단독으로
// 직렬화→파싱했을 때 정확히 자기 자신 한 칩으로 돌아오는지. 공백 없는
// 가운뎃점을 품은 라벨(치흔·반대, 결대·부정 …)이 여기서 실제로 검증된다.
check(
  'A-8b 모든 라벨이 단독 왕복에서 정확히 자기 자신 한 칩으로 복원된다',
  Object.values(OBSERVATION_OPTIONS_BY_CATEGORY).every((opts) =>
    opts.every((o) => {
      const p = parseObservationValue(formatObservationValue({ selected: [o.label], freeText: '', noFinding: false }), opts)
      return p.selected.length === 1 && p.selected[0] === o.label && p.freeText === ''
    }),
  ),
)
// 두 칩 조합도 마찬가지로 전수 확인한다 — 가운뎃점 라벨끼리 이어붙었을 때가
// 가장 깨지기 쉬운 자리다 (`치흔·반대 · 무태·박락`).
check(
  'A-8c 같은 카테고리 안의 모든 두 칩 조합이 왕복에서 정확히 두 칩으로 복원된다',
  Object.values(OBSERVATION_OPTIONS_BY_CATEGORY).every((opts) =>
    opts.every((a, i) =>
      opts.slice(i + 1).every((b) => {
        const v = formatObservationValue({ selected: [a.label, b.label], freeText: '', noFinding: false })
        const p = parseObservationValue(v, opts)
        return p.selected.length === 2 && p.selected[0] === a.label && p.selected[1] === b.label && p.freeText === ''
      }),
    ),
  ),
)
check(
  'A-9 정상값(담홍설·중맥·복력중등도)은 목록에 없다 — PO "없음을 언제 다 누르고 있어"',
  !all.some((o) => ['담홍설', '중', '복력 중등도', '정상'].includes(o.label)),
)

/* ---------------- §B 상호배타 축 ---------------- */

check(
  'B-1 부/침, 삭/지가 서로를 배타로 지정한다',
  PULSE_OPTIONS.find((o) => o.label === '부')?.exclusiveWith === '침' &&
    PULSE_OPTIONS.find((o) => o.label === '침')?.exclusiveWith === '부' &&
    PULSE_OPTIONS.find((o) => o.label === '삭')?.exclusiveWith === '지' &&
    PULSE_OPTIONS.find((o) => o.label === '지')?.exclusiveWith === '삭',
)
check(
  'B-2 exclusiveWith가 가리키는 라벨은 반드시 같은 카테고리에 실재한다',
  Object.values(OBSERVATION_OPTIONS_BY_CATEGORY).every((opts) => {
    const labels = new Set(opts.map((o) => o.label))
    return opts.every((o) => !o.exclusiveWith || labels.has(o.exclusiveWith))
  }),
)
check('B-3 침을 켜면 부가 꺼진다', (() => {
  const r = toggleObservationChip(['부', '세'], '침', PULSE_OPTIONS)
  return r.includes('침') && !r.includes('부') && r.includes('세')
})())
check('B-4 배타가 없는 칩은 서로 영향을 주지 않는다 (특징맥은 다중 선택)', (() => {
  const r = toggleObservationChip(['현'], '활', PULSE_OPTIONS)
  return r.includes('현') && r.includes('활')
})())
check('B-5 같은 칩을 다시 누르면 꺼진다', !toggleObservationChip(['현'], '현', PULSE_OPTIONS).includes('현'))
check('B-6 선택 순서와 무관하게 카탈로그 순서로 정규화된다 — 같은 조합이 두 문자열로 저장되면 재평가 비교가 깨진다', (() => {
  const a = toggleObservationChip(toggleObservationChip([], '세', PULSE_OPTIONS), '현', PULSE_OPTIONS)
  const b = toggleObservationChip(toggleObservationChip([], '현', PULSE_OPTIONS), '세', PULSE_OPTIONS)
  return JSON.stringify(a) === JSON.stringify(b)
})())

/* ---------------- §C 왕복 — 가장 중요한 구역 ---------------- */

const rt = (input, opts) => {
  const parsed = parseObservationValue(input, opts)
  return formatObservationValue(parsed)
}
check('C-1 칩만: 왕복 후 동일', rt('치흔·반대 · 황태', TONGUE_OPTIONS) === '치흔·반대 · 황태')
check('C-2 빈 값: 왕복 후 빈 값 (빈 문자열을 "특이없음"으로 승격하지 않는다)', rt('', TONGUE_OPTIONS) === '')
check('C-3 특이없음만: 그대로 유지', rt(NO_FINDING_VALUE, TONGUE_OPTIONS) === NO_FINDING_VALUE)
check(
  'C-4 옛 자유입력 기록이 freeText로 되돌아온다 (기존 레코드가 조용히 사라지지 않는다)',
  (() => {
    const p = parseObservationValue('담홍 태박백, 전체적으로 무난함', TONGUE_OPTIONS)
    return p.selected.length === 0 && p.freeText === '담홍 태박백, 전체적으로 무난함' && p.noFinding === false
  })(),
)
check('C-5 옛 자유입력이 왕복 후에도 글자 그대로 보존된다', rt('담홍 태박백, 전체적으로 무난함', TONGUE_OPTIONS) === '담홍 태박백, 전체적으로 무난함')
check(
  'C-6 자유입력에 구분자가 들어 있어도 원문이 복원된다 (별도 태그를 쓰지 않은 이유)',
  rt('좌측 우세 · 우측 경미', TONGUE_OPTIONS) === '좌측 우세 · 우측 경미',
)
check('C-7 칩 + 자유입력 혼합: 칩이 앞, 자유입력이 뒤 (순서 고정)', (() => {
  const p = parseObservationValue('설하정맥 노장 · 황태 · 환자가 최근 커피 다량', TONGUE_OPTIONS)
  return p.selected.length === 2 && p.freeText === '환자가 최근 커피 다량'
})())
check('C-8 혼합 값도 왕복 후 동일 (칩 순서는 입력 순서를 따른다)', rt('설하정맥 노장 · 황태 · 환자가 최근 커피 다량', TONGUE_OPTIONS) === '설하정맥 노장 · 황태 · 환자가 최근 커피 다량')
check(
  'C-9 소견이 있으면 특이없음은 기록되지 않는다 — 기록이 스스로 모순되지 않게 하는 마지막 방어선',
  formatObservationValue({ selected: ['황태'], freeText: '', noFinding: true }) === '황태',
)
check(
  'C-10 다른 카테고리의 라벨은 칩으로 인식되지 않는다 (맥 라벨이 설진 값에 들어오면 자유입력)',
  parseObservationValue('현', TONGUE_OPTIONS).selected.length === 0,
)
check('C-11 여분 공백은 정리되고 빈 토큰은 버려진다', (() => {
  const p = parseObservationValue('  황태  ·   · 치흔·반대 ', TONGUE_OPTIONS)
  return p.selected.length === 2 && p.freeText === ''
})())

/* ---------------- §D 임상 규칙 창작 금지 (CLAUDE.md) ---------------- */

const SRC = readFileSync(new URL('../src/doctor/workspace/observationOptions.ts', import.meta.url), 'utf8')
const tooltips = all.map((o) => o.tooltip).join('\n')

// 툴팁은 "손·눈에 어떻게 느껴지는가"까지만. 변증 귀속(간울·비허 등)이
// 들어가면 화면이 원장의 판단을 앞질러 유도하게 된다.
const PATTERN_WORDS = [
  '간울', '기울', '비허', '기허', '혈허', '음허', '양허', '어혈', '담음', '습열',
  '한증', '열증', '표증', '리증', '실증', '허증', '신허', '심화', '간양', '기체',
]
for (const w of PATTERN_WORDS) {
  check(`D-1 툴팁에 변증 용어 "${w}"가 등장하지 않는다`, !tooltips.includes(w))
}
check(
  'D-2 카탈로그에 점수·가중치 필드가 없다 (해석을 코드가 하지 않는다)',
  !/\bscore\b|\bweight\b|\bpoints\b/.test(SRC),
)
check(
  'D-3 카탈로그가 환자 응답을 읽지 않는다 (항목 추천·분기 없음)',
  !/responses|payload|DoctorPayload|r\.modules/.test(SRC),
)
// 저장 문자열은 Round 13부터 쓰던 값 그대로여야 한다 -- 바꾸면 그 버튼으로
// 이미 기록된 레코드가 전부 "자유입력"으로 떨어진다. PR-B1에서 리터럴의
// 단일 출처가 체크리스트 컴포넌트 → observationOptions.ts로 옮겨갔으므로
// 단언도 그쪽을 겨냥하되, **사본이 생기지 않았는지**까지 함께 고정한다.
check(
  'D-4 NO_FINDING_VALUE는 Round 13부터의 문자열 그대로다 — 바꾸면 기존 기록이 자유입력으로 떨어진다',
  NO_FINDING_VALUE === '특이없음' && SRC.includes("export const NO_FINDING_VALUE = '특이없음'"),
)
check(
  'D-5 체크리스트 컴포넌트가 그 문자열을 따로 정의하지 않고 단일 출처에서 가져온다 (사본이 갈라지지 않게)',
  (() => {
    const ui = readFileSync(
      new URL('../src/doctor/workspace/ClinicianObservationChecklist.tsx', import.meta.url),
      'utf8',
    )
    return /import \{[\s\S]*?NO_FINDING_VALUE[\s\S]*?\} from '\.\/observationOptions'/.test(ui) &&
      !/const NO_FINDING_VALUE\s*=/.test(ui)
  })(),
)


/* ---------------- §E 승격 (2층 → 1층) ---------------- */

const useN = (label, n) => {
  let st = emptyPromotionState()
  for (let i = 0; i < n; i += 1) st = recordTier2Use(st, label)
  return st
}

check('E-1 임계 미만이면 묻지 않는다', promotionCandidate(useN('긴', PROMOTION_THRESHOLD - 1)) === null)
check('E-2 임계에 닿으면 후보가 된다', promotionCandidate(useN('긴', PROMOTION_THRESHOLD)) === '긴')
check('E-3 수락하면 promoted에 들어가고 다시 묻지 않는다', (() => {
  const st = acceptPromotion(useN('긴', 5), '긴')
  return st.promoted.includes('긴') && promotionCandidate(st) === null
})())
check('E-4 거절하면 다시 묻지 않는다 (배너가 계속 따라다니지 않게)', (() => {
  const st = declinePromotion(useN('긴', 5), '긴')
  return st.declined.includes('긴') && promotionCandidate(st) === null
})())
check('E-5 여러 개가 임계를 넘어도 한 번에 하나만 묻는다 (배너가 쌓이지 않게)', (() => {
  let st = useN('긴', 4)
  for (let i = 0; i < 6; i += 1) st = recordTier2Use(st, '삽')
  return promotionCandidate(st) === '삽' // 더 많이 쓴 쪽
})())
check('E-6 같은 횟수면 결정적으로 하나를 고른다 (렌더마다 배너가 바뀌지 않게)', (() => {
  let st = useN('긴', 3)
  for (let i = 0; i < 3; i += 1) st = recordTier2Use(st, '삽')
  return promotionCandidate(st) === promotionCandidate(st) && promotionCandidate(st) !== null
})())
check('E-7 수락은 멱등 — 두 번 눌러도 사본이 생기지 않는다', (() => {
  const once = acceptPromotion(useN('긴', 3), '긴')
  return acceptPromotion(once, '긴').promoted.length === 1
})())

// 저장소가 막혀 있어도(사생활 보호 모드 등) 체크리스트 본체는 완전히 동작해야
// 한다 -- 승격 기능만 조용히 없는 상태가 되는 것이 올바른 실패 모드다.
const throwingStorage = {
  getItem() { throw new Error('blocked') },
  setItem() { throw new Error('blocked') },
}
check('E-8 저장소가 throw해도 빈 상태를 돌려주고 터지지 않는다', (() => {
  const st = loadPromotionState(throwingStorage)
  return st.counts && Object.keys(st.counts).length === 0 && st.promoted.length === 0
})())
check('E-9 저장 실패도 삼킨다 (승격 저장 실패가 진료를 막지 않는다)', (() => {
  savePromotionState(emptyPromotionState(), throwingStorage)
  return true
})())
check('E-10 손상된 JSON은 빈 상태로 처리한다', (() => {
  const st = loadPromotionState({ getItem: () => '{not json', setItem() {} })
  return st.promoted.length === 0
})())
check('E-11 타입이 어긋난 저장값의 쓰레기 항목은 버려진다', (() => {
  const raw = JSON.stringify({ counts: { 긴: 'x', 삽: 4, 완: -1 }, promoted: ['홍', 7], declined: null })
  const st = loadPromotionState({ getItem: () => raw, setItem() {} })
  return st.counts.삽 === 4 && !('긴' in st.counts) && !('완' in st.counts) &&
    st.promoted.length === 1 && st.promoted[0] === '홍' && st.declined.length === 0
})())
check('E-12 왕복 저장/로드가 동일 상태를 돌려준다', (() => {
  let stored = null
  const mem = { getItem: () => stored, setItem: (_k, v) => { stored = v } }
  const st = acceptPromotion(useN('긴', 3), '긴')
  savePromotionState(st, mem)
  const back = loadPromotionState(mem)
  return JSON.stringify(back) === JSON.stringify(st)
})())

// 자동 재배치 금지 -- 이 파일이 지키는 가장 중요한 UX 제약.
const PROMO_SRC = readFileSync(new URL('../src/doctor/workspace/observationPromotion.ts', import.meta.url), 'utf8')
check(
  'E-13 승격 모듈이 스스로 순서를 바꾸지 않는다 — 수락 전에는 자리가 절대 움직이지 않는다',
  !/sort\(/.test(PROMO_SRC.replace(/const eligible[\s\S]*?\n\s*return eligible/, '')) ,
)
const UI_SRC = readFileSync(new URL('../src/doctor/workspace/ClinicianObservationChecklist.tsx', import.meta.url), 'utf8')
check(
  'E-14 승격된 항목은 1층 **맨 뒤에** 붙는다 (기존 23칸의 자리는 영구 고정)',
  /\[\.\.\.tier1, \.\.\.promotedOptions\]/.test(UI_SRC),
)
check(
  'E-15 2층 사용 횟수는 **켤 때만** 센다 (켰다 껐다로 임계를 채울 수 없게)',
  /const turningOn = !selected\.includes\(label\)[\s\S]{0,240}?if \(turningOn && tier === 2/.test(UI_SRC),
)
// 주석에서 ".data/ 에 넣지 않는다"라고 **말하는 것**과 실제로 거기에 쓰는
// 것은 다르다 -- 이 저장소의 다른 소스 대조 단언들과 같이 주석을 걷어낸
// 뒤 검사한다.
const PROMO_CODE = PROMO_SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
check(
  'E-16 승격 상태는 환자 데이터 경로가 아니라 localStorage에 있다 (임상 기록이 아닌 화면 설정)',
  /localStorage/.test(PROMO_CODE) && !/\.data\/|serverClient|fetch\(/.test(PROMO_CODE),
)

console.log(`\n설맥복 체크 항목 + 승격 계약 ${passed}개 단언 통과`)
