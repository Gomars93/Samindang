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

## Recommended first implementation slice

- Add stable draft schemas for `PAIN_R01`, `PAIN_F01`, and `PAIN_F03`.
- Extract a reusable option-card presentation primitive from the current choice components.
- Implement region focus, target activity, and activity tolerance in the existing questionnaire engine.
- Preserve backward navigation and answer state.
- Add tests for rendering, selection, navigation, and unchanged safety routing.

## Review ledger

Record unresolved decisions here instead of guessing.

| Topic | Question | Safe interim behavior |
|---|---|---|
| Region split | When should low-back selection branch into hip/pelvis discrimination? | Ask the discriminator; do not change diagnosis/routing automatically. |
| Function scale | Should difficulty be 0–10, 1–5, or categorical? | Keep draft UI isolated from clinical scoring. |
| Tolerance units | Time, repetitions, or distance by activity? | Store explicit unit/value fields; avoid derived severity. |
| Neurologic answers | Which patterns alter urgency beyond existing rules? | Preserve existing rules; new fields are context-only. |
| Doctor summary | Which functional findings affect prioritization? | Display after safety findings; do not alter safety priority. |

## Definition of done for a night checkpoint

- Branch is pushed and reproducible from GitHub.
- Tests are green or failures are documented with exact commands/output.
- Figma and code changes are cross-referenced in the commit/PR notes.
- The review ledger contains every unresolved clinical decision.
- No deployment has occurred.

