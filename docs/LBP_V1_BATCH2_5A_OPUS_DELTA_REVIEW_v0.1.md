# Opus Delta Review — LBP Production v1 Batch 2.5a (f4c2e90..53a8149) — 2026-09-02

**리뷰어:** Opus (실제 모델 호출, Fable 세션의 subagent invocation; session https://claude.ai/code/session_019JGkicU3oJZVyPn7fMqPS9)
**대상:** 명칭 4건 + CD-3 capability 3상태 + Opus closing review §C(i)/§C(ii) 수정
**결과:** Disposition PASS, 단 must-fix 결함 3건 + nice-to-have 1건 → 커밋 `e8ed6ef`로 전부 수정, closing review에서 RESOLVED 확인.

---

All checks are complete. Here is the review.

---

# Opus Independent Delta Review — LBP v1 Batch 2.5a (`f4c2e90..53a8149`)

**리뷰어:** Opus (독립 임상/아키텍처 리뷰) · **브랜치** `claude/clinical-os-lbp-architecture-xym6po` · **HEAD** `53a8149` · 저장소 무수정(working tree clean, 모든 probe는 scratchpad 사본/번들에서 실행)

**검증 실행 결과 (전부 직접 재실행):**
`npx tsc -b` **exit 0** · `test:lbp-exercise-eligibility` **22 PASS** · `test:lbp-exercise-recommendation` **22 PASS** · `test:doctor-workspace` **221 assertions PASS** · `test:workspace-round3` **133 PASS** · (추가) `test:lbp-exam-suggestions` 25 PASS · `test:lbp-exercise-core20-vignettes` PASS · `test:lbp-exercise-library` 6 PASS.
FROZEN zero-diff: `git diff --stat origin/main -- src/spec index.html src/App.tsx server "tablet core"` = 빈 출력 ✓

# Disposition: **PASS**

승인된 범위(명칭 4건 / CD-3 3상태 / §C(i)(ii))가 정확히, 그리고 그 범위 안에서만 구현되었다. 엔진은 손대지 않았고, 도달성 probe·비-공허성 mutation을 내가 직접 재현했으며, 잘못되거나 위험한 임상 출력은 없다. 아래 **결함 1~3**은 반드시 고쳐야 하지만 전부 "안전한 쪽으로 틀린" 문구/테스트 품질 문제이고 임상 게이트를 바꾸지 않는다. (결함 1은 원장 화면이 자기 동작에 대해 사실이 아닌 문장을 말하는 건이라, PO가 CD-1 원칙("미확인을 정상으로 숨은 변환 금지")과 같은 잣대로 "원장 대면 문구의 진실성"을 게이트로 본다면 이 한 줄만 고치고 닫는 것을 권한다.)

---

## A. Naming — PASS

`lbpExerciseCoreMetadata.ts` 변경은 **정확히 4줄 추가 / 4줄 삭제**(`git diff --numstat` = `4 4`)로, 승인된 4건 외 `displayNameKo` 행은 하나도 건드리지 않았다.

| id | 파일:라인 | 값 |
|---|---|---|
| `LBP_DIR_03` | `lbpExerciseCoreMetadata.ts:153` | `엎드려 반복 허리 젖히기` ✓ |
| `LBP_DIR_04` | `:164` | `누워서·앉아서 굽히기` ✓ |
| `LBP_DEEP_TRUNK_01` | `:186` | `숨 쉬면서 배에 살짝 힘주기` ✓ |
| `LBP_EXPOSURE_03` | `:296` | `앉아 있기 단계적으로 늘리기` ✓ |

DECISIONS.md의 PO 승인 문자열과 **verbatim 일치**(공백·중점 포함). 고정 테스트도 `tests/lbp-exercise-recommendation.spec.mjs:411-416`에 4건 그대로 박혀 있다. 5번 항목(굽힘 계열 3개 동시 노출)은 "이름 변경 없음"이 결정이었고 실제로 변경 없음 ✓.

## B. CD-3 data model — PASS (단, 읽기 경로 방어는 없음 → 결함 2)

- **setter의 상호배타성은 코드로 확인**(주석이 아니라 실제 분기): `DoctorWorkspace.tsx:724-746`. `YES` → `lbpConfirmedCapabilities: [...withoutCap(confirmed), cap]` + `lbpDeniedCapabilities: withoutCap(denied)`(`:730-731`), `NO` → 정확히 반대(`:737-738`), `UNKNOWN` → **양쪽 모두 제거**(`:743-744`). 세 분기 모두 `withoutCap`을 먼저 적용하므로 중복 삽입도 불가능 ✓
- **어댑터 3상태**: `lbpEligibilityContext.ts:169` — `confirmed.has(cap) ? 'YES' : denied.has(cap) ? 'NO' : 'UNKNOWN'`. 어느 리스트에도 없으면 반드시 `'UNKNOWN'`, 추론된 `'NO'`/`'YES'` 없음. 실측: `SAFE_WALKING(confirmed)=YES / SITTING_TOLERATED(denied)=NO / PRONE_TOLERATED(어디에도 없음)=UNKNOWN` ✓
- **legacy 호환**: `persistence.ts:291` `sanitizeStringArray(raw.lbpDeniedCapabilities)` → `sanitize.ts:75`가 비배열에 `[]`를 반환. `lbpDeniedCapabilities` 없는 구 레코드를 실제로 deserialize해 `denied === []`, `confirmed`는 그대로 보존됨을 확인 ✓. `WORKSPACE_STATE_SCHEMA_VERSION`은 `'1.1.0'` 그대로(additive) ✓
- **엔진 무수정**: `git diff f4c2e90..53a8149 -- src/doctor/workspace/lbpExerciseEligibility.ts` **빈 출력** ✓ — 구현자 주장(어댑터만 손댐)이 사실이다.

## C. CD-3 UI — PASS (문구 1건은 결함 1)

- **관례 일치**: `PainWorkspace.tsx:189-215`의 `LbpCapabilityStatusButtons`는 `ExamSuggestionCard.tsx:111-118`과 동일 패턴 — `role="group"` + `aria-label`, `aria-pressed={status === s}`(`:206`), `workspace__statusBtn` / `--active`(`:207`) ✓
- **카탈로그 무단 노출 없음**: 버튼이 붙는 대상은 (a) awaiting 후보가 실제로 막혀 있는 capability(`:274` `c.unconfirmedCapabilities.map`)와 (b) 이미 YES/NO로 결정된 것(`:293` `decidedIds`)뿐. 15개 전체 카탈로그가 뜨는 경로 없음 ✓. 미지 id 방어 필터(`isKnownCapability`)도 양쪽 리스트에 유지 ✓
- **미확인 되돌리기**: 코드상 진짜 reset(`DoctorWorkspace.tsx:741-745`, 두 리스트에서 제거)이고, 결정된 capability는 awaiting 후보가 사라진 뒤에도 `:290-301` 행에 남아 되돌릴 지점이 항상 존재한다 ✓ — **다만 이 reset 분기를 잡아낼 테스트가 하나도 없다(결함 3)**.

## D. Reachability — PASS (직접 재실행, 보고서 미의존)

엔진을 독립 번들로 만들어 `LBP_EXERCISE_CAPABILITY_IDS` 15개 전부를 실제로 채워 재현했다(구현자 리포트를 신뢰하지 않음):

```
[caps 전부 'NO',      neuro STABLE] {"DEFER_NOT_READY":16,"START_WITH_REGRESSION":4}
   LBP_LUMBAR_03←SUPINE_TOLERATED
   LBP_HIP_MOB_01←SUPPORTED_STANDING_TOLERATED,BALANCE_WITH_SUPPORT
   LBP_HIP_STR_03←SUPPORTED_STANDING_TOLERATED,BALANCE_WITH_SUPPORT
   LBP_EXPOSURE_03←SITTING_TOLERATED          ← 요구된 4개 집합과 정확히 일치 ✓
[caps 전부 'UNKNOWN']              {"DEFER_NOT_READY":20}  START_WITH_REGRESSION = 0 ✓
[capabilities 객체가 아예 빈 경우]  {"DEFER_NOT_READY":20}  = 0 ✓   (CD-1 보호 무회귀)
[caps 전부 'YES']                  {"START_AS_WRITTEN":17,"DEFER_NOT_READY":3}
```
방향성 반응 4종(`EXTENSION_BIASED/FLEXION_BIASED/NO_CLEAR_DIRECTION/UNKNOWN`) 어디서도 all-NO의 회귀 집합은 그 4개로 동일 ✓.
추천 레벨(실제 payload, `lbp_tf_walking`): 아무것도 설정 안 함 → `readyCandidates=[]`; all-NO → `HIP_MOB_01`/`HIP_STR_03`가 `START_WITH_REGRESSION`으로 READY 승격 ✓.

**추가 실측(리포트에 없던 사실, 아래 no-action 참조):** all-NO는 4개지만, **개별 capability 하나만 NO로 두면 회귀 계층이 열리는 운동은 8/20**이다 — `LUMBAR_03, HIP_MOB_01, DEEP_TRUNK_01, HIP_STR_03, FUNC_01, FUNC_05, LOAD_02, EXPOSURE_03`. 즉 CD-3가 실제로 켜는 환자 노출 면적은 4가 아니라 8이다.

## E. §C(i) 구분자 — PASS (직접 스캔 + mutation)

- 20 id × `{regressed:true}` → `/[^.。]\s중단·재검토/` **0/20 매치** ✓ (plain 변형도 0/20 ✓, 이중 마침표 0건 ✓)
- **비-공허성 확인:** `lbpExerciseRecommendation.ts:444`의 마침표를 제거한 mutant 번들을 만들어 재실행 → **20/20 위반**. 즉 `tests/lbp-exercise-recommendation.spec.mjs:421`은 실제로 실패한다 ✓ (20개 `regressionKo` 말미를 전수 확인했고 전부 종결부호가 없다 — 마침표는 전부에 필요하다.)
- **한국어 판단(기계적 확인이 아니라 읽어서):**
  - `앉아 있기 단계적으로 늘리기 — …반응을 기록. 쉬운 단계: 노출시간을 줄이고 중간 자세변경·짧은 걷기 구간을 **허용. 중단·재검토:** …`
  - `고관절 앞쪽 스트레칭 — …하루 1~2회부터 시작. 쉬운 단계: 보폭을 줄이고 벽/의자 지지, 필요 시 10~15초로 **단축. 중단·재검토:** …`
  기존의 치명적 오독("휴식 지점을 사용 **중단**", "걷기 구간을 허용 **중단**")이 사라졌다. `허용.` / `단축.` / `감소.`는 한국어 임상기록의 개조식 종결로 자연스럽게 닫히고, 뒤의 `중단·재검토:`는 새 라벨로 명확히 분리되어 읽힌다. **원장·환자 어느 쪽이 읽어도 모호하지 않다** — 문구 문제 해소로 판정.

## F. §C(ii) 테스트 비-공허성 — PASS (3건 모두 counterexample에서 실패함을 확인)

| 테스트 | counterexample | 결과 |
|---|---|---|
| (a) `:435` regressionKo 포함/미포함 | `regressionSuffix = ""`로 되돌린 mutant 번들 | **20/20에서 `regressionKo` 누락 → FAIL** ✓ |
| (b) `:450` HIP_MOB_01 `regressed===true` + `쉬운 단계:` sourceFact | `lbpDeniedCapabilities: []`(= CD-3 이전 어댑터 동작) | **HIP_MOB_01이 `readyCandidates`에 없음 → 첫 `assert.ok`에서 FAIL** ✓ |
| (c) `:475` 제목 파싱이 아니라 구조적 flag | 제목에 `(쉬운 단계로 시작)`이 없는 suggestion을 일부러 넣음 | 제목 파싱 구현이면 `regressionKo` 미출력 → **FAIL** ✓ |

§C(i) 스캔(`:421`)도 위 E에서 20/20 실패 확인. 네 건 모두 공허하지 않다.

## G. Regression risk — PASS

- **구 레코드(`lbpDeniedCapabilities` 없음)**: `[]`로 deserialize → 어댑터에서 전원 `UNKNOWN`, 즉 2.5a 이전과 **비트 단위로 동일한 동작**. 임상 출력 변화 0 ✓
- **비-LBP 레코드**: `LbpAwaitingCapabilitySection`은 `PainWorkspace.tsx:632`의 `isLbp &&` 안에서만 렌더되고, `PainExerciseSection` 렌더 사이트는 저장소 전체에서 `DoctorWorkspace.tsx:674` **1곳뿐**이다. 비-LBP 경로 무변화 ✓
- **`lbpConfirmedCapabilities`만 읽는 잔존 지점 없음**: `src/` 전수 grep 결과 이 필드의 모든 사용처(`DoctorWorkspace.tsx:714/730/737/743`, `lbpEligibilityContext.ts:164`, `PainWorkspace.tsx:554/635`, `persistence.ts:211/247/290`)가 예외 없이 `lbpDeniedCapabilities`를 짝으로 처리한다. 'NO'를 조용히 'UNKNOWN'으로 떨어뜨리는 경로 없음 ✓
- **Batch-1 경로**: `lbpExamSuggestions.ts`는 diff에 없고(변경 9파일), `test:lbp-exam-suggestions` 25 PASS. `revisitCarryForward.ts`/`visitWorkspace.ts`는 capability를 다음 방문으로 이월하지 않으므로(레코드 단위 유지) 새 필드로 인한 이월 비대칭 없음 ✓

## H. Invariants — PASS

FROZEN zero-diff ✓ · 숫자 점수 도입 없음(diff에 score/점수 추가 0건, `rankReady`의 2-bucket 유지) ✓ · 새 태블릿 문항 없음(`src/spec` zero-diff) ✓ · 새 UI 문자열 전부 한국어 ✓ · Primary/Secondary 전략 UI 없음 ✓ · `progressionKo`는 여전히 타입/주석/금지 assertion에서만 등장, 코드에서 읽히지 않음 ✓ · 채택은 여전히 명시 클릭 경로만 ✓

---

# 구현자가 고쳐야 할 구체적 결함

### 결함 1 (must-fix, 원장 대면 문구가 사실이 아님) — `PainWorkspace.tsx:267-270`

현재 힌트: *"…확인함(YES)이면 바로 추천 목록에 올라가고, **지금은 안 됨(NO)으로 표시하면 쉬운 단계(있는 경우)로 시작 가능해집니다.**"*

이 문장은 **hard requirement에 대해서는 거짓**이다. 실측(내 probe):

```
SAFE_WALKING 만 'NO' 로 표시 →  ready: (none)
  awaiting: LBP_ACT_01[SAFE_WALKING,CAN_SELF_PACE] | LBP_ACT_02[CAN_SELF_PACE,SAFE_WALKING] …
```
`SAFE_WALKING`은 `LBP_ACT_01/ACT_02`의 hard requirement라 NO로 표시해도 회귀 시작이 열리지 않고 카드는 "확인하면 시작 가능"에 그대로 남는다. 괄호의 "(있는 경우)"는 방어가 되지 못한다 — Core-20 20행 **전부** `regressionKo`가 정의되어 있어 원장은 "쉬운 단계는 항상 있으니 NO를 누르면 걷기 운동이 쉬운 단계로 나오겠구나"로 읽는다. 실제로는 아무 일도 일어나지 않고 이유도 표시되지 않는다.

부수적으로 앞 절("확인함(YES)이면 **바로** 추천 목록에 올라가고")도 조건이 2개인 후보(ACT_01: `SAFE_WALKING`+`CAN_SELF_PACE`)에서는 한 개만 확인해서는 성립하지 않는다.

**최소 수정 (문구만):** `:267-270`을
> `아래 준비 조건이 아직 확인되지 않아 보류 중입니다. "미확인"은 "아니오"가 아니라 "아직 확인하지 않음"입니다 — 이 운동의 조건이 모두 확인함(YES)이 되면 추천 목록에 올라갑니다. "지금은 안 됨(NO)"은 그 조건이 실제로 안 된다는 기록이며, 쉬운 단계로 대체할 수 있는 조건일 때만 쉬운 단계로 시작 가능해집니다 — 꼭 필요한 조건이면 계속 보류됩니다.`

**구조적 대안(선호, 범위 커짐):** `toCandidate`(`lbpExerciseRecommendation.ts:228-231`)가 `missingHardRequirements`와 `regressionRequirements`를 하나의 `unconfirmedCapabilities`로 합치는 대신 분리해 노출하고, UI가 조건별로 "꼭 필요 / 쉬운 단계로 대체 가능"을 라벨링. 이 경우 아래 판단콜 (1)도 동시에 해소된다. **문구 수정만으로 이번 batch를 닫아도 무방하다.**

### 결함 2 (must-fix, 저비용) — `persistence.ts:288-291` 읽기 경로에 상호배타성 방어 없음

setter는 완전히 배타적이지만(§B), **역직렬화는 아니다.** 손편집/외부 JSON/장래 버그로 같은 id가 두 리스트에 들어오면 `lbpEligibilityContext.ts:169`의 삼항이 조용히 **`'YES'`(더 공격적인 쪽)** 로 해소한다. 실측 확인: 두 리스트 모두에 `SAFE_WALKING`을 넣으면 `capabilities.SAFE_WALKING === 'YES'`.
이 저장소의 13차 HIGH-2 sanitize 원칙("깨진 값은 안전한 기본값으로 강등")과, CD-1의 "불확실을 적격으로 승격 금지" 원칙 둘 다에 어긋나는 방향이다.

**최소 수정:** `deserializeWorkspaceState`에서 교집합을 `UNKNOWN`으로 강등 —
```ts
const confirmedRaw = sanitizeStringArray(raw.lbpConfirmedCapabilities)
const deniedRaw = sanitizeStringArray(raw.lbpDeniedCapabilities)
const conflicting = new Set(confirmedRaw.filter((c) => deniedRaw.includes(c)))
// 충돌은 해소할 수 없는 기록 → 어느 쪽으로도 추론하지 않고 미확인으로 되돌린다(CD-1).
lbpConfirmedCapabilities: confirmedRaw.filter((c) => !conflicting.has(c)),
lbpDeniedCapabilities: deniedRaw.filter((c) => !conflicting.has(c)),
```
+ `workspace-round3` 또는 `lbp-exercise-recommendation`에 충돌 레코드 1건 고정 테스트.

### 결함 3 (must-fix, 테스트 품질) — `tests/doctor-workspace.spec.mjs:2300-2310` 이 assertion은 자기가 주장하는 성질을 검사하지 못한다

`:2306-2310`은 핸들러 본문 1400자에 대해 `withoutCap(s.lbpDeniedCapabilities)`와 `withoutCap(s.lbpConfirmedCapabilities)`가 **각각 한 번이라도 등장하는지**만 본다. 두 정규식 모두 **YES 분기 하나만으로 충족**되므로, 메시지가 약속하는 *"every branch removes the capability from the OTHER list, never leaving it in both"* 는 실제로 검증되지 않는다. 내가 mutant로 재현:

| mutant | 이 테스트 | 다른 테스트 |
|---|---|---|
| NO 분기에서 `lbpConfirmedCapabilities: withoutCap(...)` 삭제 → **id가 두 리스트에 동시 존재(상호배타성 붕괴)** | **PASS** (놓침) | 없음 |
| `UNKNOWN` 분기를 `return s`로 → **미확인 되돌리기가 아무 동작도 안 함** | **PASS** (놓침) | 없음 |

즉 CD-3의 두 핵심 불변식(상호배타성, undo 경로)이 실질적으로 무보호다.

**최소 수정:** source-level 정규식 대신 **동작 테스트**로 바꾼다 — `onSetLbpCapabilityStatus`가 넘겨받는 리듀서 로직을 `persistence`/헬퍼로 추출하거나(권장), 최소한 세 분기를 각각 앵커해서 검사:
```js
const yes = body.slice(body.indexOf("status === 'YES'"), body.indexOf("status === 'NO'"))
const no  = body.slice(body.indexOf("status === 'NO'"), body.lastIndexOf('return {'))
const unk = body.slice(body.lastIndexOf('return {'))
assert.ok(/lbpDeniedCapabilities: withoutCap\(/.test(yes))
assert.ok(/lbpConfirmedCapabilities: withoutCap\(/.test(no))
assert.ok(/lbpConfirmedCapabilities: withoutCap\(/.test(unk) && /lbpDeniedCapabilities: withoutCap\(/.test(unk))
```
+ 렌더 테스트 1건 추가: `lbpConfirmedCapabilities:['SAFE_WALKING']`에서 "확인된/지금은 안 됨…" 행 안에 **`미확인` 버튼이 존재**할 것(= undo 경로가 화면에 있음). 현재 어떤 테스트도 결정 행에 미확인 버튼이 있는지 보지 않는다.

### 결함 4 (nice-to-have) — `tests/doctor-workspace.spec.mjs:2245-2261` "denied(NO)" 테스트가 의도한 곳을 재고 있지 않음

`lbpDeniedCapabilities:['SAFE_WALKING']`이면 `SAFE_WALKING` 라벨의 **첫 등장은 awaiting 카드**(ACT_01)다(위 결함 1의 실측 참조). 따라서 `html.indexOf(...)+900` 창으로 검사하는 `aria-pressed="true">지금은 안 됨`은 **결정 행이 아니라 awaiting 행**을 검증한다. 주장(결정 행 렌더)과 측정 대상이 어긋난다. 최소 수정: `idx`를 `html.indexOf('확인된/지금은 안 됨으로 표시한 준비 조건')` 이후로 잡아 slice.

### 비-코드 must-fix (CLAUDE.md Definition of Done)

`HANDOFF.md:10-13`이 아직 *"진행 중 — Batch 2.5a"*다. 실제 Git은 구현이 `53a8149`로 커밋 완료 상태 → CLAUDE.md의 "HANDOFF와 Git이 어긋나면 Git이 맞다, 발견 즉시 고친다" 규칙에 따라 갱신 필요(2.5a 구현 완료 + Opus delta 리뷰 결과 + 다음 행동).

---

# 구현자 선언 판단콜 5건 검증

1. **`unconfirmedCapabilities` 필드명 유지 — 이제 user-facing으로 오해 소지 있음(부분 동의).** 내부 이름 자체는 무해하지만, 이 필드가 그리는 UI가 문제다: `missingHard`는 `!== 'YES'` 필터라 **NO로 확정된 조건까지 포함**하고(`lbpExerciseRecommendation.ts:228-231`), 그 결과 "확인하면 시작 가능" 섹션에 *이미 확인이 끝난(NO)* 조건이 "아직 확인되지 않아 보류 중"이라는 힌트와 함께 표시된다. → **결함 1로 승격**. 섹션 제목 "확인하면 시작 가능" 자체는 여전히 참(YES로 바꾸면 실제로 시작 가능)이므로 제목은 유지해도 된다.
2. **새 섹션 제목 "확인된/지금은 안 됨으로 표시한 준비 조건"(`:291`) — 의미는 정확, 한국어는 어색.** "확인된"(피동 관형형)과 "지금은 안 됨으로 표시한"(능동 관형절)이 비대칭이라 한 호흡에 안 읽힌다. 임상 오류는 아니므로 비차단. 권장 대안: **"확인함/지금은 안 됨으로 표시한 준비 조건"**(버튼 라벨과 1:1 일치) 또는 **"표시한 준비 조건 (확인함·지금은 안 됨)"**. 바로 아래 `:292` "다시 눌러 미확인으로 되돌릴 수 있습니다."는 명확하고 좋다 ✓
3. **CSS 추가 최소·부작용 없음 — 확인.** `.workspace__examCard__row`(`workspace.css:418-427`)는 신규 클래스명이고 사용처는 `PainWorkspace.tsx:275`, `:294` 두 곳뿐, 기존 `workspace__examCard__statusRow`/`__title` 규칙과 충돌 없음 ✓
4. **defect-5 테스트 3건 재작성 — 원래 의도(YES 확인의 되돌리기 가능성)를 *부분적으로만* 지킨다.** 결정 행이 존재한다는 것(`:2229-2243`), 아무것도 없으면 렌더 안 된다는 것(`:2264-2277`)은 보존됐다. 그러나 원래 테스트가 지키던 핵심 — *"두 번째 탭이 실제로 취소한다"* — 는 새 source-level 테스트가 위 결함 3처럼 mutant를 못 잡으므로 **실질 커버리지가 떨어졌다**. 결함 3의 수정으로 회복할 것. (커버리지가 "조용히 빠진" 것이 맞다.)
5. **§C(ii)(b)를 `LBP_HIP_MOB_01` 1개만 — 충분하다고 판정.** `candidateToRehabSuggestion`의 `regressed` 산출과 `쉬운 단계:` sourceFact는 id에 의존하지 않는 단일 코드 경로이고(`:366-378`), 20 id 전체 문구는 §C(i) 스캔이 덮는다. 나머지 3개 중 `LBP_HIP_STR_03`은 **같은 fixture(walking target + 같은 2개 denied)로 이미 READY/START_WITH_REGRESSION**이므로 `assert` 두 줄이면 공짜로 늘릴 수 있다(권장, 비차단). `LBP_LUMBAR_03`(TF: SLEEP/CUSTOM)·`LBP_EXPOSURE_03`(TF: SITTING/WORK)은 별도 목표기능 fixture가 필요하고, 엔진 레벨 개별 매핑은 `tests/lbp-exercise-eligibility.spec.mjs:170-176, 192-206, 148-153, 255-262`에 이미 고정되어 있으므로 추가 불필요.

---

# CLINICAL DECISION REQUIRED

**신규 없음.** 이번 delta는 이미 CLOSED된 CD-1/CD-3 결정과 PO 승인 명칭의 이행이며, 새 임상 규칙을 만들지 않았다(rule table 무수정, 용량·횟수 무변경).

다만 PO가 **인지**하고 넘어가야 할 임상 사실 1건(결정 요구 아님, 아래 no-action 첫 항목 참조): CD-3 승인으로 실제 환자에게 "쉬운 단계로 시작" 문구가 나갈 수 있는 운동은 closing review의 all-NO probe가 보여준 4개가 아니라 **8개**다.

---

# No-action observations

- **CD-3가 여는 회귀 계층은 4개가 아니라 8/20이다.** all-NO에서 4개인 이유는 다른 hard requirement가 먼저 걸리기 때문이고, 원장이 capability를 *하나만* NO로 찍는 실제 사용 패턴에서는 `LUMBAR_03·HIP_MOB_01·DEEP_TRUNK_01·HIP_STR_03·FUNC_01·FUNC_05·LOAD_02·EXPOSURE_03` 8개가 회귀 시작으로 열린다. 8개 채택 문구를 전부 출력해 읽어봤고 임상적으로 일관되며 §C(i) 수정이 8건 전부에 적용된다 ✓
- **`SUPINE_TOLERATED = 지금은 안 됨`의 의미론.** 이 값을 찍으면 `LBP_LUMBAR_03`("누워서 무릎 좌우로 눕히기")과 `LBP_DEEP_TRUNK_01`이 **누운 자세 그대로** 회귀 시작으로 추천된다(regression은 "무릎 아래/사이 지지물", "수축 강도·유지시간 축소"). 이는 Batch 2에서 이미 승인된 RF-6 예외(`tests/lbp-exercise-eligibility.spec.mjs:216-241`의 "no-action pin")이고, 무릎 밑 베개는 앙와위 내성을 만드는 표준 수정이므로 임상적으로 방어된다 — 즉 라벨은 "쓰여진 대로는 안 됨"으로 읽어야 한다. **이번 delta가 만든 문제가 아니지만, 이번 delta가 처음으로 환자에게 도달시킨다.** 라벨 `'바로 누운 자세 유지 가능 (눕고 다시 일어나기 포함)'`은 절대적으로 읽히므로, 향후 batch에서 라벨 문구를 "쓰여진 용량 그대로는 안 됨"에 맞춰 다듬을지 검토 여지 있음(v1 비차단).
- 목표기능 미선택 조기 return(`PainWorkspace.tsx:574-591`) 경로에서는 결정 행이 렌더되지 않는다 — closing review가 이미 남긴 관찰이며, 이제 NO 표시도 같이 안 보인다는 점만 추가된다. 값 자체는 보존되므로 무해.
- 원장 대면 힌트에 `(YES)`/`(NO)` 라틴 표기가 남아 있다(`:268-269`). Batch 2부터의 기존 관례(`확인되면(YES)`)를 그대로 이어받은 것이고 환자 노출 문구가 아니므로 Korean-first 위반으로 보지 않는다.
- `LOAD_READY` 라벨의 `irritability`(`lbpEligibilityContext.ts:75`)는 이번 범위 밖의 기존 잔여 영어. 다만 CD-3로 이 라벨이 **버튼과 함께 원장 화면에 직접 노출되는 빈도가 올라갔으므로**, 다음 명명 라운드에서 함께 볼 것.
- `.gitignore`/`package.json` 변경 없음 — 새 테스트가 기존 번들 2개를 재사용해 스크립트 추가가 불필요했다. 정상.