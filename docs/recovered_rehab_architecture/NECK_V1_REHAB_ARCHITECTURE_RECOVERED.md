# NECK_V1 — Rehabilitation Architecture (Recovered Reference)

Status: **REFERENCE ONLY — recovered 2026-09-07**

Provenance: recovered from prior ChatGPT Library artifact `NECK_V1_Evidence_Matrix_v0.2_HANDOFF.md` (original draft dated 2026-08-25). This file was not previously present in the GitHub repository.

This reference does **not** replace the current NECK_V1 PASS/FROZEN safety/module implementation and does not mean an exercise recommender is already implemented.

## Original design principle

> Safety → Pain/Function → Arm/Neuro → Headache/Associated symptoms → Selective Exam → Hypothesis → Exercise/Management → Reassessment

Exercise is not fixed by diagnosis. Selection is based on **function + irritability + examination/response + goal + safety**.

## Candidate workflow

> **Clinical OS recommends 2–3 candidates → clinician approves/removes/replaces → final 1–2 exercises**

## Selection inputs

- Target Function
- irritability
- cervical ROM / movement response
- arm/neuro status
- headache response
- endurance/control
- patient goal
- safety

## Rehabilitation domains

- cervical mobility
- thoracic mobility
- directional symptom response
- deep neck flexor control/endurance
- cervical extensor endurance
- scapular control/strength/endurance
- neural mobility
- graded exposure / work-posture tolerance
- aerobic/activity

## Phenotype-to-management direction from the recovered Evidence Matrix

### Axial neck pain / mobility-deficit pattern
- mobility work
- cervicoscapular endurance/strength
- activity restoration
- track Target Function and useful ROM/function

### Cervical radicular involvement pattern
- symptom-guided cervical/scapular exercise
- neural mobility when response supports it
- traction only in an appropriate multimodal context, not as a diagnosis-triggered default
- track arm symptom extent, neurologic status, and Target Function

### Cervicogenic-headache pattern
- upper cervical/cervicothoracic mobility as appropriate
- cervicoscapular endurance selected by response
- atypical/new severe headache remains a safety problem first

### Movement-coordination / endurance deficit
- graded cervical/scapular endurance
- control work
- functional sitting/work tolerance
- graded activity exposure

### Shoulder/peripheral contribution
- do not force a neck diagnosis
- assess/treat the relevant contributing domain when supported

### Cord, vascular, fracture, systemic, infection or malignancy concern
- routine exercise/treatment recommender locked pending appropriate medical/safety review

## Explicit prohibitions from the recovered design

Do not hard-code:

- “disc → chin tuck”
- “straight neck → this exercise”
- “radicular symptoms → traction automatically”

Do not use a diagnosis label alone to select exercise.

## Current governance note

The current GitHub NECK integration report explicitly deferred the actual `exercise_recommender_contract`. Therefore this file is a **recovered clinical architecture reference**, not evidence that a production recommender already exists.

Future reuse rule:

> When LBP production v1 establishes the minimal common exercise-object contract, reuse only the minimum skeleton needed here; preserve NECK-specific domains and do not recreate unnecessary questionnaire or strategy layers.