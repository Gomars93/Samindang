# KNEE_V1 — Tablet Question Set v0.1

작성일: 2026-08-25  
상태: **DRAFT — Opus v0.1 decisions incorporated / Opus re-review required before CLOSED**  
대상: 삼인당 Clinical OS — MSK Knee module

상위 근거:
- `KNEE_V1_Evidence_Matrix_v0.1_HANDOFF.md`
- `KNEE_V1_Opus_Clinical_Review_v0.1.md`

이 문서는 Opus 검수의 K1–K9, C1–C2를 Tablet 문항과 safety semantics로 옮긴 v0.1 초안이다.

---

# 0. Model Orchestration

## Opus — 임상·근거 재검수
이번 단계의 책임:
- K2/K5/K9/C1이 실제 문항과 safety engine에 정확히 반영됐는지 확인
- 신규 fail-open 경로 확인
- UNKNOWN / missing / malformed 처리 확인
- DVT 문항이 double-barreled 함정을 만들지 않았는지 확인
- 결과: `PASS / CLINICAL DECISION REQUIRED`

## Fable — 통합 리드
**Opus PASS 및 CLINICAL DECISIONS CLOSED 후에만**
- 실제 repo audit
- `PAIN_01 === 'knee'` routing
- Core `SAFETY_01`과 KNEE targeted safety의 중복 최소화
- LBP/NECK/SHOULDER 회귀 0
- module boundary 유지

## Sonnet — 구현 워커
- TypeScript/UI/adapter/tests
- CLOSED semantics literal port
- safety threshold 독자 변경 금지

```text
Evidence Matrix
→ Opus review
→ Tablet Question Set v0.1
→ Opus re-review
→ Clinical decisions CLOSED
→ Fable integration
→ Sonnet implementation
→ full regression
→ KNEE_V1: PASS / FROZEN
```

---

# 1. Entry / Core Reuse Contract

현재 실제 repo의 pain location은 `PAIN_01.primary_location`의 `knee` 값으로 분기한다.

```text
IS_PRIMARY_KNEE =
  primary concern == pain
  AND PAIN_01 == 'knee'
```

기존 Core에서 이미 수집되는 정보는 다시 묻지 않는다.

재사용:
- `VISIT_03_SYMPTOM_DURATION` — 발병/지속기간
- `VISIT_04_SYMPTOM_IMPACT` — 일상 영향
- `PAIN_02` — 통증 양상
- `PAIN_04` — 방사/퍼짐
- `SAFETY_01` — 전역 응급 red flag

### protected-safety invariant
KNEE safety 문항(KNEE_01–08)은 phenotype 답변이나 구조가설에 의해 숨겨지지 않는다. 명시된 safety follow-up만 직전 safety 답변의 `YES / UNKNOWN`에 조건부 표시할 수 있다.

---

# 2. Safety Status / Flags

`knee_safety_status`: `CLEAR / REVIEW_REQUIRED / URGENT_REVIEW`

별도 clinician-facing flags:
- `expedited_referral_consider`
- `fracture_imaging_consider`
- `dvt_assessment_required`

별도 flag는 4번째 safety status가 아니다.

---

# 3. Protected Safety Questions

## KNEE_01 — 최근 외상 또는 갑작스러운 강한 부하

**variable:** `knee_recent_trauma_or_sudden_load`  
**required:** true / **show_when:** `IS_PRIMARY_KNEE`

> 최근 3개월 이내 넘어지거나 부딪히거나 무릎이 크게 비틀렸거나, 갑자기 강하게 힘을 준 뒤 증상이 시작되거나 뚜렷하게 심해졌나요?

- `YES`
- `NO`
- `UNKNOWN`

Semantics:
- YES → KNEE_03 / KNEE_04 / KNEE_15 표시
- UNKNOWN → 위 follow-up 표시 + 최소 REVIEW_REQUIRED
- missing/malformed → 최소 REVIEW_REQUIRED
- 외상 자체만으로 URGENT_REVIEW는 아님

## KNEE_02 — 현재 변형 / 신경혈관 응급

**variable:** `knee_deformity_neurovascular_screen`  
**input:** multi_choice / **required:** true  
**exclusive:** `['NONE','UNKNOWN']`

> 지금 무릎이나 다리에 다음 변화가 있나요?

- `GROSS_DEFORMITY_OR_STILL_OUT` — 무릎 모양이 확연히 달라졌거나 빠진 채 제자리로 돌아오지 않은 느낌
- `COLD_PALE_BLUE_FOOT` — 발이나 발목이 갑자기 매우 차갑거나 창백·푸르게 변함
- `MAJOR_NEW_DISTAL_NEURO_CHANGE` — 발·다리 감각이나 힘이 갑자기 크게 떨어짐
- `NONE`
- `UNKNOWN`

Semantics:
- concrete positive → URGENT_REVIEW
- UNKNOWN/missing/malformed → REVIEW_REQUIRED
- hypothesis: `MUST_EXCLUDE_FRACTURE_OR_NEUROVASCULAR_INJURY`

## KNEE_02A — 자연정복 무릎 탈구 discriminator (K2 필수)

**variable:** `knee_spontaneously_reduced_dislocation_screen`  
**required:** true / **show_when:** `IS_PRIMARY_KNEE`

> 무릎이 크게 틀어지거나 빠진 느낌이 들었다가 저절로 제자리로 돌아온 적이 있나요?

- `YES`
- `NO`
- `UNKNOWN`

Semantics:
- YES → **URGENT_REVIEW**
- UNKNOWN → REVIEW_REQUIRED
- 현재 외형/맥박 정상만으로 YES를 무효화하지 않음
- hypothesis: `MUST_EXCLUDE_FRACTURE_OR_NEUROVASCULAR_INJURY`

## KNEE_03 — 외상 후 체중부하 곤란 / 골절 평가 필요성

**variable:** `knee_post_trauma_weight_bearing_failure`  
**show_when:** `KNEE_01 in [YES,UNKNOWN]`

> 외상이나 갑작스러운 손상 이후, 서거나 걷기 위해 무릎에 체중을 싣기가 매우 어렵나요?

- `YES` → REVIEW_REQUIRED + `fracture_imaging_consider=true`
- `UNKNOWN` → REVIEW_REQUIRED
- `NO` → 다른 safety 결과에 따름

focal bony tenderness와 영상 필요성은 clinician-side. Tablet이 Ottawa/Pittsburgh rule을 자체 계산하지 않는다.

## KNEE_04 — extensor mechanism rupture concern

**variable:** `knee_extensor_mechanism_concern`  
**show_when:** `KNEE_01 in [YES,UNKNOWN]`

> 손상 이후, 무릎을 스스로 끝까지 펴거나 다리를 편 채 들어 올리기가 갑자기 현저히 어려워졌나요?

- YES/UNKNOWN → REVIEW_REQUIRED + `expedited_referral_consider=true`
- YES → `MUST_EXCLUDE_EXTENSOR_MECHANISM_RUPTURE`
- **URGENT_REVIEW로 자동 승격하지 않음**

원장 확인: straight-leg raise, active extension/extensor lag, tendon defect, patellar position.

## KNEE_05 — true locked knee screen

**variable:** `knee_true_locked_extension_block`  
**required:** true

> 단순히 아파서 펴기 어려운 것이 아니라, 무릎이 실제로 걸린 느낌 때문에 끝까지 펴지지 않나요?

- YES/UNKNOWN → REVIEW_REQUIRED + `expedited_referral_consider=true`
- YES → `MUST_EXCLUDE_DISPLACED_MENISCAL_PATHOLOGY`
- **URGENT_REVIEW로 자동 승격하지 않음**

---

# 4. DVT / PE Safety — K5 반영

## KNEE_06 — 편측 다리/종아리 증상

**variable:** `knee_unilateral_leg_dvt_symptom_screen`  
**required:** true

> 한쪽 종아리나 다리가 평소와 다르게 새로 붓거나 아픈가요?

- YES/UNKNOWN → KNEE_06A + KNEE_06B
- NO → follow-up 생략

v0.1 보수적 제안:
- YES/UNKNOWN → 최소 REVIEW_REQUIRED
- 이 symptom-alone REVIEW는 Opus 재검수에서 최종 calibration 확인

## KNEE_06A — DVT risk context

**variable:** `knee_dvt_risk_context`  
**input:** multi_choice / **exclusive:** `['NONE','UNKNOWN']`  
**show_when:** `KNEE_06 in [YES,UNKNOWN]`

> 최근 다음에 해당되는 내용이 있나요?

- `RECENT_SURGERY_HOSPITALIZATION_OR_IMMOBILITY`
- `PRIOR_DVT_OR_PE`
- `ACTIVE_CANCER`
- `PREGNANCY_PUERPERIUM_OR_HORMONAL_CONTEXT`
- `NONE`
- `UNKNOWN`

Semantics:
- KNEE_06 YES + concrete risk → REVIEW_REQUIRED + `dvt_assessment_required=true`
- KNEE_06 YES + UNKNOWN/invalid risk → REVIEW_REQUIRED + dvt flag
- KNEE_06 UNKNOWN + positive/UNKNOWN risk → REVIEW_REQUIRED + dvt flag
- Wells score는 Tablet에서 계산하지 않고 clinician-side 유지
- hypothesis: `MUST_EXCLUDE_DVT`

## KNEE_06B — PE-type chest/respiratory cross-check

**variable:** `knee_dvt_pe_associated_screen`  
**input:** multi_choice / **exclusive:** `['NONE','UNKNOWN']`  
**show_when:** `KNEE_06 in [YES,UNKNOWN] AND Core general_red not already urgent`

> 이 다리 증상과 함께 최근 다음 증상이 있었나요?

- `CHEST_PAIN_OR_TIGHTNESS` — 가슴 통증이나 답답함
- `SHORTNESS_OF_BREATH` — 숨이 차거나 숨쉬기 어려움
- `HEMOPTYSIS` — 피가 섞인 기침
- `NONE`
- `UNKNOWN`

Semantics:
- any concrete positive → **URGENT_REVIEW**
- UNKNOWN/missing/malformed → REVIEW_REQUIRED

### C2 — double-barreled 금지
안전 gate에 “움직임과 무관할 때만”, “휴식 중일 때만”, “통증이 심할 때만” 같은 별도 AND 전제를 추가하지 않는다. PE-type 동반증상 존재 여부 하나만 본다. Core `SAFETY_01.chest_breathing`이 이미 urgent면 중복 질문 생략 가능.

---

# 5. Septic Knee Safety — K1 반영

## KNEE_07 — acute hot swollen septic pattern

**variable:** `knee_septic_joint_emergency_screen`  
**required:** true

> 무릎이 붉거나 뜨겁게 붓고 심하게 아프면서, 열·오한 또는 몸 상태가 매우 좋지 않은 증상이 함께 있나요?

- YES → **URGENT_REVIEW** + `MUST_EXCLUDE_SEPTIC_ARTHRITIS`
- UNKNOWN/missing/malformed → REVIEW_REQUIRED
- NO → 다른 safety 결과

---

# 6. Referred / Non-knee Safety — K9 반영

## KNEE_08 — KNEE-specific minimal referred red-flag screen

**variable:** `knee_referred_non_knee_redflag_screen`  
**input:** multi_choice / **required:** true  
**exclusive:** `['NONE','UNKNOWN']`

> 이 무릎 증상과 함께 엉덩이·허리·다리에 최근 새로 생긴 변화가 있나요?

- `NEW_SENSORY_CHANGE` — 새로 생긴 저림·감각 둔화/이상감각
- `NEW_WEAKNESS` — 새로 생긴 뚜렷한 힘빠짐
- `NEW_BLADDER_BOWEL_CONTROL_CHANGE` — 새로 생긴 소변·대변 조절 변화
- `NONE`
- `UNKNOWN`

Semantics:
- any concrete positive → REVIEW_REQUIRED
- UNKNOWN/missing/malformed → REVIEW_REQUIRED
- hypothesis: `MUST_EXCLUDE_SYSTEMIC_OR_REFERRED_PATHOLOGY`

Architecture:
- LBP engine을 억지로 호출하지 않음
- KNEE_V1 독립 최소 screen 유지
- 장기적인 shared referred-pain hub는 v1 범위 밖

---

# 7. Phenotype Questions

Safety 이후 아래 정보는 diagnosis가 아니라 hypothesis support로만 사용한다.

## KNEE_09 — 측성
`knee_primary_side`: LEFT / RIGHT / BILATERAL / UNKNOWN

## KNEE_10 — 주된 통증 위치
`knee_pain_location_pattern`: ANTERIOR / MEDIAL / LATERAL / POSTERIOR / DIFFUSE / UNKNOWN

위치는 support 정보일 뿐 구조진단이 아니다.

## KNEE_11 — 부하/활동 패턴

**input:** multi_choice / **exclusive:** `['NONE','UNKNOWN']`

> 어떤 활동에서 무릎이 더 불편한가요?

- `WALKING_OR_STANDING`
- `STAIRS`
- `SQUAT_OR_CHAIR_RISE`
- `RUNNING_OR_JUMPING`
- `PROLONGED_SITTING`
- `NONE`
- `UNKNOWN`

사용:
- activity-related pain → OA support 가능
- anterior pain + stairs/squat/run/jump/prolonged sitting → PFP support 가능
- jump/run + focal tendon-compatible clinician finding → patellar tendon support 가능
- 단독 문항으로 diagnosis 확정 금지

## KNEE_12 — morning stiffness

> 아침에 일어나 처음 움직일 때 무릎이 뻣뻣하다면 보통 얼마나 지속되나요?

- `NONE`
- `UP_TO_30_MIN`
- `OVER_30_MIN`
- `UNKNOWN`

K6 calibration: age>=45 + activity-related pain + NONE/UP_TO_30_MIN + compatible course + no alternative safety pattern → OA HIGHER_SUPPORT 후보일 뿐 자동확진 아님.

## KNEE_13 — giving-way / instability

> 걷거나 방향을 바꿀 때 무릎이 휘청하거나 빠질 것 같은 느낌이 반복되나요?

YES/NO/UNKNOWN. YES는 ligament/instability CONSIDER일 뿐 특정 인대 확진 금지.

## KNEE_14 — patellar instability history

> 무릎 앞쪽 뼈(슬개골)가 옆으로 빠지거나 밀린 적이 있나요?

YES/NO/UNKNOWN. YES → `PATELLAR_INSTABILITY_CONSIDER`. acute unreduced/gross deformity는 KNEE_02 safety가 우선.

## KNEE_15 — rapid traumatic swelling

**show_when:** `KNEE_01 in [YES,UNKNOWN]`

> 손상 뒤 비교적 빠르게 무릎이 눈에 띄게 부었나요?

YES/NO/UNKNOWN. YES는 significant intra-articular injury support 상승 가능하나 effusion 하나로 ACL/meniscus 등 구조 특정 금지.

---

# 8. Clinician Objective Exam — Tablet에서 생성하지 않음

Base:
- target function reproduction
- gait / weight-bearing
- active/passive flexion-extension
- extension deficit
- effusion
- strength/function

Safety-selective:
- fracture/dislocation/NV: deformity, bony tenderness, distal NV, radiograph indication
- extensor: SLR, active extension/extensor lag, tendon defect, patellar position
- meniscus/lock: true mechanical block, joint-line tenderness, McMurray, Thessaly when safe/tolerable
- ligament: Lachman, pivot shift when appropriate, valgus/varus, posterior drawer/sag as indicated
- PF: squat/step-down/stair reproduction, patellar apprehension/mobility, knee/hip strength and movement strategy

---

# 9. Hypothesis Contract — C1 포함

MUST_EXCLUDE:
```text
MUST_EXCLUDE_SEPTIC_ARTHRITIS
MUST_EXCLUDE_FRACTURE_OR_NEUROVASCULAR_INJURY
MUST_EXCLUDE_EXTENSOR_MECHANISM_RUPTURE
MUST_EXCLUDE_DISPLACED_MENISCAL_PATHOLOGY
MUST_EXCLUDE_DVT
MUST_EXCLUDE_SYSTEMIC_OR_REFERRED_PATHOLOGY
```

Supportive phenotypes:
```text
KNEE_OA_PATTERN
PATELLOFEMORAL_PAIN
PATELLAR_TENDINOPATHY
ACUTE_MENISCAL_INJURY
DEGENERATIVE_MENISCAL_CONTRIBUTION
LIGAMENT_INJURY
PATELLAR_INSTABILITY
```

금지:
- special test 1개 = 확진
- MRI tear = 통증 원인 확정
- X-ray OA grade = 통증/기능 severity
- patient tablet만으로 수술 적응 결정

---

# 10. C1 Evidence Matrix Row — 추가

| Clinical question | Patient discriminators | Safety | Clinician exam | Hypothesis | Management |
|---|---|---|---|---|---|
| Major trauma / fracture / dislocation / neurovascular injury인가? | recent trauma/sudden load, gross deformity, weight-bearing failure, spontaneous reduction history, distal cold/pale/neuro change | deformity/NV/spontaneous-reduction positive → URGENT; trauma+WB failure → REVIEW + imaging consideration | bony tenderness, distal NV exam, deformity, radiograph indication, multiligament assessment after urgent pathology excluded | `MUST_EXCLUDE_FRACTURE_OR_NEUROVASCULAR_INJURY` | routine knee pathway lock pending safety assessment |

---

# 11. Knee Safety Engine v0.1

## URGENT_REVIEW
1. Core global safety already urgent
2. KNEE_02 concrete positive
3. KNEE_02A == YES
4. KNEE_06B any concrete positive
5. KNEE_07 == YES

## REVIEW_REQUIRED
urgent가 아니면서:
- any required safety answer missing/malformed
- KNEE_01 UNKNOWN
- KNEE_02 UNKNOWN/invalid
- KNEE_02A UNKNOWN/invalid
- KNEE_03 YES/UNKNOWN/invalid when shown
- KNEE_04 YES/UNKNOWN/invalid when shown
- KNEE_05 YES/UNKNOWN/invalid
- KNEE_06 YES/UNKNOWN/invalid — **v0.1 proposed calibration, Opus 재검수 대상**
- KNEE_06A UNKNOWN/invalid when shown
- KNEE_06B UNKNOWN/invalid when shown
- KNEE_07 UNKNOWN/invalid
- KNEE_08 concrete positive/UNKNOWN/invalid

## CLEAR
모든 required safety source가 valid하고 URGENT/REVIEW 조건이 없을 때만.

fail-closed:
- missing != NO
- UNKNOWN != NO
- malformed != NONE
- empty multi-select != NONE
- NONE + positive = invalid
- UNKNOWN + positive = invalid
- invalid → 최소 REVIEW_REQUIRED

---

# 12. Flags

`expedited_referral_consider=true`:
- KNEE_04 YES/UNKNOWN
- KNEE_05 YES/UNKNOWN
- clinician objective exam에서 extensor rupture 또는 true mechanical lock concern 확인

`fracture_imaging_consider=true`:
- KNEE_03 YES
- clinician exam에서 focal bony concern

`dvt_assessment_required=true`:
- KNEE_06 YES + KNEE_06A concrete risk
- KNEE_06 YES + KNEE_06A UNKNOWN/invalid
- KNEE_06 UNKNOWN + KNEE_06A positive/UNKNOWN

Wells는 clinician-side.

---

# 13. Intervention / Exercise Lock

`knee_safety_status != CLEAR`:
- routine exercise recommendation lock
- routine manual-treatment suggestion lock
- safety review 우선

`URGENT_REVIEW`:
- routine knee pathway보다 직원/원장 즉시 확인 우선

`expedited_referral_consider`는 URGENT로 자동변환하지 않는다.
`dvt_assessment_required`는 DVT clinical assessment/Wells 확인 전 routine lower-limb rehab 제안을 잠근다.

---

# 14. Doctor View

```text
[무릎 요약]

주된 쪽 {knee_primary_side}

Core
발병/경과 {VISIT_03_SYMPTOM_DURATION}
일상영향 {VISIT_04_SYMPTOM_IMPACT}
통증양상 {PAIN_02}
방사/퍼짐 {PAIN_04}

안전
질환 안전 {knee_safety_status}
신속 의뢰 고려 {expedited_referral_consider}
골절/영상 평가 고려 {fracture_imaging_consider}
DVT 평가 필요 {dvt_assessment_required}

외상/혈관 {trauma_summary} {spontaneous_reduction_summary} {neurovascular_summary}
응급·감염 {septic_summary}
DVT/PE {dvt_summary}
비무릎 기여 {referred_summary}
기계적 증상 {locked_summary} {instability_summary} {patellar_instability_summary}

현재 고려
- {hypothesis_1}
- {hypothesis_2}

권장 진찰
- gait / weight-bearing
- AROM/PROM / extension
- effusion
- {conditional_exam_items}
```

---

# 15. Sigma external_note Mapping

삼인당 표준:
```text
C/C | 주호소
O/S | 발병 및 경과
S   | 주관적 소견
O   | 객관적 소견
A   | 평가
P   | 계획
```

Tablet 응답은 C/C, O/S, S에 활용할 수 있으나 **O는 원장이 실제 시행한 객관적 진찰만 기록**한다.

---

# 16. Exercise Contract

입력: target function + irritability + ROM + effusion + strength + load response + instability + movement control + patient goal + safety.

출력: **후보 2–3개 → 원장 승인/삭제/교체 → 최종 1–2개**.

진단명 하나만으로 운동 자동배정 금지.

---

# 17. Reassessment

모든 재진:
- Pain NRS
- Target Function 0–10

조건부:
- walking tolerance
- sit-to-stand / stair function
- ROM / extension
- effusion
- instability episodes
- locking
- standardized PF/tendon load response
- strength/function

Response: `RESPONDING / PARTIAL_RESPONSE / NON_RESPONSE / DETERIORATION / DISCHARGE`.
`DETERIORATION` → safety/diagnosis/referral reassessment.

---

# 18. Question Burden — deterministic design check

기존 Core 제외 KNEE 신규 screens:
- base: KNEE_01,02,02A,05,06,07,08,09,10,11,12,13,14 = **13**
- trauma YES/UNKNOWN: KNEE_03,04,15 = +3
- DVT symptom YES/UNKNOWN: KNEE_06A,06B = +2
- maximum branch = **18**

18개는 모든 safety branch가 동시에 열리는 고위험 경로다. Safety는 fatigue 때문에 suppress하지 않는다. 실제 P50/P90 시간은 pilot telemetry 전까지 확정하지 않는다.

---

# 19. Opus Re-review Questions

1. K2: KNEE_02A unconditional knee-primary 노출이 자연정복 탈구 fail-open을 막는가? YES→URGENT가 정확한가?
2. K3/K4: extensor concern/true locked knee = REVIEW_REQUIRED + expedited가 정확한가?
3. K5: Wells clinician-side 유지, leg symptom+risk = REVIEW+dvt flag, PE-type symptom = URGENT가 맞는가? 특히 KNEE_06 symptom-alone REVIEW 제안을 최종 확정/수정할 것.
4. C2: KNEE_06B에 별도 AND gate가 없어 double-barreled fail-open을 피하는가?
5. K9: KNEE_08 최소 red-flag 1 screen과 LBP 엔진 비재사용이 맞는가?
6. C1: `MUST_EXCLUDE_FRACTURE_OR_NEUROVASCULAR_INJURY` enum + matrix row가 domain B drift를 해결하는가?
7. UNKNOWN/missing/malformed가 CLEAR를 만들 수 있는 새 경로가 없는가?
8. 신규 safety content와 phenotype 문항 부담이 허용 가능한가?

출력:
- `PASS / CLINICAL DECISIONS CLOSED`
또는
- `CLINICAL DECISION REQUIRED`

PASS 전 KNEE code 구현 금지.

---

# 20. Current Gate

```text
LBP_V1       PASS / FROZEN + Opus audit PASS
NECK_V1      PASS / FROZEN
SHOULDER_V1  PASS / FROZEN

KNEE Evidence Matrix v0.1      COMPLETE
Opus clinical review v0.1      COMPLETE — CLINICAL DECISION REQUIRED
K2/K5/K9/C1 decisions          INCORPORATED
Tablet Question Set v0.1       COMPLETE
Clinical decisions             OPEN — Opus re-review required
Code implementation            NOT STARTED
```

다음 단일 과제:

> **Opus re-review of KNEE_V1 Tablet Question Set v0.1**
