# Pain exam recommendation rule template

Status: **DRAFT / UNAPPROVED**. This document defines the schema clinicians
will use to author real `patient_fact → suggested_exam` mappings for the Pain
Workspace's "지금 확인할 것" section
(`src/doctor/workspace/examSuggestion.ts`'s `PhysicalExamSuggestion`).

**No row in this file is authoritative clinical logic.** The one example row
below exists only to show the schema in use and is explicitly marked
`EXAMPLE ONLY — NOT CLINICAL LOGIC`. Implementing code must never read this
file as data — a future PR that wires real rules will do so through a
reviewed, versioned data structure populated by a clinician, following this
schema.

## Fields

| field | type | meaning |
|---|---|---|
| `rule_id` | string | Stable unique id, never reused after retirement (e.g. `PAIN_LBP_SLR_001`). |
| `region` | string | Which regional module this applies to (`LBP`, `NECK`, `SHOULDER`, `KNEE`, `ELBOW`, `WRIST_HAND`, `ANKLE_FOOT`, `HIP`, `TMJ`, or `GENERAL` for cross-region). |
| `patient_fact_conditions` | string[] | The exact already-computed patient facts/flags that trigger this suggestion (question ids and/or `*Logic.ts` computed field names — never a freeform clinical description). |
| `suggested_exam` | string | The exam/test name to suggest (plain label, matches `PhysicalExamSuggestion.title`). |
| `priority` | `MUST_CHECK` \| `CONTEXTUAL` | Matches `ExamPriority` in `examSuggestion.ts`. |
| `reason_text` | string | Short "왜 확인?" explanation shown to the clinician — must cite only the `patient_fact_conditions` above, never assert a diagnosis. |
| `contraindication_safety_dependency` | string \| null | Any existing FROZEN safety flag this rule must defer to or never override (e.g. "never show if `lbp_safety_status === 'URGENT_REVIEW'` already covers this"). |
| `source_evidence` | string | Citation/rationale the approving clinician provides (textbook, guideline, internal protocol). Required before `clinical_status` can move past `DRAFT`. |
| `clinical_status` | `DRAFT` \| `UNAPPROVED` \| `APPROVED` \| `RETIRED` | Governance state. Only `APPROVED` rows may ever be wired into production code, and only after this document (or its successor) is reviewed by the approving clinician. |
| `approved_by` | string \| null | Clinician name/id who approved this row. Required when `clinical_status === 'APPROVED'`. |
| `version` | string | Semantic version of this specific rule row, bumped on any change to its conditions/exam/priority. |

## Example row (schema demonstration only)

| rule_id | region | patient_fact_conditions | suggested_exam | priority | reason_text | contraindication_safety_dependency | source_evidence | clinical_status | approved_by | version |
|---|---|---|---|---|---|---|---|---|---|---|
| `PAIN_LBP_SLR_EXAMPLE` | LBP | `["LBP_02 includes NUMBNESS or TINGLING", "leg_symptom_present === 'YES'"]` | SLR(하지직거상) 검사 | MUST_CHECK | 다리 저림 증상이 보고되어 신경학적 소견 확인이 필요합니다 | 이미 `lbp_safety_status === 'URGENT_REVIEW'`인 경우 안전 배너가 우선 | *(EXAMPLE ONLY — NOT CLINICAL LOGIC, no citation provided)* | DRAFT | null | 0.0.1-example |

## Process to move a row past DRAFT

1. Clinician (원장) drafts or reviews the row using this schema, including `source_evidence`.
2. A second clinician or the practice's designated reviewer confirms.
3. `clinical_status` is set to `APPROVED` and `approved_by` is filled in.
4. Only then does an engineering PR wire the row into a real
   `patient_fact_conditions → PhysicalExamSuggestion[]` mapping function,
   with tests proving the mapping matches this table exactly.
5. Any later edit to an `APPROVED` row requires steps 1-3 again and a version bump.

No engineering session should populate this table with real rules or move a
row past `DRAFT`/`UNAPPROVED` on its own judgment.
