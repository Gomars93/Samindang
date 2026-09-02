# LBP Exercise Core-20 Metadata v0.1

Status: **EXPERIMENTAL CLINICAL METADATA — NOT PRODUCTION RECOMMENDER**

## Why this exists

The canonical LBP catalog currently preserves 57 explicitly listed exercises across 13 domains. The next problem is not adding more exercise names; it is making the most useful exercises operational enough for real primary-care use.

This phase therefore deepens only 20 exercises first.

The 20 rows add:
- starting criteria,
- pragmatic starting dose,
- acceptable response,
- stop/review triggers,
- regression,
- progression,
- target-function links.

They do **not** add:
- patient → exercise ranking,
- diagnosis → exercise mapping,
- automatic prescription,
- automatic progression,
- treatment-success thresholds.

## Evidence boundary

The broad exercise categories are supported by major LBP guidance, but those sources do not provide one validated universal dose for each named exercise.

Key references:
- George SZ, Fritz JM, Silfies SP, et al. *Interventions for the Management of Acute and Chronic Low Back Pain: Revision 2021.* J Orthop Sports Phys Ther. 2021;51(11):CPG1-CPG60. doi:10.2519/jospt.2021.0304.
  - supports broad use of trunk strengthening/endurance, specific trunk activation, aerobic/general exercise, movement control and mobility depending on presentation;
  - states there is no clear superiority of one exercise form across chronic LBP and that dose/intensity varied substantially across trials.
- NICE NG59. *Low back pain and sciatica in over 16s: assessment and management.*
  - exercise should reflect the person's needs, preferences and capabilities;
  - normal activity/self-management remain important.
- WHO. *Guideline for non-surgical management of chronic primary low back pain in adults in primary and community care settings.* 2023.
  - supports structured exercise within person-centred, primary/community care.

Therefore:

> Every item-specific dose in v0.1 is a **Samindang pragmatic starting default**, not a guideline-derived treatment threshold.

Clinician judgment and patient response always override it.

## Core-20 selection

The goal was not “top 20 exercises” in a universal ranking. The goal was a compact subset that spans all 13 canonical domains and can cover the common primary-care path from symptom-tolerable movement to activity and load restoration.

| Domain | Core rows |
|---|---|
| Activity/Aerobic | `LBP_ACT_01` 걷기 5~10분; `LBP_ACT_02` interval walking |
| Lumbar mobility | `LBP_LUMBAR_02` cat-camel; `LBP_LUMBAR_03` lumbar rotation |
| Directional response | `LBP_DIR_02` prone-on-elbows; `LBP_DIR_03` repeated extension; `LBP_DIR_04` flexion in lying/sitting |
| Hip mobility | `LBP_HIP_MOB_01` hip flexor |
| Deep trunk activation | `LBP_DEEP_TRUNK_01` abdominal brace; `LBP_DEEP_TRUNK_03` heel slide |
| Trunk control | `LBP_TRUNK_03` Bird-dog |
| Trunk endurance | `LBP_TRUNK_END_01` bridge |
| Hip strength | `LBP_HIP_STR_03` standing hip abduction |
| Functional strength | `LBP_FUNC_01` sit-to-stand; `LBP_FUNC_05` hip hinge |
| Load capacity | `LBP_LOAD_02` deadlift pattern |
| Neural mobility | `LBP_NEURAL_01` sciatic slider |
| Graded exposure | `LBP_EXPOSURE_01` 숙이기; `LBP_EXPOSURE_03` prolonged sitting |
| Mind-body/regulation | `LBP_REG_01` 호흡·이완 |

## Clinical design rules used

### 1. Symptom response beats diagnosis label
Directional exercises are not assigned because the patient has a specific structural diagnosis.

The relevant future selector must use the observed response:
- same/better,
- centralizing/bodyward,
- peripheralizing/distal worsening,
- unclear/limited.

### 2. Acceptable discomfort is not the same as worsening
The metadata intentionally allows mild familiar discomfort or muscular fatigue when it does not progressively accumulate.

It explicitly stops/reviews for patterns such as:
- new/progressive neurologic change,
- repeated distal symptom worsening,
- persistent marked worsening after the exercise,
- balance/safety failure where relevant.

These are **exercise stop/review descriptions**, not a replacement for FROZEN disease-safety logic.

### 3. Progress one variable at a time
Progression usually changes one of:
- duration,
- repetitions,
- range,
- support,
- external load,
- activity context.

The catalog does not need a complicated multi-axis level engine to begin with.

### 4. Target Function remains the anchor
Exercises are linked to functional tags to make future ranking explainable.

The exercise is not considered successful merely because it was completed. The longitudinal question remains whether the patient's Target Function and relevant supporting outcomes are recovering.

## Source-specific preserved content

`LBP_TRUNK_03 = Bird-dog` remains the only exercise with a fully explicit object example in the original v0.2 source. Its original Level 2, example dose, regression, progression direction, target functions and stop/review content remain preserved in the canonical catalog.

A prior clinical case also documented a practical hip-flexor lunge dose of 20–30 seconds × 2/side with a shorter-duration regression; the core metadata uses that existing Samindang convention rather than inventing a different one.

## Observed catalog gap — do not auto-add yet

Prior clinical case notes repeatedly used **log-roll / bed-mobility training** for patients whose Target Function was getting in/out of bed. That activity is not an explicit item in the current 57-item canonical table.

This is a legitimate candidate gap, but it is intentionally **not added in this phase**.

Rule:
> If real pilot cases repeatedly require a useful exercise/functional skill that the 57-item catalog cannot represent, add it through a separate catalog-review decision rather than quietly expanding the library during recommender work.

## Gate before ranking

Before a future 2–3 exercise recommender is coded, review these 20 rows as clinical objects and stress them against representative vignettes.

The ranking question comes later:

> Given safety, Target Function, irritability, movement response, neuro state, capacity and patient goal, which **domain/exercise information actually changes the home plan today?**

Do not turn the Core-20 list itself into a default checklist or universal exercise bundle.
