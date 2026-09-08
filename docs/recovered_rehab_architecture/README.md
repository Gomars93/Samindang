# Recovered non-LBP rehabilitation architecture references

Status: **REFERENCE ONLY — recovered from prior ChatGPT Library artifacts on 2026-09-07**

These files were not previously present in the GitHub repository. They are preserved here so future Clinical OS work does not lose earlier rehabilitation design work.

Important governance:

- These are **not** production exercise libraries.
- These are **not** Clinical Decisions CLOSED unless a separate current GitHub decision says so.
- They do **not** override the current PASS/FROZEN safety modules for NECK/SHOULDER/KNEE.
- They do **not** authorize diagnosis → exercise mapping.
- They do **not** authorize a new questionnaire, score, or mandatory strategy layer.
- LBP remains the only region with the deeper canonical exercise warehouse / actionable exercise-object research stack.

## Recovery completeness

See:

`SOURCE_COMPLETENESS_MANIFEST.md`

That manifest records the full Library recovery scope, source integrity hashes, exact source inventory, and reconstruction order for split originals.

The Library recovery pass located region-specific rehabilitation architecture source artifacts for:

1. NECK
2. SHOULDER
3. KNEE

No separate historical Exercise/Rehabilitation Architecture source artifact was located in the searched Library for ELBOW, WRIST_HAND, HIP, ANKLE_FOOT, or TMJ. This is a retrieval finding, not a claim that such a document could never have existed elsewhere.

## Recovered architecture references

1. `NECK_V1_REHAB_ARCHITECTURE_RECOVERED.md`
2. `SHOULDER_V1_REHAB_ARCHITECTURE_RECOVERED.md`
3. `KNEE_V1_REHAB_ARCHITECTURE_RECOVERED.md`

These are compact, governance-safe references distilled from the recovered historical artifacts.

## Preserved source material

### Exact / full historical sources

`source/originals/` contains exact preserved source content:

- `NECK_V1_Evidence_Matrix_v0.1.md` — full historical NECK v0.1 source.
- `SHOULDER_V1_Evidence_Matrix_v0.1_HANDOFF.part00.md` … `part04.md` — exact sequential chunks of the full 652-line SHOULDER source.
- `KNEE_V1_Evidence_Matrix_v0.1_HANDOFF.part00.md` … `part04.md` — exact sequential chunks of the full 737-line KNEE source.

The SHA-256 values and reconstruction commands are recorded in `SOURCE_COMPLETENESS_MANIFEST.md`.

### Additional preserved source / quick extracts

- `source/NECK_V1_Evidence_Matrix_v0.2_HANDOFF.md` — full recovered historical NECK v0.2 HANDOFF source artifact.
- `source/SHOULDER_V1_Evidence_Matrix_REHAB_EXTRACT.md` — verbatim SHOULDER rehab/reassessment/evidence-claim extract for quick inspection.
- `source/KNEE_V1_Evidence_Matrix_REHAB_EXTRACT.md` — verbatim KNEE rehab/reassessment/evidence-claim extract for quick inspection.

The extracts are convenience copies only; the exact full originals are preserved under `source/originals/`.

## Shared product principle

> Clinical OS surfaces 2–3 reasonable rehabilitation candidates; the clinician approves, removes, or replaces them and chooses the final 1–2.

## Shared selection principle

> Exercise selection is based on function, irritability, objective/functional response, patient goal, and safety — not diagnosis labels alone.

When LBP production v1 establishes a minimal reusable exercise-object contract, reuse only the **minimum common skeleton** in these regions and preserve each region's own clinical domains. Do not force symmetric exercise counts or duplicate LBP's full 57-item structure.

## Merge boundary

This recovery branch is documentation/reference only. **Do not merge to `main` without explicit Product Owner approval.**
