"""Regression tests for LBP_v1.4_임상결정_마감본.md (the clinical decision
document that closes every CLINICAL_DECISION_REQUIRED item from the Opus
clinical review). Test names below map to that document's section 11
regression checklist (23 items) — comments cite the item number.

Also retains the original Opus-review regression tests (fix #1-4) since
those bugs must stay fixed regardless of the new clinical-decision layer
built on top of them.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from lbp_logic import (
    compute_fracture_risk_age_modifier,
    compute_inflammatory_eligible,
    compute_inflammatory_pattern_consider,
    compute_malignancy_risk_age_modifier,
    compute_neuro_baseline_required,
    compute_treatment_safety_status,
    disease_safety_locked,
    safety_status,
    treatment_safety_locked,
)

BASE_CLEAR = {"lbp_ces_screen": ["NONE"], "lbp_current_redflag_screen": ["NONE"],
              "lbp_trauma_safety": "NO", "onset_pattern": "GRADUAL",
              "major_history_present": "NO", "lbp_leg_side": "NONE",
              "lbp_leg_neuro_symptoms": ["NONE"]}


def clear_state(**overrides) -> dict:
    return {**BASE_CLEAR, **overrides}


# --- 1. CES positive -> URGENT_REVIEW ---------------------------------------

def test_item1_ces_positive_is_urgent_review():
    assert safety_status(clear_state(lbp_ces_screen=["SADDLE_SENSORY_CHANGE"])) == "URGENT_REVIEW"


# --- 2/3/4. CES UNKNOWN/missing/malformed never CLEAR -----------------------

def test_item2_ces_unknown_never_clear():
    assert safety_status(clear_state(lbp_ces_screen=["UNKNOWN"])) != "CLEAR"


def test_item3_ces_missing_never_clear():
    state = clear_state()
    del state["lbp_ces_screen"]
    assert safety_status(state) != "CLEAR"


def test_item4_ces_malformed_states_never_clear():
    for bad in ([], ["NONE", "UNKNOWN"], ["UNKNOWN", "NONE"], ["NONE", "URINARY_RETENTION"], "UNKNOWN", None):
        assert safety_status(clear_state(lbp_ces_screen=bad)) != "CLEAR", f"failed for {bad!r}"
    # a bare urgent string must still be caught as urgent, not merely non-clear
    assert safety_status(clear_state(lbp_ces_screen="URINARY_RETENTION")) == "URGENT_REVIEW"


# --- 5/6. bilateral + neuro vs bilateral alone --------------------------------

def test_item5_bilateral_with_concrete_neuro_requires_review():
    state = clear_state(lbp_leg_side="BILATERAL", lbp_leg_neuro_symptoms=["NUMBNESS"])
    assert safety_status(state) == "REVIEW_REQUIRED"


def test_item6_bilateral_pain_alone_no_automatic_urgent_sets_neuro_baseline():
    state = clear_state(lbp_leg_side="BILATERAL", lbp_leg_neuro_symptoms=["NONE"])
    assert safety_status(state) == "CLEAR"  # not auto-escalated
    assert compute_neuro_baseline_required(state) is True  # but flagged for clinician baseline exam


def test_neuro_baseline_not_required_when_not_bilateral():
    assert compute_neuro_baseline_required(clear_state(lbp_leg_side="RIGHT", lbp_leg_neuro_symptoms=["NONE"])) is False


# --- 7. objective severe/progressive motor deficit -> URGENT_REVIEW ---------

def test_item7_objective_severe_progressive_deficit_is_urgent():
    state = clear_state(clinician_objective_motor_deficit="SEVERE_OR_PROGRESSIVE")
    assert safety_status(state) == "URGENT_REVIEW"


def test_objective_deficit_none_or_unassessed_does_not_force_urgent():
    assert safety_status(clear_state(clinician_objective_motor_deficit="NONE")) == "CLEAR"
    assert safety_status(clear_state()) == "CLEAR"  # not yet assessed (missing) is not itself urgent


def test_objective_deficit_independent_of_ces():
    # CES clear but clinician found severe objective deficit on exam -> still urgent
    state = clear_state(lbp_ces_screen=["NONE"], clinician_objective_motor_deficit="SEVERE_OR_PROGRESSIVE")
    assert safety_status(state) == "URGENT_REVIEW"


# --- 8. trauma reachable regardless of onset_pattern -------------------------

def test_item8_trauma_yes_requires_review_for_every_onset_pattern():
    for onset in ("SUDDEN", "GRADUAL", "TRAUMA", "REPETITIVE_USE", "UNKNOWN", None):
        state = clear_state(onset_pattern=onset, lbp_trauma_safety="YES")
        if onset is None:
            del state["onset_pattern"]
        assert safety_status(state) == "REVIEW_REQUIRED", f"failed for onset_pattern={onset!r}"


# --- 9. unexplained weight loss ---------------------------------------------

def test_item9_weight_loss_yes_requires_review():
    assert safety_status(clear_state(lbp_current_redflag_screen=["UNEXPLAINED_WEIGHT_LOSS"])) == "REVIEW_REQUIRED"


def test_item9_weight_loss_unknown_requires_review():
    assert safety_status(clear_state(lbp_current_redflag_screen=["UNKNOWN"])) == "REVIEW_REQUIRED"


# --- 10. infection/procedure risk (including the new choice value) ----------

def test_item10_infection_procedure_risk_requires_review():
    assert safety_status(clear_state(lbp_current_redflag_screen=["RECENT_SPINAL_PROCEDURE_OR_INJECTION"])) == "REVIEW_REQUIRED"


def test_item10_infection_procedure_unknown_requires_review():
    state = clear_state(lbp_current_redflag_screen=["UNKNOWN"])
    assert safety_status(state) == "REVIEW_REQUIRED"


# --- 11. age alone never triggers review ------------------------------------

def test_item11_age_alone_does_not_force_review():
    state = clear_state(patient_age=80)
    assert safety_status(state) == "CLEAR"
    assert compute_fracture_risk_age_modifier(state) is True  # informational only
    assert compute_malignancy_risk_age_modifier(state) is True  # informational only


def test_age_modifiers_correct_thresholds():
    assert compute_fracture_risk_age_modifier({"patient_age": 75}) is True
    assert compute_fracture_risk_age_modifier({"patient_age": 74}) is False
    assert compute_malignancy_risk_age_modifier({"patient_age": 51}) is True
    assert compute_malignancy_risk_age_modifier({"patient_age": 50}) is False


# --- 12. inflammatory UNKNOWN never NO --------------------------------------

def test_item12_inflammatory_eligible_unknown_onset_bucket_stays_unknown():
    assert compute_inflammatory_eligible({"onset_bucket": "UNKNOWN", "patient_age": 32}) == "UNKNOWN"


def test_item12_inflammatory_eligible_missing_onset_bucket_stays_unknown():
    assert compute_inflammatory_eligible({"patient_age": 32}) == "UNKNOWN"


def test_inflammatory_eligible_age_boundary_still_correct():
    assert compute_inflammatory_eligible({"onset_bucket": "M3_PLUS", "patient_age": 44}) == "YES"
    assert compute_inflammatory_eligible({"onset_bucket": "M3_PLUS", "patient_age": 45}) == "UNKNOWN"
    assert compute_inflammatory_eligible({"onset_bucket": "M3_PLUS", "patient_age": 45, "lbp_onset_before_45": "NO"}) == "NO"


# --- 13. formal NG65 count removed (no such computation exists) -------------

def test_item13_no_formal_criteria_count_function_exists():
    import lbp_logic
    assert not hasattr(lbp_logic, "inflammatory_criteria_count")
    assert not hasattr(lbp_logic, "ng65_criteria_count")


def test_inflammatory_pattern_consider_is_boolean_not_a_count():
    state = {"onset_bucket": "M3_PLUS", "patient_age": 30,
             "lbp_inflammatory_screen": ["SECOND_HALF_NIGHT_WAKING", "BUTTOCK_PAIN"]}
    result = compute_inflammatory_pattern_consider(state)
    assert result is True
    assert isinstance(result, bool)


def test_inflammatory_pattern_consider_false_when_not_eligible():
    assert compute_inflammatory_pattern_consider({"onset_bucket": "D0_3", "patient_age": 30}) is False


def test_inflammatory_pattern_consider_false_when_no_supporting_feature():
    state = {"onset_bucket": "M3_PLUS", "patient_age": 30, "lbp_inflammatory_screen": ["NONE"]}
    assert compute_inflammatory_pattern_consider(state) is False


# --- 14/15/16. pregnancy / treatment safety, kept separate from disease safety -

def test_item14_pregnancy_gate_reachable_for_f_other_unknown_10_55():
    # treatment_safety_status resolves to REVIEW_REQUIRED once the module
    # actually receives a pregnancy_status answer for an applicable patient
    for sex in ("F", "OTHER", "UNKNOWN"):
        state = {"patient_sex": sex, "patient_age": 30, "pregnancy_status": "UNKNOWN"}
        assert compute_treatment_safety_status(state) == "REVIEW_REQUIRED", f"failed for sex={sex}"


def test_item15_pregnancy_male_skip_is_clear_not_a_gap():
    state = {"patient_sex": "M", "patient_age": 30}  # pregnancy_status never asked -> MISSING
    assert compute_treatment_safety_status(state) == "CLEAR"


def test_pregnancy_applicable_but_unanswered_fails_closed():
    state = {"patient_sex": "F", "patient_age": 30}  # applicable, but not yet answered
    assert compute_treatment_safety_status(state) == "REVIEW_REQUIRED"


def test_item16_pregnancy_drives_treatment_safety_not_disease_safety():
    # A patient with a fully CLEAR disease-safety picture but positive
    # pregnancy status must stay disease-CLEAR; only treatment safety flips.
    state = clear_state(pregnancy_status="YES", patient_sex="F", patient_age=28)
    assert safety_status(state) == "CLEAR"
    assert compute_treatment_safety_status(state) == "REVIEW_REQUIRED"
    assert disease_safety_locked(state) is False
    assert treatment_safety_locked(state) is True


# --- 17/18. lock functions, fail closed --------------------------------------

def test_item17_disease_safety_locked_when_not_clear():
    state = clear_state(lbp_ces_screen=["SADDLE_SENSORY_CHANGE"])
    assert disease_safety_locked(state) is True


def test_item17_disease_safety_unlocked_only_when_genuinely_clear():
    assert disease_safety_locked(clear_state()) is False


def test_item18_missing_safety_state_locks_not_unlocks():
    state = clear_state()
    del state["lbp_ces_screen"]  # never answered
    assert disease_safety_locked(state) is True


def test_treatment_safety_locked_matches_status():
    assert treatment_safety_locked({"patient_sex": "M", "patient_age": 30}) is False
    assert treatment_safety_locked({"patient_sex": "F", "patient_age": 30, "pregnancy_status": "POSSIBLE"}) is True


# --- major-history incomplete-answer guard (carried over from prior fixes) --

def test_major_history_present_yes_but_categories_missing_requires_review():
    state = clear_state(major_history_present="YES")  # categories not yet answered
    assert safety_status(state) == "REVIEW_REQUIRED"


def test_major_history_cancer_requires_review():
    state = clear_state(major_history_present="YES", major_history_categories=["CANCER"])
    assert safety_status(state) == "REVIEW_REQUIRED"
