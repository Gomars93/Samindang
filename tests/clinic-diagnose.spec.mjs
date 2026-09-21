/*
 * 클리닉 진단 스크립트 계약 — 2026-09-21 원장 PC 실기기 세션에서 "이거
 * 쳐보세요 → 결과 주세요"를 다섯 번 반복해야 했던 것에 대한 대응.
 * IP/방화벽/네트워크 프로필/포트 4317·4173/실제 응답을 한 번에 다 확인해서
 * 한 화면에 보여주는 진단 스크립트를 신설했고, 이 파일은 그 스크립트가
 * 실제로 필요한 항목들을 확인하는지 + tests/clinic-setup.spec.mjs가 이미
 * 잡았던 클래스의 사고(PowerShell 백슬래시-쌍따옴표 이스케이프)를 반복하지
 * 않는지 코드 대조로 고정한다.
 *
 * 이 스크립트는 이 리눅스 세션에 PowerShell이 없어 실행까지는 검증할 수
 * 없다 — 정적 대조(문자열/패턴 존재 여부)로만 확인한다는 한계를 안고 간다
 * (scripts/setup-and-start-clinic.ps1의 실기기 버그가 보여준 그대로).
 *
 * `npm run test:clinic-diagnose` (test:all에 포함).
 */
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'

let passed = 0
const check = (name, cond, extra = '') => {
  assert.ok(cond, `${name} ${extra}`)
  passed += 1
  console.log(`OK: ${name}`)
}

const PS = 'scripts/diagnose-clinic.ps1'
const BAT = 'scripts/diagnose-clinic.bat'
check('진단 스크립트(.ps1)가 존재한다', existsSync(new URL(`../${PS}`, import.meta.url)))
check('진단 스크립트 런처(.bat)가 존재한다', existsSync(new URL(`../${BAT}`, import.meta.url)))

const psRaw = readFileSync(new URL(`../${PS}`, import.meta.url))
check(
  '.ps1이 UTF-8 BOM으로 시작한다 (Windows PowerShell 5.1이 한글 메시지를 깨지 않고 읽는 조건, setup-and-start-clinic.ps1과 동일 규약)',
  psRaw[0] === 0xef && psRaw[1] === 0xbb && psRaw[2] === 0xbf,
)

const ps = psRaw.toString('utf8')
const bat = readFileSync(new URL(`../${BAT}`, import.meta.url), 'utf8')

check(
  '.bat이 같은 폴더의 .ps1을 ExecutionPolicy Bypass로 부른다',
  bat.includes('%~dp0diagnose-clinic.ps1') && bat.includes('-ExecutionPolicy Bypass'),
)

// 실기기 사고(2026-09-21, setup-and-start-clinic.ps1 핫픽스)의 재발 방지:
// PowerShell 이중따옴표 문자열 안의 백슬래시-쌍따옴표(\") 이스케이프는
// 절대 쓰지 않는다 — 문자열이 조기 종료된다. 이 스크립트가 그 패턴을
// 다시 들여오지 않았는지 확인한다.
check(
  '.ps1이 이중따옴표 문자열 안에 깨지는 백슬래시-쌍따옴표(\\") 이스케이프를 쓰지 않는다',
  !/\\"/.test(ps),
)

// 진단이 실제로 확인해야 할 5개 축 — 이번 세션에서 원인 후보로 실제로
// 나왔던 것들 그대로(IP 불일치 / 네트워크 프로필 / 방화벽 규칙 / 4317·4173
// 리스닝 여부 / 실제 HTTP 응답).
for (const marker of [
  'VITE_SAMINDANG_SERVER_URL',
  'NetConnectionProfile',
  'NetFirewallRule',
  '4317',
  '4173',
  'api/health',
]) {
  check(`.ps1이 '${marker}' 관련 확인을 포함한다`, ps.includes(marker))
}

check(
  '.ps1이 저장소 경로를 하드코딩하지 않는다 ($PSScriptRoot로 해석 — start-clinic.bat의 옛 하드코딩 문제를 반복하지 않는다)',
  ps.includes('$PSScriptRoot') && !/google\s*drive/i.test(ps) && !/C:\\Users\\/i.test(ps),
)

check(
  '.ps1이 이 스크립트로 볼 수 없는 것(브라우저 콘솔 에러)을 명시적으로 인정한다 — 만능인 척하지 않는다',
  ps.includes('개발자 도구') || ps.includes('Console'),
)

console.log(`\nSUMMARY: ${passed} assertions passed, 0 failed (total ${passed})`)
