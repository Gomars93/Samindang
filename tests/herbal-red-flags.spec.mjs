/*
 * 한약 상담 중단 사유 (red flag) — 안전 확인 레인 계약 (PR-B2, 2026-09-21).
 *
 * 이 세 소견(왜사설·강경설 / 반발압통·근성방어 / 박동성 복부 종괴)은 설진·
 * 복진 중에 걸리지만 의미가 **"변증 참고"가 아니라 "한약 상담을 멈추고
 * 보내야 함"**이다. 그래서 레인2 체크리스트가 아니라 레인1(안전 확인)에
 * 있어야 하고, 이 파일이 그 위치·출력·경계를 고정한다.
 *
 *  §A 위치 — 접히는 자리(레인2)가 아니라 안전 확인 레인에 있다
 *  §B 출력 — 체크됐을 때만, EMR **맨 앞**에. 미체크는 "없음"이 아니다
 *  §C **환자 설문지 불변** — PO가 명시적으로 물어본 경계
 *  §D 저장 — additive 필드, 옛 레코드 호환
 *  §E 이 기능이 **하지 않는 것** — 잠금·진단·자동 분기 없음
 *
 * `npm run test:herbal-red-flags` (test:all에 포함).
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { RED_FLAG_OPTIONS, parseObservationValue, formatObservationValue } from './.observation-options-bundle.mjs'
import { buildHerbalWorkspaceEmrPreview } from './.red-flag-emrpreview-bundle.mjs'
import { emptyWorkspaceState, deserializeWorkspaceState } from './.red-flag-persistence-bundle.mjs'

let passed = 0
const check = (name, cond, extra = '') => {
  assert.ok(cond, `${name} ${extra}`)
  passed += 1
  console.log(`OK: ${name}`)
}
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const WORKSPACE = read('src/doctor/workspace/DoctorWorkspace.tsx')
const CARD = read('src/doctor/workspace/HerbalSafetyRedFlagCard.tsx')

/* ---------------- §A 위치 ---------------- */

check('A-1 red flag 세 항목이 존재한다', RED_FLAG_OPTIONS.length === 3)
check(
  'A-2 세 항목 모두 1층이다 — 안전 항목에 "더 보기"는 없어야 한다',
  RED_FLAG_OPTIONS.every((o) => o.tier === 1),
)
check(
  'A-3 PO가 고른 세 소견 그대로다',
  RED_FLAG_OPTIONS.map((o) => o.label).join('|') === '왜사설·강경설|반발압통·근성방어|박동성 복부 종괴',
)
// 레인1 <section> 안에서, 레인2가 시작되기 전에 렌더되어야 한다.
const lane1 = WORKSPACE.slice(
  WORKSPACE.indexOf('aria-labelledby="lane1-h2"'),
  WORKSPACE.indexOf('aria-labelledby="lane2-h2"'),
)
check('A-4 카드가 레인1(안전 확인) 안에서 렌더된다', lane1.includes('<HerbalSafetyRedFlagCard'))
check(
  'A-5 한약·혼합 프로필에서만 렌더된다 (통증 단독 진료에는 나오지 않는다)',
  /\{\(activeProfile === 'herbal' \|\| activeProfile === 'mixed'\) && \(\s*\n\s*<HerbalSafetyRedFlagCard/.test(lane1),
)
check(
  'A-6 레인2 체크리스트에는 들어가지 않는다 — 접히는 자리에 안전장치를 두지 않는다',
  !WORKSPACE.slice(WORKSPACE.indexOf('aria-labelledby="lane2-h2"')).includes('<HerbalSafetyRedFlagCard'),
)
check(
  'A-7 레인2 기본 체크리스트(설·맥·복·추가문진 4행)는 그대로다 — red flag가 5번째 행으로 섞이지 않았다',
  (() => {
    const obs = read('src/doctor/workspace/clinicianObservation.ts')
    const body = obs.match(/export function defaultClinicianObservations\(\)[\s\S]*?\n\}/)?.[0] ?? ''
    return (body.match(/emptyClinicianObservation\(/g) ?? []).length === 4 && !body.includes('RED_FLAG')
  })(),
)

/* ---------------- §B 출력 ---------------- */

const base = {
  primaryConcern: '한약·보약 상담',
  clinicianObservations: [],
  finalAssessment: {
    finalPatternOrMechanism: '비기허',
    treatmentPrinciple: '',
    prescriptionPlanNote: '',
    symptomsToTrack: '',
    recordedAt: null,
  },
}
const flagItem = (value) => ({
  id: 'obs_red_flag',
  category: 'RED_FLAG',
  title: '전원 고려 소견',
  checked: value !== '',
  value,
  recordedAt: value !== '' ? '2026-09-21T00:00:00.000Z' : null,
})

const withFlag = buildHerbalWorkspaceEmrPreview({ ...base, safetyObservation: flagItem('반발압통·근성방어') })
const noFlag = buildHerbalWorkspaceEmrPreview({ ...base, safetyObservation: flagItem('') })
const absent = buildHerbalWorkspaceEmrPreview(base)

check('B-1 체크되면 EMR에 줄이 생긴다', withFlag.includes('반발압통·근성방어'))
check(
  'B-2 그 줄이 **맨 앞**에 온다 — 붙여넣은 차트를 위에서 읽을 때 가장 먼저 걸려야 한다',
  withFlag.split('\r\n')[0].startsWith('⚠ 상담 중단 사유:'),
)
check(
  'B-3 미체크면 라벨 자체가 나오지 않는다 — "없음"으로 기록하지 않는다',
  !noFlag.includes('상담 중단 사유'),
)
check('B-4 필드를 아예 넘기지 않아도 동일하다 (옛 호출부 호환)', !absent.includes('상담 중단 사유'))
check(
  'B-5 미체크 EMR은 red flag 도입 전과 글자 단위로 같다 — 기존 출력에 회귀가 없다',
  noFlag === absent,
)
check(
  'B-6 나머지 줄 순서는 그대로다 (상담 목적이 그 다음)',
  withFlag.split('\r\n')[1].startsWith('상담 목적:'),
)
check('B-7 여러 개 체크되면 모두 한 줄에 실린다', (() => {
  const v = formatObservationValue({
    selected: ['왜사설·강경설', '박동성 복부 종괴'],
    freeText: '',
    noFinding: false,
  })
  const out = buildHerbalWorkspaceEmrPreview({ ...base, safetyObservation: flagItem(v) })
  return out.includes('왜사설·강경설') && out.includes('박동성 복부 종괴')
})())
check('B-8 저장값이 칩으로 정확히 복원된다 (왕복)', (() => {
  const v = formatObservationValue({ selected: ['박동성 복부 종괴'], freeText: '', noFinding: false })
  const p = parseObservationValue(v, RED_FLAG_OPTIONS)
  return p.selected.length === 1 && p.selected[0] === '박동성 복부 종괴'
})())

/* ---------------- §C 환자 설문지 불변 (PO가 명시적으로 물어본 경계) ---------------- */

check(
  'C-1 문진 스펙(src/spec/)에 red flag 라벨이 등장하지 않는다 — 환자가 답하는 항목이 아니다',
  (() => {
    for (const f of ['src/spec/coreSpec.ts']) {
      const src = read(f)
      for (const o of RED_FLAG_OPTIONS) if (src.includes(o.label)) return false
    }
    return true
  })(),
)
check(
  'C-2 카드가 환자 응답(payload/responses)을 읽지 않는다 — 전적으로 원장이 직접 체크하는 값',
  !/payload|responses|DoctorPayload/.test(CARD),
)
check(
  'C-3 화면에 그 사실이 명시된다 (원장이 헷갈리지 않게)',
  CARD.includes('환자 문진에는 포함되지 않습니다'),
)

/* ---------------- §D 저장 (additive) ---------------- */

check('D-1 빈 기본값이 존재한다', (() => {
  const st = emptyWorkspaceState()
  return st.herbalSafetyObservation && st.herbalSafetyObservation.value === '' && st.herbalSafetyObservation.checked === false
})())
check(
  'D-2 이 필드가 없는 옛 레코드도 열린다 (additive 규약 — 터지지 않고 빈 기본값)',
  (() => {
    const st = deserializeWorkspaceState({ schema_version: '1.0.0', herbalFinalAssessment: {} })
    return st.herbalSafetyObservation.value === '' && st.herbalSafetyObservation.category === 'RED_FLAG'
  })(),
)
check('D-3 저장된 값이 역직렬화에서 보존된다', (() => {
  const st = deserializeWorkspaceState({ herbalSafetyObservation: flagItem('왜사설·강경설') })
  return st.herbalSafetyObservation.value === '왜사설·강경설'
})())
check('D-4 손상된 값은 빈 기본값으로 떨어진다 (터지지 않는다)', (() => {
  const st = deserializeWorkspaceState({ herbalSafetyObservation: 'garbage' })
  return st.herbalSafetyObservation.value === ''
})())
check(
  'D-5 schema_version을 올리지 않았다 — 기존 필드들과 같은 additive 규약',
  read('src/doctor/workspace/persistence.ts').includes("WORKSPACE_STATE_SCHEMA_VERSION = '1.1.0'"),
)

/* ---------------- §E 하지 않는 것 ---------------- */

check(
  'E-1 체크를 근거로 어떤 잠금도 걸지 않는다 (기존 안전 잠금 경로에 개입 없음)',
  !/locked|disabled|블록|차단/.test(CARD.replace(/\/\*[\s\S]*?\*\//g, '')),
)
check(
  'E-2 진단명·질환명을 제시하지 않는다',
  !/맹장|충수|대동맥류|뇌졸중|중풍|복막염/.test(CARD),
)
check(
  'E-3 툴팁은 무엇이 보이고 만져지는지까지만 적는다 (변증 귀속 없음)',
  (() => {
    const t = RED_FLAG_OPTIONS.map((o) => o.tooltip).join('\n')
    return !['간울', '비허', '어혈', '기허', '습열', '신허'].some((w) => t.includes(w))
  })(),
)
check(
  'E-4 서버를 건드리지 않는다',
  !/serverClient|fetch\(|\/api\//.test(CARD),
)

console.log(`\n한약 상담 중단 사유 계약 ${passed}개 단언 통과`)
