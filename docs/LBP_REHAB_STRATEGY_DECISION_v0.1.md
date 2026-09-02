# LBP Rehab Strategy Decision v0.1

Status: **CLINICAL DECISION CLOSED — IMPLEMENTATION PENDING**

This document records the approved rehabilitation-strategy layer for the experimental LBP Clinical OS.

## North-star boundary

Clinical OS is not intended to complete diagnosis exhaustively. It should help the clinician safely start care, choose a meaningful management direction, track recovery, and know when to change course — without adding unnecessary work.

Keep these principles fixed:

- Target Function is the longitudinal anchor.
- Click minimization > data perfection.
- Not assessed / unknown / not performed / limited must never be interpreted as normal.
- Eligibility and safety are not ranking signals; they are upstream gates.
- Diagnosis alone must not map directly to exercise.
- Treatment response informs management revision; it is not proof of diagnosis.
- Do not add patient questions or clinician exam clicks solely to support rehab ranking unless the result would materially change management.
- Simple patients may legitimately have a very small plan.

## Approved rehab architecture

```text
Safety
  ↓
Target Function
  ↓
Exercise Eligibility
  ↓
Primary Rehab Strategy 1 + optional Secondary Strategy 0–1
  ↓
Eligible exercise candidates 2–3
  ↓
Clinician selects 1–2
  ↓
Track Target Function / response
  ↓
Maintain / progress / regress / reassess
```

## Approved strategy set

### 1. SYMPTOM_RESPONSE_GUIDED_MOVEMENT
Korean UI: **증상반응 활용**

Use when a reproducible movement/directional response can reasonably guide exercise exposure, for example favorable symptom reduction or centralization-like bodyward change.

This is descriptive management logic, not a pathoanatomic diagnosis.

### 2. PHYSICAL_FUNCTION_CAPACITY
Korean UI: **신체·기능능력 회복**

Covers restoring the capacity needed for the patient's Target Function, including as relevant:

- walking/activity tolerance
- mobility
- trunk/hip control
- endurance
- strength
- functional strength
- load capacity / return to work

Walking, sit-to-stand, lifting, dressing, etc. remain **Target Functions**, not separate top-level rehab strategies.

### 3. NEURAL_MOBILITY_MANAGEMENT
Korean UI: **신경가동성 관리**

Use only after upstream eligibility/safety conditions are satisfied. This strategy does not independently declare radiculopathy or another final diagnosis.

### 4. GRADED_EXPOSURE_RETURN
Korean UI: **단계적 노출·복귀**

Use when a meaningful function is safe enough to attempt but is limited by avoidance, fear, guarded behavior, or low exposure tolerance, and controlled graded return is clinically appropriate.

### Adjunct: REGULATION
Korean UI: **호흡·이완 보조**

Regulation is an adjunct, not a peer primary strategy by default. It may support recovery when tension, arousal, sleep-related difficulty, or symptom sensitivity interferes with function.

It should not displace the main functional rehabilitation target merely because pain is present.

## Selection shape

The system should choose:

- exactly **1 Primary Strategy** when a rehab plan is being formed;
- **0 or 1 Secondary Strategy** only when it meaningfully adds a distinct management purpose;
- Regulation separately as an optional adjunct.

Do not force a Secondary Strategy.

## Explicitly rejected designs

Do **not** implement:

- eight or more peer top-level rehab intents;
- numeric pseudo-precision scores such as +3 / +7 weighting;
- ranking all 57 exercises against one another directly;
- diagnosis → exercise hard mapping;
- re-running safety/eligibility logic inside the ranking layer;
- mandatory Primary + Secondary filling for every patient;
- extra patient questions solely to improve ranking confidence;
- AI-selected exercise rank overriding clinician choice;
- hidden conversion of unknown/unassessed into normal/eligible.

## Ranking responsibility

The ranking layer answers only:

> **Among exercises that are already eligible, which options most directly support the patient's Target Function and current management strategy today?**

It must not decide whether an exercise is safe enough to perform; that belongs to Eligibility.

## Output target

Doctor-facing output should remain compact:

- Target Function
- Primary Rehab Strategy
- optional Secondary Strategy
- 2–3 eligible exercise candidates
- one-line reason for each candidate
- clinician selects 1–2

## Implementation routing / token-efficiency rule

Default implementation route for this bounded task:

1. **Sonnet** — implement the approved contract and tests as one cohesive batch.
2. **Opus** — delta-only clinical/architecture review.
3. **Sonnet** — fix only concrete review findings.
4. **Opus** — closing review.

Do not invoke Fable for this bounded task unless complexity materially expands (large cross-system migration, state/concurrency/restart issues, or unresolved Sonnet↔Opus design conflict).

GitHub remains SSOT. CLOSED clinical semantics in this document must not be silently reinterpreted during implementation.

## Implementation boundaries

For the next implementation batch:

- Tablet questionnaire: no change.
- FROZEN `src/spec/*Logic.ts` / `src/spec/*Adapter.ts`: zero diff.
- Existing safety semantics: unchanged.
- No raw DoctorPayload adapter yet.
- No CRM/EMR write-through yet.
- No production Doctor UI integration yet.
- No new numeric response thresholds.
- No final diagnosis engine changes.
- Do not merge to `main` without explicit Product Owner approval.
