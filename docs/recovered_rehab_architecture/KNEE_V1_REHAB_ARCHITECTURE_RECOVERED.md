# KNEE_V1 — Rehabilitation Architecture (Recovered Reference)

Status: **REFERENCE ONLY — recovered 2026-09-07**

Provenance: recovered from prior ChatGPT Library artifact `KNEE_V1_Evidence_Matrix_v0.1_HANDOFF.md` (original draft dated 2026-08-25). This file was not previously present in the GitHub repository.

This reference does **not** replace the current KNEE_V1 PASS/FROZEN safety/module implementation and does not mean an exercise recommender is already implemented.

## Original design principle

> Safety → Trauma/Weight-bearing/Extensor mechanism → Effusion/Locking/Instability → Pain location + Load pattern → ROM → Ligament/Meniscus/PF/OA/Tendon hypotheses → Selective Exam → Exercise/Management → Reassessment

Exercise is not hard-coded by diagnosis. Selection is based on **function + irritability + ROM + strength + load response + instability + safety + goal**.

## Candidate workflow

> **Clinical OS recommends 2–3 candidates → clinician approves/removes/replaces → final 1–2 exercises**

## Selection inputs

- Target Function
- irritability
- ROM
- effusion
- strength
- load response
- instability
- movement control
- patient goal
- safety

## Rehabilitation domains

- activity / aerobic
- mobility
- quadriceps strength
- hamstring / calf / hip strength
- neuromuscular / balance
- sit-to-stand / squat / stair tolerance
- gait / load progression
- patellofemoral-specific graded loading
- tendon load progression
- ligament return-to-function
- graded exposure

## Phenotype-to-management direction from the recovered Evidence Matrix

### Knee OA pattern
- education
- therapeutic exercise
- graded activity
- weight management when applicable
- track walking, sit-to-stand and other Target Function outcomes rather than imaging severity

### Patellofemoral pain pattern
- education
- knee-targeted exercise with hip-targeted exercise when useful
- load management
- progress by function and response

### Patellar tendinopathy / extensor-load pain
- progressive tendon load tolerance
- do not default to rest
- acute rupture concern is a safety branch first

### Acute meniscal injury
- function/ROM and locking context determine management
- true mechanical extension block or displaced-tear concern can require expedited assessment
- do not select exercise from MRI tear alone

### Degenerative meniscal contribution
- emphasize function/exercise/OA-oriented care where appropriate
- avoid imaging-driven attribution of pain

### Ligament injury / instability
- after acute safety is cleared, use protection followed by strength, neuromuscular control and functional progression
- return-to-function is individualized by stability and function, not diagnosis label alone

### Patellar instability
- stabilization/control
- recurrence-risk and function monitoring

### DVT, septic joint, fracture/neurovascular injury, extensor-mechanism rupture, true locked knee or other major safety concern
- routine rehabilitation progression is locked pending appropriate assessment

## Explicit prohibitions from the recovered design

Do not hard-code:

- “OA = one quadriceps exercise”
- “PFP = VMO isolation”
- “meniscus = no rotation for everyone”
- “ACL diagnosis = identical rehab for all”
- “tendon pain = rest”
- routine progression when safety/locking/extensor-rupture concern is unresolved

Do not use a diagnosis label alone to select exercise.

## Current governance note

The current GitHub KNEE_V1 module is PASS/FROZEN for its clinical/safety scope, but a production exercise recommender/library was not implemented as part of that v1 scope. Therefore this file is a **recovered clinical architecture reference**, not evidence that a production recommender already exists.

Future reuse rule:

> When LBP production v1 establishes the minimal common exercise-object contract, reuse only the minimum skeleton needed here; preserve KNEE-specific domains and do not recreate unnecessary questionnaire or strategy layers.