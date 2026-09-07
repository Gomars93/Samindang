# NECK_V1 — Evidence Matrix v0.1

작성일: 2026-08-25  
상태: **DRAFT — Evidence Matrix complete / tablet question design not yet started**  
목적: Samindang Clinical OS `NECK_V1`의 임상 source-of-truth 초안

> 원칙: **Safety → Pain/Function → Arm/Neuro → Headache/Associated symptoms → Selective Exam → Hypothesis → Exercise/Management → Reassessment**
>
> 단일 검사 = 진단 확정 금지.  
> 환자 화면에 진단명/확률 노출 금지.  
> 운동은 질환명으로 고정하지 않고 **기능 + irritability + 검사반응 + 목표 + safety**로 선택한다.

---

# 1. Evidence base — 이번 패스에서 확인한 핵심

## Primary / guideline sources verified in this pass

1. **Blanpied PR, et al. Neck Pain: Revision 2017. J Orthop Sports Phys Ther. 2017;47(7):A1-A83.**
   - PMID: 28666405
   - DOI: 10.2519/jospt.2017.0302
   - Neck pain management CPG.
   - NECK_V1의 기본 clinical classification / exam / exercise framework의 중심 근거.

2. **ACR Appropriateness Criteria® Cervical Neck Pain or Cervical Radiculopathy. J Am Coll Radiol. 2019.**
   - PMID: 31054759
   - DOI: 10.1016/j.jacr.2019.02.023
   - 일반 비외상성 목통증에서 영상은 무조건 필요한 것이 아니며,
     새롭거나 악화되는 radiculopathy에서는 MRI가 적절할 수 있고,
     감염/암 의심에서는 contrast 포함 MRI가 고려됨.
   - Imaging / referral gate 근거.

## 반드시 freeze 전 primary-source 재검증할 근거

아래는 임상적으로 널리 사용되지만 이 초안 작성 패스에서는 full primary text를 재검증하지 못했으므로 **v1 freeze 전에 원문 확인 필수**:
- AO Spine / CSRS degenerative cervical myelopathy guideline
- IFOMPT cervical vascular pathology framework
- Cervical radiculopathy provocative test diagnostic-accuracy literature (Spurling / distraction / ULTT cluster)
- Cervicogenic headache / cervical flexion-rotation test diagnostic accuracy
- Canadian C-Spine Rule / NEXUS trauma criteria

따라서 아래 Matrix에서 해당 영역은 **보수적 safety design**으로만 사용하고, 세부 cutoff/LR/확률은 아직 시스템에 넣지 않는다.

---

# 2. NECK_V1 Safety Architecture

## 2-1. Disease safety state

`neck_safety_status`:
- `CLEAR`
- `REVIEW_REQUIRED`
- `URGENT_REVIEW`

**Fail-closed.**

아래는 절대 자동 CLEAR로 해석하지 않는다:
- UNKNOWN
- missing
- malformed
- mutually exclusive choice violation
- required safety question 미응답

## 2-2. Urgent / must-exclude domains

### A. Cervical myelopathy / cord involvement concern

**Patient-reportable discriminators**
- 최근 손이 눈에 띄게 서툴러짐: 단추 잠그기, 젓가락/필기, 물건을 자주 떨어뜨림
- 최근 걷기가 휘청거리거나 균형이 나빠짐
- 양쪽 팔/손 또는 팔+다리에 감각이상/힘빠짐
- 진행성 limb weakness
- 심한 경우 새 배뇨/배변 변화

**Output**
- 명확한 진행성 objective neurologic deficit 또는 강한 cord concern → `URGENT_REVIEW`
- 환자보고만으로 의심되지만 객관검사 전 → 최소 `REVIEW_REQUIRED`

**Clinician high-yield exam**
- gait / tandem gait
- upper + lower limb neurologic baseline
- reflex asymmetry / hyperreflexia
- Hoffmann
- Babinski
- clonus
- hand dexterity / grip-release 등 필요 시

**Rule**
- Hoffmann 하나로 myelopathy 확진 금지
- 여러 upper motor neuron finding + 기능변화 + 병력 조합으로 판단

### B. Fracture / significant trauma

**Patient-reportable**
- 최근 교통사고 / 낙상 / 직접충격 / 심한 외상
- 골다공증 / 장기 steroid / 고위험 context

**Output**
- 의미 있는 최근 trauma → `REVIEW_REQUIRED`
- 고위험 외상 + neurologic deficit 또는 임상적으로 불안정성 우려 → `URGENT_REVIEW` 가능, clinician decision

**Rule**
- 태블릿에서 Canadian C-Spine Rule 전체를 억지로 구현하지 않는다.
- 외상 환자는 **trauma branch → clinician structured assessment**로 넘긴다.

### C. Infection / malignancy / systemic pathology

**Patient-reportable**
- 기존 암 진단/치료
- 설명되지 않는 발열/오한 또는 최근 중증 감염
- 면역억제 상태/치료
- 최근 경추 수술·주사·침습적 시술
- 설명되지 않는 체중감소

**Output**
- YES / UNKNOWN → 최소 `REVIEW_REQUIRED`

### D. Vascular pathology concern

경추 manual treatment safety에서 **별도 핵심 gate**.

**Patient-reportable high-concern pattern**
- 평소와 다른 갑작스럽고 매우 심한 목통증 또는 두통
- 특히 명확한 근골격계 패턴으로 설명되지 않으면서 새로운 neurologic / visual / balance / cranial-nerve-like symptom 동반

**Output**
- vascular concern을 시사하는 atypical history → `REVIEW_REQUIRED` 이상
- acute focal neurologic deficit / stroke-like presentation → `URGENT_REVIEW`

**Rule**
- 전통적인 “5D/3N” 체크박스만으로 CLEAR 판정하지 않음
- provocative positional vascular test로 “안전 확인”하지 않음
- history + vascular risk + neurologic examination + 전체 임상맥락으로 판단
- 구체 criteria는 IFOMPT primary source 재검증 후 freeze

---

# 3. Treatment safety — disease safety와 분리

`neck_treatment_safety_status`:
- `CLEAR`
- `REVIEW_REQUIRED`

고려:
- 항응고/항혈소판제
- 골다공증
- 최근 수술
- 임신 관련 치료 선택
- 출혈위험
- 기타 추나/약침/침 시술 관련 contraindication

**Disease safety가 CLEAR여도 treatment safety는 REVIEW_REQUIRED일 수 있다.**

---

# 4. Evidence Matrix

| Clinical question | Patient-reportable discriminators | Safety / serious pathology | High-yield physical exam | Clinician hypothesis state | Supporting findings | Contradicting findings | Management / exercise direction | Reassessment |
|---|---|---|---|---|---|---|---|---|
| 단순 axial neck pain / mobility deficit인가? | 목 중심 통증, 특정 방향 회전/신전/굴곡 제한, 상지 원위증상 없음 | safety screen CLEAR 전제 | CROM + symptom response, 필요 시 segmental mobility, thoracic ROM | `MOBILITY_DEFICIT_CONSIDER` | 제한된 CROM, concordant local pain/stiffness | neuro deficit, progressive arm symptoms, cord/systemic signs | mobility + cervicoscapular endurance/strength, activity | NRS + target function + CROM/function |
| arm symptom이 cervical radicular pattern을 지지하는가? | 팔/손까지 내려가는 통증, 저림, 감각저하, 주관적 힘빠짐, 한쪽 우세 | progressive objective deficit / bilateral cord pattern이면 safety escalation | C5–T1 motor/sensory/reflex, Spurling, distraction, ULTT, cervical rotation | `RADICULAR_INVOLVEMENT_HIGHER_SUPPORT / CONSIDER / LOWER_SUPPORT` | neuroanatomic arm symptoms + concordant test cluster | 정상 neuro, 비경추성 shoulder/peripheral pattern | symptom-guided cervical/scapular exercise, neural mobility selected by response; traction은 복합치료 맥락에서만 고려 | arm extent + neuro + target function |
| cervical myelopathy concern이 있는가? | 손 서툼, gait imbalance, bilateral symptoms, limb weakness progression | **must exclude** | gait/tandem, UMN signs, UE/LE neuro exam | `MUST_EXCLUDE_CORD_INVOLVEMENT` | hand dexterity loss + gait/UMN pattern | isolated local pain, normal neuro/function | routine exercise/treatment recommender LOCK → medical evaluation | safety only |
| cervicogenic headache pattern인가? | 목통증과 함께 시작/악화되는 두통, 목 움직임과 연동, 일측 우세 가능 | sudden worst/new atypical headache이면 vascular/neurologic safety 우선 | CROM, upper cervical assessment, CFRT 후보, symptom reproduction | `CERVICOGENIC_HEADACHE_CONSIDER` | neck-related headache reproduction + ROM restriction | migraine-like/systemic/neurologic pattern | upper cervical/cervicothoracic mobility + cervicoscapular endurance selected by response | headache frequency/intensity + target function |
| movement coordination / endurance deficit가 중요한가? | 오래 앉기, 컴퓨터/운전 후 악화, 특정 자세 유지가 어려움, 반복 flare | safety CLEAR | deep neck flexor endurance/control, scapular endurance/control, functional posture tolerance | `MOVEMENT_COORDINATION_CONSIDER` | load/time dependent symptoms, poor endurance/control | strong neurologic/systemic pattern | graded endurance, cervical/scapulothoracic control, activity exposure | duration tolerance + target function |
| shoulder/peripheral nerve contribution인가? | 어깨 움직임과 통증 연동, 손 특정 distribution, 목 움직임과 무관 | neuro progression은 별도 safety | shoulder AROM/PROM/resisted, peripheral nerve exam as indicated | `NON_CERVICAL_CONTRIBUTION_CONSIDER` | shoulder/peripheral findings reproduce familiar symptom | neck movement/test cluster strongly concordant | 해당 domain 추가 평가; neck diagnosis로 억지 귀속 금지 | function |
| fracture/systemic/infection/malignancy 가능성이 있는가? | trauma, cancer, fever/infection, immune suppression, weight loss, recent procedure | `REVIEW_REQUIRED / URGENT_REVIEW` | focused neuro + medical assessment | `MUST_EXCLUDE_SPECIFIC_PATHOLOGY` | red-flag combination | isolated nonspecific pain only | routine pathway lock / referral consideration | safety only |
| vascular pathology concern이 있는가? | sudden unusual severe neck/head pain ± neuro/visual/balance symptoms | **urgent safety domain** | cranial/neuro/vascular-risk-oriented clinician assessment | `MUST_EXCLUDE_VASCULAR_PATHOLOGY` | atypical severe onset + neuro pattern | reproducible mechanical pattern alone does not fully rule out | manual treatment/exercise recommender lock pending review | safety only |

---

# 5. Selective Exam Engine v0.1

태블릿 결과에 따라 **검사를 많이 보여주는 것이 아니라 필요한 것만 추천**한다.

## Base — 거의 모든 uncomplicated NECK
- Cervical AROM
- Target-function reproduction

## Arm / hand symptoms
- C5–T1 motor
- dermatomal sensory
- biceps / brachioradialis / triceps reflex
- Spurling
- distraction
- ULTT appropriate nerve bias

## Myelopathy concern
- gait / tandem
- upper + lower extremity neuro
- reflex / UMN signs
- routine MSK recommender LOCK

## Headache
- cervical ROM
- upper cervical exam
- CFRT candidate
- headache safety first if atypical

## Shoulder-dominant presentation
- shoulder AROM/PROM
- resisted tests
- cervical vs shoulder symptom reproduction comparison

## Movement-coordination / sustained-posture pattern
- cervical endurance/control
- scapular control/endurance
- functional sitting/working tolerance

---

# 6. Hypothesis model

확률 사용 금지.

상태:
- `MUST_EXCLUDE`
- `HIGHER_SUPPORT`
- `CONSIDER`
- `LOWER_SUPPORT`

각 hypothesis는 반드시 저장:
- supporting findings
- contradicting findings
- need_to_exclude
- next_exam

초기 hypothesis 후보:

```text
MUST_EXCLUDE_CORD_INVOLVEMENT
MUST_EXCLUDE_VASCULAR_PATHOLOGY
MUST_EXCLUDE_SPECIFIC_PATHOLOGY

AXIAL_NECK_PAIN_MOBILITY_DEFICIT
RADICULAR_INVOLVEMENT
CERVICOGENIC_HEADACHE_PATTERN
MOVEMENT_COORDINATION_DEFICIT
SHOULDER_OR_PERIPHERAL_CONTRIBUTION
```

“disc”, “stenosis”, “facet” 같은 구조진단을 태블릿만으로 자동확정하지 않는다.

---

# 7. Exercise Library 연결 원칙

NECK_V1도 LBP와 동일:

**Clinical OS 추천 2–3개 → 원장 승인/삭제/교체 → 최종 1–2개**

## 선택 입력
- target function
- irritability
- CROM / movement response
- arm/neuro status
- headache response
- endurance/control
- patient goal
- safety

## Domain 후보
- cervical mobility
- thoracic mobility
- directional symptom response
- deep neck flexor control/endurance
- cervical extensor endurance
- scapular control/strength/endurance
- neural mobility
- graded exposure / work-posture tolerance
- aerobic/activity

## 금지
- “디스크니까 chin tuck”
- “일자목이니까 이 운동”
- “방사통이면 무조건 traction”
같은 diagnosis → exercise hardcoding.

---

# 8. Reassessment model

매 재진 최소:
1. Pain NRS
2. Target Function 0–10

조건부:
- arm symptom distal extent
- numbness/weakness change
- neuro baseline change
- headache frequency/intensity
- CROM/function

Response state:
- `RESPONDING`
- `PARTIAL_RESPONSE`
- `NON_RESPONSE`
- `DETERIORATION`
- `DISCHARGE`

`DETERIORATION` → safety / referral reassessment.

---

# 9. NECK_V1 태블릿에서 반드시 얻어야 할 정보 — 아직 문항화 전

Core에서 이미 받는 정보는 다시 묻지 않는다.

NECK module-specific minimum domains:
- neck vs arm symptom extent
- side
- paresthesia / numbness / subjective weakness
- hand dexterity change
- gait/balance change
- significant trauma
- systemic red flags
- sudden unusual severe neck/head pain + associated new neurologic features
- headache presence / neck-linked behavior
- sustained posture / movement behavior
- recurrence / chronicity extension as needed

목표:
**안전성을 잃지 않으면서 기본 NECK module을 짧게 유지하고, neuro/headache/safety branch만 조건부 확장.**

---

# 10. 임상적으로 아직 freeze하지 않을 항목

다음은 tablet question v0.1 전에 primary source를 더 확인한다.

1. myelopathy tablet trigger의 정확한 escalation threshold
2. vascular safety patient wording 및 urgent threshold
3. Spurling/distraction/ULTT cluster를 시스템이 어디까지 해석할지
4. CFRT의 정확한 적용 population/cutoff
5. trauma branch에서 Canadian C-Spine Rule을 clinician tool로 넣을지 여부
6. imaging/referral rule 최신 ACR revision 확인

따라서 현재 상태:

**NECK Evidence Architecture: COMPLETE v0.1**  
**Clinical thresholds: NOT FROZEN**  
**Tablet question set: NEXT**
