# Opus Delta Review — LBP Production v1 Batch 2 (commit 2ac30c4) — 2026-09-02

**리뷰어:** Opus (실제 모델 호출, Fable 세션의 subagent invocation; session https://claude.ai/code/session_019JGkicU3oJZVyPn7fMqPS9)
**대상:** `git diff ffaca5f..2ac30c4` (checkpoint 3eb1894 + 마무리 2ac30c4) + 신규 모듈 전체
**결과:** FAIL — 구체 결함 10건(BLOCKER 1: regressible capability UNKNOWN이 START_WITH_REGRESSION으로 승격 = CD-1 옵션 A 잔존). CD-3(capability chip 3상태) → PO 결정 요청. 결함 1~9는 Sonnet fix 커밋으로 처리(HANDOFF 참고), 10은 HANDOFF 갱신.

---

## Disposition: **FAIL** (구체 결함 10건 — BLOCKER 1: CD-1 위반)

검증: `npx tsc -b` PASS(exit 0). `test:lbp-exercise-eligibility` 20 PASS · `test:lbp-exercise-recommendation` 13 PASS · `test:lbp-exercise-core20-vignettes` PASS · `test:lbp-exercise-library` 6 PASS · `test:doctor-workspace` 211 PASS · `test:workspace-round3` 133 PASS. FROZEN zero-diff: `git diff --stat origin/main -- src/spec index.html src/App.tsx server "tablet core"` = 빈 출력 ✓.

전체 테스트가 통과함에도 FAIL인 이유: **PO가 명시적으로 기각한 CD-1 옵션 A 동작이 production 경로에 살아 있고, 그 동작을 테스트가 오히려 고정하고 있다.**

---

## A. RF-1 … RF-13

**Blank-context probe 재실행** (엔진 직접 번들, `routineCareAllowed:true / neuro UNKNOWN / caps {} / dir NOT_ASSESSED`):
`DEFER_NOT_READY 20/20`, `START_WITH_REGRESSION 0` ✓ (연구 브랜치의 8/20 재현 없음).
**neuro STABLE + caps 전부 UNKNOWN**: `START_WITH_REGRESSION 4` — **LBP_LUMBAR_03, LBP_HIP_MOB_01, LBP_HIP_STR_03, LBP_EXPOSURE_03**. → **CD-1 위반** (D1).
동일 context를 caps 전부 `'NO'`로 바꿔도 결과가 **완전히 동일** — 엔진이 `NO`와 `UNKNOWN`을 구분하지 않음을 실측으로 확인.

| RF | 판정 | 근거 |
|---|---|---|
| RF-1 | **RESOLVED** | `lbpExerciseEligibility.ts:341-349`(neuro-UNKNOWN 검사가 hard 검사 뒤, regression 반환 `:351` 앞). `regressionRequirements: regressionNeeds` 보존 ✓. 테스트 `tests/lbp-exercise-eligibility.spec.mjs:90,111,131` — 특히 `:131`(모든 capability YES인데 neuro UNKNOWN → DEFER)은 비-공허(vacuous) 검증 |
| RF-2 | **RESOLVED** | `lbpEligibilityContext.ts:118-122`, `lbpExerciseRecommendation.ts:242-246` 모두 재계산 경로. 스냅샷 미사용(파일 헤더 `:8-25`에 회귀 금지 사유 고정). B 항목 probe 참조 |
| RF-3 | RESOLVED WITH ISSUE | `lbpExerciseRecommendation.ts:246-247, 327-328` + `RehabSuggestionCard.tsx:100-106` disabled. 단 잠금 배너 미표시 구간 존재(D9) |
| RF-3b | **RESOLVED** | `lbpExerciseRecommendation.ts:251-253`(disease safety), `:260-262`(neuro). 두 경로 모두 `EMPTY_RESULT` → 후보 0. REG_01의 예외가 초록 카드로 새어나오지 않음 ✓ |
| RF-4 | **RESOLVED** | `:184` `rule('LBP_ACT_02', ['CAN_SELF_PACE','SAFE_WALKING'], [])` |
| RF-5 | **RESOLVED** | `:224` `['BALANCE_WITH_SUPPORT']` hard / `['SUPPORTED_STANDING_TOLERATED']` regressible |
| RF-6 | **RESOLVED** | `:188`(LUMBAR_02 hard QUADRUPED), `:210`, `:214`, `:217`. LUMBAR_03(`:191`)·DEEP_TRUNK_01(`:207`)은 예외대로 regressible 유지. 이동(transfer) 문구 동봉 요구도 반영: `lbpEligibilityContext.ts:68-70` "(내려가고 다시 일어나기 포함)" |
| RF-7 | **RESOLVED** | `:229` hard=SUPPORTED_STANDING / regr=HIP_HINGE_CONTROL (순환 제거) |
| RF-7b | **RESOLVED** | `:234` hard=HIP_HINGE_CONTROL / regr=LOAD_READY |
| RF-8 | RESOLVED WITH ISSUE | `:345-362`, `:399-405` — dose+stopReview 항상 동반, `progressionKo` 코드 전체에서 미참조(grep 확인: 주석 2건뿐). 그러나 회귀 시작 시 회귀 내용 누락(D2), 운동명 영어(D3) |
| RF-9 | **RESOLVED** | (i) `lbpEligibilityContext.ts:147-151` — capability는 `lbpConfirmedCapabilities`에서만 파생, directionalResponse 무관 ✓ (ii) `:99-100` + `:134-135` DISTAL_WORSENING → `{UNCLEAR, WORSENING}` ✓ (iii) `lbpExerciseEligibility.ts:110` `LbpEligibilityDirectionalResponse`(5값) vs `lbpExamSuggestions.ts:210`(6값) 충돌 해소 ✓ |
| RF-10 | **RESOLVED** | `:207` hard=NATURAL_BREATHING_TOLERATED / regr=SUPINE |
| RF-11 | **RESOLVED** | (a) `tests/lbp-exercise-eligibility.spec.mjs:111`,`:131` (b) `:71-77` rule id set === Core-20 id set (c) `tests/lbp-exercise-core20.vignettes.spec.mjs:7-33` 헤더에 "엔진 미호출" 명시 + ACT_01 REGRESS→DEFER 수정 + `:319-320` 위반 시 실패하는 assertion |
| RF-12 | RESOLVED WITH ISSUE | NOT_ASSESSED → UNKNOWN ✓ (`lbpEligibilityContext.ts:136-137`). 단 `UNCLEAR`가 `STABLE_OR_IMPROVING`으로 접힘(D6) |
| RF-13 | **RESOLVED** | `lbpExerciseRecommendation.ts:289-290` `getLbpExerciseEligibilityRule` 가드. 57 카탈로그 순회 throw 경로 없음 |
| CD-1 | **NOT RESOLVED** | D1 |
| CD-2 | RESOLVED WITH ISSUE | D9 |

---

## B. RF-2 (BLOCKER) — 재계산 safety

Probe: `CLEAR_AXIAL_BASE` payload(스냅샷 `lbp_safety_status==='CLEAR'` 확인) + 원장 `SEVERE_OR_PROGRESSIVE` → `blocked='SAFETY_REVIEW'`, `readyCandidates=[]`, `awaitingCapabilityCandidates=[]`. ✓ (`tests/lbp-exercise-recommendation.spec.mjs:152-164`가 스냅샷 CLEAR를 먼저 assert해 비-공허함.)
`lbpExamSuggestions.ts`의 스냅샷 사용은 그대로이나 Batch 1의 수용된 단순화라 범위 밖.

## C. RF-3 / RF-3b / CD-2

- disease safety ≠ CLEAR → `EMPTY_RESULT(..., 'SAFETY_REVIEW', ...)`, 후보 0 ✓. neuro NEW_OR_WORSENING도 동일 ✓ (probe: `neuroStatus='NEW_OR_WORSENING'` 엔진 단독은 REG_01만 DEFER로 남지만, 추천 모듈이 그 위에서 블록 전체를 접어 REG_01이 화면에 나오지 않음 — RF-3b의 목적 달성).
- **관찰**: `neuroStatus='NEW_OR_WORSENING'`은 오직 `lbp_objective_motor_deficit==='SEVERE_OR_PROGRESSIVE'`에서만 발생하고, 그 값은 `src/spec/lbpLogic.ts:217-221`에서 항상 URGENT_REVIEW를 만든다 → **`NEURO_REFRESH` 분기는 현재 도달 불가**(Batch 3 G12에서 살아남). 구현자가 테스트 주석 `:173-181`에 명시함 — 수용.
- CD-2: `blocked=null`, 후보 렌더 유지, `treatmentSafetyLocked=true`, 채택 버튼만 `disabled` ✓. 배너 문구 `TREATMENT_SAFETY_LOCKED_MESSAGE_KO`는 "치료 안전(임신 등)" — 진단명 아님, `computeTreatmentSafetyStatus`(pregnancy 전용)와 일치 ✓.

## D. CD-1

부분 충족: hard 미확인 → `awaitingCapabilityCandidates` + tappable chip(`PainWorkspace.tsx:188-213`) ✓ / `lbpConfirmedCapabilities` 영속(`persistence.ts:196-210`, `DoctorWorkspace.tsx:706-711`) ✓ / 확인 시 즉시 승격(테스트 `:278-299`) ✓ / **'NO' 추론 경로 없음**(`lbpEligibilityContext.ts:150` YES|UNKNOWN만) ✓ / **reasonsKo 문자열 매칭 없음** — 대신 optimistic 재평가(`lbpExerciseRecommendation.ts:306-316`) ✓.
**미충족: regressible 요구조건의 UNKNOWN이 START_WITH_REGRESSION으로 자동 승격 → D1.**

## E. RF-8

`candidateToRehabSuggestion`/`buildLbpAdoptionText` 모두 `startingDoseKo` + `stopReviewKo` 전체 포함, `progressionKo` 미사용 ✓. 채택은 `status==='ACCEPTED'`인 카드의 명시적 클릭에서만(`RehabSuggestionCard.tsx:95-108`) ✓. `appendLbpAdoptionText`는 동일 문자열 재삽입 방지로 idempotent ✓(테스트 `:349-358`). 단 D2/D3.

## F. RF-9 — 위 표 참조. 3개 항목 모두 충족.

## G. RF-11 — 위 표 참조. `NOT_RELEVANT_TODAY`는 하네스 내부 관찰 라벨로만 존재하고 엔진 상태로 매핑되지 않음(하네스가 엔진을 import조차 하지 않음) ✓.

## H. 추천 의미론

- Core-20만 순회(`LBP_CORE_EXERCISE_METADATA`), 57 카탈로그 랭킹 없음 ✓
- TF 필터 `lbp_tf_* ↔ enum` 매핑 정확, `lbp_tf_custom` 미매핑 ✓ (`:47-57`), `CUSTOM_ONLY` 구분 ✓
- 랭킹 = `directlySupported` 2-버킷 partition, 숫자 점수 없음 ✓ (`:221-225`)
- NEURAL_01 `directlySupported`는 `lbp_exam_neurodynamic.result.status==='POSITIVE'`일 때만 ✓ (`:202-203`, `:280-281`; NOT_YET_CHECKED/NEGATIVE/부재 전부 false — 테스트 `:236-274`)
- **동점을 코드 순서로 잘라내지 않음 ✓ (아무것도 자르지 않으므로) — 그러나 "3개 + 더 보기"가 구현되지 않음 → D4.** 실측: `lbp_tf_work` 하나만 선택 + capability 전부 확인 시 READY **11개**가 전부 펼쳐진 카드로 렌더.

## I. UI / 배치 / 불변조건

| 항목 | 판정 |
|---|---|
| 판단·처치 레인, 최종 판단 카드 다음 | ✓ `DoctorWorkspace.tsx:662-715`, 테스트 `doctor-workspace.spec.mjs:1912-1940`(문서 순서 assert) |
| 렌더 사이트 정확히 1곳 | ✓ grep: `<PainExerciseSection` 1건(`:674`) |
| 목표 기능 미선택 시 안내 1줄 | ✓ `PainWorkspace.tsx:477-493` + 테스트 `:2014-2022` |
| reload merge가 ACCEPTED/HELD/REJECTED 덮어쓰지 않음 | ✓ `:375-389`(status/지시문 보존, 미결정 stale만 제거) |
| 파생 후보 미영속 | ✓ 매 렌더 재계산(`DoctorWorkspace.tsx:471-477`), 저장은 원장 결정 시 upsert만 |
| synthetic fixture 무변경 | 데이터 ✓ (`!synthetic` 가드 `:473`). 단 렌더 동작은 미세 변화 → D7 |
| 비-LBP pain 레코드 무변경 | ✗ → D7 |
| FROZEN zero-diff | ✓ |
| Primary/Secondary 전략 UI 없음 | ✓ `strategyLabelKo`는 rationale 한 줄 라벨로만 사용 |
| 새 태블릿 문항 없음 | ✓ (coreSpec/index.html zero-diff) |
| 한국어 우선 라벨 | ✗ → D3 |

## J. 구현자 선언 항목 검증

1. `ws()`의 `painExamSuggestions: []` — ✓ 필요(`lbpExerciseRecommendation.ts:280`이 이 배열을 읽음), 타입상 항상 존재하므로 안전.
2. 빈 화면 힌트 트리거 조건 — ✓ `PainWorkspace.tsx:477-483`이 `rehabSuggestions`(merge **후**) + awaiting 둘 다 비었을 때만. stale ACCEPTED 항목이 남으면 힌트 대신 카드가 렌더됨(주장대로).
3. 한약-primary "+ 다른 유형 입력 추가" 경로 — ✓ `DoctorWorkspace.tsx:722-741`은 `PainFinalAssessmentCard`만 렌더, `PainExerciseSection` 없음. 이전과 동일.
4. CUSTOM_ONLY 힌트 문구 — 비임상 안내문 ✓.
5. checkpoint-era 주장(마무리 커밋이 규칙 행을 바꾸지 않음) — ✓ `git diff e73a9af..2ac30c4 -- lbpExerciseEligibility.ts lbpExerciseCoreMetadata.ts lbpExerciseLibrary.ts` = 빈 출력. 규칙 표 20행은 직접 대조해 RF-1/4/5/6/7/7b/10 전부 반영 확인.

---

# 구현자가 고쳐야 할 구체적 결함

**1. [BLOCKER · CD-1 위반] regressible 요구조건의 UNKNOWN이 START_WITH_REGRESSION으로 자동 승격된다**
`src/doctor/workspace/lbpExerciseEligibility.ts:329-331` — `capabilityValue(...) !== 'YES'`가 `'NO'`와 `'UNKNOWN'`을 합친다. adapter(`lbpEligibilityContext.ts:150`)는 `'NO'`를 절대 만들지 않으므로 **production의 모든 회귀 승격은 미확인에서 나온다.** 실측(neuro STABLE, 확인 0건, 목표기능 선택만 한 상태): `LBP_LUMBAR_03`, `LBP_HIP_MOB_01`, `LBP_HIP_STR_03`, `LBP_EXPOSURE_03`가 `readyCandidates`에 "(쉬운 단계로 시작)" 카드로 올라오고 즉시 채택 가능하다. 그중 둘은 `SUPPORTED_STANDING_TOLERATED + BALANCE_WITH_SUPPORT`가 미확인 상태 — RF-5가 낙상 안전을 이유로 FUNC_01에서 hard로 올린 바로 그 쌍이다. DECISIONS.md 2026-09-02 "CD-1 옵션 B"가 명시적으로 기각한 옵션 A 동작.
**최소 수정:** `:329-331`을 두 갈래로 분리 — `const regressionNeeds = rule.regressibleRequirements.filter(c => capabilityValue(context,c)==='NO')`, `const unconfirmedRegressible = ...filter(c => capabilityValue(context,c)==='UNKNOWN')`. `:351`의 START_WITH_REGRESSION 반환 **앞**에 `if (unconfirmedRegressible.length>0) return { state:'DEFER_NOT_READY', missingHardRequirements:[], regressionRequirements: unconfirmedRegressible, reasonsKo:['시작 단계를 정하는 데 필요한 준비 조건이 아직 확인되지 않았습니다.'] }`. 추천 모듈은 수정 불필요(optimistic 재평가가 자동으로 `awaitingCapabilityCandidates`로 보냄).
**동반 테스트 수정(현재 결함을 고정 중):** `tests/lbp-exercise-eligibility.spec.mjs:151`(`LOAD_READY:'UNKNOWN'`), `:191`(`SUPPORTED_STANDING_TOLERATED:'UNKNOWN'`), `:239`(`HIP_HINGE_CONTROL:'UNKNOWN'`) → `'NO'`로 바꿔 원래 RF 의미를 유지하고, 각각 `'UNKNOWN'` → DEFER + `regressionRequirements` 포함 케이스를 새로 추가. 추천 레벨에도 "확인 0건 → readyCandidates 빈 배열" 회귀 테스트 1개 추가.

**2. [HIGH · RF-8] 회귀 시작으로 판정된 운동이 Care Plan에는 as-written 용량으로 들어간다**
`src/doctor/workspace/lbpExerciseRecommendation.ts:399-405` — `buildLbpAdoptionText(exerciseId)`가 id만 받아 `meta.startingDoseKo`를 그대로 쓴다. 실측: 카드 제목 `"hip flexor (쉬운 단계로 시작)"` → 채택 텍스트 `"hip flexor — 20~30초 × 2회/측, 하루 1~2회부터 시작. 중단·재검토: …"`. 회귀 표시(`:347`의 `regressionNote`)도 `regressionKo`("보폭을 줄이고 벽/의자 지지…")도 전부 사라진다. 카드에도 `regressionKo`는 어디에도 표시되지 않는다.
**최소 수정:** `buildLbpAdoptionText(candidateOrId, opts?: { regressed: boolean })`로 바꿔 `regressed`일 때 `쉬운 단계: ${meta.regressionKo}`를 dose 뒤에 덧붙이고, `appendLbpAdoptionText`가 `suggestion.title`의 회귀 표식 대신 이 플래그를 전달하도록 한다. 카드에도 `regressionKo`를 `sourceFacts` 한 줄로 노출. (`progressionKo` 금지는 유지 — `regressionKo`는 시작 수준 조정이라 RF-8 금지 대상이 아니다.) 결함 1 수정 후 v1에서 도달 불가가 되더라도 코드 경로는 바로잡을 것.

**3. [HIGH] 환자용 "집에서 할 일"에 영어 운동명이 그대로 들어간다**
`lbpExerciseRecommendation.ts:206`(카드 제목), `:404`(채택 텍스트)가 `catalogItem.canonicalName`을 쓴다. Core-20 중 **17개가 영어**다(`interval walking`, `cat-camel`, `prone-on-elbows`, `sciatic slider`, `deadlift pattern`, `Bird-dog`, `hip hinge`, …). 채택 텍스트는 `PainCarePlan.homeActionPlan` → `patientCarePlanPreview.ts:32` "집에서 할 일"로 **환자에게 그대로 출력**된다(고령 1차 진료 인구).
**최소 수정:** Core-20 metadata 행에 `displayNameKo`를 추가(카탈로그 `canonicalName`은 ID/출처 충실성 때문에 **그대로 보존**)하고 `:206`/`:404` 두 곳에서만 사용. 한국어 명칭 자체는 원장/PO 확인 필요(임상 규칙이 아니라 명명이므로 결정 대기 없이 초안 제시 가능).

**4. [MEDIUM · §2.2] "3개 표시 + 더 보기"가 없다**
`PainWorkspace.tsx:501` — `rehabSuggestions.map(...)`로 전부 렌더. 실측: 목표기능 `lbp_tf_work` 하나만 선택해도 READY 11개(각 카드에 accept/hold/reject + 자유입력)가 1024×768 판단·처치 레인에 전부 펼쳐진다. §2.2는 "3개 표시 + 더 보기(동점을 코드 순서로 잘라내지 않음)", Batch 2 제목은 "운동 2~3개 추천".
**최소 수정:** 앞 3개만 렌더하고 나머지를 `<details><summary>더 보기 (N)</summary>`로 감싼다(잘라내지 않으므로 동점 문제 없음).

**5. [MEDIUM] capability 확인 chip을 취소할 방법이 없다**
`DoctorWorkspace.tsx:706-711` — `onConfirmLbpCapability`는 append만 한다. 확인하는 순간 해당 운동이 awaiting 목록에서 빠지므로 chip 자체가 화면에서 사라져 **오탭을 되돌릴 UI가 존재하지 않는다.** 확인 대상에는 낙상 안전 대리 지표(`BALANCE_WITH_SUPPORT`)가 포함된다.
**최소 수정:** 핸들러를 toggle로 바꾸고, `LbpAwaitingCapabilitySection`(또는 그 아래)에 "확인된 준비 조건" chip 행을 `aria-pressed="true"`로 렌더해 재탭 시 해제되게 한다(기존 `workspace__statusBtn` toggle 패턴과 동일).

**6. [LOW · RF-12 정신] `UNCLEAR`가 `STABLE_OR_IMPROVING`으로 접힌다**
`lbpEligibilityContext.ts:133-138` — `DISTAL_WORSENING`/`NOT_ASSESSED`만 분기하고 나머지는 전부 `STABLE_OR_IMPROVING`. 즉 원장이 "불명확"을 기록해도 원위부 반응은 "안정적"으로 번역된다. 현재 엔진은 `'WORSENING'`만 보므로 동작상 무해하나, CLOSED 문서의 "불명확/미평가를 정상으로 숨은 변환 금지"에 정면으로 어긋나고 Batch 3 재평가가 이 필드를 소비하는 순간 살아난다.
**최소 수정:** `'UNCLEAR'` → `'UNKNOWN'`으로 명시 매핑 추가(`NO_CLEAR_DIRECTION`은 방향성 부재이지 원위부 불명확이 아니므로 현행 유지 가능 — 주석으로 구분 근거를 남길 것).

**7. [LOW] 비-LBP pain 레코드에 없던 채택 버튼이 생겼다**
`DoctorWorkspace.tsx:692-702`가 `onAdoptRehabSuggestionToCarePlan`을 **모든** pain/mixed 레코드에 무조건 전달한다. 이전 `PainWorkspaceLane2`는 `RehabSuggestionCard`에 `onAdoptToCarePlan`을 아예 넘기지 않았다. 결과적으로 어깨 등 비-LBP 레코드와 SYNTHETIC 프리뷰(`PAIN_1_REHAB`)에서도 ACCEPTED 상태가 되면 "치료 계획에 가져오기 →"가 나타나고 `(예시) …` 텍스트가 Care Plan에 append될 수 있다.
**최소 수정:** `onAdoptRehabSuggestionToCarePlan={isLbpRecord ? (suggestion)=>… : undefined}`.

**8. [LOW] `LBP_LUMBAR_02`는 production에서 절대 추천될 수 없다**
`lbpExerciseCoreMetadata.ts` LUMBAR_02의 `targetFunctions`는 `['FLEXION','EXTENSION','CUSTOM']`이고, `TARGET_FUNCTION_ID_TO_ENUM`(`lbpExerciseRecommendation.ts:48-57`)에는 FLEXION/EXTENSION/CUSTOM으로 가는 `lbp_tf_*` id가 하나도 없다. → Core-20 중 **19개만 도달 가능**. RF-6로 규칙을 고친 행이 정작 화면에 나올 수 없다.
**최소 수정:** 도달 가능성 assertion 테스트를 추가해 현재 미도달 집합을 명시적으로 고정하고(무성장 보장), LUMBAR_02를 v1에서 의도적으로 미노출로 둘지 `targetFunctions`를 보강할지 문서에 한 줄 기록. (보강은 임상 판단이므로 임의로 하지 말 것.)

**9. [LOW · CD-2 표시] 치료 안전 잠금 배너가 안 보이는 구간이 있다**
`PainWorkspace.tsx:495-499` — 잠금 문구가 `rehabSuggestions.length > 0` 블록 **안에만** 있다. READY 후보가 0이고 "확인하면 시작 가능"만 있는 임신 가능 환자는 잠금 사유를 전혀 보지 못한다.
**최소 수정:** 잠금 힌트를 `PainExerciseSection` 최상단(두 그룹 공통)으로 올린다.

**10. [PROCESS] `HANDOFF.md`가 실제 Git 상태와 어긋난다**
`HANDOFF.md:3,17-28`은 아직 "Batch 2 코드는 작업 트리에 staged/미커밋", "다음 행동(PO 지시 필요)"이라고 기록하고 있으나 HEAD `2ac30c4`는 Batch 2가 커밋·검증 완료된 상태다. CLAUDE.md("어긋나면 Git이 항상 맞다 — 발견 즉시 고친다") 및 Definition of Done 위반. (본 리뷰는 읽기 전용이라 수정하지 않음.)

---

# CLINICAL DECISION REQUIRED

**CD-3 — 결함 1을 고치면 `START_WITH_REGRESSION` 계층 전체가 v1에서 사용 불가가 된다. capability chip에 세 번째 상태("지금은 안 됨")를 둘 것인가?**

adapter가 `'NO'`를 만들 수 없으므로(음성 확인 UI 부재), CD-1 옵션 B를 정확히 구현하면 회귀 시작 판정은 **구조적으로 도달 불가**가 된다. 즉 "이 자세는 지금 못 한다"는 것을 원장이 확실히 아는 환자에게도, 시스템은 저장된 회귀(Opus 보정 검증 §5가 이 라이브러리에서 가장 안전하게 쓰였다고 평가한 부분)를 전혀 제공하지 못하고 해당 운동을 계속 "보류"로만 표시한다.

- **질문:** chip을 `확인함 / 지금은 안 됨 / 미확인` 3상태로 확장해 `'NO'`를 표현 가능하게 하고 회귀 계층을 살릴 것인가, 아니면 v1에서는 회귀 계층을 의도적으로 비활성으로 두고 Batch 2.5로 미룰 것인가?
- **권고 기본값:** **Batch 2.5에서 3상태 chip 도입.** 근거 — (a) CD-1의 목적은 "미확인을 시작 가능으로 바꾸지 않는 것"이지 "알려진 제한에 회귀를 주지 않는 것"이 아니다; (b) 3상태는 CLOSED 문서의 `정상/이상/불명확/제한/미시행/미평가 불합치` 원칙(§8-5, G15) 및 이미 예정된 `ExamCheckStatus` 6상태 확장과 같은 방향이다; (c) 그 전까지도 **결함 1 수정은 그대로 진행해야 한다** — 미확인을 시작 가능으로 표시하는 것이 회귀를 못 주는 것보다 명백히 더 위험하다.

---

# No-action observations

- `NEURO_REFRESH` 분기는 현재 도달 불가(FROZEN `lbp_objective_motor_deficit==='SEVERE_OR_PROGRESSIVE'`가 항상 URGENT_REVIEW를 만들어 `SAFETY_REVIEW`가 선점). Batch 3 G12에서 살아나므로 삭제하지 말 것. 구현자가 테스트 주석에 명시함 — 수용.
- `directlySupported`는 랭킹 라벨일 뿐 gate가 아니며, `rule.requiredDirectionalResponse != null`은 READY에 도달한 시점에서 방향 gate를 이미 통과했음을 의미하므로 논리적으로 정확하다.
- 전략 라벨 5종(`증상반응 활용`/`신체·기능능력 회복`/`신경가동성 관리`/`단계적 노출·복귀`/`호흡·이완 보조`)은 관리 지향이며 진단명이 아니다. rationale 한 줄에만 쓰이고 클릭 단계가 아니다 — §2.2/§3 준수.
- `treatmentSafetyLocked` 차단이 UI `disabled` 속성에만 의존한다(`DoctorWorkspace.tsx:692`의 핸들러 자체에는 가드 없음). 클리닉 LAN 전용 앱이라 악용 경로는 아니나, 향후 `appendLbpAdoptionText` 호출부에 방어 가드를 두면 비용 없이 견고해진다.
- `lbpConfirmedCapabilities`는 revisit carry-forward 대상이 아니다(`revisitCarryForward.ts` 규칙 3 "객관적 소견은 이월하지 않음"과 일치) — 정확하다.
- `mergeLbpRehabSuggestions`가 fresh 필드로 덮고 status/지시문만 보존하는 방향은 옳다(오래된 파생 문구가 남지 않음). 결정된 stale 항목만 스냅샷이 남는데, 이는 주석대로 의도된 절충.
- vignette 하네스의 `LBP_LOAD_02 = REGRESS`(`:178`)는 RF-7b 이후 규칙 표와 임상 기대가 일치하는 상태로, 유효한 교차 확인점이다. 결함 1 수정 후에도 vignette는 `'NO'` 상황을 기술하는 것이므로 그대로 두면 된다.