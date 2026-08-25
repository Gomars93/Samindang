# KNEE_V1 — Fable Repo Integration Plan v0.1

작성일: 2026-08-25  
상태: **IMPLEMENTATION PLAN COMPLETE / CLINICAL DECISIONS CLOSED / CODE NOT YET IMPLEMENTED**  
브랜치: `clinical/knee-v1-integration`  
상위 브랜치: `clinical/knee-v1-review`

## 0. Source of Truth

임상결정은 아래 문서에서 이미 CLOSED 상태다.

- `docs/KNEE_V1_Evidence_Matrix_v0.1_HANDOFF.md`
- `docs/KNEE_V1_Opus_Clinical_Review_v0.1.md`
- `docs/KNEE_V1_Tablet_Question_Set_v0.1.md`
- `docs/KNEE_V1_Opus_Clinical_Review_v0.2.md`
- `docs/KNEE_V1_Tablet_Question_Set_v0.1.1_Amendment_CLOSED_CANDIDATE.md`
- `docs/KNEE_V1_Opus_Final_Verification_v1.0_CLOSED.md`

최종 임상 판정:

```text
PASS / CLINICAL DECISIONS CLOSED
```

이 문서는 임상결정을 새로 만들지 않는다. 실제 repo의 기존 LBP/NECK/SHOULDER 구현 패턴을 감사한 뒤, CLOSED semantics를 어디에 어떻게 연결할지만 지정한다.

---

# 1. Actual Repo Audit

현재 repo의 MSK 구현 패턴은 다음과 같다.

## 1.1 질문/라우팅/직원 인터럽트 — `src/spec/coreSpec.ts`

실제 앱은 하나의 `coreSpec.ts`에서 질문을 조합한다. 현재 MSK 순서는 대략:

```text
PAIN_QUESTIONS
→ LBP_QUESTIONS
→ SHOULDER_QUESTIONS
→ NECK_QUESTIONS
```

각 모듈 질문은 `PAIN_01` 기반 `showIf`로 필요한 환자에게만 노출된다.

`STAFF_CHECK_TRIGGERS`는 이미 LBP/NECK/SHOULDER에서 동일한 구조를 쓴다:

- REVIEW_REQUIRED는 화면 흐름을 즉시 끊지 않는다.
- URGENT_REVIEW가 발생할 수 있는 screen만 등록한다.
- 개별 urgent 조건을 trigger 안에 재구현하지 않고 **해당 모듈의 전체 safety engine을 다시 호출하여 `URGENT_REVIEW`인지 확인**한다.

KNEE도 이 패턴을 그대로 따른다.

## 1.2 계산 계층 — `src/spec/*Logic.ts`

현재:

- `lbpLogic.ts`
- `neckLogic.ts`
- `shoulderLogic.ts`

각 파일은 raw Responses/UI와 분리된 임상 상태 객체를 받고, CLOSED clinical semantics를 순수 계산한다.

KNEE도 새 `kneeLogic.ts`를 만든다.

## 1.3 번역 계층 — `src/spec/*Adapter.ts`

현재 adapter는 앱의 `Responses` 및 `DoctorPayload.responses`를 logic layer의 상태 객체로 변환한다.

KNEE도 새 `kneeAdapter.ts`를 만든다. enum/string-array 변환 위험은 adapter에 모으고 logic은 UI 구조를 알지 않게 한다.

## 1.4 Submission payload

`buildResponsePayload()`는 현재:

```text
responses.safety_flags.lbp
responses.safety_flags.neck
responses.safety_flags.shoulder
responses.modules.lbp
responses.modules.neck
responses.modules.shoulder
```

을 만든다.

KNEE는 정확히 같은 위치에:

```text
responses.safety_flags.knee
responses.modules.knee
```

를 추가한다.

비-KNEE 환자에게 `computeKneeFlags()`를 돌리면 protected safety unanswered 때문에 fail-closed REVIEW가 생길 수 있으므로, 기존 모듈과 동일하게 **`IS_PRIMARY_KNEE`일 때만 계산하고 아니면 `null`**로 둔다.

## 1.5 Doctor View

현재 Doctor View는 LBP/NECK/SHOULDER마다 module safety panel을 별도로 렌더링한다.

KNEE도 동일하게 `KneeSafetyPanel`을 추가하되:

- 환자 답변을 객관적 진찰처럼 표시하지 않는다.
- 자동 확진을 하지 않는다.
- `knee_safety_status`, `expedited_referral_consider`, `fracture_imaging_consider`, `dvt_assessment_required`를 분리해서 표시한다.
- `dvt_assessment_required`는 Wells 자체가 아니라 **원장 평가 필요 신호**다.

## 1.6 Test harness

`package.json`은 현재 `test:lbp`, `test:neck`, `test:shoulder`를 별도 bundle/test로 돌리고 마지막에 `test:all`에서 모두 연결한다.

KNEE는 동일한 `test:knee` script를 추가하고 `test:all` 마지막에 연결한다.

---

# 2. Non-negotiable Integration Invariants

Sonnet 구현자는 아래를 변경할 수 없다.

1. `IS_PRIMARY_KNEE`는 `primary concern == pain && PAIN_01 == 'knee'`이다.
2. KNEE protected safety는 phenotype 답변 때문에 숨기지 않는다.
3. `KNEE_02A`는 외상 인지 여부와 무관하게 모든 knee-primary 환자에게 노출한다.
4. `KNEE_03`, `KNEE_04`는 show되면 `required: true`다.
5. `KNEE_06 YES + KNEE_06A [NONE]`만으로 REVIEW_REQUIRED를 만들지 않는다.
6. `KNEE_06B`에는 movement-independent/rest-only 같은 추가 AND gate를 절대 넣지 않는다.
7. KNEE_06B concrete PE-type positive는 URGENT_REVIEW다.
8. KNEE_07 septic pattern YES는 URGENT_REVIEW다.
9. KNEE_02A YES는 URGENT_REVIEW다.
10. KNEE_04 / KNEE_05 YES 또는 UNKNOWN은 `REVIEW_REQUIRED + expedited_referral_consider`; URGENT로 자동 승격하지 않는다.
11. KNEE_08의 hip/groin/unexplained weight-bearing option은 `REVIEW_REQUIRED + fracture_imaging_consider`이며 새 safety tier/flag를 만들지 않는다.
12. Wells score는 Tablet에서 계산하지 않는다.
13. UNKNOWN/missing/malformed를 NO/NONE으로 취급하지 않는다.
14. exercise/manual-treatment 제안은 `knee_safety_status !== CLEAR`이면 잠근다.
15. KNEE supportive phenotype을 임의 점수화하거나 확진 로직으로 확장하지 않는다.
16. LBP/NECK/SHOULDER CLOSED logic을 리팩터링 명목으로 변경하지 않는다.

---

# 3. New Files

## 3.1 `src/spec/kneeLogic.ts`

### Types

```ts
export type KneeSafetyStatus = 'CLEAR' | 'REVIEW_REQUIRED' | 'URGENT_REVIEW'

type YesNoUnknown = 'YES' | 'NO' | 'UNKNOWN'

export interface KneeState {
  knee_recent_trauma_or_sudden_load?: YesNoUnknown                 // KNEE_01
  knee_deformity_neurovascular_screen?: string[]                  // KNEE_02
  knee_spontaneously_reduced_dislocation_screen?: YesNoUnknown    // KNEE_02A
  knee_post_trauma_weight_bearing_failure?: YesNoUnknown          // KNEE_03
  knee_extensor_mechanism_concern?: YesNoUnknown                  // KNEE_04
  knee_true_locked_extension_block?: YesNoUnknown                 // KNEE_05
  knee_unilateral_leg_dvt_symptom_screen?: YesNoUnknown           // KNEE_06
  knee_dvt_risk_context?: string[]                                // KNEE_06A
  knee_dvt_pe_associated_screen?: string[]                        // KNEE_06B
  knee_septic_joint_emergency_screen?: YesNoUnknown               // KNEE_07
  knee_referred_non_knee_redflag_screen?: string[]                // KNEE_08
  core_safety_already_urgent: boolean
}

export interface KneeComputedFields {
  knee_safety_status: KneeSafetyStatus
  expedited_referral_consider: boolean
  fracture_imaging_consider: boolean
  dvt_assessment_required: boolean
}
```

### Concrete sets

최소한 다음은 명시적 Set으로 둔다.

```text
KNEE_02 urgent concrete:
- GROSS_DEFORMITY_OR_STILL_OUT
- COLD_PALE_BLUE_FOOT
- MAJOR_NEW_DISTAL_NEURO_CHANGE

KNEE_06A DVT concrete risk:
- RECENT_SURGERY_HOSPITALIZATION_OR_IMMOBILITY
- PRIOR_DVT_OR_PE
- ACTIVE_CANCER
- PREGNANCY_PUERPERIUM_OR_HORMONAL_CONTEXT

KNEE_06B urgent PE concrete:
- CHEST_PAIN_OR_TIGHTNESS
- SHORTNESS_OF_BREATH
- HEMOPTYSIS

KNEE_08 hip-fracture/referred option:
- NEW_HIP_GROIN_PAIN_OR_WEIGHT_BEARING_DIFFICULTY_NOT_EXPLAINED_BY_KNEE
```

### Multi-choice validity contract

기존 LBP/NECK/SHOULDER와 같은 fail-closed helper를 쓴다.

- undefined → invalid/review if screen is required+shown
- empty array → invalid
- `NONE + positive` → invalid
- `UNKNOWN + positive` → invalid
- exact `[NONE]`만 valid-negative
- exact `[UNKNOWN]`은 review
- concrete option은 각 해당 clinical semantics 적용

### URGENT_REVIEW

다음 중 하나면 urgent:

```text
core_safety_already_urgent === true
KNEE_02 concrete urgent positive
KNEE_02A === YES
KNEE_06B any concrete PE-type positive
KNEE_07 === YES
```

### REVIEW_REQUIRED

urgent가 아니면서 CLOSED amendment A4 조건을 literal port:

```text
required safety missing/malformed
KNEE_01 UNKNOWN
KNEE_02 UNKNOWN/invalid
KNEE_02A UNKNOWN/invalid
KNEE_03 YES/UNKNOWN/invalid/missing when shown
KNEE_04 YES/UNKNOWN/invalid/missing when shown
KNEE_05 YES/UNKNOWN/invalid/missing
KNEE_06 UNKNOWN/invalid/missing
KNEE_06 YES + KNEE_06A concrete risk
KNEE_06 YES + KNEE_06A UNKNOWN/invalid/missing
KNEE_06A UNKNOWN/invalid/missing when shown
KNEE_06B UNKNOWN/invalid/missing when shown
KNEE_07 UNKNOWN/invalid/missing
KNEE_08 any concrete positive / UNKNOWN / invalid / missing
```

중요 negative regression:

```text
KNEE_06 == YES
AND KNEE_06A == [NONE]
AND KNEE_06B == [NONE]
```

이면 **DVT 경로만으로 REVIEW_REQUIRED가 되지 않아야 한다.**

### `expedited_referral_consider`

```text
KNEE_04 == YES or UNKNOWN
OR
KNEE_05 == YES or UNKNOWN
```

missing은 safety REVIEW를 만들지만 expedited flag를 임의로 true로 만들지 않는다.

### `fracture_imaging_consider`

```text
KNEE_03 == YES
OR
KNEE_08 includes NEW_HIP_GROIN_PAIN_OR_WEIGHT_BEARING_DIFFICULTY_NOT_EXPLAINED_BY_KNEE
```

### `dvt_assessment_required`

CLOSED combined-condition만 구현:

```text
KNEE_06 == YES + KNEE_06A concrete risk
KNEE_06 == YES + KNEE_06A UNKNOWN/invalid/missing
KNEE_06 == UNKNOWN + KNEE_06A concrete risk/UNKNOWN/invalid/missing
```

명시적 `KNEE_06 YES + KNEE_06A [NONE]`이면 false.

### Lock

```ts
export const kneeSafetyLocked = (f: KneeComputedFields) =>
  f.knee_safety_status !== 'CLEAR'
```

별도 manipulation catastrophic-risk engine은 만들지 않는다. CLOSED KNEE v1에 없는 새 임상정책을 기술통합 단계에서 발명하지 않는다.

---

## 3.2 `src/spec/kneeAdapter.ts`

두 adapter를 만든다.

```text
toKneeState(r: Responses, coreGeneralRed: boolean)
toKneeStateFromDoctorPayload(r: DoctorPayload['responses'], coreGeneralRed: boolean)
```

역할:

- KNEE_01~08 raw answer → `KneeState`
- `computeFlags(r).general_red` 또는 `payload.flags.general_red` → `core_safety_already_urgent`
- string vs string[] 변환만 수행
- 임상 threshold를 adapter에서 재구현하지 않음

현재 KNEE v1 safety flags에는 clinician-entered objective field가 필요하지 않으므로 **JudgmentPanel field를 새로 추가하지 않는다.** Wells score, SLR, distal NV exam 등은 clinician-side 평가이며, 이 iteration에는 그 결과를 persistence하는 CLOSED contract가 없다.

---

## 3.3 `tests/knee.spec.mjs`

Layer A(logic) + Layer B(adapter) 구조로 만든다.

세부 테스트는 §8에 정의한다.

---

# 4. `coreSpec.ts` Integration

## 4.1 import

추가:

```ts
import { toKneeState } from './kneeAdapter'
import { computeKneeFlags } from './kneeLogic'
```

## 4.2 entry helper

```ts
export const IS_PRIMARY_KNEE = (r: Responses) =>
  IS_PRIMARY_PAIN(r) && r['PAIN_01'] === 'knee'
```

LBP/NECK/SHOULDER helper와 독립적으로 둔다.

## 4.3 `KNEE_QUESTIONS`

CLOSED v0.1 + v0.1.1 amendment의 문구/value를 literal port한다.

### protected safety

```text
KNEE_01
KNEE_02
KNEE_02A
KNEE_03
KNEE_04
KNEE_05
KNEE_06
KNEE_06A
KNEE_06B
KNEE_07
KNEE_08
```

### phenotype/support

```text
KNEE_09
KNEE_10
KNEE_11
KNEE_12
KNEE_13
KNEE_14
KNEE_15
```

핵심 showIf:

```text
KNEE_01/02/02A/05/06/07/08 -> IS_PRIMARY_KNEE
KNEE_03/04/15 -> IS_PRIMARY_KNEE && KNEE_01 in [YES, UNKNOWN]
KNEE_06A/06B -> IS_PRIMARY_KNEE && KNEE_06 in [YES, UNKNOWN]
KNEE_06B additionally skip only when Core general_red already true
KNEE_09~14 -> IS_PRIMARY_KNEE
```

`KNEE_03`, `KNEE_04`는 반드시 `required: true`.

KNEE_08 options에는 final CLOSED amendment의 신규 option을 포함한다.

## 4.4 question composition

기존 모듈 순서를 건드리지 않는 additive insertion을 우선한다.

```text
...PAIN_QUESTIONS,
...LBP_QUESTIONS,
...SHOULDER_QUESTIONS,
...NECK_QUESTIONS,
...KNEE_QUESTIONS,
...FATIGUE_QUESTIONS,
```

기존 각 모듈은 showIf가 상호 배타적이므로 기존 LBP/NECK/SHOULDER 환자의 visible sequence는 변하지 않아야 한다.

## 4.5 StaffCheckScreen interrupt

등록 screen:

```text
KNEE_02
KNEE_02A
KNEE_06B
KNEE_07
```

각 trigger는 개별 condition을 손으로 재구현하지 않고:

```ts
computeKneeFlags(
  toKneeState(r, computeFlags(r).general_red)
).knee_safety_status === 'URGENT_REVIEW'
```

원칙을 사용한다.

등록하지 않는 screen:

```text
KNEE_01
KNEE_03
KNEE_04
KNEE_05
KNEE_06
KNEE_06A
KNEE_08
```

이들은 CLOSED semantics상 REVIEW/expedited/flag 계층이지 urgent interrupt source가 아니다.

## 4.6 payload

`safety_flags`:

```ts
knee: IS_PRIMARY_KNEE(r)
  ? computeKneeFlags(toKneeState(r, computeFlags(r).general_red))
  : null
```

`modules.knee`:

```text
recent_trauma_or_sudden_load
 deformity_neurovascular_screen
 spontaneously_reduced_dislocation_screen
 post_trauma_weight_bearing_failure
 extensor_mechanism_concern
 true_locked_extension_block
 unilateral_leg_dvt_symptom_screen
 dvt_risk_context
 dvt_pe_associated_screen
 septic_joint_emergency_screen
 referred_non_knee_redflag_screen
 primary_side
 pain_location_pattern
 load_provocation_pattern
 morning_stiffness_duration
 giving_way_instability
 patellar_instability_history
 rapid_post_trauma_effusion
```

각 key는 해당 KNEE id를 1:1로 매핑한다.

## 4.7 routing

`buildRoutingPayload().primary_module_detail`에 KNEE를 추가한다.

우선순위는 mutually exclusive pain location 기준이므로:

```text
LBP
NECK/SHOULDER
KNEE
null
```

중 하나가 되게 한다.

KNEE가 추가되어도 기존 `PAIN_01=low_back_pelvis` 또는 `neck_shoulder` 결과가 달라지면 안 된다.

---

# 5. Doctor View Integration

## 5.1 imports

```text
computeKneeFlags
kneeSafetyLocked
KneeComputedFields
toKneeStateFromDoctorPayload
```

## 5.2 `KneeSafetyPanel`

render gate:

```ts
if (payload.responses.safety_flags.knee === null) return null
```

다음 chip을 분리 표시:

```text
무릎 안전: CLEAR / REVIEW_REQUIRED / URGENT_REVIEW
신속 의뢰 고려: yes/no
골절·영상 평가 고려: yes/no
DVT 평가 필요: yes/no
```

`dvt_assessment_required`가 true면 설명:

```text
DVT 가능성을 확정한 것이 아니라 clinician-side 평가/Wells 확인이 필요합니다.
```

`knee_safety_status !== CLEAR`이면 routine exercise/manual-treatment suggestion lock 안내를 보여준다.

## 5.3 raw patient summary

아래를 S/patient-reported 정보로 보여줄 수 있다.

- 측성
- 통증 위치
- load pattern
- locked sensation
- instability/giving way
- rapid swelling
- trauma context
- DVT/PE screen response
- referred/non-knee screen response

객관적 진찰로 표시하지 않는다.

## 5.4 Suggested Exam — minimal mechanical mapping only

새 임상판단을 만들지 않고 CLOSED 문서가 직접 연결한 경우만 추천한다.

Base when module active:

```text
GAIT_WEIGHT_BEARING
KNEE_AROM_PROM_EXTENSION
EFFUSION_ASSESSMENT
TARGET_FUNCTION_REPRODUCTION
```

Safety-selective:

```text
KNEE_02/KNEE_02A concern
→ DISTAL_NEUROVASCULAR_EXAM
→ DEFORMITY_BONY_TENDERNESS

KNEE_03/fracture_imaging_consider
→ FOCAL_BONY_TENDERNESS
→ RADIOGRAPH_INDICATION_REVIEW

KNEE_04 concern
→ STRAIGHT_LEG_RAISE
→ ACTIVE_EXTENSION_EXTENSOR_LAG
→ EXTENSOR_MECHANISM_PALPATION

KNEE_05 concern
→ TRUE_MECHANICAL_BLOCK_VS_PAIN_LIMITED_ROM
→ JOINT_LINE_EXAM

KNEE_06 DVT flag
→ CLINICIAN_DVT_ASSESSMENT_WELLS

KNEE_08 hip/groin option
→ HIP_GROIN_EXAM
→ WEIGHT_BEARING_ASSESSMENT
```

Meniscus/ligament/PF special tests는 raw pattern과 clinician judgment를 보고 선택하는 영역이며, 하나의 patient answer로 자동 확진 문구를 만들지 않는다.

## 5.5 No new JudgmentPanel field in this iteration

이 iteration에서 다음을 structured persisted judgment로 새로 만들지 않는다.

- Wells score
- SLR result
- neurovascular result
- McMurray/Lachman/Thessaly result
- definitive KNEE diagnosis

이유: CLOSED KNEE v1은 clinician-side 평가가 필요하다고 명시하지만, 해당 객관적 결과의 persistence schema/required enum까지 임상적으로 닫은 적은 없다. Fable/Sonnet이 기술 단계에서 새 clinical contract를 발명하지 않는다.

---

# 6. Supportive Phenotype Scope

CLOSED 문서는 다음 phenotype을 정의한다.

```text
KNEE_OA_PATTERN
PATELLOFEMORAL_PAIN
PATELLAR_TENDINOPATHY
ACUTE_MENISCAL_INJURY
DEGENERATIVE_MENISCAL_CONTRIBUTION
LIGAMENT_INJURY
PATELLAR_INSTABILITY
```

그러나 모든 phenotype에 대해 구현 가능한 deterministic scoring threshold가 닫혀 있지는 않다.

따라서 KNEE_V1 production integration에서:

- raw discriminators는 payload/Doctor View에 보존
- MUST_EXCLUDE safety domain은 구현
- CLOSED safety flags는 구현
- 확진/자동 점수화/가짜 확률은 구현하지 않음

향후 phenotype ranking이 필요하면 별도 임상결정으로 닫은 뒤 추가한다.

---

# 7. Files Expected to Change

## New

```text
src/spec/kneeLogic.ts
src/spec/kneeAdapter.ts
tests/knee.spec.mjs
docs/KNEE_V1_INTEGRATION_REPORT.md   // implementation 완료 후
```

## Modify

```text
src/spec/coreSpec.ts
src/doctor/DoctorView.tsx
src/doctor/fixtures.ts               // 최소 knee fixture/test용
package.json
```

필요한 경우에만:

```text
tests/integration.spec.mjs
tests/doctor.spec.mjs
```

기본 방침:

- `src/spec/lbpLogic.ts` 수정 금지
- `src/spec/neckLogic.ts` 수정 금지
- `src/spec/shoulderLogic.ts` 수정 금지
- 기존 adapter threshold 수정 금지
- 기존 CLOSED question wording 수정 금지

---

# 8. Test Matrix

## A. Logic Engine

### A0 valid negative
fully answered valid-negative → `CLEAR`

### A1 KNEE_02
- deformity → URGENT
- cold/pale/blue foot → URGENT
- major distal neuro change → URGENT
- UNKNOWN → REVIEW
- missing → REVIEW
- malformed NONE+positive → REVIEW or URGENT only if concrete urgent is present; never CLEAR

### A2 KNEE_02A
- YES → URGENT
- UNKNOWN → REVIEW
- missing → REVIEW
- NO → no contribution
- KNEE_01=NO여도 KNEE_02A YES는 URGENT

### A3 KNEE_03
when shown:
- YES → REVIEW + fracture flag
- UNKNOWN → REVIEW
- missing → REVIEW
- NO → no contribution

### A4 KNEE_04
when shown:
- YES → REVIEW + expedited
- UNKNOWN → REVIEW + expedited
- missing → REVIEW
- never auto-urgent

### A5 KNEE_05
- YES → REVIEW + expedited
- UNKNOWN → REVIEW + expedited
- missing → REVIEW
- never auto-urgent

### A6 DVT combined-condition — critical regression

Must pass:

```text
KNEE_06 YES
KNEE_06A [NONE]
KNEE_06B [NONE]
all other safety clean
=> CLEAR
=> dvt_assessment_required false
```

Must review:

```text
KNEE_06 YES + KNEE_06A concrete risk
KNEE_06 YES + KNEE_06A UNKNOWN
KNEE_06 YES + KNEE_06A missing
KNEE_06 UNKNOWN
```

DVT flag true only per CLOSED combined logic.

### A7 PE
KNEE_06B any concrete positive → URGENT, with no movement/rest AND condition.

### A8 septic
KNEE_07 YES → URGENT.

### A9 referred/non-knee
- neuro/referred concrete option → REVIEW
- new hip/groin/weight-bearing option → REVIEW + fracture flag
- UNKNOWN/missing/malformed → REVIEW

### A10 Core urgent passthrough
Core general red true → knee URGENT.

### A11 locks
- CLEAR → unlocked
- REVIEW → locked
- URGENT → locked

## B. Adapter

- all KNEE ids map to exact `KneeState` fields
- multi-choice stays array
- absent fields stay undefined
- core general-red passes through
- DoctorPayload adapter and raw Responses adapter produce equivalent state for equivalent answers

## C. Question visibility

- non-knee pain → no KNEE questions
- knee-primary → protected KNEE screens visible
- KNEE_02A visible even if KNEE_01=NO
- KNEE_03/04/15 appear for KNEE_01 YES or UNKNOWN
- KNEE_06A/B appear for KNEE_06 YES or UNKNOWN
- KNEE_03/04 required true
- stale answers pruned after parent answer changes

## D. Staff interrupt

- KNEE_02 urgent answer → StaffCheck
- KNEE_02A YES → StaffCheck
- KNEE_06B PE positive → StaffCheck
- KNEE_07 YES → StaffCheck
- KNEE_03 YES → no immediate StaffCheck, only REVIEW+flag
- KNEE_04 YES → no immediate StaffCheck, only REVIEW+expedited
- KNEE_05 YES → no immediate StaffCheck, only REVIEW+expedited
- KNEE_08 positive → no immediate StaffCheck, only REVIEW/flag

## E. Payload/routing

- knee patient → `safety_flags.knee !== null`
- non-knee patient → `safety_flags.knee === null`
- all KNEE responses under `modules.knee`
- `primary_module_detail === 'KNEE'` for knee primary
- existing LBP/NECK/SHOULDER routing unchanged

## F. Doctor View

- knee panel appears only when knee safety payload exists
- all 4 flags/status render separately
- DVT flag text says clinician assessment/Wells required, not DVT diagnosis
- raw tablet answers are not labeled as objective exam
- locked note appears for REVIEW/URGENT

## G. Full regression

Required before PASS/FROZEN:

```bash
npm run build
npm run test:knee
npm run test:lbp
npm run test:neck
npm run test:shoulder
npm run test:all
```

All: **0 failed**.

현재 기존 suite 총 assertion 수를 새로운 고정 숫자로 문서화하지 않는다. 구현 완료 시 실제 실행결과를 `KNEE_V1_INTEGRATION_REPORT.md`에 기록한다.

---

# 9. Sonnet Implementation Order

한 번에 clinical surface를 넓히지 말고 다음 순서로 구현한다.

```text
1. kneeLogic.ts + unit tests
2. kneeAdapter.ts + adapter tests
3. coreSpec KNEE questions + visibility/stale-prune tests
4. safety_flags/modules payload + routing
5. STAFF_CHECK_TRIGGERS urgent integration
6. Doctor View panel + minimal fixture/tests
7. package test:knee/test:all wiring
8. build + module regressions
9. full test:all
10. KNEE_V1_INTEGRATION_REPORT.md
```

각 단계에서 LBP/NECK/SHOULDER 파일을 불필요하게 건드리지 않는다.

---

# 10. Stop Conditions

Sonnet은 아래 중 하나면 구현을 멈추고 `CLINICAL DECISION REQUIRED`로 되돌리지 말고 **INTEGRATION DECISION REQUIRED**로 보고한다.

- CLOSED 문서끼리 값/문구가 충돌
- 기존 UI type contract로 CLOSED semantics를 literal port할 수 없음
- safety status를 지키려면 기존 LBP/NECK/SHOULDER 임상 threshold를 바꿔야 함
- Wells/objective exam 결과 persistence가 구현상 필수인데 schema가 없음
- 새로운 clinical threshold/diagnosis rule이 필요함

단순한 TypeScript/React/test 구조 문제는 Sonnet이 해결한다.

---

# 11. Definition of Done

KNEE_V1 production integration은 아래가 모두 충족돼야 완료다.

```text
[ ] KNEE questions in real tablet flow
[ ] protected safety visibility correct
[ ] KNEE safety engine literal CLOSED semantics
[ ] K5 DVT de-escalation regression test passes
[ ] K9 occult hip-fracture path present
[ ] KNEE_03/KNEE_04 required fail-closed
[ ] urgent screens interrupt via full engine reuse
[ ] response payload + routing integrated
[ ] Doctor View safety panel integrated
[ ] no fake diagnosis / no Wells auto-score
[ ] build passes
[ ] test:knee passes
[ ] LBP/NECK/SHOULDER regressions pass
[ ] test:all passes with 0 failed
[ ] integration report committed
```

완료 후 상태:

```text
KNEE_V1: PASS / FROZEN
```

그 전에는 FROZEN을 선언하지 않는다.

---

# 12. Current Gate

```text
LBP_V1       PASS / FROZEN + Opus retrospective audit PASS
NECK_V1      PASS / FROZEN
SHOULDER_V1  PASS / FROZEN

KNEE Evidence/Tablet/Opus      PASS / CLINICAL DECISIONS CLOSED
Fable repo audit               COMPLETE
Fable integration plan         COMPLETE
Sonnet implementation          NOT STARTED
KNEE production status         NOT YET FROZEN
```

다음 단일 단계:

> **Sonnet: implement this plan literally on `clinical/knee-v1-integration`, then run full regression and write `docs/KNEE_V1_INTEGRATION_REPORT.md`.**
