/*
 * 클리닉 세팅 경로 계약 — 스크립트와 문서가 코드와 같은 것을 말하는지 검사한다.
 *
 * 왜 이 스위트가 있나. 2026-09-20까지 "다음 주부터 한약 환자를 받을 수 있나"에
 * 답하지 못한 이유는 코드가 아니라 **경로가 문서로만 존재했기** 때문이다:
 *   - 클리닉 PC를 최신화하는 절차가 사람 기억에 있었고(`git pull` 누락 → 옛 빌드),
 *   - `.env.local`의 변수명이 틀려도 아무도 알려주지 않았고(HANDOFF 2026-09-08),
 *   - 한약 경로는 실기기 체크리스트에 절차 자체가 없었다.
 *
 * 그래서 산문 대신 단언으로 고정한다. 문서가 약속하는 값(포트/변수명/EMR 라벨/
 * 문항 id)이 실제 소스에 존재하지 않으면 여기서 실패한다.
 *
 * `npm run test:clinic-setup` (test:all에 포함).
 */
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'

let passed = 0
const check = (name, cond, extra = '') => {
  assert.ok(cond, `${name} ${extra}`)
  passed += 1
  console.log(`OK: ${name}`)
}

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

// ---------------------------------------------------------------- 스크립트
const PS = 'scripts/setup-and-start-clinic.ps1'
const BAT = 'scripts/setup-and-start-clinic.bat'
check('원클릭 세팅 스크립트(.ps1)가 존재한다', existsSync(new URL(`../${PS}`, import.meta.url)))
check('원클릭 세팅 런처(.bat)가 존재한다', existsSync(new URL(`../${BAT}`, import.meta.url)))

const psRaw = readFileSync(new URL(`../${PS}`, import.meta.url))
check(
  '.ps1이 UTF-8 BOM으로 시작한다 (Windows PowerShell 5.1이 한글 메시지를 깨지 않고 읽는 조건)',
  psRaw[0] === 0xef && psRaw[1] === 0xbb && psRaw[2] === 0xbf,
)

const ps = psRaw.toString('utf8')
const bat = read(BAT)

// 서버 계약: 변수명·포트는 serverClient.ts / server/index.js / preview와 일치해야 한다.
const serverClient = read('src/lib/serverClient.ts')
const serverIndex = read('server/index.js')
check(
  '.ps1이 쓰는 환경변수명이 serverClient.ts가 실제로 읽는 이름과 같다',
  ps.includes('VITE_SAMINDANG_SERVER_URL') && serverClient.includes('VITE_SAMINDANG_SERVER_URL'),
)
check(
  '.ps1이 쓰는 핸드오프 포트(4317)가 server/index.js의 기본 포트와 같다',
  ps.includes(':4317') && serverIndex.includes("SAMINDANG_PORT ?? '4317'"),
)
check('.ps1이 태블릿 프리뷰 포트(4173)를 안내한다', ps.includes(':4173'))
check('.ps1이 .env.local에 쓴다', ps.includes('.env.local'))
check(
  '.ps1이 VITE_SAMINDANG_SERVER_URL 줄만 다시 쓰고 나머지 줄은 보존한다',
  /notmatch\s+'\^\\s\*VITE_SAMINDANG_SERVER_URL/.test(ps),
)
check('.ps1이 빌드를 직접 돌린다', ps.includes('npm run build'))
check(
  '.ps1이 빌드 실패 시 멈춘다 (깨진 빌드로 진료에 들어가지 않는다)',
  /LASTEXITCODE -ne 0\) \{ Die '빌드 실패/.test(ps),
)
check(
  // 실기기 사고(2026-09-21): PowerShell 이중따옴표 문자열 안에서 백슬래시(\\")는
  // 이스케이프로 동작하지 않는다 -- 문자열이 조기 종료되고 나머지가 Start-Process의
  // 엉뚱한 위치 인수로 튀어 "인수를 허용하는 위치 매개 변수를 찾을 수 없습니다"로
  // 죽었다(원장 PC에서 재현). 같은 패턴이 다시 들어가면 여기서 잡는다.
  '.ps1이 이중따옴표 문자열 안에 깨지는 백슬래시-쌍따옴표(\\") 이스케이프를 쓰지 않는다',
  !/\\"/.test(ps),
)
check(
  'SAMINDANG_DATA_DIR를 넘기는 cmd 명령 문자열이 홑따옴표 연결로 조립된다 (이스케이프 불필요)',
  /\$handoffCmd\s*=\s*'[^']*'\s*\+\s*\$DataDir\s*\+\s*'/.test(ps),
)

check(
  '.ps1이 환자 데이터 디렉터리를 저장소 바깥으로 기본 설정한다 (클라우드 동기화 폴더 사고 방지)',
  /\$DataDir\s*=\s*'C:\\samindang-data\\submissions'/.test(ps) && ps.includes('SAMINDANG_DATA_DIR'),
)
check(
  '.ps1이 저장소 경로를 하드코딩하지 않는다 (PSScriptRoot로 해석한다)',
  ps.includes('$PSScriptRoot') && !/google\s*drive/i.test(ps) && !/C:\\Users\\/i.test(ps),
)
check(
  '.bat이 같은 폴더의 .ps1을 ExecutionPolicy Bypass로 부른다',
  bat.includes('%~dp0setup-and-start-clinic.ps1') && bat.includes('-ExecutionPolicy Bypass'),
)

check(
  '.ps1이 시작 전에 git/npm/node 존재를 확인한다 (더블클릭 실행에서 PATH가 없을 수 있다)',
  /foreach \(\$tool in 'git', 'npm', 'node'\)/.test(ps) && ps.includes('C:\\Program Files\\nodejs'),
)

// ---------------------------------------------------------- 한약 실기기 절차
const checklist = read('docs/REAL_DEVICE_PILOT_CHECKLIST.md')
check('실기기 체크리스트에 한약 경로 절(5-c)이 있다', checklist.includes('## 5-c)'))

const coreSpec = read('src/spec/coreSpec.ts')
for (const id of ['HERB_APPETITE', 'HERB_THERMAL', 'HERB_THIRST', 'HERB_SWEAT']) {
  check(`5-c가 약속한 전신 문항 ${id}이 coreSpec.ts에 실제로 있다`, coreSpec.includes(`'${id}'`))
}
for (const id of ['CONST_ENERGY', 'CONST_SLEEP', 'CONST_DIGESTION', 'CONST_BOWEL']) {
  check(`5-c가 약속한 체질 문항 ${id}이 coreSpec.ts에 실제로 있다`, coreSpec.includes(`'${id}'`))
}

// 5-c (라)가 "붙여넣기 결과에 이 줄이 있어야 한다"고 약속하는 EMR 라벨 = emrPreview.ts의 실제 라벨.
// 과거 D-1/D-2 사고(한약 EMR이 비어 나감 / 원장 타이핑 3필드 소실) 지점이 바로 여기다.
const emrPreview = read('src/doctor/workspace/emrPreview.ts')
for (const label of ['최종 변증·병기', '치법', '처방/계획 메모', '추적할 증상']) {
  check(`5-c가 약속한 EMR 라벨 "${label}"이 emrPreview.ts에 실제로 있다`, emrPreview.includes(`'${label}'`))
  check(`5-c 문서가 EMR 라벨 "${label}"을 명시한다`, checklist.includes(label))
}

// 5-c는 원장에게 "이 버튼을 누르라"고 지시한다 -- 그 버튼 문구가 coreSpec.ts의 실제 라벨과
// 한 글자라도 다르면 원장이 화면에서 못 찾는다. 초안에서 실제로 "한약 상담"/"체질·보약"으로
// 잘못 적었다가 코드 대조로 잡았다. 그래서 라벨을 단언으로 고정한다.
for (const label of ['한약·보약 상담', '기력·체력 회복', '전반적인 몸 상태 점검', '불편한 증상 치료']) {
  check(`5-c가 누르라고 지시한 버튼 "${label}"이 coreSpec.ts의 실제 라벨과 같다`,
    coreSpec.includes(`label: '${label}'`) && checklist.includes(label))
}

const viewProfile = read('src/doctor/workspace/viewProfile.ts')
check(
  '5-c가 약속한 원장 화면 배지 "한약·전신"이 viewProfile.ts의 실제 라벨과 같다',
  viewProfile.includes("herbal: '한약·전신'") && checklist.includes('한약·전신'),
)

// --------------------------------------------------------------- 명리 결정
const myungri = read('docs/MYUNGRI_CALCULATION_POLICY_PENDING.md')
const sajuPolicy = read('src/saju/policy.ts')
check('명리 정책 문서에 2026-09-20 PO 결정이 기록돼 있다', myungri.includes('## 2026-09-20 PO 결정'))
check(
  '그 결정은 "코드를 바꾸지 않았다"고 적혀 있고, policy.ts도 실제로 미승인 상태 그대로다',
  myungri.includes('코드는 변경하지 않는다') && sajuPolicy.includes('approved_by_clinician: false'),
)
check(
  'BIRTH_03이 12시진 + 모름 = 13개 선택지를 그대로 유지한다 (PO가 필요로 하는 유일한 명리 입력)',
  ['ja', 'chuk', 'in', 'myo', 'jin', 'sa', 'o', 'mi', 'sin', 'yu', 'sul', 'hae', 'unknown'].every((v) =>
    new RegExp(`value: '${v}',`).test(coreSpec),
  ),
)
check(
  '체크리스트 BLOCKER #1이 해소로 표시됐고, 결론이 더는 "3건"이라고 말하지 않는다',
  checklist.includes('2026-09-20 해소(PO 결정)') && !checklist.includes('BLOCKER 3건이 남아 있는 한'),
)

console.log(`\nSUMMARY: ${passed} assertions passed, 0 failed (total ${passed})`)
