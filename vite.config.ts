import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * `base` is environment-specific so local dev / the normal production build
 * are completely unaffected:
 *  - default (`vite` dev server, `vite build`/`npm run build`): `/` (unchanged).
 *  - `vite build --mode ghpages` (only used by
 *    .github/workflows/pages-preview.yml, via `npm run build:preview`):
 *    `/Samindang/`, matching this repo's GitHub Pages project-site path
 *    (https://gomars93.github.io/Samindang/). No other build path uses this
 *    mode, so this can never accidentally affect the real production build.
 */
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === 'ghpages' ? '/Samindang/' : '/',
  server: { port: 5173 },
}))
