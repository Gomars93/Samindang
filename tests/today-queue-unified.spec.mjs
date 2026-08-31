// P1 (Core Reduction Phase 6 gate / Phase 5 Synthesis §2.3): unified
// "오늘" Queue row-builder (src/doctor/todayQueue.ts) -- pure function,
// no React, no network. Bundled with esbuild same as every other pure
// TS module suite (e.g. tests/workspace-round3.spec.mjs).
import assert from 'node:assert/strict'
import { buildTodayQueueRows, TODAY_QUEUE_BADGE_LABEL } from './.today-queue-unified-bundle.mjs'

let passed = 0
const test = (name, fn) => {
  fn()
  passed += 1
  console.log(`OK: ${name}`)
}

const NOW = '2026-06-15T09:00:00.000Z'

function submission(overrides = {}) {
  return {
    id: 'sub-1',
    created_at: '2026-06-15T08:00:00.000Z',
    updated_at: '2026-06-15T08:00:00.000Z',
    status: 'new',
    patient_label: '홍길동 (1234)',
    primary_concern: 'pain',
    requires_staff_check: false,
    recorder_ready: false,
    safety_badge: 'CLEAR',
    ...overrides,
  }
}

function revisit(overrides = {}) {
  return {
    visitId: 'visit-1',
    patientId: 'patient-1',
    createdAt: '2026-06-15T07:00:00.000Z',
    updatedAt: '2026-06-15T07:00:00.000Z',
    status: 'WAITING_FOR_PATIENT',
    resolvedIdentity: { resolved: false, reason: 'no_mapping' },
    needsAttention: false,
    deliveryMode: null,
    stationName: null,
    inputProvenance: null,
    sessionCreatedAt: null,
    assignedAt: null,
    patientStartedAt: null,
    submittedAt: null,
    ...overrides,
  }
}

function crmTask(overrides = {}) {
  return {
    task_id: 'task-1',
    patient_uuid: 'patient-crm-1',
    episode_id: 'ep-1',
    task_type: 'ROUTINE',
    reason_code: 'CONTACT_RETRY',
    source_type: null,
    source_id: null,
    source_event_id: null,
    source_timestamp: null,
    created_at: '2026-06-14T00:00:00.000Z',
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
    dedup_key: 'dk-1',
    version: 1,
    ...overrides,
  }
}

const empty = { submissions: [], revisits: [], crmTasks: null, patientIdentities: {}, now: NOW }

// ---------- badges ----------

test('submission row carries its server-derived safety_badge through unchanged', () => {
  const rows = buildTodayQueueRows({ ...empty, submissions: [submission({ safety_badge: 'URGENT' })] })
  assert.equal(rows[0].badge, 'URGENT')
})

test('a wrong-typed/unknown safety_badge value fails closed to REVIEW, never CLEAR', () => {
  const rows = buildTodayQueueRows({ ...empty, submissions: [submission({ safety_badge: 'not-a-real-value' })] })
  assert.equal(rows[0].badge, 'REVIEW')
  const rows2 = buildTodayQueueRows({ ...empty, submissions: [submission({ safety_badge: undefined })] })
  assert.equal(rows2[0].badge, 'REVIEW')
})

test('revisit rows are ALWAYS badge NONE regardless of needsAttention/status -- no questionnaire, no safety computation exists', () => {
  const rows = buildTodayQueueRows({ ...empty, revisits: [revisit({ needsAttention: true, status: 'IN_PROGRESS' })] })
  assert.equal(rows[0].badge, 'NONE')
})

test('revisit rows always carry the fixed "문진 없음 — 안전 계산 없음" note', () => {
  const rows = buildTodayQueueRows({ ...empty, revisits: [revisit()] })
  assert.equal(rows[0].reasonNote, '문진 없음 — 안전 계산 없음')
})

test('CRM rows are ALWAYS badge NONE -- operational, not clinical', () => {
  const rows = buildTodayQueueRows({ ...empty, crmTasks: [crmTask()] })
  assert.equal(rows[0].badge, 'NONE')
})

test('TODAY_QUEUE_BADGE_LABEL covers exactly the 4 values, NONE visually distinct (▦, not the CLEAR icon)', () => {
  assert.equal(Object.keys(TODAY_QUEUE_BADGE_LABEL).sort().join(','), 'CLEAR,NONE,REVIEW,URGENT')
  assert.ok(TODAY_QUEUE_BADGE_LABEL.NONE.includes('▦'))
  assert.notEqual(TODAY_QUEUE_BADGE_LABEL.NONE, TODAY_QUEUE_BADGE_LABEL.CLEAR)
})

test('Phase 7 §6.2 3중 인코딩: REVIEW 글리프는 URGENT/CLEAR와 형태(원 vs 세모)가 달라야 한다 -- 색-단독 구분 금지', () => {
  assert.ok(TODAY_QUEUE_BADGE_LABEL.REVIEW.includes('▲'), 'REVIEW badge must carry a triangle glyph, not a color-only circle')
  assert.ok(!TODAY_QUEUE_BADGE_LABEL.URGENT.includes('▲'))
  assert.ok(!TODAY_QUEUE_BADGE_LABEL.CLEAR.includes('▲'))
  // screen-reader-visible text label always accompanies the glyph (never glyph-only)
  assert.ok(TODAY_QUEUE_BADGE_LABEL.REVIEW.includes('확인 필요'))
})

// ---------- needs_attention ----------

test('needs_attention is a mandatory per-row field (never omitted) and reflects the revisit source flag', () => {
  const rows = buildTodayQueueRows({ ...empty, revisits: [revisit({ needsAttention: true }), revisit({ visitId: 'v2', needsAttention: false })] })
  assert.equal(rows.find((r) => r.revisitVisitId === 'visit-1').needsAttention, true)
  assert.equal(rows.find((r) => r.revisitVisitId === 'v2').needsAttention, false)
})

test('submission and CRM rows never fabricate needs_attention=true (only revisit\'s Micro Follow-up source has this signal)', () => {
  const rows = buildTodayQueueRows({
    ...empty,
    submissions: [submission()],
    crmTasks: [crmTask()],
  })
  assert.ok(rows.every((r) => r.needsAttention === false))
})

// ---------- identity ----------

test('an unresolved revisit identity shows "신원 확인 필요" and carries patientUuidForIdentityLink for PatientIdentityLinkAction', () => {
  const rows = buildTodayQueueRows({ ...empty, revisits: [revisit({ resolvedIdentity: { resolved: false, reason: 'no_mapping' } })] })
  assert.equal(rows[0].displayName, '신원 확인 필요')
  assert.equal(rows[0].identityUnresolved, true)
  assert.equal(rows[0].patientUuidForIdentityLink, 'patient-1')
})

test('a resolved revisit identity shows the real name + chart_no, no link action needed', () => {
  const rows = buildTodayQueueRows({
    ...empty,
    revisits: [revisit({ resolvedIdentity: { resolved: true, sigma_chart_no: 'CH-01', patient_name: 'TEST-NAME' } })],
  })
  assert.equal(rows[0].displayName, 'TEST-NAME')
  assert.equal(rows[0].chartNo, 'CH-01')
  assert.equal(rows[0].identityUnresolved, false)
  assert.equal(rows[0].patientUuidForIdentityLink, null)
})

test('an unresolved CRM identity (absent from the patientIdentities map) shows "신원 확인 필요"', () => {
  const rows = buildTodayQueueRows({ ...empty, crmTasks: [crmTask({ patient_uuid: 'crm-unresolved' })], patientIdentities: {} })
  assert.equal(rows[0].displayName, '신원 확인 필요')
  assert.equal(rows[0].patientUuidForIdentityLink, 'crm-unresolved')
})

test('a resolved CRM identity shows the real name + chart_no', () => {
  const rows = buildTodayQueueRows({
    ...empty,
    crmTasks: [crmTask({ patient_uuid: 'crm-resolved' })],
    patientIdentities: { 'crm-resolved': { resolved: true, sigma_chart_no: 'CH-02', patient_name: 'CRM-NAME' } },
  })
  assert.equal(rows[0].displayName, 'CRM-NAME')
  assert.equal(rows[0].chartNo, 'CH-02')
})

// ---------- CRM grouping (multi-item, patient 1 row + N) ----------

test('multiple CRM tasks for the SAME patient collapse into ONE row carrying every task_id (never silently drops one)', () => {
  const rows = buildTodayQueueRows({
    ...empty,
    crmTasks: [
      crmTask({ task_id: 't1', patient_uuid: 'p-multi' }),
      crmTask({ task_id: 't2', patient_uuid: 'p-multi' }),
      crmTask({ task_id: 't3', patient_uuid: 'p-multi' }),
    ],
  })
  const crmRows = rows.filter((r) => r.kind === 'crm')
  assert.equal(crmRows.length, 1)
  assert.deepEqual(crmRows[0].crmTaskIds.sort(), ['t1', 't2', 't3'])
})

test('different patients\' CRM tasks stay separate rows', () => {
  const rows = buildTodayQueueRows({
    ...empty,
    crmTasks: [crmTask({ task_id: 't1', patient_uuid: 'p-a' }), crmTask({ task_id: 't2', patient_uuid: 'p-b' })],
  })
  assert.equal(rows.filter((r) => r.kind === 'crm').length, 2)
})

// ---------- completion folding ----------

test('a completed submission (status==="completed") is marked completed for folding', () => {
  const rows = buildTodayQueueRows({ ...empty, submissions: [submission({ status: 'completed', safety_badge: 'CLEAR' })] })
  assert.equal(rows[0].completed, true)
})

test('a completed revisit (status==="COMPLETED") is marked completed for folding', () => {
  const rows = buildTodayQueueRows({ ...empty, revisits: [revisit({ status: 'COMPLETED' })] })
  assert.equal(rows[0].completed, true)
})

test('CRM rows are never completed (listActionableTasks already excludes terminal statuses server-side)', () => {
  const rows = buildTodayQueueRows({ ...empty, crmTasks: [crmTask({ status: 'DONE' })] })
  assert.equal(rows[0].completed, false)
})

// ---------- BLOCKER-1 (Phase 10 closing review): needsAttention must never fold ----------

test('BLOCKER-1: a revisit with status COMPLETED + needsAttention true stays completed=true but sorts to tier 0 (URGENT-equivalent), never folded', () => {
  // server/store.js: a micro follow-up `response` existing is exactly the
  // condition that sets BOTH needsAttention AND status COMPLETED on the
  // same revisit -- this combination is the realistic case, not a
  // synthetic one. `completed` itself stays true (it still reflects
  // server status faithfully); it is tier/fold placement that must not
  // treat this row as done-and-out-of-sight.
  const rows = buildTodayQueueRows({
    ...empty,
    revisits: [revisit({ status: 'COMPLETED', needsAttention: true })],
  })
  assert.equal(rows[0].completed, true)
  assert.equal(rows[0].needsAttention, true)
})

test('BLOCKER-1: needsAttention+COMPLETED sorts ahead of a plain (non-attention) completed row, matching URGENT tier', () => {
  const rows = buildTodayQueueRows({
    ...empty,
    revisits: [
      revisit({ visitId: 'plain-completed', status: 'COMPLETED', needsAttention: false }),
      revisit({ visitId: 'attention-completed', status: 'COMPLETED', needsAttention: true }),
    ],
  })
  assert.equal(rows[0].revisitVisitId, 'attention-completed')
  assert.equal(rows[1].revisitVisitId, 'plain-completed')
})

// ---------- sort tiers: URGENT -> 오늘 예정 -> 신규 -> 나머지 -> 완료 ----------

test('sort: URGENT beats everything else regardless of source kind', () => {
  const rows = buildTodayQueueRows({
    now: NOW,
    patientIdentities: {},
    submissions: [submission({ id: 'urgent-sub', safety_badge: 'URGENT', status: 'viewed' })],
    revisits: [revisit()],
    crmTasks: [crmTask({ due_at: '2026-06-15T23:00:00.000Z' })], // due today -- would otherwise be tier 1
  })
  assert.equal(rows[0].submissionId, 'urgent-sub')
})

test('sort: a CRM task due TODAY (오늘 예정) beats a new submission (신규)', () => {
  const rows = buildTodayQueueRows({
    now: NOW,
    patientIdentities: {},
    submissions: [submission({ id: 'new-sub', status: 'new', safety_badge: 'CLEAR' })],
    revisits: [],
    crmTasks: [crmTask({ patient_uuid: 'due-today', due_at: '2026-06-15T23:00:00.000Z' })],
  })
  assert.equal(rows[0].kind, 'crm')
  assert.equal(rows[1].submissionId, 'new-sub')
})

test('sort: a CRM task due TOMORROW does not count as 오늘 예정 -- a new submission beats it', () => {
  const rows = buildTodayQueueRows({
    now: NOW,
    patientIdentities: {},
    submissions: [submission({ id: 'new-sub', status: 'new', safety_badge: 'CLEAR' })],
    revisits: [],
    crmTasks: [crmTask({ patient_uuid: 'due-tomorrow', due_at: '2026-06-16T09:00:00.000Z' })],
  })
  assert.equal(rows[0].submissionId, 'new-sub')
  assert.equal(rows[1].kind, 'crm')
})

test('sort: 신규 (new submission) beats a plain revisit/CRM row with no other priority', () => {
  const rows = buildTodayQueueRows({
    now: NOW,
    patientIdentities: {},
    submissions: [submission({ id: 'new-sub', status: 'new', safety_badge: 'CLEAR' })],
    revisits: [revisit()],
    crmTasks: [crmTask()],
  })
  assert.equal(rows[0].submissionId, 'new-sub')
})

test('sort: completed rows are always folded to the very end, even a completed submission that would otherwise be 신규-adjacent', () => {
  const rows = buildTodayQueueRows({
    ...empty,
    submissions: [
      submission({ id: 'completed-sub', status: 'completed', safety_badge: 'URGENT' }), // even URGENT-badged, completed still folds last
      submission({ id: 'viewed-sub', status: 'viewed', safety_badge: 'CLEAR' }),
    ],
  })
  assert.equal(rows[rows.length - 1].submissionId, 'completed-sub')
})

test('sort stability: two CRM rows in the SAME tier keep the server-authoritative relative order they arrived in (never client-side re-sorted)', () => {
  const rows = buildTodayQueueRows({
    ...empty,
    crmTasks: [
      crmTask({ task_id: 't-first', patient_uuid: 'p-first' }),
      crmTask({ task_id: 't-second', patient_uuid: 'p-second' }),
      crmTask({ task_id: 't-third', patient_uuid: 'p-third' }),
    ],
  })
  assert.deepEqual(
    rows.map((r) => r.crmPatientUuid),
    ['p-first', 'p-second', 'p-third'],
  )
})

// ---------- resilience: malformed elements never crash ----------

test('a missing/non-array submissions or revisits list fails closed to "nothing from that source" instead of throwing', () => {
  assert.doesNotThrow(() => buildTodayQueueRows({ now: NOW, patientIdentities: {}, submissions: undefined, revisits: undefined, crmTasks: null }))
  const rows = buildTodayQueueRows({ now: NOW, patientIdentities: {}, submissions: undefined, revisits: undefined, crmTasks: null })
  assert.equal(rows.length, 0)
})

test('null/non-object elements in every array are skipped, never thrown', () => {
  assert.doesNotThrow(() => {
    buildTodayQueueRows({
      now: NOW,
      patientIdentities: {},
      submissions: [null, undefined, submission()],
      revisits: [null, revisit()],
      crmTasks: [null, { patient_uuid: 42 }, crmTask()],
    })
  })
})

console.log(`\n${passed} today-queue-unified assertions passed.`)
