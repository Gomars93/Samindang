# Opus Delta Review — LBP v1 Batch 3.1 (재진 화면 잔손질 2건)

- **저장소/브랜치**: `/home/user/Samindang`, `claude/clinical-os-lbp-architecture-xym6po`
- **리뷰 범위 (delta-only)**: `ac614c3`(PO 승인 + 브리프 §10 문서 커밋) → `a57d9db`(구현 1커밋)
- **검토 기준 문서**: `CLAUDE.md`(Team Roles / Implementation Rules), `docs/LBP_PRODUCTION_V1_MINIMAL_ARCHITECTURE_v0.1.md` §10, `DECISIONS.md` 2026-09-03 "PO 승인: Batch 3.1"
- **working tree**: 리뷰 전·후 모두 clean (`git status --porcelain` 빈 출력). 저장소 파일 **무수정** — 모든 뮤테이션은 `/tmp/.../scratchpad/mut`의 하드링크 사본에서만 수행.

## Disposition: **PASS**

concrete defect 0건. 임상 의미(patient-safety semantics) 변경 0건. `CLINICAL DECISION REQUIRED` 없음.
아래 F의 "무조치 관찰" 5건은 모두 정보성이며 merge를 막지 않는다. (단 **O-5**는 closing 전 절차 항목으로 반드시 처리.)

---

## 검증 실행 결과

| 명령 | 결과 |
| --- | --- |
| `npx tsc -b` | exit 0 (무출력) |
| `npm run build` (`tsc -b && vite build`) | ✓ built in 3.03s (chunk-size 경고만, 기존과 동일) |
| `npm run test:revisit-quick-check` | **145 assertions passed** (기존 107 → +38) |
| `npm run test:workspace-round3` | **153 assertions passed** (변화 없음) |
| `npm run test:doctor-workspace` | **232 assertions passed** (기존 227 → +5) |
| `npm run test:doctor-reset-key` | **11 assertions passed** (변화 없음) |

---

## A. 꼬리말(hint) 의미론 — **PASS**

### A-1. 구현 형태 (코드 증거)

- 상수: `src/doctor/workspace/revisitQuickCheck.ts:192` — `REVISIT_QUICK_CHECK_DETAIL_CHECK_HINT = "필요하면 아래 '오늘 재검'을 펼쳐 이전 검사 결과와 비교하세요."` (브리프 §10.1 자구와 일치)
- 플래그: `:212` 선언, `:222`(규칙 2) / `:227`(규칙 3) / `:236`(규칙 4)에서만 `true`
- push: `:250-252` — 규칙 1~6 블록이 **모두 끝난 뒤** 단 1곳에서 `if (detailCheckHintNeeded)` 조건으로 1회 push
- 규칙 7 블록(`:254-265`)은 `lines.length === 0`일 때만 진입하므로 꼬리말과 상호배타 — 구조적으로 규칙 7에 붙을 수 없다

### A-2. 직접 실행 프로브 (bundle 재빌드 후 독립 실행)

브리프가 요구한 케이스 전부 + 추가 케이스:

| 프로브 | hint 개수 | 마지막 줄인가 | safetyRefresh |
| --- | --- | --- | --- |
| 규칙 3 단독 (targetFunctionChange=WORSE) | 1 | ✓ | false |
| 규칙 3 단독 (overallResponse=WORSE) | 1 | ✓ | false |
| 규칙 2+3 (+6 동반) | 1 | ✓ | false |
| 규칙 2+4 | 1 | ✓ | false |
| 규칙 1+2+3+5 (4개 동시 발화) | 1 | ✓ | **true** |
| 규칙 1 단독 | **0** | — | true |
| 규칙 5 단독 (DONE_TOO_HARD) | **0** | — | false |
| 규칙 6 단독 (NOT_DONE) | **0** | — | false |
| 규칙 7 (5개 모두 양호) | **0** | — | false |
| NOT_ASSESSED everywhere (규칙 8) | **0** (lines=[]) | — | false |

### A-3. 전수 검증 (exhaustive)

5개 칩의 전 조합 **1,152가지**를 직접 돌려, "hint 개수 == (규칙2 ∨ 규칙3 ∨ 규칙4 발화 여부)" 및 "hint가 있으면 항상 마지막 줄"을 확인:

```
EXHAUSTIVE over 1152 combos: rule3 fired=504, rule4 fired=12, BOTH=0,
hint expectation violations=0, duplicates=0
```

→ **정확히 1회, 항상 마지막, 규칙 1/5/6/7 단독에는 절대 없음**이 전수로 성립.

### A-4. `safetyRefreshSuggested` 및 기존 자구 불변

`deriveRevisitQuickCheckGuidance` 본문에서 push되는 문자열/대입문을 두 리비전에서 추출해 비교한 결과, 기존 8개 항목이 **바이트 단위로 동일**하고 새 push 1건만 추가됨:

```
ac614c3: safetyRefreshSuggested=false / =true / SAFETY_LINE / 치료 후 이상반응… / 악화… /
         계획대로 시행했는데… / 운동이 어려움… / 운동이 쉬움… / 운동 시행 부족… / 유지·진행…
a57d9db: (위와 동일) + lines.push(REVISIT_QUICK_CHECK_DETAIL_CHECK_HINT)  ← 유지·진행 앞 1줄만 추가
```

`git diff ac614c3..a57d9db -- src/doctor/workspace/revisitQuickCheck.ts`에서 규칙 1/5/6/7 리터럴 또는 `safetyRefreshSuggested`를 건드리는 `+`/`-` 줄은 **0건**(유일한 매치는 주석 문장 1줄).

### A-5. 임상적 판단 (한국어 자구)

> "필요하면 아래 '오늘 재검'을 펼쳐 이전 검사 결과와 비교하세요."

- **"필요하면"**이 문두에 있어 조건부 권유로 읽힌다. "하세요"는 종결어미지만 선행 조건절이 판단 주체를 원장에게 남기므로, "세부 검사를 반드시 해야 한다"는 지시로 읽히지 않는다. 기존 규칙 문장들이 이미 "…고려.", "…재검토." 같은 권유형인 것과 톤이 어긋나지 않는다.
- **"비교하세요"**의 대상이 "이전 검사 결과"로 명시되어 있어, 새 검사를 시행하라는 지시가 아니라 **이미 기록된 것을 열어 보라**는 안내임이 분명하다. 실제로 `StructuredReassessmentCard.tsx:37,50`이 "원장이 이전에 기록한 소견 — 오늘 결과 아님" 배지와 "이전 소견: …"을 렌더하므로 문구가 화면 내용과 정확히 일치한다.
- **"아래"**의 방향 표현도 정확: `RevisitQuickCheckCard`는 `RevisitWorkspace.tsx:662`, 오늘 재검 `<details>`는 `:700`으로 DOM상 실제로 아래에 있다.
- **환자안전 의미 변화: 없음.** 이 줄은 (i) 새로운 임상 규칙·threshold를 만들지 않고, (ii) `safetyRefreshSuggested`를 건드리지 않으며, (iii) 카드에서 `workspace__revisit__quickCheckGuidance__line`(일반 안내 클래스)로 렌더된다 — 안전문구 전용 클래스 `workspace__revisit__safetyNotice`는 `RevisitQuickCheckCard.tsx:166`에서 `line === REVISIT_QUICK_CHECK_SAFETY_LINE`일 때만 부여되므로 꼬리말이 안전 경고처럼 승격되지 않는다. `role="status"`(≠`role="alert"`)도 그대로.
- **알림 피로 관점**: 규칙 1 단독일 때 붙지 않는 것은 임상적으로 옳다(신경증상은 이미 더 강한 지시가 있고, 꼬리말이 그 아래 붙으면 강도를 희석시킨다). 규칙 1이 2/3/4와 **함께** 발화하면 꼬리말이 붙는데(A-2의 "1+2+3+5" 케이스), 이는 브리프 "규칙 2/3/4 중 하나라도 발화하면"과 일치하고, 안전문구가 항상 `lines[0]`로 먼저 오므로 우선순위 역전도 없다.

---

## B. 채택 운동 원천(adopted-exercise source) — **PASS**

### B-1. `findLatestSubmissionBackedPriorVisit` (`longitudinal.ts:191-204`)

| 요구 | 확인 |
| --- | --- |
| 최신순 선두부터 스캔, 첫 유효 원소 반환 | `:194-201` for-of + 즉시 `return` — 테스트 `[initial, initial] → index 0` 통과 |
| 비배열 입력 | `:194` `asPriorVisitArray`(`:80-82`)가 `Array.isArray` 아니면 `[]` → `null`. `undefined/null/'not-an-array'/42/{}` 5종 모두 throw 없이 null |
| null/비레코드 원소 | `:196` `isRecordLike` → `continue` (skip-and-**continue**) |
| `submissionId` 비문자열·빈문자열 | `:198` → `continue` |
| `visitId` 비문자열 | `:200` → `continue` |
| throw 금지 | 전 경로에 예외 발생 지점 없음 (프로퍼티 접근은 모두 record 확인 후) |

### B-2. `RevisitWorkspace.tsx` 배선

- **cross-patient stale-data 안전**: `setRehabSourceSubmission(null)`이 `:264`, 즉 `setPriorHistory/setPriorSubmission/setPriorVisitWorkspace(null)`(`:262-263`)와 **동일한 동기 리셋 블록** 안, `async function load()` 선언(`:271`) **이전**에 위치. Round-7 리뷰가 만든 "실패해도 이전 환자 데이터가 남지 않는다" 계약을 그대로 상속.
- **재사용(추가 fetch 없음)**: `:311` `const rehabSource = findLatestSubmissionBackedPriorVisit(historyResult.data.visits)` → `:313` `if (latest && rehabSource.visitId === latest.visitId && latestSubmission)` → `:314-316` 이미 받아둔 `latestSubmission`으로 setState. 이 분기 안에 `getSubmission` 호출 **없음**.
- **추가 fetch는 정확히 1회**: `:318` else 분기의 `await getSubmission(rehabSource.submissionId)` 한 번뿐. 루프·재시도 없음.
- **`cancelled` 가드**: 재사용 분기 `:314` `if (!cancelled)`, 추가 fetch 분기 `:319` `if (!cancelled && rehabSubmissionResult.ok)` — 다른 load-effect fetch와 동일 규약.
- **실패 시 조용히 없어짐**: `getSubmission`은 `serverClient.ts:180` → `request()`(`:62-102`)가 network/timeout/HTTP-error/JSON-parse 실패를 **전부 catch해 `{ok:false}`로 반환**하므로 reject 경로가 없다. 따라서 실패 시 `rehabSourceSubmission`은 null로 남아 해당 줄만 사라지고, `loadError`(=`load().catch()` 경로, `:333-338`)는 **발동하지 않는다**. 다른 recap 줄(`examLines/observationLines/carePlanLines`, targets, plan)은 이 분기 이전에 이미 setState되었으므로 영향 없음.
- **`priorSubmission` 의미 불변**: `:288-292` — 여전히 `latest?.submissionId`가 있을 때만 set. 직전 방문이 재진이면 null 그대로. 새 코드는 `latestSubmission` **지역 변수**만 추가로 채우고 `setPriorSubmission` 호출 지점을 바꾸지 않았다.
- **carry-forward 원천 불변**: `:461-465`의 `carryForwardSourceFromSubmission(priorSubmission)` / `carryForwardSourceFromVisitWorkspace(priorVisitWorkspace)` 분기는 diff에 등장하지 않으며 `revisitCarryForward.ts`는 zero-diff.
- **title은 `deserializeWorkspaceState`만 경유**: `:156-159` `acceptedRehabTitlesFromSubmission`이 `deserializeWorkspaceState(sub.workspace)`를 거친 뒤 `painRehabSuggestions` 필터. raw PUT body 직접 읽기 없음. `persistence.ts:313` → `sanitizeRehabSuggestion`(`:123-131`) → `sanitizeShape(REHAB_SUGGESTION_TEMPLATE, …)`이므로 `title`은 항상 string으로 degrade된다(손상 값이 그대로 렌더될 수 없음).
- **라벨의 날짜·출처 명시**: `:587` `이전에 채택한 운동({readablePriorVisitDateLabel(rehabSourceSubmission?.createdAt)} 초진)`. 소스 방문 자신의 `createdAt`을 쓰므로 몇 회차 전이든 정확하다. 상위 섹션 헤더가 `:510` "이전 방문 참고 · 읽기 전용 · **오늘 데이터로 표시하지 않습니다**"이고, `getPatientHistory(patientId, visitId)`가 "현재 보고 있는 방문은 절대 포함하지 않는다"(`longitudinal.ts:41`)를 계약으로 갖고 있으므로 **오늘 데이터로 오독될 여지가 없다**.

### B-3. 구현자 선언 판단 (2) — skip-and-continue 방향에 대한 판정

`visitId`가 비문자열인(손상된) 초진 방문을 건너뛰고 계속 스캔하면, 더 오래된 초진의 운동 목록이 표시될 수 있다.

**판정: 수용 가능(변경 불필요).** 근거:
1. 이 줄은 **읽기 전용 참고 정보**이며 처방·오더가 아니다. 원장이 오늘 채택할 운동은 별도 UI에서 직접 고른다.
2. 라벨이 **소스 방문 날짜를 항상 동반**한다. 오래된 것이 표시되어도 원장이 "며칠 자 것"인지 즉시 본다 — 무날짜 표시였다면 위험했을 것이나 그렇지 않다.
3. 반대 방향(손상 만나면 `return null`)은 **줄 전체를 조용히 감춘다** — 그것이 바로 Batch 3.1이 고치려는 결함(§10.2 "초진에서 채택한 운동이 화면에서 사라진다")이다. fail-safe 방향이 "감춤"이 아니라 "더 오래된 확실한 사실 표시"인 편이 이 화면의 목적에 맞다.
4. 이 함수는 값을 **지어내지 않는다**. 손상 레코드를 부분 복구해 반환하는 대신 통째로 건너뛰므로, 표시되는 것은 언제나 검증된 실제 레코드다.
5. 트리거 확률도 낮다: `visitId`는 서버가 생성하는 UUID이며(`server/store.js:315` `createVisit`), 손상은 수기 LAN PUT/레거시에서만 상정된다.

---

## C. 자동 열기 없음 / 범위 확대 없음 — **PASS**

- `<details open=…>`: `RevisitWorkspace.tsx:700`이 여전히 정확히 `open={workspaceState.reassessment.items.length > 0}`. `git diff ac614c3..a57d9db -- RevisitWorkspace.tsx | grep 'open='` → **0건**. 꼬리말은 평문 1줄일 뿐 어떤 `<details>`도 열지 않는다(A-1).
- `VisitWorkspaceState` 새 필드 없음: `visitWorkspace.ts`, `persistence.ts` 모두 zero-diff (E 참조). 새 state `rehabSourceSubmission`은 **React 컴포넌트 로컬 state**이지 저장 스키마가 아니며, 저장 경로(`lastSavedRef`/`putVisit`)에 진입하지 않는다.
- 카드 UI 변경 없음: `RevisitQuickCheckCard.tsx` zero-diff.
- threshold 없음: 꼬리말 조건은 기존 규칙 2/3/4 조건의 **순수 논리합**이고 새 숫자/경계값이 없다. `findLatestSubmissionBackedPriorVisit`도 "첫 유효 원소" 외 판단이 없다(개수 제한·기간 제한 없음).
- 새 태블릿 문항 없음: `src/spec`, `index.html`, `src/App.tsx` origin/main 대비 zero-diff (E).

---

## D. 테스트 비공허성(non-vacuity) — **PASS** (뮤턴트 16종 전부 검출)

스크래치 하드링크 사본(`/tmp/.../scratchpad/mut`)에서만 소스를 변형하고 esbuild 번들을 재생성해 실행. 저장소는 리뷰 전후 clean.

### D-1. §10.1 꼬리말 (`tests/revisit-quick-check.spec.mjs`)

| 뮤턴트 | 검출한 assertion |
| --- | --- |
| M1 hint를 2번 push | `§10.1 rule 3 alone: hint appears exactly once`, `rules 2+3 together: … exactly once`, `rules 2+4 together: … exactly once` (+ 규칙2/4 line-count 2건) — **총 6 FAIL** |
| M2 hint 뒤에 다른 줄 추가 (마지막 아님) | `rule 3 alone: hint is the last line`, `rules 2+3 together: hint is still the last line`, `rules 2+4 together: …` — **5 FAIL** |
| M3 규칙 1도 플래그 set | `§10.1 rule 1 alone: hint absent (neuro alone is not 2/3/4)` (+ 기존 mutation-resistance (ii)) — 2 FAIL |
| M4 규칙 5도 플래그 set | `§10.1 rule 5 alone: hint absent` — 1 FAIL |
| M5 규칙 6도 플래그 set | `§10.1 rule 6 alone: hint absent` — 1 FAIL |
| M6 규칙 7에도 hint push | `§10.1 rule 7 case (유지·진행): hint absent` (+ 기존 mutation-resistance (iii)) — 2 FAIL |
| BASELINE(무변형) | FAIL 0 |

→ "정확히 1회" / "항상 마지막" / "규칙 1·5·6·7에는 없음" 세 성질 모두 **각자의 반례에서 실제로 실패**한다.

### D-2. §10.2 `findLatestSubmissionBackedPriorVisit`

| 뮤턴트 | 검출 |
| --- | --- |
| L1 빈문자열 `submissionId` 체크 제거 | `an empty-string submissionId is skipped (never treated as a real id)` |
| L2 `isRecordLike` 가드 제거 | `TypeError: Cannot read properties of null` — 스위트 크래시(=실패) |
| L3 비레코드에서 `continue` → `return null` | `a leading null element is skipped in favor of the real initial visit behind it` |
| L4 비문자열 `visitId` 가드 제거 | `a non-string visitId is skipped in favor of the real initial visit behind it` |
| L5 `asPriorVisitArray` 제거 | 비배열 4종 × (throw/null) = **8 FAIL** |
| L6 비문자열 `submissionId`에서 `continue` → `return null` | `[revisit, revisit, initial] finds the initial visit` + TypeError |

### D-3. 소스 문자열 검사 (`tests/doctor-workspace.spec.mjs`) — 4개 요구 항목 전부 pin

| 뮤턴트 | 검출한 assertion |
| --- | --- |
| W1 리셋 블록에서 `setRehabSourceSubmission(null)` 제거 | `setRehabSourceSubmission(null) is called in the reset block` |
| W2 재사용 분기를 재fetch로 교체 | `the reuse branch uses latestSubmission and calls NO getSubmission at all` |
| W3 `priorVisitRecapLines` 반환에 `acceptedRehabTitles` 재추가 | `priorVisitRecapLines() no longer returns acceptedRehabTitles …` |
| W4 `<details … open>` 무조건 열기 | `open= is exactly open={workspaceState.reassessment.items.length > 0}, attribute-for-attribute unchanged` |
| W5 라벨에서 `readablePriorVisitDateLabel` 제거 | `the label text exists` |
| W6 추가 fetch 분기의 `cancelled` 가드 제거 | `the extra-fetch branch guards its setRehabSourceSubmission with both cancelled and .ok` |
| BASELINE | 232 passed |

W3 테스트가 doc comment가 아니라 **return 문 자체**를 잘라 검사하고(`src.slice(fn2ReturnIdx, 다음 개행)`), 동시에 `acceptedRehabTitlesFromSubmission`이 존재함을 요구해 "기능이 통째로 사라진 것과 구분"하는 설계도 확인했다.

### D-4. 구현자 선언 판단 (1) — 규칙 3·4 상호배타성

**코드로 확인됨.** 규칙 3(`:225`)은 `targetFunctionChange === 'WORSE' || overallResponse === 'WORSE'`, 규칙 4(`:230-234`)는 `targetFunctionChange === 'SAME' && overallResponse === 'SAME'`. 같은 두 필드에 대해 `WORSE`와 `SAME`은 배타적 열거값이므로 동시 성립 불가. **전수 1,152조합 스캔에서 `BOTH=0`**(A-3)로 실증.

→ 브리프의 "2+3+4 동시" 프로브는 **구성 불가능한 케이스**이며, 대체 커버리지("2+3", "2+4")는 브리프가 실제로 요구한 성질(여러 규칙이 동시 발화해도 꼬리말이 규칙 수만큼 늘지 않는다)을 완전히 커버한다. **충분하다고 판정.** 추가로 본 리뷰가 직접 돌린 "1+2+3+5(4개 동시 발화)"에서도 hint=1, 마지막 줄 유지가 확인되어 커버리지에 빈 곳이 없다.

---

## E. 불변식(Invariants) — **PASS**

```
$ git diff --stat origin/main -- src/spec index.html src/App.tsx server "tablet core"
(빈 출력)                                    ← FROZEN zero-diff ✓  (origin/main = 01dac63)

$ git diff --stat ac614c3..a57d9db -- \
    revisitCarryForward.ts microFollowUp.ts persistence.ts DoctorWorkspace.tsx \
    PainWorkspace.tsx RevisitQuickCheckCard.tsx visitWorkspace.ts
(빈 출력)                                    ← 참조 파일 zero-diff ✓
```

delta 전체 파일 목록(7개)도 브리프 §10 범위와 정확히 일치:
`.gitignore(+1)`, `package.json(±1)`, `RevisitWorkspace.tsx(+86)`, `longitudinal.ts(+35)`, `revisitQuickCheck.ts(+21)`, `tests/doctor-workspace.spec.mjs(+105)`, `tests/revisit-quick-check.spec.mjs(+174)`.

**`.gitignore` 관례**: 추가된 `tests/.revisit-quick-check-longitudinal-bundle.mjs`가 기존 주석 그룹
`# esbuild bundles used by tests/revisit-quick-check.spec.mjs (regenerated, not source)` 바로 아래, 같은 그룹의 두 항목 뒤에 붙었다 — 파일 내 기존 컨벤션과 동일. ✓
`package.json`의 `test:revisit-quick-check`도 기존 esbuild 체인 끝에 번들 1개만 추가하는 최소 변경. ✓
환자 데이터/시크릿 관련 신규 경로 없음, `.data/`·`.env` 관련 변경 없음. ✓

---

## F. 구체적 결함

### **없음 (0건).**

---

## 무조치 관찰 (no-action observations)

**O-1. 직전 방문 submission fetch가 실패하면 같은 `submissionId`를 한 번 더 fetch한다.**
`RevisitWorkspace.tsx:313`의 재사용 조건에 `&& latestSubmission`이 포함되어 있어, `getSubmission(latest.submissionId)`가 `{ok:false}`로 실패하면 `latestSubmission`이 null이 되고 → else 분기(`:318`)에서 **동일한 id로 1회 더** 호출된다. 결과적으로 "실패 시 1회 재시도"가 되어 오히려 이 줄이 살아남을 확률이 올라간다. 추가 호출은 최대 1회이고 다른 상태를 오염시키지 않으므로 결함이 아니다. (수정 불필요; 굳이 없애려면 `latest.submissionId === rehabSource.submissionId`로 비교하면 되지만, 현행이 더 낫다고 본다.)

**O-2. 3회차 이후 재진에서 로딩 스피너가 직렬 왕복 1회만큼 길어질 수 있다.**
추가 `getSubmission`이 `setLoading(false)`(`:325`) 이전에 `await`된다. 최악의 경우 `TIMEOUT_MS`만큼 지연. 클리닉 LAN 전제이고, 기존 초진-직전 경로도 이미 동일하게 직렬 await하므로 새로운 종류의 문제는 아니다.

**O-3. 라벨의 "초진"은 엄밀히는 "태블릿 문진 방문"을 뜻한다.**
`server/store.js:315`에서 **모든** 태블릿 제출이 submission-backed visit을 만든다. 규칙 1의 안전문구가 권하는 "재초진 문진(태블릿)"을 수행하면 그 방문도 submission-backed가 되어, 이 함수가 그것을 최신 소스로 잡고 라벨에 "초진"이라 적는다. 브리프 §10.2가 자구를 명시했고 날짜가 함께 표시되어 오독 위험이 실질적으로 없으므로 그대로 두어도 무방하다. 다음 batch에서 자구를 다듬는다면 "초진" → "문진" 정도가 더 정확하다. **임상 안전 영향 없음, PO 결정 사항 아님.**

**O-4. 최신 submission-backed 방문에 채택 운동이 없으면 줄이 사라진다(더 오래된 초진으로 내려가지 않는다).**
`findLatestSubmissionBackedPriorVisit`는 "최신 submission-backed 방문 1개"만 찾고, 그 방문의 채택 목록이 비면 `acceptedRehabTitles=[]`가 되어 렌더되지 않는다. 이는 의도된 동작이자 임상적으로 옳다 — 재문진으로 갱신된 최신 처방을 건너뛰고 낡은 처방을 되살리는 편이 더 위험하다. (여러 방문의 합집합을 만들지 않는 것도 §10.4 "새 규칙 없음"에 부합.)
또한 `priorHistory.visits[0]` 자체가 손상되면 `latestPrior`가 null이 되어(`:426-429`) "이전 방문 참고" 섹션 전체가 빈 상태로 렌더되고 이 줄도 나오지 않는다 — 기존 게이팅이며 fail 방향이 "감춤"이라 안전하다.

**O-5. (절차) `HANDOFF.md`가 아직 Batch 3 CLOSED 상태(HEAD `bd58cb0`)를 가리킨다.**
실제 HEAD는 `a57d9db`. `CLAUDE.md`의 "HANDOFF와 Git이 어긋나면 Git이 맞다 — 발견 즉시 고친다" 및 Definition of Done에 따라, **closing 전에 `HANDOFF.md`를 Batch 3.1 상태로 갱신**해야 한다. delta 리뷰 시점(구현 1커밋 직후)에는 정상적인 미완 항목이므로 이번 PASS를 막지 않는다.

---

## CLINICAL DECISION REQUIRED

**없음.** 두 변경 모두 (i) 새 임상 규칙·threshold·자동 동작을 도입하지 않고, (ii) 안전 문구·`safetyRefreshSuggested`·자동 열기 동작을 그대로 두며, (iii) 표시되는 모든 정보가 원장이 이전에 직접 기록한 사실 + 그 날짜뿐이다. PO가 §10에서 승인한 범위를 벗어나지 않는다.
