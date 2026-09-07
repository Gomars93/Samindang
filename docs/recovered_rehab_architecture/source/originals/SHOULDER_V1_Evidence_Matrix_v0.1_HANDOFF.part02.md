이면 local shoulder diagnosis로 고정하지 않는다.

NECK_V1의 safety semantics를 **복사하지 않고 재사용/연결**하는 것이 원칙.

`CERVICAL_OR_NEURO_CONTRIBUTION_CONSIDER`
또는 NECK safety trigger.

---

# 4. Evidence Matrix

| Clinical question | Patient discriminators | Safety | High-yield clinician exam | Hypothesis | Supporting | Contradicting / caution | Management direction | Reassessment |
|---|---|---|---|---|---|---|---|---|
| RC-related shoulder pain인가? | overhead/load-related pain, lateral shoulder/upper-arm pain, affected-side lying pain, gradual onset 가능 | trauma+new major weakness는 acute tear branch | AROM/PROM, painful arc, resisted ER/abduction, strength; Hawkins-Kennedy는 보조 | `RC_RELATED_SHOULDER_PAIN_CONSIDER/HIGHER_SUPPORT` | load-related pain + relatively preserved PROM + concordant resisted/elevation response | marked global PROM restriction, instability, distal neuro, systemic pattern | active rehab: graded resistance/motor control/load tolerance | NRS + target function + load tolerance |
| acute traumatic cuff tear concern인가? | trauma + sudden substantial loss of active elevation/strength | **red flag / expedited assessment** | active vs passive elevation, cuff strength, lag/drop arm as adjunct | `MUST_EXCLUDE_ACUTE_TRAUMATIC_CUFF_TEAR` | trauma + new objective weakness/function loss | atraumatic longstanding pain, strength limited only by pain | routine progression lock pending assessment | safety/function |
| frozen shoulder pattern인가? | progressive pain/stiffness, dressing/reaching behind back/overhead difficulty | red flags 먼저 | **PROM including ER**, AROM, comparison with contralateral | `FROZEN_SHOULDER_PATTERN_CONSIDER` | active + passive global restriction, especially ER; compatible course | passive ROM relatively preserved; acute trauma/instability | irritability-matched mobility + education + graded function | target function + PROM/AROM |
| GH OA pattern인가? | older adult, gradual stiffness/pain/function loss | systemic/trauma exclusion | global AROM/PROM, crepitus; radiograph clinician decision | `GH_OA_CONSIDER` | global passive restriction + chronic progressive course | preserved passive ROM, acute onset | function/load/mobility as tolerated; imaging if clinically needed | function/ROM |
| traumatic instability인가? | prior traumatic dislocation/subluxation, recurrence, apprehension | unreduced acute dislocation → emergency | after acute safety cleared: apprehension/relocation, instability exam, neurovascular | `TRAUMATIC_INSTABILITY_CONSIDER` | clear traumatic instability history + apprehension | no instability history; stiffness-dominant | phase-based stability/strength/control; recurrence context | episodes + target function |
| atraumatic instability / movement-control phenotype인가? | subluxation/“빠질 것 같다”, little/no major trauma, often younger | acute unreduced event excluded | movement/control observation, instability testing as appropriate | `ATRAUMATIC_INSTABILITY_CONSIDER` | symptoms of abnormal translation + control deficit | fixed stiffness/arthritis/traumatic tear | education + motor control + cuff/scapular stability + graded exposure | instability episodes/function |
| AC/local joint contribution인가? | superior shoulder focal pain, cross-body/loading pain | trauma fracture excluded | AC palpation, cross-body adduction + overall exam | `AC_OR_LOCAL_JOINT_CONTRIBUTION_CONSIDER` | focal concordant pain | broad lateral pain, distal neuro, global stiffness | symptom-guided local load modification/rehab | target function |
| cervical/neuro contribution인가? | neck-linked symptoms, distal paresthesia/numbness, symptoms below elbow/hand | progressive/bilateral neuro follows NECK safety | cervical ROM, neuro baseline, NECK selective exam as indicated | `CERVICAL_NEURO_CONTRIBUTION_CONSIDER` | neck movement + neuro distribution | purely local shoulder load pattern | route/link to NECK module; do not force shoulder diagnosis | neuro + function |
| systemic/referred pain인가? | systemic illness, cancer, hot/swollen joint, nonmechanical chest/breathlessness/autonomic pattern | **MUST EXCLUDE** | medical assessment | `MUST_EXCLUDE_NON_MSK_OR_SYSTEMIC` | nonmechanical/systemic pattern | reproducible local mechanical pattern lowers but does not automatically eliminate concern | routine MSK recommender lock until review | safety only |

---

# 5. Active vs Passive ROM — SHOULDER_V1의 핵심 분기

SHOULDER_V1에서는 단순히 “팔이 안 올라간다”만 기록하지 않는다.

```text
Active elevation 제한
        ↓
Passive도 유사하게 제한?
   ├─ YES → mobility deficit / frozen shoulder / OA 등 고려
   └─ NO  → pain inhibition / RC weakness / neurologic / motor-control 등 고려
```

특히 passive external rotation은
- frozen shoulder
- GH arthritis
- RC/subacromial phenotype

을 구분하는 high-yield 정보로 사용한다.

하지만 특정 ROM pattern 하나로 진단 확정하지 않는다.

---

# 6. Rotator Cuff Exam Principles

2025 JOSPT CPG를 반영:

## 기본
- shoulder AROM/PROM 객관 측정
- cuff muscle strength 객관 측정
- patient-reported pain/disability/function

가능하면:
- goniometer/inclinometer
- HHD

## 보조 검사
- painful arc
- Hawkins-Kennedy
- resisted external rotation
- resisted abduction/scaption
- 필요 시 Jobe
- traumatic major weakness이면 lag/drop-arm 계열

### 금지
- “Neer 양성 = impingement 확진”
- “Jobe 양성 = supraspinatus tear 확진”
- “painful arc 하나 = RC pathology 확진”

특수검사는 **hypothesis support / contradiction**에만 사용한다.

---

# 7. Suggested Exam Engine v0.1

## Base — 대부분의 shoulder
1. Target-function reproduction
2. AROM:
   - flexion/elevation
   - abduction
   - ER
   - functional IR as clinically useful
3. PROM:
   - elevation
   - ER
   - IR
4. cuff strength:
   - ER
   - abduction/scaption
   - IR

## Trauma + major functional loss
- deformity/neurovascular first
- active vs passive elevation
- cuff strength
- lag/drop arm adjunct
- fracture/dislocation/acute tear pathway

## Global passive restriction
- quantify PROM, especially ER
- OA/frozen shoulder differential
- imaging history / previous radiographs if relevant

## Instability history
- traumatic vs atraumatic
- recurrence count/context
- apprehension/relocation only when safe
- movement-control assessment

## Distal neuro / neck-linked
- use NECK selective exam semantics
- local shoulder special-test cascade보다 neuro assessment 우선

## Focal superior shoulder
- AC palpation
- cross-body adduction
- compare with global shoulder findings

---

# 8. Hypothesis Model

확률 금지.

상태:
- `MUST_EXCLUDE`
- `HIGHER_SUPPORT`
- `CONSIDER`
- `LOWER_SUPPORT`

후보:

```text
MUST_EXCLUDE_INFECTION
MUST_EXCLUDE_FRACTURE_OR_UNREDUCED_DISLOCATION
MUST_EXCLUDE_ACUTE_TRAUMATIC_CUFF_TEAR
MUST_EXCLUDE_SYSTEMIC_OR_MALIGNANT_PATHOLOGY
MUST_EXCLUDE_NON_MSK_REFERRED_PATHOLOGY

RC_RELATED_SHOULDER_PAIN
FROZEN_SHOULDER_PATTERN
GH_OA_PATTERN
TRAUMATIC_INSTABILITY
ATRAUMATIC_INSTABILITY
AC_OR_LOCAL_JOINT_CONTRIBUTION
CERVICAL_NEURO_CONTRIBUTION
```

각 hypothesis 저장:
- supporting findings
- contradicting findings
- need_to_exclude
- next_exam

구조 진단명(“supraspinatus tear”, “labral tear”, “impingement”)을
