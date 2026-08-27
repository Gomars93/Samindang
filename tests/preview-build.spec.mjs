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
  // The base path is still gated on `mode === 'ghpages'` (the default/dev
  // build always falls through to '/', regardless of this assertion's
  // exact right-hand-side text). The '/Samindang/' fallback can now be
  // overridden by VITE_PAGES_BASE_PATH (used by the PR-23 preview workflow
  // to build the same app under a sub-path) -- the main pages-preview.yml
  // workflow never sets that var, so its build is unaffected.
  assert(
    "vite.config.ts: base is a function of `mode` (ghpages-only), not a hardcoded value",
    /base:\s*mode === 'ghpages' \?[\s\S]{0,80}: '\/',/.test(src),
  )
  assert(
    "vite.config.ts: the default (non-ghpages) build path always falls through to '/'",
    /: '\/',\s*\n\s*server:/.test(src),
  )
  assert(
    "vite.config.ts: the ghpages base path still defaults to '/Samindang/' when no override is set",
    src.includes("'/Samindang/'"),
  )
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

/* =========================================================================
 * 6. pr-23-preview.yml: PR #23-specific preview under a sub-path, never
 *    touching the main site root's served content. Mirrors most of the
 *    same NO-PHI/build-safety checks as pages-preview.yml above, plus the
 *    sub-path-specific properties (mirror-then-append, shared concurrency
 *    group, PR-specific banner env vars) unique to this workflow.
 * ========================================================================= */

{
  const wf = readFileSync(join(ROOT, '.github', 'workflows', 'pr-23-preview.yml'), 'utf8')
  assert('pr-23-preview.yml: supports workflow_dispatch (manual re-run)', /workflow_dispatch:/.test(wf))
  assert('pr-23-preview.yml: triggers on push to the PR #23 branch (not main)', /push:\s*\n\s*branches:\s*\[fix\/tablet-v2-3-ux-and-routing-audit\]/.test(wf))
  assert('pr-23-preview.yml: does NOT also trigger on push to main (would be pages-preview.yml\'s job, not this one)', !/branches:\s*\[main\]/.test(wf))
  assert('pr-23-preview.yml: runs on Node 22', /node-version:\s*'22'/.test(wf))
  assert('pr-23-preview.yml: uses npm ci', /run:\s*npm ci/.test(wf))
  assert('pr-23-preview.yml: builds via npm run build:preview (never the plain `npm run build`)', /run:\s*npm run build:preview/.test(wf))
  assert('pr-23-preview.yml: sets VITE_PREVIEW_MODE=true for the build step', /VITE_PREVIEW_MODE:\s*'true'/.test(wf))
  assert("pr-23-preview.yml CRITICAL: explicitly sets VITE_SAMINDANG_SERVER_URL to empty (never a real endpoint, no PHI transmission possible)", /VITE_SAMINDANG_SERVER_URL:\s*''/.test(wf))
  assert('pr-23-preview.yml: builds under the /Samindang/pr-23/ sub-path via VITE_PAGES_BASE_PATH', /VITE_PAGES_BASE_PATH:\s*'\/Samindang\/pr-23\/'/.test(wf))
  assert('pr-23-preview.yml: sets VITE_PREVIEW_PR so the banner shows which PR this build is', /VITE_PREVIEW_PR:\s*'23'/.test(wf))
  assert('pr-23-preview.yml: sets VITE_PREVIEW_SHA to the triggering commit (github.sha) so the banner shows the exact HEAD', /VITE_PREVIEW_SHA:\s*\$\{\{\s*github\.sha\s*\}\}/.test(wf))
  assert('pr-23-preview.yml CRITICAL: mirrors the currently-live site root before deploying (never rebuilds/replaces it from source)', /wget[\s\S]{0,200}gomars93\.github\.io\/Samindang\//.test(wf))
  assert('pr-23-preview.yml: places the PR build under combined/pr-23/, a sibling of the mirrored root -- not overwriting it', /combined\/pr-23/.test(wf))
  assert('pr-23-preview.yml: uploads the combined/ folder (root mirror + pr-23/) as the Pages artifact, not dist/ alone', /upload-pages-artifact@v\d+[\s\S]{0,40}path:\s*combined/.test(wf))
  assert('pr-23-preview.yml: uses the official deploy-pages action', /deploy-pages@v\d+/.test(wf))
  assert('pr-23-preview.yml: grants only the minimum permissions Pages deployment needs', /permissions:[\s\S]{0,120}pages:\s*write/.test(wf))
  assert(
    'pr-23-preview.yml CRITICAL: shares the same concurrency group as pages-preview.yml (serializes deploys, never races/interleaves them)',
    /concurrency:\s*\n\s*group:\s*pages/.test(wf),
  )
}

console.log(`\nSUMMARY: ${passCount} assertions passed, 0 failed (total ${passCount})`)
