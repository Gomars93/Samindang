# ANKLE_FOOT_V1 — Integration Status

작성일: 2026-08-26
상태: **INTEGRATION IN PROGRESS / CLINICAL DECISIONS CLOSED**

## Closed clinical contract

A1–A8 are approved exactly as recommended and recorded in `ANKLE_FOOT_V1_Clinical_Decisions_v1.0_CLOSED.md`. Tablet v0.1, final verification, and Fable integration plan are complete.

## Completed implementation

- `src/spec/ankleFootLogic.ts` — pure CLOSED safety engine
- `src/spec/ankleFootAdapter.ts` — strict runtime allowlist/exclusivity validation
- `src/spec/coreSpec.ts` — `PAIN_01 == leg_foot` routing, `AF_00`, protected question visibility, payload/safety/module integration, urgent StaffCheck wiring
- `src/doctor/AnkleFootSafetyPanel.tsx` — presentation-only doctor safety panel; recomputes CLOSED flags from payload and preserves Ottawa/Wells/Thompson/chart boundaries
- `tests/ankle-foot.spec.mjs` — engine truth table
- `tests/ankle-foot-malformed.spec.mjs` — malformed/empty/exclusivity fail-closed regression
- `tests/integration.spec.mjs` — production payload/routing integration coverage
- `tests/ankle-foot-doctor-panel.spec.mjs` — standalone SSR regression for clear/Achilles/DVT/not-applicable states
- `package.json` — module + standalone doctor-panel test wiring into `test:all`

## Verification history

- Core/integration head `c681e63a7f9101c57ae71f3b9fe048bafa636771`: CI #75 `build-and-test` **SUCCESS**.
- Status head `dedf021f2fe0ad5a32abdb301a19ec0de135b8d1`: CI #76 `build-and-test` **SUCCESS**.
- Latest doctor-panel head must pass CI before it can be used as merge evidence.

## Remaining Definition of Done

The following are still required before PASS/FROZEN / Ready / merge:

1. Minimal `src/doctor/DoctorView.tsx` wiring
   - import `AnkleFootSafetyPanel`
   - render it once alongside the other protected MSK safety panels when its payload flag is non-null (the component itself enforces this gate)
2. `src/doctor/fixtures.ts`
   - clear / review / urgent fixtures, including DVT/Achilles or fracture-review coverage
3. `tests/doctor.spec.mjs`
   - integrated DoctorView rendering regression in addition to the standalone panel regression
   - verify patient history never becomes clinician objective finding or diagnosis
4. Frozen-module zero-diff verification for all existing CLOSED/FROZEN logic/adapter/judgment files
5. Final full regression + latest-head CI SUCCESS
6. Add final `ANKLE_FOOT_V1_INTEGRATION_REPORT.md`, mark `PASS / FROZEN`, then Ready for Review

## Non-negotiable boundaries

- `AF_00` is routing/tagging only and never determines safety tier.
- Tablet/DoctorView never computes Ottawa Ankle/Foot Rule, Wells score, Thompson result, objective neurovascular findings, imaging interpretation, or diagnosis.
- Existing CLOSED/FROZEN module thresholds must not change.
- Protected malformed/missing/empty/exclusivity failures remain fail-closed.
