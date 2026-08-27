import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// This file runs under Node (Vite's own config loader), where `process` is
// a real global -- but the project has no @types/node dependency (kept
// minimal on purpose), so TS doesn't know its shape here. A one-line
// ambient declaration for just the one field this file reads avoids
// pulling in a new devDependency for a single env-var read.
declare const process: { env: Record<string, string | undefined> }

/**
 * `base` is environment-specific so local dev / the normal production build
 * are completely unaffected:
 *  - default (`vite` dev server, `vite build`/`npm run build`): `/` (unchanged).
 *  - `vite build --mode ghpages` (only used by
 *    .github/workflows/pages-preview.yml, via `npm run build:preview`):
 *    `/Samindang/`, matching this repo's GitHub Pages project-site path
 *    (https://gomars93.github.io/Samindang/). No other build path uses this
 *    mode, so this can never accidentally affect the real production build.
 *  - `VITE_PAGES_BASE_PATH` env var, only when set AND mode is `ghpages`:
 *    overrides the `/Samindang/` default so a PR-specific preview workflow
 *    (e.g. .github/workflows/pr-23-preview.yml) can build the same app under
 *    a sub-path (e.g. `/Samindang/pr-23/`) without touching this default.
 *    The main `pages-preview.yml` workflow never sets this var, so its
 *    build is byte-for-byte unaffected by this addition.
 */
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === 'ghpages' ? process.env.VITE_PAGES_BASE_PATH || '/Samindang/' : '/',
  server: { port: 5173 },
}))
