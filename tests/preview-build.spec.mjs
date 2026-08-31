// Tablet Questionnaire Preview deployment regression suite
// (docs/TABLET_PREVIEW_DEPLOYMENT.md). Verifies the properties that make the
// GitHub Pages demo build safe to expose publicly: NO-PHI (server always
// unconfigured, no network call is ever attempted), the preview banner only
// exists in the preview build, and the GitHub Pages base path only applies
// to the dedicated `ghpages` Vite mode (never the normal dev/production
// build).
//
// Run via `npm run test:preview-build` (bundles the relevant modules with
// esbuild, using --define to simulate each Vite env combination the same
// way Vite itself statically replaces import.meta.env at build time).
// Plain node, no test framework: assert() prints "OK: <name>" and throws on failure.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { execSync } from 'node:child_process'

let passCount = 0
function assert(name, cond) {
  if (!cond) throw new Error(`FAIL: ${name}`)
  passCount++
  console.log(`OK: ${name}`)
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

/* =========================================================================
 * 1. vite.config.ts: the GitHub Pages base path only applies under the
 *    dedicated `ghpages` mode -- default (`vite`/`vite build`) stays `/`.
 * ========================================================================= */

{
  const src = readFileSync(join(ROOT, 'vite.config.ts'), 'utf8')
  assert("vite.config.ts: base is a function of `mode`, not a hardcoded value", /base:\s*mode === 'ghpages' \? '\/Samindang\/' : '\/'/.test(src))
}

/* =========================================================================
 * 2. package.json: build:preview exists and uses --mode ghpages (the only
 *    thing that can ever produce the /Samindang/ base path).
 * ========================================================================= */

{
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
  assert('package.json: build:preview script exists', typeof pkg.scripts['build:preview'] === 'string')
  assert("package.json: build:preview uses `vite build --mode ghpages`", pkg.scripts['build:preview'].includes('vite build --mode ghpages'))
  assert("package.json: the normal `build` script is untouched (no --mode, stays the real production build)", pkg.scripts.build === 'tsc -b && vite build')
}

/* =========================================================================
 * 3. Actual build output: run both the normal build and the preview build
 *    for real (not just source inspection) and inspect the emitted
 *    index.html's asset paths -- this is the same check performed manually
 *    during development of this feature, now captured as a regression.
 * ========================================================================= */

{
  execSync('npx vite build', { cwd: ROOT, stdio: 'pipe' })
  const html = readFileSync(join(ROOT, 'dist', 'index.html'), 'utf8')
  assert('normal `vite build`: asset paths are rooted at / (unaffected by the preview feature)', /src="\/assets\//.test(html))
  assert('normal `vite build`: does NOT use the /Samindang/ base', !html.includes('/Samindang/'))
}

{
  execSync('npx vite build --mode ghpages', {
    cwd: ROOT,
    stdio: 'pipe',
    env: { ...process.env, VITE_PREVIEW_MODE: 'true', VITE_SAMINDANG_SERVER_URL: '' },
  })
  const html = readFileSync(join(ROOT, 'dist', 'index.html'), 'utf8')
  assert('`vite build --mode ghpages`: asset paths are rooted at /Samindang/', /src="\/Samindang\/assets\//.test(html))

  const jsFiles = execSync("find dist/assets -name '*.js'", { cwd: ROOT }).toString().trim().split('\n')
  const bundled = jsFiles.map((f) => readFileSync(join(ROOT, f), 'utf8')).join('\n')
  assert('preview build bundle: contains the preview banner text', bundled.includes('미리보기 환경'))
  assert(
    'preview build bundle CRITICAL: no hardcoded http(s) API/server URL anywhere in the bundle (only w3.org/react namespace URLs, which are expected)',
    (bundled.match(/https?:\/\/[a-zA-Z0-9.\/:_-]*/g) ?? []).every((u) => /w3\.org|reactjs\.org/.test(u)),
  )
  // Tablet UX v2.2 §24: the herbal add-on QA simulation is dev/preview-only
  // and NO-PHI by construction (it only lists static question labels baked
  // into the source at build time, never a live patient response).
  assert('preview build bundle: herbal add-on QA preview button text is present (dev/preview-only feature compiled in)', bundled.includes('한약 추가문진 미리보기'))
}

{
  // Normal build (no env overrides) must NOT contain the preview banner text
  // at all -- proves it's compiled out, not just hidden by CSS/JS branching.
  execSync('npx vite build', { cwd: ROOT, stdio: 'pipe' })
  const jsFiles = execSync("find dist/assets -name '*.js'", { cwd: ROOT }).toString().trim().split('\n')
  const bundled = jsFiles.map((f) => readFileSync(join(ROOT, f), 'utf8')).join('\n')
  assert('normal production build CRITICAL: preview banner text is not present anywhere in the bundle (compiled out, not just hidden)', !bundled.includes('미리보기 환경'))
  // Tablet UX v2.2 §24: "단 production patient UI에는 staff-only 기능이
  // 노출되지 않게 한다" -- a real production build (DEV=false,
  // VITE_PREVIEW_MODE unset) must never ship the QA-only herbal add-on
  // preview text either, same guarantee as the preview banner above.
  assert('normal production build CRITICAL: herbal add-on QA preview button text is not present (staff-only QA feature never reaches production patient UI)', !bundled.includes('한약 추가문진 미리보기'))
}

/* =========================================================================
 * 3b. Doctor View 재설계 v0.2 A2/Opus BLOCKING: Pretendard(및 DoctorView 전체)
 *     가 환자 엔트리 번들에 유입되면 안 된다. `React.lazy`(App.tsx)로 code
 *     split한 뒤 실제 `npm run build` 산출물을 검사해 확인한다(소스 추론이
 *     아니라 빌드 결과 자체를 본다) -- 위 3번 블록이 직전에 일반 프로덕션
 *     빌드(`npx vite build`, preview mode 아님)를 만들어 둔 상태를 그대로
 *     이어서 쓴다.
 * ========================================================================= */

{
  const html = readFileSync(join(ROOT, 'dist', 'index.html'), 'utf8')
  // 엔트리 HTML이 직접 참조하는(=반드시 다운로드되는) JS/CSS 에셋만 추린다.
  // DoctorView 청크는 동적 import이므로 여기 나열되지 않아야 한다.
  const entryAssetPaths = [...html.matchAll(/(?:src|href)="([^"]+\/assets\/[^"]+)"/g)].map((m) => m[1])
  assert('환자 엔트리 index.html: DoctorView 청크를 직접 참조(modulepreload 등)하지 않는다', !entryAssetPaths.some((p) => p.includes('DoctorView')))

  const entryFiles = entryAssetPaths.map((p) => join(ROOT, 'dist', p.replace(/^\//, '')))
  const entryContents = entryFiles.map((f) => readFileSync(f, 'utf8'))

  assert(
    '환자 엔트리 CSS/JS 전체: @font-face 없음 — Pretendard가 patient 엔트리 청크에 없다(대소문자 무시)',
    !entryContents.some((c) => /@font-face/i.test(c) && /pretendard/i.test(c)),
  )
  assert(
    '환자 엔트리 CSS/JS 전체: "Pretendard Variable"(doctor 전용 폰트 패밀리명) 문자열이 없다',
    !entryContents.some((c) => c.includes('Pretendard Variable')),
  )
  // 동적 subset은 92개 조각으로 나뉘어 파일 수 기준 임계치가 부적절하다
  // (프로젝트 지시사항의 "파일 수가 많으므로 임계치 방식이 더 맞으면"에
  // 대한 판단: 여기서는 "0건이어야 한다"는 정확한 계약이 성립하므로 임계치
  // 대신 정확한 0건 어서션을 쓴다 — Pretendard 파일이 patient 엔트리 청크에
  // 조금이라도 섞이면 회귀다).
  const entryWoff2Refs = entryContents.flatMap((c) => [...c.matchAll(/[\w./-]+\.woff2/g)].map((m) => m[0]))
  assert('환자 엔트리 CSS/JS 전체: .woff2 참조 0건', entryWoff2Refs.length === 0)

  const distFiles = execSync("find dist/assets -type f", { cwd: ROOT }).toString().trim().split('\n')
  const pretendardWoff2Files = distFiles.filter((f) => /PretendardVariable.*\.woff2$/.test(f))
  assert('빌드 산출물: Pretendard variable subset woff2 파일 자체는 존재한다(doctor 청크용, 완전히 안 만들어진 게 아님을 확인)', pretendardWoff2Files.length > 0)
}

/* =========================================================================
 * 4. NO-PHI / server-unconfigured guarantee: with VITE_SAMINDANG_SERVER_URL
 *    unset (exactly the preview build's env), every server-facing function
 *    resolves to the "not configured" result WITHOUT ever calling fetch.
 * ========================================================================= */

{
  execSync(
    "esbuild src/lib/serverClient.ts --bundle --format=esm --outfile=tests/.preview-server-client-bundle.mjs --platform=neutral --define:import.meta.env.VITE_SAMINDANG_SERVER_URL=undefined",
    { cwd: ROOT, stdio: 'pipe' },
  )
  const { isServerConfigured, submitQuestionnaire, listSubmissions } = await import(join(ROOT, 'tests', '.preview-server-client-bundle.mjs'))

  assert('isServerConfigured() is false when VITE_SAMINDANG_SERVER_URL is unset (preview build env)', isServerConfigured() === false)

  let fetchCalled = false
  const originalFetch = globalThis.fetch
  globalThis.fetch = () => {
    fetchCalled = true
    throw new Error('fetch must never be called when the server is unconfigured')
  }
  try {
    const submitResult = await submitQuestionnaire({ some: 'payload' })
    assert('submitQuestionnaire() resolves ok:false when unconfigured (never throws, never hangs)', submitResult.ok === false)
    assert('submitQuestionnaire() never calls fetch when unconfigured', fetchCalled === false)

    const listResult = await listSubmissions()
    assert('listSubmissions() resolves ok:false when unconfigured (Doctor route "서버 제출목록" mode fails closed, no real data access)', listResult.ok === false)
    assert('listSubmissions() never calls fetch when unconfigured', fetchCalled === false)
  } finally {
    globalThis.fetch = originalFetch
  }
}

/* =========================================================================
 * 5. Workflow file: correct triggers, env, and Pages actions.
 * ========================================================================= */

{
  const wf = readFileSync(join(ROOT, '.github', 'workflows', 'pages-preview.yml'), 'utf8')
  assert('pages-preview.yml: supports workflow_dispatch (manual trigger)', /workflow_dispatch:/.test(wf))
  assert('pages-preview.yml: triggers on push to main', /push:\s*\n\s*branches:\s*\[main\]/.test(wf))
  assert('pages-preview.yml: runs on Node 22', /node-version:\s*'22'/.test(wf))
  assert('pages-preview.yml: uses npm ci', /run:\s*npm ci/.test(wf))
  assert('pages-preview.yml: builds via npm run build:preview (never the plain `npm run build`)', /run:\s*npm run build:preview/.test(wf))
  assert('pages-preview.yml: sets VITE_PREVIEW_MODE=true for the build step', /VITE_PREVIEW_MODE:\s*'true'/.test(wf))
  assert("pages-preview.yml CRITICAL: explicitly sets VITE_SAMINDANG_SERVER_URL to empty (never a real endpoint)", /VITE_SAMINDANG_SERVER_URL:\s*''/.test(wf))
  assert('pages-preview.yml: uploads the dist/ folder as the Pages artifact', /upload-pages-artifact@v\d+[\s\S]{0,40}path:\s*dist/.test(wf))
  assert('pages-preview.yml: uses the official deploy-pages action', /deploy-pages@v\d+/.test(wf))
  assert('pages-preview.yml: grants only the minimum permissions Pages deployment needs', /permissions:[\s\S]{0,120}pages:\s*write/.test(wf))
}

console.log(`\nSUMMARY: ${passCount} assertions passed, 0 failed (total ${passCount})`)
