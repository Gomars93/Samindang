import assert from 'node:assert/strict'
import fs from 'node:fs'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { ANKLE_FOOT_DOCTOR_FIXTURES } from './.ankle-foot-fixtures-bundle.mjs'
import { AnkleFootSafetyPanel } from './.ankle-foot-doctor-panel-bundle.cjs'

let passed = 0
const test = (name, fn) => { fn(); passed += 1; console.log(`PASS ${name}`) }

const byName = (needle) => {
  const f = ANKLE_FOOT_DOCTOR_FIXTURES.find((x) => x.name.includes(needle))
  assert.ok(f, `missing fixture: ${needle}`)
  return f
}

test('DoctorWorkspace contains ANKLE_FOOT panel wiring exactly once', () => {
  // PR #24: the regional SafetyPanels moved from DoctorView.tsx's own render
  // into src/doctor/workspace/PainWorkspace.tsx (Pain Workspace shell reuses
  // them unchanged) -- same wiring, new location.
  //
  // P0-1 (Core Reduction Phase 6 gate): promoted again, this time from
  // PainWorkspace.tsx up to DoctorWorkspace.tsx (immediately after
  // CommonSafetyBanner) so the panel renders regardless of view_profile --
  // a herbal-derived record with a real regional safety concern must not
  // lose this surface. PainWorkspace.tsx no longer mounts it at all (see
  // the companion assertion below) -- exactly one wiring site, moved, not
  // duplicated.
  //
  // Core Reduction P2 (Phase 7 §1.1, lane1Summary.ts): DoctorWorkspace now
  // calls every region panel as a PLAIN FUNCTION (`AnkleFootSafetyPanel({
  // payload })`), not JSX (`<AnkleFootSafetyPanel .../>`) -- this lets
  // lane1Summary.ts read the exact React element each panel decided to
  // render (its className) to compute the union summary, reusing that
  // decision instead of re-deriving it. The element is then placed
  // directly into the JSX tree below, so it still renders exactly once.
  const workspaceSrc = fs.readFileSync('src/doctor/workspace/DoctorWorkspace.tsx', 'utf8')
  const matches = workspaceSrc.match(/AnkleFootSafetyPanel\(\{ payload \}\)/g) ?? []
  assert.equal(matches.length, 1)

  const painSrc = fs.readFileSync('src/doctor/workspace/PainWorkspace.tsx', 'utf8')
  assert.ok(
    !/AnkleFootSafetyPanel/.test(painSrc),
    'PainWorkspace must not also mount it (would double-render under pain/mixed profiles)',
  )
})

test('clear fixture is built through production payload builder and renders clear panel', () => {
  const f = byName('안전 확인 완료')
  assert.equal(f.payload.routing.primary_module_detail, 'ANKLE_FOOT')
  assert.equal(f.payload.responses.safety_flags.ankle_foot?.ankle_foot_safety_status, 'CLEAR')
  const html = renderToString(React.createElement(AnkleFootSafetyPanel, { payload: f.payload }))
  assert.ok(html.includes('ANKLE/FOOT'))
})

test('Achilles fixture is REVIEW + expedited and remains patient-history only', () => {
  const f = byName('아킬레스 평가 필요')
  const flags = f.payload.responses.safety_flags.ankle_foot
  assert.equal(flags?.ankle_foot_safety_status, 'REVIEW_REQUIRED')
  assert.equal(flags?.achilles_rupture_assessment_required, true)
  assert.equal(flags?.expedited_referral_consider, true)
  const html = renderToString(React.createElement(AnkleFootSafetyPanel, { payload: f.payload }))
  assert.ok(html.includes('아킬레스건 평가 필요'))
  assert.ok(html.includes('Thompson test'))
  assert.ok(!/Thompson (positive|negative)|아킬레스건 파열 확진/.test(html))
})

test('circulation fixture is URGENT and renders the ANKLE_FOOT safety panel', () => {
  const f = byName('순환 응급 확인')
  assert.equal(f.payload.responses.safety_flags.ankle_foot?.ankle_foot_safety_status, 'URGENT_REVIEW')
  const html = renderToString(React.createElement(AnkleFootSafetyPanel, { payload: f.payload }))
  assert.ok(html.includes('ANKLE/FOOT'))
  // StaffCheck is independently asserted from raw responses in integration.spec.mjs;
  // Doctor fixtures validate payload/presentation and must not duplicate navigation state.
})

test('Doctor rendering contract never invents Ottawa/Wells objective conclusions', () => {
  for (const f of ANKLE_FOOT_DOCTOR_FIXTURES) {
    const html = renderToString(React.createElement(AnkleFootSafetyPanel, { payload: f.payload }))
    assert.ok(!/Ottawa positive|Ottawa negative|Wells score\s*[:=]\s*\d|DVT 확진/.test(html))
  }
})

console.log(`\n${passed} ankle-foot doctor integration assertions passed.`)
