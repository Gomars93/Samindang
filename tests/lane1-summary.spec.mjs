// Core Reduction P2 — Phase 7 UI spec §1.1 (레인1 요약 상태 union 조건식)
// and §1.1-#17/delta C-2 (좌측 요약 절단 규칙 URGENT 우선순위).
//
// Tests here exercise `computeLane1Summary` as a PURE function against
// hand-built fake region elements (plain `React.createElement('div', {
// className: '...' })`, matching the exact className shape every real
// SafetyPanel produces -- see lane1Summary.ts's header comment for why
// this reuse-the-rendered-decision approach is the fail-open-safe one).
// This isolates the union MATH; the companion "fail-open regression
// guard" test (§1.1-#5) that proves the REAL wiring in DoctorWorkspace.tsx
// never gates these panels on `activeProfile` lives in
// tests/doctor-workspace.spec.mjs instead, alongside the pre-existing
// P0-1 fail-open tests it extends.

import assert from 'node:assert/strict'
import React from 'react'
import { computeLane1Summary, formatCalcUnavailableSuffix, relatedRegionLabels, truncateRegionLabels } from './.lane1-summary-bundle.mjs'
import { DOCTOR_FIXTURES } from './.doctor-fixtures-bundle.mjs'

let passed = 0
const test = (name, fn) => {
  fn()
  passed += 1
  console.log(`PASS ${name}`)
}

const BASE_PAYLOAD = DOCTOR_FIXTURES.find((f) => f.name === '수면 주호소 + 동반 소화/통증').payload

function payloadWithBanner(danger) {
  const p = structuredClone(BASE_PAYLOAD)
  p.flags = { ...p.flags, requires_staff_check: danger }
  return p
}

function region(key, label, status) {
  // `status` is one of the real classNames every SafetyPanel emits, or
  // `null` for "not applicable" (the panel rendered nothing).
  if (status === null) return { key, label, element: null }
  return { key, label, element: React.createElement('div', { className: `doctor__lbpSafety doctor__lbpSafety--${status}` }) }
}

// ---------- #1 ----------
test('lane1 summary shows URGENT when common danger banner fires, independent of per-region panel status', () => {
  const payload = payloadWithBanner(true)
  const regions = [region('lbp', '허리', 'clear'), region('neck', '목', 'clear'), region('shoulder', '어깨', 'clear')]
  const summary = computeLane1Summary(payload, regions)
  assert.equal(summary.status, 'URGENT')
  assert.equal(summary.commonBannerDanger, true)
})

// ---------- #2 ----------
test('lane1 summary is not CLEAR when any single region panel reports calc-unavailable, even if common banner and all other regions are CLEAR', () => {
  const payload = payloadWithBanner(false)
  const regions = [region('lbp', '허리', 'unavailable'), region('neck', '목', 'clear'), region('shoulder', '어깨', 'clear')]
  const summary = computeLane1Summary(payload, regions)
  assert.notEqual(summary.status, 'CLEAR')
  assert.equal(summary.status, '계산불가')
})

// ---------- #3 ----------
test('lane1 summary appends 계산불가 — [부위명] suffix to the status chip when exactly one region is unreadable', () => {
  const payload = payloadWithBanner(false)
  const regions = [region('neck', '목', 'unavailable'), region('lbp', '허리', 'clear')]
  const summary = computeLane1Summary(payload, regions)
  assert.equal(summary.status, '계산불가')
  const suffix = formatCalcUnavailableSuffix(summary.calcUnavailableLabels)
  assert.equal(suffix, '계산불가 — 목')
})

// ---------- #4 ----------
test('lane1 summary union is not intersection: one URGENT region plus otherwise-CLEAR regions still yields URGENT, not a downgraded average', () => {
  const payload = payloadWithBanner(false)
  const regions = [
    region('shoulder', '어깨', 'urgent_review'),
    region('lbp', '허리', 'clear'),
    region('neck', '목', 'clear'),
    region('knee', '무릎', 'clear'),
  ]
  const summary = computeLane1Summary(payload, regions)
  assert.equal(summary.status, 'URGENT')
})

// ---------- #6 ----------
test('lane1 summary shows 해당없음 only when zero safety-relevant region panels apply to this record', () => {
  const payload = payloadWithBanner(false)
  const regions = [region('lbp', '허리', null), region('neck', '목', null), region('shoulder', '어깨', null)]
  const summary = computeLane1Summary(payload, regions)
  assert.equal(summary.status, '해당없음')
  assert.equal(summary.anyRegionApplicable, false)

  // Sanity: the same zero-applicable-regions record does NOT read 해당없음
  // if the common banner independently fires (그 경우는 URGENT여야 한다).
  const dangerPayload = payloadWithBanner(true)
  const dangerSummary = computeLane1Summary(dangerPayload, regions)
  assert.equal(dangerSummary.status, 'URGENT')
})

// ---------- #17 (delta C-2) ----------
test('the left-column truncation rule never causes a URGENT-severity region to be omitted from the truncated 2-slot list', () => {
  const payload = payloadWithBanner(false)
  const regions = [
    region('lbp', '허리', 'clear'),
    region('neck', '목', 'clear'),
    region('shoulder', '어깨', 'urgent_review'),
  ]
  const summary = computeLane1Summary(payload, regions)
  const related = relatedRegionLabels(summary)
  const truncated = truncateRegionLabels(related, 2)
  assert.ok(truncated.shown.includes('어깨'), 'the urgent region must occupy one of the 2 visible slots')
  assert.equal(truncated.overflowCount, 0, 'only 1 non-clear region exists here, so nothing should overflow')

  // Now with 3 non-clear regions (1 urgent + 2 review) -- urgent must still
  // be visible, and the truncation counts the rest as overflow.
  const regions2 = [
    region('lbp', '허리', 'review_required'),
    region('neck', '목', 'review_required'),
    region('shoulder', '어깨', 'urgent_review'),
  ]
  const summary2 = computeLane1Summary(payload, regions2)
  const truncated2 = truncateRegionLabels(relatedRegionLabels(summary2), 2)
  assert.ok(truncated2.shown.includes('어깨'), 'urgent region must not be crowded out by two review_required regions')
  assert.equal(truncated2.overflowCount, 1)
})

// ---------- MAJOR-2 (Phase 10 closing review): hasUnreadableSafetyField axis ----------

test('MAJOR-2: an unreadable common safety field (malformed medication_use) blocks CLEAR (계산불가), even when the common banner is quiet and every region is CLEAR', () => {
  const payload = payloadWithBanner(false)
  payload.responses = structuredClone(payload.responses)
  payload.responses.medication.medication_use = 'corrupted-legacy-value' // not one of yes/unknown/none
  const regions = [region('lbp', '허리', 'clear'), region('neck', '목', 'clear'), region('shoulder', '어깨', 'clear')]
  const summary = computeLane1Summary(payload, regions)
  assert.notEqual(summary.status, 'CLEAR')
  assert.equal(summary.status, '계산불가')
  assert.equal(summary.unreadableSafetyField, true)
})

test('MAJOR-2: an unreadable common safety field does NOT by itself raise URGENT -- it stays 계산불가, not URGENT, when the common banner itself is quiet', () => {
  const payload = payloadWithBanner(false)
  payload.responses = structuredClone(payload.responses)
  payload.responses.medication.medication_use = 'corrupted-legacy-value'
  const regions = [region('lbp', '허리', 'clear')]
  const summary = computeLane1Summary(payload, regions)
  assert.equal(summary.status, '계산불가')
  assert.notEqual(summary.status, 'URGENT')
})

test('MAJOR-2: a readable payload (no unreadable safety field) reports unreadableSafetyField=false and can still reach CLEAR', () => {
  const payload = payloadWithBanner(false)
  const regions = [region('lbp', '허리', 'clear')]
  const summary = computeLane1Summary(payload, regions)
  assert.equal(summary.unreadableSafetyField, false)
  assert.equal(summary.status, 'CLEAR')
})

test('an unrecognized/malformed region element status fails closed to unavailable, never to CLEAR', () => {
  const payload = payloadWithBanner(false)
  const regions = [{ key: 'lbp', label: '허리', element: React.createElement('div', { className: 'doctor__lbpSafety doctor__lbpSafety--somethingUnknown' }) }]
  const summary = computeLane1Summary(payload, regions)
  assert.equal(summary.status, '계산불가')
})

console.log(`\n${passed} lane1-summary assertions passed.`)
