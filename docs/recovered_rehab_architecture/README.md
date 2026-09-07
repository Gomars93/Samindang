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

Recovered references:

1. `NECK_V1_REHAB_ARCHITECTURE_RECOVERED.md`
2. `SHOULDER_V1_REHAB_ARCHITECTURE_RECOVERED.md`
3. `KNEE_V1_REHAB_ARCHITECTURE_RECOVERED.md`

Shared product principle:

> Clinical OS surfaces 2–3 reasonable rehabilitation candidates; the clinician approves, removes, or replaces them and chooses the final 1–2.

Shared selection principle:

> Exercise selection is based on function, irritability, objective/functional response, patient goal, and safety — not diagnosis labels alone.

When LBP production v1 establishes a minimal reusable exercise-object contract, reuse only the **minimum common skeleton** in these regions and preserve each region's own clinical domains. Do not force symmetric exercise counts or duplicate LBP's full 57-item structure.