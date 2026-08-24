"""Content-level regression tests for LBP_v1.4_임상결정_마감본.md section 11
items that aren't pure computed-field logic: no formal NG65 count language,
no single-test diagnosis confirmation, the new red-flag choice value, and
the treatment-safety/disease-safety separation staying documented as
distinct."""
import sys
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).parent.parent))

ROOT = Path(__file__).parent.parent
LBP = yaml.safe_load((ROOT / "lbp_v1.0.yaml").read_text(encoding="utf-8"))


def _all_text() -> str:
    return yaml.safe_dump(LBP, allow_unicode=True)


# --- item 13: formal NG65 criteria-count threshold removed ------------------

def test_no_ambiguous_criteria_count_threshold_language():
    text = _all_text()
    assert "criteria count" not in text.lower() or "no formal ng65" in text.lower() or "does not" in text.lower()
    inflammatory_rule = next(r for r in LBP["hypothesis_model"]["rules"] if r["hypothesis"] == "INFLAMMATORY_BACK_PAIN_PATTERN")
    assert "criteria count for clinician review" not in inflammatory_rule["state_rule"]


# --- item 10: new infection/procedure choice present -------------------------

def test_recent_spinal_procedure_choice_added():
    redflag_q = next(q for q in LBP["questions"] if q["id"] == "lbp_current_redflag_screen")
    values = {c["value"] for c in redflag_q["choices"]}
    assert "RECENT_SPINAL_PROCEDURE_OR_INJECTION" in values


# --- item 19/20: no single-test/single-red-flag diagnosis confirmation ------

def test_hypothesis_model_never_confirms_from_single_finding():
    for rule in LBP["hypothesis_model"]["rules"]:
        text = rule["state_rule"].lower()
        # every rule whose hypothesis could plausibly be over-claimed from
        # one finding must not contain confirmation language
        assert "diagnosis confirmed" not in text
        assert "confirms the diagnosis" not in text


def test_no_patient_facing_diagnosis_language_in_design_principles():
    principles = " ".join(LBP["metadata"]["design_principles"])
    assert "진단을 확정하지 않는다" in principles


# --- bilateral policy correctly attributed (not overclaimed as NICE mandate) -

def test_bilateral_policy_not_misattributed_to_nice_mandate():
    note = LBP["safety_logic"]["bilateral_neuro_policy_note"]
    assert "own conservative" in note or "Samindang" in note
    # the note may quote the disclaimed phrasing to explicitly reject it —
    # what matters is that it's framed as NOT the policy's justification
    assert "NOT presented as" in note


# --- disease safety / treatment safety kept as genuinely separate concepts --

def test_disease_and_treatment_safety_are_distinct_computed_fields():
    computed = set(LBP["computed_fields"].keys())
    assert "lbp_safety_status" in computed
    assert "treatment_safety_status" in computed
    assert LBP["computed_fields"]["lbp_safety_status"]["values"] != LBP["computed_fields"]["treatment_safety_status"]["values"]


def test_exercise_lock_gates_on_both_safety_dimensions():
    lock_when = LBP["exercise_recommender_contract"]["lock_when"]
    joined = " ".join(lock_when)
    assert "lbp_safety_status" in joined
    assert "treatment_safety_status" in joined
