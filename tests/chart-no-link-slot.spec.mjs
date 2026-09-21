/*
 * 차트번호 연결 — 진료 화면 진입점 계약 (2026-09-21, PO "차트번호 입력부터
 * 먼저 넣자").
 *
 * 배경: 시그마 `chart_no` 연결은 서버(patientIdentityStore.js) · API ·
 * UI(PatientIdentityLinkAction, 2단계 확인) · 충돌 감지 · e2e 테스트까지
 * **이미 완성돼 있었다.** 빠져 있던 것은 단 하나, **진입 시점**이다 --
 * 연결 버튼이 오늘 큐의 CRM 작업 행에만 붙어 있어서, 오늘 CRM 작업이 없는
 * 일반 문진 제출은 차트번호를 붙일 자리가 화면 어디에도 없었다.
 * DoctorView.tsx의 `resolvedIdentityForOpenRecord` 주석이 그 상태를 그대로
 * 적어두고 있다: "그 밖의 제출은 chart_no 없이 그대로 생략된다".
 *
 * 이 파일이 고정하는 것:
 *  §A 슬롯이 진료 화면 ①신원 블록까지 실제로 흘러간다 (3단 경로)
 *  §B 렌더 조건 — 서버 모드 + 실제 patient_id + 아직 미연결일 때만
 *  §C **보안 경계**: 차트번호 → 환자 역조회 읽기 API를 만들지 않았다
 *  §D 낙관적 갱신 계약이 복제되지 않고 하나로 공유된다
 *
 * `npm run test:chart-no-link` (test:all에 포함).
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

let passed = 0
const check = (name, cond, extra = '') => {
  assert.ok(cond, `${name} ${extra}`)
  passed += 1
  console.log(`OK: ${name}`)
}
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

const VIEW = read('src/doctor/DoctorView.tsx')
const WORKSPACE = read('src/doctor/workspace/DoctorWorkspace.tsx')
const ASIDE = read('src/doctor/workspace/VisitSummaryAside.tsx')
const SERVER = read('server/index.js')
const STORE = read('server/patientIdentityStore.js')

/* ---------------- §A 슬롯이 실제로 화면까지 흘러간다 ---------------- */

check(
  'A-1 DoctorView가 열린 레코드용 슬롯을 만들고 DoctorWorkspace에 넘긴다',
  /const identityLinkSlotForOpenRecord\s*=/.test(VIEW) &&
    /identityLinkSlot=\{identityLinkSlotForOpenRecord\}/.test(VIEW),
)
check(
  'A-2 DoctorWorkspace가 그 슬롯을 받아 VisitSummaryAside로 그대로 넘긴다 (내용을 해석하지 않는다)',
  /identityLinkSlot\?: ReactNode/.test(WORKSPACE) &&
    /identityLinkSlot=\{identityLinkSlot\}/.test(WORKSPACE),
)
check(
  'A-3 VisitSummaryAside가 ①신원 블록 안에서 슬롯을 렌더한다',
  /doctor__visitSummary__identity[\s\S]{0,400}\{identityLinkSlot\}[\s\S]{0,40}<\/div>/.test(ASIDE),
)
check(
  'A-4 aside는 PatientIdentityLinkAction을 직접 import하지 않는다 (순수 표시 컴포넌트가 서버 클라이언트에 의존하지 않게)',
  // 주석에 이름이 등장하는 것은 무방하다 -- 금지하는 것은 실제 import다.
  !/^import[^\n]*PatientIdentityLinkAction/m.test(ASIDE) && !/from '.*PatientIdentityLinkAction'/.test(ASIDE),
)
check(
  'A-5 슬롯은 compact(834 세로) 행에는 렌더되지 않는다 — §3.2가 2줄로 고정한 예산',
  (() => {
    const compact = ASIDE.slice(ASIDE.indexOf('if (compact) {'), ASIDE.indexOf('doctor__visitSummary__identity'))
    return !compact.includes('{identityLinkSlot}')
  })(),
)

/* ---------------- §B 렌더 조건 ---------------- */

const slotExpr = VIEW.slice(
  VIEW.indexOf('const identityLinkSlotForOpenRecord'),
  VIEW.indexOf('const identityLinkSlotForOpenRecord') + 400,
)
check("B-1 서버 모드에서만 렌더된다 (fixtures 미리보기에는 실환자가 없다)", /mode === 'server'/.test(slotExpr))
check('B-2 실제 patient_id가 있을 때만 렌더된다', /selectedRecord\?\.patient_id/.test(slotExpr))
check(
  'B-3 아직 연결되지 않았을 때만 렌더된다 (이미 연결된 레코드에 비가역 액션을 다시 띄우지 않는다)',
  /chartNoForOpenRecord === null/.test(slotExpr),
)
check(
  'B-4 연결 성공 시 공유 핸들러로 상태를 갱신한다',
  /onLinked=\{handleIdentityLinked\}/.test(slotExpr),
)

/* ---------------- §C 보안 경계: 역조회 API를 만들지 않았다 ---------------- */

check(
  'C-1 patient-identity 라우트는 여전히 POST 하나뿐 — 차트번호로 환자를 찾는 GET을 추가하지 않았다',
  (() => {
    const routes = [...SERVER.matchAll(/parts\[2\] === 'patient-identity'[\s\S]{0,160}?req\.method === '(\w+)'/g)].map(
      (m) => m[1],
    )
    return routes.length === 1 && routes[0] === 'POST'
  })(),
)
check(
  'C-2 by-chart 역인덱스는 읽기 API로 노출되지 않는다는 저장소 자체의 계약이 그대로다',
  /never exposed via any read API/.test(STORE),
)
check(
  'C-3 이 변경은 서버를 건드리지 않는다 — 클라이언트에 새 조회 함수가 생기지 않았다',
  !read('src/lib/serverClient.ts').includes('lookupPatientByChartNo') &&
    !read('src/lib/serverClient.ts').includes('findPatientByChart'),
)

/* ---------------- §D 낙관적 갱신 계약을 복제하지 않는다 ---------------- */

check(
  'D-1 handleIdentityLinked는 이름 있는 함수 하나로만 정의된다',
  (VIEW.match(/function handleIdentityLinked\(/g) ?? []).length === 1,
)
check(
  'D-2 오늘 큐도 같은 공유 핸들러를 쓴다 (사본이 아니라 하나)',
  (VIEW.match(/onIdentityLinked=\{handleIdentityLinked\}/g) ?? []).length === 1 &&
    !/onIdentityLinked=\{\(uuid, identity\) =>/.test(VIEW),
)
check(
  'D-3 seq ref를 맵 갱신보다 먼저 올린다 — 진행 중이던 fetch가 방금 연결한 결과를 덮어쓰지 못하게 하는 계약',
  (() => {
    const body = VIEW.match(/function handleIdentityLinked\([\s\S]*?\n  \}/)?.[0] ?? ''
    return body.indexOf('patientIdentitiesSeqRef.current += 1') < body.indexOf('setPatientIdentities(') &&
      body.includes('setRevisits(')
  })(),
)

console.log(`\n차트번호 연결 진입점 계약 ${passed}개 단언 통과`)
