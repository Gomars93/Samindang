// Doctor Workspace view_profile decision matrix (round 2 Phase 4).
// See docs/DOCTOR_WORKSPACE_VIEW_PROFILE_MATRIX.md for the full table and
// the PRODUCT DECISION REQUIRED note this test intentionally does NOT try
// to resolve on its own.
//
// Run via `npm run test:view-profile-matrix` (bundles src/spec/coreSpec.ts
// and src/doctor/workspace/viewProfile.ts with esbuild --platform=neutral
// -- both are pure TS, no React, so no jsx/loader flags are needed).
// Plain node, no test framework: assert() prints "OK: <name>" and throws on failure.

import * as coreSpec from './.view-profile-matrix-corespec-bundle.mjs'
import { deriveViewProfile } from './.view-profile-matrix-viewprofile-bundle.mjs'

let passCount = 0
function assert(name, cond) {
  if (!cond) throw new Error(`FAIL: ${name}`)
  passCount++
  console.log(`OK: ${name}`)
}

function emptyResponses() {
  return Object.fromEntries(coreSpec.ALL_QUESTIONS.map((q) => [q.id, null]))
}

// Builds only what deriveViewProfile()/doctorViewProfile() actually read
// (routing.primary_module/additional_module/questionnaire_mode) -- no
// need to build a full DoctorPayload via buildResponsePayload/computeSaju
// for a routing-only matrix.
function fakePayload(r) {
  return { session_id: 'matrix', routing: coreSpec.buildRoutingPayload(r) }
}

const CASES = [
  {
    n: '1: Pain primary, pain_fast',
    patch: { VISIT_00_INTENT: 'pain_care' },
    expect: { profile: 'pain', hasPain: true, hasSystemic: false },
  },
  {
    n: '2: Pain primary, expanded (herbal-intent symptom route)',
    patch: { VISIT_00_INTENT: 'herbal', VISIT_00B_HERBAL_PURPOSE: 'symptom', VISIT_02_SYMPTOM_MAIN: 'pain' },
    expect: { profile: 'mixed', hasPain: true, hasSystemic: true },
  },
  {
    n: '3: Pain primary + herbal add-on',
    patch: { VISIT_00_INTENT: 'pain_care', HERBAL_ADDON_ACTIVE: 'yes' },
    expect: { profile: 'mixed', hasPain: true, hasSystemic: true },
  },
  {
    n: '4: Sleep primary',
    patch: { VISIT_00_INTENT: 'symptom_consult', VISIT_02_SYMPTOM_MAIN: 'sleep' },
    expect: { profile: 'herbal', hasPain: false, hasSystemic: false },
  },
  {
    n: '5: GI primary',
    patch: { VISIT_00_INTENT: 'symptom_consult', VISIT_02_SYMPTOM_MAIN: 'digestion' },
    expect: { profile: 'herbal', hasPain: false, hasSystemic: false },
  },
  {
    n: '6: Bowel primary',
    patch: { VISIT_00_INTENT: 'symptom_consult', VISIT_02_SYMPTOM_MAIN: 'bowel' },
    expect: { profile: 'herbal', hasPain: false, hasSystemic: false },
  },
  {
    n: '7: Urinary primary',
    patch: { VISIT_00_INTENT: 'symptom_consult', VISIT_02_SYMPTOM_MAIN: 'urinary' },
    expect: { profile: 'herbal', hasPain: false, hasSystemic: false },
  },
  {
    n: '8: Fatigue primary',
    patch: { VISIT_00_INTENT: 'symptom_consult', VISIT_02_SYMPTOM_MAIN: 'fatigue' },
    expect: { profile: 'herbal', hasPain: false, hasSystemic: false },
  },
  {
    n: '9: Stress primary',
    patch: { VISIT_00_INTENT: 'symptom_consult', VISIT_02_SYMPTOM_MAIN: 'stress' },
    expect: { profile: 'herbal', hasPain: false, hasSystemic: false },
  },
  {
    n: '10: Women primary',
    patch: { VISIT_00_INTENT: 'women', VISIT_02_WOMEN: 'women' },
    expect: { profile: 'herbal', hasPain: false, hasSystemic: false },
  },
  {
    n: '11: Weight primary',
    patch: { VISIT_00_INTENT: 'weight' },
    expect: { profile: 'herbal', hasPain: false, hasSystemic: false },
  },
  {
    n: '12: Constitution (herbal intent, non-symptom purpose)',
    patch: { VISIT_00_INTENT: 'herbal', VISIT_00B_HERBAL_PURPOSE: 'constitution' },
    expect: { profile: 'herbal', hasPain: false, hasSystemic: true },
  },
  {
    n: '13: Non-pain primary + Pain as Additional module',
    patch: { VISIT_00_INTENT: 'symptom_consult', VISIT_02_SYMPTOM_MAIN: 'sleep', ADDITIONAL_DETAIL_01: 'pain' },
    expect: { profile: 'pain', hasPain: true, hasSystemic: false },
  },
  {
    n: '14: Non-pain primary + Pain Additional + expanded',
    patch: {
      VISIT_00_INTENT: 'herbal',
      VISIT_00B_HERBAL_PURPOSE: 'symptom',
      VISIT_02_SYMPTOM_MAIN: 'sleep',
      ADDITIONAL_DETAIL_01: 'pain',
    },
    expect: { profile: 'mixed', hasPain: true, hasSystemic: true },
  },
  {
    n: '15: Neither pain nor expanded (plain symptom_consult)',
    patch: { VISIT_00_INTENT: 'symptom_consult', VISIT_02_SYMPTOM_MAIN: 'sleep' },
    expect: { profile: 'herbal', hasPain: false, hasSystemic: false },
  },
  {
    n: '16: Malformed/absent routing fields (empty Responses)',
    patch: {},
    expect: { profile: 'herbal', hasPain: false, hasSystemic: false },
  },
]

for (const { n, patch, expect } of CASES) {
  const r = { ...emptyResponses(), ...patch }
  const canonical = coreSpec.doctorViewProfile(r)
  const basis = deriveViewProfile(fakePayload(r))

  assert(`${n}: doctorViewProfile() (canonical) resolves to ${expect.profile}`, canonical === expect.profile)
  assert(
    `${n}: deriveViewProfile() (DoctorView-side) matches canonical exactly`,
    basis.derived === canonical,
  )
  assert(`${n}: hasPainContent === ${expect.hasPain}`, basis.hasPainContent === expect.hasPain)
  assert(`${n}: hasSystemicContent === ${expect.hasSystemic}`, basis.hasSystemicContent === expect.hasSystemic)

  // Generic (not per-row hardcoded) invariants 1-2 from the governing task:
  if (basis.hasPainContent) {
    assert(`${n}: hasPainContent=true never resolves to herbal`, basis.derived !== 'herbal')
  }
  if (basis.hasSystemicContent) {
    assert(`${n}: hasSystemicContent=true never resolves to pain`, basis.derived !== 'pain')
  }
}

console.log(`\n${passCount} view_profile matrix assertions passed (${CASES.length} cases).`)
