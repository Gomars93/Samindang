# Questionnaire Branch Audit — 8 MSK Modules (NECK / SHOULDER / KNEE / ELBOW / WRIST_HAND / ANKLE_FOOT / HIP / TMJ)

**Scope.** This is a read-only research audit. No `.ts`/`.tsx` file was modified to
produce it. It classifies every question in the 8 modules below (LBP was audited
in an earlier session and is out of scope here) against the rubric handed down for
this task, so that a future UX change (e.g. pre-filling/collapsing a screen the way
`LBP_01B_LEG_SCREEN`/`LBP_10A_ONSET_AGE` were handled) has a map of which
questions are safe to touch and which are not.

## Rubric

- **A (always-safety)** — a safety/red-flag question shown unconditionally once
  its module is active, regardless of any other in-module answer.
- **B (parent-positive-detail)** — legitimately gated behind a parent question;
  only clinically meaningful once that parent was answered positively (or
  ambiguously — most of this codebase's "show when parent is YES **or**
  UNKNOWN" gates exist specifically so an uncertain parent answer doesn't
  suppress a real safety follow-up).
- **C (independent safety even if parent negative)** — *looks* like a B, but is
  actually its own safety check that must still fire even when the "parent"
  looks negative. The task brief explicitly warns against ever collapsing
  these because they look redundant.
- **D (informational)** — non-safety phenotype/context/laterality question,
  typically `required: false` and typically absent from the module's
  `*Logic.ts` `State` interface entirely.
- **E (redundant/suspicious)** — a `showIf` that looks logically odd,
  inconsistent with a sibling module's equivalent gate, or disconnected from
  any computed flag. Flagged for a human to look at, not silently fixed.

## Why "hide it and keep the old answer" doesn't work here

`pruneStaleResponses()` (`src/spec/coreSpec.ts`) runs after every answer and,
unconditionally, nulls out the stored value of **any** question whose `showIf`
currently evaluates `false` but still holds a non-null value — there is no
per-field opt-out. `visibleQuestions()` and `pruneStaleResponses()` are the
same filter run twice (render vs. cleanup), so a screen cannot be hidden from
the patient while the engine still treats its old answer as current: the same
call that hides it also erases it. Every `*Logic.ts` engine in this codebase
(`neckLogic.ts`, `kneeLogic.ts`, `elbowLogic.ts`, `wristHandLogic.ts`,
`ankleFootLogic.ts`, `hipLogic.ts`, `tmjLogic.ts`) treats a missing/`undefined`
field as "fail closed to REVIEW," never as "assume negative." So a naive
"skip this screen and silently carry the last answer forward" UX change is
architecturally unsafe here: the moment the screen's `showIf` stops matching,
the carried-forward answer would be erased by `pruneStaleResponses`, and the
engine would then see `undefined` and (correctly, but probably not what the
UX change wanted) escalate to REVIEW rather than silently staying CLEAR. Any
future "skip/pre-fill" UX for these modules needs a **presentation shim** —
something that pre-selects the answer into `Responses` *before* the prune/
visibility pass runs on the still-visible screen (exactly what
`LBP_01B_LEG_SCREEN`/`LBP_10A_ONSET_AGE` did) — not a `showIf` change that
removes the question from `ALL_QUESTIONS`'s visible set while data still needs
to flow from it.

---

## NECK (`NECK_QUESTIONS`, gate: `IS_PRIMARY_NECK`, 15 questions)

Ground truth: `neckLogic.ts` (port of `NECK_V1_Tablet_Question_Set_v0.2.1_CLOSED.md` §5–7).

| Question ID | Parent | Show condition | Why | Safety-critical? | Can-skip? | Clinical-approval-needed? |
|---|---|---|---|---|---|---|
| NECK_01 | `IS_PRIMARY_NECK` | Always once neck/shoulder is primary. | Feeds `neckSafetyStatus`'s `traumaReview` (YES/UNKNOWN → REVIEW). | Yes | No | Yes |
| NECK_02 | `IS_PRIMARY_NECK` | Always. | Canonical cervical-myelopathy/cord screen; `RAPIDLY_WORSENING_LIMB_WEAKNESS`/`NEW_BLADDER_BOWEL_CHANGE` are URGENT triggers in `n02Status`, registered in `STAFF_CHECK_TRIGGERS`. | Yes | No | Yes |
| NECK_02A | NECK_02 (`hasNeckCordConcretePositive`) | Only when NECK_02 has a concrete positive value. | Legitimately a follow-up: `n02aStatus` only escalates to URGENT on `WORSENING` course, and is only computed at all when NECK_02 was concrete-positive. | Yes | No | Yes |
| NECK_03A | `IS_PRIMARY_NECK` | Always. | Own REVIEW trigger (`n03aStatus`) **and** modulates NECK_04's soft-tier escalation (E2 erratum: a non-valid-`NO` N03A forces N04's soft-tier items to URGENT). | Yes | No | Yes |
| NECK_03B | `IS_PRIMARY_NECK` | Always. | Thunderclap-headache/SAH screen; `YES` → URGENT (`n03bStatus`), registered in `STAFF_CHECK_TRIGGERS`. | Yes | No | Yes |
| NECK_04 | `IS_PRIMARY_NECK` | Always. | VBI/posterior-circulation-stroke screen; hard-tier values always URGENT, soft-tier values URGENT unless NECK_03A is a valid `NO` (E2). Registered in `STAFF_CHECK_TRIGGERS`. | Yes | No | Yes |
| NECK_05 | `IS_PRIMARY_NECK` | Always. | Systemic red-flag screen (cancer/infection/immunosuppression/recent cervical procedure/weight loss); also OR'd with Core's `HISTORY_01` CANCER positive (D9 reuse). | Yes | No (REVIEW-tier) | Yes |
| NECK_06 | `IS_PRIMARY_NECK` | Always; `required:false`. | Laterality only — absent from `NeckState`/`neckAdapter.ts` entirely; display-only. | No | Yes | No |
| NECK_07 | `IS_PRIMARY_NECK` | Always; `required:true`. | Not read by `neckSafetyStatus` — feeds `radicularSupport` (a treatment-consider classification, §4) and gates NECK_08. `required:true` despite being non-disease-safety, so treat gating changes with care. | No (disease safety) / feeds a CLOSED §4 consider-flag | Needs clinical review (gates NECK_08 and `radicular_support`) | Yes |
| NECK_08 | NECK_07 ∈ {SHOULDER_UPPER_ARM, FOREARM, HAND_FINGERS} | Only when NECK_07 indicates arm involvement. | Laterality only — absent from `NeckState`. | No | Yes | No |
| NECK_09 | `IS_PRIMARY_NECK` | Always. | Feeds `radicularSupport` **and** `neck_neuro_baseline_required` (a required-exam flag) — directly read by `computeNeckFlags`. | Yes | No | Yes |
| NECK_10 | `IS_PRIMARY_NECK` | Always. | `neck_headache_present` is read directly inside `neckSafetyStatus` to decide whether NECK_10A's REVIEW gap is "applicable" (E1 erratum) — i.e. NECK_10's own value participates in the safety computation, not just as a gate. | Yes | No | Yes |
| NECK_10A | NECK_10 ∈ {YES, UNKNOWN} | Only when there is a headache or headache status is uncertain. | E1 erratum widened this from `== 'YES'` specifically to close a fail-open where NECK_10=UNKNOWN could reach CLEAR without review — a documented near-miss of the Category-C failure mode. | Yes | No | Yes |
| NECK_11 | NECK_10 === 'YES' (exact) | Only on a confirmed headache. | Phenotype-only (CFRT/cervicogenic-headache candidate); feeds `cervicogenic_headache_pattern_consider` only, never disease safety. Deliberately kept `== 'YES'` (not widened like NECK_10A) per v0.2.1. | No | Yes | Yes (CLOSED-documented gate choice) |
| NECK_12 | `IS_NECK_CHRONIC_ONSET` (`VISIT_03_SYMPTOM_DURATION` ∈ {3m_1y, over_1y}) | Only for chronic-onset patients. | Feeds `movement_coordination_deficit_consider` only (non-safety). Gate binds to a Core field, not another NECK question. | No | Yes | Yes (CLOSED §12 binding note) |

**Findings — NECK**
1. **Category C:** none found in the *current* code — the one place this shape of bug existed (NECK_10A's original `== 'YES'` gate) was already closed by the documented E1 erratum.
2. **Category E:** none found — every conditional gate traces to a documented CLOSED-spec rule.
3. **Test coverage:** `STAFF_CHECK_TRIGGERS` urgent points (NECK_02/02A/03B/04) are asserted in section **I** (`I1`), and the NS01/F1 cross-module non-hiding invariant is heavily tested in sections **L/M**. However there is **no dedicated visibility-branch matrix** for NECK's own conditional children (NECK_02A's parent-positive gate, NECK_08's NECK_07-dependency, NECK_10A/11's NECK_10-dependency, NECK_12's chronic-onset gate) the way KNEE/ELBOW/WRIST_HAND/HIP/TMJ get in sections N/O/P/Q/R — this is a real coverage gap relative to the newer modules.

---

## SHOULDER (`SHOULDER_QUESTIONS`, gate: `IS_PRIMARY_NECK` — F1 invariant, 11 questions)

Ground truth: `shoulderLogic.ts` (port of `SHOULDER_V1_Tablet_Question_Set_v0.1.1_CLOSED.md` §10–12).
**F1 invariant**: every SHOULDER question (including NS01 itself) is gated by
the exact same `IS_PRIMARY_NECK` predicate as canonical NECK — NS01's value
never decides which safety questions are shown.

| Question ID | Parent | Show condition | Why | Safety-critical? | Can-skip? | Clinical-approval-needed? |
|---|---|---|---|---|---|---|
| NS01 | `IS_PRIMARY_NECK` | Always. | Tagging/routing only (`primary_module_detail` + exam-priority hint) — F1 explicitly forbids it from ever gating a safety question; not in `ShoulderState`. | No | Yes | No |
| SH01 | `IS_PRIMARY_NECK` | Always. | Gates SH02/SH03's shown-ness; `YES` alone never forces review (F3) — the real risk is caught by SH02/SH03. | Yes (gate) | No | Yes |
| SH02 | SH01 === 'YES' | Only after trauma. | Deformity/neurovascular-change screen; hard tier → URGENT. Registered `STAFF_CHECK_TRIGGERS`. | Yes | No | Yes |
| SH03 | SH01 === 'YES' | Only after trauma. | Acute traumatic cuff-tear screen; YES/UNKNOWN → REVIEW + `expedited_referral_consider`, never auto-URGENT (F3, explicit). | Yes | No | Yes |
| SH04 | `IS_PRIMARY_NECK` | Always — **not** trauma-gated. | Septic-joint/infection screen; `YES` → URGENT. Registered `STAFF_CHECK_TRIGGERS`. | Yes | No | Yes |
| SH05 | `IS_PRIMARY_NECK` AND `!computeFlags(r).general_red` | Always, unless Core's SAFETY_01 already confirmed a global red flag. | Non-mechanical cardiac-gap screen; the skip when `general_red` is a documented fail-safe (§3 F2), not a hiding of a positive answer — `core_safety_already_urgent` independently folds into `shoulderSafetyStatus`'s URGENT OR-chain so the skip can't create a gap (verified by test M4). | Yes | No | Yes |
| SH06 | `IS_PRIMARY_NECK` | Always; `required:false`. | Bilateral-stiff-pain screen; feeds `pmr_or_systemic_inflammatory_pattern_consider` (a PMR-pattern consider flag, not a disease-safety tier). | No (not URGENT/REVIEW-tier) | Needs clinical review (PMR pattern is clinically meaningful even though non-urgent) | Yes |
| SH07 | `IS_PRIMARY_NECK` | Always; `required:false`. | Laterality — not in `ShoulderState`. | No | Yes | No |
| SH08 | `IS_PRIMARY_NECK` | Always; `required:false`. | Load-related pain pattern — not in `ShoulderState`. | No | Yes | No |
| SH09 | `IS_PRIMARY_NECK` | Always; `required:false`. | Instability history — not in `ShoulderState`; SHOULDER_V1 has no separate instability-safety tier (v1 scope, §12). | No | Yes | Needs clinical review (scope decision, not an oversight) |
| SH09A | SH09 === 'YES' | Only after a positive instability history. | Onset-type detail follow-up; not in `ShoulderState`. | No | Yes | Needs clinical review |

**Findings — SHOULDER**
1. **Category C:** none found. SH05's `!general_red` skip is the closest shape to a risky gate, but it is extensively documented and test-verified (M4) as a fail-safe, not a hiding pattern.
2. **Category E:** none found.
3. **Test coverage:** sections **L/M** give SHOULDER the *best*-tested cross-module invariant (F1: NS01 never hides SH0x/canonical-NECK) and urgent-trigger coverage (SH02/SH04/SH05) of any module in this audit. There is, however, no dedicated visibility test for SH02/SH03's SH01-dependency or SH09A's SH09-dependency (the KNEE/ELBOW-style "appears on YES/UNKNOWN, not on NO" assertions) — a smaller but real gap next to NECK's.

---

## KNEE (`KNEE_QUESTIONS`, gate: `IS_PRIMARY_KNEE`, 18 questions)

Ground truth: `kneeLogic.ts` (port of `KNEE_V1_Tablet_Question_Set_v0.1.md` + `v0.1.1_Amendment`).

| Question ID | Parent | Show condition | Why | Safety-critical? | Can-skip? | Clinical-approval-needed? |
|---|---|---|---|---|---|---|
| KNEE_01 | `IS_PRIMARY_KNEE` | Always. | Gates KNEE_03/04/15; YES/NO alone don't escalate, only UNKNOWN/missing (§3). | Yes | No | Yes |
| KNEE_02 | `IS_PRIMARY_KNEE` | Always. | Deformity/circulation/major-neuro screen; concrete values → URGENT. Registered `STAFF_CHECK_TRIGGERS`. | Yes | No | Yes |
| KNEE_02A | `IS_PRIMARY_KNEE` (deliberately **not** gated by KNEE_01) | Always. | K2 decision: a self-reduced dislocation must not be hidden just because the patient answered "no trauma noticed." `YES` → URGENT. This is the textbook anti-C example — a future refactor that "cleans up" this into a KNEE_01-gated follow-up would recreate exactly the fail-open the task's Category C warns about. | Yes | **No — do not gate on KNEE_01** | Yes |
| KNEE_03 | KNEE_01 ∈ {YES, UNKNOWN} | Only when trauma occurred or is uncertain. | Post-trauma weight-bearing failure; `YES` → REVIEW + `fracture_imaging_consider`. | Yes | No | Yes |
| KNEE_04 | KNEE_01 ∈ {YES, UNKNOWN} | Same as KNEE_03. | Extensor-mechanism (patellar/quad tendon) rupture screen; REVIEW + `expedited_referral_consider`. | Yes | No | Yes |
| KNEE_05 | `IS_PRIMARY_KNEE` (not trauma-gated) | Always. | True mechanical locking (e.g. meniscal tear) can be atraumatic — same anti-C pattern as KNEE_02A. | Yes | No | Yes |
| KNEE_06 | `IS_PRIMARY_KNEE` | Always. | Unilateral-leg DVT symptom screen; gates KNEE_06A/06B. | Yes | No | Yes |
| KNEE_06A | KNEE_06 ∈ {YES, UNKNOWN} | Only when the DVT symptom screen is positive/uncertain. | DVT risk-context; the one negative carve-out (KNEE_06=YES + KNEE_06A=[NONE]) is the single most safety-critical calibration in the file (Amendment A1) — a deliberate, CLOSED-verified de-escalation. | Yes | No | Yes |
| KNEE_06B | KNEE_06 ∈ {YES, UNKNOWN} AND `!general_red` | Same gate as KNEE_06A, plus the already-urgent skip (same pattern as SHOULDER SH05). | PE-symptom screen; concrete positive → URGENT. Registered `STAFF_CHECK_TRIGGERS`. | Yes | No | Yes |
| KNEE_07 | `IS_PRIMARY_KNEE` | Always. | Septic-joint screen; `YES` → URGENT. Registered `STAFF_CHECK_TRIGGERS`. | Yes | No | Yes |
| KNEE_08 | `IS_PRIMARY_KNEE` (not gated by anything else) | Always. | Independent referred/non-knee red-flag screen (K9 finding: KNEE has no shared population with LBP/NECK to reuse, so this is a fresh minimal screen); also carries the hip/groin fracture option reusing `fracture_imaging_consider` (Amendment A2). | Yes | No | Yes |
| KNEE_09 | `IS_PRIMARY_KNEE` | Always; `required:false`. | Laterality — not in `KneeState`. | No | Yes | No |
| KNEE_10 | `IS_PRIMARY_KNEE` | Always; `required:false`. | Pain-location phenotype — not in `KneeState`. | No | Yes | No |
| KNEE_11 | `IS_PRIMARY_KNEE` | Always; `required:false`. | Load-provocation phenotype — not in `KneeState`. | No | Yes | No |
| KNEE_12 | `IS_PRIMARY_KNEE` | Always; `required:false`. | Morning-stiffness duration — not in `KneeState`. | No | Yes | No |
| KNEE_13 | `IS_PRIMARY_KNEE` | Always; `required:false`. | Giving-way/instability phenotype — not in `KneeState`. | No | Yes | No |
| KNEE_14 | `IS_PRIMARY_KNEE` | Always; `required:false`. | Patellar-instability history — not in `KneeState`. | No | Yes | No |
| KNEE_15 | KNEE_01 ∈ {YES, UNKNOWN} | Only when trauma occurred or is uncertain; `required:false`. | Rapid post-traumatic effusion (hemarthrosis clue) — gated correctly, but its answer is **not wired into any `KneeComputedFields` flag** (not `fracture_imaging_consider`, not anything) despite hemarthrosis being a classic ACL-tear/fracture indicator. Worth a human check on whether this is intentional v1 scope (KNEE_03/04 already catch the functional consequences) or a gap. | No (computed) / plausibly clinically relevant | Yes for UX purposes, but flagged — see Findings | Needs clinical review |

**Findings — KNEE**
1. **Category C:** none currently shipped, but KNEE_02A and KNEE_05 are the module's two "anti-C" cases — both deliberately unconditional despite looking like trauma follow-ups. **Any future refactor must not add a KNEE_01 gate to either.**
2. **Category E:** **KNEE_15** — collected but not read by `kneeLogic.ts`/`kneeAdapter.ts` at all (confirmed by grep). CLINICAL DECISION REQUIRED on whether this is intentional.
3. **Test coverage:** section **N** is the most thorough visibility+staff-interrupt+payload matrix in the whole file (N-C1–C7, N-D1–D6, N-E1–E6), including an explicit assertion that KNEE_02A stays visible when KNEE_01=NO (N-C3) — i.e. the anti-C invariant above is already regression-tested.

---

## ELBOW (`ARM_HAND_ROUTING_QUESTIONS` + `ELBOW_QUESTIONS`, gate: `IS_PRIMARY_ELBOW_SAFETY`, 18 questions)

Ground truth: `elbowLogic.ts` (port of `ELBOW_V1_Tablet_Question_Set_v0.1.1.md` §10–11).

| Question ID | Parent | Show condition | Why | Safety-critical? | Can-skip? | Clinical-approval-needed? |
|---|---|---|---|---|---|---|
| ELBOW_00 | `IS_PRIMARY_ARM_HAND` | Always for any `arm_hand` patient. | Region router shared with WRIST_HAND (deliberate `FOREARM`/`DIFFUSE_OR_MULTIPLE`/`UNKNOWN` overlap, Opus W1 decision) — never enters `ElbowState`/`WristHandState` computation itself, but its value decides whether the whole ELBOW and/or WRIST_HAND safety population is exposed. | No (itself) | Needs clinical review (high blast radius: mis-gating this hides an entire protected module) | Yes |
| ELBOW_01 | `IS_PRIMARY_ELBOW_SAFETY` | Always. | Gates ELBOW_03/04/05/15; YES alone never a review trigger by itself (§3). | Yes | No | Yes |
| ELBOW_02 | `IS_PRIMARY_ELBOW_SAFETY` | Always. | Deformity/circulation/major-neuro screen; concrete → URGENT. Registered `STAFF_CHECK_TRIGGERS`. | Yes | No | Yes |
| ELBOW_02A | `IS_PRIMARY_ELBOW_SAFETY` (not gated by ELBOW_01) | Always. | Same K2-style anti-C pattern as KNEE_02A — self-reduced dislocation must fire regardless of ELBOW_01. `YES` → URGENT. | Yes | **No — do not gate on ELBOW_01** | Yes |
| ELBOW_03 | ELBOW_01 ∈ {YES, UNKNOWN} | Only post-trauma/uncertain. | Post-trauma functional loss; `YES` → REVIEW + `fracture_imaging_consider`. | Yes | No | Yes |
| ELBOW_04 | ELBOW_01 ∈ {YES, UNKNOWN} | Same. | Distal biceps-rupture screen; REVIEW + expedited. | Yes | No | Yes |
| ELBOW_05 | ELBOW_01 ∈ {YES, UNKNOWN} | Same. | Distal triceps-rupture screen; REVIEW + expedited. | Yes | No | Yes |
| ELBOW_06 | `IS_PRIMARY_ELBOW_SAFETY` (not trauma-gated) | Always. | True mechanical ROM block; same anti-C pattern as KNEE_05. | Yes | No | Yes |
| ELBOW_07 | `IS_PRIMARY_ELBOW_SAFETY` | Always. | Septic-joint screen; `YES` → URGENT. Registered `STAFF_CHECK_TRIGGERS`. | Yes | No | Yes |
| ELBOW_08 | `IS_PRIMARY_ELBOW_SAFETY` | Always. | Posterior bursal screen (single_choice OR-semantics value); `SYSTEMIC_OR_RAPIDLY_SPREADING` → URGENT. Registered `STAFF_CHECK_TRIGGERS`. | Yes | No | Yes |
| ELBOW_09 | `IS_PRIMARY_ELBOW_SAFETY` | Always. | Ulnar-nerve sensory screen; gates ELBOW_09A. | Yes | No | Yes |
| ELBOW_09A | ELBOW_09 ∈ {YES, UNKNOWN} | Only when sensory screen positive/uncertain. | Ulnar motor-progression detail; the stable-sensory-only carve-out is the module's most safety-critical calibration (mirrors KNEE_06A). `expedited`/`neuro` are computed together specifically because a prior version let them drift apart (v0.1.1 fix). | Yes | No | Yes |
| ELBOW_10 | `IS_PRIMARY_ELBOW_SAFETY` | Always. | Independent referred/proximal (neck/shoulder/bilateral) red-flag screen — a fresh screen, not a reuse of NECK_QUESTIONS (explicit §6 CLOSED decision). | Yes | No | Yes |
| ELBOW_11 | `IS_PRIMARY_ELBOW_SAFETY` AND `!general_red` | Always unless Core already confirmed urgent. | Cardiac-associated screen; concrete → URGENT. Same already-urgent-skip pattern as SH05/KNEE_06B. Registered `STAFF_CHECK_TRIGGERS`. | Yes | No | Yes |
| ELBOW_12 | `IS_PRIMARY_ELBOW_SAFETY` | Always; `required:false`. | Pain-location phenotype — not in `ElbowState`. | No | Yes | No |
| ELBOW_13 | `IS_PRIMARY_ELBOW_SAFETY` | Always; `required:false`. | Laterality — not in `ElbowState`. | No | Yes | No |
| ELBOW_14 | `IS_PRIMARY_ELBOW_SAFETY` | Always; `required:false`. | Load-activity phenotype — not in `ElbowState`. | No | Yes | No |
| ELBOW_15 | ELBOW_01 ∈ {YES, UNKNOWN} | Only post-trauma/uncertain; `required:false`. | Rapid post-traumatic swelling — same unwired-output pattern as KNEE_15: gated correctly but not read by `elbowLogic.ts`/`elbowAdapter.ts` at all. | No (computed) / plausibly clinically relevant | Yes for UX, but flagged | Needs clinical review |

**Findings — ELBOW**
1. **Category C:** none shipped. ELBOW_02A and ELBOW_06 are the anti-C examples (deliberately unconditional despite trauma-adjacent appearance) — must not be gated on ELBOW_01 in a future change.
2. **Category E:** **ELBOW_15**, same unwired-output pattern as KNEE_15 — recurring pattern across the two modules, worth a single combined clinical decision.
3. **Test coverage:** section **O** matches N's depth (visibility incl. ELBOW_00 routing, ELBOW_09A branch, staff triggers, stale-prune across the ELBOW_00 shared router) — well covered, though (like N) it doesn't have an explicit "still visible when ELBOW_01=NO" assertion for ELBOW_02A/06 the way N-C3 does for KNEE_02A.

---

## WRIST_HAND (`WRIST_HAND_QUESTIONS`, gate: `IS_PRIMARY_WRIST_HAND_SAFETY` — shares `ELBOW_00` router, 18 questions)

Ground truth: `wristHandLogic.ts` (port of `WRIST_HAND_V1_Tablet_Question_Set_v0.1.md` + v0.1.1 delta).

| Question ID | Parent | Show condition | Why | Safety-critical? | Can-skip? | Clinical-approval-needed? |
|---|---|---|---|---|---|---|
| WH_01 | `IS_PRIMARY_WRIST_HAND_SAFETY` | Always. | Gates WH_03/04/05. | Yes | No | Yes |
| WH_02 | `IS_PRIMARY_WRIST_HAND_SAFETY` | Always. | Deformity/circulation/bleeding/open-wound screen; 5 concrete values all independent URGENT triggers. Registered `STAFF_CHECK_TRIGGERS`. | Yes | No | Yes |
| WH_03 | WH_01 ∈ {YES, UNKNOWN} | Only post-trauma/uncertain. | Major function loss; `YES` → REVIEW + `fracture_imaging_consider`. | Yes | No | Yes |
| WH_04 | WH_01 ∈ {YES, UNKNOWN} | Same. | Radial/thumb-base pain (scaphoid-fracture screen); `YES` → REVIEW + `fracture_imaging_consider`. | Yes | No | Yes |
| WH_04A | WH_01 ∈ {YES, UNKNOWN} | Same; `required:false`. | Prior X-ray context — **explicitly excluded from `WristHandState` at the type level** so no escalation logic can ever reference it (Fable plan §9 invariant); pure non-gating display context. | No | Yes (by design) | No |
| WH_05 | WH_01 ∈ {YES, UNKNOWN} | Same. | Fixed motion block; `YES` → REVIEW only, never blanket `expedited` (§3/W7). | Yes | No | Yes |
| WH_06 | `IS_PRIMARY_WRIST_HAND_SAFETY` (not trauma-gated) | Always. | Wound-exposure screen (cut/bite); `HUMAN_OR_ANIMAL_BITE` is an independent REVIEW trigger. Correctly unconditional (anti-C pattern, same shape as KNEE_02A). Gates WH_06A. | Yes | No | Yes |
| WH_06A | `isWh06WoundShown(WH_06)` (cut, bite, or UNKNOWN) | Only after a wound-type answer. | Post-wound active-motion loss; `YES` → REVIEW + `tendon_injury_assessment_required` + expedited. | Yes | No | Yes |
| WH_07 | `IS_PRIMARY_WRIST_HAND_SAFETY` | Always. | Broad infection screen (single_choice OR-semantics); `SYSTEMIC_OR_RAPIDLY_SPREADING` → URGENT. Registered `STAFF_CHECK_TRIGGERS`. | Yes | No | Yes |
| WH_07A | `isWh07aShown(WH_06, WH_07)` — WH_06 wound/bite/UNKNOWN route **OR** WH_07 ∈ {FINGER_LOCALIZED_SWOLLEN_PAINFUL, UNKNOWN} | Only via one of the two routes above. | **Flagged Category C.** The source code's own comment ("Fable plan §10/§17 invariant 6") explicitly warns future maintainers never to AND-gate this on WH_07's value — its concrete positives (severe pain on straightening / stays flexed / fusiform swelling) are flexor-tendon-sheath-infection signs that are an **independent URGENT source regardless of what WH_07 was answered, including WH_07='NONE'**. It is currently implemented correctly (an OR of two routes, not a single narrow AND), but it is exactly the shape the task brief's Category C describes — a future "simplify the gate to just WH_07 != NONE" change would silently hide it whenever there's a bite/cut with no locally-swollen finger, recreating a fail-open. | Yes | **No — never narrow this gate; treat both routes as independently required** | Yes |
| WH_08 | `IS_PRIMARY_WRIST_HAND_SAFETY` | Always. | Median/ulnar distal-sensory-pattern screen (CTS/cubital-equivalent); gates WH_08A. | Yes | No | Yes |
| WH_08A | WH_08 ≠ NONE (i.e. a concrete pattern or UNKNOWN) | Only when a sensory pattern was reported. | Motor-progression detail; stable-sensory-only carve-out (WH_08 concrete + WH_08A=[NONE]) is the module's most safety-critical calibration, mirrors ELBOW_09A/KNEE_06A. | Yes | No | Yes |
| WH_09 | `IS_PRIMARY_WRIST_HAND_SAFETY` | Always; `required:false`. | Pain-location phenotype — explicitly excluded from `WristHandState` ("WH_09-14, optional phenotype, never safety-relevant"). | No | Yes | No |
| WH_10 | `IS_PRIMARY_WRIST_HAND_SAFETY` | Always; `required:false`. | Load-activity phenotype — same exclusion. | No | Yes | No |
| WH_11 | `IS_PRIMARY_WRIST_HAND_SAFETY` | Always; `required:false`. | Trigger/catching phenotype — same exclusion. | No | Yes | No |
| WH_12 | `IS_PRIMARY_WRIST_HAND_SAFETY` | Always; `required:false`. | Localized-mass phenotype — same exclusion. | No | Yes | No |
| WH_13 | `IS_PRIMARY_WRIST_HAND_SAFETY` | Always; `required:false`. | Referred/systemic pattern (bilateral sensory, multiple swollen joints, morning stiffness) — reads like inflammatory-arthritis red flags but is a documented CLOSED v1 scope exclusion, same as WH_09-12. | No | Yes | No (scope already CLOSED, but worth noting the thematic overlap for a future v2) |
| WH_14 | `IS_PRIMARY_WRIST_HAND_SAFETY` | Always; `required:false`. | Laterality — same exclusion. | No | Yes | No |

**Findings — WRIST_HAND**
1. **Category C:** **WH_07A** — the flagship example for this whole audit; see table row above. CLINICAL DECISION REQUIRED if anyone proposes narrowing its gate.
2. **Category E:** none found — every gate traces to a documented rule, and WH_04A/WH_09-14's exclusion from `WristHandState` is enforced at the TypeScript type level, not just convention.
3. **Test coverage:** section **P** is strong specifically where it matters most — `P-C8` tests all three routes into WH_07A independently (wound route, `FINGER_LOCALIZED_SWOLLEN_PAINFUL` route, `UNKNOWN` route) and `P-D4` explicitly asserts `STAFF_CHECK_TRIGGERS.WH_07A` fires even when `WH_07='NONE'` — i.e. the Category-C risk above is already regression-tested, which meaningfully lowers (but doesn't eliminate) the risk of a future silent regression here.

---

## ANKLE_FOOT (`ANKLE_FOOT_ROUTING_QUESTIONS` + `ANKLE_FOOT_QUESTIONS`, gate: `IS_PRIMARY_ANKLE_FOOT_SAFETY`, 9 questions)

Ground truth: `ankleFootLogic.ts` (literal port of the "A1-A8" CLOSED contract).

| Question ID | Parent | Show condition | Why | Safety-critical? | Can-skip? | Clinical-approval-needed? |
|---|---|---|---|---|---|---|
| AF_00 | `IS_PRIMARY_ANKLE_FOOT` | Always for any `leg_foot` patient. | Region router — never enters `AnkleFootState`, but its value decides `af04_shown`/`af05_shown`/`af07_shown`, i.e. whole-screen exposure. | No (itself) | Needs clinical review (blast radius) | Yes |
| AF_01 | `IS_PRIMARY_ANKLE_FOOT_SAFETY` | Always. | Gates AF_03 and (combined with AF_00 region) AF_04/AF_05. | Yes | No | Yes |
| AF_02 | `IS_PRIMARY_ANKLE_FOOT_SAFETY` | Always. | Limb-threatening screen; open-injury/bleeding/circulation always URGENT; the neuro item's tier depends on trauma status computed *inside* the engine (not the `showIf`). Registered `STAFF_CHECK_TRIGGERS`. | Yes | No | Yes |
| AF_03 | `AF_01 === 'YES'` (exact) | Only on confirmed trauma. | **Flagged Category E.** Every sibling module (KNEE_03/04, ELBOW_03/04/05, WH_03/04/05) gates its post-trauma follow-up on the parent being `∈ {YES, UNKNOWN}` — i.e. an *uncertain* trauma answer still triggers the conservative follow-up. AF_03 (and AF_04/AF_05 below) instead require the exact literal `'YES'`, matching `ankleFootLogic.ts`'s own `trauma = s.recent_trauma === 'YES'` internal gate — so there's no computation gap today, but the pattern is inconsistent with 4 other modules built the same year from the same conventions, and worth a human confirming it's an intentional divergence in the ANKLE_FOOT CLOSED contract rather than an oversight. | Yes | No | Yes |
| AF_04 | `IS_AF_04_SHOWN`: `AF_01==='YES'` AND AF_00 ∈ {FOOT_TOES, DIFFUSE_OR_MULTIPLE, UNKNOWN} | Only post-trauma (exact YES) in a midfoot-relevant region. | Midfoot/Lisfranc-injury supportive screen; same AF_01-exact-YES pattern as AF_03 — see Category E note above. | Yes | No | Yes |
| AF_05 | `IS_AF_05_SHOWN`: `AF_01==='YES'` AND AF_00 ∈ {LOWER_LEG_CALF, ANKLE, HEEL_POSTERIOR_ANKLE, DIFFUSE_OR_MULTIPLE, UNKNOWN} | Only post-trauma (exact YES) in an Achilles-relevant region. | Achilles-rupture screen; same AF_01-exact-YES pattern — see Category E note above. | Yes | No | Yes |
| AF_06 | `IS_PRIMARY_ANKLE_FOOT_SAFETY` (not trauma-gated) | Always. | Infection screen; correctly unconditional (anti-C pattern, same shape as KNEE_02A). Urgent tier for systemic/ischaemia values. Registered `STAFF_CHECK_TRIGGERS`. | Yes | No | Yes |
| AF_07 | `IS_AF_07_SHOWN`: AF_00 ∈ {LOWER_LEG_CALF, DIFFUSE_OR_MULTIPLE, UNKNOWN} (region-gated, **not** trauma-gated) | Only for calf/diffuse/unknown regions. | DVT symptom screen; correctly independent of trauma status. | Yes | No | Yes |
| AF_08 | `IS_PRIMARY_ANKLE_FOOT_SAFETY` (not trauma-gated) | Always. | Question text itself says "외상과 별개로" (separate from trauma) — progressive non-traumatic neuro screen; correctly unconditional. | Yes | No | Yes |

**Findings — ANKLE_FOOT**
1. **Category C:** none found — AF_06/AF_07/AF_08 are all correctly unconditional-of-trauma (the anti-C pattern is followed correctly here).
2. **Category E:** **AF_03, AF_04, AF_05** — the exact-`'YES'` (rather than `∈ {YES, UNKNOWN}`) trauma gate diverges from every sibling module's convention. CLINICAL DECISION REQUIRED to confirm this is intentional in the ANKLE_FOOT CLOSED contract, or should be aligned with the other modules' fail-open-safe convention.
3. **Test coverage: this is the thinnest-tested module in the audit.** There is no lettered section (unlike KNEE=N, ELBOW=O, WRIST_HAND=P, TMJ=Q, HIP=R) — only a short ~15-line "AF core" block that checks AF_00/AF_01/AF_02/AF_06/AF_08 are shown and that AF_02's urgent trigger and AF_07's region-gating work. There is **no dedicated branch-visibility test for AF_03/AF_04/AF_05's conditional gates and no stale-prune test for the ANKLE_FOOT module at all** (the H1/H3 generic full-walk sweep uses a `pain` patch with no `PAIN_01` set, so it doesn't specifically exercise `leg_foot`). This is the module most in need of test-coverage investment before any branch-visibility change is made.

---

## HIP (`hipQuestions.ts` — `HIP_ROUTING_QUESTIONS` + `HIP_QUESTIONS`, gate: `IS_PRIMARY_HIP_SAFETY`, shares `PAIN_01==='low_back_pelvis'` population with FROZEN LBP, 8 questions)

Ground truth: `hipLogic.ts` (literal port of the "H1-H8" CLOSED contract).

| Question ID | Parent | Show condition | Why | Safety-critical? | Can-skip? | Clinical-approval-needed? |
|---|---|---|---|---|---|---|
| HIP_00 | `IS_PRIMARY_HIP_POPULATION` (`PAIN_01==='low_back_pelvis'`) | Always for low_back_pelvis patients. | Region router — excludes `LOW_BACK_DOMINANT` from `IS_PRIMARY_HIP_SAFETY` (documented as sharing entry population with FROZEN LBP, most-scrutinized routing mechanism per test comments). Not in `HipState`. | No (itself) | Needs clinical review (blast radius; also touches the LBP/HIP population boundary) | Yes |
| HIP_01 | `IS_PRIMARY_HIP_SAFETY` | Always. | Gates HIP_03. | Yes | No | Yes |
| HIP_02 | `IS_PRIMARY_HIP_SAFETY` | Always. | Limb-threatening screen; deformity/bleeding/circulation always URGENT, trauma-conditional neuro tier computed inside the engine. Registered `STAFF_CHECK_TRIGGERS`. | Yes | No | Yes |
| HIP_03 | `HIP_01 === 'YES'` (exact) | Only on confirmed trauma. | **Flagged Category E** — same exact-`'YES'` (not `∈ {YES, UNKNOWN}`) pattern as ANKLE_FOOT's AF_03/04/05, diverging from KNEE/ELBOW/WRIST_HAND's convention. Internally consistent with `hipLogic.ts`'s own `trauma = s.recent_trauma === 'YES'` gate, so no computation gap today — but worth confirming intentional. | Yes | No | Yes |
| HIP_03A | HIP_03 ∈ {MARKED_WEIGHT_BEARING_OR_WALKING_DIFFICULTY, UNKNOWN} | Only after a marked-difficulty/uncertain HIP_03 answer; `required:false`. | Prior imaging context — confirmed (grep) to be read only by `DoctorView.tsx`/`fixtures.ts` for display, never by `hipLogic.ts`. | No | Yes | No |
| HIP_04 | `IS_PRIMARY_HIP_SAFETY` (not trauma-gated) | Always. | Stress-fracture pattern (atraumatic/insidious deep pain, repetitive load, progressive weight-bearing pain); correctly unconditional (anti-C pattern) since stress fractures are by definition non-traumatic. | Yes | No | Yes |
| HIP_05 | `IS_PRIMARY_HIP_SAFETY` | Always. | Infection screen; systemic/rapidly-worsening → URGENT. Registered `STAFF_CHECK_TRIGGERS`. | Yes | No | Yes |
| HIP_06 | `IS_PRIMARY_HIP_SAFETY` (not trauma-gated) | Always. | Question text itself says "다친 일이 뚜렷하지 않은데도" (even without clear trauma) — progressive neuro screen; correctly unconditional. | Yes | No | Yes |

**Findings — HIP**
1. **Category C:** none found — HIP_04/HIP_06 correctly avoid the anti-C trap.
2. **Category E:** **HIP_03** — same exact-`'YES'` gating divergence as ANKLE_FOOT's AF_03/04/05 (worth resolving both modules' CLINICAL DECISION as one combined question, since they may share an origin/author).
3. **Test coverage:** section **R** is thorough (R-C1–C11 visibility incl. HIP_03/HIP_03A branch gating and stale-prune, R-D staff triggers) — comparable in depth to N/O/P/Q, not a gap.

---

## TMJ (`tmjQuestions.ts` — `TMJ_ROUTING_QUESTIONS` + `TMJ_QUESTIONS`, gate: `IS_PRIMARY_TMJ_SAFETY`, 6 questions)

Ground truth: `tmjLogic.ts` (literal port of the "T1-T8" CLOSED contract).

| Question ID | Parent | Show condition | Why | Safety-critical? | Can-skip? | Clinical-approval-needed? |
|---|---|---|---|---|---|---|
| HFJ_00 | `IS_PRIMARY_HFJ_POPULATION` (`PAIN_01==='head_face_jaw'`) | Always for head_face_jaw patients. | Region router — the `HEADACHE_CRANIAL` value is the *only* one that excludes the TMJ protected-safety screens (T2, most-scrutinized routing mechanism per test file). Not in `TmjState`. | No (itself) | Needs clinical review (blast radius; the one HEADACHE_CRANIAL exclusion is a hard population boundary) | Yes |
| TMJ_01 | `IS_PRIMARY_TMJ_SAFETY` | Always. | Trauma/dislocation screen; 4 hard values always URGENT, one value (bite/function change) REVIEW-only. Registered `STAFF_CHECK_TRIGGERS`. | Yes | No | Yes |
| TMJ_02 | `IS_PRIMARY_TMJ_SAFETY` | Always. | Dental/oral infection screen (single_choice); systemic/eye-airway-compromise values → URGENT. Registered `STAFF_CHECK_TRIGGERS`. | Yes | No | Yes |
| TMJ_03 | `IS_PRIMARY_TMJ_SAFETY` | Always. | GCA (giant-cell-arteritis) history screen; compatible pattern + age ≥50 (or age unknown, treated conservatively, not as negative) → `gca_assessment_required`; add visual symptom → URGENT. Age comes from the patient's profile (`patient_age`), not from a TMJ question — an external dependency worth noting. Registered `STAFF_CHECK_TRIGGERS`. | Yes | No | Yes |
| TMJ_04 | `IS_PRIMARY_TMJ_SAFETY` | Always. | Facial-neuro screen; positive → REVIEW + neuro + expedited. | Yes | No | Yes |
| TMJ_05 | `IS_PRIMARY_TMJ_SAFETY` | Always. | Current-lock screen; locked → REVIEW + trauma-assessment flag. | Yes | No | Yes |

**Findings — TMJ**
1. **Category C:** none found.
2. **Category E:** none found. TMJ is the simplest module in the audit — every TMJ_0x question is unconditionally gated by `IS_PRIMARY_TMJ_SAFETY` alone; the only conditional logic in the module is HFJ_00's single HEADACHE_CRANIAL exclusion.
3. **Test coverage:** section **Q** thoroughly covers the HEADACHE_CRANIAL exclusion from both directions (Q-C4 confirms the other 4 HFJ_00 values all still expose TMJ safety; Q-C5 confirms HEADACHE_CRANIAL excludes all of it) plus stale-prune (Q-C7/C8) and all 3 urgent-tier triggers (Q-D1/D2 + TMJ_03's GCA age-modifier, tested separately) — no coverage gap identified.

---

## Summary across all 8 modules

| Module | # Questions | # A | # B | # C | # D | # E | CLINICAL DECISION REQUIRED? |
|---|---|---|---|---|---|---|---|
| NECK | 15 | 8 | 2 | 0 | 5 | 0 | No |
| SHOULDER | 11 | 3 | 3 | 0 | 5 | 0 | No |
| KNEE | 18 | 7 | 4 | 0 | 6 | 1 | **Yes** — KNEE_15 (unwired informational field) |
| ELBOW (incl. `ELBOW_00` router) | 18 | 9 | 4 | 0 | 4 | 1 | **Yes** — ELBOW_15 (unwired informational field, same pattern as KNEE_15) |
| WRIST_HAND | 18 | 5 | 5 | 1 | 7 | 0 | **Yes — highest priority.** WH_07A (Category C: the gate must never be narrowed to depend on WH_07 alone) |
| ANKLE_FOOT (incl. `AF_00` router) | 9 | 4 | 1 | 0 | 1 | 3 | **Yes** — AF_03/04/05 exact-`'YES'` gating divergence from sibling modules, plus this is the least-tested module overall |
| HIP (incl. `HIP_00` router) | 8 | 5 | 0 | 0 | 2 | 1 | **Yes** — HIP_03 same exact-`'YES'` gating divergence as ANKLE_FOOT (likely one combined decision) |
| TMJ (incl. `HFJ_00` router) | 6 | 5 | 0 | 0 | 1 | 0 | No |
| **Total** | **103** | **46** | **19** | **1** | **31** | **6** | **5 of 8 modules flagged** |

**Cross-module observations worth a single combined clinical decision:**
- **AF_03/AF_04/AF_05 (ANKLE_FOOT) and HIP_03 (HIP)** all gate on their trauma parent being the exact literal `'YES'`, while every question in KNEE/ELBOW/WRIST_HAND with the same shape (KNEE_03/04, ELBOW_03/04/05, WH_03/04/05) gates on `∈ {YES, UNKNOWN}` — i.e. an uncertain trauma answer still triggers the conservative follow-up in 3 of the 5 trauma-detail-bearing modules but not the other 2. Both diverging modules are internally consistent (their `*Logic.ts` engines use the same exact-YES gate), so there is no live computation bug, but a human should confirm whether ANKLE_FOOT/HIP's CLOSED contracts intentionally chose the narrower gate or whether this is an unreviewed inconsistency.
- **KNEE_15 and ELBOW_15** (both "rapid post-traumatic swelling/effusion" questions) are correctly gated but their answers are not read by any computed flag in their respective `*Logic.ts` files, despite rapid post-traumatic effusion being a recognized clinical indicator (hemarthrosis) elsewhere in orthopedic screening. Worth one combined decision on whether this is intentional v1 scope.
- **WH_07A (WRIST_HAND)** is the one confirmed Category C in this audit and is already the most heavily test-covered conditional question in the codebase (P-C8, P-D4) — the risk is well-managed today, but it is the single highest-consequence question across all 8 modules for a future maintainer to accidentally regress by "simplifying" its `showIf`.
- **ANKLE_FOOT's test coverage is materially thinner** than every other module reviewed here (no dedicated section, no branch-visibility matrix, no stale-prune test) and should be brought up to the KNEE/ELBOW/WRIST_HAND/HIP/TMJ standard before any UX change touches this module's `showIf` logic.
