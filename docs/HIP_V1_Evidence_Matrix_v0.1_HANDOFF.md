# HIP_V1 — Evidence Matrix v0.1 HANDOFF

작성일: 2026-08-25  
기준 main: `4ade31a3ae50c601a734c6183f69356f7ac46f0e`  
브랜치: `clinical/hip-v1-review`  
상태: **EVIDENCE DESIGN COMPLETE / CLINICAL DECISIONS OPEN**

> 목적: `PAIN_01 === low_back_pelvis`에 현재 FROZEN된 LBP_V1을 손대지 않고 HIP_V1을 추가하기 위한 임상 evidence/safety 경계를 정의한다. 이 문서는 임상설계 문서이며 production code 구현은 임상결정 CLOSED 이후에만 허용한다.

---

## 1. Actual repo constraint — LBP_V1과 공유 population

현재 `src/spec/coreSpec.ts`에서:

```text
PAIN_01 == low_back_pelvis
→ IS_PRIMARY_LBP == true
→ LBP_V1 protected safety 전체 노출
```

기존 주석도 `low_back_pelvis`가 low-back과 pelvis를 의도적으로 conflation하는 최소변경 경계라고 명시한다.

따라서 HIP_V1은 **LBP safety를 숨기거나 기존 gate를 재정의해서는 안 된다.**

### 권장 routing 후보

`PAIN_01 === low_back_pelvis` 아래 추가 discriminator:

`HIP_00` — 현재 가장 불편한 곳

- `LOW_BACK_DOMINANT`
- `BUTTOCK_PELVIS_DOMINANT`
- `HIP_GROIN_DOMINANT`
- `SIMILAR_OR_MULTIPLE`
- `UNKNOWN`

권장 semantics:

- `IS_PRIMARY_LBP`는 **그대로 유지**. 모든 `low_back_pelvis`에서 기존 LBP protected safety가 계속 보인다.
- HIP protected safety는 `BUTTOCK_PELVIS_DOMINANT / HIP_GROIN_DOMINANT / SIMILAR_OR_MULTIPLE / UNKNOWN`에서 추가 노출.
- `LOW_BACK_DOMINANT`에서는 HIP-specific protected safety를 생략하는 후보.
- `HIP_00` 값 자체는 safety tier를 만들지 않는다.

이렇게 하면 NECK/SHOULDER, ELBOW/WRIST_HAND에서 이미 사용한 **shared population + independent safety engines** 원칙을 유지할 수 있다.

### H1 — Clinical decision required

위 overlap을 확정할지 검수한다.

현재 추천: **LBP always-on 유지 + HIP safety 추가 노출**, 기존 LBP safety를 HIP route 때문에 절대 숨기지 않는다.

---

## 2. 핵심 근거원

### E1. ACR Appropriateness Criteria — Acute Hip Pain, 2024 Update

- acute traumatic hip pain에서 radiography가 initial imaging modality of choice.
- suspected fracture인데 radiographs가 negative/indeterminate이면 MRI without contrast 또는 CT without contrast가 `Usually Appropriate`.
- hip fracture는 physical examination만으로 신뢰성 있게 배제할 수 없다.

Published as ACR Acute Hip Pain 2024 Update; PubMed PMID `40409883`, DOI `10.1016/j.jacr.2025.02.039`.

### E2. NICE CG124 — Hip fracture: management, updated 2023

- hip fracture가 의심되는데 adequate X-ray가 negative이면 MRI를 권고.
- MRI가 24시간 내 불가능하거나 contraindicated이면 CT 고려.
- confirmed hip fracture는 early definitive management가 필요한 질환이다.

이 근거는 **"X-ray가 정상이라고 들었다"가 hip fracture concern을 자동 해제하면 안 됨**을 지지한다.

### E3. AAOS — Management of Hip Fractures in Older Adults, 2021

- older adult hip fracture의 evidence-based management guideline.
- older adults에서 hip fracture는 시간민감한 중대 병변이며 multidisciplinary/early treatment가 중요하다.
- Tablet은 fracture를 진단하지 않고 위험 신호를 external assessment로 연결해야 한다.

### E4. Bernstein et al. — Femoral Neck Stress Fractures Updated Review, 2022

- J Am Acad Orthop Surg. 2022;30(7):302-311.
- PMID `35077440`, DOI `10.5435/JAAOS-D-21-00398`.
- typical presentation: insidious atraumatic hip/groin pain, often relieved with rest; athletes/military/overuse context.
- radiographs may be normal; MRI has superior diagnostic performance.
- missed diagnosis can progress to complete/displaced fracture, nonunion, osteonecrosis, disability.

### E5. ACR Appropriateness Criteria — Chronic Hip Pain, 2022 Update

- chronic hip pain after targeted history/physical exam에서 radiography가 일반적으로 initial imaging.
- wide differential 때문에 clinical picture에 따라 advanced imaging 선택.
- imaging finding은 symptom source를 자동 확정하지 않는다.

PubMed PMID `37236751`, DOI `10.1016/j.jacr.2023.02.019`.

### E6. AAOS — Management of Osteoarthritis of the Hip, 2023

- adult hip OA conservative/surgical management guideline.
- mild-moderate symptomatic hip OA에서 physical therapy가 pain/function에 도움이 될 수 있음.
- 이미 trained provider가 OA를 진단한 population을 대상으로 하므로 tablet symptom pattern으로 OA를 확진하는 근거로 사용하면 안 된다.

### E7. JOSPT / AOPT — Hip Pain and Mobility Deficits: Hip OA Revision 2017

- J Orthop Sports Phys Ther. 2017;47(6):A1-A37.
- DOI `10.2519/jospt.20170301`.
- history + physical impairment/function assessment 기반의 hip OA evaluation/intervention framework.

### E8. Warwick Agreement — FAI syndrome, 2016

- Griffin DR, Dickenson EJ, O'Donnell J, et al.
- Br J Sports Med. 2016;50(19):1169-1176.
- PMID `27629403`, DOI `10.1136/bjsports-2016-096743`.
- FAI syndrome diagnosis에는 **appropriate symptoms + positive clinical signs + imaging findings**가 함께 필요.
- 따라서 tablet의 groin pain/clicking/flexion-provoked symptom만으로 FAI diagnosis 생성 금지.

### E9. GTPS / gluteal tendinopathy evidence

- 2024 systematic review/meta-analysis: exercise is supported as first-line management for clinically diagnosed GTPS; six RCTs, 733 participants.
- PMID `38295551`, DOI `10.1016/j.physio.2024.01.001`.
- 2018 BMJ RCT (PMID `29720374`) also supports education + exercise for gluteal tendinopathy.
- 단, lateral hip pain alone은 GTPS/gluteal tendinopathy 확진이 아님.

### E10. SANJO 2023

- native-joint septic arthritis는 painful/inflamed joint에서 fever 유무와 관계없이 고려해야 하며 diagnosis는 aspiration/microbiology 등 clinician-directed evaluation 필요.
- PMID `36756304`, DOI `10.5194/jbji-8-29-2023`.

---

## 3. HIP_V1 목표

**Core global safety → LBP protected safety 유지 → HIP route discriminator → trauma/deformity/NV → fracture/occult fracture → stress fracture → infection/septic concern → load/location phenotype → clinician selective exam → hypotheses → management/exercise → reassessment**

Safety status 후보:

- `CLEAR`
- `REVIEW_REQUIRED`
- `URGENT_REVIEW`

Adjunct flags 후보:

- `fracture_imaging_consider`
- `expedited_referral_consider`
- `infection_assessment_required`
- `neurovascular_assessment_required`
- `stress_fracture_assessment_required`

Flag는 safety tier가 아니다.

---

## 4. Scope

### v1 포함

- acute hip fracture/dislocation concern
- occult hip fracture concern after negative/indeterminate radiographs
- femoral neck stress fracture concern
- acute distal neurovascular compromise associated with major trauma
- septic hip / serious infection concern
- hip OA supportive pattern
- GTPS/gluteal tendinopathy supportive pattern
- FAI/labral-type mechanical supportive pattern
- hip flexor/adductor or other local load-related pattern
- lumbar/referred source coexistence

### v1 제외

- pediatric DDH/SCFE/Perthes-specific pathways
- fracture classification
- exact femoral neck stress fracture morphology
- labral tear confirmation
- FAI morphology diagnosis
- injection/surgery indication automation
- THA candidacy automation
- postoperative rehabilitation
- return-to-sport clearance

---

## 5. Safety Matrix

### S1. Major trauma / deformity / dislocation / acute NV

Concrete patient-reported candidates:

- hip/leg clearly looks out of place after major trauma
- unable to move the leg at all after trauma with obvious deformity
- foot becomes newly cold/pale/blue after hip/pelvic trauma
- major new distal sensory/motor loss after trauma
- severe open injury/uncontrolled bleeding

Recommended:

- any concrete limb-threatening positive → `URGENT_REVIEW`
- patient answer remains S, not objective perfusion/neurology O.

### H2 — Clinical decision required

Acute trauma + major distal neurologic deficit를 standalone URGENT로 고정할지 확정.

추천: YES.

---

### S2. Acute hip fracture concern

High-yield history:

- recent fall/trauma
- new hip/groin pain
- inability or marked difficulty bearing weight/walking after event
- older age/fragility context (available later in global history/age data)

Recommended:

- trauma + new marked weight-bearing failure → at least `REVIEW_REQUIRED + fracture_imaging_consider + expedited_referral_consider`
- deformity/NV/open injury → S1 URGENT.

### H3 — Clinical decision required

`fall/trauma + unable to bear weight`를 HIP_V1에서 **URGENT**로 할지 **REVIEW+expedited**로 할지 확정.

현재 추천: **REVIEW + expedited + fracture flag**, KNEE_V1의 hip/groin fracture concern과 tier consistency를 유지. 단, clinic workflow에서 immediate external evaluation을 유도하는 UI wording은 허용.

---

### S3. Occult fracture / prior X-ray context

Evidence:

- acute hip fracture는 exam만으로 배제 불가.
- radiograph negative/indeterminate인데 suspicion이 지속되면 MRI/CT가 적절.
- NICE도 suspected hip fracture + negative X-ray에서 MRI, 대안 CT를 권고.

Recommended:

- patient-reported prior X-ray context는 optional/non-gating.
- `X-ray normal` 답변이 fracture review/flag를 낮추지 못함.

### H4 — Clinical decision required

Patient-facing prior X-ray context를 수집할지 여부.

추천: YES, **non-gating context only**. WRIST_HAND의 `WH_04A`와 같은 원칙.

---

### S4. Femoral neck stress fracture concern

High-yield history:

- atraumatic/insidious groin or deep hip pain
- running/jumping/march/high-load increase or repetitive load context
- pain with weight bearing/activity, initially relieved by rest
- progressive worsening / rest pain / difficulty walking

Recommended:

- compatible overuse pattern + progressive weight-bearing pain → `REVIEW_REQUIRED + stress_fracture_assessment_required + fracture_imaging_consider`
- severe acute inability to bear weight or sudden deterioration → expedited review; whether URGENT tier is needed is separate decision.
- routine loading exercise lock until stress fracture concern is cleared.

### H5 — Clinical decision required

Stress-fracture screen을 protected safety로 둘지 optional phenotype로 둘지.

추천: **protected conditional safety** for HIP_GROIN/BUTTOCK_PELVIS/SIMILAR/UNKNOWN because missed femoral neck stress fracture has high consequence and radiographs may be normal.

---

### S5. Septic hip / serious infection concern

Deep hip infection may not present with visible redness/swelling.

High-yield patient history:

- rapidly worsening severe hip/groin pain
- fever/chills/systemically very unwell
- inability to bear weight/move joint because of acute severe pain
- recent serious infection/procedure/immunosuppression context from existing history

Recommended:

- severe acute hip pain + systemic illness concrete positive → `URGENT_REVIEW + infection_assessment_required`
- acute severe atraumatic inability to bear weight without systemic feature → at least REVIEW, because fracture/infection/other serious pathology remain possible.
- fever absence does not rule out septic arthritis.

### H6 — Clinical decision required

Infection screen을 `SYSTEMIC_OR_RAPIDLY_WORSENING` opaque OR enum으로 단순화할지 결정.

추천: YES. ELBOW/WRIST_HAND에서 검증된 OR semantics를 재사용하되 hip-specific wording 사용.

---

## 6. Existing LBP safety reuse

HIP_V1은 다음을 새로 복제하지 않는다.

- cauda equina screen
- existing lumbar infection/malignancy risk screen
- lumbar leg-neuro screen

`PAIN_01 === low_back_pelvis`이면 LBP_V1이 계속 활성화되므로, HIP patient도 현재 LBP safety를 유지한다.

중요:

- LBP patient를 HIP route 때문에 좁히지 않음
- HIP patient에서 LBP safety를 숨기지 않음
- patient가 HIP_GROIN이라고 답해도 `safety_flags.lbp`는 계속 계산하는 방향이 가장 회귀위험이 낮음

### H7 — Clinical decision required

HIP_GROIN에서도 LBP protected safety를 계속 노출할지 확정.

추천: **YES / mandatory zero-regression boundary**.

---

## 7. Supportive phenotype concepts

아래는 safety CLEAR 후 clinician reasoning을 돕는 phenotype이며 diagnosis가 아니다.

### Hip OA pattern

Possible supportive history:

- groin/anterior/deep hip pain
- load/walking/stairs related
- stiffness / reduced function
- older age context

Clinician exam/imaging 필요.

### GTPS / gluteal tendinopathy pattern

Possible supportive history:

- lateral hip pain
- pain lying on affected side
- stairs/walking/single-leg load aggravation

Palpation/abductor loading/exam 필요.

### FAI/labral-type mechanical pattern

Possible supportive history:

- groin/anterior hip pain
- deep flexion/squat/sitting provocation
- clicking/catching

Warwick Agreement boundary:

**symptoms alone ≠ FAI syndrome**. Clinical signs + imaging까지 필요한 diagnosis이므로 tablet은 supportive state만 만든다.

### Local musculotendinous pattern

- adductor/groin loading
- hip flexor loading
- activity-related local pain

No single provocative test → diagnosis.

---

## 8. Tablet concept set — pre-closure only

Production IDs는 임상결정 CLOSED 후 확정한다.

Protected concepts:

- `HIP_00` region discriminator
- recent hip/pelvic trauma
- deformity/NV/open injury
- post-trauma weight-bearing failure
- serious acute infection/systemic screen
- stress-fracture/overuse screen
- progressive/severe atraumatic weight-bearing failure

Optional/context:

- prior X-ray result context
- pain location: groin/anterior/lateral/buttock/deep/unclear
- lying-on-side sensitivity
- deep flexion/squat/sitting provocation
- clicking/catching
- load increase/running context
- previous similar episode

Constraints:

- one concept/screen
- patient-friendly anatomy
- 모르겠음 on protected questions
- no FADIR/FABER/log-roll etc patient self-test
- no diagnostic labels

---

## 9. Clinician selective exam

### Fracture/dislocation concern

- inspect leg position/deformity
- gait/weight-bearing only if safe
- distal NV exam
- targeted palpation/ROM only when safe
- imaging per clinical suspicion

### Hip OA / intra-articular

- ROM
- gait/function
- symptom reproduction with appropriate clinician maneuvers
- imaging if clinically indicated

### FAI/labral hypothesis

- clinician FADIR/FABER/other appropriate tests as part of combined assessment
- no single test diagnostic
- imaging correlation required for FAI syndrome diagnosis

### GTPS/gluteal

- lateral palpation
- abductor loading/function
- single-leg functional response when safe

### Stress fracture

- avoid provocative high-load exercise if concern is meaningful
- imaging/referral pathway as indicated

### Infection

- vitals/systemic status
- joint assessment
- labs/imaging/aspiration as appropriate external medical pathway

---

## 10. Hypothesis model

States:

- `MUST_EXCLUDE`
- `HIGHER_SUPPORT`
- `CONSIDER`
- `LOWER_SUPPORT`

### MUST_EXCLUDE candidates

- `MUST_EXCLUDE_HIP_FRACTURE_DISLOCATION_OR_NEUROVASCULAR_INJURY`
- `MUST_EXCLUDE_OCCULT_HIP_FRACTURE`
- `MUST_EXCLUDE_FEMORAL_NECK_STRESS_FRACTURE`
- `MUST_EXCLUDE_SEPTIC_HIP_OR_SERIOUS_INFECTION`

### Supportive candidates

- `HIP_OA_PATTERN`
- `GTPS_OR_GLUTEAL_TENDON_PATTERN`
- `FAI_OR_LABRAL_MECHANICAL_PATTERN`
- `HIP_FLEXOR_OR_ADDUCTOR_LOAD_PATTERN`
- `REFERRED_LUMBAR_OR_PROXIMAL_NEUROLOGIC_SOURCE`
- `OTHER_PELVIC_OR_SYSTEMIC_SOURCE_CONSIDER`

No auto diagnosis.

---

## 11. Fail-closed contract

Protected question rule:

- UNKNOWN != NO
- missing != negative
- malformed != valid negative
- empty multi-select != NONE
- exclusive negative + positive mix = invalid
- protected invalid → minimum REVIEW_REQUIRED
- conditional protected missing escalates only when shown
- optional phenotype missing does not escalate

Runtime implementation after closure:

- single-choice allowlist validation mandatory
- multi-choice allowlist/exclusivity validation mandatory
- malformed regression tests from initial implementation

This incorporates the WRIST_HAND independent audit lesson and must not be deferred.

### H8 — Clinical decision required

HIP_V1에도 이 strict fail-closed contract를 그대로 적용할지 확정.

추천: YES.

---

## 12. Exercise / management boundary

`hip_safety_status != CLEAR`

→ routine exercise/manual-treatment suggestion lock.

Safety clear 후에도:

- diagnosis → exercise direct mapping 금지
- function + irritability + clinician exam/movement response + goal 기반
- OS 후보 rank 후 clinician approve/remove/replace

Evidence-informed future direction:

- mild/moderate confirmed/supported OA: exercise/PT may improve pain/function
- clinically diagnosed GTPS/gluteal tendinopathy: education + progressive exercise has evidence
- FAI syndrome: conservative rehabilitation is a treatment option, but diagnosis requires symptoms/signs/imaging

Stress fracture/fracture/infection concern이 있으면 loading suggestion 금지.

---

## 13. Sigma / chart boundary

Patient tablet response →

- `C/C | 주호소`
- `O/S | 발병 및 경과`
- `S | 주관적 소견`

`O | 객관적 소견`은 clinician-confirmed only.

Patient response만으로 생성 금지:

- gait abnormal objective finding
- true leg-length/deformity confirmation
- distal NV status
- ROM degrees
- FADIR/FABER result
- fracture finding
- X-ray/MRI finding
- OA/FAI/labral/GTPS diagnosis
- septic arthritis diagnosis

---

## 14. Clinical decision packet H1-H8

### H1 Routing overlap
LBP always-on + HIP additional safety exposure를 확정할 것인가?

추천: YES.

### H2 Acute traumatic neurologic deficit
Trauma + major distal sensory/motor loss → standalone URGENT?

추천: YES.

### H3 Hip fracture tier
Trauma + inability to bear weight → REVIEW + expedited + fracture flag, deformity/NV/open injury가 있을 때만 URGENT?

추천: YES.

### H4 Prior X-ray
Patient-reported normal X-ray를 non-gating context로 수집할 것인가?

추천: YES.

### H5 Femoral neck stress fracture
Compatible overuse/progressive groin-weight-bearing pattern을 protected conditional safety로 둘 것인가?

추천: YES.

### H6 Infection architecture
`SYSTEMIC_OR_RAPIDLY_WORSENING` opaque OR semantics → URGENT + infection flag?

추천: YES.

### H7 LBP zero-regression
HIP_GROIN에서도 existing LBP protected safety를 계속 보여줄 것인가?

추천: YES / mandatory.

### H8 Fail-closed
Strict runtime allowlist/exclusivity validation을 v1 최초 구현부터 mandatory로 둘 것인가?

추천: YES.

---

## 15. Evidence phase DoD

- [x] actual repo shared `low_back_pelvis` constraint 확인
- [x] LBP FROZEN zero-regression architecture 정의
- [x] acute fracture/occult fracture evidence
- [x] femoral neck stress fracture evidence
- [x] infection evidence
- [x] OA/GTPS/FAI supportive evidence
- [x] clinician exam boundary
- [x] Sigma O boundary
- [x] exercise lock boundary
- [x] H1-H8 decision packet
- [ ] clinical review/closure
- [ ] Tablet Question Set
- [ ] final verification
- [ ] Fable integration
- [ ] implementation/regression

**현재 판정: EVIDENCE DESIGN COMPLETE / CLINICAL DECISIONS OPEN**
