# LBP Exercise Core-20 — Clinical Vignette Stress v0.1

Status: **EXPERIMENTAL OBSERVATION ONLY — NOT PRODUCTION RECOMMENDER**

## Purpose

This pass asks whether the 20 deeply described exercise objects are rich enough to support realistic primary-care decisions before any patient → exercise ranking is implemented.

It does **not** ask which exercise is best or rank candidates.

The observation vocabulary is test-only:

- `START_AS_WRITTEN`
- `START_WITH_REGRESSION`
- `DEFER_NOT_READY`
- `STOP_REVIEW`
- `NOT_RELEVANT_TODAY`

These are not production enums and do not imply diagnosis.

## Stress set

15 clinical vignettes cover:

1. simple axial high-irritability LBP,
2. favourable extension response,
3. favourable flexion response with extension peripheralization,
4. stable radicular symptoms with slider tolerance,
5. new progressive objective motor deficit,
6. walking-limited but interval-tolerant presentation,
7. Hip contribution with balance limitation,
8. deconditioned sit-to-stand,
9. low-load trunk-control recovery,
10. return to lifting with low irritability,
11. prolonged-sitting avoidance,
12. sleep/turning mobility limitation,
13. work-endurance recovery,
14. distal symptom worsening during exercise,
15. uncomplicated movement recovery.

Every Core-20 exercise appears in at least one observation.

## Result

Experimental CI result:

- vignettes: **15**
- Core-20 coverage: **20/20**
- `START_AS_WRITTEN`: **23** observations
- `START_WITH_REGRESSION`: **7**
- `DEFER_NOT_READY`: **7**
- `STOP_REVIEW`: **6**
- `NOT_RELEVANT_TODAY`: **6**

The entire experimental LBP suite passed together with this test.

## What held up well

### 1. High irritability does not collapse into total rest
A simple axial high-irritability case can retain low-load movement/regulation options while functional hinge and load-capacity work remain deferred.

### 2. Directional response remains response-based, not diagnosis-based
A favourable extension response can support extension exposure without automatically adding flexion or neural mobility. Conversely, extension-associated distal worsening makes extension work not-ready rather than forcing it because of a diagnosis label.

### 3. Distal worsening is not a progression signal
Repeated distal symptom spread during directional exercise, neural slider, or graded exposure maps to `STOP_REVIEW`, not "push through" or automatic progression.

### 4. Neural mobility remains a slider, not an automatic tensioner pathway
Stable radicular symptoms may tolerate the slider metadata, but progression remains response-dependent and the stored progression explicitly does not auto-convert to a sustained tensioner.

### 5. Load-capacity work has a clear readiness boundary
High-irritability cases can defer deadlift-pattern work. Return-to-lifting cases can enter it through the stored regression (high starting position / light load), rather than treating load as all-or-none.

### 6. Safety still sits above exercise
A vignette with new progressive objective motor deficit contains no `START_AS_WRITTEN` or `START_WITH_REGRESSION` observation. Exercise selection does not override the existing safety pathway.

## Critical limitation discovered

**The metadata is clinically expressive but not yet machine-decidable.**

Current fields such as `startingCriteriaKo`, `acceptableResponseKo`, and `stopReviewKo` are narrative Korean strings. In this vignette pass, the disposition was assigned explicitly by the test fixture after reading those strings.

Therefore this test demonstrates:

> the exercise objects can express clinically sensible start / regression / defer / stop states.

It does **not** demonstrate:

> the software can yet infer those states safely from normalized patient facts.

Building a ranking engine now would require one of two bad options:

1. parse free-text Korean criteria at runtime, or
2. duplicate the same clinical rules again inside the recommender.

Both would create drift and make clinical review harder.

## Next gate before ranking

Create a small **structured exercise-eligibility contract** derived from the already-reviewed Core-20 metadata.

The contract should encode only reusable prerequisites / cautions such as:

- routine exercise pathway permitted by safety,
- objective neuro stable when required,
- favourable / non-adverse directional response when required,
- balance/support requirement,
- low-load control prerequisite,
- target-function relevance,
- load-readiness prerequisite,
- distal symptom worsening as stop/review,
- clinician override.

Important boundaries:

- do not rank exercises yet,
- do not create diagnosis → exercise mappings,
- do not add new tablet questions,
- do not invent numeric response thresholds,
- do not change FROZEN safety semantics,
- do not turn every prerequisite into another clinician click if the fact already exists.

Only after this contract can answer **"eligible / eligible-with-regression / not-ready / stop-review"** from structured facts should ranked 2–3 candidate selection be designed.

## Interpretation

The Core-20 content is adequate to continue. The next bottleneck is not adding more exercises; it is making the existing clinical boundaries reviewable and machine-readable without duplicating clinical logic.
