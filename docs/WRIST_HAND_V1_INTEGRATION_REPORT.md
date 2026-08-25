# WRIST_HAND_V1 — Integration Report

작성일: 2026-08-25  
브랜치: `clinical/wrist-hand-v1-review`  
임상 상태: **PASS / CLINICAL DECISIONS CLOSED**  
통합 상태: **WRIST_HAND_V1: PASS / FROZEN**

> 이 문서는 WRIST_HAND_V1의 최종 통합 검증 보고서다. 구현 완료 후 독립 GitHub 검수에서 발견된 protected `single_choice` malformed-enum fail-open 1건까지 수정·회귀검증한 상태를 반영한다. 해당 수정은 임상 threshold 변경이 아니라 CLOSED fail-closed 계약을 런타임 입력 경계에서 보강한 것이다.

---

## 1. Authoritative source documents

- `docs/WRIST_HAND_V1_Evidence_Matrix_v0.1_HANDOFF.md`
- `docs/WRIST_HAND_V1_Opus_Clinical_Review_v0.1.md`
- `docs/WRIST_HAND_V1_Tablet_Question_Set_v0.1.md`
- `docs/WRIST_HAND_V1_Opus_Clinical_Review_v0.2.md`
- `docs/WRIST_HAND_V1_Tablet_Question_Set_v0.1.1.md`
- `docs/WRIST_HAND_V1_Opus_Final_Verification_v1.0_CLOSED.md`
  - `PASS / CLINICAL DECISIONS CLOSED`
- `docs/WRIST_HAND_V1_Fable_Integration_Plan_v0.1.md`
  - `FABLE INTEGRATION PLAN COMPLETE`
  - `SONNET IMPLEMENTATION READY`

Tablet v0.1.1 authoritative delta:

```text
WH_07A shown + empty
→ wrist_hand_safety_status = REVIEW_REQUIRED
→ infection_assessment_required = true
```

---

## 2. Production implementation

신규 production/test 파일:

```text
src/spec/wristHandLogic.ts
src/spec/wristHandAdapter.ts
tests/wrist-hand.spec.mjs
tests/wrist-hand-malformed.spec.mjs
```

통합 변경 파일:

```text
src/spec/coreSpec.ts
src/doctor/DoctorView.tsx
src/doctor/fixtures.ts
tests/integration.spec.mjs
tests/doctor.spec.mjs
package.json
.gitignore
```

기존 FROZEN 임상 logic/adapter는 수정하지 않았다.

---

## 3. Routing contract

기존 upper-limb router를 그대로 사용한다.

```text
PAIN_01 == arm_hand
→ ELBOW_00 / arm_hand_region_discriminator
```

WRIST_HAND protected safety exposure:

```text
FOREARM
WRIST_HAND
DIFFUSE_OR_MULTIPLE
UNKNOWN
```

`ELBOW`만 제외한다.

핵심 invariant:

```text
ELBOW_00 == FOREARM
→ ELBOW protected safety exposed
→ WRIST_HAND protected safety exposed
→ safety_flags.elbow != null
→ safety_flags.wrist_hand != null
```

`ELBOW_00` 값 자체는 `wrist_hand_safety_status`를 만들지 않는다. `ELBOW_00`은 `WristHandState`에 포함되지 않는다.

`primary_module_detail`은 기존 ELBOW 하위호환을 위해 overlap에서 ELBOW 우선이며, `ELBOW_00 == WRIST_HAND`일 때 `WRIST_HAND`이다. 이는 display/routing label이며 safety engine과 독립이다.

---

## 4. Safety invariants verified

### URGENT_REVIEW

다음은 각각 독립 OR trigger로 유지된다.

```text
core_safety_already_urgent

WH_02:
- GROSS_DEFORMITY_OR_STILL_OUT
- COLD_PALE_BLUE_DIGITS
- MAJOR_NEW_DISTAL_NEURO_CHANGE
- UNCONTROLLED_HEAVY_BLEEDING
- SEVERE_OPEN_WOUND_WITH_DEEP_EXPOSURE

WH_07:
- SYSTEMIC_OR_RAPIDLY_SPREADING

WH_07A shown + any concrete positive:
- SEVERE_PAIN_WHEN_STRAIGHTENING
- TENDS_TO_STAY_FLEXED
- DIFFUSE_FUSIFORM_SWELLING
```

`SYSTEMIC_OR_RAPIDLY_SPREADING`은 하나의 opaque enum이며 AND로 분해하지 않는다. WH_07A concrete positive는 WH_07 positive를 요구하지 않는 독립 urgent source다.

### REVIEW_REQUIRED / fail-closed

Protected safety의 UNKNOWN / missing / malformed / empty / invalid가 CLEAR를 만들지 못하도록 검증했다.

특히:

```text
WH_07A shown + empty
→ REVIEW_REQUIRED
→ infection_assessment_required = true
```

Stable sensory-only carve-out도 그대로 보존된다.

```text
WH_08 = MEDIAN_DISTRIBUTION or ULNAR_DISTRIBUTION or MULTIPLE_OR_BOTH
+ WH_08A = [NONE]
→ 이 neuro 경로만으로 REVIEW 생성 안 함
→ neuro_assessment_required = false
→ expedited_referral_consider = false
```

반대로 sensory-positive + WH_08A concrete/UNKNOWN/missing/malformed/empty는 REVIEW + neuro + expedited다.

---

## 5. Clinical flags verified

```text
fracture_imaging_consider
= WH_03 == YES OR WH_04 == YES

tendon_injury_assessment_required
= WH_06A == YES

infection_assessment_required
= bite
  OR protected infection screen contribution
  OR shown WH_07A concrete/UNKNOWN/missing/malformed/empty

neuro_assessment_required
= concrete sensory-positive
  AND WH_08A concrete/UNKNOWN/missing/malformed/empty

expedited_referral_consider
= WH_06A == YES
  OR neuro progression/uncertainty contribution
```

`WH_05 == YES`만으로 expedited를 만들지 않는다.

---

## 6. X-ray / chart boundary

`WH_04A`는 patient-reported context only이며 `WristHandState`에 포함되지 않는다.

```text
WH_04A = DONE_TOLD_NORMAL
```

이어도 REVIEW, `fracture_imaging_consider`, occult-fracture concern을 낮추지 못한다.

Tablet patient response는 `C/C | 주호소`, `O/S | 발병 및 경과`, `S | 주관적 소견`에 사용할 수 있으나, 환자 응답만으로 `O | 객관적 소견`, 객관적 근력등급, 혈류 확인, tendon integrity, imaging finding, 확진을 생성하지 않는다.

---

## 7. Independent post-implementation blocker and fix

초기 구현 head `41f930d`에 대해 독립 검수에서 protected `single_choice`의 허용되지 않은 문자열이 TypeScript cast를 통해 런타임에 들어올 경우 일부 safety 함수가 이를 정상 negative처럼 처리할 수 있는 fail-open 가능성을 발견했다.

영향 필드:

```text
WH_01
WH_03
WH_04
WH_05
WH_06A
WH_07
WH_08
```

수정:

- `wristHandAdapter.ts`에서 각 protected single-choice에 explicit allowlist validation 적용
- 허용되지 않은 문자열은 `undefined`로 정규화
- 기존 CLOSED logic의 missing/malformed fail-closed 경로로 전달
- clinical threshold 변경 없음

전용 회귀 테스트:

```text
tests/wrist-hand-malformed.spec.mjs
8 passed, 0 failed
```

이 수정이 포함된 검증 implementation head:

```text
c39bb898dfe86c4800dc304571ae2320db829de2
```

---

## 8. Test results — verified on GitHub Actions CI #29

Build:

```text
tsc -b && vite build
121 modules transformed
PASS
```

JS/TS test results:

```text
test:integration      625 / 0
test:layout              7 / 0
test:saju               93 / 0
test:doctor            331 / 0
test:server            174 / 0
test:recorderResults    19 / 0
test:patient            46 / 0
test:emrSummary         14 / 0
test:doctorToken         5 / 0
test:lbp                46 / 0
test:neck               81 / 0
test:shoulder           38 / 0
test:knee               60 / 0
test:elbow              67 / 0
test:wrist-hand         79 / 0
wrist-hand-malformed     8 / 0
```

Total:

```text
1693 assertions passed
0 failed
15 top-level npm test commands
16 executed JS/TS test files (wrist-hand command contains 2 files)
```

Tablet core Python:

```text
80 passed
```

GitHub Actions:

```text
CI run #29
build-and-test
completed: success
```

---

## 9. Frozen regression boundary

다음 기존 FROZEN module 결과는 unchanged다.

```text
LBP       46 / 0
NECK      81 / 0
SHOULDER  38 / 0
KNEE      60 / 0
ELBOW     67 / 0
```

다음 12개 파일은 WRIST_HAND 구현에서 zero-diff 목표가 유지됐다.

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

LBP_V1 / NECK_V1 / SHOULDER_V1 / KNEE_V1 / ELBOW_V1 CLOSED clinical threshold는 재개방하지 않았다.

---

## 10. Non-blocking repository maintenance observations

CI는 성공했지만 별도 maintenance item으로 다음 경고가 있다.

```text
openai@7.4.0 requires Node >=22
current CI app runtime setup uses Node 20.20.2
npm audit: 3 vulnerabilities (1 moderate, 2 high)
```

이는 WRIST_HAND_V1 clinical/integration blocker가 아니며 별도 maintenance PR에서 다루는 것이 적절하다.

---

## 11. Final verdict

```text
Clinical decisions: PASS / CLINICAL DECISIONS CLOSED
Fable integration plan: COMPLETE
Production implementation: PASS
Malformed-input regression: PASS
Frozen regression: PASS
GitHub Actions CI #29: PASS

WRIST_HAND_V1: PASS / FROZEN
```

PR을 Ready for Review로 전환할 수 있으며, merge 전에는 최신 PR head의 required `build-and-test`가 success인지 다시 확인한다.
