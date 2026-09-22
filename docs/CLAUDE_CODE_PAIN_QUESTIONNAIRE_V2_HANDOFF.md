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
- Added context-only schemas for active `PAIN_F01` and `PAIN_F02`.
- Extracted the shared `OptionCard` primitive used by single- and multi-choice controls.
- Connected Region Focus, Target Activity, and Activity Ability without changing safety scoring or routing.
- Added regression coverage for rendering, selection, answer cleanup, and unchanged safety behavior.
- Added presentation-only `screenProgress` metadata for Target Activity (`2 / 4`) and Activity Ability (`3 / 4`).
- Added DOM regression coverage for the 11 score choices, selected radio state, activity context chip, and accessible `3 / 4` label.
- Added Figma-only review drafts for `PAIN_F04` (`20:62`, multi-select limiting response) and `PAIN_F05` (`21:76`, single-select recovery time). No runtime schema or clinical logic was added.

## Next implementation slice

- Preserve `PAIN_F03` time/repetition schemas as a held alternative, outside `ALL_QUESTIONS` and the active flow.
- Keep `PAIN_F05` as a Figma-only held alternative; do not connect it to clinical judgment.
- Preserve backward navigation and answer state while switching between target activities.
- After clinical approval, add context-only schemas for `PAIN_F04` and `PAIN_F05` using the reviewed Figma copy and stable enum values.
- Keep both fields out of safety, diagnosis, treatment, stage, and urgency calculations.
- Add pruning, backward-navigation, payload, and DOM tests before exposing either screen in the patient flow.
- Screen 05 activity chip render/layout check is complete (`23:92`, `203×38`, no 800×1280 overflow). Keep the screen Figma-only until clinical approval.

## Review ledger

Record unresolved decisions here instead of guessing.

| Topic | Question | Safe interim behavior |
|---|---|---|
| Region split | When should low-back selection branch into hip/pelvis discrimination? | Ask the discriminator; do not change diagnosis/routing automatically. |
| Function scale | How, if at all, may the approved 0–10 ability score influence clinical prioritization? | Store and display it as context only; do not score or route from it. |
| Tolerance units | Time, repetitions, or distance by activity? | Store explicit unit/value fields; avoid derived severity. |
| Limiting response | Are the six draft reasons complete, should selection be multi-select, and is an explicit unknown option required? | Keep `PAIN_F04` in Figma only; do not add a runtime schema before review. |
| Recovery time | Are the draft bucket boundaries clinically useful, and should recovery be measured against baseline symptoms or pre-activity state? | Keep `PAIN_F05` in Figma only; do not derive irritability/severity. |
| Neurologic answers | Which patterns alter urgency beyond existing rules? | Preserve existing rules; new fields are context-only. |
| Doctor summary | Which functional findings affect prioritization? | Display after safety findings; do not alter safety priority. |

### Implemented interim decisions

- Region Focus reuses the existing clinically CLOSED `HIP_00` contract; do not create duplicate `PAIN_R01` storage.
- `PAIN_F01` stores one target activity as context only; `PAIN_F02` stores its 0–10 ability score as context only.
- `PAIN_F03` preserves explicit time- or repetition-unit buckets as a held schema outside the active question registry.
- Figma node `33:92` is the active-flow F02 screen (`3 / 4`). Held tolerance source nodes remain `11:32` and `16:60` (`3 / 5`).
- Figma review nodes are `20:62` for limiting response (`4 / 5`) and `21:76` for recovery time (`5 / 5`). Their copy and interaction rules are not clinically approved.

## Definition of done for a night checkpoint

- Branch is pushed and reproducible from GitHub.
- Tests are green or failures are documented with exact commands/output.
- Figma and code changes are cross-referenced in the commit/PR notes.
- The review ledger contains every unresolved clinical decision.
- No deployment has occurred.
