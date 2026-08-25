// Multi-viewport layout-budget check for the real-world target devices
// (Tablet Questionnaire v1 UX verification). Extends the methodology of
// tests/layout-budget.spec.mjs (deterministic character-count heuristic, no
// browser) to the four minimum-verification viewports named in the UX task:
//   800x1280   (base reference, portrait -- also covered by layout-budget.spec.mjs)
//   834x1194   (portrait)
//   1200x1920  (large portrait)
//   1280x800   (landscape)
//
// Run via `npm run test:viewport` (bundles coreSpec.ts with esbuild first,
// same bundle test:integration/test:layout use).
//
// This file intentionally does NOT duplicate layout-budget.spec.mjs's strict
// "fits or explicitly allowlisted" contract for every viewport: at the
// landscape viewport (1280x800), the available content height collapses to
// ~456px (of an 800px-tall viewport) purely because of fixed header/footer
// chrome, so the overwhelming majority of real screens need inner scroll --
// enumerating that as a per-id allowlist would be hundreds of entries and a
// meaningless regression signal (see the computed breakdown this file's
// author ran before writing it: 98 of 212 screens overflow AVAILABLE_H at
// 1280x800, versus 4 at 800x1280).
//
// What actually matters for "does the UI stay usable on this viewport" is:
//   1. the content column never exceeds --content-max (680px) sideways, on
//      any viewport width, portrait or landscape (UX task §15).
//   2. the available inner-scroll area is never degenerate/negative (the
//      fixed chrome alone doesn't eat the whole viewport).
//   3. the CTA ("다음"/"선택 완료"/"입력이 어려워요") lives in `.shell__bottom`,
//      a sibling of the scrollable `.shell__main` -- never nested inside it
//      -- so scrolling a long question can never hide it off-screen, on any
//      viewport (UX task §7's core concern). This is a structural CSS/JSX
//      invariant, not something that varies per viewport, so it is checked
//      once against the source rather than per viewport.
// For the three portrait-ish viewports (800x1280 already covered elsewhere,
// 834x1194, 1200x1920) the stricter "fits or allowlisted" contract from
// layout-budget.spec.mjs IS meaningful (available height stays generous) and
// is reapplied here.

import { ALL_QUESTIONS } from './.spec-bundle.mjs'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

let passCount = 0
function assert(name, cond) {
  if (!cond) throw new Error(`FAIL: ${name}`)
  passCount++
  console.log(`OK: ${name}`)
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const CSS_PATH = join(__dirname, '..', 'src', 'styles.css')
const css = readFileSync(CSS_PATH, 'utf8')
const SCREEN_SHELL_PATH = join(__dirname, '..', 'src', 'components', 'ScreenShell.tsx')
const screenShellSrc = readFileSync(SCREEN_SHELL_PATH, 'utf8')

// -------- shared box-model constants (mirrors layout-budget.spec.mjs) ------

const GUTTER = 32
const BTN_MIN_H = 72
const FS_QUESTION = 32
const FS_ANSWER = 23
const FS_HELPER = 19
const CONTENT_MAX = 680

const HEADER_H = 20 + 56 + 16 + 10 // shell__top padding-top + topRow min-h + steps margin-top + steps height
const FOOTER_H = 16 + 28 + BTN_MIN_H + 14 + 56 // shell__bottom padding + primaryBtn + helpBtn margin + helpBtn min-h
const MAIN_PADDING_H = 40 + 16 // shell__main padding top+bottom

function budgetFor(viewportW, viewportH) {
  const availableH = viewportH - HEADER_H - FOOTER_H - MAIN_PADDING_H
  const contentWidth = Math.min(CONTENT_MAX, viewportW - 2 * GUTTER)

  const questionLineH = FS_QUESTION * 1.35
  const questionCharsPerLine = Math.floor(contentWidth / FS_QUESTION)
  const helperLineH = FS_HELPER * 1.35
  const helperCharsPerLine = Math.floor(contentWidth / FS_HELPER)

  const optionHPadding = 24 * 2
  const optionMarkW = 32
  const optionGap = 16
  const optionListGap = 14
  const optionVPadding = 16 * 2
  const optionContentWidth = contentWidth - optionHPadding - optionMarkW - optionGap
  const optionCharsPerLine = Math.floor(optionContentWidth / FS_ANSWER)

  const textHeight = (text, charsPerLine, lineH) =>
    Math.max(1, Math.ceil(text.length / charsPerLine)) * lineH
  const optionRowHeight = (label) =>
    Math.max(BTN_MIN_H, Math.max(1, Math.ceil(label.length / optionCharsPerLine)) * (FS_ANSWER * 1.35) + optionVPadding)

  const emptyResponses = Object.fromEntries(ALL_QUESTIONS.map((q) => [q.id, null]))

  function estimateScreenHeight(q) {
    let h = textHeight(q.question, questionCharsPerLine, questionLineH) + 12
    if (q.helper) h += textHeight(q.helper, helperCharsPerLine, helperLineH) + 28
    if (q.input === 'multi_choice' || q.input === 'single_choice') {
      const options = q.optionsIf ? q.optionsIf(emptyResponses) : (q.options ?? [])
      if (options.length > 0) {
        h += options.map((o) => optionRowHeight(o.label)).reduce((a, b) => a + b, 0) + (options.length - 1) * optionListGap
      }
    } else if (q.input === 'short_text' || q.input === 'numeric') {
      h += BTN_MIN_H
    }
    return h
  }

  const estimates = ALL_QUESTIONS.map((q) => ({
    id: q.id,
    height: Math.round(estimateScreenHeight(q)),
    fits: estimateScreenHeight(q) <= availableH,
  }))

  return { availableH, contentWidth, estimates }
}

const VIEWPORTS = [
  { label: '800x1280 (portrait, base reference)', w: 800, h: 1280 },
  { label: '834x1194 (portrait)', w: 834, h: 1194 },
  { label: '1200x1920 (large portrait)', w: 1200, h: 1920 },
  { label: '1280x800 (landscape)', w: 1280, h: 800 },
]

/* =========================================================================
 * 1. Content column never exceeds --content-max on any target viewport,
 *    portrait or landscape (UX task §15: "landscape에서도 양옆이 과도하게
 *    벌어지지 않도록 max-width 유지").
 * ========================================================================= */

for (const vp of VIEWPORTS) {
  const { contentWidth } = budgetFor(vp.w, vp.h)
  assert(`${vp.label}: content column stays capped at --content-max (680px), got ${contentWidth}px`, contentWidth === CONTENT_MAX)
}

/* =========================================================================
 * 2. Available inner-scroll content area stays positive and non-degenerate
 *    on every target viewport (fixed chrome never eats the whole screen).
 * ========================================================================= */

const MIN_SANE_AVAILABLE_H = 300 // a screen with less than this is not a usable questionnaire screen at all

for (const vp of VIEWPORTS) {
  const { availableH } = budgetFor(vp.w, vp.h)
  assert(`${vp.label}: available content height is positive and usable (${availableH}px >= ${MIN_SANE_AVAILABLE_H}px)`, availableH >= MIN_SANE_AVAILABLE_H)
}

/* =========================================================================
 * 3. Portrait-ish viewports (generous available height): reapply the
 *    stricter "fits or explicitly allowlisted" contract from
 *    layout-budget.spec.mjs. Landscape (1280x800) is intentionally excluded
 *    here -- see file header comment.
 * ========================================================================= */

// Computed by running budgetFor(834, 1194) against the current question set
// (see this file's header comment for the exact command/output) and
// reviewing which screens genuinely need inner scroll at that viewport's
// tighter (850px) available height, beyond the 800x1280 allowlist already
// justified in layout-budget.spec.mjs. POSTPARTUM_02/SEC_PAIN_01 have long
// multi-select option lists that only overflow once available height drops
// below ~869px -- they fit fine at the 800x1280 reference viewport.
const PORTRAIT_ALLOWLISTS = {
  '834x1194 (portrait)': new Set(['BIRTH_03', 'HISTORY_01', 'SECONDARY_01', 'LBP_11', 'POSTPARTUM_02', 'SEC_PAIN_01']),
  '1200x1920 (large portrait)': new Set(), // spacious enough that nothing needs inner scroll
}

for (const [label, allowlist] of Object.entries(PORTRAIT_ALLOWLISTS)) {
  const vp = VIEWPORTS.find((v) => v.label === label)
  const { estimates } = budgetFor(vp.w, vp.h)
  const unexplained = estimates.filter((e) => !e.fits && !allowlist.has(e.id))
  assert(
    `${label}: every screen fits or is explicitly allowlisted for inner scroll (unexplained: ${
      unexplained.map((e) => `${e.id}(${e.height}px)`).join(', ') || 'none'
    })`,
    unexplained.length === 0,
  )
}

/* =========================================================================
 * 4. CTA footer is structurally a sibling of the scrollable main, never
 *    nested inside it -- so it can never be scrolled off-screen on any
 *    viewport, however tall a question's content grows (UX task §7).
 * ========================================================================= */

{
  // ScreenShell.tsx renders <header>/<main>/<footer> as direct children of
  // the single `.shell` flex column -- <footer> must not be inside <main>.
  const mainOpen = screenShellSrc.indexOf('<main')
  const mainClose = screenShellSrc.indexOf('</main>')
  const footerOpen = screenShellSrc.indexOf('<footer')
  assert('ScreenShell.tsx: <main> opens before it closes (sanity)', mainOpen !== -1 && mainClose !== -1 && mainOpen < mainClose)
  assert('ScreenShell.tsx: <footer> (CTA + help button) is NOT nested inside <main> -- it starts after </main> closes', footerOpen > mainClose)
}

{
  const shellBlockMatch = css.match(/\.shell\s*\{([^}]*)\}/)
  assert('styles.css has a .shell rule', !!shellBlockMatch)
  assert('.shell is a flex column (header/main/footer stack, footer always in-flow at the bottom)', !!shellBlockMatch && /display:\s*flex/.test(shellBlockMatch[1]) && /flex-direction:\s*column/.test(shellBlockMatch[1]))

  const mainRuleMatch = css.match(/\.shell__main\s*\{([^}]*)\}/)
  assert('.shell__main is flex: 1 1 auto (the only element that grows/scrolls)', !!mainRuleMatch && /flex:\s*1\s+1\s+auto/.test(mainRuleMatch[1]))

  const bottomRuleMatch = css.match(/\.shell__bottom\s*\{([^}]*)\}/)
  assert('.shell__bottom (CTA) is flex: 0 0 auto (fixed size, never grows/scrolls away)', !!bottomRuleMatch && /flex:\s*0\s+0\s+auto/.test(bottomRuleMatch[1]))
}

/* =========================================================================
 * 5. Summary
 * ========================================================================= */

console.log('\nPer-viewport summary:')
for (const vp of VIEWPORTS) {
  const { availableH, contentWidth, estimates } = budgetFor(vp.w, vp.h)
  const overflowCount = estimates.filter((e) => !e.fits).length
  console.log(`  ${vp.label}: available=${availableH}px contentWidth=${contentWidth}px screensNeedingInnerScroll=${overflowCount}/${estimates.length}`)
}

console.log(`\nSUMMARY: ${passCount} assertions passed, 0 failed (total ${passCount})`)
