# TMJ_V1 — Fable Integration Plan v0.1

작성일: 2026-08-26
상태: **FABLE INTEGRATION PLAN COMPLETE / IMPLEMENTATION READY**

Authoritative inputs:
- `TMJ_V1_Clinical_Decisions_v1.0_CLOSED.md`
- `TMJ_V1_Tablet_Question_Set_v0.1.md`
- `TMJ_V1_Final_Verification_v1.0_CLOSED.md`

## Architecture

Create an independent TMJ/facial protected-safety engine under the existing `head_face_jaw` pain population. Do not add HEADACHE_V1 thresholds.

New files:
- `src/spec/tmjLogic.ts`
- `src/spec/tmjAdapter.ts`
- `tests/tmj.spec.mjs`
- `tests/tmj-malformed.spec.mjs`

Integration files:
- `src/spec/coreSpec.ts` — HFJ_00 + TMJ questions, protected gate, payload, urgent staff interrupt.
- `src/doctor/DoctorView.tsx` — TMJ/facial safety panel, suggested clinician checks only.
- `src/doctor/fixtures.ts`
- `tests/integration.spec.mjs`, `tests/doctor.spec.mjs`, `package.json`.

## Routing

Population: existing `PAIN_01 == head_face_jaw`.

Protected TMJ/facial safety exposure for:
`JAW_TMJ_MASTICATORY / FACIAL_NEURALGIC / DENTAL_OR_ORAL / DIFFUSE_OR_MULTIPLE / UNKNOWN`.

`HEADACHE_CRANIAL` excludes TMJ-specific protected questions but retains Core global safety. HFJ_00 is visibility/tagging only and must not enter the pure safety tier computation.

## Outputs

- `tmj_safety_status`: `CLEAR | REVIEW_REQUIRED | URGENT_REVIEW`
- `trauma_or_dislocation_assessment_required`
- `dental_or_oral_assessment_required`
- `infection_assessment_required`
- `gca_assessment_required`
- `neuro_assessment_required`
- `expedited_referral_consider`

## Critical invariants

- Current unreduced abnormal jaw position, severe deforming trauma, uncontrolled heavy oral bleeding, and breathing/swallowing compromise are independent URGENT sources.
- Trauma + bite/function change without emergency feature is REVIEW only.
- Dental/oral emergency and localized infection tiers remain separate; no abscess auto-diagnosis.
- GCA age modifier uses final payload birth data; age>=50 + compatible jaw/scalp-temporal pattern -> REVIEW+GCA+expedited; compatible pattern + visual disturbance -> URGENT. Age unknown is not a valid negative.
- Facial numbness/focal neuro change -> REVIEW+neuro+expedited, unless Core urgent neuro pathway dominates.
- Stable mechanical phenotype and painless click alone do not escalate when protected safety is explicitly negative.
- HEADACHE_CRANIAL must not inherit invented TMJ or headache thresholds.
- Strict runtime allowlists/exclusivity and malformed regression mandatory from first commit.

## Chart boundary

Patient responses may populate C/C, O/S, S only. Objective ROM, occlusion, cranial nerve, dental examination, imaging or definitive diagnosis requires clinician-confirmed input.

## Definition of Done

Build clean; TMJ + malformed + integration + doctor tests pass; full JS/TS and tablet-core Python pass; frozen clinical files remain zero-diff; final integration report captures exact head and CI; only then PASS/FROZEN and Ready for Review.
