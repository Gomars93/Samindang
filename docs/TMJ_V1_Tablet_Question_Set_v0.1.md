# TMJ_V1 — Tablet Question Set v0.1

작성일: 2026-08-26
상태: **FINAL CANDIDATE / FINAL VERIFICATION REQUIRED**
기준: `TMJ_V1_Clinical_Decisions_v1.0_CLOSED.md`

## 1. Entry / routing

Entry: existing `PAIN_01 === head_face_jaw`.

`HFJ_00` single_choice, required:
- `JAW_TMJ_MASTICATORY`
- `HEADACHE_CRANIAL`
- `FACIAL_NEURALGIC`
- `DENTAL_OR_ORAL`
- `DIFFUSE_OR_MULTIPLE`
- `UNKNOWN`

TMJ/facial protected questions are shown for every route except `HEADACHE_CRANIAL`. `HFJ_00` is visibility/tagging only and never creates a safety tier. Core global safety remains active for every route.

## 2. Protected safety questions

### TMJ_01 — trauma / current lock / severe injury
multi_choice, required, exclusive `[NONE, UNKNOWN]`:
- `JAW_CURRENTLY_STUCK_OPEN_OR_ABNORMAL_POSITION`
- `SEVERE_FACIAL_OR_JAW_TRAUMA_WITH_GROSS_DEFORMITY`
- `UNCONTROLLED_HEAVY_ORAL_BLEEDING`
- `BREATHING_OR_SWALLOWING_COMPROMISE_WITH_SWELLING_OR_INJURY`
- `TRAUMA_WITH_NEW_BITE_CHANGE_OR_MARKED_FUNCTION_LOSS`
- `NONE`
- `UNKNOWN`

First four concrete positives → standalone `URGENT_REVIEW` (OR semantics).
`TRAUMA_WITH_NEW_BITE_CHANGE_OR_MARKED_FUNCTION_LOSS` alone → `REVIEW_REQUIRED + trauma_or_dislocation_assessment_required`, not automatic urgent.

### TMJ_02 — dental/oral infection pattern
single_choice, required:
- `NO_CONCERN`
- `LOCALIZED_TOOTH_OR_GUM_PAIN_SWELLING_OR_PUS_TASTE`
- `FEVER_WITH_LOCALIZED_DENTAL_OR_ORAL_CONCERN`
- `LARGE_OR_SPREADING_SWELLING_OR_SEVERE_SYSTEMIC_ILLNESS`
- `EYE_AIRWAY_OR_SWALLOW_COMPROMISE`
- `UNKNOWN`

`LARGE_OR_SPREADING...` or `EYE_AIRWAY_OR_SWALLOW_COMPROMISE` → `URGENT_REVIEW + infection_assessment_required`.
Localized/fever categories without emergency features → `REVIEW_REQUIRED + dental_or_oral_assessment_required + infection_assessment_required`.
Patient response never creates a dental-abscess diagnosis.

### TMJ_03 — GCA-compatible history
multi_choice, required, exclusive `[NONE, UNKNOWN]`:
- `NEW_JAW_CLAUDICATION_WITH_CHEWING`
- `NEW_SCALP_OR_TEMPORAL_PAIN_TENDERNESS_PATTERN`
- `NEW_TRANSIENT_VISUAL_DISTURBANCE_DIPLOPIA_OR_VISUAL_LOSS`
- `NONE`
- `UNKNOWN`

Age modifier is applied only at final payload using existing birth data.
- age >= 50 + (`NEW_JAW_CLAUDICATION...` OR `NEW_SCALP_OR_TEMPORAL...`) → `REVIEW_REQUIRED + gca_assessment_required + expedited_referral_consider`
- same compatible pattern + visual disturbance → `URGENT_REVIEW`
- age unknown must not be treated as negative; shown protected UNKNOWN/missing remains fail-closed.
No automatic GCA diagnosis.

### TMJ_04 — facial neurologic concern
single_choice, required:
- `NO`
- `NEW_OR_PERSISTENT_FACIAL_NUMBNESS_OR_FOCAL_NEURO_CHANGE`
- `UNKNOWN`

Concrete positive → `REVIEW_REQUIRED + neuro_assessment_required + expedited_referral_consider`. Existing Core acute neurologic emergency remains higher priority.

### TMJ_05 — current functional locking
single_choice, required:
- `NO_CURRENT_FIXED_LOCK`
- `CURRENTLY_LOCKED_AND_CANNOT_OPEN_OR_CLOSE_NORMALLY`
- `UNKNOWN`

Concrete fixed lock → `REVIEW_REQUIRED + trauma_or_dislocation_assessment_required`; if TMJ_01 indicates unreduced abnormal position, urgent status takes precedence.

## 3. Optional mechanical phenotype

Optional fields may collect chewing pain, stiffness, painful click/pop, painless click, intermittent resolving lock, clenching/grinding and duration. These are supportive phenotype only.

Protected safety explicitly negative + stable mechanical phenotype alone → no safety escalation. Painless click alone never escalates. Optional phenotype missing never escalates and no TMD subtype diagnosis is auto-created.

## 4. Fail-closed contract

For protected fields: `UNKNOWN != NO`; shown missing/malformed/out-of-allowlist/empty multi-choice/exclusive mixed selection is not a valid negative and must yield at least `REVIEW_REQUIRED` unless an urgent concrete positive already dominates. Conditional protected missing/empty escalates only when shown. Initial implementation requires runtime allowlists/exclusivity and malformed regression.

## 5. Chart boundary

Patient responses may populate C/C, O/S and S only. Objective jaw ROM, occlusion, cranial-nerve findings, dental examination, imaging and definitive diagnoses require clinician-confirmed data before appearing in O.

## 6. HEADACHE boundary

`HFJ_00 == HEADACHE_CRANIAL` does not show TMJ-specific protected safety; it remains covered by Core global safety and is reserved for future HEADACHE_V1 design. TMJ_V1 must not introduce dedicated headache thresholds indirectly.
