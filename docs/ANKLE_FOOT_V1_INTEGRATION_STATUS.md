# ANKLE_FOOT_V1 — Integration Status

작성일: 2026-08-26
상태: **INTEGRATION IN PROGRESS / CLINICAL DECISIONS CLOSED**

## Closed clinical contract

A1–A8 are approved exactly as recommended and recorded in `ANKLE_FOOT_V1_Clinical_Decisions_v1.0_CLOSED.md`. Tablet v0.1, final verification, and Fable integration plan are complete.

## Completed implementation

- `src/spec/ankleFootLogic.ts` — pure CLOSED safety engine
- `src/spec/ankleFootAdapter.ts` — strict runtime allowlist/exclusivity validation
- `src/spec/coreSpec.ts` — `PAIN_01 == leg_foot` routing, `AF_00`, protected question visibility, payload/safety/module integration, urgent StaffCheck wiring
- `tests/ankle-foot.spec.mjs` — engine truth table
- `tests/ankle-foot-malformed.spec.mjs` — malformed/empty/exclusivity fail-closed regression
- `tests/integration.spec.mjs` — production payload/routing integration coverage
- `package.json` — module test wiring

## Latest verification

Current branch head before this status-only commit: `c681e63a7f9101c57ae71f3b9fe048bafa636771`.

GitHub Actions CI #75 (`build-and-test`): **SUCCESS**.

This verifies build, full JS/TS test suite at that head, and tablet-core Python tests.

## Remaining Definition of Done

The following are still required before PASS/FROZEN / Ready / merge:

1. `src/doctor/DoctorView.tsx`
   - import ankle-foot engine/adapter
   - render a dedicated ANKLE_FOOT safety panel when `safety_flags.ankle_foot !== null`
   - show safety tier plus fracture imaging, Achilles, infection, DVT, neuro, expedited flags
   - suggested exams must remain clinician-assessment labels only; no Ottawa/Wells/Thompson auto-result
2. `src/doctor/fixtures.ts`
   - clear / review / urgent fixtures, including DVT/Achilles or fracture-review coverage
3. `tests/doctor.spec.mjs`
   - panel rendering and safety-chip regression
   - verify patient history never becomes clinician objective finding or diagnosis
4. Frozen-module zero-diff verification for all existing CLOSED/FROZEN logic/adapter/judgment files
5. Final full regression + latest-head CI SUCCESS
6. Replace this status file or add final `ANKLE_FOOT_V1_INTEGRATION_REPORT.md`, mark `PASS / FROZEN`, then Ready for Review

## Non-negotiable boundaries

- `AF_00` is routing/tagging only and never determines safety tier.
- Tablet never computes Ottawa Ankle/Foot Rule, Wells score, Thompson result, objective neurovascular findings, imaging interpretation, or diagnosis.
- Existing CLOSED/FROZEN module thresholds must not change.
- Protected malformed/missing/empty/exclusivity failures remain fail-closed.
