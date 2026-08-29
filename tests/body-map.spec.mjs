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

  // PR #23 Phase 3 visual-QA fix regression test: 'knee' has TWO zones on
  // the SAME view (left knee, right knee, both front -- see ZONES in
  // BodyMap.tsx). A real-device-style headless-Chromium screenshot taken
  // during this task caught both zones showing a ✓ checkmark badge
  // simultaneously from a single tap on one of them -- the old
  // `strongView: 'front'|'back'` state only disambiguated which VIEW was
  // strong, not which specific zone within that view. This exact bug is
  // reproducible in plain SSR with no click needed: BodyMap's initial
  // strongZoneKey state is computed by defaultStrongZoneKey(value) on
  // first render, so the very first (uninteracted) render of value='knee'
  // must already show exactly one checkmark, not two.
  const kneeCheckmarkCount = (html.match(/bodyMap__zoneMark/g) || []).length
  assert(
    'CRITICAL (real-device QA fix): multi-same-view-zone value (knee, 2 zones on the front view alone) shows exactly ONE checkmark badge on first render, never one per zone',
    kneeCheckmarkCount === 1,
  )
}
{
  // Same fix, for the other multi-same-view-zone values (arm_hand,
  // leg_foot also have 2 zones on the SAME view each -- see ZONES).
  for (const value of ['arm_hand', 'leg_foot']) {
    const html = renderToStaticMarkup(
      React.createElement(BodyMap, { options: PAIN_01.options, value, onSelect: () => {} }),
    )
    const checkmarkCount = (html.match(/bodyMap__zoneMark/g) || []).length
    assert(`CRITICAL (real-device QA fix): "${value}" (2 zones on the same view) shows exactly ONE checkmark badge on first render`, checkmarkCount === 1)
  }
}

{
  // Tablet UX v2.3 §11: values that exist in BOTH front and back (e.g.
  // 'neck_shoulder') previously showed a strong checkmark (✓ badge) on both
  // views simultaneously once selected -- confusing, reads like two
  // different regions were chosen. Only one view (the "strong" one) should
  // carry the ✓ badge at a time; the other matching zone keeps its
  // border/tint highlight (aria-pressed=true, .bodyMap__zone--selected) but
  // not the badge. On a fresh render (no click ever simulated -- this is
  // static SSR, there's no event loop to click through) the component
  // defaults to the front view being strong, since ZONES lists front
  // entries first for every ambiguous value.
  const html = renderToStaticMarkup(
    React.createElement(BodyMap, { options: PAIN_01.options, value: 'neck_shoulder', onSelect: () => {} }),
  )
  const pressedCount = (html.match(/aria-pressed="true"/g) || []).length
  assert('neck_shoulder (exists in both front and back): both zones are aria-pressed (still selected)', pressedCount === 2)
  const checkmarkCount = (html.match(/bodyMap__zoneMark/g) || []).length
  assert('neck_shoulder CRITICAL: exactly one checkmark badge renders, never two, even though the value exists on both views', checkmarkCount === 1)
}

{
  // Sanity: a value that exists on only ONE view (front-only, e.g.
  // 'abdomen') must still show its checkmark -- the ambiguous-value
  // tie-break must never suppress the only zone a single-view value has.
  const html = renderToStaticMarkup(
    React.createElement(BodyMap, { options: PAIN_01.options, value: 'abdomen', onSelect: () => {} }),
  )
  const checkmarkCount = (html.match(/bodyMap__zoneMark/g) || []).length
  assert('single-view-only value (abdomen, front-only) still shows exactly one checkmark', checkmarkCount === 1)
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
    // PR #23 Phase 1: the artwork layer now renders a PNG <img> before the
    // zone buttons (previously an inline SVG silhouette, much shorter).
    // This test suite bundles BodyMap.tsx with the PNG inlined as a
    // base64 data: URI (esbuild --loader:.png=dataurl, Node-only test
    // concern -- the real production Vite build serves it as a short
    // hashed URL instead, so this larger window is a test-harness
    // accommodation, not a real-world size regression). Widened
    // accordingly so the assertion still finds the zone buttons.
    assert('rendered HTML: each .bodyMap__figure element is immediately followed by artwork + zone button markup (<button class="bodyMap__zone...)', /<button[^>]*class="bodyMap__zone/.test(chunk.slice(0, 60000)))
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
  assert('rendered HTML: no selection -> no checkmark badge anywhere on the map (neutral state has no highlight)', !htmlNoSelection.includes('bodyMap__zoneMark'))
  assert('rendered HTML: no selection -> no zone is aria-pressed=true', !htmlNoSelection.includes('aria-pressed="true"'))

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
  // 8. Front/back distinction: the "앞면"/"뒷면" text label always renders
  // regardless of which artwork layer is active (PNG or SVG fallback) --
  // checked here via live SSR since .bodyMap__viewLabel is unconditional.
  // The decorative frontCue/backCue *markup* only exists inside the SVG
  // fallback (Silhouette), which is not part of a default/uninteracted
  // render now that the PNG artwork is primary (PR #23 Phase 1) -- that
  // structure is verified at the source level further down this file
  // instead (Silhouette() cue-group assertions), since SSR alone cannot
  // force the client-side integrity check that activates the fallback.
  const html = renderToStaticMarkup(
    React.createElement(BodyMap, { options: PAIN_01.options, value: null, onSelect: () => {} }),
  )
  assert('rendered HTML: "앞면"/"뒷면" text labels are present regardless of which artwork layer is active', html.includes('앞면') && html.includes('뒷면'))
}

{
  // Tablet UX v2.2.1 §5: v2.2's front/back cue (stroke-width 0.6,
  // --text-muted) was reported as barely visible on a real 11" tablet.
  // Assert the strengthened version directly from source: bold stroke
  // (>=2, well above the old 0.6) and high-contrast --text color (not the
  // lighter --text-muted).
  // PR #23 real-device QA follow-up §2: the front cue now also includes
  // thin <line> joint-divider ticks (elbow/knee), so .bodyMap__frontCue
  // line must be styled too (previously only <path> was, which silently
  // left front-cue <line> ticks unstyled/invisible -- caught via local
  // screenshot verification, see BodyMap.tsx Silhouette() comment).
  const cueCss = cssBlock(CSS, '.bodyMap__frontCue path,\n.bodyMap__frontCue line,\n.bodyMap__backCue line,\n.bodyMap__backCue path')
  assert('styles.css: front/back cue rule exists', Boolean(cueCss))
  const strokeWidthMatch = cueCss.match(/stroke-width:\s*([\d.]+)/)
  assert('styles.css: front/back cue declares a stroke-width', Boolean(strokeWidthMatch))
  assert(
    `styles.css CRITICAL: front/back cue stroke-width (${strokeWidthMatch?.[1]}) is bold enough to be visible on a real device (>= 2, was 0.6)`,
    Boolean(strokeWidthMatch) && Number(strokeWidthMatch[1]) >= 2,
  )
  assert('styles.css: front/back cue uses --text (high contrast), not --text-muted', /stroke:\s*var\(--text\)/.test(cueCss) && !/stroke:\s*var\(--text-muted\)/.test(cueCss))

}

{
  // PR #23 real-device QA follow-up §2: the front cue is no longer a face
  // (real-device QA described the old two-dot-eyes + smile as a
  // "block/toy figure", not a medical pictogram). Assert directly from
  // source that NEITHER view has any <circle> in its cue group (no face
  // anywhere), and that both views carry the same 4 thin joint-divider
  // <line> ticks (elbow x2 + knee x2) in addition to their own
  // distinguishing <path> cue(s) -- front: 1 collar path; back: 2 scapula
  // + 1 waistband path (3 total, spine itself is a <line>, not a <path>).
  const bodyMapSrc = readFileSync(join(__dirname, '..', 'src', 'components', 'BodyMap.tsx'), 'utf8')
  const frontCueMatch = bodyMapSrc.match(/bodyMap__frontCue">([\s\S]*?)<\/g>/)
  assert('BodyMap.tsx: front cue group exists', Boolean(frontCueMatch))
  const frontCueBody = frontCueMatch?.[1] ?? ''
  assert('BodyMap.tsx CRITICAL: front cue has no face elements (no <circle> -- real-device QA follow-up, no face on either view)', !frontCueBody.includes('<circle'))
  assert('BodyMap.tsx: front cue has exactly one collar <path> (neckline only, no mouth)', (frontCueBody.match(/<path/g) ?? []).length === 1)
  assert('BodyMap.tsx: front cue has 4 thin joint-divider <line> ticks (elbow x2 + knee x2)', (frontCueBody.match(/<line/g) ?? []).length === 4)

  const backCueMatch = bodyMapSrc.match(/bodyMap__backCue">([\s\S]*?)<\/g>/)
  assert('BodyMap.tsx: back cue group exists', Boolean(backCueMatch))
  const backCueBody = backCueMatch?.[1] ?? ''
  assert('BodyMap.tsx: back cue has no face elements (no <circle>)', !backCueBody.includes('<circle'))
  assert('BodyMap.tsx: back cue has spine + scapula curves + waistband contour (3 <path> elements: 2 scapula + 1 waistband)', (backCueBody.match(/<path/g) ?? []).length === 3)
  assert('BodyMap.tsx: back cue has 5 <line> elements (spine + 4 joint-divider ticks)', (backCueBody.match(/<line/g) ?? []).length === 5)
  assert(
    'BodyMap.tsx: back cue waistband is a gentle arc, not a downward hip curve that could read as a gluteal cleft (real-device QA follow-up §2)',
    !backCueBody.includes('Q30 62'),
  )
}

{
  // Tablet UX v2.2.1 §6 / v2.3 §11-12: a compact "selected region" chip
  // persists near the CTA (sticky) once a zone is selected, so scrolling
  // away from the top label never loses the feedback -- portrait only.
  // v2.3 removed the old overlay-based scroll-hint entirely (replaced with
  // a dedicated non-overlapping lane, see ScreenShell.tsx/styles.css), so
  // this chip no longer needs to coordinate a bottom offset against a pill
  // height -- `bottom: 0` is correct by construction now (nothing else
  // renders inside `.shell__main` for it to collide with). In landscape the
  // chip is hidden entirely (display:none) because ScreenShell's right rail
  // (fed by App.tsx's railSelection prop) shows the same information
  // instead, always visible and not scroll-dependent.
  const bodyMapSrc = readFileSync(join(__dirname, '..', 'src', 'components', 'BodyMap.tsx'), 'utf8')
  assert('BodyMap.tsx: renders a selectedChip element', bodyMapSrc.includes('bodyMap__selectedChip'))
  assert('BodyMap.tsx: selectedChip only renders once a value is selected (conditional on `value &&`)', /\{value &&[\s\S]{0,80}bodyMap__selectedChip/.test(bodyMapSrc))
  assert('BodyMap.tsx CRITICAL: selectedChip uses aria-live="polite", never aria-hidden (must reach assistive tech)', /bodyMap__selectedChip[\s\S]{0,40}aria-live="polite"/.test(bodyMapSrc))
  assert('BodyMap.tsx: selectedChip export exposes getBodyMapZoneLabel for App.tsx to reuse in the rail', bodyMapSrc.includes('export function getBodyMapZoneLabel'))

  const chipCss = cssBlock(CSS, '.bodyMap__selectedChip')
  assert('styles.css: .bodyMap__selectedChip rule exists', Boolean(chipCss))
  assert('styles.css: .bodyMap__selectedChip is sticky (stays visible while scrolling)', /position:\s*sticky/.test(chipCss))

  // The old opaque overlay class no longer exists anywhere in the file --
  // its replacement (.shell__scrollHintLane) is a structurally separate
  // flex sibling of .shell__main, so it can never overlap scrolled content.
  assert('styles.css CRITICAL: the old overlay-based .shell__scrollHint class is fully removed (replaced by a non-overlapping lane)', !CSS.includes('.shell__scrollHint {') && !CSS.includes('.shell__scrollHintPill'))
  assert('styles.css: .shell__scrollHintLane (the new non-overlapping replacement) exists', CSS.includes('.shell__scrollHintLane'))

  const landscapeChipHideMatch = CSS.match(/@media \(orientation: landscape\) and \(min-width: 760px\) \{\s*\.bodyMap__selectedChip,\s*\.bodyMap__selectedLabel \{\s*display:\s*none;/)
  assert('styles.css CRITICAL: .bodyMap__selectedChip is hidden in wide landscape (right rail shows the same info instead, not a duplicate)', Boolean(landscapeChipHideMatch))
  // PR #23 real-device QA follow-up §3: real-device QA found the center
  // .bodyMap__selectedLabel ALSO still visible in landscape at the same
  // time as the rail's .railSelection -- the chip-only hide above missed
  // this second duplicate. Both must be hidden together in the same rule.
  assert(
    'styles.css CRITICAL: .bodyMap__selectedLabel (center label) is ALSO hidden in wide landscape, not just the chip (fixes the duplicate label real-device QA found)',
    Boolean(landscapeChipHideMatch),
  )
}

{
  // Tablet UX v2.2.1 §7, refined again by the PR #23 real-device QA
  // follow-up §2 ("동일 enum이 front/back에 모두 존재하면 반대 view에는
  // soft tint 정도만 허용" / "두 view에 같은 강도의 check를 동시에
  // 표시하지 말 것"): every selected zone gets a soft, borderless tint
  // (this rule) -- background alpha kept low so the silhouette shape
  // reads through, touch hit-area (button size) unchanged. Only the
  // actually-tapped view additionally gets .bodyMap__zone--strong (next
  // block) for a visibly stronger border + tint + the ✓ badge, so the two
  // views are never emphasized identically at once.
  const selectedCss = cssBlock(CSS, '.bodyMap__zone--selected')
  assert('styles.css: .bodyMap__zone--selected rule exists', Boolean(selectedCss))
  assert('styles.css: .bodyMap__zone--selected has no visible border (soft-tint-only baseline)', /border-color:\s*transparent/.test(selectedCss))
  assert('styles.css: .bodyMap__zone--selected does NOT use a large solid fill (no --primary-soft background)', !/background:\s*var\(--primary-soft\)/.test(selectedCss))

  const strongCss = cssBlock(CSS, '.bodyMap__zone--strong')
  assert('styles.css: .bodyMap__zone--strong rule exists (the tapped-view-only stronger highlight)', Boolean(strongCss))
  assert('styles.css CRITICAL: .bodyMap__zone--strong has a visible --primary border, unlike the soft baseline', /border-color:\s*var\(--primary\)/.test(strongCss))
}

{
  // 9. Tablet UX v2.3 §9-10: the scroll hint can no longer cover the last
  // option/CTA/selected-chip AT ALL, in any scroll position -- not just
  // "the last option specifically" (the old v2.2 §11 padding-coordination
  // fix this replaces only guarded the very bottom of the list, not content
  // scrolled past mid-way while an opacity-gradient overlay sat on top of
  // it). The new .shell__scrollHintLane is a structurally separate flex
  // sibling of .shell__main (never inside its scrollable box), so this is
  // a zero-overlap-by-construction guarantee rather than a padding-vs-height
  // arithmetic coordination that a future edit could silently break.
  const mainCss = cssBlock(CSS, '.shell__main')
  assert('styles.css: .shell__main rule exists', Boolean(mainCss))
  const paddingMatch = mainCss.match(/padding:\s*[\d.]+px\s+[^\s]+\s+(\d+)px/)
  assert('styles.css: .shell__main declares a 3-value padding shorthand ending in a px bottom value', Boolean(paddingMatch))

  const laneCss = cssBlock(CSS, '.shell__scrollHintLane')
  assert('styles.css: .shell__scrollHintLane rule exists', Boolean(laneCss))
  assert('styles.css: .shell__scrollHintLane is a normal flex-flow item (flex: 0 0 auto), not position:absolute/sticky/fixed overlaying content', /flex:\s*0 0 auto/.test(laneCss) && !/position:\s*(absolute|sticky|fixed)/.test(laneCss))
  const laneHeightMatch = laneCss.match(/height:\s*(\d+)px/)
  assert('styles.css: .shell__scrollHintLane declares a fixed height', Boolean(laneHeightMatch))
  assert('styles.css: .shell__scrollHintLane height is within the required 32-44px dedicated-lane range (portrait)', Boolean(laneHeightMatch) && Number(laneHeightMatch[1]) >= 32 && Number(laneHeightMatch[1]) <= 44)

  const screenShellSrc = readFileSync(join(__dirname, '..', 'src', 'components', 'ScreenShell.tsx'), 'utf8')
  const mainCloseIdx = screenShellSrc.indexOf('</main>')
  const laneOpenIdx = screenShellSrc.indexOf('shell__scrollHintLane')
  assert('ScreenShell.tsx CRITICAL: the scroll-hint lane markup is a sibling AFTER </main> closes, never inside <main> (cannot overlay scrollable content)', mainCloseIdx !== -1 && laneOpenIdx !== -1 && laneOpenIdx > mainCloseIdx)

  assert('styles.css CRITICAL: no opacity-gradient-over-content technique remains anywhere for the scroll hint (linear-gradient tied to scroll hint removed)', !/shell__scrollHint[\s\S]{0,10}\{[^}]*linear-gradient/.test(CSS))
}

{
  // Tablet UX v2.3 §7: the silhouette's torso/arms/legs must be smooth
  // <path> curves, not the old rect/capsule shapes (rounded rects still
  // read as boxy no matter how large border-radius gets). Head stays a
  // <circle> (already smooth, never the complaint). The zone buttons'
  // %-coordinate system (ZONES table) is a separate, unrelated concern --
  // this only checks the purely decorative silhouette drawing.
  const bodyMapSrc = readFileSync(join(__dirname, '..', 'src', 'components', 'BodyMap.tsx'), 'utf8')
  const silhouetteMatch = bodyMapSrc.match(/function Silhouette[\s\S]*?\n}\n/)
  assert('BodyMap.tsx: Silhouette() function exists', Boolean(silhouetteMatch))
  const silhouetteBody = silhouetteMatch[0]
  assert('BodyMap.tsx: Silhouette() keeps the head as a <circle> (already smooth)', /<circle cx="30" cy="7" r="6\.5"/.test(silhouetteBody))
  assert('BodyMap.tsx CRITICAL: Silhouette() no longer renders any <rect> (torso/arms/legs are no longer box-shaped)', !/<rect/.test(silhouetteBody))
  assert(
    'BodyMap.tsx (real-device QA follow-up §2): Silhouette() connects the head to the torso with an explicit neck piece (bodyMap__silhouetteNeck)',
    /bodyMap__silhouetteNeck/.test(silhouetteBody),
  )
  assert('BodyMap.tsx: Silhouette() draws the torso as a smooth <path> (bodyMap__silhouetteTorso)', /bodyMap__silhouetteTorso/.test(silhouetteBody))
  assert('BodyMap.tsx: Silhouette() draws both arms as smooth <path> curves (bodyMap__silhouetteArm, 2 occurrences)', (silhouetteBody.match(/bodyMap__silhouetteArm/g) || []).length === 2)
  assert('BodyMap.tsx: Silhouette() draws both legs as smooth <path> curves (bodyMap__silhouetteLeg, 2 occurrences)', (silhouetteBody.match(/bodyMap__silhouetteLeg/g) || []).length === 2)
  // Every new torso/arm/leg path must use cubic-bezier curve commands (C),
  // not just straight lines -- otherwise it would just be a
  // differently-drawn rectangle/polygon, not an actually smooth silhouette.
  // Scoped to only the 5 silhouette shape paths (className
  // bodyMap__silhouetteTorso/Arm/Leg) -- deliberately excludes the front/
  // back decorative cue <path> elements (which legitimately use Q curves,
  // not C, and are a separate concern already covered by earlier tests).
  const shapePathMatches = [...silhouetteBody.matchAll(/className="bodyMap__silhouette(?:Torso|Arm|Leg)"\s*\n?\s*d="([^"]+)"/g)].map((m) => m[1])
  assert('BodyMap.tsx: exactly 5 silhouette shape paths defined (torso + 2 arms + 2 legs)', shapePathMatches.length === 5)
  assert('BodyMap.tsx CRITICAL: every silhouette shape path uses cubic-bezier curves (C), not straight-line-only polygons', shapePathMatches.every((d) => /C/.test(d)))

  // The silhouette shapes must still inherit their fill from the shared
  // .bodyMap__silhouette rule (SVG fill is inherited by path/circle
  // children automatically) -- no per-shape fill override was introduced
  // that would need new CSS.
  const silhouetteCss = cssBlock(CSS, '.bodyMap__silhouette')
  assert('styles.css: .bodyMap__silhouette still declares a fill (inherited by the new path shapes)', /fill:/.test(silhouetteCss))
}

{
  // PR #23 Phase 1-3: PNG artwork layer + the strongZoneKey highlight fix,
  // checked at the source level (the click-driven runtime path itself was
  // verified via local headless-Chromium screenshots, not reproducible in
  // this plain-SSR test file -- see tests/bodymap-assets.spec.mjs's header
  // comment and this task's final report for how that was done).
  const bodyMapSrc = readFileSync(join(__dirname, '..', 'src', 'components', 'BodyMap.tsx'), 'utf8')

  assert('BodyMap.tsx: Artwork() component exists (PNG-primary, SVG-fallback artwork layer)', /function Artwork\(/.test(bodyMapSrc))
  assert('BodyMap.tsx: zoneKey() helper exists (unique per-zone identifier, not just per-view)', /function zoneKey\(/.test(bodyMapSrc))
  assert('BodyMap.tsx: defaultStrongZoneKey() helper exists (deterministic default before any tap)', /function defaultStrongZoneKey\(/.test(bodyMapSrc))
  assert(
    'BodyMap.tsx CRITICAL: isStrong compares the exact zone key, not just the view -- the real-device QA bug (both knees badge-checked from one tap) was caused by comparing view alone',
    /const isStrong = isSelected && key === strongZoneKey/.test(bodyMapSrc),
  )
  assert('BodyMap.tsx: strongZoneKey state re-derives when value changes externally (list-fallback -> map switch, useEffect)', /useEffect\(\(\) => \{[\s\S]*?setStrongZoneKey/.test(bodyMapSrc))

  // Accessibility (Phase 2E): the decorative PNG/SVG artwork must never
  // duplicate screen-reader announcements, and every zone button must keep
  // real semantic button/aria attributes (unchanged by the PNG swap, but
  // asserted directly since the artwork layer is now more complex).
  assert('BodyMap.tsx: PNG artwork <img> has alt="" (decorative, no redundant screen-reader text)', /alt=""/.test(bodyMapSrc))
  assert('BodyMap.tsx: every zone is a real semantic <button type="button"> (native keyboard operability, not a styled <div>)', /<button\s*\n\s*key=\{key\}\s*\n\s*type="button"/.test(bodyMapSrc))
  assert('BodyMap.tsx: zone buttons expose aria-pressed (selection state is accessible, not color-only)', /aria-pressed=\{isSelected\}/.test(bodyMapSrc))
  assert('BodyMap.tsx: zone buttons expose a real Korean aria-label per region+view (screen readers get real region names)', /aria-label=\{`\$\{ZONE_LABEL\[z\.value\]\}/.test(bodyMapSrc))
}

console.log(`\nSUMMARY: ${passCount} assertions passed, 0 failed (total ${passCount})`)
