# Clinical Decisions — Samindang Tablet Core v1.4

Autonomy policy category B: items touching clinical judgment are not decided autonomously by a spec/engineering pass. Open items below have a provisional, most-conservative behavior already implemented (so development isn't blocked), 2-3 alternatives, and what needs to happen before UI ships. Resolved items were closed by an actual clinical decision document and are kept for traceability, not re-litigated.

## Currently open

None. Every item below was closed by LBP_v1.4_임상결정_마감본.md (2026-08-24).

## Resolved (closed by LBP_v1.4_임상결정_마감본.md, 2026-08-24)

### pregnancy_gate_patient_sex_scope

Confirmed as-is (decision doc section 6): core_pregnancy_status stays gated on patient_sex in [F,OTHER,UNKNOWN], age 10-55. New: a SEPARATE treatment_safety_status dimension (pregnancy affects treatment finalization, not disease-safety review) — never merged with lbp_safety_status. See lbp_logic.compute_treatment_safety_status.

### complex_herbal_route_classification

Definition decided (doc section 7): case-level, not route-level — 2+ herbal micro-modules entered, OR a second complaint opens another herbal module, OR (medication_present AND major_history_present). complex_herbal_p90_seconds=300s is a fatigue-budget cap, not a target time. Dynamic engine implementation deferred (no herbal question sets exist yet to test against) — tracked as a non-blocking engineering task in UNRESOLVED_DESIGN_DECISIONS, not a clinical question anymore.

### lbp_bilateral_neuro_escalation_threshold

Confirmed (doc section 2): BILATERAL + a concrete neuro feature (paresthesia/numbness/subjective weakness) -> REVIEW_REQUIRED. Bilateral leg PAIN ALONE does NOT auto-escalate — sets lbp_neuro_baseline_required instead, requiring a clinician neuro exam. Explicitly framed as Samindang's own conservative policy, not a direct NICE NG127 citation.

### lbp_red_flag_coverage_gaps

Decided per-item (doc section 3), not uniformly filled: (A) unexplained weight loss — already covered by the existing lbp_current_redflag_screen choice, confirmed sufficient. (B) infection/procedure risk — ONE new choice added (RECENT_SPINAL_PROCEDURE_OR_INJECTION) to the same existing screen, not a separate question. Age — explicitly NOT asked as a question; read from Core as a clinician-facing modifier only (lbp_fracture_risk_age_modifier / lbp_malignancy_risk_age_modifier), never alone raising safety status. Night/rest pain — explicitly NOT added as a universal red flag; stays an inflammatory-branch supporting feature. Bisphosphonate — explicitly NOT added as a separate question; existing osteoporosis history + corticosteroid context covers it. pregnancy_status — now wired to treatment_safety_status.

### lbp_inflammatory_criteria_count_threshold

v1 policy decided (doc section 5): NO formal NG65 count is computed — this simplified screen doesn't collect all 9 NG65 criteria 1:1. Replaced with a simple boolean lbp_inflammatory_pattern_consider (eligible + >=1 supporting feature -> clinician-facing CONSIDER, never a patient-facing diagnosis/probability). hypothesis_model's ambiguous 'criteria count' language removed.

### lbp_evidence_citation_verification

Citations confirmed against primary-source recollection (doc section 8), with specific corrections identified: NG127's CES paraphrase should not be read as mandating referral for bilateral sciatica alone (the bilateral rule above is Samindang policy, not a NICE citation) — the miscitation risk was in this codebase's own prior rationale comment (now corrected), not in evidence_matrix_lbp_v1.md itself. Suri 2010's older-adults-with-leg-pain population scope noted for future evidence_matrix edits. NG65 formal count confirmed not applicable to this simplified screen (see lbp_inflammatory_criteria_count_threshold above).

### lbp_exercise_recommender_lock_enforcement

Contract specified in full (doc section 9): disease_safety_locked() gates routine exercise/treatment/Suggested-Exam on lbp_safety_status != CLEAR; a separate treatment_safety_locked() gates contraindication-sensitive treatment finalization on treatment_safety_status != CLEAR without stopping the questionnaire; both fail closed on a missing/uncomputed status. Both functions implemented and tested. Wiring them into an actual UI/exercise-recommender (no such repo exists in this environment) remains an engineering task, tracked in UNRESOLVED_DESIGN_DECISIONS — no longer a clinical question.
