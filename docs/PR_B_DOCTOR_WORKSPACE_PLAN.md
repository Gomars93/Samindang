# PR B — Doctor Clinical Workspace: implementation-ready plan

Status: **planning only, not started**. No code in this PR. Written after
PR A (this repo's `fix/tablet-v2-3-ux-and-routing-audit` branch, PR #23)
reached a green, real-device-QA'd state, per the governing task's Phase 7
instruction to prepare PR B/PR C plans without mixing them into PR #23.

Base: should branch from merged `main` once PR #23 lands (never stacked on
PR #23's branch). Suggested branch name: `claude/feat-doctor-workspace-tabs`.

## 1. What exists today (verified by direct source inspection, not assumed)

- `src/doctor/DoctorView.tsx` (2667 lines) renders the entire doctor record
  as ONE flat scroll: 10-second summary (`TenSecondSummary`), a compact
  myungri/saju card (`MyungriCompactCard`), then every primary-module
  safety panel (`LbpSafetyPanel`, `NeckSafetyPanel`,
  `ShoulderSafetyPanel`, `KneeSafetyPanel`, `ElbowSafetyPanel`,
  `WristHandSafetyPanel`, plus `AnkleFootSafetyPanel.tsx`/
  `HipSafetyPanel.tsx`/`TmjSafetyPanel.tsx` as separate files), secondary/
  reference symptom chips, constitution fields, and free-text sections --
  all unconditionally, regardless of what the patient's questionnaire
  actually covered.
- There is **no tab system and no `view_profile` concept today** -- this
  is genuinely new work, not a refactor of something partially built.
- `src/spec/coreSpec.ts` already defines and computes
  `QuestionnaireMode = 'pain_fast' | 'expanded' | 'herbal_addon'`
  (`questionnaireMode()`, coreSpec.ts ~L461-478). This is the natural
  input signal for `view_profile` -- see §3 for the proposed mapping and
  why it needs one explicit human confirmation before implementation.
- `LBP_12` (recovery expectation, 0-10) is **already displayed as a raw
  number only** (`DoctorView.tsx` ~L1537, `{ qid: 'LBP_12', value: m.lbp.
  recovery_expectation }`) -- no inferred yellow-flag/risk cutoff exists
  anywhere in the current code. The invariant in the governing task
  ("raw score only, NO inferred yellow flag/risk cutoff") is already
  satisfied; PR B's job is to **preserve** this, not introduce a cutoff
  while restructuring the surrounding layout.
- No repeat-visit/revisit linkage code exists anywhere in `src/doctor/`
  (confirmed via grep across the module) -- there is no secure, stable
  way today to associate two submissions from the same patient across
  visits. Per the governing task's own instruction, this stays an
  **OPERATIONAL INTEGRATION REQUIRED** item, not something PR B invents a
  workaround for.

## 2. Proposed component structure

```
src/doctor/
  DoctorView.tsx              -- becomes a thin shell: fetch/derive payload,
                                  compute view_profile, render <DoctorTabs>
  DoctorTabs.tsx               -- NEW: tab bar + active-tab state, renders
                                  <PainWorkspace>/<HerbalWorkspace>/both
                                  depending on view_profile
  PainWorkspace.tsx            -- NEW: extracted from DoctorView -- primary
                                  pain-module safety panels + LBP_12 raw
                                  score, in existing order (sectionOrder.ts)
  HerbalWorkspace.tsx          -- NEW: extracted -- constitution fields +
                                  systemic/herbal content, myungri card
                                  moved here (collapsed/secondary by default,
                                  see §4)
  CommonSafetyBanner.tsx       -- NEW: extracted -- SafetyGlance/urgent
                                  flags, rendered ABOVE the tabs on every
                                  profile (never gated behind a tab)
  (existing safety panel files unchanged: LbpSafetyPanel etc. move into
  PainWorkspace.tsx as-is, or stay in DoctorView.tsx and get imported by
  PainWorkspace.tsx -- decide at implementation time based on how cleanly
  they extract; not a design decision that needs to happen up front)
```

This is an extraction, not a rewrite: the actual panel components
(`LbpSafetyPanel`, `MyungriCompactCard`, etc.) and their underlying
computations (`payload`, `flags`, `recordToPayload`) are untouched --
only *which panels render, and in what tab* changes.

## 3. `view_profile` derivation -- needs one explicit confirmation before implementation

Proposed mapping from the existing `QuestionnaireMode` + `primaryConcernKey`
signals (both already computed, `coreSpec.ts`):

| questionnaireMode | primary concern | proposed view_profile | reasoning |
|---|---|---|---|
| `pain_fast` | pain module (LBP/NECK/etc.) | `pain` | patient only ever saw pain-track questions -- no systemic/herbal/myungri content exists in their record to show |
| `expanded`, primary = pain | pain module | `mixed` | patient saw the full expanded flow (constitution goal) AND has a real pain concern -- both tabs have real content |
| `expanded`, primary = symptom (non-pain) or constitution | none | `herbal` | patient's primary concern was systemic/constitution-goal, not a specific pain module |
| `herbal_addon` | (varies -- add-on can be triggered after ANY prior visit type) | `mixed` | herbal add-on is by definition layered onto an existing record that may already have pain content; treating it as `mixed` is the conservative default (never hides pain content that exists) |

**This table is a proposal, not a decision.** The `expanded`+pain-primary
→ `mixed` and `herbal_addon` → `mixed` rows in particular deserve one
round of confirmation from the user/Opus before implementation, since
getting this wrong either hides real patient-entered pain content from
the doctor (unsafe) or shows an empty/irrelevant herbal tab (noisy). The
literal decision needed: **should `view_profile` be derived automatically
from these two signals, or does it need a THIRD stored field** written at
submission time (simpler, more auditable, but requires touching
`buildResponsePayload`/`buildRoutingPayload` in `coreSpec.ts`)? Both are
non-clinical, low-risk implementation choices -- flagging only because it
changes which files PR B touches.

## 4. Tab content rules (from the governing task, restated precisely)

- `pain`: pain workspace only. **No** Myungri/saju/birth-time/herbal-only
  systemic content anywhere in this profile, not even collapsed.
- `herbal`: systemic/herbal content first (top of the tab); Myungri
  collapsed/secondary (an expandable section, not deleted -- the existing
  `MyungriCompactCard` already renders compactly, so "collapsed" likely
  means default-collapsed `<details>`/accordion around it, not a new
  component).
- `mixed`: both tabs present, patient can see either.
- **Common Safety banner** (urgent flags, `SafetyGlance`) renders ABOVE
  the tab bar in all three profiles -- a safety flag must never be one
  tab-click away from being missed.

## 5. Recovery expectation (LBP_12) -- explicit non-goal

PR B must **not** add any inferred interpretation, cutoff, or "yellow
flag" derived from `LBP_12`'s raw 0-10 value. Display it exactly as
today (raw number, in context of the pain workspace). If a future PR ever
wants a cutoff-based flag here, that is a new clinical decision requiring
sign-off through this repo's `DECISIONS.md` process -- explicitly out of
scope for PR B and not something Sonnet/Opus should introduce
unilaterally.

## 6. Repeat-visit linkage -- explicit non-goal

No repeat-visit/delta-view work happens in PR B unless a secure, stable
linkage mechanism (patient ID matching, explicit visit-chaining token,
etc.) already exists elsewhere in the system by the time PR B starts. As
of this plan, it does not. If PR B ships without it, the correct label in
the PR body is **OPERATIONAL INTEGRATION REQUIRED**, not a silent
omission and not a guessed/invented linkage (e.g. matching on name+phone
alone would be a real patient-safety risk: collisions).

## 7. Tests needed

- `tests/doctor.spec.mjs` (existing) extended: for each `view_profile`,
  assert the correct tabs render and that `pain` profile never renders
  any myungri/saju/birth-time DOM content (string-absence checks, same
  style as this repo's existing "never invents Ottawa/Wells conclusions"
  tests in `tests/ankle-foot-doctor-integration.spec.mjs`).
- New fixtures in `src/doctor/fixtures.ts` (or a new `viewProfileFixtures.ts`)
  covering all four `questionnaireMode`×primary-concern combinations in
  §3's table.
- Regression: `LBP_12` still renders as a bare number, never wrapped in
  any risk-label/badge/color-coded element -- a source-level guard test
  (grep for "flag"/"risk"/cutoff-like keywords near the LBP_12 render
  site) is cheap insurance against silent scope creep in a later PR.
- Regression: `SafetyGlance`/urgent flags still render identically
  regardless of `view_profile` (same props, same output) -- the tab
  refactor must be provably a pure layout change for the safety banner.

## 8. Reusable components already available

- `Field`, `boolLabel`, `sourceLabel` (DoctorView.tsx primitives) --
  reusable as-is inside the new workspace components.
- `sectionOrder.ts` -- defines existing module display order; the pain
  workspace should preserve this exact order, not invent a new one.
- `labels.ts` -- Korean label lookups, reusable as-is.
- CSS: `src/doctor/doctor.css` already has the visual language (chips,
  cards, tone colors) -- a tab bar is the only genuinely new UI pattern
  needed; check the general patient-side CSS tokens (`--primary`,
  `--primary-soft`) for a consistent tab-active treatment rather than
  inventing new colors.

## 9. Estimated implementation order

1. Confirm `view_profile` derivation (§3) with the user/Opus.
2. Extract `CommonSafetyBanner` first (lowest risk, proves the extraction
   pattern works without touching tab logic yet).
3. Extract `PainWorkspace`/`HerbalWorkspace`, wire a naive always-both-tabs
   version behind a feature-inert `DoctorTabs` (no hiding logic yet) --
   confirms the extraction didn't break anything before adding the
   profile-gating logic.
4. Add `view_profile` computation + tab-gating.
5. Add/extend tests per §7.
6. Full regression (`npm run test:all`, `test:doctor` specifically,
   `tsc -b`, build) + FROZEN diff check (PR B should also touch zero
   `src/spec/*Logic.ts`/`*Adapter.ts` files -- it's a presentation-layer
   reorganization of already-computed data).
