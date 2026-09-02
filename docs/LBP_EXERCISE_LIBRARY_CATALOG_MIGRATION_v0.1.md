# LBP Exercise Library — Canonical Catalog Migration v0.1

Status: **EXPERIMENTAL CATALOG / NOT A RECOMMENDER / NOT PRODUCTION**

## 1. Why this artifact exists

The prior LBP design source (`02_요통_Clinical_OS_임상설계_및_콘텐츠_라이브러리_v0.2.docx`, 2026-08-23) already defines an exercise-library concept and a concrete domain table, but the repository previously contained only the `RehabSuggestion` shape and no machine-readable approved exercise catalog.

This migration creates stable identities for the existing source inventory **before** any patient-to-exercise ranking logic is authored.

It does not decide which exercise a patient should receive.

## 2. Source-count reconciliation

The source narrative says `재활운동 Library v0.2 - 약 40개`.

However, the actual domain table explicitly enumerates:

- **13 domains**
- **57 exercise labels**

The catalog therefore preserves all 57 explicit labels. It does **not** delete 17 items merely to make the exact count match the approximate narrative phrase.

This is a source-preservation decision, not a clinical expansion.

## 3. ID policy

Stable IDs are migration identities, not priority scores and not clinical ranks.

Rules:

- prefix: `LBP_`
- domain-specific namespace
- two-digit stable ordinal within that namespace
- once assigned, do not renumber merely because a later library version inserts an item
- `LBP_TRUNK_03` remains **Bird-dog** because that is the only EX_ID explicitly provided by the source document

The Bird-dog source has two relevant literal forms:

- domain-table label: `bird-dog progression`
- object example: `Bird-dog Level 2`

The catalog resolves those two source rows into the same canonical exercise identity without creating a second duplicate exercise.

## 4. Missing fields are intentionally missing

The source provides full object-detail fields only for the Bird-dog example:

- Level `2/5`
- starting dose example `5회 × 2세트`
- progression `반복수/hold/부하 증가`
- regression `팔만/다리만/지지면 확대`
- target function `lifting, standing, work`
- stop/review `새 신경증상, 뚜렷한 distal symptom 증가, 견디기 어려운 악화`
- video `20~40초, 한 운동 한 영상`

For the other 56 catalog items, the source only gives the exercise name plus its domain and domain-level purpose.

Therefore their item-level:

- Level
- dose
- progression
- regression
- target-function mapping
- stop/review rules
- video metadata

remain `null`.

**Null here means “source did not specify it”, not “none required”.**

## 5. Domain inventory

| Domain | explicit items |
|---|---:|
| Activity/Aerobic | 4 |
| Lumbar mobility | 5 |
| Directional response | 4 |
| Hip mobility | 4 |
| Deep trunk activation | 5 |
| Trunk control | 5 |
| Trunk endurance | 5 |
| Hip strength | 5 |
| Functional strength | 5 |
| Load capacity | 5 |
| Neural mobility | 3 |
| Graded exposure | 4 |
| Mind-body/regulation | 3 |
| **Total** | **57** |

## 6. Hard boundary

This migration must not be mistaken for rehabilitation CDS approval.

Still prohibited in this step:

- patient facts → exercise ID
- hypothesis/diagnosis → exercise ID
- automatic ranking
- automatic dose selection
- automatic progression/regression
- automatic patient instruction
- Doctor UI integration
- Care Plan adoption
- CRM/EMR write-through

The next clinical step is a separate review of **selection inputs and ranking rows** using only IDs from this catalog.

## 7. Acceptance gates

The catalog test must prove:

1. 57/57 explicit source entries preserved
2. 13/13 domains preserved
3. IDs unique and stable-format
4. `LBP_TRUNK_03 = Bird-dog` preserved
5. Bird-dog source object fields preserved
6. no item-level fields invented for the other 56 items
7. no patient-to-exercise mapping added

## 8. Production status

**NOT PRODUCTION.**

This catalog is an experimental migration artifact on Draft PR #28. It can become the source-of-truth catalog only after explicit product/clinical review. The rehabilitation recommender remains a later milestone and requires its own approval.
