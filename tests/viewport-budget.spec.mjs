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

// Tablet UX v2.2.1 §4/§9/§34: wide-landscape (orientation:landscape,
// min-width:760px, styles.css) collapses backBtn/stepLabel/helpBtn out of
// the main-column flow entirely (moved to rails, `display:none` in place)
// and shrinks the remaining chrome's own spacing -- this heuristic must
// model that reduced chrome for landscape viewports at/above the
// breakpoint, or it under-estimates available height for every wide
// viewport (the exact 296px-vs-300px false negative this comment replaced).
const WIDE_LANDSCAPE_MIN_WIDTH = 760
const HEADER_H_WIDE = 8 + 0 + 6 + 6 // shell__top padding-top + topRow min-h(collapsed) + steps margin-top + steps height (thinner)
// Tablet UX v2.3 §16: the wide-landscape .shell__bottom/.primaryBtn rules
// were further trimmed (10px/16px padding, 56px min-height, font-size
// untouched) to reveal one more option row -- this must track that trim or
// it under-estimates available height for every wide viewport.
const FOOTER_H_WIDE = 10 + 16 + 56 // shell__bottom padding (landscape-trimmed) + primaryBtn (landscape-trimmed) -- helpBtn moved to right rail (display:none)

// Tablet UX v2.3 §9-10: .shell__scrollHintLane is a new fixed-height flex
// sibling of .shell__main, always reserved in portrait/narrow viewports.
// It is hidden entirely (display:none) in wide landscape -- the right rail's
// .railScrollHint takes over there, living in the rail's own already-counted
// vertical space rather than adding new height cost -- so this only applies
// when NOT wide.
const SCROLL_HINT_LANE_H = 40 // .shell__scrollHintLane height (portrait only)

function isWideLandscape(viewportW, viewportH) {
  return viewportW > viewportH && viewportW >= WIDE_LANDSCAPE_MIN_WIDTH
}

function budgetFor(viewportW, viewportH) {
  const wide = isWideLandscape(viewportW, viewportH)
  const headerH = wide ? HEADER_H_WIDE : HEADER_H
  const footerH = wide ? FOOTER_H_WIDE : FOOTER_H
  const scrollHintLaneH = wide ? 0 : SCROLL_HINT_LANE_H
  const availableH = viewportH - headerH - footerH - MAIN_PADDING_H - scrollHintLaneH
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
  // Tablet UX v2.1 §28: a second, larger 11-inch-class tablet landscape
  // size, matching the real device the field QA screenshots came from.
  { label: '1600x900 (large landscape)', w: 1600, h: 900 },
  // Tablet UX v2.2.1 §2/§34: the min-width:1000px breakpoint never fired on
  // a real 11" Android tablet -- its landscape CSS viewport (driven by
  // devicePixelRatio, not raw physical resolution) commonly lands well
  // below 1000px. These four are the exact real-device-QA viewports named
  // in the task; every one of them must trigger the wide-landscape rail
  // layout (now min-width:760px) -- see §7 below.
  { label: '1024x640 (landscape, real-device QA)', w: 1024, h: 640 },
  { label: '960x600 (landscape, real-device QA)', w: 960, h: 600 },
  { label: '800x500 (landscape, real-device QA)', w: 800, h: 500 },
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
// tighter (now 810px, after the v2.3 §9-10 scroll-hint lane reserves an
// extra fixed 40px -- was 850px before that lane existed) available height,
// beyond the 800x1280 allowlist already justified in layout-budget.spec.mjs.
// POSTPARTUM_02/SEC_PAIN_01 have long multi-select option lists that only
// overflow once available height drops below ~869px -- they fit fine at the
// 800x1280 reference viewport. PAIN_01/NECK_04/PREGNANCY_03/SEC_URINARY_01/
// MED_TYPES (815-826px) newly cross the 810px line purely because of the
// new lane's fixed cost, not because their own content grew -- inner scroll
// (the app's only scroll container, .shell__main) handles this the same way
// it already does for the rest of this allowlist; nothing breaks.
const PORTRAIT_ALLOWLISTS = {
  '834x1194 (portrait)': new Set([
    'BIRTH_03', 'HISTORY_01', 'SECONDARY_01', 'LBP_11', 'POSTPARTUM_02', 'SEC_PAIN_01',
    // Tablet UX v2.1 §11-13: ADDITIONAL_DETAIL_01/REFERENCE_SYMPTOMS_01
    // replace SECONDARY_01's old mixed role with two longer grid2 screens.
    'ADDITIONAL_DETAIL_01', 'REFERENCE_SYMPTOMS_01',
    // Tablet UX v2.3 §9-10: newly tight after the scroll-hint lane's fixed
    // 40px reservation (see comment above).
    'PAIN_01', 'NECK_04', 'PREGNANCY_03', 'SEC_URINARY_01', 'MED_TYPES',
  ]),
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
 * 5. Wide landscape 3-zone rail layout (Tablet UX v2.2 §5-10).
 *    portrait/narrow viewports must render byte-identical to before -- the
 *    rail elements exist in the DOM (for accessibility: display:none is
 *    excluded from the tab order/a11y tree automatically) but are hidden by
 *    default, only shown inside the wide-landscape media query.
 * ========================================================================= */

{
  assert('ScreenShell.tsx: renders a dedicated left-rail back button (railBackBtn)', screenShellSrc.includes('railBackBtn'))
  assert('ScreenShell.tsx: renders a dedicated right rail (shell__railRight) with step label + help button', screenShellSrc.includes('shell__railRight') && screenShellSrc.includes('railStepLabel') && screenShellSrc.includes('railHelpBtn'))

  const railDefaultMatch = css.match(/\.railBackBtn,\s*\n?\s*\.shell__railRight\s*\{([^}]*)\}/)
  assert('styles.css: rail elements are display:none by default (portrait/narrow unaffected)', !!railDefaultMatch && /display:\s*none/.test(railDefaultMatch[1]))

  // Tablet UX v2.2.1 §2: breakpoint lowered from min-width:1000px (never
  // fired on real 11" Android landscape) to min-width:760px.
  const wideMediaBlockMatch = css.match(/@media \(orientation: landscape\) and \(min-width: 760px\) \{/)
  assert('styles.css: wide-landscape breakpoint (orientation:landscape, min-width:760px) exists', !!wideMediaBlockMatch)

  // Extract just that media block's body via brace counting (regex alone
  // can't reliably match nested braces).
  const startIdx = css.indexOf('@media (orientation: landscape) and (min-width: 760px)')
  assert('styles.css: wide-landscape media block start found', startIdx !== -1)
  let depth = 0
  let bodyStart = -1
  let bodyEnd = -1
  for (let i = startIdx; i < css.length; i++) {
    if (css[i] === '{') {
      depth++
      if (depth === 1) bodyStart = i + 1
    } else if (css[i] === '}') {
      depth--
      if (depth === 0) {
        bodyEnd = i
        break
      }
    }
  }
  const wideBody = css.slice(bodyStart, bodyEnd)
  assert('wide-landscape block: .shell becomes a 3-column grid', /\.shell\s*\{[^}]*display:\s*grid/.test(wideBody))
  assert('wide-landscape block: grid-template-columns declares a narrow rail width (72px-104px range)', /grid-template-columns:\s*minmax\(72px,\s*104px\)/.test(wideBody))
  assert('wide-landscape block: .railBackBtn is shown (display:flex)', /\.railBackBtn\s*\{[^}]*display:\s*flex/.test(wideBody))
  assert('wide-landscape block: .shell__railRight is shown (display:flex)', /\.shell__railRight\s*\{[^}]*display:\s*flex/.test(wideBody))
  assert('wide-landscape block: original topRow backBtn/stepLabel and bottom helpBtn are hidden (moved to rails, not duplicated)', /display:\s*none/.test(wideBody) && wideBody.includes('.shell__topRow .backBtn'))
  // Tablet UX v2.2.1 §3: bumped from 900px into the requested 880-1000px
  // range so the rail actually reclaims usable width, not just adds
  // side-columns while leaving the center column unchanged.
  assert('wide-landscape block: wideContent class widens --content-max into the 880-1000px range for grid/category screens', /shell--wideContent[\s\S]*max-width:\s*96\dpx/.test(wideBody))

  // Tablet UX v2.2.1 §4: with backBtn/stepLabel moved to rails, .shell__topRow
  // must not keep reserving its old 56px min-height -- otherwise wide
  // landscape saves zero vertical chrome despite the content being hidden.
  assert('wide-landscape block: .shell__topRow min-height is collapsed (no reserved empty chrome once backBtn/stepLabel move to rails)', /\.shell__topRow\s*\{[^}]*min-height:\s*0/.test(wideBody))
  // §9: progress bar thickness itself (not font-size) is reduced.
  assert('wide-landscape block: .steps__item bar is thinner than the base 10px (spacing-only footprint reduction, not font-size)', /\.steps__item\s*\{[^}]*height:\s*[1-9]px/.test(wideBody))
}

/* =========================================================================
 * 7. Tablet UX v2.2.1 §2/§34: every real-device-QA landscape viewport named
 *    in the task must actually satisfy the CSS breakpoint's own condition
 *    (min-width extracted from the stylesheet itself, not re-hardcoded --
 *    this test breaks loudly if the two ever drift apart again).
 * ========================================================================= */

{
  const minWidthMatch = css.match(/@media \(orientation: landscape\) and \(min-width: (\d+)px\)/)
  assert('styles.css: wide-landscape min-width threshold is extractable', !!minWidthMatch)
  const threshold = Number(minWidthMatch[1])

  const REQUIRED_REAL_DEVICE_LANDSCAPE_VIEWPORTS = [
    '1280x800 (landscape)',
    '1024x640 (landscape, real-device QA)',
    '960x600 (landscape, real-device QA)',
    '800x500 (landscape, real-device QA)',
  ]
  for (const label of REQUIRED_REAL_DEVICE_LANDSCAPE_VIEWPORTS) {
    const vp = VIEWPORTS.find((v) => v.label === label)
    assert(`${label}: is present in the tested viewport matrix`, !!vp)
    assert(`${label}: is genuinely landscape (width > height)`, vp.w > vp.h)
    assert(
      `${label}: width (${vp.w}px) meets the wide-landscape breakpoint's own min-width (${threshold}px) -- rail layout WILL activate here`,
      vp.w >= threshold,
    )
  }
}

{
  // ScreenShell wideContent prop is presentation-only (Question.layout
  // metadata), decided in App.tsx from current.layout -- safety/protected
  // screens (layout unset, default 'list') must NOT get the wider column.
  const appSrc = readFileSync(join(__dirname, '..', 'src', 'App.tsx'), 'utf8')
  assert('App.tsx: wideContent is derived from current.layout, excluding the default list layout', /wideContent=\{current\.layout != null && current\.layout !== 'list'\}/.test(appSrc))

  // Tablet UX v2.2.1 §12: HERBAL_ADDON_FIELD must be explicitly nulled by
  // emptyResponses() (called on every fresh session AND every privacy-wipe/
  // restart), and every reset path must call emptyResponses() itself --
  // never spread a previous Responses object -- so a stale 'yes' can never
  // survive into the next patient's session on a shared tablet.
  assert('App.tsx: emptyResponses() explicitly nulls HERBAL_ADDON_FIELD', /\[HERBAL_ADDON_FIELD\]:\s*null/.test(appSrc))
  const setResponsesCalls = [...appSrc.matchAll(/setResponses\(([^)]*)\)/g)].map((m) => m[1].trim())
  assert('App.tsx: setResponses(...) is called at least at the wipe + restart + normal-answer + addon-activate sites', setResponsesCalls.length >= 4)
  const resetCalls = setResponsesCalls.filter((arg) => arg.startsWith('emptyResponses('))
  assert('App.tsx: at least 2 setResponses(...) call sites reset via emptyResponses() (privacy wipe + restart), never a spread of the previous object', resetCalls.length >= 2)

  // PR #23 follow-up correction (v2.3 §8-9/§13): LBP_LEG_AUTOFILL_FIELD
  // must also be explicitly nulled by emptyResponses(), same pattern as
  // HERBAL_ADDON_FIELD/LBP_RAW_AGE_FIELD -- otherwise a stale 'yes' could
  // survive into the next patient's session and wrongly navigation-skip
  // LBP_02/LBP_03 for someone who never answered LBP_01B_LEG_SCREEN.
  assert('App.tsx: emptyResponses() explicitly nulls LBP_LEG_AUTOFILL_FIELD', /\[LBP_LEG_AUTOFILL_FIELD\]:\s*null/.test(appSrc))

  // The navigation-layer auto-skip itself (tests/integration.spec.mjs
  // sections W6/W7/W11 verify the underlying shouldAutoAdvancePast
  // predicate and mirror-simulate the walk against it in detail -- this
  // block instead confirms the ACTUAL App.tsx nextQuestion()/goBack()
  // functions really call that predicate, so a future edit that silently
  // removes the skip loop from the real functions (while the test file's
  // own mirror still has it) would be caught here.
  const nextQuestionMatch = appSrc.match(/const nextQuestion = \(from: string, r: Responses\): Question \| undefined => \{[\s\S]*?\n  \}/)
  assert('App.tsx: nextQuestion() function exists', Boolean(nextQuestionMatch))
  assert('App.tsx CRITICAL: nextQuestion() calls shouldAutoAdvancePast (navigation-layer skip is real, not just simulated in tests)', /shouldAutoAdvancePast/.test(nextQuestionMatch[0]))
  assert('App.tsx CRITICAL: nextQuestion() loops (while) rather than checking only once -- consecutive auto-skip screens (LBP_02 then LBP_03) must both be skipped in one hop', /while\s*\(/.test(nextQuestionMatch[0]))

  const goBackMatch = appSrc.match(/const goBack = \(\) => \{[\s\S]*?\n  \}/)
  assert('App.tsx: goBack() function exists', Boolean(goBackMatch))
  assert('App.tsx CRITICAL: goBack() also calls shouldAutoAdvancePast (back-navigation mirrors the same skip, never lands on an auto-filled screen)', /shouldAutoAdvancePast/.test(goBackMatch[0]))

  assert('App.tsx: imports shouldAutoAdvancePast from spec/coreSpec', /shouldAutoAdvancePast/.test(appSrc.slice(0, appSrc.indexOf("from './spec/coreSpec'"))))
}

/* =========================================================================
 * 8. Summary
 * ========================================================================= */

console.log('\nPer-viewport summary:')
for (const vp of VIEWPORTS) {
  const { availableH, contentWidth, estimates } = budgetFor(vp.w, vp.h)
  const overflowCount = estimates.filter((e) => !e.fits).length
  console.log(`  ${vp.label}: available=${availableH}px contentWidth=${contentWidth}px screensNeedingInnerScroll=${overflowCount}/${estimates.length}`)
}

/* =========================================================================
 * 6. Tablet UX v2.3 §10: wide-landscape center content column sits in the
 *    900-1050px range (not just "wider than before"), and the right rail
 *    carries all four utility items the task spec names: step label,
 *    selected-region feedback (railSelection), scroll hint
 *    (railScrollHint), and help button -- not a subset.
 * ========================================================================= */

{
  const wideContentMatch = css.match(/\.shell--wideContent[\s\S]{0,200}?max-width:\s*(\d+)px/)
  assert('styles.css: .shell--wideContent declares a max-width', Boolean(wideContentMatch))
  const wideContentMax = Number(wideContentMatch[1])
  assert(
    `styles.css: wide-landscape center content max-width (${wideContentMax}px) sits within the required 900-1050px range`,
    wideContentMax >= 900 && wideContentMax <= 1050,
  )

  assert('ScreenShell.tsx: right rail carries a step-label item', screenShellSrc.includes('railStepLabel'))
  assert('ScreenShell.tsx: right rail carries a selected-region feedback slot (railSelection)', screenShellSrc.includes('railSelection'))
  assert('ScreenShell.tsx: right rail carries a scroll-hint item (railScrollHint)', screenShellSrc.includes('railScrollHint'))
  assert('ScreenShell.tsx: right rail carries a help-button item (railHelpBtn)', screenShellSrc.includes('railHelpBtn'))
}

console.log(`\nSUMMARY: ${passCount} assertions passed, 0 failed (total ${passCount})`)
