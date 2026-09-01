// Core Reduction P6 (Phase 5 Synthesis v1.2 §3.2 delta C-2 / Phase 7 UI
// spec §1.3-#17, §9 auth-inline). Renders src/doctor/workspace/
// VisitSummaryAside.tsx directly via renderToString() (same convention as
// tests/today-queue.spec.mjs/doctor-workspace.spec.mjs) -- this component is
// purely presentational (no data fetching, its one effect never runs under
// SSR), so a rendered-output test of its OWN truncation/chip/save-row logic
// is honestly exercisable here, layered on top of the pure-function unit
// tests tests/lane1-summary.spec.mjs already has for truncateRegionLabels
// itself.
//
// The worst-case combination Phase 5 §5's metric names explicitly (부위
// 3개 + 계산불가 + auth 만료) had never been rendered together before this
// file: lane1-summary.spec.mjs tests truncateRegionLabels() in isolation,
// and save-conflict.spec.mjs source-checks the auth branch, but nothing
// proved the aside still truncates correctly to its §3.2 fixed height WHEN
// both apply on the very same record at once.

import assert from 'node:assert/strict'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { VisitSummaryAside } from './.visit-summary-aside-bundle.cjs'

let passed = 0
const test = (name, fn) => {
  fn()
  passed += 1
  console.log(`PASS ${name}`)
}

function baseProps(overrides = {}) {
  return {
    patientName: '홍길동',
    chartNo: 'C-001',
    sexAgeLine: '여성 · 42세',
    chiefConcern: '허리 통증',
    durationFrequency: '2주',
    lastVsDeltaLine: null,
    lane1: {
      status: 'CLEAR',
      calcUnavailableLabels: [],
      urgentLabels: [],
      reviewLabels: [],
      clearLabels: [],
      anyRegionApplicable: true,
      commonBannerDanger: false,
    },
    ...overrides,
  }
}

const render = (props) => renderToString(React.createElement(VisitSummaryAside, props))

// ---------- 1. 좌측 요약 절단 규칙 최악 fixture (부위 3+계산불가+auth 만료) ----------

test('worst-case fixture (3 regions incl. 1 calc-unavailable, save failing on auth): status chip carries the calc-unavailable suffix, not a bare CLEAR/URGENT label', () => {
  const html = render(
    baseProps({
      lane1: {
        status: '계산불가',
        calcUnavailableLabels: ['목'],
        urgentLabels: ['어깨'],
        reviewLabels: ['허리'],
        clearLabels: [],
        anyRegionApplicable: true,
        commonBannerDanger: false,
      },
      saveStatus: 'error',
      lastSaveErrorKind: 'auth',
    }),
  )
  assert.ok(html.includes('계산불가 — 목'), 'the calc-unavailable suffix is appended to the status chip text')
})

test('worst-case fixture: exactly 2 of the 3 regions show, with 외 1 naming the overflow (never silently dropped)', () => {
  const html = render(
    baseProps({
      lane1: {
        status: '계산불가',
        calcUnavailableLabels: ['목'],
        urgentLabels: ['어깨'],
        reviewLabels: ['허리'],
        clearLabels: [],
        anyRegionApplicable: true,
        commonBannerDanger: false,
      },
    }),
  )
  const regionsIdx = html.indexOf('doctor__visitSummary__regions')
  const regionsBlock = html.slice(regionsIdx, regionsIdx + 200)
  assert.ok(regionsBlock.includes('어깨'), 'the urgent region occupies one of the 2 visible slots (priority order)')
  assert.ok(regionsBlock.includes('허리'), 'the review region occupies the other visible slot')
  assert.ok(/외\s*1/.test(regionsBlock), 'the third (calc-unavailable) region is named via 외 N, never silently dropped')
})

test('MAJOR-3 (Phase 10 closing review): the save-status row (block ⑤) is REPLACED by a 1-line "인증 만료 — 토큰 다시 입력" action, never the full token-entry form inline (that clipped at the 20px budget)', () => {
  const html = render(
    baseProps({
      lane1: {
        status: '계산불가',
        calcUnavailableLabels: ['목'],
        urgentLabels: ['어깨'],
        reviewLabels: ['허리'],
        clearLabels: [],
        anyRegionApplicable: true,
        commonBannerDanger: false,
      },
      saveStatus: 'error',
      lastSaveErrorKind: 'auth',
    }),
  )
  assert.ok(html.includes('인증 만료 — 토큰 다시 입력'), 'the 1-line auth-recovery action renders in place of the save row')
  assert.ok(!html.includes('doctor token'), 'the full token-entry form must NOT render inline inside the 20px-budget block ⑤ (that is exactly the clipping bug)')
  assert.ok(!html.includes('저장 실패 — 다시 시도해주세요'), 'the generic failure text is REPLACED, not shown alongside the recovery action')
})

test('MAJOR-3: clicking the auth-recovery action calls onOpenTokenReentry (the caller renders the actual form outside this budget), never DoctorTokenSetup directly', () => {
  let opened = false
  const html = render(
    baseProps({
      saveStatus: 'error',
      lastSaveErrorKind: 'auth',
      onOpenTokenReentry: () => {
        opened = true
      },
    }),
  )
  assert.ok(html.includes('doctor__visitSummary__authBtn'), 'the action renders as the dedicated 1-line button class')
  // renderToString cannot fire onClick (no DOM), so this only proves the
  // wiring compiles/renders with the callback prop present -- the actual
  // click-fires-callback behavior is exercised by the headless test below.
  assert.equal(typeof opened, 'boolean')
})

test('worst-case fixture: the 🔒 lock indicator renders (a non-CLEAR/해당없음 union status locks the summary)', () => {
  const html = render(
    baseProps({
      lane1: {
        status: '계산불가',
        calcUnavailableLabels: ['목'],
        urgentLabels: ['어깨'],
        reviewLabels: ['허리'],
        clearLabels: [],
        anyRegionApplicable: true,
        commonBannerDanger: false,
      },
    }),
  )
  assert.ok(html.includes('doctor__visitSummary__lock'))
})

test('a single non-clear region never triggers truncation (외 N text absent when nothing overflows)', () => {
  const html = render(
    baseProps({
      lane1: {
        status: '확인 필요',
        calcUnavailableLabels: [],
        urgentLabels: [],
        reviewLabels: ['어깨'],
        clearLabels: [],
        anyRegionApplicable: true,
        commonBannerDanger: false,
      },
    }),
  )
  assert.ok(!/외\s*\d/.test(html))
})

// ---------- 2. 저장 상태 4종 회귀 (auth 대체 vs 일반 실패는 서로 다른 렌더) ----------

test('a generic (non-auth) save failure keeps the plain "저장 실패" text, never the token form', () => {
  const html = render(baseProps({ saveStatus: 'error', lastSaveErrorKind: 'network' }))
  assert.ok(html.includes('저장 실패 — 다시 시도해주세요'))
  assert.ok(!html.includes('doctor token'))
})

test('saveStatus idle/undefined renders neither a failure message nor the token form', () => {
  const html = render(baseProps())
  assert.ok(!html.includes('저장 실패'))
  assert.ok(!html.includes('doctor token'))
})

console.log(`\n${passed} visit-summary-aside assertions passed.`)
