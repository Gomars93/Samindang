// Core Reduction P6 (Phase 7 UI spec §9 empty/error states). Renders
// src/doctor/TodayUnifiedQueueSection.tsx directly via renderToString(),
// same convention as tests/today-queue.spec.mjs -- this component has never
// had its own render test (tests/save-conflict.spec.mjs only source-string
// checks one guard inside it), so the §9 states this file covers had no
// regression coverage at all before this round.
//
//   - Queue 빈 상태: "오늘 예정된 문진이 없습니다." (not the old
//     "지금 확인할 항목이 없습니다." wording), with an optional plain-text
//     "설정 확인하기" link when a next action is reachable (operate.md
//     empty-state principle) -- absent when no callback is given, so no
//     caller regresses by omission.
//   - Queue 소스 폴링 실패: the ⟳ stale-source row (Phase 5 Synthesis v1.2
//     §2.3 (b)안) renders per source, keeps the last-good timestamp visible,
//     and offers a retry action -- never a silent disappearance of the row.

import assert from 'node:assert/strict'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { TodayUnifiedQueueSection } from './.today-queue-unified-ui-bundle.cjs'

let passed = 0
const test = (name, fn) => {
  fn()
  passed += 1
  console.log(`PASS ${name}`)
}

const freshOk = { failed: false, lastGoodAt: '2026-08-31T00:00:00.000Z', onRetry: () => {} }

function baseProps(overrides = {}) {
  return {
    rows: [],
    submissionsById: new Map(),
    revisitsByVisitId: new Map(),
    crmTasksByPatient: new Map(),
    onOpenSubmission: () => {},
    onOpenRevisit: () => {},
    onIdentityLinked: () => {},
    submissionsFreshness: freshOk,
    revisitsFreshness: freshOk,
    crmFreshness: freshOk,
    crmLoading: false,
    listLoading: false,
    unreadReadyIds: new Set(),
    ...overrides,
  }
}

const render = (props) => renderToString(React.createElement(TodayUnifiedQueueSection, props))

// ---------- 1. Queue 빈 상태 (Phase 7 §9) ----------

test('empty queue (no rows, not loading) shows the Phase 7 §9 empty-state copy, not the old wording', () => {
  const html = render(baseProps())
  assert.ok(html.includes('오늘 예정된 문진이 없습니다.'))
  assert.ok(!html.includes('지금 확인할 항목이 없습니다'))
})

test('empty queue with onGoToSettings offers a plain-text 설정 link (no icon class, underlined text only)', () => {
  const html = render(baseProps({ onGoToSettings: () => {} }))
  assert.ok(html.includes('doctor__emptyLink'))
  assert.ok(html.includes('설정 확인하기'))
})

test('empty queue without onGoToSettings renders the empty-state text with no dangling link control', () => {
  const html = render(baseProps())
  assert.ok(!html.includes('doctor__emptyLink'))
  assert.ok(!html.includes('설정 확인하기'))
})

test('loading state still shows "불러오는 중" and never the empty-state copy, even with zero rows (regression: truthful loading vs empty)', () => {
  const html = render(baseProps({ listLoading: true }))
  assert.ok(html.includes('불러오는 중'))
  assert.ok(!html.includes('오늘 예정된 문진이 없습니다'))
})

test('a non-empty queue renders neither the loading nor the empty-state copy', () => {
  const row = {
    key: 'sub-1',
    kind: 'submission',
    badge: 'CLEAR',
    needsAttention: false,
    reason: '신규 문진',
    reasonNote: null,
    displayName: '홍길동',
    chartNo: 'C-001',
    identityUnresolved: false,
    patientUuidForIdentityLink: null,
    timeIso: '2026-08-31T00:00:00.000Z',
    completed: false,
    scheduledToday: true,
    isNew: true,
    submissionId: 'sub-1',
  }
  const html = render(baseProps({ rows: [row] }))
  assert.ok(!html.includes('불러오는 중'))
  assert.ok(!html.includes('오늘 예정된 문진이 없습니다'))
})

// ---------- 2. Queue 소스 폴링 실패 (Phase 5 Synthesis v1.2 §2.3 (b)안) ----------

const freshFailed = (lastGoodAt) => ({ failed: true, lastGoodAt, onRetry: () => {} })

test('a failed submissions source shows the ⟳ stale row with the source label and a retry action', () => {
  const html = render(baseProps({ submissionsFreshness: freshFailed('2026-08-31T05:00:00.000Z') }))
  assert.ok(html.includes('doctor__todayQueue__stale'))
  assert.ok(html.includes('⟳'))
  assert.ok(html.includes('문진 목록'))
  assert.ok(html.includes('갱신 실패'))
  assert.ok(html.includes('다시 시도'))
})

test('a failed revisits source and a failed CRM source each render their OWN stale row (all three sources are independent, one failing never masks another)', () => {
  const html = render(
    baseProps({
      revisitsFreshness: freshFailed('2026-08-31T05:00:00.000Z'),
      crmFreshness: freshFailed('2026-08-31T05:00:00.000Z'),
    }),
  )
  const staleCount = (html.match(/class="doctor__todayQueue__stale"/g) ?? []).length
  assert.equal(staleCount, 2, 'exactly the two failed sources each get their own stale row')
  assert.ok(html.includes('재진 목록'))
  assert.ok(html.includes('CRM 목록'))
})

test('a stale row with no prior successful poll (lastGoodAt=null) shows "없음" rather than a fabricated timestamp', () => {
  const html = render(baseProps({ submissionsFreshness: freshFailed(null) }))
  assert.ok(/마지막 확인[\s\S]{0,20}없음/.test(html))
})

test('a failed source keeps the queue usable (no source failure blanks the whole section) -- the empty-state copy and the stale notice can render together', () => {
  const html = render(baseProps({ submissionsFreshness: freshFailed('2026-08-31T05:00:00.000Z') }))
  assert.ok(html.includes('doctor__todayQueue__stale'), 'stale notice present')
  assert.ok(html.includes('오늘 예정된 문진이 없습니다.'), 'empty state still renders beneath it, not replaced by it')
})

test('all three sources healthy (failed=false) renders no stale row at all', () => {
  const html = render(baseProps())
  assert.ok(!html.includes('doctor__todayQueue__stale'))
})

console.log(`\n${passed} today-queue-unified-ui assertions passed.`)
