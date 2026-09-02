# Opus Delta Review — LBP Production v1 Batch 1 (commit 9533414) — 2026-09-02

**리뷰어:** Opus (실제 모델 호출, Fable 세션의 subagent invocation; session https://claude.ai/code/session_019JGkicU3oJZVyPn7fMqPS9)
**대상:** `git diff 6b348fe..9533414` + 신규 파일 전체
**후속:** 6개 결함은 commit `2f37946`에서 수정됨. closing review 결과는 같은 디렉터리의 closing 문서 참고.

---

## Disposition: FAIL

핵심 임상 의미(A/B/D/E)와 불변조건(F)은 모두 충실하다. 그러나 **구체적 결함 2건(재진 화면 목표기능 chip 부재로 인한 picker dead-end, 회귀 보호를 실제로는 잃어버린 vacuous assertion)** 이 있어 §5 루프의 "Sonnet concrete fix → Opus closing"으로 되돌린다. 설계·규칙표 자체를 다시 열 필요는 없다.

검증 실행 결과: `test:lbp-exam-suggestions` 22 PASS · `test:doctor-workspace` 205 PASS · `test:workspace-round3` 133 PASS · `test:emrSummary` 14 PASS · `test:save-conflict` 102 PASS · `npx tsc -b` exit 0 · `npm run build` OK.

---

## A. §6-1 — `leg_symptom_present === 'YES'` → 하지직거상/슬럼프

**Verdict: 승인 (faithful).** UNKNOWN 비트리거도 정확.

- `src/doctor/workspace/lbpExamSuggestions.ts:139-145` — `flags.leg_symptom_present === 'YES'`에 대한 엄격한 등가비교. `UNKNOWN`/`NO`는 어떤 경로로도 트리거하지 않는다.
- FROZEN 의미 대조: `src/spec/lbpLogic.ts:114-125` `computeLegState`는 concrete extent/side/neuro가 있을 때만 `YES`, `BACK_ONLY + NONE + ['NONE']`일 때만 `NO`, 나머지는 전부 `UNKNOWN`. 즉 `YES`는 "환자가 실제로 하지 증상을 보고했다"는 CLOSED 계산값이고, 이를 SLR/슬럼프에 연결한 것은 §14 "leg symptom → SLR/Slump"의 정확한 직결이다.
- v0.1 엔진은 더 좁은 `radicularCue === 'PRESENT'`를 썼으나(`buildNeurodynamicCheck` 호출부, 연구 브랜치 engine:530), 그 cue의 파생 규칙은 어디에도 정의된 적이 없다. `leg_symptom_present`로의 확장은 **더 넓은 쪽(=더 자주 제안)** 이고, 제안 자체가 `CONTEXTUAL` + `SUGGESTED` + 치료 blocker 아님이므로 임상적으로 안전한 방향의 근사다. 반대 방향(놓침)이 아니다.
- 검증: `tests/lbp-exam-suggestions.spec.mjs:156-190` (YES → 추가, UNKNOWN → 미추가, 실제 spec builder로 계산된 payload).

## B. §6-2 — `claudication_walking === 'YES'` → 보행 가능시간·거리

**Verdict: 승인. 키도 정확.**

- `lbpExamSuggestions.ts:147` `payload.responses?.modules?.lbp?.claudication_walking === 'YES'`.
- 키 대조: `src/spec/coreSpec.ts:4893` `claudication_walking: r['LBP_08']`. 문항 원문 `coreSpec.ts:1299-1313` "서 있거나 걸을수록 엉덩이·다리 증상이 더 심해지나요?" (YES/NO/UNKNOWN). reasonFacts 문구(`lbpExamSuggestions.ts:150`)가 문항 원문과 일치하고 `provenance: 'PATIENT_FACT'`로 표기된다 — 파생값이 아니라 원문 답변임을 정확히 반영.
- LBP_08은 `showIf` 조건부라 미표시 시 `null` → 트리거 안 함(fail-closed). UNKNOWN도 비트리거. 검증: `spec.mjs:167-183`.

## C. §6-3 — 별도 신경학적 기본검사 자동 제안을 두지 않는 것

**Verdict: 조건부 승인 — 일반 규칙은 유지, 단 한 가지 좁은 구멍은 메워야 한다 (아래 Fix #5).**

- 중복 위험 없음이 확인됨: `ObjectiveExamFindingsCard`는 `DoctorWorkspace.tsx:554-556`에서 `showLbp={payload.responses.safety_flags.lbp != null}`로, **safety 상태와 무관하게 모든 LBP 환자에게 레인2 최상단(LBP 블록 바로 위)** 에 렌더된다. `lbp_exam_neuro_baseline`을 매번 자동 제안하면 같은 화면 같은 레인에서 클릭 2개가 겹친다 — 억제 판단은 옳다.
- 그러나 **누락 위험이 실재하는 경우가 정확히 하나 있다.** FROZEN이 이미 "필요"라고 *계산해 놓은* 경우다: `computeNeuroBaselineRequired` (`lbpLogic.ts:148-153`, 양쪽 다리 통증인데 concrete neuro feature 없음) → `lbp_neuro_baseline_required === true`. 이 환자는 `lbp_leg_side==='BILATERAL'`이므로 `leg_symptom_present === 'YES'`이고, 다른 트리거가 없으면 `lbp_safety_status`는 `CLEAR`로 남는다. 결과적으로 화면에서 이런 일이 벌어진다:
  - 레인1 `LbpSafetyPanel` (`DoctorView.tsx:921-925`): "**신경학적 기저검사 필요**(양쪽 다리 통증만, 자동 긴급 아님)" 칩이 뜬다.
  - 레인2 "오늘 확인할 것": 목표 동작 재현 + SLR/슬럼프만. **감각·반사를 다루는 항목은 없다.** 옆의 객관적 근력저하 라디오는 *근력만* 커버한다(`ObjectiveExamFindingsCard.tsx:186`, `LBP_MOTOR_DEFICIT_OPTIONS`).
  - 즉 "시스템이 필요하다고 계산한 검사"가 체크리스트에 나타나지 않고, 원장이 레인1 칩을 본 뒤 `확인 추가`를 열어 직접 넣어야만 한다.
- 이건 새 임상 의미가 아니라 **이미 CLOSED된 FROZEN 계산값을 체크리스트에 연결하는 일**이며, 규칙 (b)/(c)와 정확히 같은 성격이다. 그래서 PO 결정 사항이 아니라 내 판단 범위로 보고 Fix #5로 요구한다.

## D. §6-4 — `lbp_safety_status !== 'CLEAR'`면 자동 제안 전면 생략

**Verdict: 승인. 안전 회귀 없음. 오히려 브리프 최소치보다 낫다.**

- `lbpExamSuggestions.ts:131` 가드. `spec.mjs:192-203`에서 REVIEW_REQUIRED(외상 YES)·URGENT_REVIEW(CES) 모두 `[]` 확인.
- **숨김 위험 없음**: `PainWorkspace.tsx:305-322`에서 LBP 블록은 `isLbp`이면 examSuggestions가 비어도 항상 렌더되고, `LbpAddExamDisclosure`(`PainWorkspace.tsx:129-160`)는 `LBP_CLINICIAN_ADDABLE_EXAMS` 5개를 safety 상태와 무관하게 항상 제공한다. 즉 억제 상태에서도 원장의 escape hatch가 완전히 살아 있다. 이건 §7.3 요구를 충족하면서 임상적으로 옳은 방향이다.
- Fail-closed 가드(`lbpExamSuggestions.ts:112-121`)가 `lbp_safety_status`/`leg_symptom_present`의 타입·값 집합을 둘 다 검사하므로 손상 레코드가 "CLEAR인 척"할 수 없다. `spec.mjs:205-219` 검증.
- **구현자 판단 #1(태블릿 시점 flags vs 원장 입력 반영 재계산)에 대한 판정: Batch 1 한정 수용, 단 Batch 2에는 구속력 있는 요구사항.**
  - 사실관계: 생성기는 `payload.responses.safety_flags.lbp`(제출 시점, `clinician_objective_motor_deficit === undefined`)를 읽는다. `LbpSafetyPanel`은 `DoctorView.tsx:900-901`에서 원장 입력을 넣어 **재계산**한다. 따라서 원장이 `SEVERE_OR_PROGRESSIVE`를 기록해 패널이 URGENT가 되어도, 생성기는 계속 CLEAR로 보고 자동 제안을 만든다(Sonnet 보고는 "이미 병합된 것이 남는다"고 했는데, 실제로는 **재로드 때마다 계속 생성된다** — 보고보다 조금 넓다).
  - 방향성 검증: `lbpSafetyStatus` (`lbpLogic.ts:209-257`)에서 `clinician_objective_motor_deficit`는 `SEVERE_OR_PROGRESSIVE`일 때 **상향만** 시킨다. `NONE`/`UNKNOWN`이 CLEAR로 낮추는 경로는 없다. 즉 이 괴리는 "덜 안전하게 보이는" 한 방향으로만 발생하고, 반대 오류(위험을 CLEAR로 오판)는 구조적으로 불가능하다.
  - 임상 판단: 남는 3개 항목은 목표 동작 재현 / SLR·슬럼프 / 보행 시간·거리로, 모두 진행성 근력저하 환자에게도 실제로 시행하는 진찰이며 치료 지시가 아니다. 레인1에 URGENT 패널과 "안전 확인 전까지 일상적인 운동/치료 추천은 잠깁니다" 문구가 상단에 그대로 뜬다. 게다가 억제되더라도 `확인 추가`로 같은 항목을 넣을 수 있으므로 실제 임상 delta는 사실상 0이다. → **Batch 1에서는 결함이 아니다.**
  - **다만 Batch 2는 다르다.** `lbpEligibilityContext.ts`/`lbpExerciseRecommendation.ts`는 *치료 산출물*을 낸다. 거기서 태블릿 시점 flags를 쓰면 원장이 방금 기록한 중증·진행성 근력저하가 운동 추천 게이트를 통과하는 실제 안전 결함이 된다. Batch 2는 반드시 `toLbpStateFromDoctorPayload(responses, lbpObjectiveMotorDeficit, age) → computeLbpFlags`의 **재계산 결과**를 게이트로 써야 한다. 이 항목을 `DECISIONS.md`에 남길 것을 권고한다.

## E. §6-5 — 방향성 반응 값 집합·라벨

**Verdict: 승인. 미평가가 정상으로 읽히는 경로 없음.**

- 값/라벨: `lbpExamSuggestions.ts:196-203`. 6개 값·순서·라벨이 §7.2와 정확히 일치하고, `NOT_ASSESSED = '미시행'`가 첫 번째.
- CLOSED 의미와의 정합: `DISTAL_WORSENING = '다리 쪽으로 퍼짐(원위부 악화)'`가 존재하고, help 문구(`:216-220`, v0.1 `buildLumbarMovementCheck` verbatim)가 "하지증상이 있다면 몸쪽으로 줄거나 더 아래로 퍼지는지도 관찰"로 원위부 방향성을 명시한다. v1에는 아직 소비자가 없으므로(Batch 2/3) 잘못된 자동 해석이 붙을 여지가 없다.
- "정상으로 읽힘" 3중 차단 실측 확인:
  1. UI 기본값이 `미시행`이고 **`aria-pressed="true"`로 눌린 상태**로 렌더된다(실제 SSR 출력으로 확인: `<button aria-pressed="true" class="workspace__statusBtn workspace__statusBtn--active">미시행</button>`). 빈 칸이 아니라 명시적 기록 상태로 보인다.
  2. EMR: `emrPreview.ts:112-114` — `NOT_ASSESSED`가 아닐 때만 line 생성. 기본값이 "정상"으로 찍히지 않는다.
  3. 영속화: `persistence.ts:259-261` + `isValidLbpDirectionalResponse`로 손상/레거시 → `NOT_ASSESSED`.
- `'뚜렷한 방향 없음'`(검사했으나 방향성 없음)과 `'불명확'`(검사했으나 판정 불가)과 `'미시행'`이 각각 구분되어 있다 — 이게 §2.3의 "미입력/UNKNOWN ≠ normal"을 만족시키는 핵심이고, 정확히 구현되었다.

## F. 불변조건

| # | 항목 | 판정 | 근거 |
|---|---|---|---|
| (i) | FROZEN/tablet/server zero-diff | **PASS** | `git diff --stat origin/main -- src/spec index.html src/App.tsx server "tablet core"` → 출력 없음(exit 0). `6b348fe..9533414` 동일 경로도 출력 없음 |
| (ii) | 새 문진 없음 | **PASS** | `src/spec/coreSpec.ts` 무변경(위와 동일). 델타 16파일 중 spec/tablet 파일 0개 |
| (iii) | 점수/가중치/우선순위 계산 없음 | **PASS** | 신규 2파일에 `sort`/`score`/`weight` 문자열 0건. `priority`는 리터럴 `'CONTEXTUAL'` 단 1곳(`lbpExamSuggestions.ts:78`). 순서는 규칙 표 선언 순서 고정 |
| (iv) | help verbatim | **PASS** | 14개 문자열 전부를 연구 브랜치 원본과 프로그램 대조 — 14/14 완전 일치 (`buildTargetFunctionCheck`/`buildNeurodynamicCheck`/`buildWalkingToleranceCheck`/`buildHipCheck`/`buildSijCheck`/`buildObjectiveNeuroCheck`/`buildLumbarMovementCheck`) |
| (v) | 영속화 | **PASS** | 레거시(필드 없음)·손상값·wrong-type → `NOT_ASSESSED` (`workspace-round3.spec.mjs:86-110`). merge는 기존 `result`를 절대 건드리지 않고(`lbpExamSuggestions.ts:173-180`) 멱등(`spec.mjs:278-283`). `WORKSPACE_STATE_SCHEMA_VERSION` 미상향(additive) |
| (vi) | synthetic 시나리오·비-LBP 무회귀 | **PASS** | `seedWorkspaceState`의 synthetic 분기(`DoctorWorkspace.tsx:106-116`)가 merge를 타지 않음. `doctor-workspace.spec.mjs` 205 assertion 전부 통과, PAIN_SCENARIO_3(어깨) 무변경 확인 |

**구현자 판단 #2 (herbal default 시딩) — 4개 분기 전부 보존 확인:**
- synthetic + initial → `deserializeWorkspaceState(initial)` (`:108`) = 종전과 동일
- synthetic + no initial → `synthetic.clinicianObservations ?? defaultClinicianObservations()` (`:113`) = 동일
- non-synthetic + no initial → `{ ...emptyWorkspaceState(), herbalClinicianObservations: defaultClinicianObservations() }` (`:124`) = 동일 (`emptyWorkspaceState`가 나머지 3배열을 이미 `[]`로 줌)
- non-synthetic + initial → `deserializeWorkspaceState(initial)` (`:123`) = 동일 ✔

**구현자 판단 #4 (`placeholders` prop):** presentation-only 확인. `FollowUpTargetPicker.tsx:115` `placeholders?.[t.id] ?? '현재(오늘) 기준값 — 선택'` — 미전달 시 종전 문자열 그대로. `lbp_tf_custom`에만 매핑(`lbpTargetFunction.ts:43-45`).

**구현자 판단 #5 (coreSpec 직접 번들):** 타당. 실제 production builder chain으로 payload를 만들어(`spec.mjs:121-133`) 손으로 쓴 `safety_flags.lbp`를 쓰지 않으므로, spec이 바뀌면 테스트가 같이 깨진다. 오히려 `fixtures.ts` 재사용보다 나은 선택.

**id 충돌 없음:** `lbp_tf_*` 9개 vs `PAIN_FOLLOW_UP_OPTIONS`(`pain_intensity`/`movement_function`/`symptom_reproduction`) — 교집합 0. `MAX_FOLLOW_UP_TARGETS = 3` 불변.

## G. 구체적 결함

아래 "고쳐야 할 항목" 1~2번이 여기 해당한다. 그 외 크래시 경로·키 오류·게이팅 오류는 없었다 (`generateLbpExamSuggestions({})`도 `[]` 반환, `spec.mjs:217-219`).

---

# 고쳐야 할 구체적 결함

### 1. [MEDIUM] 재진 화면에서 carry-forward된 목표기능이 해제 불가능하고, picker가 dead-end가 된다
- **위치:** `src/doctor/workspace/RevisitWorkspace.tsx:99`, `:558-563`
- **무엇이 잘못됐나:** `const COMBINED_FOLLOW_UP_OPTIONS = [...PAIN_FOLLOW_UP_OPTIONS, ...HERBAL_FOLLOW_UP_OPTIONS]` 에 `LBP_TARGET_FUNCTION_OPTIONS`가 없다. 그런데 `revisitCarryForward.ts:224-234` `trackingOnly()`는 id whitelist가 없어 `lbp_tf_*`를 그대로 통과시키고, `RevisitWorkspace.tsx:532`의 "기존 Follow-up Target 유지" 버튼이 그것을 재진 state로 복사한다. `FollowUpTargetPicker`는 chip을 `options`에서만 그리므로(`FollowUpTargetPicker.tsx:64-84`) 결과적으로:
  - 걷기 등 목표기능은 값 입력 row로만 나타나고 chip이 없다 → **선택 해제 수단이 아예 없다**(값 row에 제거 버튼도 없음, `:105-130` 확인).
  - `atMax = selected.length >= 3` (`:35`)은 그대로 세므로, 1차 방문에서 목표기능 3개를 골랐던 환자의 재진 화면은 **전 chip이 disabled, 선택된 chip은 0개** — 재평가 대상을 아예 바꿀 수 없는 막다른 상태가 된다.
  - Batch 1 이전에는 `COMBINED`가 pain+herbal을 모두 덮어 이 상황이 발생할 수 없었다. 이 델타가 처음으로 `options` 밖 id를 picker에 도달시킨다. 하필 §2.1의 v1 핵심 흐름("다음 방문에는 같은 목표 기능으로 반응을 본다")이 지나는 경로다.
- **최소 수정:** `RevisitWorkspace.tsx:99`를 `[...LBP_TARGET_FUNCTION_OPTIONS, ...PAIN_FOLLOW_UP_OPTIONS, ...HERBAL_FOLLOW_UP_OPTIONS]`로 바꾸고 `./lbpTargetFunction`을 import (선택적으로 `PainWorkspaceNext`와 같은 `groups` 라벨도 전달). 새 임상 의미·새 필드·새 영속화 없음.
- **더 튼튼한 대안(권장, 위와 병행 가능):** `FollowUpTargetPicker.tsx:82`의 `ungrouped` 계산 직후, `selected` 중 `options`에 없는 항목을 chip 목록에 자동으로 덧붙인다. 그러면 어느 호출자가 어떤 옵션 집합을 넘기든 "해제 불가능한 선택"이 구조적으로 생길 수 없다.
- 회귀 테스트: 재진에서 `lbp_tf_walking`을 carry-forward한 뒤 해당 chip이 `aria-pressed="true"`로 렌더되는지 assert.

### 2. [MEDIUM] 좁힌 assertion이 실제로는 **한 번도 실행되지 않는다** (회귀 보호 소실)
- **위치:** `tests/doctor-workspace.spec.mjs:788-793`
- **무엇이 잘못됐나:** `html.match(/아직 확인 안 됨 · \d+건 — ([^<]*)</)` 가 **항상 `null`** 이다. `ExamSuggestionList.tsx:28`은 `아직 확인 안 됨 · {n}건 — {titles}`처럼 인접한 동적 텍스트 노드를 쓰고, React 18 `renderToString`이 그 사이에 `<!-- -->`를 삽입하기 때문이다. 실제 SSR 출력을 직접 뽑아 확인했다:
  ```
  아직 확인 안 됨 · <!-- -->1<!-- -->건 — <!-- -->목표 동작 재현
  regex match: null
  ```
  따라서 `if (pendingCounterMatch) { ... }` 본문은 절대 실행되지 않고, 이 테스트가 지키던 원래 의도("reload된 POSITIVE 결과가 pending으로 바뀌면 안 된다")는 **지금 전혀 검증되지 않는다.** 통과는 하지만 vacuous다. 구현자 판단 #3은 **불충족**.
- **최소 수정:**
  ```js
  const bannerIdx = html.indexOf('아직 확인 안 됨 ·')
  assert.ok(bannerIdx !== -1, 'Batch 1 이후 목표 동작 재현이 pending으로 배너에 나타난다')
  const banner = html.slice(bannerIdx, html.indexOf('</p>', bannerIdx))
  assert.ok(banner.includes('목표 동작 재현'), '새로 병합된 자동 제안은 pending에 포함된다')
  assert.ok(!banner.includes('SLR 검사'), 'reload된 POSITIVE SLR은 절대 pending에 포함되지 않는다')
  ```
  (`indexOf`/`slice`는 `<!-- -->` 삽입에 영향받지 않는다.)

### 3. [LOW-MED] PAIN_SCENARIO_2 테스트가 "자동 병합"과 "확인 추가 목록"을 구분하지 못한다
- **위치:** `tests/doctor-workspace.spec.mjs:1928-1931`
- **무엇이 잘못됐나:** `assert.ok(html.includes('하지직거상 또는 슬럼프검사'))` 뿐인데, 이 제목은 `LBP_CLINICIAN_ADDABLE_EXAMS`에도 동일 문자열로 존재한다(`lbpExamSuggestions.ts:94`). 자동 병합이 완전히 깨져도 `확인 추가` 목록 때문에 이 assertion은 통과한다. 게다가 테스트 이름이 약속한 후반부("is no longer offered in 확인 추가")는 아예 assert되지 않았다.
- **최소 수정:** 자동 생성분에만 있는 근거 문구로 구분하고, 추가 목록 부재를 함께 assert한다.
  ```js
  assert.ok(html.includes('하지 통증·저림/신경증상 보고(환자 응답)'),
    'PATIENT_FACT 근거를 가진 자동 생성 항목으로 병합된다')
  assert.ok(!/workspace__addExamBtn[^>]*>\s*\+ 하지직거상/.test(html),
    '이미 병합된 항목은 확인 추가 목록에서 사라진다')
  ```
  (실측상 실제 동작은 정확하다 — SLR 카드가 `CONTEXTUAL` 배지 + PATIENT_FACT 근거로 렌더되고 `확인 추가`에는 없다. 테스트만 그것을 증명하지 못한다.)

### 4. [LOW] 테스트 이름이 주장하는 `aria-pressed=true`를 assert하지 않는다
- **위치:** `tests/doctor-workspace.spec.mjs:1933-1939`
- **무엇이 잘못됐나:** 이름은 "기본값(미시행)은 눌린 상태(aria-pressed=true)로 렌더되고, 정상 소견처럼 보이지 않는다"인데 본문은 `>미시행<` 문자열 존재만 확인한다. §2.3의 "미입력 ≠ normal"을 실제로 지키는 속성(눌린 상태로 보이는 것)이 검증되지 않는다.
- **최소 수정:** `chunk` 안에서 `/<button[^>]*aria-pressed="true"[^>]*>미시행<\/button>/` 를 assert. (실측 마크업이 정확히 이 형태이므로 바로 통과한다.)

### 5. [MEDIUM · 임상] `lbp_neuro_baseline_required === true`를 확인 목록에 연결한다
- **위치:** `src/doctor/workspace/lbpExamSuggestions.ts:112-121`(가드), `:133-155`(규칙 표)
- **무엇이 잘못됐나:** C항 참조. FROZEN이 "신경학적 기저검사 필요"라고 이미 계산해 레인1에 칩까지 띄운 환자(`DoctorView.tsx:921`)인데, "오늘 확인할 것"에는 감각·반사를 다루는 항목이 없다. 옆의 객관적 근력저하 라디오는 근력만 커버한다. 시스템이 필요하다고 판정한 확인이 체크리스트에서 조용히 빠지는, 이 델타 유일의 실질적 누락 경로다.
- **최소 수정:** 규칙 표에 네 번째(그리고 마지막) 항목을 추가한다. 새 임상 의미가 아니라 CLOSED 계산값의 직결이며, (b)/(c)와 동일한 성격이다.
  ```ts
  if (flags.lbp_neuro_baseline_required === true) {
    items.push(lbpExamItem('lbp_exam_neuro_baseline', '하지 신경학적 기본검사(감각·반사)', [
      { text: '양쪽 다리 증상(시스템 계산 — 신경학적 기저검사 필요)', provenance: 'DERIVED' },
    ]))
  }
  ```
  `isUsableLbpFlags`에 `typeof f.lbp_neuro_baseline_required === 'boolean'`를 추가해 fail-closed 유지(`=== true` 엄격비교라 손상값은 트리거 못 함). help는 `LBP_EXAM_HELP.lbp_exam_neuro_baseline`에 이미 verbatim으로 있으므로 그대로 붙는다. `확인 추가` 목록에서는 자동 필터링되므로 중복도 없다.
  - 자동 제안 상한: 이 규칙이 붙어도 CLEAR 환자 1명당 최대 4개(목표동작 + SLR + 보행 + 신경 baseline)이고, 실제로 4개가 동시에 성립하려면 BILATERAL + concrete neuro 없음 + LBP_08 YES 여야 한다. §3의 "tranche/dedup 문제 없음" 전제를 깨지 않는다.
  - 테스트: `LBP_03:'BILATERAL'`, `LBP_02:['NONE']` payload로 `lbp_neuro_baseline_required === true` && `lbp_safety_status === 'CLEAR'` sanity 확인 후 항목 생성 assert.

### 6. [LOW] ⓘ 토글이 이 파일 자신의 터치 타겟 관례보다 작다
- **위치:** `src/doctor/workspace/workspace.css:1596-1612` (`.workspace__helpToggle`, `width/height/min-height: 24px`)
- **무엇이 잘못됐나:** 이 스타일시트는 태블릿 터치 타겟을 44px(`:167`, `:1470`) 또는 36~40px(`:428` `workspace__statusBtn`, `:1365` — "Still a comfortable touch target on a clinic tablet"이라는 주석까지 달아 40px로 낮춘 이력)로 관리해 왔다. 24px는 그 관례 아래이고, 카드 제목 바로 옆에 붙어 있어 오탭 가능성이 있다. 같은 커밋의 `workspace__addExamBtn`은 36px를 지킨다(`:906`).
- **최소 수정:** `width/height/min-height`를 36px로 올리거나, 시각적 원은 24px로 두고 `::after`로 36px 히트 영역을 확보한다.

---

# CLINICAL DECISION REQUIRED

**없음.** §6의 5개 질문은 모두 CLOSED 결정(§14 규칙, FROZEN 계산값, §2.3 불변조건) 안에서 판정 가능했고, 새 임상 판단을 창작하지 않고 답할 수 있었다. Fix #5도 이미 CLOSED된 FROZEN 계산값의 연결이라 PO 결정이 필요하지 않다.

---

# 조치 불필요 관찰

1. **`help`가 서버에 저장된다.** `performSave`(`DoctorWorkspace.tsx:340`)는 `workspaceState`를 그대로 PUT하므로, merge 시 붙은 `help`가 레코드에 포함된다. `EXAM_SUGGESTION_TEMPLATE`이 읽기에서 떨어뜨리므로 재부착은 정상 동작하고 §7.3 문구("sanitize 템플릿에 넣지 않는다")도 문자 그대로 지켜졌다. 항목당 ~200바이트 정적 문구가 늘 뿐이고 PHI가 아니다. 지금 고칠 필요 없지만, Batch 2에서 항목 수가 늘면 저장 직전 strip을 고려할 만하다.
2. **`safety !== CLEAR`일 때 "왜 제안이 없는지"를 설명하는 줄이 없다.** v0.1 엔진은 이 상황에 명시적 reviewNote를 냈다(engine:471). 지금은 레인1 패널의 "안전 확인 전까지 일상적인 운동/치료 추천은 잠깁니다" 문구가 사실상 그 역할을 하므로 결함은 아니다. 다만 빈 목록이 "제안할 게 없다"로 읽힐 여지가 있어, 원본 문구를 verbatim으로 한 줄 넣는 것은 저렴한 개선이다.
3. **`목표 동작 재현`은 목표기능이 아직 선택되지 않아도 항상 제안된다.** v0.1 엔진은 `buildDefineTargetFunctionCheck`(정하기)와 `buildTargetFunctionCheck`(재현)를 구분했다. 생산 v1은 목표기능 chip을 "다음" 레인에 두고 재현 항목만 레인2에 두는데, reasonFacts 문구가 "목표 기능을 정한 뒤 …"로 순서를 안내하므로 의미상 무해하다. §7.3이 명시적으로 지시한 배치라 브리프 충실.
4. **`LBP_CLINICIAN_ADDABLE_EXAMS`의 `reasonFacts` 배열이 모듈 레벨 상수로 공유된다.** `onAddLbpExam`(`DoctorWorkspace.tsx:600-611`)이 `result`만 새로 만들고 `reasonFacts`는 참조를 공유한다. 현재 어떤 코드도 그 배열을 mutate하지 않으므로 실제 버그는 아니지만, Batch 2에서 근거를 추가하는 코드가 생기면 레코드 간 오염이 될 수 있다.
5. **`확인 추가` `<details>`에 `open={}` 조건이 없다.** Core Reduction P2/P3의 "disclosure는 내용이 있으면 자동으로 열린다" 규칙은 *기록된 내용*을 숨기지 않기 위한 것인데, 여기 숨겨지는 것은 추가 버튼(액션)뿐이고 기록은 하나도 숨지 않는다. `doctor-workspace.spec.mjs`의 orphan-details 테스트도 열거식이라 걸리지 않는다. 규칙 취지에 위배되지 않는다고 판단한다.
6. **`HANDOFF.md`/`DECISIONS.md`가 이 커밋에 없다.** `9533414`는 코드+테스트만 담고 있다. §5 루프상 Opus closing 뒤에 갱신하는 흐름이면 정상이지만, Definition of Done 기준으로 PR 생성 전에는 반드시 채워져야 한다. Fix #5와 D항의 "Batch 2는 재계산된 safety를 게이트로 쓴다"는 `DECISIONS.md` 항목으로 남길 것을 권고한다.