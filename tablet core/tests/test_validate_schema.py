import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import validate_schema as vs

ROOT = Path(__file__).parent.parent


def by_check(findings, check_name):
    return [f for f in findings if f["check"] == check_name]


# --- unit tests on small inline fixtures -----------------------------------

def test_primary_route_module_leakage_detected():
    survey = {"questions": [{"id": "q1", "order": 1, "output_field": "primary_complaint_domain"}]}
    rules = {
        "module_contracts": {"M1": {"outputs": ["module_only_field"]}},
        "primary_routes": [{"id": "r1", "priority": 100,
                             "when": {"all": [{"field": "module_only_field", "op": "eq", "value": "X"}]}}],
    }
    out = vs.check_primary_route_module_leakage(survey, rules)
    assert by_check(out, "primary_route_reads_module_output")


def test_primary_route_using_core_field_not_flagged():
    survey = {"questions": [{"id": "q1", "order": 1, "output_field": "primary_complaint_domain"}]}
    rules = {
        "module_contracts": {"M1": {"outputs": ["module_only_field"]}},
        "primary_routes": [{"id": "r1", "priority": 100,
                             "when": {"all": [{"field": "primary_complaint_domain", "op": "eq", "value": "MSK"}]}}],
    }
    assert vs.check_primary_route_module_leakage(survey, rules) == []


def test_module_extension_graph_catches_wrong_type():
    rules = {
        "module_contracts": {
            "PRIMARY_1": {"type": "primary_micro_module", "outputs": ["flag"]},
            "EXT_1": {"type": "extension_module", "outputs": []},
        },
        "module_extensions": [
            {"id": "e1", "after_module": "EXT_1", "attach_module": "PRIMARY_1",
             "when": {"all": [{"field": "flag", "op": "eq", "value": True}]}},
        ],
    }
    out = vs.check_module_extension_graph(rules)
    assert by_check(out, "extension_after_module_wrong_type")
    assert by_check(out, "extension_attach_module_wrong_type")


def test_module_extension_references_undeclared_field():
    rules = {
        "module_contracts": {
            "PRIMARY_1": {"type": "primary_micro_module", "outputs": []},
            "EXT_1": {"type": "extension_module", "outputs": []},
        },
        "module_extensions": [
            {"id": "e1", "after_module": "PRIMARY_1", "attach_module": "EXT_1",
             "when": {"all": [{"field": "never_declared", "op": "eq", "value": True}]}},
        ],
    }
    out = vs.check_module_extension_graph(rules)
    assert by_check(out, "extension_references_field_module_does_not_produce")


def test_second_complaint_state_machine_flags_undefined_increment_event():
    survey = {"runtime_context_contract": {"engine_state": {"cnt": {"max": 1}}}}
    rules = {
        "module_contracts": {"REAL_MODULE": {}},
        "second_complaint_policy": {
            "runtime_counter": "cnt",
            "max_additional_complaints_in_tablet": 1,
            "counter_increment_when": "a module nobody declared is opened",
        },
    }
    out = vs.check_second_complaint_state_machine(survey, rules)
    assert by_check(out, "second_complaint_increment_event_undefined")


def test_second_complaint_state_machine_passes_when_event_names_a_real_module():
    survey = {"runtime_context_contract": {"engine_state": {"cnt": {"max": 1}}}}
    rules = {
        "module_contracts": {"SECOND_COMPLAINT_MODULE": {}},
        "second_complaint_policy": {
            "runtime_counter": "cnt",
            "max_additional_complaints_in_tablet": 1,
            "counter_increment_when": "SECOND_COMPLAINT_MODULE is opened",
        },
    }
    out = vs.check_second_complaint_state_machine(survey, rules)
    assert by_check(out, "second_complaint_increment_event_undefined") == []


def test_selector_semantics_undeclared_is_blocking():
    survey = {"questions": [{"id": "q1", "type": "single_choice_dynamic",
                              "selector_fields": ["a"], "choice_sets": {}}]}
    out = vs.check_selector_semantics_resolvable(survey)
    assert by_check(out, "selector_semantics_undeclared")


def test_selector_semantics_resolvable_with_declared_definition():
    survey = {
        "selector_semantics": {"first_matching_field": "first field whose value is a choice_sets key"},
        "questions": [
            {"id": "core_primary_domain", "order": 1, "output_field": "primary_complaint_domain",
             "choices": [{"value": "SLEEP"}]},
            {"id": "core_msk_region", "order": 2, "output_field": "primary_complaint_detail", "choices": []},
            {"id": "core_nonmsk_detail", "order": 3, "output_field": "primary_complaint_detail",
             "choice_sets": {"SLEEP": [{"value": "SLEEP_ONSET"}]}},
            {"id": "core_target_function", "order": 4, "type": "single_choice_dynamic",
             "selector_fields": ["primary_complaint_detail", "primary_complaint_domain"],
             "selector_precedence": "first_matching_field", "fallback_choice_set": "DEFAULT",
             "choice_sets": {"SLEEP": [{"value": "FALL_ASLEEP"}], "DEFAULT": [{"value": "DAILY_ACTIVITY"}]}},
        ],
    }
    out = vs.check_selector_semantics_resolvable(survey)
    assert out == []  # canonical reading resolves SLEEP for every combo, no ambiguity left


def test_resolve_selector_key_picks_first_field_that_is_a_real_key():
    q = {"selector_fields": ["primary_complaint_detail", "primary_complaint_domain"],
         "fallback_choice_set": "DEFAULT",
         "choice_sets": {"SLEEP": [{"value": "FALL_ASLEEP"}], "DEFAULT": [{"value": "DAILY_ACTIVITY"}]}}
    # detail=SLEEP_ONSET is not a choice_sets key, domain=SLEEP is -> SLEEP wins
    assert vs.resolve_selector_key(q, {"primary_complaint_detail": "SLEEP_ONSET", "primary_complaint_domain": "SLEEP"}) == "SLEEP"
    assert vs.resolve_selector_key(q, {"primary_complaint_detail": "LBP", "primary_complaint_domain": "MSK"}) == "DEFAULT"


def test_extension_ordering_guard_flags_missing_flag():
    survey = {"runtime_context_contract": {"engine_state": {"other_flag": {"type": "boolean"}}},
              "questions": [{"id": "core_second_complaint", "show_when":
                             {"all": [{"field": "primary_micro_module_complete", "op": "eq", "value": True}]}}]}
    rules = {"module_extensions": [{"id": "ext1", "sets_pending_extension": True}]}
    out = vs.check_extension_ordering_guard(survey, rules)
    assert by_check(out, "extension_ordering_not_guarded")


def test_extension_ordering_guard_passes_when_wired_up():
    survey = {"runtime_context_contract": {"engine_state": {"pending_extension_present": {"type": "boolean"}}},
              "questions": [{"id": "core_second_complaint", "show_when":
                             {"all": [{"field": "pending_extension_present", "op": "eq", "value": False}]}}]}
    rules = {"module_extensions": [{"id": "ext1", "sets_pending_extension": True}]}
    out = vs.check_extension_ordering_guard(survey, rules)
    assert by_check(out, "extension_ordering_not_guarded") == []


def test_module_contract_output_not_producible_detected():
    rules = {"module_contracts": {"LBP_V1": {"outputs": ["lbp_safety_status", "ghost_field"]}}}
    modules = {"LBP_V1": {"computed_fields": {"lbp_safety_status": {}}, "questions": []}}
    out = vs.check_module_contract_outputs_producible(rules, modules)
    findings = by_check(out, "module_contract_output_not_producible")
    assert findings and "ghost_field" in findings[0]["fields"]


def test_module_contract_output_producible_from_question_or_computed_field():
    rules = {"module_contracts": {"LBP_V1": {"outputs": ["lbp_safety_status", "leg_symptom_present"]}}}
    modules = {"LBP_V1": {"computed_fields": {"lbp_safety_status": {}},
                           "questions": [{"id": "q1", "output_field": "leg_symptom_present"}]}}
    assert vs.check_module_contract_outputs_producible(rules, modules) == []


def test_module_entry_when_route_mismatch_detected():
    rules = {"primary_routes": [{"id": "route_lbp", "priority": 100, "micro_module": "LBP_V1",
                                  "when": {"all": [{"field": "primary_complaint_domain", "op": "eq", "value": "MSK"},
                                                    {"field": "primary_complaint_detail", "op": "eq", "value": "LBP"}]}}]}
    modules = {"LBP_V1": {"entry_when": {"all": [{"field": "primary_complaint_domain", "op": "eq", "value": "MSK"}]}}}
    out = vs.check_module_entry_when_matches_route(rules, modules)
    assert by_check(out, "module_entry_when_route_mismatch")


def test_module_entry_when_matches_route_passes_when_identical():
    when = {"all": [{"field": "primary_complaint_domain", "op": "eq", "value": "MSK"},
                     {"field": "primary_complaint_detail", "op": "eq", "value": "LBP"}]}
    rules = {"primary_routes": [{"id": "route_lbp", "priority": 100, "micro_module": "LBP_V1", "when": when}]}
    modules = {"LBP_V1": {"entry_when": when}}
    assert vs.check_module_entry_when_matches_route(rules, modules) == []


# --- regression tests against the real (repaired) v1.3 bundle --------------

def test_real_bundle_resolves_v1_2_findings():
    """Regression guard: every blocking finding from the v1.2 re-validation
    (N-1, N-2, N-4a, and the original v1.1 F-series) must stay closed."""
    result = vs.run(ROOT / "survey_core_v1.4.yaml", ROOT / "branch_rules_v1.4.yaml")
    checks_present = {f["check"] for f in result["findings"]}
    assert "unknown_referenced_field" not in checks_present
    assert "duplicate_question_id" not in checks_present
    assert "branch_cycle" not in checks_present
    assert "primary_route_reads_module_output" not in checks_present
    assert "selector_unresolvable_for_profile" not in checks_present
    assert "selector_semantics_undeclared" not in checks_present
    assert "second_complaint_increment_event_undefined" not in checks_present
    assert "undefined_budget_term" not in checks_present
    assert "extension_ordering_not_guarded" not in checks_present
    assert "completed_core_without_route" not in checks_present
    assert "korean_literal_used_as_match_value" not in checks_present
    assert "unknown_category_double_serialization" not in checks_present
    assert result["quality_gate_pass"] is True
    assert result["quality_gate"]["core_p50_within_target"] is True


def test_all_clinical_decisions_closed_by_signoff_doc():
    """LBP_v1.4_임상결정_마감본.md closed every previously-open clinical
    decision — clinical_decision_required must now be empty, and each
    closed item must be traceable in resolved_clinical_decisions instead
    of silently disappearing."""
    result = vs.run(ROOT / "survey_core_v1.4.yaml", ROOT / "branch_rules_v1.4.yaml")
    assert result["clinical_decision_required"] == []
    resolved_ids = {item["id"] for item in result["resolved_clinical_decisions"]}
    assert "pregnancy_gate_patient_sex_scope" in resolved_ids
    assert "complex_herbal_route_classification" in resolved_ids
    assert "lbp_bilateral_neuro_escalation_threshold" in resolved_ids
    assert "lbp_red_flag_coverage_gaps" in resolved_ids
    assert "lbp_inflammatory_criteria_count_threshold" in resolved_ids
    assert "lbp_evidence_citation_verification" in resolved_ids
    assert "lbp_exercise_recommender_lock_enforcement" in resolved_ids
    # complex_herbal is decided-but-deferred (no herbal modules exist yet) —
    # that gap must now live in unresolved_design_decisions (engineering),
    # not clinical_decision_required.
    design_ids = {item["id"] for item in result["unresolved_design_decisions"]}
    assert "complex_herbal_dynamic_classification_engine" in design_ids
    assert "lbp_recommendation_lock_ui_wiring" in design_ids


def test_medication_present_yes_no_survive_yaml_as_strings_not_booleans():
    """Regression guard for a real bug hit during the repair: unquoted YES/NO
    in YAML 1.1 parse as Python booleans, silently breaking every eq
    comparison against them. medication_categories' show_when must actually
    be reachable."""
    result = vs.run(ROOT / "survey_core_v1.4.yaml", ROOT / "branch_rules_v1.4.yaml")
    unreachable_ids = {f["id"] for f in result["findings"] if f["check"] == "unreachable_required_question"}
    assert "core_medication_categories" not in unreachable_ids
    assert "core_major_history_categories" not in unreachable_ids


# --- LBP_V1 module integration regression tests -----------------------------

def test_real_bundle_with_lbp_module_has_zero_blocking():
    """The actual LBP_V1 integration: core + branch_rules + the real
    lbp_v1.0.yaml question set, bound via DEFAULT_MODULES."""
    result = vs.run(ROOT / "survey_core_v1.4.yaml", ROOT / "branch_rules_v1.4.yaml")
    assert result["quality_gate_pass"] is True
    assert result["quality_gate"]["module_contract_inconsistency"] == 0


def test_lbp_safety_questions_are_reachable_and_protected():
    result = vs.run(ROOT / "survey_core_v1.4.yaml", ROOT / "branch_rules_v1.4.yaml")
    unreachable_ids = {f["id"] for f in result["findings"] if f["check"] == "unreachable_required_question"}
    assert "lbp_ces_screen" not in unreachable_ids
    assert "lbp_current_redflag_screen" not in unreachable_ids
    protected_conflicts = by_check(result["findings"], "deferrable_but_protected")
    lbp_conflict_ids = {f["id"] for f in protected_conflicts if f["id"].startswith("lbp_")}
    assert lbp_conflict_ids == set()


def test_lbp_module_has_no_duplicate_ids_with_core():
    result = vs.run(ROOT / "survey_core_v1.4.yaml", ROOT / "branch_rules_v1.4.yaml")
    assert result["quality_gate"]["duplicate_ids"] == 0


def test_running_without_module_bound_still_works_core_only():
    """module_paths=[] must behave like pure core-only v1.3 validation —
    the LBP integration must not be load-bearing for basic operation."""
    result = vs.run(ROOT / "survey_core_v1.4.yaml", ROOT / "branch_rules_v1.4.yaml", module_paths=[])
    checks_present = {f["check"] for f in result["findings"]}
    assert "duplicate_question_id" not in checks_present
    assert "unknown_referenced_field" not in checks_present
