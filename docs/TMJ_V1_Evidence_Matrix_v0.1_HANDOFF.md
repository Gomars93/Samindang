# TMJ_V1 — Evidence Matrix v0.1 HANDOFF

작성일: 2026-08-25  
브랜치: `clinical/tmj-v1-review`  
상태: **EVIDENCE DESIGN COMPLETE / CLINICAL DECISION REQUIRED**

> 범위: 기존 `PAIN_01 == head_face_jaw` 집단 중 jaw/TMJ·저작근 증상을 안전하게 분기하기 위한 근거 설계. 이 문서는 production threshold를 닫지 않는다. 기존 LBP/NECK/SHOULDER/KNEE/ELBOW/WRIST_HAND CLOSED/FROZEN 결정은 변경하지 않는다.

---

## 1. Repo boundary / routing premise

현재 Core의 `PAIN_01`에는 `head_face_jaw` 하나만 있고, headache/face/jaw/TMJ/dental을 세분하는 downstream router는 없다. 따라서 TMJ_V1을 직접 `head_face_jaw` 전체에 진단 모듈처럼 적용하면 facial pain, dental infection, giant-cell arteritis(GCA), trigeminal neuralgia, oral malignancy 등 비-TMD 원인을 TMD로 오인할 위험이 있다.

최소 변경 원칙상 `HFJ_00` region/phenotype discriminator를 downstream에 두고, 그 값은 **visibility/tagging 전용**으로 사용한다. 제안값:

- JAW_TMJ_MASTICATORY
- HEADACHE_CRANIAL
- FACIAL_NEURALGIC
- DENTAL_OR_ORAL
- DIFFUSE_OR_MULTIPLE
- UNKNOWN

Protected facial/jaw safety는 `JAW_TMJ_MASTICATORY / FACIAL_NEURALGIC / DENTAL_OR_ORAL / DIFFUSE_OR_MULTIPLE / UNKNOWN`에 넓게 노출하고, `HFJ_00` 자체는 safety tier를 만들지 않는다. HEADACHE_CRANIAL은 향후 HEADACHE_V1 protected screen과 겹칠 가능성이 있어 임상 결정이 필요하다.

---

## 2. TMD diagnosis boundary

### NIDCR
NIDCR은 TMD를 30개 이상의 jaw joint/저작근 통증·기능장애군으로 설명하며, 통증 없는 clicking/popping은 흔하고 정상일 수 있어 치료가 필요하지 않다고 명시한다. TMD 진단은 병력과 head/neck/face/jaw 신체검사를 기반으로 하며, 단일 표준검사가 없고 다른 원인을 배제해야 한다.

Source: https://www.nidcr.nih.gov/health-info/tmd

### AAFP 2023 Rapid Evidence Review
TMD는 병력+신체검사 중심이며 CT/MRI는 진단이 불확실할 때 고려한다. common signs는 clinician physical examination 소견이다. 따라서 tablet answer만으로 `disc displacement`, `myofascial TMD`, `OA`, `internal derangement` 확진을 생성하면 안 된다.

Source: https://www.aafp.org/pubs/afp/issues/2023/0100/temporomandibular-disorders.html

### Safety implication
- jaw pain/clicking/locking = phenotype/supportive history
- painless click alone = safety escalation 금지
- patient report alone으로 objective malocclusion, crepitus, ROM, joint tenderness 생성 금지
- single provocative maneuver 또는 self-test = diagnosis 금지

---

## 3. Imaging boundary

ACR Appropriateness Criteria의 TMJ imaging variants는 임상 시나리오별 modality 선택을 구분한다. 영상 필요성은 suspected osseous/inflammatory/internal derangement 등 clinician formulation에 기반한다.

Source: https://acsearch.acr.org/docs/3195834/Narrative

Safety implication:
- prior dental/TMJ X-ray/MRI result는 patient-reported context only
- tablet이 imaging-negative를 근거로 protected review를 낮추면 안 됨
- imaging finding을 `O | 객관적 소견`으로 생성 금지

---

## 4. Acute trauma / dislocation / fracture boundary

Jaw/face trauma에서는 unreduced dislocation, major deformity/malocclusion, uncontrolled bleeding, airway compromise, major neurologic deficit, severe facial injury를 routine TMD로 처리하면 안 된다. NHS urgent dental guidance는 serious face/jaw injury, uncontrolled oral bleeding, severe swelling with breathing/eye compromise를 emergency level로 둔다.

Source: https://www.nhs.uk/nhs-services/dentists/how-to-find-an-nhs-dentist-in-an-emergency/

Design implication:
- acute significant jaw/facial trauma screen 필요
- `jaw currently stuck open/out of place` 또는 gross deformity after trauma는 URGENT 후보
- trauma + new bite change/marked functional loss는 최소 REVIEW 후보
- clinician-confirmed fracture/dislocation과 patient report를 분리

---

## 5. Dental infection / deep-space infection boundary

NHS dental abscess guidance는 facial/jaw swelling, fever, difficulty opening mouth를 abscess symptoms로 제시하고, breathing/speaking/swallowing difficulty, large oral swelling, painful/swollen eye, severe trismus는 emergency escalation 대상으로 둔다.

Sources:
- https://www.nhs.uk/conditions/dental-abscess/
- https://www.england.nhs.uk/long-read/clinical-guidance-unscheduled-urgent-and-non-urgent-dental-care/

Design implication:
- dental/oral infection screen은 TMD phenotype와 별도 protected domain
- airway/swallow/eye compromise 또는 spreading severe swelling/systemic severe illness = URGENT candidate
- localized tooth/gum infection pattern without airway compromise = REVIEW + dental_assessment_required candidate
- patient report만으로 abscess diagnosis 생성 금지

---

## 6. Giant cell arteritis boundary

NICE NG127는 atraumatic facial pain에서 scalp tenderness 또는 jaw claudication이 temporal arteritis를 시사하면 blood tests와 local suspected-GCA pathway를 따르도록 권고하며, 정상 ESR이 GCA를 배제하지 않는다고 명시한다. GCA는 untreated 시 permanent neurological/visual harm 위험이 있다.

Source: https://www.nice.org.uk/guidance/ng127/chapter/Recommendations-for-adults-aged-over-16

2024–2026 published cohorts/case literature도 jaw claudication, maxillary/orofacial pain, pain on mouth opening이 TMD/dental disease를 흉내낼 수 있음을 재확인한다.

Design implication:
- age ≥50 + new jaw claudication pattern은 단순 TMD supportive hypothesis로 흡수하면 안 됨
- visual loss/transient visual disturbance/diplopia와 결합 시 urgent pathway 후보
- age는 BIRTH data를 final computation에서 재사용 가능하나, module 도중 age가 아직 없을 수 있어 visibility 전략 결정 필요
- ESR/CRP를 patient tablet이 자동 해석하지 않음

---

## 7. Neurologic / malignancy facial-pain boundary

NICE NG127:
- facial pain + persistent facial numbness or abnormal neurological signs → urgent neuroimaging via suspected cancer pathway referral
- touch-triggered unilateral facial pain은 trigeminal-neuralgia phenotype이지만 refractory treatment 시 specialist referral

Source: https://www.nice.org.uk/guidance/ng127/chapter/Recommendations-for-adults-aged-over-16

NICE NG12 (updated 2026): unexplained oral ulcer >3 weeks, persistent unexplained neck lump, oral/lip lump 또는 red/red-white patch는 urgent/suspected-cancer referral criteria를 제공한다.

Source: https://www.nice.org.uk/guidance/ng12/chapter/Recommendations-organised-by-site-of-cancer

Design implication:
- persistent facial numbness/new neurologic deficit = protected REVIEW/expedited candidate
- oral lesion/lump history = non-TMD referral flag
- electric shock/light-touch-triggered pain은 supportive trigeminal-neuralgia pattern만; 확진 금지

---

## 8. Mechanical TMD phenotype boundary

NIDCR/AAFP가 지지하는 history domains:
- jaw joint or masticatory pain
- stiffness/limited movement/locking
- painful clicking/popping/grating
- chewing-related symptoms
- parafunction/clenching/grinding context
- face/neck referred pain

하지만 다음은 clinician exam 영역:
- measured opening ROM
- palpation tenderness
- objective crepitus
- malocclusion confirmation
- cranial nerve exam
- dental percussion/periodontal findings

Design implication:
- locking/limited opening은 severity/functional phenotype로 수집 가능
- closed-lock/open-lock diagnosis는 tablet answer alone 금지
- painless clicking alone은 no escalation

---

## 9. Suggested safety status architecture

Proposed status:
- `CLEAR`
- `REVIEW_REQUIRED`
- `URGENT_REVIEW`

Candidate clinician flags:
- `trauma_or_dislocation_assessment_required`
- `dental_or_oral_assessment_required`
- `infection_assessment_required`
- `neuro_assessment_required`
- `gca_assessment_required`
- `expedited_referral_consider`

Flags remain separate from safety tier.

---

## 10. Chart boundary

Tablet response 사용 가능:
- C/C | 주호소
- O/S | 발병 및 경과
- S | 주관적 소견

Patient response alone으로 생성 금지:
- O | 객관적 소견
- measured jaw ROM
- objective occlusion change
- cranial nerve deficit confirmation
- dental abscess confirmation
- temporal artery abnormality
- imaging finding
- definitive TMD subtype / trigeminal neuralgia / GCA / malignancy diagnosis

---

## 11. Evidence-to-decision gaps

임상적으로 닫아야 하는 항목은 별도 `TMJ_V1_Clinical_Decision_Packet_v0.1.md`의 T1–T8로 압축한다.

현재 상태:

**EVIDENCE DESIGN COMPLETE**  
**CLINICAL DECISION REQUIRED**
