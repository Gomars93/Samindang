import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'

/**
 * 빌드 정보(2026-10-06): "최신 코드가 반영됐는가"를 화면에서 바로 확인하게 한다. 클리닉 PC에서 같은 사고가 반복됐다 --
 * 코드를 못 받았거나(git), 받았는데 빌드·서버 재시작을 안 했거나, 브라우저 캐시였는데, 화면만 봐서는 셋을 구분할 수 없었다.
 * 커밋 해시와 빌드 시각만 싣는다(환자 정보 없음). git이 없거나 실패하면 'unknown' -- 빌드를 막지 않는다.
 * `dirty`는 추적 파일에 커밋 안 된 변경이 있을 때(그 빌드는 해시만으로 재현되지 않는다).
 */
function readBuildInfo() {
  const git = (cmd: string) => {
    try {
      return execSync(`git ${cmd}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
    } catch {
      return ''
    }
  }
  const commit = git('rev-parse --short HEAD') || 'unknown'
  const dirty = commit !== 'unknown' && git('status --porcelain --untracked-files=no') !== ''
  return { commit, dirty, builtAt: new Date().toISOString() }
}

/**
 * `base` is environment-specific so local dev / the normal production build
 * are completely unaffected:
 *  - default (`vite` dev server, `vite build`/`npm run build`): `/` (unchanged).
 *  - `vite build --mode ghpages` (used by .github/workflows/pages-preview.yml
 *    and doctor-workspace-preview.yml, via `npm run build:preview`):
 *    `/Samindang/` by default, matching this repo's GitHub Pages project-site
 *    path (https://gomars93.github.io/Samindang/) -- overridable via
 *    VITE_PAGES_BASE_PATH for a workflow that needs to publish the ghpages
 *    build under a sub-path instead of the site root (e.g. doctor-workspace-
 *    preview.yml builds under /Samindang/doctor-pr/ so the main patient
 *    preview at the root stays byte-for-byte untouched). No other build path
 *    uses this mode, so this can never accidentally affect the real
 *    production build.
 */
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  define: { __SAMINDANG_BUILD__: JSON.stringify(readBuildInfo()) },
  base: mode === 'ghpages' ? (process.env.VITE_PAGES_BASE_PATH || '/Samindang/') : '/',
  server: { port: 5173 },
}))
