// Patient-facing UX/accessibility/resilience regression suite (Tablet
// Questionnaire v1 UX verification). Complements patient-flow.spec.mjs
// (PatientCompleteScreen/IdleWarningModal) and viewport-budget.spec.mjs
// (layout budget) with: the top-level error boundary, StaffCheck's
// no-bypass/no-back guarantee, disabled-option styling, focus-visible
// styling, and a deterministic WCAG contrast-ratio check on the color
// palette in src/styles.css.
//
// Run via `npm run test:patient-ux` (bundles the relevant patient-facing
// components with esbuild first, same style as test:patient).
// Plain node, no test framework: assert() prints "OK: <name>" and throws on failure.

import React from 'react'
import { renderToString } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { PatientErrorBoundary } from './.patient-error-boundary-bundle.cjs'
import { StaffCheckScreen } from './.staff-check-screen-bundle.cjs'
import { SingleChoice } from './.single-choice-bundle.cjs'
import { MultiChoice } from './.multi-choice-bundle.cjs'

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
 * 1. PatientErrorBoundary: shows a friendly, non-technical Korean fallback
 *    when it has caught a render exception -- never the raw error
 *    message/stack, never a blank/white render.
 *
 * Note on method: React's legacy `renderToString` (used throughout this
 * test suite, matching every other spec file) does NOT invoke
 * getDerivedStateFromError/componentDidCatch the way client-side
 * reconciliation or the streaming SSR API do -- a child throwing during
 * `renderToString` just propagates the exception out of the call instead of
 * being caught. Simulating the actual client-side catch would require a
 * jsdom+act() browser-like environment, a real new dependency this project
 * does not otherwise need (see tests/viewport-budget.spec.mjs's header
 * comment for the same avoid-a-heavy-new-dependency reasoning). Instead:
 * exercise the class component's actual render() output directly in both
 * states (matching how React itself renders it once state.hasError flips),
 * plus a static source-code guard that the fallback JSX never interpolates
 * the caught error/info at all -- which is the property that actually
 * guarantees no leak, regardless of how the catch is triggered.
 * ========================================================================= */

{
  const instance = new PatientErrorBoundary({ children: React.createElement('div', null, 'normal content'), onReset: () => {} })
  assert('PatientErrorBoundary: starts with hasError = false', instance.state.hasError === false)
  assert('PatientErrorBoundary.getDerivedStateFromError: flips state to hasError = true', PatientErrorBoundary.getDerivedStateFromError(new Error('x')).hasError === true)

  const normalHtml = renderToString(instance.render())
  assert('PatientErrorBoundary: renders children through untouched when hasError is false', normalHtml.includes('normal content'))
  assert('PatientErrorBoundary: does not show the fallback message when nothing has been caught', !normalHtml.includes('문제가 발생했습니다'))

  instance.state = { hasError: true }
  const fallbackHtml = renderToString(instance.render())
  assert('PatientErrorBoundary: shows the friendly Korean fallback message once caught', fallbackHtml.includes('문제가 발생했습니다'))
  assert('PatientErrorBoundary: tells the patient to show staff the tablet (matches every other error-path screen)', fallbackHtml.includes('직원'))
  assert('PatientErrorBoundary: offers a reset control back to the start', fallbackHtml.includes('처음 화면으로'))
  assert('PatientErrorBoundary: uses role="alert" so assistive tech announces it immediately', fallbackHtml.includes('role="alert"'))
  assert('PatientErrorBoundary: fallback CTA is a real semantic <button>', /<button[^>]*>\s*처음 화면으로\s*<\/button>/.test(fallbackHtml))
  assert('PatientErrorBoundary: fallback no longer renders the children tree', !fallbackHtml.includes('normal content'))
}

{
  // Static guard: the property that actually prevents a leak is that the
  // fallback branch's JSX never references the caught error/info at all --
  // true regardless of what error message or stack a future bug produces.
  const src = readFileSync(join(__dirname, '..', 'src', 'components', 'PatientErrorBoundary.tsx'), 'utf8')
  const fallbackBlock = src.slice(src.indexOf('if (!this.state.hasError)'))
  assert(
    'PatientErrorBoundary CRITICAL: the fallback render branch never interpolates the caught error/info (source-level guard, catch-mechanism-independent)',
    !/\{[^}]*(error|info)[^}]*\}/i.test(fallbackBlock),
  )
}

/* =========================================================================
 * 2. StaffCheckScreen: no back-navigation or continue-without-staff bypass
 *    affordance rendered by the component itself (App.tsx also renders it
 *    with no onBack wiring for phase === 'staff_check' -- this is the
 *    component-level half of that guarantee).
 * ========================================================================= */

{
  const html = renderToString(React.createElement(StaffCheckScreen, { onContinue: () => {} }))
  assert('StaffCheckScreen: shows the required staff-notice copy', html.includes('직원에게 보여주세요'))
  assert('StaffCheckScreen: uses role="alert" so assistive tech announces the interrupt immediately', html.includes('role="alert"'))
  assert('StaffCheckScreen: renders exactly one control (the continue button) -- no back/skip affordance', (html.match(/<button/g) || []).length === 1)
  assert('StaffCheckScreen: has no "이전" (back) text anywhere', !html.includes('이전'))
  assert('StaffCheckScreen: does not invent a clinical diagnosis/emergency label (no reinterpretation of clinical copy)', !/[가-힣]+(진단|응급질환)/.test(html))
}

/* =========================================================================
 * 3. MultiChoice: reaching `max` disables the remaining unselected options,
 *    and .option:disabled now has an explicit visual style (styles.css) so
 *    "why can't I tap this" isn't left to browser-default styling.
 * ========================================================================= */

{
  const options = [
    { value: 'a', label: '옵션 A' },
    { value: 'b', label: '옵션 B' },
    { value: 'c', label: '옵션 C' },
  ]
  const html = renderToString(
    React.createElement(MultiChoice, { options, value: ['a', 'b'], onChange: () => {}, max: 2 }),
  )
  const buttons = html.match(/<button[^>]*>[\s\S]*?<\/button>/g) ?? []
  assert('MultiChoice at max: renders exactly 3 option buttons', buttons.length === 3)
  const optionC = buttons.find((b) => b.includes('옵션 C'))
  const optionA = buttons.find((b) => b.includes('옵션 A'))
  assert('MultiChoice at max: the third (unselected, over-max) option carries the disabled attribute', !!optionC && /\sdisabled(=""|>| )/.test(optionC))
  assert('MultiChoice at max: an already-selected option stays enabled (can still be un-toggled)', !!optionA && !/\sdisabled(=""|>| )/.test(optionA))
}

{
  const cssHasDisabledRule = /\.option:disabled\s*\{[^}]*opacity/.test(css)
  assert('styles.css: .option:disabled has an explicit visual style (not left to browser default)', cssHasDisabledRule)
}

/* =========================================================================
 * 4. Color-only selection is never the sole indicator -- SingleChoice always
 *    renders a checkmark glyph and aria-checked, not just a background/border
 *    color change (UX task §14).
 * ========================================================================= */

{
  const options = [
    { value: 'x', label: '선택지 X' },
    { value: 'y', label: '선택지 Y' },
  ]
  const html = renderToString(React.createElement(SingleChoice, { options, value: 'x', onSelect: () => {} }))
  assert('SingleChoice: selected option carries aria-checked="true"', /aria-checked="true"/.test(html))
  assert('SingleChoice: selected option renders a visible checkmark glyph (not color alone)', html.includes('✓'))
  assert('SingleChoice: unselected option carries aria-checked="false"', /aria-checked="false"/.test(html))
  assert('SingleChoice: each option is a real semantic <button role="radio">', (html.match(/role="radio"/g) || []).length === 2)
}

/* =========================================================================
 * 5. Focus-visible: interactive elements have an explicit focus style in
 *    CSS (keyboard/switch-access users on Android, and desk staff using a
 *    mouse/trackpad) -- not left to invisible/inconsistent browser default.
 * ========================================================================= */

{
  assert(
    'styles.css: buttons/inputs/radio/checkbox roles have an explicit :focus-visible outline style',
    /:focus-visible\s*,?[\s\S]{0,400}outline:\s*3px solid var\(--primary\)/.test(css),
  )
}

/* =========================================================================
 * 6. WCAG contrast: deterministic relative-luminance computation (no
 *    browser) against the palette's actual hex values in styles.css, so a
 *    future palette change cannot silently drop below AA without this
 *    suite failing loudly.
 * ========================================================================= */

function hexToRgb(hex) {
  const h = hex.replace('#', '')
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
}
function relLuminance([r, g, b]) {
  const chan = (c) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b)
}
function contrastRatio(hexA, hexB) {
  const lA = relLuminance(hexToRgb(hexA))
  const lB = relLuminance(hexToRgb(hexB))
  const [lighter, darker] = lA > lB ? [lA, lB] : [lB, lA]
  return (lighter + 0.05) / (darker + 0.05)
}

function cssVar(name) {
  const m = css.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`))
  if (!m) throw new Error(`CSS var ${name} not found in styles.css`)
  return m[1]
}

const colors = {
  primary: cssVar('--primary'),
  bg: cssVar('--bg'),
  surface: cssVar('--surface'),
  text: cssVar('--text'),
  textMuted: cssVar('--text-muted'),
  danger: cssVar('--danger'),
}

// WCAG 2.1 AA for normal-size body text: 4.5:1.
const AA_NORMAL_TEXT = 4.5

const textPairs = [
  ['--text on --bg (question text)', colors.text, colors.bg],
  ['--text-muted on --bg (helper text)', colors.textMuted, colors.bg],
  ['--text on --surface (option label)', colors.text, colors.surface],
  ['--text-muted on --surface', colors.textMuted, colors.surface],
  ['#ffffff on --primary (primaryBtn label)', '#ffffff', colors.primary],
]

for (const [label, fg, bg] of textPairs) {
  const ratio = contrastRatio(fg, bg)
  assert(`WCAG AA contrast: ${label} = ${ratio.toFixed(2)}:1 (>= ${AA_NORMAL_TEXT}:1)`, ratio >= AA_NORMAL_TEXT)
}

/* =========================================================================
 * 7. Summary
 * ========================================================================= */

console.log(`\nSUMMARY: ${passCount} assertions passed, 0 failed (total ${passCount})`)
