# HIP_V1 — Production Integration Report v1.0

작성일: 2026-08-25
Branch: `clinical/hip-v1-integration` (PR #15)
Base: `main` @ `77e3bdda7598a0209f42bba7b6b29d797cf027df` (pre-TMJ) → merged forward to
`main` @ `820439c396…` (post-TMJ_V1 merge, PR #16) before this integration began.
HIP port commit: `106d2f073bcc6ae3e7d693e23cac8941f0d61774` (clinically CLOSED
`hipLogic.ts`/`hipAdapter.ts`/`hipQuestions.ts` + docs, ported unchanged onto
pre-TMJ `main`).
Final HEAD: `768a28e680d682055e2b5704eb69d3611d7b3584`

## Clinical status

`PASS / CLINICAL DECISIONS CLOSED` — H1–H8 approved exactly as recommended
(`docs/HIP_V1_Clinical_Decisions_v1.0_CLOSED.md`,
`docs/HIP_V1_Final_Verification_v1.0_CLOSED.md`). Not reinterpreted or
modified anywhere in this integration.

## 0. Pre-integration state verification

- `main` had advanced from `77e3bdd` (PR #15's original base) to `820439c`
  (TMJ_V1 merged via PR #16) before this integration began.
- PR #15's single commit (`106d2f0`) ported `hipLogic.ts`/`hipAdapter.ts`/
  `hipQuestions.ts`/`tests/hip.spec.mjs`/`tests/hip-malformed.spec.mjs` and
  all HIP evidence/decision/tablet/verification/Fable-plan docs onto the
  pre-TMJ `main`, with zero `coreSpec.ts`/DoctorView/fixtures/test-wiring
  integration — exactly as PR #15's own description stated.
- Working tree was clean at the start of this session (a few stale untracked
  esbuild bundle artifacts from a prior local run were removed before
  starting, matching the same regenerable-build-artifact class already
  gitignored for every other module).
- `git merge origin/main` into the local HIP branch completed with **zero
  conflicts** (HIP's port commit touched no file TMJ's integration also
  touched), bringing the branch to `820439c` + the HIP port commit.

## 1. Ported unchanged from the clinically verified HIP branch

- `docs/HIP_V1_Evidence_Matrix_v0.1_HANDOFF.md`
- `docs/HIP_V1_Clinical_Decision_Packet_v0.1.md`
- `docs/HIP_V1_Clinical_Decisions_v1.0_CLOSED.md`
- `docs/HIP_V1_Tablet_Question_Set_v0.1.md`
- `docs/HIP_V1_Final_Verification_v1.0_CLOSED.md`
- `docs/HIP_V1_Fable_Integration_Plan_v0.1.md`
- `src/spec/hipLogic.ts`
- `src/spec/hipQuestions.ts`
- `tests/hip.spec.mjs`
- `tests/hip-malformed.spec.mjs`
- `src/spec/hipAdapter.ts`'s existing `toHipState()` and validation Sets
  (`YES_NO_UNKNOWN`/`WALKING`/`INFECTION`/`NEURO`/`HIP02`/`HIP04`,
  `asAllowedString`/`asProtectedMulti`) — zero lines changed. Only a new
  additive `toHipStateFromDoctorPayload()` function was appended for the
  DoctorView panel path.

Verified via `git diff 106d2f0 -- src/spec/hipLogic.ts src/spec/hipQuestions.ts`
(empty) and `git diff 106d2f0 -- src/spec/hipAdapter.ts` (additive-only, shown
in §6 below).

## 2. Production integration completed

### Routing (H1)

HIP shares the FROZEN `PAIN_01 === 'low_back_pelvis'` population with LBP by
design — this is the first module in this codebase to overlay an existing
FROZEN module's population rather than get its own `PAIN_01` value or a
routing-tag population like TMJ's `head_face_jaw`/`HFJ_00`.

- `HIP_ROUTING_QUESTIONS`/`HIP_QUESTIONS` spliced into `CORE_QUESTIONS`
  immediately after `...LBP_QUESTIONS,`.
- `IS_PRIMARY_HIP_SAFETY` (defined in `hipQuestions.ts`, unmodified) gates
  HIP_01-06 exposure on `HIP_00 ∈ {BUTTOCK_PELVIS_DOMINANT,
  HIP_GROIN_DOMINANT, SIMILAR_OR_MULTIPLE, UNKNOWN}` — `LOW_BACK_DOMINANT`
  is the sole excluded value, and `HIP_00` itself never enters `HipState`
  or creates a safety tier (H1).
- `HIP_03` is conditionally shown only when `HIP_01 === 'YES'`; `HIP_03A`
  (optional prior-imaging context) only when `HIP_03` is the positive or
  unknown answer. Both prune correctly on upstream answer changes.

### HIP safety engine connection

`responses → toHipState() → computeHipFlags() → additive payload`, exactly
per the Fable plan. No safety rule was duplicated or reimplemented in
`coreSpec.ts` — `safety_flags.hip`/`STAFF_CHECK_TRIGGERS.HIP_02`/`HIP_05` all
call `computeHipFlags(toHipState(r, computeFlags(r).general_red))` directly.
HIP has no age modifier in its CLOSED contract (H1–H8 defines none), so
`toHipState`'s 2-argument signature (no age parameter) was left as ported.

### StaffCheck integration

Only `HIP_02` and `HIP_05` are registered in `STAFF_CHECK_TRIGGERS` — the two
screens whose CLOSED semantics can independently reach `URGENT_REVIEW` (H2's
limb-threatening always-urgent set / traumatic major neuro, and H6's
`SYSTEMIC_OR_RAPIDLY_WORSENING` infection enum). `HIP_01`/`HIP_03`/`HIP_04`/
`HIP_06` are REVIEW/expedited/flag-tier only per H3/H5/H2(non-traumatic)/H6
and are correctly **not** registered — verified by an explicit integration
assertion (R-D3). Each trigger recomputes `computeHipFlags` in full rather
than reimplementing a partial condition, matching the codebase-wide
established convention (NECK/SHOULDER/KNEE/ELBOW/WRIST_HAND/ANKLE_FOOT/TMJ
all use the same pattern). Existing Core/LBP/NECK/SHOULDER/KNEE/ELBOW/
WRIST_HAND/ANKLE_FOOT/TMJ urgent sources are untouched — HIP_02/HIP_05 are
purely additive new keys.

### H7 LBP zero-regression (the critical regression boundary)

`IS_PRIMARY_LBP` and every LBP question/`showIf` were **not touched at
all**. `safety_flags.lbp` computation is unconditional for the entire
`low_back_pelvis` population, exactly as before HIP existed —
`safety_flags.hip` is gated independently on `IS_PRIMARY_HIP_SAFETY`, never
on `IS_PRIMARY_LBP` alone, so a `LOW_BACK_DOMINANT` patient still gets full
LBP safety with `safety_flags.hip === null` (no invented HIP safety).

`primary_module_detail`'s ternary chain (`coreSpec.ts`) was left **completely
unmodified** — `IS_PRIMARY_LBP(r) ? 'LBP' : ...` is still the first branch,
evaluated and returned unconditionally for the whole `low_back_pelvis`
population regardless of `HIP_00`. This means H7's "`IS_PRIMARY_LBP`/LBP
logic stays unmodified" requirement holds by construction — there was no
"HIP tagging" branch to add or reason about, unlike NECK/SHOULDER's `NS01`
sub-tag pattern. A HIP_GROIN_DOMINANT patient's `primary_module_detail`
therefore stays `'LBP'` even while `safety_flags.hip` is independently
non-null — verified end-to-end (R-E3c, R-E8f, doctor.spec.mjs's coexistence
fixture assertion).

### DoctorView integration

`HipSafetyPanel.tsx` (new file, mirrors `TmjSafetyPanel.tsx`/
`AnkleFootSafetyPanel.tsx`'s separate-component-file precedent) rendered
directly after `LbpSafetyPanel` in `DoctorView.tsx` — both panels render
independently and simultaneously for a HIP_GROIN_DOMINANT patient, gated by
their own null-checks (`safety_flags.lbp`/`safety_flags.hip`), neither
suppressing the other. Presentation-only: recomputes the CLOSED flags from
the submitted payload via the new `toHipStateFromDoctorPayload()` and never
invents an objective gait/ROM/neurologic finding, imaging result, or
definitive diagnosis (fracture, stress fracture, infection) — panel copy
uses "평가 필요"/"확진이 아니라 clinician-side 평가 판단이 필요한" language
throughout, matching every prior module's non-diagnostic-language
convention. A raw `HIP_00`–`HIP_06` field block was also added to
`primaryModuleFields`'s `'Pain'` case, gated on
`m.pain.primary_location === 'low_back_pelvis'` (same population test as the
existing LBP block, not `primaryModuleDetail` alone, since HIP_* answers
must stay visible regardless of the LBP-only detail tag).

### Fixtures

15 fixtures added to `src/doctor/fixtures.ts`'s `DOCTOR_FIXTURES` array,
covering every H1–H8 branch:

1. HIP clear (valid-negative baseline)
2. H8 fail-closed: `HIP_01` UNKNOWN
3. H2 limb-threatening always-urgent (gross deformity)
4. H2 traumatic major distal neuro deficit (standalone URGENT)
5. H2 same finding without trauma (REVIEW + neuro + expedited, not urgent)
6. H3 post-traumatic marked walking difficulty + H4 prior "told normal"
   X-ray context (context only, does not lower safety/suppress imaging)
7. H5 full stress-fracture compatible pattern (REVIEW + stress + fracture +
   loading-exercise lock)
8. H5 partial pattern (no auto-diagnosis, `stress_fracture_assessment_required`
   stays false)
9. H6 localized/stable infection concern
10. H6 systemic/rapidly-worsening infection (opaque OR enum, URGENT)
11. H2 non-traumatic progressive neuro (`HIP_06`)
12. H1/H7 LBP+HIP simultaneous coexistence (both panels/flags non-null,
    neither suppressing the other)
13. Core general_red + HIP coexistence ("core urgent dominates" passthrough)
14. H1 routing boundary: `LOW_BACK_DOMINANT` exclusion (no HIP panel, LBP
    unaffected)
15. H8 malformed regression (`HIP_02` mixes `NONE` with an out-of-allowlist
    value, fails closed to REVIEW, never CLEAR)

All 12 HIP-focused single-scenario fixtures (1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
11, 13) were additionally given a full clear-answer LBP block so their
`safety_flags.lbp` reads `CLEAR` rather than incidentally failing closed on
unanswered LBP fields — the real tablet flow always asks LBP_01-14 for the
whole `low_back_pelvis` population regardless of `HIP_00` (H7), so leaving
them null would have been unrealistic test data, not a meaningful assertion
about HIP behavior.

## 3. Tests executed

| Suite | Result |
|---|---|
| `npx tsc -b --force` | clean |
| `npm run build` (`tsc -b && vite build`) | 132 modules, clean |
| `tests/hip.spec.mjs` | 15 passed, 0 failed |
| `tests/hip-malformed.spec.mjs` | 8 passed, 0 failed |
| `tests/integration.spec.mjs` | **732 assertions passed, 0 failed** (incl. new section R. HIP_V1, ~90 assertions) |
| `tests/doctor.spec.mjs` | **633 assertions passed, 0 failed** (incl. new section 2j. HIP_V1) |
| every other existing `npm run test:*` suite (lbp/neck/shoulder/knee/elbow/wrist-hand/ankle-foot×3/tmj/layout/saju/server/recorderResults/patient/emrSummary/doctorToken) | unchanged, all green |
| `npm run test:all` | **full suite green end to end, exit 0** |
| `python -m pytest "tablet core/tests" -q` | 80 passed |

No test assertion was deleted or weakened to pass. The only correction made
before any test run was the fixture LBP-clear-block fix described in §2's
Fixtures subsection (a fixture-data correctness fix, not a test-assertion
change) — all new integration/doctor sections passed on their first actual
run.

### Malformed runtime safety (H8)

`tests/hip-malformed.spec.mjs` (8 cases, unmodified/ported) plus
`tests/integration.spec.mjs`'s R section and the new `fixtures.ts` malformed
fixture together verify, end-to-end through the real `coreSpec.ts` payload
builder (not just the adapter in isolation):

- invalid enum (`HIP_01: 'BOGUS'`)
- empty array (`HIP_02: []`, `HIP_04: []`)
- out-of-allowlist value (`HIP_02: ['BOGUS']`)
- duplicate/mixed exclusive values (`NONE` + a concrete positive; `UNKNOWN` +
  a concrete positive)
- missing protected answer (unanswered `HIP_01`/`HIP_02`/etc. on a shown
  screen fails closed to REVIEW via the engine's `undefined`-handling
  branches)
- `UNKNOWN` behavior (never treated as a valid negative, H8)

All fail closed to at least `REVIEW_REQUIRED`, never `CLEAR` — TypeScript
union casts were not trusted as the runtime guarantee; `asAllowedString`/
`asProtectedMulti` in `hipAdapter.ts` (unmodified) perform the actual
runtime validation.

## 4. FROZEN zero-diff verification

Verified via `git diff --stat origin/main -- <files>` (working-tree-aware,
since this session's changes were not yet pushed at verification time) —
**empty output for every file below**, confirming zero-diff against the
latest `main` (post-TMJ_V1 merge):

```
src/spec/lbpLogic.ts        src/spec/lbpAdapter.ts
src/spec/neckLogic.ts       src/spec/neckAdapter.ts
src/spec/shoulderLogic.ts   src/spec/shoulderAdapter.ts
src/spec/kneeLogic.ts       src/spec/kneeAdapter.ts
src/spec/elbowLogic.ts      src/spec/elbowAdapter.ts
src/spec/wristHandLogic.ts  src/spec/wristHandAdapter.ts
src/spec/ankleFootLogic.ts  src/spec/ankleFootAdapter.ts
src/spec/tmjLogic.ts        src/spec/tmjAdapter.ts       src/spec/tmjQuestions.ts
src/doctor/judgment.ts      src/doctor/JudgmentPanel.tsx
src/doctor/AnkleFootSafetyPanel.tsx  src/doctor/ankleFootFixtures.ts
src/doctor/TmjSafetyPanel.tsx
```

HIP's own pure engine files were separately verified against the HIP port
commit `106d2f0` (not `main`, since they didn't exist on `main` before this
branch): `git diff --stat 106d2f0 -- src/spec/hipLogic.ts
src/spec/hipQuestions.ts` — empty. `git diff 106d2f0 -- src/spec/hipAdapter.ts`
— additive-only (+15 lines: 1 import + the new
`toHipStateFromDoctorPayload` function; zero lines of `toHipState`/the
validation Sets/`asAllowedString`/`asProtectedMulti` changed).

## 5. GitHub CI

Pushed to `clinical/hip-v1-integration`, PR #15. CI run and result recorded
at push time (see PR #15's final body/thread for the run link) — all
required checks (`npm ci` → `npm run build` → `npm run test:all` → `pip
install pytest pyyaml` → `python -m pytest "tablet core/tests" -q`, Node 22)
reproduced locally in full before pushing, matching `.github/workflows/ci.yml`
step-for-step.

## 6. Known limitations

- HIP shares its entry population with LBP rather than having a dedicated
  `PAIN_01` value — this is the CLOSED, approved H1 design, not a
  limitation introduced by this integration, but it does mean every
  `low_back_pelvis` patient answers both LBP_01-14 and (conditionally)
  HIP_00-06, a longer question set than a single-module route.
- HIP has no age-based modifier (unlike TMJ's T5 GCA age modifier) — this
  reflects H1-H8's actual CLOSED contract (no age-dependent branch exists),
  not an omission.
- `HIP_03A` (prior imaging context) is optional and display-only, as
  specified (H4) — it is preserved in `modules.hip.prior_imaging_context`
  for DoctorView display but never enters `HipState`/safety computation,
  matching `tmjAdapter.ts`'s prior precedent for similar optional context
  fields.

## Final status

**HIP_V1: PASS / FROZEN**
