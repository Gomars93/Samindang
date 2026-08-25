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

test('DoctorView contains ANKLE_FOOT panel wiring exactly once', () => {
  const src = fs.readFileSync('src/doctor/DoctorView.tsx', 'utf8')
  const matches = src.match(/<AnkleFootSafetyPanel payload=\{payload\} \/>/g) ?? []
  assert.equal(matches.length, 1)
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
