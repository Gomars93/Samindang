# TABLET_V2_2_PAIN_FAST_TRACK_AND_HERBAL_ADDON.md

Tablet Questionnaire UX v2.2 — introduces an explicit **Questionnaire Depth
Mode** (`pain_fast` / `expanded` / `herbal_addon`) so a pain-treatment
patient can finish with only the pain-relevant content instead of
automatically continuing into the 한약/체질 systemic block, plus a Body Map
front/back visual fix, a wide-landscape 3-zone rail layout, and a scroll-hint
overlap fix. No clinical threshold, safety rule, `PAIN_01` enum, or FROZEN
`src/spec/*Logic.ts`/`*Adapter.ts` file changed — this is entirely a
workflow/UX routing task on top of the existing engine from PR #19/#20.

Base: `main` at `f5f68c4d163de822b2b91983c7670c9a3d3bf71c` (PR #20 merged).
Branch: `ux/tablet-v2-2-pain-fast-track`.

## 1. The bug this task fixes

Before this change, `HERBAL_REFERENCE_QUESTIONS` (`HERB_APPETITE`,
`HERB_THERMAL`, `HERB_THIRST`, `HERB_SWEAT` — "평소 식욕은 어떠신가요?" etc.,
`src/spec/coreSpec.ts`) had **no `showIf` at all** — they were unconditionally
included in `ALL_QUESTIONS` and shown to *every* patient regardless of visit
intent, including a patient whose entire purpose was "아픈 곳 치료"
(`pain_care`). This is exactly the real-device symptom the product owner
reported: a pain-only patient hitting "평소 식욕은 어떠신가요?" with no way to
skip it. `CONSTITUTION_BASIC_QUESTIONS` (`CONST_ENERGY`/`CONST_SLEEP`/
`CONST_DIGESTION`/`CONST_BOWEL`) had a *partial* gate (`visitGoal(r) ===
'constitution'`, or for `CONST_DIGESTION`/`CONST_BOWEL` the even narrower
legacy-only `r['VISIT_01'] === 'constitution'`) that also missed the new
`VISIT_00_INTENT === 'herbal'` flow when the patient picked the
`VISIT_00B_HERBAL_PURPOSE === 'symptom'` sub-choice (see §3 below).

## 2. `questionnaireMode(r)` — the three modes

`src/spec/coreSpec.ts` exports:

```ts
export type QuestionnaireMode = 'pain_fast' | 'expanded' | 'herbal_addon'
export const HERBAL_ADDON_FIELD = 'HERBAL_ADDON_ACTIVE'

export const questionnaireMode = (r: Responses): QuestionnaireMode => {
  if (r[HERBAL_ADDON_FIELD] === 'yes') return 'herbal_addon'
  const intent = r['VISIT_00_INTENT']
  if (intent === 'herbal') return 'expanded'
  if (intent != null) return 'pain_fast'
  // legacy raw-fixture path (VISIT_00_INTENT never set)
  return visitGoal(r) === 'constitution' ? 'expanded' : 'pain_fast'
}
```

### `pain_fast` (default for every non-herbal, non-addon patient)

Per the task's own §13 wording, `pain_care` is the named case, but the
*semantic* requirement is symmetric with §19 ("증상 상담 ≠ 자동 한약문진"):
no non-herbal intent should auto-open the systemic block. `symptom_consult`,
`women`, `weight`, and `undecided` are therefore also `pain_fast` — they
already never triggered `CONST_*`/`HERB_*` intentionally in the old partial
gate, and the fix keeps that true unconditionally. **DoctorView only shows
the "통증 Fast Track" badge when `primary_concern === 'pain'`** — labelling
a women's-health or weight-management visit "통증 Fast Track" would be
inaccurate, so no badge renders for those (§7 below).

Scope included (task §14): 방문 목적 → Pain Body Map → regional pain FULL
module (LBP/HIP/NECK/SHOULDER/KNEE/ELBOW/WRIST_HAND/ANKLE_FOOT/TMJ, whichever
applies) → that module's own safety/red-flag questions (unchanged, these
live *inside* the regional module, not in the systemic block — see §4) →
global safety (`SAFETY_01`) → Additional Detailed Concern's FULL module if
chosen → Reference Symptoms → minimum history (§4) → finish. The systemic
block (`HERB_*`/`CONST_*`) is skipped entirely.

### `expanded`

`VISIT_00_INTENT === 'herbal'`, **regardless of which
`VISIT_00B_HERBAL_PURPOSE` sub-choice is picked** — this is a deliberate
change from the old partial gate. Previously, picking herbal intent with
purpose `'symptom'` ("불편한 증상 치료") made `visitGoal(r)` resolve to
`'symptom'` (not `'constitution'`), so the old `CONST_ENERGY` gate
(`visitGoal(r) === 'constitution'`) silently never fired for that patient —
a real gap, since the whole point of choosing 한약·보약 상담 is a systemic
read regardless of which symptom brought them in. The task's own §18
("처음부터 한약이 목적이면 expanded questionnaire를 탄다") settles this:
`expanded` now depends only on `VISIT_00_INTENT`, not on the purpose
sub-choice. The legacy raw-fixture route (`VISIT_01 === 'constitution'`, no
`VISIT_00_INTENT`) is preserved unchanged for backward compatibility with
existing tests/fixtures that construct raw `Responses` directly.

### `herbal_addon`

Set only by the new staff-only "한약 추가문진 시작" control (§6) via the
internal `HERBAL_ADDON_FIELD` — never by anything the patient answers.
Behaves identically to `expanded` for the purpose of the systemic-block
`showIf` gate (`showsExpandedSystemicBlock(r) = mode === 'expanded' || mode
=== 'herbal_addon'`), but is tracked as a separate mode value so DoctorView
can show the distinct "한약 추가문진 완료" badge (§7) instead of conflating
it with a patient who chose herbal intent from the start.

## 3. Question audit: what stays in `pain_fast`, what's skipped

Per the task's explicit instruction ("임의로 clinical 질문을 삭제하지 말 것
... source code dependency를 authoritative로 판단"), every candidate
question below was checked by `grep`ing its `variable`/id against
`src/spec/*Logic.ts`, `*Adapter.ts`, and `DoctorView.tsx` — not judged by
name alone.

| Block | Question ids | Category | Dependency evidence |
|---|---|---|---|
| `SAFETY_QUESTIONS` | `SAFETY_01` | **A — kept** | `computeFlags()` (`generalRed`), consumed by every regional `*Logic.ts` via `computeFlags(r).general_red`, and by `DoctorView`'s "안전 확인 필요" banner. |
| `HISTORY_QUESTIONS` | `MED_USE`, `MED_TYPES` | **A — kept** | Rendered directly in DoctorView's "약물·병력·알레르기·수술" section; referenced by name in `helperIf` (지참 안내) and read by clinicians before prescribing/needling. No `*Logic.ts` computed field consumes it (it's a clinician-read-only safety cue, not an automated gate), but it is exactly the "약물/procedure safety" category the task names in its own §15 example list. |
| | `HISTORY_01` (질환 flags incl. `osteoporosis`) | **A — kept** | `osteoporosis` is consumed by `lbpLogic.ts`'s fracture-risk modifier (per the LBP_V1 decision log comment at that option's definition); the rest of the flag set is read directly by DoctorView. |
| | `ALLERGY_01`, `ALLERGY_02` | **A — kept** | Direct clinician safety cue before 투약/약침 (DoctorView "약물·병력·알레르기·수술"); explicitly named in the task's own §15 example list. |
| | `SURGERY_01` | **A — kept** | Same as above — 큰 수술/입원력, named in the task's §15 example list, DoctorView safety section. |
| | `WOMEN_SAFETY_01` | **A — kept** | `deriveReproductiveStatus(r)` feeds `pregnant`/`breastfeeding`/`postpartum_1y` into `toLbpState`/`toNeckState`/`toShoulderState` (herbal/needling pregnancy-safety gating) — a hard regional-safety dependency, not optional. |
| | `TEST_01` | **A — kept** | Recent-abnormal-test flag, clinician-read safety cue (DoctorView), same category as `MED_USE`/`SURGERY_01`. |
| `CONSTITUTION_BASIC_QUESTIONS` | `CONST_ENERGY`, `CONST_SLEEP`, `CONST_DIGESTION`, `CONST_BOWEL` | **B — skipped in `pain_fast`** | Grepped against every `*Logic.ts`/`*Adapter.ts`/`DoctorView.tsx` safety computation: zero references outside `coreSpec.ts`'s own `constitution_basics` payload section and `DoctorView`'s "전신·한약 참고" *display* (not a safety gate). Pure 한약/체질 assessment. |
| `HERBAL_REFERENCE_QUESTIONS` | `HERB_APPETITE`, `HERB_THERMAL`, `HERB_THIRST`, `HERB_SWEAT` | **B — skipped in `pain_fast`** | Same grep result as above — zero safety-computation references anywhere. This is the exact block the product owner saw leak into a pain-only patient's flow. |
| `PAIN_QUESTIONS` + all regional module questions (`LBP_*`, `NECK_*`, `SHOULDER_*`, `KNEE_*`, `ELBOW_*`, `WH_*`, `AF_*`, `TMJ_*`, `HIP_*`, incl. their own red-flag/systemic-screen sub-questions e.g. `NECK_05` systemic red-flag screen, LBP inflammatory-pattern/45세 이전 발병/recovery-expectation items) | **Exception — kept, never touched** | These are *inside* a CLOSED regional module, not the global herbal/systemic block (§17 distinction). They feed `computeLbpFlags`/`computeNeckFlags`/etc. directly. §0 of the task explicitly forbids deleting or shortening these "because they look long" — their clinical necessity is a separate, already-CLOSED decision (`docs/`/`tablet core/` clinical decision records), cross-referenced here, not re-litigated. **This task changed zero characters inside any regional module's question list or any `*Logic.ts`/`*Adapter.ts` file** (verified: `git diff origin/main -- 'src/spec/*Logic.ts' 'src/spec/*Adapter.ts'` is empty). |
| `SECONDARY_SHORT_QUESTIONS` (`SEC_SLEEP_01` etc.) | — | Already dead code for the new-flow patient (gated on legacy `SECONDARY_01`, which is itself hidden once `VISIT_00_INTENT` is set — PR #19/#20's own migration). Untouched; still exercised by legacy raw-fixture tests. |

**Bottom line**: the *only* questions whose visibility this task changed are
the 8 systemic-block ids (`CONST_ENERGY/SLEEP/DIGESTION/BOWEL`,
`HERB_APPETITE/THERMAL/THIRST/SWEAT`) — every regional pain module, every
global-safety/history/allergy/surgery/reproductive-safety question, and
every FROZEN `*Logic.ts`/`*Adapter.ts` file is byte-for-byte unchanged.

## 4. "Regional module internal" vs. "global systemic block" (§17)

To be explicit about the distinction the task calls out: a question like
`NECK_05` (neck systemic/red-flag screen) or LBP's inflammatory-pattern /
45세 이전 발병 / recovery-expectation items *looks* systemic by name, but it
is defined inside `NECK_QUESTIONS`/`LBP_QUESTIONS`, gated by that module's
own `IS_PRIMARY_NECK`/`IS_PRIMARY_LBP` predicate, and consumed by that
module's own `computeNeckFlags`/`computeLbpFlags`. It stays visible in
`pain_fast` because the patient is *in that regional module* — this is
never touched by `questionnaireMode`. Only the two blocks that sit outside
every regional module and exist purely for 한약/체질 assessment
(`CONSTITUTION_BASIC_QUESTIONS`, `HERBAL_REFERENCE_QUESTIONS`) are gated by
`showsExpandedSystemicBlock`.

Whether any individual LBP/NECK/etc. question could itself be shortened is
**out of scope for this task** — those questions were CLOSED under a
separate clinical decision (see `docs/` LBP/NECK/etc. integration reports)
and this task does not create new clinical reasoning about them. **This
task changed nothing inside any regional module; that section stays
exactly as CLOSED.**

## 5. Herbal Add-on: reachability fix (`reorderForDetailPhases`)

Turning on `HERBAL_ADDON_FIELD` mid-session makes `CONST_*`/`HERB_*`
`showIf`-eligible again, but `App.tsx`'s `nextQuestion()` is a strictly
forward-only walk over `visibleQuestions(r)` (same constraint PR #20's
Primary/Additional ordering fix already worked around). Since
`CONSTITUTION_BASIC_QUESTIONS`/`HERBAL_REFERENCE_QUESTIONS` sit at a fixed
array position *before* `HISTORY_QUESTIONS`/`BIRTH_QUESTIONS`/
`FREE_TEXT_QUESTIONS`, a patient who has already progressed past that point
(e.g. mid-`HISTORY_QUESTIONS`, or fully finished) would never see them
again with a naive static-position fix — they'd sit behind the current
walk position forever.

`reorderForDetailPhases` (extended, `src/spec/coreSpec.ts`) now computes a
`systemicItems` bucket (ids from the new exported `SYSTEMIC_BLOCK_QUESTION_IDS`,
built directly from the same two arrays — no drift risk) and inserts it
**immediately before the first still-unanswered `postList` item**, not at a
fixed group boundary:

```ts
const firstUnansweredPostIdx = postList.findIndex(
  (q) => r[q.id] === null || r[q.id] === undefined,
)
const insertAt = firstUnansweredPostIdx === -1 ? postList.length : firstUnansweredPostIdx
```

This is a strict no-op for the pre-existing `expanded` case: on first entry,
nothing in `postList` (History/Birth/Free-text) is answered yet, so
`firstUnansweredPostIdx === 0` and the systemic block lands exactly where
the static array already had it. For `herbal_addon`, it lands wherever the
patient actually is — right after everything already answered, right
before whatever's still pending — guaranteeing forward-reachability
regardless of how far into the flow the activation happens (proven by
`tests/integration.spec.mjs` §V-AddonFull, activated only after 100%
completion, and §V-AddonPartial, activated mid-`HISTORY_QUESTIONS`).

## 6. Herbal Add-on: how it's actually triggered (and what isn't supported)

**Investigated first, per the task's own §22 instruction**, before designing
anything new:

- `StaffCheckScreen` is an unrelated red-flag interstitial with no
  session/token concept.
- `App.tsx` holds all in-progress `responses` purely in React `useState` —
  no `localStorage`/`sessionStorage`. A page reload loses everything.
- The moment `phase` becomes `'done'`, an effect (`App.tsx` ~L150) builds
  the submission payload and calls `doSubmit()`; the moment `submitState`
  resolves to `'success'` or `'unconfigured'`, a second effect (~L204)
  immediately wipes `responses`/`meta` for shared-tablet privacy. Neither of
  these was touched by this task (§0/§23 explicitly forbid weakening the
  privacy wipe).
- The local handoff server (`server/*.js`) is write-once from the tablet's
  perspective (`POST /api/submissions`, no GET exposed to patients) and has
  no session/URL/token mechanism designed for a tablet to *resume* a
  specific patient's in-progress answers. `activeVisit.js`'s in-memory
  "who's in the room" pointer and the `x-doctor-token` doctor-auth header
  are the closest existing primitives, but neither currently touches the
  tablet's question-flow state.

**Conclusion**: there is no existing, safe way to resume a session *after*
submission finalizes and the privacy wipe fires, without inventing a new
identifier (URL param, token, QR) that the task explicitly forbids
("insecure query parameter, PHI 포함 URL, guessable token을 만들지 않는다").

**What was built instead** (same-session, same-device, zero new
infrastructure): `src/screens/StaffHerbalAddonHold.tsx` — a small,
discreet, 2-second-hold control (identical trust model to the existing
`StaffResetHold` on the completion screen: "whoever is physically holding
the tablet is trusted staff," no new crypto/tokens), rendered by `App.tsx`
**only while `phase === 'question'`** (i.e., strictly *before* submission —
the automatic submit-and-wipe sequence never fires until the patient
reaches the end and the tablet moves past `'question'` phase). Activating it
merges `{ HERBAL_ADDON_FIELD: 'yes' }` into the current, still-live
`responses` via the existing `pruneStaleResponses`, exactly like any other
answer. This means:

- **A**: same-device/same-session herbal add-on flow — **implemented**,
  usable any time before the patient's questionnaire is submitted (i.e.
  while the doctor/staff is still with that patient and the tablet hasn't
  moved to the next one).
- **B**: cross-device (doctor's own PC → patient's tablet, *after*
  submission and privacy wipe) resume — **OPERATIONAL INTEGRATION
  REQUIRED**. This would need new server-side infrastructure (a
  continuation record + some identifier delivered to the tablet) that does
  not exist today and was not built here, per the explicit instruction not
  to invent an insecure ad-hoc mechanism. If the clinic's workflow needs
  this (doctor decides *after* reviewing an already-submitted record in
  DoctorView), it is a separate, larger integration decision requiring
  human sign-off on the security model.

### Preview/QA simulation (§24)

`PatientCompleteScreen.tsx`'s dev-only "개발자 보기" door gained a second,
independently-gated button, "한약 추가문진 미리보기 (QA)" — visible when
`import.meta.env.DEV || import.meta.env.VITE_PREVIEW_MODE === 'true'` (i.e.
local dev *or* the GitHub Pages NO-PHI preview build, never a real
production build). It performs no server call and does not touch any live
session — it statically lists the systemic-block question labels (from
`ALL_QUESTIONS`, baked in at build time) so a reviewer can see what would
newly unlock, without any patient data ever being involved. Confirmed
compiled out of the real production bundle by
`tests/preview-build.spec.mjs` (mirrors the existing preview-banner
tree-shaking check).

## 7. DoctorView: mode badge

A small, muted pill ("진료 문진 — <label>") renders below the safety banners
and above "환자 기본" — deliberately positioned and styled to never compete
with the "안전 확인 필요" danger banner above it (§33's explicit constraint).
Exactly the three labels the task specifies:

- `expanded` → "한약 Expanded"
- `herbal_addon` → "한약 추가문진 완료"
- `pain_fast` **and** `primary_concern === 'pain'` → "통증 Fast Track"
- Any other `pain_fast` case (symptom_consult/women/weight/undecided
  primary) → no badge (labelling a non-pain visit "통증 Fast Track" would
  be inaccurate).

`buildRoutingPayload()` now includes `questionnaire_mode` in its return
value, so both fixture-mode and server-mode DoctorView records pick it up
automatically through the same builder every other routing field already
uses. Records submitted before this change (server mode, old JSON) simply
have `questionnaire_mode: undefined`, which resolves to "no badge" — a safe,
non-breaking fallback.

## 8. Body Map: front/back distinction + selected-region label

**Front/back cue** (`src/components/BodyMap.tsx`'s `Silhouette`, now
`view`-aware): front adds two small dot "eyes" plus a chest midline; back
adds a spine midline plus two short symmetric curves suggesting shoulder
blades. Both are pure decoration (`fill`/`stroke` only, no pointer events,
no new zone/enum), gender-neutral, monochrome, still local inline SVG (no
remote assets). The existing "앞면"/"뒷면" text labels are unchanged and
still present — the cue is additive, not a replacement, so the fix degrades
gracefully for anyone who still reads the text.

**Selected-region label**: a single `<p className="bodyMap__selectedLabel">`
above the two figures shows "부위를 선택해주세요" when nothing is chosen yet,
and "선택한 부위: **<label>**" (e.g. "허리·골반") once a zone is tapped,
updating immediately on every selection change. Deliberately a single
"current selection" line rather than per-zone overlay text, per the task's
own instruction not to clutter the map with labels on every zone. The
existing per-zone ✓ badge/highlight is unchanged.

**Arm/hand coarse routing — confirmed untouched (§4)**: `PAIN_01`'s
`'arm_hand'` value already routes through the existing
`ARM_HAND_ROUTING_QUESTIONS` (`ELBOW_00`, 5 options: `ELBOW`/`FOREARM`/
`WRIST_HAND`/`DIFFUSE_OR_MULTIPLE`/`UNKNOWN`) to disambiguate elbow vs.
forearm vs. wrist/hand before either `ELBOW_QUESTIONS` or
`WRIST_HAND_QUESTIONS` opens. Body Map only ever emits the coarse
`'arm_hand'` value (verified: `BodyMap.tsx`'s `ZONES` table uses the exact
same value PAIN_01 already has, no invented enum) — tapping "팔·손" on the
map does not skip or infer past `ELBOW_00`; the next screen still asks the
patient to disambiguate, exactly as before. `tests/integration.spec.mjs`
§V-ArmHand and the existing regional test suites (`elbow.spec.mjs`,
`wrist-hand*.spec.mjs`) cover this unchanged.

## 9. Landscape wide-tablet 3-zone layout

New breakpoint: `@media (min-width: 1000px) and (orientation: landscape)`
(chosen to match the real 11"-class tablet landscape viewports already
covered by `tests/viewport-budget.spec.mjs`, 1280×800 and 1600×900, while
staying safely away from any portrait viewport in the existing test matrix).

`.shell` becomes a 3-column CSS Grid (`minmax(72px, 104px) | minmax(0, 1fr)
| minmax(72px, 104px)`) only inside that breakpoint. Because the back
button is nested three levels deep inside `<header>` (and the help
button/step label inside `<footer>`), CSS Grid alone cannot re-parent them
into separate columns without either JS-driven conditional rendering or a
duplicate-markup + CSS-visibility-toggle pattern. This uses the latter: a
second copy of each control (`.railBackBtn`, `.shell__railRight` containing
`.railStepLabel`/`.railHelpBtn`) exists in the DOM at all times, but is
`display: none` outside the wide-landscape breakpoint and the *original*
in-header/in-footer controls are `display: none` *inside* it — exactly one
copy is ever visible, focusable, or in the accessibility tree at a time
(`display: none` elements are automatically excluded from both), so this
never produces duplicate tab stops or duplicate screen-reader
announcements. Portrait/narrow rendering is provably byte-identical to
before, since every rail element and every hiding rule only exists inside
the new media query (`tests/viewport-budget.spec.mjs` §5 verifies both the
default `display: none` and the inside-breakpoint swap).

The primary CTA button itself stays in `.shell__bottom` (main content
column) in all cases — only the step label and "입력이 어려워요" move to the
right rail, and only the back button moves to the left rail, exactly as
specified (§7/§8).

**Progress bar footprint** (§9): reduced via spacing only inside the wide
breakpoint (`.shell__top`'s `padding-top` 20px→12px, `.steps`'
`margin-top` 16px→10px) — no font-size change, per the explicit
instruction to avoid that particular shortcut.

**Content width** (§10): `ScreenShell` gained a `wideContent` boolean prop,
set in `App.tsx` from `current.layout != null && current.layout !== 'list'`
— i.e. `grid2`/`compact3`/`body_map` screens get a wider `900px` column
inside the wide-landscape breakpoint, while any screen using the default
`'list'` layout (which, per the existing `Question.layout` convention, is
always safety/protected/long-text screens) keeps the original `680px`
column. Pure presentation, driven by the same `Question.layout` metadata
that already exists for this exact purpose — no new clinical/validation
semantics.

## 10. Scroll hint overlap fix

**Symptom** (real-device QA): the "아래에 항목이 더 있어요 ↓" pill
(`position: sticky; bottom: 0; height: 84px`) could visually cover the
bottom of the last visible option while scrolling, because `.shell__main`'s
own bottom padding (28px) was smaller than the pill's height — once the
scroll viewport's bottom edge got within 84px of the true content end, the
pill's occlusion zone could reach into real option text, not just empty
padding.

**Fix**: `.shell__main`'s bottom padding raised to 96px (`>` the pill's
84px height) and `scroll-padding-bottom` raised to match. This guarantees
the last real content row's bottom edge always sits at least
`96 - 84 = 12px` (minus a 1px "at-bottom" epsilon) clear of the pill's
topmost reach for the entire time the pill is shown — proven algebraically
in the `styles.css` comment at that rule and enforced as a regression by
`tests/body-map.spec.mjs` §9 (`.shell__main` bottom padding `>=`
`.shell__scrollHint` height, read directly from the stylesheet). The pill
already had `pointer-events: none` and already disappeared once the true
bottom was reached (both pre-existing, unchanged, and now newly enforced by
`tests/body-map.spec.mjs` §9's `pointer-events: none` assertion).

## 11. Layout quantitative comparison (§35)

Measured via the same deterministic character-count heuristic
`tests/viewport-budget.spec.mjs` already uses (no headless browser in this
repo's test tooling — see that file's own header comment for why), at the
1600×900 large-landscape viewport, before vs. after this task's CSS-only
top-chrome trim (§9):

| | v2.1 (before) | v2.2 (after, wide-landscape breakpoint active) |
|---|---|---|
| `.shell__top` padding-top | 20px | 12px |
| `.steps` margin-top | 16px | 10px |
| Estimated top chrome reduction | — | 14px recovered into the main question viewport |

This is a modest, honest number — the wide-landscape rail layout's actual
benefit is **horizontal** (reclaiming left/right margin into left/right
rails instead of leaving it empty beside a centered 680px column), not
primarily vertical; the vertical win from §9 alone is the 14px above. The
main-content-width increase (680px → 900px for `grid2`/`compact3`/
`body_map` screens, §9 above) is the dominant, directly-measurable change:
`tests/viewport-budget.spec.mjs`'s own per-viewport summary (unaffected by
the wide-content class, since that test's heuristic budgets width
independent of layout) continues to confirm `contentWidth` stays capped and
sane at every target viewport; the wide-landscape column widening is
verified structurally (§5 of that file) rather than via the character-count
estimator, since the estimator's box-model constants are calibrated to the
base 680px column.

## 12. Tests

New/extended coverage, all run via `npm run test:all` (JS/TS) +
`cd "tablet core" && python3 -m pytest tests/ -q` (Python, FROZEN
Logic/Adapter — confirms zero behavior drift even though zero lines
changed):

- `tests/integration.spec.mjs` §V (26 new assertion groups, +59 individual
  assertions over PR #20's 915 → 974 total): Cases A/B/C/D (systemic block
  hidden for pain-primary regardless of Additional/Reference choice;
  expanded for every herbal-purpose sub-choice), `symptom_consult` does not
  auto-expand, back-navigation mode switch (pain_care↔herbal) both promotes
  correctly and prunes expanded-only answers via the pre-existing
  `pruneStaleResponses` (no new pruning logic needed), arm_hand coarse
  routing unaffected, Herbal Add-on reachability from both the
  fully-completed and the mid-`HISTORY_QUESTIONS` activation point, and a
  direct proof that `questionnaireMode` never depends on unrelated response
  keys.
- `tests/doctor.spec.mjs`: unchanged pass count (653/653) — one existing
  fixture-selection fix required (see below), no new failures.
- `tests/body-map.spec.mjs` (50 → 63): front/back cue markup, selected-label
  text for no-selection/selected/changed-selection, and the scroll-hint
  padding-vs-height regression.
- `tests/viewport-budget.spec.mjs` (18 → 30): wide-landscape rail markup +
  CSS existence, grid/rail widths, original controls hidden inside the
  breakpoint (not duplicated), `wideContent` derivation in `App.tsx`.
- `tests/preview-build.spec.mjs` (25 → 27): herbal-addon QA preview text
  present in the preview build, absent (tree-shaken) from the real
  production build — same guarantee the preview banner already had.

**One pre-existing fixture had to be swapped, not the assertion's intent**:
`tests/doctor.spec.mjs`'s "전신·한약 참고 populated" test used the
"수면 주호소 + 동반 소화/통증" fixture (`VISIT_01: 'symptom'`, i.e.
`pain_fast` under the new gate) purely because `BASE_DEFAULTS` happened to
set `HERB_*` fields on every fixture regardless of relevance — once those
fields correctly stop showing (and therefore get pruned) for a `pain_fast`
patient, that fixture no longer represents a "populated constitution
section" case. Swapped to the pre-existing "체질·보약" fixture
(`VISIT_01: 'constitution'`, i.e. `expanded` under the new gate, with
`CONST_*` values already set in its own patch) — the semantically correct
representative case for that specific assertion. No test intent changed,
no coverage lost.

## 13. FROZEN zero-diff

```
git diff origin/main -- 'src/spec/*Logic.ts' 'src/spec/*Adapter.ts'
```

returns empty. No CLOSED clinical decision doc content was edited. This
task's only `coreSpec.ts` changes are: a new `questionnaireMode` function
and its `HERBAL_ADDON_FIELD`/`SYSTEMIC_BLOCK_QUESTION_IDS`/
`showsExpandedSystemicBlock` support, 8 new `showIf` gates on
already-existing (non-FROZEN) questions, an extension to the existing
`reorderForDetailPhases` (PR #20's own mechanism, not new architecture),
and one new field (`questionnaire_mode`) appended to `buildRoutingPayload`'s
return object.

## 14. Known limitations

- Cross-device (doctor dashboard → patient tablet, post-submission) Herbal
  Add-on resume is **not implemented** — see §6 above.
  OPERATIONAL INTEGRATION REQUIRED if the clinic needs this; it requires a
  new security-model decision, not just more UI.
- The wide-landscape rail layout was verified with this repo's existing
  character-count/source-inspection test methodology (no headless browser
  in the toolchain — same limitation `tests/viewport-budget.spec.mjs`'s own
  header comment already documents for v2.1). A real-device landscape
  screenshot pass (like the one that originally found the v2.1 Body Map
  bug) is recommended before merge, same as v2.1's own documented residual
  risk.
- `pain_fast` vs. `expanded`/`herbal_addon` is a UX/routing distinction only
  — it does not change what a *repeat visit* (재초진) re-asks; that policy
  question is explicitly out of scope for this task (§25), and
  `tests/integration.spec.mjs` §T6/§V-ModeAgnosticToVisitType confirm mode
  routing is not bypassed by any visit-type concept (none exists in the
  question set today).

## 15. v2.2.1 addendum — real-device correction (branch `ux/tablet-v2-2-1-real-device-correction`)

Real 11" Android tablet landscape screenshots after this PR merged showed
the wide-landscape rail layout never activating and (reportedly) the
systemic-block spillover bug still occurring. This addendum documents the
root-cause investigation and fixes, base `main` @ `784a9bd`.

### 15.1 Landscape breakpoint — root cause: threshold, not viewport-meta bug

`index.html`'s viewport meta tag was already correct
(`width=device-width, initial-scale=1.0`), ruling out the common "virtual
980px desktop viewport" class of bug. The actual cause: `@media
(min-width: 1000px) and (orientation: landscape)` was simply higher than
the real CSS-px landscape width of the tested device. An 11" Android
tablet's landscape **CSS viewport** (what media queries evaluate against)
is driven by `devicePixelRatio`, not raw physical resolution — a common
1920×1200-physical panel at DPR 2 renders a 960×600 CSS-px viewport, well
under 1000px. Fixed by lowering the breakpoint to `@media (orientation:
landscape) and (min-width: 760px)`, matching the four real-device-QA
viewports the task named (1280×800, 1024×640, 960×600, 800×500 — all now
verified structurally in `tests/viewport-budget.spec.mjs` §7, which
extracts the threshold from `styles.css` itself rather than re-hardcoding
it, so the two can never silently drift apart again). `orientation:
landscape` is evaluated by the browser from the viewport's own
width-vs-height relationship, not from the width number — lowering the
threshold carries zero risk of misfiring on any portrait viewport.

### 15.2 Rails weren't actually reclaiming space — two compounding causes

1. **Center column width unchanged.** `wideContent` capped at 900px, only
   marginally more than the base 680px. Raised to 960px (§10's requested
   880-1000px range).
2. **Vertical chrome not actually removed.** `.shell__topRow` kept its
   default `min-height: 56px` even after `backBtn`/`stepLabel` moved to
   rails and were hidden — the *space* stayed reserved, only the *content*
   disappeared. Fixed by explicitly collapsing `.shell__topRow`'s
   min-height inside the wide-landscape block, trimming `.shell__top`'s
   padding-top (12px→8px) and `.steps`'s margin-top (10px→6px), and
   thinning the progress bar itself (`.steps__item` 10px→6px — spacing/
   size, never font-size, per the explicit instruction).

`tests/viewport-budget.spec.mjs`'s `budgetFor()` heuristic was updated to
model the wide-landscape chrome reduction (previously it only knew the
default/portrait chrome constants, which understated available height for
every landscape viewport). Measured, before vs. after, at the reference
1280×800 real-device-QA viewport:

| | v2.2.1 estimate before this fix | after this fix |
|---|---|---|
| Header chrome height | 102px | 20px |
| Footer chrome height (helpBtn moved to rail) | 186px | 116px |
| **Available question-viewport height** | **456px** | **608px** |

A **152px** recovery at 1280×800 (and proportionally more at the smaller
real-device viewports — e.g. 1024×640 goes from a heuristic-estimated
296px, which was actually *below* this test file's own 300px "usable
screen" floor, to 448px). This is the §35/§15 "actual CSS/viewport
measurement, not 'looks wider'" acceptance criterion, captured as a
permanent regression (`tests/viewport-budget.spec.mjs`'s per-viewport
summary output).

### 15.3 Systemic-block spillover — investigated, NOT reproduced on this baseline

This was treated as the highest-priority item and investigated by actually
walking the patient flow — never by re-reading the `showIf` gate and
declaring it sufficient. `tests/integration.spec.mjs` §W1-W3 (12 new
assertion groups) start from a completely blank `Responses` object
(`emptyResponses()`, matching `App.tsx`'s real `useState` initializer) and
answer one screen at a time via the actual `visibleQuestions`/forward-only-
walk semantics — never a pre-seeded final state — covering: the exact
route named in the task (ID → `VISIT_00_INTENT=pain_care` → duration/
impact → `SAFETY_01` → `PAIN_01=low_back_pelvis` → every required LBP
sub-question → `ADDITIONAL_DETAIL_01=none` → `REFERENCE_SYMPTOMS_01=[none]`
→ finish) for both `male`/`female`, both "always pick the first option"
and "always pick the last option" strategies for every LBP/history/birth
question the walk encounters along the way (broadening branch coverage
beyond the one route named), and a parallel walk with
`ADDITIONAL_DETAIL_01=sleep` (Case B, walked for real rather than only
visibility-checked).

**Result: in every one of these walks, on `main` @ `784a9bd`, zero
systemic/herbal questions (`CONST_*`/`HERB_*`) ever appear in the visible
list or get answered, and the `step === '전신 정보'` question count is
exactly 0.** `questionnaireMode(r)` stays `'pain_fast'` throughout.

All seven hypotheses in the task's §10 were checked directly against
source, not assumed:

- `questionnaireMode` flipping mid-flow: its implementation only reads
  `VISIT_00_INTENT`/`VISIT_01`/`HERBAL_ADDON_FIELD` — none of which change
  as a side effect of anything else in the walk (`ADDITIONAL_DETAIL_01`/
  `REFERENCE_SYMPTOMS_01` values have zero effect on it, confirmed by
  Case B/§V-CaseB and the new §W3).
- `HERBAL_ADDON_ACTIVE` becoming accidentally 'yes': the only write site is
  `App.tsx`'s `activateHerbalAddon()`, gated behind the staff-only 2-second
  hold control; nothing else in the codebase ever sets it.
- Back-navigation prune mishandling the internal field: already covered by
  §V-BackSwitch (pain_care↔herbal round-trip) — expanded-only answers
  (including the field itself) are pruned exactly like any other
  now-invisible question, no special-casing needed.
- `reorderForDetailPhases` reinserting a systemic question: structurally
  impossible for `pain_fast` — it only ever reorders items already present
  in the showIf-filtered `list`, and systemic questions never pass that
  filter when `showsExpandedSystemicBlock(r)` is false in the first place.
- The dev/preview-only QA simulation touching production state: re-read —
  it only renders static `ALL_QUESTIONS` labels, never calls `setResponses`
  or reads any live session value.
- Stale local/session state surviving a new questionnaire: `App.tsx` has no
  `localStorage`/`sessionStorage` use at all (confirmed again this pass);
  every reset path (`emptyResponses()`, called by both the automatic
  privacy-wipe effect and `restart()`) constructs a brand-new object via
  `Object.fromEntries` and never spreads a previous `Responses` — this is
  now also asserted directly against `App.tsx`'s source
  (`tests/viewport-budget.spec.mjs`).
- `nextQuestion` fallback on a hidden `current.id`: would jump to
  `list[0]` (the very first question), not into a hidden systemic block —
  doesn't match the reported symptom and isn't reachable from any state a
  `pain_care` patient can produce.

**No code defect was found or fixed on this baseline** — per the explicit
instruction not to add a duplicate/redundant `showIf` patch when none is
needed, none was added. The most plausible explanation for the original
real-device screenshot is that the tested device was running a build that
predates this fix landing on `main` (either an out-of-date deployment or a
cached bundle) rather than a defect in the current code. What *was* added
is permanent, exhaustive regression coverage (§W1-W5) that will catch this
exact class of regression immediately if it is ever reintroduced by a
future change — a stronger outcome than a speculative patch would have
been.

### 15.4 Body Map: stronger front/back cue, persistent selection chip, lighter zone fill

- **Front/back cue**: v2.2's cue (`stroke-width: 0.6`, `--text-muted`) was
  confirmed too faint for real-device visibility. Replaced with
  `stroke-width: 2.2` and the higher-contrast `--text` color; front gained
  a mouth (making the face cue unambiguous, not just two dots) and a
  chest/abdomen contour curve; back gained a lower-back/glute contour on
  top of the existing spine + scapula curves. Still gender-neutral,
  monochrome, local inline SVG only — no new anatomy beyond these
  additions.
- **Persistent selected-region feedback**: the existing top label (shown
  above the figures) is retained, but a second compact chip
  (`.bodyMap__selectedChip`, "✓ 선택한 부위: <label>") now renders once a
  zone is selected, `position: sticky; bottom: 84px` — pinned exactly at
  the scroll-hint pill's own height, so on a short screen it just sits in
  normal flow near the figures, and on a scrollable (landscape) screen it
  stays visible while scrolling without ever entering the scroll-hint
  pill's 84px zone (verified: `tests/body-map.spec.mjs` asserts the chip's
  sticky offset is `>=` the pill's height, reading both values from
  source).
- **Zone highlight**: the selected-state fill was changed from the solid
  `--primary-soft` background (which read as "a big translucent box") to a
  much lower-alpha tint plus the existing border outline + checkmark
  badge, so the underlying silhouette shape remains visible through the
  selection. Touch hit-area (the `<button>`'s own size) is completely
  unchanged — only the visual fill/opacity changed.

### 15.5 LBP_10 wording (pure copy change)

"이 허리통증이 처음 시작된 것은 45세 이전인가요?" →
"허리통증이 처음 시작된 나이가 만 45세 이전이었나요?" — `id`, `variable`,
`options` (`NO`/`YES`/`UNKNOWN`), `required`, `showIf` all byte-identical.
No CLOSED clinical semantics, threshold, or `LBP_*` FROZEN adapter/logic
touched. LBP's recovery-expectation questions (`LBP_12`+) were **not**
removed or shortened — per §14 of the task, still deferred to a separate
clinical decision.

### 15.6 HERBAL_ADDON_FIELD stale-reset hardening

No actual leak was found (every reset path already constructed a fresh
object), but `App.tsx`'s `emptyResponses()` now explicitly sets
`[HERBAL_ADDON_FIELD]: null` rather than relying implicitly on the key
simply being absent — makes the guarantee auditable directly in the
source, and is now asserted by both a coreSpec-level test
(`tests/integration.spec.mjs` §W5: a blank `Responses` object is never
`herbal_addon`) and an `App.tsx` source-level test
(`tests/viewport-budget.spec.mjs`: `emptyResponses()` explicitly nulls the
field, and every reset call site uses `emptyResponses()` rather than
spreading a previous session's object).
