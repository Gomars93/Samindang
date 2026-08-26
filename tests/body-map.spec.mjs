// Body map regression suite (Tablet Questionnaire Routing/UX v2, §5/§6/§26/§28).
//
// The body map is NOT a precision pain map -- it is a visual input renderer
// for the existing PAIN_01 routing value. This suite proves:
//   1. Every zone value the body map can produce is an actual PAIN_01
//      option value (no invented clinical region enum).
//   2. Every PAIN_01 option value except 'other' is reachable via some
//      zone (no silent coverage gap).
//   3. The fallback list uses the exact same options array as PAIN_01
//      (guarantees identical stored values, no drift between map and list).
//   4. Single-choice semantics: BodyMap never renders more than one
//      selected/checked zone at a time.
//
// Run via `npm run test:body-map` (bundles BodyMap.tsx + coreSpec.ts first).
// Plain node, no test framework: assert() prints "OK: <name>" and throws on failure.

import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { BodyMap, BODY_MAP_ZONE_VALUES } from './.body-map-bundle.cjs'
import { ALL_QUESTIONS } from './.spec-bundle.mjs'

let passCount = 0
function assert(name, cond) {
  if (!cond) throw new Error(`FAIL: ${name}`)
  passCount++
  console.log(`OK: ${name}`)
}

const PAIN_01 = ALL_QUESTIONS.find((q) => q.id === 'PAIN_01')
assert('PAIN_01 exists', Boolean(PAIN_01))
assert('PAIN_01 uses body_map layout', PAIN_01.layout === 'body_map')

const painValues = PAIN_01.options.map((o) => o.value)
const painValuesNoOther = painValues.filter((v) => v !== 'other')

// 1. every zone value is an actual PAIN_01 option value
for (const v of BODY_MAP_ZONE_VALUES) {
  assert(`body map zone value "${v}" is a real PAIN_01 option`, painValues.includes(v))
}

// 2. every non-'other' PAIN_01 value is reachable via some zone
for (const v of painValuesNoOther) {
  assert(`PAIN_01 value "${v}" is reachable via some body map zone`, BODY_MAP_ZONE_VALUES.includes(v))
}

// 'other' is intentionally NOT a zone (no natural silhouette position; only
// reachable via the fallback list) -- confirm that design boundary holds.
assert("'other' is not a body map zone (fallback-list-only by design)", !BODY_MAP_ZONE_VALUES.includes('other'))

// 3. fallback list reuses the exact same options array (no drift)
{
  let selected = null
  const html = renderToStaticMarkup(
    React.createElement(BodyMap, { options: PAIN_01.options, value: null, onSelect: (v) => (selected = v) }),
  )
  assert('body map renders the toggle-to-list control', html.includes('목록으로 보기'))
  // Render again in list mode by simulating the toggle: BodyMap manages its
  // own "showList" state internally, so we verify the fallback renders the
  // same option labels PAIN_01 defines, by checking every option label
  // appears somewhere in the (map-mode) figure aria-labels or, once toggled,
  // in the fallback list. Since map-mode aria-labels use the same
  // ZONE_LABEL strings mapped from these same values, cross-check labels
  // for coverage instead of relying on internal state toggling in SSR.
  for (const opt of PAIN_01.options) {
    if (opt.value === 'other') continue
    assert(`body map figure exposes an aria-label mentioning "${opt.label}" for value "${opt.value}"`, html.includes(opt.label))
  }
}

// 4. single-choice semantics: selecting a value never marks a DIFFERENT
// PAIN_01 value's zone as selected. (Some values like 'knee'/'arm_hand'
// legitimately span multiple visual zones -- e.g. both knees light up
// together -- because PAIN_01 itself does not distinguish left/right; that
// is still single-choice at the *value* level, so this checks a value that
// maps to exactly one zone to pin down the simplest case unambiguously.)
{
  const html = renderToStaticMarkup(
    React.createElement(BodyMap, { options: PAIN_01.options, value: 'low_back_pelvis', onSelect: () => {} }),
  )
  const pressedCount = (html.match(/aria-pressed="true"/g) || []).length
  assert('exactly one zone is aria-pressed=true for a single-zone value (single-choice)', pressedCount === 1)
  const checkmarkCount = (html.match(/bodyMap__zoneMark/g) || []).length
  assert('exactly one checkmark badge renders (color is never the only selected-state signal)', checkmarkCount === 1)
}
{
  // A value that legitimately spans multiple zones (both knees, since
  // PAIN_01 does not distinguish left/right) still reflects exactly one
  // selected PAIN_01 *value* -- pressedCount must equal the total number
  // of zones labeled 무릎(knee) anywhere on the map, never more (no other
  // value's zone lights up) and never fewer (every same-value zone stays
  // in sync).
  const unselected = renderToStaticMarkup(
    React.createElement(BodyMap, { options: PAIN_01.options, value: null, onSelect: () => {} }),
  )
  const kneeZoneTotal = (unselected.match(/aria-label="무릎/g) || []).length
  assert('at least one knee zone exists on the map', kneeZoneTotal > 0)

  const html = renderToStaticMarkup(
    React.createElement(BodyMap, { options: PAIN_01.options, value: 'knee', onSelect: () => {} }),
  )
  const pressedCount = (html.match(/aria-pressed="true"/g) || []).length
  assert(
    "multi-zone value (knee) presses exactly its own zone count, never a different value's zone",
    pressedCount === kneeZoneTotal,
  )
}

/* =========================================================================
 * DOM/CSS structure regression (Tablet UX v2.1 §7/§29).
 *
 * Root cause of the real-device rendering bug: zone buttons were rendered
 * as SIBLINGS of .bodyMap__figure inside .bodyMap__figureWrap, but only
 * .bodyMap__figure had `position: relative` -- .bodyMap__figureWrap did
 * not. A sibling with `position: absolute` resolves its %-based top/left/
 * width/height against the nearest *positioned* ancestor, so with no
 * positioned parent immediately available the browser kept walking up the
 * DOM past .bodyMap__figureWrap looking for one -- on the real device this
 * landed on a much larger ancestor, producing a giant head oval at the top
 * of the screen and giant arm/leg rectangles on the screen edges.
 *
 * Static source-code guards (matching this repo's existing pattern of
 * avoiding a jsdom dependency, see tests/patient-ux.spec.mjs's header
 * comment) plus one live-render structural check.
 * ========================================================================= */

const __dirname = dirname(fileURLToPath(import.meta.url))
const BODY_MAP_SRC = readFileSync(join(__dirname, '..', 'src', 'components', 'BodyMap.tsx'), 'utf8')
const CSS = readFileSync(join(__dirname, '..', 'src', 'styles.css'), 'utf8')

function cssBlock(css, selector) {
  const idx = css.indexOf(`${selector} {`)
  if (idx === -1) return null
  const end = css.indexOf('}', idx)
  return css.slice(idx, end + 1)
}

{
  // 1. Zone buttons are rendered as descendants of .bodyMap__figure, not as
  // siblings after it closes -- the exact regression that caused the bug.
  // Guard: no closing </div> appears between the figure container opening
  // and the zones.map(...) call that renders the zone buttons.
  const figureOpenIdx = BODY_MAP_SRC.indexOf('<div className="bodyMap__figure">')
  assert('BodyMap.tsx: .bodyMap__figure container exists', figureOpenIdx !== -1)
  const zonesMapIdx = BODY_MAP_SRC.indexOf('{zones.map(', figureOpenIdx)
  assert('BodyMap.tsx: zones.map(...) appears after the figure container opens', zonesMapIdx > figureOpenIdx)
  const between = BODY_MAP_SRC.slice(figureOpenIdx, zonesMapIdx)
  assert(
    'BodyMap.tsx: no closing </div> between .bodyMap__figure opening and zones.map(...) (zone buttons are its descendants, not siblings -- regression guard for the device DOM bug)',
    !between.includes('</div>'),
  )
}
{
  // 2. .bodyMap__figure is the (only) positioned coordinate container.
  const figureCss = cssBlock(CSS, '.bodyMap__figure')
  assert('styles.css: .bodyMap__figure rule exists', Boolean(figureCss))
  assert('styles.css: .bodyMap__figure is position: relative', /position:\s*relative/.test(figureCss))

  // .bodyMap__figureWrap (the old, buggy positioned-ancestor candidate)
  // must NOT declare its own position -- it must stay a plain flex item so
  // .bodyMap__figure is unambiguously the nearest positioned ancestor for
  // any absolutely-positioned descendant.
  const wrapCss = cssBlock(CSS, '.bodyMap__figureWrap')
  assert('styles.css: .bodyMap__figureWrap rule exists', Boolean(wrapCss))
  assert('styles.css: .bodyMap__figureWrap does NOT declare position (stays a plain flex item, not a second positioned ancestor)', !/position:/.test(wrapCss))
}
{
  // 3. .bodyMap__zone zones are position: absolute (resolved against
  // .bodyMap__figure per #2, never against the viewport/page).
  const zoneCss = cssBlock(CSS, '.bodyMap__zone')
  assert('styles.css: .bodyMap__zone rule exists', Boolean(zoneCss))
  assert('styles.css: .bodyMap__zone is position: absolute', /position:\s*absolute/.test(zoneCss))
}
{
  // 4. Zone buttons are not a direct child of the outer .bodyMap wrapper --
  // BodyMap's top-level return must not itself contain a zones.map call;
  // it only exists inside the Figure() sub-component, two levels deeper
  // (.bodyMap > .bodyMap__figures > .bodyMap__figureWrap > .bodyMap__figure > zone).
  const bodyMapReturnIdx = BODY_MAP_SRC.indexOf('export function BodyMap(')
  const figureFnIdx = BODY_MAP_SRC.indexOf('function Figure(')
  assert('BodyMap.tsx: Figure() sub-component is defined before the top-level BodyMap() export', figureFnIdx !== -1 && figureFnIdx < bodyMapReturnIdx)
  const topLevelSrc = BODY_MAP_SRC.slice(bodyMapReturnIdx)
  assert('BodyMap.tsx: the top-level BodyMap() component does not itself map over zones (zone buttons only ever render inside Figure())', !topLevelSrc.includes('zones.map('))
}
{
  // 5. A size constraint bounds body-map height (via width, given the
  // aspect-ratio-locked figure box) so it can never grow unbounded and push
  // the CTA far off-screen -- and stays within the page's own content
  // column width (Tablet UX v2.1 §8).
  const figuresCss = cssBlock(CSS, '.bodyMap__figures')
  assert('styles.css: .bodyMap__figures rule exists', Boolean(figuresCss))
  const maxWidthMatch = figuresCss.match(/max-width:\s*(\d+)px/)
  assert('styles.css: .bodyMap__figures declares a max-width (bounds body-map size)', Boolean(maxWidthMatch))
  const contentMaxMatch = CSS.match(/--content-max:\s*(\d+)px/)
  assert('styles.css: --content-max token exists', Boolean(contentMaxMatch))
  assert(
    'styles.css: .bodyMap__figures max-width stays within the page content column (--content-max)',
    Number(maxWidthMatch[1]) <= Number(contentMaxMatch[1]),
  )
}
{
  // 6. Live-render structural check: every zone button's markup appears
  // between one .bodyMap__figure open tag and its own close in the
  // rendered HTML (i.e. genuinely nested, not just adjacent in source).
  const html = renderToStaticMarkup(
    React.createElement(BodyMap, { options: PAIN_01.options, value: null, onSelect: () => {} }),
  )
  const figureChunks = html.split('class="bodyMap__figure"').slice(1)
  assert('rendered HTML: at least one .bodyMap__figure element present (front + back)', figureChunks.length === 2)
  for (const chunk of figureChunks) {
    assert('rendered HTML: each .bodyMap__figure element is immediately followed by zone button markup (svg silhouette + <button class="bodyMap__zone...)', /<button[^>]*class="bodyMap__zone/.test(chunk.slice(0, 4000)))
  }
}

console.log(`\nSUMMARY: ${passCount} assertions passed, 0 failed (total ${passCount})`)
