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
 *
 * 2026-09-21 PR-A(한약 화면 축소, PO "다음 섹션은 폐기 / 액기스만 남긴다"):
 * 4 → 3. 줄어든 한 칸은 `다음` 레인의 "다음 방문 확인 메모" textarea이고,
 * 남은 3칸은 판단·처치 레인의 한약 판단 카드 세 칸 그대로다. 이 값이 다시
 * 올라가면 누군가 자유입력을 기본 화면에 꺼낸 것이고, 3 아래로 내려가면
 * 한약 판단 3칸 중 하나가 사라진 것이다 — 양방향 모두 확인 대상.
 */
const EXPECTED_OPEN_INPUTS_HERBAL = 3
/**
 * 2026-09-06 (원장 지시 "자유입력을 최대한 피하고 진료최적화"): **LBP(통증)
 * 프로필**의 기본 열림 자유입력은 처치 chip의 "기타" 한 칸뿐이다. 최종 임상
 * 판단·즉시 재검 대상·다음 방문 확인 메모 세 textarea가 "필요할 때 입력"
 * disclosure 안으로 들어갔다 — 삭제가 아니라 접기(EMR·환자 안내문·재진 경로
 * 불변, DECISIONS.md 2026-09-06). 이 값이 올라가면 누군가 자유입력을 기본
 * 화면에 다시 꺼낸 것이다. 통증 화면은 아래에서 LBP fixture를 골라 따로 잰다.
 */
const EXPECTED_OPEN_INPUTS_PAIN = 1
// 점프 내비(안 A) 크롬 높이 상한: 버튼 44(≤1023px에서 48) + 패딩 12 + 테두리 1 + margin 8.
const NAV_MAX_HEIGHT = 72
const LBP_FIXTURE_NAME_RE = /허리 통증 주호소 \(LBP/
/**
 * 2026-09-06 플로우 정렬 2/5: 레인1 안전 블록은 합집합 CLEAR면 접힌다. 위 LBP
 * fixture는 "확인 필요"라 열려 있으므로(접힘의 효과가 보이지 않음), **CLEAR인
 * LBP fixture**를 따로 재서 접힘이 실제로 적용됐는지(요약 줄 "전 부위 안전")와
 * 높이를 본다. 원장의 전형적 환자는 이쪽이다.
 */
const LBP_CLEAR_FIXTURE_NAME_RE = /허리 통증 주호소 \+ 추가 상세상담/

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
  // 점프 내비(안 A)는 sticky bottom 내비 크롬이다: 스크롤 중에는 화면 하단에
  // 떠 있고 콘텐츠 끝에서만 자기 높이를 차지한다. "임상 워크플로 높이"는
  // 콘텐츠 높이이므로 내비 높이(+margin)는 빼서 잰다 -- 대신 내비 자체의
  // 높이는 아래 별도 상한(NAV_MAX_HEIGHT)으로 잡아, 크롬이 조용히 자라
  // 화면을 잡아먹는 회귀는 따로 실패하게 한다.
  const nav = clinical.querySelector('.doctor__laneNav')
  const navHeight = nav ? Math.round(nav.getBoundingClientRect().height + parseFloat(getComputedStyle(nav).marginTop || '0')) : 0
  return {
    workflow: Math.round(clinical.getBoundingClientRect().height) - navHeight,
    navHeight,
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
      `\n[measured] ${label}: ${m.workflow}px / ${m.viewport}px = ${multiple.toFixed(2)}x (nav chrome ${m.navHeight}px excluded)` +
        ` | overflowX ${m.overflowX}px | ${m.openInputs} open inputs | smallest target ${m.smallestTarget}px`,
    )

    check(`${label}: clinical workflow within ${vp.budget} viewports`, multiple <= vp.budget, `(${multiple.toFixed(2)}x)`)
    check(`${label}: workflow height does not regress`, m.workflow <= vp.ceiling, `(${m.workflow}px <= ${vp.ceiling}px)`)
    check(`${label}: the jump nav chrome stays under ${NAV_MAX_HEIGHT}px (it occupies the viewport bottom while scrolling)`, m.navHeight > 0 && m.navHeight <= NAV_MAX_HEIGHT, `(${m.navHeight}px)`)
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

    /*
     * PR-B2(2026-09-21) 한약 상담 중단 사유(red flag): 이 카드는 레인1에
     * **항상 보이므로** 그 높이가 기본 화면에 그대로 얹힌다. 처음 구성
     * (제목/안내/칩을 각자 줄에)에서는 기본 화면이 871 → 996px(+125px)로
     * 늘어, PR-A가 한약 화면을 한 화면에 넣은 성과를 바로 깎아먹었다.
     * 한 wrap 줄로 합치고 패딩을 조여 62px까지 줄였다.
     *
     * 안전 정보를 더 줄이지는 않는다 -- 읽기 어려워지면 존재 이유가 없어진다.
     * 대신 **카드 자체의 높이**를 예산으로 고정해, 나중에 여기에 무언가
     * 덧붙으면서 조용히 커지는 것을 막는다.
     */
    const redFlagHeight = (
      await cdp.send('Runtime.evaluate', {
        expression: `(() => {
          const el = document.querySelector('.workspace__redFlag')
          return el ? Math.round(el.getBoundingClientRect().height) : -1
        })()`,
        returnByValue: true,
      })
    ).result?.value
    check(
      `${label}: 한약 상담 중단 사유 카드가 레인1에 렌더된다`,
      typeof redFlagHeight === 'number' && redFlagHeight > 0,
      `(${redFlagHeight}px)`,
    )
    check(
      `${label}: 그 카드 높이가 100px를 넘지 않는다 (항상 보이는 자리라 기본 화면에 그대로 얹힌다)`,
      // 100px은 뷰포트별 실측 최대(태블릿 가로 87px — 폭이 좁아 칩이 한 줄 더
      // 감긴다)에 여유를 둔 값이다. PC(1440)에서는 62px 한 줄로 들어간다.
      redFlagHeight <= 100,
      `(${redFlagHeight}px)`,
    )

    /*
     * PR-B1(2026-09-21) 설맥복 체크식: 위 측정은 체크리스트가 **접힌** 기본
     * 상태다. 체크식의 실제 비용(칩 23개 + ＋ 전체 손잡이 3개)은 원장이
     * "빠른 입력"을 눌러 펼친 뒤에야 화면에 나타나므로, 그 상태를 따로
     * 잰다 -- 접힌 상태만 재고 "높이 변화 없음"이라고 말하는 것은 측정하지
     * 않은 것을 측정했다고 말하는 것이다.
     *
     * 여기서 확인하는 것은 (1) 펼친 화면이 천장을 넘지 않는지, (2) 칩이
     * 가로 오버플로를 만들지 않는지, (3) 새 칩도 36px 하한을 지키는지.
     * ＋ 전체 서랍은 일부러 열지 않는다 -- 2층은 "필요할 때만 여는 자리"이고,
     * 늘 열린 상태를 기본 예산으로 잡으면 2층을 만든 이유가 없어진다.
     */
    await cdp.send('Runtime.evaluate', {
      expression: `(() => {
        const btns = [...document.querySelectorAll('button')]
        const opener = btns.find((b) => b.textContent.trim() === '빠른 입력')
        if (!opener) return 'already-open'
        opener.click()
        return 'opened'
      })()`,
      returnByValue: true,
    })
    await cdp.evalUntil(`document.querySelectorAll('.workspace__obsChip').length`, (v) => typeof v === 'number' && v > 0)
    const me = await cdp.evalUntil(MEASURE, (v) => v && typeof v.workflow === 'number')
    const chipCount = (
      await cdp.send('Runtime.evaluate', {
        /*
         * **보이는** 칩만 센다. <details>는 닫혀 있어도 자식을 DOM에 유지하므로
         * querySelectorAll만으로는 2층 칩까지 세어 60개가 나온다(실측에서
         * 실제로 그랬다) -- 그 숫자는 "화면 부하"와 아무 상관이 없다.
         */
        /*
         * 레인2 체크리스트 안의 칩만 센다 -- 레인1의 red flag 칩 3개(PR-B2)도
         * 같은 .workspace__obsChip 클래스를 쓰므로, 범위를 좁히지 않으면 26이
         * 나와 "1층 23칸" 계약과 무관한 숫자를 감시하게 된다.
         */
        expression: `[...document.querySelectorAll('.workspace__observationChecklist .workspace__obsChip')].filter((el) => typeof el.checkVisibility === 'function' ? el.checkVisibility() : el.offsetParent !== null).length`,
        returnByValue: true,
      })
    ).result?.value
    console.log(
      `[measured] ${label} (설맥복 펼침): ${me.workflow}px / ${me.viewport}px = ${(me.workflow / me.viewport).toFixed(2)}x` +
        ` | overflowX ${me.overflowX}px | 펼침 비용 +${me.workflow - m.workflow}px | 1층 칩 ${chipCount}개 | smallest target ${me.smallestTarget}px`,
    )
    check(
      `${label} (설맥복 펼침): 1층 칩 23개가 실제로 렌더된다 (설 8 + 맥 9 + 복 6)`,
      chipCount === 23,
      `(${chipCount})`,
    )
    /*
     * 펼친 상태의 예산은 **접힌 상태의 천장(vp.ceiling)을 빌려 쓰지 않는다.**
     * 그 값들은 "아무것도 기록되지 않은 기본 화면"을 기준으로 잡힌 것이라,
     * 원장이 설맥복을 펼쳐 입력하는 다른 상태에 그대로 들이대는 것은 측정
     * 대상을 바꿔치기하는 것이다. 대신 두 가지를 각각 고정한다:
     *
     *  (1) 화면 배수 ≤ 2.0 — 펼쳐도 **한 번 스크롤이면 끝까지 닿는다**가
     *      이 화면의 실질적 요구다. 실측 최대는 태블릿 가로 1.60배.
     *  (2) 펼침 비용 ≤ 560px — 칩 블록 자체가 더해지는 높이. 뷰포트와
     *      거의 무관한 값이라 회귀 감시에 더 예민하다. 실측: PC +354,
     *      태블릿 가로 +504, 태블릿 세로 +378. 최대값 504에 약 11% 여유.
     *
     * (2)가 핵심 감시선이다 -- 누군가 칩을 늘리거나 줄 구성을 되돌리면
     * 배수보다 먼저 여기서 걸린다. 실제로 이 배치에서 세 번 걸렸다:
     * 처음 블록당 세 줄 구성이 +654px, grid-column 전 폭 시도가 +822px,
     * 한 wrap 줄로 합친 지금이 +354~504px.
     */
    const expandCost = me.workflow - m.workflow
    check(
      `${label} (설맥복 펼침): 펼쳐도 2화면 이내 — 한 번 스크롤로 끝까지 닿는다`,
      me.workflow / me.viewport <= 2.0,
      `(${(me.workflow / me.viewport).toFixed(2)}x)`,
    )
    check(
      `${label} (설맥복 펼침): 펼침 비용이 560px를 넘지 않는다 (칩 블록이 더하는 높이)`,
      expandCost <= 560,
      `(+${expandCost}px)`,
    )
    check(`${label} (설맥복 펼침): 가로 오버플로 없음`, me.overflowX === 0, `(${me.overflowX}px)`)
    check(
      `${label} (설맥복 펼침): 새 칩도 ${MIN_TARGET}px 하한을 지킨다`,
      me.smallestTarget !== null && me.smallestTarget >= MIN_TARGET,
      `(${me.smallestTarget}px)`,
    )

    /*
     * PO 지시 2026-09-26(안 1): 「마무리」 단계를 **한약 단독에도** 준다.
     *
     * 왜 진짜 브라우저에서 한약 쪽을 따로 재는가: PR-A(2026-09-21)는 한약
     * 단독에서 이 단계를 통째로 없앴고, 그 안에 EMR 요약·복사 · 재진 간단
     * 문진 발급 · **진료 완료**가 함께 들어 있어서 한약 단독 방문은 그 방문
     * 안에서 진료를 끝낼 수 없었다(PR #57 검수 1번). 이제 가드를 뗐으므로
     * 한약 화면에도 숨은 단계 하나가 DOM에 얹힌다.
     *
     * 그 얹힘이 **높이 0이어야** PR-A가 줄인 한약 화면 성과가 그대로 남는다.
     * 그리고 그 근거는 UA의 `[hidden] { display: none }` 한 줄뿐이라, CSS가
     * 그걸 이기면 SSR 단언(hidden 속성만 본다)은 전부 통과하면서 한약 화면이
     * 조용히 두 배로 길어진다. 위 LBP 블록과 같은 계약을, 이번에는 **가드를
     * 뗀 쪽**에서 잰다 -- CLAUDE.md가 네 번의 사고 끝에 적어둔 "확인해야 하는
     * 것은 지우지 않은 쪽 화면이다"의 이번 배치판이다.
     *
     * PR #58 검수 1번으로 한 번 고쳐졌다. 여기는 **fixtures 모드**라
     * `nextLaneFooter`가 안 들어오고(server 전용), 그래서 한약 마무리 단계에는
     * 넣을 것이 없다. 그 상태에서 점프 버튼을 내면 원장을 헤딩만 남은 빈
     * 화면으로 데려가므로, 버튼은 **없는 것이 옳다**. 첫 판은 버튼이 항상
     * 있다고 단언해서 그 결함을 그대로 통과시켰다.
     *
     * 그래서 이 블록이 재는 것은 두 가지로 갈린다:
     *  (1) 단계 래퍼는 있고, 숨은 채 높이 0이다 -- `hidden`이 CSS에 먹히는지를
     *      실브라우저에서 확인하는 것이 이 스위트의 목적이고, 래퍼를 조건 없이
     *      둔 덕분에 herbal에서도 그대로 성립한다.
     *  (2) 그런데 그 단계로 가는 **버튼은 없다** -- 갈 데가 없기 때문이다.
     * 푸터가 있을 때 버튼이 생긴다는 쪽은 브라우저에서 prop을 주입할 수 없어
     * `doctor-workspace`의 「PR #58 검수1」 단언이 stand-in으로 확인한다.
     */
    const herbalStepMetrics = `(() => {
      const box = (sel) => {
        const el = document.querySelector(sel)
        if (!el) return null
        const r = el.getBoundingClientRect()
        return { h: Math.round(r.height), visible: typeof el.checkVisibility === 'function' ? el.checkVisibility() : r.height > 0 }
      }
      const nav = document.querySelector('.doctor__laneNav')
      return {
        consult: box('.doctor__visitStep[data-step="consult"]'),
        wrapup: box('.doctor__visitStep[data-step="wrapup"]'),
        navLabels: nav ? [...nav.querySelectorAll('.doctor__laneNav__btn')].map((b) => b.textContent) : null,
        /*
         * PR-A가 herbal 단독에서 뗀 블록이 「마무리」 단계를 열어주면서 따라
         * 들어오지 않았는지. 화면 블록이라 innerText로 잡힌다.
         * medicationCourseSlot은 prop이라 fixtures에 애초에 안 들어오므로
         * 여기서 보지 않는다 -- 보면 가드를 지워도 통과하는 공허한 단언이
         * 된다(PR #58 검수 3번). 그쪽은 doctor-workspace가 stand-in으로
         * 확인한다.
         * (이 주석은 JS 템플릿 리터럴 안이다 -- 백틱을 쓰면 문자열이 끊긴다.)
         */
        herbalNextBlocks: /다음 방문 확인 메모|관리 계획 · 다음 재평가/.test(document.body.innerText),
      }
    })()`
    /*
     * 기다림의 조건은 `consult`만으로 둔다 -- `wrapup`까지 기다리면, 누군가
     * 바깥 프로필 가드를 되살려 한약에서 마무리 단계를 다시 없앴을 때 이
     * 스위트가 **이름 있는 실패 대신 20초 타임아웃**으로 죽는다(실제로 그렇게
     * 죽는 것을 확인했고, 그러면 같은 뷰포트의 나머지 단언까지 통째로
     * 날아간다). 존재 여부는 아래에서 check로 단언한다.
     */
    const hBefore = await cdp.evalUntil(herbalStepMetrics, (v) => v && v.consult)
    console.log(
      `[measured] ${label} (한약 단독): 진료 화면 ${hBefore.consult.h}px / 마무리 화면 ${hBefore.wrapup?.h ?? '없음'}px (숨김)` +
        ` | 내비 ${hBefore.navLabels?.join(',')}`,
    )
    check(
      `${label} (한약 단독): 마무리 단계가 DOM에 생겼다 (PR #57 검수 1번의 구멍이 메워졌다)`,
      !!hBefore.wrapup,
      '(바깥 프로필 가드가 되살아났는지 확인)',
    )
    check(
      `${label} (한약 단독): 그 단계가 숨은 상태에서 높이 0이다 — 한약 화면이 길어지지 않았다`,
      hBefore.wrapup?.h === 0 && hBefore.wrapup?.visible === false,
      `(${hBefore.wrapup?.h}px, visible=${hBefore.wrapup?.visible})`,
    )
    check(
      `${label} (한약 단독): 진료 화면은 실제 높이를 갖는다 (자기점검 — 둘 다 0이면 위 단언이 헛돈다)`,
      hBefore.consult.h > 300,
      `(${hBefore.consult.h}px)`,
    )
    check(
      `${label} (한약 단독): 점프 내비가 3개 — 갈 데 없는 「마무리」 버튼을 내지 않는다 (fixtures 모드엔 푸터가 없다)`,
      Array.isArray(hBefore.navLabels) && hBefore.navLabels.join(',') === '안전,확인,판단·처치',
      `(${hBefore.navLabels})`,
    )
    check(
      `${label} (한약 단독): 그래서 마무리 단계는 열 수 없다 — DOM에는 있고(위) 도달 경로만 없다`,
      hBefore.navLabels.every((l) => l !== '마무리'),
    )
    check(
      `${label} (한약 단독): PR-A가 뗀 화면 블록(다음 방문 확인 메모 · 관리 계획·다음 재평가)은 여전히 없다`,
      hBefore.herbalNextBlocks === false,
    )
    /*
     * 비공허성은 같은 브라우저 세션의 위쪽 LBP 단언이 준다 -- "점프 내비가
     * 5개 버튼으로 렌더된다(…,마무리)". 통증에서는 버튼이 나오고 한약에서는
     * 안 나오므로, 여기 3개가 "내비가 그냥 고장났다"가 아니라 "조건이 옳게
     * 걸렸다"임이 확인된다.
     */
    await cdp.send('Runtime.evaluate', { expression: `window.scrollTo(0, 0)`, returnByValue: true })

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
    const lane1WrapperOnReview = await cdp.send('Runtime.evaluate', { expression: `!!document.querySelector('.doctor__lane1Collapse')`, returnByValue: true })
    check(`${label} (LBP 확인 필요): 레인1 래퍼가 없다 (비CLEAR에 요약 줄을 얹지 않는다)`, lane1WrapperOnReview?.result?.value === false)
    check(`${label} (LBP): no horizontal overflow`, mp.overflowX === 0, `(${mp.overflowX}px)`)
    check(`${label} (LBP): exactly the intended always-open inputs`, mp.openInputs === EXPECTED_OPEN_INPUTS_PAIN, `(${mp.openInputs})`)

    // 점프 내비(안 A, PO "추천에 따라 진행"): 운동 후보가 첫 화면 아래에 있다는
    // 실측 문제를 (1) 그대로 측정하고 (2) 내비 한 번 탭으로 닿는지 실제
    // 브라우저에서 확인한다. 내비는 sticky bottom이므로 스크롤 0에서도 화면
    // 안에 있어야 하고, 점프 뒤 헤딩은 sticky 헤더 아래에 보여야 한다.
    await cdp.send('Runtime.evaluate', { expression: `window.scrollTo(0, 0)`, returnByValue: true })
    const navBefore = await cdp.send('Runtime.evaluate', {
      expression: `(() => {
        const nav = document.querySelector('.doctor__laneNav')
        const ex = document.getElementById('exercise-h3')
        if (!nav || !ex) return null
        const r = nav.getBoundingClientRect()
        const btns = [...nav.querySelectorAll('.doctor__laneNav__btn')]
        return {
          labels: btns.map((b) => b.textContent),
          minBtn: Math.min(...btns.map((b) => { const q = b.getBoundingClientRect(); return Math.round(Math.min(q.width, q.height)) })),
          navTop: Math.round(r.top), navBottom: Math.round(r.bottom), inner: window.innerHeight,
          exerciseTop: Math.round(ex.getBoundingClientRect().top),
        }
      })()`,
      returnByValue: true,
    })
    const nb = navBefore?.result?.value
    check(`${label} (LBP): 점프 내비가 5개 버튼으로 렌더된다`, Array.isArray(nb?.labels) && nb.labels.join(',') === '안전,확인,판단·처치,운동,마무리', `(${nb?.labels})`)
    check(`${label} (LBP): 스크롤 0에서 내비가 화면 안에 있다 (sticky bottom)`, nb && nb.navTop >= 0 && nb.navBottom <= nb.inner, `(top ${nb?.navTop}, bottom ${nb?.navBottom}, viewport ${nb?.inner})`)
    check(`${label} (LBP): 내비 버튼이 ${MIN_TARGET}px 이상`, nb && nb.minBtn >= MIN_TARGET, `(${nb?.minBtn}px)`)
    console.log(`[measured] ${label} (LBP): 운동 섹션 top = ${nb?.exerciseTop}px (viewport ${nb?.inner}px) → ${nb ? (nb.exerciseTop / nb.inner).toFixed(1) : '?'} 화면 아래`)
    await cdp.send('Runtime.evaluate', { expression: `document.querySelector('.doctor__laneNav__btn[data-target="exercise-h3"]').click()`, returnByValue: true })
    const afterJump = await cdp.evalUntil(
      `(() => {
        const ex = document.getElementById('exercise-h3')
        const header = document.querySelector('.doctor__header')
        const nav = document.querySelector('.doctor__laneNav')
        if (!ex || !nav) return null
        return {
          exerciseTop: Math.round(ex.getBoundingClientRect().top),
          headerBottom: header ? Math.round(header.getBoundingClientRect().bottom) : 0,
          navBottom: Math.round(nav.getBoundingClientRect().bottom),
          inner: window.innerHeight,
          scrollY: Math.round(window.scrollY),
        }
      })()`,
      (v) => v && v.scrollY > 0,
    )
    check(`${label} (LBP): 「운동」 탭 한 번으로 운동 섹션이 화면에 들어온다`, afterJump.exerciseTop >= 0 && afterJump.exerciseTop < afterJump.inner, `(top ${afterJump.exerciseTop}px)`)
    check(`${label} (LBP): 점프 뒤 운동 섹션이 sticky 헤더 뒤에 숨지 않는다`, afterJump.exerciseTop >= afterJump.headerBottom, `(heading ${afterJump.exerciseTop} ≥ header ${afterJump.headerBottom})`)
    check(`${label} (LBP): 점프 뒤에도 내비가 화면 안에 남는다`, afterJump.navBottom <= afterJump.inner, `(bottom ${afterJump.navBottom}, viewport ${afterJump.inner})`)
    await cdp.send('Runtime.evaluate', { expression: `window.scrollTo(0, 0)`, returnByValue: true })

    /*
     * 「마무리」 화면 분리(2026-09-24)의 실측 계약.
     *
     * 왜 px 상한이 아니라 "숨은 화면의 높이가 0"인가: 이 배치가 줄인 높이
     * (데스크톱 실측 4182px → 3605px)를 절대 상한으로 박으면, 기존 상한들처럼
     * 기계 간 텍스트 메트릭 변동을 흡수할 여유(≈35%)를 주는 순간 분리를
     * 되돌려도 통과하는 무의미한 핀이 되고, 여유를 안 주면 다른 기계에서
     * 흔들린다. 대신 계약 자체를 잰다 -- 숨긴 단계가 진짜로 0px를 차지하고
     * (즉 `hidden`이 CSS에 먹혔고), 버튼 한 번으로 실제로 열리고 닫힌다.
     * 이건 기계와 무관하게 참이거나 거짓이다.
     *
     * 소스가 아니라 진짜 브라우저에서 재는 이유: `hidden`이 듣는 근거는 UA의
     * `[hidden] { display: none }` 하나뿐이라, CSS 한 줄이 그걸 이기면 SSR
     * 단언(hidden 속성만 본다)은 전부 통과하면서 화면은 그대로 길어진다.
     */
    const stepMetrics = `(() => {
      const box = (sel) => {
        const el = document.querySelector(sel)
        if (!el) return null
        const r = el.getBoundingClientRect()
        return { h: Math.round(r.height), visible: typeof el.checkVisibility === 'function' ? el.checkVisibility() : r.height > 0 }
      }
      /*
       * EMR 미리보기 자체는 「참고 자료」 disclosure 안에 접혀 있어서, 마무리
       * 화면을 열어도 그 헤딩은 checkVisibility() false다(정상). 원장이 실제로
       * 닿는 지점은 그 서랍의 summary이므로 그걸 잰다 -- EMR 헤딩은 DOM에
       * 있는지만 따로 확인한다.
       */
      const drawer = [...document.querySelectorAll('.workspace summary')].find((el) => el.textContent.includes('참고 자료'))
      // 헤딩(h4)으로만 찾는다 -- 서랍 summary 텍스트가 "참고 자료 (이전 방문 ·
      // 환자 전달문 · EMR 미리보기)"라서, 본문 전체 문자열로 찾으면 EMR 카드가
      // 사라져도 통과하는 헛단언이 된다.
      const emr = document.querySelector('.workspace__emrPreview h4')
      return {
        consult: box('.doctor__visitStep[data-step="consult"]'),
        wrapup: box('.doctor__visitStep[data-step="wrapup"]'),
        emrInDom: !!emr,
        drawerVisible: !!drawer && (typeof drawer.checkVisibility === 'function' ? drawer.checkVisibility() : true),
        current: [...document.querySelectorAll('.doctor__laneNav__btn[data-current="true"]')].map((b) => b.textContent),
        ariaCurrent: [...document.querySelectorAll('.doctor__laneNav__btn[aria-current="step"]')].map((b) => b.textContent),
      }
    })()`
    const stepBefore = await cdp.evalUntil(stepMetrics, (v) => v && v.consult && v.wrapup)
    console.log(
      `[measured] ${label} (LBP): 진료 화면 ${stepBefore.consult.h}px / 마무리 화면 ${stepBefore.wrapup.h}px (숨김)`,
    )
    check(`${label} (LBP): 두 단계가 둘 다 DOM에 있다 (언마운트가 아니라 hidden)`, !!stepBefore.consult && !!stepBefore.wrapup)
    check(`${label} (LBP): 기본은 진료 화면 — 마무리가 높이를 0으로 접는다`, stepBefore.wrapup.h === 0 && stepBefore.wrapup.visible === false, `(마무리 ${stepBefore.wrapup.h}px, visible=${stepBefore.wrapup.visible})`)
    check(`${label} (LBP): 진료 화면은 실제 높이를 갖는다 (자기점검 — 둘 다 0이면 위 단언이 헛돈다)`, stepBefore.consult.h > 500, `(${stepBefore.consult.h}px)`)
    check(`${label} (LBP): 진료 중에는 EMR 미리보기로 가는 「참고 자료」 서랍이 보이지 않는다`, stepBefore.drawerVisible === false)
    check(`${label} (LBP): 그래도 EMR 미리보기는 DOM에 그대로 있다 (숨긴 것이지 지운 것이 아니다)`, stepBefore.emrInDom === true)
    check(`${label} (LBP): 현재 단계 표시가 진료 버튼에만 붙는다`, stepBefore.current.join(',') === '안전,확인,판단·처치,운동', `(${stepBefore.current})`)
    check(`${label} (LBP): aria-current="step"은 정확히 하나 (ARIA 제약)`, stepBefore.ariaCurrent.join(',') === '안전', `(${stepBefore.ariaCurrent})`)

    await cdp.send('Runtime.evaluate', { expression: `document.querySelector('.doctor__laneNav__btn[data-target="next-h2"]').click()`, returnByValue: true })
    const stepAfter = await cdp.evalUntil(stepMetrics, (v) => v && v.wrapup && v.wrapup.h > 0)
    console.log(`[measured] ${label} (LBP): 마무리 화면 ${stepAfter.wrapup.h}px (열림) — 진료 화면은 ${stepAfter.consult.h}px로 접힘`)
    check(`${label} (LBP): 「마무리」 버튼 한 번으로 마무리 화면이 열린다`, stepAfter.wrapup.h > 0 && stepAfter.wrapup.visible === true, `(${stepAfter.wrapup.h}px)`)
    check(`${label} (LBP): 마무리로 넘어가면 진료 화면이 접힌다 (두 화면이 동시에 쌓이지 않는다)`, stepAfter.consult.h === 0, `(${stepAfter.consult.h}px)`)
    check(`${label} (LBP): 마무리 화면에서 EMR 미리보기로 가는 「참고 자료」 서랍에 실제로 닿는다`, stepAfter.drawerVisible === true)
    check(`${label} (LBP): 현재 단계 표시가 마무리로 따라온다`, stepAfter.current.join(',') === '마무리', `(${stepAfter.current})`)
    check(`${label} (LBP): 단계를 옮겨도 aria-current="step"은 여전히 하나`, stepAfter.ariaCurrent.join(',') === '마무리', `(${stepAfter.ariaCurrent})`)
    check(`${label} (LBP): 마무리 화면에도 가로 오버플로가 없다`, (await cdp.send('Runtime.evaluate', { expression: `Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth)`, returnByValue: true }))?.result?.value === 0)

    await cdp.send('Runtime.evaluate', { expression: `document.querySelector('.doctor__laneNav__btn[data-target="lane1-h2"]').click()`, returnByValue: true })
    const stepBack = await cdp.evalUntil(stepMetrics, (v) => v && v.consult && v.consult.h > 0)
    check(`${label} (LBP): 「안전」 버튼으로 진료 화면에 돌아온다`, stepBack.consult.h > 500 && stepBack.wrapup.h === 0, `(진료 ${stepBack.consult.h}px, 마무리 ${stepBack.wrapup.h}px)`)
    check(
      `${label} (LBP): 돌아온 진료 화면 높이가 원래와 같다 (오갔다고 레이아웃이 달라지지 않는다)`,
      Math.abs(stepBack.consult.h - stepBefore.consult.h) <= 2,
      `(${stepBefore.consult.h}px → ${stepBack.consult.h}px)`,
    )
    await cdp.send('Runtime.evaluate', { expression: `window.scrollTo(0, 0)`, returnByValue: true })

    // 세 번째 측정: CLEAR인 LBP fixture — 레인1이 접혀야 한다.
    const pickedClear = await cdp.send('Runtime.evaluate', {
      expression: `(() => {
        const s = document.querySelector('#doctor-fixture-select')
        if (!s) return null
        const opt = [...s.options].find((o) => ${LBP_CLEAR_FIXTURE_NAME_RE.toString()}.test(o.textContent))
        if (!opt) return null
        s.value = opt.value
        s.dispatchEvent(new Event('change', { bubbles: true }))
        return opt.textContent
      })()`,
      returnByValue: true,
    })
    check(`${label}: a CLEAR LBP fixture exists`, typeof pickedClear?.result?.value === 'string', `(${pickedClear?.result?.value})`)
    await cdp.evalUntil(
      `(() => { const sm = document.querySelector('.doctor__lane1Collapse > summary'); return !!sm && /전 부위 안전|확인 필요|URGENT|계산불가/.test(sm.textContent) && !!document.querySelector('[aria-label="원장 최종 판단"]') })()`,
      (v) => v === true,
    )
    const lane1Text = await cdp.send('Runtime.evaluate', { expression: `document.querySelector('.doctor__lane1Collapse > summary')?.textContent ?? ''`, returnByValue: true })
    const lane1Open = await cdp.send('Runtime.evaluate', { expression: `document.querySelector('.doctor__lane1Collapse')?.open ?? null`, returnByValue: true })
    const mc = await cdp.evalUntil(MEASURE, (v) => v && typeof v.workflow === 'number')
    console.log(`[measured] ${label} (LBP CLEAR): ${mc.workflow}px / ${mc.viewport}px = ${(mc.workflow / mc.viewport).toFixed(2)}x | overflowX ${mc.overflowX}px | ${mc.openInputs} open inputs | lane1 "${lane1Text?.result?.value}" open=${lane1Open?.result?.value}`)
    check(`${label} (LBP CLEAR): 레인1 요약이 CLEAR를 말한다`, /전 부위 안전/.test(lane1Text?.result?.value ?? ''), `("${lane1Text?.result?.value}")`)
    check(`${label} (LBP CLEAR): 레인1 disclosure가 닫혀 있다`, lane1Open?.result?.value === false, `(open=${lane1Open?.result?.value})`)
    check(`${label} (LBP CLEAR): no horizontal overflow`, mc.overflowX === 0, `(${mc.overflowX}px)`)
    check(`${label} (LBP CLEAR): exactly the intended always-open inputs`, mc.openInputs === EXPECTED_OPEN_INPUTS_PAIN, `(${mc.openInputs})`)
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
