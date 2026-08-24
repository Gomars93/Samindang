"""LBP_V1 computed-field logic — implements LBP_v1.4_임상결정_마감본.md, the
clinical decision document that closes every item previously flagged
CLINICAL_DECISION_REQUIRED. See decision_log.md ("LBP_V1 clinical decision
closure") for the full mapping from decision-doc section to code.

History: this file started as a from-scratch reimplementation of the LBP
candidate package's lbp_engine.py after an Opus clinical review found real
safety-logic bugs (silent CLEAR on malformed CES input, safety status never
computed when CES was unanswered, onset_bucket UNKNOWN folded into NO —
fixes #1-4 below). This revision adds what the clinical decision document
specifies on top of those fixes: objective neurologic deterioration,
bilateral-symptom handling split into two distinct outcomes, two new
red-flag choice values, age-based clinician context (never a safety-status
input on its own), a v1 inflammatory "CONSIDER" flag with no formal NG65
count, and a treatment-safety dimension (pregnancy) kept fully separate
from disease safety (lbp_safety_status).
"""
from __future__ import annotations

MISSING = object()

URGENT_CES_VALUES = {
    "URINARY_RETENTION", "BLADDER_BOWEL_CONTROL", "SADDLE_SENSORY_CHANGE",
    "RAPID_PROGRESSIVE_WEAKNESS", "SUDDEN_SEXUAL_FUNCTION_CHANGE",
}
REVIEW_HISTORY_VALUES = {"CANCER", "OSTEOPOROSIS"}
CONCRETE_LEG_EXTENT = {"BUTTOCK", "THIGH", "BELOW_KNEE", "FOOT"}
CONCRETE_LEG_SIDE = {"RIGHT", "LEFT", "BILATERAL"}
CONCRETE_NEURO = {"PARESTHESIA", "NUMBNESS", "SUBJECTIVE_WEAKNESS"}
TREATMENT_SAFETY_PREGNANCY_VALUES = {"YES", "POSSIBLE", "UNKNOWN"}


def compute_leg_state(state: dict) -> str:
    extent = state.get("lbp_distal_extent", MISSING)
    side = state.get("lbp_leg_side", MISSING)
    neuro = state.get("lbp_leg_neuro_symptoms", MISSING)
    concrete = (
        extent in CONCRETE_LEG_EXTENT
        or side in CONCRETE_LEG_SIDE
        or (isinstance(neuro, list) and any(x in CONCRETE_NEURO for x in neuro))
    )
    if concrete:
        return "YES"
    if extent == "BACK_ONLY" and side == "NONE" and neuro == ["NONE"]:
        return "NO"
    return "UNKNOWN"


def compute_inflammatory_eligible(state: dict) -> str:
    """Decision doc section 5: onset age <45 AND duration >3mo -> YES;
    explicit negative -> NO; onset age/duration UNKNOWN -> UNKNOWN. No
    formal NG65 criteria count — see compute_inflammatory_pattern_consider
    for the v1 CONSIDER-only signal."""
    onset_bucket = state.get("onset_bucket", MISSING)
    if onset_bucket in (MISSING, "UNKNOWN"):
        return "UNKNOWN"
    if onset_bucket != "M3_PLUS":
        return "NO"
    age = state.get("patient_age", MISSING)
    if age is MISSING:
        return "UNKNOWN"
    if age < 45:
        return "YES"
    onset = state.get("lbp_onset_before_45", MISSING)
    if onset in ("YES", "NO", "UNKNOWN"):
        return onset
    return "UNKNOWN"


def compute_inflammatory_pattern_consider(state: dict) -> bool:
    """Decision doc section 5: eligible + a concrete supporting feature ->
    clinician-facing CONSIDER signal. Not a diagnosis, not a formal NG65
    count (this simplified screen doesn't collect all 9 NG65 criteria)."""
    if compute_inflammatory_eligible(state) != "YES":
        return False
    screen = state.get("lbp_inflammatory_screen", MISSING)
    return isinstance(screen, list) and any(v not in ("NONE", "UNKNOWN") for v in screen)


def compute_neuro_baseline_required(state: dict) -> bool:
    """Decision doc section 2 proviso: bilateral leg PAIN ALONE (no
    concrete neuro feature) does not escalate lbp_safety_status — it
    requests a clinician neuro baseline exam instead."""
    if state.get("lbp_leg_side", MISSING) != "BILATERAL":
        return False
    neuro = state.get("lbp_leg_neuro_symptoms", MISSING)
    has_concrete_neuro = isinstance(neuro, list) and any(x in CONCRETE_NEURO for x in neuro)
    return not has_concrete_neuro


def compute_fracture_risk_age_modifier(state: dict) -> bool:
    """Decision doc section 3-2: age>=75 fracture-risk context. Clinician-
    facing only — never feeds lbp_safety_status on its own."""
    age = state.get("patient_age", MISSING)
    return age is not MISSING and age >= 75


def compute_malignancy_risk_age_modifier(state: dict) -> bool:
    """Decision doc section 3-2: age>50 malignancy-risk context. Clinician-
    facing only — never feeds lbp_safety_status on its own."""
    age = state.get("patient_age", MISSING)
    return age is not MISSING and age > 50


def compute_treatment_safety_status(state: dict) -> str:
    """Decision doc section 6: a SEPARATE dimension from lbp_safety_status.
    Pregnancy affects what treatment can be finalized, not whether the LBP
    presentation itself needs disease-safety review — the two must never
    be merged into one status value."""
    pregnancy_status = state.get("pregnancy_status", MISSING)
    if pregnancy_status in TREATMENT_SAFETY_PREGNANCY_VALUES:
        return "REVIEW_REQUIRED"
    if pregnancy_status == "NO":
        return "CLEAR"
    # MISSING: only a real gap if the Core question should have fired
    # (patient_sex in [F,OTHER,UNKNOWN], age 10-55) but hasn't been
    # answered yet — fail closed there. Otherwise MISSING is the expected,
    # non-gap state (e.g. a male patient never gets asked at all).
    sex = state.get("patient_sex", MISSING)
    age = state.get("patient_age", MISSING)
    applicable = sex in ("F", "OTHER", "UNKNOWN") and age is not MISSING and 10 <= age <= 55
    return "REVIEW_REQUIRED" if applicable else "CLEAR"


def _ces_requires_review(ces) -> tuple[bool, bool]:
    """Returns (urgent, review). Any shape other than exactly ['NONE'] (or
    an urgent value present) requires review — mirrors the already-correct
    lbp_current_redflag_screen pattern instead of an exact-equality check
    that would let malformed/edge states fall through to CLEAR."""
    if ces is MISSING:
        return False, True
    vals = ces if isinstance(ces, list) else [ces]
    if any(v in URGENT_CES_VALUES for v in vals):
        return True, True
    if vals == ["NONE"]:
        return False, False
    return False, True  # empty, ['UNKNOWN'], ['UNKNOWN','NONE'], malformed, etc.


def safety_status(state: dict) -> str:
    """Disease safety only. See compute_treatment_safety_status for the
    separate pregnancy dimension — decision doc section 6."""
    urgent, ces_review = _ces_requires_review(state.get("lbp_ces_screen", MISSING))

    # Decision doc section 1-2: clinician-confirmed objective neurologic
    # deterioration is independent of and can escalate past the patient-
    # reported CES screen.
    objective_deficit = state.get("clinician_objective_motor_deficit", MISSING)
    if objective_deficit == "SEVERE_OR_PROGRESSIVE":
        urgent = True

    if urgent:
        return "URGENT_REVIEW"

    review = ces_review

    current = state.get("lbp_current_redflag_screen", MISSING)
    if current is MISSING or not isinstance(current, list) or current != ["NONE"]:
        review = True

    # lbp_trauma_safety is asked unconditionally (decision doc section 4 /
    # prior Opus-review fix) — both signals checked independently.
    onset_pattern = state.get("onset_pattern", MISSING)
    trauma = state.get("lbp_trauma_safety", MISSING)
    if onset_pattern == "TRAUMA":
        review = True
    if trauma in ("YES", "UNKNOWN", MISSING):
        review = True

    major_history_present = state.get("major_history_present", MISSING)
    hist = state.get("major_history_categories", MISSING)
    if major_history_present == "YES" and hist is MISSING:
        review = True  # incomplete safety-relevant answer, not "no history"
    elif isinstance(hist, list) and any(x in REVIEW_HISTORY_VALUES for x in hist):
        review = True

    # Decision doc section 2 (confirmed): bilateral + a concrete neuro
    # feature requires review. Bilateral pain ALONE does NOT — see
    # compute_neuro_baseline_required for that case instead.
    leg_side = state.get("lbp_leg_side", MISSING)
    neuro = state.get("lbp_leg_neuro_symptoms", MISSING)
    if leg_side == "BILATERAL" and isinstance(neuro, list) and any(x in CONCRETE_NEURO for x in neuro):
        review = True

    return "REVIEW_REQUIRED" if review else "CLEAR"


def disease_safety_locked(state: dict) -> bool:
    """lbp_safety_status != CLEAR, computed as a plain equality rather than
    a `!= CLEAR` comparison whose missing-value semantics would fail open —
    safety_status() always returns a concrete value once called, so this is
    safe. Decision doc section 9 (fail closed)."""
    return safety_status(state) != "CLEAR"


def treatment_safety_locked(state: dict) -> bool:
    """Decision doc section 9: contraindication-sensitive treatment/
    exercise must not be finalized without clinician approval when
    treatment_safety_status != CLEAR. Does not stop the questionnaire —
    only gates recommendation finalization, unlike disease_safety_locked."""
    return compute_treatment_safety_status(state) != "CLEAR"


def recompute(state: dict) -> None:
    """Always computed whenever the LBP module is active — never gated on
    which fields happen to be present, since MISSING is exactly one of the
    states these functions are designed to classify."""
    state["leg_symptom_present"] = compute_leg_state(state)
    state["lbp_inflammatory_eligible"] = compute_inflammatory_eligible(state)
    state["lbp_inflammatory_pattern_consider"] = compute_inflammatory_pattern_consider(state)
    state["lbp_neuro_baseline_required"] = compute_neuro_baseline_required(state)
    state["lbp_fracture_risk_age_modifier"] = compute_fracture_risk_age_modifier(state)
    state["lbp_malignancy_risk_age_modifier"] = compute_malignancy_risk_age_modifier(state)
    state["lbp_safety_status"] = safety_status(state)
    state["treatment_safety_status"] = compute_treatment_safety_status(state)


def prune_hidden_responses(questions: list[dict], state: dict, visible_fn) -> None:
    """Monotonic fixpoint: remove responses for questions whose show_when no
    longer holds after an upstream answer changed."""
    changed = True
    while changed:
        changed = False
        recompute(state)
        for q in questions:
            of = q.get("output_field")
            if of in state and q.get("show_when") and not visible_fn(q, state):
                del state[of]
                changed = True
        recompute(state)
