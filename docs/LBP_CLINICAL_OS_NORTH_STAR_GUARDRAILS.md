# LBP Clinical OS — North Star Guardrails

Status: PRODUCT / CLINICAL DESIGN GUARDRAIL — NOT PRODUCTION CLINICAL LOGIC

This document exists to prevent the LBP Clinical OS from drifting while the action-adaptive engine is being prototyped.

## 1. Product purpose

Clinical OS is not a diagnosis encyclopedia. It is a primary-care management system that helps the clinician:

1. decide whether routine musculoskeletal care can proceed safely,
2. identify the patient's main functional problem,
3. obtain only the additional findings that can change management,
4. form an explainable working hypothesis without forcing diagnostic certainty,
5. choose treatment and rehabilitation direction,
6. track response with a small number of meaningful outcomes,
7. reopen omitted diagnostic branches when the course is inconsistent, worsening, or non-responsive,
8. hand the confirmed plan downstream to EMR / CRM / patient instructions with minimal duplicate work.

The system may leave diagnostic uncertainty unresolved. It must not leave that uncertainty unmanaged.

---

## 2. Non-negotiable workflow principles

### A. Keep the visit short
- Target real clinician workflow: roughly 5–10 minutes, not a comprehensive specialist workup.
- Do not add a question or exam merely because it improves diagnostic precision.
- Ask / recommend it only when the result can change safety, treatment target, rehabilitation, follow-up metric, or imaging/referral decision now or at the near-term reassessment.
- Simple patients may legitimately have **0 additional checks**.
- Progressive disclosure is preferred over a card wall or a long checklist.
- A recommended non-safety check is not automatically a prohibition on routine conservative care. Distinguish **care availability** from **whether the management plan is ready for confirmation**.

### B. Click minimization over data perfection
- Reuse tablet / prior facts; do not ask the clinician to re-enter them.
- Structured click input is preferred to free text when it drives CDS.
- Never collapse `NOT_ASSESSED`, `NOT_PERFORMED`, `LIMITED`, or `UNCERTAIN` into normal/negative.
- Optional memo remains available, but CDS should not depend on narrative text when a structured state is practical.

### C. Safety is a gate, not the whole CDS
- Existing FROZEN LBP safety semantics remain authoritative.
- Disease safety and treatment safety stay separate.
- Safety-critical ambiguity can gate the routine pathway.
- General diagnostic uncertainty should lower certainty, not erase the entire clinical-support flow.

### D. Primary-care management, not forced pathoanatomic diagnosis
- Do not force lumbar vs disc vs stenosis vs Hip vs SIJ into a mutually-exclusive diagnosis tree.
- Hip, SIJ, neuro, walking limitation, and movement response may coexist as management-relevant contributors.
- A working hypothesis should be allowed to remain uncertain or partially explanatory.
- "현재 데이터로 충분히 설명되지 않음" must be a valid state; atypical patients must not be forced into a known bucket.
- When several domains are simultaneously relevant, do not hard-code the currently experimental ordering (for example neuro first and Hip/SIJ later) as a clinically approved truth until vignette review explicitly supports it.

### E. Clinician remains in control
- Clinician override / concern must remain available even when the automatic engine does not raise a domain.
- The engine recommends; the clinician confirms the hypothesis, treatment direction, exercise, and downstream documentation.

---

## 3. Required end-to-end clinical pipeline

The project is not complete when the exam-suggestion engine is complete.

### Stage 1 — Upstream facts
- Current tablet questionnaire is read-only for this project phase.
- Missing information should first be collected doctor-side as a Next Best Check.
- Repeated evidence that a fact is better pre-collected is a separate future tablet agenda requiring approval.

### Stage 2 — Next Best Check
- Show only checks that may alter management.
- Each check must explain:
  - **how to perform it**, and
  - **why it is being recommended for this patient**.
- Korean-first labels; hover on desktop and tap on tablet must both work.

### Stage 3 — Explainable working hypothesis
Future production output must include, when supported:
- primary / higher support / consider / lower support / must exclude or an equivalently concise hierarchy,
- supporting findings,
- contradicting findings,
- meaningful unknowns,
- safety context,
- and a concise explanation of **why** the hypothesis is being shown.

Do not infer a final diagnosis merely from one test (e.g. SLR, FABER, imaging finding).

### Stage 4 — Treatment / rehabilitation direction
- Exercise selection is based on function + irritability + response + goal, not diagnosis name alone.
- Recommend roughly **2–3 ranked exercise candidates**; clinician usually selects **1–2**.
- Every exercise must have starting criteria, dose, acceptable response, stop/review criteria, regression, and progression.
- Do not invent exercise IDs that are not present in the approved rehabilitation library.

### Stage 5 — Reassessment
- Target Function is the primary longitudinal anchor; NRS is secondary.
- Walking tolerance, distal symptoms, objective neuro, activity, adherence/exposure, etc. are supporting outcomes when relevant.
- Do not convert unapproved examples (e.g. 2 weeks / 4 visits or numeric response cutoffs) into production thresholds.
- Insufficient exposure must not be mislabeled as treatment failure.
- Adequate non-response should trigger hypothesis / target / rehabilitation reassessment and may reopen previously unassessed domains.
- Deterioration or new neurologic change refreshes safety immediately.

### Stage 6 — Same-day quick recheck
- After treatment, allow a very short recheck of 1–2 key markers where useful.
- Typical output is improved / same / worse plus the value when available.
- Do not represent same-day change as proof of causal diagnosis or treatment mechanism.

### Stage 7 — One-click downstream handoff
After clinician confirmation, the same confirmed clinical state should be reusable for:
- EMR note in fixed format:
  - `C/C | 주호소`
  - `O/S | 발병 및 경과`
  - `S | 주관적 소견`
  - `O | 객관적 소견`
  - `A | 평가`
  - `P | 계획`
- CRM episode / care-plan state,
- selected rehabilitation and follow-up metric,
- patient instructions / exercise dose / cautions / media,
- next reassessment timing.

CRM must not make clinical decisions independently.

---

## 4. UX guardrails

Doctor UI should feel like a changing clinical stage, not a wall of cards.

Preferred progression:

`환자 요약 → 오늘 판단에 필요한 확인 0~몇 개 → 임상가설/이유 → 치료·운동 결정 → 빠른 재평가/기록`

Examples of forbidden drift:
- displaying all possible Hip / SIJ / neuro / lumbar checks on every patient,
- opening another question simply because the previous answer was uncertain,
- demanding directional ROM values in every direction on every patient,
- equating no click with normal,
- showing research-layer terms such as Decision Key / tranche / sufficiency to the clinician,
- requiring a diagnosis label before conservative management can begin,
- turning every suggested check into a mandatory pre-treatment checklist.

---

## 5. Current prototype scope vs original North Star

### Preserved / actively tested
- Safety gate
- Management-changing Next Best Check only
- Simple-patient low-click path
- Hip / SIJ parallelism
- Neuro / walking / movement-response action branches
- `미평가 ≠ 정상`
- visit freshness for terminal exam states
- clinician override
- adequate non-response re-evaluation
- progressive disclosure / deferred unresolved state
- routine-care availability remains separate from whether suggested checks are still outstanding

### Intentionally NOT complete yet — MUST NOT BE FORGOTTEN
- explainable differential / working-hypothesis engine
- ranked rehabilitation recommendation from the approved library
- clinician confirmation flow
- same-day post-treatment quick recheck
- fixed-format EMR generation
- CRM episode / reassessment state write-through
- patient rehabilitation instructions
- Korean-first production Doctor UI and real-device interaction
- real DoctorPayload adapter

These are downstream milestones, not optional nice-to-haves.

---

## 6. Acceptance question for every new feature or rule

Before adding it, answer:

> **Does this help the clinician safely start care, choose a meaningful management direction, track recovery, or know when to change course — without adding unnecessary work?**

If the answer is no, the feature should normally not enter the LBP Clinical OS v1.
