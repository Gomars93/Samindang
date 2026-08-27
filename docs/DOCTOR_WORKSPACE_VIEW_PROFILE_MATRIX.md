# Doctor Workspace view_profile — decision matrix (round 2 Phase 4)

Status: **KEPT AS-IS**. This document is the exhaustive audit the round-2
task asked for before touching `deriveViewProfile()`
(`src/doctor/workspace/viewProfile.ts`) / `doctorViewProfile()`
(`src/spec/coreSpec.ts`). Conclusion: the existing two-signal mapping is
correct and is kept unchanged. One pre-existing (not introduced by PR #24)
architectural edge case is flagged below as **PRODUCT DECISION REQUIRED**
rather than silently "fixed."

## The mapping (unchanged)

```
hasPainContent     = routing.primary_module === 'Pain' || routing.additional_module === 'Pain'
hasSystemicContent = routing.questionnaire_mode === 'expanded' || routing.questionnaire_mode === 'herbal_addon'

hasPainContent && hasSystemicContent -> 'mixed'
hasPainContent                       -> 'pain'
otherwise                            -> 'herbal'
```

`deriveViewProfile()` (DoctorView-side, reads the already-built
`payload.routing`) and `doctorViewProfile()` (coreSpec-side canonical
function, reads raw `Responses`) were verified to be **structurally
identical** — not just "produce the same answer for the cases tested," but
identical because `buildRoutingPayload()` sets
`routing.questionnaire_mode: questionnaireMode(r)` directly, and
`doctorViewProfile()`'s `hasSystemicContent` check
(`showsExpandedSystemicBlock`) is literally
`questionnaireMode(r) === 'expanded' || questionnaireMode(r) === 'herbal_addon'`
— the exact same two-value check `deriveViewProfile()` runs against
`routing.questionnaire_mode`. `tests/doctor-view-profile-matrix.spec.mjs`
asserts `deriveViewProfile(fakePayload).derived === doctorViewProfile(r)`
for every row below, so any future drift between the two functions fails
CI immediately.

## Matrix

| # | Case | Key fields | primary_module | additional_module | questionnaire_mode | hasPain | hasSystemic | Result |
|---|---|---|---|---|---|---|---|---|
| 1 | Pain primary, pain_fast | `VISIT_00_INTENT=pain_care` | Pain | – | pain_fast | ✓ | – | **pain** |
| 2 | Pain primary, expanded (herbal-intent symptom route) | `VISIT_00_INTENT=herbal`, `VISIT_00B_HERBAL_PURPOSE=symptom`, `VISIT_02_SYMPTOM_MAIN=pain` | Pain | – | expanded | ✓ | ✓ | **mixed** |
| 3 | Pain primary + herbal add-on | `VISIT_00_INTENT=pain_care`, `HERBAL_ADDON_ACTIVE=yes` | Pain | – | herbal_addon | ✓ | ✓ | **mixed** |
| 4 | Sleep primary | `VISIT_02_SYMPTOM_MAIN=sleep` | Sleep | – | pain_fast | – | – | **herbal** |
| 5 | GI primary | `VISIT_02_SYMPTOM_MAIN=digestion` | GI | – | pain_fast | – | – | **herbal** |
| 6 | Bowel primary | `VISIT_02_SYMPTOM_MAIN=bowel` | Bowel | – | pain_fast | – | – | **herbal** |
| 7 | Urinary primary | `VISIT_02_SYMPTOM_MAIN=urinary` | Urinary | – | pain_fast | – | – | **herbal** |
| 8 | Fatigue primary | `VISIT_02_SYMPTOM_MAIN=fatigue` | Fatigue | – | pain_fast | – | – | **herbal** |
| 9 | Stress primary | `VISIT_02_SYMPTOM_MAIN=stress` | Stress | – | pain_fast | – | – | **herbal** |
| 10 | Women primary | `VISIT_00_INTENT=women`, `VISIT_02_WOMEN=women` | Women | – | pain_fast | – | – | **herbal** |
| 11 | Weight primary | `VISIT_00_INTENT=weight` | Weight | – | pain_fast | – | – | **herbal** |
| 12 | Constitution (herbal intent, non-symptom purpose) | `VISIT_00_INTENT=herbal`, `VISIT_00B_HERBAL_PURPOSE=constitution` | null | – | expanded | – | ✓ | **herbal** |
| 13 | Non-pain primary + Pain as Additional module | `VISIT_02_SYMPTOM_MAIN=sleep`, `ADDITIONAL_DETAIL_01=pain` | Sleep | Pain | pain_fast | ✓ | – | **pain** — see caveat below |
| 14 | Non-pain primary + Pain Additional + expanded | same as #13 plus `VISIT_00_INTENT=herbal`, `VISIT_00B_HERBAL_PURPOSE=symptom` | Sleep | Pain | expanded | ✓ | ✓ | **mixed** |
| 15 | Neither pain nor expanded (plain symptom_consult) | `VISIT_00_INTENT=symptom_consult`, `VISIT_02_SYMPTOM_MAIN=sleep` | Sleep | – | pain_fast | – | – | **herbal** |
| 16 | Malformed/absent routing fields (empty Responses) | `{}` | null | – | pain_fast | – | – | **herbal** |

All 16 rows are covered by `tests/doctor-view-profile-matrix.spec.mjs`,
which also re-asserts the coreSpec/DoctorView equivalence property for
every row (not just a hand-picked few).

## Invariant checks (mission Phase 4 items 1-5)

1. **No patient-entered Pain content is ever hidden.** For every row where
   `hasPainContent` is true, the result is `pain` or `mixed` — never
   `herbal`. Enforced generically in the matrix test (not per-row) by
   deriving the assertion from `hasPainContent` rather than hardcoding it,
   so a future new row can't silently violate it.
2. **No collected systemic/herbal content is ever hidden.** Same
   generic check for `hasSystemicContent` — never resolves to `pain` when
   true.
3. **Pain profile shows no Myungri/birth-time/herbal-only clutter.**
   Already covered by `tests/doctor-workspace.spec.mjs` ("pain scenario 1:
   no Myungri/명리, no birth-time, no herbal-only systemic content") — not
   duplicated here since that's a rendering assertion, not a routing one.
4. **Herbal profile never pretends Pain examination content exists.**
   Already covered by `tests/doctor-workspace.spec.mjs` ("herbal scenario:
   does not show the pain-specific 지금 확인할 것 section").
5. **Mixed profile exposes both.** Already covered by
   `tests/doctor-workspace.spec.mjs` ("mixed scenario: both 통증 진료 and
   한약·전신 tabs present").

## PRODUCT DECISION REQUIRED — row #13's downstream safety-panel gap

Row #13 (non-pain primary + Pain as an *Additional* module) is real and
supported by the routing model — `view_profile` correctly resolves to
`pain` so the clinician does land on the Pain Workspace. However, this
round's audit found a **pre-existing** (not introduced by PR #24, not
touched by this round) gap one level down: several regional
`*SafetyPanel` components in `src/doctor/DoctorView.tsx` — e.g.
`LbpSafetyPanel`'s `if (payload.routing.primary_module_detail !== 'LBP') return null` —
gate strictly on `primary_module_detail`, which is only set when Pain is
the **primary** module (`painRegionalDetailLabel` is only computed when
`isPrimaryPain`). For a row-#13-shaped patient (Pain is Additional, not
Primary), the regional detail label is never computed for the Additional
side, so the matching SafetyPanel does not render inside the Pain
Workspace even though the patient answered that regional module's
questions.

This is exactly the class of change the governing task tells this round
NOT to guess at ("If a case is ambiguous: do NOT guess. Mark PRODUCT
DECISION REQUIRED") — extending `primary_module_detail`-style gating to
also cover the Additional-module case touches existing, tested,
safety-relevant rendering logic that predates this PR, and the correct
fix (compute a `painRegionalDetailLabel` for whichever side actually
carries Pain, primary or additional) is a real design decision about how
the Additional-module pain pathway should behave for every regional
safety panel — not a one-line tweak. **This round intentionally leaves
that gating logic untouched** and records it here for a human product/
clinical decision, rather than silently patching safety-critical
rendering logic under time pressure.
