# 통증 전 부위 진료 프로세스 통일 계획 v0.1 — "부위 팩(Region Pack)" 구조

**상태**: PROPOSED — PO 결정 대기(§8 질문 5개). 코드 변경 0줄.
**PO 지시(2026-09-06)**: "통증은 모두 같은 계획 실행 부탁해" — 요통(LBP)에만 있는
진료 프로세스(확인 → 임상가설 → 치료 방향 → 운동 단계·추천 → 재평가 대상 →
재진 세부문진)를 목/어깨/무릎/고관절/발목·발/팔꿈치/손목·손/턱관절 8부위에도 적용.
**브랜치**: `claude/clinical-os-lbp-architecture-xym6po`.

---

## 0. 한 줄 결론

**코드는 부위 공통 엔진 하나로 합치고(요통이 첫 팩), 임상 내용은 부위별 "팩"으로
분리해 원장 승인 문서에서만 채운다.** 8부위를 요통 코드 복사로 만들지 않는다.
병목은 코드가 아니라 **부위별 임상 콘텐츠**(운동 목록·단계표·가설 패턴·검사 규칙)이며,
그 콘텐츠는 이 저장소 원칙상 원장이 승인한 것만 들어간다
(`docs/CLINICAL_OS_NORTH_STAR.md:100`).

---

## 1. 현재 상태 — 층(layer) × 부위

조사 기준: `src/spec/*Logic.ts`, `src/doctor/**`, `server/detailCheck.js`, `tablet core/`,
`docs/*_V1_*` (2026-09-06).

| 층 | 내용 | 요통 | 목 | 어깨 | 무릎 | 고관절 | 발목·발 | 팔꿈치 | 손목·손 | 턱관절 |
|---|---|---|---|---|---|---|---|---|---|---|
| L0 안전 판정 | `compute*Flags`, 안전 패널, 치료 잠금 | ● | ● | ● | ● | ● | ● | ● | ● | ● |
| L0' 검사 코드 목록 | 안전 패널 안의 "권장 검사" 라벨 목록 (결과 상태 없음) | ● | ● 21 | ● 9 | ● 16 | — | — | ● 16 | ● 11 | — |
| L1 검사 제안(결과 상태 포함) | `PhysicalExamSuggestion` 자동 생성 규칙 + 원장 추가 항목 | ● 4규칙+5 | — | — | — | — | — | — | — | — |
| L2 목표 기능 | `FollowUpTarget` 프리셋 (`lbp_tf_*` 9개) | ● | — | — | — | — | — | — | — | — |
| L3 임상가설 | 원장 선택 칩(패턴 × 지지수준), EMR A행·재진 이어받기·환자 문장 | ● 5패턴 | — | — | — | — | — | — | — | — |
| L4 운동 라이브러리 | 카탈로그 + Core 세트 메타데이터(시작 기준·용량·중단 기준) | ● 57/20 | — | — | — | — | — | — | — | — |
| L5 운동 단계 | 단계 제안(VISIT_04 축 + 부위별 격하) + 단계표 + 확정 카드 | ● 0~3 | — | — | — | — | — | — | — | — |
| L6 적격성 | 운동별 안전 게이트(신경 안정·원위 악화·방향성 반응) + 컨텍스트 | ● 20규칙 | — | — | — | — | — | — | — | — |
| L7 추천 조립 | 후보 카드·채택 문구·차단 사유 | ● | — | — | — | — | — | — | — | — |
| L8 세부문진 재질문 | 재검 시점 도달 시 초진 문항 재질문 id 집합 | ● 공통1+3 | 공통1 | 공통1 | 공통1 | 공통1 | 공통1 | 공통1 | 공통1 | 공통1 |
| 공통 흐름 | 레인 5개, 점프 내비, 재평가 대상, 재검 계획, micro follow-up, 치료 계획 링크, NRS 버튼 | ● | ● | ● | ● | ● | ● | ● | ● | ● |

관찰:
- **"같은 계획"의 절반 이상(공통 흐름 + L0)은 이미 전 부위 공유다.** 이번 작업 대상은
  L1~L8이다.
- L1~L8 요통 구현은 **모듈 11개, 테스트 9스위트 약 650단언, 전부 TS 하드코딩**이며
  원본은 원장 문서(`02_요통_Clinical_OS_임상설계_및_콘텐츠_라이브러리_v0.2.docx`,
  `docs/LBP_EXERCISE_LEVEL_DRAFT_v0.2.md`, `docs/LBP_EXERCISE_STAGE_ASSIGNMENT_v0.4.md`).
  런타임에 YAML을 읽는 층은 없다.
- 다른 8부위의 v1 통합 리포트는 **모두 명시적으로** 운동 추천·가설 자동화를 "v1 범위
  제외"로 닫아 두었다(`NECK_V1_INTEGRATION_REPORT.md:112`, `SHOULDER…:235`,
  `KNEE…:202-212`, `ELBOW…:249`). 코드에는 `TODO(NECK_V2)` 등 5곳. 고관절·발목·턱관절은
  TODO조차 없다.
- `tablet core/branch_rules_v1.4.yaml`은 목/어깨/무릎/팔꿈치/손목을 아직 `planned`로
  기록한다(실제로는 `src/spec`에 전부 출시됨) — 동결된 상류 산출물이라 이번에 손대지
  않고 문서 주석으로만 남긴다.

---

## 2. "같은 계획"의 정의 (목표 상태)

부위 X의 통증 초진·재진 화면이 요통과 **같은 자리에서 같은 종류의 판단**을 원장에게
제시한다:

1. 레인2 확인: 그 부위의 검사 제안(결과 상태 기록 가능) — L1
2. 레인3 판단·처치: 임상가설 칩(부위별 관리지향 패턴) → 최종 판단 → 운동 단계 카드 →
   운동 후보·채택 — L3, L5, L6, L7
3. 레인4 다음: 목표 기능 프리셋 — L2
4. 재진: 재검 시점에 부위별 초진 문항 재질문 + 초진→오늘 비교 — L8
5. EMR A행·재진 이어받기·환자 안내 문장에 그 부위의 가설이 요통과 같은 규칙으로 흐름

**활성화 조건**: 부위 팩의 `productionApproved: true`. 승인 전 팩은 코드에 존재해도
화면에 아무것도 내지 않는다(지금의 비요통 상태와 동일). "구현 완료 ≠ 임상 활성화".

---

## 3. 아키텍처 — 엔진 1개 + 부위 팩 N개 + 상태 어댑터

### 3.1 부위 팩 (데이터, 부위당 파일 1개)

`src/doctor/workspace/regionPacks/<region>.ts` — 순수 상수. 요통 팩은 기존 11개 모듈의
상수를 **옮겨 적는 것**이지 새 판단이 아니다.

```ts
type RegionKey = 'lbp' | 'neck' | 'shoulder' | 'knee' | 'hip' | 'ankle_foot' | 'elbow' | 'wrist_hand' | 'tmj'
// safety_flags의 키와 동일 (coreSpec.ts:4781~). 라벨은 DoctorWorkspace REGION_LABEL 재사용.

interface RegionPack {
  region: RegionKey
  productionApproved: boolean          // false면 엔진이 아무것도 내지 않는다
  sourceDocument: string               // 원장 승인 문서명 + 날짜
  hypothesisPatterns: { id; labelKo; patientEasyLabelKo; particleKo }[]   // L3, 3~6개
  targetFunctions: FollowUpTarget[]    // L2, 기존 FollowUpTarget 배관 그대로
  exerciseLibrary: ExerciseCatalogItem[]                                   // L4 카탈로그
  coreExerciseMetadata: CoreExerciseMetadata[]                             // L4 Core 세트
  stageTable: Record<exerciseId, 1|2|3|'ALL'>                              // L5
  stagePolicy: { demotions: DemotionRule[]; usesVisit04Axis: true }        // L5, 격하 입력 = 문항 id
  eligibilityRules: EligibilityRule[]  // L6 (directionalResponse 개념이 없는 부위는 해당 knob 미사용)
  directionalResponse: { applicable: boolean; options?: ... }             // L6 입력 카드 표시 여부
  examRules: ExamRule[]                // L1, docs/clinical-decision-tables/PAIN_EXAM_RECOMMENDATION_TEMPLATE.md 스키마
  clinicianAddableExams: PhysicalExamSuggestion[]                         // L1
  detailCheckQuestionIds: string[]     // L8, 초진 문항 id (single_choice / numeric_scale만)
}
```

### 3.2 엔진 (코드, 부위 무관)

기존 `lbp*` 함수의 시그니처에 `pack`을 첫 인자로 넣는다. 예:
`suggestLbpExerciseStage(input)` → `suggestExerciseStage(pack, input)`,
`buildLbpRecommendationContext(payload, deficit, ws)` → `buildRecommendationContext(pack, payload, regionState, ws)`.
기존 `lbp*` export는 **얇은 래퍼로 유지**해 요통 테스트 약 650단언이 수정 없이 통과해야
한다. 이것이 R1의 "행동 0 변경" 증명이다.

### 3.3 상태 어댑터 (저장 구조는 두 모양, 읽는 곳은 한 모양)

지금 요통 전용 저장 필드 3개: `lbpDirectionalResponse`, `lbpWorkingHypothesis`,
`lbpConfirmedStage` (`persistence.ts:199/218/233`, 추가형·스키마 버전 미변경). 앞의 둘은
EMR·재진 이어받기까지 흐른다(`lbp-working-hypothesis.spec.mjs` 184단언).

- **R2에서 요통 필드는 건드리지 않는다.** 새 부위는 `regionClinical: Partial<Record<RegionKey, { directionalResponse?; workingHypothesis?; confirmedStage? }>>` 한 필드에 담는다(추가형).
- 엔진·카드·EMR·재진은 `readRegionClinicalState(ws, region)` 하나로 읽는다. `lbp`면 옛 3필드에서, 나머지는 `regionClinical[region]`에서 조립한다.
- 요통 필드를 `regionClinical.lbp`로 옮기는 마이그레이션은 **별도 PR**(스키마 버전 상승, 저장 conflict 테스트 동반). 지금 하지 않는 이유: 요통 파일럿 직전에 저장 형식을 바꾸지 않는다.

### 3.4 구동 부위 결정 (한 환자에 부위 플래그 2개가 non-null인 경우)

같은 모집단을 공유하는 쌍이 둘 있다 — 목·어깨(`IS_PRIMARY_NECK` 하나로 둘 다 계산,
`NS01`이 초점 태그), 요통·고관절(`low_back_pelvis` 모집단, `HIP_00`이 판별). 안전 패널은
지금처럼 둘 다 렌더하되, **L1~L8 팩은 판별 문항(`NS01`/`HIP_00`) 답에 따라 하나만**
구동한다. 판별 답이 없으면 기존 기본값(목, 요통). → §8 Q5.

### 3.5 서버(세부문진)

`server/detailCheck.js`는 TS를 import할 수 없으므로 부위→문항 id 표를 `server/regionDetailCheck.js`에
두고, `tests/detail-check.spec.mjs`의 기존 parity 방식대로 **팩의 `detailCheckQuestionIds`와
서버 표가 일치하는지 단언**한다(어긋나면 실패). `isLbp` 인자는 `region` 인자로 바뀐다.
공개 GET의 `detail_question_ids` 계약은 그대로.

### 3.6 UI

`LbpStageCard`·`LbpWorkingHypothesisCard`·`LbpDirectionalResponseCard`는 `pack`을 받는
`StageCard`·`WorkingHypothesisCard`·`DirectionalResponseCard`가 되고, `DoctorWorkspace.tsx:492`의
`isLbpRecord` 게이트는 `activeRegionPack != null && pack.productionApproved`로 바뀐다.
`RevisitWorkspace`의 `isLbpPatientForRevisitHypothesisGate`도 부위 키로 일반화.
점프 내비 5탭·레인 구조·`exercise-h3` 앵커는 변경 없음.

---

## 4. 배치 순서 (한 번에 하나, 각 배치 = 브랜치 1 = PR 1)

| 배치 | 내용 | 완료 게이트 | 콘텐츠 필요 |
|---|---|---|---|
| **R0** | 이 문서 + DECISIONS 항목 + PO 질문 5개 답 | PO 승인 | — |
| **R1** 코드 일반화 | 팩 타입·엔진·요통 팩(옮겨 적기)·래퍼. **행동 0 변경.** | `test:all` exit 0, 요통 스위트 수정 0줄, 요통 fixture 3종(초진/재진/mixed) EMR·환자 문장·후보 목록 스냅샷 동일, CLAUDE.md "경로 교체" 규칙의 필드×화면 표 + 지운 경로당 소스 단언 1개 | — |
| **R2** 상태·UI·서버 일반화 | `regionClinical` 필드, 카드 3종 팩 인자화, 구동 부위 결정(§3.4), 서버 부위 표, EMR A행·재진 이어받기 부위 라벨 | 빈 팩(승인 전) 8부위에서 화면 diff 0 (SSR 스냅샷), 요통 diff 0, `save-conflict`·`doctor-reset-key`·`revisit-quick-check`·`detail-check` 통과 | — |
| **R3-①** 첫 비요통 팩 | PO 우선순위 1부위(§8 Q1). 원장 콘텐츠 → 팩 인코딩 → vignette 테스트 → Opus 임상 검수 → `productionApproved` | 부위별 vignette 스위트(요통 `core20.vignettes` 형식), 단계 분포 스크립트(`pilot:<region>-stage`), 변이 테스트 | **원장** |
| **R3-②~⑧** | 나머지 부위, 같은 절차. 콘텐츠가 오는 순서대로. | 동일 | **원장** |
| **R4** (선택) | 요통 저장 필드 3개 → `regionClinical.lbp` 마이그레이션, 스키마 1.2.0 | 구버전 저장본 읽기 테스트 | — |

R1·R2는 콘텐츠 없이 진행 가능하고 요통 파일럿과 병행할 수 있다. R3부터는 원장 콘텐츠가
선행 조건이다.

---

## 5. 원장이 부위마다 채워야 하는 것 (콘텐츠 입력 양식)

요통 기준으로 역산한 항목. 요통은 이 내용을 만드는 데 원문 확인 문서 약 2,000행과 원장
검토 여러 회가 들었다(`LBP_EXERCISE_LIBRARY_EVIDENCE_RESEARCH_v0.1.md` 1,310행 등).

| # | 항목 | 요통 실제 분량 | 최소 시작 분량(얇은 팩) |
|---|---|---|---|
| 1 | 관리지향 가설 패턴 (이름 + 환자용 쉬운 말) | 5 | 3~5 |
| 2 | 목표 기능 프리셋 | 9 | 5~7 |
| 3 | 운동 카탈로그 + Core 세트(시작 기준·시작 용량·수용 반응·중단 기준·후퇴·전진) | 57 / Core 20 | Core 8~12 |
| 4 | 운동별 단계(1/2/3/ALL) | 20행 | Core 수만큼 |
| 5 | 단계 격하 규칙 + 그 입력 문항 | 발병 1주 이내, 공포회피(LBP_13), 재발 간격(LBP_07B) | VISIT_03 기간만으로 시작 가능 — 부위별 입력 문항은 §8 Q3 |
| 6 | 운동별 안전 게이트 | 신경 안정·원위 악화·방향성 반응 | 신경 안정 + 부위 안전 잠금(이미 있음) |
| 7 | 검사 제안 규칙 (템플릿 스키마, `APPROVED` 행만) | 4 자동 + 5 수동 | 기존 검사 코드 목록(L0')을 수동 추가 항목으로 승격 — 자동 규칙은 0으로 시작 가능 |
| 8 | 재진 세부문진 재질문 문항 id (single/numeric만) | LBP_12/13/14 | 부위당 1~3 |

**Claude는 1~8을 창작하지 않는다.** 팩 파일에 값이 비어 있으면 그 부위는 승인 전 상태로
남고 화면은 지금과 같다.

---

## 6. 트레이드오프 · 리스크 · 놓치기 쉬운 점

**얻는 것**: 부위 하나 추가 = 데이터 파일 1개 + 테스트 1개. 요통에서 이미 검증된 엔진을
재사용하므로 부위별 버그 표면이 커지지 않는다. 진료 화면이 부위와 무관하게 같은 자리에서
같은 판단을 요구한다.

**잃는 것**: R1은 요통 핵심 파일 11개와 테스트 9스위트를 건드리는 구조 변경이다(CLAUDE.md
Escalation 조건 "핵심 파일 다수에 걸친 구조 변경" 해당). 요통 파일럿 직전에 요통 코드의
형태가 바뀐다 — 행동은 0 변경이어야 하고 그것을 스냅샷으로 증명한다.

**숨은 리스크**
1. **VISIT_04 단계 축은 요통에서도 아직 검증 전이다.** DECISIONS(2026-09-05)는 "파일럿에서
   `VISIT_04=severe`가 과반이면 이 축은 실패"라고 적어 두었다. 8부위로 확장하면 같은 미검증
   가정에 8배 베팅하는 셈이다. → R3 활성화를 요통 파일럿 1주기 결과 뒤로 두는 것을 권한다.
2. **콘텐츠 창작 유혹.** 목·무릎 운동 목록을 "상식"으로 채우면 North Star 100행 위반이다.
   빈 팩으로 출시하는 규칙(§2 활성화 조건)이 방어선이다.
3. **모집단 공유 쌍**(목·어깨, 요통·고관절)에서 팩 2개가 동시에 구동되면 운동 후보가 섞인다.
   §3.4로 하나만 구동.
4. **문항 추가 압력.** 격하 규칙 입력(공포회피·재발 간격)을 부위마다 넣으면 `src/spec`
   FROZEN과 문진 분량 예산(`questionnaire-volume` 테스트)을 건드린다.
5. **재진 이어받기 회귀.** 가설 이어받기·환자 문장 삽입은 요통 전용 게이트가 4곳에 있다.
   교체할 때 CLAUDE.md 규칙대로 "지우지 않은 쪽 화면"(재진·한약·mixed) 표를 남긴다.

**대부분이 놓치는 점**: 이 작업의 산출물은 코드가 아니라 **"부위를 하나 추가하는 데
원장이 무엇을 얼마나 써야 하는가"를 고정된 양식으로 만드는 것**이다. 그 양식(§5)이 나오면
8부위 진행 속도는 전적으로 콘텐츠 공급 속도로 정해진다.

---

## 7. 이 지시가 해제하는 기존 문서 조항 (DECISIONS에 명시 필요)

| 조항 | 출처 | 처리 |
|---|---|---|
| "다른 부위 이동 금지(§0-5/§36)" | `LBP_PRODUCTION_V1_MINIMAL_ARCHITECTURE_v0.1.md:238` | PO 지시로 해제. 단 요통 파일럿은 계속 진행. |
| "EMR/CRM 닫혀야 다음 부위" | 같은 문서 `:232` | Batch 4(+4.1) 게이트 CLOSED 기록을 이 저장소에서 찾지 못했다(마지막 판정 FAIL, 2026-09-05). R1·R2는 EMR 텍스트 diff 0을 게이트로 삼아 병행. |
| 각 부위 v1 "운동 추천·가설 자동화 v1 범위 제외" | `NECK/SHOULDER/KNEE/ELBOW_V1_INTEGRATION_REPORT.md` | v2 범위로 재개. 요통과 같은 "원장 선택형(자동 계산 없음)" 원칙 유지. |
| `examSuggestion.ts` 헤더 "범용 생성기를 여기 두지 말 것" | `src/doctor/workspace/examSuggestion.ts:1-19` | 생성기는 팩 데이터를 읽는 엔진으로 별도 파일에 둔다. 승인된 규칙만. |

---

## 8. PO clarify 질문 5개

1. **순서**: 8부위 중 실제 환자 수가 많은 순서가 무엇인가? (추정: 목·어깨 → 무릎 → 고관절
   → 발목·발 → 팔꿈치·손목 → 턱관절.) 목·어깨는 한 모집단이라 한 팩으로 묶을지도 결정 필요.
2. **콘텐츠 원본**: 요통은 `02_요통_Clinical_OS_임상설계_및_콘텐츠_라이브러리_v0.2.docx`가
   원본이었다. 번호로 보아 `01_`, `03_…` 다른 부위 문서가 이미 있는가? 있으면 어떤 부위까지
   있고, 없으면 §5 양식으로 새로 쓰는 것으로 진행하는가?
3. **문항 추가 허용**: 단계 격하 입력(공포회피·재발 간격 등)을 부위별로 태블릿에 1~2문항
   추가해도 되는가, 아니면 기존 공통 문항(VISIT_03 기간·VISIT_04 영향)만으로 단계를 정하는가?
4. **활성화 시점**: R3 팩 활성화를 요통 파일럿 1주기(VISIT_04 축 검증) 뒤로 둘 것인가,
   아니면 콘텐츠가 준비되는 대로 즉시 켤 것인가?
5. **모집단 공유 쌍의 구동 규칙**: 목·어깨는 `NS01`, 요통·고관절은 `HIP_00` 답으로 팩 하나만
   구동하는 §3.4 규칙에 동의하는가? 판별 답이 없을 때 기본값(목, 요통)도 그대로 두는가?

---

## 9. 하지 않을 것

- 요통 코드 복사로 부위별 모듈 8벌 만들기.
- 부위별 운동·가설·검사 규칙을 원장 문서 없이 채우기.
- `tablet core/` 수정(동결 상류 산출물). 드리프트는 문서 주석으로만.
- 요통 저장 필드 3개의 형태 변경(R4로 분리).
- 자동 단계 상향·점수화·확률·순위 — 요통과 같은 "원장 확정형" 원칙 그대로.
