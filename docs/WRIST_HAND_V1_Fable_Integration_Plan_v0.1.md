# WRIST_HAND_V1 — Fable Integration Plan v0.1

작성일: 2026-08-25
기준 브랜치: `clinical/wrist-hand-v1-review`
기준 commit: `ad5e466` (Opus Final Verification CLOSED)

authoritative clinical source (변경 금지, 재해석 금지):
- `docs/WRIST_HAND_V1_Tablet_Question_Set_v0.1.md` (본문)
- `docs/WRIST_HAND_V1_Tablet_Question_Set_v0.1.1.md` (§6 `infection_assessment_required`
  WH_07A `/empty` delta — 충돌 시 이 문서가 우선)
- `docs/WRIST_HAND_V1_Opus_Final_Verification_v1.0_CLOSED.md`
  (`PASS / CLINICAL DECISIONS CLOSED`)

이 문서는 위 CLOSED 문서를 실제 repo에 최소 변경으로 통합하는 계획만
다룬다. 새 임상 threshold는 만들지 않는다. TypeScript/UI/테스트
production 구현은 이 단계에서 하지 않았다.

---

## 0. Source of truth 원칙

- 임상 threshold의 유일한 근거는 Tablet v0.1 + v0.1.1 delta다. 이
  문서에 나오는 코드 스니펫은 그 threshold를 반영하는 **제안**이며,
  실제 값/조건은 Sonnet 구현 시 반드시 Tablet 문서 원문과 다시
  대조한다.
- LBP_V1/NECK_V1/SHOULDER_V1/KNEE_V1/ELBOW_V1은 CLOSED/FROZEN이다.
  이 계획은 그 threshold를 하나도 재해석하지 않는다.
- `ELBOW_00`/`arm_hand_region_discriminator`/`IS_PRIMARY_ARM_HAND`는
  ELBOW_V1이 만든 shared router다. 이 계획은 그 정의를 그대로
  재사용하고 수정하지 않는다.

---

## 1. 실제 repo audit 결과

`git show ad5e466:src/spec/coreSpec.ts`(현재 HEAD, ELBOW_V1 merge 이후)
기준으로 직접 확인했다.

### 1.1 현재 arm_hand routing (coreSpec.ts)

```text
IS_PRIMARY_ARM_HAND        (line 1077)
  = IS_PRIMARY_PAIN(r) && r['PAIN_01'] === 'arm_hand'

IS_PRIMARY_ELBOW_SAFETY    (line 1079-1080)
  = IS_PRIMARY_ARM_HAND(r) && ['ELBOW','FOREARM','DIFFUSE_OR_MULTIPLE','UNKNOWN'].includes(r['ELBOW_00'])

ARM_HAND_ROUTING_QUESTIONS (line 1868-1885)
  - ELBOW_00 / variable: arm_hand_region_discriminator
  - showIf: IS_PRIMARY_ARM_HAND (5개 값 전부에서 노출: ELBOW/FOREARM/WRIST_HAND/DIFFUSE_OR_MULTIPLE/UNKNOWN)
  - 이 배열은 IS_PRIMARY_ARM_HAND 하나로만 게이트된다 -- ELBOW_QUESTIONS
    안에 두면 "노출 조건이 ELBOW_00 값을 필요로 하는데 ELBOW_00 자신도
    그 조건 안에 있는" 순환이 생기기 때문(elbowLogic.ts 상단 주석,
    ELBOW Fable plan §2.1).

ELBOW_QUESTIONS (line 1890-2149, ELBOW_01-15)
  - 전부 IS_PRIMARY_ELBOW_SAFETY로 게이트 (일부는 추가로 IS_ELBOW_01_SHOWN/
    IS_ELBOW_09_SHOWN/!computeFlags(r).general_red 조건 추가)
```

### 1.2 ELBOW_V1 코드 구조 (재사용 가능한 패턴)

- `src/spec/elbowLogic.ts` -- Layer 1(순수 함수), `src/spec/elbowAdapter.ts`
  -- Layer 2(Responses/DoctorPayload → ElbowState 변환). 서로 다른
  모듈(NECK 등)을 import하지 않는 독립 모듈(kneeLogic.ts와 동일 패턴,
  shoulderLogic.ts와는 다름 -- CLOSED Tablet doc이 명시적으로 공유
  population 없음을 선언했기 때문).
- `ElbowState`에 `ELBOW_00`이 전혀 들어가지 않는다(F1류 invariant,
  라우터는 tagging 전용). `core_safety_already_urgent: boolean`
  필드로 Core `general_red`를 주입받는다(순환 import 방지, coreSpec.ts가
  값을 계산해 넘겨줌).
- 검증(fail-closed) 순서는 항상 "concrete positive 먼저 → UNKNOWN →
  NONE-singleton-equality → 그 외 malformed"다(`elbow02Status` 등).
  실제 진짜 양성 소견이 같은 배열 안의 모순된 NONE 때문에 취소되는
  일이 없도록 하는 순서다.

### 1.3 coreSpec.ts 통합 지점 (정확한 현재 라인)

```text
import 블록                   line 18-27  (toXState/computeXFlags 쌍)
CORE_QUESTIONS 배열 조립       line 3216-3242
STAFF_CHECK_TRIGGERS           line 3294-3375 (ELBOW 5개: line 3370-3374)
buildRoutingPayload            line 3450-3498 (primary_module_detail: line 3482-3492)
buildResponsePayload
  safety_flags.elbow           line 3667
  modules.elbow                line 3776-3795
```

`STAFF_CHECK_TRIGGERS`는 URGENT를 만들 수 있는 screen_id만 등록하고,
매번 `computeXFlags(toXState(...)).x_safety_status === 'URGENT_REVIEW'`
전체를 재계산한다 -- 개별 조건을 손으로 재구현하지 않아 엔진과의
drift가 구조적으로 불가능하다(NECK_02/SH02/KNEE_02/ELBOW_02와 동일
원칙, 이 계획도 그대로 따른다).

### 1.4 DoctorView.tsx 통합 지점

```text
ELBOW_SAFETY_STATUS_LABEL / ELBOW_EXAM_LABELS   line 1016-1039
suggestedElbowExamCodes                          line 1048-1088
ElbowSafetyPanel                                 line 1104-1151
<ElbowSafetyPanel payload={payload} /> 렌더 호출  line 1954
primaryModuleFields 'Pain' case,
  ELBOW raw block (m.pain.primary_location==='arm_hand' 게이트)  line 1401-1420
```

**중요 확인**: `primaryModuleFields`의 ELBOW 블록은
`primaryModuleDetail === 'ELBOW'`가 아니라 `m.pain.primary_location
=== 'arm_hand'`로 게이트된다(line 1401, 주석 1391-1400). 이는
WRIST_HAND-only 환자가 `primary_module_detail === null`이면서도
raw field 자체는 안전하게 null로 렌더되도록 하기 위함이다.
`primary_module_detail`을 실제로 소비하는 곳은 딱 한 군데,
`showLbpExam={routing.primary_module_detail === 'LBP'}`(line 2285,
LBP 전용) 뿐이다 -- ELBOW/KNEE/NECK/SHOULDER 어디도 이 값으로
raw field 렌더링을 게이트하지 않는다. 즉 `primary_module_detail`은
안전 게이트가 아니라 순수 표시/Suggested-Exam-우선순위용 라벨이다
(coreSpec.ts line 1358-1361 주석에서 NS01에 대해 동일하게 확인됨).

### 1.5 fixtures.ts / package.json

- `src/doctor/fixtures.ts` line 369-400: ELBOW fixture 1개
  (`buildFixture('팔꿈치 통증 주호소 (ELBOW, 신속 의뢰 고려)', {...})`),
  배열의 마지막 항목.
- `package.json` line 23: `test:elbow` 스크립트, line 24:
  `test:all`에 `&& npm run test:elbow`로 연결. 정확한 esbuild 패턴:
  `esbuild src/spec/<module>Logic.ts --bundle --format=esm --outfile=tests/.<module>-logic-bundle.mjs --platform=neutral && esbuild src/spec/<module>Adapter.ts ... && node tests/<module>.spec.mjs`.
  다중 단어 모듈(예: `test:layout` → `layout-budget.spec.mjs`,
  `test:doctor`의 각 번들 파일 `.doctor-sectionorder-bundle.mjs`)은
  kebab-case 파일명을 쓰는 것이 기존 관례다.

### 1.6 테스트 파일 섹션 레터링

- `tests/integration.spec.mjs`: 마지막 레터 섹션은 line 2014의
  `// O. ELBOW_V1`(routing/staff-check/payload 검증, 36 assertions).
  다음은 `P. WRIST_HAND_V1`.
- `tests/doctor.spec.mjs`: 마지막 섹션은 line 313의
  `// 2g. ELBOW_V1`. 다음은 `2h. WRIST_HAND_V1`.

---

## 2. WRIST/HAND routing 설계

새 upper-limb router는 만들지 않는다. 기존 `IS_PRIMARY_ARM_HAND`와
`ELBOW_00`을 그대로 재사용한다.

```typescript
// coreSpec.ts, IS_PRIMARY_ELBOW_SAFETY 정의 바로 아래에 추가
export const IS_PRIMARY_WRIST_HAND_SAFETY = (r: Responses) =>
  IS_PRIMARY_ARM_HAND(r) &&
  ['FOREARM', 'WRIST_HAND', 'DIFFUSE_OR_MULTIPLE', 'UNKNOWN'].includes(r['ELBOW_00'] as string)
```

- `ELBOW`만 제외한다(Opus v0.1 W1 Option B, Final Verification CLOSED).
- `FOREARM`에서는 `IS_PRIMARY_ELBOW_SAFETY`와 `IS_PRIMARY_WRIST_HAND_SAFETY`가
  **동시에 true**다 -- 의도된 overlap이며 버그가 아니다. 두 게이트는
  서로 완전히 독립적인 boolean이고 서로를 참조하지 않는다.
- `ELBOW_00` 자체는 여전히 `ARM_HAND_ROUTING_QUESTIONS`(수정 없음)의
  일부이며, `WristHandState`에는 절대 들어가지 않는다(ELBOW_00과
  동일한 F1류 invariant를 WRIST_HAND_V1에도 그대로 적용).
- `WH_01`-`WH_08A`(protected)와 `WH_09`-`WH_14`(optional)는 새 배열
  `WRIST_HAND_QUESTIONS`에 정의하고, 전부 `IS_PRIMARY_WRIST_HAND_SAFETY`
  (필요 시 추가 조건)로 게이트한다. `ARM_HAND_ROUTING_QUESTIONS`는
  건드리지 않는다 -- `ELBOW_00`의 순환 회피 구조는 이미 ELBOW_V1이
  풀어놓았고 WRIST_HAND_V1은 그 결과물을 그대로 소비하기만 한다
  (WRIST_HAND_QUESTIONS 자신의 게이트가 ELBOW_00 값을 필요로 하지만,
  ELBOW_00 자체는 이미 별도 배열에 있으므로 새로운 순환이 생기지
  않는다).

---

## 3. Module 구조

### 3.1 파일명

```text
src/spec/wristHandLogic.ts
src/spec/wristHandAdapter.ts
tests/wrist-hand.spec.mjs
```

`elbowLogic.ts`/`elbowAdapter.ts`가 camelCase 파일명 관례를 그대로
따른다(`lbpLogic.ts`, `kneeAdapter.ts` 등 전부 camelCase, 예외 없음)
-- `wristHandLogic.ts`/`wristHandAdapter.ts`가 정확히 그 관례를
따르는 이름이다. 파일명만 보고 추측한 것이 아니라 기존 5개 모듈
전부가 이 패턴이라는 것을 직접 확인했다.

테스트 파일은 다중 단어 모듈의 기존 kebab-case 관례
(`layout-budget.spec.mjs`, `patient-flow.spec.mjs`, `emrSummary`
계열은 예외지만 그쪽은 단일 합성어 취급)를 따라 `wrist-hand.spec.mjs`로
한다. `package.json`의 bundle 산출물 파일명도 동일하게
`.wrist-hand-logic-bundle.mjs`/`.wrist-hand-adapter-bundle.mjs`.

### 3.2 독립 모듈 원칙

`kneeLogic.ts`/`elbowLogic.ts`와 동일하게 `wristHandLogic.ts`는 다른
모듈의 logic/adapter를 import하지 않는다. Tablet v0.1 §3이 NECK_QUESTIONS
재사용을 명시적으로 금지했고(W9), ELBOW와 공유 population도 없다
(팔꿈치 안전과 손목/손 안전은 서로 다른 protected 질문 집합).

### 3.3 clinician-entered objective field

ELBOW_V1과 동일하게, 이번 iteration은 JudgmentPanel에 새 필드를
추가하지 않는다(Tablet doc에 clinician-entered objective 필드 요구
없음). `toWristHandStateFromDoctorPayload`는 `toElbowStateFromDoctorPayload`와
동일하게 clinician objective 인자가 없는 순수 조회 함수다.

---

## 4. Question integration

### 4.1 Protected (필수, safety-critical)

| Tablet ID | coreSpec id (제안) | input | showIf | exclusive |
|---|---|---|---|---|
| WH_01 | `WH_01` | single_choice | `IS_PRIMARY_WRIST_HAND_SAFETY` | - |
| WH_02 | `WH_02` | multi_choice | `IS_PRIMARY_WRIST_HAND_SAFETY` | `['NONE','UNKNOWN']` |
| WH_03 | `WH_03` | single_choice | `IS_PRIMARY_WRIST_HAND_SAFETY(r) && IS_WH_01_SHOWN(r)` | - |
| WH_04 | `WH_04` | single_choice | `IS_PRIMARY_WRIST_HAND_SAFETY(r) && IS_WH_01_SHOWN(r)` | - |
| WH_05 | `WH_05` | single_choice | `IS_PRIMARY_WRIST_HAND_SAFETY(r) && IS_WH_01_SHOWN(r)` | - |
| WH_06 | `WH_06` | multi_choice | `IS_PRIMARY_WRIST_HAND_SAFETY` | `['NONE','UNKNOWN']` |
| WH_06A | `WH_06A` | single_choice | `IS_PRIMARY_WRIST_HAND_SAFETY(r) && IS_WH_06_WOUND_SHOWN(r)` | - |
| WH_07 | `WH_07` | single_choice | `IS_PRIMARY_WRIST_HAND_SAFETY` | - |
| WH_07A | `WH_07A` | multi_choice | `IS_PRIMARY_WRIST_HAND_SAFETY(r) && IS_WH_07A_SHOWN(r)` | `['NONE','UNKNOWN']` |
| WH_08 | `WH_08` | single_choice | `IS_PRIMARY_WRIST_HAND_SAFETY` | - |
| WH_08A | `WH_08A` | multi_choice | `IS_PRIMARY_WRIST_HAND_SAFETY(r) && IS_WH_08_SHOWN(r)` | `['NONE','UNKNOWN']` |

전부 `required: true`, `step: '상세 증상'`.

### 4.2 Optional/context

| Tablet ID | required | showIf |
|---|---|---|
| WH_04A | false | `IS_PRIMARY_WRIST_HAND_SAFETY(r) && IS_WH_01_SHOWN(r)` |
| WH_09 | false | `IS_PRIMARY_WRIST_HAND_SAFETY` |
| WH_10 | false | `IS_PRIMARY_WRIST_HAND_SAFETY` |
| WH_11 | false | `IS_PRIMARY_WRIST_HAND_SAFETY` |
| WH_12 | false | `IS_PRIMARY_WRIST_HAND_SAFETY` |
| WH_13 | false | `IS_PRIMARY_WRIST_HAND_SAFETY` |
| WH_14 | false | `IS_PRIMARY_WRIST_HAND_SAFETY` |

### 4.3 Conditional follow-up 헬퍼 (신규)

`IS_ELBOW_01_SHOWN`/`IS_ELBOW_09_SHOWN`(coreSpec.ts line 1887-1888)과
동일한 위치·형태로, `WRIST_HAND_QUESTIONS` 배열 정의 바로 앞에 둔다:

```typescript
const IS_WH_01_SHOWN = (r: Responses) => r['WH_01'] === 'YES' || r['WH_01'] === 'UNKNOWN'

const IS_WH_06_WOUND_SHOWN = (r: Responses) => {
  const v = r['WH_06']
  return Array.isArray(v) && (v.includes('CUT_OR_PENETRATING_WOUND') || v.includes('HUMAN_OR_ANIMAL_BITE') || v.includes('UNKNOWN'))
}

// WH_07A show_when (Tablet §3): WH_06 wound/bite/UNKNOWN 경로 OR WH_07 in [FINGER_LOCALIZED_SWOLLEN_PAINFUL, UNKNOWN]
const IS_WH_07A_SHOWN = (r: Responses) =>
  IS_WH_06_WOUND_SHOWN(r) || r['WH_07'] === 'FINGER_LOCALIZED_SWOLLEN_PAINFUL' || r['WH_07'] === 'UNKNOWN'

// WH_08A show_when (Tablet §3): "WH_08 != NONE". WH_08이 아직 미응답(undefined)이면
// 이 후속 질문을 조기 노출하지 않는다 -- IS_ELBOW_09_SHOWN이 명시적 허용값
// 목록을 쓰는 것과 동일한 이유(스텝형 UI에서 부모 질문 답 전에 후속 질문이
// 먼저 뜨는 것을 막는다). "!= NONE"의 실질적 번역은 "concrete 값 또는
// UNKNOWN으로 이미 답했음"이다.
const IS_WH_08_SHOWN = (r: Responses) =>
  r['WH_08'] === 'MEDIAN_DISTRIBUTION' ||
  r['WH_08'] === 'ULNAR_DISTRIBUTION' ||
  r['WH_08'] === 'MULTIPLE_OR_BOTH' ||
  r['WH_08'] === 'UNKNOWN'
```

**Sonnet에게 전달할 literal invariant**: `IS_WH_08_SHOWN`의 "!= NONE"
→ "명시적 허용값 목록" 번역은 임상 threshold 변경이 아니라 스텝형
UI에 대한 순수 구현 디테일이다 -- Tablet 문서의 "WH_08 != NONE"가
의도하는 것은 "환자가 감각이상 패턴에 대해 뭔가 답했고 그게 NONE이
아니면"이지, "WH_08이 아직 미응답이어도 WH_08A를 띄워라"가 아니다.
이는 ELBOW_09/09A에서 이미 동일하게 해석된 선례를 그대로 따르는
것이며 새 임상 결정이 아니다.

### 4.4 Malformed/empty handling

Question 정의 자체(`exclusive`, `required`)는 malformed/empty를 막지
않는다 -- fail-closed 판정은 전부 `wristHandLogic.ts`의 로직 레이어
책임이다(ELBOW/KNEE와 동일 원칙: coreSpec.ts는 "무엇을 보여줄지"만
결정하고, "무엇이 안전한 답인지"는 절대 결정하지 않는다). `exclusive:
['NONE','UNKNOWN']`은 UI가 NONE/UNKNOWN을 다른 값과 동시 선택하지
못하게 막아주지만, 로직 레이어는 그래도 malformed 조합(빈 배열,
정의되지 않은 값 등)을 독립적으로 다시 검증한다 -- UI 제약을 신뢰하지
않는다(elbowLogic.ts의 `elbow02Status` 등과 동일).

---

## 5. Safety engine 설계 (wristHandLogic.ts)

```typescript
export type WristHandSafetyStatus = 'CLEAR' | 'REVIEW_REQUIRED' | 'URGENT_REVIEW'

const WH02_URGENT = new Set([
  'GROSS_DEFORMITY_OR_STILL_OUT',
  'COLD_PALE_BLUE_DIGITS',
  'MAJOR_NEW_DISTAL_NEURO_CHANGE',
  'UNCONTROLLED_HEAVY_BLEEDING',
  'SEVERE_OPEN_WOUND_WITH_DEEP_EXPOSURE',
])

const WH07A_URGENT = new Set([
  'SEVERE_PAIN_WHEN_STRAIGHTENING',
  'TENDS_TO_STAY_FLEXED',
  'DIFFUSE_FUSIFORM_SWELLING',
])

const WH08A_CONCRETE = new Set([
  'NEW_OR_WORSENING_GRIP_PINCH_WEAKNESS',
  'DROPPING_OBJECTS',
  'VISIBLE_THENAR_OR_INTRINSIC_WASTING',
])
```

`wh02Status`는 elbowLogic.ts의 `elbow02Status`와 동일한 순서
(concrete-urgent-set → UNKNOWN → NONE-singleton → malformed)를
그대로 포팅한다. `WH_07A`는 `elbow09Contribution`이 아니라
새로운 독립 함수 `wh07aStatus`로 구현하고, **`WH_07` 값과 무관하게**
독립적으로 URGENT를 만들 수 있어야 한다 -- `WH_07`이 `NONE`이어도
`WH_06` wound/bite 경로로 `WH_07A`가 노출되고 concrete positive가
있으면 URGENT다(Tablet §5.1 항목 3/4는 서로 다른 OR 절이지 AND가
아니다).

`wh08aContribution`(median/ulnar 공용, ELBOW의 `elbow09Contribution`과
동일 형태)이 stable-sensory-only carve-out(WH_08 concrete + WH_08A
exact `[NONE]`)과 fail-closed escalation(그 외 전부)을 한 곳에서
계산하고, `neuro_assessment_required`/`expedited_referral_consider`가
이 함수의 결과를 공유한다 -- ELBOW의 v0.1.1 fix(§6 참고)가 만든
구조를 처음부터 그대로 적용해, 두 flag가 다시 갈라지는 것을
타입 레벨에서 막는다.

```typescript
export interface WristHandState {
  wrist_hand_recent_trauma?: YesNoUnknown // WH_01
  wrist_hand_deformity_neurovascular_open_injury_screen?: string[] // WH_02
  wrist_hand_post_trauma_major_function_loss?: YesNoUnknown // WH_03 (show_when WH_01 in [YES,UNKNOWN])
  wrist_hand_post_trauma_radial_thumb_base_pain?: YesNoUnknown // WH_04 (show_when WH_01 in [YES,UNKNOWN])
  wrist_hand_post_trauma_fixed_motion_block?: YesNoUnknown // WH_05 (show_when WH_01 in [YES,UNKNOWN])
  wrist_hand_wound_exposure?: string[] // WH_06
  wrist_hand_post_wound_active_motion_loss?: YesNoUnknown // WH_06A (show_when WH_06 wound/bite/UNKNOWN)
  wrist_hand_infection_broad_screen?: WristHandInfectionScreen // WH_07
  wrist_hand_flexor_sheath_followup?: string[] // WH_07A (conditional, §4.3 IS_WH_07A_SHOWN)
  wrist_hand_distal_sensory_pattern?: WristHandSensoryPattern // WH_08
  wrist_hand_motor_progression_screen?: string[] // WH_08A (show_when WH_08 != NONE)
  /** Core computeFlags(r).general_red -- URGENT_REVIEW rule 1. */
  core_safety_already_urgent: boolean
}
```

**주의**: `WH_04A`(X-ray context)는 이 state에 넣지 **않는다** --
§9 참고. Safety 계산에 절대 관여하지 않는 별도 context 필드다.

### 5.1 URGENT_REVIEW (§5.1 literal port)

```text
1. core_safety_already_urgent === true
2. WH_02 concrete positive (WH02_URGENT 중 하나)
3. WH_07 === 'SYSTEMIC_OR_RAPIDLY_SPREADING'
4. WH_07A shown && concrete positive (WH07A_URGENT 중 하나) -- WH_07 값과 무관
```

`WH_07` 상태 함수는 `SYSTEMIC_OR_RAPIDLY_SPREADING`을 **하나의 opaque
enum 값**으로 비교한다(`v === 'SYSTEMIC_OR_RAPIDLY_SPREADING'`). "systemic
illness"와 "rapidly spreading"을 별도 boolean으로 분리해 AND로
합치는 구현은 여기서 구조적으로 불가능해야 한다 -- ELBOW_08과 동일한
literal invariant(Opus v0.2가 검증한 원칙, 이 모듈에서도 문자 그대로
적용).

### 5.2 REVIEW_REQUIRED (§5.2 literal port)

```text
- WH_01 UNKNOWN/missing/malformed
- WH_02 UNKNOWN/missing/malformed/empty/invalid combination
- WH_03 shown + YES/UNKNOWN/missing/malformed
- WH_04 shown + YES/UNKNOWN/missing/malformed
- WH_05 shown + YES/UNKNOWN/missing/malformed
- WH_06 contains HUMAN_OR_ANIMAL_BITE (WH_07 값과 무관, 독립)
- WH_06 UNKNOWN/missing/malformed/empty/invalid combination
- WH_06A shown + YES/UNKNOWN/missing/malformed
- WH_07 in [LOCALIZED_STABLE, FINGER_LOCALIZED_SWOLLEN_PAINFUL]
- WH_07 UNKNOWN/missing/malformed
- WH_07A shown + UNKNOWN/missing/malformed/empty/invalid combination
- WH_08 UNKNOWN/missing/malformed
- WH_08 concrete sensory positive + WH_08A concrete positive/UNKNOWN/missing/malformed/empty
```

### 5.3 CLEAR

모든 protected safety가 명시적으로 negative일 때만. `WH_08 = MEDIAN_
DISTRIBUTION|ULNAR_DISTRIBUTION|MULTIPLE_OR_BOTH` + `WH_08A = [NONE]`인
stable-sensory-only 경로는 다른 red flag가 없으면 CLEAR를 막지
않는다(다른 escalation을 만들지 않을 뿐, 자체로 CLEAR를 강제하지도
않는다 -- 다른 protected 질문이 하나라도 fail-closed면 여전히
REVIEW/URGENT).

---

## 6. Stable sensory-only carve-out — ELBOW_09/09A 재사용 범위 audit

`elbowLogic.ts`의 `elbow09Contribution`(line 199-212)을 직접 읽고
비교했다. **함수 자체(코드)는 재사용하지 않는다** -- `wristHandLogic.ts`는
독립 모듈이어야 하고(§3.2), `ElbowState`/`WristHandState`는 서로
다른 필드 셋을 갖는다(ELBOW_09는 단일 `YES/NO/UNKNOWN`, WH_08은 4지선다
`MEDIAN_DISTRIBUTION/ULNAR_DISTRIBUTION/MULTIPLE_OR_BOTH/NONE/UNKNOWN`
+ 별도 `NONE` 값). import해서 재사용하면 §3.2를 어기고, 두 임상
도메인이 코드 레벨에서 결합된다(향후 ELBOW 단독 threshold 변경이
WRIST_HAND에 실수로 전파될 위험).

재사용하는 것은 **구조적 패턴**뿐이다:
- concrete-positive-set 우선 검사 → UNKNOWN → NONE-singleton-equality
  → malformed의 판정 순서.
- "결합 조건 함수 하나가 review/expedited/neuro를 동시에 리턴하고,
  두 flag가 이 함수를 공유한다"는 v0.1.1-lesson 구조.
- `classifyElbow09a`류 `MultiOutcome` 헬퍼 타입(`'CONCRETE' | 'NONE' |
  'UNKNOWN' | 'INVALID'`)은 이름을 그대로 재사용 가능(제네릭하고
  임상 무관) -- `wristHandLogic.ts`에 동일한 헬퍼를 독립적으로
  정의(또는 파일 로컬 복사)한다. 모듈 간 import는 하지 않는다.

---

## 7. Flags

```typescript
export interface WristHandComputedFields {
  wrist_hand_safety_status: WristHandSafetyStatus
  fracture_imaging_consider: boolean
  tendon_injury_assessment_required: boolean
  infection_assessment_required: boolean
  neuro_assessment_required: boolean
  expedited_referral_consider: boolean
}
```

```text
fracture_imaging_consider = (WH_03 === 'YES') || (WH_04 === 'YES')

tendon_injury_assessment_required = (WH_06A === 'YES')

infection_assessment_required =
  WH_06 contains 'HUMAN_OR_ANIMAL_BITE'
  || WH_07 in ['LOCALIZED_STABLE','FINGER_LOCALIZED_SWOLLEN_PAINFUL','SYSTEMIC_OR_RAPIDLY_SPREADING','UNKNOWN']
  || WH_07 missing/malformed
  || (WH_07A shown && (concrete positive || UNKNOWN || missing || malformed || empty))   // v0.1.1: /empty 포함, authoritative

neuro_assessment_required =
  (WH_08 concrete sensory-positive) && (WH_08A concrete positive/UNKNOWN/missing/malformed/empty)

expedited_referral_consider =
  (WH_06A === 'YES')
  || ((WH_08 concrete sensory-positive) && (WH_08A concrete positive/UNKNOWN/missing/malformed/empty))
```

`WH_05 === 'YES'`만으로는 어떤 flag도 만들지 않는다(blanket expedited
금지, Tablet §6 명시).

**v0.1.1 authoritative delta 구현 위치**: `infection_assessment_required`의
`WH_07A` 조건절 하나에서만 `/empty`를 포함한다. 이 계획 문서 자체가
그 최종 형태를 위 의사코드에 이미 반영했다 -- Sonnet은 이 의사코드를
그대로 옮기면 되고, v0.1(누락판)을 먼저 옮겼다가 나중에 고치는 2단계
작업을 하지 않는다.

---

## 8. Hypotheses

```text
MUST_EXCLUDE_FRACTURE_DISLOCATION_OR_NEUROVASCULAR_INJURY
MUST_EXCLUDE_OCCULT_SCAPHOID_OR_CARPAL_FRACTURE
MUST_EXCLUDE_FLEXOR_OR_EXTENSOR_TENDON_INJURY
MUST_EXCLUDE_DEEP_HAND_INFECTION_OR_PYOGENIC_FLEXOR_TENOSYNOVITIS

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

이번 iteration은 다른 모듈(LBP/NECK/SHOULDER/KNEE/ELBOW)과 동일하게
hypothesis를 **자동 산출 필드로 코드에 넣지 않는다** -- 이 목록은
Doctor View의 supportive/MUST_EXCLUDE 표시용 참조 상수로만 쓰고,
`WristHandComputedFields`는 safety status/flag만 계산한다(임의로
새 computed field를 만들지 않는다). 단일 provocative test(Finkelstein/
Tinel/Phalen)가 확진을 만들지 않는다는 원칙은 코드가 강제할 필요 없이
Tablet에 애초에 그런 질문이 없다는 사실 자체로 지켜진다.

---

## 9. X-ray context (WH_04A) — non-gating 보존 전략

`WH_04A`는 `WristHandState`(safety 계산 입력)에 넣지 않는다. 대신
`modules.wrist_hand` raw block(§11)에만 원시값으로 저장한다 --
즉 `wristHandLogic.ts`는 이 필드의 존재 자체를 모른다. 이렇게 하면
"non-gating"이 설계 원칙 수준이 아니라 **타입 레벨에서 물리적으로
불가능**해진다: `WristHandState`에 필드가 없으니 그 값을 참조하는
어떤 조건문도 애초에 쓸 수 없다. `DONE_TOLD_NORMAL`을 포함해 어떤
답도 REVIEW를 낮추거나 `fracture_imaging_consider`를 끌 수 없다는
Tablet §3 요구사항을, ELBOW_00의 F1류 invariant와 동일한 방식으로
구조적으로 보장한다.

Doctor View에서는 참고 정보로만 노출한다(§11).

---

## 10. Infection architecture — WH_07/WH_07A 구현 전략

혼동 방지를 위해 반드시 분리할 것:

1. **`WH_07A`의 노출 조건**(`IS_WH_07A_SHOWN`, §4.3) -- "이 질문을
   화면에 보여줄지"를 결정하는 coreSpec.ts의 `showIf`. `WH_06`
   wound/bite/UNKNOWN 경로 OR `WH_07`이 `FINGER_LOCALIZED_SWOLLEN_
   PAINFUL`/`UNKNOWN`일 때 노출.
2. **`WH_07A`의 독립 urgent trigger 여부**(`wh07aStatus`,
   `wristHandLogic.ts`) -- "이 질문이 보였고 답이 왔다면, 그 답
   자체가 URGENT를 만드는지"를 결정하는 순수 함수. `WH_07`이
   `NONE`이든 `LOCALIZED_STABLE`이든 상관없이, `WH_07A`가 shown이고
   concrete positive면 URGENT다.

이 둘은 서로 다른 레이어(1은 coreSpec.ts의 UI 노출 로직, 2는
wristHandLogic.ts의 안전 판정 로직)에 있고, 2번이 1번의 조건을
다시 검사하지 않는다(shown 여부는 adapter가 `undefined`로 이미
표현한다 -- `wh07aStatus(v, shown)`처럼 shown을 별도 인자로 받는
elbowLogic.ts의 `elbow11Status(v, shown)` 패턴을 그대로 따른다).
Kanavel sign 개수/점수 계산은 애초에 `WH07A_URGENT`가 "concrete
positive 하나라도 있으면"이지 "몇 개 있는지 세서 점수화"가 아니므로
구조적으로 불가능하다.

---

## 11. Doctor View 통합

`ElbowSafetyPanel`(DoctorView.tsx line 1104-1151)을 템플릿으로
`WristHandSafetyPanel`을 만든다.

```typescript
const WRIST_HAND_SAFETY_STATUS_LABEL: Record<WristHandComputedFields['wrist_hand_safety_status'], string> = {
  CLEAR: '안전',
  REVIEW_REQUIRED: '확인 필요',
  URGENT_REVIEW: '긴급 확인 필요',
}
```

노출 게이트는 `payload.responses.safety_flags.wrist_hand === null`
→ `return null`(ELBOW와 동일 원칙 -- WRIST_HAND-only가 아닌 환자,
즉 `IS_PRIMARY_WRIST_HAND_SAFETY`가 false인 환자에게는 렌더되지
않는다).

패널에 표시할 것:
- `wrist_hand_safety_status` (칩)
- 5개 flag 전부 (신속 의뢰/골절 영상/힘줄 손상/감염/신경학적 평가)
- MUST_EXCLUDE hypothesis 목록(§8) -- 정적 텍스트, patient response로
  자동 판정하지 않고 "안전 확인 필요 사유" 참고용으로만 나열
- supportive hypothesis는 phenotype 응답이 있을 때만(§9의 WH_09-14
  raw 값 기반) 힌트 텍스트로 노출 -- 확진 표시 아님
- `WH_04A`(X-ray context)는 별도의 muted 참고 줄로 표시하고,
  "이 답변은 안전 판정에 영향을 주지 않습니다"라는 고정 문구를
  함께 둔다(ELBOW/KNEE 패널에 없는 신규 UI 요소지만, Tablet §3
  요구사항을 화면에서도 명시적으로 지키기 위함)
- stable sensory-only pattern(WH_08 concrete + WH_08A=[NONE])은
  flag가 전부 false로 나타나는 것 자체로 이미 반영된다 -- 별도
  특수 UI 불필요
- URGENT/REVIEW interrupt는 KneeSafetyPanel/ElbowSafetyPanel과
  동일하게 패널 자체가 인터럽트하지 않는다(STAFF_CHECK_TRIGGERS가
  별도로 처리, §12)

환자 응답만으로 객관적 검사결과(예: "촉진 결과", "근력 등급")처럼
보이는 문구는 쓰지 않는다 -- ELBOW_EXAM_LABELS와 동일하게
`suggestedWristHandExamCodes`가 만드는 목록은 "권장 검사" 항목이지
검사 결과가 아니다.

`suggestedWristHandExamCodes(flags, wristHand)` 설계 (mechanical
mapping, non-clinical 세부는 구현 시점 확정 가능):

```text
CLEAR                         -> 기본 wrist/finger ROM, grip/pinch functional
deformity/NV concrete positive -> 변형·촉진, 원위부 신경혈관 검사
fracture_imaging_consider      -> 방사선 촬영 필요성 검토
WH_06A YES/UNKNOWN              -> 굴곡/신전건 기능 검사
infection_assessment_required  -> 상처/발적 확산 평가, flexor sheath 촉진
neuro_assessment_required       -> median/ulnar 감각분포, 무지대립근/수내재근 근력
```

`primaryModuleFields`의 `'Pain'` case에 ELBOW 블록(line 1401-1420)
바로 뒤에 동일한 `m.pain.primary_location === 'arm_hand'` 게이트로
WRIST_HAND raw block을 추가한다(§13 A/B 참고) -- `primaryModuleDetail`이
아니라 `arm_hand` 게이트를 쓰는 이유는 ELBOW와 동일: FOREARM 환자는
`primary_module_detail`이 `'ELBOW'`(§2 우선순위, 아래 참고)이지만
WRIST_HAND raw 필드도 실제로 응답되어 있으므로 반드시 함께 렌더돼야
한다.

**`primary_module_detail`의 FOREARM 처리**: `buildRoutingPayload`의
기존 체인(coreSpec.ts line 3482-3492)에 이렇게 확장한다:

```typescript
primary_module_detail: IS_PRIMARY_LBP(r)
  ? 'LBP'
  : IS_PRIMARY_NECK(r)
    ? (r['NS01'] === 'SHOULDER_DOMINANT' ? 'SHOULDER' : 'NECK')
    : IS_PRIMARY_KNEE(r)
      ? 'KNEE'
      : IS_PRIMARY_ARM_HAND(r)
        ? (IS_PRIMARY_ELBOW_SAFETY(r) ? 'ELBOW' : (IS_PRIMARY_WRIST_HAND_SAFETY(r) ? 'WRIST_HAND' : null))
        : null,
```

ELBOW가 WRIST_HAND보다 먼저 검사된다 -- `FOREARM`/`DIFFUSE_OR_MULTIPLE`/
`UNKNOWN`(둘 다 true인 경우)은 `'ELBOW'`로 라벨된다. 이는 임의
선택이 아니라 **하위 호환성 요구사항**이다: ELBOW_V1은 CLOSED/FROZEN이고
이미 이 세 값에 대해 `primary_module_detail === 'ELBOW'`로 동작하는
기존 fixture/테스트가 있다 -- 이 순서를 바꾸면 ELBOW_V1의 기존 동작이
바뀌어 CLOSED 결정을 재해석하는 셈이 된다. `WRIST_HAND`가 새로 얻는
라벨은 `ELBOW_00 === 'WRIST_HAND'`(이전까지 항상 `null`이었던
케이스)뿐이다 -- 기존 ELBOW fixture 어느 것도 이 변경으로 다른 값을
받지 않는다(순수 추가, zero regression). `primary_module_detail`이
안전 게이트가 아니라 표시/exam-우선순위 라벨이라는 것은 §1.4에서
이미 확인했으므로, `safety_flags.elbow`/`safety_flags.wrist_hand`는
이 순서와 무관하게 각자의 `IS_PRIMARY_*_SAFETY` 게이트로 독립
계산된다(FOREARM 환자는 둘 다 non-null).

---

## 12. Sigma / chart boundary

Tablet §10을 그대로 따른다 -- 새 코드 계약 불필요, 기존
`emrSummary.ts`/Sigma 매핑이 이미 "patient response → S/CC만,
O는 clinician-confirmed만"이라는 원칙으로 동작 중이다(ELBOW_V1 통합
때도 이 파일을 수정하지 않았다). WRIST_HAND_V1도 `emrSummary.ts`를
건드리지 않는 것을 기본으로 한다 -- 만약 실제 구현 중 이 파일이
모듈별 하드코딩된 매핑을 갖고 있다면(즉 KNEE/ELBOW 추가 때 이미
수정이 필요했다면) 동일한 최소 패턴을 따르되, 이는 Sonnet 구현
단계에서 `emrSummary.ts`를 직접 열어 확인할 사항이다(이 계획은
그 파일의 존재를 가정만 하고 내용을 audit하지 않았다).

---

## 13. Exercise/management boundary

이번 단계에서 exercise engine을 구현하지 않는다. `wristHandSafetyLocked
= (f) => f.wrist_hand_safety_status !== 'CLEAR'`만 export한다
(`elbowSafetyLocked`와 동일 형태) -- 실제 운동 추천 UI 자체가 아직
없으므로 이 값을 소비하는 곳은 없다(ELBOW_V1도 동일 -- lock 값만
계산해두고 소비자는 없음, TODO 주석으로 명시).

---

## 14. Regression boundary

`lbpLogic.ts`/`neckLogic.ts`/`shoulderLogic.ts`/`kneeLogic.ts`/
`elbowLogic.ts`와 대응 adapter, `src/doctor/judgment.ts`,
`src/doctor/JudgmentPanel.tsx` = zero diff 목표(ELBOW_V1 통합 때
확인한 10개 파일과 동일 목록).

허용되는 최소 변경:
- `src/spec/coreSpec.ts` (import, `IS_PRIMARY_WRIST_HAND_SAFETY`,
  `WRIST_HAND_QUESTIONS`, `CORE_QUESTIONS` splice, `STAFF_CHECK_TRIGGERS`
  추가, `primary_module_detail` 체인 확장, `safety_flags.wrist_hand`,
  `modules.wrist_hand`)
- `src/doctor/DoctorView.tsx` (import, 라벨 상수, `suggestedWristHandExamCodes`,
  `WristHandSafetyPanel`, 렌더 호출, `primaryModuleFields` WRIST_HAND
  블록)
- `src/doctor/fixtures.ts` (신규 fixture 추가, 기존 fixture 무수정)
- `tests/integration.spec.mjs` (I1 `STAFF_CHECK_TRIGGERS` 키 목록에
  WRIST_HAND 항목 추가 -- ELBOW 통합 때도 동일하게 발생했던, 예상된
  단일 실패/수정 지점, §17 위험지점 참고), 신규 `P. WRIST_HAND_V1` 섹션
- `tests/doctor.spec.mjs` (신규 `2h. WRIST_HAND_V1` 섹션)
- `package.json`, `.gitignore` (신규 스크립트/bundle 파일 2개)

---

## 15. Test plan

`tests/wrist-hand.spec.mjs` (엔진+어댑터 truth table, ELBOW의
Section A/B 패턴을 그대로 따른다):

```text
Routing (adapter 레벨에서는 직접 검증 불가 -- coreSpec 레벨 P섹션에서 검증):
- (P섹션에서 다룸, 아래 참고)

WH_02:
- 5개 concrete positive 각각 standalone URGENT (heavy bleeding/deep wound 포함)
- NONE singleton negative
- empty/malformed/UNKNOWN fail-closed REVIEW

Fracture:
- WH_03 YES -> REVIEW + fracture flag
- WH_04 YES -> REVIEW + fracture flag
- (WH_04A는 wristHandLogic.ts에 필드 자체가 없으므로 로직 레벨 테스트 대상 아님 -- adapter/coreSpec 레벨에서 non-gating 확인)

Wound/tendon:
- WH_06 bite alone -> REVIEW + infection flag (WH_07 NONE이어도 성립)
- WH_06 cut alone -> 자동 expedited/urgent 아님
- WH_06A YES -> REVIEW + tendon + expedited

Infection:
- WH_07 SYSTEMIC_OR_RAPIDLY_SPREADING -> URGENT (OR semantics: systemic 단독/spreading 단독 각각도 이 하나의 enum으로 커버됨을 주석으로 명시)
- WH_07A concrete positive alone -> URGENT (WH_07 값 무관, WH_07=NONE에서도 성립 확인)
- WH_07A shown + empty -> REVIEW + infection flag (v0.1.1 authoritative, 반드시 포함)
- WH_07 LOCALIZED_STABLE -> REVIEW + infection flag
- WH_07 FINGER_LOCALIZED_SWOLLEN_PAINFUL -> REVIEW + infection flag

Neuro:
- WH_08 MEDIAN_DISTRIBUTION + WH_08A [NONE] -> no REVIEW from this path (CLEAR 가능)
- WH_08 ULNAR_DISTRIBUTION + WH_08A [NONE] -> no REVIEW from this path
- WH_08 sensory + WH_08A concrete positive -> REVIEW + neuro + expedited
- WH_08 sensory + WH_08A UNKNOWN/missing/malformed/empty -> REVIEW + neuro + expedited (전부 개별 케이스)

Mechanical:
- WH_11(phenotype, optional) YES -> phenotype only, wristHandLogic.ts 계산 대상 아님(optional 필드는 state에 없음)
- WH_05 YES -> REVIEW, no blanket expedited

Other:
- optional phenotype(WH_09/10/11/12/13/14) 필드 자체가 WristHandState에 없음을 타입/구조로 확인(B섹션)
- Core global urgent passthrough: core_safety_already_urgent=true 단독으로 URGENT(다른 필드 전부 negative여도)
- 어댑터: ELBOW_00/arm_hand_region_discriminator가 WristHandState 어디에도 없음(B6류 테스트)
- 어댑터: WH_04A가 WristHandState에 없음(구조적 non-gating 증명)
```

`tests/integration.spec.mjs`의 새 `P. WRIST_HAND_V1` 섹션(ELBOW의
`O. ELBOW_V1` 36-assertion 섹션과 동일 구조로):

```text
Routing:
- PAIN_01 != arm_hand -> WRIST_HAND 질문 전부 안 보임, safety_flags.wrist_hand null
- ELBOW_00 = ELBOW -> WRIST_HAND protected 질문 전부 안 보임 (ELBOW만 봄)
- ELBOW_00 = WRIST_HAND -> WRIST_HAND protected 질문 노출, ELBOW 질문 안 보임
- ELBOW_00 = FOREARM -> ELBOW + WRIST_HAND protected 질문 **둘 다** 노출 (CRITICAL, overlap 검증)
- ELBOW_00 = DIFFUSE_OR_MULTIPLE -> 노출
- ELBOW_00 = UNKNOWN -> 노출
- ELBOW_00 값 자체가 wrist_hand_safety_status를 바꾸지 않음(WristHandState에 ELBOW_00 필드 자체가 없으므로 구조적으로 불가능 -- 이를 직접 확인하는 assertion)

Question visibility:
- WH_03/04/04A/05가 WH_01 in [YES,UNKNOWN]에서만 노출
- WH_06A가 WH_06 wound/bite/UNKNOWN에서만 노출
- WH_07A가 WH_06 wound/bite/UNKNOWN OR WH_07 in [FINGER_LOCALIZED_SWOLLEN_PAINFUL,UNKNOWN]에서만 노출 (양쪽 경로 각각 테스트)
- WH_08A가 WH_08 != NONE(concrete/UNKNOWN)에서만 노출, WH_08 미응답 시 노출 안 됨
- required:true(WH_01/02/06/07/08 등)/required:false(WH_04A/09-14) 확인
- stale prune: PAIN_01 전환 시 WH_* 전부 정리, ELBOW_00 WRIST_HAND->ELBOW 전환 시 WH_* 정리(O-C10류)

Staff interrupt (STAFF_CHECK_TRIGGERS):
- WH_02(신규 등록) URGENT 케이스 -> interrupt
- WH_07(신규 등록) SYSTEMIC_OR_RAPIDLY_SPREADING -> interrupt
- WH_07A(신규 등록) concrete positive -> interrupt (WH_07=NONE에서도)
- negative control(REVIEW만 되는 값들) -> interrupt 안 됨
- fully-clean baseline -> 전부 false

Payload:
- FOREARM 환자: safety_flags.elbow와 safety_flags.wrist_hand 둘 다 non-null (CRITICAL)
- WRIST_HAND-only 환자: safety_flags.elbow는 null, safety_flags.wrist_hand는 non-null,
  primary_module_detail은 'WRIST_HAND' (ELBOW 아님) (CRITICAL)
- ELBOW-only 환자: safety_flags.wrist_hand는 null, 기존 ELBOW 동작 완전히 동일 (regression, CRITICAL)
- 기존 KNEE/NECK/SHOULDER/LBP 라우팅이 이 추가로 영향받지 않음(기존 kneeBaseResponses류 헬퍼 재사용)
```

`tests/doctor.spec.mjs`의 새 `2h. WRIST_HAND_V1` 섹션(ELBOW의 `2g`
19-assertion 섹션과 동일 구조): WristHandSafetyPanel 렌더 확인,
5개 flag 칩, stable-sensory-only 케이스에서 neuro/expedited가
false로 렌더(E5-류 CRITICAL assertion), WH_04A 참고 문구가 있고
"안전 판정에 영향 없음" 문구도 함께 렌더되는지, FOREARM fixture로
ElbowSafetyPanel과 WristHandSafetyPanel이 **둘 다** 렌더되는지(신규,
ELBOW/KNEE에는 없던 케이스).

---

## 16. package.json wiring

현재 실제 패턴(§1.5)을 그대로 따른다.

```json
"test:wrist-hand": "esbuild src/spec/wristHandLogic.ts --bundle --format=esm --outfile=tests/.wrist-hand-logic-bundle.mjs --platform=neutral && esbuild src/spec/wristHandAdapter.ts --bundle --format=esm --outfile=tests/.wrist-hand-adapter-bundle.mjs --platform=neutral && node tests/wrist-hand.spec.mjs"
```

`test:all`의 마지막 `&& npm run test:elbow` 뒤에 `&& npm run
test:wrist-hand`를 추가한다. `.gitignore`에
`tests/.wrist-hand-logic-bundle.mjs`, `tests/.wrist-hand-adapter-bundle.mjs`
2줄 추가(기존 elbow 2줄과 동일 형태).

---

## 17. Sonnet 구현 순서 (literal, 10 step)

1. `src/spec/wristHandLogic.ts` 작성 -- §5/§6/§7을 Tablet v0.1 + v0.1.1
   원문과 다시 대조하며 literal port. 특히 `WH_07A` 독립 URGENT와
   `/empty` delta를 빠뜨리지 말 것.
2. `src/spec/wristHandAdapter.ts` 작성 -- `toWristHandState`/
   `toWristHandStateFromDoctorPayload`. `ELBOW_00`/`WH_04A` 절대
   읽지 않음.
3. `tests/wrist-hand.spec.mjs` 작성, `package.json`에 `test:wrist-hand`
   추가(§16), `.gitignore` 2줄 추가.
4. `npm run test:wrist-hand` 실행, 전부 통과할 때까지 1-2를 고침
   (이 시점까지는 coreSpec.ts를 전혀 건드리지 않는다).
5. `src/spec/coreSpec.ts` 통합: import, `IS_PRIMARY_WRIST_HAND_SAFETY`
   (§2), `WRIST_HAND_QUESTIONS` + 4개 조건 헬퍼(§4.3), `CORE_QUESTIONS`
   splice(`ELBOW_QUESTIONS` 바로 뒤), `STAFF_CHECK_TRIGGERS` 3개 등록
   (WH_02/WH_07/WH_07A), `primary_module_detail` 체인 확장(§11),
   `safety_flags.wrist_hand`/`modules.wrist_hand`(§11/§5 state 매핑).
6. `npx tsc -b --force` 클린 확인.
7. `tests/integration.spec.mjs`: I1 키 목록 수정(예상된 단일 실패),
   `P. WRIST_HAND_V1` 섹션 작성(§15). `npm run test:integration`
   전부 통과할 때까지 반복.
8. `src/doctor/DoctorView.tsx` 통합: import, 라벨 상수,
   `suggestedWristHandExamCodes`, `WristHandSafetyPanel`, 렌더 호출,
   `primaryModuleFields` WRIST_HAND 블록(§11). `src/doctor/fixtures.ts`에
   최소 2개 fixture 추가(WRIST_HAND-only 1개 + FOREARM-overlap 1개,
   overlap 케이스는 ELBOW_V1에 없던 신규 시나리오이므로 반드시
   포함). `tests/doctor.spec.mjs`에 `2h. WRIST_HAND_V1` 섹션(§15).
9. `npx tsc -b --force` 재확인, `npm run test:doctor` 전부 통과할
   때까지 반복. `npm run build` 성공 확인.
10. 전체 회귀: `npm run test:lbp`/`test:neck`/`test:shoulder`/
    `test:knee`/`test:elbow` 개별 실행(카운트 불변 확인),
    `git diff --stat`로 §14의 zero-diff 목록 재확인, `npm run test:all`
    전체 실행 후 실제 assertion 총계를 기록.

---

## A. 신규 파일

```text
src/spec/wristHandLogic.ts
src/spec/wristHandAdapter.ts
tests/wrist-hand.spec.mjs
```

## B. 수정 예정 파일

```text
src/spec/coreSpec.ts
src/doctor/DoctorView.tsx
src/doctor/fixtures.ts
tests/integration.spec.mjs
tests/doctor.spec.mjs
package.json
.gitignore
```

## C. 변경 금지 / zero-diff 목표 파일

```text
src/spec/lbpLogic.ts
src/spec/lbpAdapter.ts
src/spec/neckLogic.ts
src/spec/neckAdapter.ts
src/spec/shoulderLogic.ts
src/spec/shoulderAdapter.ts
src/spec/kneeLogic.ts
src/spec/kneeAdapter.ts
src/spec/elbowLogic.ts
src/spec/elbowAdapter.ts
src/doctor/judgment.ts
src/doctor/JudgmentPanel.tsx
```

## D. 구현 순서

§17 참고 (10 step).

## E. Sonnet에게 전달할 literal invariants

1. `IS_PRIMARY_WRIST_HAND_SAFETY = IS_PRIMARY_ARM_HAND(r) && ['FOREARM','WRIST_HAND','DIFFUSE_OR_MULTIPLE','UNKNOWN'].includes(r['ELBOW_00'])` -- `ELBOW`만 제외.
2. `ELBOW_00`은 `WristHandState`에 절대 들어가지 않는다(F1류, ELBOW_00과 동일).
3. `WH_04A`는 `WristHandState`에 절대 들어가지 않는다(§9, non-gating을 타입 레벨로 보장).
4. `WH_02`의 `UNCONTROLLED_HEAVY_BLEEDING`/`SEVERE_OPEN_WOUND_WITH_DEEP_EXPOSURE`는 다른 concrete 옵션과 동일한 단일 Set에서 OR로 검사 -- AND 없음.
5. `WH_07`의 `SYSTEMIC_OR_RAPIDLY_SPREADING`은 단일 enum 값 비교 -- 절대 두 boolean으로 분해해 AND로 합치지 않는다.
6. `WH_07A`는 `WH_07` 값과 무관한 독립 URGENT 소스다 -- `wh07aStatus` 함수가 `WH_07`을 인자로 받지 않는다.
7. `WH_07A`의 `infection_assessment_required` 조건은 `concrete positive/UNKNOWN/missing/malformed/empty`(`/empty` 포함, v0.1.1 authoritative) -- v0.1의 `/empty` 누락판을 먼저 옮기지 않는다.
8. `WH_06` 단독 `HUMAN_OR_ANIMAL_BITE`는 `WH_07`(감염 징후) 값과 무관하게 독립적으로 REVIEW + infection flag.
9. `WH_08`(stable sensory-only) + `WH_08A` exact `[NONE]`은 이 경로만으로 REVIEW를 만들지 않는다 -- 그 외 모든 조합(concrete/UNKNOWN/missing/malformed/empty)은 REVIEW + neuro + expedited로 fail-closed.
10. `neuro_assessment_required`와 `expedited_referral_consider`는 WH_08/WH_08A 부분에서 동일한 하나의 결합 함수를 공유한다(다시 갈라지지 않도록).
11. `WH_05 === 'YES'`만으로는 어떤 flag도 true로 만들지 않는다(blanket expedited 금지).
12. Kanavel sign 개수/점수 계산 코드를 작성하지 않는다.
13. `primary_module_detail` 체인에서 `IS_PRIMARY_ELBOW_SAFETY`를 `IS_PRIMARY_WRIST_HAND_SAFETY`보다 먼저 검사한다(ELBOW_V1 하위 호환, §11).
14. `wristHandLogic.ts`/`wristHandAdapter.ts`는 다른 모듈의 logic/adapter를 import하지 않는다.
15. LBP/NECK/SHOULDER/KNEE/ELBOW의 기존 파일 10개(§C)는 이 통합 과정에서 단 한 줄도 바뀌면 안 된다.

## F. 테스트 명령 계획

```text
npm run test:wrist-hand   (신규)
npm run test:integration  (I1 키 목록 수정 + P섹션 추가)
npm run test:doctor       (2h섹션 추가)
npm run test:lbp / test:neck / test:shoulder / test:knee / test:elbow  (회귀, 카운트 불변 확인)
npm run build             (tsc -b && vite build)
npm run test:all          (최종 전체, 실제 assertion 총계 기록)
```

## G. 예상 위험지점 / 회귀 포인트

1. **FOREARM overlap이 처음 등장하는 시나리오**다 -- 지금까지 모든
   모듈(LBP/NECK/SHOULDER/KNEE/ELBOW)은 `primary_location`이 서로
   배타적이거나(low_back_pelvis/neck_shoulder/knee) 단일 population
   내부 하위 태그(NS01)였다. `safety_flags.elbow`와
   `safety_flags.wrist_hand`가 **동시에 non-null**인 첫 케이스이므로,
   Doctor View가 두 패널을 동시에 렌더할 때 레이아웃/중복 경고
   문제가 없는지 실제로 확인해야 한다(§15 doctor.spec.mjs 신규
   assertion으로 커버하되, 실제 화면에서도 눈으로 한 번 확인 권장).
2. **I1 STAFF_CHECK_TRIGGERS 키 목록 실패는 예상된 것**이다 --
   ELBOW/KNEE/SHOULDER/NECK 통합 때마다 동일하게 발생했고 각각 그
   자리에서 즉시 수정됐다. 놀랄 일이 아니다.
3. **`WH_08A`의 "!= NONE" show_when 번역**(§4.3)은 문서 원문을
   그대로 code로 옮기면 미응답 상태에서 후속질문이 조기 노출될 수
   있는 유일한 지점이다 -- `IS_ELBOW_09_SHOWN` 선례를 반드시 따를 것.
4. **`primary_module_detail`의 ELBOW-우선순위**(§11)를 반대로
   구현하면(WRIST_HAND를 먼저 검사) ELBOW_V1의 FOREARM/DIFFUSE/UNKNOWN
   케이스가 조용히 `'WRIST_HAND'`로 바뀌어 CLOSED/FROZEN 결정을
   재해석하는 회귀가 된다 -- 순서를 반드시 지킬 것.
5. **`emrSummary.ts` 등 이 audit이 못 본 파일**에 모듈별 하드코딩된
   목록이 있을 가능성(§12) -- Sonnet 구현 중 `grep -rn "'ELBOW'"
   src/`로 한 번 더 확인 권장.
6. 새 optional phenotype 필드(WH_09-14)가 실수로 `WristHandState`에
   들어가면(§5/§13 CLEAR 판정에 영향 없어야 함) safety 계산에
   섞여드는 것을 막기 위해, 타입 정의 단계에서부터 이 필드들은
   아예 `WristHandState`에 선언하지 않는다(포함 여부 자체를 컴파일
   타임에 차단).

---

```text
FABLE INTEGRATION PLAN COMPLETE
SONNET IMPLEMENTATION READY
```
