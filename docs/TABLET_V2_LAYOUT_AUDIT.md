# TABLET_V2_LAYOUT_AUDIT.md

Tablet Questionnaire Routing/UX v2 — classification of every major question
group by presentation layout (`Question.layout`), and explicit confirmation
that every CLOSED safety input across all frozen clinical modules keeps the
`list` layout (the type default — no `layout` field means `list`).

`Question.layout` is presentation-only metadata (`src/types.ts`). It never
participates in `showIf`/`optionsIf`/validation/pruning, and none of its
values change what gets stored (`optionKey(o) = o.id ?? o.value` is
unaffected by `layout`).

## Layout types used

- **`list`** (default, no explicit field) — one option per row, full width.
  Used for every safety/red-flag question, protected clinical input, and any
  question with 2+ line option text.
- **`grid2`** — 2-column card grid. Used for short (1-2 line), non-safety
  category-selection screens.
- **`compact3`** — single-row flex of short pill buttons. Reserved for short
  3-way questions only (labels short enough to fit a third-width pill).
- **`body_map`** — the visual front/back silhouette renderer. Used
  exclusively for `PAIN_01`.

## Explicit `layout` assignments (7 total)

| Question id | Layout | Option count | Rationale |
|---|---|---|---|
| `VISIT_00_INTENT` | `grid2` | 6 | New visit-intent screen (§2); each option is a short 1-2 line card, not safety-related. |
| `VISIT_00B_HERBAL_PURPOSE` | `grid2` | 4 | Herbal-route sub-goal (§16); short category cards. |
| `VISIT_02_SYMPTOM_MAIN` | `grid2` | 8 | Existing symptom-category screen; short 1-line options, not safety. |
| `VISIT_03_SYMPTOM_DURATION` | `grid2` | 6 | Duration buckets; short 1-line labels. (Not `compact3` — compact3's CSS is a single non-wrapping row and is reserved for 3-way questions only; 6 short options fit a 2-column grid instead, per §8/§9.) |
| `VISIT_02_WOMEN` | `grid2` | 3 | Women-route sub-goal quick-visibility reorg (§18); short cards. |
| `PAIN_01` | `body_map` | 9 | Primary pain location (§5-6); the one and only body-map question. |
| `SURGERY_01` | `compact3` | 3 | 있음/없음/잘 모르겠어요 — exactly the "네/아니요/잘 모르겠어요"-style 3-way case §8 describes for compact3. |

Every other question in `src/spec/coreSpec.ts` has no `layout` field and
therefore renders as `list` (the default) — including every question that
was already `single_choice`/`multi_choice` before this task.

## CLOSED/FROZEN safety inputs — confirmed `list`

None of the following CLOSED module safety/routing questions were given a
`layout` value; all render `list` by default, satisfying §8/§9/§24 ("safety
questions must be able to stay 'list' even if short", "specifically confirm
every CLOSED safety input remains 'list'"):

- **LBP**: `LBP_01`–`LBP_11` (including the `LBP_04` red-flag screen) — no
  `layout` field, confirmed via `grep -n "id: 'LBP_" -A6 src/spec/coreSpec.ts`.
- **NECK**: `NECK_01`–`NECK_04` (incl. `NECK_02`/`NECK_04` safety screens).
- **SHOULDER**: `NS01`, `SH01`–`SH09`.
- **KNEE**: `KNEE_01`–`KNEE_08` (incl. `KNEE_02A`).
- **ELBOW**: `ELBOW_00`–`ELBOW_02A` and onward.
- **WRIST_HAND**: `WH_01`–`WH_09`.
- **ANKLE_FOOT**: `AF_01`–`AF_08`.
- **TMJ**: `HFJ_00`, `TMJ_01`–`TMJ_05`.
- **HIP**: `HIP_00`–`HIP_06`, `HIP_03A`.
- Global safety: `SAFETY_01`, `WOMEN_SAFETY_01`, `BOWEL_03`, and every other
  red-flag/review-tier question in the codebase.

This was verified programmatically, not just by inspection: none of these
ids appear anywhere in the `layout: 'grid2' | 'compact3' | 'body_map'`
grep result above (only the 7 rows in the table do), so every id not in
that table — including every one listed here — is `list` by construction.

## Body map (`PAIN_01`) — layout + accessibility notes

- Single-choice semantics preserved (§6): one zone selection stores exactly
  one `PAIN_01` value; no multi-select behavior was introduced.
- Zone-to-value mapping (`src/components/BodyMap.tsx`, `ZONES` /
  `BODY_MAP_ZONE_VALUES`) uses only the pre-existing `PAIN_01` enum values —
  no new clinical region was invented. A patient-facing "그림에서 선택하기
  어려워요 → 목록으로 보기" fallback reuses the exact same `options` array
  as the `SingleChoice` list rendering, so the fallback and the map can never
  drift into different value sets.
- Every zone is a real `<button>` with `aria-label` and `aria-pressed`;
  selection state is shown with both a color change and a checkmark badge
  (never color-only), satisfying §26.

## Grid2 / compact3 boundary rules re-confirmed (§9)

Per §9, layout is never auto-decided by character count — each of the 7
rows above is an explicit, individually-reasoned assignment, and no safety
question was ever considered for `grid2`/`compact3` regardless of how short
its options are (e.g. `SAFETY_01`'s red-flag options are short but remain
`list`).
