# 삼인당 태블릿 상세문진 Master Spec v1.0

이 문서는 v0.2를 대체하는 새 Source of Truth다. v0.2 문서
(`삼인당_태블릿_상세문진_Master_Spec_v0.2.md`)는 삭제·수정하지 않고 그대로 보존한다.

구현 위치: `src/spec/coreSpec.ts` (screen_id / variable / value / show_if는 이 문서와
1:1로 일치한다).

---

## 0. v0.2 대비 핵심 변경

v0.2의 `primary_goal_bucket` 9개 평면 선택 첫 화면 구조는 폐기한다.

v1.0의 문진 목적은 "모든 것을 묻는 것"이 아니다.

- 주호소/주목적 1개를 먼저 정한다.
- 동반문제는 최대 2개까지만 받는다.
- 모든 환자에게 모든 증상을 묻지 않는다.
- 필요한 상세 Module만 조건부로 연결한다(이번 Sprint는 연결점까지만).
- 안전정보(Red Flag, 여성 안전상태)는 모든 환자에게 최소한으로 확인한다.
- 한약 처방에 필요한 최소 전신정보(식욕/한열/갈증/땀)는 전원 공통으로 받는다.
- 중복 질문은 제거한다.
- null(보지 않은 질문) / none(해당없음) / unknown(모름)은 계속 구분한다.
- 뒤로가기로 현재 경로에서 무효가 된 응답은 stale response로 제거한다.
- Red Flag는 진단하지 않고 "직원 확인 필요"만 표시한다.

## 1. 재사용한 v0.2 기반

- `Responses` / `Question` / `Option` 타입 구조 (`src/types.ts`, 일부 필드 확장)
- `optionKey`, response state 저장 방식(screen_id -> value)
- `show_if` 기반 `visibleQuestions` / 순차 진행 방식
- `pruneStaleResponses` (stale branch cleanup) — 로직 변경 없이 그대로 재사용
- `StaffCheckScreen`, `HelpModal`, `ScreenShell`, `StepProgress`, `TextInputField`
- Dev JSON 화면(`DevJsonScreen`) 자체 구조, 단 payload 그룹은 v1.0으로 재구성
- 뒤로가기(`goBack`) / 진행(`goNext`) 로직

## 2. 화면 규격 (유지)

- target 800×1280 / max-width 680px / page padding 32px
- question 32px / option 23px / button min-height 72px / touch target 최소 56px
- deep green #2C3E35 / mint #A8D5B5 / background #FAFAF7
- one question per screen

### 2.1 v1.0 UX 변경: SingleChoice 자동 진행 폐기

기존 300ms auto-next를 제거했다. 모든 입력 타입이 동일하게 동작한다.

```
선택 → 선택 상태 명확히 표시 → 하단 "계속" 버튼으로 확정
```

MultiChoice는 기존과 동일하게 "선택 완료" 버튼으로 확정한다(자동 진행 없음).
뒤로가기와 "입력이 어려워요"는 위치·동작 그대로 유지한다.

### 2.2 상단 stage label

내부 로직 용어를 환자 화면에 그대로 노출하지 않는다. 동반문제·Red Flag 구간의
stage label은 "상담 내용"으로, 상세 증상 Module(Sleep 등) 구간은 "상세 증상"으로
표시한다(`STEPS` 배열/문항의 `step` 값). "Sleep Module", "Router", "Red Flag" 같은
내부 개발 용어는 화면에 노출하지 않는다. 전체 stage 목록: 환자 확인 / 방문 목적 /
상담 내용 / 상세 증상 / 전신 정보 / 병력정보 / 출생정보 / 마무리.

### 2.3 뷰포트 overflow

800×1280 기준에서 선택지가 적은 화면(3~4개)에도 바깥 스크롤바가 생기지 않도록
`html`/`body`/`#root`를 `100dvh` + `overflow: hidden`으로 고정하고, `.shell`은
그 100% 높이를 그대로 채운다. 화면 내부 스크롤은 `.shell__main`
(`overflow-y: auto`) 한 곳에서만 발생하며, 문항 목록이 실제로 뷰포트보다 긴
화면(예: 11개 선택지)에서만 그 내부 스크롤이 나타난다. 버튼/글자 크기는
변경하지 않았다.

## 3. 전체 환자 흐름

```
환자 확인 (ID_01~ID_03)
  ↓
VISIT_01 (오늘 가장 먼저 상담받고 싶은 것)
  ├─ symptom      → VISIT_02_SYMPTOM_MAIN → (other면 VISIT_02A) → VISIT_03 → VISIT_04
  ├─ women        → VISIT_02_WOMEN
  ├─ weight       → (추가 대분류 없음, Weight Module로 직접 연결 예정)
  └─ constitution → VISIT_02_CONST
  ↓
SECONDARY_01 (동반문제, 최대 2개) → (other면 SECONDARY_01A)
  ↓
SAFETY_01 (공통 Red Flag) → 양성이면 StaffCheckScreen
  ↓
[primary concern === sleep인 경우만] SLEEP_01 → SLEEP_02 → (night_awakenings면 SLEEP_03 → (기타면 SLEEP_03A))
  ↓
[primary concern === digestion인 경우만] GI_01 → GI_02 → GI_03
  ↓
[primary concern === bowel인 경우만] BOWEL_01 → BOWEL_02 → BOWEL_03 → (constipation이면 BOWEL_04)
  ↓
[primary concern === urinary인 경우만] URINARY_01 → URINARY_02 → (nocturia면 URINARY_03) → (incontinence면 URINARY_04)
  ↓
[primary concern === pain인 경우만] PAIN_01 → (other면 PAIN_01A) → PAIN_02 → PAIN_04 → (other면 PAIN_04A)
  ↓
[primary concern === fatigue인 경우만] FATIGUE_01 → FATIGUE_02 → FATIGUE_03
  ↓
[primary concern === stress인 경우만] STRESS_01 → STRESS_03
  ↓
[primary concern === women인 경우만] WOMEN_01 → (other면 WOMEN_01A) → (생리 관련 선택 시 WOMEN_02) → (menopause_symptoms면 WOMEN_03)
  ↓
[primary concern === pregnancy인 경우만] PREGNANCY_01 → (pregnant면 PREGNANCY_02) → PREGNANCY_03 → (other면 PREGNANCY_03A)
  ↓
[primary concern === postpartum인 경우만] POSTPARTUM_01 → POSTPARTUM_02 → (other면 POSTPARTUM_02A) → POSTPARTUM_03
  ↓
[primary concern === weight인 경우만] WEIGHT_01 → WEIGHT_02 → WEIGHT_03 → WEIGHT_04
  ↓
[visit_goal === constitution인 경우만] CONST_ENERGY / CONST_SLEEP / CONST_DIGESTION / CONST_BOWEL
  ↓
HERB_APPETITE / HERB_THERMAL / HERB_THIRST / HERB_SWEAT (전원 공통)
  ↓
MED_USE → (yes/unknown이면 MED_TYPES, 선택 사항)
  ↓
HISTORY_01 (중요 병력)
  ↓
ALLERGY_01 → (yes면 ALLERGY_02)
  ↓
SURGERY_01 → (yes면 SURGERY_02)
  ↓
[여성만] WOMEN_SAFETY_01
  ↓
TEST_01 (검사자료)
  ↓
BIRTH_01 / BIRTH_02 / BIRTH_03 → (알고 있으면 BIRTH_04)
  ↓
FREE_01 → (yes면 FREE_02)
  ↓
Dev JSON 완료 화면
```

## 4. 문항 전체 목록

표기: **필수**(required=true) / 선택(required=false). show_if가 없으면 always.

### 4.1 환자 확인 (재사용, 변경 없음)

| screen_id | variable | input | 필수 | 선택지 |
|---|---|---|---|---|
| ID_01 | patient_name | short_text | 필수 | - |
| ID_02 | phone_last4 | numeric(4) | 필수 | - |
| ID_03 | patient_sex | single_choice | 필수 | male / female |

### 4.2 방문 목적

**VISIT_01** `visit_goal` — single_choice — 필수
질문: "오늘 가장 먼저 상담받고 싶은 것은 무엇인가요?"
보조: "가장 중요한 한 가지를 골라주세요. 다른 불편함도 뒤에서 함께 확인합니다."

| value | label |
|---|---|
| symptom | 불편한 증상이 있어요 |
| women | 여성 건강·임신·산후 상담이에요 |
| weight | 체중 관리 상담이에요 |
| constitution | 체질·보약 상담을 받고 싶어요 |

`patient_sex === male`인 경우 `women` 선택지는 화면에 표시하지 않는다
(`VISIT_01.optionsIf`). 여성인 경우 4개 선택지를 그대로 표시한다. 그 외 질문·
분기·variable·stale cleanup은 변경하지 않는다.

**VISIT_02_SYMPTOM_MAIN** `primary_symptom` — single_choice — 필수 — show_if `visit_goal === symptom`
질문: "지금 가장 불편한 증상은 무엇인가요?"

| value | label |
|---|---|
| sleep | 잠이 불편해요 |
| digestion | 속이나 소화가 불편해요 |
| bowel | 대변이 불편해요 |
| pain | 아픈 곳이 있어요 |
| urinary | 소변이나 방광이 불편해요 |
| fatigue | 기운이 없고 피곤해요 |
| stress | 스트레스나 마음이 힘들어요 |
| other | 그 밖의 증상이 있어요 |

**VISIT_02A_SYMPTOM_OTHER** `primary_symptom_other` — short_text(50자) — 필수 — show_if `primary_symptom === other`
질문: "가장 불편한 증상을 짧게 적어주세요."

**VISIT_03_SYMPTOM_DURATION** `chief_duration` — single_choice — 필수 — show_if `visit_goal === symptom`
질문: "언제부터 불편하셨나요?"
선택지: within_1w(1주 이내) / 1w_1m(1주~1개월) / 1_3m(1~3개월) / 3m_1y(3개월~1년) / over_1y(1년 이상) / unknown(잘 모르겠어요)

**VISIT_04_SYMPTOM_IMPACT** `chief_impact` — single_choice — 필수 — show_if `visit_goal === symptom`
질문: "일상생활에 얼마나 영향을 주나요?"
선택지: minimal(거의 지장이 없어요) / mild(조금 불편해요) / moderate(많이 불편해요) / severe(일상생활이 어려울 정도예요)

**VISIT_02_WOMEN** `women_goal` — single_choice — 필수 — show_if `visit_goal === women`
질문: "어떤 상담이 가장 필요하신가요?"
선택지: women(생리·갱년기 등 여성 건강) / pregnancy(임신 관련 상담) / postpartum(출산 후 회복 상담)

> v0.2에서 pregnancy/postpartum을 하나의 enum(`pregnancy_postpartum`)으로 강제로
> 묶던 구조는 폐기했다. v1.0은 방문 목적 단계에서 women/pregnancy/postpartum을
> 구분한다. 실제 임신 주수·수유·출산시기 등은 향후 Pregnancy/Postpartum Module에서
> 다시 확인한다(공통 안전정보는 WOMEN_SAFETY_01에서 유지).

**VISIT_02_CONST** `constitution_goal` — single_choice — 필수 — show_if `visit_goal === constitution`
질문: "어떤 상담을 가장 원하시나요?"
선택지: constitution(체질과 전반적인 몸 상태를 보고 싶어요) / tonic(기력 보강·보약 상담을 받고 싶어요) / general(특별한 증상은 없지만 건강 관리를 상담하고 싶어요)

> "한약이 필요한지 상담받고 싶어요"(v0.2 herb_consult)는 삭제했다.

`weight`를 선택한 경우 추가 대분류 화면 없이 곧바로 동반문제 단계로 진행한다
(Weight Module 연결점은 9장 참고).

### 4.3 상담 내용(동반문제) · 공통 Red Flag

**SECONDARY_01** `secondary_concerns` — multi_choice — 필수 — 최대 2개, exclusive: none
질문: "함께 상담하고 싶은 다른 불편함이 있나요?"
보조: "최대 2개까지 선택해주세요."

| value | label |
|---|---|
| sleep | 잠 |
| digestion | 속·소화 |
| bowel | 대변 |
| pain | 통증 |
| urinary | 소변·방광 |
| fatigue | 피로·기력 |
| stress | 스트레스·마음 |
| women | 여성 건강 |
| weight | 체중 관리 |
| other | 그 밖의 증상 |
| none | 없음 |

규칙:
- 최대 2개까지만 선택 가능(3번째 선택 시 버튼 disabled).
- "없음"은 exclusive (선택 시 다른 값 전부 해제, 다른 값 선택 시 "없음" 해제).
- 이미 주호소로 선택한 항목과 동일한 value는 disabled가 아니라 목록에서 아예
  숨긴다(`primary_symptom` 그대로, `women_goal`의 women/pregnancy/postpartum은
  모두 women으로, `visit_goal === weight`는 weight로 정규화해서 제외 판단).
  예: primary concern이 sleep이면 목록에서 "잠"이 사라진다. visit_goal이
  women(생리·갱년기/임신/산후 어느 쪽이든)이면 "여성 건강"이 사라진다.
- `patient_sex === male`이면 "여성 건강" 선택지도 목록에서 숨긴다.
- 동반문제 때문에 전체 상세 Module을 반복 실행하지 않는다(9장).

**SECONDARY_01A** `secondary_other_text` — short_text(50자) — 필수 — show_if `secondary_concerns includes other`
질문: "가장 불편한 그 밖의 증상을 짧게 적어주세요."

**SAFETY_01** `red_flag_general` — multi_choice — 필수 — exclusive: none
질문: "지금 아래와 같은 증상이 있나요?"

| value | label |
|---|---|
| chest_breathing | 새로 생긴 심한 가슴 통증이나 숨쉬기가 매우 힘든 증상 |
| focal_neuro | 갑자기 한쪽 팔·다리에 힘이 빠지거나 말하기 어려운 증상 |
| loc_seizure | 의식을 잃었거나 경련을 한 증상 |
| sudden_severe_pain | 갑자기 시작된 매우 심한 두통이나 통증 |
| uncontrolled_bleeding | 멈추지 않는 심한 출혈 |
| high_fever_illness | 고열과 함께 몸 상태가 매우 좋지 않음 |
| none | 해당 없음 |

`none` 이외 하나라도 선택되면 `flags.requires_staff_check = true`이며, 해당 화면
제출 직후 StaffCheckScreen(문구: "먼저 확인이 필요한 내용이 있습니다. 태블릿을
직원에게 보여주세요.")을 노출한다. 진단명, 응급 진단, 자동 질환판단 문구는
사용하지 않는다.

### 4.4 Sleep 상세 Module (primary concern === sleep 인 경우만)

**진입 조건**: `primary_concern.key === 'sleep'`, 즉 `visit_goal === symptom` &&
`primary_symptom === sleep`인 경우에만 Sleep 상세모듈 전체(SLEEP_01~SLEEP_03A)를
실행한다. 동반문제(`secondary_concerns`)로 sleep을 선택한 경우는 이번
Sprint에서 Sleep 전체 Module을 실행하지 않는다 — router target(`Sleep`)만
`secondary_concerns.router_targets`에 유지되고, 실제 문항은 다음 Sprint의
secondary short screen에서 붙인다. stage label은 "상세 증상"이다.

**SLEEP_01** `sleep_problems` — multi_choice — 필수 — show_if `primary_concern === sleep`
질문: "잠에서 불편한 점이 있나요?"
보조: "해당되는 것을 모두 선택해주세요."

| value | label |
|---|---|
| sleep_onset | 잠들기 어려워요 |
| night_awakenings | 자다가 자주 깨요 |
| early_waking | 너무 일찍 깨요 |
| nonrestorative | 충분히 자도 개운하지 않아요 |

규칙: 복수선택 가능. "여러 가지가 함께 있어요"(v0.2 `multiple`)는 사용하지
않는다. "특별히 없어요" 옵션은 이 화면에서 의도적으로 제외했다 — Sleep
Module은 이미 주호소가 sleep으로 확정된 뒤에만 진입하므로 "특별히 없어요"는
논리적으로 모순된다. 향후 동반문제(secondary) sleep short screen을 별도로
구현할 때는 그 화면에 한해 "특별히 없어요"를 포함할 수 있다(공용
`Question`/`MultiChoice` 컴포넌트는 그대로 재사용 가능). "선택 완료" 버튼으로
확정하며 자동 이동은 없다.

**SLEEP_02** `sleep_frequency_per_week` — single_choice — 필수 — show_if `primary_concern === sleep`
질문: "일주일에 며칠 정도 불편한가요?"

| value | label |
|---|---|
| 1_2_days | 1~2일 |
| 3_4_days | 3~4일 |
| 5_plus_days | 5일 이상 |
| almost_daily | 거의 매일 |

"계속" 버튼으로 확정하며 자동 이동은 없다.

**SLEEP_03** `awakening_reasons` — multi_choice — 필수 — show_if `primary_concern === sleep && sleep_problems includes night_awakenings`
질문: "주로 왜 깨시나요?"

| value | label |
|---|---|
| urination | 소변 때문에 |
| pain | 통증 때문에 |
| heat_sweat | 더워서 또는 땀 때문에 |
| racing_thoughts | 생각이 많아져서 |
| no_particular_reason | 특별한 이유 없이 |
| other | 기타 |

규칙: 실제 이유는 복수선택 가능. "특별한 이유 없이"는 exclusive. "기타" 선택
시 SLEEP_03A(짧은 자유입력, 50자 이내)를 노출한다. "선택 완료" 버튼으로
확정한다.

**SLEEP_03A** `awakening_other` — short_text(50자) — 필수 — show_if `awakening_reasons includes other`
질문: "다른 이유가 있다면 짧게 적어주세요."

**이번 Sprint에서 Sleep Module에 묻지 않는 것**: 잠드는 데 걸리는 정확한
시간, 밤중 각성 횟수, 총 수면시간, 취침/기상 시각, 카페인 섭취량, 코골이,
수면무호흡 선별, 수면제 종류, 수면 문제 기간(이미 공통 VISIT_03에서 확인함).
필요하면 원장 진료에서 추가 확인한다.

**stale cleanup** (기존 `pruneStaleResponses` 그대로 재사용, 로직 변경 없음):
- SLEEP_01에서 `night_awakenings`를 해제하면 SLEEP_03/SLEEP_03A가 show_if를
  잃고 `null`로 정리된다. 다른 sleep_problems 선택은 그대로 유지된다.
- SLEEP_03에서 "기타"를 해제하면 SLEEP_03A가 `null`로 정리된다.
- 주호소가 sleep에서 다른 항목으로 바뀌면(`VISIT_02_SYMPTOM_MAIN` 변경 등)
  SLEEP_01~SLEEP_03A 전체가 `null`로 정리된다.
- SLEEP_03가 show_if를 만족하지 않아 표시되지 않은 경우 `awakening_reasons`는
  `none`이 아니라 `null`이다(Dev JSON `modules.sleep.awakening_reasons`).

**Dev JSON**: `responses.modules.sleep = { problems, frequency_per_week,
awakening_reasons, awakening_other }`. `problems`는 배열(`sleep_problems`
multi_choice 그대로). `routing.modules_activated`는 primary concern이
sleep일 때만 `['Sleep']`, 그 외에는 빈 배열이다.

### 4.5 GI 상세 Module (primary concern === digestion 인 경우만)

**진입 조건**: `primary_concern.key === 'digestion'`, 즉 `visit_goal === symptom`
&& `primary_symptom === digestion`인 경우에만 GI 상세모듈 전체(GI_01~GI_03)를
실행한다. 동반문제로 속·소화(digestion)를 선택한 경우는 이번 Sprint에서 GI
전체 Module을 실행하지 않는다 — router target(`GI`)만
`secondary_concerns.router_targets`에 유지된다. Dev JSON/Router 표기는
`GI`, primary concern의 실제 enum 값은 기존 naming convention을 따라 그대로
`digestion`이다(변경하지 않음).

**GI_01** `gi_problems` — multi_choice — 필수 — show_if `primary_concern === digestion`
질문: "속이나 소화에서 어떤 점이 가장 불편한가요?"
보조: "해당되는 것을 모두 선택해주세요."

| value | label |
|---|---|
| indigestion | 소화가 잘 안 되고 더부룩해요 |
| epigastric_discomfort | 명치나 윗배가 답답하거나 아파요 |
| reflux | 속이 쓰리거나 신물이 올라와요 |
| nausea | 메스껍거나 구역감이 있어요 |
| poor_appetite | 입맛이 없어요 |

규칙: 복수선택 가능, exclusive 없음. primary concern 자체가 GI이므로
"특별히 없어요" 옵션은 넣지 않는다(Sleep Module과 동일한 원칙). "선택 완료"
버튼으로 확정한다.

**GI_02** `gi_meal_relation` — single_choice — 필수 — show_if `primary_concern === digestion`
질문: "주로 언제 더 불편한가요?"

| value | label |
|---|---|
| after_meals | 식후에 더 불편해요 |
| when_hungry | 공복에 더 불편해요 |
| both | 식후와 공복 모두 불편해요 |
| unrelated | 식사와 큰 관계가 없어요 |
| not_sure | 잘 모르겠어요 |

**GI_03** `gi_unable_to_eat_or_drink` — single_choice — 필수 — show_if `primary_concern === digestion`
질문: "최근 음식이나 물을 먹기 어려울 정도인가요?"
선택지: yes(네) / no(아니요)

`yes`는 module-level safety flag 후보(`flags.gi_needs_review`)로만 저장한다.
진단명/질환명 추론은 하지 않는다. 화면 제출 직후 기존 StaffCheckScreen과
동일한 안내를 재사용해 연결한다(`STAFF_CHECK_TRIGGERS.GI_03`, 6장 참고) — 새
safety architecture를 만들지 않고 SAFETY_01과 같은 기존 flow에 트리거만
추가했다.

**이번 Sprint에서 GI Module에 묻지 않는 것**: 정확한 식사량, 하루 식사 횟수,
음식별 유발요인, 트림·방귀 횟수, 체중 감소량, 정확한 복통 위치 mapping, 구토
횟수, 음식 알레르기 상세. 진료 전 짧은 문진 범위를 넘는 세부사항은 원장
진료에서 확인한다.

**stale cleanup**: 주호소가 digestion에서 다른 항목으로 바뀌면 GI_01~GI_03
전체가 `null`로 정리된다. GI_01~GI_03 사이에는 조건부 하위 문항이 없다.

**Dev JSON**: `responses.modules.gi = { problems, meal_relation,
unable_to_eat_or_drink }`. `routing.modules_activated`는 primary concern이
digestion일 때만 `['GI']`.

### 4.6 Bowel 상세 Module (primary concern === bowel 인 경우만)

**진입 조건**: `primary_concern.key === 'bowel'`인 경우에만 Bowel 상세모듈
전체(BOWEL_01~BOWEL_04)를 실행한다. 동반문제로 대변(bowel)을 선택한 경우는
이번 Sprint에서 Bowel 전체 Module을 실행하지 않는다 — router target(`Bowel`)만
유지된다.

**BOWEL_01** `bowel_problems` — multi_choice — 필수 — show_if `primary_concern === bowel`
질문: "대변에서 어떤 점이 가장 불편한가요?"
보조: "해당되는 것을 모두 선택해주세요."

| value | label |
|---|---|
| constipation | 변이 잘 안 나오거나 딱딱해요 |
| diarrhea | 묽은 변이나 설사가 잦아요 |
| alternating | 변비와 설사가 번갈아 있어요 |
| incomplete_emptying | 보고 나도 덜 본 느낌이 있어요 |
| abdominal_discomfort | 배가 아프거나 불편하면서 대변 문제가 있어요 |

규칙: 복수선택 가능, exclusive 없음, "특별히 없어요" 옵션 없음. `alternating`은
`constipation`/`diarrhea`와 동시 선택을 막지 않는다(임의 exclusive 처리하지
않음).

**BOWEL_02** `bowel_frequency` — single_choice — 필수 — show_if `primary_concern === bowel`
질문: "평소 대변은 얼마나 자주 보시나요?"

| value | label |
|---|---|
| less_than_3_per_week | 일주일에 2번 이하 |
| three_to_six_per_week | 일주일에 3~6번 |
| one_to_two_per_day | 하루 1~2번 |
| three_or_more_per_day | 하루 3번 이상 |
| varies | 들쭉날쭉해요 |

**BOWEL_03** `blood_or_black_stool` — single_choice — 필수 — show_if `primary_concern === bowel`
질문: "최근 대변에 피가 섞이거나 검게 나온 적이 있나요?"
선택지: yes(네) / no(아니요) / not_sure(잘 모르겠어요)

`yes`만 module-level safety flag 후보(`flags.bowel_needs_review`)로 저장하고
GI_03과 동일한 방식으로 기존 StaffCheckScreen에 연결한다
(`STAFF_CHECK_TRIGGERS.BOWEL_03`). `not_sure`는 Red Flag 양성으로 자동
간주하지 않고 별도 값으로만 유지한다(자동 진단 없음).

**BOWEL_04** `bowel_straining` — single_choice — 필수 — show_if `primary_concern === bowel && bowel_problems includes constipation`
질문: "변을 볼 때 많이 힘을 줘야 하나요?"
선택지: often(자주 그래요) / sometimes(가끔 그래요) / rarely(거의 그렇지 않아요)

**이번 Sprint에서 Bowel Module에 묻지 않는 것**: Bristol stool scale 1~7
세부 분류, 정확한 배변 시간, 변의 색 전체 목록, 점액 여부, 방귀 횟수, 장음,
복부 팽만 상세 빈도, 완하제 종류, 식이섬유 섭취량.

**stale cleanup**: BOWEL_01에서 `constipation`을 해제하면 BOWEL_04 응답이
`null`로 정리되고, BOWEL_01의 다른 선택값은 그대로 유지된다. 주호소가
bowel에서 다른 항목으로 바뀌면 BOWEL_01~BOWEL_04 전체가 `null`로 정리된다.

**Dev JSON**: `responses.modules.bowel = { problems, frequency,
blood_or_black_stool, straining }`. `routing.modules_activated`는 primary
concern이 bowel일 때만 `['Bowel']`.

### 4.7 Urinary 상세 Module (primary concern === urinary 인 경우만)

**진입 조건**: `primary_concern.key === 'urinary'`인 경우에만 Urinary 상세모듈
전체(URINARY_01~URINARY_04)를 실행한다. 동반문제로 소변·방광(urinary)을
선택한 경우는 이번 Sprint에서 전체 Module을 실행하지 않는다 — router
target(`Urinary`)만 유지된다.

**URINARY_01** `urinary_problems` — multi_choice — 필수 — show_if `primary_concern === urinary`
질문: "소변이나 방광에서 어떤 점이 불편한가요?"
보조: "해당되는 것을 모두 선택해주세요."

| value | label |
|---|---|
| frequency | 소변을 자주 봐요 |
| urgency | 갑자기 소변이 마려워 참기 어려워요 |
| nocturia | 밤에 자다가 소변 때문에 깨요 |
| voiding_difficulty | 소변이 잘 나오지 않거나 약해요 |
| incomplete_emptying | 소변을 봐도 덜 본 느낌이 있어요 |
| dysuria | 소변 볼 때 아프거나 불편해요 |
| incontinence | 소변이 새는 경우가 있어요 |

규칙: 복수선택 가능, exclusive 없음, "특별히 없어요" 옵션 없음(Sleep/GI/Bowel과
동일 원칙).

**URINARY_02** `urinary_burden_frequency` — single_choice — 필수 — show_if `primary_concern === urinary`
질문: "하루 중 얼마나 자주 불편한가요?"
선택지: occasionally(가끔 있어요) / several_times_daily(하루에 몇 번 있어요) /
most_of_day(거의 하루 종일 신경 쓰여요) / variable(상황에 따라 달라요)

**URINARY_03** `nocturia_count` — single_choice — 필수 — show_if `primary_concern === urinary && urinary_problems includes nocturia`
질문: "밤에 보통 몇 번 정도 소변 때문에 깨나요?"
선택지: one(1번) / two(2번) / three_or_more(3번 이상) / variable(날마다 달라요)

**URINARY_04** `leakage_pattern` — multi_choice — 필수 — exclusive: unknown — show_if `primary_concern === urinary && urinary_problems includes incontinence`
질문: "소변이 주로 언제 새나요?"
선택지: stress(기침·재채기·웃거나 힘줄 때) / urge(갑자기 마려울 때 참지 못하고) /
other_activity(움직이거나 일상생활 중 특별한 이유 없이) / unknown(잘
모르겠어요, exclusive)

**Red Flag 재검토 결과**: 혈뇨·고열·심한 급성 통증 등 중증 신호는 이미
공통 SAFETY_01(고열과 함께 몸 상태가 매우 좋지 않음, 갑자기 시작된 매우 심한
두통이나 통증 등)에서 다루고 있어 Urinary Module에 새 Red Flag 화면을 만들지
않았다. Module 내부에 별도 중증 질환 진단 로직도 두지 않는다.

**stale cleanup**: `urinary_problems`에서 `nocturia`를 해제하면
`nocturia_count`가 `null`로 정리된다. `incontinence`를 해제하면
`leakage_pattern`이 `null`로 정리된다. 주호소가 urinary에서 다른 항목으로
바뀌면 URINARY_01~URINARY_04 전체가 `null`로 정리된다. 표시되지 않은 질문은
`none`이 아니라 `null`이다.

**Dev JSON**: `responses.modules.urinary = { problems, burden_frequency,
nocturia_count, leakage_pattern }`. `routing.modules_activated`는 primary
concern이 urinary일 때만 `['Urinary']`.

### 4.8 Pain 상세 Module (primary concern === pain 인 경우만)

**진입 조건**: `primary_concern.key === 'pain'`인 경우에만 Pain 상세모듈
전체(PAIN_01~PAIN_04A)를 실행한다. 동반문제로 통증(pain)을 선택한 경우는
이번 Sprint에서 전체 Module을 실행하지 않는다 — router target(`Pain`)만
유지된다.

**PAIN_01** `primary_location` — single_choice — 필수 — show_if `primary_concern === pain`
질문: "어디가 가장 불편한가요?"
선택지: neck_shoulder(목·어깨) / low_back_pelvis(허리·골반) / arm_hand(팔·손) /
leg_foot(다리·발) / knee(무릎) / head_face_jaw(머리·얼굴·턱) /
chest_rib(가슴·갈비뼈 주변) / abdomen(배 주변) / other(그 밖의 부위)

**PAIN_01A** `location_other` — short_text(50자) — 필수 — show_if `primary_concern === pain && primary_location === other`
질문: "어느 부위인지 짧게 적어주세요."

**PAIN_02** `pain_qualities` — multi_choice — 필수 — show_if `primary_concern === pain`
질문: "어떤 느낌의 통증인가요?"
보조: "해당되는 것을 모두 선택해주세요."
선택지: aching(뻐근하거나 묵직해요) / sharp(찌르거나 쑤셔요) /
burning(타는 듯하거나 화끈거려요) / numb_tingling(저리거나 감각이 둔해요) /
tight_stiff(당기거나 뻣뻣해요) / movement_related(움직일 때 더 아파요) /
rest_pain(가만히 있어도 아파요) — exclusive 없음

**일상생활 영향(severity) 문항 중복 없음**: Pain Module 전용 severity
문항(PAIN_03)은 만들지 않았다. 모든 symptom 주호소 공통으로 이미
VISIT_04_SYMPTOM_IMPACT(`chief_impact`, "일상생활에 얼마나 영향을 주나요?" —
minimal/mild/moderate/severe)가 동일한 의미로 수집되므로, primary concern이
pain일 때도 그 값을 그대로 사용한다. 기간(duration)도 마찬가지로
VISIT_03_SYMPTOM_DURATION(`chief_duration`)을 그대로 사용하고 Pain Module
안에서 다시 묻지 않는다.

**PAIN_04** `radiation` — single_choice — 필수 — show_if `primary_concern === pain`
질문: "통증이 다른 곳으로 퍼지거나 저린 느낌이 있나요?"
선택지: none(없어요) / upper_limb(팔이나 손 쪽으로 퍼져요) /
lower_limb(엉덩이·다리·발 쪽으로 퍼져요) / other(다른 부위로 퍼져요) /
unknown(잘 모르겠어요)

**PAIN_04A** `radiation_other` — short_text(50자) — 필수 — show_if `primary_concern === pain && radiation === other`
질문: "어디로 퍼지는지 짧게 적어주세요."

**stale cleanup**: PAIN_01에서 `other`를 해제하면 `location_other`가 `null`로
정리된다. PAIN_04에서 `other`를 해제하면 `radiation_other`가 `null`로
정리된다. 주호소가 pain에서 다른 항목으로 바뀌면 PAIN_01~PAIN_04A 전체가
`null`로 정리된다(공통 VISIT_03/04는 `visit_goal === symptom`에만 묶여 있어
그대로 유지됨 — 별도 관리).

**Dev JSON**: `responses.modules.pain = { primary_location, location_other,
pain_qualities, radiation, radiation_other }`(공통 duration/severity는 기존
`visit_goal.chief_duration` / `visit_goal.chief_impact`에만 저장, 중복
저장하지 않음). `routing.modules_activated`는 primary concern이 pain일
때만 `['Pain']`.

### 4.9 Fatigue 상세 Module (primary concern === fatigue 인 경우만)

**진입 조건**: `primary_concern.key === 'fatigue'`인 경우에만 전체
실행(FATIGUE_01~03). 동반문제로 피로·기력(fatigue)을 선택한 경우는 router
target(`Fatigue`)만 유지, 전체 Module 미실행.

**FATIGUE_01** `fatigue_patterns` — multi_choice — 필수 — show_if `primary_concern === fatigue`
질문: "피로가 주로 어떻게 느껴지나요?" / 보조: "해당되는 것을 모두 선택해주세요."
선택지: morning_fatigue(아침부터 기운이 없어요) / exertional_fatigue(조금만
움직여도 쉽게 지쳐요) / later_day_fatigue(오후나 저녁에 더 처져요) /
poor_recovery(쉬어도 회복이 잘 안 돼요) / heaviness(몸이 무겁고 늘어져요) /
sleepiness(졸리고 잠이 쏟아져요) — exclusive 없음

**FATIGUE_02** `fatigue_worst_time` — single_choice — 필수 — show_if 동일
질문: "피로가 하루 중 어느 때 가장 심한가요?"
선택지: morning(아침) / daytime(낮) / evening(저녁) / all_day(하루 종일) /
variable(날마다 달라요)

**FATIGUE_03** `fatigue_recovery_after_rest` — single_choice — 필수 — show_if 동일
질문: "쉬거나 자고 나면 피로가 얼마나 회복되나요?"
선택지: good_recovery(대부분 회복돼요) / partial_recovery(조금 나아져요) /
poor_recovery(거의 그대로예요) / sometimes_worse(오히려 더 피곤할 때도
있어요) / unknown(잘 모르겠어요)

**stale cleanup**: 주호소가 fatigue에서 이탈하면 FATIGUE_01~03 전체가
`null`로 정리된다.

**Dev JSON**: `responses.modules.fatigue = { patterns, worst_time,
recovery_after_rest }`. `routing.modules_activated`는 fatigue일 때만
`['Fatigue']`.

### 4.10 Stress 상세 Module (primary concern === stress 인 경우만)

**진입 조건**: `primary_concern.key === 'stress'`인 경우에만 전체
실행(STRESS_01, STRESS_03). 동반문제로 스트레스·마음(stress)을 선택한 경우는
router target(`Stress`)만 유지, 전체 Module 미실행.

**STRESS_01** `stress_problems` — multi_choice — 필수 — show_if `primary_concern === stress`
질문: "요즘 가장 힘든 점은 무엇인가요?" / 보조: "해당되는 것을 모두
선택해주세요."
선택지: worry(걱정이나 생각이 많아요) / tension(긴장되고 예민해요) /
irritability(짜증이나 화가 자주 나요) / low_mood(마음이 가라앉고 의욕이
없어요) / palpitation_tightness(가슴이 두근거리거나 답답할 때가 있어요) /
somatic_worsening(스트레스를 받으면 몸 증상이 심해져요) — exclusive 없음

**일상생활 영향(severity) 문항 중복 없음**: "STRESS_02"는 만들지 않았다.
stress도 다른 symptom 주호소와 동일하게 공통 VISIT_04_SYMPTOM_IMPACT
(`chief_impact`)를 그대로 사용한다.

**STRESS_03** `stress_associated_symptoms` — multi_choice — 필수 — exclusive:
none — show_if `primary_concern === stress`
질문: "스트레스가 심해질 때 함께 나타나는 증상이 있나요?" / 보조: "해당되는
것을 모두 선택해주세요."
선택지: sleep(잠이 더 불편해져요) / digestion(소화가 더 불편해져요) /
pain(두통이나 통증이 심해져요) / cardiac_sensation(가슴 두근거림·답답함이
생겨요) / sweating_heat(땀이 나거나 몸이 달아올라요) / none(특별한 몸 증상은
없어요, exclusive)

**safety**: 자살사고/자해 선별 질문은 이번 Sprint에서 추가하지 않는다(짧은
진료 전 문진 범위, 기존 safety architecture 유지). 필요성은 9장 TODO에
남긴다.

**stale cleanup**: 주호소가 stress에서 이탈하면 STRESS_01/03 전체가 `null`로
정리된다.

**Dev JSON**: `responses.modules.stress = { problems, associated_symptoms }`
(공통 chief_impact는 중복 저장하지 않음). `routing.modules_activated`는
stress일 때만 `['Stress']`.

### 4.11 Women 상세 Module (women_goal === women 인 경우만)

**진입 조건**: `primary_concern.key === 'women'`, 즉 `visit_goal === women`
&& `women_goal === women`(생리·갱년기 등 여성 건강)인 경우에만 전체
실행(WOMEN_01~03). 새 top-level route key를 만들지 않고 기존
`primaryConcernKey`/`VISIT_02_WOMEN` 값을 그대로 사용했다. 동반문제로 여성
건강(women)을 선택한 경우는 router target(`Women`)만 유지, 전체 Module
미실행.

**WOMEN_01** `women_problems` — multi_choice — 필수 — show_if `primary_concern === women`
질문: "어떤 점이 가장 불편한가요?" / 보조: "해당되는 것을 모두 선택해주세요."
선택지: irregular_cycle(생리 주기가 불규칙해요) / dysmenorrhea(생리통이
심해요) / flow_change(생리양이 너무 많거나 적어요) / premenstrual(생리
전후 몸이나 기분 변화가 심해요) / discharge_discomfort(냉·분비물이나 질
불편감이 있어요) / menopause_symptoms(갱년기 증상이 있어요) / other(그 밖의
여성 건강 상담) — exclusive 없음

**WOMEN_01A** `women_other_text` — short_text(50자) — 필수 — show_if `primary_concern === women && women_problems includes other`
질문: "어떤 내용인지 짧게 적어주세요."

**WOMEN_02** `menstrual_status` — single_choice — 필수 — show_if `primary_concern === women && women_problems includes (irregular_cycle | dysmenorrhea | flow_change | premenstrual)`
질문: "현재 생리는 어떤 상태인가요?"
선택지: currently_menstruating(생리 중이에요) / regular_current(최근에도
규칙적으로 하고 있어요) / irregular_current(불규칙하게 하고 있어요) /
amenorrhea_months(몇 달째 생리가 없어요) / menopause(폐경했어요) /
unknown(잘 모르겠어요)

**WOMEN_03** `menopause_symptoms` — multi_choice — 필수 — show_if `primary_concern === women && women_problems includes menopause_symptoms`
질문: "갱년기와 관련해 어떤 점이 불편한가요?" / 보조: "해당되는 것을 모두
선택해주세요."
선택지: hot_flash(얼굴이나 몸이 갑자기 달아올라요) / sweating(땀이 많이
나요) / sleep(잠이 불편해요) / palpitation_anxiety(가슴이 두근거리거나
불안해요) / mood_change(기분 변화가 심해요) /
genitourinary_discomfort(건조감이나 비뇨·생식기 불편감이 있어요)

**safety**: 공통 WOMEN_SAFETY_01(reproductive_status)과 문항 내용이 겹치지
않도록 새 질문을 만들지 않았다. WOMEN_SAFETY_01 신규 중복 skip
architecture는 이번 Sprint에서 해결하지 않는다(9장 TODO).

**stale cleanup**: `other` 해제 → `women_other_text` null. 생리 관련 트리거
(irregular_cycle/dysmenorrhea/flow_change/premenstrual)가 모두 해제되면
`menstrual_status` null. `menopause_symptoms` 해제 → WOMEN_03 응답 null.
women route(주호소)에서 이탈하면 WOMEN_01~03 전체 null.

**Dev JSON**: `responses.modules.women = { problems, other_text,
menstrual_status, menopause_symptoms }`. `routing.modules_activated`는
women일 때만 `['Women']`.

### 4.12 Pregnancy 상세 Module (women_goal === pregnancy 인 경우만)

**진입 조건**: `primary_concern.key === 'pregnancy'`인 경우에만 전체
실행(PREGNANCY_01~03A). 기존 `VISIT_02_WOMEN === pregnancy` 값을 그대로
사용, 새 route key 없음. 동반문제로는 이 카테고리를 선택할 수 없다(4.3
SECONDARY_01에는 women만 있고 pregnancy/postpartum은 women으로 정규화되어
숨겨짐).

**PREGNANCY_01** `pregnancy_status` — single_choice — 필수 — show_if `primary_concern === pregnancy`
질문: "현재 임신 상태는 어떻게 되나요?"
선택지: pregnant(임신 중이에요) / possible(임신 가능성이 있어요) /
trying(임신을 준비 중이에요) / fertility(난임·임신 준비 상담이에요) /
unknown(잘 모르겠어요)

**PREGNANCY_02** `trimester` — single_choice — 필수 — show_if `primary_concern === pregnancy && pregnancy_status === pregnant`
질문: "현재 임신 몇 주 정도인가요?"
선택지: first_trimester(12주 이하) / second_trimester(13~27주) /
third_trimester(28주 이상) / unknown(정확히 모르겠어요)

**PREGNANCY_03** `pregnancy_concerns` — multi_choice — 필수 — show_if `primary_concern === pregnancy`
질문: "임신과 관련해 가장 상담하고 싶은 내용은 무엇인가요?" / 보조: "해당되는
것을 모두 선택해주세요."
선택지: nausea(입덧·메스꺼움) / digestion(소화 불편) / pain(통증·몸 불편) /
fatigue(피로·기력 저하) / sleep(수면 불편) / edema(붓기) /
fertility(임신 준비·난임 관련) / other(기타) — exclusive 없음

**PREGNANCY_03A** `pregnancy_other_text` — short_text(50자) — 필수 — show_if `primary_concern === pregnancy && pregnancy_concerns includes other`
질문: "어떤 내용인지 짧게 적어주세요."

**safety**: 출혈·심한 복통·의식저하 등은 이미 공통 SAFETY_01(멈추지 않는
심한 출혈, 갑자기 시작된 매우 심한 두통이나 통증, 의식을 잃었거나 경련을 한
증상 등)이 다루므로 Pregnancy 전용 Red Flag 화면은 만들지 않았다. 새
`STAFF_CHECK_TRIGGERS` 항목도 추가하지 않았다(이 Module 문항 중 yes/no
안전 후보 질문이 없음).

**stale cleanup**: `pregnant` 해제(다른 status로 변경) → `trimester` null.
`other` 해제 → `pregnancy_other_text` null. pregnancy route에서 이탈하면
PREGNANCY_01~03A 전체 null.

**Dev JSON**: `responses.modules.pregnancy = { status, trimester, concerns,
other_text }`. `routing.modules_activated`는 pregnancy일 때만
`['Pregnancy']`.

### 4.13 Postpartum 상세 Module (women_goal === postpartum 인 경우만)

**진입 조건**: `primary_concern.key === 'postpartum'`인 경우에만 전체
실행(POSTPARTUM_01~03). 기존 `VISIT_02_WOMEN === postpartum` 값을 그대로
사용, 새 route key 없음.

**POSTPARTUM_01** `time_since_delivery` — single_choice — 필수 — show_if `primary_concern === postpartum`
질문: "출산 후 얼마나 지났나요?"
선택지: within_6_weeks(6주 이내) / 6w_to_3m(6주~3개월) / 3_to_6m(3~6개월) /
6_to_12m(6~12개월) / over_1y(1년 이상)

**POSTPARTUM_02** `postpartum_problems` — multi_choice — 필수 — show_if 동일
질문: "출산 후 어떤 점이 가장 불편한가요?" / 보조: "해당되는 것을 모두
선택해주세요."
선택지: fatigue_recovery(기운이 없고 회복이 더뎌요) /
musculoskeletal_pain(허리·골반·관절이 아파요) / edema_heaviness(몸이
붓거나 무거워요) / sleep_fatigue(잠이 부족하고 피곤해요) /
temperature_sweating(땀이 많이 나거나 더위·추위가 심해졌어요) /
urinary(소변·방광이 불편해요) / pelvic_core_recovery(배·골반저 회복이
걱정돼요) / breastfeeding(수유 관련 상담이 필요해요) / other(기타) —
exclusive 없음

**POSTPARTUM_02A** `postpartum_other_text` — short_text(50자) — 필수 — show_if `primary_concern === postpartum && postpartum_problems includes other`
질문: "어떤 내용인지 짧게 적어주세요."

**POSTPARTUM_03** `breastfeeding_status` — single_choice — 필수 — show_if 동일
질문: "현재 모유수유 중인가요?"
선택지: yes(네) / no(아니요) / mixed(혼합수유 중이에요)

> 공통 WOMEN_SAFETY_01(reproductive_status)에도 `postpartum_1y`/
> `breastfeeding` 항목이 있어 POSTPARTUM_01/03과 의미가 겹칠 수 있다. 이번
> Sprint에서는 두 화면을 통합하지 않고 그대로 두었다 — WOMEN_SAFETY_01은
> "현재 안전상태" 확인용 공통 문항이고 POSTPARTUM_01/03은 Module 진입 후
> 상담에 필요한 상세 정보라는 역할 차이가 있기 때문이다. 통합/자동 skip
> 여부는 9장 TODO로 남긴다.

**safety**: 심한 출혈·고열·호흡곤란 등은 공통 SAFETY_01 우선, Postpartum
전용 Red Flag architecture는 만들지 않았다.

**stale cleanup**: `other` 해제 → `postpartum_other_text` null.
postpartum route에서 이탈하면 POSTPARTUM_01~03 전체 null.

**Dev JSON**: `responses.modules.postpartum = { time_since_delivery,
problems, other_text, breastfeeding_status }`. `routing.modules_activated`는
postpartum일 때만 `['Postpartum']`.

### 4.14 Weight 상세 Module (visit_goal === weight 인 경우만)

**진입 조건**: `primary_concern.key === 'weight'`, 즉 `visit_goal ===
weight`인 경우에만 전체 실행(WEIGHT_01~04). weight는 v1.0에서 애초에 하위
분기 화면이 없으므로(3.2, "추가 대분류 없음") 기존 route를 그대로 사용했다.
동반문제로 체중 관리(weight)를 선택한 경우는 router target(`Weight`)만
유지, 전체 Module 미실행.

**WEIGHT_01** `weight_goal` — single_choice — 필수 — show_if `primary_concern === weight`
질문: "체중 관리에서 가장 원하는 것은 무엇인가요?"
선택지: weight_loss(체중을 줄이고 싶어요) / fat_loss(체지방을 줄이고
싶어요) / appetite_control(식욕 조절이 가장 어려워요) / maintenance(요요
없이 유지하고 싶어요) / health_management(전반적인 건강 관리를 함께 하고
싶어요)

**WEIGHT_02** `weight_contributing_factors` — multi_choice — 필수 — exclusive:
unknown — show_if 동일
질문: "체중이 늘거나 빠지는 데 가장 영향을 주는 것은 무엇인가요?" / 보조:
"해당되는 것을 모두 선택해주세요."
선택지: large_portions(식사량이 많아요) /
snacking_night_eating(간식·야식이 많아요) / sweets_carbs(단 음식이나
탄수화물을 자주 먹어요) / stress_eating(스트레스 받으면 많이 먹어요) /
low_activity(활동량이 적어요) / poor_sleep(잠이 부족하거나 불규칙해요) /
unknown(특별한 이유를 잘 모르겠어요, exclusive)

**WEIGHT_03** `recent_weight_change` — single_choice — 필수 — show_if 동일
질문: "최근 체중 변화는 어떤가요?"
선택지: gaining(최근 계속 늘고 있어요) / stable(비슷하게 유지돼요) /
losing(줄고 있어요) / fluctuating(오르내림이 커요) / unknown(잘 모르겠어요)

**WEIGHT_04** `previous_attempts` — single_choice — 필수 — show_if 동일
질문: "다이어트나 체중 관리 경험이 있나요?"
선택지: none(처음이에요) / lifestyle(식단·운동 위주로 해봤어요) /
herbal_supplement(한약이나 보조제를 써봤어요) / medical(병원 처방약이나
주사를 써봤어요) / multiple(여러 방법을 해봤어요)

**safety / 중복 방지**: 현재 복용 약·주사·건기식은 공통 MED_USE/MED_TYPES에서
이미 받으므로 Weight Module에서 다시 묻지 않는다. 비의도적 체중 감소 여부를
추가로 물을지는 이번 Sprint에서 판단하지 않고 9장 TODO로 남긴다.

**stale cleanup**: weight primary에서 이탈하면 WEIGHT_01~04 전체 null.

**Dev JSON**: `responses.modules.weight = { goal, contributing_factors,
recent_weight_change, previous_attempts }`. `routing.modules_activated`는
weight일 때만 `['Weight']`.

### 4.15 체질·보약 추가 문항 (visit_goal === constitution 인 경우만)

| screen_id | variable | 질문 | 선택지 |
|---|---|---|---|
| CONST_ENERGY | energy_recovery | 평소 기운과 회복력은 어떠신가요? | sufficient(충분한 편이에요) / tired_recovers(쉽게 피곤하지만 쉬면 회복돼요) / frequent_poor(자주 피곤하고 회복이 더뎌요) / always_exhausted(늘 기운이 없고 쉽게 지쳐요) |
| CONST_SLEEP | sleep_basic | 평소 잠은 어떠신가요? | normal(특별히 불편하지 않아요) / onset_difficulty(잠들기 어려워요) / frequent_waking(자주 깨요) / nonrestorative(자도 개운하지 않아요) |
| CONST_DIGESTION | digestion_basic | 속이나 소화는 어떠신가요? | normal(특별히 불편하지 않아요) / occasional(가끔 불편해요) / frequent(자주 불편해요) / severe(식사가 부담스러울 정도예요) |
| CONST_BOWEL | bowel_basic | 대변은 어떠신가요? | regular(규칙적이고 편해요) / constipation(변비가 있어요) / loose(묽거나 설사를 자주 해요) / alternating(변비와 설사가 번갈아 있어요) |

모두 single_choice, 필수. 이 문항들 다음에 4.5의 한약 참고용 공통정보로 이어진다.

### 4.16 한약 처방 참고용 최소 공통정보 (전원 공통)

| screen_id | variable | 질문 | 선택지 |
|---|---|---|---|
| HERB_APPETITE | appetite_level | 평소 식욕은 어떠신가요? | low(적은 편이에요) / normal(보통이에요) / good(좋은 편이에요) / excessive(지나치게 강한 편이에요) / irregular(일정하지 않아요) |
| HERB_THERMAL | thermal_tendency | 평소 추위와 더위는 어떠신가요? | cold_sensitive(추위를 많이 타요) / heat_sensitive(더위를 많이 타요) / both(둘 다 많이 타요) / neither(둘 다 특별하지 않아요) |
| HERB_THIRST | thirst_level | 평소 갈증은 어떠신가요? | minimal(갈증이 거의 없어요) / normal(보통이에요) / frequent(자주 목이 말라요) / severe(물을 마셔도 갈증이 심해요) |
| HERB_SWEAT | sweat_pattern | 평소 땀은 어떤 편인가요? | normal(특별하지 않아요) / low(적은 편이에요) / high(많은 편이에요) / exertion_excessive(조금만 움직여도 많이 나요) / night_sweat(잘 때 땀이 나요) |

모두 single_choice, 필수, always 표시. v0.2의 "찬물/따뜻한 물 선호"
(`drink_temp_preference`, CORE_12A)는 삭제했다.

### 4.17 약물 · 병력 · 알레르기 · 수술 · 여성 안전 · 검사자료

| screen_id | variable | input | 필수 | show_if |
|---|---|---|---|---|
| MED_USE | medication_use | single_choice | 필수 | always |
| MED_TYPES | medication_types | multi_choice | 선택 | `medication_use in [yes, unknown]` |
| HISTORY_01 | medical_history_flags | multi_choice (exclusive: none) | 필수 | always |
| ALLERGY_01 | allergy_yn | single_choice | 필수 | always |
| ALLERGY_02 | allergy_detail | short_text(50자) | 필수 | `allergy_yn === yes` |
| SURGERY_01 | surgery_yn | single_choice | 필수 | always |
| SURGERY_02 | surgery_detail | short_text(50자) | 필수 | `surgery_yn === yes` |
| WOMEN_SAFETY_01 | reproductive_status | multi_choice (exclusive: none) | 필수 | `patient_sex === female` |
| TEST_01 | recent_test_flag | single_choice | 필수 | always |

**MED_USE** 질문: "현재 복용하거나 사용하는 약·주사·건강기능식품이 있나요?"
선택지: none(없어요) / yes(있어요) / unknown(잘 모르겠어요)
`yes`/`unknown` 선택 시에만 안내 문구 노출: "약봉투·처방전·복용약 사진이 있으면
진료 때 보여주세요."

**MED_TYPES** 질문: "해당하는 약의 종류를 알려주시면 진료에 도움이 됩니다."
선택지(복수): cardiac(혈압·심장약) / diabetes(당뇨약) / cholesterol(콜레스테롤약) /
blood_thinner(혈액을 묽게 하는 약) / psych(수면·정신건강 관련 약) /
hormone(호르몬 관련 약) / painkiller(진통제) / other_unknown(기타 / 잘 모르겠어요)

**HISTORY_01** 질문: "현재 치료 중이거나 진단받은 중요한 질환이 있나요?"
선택지: cardiovascular(심장·혈관 질환) / diabetes(당뇨) / cerebrovascular(뇌혈관
질환) / liver(간 질환) / kidney(신장 질환) / thyroid(갑상선 질환) / cancer(암) /
bleeding_disorder(출혈 관련 질환) / mental_health(정신건강 관련 질환) /
other(기타) / none(없음, exclusive)

**ALLERGY_01** 질문: "약·한약·음식으로 심한 알레르기나 이상반응이 있었나요?"
선택지: none(없어요) / yes(있어요) / unknown(잘 모르겠어요)

**SURGERY_01** 질문: "큰 수술이나 입원 치료를 받은 적이 있나요?"
선택지: none(없어요) / yes(있어요) — unknown 없음

**WOMEN_SAFETY_01** 질문: "현재 해당되는 것이 있나요?" (여성에게만)
선택지: pregnant(임신 중이에요) / pregnancy_possible(임신 가능성이 있어요) /
postpartum_1y(출산 후 1년 이내예요) / breastfeeding(모유수유 중이에요) /
menopause(폐경했어요) / none(해당 없음, exclusive) / unknown(잘 모르겠어요)

임신/산후 상세 경로(VISIT_02_WOMEN)와 정보가 겹치더라도, 이 화면은 "현재
안전상태"를 확인하는 별도 역할을 유지한다. 동일 응답의 중복 질문이 느껴지는
경우 향후 Router에서 자동 skip하도록 설계할 수 있다(9장 참고).

**TEST_01** 질문: "최근 건강검진이나 검사에서 이상이 있다고 들은 내용이 있나요?"
선택지: none(없어요) / yes(있어요) / unknown(잘 모르겠어요)
`yes` 선택 시 안내 문구: "검사 결과지가 있으면 진료 때 보여주세요."
이번 Sprint에서는 검사수치를 환자에게 직접 입력시키지 않는다.

### 4.18 생년·출생정보

| screen_id | variable | input | 필수 | show_if |
|---|---|---|---|---|
| BIRTH_01 | birth_date | numeric(8) | 필수 | always |
| BIRTH_02 | birth_calendar_type | single_choice | 필수 | always |
| BIRTH_03 | birth_time_known | single_choice | 필수 | always |
| BIRTH_04 | birth_time_detail | short_text | 필수 | `birth_time_known in [exact, approximate]` |

- BIRTH_01: "생년월일을 입력해주세요." (숫자만, 예: 19900101)
- BIRTH_02: "양력·음력을 알고 계신가요?" — solar(양력) / lunar(음력) / unknown(잘 모르겠어요)
- BIRTH_03: "태어난 시간을 알고 계신가요?" — exact(정확히 알아요) / approximate(대략 알아요) / unknown(모르겠어요)
- BIRTH_04: "태어난 시간을 적어주세요." (exact/approximate일 때만)

이 정보는 Dev JSON에서 `birth_info` 그룹으로 증상·검사·병력 정보와 분리 저장한다.
임상 진단값처럼 자동 해석하지 않는다.

### 4.19 마지막 자유입력

| screen_id | variable | input | 필수 | show_if |
|---|---|---|---|---|
| FREE_01 | free_text_yn | single_choice | 필수 | always |
| FREE_02 | free_text_detail | short_text(100자) | 필수 | `free_text_yn === yes` |

- FREE_01: "문진에서 묻지 않았지만 원장에게 꼭 말씀하고 싶은 내용이 있나요?" — none(없어요) / yes(있어요)
- FREE_02: "원장에게 전하고 싶은 내용을 적어주세요." (100자 이내)

자유입력은 가능한 한 이 화면 한 번만 사용한다. 예외: SECONDARY_01A(그 밖의
증상), ALLERGY_02(알레르기 상세), SURGERY_02(수술 상세) — 이 3개는 특정 항목을
구체화하기 위한 짧은 입력으로, 마지막 자유입력과 성격이 다르다.

## 5. Stale Response 원칙 (재사용, 확장)

`pruneStaleResponses`는 변경 없이 그대로 재사용한다. 매 응답 저장 시
`visibleQuestions(responses)`를 다시 계산하고, 더 이상 show_if를 만족하지 않는
screen_id의 응답을 반복적으로(연쇄 의존까지) `null`로 되돌린다.

예:
- 불편한 증상(symptom) → sleep 선택 → 뒤로가기 → 체질·보약(constitution)으로 변경
  → `primary_symptom`/`chief_duration`/`chief_impact` 등 symptom 경로 응답은
  현재 payload에서 제거된다.
- 여성(women) → pregnancy 선택 → 뒤로가기 → women(생리·갱년기)으로 변경
  → pregnancy 전용 응답은 없지만(v1.0은 상세 Module 미구현), 향후 Pregnancy
  Module이 붙었을 때도 동일 메커니즘으로 제거되도록 설계되어 있다.

`meta`(audit)에는 `discarded: true`로 표시만 남기고, `current` clinical
responses(`Responses` state) 자체에는 stale value가 남지 않는다.

## 6. Red Flag / 안전정보 요약

- SAFETY_01(공통 Red Flag): 전원 대상, 6개 항목 + 해당 없음(exclusive).
- WOMEN_SAFETY_01(여성 안전상태): 여성만 대상, 7개 항목 + 해당 없음(exclusive).
- GI_03(`gi_needs_review`) / BOWEL_03(`bowel_needs_review`): 각 Module
  primary 경로에서만 등장하는 module-level safety flag 후보. "네"만 양성으로
  본다(BOWEL_03의 "잘 모르겠어요"는 양성으로 자동 간주하지 않는다).
- 전부 진단하지 않는다. "직원 확인 필요" 여부만 `flags.requires_staff_check`로
  표시한다. `STAFF_CHECK_TRIGGERS`(`src/spec/coreSpec.ts`)에 등록된
  SAFETY_01 / GI_03 / BOWEL_03 세 화면만 제출 직후 즉시 StaffCheckScreen을
  트리거한다(동일 화면당 세션 중 1회). 새 safety architecture를 만들지 않고
  SAFETY_01에 쓰던 기존 flow에 트리거 화면만 추가했다.

## 7. v0.2 → v1.0 폐기/변경 목록

- 9개 `primary_goal_bucket` 첫 화면(CORE_01) 전체 폐기
- `digestion_bowel`을 첫 화면 별도 bucket으로 두던 구조 폐기
- CORE_01B(digestion/bowel 재분기) 폐기
- CORE_01C(v0.2 여성 분기, pregnancy_postpartum 강제 병합) 폐기 → VISIT_02_WOMEN으로 대체(women/pregnancy/postpartum 분리)
- `other_consult` bucket(CORE_01D) 폐기 → VISIT_02_CONST로 대체, "한약이 필요한지 상담" 옵션 삭제
- 모든 환자 대상 Sleep/GI/Bowel/Urinary/Stress Quick Screen(CORE_07~CORE_10, CORE_14) 폐기
  → 체질·보약 경로에만 최소 4문항(CONST_*)으로 축소, 나머지는 상세 Module(9장)로 이관
- `drink_temp_preference`(CORE_12A, 찬물/따뜻한 물) 삭제
- CORE_02/03(주호소 기간·영향)을 증상 경로 전용으로 유지하되 위치를 VISIT_03/04로 이동, 선택지 문구 재정의(주 단위 세분화)
- CORE_15(reproductive_status)의 conflictPairs 구조는 폐기하고 옵션 자체를 v1.0 문구·세트로 재정의(WOMEN_SAFETY_01)
- 동일 증상 기간을 Module 내부에서 재질문하지 않는다(9장 Module이 아직 없으므로 이번 Sprint는 해당 없음, 다음 Sprint 설계 원칙으로 명시)
- 다수의 중복 자유입력 폐기 → 마지막 자유입력(FREE_01/02) 1개로 통합, 예외 3개만 유지(4.19 참고)
- SingleChoice 300ms auto-next 폐기 → "계속" 버튼 방식으로 전환

## 8. 상세 Module 구현 상태 (9장 router target)

| primary_concern key | Module | 상태 |
|---|---|---|
| sleep | Sleep | **구현 완료** (SLEEP_01~SLEEP_03A, 4.4 참고) |
| digestion | GI | **구현 완료** (GI_01~GI_03, 4.5 참고) |
| bowel | Bowel | **구현 완료** (BOWEL_01~BOWEL_04, 4.6 참고) |
| urinary | Urinary | **구현 완료** (URINARY_01~URINARY_04, 4.7 참고) |
| pain | Pain | **구현 완료** (PAIN_01~PAIN_04A, 4.8 참고) |
| fatigue | Fatigue | **구현 완료** (FATIGUE_01~03, 4.9 참고) |
| stress | Stress | **구현 완료** (STRESS_01/03, 4.10 참고) |
| women | Women | **구현 완료** (WOMEN_01~03, 4.11 참고) |
| pregnancy | Pregnancy | **구현 완료** (PREGNANCY_01~03A, 4.12 참고) |
| postpartum | Postpartum | **구현 완료** (POSTPARTUM_01~03, 4.13 참고) |
| weight | Weight | **구현 완료** (WEIGHT_01~04, 4.14 참고) |

`primaryModuleTarget(r)` / `secondaryModuleTargets(r)` (`src/spec/coreSpec.ts`)가
현재 응답 기준으로 연결될 Module 이름만 계산해서 Dev JSON에 노출한다.
`primary_concern`이 지원하는 11개 key(sleep/digestion/bowel/pain/urinary/
fatigue/stress/women/pregnancy/postpartum/weight) 전부 상세 Module 문항까지
구현이 끝났다. `routing.modules_activated`(`modulesActivated(r)`)는 그
11개 key에 각각 대응하는 Module 이름 1개짜리 배열을 반환하고, 그 외에는(예:
체질·보약 경로) 빈 배열이다. 동반문제로 이 값들을 선택한 경우는
`secondary_concerns.router_targets`에 해당 이름만 남고 `modules_activated`에는
포함되지 않는다(전체 Module 미실행 — secondary short screen은 아직 없음).

Router는 `primary_concern` 하나만을 유일한 정보원으로 쓰지 않도록 설계했다.
`primary_concern.key` / `secondary_concerns.router_targets`를 Dev JSON에 함께
남겨, 다음 Sprint에서 "주호소 + 동반문제 + Module 결과"를 함께 쓰는 Router로
확장할 수 있게 했다.

## 9. 다음 Sprint 연결점

이번 Sprint로 11개 상세 Module(Sleep/GI/Bowel/Urinary/Pain/Fatigue/Stress/
Women/Pregnancy/Postpartum/Weight) 문항 구현이 모두 끝났다. 남은 항목:

- 동반문제(SECONDARY_01)로 각 카테고리를 선택한 경우를 위한 secondary short
  screen 구현 — SLEEP_01의 "특별히 없어요" 옵션은 이 short screen에서만 사용
- Router가 `primary_concern.key` + `secondary_concerns` + Module 결과를 함께
  참고하도록 확장(전체 integration)
- WOMEN_SAFETY_01과 임신/산후 상세 Module, POSTPARTUM_01/03 간 중복 응답
  자동 skip 설계
- GI_03/BOWEL_03 module-level safety flag를 공통 Red Flag(SAFETY_01)와 함께
  진료 요약 화면 등에서 어떻게 보여줄지 UX 설계(현재는 Dev JSON `flags`에만 노출)
- Stress Module에 자살사고/자해 선별 질문 추가 여부 검토(이번 Sprint에서는
  범위 밖으로 보고 추가하지 않음)
- Weight Module에 비의도적 체중 감소 여부 질문 추가 여부 검토

## 10. 이번 Sprint 범위 밖 (금지)

DB, Supabase, Firebase, server, AI, LLM, 굿닥, 동의보감 연동, localStorage 사용
전부 이번 Sprint에서 다루지 않는다. `src/spec/coreSpec.ts` / `src/App.tsx` 등
어디에도 해당 연동 코드가 없다.
