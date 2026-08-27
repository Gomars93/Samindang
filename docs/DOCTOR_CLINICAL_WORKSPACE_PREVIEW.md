# Doctor Clinical Workspace — synthetic preview

Status: **design / information-architecture preview only**. This document and `public/doctor-workspace-preview.html` do not change the production DoctorView, clinical computation, routing thresholds, adapters, or patient-data flow.

## Preview purpose

The preview makes the proposed doctor workspace visible before real data binding. It intentionally uses synthetic examples only and exposes three manual preview profiles:

- `pain`: pain workspace only
- `herbal`: systemic/herbal workspace only
- `mixed`: Pain / Herbal tabs

A common Safety area is always above the workspace/tabs.

## Locked design invariants for this preview

- Pain profile does not show Myungri/saju/birth-time or herbal-only systemic content.
- Herbal profile shows systemic/herbal information first; Myungri is collapsed secondary information.
- Mixed profile exposes both workspaces as separate tabs.
- Common Safety is never hidden behind a tab.
- LBP recovery expectation is displayed as the raw numeric score only. No risk/yellow-flag cutoff or color inference is introduced.
- Repeat-visit comparison is not implemented unless a secure stable visit/patient linkage already exists. Until then it remains **OPERATIONAL INTEGRATION REQUIRED**.
- Existing CLOSED/FROZEN clinical Logic/Adapter files are untouched.

## Why the preview is separate from real DoctorView integration

The current repository already has `QuestionnaireMode = pain_fast | expanded | herbal_addon`, but `pain_fast` is a workflow mode rather than a guarantee that the primary complaint is pain. Therefore a production `view_profile = pain | herbal | mixed` mapping must not be guessed merely from `questionnaireMode`.

Before real integration, the implementation must derive the profile from existing, auditable signals (for example `questionnaireMode` plus primary-concern information) and add regression tests proving that relevant patient-entered content cannot be hidden accidentally. If the existing signals are insufficient, that is a product/data-contract decision rather than something this preview silently invents.

## Preview URL

The branch-specific Pages workflow publishes this synthetic page under:

`https://gomars93.github.io/Samindang/doctor-pr/`

The workflow mirrors the currently-live root and adds `/doctor-pr/`; it does not rebuild or replace the root preview with this branch.

## Next implementation phase after visual approval

1. Extract the common Safety area from the existing DoctorView without changing its computed inputs/outputs.
2. Extract Pain and Herbal presentation workspaces from the existing flat scroll.
3. Add the `view_profile` derivation/gating only after its source signals are verified.
4. Preserve existing module SafetyPanels and raw response/computed-field distinction.
5. Extend `tests/doctor.spec.mjs` to cover all profiles and information-hiding invariants.
6. Run full regression and verify zero unintended diff to `src/spec/*Logic.ts` and `src/spec/*Adapter.ts`.
