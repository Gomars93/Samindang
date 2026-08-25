# ANKLE_FOOT_V1 — Fable Integration Plan v0.1

작성일: 2026-08-26
상태: **FABLE INTEGRATION PLAN COMPLETE / IMPLEMENTATION READY**

Authoritative inputs:
- `ANKLE_FOOT_V1_Clinical_Decisions_v1.0_CLOSED.md`
- `ANKLE_FOOT_V1_Tablet_Question_Set_v0.1.md`
- `ANKLE_FOOT_V1_Final_Verification_v1.0_CLOSED.md`

## Architecture

Follow existing two-layer protected-safety pattern used by ELBOW/WRIST_HAND.

New files:
- `src/spec/ankleFootLogic.ts` — pure state -> flags computation; no `Responses` access.
- `src/spec/ankleFootAdapter.ts` — strict runtime validation/normalization from `Responses` into typed state.
- `tests/ankle-foot.spec.mjs` — truth-table + routing + flags.
- `tests/ankle-foot-malformed.spec.mjs` — malformed/out-of-allowlist/exclusivity regression from first commit.

Existing files to integrate:
- `src/spec/coreSpec.ts` — AF_00 + questions, entry gate, payload, staff interrupt for urgent state, module flag.
- `src/doctor/DoctorView.tsx` — ANKLE_FOOT safety panel + suggested exam labels; patient answers remain S/O-S only.
- `src/doctor/fixtures.ts` — clear/review/urgent fixtures.
- `tests/integration.spec.mjs`, `tests/doctor.spec.mjs`, `package.json`.

## Routing

`IS_PRIMARY_ANKLE_FOOT = IS_PRIMARY_PAIN(r) && r['PAIN_01'] === 'leg_foot'`.

All valid AF_00 values expose ANKLE_FOOT protected safety. AF_00 never enters the logic state and never directly determines safety tier.

## Logic outputs

Minimum module outputs:
- `ankle_foot_safety_status`: `CLEAR | REVIEW_REQUIRED | URGENT_REVIEW`
- `fracture_imaging_consider`
- `achilles_rupture_assessment_required`
- `infection_assessment_required`
- `dvt_assessment_required`
- `neuro_assessment_required`
- `expedited_referral_consider`
- optional `loading_exercise_lock` only where supported by the CLOSED question contract; do not invent new clinical thresholds.

Precedence: URGENT > REVIEW > CLEAR.

## Mandatory runtime contract

Adapter must use explicit allowlists for every protected single-choice and multi-choice value. Empty multi-choice is not NONE. NONE/UNKNOWN + positive is invalid. Shown protected missing/malformed/invalid -> minimum REVIEW. Conditional shown-state must be supplied explicitly so hidden questions do not fail-closed.

## Critical regression cases

- acute trauma + major distal deficit -> URGENT
- weight-bearing/4-step positive -> REVIEW + fracture imaging, no Ottawa score
- plantar bruising alone remains supportive S only
- either Achilles OR item alone -> REVIEW + Achilles assessment + expedited
- SYSTEMIC_OR_RAPIDLY_WORSENING -> URGENT by opaque OR enum
- unilateral calf pattern -> REVIEW + DVT assessment, no Wells
- malformed protected single choice / empty protected multi choice -> not CLEAR
- all pre-existing LBP/NECK/SHOULDER/KNEE/ELBOW/WRIST_HAND regression suites unchanged.

## Definition of Done

TypeScript build clean; module + malformed + integration + DoctorView tests pass; full `test:all` and tablet-core Python tests pass; frozen logic/adapter/judgment files zero-diff; integration report records exact head SHA and CI result; only then mark PASS/FROZEN and Ready for Review.
