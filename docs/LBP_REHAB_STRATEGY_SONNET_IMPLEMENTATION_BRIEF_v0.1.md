# LBP Rehab Strategy Selector v0.1 — Sonnet Implementation Brief

Status: **IMPLEMENTATION BRIEF — CLINICAL TAXONOMY CLOSED / PATIENT→STRATEGY MAPPING NOT GENERALLY APPROVED**

Branch: `claude/feat-lbp-action-adaptive-engine-prototype`
Baseline before this brief: `e8a42b13b36a8de887033354b4e803ed1fe12aff`
PR: #28 (DRAFT, DO NOT MERGE WITHOUT EXPLICIT PRODUCT OWNER APPROVAL)

## 0. Routing / token-efficiency

This is a bounded cohesive implementation task.

**Required routing:**
1. **Sonnet** implements this brief as one cohesive batch.
2. **Opus** reviews the implementation **delta only**.
3. Sonnet fixes only concrete findings.
4. Opus performs a short closing review.

**Do not invoke Fable** unless the task materially expands into a cross-system architectural problem, migration/concurrency issue, or repeated unresolved Sonnet↔Opus conflict.

Do not reread the entire repository. Follow `CLAUDE.md` Startup Protocol, then inspect only the files listed below plus directly required imports/tests.

## 1. Read first — authority order

1. `CLAUDE.md` — operating rules and role boundaries.
2. `HANDOFF.md` — current branch/task state; reconcile with actual Git if stale.
3. Relevant `DECISIONS.md` entries only.
4. `docs/LBP_REHAB_STRATEGY_DECISION_v0.1.md` — **CLOSED clinical/product authority for this task**.
5. `docs/LBP_CLINICAL_OS_NORTH_STAR_GUARDRAILS.md`.
6. `src/doctor/workspace/lbpExerciseLibrary.v01.experimental.ts`.
7. `src/doctor/workspace/lbpExerciseCoreMetadata.v01.experimental.ts`.
8. `src/doctor/workspace/lbpExerciseEligibility.v01.experimental.ts`.
9. `tests/lbp-exercise-core-metadata.experimental.spec.mjs`, `tests/lbp-exercise-core20.vignettes.experimental.spec.mjs`, `tests/lbp-exercise-eligibility.experimental.spec.mjs`.
10. `src/doctor/workspace/rehabSuggestion.ts` only to preserve its **SHAPE-only / no DoctorPayload mapping** boundary. Do not production-wire it.

## 2. Product objective

Build one **experimental pure selector** that answers:

> Among exercises that upstream Eligibility has already allowed, which 2–3 candidates most directly support the patient's Target Function and the already-resolved rehab strategy for today?

The selector **does not decide safety**, **does not diagnose**, and **does not invent the patient's rehab strategy from raw clinical findings**.

Target pipeline remains:

`Safety → Target Function → Exercise Eligibility → Primary Strategy 1 + optional Secondary 0–1 → eligible exercise candidates 2–3 → clinician selects 1–2`

## 3. CLOSED taxonomy — exact set

Primary/secondary strategy enum must contain exactly these four:

- `SYMPTOM_RESPONSE_GUIDED_MOVEMENT` — 증상반응 활용
- `PHYSICAL_FUNCTION_CAPACITY` — 신체·기능능력 회복
- `NEURAL_MOBILITY_MANAGEMENT` — 신경가동성 관리
- `GRADED_EXPOSURE_RETURN` — 단계적 노출·복귀

Separate adjunct:

- `REGULATION` — 호흡·이완 보조

Rules:
- Primary: exactly 1 **only when a plan can validly be formed**.
- Secondary: 0 or 1; never forced.
- Regulation is separate and must not become a peer primary merely because regulation is relevant.
- If the inputs are insufficient to form a plan, return an explicit unresolved/gap state rather than forcing a primary.

## 4. Critical clinical boundary: taxonomy CLOSED ≠ patient→strategy mapping CLOSED

Do **not** derive the four strategies from raw patient facts, diagnosis labels, Working Hypothesis, DoctorPayload, SLR/FABER/imaging, or new questionnaire answers in this task.

For v0.1, use a **normalized synthetic strategy-intent input** such as:

```ts
strategyIntent: {
  symptomResponseGuidedRelevant: boolean | 'UNKNOWN'
  physicalFunctionCapacityRelevant: boolean | 'UNKNOWN'
  neuralMobilityRelevant: boolean | 'UNKNOWN'
  gradedExposureRelevant: boolean | 'UNKNOWN'
  regulationRelevant: boolean | 'UNKNOWN'
}
```

Naming may improve, but semantic boundary must remain: these are **already-resolved management intents supplied to the selector**, not conclusions the selector derives from raw clinical findings.

If implementation requires a new patient-fact→strategy clinical mapping not explicitly authorized by the CLOSED decision document, **STOP and report `CLINICAL DECISION REQUIRED`**. Do not invent it.

## 5. Suggested bounded implementation surface

Prefer one module:

`src/doctor/workspace/lbpRehabStrategySelector.v01.experimental.ts`

Focused tests:

- `tests/lbp-rehab-strategy-selector.experimental.spec.mjs`
- `tests/lbp-rehab-strategy-selector.vignettes.experimental.spec.mjs`

Update only the dedicated experimental workflow:

`.github/workflows/lbp-action-engine-experimental.yml`

Do not integrate into production Doctor UI, `rehabSuggestion.ts`, Care Plan, CRM, EMR, patient instructions, or real payload adapter.

## 6. Candidate universe for v0.1

Use **Core-20 only** for exact exercise candidate selection.

Reason: the canonical catalog has 57 items, but only Core-20 currently has deep metadata + structured eligibility. The remaining 37 are not deleted or demoted; they are simply outside this v0.1 selector's computable candidate universe.

Do not silently extend selection logic to all 57.

## 7. Consume Eligibility; never recompute it

Input should contain upstream eligibility results/IDs.

Only these states may enter the candidate pool:
- `START_AS_WRITTEN`
- `START_WITH_REGRESSION`

These must never be resurrected:
- `DEFER_NOT_READY`
- `STOP_REVIEW`

`START_WITH_REGRESSION` is not an arbitrary lower score. Preserve the state and surface the regression entry in the candidate explanation.

The selector must not inspect safety fields and recreate `routineCareAllowed`, neuro stability, distal worsening, directional eligibility, or hard/regressible requirements. Eligibility owns those decisions.

## 8. Strategy↔catalog taxonomy projection

A static **exercise-domain → rehab-strategy family** projection is acceptable as an experimental taxonomy bridge, because it does not interpret raw patient findings:

- `DIRECTIONAL_RESPONSE` → `SYMPTOM_RESPONSE_GUIDED_MOVEMENT`
- `NEURAL_MOBILITY` → `NEURAL_MOBILITY_MANAGEMENT`
- `GRADED_EXPOSURE` → `GRADED_EXPOSURE_RETURN`
- `MIND_BODY_REGULATION` → `REGULATION` adjunct
- `ACTIVITY_AEROBIC`, `LUMBAR_MOBILITY`, `HIP_MOBILITY`, `DEEP_TRUNK_ACTIVATION`, `TRUNK_CONTROL`, `TRUNK_ENDURANCE`, `HIP_STRENGTH`, `FUNCTIONAL_STRENGTH`, `LOAD_CAPACITY` → `PHYSICAL_FUNCTION_CAPACITY`

Keep this mapping explicit and independently testable. Do not turn it into diagnosis→exercise mapping.

## 9. Selection method — no pseudo-precision

**Do not create numeric scores or weights.** No `+7`, `+3`, percentages, confidence points, or giant score matrix.

Use a small ordinal/precedence process:

1. filter to upstream-eligible Core-20 items;
2. filter/project by the already-resolved Primary Strategy;
3. prefer items whose existing Core-20 `targetFunctions` contains the patient's Target Function;
4. if a distinct Secondary Strategy exists, it may contribute a candidate without displacing the Primary strategy's purpose;
5. Regulation may contribute an adjunct candidate separately when explicitly relevant;
6. return at most **2–3 exercise candidates total** for the first clinician view.

Target Function is the strongest exact-exercise anchor inside an already-selected strategy.

Do not use catalog/source order as a clinical tie-break. If equally relevant candidates remain after Target Function matching, preserve an explicit tie/group/clinician-choice state rather than pretending the first array item is clinically superior.

The 2–3 display limit is UX compression, not deletion. Preserve an auditable `eligiblePool` / `notSelectedToday` / equivalent so unshown eligible exercises are not implicitly marked negative or inappropriate.

## 10. Output contract

Keep output compact and explainable. It should support:

- Target Function
- Primary Strategy or explicit unresolved state
- optional Secondary Strategy
- Regulation adjunct state
- 0–3 first-view exercise candidates
- each candidate's exercise ID
- upstream eligibility state (`START_AS_WRITTEN` or `START_WITH_REGRESSION`)
- one-line Korean rationale tied to Target Function / selected strategy
- auditable remaining eligible pool
- explicit gap(s), e.g. `NO_MATCHING_ELIGIBLE_EXERCISE`
- normalized/synthetic provenance sufficient to explain why it was surfaced

Do not output a final patient instruction or automatically adopt anything into a Care Plan.

## 11. Explicit gaps — never fill them by invention

If the selected strategy/Target Function has no matching eligible Core-20 exercise, return an explicit gap rather than an unrelated exercise.

Known example:
- bed mobility / log-roll is a real pilot gap candidate but is **not** an explicit canonical 57 exercise item.
- Do not add `log-roll` or a new exercise ID in this task.

## 12. Anti-overdesign / forbidden drift

MUST NOT implement:

- 8+ peer Rehab Intents
- numeric scoring or pseudo-precision
- all-57 direct ranking
- diagnosis→exercise hard mapping
- patient-fact→strategy mapping beyond CLOSED authority
- new patient questions or exams to improve ranking confidence
- safety/eligibility duplication inside ranking
- mandatory Secondary Strategy
- more than one Secondary Strategy
- Regulation promoted to routine primary
- AI-chosen winner by catalog/source order
- automatic clinician acceptance
- new numeric NRS / Target Function response thresholds
- raw `DoctorPayload` adapter
- production Doctor UI, CRM, EMR, or patient messaging wiring
- changes to tablet questionnaire
- changes to `src/spec/*Logic.ts` or `src/spec/*Adapter.ts`
- unrelated refactor.

## 13. Focused acceptance tests

At minimum assert:

1. taxonomy is exactly 4 strategies + separate Regulation adjunct;
2. no numeric score is present in selector contract/selection logic;
3. no diagnosis/raw DoctorPayload fields are required;
4. selector consumes eligibility and does not recompute it;
5. only `START_AS_WRITTEN` / `START_WITH_REGRESSION` can become exercise candidates;
6. `DEFER_NOT_READY` / `STOP_REVIEW` are never resurrected;
7. regression state is preserved and explained rather than numerically penalized;
8. Primary is one when a valid plan exists; otherwise explicit unresolved/gap;
9. Secondary is 0–1 and not forced;
10. Regulation is adjunct and does not displace a functional Primary by itself;
11. first-view exercise candidates are max 3;
12. Target Function match influences exact exercise choice inside the selected strategy;
13. equal clinical candidates are not silently resolved by source-array order;
14. unshown eligible candidates remain auditable, not converted to negative/ineligible;
15. no matching eligible exercise returns explicit gap;
16. canonical catalog remains 57 and Core-20 remains 20; no new exercise IDs;
17. tablet and FROZEN files have zero diff.

## 14. Clinical/product vignette set

Use synthetic normalized inputs. Do not create raw-patient mapping logic.

Cover at least:

1. simple axial/functional case → one Primary, no forced Secondary, 1–2 useful candidates possible;
2. extension-favorable + walking Target Function → symptom-response strategy can coexist with capacity strategy without score inflation;
3. stable leg-symptom case with upstream eligible neural slider → neural strategy candidate can appear;
4. distal worsening represented upstream as STOP/DEFER → selector cannot resurrect that exercise;
5. bending/lifting avoidance → graded-exposure strategy, only upstream eligible exposure items;
6. functional Primary + Regulation relevant → Regulation stays adjunct;
7. Regulation signal alone without a valid primary management intent → explicit unresolved/clinician-choice state, not fabricated functional plan;
8. lifting/work Target Function → capacity candidates matched by Target Function;
9. walking-limited older adult → capacity selection without automatic stenosis diagnosis;
10. selected strategy but no eligible matching item → explicit gap;
11. bed-mobility Target Function → expose Core-20/log-roll gap rather than invent exercise;
12. multiple relevant strategy intents → exactly one Primary + at most one distinct Secondary; no third peer strategy in first plan.

Vignette tests are **product/structural guardrails**, not proof of clinical efficacy.

## 15. CI / Git / completion

Sonnet should:

- update `.github/workflows/lbp-action-engine-experimental.yml` to watch/bundle/run only the new experimental selector/tests in addition to existing suites;
- run focused selector tests + relevant eligibility/Core-20 regressions;
- run `npm run build` if feasible;
- self-review the full task delta;
- verify zero diff for tablet and `src/spec/*Logic.ts` / `src/spec/*Adapter.ts`;
- minimally update `HANDOFF.md` with actual head/task/test state; do not rewrite its history;
- commit and push to the **existing branch**;
- keep PR #28 DRAFT and unmerged;
- report exact changed files, commit SHA, focused test results, build/CI status, and any `CLINICAL DECISION REQUIRED` blocker.

## 16. Opus delta-review brief

After Sonnet pushes, invoke **actual Opus** and give it the CLOSED decision doc + Sonnet's exact diff/changed files. Do not ask Opus to reread the whole repo unless a concrete defect requires expansion.

Opus should answer these questions:

1. Is the 4-strategy + Regulation taxonomy faithfully preserved?
2. Did Sonnet invent any patient-fact→strategy clinical mapping beyond the CLOSED decision?
3. Is Eligibility duplicated or bypassed?
4. Is Target Function truly the main exact-exercise anchor?
5. Did any numeric score/pseudo-precision creep in?
6. Does Regulation remain adjunct?
7. Are ties handled without arbitrary source/catalog-order winner selection?
8. Can simple cases stay simple, without forced Secondary or extra data collection?
9. Are missing exercise/Target Function gaps explicit rather than filled by unrelated exercise?
10. Are tablet, FROZEN, raw-payload, production UI/CRM/EMR boundaries intact?

If any new clinical semantics are required, Opus must return **`CLINICAL DECISION REQUIRED`** or request changes — not normalize/invent a rule.

Closing review should be delta-only after concrete fixes.

---

## Final acceptance question

Before retaining any extra enum, branch, score, field, or rule, ask:

> **Does this help the clinician choose a small, meaningful rehab direction for today's Target Function without duplicating Eligibility or adding unnecessary work?**

If not, remove it.
