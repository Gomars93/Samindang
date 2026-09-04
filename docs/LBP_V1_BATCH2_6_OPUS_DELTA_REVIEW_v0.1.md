# Opus 독립 검수 — LBP v1 Batch 2.6 (화면 정리 1차) delta review

대상: `/home/user/Samindang`, 브랜치 `claude/clinical-os-lbp-architecture-xym6po`
검수 커밋: `eea4c6b..4f3ce14` (HEAD `44047f2`는 CD-2.7 PO 결정 문서 커밋으로 코드 변경 없음)
근거 문서: `docs/DOCTOR_SCREEN_LOAD_AUDIT_OPUS_v0.1.md` (본인 감사), `DECISIONS.md` 2026-09-04
"원장 화면 실측 감사 (Opus) 및 Batch 2.6 착수 / 2.5d 보류"

## Disposition: **FAIL**

일곱 항목의 **구현 방향과 화면 감소 효과는 실측으로 확인됐고**, 감사가 지목한 최대 결함
(`isCarePlanEmpty`의 `nextVisitCheckItem` 포함으로 인한 강제 자동 펼침 + 이중 textarea)은
정확히 그리고 완전히 해소됐다. FROZEN·금지 파일 zero-diff, 스키마/영속 필드 무변경,
환자 문구 무변경, `LbpAwaitingCapabilitySection` 무변경, 요구된 7개 테스트 스위트 + `tsc -b`
전부 통과, 8개 mutant 전부 kill.

그럼에도 FAIL인 이유는 **D-1 한 건**이다. `PainCarePlanCard`에서 `다음 방문 확인 사항`
필드를 삭제한 것이 초진 화면에서는 옳지만(위에 같은 필드의 textarea가 있다),
**재진 화면에는 그 대체 textarea가 없다.** 그 결과 `carePlan.nextVisitCheckItem`은 재진에서
**"이어받기" 버튼만 쓸 수 있고, 화면 어디에도 보이지 않으며, 원장이 고치거나 지울 수 없는
필드**가 됐다 — 프롬프트가 지목한 "a control that lost its only path / a persisted field
orphaned"에 정확히 해당한다. 아래 최소 수정과 기계적 재확인 기준을 제시한다.

---

## 1. 일곱 항목 판정

| # | 항목 | 판정 |
|---|---|---|
| 1 | Care Plan 자동 펼침 + `nextVisitCheckItem` 이중 배치 | **RESOLVED WITH ISSUE** (초진 완전 해소, 재진에서 필드 고아화 → D-1) |
| 2 | `미판단` chip 제거 | **RESOLVED** |
| 3 | 재진 `PainCarePlanCard` `<details>` | **RESOLVED** (다만 D-1의 원인 지점과 결합) |
| 4 | 운동 `최종 지시문` 토글 | **RESOLVED WITH ISSUE** (mount 시점만 보장 → D-2) |
| 5 | `아직 확인 안 됨` 건수만 | **RESOLVED** |
| 6 | `MicroFollowUpCard` 후보 목록 제거 | **RESOLVED** (관찰 O-3) |
| 7 | `NextActionCard`는 접힘이 닫힌 경우만 | **RESOLVED WITH ISSUE** (계산값 게이트 → D-3) |

### 항목 1 — Care Plan 자동 펼침 + `nextVisitCheckItem` 이중 배치 — RESOLVED WITH ISSUE

구현: `src/doctor/workspace/NextActionCard.tsx:35-43` — `isCarePlanEmpty`가
`plan.nextVisitCheckItem`을 더 이상 세지 않는다(5개 필드만).
`src/doctor/workspace/CarePlanCard.tsx:32-38` — `PainCarePlanCard`의 필드 목록에서
`nextVisitCheckItem` 제거(5칸). `src/doctor/workspace/PainWorkspace.tsx:726-736` — 레인4
textarea는 그대로 `carePlan.nextVisitCheckItem`을 읽고 쓴다(무변경).

**보고를 믿지 않고 직접 렌더해 재측정했다.** `DoctorWorkspace`를 `submissionId` 지정
(라이브 모드)으로 SSR 렌더하고, care plan 6개 필드를 하나씩만 채워 disclosure의 `open`
속성과 `NextActionCard` 렌더 여부를 관측:

| 채운 필드 | `관리 계획` disclosure `open` | `NextActionCard` 렌더 | 값 화면에 보임 |
|---|---|---|---|
| `currentTreatmentGoal` | **true** | false | true |
| `rehabilitationGoal` | true | false | true |
| `homeActionPlan` (← 운동 `치료 계획에 가져오기`) | **true** | false | true |
| `activityPrecaution` | true | false | true |
| `patientInstruction` (← 가설 `안내문에 넣기`) | **true** | false | true |
| `nextVisitCheckItem` (← 레인4 메모) | **false** | true | true |

요구된 4가지 조건이 전부 성립한다: 메모 입력은 더 이상 Care Plan을 열지 않고,
`currentTreatmentGoal`은 여전히 열며, `안내문에 넣기`(`patientInstruction`)와
`치료 계획에 가져오기`(`homeActionPlan`) 경로도 여전히 연다.

**값 손실/고아화 — 초진은 없다.** `nextVisitCheckItem`만 채워진 기존 레코드를 로드하면
값은 (a) 레인4 textarea에 편집 가능한 상태로, (b) `NextActionCard`의 `다음에 확인할 것`
읽기 줄에 그대로 나온다. `carePlan.ts`(스키마), `persistence.ts`, `emrPreview.ts`,
`patientCarePlanPreview.ts` 전부 zero-diff이므로 저장·EMR·환자 전달문 경로도 무변경.
편집 가능한 textarea 수도 렌더로 확인했다 — 값이 담긴 non-readonly `<textarea>`는
정확히 1개(`aria-label="다음 방문 확인 메모"`)뿐이다.

**그러나 재진 화면에서는 고아가 된다 → D-1.** 상세는 C절.

### 항목 2 — `미판단` chip 제거 — RESOLVED

`src/doctor/workspace/LbpWorkingHypothesisCard.tsx:61` —
`LBP_HYPOTHESIS_SUPPORT_OPTIONS.filter((opt) => opt !== 'UNJUDGED')`.
`:62`의 `pressed = activeValue === opt`는 이제 예외 없이 단순하다(이전의
`&& opt !== 'UNJUDGED'` 가드가 불필요해졌고, 그래서 제거된 것이 맞다).

- 렌더 실측: 패턴 카드의 항상 보이는 button이 **20 → 15**(5행 × 3 chip).
- 해제 경로: `:69` `onClick={() => onSelect(activeValue === opt ? 'UNJUDGED' : opt)}` 무변경.
  `tests/lbp-working-hypothesis.spec.mjs:903-949`가 `react-test-renderer` + `act()`로
  **실제 클릭**을 발생시켜 `HIP: 'CONSIDER'` → 같은 chip 재클릭 → `supports.HIP === 'UNJUDGED'`를
  확인하고, 다른 chip(LOWER) 클릭 시에는 해제가 아니라 LOWER가 되는 **반례**까지 붙였다.
  이 저장소에서 본 chip 해제 테스트 중 가장 튼튼한 형태다.
- 저장 기본값: `lbpWorkingHypothesis.ts` zero-diff — `UNJUDGED`는 여전히 기본값이고
  round-trip(`persistence`/`workspace-round3` 179 assertions) 통과. 손상값도 여전히
  `UNJUDGED`로 degrade(`lbpWorkingHypothesis.ts:129`).
- `summarizeLbpWorkingHypothesisKo`가 `UNJUDGED`를 생략하는 §11.3/§11.5 동작 무변경 →
  `test:emrSummary` 통과.

### 항목 3 — 재진 `PainCarePlanCard` `<details>` — RESOLVED

`src/doctor/workspace/RevisitWorkspace.tsx:798-804`:
`<details className="workspace__revisit__optional" open={!isCarePlanEmpty(workspaceState.carePlan)}>`.
`isCarePlanEmpty`를 재구현하지 않고 `./NextActionCard`에서 import(`:82`)했으므로
**교정된 규약이 한 곳에서만 정의된다** — 이 batch에서 가장 잘 된 판단 중 하나다.
CSS 클래스 `.workspace__revisit__optional`은 이미 존재하고(`workspace.css:1469-1494`)
`summary`가 `min-height:44px` + `:focus-visible` outline을 갖고 있어 접근성 후퇴 없음.
3구획 구조(오늘 환자 입력 / 이전 방문 참고 / 오늘 원장 입력)와 이어받기 규칙 무변경(G-10 유지).

### 항목 4 — 운동 `최종 지시문` 토글 — RESOLVED WITH ISSUE

`src/doctor/workspace/RehabSuggestionCard.tsx:37,96-110` — 빈 값이면
`최종 지시문 추가` 버튼(`workspace__detailToggle`, `ExamSuggestionCard`와 동일 클래스·동일 관례),
값이 있으면 input을 그대로 연다. 렌더로 확인: 빈 값 → placeholder
`원장이 직접 다듬은 최종 지시문(선택)` 미출력 + 토글 출력 / 비어 있지 않음 → 값 출력 + 토글 없음.
**"이미 쓴 지시문이 숨겨지지 않는다"는 요구는 mount 시점에서는 충족된다.**

문제는 형제 카드와 구현 방식이 다르다는 것이다. `ExamSuggestionCard.tsx:62-72`는
`const showDetail = detailOpen || hasDetail || status==='NOT_PERFORMED'` 로 **매 렌더 파생**하는
반면, 이 카드는 `useState(초기값)`이라 **mount 이후 외부에서 값이 채워지면 계속 숨긴다.**
실측 재현(react-test-renderer, 같은 인스턴스에 props만 갱신) → D-2.

### 항목 5 — `아직 확인 안 됨` 건수만 — RESOLVED

`src/doctor/workspace/ExamSuggestionList.tsx:29-33` — `— {titles.join(', ')}` 제거,
`role="status"` 유지. 미확인 3건 시나리오를 렌더해 counter `<p>` 안에 세 제목이 하나도
없고 같은 제목들이 아래 카드에는 그대로 있음을 확인(테스트가 sanity로 이 양쪽을 다 건다).

### 항목 6 — `MicroFollowUpCard` 후보 목록 제거 — RESOLVED

`src/doctor/workspace/MicroFollowUpCard.tsx:39-47` — 후보 목록 블록 삭제, 환자 응답
블록(`환자 응답 (오늘)` / `targetRatings` / `전반적 변화` / 새 증상 · 이상반응 alert 줄)은
문자 단위로 무변경.

**중복 주장을 직접 검증했다.** 재진: `RevisitWorkspace.tsx:449-451`의
`microFollowUpCandidates`와 `:576-578`의 recap `targets`는 **같은
`latestPrior.followUpTargets`에서 파생**된다 — 완전한 중복이 맞다.
초진/한약 화면: `PainWorkspace.tsx:367-369`의 후보와 `PriorVisitHistoryCard.tsx:45-49,
76-88`의 target 행이 같은 `painFollowUpTargets`를 같은 형식(label / baselineText /
`이전 치료직후:`)으로 그린다 — 여기도 중복이다(다만 O-3 참고).

### 항목 7 — `NextActionCard`는 접힘이 닫힌 경우만 — RESOLVED WITH ISSUE

`PainWorkspace.tsx:703`에서 `carePlanDetailsOpen`을 한 번 계산해 `:738`의 렌더 게이트와
`:746`의 `open`에 함께 쓴다 — 두 값이 갈라질 수 없다는 점에서 옳은 구조다. 렌더로 확인:
disclosure가 열리는 모든 케이스에서 `workspace__nextAction`이 사라지고, 닫히는
케이스에서만 나타난다(위 표의 3열).

다만 `<details>`는 비제어 요소라 **원장이 손으로 토글한 실제 상태와 이 계산값이 어긋난다** → D-3.

---

## A. 화면 재측정 (A-1 / A-2 재실행)

측정 방법: `eea4c6b`와 `4f3ce14`를 각각 /tmp에 `git archive`로 펼쳐 동일한 esbuild 번들로
`DoctorWorkspace`를 SSR 렌더하고, 출력 HTML을 태그 단위로 훑으며 `<details>` 중첩을 추적해
**`open` 없는 `<details>` 안쪽은 "접힘"으로 분리 계수**했다. 추정이 아니라 렌더 결과 계수다.
탭 요소 = `button` + `summary` + `a[href]` + `select` + radio/checkbox. 자유입력 =
non-readonly `textarea` + non-readonly text/number/date `input`.
시나리오: `PAIN_SCENARIO_1`(단순 기계적 요통), `synthetic: undefined`(실제 환자 경로),
`lbpObjectiveMotorDeficit='NONE'`.

**중요한 범위 차이:** 이 수치는 `DoctorWorkspace` 서브트리만이다. 감사 A-1의 "약 70개"는
`DoctorView`의 좌측 요약·재진 문진 발급·종결 섹션(약 10~11개 + 좌측 1)을 포함한 값이므로,
아래 45/50과 직접 비교하려면 그만큼을 더해야 한다(감사 A-1 행 0·26·27). 배치 내 변화량
(before→after)은 두 범위에서 동일하다 — 그 세 블록은 이 diff가 건드리지 않았다.

### A-1. LBP 초진

**(a) 화면을 막 열었을 때 (모든 입력 빈 상태)**

| 구분 | eea4c6b | 4f3ce14 | Δ |
|---|---|---|---|
| 항상 보이는 자유입력 | 4 | **4** | 0 |
| 항상 보이는 탭 요소 | 50 | **45** | **−5** |
| 접힘 뒤 자유입력 | 12 | 11 | −1 |

빈 화면의 자유입력 4칸은 감사가 적은 그대로다(최종 임상 판단 / 시행·예정 처치 /
즉시 재검 대상 / 다음 방문 확인 메모). 이 batch의 승인 범위에는 이 4칸을 줄이는 항목이
없다(그 4칸은 E-9/E-10, PO 결정 필요 → CD-2.7-1로 별도 배치). 탭 −5는 `미판단` chip 5개.

**(b) 진료 중반 (목표기능 1개 선택 + 운동 후보 2개 ACCEPTED + 메모 한 줄 입력)** — 감사가
"자유입력 11칸(실제로는 최대 16칸)"이라고 쓴 상태:

| 구분 | eea4c6b | 4f3ce14 | Δ |
|---|---|---|---|
| **항상 보이는 자유입력** | **14** | **6** | **−8** |
| 항상 보이는 탭 요소 | 63 | **56** | −7 |
| 접힘 뒤 자유입력 | 6 | 11 | +5 |

−8의 내역(렌더 diff로 확인): 강제로 열려 있던 Care Plan 6칸 → 0 (E-1),
운동 지시문 2칸 → 0 (E-6). 탭 −7의 내역: `미판단` 5 + 강제로 열려 있던
`NextReassessmentPlanCard`의 chip/입력 4 − 새로 생긴 `최종 지시문 추가` 토글 2.

**남은 6칸**: 최종 임상 판단 / 시행·예정 처치 / 즉시 재검 대상 / 다음 방문 확인 메모 /
`오늘 기준값` / `치료 직후 값`.

> **주장 "초진 11 → 5"에 대한 판정:** 문자 그대로는 **미달성**이지만, 실측하면 **14 → 6**으로
> 감소폭은 오히려 크다. 남은 6과 목표 5의 차이는 정확히 `치료 직후 값` 한 칸이고, 그것은
> 감사 E-7 = PO 결정 필요 항목이며 `DECISIONS.md` CD-2.7-3에서 "기본 숨김"으로 이미 승인돼
> **Batch 2.7 범위**다. 즉 2.6이 자기 범위 안에서 할 수 있는 감소는 전부 했다.
> (감사의 "11"은 계수 기준이 조금 달랐다 — 위 14가 실제 렌더 계수다. 감사 본문의
> 괄호 "실제로는 최대 16칸"이 실측에 더 가깝다.)

### A-2. LBP 재진

`RevisitWorkspace`는 자체적으로 `getVisit`/`getSubmission`/`getPatientHistory`를 호출해
전체 SSR이 불가하므로, 항상 보이는 4개 카드를 개별 렌더해 계수하고 나머지는 구조 확인으로
채웠다(이 저장소가 `RevisitWorkspace`에 대해 이미 쓰는 방식과 동일).

| 카드 | eea4c6b (tap / free-text) | 4f3ce14 (tap / free-text) |
|---|---|---|
| `RevisitQuickCheckCard` | 16 / 1 | 16 / 1 |
| `LbpWorkingHypothesisCard` | 20 / 0 | **15** / 0 |
| `PainFinalAssessmentCard` | 0 / 3 | 0 / 3 |
| `PainCarePlanCard` | 0 / **6** | 0 / **5** (→ 빈 상태에선 `<details>` 뒤로 이동) |
| `FollowUpTargetPicker` | 16 / 0 (+선택 시 최대 6칸) | 16 / 0 (동일) |

| 구분 | eea4c6b | 4f3ce14 |
|---|---|---|
| **항상 보이는 chip** | **52** | **47** (−5) |
| **항상 보이는 자유입력 (화면 열자마자)** | **10** | **4** (−6) |
| 항상 보이는 자유입력 (target 3개 선택 시) | 16 | **10** |
| 항상 보이는 자유입력 (`이어받기(치료 계획)` 클릭 후) | 10 | **9** (Care Plan 자동 펼침 = 초진과 동일 규약) |

> **주장 "재진 10~16 → 4~6"에 대한 판정:** 하한 4는 **달성**(정확히 4). 상한 6은 **미달성** —
> target 3개를 실제로 고르면 10칸이다. 차이는 `치료 직후 값` 3칸이며, 위와 같이 CD-2.7-3로
> 이미 PO 승인되어 Batch 2.7에서 사라진다. 그때 상한은 7이 된다(4 + 기준값 3).
> 또한 `이어받기`를 누르거나 Care Plan에 무언가를 쓰면 5칸이 다시 상시 노출된다 —
> 이는 초진과 동일한 "내용이 있으면 자동 펼침" 규약이고 의도된 동작이다.
> "재진 30~60초" 목표에 대해서는, 이 batch로 **chip 52→47, 자유입력 10→4**가 됐지만
> 여전히 chip 47개·읽기 블록 다수가 그 예산 밖에 있다(감사 E-12/E-13은 미착수, PO 결정 대기).

---

## B. Section G 준수 — 12항목 전수 확인

diff가 건드린 소스 파일은 8개뿐이다(`CarePlanCard` / `ExamSuggestionList` /
`LbpWorkingHypothesisCard` / `MicroFollowUpCard` / `NextActionCard` / `PainWorkspace` /
`RehabSuggestionCard` / `RevisitWorkspace`).

| G# | 대상 | 판정 | 근거 |
|---|---|---|---|
| 1 | `CommonSafetyBanner` + 지역 안전 패널 + 좌측 안전 칩 + `!flagsUsable` 경로 | **무손상** | 해당 파일 diff에 없음 |
| 2 | `ObjectiveExamFindingsCard` 라디오 3개(항상 보임) | **무손상** | diff에 없음; A-1 렌더에도 3개 그대로 |
| 3 | `ExamCheckStatus` 6상태 | **무손상** | `ExamSuggestionCard.tsx` diff에 없음 |
| 4 | `시행 못 함` 시 상세·메모 **자동** 펼침 | **무손상** | `ExamSuggestionCard.tsx:72` 그대로. E-6가 "자동 펼침 나쁘다"를 여기까지 확장하지 않았음을 확인 |
| 5 | `확인 추가` disclosure | **무손상** | `PainWorkspace.tsx:167` 그대로 |
| 6 | provenance 배지 / `원장 최종 판단` / `제안이 자동으로 확정 소견이 되지 않음` | **무손상** | `provenance.ts` zero-diff; `RehabSuggestionCard`의 `PROVENANCE_BADGE` import·렌더 유지 |
| 7 | `확정 진단 아님` 제목 + 환자 문장 고정 후단 | **무손상** | `LbpWorkingHypothesisCard.tsx:133` 리터럴 그대로, 환자 문구 5개 리터럴 무변경 |
| 8 | `재진 자동 비교: 자동 판단 없음` 줄 | **무손상** | `FollowUpTargetPicker.tsx` diff에 없음 |
| 9 | 재진 간단체크의 `새 신경증상·위험신호` / `치료 후 이상반응` 2행 | **무손상** | `revisitQuickCheck.ts` zero-diff, `RevisitQuickCheckCard` diff에 없음, 렌더 16 chip 그대로 |
| 10 | 재진 3구획 + 이어받기 "이름에 적힌 항목만" | **무손상** | 새 `<details>`는 `오늘 원장 입력` 섹션 안에서 카드만 감쌈; `revisitCarryForward.ts` zero-diff |
| 11 | `ConflictBanner` + 저장 상태 + `preConflictDraft` | **무손상** (단, D-2가 conflict reload 경로에서 발현) |
| 12 | `원장이 직접 선택합니다. 시스템이 계산하지 않습니다.` 힌트 | **무손상** | `LbpWorkingHypothesisCard.tsx:134` |

**교란된 항목 없음.** 12항목 모두 무손상. (G-11은 파일 자체는 무손상이나, D-2가 바로 그
conflict reload 경로에서 드러나는 결함이므로 아래에서 다룬다.)

---

## C. 새로 생긴 결함

### D-1 (HIGH) — 재진 화면에서 `carePlan.nextVisitCheckItem`이 고아가 됐다

**위치**: `src/doctor/workspace/CarePlanCard.tsx:32-38`(필드 삭제) ×
`src/doctor/workspace/RevisitWorkspace.tsx:798-804`(대체 입력칸 없음)

초진 화면에서 `PainCarePlanCard`의 `다음 방문 확인 사항`을 지운 근거는
"바로 한 레인 위에 같은 필드의 textarea가 이미 있다"였고 그것은 사실이다
(`PainWorkspace.tsx:726-736`). **그러나 `RevisitWorkspace`에는 그 textarea가 없다.**
`nextVisitCheckItem`을 문자열로 grep하면 재진 파일에는 주석 한 줄(`:796`) 외에 아무 것도 없다.

실측:
- `PainCarePlanCard`를 `nextVisitCheckItem:'ORPHAN-VALUE'`로 단독 렌더 →
  `ORPHAN-VALUE` **미출력**, `다음 방문 확인 사항` 라벨 **미출력**, textarea 5개.
- `RevisitWorkspace`에는 `NextActionCard`도 없다(import는 `isCarePlanEmpty`만).
  → 재진 화면 어디에서도 이 값이 **읽히지도 쓰이지도 않는다.**

그런데 이 필드는 재진에서 **쓰인다**:
- `revisitCarryForward.ts:164-169` — `이어받기(치료 계획)` 버튼이
  `painPlan.nextVisitCheckItem` + `herbal.symptomsToTrack` + `herbalPlan.symptomsToObserve`
  + `herbalPlan.nextVisitCheckItem`을 join해서 오늘의 `carePlan.nextVisitCheckItem`에 쓴다.
- `revisitCarryForward.ts:112`(`isTreatmentPlanBlank`)와 `:212`(`treatmentPlanHasText`)가
  이 필드를 센다.

따라서 재현 가능한 3가지 잘못된 동작:
1. **원장이 볼 수도 고칠 수도 없는 값이 오늘 기록에 들어간다.** `이어받기` 한 번으로
   이전 방문의 문장(한약 관찰 항목까지 join된 것)이 오늘 레코드에 저장되는데 화면에는
   전혀 나타나지 않는다.
2. **"눌렀는데 아무 일도 안 일어나고 다시 못 누르는" 버튼.** 직전 방문의 치료계획 텍스트가
   `nextVisitCheckItem` 하나뿐이면 `treatmentPlanHasText`가 true → 버튼 활성 → 클릭 →
   `isCarePlanEmpty`는 여전히 true라 `<details>`도 안 열리고 화면 변화 0 →
   `isTreatmentPlanBlank`가 false가 되어 **버튼이 비활성**된다.
3. **조용한 전파.** 이 값은 `VisitWorkspaceState`로 영속되고
   `carryForwardSourceFromVisitWorkspace`(`:196` `carePlan: {...prior.carePlan}`)로 다음
   방문에 그대로 넘어가며, 그 방문이 문진 기반이면 `emrPreview.ts:158,197`의
   `다음 방문 확인` 줄과 `patientCarePlanPreview.ts:35,50`의 환자 전달문에 출력된다.
   즉 **원장이 한 번도 본 적 없는 문장이 EMR/환자 전달문에 실릴 수 있다.**

배치 이전에는 재진의 `PainCarePlanCard`가 항상 펼쳐진 채 이 필드를 6번째 칸으로 그렸으므로
이 경로가 전부 정상이었다. **이 batch가 만든 회귀다.**

**최소 수정 (둘 중 하나, 첫 번째 권장)**
- (a) `PainCarePlanCard`에 opt-out prop을 준다:
  `PainCarePlanCard({ value, onChange, showNextVisitCheckItem = true })` 로 두고 필드를
  목록에 되돌린 뒤, **초진 호출부에서만** `showNextVisitCheckItem={false}`를 넘긴다
  (`PainWorkspace.tsx:747`). 재진(`RevisitWorkspace.tsx:800`)은 기본값으로 6칸을 유지한다.
  화면 감소 효과(초진 −1, 자동 펼침 차단)는 그대로 유지되고 재진의 고아화만 사라진다.
- (b) 재진 lane에 `PainWorkspace.tsx:726-736`과 동일한 `다음 방문 확인 메모` textarea를
  추가한다. 화면 1칸이 늘지만 초진/재진 배치가 완전히 같아진다.

**기계적 재확인 기준**
1. `PainCarePlanCard`(또는 재진 조립)를 `nextVisitCheckItem:'ORPHAN-VALUE'`로 렌더 →
   값이 **정확히 1개의 non-readonly `<textarea>`** 안에 나타난다.
2. 초진(`DoctorWorkspace` + `submissionId`) 렌더에서는 여전히 정확히 1개이고 그
   textarea의 `aria-label`이 `다음 방문 확인 메모`다(기존 C-1 테스트가 그대로 통과).
3. 소스 스캔 가드 1줄: `RevisitWorkspace.tsx`가 `carePlan.nextVisitCheckItem`을
   `onChange`/`value`에 바인딩하는 지점을 최소 1개 갖는다(직접이든 `PainCarePlanCard`
   경유든). — 이 가드가 없어서 이번 회귀를 아무도 잡지 못했다.

### D-2 (MEDIUM) — 운동 카드: mount 이후 채워진 `최종 지시문`이 영구히 숨는다

**위치**: `src/doctor/workspace/RehabSuggestionCard.tsx:37`
`const [instructionOpen, setInstructionOpen] = useState(suggestion.clinicianFinalInstruction.trim() !== '')`

`useState`의 초기값은 **mount 시 한 번만** 평가된다. 같은 카드 인스턴스(같은 `key={s.id}`,
`PainWorkspace.tsx:600`)에 나중에 비어 있지 않은 지시문이 들어오면 카드는 계속
`최종 지시문 추가` 버튼만 보여준다.

재현(react-test-renderer, 같은 인스턴스에 props만 갱신):
```
mount empty                     -> input: 0  toggle: 1
after external non-empty update -> input: 0  toggle: 1
instruction text present in tree ? false
```

실제로 이 경로를 타는 곳(둘 다 `recordKey` 불변이므로 인스턴스가 유지된다):
- `DoctorWorkspace.tsx:395` `handleReloadFromConflict` — ConflictBanner의 유일한 복구
  동작이 서버 버전을 통째로 로드한다. 서버 쪽에 지시문이 있으면 **그것이 안 보인다.**
  (Section G-11이 지키라고 한 바로 그 장치의 경로다.)
- `DoctorWorkspace.tsx:329-339` — 같은 레코드에 대해 `initialRecordUpdatedAt`이 앞서면
  서버 콘텐츠로 재시드한다.

형제 카드 `ExamSuggestionCard.tsx:62-72`는 같은 문제를 파생값으로 이미 피하고 있다.
"`ExamSuggestionCard`의 관례를 따랐다"는 주석(`RehabSuggestionCard.tsx:30-36`)은 UI 형태만
따랐고 **가장 중요한 부분(파생 vs 상태)을 따르지 않았다.**

**최소 수정**
```ts
const [instructionOpen, setInstructionOpen] = useState(false)
const showInstruction = instructionOpen || suggestion.clinicianFinalInstruction.trim() !== ''
```
그리고 `:96`의 `instructionOpen ?` 를 `showInstruction ?` 로 바꾼다. (`ExamSuggestionCard`와
문자 그대로 같은 형태가 된다.)

**기계적 재확인 기준**: 같은 인스턴스를 빈 값으로 mount한 뒤
`clinicianFinalInstruction`만 비어 있지 않게 `update()` → `workspace__noteInput` input이
1개 존재하고 그 값이 렌더 트리에 나타난다(현재는 0개).

### D-3 (LOW-MEDIUM) — `NextActionCard` 게이트가 실제 disclosure 상태가 아니라 계산값을 본다

**위치**: `src/doctor/workspace/PainWorkspace.tsx:703, 738, 746`

`<details>`는 비제어 요소다. `carePlanDetailsOpen`은 "내용이 있는가"이지 "지금 열려 있는가"가
아니다. 두 가지 어긋남이 생긴다:

- **(a) 손으로 접으면 읽기 되읽기까지 사라진다.** 내용이 있어서 자동으로 열린 disclosure를
  원장이 손으로 접으면 `carePlanDetailsOpen`은 여전히 true → `NextActionCard`는 렌더되지
  않는다. 결과적으로 `집에서 할 일`과 `다음 재평가`가 **화면 어디에도 없다.**
  (감사 C-2가 "닫혀 있을 때는 되읽기가 유일한 노출"이라고 쓴 그 상태다.)
- **(b) 첫 글자를 치는 순간 위 블록이 사라져 화면이 밀려 올라간다.** 빈 상태에서
  원장이 disclosure를 손으로 열고 `현재 치료 목표`에 한 글자를 넣으면
  `carePlanDetailsOpen`이 false→true가 되어 **입력칸 위에 있던 `다음 액션` 카드(제목 + 1줄)가
  언마운트**되고 그 아래 전부가 위로 밀린다. 감사 F-1이 "진료 중 chip 위치가 이동하는 것은
  편의가 아니라 안전 문제"라고 쓴 것과 같은 부류의 이동이다(폭은 더 작다).

**최소 수정**: disclosure의 실제 상태를 하나만 들고 양쪽에서 쓴다 —
`const [planOpen, setPlanOpen] = useState(carePlanDetailsOpen)` 대신
`<details ... onToggle={(e) => setPlanOpen(e.currentTarget.open)}>`로 실제 열림을 추적하고,
`NextActionCard`는 `{!planOpen && ...}`로 게이트한다. (또는 (b)만 막으려면
`NextActionCard`를 `<details>` **아래**로 옮긴다 — 커서 위쪽에서 블록이 사라지지 않는다.)

**기계적 재확인 기준**: `onToggle`로 닫은 뒤에도 `workspace__nextAction`이 렌더되고,
연 상태에서는 렌더되지 않는다(현재는 `open` 계산값에만 반응).

### D-4 (LOW) — E-3 "mutant reproduction" 테스트가 자기참조적이라 아무것도 검증하지 않는다

**위치**: `tests/doctor-workspace.spec.mjs:3067-3072`

```js
const mutantSrc = `      <PainCarePlanCard\n ... />\n`
const detailsIdx = mutantSrc.lastIndexOf('<details', cardIdx)
assert.ok(detailsIdx === -1, 'reproduced: ...')
```
테스트가 **자기 몸통 안에서 만든 문자열**에 대해 단언한다. 제품 코드를 한 줄도 실행하지
않으며, `RevisitWorkspace.tsx`를 어떻게 되돌려도 영원히 통과한다. 이름이
"mutant reproduction"이라 실제로 mutant를 잡는 것처럼 읽히는 점이 더 나쁘다.

(참고: 바로 위의 진짜 E-3 구조 검사 `:3045-3065`는 유효하고, 내가 실제 mutant로
kill 되는 것을 확인했다. 아래 D절 참조. **삭제해야 하는 것은 자기참조 테스트 하나뿐이다.**)

**최소 수정**: 이 `test(...)` 블록을 삭제한다(위 구조 검사가 이미 그 역할을 한다).
**재확인 기준**: `RevisitWorkspace.tsx`를 `eea4c6b` 버전으로 되돌렸을 때 실패하는
단언의 개수가 줄지 않는다.

### D-5 (LOW) — `미판단` chip 제거 후 남은 잘못된 주석/문서 3곳

이제 코드와 정면으로 어긋나는 서술:
- `src/doctor/workspace/LbpWorkingHypothesisCard.tsx:6-10` — "every pattern's 'nothing chosen'
  member (`UNJUDGED`) **is itself a rendered 4th chip here** (§11.4's '5행 × 4 chip')".
  파일 헤더가 자기 파일 61행과 모순된다.
- `src/doctor/workspace/lbpWorkingHypothesis.ts:64` — "`LbpWorkingHypothesisCard.tsx`
  renders these 4 as one chip group per pattern".
- `docs/LBP_PRODUCTION_V1_MINIMAL_ARCHITECTURE_v0.1.md:426` — "`5행 × 4 chip`".

`DECISIONS.md` 2026-09-04이 "미판단 chip 제거"를 명시적으로 승인했으므로 **결정 자체는
기록돼 있다.** 남은 것은 문서 동기화뿐이다. 다만 아키텍처 문서는 이 저장소에서 브리프
역할을 하므로, 다음 세션이 "§11.4대로 4 chip이어야 하는데 3개다"라고 오판할 여지가 있다.

**최소 수정**: 세 곳을 "5행 × 3 chip (UNJUDGED는 렌더하지 않음, Batch 2.6 E-2,
`RevisitQuickCheckCard`의 `NOT_ASSESSED` 관례와 동일)"로 고친다.

### D-6 (LOW) — 테스트의 disclosure 위치 탐색 문자열이 다른 요소와 충돌한다

**위치**: `tests/doctor-workspace.spec.mjs:2059, 2071, 2096, 2119, 2160, 2176`
(`html.indexOf('관리 계획 · 다음 재평가')`)

`NextActionCard.tsx:118`의 빈 상태 문구가 `다음 액션 미설정 — 아래 「관리 계획 · 다음 재평가」에서 입력`
이라 **같은 부분문자열을 포함한다.** `NextActionCard`가 빈 상태로 렌더되는 화면에서는
`indexOf`가 `<summary>`가 아니라 이 `<p>`를 찾고, `lastIndexOf('<details', idx)`가 전혀 다른
(앞쪽의) disclosure를 집는다.

실제로 이 때문에 D절의 E-16 mutant가 **엉뚱한 메시지로** 실패했다(아래 참조):
`a non-empty currentTreatmentGoal alone still opens the disclosure` — 실제 원인은 그것이
아니라 탐색 위치가 밀린 것이다. 지금은 우연히(E-16 게이트가 두 상황을 배타적으로 만들어서)
현행 테스트가 전부 통과하지만, 탐색이 옳은 노드를 잡는다는 보장은 없다.

**최소 수정**: 탐색 문자열을 `summary` 전체 라벨 `관리 계획 · 다음 재평가 — 자세히 입력`으로
바꾼다(빈 상태 문구에는 `— 자세히 입력`이 없다).
**재확인 기준**: `NextActionCard`가 빈 상태로 렌더되는 케이스를 하나 추가해도
`tag`가 `workspace__optional` disclosure를 가리킨다.

### D-7 (PROCESS) — `HANDOFF.md`가 실제 Git 상태와 어긋난 채 방치됐다

`HANDOFF.md:3-7`은 여전히 **"최신 12: Batch 2.5c 게이트 CLOSED, HEAD `9f07541`"**이다.
그 이후 `32cee67`(2.5d 브리프), `eea4c6b`(화면 감사), `4f3ce14`(**이 batch**),
`44047f2`(CD-2.7 PO 결정 4건)가 들어왔고 `git log eea4c6b..HEAD -- HANDOFF.md`는 **비어 있다.**

`CLAUDE.md`는 (1) Review Protocol 5번과 Definition of Done에서 HANDOFF 갱신을 필수로 두고,
(2) "HANDOFF의 기록과 실제 Git/GitHub 상태가 어긋나면 Git이 항상 맞다 — **발견 즉시**
`HANDOFF.md`를 실제 상태에 맞게 고친다. 오래된 HANDOFF를 방치한 채 다음 작업을 진행하지
않는다"고 명시한다. 지금 상태로는 다음 세션이 Startup Protocol 2번에서 **2.5c가 최신이라고
읽는다** — 방금 화면이 바뀐 것을 모른 채 시작한다.

**최소 수정**: `HANDOFF.md` 최상단에 "최신 13: 화면 감사 + Batch 2.6" 항목을 추가하고
HEAD/테스트 수치(`test:doctor-workspace` 252, `test:lbp-working-hypothesis` 218,
`test:workspace-round3` 179)와 PO 대기 4건 → CD-2.7-1..4로 답이 나온 사실을 기록한다.

---

## D. 테스트 비공허성 — 7항목 mutant 전수 재현

방법: `4f3ce14`를 /tmp에 펼치고 파일 하나씩을 `git show eea4c6b:<path>`로 되돌려
(= 정확한 revert) 해당 스위트를 돌렸다. 관측된 첫 실패 메시지 그대로:

| mutant | 되돌린 파일 | 스위트 | 관측된 실패 |
|---|---|---|---|
| **E-1** `isCarePlanEmpty`가 `nextVisitCheckItem`을 다시 셈 | `NextActionCard.tsx` | doctor-workspace | `AssertionError: a non-empty nextVisitCheckItem alone must not force the disclosure open` (actual false / expected true) |
| **C-1** `PainCarePlanCard`가 `다음 방문 확인 사항`을 다시 그림 | `CarePlanCard.tsx` | doctor-workspace | `AssertionError: the Care Plan card no longer has its own "다음 방문 확인 사항" label at all` |
| **E-2** `미판단` chip 복원 | `LbpWorkingHypothesisCard.tsx` | lbp-working-hypothesis | `FAIL: LbpWorkingHypothesisCard: chip "미판단" (UNJUDGED) does NOT render as a button in any of the 5 pattern groups` |
| **E-3** 재진 Care Plan 상시 노출로 복원 | `RevisitWorkspace.tsx` | doctor-workspace | `AssertionError: a <details> precedes the card` |
| **E-6** 운동 지시문 상시 노출로 복원 | `RehabSuggestionCard.tsx` | doctor-workspace | `AssertionError: the collapsed toggle button renders` |
| **E-8** counter가 제목을 다시 나열 | `ExamSuggestionList.tsx` | doctor-workspace | `AssertionError: "ROUND26 목표 동작 A" does not appear on the counter line itself` |
| **E-14** 후보 목록 복원 | `MicroFollowUpCard.tsx` | doctor-workspace | `AssertionError: the candidate-list label is gone` |
| **E-16** `NextActionCard` 무조건 렌더 | `PainWorkspace.tsx` | doctor-workspace | `AssertionError: a non-empty currentTreatmentGoal alone still opens the disclosure` ⚠️ |

**8/8 kill.** 공허한 가드는 없다 — 일곱 항목 모두 실제로 지켜진다.

두 가지 단서:
- ⚠️ **E-16의 kill은 "우연한" kill이다.** 실패한 단언은 E-16 전용 단언
  (`NextActionCard does NOT render while the disclosure is open`)이 아니라, 파일에서 더 앞에
  있는 E-1 differential 단언이다. 원인은 D-6(탐색 문자열 충돌)이고, mutant를 되돌리면
  `NextActionCard`가 빈 상태 문구를 렌더해 `indexOf`가 밀린다. **E-16 전용 단언 자체는
  도달조차 하지 못했다.** D-6을 고치면 이 mutant는 올바른 메시지로 죽는다.
- **삭제·약화된 단언 전수 확인** (`-` 라인 전부 읽음): 삭제된 것은
  `counterChunk.includes('목표 동작 재현')`(= "counter가 새 미확인 항목의 이름을 적는다") 하나뿐이고,
  이는 동작이 의도적으로 바뀌었으므로 정당하며 **그 자리에 더 강한 단언 3개**
  (`>1<` 카운트 숫자 / `건` 단위 / 제목이 **없음**)가 들어왔다. `SLR 검사` 미출현 단언은
  메시지만 바뀌고 유지. `LBP_HYPOTHESIS_SUPPORT_OPTIONS` 루프의 `count === 5`는
  UNJUDGED에 한해 `count === 0`으로 바뀌었을 뿐 나머지 3값은 그대로 5를 요구한다.
  **삭제된 테스트 파일·삭제된 `test()` 블록 0건.** 단언 총수는 오히려 증가
  (doctor-workspace 240→**252**, lbp-working-hypothesis 214→**218**).
- **자기참조 단언 1건**: D-4 참조 (`tests/doctor-workspace.spec.mjs:3067-3072`).
- **취약하지만 공허하지는 않은 단언 1건**: E-3 본 검사(`:3045-3065`)는 소스 문자열 완전일치
  (`'<details className="workspace__revisit__optional" open={!isCarePlanEmpty(workspaceState.carePlan)}>'`)라
  포맷팅만 바뀌어도 깨진다. 다만 `RevisitWorkspace`에 대한 소스 스캔은 이 저장소의 기존
  관례이고(`lbp-working-hypothesis.spec.mjs:367,440,739`), "사이에 다른 `<details`가 없다"는
  비공허성 보강까지 붙어 있어 **수용 가능**하다. 개선 여지로만 기록한다.
- **D-1을 잡을 가드는 존재하지 않는다.** 일곱 항목에 대한 가드는 일곱 개가 다 있지만,
  "`nextVisitCheckItem`이 어느 화면에서든 편집 가능한 채로 남는다"는 불변식은 아무도 검사하지
  않는다. D-1의 재확인 기준 3번이 그 자리다.

---

## E. 불변식

| 불변식 | 결과 |
|---|---|
| FROZEN zero-diff — `git diff --stat origin/main -- src/spec index.html src/App.tsx server "tablet core"` | **빈 출력 ✅** |
| `patientCarePlanPreview.ts` / `provenance.ts` / `lbpExerciseEligibility.ts` / `revisitQuickCheck.ts` zero-diff (`eea4c6b..4f3ce14`) | **빈 출력 ✅** |
| 스키마 / 영속 필드 변경 없음 | ✅ `carePlan.ts`·`persistence.ts`·`emrPreview.ts` diff 없음. `PainCarePlan`은 여전히 6필드이고 `nextVisitCheckItem`은 타입·기본값·직렬화 모두 무변경 (**렌더에서만 빠졌다** — 그게 D-1의 원인이다) |
| 환자 문구 변경 없음 | ✅ 신규 문자열은 `최종 지시문 추가`, `치료 계획 (Care Plan) — 필요할 때 펼치기` 두 개뿐이고 둘 다 원장 화면 전용. `patientCarePlanPreview.ts` zero-diff |
| `LbpAwaitingCapabilitySection` 무변경 (PO 결정 대기) | ✅ diff에 등장하지 않음 |
| `package.json` 변경이 무해한가 | ✅ `test:doctor-workspace`에 `MicroFollowUpCard.tsx` esbuild 번들 스텝 1개 추가뿐. 산출물 `tests/.micro-follow-up-card-bundle.cjs`는 `.gitignore`에 등재됐고(`git ls-files` 빈 출력 = 미추적), 다른 스크립트·의존성·버전 변경 없음 |
| 워킹트리 | ✅ 검수 전후 `git status --porcelain` 빈 출력. mutant는 전부 /tmp 사본에서만 만들었고 삭제했다 |

**실행 결과 (전부 통과)**

```
npx tsc -b                          EXIT 0
npm run test:doctor-workspace       252 assertions   EXIT 0
npm run test:workspace-round3       179 assertions   EXIT 0
npm run test:doctor-reset-key        11 assertions   EXIT 0
npm run test:lbp-working-hypothesis 218 assertions   EXIT 0
npm run test:lbp-exercise-recommendation  23 tests   EXIT 0
npm run test:emrSummary              14 assertions   EXIT 0
```

---

## 결함 요약 (수정 우선순위)

| # | 심각도 | 요약 | 파일:행 |
|---|---|---|---|
| D-1 | **HIGH** | 재진에서 `nextVisitCheckItem`이 보이지도 고쳐지지도 않는데 이어받기가 그 필드에 쓴다. 조용히 EMR/환자 전달문까지 전파 가능 | `CarePlanCard.tsx:32-38` × `RevisitWorkspace.tsx:798-804` |
| D-2 | MEDIUM | mount 이후 채워진 운동 `최종 지시문`이 영구히 숨는다 (conflict reload / 같은 레코드 재시드) | `RehabSuggestionCard.tsx:37,96` |
| D-3 | LOW-MED | `NextActionCard` 게이트가 실제 `<details>` 상태가 아니라 계산값 — 손으로 접으면 되읽기까지 사라지고, 첫 글자 입력 시 위 블록이 언마운트되어 화면이 밀린다 | `PainWorkspace.tsx:703,738,746` |
| D-4 | LOW | 자기참조적 "mutant reproduction" 테스트 — 아무것도 검증하지 않는다 | `tests/doctor-workspace.spec.mjs:3067-3072` |
| D-5 | LOW | `5행 × 4 chip` / "UNJUDGED는 4번째 chip" 주석·문서 3곳이 코드와 모순 | `LbpWorkingHypothesisCard.tsx:6-10`, `lbpWorkingHypothesis.ts:64`, `docs/LBP_PRODUCTION_V1_MINIMAL_ARCHITECTURE_v0.1.md:426` |
| D-6 | LOW | 테스트 disclosure 탐색 문자열이 `NextActionCard` 빈 상태 문구와 충돌 (E-16 mutant가 엉뚱한 메시지로 죽은 원인) | `tests/doctor-workspace.spec.mjs:2059,2071,2096,2119,2160,2176` |
| D-7 | PROCESS | `HANDOFF.md`가 2.5c 시점에 멈춰 있다 — CLAUDE.md의 DoD 및 "발견 즉시 고친다" 규칙 위반 | `HANDOFF.md:3-7` |

**CLINICAL DECISION REQUIRED**: 없음. D-1은 임상 판단이 아니라 회귀 수정이고, 나머지도
전부 구현·문서 레벨이다. (감사 E-7/E-9/E-10/E-11/E-12는 이 batch 범위 밖이며
`DECISIONS.md` CD-2.7-1..4로 이미 답이 나왔다.)

---

## 조치 불필요 관찰

- **O-1. `isCarePlanEmpty`를 한 곳에서만 정의하고 재진이 import한 것은 옳은 선택이다.**
  자동 펼침 규약이 두 화면에서 갈라질 수 없게 만들었고, 실제로 이 batch가 규약을 고칠 때
  재진이 자동으로 따라왔다. 테스트도 그 import를 명시적으로 pin한다(`:3063`).
- **O-2. E-2의 interactive 테스트에 붙은 반례(다른 chip 클릭 → 해제가 아니라 그 값 설정)는
  이 저장소에서 본 가장 좋은 형태의 chip 테스트다.** "해제가 된다"만 확인하면 모든 클릭이
  해제되는 mutant를 못 잡는데, 그 구멍을 막았다.
- **O-3. E-14 이후 `MicroFollowUpCard`의 렌더 게이트가 내용 없는 카드를 만든다.**
  `MicroFollowUpCard.tsx:29`는 여전히 `candidates.length === 0 && !response` 로 게이트하는데,
  `candidates`는 이제 아무것도 렌더하지 않는다. 결과적으로 "이전 방문 target은 있는데 환자
  응답이 아직 없음" 상태에서 카드가 `<summary>` 1개 + `이번 방문에 대한 간단 재확인 응답이
  아직 없습니다.` 한 줄만 들고 뜬다. 이것을 "미응답 사실 자체가 정보"로 볼지
  "빈 카드 = 소음"으로 볼지는 원장 취향의 문제라 결함으로 올리지 않았다. 다만 현재 테스트
  (`:3170-3172`)가 이 동작을 명시적으로 고정하고 있으니, 없애기로 한다면 그 단언도 함께 바꿔야 한다.
- **O-4. 초진 화면에서 이전 방문 target까지의 거리가 1클릭 → 2클릭이 됐다.**
  E-14의 근거(중복)는 초진에서도 참이지만(`PriorVisitHistoryCard`가 동일 필드를 동일 형식으로
  그린다), 그 대체 위치는 `참고 자료` disclosure **안의** `이전 방문 기록` disclosure다.
  재진에서는 recap이 항상 보이므로 비용이 0인데 초진에서는 +1클릭이다. 정보 손실은 없다.
- **O-5. `workspace__detailToggle`의 `min-height: 36px`** (`workspace.css:1595`)는 태블릿 터치
  타깃 권장치(44px)보다 작다. 다만 `ExamSuggestionCard`가 이미 쓰던 기존 클래스이므로
  이 batch가 만든 문제가 아니다 — 터치 타깃 일괄 점검 시 함께 볼 항목으로만 기록한다.
- **O-6. 한약 화면의 `nextVisitCheckItem` 이중 배치는 그대로 남아 있다.**
  `HerbalWorkspace.tsx:245-253`의 textarea와 `CarePlanCard.tsx:54`의
  `HerbalCarePlanCard` 필드가 같은 `herbalCarePlan.nextVisitCheckItem`을 가리킨다.
  `isCarePlanEmpty`는 Pain 전용이라 강제 자동 펼침 결함은 없고, 감사 C-1도 Pain만 다뤘으므로
  범위 밖이 맞다. 다만 D-1을 (a)안으로 고칠 때 같은 prop을 한약 쪽에도 쓸 수 있다.
