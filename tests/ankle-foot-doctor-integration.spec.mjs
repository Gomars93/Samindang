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

// Doctor View 재설계 v0.2 §11.1/§11.2 (Opus B1/B2): DoctorView는 더 이상
// 10개 개별 안전 패널을 각각 렌더하지 않는다 — 통합 안전 리스트
// (<SafetySection>)가 `computeSafetyModuleRows`(safetyModules.ts)로 9개
// 모듈(ANKLE_FOOT 포함)을 한 번에 계산해서 정렬된 행으로 렌더한다.
// `AnkleFootSafetyPanel`은 이 테스트 스위트처럼 모듈을 단독으로 검증하고
// 싶을 때 쓰는 독립 wrapper로 남아 있고(같은 `computeAnkleFootRow`를
// 호출하므로 결과가 통합 리스트와 절대 갈라지지 않는다), DoctorView 본문
// wiring은 아니다. 이 테스트는 "ANKLE_FOOT이 통합 계산 경로에 정확히
// 한 번 등록돼 있는지"로 재작성한다.
test('SafetySection wires ANKLE_FOOT into the unified safety row computation exactly once', () => {
  const doctorViewSrc = fs.readFileSync('src/doctor/DoctorView.tsx', 'utf8')
  assert.ok(
    doctorViewSrc.includes('<SafetySection payload={payload}') && !doctorViewSrc.includes('<AnkleFootSafetyPanel'),
    'DoctorView renders the unified <SafetySection>, not a standalone <AnkleFootSafetyPanel>',
  )
  const safetyModulesSrc = fs.readFileSync('src/doctor/safetyModules.ts', 'utf8')
  assert.ok(safetyModulesSrc.includes("'ankle_foot',"), "ankle_foot is registered in SAFETY_MODULE_KEYS")
  assert.ok(safetyModulesSrc.includes('export function computeAnkleFootRow'), 'computeAnkleFootRow is exported for standalone reuse')
  assert.ok(
    safetyModulesSrc.includes('const ankleFoot = computeAnkleFootRow(payload)') &&
      (safetyModulesSrc.match(/computeAnkleFootRow\(payload\)/g) ?? []).length === 1,
    'computeSafetyModuleRows calls computeAnkleFootRow exactly once',
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
