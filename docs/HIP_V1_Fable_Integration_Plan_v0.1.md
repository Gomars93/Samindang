# HIP_V1 — Fable Integration Plan v0.1

작성일: 2026-08-26
상태: **FABLE INTEGRATION PLAN COMPLETE / IMPLEMENTATION READY**

Authoritative inputs:
- `HIP_V1_Clinical_Decisions_v1.0_CLOSED.md`
- `HIP_V1_Tablet_Question_Set_v0.1.md`
- `HIP_V1_Final_Verification_v1.0_CLOSED.md`

## Architecture

Use a new independent HIP protected-safety engine layered on top of the existing `low_back_pelvis` population. Do not modify LBP logic/adapter or `IS_PRIMARY_LBP`.

New files:
- `src/spec/hipLogic.ts`
- `src/spec/hipAdapter.ts`
- `tests/hip.spec.mjs`
- `tests/hip-malformed.spec.mjs`

Integration files:
- `src/spec/coreSpec.ts` — HIP_00/questions, additive HIP gate, payload, urgent staff interrupt.
- `src/doctor/DoctorView.tsx` — HIP safety panel; simultaneous LBP + HIP panels allowed/expected.
- `src/doctor/fixtures.ts`
- `tests/integration.spec.mjs`, `tests/doctor.spec.mjs`, `package.json`.

## Routing / overlap

Existing LBP gate stays untouched for every `PAIN_01 == low_back_pelvis` patient.

New HIP-specific gate:
- population: `PAIN_01 == low_back_pelvis`
- protected HIP exposure for `HIP_00 in [BUTTOCK_PELVIS_DOMINANT, HIP_GROIN_DOMINANT, SIMILAR_OR_MULTIPLE, UNKNOWN]`
- no HIP-specific protected exposure for `LOW_BACK_DOMINANT`

HIP_00 is routing/tagging only and is excluded from the pure safety state.

## Outputs

- `hip_safety_status`: `CLEAR | REVIEW_REQUIRED | URGENT_REVIEW`
- `fracture_imaging_consider`
- `stress_fracture_assessment_required`
- `infection_assessment_required`
- `neuro_assessment_required`
- `expedited_referral_consider`
- `loading_exercise_lock` for the CLOSED stress-fracture concern only.

## Critical invariants

- Existing LBP safety questions and engine remain visible/computed even for HIP_GROIN.
- Acute traumatic major neurovascular/open/deformity signals -> URGENT.
- Post-traumatic marked walking/weight-bearing difficulty -> REVIEW + imaging + expedited, not blanket URGENT.
- Prior normal X-ray never suppresses review/imaging.
- Stress-fracture compatible pattern must implement the CLOSED multi-element condition exactly; do not broaden it to any one component alone.
- `SYSTEMIC_OR_RAPIDLY_WORSENING` is one opaque OR enum and concrete positive -> URGENT + infection assessment.
- Runtime allowlists/exclusivity and malformed regression mandatory from first commit.

## Zero-regression tests

Add critical integration assertions that `PAIN_01=low_back_pelvis + HIP_00=HIP_GROIN_DOMINANT` exposes both LBP and HIP protected safety simultaneously, and that HIP output cannot null/downgrade any LBP flag. Existing frozen module files remain zero-diff.

## Definition of Done

Build clean; HIP + malformed + integration + doctor suites pass; full JS/TS and tablet-core Python pass; frozen files zero-diff; final report captures exact head and CI; only then PASS/FROZEN and Ready for Review.
