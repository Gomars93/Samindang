// Deterministic layout-budget check for the 800x1280 reference viewport.
// No browser available: this recomputes the box model from the CSS
// constants in src/styles.css by hand and estimates each screen's content
// height from its question/helper/option text. It cannot render text, so it
// uses a simple width/fontSize character-count heuristic (see below) -- it
// is a smoke check for "did someone add a screen that obviously blows the
// budget", not a pixel-accurate layout engine.
//
// Run via `npm run test:layout` (bundles coreSpec.ts with esbuild first,
// same bundle test:integration uses).

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

/* =========================================================================
 * 1. Fixed chrome height, read directly off the CSS constants below.
 *    (Values confirmed against src/styles.css at the time this test was
 *    written -- see the `assert CSS still matches` block further down,
 *    which fails loudly instead of silently drifting if styles.css changes.)
 * ========================================================================= */

// --root vars
const GUTTER = 32 // --gutter
const BTN_MIN_H = 72 // --btn-min-h
const FS_QUESTION = 32 // --fs-question
const FS_ANSWER = 23 // --fs-answer
const FS_HELPER = 19 // --fs-helper
const CONTENT_MAX = 680 // --content-max

const VIEWPORT_W = 800
const VIEWPORT_H = 1280

// header = .shell__top padding-top + .shell__topRow min-height + .steps margin-top + .steps height
const SHELL_TOP_PADDING_TOP = 20
const SHELL_TOPROW_MIN_H = 56
const STEPS_MARGIN_TOP = 16
const STEPS_HEIGHT = 10 // .steps__item height
const HEADER_H = SHELL_TOP_PADDING_TOP + SHELL_TOPROW_MIN_H + STEPS_MARGIN_TOP + STEPS_HEIGHT

// footer = .shell__bottom padding top+bottom + .primaryBtn min-height + .helpBtn margin-top + .helpBtn min-height
const SHELL_BOTTOM_PADDING_TOP = 16
const SHELL_BOTTOM_PADDING_BOTTOM = 28
const PRIMARY_BTN_MIN_H = BTN_MIN_H // .primaryBtn min-height: var(--btn-min-h)
const HELP_BTN_MARGIN_TOP = 14
const HELP_BTN_MIN_H = 56
const FOOTER_H =
  SHELL_BOTTOM_PADDING_TOP + SHELL_BOTTOM_PADDING_BOTTOM + PRIMARY_BTN_MIN_H + HELP_BTN_MARGIN_TOP + HELP_BTN_MIN_H

// main padding = .shell__main padding top + bottom
const SHELL_MAIN_PADDING_TOP = 40
const SHELL_MAIN_PADDING_BOTTOM = 16
const MAIN_PADDING_H = SHELL_MAIN_PADDING_TOP + SHELL_MAIN_PADDING_BOTTOM

// Tablet UX v2.3 §9-10: .shell__scrollHintLane is a new fixed-height flex
// sibling of .shell__main (always reserved in portrait/narrow viewports,
// hidden entirely in wide landscape -- see viewport-budget.spec.mjs, which
// is portrait-vs-landscape-aware). This reference viewport (800x1280) is
// portrait, so the lane's height must be counted against available content
// height here or this budget would silently overestimate how much room a
// screen actually has.
const SCROLL_HINT_LANE_H = 40 // .shell__scrollHintLane height

const AVAILABLE_H = VIEWPORT_H - HEADER_H - FOOTER_H - MAIN_PADDING_H - SCROLL_HINT_LANE_H

console.log(
  `Chrome: header=${HEADER_H}px footer=${FOOTER_H}px mainPadding=${MAIN_PADDING_H}px scrollHintLane=${SCROLL_HINT_LANE_H}px -> available content height=${AVAILABLE_H}px (of ${VIEWPORT_H}px)`,
)

// Sanity-check the hardcoded numbers above actually still appear in styles.css,
// so this test fails loudly (not silently) if someone edits the CSS constants
// without updating this budget.
{
  const mustContain = [
    '--gutter: 32px',
    '--btn-min-h: 72px',
    '--fs-question: 32px',
    '--fs-answer: 23px',
    '--fs-helper: 19px',
    '--content-max: 680px',
    'padding: 20px var(--gutter) 0',
    'min-height: 56px',
    'margin-top: 16px',
    'height: 10px',
    'padding: 40px var(--gutter) 16px',
    'padding: 16px var(--gutter) 28px',
    'margin-top: 14px',
  ]
  const missing = mustContain.filter((s) => !css.includes(s))
  assert(
    `CSS constants used in this budget still match src/styles.css (missing: ${missing.join(', ') || 'none'})`,
    missing.length === 0,
  )
}

/* =========================================================================
 * 2. Per-screen content height estimate.
 *
 * Text-wrapping assumption (no real text shaping available here): Korean
 * (Hangul) glyphs render at approximately 1 character-width per 1em at
 * these font sizes, so charsPerLine ~= floor(availableWidthPx / fontSizePx).
 * This is a rough approximation (real Hangul metrics + kerning + Latin
 * digits mixed in will vary this), good enough for a budget smoke test, not
 * for pixel-accurate layout.
 * ========================================================================= */

const contentWidth = Math.min(CONTENT_MAX, VIEWPORT_W - 2 * GUTTER) // min(680, 736) = 680

const QUESTION_LINE_H = FS_QUESTION * 1.35
const QUESTION_MARGIN_BOTTOM = 12 // .question margin: 0 0 12px
const QUESTION_CHARS_PER_LINE = Math.floor(contentWidth / FS_QUESTION)

const HELPER_LINE_H = FS_HELPER * 1.35
const HELPER_MARGIN_BOTTOM = 28 // .helper margin: 0 0 28px
const HELPER_CHARS_PER_LINE = Math.floor(contentWidth / FS_HELPER)

const OPTION_H_PADDING = 24 * 2 // .option padding: 16px 24px
const OPTION_MARK_W = 32 // .option__mark width
const OPTION_GAP = 16 // .option gap (mark <-> label)
const OPTION_LIST_GAP = 14 // .optionList gap
const OPTION_V_PADDING = 16 * 2 // .option padding: 16px 24px (vertical)
const optionContentWidth = contentWidth - OPTION_H_PADDING - OPTION_MARK_W - OPTION_GAP
const OPTION_CHARS_PER_LINE = Math.floor(optionContentWidth / FS_ANSWER)

function textHeight(text, charsPerLine, lineH) {
  const lines = Math.max(1, Math.ceil(text.length / charsPerLine))
  return lines * lineH
}

function optionRowHeight(label) {
  const lines = Math.max(1, Math.ceil(label.length / OPTION_CHARS_PER_LINE))
  return Math.max(BTN_MIN_H, lines * (FS_ANSWER * 1.35) + OPTION_V_PADDING)
}

const emptyResponses = Object.fromEntries(ALL_QUESTIONS.map((q) => [q.id, null]))

function estimateScreenHeight(q) {
  let h = 0
  h += textHeight(q.question, QUESTION_CHARS_PER_LINE, QUESTION_LINE_H) + QUESTION_MARGIN_BOTTOM

  if (q.helper) {
    h += textHeight(q.helper, HELPER_CHARS_PER_LINE, HELPER_LINE_H) + HELPER_MARGIN_BOTTOM
  }
  // Dynamic helperIf text is not modeled: it is optional, short, one-line
  // guidance (e.g. "bring your prescription"), never the tallest part of a
  // screen, and only known once a response is chosen.

  if (q.input === 'multi_choice' || q.input === 'single_choice') {
    const options = q.optionsIf ? q.optionsIf(emptyResponses) : (q.options ?? [])
    if (options.length > 0) {
      const rows = options.map((o) => optionRowHeight(o.label))
      h += rows.reduce((a, b) => a + b, 0) + (options.length - 1) * OPTION_LIST_GAP
    }
  } else if (q.input === 'short_text' || q.input === 'numeric') {
    h += BTN_MIN_H // .textField min-height
  }

  return h
}

/* =========================================================================
 * 3. Budget assertion: every screen fits, or is explicitly allowlisted for
 *    inner scroll (.shell__main already scrolls, see part 4).
 * ========================================================================= */

// Populated after reviewing the computed table below: these screens have
// long multi-select option lists (11 options each) that genuinely exceed
// the 936px budget at the reference viewport and rely on .shell__main's
// overflow-y: auto to scroll internally. Anything NOT in this list must fit.
// BIRTH_03 (12시진 + 잘 모르겠어요, 13 options) also genuinely exceeds the
// budget and is mitigated the same way -- the screen scrolls internally via
// .shell__main's overflow-y: auto, so no content is unreachable.
// LBP_11(염증성 선별, 9지선다 + helper 없음이지만 다지선다라 길다)도 같은 이유로 허용 —
// LBP_INTEGRATION_PLAN_DRAFT.md §12.4.
// ADDITIONAL_DETAIL_01/REFERENCE_SYMPTOMS_01 (Tablet UX v2.1 §11-13) replace
// SECONDARY_01's old mixed role with two longer, clearer grid2 screens --
// same reasoning as SECONDARY_01 was already allowlisted for.
const INNER_SCROLL_ALLOWED = new Set(['SECONDARY_01', 'ADDITIONAL_DETAIL_01', 'REFERENCE_SYMPTOMS_01', 'HISTORY_01', 'BIRTH_03', 'LBP_11'])

const estimates = ALL_QUESTIONS.map((q) => ({
  id: q.id,
  height: Math.round(estimateScreenHeight(q)),
  fits: estimateScreenHeight(q) <= AVAILABLE_H,
}))

const sorted = [...estimates].sort((a, b) => b.height - a.height)
const top15 = sorted.slice(0, 15)

console.log(`\nTop 15 tallest screens (available=${AVAILABLE_H}px):`)
console.log('id'.padEnd(20) + 'estHeight'.padEnd(12) + 'fits?'.padEnd(8) + 'allowlisted?')
for (const e of top15) {
  console.log(
    e.id.padEnd(20) + `${e.height}px`.padEnd(12) + (e.fits ? 'yes' : 'no').padEnd(8) + (INNER_SCROLL_ALLOWED.has(e.id) ? 'yes' : ''),
  )
}

{
  const unexplainedOverflow = estimates.filter((e) => !e.fits && !INNER_SCROLL_ALLOWED.has(e.id))
  assert(
    `Every screen either fits within ${AVAILABLE_H}px or is in INNER_SCROLL_ALLOWED (unexplained overflow: ${
      unexplainedOverflow.map((e) => `${e.id}(${e.height}px)`).join(', ') || 'none'
    })`,
    unexplainedOverflow.length === 0,
  )
}

{
  // Allowlist should not accumulate dead entries for screens that actually fit.
  const deadEntries = [...INNER_SCROLL_ALLOWED].filter((id) => {
    const e = estimates.find((x) => x.id === id)
    return e && e.fits
  })
  assert(
    `INNER_SCROLL_ALLOWED has no dead entries for screens that actually fit (dead: ${deadEntries.join(', ') || 'none'})`,
    deadEntries.length === 0,
  )
}

/* =========================================================================
 * 4. Outer page cannot scroll; .shell__main is the only scroll container.
 * ========================================================================= */

{
  const htmlBodyRootBlockMatch = css.match(/html,\s*body,\s*#root\s*\{([^}]*)\}/)
  assert('styles.css has an html, body, #root rule', !!htmlBodyRootBlockMatch)
  assert(
    'html, body, #root rule sets overflow: hidden',
    !!htmlBodyRootBlockMatch && /overflow:\s*hidden/.test(htmlBodyRootBlockMatch[1]),
  )

  const shellMainBlockMatch = css.match(/\.shell__main\s*\{([^}]*)\}/)
  assert('styles.css has a .shell__main rule', !!shellMainBlockMatch)
  assert(
    '.shell__main sets overflow-y: auto (the only scroll container)',
    !!shellMainBlockMatch && /overflow-y:\s*auto/.test(shellMainBlockMatch[1]),
  )
}

/* =========================================================================
 * 5. Summary
 * ========================================================================= */

const fitCount = estimates.filter((e) => e.fits).length
const scrollCount = estimates.filter((e) => !e.fits && INNER_SCROLL_ALLOWED.has(e.id)).length
const tallest = sorted[0]

console.log(
  `\nSUMMARY: ${estimates.length} screens total -- ${fitCount} fit within ${AVAILABLE_H}px, ${scrollCount} need inner scroll (allowlisted).`,
)
console.log(`Tallest screen: ${tallest.id} at ~${tallest.height}px (budget ${AVAILABLE_H}px).`)
console.log(`\nSUMMARY: ${passCount} assertions passed, 0 failed (total ${passCount})`)
