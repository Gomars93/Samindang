
명시된 urgent red flags:
- suspected infected joint → same-day emergency
- unreduced traumatic dislocation → same-day emergency
- suspected tumour/malignancy → urgent referral
- acute traumatic cuff tear → urgent specialist referral
- inflammatory multi-joint / PMR-like presentation → rheumatologic red flag

## E6. Acute shoulder imaging — ACR 2024
**ACR Appropriateness Criteria® Acute Shoulder Pain. Revised 2024.**

적용:
- acute trauma / suspected fracture, dislocation, labral injury, RC tear의 imaging context
- tablet이 자동 영상 처방하지 않음
- clinician/referral decision support의 downstream 근거로만 사용

## E7. Cardiac referred pain
**2021 AHA/ACC Chest Pain Guideline.**

어깨·팔·목·등 불편감과 호흡곤란/피로 등도 anginal equivalent가 될 수 있음.

적용:
- “어깨 아프다 = shoulder pathology”라는 anchoring 방지
- acute nonmechanical shoulder/arm discomfort + chest/autonomic/breathlessness pattern은 routine MSK pathway보다 safety assessment 우선

## E8. Instability
- BESS/BOA traumatic and atraumatic shoulder instability pathways
- BESS traumatic anterior shoulder dislocation rehabilitation guideline (2026)

적용:
- traumatic dislocation/subluxation history
- recurrent instability/apprehension
- atraumatic instability / motor-control phenotype
- acute unreduced dislocation과 chronic/recurrent instability를 구분

---

# 3. Safety Architecture v0.1

제안 상태:

`shoulder_safety_status`
- `CLEAR`
- `REVIEW_REQUIRED`
- `URGENT_REVIEW`

단, **어떤 shoulder red flag를 URGENT 인터럽트로 보낼지 vs REVIEW + expedited referral로 보낼지는 Opus 검수에서 닫는다.**

## A. Suspected infection — MUST EXCLUDE

환자/병력 후보:
- 급성 또는 빠르게 악화되는 심한 통증
- 발열/오한/전신쇠약
- 관절의 발적·열감·뚜렷한 부종
- 최근 수술/주사/침습시술
- 면역억제

clinician:
- swelling/warmth/redness
- systemic status
- profound painful restriction
- medical referral decision

근거상 suspected infected joint는 same-day emergency referral.

`MUST_EXCLUDE_SHOULDER_INFECTION`

---

## B. Unreduced dislocation / fracture after trauma — MUST EXCLUDE

환자 후보:
- 최근 외상
- 명백한 변형 또는 “빠졌다가 아직 제자리로 안 돌아온 느낌”
- 팔을 거의 움직일 수 없음
- 강한 골성 압통/부종
- trauma 후 neurovascular symptoms

clinician:
- deformity
- neurovascular exam
- fracture/dislocation assessment
- imaging/referral as appropriate

**의심되는 unreduced traumatic dislocation → same-day emergency.**

`MUST_EXCLUDE_FRACTURE_OR_UNREDUCED_DISLOCATION`

주의:
- acute dislocation을 provocative instability test로 확인하려 하지 않음.

---

## C. Acute traumatic rotator cuff tear — MUST NOT MISS

환자 후보:
- 명확한 외상
- 외상 직후 새로 생긴 현저한 arm elevation difficulty / weakness
- 이전에는 가능하던 팔 들기 기능의 급격한 소실

clinician:
- active vs passive elevation
- resisted abduction/scaption / ER / IR
- lag/drop-arm 계열은 보조적
- pain inhibition vs true weakness 구분
- 필요 시 imaging/specialist referral

BESS pathway는 **acute traumatic cuff tear를 urgent referral red flag**로 분류.

`MUST_EXCLUDE_ACUTE_TRAUMATIC_CUFF_TEAR`

**임상결정 필요:** 앱의 `URGENT_REVIEW`에 즉시 인터럽트할지,
`REVIEW_REQUIRED + EXPEDITED_REFERRAL`로 분리할지.

---

## D. Malignancy / systemic inflammatory disease — MUST EXCLUDE

환자 후보:
- cancer history
- 설명되지 않는 체중감소
- mass/swelling
- systemic illness
- bilateral shoulder-girdle pain/stiffness + systemic inflammatory pattern
- multiple inflamed joints
- PMR-like pattern

중요:
- **야간통 단독은 malignancy red flag로 취급하지 않는다.**
  RC disorders와 frozen shoulder에서도 흔할 수 있음.

`MUST_EXCLUDE_SYSTEMIC_OR_MALIGNANT_PATHOLOGY`

---

## E. Acute non-MSK referred pain / cardiac concern — MUST EXCLUDE

환자 후보:
- 어깨/팔 불편감이 shoulder movement/load와 잘 연결되지 않음
- 동반 chest pressure/discomfort
- breathlessness
- marked sweating
- nausea
- exertional systemic pattern
- acute unexplained fatigue/illness context

`MUST_EXCLUDE_NON_MSK_REFERRED_PATHOLOGY`

환자 태블릿의 구체 문구와 urgent threshold는 별도 clinical decision 필요.

---

## F. Major neurologic / cervical contribution

Shoulder complaint라 하더라도:
- distal paresthesia/numbness
- progressive weakness
- neck-linked symptom change
- multi-limb symptoms

