import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import simulate_paths as sp
from spec_lib import load_spec

ROOT = Path(__file__).parent.parent


def test_percentile_matches_known_values():
    assert sp.percentile([1, 2, 3, 4, 5], 0.5) == 3


def test_walk_core_respects_show_when():
    questions = [
        {"id": "q1", "order": 1, "estimated_seconds": 5, "output_field": "x"},
        {"id": "q2", "order": 2, "estimated_seconds": 3, "output_field": "y",
         "show_when": {"all": [{"field": "x", "op": "eq", "value": "A"}]}},
    ]
    assert sp.walk_core(questions, {"x": "A"}) == {"shown": ["q1", "q2"], "total_seconds": 8}
    assert sp.walk_core(questions, {"x": "B"}) == {"shown": ["q1"], "total_seconds": 5}


def test_match_primary_route_picks_highest_priority():
    rules = {"primary_routes": [
        {"id": "low", "priority": 10, "when": {"all": [{"field": "d", "op": "eq", "value": "MSK"}]}},
        {"id": "high", "priority": 100, "when": {"all": [{"field": "d", "op": "eq", "value": "MSK"}]}},
    ]}
    assert sp.match_primary_route(rules, {"d": "MSK"}) == "high"
    assert sp.match_primary_route(rules, {"d": "OTHER"}) is None


def test_resolve_target_function_uses_reading_b():
    q = {"selector_fields": ["primary_complaint_detail", "primary_complaint_domain"],
         "fallback_choice_set": "DEFAULT",
         "choice_sets": {"SLEEP": [{"value": "FALL_ASLEEP"}], "DEFAULT": [{"value": "DAILY_ACTIVITY"}]}}
    # detail=SLEEP_ONSET isn't a choice_sets key, domain=SLEEP is -> reading B picks SLEEP
    assert sp.resolve_target_function(q, {"primary_complaint_detail": "SLEEP_ONSET", "primary_complaint_domain": "SLEEP"}) == "SLEEP"
    assert sp.resolve_target_function(q, {"primary_complaint_detail": "LBP", "primary_complaint_domain": "MSK"}) == "DEFAULT"


def test_second_complaint_never_shown_in_real_bundle_timing_simulation():
    """Regression guard: primary_micro_module_complete has no reachable
    producer in a core-only walk, so core_second_complaint must never
    appear — exactly the same invariant as v1.1's F1 fix verification."""
    survey, rules = load_spec(ROOT / "survey_core_v1.4.yaml", ROOT / "branch_rules_v1.4.yaml")
    orig_n = sp.N_PROFILES
    sp.N_PROFILES = 200
    try:
        result = sp.run_timing_simulation(survey, rules)
    finally:
        sp.N_PROFILES = orig_n
    assert "core_second_complaint" in result["questions_never_shown"]
    assert "core_second_complaint_domain" in result["questions_never_shown"]
    assert result["missing_safety_critical_question_instances"] == 0


def test_structural_coverage_reaches_every_primary_route():
    survey, rules = load_spec(ROOT / "survey_core_v1.4.yaml", ROOT / "branch_rules_v1.4.yaml")
    result = sp.run_structural_coverage(survey, rules)
    assert result["primary_routes_never_matched"] == []


def test_structural_coverage_reaches_medication_and_pregnancy_questions():
    """Regression guard for the YAML-boolean-coercion bug (unquoted YES/NO
    parsing as Python True/False and silently breaking every eq comparison
    against them) and for the widened pregnancy gate (OTHER/UNKNOWN sex)."""
    survey, rules = load_spec(ROOT / "survey_core_v1.4.yaml", ROOT / "branch_rules_v1.4.yaml")
    result = sp.run_structural_coverage(survey, rules)
    never_shown = set(result["questions_never_shown_in_any_combination"])
    assert "core_medication_categories" not in never_shown
    assert "core_major_history_categories" not in never_shown
    assert "core_pregnancy_status" not in never_shown


def test_timing_simulation_reaches_medication_questions():
    survey, rules = load_spec(ROOT / "survey_core_v1.4.yaml", ROOT / "branch_rules_v1.4.yaml")
    orig_n = sp.N_PROFILES
    sp.N_PROFILES = 500
    try:
        result = sp.run_timing_simulation(survey, rules)
    finally:
        sp.N_PROFILES = orig_n
    assert "core_medication_categories" not in result["questions_never_shown"]
