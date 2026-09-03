# Opus delta review — LBP v1 Batch 3 (재진 Quick Check + 세부 체크 주기 표시)

- Repo: `/home/user/Samindang`, branch `claude/clinical-os-lbp-architecture-xym6po`
- Delta: `e02cfc6..2cdbd06` (HEAD = `2cdbd06`), 10 files, +1245/-6
- Brief: `docs/LBP_PRODUCTION_V1_MINIMAL_ARCHITECTURE_v0.1.md` §9 (scope §9.2 a–f, 금지 §9.3)
- 검토 방식: 소스 정독 + 로컬 재실행 + **scratch 복사본 뮤테이션 11건**(저장소 파일 무변경, `git status` clean 확인)

## Disposition: **PASS**

임상 의미상 문제 없음. 차단 결함 없음. 아래 **must-fix 1건(문서 주석과 코드 불일치)** 과
nice-to-have 2건, 관찰 6건.

---

## 실행 결과

| 명령 | 결과 |
|---|---|
| `npx tsc -b` | exit 0 |
| `npm run test:revisit-quick-check` | **106 assertions passed** |
| `npm run test:workspace-round3` | **153 assertions passed** |
| `npm run test:doctor-workspace` | **227 assertions passed** |
| `npm run test:doctor-reset-key` | **11 assertions passed** |
| `git diff --stat origin/main -- src/spec index.html src/App.tsx server "tablet core"` | **빈 출력 (FROZEN 무변경)** |
| `git diff --stat e02cfc6..HEAD -- revisitCarryForward.ts microFollowUp.ts DoctorWorkspace.tsx PainWorkspace.tsx persistence.ts` | **빈 출력** |

---

## A. 안내 문장의 임상 의미 (`deriveRevisitQuickCheckGuidance`) — PASS

`src/doctor/workspace/revisitQuickCheck.ts:197-247`. 8개 규칙 전부 chip 상태 → 문장의
**직접 대응**이며, 브리프 §9.2(b)의 문장을 **글자 그대로** 옮겼다. 점수·가중치·threshold
없음(파일 전체에 산술 연산은 `computeDetailCheckDue`의 `k + 1` 뿐이며 그 값은 원장이 세운
plan과만 비교된다). 자동 실행/전송/화면 전환 없음.

지정된 4개 probe 재현 (scratch 번들 직접 실행):

1. **`newNeuroOrRedFlag === 'YES'` → safety true + 문장, 자동 동작 없음** — `:202-205`.
   `{...empty, newNeuroOrRedFlag:'YES'}` → `safetyRefreshSuggested === true`,
   `lines === ['새 신경증상·위험신호: 안전 확인부터. 재초진 문진(태블릿) 또는 신경학적 기본검사를 고려하세요.']`.
   호출부(`RevisitQuickCheckCard.tsx:159-175`)는 `<p>` 하나를 그릴 뿐 어떤 상태도 바꾸지 않는다.
2. **NOT_ASSESSED가 하나라도 있으면 "유지·진행" 문장 없음** — 직접 재현:
   `{targetFunctionChange:'BETTER', overallResponse:'BETTER', newNeuroOrRedFlag:'NOT_ASSESSED', exerciseAdherence:'DONE_AS_PLANNED', adverseEffect:'NO'}`
   → `lines: []`, `safetyRefreshSuggested: false`. 게이트는 `:234-244`의 `allAssessed` 5항목
   전부 + `newNeuroOrRedFlag === 'NO'` + `adverseEffect === 'NO'` (모두 **양성 확인**,
   `!== 'YES'` 같은 부정형 아님).
3. **neuro YES 단독(나머지 전부 NOT_ASSESSED) → safety true** — 재현 확인. 규칙 1은 다른 항목을
   전혀 참조하지 않는다(`:202`).
4. **미평가 항목에서 "정상/안전"을 말하는 문장 없음** — 전체 문장 집합을 검토했다. `정상`/`안전함`
   /`이상 없음` 류 단정 표현은 어디에도 없다. 유일한 긍정 문장 "유지·진행 가능(원장 판단)."은
   위 (2)의 게이트를 통과해야만 나오고, recap 요약(`summarizeRevisitQuickCheckKo:331-350`)도
   NOT_ASSESSED 항목을 **행에서 제외**할 뿐 "없음"으로 렌더하지 않는다.

한국어 문장을 임상가 관점에서 읽은 판단:

- 1 (안전): "안전 확인부터"로 순서를 지정하고 "고려하세요"로 끝난다 — 진단을 말하지 않고,
  자동 조치를 암시하지 않는다. 적절.
- 2 (이상반응): "기록됨: 처치 계획 재검토." — 사실 진술 + 행동 제안. 적절.
- 3 (악화): "악화: 계획 재검토." — 아래 관찰 O-1 참고(문장 자체는 브리프 축자 인용이라 구현 결함 아님).
- 4 (정체): 세 조건 AND가 실제로 걸려 있다(`:215-221`, 뮤테이션 M3로 검증). 적절.
- 5/6 (운동): progression 엔진 없이 "고려"/"확인"에 머문다. `NOT_PRESCRIBED`가 규칙 6에
  포함되지 않는 것도 임상적으로 정확하다(처방 없음 ≠ 안 함).
- 7: "가능(원장 판단)" — 지시가 아니라 여지를 남기는 표현. 적절.

**새 임상 판단/threshold/승인되지 않은 escalation은 도입되지 않았다.** `CLINICAL DECISION REQUIRED` 없음.

## B. `computeDetailCheckDue` — PASS

`revisitQuickCheck.ts:285-321`. 직접 재실행으로 전 항목 확인:

| 케이스 | 기대 | 실측 |
|---|---|---|
| DATE, `todayISO === targetDate` | due | `{reason:'DATE', planLabel:'날짜 지정 2026-09-03'}` ✔ |
| DATE, 전날 | null | null ✔ |
| DATE, `2026/09/03`(형식 불일치) | null | null ✔ (`ISO_DATE_RE`, `:259`, `:301`) |
| VISIT_COUNT, k=0·n=1 (k+1 ≥ n) | due | `{reason:'VISIT_COUNT', planLabel:'방문 1회 후'}` ✔ |
| VISIT_COUNT, k=0·n=2 (k+1 < n) | null | null ✔ |
| n = 0 / -1 / 1.5 | null | 전부 null ✔ (`:310`) |
| 직전 UNSET + 그 이전 DATE | 이전 plan 사용 | `sourceVisitCreatedAt`이 **더 오래된** 방문 ✔ (`:292`) |
| CLINICIAN_DECIDES | null | null ✔ (`:318`) |
| `undefined`/`null`/`'not-an-array'`/`42`/`[null]`/`[undefined]`/`[42]`/`['x']` | throw 없이 null | 전부 throw 없이 null ✔ (`:286,289,291`) |
| plan이 객체가 아님(`'not-an-object'`) | null | null ✔ |

**시스템이 만든 숫자 없음**: `planLabel`은 `날짜 지정 ${targetDate}` / `방문 ${n}회 후`로
원장이 입력한 값만 되풀이한다(`:303,312`). 비교 대상도 `todayISO`(오늘 날짜)와 원장 plan 값뿐.
날짜 비교는 문자열 `>=`라 시간대 문제가 없고, `todayISO()`(`RevisitWorkspace.tsx:189-195`)도
로컬 `yyyy-mm-dd`를 만들어 원장이 date input으로 고른 `targetDate`와 같은 기준이다.

`k`의 의미는 정확하다: `visits`는 최신순이며 오늘 방문을 이미 제외한다
(`longitudinal.ts:39-42`, `server/store.js:489`, `visitStore.js:259`의 내림차순 정렬 확인).
plan이 index k에 있으면 그 뒤의 방문 k개 + 오늘 = k+1.

**오늘 재검 `<details open=...>` 무변경 확인**: `RevisitWorkspace.tsx`의 해당 태그는 여전히
`<details className="workspace__revisit__optional" open={workspaceState.reassessment.items.length > 0}>`
이며 `detailCheckDue`를 참조하지 않는다. `tests/doctor-workspace.spec.mjs`가 이 문자열을
attribute 단위로 고정하고 있고(F 참고) 뮤테이션으로 비-vacuous 검증했다. **due여도 자동으로 열리지 않는다.**

## C. 데이터 모델 / 영속성 — PASS

- **additive**: `visitWorkspace.ts:69-75`에 필드 추가, `VISIT_WORKSPACE_SCHEMA_VERSION`은
  `:60` `'1.0.0'` 그대로(diff에 버전 라인 없음).
- **레거시(필드 없음) → empty**: `sanitizeRevisitQuickCheck(undefined)`가
  `isSanitizeRecord` 실패로 `emptyRevisitQuickCheck()` 반환(`revisitQuickCheck.ts:151-153`),
  `workspace-round3.spec.mjs`에서 `delete legacy.revisitQuickCheck`로 실제 검증.
- **손상 enum → NOT_ASSESSED (passthrough 아님)**: `:154-164`가 필드별 `isValid*` 가드를 통과한
  값만 보존하고 나머지는 `NOT_ASSESSED`로 낮춘다. 가드는
  `Object.prototype.hasOwnProperty.call(LABEL, v)` + `typeof v === 'string'`이라
  `'toString'`/`'__proto__'` 같은 프로토타입 키도 통과하지 않는다(`:126-136`). `'IMPROVED'`,
  `7`, `'MADE_UP'`로 실증됨. **어떤 경로로도 미지 값이 정상/음성 값으로 바뀌지 않는다.**
- **`recordedAt` 의미**: "5항목 중 하나라도 NOT_ASSESSED가 아니게 된 시점". 구현은
  `RevisitQuickCheckCard.tsx:84-90` — chip 변경마다 재기록(= "마지막 수정 시각")하고,
  전부 해제되면 `null`로 되돌린다. 앞부분은 이 저장소의 기존 관례와 일치하고
  (`FinalAssessmentCard.tsx:98`, `CarePlanCard.tsx:36`, `StructuredReassessmentCard.tsx:147`
  모두 변경마다 `new Date().toISOString()`), 뒷부분(전부 해제 시 null 복귀)은 관례보다 오히려
  엄격하다 — loop 표시가 "체크했다"고 거짓말하지 않는다. 메모만 입력하면 `recordedAt`은
  null로 남는다(`:154`) — 브리프 정의와 일치.
- **`visitWorkspaceStateEquals` 변경 감지**: JSON 비교라 자동 반영되며,
  quick-check만 바뀐 상태 쌍으로 실증(`workspace-round3.spec.mjs`).
- **carry-forward 미포함(구조적)**: `carryForwardSourceFromVisitWorkspace` 반환 객체에
  `quickCheck`/`revisitQuickCheck` 키가 **없음**을 `in` 연산자로 확인하고,
  `applyJudgmentCarryForward` 적용 후 오늘 workspace의 quick check가 empty 그대로임을 확인한다.
  `revisitCarryForward.ts`는 이번 delta에서 zero-diff.
- **환자 `MicroFollowUpResponse` 자동 복사 없음**: `revisitQuickCheck.ts` / `RevisitQuickCheckCard.tsx`
  둘 다 `./microFollowUp`를 import하지 않으며(테스트가 import 문 정규식으로 고정),
  `RevisitWorkspace.tsx`에서 `microFollowUpResponse`는 `:203` 선언과 `:458`
  `<MicroFollowUpCard ... response={microFollowUpResponse} />` 읽기 전용 표시 **두 곳에서만**
  쓰인다 — `workspaceState`로 흘러드는 경로가 없다. 카드 hint에도 명시(`:99`).

## D. UI — PASS

- **`NextReassessmentPlanCard` 관례**: `value`/`onChange` props(`:77-83`),
  `role="group"` + `aria-label`(`:49`), `workspace__followUpChip(+--active)` +
  `aria-pressed`(`:54-55`), 같은 chip 재클릭 시 `'NOT_ASSESSED'` 반환(`:56`) — 관례 일치.
  `workspace__block`/`workspace__block__hint`/`workspace__followUp__options`/
  `workspace__noteInput`/`workspace__finalAssessment__field` 전부 기존 클래스 재사용
  (`workspace.css:299,312,836,466,791`), 신규 CSS는 그룹 제목·안내문 2종·due 1줄뿐(`:1792-1844`).
- **마운트 위치**: `RevisitWorkspace.tsx:606`(`ClinicalLoopStatusBar`) → `:608`
  (`RevisitQuickCheckCard`) → `:613`(`PainFinalAssessmentCard`). ✔
- **loop 항목 `quickCheck`가 맨 앞**: `:430`. ✔
- **안전 문구 `role="status"`**: `RevisitQuickCheckCard.tsx:164`. `role="alert"`는 파일 전체에
  없음. due 줄도 `role="status"`(`RevisitWorkspace.tsx:635`). ✔
- **한국어 라벨**: 5개 그룹 제목·chip 라벨 모두 브리프 표와 일치하며 자연스럽다.
  임상가 대상 텍스트에 라틴 문자는 없다(코드 상수/클래스명만 영문 — 기존 관례).
- **free text 1칸**: 메모 `<input type="text">` 하나뿐(`:148-157`). 추가 자유 입력 없음. ✔

## E. 이전 방문 참고 보강 — PASS

- `summarizeRevisitQuickCheckKo`(`revisitQuickCheck.ts:331-350`)는 NOT_ASSESSED 항목을 건너뛰고,
  남은 게 없으면 `null`을 돌려 호출부가 줄 자체를 생략한다(`RevisitWorkspace.tsx:501-503`).
  브리프의 예시 문자열과 정확히 일치함을 테스트가 고정.
- 이 요약은 **직전 방문이 재진일 때만**(`latestPrior && !latestPrior.submissionId`) 계산되고
  (`:400-404`), 입력은 로드 시 `deserializeVisitWorkspaceState`를 이미 거친 `priorVisitWorkspace`
  (`:275-278`)다 — 원본 PUT 바디를 읽지 않는다.
- 초진 ACCEPTED 운동 제목: `priorVisitRecapLines` 안에서 `deserializeWorkspaceState(priorSubmission.workspace)`
  결과(`:130`)에서만 읽는다(`:145-147`). `sanitizeShape(REHAB_SUGGESTION_TEMPLATE, ...)`가
  `title`을 문자열로 보장(`persistence.ts:65-76,124`)하므로 `.join(', ')`이 크래시하지 않는다.
- **오늘 데이터로 오인될 여지 없음**: 두 줄 모두 "이전 방문 참고" 블록 안에 있고, 각각
  "이전 간단 체크: …", "**이전에 채택한 운동** …"으로 시작한다.

## F. 테스트 비-vacuous 검증 — PASS (뮤테이션 11건 전부 검출)

저장소 파일을 건드리지 않기 위해 소스를 scratch로 복사·변조 후 esbuild로 재번들해
동일 단언을 재평가했다. 각 뮤테이션이 **정확히 대응하는 단언만** false로 뒤집혔다:

| # | 뮤테이션 | 무너지는 단언 |
|---|---|---|
| M1 | 규칙 7이 미평가 neuro를 안전으로 취급(`allAssessed`에서 neuro 제거 + `!== 'YES'`) | 변이저항 (i) "유지·진행 없음" |
| M2 | 규칙 1에 `adverseEffect !== 'NOT_ASSESSED'` 조건 추가 | 변이저항 (ii) safety true / 1줄, 렌더 안전문구 role·class |
| M3 | 규칙 4에서 SAME/SAME 연언 제거 | 변이저항 (iii) "정확히 유지·진행 1줄" |
| M4 | 규칙 1을 `!== 'NO'`로 (미평가도 YES 취급) | (i) safety false, 렌더 "NOT_ASSESSED일 때 안전문구 없음" |
| M5 | 카드 `role="alert"` | `role="status"` / `not alert` 단언 |
| M6 | `aria-pressed={true}` 고정 | 기본 0개 / 1개 pressed 단언 |
| M7 | DATE 비교를 `>` 로 | 당일 due, UNSET-skip due |
| M8 | `k >= n` 오프바이원 | VISIT_COUNT due |
| M10 | UNSET skip 제거 | "이전 plan 사용" |
| A | `open={detailCheckDue !== null \|\| ...}` | doctor-workspace `open=` 고정 단언 |
| B | loop `quickCheck`를 두 번째로 | "quickCheck가 첫 항목" 단언 |
| C | due 줄을 details **뒤로** 이동 | "details 바로 위" 단언 |

`tests/doctor-workspace.spec.mjs`의 소스-문자열 테스트는 실제로 순서·`open=`를 고정한다:
`open=`는 `startsWith`로 attribute 전체를 축자 비교(`>` 절단 함정을 주석으로 설명하며 회피)하고,
loop "맨 앞"은 앞선 `key:` 부재 + 전체 `key:` 2개 이상(배열이 퇴화하지 않았음)의 **양방향**으로,
due 줄 위치는 "사이에 다른 `<details>` 없음"으로 확인한다. vacuous 단언 없음.

## G. 회귀 / 불변식 — PASS

- FROZEN(`src/spec`, `index.html`, `src/App.tsx`, `server/`, `tablet core/`) **vs origin/main zero-diff**.
- 금지 파일 5종(`revisitCarryForward.ts`, `microFollowUp.ts`, `DoctorWorkspace.tsx`,
  `PainWorkspace.tsx`, `persistence.ts`) **delta zero-diff**.
- 변경 파일 10개 전부 §9.2 범위 안(로직 1, 카드 1, 화면 1, 타입 1, CSS 1, 테스트 3, package.json,
  .gitignore). 범위 밖 리팩터 없음.
- 숫자 점수 없음, 태블릿 문항 추가 없음(`src/spec` zero-diff), 자동 열림/자동 전송 없음.
- `test:revisit-quick-check`가 `test:all` 체인에 편입됨(package.json).

## H. 구체적 결함

### 결함 1 (must-fix, 문서) — `computeDetailCheckDue`의 doc comment가 코드와 반대로 서술한다

- 위치: `src/doctor/workspace/revisitQuickCheck.ts:275-277` 및 `:282-283`
- 내용: 주석은 "A visit whose plan is missing, unreadable, or explicitly `UNSET` carries no
  information — **skip it and keep looking**" / "the scan does NOT continue further back past a
  plan that WAS set, only past one that was never set (`UNSET`) **or unreadable**" 라고 적었다.
  그러나 코드 `:297` `if (typeof planRaw.status !== 'string') return null` 은 **unreadable일 때
  건너뛰지 않고 즉시 중단**한다. `tests/revisit-quick-check.spec.mjs:245-254`는 코드 쪽 동작을
  "deliberate"라고 못박고 있으므로, 틀린 것은 주석이다. 이 함수는 신뢰 경계(무인증 PUT)를
  다루는 방어 코드라 주석이 곧 사양 역할을 한다 — 다음 세션이 주석을 믿고 `continue`로 "고치면"
  테스트가 깨지거나, 반대로 테스트를 주석에 맞춰 완화할 위험이 있다.
- 최소 수정: `:275-277`의 "unreadable"을 제거하고, `:282-283`을 실제 동작으로 고쳐 쓴다. 예:
  "skip a visit whose plan is **absent** (`null`/not an object) or explicitly `UNSET`; a plan that
  is present but **unreadable** (non-string `status`) halts the scan and yields `null` — it may have
  superseded the older plan, so falling back to that older plan could report a stale due date."
- 기계적 재확인: `grep -n "unreadable" src/doctor/workspace/revisitQuickCheck.ts` 결과가 위 새 문구와
  일치하고, `npm run test:revisit-quick-check` 106+ assertions PASS 유지.

### 결함 2 (nice-to-have) — 같은 종류의 손상이 두 갈래로 처리된다

- 위치: `revisitQuickCheck.ts:291`(`!isSanitizeRecord(planRaw)` → `continue`) vs `:297`(비문자열 status → `return null`)
- 내용: `nextReassessmentPlan: null`(= 그 방문에 plan이 없음, 서버 기본값
  `server/store.js:517,541`)이 skip되는 것은 정확하다. 그러나 `nextReassessmentPlan: 'garbage'`
  처럼 **null이 아닌 비객체**도 같은 분기에서 skip되어, "plan이 있었지만 못 읽는다"는
  `:297`과 다른 결론에 도달한다. 실질 위험은 낮다(표시만 하는 줄이고, 잘못된 방향은 "더 오래된
  plan을 쓴다"→ 이미 지난 날짜를 due로 표시할 수 있는 쪽).
- 최소 수정(선택): `:291`을 `if (planRaw === null || planRaw === undefined) continue;
  if (!isSanitizeRecord(planRaw)) return null` 로 분리하고, 테스트에
  `[visit('a','not-an-object'), visit('b', dateDuePlan)] → null` 케이스를 추가.
- 기계적 재확인: 위 케이스가 null을 반환하고 기존 106 assertions가 그대로 통과.

### 결함 3 (nice-to-have, a11y/관례) — 제목 레벨 건너뛰기

- 위치: `RevisitQuickCheckCard.tsx:96`(`<h3>`) → `:48`(`<h5>`)
- 내용: 이 저장소의 다른 workspace 카드는 `<h3>` 아래 서브헤딩으로 일관되게 `<h4>`를 쓴다
  (`NextReassessmentPlanCard.tsx:29`, `ExamSuggestionList.tsx:34,48`, `FollowUpTargetPicker.tsx:101`,
  `SupportContradictionPanel.tsx:20,33,46` 등). `<h5>`는 이 파일이 유일하며 h4를 건너뛴다.
- 최소 수정: `<h5>` → `<h4>`, CSS `.workspace__revisit__quickCheckGroup h5` → `... h4`
  (`workspace.css:1804`). 시각 스타일은 그 규칙이 직접 지정하므로 변화 없음.
- 기계적 재확인: `grep -c "<h5" src/doctor/workspace/*.tsx` 가 0.

## 구현자 자기신고 판단 3건에 대한 판정

1. **비문자열 `status`에서 즉시 null (더 오래된 plan을 찾지 않음)** — **fail-safe 방향이 옳다.**
   손상된 plan은 "원장이 그 방문에서 계획을 갱신했다"는 사실 자체는 남기므로, 그것을 건너뛰고
   더 오래된 plan을 쓰면 **이미 대체된 계획을 due로 제시**할 수 있다. 반대 방향의 손해는
   "알림 1회 누락"뿐이고, 이 표시는 아무 것도 자동 실행하지 않으며 `오늘 재검`은 언제나 수동으로
   펼칠 수 있다(`RevisitWorkspace.tsx` details 무변경). 임상 위험 비대칭이 명확하므로 현재 선택 유지 권고.
   단 결함 1(주석)·결함 2(분기 일관성)는 정리할 것.
2. **"이전에 채택한 운동" 이 `<strong>label</strong> value` 형식** — **옳다.** 같은 블록의
   형제 줄들이 정확히 그 형식이다(`RevisitWorkspace.tsx:495`, `:527`, `:539` 대비 `:533-535`).
3. **`.gitignore` 테스트 번들 2줄 추가** — **관례 일치.** 기존 블록과 같은 "주석 1줄 + 산출물"
   형식이며, 두 경로 모두 `package.json`의 새 스크립트가 만드는 산출물과 정확히 일치한다.

## `CLINICAL DECISION REQUIRED`

없음. 이번 delta는 승인된 chip 의미를 벗어나는 임상 판단을 만들지 않는다.

## 관찰 (조치 불요 / 향후 batch 후보)

- **O-1. "악화: 계획 재검토." 의 귀속 모호성** — 규칙 3은 `targetFunctionChange` 또는
  `overallResponse` 중 **하나만** WORSE여도 발화한다(`:211`). 목표 기능은 나빠졌는데 전체 증상은
  좋아진 경우에도 문장은 그냥 "악화"라, 어느 축이 나빠졌는지 화면의 chip을 다시 봐야 안다.
  문장 자체는 브리프 §9.2(b) 축자 인용이므로 **이번 구현의 결함이 아니다.** 문구를
  "목표 기능 악화" / "전체 증상 악화"로 분리하려면 브리프 수정 + PO 확인이 필요하다.
- **O-2. 정체(SAME/SAME)인데 운동 미처방이면 유일한 문장이 "유지·진행 가능"** — 규칙 4가
  `DONE_AS_PLANNED`를 요구하므로, `NOT_PRESCRIBED` + SAME/SAME + NO/NO는 규칙 7로 떨어진다.
  브리프 정의대로이고 "(원장 판단)"이 붙어 있어 과주장은 아니지만, 향후 batch에서
  "운동 처방 없이 정체" 신호를 별도 문장으로 다룰지는 임상적으로 논의할 가치가 있다(숫자 불필요).
- **O-3. 메모 내용은 다음 방문 recap에 실리지 않는다** — `summarizeRevisitQuickCheckKo`는 5개
  chip만 요약한다(`:331-350`). 신경증상 "있음"은 다음 방문에 보이지만 그 **내용**(메모)은 보이지
  않는다. 브리프 §9.2(e)대로이고, chip 사실은 전달되므로 안전상 공백은 아니다.
- **O-4. `DetailCheckDue.sourceVisitCreatedAt`은 계산되지만 화면에 쓰이지 않는다**
  (`:256`, `RevisitWorkspace.tsx:634-639`). "언제 세운 계획인지"를 덧붙이면 유용할 수 있다(선택).
- **O-5. VISIT_COUNT의 `k`는 "요약 가능한" 이전 방문만 센다** — `server/store.js:495,525`가
  레코드 없는 방문/워크스페이스가 전혀 저장되지 않은 재진을 `continue`로 건너뛴다. 따라서
  아무 것도 기록되지 않은 재진은 카운트에서 빠지고, due는 **늦게** 뜰 수는 있어도 이르게 뜨지
  않는다(보수적 방향). 이번 batch가 만든 동작이 아니라 기존 projection의 성질이다.
- **O-6. 안내 문장 `<p>` 전부에 `role="status"`가 붙는다**(`RevisitQuickCheckCard.tsx:164`).
  브리프는 안전 문장에 대해서만 `status`를 지정했다. 규칙 1~6이 동시에 여러 줄을 만들면
  live region이 여러 개 갱신되어 스크린리더가 다소 수다스러워질 수 있다. 위험은 없고,
  줄이려면 안전 문장에만 `role="status"`를 남기면 된다(선택).
- **O-7. `ChipGroup`의 `'NOT_ASSESSED' as T` 캐스트**(`:56`) — 현재 3개 union 모두
  `NOT_ASSESSED`를 포함하므로 안전하지만, 타입 시스템이 그것을 강제하지는 않는다.
  `T extends string` 대신 `T extends 'NOT_ASSESSED' | string`… 형태의 제약을 두면 컴파일 타임에
  보장된다(선택, 지금은 문제 없음).
