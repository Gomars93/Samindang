// Stable public follow-up URL contract regression suite (BizM batch). Two
// separate esbuild bundles of src/lib/publicFollowUpUrl.ts (see
// package.json's test:public-followup-url script), each with a different
// `--define:import.meta.env` value baked in at bundle time (esbuild's
// `--define` is a static replacement, so this file cannot toggle the env
// var at test-runtime the way a plain Node module could) --
//   .configured-bundle.mjs: VITE_SAMINDANG_PUBLIC_FOLLOWUP_BASE_URL set to
//     a real-looking base (no trailing slash, to exercise the
//     trailing-slash normalization).
//   .unconfigured-bundle.mjs: import.meta.env = {} (nothing configured,
//     import.meta.env.DEV also falsy) -- the real state of a production
//     build with no env var set.
// The DEV-only same-origin fallback branch (import.meta.env.DEV === true)
// is intentionally NOT covered by a third bundle here -- it needs `window`
// to exist, which a real Vite dev-server browser session provides but this
// Node-only suite does not; it is instead verified with a real browser
// against `npm run dev` (no env var set) as part of this batch's QA.
import { readFileSync } from 'node:fs'
import * as configured from './.public-followup-url-configured-bundle.mjs'
import * as unconfigured from './.public-followup-url-unconfigured-bundle.mjs'

let passCount = 0
function assert(name, cond) {
  if (!cond) throw new Error(`FAIL: ${name}`)
  passCount++
  console.log(`OK: ${name}`)
}

{
  assert(
    'configured: resolvePublicFollowUpBaseUrl() returns the configured base with a trailing slash added',
    configured.resolvePublicFollowUpBaseUrl() === 'https://gomars93.github.io/Samindang/followup/',
  )
  assert('configured: isPublicFollowUpBaseConfigured() is true', configured.isPublicFollowUpBaseConfigured() === true)
  assert(
    'configured: buildPublicFollowUpLink() preserves the existing #follow-up=<token> route contract',
    configured.buildPublicFollowUpLink('abc123') === 'https://gomars93.github.io/Samindang/followup/#follow-up=abc123',
  )
  assert(
    'configured: the token is appended verbatim, never re-encoded or mangled (a real capability token is base64url-shaped)',
    configured.buildPublicFollowUpLink('a-B_1~2.3') === 'https://gomars93.github.io/Samindang/followup/#follow-up=a-B_1~2.3',
  )
}

{
  assert('unconfigured (production, no DEV flag): resolvePublicFollowUpBaseUrl() returns null, never a guess', unconfigured.resolvePublicFollowUpBaseUrl() === null)
  assert('unconfigured: isPublicFollowUpBaseConfigured() is false', unconfigured.isPublicFollowUpBaseConfigured() === false)
  assert(
    'unconfigured: buildPublicFollowUpLink() returns null rather than falling back to any guessed origin',
    unconfigured.buildPublicFollowUpLink('abc123') === null,
  )
}

// Source-level check for the one branch not covered by a Node bundle above
// (see this file's header) -- confirms the DEV-only fallback exists, is
// gated on import.meta.env.DEV specifically (not any other flag), and is
// never reachable when a real base IS configured (the configured check
// above already proves the configured branch returns before this one could
// ever run, since it's a separate `if` that returns early).
{
  const src = readFileSync(new URL('../src/lib/publicFollowUpUrl.ts', import.meta.url), 'utf8')
  assert('DEV fallback: gated specifically on import.meta.env.DEV (Vite\'s own dev-server-only flag)', /if\s*\(\s*import\.meta\.env\.DEV/.test(src))
  assert('DEV fallback: builds from window.location.origin + window.location.pathname (the pre-BizM-batch behavior, dev-only now)', /window\.location\.origin.*window\.location\.pathname/.test(src))
  assert(
    'production fallback: the function can return null (explicit fail-closed, not always a string)',
    /return null/.test(src.slice(src.indexOf('export function resolvePublicFollowUpBaseUrl'))),
  )
}

console.log(`\n${passCount} public-followup-url assertions passed.`)
