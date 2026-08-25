# WRIST_HAND_V1 — Tablet Question Set v0.1

작성일: 2026-08-25
상태: **TABLET DRAFT COMPLETE / OPUS RE-REVIEW REQUIRED**
대상: 삼인당 Clinical OS — MSK Wrist/Hand module
기준 문서:
- `docs/WRIST_HAND_V1_Evidence_Matrix_v0.1_HANDOFF.md`
- `docs/WRIST_HAND_V1_Opus_Clinical_Review_v0.1.md`

> 이 문서는 Opus v0.1의 W1–W10 결정을 환자용 Tablet 질문과 safety contract로 옮긴 것이다. 아직 `CLINICAL DECISIONS CLOSED`가 아니다. Fable 통합계획, TypeScript/UI/테스트 구현은 금지한다.

---

# 0. 설계 원칙

1. **Safety first**: protected safety는 fatigue 때문에 숨기지 않는다.
2. **한 화면 한 개념**: 환자가 임상 검사를 수행하거나 해석하도록 요구하지 않는다.
3. **진단명 대신 pattern/support**: Tablet은 위치·부하·감각·기능·위험 신호만 수집한다.
4. **Objective data 분리**: 환자 응답만으로 `O`(객관적 소견)를 만들지 않는다.
5. **Fail-closed**: protected safety에서 UNKNOWN/missing/malformed/empty는 CLEAR를 만들지 않는다.
6. **Optional phenotype missing은 중립**: 선택적 비안전 문항 누락은 safety escalation을 만들지 않는다.
7. **기존 router 재사용**: 새 upper-limb router를 만들지 않고 `ELBOW_00 / arm_hand_region_discriminator`를 재사용한다.
8. **기존 frozen module 보존**: LBP/NECK/SHOULDER/KNEE/ELBOW의 CLOSED threshold를 수정하지 않는다.

---

# 1. Entry / routing contract

기존 공통 route:

```text
PAIN_01 == 'arm_hand'
  ↓
ELBOW_00 / arm_hand_region_discriminator

ELBOW
FOREARM
WRIST_HAND
DIFFUSE_OR_MULTIPLE
UNKNOWN
```

WRIST_HAND_V1 protected safety gate — Opus W1 Option B:

```text
IS_PRIMARY_WRIST_HAND_SAFETY =
  PAIN_01 == 'arm_hand'
  AND ELBOW_00 in [FOREARM, WRIST_HAND, DIFFUSE_OR_MULTIPLE, UNKNOWN]
```

`ELBOW`만 WRIST_HAND protected safety에서 제외한다.

중요 invariant:
- `ELBOW_00`은 routing/tagging 전용이다.
- `ELBOW_00` 값 자체가 `wrist_hand_safety_status`를 REVIEW/URGENT로 만들지 않는다.
- `FOREARM`은 ELBOW safety와 WRIST_HAND safety가 동시에 노출될 수 있다. 이는 distal forearm/wrist 경계의 fail-open 방지를 위한 의도된 중첩이다.

---

# 2. Safety status / flags contract

```text
wrist_hand_safety_status:
- CLEAR
- REVIEW_REQUIRED
- URGENT_REVIEW
```

Clinician-facing flags:

```text
fracture_imaging_consider
tendon_injury_assessment_required
infection_assessment_required
neuro_assessment_required
expedited_referral_consider
```

Flags are not additional safety tiers.

---

# 3. Tablet Question Set

## WH_01 — 최근 외상/손상

```yaml
id: WH_01
variable: wrist_hand_recent_trauma
input: single_choice
required: true
show_when: IS_PRIMARY_WRIST_HAND_SAFETY
question: 최근 3개월 이내 넘어지면서 손을 짚었거나, 손목·손·손가락을 부딪히거나 비틀거나 눌렸거나, 갑자기 강한 힘이 가해진 뒤 증상이 시작되거나 뚜렷하게 심해졌나요?
options:
  - YES: 네
  - NO: 아니요
  - UNKNOWN: 잘 모르겠어요
```

Semantics:
- `YES` 자체만으로 safety escalation하지 않는다. 후속 trauma 문항이 실제 위험을 판단한다.
- `UNKNOWN/missing/malformed` → 최소 `REVIEW_REQUIRED`.
- `YES/UNKNOWN`이면 WH_03/04/04A/05 노출 후보.

---

## WH_02 — 급성 변형 / 신경혈관 / 심한 개방손상

```yaml
id: WH_02
variable: wrist_hand_deformity_neurovascular_open_injury_screen
input: multi_choice
required: true
show_when: IS_PRIMARY_WRIST_HAND_SAFETY
question: 지금 손목·손·손가락에 다음 변화가 있나요?
exclusive:
  - NONE
  - UNKNOWN
options:
  - GROSS_DEFORMITY_OR_STILL_OUT:
      손목·손·손가락 모양이 확연히 달라졌거나 관절이 빠진 채 제자리로 돌아오지 않은 느낌
  - COLD_PALE_BLUE_DIGITS:
      손이나 손가락이 갑자기 매우 차갑거나 창백·푸르게 변함
  - MAJOR_NEW_DISTAL_NEURO_CHANGE:
      손·손가락 감각이나 힘이 갑자기 크게 떨어짐
  - UNCONTROLLED_HEAVY_BLEEDING:
      눌러도 잘 멈추지 않는 심한 출혈이 있음
  - SEVERE_OPEN_WOUND_WITH_DEEP_EXPOSURE:
      상처 사이로 뼈·힘줄·관절처럼 깊은 조직이 드러나 보임
  - NONE: 해당 없음
  - UNKNOWN: 잘 모르겠어요
```

Semantics — Opus W2/W2-1:
- 위 concrete positive 중 하나라도 있으면 **단독으로** `URGENT_REVIEW`.
- bleeding/open-wound 옵션을 다른 증상과 AND로 묶지 않는다.
- UNKNOWN/missing/malformed/empty → 최소 `REVIEW_REQUIRED`.
- `NONE`은 exact singleton일 때만 negative.
- `NONE` 또는 `UNKNOWN`이 positive와 섞이면 malformed → 최소 REVIEW.

Hypothesis:
- `MUST_EXCLUDE_FRACTURE_DISLOCATION_OR_NEUROVASCULAR_INJURY`

---

## WH_03 — 외상 후 주요 기능소실

```yaml
id: WH_03
variable: wrist_hand_post_trauma_major_function_loss
input: single_choice
required: true
show_when: IS_PRIMARY_WRIST_HAND_SAFETY AND WH_01 in [YES, UNKNOWN]
question: 손상 이후 그 손으로 물건을 쥐거나 손목·손가락을 사용하는 것이 매우 어렵나요?
options:
  - YES: 네
  - NO: 아니요
  - UNKNOWN: 잘 모르겠어요
```

Semantics:
- `YES` → `REVIEW_REQUIRED + fracture_imaging_consider=true`.
- `UNKNOWN/missing/malformed` when shown → 최소 `REVIEW_REQUIRED`.
- UNKNOWN/missing만으로 `fracture_imaging_consider`를 임의로 true로 만들지 않는다.

---

## WH_04 — 외상 후 요측 손목/엄지기저부 통증

```yaml
id: WH_04
variable: wrist_hand_post_trauma_radial_thumb_base_pain
input: single_choice
required: true
show_when: IS_PRIMARY_WRIST_HAND_SAFETY AND WH_01 in [YES, UNKNOWN]
question: 손상 뒤 손목의 엄지손가락 쪽이나 엄지손가락 뿌리 가까운 부위가 계속 아픈가요?
options:
  - YES: 네
  - NO: 아니요
  - UNKNOWN: 잘 모르겠어요
```

Semantics — Opus W3:
- `YES` → `REVIEW_REQUIRED + fracture_imaging_consider=true`.
- deformity/NV/open-injury가 없으면 이 항목만으로 URGENT 금지.
- `UNKNOWN/missing/malformed` when shown → 최소 `REVIEW_REQUIRED`.
- 환자에게 anatomical snuffbox 자가 촉진을 요구하지 않는다.

Hypothesis:
- `MUST_EXCLUDE_OCCULT_SCAPHOID_OR_CARPAL_FRACTURE`

---

## WH_04A — 기존 X-ray 이력, non-gating context

```yaml
id: WH_04A
variable: wrist_hand_prior_xray_context
input: single_choice
required: false
show_when: IS_PRIMARY_WRIST_HAND_SAFETY AND WH_01 in [YES, UNKNOWN]
question: 이 손상 때문에 X-ray를 찍어본 적이 있나요?
options:
  - NOT_DONE: 아직 찍지 않았어요
  - DONE_TOLD_NORMAL: 찍었고 특별한 이상이 없다고 들었어요
  - DONE_TOLD_ABNORMAL: 찍었고 이상이 있다고 들었어요
  - DONE_RESULT_UNKNOWN: 찍었지만 결과를 잘 모르겠어요
  - UNKNOWN: 잘 모르겠어요
```

Semantics — Opus W3:
- **순수 context only.** 어떤 답도 WH_03/WH_04에서 발생한 REVIEW 또는 fracture flag를 끄지 못한다.
- `DONE_TOLD_NORMAL`은 occult fracture concern을 배제하지 않는다.
- optional이므로 missing은 safety escalation 없음.

---

## WH_05 — 외상 후 고정된 기계적 차단

```yaml
id: WH_05
variable: wrist_hand_post_trauma_fixed_motion_block
input: single_choice
required: true
show_when: IS_PRIMARY_WRIST_HAND_SAFETY AND WH_01 in [YES, UNKNOWN]
question: 손상 이후 단순히 아파서가 아니라, 손목이나 손가락 관절이 실제로 걸린 채 풀리지 않아 움직임이 막혀 있나요?
options:
  - YES: 네
  - NO: 아니요
  - UNKNOWN: 잘 모르겠어요
```

Semantics — Opus W7:
- `YES` → `REVIEW_REQUIRED`.
- 명백한 unreduced joint/deformity는 WH_02에서 URGENT 처리.
- `YES`만으로 blanket expedited flag를 만들지 않는다.
- `UNKNOWN/missing/malformed` when shown → 최소 REVIEW.

---

## WH_06 — 열상/관통상/교상 exposure

```yaml
id: WH_06
variable: wrist_hand_wound_exposure
input: multi_choice
required: true
show_when: IS_PRIMARY_WRIST_HAND_SAFETY
question: 최근 손목·손·손가락에 다음과 같은 상처가 있었나요?
exclusive:
  - NONE
  - UNKNOWN
options:
  - CUT_OR_PENETRATING_WOUND:
      베이거나 찔리거나 뾰족한 물체에 관통된 상처
  - HUMAN_OR_ANIMAL_BITE:
      사람 또는 동물에게 물린 상처(주먹을 치다가 상대 치아에 손등이 찢어진 경우 포함)
  - NONE: 해당 없음
  - UNKNOWN: 잘 모르겠어요
```

Semantics — Opus W5:
- `HUMAN_OR_ANIMAL_BITE`는 감염 징후가 아직 없어도 **독립적으로** `REVIEW_REQUIRED + infection_assessment_required=true`.
- `CUT_OR_PENETRATING_WOUND` 자체는 WH_02 urgent finding, WH_06A tendon dysfunction, WH_07/07A infection pattern의 context로 사용한다. 단순 exposure 하나만으로 expedited/urgent를 만들지 않는다.
- UNKNOWN/missing/malformed/empty → 최소 REVIEW.
- bite concrete positive는 다른 감염 소견과 AND로 묶지 않는다.

---

## WH_06A — 상처 후 능동 굴곡/신전 소실

```yaml
id: WH_06A
variable: wrist_hand_post_wound_active_motion_loss
input: single_choice
required: true
show_when: IS_PRIMARY_WRIST_HAND_SAFETY AND WH_06 contains [CUT_OR_PENETRATING_WOUND, HUMAN_OR_ANIMAL_BITE, UNKNOWN]
question: 그 상처 이후 손가락이나 엄지손가락을 스스로 굽히거나 펴는 동작이 갑자기 제대로 되지 않나요?
options:
  - YES: 네
  - NO: 아니요
  - UNKNOWN: 잘 모르겠어요
```

Semantics — Opus W4:
- `YES` → `REVIEW_REQUIRED + expedited_referral_consider=true + tendon_injury_assessment_required=true`.
- severe bleeding/deep exposure/NV compromise는 WH_02가 URGENT를 담당.
- `UNKNOWN/missing/malformed` when shown → 최소 REVIEW. 이 불확실성만으로 expedited/tendon flag를 임의로 true로 만들지 않는다.

Hypothesis:
- `MUST_EXCLUDE_FLEXOR_OR_EXTENSOR_TENDON_INJURY`

---

## WH_07 — 넓은 감염 게이트

```yaml
id: WH_07
variable: wrist_hand_infection_broad_screen
input: single_choice
required: true
show_when: IS_PRIMARY_WRIST_HAND_SAFETY
question: 손목·손·손가락의 붓기나 발적이 있다면, 지금 상태는 다음 중 어디에 가장 가깝나요?
options:
  - NONE:
      붓거나 빨갛게 변한 부위가 없음
  - LOCALIZED_STABLE:
      국소적으로 붓거나 빨갛지만 열·오한 등 전신 증상은 없고 빠르게 번지지도 않음
  - FINGER_LOCALIZED_SWOLLEN_PAINFUL:
      한 손가락이 특히 많이 붓고 아프거나 움직이기 매우 불편함
  - SYSTEMIC_OR_RAPIDLY_SPREADING:
      열·오한이나 몸 상태가 매우 안 좋음이 함께 있거나, 발적·부기가 몇 시간~하루 사이 눈에 띄게 번지거나 커지고 있음
  - UNKNOWN:
      잘 모르겠어요
```

Semantics — Opus W5/W8:
- `SYSTEMIC_OR_RAPIDLY_SPREADING` → **URGENT_REVIEW + infection_assessment_required=true**.
- 이 값은 `systemic illness OR rapidly spreading`을 하나의 opaque enum으로 보존한다. 둘을 분해해 AND 조건으로 구현 금지.
- `LOCALIZED_STABLE` → `REVIEW_REQUIRED + infection_assessment_required=true`.
- `FINGER_LOCALIZED_SWOLLEN_PAINFUL` → `REVIEW_REQUIRED + infection_assessment_required=true`, WH_07A 노출.
- `UNKNOWN/missing/malformed` → 최소 REVIEW + infection assessment consideration.
- `NONE`만 negative.

---

## WH_07A — flexor-sheath infection follow-up

```yaml
id: WH_07A
variable: wrist_hand_flexor_sheath_followup
input: multi_choice
required: true
show_when: >
  IS_PRIMARY_WRIST_HAND_SAFETY
  AND (
    WH_06 contains CUT_OR_PENETRATING_WOUND
    OR WH_06 contains HUMAN_OR_ANIMAL_BITE
    OR WH_06 contains UNKNOWN
    OR WH_07 in [FINGER_LOCALIZED_SWOLLEN_PAINFUL, UNKNOWN]
  )
question: 붓고 아픈 손가락에 다음과 같은 특징이 있나요?
exclusive:
  - NONE
  - UNKNOWN
options:
  - SEVERE_PAIN_WHEN_STRAIGHTENING:
      손가락을 펴려고 하면 통증이 매우 심함
  - TENDS_TO_STAY_FLEXED:
      아픈 손가락을 자꾸 굽힌 채로 두게 됨
  - DIFFUSE_FUSIFORM_SWELLING:
      손가락 전체가 소시지처럼 두루 붓는 느낌
  - NONE:
      해당 없음
  - UNKNOWN:
      잘 모르겠어요
```

Semantics — Opus W5/W8:
- follow-up의 concrete positive 중 **하나라도** 있으면 그 자체로 `URGENT_REVIEW + infection_assessment_required=true`.
- broad WH_07이 `NONE`이더라도 WH_06 wound/bite 때문에 WH_07A가 노출되고 concrete positive가 나오면 URGENT 가능.
- Kanavel sign 개수/점수/확률을 계산하지 않는다.
- UNKNOWN/missing/malformed/empty when shown → 최소 REVIEW + infection assessment consideration.

Hypothesis:
- `MUST_EXCLUDE_DEEP_HAND_INFECTION_OR_PYOGENIC_FLEXOR_TENOSYNOVITIS`

---

## WH_08 — 손가락 감각분포

```yaml
id: WH_08
variable: wrist_hand_distal_sensory_pattern
input: single_choice
required: true
show_when: IS_PRIMARY_WRIST_HAND_SAFETY
question: 손가락 저림이나 감각이상이 있다면 어느 쪽이 가장 가깝나요?
options:
  - MEDIAN_DISTRIBUTION:
      엄지·검지·중지 쪽이 주로 저리거나 감각이 이상함
  - ULNAR_DISTRIBUTION:
      약지·새끼손가락 쪽이 주로 저리거나 감각이 이상함
  - MULTIPLE_OR_BOTH:
      여러 손가락 또는 두 분포가 함께 불편함
  - NONE:
      손가락 저림이나 감각이상은 없음
  - UNKNOWN:
      잘 모르겠어요
```

Semantics — Opus W6:
- concrete sensory-only pattern 자체는 safety REVIEW를 만들지 않는다.
- `MEDIAN_DISTRIBUTION` → `CARPAL_TUNNEL_OR_MEDIAN_NEUROPATHY` CONSIDER.
- `ULNAR_DISTRIBUTION` → `ULNAR_NEUROPATHY_WRIST_HAND` CONSIDER.
- `MULTIPLE_OR_BOTH` → proximal/referred/systemic differential support; 자동 진단 금지.
- `UNKNOWN/missing/malformed` → protected safety fail-closed 최소 REVIEW.
- sensory positive/UNKNOWN이면 WH_08A 노출.

---

## WH_08A — 진행성 운동기능 저하

```yaml
id: WH_08A
variable: wrist_hand_motor_progression_screen
input: multi_choice
required: true
show_when: IS_PRIMARY_WRIST_HAND_SAFETY AND WH_08 != NONE
question: 손저림이나 감각이상과 함께 다음 변화가 있나요?
exclusive:
  - NONE
  - UNKNOWN
options:
  - NEW_OR_WORSENING_GRIP_PINCH_WEAKNESS:
      손의 쥐는 힘이나 집는 힘이 새로 약해지거나 점점 심해짐
  - DROPPING_OBJECTS:
      예전보다 물건을 자주 떨어뜨림
  - VISIBLE_THENAR_OR_INTRINSIC_WASTING:
      엄지두덩이나 손가락 사이 근육이 눈에 띄게 마르거나 홀쭉해짐
  - NONE:
      해당 없음
  - UNKNOWN:
      잘 모르겠어요
```

Semantics — Opus W6:
- WH_08 concrete sensory positive + WH_08A `[NONE]` → stable sensory-only; **이 경로만으로 REVIEW 금지**, phenotype CONSIDER만.
- WH_08 concrete sensory positive + WH_08A concrete positive → `REVIEW_REQUIRED + neuro_assessment_required=true + expedited_referral_consider=true`.
- WH_08 concrete sensory positive + WH_08A UNKNOWN/missing/malformed/empty → 동일하게 `REVIEW_REQUIRED + neuro_assessment_required=true + expedited_referral_consider=true`.
- WH_08 자체가 UNKNOWN/missing인 경우에는 최소 REVIEW를 보장한다. WH_08A의 concrete positive가 있으면 neuro/expedited를 추가할 수 있으나, sensory distribution 불확실성만으로 neuro/expedited를 임의로 올리지 않는다.

Hypotheses:
- `CARPAL_TUNNEL_OR_MEDIAN_NEUROPATHY`
- `ULNAR_NEUROPATHY_WRIST_HAND`

---

# 4. Optional phenotype questions

아래 문항은 safety escalation을 만들지 않는다. missing은 중립이다.

## WH_09 — 통증 위치

```yaml
id: WH_09
variable: wrist_hand_pain_location_pattern
input: single_choice
required: false
show_when: IS_PRIMARY_WRIST_HAND_SAFETY
question: 손목·손 통증은 주로 어디에서 느껴지나요?
options:
  - RADIAL_WRIST_THUMB_SIDE: 손목의 엄지손가락 쪽
  - ULNAR_WRIST_SMALL_FINGER_SIDE: 손목의 새끼손가락 쪽
  - THUMB_BASE: 엄지손가락 뿌리 부위
  - PALM: 손바닥
  - DORSAL_HAND_WRIST: 손등 또는 손목 뒤쪽
  - FINGER: 손가락
  - DIFFUSE: 여러 부위 또는 전체적으로
  - UNKNOWN: 잘 모르겠어요
```

Support only:
- radial/thumb-side + load → de Quervain / thumb-base differential support.
- ulnar wrist + rotation/load → TFCC/mechanical differential support.

---

## WH_10 — 부하/활동 패턴

```yaml
id: WH_10
variable: wrist_hand_load_activity_pattern
input: multi_choice
required: false
show_when: IS_PRIMARY_WRIST_HAND_SAFETY
question: 어떤 동작에서 손목·손이 더 불편한가요?
exclusive:
  - NONE
  - UNKNOWN
options:
  - GRIPPING: 물건을 쥘 때
  - PINCHING: 엄지와 손가락으로 집을 때
  - THUMB_MOTION: 엄지손가락을 움직일 때
  - WRIST_ROTATION: 손목·전완을 돌릴 때
  - WEIGHT_BEARING_THROUGH_HAND: 손으로 바닥이나 의자를 짚을 때
  - REPETITIVE_HAND_USE: 손을 반복해서 오래 사용할 때
  - NONE: 특별히 악화되는 동작 없음
  - UNKNOWN: 잘 모르겠어요
```

---

## WH_11 — 일반 trigger/catching pattern

```yaml
id: WH_11
variable: wrist_hand_trigger_catching_pattern
input: single_choice
required: false
show_when: IS_PRIMARY_WRIST_HAND_SAFETY
question: 손가락이나 엄지가 굽혔다 펼 때 딸깍거리거나 걸렸다가 다시 풀리는 일이 있나요?
options:
  - YES: 네
  - NO: 아니요
  - UNKNOWN: 잘 모르겠어요
```

Semantics — Opus W7:
- `YES` → `TRIGGER_FINGER_PATTERN` CONSIDER only.
- 자동 REVIEW/expedited 금지.
- 외상 후 풀리지 않는 fixed block은 WH_05가 별도 담당.

---

## WH_12 — 국소 종괴

```yaml
id: WH_12
variable: wrist_hand_localized_mass_pattern
input: single_choice
required: false
show_when: IS_PRIMARY_WRIST_HAND_SAFETY
question: 손목이나 손에 동그랗게 만져지거나 눈에 보이는 혹이 있나요?
options:
  - YES_STABLE: 있고 크기가 크게 변하지 않음
  - YES_CHANGES_SIZE: 있고 크기가 커졌다 작아졌다 함
  - NO: 없음
  - UNKNOWN: 잘 모르겠어요
```

Support:
- `GANGLION_OR_LOCALIZED_MASS_CONSIDER`.
- 이 문항 단독으로 safety escalation하지 않는다.
- 감염성 발적/급속확대 concern은 WH_07 protected safety가 우선한다.

---

## WH_13 — proximal / multi-joint / inflammatory support

```yaml
id: WH_13
variable: wrist_hand_referred_systemic_pattern
input: multi_choice
required: false
show_when: IS_PRIMARY_WRIST_HAND_SAFETY
question: 손목·손 증상과 함께 다음 변화가 있나요?
exclusive:
  - NONE
  - UNKNOWN
options:
  - NEW_NECK_SHOULDER_SYMPTOM:
      목이나 어깨에 새로 생긴 통증·뻣뻣함이 함께 있음
  - BILATERAL_OR_MULTIPLE_SENSORY:
      양손 또는 여러 부위에 동시에 저림·감각이상이 있음
  - MULTIPLE_SWOLLEN_JOINTS:
      손가락 여러 관절 또는 다른 관절도 함께 붓고 아픔
  - PROLONGED_MORNING_STIFFNESS:
      여러 관절이 아침에 오래 뻣뻣한 편임
  - NONE: 해당 없음
  - UNKNOWN: 잘 모르겠어요
```

Semantics — Opus W9:
- safety escalation 없음; supportive differential only.
- `REFERRED_OR_PROXIMAL_SOURCE`
- `SYSTEMIC_OR_INFLAMMATORY_CONTRIBUTION`
- NECK_QUESTIONS 직접 재사용 금지.
- 별도 wrist/hand cardiac screen 추가하지 않는다. Core global chest/breathing safety passthrough만 유지한다.

---

## WH_14 — 주 불편 측

```yaml
id: WH_14
variable: wrist_hand_primary_side
input: single_choice
required: false
show_when: IS_PRIMARY_WRIST_HAND_SAFETY
question: 어느 쪽 손목·손이 더 불편한가요?
options:
  - LEFT: 왼쪽
  - RIGHT: 오른쪽
  - BILATERAL: 양쪽
  - UNKNOWN: 잘 모르겠어요
```

---

# 5. Safety Engine — literal contract candidate

## 5.1 URGENT_REVIEW

아래 중 하나라도 true면 `URGENT_REVIEW`:

1. `core_safety_already_urgent == true`
2. WH_02 concrete positive:
   - `GROSS_DEFORMITY_OR_STILL_OUT`
   - `COLD_PALE_BLUE_DIGITS`
   - `MAJOR_NEW_DISTAL_NEURO_CHANGE`
   - `UNCONTROLLED_HEAVY_BLEEDING`
   - `SEVERE_OPEN_WOUND_WITH_DEEP_EXPOSURE`
3. `WH_07 == SYSTEMIC_OR_RAPIDLY_SPREADING`
4. WH_07A가 shown이고 concrete positive 중 하나라도 있음:
   - `SEVERE_PAIN_WHEN_STRAIGHTENING`
   - `TENDS_TO_STAY_FLEXED`
   - `DIFFUSE_FUSIFORM_SWELLING`

WH_07A는 broad infection gate의 보조 설명이 아니라 독립 urgent trigger다.
Kanavel 점수화는 하지 않는다.

## 5.2 REVIEW_REQUIRED

URGENT가 아니면서 아래 중 하나라도 true면 REVIEW:

- protected WH_01 UNKNOWN/missing/malformed
- WH_02 UNKNOWN/missing/malformed/empty/invalid combination
- WH_03 shown + YES/UNKNOWN/missing/malformed
- WH_04 shown + YES/UNKNOWN/missing/malformed
- WH_05 shown + YES/UNKNOWN/missing/malformed
- WH_06 `HUMAN_OR_ANIMAL_BITE`
- WH_06 UNKNOWN/missing/malformed/empty/invalid combination
- WH_06A shown + YES/UNKNOWN/missing/malformed
- WH_07 `LOCALIZED_STABLE`
- WH_07 `FINGER_LOCALIZED_SWOLLEN_PAINFUL`
- WH_07 UNKNOWN/missing/malformed
- WH_07A shown + UNKNOWN/missing/malformed/empty/invalid combination
- WH_08 UNKNOWN/missing/malformed
- WH_08 concrete sensory positive + WH_08A concrete positive/UNKNOWN/missing/malformed/empty

## 5.3 CLEAR

`CLEAR`은 모든 protected safety가 명시적으로 negative이고, stable sensory-only carve-out 외 다른 review/urgent trigger가 없을 때만 가능하다.

예:
- WH_08 = MEDIAN_DISTRIBUTION + WH_08A = `[NONE]`
- WH_08 = ULNAR_DISTRIBUTION + WH_08A = `[NONE]`

위 stable sensory-only는 다른 red flag가 없다면 safety status를 올리지 않는다.

---

# 6. Flags

## fracture_imaging_consider

`true` when:
- WH_03 == YES
- OR WH_04 == YES

UNKNOWN/missing만으로 true 금지.

## tendon_injury_assessment_required

`true` when:
- WH_06A == YES

## infection_assessment_required

`true` when:
- WH_06 contains `HUMAN_OR_ANIMAL_BITE`
- OR WH_07 in `[LOCALIZED_STABLE, FINGER_LOCALIZED_SWOLLEN_PAINFUL, SYSTEMIC_OR_RAPIDLY_SPREADING, UNKNOWN]`
- OR WH_07 is missing/malformed protected response
- OR WH_07A concrete positive/UNKNOWN/missing/malformed when shown

## neuro_assessment_required

`true` when:
- WH_08 is a concrete sensory-positive pattern
- AND WH_08A concrete positive/UNKNOWN/missing/malformed/empty when shown

## expedited_referral_consider

`true` when:
- WH_06A == YES
- OR WH_08 is a concrete sensory-positive pattern AND WH_08A concrete positive/UNKNOWN/missing/malformed/empty

`WH_05 == YES` 일반 fixed block만으로 자동 expedited 금지.

---

# 7. Hypothesis contract

## MUST_EXCLUDE

```text
MUST_EXCLUDE_FRACTURE_DISLOCATION_OR_NEUROVASCULAR_INJURY
MUST_EXCLUDE_OCCULT_SCAPHOID_OR_CARPAL_FRACTURE
MUST_EXCLUDE_FLEXOR_OR_EXTENSOR_TENDON_INJURY
MUST_EXCLUDE_DEEP_HAND_INFECTION_OR_PYOGENIC_FLEXOR_TENOSYNOVITIS
```

## Supportive / differential

```text
CARPAL_TUNNEL_OR_MEDIAN_NEUROPATHY
ULNAR_NEUROPATHY_WRIST_HAND
DE_QUERVAIN_RADIAL_TENDON_PATTERN
TRIGGER_FINGER_PATTERN
THUMB_CMC_OR_DEGENERATIVE_PATTERN
ULNAR_SIDED_WRIST_TFCC_OR_MECHANICAL_PATTERN
GANGLION_OR_LOCALIZED_MASS_CONSIDER
REFERRED_OR_PROXIMAL_SOURCE
SYSTEMIC_OR_INFLAMMATORY_CONTRIBUTION
```

States:

```text
MUST_EXCLUDE
HIGHER_SUPPORT
CONSIDER
LOWER_SUPPORT
```

Tablet response만으로 definitive diagnosis를 생성하지 않는다.

---

# 8. Clinician-side selective exam candidates

Tablet에서 하지 않는 것:
- anatomical snuffbox/scaphoid tubercle palpation 자가진단
- Finkelstein/Eichhoff 자가 확진
- Tinel/Phalen 자가 확진
- Kanavel sign scoring
- tendon integrity test 자동판정
- 객관적 motor grade 자동생성
- pulse/perfusion objective confirmation

Clinician-side 후보:
- wrist/finger ROM, deformity, swelling, wound depth/contamination
- distal perfusion/capillary refill/pulse when indicated
- objective sensory/motor exam
- scaphoid/snuffbox/tubercle assessment after trauma
- flexor/extensor tendon integrity
- median/ulnar distribution + thenar/intrinsic strength/atrophy
- selective provocative tests as adjunct only
- imaging/EDX/US/MRI/CT only when clinically indicated

Single test ≠ diagnosis.

---

# 9. Exercise / management boundary

- `wrist_hand_safety_status != CLEAR`이면 routine exercise/manual-treatment suggestion을 잠근다.
- Tablet이 immobilization, injection, surgery, fracture reduction, antibiotic, operative indication을 자동 결정하지 않는다.
- phenotype이 명확하고 safety CLEAR인 경우에도 clinician이 기능/irritability/exam response를 보고 운동을 승인한다.
- 향후 exercise engine은 diagnosis → exercise가 아니라 function/load tolerance 기반으로 설계한다.

---

# 10. Sigma / formal chart boundary

Tablet patient response 사용 가능 영역:
- `C/C | 주호소`
- `O/S | 발병 및 경과`
- `S | 주관적 소견`

금지:
- patient response만으로 `O | 객관적 소견` 생성
- 환자 응답만으로 확진명/영상소견/객관적 근력등급 기록

`O`는 clinician-confirmed objective data만 사용한다.

---

# 11. Reassessment contract

Every visit:
- Pain NRS
- patient-specific Target Function 0–10

Conditional:
- grip/pinch/load tolerance
- wrist/finger ROM
- swelling/redness
- triggering/catching
- median/ulnar sensory symptoms
- progressive weakness/dropping
- wound/infection evolution

Response state:

```text
RESPONDING
PARTIAL_RESPONSE
NON_RESPONSE
DETERIORATION
DISCHARGE
```

DETERIORATION이면 safety/referral 재평가를 먼저 수행한다.

---

# 12. Question burden

기존 `ELBOW_00` router를 제외한 WRIST_HAND 신규 문항 수:

```text
Protected unconditional:
WH_01, WH_02, WH_06, WH_07, WH_08 = 5

Trauma conditional:
WH_03, WH_04, WH_04A(optional context), WH_05 = 4

Wound conditional:
WH_06A = 1

Infection conditional:
WH_07A = 1

Neuro conditional:
WH_08A = 1

Optional phenotype:
WH_09, WH_10, WH_11, WH_12, WH_13, WH_14 = 6

Maximum unique WRIST_HAND questions = 18
```

실제 branch는 show_when에 따라 더 짧아진다.
Safety 문항은 fatigue 때문에 suppress하지 않는다.

---

# 13. Opus re-review checklist

다음 검수에서는 새 임상쟁점을 넓히지 않고 아래를 우선 확인한다.

1. **W1**: FOREARM/WRIST_HAND/DIFFUSE/UNKNOWN 노출, ELBOW만 제외가 정확한가?
2. **W2-1**: WH_02에 uncontrolled bleeding / deep open exposure가 concrete standalone URGENT로 들어갔는가?
3. **W3**: WH_04 trauma + radial/thumb-base pain이 REVIEW + fracture flag이고, WH_04A X-ray 이력이 non-gating인가?
4. **W4**: wound 후 active flex/ext loss가 REVIEW + expedited + tendon flag인가?
5. **W5 bite**: HUMAN_OR_ANIMAL_BITE 단독으로 REVIEW + infection flag가 되는가?
6. **W5/W8 infection OR**: SYSTEMIC_OR_RAPIDLY_SPREADING이 OR semantics로 유지되고 AND gate가 없는가?
7. **W8 follow-up**: WH_07A concrete positive 자체가 독립 URGENT trigger인가?
8. **W6 neuro**: stable sensory-only `[NONE]`은 safety escalation 없이 CONSIDER만 남고, sensory-positive + motor concrete/UNKNOWN/missing은 REVIEW + neuro + expedited인가?
9. **W7**: ordinary trigger/catching은 phenotype only, fixed post-traumatic block은 REVIEW지만 blanket expedited가 아닌가?
10. **W10**: protected UNKNOWN/missing/malformed/empty/invalid가 CLEAR를 만들 수 없는가?
11. Core global cardiac safety passthrough만 유지하고 별도 wrist/hand cardiac screen을 만들지 않았는가?
12. patient response만으로 O/확진을 생성하지 않는가?
13. 기존 LBP/NECK/SHOULDER/KNEE/ELBOW CLOSED threshold를 수정하지 않았는가?

최종 판정은 반드시 둘 중 하나:

```text
PASS / CLINICAL DECISIONS CLOSED
```

또는

```text
CLINICAL DECISION REQUIRED
```

---

# 14. Current Gate

```text
WRIST_HAND Evidence Matrix v0.1       COMPLETE
Opus Clinical Review v0.1             COMPLETE — CLINICAL DECISION REQUIRED
Tablet Question Set v0.1              COMPLETE — this document
Opus re-review                         NEXT
Fable integration                      BLOCKED
TypeScript/UI/tests                    BLOCKED
```
