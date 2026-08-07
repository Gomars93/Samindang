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

**스크롤 안내(scroll affordance)**: 800×1280 기준 고정 영역(header 102px +
footer 186px + main padding 56px)을 뺀 콘텐츠 예산은 936px이다. 전체 86개
화면 중 84개는 이 안에 들어가고, `SECONDARY_01`(동반문제, 11지선다 +
보조문구, 약 1084px)과 `HISTORY_01`(중요 병력, 11지선다, 약 1030px) 2개만
내부 스크롤이 필요하다. 두 화면 모두 `없음` 선택지가 목록 맨 아래에 있어,
동반문제가 없거나 병력이 없는 환자가 스크롤하지 않으면 진행 수단을 못 찾을
위험이 있었다. 이를 막기 위해 `.shell__main`이 스크롤 가능하고 아직 하단에
도달하지 않았을 때만 하단 그라데이션 + `⌄` 표시(`.shell__scrollHint`,
`aria-hidden`, `pointer-events: none`)를 띄운다. 선택지 순서·문구·버튼
크기·글자 크기는 일절 바꾸지 않았다. 이 예산 계산은
`tests/layout-budget.spec.mjs`가 매 실행마다 자동 검증하며, 새로 예산을
넘기는 화면이 생기면 실패한다.

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
[동반문제 짧은 화면 — 각각 secondary_concerns에 포함 && primary가 같은 카테고리가 아닐 때만]
  SEC_SLEEP_01 / SEC_GI_01 / SEC_BOWEL_01 / SEC_PAIN_01 / SEC_URINARY_01 /
  SEC_FATIGUE_01 / SEC_STRESS_01 / SEC_WOMEN_01 / SEC_WEIGHT_01
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
[여성이면서, 산후 주호소가 아니고, 임신 주호소에서 pregnant로 확정되지 않은 경우만] WOMEN_SAFETY_01
  ↓
TEST_01 (검사자료)
  ↓
BIRTH_01 / BIRTH_02 → (음력이면 BIRTH_02A) / BIRTH_03 → (시진을 선택했으면 BIRTH_03A)
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
- 동반문제 때문에 전체 상세 Module을 반복 실행하지 않는다 — 대신 4.15의
  짧은 화면(카테고리당 1문항)으로 대신한다.

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
실행한다. 동반문제(`secondary_concerns`)로 sleep을 선택한 경우는 Sleep 전체
Module을 실행하지 않는다 — router target(`Sleep`)만
`secondary_concerns.router_targets`에 유지되고, 실제 문항은 4.15의 짧은 화면
(SEC_SLEEP_01) 1문항으로 대신한다. stage label은 "상세 증상"이다.

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
논리적으로 모순된다. 이 절에서 예고했던 "동반문제 sleep short screen에 한해
'특별히 없어요'를 포함"은 4.15에서 SEC_SLEEP_01로 구현이 끝났다(공용
`Question`/`MultiChoice` 컴포넌트를 그대로 재사용). "선택 완료" 버튼으로
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
실행한다. 동반문제로 속·소화(digestion)를 선택한 경우는 GI 전체 Module을
실행하지 않는다 — router target(`GI`)만 `secondary_concerns.router_targets`에
유지되고, 실제 문항은 4.15의 짧은 화면(SEC_GI_01) 1문항으로 대신한다. Dev
JSON/Router 표기는
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
Bowel 전체 Module을 실행하지 않는다 — router target(`Bowel`)만 유지되고,
실제 문항은 4.15의 짧은 화면(SEC_BOWEL_01) 1문항으로 대신한다.

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
선택한 경우는 전체 Module을 실행하지 않는다 — router target(`Urinary`)만
유지되고, 실제 문항은 4.15의 짧은 화면(SEC_URINARY_01) 1문항으로 대신한다.

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
전체 Module을 실행하지 않는다 — router target(`Pain`)만 유지되고, 실제
문항은 4.15의 짧은 화면(SEC_PAIN_01) 1문항으로 대신한다.

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
target(`Fatigue`)만 유지, 전체 Module 미실행. 실제 문항은 4.15의 짧은
화면(SEC_FATIGUE_01) 1문항으로 대신한다.

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
router target(`Stress`)만 유지, 전체 Module 미실행. 실제 문항은 4.15의 짧은
화면(SEC_STRESS_01) 1문항으로 대신한다.

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
미실행. 실제 문항은 4.15의 짧은 화면(SEC_WOMEN_01) 1문항으로 대신한다.

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
않도록 새 질문을 만들지 않았다. WOMEN_SAFETY_01 중복 skip은 4.18에서
구현이 끝났다(임신·산후 경로에서만 조건부로 skip, 생리·갱년기 women 경로는
WOMEN_SAFETY_01이 계속 유일한 안전정보원이므로 그대로 노출된다).

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
> `breastfeeding` 항목이 있어 POSTPARTUM_01/03과 의미가 겹쳤다. 4.18에서
> 자동 skip을 구현했다 — 산후(postpartum) 주호소에서는 WOMEN_SAFETY_01 화면
> 자체를 더 이상 보여주지 않고, `deriveReproductiveStatus(r)`가
> POSTPARTUM_01(경과)+POSTPARTUM_03(수유) 값에서 같은 사실을 파생시킨다.
> 두 화면을 하나로 합치지는 않았다 — WOMEN_SAFETY_01은 다른 주호소
> 경로에서는 여전히 유일한 안전정보원이라 화면 자체는 남겨두고 산후 경로에서만
> 조건부로 뺐다.

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
유지, 전체 Module 미실행. 실제 문항은 4.15의 짧은 화면(SEC_WEIGHT_01)
1문항으로 대신한다.

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

### 4.15 동반문제(secondary_concerns) 짧은 화면

이번 Sprint에서 새로 구현했다. 9장에서 남겨두었던 마지막 큰 항목이다.

**진입 조건**: 화면마다 `has(SECONDARY_01, <key>) && primaryConcernKey(r) !==
<key>`(예: SEC_SLEEP_01은 `secondary_concerns includes sleep &&
primary_concern !== sleep`)다. `primaryConcernKey(r) !== <key>` 조건은
방어적으로 추가했다 — `SECONDARY_01.optionsIf`가 이미 주호소와 같은 항목을
선택지에서 제외하므로 정상 흐름에서는 항상 참이지만, 두 조건을 각 show_if에
모두 남겨 UI 변경 없이도 안전하게 유지되도록 했다. 여성 건강만 예외로
`SEC_WOMEN_01`은 주호소가 women/pregnancy/postpartum 중 어느 것도 아닐 때만
보인다(임신·산후 경로도 동반문제 화면에서는 women으로 정규화되기 때문).

**설계 규칙**: 짧은 화면은 각 primary Module의 1번 문항(가장 넓은
multi_choice)의 선택지를 그대로 재사용하고, `exclusive: 'none'`인 "특별히
없어요" 옵션 하나만 추가한다. 이것이 4.4에서 예고했던 것 — SLEEP_01에는
의도적으로 "특별히 없어요"를 넣지 않았는데, 그 이유가 바로 이 절의 짧은
화면(SEC_SLEEP_01)에서 쓰기 위해서였다. 자유입력이 늘어나는 것을 막기 위해
SEC_PAIN_01(원본 PAIN_01의 `other`)과 SEC_WOMEN_01(원본 WOMEN_01의
`other`)은 원본의 "그 밖의 …" 옵션을 빼고 가져왔다 — 짧은 화면에는
PAIN_01A/WOMEN_01A 같은 하위 자유입력 문항이 없다. SEC_WEIGHT_01만
예외적으로 원본 WEIGHT_01처럼 `single_choice`를 유지했다(목표는 한 번에
하나만 고르는 게 자연스러워서 원본부터 single_choice였다) — 그래서
`exclusive`도 없고 "없어요" 옵션도 없다.

| screen_id | variable | 원본 문항 | input |
|---|---|---|---|
| SEC_SLEEP_01 | sec_sleep_problems | 잠에 대해서는 어떤 점이 불편한가요? | multi_choice, exclusive: none |
| SEC_GI_01 | sec_gi_problems | 속이나 소화에 대해서는 어떤 점이 불편한가요? | multi_choice, exclusive: none |
| SEC_BOWEL_01 | sec_bowel_problems | 대변에 대해서는 어떤 점이 불편한가요? | multi_choice, exclusive: none |
| SEC_PAIN_01 | sec_pain_locations | 아픈 곳은 어디인가요? | multi_choice, exclusive: none |
| SEC_URINARY_01 | sec_urinary_problems | 소변이나 방광에 대해서는 어떤 점이 불편한가요? | multi_choice, exclusive: none |
| SEC_FATIGUE_01 | sec_fatigue_patterns | 피로에 대해서는 어떤 점이 불편한가요? | multi_choice, exclusive: none |
| SEC_STRESS_01 | sec_stress_problems | 스트레스나 마음에 대해서는 어떤 점이 힘든가요? | multi_choice, exclusive: none |
| SEC_WOMEN_01 | sec_women_problems | 여성 건강에 대해서는 어떤 점이 불편한가요? | multi_choice, exclusive: none |
| SEC_WEIGHT_01 | sec_weight_goal | 체중 관리에서는 무엇을 가장 원하시나요? | single_choice |

모두 helper "해당되는 것을 모두 선택해주세요."(SEC_WEIGHT_01 제외, single_choice라
helper 없음), 필수, step은 "상세 증상"이다.

**SEC_SLEEP_01** — 옵션: sleep_onset(잠들기 어려워요) /
night_awakenings(자다가 자주 깨요) / early_waking(너무 일찍 깨요) /
nonrestorative(충분히 자도 개운하지 않아요) / none(특별히 없어요,
exclusive). SLEEP_01과 동일한 4개 + none.

**SEC_GI_01** — 옵션: indigestion(소화가 잘 안 되고 더부룩해요) /
epigastric_discomfort(명치나 윗배가 답답하거나 아파요) / reflux(속이
쓰리거나 신물이 올라와요) / nausea(메스껍거나 구역감이 있어요) /
poor_appetite(입맛이 없어요) / none(특별히 없어요, exclusive). GI_01과 동일.

**SEC_BOWEL_01** — 옵션: constipation(변이 잘 안 나오거나 딱딱해요) /
diarrhea(묽은 변이나 설사가 잦아요) / alternating(변비와 설사가 번갈아
있어요) / incomplete_emptying(보고 나도 덜 본 느낌이 있어요) /
abdominal_discomfort(배가 아프거나 불편하면서 대변 문제가 있어요) /
none(특별히 없어요, exclusive). BOWEL_01과 동일.

**SEC_PAIN_01** — 옵션: neck_shoulder(목·어깨) / low_back_pelvis(허리·골반) /
arm_hand(팔·손) / leg_foot(다리·발) / knee(무릎) / head_face_jaw(머리·얼굴·턱) /
chest_rib(가슴·갈비뼈 주변) / abdomen(배 주변) / none(특별히 없어요,
exclusive). PAIN_01과 동일하되 `other`는 뺐다. 원본은 single_choice였지만
이 화면은 여러 부위를 동시에 짚을 수 있어야 하므로 multi_choice로 바꿨다.

**SEC_URINARY_01** — 옵션: frequency(소변을 자주 봐요) / urgency(갑자기
소변이 마려워 참기 어려워요) / nocturia(밤에 자다가 소변 때문에 깨요) /
voiding_difficulty(소변이 잘 나오지 않거나 약해요) /
incomplete_emptying(소변을 봐도 덜 본 느낌이 있어요) / dysuria(소변 볼 때
아프거나 불편해요) / incontinence(소변이 새는 경우가 있어요) / none(특별히
없어요, exclusive). URINARY_01과 동일.

**SEC_FATIGUE_01** — 옵션: morning_fatigue(아침부터 기운이 없어요) /
exertional_fatigue(조금만 움직여도 쉽게 지쳐요) / later_day_fatigue(오후나
저녁에 더 처져요) / poor_recovery(쉬어도 회복이 잘 안 돼요) /
heaviness(몸이 무겁고 늘어져요) / sleepiness(졸리고 잠이 쏟아져요) /
none(특별히 없어요, exclusive). FATIGUE_01과 동일.

**SEC_STRESS_01** — 옵션: worry(걱정이나 생각이 많아요) / tension(긴장되고
예민해요) / irritability(짜증이나 화가 자주 나요) / low_mood(마음이
가라앉고 의욕이 없어요) / palpitation_tightness(가슴이 두근거리거나
답답할 때가 있어요) / somatic_worsening(스트레스를 받으면 몸 증상이
심해져요) / none(특별히 없어요, exclusive). STRESS_01과 동일.

**SEC_WOMEN_01** — 옵션: irregular_cycle(생리 주기가 불규칙해요) /
dysmenorrhea(생리통이 심해요) / flow_change(생리양이 너무 많거나 적어요) /
premenstrual(생리 전후 몸이나 기분 변화가 심해요) /
discharge_discomfort(냉·분비물이나 질 불편감이 있어요) /
menopause_symptoms(갱년기 증상이 있어요) / none(특별히 없어요, exclusive).
WOMEN_01과 동일하되 `other`는 뺐다.

**SEC_WEIGHT_01** — 옵션: weight_loss(체중을 줄이고 싶어요) /
fat_loss(체지방을 줄이고 싶어요) / appetite_control(식욕 조절이 가장
어려워요) / maintenance(요요 없이 유지하고 싶어요) /
health_management(전반적인 건강 관리를 함께 하고 싶어요). WEIGHT_01과
동일 5개, none 없음.

**짧은 화면에서 더 묻지 않는 것**: 원본 primary Module의 2번 문항 이후
(빈도/기간/조건부 세부 문항 등)는 짧은 화면에 없다. 동반문제는 진료
우선순위가 아니므로 1문항 스크리닝까지만 하고, 필요하면 원장 진료에서
추가로 확인한다.

**stale cleanup**: `SECONDARY_01`에서 해당 카테고리를 해제하면(예: sleep을
빼면) `SEC_SLEEP_01`이 show_if를 잃고 `null`로 정리된다(기존
`pruneStaleResponses` 그대로 재사용, 새 로직 추가 없음). 반대로 주호소가
바뀌어 짧은 화면 카테고리와 같아지면(예: 주호소가 sleep으로 바뀌었는데
동반문제에 여전히 sleep이 남아있던 경우) `SECONDARY_01.optionsIf`가 화면에서
sleep을 감추고, 5장에서 새로 다루는 `optionsIf` 필터링으로 저장된
`secondary_concerns` 배열에서도 sleep이 제거되며 `SEC_SLEEP_01`도 함께
정리된다.

**Dev JSON**: `responses.secondary_modules = { sleep: { problems }, gi: {
problems }, bowel: { problems }, pain: { locations }, urinary: { problems },
fatigue: { patterns }, stress: { problems }, women: { problems }, weight: {
goal } }`(primary Module과 겹치지 않도록 `modules` 그룹과 분리 저장). 각
값은 primary Module과 마찬가지로 화면이 안 보이면 `null`이다.

### 4.16 체질·보약 추가 문항 (visit_goal === constitution 인 경우만)

| screen_id | variable | 질문 | 선택지 |
|---|---|---|---|
| CONST_ENERGY | energy_recovery | 평소 기운과 회복력은 어떠신가요? | sufficient(충분한 편이에요) / tired_recovers(쉽게 피곤하지만 쉬면 회복돼요) / frequent_poor(자주 피곤하고 회복이 더뎌요) / always_exhausted(늘 기운이 없고 쉽게 지쳐요) |
| CONST_SLEEP | sleep_basic | 평소 잠은 어떠신가요? | normal(특별히 불편하지 않아요) / onset_difficulty(잠들기 어려워요) / frequent_waking(자주 깨요) / nonrestorative(자도 개운하지 않아요) |
| CONST_DIGESTION | digestion_basic | 속이나 소화는 어떠신가요? | normal(특별히 불편하지 않아요) / occasional(가끔 불편해요) / frequent(자주 불편해요) / severe(식사가 부담스러울 정도예요) |
| CONST_BOWEL | bowel_basic | 대변은 어떠신가요? | regular(규칙적이고 편해요) / constipation(변비가 있어요) / loose(묽거나 설사를 자주 해요) / alternating(변비와 설사가 번갈아 있어요) |

모두 single_choice, 필수. 이 문항들 다음에 4.17의 한약 참고용 공통정보로 이어진다.

### 4.17 한약 처방 참고용 최소 공통정보 (전원 공통)

| screen_id | variable | 질문 | 선택지 |
|---|---|---|---|
| HERB_APPETITE | appetite_level | 평소 식욕은 어떠신가요? | low(적은 편이에요) / normal(보통이에요) / good(좋은 편이에요) / excessive(지나치게 강한 편이에요) / irregular(일정하지 않아요) |
| HERB_THERMAL | thermal_tendency | 평소 추위와 더위는 어떠신가요? | cold_sensitive(추위를 많이 타요) / heat_sensitive(더위를 많이 타요) / both(둘 다 많이 타요) / neither(둘 다 특별하지 않아요) |
| HERB_THIRST | thirst_level | 평소 갈증은 어떠신가요? | minimal(갈증이 거의 없어요) / normal(보통이에요) / frequent(자주 목이 말라요) / severe(물을 마셔도 갈증이 심해요) |
| HERB_SWEAT | sweat_pattern | 평소 땀은 어떤 편인가요? | normal(특별하지 않아요) / low(적은 편이에요) / high(많은 편이에요) / exertion_excessive(조금만 움직여도 많이 나요) / night_sweat(잘 때 땀이 나요) |

모두 single_choice, 필수, always 표시. v0.2의 "찬물/따뜻한 물 선호"
(`drink_temp_preference`, CORE_12A)는 삭제했다.

### 4.18 약물 · 병력 · 알레르기 · 수술 · 여성 안전 · 검사자료

| screen_id | variable | input | 필수 | show_if |
|---|---|---|---|---|
| MED_USE | medication_use | single_choice | 필수 | always |
| MED_TYPES | medication_types | multi_choice | 선택 | `medication_use in [yes, unknown]` |
| HISTORY_01 | medical_history_flags | multi_choice (exclusive: none) | 필수 | always |
| ALLERGY_01 | allergy_yn | single_choice | 필수 | always |
| ALLERGY_02 | allergy_detail | short_text(50자) | 필수 | `allergy_yn === yes` |
| SURGERY_01 | surgery_yn | single_choice | 필수 | always |
| SURGERY_02 | surgery_detail | short_text(50자) | 필수 | `surgery_yn === yes` |
| WOMEN_SAFETY_01 | reproductive_status | multi_choice (exclusive: none) | 필수 | `patient_sex === female && primary !== postpartum && !(primary === pregnancy && PREGNANCY_01 === 'pregnant')` |
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

**show_if (이번 Sprint에서 조건부 skip 추가)**: `patient_sex === female`은
그대로 유지하되, 다음 두 경우에는 화면 자체를 보여주지 않는다.

- 주호소가 postpartum(출산 후 회복 상담)인 경우 — 산후 경로는
  POSTPARTUM_01(경과)+POSTPARTUM_03(수유)가 이미 WOMEN_SAFETY_01의
  `postpartum_1y`/`breastfeeding`과 같은 사실을 더 자세히 묻는다.
- 주호소가 pregnancy이면서 `PREGNANCY_01 === 'pregnant'`로 확정된 경우 —
  한약 안전성상 가장 중요한 사실("임신 중")이 이미 확보됐다. 반대로
  `possible`/`trying`/`fertility`/`unknown`이거나 아직 PREGNANCY_01에
  답하지 않은 경우는 수유·산후 여부가 전혀 확인되지 않으므로
  WOMEN_SAFETY_01을 그대로 유지해서 계속 묻는다.

임신/산후 상세 경로(VISIT_02_WOMEN)와 정보가 겹치더라도, 이 화면은 위 두
경우를 제외하면 여전히 "현재 안전상태"를 확인하는 별도 역할을 유지한다.
생리·갱년기(women) 주호소, 동반문제로만 여성 건강을 선택한 경우, symptom/
weight/constitution 주호소인 여성 환자는 모두 기존과 동일하게 이 화면을
본다.

**`deriveReproductiveStatus(r)`** (`src/spec/coreSpec.ts`) — 임신/산후 관련
사실 하나를 WOMEN_SAFETY_01, Pregnancy Module, Postpartum Module 중 어느
화면 답을 근거로 확정할지 정리하는 파생 함수. 반환 타입 `ReproductiveStatus`는
어느 화면에서 확정했는지 나타내는
`source: 'postpartum_module' | 'pregnancy_module' | 'WOMEN_SAFETY_01' | null`,
그 근거가 된 원본 응답 배열 `raw: string[] | null`, 그리고 `pregnant` /
`pregnancy_possible` / `postpartum_1y` / `breastfeeding` 4개
`boolean | null` 필드로 구성된다.

- 주호소가 postpartum이면 `source: 'postpartum_module'`. `postpartum_1y`는
  POSTPARTUM_01이 `within_6_weeks`/`6w_to_3m`/`3_to_6m`/`6_to_12m` 중
  하나면 true, `over_1y`면 false, 미응답이면 null. `breastfeeding`은
  POSTPARTUM_03이 `yes`/`mixed`면 true, `no`면 false, 미응답이면 null.
  `pregnant`/`pregnancy_possible`은 이 경로에서 물은 적이 없으므로 항상
  null이다.
- 주호소가 pregnancy이고 `PREGNANCY_01 === 'pregnant'`면
  `source: 'pregnancy_module'`, `pregnant: true`,
  `pregnancy_possible: false`, `postpartum_1y`/`breastfeeding`은 이 경로에서
  물은 적이 없으므로 null.
- 그 외에는 `source: 'WOMEN_SAFETY_01'`이고 그 화면 응답 배열에서 각 값의
  포함 여부를 그대로 boolean으로 옮긴다. 단 두 가지 보정이 있다:
  - 응답이 정확히 `['unknown']`이면 4개 값 모두 null(확인되지 않은 사실은
    `none`/`unknown`과 구분해 반드시 null로 둔다).
  - 임신 주호소에서 `PREGNANCY_01 === 'possible'`인데 WOMEN_SAFETY_01
    응답에 `pregnancy_possible`이 빠져 있으면(두 화면 모두 노출되는
    구간이므로 발생 가능) 그 사실을 잃지 않도록 `pregnancy_possible`을
    true로 보정한다.
- WOMEN_SAFETY_01에 아직 응답하지 않았고 위 두 우선 경로에도 해당하지
  않으면 `source: null`, `raw: null`, 4개 값 모두 null.

**Dev JSON**: `responses.reproductive_status = { reproductive_status:
r['WOMEN_SAFETY_01'], derived: deriveReproductiveStatus(r) }`.

**TEST_01** 질문: "최근 건강검진이나 검사에서 이상이 있다고 들은 내용이 있나요?"
선택지: none(없어요) / yes(있어요) / unknown(잘 모르겠어요)
`yes` 선택 시 안내 문구: "검사 결과지가 있으면 진료 때 보여주세요."
이번 Sprint에서는 검사수치를 환자에게 직접 입력시키지 않는다.

### 4.19 생년·출생정보

| screen_id | variable | input | 필수 | show_if |
|---|---|---|---|---|
| BIRTH_01 | birth_date | numeric(8) | 필수 | always |
| BIRTH_02 | birth_calendar_type | single_choice | 필수 | always |
| BIRTH_02A | lunar_leap_month | single_choice | 필수 | `birth_calendar_type === 'lunar'` |
| BIRTH_03 | birth_time_branch | single_choice | 필수 | always |
| BIRTH_03A | birth_time_confidence | single_choice | 필수 | `birth_time_branch`가 `unknown`도 미응답도 아닐 때 |

- BIRTH_01: "생년월일을 입력해주세요." (숫자만, 예: 19900101)
- BIRTH_02: "양력·음력을 알고 계신가요?" — solar(양력) / lunar(음력) / unknown(잘 모르겠어요)
- BIRTH_02A: "음력 생일이 윤달이었나요?" — no(평달이에요) / yes(윤달이에요) / unknown(잘 모르겠어요).
  음력을 선택했을 때만 표시된다. 안내: "윤달이 아니면 '평달이에요'를 선택해주세요."
- BIRTH_03: "태어난 시간대를 선택해주세요." — 환자에게 익숙한 시계 시간을
  먼저 보여주고 괄호 안에 12시진 이름을 보조로 붙인 13개 선택지(12개 시진 +
  잘 모르겠어요):

  | value | label |
  |---|---|
  | ja | 밤 11시 ~ 새벽 1시 (자시) |
  | chuk | 새벽 1시 ~ 새벽 3시 (축시) |
  | in | 새벽 3시 ~ 새벽 5시 (인시) |
  | myo | 새벽 5시 ~ 아침 7시 (묘시) |
  | jin | 아침 7시 ~ 오전 9시 (진시) |
  | sa | 오전 9시 ~ 오전 11시 (사시) |
  | o | 오전 11시 ~ 오후 1시 (오시) |
  | mi | 오후 1시 ~ 오후 3시 (미시) |
  | sin | 오후 3시 ~ 오후 5시 (신시) |
  | yu | 오후 5시 ~ 저녁 7시 (유시) |
  | sul | 저녁 7시 ~ 밤 9시 (술시) |
  | hae | 밤 9시 ~ 밤 11시 (해시) |
  | unknown | 잘 모르겠어요 |

- BIRTH_03A: "그 시간대가 얼마나 정확한가요?" — exact(정확히 알아요) /
  approximate(대략 그 정도예요). BIRTH_03에서 실제 시진을 선택했을 때만
  표시된다(`unknown` 선택 시에는 묻지 않는다).

**BIRTH_04(옛 `birth_time_detail`, 자유 텍스트)는 완전히 삭제했다.** 이유는
두 가지다: (1) 자유입력 최소화 원칙(4.20 참고) — "오전 7시경" 같은 자유 텍스트는
기계가 정확히 해석할 수 없어 결정적(deterministic) 계산에 쓸 수 없었다.
(2) 12시진 선택지(BIRTH_03)만으로 이미 사주 계산 엔진이 필요로 하는 시간대
정보를 결정적으로 얻을 수 있어, 같은 정보를 두 번 묻지 않는다. 정확도 신호는
BIRTH_03A(정확히/대략)로 자유 텍스트 없이 보존한다.

이 정보는 Dev JSON에서 `birth_info` 그룹으로 증상·검사·병력 정보와 분리
저장한다. `birth_info`는 응답을 그대로 옮긴 것이고, 이 응답을 바탕으로
계산한 사주 결과는 별도 최상위 필드 `myungri_calculation`이다(9장 참고).
문진 응답 자체는 임상 진단값처럼 자동 해석하지 않는다.

### 4.20 마지막 자유입력

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

`pruneStaleResponses`의 기본 동작(show_if 기반 null 정리)은 변경 없이 그대로
재사용한다. 매 응답 저장 시 `visibleQuestions(responses)`를 다시 계산하고,
더 이상 show_if를 만족하지 않는 screen_id의 응답을 반복적으로(연쇄 의존까지)
`null`로 되돌린다.

예:
- 불편한 증상(symptom) → sleep 선택 → 뒤로가기 → 체질·보약(constitution)으로 변경
  → `primary_symptom`/`chief_duration`/`chief_impact` 등 symptom 경로 응답은
  현재 payload에서 제거된다.
- 여성(women) → pregnancy 선택 → 뒤로가기 → women(생리·갱년기)으로 변경
  → pregnancy 전용 응답은 즉시 제거된다.

**이번 Sprint에서 추가한 동작 — `optionsIf` 배열 값 필터링**: `optionsIf`를
가진 `multi_choice` 질문은 화면이 계속 보이더라도, 저장된 배열 값 중 현재
`optionsIf(r)`가 허용하지 않는 옵션이 남아있으면 걸러낸다(화면 자체를
`null`로 지우는 게 아니라 배열의 일부 원소만 제거). 계기는
`SECONDARY_01`이다 — 이 문항의 `optionsIf`는 주호소와 같은 카테고리를 화면
선택지에서 숨기지만, 뒤로가기 없이 주호소만 바뀐 경우 이전에 이미 저장된
`secondary_concerns` 배열 값은 그대로 남아 주호소와 동반문제가 중복될 수
있었다. 예: 주호소가 digestion이고 동반문제로 `[sleep, pain]`을 선택한
상태에서, 뒤로 가서 주호소를 sleep으로 바꾸면(동반문제 화면을 다시 거치지
않아도) 저장된 `secondary_concerns`에는 여전히 sleep이 남아 주호소·동반문제
양쪽에 sleep이 중복됐다. 이제 매 정리 주기마다 현재 허용된 옵션 집합과
교집합만 남긴다(위 예시라면 `[pain]`만 남는다). 값이 전부 걸러지면 빈
배열(`[]`)로 두고 `null`이나 `'none'`으로 바꾸지 않는다 — "아직 응답하지
않음"과 "전부 제거된 배열"은 다른 상태이기 때문이다.

**종료 보장**: `pruneStaleResponses`는 한 번의 저장마다 변화가 없을 때까지
반복한다. 매 반복에서 (a) 새로 `null`이 되는 응답 개수, 또는 (b) 필터링되는
배열들의 총 길이 중 최소 하나가 단조 감소하고, 둘 다 더 줄어들지 않는
시점에 반복이 멈추므로 무한루프가 없다.

`meta`(audit)에는 `discarded: true`로 표시만 남기고, `current` clinical
responses(`Responses` state) 자체에는 stale value가 남지 않는다.

## 6. Red Flag / 안전정보 요약

- SAFETY_01(공통 Red Flag): 전원 대상, 6개 항목 + 해당 없음(exclusive).
- WOMEN_SAFETY_01(여성 안전상태): 여성 대상, 7개 항목 + 해당 없음(exclusive).
  단 산후 주호소이거나 임신 주호소에서 `PREGNANCY_01 === 'pregnant'`로
  확정된 경우는 4.18에서 설명한 이유로 이 화면을 건너뛴다 — 그 두 경로는
  `deriveReproductiveStatus(r)`가 POSTPARTUM_01/03 또는 PREGNANCY_01에서
  같은 안전정보를 파생시킨다.
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
- 다수의 중복 자유입력 폐기 → 마지막 자유입력(FREE_01/02) 1개로 통합, 예외 3개만 유지(4.20 참고)
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
| (동반문제) sleep/digestion/bowel/pain/urinary/fatigue/stress/women/weight | 짧은 화면 9개 | **구현 완료** (SEC_*, 4.15 참고) |

`primaryModuleTarget(r)` / `secondaryModuleTargets(r)` (`src/spec/coreSpec.ts`)가
현재 응답 기준으로 연결될 Module 이름만 계산해서 Dev JSON에 노출한다.
`primary_concern`이 지원하는 11개 key(sleep/digestion/bowel/pain/urinary/
fatigue/stress/women/pregnancy/postpartum/weight) 전부 상세 Module 문항까지
구현이 끝났고, 동반문제 9개 카테고리(women/pregnancy/postpartum은 짧은
화면에서 women 하나로 합쳐짐)도 짧은 화면까지 구현이 끝났다(4.15).
`routing.modules_activated`(`modulesActivated(r)`)는 여전히 primary 11개
key에 각각 대응하는 Module 이름 1개짜리 배열만 반환하고, 그 외에는(예:
체질·보약 경로) 빈 배열이다 — **동반문제 짧은 화면은 절대 포함하지 않는다**.
동반문제로 이 값들을 선택한 경우는 `secondary_concerns.router_targets`에
해당 이름만 남고 `modules_activated`에는 포함되지 않는다(전체 Module 미실행,
짧은 화면 1문항만 실행).

Router는 `primary_concern` 하나만을 유일한 정보원으로 쓰지 않도록 설계했다.
`primary_concern.key` / `secondary_concerns.router_targets`를 Dev JSON에 함께
남겨두었고, 아래 8.1에서 이번 Sprint에 실제로 통합한 `buildRoutingPayload(r)`을
설명한다.

### 8.1 Router 통합 (`buildRoutingPayload`)

`buildRoutingPayload(r)`(`src/spec/coreSpec.ts`)가 Dev JSON 최상위
`routing` 필드를 채운다. 예전에는 App.tsx가 `{ modules_activated }` 하나만
직접 만들어 넣었는데, 이제 이 함수가 그 자리를 대체하며 "주호소 + 동반문제 +
실제로 보인 화면"을 한 덩어리로 묶는다. 반환 필드:

| 필드 | 값 |
|---|---|
| `primary_concern` | `primaryConcernKey(r)` |
| `primary_module` | `primaryModuleTarget(r)` |
| `modules_activated` | `modulesActivated(r)` — primary 상세 Module만, 짧은 화면 절대 미포함 |
| `secondary_concerns` | `r['SECONDARY_01']`(원본 응답 배열) |
| `secondary_screens` | `secondaryScreensActivated(r)` — 현재 실제로 보이는 짧은 화면들의 router target 이름 목록 |
| `all_targets` | primary 먼저, 그다음 secondary_screens 순서로 중복 없이 합친 목록 |

규칙: `modules_activated`는 "실제로 실행된 primary 상세 Module"만 의미하고
짧은 화면은 절대 포함하지 않는다 — 짧은 화면은 항상 `secondary_screens`로만
분리해서 표기한다. `all_targets`는 primary를 먼저 넣고 그다음
`secondary_screens`를 순서대로 추가하되, 이미 들어있는 이름은 다시 넣지
않는다(예: 이론상 primary와 secondary target이 같은 이름을 가리키는 경우
방어). Dev JSON에서는 `responses`와 형제 필드인 최상위 `routing`으로 노출된다(`src/App.tsx`).

## 9. 명리(사주) 계산 결과 (`myungri_calculation`)

> **결정 대기 중 — 반드시 읽을 것**: 야자시/조자시(자시를 자정 기준으로
> 나눌지) 정책과 진태양시(true solar time) 적용 여부는 **아직 결정되지
> 않았다**. 이 소프트웨어는 그 둘 중 하나를 임의로 골라 계산하지 않고,
> 대신 해당 상황을 명시적으로 플래그로 표시해 원장 박경남의 승인을
> 기다린다. 정책 후보와 각 후보를 선택했을 때의 영향은
> `docs/MYUNGRI_CALCULATION_POLICY_PENDING.md`에 정리되어 있다 — 이 정책을
> 코드나 문서에서 바꾸려면 그 문서를 먼저 갱신하고 원장 승인을 받아야 한다.

### 9.1 위치와 분리 원칙

`myungri_calculation`은 Dev JSON(`src/App.tsx`의 done-phase payload)에서
`responses`/`flags`/`routing`과 형제인 **최상위 필드**다. `responses` 안에
넣지 않는다 — 계산된 사실(derived, 결정적 알고리즘의 산출물)과 환자가 직접
답한 문진(patient-reported responses)을 데이터상 분리하기 위해서다. 값은
`computeSaju(buildSajuInput(responses))`로 만든다:

- `buildSajuInput`(`src/spec/coreSpec.ts`)은 BIRTH_01/02/02A/03/03A와
  ID_03(성별) 응답을 엔진 입력 타입(`SajuInput`, `src/saju/types.ts`)으로
  옮기는 순수 어댑터다. coreSpec은 이 타입만 참조하고, 계산 엔진의 런타임
  코드(`src/saju/index.ts`)는 import하지 않는다 — 실제 계산 호출은
  App.tsx에서만 일어난다.
- `computeSaju`(`src/saju/index.ts`, 이번 Sprint에서 새로 만든
  결정적(deterministic) 계산 엔진, **수정 금지 대상**)가 실제 사주(만세력)
  계산을 수행한다.

### 9.2 `SajuResult` 형태

| 필드 | 설명 |
|---|---|
| `status` | `'resolved' \| 'partial' \| 'unresolved'` |
| `unresolved_reason` | 계산 불가 사유(한글 설명). `resolved`면 `null` |
| `input` | 엔진에 넘긴 `SajuInput`을 그대로 echo |
| `normalized` | 변환된 양력 날짜 + 실제 사용한 시진/시/분. 계산 불가 시 `null` |
| `pillars` | `{ year, month, day, hour }` 사주 네 기둥. 시간 미상이면 `hour: null` |
| `alternatives` | 자시(23:00~00:59) 구간일 때만 채워지는 day-boundary 대안 3종(`midnight`/`jasi`/`splitJasi`) |
| `flags` | `in_jasi_window` / `near_solar_term` / `hour_unknown` / `lunar_leap_unresolved` |
| `policy` | 적용한 정책 이름 + `algorithm_version` + `pending_approval`(원장 승인 대기 항목 목록) |
| `engine` | 사용 라이브러리(`manseryeok`)·버전·계산 시각 |

### 9.3 상태 결정 규칙

| 조건 | 결과 |
|---|---|
| `birth_calendar_type === 'unknown'` | `unresolved` — 양력/음력을 모르면 계산 불가 |
| 음력인데 `lunar_leap_month === 'unknown'` | `unresolved` — 윤달 여부 없이는 양력 변환 불가 |
| `birth_time_branch`가 `unknown` 또는 미응답 | `partial` — 다른 값은 모두 계산하되 `pillars.hour`는 `null` |
| `birth_time_branch === 'ja'`(자시) | `resolved`(또는 시간 미상이면 `partial`) + `alternatives`에 세 가지 day-boundary 대안을 계산해 채우고 `flags.in_jasi_window = true`, `policy.pending_approval`에 `day_boundary` 추가 |
| 그 외 정상 입력 | `resolved` |

진태양시(`true_solar_time`)는 **기본적으로 절대 적용하지 않는다**
(`policy.true_solar_time`은 항상 미적용을 의미하는 값). 생년월일이 절기
경계 근처(`near_solar_term`)일 때는 `flags.near_solar_term = true`와 함께
`policy.pending_approval`에 `true_solar_time`이 추가되어, 그 계산이 절기
경계의 영향을 받을 수 있음을 알릴 뿐 자동으로 보정하지 않는다.

### 9.4 소프트웨어가 하지 않는 것

`computeSaju`는 네 기둥(사주팔자)과 그 계산에 필요한 메타데이터만
산출한다. 십신·대운·용신 같은 명리 해석, 그리고 그 어떤 임상적 해석도
소프트웨어가 만들어내지 않는다 — 사주 원국을 임상적으로 어떻게 읽을지는
전적으로 원장의 몫이다.

## 10. 다음 Sprint 연결점

이번 Sprint로 11개 상세 Module(Sleep/GI/Bowel/Urinary/Pain/Fatigue/Stress/
Women/Pregnancy/Postpartum/Weight) 문항 구현과, 동반문제 짧은 화면 9개
(4.15), WOMEN_SAFETY_01 중복 skip(4.18), Router 통합(8.1)까지 모두 끝났다.
남은 항목:

- GI_03/BOWEL_03 module-level safety flag를 공통 Red Flag(SAFETY_01)와 함께
  진료 요약 화면 등에서 어떻게 보여줄지 UX 설계(현재는 Dev JSON `flags`에만 노출)
- Stress Module에 자살사고/자해 선별 질문 추가 여부 검토(이번 Sprint에서는
  범위 밖으로 보고 추가하지 않음)
- Weight Module에 비의도적 체중 감소 여부 질문 추가 여부 검토
- 야자시/조자시·진태양시 정책 확정(9장, `docs/MYUNGRI_CALCULATION_POLICY_PENDING.md` 참고) — 원장 박경남 승인 필요

**테스트**: `tests/integration.spec.mjs`에 자동 로직 테스트가 추가됐다.
`npm run test:integration`으로 실행하며(esbuild로 `coreSpec.ts`를 번들해
Node에서 바로 실행), 동반문제 짧은 화면, primary/secondary 중복 방지,
reproductive-status 파생, routing payload, payload null 무결성, 11개
primary Module 전체 회귀까지 검증한다. 사주 엔진 자체의 계산 정확성은
`tests/saju.spec.mjs`(`npm run test:saju`)가 별도로 검증한다.

## 11. 이번 Sprint 범위 밖 (금지)

DB, Supabase, Firebase, server, AI, LLM, 굿닥, 동의보감 연동, localStorage 사용
전부 이번 Sprint에서 다루지 않는다. `src/spec/coreSpec.ts` / `src/App.tsx` 등
어디에도 해당 연동 코드가 없다. `src/saju`의 결정적 계산 엔진 역시 임상
해석이나 AI/LLM 추론을 전혀 포함하지 않는다(9.4 참고).

## 12. 원장용 진료 전 요약 화면 (Doctor View)

`src/doctor/DoctorView.tsx`가 `#doctor` URL 해시로 접근하는 데스크톱 전용
화면을 구현한다(`src/App.tsx`가 `window.location.hash`를 읽어 분기하며,
`hashchange`를 구독해 라우팅 라이브러리 없이 실시간 전환한다). 환자용
태블릿 흐름(`src/App.tsx`의 나머지 phase, `src/styles.css`의 태블릿 규칙)은
전혀 건드리지 않는다 — `html.doctor-mode` 클래스가 붙어 있을 때만 `overflow:
hidden`을 `overflow: auto`로 덮어써서 데스크톱 스크롤을 허용한다(9장의
`html, body, #root { overflow: hidden }` 규칙 자체는 그대로 둔다).

### 12.1 데이터 계약

DoctorView는 절대 새 payload 형태를 만들지 않는다. 입력은 App.tsx의
`phase === 'done'`이 만드는 것과 동일한 shape이다:

```
{ questionnaire_version, session_id,
  responses: buildResponsePayload(...),
  flags: computeFlags(...),
  routing: buildRoutingPayload(...),
  myungri_calculation: computeSaju(buildSajuInput(...)),
  metadata }
```

`src/doctor/fixtures.ts`의 미리보기용 예시 데이터 7종도 이 payload를 손으로
쓰지 않고, 손으로 만든 `Responses` 위에 실제 builder를 그대로 실행해
만든다 — 그래야 스펙이 바뀌면 fixture도 함께 깨지거나 함께 맞아떨어진다.
라벨 해석은 `src/doctor/labels.ts`의 `optionLabel`/`answerLabel`이 저장된
enum 값을 `ALL_QUESTIONS`의 실제 옵션 라벨로 되돌리는 방식으로만 하며,
한글 라벨을 화면 쪽에 따로 하드코딩하지 않는다.

### 12.2 표시 우선순위 (12블록)

화면 상단부터 아래 순서로 배치하며, 진단·치료 추천 문구는 어디에도 넣지
않는다:

1. **안전 확인** — `flags.requires_staff_check`가 true일 때만 나타나는
   `--danger` 색상 배너. 어떤 안전 문진 응답 때문인지(SAFETY_01 red flag,
   GI_03, BOWEL_03) 나열하되 질병명을 절대 쓰지 않는다.
2. **환자 기본** — 성함/휴대폰 끝 4자리/성별/출생정보
3. **주호소** — 주호소 한글 라벨 + 지속기간 + 일상생활 영향 + 기타(자유입력)
4. **동반문제** — 동반문제 카테고리 + 각 카테고리 짧은 화면 응답
5. **상세 증상** — 활성화된 주호소 상세 Module 문항 전체 (label: value)
6. **전신·한약 참고** — 체질/한약 처방 참고용 공통 문항
7. **약물·병력·알레르기·수술**
8. **여성 안전정보** — 환자가 답한 원본(WOMEN_SAFETY_01)과
   `derived`(계산된 임신/산후/수유 여부) 및 그 `derived.source`를 함께 표시
9. **검사자료 / 원장에게 하고 싶은 말**
10. **명리 검토** — 좌우로 명확히 분리된 3열: (왼쪽) 원본 출생정보 —
    환자가 입력한 그대로(생년월일/달력 종류/윤달/시주 라벨/시간 확신도),
    (가운데) 계산된 사실 — 사주 네 기둥 + status + `flags.hour_unknown`이면
    "시주 미상" 명시 + (pending_approval이 있으면) 야자시/조자시·진태양시
    정책 미확정 경고와 `docs/MYUNGRI_CALCULATION_POLICY_PENDING.md` 안내,
    (오른쪽) 현재 문진 요약 — 주호소/기간/일상 영향/주요 모듈 응답. 십신·
    용신 등 해석은 추가하지 않는다.
11. **원장 판단 기록** — 12.5절의 `ClinicianJudgment` 폼. 명리 검토(10번)
    바로 아래, 원본 응답 보기(12번) 바로 위에 위치한다.
12. **원본 응답 보기** — 접힌 `<details>` 안의 raw JSON

### 12.3 null vs none vs unknown 표시 규칙

3.3의 원칙(질문을 보지 않음=`null` ≠ 환자가 "없음"이라고 답함=`'none'` ≠
환자가 "잘 모르겠어요"라고 답함=`'unknown'`)을 화면에서도 그대로 지킨다.
`null`/`undefined`(또는 빈 배열/빈 문자열)인 필드는 렌더링 자체를 건너뛴다
(정상/없음으로 표시하지 않는다). `'none'`/`'unknown'` 값은 실제로 렌더링하되
`doctorField__value--muted` 스타일로 흐리게 표시해, "안 물어봄"과 시각적으로
확실히 구분한다.

### 12.4 환자가 답한 것 vs 시스템이 계산한 것

문진 응답(환자가 직접 답한 것)과 routing/flags/`deriveReproductiveStatus`/
`computeSaju` 같은 파생 정보(시스템이 계산한 것)는 항상 분리해서 보여준다.
`routing.modules_activated`/`routing.secondary_screens`는 환자 응답 목록에
섞지 않고 별도의 요약 문구(파생 정보)로만 노출하며, 여성 안전정보와 명리
블록에는 "시스템이 계산한 것" 라벨을 명시적으로 붙인다.

### 12.5 원장 판단 데이터 계약 (`ClinicianJudgment`)

`src/doctor/judgment.ts`(순수 타입 + 헬퍼, React 없음)와
`src/doctor/JudgmentPanel.tsx`(폼 UI)가 구현한다. 이 계약은 **소프트웨어가
명리 해석이나 진단·처방을 생성하지 않는다**는 원칙을 데이터 모델 수준에서
강제하기 위한 것이다 — `ClinicianJudgment`의 모든 해석성 필드(`string`)는
원장이 화면에서 직접 타이핑한 값이며, 어떤 필드도 계산 로직으로 채워지지
않는다.

**3계층 분리(three-layer separation)** — 이 기능 전체의 핵심 전제:

1. **계산된 사실** — 결정적 사주 계산 + 라우팅/플래그
   (`payload.myungri_calculation`, `payload.flags`, `payload.routing`).
   이미 12.1~12.4절에서 다룬 기존 계약이며 이번 작업에서 손대지 않았다.
2. **환자가 답한 문진** — `payload.responses`. 마찬가지로 기존 계약 그대로.
3. **원장의 판단** — 이번에 추가된 `ClinicianJudgment`. 위 두 계층과 절대
   병합하지 않으며, UI에서도 명리 검토 블록(10번)과 원장 판단 기록
   블록(11번)으로 시각적으로 분리한다.

**타입 전문 (`src/doctor/judgment.ts`)**:

```ts
export const JUDGMENT_SCHEMA_VERSION = '1.0.0'
export const MAX_INNATE_FEATURES = 3
export const MAX_SYMPTOM_LINKS = 2

export type DebriefAnswers = { q1: string; q2: string; q3: string; q4: string }

export const DEBRIEF_QUESTIONS = [
  '이 사주에서 제일 중요하게 본 것은 무엇인가?',
  '사주만 보고 어떤 임상문제를 예상했는가?',
  '실제 문진·맥·설을 보고 무엇을 수정했는가?',
  '그 수정이 처방을 어떻게 바꿨는가?',
] as const

export type ClinicianJudgment = {
  schema_version: string
  recorded_at: string | null          // ISO, null until the clinician saves
  source: {
    session_id: string
    questionnaire_version: string
    myungri_algorithm_version: string
    myungri_library_version: string
    myungri_status: 'resolved' | 'partial' | 'unresolved'
    myungri_pending_approval: string[]
  }
  innate_features: string[]           // 핵심 선천 특징, 최대 3
  symptom_links: string[]             // 현재 증상과 연결되는 핵심, 최대 2
  saju_only_prediction: string
  revised_after_exam: string
  final_treatment_axis: string
  prescription_direction: string
  learning_case: boolean              // ★ 학습 케이스
  debrief: DebriefAnswers | null
  transcript_import: null             // 향후 녹취 임포트용 hook, MVP는 항상 null
}
```

**버전 필드** — `schema_version`은 `ClinicianJudgment`의 모양 자체가 바뀔 때
올린다. `source.myungri_algorithm_version`/`source.myungri_library_version`은
그 판단이 어떤 계산 엔진 버전을 보고 내려졌는지의 provenance이며
`src/saju/policy.ts`(`MYUNGRI_ALGORITHM_VERSION`)와 `manseryeok` 패키지
버전을 각각 그대로 echo한다 — 나중에 계산 로직이 바뀌었을 때 과거 판단이
어느 버전을 기준으로 했는지 추적하기 위함이다.

**최대 개수 제한** — `innate_features`는 최대 `MAX_INNATE_FEATURES`(3)개,
`symptom_links`는 최대 `MAX_SYMPTOM_LINKS`(2)개. UI(`JudgmentPanel.tsx`)는
처음부터 고정된 개수의 입력칸만 렌더링해 4번째를 추가할 방법 자체를 주지
않으며, `validateJudgment`가 방어적으로 한 번 더 개수를 검증한다.

**헬퍼 함수**:

- `createEmptyJudgment(payload)` — provenance(`source.*`)를 채우고 나머지는
  빈 값(빈 배열/빈 문자열/`false`/`null`)으로 초기화한다.
- `validateJudgment(j)` — 개수 제한과 `recorded_at`이 ISO 문자열이거나
  `null`인지만 검증한다. 한국어 에러 문자열을 반환한다. 내용의 임상적
  타당성은 절대 검사하지 않는다(그건 원장의 판단이다).
- `finalizeJudgment(j)` — 입력을 변경하지 않고 복사본에
  `recorded_at = new Date().toISOString()`을 채우고, `innate_features`/
  `symptom_links`에서 빈 문자열 항목을 제거한 복사본을 반환한다.

**저장소 없음** — 이 기능에는 DB/localStorage/백엔드가 전혀 없다.
`ClinicianJudgment`는 `JudgmentPanel` 컴포넌트의 React state에만 존재하며
화면을 새로고침하면 사라진다. `JudgmentPanel`은 이 사실을 화면에 그대로
안내한다. 이 데이터 계약(직렬화 가능한 순수 JSON 모양)은 나중에 백엔드로
넘길 때 그대로 `POST` body로 쓸 수 있도록 설계했지만, 저장/전송 로직 자체는
이번 스코프 밖이며 아직 구현되지 않았다.

**1분 디브리핑** — `debrief`는 선택 항목이며, `DEBRIEF_QUESTIONS`(4개
고정 질문)에 대한 원장의 짧은 답변 4개(`DebriefAnswers`)를 담는다. UI에서
기본적으로 접혀 있어(collapsed `<details>`) 아무 입력을 하지 않아도 부담이
없다. 음성 녹음 기능은 없으며, `transcript_import` 필드는 향후 녹취 임포트
기능을 위한 자리표시자로만 존재하고 MVP에서는 항상 `null`이다.

**설명 개요(explanation outline)** — 원장 전용 프레젠테이션 스캐폴드로,
원장이 입력한 `innate_features`/`symptom_links`/`final_treatment_axis`/
`prescription_direction`을 고정된 4단계 순서(1. 선천 특징 2. 현재 증상
연결 3. 치료 우선순위·한약 방향 4. 질문)로 그대로 재구성해서 보여준다.
새 내용을 추가하거나 만들어내지 않으며, 빈 항목은 `(미입력)`으로 표시한다.
자유 입력 질문 칸이 별도로 있으나 이는 `ClinicianJudgment` 계약에 포함되지
않는 UI 전용 메모다.

**향후 AI/규칙엔진과의 경계** — 만약 이후 스프린트에서 AI가 판단 후보를
생성하는 기능(예: Shadow Mode)이 추가되더라도, 그 결과는 절대
`ClinicianJudgment` 안에 병합하지 않는다. `ClinicianJudgment`의 모든 필드는
"원장이 실제로 타이핑한 값"이라는 불변식을 유지해야만, 나중에 AI 후보와
원장의 실제 판단을 나란히 비교하는 Shadow Mode가 정직하게 성립한다. AI가
생성한 후보는 완전히 별도의 네임스페이스(예: 별도 타입/파일)에 저장해야
한다.

**테스트**: `tests/doctor.spec.mjs`(`npm run test:doctor`)가
`src/doctor/fixtures.ts`/`src/doctor/labels.ts`/`src/doctor/judgment.ts`/
`src/doctor/sectionOrder.ts`를 esbuild로 번들해 검증한다 — fixture 7종
모두 `responses`/`flags`/`routing`/`myungri_calculation`을 갖는지, 안전
확인 fixture가 실제로 `requires_staff_check`인지, 임신 fixture의
`reproductive_status.derived.source`가 `pregnancy_module`인지, 출생시간
미상 fixture가 `status: 'partial'`에 `pillars.hour === null`인지, 자시
fixture의 `policy.pending_approval`에 `day_boundary`가 포함되는지, 라벨
해석 헬퍼가 여러 질문에 걸쳐 실제로 한글 라벨을 반환하고 원본 enum을 그대로
흘리지 않는지, `createEmptyJudgment`가 fixture의 provenance를 정확히
채우는지, `validateJudgment`가 4개/3개 초과를 한국어 에러로 거부하고
3개/2개는 통과시키는지, `finalizeJudgment`가 입력을 변경하지 않고
ISO `recorded_at`을 채우며 빈 문자열 항목을 제거하는지, `ClinicianJudgment`의
키 집합이 문서화된 계약과 정확히 일치하는지, 그리고 `DOCTOR_SECTION_ORDER`
에서 안전 배너/약물·병력이 명리 검토보다 항상 먼저 오는지까지 확인한다.
