# Opus Closing Review — LBP Production v1 Batch 2.5a (53a8149..e8ed6ef) — 2026-09-02

**리뷰어:** Opus (실제 모델 호출, Fable 세션의 subagent invocation; session https://claude.ai/code/session_019JGkicU3oJZVyPn7fMqPS9)
**결과:** PASS. 결함 1~4 전부 RESOLVED(뮤테이션 재현으로 재검증), CD-3 도달성 무회귀(all-NO → 정확히 4개, all-UNKNOWN → 0개), 신규 결함 유입 없음.

---

All checks complete. Repository untouched (working tree clean, HEAD `e8ed6ef`); every probe ran from scratchpad copies/bundles.

---

# Opus Closing Review — LBP v1 Batch 2.5a fix delta (`53a8149..e8ed6ef`)

**검증 실행 (전부 직접 재실행):** `npx tsc -b` **exit 0** · `test:lbp-exercise-eligibility` **22 PASS** · `test:lbp-exercise-recommendation` **22 PASS** · `test:doctor-workspace` **222 assertions PASS** (이전 221 → +1) · `test:workspace-round3` **140 PASS** (이전 133 → +7)

**Delta 위생:** `git diff --stat 53a8149..e8ed6ef` = 5개 파일(`PainWorkspace.tsx`, `persistence.ts`, 테스트 3개), 162+/23−. FROZEN zero-diff(`src/spec index.html src/App.tsx server "tablet core"`) **빈 출력** ✓ · `git diff 53a8149..e8ed6ef -- src/doctor/workspace/DoctorWorkspace.tsx` **빈 출력** ✓ — 구현자의 "로컬에서만 mutate 후 완전 복원" 주장은 사실이다. 승인된 6항목 밖 변경 없음(엔진·CSS·package.json·`.gitignore` 무수정).

---

## 결함별 판정

### 결함 1 — 힌트 문구 사실성 → **RESOLVED**

`PainWorkspace.tsx:267-270`. 새 문구를 렌더해 실제 DOM 텍스트로 확인했고, 내 원래 probe를 그대로 재실행했다:

```
SAFE_WALKING 만 'NO' →  ready: (none)
  awaiting: LBP_ACT_01 [SAFE_WALKING, CAN_SELF_PACE]
  awaiting: LBP_ACT_02 [CAN_SELF_PACE, SAFE_WALKING]
  SAFE_WALKING=NO에도 계속 보류: LBP_ACT_01, LBP_ACT_02
```

새 문구는 이 동작과 정확히 일치한다 — `모두 확인함(YES)이 되면`(AND 조건을 올바르게 표현, 기존 "바로 올라가고"의 부정확함 해소), `쉬운 단계로 대체할 수 있는 조건일 때만 … 꼭 필요한 조건이면 계속 보류됩니다`(hard requirement에 대한 거짓 약속 제거). 원장이 읽고 실제로 벌어질 일과 다른 기대를 갖게 되는 문장은 더 이상 없다. 한국어도 자연스럽고 승인된 의미와 일치.

### 결함 2 — `deserializeWorkspaceState` 상호배타성 방어 → **RESOLVED**

`persistence.ts:268-279`(`stripConflictingLbpCapabilities`) + `:293-296`. 구현자의 mutation probe를 내가 직접 재현:

```
raw = {confirmed:[SAFE_WALKING, CAN_SELF_PACE], denied:[SAFE_WALKING, QUADRUPED_TOLERATED]}
 → confirmed=["CAN_SELF_PACE"]  denied=["QUADRUPED_TOLERATED"]     (양쪽에서 제거)
 → capabilities.SAFE_WALKING        = UNKNOWN   ✓ (추론된 YES 아님)
 → capabilities.CAN_SELF_PACE       = YES       ✓ (비충돌 항목 무손상)
 → capabilities.QUADRUPED_TOLERATED = NO        ✓
[수정 전 대조] 같은 raw를 deserialize 우회해 어댑터에 직접 주입 → SAFE_WALKING = YES
legacy(denied 필드 없음) → confirmed 보존, denied=[]  ✓ (2.5a 이전과 비트 동일)
garbage(숫자/문자열) → []                              ✓
```

**커버리지도 확인**: 영속 레코드를 읽는 경로 전부(`DoctorWorkspace.tsx:115`/`:130`, `RevisitWorkspace.tsx:128`, `revisitCarryForward.ts:128`)가 예외 없이 `deserializeWorkspaceState`를 통과한다 — 우회 경로 없음. 고정 테스트 `tests/workspace-round3.spec.mjs:112-145`(양쪽 strip + 비충돌 생존 4건).

### 결함 3 — branch-anchored mutation-resistant 테스트 → **RESOLVED**

새 assertion(`tests/doctor-workspace.spec.mjs:2318-2350`)을 **verbatim 추출**해, 현재 `DoctorWorkspace.tsx`(`:724-747`)의 실제 핸들러에 내가 만든 mutant를 걸어 실행했다:

| mutant | 새 테스트 | 구 테스트(53a8149) |
|---|---|---|
| baseline(무수정) | **PASS** | PASS |
| A: `NO` 분기에서 `lbpConfirmedCapabilities: withoutCap(...)` 삭제 | **FAIL** ✓ | **PASS**(놓침) |
| B: `UNKNOWN` 분기를 `return s`(no-op)로 | **FAIL** ✓ | **PASS**(놓침) |
| C(추가): `YES` 분기에서 `lbpDeniedCapabilities: withoutCap(...)` 삭제 | **FAIL** ✓ | **PASS**(놓침) |

구 assertion이 세 mutant를 전부 놓쳤다는 점까지 재현했으므로 결함 3은 실재했고 지금은 실질적으로 막혔다.

**렌더 레벨 undo 테스트**(`:2352-2369`)도 실제로 렌더된다 — 내 렌더 probe로 결정 섹션 슬라이스 내용을 직접 덤프:
```
decided row 버튼 순서: 확인함 , 지금은 안 됨 , 미확인
aria-pressed:          확인함=true | 지금은 안 됨=false | 미확인=false
```
`미확인` 버튼이 결정 섹션 안에 존재하고 unpressed임을 검사하며, 그 버튼을 제거하면 assertion이 깨진다(비-공허) ✓.

### 결함 4 — denied(NO) 렌더 테스트의 슬라이스 위치 → **RESOLVED**

`tests/doctor-workspace.spec.mjs:2253-2280`. 실측으로 결함이 실재했음과 수정이 옳음을 동시에 확인:

```
[denied(NO) SAFE_WALKING]
  라벨의 페이지 내 첫 등장 idx = 9239   ← awaiting 카드(ACT_01)
  결정 섹션 heading idx        = 14634
  구 슬라이스(첫 등장 기준) pressed = 지금은 안 됨 | 미확인   ← awaiting 행을 재고 있었음
  새 슬라이스(heading 기준)         = 확인함=false | 지금은 안 됨=true | 미확인=false  ✓
```
`DECIDED_CAPABILITIES_HEADING`(`:2233`)로 먼저 앵커한 뒤 슬라이스하므로 이제 의도한 섹션을 검사한다. (구 테스트는 통과하고 있었지만 *잘못된 이유로* 통과하고 있었다 — 그 우연도 이제 제거됨.)

### 항목 5 — heading rename 일관성 → **RESOLVED**

`확인된/지금은` 문자열은 `src/`·`tests/` 전체에서 **0건**. 새 문자열이 필요한 4곳 전부 반영: JSX `PainWorkspace.tsx:292`, 컴포넌트 doc comment `:231-232`, prop doc `:554`, 테스트 상수 `tests/doctor-workspace.spec.mjs:2233`. 테스트의 문자열 매치 4곳(`:2243, :2264, :2292, :2360`)이 전부 하드코딩 대신 그 상수를 쓴다 ✓. (`docs/LBP_V1_BATCH2_*.md`의 "확인된 준비 조건"은 Batch 2 시점의 리뷰 기록이고 다른 문자열이라 rename 대상이 아니다 — 과거 기록으로 그대로 두는 것이 맞다.)

### 항목 6 — `LBP_HIP_STR_03` 커버리지 추가 → **RESOLVED, 비-공허**

`tests/lbp-exercise-recommendation.spec.mjs:472-487`. 같은 fixture에서 판별력이 실제로 있는지 3방향 확인:

```
denied=[SUPPORTED_STANDING_TOLERATED, BALANCE_WITH_SUPPORT]
  LBP_HIP_STR_03 → START_WITH_REGRESSION | regressed=true | "쉬운 단계:" fact=true  ✓
[공허성 반례] denied 없음         → HIP_STR_03가 readyCandidates에 아예 없음   ✓
[공허성 반례] 같은 2개를 YES로     → START_AS_WRITTEN | regressed=false          ✓
```

---

## 신규 결함 유입 여부 — 없음

- **CD-3 도달성 무회귀** (엔진 레벨 20 rule × 15 capability 전수, 방향성 4종 전부):
  ```
  [all-NO  dir=UNKNOWN/EXT/FLEX/NO_CLEAR] {"DEFER_NOT_READY":16,"START_WITH_REGRESSION":4}
      REGR = ["LBP_EXPOSURE_03","LBP_HIP_MOB_01","LBP_HIP_STR_03","LBP_LUMBAR_03"]   ← 요구 집합과 정확히 일치
  [all-UNKNOWN]      {"DEFER_NOT_READY":20}  START_WITH_REGRESSION = 0   ✓
  [capabilities={}]  {"DEFER_NOT_READY":20}  = 0                        ✓ (CD-1 보호 무회귀)
  [all-YES]          {"START_AS_WRITTEN":17,"DEFER_NOT_READY":3}
  ```
  recommendation 레벨(실제 payload)에서도 동일한 4개 집합 재현 ✓
- 엔진(`lbpExerciseEligibility.ts`)·어댑터(`lbpEligibilityContext.ts`)·`DoctorWorkspace.tsx`·CSS 무수정, 숫자 점수 없음, 새 태블릿 문항 없음, 새 UI 문자열 전부 한국어, 채택은 여전히 명시 클릭 경로만.
- 한국어 검수(읽어서): 새 힌트 문구와 새 heading(`확인함/지금은 안 됨으로 표시한 준비 조건`) 모두 버튼 라벨(`확인함`/`지금은 안 됨`/`미확인`)과 1:1로 맞아 한 호흡에 읽힌다. 내가 delta 리뷰 판단콜 2에서 권고한 대안 그대로다.

---

# Closing disposition: **PASS**

게이트 닫힘 — Batch 2.5a 완료, 다음 안건으로 넘어가도 된다. 결함 1~4 전부 RESOLVED, 항목 5·6 RESOLVED, 신규 결함 유입 없음, 임상 게이트 동작 무변화.

---

# CLINICAL DECISION REQUIRED

**없음.** 이번 fix delta는 문구 정확성·역직렬화 방어·테스트 품질만 바꿨다. rule table·용량·횟수·게이트 판정 모두 무변화이며(도달성 probe로 실측 확인), 새 임상 규칙을 만들지 않았다.

---

# No-action observations

- **HANDOFF.md가 아직 stale (게이트 밖, 그러나 바로 다음 작업)** — `HANDOFF.md:10-13`이 여전히 *"진행 중 — Batch 2.5a"*이고, `:45-50`은 CD-3를 *"사람 판단 대기 — PO 결정 2건"*으로 적고 있다. 실제로는 승인·구현·리뷰까지 끝났다. CLAUDE.md Startup Protocol 2단계에서 다음 세션이 가장 먼저 읽는 문서가 이것이므로 방치하면 오도한다. 다만 이 저장소의 Batch 2 선례(`25f610d`: closing PASS **이후** 별도 docs 커밋으로 HANDOFF 갱신)를 따르면 이 커밋에 포함되지 않은 것이 오히려 정상 순서다 — **이 closing PASS 결과를 담아 지금 갱신하는 것이 다음 행동**이다.
- **`body.slice(anchor, anchor + 1400)` 창이 핸들러 끝(offset ~1160)을 240자 초과해 형제 JSX까지 포함한다.** 현재 그 꼬리에는 `return {`이 없어 `lastIndexOf('return {')`가 UNKNOWN 분기를 정확히 집는다(창 내 `return {` = 정확히 3개). 장래에 그 꼬리로 `return {`이 들어오면 UNKNOWN 슬라이스가 밀린다 — 취약성이지 현재 결함은 아니다. 창 크기를 핸들러 닫는 `})`까지로 잘라두면 더 안전하다(비차단).
- **mutant B의 실패 메시지가 오귀속된다.** `UNKNOWN` 분기를 `return s`로 만들면 `lastIndexOf('return {')`가 NO 분기로 이동해, 테스트는 (올바르게) 실패하지만 메시지는 `'NO branch must clear …'`로 뜬다. mutant는 확실히 잡히므로 보호는 유효하고, 진단 메시지만 헷갈릴 수 있다(비차단).
- **awaiting 섹션 첫 문장의 잔여 부정확성.** hard requirement를 `지금은 안 됨`으로 찍으면 그 행은 `확인하면 시작 가능` 섹션에 남고 버튼은 `지금은 안 됨`이 눌린 상태로 보이는데, 섹션 첫 문장은 여전히 *"아래 준비 조건이 아직 확인되지 않아 보류 중입니다"*라고 말한다. 뒤 문장(`꼭 필요한 조건이면 계속 보류됩니다`)이 이 경우를 명시적으로 설명하고 눌린 버튼이 화면에 보이므로 오도 위험은 실질적으로 해소됐고, 방향도 보수적(운동을 더 여는 쪽이 아님)이다. 근본 해소는 delta 리뷰 결함 1의 "구조적 대안"(`missingHardRequirements` / `regressionRequirements` 분리 노출 + 조건별 "꼭 필요 / 쉬운 단계로 대체 가능" 라벨)이고, 이는 다음 batch 안건으로 남긴다.
- 이전 리뷰의 no-action 관찰 3건(회귀 계층이 실제로 열리는 운동은 8/20 · `SUPINE_TOLERATED=지금은 안 됨`의 RF-6 예외 의미론 · `LOAD_READY` 라벨의 잔여 영어 `irritability`)은 이번 delta로 바뀐 것이 없으며 그대로 유효하다.