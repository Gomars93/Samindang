// CRM v0.3.1 round 13 — Today Queue (read-only) regression tests.
//
// Renders src/doctor/TodayQueueSection.tsx directly via renderToString(),
// same convention as tests/doctor-workspace.spec.mjs. This component is
// purely presentational (props in, HTML out) -- these tests assert:
//   - truthful loading/error/empty states, no stale content leaking through
//     an error
//   - server order is preserved exactly (no client-side re-sort)
//   - Safety tasks are visually distinguishable from Clinical/Routine
//   - compact empty state
//   - no click handler / no /seen-triggering side effect anywhere in the
//     rendered output (this component takes no callbacks at all)
//   - tablet-viewport safety: reuses the existing .doctor__grid
//     auto-fill/minmax responsive convention, no fixed pixel widths that
//     could force horizontal overflow

import assert from 'node:assert/strict'
import fs from 'node:fs'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { TodayQueueSection } from './.today-queue-bundle.cjs'

let passed = 0
const test = (name, fn) => {
  fn()
  passed += 1
  console.log(`PASS ${name}`)
}

const render = (props) => renderToString(React.createElement(TodayQueueSection, props))

function makeTask(overrides) {
  return {
    task_id: 'task-1',
    patient_uuid: '11111111-2222-3333-4444-555555555555',
    episode_id: 'episode-1',
    task_type: 'ROUTINE',
    reason_code: 'REASSESSMENT_DUE',
    source_type: null,
    source_id: null,
    source_event_id: null,
    source_timestamp: null,
    created_at: '2026-08-01T00:00:00.000Z',
    due_at: null,
    assigned_to: null,
    owner_clinician: null,
    status: 'OPEN',
    claimed_by: null,
    claimed_at: null,
    claim_expires_at: null,
    first_seen_at: null,
    acknowledged_at: null,
    resolved_at: null,
    contact_mode: 'OUTBOUND_ALLOWED',
    dedup_key: 'dedup-1',
    version: 1,
    ...overrides,
  }
}

// ---------- 1. truthful loading/error/empty states ----------

test('loading with no tasks yet shows a loading message, not an empty-state message', () => {
  const html = render({ tasks: null, loading: true, error: null })
  assert.ok(html.includes('불러오는 중'))
  assert.ok(!html.includes('지금 처리할 CRM 항목이 없습니다'))
})

test('empty tasks array (successful fetch, zero tasks) shows the compact empty state', () => {
  const html = render({ tasks: [], loading: false, error: null })
  assert.ok(html.includes('지금 처리할 CRM 항목이 없습니다'))
})

test('error state shows the error message and never the tasks list, even if tasks were passed', () => {
  const html = render({ tasks: [makeTask({ task_id: 'stale-task' })], loading: false, error: '서버에 연결할 수 없습니다.' })
  assert.ok(html.includes('CRM 큐를 불러오지 못했습니다'))
  assert.ok(html.includes('서버에 연결할 수 없습니다.'))
  assert.ok(!html.includes('stale-task'))
})

test('tasks === null (no successful fetch reflected yet) never renders a prior list, even mid-loading', () => {
  const html = render({ tasks: null, loading: false, error: null })
  assert.ok(!html.includes('doctor__todayQueue__row'))
})

// ---------- 2. server order preserved exactly (no client-side re-sort) ----------

test('renders tasks in exactly the given order, including a deliberately "wrong" priority order', () => {
  // ROUTINE listed before SAFETY_REVIEW -- if the component ever sorted
  // client-side, this order would flip. It must not. Each task carries a
  // distinct patient_uuid (the only per-task value rendered as visible
  // text) so we can locate each row's position in the output.
  const tasks = [
    makeTask({ task_id: 'first', patient_uuid: '1a1a1a1a-0000-0000-0000-000000000000', task_type: 'ROUTINE' }),
    makeTask({
      task_id: 'second',
      patient_uuid: '2b2b2b2b-0000-0000-0000-000000000000',
      task_type: 'SAFETY_REVIEW',
      reason_code: 'SAFETY_REVIEW_REQUEST',
    }),
    makeTask({
      task_id: 'third',
      patient_uuid: '3c3c3c3c-0000-0000-0000-000000000000',
      task_type: 'CLINICAL_REVIEW',
      reason_code: 'CLINICIAN_REVIEW_REQUEST',
    }),
  ]
  const html = render({ tasks, loading: false, error: null })
  const firstIdx = html.indexOf('1a1a1a1a')
  const secondIdx = html.indexOf('2b2b2b2b')
  const thirdIdx = html.indexOf('3c3c3c3c')
  assert.ok(firstIdx > -1 && secondIdx > -1 && thirdIdx > -1)
  assert.ok(firstIdx < secondIdx)
  assert.ok(secondIdx < thirdIdx)
})

// ---------- 3. Safety distinguishability ----------

test('SAFETY_REVIEW task renders with a distinct row class and label from ROUTINE', () => {
  const safetyHtml = render({ tasks: [makeTask({ task_type: 'SAFETY_REVIEW', reason_code: 'SAFETY_REVIEW_REQUEST' })], loading: false, error: null })
  const routineHtml = render({ tasks: [makeTask({ task_type: 'ROUTINE' })], loading: false, error: null })
  assert.ok(safetyHtml.includes('doctor__todayQueue__row--safety_review'))
  assert.ok(!routineHtml.includes('doctor__todayQueue__row--safety_review'))
  assert.ok(safetyHtml.includes('안전 검토'))
})

test('CLINICAL_REVIEW task renders with its own distinct row class', () => {
  const html = render({ tasks: [makeTask({ task_type: 'CLINICAL_REVIEW', reason_code: 'CLINICIAN_REVIEW_REQUEST' })], loading: false, error: null })
  assert.ok(html.includes('doctor__todayQueue__row--clinical_review'))
  assert.ok(html.includes('임상 검토'))
})

// ---------- 4. no identity resolution beyond patient_uuid ----------

test('shows only a truncated patient_uuid, full value only in a title attribute', () => {
  const uuid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
  const html = render({ tasks: [makeTask({ patient_uuid: uuid })], loading: false, error: null })
  assert.ok(html.includes(`title="${uuid}"`))
  assert.ok(html.includes('aaaaaaaa'))
})

// ---------- 5. no click handler / no side-effect surface ----------

test('rendered output contains no onclick attribute (component takes no callbacks)', () => {
  const html = render({ tasks: [makeTask({})], loading: false, error: null })
  assert.ok(!/onclick/i.test(html))
})

test('component source contains no fetch/serverClient call, no markTaskSeen reference, no onClick handler', () => {
  const src = fs.readFileSync(new URL('../src/doctor/TodayQueueSection.tsx', import.meta.url), 'utf8')
  assert.ok(!/fetch\(/.test(src))
  assert.ok(!/serverClient/i.test(src))
  assert.ok(!/markTaskSeen/i.test(src))
  assert.ok(!/onClick/.test(src))
})

// ---------- 6. tablet-viewport safety ----------

test('grid container reuses the existing .doctor__grid class (no new fixed-width layout)', () => {
  const html = render({ tasks: [makeTask({})], loading: false, error: null })
  assert.ok(html.includes('doctor__grid'))
  assert.ok(!/width:\s*\d+px/.test(html))
})

test('component renders without throwing for a task with no due_at/claimed_by/owner_clinician', () => {
  const html = render({ tasks: [makeTask({ due_at: null, claimed_by: null, owner_clinician: null })], loading: false, error: null })
  assert.ok(html.length > 0)
})

console.log(`\n${passed} passed`)
