/*
 * Identity Production Batch (Part C): real browser + real HTTP boundary
 * acceptance for the unresolved -> confirm -> resolved Today Queue flow.
 *
 * Drives an actual `server/index.js` instance (real POST /api/crm/*
 * round trip, real filesystem persistence) and an actual production
 * build of the frontend in `mode: 'server'` (the ordinary clinic path,
 * not the fixtures/preview path tablet-viewport.spec.mjs measures), over
 * the DevTools Protocol against the CI runner's own Chrome/Chromium --
 * same "no Playwright, no new dependency" approach as
 * tests/tablet-viewport.spec.mjs, whose findChrome/serve/Cdp helpers this
 * file duplicates rather than imports (matching this repo's convention of
 * self-contained test-support code per file).
 *
 * Both the static frontend server and the API server are bound to
 * 127.0.0.1, so every request is loopback-trusted (isDoctorRequestAllowed)
 * with no doctor token needed -- this test exercises the ordinary
 * same-machine clinic deployment shape, not the cross-machine LAN case.
 *
 * Run via `npm run test:identity-link-e2e` (part of `npm run test:all`).
 */
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import http from 'node:http'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { createApp } from '../server/index.js'

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

function serveStatic(root) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const rel = decodeURIComponent((req.url || '/').split('?')[0])
      let file = path.join(root, rel === '/' ? 'index.html' : rel)
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
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (r.exceptionDetails) throw new Error(`eval failed: ${JSON.stringify(r.exceptionDetails)}`)
    return r.result.value
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

/* --------------------------------------------------- page-side JS helpers */

// React 18 controlled inputs ignore a plain `.value = x` assignment (React
// overrides the DOM property's own setter to distinguish programmatic sets
// from real user input) -- the native setter must be invoked directly, then
// a real `input` event dispatched, for onChange to fire. Inlined fresh into
// each IIFE snippet below (rather than declared once at top level) because
// Runtime.evaluate calls share one execution context, where a top-level
// `const`/`function` declared twice throws "already declared".
function setInputsScript(formSelector, chartNo, patientName) {
  return `(() => {
    function setReactInputValue(el, value) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(el, value)
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }
    const inputs = document.querySelector('${formSelector}').querySelectorAll('.doctor__todayQueue__linkInput')
    setReactInputValue(inputs[0], ${JSON.stringify(chartNo)})
    setReactInputValue(inputs[1], ${JSON.stringify(patientName)})
    return true
  })()`
}

/* ------------------------------------------------------------------- run */

async function main() {
  const chrome = findChrome()
  if (!chrome) {
    const msg = 'no Chrome/Chromium binary found (set CHROME_BIN to point at one)'
    if (process.env.CI) {
      throw new Error(`FAIL: ${msg} -- this check is required on CI`)
    }
    console.log(`SKIP: identity-link E2E -- ${msg}`)
    process.exit(0)
  }
  console.log(`browser: ${chrome}`)

  const dataRoot = await mkdtemp(path.join(tmpdir(), 'samindang-identity-e2e-data-'))
  const server = createApp({ dataDir: path.join(dataRoot, 'submissions') })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const apiPort = server.address().port
  const apiBase = `http://127.0.0.1:${apiPort}`

  // Seed two real patients, each with an unresolved CRM task -- through
  // the real HTTP boundary, not by touching the store directly.
  async function createUnresolvedTask(sourceEventId) {
    const visitRes = await fetch(`${apiBase}/api/visits`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) })
    const visit = await visitRes.json()
    const epRes = await fetch(`${apiBase}/api/crm/episodes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ patient_uuid: visit.patient_id }),
    })
    const episode = await epRes.json()
    await fetch(`${apiBase}/api/crm/tasks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        patient_uuid: visit.patient_id,
        episode_id: episode.episode_id,
        task_type: 'ROUTINE',
        reason_code: 'REASSESSMENT_DUE',
        source_event_id: sourceEventId,
      }),
    })
    return visit.patient_id
  }

  const patientA = await createUnresolvedTask('evt-identity-e2e-a')
  const patientB = await createUnresolvedTask('evt-identity-e2e-b')

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'samindang-identity-e2e-build-'))
  const outDir = path.join(tmp, 'dist')
  const profile = path.join(tmp, 'profile')

  // A plain production build (no VITE_PREVIEW_MODE) pointed at the real
  // API server -- this is `mode: 'server'` by default (DoctorView.tsx),
  // the ordinary clinic path, not the fixtures/preview path.
  const build = spawnSync('npx', ['vite', 'build', '--outDir', outDir, '--emptyOutDir'], {
    env: { ...process.env, VITE_SAMINDANG_SERVER_URL: apiBase },
    encoding: 'utf8',
  })
  assert.equal(build.status, 0, `build failed:\n${build.stdout}\n${build.stderr}`)

  const { server: staticServer, port: staticPort } = await serveStatic(outDir)
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
    cdp.ws.addEventListener('message', (e) => {
      const msg = JSON.parse(e.data)
      if (msg.method === 'Runtime.exceptionThrown') {
        console.error('BROWSER EXCEPTION:', JSON.stringify(msg.params.exceptionDetails))
      }
      if (msg.method === 'Runtime.consoleAPICalled' && (msg.params.type === 'error' || msg.params.type === 'warning')) {
        console.error('BROWSER CONSOLE:', msg.params.type, msg.params.args.map((a) => a.value ?? a.description).join(' '))
      }
    })
    await cdp.send('Runtime.enable')
    await cdp.send('Page.enable')
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${staticPort}/#doctor` })

    // Wait for the seeded rows to appear, unresolved.
    await cdp.evalUntil(
      `document.querySelectorAll('.doctor__todayQueue__row').length`,
      (n) => n >= 2,
    )

    const rowText = await cdp.eval(`document.querySelector('.doctor__todayQueue__grid').textContent`)
    const fallbackCount = (rowText.match(/환자 [0-9a-f]{8}/g) ?? []).length
    check('e2e: before linking, both rows show the truncated-UUID fallback (nothing resolved yet)', fallbackCount === 2, `(fallbackCount=${fallbackCount}, text=${rowText.slice(0, 200)})`)

    const linkButtonCount = await cdp.eval(`document.querySelectorAll('.doctor__todayQueue__linkButton').length`)
    check('e2e: both unresolved rows show a 시그마 연결 button', linkButtonCount === 2)

    // Independent-review finding (#11): select rows by their stable
    // data-patient-uuid attribute rather than NodeList index, so this
    // test never silently depends on server-returned row order.
    const rowASelector = `[data-patient-uuid="${patientA}"]`
    const rowBSelector = `[data-patient-uuid="${patientB}"]`

    /* ---------------- row A: open the form, verify inputs, cancel ---------------- */
    await cdp.eval(`document.querySelector('${rowASelector} .doctor__todayQueue__linkButton').click()`)
    await cdp.evalUntil(`!!document.querySelector('${rowASelector} .doctor__todayQueue__linkForm')`, (v) => v === true)

    await cdp.eval(setInputsScript(rowASelector, 'CN-E2E-DISCARDED', '취소될환자'))
    const beforeCancelValue = await cdp.eval(`document.querySelector('${rowASelector} .doctor__todayQueue__linkInput').value`)
    check('e2e: typed chart_no is reflected in the input before cancel', beforeCancelValue === 'CN-E2E-DISCARDED')

    await cdp.eval(`document.querySelector('${rowASelector} .doctor__todayQueue__linkCancel').click()`)
    await cdp.evalUntil(`!document.querySelector('${rowASelector} .doctor__todayQueue__linkForm')`, (v) => v === true)
    const afterCancelButtonCount = await cdp.eval(`document.querySelectorAll('.doctor__todayQueue__linkButton').length`)
    check('e2e: cancel reverts to idle with no network call -- button reappears, still 2 unresolved rows', afterCancelButtonCount === 2)

    const afterCancelIdentities = await (await fetch(`${apiBase}/api/crm/patient-identities?patient_uuid=${encodeURIComponent(patientA)}`)).json()
    check('e2e: cancel created no server-side link', afterCancelIdentities.identities[patientA]?.resolved === false)

    /* ---------------- row A: re-open, fill different values than the cancelled attempt, review, then cancel FROM the review step (뒤로/취소 must not fire the request either) ---------------- */
    await cdp.eval(`document.querySelector('${rowASelector} .doctor__todayQueue__linkButton').click()`)
    await cdp.evalUntil(`!!document.querySelector('${rowASelector} .doctor__todayQueue__linkForm')`, (v) => v === true)
    const reopenedValue = await cdp.eval(`document.querySelector('${rowASelector} .doctor__todayQueue__linkInput').value`)
    check('e2e: re-opening the form starts blank, not leaking the earlier cancelled entry', reopenedValue === '')

    await cdp.eval(setInputsScript(rowASelector, 'CN-E2E-REAL', '홍길동E2E'))
    await cdp.eval(`document.querySelector('${rowASelector} .doctor__todayQueue__linkSubmit').click()`)
    await cdp.evalUntil(`!!document.querySelector('${rowASelector} .doctor__todayQueue__linkReviewText')`, (v) => v === true)
    const reviewText = await cdp.eval(`document.querySelector('${rowASelector} .doctor__todayQueue__linkReviewText').textContent`)
    check('e2e: the review step shows exactly the values entered, before any request fires', reviewText.includes('홍길동E2E') && reviewText.includes('CN-E2E-REAL'))
    const identitiesAtReviewStep = await (await fetch(`${apiBase}/api/crm/patient-identities?patient_uuid=${encodeURIComponent(patientA)}`)).json()
    check('e2e: nothing is linked yet while sitting at the review step (the irreversible action has not fired)', identitiesAtReviewStep.identities[patientA]?.resolved === false)

    /* ---------------- row A: 뒤로 from review returns to editing with values intact, then submit for real ---------------- */
    await cdp.eval(`document.querySelector('${rowASelector} .doctor__todayQueue__linkCancel').click()`)
    await cdp.evalUntil(`!!document.querySelector('${rowASelector} .doctor__todayQueue__linkInput')`, (v) => v === true)
    const valueAfterBack = await cdp.eval(`document.querySelector('${rowASelector} .doctor__todayQueue__linkInput').value`)
    check('e2e: 뒤로 returns to editing with the entered chart_no still intact (not cleared)', valueAfterBack === 'CN-E2E-REAL')

    await cdp.eval(`document.querySelector('${rowASelector} .doctor__todayQueue__linkSubmit').click()`)
    await cdp.evalUntil(`!!document.querySelector('${rowASelector} .doctor__todayQueue__linkReviewText')`, (v) => v === true)
    await cdp.eval(`document.querySelector('${rowASelector} .doctor__todayQueue__linkSubmit').click()`)

    // Independent-review finding (#10): this must resolve well BEFORE
    // POLL_MS (5000ms) to actually prove the optimistic update, not the
    // next poll cycle, is what put the name on screen.
    await cdp.evalUntil(
      `document.querySelector('.doctor__todayQueue__grid').textContent.includes('홍길동E2E') && document.querySelector('.doctor__todayQueue__grid').textContent.includes('CN-E2E-REAL')`,
      (v) => v === true,
      2000,
    )
    check('e2e: after confirming the review step, the row immediately shows 환자명 · 차트번호 (well under POLL_MS, not waiting for the next poll)', true)

    const otherRowText = await cdp.eval(`document.querySelector('${rowBSelector}').textContent`)
    check("e2e: the OTHER (still-unresolved) row does not show the just-linked patient's name", !otherRowText.includes('홍길동E2E'))
    const otherRowStillHasButton = await cdp.eval(`!!document.querySelector('${rowBSelector} .doctor__todayQueue__linkButton')`)
    check('e2e: the other row still shows its own 시그마 연결 button, untouched', otherRowStillHasButton === true)

    /* ---------------- error case: linking row B to the SAME chart_no is visibly rejected with the exact expected message ---------------- */
    await cdp.eval(`document.querySelector('${rowBSelector} .doctor__todayQueue__linkButton').click()`)
    await cdp.evalUntil(`!!document.querySelector('${rowBSelector} .doctor__todayQueue__linkForm')`, (v) => v === true)
    await cdp.eval(setInputsScript(rowBSelector, 'CN-E2E-REAL', '중복시도'))
    await cdp.eval(`document.querySelector('${rowBSelector} .doctor__todayQueue__linkSubmit').click()`)
    await cdp.evalUntil(`!!document.querySelector('${rowBSelector} .doctor__todayQueue__linkReviewText')`, (v) => v === true)
    await cdp.eval(`document.querySelector('${rowBSelector} .doctor__todayQueue__linkSubmit').click()`)
    await cdp.evalUntil(`!!document.querySelector('${rowBSelector} .doctor__todayQueue__linkError')`, (v) => v === true)
    const errorText = await cdp.eval(`document.querySelector('${rowBSelector} .doctor__todayQueue__linkError').textContent`)
    check('e2e: a duplicate-chart conflict shows the exact expected Korean error text', errorText === '이미 다른 환자에게 연결된 차트번호입니다.', `(errorText=${JSON.stringify(errorText)})`)
    const rejectedRowText = await cdp.eval(`document.querySelector('${rowBSelector}').textContent`)
    check('e2e: the rejected row was NOT silently resolved (still no name/chart shown, form stays open with the error)', !rejectedRowText.includes('중복시도') && !!(await cdp.eval(`!!document.querySelector('${rowBSelector} .doctor__todayQueue__linkForm')`)))

    const identitiesAfterConflict = await (await fetch(`${apiBase}/api/crm/patient-identities?patient_uuid=${encodeURIComponent(patientB)}`)).json()
    check('e2e: the server-side state for the rejected patient is still unresolved, not overwritten', identitiesAfterConflict.identities[patientB]?.resolved === false)

    /* ---------------- persistence across a real reload ---------------- */
    // Page.navigate to an identical URL is a same-document no-op in
    // Chromium (the hash is unchanged) -- it does NOT remount the app, so
    // a stale in-memory form/error state would otherwise survive and give
    // a false "persisted" result. Page.reload with ignoreCache forces a
    // genuine fresh load.
    await cdp.send('Page.reload', { ignoreCache: true })
    await cdp.evalUntil(`document.querySelectorAll('.doctor__todayQueue__row').length`, (n) => n >= 2)
    await cdp.evalUntil(
      `document.querySelector('.doctor__todayQueue__grid').textContent.includes('홍길동E2E')`,
      (v) => v === true,
    )
    check('e2e: the resolved identity survives a real page reload (persisted server-side, not client memory)', true)

    /* ---------------- viewport sweep: overflow + touch target ---------------- */
    const VIEWPORTS = [
      { name: 'desktop 1440x900', width: 1440, height: 900 },
      { name: 'tablet landscape 1024x768', width: 1024, height: 768 },
      { name: 'tablet portrait 834x1112', width: 834, height: 1112 },
    ]
    for (const vp of VIEWPORTS) {
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: vp.width, height: vp.height, deviceScaleFactor: 1, mobile: false })
      await cdp.send('Page.reload', { ignoreCache: true })
      await cdp.evalUntil(`document.querySelectorAll('.doctor__todayQueue__row').length`, (n) => n >= 2)
      // Wait for the identity poll to resolve too, so the remaining
      // unresolved row's button has actually rendered before measuring it.
      await cdp.evalUntil(`!!document.querySelector('.doctor__todayQueue__linkButton')`, (v) => v === true)
      const overflowX = await cdp.eval(`Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth)`)
      check(`e2e viewport ${vp.name}: no horizontal overflow`, overflowX === 0, `(overflowX=${overflowX})`)

      // The remaining unresolved row's button is the smallest interactive
      // target this flow adds.
      const btnSize = await cdp.eval(`(() => {
        const el = document.querySelector('.doctor__todayQueue__linkButton')
        if (!el) return null
        const r = el.getBoundingClientRect()
        return Math.round(Math.min(r.width, r.height))
      })()`)
      check(`e2e viewport ${vp.name}: 시그마 연결 button meets the 36px minimum touch target`, btnSize !== null && btnSize >= 36, `(size=${btnSize})`)
    }
  } finally {
    if (cdp) await cdp.send('Browser.close').catch(() => {})
    proc.kill()
    await new Promise((resolve) => setTimeout(resolve, 300))
    await new Promise((resolve) => staticServer.close(resolve))
    await new Promise((resolve) => server.close(resolve))
    await rm(dataRoot, { recursive: true, force: true }).catch((e) => console.error('cleanup(dataRoot) failed:', e.message))
    await rm(tmp, { recursive: true, force: true }).catch((e) => console.error('cleanup(tmp) failed:', e.message))
  }

  console.log(`\n${passed} identity-link E2E assertions passed.`)
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
