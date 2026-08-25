# KNEE_V1 — 실제 repo 통합 결과

작성일: 2026-08-25
상태: **KNEE_V1: PASS / FROZEN**

이 문서는 `KNEE_V1_Tablet_Question_Set_v0.1.md` + `KNEE_V1_Tablet_Question_
Set_v0.1.1_Amendment_CLOSED_CANDIDATE.md`(CLINICAL DECISIONS CLOSED —
Evidence Matrix → Opus review v0.1[K1-K9/C1-C2] → Tablet v0.1 → Opus
재검수 v0.2[K5/K9/fail-closed 3건] → v0.1.1 Amendment → Opus final
verification PASS)와 `KNEE_V1_Fable_Integration_Plan_v0.1.md`을 그대로
따라 KNEE_V1을 실제 repo에 통합한 결과를 기록한다. 이번 통합은 CLOSED된
임상결정과 safety threshold를 전혀 재해석·수정하지 않았다 — 아래 §3이
CLOSED 스펙의 핵심 규칙 각각이 코드 어디에 있는지, 어떤 테스트가 지키는지
1:1로 보여준다.

---

## 1. 실제 변경 파일

### 신규 파일
- `src/spec/kneeLogic.ts` — Tablet v0.1 §9-13(Knee Safety Engine /
  expedited_referral_consider / fracture_imaging_consider /
  dvt_assessment_required / Intervention Lock), Amendment §A1-A4(K5
  combined-condition, K9 hip/groin option, fail-closed required)의
  리터럴 포트.
- `src/spec/kneeAdapter.ts` — `Responses`/`DoctorPayload`를 `KneeState`로
  변환. LBP/NECK/SHOULDER와 달리 다른 모듈의 canonical safety를 호출하지
  않는다(§2 — `PAIN_01`의 `knee`는 `low_back_pelvis`/`neck_shoulder`와
  상호 배타적이라 공유 population 자체가 없음, Opus v0.2 K9 결론).
- `tests/knee.spec.mjs` — 엔진 전체 규칙(60 assertions, Section A/B).
- `docs/KNEE_V1_INTEGRATION_REPORT.md` — 이 문서.

### 수정 파일
- `src/spec/coreSpec.ts` — `IS_PRIMARY_KNEE` 게이트, `KNEE_QUESTIONS`
  (KNEE_01-15) 추가, `CORE_QUESTIONS`에 splice, `STAFF_CHECK_TRIGGERS`에
  KNEE_02/KNEE_02A/KNEE_06B/KNEE_07 추가, `buildRoutingPayload`의
  `primary_module_detail`에 KNEE 분기 추가, `buildResponsePayload`에
  `modules.knee` + `safety_flags.knee` 추가. **`LBP_QUESTIONS`/
  `NECK_QUESTIONS`/`SHOULDER_QUESTIONS`/`IS_PRIMARY_LBP`/`IS_PRIMARY_NECK`/
  `lbpLogic.ts`/`lbpAdapter.ts`/`neckLogic.ts`/`neckAdapter.ts`/
  `shoulderLogic.ts`/`shoulderAdapter.ts`는 단 한 줄도 수정하지 않았다**
  (아래 §5에서 `git status`로 확인).
- `src/doctor/DoctorView.tsx` — `KneeSafetyPanel` 신규 컴포넌트,
  `suggestedKneeExamCodes`(§5.4 minimal mechanical mapping),
  `primaryModuleFields`의 `case 'Pain'`에 KNEE 원시 필드 블록 추가.
  **기존 `NeckSafetyPanel`/`ShoulderSafetyPanel`/`LbpSafetyPanel`은
  건드리지 않았다** — KNEE는 LBP/NECK/SHOULDER처럼 게이트를 primary 태그
  기반에서 `safety_flags.X !== null` 기반으로 바꿔야 하는 F1류 위험이
  원천적으로 없다(population이 겹치지 않으므로 primary_module_detail과
  m.pain.primary_location이 항상 일치).
- `src/doctor/fixtures.ts` — 신규 KNEE fixture 1개 추가(K5 de-escalation +
  K9 hip/groin option을 한 fixture로 동시 증명). 기존 fixture는 전혀
  수정하지 않았다(SHOULDER 통합 때와 달리 population 충돌이 없어 valid
  -negative 보정이 불필요).
- `tests/integration.spec.mjs` — I1(STAFF_CHECK_TRIGGERS 키 목록)에
  KNEE_02/KNEE_02A/KNEE_06B/KNEE_07 추가, **N 섹션**(question visibility
  §8.C, staff interrupt §8.D, payload/routing §8.E, 총 24 assertions).
  L/M류 cross-module 태그은닉 회귀는 KNEE에 해당 없음(§2).
- `tests/doctor.spec.mjs` — KNEE fixture용 "2f" 블록(18 assertions).
- `package.json`, `.gitignore` — `test:knee` 스크립트 + 번들 파일
  gitignore 등록(기존 lbp/neck/shoulder 스크립트와 동일한 패턴).

---

## 3. CLOSED 스펙 규칙 → 코드 → 테스트 매핑

| CLOSED 규칙 | 코드 위치 | 테스트 |
|---|---|---|
| K1: KNEE_07 YES → URGENT_REVIEW | `kneeLogic.ts::knee07Status` | `knee.spec.mjs` A8 |
| K2: KNEE_02A 무조건 노출(KNEE_01 무관), YES → URGENT | `coreSpec.ts` `KNEE_02A.showIf: IS_PRIMARY_KNEE`(게이트 없음) / `knee02aStatus` | `knee.spec.mjs` A2, `integration.spec.mjs` N-C3 |
| K2: KNEE_02 concrete(변형/청색증/신경변화) → URGENT | `knee02Status`(`KNEE02_URGENT` set) | `knee.spec.mjs` A1 |
| K3: KNEE_04 YES/UNKNOWN → REVIEW+expedited, URGENT 자동승격 없음 | `knee04Status` | `knee.spec.mjs` A4 |
| K4: KNEE_05 YES/UNKNOWN → REVIEW+expedited, URGENT 자동승격 없음 | `knee05Status` | `knee.spec.mjs` A5 |
| K5(Amendment A1): KNEE_06 YES+KNEE_06A=[NONE] 단독으로 REVIEW/dvt flag를 만들지 않음 | `knee06Contribution`의 `outcome === 'NONE'` 분기 | `knee.spec.mjs` **A6 CRITICAL**, `doctor.spec.mjs` **K5 CRITICAL**(fixture) |
| K5: Wells는 clinician-side, tablet은 계산하지 않음 | `kneeLogic.ts`/`kneeAdapter.ts` 어디에도 Wells 계산 없음 | 코드 자체 부재로 증명(§7 deferred) |
| C2: KNEE_06B에 움직임/자세 AND gate 없음 | `knee06bStatus`(단일조건) | `knee.spec.mjs` A7 |
| K1/C2: Core general_red 이미 urgent → KNEE도 URGENT(passthrough) | `kneeSafetyStatus`의 `core_safety_already_urgent` rule | `knee.spec.mjs` A10 |
| K9(Amendment A2): KNEE_08 hip/groin option → REVIEW+`fracture_imaging_consider`(신규 tier/flag 아님) | `knee08Status`+`fractureImagingConsider`, `KNEE08_HIP_FRACTURE_OPTION` | `knee.spec.mjs` A9, `doctor.spec.mjs` **K9**(fixture) |
| K9: LBP 엔진 재사용 없이 KNEE 독립 최소 screen | `kneeAdapter.ts`에 lbp/neck/shoulder import 없음 | §5 회귀 + import 부재로 증명 |
| C1: `MUST_EXCLUDE_FRACTURE_OR_NEUROVASCULAR_INJURY` | `KNEE02_URGENT`/`KNEE02A`/`KNEE08_HIP_FRACTURE_OPTION`이 모두 이 domain에 귀속 | `knee.spec.mjs` A1/A2/A9 |
| fail-closed(Amendment A3): KNEE_03/KNEE_04 shown 시 `required: true` | `coreSpec.ts`의 `KNEE_03`/`KNEE_04` 정의 | `integration.spec.mjs` N-C6 |
| fail-closed: missing/UNKNOWN/malformed는 CLEAR를 만들지 않음 | 각 status 함수의 `undefined`/malformed 분기 전부 review 이상 | `knee.spec.mjs` A1/A2/A3/A4/A5/A6/A7/A8/A9 missing/malformed 케이스 전부 |
| URGENT 실시간 인터럽트는 엔진 재계산, 부분 재구현 아님 | `STAFF_CHECK_TRIGGERS.KNEE_02/02A/06B/07`이 `computeKneeFlags` 전체를 재호출 | `integration.spec.mjs` N-D1-D6 |
| 비-KNEE 환자는 `safety_flags.knee === null` | `buildResponsePayload`의 `IS_PRIMARY_KNEE(r) ? ... : null` | `integration.spec.mjs` N-E1/N-E4 |

---

## 4. K5/K9/fail-closed 결정 검증 상세

### K5 — DVT combined-condition (가장 안전-critical한 계산)
Amendment A1의 유일한 negative carve-out(`KNEE_06 YES + KNEE_06A [NONE]`)은
`kneeLogic.ts`의 `knee06Contribution`에서 `classifyKnee06a(v06a) === 'NONE'`
일 때만 `{ review: false, dvtFlag: false }`를 반환하도록 리터럴 구현했다.
그 외 모든 조합(KNEE_06A concrete risk / UNKNOWN / invalid / missing, 또는
KNEE_06 자체가 UNKNOWN/missing)은 review+flag를 fail-closed로 켠다. 이
정확한 규칙을 `knee.spec.mjs`의 `A6 CRITICAL` 테스트 1개와 그 주변 6개
회귀 테스트, 그리고 `doctor.spec.mjs`의 실제 fixture(원시 `Responses` →
`buildResponsePayload` → 실제 `safety_flags.knee.dvt_assessment_required`
값까지 end-to-end로) 양쪽에서 검증했다. KNEE_06B(PE 교차확인)는 이 로직과
완전히 독립적으로 항상 별도 평가되므로(§3 표), 이 de-escalation이 진짜
PE 안전망을 약화시키지 않는다.

### K9 — occult hip-fracture referred screen
`KNEE08_HIP_FRACTURE_OPTION`을 `kneeLogic.ts`에서 export해 `coreSpec.ts`
(문항 정의)와 `DoctorView.tsx`(Suggested Exam 트리거)가 동일한 문자열
리터럴을 재선언하지 않고 공유하게 했다 — 값이 어긋날 여지를 구조적으로
차단했다. 이 옵션의 positive는 새 safety tier나 새 flag가 아니라 기존
`fracture_imaging_consider`(K2/KNEE_03과 동일 flag)를 재사용한다.

### fail-closed — KNEE_03/KNEE_04 required
`coreSpec.ts`에서 두 필드 모두 `required: true`로 명시했다(Amendment A3).
`integration.spec.mjs` N-C6이 `ALL_QUESTIONS`에서 실제 `Question` 객체의
`required` 필드 값을 직접 검사해 이 스펙 준수를 확인한다 — 문서 텍스트가
아니라 실제 런타임 질문 정의를 검사한다.

---

## 5. LBP/NECK/SHOULDER 회귀

```
$ git diff --stat -- src/spec/lbpLogic.ts src/spec/lbpAdapter.ts \
    src/spec/neckLogic.ts src/spec/neckAdapter.ts \
    src/spec/shoulderLogic.ts src/spec/shoulderAdapter.ts \
    src/doctor/judgment.ts src/doctor/JudgmentPanel.tsx
(빈 출력 — 8개 CLOSED 파일 전부 0 diff)
```

```
$ npm run test:lbp
tests/lbp.spec.mjs: 46 passed, 0 failed

$ npm run test:neck
tests/neck.spec.mjs: 81 passed, 0 failed

$ npm run test:shoulder
tests/shoulder.spec.mjs: 38 passed, 0 failed
```

세 모듈 모두 KNEE_V1 통합 이전과 동일한 assertion 수, 0 failed.
`tests/integration.spec.mjs`의 기존 G/H1-H3 walk(모든 primary_concern
경로에 대한 일반 stale-prune/leak 검사)와 L/M(SHOULDER F1 회귀) 섹션도
KNEE 추가 이후 수정 없이 그대로 통과했다(§6).

---

## 6. 실행 결과 (실제 assertion 수)

```
$ npx tsc -b --force
(clean, 0 errors)

$ npm run build
✓ 117 modules transformed
dist/assets/index-*.js   351.47 kB │ gzip: 116.64 kB
✓ built in 1.80s

$ npm run test:knee
tests/knee.spec.mjs: 60 passed, 0 failed

$ npm run test:all
test:integration        537 assertions passed, 0 failed
test:layout                7 assertions passed, 0 failed
test:saju                 93 passed
test:doctor               265 assertions passed, 0 failed
test:server               174 assertions passed, 0 failed
test:recorderResults       19 assertions passed, 0 failed
test:patient               46 assertions passed, 0 failed
test:emrSummary            14 assertions passed, 0 failed
test:doctorToken            5 assertions passed, 0 failed
test:lbp                   46 passed, 0 failed
test:neck                  81 passed, 0 failed
test:shoulder               38 passed, 0 failed
test:knee                   60 passed, 0 failed
------------------------------------------------
TOTAL                    1385 assertions passed, 0 failed (13 suites)
exit code: 0
```

`tests/knee.spec.mjs`는 KNEE_V1 신규 로직/어댑터 60 assertions(Section A
KNEE_01-08 전체 truth table 55개 + Section B adapter mapping 5개).
`tests/integration.spec.mjs`의 신규 N 섹션은 24 assertions(question
visibility + staff interrupt + payload/routing). `tests/doctor.spec
.mjs`의 신규 "2f" 블록은 18 assertions.

---

## 7. 의도적으로 미룬 항목 (Fable plan §5.5/§6과 동일한 v1 범위 결정)

- **Wells score 자동계산**: 구현하지 않음(요청사항 명시 금지). `KNEE_06A`는
  risk factor raw 값만 수집하고, `dvt_assessment_required` flag만 계산한다
  — Wells 산정 자체는 원장 몫으로 CLOSED 스펙이 이미 결정했다.
  `kneeAdapter.ts`/`kneeLogic.ts` 어디에도 Wells 관련 계산이 없음을 코드
  전체 검토로 확인했다.
- **새 JudgmentPanel 필드 없음**: SLR/신경혈관/McMurray/Lachman/Thessaly
  결과의 persistence schema가 아직 CLOSED되지 않았으므로(Fable plan §5.5),
  이번 iteration에서 새 clinician-entered 구조화 필드를 만들지 않았다.
  `KneeSafetyPanel`의 disease-safety 계산은 원장 입력 없이 patient
  answer만으로 완결된다(SHOULDER의 `clinician_objective_cuff_weakness`
  같은 제3의 입력이 KNEE_V1 CLOSED 스펙에는 없음).
  `toKneeStateFromDoctorPayload`는 그래서 `coreGeneralRed` 하나만
  파라미터로 받는다.
- **Meniscus/ligament/PF 특수검사 자동추천 없음**: `suggestedKneeExamCodes`
  는 CLOSED 문서가 명시적으로 연결한 안전-selective exam만 추천하고,
  McMurray/Lachman/Thessaly/apprehension 등은 raw pattern + clinician
  judgment 영역으로 남겨(§6) 자동 제안하지 않는다.
- **phenotype 확진/점수화 없음**: KNEE_OA_PATTERN 등 7개 phenotype enum은
  raw discriminator(KNEE_09-15)로 payload/Doctor View에 보존만 하고,
  자동 확진·확률·순위 매김을 구현하지 않았다(Fable plan §6).

이 항목들은 결정 누락이 아니라 CLOSED 문서와 Integration Plan이 이미
명시한 v1 scope boundary다 — 별도 임상결정이 닫히기 전까지 구현하지
않는다.

---

## 8. 최종 판정

```
[x] KNEE questions in real tablet flow
[x] protected safety visibility correct
[x] KNEE safety engine literal CLOSED semantics
[x] K5 DVT de-escalation regression test passes
[x] K9 occult hip-fracture path present
[x] KNEE_03/KNEE_04 required fail-closed
[x] urgent screens interrupt via full engine reuse
[x] response payload + routing integrated
[x] Doctor View safety panel integrated
[x] no fake diagnosis / no Wells auto-score
[x] build passes
[x] test:knee passes
[x] LBP/NECK/SHOULDER regressions pass
[x] test:all passes with 0 failed
[x] integration report committed
```

모든 조건 충족.

> # **KNEE_V1: PASS / FROZEN**

LBP_V1/NECK_V1/SHOULDER_V1과 동일한 freeze 상태에 합류한다. 이후 이
모듈의 CLOSED 임상결정·safety threshold는 새로운 임상결정 없이는
재해석·수정하지 않는다.

## 2. Integration Architecture

LBP_V1/NECK_V1과 동일한 2-레이어 설계를 재사용하되, SHOULDER_V1과 달리
다른 모듈을 재사용하지 않는 **독립형** 구조다:

```
kneeLogic.ts   (Layer 1 — literal port, pure functions, no cross-module input)
      ↑ consumes only raw KNEE_0x fields + core_safety_already_urgent
kneeAdapter.ts (Layer 2 — Responses/DoctorPayload -> KneeState)
      ↑ called by
coreSpec.ts (buildResponsePayload / STAFF_CHECK_TRIGGERS)
```

이 구조 자체가 Opus v0.2의 K9 결론("KNEE는 LBP_QUESTIONS를 재사용할 공유
population이 없다")을 코드 레벨에서 그대로 구현한 것이다 — `kneeAdapter.ts`
는 `lbpAdapter.ts`/`neckAdapter.ts`/`shoulderAdapter.ts`의 어떤 함수도
import하지 않는다. KNEE_08의 referred/non-knee red-flag는 LBP CES 엔진의
얕은 재호출이 아니라 완전히 새로운 최소 문항이며, 그 자체가 CLOSED 결정
이었다.

---
