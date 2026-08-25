# ELBOW_V1 — Evidence Matrix v0.1 HANDOFF

작성일: 2026-08-25  
상태: **DRAFT — Evidence complete / Opus clinical review required / Tablet Question Set not started / No code**

## 0. 목적과 경계

ELBOW_V1은 삼인당 Clinical OS의 성인 팔꿈치 통증 1차 선별·진료보조 모듈이다.

이 문서의 목적은 환자 태블릿에서 **위험신호를 놓치지 않으면서**, 흔한 팔꿈치 통증 phenotype을 원장 진찰 전에 효율적으로 정리할 수 있도록 근거와 임상 결정을 분리해 놓는 것이다.

이 단계에서는:
- 진단을 자동 확정하지 않는다.
- 특수검사 1개로 구조진단을 확정하지 않는다.
- Tablet 응답만으로 영상·수술·시술을 자동 결정하지 않는다.
- 치료 횟수나 한의치료 modality를 자동 결정하지 않는다.
- **Tablet Question Set / TypeScript / UI / tests는 아직 작성하지 않는다.**

---

# 1. 실제 repo routing 제약

현재 `PAIN_01`은 single-choice이며 다음처럼 구성되어 있다.

```text
neck_shoulder
low_back_pelvis
arm_hand
leg_foot
knee
head_face_jaw
chest_rib
abdomen
other
```

즉 **`elbow` 전용 top-level route가 현재 없다.** 팔꿈치는 `arm_hand` 안에 포함된다.

따라서 ELBOW_V1은 KNEE처럼 `PAIN_01 === 'elbow'`로 바로 독립 gate를 만들 수 없다.

### E9 — routing architecture OPEN
다음 Tablet 설계 전 반드시 결정해야 한다.

권장안:
- `PAIN_01 === 'arm_hand'` 후 공통 upper-limb region discriminator를 1개 추가한다.
- 예: `ELBOW / FOREARM / WRIST_HAND / DIFFUSE_OR_MULTIPLE / UNKNOWN`
- ELBOW protected safety를 어느 값까지 노출할지는 Opus/Fable 검수에서 확정한다.
- 장기적으로 WRIST/HAND_V1과 공유 가능한 공통 router로 설계하되, ELBOW 임상 logic 자체는 별도 모듈로 유지한다.

원칙:
> 공통 경험은 통합하고, 임상 도메인은 분리한다.

---

# 2. ELBOW_V1 scope

## 포함 phenotype / safety domain

1. Lateral elbow tendinopathy / lateral elbow pain pattern
2. Medial elbow flexor-pronator / medial epicondylalgia pattern
3. Cubital tunnel / ulnar neuropathy at elbow pattern
4. Radial tunnel / PIN-related differential consideration
5. Distal biceps tendon rupture concern
6. Distal triceps tendon rupture concern
7. Olecranon bursitis — aseptic vs septic concern
8. Elbow fracture / dislocation / acute traumatic injury
9. Neurovascular injury after trauma/dislocation
10. Mechanical intra-articular pathology — locking/catching/ROM block
11. OA/degenerative elbow pain contribution
12. Cervical / proximal referred pain contribution
13. Systemic/inflammatory/infectious alternative pathology

## v1에서 제외

- throwing athlete용 세부 UCL return-to-throw protocol
- 소아 elbow trauma
- post-operative rehabilitation protocol
- fracture classification 자동화
- electrodiagnostic severity grading 자동화
- tendon tear percentage 자동 추정
- injection/surgical indication 자동 결정

---

# 3. Evidence hierarchy

## A. High-priority guideline / CPG

### A1. JOSPT / APTA — Lateral Elbow Pain and Muscle Function Impairments, 2022
- Lucado AM et al.
- J Orthop Sports Phys Ther. 2022;52(12):CPG1-CPG111.
- PMID: 36453071
- DOI: 10.2519/jospt.2022.0302
- 사용 범위: lateral elbow tendinopathy의 differential diagnosis, tests/measures, impairment-based management, exercise/load framework.
- 제한: lateral elbow pain CPG이므로 medial elbow, acute trauma, infection을 직접 커버하지 않는다.

### A2. ACR Appropriateness Criteria — Acute Elbow and Forearm Pain, 2024
- 성인 acute elbow/forearm pain의 initial imaging에서 radiography가 Usually Appropriate.
- fracture 의심 + initial radiograph normal/indeterminate이면 repeat radiograph 10–14일 또는 CT without contrast가 Usually Appropriate.
- tendon/ligament/muscle injury 의심 + radiograph normal/indeterminate이면 US 또는 MRI without contrast가 Usually Appropriate.
- 사용 범위: acute trauma, fracture concern, soft tissue rupture concern의 영상 referral logic.

### A3. ACR Appropriateness Criteria — Chronic Elbow Pain, revised 2022
- chronic elbow pain의 initial imaging은 elbow radiography가 Usually Appropriate.
- locking/clicking/ROM limitation 등 mechanical symptom + normal/nonspecific radiograph에서는 intra-articular pathology 평가를 위한 MRI/MR arthrography/CT 계열이 적절할 수 있다.
- 사용 범위: chronic mechanical symptom / intra-articular differential / imaging escalation.

### A4. SANJO — Guideline for Management of Septic Arthritis in Native Joints, 2023
- Ravn C et al.
- J Bone Jt Infect. 2023;8(1):29-37.
- PMID: 36756304
- DOI: 10.5194/jbji-8-29-2023
- suspected septic native joint는 aspiration 및 bacterial identification이 진단의 핵심.
- sepsis가 아닌 경우 diagnostic sampling 전에 empiric antibiotics를 시작하면 culture yield를 떨어뜨릴 수 있음을 명시.
- 사용 범위: acute hot/swollen elbow + systemic illness의 urgent pathway.

## B. Specialty society / systematic review support

### B1. AAOS/ASES OrthoInfo — Distal biceps tendon tear at elbow
- sudden injury 후 pop, anterior elbow swelling/bruising, elbow flexion weakness와 특히 forearm supination weakness가 대표적.
- complete tear가 obvious하면 clinical exam으로 강하게 의심 가능; US/MRI가 confirmation에 사용될 수 있음.
- surgical repair를 선택할 경우 일반적으로 injury 후 초기 2–3주가 기술적으로 유리하다는 설명이 있어 **time-sensitive expedited referral** 근거로 사용.

### B2. AAOS/ASES OrthoInfo — Triceps tendon tear at elbow
- sudden injury 후 posterior elbow pain/swelling/bruising, palpable gap, elbow extension weakness가 주요 pattern.
- X-ray/US/MRI가 진단·extent 평가에 사용될 수 있음.
- 사용 범위: extensor mechanism concern / expedited review.

### B3. AAOS/ASES OrthoInfo — Cubital tunnel syndrome
- ring/small finger paresthesia, elbow flexion-related worsening, grip/finger coordination weakness가 전형적.
- severe/prolonged compression에서 intrinsic hand muscle wasting이 발생할 수 있고 회복이 제한될 수 있음.
- 사용 범위: ulnar neuropathy discriminator, progressive weakness/atrophy의 escalation.

### B4. Olecranon bursitis systematic evidence
- Kaur et al. 2023 systematic review: aseptic olecranon bursitis는 early conservative management로 resolution 가능하며 corticosteroid injection은 합병증 증가 때문에 refractory case에 제한적으로 고려.
- Sayegh & Strauch 2014 systematic review / Blackwell et al. systematic overview: septic vs aseptic differentiation이 중요하나 standardized pathway evidence는 제한적.
- 사용 범위: posterior superficial swelling을 joint sepsis와 구분하되 infection possibility를 safety screen에서 제거하지 않음.

---

# 4. Proposed safety architecture

```text
Core global safety
→ ELBOW route confirmation
→ Trauma / deformity / neurovascular
→ Infection / hot swollen elbow
→ Acute tendon rupture concern
→ Progressive neurological deficit
→ Mechanical lock / severe ROM block
→ Location + load pattern
→ Selective clinician exam
→ Hypothesis support
→ Management / exercise candidate
→ Reassessment
```

`elbow_safety_status` 후보:

```text
CLEAR
REVIEW_REQUIRED
URGENT_REVIEW
```

별도 flags 후보:

```text
fracture_imaging_consider
expedited_referral_consider
neuro_assessment_required
infection_assessment_required
```

별도 flag는 4번째 safety tier가 아니다.

---

# 5. Evidence Matrix

| Clinical question | Patient discriminator 후보 | Safety tier 후보 | Clinician exam / confirmation | Hypothesis state | Management implication |
|---|---|---|---|---|---|
| acute fracture/dislocation/NV injury인가? | recent fall/direct blow/twist, gross deformity, joint still out, hand suddenly cold/pale/blue, major new distal numbness/weakness | deformity/unreduced or acute NV positive → `URGENT_REVIEW`; trauma + severe functional loss/focal bony concern → `REVIEW_REQUIRED + fracture_imaging_consider` | deformity, skin, distal pulse/perfusion, median/ulnar/radial motor-sensory, bony tenderness, ROM only if safe | `MUST_EXCLUDE_FRACTURE_DISLOCATION_OR_NEUROVASCULAR_INJURY` | routine treatment lock until safety assessment; acute imaging per ACR |
| septic elbow joint인가? | hot/red/swollen elbow + severe pain + fever/chills/systemic illness | systemic septic pattern → `URGENT_REVIEW` | warmth/erythema, effusion, active/passive ROM intolerance, systemic status | `MUST_EXCLUDE_SEPTIC_ARTHRITIS` | aspiration/lab/referral consideration; routine treatment lock |
| septic olecranon bursitis인가? | focal posterior superficial swelling/redness/warmth ± wound/skin break ± fever | systemic illness or rapidly progressive spreading infection → urgent candidate; localized suspicious bursa without systemic illness → review candidate | bursal vs intra-articular localization, skin/wound, ROM preservation, aspiration only when clinically indicated | `MUST_EXCLUDE_SEPTIC_OLECRANON_BURSITIS` | distinguish from aseptic bursitis; infection pathway before injection/manipulation |
| distal biceps rupture concern인가? | sudden eccentric load/forced extension, pop, anterior bruising/swelling, sudden loss of supination strength | `REVIEW_REQUIRED + expedited_referral_consider` | hook test as appropriate, resisted supination/flexion, contour/gap, compare sides | `MUST_EXCLUDE_DISTAL_BICEPS_RUPTURE` | early ortho/sports referral consideration; US/MRI if needed |
| distal triceps rupture concern인가? | sudden push/fall/trauma, posterior bruising/swelling, sudden marked extension weakness | `REVIEW_REQUIRED + expedited_referral_consider` | active extension against gravity/resistance, palpable gap, tendon integrity, NV | `MUST_EXCLUDE_DISTAL_TRICEPS_RUPTURE` | expedited assessment; X-ray/US/MRI as indicated |
| clinically important ulnar neuropathy인가? | ring/small finger numbness/tingling, worse with prolonged flexion, dropping objects, grip/finger coordination decline | sensory-only stable pattern → review/consider; new/progressive weakness or visible wasting → higher-priority review + neuro flag | ulnar sensory distribution, intrinsic strength, Froment/Wartenberg as appropriate, Tinel/cubital tunnel provocation, cervical screen, EMG/NCS if indicated | `ULNAR_NEUROPATHY_AT_ELBOW_CONSIDER` / severe progressive deficit → `MUST_EXCLUDE_PROGRESSIVE_ULNAR_NEUROPATHY` | activity/position modification may be considered after safety; severe deficit referral |
| lateral elbow tendinopathy pattern인가? | lateral pain + grip/lift/wrist extension load provocation, usually no major neuro deficit | normally CLEAR if safety screens negative | palpation common extensor origin, resisted wrist extension/middle finger/grip tests in context, cervical/radial nerve differential | `LATERAL_ELBOW_TENDINOPATHY_HIGHER_SUPPORT` or `CONSIDER` | progressive loading/strengthening candidate; no diagnosis from tablet alone |
| medial elbow tendinopathy / flexor-pronator pattern인가? | medial pain + gripping/wrist flexion/pronation load, no ulnar sensory pattern | normally CLEAR if safety screens negative | medial epicondyle/flexor-pronator palpation, resisted wrist flexion/pronation, UCL/ulnar nerve differentiation | `MEDIAL_FLEXOR_PRONATOR_PATTERN_CONSIDER` | load management + progressive strength candidate after clinician confirmation |
| radial tunnel / PIN differential인가? | proximal lateral forearm pain, load-related, possible weakness but sensory findings often atypical for radial tunnel | new objective motor deficit → review; otherwise differential | resisted supination/middle-finger extension only in context, radial/PIN motor exam, cervical screen | `RADIAL_TUNNEL_OR_PIN_CONSIDER` | avoid mislabeling all lateral elbow pain as tendinopathy |
| intra-articular mechanical pathology인가? | true catching/locking, fixed extension/flexion block, recurrent swelling, clicking with ROM loss | persistent true lock/fixed block → `REVIEW_REQUIRED`; not routine urgent absent trauma/NV/infection | ROM/end-feel, effusion, instability, radiographs; further MRI/CT as indicated | `INTRA_ARTICULAR_MECHANICAL_PATHOLOGY_CONSIDER` | chronic imaging escalation per ACR when appropriate |
| OA/degenerative contribution인가? | gradual stiffness, activity-related pain, ROM loss, prior trauma history | normally CLEAR if red flags absent | ROM, crepitus, radiographs when indicated | `ELBOW_DEGENERATIVE_PATTERN_CONSIDER` | symptom/function-guided management; imaging findings ≠ pain severity |
| cervical/proximal referred contribution인가? | neck/shoulder symptoms, pain spreading into arm/hand, multi-level sensory symptoms, elbow exam poorly reproduces complaint | progressive/bilateral neuro or myelopathic features handled by canonical Core/NECK pathways if present; otherwise review differential | cervical ROM/provocation, neuro screen, shoulder exam as indicated | `REFERRED_OR_PROXIMAL_SOURCE_CONSIDER` | do not force local elbow diagnosis |

---

# 6. Hypothesis contract

## MUST_EXCLUDE

```text
MUST_EXCLUDE_FRACTURE_DISLOCATION_OR_NEUROVASCULAR_INJURY
MUST_EXCLUDE_SEPTIC_ARTHRITIS
MUST_EXCLUDE_SEPTIC_OLECRANON_BURSITIS
MUST_EXCLUDE_DISTAL_BICEPS_RUPTURE
MUST_EXCLUDE_DISTAL_TRICEPS_RUPTURE
MUST_EXCLUDE_PROGRESSIVE_ULNAR_NEUROPATHY
```

## supportive / differential phenotypes

```text
LATERAL_ELBOW_TENDINOPATHY
MEDIAL_FLEXOR_PRONATOR_PATTERN
ULNAR_NEUROPATHY_AT_ELBOW
RADIAL_TUNNEL_OR_PIN
INTRA_ARTICULAR_MECHANICAL_PATHOLOGY
ELBOW_DEGENERATIVE_PATTERN
REFERRED_OR_PROXIMAL_SOURCE
```

상태는 기존 MSK 규격을 유지한다.

```text
HIGHER_SUPPORT
CONSIDER
LOWER_SUPPORT
MUST_EXCLUDE
```

### 금지
- Cozen/Mill/Maudsley 등 단일 provocation test = 확진
- Tinel positive = cubital tunnel 확진
- MRI tendinosis/tear = 현재 통증 원인 확정
- X-ray OA = 통증 severity 확정
- Tablet pattern = 수술 적응 확정

---

# 7. Patient tablet 최소 수집 원칙

Tablet은 진단을 만드는 장치가 아니라 **Patient Pre-processor**다.

ELBOW에서 환자가 잘 답할 수 있는 것만 수집한다.

- 정확한 부위: lateral / medial / posterior / anterior / diffuse
- onset: gradual / trauma / sudden heavy load
- swelling/redness/heat
- deformity / still-out feeling
- acute hand color/temperature/neurovascular change
- ring/small finger sensory pattern
- sudden flexion/supination weakness pattern
- sudden extension weakness pattern
- true locking/fixed ROM block
- grip/lift/push/pull/rotation-related aggravation
- key target function

Tablet에서 하지 않을 것:
- tendon palpation
- Hook test
- valgus stress
- Cozen/Mill/Maudsley
- Tinel grading
- objective strength grading
- distal pulse/perfusion confirmation
- diagnosis label 확정

---

# 8. Selective clinician exam candidate

## Base
- elbow AROM/PROM flexion-extension
- forearm pronation/supination
- target function reproduction
- gross swelling / location
- grip / functional load

## Acute trauma
- deformity
- focal bony tenderness
- distal neurovascular exam
- radiograph indication

## Distal biceps
- hook test when appropriate
- resisted supination/flexion
- tendon contour/gap

## Distal triceps
- active extension against gravity/resistance
- extensor lag / palpable defect

## Lateral elbow
- common extensor origin palpation
- resisted wrist extension / grip loading
- cervical/radial nerve differential

## Medial elbow
- flexor-pronator loading
- UCL assessment if clinically relevant
- ulnar nerve screen

## Cubital tunnel
- ulnar sensory distribution
- intrinsic hand strength/coordination
- provocative testing as adjunct only
- cervical/other entrapment differential

## Mechanical pathology
- ROM/end-feel
- effusion
- locking reproduction only when safe
- imaging escalation when indicated

---

# 9. Exercise / management evidence contract

## Lateral elbow pain
JOSPT 2022 CPG를 주된 framework로 사용한다.

원칙:
- diagnosis-to-exercise 자동 매핑 금지
- function + irritability + load response + strength + goal 기반
- progressive resistance/load management을 중심으로 후보 생성
- 원장 승인 후 최종 1–2개

후보 domain:
- wrist extensor loading
- grip capacity
- forearm pronation/supination control
- proximal/scapular contribution when clinically relevant
- work/sport-specific graded exposure

## Medial / tendon patterns
근거 수준이 lateral elbow CPG보다 낮으므로 lateral protocol을 그대로 복제하지 않는다.
임상 소견에 따라 flexor-pronator progressive loading을 `CONSIDER` 수준으로 사용한다.

## Cubital tunnel
position/activity modification, prolonged flexion/compression reduction, selected nerve mobility exercise는 clinician-side 후보로 두되 progressive weakness/atrophy가 있으면 exercise보다 nerve assessment/referral이 우선이다.

## Acute rupture / fracture / infection
routine exercise recommender lock.

---

# 10. Reassessment candidate

모든 재진:

```text
Pain NRS
Target Function 0–10
```

조건부:
- grip/load tolerance
- elbow ROM
- pronation/supination
- swelling
- locking episodes
- ulnar sensory symptoms
- hand weakness/dropping objects
- flexion/supination strength after biceps concern
- extension strength after triceps concern

Response:

```text
RESPONDING
PARTIAL_RESPONSE
NON_RESPONSE
DETERIORATION
DISCHARGE
```

`DETERIORATION` → safety / diagnosis / referral reassessment.

---

# 11. Opus clinical review — OPEN decisions

다음 단계는 Opus가 아래 항목만 임상적으로 닫는다.

### E1 — Infection tier
- hot/red/swollen elbow + systemic illness → `URGENT_REVIEW` 제안이 적절한가?
- localized posterior bursal inflammation without systemic illness는 `REVIEW_REQUIRED`로 충분한가?

### E2 — Acute trauma tier
- gross deformity / unreduced dislocation / acute distal NV deficit → `URGENT_REVIEW`
- trauma + marked functional loss/focal bony concern → `REVIEW_REQUIRED + fracture_imaging_consider`

### E3 — Distal biceps rupture
- sudden injury + abrupt supination/flexion weakness pattern → `REVIEW_REQUIRED + expedited_referral_consider`
- surgical timing relevance 때문에 일반 tendinopathy와 분리하는 것이 적절한가?

### E4 — Distal triceps rupture
- abrupt extension weakness after trauma → `REVIEW_REQUIRED + expedited_referral_consider`
- URGENT 자동승격은 하지 않는 것이 적절한가?

### E5 — Ulnar neuropathy
- sensory-only stable symptoms와 progressive weakness/atrophy를 분리할 것.
- progressive motor deficit은 `REVIEW_REQUIRED + neuro_assessment_required + expedited_referral_consider`까지 올릴지 결정.

### E6 — Mechanical lock
- true locking/fixed ROM block은 `REVIEW_REQUIRED`로 충분한가?
- trauma/infection/NV가 없으면 expedited flag까지 필요한가?

### E7 — Tendinopathy tablet scope
- lateral/medial pain은 location + load pattern까지만 묻고 구조진단은 clinician에 남기는 것이 적절한가?

### E8 — Referred pain
- ELBOW-specific 최소 referred screen을 만들지,
- 기존 Core `PAIN_04` + clinician cervical screen으로 충분히 처리할지 결정.

### E9 — arm_hand routing
- 현재 `PAIN_01 === arm_hand`는 elbow/wrist/hand가 섞여 있다.
- shared upper-limb discriminator를 만들고 ELBOW safety의 activation 범위를 확정해야 한다.
- 이 항목은 임상 safety와 UX architecture가 함께 걸리므로 Opus는 safety boundary만 판단하고, CLOSED 후 Fable이 repo integration 형태를 결정한다.

### E10 — fail-closed
- 모든 protected safety 질문에서 `UNKNOWN / missing / malformed`가 CLEAR를 만들지 않도록 유지.
- 그러나 optional phenotype 문항의 missing은 safety status를 올리지 않는다.

Opus 최종 출력:

```text
PASS / CLINICAL DECISIONS CLOSED
```

또는

```text
CLINICAL DECISION REQUIRED
```

CLOSED 전 Tablet Question Set 및 production code 구현 금지.

---

# 12. References

1. Lucado AM, Day JM, Vincent JI, et al. Lateral Elbow Pain and Muscle Function Impairments. J Orthop Sports Phys Ther. 2022;52(12):CPG1-CPG111. PMID 36453071. DOI 10.2519/jospt.2022.0302.
2. American College of Radiology. ACR Appropriateness Criteria: Acute Elbow and Forearm Pain. New topic released 2024.
3. Thomas JM, Chang EY, Ha AS, et al. ACR Appropriateness Criteria Chronic Elbow Pain. J Am Coll Radiol. 2022;19(11S):S256-S265. PMID 36436956. DOI 10.1016/j.jacr.2022.09.022.
4. Ravn C, Neyt J, Benito N, et al. Guideline for management of septic arthritis in native joints (SANJO). J Bone Jt Infect. 2023;8(1):29-37. PMID 36756304. DOI 10.5194/jbji-8-29-2023.
5. American Academy of Orthopaedic Surgeons / American Shoulder and Elbow Surgeons. Biceps Tendon Tear at the Elbow. OrthoInfo.
6. American Academy of Orthopaedic Surgeons / American Shoulder and Elbow Surgeons. Triceps Tendon Tear at the Elbow. OrthoInfo.
7. American Academy of Orthopaedic Surgeons / American Shoulder and Elbow Surgeons. Ulnar Nerve Entrapment at the Elbow (Cubital Tunnel Syndrome). OrthoInfo.
8. Kaur IP, Mughal MS, Aslam F, et al. Non-surgical treatment of aseptic olecranon bursitis: A systematic review. Reumatol Clin. 2023. PMID 37945181. DOI 10.1016/j.reumae.2023.05.004.
9. Sayegh ET, Strauch RJ. Treatment of olecranon bursitis: a systematic review. Arch Orthop Trauma Surg. 2014;134(11):1517-1536. PMID 25234151. DOI 10.1007/s00402-014-2088-3.
10. Alnaji O, Erdogan S, Shanmugaraj A, et al. The surgical management of distal triceps tendon ruptures: a systematic review. J Shoulder Elbow Surg. 2022;31(1):217-224. PMID 34343662. DOI 10.1016/j.jse.2021.06.019.

---

# 13. Current gate

```text
LBP_V1       PASS / FROZEN
NECK_V1      PASS / FROZEN
SHOULDER_V1  PASS / FROZEN
KNEE_V1      PASS / FROZEN

ELBOW Evidence Matrix v0.1    COMPLETE
Opus clinical review          REQUIRED
Tablet Question Set           NOT STARTED
Code implementation           NOT STARTED
```

다음 단일 과제:

> **Opus clinical review of ELBOW_V1 Evidence Matrix v0.1 — E1–E10 closure**
