# ANKLE_FOOT_V1 — Integration Report

작성일: 2026-08-26  
브랜치: `clinical/ankle-foot-v1-review`  
임상 상태: **PASS / CLINICAL DECISIONS CLOSED**  
통합 상태: **ANKLE_FOOT_V1: PASS / FROZEN**

## 1. CLOSED source of truth

- `docs/ANKLE_FOOT_V1_Evidence_Matrix_v0.1_HANDOFF.md`
- `docs/ANKLE_FOOT_V1_Clinical_Decisions_v1.0_CLOSED.md`
- `docs/ANKLE_FOOT_V1_Tablet_Question_Set_v0.1.md`
- `docs/ANKLE_FOOT_V1_Final_Verification_v1.0_CLOSED.md`
- `docs/ANKLE_FOOT_V1_Fable_Integration_Plan_v0.1.md`

A1–A8은 사용자 승인 그대로 CLOSED되었으며 구현 단계에서 임상 threshold를 추가하거나 재해석하지 않았다.

## 2. Production integration

- `src/spec/ankleFootLogic.ts` — pure CLOSED safety engine
- `src/spec/ankleFootAdapter.ts` — strict runtime validation / fail-closed adapter
- `src/spec/coreSpec.ts` — `PAIN_01 == leg_foot` routing, AF_00, AF_01–AF_08, safety payload, StaffCheck integration
- `src/doctor/AnkleFootSafetyPanel.tsx` — presentation-only doctor panel
- `src/doctor/DoctorView.tsx` — panel import/render only
- `src/doctor/ankleFootFixtures.ts` — production-builder-backed clear/review/urgent fixtures
- `tests/ankle-foot.spec.mjs`
- `tests/ankle-foot-malformed.spec.mjs`
- `tests/ankle-foot-doctor-panel.spec.mjs`
- `tests/ankle-foot-doctor-integration.spec.mjs`
- `tests/integration.spec.mjs`
- `package.json`

## 3. Routing invariants

- `IS_PRIMARY_ANKLE_FOOT = pain && PAIN_01 === 'leg_foot'`.
- `AF_00` valid regions: `LOWER_LEG_CALF / ANKLE / HEEL_POSTERIOR_ANKLE / FOOT_TOES / DIFFUSE_OR_MULTIPLE / UNKNOWN`.
- All valid AF_00 values expose protected ANKLE_FOOT safety.
- `AF_00` is visibility/tagging only and never directly determines safety tier.
- AF_04, AF_05, AF_07 are conditional protected questions and only fail closed when actually shown.

## 4. CLOSED safety invariants implemented

- Acute major distal neuro loss after trauma can independently produce `URGENT_REVIEW`.
- Weight-bearing/4-step history is a fracture review signal only; tablet never computes Ottawa Ankle/Foot Rule.
- Patient-noticed plantar midfoot bruising is supportive history only; no objective Lisfranc sign/diagnosis is generated.
- Either Achilles history signal alone produces `REVIEW_REQUIRED + achilles_rupture_assessment_required + expedited_referral_consider`; Thompson test remains clinician-side.
- Localized stable infection concern is REVIEW; systemic/rapidly worsening or severe ischaemia/deep infection/gangrene concern is URGENT.
- New unilateral calf/lower-leg swelling-pain pattern produces `REVIEW_REQUIRED + dvt_assessment_required`; Wells remains clinician-side.
- Non-traumatic new/progressive distal neurologic symptom produces REVIEW + neuro assessment + expedited consideration.
- Protected malformed/missing/empty/exclusivity failures are fail-closed; optional phenotype fields do not create false escalation.

## 5. Runtime validation contract

The adapter validates runtime values rather than casting arbitrary strings into TypeScript unions:

- single-choice allowlists
- multi-choice allowlists
- NONE/UNKNOWN exclusivity
- empty multi-select != NONE
- malformed != valid negative
- UNKNOWN != NO
- conditional protected missing/empty only escalates when shown

Dedicated malformed regression was present from the first implementation.

## 6. StaffCheck / chart boundaries

- Only AF_02 / AF_06 engine outcomes that are `URGENT_REVIEW` are wired to immediate StaffCheck.
- Review-tier Achilles/DVT/fracture patterns do not create an urgent interstitial by themselves.
- Doctor fixtures validate payload/presentation; raw-response StaffCheck behavior is independently covered in `tests/integration.spec.mjs`.
- Patient answers never generate Ottawa positive/negative, Wells score, Thompson result, objective neurovascular findings, imaging interpretation, or diagnosis.

## 7. Verification

Latest implementation head before this report: `3513273a4ea705bc6cc00a309fa64532a1357c41`.

GitHub Actions CI **#91**, `build-and-test`: **SUCCESS**.

Verified in that run:

- `tsc -b && vite build`: PASS, 124 modules transformed
- base integration: 625/0
- ANKLE_FOOT core integration additions: 9/0
- layout: 7/0
- saju: 93 passed
- doctor: 331/0
- server: 174 passed
- recorder: 19/0
- patient: 46/0
- emr summary: 14/0
- doctor token: 5/0
- LBP: 46/0
- NECK: 81/0
- SHOULDER: 38/0
- KNEE: 60/0
- ELBOW: 67/0
- WRIST_HAND: 79/0 + malformed 8/0
- ANKLE_FOOT engine: 22/0
- ANKLE_FOOT malformed: 10/0
- ANKLE_FOOT standalone doctor panel: 8/0
- ANKLE_FOOT integrated doctor regression: 5/0
- tablet core Python: PASS

A first version of the new doctor integration test incorrectly asserted navigation state from a presentation fixture payload. CI #90 caught that test-contract error. The test was corrected without changing production or clinical logic; CI #91 then passed completely. StaffCheck itself was already independently passing in raw-response integration coverage.

## 8. Frozen zero-regression

`main...clinical/ankle-foot-v1-review` compare shows no changes to existing CLOSED/FROZEN logic/adapter/judgment files for LBP, NECK, SHOULDER, KNEE, ELBOW, WRIST_HAND or clinician judgment logic. Existing frozen module regression counts all remain green.

## 9. Definition of Done

- [x] A1–A8 clinically CLOSED
- [x] Tablet question set
- [x] final clinical verification
- [x] Fable integration plan
- [x] pure logic + strict adapter
- [x] core routing/payload/StaffCheck integration
- [x] DoctorView panel + production-builder fixtures
- [x] malformed regression
- [x] integrated doctor regression
- [x] existing frozen modules zero-regression
- [x] latest implementation CI success

**Final verdict: `ANKLE_FOOT_V1: PASS / FROZEN`.**

This report commit itself is documentation-only. Merge remains gated on a successful required `build-and-test` for the final PR head and unchanged head SHA.