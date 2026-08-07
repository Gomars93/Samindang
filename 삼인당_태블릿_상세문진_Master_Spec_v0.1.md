# 삼인당 태블릿 상세문진 Master Specification v0.1

- 문서 상태: Draft for Prototype — routing consistency audit 반영
- 기준일: 2026-08-05
- 목적: 삼인당 한약·체질 정밀문진 웹앱의 개발/프로토타입 제작을 위한 단일 명세
- 범위: 환자용 정밀문진 → 조건부 모듈 → 공통 병력/약물/검사 → 출생정보 → 구조화 요약 입력 데이터
- 제외: 굿닥 접수 UI 자체, EMR 직접 쓰기, deterministic 명리 계산 엔진, LLM 임상판단
- 권장 기준기기: 10.5~11인치 Android 태블릿, 세로모드 우선

---

# 0. Source of Truth

## 0.1 인수인계에서 이미 확정된 원칙

다음은 변경하지 않는 전제다.

1. 굿닥 = 범용 접수 프런트엔드
2. 삼인당 자체 웹앱 = 한약·체질·명리 정밀문진
3. 한 화면 한 질문
4. 큰 글씨 / 큰 버튼 / 고대비
5. 작은 체크박스 금지
6. slider 최소화
7. 스크롤 최소화
8. 자유입력 최소화
9. 자동저장
10. 로그인/비밀번호 없는 환자 흐름
11. 뒤로가기는 항상 동일 위치
12. 작성 완료 후 개인정보 화면 즉시 초기화
13. 모든 환자에게 모든 질문을 하지 않음
14. 환자 답변 전체를 원장에게 그대로 보여주지 않음
15. AI는 요약과 누락 체크를 수행
16. 최종 임상판단은 원장이 수행
17. 명리 계산/판단 엔진은 독립 모듈
18. 상세문진 시스템은 특정 EMR에 종속되지 않도록 설계

## 0.2 이번 v0.1에서 새로 정의하는 것

- 질문 문구
- 화면 순서
- 변수명
- enum 값
- show_if / skip 로직
- 중복 질문 제거 규칙
- red flag 처리 방식
- 원장 요약 변환 규칙
- 데이터 저장 기본 형태

이는 프로토타입 검증 전의 설계안이며, 실제 환자 10~20명 usability test 후 v0.2에서 수정한다.

---

# 1. 전체 환자 Flow

```text
[START]
  ↓
[환자 매칭]
  ↓
[CORE]
  ↓
[MODULE ROUTER]
  ├─ SLEEP
  ├─ GI
  ├─ BOWEL
  ├─ URINARY
  ├─ PAIN
  ├─ FATIGUE
  ├─ THERMAL
  ├─ STRESS
  ├─ WOMEN
  ├─ PREGNANCY
  ├─ POSTPARTUM
  └─ WEIGHT_METABOLIC
  ↓
[COMMON HISTORY]
  ├─ medical history
  ├─ surgery/admission
  ├─ allergy
  ├─ medication
  └─ recent tests
  ↓
[BIRTH INFORMATION]
  ↓
[REVIEW / SUBMIT]
  ↓
[SERVER SAVE]
  ↓
[CLIENT SESSION CLEAR]
  ↓
[START SCREEN]
```

---

# 2. 화면 공통 UX 규격

## 2.1 화면

- 기본 세로모드
- 한 화면 = 한 질문
- 상단:
  - 뒤로가기
  - 진행상태(progress)
- 중앙:
  - 질문
  - 필요한 경우 짧은 보조문구
- 하단:
  - 선택 버튼
  - 필요 시 `다음`
- 항상 접근 가능한 `입력이 어려워요` 버튼

## 2.2 권장 타이포그래피

- 질문: 최소 28~32sp
- 선택지: 최소 22~24sp
- 보조문구: 최소 18sp
- 버튼 높이: 최소 64dp
- 터치 타깃: 최소 56dp

※ 정확한 수치는 실제 11인치 기기에서 usability test 후 조정.

## 2.3 선택 UI

우선순위:

1. Single choice large button
2. Multiple choice large button
3. Numeric keypad
4. Date picker
5. Short free text
6. Long text는 MVP에서 사용하지 않음

## 2.4 다중선택 규칙

`없음 / 특별히 없음 / 해당 없음` 등의 옵션은 exclusive 값으로 사용.

예:

```text
if "none" selected:
    clear all other values
if any other option selected:
    unselect "none"
```

---

# 3. 공통 데이터 규칙

## 3.1 응답 기본 구조

```json
{
  "questionnaire_version": "0.1",
  "session_id": "uuid",
  "patient_match": {},
  "responses": {},
  "flags": {},
  "routing": {},
  "metadata": {}
}
```

## 3.2 모든 질문 응답에 내부적으로 저장할 메타데이터

```json
{
  "value": "...",
  "answered_at": "ISO-8601",
  "source_screen": "CORE_07",
  "changed_after_back": false
}
```

프로토타입에서는 단순화 가능하나 DB 구조는 확장 가능하도록 한다.

## 3.3 null 처리

- 환자가 보지 않은 질문: `null`
- 질문을 봤지만 `잘 모르겠어요`: enum `unknown`
- 질문을 봤고 `해당 없음`: enum `none`

`null`, `unknown`, `none`은 반드시 구분.

---

# 4. 환자 매칭

| screen_id | 환자 질문 | input | variable | required | show_if | notes |
|---|---|---|---|---|---|---|
| ID_01 | 성함을 입력해주세요 | short_text | patient_name | Y | always | 향후 EMR 연동 시 제거 가능 |
| ID_02 | 휴대폰 번호 끝 4자리를 입력해주세요 | numeric_4 | phone_last4 | Y | always | 향후 EMR 연동 시 제거 가능 |
| ID_03 | 성별을 선택해주세요 | single_choice | patient_sex | Y | always | `male` / `female`; 향후 굿닥/EMR에서 신뢰 가능한 값 전달 시 화면 생략 가능 |

중복 가능성이 발생할 경우 직원 확인 상태로 전환한다.

`patient_sex`는 여성·임신·산후 라우팅 및 향후 명리 계산에서 공통 사용한다.

---

# 5. CORE MODULE

## CORE_00 시작

**문구**
> 몸 상태를 자세히 확인하기 위한 문진입니다.

보조:
> 평소 몸 상태와 현재 불편한 점을 알려주세요. 답변에 따라 필요한 질문만 이어집니다.

버튼:
- 문진 시작하기

variable:
- `session_started_at`

---

## CORE_01 오늘의 주된 목적

**질문**
> 오늘 가장 먼저 좋아졌으면 하는 것은 무엇인가요?

input: `single_choice`

variable: `primary_goal_category`

options:

| label | value |
|---|---|
| 잠 / 수면 | sleep |
| 소화 / 속 불편 | digestion |
| 피로 / 기력 | fatigue |
| 통증 | pain |
| 소변 / 방광 | urinary |
| 여성 건강 | women |
| 임신 / 산후회복 | pregnancy_postpartum |
| 체중 / 대사 | weight_metabolic |
| 스트레스 / 긴장 / 마음 | stress |
| 피부 | skin |
| 감기 / 호흡기 | respiratory |
| 체질과 전반적인 몸 상태 | constitution |
| 보약 / 건강관리 | tonic_health |
| 기타 | other |

### CORE_01A 기타

show_if:
```text
primary_goal_category == other
```

질문:
> 어떤 점이 가장 불편하신가요?

variable:
`primary_goal_other`

input:
`short_text`

required:
Y when shown

---

## CORE_02 증상 기간

질문:
> 그 문제는 언제부터 있었나요?

variable:
`chief_duration`

options:

| label | value |
|---|---|
| 며칠 이내 | days |
| 1개월 이내 | within_1m |
| 1~3개월 | 1_3m |
| 3개월~1년 | 3m_1y |
| 1~5년 | 1_5y |
| 5년 이상 | over_5y |
| 정확히 모르겠어요 | unknown |

---

## CORE_03 생활 영향

질문:
> 이 문제 때문에 일상생활이 얼마나 불편하신가요?

variable:
`chief_impact`

| label | value |
|---|---|
| 크게 불편하지는 않아요 | minimal |
| 가끔 신경 쓰여요 | mild |
| 생활에 제법 영향을 줘요 | moderate |
| 생활하기 많이 힘들어요 | severe |

---

## CORE_04 일반 Red Flag

질문:
> 현재 아래와 같은 증상이 있나요?

input:
`multi_choice`

variable:
`red_flag_general[]`

options:

- `chest_breathing`: 갑자기 생긴 심한 가슴통증이나 숨쉬기 어려움
- `focal_neuro`: 갑자기 한쪽 팔·다리에 힘이 빠지거나 말하기 어려움
- `syncope_severe_dizziness`: 의식을 잃었거나 심한 어지럼이 계속됨
- `severe_abdominal_repeated_vomit`: 참기 힘든 심한 복통과 반복적인 구토
- `heavy_bleeding`: 많은 양의 출혈
- `pregnancy_pain_bleeding`: 임신 중 심한 복통 또는 출혈
- `none`: 해당 없음

exclusive:
`none`

flag rule:

```text
if any value except none:
    flags.general_red = true
    flags.requires_staff_check = true
```

UX:
- 선택 즉시 경고 팝업 금지
- 화면 제출 후 안내:
  - `입력하신 내용 중 먼저 확인이 필요한 부분이 있습니다. 태블릿을 직원에게 보여주세요.`

---

## CORE_05 함께 좋아지고 싶은 부분

질문:
> 함께 좋아졌으면 하는 부분이 있나요?

보조:
> 여러 개 선택할 수 있습니다.

variable:
`secondary_goals[]`

options:

- sleep
- digestion
- bowel
- urinary
- fatigue
- pain
- weight
- stress
- women
- skin
- none

exclusive:
`none`

---

## CORE_06 피로 Quick Screen

질문:
> 평소 기운과 회복력은 어떠신가요?

variable:
`energy_recovery`

options:

- good
- tired_recovers_with_rest
- frequent_fatigue
- poor_recovery

labels:

- 기운이 괜찮아요
- 피곤하지만 쉬면 회복돼요
- 자주 피곤해요
- 쉬어도 회복이 잘 안 돼요

---

## CORE_07 수면 Quick Screen

질문:
> 요즘 잠은 어떠신가요?

variable:
`sleep_screen`

options:

- normal
- onset
- maintenance
- early_waking
- nonrestorative
- multiple

---

## CORE_08 소화 Quick Screen

질문:
> 평소 식사와 소화는 어떠신가요?

variable:
`digestion_screen`

options:

- normal
- occasional
- frequent
- severe

---

## CORE_09 대변 Quick Screen

질문:
> 평소 대변은 어떠신가요?

variable:
`bowel_screen`

options:

- normal
- constipation
- loose_diarrhea
- alternating
- post_defecation_discomfort

---

## CORE_10 소변 Quick Screen

질문:
> 평소 소변이나 방광에 불편한 점이 있나요?

variable:
`urinary_screen[]`

input:
multi_choice

options:

- frequency
- nocturia
- urgency
- weak_or_incomplete
- dysuria
- other_discomfort
- none

exclusive:
none

---

## CORE_11 한열 Quick Screen

질문:
> 평소 추위와 더위 중 어느 쪽에 더 민감한가요?

variable:
`thermal_tendency`

options:

- cold_sensitive
- heat_sensitive
- both
- normal

---

## CORE_12 갈증

질문:
> 평소 갈증은 어떠신가요?

variable:
`thirst_level`

options:

- low
- normal
- frequent
- severe

### CORE_12A 물 온도 선호

show_if:
```text
thirst_level in [frequent, severe]
```

질문:
> 물을 마실 때 어떤 쪽이 더 편한가요?

variable:
`drink_temp_preference`

options:

- cold
- lukewarm
- warm
- no_preference

---

## CORE_13 땀

질문:
> 평소 땀은 어떠신가요?

variable:
`sweat_screen[]`

input:
multi_choice

options:

- low
- high
- exertion_excessive
- night_sweat
- normal

exclusive:
normal

---

## CORE_14 스트레스

질문:
> 최근 스트레스나 긴장을 어느 정도 느끼시나요?

variable:
`stress_level`

options:

- minimal
- occasional
- frequent
- severe

---

## CORE_15 여성 생식상태 Quick Screen

show_if:
```text
patient_sex == female
```

질문:
> 현재 해당되는 상태가 있나요?

보조:
> 해당되는 항목을 모두 선택해주세요.

variable:
`reproductive_status[]`

input:
`multi_choice`

options:

- `pregnant`: 임신 중이에요
- `postpartum_1y`: 출산 후 1년 이내예요
- `breastfeeding`: 모유수유 중이에요
- `trying_conception`: 임신을 준비 중이에요
- `none`: 해당 없음

exclusive:
`none`

validation:

```text
pregnant AND postpartum_1y cannot coexist
```

routing:
- `pregnant` → PREGNANCY module
- `postpartum_1y` → POSTPARTUM module
- `breastfeeding` → 원장 요약 Safety/Context에 표시
- `trying_conception` → 원장 요약 Context에 표시

※ 임신 여부가 불확실한 환자를 위한 `possible / unknown`은 PRG_00에서 별도 확인한다.

---

# 6. ROUTER

모듈 실행 순서는 아래를 기본으로 한다.

```text
SLEEP
→ GI
→ BOWEL
→ URINARY
→ PAIN
→ FATIGUE
→ THERMAL
→ STRESS
→ WOMEN
→ PREGNANCY
→ POSTPARTUM
→ WEIGHT_METABOLIC
```

모듈이 활성화되지 않으면 완전히 skip.

## 6.1 Sleep

```text
sleep_screen != normal
OR primary_goal_category == sleep
OR secondary_goals contains sleep
```

## 6.2 GI

```text
digestion_screen != normal
OR primary_goal_category == digestion
OR secondary_goals contains digestion
```

## 6.3 Bowel

```text
bowel_screen != normal
OR secondary_goals contains bowel
```

## 6.4 Urinary

```text
urinary_screen != [none]
OR primary_goal_category == urinary
OR secondary_goals contains urinary
```

## 6.5 Pain

```text
primary_goal_category == pain
OR secondary_goals contains pain
```

## 6.6 Fatigue

```text
energy_recovery in [frequent_fatigue, poor_recovery]
OR primary_goal_category == fatigue
OR secondary_goals contains fatigue
```

## 6.7 Thermal

```text
thermal_tendency != normal
OR primary_goal_category == constitution
OR WOMEN module active
```

## 6.8 Stress

```text
stress_level in [frequent, severe]
OR secondary_goals contains stress
```

## 6.9 Women

```text
patient_sex == female
AND (
  primary_goal_category == women
  OR secondary_goals contains women
)
```

※ 단순히 여성이라는 이유만으로 긴 WOMEN module 전체를 열지 않는다.

## 6.10 Pregnancy

```text
patient_sex == female
AND (
  reproductive_status contains pregnant
  OR pregnancy_status == pregnant
)
```

## 6.11 Postpartum

```text
patient_sex == female
AND reproductive_status contains postpartum_1y
```

## 6.12 Weight/Metabolic

```text
primary_goal_category == weight_metabolic
OR secondary_goals contains weight
```

---

# 6A. UNSUPPORTED PRIMARY GOAL FALLBACK

v0.1에서 전용 세부모듈이 아직 없는 `skin`, `respiratory`를 선택한 경우 최소한의 주소증 정보를 잃지 않도록 1문항만 추가한다.

## GEN_01

show_if:
```text
primary_goal_category in [skin, respiratory]
```

질문:
> 가장 불편한 증상을 짧게 적어주세요.

variable:
`chief_detail_short`

input:
`short_text`

required:
Y

※ v0.2에서 실제 사용빈도를 확인한 뒤 Skin / Respiratory 전용 모듈 신설 여부를 결정한다.

---

# 7. SLEEP MODULE

## SLP_01

질문:
> 잠에서 어떤 점이 불편하신가요?

variable:
`slp_problem[]`

options:

- onset
- maintenance
- early_waking
- nonrestorative
- daytime_sleepiness
- other

## SLP_02 입면시간

show_if:
```text
slp_problem contains onset
OR sleep_screen == onset
OR sleep_screen == multiple
```

질문:
> 누워서 잠들기까지 보통 얼마나 걸리나요?

variable:
`slp_latency`

options:

- within_15m
- 15_30m
- 30_60m
- over_60m
- unknown

summary tag:
```text
if slp_latency in [30_60m, over_60m]:
    "입면지연"
```

## SLP_03 중간각성 횟수

show_if:
```text
slp_problem contains maintenance
OR sleep_screen == maintenance
OR sleep_screen == multiple
```

질문:
> 자는 동안 보통 몇 번 정도 깨시나요?

variable:
`slp_awakenings`

options:

- none
- once
- two_three
- four_plus
- unknown

## SLP_03A 중간각성 이유

show_if:
```text
slp_awakenings in [once, two_three, four_plus]
```

질문:
> 깨어나는 이유가 있나요?

variable:
`slp_waking_reason[]`

options:

- nocturia
- pain
- heat_sweat
- rumination
- no_clear_reason
- unknown

## SLP_04 조기각성

show_if:
```text
slp_problem contains early_waking
OR sleep_screen == early_waking
OR sleep_screen == multiple
```

질문:
> 원하는 시간보다 얼마나 일찍 깨시나요?

variable:
`slp_early_waking_gap`

options:

- within_30m
- 30_60m
- 1_2h
- over_2h
- variable

## SLP_05 아침 회복감

질문:
> 아침에 일어났을 때 몸은 어떠신가요?

variable:
`slp_morning_recovery`

options:

- refreshed
- slightly_tired
- very_tired
- nonrestorative

## SLP_06 수면 문제 기간

show_if:
```text
primary_goal_category != sleep
```

질문:
> 이런 수면 문제가 얼마나 되었나요?

variable:
`slp_duration`

options:
- within_1m
- 1_3m
- 3m_1y
- 1_5y
- over_5y
- unknown

---

# 8. GI MODULE

## GI_01 식욕

질문:
> 요즘 식욕은 어떠신가요?

variable:
`gi_appetite`

options:

- normal
- low
- high
- variable

## GI_02 주요 증상

질문:
> 주로 어떤 불편함이 있나요?

variable:
`gi_symptoms[]`

options:

- postprandial_fullness
- early_satiety
- heartburn
- reflux
- belching
- gas
- nausea
- epigastric_or_abdominal_pain
- unclear

## GI_03 식사와 관계

질문:
> 언제 가장 불편한가요?

variable:
`gi_meal_relation[]`

options:

- immediately_after_meal
- overeating
- fasting
- specific_food
- no_relation
- unknown

## GI_04 악화요인

질문:
> 특히 불편해지는 때가 있나요?

variable:
`gi_aggravators[]`

options:

- stress
- fatigue
- cold_food
- spicy_irritant
- fatty_food
- alcohol
- no_clear_trigger

## GI_05 구토

show_if:
```text
gi_symptoms contains nausea
OR primary_goal_category == digestion
```

질문:
> 실제로 토하는 경우도 있나요?

variable:
`gi_vomiting_frequency`

options:

- none
- occasional
- frequent

flag:
```text
if frequent:
    flags.gi_recurrent_vomiting = true
    flags.requires_doctor_review = true
```

## GI_06 기간

show_if:
```text
primary_goal_category != digestion
```

variable:
`gi_duration`

options:
- within_1m
- 1_3m
- 3m_1y
- 1_5y
- over_5y
- unknown

---

# 9. BOWEL MODULE

## BOW_01 횟수

질문:
> 대변은 보통 얼마나 자주 보시나요?

variable:
`bow_frequency`

options:

- two_plus_daily
- daily
- every_two_days
- every_three_plus_days
- variable

## BOW_02 형태

질문:
> 평소 대변 모양은 어느 쪽에 가까운가요?

variable:
`bow_form`

options:

- pellets_hard
- firm_large
- formed_normal
- mushy
- watery
- variable

## BOW_03 배변 특징

질문:
> 대변을 볼 때 불편한 점이 있나요?

variable:
`bow_defecation_features[]`

options:

- straining
- incomplete
- urgency
- pain_relief_after_defecation
- none

exclusive:
none

## BOW_04 출혈/흑변

질문:
> 최근 대변에 피가 보이거나 검게 나온 적이 있나요?

variable:
`bow_blood`

options:

- none
- bright_red
- black
- unknown

flags:

```text
if bright_red:
    flags.requires_doctor_review = true

if black:
    flags.possible_gi_bleeding = true
    flags.requires_staff_check = true
```

---

# 10. URINARY MODULE

## URI_01 주간 빈도

질문:
> 낮 동안 소변을 얼마나 자주 보시나요?

variable:
`uri_day_frequency`

options:

- normal
- slightly_frequent
- every_1_2h
- less_than_1h
- unknown

## URI_02 야간뇨

질문:
> 잠든 뒤 소변 때문에 몇 번 정도 깨시나요?

variable:
`uri_nocturia`

options:

- zero
- one
- two
- three_plus

현재 v0.1에서는 SLEEP module이 `야간뇨 때문에 깬다`는 원인만 저장하고 야간뇨 횟수 자체는 저장하지 않으므로,
URINARY module이 활성화된 경우 URI_02는 유지한다.

향후 SLEEP 화면에서 야간뇨 횟수까지 동일 변수 `uri_nocturia`로 받게 되면 자동 skip하도록 변경한다.

## URI_03 저장증상

질문:
> 소변을 참는 데 불편한 점이 있나요?

variable:
`uri_storage_symptoms[]`

options:

- urgency
- urgency_incontinence
- stress_incontinence
- none

## URI_04 배뇨증상

질문:
> 소변이 나올 때는 어떠신가요?

variable:
`uri_voiding_symptoms[]`

options:

- normal
- weak_stream
- hesitancy
- intermittent
- incomplete_emptying

## URI_05 배뇨통

질문:
> 소변을 볼 때 아프거나 불편한가요?

variable:
`uri_dysuria`

options:

- none
- mild
- painful_burning
- severe

## URI_05A 급성 경고

show_if:
```text
uri_dysuria in [painful_burning, severe]
```

질문:
> 함께 나타나는 증상이 있나요?

variable:
`uri_acute_warning[]`

options:

- fever
- severe_flank_pain
- visible_blood
- none

flag:
```text
if any except none:
    flags.urinary_warning = true
    flags.requires_doctor_review = true
```

## URI_06 방광 통증 관계

질문:
> 방광이나 아랫배 통증이 소변 양과 관련이 있나요?

variable:
`uri_bladder_pain_relation`

options:

- worse_with_filling
- relief_after_voiding
- unrelated
- no_pain
- unknown

---

# 11. PAIN MODULE

## PAIN_01 위치

질문:
> 어디가 가장 불편한가요?

variable:
`pain_locations[]`

options:

- head_face
- neck
- shoulder
- thoracic_back
- low_back
- pelvis_buttock
- arm_elbow
- hand_wrist
- knee
- leg
- foot_ankle
- other

## PAIN_02 대표 위치

show_if:
```text
pain_locations.count > 1
```

질문:
> 그중 가장 불편한 곳은 어디인가요?

options:
- dynamically use `pain_locations`

variable:
`pain_primary_location`

## PAIN_03 NRS

질문:
> 가장 아플 때의 통증은 0~10 중 어느 정도인가요?

input:
large_number_buttons_or_numeric

variable:
`pain_nrs`

validation:
0 <= value <= 10

## PAIN_04 악화 상황

질문:
> 통증은 언제 더 심해지나요?

variable:
`pain_aggravating_context[]`

options:

- movement
- prolonged_sitting
- prolonged_standing
- walking
- rest
- night
- morning
- specific_motion
- variable

## PAIN_05 신경증상

질문:
> 통증과 함께 이런 증상이 있나요?

variable:
`pain_neuro_symptoms[]`

options:

- tingling
- numbness
- radiating_pain
- weakness_feeling
- none

flag:
```text
if weakness_feeling:
    flags.requires_doctor_review = true
```

## PAIN_06 중추 신경학적/외상 경고

show_if:
```text
pain_locations intersects [low_back, pelvis_buttock, leg, foot_ankle]
```

질문:
> 최근 아래와 같은 변화가 있었나요?

variable:
`pain_red_flags[]`

options:

- sudden_major_leg_weakness
- saddle_numbness
- new_bladder_bowel_control_problem
- major_trauma
- none

flags:

```text
if any of first 3:
    flags.neurologic_warning = true
    flags.requires_staff_check = true

if major_trauma:
    flags.major_trauma = true
    flags.requires_doctor_review = true
```

## PAIN_07 시작 계기

질문:
> 처음 시작될 때 특별한 계기가 있었나요?

variable:
`pain_onset_context`

options:

- spontaneous
- exercise_overuse
- work_related
- fall_impact
- traffic_accident
- post_procedure_surgery
- unknown

---

# 12. FATIGUE MODULE

## FAT_01 시간대

질문:
> 피로를 가장 많이 느끼는 때는 언제인가요?

variable:
`fatigue_time_pattern`

options:

- morning
- afternoon
- evening
- all_day
- variable

## FAT_02 휴식 반응

질문:
> 쉬거나 자고 나면 피로가 회복되나요?

variable:
`fatigue_rest_response`

options:

- mostly_recovers
- partly_recovers
- poorly_recovers
- not_refreshed_at_all

## FAT_03 활동 내구도

질문:
> 평소 활동할 때는 어떠신가요?

variable:
`fatigue_exertion`

options:

- baseline
- tires_easily
- stairs_walking_difficult
- basic_activity_difficult

## FAT_04 비의도적 체중감소

질문:
> 최근 특별한 이유 없이 체중이 줄었나요?

variable:
`unintentional_weight_loss`

options:

- no
- slight
- noticeable
- unknown

flag:
```text
if noticeable:
    flags.requires_doctor_review = true
```

---

# 13. THERMAL MODULE

## THR_01 수족냉

질문:
> 손이나 발이 차다고 느끼시나요?

variable:
`thermal_cold_extremities`

options:

- none
- occasional
- frequent
- almost_always

## THR_02 상열감

질문:
> 얼굴이나 상체로 열이 오르는 느낌이 있나요?

variable:
`thermal_upper_heat`

options:

- none
- occasional
- frequent
- very_frequent

## THR_03 냉감 위치

show_if:
```text
thermal_tendency in [cold_sensitive, both]
```

질문:
> 추울 때 특히 불편한 곳이 있나요?

variable:
`thermal_cold_location[]`

options:

- hands
- feet
- abdomen
- low_back
- whole_body
- none_specific

---

# 14. STRESS MODULE

## STR_01 신체 반응

질문:
> 스트레스를 받으면 몸에서 어떤 변화가 가장 잘 나타나나요?

variable:
`stress_body_response[]`

options:

- sleep_worse
- digestion_worse
- palpitation_chest_tightness
- head_neck_shoulder_tension
- irritability
- energy_drop
- no_change

## STR_02 정서 패턴

질문:
> 요즘 마음 상태는 어느 쪽에 가까운가요?

variable:
`emotional_pattern`

options:

- calm
- worry
- irritable
- low_mood_low_motivation
- mixed

## STR_03 기간

show_if:
```text
primary_goal_category != stress
```

질문:
> 이런 상태가 얼마나 되었나요?

variable:
`stress_duration`

options:
- within_1m
- 1_3m
- 3m_1y
- 1_5y
- over_5y
- unknown

---

# 15. WOMEN MODULE

## WOM_01 생리/폐경 상태

질문:
> 현재 어느 상태에 해당하시나요?

variable:
`female_stage`

options:

- menstruating
- becoming_irregular
- menopause
- no_menses_due_to_surgery
- unknown

## WOM_02 규칙성

show_if:
```text
female_stage == menstruating
```

질문:
> 생리 주기는 어떠신가요?

variable:
`menstrual_regularity`

options:

- regular
- slightly_irregular
- very_irregular
- months_without_period

## WOM_03 양

show_if:
```text
female_stage in [menstruating, becoming_irregular]
```

질문:
> 생리량은 어떠신가요?

variable:
`menstrual_flow`

options:

- low
- normal
- high
- variable

## WOM_04 생리통

show_if:
```text
female_stage in [menstruating, becoming_irregular]
```

질문:
> 생리할 때 통증은 어떠신가요?

variable:
`dysmenorrhea_severity`

options:

- none
- mild
- needs_analgesic
- limits_daily_activity

## WOM_05 생리 전후 동반증상

show_if:
```text
female_stage in [menstruating, becoming_irregular]
```

질문:
> 생리 전후로 불편한 점이 있나요?

variable:
`menstrual_associated[]`

options:

- breast_tenderness
- bloating
- headache
- mood_change
- edema
- fatigue
- none

## WOM_06 갱년기 열감

show_if:
```text
female_stage in [becoming_irregular, menopause]
```

질문:
> 얼굴이나 상체에 갑자기 열이 오르나요?

variable:
`meno_hot_flash`

options:

- none
- occasional
- several_daily
- very_frequent

## WOM_07 야간 발한

show_if:
```text
female_stage in [becoming_irregular, menopause]
```

질문:
> 밤에 열이나 땀 때문에 깨나요?

variable:
`meno_night_sweat`

options:

- none
- occasional
- frequent
- almost_daily

## WOM_08 갱년기 동반증상

show_if:
```text
female_stage in [becoming_irregular, menopause]
```

질문:
> 함께 불편한 점이 있나요?

variable:
`meno_symptoms[]`

options:

- sleep
- palpitation
- mood_change
- vaginal_dryness
- urinary
- fatigue
- none

---

# 16. PREGNANCY STATUS / PREGNANCY MODULE

## PRG_00 임신 가능성

MVP에서는 아래 조건일 때만 표시한다.

```text
patient_sex == female
AND reproductive_status does not contain pregnant
AND (
  primary_goal_category == pregnancy_postpartum
  OR reproductive_status contains trying_conception
  OR doctor/clinic configuration requests pregnancy safety check
)
```

질문:
> 현재 임신 중이거나 임신 가능성이 있나요?

variable:
`pregnancy_status`

options:

- no
- pregnant
- possible
- unknown

flag:

```text
if pregnancy_status in [possible, unknown]:
    flags.pregnancy_possible = true
    flags.requires_doctor_review = true
```

routing:

```text
if pregnancy_status == pregnant:
    activate PREGNANCY module
```

※ `가임 가능성이 있는 여성`의 구체적 연령 범위는 아직 확정하지 않으며 clinic configuration 값으로 둔다.

## PRG_01 임신 주수

show_if:
```text
pregnancy_status == pregnant
```

질문:
> 현재 임신 몇 주인가요?

variable:
`pregnancy_week`

input:
numeric

validation:
1..45

## PRG_02 임신 중 불편

show_if:
```text
pregnancy_status == pregnant
```

질문:
> 현재 특별히 불편한 점이 있나요?

variable:
`pregnancy_symptoms[]`

options:

- nausea_vomiting
- dyspepsia
- constipation
- edema
- low_back_pelvic_pain
- sleep
- fatigue
- other

## PRG_03 임신 경고증상

show_if:
```text
pregnancy_status == pregnant
```

질문:
> 최근 아래 증상이 있나요?

variable:
`pregnancy_warning[]`

options:

- vaginal_bleeding
- severe_abdominal_pain
- severe_headache_visual_change
- sudden_severe_edema
- none

flag:

```text
if any except none:
    flags.pregnancy_warning = true
    flags.requires_staff_check = true
```

---

# 17. POSTPARTUM MODULE

show_if:
```text
reproductive_status contains postpartum_1y
```

## PP_01 기간

질문:
> 출산한 지 얼마나 되었나요?

variable:
`postpartum_period`

options:

- within_2w
- 2_6w
- 6w_3m
- 3_6m
- 6_12m

## PP_02 출산 방식

질문:
> 어떤 방법으로 출산하셨나요?

variable:
`delivery_type`

options:

- vaginal
- cesarean
- other

## PP_03 수유

질문:
> 현재 수유하고 계신가요?

variable:
`breastfeeding_status`

options:

- exclusive_breastfeeding
- mixed
- formula
- completed

## PP_04 주요 고민

질문:
> 출산 후 가장 불편한 부분은 무엇인가요?

variable:
`postpartum_concerns[]`

options:

- fatigue
- sleep_deprivation
- sweating_heat
- cold_sensation
- low_back_pelvic_pain
- pelvic_floor_urinary
- abdominal_recovery
- digestion_bowel
- edema
- emotional_change

## PP_05 골반저

질문:
> 골반저와 관련해 불편한 점이 있나요?

variable:
`postpartum_pelvic_floor[]`

options:

- urinary_leak
- urgency
- pelvic_pressure
- perineal_pain
- dyspareunia
- none

## PP_06 산후 경고증상

질문:
> 현재 아래 증상이 있나요?

variable:
`postpartum_warning[]`

options:

- suddenly_increased_bleeding
- fever_severe_lower_abdominal_pain
- dyspnea_chest_pain
- unilateral_leg_swelling_pain
- none

flag:

```text
if any except none:
    flags.postpartum_warning = true
    flags.requires_staff_check = true
```

---

# 18. WEIGHT / METABOLIC MODULE

## WM_01 목적

질문:
> 체중과 관련해 어떤 것이 가장 고민인가요?

variable:
`weight_goal`

options:

- lose_weight
- recent_gain
- underweight_loss
- metabolic_health
- constitution

## WM_02 식사패턴

질문:
> 특히 식사를 조절하기 어려운 때가 있나요?

variable:
`eating_pattern[]`

options:

- large_meals
- frequent_snacks
- late_night_eating
- stress_eating
- sweets_craving
- no_major_issue

## WM_03 최근 체중변화

질문:
> 최근 체중 변화는 어떠신가요?

variable:
`recent_weight_change`

options:

- stable
- gradual_gain
- rapid_gain
- gradual_loss
- unexplained_rapid_loss

flag:
```text
if unexplained_rapid_loss:
    flags.requires_doctor_review = true
```

※ 식욕은 `gi_appetite`가 이미 있으면 재사용하고 다시 묻지 않는다.

---

# 19. COMMON HISTORY

# HIS_01 과거력

질문:
> 현재 치료받고 있거나 진단받은 질환이 있나요?

variable:
`medical_history[]`

options:

- hypertension
- diabetes
- dyslipidemia
- heart_disease
- cerebrovascular
- liver_disease
- kidney_disease
- thyroid
- cancer
- mental_health
- other
- none

exclusive:
none

## HIS_01A 기타 질환

show_if:
```text
medical_history contains other
```

variable:
`medical_history_other`

input:
short_text

---

## HIS_02 수술/입원

질문:
> 큰 수술이나 입원 치료를 받은 적이 있나요?

variable:
`major_surgery_history`

options:
- no
- yes

### HIS_02A

show_if:
`yes`

질문:
> 최근 또는 중요한 수술·입원만 짧게 적어주세요.

variable:
`major_surgery_text`

input:
short_text

---

## HIS_03 알레르기

질문:
> 약이나 음식 때문에 심한 알레르기 반응을 경험한 적이 있나요?

variable:
`allergy_history`

options:

- no
- yes
- unknown

### HIS_03A

show_if:
yes

variable:
`allergy_detail`

input:
short_text

---

# 20. MEDICATION

## MED_01

질문:
> 현재 정기적으로 먹는 약이 있나요?

variable:
`medication_status`

options:

- none
- yes
- unknown

## MED_02

show_if:
```text
medication_status == yes
```

질문:
> 어떤 종류의 약인가요?

variable:
`medications[]`

options:

- antihypertensive
- diabetes
- lipid_lowering
- anticoagulant_antiplatelet
- sleep_psychiatric
- hormone
- analgesic
- other
- unknown

## MED_03 안내

show_if:
```text
medication_status in [yes, unknown]
```

display_only:
> 약봉투나 처방전이 있으시면 진료할 때 보여주세요.

---

# 21. RECENT TESTS

## TST_01

질문:
> 최근 병원 검사에서 이상이 있다고 들은 것이 있나요?

variable:
`recent_abnormal_tests[]`

options:

- none
- blood_test
- liver_kidney
- glucose
- thyroid
- endoscopy
- cardiac
- imaging
- other
- unknown

## TST_02

show_if:
```text
recent_abnormal_tests has any except [none, unknown]
```

질문:
> 기억나는 내용이 있으면 짧게 적어주세요.

variable:
`test_note`

input:
short_text

required:
N

---

# 22. BIRTH INFORMATION

화면 상단 설명:

> 체질 분석에 참고하기 위해 출생정보를 확인합니다.

## BIR_01 생년월일

variable:
`birth_date`

input:
date

required:
Y

## BIR_02 양력/음력

질문:
> 양력인가요, 음력인가요?

variable:
`birth_calendar`

options:

- solar
- lunar
- unknown

## BIR_03 출생시간 확실성

질문:
> 태어난 시간을 알고 계신가요?

variable:
`birth_time_certainty`

options:

- exact
- approximate
- unknown

## BIR_04 출생시간대

show_if:
```text
birth_time_certainty in [exact, approximate]
```

질문:
> 태어난 시간대에 가장 가까운 것을 선택해주세요.

variable:
`birth_time_branch`

options:

| label | value |
|---|---|
| 밤 11시~새벽 1시 (자시) | zi |
| 새벽 1~3시 (축시) | chou |
| 새벽 3~5시 (인시) | yin |
| 새벽 5~7시 (묘시) | mao |
| 오전 7~9시 (진시) | chen |
| 오전 9~11시 (사시) | si |
| 오전 11시~오후 1시 (오시) | wu |
| 오후 1~3시 (미시) | wei |
| 오후 3~5시 (신시) | shen |
| 오후 5~7시 (유시) | you |
| 오후 7~9시 (술시) | xu |
| 오후 9~11시 (해시) | hai |

※ 야자시/조자시, 진태양시, 윤달 등 계산 규칙은 이 문진 명세 범위 밖이며 별도 deterministic 명리 엔진에서 처리.

---

# 23. SUBMIT

## END_01

문구:

> 정밀문진이 완료되었습니다.

체크 표시:

- 현재 불편한 부분
- 전반적인 몸 상태
- 병력과 복용약
- 체질 분석 정보

보조:
> 입력하신 내용을 정리해 원장님 진료를 준비하겠습니다.

버튼:
- 완료

action:

```text
1. validate required fields
2. save server-side
3. set submission_status = completed
4. close session
5. clear patient-identifiable client state
6. clear browser history/state if applicable
7. return to start screen
```

---

# 24. 중복 질문 제거 규칙

## 24.1 기간

```text
if primary_goal_category == module:
    module_duration = chief_duration
    do not ask module duration
```

적용:
- sleep
- digestion
- stress
- pain

## 24.2 야간뇨

수면 모듈에서 `slp_waking_reason = nocturia`라고 입력하더라도 횟수가 없으므로
`uri_nocturia`는 필요 시 별도 확인한다.

향후 SLP 문항에서 횟수까지 받게 되면 동일 변수 공유로 전환.

## 24.3 식욕

```text
if gi_appetite is not null:
    WEIGHT module does not ask appetite
```

## 24.4 상열/야간 발한

Thermal/Women/Sleep 간 동일 현상을 반복 질문하지 않도록,
가능하면 같은 원시 변수(raw variable)를 공유하고 모듈별 interpretation tag만 생성.

---

# 25. FLAG 체계

flag는 진단명이 아니라 **확인 우선순위**다.

권장 단계:

```text
red:
    requires_staff_check = true

amber:
    requires_doctor_review = true

info:
    relevant_context = true
```

## Red 예시

- general red flag
- 흑변 응답
- 급격한 신경학적 변화
- 임신 중 경고증상
- 산후 경고증상

## Amber 예시

- 반복 구토
- 힘 빠지는 느낌
- 비의도적 체중감소
- 임신 가능성 불확실
- 배뇨통 + 일부 동반증상

환자 화면에서는 질환명 추정 금지.

---

# 26. 원장용 구조화 Summary Schema

```json
{
  "patient": {
    "name": "",
    "age": null,
    "sex": "",
    "reproductive_status": []
  },
  "visit": {
    "primary_goal": "",
    "duration": "",
    "impact": ""
  },
  "chief_summary": [],
  "patterns": {
    "sleep": [],
    "digestion": [],
    "bowel": [],
    "urinary": [],
    "pain": [],
    "fatigue": [],
    "thermal": [],
    "stress": [],
    "women": [],
    "pregnancy_postpartum": [],
    "weight_metabolic": []
  },
  "history": [],
  "medications": [],
  "tests": [],
  "birth_info": {},
  "flags": {
    "red": [],
    "amber": []
  },
  "doctor_check": []
}
```

## 26.1 요약 출력 원칙

- 사실 기반
- 환자 응답을 요약
- 추정 진단명 자동 생성 금지
- 상충하는 데이터는 둘 다 보존
- 불확실한 답은 `미확인`으로 표시
- 질문하지 않은 영역은 `정상`으로 간주하지 않음

잘못된 예:
> 위음허로 판단됨.

좋은 예:
> 갈증 잦음 / 찬물 선호 / 식후 팽만 / 변비 경향

---

# 27. 원장 화면 예시

```text
김○○ / 68F
한약 정밀초진

[오늘의 목표]
중간각성 개선

[기간 / 영향]
5년 이상
생활에 제법 영향

[수면]
- 중간각성 2~3회
- 야간뇨 때문에 깸
- 아침 회복감 낮음

[한열·수분]
- 추위 민감
- 수족냉 자주
- 상열감 가끔
- 갈증 잦음
- 찬물 선호

[소화]
- 식후 팽만
- 트림·가스
- 스트레스 시 악화

[대변]
- 3일 이상 1회
- 작고 딱딱한 변
- 힘줌 / 잔변감

[병력]
- 고혈압

[복용약]
- 혈압약
- 정확한 약명 미확인

[RED FLAG]
- 없음

[원장 확인 필요]
- 정확한 복용약명
```

---

# 28. 자동저장

권장:

```text
on every answer:
    save to server
```

네트워크가 끊긴 경우:

1. 임시 memory/local encrypted queue 고려
2. 연결 복구 시 sync
3. 환자 세션 종료 후 로컬 데이터 삭제

MVP에서 구현 복잡도가 높으면:
- 화면 전환 시 API save
- 실패 시 재시도
- 실패 상태를 환자에게 기술 오류로 표시하지 않고 직원 호출

---

# 29. 개인정보 / 세션

## 필수

- 환자용 화면에 과거 환자 데이터 노출 금지
- 자동완성 off
- 브라우저 form history off
- 세션 완료 즉시 client state clear
- localStorage에 환자식별정보 장기 저장 금지
- 뒤로가기 시 이전 환자 session 복원 금지
- 일정 시간 비활성 시 직원 확인 화면으로 전환하되 환자 답변은 서버에 자동저장

## 운영용 Admin 기능은 별도

환자 웹앱에서 admin URL/설정 접근 불가하도록 분리.

---

# 30. Prototype Acceptance Criteria

v0.1 프로토타입 성공조건:

1. 65세 이상 환자가 직원 개입 없이 기본 Core를 완료 가능
2. 한 질문당 스크롤이 거의 없음
3. 버튼 오선택 후 뒤로가기/수정 가능
4. `없음` exclusive 로직 정확
5. Router가 필요한 모듈만 표시
6. 같은 정보를 반복 질문하지 않음
7. Red flag 발생 시 정확히 표시
8. 완료 후 환자정보가 화면에 남지 않음
9. 원장용 summary JSON 생성 가능
10. 총 작성시간:
   - 단순 환자 5~8분 목표
   - 복합 환자 8~12분 목표

---

# 31. Usability Test v0.1 → v0.2

초기 10~20명에서 기록할 최소 항목:

- 총 작성시간
- 직원 도움 필요 여부
- 도움 요청 screen_id
- 뒤로가기 횟수
- 미완료/이탈 screen_id
- 환자가 이해 못 한 표현
- `기타` 선택 빈도
- 원장이 추가로 다시 물어본 항목
- 원장이 불필요하다고 평가한 항목

핵심 KPI:

```text
1. 환자 completion rate
2. 직원 intervention rate
3. 평균 작성시간
4. 원장 재질문률
5. summary usefulness
```

연구 목적이 아니라 **운영 개선용**으로만 사용.

---

# 32. 개발 우선순위

## Phase 1 — Clickable Prototype

- 환자 UI
- Core
- Router
- 12개 모듈
- dummy submit
- 로컬 JSON 확인

## Phase 2 — MVP Backend

- session
- DB
- autosave
- submit
- flags
- raw response viewer

## Phase 3 — Doctor Summary

- deterministic summary mapper
- LLM summary layer
- doctor review screen

## Phase 4 — Integration

- 굿닥/EMR 환자 매칭 방식 확정
- 내부 환자 ID
- 원장 PC 접근
- 명리 deterministic module 연결

---

# 33. 개발자에게 넘길 핵심 원칙

> 종이 문진을 웹으로 옮기는 프로젝트가 아니다.

> 환자의 입력 부담을 최소화하면서 원장이 판단에 필요한 정보를 구조화해서 받는 routing questionnaire다.

> `질문하지 않음(null)`과 `정상(none/normal)`을 절대 혼동하지 않는다.

> AI는 환자가 답하지 않은 내용을 채우지 않는다.

> Red flag는 진단이 아니라 확인 알림이다.

> 문진 완료 후 환자 개인정보가 태블릿 화면/브라우저에 남지 않아야 한다.

---

# 34. v0.2 이전 미확정 항목

다음은 실제 프로토타입/원장 검토 후 확정:

1. 피부/호흡기 주소증 전용 module 추가 여부
2. Women module의 추가 자동 활성 조건 필요 여부
3. 임신 가능성 질문 대상 연령 범위/clinic configuration
4. 출생시간 정확 입력(시:분) 옵션 추가 여부
5. 명리용 출생지 입력 필요 여부
6. 과거력 세부 카테고리 추가
7. 복용약 OCR 도입 여부
8. 검사결과 촬영 기능
9. 음성입력 지원
10. body map 도입
11. Progress 표시를 `%`로 할지 단계형으로 할지
12. 태블릿 세로 고정 vs 회전 허용
13. inactivity timeout 시간
14. 직원 도움 요청 시 실제 알림 방식
15. 굿닥/동의보감과 환자 ID 자동연결 방식

---

# 35. 최종 한 문장

**삼인당 상세문진 v0.1은 모든 환자에게 긴 설문을 강제하는 시스템이 아니라, 짧은 Core scan으로 필요한 임상 모듈만 열고 그 결과를 구조화해 원장의 판단 시간을 줄이는 독립형 임상 입력 시스템이다.**
