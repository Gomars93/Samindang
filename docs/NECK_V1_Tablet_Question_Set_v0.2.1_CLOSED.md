# NECK_V1 — Tablet Question Set v0.2.1

작성일: 2026-08-25
상태: **CLINICAL DECISIONS CLOSED — implementation may proceed**
상위 근거:
- `NECK_V1_Evidence_Matrix_v0.2_HANDOFF.md`
- `NECK_V1_Opus_Clinical_Review_v0.1.md`
- `NECK_V1_Tablet_Question_Set_v0.2_Clinical_Decisions_Closed.md`
- `NECK_V1_Opus_Clinical_Review_v0.2.md` (PASS — 조건부, erratum E1/E2)

이 개정은 v0.2에 Opus 재검수의 erratum **E1·E2만** 반영한다. 이 두 건은
새로운 임상판단이 아니라, 이미 CLOSED된 D7(N10A 신설)·D2(fail-closed
계층화)를 문서 자신의 invariant(`UNKNOWN != NO`)에 맞게 술어만 교정하는
기계적 수정이다. v0.2의 다른 어떤 내용도 변경하지 않는다.

- **CLINICAL DECISIONS CLOSED.**
- Fable 통합 계획 착수 가능.
- Sonnet 구현 시 이 문서의 semantics를 임의로 완화하거나 우회하지 않는다.

---

# 변경 이력: v0.2 → v0.2.1

## E1 — N10A 게이트를 `[YES, UNKNOWN]`으로 확대

**문제:** N10A(`neck_new_or_changed_headache`)는 안전 문항(`priority: critical /
safety`)이나, 게이트가 `neck_headache_present == YES`였다. N10 자체는
안전 엔진에 등장하지 않고 `UNKNOWN` 값을 가지므로, `N10 = UNKNOWN` →
N10A 미개방 → 나머지 safety가 모두 valid negative면 CLEAR로 새는 경로가
있었다. §5의 `UNKNOWN != NO` invariant를 게이트 층위에서 위반.

**수정:** §4 N10A `show_when`을 `neck_headache_present in [YES, UNKNOWN]`으로
변경. N11(phenotype 문항)은 그대로 `== YES` 유지 — N11은 안전 문항이
아니므로 확대할 필요가 없다.

## E2 — §5 URGENT_REVIEW의 N04 soft 조건에서 invalid escalation 역전 수정

**문제:** `N04 soft positive AND N03A in [YES, UNKNOWN]`은 리터럴 열거라서
N03A가 invalid/missing이면 조건을 만족하지 못해, UNKNOWN보다 정보가
더 나쁜 invalid 상태가 오히려 URGENT로 escalate하지 않는 순서 역전이
있었다. (CLEAR로 새지는 않음 — N03A invalid는 별도로 REVIEW_REQUIRED를
발생시킴. fail-open이 아니라 triage 등급 오류.)

**수정:** 조건을 부정형 술어로 재기술 — `N03A_is_valid_negative :=
(N03A == NO and N03A is valid)`, `URGENT if: N04 soft positive AND NOT
N03A_is_valid_negative`.

두 수정 모두 fatigue budget에 무시 가능한 수준의 영향만 준다
(§12 추정치 유지, 180s 예산 내).

---

# 0. Model Orchestration

## Opus — 임상·근거 검수
- CLOSED. 재검수 불필요(§ 위 erratum 근거).

## Fable — 장기 통합 감독
- 이제 시작 가능.
- 실제 repo 구조 파악, 최소 변경 통합, 회귀 감독.
- Core를 NECK 전용으로 재작성 금지.

## Sonnet — 구현 워커
- YAML / TS / Python / UI / test 구현.
- CLOSED clinical decision 변경 금지.
- safety semantics 완화 및 테스트 우회 금지.

```text
Evidence
→ Tablet design
→ Opus review
→ Clinical decisions CLOSED
→ Opus re-review PASS (erratum E1/E2)
→ v0.2.1 CLOSED
→ Fable integration lead
→ Sonnet implementation
→ regression
→ PASS / FROZEN
```

---

# 1. 설계 목표

NECK_V1은 Core에서 이미 확보한 다음 값을 재사용한다.

- `patient_age`
- `onset_bucket`
- `onset_pattern`
- `symptom_nrs`
- `target_function`
- `target_function_score`
- `medication_present`
- `medication_categories`
- `major_history_present`
- `major_history_categories`
- `pregnancy_status`

단, **Core의 generic negative를 경추 safety의 item-level negative로
확대해석하지 않는다.**

원칙:
> exact positive는 재사용할 수 있다.
> exact negative로 명시적으로 매핑되지 않는 항목은 다시 묻는다.

---

# 2. Patient-facing flow v0.2.1

```text
Core 완료
  ↓
NECK entry
  ↓
[Protected Safety — fatigue suppression 금지]
N01 Trauma
→ N02 Cord/current myelopathy symptoms
   → N02A course (positive일 때)
→ N03A Sudden unusual severe neck pain
→ N03B Thunderclap-like headache
→ N04 Acute neuro/vascular-associated symptoms (모든 환자)
→ N05 Systemic red flags (item-level Core reuse only)
  ↓
[Symptom phenotype]
N06 side
→ N07 distal extent
→ N08 arm side (조건부)
→ N09 arm/hand neuro symptoms
→ N10 headache
   → N10A new/changed headache (YES 또는 UNKNOWN일 때 — E1)
   → N11 neck-linked headache behavior (YES일 때만)
→ N12 sustained-posture behavior (Core onset_bucket == M3_PLUS)
  ↓
Doctor View + Suggested Exam
```

---

# 3. Protected Safety Questions

## N01. 최근 3개월 내 외상

**id:** `neck_recent_significant_trauma`
**priority:** critical / safety
**required:** true
**estimated_seconds:** 5

### 환자 문구
> 최근 3개월 이내 교통사고, 낙상(서서 넘어짐 포함), 또는 머리·목에 충격을 받은 적이 있나요?

### options
- `YES`
- `NO`
- `UNKNOWN`

### semantics
- YES → `REVIEW_REQUIRED`
- UNKNOWN / missing / malformed → `REVIEW_REQUIRED`
- NO → 다른 safety 결과에 따름

### age / osteoporosis modifier
- `patient_age >= 65` 또는 `major_history_categories contains OSTEOPOROSIS`인 경우,
  **낙상은 충격 강도와 무관하게 의미 있는 외상으로 취급**한다.
- 환자에게 "강한 충격" 여부를 판단시키지 않는다.
- 구현 note: 현재 stem은 이미 강도 무관하게 낙상을 수집하므로, 이
  modifier는 (a) Doctor View 표시, (b) stem이 향후 좁아질 경우의 가드
  역할이다. 중복 분기로 구현하지 않는다.

### evidence-use note
Canadian C-Spine Rule은 **응급실 외상환자의 영상촬영 결정규칙**으로
배경 근거일 뿐, 본 한의원 NECK module에서 CCR을 직접 구현하지 않는다.

---

## N02. 현재 존재하는 척수/다발성 신경증상

**id:** `neck_cord_concern_screen`
**type:** multi_select
**priority:** critical / safety
**required:** true
**estimated_seconds:** 10

### 환자 문구
> 다음 증상이 있나요? 최근 새로 생긴 것뿐 아니라, 이전부터 있었더라도 현재 있으면 모두 골라주세요.

### options
- `HAND_CLUMSINESS`
  - 손이 서툴러 단추 잠그기, 젓가락질, 글씨 쓰기 등이 어렵거나 물건을 자주 떨어뜨림
- `GAIT_BALANCE_CHANGE`
  - 걸을 때 휘청거리거나 균형 잡기가 어려움
- `BILATERAL_OR_MULTI_LIMB_NEURO`
  - 양쪽 팔·손 또는 팔과 다리에 동시에 저림·감각이상·힘빠짐이 있음
- `RAPIDLY_WORSENING_LIMB_WEAKNESS`
  - 팔이나 다리 힘이 빠르게 약해지고 있음
- `NEW_BLADDER_BOWEL_CHANGE`
  - 최근 소변·대변 조절에 뚜렷한 변화가 생김
  - **주의(NB1):** "최근" 한정어를 stem 전환과 무관하게 이 항목에만 보존한다.
    고령층의 만성 안정 배뇨증상을 척수병증 지표로 오탐하지 않기 위함.
- `NONE`
- `UNKNOWN`

### exclusivity
- `NONE` + positive 금지
- `NONE` + `UNKNOWN` 금지
- `UNKNOWN` + positive 금지
- 위반/empty/non-list/missing → invalid

### semantics
- `RAPIDLY_WORSENING_LIMB_WEAKNESS` → `URGENT_REVIEW`
- `NEW_BLADDER_BOWEL_CHANGE` → `URGENT_REVIEW`
- 다른 concrete positive → `REVIEW_REQUIRED`
- UNKNOWN / invalid / missing → `REVIEW_REQUIRED`
- valid `[NONE]`만 negative candidate

### derived
any concrete positive:
- `NEURO_BASELINE_REQUIRED = true`
- N02A open

---

## N02A. 척수/신경증상의 경과

**id:** `neck_cord_symptom_course`
**show_when:** N02 has any concrete positive
**priority:** critical / safety
**required_when_shown:** true
**estimated_seconds:** 5

### 환자 문구
> 방금 선택한 증상은 최근 어떻게 변하고 있나요?

### options
- `WORSENING` — 점점 심해지고 있음
- `STABLE` — 비슷하게 유지됨
- `IMPROVING` — 좋아지고 있음
- `UNKNOWN` — 잘 모르겠음

### semantics
- `WORSENING` → `URGENT_REVIEW`
- `STABLE` / `IMPROVING` / `UNKNOWN` → 최소 `REVIEW_REQUIRED`
- missing/malformed → `REVIEW_REQUIRED`

기존 N02에서 이미 urgent인 항목은 N02A 결과와 무관하게 urgent 유지.

---

## N03A. 갑작스럽고 평소와 다른 심한 목통증

**id:** `neck_sudden_unusual_severe_neck_pain`
**priority:** critical / safety
**required:** true
**estimated_seconds:** 6

### 환자 문구
> 이번 목 통증이 평소와 다르게 갑자기 매우 심하게 시작했나요?

### options
- `YES`
- `NO`
- `UNKNOWN`

### semantics
- YES → `REVIEW_REQUIRED`
- UNKNOWN / missing / malformed → `REVIEW_REQUIRED`
- NO → 다른 safety 결과에 따름

**목통증 단독 YES를 자동 URGENT로 올리지 않는다.**

---

## N03B. 갑작스럽게 최고강도에 도달한 심한 두통

**id:** `neck_thunderclap_headache_screen`
**priority:** critical / safety
**required:** true
**estimated_seconds:** 6

### 환자 문구
> 두통이 갑자기 시작해 아주 짧은 시간 안에 매우 심해졌거나, 평소와 전혀 다른 극심한 두통이 있었나요?

### options
- `YES`
- `NO`
- `UNKNOWN`

### semantics
- YES → `URGENT_REVIEW`
- UNKNOWN / missing / malformed → `REVIEW_REQUIRED`
- NO → 다른 safety 결과에 따름

### note
환자 화면에서 SAH·박리 등 진단명을 표시하지 않는다.

---

## N04. 새로 생긴 신경학적/혈관 관련 증상

**id:** `neck_vascular_associated_screen`
**type:** multi_select
**priority:** critical / safety
**required:** true
**estimated_seconds:** 10
**show_when:** ALWAYS

### 환자 문구
> 최근 다음 증상이 새로 생긴 적이 있나요? 해당되는 것을 모두 골라주세요.

### Hard neuro options
- `NEW_VISUAL_DISTURBANCE`
  - 물체가 둘로 보이거나 시야가 갑자기 이상해짐
- `NEW_SPEECH_OR_SWALLOWING_DIFFICULTY`
  - 말이 어눌해지거나 삼키기 어려워짐
- `NEW_FACE_OR_EYELID_CHANGE`
  - 얼굴 또는 한쪽 눈꺼풀에 갑작스러운 변화가 생김
- `NEW_ONE_SIDED_WEAKNESS_OR_NUMBNESS`
  - 몸 한쪽에 갑자기 힘빠짐이나 감각이상이 생김

### Soft options
- `NEW_SEVERE_BALANCE_OR_COORDINATION_CHANGE`
  - 갑자기 심하게 휘청거리거나 몸을 가누기 어려움
- `NEW_SEVERE_DIZZINESS_OR_FAINTNESS`
  - 이전과 다른 심한 어지럼 또는 쓰러질 것 같은 느낌이 생김

### negative
- `NONE`
- `UNKNOWN`

### semantics

**Hard neuro**
- 하나라도 concrete positive → N03A 값과 무관하게 `URGENT_REVIEW`

**Soft (E2 적용)**
- 헬퍼 술어: `N03A_is_valid_negative := (N03A == NO and N03A is valid)`
- soft positive AND NOT `N03A_is_valid_negative` → `URGENT_REVIEW`
  (N03A가 YES / UNKNOWN / invalid / missing인 모든 경우 포함)
- soft positive AND `N03A_is_valid_negative` → `REVIEW_REQUIRED`

**Invalid**
- UNKNOWN / missing / empty / malformed → `REVIEW_REQUIRED`
- NONE + positive / NONE + UNKNOWN → invalid → `REVIEW_REQUIRED`

### IFOMPT scope statement
본 문항은 IFOMPT framework의 **증상 축 일부만** 태블릿에서 수집한다.
심혈관 위험인자 축은 Core/EMR 및 원장 병력청취에서 별도로 평가하며,
**태블릿 단독으로 vascular risk를 배제하지 않는다.**

경추 positional vascular test로 safety CLEAR를 만들지 않는다.

---

## N05. Systemic red-flag screen

**id:** `neck_systemic_redflag_screen`
**priority:** critical / safety
**required:** true unless every item is satisfied by exact item-level source mapping
**estimated_seconds:** 10

### 환자 문구
> 다음 중 해당되는 내용이 있나요? 이미 정확히 확인된 항목은 다시 묻지 않을 수 있습니다.

### options
- `PRIOR_CANCER`
  - 암을 진단받거나 치료받은 적이 있음
- `FEVER_OR_RECENT_SERIOUS_INFECTION`
  - 원인 모를 발열·오한이 있거나 최근 심한 감염으로 치료받음
- `IMMUNOSUPPRESSION`
  - 면역을 크게 떨어뜨리는 질환 또는 치료가 있음
- `RECENT_CERVICAL_PROCEDURE_OR_SURGERY`
  - 최근 목 부위 수술·주사·침습적 시술을 받음
- `UNEXPLAINED_WEIGHT_LOSS`
  - 특별한 이유 없이 최근 체중이 눈에 띄게 감소함
- `NONE`
- `UNKNOWN`

### Core/EMR item-level reuse map

| NECK item | reuse 가능한 Core/EMR 정보 | positive reuse | negative reuse |
|---|---|---|---|
| `PRIOR_CANCER` | `major_history_categories` | `CANCER`가 명시된 경우 | **generic `major_history_present=없음`만으로는 불인정.** dedicated cancer negative가 있을 때만. **(NB3: `HISTORY_01=['none']`을 dedicated negative로 읽지 않는다.)** |
| `FEVER_OR_RECENT_SERIOUS_INFECTION` | 현재 Core에 exact mapping 없음 | exact dedicated source가 있으면 가능 | 없으면 반드시 질문 |
| `IMMUNOSUPPRESSION` | 현재 Core에 exact mapping 없음 | exact dedicated source가 있으면 가능 | 없으면 반드시 질문 |
| `RECENT_CERVICAL_PROCEDURE_OR_SURGERY` | `MAJOR_SURGERY`는 위치/시점이 불명확해 exact mapping 아님 | dedicated recent-cervical-procedure source만 가능 | 없으면 반드시 질문 |
| `UNEXPLAINED_WEIGHT_LOSS` | 현재 Core에 exact mapping 없음 | exact dedicated source가 있으면 가능 | 없으면 반드시 질문 |

### fail-closed adapter rule
- **명시적 item-level mapping이 없는 항목은 반드시 재질문**
- generic `HISTORY_01 = none`, `major_history_present = 없음`, `MAJOR_SURGERY` 등을
  N05 전체의 explicit negative로 확대해석하지 않는다.
- 일부만 exact mapping되면 나머지 항목만 표시한다.
- exact positive가 이미 있으면 해당 항목은 safety positive로 소비하고 중복질문하지 않아도 된다.

### semantics
- any positive → `REVIEW_REQUIRED`
- UNKNOWN / missing / invalid when required → `REVIEW_REQUIRED`
- 모든 required item이 valid negative일 때만 CLEAR 후보

---

# 4. Symptom phenotype

## N06. 주된 위치/측성

**id:** `neck_primary_side`
**estimated_seconds:** 5

> 목은 어느 쪽이 더 불편한가요?

- `LEFT`
- `RIGHT`
- `BILATERAL`
- `MIDLINE`
- `UNKNOWN`

---

## N07. 증상이 내려가는 가장 먼 범위

**id:** `neck_distal_extent`
**estimated_seconds:** 7

> 목에서 이어지거나 함께 느껴지는 통증·불편감이 있다면 가장 멀리 어디까지 내려가나요?

- `NECK_ONLY`
- `SHOULDER_UPPER_ARM`
- `FOREARM`
- `HAND_FINGERS`
- `UNKNOWN`

explicit enum membership만 사용. ordinal comparison 금지.

---

## N08. 팔 증상 측성

**id:** `neck_arm_symptom_side`
**show_when:** `neck_distal_extent in [SHOULDER_UPPER_ARM, FOREARM, HAND_FINGERS]`
**estimated_seconds:** 5

- `LEFT`
- `RIGHT`
- `BILATERAL`
- `UNKNOWN`

---

## N09. 팔/손 신경증상

**id:** `neck_arm_neuro_symptoms`
**type:** multi_select
**estimated_seconds:** 8

### 환자 문구
> 목에서 이어지는 것이든 따로 생긴 것이든, 팔이나 손에 다음 증상이 있나요?

- `PARESTHESIA` — 찌릿하거나 저림
- `NUMBNESS` — 감각이 둔하거나 무딤
- `SUBJECTIVE_WEAKNESS` — 힘이 빠지는 느낌
- `NONE`
- `UNKNOWN`

### semantics
- patient-reported weakness != objective motor deficit
- concrete positive → `NEURO_BASELINE_REQUIRED = true`
- UNKNOWN → neuro involvement를 NO로 내리지 않음

### radicular support
- `FOREARM/HAND_FINGERS` + concrete neuro symptom
  → `HIGHER_SUPPORT`
- `SHOULDER_UPPER_ARM` + concrete neuro symptom
  → `CONSIDER`
- `FOREARM/HAND_FINGERS` + `NONE`
  → `CONSIDER`
- `NECK_ONLY` + `NONE`
  → `LOWER_SUPPORT`
- UNKNOWN이 핵심 입력에 존재
  → 확정상태 금지 / Doctor View에 미확정으로 표시 (NB5: prose-conditional
    flag 대신 명시적 상태값 사용)

### 구현 note (NB2)
위 규칙은 (N07 × N09) 전 조합에 대한 전사(total) 매핑이 아니다. 예:
`NECK_ONLY + concrete neuro`, `SHOULDER_UPPER_ARM + NONE`은 미정의.
안전 엔진은 이 값을 소비하지 않으므로(안전 영향 없음), 구현 시 전 조합을
덮는 매핑표로 보완 권고. 미정의 조합은 Doctor View에 명시적 "미분류"로
표시하고 임의 추정하지 않는다.

---

## N10. 두통 동반

**id:** `neck_headache_present`
**estimated_seconds:** 5

> 목이 불편할 때 두통도 같이 생기거나 심해지나요?

- `YES`
- `NO`
- `UNKNOWN`

---

## N10A. 새로 생기거나 양상이 달라진 두통

**id:** `neck_new_or_changed_headache`
**show_when:** `neck_headache_present in [YES, UNKNOWN]` **← E1 (v0.2에서 `== YES`였음)**
**priority:** critical / safety
**required_when_shown:** true
**estimated_seconds:** 5

### 환자 문구
> 이 두통이 최근 새로 생겼거나, 평소 두통과 양상이 뚜렷이 달라졌나요?

- `YES`
- `NO`
- `UNKNOWN`

### semantics
- YES → `REVIEW_REQUIRED`
- UNKNOWN / missing / malformed → `REVIEW_REQUIRED`
- NO → 다른 safety 결과에 따름

N03B thunderclap YES이면 이미 URGENT.

### E1 rationale
N10A는 안전 문항이나 v0.2에서는 N10(비-safety, `UNKNOWN` 값 보유)의
`== YES`에만 게이트되어 있었다. `N10 = UNKNOWN` 경로에서 N10A가 열리지
않고도 나머지 safety가 모두 valid negative면 CLEAR에 도달할 수 있었다
(`UNKNOWN != NO` invariant 위반). 게이트를 `[YES, UNKNOWN]`으로 확대해
이 경로를 닫는다. N11은 phenotype 문항이라 `== YES` 그대로 유지.

---

## N11. 목 움직임과 두통의 연관

**id:** `neck_headache_neck_link`
**show_when:** `neck_headache_present == YES`
**estimated_seconds:** 5

> 목을 움직이거나 오래 같은 자세를 유지하면 두통도 함께 변하나요?

- `YES`
- `NO`
- `UNKNOWN`

YES:
→ `CERVICOGENIC_HEADACHE_PATTERN = CONSIDER`

CFRT는 clinician-side.
태블릿만으로 cervicogenic headache 확정 금지.

---

## N12. 지속자세 민감도

**id:** `neck_sustained_posture_aggravation`
**show_when:** `onset_bucket == M3_PLUS`
**estimated_seconds:** 6

> 오래 앉기, 컴퓨터, 운전처럼 같은 자세를 유지할 때 목이 더 불편해지나요?

- `YES`
- `NO`
- `UNKNOWN`

YES:
→ `MOVEMENT_COORDINATION_DEFICIT = CONSIDER`

### binding note
현재 Core의 `onset_bucket` 공식 enum:
- `D0_3`
- `D4_14`
- `W2_M3`
- `M3_PLUS`
- `UNKNOWN`

v0.2.1에서 "chronic/recurrent condition from Core" 같은 prose condition은
사용하지 않는다. 재발성(recurrent)은 향후 exact producer가 생기면 별도
extension으로 추가.

---

# 5. Disease Safety Engine v0.2.1

`neck_safety_status`:
- `CLEAR`
- `REVIEW_REQUIRED`
- `URGENT_REVIEW`

## Helper predicate (E2)

```
N03A_is_valid_negative := (N03A == NO and N03A is valid)
```

## URGENT_REVIEW

다음 중 하나:
- N02 includes `RAPIDLY_WORSENING_LIMB_WEAKNESS`
- N02 includes `NEW_BLADDER_BOWEL_CHANGE`
- N02A == `WORSENING`
- N03B == `YES`
- N04 hard-neuro concrete positive
- N04 soft positive AND NOT `N03A_is_valid_negative` **(E2 — v0.2에서는
  `N03A in [YES, UNKNOWN]`으로 되어 있어 N03A invalid/missing이 escalate
  하지 않는 순서 역전이 있었음)**

## REVIEW_REQUIRED

urgent가 아니면서 다음 중 하나:
- N01 YES / UNKNOWN / invalid
- N02 other concrete positive
- N02 UNKNOWN / invalid
- N02A STABLE / IMPROVING / UNKNOWN / invalid
- N03A YES / UNKNOWN / invalid
- N03B UNKNOWN / invalid
- N04 soft positive with `N03A_is_valid_negative`
- N04 UNKNOWN / invalid
- N05 any positive / UNKNOWN / required-item missing/invalid
- N10A YES / UNKNOWN / invalid

## CLEAR

다음이 모두 충족될 때만:
- 모든 required safety field가 valid
- conditional safety field가 열렸다면 valid
- urgent/review condition 없음
- Core/EMR reuse는 item-level exact mapping contract를 통과

## invariant
- missing != NO
- UNKNOWN != NO
- empty multi-select != NONE
- malformed != NONE
- NONE + positive = invalid
- NONE + UNKNOWN = invalid
- invalid → 최소 REVIEW_REQUIRED

---

# 6. Treatment Safety v0.2.1

`neck_treatment_safety_status`:
- `CLEAR`
- `REVIEW_REQUIRED`

Disease safety와 완전히 분리.

소비 대상:
- 항응고/항혈소판 관련 정보
- 골다공증
- 최근 수술/시술
- 임신/임신 가능성
- 출혈질환/출혈위험
- 기타 경추 HVLA/추나/견인/침·약침 contraindication-relevant context

## fail-closed invariant
§5와 동일한 원칙 적용.

- required treatment-safety input missing → `REVIEW_REQUIRED`
- UNKNOWN → `REVIEW_REQUIRED`
- malformed → `REVIEW_REQUIRED`
- applicable domain에 explicit negative가 없으면 자동 CLEAR 금지
- N/A는 명시적 `NOT_APPLICABLE` 또는 clinically defined skip만 허용

## Core reuse examples
- `medication_present == "없음"` → anticoag-medication domain negative candidate
- `medication_present == "있음"` + valid `medication_categories`:
  - `ANTICOAG` → treatment review
  - `UNKNOWN` → treatment review
  - valid categories without `ANTICOAG` → medication-domain negative candidate
- `major_history_categories contains OSTEOPOROSIS` → treatment review
- `major_history_categories contains BLEEDING` → treatment review
- `major_history_categories contains MAJOR_SURGERY`는 위치/시점 불명확하므로
  경추 조작 관련 recent-surgery clearance로 자동 사용하지 않음
- pregnancy는 Core의 이미 확정된 pregnancy gate semantics를 소비

---

# 7. Intervention Locks

## Disease safety lock

`neck_safety_status != CLEAR`이면:
- routine exercise recommendation lock
- 경추 HVLA / 고속저진폭 조작 제안 lock
- 경추 추나 조작 제안 lock
- 경추 견인 제안 lock
- Doctor View에서 safety review를 최우선 표시

`URGENT_REVIEW`이면:
- 원장 safety review 완료 전 **모든 경추 도수 개입 제안 lock**
- routine MSK pathway를 진행상태로 표시하지 않음

## Treatment safety lock

`neck_treatment_safety_status != CLEAR`이면:
- contraindication-sensitive intervention의 자동 제안/확정 lock
- 경추 manipulation / traction / 침습적 치료는 clinician review 전 자동확정 금지

### 원칙
운동 lock과 manipulation/traction lock은 서로 독립.
**조작 lock이 운동 lock보다 임상적으로 우선한다.**

---

# 8. Suggested Exam Selector v0.2.1

## uncomplicated neck
- Cervical AROM
- Target-function reproduction

## distal arm / neuro
**발화 조건 (NB6):** N07 in `[FOREARM, HAND_FINGERS]` 또는 N09에 concrete
neuro positive 존재.
- C5–T1 motor
- dermatomal sensory
- biceps / brachioradialis / triceps reflex
- Spurling
- distraction
- ULNT as clinically appropriate

단일 provocative test로 diagnosis confirmed 금지.

## cord concern
**발화 조건:** N02 concrete positive 또는 N02A == `WORSENING`.
- gait / tandem gait
- UE + LE motor/sensory
- reflex / hyperreflexia
- Hoffmann
- Babinski / clonus as indicated
- hand dexterity

## headache
**발화 조건:** N10 == `YES`.
- cervical ROM
- upper cervical exam
- CFRT candidate

## shoulder-dominant
**발화 조건:** N07 == `SHOULDER_UPPER_ARM` 이면서 N09 == `[NONE]`.
- shoulder AROM/PROM/resisted
- cervical vs shoulder symptom reproduction

## sustained posture
**발화 조건:** N12 == `YES`.
- deep neck flexor control/endurance
- scapular control/endurance
- functional posture tolerance

Safety != CLEAR이면 routine selector보다 safety evaluation 우선.

---

# 9. Doctor View — 한글 기반

```text
[목 요약]

통증 NRS {nrs} / 목표 기능 {target_function_score}/10
주된 위치 {neck_primary_side}
증상 범위 {neck_distal_extent}

팔/손
{arm_side}
저림 {paresthesia}
감각저하 {numbness}
주관적 힘빠짐 {subjective_weakness}
방사통 지지도 {radicular_support}

안전 확인
질환 안전: {neck_safety_status}
치료 안전: {neck_treatment_safety_status}

척수/신경
{cord_concern_summary}
경과 {cord_course}

외상
{trauma_summary}

혈관/급성 신경
{vascular_summary}

전신 red flag
{systemic_summary}

두통
{headache_summary}
신규/변화 {new_changed_headache}

현재 고려
- {hypothesis_1}
- {hypothesis_2}

추가 권장 검사
- {selected_exam_1}
- {selected_exam_2}
```

내부 field/enum은 영어 ASCII 유지.

---

# 10. Sigma note mapping

```text
C/C | 주호소
목 통증 및 주요 기능제한.

O/S | 발병 및 경과
Core onset/course.

S | 주관적 소견
NRS / 측성 / 팔·손 증상 / 두통 / 목표기능.

O | 객관적 소견
원장이 실제 시행한 CROM / neuro / provocative / functional exam만.

A | 평가
clinician hypothesis + supporting / contradicting findings.

P | 계획
치료 / 운동 / 재평가 / 필요 시 추가검사·의뢰.
```

태블릿 응답만으로 `O`를 생성하지 않는다.

---

# 11. Exercise Handoff

입력:
- Target Function
- irritability
- CROM / movement response
- arm/neuro
- headache
- endurance/control
- goal
- disease safety
- treatment safety

출력:
**후보 2–3개 → 원장 승인/삭제/교체 → 최종 1–2개**

Safety lock이 걸려 있으면 추천 엔진보다 safety review 우선.

v1 구현 범위: **fail-closed lock만** (LBP_V1과 동일한 판단 — 순위화된
운동 추천 자체는 v2 범위). Safety != CLEAR 또는 treatment safety !=
CLEAR이면 routine exercise recommendation을 hide/disable한다.

---

# 12. Question burden — 최종 추정치 (v0.2.1)

Opus v0.2 재검수에서 확인된 estimated impact (E1·E2 반영 후에도 유효):

- N04 unconditional: 기존 skip path에 +10s
- N03 split: +6s
- N02A conditional: +5s when N02 positive
- N10A conditional: +5s when N10 in [YES, UNKNOWN] (E1로 UNKNOWN 부분집합 추가,
  영향 무시 가능)

Opus 추정:
- module max deterministic path: 약 **98s**
- module P90: 약 **85s**
- Core + NECK P90: 약 **155s**
- question count P90: 약 **13**
- 180s fatigue budget 내 수용 가능

주의:
- 이는 Opus review의 설계 추정치이며 실제 repo telemetry가 아님.
- safety-critical question은 fatigue suppression 금지.
- 구현 전 또는 구현 시 synthetic simulation 재실행 권고.
- 이 앱(samindang-questionnaire)에는 어떤 모듈에도 응답시간 시뮬레이션
  인프라가 없다 (LBP_V1 통합 보고서에서 이미 확인됨). NECK_V1도 동일하게
  이 항목은 repo-side 검증 없이 설계 추정치로만 freeze한다.

---

# 13. Evidence → Claim Mapping

| Evidence | 본 문서에서 지지하는 범위 | 사용 제한 |
|---|---|---|
| Blanpied 2017 Neck Pain CPG | 일반 neck classification / exam / exercise framework | serious pathology 세부 cutoff의 단독 근거로 사용하지 않음 |
| Fehlings 2017 DCM CPG | DCM suspicion / timely referral framework | 환자 자가보고 한 항목만으로 DCM 확진 금지 |
| Jiang 2024 DCM signs SR | §8 clinician-side UMN/physical exam | N02 patient self-report item의 직접 근거로 인용 금지 |
| IFOMPT 2020 | §3 N04의 vascular **symptom-axis** 및 manual-therapy risk framework | tablet은 risk-factor axis 전체를 구현하지 않음; positional test clearance 금지 |
| Lin 2025 Spurling SR | §8 radicular clinician exam | Spurling 단독 확진 금지 |
| 2026 cervical radiculopathy diagnostic SR | §8 provocative/neurologic exam | low-certainty 영역은 hypothesis support로만 |
| Rubio-Ochoa 2016 | cervicogenic headache clinician exam | tablet diagnosis 확정 금지 |
| 2022 CGH SR/meta-analysis | CFRT clinician-side candidate | CFRT 단독 확진 금지 |
| ACR Cervical Pain/Radiculopathy | downstream imaging/referral context | 본 tablet이 영상검사 자체를 자동 처방하지 않음 |
| Stiell 2001 Canadian C-Spine Rule | trauma background | 외래/한의원 NECK module에 CCR 직접 구현 금지 |

---

# 14. D1–D11 Resolution Log

| ID | 결정 |
|---|---|
| D1 | **수용** — N02 current-state stem + N02A course 추가 |
| D2 | **수용** — N04 unconditional + hard/soft 계층화 |
| D3 | **수용** — neck pain(N03A)과 thunderclap-like headache(N03B) 분리 |
| D4 | **수용** — IFOMPT symptom-axis only라고 명시 |
| D5 | **수용** — 3개월 trauma window + ground-level fall 포함 + age/osteoporosis modifier |
| D6 | **수용** — distal pain without neuro = CONSIDER, N09 wording 수정 |
| D7 | **수용** — N10A new/changed headache 추가 |
| D8 | **수용** — cervical HVLA/chuna/traction lock 명문화 |
| D9 | **수용** — N05 item-level mapping table + fail-closed; N12 `onset_bucket == M3_PLUS` |
| D10 | **수용** — treatment safety fail-closed invariant |
| D11 | **수용** — evidence-to-claim mapping |

## v0.2 → v0.2.1 Erratum Log

| ID | 유형 | 결정 |
|---|---|---|
| E1 | fail-open 게이트 수정 | **수용** — N10A `show_when`을 `[YES, UNKNOWN]`으로 확대 |
| E2 | triage 순서 역전 수정 | **수용** — N04 soft URGENT 조건을 `NOT N03A_is_valid_negative`로 재기술 |

**Clinical decisions: CLOSED.** Opus 재검수 PASS (조건부 — E1/E2 본 문서에
반영 완료로 조건 충족). 새 임상판단 없이 v0.2 CLOSED 상태를 그대로
계승한다.

---

# 15. 다음 단계

1. ~~Opus re-review~~ — **완료, PASS**
2. ~~E1/E2 반영~~ — **완료 (본 문서)**
3. **CLINICAL DECISIONS CLOSED 확정** — 본 문서로 확정
4. **Fable — repo 통합 계획** (다음 작업)
5. **Sonnet — 구현 + 회귀**
6. **PASS / FROZEN**
