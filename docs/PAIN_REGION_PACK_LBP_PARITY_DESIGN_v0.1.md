# 부위 팩 — 요통 동등성(LBP parity) 설계 v0.1

**상태**: PROPOSED — PO 승인 대기. 코드 변경 0줄.
**PO 지시(2026-09-07)**: "요통에 준해서 작업할 수 있게 설계해줘."
**임상 프레임워크 원본**: PR #30 `docs/recovered_rehab_architecture/` (ChatGPT Library 아티팩트
2026-08-25 복구, NECK/SHOULDER/KNEE). 아직 draft·미merge.
**구조 원본**: `docs/PAIN_REGION_PACK_GENERALIZATION_PLAN_v0.1.md`(엔진 1개 + 팩 N개),
`docs/PAIN_REGION_PACK_DRAFT_CONTENT_v0.1.md`(현재 DRAFT 팩 상태).

---

## 0. 한 줄 결론

**요통 v1이 거친 12단계를 부위마다 같은 순서로 밟되, 임상 프레임워크는 PR #30(복구 아키텍처)을
정본으로 삼고, 현재 DRAFT 팩의 "4패턴 분류"(Notion 아카이브 출처)는 PR #30의 가설 상태로
교체한다.** 운동 이름·용량·단계표는 여전히 원장 승인 콘텐츠이며 이 설계는 그 빈칸의 **양식과
출처 우선순위**를 고정한다.

이유: PR #30 프레임워크는 요통 프로덕션 코드와 **같은 뼈대**다 — 단계 흐름(Safety → Function →
Hypothesis → Exercise → Reassessment), 후보 워크플로우("2~3개 제시 → 원장 승인 → 최종 1~2개"),
가설 지지 수준(HIGHER/CONSIDER/LOWER), 진단→운동 하드코딩 금지. 아카이브 4패턴은 이 뼈대와
맞지 않고 출처 신뢰도도 낮다("원장님 발목 포맷을 AI가 확장").

---

## 1. "요통에 준한다"의 정의 — 요통 v1 스택 12단계

| # | 층 | 요통 v1 산출물 | 위치 |
|---|---|---|---|
| 1 | Evidence Matrix → Clinical Decisions CLOSED | `evidence_matrix_lbp_v1.md`, `lbp_v1.0.yaml` | `tablet core/` |
| 2 | 안전 판정(FROZEN) | `lbpLogic.ts`(YAML 포팅) | `src/spec/` |
| 3 | 검사 제안 | 자동 규칙 4 + 수동 5, 도움말 6 | `lbpExamSuggestions.ts` |
| 4 | 목표 기능 | 9개 프리셋(`lbp_tf_*`) + 자유 1 | `lbpTargetFunction.ts` |
| 5 | 임상가설 | 관리지향 패턴 5 × 지지 3(+미판단), 원장 선택 | `lbpWorkingHypothesis.ts` |
| 6 | 운동 라이브러리 | 카탈로그 57 → Core 20, 메타 7필드(시작기준·용량·수용반응·중단·후퇴·전진·목표기능) | `lbpExerciseLibrary.ts`, `lbpExerciseCoreMetadata.ts` |
| 7 | 운동 단계 | VISIT_04 축 + 격하 2 + 상한 1, 단계표 20행 | `lbpExerciseStage.ts`, `lbpExerciseStageTable.ts` |
| 8 | 적격성 | 운동별 안전 게이트 4종 | `lbpExerciseEligibility.ts` |
| 9 | 추천 조립 | 2버킷 순위, 차단 사유 3, 채택 문구 | `lbpExerciseRecommendation.ts` |
| 10 | 세부문진 재질문 | 초진 문항 3(LBP_12/13/14) | `server/detailCheck.js` |
| 11 | 검증 | 스위트 9, 약 650단언, vignette 24, 변이 | `tests/lbp-*.spec.mjs` |
| 12 | 파일럿 계측 | 단계 분포 스크립트 | `pilot:lbp-stage` |

부위 팩(`RegionPack`)은 3~10을 필드로 갖고 있다(R1~R3). 1·2는 이미 8부위 전부 있다(`*_V1_*` 문서,
`*Logic.ts`). **없는 것은 5~10의 내용과 11·12다.**

---

## 2. PR #30 프레임워크 → RegionPack 필드 대응

| PR #30 요소 | RegionPack 필드 | 대응 방식 |
|---|---|---|
| Hypothesis 후보(`AXIAL_NECK_PAIN_MOBILITY_DEFICIT` …) | `hypothesisPatterns` | 그대로 패턴 id. `MUST_EXCLUDE_*`는 L0 안전이라 칩으로 두지 않는다. |
| 지지 수준 `HIGHER_SUPPORT/CONSIDER/LOWER_SUPPORT` | `HypothesisSupport` (`HIGHER/CONSIDER/LOWER`) | 1:1. 접미사만 다르다. |
| Selection inputs (target function, irritability, ROM, strength, load response, instability, safety, goal) | 목표 기능 / 검사 결과(`PhysicalExamSuggestion.result`) / 방향성 반응 / `evaluateSafety` | §3 갭 분석 — 시스템에 **이미 있는 입력만** 규칙에 쓴다. irritability는 요통도 DEFER(§108) — 새 입력 만들지 않는다. |
| Rehabilitation domains (목 9, 어깨 8, 무릎 11) | `RegionCoreExercise.strategyLabelKo` + 새 `domain` | 요통의 13 도메인 → 전략 라벨과 같은 자리. 도메인은 팩 데이터. |
| Phenotype → management direction | 운동 Core 세트의 `targetFunctions` 매칭 + 가설은 **참고 표시만** | 요통 §11.7 "가설→운동추천 연결 금지" 유지. 가설이 후보를 필터하지 않는다. |
| Selective Exam Engine (§5, 목) | `clinicianAddableExams` + `generateExamSuggestions` | 수동 추가 항목은 PR #30 §5 목록으로 교체(CROM, Spurling, distraction, ULTT, CFRT, DNF endurance…). 자동 규칙은 `PAIN_EXAM_RECOMMENDATION_TEMPLATE.md` APPROVED 행에서만. |
| Reassessment (NRS + Target Function 0–10) | 기존 재평가 대상·NRS 버튼·micro follow-up | 이미 전 부위 공유. **Response state(RESPONDING…)는 넣지 않는다** — 요통 `REPEAT_VISIT_AUTO_COMPARE_STATUS`("자동 판단 없음") 원칙. |
| 명시적 금지 목록 | 팩 헤더 주석 + vignette 테스트 | "디스크→chin tuck" 같은 매핑이 코드에 없음을 테스트가 단언(부정 단언). |
| Candidate workflow "2~3 후보 → 원장 승인" | `RehabSuggestionCard` 채택 UI(기존) | 변경 없음. 표시 3장 + 더 보기(기존). |

---

## 3. Selection inputs 갭 분석 — 규칙이 읽을 수 있는 것

| 입력 | 시스템 내 존재 | 팩 규칙에서 쓰는 법 |
|---|---|---|
| 안전(safety) | ✅ `evaluateSafety`(부위 안전 재계산) | `routineCareAllowed`가 false면 전체 차단(요통 RF-3b) |
| 신경 상태 | 요통만 원장 입력(`lbp_objective_motor_deficit`). 목은 `neck_neuro_baseline_required` 플래그만 | **설계 결정 D-1**: 목·어깨·무릎은 `neuroStatus`를 검사 결과에서 파생 — 팩이 지정한 신경 검사 id가 `POSITIVE`면 NEW_OR_WORSENING, `NEGATIVE`면 STABLE, 그 외 UNKNOWN. 새 판단 필드 없음. 규칙 기본값은 `requiresStableNeuro:false`(현재)로 두고 신경 관련 운동(예: 목 neural mobility)만 true. |
| 방향성/움직임 반응 | ✅ 카드(`DirectionalResponseCard`), 팩 `directionalResponseApplicable` | 목: **true**(PR #30 도메인 "directional symptom response"). 어깨·무릎: false. 값 6개는 그대로 쓰되 라벨은 부위별(요통 "숙이면/젖히면" → 목 "굽히면/젖히면/회전"; **라벨 표는 팩 데이터, 값 집합은 공통**). |
| 검사 반응(ROM·strength·load·instability) | ✅ `PhysicalExamSuggestion.result.status` 6값 | `directSupportByExam`(요통과 동일 메커니즘): 검사 POSITIVE → 특정 운동 "직접 뒷받침" 승격. 예: 어깨 "resisted ER POSITIVE 재현" → 회전근개 부하 운동. |
| 목표 기능 | ✅ `FollowUpTarget` | 팩 `targetFunctions` |
| irritability | ❌ | 만들지 않는다(요통 DEFER). 시작 기준 문장(`startingCriteriaKo`)에 원장이 서술. |
| 환자 목표 | ✅ 자유 입력 목표 동작 | 매칭 안 함(요통과 동일, CUSTOM_ONLY 안내) |

---

## 4. 콘텐츠 출처 우선순위 (필드별)

| 팩 필드 | 1순위 | 2순위 | 3순위 | 원장 작업 |
|---|---|---|---|---|
| `hypothesisPatterns` id·라벨 | **PR #30 hypothesis 후보** | — | — | 라벨 한국어·환자용 쉬운 말 확정 |
| 안전(L0) | 기존 `*Logic.ts`(FROZEN) | — | — | 없음 |
| `clinicianAddableExams` | **PR #30 §5 Selective Exam** | 각 부위 V1 통합 리포트의 검사 코드 목록 | Notion 매선 프로토콜 검사 | 목록 확정 |
| `generateExamSuggestions` 규칙 | `PAIN_EXAM_RECOMMENDATION_TEMPLATE.md` APPROVED 행 | — | — | 규칙 작성·승인(없으면 []) |
| `targetFunctions` | 원장 | PR #30 "functional … tolerance" 도메인에서 후보 도출 | 현재 DRAFT 초안 | 확정 |
| 운동 도메인 | **PR #30 Rehabilitation domains** | — | — | 없음(그대로) |
| 운동 이름(Core 세트) | **원장** | 「1권」 챕터(표적 근육 → 운동 방향: VMO·DNF·전거근·중하부승모근) | Notion 매선 프로토콜 운동 이름(신뢰 낮음, 후보 목록으로만) | Core 8~12 확정 |
| 메타 7필드(시작기준·용량·중단…) | **원장** | 요통 Core-20 문장 형식 그대로 | — | 운동당 7칸 |
| 단계표 | **원장** | TBC 3단계 + 0단계(요통 방식) | — | 운동당 1칸 |
| 격하 규칙 | 공통 문항만(VISIT_03·04) — PO 결정 Q3 | — | — | 없음 |
| `detailCheckQuestionIds` | 원장 | 부위 문항 중 single_choice(예: NECK_12 지속자세) | — | 1~3개 |
| `directSupportByExam` | 원장 | PR #30 phenotype→management 표 | — | 검사→운동 쌍 |

**출처 신뢰 표기**: 팩 헤더에 필드별 출처를 적는다(`PR#30` / `1권 N장` / `아카이브(후보)` / `원장`).
`아카이브(후보)`로 표기된 값은 승인 시 원장이 하나씩 유지/삭제한다.

---

## 5. 부위별 가설 패턴 (PR #30 기준, 현재 DRAFT 대체안)

### 목 — 5패턴 (요통과 같은 수)
| id | 라벨(안) | 환자용 쉬운 말(안, 원장 확정) |
|---|---|---|
| AXIAL_MOBILITY_DEFICIT | 목 움직임 제한(축성 목통증) | 목 움직임 |
| RADICULAR_INVOLVEMENT | 신경근 관여(팔 증상) | 팔로 내려가는 증상 |
| CERVICOGENIC_HEADACHE | 경추성 두통 패턴 | 목에서 오는 두통 |
| MOVEMENT_COORDINATION_DEFICIT | 움직임 조절·지구력 부족 | 오래 버티는 힘 |
| SHOULDER_OR_PERIPHERAL | 어깨·말초 기여 | 어깨 쪽 기여 |

### 어깨 — 6패턴
RC_RELATED(회전근개 관련) / FROZEN_SHOULDER(동결견 패턴) / GH_OA(관절와상완 관절염 패턴) /
INSTABILITY_TRAUMATIC(외상성 불안정) / INSTABILITY_ATRAUMATIC_MOTOR_CONTROL(비외상성·조절형) /
CERVICAL_CONTRIBUTION(경추 기여 — 목 팩으로 넘김 안내). AC/local은 원장 결정(7번째 여부).

### 무릎 — 7패턴
KNEE_OA / PATELLOFEMORAL_PAIN / PATELLAR_TENDINOPATHY / ACUTE_MENISCAL / DEGENERATIVE_MENISCAL /
LIGAMENT_INSTABILITY / PATELLAR_INSTABILITY. (V1 통합 리포트가 "raw discriminator로 보존"한 enum과
일치.)

`MUST_EXCLUDE_*`(척수증·혈관·골절·감염·화농관절·DVT…)는 이미 L0 안전 판정이 담당 — 칩 아님.

### 요통 자체는 바꾸지 않는다
요통 5패턴(허리 움직임/신경근/보행·기립/고관절/천장관절)은 프로덕션·파일럿 중. PR #30은
요통을 다루지 않는다. 변경 0.

---

## 6. 엔진 변경 최소 목록 (팩 데이터로 안 되는 것만)

| 항목 | 현재 | 변경 | 근거 |
|---|---|---|---|
| E-1 방향성 반응 라벨 | 6값 라벨 고정(요통 문구) | 팩에 `directionalResponseLabels?: Record<value,string>` 추가, 없으면 기존 라벨 | 목 "회전" 표현. 값 집합·저장은 공통 |
| E-2 신경 상태 파생 | `evaluateSafety`가 `neuroStatus` 반환(요통은 원장 필드) | 팩에 `neuroExamIds?: string[]` 추가 → 엔진이 검사 결과에서 파생(D-1) | 목·어깨·무릎에 원장 신경 필드 없음 |
| E-3 도메인 | `strategyLabelKo` 문자열 | `RegionCoreExercise.domain: string` 추가(라벨은 팩 도메인 표에서) | PR #30 도메인 분류 보존, 테스트에서 도메인 분포 고정 |
| E-4 금지 매핑 단언 | 없음 | `tests/region-pack.spec.mjs`에 팩별 "진단명 문자열이 규칙·후보에 없음" 부정 단언 | PR #30 §금지 |
| E-5 파일럿 스크립트 | `pilot:lbp-stage`만 | `scripts/region-stage-distribution.mjs <region>` 일반화 | 단계 분포는 부위 무관 |

그 밖(추천 조립·단계 엔진·적격성·저장·EMR·서버)은 R1~R3에서 이미 부위 무관. 변경 없음.

---

## 7. 부위 1개 작업 순서 (요통 v1 순서 그대로, 게이트 포함)

```
① PR #30 merge (reference-only, 코드 0)                         ← PO
② 부위 Exercise Evidence Matrix v0.1 (원장+Opus)                  ← 원장 문서
   - PR #30 아키텍처 + 「1권」 챕터 표적 + 가이드라인(JOSPT/AAOS/NICE…)
   - 출력: Core 후보 8~12, 도메인 배정, 단계표, 메타 7필드, 검사→운동 쌍, 금지 목록
③ Opus 임상 검수 → Clinical Decisions CLOSED (docs/<REGION>_EXERCISE_DECISIONS_v1.0_CLOSED.md)
④ Sonnet: 팩 인코딩 + vignette 스위트(요통 core20.vignettes 형식) + 변이 + pilot 스크립트
   - packContentGaps == []  (승인 전제)
   - 진단→운동 하드코딩 부정 단언 통과
⑤ Opus delta 검수 → PO 승인 → productionApproved:true + 서버 재질문 표 + 테스트 D절 갱신
⑥ 파일럿 계측(단계 분포·채택률·세부문진 응답률)
```

순서: **목 → 어깨 → 무릎** (PR #30이 다루는 3부위; 모집단 공유로 목·어깨는 연속 진행이 자연).
고관절·발목·팔꿈치·손목·턱관절은 PR #30에 없음 → ②를 원장이 처음부터 쓰거나 보류.

---

## 8. 현재 DRAFT 팩 처리

| 팩 | 조치 |
|---|---|
| neck / shoulder / knee | `hypothesisPatterns`를 §5로 교체, `clinicianAddableExams`를 PR #30 §5로 교체, 운동 이름은 `아카이브(후보)` 표기로 유지(원장이 ②에서 유지/삭제). `directionalResponseApplicable` 목만 true. |
| hip / ankle_foot / tmj | 유지(출처 그대로). PR #30 범위 밖 — 원장 ② 문서 전까지 승인 불가. |
| elbow / wrist_hand | 빈 팩 유지. |
| lbp | 변경 0. |

이 조치는 **데이터 파일 변경 + 테스트 갱신**이며 `productionApproved:false` 그대로라 화면 0 변경.
승인 후 착수.

---

## 9. 리스크·트레이드오프

- **얻는 것**: 3부위 모두 요통과 같은 뼈대·같은 원칙(진단 비고정, 원장 채택)·같은 테스트 형식.
  콘텐츠 원본이 가이드라인 인용 기반(PR #30)이라 근거 추적이 된다.
- **잃는 것**: 아카이브 4패턴으로 이미 만든 DRAFT 가설은 폐기(운동 이름은 후보로 보존).
- **숨은 리스크 1**: PR #30 자체가 "REFERENCE ONLY — 운동 라이브러리가 아님"이라고 명시. 운동
  이름·용량은 결국 원장 ② 문서가 병목. 요통은 여기에 2,000행이 들었다.
- **숨은 리스크 2**: 목의 신경 상태를 검사 결과에서 파생(D-1)하면 "미시행"이 UNKNOWN → 신경
  관련 운동 보류. 요통과 같은 보수성이지만 목 환자 대부분은 신경 검사를 안 할 수 있어 후보가
  비어 보일 수 있다 → 신경 관련 운동만 `requiresStableNeuro:true`로 제한(§3).
- **숨은 리스크 3**: VISIT_04 단계 축은 요통에서도 검증 전. 3부위가 같은 축을 쓰면 같은 가정에
  4배 베팅. PO는 "즉시 활성화"(Q4)를 택했으므로 파일럿 계측(⑥)을 부위별로 붙인다.

---

## 10. PO 결정 필요 (착수 전)

1. PR #30을 먼저 merge하는가(reference-only, 코드 0)? — 권고: 예.
2. §5 가설 패턴 수(목 5 / 어깨 6 / 무릎 7)와 라벨 — 확정 또는 수정.
3. D-1(신경 상태를 검사 결과에서 파생) 채택 여부.
4. §8 DRAFT 팩 교체(아카이브 4패턴 폐기) 승인.
5. 첫 부위 ② 문서(목 Exercise Evidence Matrix) 작성 주체·일정 — 원장 단독 / 원장+Opus 초안.
