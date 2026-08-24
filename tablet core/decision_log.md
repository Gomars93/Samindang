# Decision Log — v1.2 to v1.3 Autonomous Specification Repair

Source: v1.2 re-validation findings (simulation_report_v1.2.md), covering the prior
기획 검수 (spec review) of survey_core_v1.2.yaml + branch_rules_v1.2.yaml. Every
change below is category A under the autonomy policy (schema consistency, field
ownership, state machine, null/missing semantics, enum serialization, selector
precedence, routing reachability, fatigue-budget calculation, timing class, second
complaint cap, extension ordering, guard/fallback mechanics, testability) unless
marked CLINICAL_DECISION_REQUIRED.

## Changes made

1. **primary_micro_module_complete dual producer (N-11)** — removed from all 17
   module_contracts[].outputs lists; engine_state remains the sole declared
   producer. Category: producer/consumer contracts.

2. **selector_precedence undefined (N-1)** — added a top-level
   `selector_semantics.first_matching_field` operational definition: first
   selector_field (in order) whose value is itself a choice_sets key, else
   fallback_choice_set. Also added the missing `selector_precedence` declaration
   to core_nonmsk_detail for consistency. Category: dynamic selector precedence.

3. **second_complaint counter increment undefined (N-2)** — counter_increment_when
   changed from the free-text "second complaint module is opened" (pointing at
   nothing that exists) to a structured `{type: question_answered, question_id:
   core_second_complaint_domain}` — the only concrete artifact that exists today
   for a second complaint, and it fires on both if_budget_available and
   if_budget_low paths (closing the specific gap where the low-budget path never
   incremented at all). Category: state machine.

4. **route_target_seconds undefined identifier (N-4a)** — added `timing_class`
   (simple_msk | simple_herbal) to every primary_routes entry and a structured
   `budget_definition.route_target_seconds.resolution` describing the
   timing_class -> fatigue_policy.targets[<class>_p90_seconds] lookup. No route
   is classified complex_herbal — see CLINICAL_DECISION_REQUIRED #2 below.
   Category: timing class / fatigue-budget calculation.

5. **defer_candidates vocabulary mismatch** — 'high_value_if_not_started' (which
   matched no question's fatigue_priority value) replaced with 'high_value'; the
   "not yet started" condition is enforced by overflow_behavior's ordering, not
   baked into the vocabulary string. Category: fatigue-budget calculation.

6. **elapsed_seconds >= 240 contradicted complex_herbal_p90_seconds=300** —
   replaced the bare constant with `elapsed_seconds >= core_p90_seconds`, which
   is internally consistent with the declared core targets. Category: fatigue-
   budget calculation.

7. **Enum serialization (N3)** — core_safety_profile.items now use structured
   `choices: [{value, label}]` (matching every other question in the file)
   instead of raw Korean-literal `values: [...]`. severe_allergy_history's
   UNKNOWN option now serializes as the ASCII token 'UNKNOWN' with a Korean
   label, consistent with every other UNKNOWN-bearing question, instead of the
   literal string '잘 모르겠음'. All three downstream show_when references
   (medication_categories, medication_name_optional, major_history_categories)
   updated from `value: "있음"` to `value: YES`. Category: enum serialization.

8. **No fallback primary route for a missing detail (N-6)** — added
   `route_fallback_no_detail` (priority -10, routes to GENERIC_OTHER_V1) so a
   domain that requires primary_complaint_detail but reaches routing with it
   MISSING still resolves to exactly one route instead of zero. Structural
   safety net only; not reachable through normal patient flow since
   core_msk_region/core_nonmsk_detail are both required:true. Category: routing
   reachability / guard-fallback mechanics.

9. **Second-complaint prompt vs. extension-module ordering (N-7)** — added
   `engine_state.pending_extension_present` (boolean, set true when a
   module_extensions entry attaches, false at that extension's terminal state);
   both module_extensions entries now declare `sets_pending_extension: true`;
   core_second_complaint.show_when now also requires
   `pending_extension_present == false`, so the prompt cannot fire while
   MENOPAUSE_SLEEP (or any future extension) is still attached. Category:
   extension ordering.

10. **fatigue_policy.value_semantics.false had no comparison_rule** — added one
    (ordinary boolean equality, distinct from missing). value_semantics.UNKNOWN
    got an explicit `serialization: ASCII token 'UNKNOWN'` note tying it to fix
    #7. Category: null/missing semantics.

## CLINICAL_DECISION_REQUIRED (not decided autonomously — see unresolved_clinical_decisions.md)

1. **pregnancy_gate_patient_sex_scope** — core_pregnancy_status was gated on
   patient_sex==F only, while runtime_context_contract declares patient_sex in
   [M,F,OTHER,UNKNOWN]; a childbearing-age OTHER/UNKNOWN patient was silently
   never asked a safety_level=critical question. Provisional (most
   conservative) behavior adopted: widened to `patient_sex in [F, OTHER,
   UNKNOWN]`. This is a clinical/product call about what's appropriate to ask,
   not a pure schema-completeness fix, despite superficially looking like one —
   flagged for sign-off rather than silently finalized.

2. **complex_herbal_route_classification** — fatigue_policy.targets declares
   complex_herbal_p90_seconds=300s but nothing in the spec defines which herbal
   presentations count as "complex." No route is currently classified that way
   (all herbal routes default to simple_herbal). Deciding the clinical criteria
   for case complexity is out of scope for a schema repair pass.

## What was deliberately NOT touched

- No red-flag questions added or removed.
- No referral criteria, physical-exam selection, diagnostic-hypothesis meaning,
  exercise indication/contraindication, or 한약 임상문진 내용 changed.
- No clinical safety threshold (NRS cutoffs, medication category lists, major
  history categories) changed.
- No API keys/secrets, patient data, production Sigma writes, or data
  migrations touched — none existed in this bundle to begin with.
- value_semantics.null remains a declared category with no current producer
  (harmless, non-blocking) — not invented a producer for it just to close the
  gap; left as an honest limitation (see simulation_report_v1.4.md).
- micro_module_question_sets_absent remains not_computable, per
  branch_rules_v1.4.yaml:simulation_policy.total_path_timing — not estimated
  or guessed.

---

# Decision Log Part 2 — v1.3 to v1.4 (LBP_V1 integration)

## Provenance issue found and how it was handled

The externally-supplied `Samindang_LBP_V1_candidate_package.zip` included its own copies
of `survey_core_v1.3.yaml` and `branch_rules_v1.3.yaml`, alongside the real clinical
content (`lbp_v1.0_candidate.yaml`, `evidence_matrix_lbp_v1.md`) and reference tooling
(`lbp_engine.py`, `test_lbp_v1.py`, `simulate_lbp.py`).

Those bundled core-spec copies were **not used**. A semantic diff (parsed YAML, not text)
against this repo's actual frozen v1.3 found: field renames not present in the real file
(`primary_complaint_detail` split into `primary_msk_region`/`primary_nonmsk_detail`;
`primary_micro_module_complete` split into `primary_base_module_complete`/
`primary_path_complete`); `core_pregnancy_status`'s NO/YES choices unquoted in the bundled
file — the exact PyYAML boolean-coercion bug already found and fixed during the v1.2->v1.3
repair, with the candidate's own validator explicitly whitelisting it rather than fixing
it at the source; `branch_rules_v1.4_candidate.yaml` internally mixing both baselines
(routing conditions use the real field names, module-completion logic uses the renamed
ones); and `simulate_lbp.py` hardcoding a manual patch that only makes sense against the
real field name. `final_validation_report_lbp_v1.md` itself states the bundled files are
reference/fallback ("repo 최신 Master Spec 우선"), confirming the intended integration
target was always the real repo spec.

**Resolution:** `survey_core_v1.4.yaml`/`branch_rules_v1.4.yaml` were built by copying this
repo's real frozen v1.3 files forward and editing them directly. Only `lbp_v1.0.yaml`
(renamed from `lbp_v1.0_candidate.yaml`) and `evidence_matrix_lbp_v1.md` were ported —
both self-contained with respect to core field names. `branch_rules_v1.4.yaml`'s LBP_V1
binding was hand-authored against the real v1.3 field names.

## Structural integration

1. `branch_rules_v1.4.yaml:module_contracts.LBP_V1` bound to `lbp_v1.0.yaml` with
   `output_domains` for `lbp_safety_status`/`leg_symptom_present`.
2. `spec_lib.py` — added `load_module_question_set()`/`merge_module_into_survey()`, which
   AND-combines a module's `entry_when` into every one of its questions' `show_when` so
   every existing structural check treats core+module as one consistent question set.
3. `spec_lib.known_producers()` — added a `computed_fields` source category.
4. `validate_schema.py` — two new checks: `check_module_contract_outputs_producible` and
   `check_module_entry_when_matches_route`. Both pass clean — `route_lbp.when` and
   `LBP_V1.entry_when` were authored to match exactly.
5. `check_dual_producer_fields` refined: a module's own `computed_fields` declaration and
   `branch_rules` declaring that same module's output are one authority in two
   complementary registries, not a real conflict (was producing 2 false-positive
   blocking findings before this fix).
6. Result: `validate_schema.py` blocking = 0 with LBP_V1 bound.

## LBP_V1 safety-logic fixes (from Opus clinical review)

An Opus clinical/spec review of `lbp_v1.0_candidate.yaml` + `evidence_matrix_lbp_v1.md` +
`lbp_engine.py` found real bugs in the candidate's reference safety-computation code —
distinct from and in addition to the provenance issue above. `lbp_logic.py` is a from-
scratch reimplementation, not a port, with these fixes (all against the module's OWN
already-stated rules, not new clinical content — see full review transcript in this
session for the complete evidence trail):

1. **CES silent-CLEAR states.** `lbp_ces_screen` classification used exact-equality
   (`ces == ['UNKNOWN']`), so malformed/edge states — `['UNKNOWN','NONE']`, `[]`, a bare
   string, a non-list — silently returned CLEAR. Rewritten to mirror the already-correct
   `lbp_current_redflag_screen` pattern: anything other than exactly `['NONE']` (or an
   urgent value) requires review.
2. **Safety status never computed when CES was unanswered.** The candidate's `recompute()`
   only called `safety_status()` when both CES fields were present as *keys* in state — an
   unanswered `lbp_ces_screen` produced no `lbp_safety_status` at all, and under this
   project's own value_semantics `!= CLEAR` evaluates False against a MISSING value, so any
   lock built on that comparison fails OPEN exactly when the CES screen hasn't been
   answered. Fixed: `lbp_logic.recompute()` always computes safety_status once inside the
   module; `lbp_logic.recommendations_locked()` is a real, tested gate function.
3. **`onset_bucket` UNKNOWN/missing folded into NO** for inflammatory-eligibility, directly
   contradicting the module's own stated rule ("UNKNOWN remains UNKNOWN"). Fixed to return
   UNKNOWN, not NO.
4. **`major_history_categories` MISSING silently defaulted to "no history"** via `or []`
   even when `major_history_present=YES` (detail not yet answered). Fixed: an incomplete
   safety-relevant answer now requires review.
5. **Trauma screening design gap.** `lbp_trauma_safety` was only asked as a fallback when
   Core's `onset_pattern` was UNKNOWN/unanswered — leaving 3 of 5 `onset_pattern` values
   with no trauma safety check at all (a real fall alongside e.g. `GRADUAL` onset was never
   captured). Fixed: `lbp_v1.0.yaml`'s `show_when` widened to ask it unconditionally within
   the module (question wording/choices unchanged); `lbp_logic.py`'s safety_status checks
   the trauma answer independently of `onset_pattern` rather than one gating the other.

All five fixes are covered by `tests/test_lbp_logic.py`, written from the review's own
failure scenarios (must fail against the old logic, must pass against the new).

## LBP_V1 items NOT decided autonomously (CLINICAL_DECISION_REQUIRED)

See `unresolved_clinical_decisions.md` for full detail on each:

- **Bilateral+neuro escalation threshold** — a provisional (most conservative) rule was
  implemented (BILATERAL leg side + a concrete neuro feature -> REVIEW_REQUIRED, since
  bilateral sciatica is a NICE NG127 CES-suspicion trigger this module's CES screen alone
  doesn't otherwise capture) but the exact threshold needs clinical sign-off.
- **Red-flag coverage gaps** — the review found several NICE/VA-DoD red-flag categories
  (infection exposure, unrelenting night pain outside the chronic branch, an age modifier,
  a medication-based osteoporosis proxy) this module doesn't ask about, plus an unused
  `pregnancy_status` in the exercise contract. No new questions/content were added — that's
  clinical authorship, not a spec/engineering task.
- **NG65 inflammatory criteria-count threshold** — referenced but never defined in the
  spec; not enforced anywhere in code.
- **Evidence citation verification** — the review's citation checks were plausibility-only
  (training knowledge), not live verification against primary sources.
- **Exercise-recommender lock enforcement** — `lbp_logic.recommendations_locked()` exists
  and is tested, but wiring it into an actual exercise-recommender implementation (not yet
  built) is a downstream engineering task.

## What was deliberately NOT touched (v1.4, before clinical sign-off)

- No red-flag questions added or removed; no question wording changed (the one show_when
  widening for `lbp_trauma_safety` doesn't change what's asked, only when).
- No new clinical content, referral criteria, or diagnostic-hypothesis meaning invented to
  fill the coverage gaps the review found — those are flagged for clinician authorship.
- `evidence_matrix_lbp_v1.md` citations left as-is pending independent verification — not
  corrected based on an unverified training-knowledge recollection.

---

# Decision Log Part 3 — LBP_V1 clinical decision closure

Source: `LBP_v1.4_임상결정_마감본.md` (2026-08-24), a clinical decision document that closes
every item Part 2 listed as NOT decided autonomously. This section maps each decision-doc
section to what was implemented; the document itself is the clinical source of truth, not
this codebase's interpretation of it.

1. **Safety-state contract (doc section 1)** — confirmed the CES fail-safe classification
   from the earlier Opus-review fix (any shape other than exactly `['NONE']` requires
   review). Added: `clinician_objective_motor_deficit` (Doctor-View-entered, not asked on
   the patient tablet) — `SEVERE_OR_PROGRESSIVE` forces `URGENT_REVIEW` independent of the
   CES screen. Patient-reported weakness (`lbp_leg_neuro_symptoms.SUBJECTIVE_WEAKNESS`) and
   this objective field are stored and evaluated separately, never conflated.

2. **Bilateral + neuro escalation (doc section 2)** — confirmed BILATERAL leg side + a
   concrete neuro feature (paresthesia/numbness/subjective weakness) -> `REVIEW_REQUIRED`.
   New: bilateral leg **pain alone** (no neuro feature) does NOT auto-escalate — it sets a
   new computed field `lbp_neuro_baseline_required=true` instead, requesting a clinician
   baseline neuro exam without forcing a safety-status change. The rationale is now
   explicitly documented as Samindang's own conservative clinician-review policy
   (`lbp_v1.0.yaml:safety_logic.bilateral_neuro_policy_note`), not attributed to a NICE
   NG127 mandate the review's earlier phrasing risked overclaiming.

3. **Red flags — minimum addition (doc section 3)**:
   - 3-1A (unexplained weight loss): already covered by the existing
     `lbp_current_redflag_screen` choice — confirmed sufficient, no new question.
   - 3-1B (infection/procedure risk): ONE new choice value added to that same existing
     multi_choice screen — `RECENT_SPINAL_PROCEDURE_OR_INJECTION` — rather than a new
     question, per the doc's "1 screen" instruction.
   - 3-2 (age): explicitly NOT asked as a question — read from Core.
     `lbp_fracture_risk_age_modifier` (>=75) and `lbp_malignancy_risk_age_modifier` (>50)
     added as clinician-facing context fields that never by themselves change
     `lbp_safety_status`.
   - 3-3 (night/rest pain): explicitly NOT added as a universal red flag; stays a
     chronic/inflammatory-branch supporting feature only.
   - 3-4 (bisphosphonate): explicitly NOT added as a separate question; existing
     osteoporosis-history + corticosteroid-use context covers it per the decision.

4. **Trauma (doc section 4)** — confirmed the prior fix (unconditional ask, independent of
   `onset_pattern`, YES/UNKNOWN -> review). No further change required.

5. **Inflammatory back pain / NG65 (doc section 5)** — decided: NO formal NG65 criteria
   count is computed (this simplified screen doesn't collect all 9 NG65 criteria 1:1).
   `lbp_inflammatory_eligible` keeps its existing onset<45+duration>3mo/UNKNOWN logic. New:
   `lbp_inflammatory_pattern_consider` (boolean) — eligible==YES AND at least one concrete
   supporting feature -> clinician-facing CONSIDER signal, never a patient-facing diagnosis
   or probability. `hypothesis_model`'s ambiguous "criteria count for clinician review"
   language removed and replaced with this rule.

6. **Pregnancy / treatment safety (doc section 6)** — confirmed the existing Core pregnancy
   gate (patient_sex in [F,OTHER,UNKNOWN], age 10-55) unchanged. New: `treatment_safety_status`
   (CLEAR | REVIEW_REQUIRED) as a dimension SEPARATE from `lbp_safety_status` — pregnancy
   affects what treatment/exercise can be finalized, not whether the LBP presentation needs
   disease-safety review. The questionnaire is never stopped by this; only recommendation
   finalization is gated (see item 9 below).

7. **complex_herbal (doc section 7)** — decided as case-level, not route-level: 2+ herbal
   micro-modules entered, OR a second complaint opens another herbal module, OR
   (`medication_present` AND `major_history_present`). Explicitly does not block LBP_V1.
   The dynamic classification engine is deferred as a non-blocking engineering task (see
   `complex_herbal_dynamic_classification_engine` in `unresolved_design_decisions` —
   untestable until at least 2 herbal micro-modules exist).

8. **Evidence citation corrections (doc section 8)** — the specific miscitation risk (NG127
   bilateral-sciatica framing) was in this codebase's own prior rationale comment, not in
   `evidence_matrix_lbp_v1.md` itself; the comment is corrected (see item 2 above). Suri
   2010's older-adults-with-leg-pain population scope and the NG65-formal-count-not-applied
   note are both now recorded for future `evidence_matrix_lbp_v1.md` revisions. Full
   independent citation verification remains outside what a spec/engineering pass can do.

9. **Recommendation lock (doc section 9)** — `lbp_logic.disease_safety_locked(state)` (was
   `recommendations_locked`, renamed for clarity now that a second lock function exists)
   gates routine exercise/treatment/Suggested-Exam on `lbp_safety_status != CLEAR`. New:
   `lbp_logic.treatment_safety_locked(state)` gates contraindication-sensitive treatment/
   exercise finalization on `treatment_safety_status != CLEAR` without stopping the
   questionnaire. Both fail closed on a missing/uncomputed status — regression-tested.
   `exercise_recommender_contract.lock_when` in `lbp_v1.0.yaml` now lists both conditions.

10. **UI text standards (doc section 10)** — captured as documentation
    (`lbp_v1.0.yaml:doctor_view_ui_labels` / `sigma_note_soap_template`) for whoever builds
    the real UI. No such repo exists in this environment, so no actual UI was built.

11. **Regression checklist (doc section 11, 23 items)** — implemented as
    `tests/test_lbp_logic.py` (computed-field/lock behavior, items 1-18) and
    `tests/test_lbp_yaml_content.py` (spec-content items 10, 13, 19-20). Items 21-22
    (LBP P90<=180s, safety-critical omission=0) are verified by `simulate_paths.py`'s timing
    simulation. Item 23 (existing Core/Tablet/Doctor/MENOPAUSE regression=0) is the full
    v1.3 test suite, unchanged and still passing.

12. **Gate meaning (doc section 12)** — "Clinical decisions CLOSED" is accurate as of this
    implementation pass. "Repo implementation required" and "final regression required"
    against a REAL repo remain true — no such repo exists in this environment. This pass's
    `CORE SPEC STATUS: PASS` (when the quality gate is clean) means the spec + simulation
    gate, matching the decision doc's own section 0 framing — not full production readiness.
