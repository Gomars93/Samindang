# ANKLE_FOOT_V1 — Tablet Question Set v0.1

작성일: 2026-08-26
상태: **FINAL CANDIDATE / FINAL VERIFICATION REQUIRED**
기준: `ANKLE_FOOT_V1_Clinical_Decisions_v1.0_CLOSED.md`

## 1. Entry / routing

Entry: existing `PAIN_01 === leg_foot`.

`AF_00` single_choice, required when entry is true:
- `LOWER_LEG_CALF` — 종아리·아래다리
- `ANKLE` — 발목
- `HEEL_POSTERIOR_ANKLE` — 뒤꿈치·발목 뒤쪽
- `FOOT_TOES` — 발·발가락
- `DIFFUSE_OR_MULTIPLE` — 여러 부위가 비슷하게 불편함
- `UNKNOWN` — 잘 모르겠어요

Protected ANKLE_FOOT questions are shown for every valid `AF_00` value above. `AF_00` itself is routing/tagging only and never creates a safety tier.

## 2. Protected safety questions

### AF_01 — recent trauma
single_choice, required: `YES / NO / UNKNOWN`

“최근 넘어지거나 접질리거나 부딪히는 등 이 부위에 다친 일이 있었나요?”

### AF_02 — limb-threatening/open/neurovascular screen
multi_choice, required, exclusive `[NONE, UNKNOWN]`:
- `SEVERE_OPEN_INJURY_OR_BONE_EXPOSURE`
- `UNCONTROLLED_HEAVY_BLEEDING`
- `FOOT_COLD_PALE_BLUE_OR_SEVERE_CIRCULATION_CHANGE`
- `NEW_MAJOR_NUMBNESS_OR_WEAKNESS_AFTER_TRAUMA`
- `NONE`
- `UNKNOWN`

Any concrete positive → `URGENT_REVIEW`. `NEW_MAJOR_NUMBNESS_OR_WEAKNESS_AFTER_TRAUMA` is urgent only in the acute-trauma context; if the same deficit is reported without trauma, route through AF_08 as REVIEW+expedited.

### AF_03 — weight-bearing / 4-step history
single_choice, required when `AF_01 == YES`:
- `CAN_WALK_NORMALLY`
- `CAN_WALK_BUT_MARKED_DIFFICULTY`
- `CANNOT_BEAR_WEIGHT_OR_TAKE_4_STEPS`
- `UNKNOWN`

`CANNOT_BEAR_WEIGHT_OR_TAKE_4_STEPS` → `REVIEW_REQUIRED + fracture_imaging_consider`.
Tablet must not calculate Ottawa Ankle/Foot Rule; bony tenderness remains clinician exam.

### AF_04 — midfoot/Lisfranc supportive history
multi_choice, required when trauma + `AF_00 in [FOOT_TOES, DIFFUSE_OR_MULTIPLE, UNKNOWN]`, exclusive `[NONE, UNKNOWN]`:
- `NEW_PLANTAR_MIDFOOT_BRUISING_NOTICED`
- `MARKED_MIDFOOT_FUNCTION_OR_WEIGHT_BEARING_DIFFICULTY`
- `NONE`
- `UNKNOWN`

Acute midfoot trauma + marked dysfunction/weight-bearing difficulty → `REVIEW_REQUIRED + fracture_imaging_consider`. Plantar bruising alone is supportive S-history and must not become an objective sign or diagnosis.

### AF_05 — Achilles rupture concern
multi_choice, required when trauma/event + `AF_00 in [LOWER_LEG_CALF, ANKLE, HEEL_POSTERIOR_ANKLE, DIFFUSE_OR_MULTIPLE, UNKNOWN]`, exclusive `[NONE, UNKNOWN]`:
- `SUDDEN_POP_OR_SNAP_BEHIND_ANKLE_OR_CALF`
- `NEW_MARKED_LOSS_OF_PUSH_OFF_OR_TOE_RISE`
- `NONE`
- `UNKNOWN`

Either concrete positive (OR semantics) → `REVIEW_REQUIRED + achilles_rupture_assessment_required + expedited_referral_consider`. No automatic URGENT. Thompson test/palpable gap are clinician-only.

### AF_06 — hot/red/swollen/infection/diabetic-foot pattern
single_choice, required:
- `NO_CONCERN`
- `LOCALIZED_STABLE_RED_HOT_SWOLLEN_OR_WOUND`
- `SYSTEMIC_OR_RAPIDLY_WORSENING`
- `SEVERE_ISCHAEMIA_DEEP_INFECTION_OR_GANGRENE_CONCERN`
- `UNKNOWN`

`SYSTEMIC_OR_RAPIDLY_WORSENING` and `SEVERE_ISCHAEMIA_DEEP_INFECTION_OR_GANGRENE_CONCERN` → `URGENT_REVIEW + infection_assessment_required` (opaque OR semantics).
`LOCALIZED_STABLE...` → `REVIEW_REQUIRED + infection_assessment_required`; final computation may reuse existing diabetes/neuropathy/renal history for Charcot/diabetic-foot assessment context.

### AF_07 — DVT pattern
single_choice, required when `AF_00 in [LOWER_LEG_CALF, DIFFUSE_OR_MULTIPLE, UNKNOWN]`:
- `NO`
- `NEW_UNILATERAL_CALF_OR_LOWER_LEG_SWELLING_PAIN`
- `UNKNOWN`

Concrete positive → `REVIEW_REQUIRED + dvt_assessment_required`. Tablet never computes Wells or DVT likely/unlikely. Core chest/breathing emergency remains authoritative for PE-type symptoms.

### AF_08 — non-traumatic progressive neurologic concern
single_choice, required:
- `NO`
- `NEW_OR_PROGRESSIVE_DISTAL_NUMBNESS_OR_WEAKNESS`
- `UNKNOWN`

Concrete positive without acute trauma → `REVIEW_REQUIRED + neuro_assessment_required + expedited_referral_consider`.

## 3. Optional phenotype/context questions

Optional phenotype fields may include symptom quality, morning stiffness, activity relation, recurrent sprain, plantar heel first-step pain, chronic Achilles load pain and prior imaging. Missing optional phenotype never escalates safety and never creates a diagnosis.

## 4. Safety computation precedence

`URGENT_REVIEW > REVIEW_REQUIRED > CLEAR`.

Protected `UNKNOWN`, shown missing, malformed single-choice, empty multi-choice, out-of-allowlist value, or exclusive mixed selection (`NONE/UNKNOWN + positive`) must never resolve to CLEAR. Shown protected invalid → minimum `REVIEW_REQUIRED` and the relevant assessment flag when the invalid question belongs to a flagged safety domain. Conditional question escalates for missing/empty only when actually shown.

## 5. Chart boundary

Patient response may populate C/C, O/S and S only. Do not auto-create objective vascular/neuro/orthopedic signs, Ottawa result, Wells score, Thompson result, imaging interpretation or definitive diagnosis.

## 6. Regression contract

Initial implementation must include strict single-choice runtime allowlists, multi-choice allowlist/exclusivity validation, malformed-input regression tests, and zero-regression verification for all existing CLOSED/FROZEN modules.
