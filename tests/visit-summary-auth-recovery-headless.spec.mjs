/*
 * MAJOR-3 (Phase 10 closing review): a real-browser proof that the
 * auth-recovery flow VisitSummaryAside.tsx/DoctorWorkspace.tsx wire up is
 * actually usable, not just present in the JSDOM-less `renderToString()`
 * source-string assertions tests/visit-summary-aside.spec.mjs and
 * tests/save-conflict.spec.mjs already carry. Those cannot prove a real
 * browser gives the token <input> a non-zero height -- `max-height:20px;
 * overflow:hidden` on block ⑤ is exactly the kind of thing that renders
 * "fine" in a string diff while being completely unusable/unclickable in
 * an actual layout, which is the precise bug this fix closes.
 *
 * Reuses this repo's existing self-contained real-Chrome-over-DevTools-
 * Protocol harness (findChrome/serve/Cdp/connect), duplicated here rather
 * than imported -- same convention tests/tablet-viewport.spec.mjs and
 * tests/patient-identity-link-e2e.spec.mjs already follow ("self-contained
 * test-support code per file").
 *
 * UNLIKE those two files, this one does NOT drive the full app shell (no
 * vite build of index.html, no fixtures picker, no real/fake backend): a
 * real 401 cannot even be produced end-to-end in this deployment's actual
 * auth model (server/auth.js's isDoctorRequestAllowed() always allows
 * loopback regardless of token, and both this repo's other headless tests
 * run from 127.0.0.1) -- so a full end-to-end drive would either fake the
 * backend (proving nothing about the real auth.js) or never actually reach
 * `lastSaveErrorKind==='auth'`. What is actually at risk here is layout,
 * not data-fetching: does clicking the block-⑤ action really produce a
 * clickable, non-clipped token input in the real DOM. So this esbuild-
 * bundles the REAL VisitSummaryAside.tsx + DoctorTokenSetup.tsx (the exact
 * same files, same relative import paths DoctorWorkspace.tsx itself uses)
 * behind a tiny harness component that reproduces DoctorWorkspace.tsx's
 * own wiring verbatim (same prop names, same conditional structure), with
 * the real doctor.css loaded unmodified -- a faithful layout proof without
 * needing the full app or a backend.
 *
 * Run via `npm run test:visit-summary-auth-recovery-headless` (part of
 * `npm run test:all`).
 */
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as esbuild from 'esbuild'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.join(__dirname, '..')

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

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }

function serve(root) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const rel = decodeURIComponent((req.url || '/').split('?')[0])
      const file = path.join(root, rel === '/' ? 'index.html' : rel)
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404)
        res.end()
        return
      }
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
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (r.exceptionDetails !== undefined) {
      throw new Error(`page eval threw: ${JSON.stringify(r.exceptionDetails)}`)
    }
    return r.result.value
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

/* --------------------------------------------------------- harness build */

/**
 * Reproduces DoctorWorkspace.tsx's OWN wiring verbatim -- same prop names
 * (`saveStatus`, `lastSaveErrorKind`, `onOpenTokenReentry`), same
 * conditional gate (`lastSaveErrorKind === 'auth' && tokenReentryOpen`)
 * around the real `<DoctorTokenSetup>` -- against the real
 * VisitSummaryAside.tsx and DoctorTokenSetup.tsx source files (imported by
 * their real repo-relative paths, exactly as DoctorWorkspace.tsx imports
 * them), not a reimplementation.
 */
const HARNESS_SRC = `
import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import { VisitSummaryAside } from './VisitSummaryAside'
import { DoctorTokenSetup } from '../DoctorTokenSetup'

function Harness() {
  const [tokenReentryOpen, setTokenReentryOpen] = useState(false)
  return (
    <div className="doctor">
      <div className="doctor__visitShell">
        <VisitSummaryAside
          patientName="테스트환자"
          chartNo="C-001"
          sexAgeLine="여성 · 42세"
          chiefConcern="허리 통증"
          durationFrequency="2주"
          lastVsDeltaLine={null}
          lane1={{
            status: 'CLEAR',
            calcUnavailableLabels: [],
            urgentLabels: [],
            reviewLabels: [],
            clearLabels: [],
            anyRegionApplicable: true,
            commonBannerDanger: false,
            unreadableSafetyField: false,
          }}
          saveStatus="error"
          lastSaveErrorKind="auth"
          onOpenTokenReentry={() => setTokenReentryOpen(true)}
        />
        <main className="doctor__visitWork">
          <section className="doctor__visitLane doctor__visitLane--lane1">
            <h2 id="lane1-h2">안전 확인</h2>
            {/*
              DoctorWorkspace.tsx's real gate is
              \`lastSaveErrorKind === 'auth' && tokenReentryOpen\` -- this
              harness only ever simulates the fixed auth-failure scenario
              this test exercises, so the first half is always true here
              and only \`tokenReentryOpen\` needs to vary.
            */}
            {tokenReentryOpen && (
              <DoctorTokenSetup authFailed onSet={() => setTokenReentryOpen(false)} />
            )}
          </section>
        </main>
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')).render(<Harness />)
`

const HTML = `<!doctype html>
<html><head><meta charset="utf-8" /><link rel="stylesheet" href="/doctor.css" /></head>
<body><div id="root"></div><script src="/bundle.js"></script></body></html>`

/* ------------------------------------------------------------------- run */

const chrome = findChrome()
if (!chrome) {
  const msg = 'no Chrome/Chromium binary found (set CHROME_BIN to point at one)'
  if (process.env.CI) {
    throw new Error(`FAIL: ${msg} -- this check is required on CI`)
  }
  console.log(`SKIP: visit-summary auth-recovery headless check -- ${msg}`)
  process.exit(0)
}
console.log(`browser: ${chrome}`)

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'samindang-auth-recovery-'))
const outDir = path.join(tmp, 'dist')
fs.mkdirSync(outDir, { recursive: true })
const profile = path.join(tmp, 'profile')

const build = await esbuild.build({
  stdin: {
    contents: HARNESS_SRC,
    resolveDir: path.join(repoRoot, 'src', 'doctor', 'workspace'),
    loader: 'tsx',
    sourcefile: 'harness.tsx',
  },
  bundle: true,
  format: 'iife',
  platform: 'browser',
  jsx: 'automatic',
  loader: { '.css': 'empty' },
  define: { 'import.meta.env': '{}' },
  outfile: path.join(outDir, 'bundle.js'),
  logLevel: 'silent',
})
assert.equal(build.errors.length, 0, `harness bundle failed:\n${JSON.stringify(build.errors, null, 2)}`)

fs.writeFileSync(path.join(outDir, 'index.html'), HTML)
fs.copyFileSync(path.join(repoRoot, 'src', 'doctor', 'doctor.css'), path.join(outDir, 'doctor.css'))

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
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/` })
  await cdp.evalUntil(`!!document.querySelector('.doctor__visitSummary')`, (v) => v === true)

  // ---------- 1. block ⑤ shows the 1-line action, within its 20px budget ----------
  const before = await cdp.eval(`(() => {
    const aside = document.querySelector('.doctor__visitSummary')
    const save = document.querySelector('.doctor__visitSummary__save')
    const btn = document.querySelector('.doctor__visitSummary__authBtn')
    return {
      asideHeight: aside ? aside.getBoundingClientRect().height : null,
      saveBlockHeight: save ? save.getBoundingClientRect().height : null,
      btnText: btn ? btn.textContent : null,
      hasTokenInputYet: !!document.querySelector('input[aria-label="doctor token"]'),
    }
  })()`)
  check('block ⑤ renders the 1-line auth-recovery action button', before.btnText === '인증 만료 — 토큰 다시 입력', `(saw "${before.btnText}")`)
  check('block ⑤ itself stays within its 20px budget (the button, not a full banner, sits there)', before.saveBlockHeight !== null && before.saveBlockHeight <= 24, `(${before.saveBlockHeight}px)`)
  check('the token input does not exist yet (form not opened until clicked)', before.hasTokenInputYet === false)
  const asideHeightBefore = before.asideHeight

  // ---------- 2. clicking it opens the real DoctorTokenSetup form, OUTSIDE the left summary ----------
  await cdp.eval(`(() => { document.querySelector('.doctor__visitSummary__authBtn').click(); return true })()`)
  await cdp.evalUntil(`!!document.querySelector('input[aria-label="doctor token"]')`, (v) => v === true)

  const after = await cdp.eval(`(() => {
    const aside = document.querySelector('.doctor__visitSummary')
    const input = document.querySelector('input[aria-label="doctor token"]')
    const saveBtn = [...document.querySelectorAll('.doctor__visitLane--lane1 button')].find((b) => b.textContent === '저장')
    return {
      asideHeight: aside ? aside.getBoundingClientRect().height : null,
      inputClientHeight: input ? input.clientHeight : 0,
      inputInsideAside: input ? !!input.closest('.doctor__visitSummary') : null,
      inputInsideLane1: input ? !!input.closest('.doctor__visitLane--lane1') : null,
      saveBtnClientHeight: saveBtn ? saveBtn.clientHeight : 0,
    }
  })()`)

  check('MAJOR-3: the real token <input> renders with a non-zero clientHeight (not clipped/invisible)', after.inputClientHeight > 0, `(${after.inputClientHeight}px)`)
  check('the token form\'s 저장 button also renders with a non-zero clientHeight (actually clickable)', after.saveBtnClientHeight > 0, `(${after.saveBtnClientHeight}px)`)
  check('the token input renders OUTSIDE the left-hand summary (never inside doctor__visitSummary)', after.inputInsideAside === false)
  check('the token input renders INSIDE the right work column\'s lane1 section (§3.2\'s intended location)', after.inputInsideLane1 === true)
  check(
    'MAJOR-3: opening the form does not grow the left summary\'s own height (its budget is unaffected -- the form lives entirely outside it)',
    after.asideHeight === asideHeightBefore,
    `(${asideHeightBefore}px before -> ${after.asideHeight}px after)`,
  )
} finally {
  try { cdp?.ws.close() } catch { /* already gone */ }
  proc.kill('SIGKILL')
  // Give the just-killed Chrome process a moment to actually release its
  // profile directory's file handles before removing it -- otherwise
  // rmSync can race a still-closing renderer process and throw ENOTEMPTY.
  await new Promise((r) => setTimeout(r, 300))
  server.close()
  try {
    fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  } catch {
    /* best-effort cleanup of a tmpdir -- never fail the test run over this */
  }
}

console.log(`\n${passed} visit-summary-auth-recovery-headless assertions passed.`)
