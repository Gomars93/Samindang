# WRIST_HAND_V1 — Integration Report

작성일: 2026-08-25
기준 브랜치: `clinical/wrist-hand-v1-review`
기준 commit(이 리포트 자신을 포함하지 않는 마지막 커밋): `42bf18c`
(이 리포트를 포함하는 실제 최종 commit SHA는 §12 참고 — commit 시점에 확정)

---

## 1. 기준 CLOSED 문서

- `docs/WRIST_HAND_V1_Evidence_Matrix_v0.1_HANDOFF.md`
- `docs/WRIST_HAND_V1_Opus_Clinical_Review_v0.1.md`
- `docs/WRIST_HAND_V1_Tablet_Question_Set_v0.1.md`
- `docs/WRIST_HAND_V1_Opus_Clinical_Review_v0.2.md`
- `docs/WRIST_HAND_V1_Tablet_Question_Set_v0.1.1.md` (authoritative delta:
  §6 `infection_assessment_required`의 WH_07A 조건에 `/empty` 추가)
- `docs/WRIST_HAND_V1_Opus_Final_Verification_v1.0_CLOSED.md` —
  **PASS / CLINICAL DECISIONS CLOSED**
- `docs/WRIST_HAND_V1_Fable_Integration_Plan_v0.1.md` — **FABLE
  INTEGRATION PLAN COMPLETE / SONNET IMPLEMENTATION READY**

이 리포트가 다루는 구현은 위 CLOSED 문서 + delta를 literal port한 것이며,
어떤 임상 threshold도 이 단계에서 새로 만들거나 재해석하지 않았다.

---

## 2. 실제 구현 파일 (신규)

```text
src/spec/wristHandLogic.ts    (Layer 1 — 순수 함수, elbowLogic.ts 패턴)
src/spec/wristHandAdapter.ts  (Layer 2 — Responses/DoctorPayload 변환, elbowAdapter.ts 패턴)
tests/wrist-hand.spec.mjs     (엔진+어댑터 truth-table, 79 assertions)
```

## 3. 실제 수정 파일

```text
src/spec/coreSpec.ts        (+419 -0/일부 수정: import, IS_PRIMARY_WRIST_HAND_SAFETY,
                              WRIST_HAND_QUESTIONS, CORE_QUESTIONS splice,
                              STAFF_CHECK_TRIGGERS 3개, primary_module_detail 확장,
                              safety_flags.wrist_hand, modules.wrist_hand)
src/doctor/DoctorView.tsx   (+194: import, 라벨 상수, suggestedWristHandExamCodes,
                              WristHandSafetyPanel, 렌더 호출, primaryModuleFields
                              WRIST_HAND 블록)
src/doctor/fixtures.ts      (+61: 신규 fixture 2개 — WRIST_HAND-only, FOREARM overlap)
tests/integration.spec.mjs  (+271: I1 키 목록 수정 + 신규 P. WRIST_HAND_V1 섹션,
                              O-E4/O-E5 값 갱신 — 아래 §7 참고)
tests/doctor.spec.mjs       (+86: 신규 2h. WRIST_HAND_V1 섹션, 32 assertions)
package.json                 (test:wrist-hand 스크립트 + test:all 연결)
.gitignore                   (신규 bundle 파일 2개)
```

`git diff --stat` (실제 출력):

```text
 .gitignore                 |   2 +
 package.json               |   3 +-
 src/doctor/DoctorView.tsx  | 194 +++++++++++++++++++++
 src/doctor/fixtures.ts     |  61 +++++++
 src/spec/coreSpec.ts       | 419 ++++++++++++++++++++++++++++++++++++++++++++-
 tests/doctor.spec.mjs      |  86 ++++++++++
 tests/integration.spec.mjs | 271 ++++++++++++++++++++++++++++-
 7 files changed, 1031 insertions(+), 5 deletions(-)
```

Fable plan §9(A 신규 파일/B 수정 파일)의 예상 목록과 정확히 일치한다.

---

## 4. Routing 결과

새 upper-limb router는 만들지 않았다. 기존 `ELBOW_00`/`IS_PRIMARY_ARM_HAND`를
재사용했다.

```typescript
export const IS_PRIMARY_WRIST_HAND_SAFETY = (r: Responses) =>
  IS_PRIMARY_ARM_HAND(r) && ['FOREARM', 'WRIST_HAND', 'DIFFUSE_OR_MULTIPLE', 'UNKNOWN'].includes(r['ELBOW_00'] as string)
```

`ELBOW`만 제외한다(Opus v0.1 W1 Option B). `FOREARM`/`DIFFUSE_OR_MULTIPLE`/
`UNKNOWN`에서는 `IS_PRIMARY_ELBOW_SAFETY`와 동시에 true다 — 이 저장소
최초로 두 protected-safety 모듈이 동시에 노출되는 케이스이며, 의도된
overlap이다(integration.spec.mjs P-C4/P-E6 CRITICAL로 검증).

`ELBOW_00` 자신은 `WristHandState`(타입 정의에 아예 필드 없음)에 들어가지
않으며, 어떤 값도 `wrist_hand_safety_status`를 직접 만들지 않는다(B6
테스트로 검증).

`primary_module_detail`은 `FOREARM`/`DIFFUSE_OR_MULTIPLE`/`UNKNOWN`에서
`IS_PRIMARY_ELBOW_SAFETY`를 먼저 검사해 `'ELBOW'`를 유지한다(ELBOW_V1
FROZEN 하위호환, P-E5/P-E7 CRITICAL로 검증) — `'WRIST_HAND'`는
`ELBOW_00 === 'WRIST_HAND'`인, 이전까지 `null`이었던 케이스에서만 새로
부여된다(순수 추가, zero regression). 이 라벨은 표시/Suggested-Exam
우선순위 전용이며, `safety_flags.elbow`/`safety_flags.wrist_hand`는 각자
독립 게이트로 계산되어 FOREARM에서 둘 다 non-null이다.

---

## 5. Safety invariants 검증

`tests/wrist-hand.spec.mjs`에서 확인한 핵심 항목(실제 assertion 이름 발췌):

- **W2-1**: `UNCONTROLLED_HEAVY_BLEEDING`/`SEVERE_OPEN_WOUND_WITH_DEEP_EXPOSURE`
  각각 standalone URGENT (A1 CRITICAL W2-1, 2개).
- **W5 bite**: `HUMAN_OR_ANIMAL_BITE` 단독 REVIEW + infection flag, 감염
  징후 요구 없음 (A6 CRITICAL W5).
- **W5/W8 OR semantics**: `SYSTEMIC_OR_RAPIDLY_SPREADING` 단일 enum 값
  URGENT (A8 CRITICAL).
- **WH_07A 독립 URGENT**: `WH_07=NONE`이어도 WH_07A concrete positive만으로
  URGENT (A9 CRITICAL, 2개 — 각각 WH_06 wound/bite 경로).
- **W6 stable sensory-only**: MEDIAN/ULNAR + `[NONE]` → CLEAR, neuro/expedited
  false (A10 CRITICAL, 3개).
- **W7**: WH_05 YES → REVIEW만, blanket expedited 없음 (A5).

---

## 6. WH_07A empty 결과 (v0.1.1 authoritative delta)

```text
tests/wrist-hand.spec.mjs
  "A9 CRITICAL v0.1.1: WH_07A shown + empty array -> REVIEW_REQUIRED + infection_assessment_required=true (empty != NONE)"
  -> PASS
```

실제 `wristHandLogic.ts`의 `wh07aStatus`가 empty array를 `classifyWh07a`의
`INVALID` 분기로 처리해 REVIEW를 발생시키고, `infectionAssessmentRequired`가
동일한 `wh07aStatus` 호출 결과의 `contributesInfection`을 그대로 읽어
flag를 true로 만든다 — 두 값이 서로 다른 코드 경로에서 각자 재구현되지
않고 하나의 계산을 공유하므로, v0.1.1이 고친 것과 같은 drift가 구조적으로
재발할 수 없다.

---

## 7. FOREARM overlap 결과

`tests/integration.spec.mjs`:

```text
P-C4 CRITICAL: ELBOW_00=FOREARM exposes ELBOW protected safety -- PASS
P-C4 CRITICAL: ELBOW_00=FOREARM ALSO exposes WRIST_HAND protected safety (deliberate overlap) -- PASS
P-E6 CRITICAL: FOREARM patient -> safety_flags.elbow !== null AND safety_flags.wrist_hand !== null simultaneously -- PASS
P-E7: FOREARM patient -> primary_module_detail === 'ELBOW' (priority order, display-only label) -- PASS
```

`tests/doctor.spec.mjs`(FOREARM fixture, `전완 통증 주호소 (FOREARM,
팔꿈치+손목 동시 노출)`):

```text
FOREARM CRITICAL: safety_flags.elbow !== null AND safety_flags.wrist_hand !== null simultaneously -- PASS
FOREARM CRITICAL: renders BOTH 안전 확인 — 팔꿈치 AND 안전 확인 — 손목/손 panels -- PASS
FOREARM CRITICAL: WH_04A DONE_TOLD_NORMAL does not suppress the REVIEW_REQUIRED status or fracture flag -- PASS
```

두 protected-safety 패널이 실제 DoctorView 렌더 출력에서 동시에 나타남을
React SSR HTML 문자열 검사로 직접 확인했다(mock/stub 아님).

**O-E4/O-E5 갱신**: WRIST_HAND_V1 추가 이전에는 `ELBOW_00 === 'WRIST_HAND'`
환자의 `safety_flags.elbow`가 `null`이고 `primary_module_detail`도
`null`(해당 모듈 없음)이었다. WRIST_HAND_V1이 그 모듈을 실제로 추가했으므로
이 두 assertion의 기대값을 갱신했다 — `safety_flags.elbow === null`은
그대로 유지(정확), `primary_module_detail`은 `null` → `'WRIST_HAND'`로
변경(정확한 새 동작). 이는 ELBOW_V1의 CLOSED threshold를 재해석한 것이
아니라, WRIST_HAND_V1이 명시적으로 추가하기로 한 새 동작을 테스트가
따라잡은 것이다 — 이 갱신은 `git diff origin/main...HEAD --stat`에서
`src/spec/elbowLogic.ts`/`elbowAdapter.ts`가 zero-diff임을 통해, 실제
ELBOW_V1 로직 자체는 전혀 건드리지 않았음을 별도로 확인했다.

---

## 8. Frozen module zero-diff 확인

```text
$ git diff --stat origin/main...HEAD -- src/spec/lbpLogic.ts src/spec/lbpAdapter.ts \
    src/spec/neckLogic.ts src/spec/neckAdapter.ts src/spec/shoulderLogic.ts \
    src/spec/shoulderAdapter.ts src/spec/kneeLogic.ts src/spec/kneeAdapter.ts \
    src/spec/elbowLogic.ts src/spec/elbowAdapter.ts src/doctor/judgment.ts \
    src/doctor/JudgmentPanel.tsx
(빈 출력, exit 0)
```

12개 파일 전부 zero-diff. LBP_V1/NECK_V1/SHOULDER_V1/KNEE_V1/ELBOW_V1의
CLOSED threshold는 문자 하나 바뀌지 않았다.

---

## 9. TypeScript/build 결과

```text
$ npx tsc -b --force
(no output, exit 0 — clean)

$ npm run build
tsc -b && vite build
✓ 121 modules transformed. (ELBOW_V1 시점 119 → 121)
dist/assets/index-DFdnP7GF.js   390.68 kB │ gzip: 124.90 kB
✓ built in 2.35s
```

---

## 10. 각 test command 실제 assertion/pass/fail

```text
npm run test:integration    625 passed, 0 failed
npm run test:layout           7 passed, 0 failed
npm run test:saju            93 passed
npm run test:doctor         331 passed, 0 failed
npm run test:server          174 passed
npm run test:recorderResults 19 passed, 0 failed
npm run test:patient         46 passed, 0 failed
npm run test:emrSummary      14 passed, 0 failed
npm run test:doctorToken      5 passed, 0 failed
npm run test:lbp             46 passed, 0 failed   (unchanged)
npm run test:neck            81 passed, 0 failed   (unchanged)
npm run test:shoulder        38 passed, 0 failed   (unchanged)
npm run test:knee            60 passed, 0 failed   (unchanged)
npm run test:elbow           67 passed, 0 failed   (unchanged)
npm run test:wrist-hand      79 passed, 0 failed   (신규)
```

## 11. test:all 실제 총계

```text
$ npm run test:all
exit code: 0
```

합계(위 14개 스크립트 실제 숫자 합산):
625 + 7 + 93 + 331 + 174 + 19 + 46 + 14 + 5 + 46 + 81 + 38 + 60 + 67 + 79
= **1685 assertions passed, 0 failed, 15 suites, exit code 0**.

---

## 12. 현재 git head SHA

이 리포트를 작성한 시점의 부모 commit: `42bf18c`
(`docs(clinical): WRIST_HAND_V1 Fable integration plan v0.1`).

이 리포트 자신과 구현 전체를 포함하는 최종 commit SHA는 이 문서 커밋
직후의 `git log -1`로 확정되며, 사용자에게 보고하는 커밋 메시지/head
SHA가 authoritative하다(리포트 작성 시점에는 아직 commit 전이므로 이
문서 스스로 자기 자신의 SHA를 기록할 수 없다는 통상적 제약).

---

## 13. Definition of Done 체크리스트

- [x] 임상 요구사항 구현 (Tablet v0.1 + v0.1.1 delta literal port)
- [x] 관련 테스트 통과 (wrist-hand 79, integration 625, doctor 331)
- [x] 기존 기능 regression 없음 (lbp/neck/shoulder/knee/elbow 카운트 불변,
      12개 frozen 파일 zero-diff)
- [x] diff 검토 (§3 파일별 변경 요약, 전부 Fable plan §9 예상 범위 내)
- [x] TypeScript/build 클린
- [x] `test:all` 전체 통과 (1685/1685, exit 0)
- [ ] `HANDOFF.md` 갱신 — 이 리포트가 커밋된 후 별도로 수행 (CLAUDE.md
      운영 규칙에 따라 사용자/다음 세션이 확인)
- [ ] `DECISIONS.md` 갱신 — 필요 시 별도 판단(이 통합 자체는 이미
      CLOSED된 임상 결정의 literal port이므로 신규 DECISIONS 항목이
      필수는 아니라고 판단하나, 최종 결정은 Product Owner 몫)

---

## 14. Deferred items (범위 밖, 의도적으로 구현하지 않음)

- exercise/치료 자동 추천 엔진 (`wristHandSafetyLocked`만 export, 소비자
  없음 — ELBOW_V1과 동일한 상태)
- JudgmentPanel에 새 clinician-entered objective 필드 추가 (이번
  iteration은 요구하지 않음)
- hypothesis(MUST_EXCLUDE/supportive) 자동 산출 필드 — Doctor View 참고
  상수로만 존재, 코드가 자동 판정하지 않음
- `emrSummary.ts` 모듈별 하드코딩 목록 — grep 결과 ELBOW/KNEE 등 개별
  모듈명이 하드코딩되어 있지 않음을 확인, 추가 wiring 불필요로 판단

---

## 15. 최종 판정

```text
WRIST_HAND_V1: PASS / FROZEN
```
