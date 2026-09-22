# Pain Questionnaire v2 — Working Spec

Status: implementation-ready draft with clinical hold points  
Branch: `codex/pain-questionnaire-v2-ux`  
Figma: https://www.figma.com/design/UjziuG6OOpVU1CtcNl6704

## Outcome

Rework the patient tablet questionnaire before Doctor View v2 so that the doctor-facing summary is driven by cleaner, function-oriented answers. The flow must stay fast on a clinic tablet, remain understandable to patients, and preserve all existing safety behavior.

## Safety contract

- Do not weaken or remove current red-flag, Safety, CES, herbal-hold, or escalation behavior.
- Keep existing `LBP_04`–`LBP_06` safety semantics until an explicit clinical review approves a replacement.
- New answers may add context; they must not silently downgrade an existing safety result.
- Any ambiguous clinical rule is a `TODO(clinical-review)` and must be listed in the handoff/PR notes.
- No production deployment from this branch.

## Proposed patient flow

1. Body map / primary painful area
2. Region discriminator when low back and pelvis/hip are close
3. One target activity the patient most wants to improve
4. Current difficulty for that target activity
5. Tolerance: how long or how many repetitions are possible
6. Limiting response: pain, weakness, stiffness, numbness, fear, or other
7. Recovery: how long symptoms remain aggravated afterward
8. Neurologic symptoms and distribution
9. Existing safety questions
10. Recurrence and context

## Proposed IDs

| ID | Purpose | Input |
|---|---|---|
| `HIP_00` | Distinguish low back from hip/pelvis emphasis (reuse the existing CLOSED contract; do not add `PAIN_R01`) | single choice |
| `PAIN_F01` | Select target activity | single choice + other |
| `PAIN_F02` | Rate target-activity difficulty | numeric scale |
| `PAIN_F03` | Record tolerance | preset choices + optional detail |
| `PAIN_F04` | Identify limiting response | multi choice |
| `PAIN_F05` | Record recovery time | single choice |
| `PAIN_B01` | Capture symptom behavior | single/multi choice |
| `PAIN_N01` | Capture neurologic symptom pattern | multi choice |
| `PAIN_X01` | Capture recurrence/context | single choice |

Exact wording and branching remain draft until clinical review. Existing answer IDs must not be repurposed with new meanings.

## Tablet UX contract

- Primary target: landscape tablet; retain a usable narrow/mobile fallback.
- One decision per screen, with a persistent progress indicator and visible Back/Next actions.
- Touch targets are at least 52 px; primary navigation target is 64–72 px high.
- Selected states use more than color alone: border, fill, and icon/check state.
- Use plain Korean patient language. Helper text explains intent without suggesting a diagnosis.
- Do not require a keyboard for the core path. “기타” text is optional and deferred until selected.
- Preserve answers when navigating backward.
- Error and validation copy appears adjacent to the affected control.

## Figma checkpoint

- Foundations page and `Samindang Patient UI` variables
- Option Card component set: default, selected, disabled, alert
- Navigation Button component set: primary, secondary, disabled, danger
- Screen 01: Region Focus
- Screen 02: Target Activity
- Screen 03: Activity Ability 0–10 — active-flow draft (`33:92`)
- Held Screen 03: Activity Tolerance — time-based (`11:32`)
- Held Screen 03B: Activity Tolerance — repetition-based (`16:60`)
- Screen 04: Limiting Response — clinical-review draft (`20:62`)
- Screen 05: Recovery Time — clinical-review draft (`21:76`)

The approved compact activity flow is Target Activity (`PAIN_F01`) → Activity
Ability 0–10 (`PAIN_F02`) → Limiting Response (`PAIN_F04`, pending clinical
review). The F02 screen uses `3 / 4`, keeps the selected activity visible, and
was checked at 800×1280 with 11 touch targets, Noto Sans KR, and no overflow.

Both Activity Tolerance variants are preserved as held alternatives and use
the old `3 / 5` progress position. They are not part of the active patient flow
or any clinical decision. The
time-based variant is for `SITTING` and `WALKING`; the repetition-based variant
is for `SIT_TO_STAND`, `BEND_PICK_UP`, `LIFT_CARRY`, and `BED_MOBILITY`.
`OTHER` and unknown activity values do not show held `PAIN_F03` until a unit is
clinically defined. The repetition screen was visually checked at 800×1280 with
six option cards, Noto Sans KR typography, and no frame overflow.

Screen 04 is a Figma-only multi-select draft with six plain-language reasons:
pain increase, weakness, stiffness/mobility loss, numbness/sensory discomfort,
fear of worsening, and other. Screen 05 is a Figma-only single-select draft
with seven recovery buckets from immediate recovery through two or more days,
plus unknown. Screen 04 was visually checked at 800×1280. Screen 05's seven-card
layout was checked at the same size. The cloned activity chip was subsequently
confirmed in a fresh rendered screenshot and property inspection: `203×38`,
`8/14/8/14` padding, 12 px radius, and no frame overflow. Both screens must
remain outside the runtime schema until clinical
review confirms wording, required status, multi-select behavior, and bucket
boundaries.

Figma uses Noto Sans KR because Pretendard is unavailable in the editor environment. Production code should continue to prefer Pretendard with a Korean system-font fallback.

## Implementation sequence

1. Add the new question model without deleting existing safety items.
2. Introduce reusable tablet option-card and navigation primitives.
3. Implement the first three Figma screens and backward-answer persistence.
4. Add function, tolerance, limiting-response, and recovery screens.
5. Map the new answers into a Doctor View summary behind existing safety priority.
6. Add unit/integration coverage and perform a landscape-tablet visual pass.

## Acceptance gates

- Existing automated safety tests pass unchanged.
- New question IDs have stable answer schemas and tests.
- Keyboard-free happy path works on a tablet viewport.
- Back navigation does not erase completed answers.
- Doctor View never hides a safety alert beneath functional findings.
- All clinical-review TODOs are visible in the PR description or review ledger.
