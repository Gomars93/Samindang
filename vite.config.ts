import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

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
  base: mode === 'ghpages' ? (process.env.VITE_PAGES_BASE_PATH || '/Samindang/') : '/',
  server: { port: 5173 },
}))
