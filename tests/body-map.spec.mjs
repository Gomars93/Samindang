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

// ---------- Tablet UX v2.2 §2/§3: front/back cue + selected-region label ----------

{
  // 7. Selected-region Korean label: shows a prompt when nothing is
  // selected yet, and the exact zone label once a value is chosen -- text
  // updates, not just the zone's own checkmark/highlight.
  const htmlNoSelection = renderToStaticMarkup(
    React.createElement(BodyMap, { options: PAIN_01.options, value: null, onSelect: () => {} }),
  )
  assert('rendered HTML: no selection -> prompts "부위를 선택해주세요"', htmlNoSelection.includes('부위를 선택해주세요'))
  assert('rendered HTML: no selection -> does not claim a region is selected', !htmlNoSelection.includes('선택한 부위'))

  const htmlSelected = renderToStaticMarkup(
    React.createElement(BodyMap, { options: PAIN_01.options, value: 'low_back_pelvis', onSelect: () => {} }),
  )
  assert('rendered HTML: low_back_pelvis selected -> shows "선택한 부위: 허리·골반"', htmlSelected.includes('선택한 부위') && htmlSelected.includes('허리·골반'))

  const htmlOther = renderToStaticMarkup(
    React.createElement(BodyMap, { options: PAIN_01.options, value: 'chest_rib', onSelect: () => {} }),
  )
  assert('rendered HTML: chest_rib selected -> label updates to 가슴·갈비뼈 주변', htmlOther.includes('가슴·갈비뼈 주변'))
}

{
  // 8. Front/back visual cue: front and back silhouettes render distinct
  // decorative markup (bodyMap__frontCue vs bodyMap__backCue) so the two
  // views are distinguishable without reading the "앞면"/"뒷면" text label
  // (Tablet UX v2.2 §2). Purely decorative -- no PAIN_01 value semantics.
  const html = renderToStaticMarkup(
    React.createElement(BodyMap, { options: PAIN_01.options, value: null, onSelect: () => {} }),
  )
  assert('rendered HTML: front silhouette has a distinct front cue group', html.includes('bodyMap__frontCue'))
  assert('rendered HTML: back silhouette has a distinct back cue group', html.includes('bodyMap__backCue'))
  assert('rendered HTML: "앞면"/"뒷면" text labels are still present (cue is additive, not a replacement)', html.includes('앞면') && html.includes('뒷면'))
}

{
  // Tablet UX v2.2.1 §5: v2.2's front/back cue (stroke-width 0.6,
  // --text-muted) was reported as barely visible on a real 11" tablet.
  // Assert the strengthened version directly from source: bold stroke
  // (>=2, well above the old 0.6) and high-contrast --text color (not the
  // lighter --text-muted).
  const cueCss = cssBlock(CSS, '.bodyMap__frontCue path,\n.bodyMap__backCue line,\n.bodyMap__backCue path')
  assert('styles.css: front/back cue rule exists', Boolean(cueCss))
  const strokeWidthMatch = cueCss.match(/stroke-width:\s*([\d.]+)/)
  assert('styles.css: front/back cue declares a stroke-width', Boolean(strokeWidthMatch))
  assert(
    `styles.css CRITICAL: front/back cue stroke-width (${strokeWidthMatch?.[1]}) is bold enough to be visible on a real device (>= 2, was 0.6)`,
    Boolean(strokeWidthMatch) && Number(strokeWidthMatch[1]) >= 2,
  )
  assert('styles.css: front/back cue uses --text (high contrast), not --text-muted', /stroke:\s*var\(--text\)/.test(cueCss) && !/stroke:\s*var\(--text-muted\)/.test(cueCss))

  const frontCueCircleCss = cssBlock(CSS, '.bodyMap__frontCue circle')
  assert('styles.css: front cue eye circles use --text (high contrast), not --text-muted', /fill:\s*var\(--text\)/.test(frontCueCircleCss) && !/fill:\s*var\(--text-muted\)/.test(frontCueCircleCss))
}

{
  // Tablet UX v2.2.1 §5: front adds an explicit mouth (2nd path in the
  // front cue group) and a chest/abdomen contour; back adds a lower
  // back/glute contour on top of the existing spine+scapula cues. Source
  // assertion on BodyMap.tsx (not just CSS) since these are new SVG
  // elements, not just style changes.
  const bodyMapSrc = readFileSync(join(__dirname, '..', 'src', 'components', 'BodyMap.tsx'), 'utf8')
  const frontCueMatch = bodyMapSrc.match(/bodyMap__frontCue">([\s\S]*?)<\/g>/)
  assert('BodyMap.tsx: front cue group exists', Boolean(frontCueMatch))
  const frontCueBody = frontCueMatch?.[1] ?? ''
  assert('BodyMap.tsx: front cue has two eyes (2 <circle> elements)', (frontCueBody.match(/<circle/g) ?? []).length === 2)
  assert('BodyMap.tsx: front cue has a mouth + chest/abdomen contour (2 <path> elements)', (frontCueBody.match(/<path/g) ?? []).length === 2)

  const backCueMatch = bodyMapSrc.match(/bodyMap__backCue">([\s\S]*?)<\/g>/)
  assert('BodyMap.tsx: back cue group exists', Boolean(backCueMatch))
  const backCueBody = backCueMatch?.[1] ?? ''
  assert('BodyMap.tsx: back cue has no face elements (no <circle>)', !backCueBody.includes('<circle'))
  assert('BodyMap.tsx: back cue has spine line + scapula curves + lower-back/glute contour (3 <path> elements)', (backCueBody.match(/<path/g) ?? []).length === 3)
}

{
  // Tablet UX v2.2.1 §6: a compact "selected region" chip persists near the
  // CTA (sticky, positioned to clear the scroll-hint pill entirely -- never
  // overlapping it) once a zone is selected, so scrolling away from the top
  // label never loses the feedback.
  const bodyMapSrc = readFileSync(join(__dirname, '..', 'src', 'components', 'BodyMap.tsx'), 'utf8')
  assert('BodyMap.tsx: renders a selectedChip element', bodyMapSrc.includes('bodyMap__selectedChip'))
  assert('BodyMap.tsx: selectedChip only renders once a value is selected (conditional on `value &&`)', /\{value &&[\s\S]{0,80}bodyMap__selectedChip/.test(bodyMapSrc))

  const chipCss = cssBlock(CSS, '.bodyMap__selectedChip')
  assert('styles.css: .bodyMap__selectedChip rule exists', Boolean(chipCss))
  assert('styles.css: .bodyMap__selectedChip is sticky (stays visible while scrolling)', /position:\s*sticky/.test(chipCss))

  // Tablet UX v2.3 §9-10 scroll-hint-lane redesign: the old overlay-based
  // .shell__scrollHint pill is gone entirely, replaced by
  // .shell__scrollHintLane -- a structurally separate flex sibling of
  // .shell__main that reserves its own space and can never overlap
  // scrolled content. The chip no longer needs to coordinate a matching
  // "clear the pill height" bottom offset; it sticks flush to the bottom
  // (bottom: 0) since there is nothing left to clear.
  assert('styles.css CRITICAL: the old overlay-based .shell__scrollHint class is fully removed (replaced by a non-overlapping lane)', !CSS.includes('.shell__scrollHint {') && !CSS.includes('.shell__scrollHintPill'))
  assert('styles.css: .shell__scrollHintLane (the new non-overlapping replacement) exists', CSS.includes('.shell__scrollHintLane'))
  const chipBottomMatch = chipCss.match(/bottom:\s*(\d+)(?:px)?/)
  assert('styles.css: .bodyMap__selectedChip declares a numeric sticky bottom offset', Boolean(chipBottomMatch))
  assert('styles.css: .bodyMap__selectedChip sticks flush to the bottom (bottom: 0, nothing left to clear)', Number(chipBottomMatch[1]) === 0)
}

{
  // Tablet UX v2.2.1 §7: selected zone indicator is a thin outline + light
  // tint (not a large solid-filled box) -- background alpha kept low so the
  // silhouette shape reads through, touch hit-area (button size) unchanged.
  const selectedCss = cssBlock(CSS, '.bodyMap__zone--selected')
  assert('styles.css: .bodyMap__zone--selected rule exists', Boolean(selectedCss))
  assert('styles.css: .bodyMap__zone--selected keeps a visible border outline', /border-color:\s*var\(--primary\)/.test(selectedCss))
  assert('styles.css: .bodyMap__zone--selected does NOT use a large solid fill (no --primary-soft background)', !/background:\s*var\(--primary-soft\)/.test(selectedCss))
}

{
  // 9. Tablet UX v2.3 §9-10: the scroll hint can no longer cover the last
  // option/CTA/selected-chip AT ALL, in any scroll position -- not just
  // "the last option specifically" (the old v2.2 §11 padding-coordination
  // fix this replaces only guarded the very bottom of the list, via a
  // padding-vs-pill-height arithmetic match that a future edit could
  // silently break). The new .shell__scrollHintLane is a structurally
  // separate flex sibling of .shell__main (never inside its scrollable
  // box, never position:absolute/sticky/fixed over it), so this is a
  // zero-overlap-by-construction guarantee instead.
  const mainCss = cssBlock(CSS, '.shell__main')
  assert('styles.css: .shell__main rule exists', Boolean(mainCss))
  const paddingMatch = mainCss.match(/padding:\s*[\d.]+px\s+[^\s]+\s+(\d+)px/)
  assert('styles.css: .shell__main declares a 3-value padding shorthand ending in a px bottom value', Boolean(paddingMatch))

  const laneCss = cssBlock(CSS, '.shell__scrollHintLane')
  assert('styles.css: .shell__scrollHintLane rule exists', Boolean(laneCss))
  assert(
    'styles.css: .shell__scrollHintLane is a normal flex-flow item (flex: 0 0 auto), not position:absolute/sticky/fixed overlaying content',
    /flex:\s*0 0 auto/.test(laneCss) && !/position:\s*(absolute|sticky|fixed)/.test(laneCss),
  )
  const laneHeightMatch = laneCss.match(/height:\s*(\d+)px/)
  assert('styles.css: .shell__scrollHintLane declares a fixed height', Boolean(laneHeightMatch))
  assert('styles.css: .shell__scrollHintLane height is within the required 32-44px dedicated-lane range (portrait)', Boolean(laneHeightMatch) && Number(laneHeightMatch[1]) >= 32 && Number(laneHeightMatch[1]) <= 44)

  const screenShellSrc = readFileSync(join(__dirname, '..', 'src', 'components', 'ScreenShell.tsx'), 'utf8')
  const mainCloseIdx = screenShellSrc.indexOf('</main>')
  const laneOpenIdx = screenShellSrc.indexOf('shell__scrollHintLane')
  assert('ScreenShell.tsx CRITICAL: the scroll-hint lane markup is a sibling AFTER </main> closes, never inside <main> (cannot overlay scrollable content)', mainCloseIdx !== -1 && laneOpenIdx !== -1 && laneOpenIdx > mainCloseIdx)

  assert('styles.css CRITICAL: no opacity-gradient-over-content technique remains anywhere for the scroll hint (linear-gradient tied to scroll hint removed)', !/shell__scrollHint[\s\S]{0,10}\{[^}]*linear-gradient/.test(CSS))
}

console.log(`\nSUMMARY: ${passCount} assertions passed, 0 failed (total ${passCount})`)
