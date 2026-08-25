# ANKLE_FOOT_V1 — Evidence Matrix v0.1 HANDOFF

작성일: 2026-08-25  
기준 main: `9e30da14da9694365a2a3aeba236b2ae1d0582c1`  
브랜치: `clinical/ankle-foot-v1-review`  
상태: **EVIDENCE DESIGN COMPLETE / CLINICAL DECISIONS OPEN**

> 목적: 삼인당 Clinical OS의 다음 MSK 패널인 `ANKLE_FOOT_V1`의 임상 안전경계, tablet 정보수집 범위, 가설 구조, clinician exam boundary를 근거 기반으로 정의한다. 이 문서는 구현 문서가 아니다. TypeScript/UI/test 구현은 임상결정이 CLOSED된 뒤에만 시작한다.

---

## 1. 실제 repo routing 제약

현재 `src/spec/coreSpec.ts`의 `PAIN_01`은 다음 지역을 제공한다.

- `neck_shoulder`
- `low_back_pelvis`
- `arm_hand`
- `leg_foot`
- `knee`
- `head_face_jaw`
- `chest_rib`
- `abdomen`
- `other`

`leg_foot`은 현재 별도 임상 패널이 연결되지 않은 가장 낮은 충돌 경로다. `knee`는 이미 독립 KNEE_V1으로 FROZEN이므로 ANKLE_FOOT_V1은 `knee` 경로를 건드리지 않는다.

`leg_foot`은 이름 그대로 하퇴·발목·발을 넓게 포함하므로, 발목/발 특이 문항을 모든 환자에게 무조건 적용하면 불필요한 질문과 routing 오류가 생길 수 있다. 따라서 v1 후보는 `PAIN_01 === 'leg_foot'` 아래에 **지역 discriminator 1개**를 두는 방식이다.

후보 `AF_00` 값:

- `LOWER_LEG_CALF`
- `ANKLE`
- `HEEL_POSTERIOR_ANKLE`
- `FOOT_TOES`
- `DIFFUSE_OR_MULTIPLE`
- `UNKNOWN`

원칙:

1. `AF_00`은 visibility/tagging용이다.
2. `AF_00` 값 자체만으로 `ankle_foot_safety_status`를 올리지 않는다.
3. LOWER_LEG_CALF를 제외해버리면 Achilles proximal symptom 및 DVT safety gap이 생길 수 있으므로 protected safety 범위는 넓게 잡는 후보가 안전하다.
4. `knee`는 기존 KNEE_V1의 SSOT이며 ANKLE_FOOT_V1이 중복해서 열지 않는다.

### A1 — Opus 결정 필요

**protected ANKLE_FOOT safety exposure를 `leg_foot + AF_00 모든 값`에 둘지**, 또는 일부 지역만 제한할지 확정한다.

현재 추천안: `PAIN_01 === leg_foot` + AF_00가 위 6개 유효값 중 하나이면 protected safety를 모두 노출한다. 세부 phenotype 문항만 지역별로 분기한다.

---

## 2. 핵심 근거원

### E1. ACR Appropriateness Criteria — Acute Trauma to the Ankle, Revised 2020

- 급성 ankle trauma에서 Ottawa Ankle Rules 적용 가능 환자가 rule-positive이면 ankle radiography가 `Usually Appropriate`.
- rule 요소에는 손상 직후 체중부하 불가, 4걸음 보행 불가, 특정 골성 압통이 포함된다.
- 골성 압통은 clinician examination에 해당하므로 tablet이 이를 객관적 양성 소견처럼 생성해서는 안 된다.
- Ottawa rule-negative는 정해진 적용 조건과 정상 신경학적 상태 등 전제가 필요하므로 tablet 단독 rule-out에 사용하면 안 된다.

Official ACR topic: `Acute Trauma to the Ankle` (Revised 2020).

### E2. ACR Appropriateness Criteria — Acute Trauma to the Foot, Revised 2019

- acute foot trauma에서 임상 시나리오별 radiography/CT/MRI/US의 적절성을 제시한다.
- Lisfranc injury, tendon rupture/dislocation, penetrating foreign body 등 일반적인 단순 염좌와 분리해야 하는 구조적 손상을 다룬다.
- acute tendon rupture는 MRI/US가 진단에 유용할 수 있으나 tablet이 tendon integrity를 확정해서는 안 된다.

Official ACR topic: `Acute Trauma to the Foot` (Revised 2019).

### E3. Martin et al. — Lateral Ankle Ligament Sprains CPG, JOSPT 2021

- Martin RL, Davenport TE, Fraser JJ, et al.
- `Ankle Stability and Movement Coordination Impairments: Lateral Ankle Ligament Sprains Revision 2021.`
- J Orthop Sports Phys Ther. 2021;51(4):CPG1-CPG80.
- PMID: `33789434`, DOI: `10.2519/jospt.2021.0302`.
- initial assessment에서 체중부하 능력, 체중부하 시 통증, ROM, balance, instability report, previous sprain 등을 임상경과 판단 요소로 고려한다.
- acute LAS와 chronic ankle instability는 구분하되, 환자 보고 instability 하나만으로 확진하지 않는다.

### E4. Koc et al. — Heel Pain / Plantar Fasciitis CPG Revision 2023

- `Heel Pain – Plantar Fasciitis: Revision 2023.`
- J Orthop Sports Phys Ther. 2023;53(12):CPG1-CPG39.
- DOI: `10.2519/jospt.2023.0303`.
- plantar heel pain의 진단·감별·검사·중재를 impairment/function 기반으로 다룬다.
- heel pain pattern은 supportive phenotype으로 사용 가능하나 tablet symptom pattern만으로 plantar fasciitis 확진 금지.

### E5. Chimenti et al. — Midportion Achilles Tendinopathy CPG Revision 2024

- Chimenti RL, Neville C, Houck J, et al.
- `Achilles Pain, Stiffness, and Muscle Power Deficits: Midportion Achilles Tendinopathy Revision – 2024.`
- J Orthop Sports Phys Ther. 2024;54(12):CPG1-CPG32.
- PMID: `39611662`, DOI: `10.2519/jospt.2024.0302`.
- localized symptoms provoked by tendon loading, focal palpation pain, tendon thickening 등이 임상 진단에 관여한다.
- palpation, calf raise endurance, hop/loading response는 clinician exam/function assessment 영역이다.
- tendon loading exercise는 적절한 환자에서 first-line 근거가 있으나 **rupture concern / safety non-CLEAR 상태에서는 routine exercise suggestion을 잠가야 한다.**

### E6. NICE NG19 — Diabetic foot problems

- `Diabetic foot problems: prevention and management`, NG19.
- NICE recommendation set은 2023 risk/Charcot 관련 업데이트를 포함하며 2025 surveillance review가 수행됨.
- active diabetic foot problem에는 ulceration, infection, chronic limb-threatening ischaemia, gangrene, acute Charcot suspicion 또는 설명되지 않는 hot/swollen/color-changed foot이 포함된다.
- acute Charcot는 통증이 없더라도 가능하며, diabetes + neuropathy/renal failure 맥락에서 redness/warmth/swelling/deformity가 중요하다.
- ulcer + sepsis, ulcer + limb ischaemia, deep infection concern, gangrene는 즉각적인 acute referral 대상이다.

### E7. NICE NG158 — Venous thromboembolic diseases

- `Venous thromboembolic diseases: diagnosis, management and thrombophilia testing`, NG158, updated 2023.
- swollen or painful leg이 DVT의 signs/symptoms가 될 수 있고, DVT 의심 시 **2-level Wells score는 medical history + physical examination을 통해 clinician이 계산**한다.
- tablet은 Wells score를 자동 계산하거나 DVT를 확진하지 않는다.
- chest pain, shortness of breath, haemoptysis 등 PE 증상은 기존 Core global safety와 연결해야 하며 ANKLE_FOOT에서 별도 중복 PE 진단기를 만들지 않는다.

### E8. SANJO 2023

- Ravn C, Neyt J, Benito N, et al.
- `Guideline for management of septic arthritis in native joints (SANJO).`
- J Bone Jt Infect. 2023;8(1):29-37.
- PMID: `36756304`, DOI: `10.5194/jbji-8-29-2023`.
- painful/inflamed joint with redness, heat, swelling, effusion/purulent drainage는 fever 유무와 관계없이 septic arthritis를 고려해야 한다.
- septic arthritis diagnosis는 aspiration/microbiology 등 clinician-directed investigation이 필요하다.

### E9. ACR — Chronic Ankle Pain

- chronic ankle pain에서 radiographs가 기초 영상이며, 의심되는 osteochondral lesion/degenerative disease/tendon or ligament pathology에 따라 MRI/CT/US 등이 후속 선택이 될 수 있다.
- 영상 finding과 pain source를 자동 동일시하지 않는다.

### E10. ACR — Chronic Foot Pain, Revised 2020

- chronic foot pain에서 원인이 다양하며, 임상 시나리오에 따라 radiography 및 advanced imaging이 달라진다.
- occult fracture, soft tissue, neurogenic/other causes를 한 가지 symptom label로 자동 확진하지 않는다.

---

## 3. ANKLE_FOOT_V1 임상 목표

패널 목적은 **질환명을 자동으로 맞히는 것**이 아니라 다음 순서로 위험을 누락하지 않고 원장 진찰 효율을 높이는 것이다.

**Core global safety → region routing → limb-threatening trauma/NV/open injury → fracture/Lisfranc concern → Achilles rupture concern → infection/diabetic-foot/Charcot concern → DVT concern → pain/load phenotype → clinician selective exam → hypotheses → management/exercise → reassessment**

Safety status 후보:

- `CLEAR`
- `REVIEW_REQUIRED`
- `URGENT_REVIEW`

Adjunct flags 후보:

- `fracture_imaging_consider`
- `expedited_referral_consider`
- `neurovascular_assessment_required`
- `achilles_rupture_assessment_required`
- `infection_assessment_required`
- `diabetic_foot_assessment_required`
- `dvt_assessment_required`

Flag는 safety tier가 아니다.

---

## 4. Scope

### v1 포함

- acute ankle/foot fracture or dislocation concern
- occult fracture concern after acute trauma
- Lisfranc/midfoot injury concern
- acute distal neurovascular compromise
- severe open injury / penetrating injury context
- acute Achilles rupture concern
- lateral ankle sprain / chronic ankle instability phenotype
- Achilles tendinopathy phenotype
- plantar heel pain phenotype
- chronic ankle/foot degenerative or osteochondral mechanical pattern
- diabetic foot infection/ischaemia/Charcot concern
- septic/inflammatory hot swollen ankle/foot alternative
- DVT concern when calf/lower-leg symptoms are present
- referred/proximal neurologic source as differential

### v1 제외

- pediatric fracture classification and pediatric-specific treatment algorithms
- exact fracture classification (Weber, Lauge-Hansen, Jones zone, Lisfranc classification, etc.)
- automatic Ottawa Ankle/Foot Rule score or rule-out
- automatic Wells score
- Achilles rupture grade/tear percentage
- tendon tear percentage
- diabetic ulcer severity classification automation
- injection/surgery indication automation
- postoperative rehabilitation protocol
- return-to-sport clearance automation

---

## 5. Safety Matrix

### S1. Gross deformity / unreduced dislocation / acute distal neurovascular change / major open injury

Patient-reported concrete candidates:

- ankle/foot looks clearly deformed or joint still out of place
- foot/toes newly cold, pale, blue, or markedly different in color after injury
- major new distal numbness plus inability to move foot/toes normally after injury
- uncontrolled heavy bleeding
- deep open wound with visible deep tissue/bone/tendon or severe contamination

Recommended tier: **URGENT_REVIEW** for any concrete positive.

Rationale: limb-threatening injury, dislocation, severe open injury, or acute NV compromise needs immediate assessment. Patient response is a safety interrupt, not an objective vascular or neurologic examination.

### A2 — Opus 결정 필요

`major new distal numbness/weakness`를 단독 URGENT로 둘지, `acute trauma + major deficit` 조건으로 둘지 확정한다. 현재 추천안은 **acute trauma context에서 concrete major deficit = URGENT**, non-traumatic progressive neurologic symptoms = REVIEW + expedited.

---

### S2. Acute fracture imaging concern / Ottawa boundary

Evidence boundary:

- Ottawa Ankle Rules에는 clinician palpation이 포함된다.
- Tablet은 `malleolar tenderness`를 객관적 O로 생성할 수 없다.
- weight-bearing difficulty는 patient report로 수집 가능하다.

Recommended tablet semantics:

- recent trauma + cannot bear weight / cannot take 4 steps → `REVIEW_REQUIRED + fracture_imaging_consider`
- patient-reported focal bony pain location can support review but does not equal OAR-positive.
- UNKNOWN/missing protected trauma follow-up is fail-closed.

### A3 — Opus 결정 필요

Patient-facing question을 `다친 직후 또는 지금 체중을 싣고 4걸음 걷기 어렵다`로 둘지, `다친 직후`와 `현재`를 분리할지 확정한다.

현재 추천안: 피로를 줄이기 위해 1문항 multi-choice 또는 single-choice로 수집하고, **OAR score 계산은 금지**.

---

### S3. Lisfranc / significant midfoot injury concern

High-yield history candidates:

- acute twisting/crush injury to midfoot
- marked midfoot swelling
- plantar/midfoot bruising reported by patient
- inability to bear weight/push off

Recommended tier:

- trauma + significant midfoot dysfunction → `REVIEW_REQUIRED + fracture_imaging_consider`
- gross deformity/NV/open injury가 있으면 S1 urgent가 우선.

Tablet은 `Lisfranc injury`를 확진하지 않는다.

### A4 — Opus 결정 필요

`plantar bruising`을 tablet supportive history로 받을지, 관찰 소견에 가까우므로 clinician exam로만 둘지 결정한다.

현재 추천안: 환자가 "발바닥 중간에 새로 멍이 들었다"를 인지할 수 있으므로 **S(환자보고)** 로 수집 가능하되 objective sign으로 쓰지 않는다.

---

### S4. Achilles rupture concern

High-yield patient history:

- sudden pop/snap at back of ankle or calf
- immediate loss of push-off / difficulty standing on toes after the event
- acute onset after jump/sprint/step or unexpected load

Recommended tier:

- concrete rupture pattern → `REVIEW_REQUIRED + achilles_rupture_assessment_required + expedited_referral_consider`
- **자동 URGENT 금지**, unless S1 limb-threatening criteria coexist.

Clinician exam:

- Thompson/Simmonds test
- palpable gap
- plantarflexion strength/function
- imaging if uncertainty/management requires

### A5 — Opus 결정 필요

`pop + push-off loss` 두 조건을 AND로 요구할지, 각 concrete finding 하나만으로 REVIEW를 만들지 확정한다.

현재 추천안: 안전 민감도를 위해 **sudden pop OR new marked push-off failure 중 하나라도 REVIEW**, 둘이 함께 있으면 stronger support. 자동 확진은 하지 않는다.

---

### S5. Infection / septic joint / diabetic foot / Charcot

Broad infection candidate response:

- `NONE`
- `LOCALIZED_STABLE_RED_HOT_SWOLLEN`
- `WOUND_OR_ULCER_WITH_LOCAL_INFECTION_CONCERN`
- `SYSTEMIC_OR_RAPIDLY_SPREADING`
- `UNKNOWN`

Recommended semantics:

- `SYSTEMIC_OR_RAPIDLY_SPREADING` → **URGENT_REVIEW + infection_assessment_required**
- localized stable hot/red/swollen → **REVIEW_REQUIRED + infection_assessment_required**
- wound/ulcer with diabetes or poor circulation context → at least REVIEW; fever/sepsis/ischaemia/deep infection/gangrene concern → URGENT.

Charcot candidate:

- diabetes/neuropathy/renal failure context + unexplained hot swollen color-changed foot, even if pain is modest → `REVIEW_REQUIRED + diabetic_foot_assessment_required`, with expedited specialty assessment consideration.

Important: `hot swollen foot` is not automatically infection; fracture, gout/inflammatory disease, Charcot and thrombosis are alternatives.

### A6 — Opus 결정 필요

Diabetic-foot/Charcot context를 module에서 직접 1문항으로 다시 물을지, 뒤 단계의 existing medical history를 final safety computation에 사용하고 urgent interrupt는 broad infection/ischemia screen으로 커버할지 결정한다.

현재 추천안: **중복 질문 최소화**를 위해 existing medical history의 diabetes/renal/neuropathy 정보를 final computation에 활용하고, module에는 current foot safety symptom만 묻는다. 단, 질문 단계 즉시 interrupt가 필요한 ischaemia/sepsis는 S1/S5 concrete symptom으로 잡는다.

---

### S6. DVT / PE boundary

NICE NG158에 따라 swollen/painful leg은 DVT 평가의 출발점이지만 Wells score는 clinician history + physical exam에 기반한다.

Recommended tablet semantics:

- new unilateral calf/lower-leg swelling or pain pattern → `REVIEW_REQUIRED + dvt_assessment_required`
- recent major surgery/immobility, previous DVT/PE, active cancer 등은 final clinician review를 강화하지만 tablet이 Wells 점수를 자동 계산하지 않는다.
- chest pain / dyspnea / haemoptysis / collapse pattern은 **Core global safety**를 사용한다. ANKLE_FOOT에 별도 PE score를 추가하지 않는다.

### A7 — Opus 결정 필요

단순 `new unilateral calf swelling/pain`만으로 REVIEW를 올릴지, risk modifier 하나 이상을 요구할지 확정한다.

현재 추천안: `leg_foot` route의 안전성을 위해 **new unilateral calf/leg swelling + pain/tenderness sensation 또는 marked asymmetry report**는 REVIEW; Wells는 clinician이 시행한다. Tablet이 DVT likely/unlikely를 만들지 않는다.

---

## 6. Fail-closed 계약 후보

Protected safety 문항은 다음 원칙을 따른다.

- `UNKNOWN != NO`
- missing != negative
- malformed != valid negative
- empty multi-select != `[NONE]`
- `[NONE, positive]` 또는 `[UNKNOWN, positive]` 혼합 = invalid
- protected invalid → 최소 `REVIEW_REQUIRED`
- optional phenotype missing → safety escalation 금지

단, 조건부 문항은 **실제로 shown일 때만** missing/empty가 fail-closed escalation을 만든다.

### A8 — Opus 결정 필요

ANKLE_FOOT에서도 WRIST_HAND과 동일하게 protected malformed/empty를 adapter 단계에서 runtime allowlist validation으로 normalize한 뒤 existing fail-closed path로 보낼지 확인한다.

현재 추천안: YES. 최근 WRIST_HAND에서 발견된 malformed single-choice fail-open 회귀를 구조적으로 반복하지 않는다.

---

## 7. Tablet 후보 문항 구조

아래는 **문항 ID 확정 전 concept set**이다. Opus closure 전 production enum으로 간주하지 않는다.

### Protected concepts

`AF_00` region discriminator

`AF_01` recent trauma / sudden event

`AF_02` deformity / acute NV / severe open injury multi-choice

`AF_03` post-trauma weight-bearing / 4-step difficulty

`AF_04` significant midfoot trauma/function concern

`AF_05` acute Achilles rupture symptom screen

`AF_06` current infection/hot-swollen/wound screen

`AF_07` acute ischaemia/gangrene concern if not fully covered by AF_02

`AF_08` unilateral calf/lower-leg swelling-pain DVT screen

### Optional phenotype concepts

`AF_09` repeated giving-way / prior ankle sprains

`AF_10` heel first-step / after-rest pain pattern

`AF_11` posterior ankle Achilles loading pain/stiffness pattern

`AF_12` pain location/load trigger

`AF_13` chronic mechanical catching/locking or osteochondral pattern

`AF_14` footwear/activity/training change context

Question design constraints:

- one concept per screen
- 3–6 choices where possible
- `잘 모르겠어요` available for protected safety
- objective palpation/test finding 질문 금지
- no diagnostic labels in patient-facing text
- duplicate Core history avoided where possible

---

## 8. Clinician selective exam matrix

Tablet signal은 `O`가 아니다. 다음은 clinician exam 후보이며 자동 전부 시행하지 않는다.

### Acute trauma / fracture concern

- inspect deformity/swelling/open wound
- distal pulses/perfusion/capillary refill/temperature as clinically indicated
- sensory/motor exam
- clinician bony tenderness exam
- Ottawa Ankle/Foot Rule only when applicability criteria are satisfied
- midfoot/Lisfranc-focused exam when indicated

### Achilles rupture concern

- Thompson/Simmonds
- palpable gap
- active plantarflexion/push-off function
- imaging only when clinically indicated

### Lateral ankle sprain / instability

- ROM including dorsiflexion
- ligament-specific exam at appropriate timing/irritability
- balance / functional movement
- previous sprain and giving-way history

### Plantar heel pain

- palpation/local symptom reproduction
- ankle dorsiflexion/foot mechanics as clinically useful
- neural/stress fracture/systemic differential if atypical

### DVT concern

- medical history + physical examination
- 2-level Wells score if DVT clinically suspected
- external diagnostic pathway per local medical standards; tablet does not calculate/diagnose

### Diabetic foot / Charcot / infection concern

- wound/skin/temperature/color
- perfusion
- neuropathy assessment
- infection/deep structure assessment
- urgent specialty/acute referral pathway when indicated

---

## 9. Hypothesis model

States:

- `MUST_EXCLUDE`
- `HIGHER_SUPPORT`
- `CONSIDER`
- `LOWER_SUPPORT`

### MUST_EXCLUDE candidates

- `MUST_EXCLUDE_FRACTURE_DISLOCATION_OR_NEUROVASCULAR_INJURY`
- `MUST_EXCLUDE_LISFRANC_OR_SIGNIFICANT_MIDFOOT_INJURY`
- `MUST_EXCLUDE_ACUTE_ACHILLES_RUPTURE`
- `MUST_EXCLUDE_DEEP_INFECTION_SEPTIC_OR_LIMB_THREATENING_DIABETIC_FOOT`
- `MUST_EXCLUDE_ACUTE_CHARCOT_IN_AT_RISK_PATIENT`
- `MUST_EXCLUDE_DVT_OR_VASCULAR_ALTERNATIVE`

### Supportive candidates

- `LATERAL_ANKLE_SPRAIN_PATTERN`
- `CHRONIC_ANKLE_INSTABILITY_PATTERN`
- `ACHILLES_TENDINOPATHY_PATTERN`
- `PLANTAR_HEEL_PAIN_PATTERN`
- `ANKLE_OA_OR_OSTEOCHONDRAL_MECHANICAL_PATTERN`
- `OTHER_FOOT_TENDON_LOAD_PATTERN`
- `REFERRED_OR_PROXIMAL_NEUROLOGIC_SOURCE`
- `INFLAMMATORY_OR_CRYSTAL_ARTHRITIS_CONSIDER`

No single symptom or provocative test creates a definitive diagnosis.

---

## 10. Exercise / management boundary

`ankle_foot_safety_status != CLEAR`

→ routine exercise/manual-treatment suggestion lock.

Safety CLEAR 이후에도:

- diagnosis label → exercise 자동매핑 금지
- input은 function + irritability + clinician exam/movement response + goal + safety
- OS는 2–3개 후보를 rank
- clinician approve/remove/replace
- 최종 1–2개
- reason / dose / regress / progress / acceptable response / stop-review 포함

Evidence-informed future examples:

- lateral ankle sprain/CAI: progressive loading, balance/sensorimotor work according to stage and function
- midportion Achilles tendinopathy: tendon-loading exercise after rupture/frailty concern excluded
- plantar heel pain: impairment/function-based loading and mobility strategy

이번 v1 evidence phase에서는 exercise engine 구현하지 않는다.

---

## 11. Sigma / chart boundary

Tablet patient response 사용 가능:

- `C/C | 주호소`
- `O/S | 발병 및 경과`
- `S | 주관적 소견`

`O | 객관적 소견`은 clinician-confirmed data만.

Patient response만으로 다음을 생성하지 않는다.

- pulse/perfusion normal/abnormal 확정
- capillary refill
- objective sensory/motor deficit
- tendon integrity
- Thompson test
- bony tenderness
- Ottawa rule positive/negative
- Wells score
- imaging finding
- definitive fracture/sprain/tendon rupture/DVT/infection diagnosis

---

## 12. Reassessment model

공통 response state:

- `RESPONDING`
- `PARTIAL_RESPONSE`
- `NON_RESPONSE`
- `DETERIORATION`
- `DISCHARGE`

`DETERIORATION` 시 반드시 safety/referral recheck.

ANKLE_FOOT 특이 reassessment 후보:

- weight-bearing/function trend
- swelling trajectory
- instability/giving-way
- push-off/calf function after clinician clearance
- walking tolerance
- patient-specific target function

---

## 13. Opus v0.1 결정 패킷

다음 8개만 먼저 닫으면 Tablet Question Set v0.1을 안전하게 설계할 수 있다.

### A1 Routing
Protected safety를 `leg_foot + AF_00 모든 유효값`에 노출할 것인가?

추천: YES. phenotype만 지역별 분기.

### A2 Acute major neurologic deficit
Acute trauma + major distal sensory/motor loss는 standalone URGENT인가?

추천: YES. non-traumatic progressive deficit는 REVIEW+expedited.

### A3 Ottawa boundary
Tablet weight-bearing report는 REVIEW/fracture flag에 사용하되 Ottawa score 자동화 금지할 것인가?

추천: YES.

### A4 Lisfranc
Patient-reported plantar/midfoot bruising은 S supportive history로 허용하되 objective sign으로 금지할 것인가?

추천: YES.

### A5 Achilles rupture
Sudden pop OR new marked push-off failure 하나만으로도 REVIEW+Achilles assessment+expedited를 만들 것인가?

추천: YES. 자동 urgent/diagnosis 금지.

### A6 Diabetic foot / Charcot history source
Current symptom은 module에서, diabetes/renal/neuropathy context는 existing history에서 가져와 final computation할 것인가?

추천: YES. 중복 질문 최소화.

### A7 DVT
New unilateral calf/lower-leg swelling-pain pattern만으로 REVIEW+dvt assessment를 만들고 Wells는 clinician-only로 둘 것인가?

추천: YES.

### A8 Fail-closed
Protected single-choice runtime allowlist validation + multi-choice strict exclusivity를 mandatory로 둘 것인가?

추천: YES.

---

## 14. Definition of Done — Evidence phase

- [x] actual main routing constraint 확인
- [x] current authoritative imaging/rehab/safety sources 수집
- [x] safety architecture draft
- [x] diagnostic automation boundary 명시
- [x] clinician exam boundary 명시
- [x] Sigma O boundary 명시
- [x] exercise lock boundary 명시
- [x] 8개 explicit clinical decisions packet 작성
- [ ] Opus v0.1 clinical review
- [ ] Tablet Question Set v0.1
- [ ] Opus closure
- [ ] Fable integration plan
- [ ] Sonnet implementation

**현재 판정: EVIDENCE DESIGN COMPLETE / CLINICAL DECISIONS OPEN**

Production implementation은 아직 금지한다.
