# 어깨(SHOULDER) Exercise Clinical Decisions v1.0 — CLOSED

**상태**: CLOSED (2026-09-07). 팩 `src/doctor/workspace/regionPacks/shoulder.ts` `productionApproved: true`의 근거 문서.
**승인 경로**: `docs/SHOULDER_EXERCISE_EVIDENCE_MATRIX_v0.1.md`(원장+Opus 초안, §0 체크리스트 9) → PO "허리를 기준으로 모든 파트
진행"(2026-09-07, 범위 답변 "목 어깨 무릎 손목 발목까지 전부") → **체크리스트 9개를 추천안 그대로 확정** → 이 문서.
**진입 기준**: 요통·목과 같은 **B수준**(`DECISIONS.md` 2026-09-07 "검증 수준 정책"). 원문 A수준 대조(매트릭스 §0-9, Lee 2025)는 v1.1 항목.
**2026-09-07 원문 대조(같은 날 저녁)**: PR #30이 갱신되어 **원문**(`source/originals/SHOULDER_V1_Evidence_Matrix_v0.1_HANDOFF.part*.md`,
652행 23,891B, SHA-256 `bf406ed7…` 재조립 검증)이 올라왔다. 이 문서는 3.7KB 요약본(`*_RECOVERED.md`)만 보고 작성됐으므로 전 항목을
원문과 대조했다 — 결과는 §1-2 표. **가설 7·도메인 8·금지 3은 원문과 일치**했고, **검사 2건이 누락**되어 팩에 추가했다(§6).
**주의**: 원장이 행 단위로 문장을 다듬지 않았다. 7필드 문장은 매트릭스 §4 초안이 PO 위임 승인으로 확정된 것이며, 파일럿(§10)에서 고칠
항목이 나오면 v1.1로 올린다. 매트릭스 §10의 "목 파일럿 첫 관찰 후 착수" 조건은 PO 지시로 해제됐다(부위별 집계 스크립트가 분리 관찰을 보장).

---

## 1. Opus 임상 검수 — PASS (조건부 항목 2)

| 항목 | 판정 | 근거 |
|---|---|---|
| 안전 게이트가 운동 추천보다 앞서는가 | PASS | `evaluateShoulderSafety` = `shoulderLogic.ts` FROZEN 재계산(목 상태 passthrough 포함), fail-closed. 비네트 V7a–b. |
| 진단명 → 운동 하드코딩이 없는가 | PASS | 가설 id가 운동 쪽에 없음(E-4). "RC = 밴드 외회전 자동" 없음 — RC_02는 목표 기능·단계·검사 뒷받침으로만 오른다. "동결견 = 강한 ROM" 없음 — SH_MOB_02 용량 문장에 "통증 범위 내·세게 늘리지 않는다" 고정(비네트 0절). |
| 신경 결손 시 운동을 내지 않는가 | PASS | `shoulder_exam_distal_neuro` POSITIVE → 전체 차단(V3). 미시행은 후보를 비우지 않는다(어깨 운동은 STABLE을 요구하지 않음 — 매트릭스 §5). |
| 원장 객관적 근력저하 필드 | PASS(설계 확인) | L0 `expedited_referral_consider` 플래그(안전 패널)만 켜고 안전 상태를 바꾸지 않는다(SHOULDER_V1 §12). 엔진은 그 플래그를 읽지 않는다 — 의뢰 판단은 원장. V7c가 이 동작을 고정. |
| 확률·cutoff를 넣지 않았는가 | PASS | 팩·문서 어디에도 없음. |
| **Lee 2025 동결견 CPG irritability별 스트레칭 강도** | **B수준 / A수준 미완** | 로그 §3(ARM, JOSPT 아님). SH_MOB_02는 강도 수치를 주장하지 않고 "통증 범위 내"만 고정. v1.1 항목(원장 원문 확인 시). |
| **행 단위 문장 검토** | **미완(조건부)** | PO 위임 승인. 파일럿 §10-1. |

### 1-2. 원문 대조 결과 (2026-09-07 저녁)

| 원문 항목 | 이 문서 v1.0 초판 | 조치 |
|---|---|---|
| §8 가설 후보 7(RC / FROZEN / GH_OA / TRAUMATIC_INSTABILITY / ATRAUMATIC_INSTABILITY / **AC_OR_LOCAL_JOINT_CONTRIBUTION** / CERVICAL_NEURO) | 7 (같은 집합) | **정정**: 매트릭스 §0-1은 AC를 "7번째 추천 **추가**"라고 적었으나 원문에는 처음부터 있었다 — 요약본이 6개로 줄여 옮긴 것이다. 이 문서의 판단은 추가가 아니라 **원문 복원**이었다. id는 팩 관례상 `AC_LOCAL_CONTRIBUTION`(원문 `AC_OR_LOCAL_JOINT_CONTRIBUTION`). |
| §10 Domain 8 | 8 (동일) | 변경 없음 |
| §10 금지 3 | 3 (동일) | 변경 없음 |
| §11 "night pain은 보조적 증상 추적이며 단독 safety marker가 아님" | §10-5에 같은 취지 | 변경 없음 |
| **§7 Base 1. Target-function reproduction** | **없음** | **추가** — 목 팩에는 있는데 어깨에만 빠져 있었다. 재평가가 "같은 동작으로 비교"에 의존한다. |
| **§5 "Active vs Passive ROM = SHOULDER_V1의 핵심 분기"** | `shoulder_exam_rom` 1개가 능동·수동을 뭉갬 | **분리** — `shoulder_exam_arom` / `shoulder_exam_prom`. 수동 외회전이 동결견·관절와상완 관절염·회전근개 표현형을 가르는 high-yield. 뒷받침도 분기: 능동만 제한 → MOB_01 / 수동도 제한(가동성 결손) → MOB_01 + MOB_02. |
| §10 입력 9 중 **irritability** | 기록 수단 없음 | **v1.1 보류** — 전 부위(요통·목 포함) 공통 구조 갭. 새 상태 필드는 별도 DECISIONS 사안이라 파일럿을 막지 않는다. §10-8 관찰. |
| §6 보조검사 resisted abduction/scaption, §7 AC palpation | 없음(empty_can·horizontal adduction으로 근사) | **유지** — 검사가 이미 10개. §10-9 관찰 후 v1.1. |

## 2. 가설 패턴 (7) — 확정
PR#30 phenotype 6 + `AC_LOCAL_CONTRIBUTION`(수평내전 검사가 걸릴 곳). 가설은 참고 표시이며 후보 필터가 아니다.

## 3. Core 10 — 확정 (초안 11 → 10, SH_THX_01 보류)

| id | 운동 | 도메인 | 단계 |
|---|---|---|---|
| SH_EDU_01 | 활동·부하 조절(통증 허용 범위 사용, 야간 팔 받침) | EDUCATION_LOAD_MODIFICATION | 1 |
| SH_MOB_01 | 진자 + 보조 거상(막대·벽 타기) | MOBILITY | 1 |
| SH_MOB_02 | 앞가슴·후방 어깨 저강도 스트레칭(irritability 맞춤) | MOBILITY | 1 |
| SH_RC_01 | 등척성 외회전·내회전(벽·문틀) | ROTATOR_CUFF_RESISTANCE | 1 |
| SH_RC_02 | 밴드 외회전·내회전 점진 부하 | ROTATOR_CUFF_RESISTANCE | 2 |
| SH_SCAP_01 | 전거근 벽 슬라이드 + 견갑 상방회전 조절 | SCAPULAR_MOTOR_CONTROL | 2 |
| SH_SCAP_02 | 하부 승모근 Y-레이즈 / 견갑 하강 유지 | SCAPULAR_MOTOR_CONTROL | 2 |
| SH_STAB_01 | 폐쇄 사슬 안정성(벽 푸시업 플러스·볼 압박) | STABILITY_CONTROL | 2 |
| SH_OVH_01 | 머리 위 동작 단계적 노출 | OVERHEAD_GRADED_EXPOSURE | 2 |
| SH_FUNC_01 | 뻗기·들기 내성 단계적 | FUNCTIONAL_REACH_LIFT | 3 |

**보류(v1.1 후보)**: SH_THX_01(흉추 가동성). **아카이브 8개** 전부 폐기(병합 6·대응 1·미채택 1) — `SH_PROT_*`, `SH_TRAP_*`, `SH_IR_*`,
`SH_THX_*` id는 코드에 남지 않는다(region-pack J-④). 도메인 8 중 KINETIC_CHAIN은 SH_OVH_01에 흡수(독립 행 없음).

## 4. 메타 7필드 — 확정 (팩 파일이 정본)
매트릭스 §4 표를 10행에 옮겼다. 중단·재검토 첫 항목 공통: "새로운 또는 진행하는 신경증상(팔 힘빠짐·감각저하) 또는 어깨가 빠지는
사건". 용량은 삼인당 시작 기본값(임상 임계값 아님).

## 5. 단계표·적격성 — 확정
1단계 4 / 2단계 5 / 3단계 1. 규칙 전부 기본값(false/false), 방향성 카드 미적용. `neuroExamIds: ['shoulder_exam_distal_neuro']` —
POSITIVE면 RF-3b 전체 차단, 어떤 운동도 STABLE을 요구하지 않는다(미시행이 후보를 비우지 않음). 불안정 관련 보수성은 L0(SH02)와
시작 기준 문장으로 — 운동 단위 게이트 없음.

## 6. 검사(10) → 직접 뒷받침(6쌍) — 확정 (2026-09-07 원문 대조 반영)
원장 스크립트 5 + 매트릭스 3 + **원문 대조 2**(`target_function_reproduction`, AROM/PROM 분리).
`arom → SH_MOB_01` / `prom → SH_MOB_01, SH_MOB_02` / `empty_can → SH_RC_01` / `er_resist → SH_RC_01, SH_RC_02` /
`scapular_control → SH_SCAP_01, SH_SCAP_02` / `apprehension_relocation → SH_STAB_01`.
쌍 없음: subscap·horizontal adduction(가설 근거) / distal neuro(차단 게이트) / target_function_reproduction(재평가 기준값 — 목 팩과 같은 처리).
순위 버킷만 바꾼다.

## 7. 목표 기능·재질문 — 확정
프리셋 4(OVERHEAD / DRESSING / LIFTING / SLEEP) + 자유. 재질문 `SH08`(부하 관련 통증 패턴, 서버 표 parity).

## 8. 금지(코드 단언) — 확정
가설 id가 운동 쪽에 없음(E-4), 진단 토큰 없음, 동결견 행 "통증 범위 내" 고정(비네트 0절), 후퇴 쌍에 어깨 → 목 없음(B-fallback).

## 9. 구동 — 어깨 우세(NS01 = SHOULDER_DOMINANT)만 어깨 팩
목 우세·유사·미응답은 목 팩. 이 문서로 어깨 팩이 승인되면서 "어깨 우세 환자는 안전 패널만"(목 CLOSED §9)이 끝난다.

## 10. 파일럿 관찰 항목 — 원장 기록
**집계**: `npm run pilot:region-observation -- shoulder`(②방향성은 미적용이라 전부 미시행으로 나온다 — 정상) / 절차·임계값은
`docs/NECK_PILOT_OBSERVATION_LOG_v1.0.md` §1~§3과 같다(부위만 바꿔 읽는다).
1. 후보 카드 문장 중 고칠 것(운동 id + 필드 + 수정 문장).
2. 원위 신경 검사 기록률(③) — 어깨는 미기록이 후보를 비우지 않으므로 기록 유도 문구가 약할 수 있다.
3. `npm run pilot:region-stage -- shoulder` 단계 분포.
4. `SH08` 응답률.
5. **야간 통증 추적**(보조 지표, 안전 지표 아님)과 **불안정 사건 수** — 카드 채택 기록의 자유 메모로.
6. SH_MOB_02 채택률·반응(동결견 대응 행) → Lee 2025 원문 확인과 함께 v1.1.
7. SH_THX_01 보류 재검토(흉추 가동 요구가 파일럿에서 반복되면 추가).
8. **irritability를 원장이 기록하고 싶어 하는가**(원문 §10 입력 9 중 유일한 미구현) → v1.1에서 전 부위 공통 필드로 신설할지.
9. 능동/수동 ROM을 실제로 나눠 기록하는 비율, resisted scaption·AC palpation 요구 빈도.

## 11. 코드 대응 (2026-09-07)
- `regionPacks/shoulder.ts` 전 필드 + `provenance` 전부 `CLINICIAN_APPROVED` + `productionApproved: true`.
- `server/detailCheck.js` `shoulder: ['SH08']`.
- `tests/shoulder-exercise-core.vignettes.spec.mjs`(엔진 구동 31단언 — 원문 대조로 4 추가: 검사 10·AROM/PROM 분기·목표 기능 재현 무쌍), `tests/region-pack.spec.mjs` 갱신(B-fallback·C·D·H·J·E-2·E-3).
