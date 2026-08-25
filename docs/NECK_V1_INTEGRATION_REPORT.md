# NECK_V1 — 실제 repo 통합 결과

작성일: 2026-08-25
상태: **NECK_V1: PASS / FROZEN**

이 문서는 `NECK_V1_Tablet_Question_Set_v0.2.1_CLOSED.md`(CLINICAL DECISIONS
CLOSED — Opus v0.1 검수 → v0.2 개정 → Opus v0.2 재검수 PASS + erratum
E1/E2 반영)의 지시에 따라, 이 실제 React/TypeScript repo에 NECK_V1을
통합한 결과를 기록한다. LBP_V1과 동일한 2-레이어(literal port + adapter)
설계를 그대로 재사용했다.

## 임상결정 경로 (요약)

```
Evidence Matrix v0.2 (HANDOFF)
→ Tablet Question Set v0.1
→ Opus 임상검수 (docs/NECK_V1_Opus_Clinical_Review_v0.1.md)
  → CLINICAL DECISION REQUIRED (필수 7건: D1/D2/D3/D4/D8/D9/D10)
→ v0.2 (D1-D11 전부 반영)
→ Opus 재검수 (docs/NECK_V1_Opus_Clinical_Review_v0.2.md)
  → PASS 조건부 (erratum E1: N10A 게이트 fail-open / E2: N04 soft
    escalation의 invalid 순서 역전 — 둘 다 새 임상판단 없이 CLOSED
    결정을 문서 자신의 invariant에 맞게 교정하는 기계적 수정)
→ v0.2.1 CLOSED (docs/NECK_V1_Tablet_Question_Set_v0.2.1_CLOSED.md)
→ 이 통합/구현 (오늘)
→ 전체 회귀 PASS
```

## 구현 위치

- `src/spec/neckLogic.ts` — v0.2.1 §5(Disease Safety Engine)/§6(Treatment
  Safety)/§7(Intervention Locks)의 리터럴 포트. LBP_V1과 달리 원본 Python
  구현이 없으므로, CLOSED 마크다운 스펙 자체가 포트의 ground truth다.
  E1(N10A `[YES, UNKNOWN]` 게이트)·E2(N04 soft-tier 조건을 `NOT
  N03A_is_valid_negative` 부정형 술어로 재기술)를 코드 레벨에서 그대로
  반영했다.
- `src/spec/neckAdapter.ts` — 실제 앱의 `Responses`(태블릿 흐름 중) /
  `DoctorPayload['responses']`(제출 후, Doctor View)를 `NeckState`로
  변환하는 어댑터. enum 대소문자 매핑, onset_bucket/의약품/기왕력
  카테고리 매핑, 임신 상태 매핑이 모두 이 레이어에 격리되어 별도로
  테스트된다. `mapOnsetBucket`/`mapPregnancyStatus`/`mapPatientSex`는
  lbpAdapter.ts의 동일 로직을 의도적으로 중복 구현했다 — 각 모듈이 서로의
  내부 구현에 의존하지 않는 독립 포트를 유지하는 이 repo의 기존 관례를
  그대로 따른 것(neckLogic.ts/neckAdapter.ts 파일 상단 주석 참고).
- `src/spec/coreSpec.ts` — `NECK_QUESTIONS`(NECK_01~12 + NECK_02A/03A/
  03B/10A, `IS_PRIMARY_NECK` 게이트), `STAFF_CHECK_TRIGGERS`에 URGENT_REVIEW
  4개 지점(NECK_02/NECK_02A/NECK_03B/NECK_04) 실시간 인터럽트 추가,
  `buildRoutingPayload`의 `primary_module_detail`에 `'NECK'` 추가,
  `buildResponsePayload`에 `modules.neck` + `safety_flags.neck`.
- `src/doctor/DoctorView.tsx` — `NeckSafetyPanel`(질환 안전/치료 안전/
  방사통 지지도/신경학적 기저검사 필요/경인성 두통 패턴/자세 조절 저하
  카드, 조작(HVLA/추나/견인) lock을 운동 lock과 별도 문구로 명시 —
  D8), `primaryModuleFields`의 `'Pain'` case에 NECK 14개 필드 추가.
  LBP와 달리 원장 진찰 입력(clinician judgment)이 disease safety 계산에
  전혀 필요 없어 JudgmentPanel/judgment.ts는 건드리지 않았다 — v0.2.1
  §5가 순수하게 환자 응답 + Core reuse만으로 계산되기 때문(§15 재검수
  질문 5의 답이기도 하다).
- `tests/neck.spec.mjs` — Disease Safety Engine 전체 규칙(URGENT/REVIEW/
  CLEAR 각 경로) + E1/E2 명시적 회귀 케이스 + Treatment Safety 3개 도메인
  + Intervention Lock 3종 진리표 + radicular_support 7개 분기 +
  neuro_baseline_required + adapter(enum/onset/기왕력/의약품/임신 매핑)
  — 81 assertions.
- `src/doctor/fixtures.ts` + `tests/doctor.spec.mjs` — NECK primary-pain
  fixture 1개(+23 assertions) — REVIEW_REQUIRED(비응급) 경로, HAND_FINGERS+
  PARESTHESIA로 radicular_support HIGHER_SUPPORT, N11=YES로 경인성 두통
  패턴, D8 조작 lock 문구가 LBP의 운동/치료 lock 문구와 구별되는지까지
  확인.
- `tests/integration.spec.mjs` — `STAFF_CHECK_TRIGGERS` 키 목록 회귀를
  NECK 4개 인터럽트 지점 포함하도록 갱신(I1).

## 설계 결정 (실제 repo 구조에 맞춘 최소 변경)

1. **진입 게이트**: LBP_V1과 동일하게 MSK 도메인/영역 라우팅 레이어가
   없어 `PAIN_01 === 'neck_shoulder'`를 NECK 트리거로 직접 사용한다(목·
   어깨 단일 선택지 — `IS_PRIMARY_LBP`가 허리·골반을 합친 것과 동일한
   의도적 최소범위 결정, 문서화됨).
2. **URGENT_REVIEW 실시간 인터럽트 — 4개 지점**: v0.2.1 §5에서
   URGENT_REVIEW는 N02(급속 진행 마비/방광·직장 조절 변화)·N02A
   (WORSENING)·N03B(thunderclap 두통)·N04(hard-tier 단독 또는 soft-tier +
   N03A not-valid-negative) 중 어디서든 확정될 수 있다. 각 지점을 손으로
   부분 재구현하는 대신, 해당 화면 제출 직후 `computeNeckFlags(toNeckState(...))`
   전체를 재계산해 `neck_safety_status === 'URGENT_REVIEW'`일 때만
   인터럽트하도록 통일했다 — 엔진과의 drift가 구조적으로 불가능하다.
   REVIEW_REQUIRED(비응급, 예: N01 외상 단독)는 LBP_05/06과 동일하게
   flag만 남기고 인터럽트하지 않는다.
3. **Core reuse는 "OR-only" 원칙으로 구현**: v0.2.1 D9/N05가 요구하는
   item-level reuse 계약을, N05를 항상 전체 질문하는 대신(LBP_05와 동일한
   최소범위 선택) Core의 `major_history_categories`에 `CANCER`가 확인되면
   N05 자체 응답과 무관하게 review를 OR로 추가하는 방식으로 구현했다.
   이렇게 하면 generic negative(`HISTORY_01=['none']`)를 N05 전체의
   명시적 부정으로 확대해석하는 사고가 코드 구조상 발생할 수 없다 —
   Core에서는 오직 확인된 양성만 추가로 들어올 뿐, 결코 응답을 생략하거나
   음성을 대신 채우지 않는다.
4. **Treatment Safety는 3개 독립 도메인의 OR**: 의약품(항응고제)·
   기왕력(골다공증/출혈질환)·임신 세 도메인 중 하나라도 REVIEW면 전체
   REVIEW_REQUIRED. `MED_TYPES`가 선택 사항(optional)이라는 이 앱의 실제
   제약을 반영해, `MED_USE=='yes'`인데 `MED_TYPES`가 비어있으면 항응고제
   여부를 판단할 수 없으므로 fail-closed(review)로 처리한다 — LBP_V1의
   `major_history_present==='YES' && categories===undefined` 패턴과
   동일한 구조.
5. **`primary_module`은 `'Pain'` 그대로, `primary_module_detail`만
   `'NECK'`**: LBP와 동일한 이유(DoctorView가 `'Pain'` 리터럴로 여러 곳을
   분기, Opus review S9). `IS_PRIMARY_LBP`와 `IS_PRIMARY_NECK`은
   `PAIN_01`이 single_choice라 항상 상호 배타적이다.
6. **조작(HVLA/추나/견인) lock을 운동 lock과 명시적으로 분리(D8)**:
   `neckDiseaseSafetyLocked`(질환 안전 비-CLEAR → 운동 추천 + 조작 모두
   lock)와 `neckTreatmentSafetyLocked`(치료 안전 비-CLEAR → 조작만 lock,
   운동은 그대로)를 별도 함수로 구현하고, `neckManipulationLocked = 질환
   안전 lock OR 치료 안전 lock`으로 둘을 합성했다. Doctor View에서
   두 lock의 UI 문구도 서로 다르게 렌더링해, "조작이 운동보다 우선
   잠긴다"는 v0.2.1 §7 원칙이 코드와 화면 양쪽에서 확인 가능하다.
7. **운동 추천 UI(exercise_recommender_contract)는 v1 범위 제외**:
   LBP_V1과 동일한 판단 — 원장 입력 3종(irritability/movement_response/
   endurance-control)이 구현되어 있지 않다. v1은 fail-closed lock만
   구현하고 `TODO(NECK_V2)`로 표시했다.
8. **§8 Suggested Exam Selector의 발화 조건은 v0.2.1 NB6에서 구현 시점에
   확정하도록 남겨둔 것을, 미분류로 얼버무리지 않고 이 통합에서 확정**:
   uncomplicated(safety CLEAR일 때만, LBP_V1과 동일한 선택) / distal
   arm·neuro(N07 원위부 또는 N09 concrete positive) / cord concern(N02
   concrete positive 또는 N02A WORSENING) / headache(N10 YES) /
   shoulder-dominant(N07 SHOULDER_UPPER_ARM + N09 정확히 NONE) /
   sustained posture(N12 YES). 코드의 `suggestedNeckExamCodes`에
   이 조건 그대로 반영되어 있다.

## v0.2.1 §5-7 → 테스트 매핑 (핵심 규칙 전체 커버리지)

| 영역 | 테스트 |
|---|---|
| N01 외상 YES/UNKNOWN/missing → REVIEW, 단독 URGENT 금지 | `tests/neck.spec.mjs` N01 3건 |
| N02 urgent 2값/other concrete/UNKNOWN/missing/malformed | N02 6건 |
| N02A WORSENING→URGENT, STABLE/IMPROVING/UNKNOWN→REVIEW, 이미-urgent 유지, N02 미해당 시 미평가 | N02A 4건 |
| N03A/N03B 분리(D3), 목통증 단독 URGENT 금지, thunderclap 단독 URGENT | N03A 2건 + N03B 3건 |
| N04 hard 단독 URGENT, soft+N03A(YES/UNKNOWN/**invalid**) URGENT, soft+valid-NO REVIEW, UNKNOWN/missing/malformed | N04 8건 (E2 명시 회귀 포함) |
| N05 concrete positive/UNKNOWN/missing, **D9 Core-reuse CANCER OR**(및 무관 카테고리는 강제하지 않음 대조군) | N05 5건 |
| N10 NO→N10A 미적용, **E1 회귀**(UNKNOWN+N10A missing→REVIEW), YES+YES/NO/UNKNOWN | N10/N10A 5건 |
| Treatment Safety 3도메인(의약품/기왕력/임신) 개별 REVIEW·CLEAR, 도메인 독립성 | 13건 |
| disease/treatment safety 상호 독립성 | 2건 |
| Intervention Lock 3종 진리표(전부 clear/질환만/치료만) | 3건 |
| radicular_support 7개 분기(HIGHER/CONSIDER×2/LOWER/UNDETERMINED×3) | 9건 |
| neuro_baseline_required(N02/N09 소스별) | 3건 |
| adapter: enum 매핑/기왕력 카테고리/의약품 카테고리/onset_bucket/임신 상태 | S1-S5 14건 |
| **합계** | **81 assertions (`npm run test:neck`)** |
| Doctor fixture 통합(REVIEW_REQUIRED 실사례, D8 lock 문구 구별, 진단어 비노출) | `tests/doctor.spec.mjs` +23 assertions |

## 최종 회귀 결과 (실제 실행, 2026-08-25)

```
npx tsc -b --force   — OK, 0 errors
npm run build        — OK (tsc -b && vite build, 113 modules)
npm run test:all     — OK, 0 failed
  test:integration      474 assertions passed
  test:layout             7 assertions passed (124 screens, 4 allowlisted
                           for inner scroll -- unchanged from LBP_V1
                           baseline; 모든 NECK 문항이 레이아웃 예산 내)
  test:saju               93 assertions passed
  test:doctor            216 assertions passed (LBP fixture 193 + NECK
                           fixture +23)
  test:server            174 assertions passed
  test:recorderResults    19 assertions passed
  test:patient            46 assertions passed
  test:emrSummary         14 assertions passed
  test:doctorToken         5 assertions passed
  test:lbp                46 assertions passed (LBP_V1 회귀 — 손대지 않음)
  test:neck                81 assertions passed (신규)
합계: 1175 assertions passed, 0 failed
```

## 알려진 후속 과제 (freeze를 막지 않음)

- `exercise_recommender_contract`(순위 매긴 운동 추천 + 원장 승인) — 위
  결정 7 참고. LBP_V1과 동일한 상태.
- Sigma SOAP 코드(C/C·O/S·S·O·A·P) 정확한 relabel — LBP_V1 보고서에서
  이미 지적된 공유 템플릿(`emrSummary.ts`) 이슈이며, NECK_V1도 동일하게
  범위 밖이다.
- NECK 문항군의 P90 ≤180s 응답시간 검증 인프라 — LBP_V1과 동일하게 이
  앱엔 어떤 모듈에도 응답시간 시뮬레이션 인프라가 없다. v0.2.1 §12는
  Opus의 synthetic 추정치(module P90 ~85s, Core+NECK P90 ~155s)를
  설계 목표로 제시했을 뿐 이 repo에서 재검증되지 않았다 — 후속 과제로
  남김(이미 v0.2.1 §12 자체가 이를 명시).
- `radicular_support`의 (N07 × N09) 매핑이 전사(total)가 아니다(NB2,
  neckLogic.ts 주석에 명시). 안전 엔진은 이 값을 소비하지 않으므로
  안전 영향은 없고, Doctor View에 `UNDETERMINED`로 정직하게 표시된다 —
  전사 매핑으로 확장하는 것은 선택적 후속 개선.
- N01의 age/osteoporosis modifier(v0.2.1 §3)는 stem이 이미 강도 무관하게
  낙상을 수집하므로 이번 구현에서 별도 분기를 만들지 않았다(NB4의
  명시적 지시). Doctor View에 별도 주석으로 노출하는 것은 후속 개선
  후보로 남김.

## 결론

> **NECK_V1: PASS / FROZEN**

두 번째 신규 MSK 모듈(LBP_V1에 이어)이며, 2-레이어(literal port +
adapter) 설계와 "실시간 URGENT 인터럽트 / 제출 후 전체 safety 재계산"
분리 패턴이 서로 다른 임상 도메인(허리 vs 목)에도 그대로 재사용 가능함을
확인했다. `branch_rules_v1.4.yaml`의 `module_contracts`에 다음 계획된
모듈이 있다면 동일 패턴으로 이어갈 수 있다.
