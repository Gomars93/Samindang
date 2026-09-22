/*
 * 컨택트 시트 — 실제 픽스처 전부를 새 화면으로 렌더해 한 장으로 본다.
 *
 * 왜 이 도구가 필요한가
 * ---------------------
 * Figma 목업은 **이상적인 환자 1명**이다. 실제로 깔끔함이 무너지는 자리는
 * 늘 엣지 케이스다 -- 값이 길어 두 줄이 되는 행, 미응답으로 빈 행, 부위가
 * 허리가 아니라 LBP 전용 행이 통째로 빠지는 프로필. 목업은 그걸 안 보여준다.
 *
 * 이 저장소에는 `DOCTOR_FIXTURES`(실제 builder로 만든 환자 프로필)가 이미
 * 수십 개 있다. 그걸 전부 새 화면에 꽂아 한 페이지로 렌더하면, "깔끔한가"를
 * 한 케이스가 아니라 전 케이스에 대해 한 번에 판정할 수 있다.
 *
 * 무엇을 만드나
 * -------------
 *   out/contact-sheet/index.html   브라우저로 바로 열리는 자립 HTML
 *   out/contact-sheet/*.png        CDP 스크린샷(가로 2560 / 세로 1440)
 *
 * 화면은 읽기 전용이라 클라이언트 JS가 필요 없다 -- `react-dom/server`로
 * 정적 HTML을 만들고 CSS를 인라인한다. 결과물 한 파일만 있으면 어디서든
 * 열린다(원장 PC로 그냥 보내도 된다).
 *
 * 스크린샷은 `tests/tablet-viewport.spec.mjs`가 이미 쓰는 방식 그대로
 * -- 러너에 이미 있는 Chrome을 DevTools Protocol로 직접 몬다. Playwright도
 * Puppeteer도 새로 깔지 않는다.
 *
 * 실행: `npm run contact-sheet`
 *       `npm run contact-sheet -- --no-shots`   (HTML만, 브라우저 불필요)
 */
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(fileURLToPath(import.meta.url)) + '/..'
const OUT = path.join(ROOT, 'out', 'contact-sheet')
// 번들을 프로젝트 안에 두는 이유: react/react-dom을 external로 남기므로
// 결과 모듈이 저장소의 node_modules에서 해석돼야 한다. /tmp에 두면 못 찾는다.
const TMP = path.join(ROOT, 'node_modules', '.cache', `samindang-sheet-${process.pid}`)
const WANT_SHOTS = !process.argv.includes('--no-shots')

/* ------------------------------------------------------------ 1. 번들 */

function bundle() {
  fs.mkdirSync(TMP, { recursive: true })
  const entry = path.join(TMP, 'entry.tsx')
  fs.writeFileSync(
    entry,
    `import { renderToStaticMarkup } from 'react-dom/server'
import { DOCTOR_FIXTURES } from '${ROOT}/src/doctor/fixtures'
import { PainBriefing } from '${ROOT}/src/doctor/clinical/PainBriefing'
import { buildPainBriefing } from '${ROOT}/src/doctor/clinical/briefingModel'

export function render() {
  const painOnly = DOCTOR_FIXTURES.filter(
    (f) => f.payload.routing.primary_module === 'Pain' || f.payload.routing.additional_module === 'Pain',
  )
  return painOnly.map((f) => ({
    name: f.name,
    region: f.payload.responses.modules?.pain?.primary_location ?? '(부위 미상)',
    profile: f.payload.routing.primary_module === 'Pain' ? '주호소' : '추가상세',
    blockCount: buildPainBriefing(f.payload).length,
    rowCount: buildPainBriefing(f.payload).reduce((n, b) => n + b.rows.length, 0),
    html: renderToStaticMarkup(PainBriefing({ payload: f.payload })),
  }))
}
export const TOTAL = DOCTOR_FIXTURES.length
`,
  )

  const outfile = path.join(TMP, 'bundle.mjs')
  const r = spawnSync(
    'npx',
    [
      'esbuild',
      entry,
      '--bundle',
      '--format=esm',
      '--platform=node',
      '--jsx=automatic',
      '--loader:.css=empty',
      '--external:react',
      '--external:react-dom',
      `--outfile=${outfile}`,
    ],
    { cwd: ROOT, encoding: 'utf8' },
  )
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout)
    throw new Error('esbuild 실패')
  }
  return outfile
}

/* ------------------------------------------------------------ 2. HTML */

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

const REGION_KO = {
  low_back_pelvis: '허리·골반',
  neck_shoulder: '목·어깨',
  arm_hand: '팔·손',
  leg_foot: '다리·발',
  knee: '무릎',
  head_face_jaw: '머리·얼굴·턱',
  chest_rib: '가슴·갈비',
  abdomen: '배',
  other: '그 밖',
}

function page(cards, meta) {
  const css = [
    fs.readFileSync(path.join(ROOT, 'src/doctor/clinical/tokens.css'), 'utf8'),
    fs.readFileSync(path.join(ROOT, 'src/doctor/clinical/briefing.css'), 'utf8'),
  ].join('\n')

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>통증 닥터뷰 컨택트 시트</title>
<style>
${css}

/* ---- 시트 자체의 껍데기 (브리핑 화면과 무관, 대조용 회색) ---- */
html { background: #eceeed; }
body {
  margin: 0;
  padding: 40px 24px 80px;
  font-family: Pretendard, 'Noto Sans KR', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  color: #303834;
}
.sheetHead { max-width: 1400px; margin: 0 auto 28px; }
.sheetHead h1 { margin: 0 0 6px; font-size: 20px; }
.sheetHead p { margin: 0; font-size: 13px; color: #6d746f; line-height: 1.6; }
.sheetLegend { display: flex; gap: 18px; flex-wrap: wrap; margin-top: 12px; font-size: 12px; }
.sheetLegend b { font-weight: 600; }
.sw { display: inline-block; width: 10px; height: 10px; border-radius: 2px; vertical-align: middle; margin-right: 5px; }

.case { max-width: 1400px; margin: 0 auto 34px; }
.case__bar {
  display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap;
  padding: 0 2px 10px; font-size: 12px; color: #6d746f;
}
.case__n { font-weight: 700; color: #303834; }
.case__name { font-weight: 600; color: #303834; font-size: 13px; }
.case__tag {
  padding: 2px 8px; border-radius: 999px; background: #dfe4e1; color: #4d5651; font-size: 11px;
}
.case__count { margin-left: auto; font-variant-numeric: tabular-nums; }
</style>
</head>
<body>
<div class="sheetHead">
  <h1>통증 닥터뷰 — 컨택트 시트</h1>
  <p>
    실제 <b>${meta.total}</b>개 픽스처 중 통증을 포함한 <b>${cards.length}</b>개를 새 브리핑 화면으로 렌더한 것입니다.
    손으로 만든 예시가 아니라 <code>DOCTOR_FIXTURES</code>를 실제 builder로 통과시킨 값입니다.<br>
    보실 것: <b>행 길이가 두 줄로 넘어가는 칸</b>, <b>미응답으로 빈 칸</b>, <b>부위별로 행이 통째로 빠지는 프로필</b>.
    이 셋이 견딜 만하면 이 문법으로 나머지 블록을 복제합니다.
  </p>
  <div class="sheetLegend">
    <span><i class="sw" style="background:#2c5a43"></i><b>초록</b> 양호·가능·완화</span>
    <span><i class="sw" style="background:#4d5651"></i><b>회색</b> 중립 사실값</span>
    <span><i class="sw" style="background:#a35c12"></i><b>앰버</b> 제한·악화</span>
    <span><i class="sw" style="background:#a6aca8"></i><b>흐림</b> 문진이 아직 안 묻는 항목(자리만 표시)</span>
  </div>
</div>
${cards
  .map(
    (c, i) => `<div class="case">
  <div class="case__bar">
    <span class="case__n">${String(i + 1).padStart(2, '0')}</span>
    <span class="case__name">${esc(c.name)}</span>
    <span class="case__tag">${esc(REGION_KO[c.region] ?? c.region)}</span>
    <span class="case__tag">${esc(c.profile)}</span>
    <span class="case__count">${c.blockCount}블록 · ${c.rowCount}행</span>
  </div>
  ${c.html}
</div>`,
  )
  .join('\n')}
</body>
</html>
`
}

/* ------------------------------------------------------ 3. 스크린샷(CDP) */

function findChrome() {
  for (const p of [process.env.CHROME_BIN, process.env.CHROME_PATH].filter(Boolean)) {
    if (fs.existsSync(p)) return p
  }
  for (const n of ['google-chrome-stable', 'google-chrome', 'chromium-browser', 'chromium']) {
    const r = spawnSync('which', [n], { encoding: 'utf8' })
    if (r.status === 0 && r.stdout.trim()) return r.stdout.trim()
  }
  for (const p of ['/usr/bin/chromium', '/usr/bin/google-chrome', '/opt/pw-browsers/chromium']) {
    if (fs.existsSync(p)) return p
  }
  return null
}

function serve(root) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const rel = decodeURIComponent((req.url || '/').split('?')[0])
      const file = path.join(root, rel === '/' ? 'index.html' : rel)
      if (!fs.existsSync(file)) {
        res.writeHead(404).end()
        return
      }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      fs.createReadStream(file).pipe(res)
    })
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }))
  })
}

class Cdp {
  constructor(ws) {
    this.ws = ws
    this.id = 0
    this.pending = new Map()
    ws.addEventListener('message', (e) => {
      const m = JSON.parse(e.data)
      if (m.id && this.pending.has(m.id)) {
        const { resolve, reject } = this.pending.get(m.id)
        this.pending.delete(m.id)
        m.error ? reject(new Error(m.error.message)) : resolve(m.result)
      }
    })
  }
  send(method, params = {}) {
    const id = ++this.id
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
      setTimeout(() => {
        if (this.pending.delete(id)) reject(new Error(`CDP timeout: ${method}`))
      }, 120000)
    })
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function shoot(url, viewports) {
  const chrome = findChrome()
  if (!chrome) {
    console.log('SKIP 스크린샷: Chrome을 찾지 못했습니다 (HTML은 생성됨)')
    return []
  }
  const userDir = path.join(TMP, 'chrome')
  const port = 9222 + (process.pid % 900)
  const proc = spawn(
    chrome,
    [
      '--headless=new',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userDir}`,
      '--no-sandbox',
      '--disable-gpu',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
    ],
    { stdio: 'ignore' },
  )

  const made = []
  try {
    let targetWs = null
    for (let i = 0; i < 60 && !targetWs; i++) {
      await sleep(250)
      try {
        const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
        targetWs = list.find((t) => t.type === 'page')?.webSocketDebuggerUrl ?? null
      } catch {
        /* 아직 안 뜸 */
      }
    }
    if (!targetWs) throw new Error('Chrome이 뜨지 않았습니다')

    const ws = new WebSocket(targetWs)
    await new Promise((res, rej) => {
      ws.addEventListener('open', res)
      ws.addEventListener('error', rej)
    })
    const cdp = new Cdp(ws)
    await cdp.send('Page.enable')

    for (const vp of viewports) {
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: vp.w,
        height: vp.h,
        deviceScaleFactor: 1,
        mobile: false,
      })
      await cdp.send('Page.navigate', { url })
      await sleep(1200)
      const { contentSize } = await cdp.send('Page.getLayoutMetrics')
      const full = Math.min(Math.ceil(contentSize.height), 9000)
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: vp.w,
        height: full,
        deviceScaleFactor: 1,
        mobile: false,
      })
      await sleep(500)
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
      const file = path.join(OUT, `${vp.name}.png`)
      fs.writeFileSync(file, Buffer.from(data, 'base64'))
      made.push({ file, w: vp.w, h: full })
      console.log(`  ${vp.name}.png  ${vp.w}×${full}`)
    }
    ws.close()
  } finally {
    proc.kill()
  }
  return made
}

/* ------------------------------------------------------------------ main */

const t0 = Date.now()
console.log('컨택트 시트 생성 중...')

const bundlePath = bundle()
const mod = await import(bundlePath)
const cards = mod.render()

fs.mkdirSync(OUT, { recursive: true })
fs.writeFileSync(path.join(OUT, 'index.html'), page(cards, { total: mod.TOTAL }))
console.log(`  index.html  픽스처 ${cards.length}개 / 전체 ${mod.TOTAL}개`)

/*
 * 대표 케이스 strip.
 *
 * 전체 시트(38케이스)는 2560폭에서 세로 1만 px을 넘어 PNG로 찍으면 수십 MB가
 * 되고 눈으로 훑기도 어렵다. 판정에 실제로 필요한 것은 **서로 다른 실패 모양**
 * 이므로, 부위가 겹치지 않게 골라 6개만 찍는다 -- 허리(LBP 전용 행이 다 나오는
 * 경우)를 먼저 넣고, 나머지 부위에서 하나씩 집는다(LBP 행이 통째로 빠지는
 * 모양을 보기 위해). 전체는 index.html로 본다.
 */
const seen = new Set()
const strip = []
for (const c of [...cards].sort((a, b) => (a.region === 'low_back_pelvis' ? -1 : 0) - (b.region === 'low_back_pelvis' ? -1 : 0))) {
  if (seen.has(c.region)) continue
  seen.add(c.region)
  strip.push(c)
  if (strip.length === 6) break
}
fs.writeFileSync(path.join(OUT, 'strip.html'), page(strip, { total: mod.TOTAL }))
console.log(`  strip.html  대표 ${strip.length}개 (${strip.map((c) => REGION_KO[c.region] ?? c.region).join(', ')})`)

let shots = []
if (WANT_SHOTS) {
  const { server, port } = await serve(OUT)
  try {
    shots = await shoot(`http://127.0.0.1:${port}/strip.html`, [
      { name: 'strip-27in-landscape-2560', w: 2560, h: 1440 },
      { name: 'strip-27in-portrait-1440', w: 1440, h: 2560 },
    ])
  } finally {
    server.close()
  }
}

try {
  fs.rmSync(TMP, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })
} catch {
  /* 헤드리스 Chrome이 프로필 디렉터리를 늦게 놓아줄 때가 있다 -- 산출물은 이미
     out/에 다 있으므로 임시 디렉터리 정리 실패로 스크립트를 실패시키지 않는다. */
}
console.log(`완료 (${((Date.now() - t0) / 1000).toFixed(1)}s) → out/contact-sheet/`)
if (shots.length === 0 && WANT_SHOTS) console.log('(스크린샷 없이 HTML만 생성됨)')
