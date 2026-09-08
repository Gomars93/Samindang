# Opus 종결 검수 (closing review) — LBP v1 Batch 2.6

대상: `/home/user/Samindang`, 브랜치 `claude/clinical-os-lbp-architecture-xym6po`, HEAD `9e8fe19`
검수 delta: `git diff 4f3ce14..9e8fe19` (= `44047f2` PO 결정 문서 + `be8e072` D-1..D-6 수정 + `9e8fe19` D-7 HANDOFF)
근거: 본인 delta 검수 `opus-batch26-delta-review-full.md` (FAIL, D-1..D-7)

## Closing disposition: **FAIL**

**남은 결함 3건은 전부 LOW이고 임상 판단이 아니다.** D-1의 HIGH 부분(재진에서 필드가
보이지도 고쳐지지도 않던 고아화, EMR·환자 전달문으로의 조용한 전파)은 **완전히
해소됐고**, 렌더로 재확인했다. D-2·D-3·D-4·D-5·D-6·D-7도 전부 RESOLVED다.

그럼에도 FAIL인 이유는 두 가지다.

1. 프롬프트가 D-1의 재확인 기준으로 명시한 **(b) "버튼이 활성→클릭→화면 변화 0→비활성"이
   좁은 상태에서 여전히 재현된다** (재진에서 직전 방문의 치료계획 텍스트가
   `nextVisitCheckItem` 하나뿐일 때). 값은 이제 편집 가능하지만 접힘 뒤에 있고 재진에는
   되읽기(NextActionCard)가 없어, 클릭이 아무 일도 안 한 것처럼 보인다. → **N-1**
2. D-2 수정이 **새 회귀를 하나 만들었다**: 이미 지시문이 있는 카드에서 그 텍스트를 전부
   지우면 입력칸이 편집 도중 언마운트되고 `최종 지시문 추가` 버튼으로 되돌아간다.
   `4f3ce14`에는 없던 동작이고, 주석이 "`ExamSuggestionCard`의 패턴을 그대로 따랐다"고
   주장하는 바로 그 지점에서 갈라진다. → **N-2**

셋 다 1~3줄 수정이다. PO가 "2.7로 이월하고 게이트를 닫는다"를 택하는 것도 합리적이지만,
검수자로서는 **게이트가 아직 닫히지 않았다**고 보고한다.

---

## 1. D-1 ~ D-7 판정

| # | 판정 | 한 줄 근거 |
|---|---|---|
| D-1 | **RESOLVED WITH ISSUE** | 고아화 해소(초진 1개 / 재진 1개, 렌더 실측). 다만 재진 `이어받기` 무피드백 경로가 남음 → N-1 |
| D-2 | **RESOLVED WITH ISSUE** | mount 이후 도착한 지시문이 보인다(실측). 다만 값을 비우면 입력칸이 언마운트 → N-2 |
| D-3 | **RESOLVED** | 실제 `<details>` 토글 상태를 추적. (a)(b) 둘 다 실측으로 사라짐 |
| D-4 | **RESOLVED** | 자기참조 테스트 삭제. 같은 mutant의 **실제** 실패 단언 수 1 → **2**로 증가 |
| D-5 | **RESOLVED** | 3곳 전부 정정. 렌더 실측 chip 15개(5행×3), `미판단` 미출력 |
| D-6 | **RESOLVED** | E-16 mutant가 이제 **E-16 전용 단언**으로 죽는다(메시지 아래) |
| D-7 | **RESOLVED** | HANDOFF가 Git 실제 상태와 일치. 사소한 표기 nit 1건만 |

---

### D-1 — 재진 `carePlan.nextVisitCheckItem` 고아화 — RESOLVED WITH ISSUE

**수정 형태**: 권장했던 (a)안 그대로.
`src/doctor/workspace/CarePlanCard.tsx:27` `showNextVisitCheckItem = true` (기본 노출),
`:59-61` 조건부 필드, `src/doctor/workspace/PainWorkspace.tsx:769`
`<PainCarePlanCard ... showNextVisitCheckItem={false} />` — **초진 호출부만** opt-out.
`RevisitWorkspace.tsx:800-803`은 무변경(기본값). 호출부는 정확히 2곳뿐이고 그중 1곳만 opt-out
(`grep -rn PainCarePlanCard src --include=*.tsx`).

**불변식을 diff가 아니라 렌더로 재확인했다.** (react-test-renderer, `<details open>` 중첩을
추적해 접힘 뒤/앞을 분리 계수)

| 화면 | `nextVisitCheckItem`에 바인드된 편집 가능 컨트롤 | 위치 |
|---|---|---|
| **초진** (`DoctorWorkspace` + `submissionId`) | **정확히 1개** | `<textarea aria-label="다음 방문 확인 메모" class="workspace__noteInput doctor__nextVisitCheckMemo">` (항상 보임, 레인4) — 카드 안 사본 0개 |
| **재진** (`RevisitWorkspace`, `serverClient` 스텁으로 실제 로드까지 태움) | **정확히 1개** | `PainCarePlanCard`의 6번째 `<textarea>` (라벨 `다음 방문 확인 사항`) |

0개도 2개도 아니다. 재진 렌더에서 `ORPHAN-VALUE`를 담은 non-readonly `<textarea>` = 1,
readonly = 0. 복원된 필드 정의는 `eea4c6b`의 것과 **바이트 단위로 동일**하다
(`CarePlanCard.tsx:60` vs `eea4c6b:CarePlanCard.tsx:31`).

**세 가지 귀결 재실행**

- **(a) 이어받기가 쓴 값을 원장이 보고 고칠 수 있는가 — YES.**
  직전 방문(무문진 재진)의 workspace를 `nextVisitCheckItem`만 채워 놓고 실제로
  `이전 처치·관리계획 유지` 버튼의 `onClick`을 발화시켰다:
  ```
  [클릭 전] carePlan <details> open = false / 버튼 disabled = false / 값 담은 편집 컨트롤 = 0
  [클릭 후] carePlan <details> open = false / 버튼 disabled = true  / 값 담은 편집 컨트롤 = 1
  ```
  `4f3ce14`에서는 클릭 후에도 **0개**였다(고아). 지금은 1개 — 접힘을 한 번 펼치면 보이고
  고치고 지울 수 있다. **D-1의 핵심(편집 경로 상실)은 해소됐다.**

- **(b) 버튼이 활성→클릭→화면 변화 0→비활성 — 좁은 경우에 여전히 재현된다.**
  위 로그가 그대로 그 경로다. `isCarePlanEmpty`는 `nextVisitCheckItem`을 세지 않으므로
  (`NextActionCard.tsx:35-43`) 재진 `<details>`(`RevisitWorkspace.tsx:798`)는 **열리지 않고**,
  재진에는 `NextActionCard` 되읽기가 없다. 원장이 보는 화면은 클릭 전후로 동일하고 버튼만
  회색이 된다. → **N-1**(LOW). 단, 직전 방문에 `시행/예정 처치`·`즉시 재검 대상`이나
  Care Plan 5필드 중 하나라도 텍스트가 있으면 그 값들은 재진에서 **항상 보이는** 칸에
  들어가므로 화면이 눈에 띄게 변한다 — 무피드백은 "직전 계획 텍스트가 `nextVisitCheckItem`
  하나뿐"인 경우에 한정된다(한약 `symptomsToTrack`만 있던 방문 등).

- **(c) 원장이 한 번도 못 본 문장이 EMR 줄이나 환자 전달문에 실릴 수 있는가 — NO.**
  `emrPreview.ts:158,197`과 `patientCarePlanPreview.ts:35,50`의 `다음 방문 확인` 줄을 소비하는
  화면은 `PainWorkspace`/`HerbalWorkspace`(문진 기반 초진)뿐이다
  (`grep -rn patientCarePlanPreview src`). `RevisitWorkspace`는 EMR/전달문을 렌더하지 않고,
  문진 기반 방문의 workspace는 재진 visit workspace에서 시드되지 않는다. 그리고 초진 화면에서
  이 필드는 레인4에 **항상 보인다**. → 이 경로는 닫혀 있다.

**부수 확인 (요구된 대로)**
- `isCarePlanEmpty`는 여전히 5필드만 센다 — `NextActionCard.tsx:35-43`에 `nextVisitCheckItem`
  없음. **E-1의 승리는 그대로다.**
- 레인4 메모에 타이핑해도 disclosure는 열리지 않는다 — `nextVisitCheckItem`만 채운
  초진 렌더에서 `관리 계획 · 다음 재평가` `<details>` `open = false`, 대신
  `NextActionCard`가 렌더된다(되읽기 유지).

---

### D-2 — mount 이후 채워진 운동 `최종 지시문` — RESOLVED WITH ISSUE

**파생형 확인**: `RehabSuggestionCard.tsx:48-49`
```ts
const [instructionOpen, setInstructionOpen] = useState(false)
const showInstruction = instructionOpen || suggestion.clinicianFinalInstruction.trim() !== ''
```
`ExamSuggestionCard.tsx:62-72`의
`const hasDetail = ...; const [detailOpen, setDetailOpen] = useState(hasDetail); const showDetail = detailOpen || hasDetail || status === 'NOT_PERFORMED'`
와 **파생 구조는 일치**한다(`:105` 렌더 게이트도 `showInstruction`으로 교체됨).
차이는 하나: `useState`의 **초기값이 `hasDetail`이 아니라 `false`** 라는 점 — 이것이 N-2의 원인이다.

**직접 프로브 재실행** (같은 인스턴스에 `initialRecordUpdatedAt`만 진행시켜 재시드):
```
[4f3ce14] mount empty          -> input=0 toggle=1
[4f3ce14] after post-mount fill-> input=0 toggle=1  value=undefined      ← 영구히 숨음
[9e8fe19] mount empty          -> input=0 toggle=1
[9e8fe19] after post-mount fill-> input=1 toggle=0  value=LATER-VALUE    ← 보인다
```
**conflict-reload 경로**(`DoctorWorkspace.tsx:395` `handleReloadFromConflict`)는 같은
`resetKey`를 유지한 채 `workspaceState`를 서버 값으로 갈아끼우므로 카드 인스턴스가 유지된다 —
새 테스트(`tests/doctor-workspace.spec.mjs:3317`)는 재시드 effect의 **실제 가드 조건**
(`initialRecordUpdatedAt` 진행 + 로컬 편집 없음)을 같은 public seam으로 재현한다. 적절한 대리다.
mutant(파생형을 되돌림)를 만들어 이 테스트가 정확히 그 단언으로 죽는 것도 확인했다.

**남은 문제 → N-2**: 값이 있는 상태로 mount한 뒤 그 텍스트를 **전부 지우면**
`showInstruction`이 false가 되어 입력칸이 편집 도중 사라진다(`4f3ce14`에는 없던 동작).

---

### D-3 — `NextActionCard` 게이트가 실제 disclosure 상태를 본다 — RESOLVED

`PainWorkspace.tsx:700` `carePlanDetailsOpen`(내용 유무, `open` 속성 전용) /
`:716` `const [planOpen, setPlanOpen] = useState(carePlanDetailsOpen)` /
`:762` `onToggle={(e) => setPlanOpen(e.currentTarget.open)}` / `:751` `{!planOpen && ...}`.

React 18.3.1은 `toggle`을 `nonDelegatedEvents`에 넣어 `<details>`에 **직접** 리스너를
붙인다(`node_modules/react-dom/cjs/react-dom.development.js`의
`nonDelegatedEvents = new Set(['cancel','close','invalid','load','scroll','toggle']...)`) —
`onToggle`은 실제 DOM 이벤트에 연결된다.

**두 증상 직접 재현** (old = `4f3ce14`, new = `9e8fe19`):
```
(a) 내용이 있어 자동으로 열린 disclosure를 손으로 접는다
  [old] onToggle 핸들러 자체가 없음 → NextActionCard = false (되읽기 영구 소실)
  [new] 접은 뒤 NextActionCard = true                     ← 되읽기 복구
(b) 빈 상태에서 손으로 열고 첫 글자를 친다
  [old] 손으로 연 직후 true → 첫 글자 입력 순간 false      ← 커서 위 블록이 언마운트
  [new] 손으로 연 순간 false → 첫 글자 입력 후에도 false    ← 타이핑 중 이동 없음
```
(b)의 언마운트는 **타이핑 시점에서 summary 클릭 시점으로 옮겨졌다.** 그 클릭은 그 자체가
큰 레이아웃 변화를 일으키는 조작이고 그 순간 커서가 입력칸에 있지 않으므로, F-1이 지적한
"진료 중 요소 이동"의 위험은 실질적으로 제거됐다고 본다(관찰 O-7).

`onToggle`을 제거한 mutant는 `details.props.onToggle is not a function`으로 죽고,
게이트를 무조건 렌더로 바꾼 mutant는 D-3 전용 단언으로 죽는다(아래 mutant 표).

**테스트 충실도 한 가지**: 새 D-3 테스트(`:2323`, `:2362`)는 `details.props.onToggle({...})`를
**직접 호출**한다(이 저장소에 DOM 환경이 없으므로 불가피). React-DOM의 이벤트 배선 자체는
검증하지 않는다 — 위의 `nonDelegatedEvents` 확인으로 보완했다. 결함 아님, 기록만 한다.

---

### D-4 — 자기참조 "mutant reproduction" 테스트 — RESOLVED

`tests/doctor-workspace.spec.mjs`에서 해당 `test()` 블록이 삭제됐다(제거된 `-` 라인 35~40).
**delta 전체에서 삭제된 `test()`는 이것 하나뿐이다**(아래 C절 전수 확인).

**재확인 기준 그대로 실행** — `RevisitWorkspace.tsx`를 `eea4c6b`로 되돌리고, 러너를
try/catch로 감싸 **모든** 실패를 세었다:
```
[4f3ce14] FAILCOUNT 1   Batch 2.6 E-3 :: a <details> precedes the card
[9e8fe19] FAILCOUNT 2   D-1 source scan :: a <details> precedes the card
                        Batch 2.6 E-3   :: a <details> precedes the card
```
실제 실패 단언 수는 **줄지 않고 1 → 2로 늘었다**. 삭제된 것은 제품 코드를 한 줄도
실행하지 않던 공허한 단언뿐이다.

---

### D-5 — `미판단` 제거 후 남은 잘못된 주석/문서 3곳 — RESOLVED

- `LbpWorkingHypothesisCard.tsx:6-14` → "5행 × 3 chip … `UNJUDGED`는 렌더되는 chip이 아니다"
- `lbpWorkingHypothesis.ts:64-72` → "renders only the OTHER 3 … This array still lists all 4 —
  it is the full stored value type, not the render list."
- `docs/LBP_PRODUCTION_V1_MINIMAL_ARCHITECTURE_v0.1.md:426-430` → `5행 × 3 chip` + 승인 근거

세 주장 모두 코드와 일치함을 **렌더로** 확인: `LbpWorkingHypothesisCard`를 빈 값으로
SSR하면 `workspace__followUpChip` = **15개**(5행×3), `미판단` 문자열 **미출력**.
저장 기본값 `UNJUDGED`와 재클릭 해제 경로(`:73` `onSelect(activeValue === opt ? 'UNJUDGED' : opt)`)는
무변경이고, `test:lbp-working-hypothesis`의 interactive 재클릭 테스트가 218 단언으로 통과한다.
두 소스 파일의 diff는 **주석 전용**(코드 라인 diff 공집합)임을 확인했다.

남아 있는 `5행 × 4 chip` 언급 2곳(`docs/DOCTOR_SCREEN_LOAD_AUDIT_OPUS_v0.1.md:46,247`,
`docs/LBP_V1_BATCH2_5C_OPUS_DELTA_REVIEW_v0.1.md:382`)은 **당시 상태를 기록한 감사/검수
문서**이므로 고치면 안 된다 — 조치 불필요.

---

### D-6 — 테스트 disclosure 탐색 문자열 충돌 — RESOLVED

6곳(`:2073, 2081, 2113, 2137, 2194, 2213`) 전부
`indexOf('관리 계획 · 다음 재평가 — 자세히 입력')`로 교체됐다. `NextActionCard.tsx`의 빈 상태
문구에는 `— 자세히 입력`이 없으므로 더 이상 충돌하지 않는다.

**E-16 mutant 직접 재실행 — 요구대로 메시지를 보고한다.**

(A) `PainWorkspace.tsx`를 `eea4c6b`로 되돌림:
```
FAILTEST Batch 2.6 E-16/C-2: NextActionCard renders ONLY while the 관리 계획 disclosure is closed
  :: NextActionCard does NOT render while the disclosure is open -- it would be a pure duplicate of the open form
(+ C-1, D-1 source scan, D-3 ×2 = FAILCOUNT 5)
```
(B) 게이트만 외과적으로 제거(`{!planOpen && (` → `{true && (`):
```
FAILTEST Batch 2.6 E-16/C-2: NextActionCard renders ONLY while the 관리 계획 disclosure is closed
  :: NextActionCard does NOT render while the disclosure is open -- it would be a pure duplicate of the open form
(+ D-3 ×2 = FAILCOUNT 3)
```
이전에는 엉뚱한 E-1 differential 단언(`a non-empty currentTreatmentGoal alone still opens the
disclosure`)으로 죽었다. 이제 그 단언은 **통과하고**(실패 목록에 없음) E-16 전용 단언이
발화한다. 우연한 kill이 진짜 kill로 바뀌었다.

---

### D-7 — `HANDOFF.md`가 Git과 어긋남 — RESOLVED

`HANDOFF.md:3-72`에 `최신 13` 항목이 최상단에 추가됐다. 대조 결과:

| 요구 | 상태 |
|---|---|
| 현재 HEAD를 명시 | ✅ (간접) `:5` "HEAD `be8e072` + 이 문서 커밋" = `9e8fe19` |
| origin과 동일 | ✅ `origin/claude/clinical-os-lbp-architecture-xym6po` = `9e8fe19` |
| 감사 기록 | ✅ `:12-20` 실측 수치 + 원인 3가지 + 최대 결함 + `SupportContradictionPanel` 死표면 |
| Batch 2.6 + D-1 회귀 | ✅ `:22-33` "이 batch가 회귀를 하나 만들었다(교훈)" + 원인/수정/**교훈** 명시 |
| PO 결정 4건 | ✅ `:35-40` CD-2.7-1..4 요약, `DECISIONS.md` 2026-09-04 항목과 일치 |
| 다음 행동 / 백로그 | ✅ `:44-64`, O-3/O-5/O-6까지 백로그로 승계 |
| 환자 개인정보 | ✅ 실제 값 없음(필드명·구조 수준) |

**남은 부정확 (nit, 조치 선택)**
- `:5` HEAD를 `be8e072`로 적어 `git log`의 `9e8fe19`와 문자열이 다르다. "+ 이 문서 커밋"이
  붙어 있어 오독 위험은 낮지만, 다음 세션이 `git log --oneline -1`과 대조할 때 한 번 멈춘다.
- `:24-33`은 D-1만 서술하고 D-2/D-3/D-4/D-5/D-6은 "Opus delta FAIL → `be8e072` 수정"으로만
  뭉뚱그린다. Git 상태와 모순은 아니다(불완전할 뿐).
- `:20` "실측 감소 … 탭 요소 63 → 56 / chip 52 → 47"은 `DoctorWorkspace` 서브트리 한
  시나리오 기준이며 감사 A-1의 "약 70"과 계수 범위가 다르다 — 그 사실이 HANDOFF에는 없다.
- `:6` "PR 미생성(운영 방침)"은 이 환경에 `gh`가 없어 기계적으로 확인하지 못했다.

---

## A. 화면 재측정 (`9e8fe19` 최종 수치)

측정 방법: `eea4c6b` / `4f3ce14` / `9e8fe19` 세 리비전을 각각 /tmp에 `git archive`로 펼쳐
**동일한 esbuild 번들 + 동일한 harness**로 렌더하고, `<details>` 중첩을 추적해
`open` 없는 disclosure 안쪽을 "접힘"으로 분리 계수했다. 재진은 `serverClient`를 스텁으로
바꿔 `RevisitWorkspace` 전체를 실제 로드 사이클까지 태워 렌더했다(이전 검수의 카드 단위
근사보다 정확하다).
탭 = `button` + `summary` + `select` + `a[href]` + radio/checkbox. 자유입력 = non-readonly
`textarea` + non-readonly text/number/date `input`.
시나리오: `PAIN_SCENARIO_1`, `synthetic: undefined`, `lbpObjectiveMotorDeficit='NONE'`.
(주: 이 harness의 절대 탭 수치는 이전 검수의 SSR 계수와 시나리오 설정이 달라 값이 다르다 —
**세 리비전을 같은 harness로 재쳤으므로 Δ는 비교 가능하다.**)

### A-1. LBP 초진 — **D-1 수정이 되돌린 감소분: 0**

| 상태 | 지표 | `eea4c6b` | `4f3ce14` | **`9e8fe19`** |
|---|---|---|---|---|
| **빈 화면** | 항상 보이는 자유입력 | 4 | 4 | **4** |
| | 항상 보이는 탭 | 56 | 51 | **51** |
| | 접힘 뒤 자유입력 | 12 | 11 | **11** |
| **진료 중반** | **항상 보이는 자유입력** | **14** | **6** | **6** |
| | 항상 보이는 탭 | 82 | 76 | **76** |
| **Care Plan 내용 있음** | 항상 보이는 자유입력 | 10 | 9 | **9** |
| | 항상 보이는 탭 | 59 | 54 | **54** |

**초진은 `4f3ce14`와 한 칸도 다르지 않다.** 초진 호출부가 계속 opt-out하기 때문이다.
진료 중반 자유입력 **14 → 6 (−8)** 은 그대로 남았고, 남은 6칸도 그대로다
(최종 임상 판단 / 시행·예정 처치 / 즉시 재검 대상 / 다음 방문 확인 메모 / 오늘 기준값 /
치료 직후 값). 목표 5와의 차이는 여전히 `치료 직후 값` 한 칸 = CD-2.7-3(Batch 2.7).

### A-2. LBP 재진 — **되돌린 감소분: 접혀 있는 상태에서 0, 펼쳐진 상태에서 +1**

| 상태 | 지표 | `eea4c6b` | `4f3ce14` | **`9e8fe19`** |
|---|---|---|---|---|
| **화면 열자마자(빈 값)** | 항상 보이는 자유입력 | 10 | 4 | **4** |
| | 항상 보이는 탭 | 38 | 39 | **39** |
| | 접힘 뒤 자유입력 | 2 | 7 | **8** (+1 = 복원된 필드) |
| **target 3개 선택** | 항상 보이는 자유입력 | 16 | 10 | **10** |
| **Care Plan에 내용 있음(자동 펼침)** | 항상 보이는 자유입력 | 10 | 9 | **10** (+1) |
| **`nextVisitCheckItem`만 있음** | 항상 보이는 자유입력 | 10 | 4 | **4** (값은 접힘 뒤) |

**PO에게 중요한 한 줄**: Batch 2.6이 만든 감소는 **전부 유지된다** — 초진 진료 중반 자유입력
**14 → 6**, 재진 화면 열자마자 **10 → 4**. D-1 수정이 되돌린 것은 **재진에서 Care Plan
접힘이 이미 펼쳐져 있을 때의 자유입력 1칸뿐**(9 → 10)이고, 그 한 칸이 바로 "원장이 그
값을 볼 수 있는 유일한 자리"다. 대가로 얻은 것이 정확히 그것이므로 **손해가 아니다.**
재진 탭이 `eea4c6b` 대비 38 → 39로 1 늘어난 것은 새 `<summary>` 하나이며, 그 대가로
자유입력 6칸이 접힘 뒤로 갔다.

(재진 chip 52 → 47은 이 harness에서 재현되지 않았다 — `LbpWorkingHypothesisCard`가
`isLbpPatientForRevisitHypothesisGate`로 게이트되어 스텁 데이터에서는 렌더되지 않기
때문이다. 그 −5는 `LbpWorkingHypothesisCard`의 15 chip 렌더 실측으로 별도 확인했고
이번 delta는 그 파일의 코드를 건드리지 않았다.)

---

## B. Section G — 12 untouchables 전수 재확인

이번 fix delta가 건드린 소스는 5개뿐이다(`CarePlanCard` / `LbpWorkingHypothesisCard`(주석) /
`PainWorkspace` / `RehabSuggestionCard` / `lbpWorkingHypothesis.ts`(주석)).

| G# | 판정 | 근거 |
|---|---|---|
| 1 | 무손상 | 해당 파일 diff에 없음 |
| 2 | 무손상 | `ObjectiveExamFindingsCard` diff에 없음; 초진 렌더에 라디오 3개 그대로 |
| 3 | 무손상 | `provenance.ts` zero-diff |
| 4 | 무손상 | `ExamSuggestionCard.tsx:72` 무변경 (D-2 수정은 `RehabSuggestionCard`만 건드림) |
| 5 | 무손상 | `PainWorkspace.tsx:167` — diff hunk는 `@@ -694`, `-735`, `-743` 셋뿐 |
| 6 | 무손상 | `RehabSuggestionCard.tsx:7,56`의 `PROVENANCE_BADGE` import·렌더 유지 |
| 7 | 무손상 | `LbpWorkingHypothesisCard.tsx:137` `임상 가설(확정 진단 아님)` 리터럴 그대로, 코드 diff 공집합 |
| 8 | 무손상 | `FollowUpTargetPicker.tsx` diff에 없음 |
| 9 | 무손상 | `revisitQuickCheck.ts` zero-diff, `RevisitQuickCheckCard` diff에 없음 |
| 10 | 무손상 | `RevisitWorkspace.tsx`가 이 delta에 **아예 없다**; `revisitCarryForward.ts` zero-diff |
| 11 | 무손상 + **개선** | `ConflictBanner` 무변경. D-2 수정이 바로 그 conflict-reload 경로의 결함을 없앴다 |
| 12 | 무손상 | `LbpWorkingHypothesisCard.tsx:138` 힌트 리터럴 그대로 |

**교란된 항목 없음.**

---

## C. 새 결함 / 삭제·약화된 단언 전수 확인

### 삭제된 `-` 라인 41줄 전수 확인 (src + tests + package.json + .gitignore)

- 삭제된 `test()` 블록: **1개** — D-4의 자기참조 테스트. **예상대로였고 유일하다.**
- 삭제된 `assert`: 그 블록 안의 1개뿐. 다른 곳에서 약화·주석화·skip된 단언 **0건**.
- 삭제된 테스트 파일 **0건**.
- 탐색 문자열 6줄(`-  const idx… = …indexOf('관리 계획 · 다음 재평가')`)은 **더 긴 문자열로
  교체**됐다 — 약화가 아니라 강화(D-6).
- 나머지 삭제 라인은 전부 주석 문단, `PainCarePlanCard` 시그니처 1줄, 게이트 표현 3줄,
  `useState` 1줄, `instructionOpen ?` 1줄, `package.json`의 `test:doctor-workspace` 1줄
  (esbuild 스텝 **추가**만, 다른 스크립트·의존성 변경 없음).
- 단언 총수: doctor-workspace **252 → 257** (신규 6 − 삭제 1). 나머지 6개 스위트 수치 동일.

### 새 가드의 비공허성 (mutant 5종, 전부 /tmp 사본에서만, 삭제 완료)

| mutant | 결과 |
|---|---|
| `showNextVisitCheckItem` 기본값 `true` → `false` | **kill** — `D-1 … by DEFAULT :: the field label renders by default` |
| `RevisitWorkspace`가 `showNextVisitCheckItem={false}`를 넘김 | **kill** — `D-1 … must NOT opt out -- it has no other textarea for this field` |
| D-2 파생형을 mount-time `useState`로 되돌림 | **kill** — `D-2: an instruction that arrives after mount must show…` |
| `{!planOpen &&` → `{true &&` | **kill** — E-16 전용 단언 + D-3 전용 단언 |
| `PainWorkspace.tsx` 전체를 `eea4c6b`로 되돌림 | **kill ×5** (C-1, E-16, D-1 scan, D-3 ×2) |
| `RevisitWorkspace.tsx`를 `eea4c6b`로 되돌림 | **kill ×2** (D-1 scan, E-3) |

**delta 검수에서 "존재하지 않는다"고 지적한 D-1 가드가 이제 존재한다**
(`tests/doctor-workspace.spec.mjs:2230, 2252, 2274`). 세 개 중 하나는 "재진이 opt-out하면
실패"라는 회귀 전용 가드다 — 이번 회귀를 아무도 잡지 못했던 자리가 메워졌다.

### 새로 발견한 결함 3건

#### N-1 (LOW) — 재진 `이어받기`가 `nextVisitCheckItem`만 채울 때 화면 피드백이 0이다

**위치**: `src/doctor/workspace/RevisitWorkspace.tsx:798`
`<details className="workspace__revisit__optional" open={!isCarePlanEmpty(workspaceState.carePlan)}>`

`isCarePlanEmpty`(`NextActionCard.tsx:35-43`)가 `nextVisitCheckItem`을 제외하는 근거는
**"그 필드는 이 disclosure 밖의 항상 보이는 레인4 textarea에 있다"**인데, 그것은 **초진에서만
참**이다. 재진에서는 그 필드가 이 disclosure **안**에 있는 유일한 편집 경로다. 같은 술어를
두 화면이 공유하면서 전제가 한쪽에서만 성립한다.

관측(실제 `onClick` 발화):
```
[클릭 전] open=false / disabled=false / 값 담은 편집 컨트롤=0
[클릭 후] open=false / disabled=true  / 값 담은 편집 컨트롤=1 (접힘 뒤)
```
원장 입장: 버튼을 눌렀고, 화면은 그대로고, 버튼은 회색이 됐다. 되읽기(NextActionCard)는
재진에 없다. 값은 **유실되지 않고 편집 가능**하므로 D-1의 HIGH 부분은 아니지만,
프롬프트가 지정한 재확인 기준 (b)는 이 상태에서 여전히 실패한다.

**최소 수정** (`RevisitWorkspace.tsx:798`, 1줄):
```tsx
open={!isCarePlanEmpty(workspaceState.carePlan) || workspaceState.carePlan.nextVisitCheckItem.trim() !== ''}
```
근거를 한 줄 주석으로: "이 화면에서는 `nextVisitCheckItem`이 이 접힘 **안**에 있으므로
'접힘 안에 내용이 있는가'에 포함되어야 한다 — 초진은 그 필드가 접힘 밖(레인4)이라
`isCarePlanEmpty`가 제외하는 것이 맞다." (E-1의 초진 승리는 초진 코드 경로를 전혀
건드리지 않으므로 그대로 유지된다.)

**기계적 재확인 기준**
1. 직전 방문 workspace의 `carePlan`이 `nextVisitCheckItem`만 채워진 상태로 `RevisitWorkspace`를
   렌더 → `이전 처치·관리계획 유지` `onClick` 발화 → `치료 계획 (Care Plan)` `<details>`의
   `open === true`이고 값이 **펼쳐진 쪽**의 편집 가능한 `<textarea>`에 있다.
2. 초진(`DoctorWorkspace` + `submissionId`)에서 `nextVisitCheckItem`만 채운 렌더의
   `관리 계획 · 다음 재평가` `<details>`는 **여전히 `open === false`**이고 `NextActionCard`가
   렌더된다(기존 E-1 테스트 `:2113`가 그대로 통과 = 회귀 없음).

#### N-2 (LOW) — 이미 있던 운동 `최종 지시문`을 비우면 입력칸이 편집 도중 사라진다

**위치**: `src/doctor/workspace/RehabSuggestionCard.tsx:48`
`const [instructionOpen, setInstructionOpen] = useState(false)`

`ExamSuggestionCard.tsx:62-63`은 `useState(hasDetail)`로 **mount 시 내용이 있으면 열림을
latch**한다. 이 카드는 `useState(false)`이므로 latch가 없고, `showInstruction`이 순수하게
현재 값에만 의존한다. 결과:

```
[4f3ce14] mount with content -> input=1 toggle=0 ; 텍스트 전부 삭제 -> input=1 toggle=0
[9e8fe19] mount with content -> input=1 toggle=0 ; 텍스트 전부 삭제 -> input=0 toggle=1  ← 언마운트
```
원장이 지시문을 지우려고 전체 선택 후 Delete를 누르는 순간 입력칸이 사라지고
`최종 지시문 추가` 버튼으로 바뀐다 — 포커스가 날아가고 계속 쓰려면 다시 탭해야 한다.
태블릿에서 특히 거슬린다. 저장되는 값(빈 문자열)은 정확하므로 데이터 문제는 없다.
`RehabSuggestionCard.tsx:44` 주석의 "Following ExamSuggestionCard.tsx:62-73's OWN pattern
**exactly**"는 이 한 글자 때문에 사실이 아니다.

**최소 수정** (`:48`, 초기값만):
```ts
const [instructionOpen, setInstructionOpen] = useState(suggestion.clinicianFinalInstruction.trim() !== '')
```
`showInstruction`(`:49`)은 그대로 둔다 — D-2 수정(파생)은 유지되고 latch만 복원된다.
이러면 `ExamSuggestionCard`와 **문자 그대로** 같은 형태가 된다.

**기계적 재확인 기준**: 비어 있지 않은 `clinicianFinalInstruction`으로 mount → 그 input의
`onChange`로 `''`를 넣는다 → `workspace__noteInput` input이 **여전히 1개**이고
`최종 지시문 추가` 버튼은 0개다. (D-2 테스트 `:3317`은 그대로 통과해야 한다.)

#### N-3 (LOW, 문서) — 코드와 어긋나는 주석 2곳 (D-5와 같은 부류)

(a) **`src/doctor/workspace/PainWorkspace.tsx:720-725`**
> `delta: nextVisitCheckItem 제거 철회 -- 필드는 CarePlanCard 안에도 그대로 남는다, 이건 추가 배치일 뿐 대체가 아니다`

`:769`가 `showNextVisitCheckItem={false}`를 넘기므로 **초진에서는 정확히 "대체"다.**
다음 세션이 이 주석을 읽고 레인4 textarea를 "중복"으로 판단하면 D-1과 정확히 같은 회귀가
반대 방향으로 재발한다.
**최소 수정**: "delta(Batch 2.6 C-1/D-1): 초진에서는 이 textarea가 `nextVisitCheckItem`의
**유일한** 편집 경로다(카드는 `showNextVisitCheckItem={false}`). 재진에는 이 레인이 없어
카드가 기본값으로 그 필드를 그린다."

(b) **`src/doctor/workspace/NextActionCard.tsx:24-34`**
`isCarePlanEmpty`의 doc comment가 "that field is also the one bound to the always-visible
… textarea one lane above **this disclosure**" / "this whole **6-field** disclosure"라고
단정하는데, 이 술어를 import해 쓰는 `RevisitWorkspace.tsx:82,798`에는 그 레인4 textarea가
없고 그쪽 disclosure는 6필드다. **N-1의 원인이 정확히 이 문서화된 전제의 화면 의존성이다.**
**최소 수정**: "…초진 화면(`PainWorkspace.tsx`)에서만 참인 전제다. 이 필드가 접힘 **안**에
있는 화면(`RevisitWorkspace`)은 이 술어에 그 필드를 별도로 더해야 한다"는 한 문장 추가.

**재확인 기준(N-3 공통)**: 두 주석에 남은 "필드는 카드 안에도 그대로 남는다" / "6-field
disclosure"류 단정이 없다. (기계 검사 불필요 — 리뷰 항목.)

---

## D. 불변식

| 불변식 | 결과 |
|---|---|
| FROZEN zero-diff (`git diff --stat origin/main -- src/spec index.html src/App.tsx server "tablet core"`) | **빈 출력 ✅** |
| `patientCarePlanPreview.ts` / `provenance.ts` / `lbpExerciseEligibility.ts` / `revisitQuickCheck.ts` zero-diff (`4f3ce14..9e8fe19`) | **빈 출력 ✅** |
| `LbpAwaitingCapabilitySection` 무변경 | ✅ 정의는 `PainWorkspace.tsx:239`, 이 delta의 hunk는 `@@ -694`, `-735`, `-743` 뿐 |
| 스키마 / 영속 필드 무변경 | ✅ `carePlan.ts` · `persistence.ts` · `visitWorkspace.ts` · `emrPreview.ts` · `finalAssessment.ts` 전부 zero-diff. `PainCarePlan`은 여전히 6필드 |
| 환자 문구 무변경 | ✅ delta가 추가한 사용자 노출 리터럴은 `다음 방문 확인 사항` / `원장이 직접 입력` **하나**뿐이고, `eea4c6b:CarePlanCard.tsx:31`과 **바이트 동일한 복원**이며 원장 화면 전용. `patientCarePlanPreview.ts` zero-diff |
| `RevisitWorkspace.tsx` | ✅ 이 delta에 **등장하지 않음** (D-1을 재진 코드를 건드리지 않고 고쳤다) |
| `package.json` / `.gitignore` | ✅ `test:doctor-workspace`에 `CarePlanCard.tsx` esbuild 스텝 1개 추가, 산출물 `tests/.care-plan-card-bundle.cjs`는 `.gitignore:110` 등재 + `git ls-files` 빈 출력(미추적) |
| 워킹트리 | ✅ 검수 전후 `git status --porcelain` 빈 출력. mutant는 전부 `/tmp/b26/*` 사본에서만 만들었고 **삭제 완료** |

**요구된 명령 전부 실행 (전부 통과)**
```
npx tsc -b                                EXIT 0
npm run test:doctor-workspace             257 assertions   EXIT 0   (252 → 257)
npm run test:workspace-round3             179 assertions   EXIT 0
npm run test:doctor-reset-key              11 assertions   EXIT 0
npm run test:lbp-working-hypothesis       218 assertions   EXIT 0
npm run test:lbp-exercise-recommendation   23 tests        EXIT 0
npm run test:emrSummary                    14 assertions   EXIT 0
```

---

## 남은 결함 요약 (수정 우선순위)

| # | 심각도 | 요약 | 파일:행 | 최소 수정 |
|---|---|---|---|---|
| N-1 | LOW | 재진 `이어받기`가 `nextVisitCheckItem`만 채우면 화면 변화 0 + 버튼 비활성. 값은 접힘 뒤에 있고 재진엔 되읽기가 없다 | `RevisitWorkspace.tsx:798` | `open` 조건에 `|| carePlan.nextVisitCheckItem.trim() !== ''` (1줄) |
| N-2 | LOW | 이미 있던 운동 `최종 지시문`을 비우면 입력칸이 편집 도중 언마운트 (`4f3ce14`엔 없던 동작) | `RehabSuggestionCard.tsx:48` | `useState(false)` → `useState(suggestion.clinicianFinalInstruction.trim() !== '')` |
| N-3 | LOW | 코드와 어긋나는 주석 2곳 — D-1 회귀를 낳은 바로 그 전제가 아직 그대로 적혀 있다 | `PainWorkspace.tsx:720-725`, `NextActionCard.tsx:24-34` | 문구 정정 |

세 건 모두 테스트를 깨지 않고, 임상 판단을 포함하지 않으며, 합계 3~5줄이다.
수정 후 재확인은 위 각 항목의 "기계적 재확인 기준" + 7개 스위트 재실행이면 충분하다.

---

## CLINICAL DECISION REQUIRED

**없음.** N-1/N-2/N-3은 전부 구현·문서 레벨이다. D-1..D-7도 마찬가지였다.
감사 E-7/E-9/E-10/E-11/E-12는 이 batch 범위 밖이며 `DECISIONS.md` 2026-09-04
CD-2.7-1..4로 이미 PO 답이 나와 Batch 2.7 범위로 확정됐다.

---

## 조치 불필요 관찰 (이전 검수에서 계속 열려 있는 것 포함)

- **O-1 (승계, 유효).** `isCarePlanEmpty`를 한 곳에서 정의하고 재진이 import한 구조는 여전히
  옳다. 다만 이번에 그 술어의 **전제가 화면마다 다르다**는 것이 드러났다(N-1). 술어 자체를
  쪼갤 필요는 없고, 호출부가 자기 화면의 접힘 내용에 맞게 조건을 더하면 된다 — D-1을
  prop opt-out으로 푼 것과 같은 형태다.
- **O-2 (승계, 유효).** E-2 interactive 테스트의 반례(다른 chip 클릭 → 해제가 아니라 그 값
  설정)는 여전히 이 저장소에서 가장 좋은 chip 테스트다.
- **O-3 (승계, 미해결).** `MicroFollowUpCard.tsx:29`의 렌더 게이트가 여전히
  `candidates.length === 0 && !response`라 내용 없는 카드가 뜰 수 있다. HANDOFF 백로그에
  기록됨(`HANDOFF.md:60`).
- **O-4 (승계, 미해결).** 초진에서 이전 방문 target까지 1클릭 → 2클릭. 정보 손실은 없다.
- **O-5 (승계, 미해결).** `workspace__detailToggle`의 `min-height: 36px` < 권장 44px.
  이번 delta가 그 클래스를 쓰는 자리를 하나도 늘리지 않았다. HANDOFF 백로그에 기록됨.
- **O-6 (승계, 미해결).** 한약 화면의 `nextVisitCheckItem` 이중 배치
  (`HerbalWorkspace.tsx:245-253` × `CarePlanCard.tsx:78`)는 그대로다. 이제 `PainCarePlanCard`에
  있는 것과 **같은 형태의 prop**을 `HerbalCarePlanCard`에도 붙이면 한 줄로 해결된다 —
  Batch 2.7에서 CD-2.7-1을 작업할 때 같이 보면 비용이 거의 없다. HANDOFF 백로그에 기록됨.
- **O-7 (신규).** D-3 수정으로 `NextActionCard`의 언마운트 시점이 "첫 글자 타이핑" →
  "summary 클릭"으로 옮겨졌다. 클릭 자체가 큰 레이아웃 변화를 일으키는 조작이고 그 순간
  커서가 입력칸에 없으므로 F-1이 지적한 오탭 위험은 실질적으로 사라졌다고 본다. 굳이
  없애려면 `NextActionCard`를 `<details>` **아래**로 옮기면 되지만, 되읽기를 폼보다 위에
  두는 현재 배치가 임상적으로 더 낫다고 판단해 결함으로 올리지 않는다.
- **O-8 (신규).** 새 D-3 테스트(`:2323`, `:2362`)는 DOM이 없어 `details.props.onToggle(...)`을
  직접 호출한다. React-DOM이 `toggle`을 실제로 배선하는지는 검증하지 않는다(이번 검수에서
  `react-dom`의 `nonDelegatedEvents`에 `'toggle'`이 있음을 별도로 확인했다). jsdom을 넣을
  가치는 없다고 보지만, 훗날 실제 브라우저 QA를 한 번 돌릴 때 확인 목록에 넣을 항목이다.
- **O-9 (신규).** `open={carePlanDetailsOpen}`은 여전히 비제어 `<details>`에 대한 부분 제어다 —
  원장이 손으로 열어둔 상태에서 Care Plan 5필드를 **전부 비우면** React가 `open` 속성을
  제거해 접힘이 저절로 닫힌다. 이는 `4f3ce14`에도 있던 동작이고 D-3 수정으로 달라지지
  않았으며(그때도 되읽기는 함께 복귀한다), 발생 조건이 매우 좁아 결함으로 올리지 않는다.

---

## Fable 후기 — 게이트 종료 근거 (2026-09-04)

위 closing이 남긴 N-1/N-2/N-3(전부 LOW, 합계 3~5줄)은 `b08a1b8`에서 수정했고,
Opus가 명시한 기계적 재확인 기준을 Fable이 직접 실행해 전부 충족했다:

| 기준 | 실측 |
|---|---|
| N-1 `open` 조건에 `nextVisitCheckItem` 포함 | `RevisitWorkspace.tsx:810` ✅ |
| `isCarePlanEmpty` 로직 불변(5필드, 초진 E-1 승리 유지) | `NextActionCard.tsx:43-51` ✅ |
| N-2 mount latch 복원 | `RehabSuggestionCard.tsx:53` ✅ |
| N-3 `PainWorkspace`의 잘못된 "대체가 아니다" 단정 제거 | grep 결과 0건 ✅ |
| N-3 `isCarePlanEmpty` 주석에 화면 의존성 명시 | `NextActionCard.tsx:26,37-41` ✅ |
| `test:doctor-workspace` | **260** assertions ✅ (257 → 260) |
| `test:emrSummary` | 14, 0 failed ✅ |
| 뮤테이션 2종 | 각각 전용 단언으로 kill(구현자 재현, 메시지 기록) ✅ |

**Batch 2.6 gate CLOSED.**

### 이 라운드가 남긴 것 (다음 세션이 반드시 읽을 것)

1. **정리 작업도 회귀를 만든다.** D-1은 "중복이니 지운다"가 만든 회귀였다. 지우기 전에
   **그 필드를 쓰는 모든 화면에 대체 경로가 있는지** 확인할 것.
2. **회귀를 고쳤으면 회귀를 유발한 설명도 고칠 것.** N-3이 그것이다 — 잘못된 전제가
   주석으로 남아 있으면 다음 사람이 같은 판단을 반복한다.
3. **수정이 새 회귀를 만들 수 있다.** N-2는 D-2 수정이 만든 것이다(mount latch 유실).
   closing 검수를 생략했다면 그대로 나갔다.
