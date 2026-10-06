/*
 * 빌드 정보 계약 (2026-10-06): 설정 화면에서 "이 번들이 어느 커밋인가"를 확인한다.
 * 왜: 클리닉 PC에서 "최신 빌드 반영이 안 됐다"가 반복됐는데, 코드를 못 받은 것/빌드·서버 재시작을 안 한 것/브라우저
 * 캐시를 화면만 보고는 구분할 수 없었다. 환자 정보는 싣지 않는다(커밋 해시·빌드 시각만).
 * `npm run test:build-info` (test:all에 포함).
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { readBuildInfo, formatBuildInfo } from './.build-info-bundle.mjs'
import { execSync } from 'node:child_process'

let passed = 0
const check = (name, cond, extra = '') => {
  assert.ok(cond, `${name} ${extra}`)
  passed += 1
  console.log(`OK: ${name}`)
}
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

/* §A 안전한 읽기 — 주입 없음/깨짐에도 던지지 않는다 */
const unk = readBuildInfo()
check('A1 주입 없음 → commit unknown, 던지지 않음', unk.commit === 'unknown' && unk.dirty === false && unk.builtAt === null)
check('A2 시각을 모르면 문구가 그렇게 말한다', formatBuildInfo(unk).includes('빌드 시각 알 수 없음') && formatBuildInfo(unk).includes('unknown'))
check('A3 정상 값은 그대로 표시', formatBuildInfo({ commit: '5da8581', dirty: false, builtAt: '2026-10-06T05:00:00.000Z' }).startsWith('커밋 5da8581 · '))
check('A4 커밋 안 된 변경이 있으면 표시한다(해시만으로 재현 안 됨)', formatBuildInfo({ commit: 'abc1234', dirty: true, builtAt: null }).includes('커밋 안 된 변경 포함'))

/* §B 소스 계약 */
const vite = strip(read('vite.config.ts'))
check('B1 vite define이 빌드 정보를 주입', /define:\s*\{\s*__SAMINDANG_BUILD__:\s*JSON\.stringify\(readBuildInfo\(\)\)\s*\}/.test(vite))
check('B2 git 실패가 빌드를 막지 않는다(try/catch + unknown)', /catch\s*\{\s*return ''/.test(vite) && vite.includes("'unknown'"))
check('B3 환자 정보 필드가 없다(commit·dirty·builtAt뿐)', /return \{ commit, dirty, builtAt: new Date\(\)\.toISOString\(\) \}/.test(vite))
const dv = strip(read('src/doctor/DoctorView.tsx'))
const settings = dv.slice(dv.indexOf("screen === 'settings' && ("))
check('B4 설정 화면에 빌드 정보 한 줄', settings.includes('<h2>빌드 정보</h2>') && settings.includes('formatBuildInfo(readBuildInfo())'))
check('B5 기존 설정 섹션(워크스테이션·원장 인증)은 그대로', settings.includes('<h2>워크스테이션</h2>') && settings.includes('<h2>원장 인증</h2>'))
check('B6 진료 화면(헤더·레인)에는 넣지 않았다 — 높이 예산 불변', !/readBuildInfo/.test(dv.replace(/^import .*$/gm, '').slice(0, dv.replace(/^import .*$/gm, '').indexOf("screen === 'settings' && ("))))

/* §C 실제 git 값과 같은 형식 */
const head = execSync('git rev-parse --short HEAD').toString().trim()
check('C1 현재 HEAD 해시가 형식(4~40자리 16진수)을 통과', /^[0-9a-f]{4,40}$/.test(head))

console.log(`build-info: ${passed} assertions passed`)
