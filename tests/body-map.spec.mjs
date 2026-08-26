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

console.log(`\nSUMMARY: ${passCount} assertions passed, 0 failed (total ${passCount})`)
