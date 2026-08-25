# LBP_V1 — 실제 repo 통합 결과

작성일: 2026-08-24
상태: **LBP_V1: PASS / FROZEN**

이 문서는 `LBP_v1.4_임상결정_마감본.md`(임상결정 CLOSED)와
`Claude_Code_LBP_실제통합_지시서.md`의 지시에 따라, `tablet core/` 안의
Python/YAML 참조 구현(`lbp_logic.py`, `lbp_v1.0.yaml`,
`tests/test_lbp_logic.py`)을 이 실제 React/TypeScript repo에 통합한 결과를
기록한다. 통합 설계 근거와 Opus 검토 전문은 세션 기록에 있다(요약은
아래 "설계 결정" 절 참고).

## 구현 위치

- `src/spec/lbpLogic.ts` — `lbp_logic.py`의 리터럴(1:1) 포트. 필드명/enum
  값이 Python과 동일하다. `tests/test_lbp_logic.py`의 23개 회귀 항목이
  이 레이어를 대상으로 그대로 이식되어 있다.
- `src/spec/lbpAdapter.ts` — 실제 앱의 `Responses`(태블릿 흐름 중) /
  `DoctorPayload['responses']`(제출 후, Doctor View)를 `LbpState`로
  변환하는 어댑터. enum 대소문자 매핑, `null`→MISSING 계약, 임신 상태
  매핑 등 번역 위험이 전부 이 레이어에 격리되어 있고 별도로 테스트된다.
- `src/lib/age.ts` — `BIRTH_01/02`에서 나이 계산(음력 미변환 알려진 한계는
  파일 주석 참고 — 안전 lock에 영향 없음).
- `src/spec/coreSpec.ts` — `LBP_QUESTIONS`(LBP_01~14, `IS_PRIMARY_LBP`
  게이트), `HISTORY_01`에 `osteoporosis` 옵션 추가, `STAFF_CHECK_TRIGGERS`에
  `LBP_04` 응급값 인터럽트 추가, `buildRoutingPayload`에
  `primary_module_detail`, `buildResponsePayload`에 `modules.lbp` +
  `safety_flags.lbp`.
- `src/doctor/judgment.ts` / `JudgmentPanel.tsx` — 원장이 진찰 후 입력하는
  `lbp_objective_motor_deficit`(객관적 하지 근력저하) 3지선다. 기존
  judgment 저장 경로를 그대로 재사용 — 별도 저장 메커니즘 없음.
- `src/doctor/DoctorView.tsx` — `LbpSafetyPanel`(안전 확인/치료 안전/
  신경근성 증상 가능성/추가 권장 검사 카드), `primary_module`은 `'Pain'`
  그대로 유지(재사용하지 않음 — Opus 리뷰 S9).
- `src/types.ts`, `src/components/NumericScale.tsx`,
  `src/screens/QuestionScreen.tsx`, `src/styles.css` — `numeric_scale`
  입력 타입(LBP_12) 추가.
- `tests/lbp.spec.mjs` — 23개 항목 + 어댑터 회귀(46 assertions).
- `src/doctor/fixtures.ts` + `tests/doctor.spec.mjs` — LBP primary-pain
  fixture 1개(+19 assertions) — 이전에는 pain 주호소 fixture가 하나도
  없었다.
- `tests/integration.spec.mjs`, `tests/layout-budget.spec.mjs` — 기존
  회귀(STAFF_CHECK_TRIGGERS 키 목록, LBP_11 레이아웃 예산 allowlist)를
  새 동작에 맞게 갱신.

## 설계 결정 (실제 repo 구조에 맞춘 최소 변경)

1. **진입 게이트**: MSK 도메인/영역 라우팅 레이어가 이 앱에 없어
   `PAIN_01 === 'low_back_pelvis'`를 LBP 트리거로 직접 사용한다(허리·골반
   단일 선택지 — 의도적 최소범위, 문서화됨).
2. **CES 응급 인터럽트**: 사용자 확정 결정(2026-08-24) — `LBP_04`의 응급
   값(요폐/대소변 조절장애/안장부 감각이상/급속 진행 마비/성기능 급변)은
   기존 `SAFETY_01`/`GI_03`/`BOWEL_03`과 동일하게 즉시 StaffCheckScreen
   인터럽트로 연결했다. 비응급 red flag(LBP_05)/외상(LBP_06)은 MS_05
   선례와 동일하게 인터럽트 없이 flag만 남긴다.
3. **나이 가용성**: `BIRTH_01/02`가 LBP 문항보다 뒤에 나오므로, 문진
   중에는 나이를 알 수 없다. 실시간 인터럽트(LBP_04만)는 나이가 필요
   없으므로 영향 없음. 전체 `lbp_safety_status`/`treatment_safety_status`는
   제출 완료 시점 / Doctor View에서만 계산한다(문진 도중의 "현재 상태"는
   의미 없음 — 코드 주석에 명시).
4. **HISTORY_01 확장**: `osteoporosis` 옵션 1개 순수 추가(결정 §3-4에서
   요구).
5. **`primary_module`은 `'Pain'` 그대로**: DoctorView가 `'Pain'` 리터럴로
   여러 곳을 분기하므로 재사용하지 않고, 추가적인
   `primary_module_detail: 'LBP' | null`을 신설했다.
6. **운동 추천 UI(exercise_recommender_contract)는 v1 범위 제외**:
   원장 입력 3종(irritability/movement_response/neuro_status)이 전혀
   구현되지 않았고, `target_function` 대리 지표가 계약을 충실히
   만족시키지 못하기 때문. v1은 **fail-closed lock**(routine 운동/치료
   추천 숨김·비활성화)만 구현한다 — 이게 결정 §9/checklist 17·18의 실제
   요구사항이다. 코드에 `TODO(LBP_V2)` 표시.
7. **Sigma 외부노트(SOAP C/C·O/S·S·O·A·P) 코드 재라벨링은 보류**:
   기존 `emrSummary.ts`가 이미 전체 주호소 공통으로 쓰이는 유사한
   템플릿(주호소/경과/주요 문진/진찰 소견/Assessment/치료·처방/계획)을
   갖고 있고, 이건 `emrSummary.spec.mjs`(14 assertions)로 이미 잘
   테스트되어 있다. 결정 §10의 정확한 SOAP 코드로 relabel하려면 모든
   주호소에 영향을 주는 공유 템플릿을 건드려야 해서, 안전 게이트와
   무관한 이 변경은 별도 후속 작업으로 남긴다.

## 23개 회귀 체크리스트 → 실제 테스트 매핑 (§11)

| # | 항목 | 테스트 |
|---|---|---|
| 1 | CES positive → URGENT_REVIEW | `tests/lbp.spec.mjs` item1 |
| 2 | CES UNKNOWN → never CLEAR | item2 |
| 3 | CES missing → never CLEAR | item3 |
| 4 | `[]`/malformed/NONE+UNKNOWN/NONE+positive → never CLEAR | item4 |
| 5 | bilateral + concrete neuro → REVIEW_REQUIRED | item5 + `fixtures.ts`/`doctor.spec.mjs` LBP fixture |
| 6 | bilateral pain only → no auto urgent, neuro baseline required | item6 |
| 7 | objective severe/progressive motor deficit → URGENT_REVIEW | item7 (+ independent-of-CES test) |
| 8 | trauma reachable regardless of onset (이 앱엔 onset_pattern 없음 — LBP_06만으로 커버) | item8 (yes/missing/unknown) |
| 9 | unexplained weight loss YES/UNKNOWN → review | item9 |
| 10 | infection/procedure risk YES/UNKNOWN → review | item10 |
| 11 | age alone → no automatic review | item11 + age modifier threshold test |
| 12 | inflammatory UNKNOWN → never NO | item12 + boundary test |
| 13 | formal NG65 count removed | item13 (export 존재하지 않음 확인) |
| 14 | pregnancy F/OTHER/UNKNOWN age 10–55 reachable | item14 + S4 adapter test |
| 15 | pregnancy M skip | item15 |
| 16 | pregnancy → treatment safety, not disease safety | item16 |
| 17 | `lbp_safety_status != CLEAR` → 실제 UI/recommender lock | item17 + `doctor.spec.mjs` lock-note 렌더 확인 |
| 18 | missing safety state → lock (unlock 아님) | item18 (`lbp_safety_status`는 항상 구체값을 반환하도록 설계되어, "undefined 상태" UI 케이스 자체가 구조적으로 발생하지 않음) |
| 19 | patient-facing diagnosis/probability 없음 | `doctor.spec.mjs` LBP fixture 진단어 누출 검사 + 기존 `test:patient` raw-payload 비노출 검사 |
| 20 | single-test diagnosis confirmation 없음 | Suggested Exam 카드가 SIJ/hip cluster 등 "원장 의심 시에만" 항목은 자동 제안하지 않도록 설계(데이터만으로 확정 불가한 항목 제외) |
| 21 | LBP P90 ≤180s | **미커버 — 이 앱엔 어떤 모듈에도 응답시간 시뮬레이션 인프라가 없다**(tablet-core의 Python Monte-Carlo 시뮬레이터에 해당하는 것 없음). LBP만을 위해 새 인프라를 만드는 건 이번 통합 범위를 넘어선다고 판단 — 후속 과제로 남김 |
| 22 | safety-critical omission = 0 | 위 1~20 항목의 집합 결과 |
| 23 | 기존 Core/Tablet/Doctor/MENOPAUSE 회귀 = 0 | 전체 `npm run test:all`(아래 결과) |

## 최종 회귀 결과 (실제 실행, 2026-08-24)

```
npm install         — OK (70 packages)
npx tsc -b           — OK, 0 errors
npm run build        — OK (tsc -b && vite build)
npm run test:all     — OK, 0 failed
  test:integration      474 assertions passed
  test:layout             7 assertions passed (109 screens, 4 allowlisted for inner scroll)
  test:saju               93 assertions passed
  test:doctor            193 assertions passed
  test:server            174 assertions passed
  test:recorderResults    19 assertions passed
  test:patient            46 assertions passed
  test:emrSummary         14 assertions passed
  test:doctorToken         5 assertions passed
  test:lbp                46 assertions passed (23-item port + adapter)
합계: 1071 assertions passed, 0 failed
```

## 알려진 후속 과제 (freeze를 막지 않음)

- Sigma SOAP 코드(C/C·O/S·S·O·A·P) 정확한 relabel — 위 결정 7 참고.
- `exercise_recommender_contract`(순위 매긴 운동 추천 + 원장 승인) — 위
  결정 6 참고.
- LBP 문항군의 P90 ≤180s 응답시간 검증 인프라 — 위 checklist 21 참고.
- `src/lib/age.ts`의 음력 생년월일 미변환(±최대 약 1개월 오차, 안전
  lock에는 영향 없음) — `src/saju`의 manseryeok 기반 변환 재사용 권장.

## 결론

> **LBP_V1: PASS / FROZEN**

다음 신규 MSK module: **NECK_V1** (`branch_rules_v1.4.yaml`의
`module_contracts`에 `planned` 상태로 이미 정의되어 있음).
