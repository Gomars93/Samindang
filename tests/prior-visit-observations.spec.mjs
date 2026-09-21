/*
 * 지난 방문 설맥복 비교 (PR-B3, 2026-09-21).
 *
 * PO가 정한 이 화면의 용도는 "초진과 재평가 두 번 쓴다"이고, 재평가의 질문은
 * 하나다 -- **"지난번과 비교해 변했나?"** 그런데 지난 방문의 설맥복 기록은
 * `getPatientHistory` 투영에 **아예 없었다**(재평가 대상과 최종 판단 요약만
 * 나갔다). 그래서 서버 → 클라이언트 → 화면 3단을 모두 손댔다.
 *
 *  §A 서버 투영 — 필드가 나가고, 신뢰 경계 방어가 걸려 있다
 *  §B 클라이언트 — 서버를 믿지 않고 한 번 더 막는다
 *  §C **3상태 구분** — 기록 없음 / 미시행 / 기록됨. 이게 비교의 전부다
 *  §D **칩 자리 불변** — PR-B1이 세운 원칙을 재평가가 깨지 않는다
 *  §E 해석하지 않는다 — 호전/악화 판정 없음
 *
 * `npm run test:prior-visit-observations` (test:all에 포함).
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { priorObservationFor } from './.prior-visit-longitudinal-bundle.mjs'

let passed = 0
const check = (name, cond, extra = '') => {
  assert.ok(cond, `${name} ${extra}`)
  passed += 1
  console.log(`OK: ${name}`)
}
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const STORE = read('server/store.js')
const CLIENT = read('src/lib/serverClient.ts')
const UI = read('src/doctor/workspace/ClinicianObservationChecklist.tsx')
const CSS = read('src/doctor/workspace/workspace.css')
const LONG = read('src/doctor/workspace/longitudinal.ts')

/* ---------------- §A 서버 투영 ---------------- */

check(
  'A-1 getPatientHistory가 설맥복 기록을 내보낸다',
  /herbal_clinician_observations:/.test(STORE),
)
check(
  'A-2 제출 기반 방문은 Array.isArray로 걸러 보낸다 (검증 없이 저장된 workspace가 배열이 아닐 수 있다)',
  /Array\.isArray\(workspace\?\.herbalClinicianObservations\)/.test(STORE),
)
check(
  'A-3 제출 없는 재진은 빈 배열로 나간다 — 그 방문엔 기록 자체가 없다',
  /herbal_clinician_observations: \[\],/.test(STORE),
)
check(
  'A-4 두 분기 모두에서 필드가 나간다 (한쪽만 빠지면 클라이언트가 undefined를 만난다)',
  (STORE.match(/herbal_clinician_observations:/g) ?? []).length === 2,
)

/* ---------------- §B 클라이언트 ---------------- */

check(
  'B-1 클라이언트가 서버 응답을 다시 한 번 Array.isArray로 막는다 (방어를 한쪽에만 두지 않는다)',
  /Array\.isArray\(v\.herbal_clinician_observations\)/.test(CLIENT),
)
check(
  'B-2 값이 문자열이 아닐 때 "[object Object]"를 보여주지 않고 미시행으로 떨어뜨린다',
  /typeof hit\.value === 'string' \? hit\.value\.trim\(\) : ''/.test(LONG),
)

/* ---------------- §C 3상태 구분 — 비교의 전부 ---------------- */

const visitWith = (items) => ({ herbalClinicianObservations: items })
const obs = (category, value) => ({ id: 'x', category, title: 't', checked: value !== '', value, recordedAt: null })

check('C-1 지난 방문이 없으면 null (초진)', priorObservationFor(null, 'TONGUE') === null)
check('C-2 지난 방문은 있으나 기록 배열이 비면 null — 모르는 것을 아는 척하지 않는다', priorObservationFor(visitWith([]), 'TONGUE') === null)
check('C-3 다른 카테고리만 있으면 null', priorObservationFor(visitWith([obs('PULSE', '현')]), 'TONGUE') === null)
check('C-4 항목은 있는데 값이 비면 미시행 (recorded: false)', (() => {
  const r = priorObservationFor(visitWith([obs('TONGUE', '')]), 'TONGUE')
  return r !== null && r.recorded === false
})())
check('C-5 기록된 값은 그대로 돌려준다', (() => {
  const r = priorObservationFor(visitWith([obs('TONGUE', '치흔·반대 · 황태')]), 'TONGUE')
  return r !== null && r.recorded === true && r.value === '치흔·반대 · 황태'
})())
check('C-6 특이없음도 "기록됨"이다 — 봤는데 정상은 미시행과 다르다', (() => {
  const r = priorObservationFor(visitWith([obs('TONGUE', '특이없음')]), 'TONGUE')
  return r !== null && r.recorded === true && r.value === '특이없음'
})())
check('C-7 배열이 아닌 쓰레기가 와도 터지지 않는다', priorObservationFor(visitWith('garbage'), 'TONGUE') === null)
check('C-8 원소가 null이어도 터지지 않는다', priorObservationFor(visitWith([null, obs('TONGUE', '황태')]), 'TONGUE')?.value === '황태')
check('C-9 값이 객체면 미시행으로 떨어진다 (지어낸 문자열을 보여주지 않는다)', (() => {
  const r = priorObservationFor(visitWith([{ category: 'TONGUE', value: { a: 1 } }]), 'TONGUE')
  return r !== null && r.recorded === false
})())
check('C-10 공백만 있는 값은 미시행이다', priorObservationFor(visitWith([obs('TONGUE', '   ')]), 'TONGUE')?.recorded === false)

/* ---------------- §D 칩 자리 불변 — PR-B1 원칙을 재평가가 깨지 않는다 ---------------- */

check(
  'D-1 칩 목록은 여전히 카탈로그 순서로만 만들어진다 (지난번 항목을 앞으로 당기는 정렬이 없다)',
  /\[\.\.\.tier1, \.\.\.promotedOptions\]\.map/.test(UI) && !/priorSelected[\s\S]{0,200}?\.sort\(/.test(UI),
)
check(
  'D-2 지난번 표시는 자리가 아니라 **클래스와 글리프**로만 한다',
  /workspace__obsChip--prior/.test(UI) && /workspace__obsChip__priorDot/.test(UI),
)
check(
  'D-3 색만으로 구별하지 않는다 — 점선 테두리 + ✓ 글리프',
  /border-style: dashed/.test(CSS) && UI.includes('✓'),
)
check(
  'D-4 지난번 요약은 칩 줄 **위**의 한 줄이다 (칩 줄 자체를 늘리지 않는다)',
  /workspace__obsPrior[\s\S]{0,400}?<div className="workspace__obsChips"/.test(UI),
)
check(
  'D-5 초진(지난 방문 없음)에는 지난번 표시가 전혀 렌더되지 않는다',
  /\{prior && \(/.test(UI),
)

/* ---------------- §E 해석하지 않는다 ---------------- */

// "호전/악화 해석을 하지 않는다"고 **말하는 주석**과 실제로 그런 문구를
// 화면에 내는 것은 다르다 -- 이 저장소의 다른 소스 대조 단언과 같이
// 주석을 걷어낸 뒤 검사한다.
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const UI_CODE = stripComments(UI)
const LONG_CODE = stripComments(LONG)
check(
  'E-1 호전/악화 판정 문구가 코드에 없다 — 이 화면은 raw 기록만 나른다',
  !/호전|악화|개선됨|나빠짐|improved|worsen/.test(UI_CODE + LONG_CODE),
)
check(
  'E-2 지난 값과 오늘 값을 비교해 점수·퍼센트를 만들지 않는다',
  !/\bdelta\b|퍼센트|%\)/.test(LONG_CODE),
)
check(
  'E-3 지난 값이 오늘 입력을 자동으로 채우지 않는다 (이어받기 없음 — 원장이 다시 본 것만 기록된다)',
  !/setSelected\(prior|write\(\{ selected: priorSelected|prior\.value\)\s*\)/.test(UI_CODE),
)
check(
  'E-4 longitudinal.ts의 RAW-FACTS-ONLY 헤더 계약이 그대로다',
  /RAW-FACTS-ONLY projection/.test(LONG) && /never anything inferred/.test(LONG),
)

console.log(`\n지난 방문 설맥복 비교 계약 ${passed}개 단언 통과`)
