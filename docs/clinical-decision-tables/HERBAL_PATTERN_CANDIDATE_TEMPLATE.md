# Herbal pattern candidate rule template

Status: **DRAFT / UNAPPROVED**. This document defines the schema clinicians
will use to author real `patient_fact → candidate 病機/pattern` mappings for
the Herbal Workspace's "핵심 병기 후보" section
(`src/doctor/workspace/patternCandidate.ts`'s `HerbalPatternCandidate`).

**No row in this file is authoritative clinical logic.** The one example row
below exists only to show the schema in use and is explicitly marked
`EXAMPLE ONLY — NOT CLINICAL LOGIC`. This codebase does not, and this
document does not, contain a 病機/pattern inference engine. A future PR that
wires real rules will do so through a reviewed, versioned data structure
populated by a clinician, following this schema — never by an engineering
session inventing pattern logic.

## Fields

| field | type | meaning |
|---|---|---|
| `rule_id` | string | Stable unique id, never reused after retirement (e.g. `HERBAL_BIQIXU_001`). |
| `candidate_pattern` | string | The candidate pattern/mechanism display name (matches `HerbalPatternCandidate.displayName`). |
| `supporting_fact_conditions` | string[] | Already-computed patient facts (question ids / constitution fields) that support this candidate. |
| `contradicting_fact_conditions` | string[] | Already-computed patient facts that would argue against this candidate — required so the UI's "반증/주의" list is populated from something real, not invented per-render. |
| `required_clinician_checks` | string[] | Which clinician observations (tongue/pulse/abdomen/follow-up questions, matching `ClinicianObservationCategory`) are needed to confirm or rule out this candidate. |
| `reason_text` | string | Short rationale shown to the clinician — cites only the fact conditions above, never asserts a confirmed diagnosis. |
| `source_evidence` | string | Citation/rationale the approving clinician provides. Required before `clinical_status` can move past `DRAFT`. |
| `clinical_status` | `DRAFT` \| `UNAPPROVED` \| `APPROVED` \| `RETIRED` | Governance state. Only `APPROVED` rows may ever be wired into production code. |
| `approved_by` | string \| null | Clinician name/id who approved this row. Required when `clinical_status === 'APPROVED'`. |
| `version` | string | Semantic version of this specific rule row, bumped on any change. |

## Example row (schema demonstration only)

| rule_id | candidate_pattern | supporting_fact_conditions | contradicting_fact_conditions | required_clinician_checks | reason_text | source_evidence | clinical_status | approved_by | version |
|---|---|---|---|---|---|---|---|---|---|
| `HERBAL_BIQIXU_EXAMPLE` | 비기허 예시 (EXAMPLE ONLY — NOT CLINICAL LOGIC) | `["CONST_DIGESTION === 'occasional'", "SEC_FATIGUE_01 includes 'afternoon_slump'"]` | `["HERB_APPETITE === 'reduced'"]` | `["TONGUE", "PULSE"]` | 식후 더부룩함과 오후 피로가 함께 보고되어 확인이 필요합니다 | *(EXAMPLE ONLY — NOT CLINICAL LOGIC, no citation provided)* | DRAFT | null | 0.0.1-example |

## Process to move a row past DRAFT

Identical governance process to `PAIN_EXAM_RECOMMENDATION_TEMPLATE.md`:
clinician draft with evidence → second review → `APPROVED` + `approved_by` →
only then wired into a real mapping function by an engineering PR, with
tests proving the mapping matches this table exactly. Any later edit
requires the same process and a version bump.

No engineering session should populate this table with real 病機/pattern
rules or move a row past `DRAFT`/`UNAPPROVED` on its own judgment — this is
exactly the class of decision the governing task reserves for a human
clinician (症狀 → 病機 mapping is explicitly listed as something never to
invent).
