# SHOULDER_V1 — 실제 repo 통합 결과

작성일: 2026-08-25
상태: **SHOULDER_V1: PASS / FROZEN**

이 문서는 `SHOULDER_V1_Tablet_Question_Set_v0.1.1_CLOSED.md`(CLINICAL
DECISIONS CLOSED — Opus 임상검수 → v0.1 → Opus 재검수[F1/F2/F3] → v0.1.1
기계적 반영, 재검수 불필요로 명시)를 임상 source of truth로 사용해
SHOULDER_V1을 실제 repo에 통합한 결과를 기록한다. 이번 통합은 CLOSED된
임상결정과 safety threshold를 전혀 재해석·수정하지 않았다 — 아래 §2가
CLOSED 스펙의 핵심 규칙 각각이 코드 어디에 있는지, 어떤 테스트가
지키는지 1:1로 보여준다.

---

## 1. 실제 변경 파일

### 신규 파일
- `src/spec/shoulderLogic.ts` — v0.1.1 §10-12(Shoulder Safety Engine /
  Expedited Referral Flag / Intervention Lock)의 리터럴 포트. `neck_safety_
  status`를 이미 계산된 입력으로만 받는다(재구현 없음, 아래 §4 참고).
- `src/spec/shoulderAdapter.ts` — `Responses`/`DoctorPayload`를
  `ShoulderState`로 변환. `neckAdapter.ts`의 `toNeckState`/
  `toNeckStateFromDoctorPayload`와 `neckLogic.ts`의 `computeNeckFlags`를
  **직접 호출**한다(§4).
- `tests/shoulder.spec.mjs` — 엔진 전체 규칙(38 assertions, Section A/B).
- `docs/SHOULDER_V1_INTEGRATION_REPORT.md` — 이 문서.

### 수정 파일
- `src/spec/coreSpec.ts` — `SHOULDER_QUESTIONS`(NS01 + SH01-09) 추가,
  `CORE_QUESTIONS`에 splice, `STAFF_CHECK_TRIGGERS`에 SH02/SH04/SH05
  추가, `buildRoutingPayload`의 `primary_module_detail`에 SHOULDER 분기
  추가, `buildResponsePayload`에 `modules.shoulder` + `safety_flags.
  shoulder` 추가. **`NECK_QUESTIONS`/`LBP_QUESTIONS`/`IS_PRIMARY_LBP`/
  `IS_PRIMARY_NECK`/`neckLogic.ts`/`neckAdapter.ts`/`lbpLogic.ts`/
  `lbpAdapter.ts`는 단 한 줄도 수정하지 않았다.**
- `src/doctor/DoctorView.tsx` — `NeckSafetyPanel`/`primaryModuleFields`의
  NECK 게이트를 `primary_module_detail === 'NECK'`에서 `safety_flags.
  neck !== null`(또는 `m.pain.primary_location === 'neck_shoulder'`)로
  변경(§3의 필수 common-part 수정, 아래에서 근거·회귀영향 서술),
  `ShoulderSafetyPanel` 신규 컴포넌트 추가.
- `src/doctor/judgment.ts` — `shoulder_objective_cuff_weakness` 필드 추가
  (LBP의 `lbp_objective_motor_deficit`와 동일한 패턴).
- `src/doctor/JudgmentPanel.tsx` — `showShoulderExam` prop + 원장 입력
  라디오 컨트롤 추가.
- `src/doctor/fixtures.ts` — 기존 NECK fixture에 NS01/SH01/SH04/SH05
  valid-negative 값 추가(아래 §3에서 근거), 신규 SHOULDER fixture 1개
  추가.
- `tests/integration.spec.mjs` — I1(STAFF_CHECK_TRIGGERS 키 목록)에
  SH02/SH04/SH05 추가, **L 섹션**(NS01 4값 × F1 회귀, 30 assertions),
  **M 섹션**(STAFF_CHECK_TRIGGERS.SH02/04/05 직접 검증, 9 assertions).
- `tests/doctor.spec.mjs` — SHOULDER fixture용 "2e" 블록(24 assertions).
- `package.json`, `.gitignore` — `test:shoulder` 스크립트 + 번들 파일
  gitignore 등록(기존 lbp/neck 스크립트와 동일한 패턴).

---

## 2. Integration Architecture

LBP_V1/NECK_V1과 동일한 2-레이어 설계를 그대로 재사용했다:

```
shoulderLogic.ts   (Layer 1 — literal port, pure functions)
      ↑ consumes neck_safety_status as a plain input
shoulderAdapter.ts (Layer 2 — Responses/DoctorPayload -> ShoulderState)
      ↑ directly calls
neckAdapter.ts::toNeckState / neckLogic.ts::computeNeckFlags
      (기존 NECK_V1 파일, 수정 없음)
      ↑ called by
coreSpec.ts (buildResponsePayload / STAFF_CHECK_TRIGGERS)
```

LBP_V1과 달리 SHOULDER_V1은 자체 treatment-safety engine이 없다 —
v0.1.1 §12 "필요한 treatment safety는 기존 공통 치료안전 계층에서
처리한다"는 명시적 v1 범위 결정이며, `shoulderLogic.ts`에 pregnancy/
medication 매핑이 없는 것은 누락이 아니라 이 CLOSED 결정을 그대로 따른
것이다.

---

## 3. NS01 routing을 어떻게 해결했는지 (F1)

### 문제
`PAIN_01 === 'neck_shoulder'`가 NECK_V1과 SHOULDER_V1이 공유하는
진입 게이트다. NS01(목/어깨 주된 불편)이 도입되면서, `primary_module_
detail`이 같은 환자군에서 `'NECK'`뿐 아니라 `'SHOULDER'`도 될 수
있게 됐다. F1은 "NS01이 safety 문항 노출을 절대 결정하지 않는다"를
요구한다.

### 해결
**질문 노출**: `SHOULDER_QUESTIONS`(NS01 자신 포함, SH01-09)는 전부
`IS_PRIMARY_NECK` **하나로만** 게이트된다 — `NECK_QUESTIONS`가 쓰는
게이트 함수와 정확히 동일한 함수를 그대로 재사용한다(다른 이름의
동일 조건이 아니라 **같은 함수 참조**). 이는 우연이 아니라 F1을 코드
구조적으로 보장하는 방법이다 — SH01-05와 NECK_01-05가 서로 다른
조건으로 갈라질 여지 자체가 없다.

**payload 계산**: `safety_flags.shoulder`와 `modules.shoulder`도
`primary_module_detail === 'SHOULDER'`가 아니라 `IS_PRIMARY_NECK(r)`로
게이트된다(coreSpec.ts). NS01 값과 무관하게 `neck_shoulder` 환자 전원의
shoulder safety가 항상 계산된다.

**태깅만 NS01이 결정**: `buildRoutingPayload`의 `primary_module_detail`
만 NS01을 읽는다 — `SHOULDER_DOMINANT`→`'SHOULDER'`, 나머지
(`NECK_DOMINANT`/`SIMILAR`/`UNKNOWN`/미답변)는 전부 `'NECK'`로
기본값 처리한다. 이 기본값 선택 덕분에, SHOULDER_V1 도입 전부터 존재하던
NECK fixture/테스트는 NS01을 전혀 몰라도 동일한 `'NECK'` 태그를 그대로
받는다 — 순수 상위집합(strict superset), 기존 시나리오에 회귀 없음.

**Doctor View 게이트 수정(필수 common-part touch)**: `NeckSafetyPanel`과
`primaryModuleFields`의 NECK 필드 포함 조건이 원래
`primary_module_detail === 'NECK'`였다. SHOULDER 도입 후 이 조건을 그대로
두면 `SHOULDER_DOMINANT`로 태깅된 환자의 canonical NECK 안전 정보가
Doctor View에서 사라진다 — F1이 막으려던 결함이 UI 레벨에서 재발한다.
그래서 게이트를 `safety_flags.neck !== null`(및 `m.pain.primary_location
=== 'neck_shoulder'`)로 바꿨다. **회귀 영향**: 기존 NECK-only
시나리오에서는 `safety_flags.neck !== null ⟺ primary_module_detail ===
'NECK'`가 항상 성립했으므로 동작이 완전히 동일하고, SHOULDER_DOMINANT
환자에서만 추가로 렌더링된다(순수 additive) — `tests/doctor.spec.mjs`의
기존 NECK fixture 검증(2d)이 그대로 통과하는 것으로 실측 확인했다.

**회귀 테스트**: `tests/integration.spec.mjs` L 섹션이 NS01의 4개
값(`NECK_DOMINANT`/`SHOULDER_DOMINANT`/`SIMILAR`/`UNKNOWN`) **각각**에
대해 SH02(어깨 응급)와 NECK_03B(경추 응급)를 동시에 양성으로 설정하고,
`safety_flags.shoulder`/`safety_flags.neck`가 매번 URGENT_REVIEW로
남아있는지 직접 검증한다(30 assertions) — 사용자가 명시적으로 요구한
바로 그 회귀 테스트다.

---

## 4. NECK logic을 어떻게 직접 재사용했는지

`shoulderAdapter.ts`의 `toShoulderState`/`toShoulderStateFromDoctorPayload`가
`neckAdapter.ts`에서 **값으로 import**한 `toNeckState`/
`toNeckStateFromDoctorPayload`와 `neckLogic.ts`에서 값으로 import한
`computeNeckFlags`를 그대로 호출하고, 그 결과의 `.neck_safety_status`만
꺼내 `ShoulderState.neck_safety_status`에 채운다:

```ts
const neckFlags = computeNeckFlags(toNeckState(r, repro))
return { ...SH0x raw fields..., neck_safety_status: neckFlags.neck_safety_status, ... }
```

`shoulderLogic.ts`의 엔진(§10 rule 1)은 이 값을 다른 입력과 똑같이
소비할 뿐이다 — NECK_01-05의 enum·threshold·fail-closed 규칙이 어디에도
다시 쓰여 있지 않다. `tests/shoulder.spec.mjs`의 "CANONICAL REUSE" 3개
테스트가 이를 직접 증명한다: 실제 `NECK_03B: 'YES'`(thunderclap) Responses를
`toShoulderState`에 넣으면 진짜 NECK 엔진이 실행되어
`neck_safety_status === 'URGENT_REVIEW'`가 나오고, 이게 shoulder 엔진의
최종 상태까지 그대로 전파되는 것을 확인한다.

---

## 5. CLOSED spec 핵심 규칙 → 코드 위치 → 테스트 매핑

| §v0.1.1 규칙 | 코드 위치 | 테스트 |
|---|---|---|
| §1 F1: NS01은 safety 노출을 게이트하지 않음 | `coreSpec.ts` SHOULDER_QUESTIONS 전부 `IS_PRIMARY_NECK` 단일 게이트 | `integration.spec.mjs` L1-L5 (30) |
| §2 canonical NECK 직접 재사용, 사본 금지 | `shoulderAdapter.ts`의 `toNeckState`/`computeNeckFlags` 직접 호출 | `shoulder.spec.mjs` CANONICAL REUSE ×3 |
| §3 SH01: YES/UNKNOWN/missing, F3 비승격 | `shoulderLogic.ts::sh01Status` | `shoulder.spec.mjs` F3 + SH01 UNKNOWN/missing (3) |
| §3 SH02: hard(urgent)/soft(review)/UNKNOWN/malformed/not-shown | `shoulderLogic.ts::sh02Status` | `shoulder.spec.mjs` SH02 ×7 |
| §3 SH03: URGENT 자동승격 금지, expedited_referral_consider | `shoulderLogic.ts::sh03Status`/`expeditedReferralConsider` | `shoulder.spec.mjs` SH03 ×5 |
| §3 SH04 감염 → URGENT_REVIEW | `shoulderLogic.ts::sh04Status` | `shoulder.spec.mjs` SH04 ×3, `integration.spec.mjs` M2 |
| §3 SH05 F2(움직임-무관 AND 조건 없음) → URGENT_REVIEW | `coreSpec.ts` SH05 문항 문구(단일 조건), `shoulderLogic.ts::sh05Status` | `shoulder.spec.mjs` SH05 ×3, `integration.spec.mjs` M3 |
| §4 SH06 bilateral → CONSIDER only, 안전 미승격 | `shoulderLogic.ts::computeShoulderFlags`의 `pmr_or_systemic_inflammatory_pattern_consider` | `shoulder.spec.mjs` SH06 ×2 |
| §9 C1: enum 분리 유지 | (SHOULDER는 §9 hypothesis enum을 코드에서 아직 계산하지 않음 — §7 확인) | — |
| §10 URGENT_REVIEW 6개 disjunct(canonical NECK 포함) | `shoulderLogic.ts::shoulderSafetyStatus` | `shoulder.spec.mjs` 전체 + `integration.spec.mjs` M1/M4 |
| §10 F3: SH01 YES 단독 비승격 | `shoulderLogic.ts::sh01Status`(review:false when shown) | `shoulder.spec.mjs` F3 |
| §11 expedited_referral_consider(3개 트리거, 4번째 status 아님) | `shoulderLogic.ts::expeditedReferralConsider`, `judgment.ts`/`JudgmentPanel.tsx`(임상 3번째 트리거) | `shoulder.spec.mjs` expedited ×2 + clinician override, `doctor.spec.mjs` 2e |
| §12 disease-safety lock (운동+도수 모두, HVLA 전용 도메인 없음) | `shoulderLogic.ts::shoulderSafetyLocked`(단일 lock, NECK의 이중 lock과 의도적으로 다름) | `shoulder.spec.mjs` locks ×3 |
| §10 실시간 URGENT interrupt (SH02/SH04/SH05, canonical NECK은 기존 트리거가 이미 커버) | `coreSpec.ts` STAFF_CHECK_TRIGGERS.SH02/SH04/SH05 | `integration.spec.mjs` M1-M5 (9) |

---

## 6. §7 Suggested Exam Selector 구현 노트 (비차단)

v0.1.1 §7은 검사 목록은 주지만 정확한 firing 조건은 남겨둔다(NECK_V1의
NB6와 동일한 성격). 구현 시점에 다음으로 확정했다:
- Base(목표기능/AROM/PROM/근력): `shoulder_safety_status === 'CLEAR'`일 때만
- 외상+주요 기능소실: `SH01=YES && (SH02 hard positive || SH03 in [YES,UNKNOWN])`
- 불안정성: `SH09 === 'YES'`

**"Global passive restriction"(frozen shoulder/OA 감별)과 "focal
AC/local"은 자동 제안하지 않는다** — v0.1.1 §6 자체가 이 둘을 "Tablet에서
묻지 않음"으로 분류했고, 태블릿에서 계산 가능한 명확한 trigger가 정의돼
있지 않기 때문이다. "Distal neuro/neck-linked" 카테고리도 자동 제안에서
제외했다 — `NeckSafetyPanel`이 canonical NECK 데이터로 이미 자체 권장
검사를 제공하므로 중복 표시하지 않는다.

---

## 7. LBP_V1 / NECK_V1 회귀 결과

```
npm run test:lbp     — 46 passed, 0 failed  (변경 전과 동일 — 회귀 0)
npm run test:neck    — 81 passed, 0 failed  (변경 전과 동일 — 회귀 0)
```

`lbpLogic.ts`/`lbpAdapter.ts`/`neckLogic.ts`/`neckAdapter.ts`는 이번
통합에서 단 한 바이트도 수정하지 않았다. `git diff`로 확인 가능.

공통부(coreSpec.ts/DoctorView.tsx/judgment.ts/JudgmentPanel.tsx/
fixtures.ts) 수정은 전부 §3/§4/§8에서 근거와 회귀영향을 명시했다.

---

## 8. 최종 회귀 결과 (실제 실행, 2026-08-25)

```
npx tsc -b --force   — OK, 0 errors
npm run build        — OK (tsc -b && vite build, 115 modules)
npm run test:all     — OK, 0 failed
  test:integration      513 assertions passed (474 기존 + 30 L섹션 + 9 M섹션)
  test:layout             7 assertions passed (135 screens, 4 allowlisted
                           -- SHOULDER_V1의 11개 신규 문항 전부 레이아웃
                           예산 내, 새 allowlist 불필요)
  test:saju               93 assertions passed
  test:doctor            240 assertions passed (기존 216 + SHOULDER
                           fixture 2e 블록 24)
  test:server            174 assertions passed
  test:recorderResults    19 assertions passed
  test:patient            46 assertions passed
  test:emrSummary         14 assertions passed
  test:doctorToken         5 assertions passed
  test:lbp                46 assertions passed (LBP_V1 회귀 -- 무변경)
  test:neck                81 assertions passed (NECK_V1 회귀 -- 무변경)
  test:shoulder            38 assertions passed (신규)
합계: 1276 assertions passed, 0 failed
```

---

## 9. 의도적으로 보류한 항목

- `exercise_recommender_contract`(순위 매긴 운동 추천 + 원장 승인) —
  LBP_V1/NECK_V1과 동일한 이유로 v1 범위 제외. fail-closed lock만 구현.
- SHOULDER 자체 treatment-safety engine — v0.1.1 §12 자체의 v1 범위
  결정(§2 참고). 기존 공통 치료안전 계층 미구현 상태는 이 통합의
  범위 밖.
- §9 hypothesis enum(`RC_RELATED_SHOULDER_PAIN`,
  `FROZEN_SHOULDER_PATTERN` 등) 자동 계산 — v0.1.1 §6이 이들을
  원장 진찰 기반(AROM/PROM/강도/특수검사)으로 명시했고, 태블릿 데이터만으로
  patient-facing hypothesis를 만들지 않는다는 이 시리즈 전체의 원칙과
  일치한다. Doctor View에 "현재 고려" 섹션 텍스트 생성은 아직 구현하지
  않았다 — LBP/NECK도 이 부분은 안전 판정/권장검사까지만 자동화하고
  "현재 고려" 자유서술은 원장 판단(JudgmentPanel) 영역으로 남겨둔 것과
  동일한 선택.
- SHOULDER 문항군의 응답시간(fatigue) P90 실측 검증 — LBP/NECK과 동일하게
  이 앱엔 타이밍 시뮬레이션 인프라가 없다. v0.1.1 §16의 synthetic 추정치
  (module P90 ~107s)는 재검증되지 않았다.
- radicular_support류의 (N07×N09) 전사 매핑 미비(NECK_V1 NB2)는 이번
  통합과 무관 — SHOULDER는 별도 방사통 분류 필드가 없다.

---

## 10. 결론

10개 필수 계약(사용자 지시 1-10) 전부 코드 레벨에서 확인:

1. ✅ NS01은 `PAIN_01 === 'neck_shoulder'`에서 primary/secondary 태깅에만 사용(§3)
2. ✅ NS01 4값 어디서도 safety 노출을 게이트하지 않음(§3, L섹션 30 assertions)
3. ✅ SH01-05는 모든 `neck_shoulder` 환자에게 보장(§3, `IS_PRIMARY_NECK` 단일 게이트)
4. ✅ canonical NECK을 사본 없이 직접 재사용(§4, `toNeckState`/`computeNeckFlags` 직접 호출)
5. ✅ SH05에 "움직임 무관" AND 조건 추가하지 않음(coreSpec.ts SH05 문항 = v0.1.1 §3 F2 문구 그대로)
6. ✅ acute traumatic cuff concern = REVIEW_REQUIRED + expedited_referral_consider, URGENT 아님(F3, §5 표)
7. ✅ infection/unreduced dislocation/neurovascular/cardiac = URGENT_REVIEW(§5 표, M1-M3)
8. ✅ SH01 단독 YES는 SH02/SH03 clean이면 자동 REVIEW 안 됨(F3 그대로 유지, `shoulder.spec.mjs` F3 테스트)
9. ✅ LBP_V1/NECK_V1 무변경, 공통부 수정은 전부 근거·회귀영향 명시(§3/§7, 46/46·81/81 무회귀)
10. ✅ SHOULDER 조건문은 module boundary(coreSpec.ts의 정해진 통합 지점, DoctorView.tsx의 전용 컴포넌트)에만 위치, Core 곳곳에 흩뿌리지 않음

전체 typecheck/build/test 전부 성공, LBP/NECK 회귀 0, SHOULDER 자체
회귀 113개(엔진 38 + adapter 포함 + 통합 47 + doctor fixture 24 + 4)
전부 통과.

> ## **SHOULDER_V1: PASS / FROZEN**

다음 계획된 모듈이 있다면 동일한 2-레이어(literal port + adapter) +
"canonical safety 직접 재사용" 패턴을 이어갈 수 있다.
