import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from spec_lib import eval_condition, eval_tree, known_producers, merge_module_into_survey, multi_toggle_item_domains, question_domain, question_output_fields


def test_missing_field_no_matches_every_operator_except_not_exists():
    # field 'x' is genuinely absent from the profile (not even null)
    assert not eval_condition({"field": "x", "op": "eq", "value": "A"}, {})
    assert not eval_condition({"field": "x", "op": "neq", "value": "A"}, {})  # the v1.2-specific fix
    assert not eval_condition({"field": "x", "op": "in", "value": ["A", "B"]}, {})
    assert not eval_condition({"field": "x", "op": "between", "value": [0, 10]}, {})
    assert not eval_condition({"field": "x", "op": "regex", "value": "^A"}, {})
    assert not eval_condition({"field": "x", "op": "exists"}, {})
    assert eval_condition({"field": "x", "op": "not_exists"}, {})


def test_null_is_distinct_from_missing():
    profile = {"x": None}  # key present, value explicitly null
    assert eval_condition({"field": "x", "op": "exists"}, profile)
    assert not eval_condition({"field": "x", "op": "not_exists"}, profile)
    assert eval_condition({"field": "x", "op": "eq", "value": None}, profile)
    assert not eval_condition({"field": "x", "op": "eq", "value": "A"}, profile)
    assert eval_condition({"field": "x", "op": "neq", "value": "A"}, profile)  # null != "A"


def test_ordinary_values_unaffected():
    assert eval_condition({"field": "x", "op": "eq", "value": "A"}, {"x": "A"})
    assert eval_condition({"field": "x", "op": "in", "value": ["A", "B"]}, {"x": "B"})
    assert eval_condition({"field": "age", "op": "between", "value": [10, 55]}, {"age": 55})
    assert not eval_condition({"field": "age", "op": "between", "value": [10, 55]}, {"age": 56})


def test_eval_tree_missing_field_inside_all_any():
    tree = {"all": [{"field": "a", "op": "eq", "value": True}, {"field": "b", "op": "eq", "value": True}]}
    assert not eval_tree(tree, {"a": True})  # b missing -> all() fails
    assert eval_tree(tree, {"a": True, "b": True})
    assert eval_tree(None, {})  # no condition = always shown


def test_question_output_fields_and_domain_unchanged_shapes():
    assert question_output_fields({"output_field": "x"}) == {"x"}
    assert question_output_fields({"outputs": {"a": "field_a"}}) == {"field_a"}
    assert question_domain({"choices": [{"value": "A"}, {"value": "B"}]}) == {"A", "B"}
    assert question_domain({"type": "short_text"}) is None


def test_known_producers_collects_all_four_shapes():
    survey = {
        "questions": [{"id": "q1", "output_field": "a"}],
        "runtime_context_contract": {
            "external_fields": {"patient_age": {}},
            "engine_state": {"primary_micro_module_complete": {}},
        },
    }
    rules = {"module_contracts": {"SLEEP_V1": {"outputs": ["menopause_screen"]}}}
    producers = known_producers(survey, rules)
    assert producers["a"] == {"question:q1"}
    assert "runtime_context_contract.external_fields" in producers["patient_age"]
    assert "runtime_context_contract.engine_state" in producers["primary_micro_module_complete"]
    assert "module_contracts:SLEEP_V1" in producers["menopause_screen"]


def test_multi_toggle_item_domains_per_item_not_unioned():
    q = {"type": "multi_toggle_group", "items": [
        {"id": "medication_present", "choices": [{"value": "NO"}, {"value": "YES"}]},
        {"id": "severe_allergy_history", "choices": [{"value": "NO"}, {"value": "YES"}, {"value": "UNKNOWN"}]},
    ]}
    domains = multi_toggle_item_domains(q)
    assert domains["medication_present"] == {"NO", "YES"}
    assert domains["severe_allergy_history"] == {"NO", "YES", "UNKNOWN"}
    # question_domain still unions everything for the "does this vocabulary
    # ever appear" style checks (e.g. UNKNOWN double-serialization).
    assert question_domain(q) == {"NO", "YES", "UNKNOWN"}


def test_merge_module_into_survey_folds_entry_when_into_each_question():
    survey = {"questions": [{"id": "core_q", "order": 1, "output_field": "domain"}]}
    module = {
        "entry_when": {"all": [{"field": "domain", "op": "eq", "value": "MSK"}]},
        "computed_fields": {"module_status": {}},
        "questions": [
            {"id": "m_q1", "order": 10, "output_field": "a"},  # no own show_when
            {"id": "m_q2", "order": 20, "output_field": "b",
             "show_when": {"all": [{"field": "a", "op": "eq", "value": "X"}]}},
        ],
    }
    merged = merge_module_into_survey(survey, module)
    assert len(merged["questions"]) == 3
    q1 = next(q for q in merged["questions"] if q["id"] == "m_q1")
    assert q1["show_when"] == module["entry_when"]  # entry_when alone when no own show_when

    q2 = next(q for q in merged["questions"] if q["id"] == "m_q2")
    assert q2["show_when"] == {"all": [module["entry_when"], module["questions"][1]["show_when"]]}
    # and it must still evaluate correctly (semantics matter more than shape)
    assert eval_tree(q2["show_when"], {"domain": "MSK", "a": "X"})
    assert not eval_tree(q2["show_when"], {"domain": "SLEEP", "a": "X"})
    assert not eval_tree(q2["show_when"], {"domain": "MSK", "a": "Y"})

    assert merged["computed_fields"] == {"module_status": {}}
    # original survey/module dicts must not be mutated
    assert "show_when" not in module["questions"][0]


def test_known_producers_flags_dual_producer():
    survey = {"questions": [], "runtime_context_contract": {"engine_state": {"x": {}}}}
    rules = {"module_contracts": {"M1": {"outputs": ["x"]}, "M2": {"outputs": ["x"]}}}
    producers = known_producers(survey, rules)
    assert len(producers["x"]) == 3
