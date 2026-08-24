# Samindang Tablet Core v1.4 — Validation Report (LBP_V1 integrated)

Output of validate_schema.py + simulate_paths.py against v1.4 (v1.3 + LBP_V1's real question set). See decision_log.md for what changed and why, and unresolved_clinical_decisions.md for anything requiring clinical sign-off.

## Schema validation findings

- **[ambiguous] timing_class_with_no_route** — fatigue_policy.targets declares target(s) for ['complex_herbal'], but no primary_routes entry is classified that way. For 'complex_herbal' specifically this is a CLOSED clinical decision (LBP_v1.4_임상결정_마감본.md section 7: case-level, not route-level — 2+ herbal modules, or second complaint opens another herbal module, or medication_present AND major_history_present) whose dynamic engine is deferred as an engineering task (see complex_herbal_dynamic_classification_engine in unresolved_design_decisions) — no herbal micro-modules exist yet to test a dynamic classifier against

Counts: {'blocking': 0, 'ambiguous': 1, 'minor': 0}

## Quality gate

- duplicate_ids: 0
- unknown_referenced_fields: 0
- branch_cycles: 0
- ambiguous_highest_priority_route: 0
- unavailable_field_reference: 0
- dynamic_selector_ambiguity: 0
- serialization_inconsistency: 0
- protected_question_suppression: 0
- undefined_budget_terms: 0
- state_machine_failures: 0
- extension_ordering_failures: 0
- completed_core_without_route: 0
- incomplete_core_without_guard: 0
- module_contract_inconsistency: 0
- core_p50_within_target: True
- core_p90_within_target: True
- safety_critical_omission: 0

**Gate to UI work: PASS**

## Mode A — structural coverage (not prevalence)

21120 stratified profile combinations enumerated.

### Primary routes never matched
none

### Questions never shown in any combination
['core_second_complaint', 'core_second_complaint_domain']

## Mode B — illustrative timing (seed 1958, n=5000)

- prior: illustrative uniform prior, NOT clinic prevalence data (branch_rules_v1.4.yaml:simulation_policy.timing_simulation.prior_source)
- core_seconds P50 / P90: 58.0s / 77.0s (targets: 60s / 90s) — within target: True / True
- core_question_count P50 / P90: 9.0 / 11.0
- simple_msk (route_lbp) >180s total-path overflow: **0/60 (0.00%)** — computable now that LBP_V1 has a real question set
- simple_herbal (240s) / complex_herbal (300s) total-path overflow: **not_computable** (no micro-module question set bound for any herbal route yet)

### Route distribution (illustrative)

- `route_skin`: n=525, total_seconds P50/P90=58.0/77.0 (not_computable: micro-module question set absent from this bundle)
- `route_sleep`: n=513, total_seconds P50/P90=53.0/70.0 (not_computable: micro-module question set absent from this bundle)
- `route_resp_ent`: n=513, total_seconds P50/P90=58.0/77.0 (not_computable: micro-module question set absent from this bundle)
- `route_other`: n=508, total_seconds P50/P90=65.0/82.0 (not_computable: micro-module question set absent from this bundle)
- `route_fatigue`: n=502, total_seconds P50/P90=58.0/77.0 (not_computable: micro-module question set absent from this bundle)
- `route_head_dizzy`: n=501, total_seconds P50/P90=58.0/77.0 (not_computable: micro-module question set absent from this bundle)
- `route_urinary`: n=474, total_seconds P50/P90=58.0/77.0 (not_computable: micro-module question set absent from this bundle)
- `route_digestion`: n=466, total_seconds P50/P90=56.0/77.0 (not_computable: micro-module question set absent from this bundle)
- `route_womens_other`: n=403, total_seconds P50/P90=58.0/77.0 (not_computable: micro-module question set absent from this bundle)
- `route_other_msk`: n=160, total_seconds P50/P90=57.0/74.2 (not_computable: micro-module question set absent from this bundle)
- `route_menopause`: n=114, total_seconds P50/P90=53.0/70.0 (not_computable: micro-module question set absent from this bundle)
- `route_shoulder`: n=61, total_seconds P50/P90=55.0/74.0 (not_computable: micro-module question set absent from this bundle)
- `route_lbp`: n=60, total_seconds P50/P90=112.0/133.1 (computable (module question set present))
- `route_neck`: n=60, total_seconds P50/P90=58.5/74.0 (not_computable: micro-module question set absent from this bundle)
- `route_elbow`: n=48, total_seconds P50/P90=60.0/74.0 (not_computable: micro-module question set absent from this bundle)
- `route_wrist_hand`: n=46, total_seconds P50/P90=62.0/74.0 (not_computable: micro-module question set absent from this bundle)
- `route_knee`: n=46, total_seconds P50/P90=57.0/76.0 (not_computable: micro-module question set absent from this bundle)

### Questions never shown across all 5,000 profiles

['core_second_complaint', 'core_second_complaint_domain']

### Missing critical-safety-question instances: 0 (target 0)

## Assumptions (mode B)

- primary_complaint_domain and patient_sex sampled uniformly — labeled illustrative per simulation_policy.timing_simulation.prior_source, not clinic prevalence.
- medication_present='YES' w.p. 0.3, major_history_present='YES' w.p. 0.2, severe_allergy_history 85/10/5 — illustrative.
- core_target_function selector resolved via the canonical first_matching_field rule declared in survey_core_v1.4.yaml:selector_semantics (N-1 fix).
- estimated_seconds is deterministic per question (no response-time noise model).
- LBP module answers use illustrative priors (see sample_lbp_answer) — NOT clinic prevalence, and NOT the same thing as the module's own safety-state coverage (see tests/test_lbp_logic.py for that).
- route_lbp profiles now get real end-to-end timing (core + LBP module + second-complaint prompt, with primary_micro_module_complete/pending_extension_present set true after the module completes) — the first route where total_path_timing is computable rather than not_computable.
- core_second_complaint / core_second_complaint_domain are shown only for route_lbp profiles (the only route with a bound module that can complete and set primary_micro_module_complete=true); every other route still correctly shows them as never-reached, per decision_log.md.

## Unresolved technical design decisions (non-blocking)

- **null_category_no_producer**: value_semantics.null is fully specified but no question or engine_state field ever actually produces an explicit null. Harmless (missing is the only absence state reachable today) but untestable until something produces null.
  - *Handled as:* Not simulated; every profile only ever has missing or concrete values.
- **micro_module_question_sets_absent**: Per branch_rules_v1.4.yaml:simulation_policy.total_path_timing, this remains not_computable until real module question sets exist — expected, not a defect. LBP_V1's route (route_lbp/simple_msk) is now the exception — computable.
  - *Handled as:* simulation_summary_v1.4.json reports simple_herbal/complex_herbal total_*_p90 overflow as 'not_computable' (no herbal module question sets exist yet); simple_msk is computable.
- **complex_herbal_dynamic_classification_engine**: LBP_v1.4_임상결정_마감본.md section 7 decided complex_herbal is case-level (2+ herbal modules entered, OR second complaint opens another herbal module, OR medication_present AND major_history_present) — a runtime/dynamic condition, not a static per-route property. This is now a closed clinical decision (see RESOLVED_CLINICAL_DECISIONS), but implementing the dynamic classification engine is deferred: two of the three conditions require multiple herbal micro-modules to exist, and none do yet.
  - *Handled as:* Not implemented. When herbal modules exist, the engine must classify timing_class at runtime per the decided rule rather than reading a static per-route value.
- **lbp_recommendation_lock_ui_wiring**: lbp_logic.disease_safety_locked() and treatment_safety_locked() are fully specified (LBP_v1.4_임상결정_마감본.md section 9) and tested, but nothing in any real UI/exercise-recommender calls them yet — no such repo exists in this environment (claude_code_task_lbp_v1.md's React/TypeScript integration scope is out of scope for this spec/simulation pass).
  - *Handled as:* Handoff item for whoever builds the real repo integration — see final_validation_report.md's next-steps.

## Clinical decisions required (see unresolved_clinical_decisions.md)
