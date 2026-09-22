/*
 * 원장 화면의 두 가지 렌더 결함 회귀 고정.
 *
 * 둘 다 "소스만 읽어서는 멀쩡해 보이는" 종류라, **실제 Chromium에 렌더해
 * computed style과 geometry를 읽는다**. 소스 단언만 두면 규칙을 다른 곳으로
 * 옮기거나 더 구체적인 선택자가 덮어써도 조용히 통과한다.
 *
 *   §A 좌측 컨텍스트 열이 **모든** 뷰포트에서 sticky다
 *       -- `position: sticky`가 `@media (max-width:1023px) and (orientation:
 *          portrait)` 안에만 있어서, 실측상 27" 가로 2560×1440 / 27" 세로
 *          1440×2560 / 노트북 1440×900 세 곳 모두 static이었다. 판단·처치
 *          레인까지 스크롤하면 환자명과 레인1 안전 상태 칩이 화면에서
 *          사라졌다 -- 원장이 처치를 입력하는 바로 그 순간에.
 *
 *   §B 객관 소견 라디오 타겟이 44px 이상이다
 *       -- `judgment__radioOption`/`__radioRow`에 CSS 규칙이 **한 줄도 없어**
 *          브라우저 기본 <label> 그대로 높이 18px였다. 레인1을 URGENT로
 *          올릴 수 있는 안전 입력인데 화면에서 가장 작은 타겟이었다.
 *
 *   §C 소스 형태 가드 (위 둘이 되돌려지는 흔한 방식을 이름으로 막는다)
 *
 * 브라우저가 없으면: CI에서는 FAIL(조용히 건너뛰는 증명은 증명이 아니다),
 * 로컬에서는 눈에 보이는 SKIP -- `tests/tablet-viewport.spec.mjs`와 같은 규율.
 *
 * 실행: `npm run test:doctor-target-size` (`npm run test:all`에 포함)
 */
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { DOCTOR_FIXTURES } from './.doctor-fixtures-bundle.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(here, '..')
const require = createRequire(path.join(here, 'x.cjs'))

let passed = 0
const failures = []
const ok = (label, cond, extra = '') => {
  if (cond) passed += 1
  else failures.push(`${label} ${extra}`.trim())
}

/* ---------------- §C 소스 형태 가드 (브라우저 없이도 돈다) ---------------- */

const css = fs.readFileSync(path.join(ROOT, 'src/doctor/doctor.css'), 'utf8')

/**
 * `.doctor__visitSummary`의 sticky가 **미디어쿼리 밖**(기본 규칙)에 있는지.
 * 중괄호 깊이를 세서 판정한다 -- 깊이 0에서 열린 블록만이 모든 뷰포트에
 * 적용된다.
 */
function stickyAtTopLevel(src) {
  let depth = 0
  let inTargetBlock = false
  let blockDepth = -1
  let found = false
  const lines = src.split('\n')
  for (const line of lines) {
    if (!inTargetBlock && /^\.doctor__visitSummary\s*\{/.test(line.trim()) && depth === 0) {
      inTargetBlock = true
      blockDepth = depth
    }
    for (const ch of line) {
      if (ch === '{') depth += 1
      else if (ch === '}') {
        depth -= 1
        if (inTargetBlock && depth === blockDepth) inTargetBlock = false
      }
    }
    if (inTargetBlock && /position:\s*sticky/.test(line)) found = true
  }
  return found
}

ok('§C .doctor__visitSummary의 sticky가 미디어쿼리 밖 기본 규칙에 있다', stickyAtTopLevel(css))
ok('§C .judgment__radioOption 규칙이 존재한다', /\.judgment__radioOption\s*\{/.test(css))
ok('§C .judgment__radioOption이 min-height 44px 이상을 선언한다', /\.judgment__radioOption\s*\{[^}]*min-height:\s*(4[4-9]|[5-9]\d|\d{3,})px/s.test(css))
ok(
  '§C 선택 상태를 색 하나로만 구분하지 않는다 (테두리+배경+굵기)',
  /:has\(input:checked\)\s*\{[^}]*border-color[^}]*background[^}]*font-weight/s.test(css),
)
ok('§C 라디오 입력 자체에 포커스 링이 있다', /\.judgment__radioOption:focus-within\s*\{[^}]*outline/s.test(css))

/* ---------------- 브라우저 준비 ---------------- */

function findChrome() {
  for (const p of [process.env.CHROME_BIN, process.env.CHROME_PATH].filter(Boolean)) {
    if (fs.existsSync(p)) return p
  }
  for (const n of ['google-chrome-stable', 'google-chrome', 'chromium-browser', 'chromium']) {
    const r = spawnSync('which', [n], { encoding: 'utf8' })
    if (r.status === 0 && r.stdout.trim()) return r.stdout.trim()
  }
  for (const p of ['/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/usr/bin/chromium', '/opt/pw-browsers/chromium']) {
    if (fs.existsSync(p)) return p
  }
  return null
}

const chrome = findChrome()
if (!chrome) {
  if (process.env.CI) {
    console.error('✗ doctor-target-size: CI인데 Chrome을 찾지 못했다. 렌더 증명이 조용히 건너뛰어지면 증명이 아니다.')
    process.exit(1)
  }
  console.log(`SKIP: doctor-target-size 렌더 측정 (Chrome 없음). §C 소스 가드 ${passed}건은 통과.`)
  if (failures.length) {
    for (const f of failures) console.error(`  - ${f}`)
    process.exit(1)
  }
  process.exit(0)
}

/* ---------------- 렌더 준비 (SSR + 실제 CSS) ---------------- */

const { DoctorView } = require(path.join(ROOT, 'tests/.doctor-view-bundle.cjs'))
const fixtureIndex = DOCTOR_FIXTURES.findIndex((f) => f.name.includes('허리 통증 주호소'))
if (fixtureIndex < 0) {
  console.error('✗ doctor-target-size: 허리 통증 픽스처를 찾지 못했다')
  process.exit(1)
}

const allCss = ['src/doctor/doctor.css', 'src/doctor/workspace/workspace.css', 'src/styles.css']
  .map((p) => fs.readFileSync(path.join(ROOT, p), 'utf8'))
  .join('\n')

const body = renderToString(React.createElement(DoctorView, { initialFixtureIndex: fixtureIndex }))
const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>${allCss}</style></head><body><div id="root">${body}</div></body></html>`

const server = http.createServer((_q, r) => {
  r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
  r.end(html)
})
await new Promise((res) => server.listen(0, '127.0.0.1', res))
const port = server.address().port

const udir = path.join(ROOT, 'node_modules', '.cache', `target-size-${process.pid}`)
const dbgPort = 9500 + (process.pid % 400)
const proc = spawn(
  chrome,
  ['--headless=new', `--remote-debugging-port=${dbgPort}`, `--user-data-dir=${udir}`, '--no-sandbox', '--disable-gpu', '--hide-scrollbars'],
  { stdio: 'ignore' },
)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let wsUrl = null
for (let i = 0; i < 80 && !wsUrl; i++) {
  await sleep(250)
  try {
    const list = await (await fetch(`http://127.0.0.1:${dbgPort}/json/list`)).json()
    wsUrl = list.find((t) => t.type === 'page')?.webSocketDebuggerUrl ?? null
  } catch {
    /* 아직 안 뜸 */
  }
}

async function finish(code) {
  proc.kill()
  server.close()
  try {
    fs.rmSync(udir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })
  } catch {
    /* 헤드리스 Chrome이 프로필을 늦게 놓아줄 때가 있다 */
  }
  process.exit(code)
}

if (!wsUrl) {
  console.error('✗ doctor-target-size: Chrome이 뜨지 않았다')
  await finish(1)
}

const sock = new WebSocket(wsUrl)
await new Promise((res, rej) => {
  sock.addEventListener('open', res)
  sock.addEventListener('error', rej)
})
let msgId = 0
const pending = new Map()
sock.addEventListener('message', (e) => {
  const m = JSON.parse(e.data)
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m)
    pending.delete(m.id)
  }
})
const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const id = ++msgId
    pending.set(id, res)
    sock.send(JSON.stringify({ id, method, params }))
    setTimeout(() => {
      if (pending.delete(id)) rej(new Error(`CDP timeout: ${method}`))
    }, 30000)
  })

await send('Page.enable')
await send('Runtime.enable')

const PROBE = `(() => {
  const out = {}
  const sum = document.querySelector('.doctor__visitSummary')
  out.summary = sum ? { position: getComputedStyle(sum).position } : null
  const radios = [...document.querySelectorAll('.judgment__radioOption')]
  out.radioCount = radios.length
  out.radioHeights = radios.map((r) => Math.round(r.getBoundingClientRect().height))
  out.radioWidths = radios.map((r) => Math.round(r.getBoundingClientRect().width))
  return JSON.stringify(out)
})()`

/*
 * 원장이 실제로 쓰는 뷰포트. 27" QHD는 가로/세로 둘 다 쓰므로 둘 다 본다 --
 * 결함 1이 정확히 이 둘에서 났고, 태블릿 하나만 보던 옛 규칙이 원인이었다.
 */
const VIEWPORTS = [
  { name: '27" 가로 2560×1440', w: 2560, h: 1440 },
  { name: '27" 세로 1440×2560', w: 1440, h: 2560 },
  { name: '노트북 1440×900', w: 1440, h: 900 },
  { name: '태블릿 세로 834×1112', w: 834, h: 1112 },
]

const MIN_TARGET = 44

for (const vp of VIEWPORTS) {
  await send('Emulation.setDeviceMetricsOverride', { width: vp.w, height: vp.h, deviceScaleFactor: 1, mobile: false })
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/` })
  await sleep(800)
  const res = await send('Runtime.evaluate', { expression: PROBE, returnByValue: true })
  const v = JSON.parse(res.result.result.value)

  ok(`§A [${vp.name}] 좌측 컨텍스트 열이 존재한다`, v.summary !== null)
  ok(
    `§A [${vp.name}] 좌측 컨텍스트 열이 sticky다`,
    v.summary?.position === 'sticky',
    `(실측: ${v.summary?.position})`,
  )

  ok(`§B [${vp.name}] 객관 소견 라디오가 렌더된다`, v.radioCount > 0, `(${v.radioCount}개)`)
  const tooShort = v.radioHeights.filter((h) => h < MIN_TARGET)
  ok(
    `§B [${vp.name}] 모든 라디오 타겟이 ${MIN_TARGET}px 이상이다`,
    tooShort.length === 0,
    tooShort.length ? `(위반: ${tooShort.join(', ')}px / 전체: ${v.radioHeights.join(', ')}px)` : `(${v.radioHeights.join(', ')}px)`,
  )
  // 가로도 충분해야 실제로 누를 수 있다 -- 세로만 키우고 폭이 글자만큼이면
  // 여전히 겨냥해야 한다.
  ok(
    `§B [${vp.name}] 라디오 타겟 폭이 ${MIN_TARGET}px 이상이다`,
    v.radioWidths.every((w) => w >= MIN_TARGET),
    `(${v.radioWidths.join(', ')}px)`,
  )
}

/* ---------------- 결과 ---------------- */

if (failures.length) {
  console.error(`\n✗ doctor-target-size: ${failures.length}건 실패 / ${passed}건 통과\n`)
  for (const f of failures) console.error(`  - ${f}`)
  await finish(1)
}
console.log(`✓ doctor-target-size: ${passed}건 단언 통과 (뷰포트 ${VIEWPORTS.length}개 실측)`)
await finish(0)
