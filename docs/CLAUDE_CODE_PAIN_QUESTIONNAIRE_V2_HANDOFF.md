# Claude Code Handoff — Pain Questionnaire v2

Updated: 2026-09-22

## 1. Working state

- Repository: `Gomars93/Samindang`
- Branch: `codex/pain-questionnaire-v2-ux`
- Implementation checkpoint before this handoff update: `8b08d6359f4480e8dc180b6ff00bb69b5ee3144a`
- Commit: `feat(patient): add pain activity ability scale`
- Historical recovery point supplied by the owner: `38dcc46`
- Figma file: `UjziuG6OOpVU1CtcNl6704`
- Figma page: `6:22` — `02 · Patient Questionnaire v2`
- Working spec: `docs/PAIN_QUESTIONNAIRE_V2_WORKING_SPEC.md`

Start from the remote branch, not an old local clone:

```bash
git fetch origin
git switch codex/pain-questionnaire-v2-ux
git pull --ff-only origin codex/pain-questionnaire-v2-ux
git rev-parse HEAD
```

The implementation immediately before this document is commit `8b08d6359f4480e8dc180b6ff00bb69b5ee3144a`.

## 2. Current product decision

The compact patient activity flow is:

1. `PAIN_F01` — choose one target activity.
2. `PAIN_F02` — rate current ability for that activity from 0 to 10.
3. `PAIN_F04` — choose up to two reasons the activity is difficult, only after its clinical contract is approved.

F02 means `0 = cannot do the activity at all` and `10 = can do it as usual`. It is patient context, not a diagnostic score. It must not change safety, urgency, diagnosis, stage, treatment, or exercise eligibility by itself.

`PAIN_F03` Activity Tolerance and `PAIN_F05` Recovery Time are held alternatives. Preserve their screens and code, but do not place them in the active patient flow, payload-derived clinical judgment, Doctor View decisions, or exercise selection.

## 3. Non-negotiable clinical boundaries

1. Do not change existing Safety/CES/red-flag or FROZEN logic.
2. Do not infer clinical rules from F01/F02/F04/F05.
3. Do not finalize F04 values, `UNKNOWN` behavior, required status, or max-selection behavior until owner approval.
4. Use `TODO(clinical-review)` for unresolved clinical contracts.
5. Do not automatically prescribe an exercise from questionnaire answers.
6. Do not merge to `main`, deploy, or change production configuration.
7. Do not reuse an existing answer ID with a new meaning.

## 4. Completed work

### Patient flow and storage

- Reused clinically CLOSED `HIP_00` as Region Focus; no duplicate `PAIN_R01`.
- `PAIN_F01` is active and stores one target activity as context.
- `PAIN_F02` is active as a required `numeric_scale` with values `0..10`.
- F01 uses `screenProgress: 2 / 4`; F02 uses `3 / 4`.
- F02 retains the selected F01 activity in an activity context chip.
- F02 enters the pain payload as `target_activity_ability`.
- F02 is not read by safety, diagnosis, routing, staging, treatment, or exercise logic.
- Selecting F01 `UNKNOWN` hides F02 and prunes its stale score.
- Switching between concrete target activities preserves the entered score.

### Held alternatives

- `PAIN_F03` remains in exported `PAIN_FUNCTION_HELD_QUESTIONS`.
- It is excluded from `ALL_QUESTIONS` and the active patient flow.
- `activity_tolerance` is emitted as `null`; stale raw F03 data cannot leak into the active clinical contract.
- F05 remains Figma-only and is not an active runtime question.

### Shared UI

- Existing `NumericScale` is reused; no second styling system was added.
- The scale renders semantic radio buttons with `aria-checked`.
- Existing option-card, focus-visible, contrast, and tablet navigation behavior remains unchanged.

## 5. Figma source of truth

| Purpose | Node | Status |
|---|---:|---|
| Region Focus | `9:2` | Existing active concept |
| Target Activity | `10:14` | Active F01 concept |
| Activity Ability 0–10 | `33:92` | Active F02 concept; reviewed at 800×1280 |
| Activity Tolerance — time | `11:32` | Held F03 alternative |
| Activity Tolerance — repetitions | `16:60` | Held F03 alternative |
| Limiting Response | `20:62` | F04 clinical-review draft only |
| Recovery Time | `21:76` | Held F05 draft only |

F02 node `33:92` validation:

- 800×1280 frame and `3 / 4` progress.
- 11 touch targets for scores 0–10; selected-state example is 6.
- Selected activity chip retained.
- Noto Sans KR throughout; no frame overflow.
- Two-digit `10` remains on one line after padding correction.

F05 node `21:76` was previously checked at 800×1280. Its activity chip is `23:92`, 203×38, padding `8/14/8/14`, radius 12. This validation does not authorize clinical/runtime connection.

## 6. Main code locations

- `src/spec/coreSpec.ts`
  - `PAIN_FUNCTION_QUESTIONS`: active F01/F02.
  - `PAIN_FUNCTION_HELD_QUESTIONS`: held F03.
  - `buildResponsePayload`: target activity, ability, and forced-null tolerance.
- `src/screens/QuestionScreen.tsx`: activity context chip for F02 and held F03.
- `src/components/NumericScale.tsx`: reused 0–10 radio-button scale.
- `src/styles.css`: numeric scale and activity-chip presentation.
- `tests/patient-ux.spec.mjs`: score buttons, selected state, chip, accessible progress.
- `tests/integration.spec.mjs`: visibility, payload, pruning/state preservation, unchanged safety.
- `src/spec/lbpLogic.ts`, `src/spec/lbpAdapter.ts`: protected clinical logic unless an independently approved task explicitly requires a change.

## 7. Verification at handoff

```bash
npm ci
npm run test:patient-ux
npm run test:integration
npm run build
```

- Patient UX: 49 assertions passed.
- Integration: 1,286 assertions passed.
- TypeScript/Vite production build passed.
- Vite emitted only the existing large-chunk advisory.

## 8. Next safe implementation target

Do not implement F04 runtime behavior yet. The next safe unit is a Doctor View presentation shell for already approved data:

> 목표 활동 · 수행능력 · 제한 이유

- Render `target_activity` and `target_activity_ability` as context-only summary fields.
- Leave the `제한 이유` slot visibly pending/empty until F04 is approved and collected.
- Place this summary after existing safety findings; it must not alter safety priority.
- Add display-only tests.
- Do not add exercise candidates in the same commit unless existing LBP eligibility can be reused without modifying its clinical rules.

Intended later exercise workflow:

1. Existing safety questions and Doctor examination remain authoritative.
2. Existing LBP exercise-library eligibility produces 2–3 candidates.
3. The doctor approves the final 1–2 exercises.
4. Questionnaire answers alone never auto-finalize an exercise.

## 9. Approval required before F04 coding

Ask the owner to approve exactly these items:

1. Final patient-facing reason labels.
2. Whether the maximum is exactly two selections.
3. Whether `잘 모르겠어요` is present.
4. If present, whether `UNKNOWN` is exclusive.
5. Whether `기타` needs free text or only a stable enum.
6. Whether F04 is required or skippable.
7. Stable payload enum names.

Current Figma draft reasons are discussion material only: pain increase, weakness, stiffness/mobility loss, numbness/sensory discomfort, fear of worsening, and other. They are not approved runtime values.

## 10. Review discipline

For each unit:

1. Begin from the latest remote branch.
2. Trace all readers before changing schema or payload.
3. Make one reviewable UX/display/state-preservation unit.
4. Run relevant tests and the build.
5. Commit and push only if green.
6. Report the exact commit SHA and owner decisions still required.

Done means: pushed and reproducible branch, green tests, updated handoff, no unapproved clinical inference, and no deployment.
