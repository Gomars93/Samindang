# HIP_V1 — Tablet Question Set v0.1

작성일: 2026-08-26
상태: **FINAL CANDIDATE / FINAL VERIFICATION REQUIRED**
기준: `HIP_V1_Clinical_Decisions_v1.0_CLOSED.md`

## 1. Entry / routing

Entry population remains existing `PAIN_01 === low_back_pelvis`; existing FROZEN LBP safety stays visible and computed for the entire population.

`HIP_00` single_choice, required when entry true:
- `LOW_BACK_DOMINANT`
- `BUTTOCK_PELVIS_DOMINANT`
- `HIP_GROIN_DOMINANT`
- `SIMILAR_OR_MULTIPLE`
- `UNKNOWN`

HIP protected questions are shown only for `BUTTOCK_PELVIS_DOMINANT / HIP_GROIN_DOMINANT / SIMILAR_OR_MULTIPLE / UNKNOWN`. `HIP_00` is routing/tagging only and never creates a safety tier.

## 2. Protected safety questions

### HIP_01 — recent trauma
single_choice required: `YES / NO / UNKNOWN`

“최근 넘어지거나 부딪히거나 사고를 당하는 등 엉덩관절·골반 부위를 다친 일이 있었나요?”

### HIP_02 — limb-threatening / major acute deficit
multi_choice required, exclusive `[NONE, UNKNOWN]`:
- `GROSS_DEFORMITY_OR_JOINT_STUCK_OUT_OF_POSITION`
- `SEVERE_OPEN_INJURY_OR_HEAVY_BLEEDING`
- `NEW_MAJOR_DISTAL_NUMBNESS_OR_WEAKNESS_AFTER_TRAUMA`
- `FOOT_COLD_PALE_BLUE_OR_SEVERE_CIRCULATION_CHANGE`
- `NONE`
- `UNKNOWN`

Any concrete positive → `URGENT_REVIEW`.

### HIP_03 — post-traumatic hip/groin pain and walking difficulty
single_choice required when `HIP_01 == YES`:
- `NO_MARKED_WALKING_DIFFICULTY`
- `MARKED_WEIGHT_BEARING_OR_WALKING_DIFFICULTY`
- `UNKNOWN`

Concrete marked difficulty → `REVIEW_REQUIRED + fracture_imaging_consider + expedited_referral_consider`, unless HIP_02 already creates urgent status.

### HIP_03A — prior imaging context
single_choice optional when HIP_03 is positive/unknown:
- `NOT_DONE_OR_UNKNOWN`
- `DONE_TOLD_NORMAL`
- `DONE_TOLD_ABNORMAL`

Context only. It never lowers safety or suppresses fracture imaging consideration and never becomes objective imaging data.

### HIP_04 — femoral-neck stress-fracture compatible pattern
multi_choice required for protected HIP route, exclusive `[NONE, UNKNOWN]`:
- `ATRAUMATIC_OR_INSIDIOUS_DEEP_HIP_OR_GROIN_PAIN`
- `RECENT_REPETITIVE_LOAD_RUNNING_JUMPING_MARCH_OR_LOAD_INCREASE`
- `PROGRESSIVE_WEIGHT_BEARING_PAIN_OR_WORSENING_WALKING_TOLERANCE`
- `NONE`
- `UNKNOWN`

Protected concern requires a compatible pattern spanning the approved elements: deep/hip-groin atraumatic-insidious pain + repetitive load increase + progressive weight-bearing/walking intolerance. When present → `REVIEW_REQUIRED + stress_fracture_assessment_required + fracture_imaging_consider`; routine loading exercise is locked pending clinician assessment. Tablet must not diagnose a stress fracture.

### HIP_05 — serious infection screen
single_choice required:
- `NO_CONCERN`
- `LOCALIZED_STABLE_CONCERN`
- `SYSTEMIC_OR_RAPIDLY_WORSENING`
- `UNKNOWN`

`SYSTEMIC_OR_RAPIDLY_WORSENING` is one opaque OR enum: concrete positive → `URGENT_REVIEW + infection_assessment_required`. `LOCALIZED_STABLE_CONCERN` → `REVIEW_REQUIRED + infection_assessment_required`. Fever absence never rules out infection.

### HIP_06 — non-traumatic progressive neurologic deficit
single_choice required:
- `NO`
- `NEW_OR_PROGRESSIVE_DISTAL_NUMBNESS_OR_WEAKNESS`
- `UNKNOWN`

Without acute trauma, concrete positive → `REVIEW_REQUIRED + neuro_assessment_required + expedited_referral_consider`.

## 3. Optional phenotype/context

Optional phenotype questions may collect groin vs lateral hip vs buttock distribution, activity relation, clicking/catching, stiffness, prior diagnosis/treatment and load sensitivity. These fields do not independently create a safety tier and missing optional phenotype never escalates.

## 4. LBP zero-regression contract

- `IS_PRIMARY_LBP` and LBP question visibility stay unchanged.
- HIP_GROIN route does not hide any LBP protected question.
- LBP engine and HIP engine compute independently.
- DoctorView may render both panels.
- No HIP flag may suppress or downgrade an LBP flag.

## 5. Fail-closed contract

Protected `UNKNOWN`, shown missing, malformed, out-of-allowlist, empty multi-select, or exclusive mixed selection is not a valid negative. Shown protected invalid → minimum `REVIEW_REQUIRED`; conditional missing/empty escalation occurs only when the question is actually shown. Optional phenotype missing does not escalate.

## 6. Chart boundary

Patient responses populate C/C, O/S and S only. Do not auto-create objective ROM, gait, neurologic exam, imaging result, provocative-test result or definitive diagnosis.

## 7. Regression contract

Initial implementation must include strict single-choice runtime allowlists, multi-choice allowlist/exclusivity validation, malformed-input regression tests, and zero-regression tests for all existing CLOSED/FROZEN modules—especially LBP simultaneous exposure.
