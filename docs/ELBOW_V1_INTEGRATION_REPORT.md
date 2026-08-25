# ELBOW_V1 — 실제 repo 통합 결과

작성일: 2026-08-25
상태: **ELBOW_V1: PASS / FROZEN**

이 문서는 `ELBOW_V1_Tablet_Question_Set_v0.1.1.md`(CLINICAL DECISIONS CLOSED —
Evidence Matrix → Opus review v0.1 → Tablet v0.1 → Opus 재검수 v0.2[2건] →
Tablet v0.1.1 → Opus final verification PASS)와
`ELBOW_V1_Fable_Integration_Plan_v0.1.md`을 그대로 따라 ELBOW_V1을 실제
repo에 통합한 결과를 기록한다. 이번 통합은 CLOSED된 임상결정과 safety
threshold를 전혀 재해석·수정하지 않았다.

## Final clinical source of truth

```text
docs/ELBOW_V1_Evidence_Matrix_v0.1_HANDOFF.md
docs/ELBOW_V1_Opus_Clinical_Review_v0.1.md
docs/ELBOW_V1_Opus_Clinical_Review_v0.2.md
docs/ELBOW_V1_Tablet_Question_Set_v0.1.1.md   <- literal port 대상
docs/ELBOW_V1_Opus_Final_Verification_v1.0_CLOSED.md
docs/ELBOW_V1_Fable_Integration_Plan_v0.1.md
```

---

## 1. 실제 변경 파일

### 신규 파일
- `src/spec/elbowLogic.ts` — Tablet v0.1.1 §10-11(Elbow Safety Engine /
  4개 flag / Intervention Lock)의 리터럴 포트. KNEE와 동일하게 다른 모듈을
  재사용하지 않는 독립형이다(Tablet 문서 §6 "NECK_QUESTIONS를 재사용하지
  않는다").
- `src/spec/elbowAdapter.ts` — `Responses`/`DoctorPayload`를 `ElbowState`로
  변환. `ELBOW_00`(region discriminator)을 의도적으로 읽지 않는다 — F1류
  invariant(§4 참고).
- `tests/elbow.spec.mjs` — 엔진 전체 규칙 67 assertions(Section A 61 +
  Section B 6).
- `docs/ELBOW_V1_INTEGRATION_REPORT.md` — 이 문서.

### 수정 파일
- `src/spec/coreSpec.ts` — `IS_PRIMARY_ARM_HAND`/`IS_PRIMARY_ELBOW_SAFETY`
  게이트, `ARM_HAND_ROUTING_QUESTIONS`(ELBOW_00) + `ELBOW_QUESTIONS`
  (ELBOW_01-15) 추가, `CORE_QUESTIONS`에 splice, `STAFF_CHECK_TRIGGERS`에
  ELBOW_02/ELBOW_02A/ELBOW_07/ELBOW_08/ELBOW_11 추가,
  `buildRoutingPayload`의 `primary_module_detail`에 ELBOW 분기 추가(WRIST_
  HAND-only는 `null`), `buildResponsePayload`에 `modules.elbow` +
  `safety_flags.elbow` 추가. **`LBP_QUESTIONS`/`NECK_QUESTIONS`/
  `SHOULDER_QUESTIONS`/`KNEE_QUESTIONS`/`IS_PRIMARY_LBP`/`IS_PRIMARY_NECK`/
  `IS_PRIMARY_KNEE`/8개 lbp·neck·shoulder·knee logic/adapter 파일은 단 한
  줄도 수정하지 않았다**(아래 §5에서 `git diff --stat`로 확인).
- `src/doctor/DoctorView.tsx` — `ElbowSafetyPanel` 신규 컴포넌트,
  `suggestedElbowExamCodes`(§5.4 minimal mechanical mapping),
  `primaryModuleFields`의 `case 'Pain':`에 ELBOW 원시 필드 블록 추가(게이트:
  `m.pain.primary_location === 'arm_hand'` — WRIST_HAND-only 환자는 이
  조건이 true이지만 ELBOW_01-15를 본 적이 없어 필드가 전부 raw-null로
  안전하게 렌더된다). **기존 `LbpSafetyPanel`/`NeckSafetyPanel`/
  `ShoulderSafetyPanel`/`KneeSafetyPanel`은 건드리지 않았다.**
- `src/doctor/fixtures.ts` — 신규 ELBOW fixture 1개 추가(ELBOW_04 양성
  tier + E5 stable-sensory-only de-escalation을 한 fixture로 동시 증명).
  기존 fixture는 전혀 수정하지 않았다.
- `tests/integration.spec.mjs` — I1(STAFF_CHECK_TRIGGERS 키 목록)에
  ELBOW_02/ELBOW_02A/ELBOW_07/ELBOW_08/ELBOW_11 추가, **O 섹션**(question
  visibility incl. routing/WRIST_HAND exclusion, staff interrupt,
  payload/routing, 총 36 assertions).
- `tests/doctor.spec.mjs` — ELBOW fixture용 "2g" 블록(19 assertions).
- `package.json`, `.gitignore` — `test:elbow` 스크립트 + 번들 파일
  gitignore 등록(기존 lbp/neck/shoulder/knee 스크립트와 동일한 패턴).

---

## 2. Routing 구조 (E9)

```text
IS_PRIMARY_ARM_HAND = primary concern == pain && PAIN_01 == 'arm_hand'

ARM_HAND_ROUTING_QUESTIONS = [ELBOW_00]   -- IS_PRIMARY_ARM_HAND로만 게이트
                                              (ELBOW_QUESTIONS와 별도 배열)

IS_PRIMARY_ELBOW_SAFETY =
  IS_PRIMARY_ARM_HAND && ELBOW_00 in [ELBOW, FOREARM, DIFFUSE_OR_MULTIPLE, UNKNOWN]
  -- WRIST_HAND만 제외
```

`ELBOW_00`을 `ELBOW_QUESTIONS`가 아니라 별도 배열에 둔 이유(Fable plan §2.1
그대로 구현): `ELBOW_QUESTIONS`의 노출 조건 자체가 `ELBOW_00`의 값을
읽어야 하므로, 같은 배열 안에 두면 순환 참조가 생긴다. `ELBOW_00`은
`elbowLogic.ts`/`elbowAdapter.ts` 어디에도 필드로 존재하지 않는다 —
`tests/elbow.spec.mjs`의 B6(F1-invariant) 테스트가 이를 직접 검증한다.

WRIST_HAND-only 환자는 `safety_flags.elbow === null`이고
`primary_module_detail === null`이다(아직 WRIST/HAND 모듈이 없으므로) —
`'ELBOW'`로 잘못 표시하지 않는다. `tests/integration.spec.mjs`의 O-E4/O-E5가
이 회귀를 직접 검증한다.

---

## 3. Safety Status / Flags

```text
elbow_safety_status: CLEAR | REVIEW_REQUIRED | URGENT_REVIEW

fracture_imaging_consider    -- ELBOW_03 == YES
expedited_referral_consider  -- ELBOW_04/05/06 YES|UNKNOWN, ELBOW_09+09A concrete positive
                                 또는 UNKNOWN/invalid/missing (v0.1.1 수정 포함)
neuro_assessment_required    -- ELBOW_09 YES + 09A concrete positive 또는 UNKNOWN/invalid/missing
infection_assessment_required -- ELBOW_07 != NO, 또는 ELBOW_08 != NONE
```

`expedited_referral_consider`와 `neuro_assessment_required`의 ELBOW_09/09A
관련 조건은 `elbowLogic.ts`에서 **같은 `elbow09Contribution()` 함수의
결과를 공유**해 계산한다 — Opus v0.2가 지적했던 "두 flag가 문서 섹션마다
서로 다른 조건을 말해 드리프트하는" 문제가 코드 레벨에서 구조적으로
재발할 수 없다.

---

## 4. Critical Invariants (구현 확인)

| Invariant | 구현 위치 | 테스트 |
|---|---|---|
| WRIST_HAND만 ELBOW protected safety 제외 | `IS_PRIMARY_ELBOW_SAFETY` | `elbow.spec.mjs`(N/A, coreSpec 레벨) / `integration.spec.mjs` O-C3/O-C4/**O-C5 CRITICAL**/O-E4/O-E5 |
| ELBOW_00이 safety 계산 입력이 아님(F1류) | `ElbowState`에 필드 없음 | `elbow.spec.mjs` **B6** |
| 자연정복 탈구(ELBOW_02A) YES → URGENT, 무조건 노출 | `elbow02aStatus` + `showIf: IS_PRIMARY_ELBOW_SAFETY` | `elbow.spec.mjs` A2 |
| 점액낭염 OR 조건(SYSTEMIC_OR_RAPIDLY_SPREADING)이 AND로 변질되지 않음 | `elbow08Status`의 단일 enum 값 비교(분해 없음) | `elbow.spec.mjs` **A8 CRITICAL** |
| 원위 이두근/삼두근 파열 → REVIEW+expedited, URGENT 자동승격 금지 | `elbow04Status`/`elbow05Status` | `elbow.spec.mjs` A4/A5 |
| Mechanical lock → REVIEW+expedited, URGENT 자동승격 금지 | `elbow06Status` | `elbow.spec.mjs` A6 |
| stable sensory-only(09=YES+09A=[NONE])은 REVIEW를 만들지 않음 | `elbow09Contribution`의 `NONE` 분기 | `elbow.spec.mjs` **A9 CRITICAL**, `doctor.spec.mjs` **E5 CRITICAL**(fixture) |
| 09A UNKNOWN/invalid/missing → REVIEW+neuro+expedited(v0.1.1 수정) | `elbow09Contribution`의 CONCRETE/UNKNOWN/INVALID 분기 | `elbow.spec.mjs` **A11 v0.1.1 REGRESSION** |
| 심장 동반증상(ELBOW_11) 단일조건, AND gate 없음 | `elbow11Status`(옵션 4개 어디에도 수식어 없음) | `elbow.spec.mjs` A14 |
| Core urgent passthrough (ELBOW_11 생략 시에도 fail-open 없음) | `core_safety_already_urgent` rule 1 | `elbow.spec.mjs` A14(skipped-still-urgent)/A15 |
| Tablet 응답만으로 O 생성 금지 | `ElbowSafetyPanel`/`primaryModuleFields`가 전부 S(주관적)로만 표시 | `doctor.spec.mjs` no-diagnosis-language 검사 |
| LBP/NECK/SHOULDER/KNEE threshold 무변경 | 8개 logic/adapter + judgment.ts/JudgmentPanel.tsx | `git diff --stat` zero diff(§5) |

---

## 5. LBP/NECK/SHOULDER/KNEE 회귀

```
$ git diff --stat -- src/spec/lbpLogic.ts src/spec/lbpAdapter.ts \
    src/spec/neckLogic.ts src/spec/neckAdapter.ts \
    src/spec/shoulderLogic.ts src/spec/shoulderAdapter.ts \
    src/spec/kneeLogic.ts src/spec/kneeAdapter.ts \
    src/doctor/judgment.ts src/doctor/JudgmentPanel.tsx
(빈 출력 — 10개 CLOSED 파일 전부 0 diff)
```

```
$ npm run test:lbp
tests/lbp.spec.mjs: 46 passed, 0 failed

$ npm run test:neck
tests/neck.spec.mjs: 81 passed, 0 failed

$ npm run test:shoulder
tests/shoulder.spec.mjs: 38 passed, 0 failed

$ npm run test:knee
tests/knee.spec.mjs: 60 passed, 0 failed
```

네 모듈 모두 ELBOW_V1 통합 이전과 동일한 assertion 수, 0 failed.
`tests/integration.spec.mjs`의 기존 G/H1-H3(전체 primary_concern 경로
walk)와 L/M(SHOULDER F1 회귀)/N(KNEE 회귀) 섹션도 ELBOW 추가 이후 수정
없이 그대로 통과했다(§6).

---

## 6. 실행 결과 (실제 assertion 수)

```
$ npx tsc -b --force
(clean, 0 errors)

$ npm run build
✓ 119 modules transformed
dist/assets/index-*.js   370.08 kB │ gzip: 120.17 kB
✓ built in 1.20s

$ npm run test:elbow
tests/elbow.spec.mjs: 67 passed, 0 failed

$ npm run test:all
test:integration        575 assertions passed, 0 failed
test:layout                7 assertions passed, 0 failed
test:saju                 93 passed
test:doctor               291 assertions passed, 0 failed
test:server               174 assertions passed, 0 failed
test:recorderResults       19 assertions passed, 0 failed
test:patient               46 assertions passed, 0 failed
test:emrSummary            14 assertions passed, 0 failed
test:doctorToken            5 assertions passed, 0 failed
test:lbp                   46 passed, 0 failed
test:neck                  81 passed, 0 failed
test:shoulder               38 passed, 0 failed
test:knee                   60 passed, 0 failed
test:elbow                  67 passed, 0 failed
------------------------------------------------
TOTAL                    1516 assertions passed, 0 failed (14 suites)
exit code: 0
```

`tests/elbow.spec.mjs`는 ELBOW_V1 신규 로직/어댑터 67 assertions(Section A
엔진 truth table 61개 + Section B adapter mapping 6개, F1-invariant 확인
포함). `tests/integration.spec.mjs`의 신규 O 섹션은 36 assertions(question
visibility/routing 10 + staff interrupt 8 + payload/routing 8, 나머지는
helper/critical 표기). `tests/doctor.spec.mjs`의 신규 "2g" 블록은 19
assertions.

---

## 7. Implementation Mismatch — 발견 및 즉시 수정한 항목

구현 중 `elbowLogic.ts` 초안 작성 단계에서 **자체 코드 리뷰로 발견하고
테스트 실행 전에 수정한** 버그 1건이 있다(테스트 실패로 발견된 것이
아니라, CLOSED 문서와 대조하며 직접 발견):

- `elbowSafetyStatus()` 내부에서 `ELBOW_11`의 "shown" 여부를 계산할 때
  최초 작성 코드가 `elbow09Shown(...)`(ELBOW_09/09A 게이트 함수)을 잘못
  참조했다 — ELBOW_11의 실제 show_when(`!general_red`)과 무관한 값이었다.
  테스트를 실행하기 전에 CLOSED 문서(Tablet v0.1.1 §6)를 다시 대조하며
  발견해 `!s.core_safety_already_urgent`로 정정했고, 이제 사용되지 않게 된
  `elbow09Shown` 헬퍼 함수도 함께 제거했다. 이 수정 이후 `npm run
  test:elbow`는 67/67 첫 실행에서 통과했다 — 즉 이 버그는 커밋된 코드에
  들어간 적이 없다.

CLOSED 문서와 코드 사이의 의미 충돌, 또는 CLOSED 문서 자체의 새로운 모호성은
발견되지 않았다.

---

## 8. Sigma / Chart 경계 확인

`ElbowSafetyPanel`과 `primaryModuleFields`의 ELBOW 블록이 렌더하는 모든
값은 환자 자가보고이며, `doctor.spec.mjs`의 "no patient-facing
diagnosis/probability language" 검사가 확진 문구(예: "이두근 파열 진단")나
확률 수치가 출력에 없음을 직접 검증한다. O(객관적 소견)는 원장이 실제
시행한 검사만 기록하는 기존 계약을 그대로 따른다 — 새 persistence
schema를 추가하지 않았다(§9 참고).

---

## 9. 의도적으로 미룬 항목 (Fable plan §8과 동일한 v1 범위 결정)

- **새 JudgmentPanel 필드 없음**: hook test/저항 검사/신경학적 결손 결과 등
  clinician-entered objective field의 persistence schema가 아직
  CLOSED되지 않았으므로 이번 iteration에서 만들지 않았다.
  `toElbowStateFromDoctorPayload`는 `coreGeneralRed` 하나만 파라미터로
  받는다.
- **Special test 자동추천 이상의 해석 없음**: `suggestedElbowExamCodes`는
  CLOSED 문서 §8이 명시적으로 연결한 안전-selective exam만 추천하고,
  Cozen/Mill/Maudsley/Tinel grading 등은 raw pattern + clinician judgment
  영역으로 남긴다(자동 제안하지 않음).
- **phenotype 확진/점수화 없음**: `LATERAL_ELBOW_TENDINOPATHY` 등 7개
  phenotype enum은 raw discriminator(ELBOW_12-14)로 payload/Doctor View에
  보존만 하고, 자동 확진·확률·순위 매김을 구현하지 않았다.

---

## 10. 최종 판정

```text
[x] ELBOW_00 routing이 실제 tablet flow에서 동작 (WRIST_HAND 제외 확인)
[x] protected safety visibility correct
[x] Elbow safety engine literal CLOSED semantics
[x] A9 stable-sensory-only de-escalation regression test passes
[x] A11 v0.1.1 expedited_referral_consider 09A-UNKNOWN regression test passes
[x] A8 infection OR (not AND) regression test passes
[x] urgent screens interrupt via full engine reuse (5개 지점)
[x] response payload + routing integrated (WRIST_HAND -> null 포함)
[x] Doctor View safety panel integrated
[x] no fake diagnosis / no single-test-confirms-diagnosis
[x] build passes
[x] test:elbow passes
[x] LBP/NECK/SHOULDER/KNEE regressions pass (10개 frozen 파일 zero diff)
[x] test:all passes with 0 failed
[x] integration report committed
```

모든 조건 충족.

> # **ELBOW_V1: PASS / FROZEN**

LBP_V1/NECK_V1/SHOULDER_V1/KNEE_V1과 동일한 freeze 상태에 합류한다. 이후 이
모듈의 CLOSED 임상결정·safety threshold는 새로운 임상결정 없이는
재해석·수정하지 않는다.

---

## 11. 최종 commit SHA

이 문서를 커밋하기 직전 HEAD: 아래 커밋 로그의 최상단 커밋이 이 통합의
최종 SHA다(이 파일 자신을 포함하는 커밋).
