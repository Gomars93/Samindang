# Doctor Clinical Workspace — production integration + preview

Status: **integrated into production `DoctorView.tsx`, real server persistence
implemented, PR #24 DO NOT MERGE**. This document describes the actual
current implementation, not a mockup. It previously described a
design-only preview that did not touch production code — that has not
been true since `add7892` (this PR's second commit). See `HANDOFF.md` for
the current head SHA, and `docs/DOCTOR_WORKSPACE_VIEW_PROFILE_MATRIX.md`
for the full `view_profile` decision matrix this round audited.

## What actually exists today

- `src/doctor/workspace/DoctorWorkspace.tsx` renders **inside** the real
  `src/doctor/DoctorView.tsx`, for both `fixtures` mode (synthetic/demo
  data, no server) and `server` mode (real submissions from the local
  handoff server).
- **Clinician-entered workspace state persists to the server** in server
  mode: exam results, herbal pattern-candidate review, clinician
  observations, both Final Assessment cards, and both follow-up target
  lists are saved via `PUT /api/submissions/:id/workspace` (debounced
  autosave, ~900ms after the last edit) and reloaded on
  `GET /api/submissions/:id`. A visible save-status line
  (저장 중…/저장됨/저장 실패) never silently claims a save succeeded.
  Fixtures/preview mode never calls this — synthetic data stays entirely
  client-side, exactly like the rest of the fixtures picker.
- `view_profile` (`pain`/`herbal`/`mixed`) is derived from two real,
  already-computed routing signals (`routing.primary_module`/
  `additional_module === 'Pain'`, and
  `routing.questionnaire_mode === 'expanded'|'herbal_addon'`) — not
  guessed from `questionnaireMode` alone. This mapping was re-audited this
  round against 16 real routing combinations
  (`docs/DOCTOR_WORKSPACE_VIEW_PROFILE_MATRIX.md`) and kept unchanged; one
  pre-existing, unrelated safety-panel gating gap was found and
  documented there as PRODUCT DECISION REQUIRED rather than silently
  patched.
- The clinician can manually override which profile is on screen; the
  segmented control always shows the auto-derived profile
  (`자동 분류: ...`) separately from the one currently displayed, and an
  explicit "수동 보기 · 원래 자동 분류: ..." banner with a one-click reset
  appears whenever the two differ. Switching the override never mutates
  routing or profile derivation — it is presentation-only.

## Locked design invariants (verified by `tests/doctor-workspace.spec.mjs`, `tests/doctor.spec.mjs`, `tests/doctor-view-profile-matrix.spec.mjs`, `tests/server.spec.mjs`)

- Pain profile does not show Myungri/saju/birth-time or herbal-only
  systemic content.
- Herbal profile shows systemic/herbal information first; Myungri is
  collapsed secondary information.
- A reproductive-health section (in both the Herbal Workspace and
  DoctorView's own legacy display below it) only renders when reproductive
  data was actually recorded (`reproductive_status.derived.source !==
  null`) — never shown as an empty card to every patient regardless of sex.
- Mixed profile exposes both workspaces as tabs with full `tablist`/`tab`/
  `tabpanel` ARIA wiring, `aria-controls`/`aria-labelledby`, roving
  `tabIndex`, and Left/Right/Home/End keyboard navigation.
- Common Safety is never hidden behind a tab.
- LBP recovery expectation is displayed as the raw numeric score only. No
  risk/yellow-flag cutoff or color inference is introduced.
- A SUGGESTED item (`PhysicalExamSuggestion`/`HerbalPatternCandidate`)
  never renders or serializes as a confirmed finding; `NOT_YET_CHECKED`/
  unknown never renders or serializes as negative. This holds across a
  server save/reload round-trip, not just within one render.
- An accepted herbal pattern candidate never auto-populates the clinician's
  Final Assessment — an explicit "최종 판단에 가져오기" click is required,
  and the destination stays freely editable afterward.
- Repeat-visit comparison is not implemented, because no secure stable
  visit/patient linkage exists in this codebase — the follow-up target
  picker records only this visit's chosen targets (with optional
  baseline/post-treatment values), and displays the fixed string
  `재진 자동 비교: OPERATIONAL INTEGRATION REQUIRED` rather than faking a
  comparison.
- Existing CLOSED/FROZEN clinical Logic/Adapter files are untouched —
  reverified every round via
  `git diff origin/main -- 'src/spec/*Logic.ts' 'src/spec/*Adapter.ts'`.

## What is still deliberately NOT implemented (clinical decision blockers)

`src/doctor/workspace/examSuggestion.ts` and `patternCandidate.ts` define
the `PhysicalExamSuggestion`/`HerbalPatternCandidate` **shapes** only —
there is still no function anywhere that computes real suggestions from a
patient's actual answers. That mapping is a clinical judgment call, not an
engineering task; see `docs/clinical-decision-tables/
PAIN_EXAM_RECOMMENDATION_TEMPLATE.md` and `HERBAL_PATTERN_CANDIDATE_TEMPLATE.md`
for the schema a clinician needs to fill in and approve before this can be
wired up. `tests/doctor-workspace.spec.mjs` enforces this boundary as a
hard regression guard (`examSuggestion.ts contains no function computing
suggestions from a DoctorPayload`, and the analogous check for
`patternCandidate.ts`, and `DoctorView.tsx passes no synthetic
decision-support data for real (server-mode) submissions`).

## Preview URL

The branch-specific Pages workflow (`.github/workflows/doctor-workspace-preview.yml`)
now builds and deploys the **real application** (not a static mockup) to:

`https://gomars93.github.io/Samindang/doctor-pr/`

It lands directly on the `#doctor` route, in `fixtures` mode only (the
server URL is intentionally left unconfigured in that build, so `server`
mode — and therefore the real persistence endpoint — is unreachable from
the public preview). It mirrors the currently-live root and adds only
`/doctor-pr/`; the main patient preview at the root is untouched.
