# Opus 독립 리뷰 — LBP v1 Batch 2.5b (`ExamCheckStatus` 4상태 → 6상태)

- 대상: `claude/clinical-os-lbp-architecture-xym6po`, HEAD `2a078bc`, delta `e1bac49..2a078bc`
- 설계 근거: `docs/LBP_V1_BATCH2_5B_FABLE_IMPACT_SCOPE_v0.1.md`, `DECISIONS.md` 2026-09-03 항목
- working tree clean, repo 파일 무수정. 뮤테이션은 전부 `/tmp` scratch 사본에서 수행 후 삭제.

## Disposition: **PASS** (조건: 아래 defect 1·2 후속 처리, 어느 것도 임상 안전 결함은 아님)

구현은 설계가 요구한 것을 실제로 했다. 신규 2값은 어디서도 음성/정상/eligible로
읽히지 않고, 어떤 추론의 근거도 되지 않으며, "기록된 사실"과 "아직 확인 안 됨"의
경계가 6상태에서 정확히 유지된다. 재현한 뮤테이션 9종은 전부 검출됐다.
다만 **설계가 명시적으로 요구한 커버리지 1건이 실제로는 빠져 있고**(§4 T-1의 "두 카드"
중 재검 카드), **배포 메모의 열화 서술이 사실과 다르다**(실제 열화가 문서보다 나쁘다).

### 명령 실행 결과 (전부 PASS)

| 명령 | 결과 |
|---|---|
| `npx tsc -b` | exit 0 |
| `npm run test:workspace-round3` | 176 assertions PASS |
| `npm run test:doctor-workspace` | 238 assertions PASS |
| `npm run test:lbp-exercise-recommendation` | 23 tests PASS |
| `npm run test:lbp-exercise-eligibility` | 22 tests PASS |
| `npm run test:doctor` | 947 assertions PASS, 0 failed |
| `npm run test:emrSummary` | 14 assertions PASS, 0 failed |

---

## A. 두 신규 값의 임상 의미

**Verdict: PASS (의미 구분은 실재하고 코드가 그것을 지킨다). 라벨 자구는 1건 잔여 위험.**

- 타입 정의 `src/doctor/workspace/provenance.ts:118-124` — 6값, 기존 4값 문자열
  무변경(additive). 라벨 `:126-137`, glyph `:149-158`.
- 의미 진술은 `provenance.ts:100-116`의 doc comment에 명문화되어 있다:
  `LIMITED` = **시행은 했으나 끝까지 못 가서 판단을 유보**(예: 통증으로 SLR 각도 미달),
  `UNCLEAR` = **시행은 완료했는데 해석이 갈림**. `NOT_PERFORMED` = **시행하지 않기로
  판단한 사실 그 자체**, `NOT_YET_CHECKED` = **아무 판단도 없는 기본값**.
  임상적으로 이 두 축(시행 완결성 / 판단 존재 여부)은 서로 독립이고, 4상태로는
  실제로 표현이 불가능했다 — 구분은 진짜다.
- 라벨: `LIMITED: '제한적 시행(판단 유보)'`(`provenance.ts:135`),
  `NOT_PERFORMED: '시행 못 함'`(`:136`). glyph `△`/`⊘`(`:155-156`), 6개 상호 배타 —
  `test:workspace-round3` T-9가 집합 크기 6을 강제.

**음성/정상/eligible로 읽히는 경로 — 전 저장소 재검증 결과 0건.** 라벨 문자열
`'음성/정상'`은 `EXAM_CHECK_STATUS_LABEL.NEGATIVE` 단 하나에만 붙어 있고
(`provenance.ts:129`), 모든 소비처는 `EXAM_CHECK_STATUS_LABEL[status]` 룩업이라
신규 값이 그 문자열에 도달할 구조적 경로가 없다. 실제로 EMR 텍스트에
`음성/정상` 부재를 확인하는 assertion이 `tests/doctor-workspace.spec.mjs:610`에 있고,
내가 심은 뮤테이션 M4(`emrPreview`에서 LIMITED를 NEGATIVE로 치환)와
M9(`LIMITED` 라벨을 `'음성/정상'`으로 교체)가 둘 다 검출됐다.

**잔여 위험(비차단, 아래 관찰 O-1):** `LbpDirectionalResponse.NOT_ASSESSED`의 라벨은
여전히 `'미시행'`(`lbpExamSuggestions.ts:219`)이고 뜻은 **미평가**다. 신규 라벨은
`'시행 못 함'`으로 *문자열*은 피했지만, 같은 원장 화면(PainWorkspace)에서
`미시행`과 `시행 못 함`은 한국어로 사실상 동의어로 읽힌다 — 그런데 하나는
pending 기본값, 다른 하나는 기록된 판단이다. CD-2.5b-1에서 PO가 그 tradeoff를
알고 A안을 택했으므로 재론하지 않지만, 파일럿 입력 분포에서 확인할 항목이다.

---

## B. "정상으로 취급 안 됨 / 판단 근거 안 됨"

**Verdict: PASS — 결과값을 읽는 소비처를 직접 전수 grep으로 재확인했고 else-branch 누출 0건.**

`src/`+`server/`에서 exam 상태 리터럴 비교·필터·truthiness를 전수 조사한 결과,
`ExamCheckStatus` 값을 읽는 지점은 정확히 아래가 전부다 (설계 §2 census와 일치):

| 지점 | 비교 형태 | 6상태에서의 동작 |
|---|---|---|
| `lbpExerciseRecommendation.ts:305` | `=== 'POSITIVE'` | 신규 2값 → `false`. **유일한 추론 지점**, 배타적이라 무변경 |
| `emrPreview.ts:60`, `:75` | `isValidExamStatus && !== 'NOT_YET_CHECKED'` | 신규 2값 통과 → 라벨 그대로 기록 |
| `RevisitWorkspace.tsx:133`, `:180` | 동일 | 동일 |
| `examSuggestion.ts:67` (`isExamPending`) → `:79` `stillPending` | `=== 'NOT_YET_CHECKED'` | 신규 2값 → not pending |
| `reassessmentExam.ts:50` (`isReassessmentPending`) | 동일 | 동일 |
| `ExamSuggestionCard.tsx:42` / `StructuredReassessmentCard.tsx:33` (`pending`) | 동일 | 동일 |
| `ExamSuggestionCard.tsx:135` / `StructuredReassessmentCard.tsx:70` (`recordedAt`) | 동일 | 신규 2값은 timestamp를 받는다 (판단 시각은 실재하는 사실) |
| `StructuredReassessmentCard.tsx:120` (`pendingCount`) | 동일 | 신규 2값 카운터에서 제외 |
| `ExamSuggestionCard.tsx:73` (`showDetail`) | `=== 'NOT_PERFORMED'` | CD-2.5b-2 자동 펼침 |
| `provenance.ts:190` (`isExamChecked`) | `!== 'NOT_YET_CHECKED'` | 신규 2값 true. **src 호출처 0**(dead export) |

`switch`문·truthiness 분기는 exam 상태에 대해 0건. `server/`에는 이 enum 참조가
0건이며(설계 §5-2 주장 확인됨) workspace blob은 서버에 불투명하다.
`src/doctor/*.tsx`의 지역별 패널(`ObjectiveExamFindingsCard.tsx`)이 쓰는 `status`는
`SaveStatus`(`idle|saving|saved|error|conflict`)로 무관, `emrSummary.ts`는 exam 상태를
읽지 않는다.

**"6번째 값이 조용히 '정상' else-branch로 떨어지는 곳"은 없다.** 구조적 이유가
명확하다 — 모든 필터가 `!== 'NOT_YET_CHECKED'`(포함형)이고 유일한 추론 비교가
`=== 'POSITIVE'`(배타형)이기 때문에, 신규 값은 **양쪽 다 안전한 방향**으로 떨어진다.
뮤테이션 M8(`=== 'POSITIVE'` → `!== 'NOT_YET_CHECKED'`)이 `test:lbp-exercise-recommendation`에서
검출됨을 확인했다.

---

## C. "기록되었는가" 필터

**Verdict: PASS.**

- **EMR에 나타나야 한다**: `emrPreview.ts:60/:75` 필터를 통과 → `:68/:83`에서
  `${title}: ${LABEL[status]}${lat}${note}` 형태로 기록. `tests/doctor-workspace.spec.mjs:560-614`
  (T-2)가 `제한적 시행(판단 유보)`·`시행 못 함`·각 note가 EMR textarea 안에 등장하고
  `아직 확인 안 됨` 항목 title은 부재, `음성/정상`·리터럴 `undefined` 부재를 동시에 확인.
- **재진 이월도 나타나야 한다**: `RevisitWorkspace.tsx:133`(직전 문진 방문)과
  `:180`(문진 없는 재진) 두 경로 모두 동일 필터 → 신규 값 통과.
- **"아직 확인 안 됨" 카운터에서 빠져야 한다**: `isExamPending`/`isReassessmentPending`/
  `groupExamSuggestions().stillPending`/`StructuredReassessmentCard.tsx:120` 전부
  `=== 'NOT_YET_CHECKED'` → 신규 2값 제외. `tests/workspace-round3.spec.mjs`의 T-3이
  6값 전체를 넣고 `stillPending.length === 1`을 확인(vacuous 아님 — 6개 중 1개만
  남는다는 형태라 필터가 넓어지거나 좁아지면 둘 다 깨진다).
- **legacy 4값 레코드 무변화**: `tests/workspace-round3.spec.mjs:1055-1058` (T-6)이
  4값만 든 레코드의 round-trip `JSON.stringify` 동일성을 byte 수준으로 고정. PASS.

---

## D. 영속화 / 하위 호환 + 배포 메모 판정

**Verdict: 순방향(구 레코드 → 신 클라이언트)은 PASS. 역방향 서술에 defect 1건(문서).**

**순방향 / 손상 내성 (전부 확인):**
- 스키마 버전 bump 불필요가 맞다. `sanitizeShape`(`sanitize.ts:29-58`)는 status를
  "템플릿과 typeof가 같으면 통과"(문자열)시키고, 유효성은 `isValidExamStatus`
  (`provenance.ts:206`, `hasOwnProperty(EXAM_CHECK_STATUS_LABEL, status)`)가 판정하므로
  LABEL에 key가 생기면 자동으로 valid가 된다 — 마이그레이션 코드가 필요 없다.
- **알 수 없는/손상된 status의 열화 대상**: (a) 문자열이 아닌 값(number/object/null)은
  `sanitizeShape`에서 템플릿 기본값 `NOT_YET_CHECKED`로 떨어진다 → **fail-safe**
  (미확인으로, 절대 음성으로 가지 않는다). (b) 알 수 없는 *문자열*은 sanitize를
  통과하지만 `isValidExamStatus`가 false → EMR/이월에서 **누락**되고,
  `StructuredReassessmentCard.tsx:52`의 `이전 소견`은 `'확인 필요(값 형식 오류)'`로
  표시된다 → **fail-closed**. 두 경로 다 "없는 소견을 만들어내지 않는다"는 원칙을 지킨다.
- 신규 값이 **기본값으로 새는 경로 0건**: `examSuggestion.ts:45` `emptyExamResult()`,
  `persistence.ts:82`·`visitWorkspace.ts:32` `PREVIOUS_EXAM_VALUE_TEMPLATE`,
  `reassessmentExam.ts`의 `reassessmentExamItemFromPrevious`(오늘 결과는 항상
  `NOT_YET_CHECKED`) 전부 유지. T-4가 `previous.status`가 `LIMITED`/`NOT_PERFORMED`여도
  오늘 결과가 `NOT_YET_CHECKED`로 시작함을 확인.

**역방향(배포 메모) 판정 — 실제로 재현해서 확인했다.**
scratch 사본에서 `provenance.ts`/두 카드/`lbpExerciseRecommendation.ts`만 `e1bac49`
(구버전)으로 되돌리고 `status:'LIMITED'` 레코드를 렌더한 결과:

```
EMR contains the item title       : false   ← 소견 한 줄 누락 (문서 주장과 일치)
card shows 확인 필요(값 형식 오류)  : false   ← 문서 주장과 불일치
card has statusBtn--active        : false
card is examCard--done            : true
note text still visible on card   : (note가 있으면 true, 비어 있으면 false)
```

즉:
1. "EMR에서 조용히 누락된다"는 **맞다**.
2. **"화면엔 `확인 필요(값 형식 오류)`로 뜬다"는 틀렸다.** 그 fallback은
   `StructuredReassessmentCard.tsx:52`의 *이전 소견* 라인에만 존재하고,
   원장이 실제로 보는 **주 exam 카드에는 어떤 표식도 없다**. 구버전 카드는
   버튼 4개 중 아무 것도 눌리지 않은 채 `workspace__examCard--done` 스타일로
   렌더되고, `pending=false`라 **"아직 확인 안 됨" 목록에서도 빠진다**.
   CD-2.5b-2가 사유 메모를 필수화하지 않았으므로 note가 비어 있는 경우
   화면에는 **아무 흔적도 남지 않는다** — 문서가 서술한 것보다 **나쁜** 열화다
   (EMR과 pending 양쪽에서 동시에 사라짐).
3. **완화책 판정**: "태블릿·원장 화면 동시 배포"는 *이번* 배포에 대해서는
   실질적으로 유일한 수단이 맞다 — 구버전에 가드를 넣을 방법이 없기 때문이다.
   그러나 **지금 버전에 가드를 넣는 것은 정당하다**: 2.5c/Batch 4가 또 값을
   추가하면 *오늘 배포한 이 빌드가* 그때의 "구버전"이 된다. 3줄짜리
   fail-closed 표식(아래 defect 2)이면 다음 확장에서 같은 무증상 누락이
   반복되지 않는다. 이번 배치의 blocker는 아니다.

---

## E. 옵션 목록의 단일 정의

**Verdict: 값 수준·`ExamSuggestionCard` 렌더 수준은 PASS. `StructuredReassessmentCard` 렌더 수준은 FAIL → defect 1.**

- 단일 정의 `provenance.ts:175-182` (`EXAM_CHECK_STATUS_OPTIONS`), 손으로 쓴 리터럴
  2곳 제거 확인 — `ExamSuggestionCard.tsx:123`과 `StructuredReassessmentCard.tsx:61`이
  모두 이 배열을 직접 map한다. 실제 렌더로 두 카드 다 6개 버튼이 나오는 것을
  확인했다(reassessment 카드는 내 probe로 확인).
- **T-1a (값 수준, `tests/workspace-round3.spec.mjs:895-905`)는 비-vacuous**: 길이·집합·
  중복 없음을 동시에 비교한다. 뮤테이션 M1(`NOT_PERFORMED` 제거) → **KILLED**.
- **T-1b (렌더 수준, `tests/doctor-workspace.spec.mjs:543`)도 비-vacuous** — 같은 M1을
  화면 수준에서도 검출: `AssertionError: status button "시행 못 함" must be offered to the clinician`.
  `:550`의 두 번째 테스트가 두 신규 라벨이 `workspace__statusBtn` + `aria-pressed`를
  가진 진짜 `<button>` 안에 있는지도 확인한다(장식 텍스트 아님).
- **그러나 T-1b는 `ExamSuggestionCard`만 본다.** 설계 §4 T-1은 "`ExamSuggestionCard`/
  `StructuredReassessmentCard` 렌더 HTML에 6개 라벨이 **전부** 등장"을 요구했는데
  재검 카드 쪽 assertion이 없다 → **뮤테이션 생존 확인, defect 1**.

---

## F. 테스트 비-vacuous 여부 — 뮤테이션 11종 직접 재현

scratch 사본에서 직접 심고 되돌렸다. 구현자가 주장한 9종 중 요청된 5종 포함
9종을 재현했고, 추가로 2종을 새로 심었다.

| # | 뮤테이션 | 결과 |
|---|---|---|
| M1 | `EXAM_CHECK_STATUS_OPTIONS`에서 `NOT_PERFORMED` 제거 | **KILLED** — `test:workspace-round3`(T-1a) + `test:doctor-workspace`(T-1b) 양쪽 |
| M2 | CD-2.5b-2 자동 펼침 되돌리기 (`ExamSuggestionCard.tsx:73`) | **KILLED** — `시행 못 함 must open the note field so the reason can be recorded` |
| M3 | 재진 이월 필터를 `POSITIVE\|\|NEGATIVE`로 축소 (`RevisitWorkspace.tsx:133/:180`) | **KILLED** — T-5 |
| M4 | EMR 라인에서 `LIMITED`를 `NEGATIVE`로 치환 (`emrPreview.ts:62/:77`) | **KILLED** — `the LIMITED item's own label must appear` |
| M5 | `LIMITED`를 `UNCLEAR`로 접기 (라벨·glyph 동일화) | **KILLED** — T-9(glyph 집합) + T-1b |
| M6 | `emrPreview.ts:60` 필터를 `POSITIVE\|\|NEGATIVE`로 축소 | **KILLED** — `a LIMITED result is a recorded fact and must appear in the EMR text` |
| M7 | `isExamPending`을 `NOT_PERFORMED` 포함으로 확대 (`examSuggestion.ts:67`) | **KILLED** — `test:workspace-round3` (T-3). `test:doctor-workspace`는 생존(설계상 값 수준 담당이 round3이므로 결함 아님) |
| M8 | `neurodynamicConcordant`를 `!== 'NOT_YET_CHECKED'`로 완화 | **KILLED** — `test:lbp-exercise-recommendation` |
| M9 | `LIMITED` 라벨을 `'음성/정상'`으로 교체 | **KILLED** — T-1a + T-1b |
| **M10** | `StructuredReassessmentCard.tsx:61`을 손으로 쓴 4값 리터럴로 되돌림 | **SURVIVED** — `test:workspace-round3`, `test:doctor-workspace`, `test:doctor` 전부 exit 0 → **defect 1** |
| **M11** | `persistence.ts:82` `PREVIOUS_EXAM_VALUE_TEMPLATE.status`를 `'LIMITED'`로 | **SURVIVED** — 두 스위트 다 exit 0 → **defect 3** |

**vacuous assertion 1건**: `tests/workspace-round3.spec.mjs:1017-1020` (T-10)의
"`emptyVisitWorkspaceState` reassessment items start empty"는 `items.length === 0`만
확인한다. T-10이 방어하기로 한 대상은 `visitWorkspace.ts:32`의
`PREVIOUS_EXAM_VALUE_TEMPLATE.status`인데, 빈 배열 확인은 그 템플릿 값과
아무 관계가 없다 — 그 상수를 `'LIMITED'`로 바꿔도 통과한다(M11로 확인).
설계 §4 T-10은 `PREVIOUS_EXAM_VALUE_TEMPLATE`를 명시적으로 열거했었다.

그 외 assertion은 전부 실질적이다. T-6의 legacy byte-identical round-trip,
T-7의 prototype key(`'toString'`) 거부, T-3의 "6값 중 정확히 1개만 pending" 형태는
특히 좋은 형태다.

**T-5에 대한 단서(비차단, 관찰 O-2)**: `tests/doctor-workspace.spec.mjs:662`의 T-5는
`RevisitWorkspace.tsx` **소스 정규식** 검사이지 동작 검사가 아니다. 이 파일이 원장
화면 shell 전체라 단독 번들이 어렵다는 사정은 이해하고, 실제 축소(M3)를 검출하는
것도 확인했다. 다만 (a) 신규 2값이 이월 텍스트에 **라벨로 실제 출력**되는지는
아무 테스트도 확인하지 않고(설계 T-5의 원래 요구사항), (b) 정확한 문자열 2회
등장을 세므로 의미 동일한 리팩터(예: `isExamChecked(...)`로 치환)에도 깨진다.
`revisitCarryForward.ts` 번들은 이미 `test:workspace-round3`에 들어 있으니
이월 문자열 생성부만 순수 함수로 뽑을 수 있다면 후속 배치에서 승격할 가치가 있다.

---

## G. 다른 부위 (목/어깨/무릎/팔꿈치/손목/발목/TMJ/고관절)

**Verdict: PASS.**

- **FROZEN zero-diff 확인**: `git diff --stat origin/main -- src/spec index.html src/App.tsx server "tablet core"` → 빈 출력.
  `e1bac49..2a078bc`에 대해서도 동일하게 빈 출력.
- `src/spec/**`에 `ExamCheckStatus`/`NOT_YET_CHECKED`/`LIMITED`/`NOT_PERFORMED` 참조
  **0건** — 문진 spec 계층은 이 타입을 아예 모른다.
- **지역별 doctor 코드 중 exam 상태를 읽는 것은 없다.** `DoctorView.tsx`의
  `suggestedExamCodes`/`suggestedNeckExamCodes`/`suggestedShoulderExamCodes`/
  `suggestedKneeExamCodes`/`suggestedElbowExamCodes` 등은 **검사 코드 목록만** 만들어
  렌더하고 결과 상태를 다루지 않는다(`DoctorView.tsx:832`, `:1011`, `:1195`, `:1359`, `:1507` …).
  `AnkleFootSafetyPanel`/`HipSafetyPanel`/`TmjSafetyPanel`/`JudgmentPanel`/`emrSummary.ts`도
  exam 상태 무관. `ObjectiveExamFindingsCard.tsx`의 `status`는 저장 상태 머신
  (`idle|saving|saved|error|conflict`)으로 완전히 별개다.
- 따라서 전 부위는 **동일한 부위-무관 workspace 경로**(`PainWorkspace` → `ExamSuggestionCard`/
  `StructuredReassessmentCard`/`emrPreview`/`RevisitWorkspace`)를 그대로 공유하며,
  6값에 대해 위 B/C에서 검증한 동작을 그대로 얻는다. **부위별 분기가 없다는 것이
  이 확장이 안전한 이유**다.
- 부위별 생성기 중 유일한 것은 `lbpExamSuggestions.ts`의 `mergeLbpExamSuggestions`
  (`:191-203`)인데, 기존 항목의 `result`를 건드리지 않고 신규 id만 append하므로
  이미 기록된 신규 값이 재계산으로 지워지지 않는다. 확인함.
- **비-LBP 부위에서는 신규 2값을 고를 수는 있지만 그것을 읽는 추론이 애초에 없다**
  (`lbpExerciseRecommendation.ts`가 유일한 추론 지점이고 LBP 전용). 즉 다른 부위에서
  신규 값은 순수 기록 필드로만 작동한다 — 의도한 바와 일치.

---

## H. 범위 / 불변식

**Verdict: PASS.**

- FROZEN zero-diff ✅ (위 G).
- 코드 diff는 4파일뿐이고 전부 §6 허용 목록 안: `provenance.ts`(타입/라벨/glyph/OPTIONS/주석),
  `ExamSuggestionCard.tsx`(리터럴 제거 + `showDetail` 파생 1항), `StructuredReassessmentCard.tsx`
  (리터럴 제거), `lbpExerciseRecommendation.ts`(**주석만** — `:211~`, `:296~`; 로직 라인
  `:305`는 무변경 확인).
- 숫자 점수·threshold **0건**, 신규 태블릿 질문 **0건**, CSS **무변경**,
  `PatientResponseState`·`LbpDirectionalResponse`·capability 3상태 **무변경**.
- 한국어 우선 ✅ (라벨·주석·테스트명).
- `package.json`: `test:workspace-round3`에 esbuild 단계 2개만 추가.
  **스크립트 키 목록은 before/after 완전 동일**(직접 diff로 확인) — 신규 npm script 없음.
  `.gitignore`에 대응 번들 2개 추가, 경로가 outfile과 정확히 일치, 번들 파일은
  git에 커밋되지 않음(`git ls-files | grep tests/\..*bundle` → 0건). 선언된 최소 이탈이 맞다.
- `tests/tablet-viewport.spec.mjs`(2a078bc): `finally` 블록만 변경 —
  SIGKILL 후 300ms 대기, `rmSync`에 `maxRetries/retryDelay`, 정리 실패를 삼킴.
  **assertion 약화·skip·비활성화 없음**, `passed` 카운트 로직 무변경, `try` 본문의
  예외는 여전히 전파된다(`catch`가 없다). 기존 관례(`visit-summary-auth-recovery-headless.spec.mjs`)
  와 동일. 이 배치와 무관한 별건 처리로 적절.
- 그 외 기어들어온 변경 없음(diff 전체 재확인).

---

## I. 구체적 결함

### 1. (MEDIUM) `StructuredReassessmentCard`의 6버튼 렌더가 테스트되지 않는다 — 설계 §4 T-1 미충족

이 배치가 존재하는 이유인 "조용한 옵션 누락"이 **재검 카드에서는 여전히 무증상으로
가능하다**. `StructuredReassessmentCard.tsx:61`을 4값 리터럴로 되돌리는 뮤테이션(M10)을
심었더니 `test:workspace-round3`·`test:doctor-workspace`·`test:doctor`가 **전부 exit 0**.
설계 §4 T-1은 "두 카드" 렌더를 명시했는데 `tests/doctor-workspace.spec.mjs:543`은
exam suggestion 카드만 본다. 임상적으로도 재검(재진) 경로에서 "제한/시행 못 함"을
못 고르면 재진 소견이 다시 4상태로 붕괴한다.

- **파일:line**: `tests/doctor-workspace.spec.mjs:543` 부근 (누락된 테스트).
  대상 코드는 `src/doctor/workspace/StructuredReassessmentCard.tsx:61`.
- **최소 수정**: 기존 스위트에 T-1b의 쌍둥이 1건 추가. `renderWith(PAIN_SCENARIO_1, {
  submissionId:'…', initialWorkspaceState: { painExamSuggestions: [], painReassessment: {
  items: [{ id:'r1', title:'재검 항목', previous:null, result:{ status:'NOT_YET_CHECKED',
  laterality:'NOT_APPLICABLE', note:'', recordedAt:null } }] } } })` 후 6개 라벨 전부
  `html.includes(...)`. (이 스위트의 `:1988` "오늘 재검 목록" 테스트가 이미 쓰는
  렌더 경로 그대로다. 내가 이 형태로 probe를 작성해 HEAD에서 PASS,
  M10에서 `reassessment status button "제한적 시행(판단 유보)" must be offered`로
  FAIL함을 확인했다.)
- **기계적 재확인 기준**: `StructuredReassessmentCard.tsx:61`의
  `EXAM_CHECK_STATUS_OPTIONS.map`을 4값 리터럴로 바꾸면 `npm run test:doctor-workspace`가
  **반드시 exit≠0**이어야 한다.

### 2. (MEDIUM, 문서) 배포 메모의 열화 서술이 사실과 다르다 — 실제가 더 나쁘다

`docs/LBP_V1_BATCH2_5B_FABLE_IMPACT_SCOPE_v0.1.md` §5-1 및 §7 "배포 시 주의"는
구버전 클라이언트에서 "화면에는 `확인 필요(값 형식 오류)`로 뜬다"고 적었으나,
그 fallback은 `StructuredReassessmentCard.tsx:52`의 *이전 소견* 라인에만 있고
**주 exam 카드에는 없다**. 실제 열화는 D절의 재현 결과대로 "EMR에서 누락 +
pending 목록에서도 제외 + 카드에 아무 표식 없음"이다. 배포 판단(PO)이
이 서술에 근거하므로 정정이 필요하다.

- **파일:line**: 설계 문서 §5-1(위험 1) 및 §7 "배포 시 주의" 마지막 문단.
  `DECISIONS.md` 2026-09-03 Consequences의 "배포 제약(신규)" 문장은
  `확인 필요` 주장을 담고 있지 않으므로 그대로 두어도 되지만,
  "pending 목록에서도 빠진다"를 한 줄 보강하는 편이 낫다. `HANDOFF.md:37-39`도 동일.
- **최소 수정**: 해당 문장에서 "화면엔 `확인 필요(값 형식 오류)`" 부분을 삭제하고
  "구버전 exam 카드에는 아무 표식 없이 '기록됨' 스타일로만 보이며, '아직 확인 안 됨'
  목록에서도 빠진다"로 교체.
- **기계적 재확인 기준**: 문서 grep으로 `확인 필요(값 형식 오류)` 문자열이
  구버전 열화 문맥에서 사라졌는지 확인. (선택) 위 D절의 probe를 재현.

### 3. (LOW) T-10의 `visitWorkspace` assertion이 vacuous — 손상 레코드의 fail-safe 기본값이 무방비

`tests/workspace-round3.spec.mjs:1017-1020`은 `emptyVisitWorkspaceState().reassessment.items.length === 0`만
확인한다. T-10이 지키기로 한 것은 `visitWorkspace.ts:32`/`persistence.ts:82`의
`PREVIOUS_EXAM_VALUE_TEMPLATE.status`가 `NOT_YET_CHECKED`로 남는 것이다. 이 상수는
`sanitizeShape`의 fallback이므로 여기에 신규 값이 들어가면 **손상된 레코드가
"제한적 시행(판단 유보)"이라는 없는 임상 사실로 렌더된다**. `'LIMITED'`로 바꾸는
뮤테이션(M11)이 두 스위트 모두에서 생존했다.

- **파일:line**: `tests/workspace-round3.spec.mjs:1017-1020`.
- **최소 수정**: `deserializeWorkspaceState`에 `previous: {}`(또는 `previous.status: 7`)를
  넣은 레코드를 통과시킨 뒤 `items[0].previous.status === 'NOT_YET_CHECKED'`를 단언.
  `persistence` 번들은 이미 이 spec에 import되어 있어 새 번들 불필요.
- **기계적 재확인 기준**: `persistence.ts:83`(또는 `visitWorkspace.ts:33`)의
  `status: 'NOT_YET_CHECKED'`를 `'LIMITED'`로 바꾸면 `npm run test:workspace-round3`가
  **반드시 exit≠0**이어야 한다.

### 4. (LOW, 다음 배치 권고) 구버전 무증상 누락에 대한 fail-closed 표식

이번 배포의 완화책은 동시 배포가 맞지만(D-3), **다음 확장(2.5c/Batch 4)에서
오늘의 빌드가 "구버전"이 된다.** `ExamSuggestionCard.tsx:123` 렌더 시
`isValidExamStatus(item.result.status)`가 false면 상태 행 위/아래에
`확인 필요(값 형식 오류)` 표식 1줄(그리고 카드를 `--done`으로 칠하지 않기)을
추가하면, 다음번 값 추가 때 소견이 무증상으로 사라지지 않는다.
`StructuredReassessmentCard.tsx:52`가 이미 쓰는 패턴 그대로다.

- **판단**: 이번 배치 범위(§6) 밖이므로 **여기서 하지 말 것**. 별도 백로그 항목으로
  등록하고, 2.5c 착수 시 함께 처리 권고.

---

## CLINICAL DECISION REQUIRED

**없음.** CD-2.5b-1/-2/-3은 PO가 이미 승인했고, 위 결함 4건 중 어느 것도
임상 정책 판단을 필요로 하지 않는다(테스트 보강 2건, 문서 정정 1건, 백로그 1건).

---

## 무조치 관찰 (Observations, 조치 불요)

- **O-1 (라벨, 파일럿 확인 항목)**: `미시행`(`lbpExamSuggestions.ts:219`, 뜻=미평가)과
  `시행 못 함`(`provenance.ts:136`, 뜻=시행하지 않기로 판단한 사실)이 같은 원장
  화면에 공존한다. 문자열 충돌은 피했지만 바쁜 진료 중 한국어로는 동의어로 읽힌다.
  PO가 tradeoff를 알고 A안을 택했으므로 지금 바꾸지 않되, 파일럿에서 두 컨트롤의
  실제 입력 분포를 함께 볼 것.
- **O-2**: `제한적 시행(판단 유보)`는 괄호가 "판단을 유보했다"를 명시해 한눈에
  읽힌다 — 좋다. 반대로 `불명확`은 "**시행은 완료했다**"를 스스로 말해주지 않아
  두 값의 경계가 라벨만으로는 비대칭이다. 설계 §5-3이 "라벨과 ⓘ 도움말이 유일한
  방어선"이라 했는데 **상태값에 대한 ⓘ 도움말은 이번에 만들어지지 않았다**
  (카드의 `help`는 검사 자체의 how/why). 코드 결함은 아니고, 파일럿에서 두 값이
  섞여 쓰이면 그때 ⓘ 한 줄을 붙이면 된다.
- **O-3**: 데모/온보딩 fixture `workspaceFixtures.ts:144`(`p3-cuff`)가
  `status:'UNCLEAR'`, note `'통증으로 정확한 근력 평가 어려움'`이다 — 6상태 기준으로는
  **교과서적인 `LIMITED` 사례**다. 회귀 기준선이라 이번에 건드리지 않은 것은
  옳지만(설계 §2.8), 저장소의 시연 데이터가 원장에게 잘못된 사용 패턴을
  가르치게 된다. 파일럿 자료를 만들 때 별도 fixture로 `LIMITED` 예시를 추가할 것.
- **O-4 (a11y/터치 타깃 — 회귀 없음)**: `.workspace__examCard__statusRow`는
  `display:flex; flex-wrap:wrap; gap:6px`(`workspace.css:411-416`), 버튼 폭 고정 없음,
  `.doctor__visitShell`에서 `min-height: 44px`(≤1023px에서 48px, `doctor.css:428-443`).
  버튼이 4→6개가 되어도 **줄이 감길 뿐 터치 타깃 높이는 그대로**다.
  자주 쓰는 3개(양성/음성/불명확)를 앞에 둔 순서 덕에 좁은 폭에서도 첫 줄에 온다.
  `role="group"` + `aria-label` + 버튼별 `aria-pressed`도 6개 전부에 그대로 적용된다.
  CSS 무변경 결정은 타당하다.
- **O-5**: `showDetail` 자동 펼침(`ExamSuggestionCard.tsx:73`)은 파생값이라 effect가
  없고, `NOT_PERFORMED`에서 접힌 분기가 skip돼도 `재검 항목으로 추가 →` 버튼은
  펼친 분기(`:188-192`)에도 있어 **승격 경로가 사라지지 않는다** — 확인함.
- **O-6**: `isExamChecked`(`provenance.ts:190`)는 여전히 src 호출처 0(dead export)이지만,
  이번에 "LIMITED/NOT_PERFORMED도 true이며 결과로부터 추론하는 용도가 아니다"라는
  주석이 붙었고 테스트가 그 계약을 고정했다. 설계 §2.4의 "삭제하지 않고 주석 보강"
  판단대로 처리됨. 백로그 유지.
- **O-7**: `DoctorWorkspace.tsx:420`의 한약 관찰 승격 시 `status:'UNCLEAR'` 자리표시자
  오용은 이번 배치에서 손대지 않았고, 실제로 신규 2값 어느 것도 그 자리에 맞지
  않는다(자유 텍스트 관찰에는 "결과 상태"라는 개념 자체가 없다). 백로그 유지가 옳다.

---

## 요약

임상 안전 불변식("미확인/제한/미시행을 음성·정상으로 찍지 않는다", "unknown은
근거가 아니다")은 6상태에서도 **구조적으로** 지켜지고, 그 우연을 계약으로 고정하는
테스트도 대부분 실질적이다(뮤테이션 9/11 검출). 남은 것은 재검 카드 렌더 커버리지
1건, vacuous assertion 1건, 그리고 배포 판단에 쓰이는 문서 서술 정정 1건이다.
**Disposition: PASS** — 위 결함 1·2·3을 후속 커밋으로 처리하고 4는 백로그로.
