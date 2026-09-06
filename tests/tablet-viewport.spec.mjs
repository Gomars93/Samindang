/*
 * Rendered-layout acceptance for the Doctor default clinical workflow, on
 * the three viewports the clinic actually uses.
 *
 * WHY THIS EXISTS. Round 15 fixed a real regression: below 1100px the
 * primary 판단 / 처치 / 재검 grid fell into a single column, and the
 * 1024x768 landscape workflow measured 1192px = 1.55 viewports, over the
 * 1.5 budget. The fix depends on CSS source order, so round 15 added a
 * source-shape guard -- but a future change can satisfy that guard's text
 * and still regress the rendered height. Only measuring a real layout
 * proves the acceptance criteria, so this measures a real layout, in CI.
 *
 * WHY NO NEW DEPENDENCY. It drives the Chrome/Chromium that the CI runner
 * image already ships, over the DevTools Protocol, using node 22's global
 * WebSocket and a ~40-line static server built on node:http. No Playwright,
 * no Puppeteer, no browser download -- same instinct as
 * tests/bodymap-assets.spec.mjs hand-rolling a PNG decoder rather than
 * taking a dependency for one check.
 *
 * WHERE IT RUNS. Anywhere a Chrome binary is discoverable. When CI is set
 * and no browser is found, it FAILS -- an acceptance proof that silently
 * skips itself on the machine that matters is not a proof. Off CI it
 * prints a visible SKIP so a contributor without Chrome is not blocked.
 *
 * Run via `npm run test:tablet-viewport` (part of `npm run test:all`).
 */
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'

/* ---------------------------------------------------------------- config */

// Ceilings sit a little above the measured heights so ordinary text-metric
// variation between machines does not flap, and well under the 1.5-viewport
// budget so a real regression cannot hide beneath them.
//
// Core Reduction P2 (Phase 5 Synthesis v1.2 §2.1/§2.3, Phase 7 UI spec
// §2.3/§3.1/§3.3): the V3 shell adds four real, spec-required lane
// headings (안전 확인/확인/판단·처치/다음, each with its own
// aria-labelledby wiring), the §2.4 "+ 다른 유형 입력 추가" toggle, and
// the §2.5 "다음 방문 확인 메모" field -- legitimate new content, not
// padding bloat (the redundant inner "안전 확인" <h3> that WOULD have been
// pure duplication was removed instead of kept and budgeted for; see
// DoctorWorkspace.tsx's comment at workspace__block--safety). Desktop and
// portrait re-measured comfortably under the original 1.5-viewport budget
// with this new content; their ceilings below just reflect that new
// baseline with the same "a little above measured" headroom the original
// round-15 comment describes.
//
// tablet landscape 1024x768 (P5 closes the gap P2/P3 left open here): §3.1's
// own grid table fixes this breakpoint's right (content) column at only
// ≈700px (260px aside + 24px gutter + 24px×2 padding out of 1024px --
// Phase 4 §8.1's own "우측 열 폭 ≈ 700px 기준"), a full ~28% narrower than
// this same content occupied before the V3 shell (the aside did not exist
// yet). Round 15's 900-1100px tablet-landscape overrides (workspace.css)
// were tuned for that OLD full-width ~984px column and still fired at
// 1024px viewport width, but everything ELSE around them -- lane/next-pair
// spacing, final-assessment/hero/checklist padding and gaps, the 3-field
// primary grid staying 2-column when 677px of room fits it in one row
// instead -- was still sized for the wider column P2/P3 had not yet
// retuned (measured 1361px/768px = 1.77x, over budget). P5 retunes exactly
// those (doctor.css/workspace.css's own matching 1024-1279px media query,
// scoped so 1280+ and 834 portrait are untouched) -- content/field count is
// unchanged, only density and one grid rearrangement (the two always-
// present hero summary rows sit side by side instead of stacked). Measured
// 1090px/768px = 1.42x, back under the same 1.5x budget every other
// viewport already met, with the same "a little above measured" ceiling
// headroom as the other two rows.
const VIEWPORTS = [
  { name: 'desktop 1440x900', width: 1440, height: 900, ceiling: 1300, budget: 1.5 },
  { name: 'tablet landscape 1024x768', width: 1024, height: 768, ceiling: 1200, budget: 1.5 },
  { name: 'tablet portrait 834x1112', width: 834, height: 1112, ceiling: 1700, budget: 1.5 },
]
const MIN_TARGET = 36
/**
 * fixture 0(첫 예시 = "수면 주호소 + 동반 소화/통증", 한약 프로필)의 기본 열림
 * 입력. 이 값은 한약 판단 카드(최종 변증·병기 / 처방·계획 메모 / 추적할 증상)
 * + 한약 쪽 메모 한 칸이다 — 이전 주석이 "판단/처치/재검"이라 적은 것은 통증
 * 프로필로 오해한 것이었고(2026-09-06 확인), 통증 카드는 이 화면에 없다.
 * 한약 판단 필드에는 chip 같은 구조화 공급원이 없어 이번 배치에서 접지 않았다.
 */
const EXPECTED_OPEN_INPUTS_HERBAL = 4
/**
 * 2026-09-06 (원장 지시 "자유입력을 최대한 피하고 진료최적화"): **LBP(통증)
 * 프로필**의 기본 열림 자유입력은 처치 chip의 "기타" 한 칸뿐이다. 최종 임상
 * 판단·즉시 재검 대상·다음 방문 확인 메모 세 textarea가 "필요할 때 입력"
 * disclosure 안으로 들어갔다 — 삭제가 아니라 접기(EMR·환자 안내문·재진 경로
 * 불변, DECISIONS.md 2026-09-06). 이 값이 올라가면 누군가 자유입력을 기본
 * 화면에 다시 꺼낸 것이다. 통증 화면은 아래에서 LBP fixture를 골라 따로 잰다.
 */
const EXPECTED_OPEN_INPUTS_PAIN = 1
const LBP_FIXTURE_NAME_RE = /허리 통증 주호소 \(LBP/

let passed = 0
const check = (name, cond, extra = '') => {
  assert.ok(cond, `${name} ${extra}`)
  passed += 1
  console.log(`OK: ${name} ${extra}`)
}

/* --------------------------------------------------------- browser lookup */

function findChrome() {
  const fromEnv = [process.env.CHROME_BIN, process.env.CHROME_PATH].filter(Boolean)
  for (const p of fromEnv) if (fs.existsSync(p)) return p
  const names = ['google-chrome-stable', 'google-chrome', 'chromium-browser', 'chromium']
  for (const n of names) {
    const r = spawnSync('which', [n], { encoding: 'utf8' })
    if (r.status === 0 && r.stdout.trim()) return r.stdout.trim()
  }
  const paths = [
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/opt/pw-browsers/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ]
  for (const p of paths) if (fs.existsSync(p)) return p
  return null
}

/* ------------------------------------------------------------ static host */

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' }

function serve(root) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const rel = decodeURIComponent((req.url || '/').split('?')[0])
      let file = path.join(root, rel === '/' ? 'index.html' : rel)
      // SPA fallback: the app routes on the hash, so any unknown path is index.
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html')
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' })
      fs.createReadStream(file).pipe(res)
    })
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }))
  })
}

function freePort() {
  return new Promise((res) => {
    const s = net.createServer()
    s.listen(0, () => { const p = s.address().port; s.close(() => res(p)) })
  })
}

/* ------------------------------------------------------------------- CDP */

/** Minimal DevTools Protocol client over node 22's global WebSocket. */
class Cdp {
  constructor(ws) {
    this.ws = ws
    this.id = 0
    this.pending = new Map()
    ws.addEventListener('message', (e) => {
      const msg = JSON.parse(e.data)
      const p = this.pending.get(msg.id)
      if (!p) return
      this.pending.delete(msg.id)
      if (msg.error) p.reject(new Error(`${msg.error.message} (${JSON.stringify(msg.error.data ?? '')})`))
      else p.resolve(msg.result)
    })
  }
  send(method, params = {}) {
    const id = ++this.id
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }
  /** Evaluate in the page and return the value, retrying until `ready` or a timeout. */
  async evalUntil(expression, ready, timeoutMs = 20000) {
    const deadline = Date.now() + timeoutMs
    for (;;) {
      const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
      if (r.exceptionDetails === undefined && ready(r.result.value)) return r.result.value
      if (Date.now() > deadline) {
        throw new Error(`timed out waiting for page state; last value: ${JSON.stringify(r.result?.value)}`)
      }
      await new Promise((res) => setTimeout(res, 200))
    }
  }
}

async function connect(url) {
  for (let i = 0; i < 100; i += 1) {
    try {
      const ws = new WebSocket(url)
      await new Promise((res, rej) => {
        ws.addEventListener('open', res, { once: true })
        ws.addEventListener('error', rej, { once: true })
      })
      return ws
    } catch {
      await new Promise((r) => setTimeout(r, 200))
    }
  }
  throw new Error(`could not connect to ${url}`)
}

/* ------------------------------------------------- the measurement itself */

/*
 * Mirrors the local headless QA exactly: the CLINICAL WORKFLOW is the
 * record panel, not the whole document -- the page chrome above it is
 * navigation, not clinical content.
 *
 * checkVisibility() rather than a bounding rect: a CLOSED <details> still
 * reports a non-zero rect for its skipped content in Chromium, which is
 * how an earlier version of this measurement counted four open textareas
 * where three was correct.
 */
const MEASURE = `(() => {
  const panel = document.querySelector('.doctor__recordTabs')?.parentElement ?? document.body
  const clinical = [...panel.children].find((el) => el.tagName === 'DIV' && !el.hidden && el.querySelector('.workspace'))
  if (!clinical) return null
  const vis = (el) => (typeof el.checkVisibility === 'function' ? el.checkVisibility() : true)
  const targets = [...document.querySelectorAll('.workspace button, .workspace summary, .workspace select')]
    .filter(vis)
    .map((el) => { const r = el.getBoundingClientRect(); return Math.round(Math.min(r.width, r.height)) })
    .filter((n) => n > 0)
  const collapsed = document.querySelector('.workspace__observationChecklist--collapsed')
  const opener = collapsed?.querySelector('.workspace__observationSummary__open') ?? null
  const openerRect = opener ? opener.getBoundingClientRect() : null
  return {
    workflow: Math.round(clinical.getBoundingClientRect().height),
    viewport: window.innerHeight,
    overflowX: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
    openInputs: [...document.querySelectorAll('.workspace textarea, .workspace input[type="text"]')].filter(vis).length,
    smallestTarget: targets.length ? Math.min(...targets) : null,
    checklistCollapsed: !!collapsed,
    checklistSummary: collapsed?.querySelector('.workspace__observationSummary')?.textContent ?? '',
    openerVisible: !!opener && vis(opener),
    openerSize: openerRect ? Math.round(Math.min(openerRect.width, openerRect.height)) : null,
  }
})()`

/* ------------------------------------------------------------------- run */

const chrome = findChrome()
if (!chrome) {
  const msg = 'no Chrome/Chromium binary found (set CHROME_BIN to point at one)'
  if (process.env.CI) {
    // Deliberate: a rendered-layout acceptance proof that skips itself on CI
    // is not a proof. Fail loudly instead.
    throw new Error(`FAIL: ${msg} -- this check is required on CI`)
  }
  console.log(`SKIP: tablet viewport acceptance -- ${msg}`)
  process.exit(0)
}
console.log(`browser: ${chrome}`)

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'samindang-tablet-'))
const outDir = path.join(tmp, 'dist')
const profile = path.join(tmp, 'profile')

// A preview-context build, because round 13 gates the fixture picker on it:
// a plain production build has no UI path to a record, by design.
const build = spawnSync('npx', ['vite', 'build', '--outDir', outDir, '--emptyOutDir'], {
  env: { ...process.env, VITE_PREVIEW_MODE: 'true' },
  encoding: 'utf8',
})
assert.equal(build.status, 0, `preview build failed:\n${build.stdout}\n${build.stderr}`)

const { server, port } = await serve(outDir)
const debugPort = await freePort()
const proc = spawn(chrome, [
  '--headless=new',
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profile}`,
  '--no-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] })

let cdp = null
try {
  // Discover the page target the ordinary way, over the HTTP endpoint.
  let list = null
  for (let i = 0; i < 100 && !list; i += 1) {
    try {
      const r = await fetch(`http://127.0.0.1:${debugPort}/json/list`)
      const json = await r.json()
      list = json.find((t) => t.type === 'page') ?? null
    } catch { /* not up yet */ }
    if (!list) await new Promise((r) => setTimeout(r, 200))
  }
  assert.ok(list, 'chrome did not expose a page target')
  cdp = new Cdp(await connect(list.webSocketDebuggerUrl))
  await cdp.send('Runtime.enable')
  await cdp.send('Page.enable')

  for (const [vpIdx, vp] of VIEWPORTS.entries()) {
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: vp.width, height: vp.height, deviceScaleFactor: 1, mobile: false,
    })
    // 2026-09-06: 회차마다 query를 바꿔 **완전 새로고침**을 강제한다 — 같은 URL의
    // 해시만 바꾸는 navigate는 같은 문서 내 이동이라 React 상태(직전 회차가
    // 고른 LBP fixture)가 그대로 남아 첫 측정이 다른 프로필을 잰다.
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/?vp=${vpIdx}#doctor` })

    // Fixtures mode gives a deterministic, PHI-free record. Selecting it
    // needs a real change event, same as a click would produce.
    await cdp.evalUntil(`!!document.querySelector('#doctor-source-select')`, (v) => v === true)
    await cdp.send('Runtime.evaluate', {
      expression: `(() => {
        const s = document.querySelector('#doctor-source-select')
        s.value = 'fixtures'
        s.dispatchEvent(new Event('change', { bubbles: true }))
        return true
      })()`,
      returnByValue: true,
    })
    await cdp.evalUntil(`!!document.querySelector('.workspace')`, (v) => v === true)
    // The production-shaped record: no synthetic decision-support data.
    // fixture 0(한약)을 명시적으로 고른다 — 새로고침 외에 한 겹 더 방어.
    await cdp.send('Runtime.evaluate', {
      expression: `(() => {
        const s = document.querySelector('#doctor-fixture-select')
        if (!s) return false
        s.value = '0'
        s.dispatchEvent(new Event('change', { bubbles: true }))
        return true
      })()`,
      returnByValue: true,
    })
    await cdp.evalUntil(`!!document.querySelector('.workspace') && document.body.innerText.includes('최종 변증·병기')`, (v) => v === true)
    await cdp.send('Runtime.evaluate', {
      expression: `(() => {
        const s = document.querySelector('#doctor-workspace-scenario-select')
        if (!s) return false
        s.value = ''
        s.dispatchEvent(new Event('change', { bubbles: true }))
        return true
      })()`,
      returnByValue: true,
    })

    const m = await cdp.evalUntil(MEASURE, (v) => v && typeof v.workflow === 'number')
    const multiple = m.workflow / m.viewport
    const label = vp.name

    console.log(
      `\n[measured] ${label}: ${m.workflow}px / ${m.viewport}px = ${multiple.toFixed(2)}x` +
        ` | overflowX ${m.overflowX}px | ${m.openInputs} open inputs | smallest target ${m.smallestTarget}px`,
    )

    check(`${label}: clinical workflow within ${vp.budget} viewports`, multiple <= vp.budget, `(${multiple.toFixed(2)}x)`)
    check(`${label}: workflow height does not regress`, m.workflow <= vp.ceiling, `(${m.workflow}px <= ${vp.ceiling}px)`)
    check(`${label}: no horizontal overflow`, m.overflowX === 0, `(${m.overflowX}px)`)
    check(`${label}: no interactive target under ${MIN_TARGET}px`, m.smallestTarget !== null && m.smallestTarget >= MIN_TARGET, `(${m.smallestTarget}px)`)
    check(`${label}: exactly the intended always-open inputs (herbal fixture 0)`, m.openInputs === EXPECTED_OPEN_INPUTS_HERBAL, `(${m.openInputs})`)
    check(`${label}: the unrecorded checklist is collapsed, not deleted`, m.checklistCollapsed === true)
    check(`${label}: the collapsed summary still names what is outstanding`, /미확인/.test(m.checklistSummary), `("${m.checklistSummary.trim()}")`)
    check(
      `${label}: the collapsed checklist stays reachable at a tappable size`,
      m.openerVisible === true && m.openerSize !== null && m.openerSize >= MIN_TARGET,
      `(${m.openerSize}px)`,
    )

    // 2026-09-06: 통증(LBP) 프로필을 따로 잰다 — 이번 배치가 접은 세 칸이 실제
    // 헤드리스 렌더에서 보이지 않는지, 그리고 처치 "기타" 한 칸만 남는지.
    // 옵션은 인덱스가 아니라 이름으로 고른다(fixture 재정렬에 안전).
    const picked = await cdp.send('Runtime.evaluate', {
      expression: `(() => {
        const s = document.querySelector('#doctor-fixture-select')
        if (!s) return null
        const opt = [...s.options].find((o) => ${LBP_FIXTURE_NAME_RE.toString()}.test(o.textContent))
        if (!opt) return null
        s.value = opt.value
        s.dispatchEvent(new Event('change', { bubbles: true }))
        return opt.textContent
      })()`,
      returnByValue: true,
    })
    check(`${label}: an LBP fixture exists to measure the pain profile on`, typeof picked?.result?.value === 'string', `(${picked?.result?.value})`)
    // 한약 카드가 사라지고(통증 단일 프로필) 통증 최종판단 카드가 서면 렌더 완료.
    await cdp.evalUntil(
      `!!document.querySelector('.workspace') && !document.body.innerText.includes('최종 변증·병기') && !!document.querySelector('[aria-label="원장 최종 판단"]')`,
      (v) => v === true,
    )
    const mp = await cdp.evalUntil(MEASURE, (v) => v && typeof v.workflow === 'number')
    console.log(`[measured] ${label} (LBP): ${mp.workflow}px / ${mp.viewport}px = ${(mp.workflow / mp.viewport).toFixed(2)}x | overflowX ${mp.overflowX}px | ${mp.openInputs} open inputs`)
    check(`${label} (LBP): no horizontal overflow`, mp.overflowX === 0, `(${mp.overflowX}px)`)
    check(`${label} (LBP): exactly the intended always-open inputs`, mp.openInputs === EXPECTED_OPEN_INPUTS_PAIN, `(${mp.openInputs})`)
  }
} finally {
  try { cdp?.ws.close() } catch { /* already gone */ }
  proc.kill('SIGKILL')
  // Give the just-killed Chrome process a moment to actually release its
  // profile directory's file handles before removing it -- otherwise
  // rmSync can race a still-closing renderer process and throw ENOTEMPTY
  // (observed: every assertion printed OK, then the run died in teardown on
  // rmdir '<tmp>/profile/Default'). Same convention as
  // tests/visit-summary-auth-recovery-headless.spec.mjs, which already
  // carried this fix.
  await new Promise((r) => setTimeout(r, 300))
  server.close()
  try {
    fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  } catch {
    /* best-effort cleanup of a tmpdir -- never fail the test run over this */
  }
}

console.log(`\n${passed} tablet-viewport assertions passed.`)
