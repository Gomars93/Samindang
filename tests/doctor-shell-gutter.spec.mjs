/*
 * 진료 화면 좌우 여백(gutter) 계약 — 2026-10-02 PO가 실기기 스크린샷으로 지적:
 * "진료 전 요약" 제목과 진료/참고 탭이 화면 왼쪽 가장자리(left=0)에 붙어 있었다.
 *
 * 원인(헤드리스 Chromium 실측, 1920·1440 폭 모두): `.doctor:has(.doctor__visitShell)`가
 * .doctor 자신의 좌우 padding을 0으로 만들고 여백을 .doctor__visitShell에 맡겼는데,
 * 헤더·탭·배너는 .doctor의 직계 자식이라 셸 **밖**에 있다 -> 여백이 하나도 없었다.
 * 지은 쪽 화면(셸 안)에서는 옳았고, 지우지 않은 쪽(셸 밖)에서 깨졌다(CLAUDE.md 사고 4회와 같은 형태).
 *
 * 지운 경로(REMOVED): `.doctor__visitShell`의 자체 좌우 padding과 1440 max-width/auto margin.
 * 나르던 값(좌우 여백 24/32/48, 세로 태블릿 16, 1440 상한 가운데 정렬)은 전부 .doctor로 옮겼고,
 * 셸 본문의 화면상 위치는 그대로다(1920: left=288, 1440: left=48 실측).
 *
 * `npm run test:doctor-shell-gutter` (test:all에 포함).
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

let passed = 0
const check = (name, cond) => {
  assert.ok(cond, name)
  passed += 1
  console.log(`OK: ${name}`)
}

const css = readFileSync(new URL('../src/doctor/doctor.css', import.meta.url), 'utf8')
const tsx = readFileSync(new URL('../src/doctor/DoctorView.tsx', import.meta.url), 'utf8')

/** 선택자 하나의 선언 블록(첫 번째 일치)을 돌려준다. */
const block = (selector, from = 0) => {
  const i = css.indexOf(`${selector} {`, from)
  if (i < 0) return null
  return css.slice(i, css.indexOf('}', i) + 1)
}

const hasBase = block('.doctor:has(.doctor__visitShell)')
check('진료 화면 .doctor는 좌우 padding을 가진다(0이 아니다)', hasBase !== null && /padding:\s*28px 24px 96px/.test(hasBase))
check('진료 화면 .doctor는 box-sizing: border-box다(max-width 1440에 padding이 포함된다)', hasBase !== null && hasBase.includes('box-sizing: border-box'))
check('1280px 이상에서 .doctor 좌우 여백이 32px이다', /@media \(min-width: 1280px\) \{\s*\.doctor:has\(\.doctor__visitShell\) \{\s*padding-left: 32px;\s*padding-right: 32px;/.test(css))
check('1440px 이상에서 .doctor 좌우 여백이 48px이고 max-width가 1440px이다', /@media \(min-width: 1440px\) \{\s*\.doctor:has\(\.doctor__visitShell\) \{\s*padding-left: 48px;\s*padding-right: 48px;\s*max-width: 1440px;/.test(css))
check('세로 태블릿(<1024)에서 .doctor 좌우 여백이 16px이다', /@media \(max-width: 1023px\) and \(orientation: portrait\) \{[\s\S]*?\.doctor:has\(\.doctor__visitShell\) \{\s*padding-left: 16px;\s*padding-right: 16px;/.test(css))

// REMOVED: 셸 자신의 좌우 padding / 1440 상한은 더 이상 없다(이중 여백 방지).
const shellRules = [...css.matchAll(/\.doctor__visitShell \{[^}]*\}/g)].map((m) => m[0])
check('REMOVED: .doctor__visitShell 규칙 어디에도 좌우 padding이 없다(여백은 .doctor가 전담)',
  shellRules.length >= 3 && shellRules.every((r) => !/padding:\s*0 \d+px/.test(r) && !/padding-left|padding-right/.test(r)))
check('REMOVED: .doctor__visitShell에 1440 max-width/auto margin이 없다', shellRules.every((r) => !/max-width/.test(r) && !/margin:\s*0 auto/.test(r)))

// 헤더·탭이 실제로 .doctor 직계 자식(= 셸 밖)임을 소스로 고정한다 -- 이 구조가 바뀌면 이 계약도 다시 봐야 한다.
const header = tsx.indexOf('<header className="doctor__header">')
const tabs = tsx.indexOf('<nav className="doctor__recordTabs"')
check('헤더는 .doctor 직계 자식이다(셸 밖 -> .doctor의 여백이 필요하다) -- DoctorView.tsx에서 셸(.doctor__visitShell)보다 먼저 그려진다',
  header > tsx.indexOf('<div className="doctor">') && header < tsx.indexOf('doctor__visitShell'))
const workspace = readFileSync(new URL('../src/doctor/workspace/DoctorWorkspace.tsx', import.meta.url), 'utf8')
check('기록 탭(.doctor__recordTabs)은 DoctorView에서 그려지고, 셸(.doctor__visitShell) 본체는 DoctorWorkspace에서만 그려진다(탭은 셸 밖)',
  tabs > tsx.indexOf('<div className="doctor">') && workspace.includes('<div className="doctor__visitShell">') && !tsx.includes('<div className="doctor__visitShell">'))

console.log(`\nSUMMARY: ${passed} assertions passed, 0 failed (total ${passed})`)
