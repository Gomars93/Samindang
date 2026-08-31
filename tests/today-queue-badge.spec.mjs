// P1 (Core Reduction Phase 6 gate / Phase 5 Synthesis §2.3): unified "오늘"
// Queue submission-row safety badge (server/store.js's deriveSafetyBadge,
// exercised through listSubmissions() -- deriveSafetyBadge itself is not
// exported, matching this file's existing not-exported-helper convention).
// Plain node, no test framework: assert() prints "OK: <name>" and throws on
// failure, same convention as tests/server.spec.mjs.
//
// Field-name-typo guard (explicitly required by the governing task): a
// submission row's badge reads NINE region-specific keys
// (`<region>_safety_status` inside `responses.safety_flags.<region>`) plus
// `flags.requires_staff_check`. A typo in any one of those keys would
// silently swallow that region's real URGENT_REVIEW into "no data"
// fail-open -- this suite exercises each of the 9 keys individually by name,
// not just "some region works".
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createStore } from '../server/store.js'

let passCount = 0
function ok(name, cond) {
  if (!cond) throw new Error(`FAIL: ${name}`)
  passCount++
  console.log(`OK: ${name}`)
}

// A self-consistent, fully "all-clear" flags/responses pair --
// isFlagsConsistentWithResponses (server/store.js) cross-checks these
// against each other, so every field below must actually agree.
const CLEAR_FLAGS = {
  general_red: false,
  gi_needs_review: false,
  bowel_needs_review: false,
  sleep_disorder_review: false,
  sleep_disorder_priority_review: false,
  response_consistency_review: false,
  requires_staff_check: false,
}

function clearResponses(overrides = {}) {
  return {
    safety_flags: { red_flag_general: ['none'] },
    modules: {
      gi: { unable_to_eat_or_drink: 'no' },
      bowel: { blood_or_black_stool: 'no' },
      sleep: { menopause: { sleep_disorder_screen: [], stage: null } },
    },
    reproductive_status: { reproductive_status: null },
    ...overrides,
  }
}

const REGION_STATUS_FIELDS = {
  lbp: 'lbp_safety_status',
  neck: 'neck_safety_status',
  shoulder: 'shoulder_safety_status',
  knee: 'knee_safety_status',
  elbow: 'elbow_safety_status',
  wrist_hand: 'wrist_hand_safety_status',
  hip: 'hip_safety_status',
  ankle_foot: 'ankle_foot_safety_status',
  tmj: 'tmj_safety_status',
}

async function withStore(fn) {
  const root = await mkdtemp(path.join(tmpdir(), 'samindang-today-queue-badge-'))
  try {
    const store = createStore(path.join(root, 'submissions'))
    await fn(store)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

async function main() {
  // ---------- 1. field-name-typo guard: each of the 9 regions individually ----------
  await withStore(async (store) => {
    let n = 0
    for (const [region, field] of Object.entries(REGION_STATUS_FIELDS)) {
      n += 1
      const sessionId = `typo-guard-${region}`
      await store.createSubmission({
        submission: {
          questionnaire_version: '1.0',
          session_id: sessionId,
          responses: clearResponses({ safety_flags: { red_flag_general: ['none'], [region]: { [field]: 'URGENT_REVIEW' } } }),
          flags: CLEAR_FLAGS,
          metadata: {},
        },
        myungri: null,
        patient_label: `typo-guard-${region}`,
      })
    }
    const list = await store.listSubmissions()
    for (const [region] of Object.entries(REGION_STATUS_FIELDS)) {
      const row = list.find((r) => r.patient_label === `typo-guard-${region}`)
      ok(`safety_badge: region '${region}' field '${REGION_STATUS_FIELDS[region]}'=URGENT_REVIEW -> badge URGENT (exact key match, not a typo'd neighbor)`, row?.safety_badge === 'URGENT')
    }
    ok(`field-name-typo guard covered all ${Object.keys(REGION_STATUS_FIELDS).length} regions`, n === 9)
  })

  // ---------- 2. severity ordering: URGENT > REVIEW > CLEAR > NONE ----------
  await withStore(async (store) => {
    await store.createSubmission({
      submission: {
        questionnaire_version: '1.0',
        session_id: 'sev-review',
        responses: clearResponses({ safety_flags: { red_flag_general: ['none'], lbp: { lbp_safety_status: 'REVIEW_REQUIRED' } } }),
        flags: CLEAR_FLAGS,
        metadata: {},
      },
      myungri: null,
      patient_label: 'sev-review',
    })
    await store.createSubmission({
      submission: {
        questionnaire_version: '1.0',
        session_id: 'sev-mixed',
        // one region CLEAR, one region URGENT_REVIEW -- URGENT must win.
        responses: clearResponses({
          safety_flags: {
            red_flag_general: ['none'],
            lbp: { lbp_safety_status: 'CLEAR' },
            neck: { neck_safety_status: 'URGENT_REVIEW' },
          },
        }),
        flags: CLEAR_FLAGS,
        metadata: {},
      },
      myungri: null,
      patient_label: 'sev-mixed',
    })
    await store.createSubmission({
      submission: {
        questionnaire_version: '1.0',
        session_id: 'sev-all-clear',
        responses: clearResponses({
          safety_flags: { red_flag_general: ['none'], lbp: { lbp_safety_status: 'CLEAR' } },
        }),
        flags: CLEAR_FLAGS,
        metadata: {},
      },
      myungri: null,
      patient_label: 'sev-all-clear',
    })
    await store.createSubmission({
      submission: {
        questionnaire_version: '1.0',
        session_id: 'sev-herbal-only',
        // no region status strings anywhere (genuinely no pain module --
        // the herbal/no-pain-region shape) AND requires_staff_check=false.
        responses: clearResponses(),
        flags: CLEAR_FLAGS,
        metadata: {},
      },
      myungri: null,
      patient_label: 'sev-herbal-only',
    })
    await store.createSubmission({
      submission: {
        questionnaire_version: '1.0',
        session_id: 'sev-general-red-flag',
        // requires_staff_check=true via a genuine general red flag, with
        // NO region status strings at all (the "legacy/no-region" +
        // requires_staff_check=true -> URGENT rule).
        responses: clearResponses({ safety_flags: { red_flag_general: ['SAFETY_01_SOMETHING'] } }),
        flags: { ...CLEAR_FLAGS, general_red: true, requires_staff_check: true },
        metadata: {},
      },
      myungri: null,
      patient_label: 'sev-general-red-flag',
    })

    const list = await store.listSubmissions()
    const byLabel = (label) => list.find((r) => r.patient_label === label)
    ok('safety_badge: a lone REVIEW_REQUIRED region -> REVIEW', byLabel('sev-review').safety_badge === 'REVIEW')
    ok('safety_badge: CLEAR + URGENT_REVIEW across two regions -> URGENT wins (worst-of-union)', byLabel('sev-mixed').safety_badge === 'URGENT')
    ok('safety_badge: every present region CLEAR, requires_staff_check=false -> CLEAR', byLabel('sev-all-clear').safety_badge === 'CLEAR')
    ok(
      'safety_badge: no region status strings at all (e.g. genuinely herbal-only, no pain module) + requires_staff_check=false -> NONE (안전 계산 없음), never CLEAR',
      byLabel('sev-herbal-only').safety_badge === 'NONE',
    )
    ok(
      'safety_badge: no region status strings + requires_staff_check=true (general red flag, region-independent) -> URGENT, never NONE',
      byLabel('sev-general-red-flag').safety_badge === 'URGENT',
    )
  })

  // ---------- 3. fail-closed on unreadable flags (never CLEAR/NONE) ----------
  await withStore(async (store) => {
    await store.createSubmission({
      submission: {
        questionnaire_version: '1.0',
        session_id: 'unreadable-flags',
        responses: clearResponses({ safety_flags: { red_flag_general: ['none'], lbp: { lbp_safety_status: 'CLEAR' } } }),
        // flags hollowed to {} -- isFlagsUsable must reject this (missing
        // required boolean keys), same gate the existing
        // requires_staff_check:'unknown' path already uses.
        flags: {},
        metadata: {},
      },
      myungri: null,
      patient_label: 'unreadable-flags',
    })
    const list = await store.listSubmissions()
    const row = list.find((r) => r.patient_label === 'unreadable-flags')
    ok('safety_badge: unreadable/untrustworthy flags -> REVIEW (fail-closed), never CLEAR even though the one present region says CLEAR', row.safety_badge === 'REVIEW')
    ok('sanity: this row also gets the existing requires_staff_check==="unknown" treatment (same isFlagsUsable gate)', row.requires_staff_check === 'unknown')
  })

  // ---------- 4. non-clinical sanity: badge is additive, does not disturb the existing requires_staff_check contract ----------
  await withStore(async (store) => {
    await store.createSubmission({
      submission: {
        questionnaire_version: '1.0',
        session_id: 'additive-check',
        responses: clearResponses(),
        flags: CLEAR_FLAGS,
        metadata: {},
      },
      myungri: null,
      patient_label: 'additive-check',
    })
    const list = await store.listSubmissions()
    const row = list.find((r) => r.patient_label === 'additive-check')
    ok('safety_badge is additive -- requires_staff_check keeps its own pre-existing boolean contract unchanged', row.requires_staff_check === false)
    ok('safety_badge field itself is present on every row', typeof row.safety_badge === 'string')
  })

  console.log(`\n${passCount} today-queue-badge assertions passed.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
