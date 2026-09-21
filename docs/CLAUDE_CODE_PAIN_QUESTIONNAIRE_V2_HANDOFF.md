# Claude Code Handoff — Pain Questionnaire v2

## Mission

Implement the patient-tablet questionnaire rework described in `docs/PAIN_QUESTIONNAIRE_V2_WORKING_SPEC.md` on branch `codex/pain-questionnaire-v2-ux`.

Claude Code is best used here for repository-wide dependency tracing, React/TypeScript refactoring, and test expansion. Figma remains the visual source for layout and interaction intent; the repository remains the source of truth for clinical logic and shipped behavior.

## Start here

- `src/spec/coreSpec.ts`
- `src/spec/lbpAdapter.ts`
- `src/spec/lbpLogic.ts`
- `src/screens/QuestionScreen.tsx`
- `src/components/BodyMap.tsx`
- `src/components/SingleChoice.tsx`
- `src/components/MultiChoice.tsx`
- `src/components/NumericScale.tsx`
- `src/components/StepProgress.tsx`
- `src/components/ScreenShell.tsx`
- `src/styles.css`
- Doctor View mapping under `src/doctor/`

## Non-negotiable constraints

1. Preserve all current Safety/CES/red-flag behavior and tests.
2. Do not reuse an existing answer ID for a different semantic meaning.
3. Do not deploy, merge to `main`, or change production configuration.
4. Mark ambiguous clinical decisions as `TODO(clinical-review)` and add them to the review ledger below.
5. Prefer incremental, reviewable commits; run the relevant tests before each push.
6. Match the Figma intent without hard-coding screenshots or introducing a second styling system.

## Completed implementation slice

- Reused the existing CLOSED `HIP_00` contract for Region Focus instead of introducing duplicate `PAIN_R01` storage.
- Added context-only schemas for `PAIN_F01` and `PAIN_F03`.
- Extracted the shared `OptionCard` primitive used by single- and multi-choice controls.
- Connected Region Focus, Target Activity, and Activity Tolerance without changing safety scoring or routing.
- Added regression coverage for rendering, selection, answer cleanup, and unchanged safety behavior.
- Added presentation-only `screenProgress` metadata for Region Focus (`1 / 5`), Target Activity (`2 / 5`), and Activity Tolerance (`3 / 5`).
- Added DOM regression coverage for the six repetition choices, their Figma order, selected-state checkmark, and accessible `3 / 5` label.
- Added Figma-only review drafts for `PAIN_F04` (`20:62`, multi-select limiting response) and `PAIN_F05` (`21:76`, single-select recovery time). No runtime schema or clinical logic was added.

## Next implementation slice

- Keep the activity-to-unit mapping explicit: `SITTING`/`WALKING` use time buckets; `SIT_TO_STAND`/`BEND_PICK_UP`/`LIFT_CARRY`/`BED_MOBILITY` use repetition buckets.
- Keep `PAIN_F03` hidden for `OTHER` or unknown activity values; do not infer a unit.
- Preserve backward navigation and answer state while switching between target activities.
- After clinical approval, add context-only schemas for `PAIN_F04` and `PAIN_F05` using the reviewed Figma copy and stable enum values.
- Keep both fields out of safety, diagnosis, treatment, stage, and urgency calculations.
- Add pruning, backward-navigation, payload, and DOM tests before exposing either screen in the patient flow.
- Recheck the Screen 05 activity chip in a fresh Figma render before treating the visual draft as implementation-ready.

## Review ledger

Record unresolved decisions here instead of guessing.

| Topic | Question | Safe interim behavior |
|---|---|---|
| Region split | When should low-back selection branch into hip/pelvis discrimination? | Ask the discriminator; do not change diagnosis/routing automatically. |
| Function scale | Should difficulty be 0–10, 1–5, or categorical? | Keep draft UI isolated from clinical scoring. |
| Tolerance units | Time, repetitions, or distance by activity? | Store explicit unit/value fields; avoid derived severity. |
| Limiting response | Are the six draft reasons complete, should selection be multi-select, and is an explicit unknown option required? | Keep `PAIN_F04` in Figma only; do not add a runtime schema before review. |
| Recovery time | Are the draft bucket boundaries clinically useful, and should recovery be measured against baseline symptoms or pre-activity state? | Keep `PAIN_F05` in Figma only; do not derive irritability/severity. |
| Neurologic answers | Which patterns alter urgency beyond existing rules? | Preserve existing rules; new fields are context-only. |
| Doctor summary | Which functional findings affect prioritization? | Display after safety findings; do not alter safety priority. |

### Implemented interim decisions

- Region Focus reuses the existing clinically CLOSED `HIP_00` contract; do not create duplicate `PAIN_R01` storage.
- `PAIN_F01` stores one target activity as context only.
- `PAIN_F03` stores explicit time- or repetition-unit buckets as context only. It is optional and must not be converted into severity, stage, routing, or treatment logic before clinical review.
- Figma source nodes are `11:32` for the time-based tolerance screen and `16:60` for the repetition-based screen; both are step `3 / 5`.
- Figma review nodes are `20:62` for limiting response (`4 / 5`) and `21:76` for recovery time (`5 / 5`). Their copy and interaction rules are not clinically approved.

## Definition of done for a night checkpoint

- Branch is pushed and reproducible from GitHub.
- Tests are green or failures are documented with exact commands/output.
- Figma and code changes are cross-referenced in the commit/PR notes.
- The review ledger contains every unresolved clinical decision.
- No deployment has occurred.
