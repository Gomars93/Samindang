# SHOULDER_V1 — Rehabilitation Architecture (Recovered Reference)

Status: **REFERENCE ONLY — recovered 2026-09-07**

Provenance: recovered from prior ChatGPT Library artifact `SHOULDER_V1_Evidence_Matrix_v0.1_HANDOFF.md` (original draft dated 2026-08-25). This file was not previously present in the GitHub repository.

This reference does **not** replace the current SHOULDER_V1 PASS/FROZEN safety/module implementation and does not mean an exercise recommender is already implemented.

## Original design principle

> Safety → Pain/Function → Trauma/Instability → Active vs Passive ROM → Strength/Load response → Cervical/Non-shoulder contribution → Hypothesis → Selective Exam → Exercise/Management → Reassessment

Exercise is not fixed by diagnosis. Selection is based on **function + irritability + ROM pattern + strength/load response + instability + safety + goal**.

## Candidate workflow

> **Clinical OS recommends 2–3 candidates → clinician approves/removes/replaces → final 1–2 exercises**

## Selection inputs

- Target Function
- irritability
- active vs passive ROM
- strength
- load response
- instability
- movement control
- patient goal
- safety

## Rehabilitation domains

- education / activity-load modification
- mobility
- rotator-cuff resistance
- scapular motor control / endurance
- kinetic-chain integration
- overhead graded exposure
- instability / stability control
- functional reaching / lifting tolerance

## Phenotype-to-management direction from the recovered Evidence Matrix

### Rotator-cuff-related shoulder pain
- active rehabilitation is central
- use motor-control and/or resistance training according to function and response
- graded load tolerance rather than diagnosis-triggered one-exercise prescribing

### Frozen-shoulder pattern
- irritability-matched mobility
- education
- graded function
- do not assume stronger stretching is always better

### Glenohumeral OA pattern
- function/load/mobility as tolerated
- imaging only when clinically indicated; do not let imaging severity drive exercise automatically

### Traumatic instability / recurrent instability
- after acute safety is cleared, use phase-appropriate stability, strength and control
- include recurrence and functional context

### Atraumatic instability / movement-control phenotype
- education
- motor control
- cuff/scapular stability
- graded functional exposure

### AC/local contribution
- symptom-guided local load modification and rehabilitation

### Cervical/neuro contribution
- reuse NECK selective-exam/safety semantics
- do not force a local shoulder diagnosis when the neurologic/cervical pattern is more relevant

### Infection, unreduced dislocation/fracture, acute traumatic cuff-tear concern, non-MSK referred pain or other major safety concern
- routine rehabilitation progression is locked pending appropriate assessment

## Explicit prohibitions from the recovered design

Do not hard-code:

- “rotator cuff = band external rotation”
- “frozen shoulder = aggressive ROM”
- “impingement = exercise to enlarge subacromial space”
- routine exercise progression before safety review

Do not use a diagnosis label alone to select exercise.

## Current governance note

The current GitHub SHOULDER integration work intentionally did not implement the exercise recommender contract. Therefore this file is a **recovered clinical architecture reference**, not evidence that a production recommender already exists.

Future reuse rule:

> When LBP production v1 establishes the minimal common exercise-object contract, reuse only the minimum skeleton needed here; preserve SHOULDER-specific domains and do not recreate unnecessary questionnaire or strategy layers.