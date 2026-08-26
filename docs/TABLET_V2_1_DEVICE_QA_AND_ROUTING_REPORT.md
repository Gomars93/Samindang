# TABLET_V2_1_DEVICE_QA_AND_ROUTING_REPORT.md

Tablet Questionnaire UX v2.1 — device-QA fixes found on a real 11" Android
tablet after PR #19 (Routing/UX v2) merged, plus a structural rework of the
"동반문제" concept into three explicit stages: **Primary Detailed Concern**,
**Additional Detailed Concern** (max 1), and **Reference Symptoms**
(informational only). No clinical threshold, safety rule, or `PAIN_01` enum
meaning changed.

## 1. Three device-QA issues found on real hardware

### 1a. Visit-intent cards — low scan speed, tight fold

**Symptom**: the 6 방문목적 cards (`VISIT_00_INTENT`, `grid2` layout) were
text-only, and the bottom row sometimes sat below the fold on the real
device even though the layout-budget estimator said the screen fit within
budget on the reference viewport.

**Root cause**: (1) no visual pictogram to speed up scanning — every card
had to be read word-by-word; (2) the always-full-size primary CTA button
consumed vertical space even before any card was selected, and the reference
viewport's estimated available height doesn't perfectly match every real
device's effective viewport (browser chrome, system nav bar).

**Fix**:
- Added a local inline-SVG pictogram registry (`src/components/icons.tsx`,
  6 monochrome linear icons, `~36px`, `aria-hidden`, no emoji, no remote
  assets, no new icon library dependency) and a new `Option.icon` field
  (presentation-only, like the existing `Option.description`). Text stays
  the primary information source — icons never carry meaning alone.
- Tightened `grid2` card padding/gap slightly (no font-size change).
- Made the primary CTA button (`.primaryBtn`) compact while `disabled`
  (nothing selected yet) and expand to full size the instant a card is
  selected — pure CSS driven by the existing `disabled` attribute, zero
  interaction/behavior change. No auto-advance was added; "select then
  press 계속" stays exactly as it was.

### 1b. Scroll discoverability

**Symptom**: a lone small "⌄" glyph was the only signal that a screen had
more content below — almost never noticed on the real device.

**Root cause**: `ScreenShell.tsx`'s `shell__scrollHint` was a single
24px glyph with no text.

**Fix**: replaced it with a readable pill banner — "아래에 항목이 더
있어요 ↓" on a `--primary`-colored rounded background, still
`pointer-events: none`, still `aria-hidden` (purely visual, minimal screen
reader noise), still fully disappearing once the user reaches the bottom.
Because `ScreenShell` is the single shared wrapper for every question
screen (list/grid2/compact3/multi-choice/body-map fallback/history), this
fix is automatically applied everywhere — no per-screen wiring needed
(§26 "스크롤 안내 공통화").

Also increased `.shell__main`'s bottom padding and added
`scroll-padding-bottom` so the last option never sits flush against the new
pill. The CTA footer (`.shell__bottom`) was already a separate flex
sibling of the scrollable `.shell__main` (never nested inside it, verified
by `tests/viewport-budget.spec.mjs` §4) — so it can never overlap content;
`#root` already used `100dvh` before this task.

### 1c. Body map rendering bug

**Symptom**: on the real device, the head zone rendered as a giant oval at
the top of the screen and the arm/leg zones rendered as giant rectangles at
the screen edges — not aligned to the silhouette at all.

**Root cause (confirmed in source, not guessed)**: in `BodyMap.tsx`, the
zone `<button>` elements were rendered as **siblings** of
`.bodyMap__figure` inside `.bodyMap__figureWrap`, but only
`.bodyMap__figure` had `position: relative` — `.bodyMap__figureWrap` did
not declare any `position`. Each zone button is `position: absolute` with
percentage-based `top/left/width/height`; a browser resolves those
percentages against the nearest **positioned** ancestor. Since the zone's
direct parent (`.bodyMap__figureWrap`) wasn't positioned, the browser kept
walking up the DOM past it looking for one — on the real device this
landed on a much larger ancestor than `.bodyMap__figure`'s small,
aspect-ratio-locked box, producing exactly the observed giant-oval /
giant-rectangle bug.

**Fix**: moved the zone buttons to be direct children of
`.bodyMap__figure` (the correctly-sized `position: relative` coordinate
container) instead of siblings of it. `.bodyMap__figure` is now the *only*
positioned ancestor in the whole component. A static source-code guard in
`tests/body-map.spec.mjs` pins this permanently: it asserts there is no
closing `</div>` between `.bodyMap__figure`'s opening tag and the
`zones.map(...)` call that renders the buttons — i.e. the exact structural
property that caused the bug can never silently regress.

Replaced the CSS-`<div>`-rectangle silhouette with a single local inline
SVG (`<circle>`/`<rect>` primitives, `viewBox="0 0 60 100"` matching the
figure's existing 3:5 `aspect-ratio` so zone percentages still line up
exactly) — simpler to maintain, resolution-independent, still no
anatomical detail, no gender distinction, no remote asset.

Removed the duplicate instruction: the outer question text
(`PAIN_01.question`) already reads "가장 불편한 한 곳을 눌러주세요"; the
old `BodyMap` component repeated the identical sentence internally. Only
the outer question title remains.

Bounded the body map's overall size: `.bodyMap__figures` now has
`max-width: 520px` (each figure ≈ 252px wide × 3:5 aspect ≈ 420px tall,
inside the requested 380–440px range for an 11" portrait baseline), with a
`@media (max-height: 700px)` rule shrinking it further to `max-width: 380px`
on short/landscape viewports.

## 2. Primary / Additional Detailed Concern / Reference Symptoms

The old `SECONDARY_01` question conflated two different intents: "a symptom
that happens to co-occur" and "a second problem I actually want examined
today." This is now split into three explicit, separately-named stages.

| Stage | Field | Cardinality | Behavior |
|---|---|---|---|
| **A. Primary Detailed Concern** | `VISIT_00_INTENT`/`VISIT_02_*` (unchanged, Routing/UX v2) | 1 | Always opens the FULL module. |
| **B. Additional Detailed Concern** | `ADDITIONAL_DETAIL_01` (new) | 0 or 1 | Opens the FULL module for that one category, reusing the exact same module question set and safety engine as Primary (no clinical logic duplicated). |
| **C. Reference Symptoms** | `REFERENCE_SYMPTOMS_01` (new) | 0 or many | Never opens any module. Purely "the patient flagged this exists" — surfaced to the clinician as a low-emphasis chip, never a diagnosis. |

### Screen order: Primary FULL → Additional Detail question → Additional
FULL → Reference Symptoms question (ordering fix, PR #20 follow-up)

**Original implementation problem**: `App.tsx`'s `nextQuestion()` walks
`visibleQuestions(r)` strictly forward (`list[idx + 1]`) through a *static*
question array — it never jumps to an arbitrary screen. The first version
of this feature positioned `ADDITIONAL_DETAIL_01` once, at a single fixed
array slot (right after `VISIT_QUESTIONS`, before every individual
full-module block), because that was the only way for a category chosen
via Additional Detail to ever become reachable as "the next screen" at
all. But a static array can only ever place one module block "before" or
"after" a given position — never both, depending on which category is
Primary this time. The practical effect was that whichever module
happened to sit earlier in the fixed declaration order (Sleep → GI → Bowel
→ ... → Pain → ...) was shown to the patient first regardless of whether
it was Primary or Additional — e.g. Primary = pain, Additional = sleep
would show Sleep's full detail *before* Pain's, even though Pain was the
patient's actual primary complaint. This was called out as a known
limitation when this PR first opened.

**Fix — phase-aware dynamic reordering**: `visibleQuestions(r)` in
`coreSpec.ts` now reorders its already-showIf-filtered output based on the
current responses, via `reorderForDetailPhases(r, list)`. The static array
still decides *whether* each question is eligible at all (`showIf` is
completely unchanged); the reordering only decides *when*, among the
currently-eligible questions, each one is presented:

1. Patient identity + visit intent/category + global safety (unchanged
   relative order).
2. **Primary's own full module** — every question id belonging to
   whichever category `primaryConcernKey(r)` resolves to, sourced from
   `MODULE_QUESTION_IDS` (built directly from the same arrays
   `CORE_QUESTIONS` splices in, so it can never drift out of sync with
   what's actually in the array — e.g. `pain` includes `PAIN_QUESTIONS`
   plus every regional sub-block: LBP/HIP/SHOULDER/NECK/KNEE/ELBOW/
   WRIST_HAND/ANKLE_FOOT/TMJ).
3. `ADDITIONAL_DETAIL_01`.
4. **Additional's own full module** (if a category was chosen) — same
   `MODULE_QUESTION_IDS` lookup, keyed by `ADDITIONAL_DETAIL_01`'s value.
5. `REFERENCE_SYMPTOMS_01`.
6. Everything else (legacy `SEC_*` short screens, constitution/herbal
   reference, history, birth, free text) — unchanged relative order.

This is a pure reorder, never an add/remove: `pruneStaleResponses` only
ever reads the result as a `Set` (order-independent), so stale-answer
pruning is completely unaffected. For a patient with no Additional Detail
concern at all — or the legacy `SECONDARY_01` path, where
`ADDITIONAL_DETAIL_01` never becomes eligible — this reduces to a strict
no-op: the module region comes out in exactly the same order the static
array already had it in, which is why the entire pre-existing
raw-`Responses` test suite (G2/G3/H1/H2/H3, hundreds of assertions) needed
*zero* changes for this fix.

### Compatibility (§21 migration)

`SECONDARY_01`/`SEC_*` short screens are **not deleted** — they still exist
verbatim for backward compatibility with the pre-existing raw-`Responses`
test-fixture suite (hundreds of assertions construct `Responses` objects
directly, bypassing the UI). Rather than a mutual `showIf` dependency
between the two new questions and `SECONDARY_01` (fragile once
`ADDITIONAL_DETAIL_01` no longer sits at a fixed early array position —
`SECONDARY_01` could otherwise become reachable again while
`ADDITIONAL_DETAIL_01` sits unanswered later in the walk), all three now
key off `VISIT_00_INTENT` directly, the one field that unambiguously means
"this patient is going through the new flow":

- `SECONDARY_01.showIf = VISIT_00_INTENT == null`
- `ADDITIONAL_DETAIL_01.showIf = VISIT_00_INTENT != null`
- `REFERENCE_SYMPTOMS_01.showIf = VISIT_00_INTENT != null && ADDITIONAL_DETAIL_01 != null`

`VISIT_00_INTENT` is always the very first screen a real new-flow patient
answers, so `SECONDARY_01` is excluded from then on — permanently, from
screen 2 onward, independent of *when* `ADDITIONAL_DETAIL_01` is actually
presented by the phase-aware reordering above. A raw-fixture test that
never touches `VISIT_00_INTENT` (the old style, setting `SECONDARY_01`
directly) keeps working exactly as before.

`ADDITIONAL_DETAIL_01`'s option list puts `'없음'` **first** (not last, the
usual convention) as a deliberate fail-safe: it is the one field that
actually opens a second full module (`hasDetailedConcern`), so any
test-harness auto-walk that reaches this question without an explicit
opinion about it defaults to the harmless "none" answer rather than an
arbitrary category. `REFERENCE_SYMPTOMS_01` needs no such treatment since
it never activates a module regardless of value.

### `hasDetailedConcern` — reusing existing modules, not duplicating them

```ts
const hasDetailedConcern = (r: Responses, key: string): boolean =>
  r['ADDITIONAL_DETAIL_01'] === key
```

Every `IS_PRIMARY_X` gate (Sleep, GI, Bowel, Urinary, Pain, Fatigue,
Stress, Women, Weight) was extended from `primaryConcernKey(r) === 'x'` to
`primaryConcernKey(r) === 'x' || hasDetailedConcern(r, 'x')`. This is the
*only* change needed to route Additional Detail into the existing, frozen
module question sets and safety engines — no module's question set,
adapter, or logic file was touched (verified zero-diff, §5 below).
`IS_PRIMARY_PREGNANCY`/`IS_PRIMARY_POSTPARTUM` were **not** extended:
Additional Detail's "여성 건강" option is one bucket only (matching
`SECONDARY_01`'s existing scope boundary — pregnancy/postpartum have never
had their own secondary-concern category), so picking it only ever opens
the Women module, never Pregnancy/Postpartum specifically.

### `primary_module_detail` vs. `additional_module_detail`

`IS_PRIMARY_PAIN`'s extension means `IS_PRIMARY_LBP`/`NECK`/`KNEE`/… (all
derived from it) now also return `true` when Pain is only the *additional*
concern. Left unguarded, this would have wrongly relabeled
`primary_module_detail` as `'LBP'` even when the actual primary complaint
was, say, sleep. Fixed by extracting the regional-label ternary into a pure
`painRegionalDetailLabel(r)` helper and gating which of two output fields
it lands in:

```ts
primary_module_detail:    primaryConcernKey(r) === 'pain'                     ? painRegionalDetailLabel(r) : null,
additional_module_detail: (primaryConcernKey(r) !== 'pain' && r['ADDITIONAL_DETAIL_01'] === 'pain') ? painRegionalDetailLabel(r) : null,
```

`safety_flags.lbp`/`hip`/`neck`/… still compute unconditionally from the
extended `IS_PRIMARY_*` gates (they must — Case D requires Additional's
regional safety module to compute), only the *label* is guarded. Covered
by `T-CaseD CRITICAL` in the test suite.

## 3. Initial and repeat-initial visits

Investigated the whole repository (`src/`, `server/`, `tablet core/`) for
any 초진/재초진/`visit_type`/`revisit` concept that could gate the tablet
questionnaire's question set. **None exists.** The only "재진" references
found are in `server/visitStore.js` (linking a new visit record to an
existing `patient_id` on the doctor/EMR side) — that is a record-keeping
concern entirely downstream of and unrelated to which *questions* the
tablet shows; it never reads or branches on any tablet response. The
`VISIT_00_INTENT` → routing → module flow this task builds on has no input
that could represent "is this visit #1 or #2," so it cannot possibly be
skipped for a repeat visit. `tests/integration.spec.mjs`'s `T6` assertion
pins this as a static guard: no question id/variable in `ALL_QUESTIONS`
matches `/visit_type|revisit|재진|초진/i`. History re-question policy
(`HISTORY_QUESTIONS`) was not touched — that remains explicitly out of
scope per the task's own instruction.

## 4. DoctorView

Three sections now render explicitly, in order: **주호소** (unchanged),
**추가 상세상담** (new — shows the chosen category + that module's full
field set via the same `primaryModuleFields()` helper used for Primary,
just called with `routing.additional_module`), **참고 증상** (new — low-
emphasis chips only, `--text-muted` color rather than `--primary`,
explicitly labeled "진단이나 객관적 소견이 아니며, 필요 시 진료 중
확인하세요"). "기타" in Reference Symptoms renders as a
"기타 참고증상 있음 — 진료 중 확인" note, never a free-text field (no new
free-text was introduced anywhere in this task, §25). The legacy
"동반문제" section is kept (for `SECONDARY_01`-fixture backward
compatibility) with a note that it is always empty for new-flow patients.
None of the new sections/cues use the danger/urgent banner styling — they
sit strictly below and visually quieter than the existing safety panels.

## 5. Tests

- `tests/body-map.spec.mjs`: 18 new DOM/CSS structural regression
  assertions (50 total in the file) pinning the exact fix for the
  real-device rendering bug — zone-is-descendant-of-figure,
  figure-is-position-relative, figureWrap-does-NOT-declare-position,
  zone-is-position-absolute, figures-max-width-bounds-size-within-content-
  column, and a live-render check that every rendered `.bodyMap__figure`
  is immediately followed by its own zone buttons in the HTML.
- `tests/integration.spec.mjs` §T: fresh-flow eligibility (`SECONDARY_01`
  excluded the instant `VISIT_00_INTENT` is set), legacy-fixture
  compatibility, Cases A–D exactly as specified (§20), duplicate-category
  exclusion, `exclusive:'none'` reuse, male women-option exclusion,
  back-navigation stale-answer pruning for both Additional Detail changes
  (removes the now-hidden module's answers) and Reference Symptoms changes
  (never touches any module's visibility), malformed-input fail-safe for
  both new fields, and the visit-type-agnostic static guard.
- `tests/integration.spec.mjs` §U (ordering fix, PR #20 follow-up): full
  ordered screen-by-screen walks (`autoAnswerWalkOrdered`, using the
  authoritative `MODULE_QUESTION_IDS` exported from `coreSpec.ts` rather
  than re-deriving id-prefix knowledge) proving Primary=pain/Additional=
  sleep visits every Pain screen (including all regional sub-blocks)
  strictly before `ADDITIONAL_DETAIL_01`, and every Sleep screen strictly
  before `REFERENCE_SYMPTOMS_01` (U2); the exact reverse category pairing,
  Primary=sleep/Additional=pain (U3); Additional=none going straight from
  Primary's last screen to `REFERENCE_SYMPTOMS_01` with nothing in between
  (U1); Reference Symptoms never answering a single Sleep/GI-module screen
  even when chosen (U4); and that switching Additional away from a chosen
  category removes that category's screens from the visible order
  entirely, not just nulls their answers (U5).
- `tests/doctor.spec.mjs`: a new fixture
  ("허리 통증 주호소 + 추가 상세상담(수면) + 참고 증상(소화·기타)") built
  through the same real `buildResponsePayload`/`buildRoutingPayload`
  builders as every other fixture (never hand-written JSON), plus 20 new
  assertions rendering `DoctorView` and checking all three new sections,
  the additional module's full detail fields, the reference chip, the
  "기타 참고증상 있음" cue, and that none of it renders inside/near the
  danger banner class.
- `tests/layout-budget.spec.mjs` / `tests/viewport-budget.spec.mjs`:
  `ADDITIONAL_DETAIL_01`/`REFERENCE_SYMPTOMS_01` added to the existing
  inner-scroll allowlist (same justification `SECONDARY_01` already had —
  a longer grid2 screen that legitimately needs the now much-more-visible
  scroll-hint pill); a 5th viewport (`1600x900`, large landscape) added
  matching the real device class this QA round came from.

All FROZEN clinical files (`src/spec/*Logic.ts`, `src/spec/*Adapter.ts`)
remain zero-diff against `origin/main`.

## 6. Known limitations

- ~~Screen order for Additional Detail was fixed-array-order, not
  selection-order~~ — **fixed** (see §2 above, "Screen order" section):
  `visibleQuestions(r)` now reorders its output based on current
  responses (`reorderForDetailPhases`), so Primary's own full module is
  always presented before `ADDITIONAL_DETAIL_01`, which is always before
  Additional's own full module (if any), which is always before
  `REFERENCE_SYMPTOMS_01` — regardless of which category is Primary vs.
  Additional, or of either category's fixed position in the underlying
  static array. Verified by `tests/integration.spec.mjs` §U (ordered
  screen-by-screen walks for both category-pairing directions).
- **Body map "peek" effect** (partially showing the next card at the
  bottom edge to hint at more content) was intentionally not implemented.
  The task instructions explicitly warn against "억지 CSS clipping"
  hacks, and a genuine peek effect would need JS-measured heights per
  screen — the much larger, clearly-requested win (the readable pill
  banner) was implemented instead; the peek effect remains a "가능하면"
  (nice-to-have) item.
- Real-device visual regression (actual pixel screenshots on the field
  device) was not available in this environment; verification here is via
  DOM/CSS static structural guards and layout-budget estimation across 5
  viewports, per this repo's established pattern of avoiding a
  jsdom/headless-browser dependency (see `tests/patient-ux.spec.mjs`'s
  header comment for the same reasoning).
