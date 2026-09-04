# Opus closing review — LBP v1 Batch 4 fix delta (`61dca0a..9bad12a`)

**Repo**: `/home/user/Samindang`, branch `claude/clinical-os-lbp-architecture-xym6po`,
HEAD `9bad12a`. Working tree clean before and after this review; **no repository
file was modified**. All mutants were built in a throwaway `git archive 9bad12a`
copy under `/tmp/.../scratchpad/mrepo`, run, reverted, and the whole copy deleted.

**Delta under review**: `7219f2c` (implementer, defects 1–10 · 12) +
`9bad12a` (Fable, docs only — defect 11 partially + a new `CLAUDE.md` rule).

---

## Closing disposition: **FAIL**

**직전 FAIL의 12건 중 9건은 완전히 닫혔다.** 특히 이 batch의 유일한 임상 안전
항목인 `O` 경계는 이제 **네 절이 전부 켜진 상태에서 정확일치로 고정**되고, 내가
지난번에 살려 보냈던 M6·M6b는 물론 이번에 새로 만든 **세 번째 누출 경로(M6c)까지
전부 죽는다.** 복사 경로도 herbal·mixed 양쪽에서 실제로 비지 않는다(실측).

FAIL 사유는 **fix 커밋이 defect #2와 똑같은 형태의 손실을 herbal 프로필에 새로
만들었다**는 것이다. defect #1을 option (a)로 풀면서 herbal 레코드를
`emrSummary.ts` 경로에서 떼어냈는데, 그 자리를 대신한
`buildHerbalWorkspaceEmrPreview`에는 **원장이 JudgmentPanel에 직접 타이핑하는 3필드가
들어갈 자리가 없다.** 즉 pain에서 고친 바로 그 회귀가 herbal에서 다시 열렸다 —
그리고 이것은 `9bad12a`가 방금 `CLAUDE.md`에 추가한 규칙("지우기 전에 그 경로를
쓰는 모든 화면을 확인한다")이 잡았어야 할 네 번째 사례다.

**공정하게 적어 둔다: option (a)는 내(delta review)가 권고한 선택지였고, 그 권고
문안에 "herbal 쪽 3필드 보존"을 적지 않은 것은 구현자가 아니라 리뷰어의 누락이다.**
그렇더라도 결과는 원장 타이핑 값의 조용한 손실이고, 그것을 잡는 것이 closing
review의 자리다.

나머지는 MEDIUM 1건 + LOW 3건. 전부 국소 수정으로 닫힌다.

**실행 결과 (전부 PASS, 단언 수 순증)**

| 스위트 | 61dca0a | 9bad12a |
|---|---|---|
| `npx tsc -b` | exit 0 | **exit 0** |
| `test:emrSummary` | 14 | **14** |
| `test:doctor-workspace` | 272 | **274** |
| `test:workspace-round3` | 179 | **179** |
| `test:lbp-working-hypothesis` | 231 | **239** |
| `test:crm-schema` | 95 | **95** |
| `test:doctor` | 947 | **960** |

---

## A. 직전 12개 defect의 처리 판정

### 1. [HIGH] 빈 종결 상자 + 빈 문자열 "복사됨" + herbal 카드의 복사 경로 상실 — **RESOLVED** (단, 이 수정이 새 HIGH를 낳음 → C-1)

요구된 다섯 가지를 **제어흐름 추적 + 실측**으로 각각 확인했다.

**(a) 녹음 없는 herbal-only 레코드가 비어 있지 않은 종결 텍스트를 낸다 — 확인.**
`DoctorView.tsx:3215-3219`의 dispatcher가 `viewProfile === 'herbal'`을
`buildHerbalEmrTextForRecord()`(`:3198-3209`)로 보내고, 그 함수는
`deserializeWorkspaceState(selectedRecord?.workspace)` 위에서
`buildHerbalWorkspaceEmrPreview`를 부른다. recorder 결과는 이 경로 어디에도
등장하지 않는다 — `recorderResults`를 읽던 옛 seed effect는 삭제됐다.
실측(완전 빈 workspace, `deserializeWorkspaceState(undefined)`):

```
"상담 목적: 소화불량\r\n설진/맥진/복진 소견:\r\n최종 변증·병기:\r\n치법:\r\n
 처방/계획 메모:\r\n추적할 증상:\r\n오늘 재검 소견:\r\n최종 재평가:\r\n관리 목표:\r\n
 처방/한약 계획:\r\n집·생활 관리:\r\n이상반응 안내:\r\n다음 방문 확인:\r\n
 재평가 대상:\r\n다음 상세 재평가:"      (15줄, trim() 비어 있지 않음)
```

`primaryConcern`까지 `null`인 최악 케이스도 15줄 라벨이 남아 `trim() !== ''`이다.
**어떤 workspace 상태로도 herbal 종결 텍스트를 빈 문자열로 만들 수 없다.**

**(b) mixed가 pain 6키 블록 뒤에 herbal 블록을 낸다 — 확인.**
`DoctorView.tsx:3217`이 `` `${pain}\r\n\r\n${herbal}` ``. 실측:

```
"C/C: 요통\r\nO/S:\r\nS:\r\nO:\r\nA:\r\nP:\r\n\r\n상담 목적: 소화불량\r\n설진/…"
```

순서(pain 먼저)·구분(CRLF+CRLF 빈 줄) 모두 서술과 일치.

**(c) `handleRebuildEmrSummary`가 같은 분기를 탄다 — 확인.**
`DoctorView.tsx:3263-3267`이 `buildEmrTextForRecord()` 하나만 부르고 그 결과를 새
seed 기준점으로 남긴다. 옛 `if (!recorderResults?.[0]) return` 무동작 경로는 삭제됐다.
뮤턴트 `MherbalDispatch`(dispatcher에서 herbal 분기 1줄 삭제) → **KILLED**:
`FAIL: defect #1: the dispatcher routes viewProfile === 'herbal' to buildHerbalEmrTextForRecord()`.

**(d) 복사 버튼이 빈 문자열에 "복사됨"을 낼 수 없다 — 확인, 이중 가드.**
`DoctorView.tsx:3275-3278` `if (!emrText.trim()) { setCopyStatus('error'); return }`
(`'copied'`에 도달하기 전에 반환) + `:3921-3926` `disabled={!emrText.trim()}`.
뮤턴트 `M1revert`(disabled prop 제거) → **KILLED**:
`FAIL: defect #1: the 종결 EMR용 복사 button is disabled whenever emrText is empty`.
덧붙여, 종결 섹션(`nextLaneFooterNode`)은 `DoctorWorkspace`에 prop으로 전달되고
그 `DoctorWorkspace`는 `!payloadShapeOk` 게이트(`:4237`) 안쪽에서만 렌더되므로,
주석이 "defence in depth"로 든 malformed 레코드 경우에는 애초에 이 상자 자체가
화면에 없다. 가드는 정확하고, 지금은 도달 불가 — 무해한 과잉 방어다.

**(e) `buildHerbalWorkspaceEmrPreview` §14.7 무수정 — 확인, 바이트 동일.**
`dd60c0e`판과 `9bad12a`판의 함수 본문을 추출해 `diff` → **완전 동일**.
새 herbal 경로는 이 함수를 *부르기만* 하고 손대지 않았다.

**(f) 재확인 요청 항목 — "herbal 카드가 유일한 복사 경로를 잃은 것이 이제 덮였는가":
서버 모드 + `patient_id` 있는 레코드에서는 **덮였다.** 종결이 herbal 텍스트를
실제로 조립하므로 `EmrPreviewCard.tsx:26`의 안내문이 herbal 카드에서도 사실이 됐다.
**덮이지 않은 잔여 상태가 하나 남아 있다** → C-5(LOW): 종결 섹션은
`mode === 'server' && selectedRecord?.patient_id`일 때만 렌더되므로,
fixtures/preview 모드와 `patient_id`가 없는 레거시 레코드에서는 안내문이 존재하지
않는 곳을 가리키고 복사 버튼도 없다. 다만 **그 상태에서 상자가 비는 일은 없고
"복사됨" 거짓 신호도 없다** — 미리보기 textarea를 손으로 선택해 복사할 수는 있다.
defect #1의 위험한 절반(거짓 성공 신호)은 완전히 사라졌다.

### 2. [HIGH] 원장 타이핑 3필드 누락 — **RESOLVED** (pain/mixed 한정)

`emrPreview.ts:204-206`에 optional 입력 3개가 추가되고, 각각
`A`(`:257-262` `원장 평가:` / `치료/처방 방향:`)와 `P`(`:276-278` `진료 계획:`)에만
push된다. `DoctorView.tsx:3187-3189`가 `selectedRecord?.judgment`의 세 필드를 넘긴다.

**`O`에 도달할 수 있는가 — 불가능. 전수 근거 + 뮤턴트.**
`oParts`에 push하는 지점은 여전히 정확히 4곳(`emrPreview.ts:215`, `:224-229`,
`:230-231`, `:232-235`)이고 세 신규 입력은 그 어느 절의 식에도 나타나지 않는다.
`oParts`는 지역 배열이며 `:306`에서 한 번만 읽힌다. 내가 만든 누출 뮤턴트
**MD2leak**(`객관적 근력저하` 절 뒤에
`if (input.clinicianJudgmentAssessment?.trim()) oParts.push(...)` 추가) → **KILLED**:
`FAIL: §14.1 filled example (defect #6, all 4 O clauses populated): O carries the
clinician exam finding + directional response + today's reassessment finding + the
objective-motor-deficit finding, and nothing patient-reported`.

**빈 값이 절을 생략하는가 — 확인(실측).** `''` / `'   '` / `'\n\t '` / `null` /
`undefined` 다섯 입력 전부에서 출력은
`"C/C: 요통\r\nO/S:\r\nS:\r\nO:\r\nA:\r\nP:"` — `원장 평가:` 같은 빈 라벨이 남지
않는다(`?.trim()` 가드가 세 곳 모두에 있다).

**한계 — 이 수정은 pain composer에만 적용됐다.** herbal-only 레코드에서 같은 세
필드가 다시 갈 곳을 잃었다 → **C-1**.

### 3. [MEDIUM] chip 그룹이 `<label>` 안 — **RESOLVED**

`FinalAssessmentCard.tsx:148`이 `<div className="workspace__finalAssessment__field
workspace__finalAssessment__field--intervention">`, 닫힘 `:191`. 캡션 `<span>`은
그대로이고 chip 그룹은 자체 `aria-label`, 기타 칸도 자체 `aria-label`을 유지하므로
접근성 손실 0. 저장소의 다른 chip 행(`ExamSuggestionCard` / `StructuredReassessmentCard`)
패턴과 일치.
뮤턴트 `M3revert`(`<div>`→`<label>` 원복, 여는·닫는 태그 동시) → **KILLED**:
`AssertionError [ERR_ASSERTION]: the 시행/예정 처치 field wrapper (or any of its
ancestors) must never be a <label> element` (`1 !== 0`).
새 테스트는 조상 체인 전체를 훑으므로, 바깥 어딘가에 `<label>`을 다시 두는
변형도 잡는다.

### 4. [MEDIUM] 종결 textarea 수동 편집이 autosave에 덮어써짐 — **RESOLVED WITH ISSUE**

**구현은 정확하다.** `DoctorView.tsx:3230-3244`:

```
const recordId = selectedRecord?.id ?? null
const generated = buildEmrTextForRecord()
if (emrSeedRef.current.recordId !== recordId) { …무조건 재seed…; return }
if (emrText === emrSeedRef.current.lastGenerated) { …재seed… }
```

- **수동 편집이 autosave를 견디는가 — 예.** 원장이 타이핑 → `setEmrText(typed)`
  (ref의 `lastGenerated`는 그대로) → autosave가 `setSelectedRecord(result.data)`
  (`:4315`)로 `updated_at`을 올림 → effect 재실행 → `recordId` 동일이므로 두 번째
  분기 → `typed !== lastGenerated` → **skip**. 편집 보존.
  effect 클로저는 매 렌더 새로 만들어지므로 여기서 읽는 `emrText`는 stale이 아니라
  "deps가 바뀐 그 렌더 시점의 값"이다 — 비교는 의도대로 성립한다.
- **다른 레코드로 전환하면 재seed하는가 — 예.** 목록으로 돌아가면
  `setSelectedId(null)` → `selectedRecord = null` → `:3103` effect가
  `emrText=''` + `emrSeedRef={null,null}`로 리셋 → B를 열면 `recordId 'B' !== null`
  → **무조건 재seed**. 편집 여부와 무관하다.
- 「요약 다시 만들기」(`:3263-3267`)가 명시적 escape hatch로 남아 있고, 재생성값을
  새 기준점으로 기록해 다음 autosave가 그것을 "편집 안 됨"으로 보게 한다. 정확.

**ISSUE — 이 fix의 회귀 가드가 절반은 공허하다.**
`tests/doctor.spec.mjs`의 세 단언 중 세 번째,
`firstIfIdx < firstSetEmrTextIdx`("setEmrText가 effect의 첫 문장이 아니다")는
effect 본문이 항상 `if (!payloadShapeOk) return`으로 시작하므로 **어떤 변형에서도
실패할 수 없다.** 내가 만든 미세 뮤턴트 **M4subtle**:

```
const generated = buildEmrTextForRecord()
setEmrText(generated)            // ← 이 한 줄만 추가 (ref 로직은 그대로 남겨둠)
```

는 defect #4를 완전히 되돌리면서도 `test:doctor` **960 assertions passed, 0 failed
— SURVIVED**. (문자열 `emrSeedRef.current.recordId`와
`emrText === emrSeedRef.current.lastGenerated`가 소스에 남아 있기만 하면 나머지 두
단언도 통과한다.)
보고서가 명시한 재확인 기준("가드를 제거하면 실패해야 한다")은 정직한 제거
뮤턴트 `M4revert`(ref 로직 전체를 `setEmrText(buildEmrTextForRecord())` 한 줄로
치환)에서는 충족된다 — **KILLED**:
`FAIL: defect #4: the 종결 EMR seed effect exists, keyed on […]`.
따라서 기준 자체는 만족하나, 가장 자연스러운 재발 형태를 놓친다 → **C-3**.

### 5. [MEDIUM] §14.6이 요구한 테스트 부재 + 거짓 주석 — **RESOLVED WITH ISSUE**

`tests/doctor-workspace.spec.mjs`의 주석이 정정되어 이제 `tests/doctor.spec.mjs`의
실재하는 블록을 가리킨다. 그 블록(`tests/doctor.spec.mjs`, 13개 신규 단언)은
(a) `EMR용 복사`가 `DoctorView.tsx`에 정확히 1회, `EmrPreviewCard`에는 0회(주석 제외),
(b) disabled 가드, (c) rebuild→dispatcher→herbal 라우팅, (d) seed ref 가드,
(e) 두 호출부 인자 키 집합 비교를 소스 텍스트로 고정한다.
저장소 전체 `grep "EMR용 복사" src/` = **2건(주석 1 + 버튼 1)** → 실 버튼 1개.
뮤턴트 `MdropKey`(종결 호출에서 `microFollowUpText:` 한 줄 삭제) → **KILLED**:
`FAIL: defect #5 (ii): every key PainWorkspace.tsx passes to
buildPainWorkspaceEmrPreview is also passed by 종결's own call (no silent drop)`.

**ISSUE(경미, 비차단)**: 키 집합 비교는 *대칭적 누락*에 눈이 멀다 — 두 호출부에서
같은 키를 동시에 지우면 통과한다. 그리고 `DOCUMENTED_COMPLETION_ONLY_KEYS`는
"종결에만 있는 키"만 화이트리스트하고 "PainWorkspace에만 있는 키"는 0개를 강제하므로
현재 방향은 맞다. 지금 상태로 충분하되, 앞으로 키를 추가할 때 두 곳 동시 수정이
전제라는 점은 그대로다.

### 6. [MEDIUM] O 경계 테스트의 사각 — **RESOLVED** (요청받은 제3 경로 포함)

요청대로 지난 리뷰의 재확인 블록을 **글자 그대로** 재적용했다.

| 뮤턴트 | 삽입 위치 | 결과 (`test:lbp-working-hypothesis`) |
|---|---|---|
| **M6** | `emrPreview.ts:231` `오늘 재검 소견:` 절 뒤에 `` `${input.onsetDurationText ? ` (경과: …)` : ''}` `` | **KILLED** |
| **M6b** | `:228` `허리 움직임 반응:` 절 뒤에 `` `${input.aggravatingText ? ` / 악화요인 …` : ''}` `` | **KILLED** |
| **M6c (신규, 제3 경로)** | `:235` **`객관적 근력저하:` 절 안에** `` `${input.impactText ? ` (일상: …)` : ''}` `` | **KILLED** |

세 뮤턴트 모두 같은 단언에서 죽었다(관측된 메시지, 원문 그대로):

```
Error: FAIL: §14.1 filled example (defect #6, all 4 O clauses populated): O carries
the clinician exam finding + directional response + today's reassessment finding +
the objective-motor-deficit finding, and nothing patient-reported
   at tests/lbp-working-hypothesis.spec.mjs:638
```

`filled` fixture가 이제 O의 **네 절을 전부** 채우고(`examSuggestions` +
`lbpDirectionalResponse: 'FLEXION_FAVORABLE'` + `reassessment` 오늘 결과 1건 +
`lbpObjectiveMotorDeficit: 'NONE'`) `filledLines[3]`을 정확일치로 고정하므로,
**O 줄 어느 절에 무엇을 덧붙여도 반드시 깨진다.** fixture는 더 이상 불완전하지 않다.
(같은 정확일치가 `O/S`·`S`·`A`·`P`에도 걸려 있어, 신규 5개 입력을 하나씩 떨어뜨리는
뮤턴트 **MdropPlan / MdropRecap / MdropMicro**도 전부 KILLED —
각각 `P carries …(defect #2) 진료 계획…`, `O/S carries … the revisit recap text`,
`S carries only patient self-report (…/micro follow-up)`에서 죽는다.)

### 7. [MEDIUM] §14.1의 O/S 경과 요약 · S micro follow-up — **PARTIALLY RESOLVED, 수용 가능**

**`microFollowUpText`: 양쪽 호출부에 배선됨.** `PainWorkspace.tsx:663/685/710`,
`DoctorWorkspace.tsx:828`(`deltaQuoteLine`), `DoctorView.tsx:3183`. 두 식은
문자 그대로 동일(`microFollowUpQuoteLine(readableMicroFollowUpResponse(...))`).
`S`에만 실리고(`emrPreview.ts:244`) `O`에는 도달 불가(위 defect #6 정확일치가 보장).
`microFollowUpQuoteLine`은 기록이 없으면 `null`을 반환하므로(`microFollowUp.ts:176`)
빈 인용을 만들지 않는다. **다만 배선에 dep 누락이 하나 있다 → C-2.**

**`revisitRecapText` 미배선 — 수용 가능하다고 판단한다.** 근거 셋:

1. **원장이 재진 경과를 적을 곳이 `O`밖에 없는 상태가 아니다.** 같은 fix가 `S`에
   `최근 경과(환자 응답):` 절을 실제로 배선했다. 환자 자가보고 경과는 이제
   자기 자리를 갖는다.
2. **`revisitQuickCheck`는 이 화면의 레코드가 소유하는 값이 아니다.**
   `visitWorkspace.ts:77`이 그것을 **submission이 없는 revisit visit**의 상태로
   보관하고, `RevisitWorkspace.tsx:471-475`가 `latestPrior && !latestPrior.submissionId`
   일 때만 요약한다. 지금 열려 있는 submission 레코드에는 자기 quick check가
   존재하지 않는다 — "붙일 값이 있는데 안 붙인" 게 아니라, 두 call site 어느
   쪽도 그 값을 가지고 있지 않다.
3. **`RevisitWorkspace`에는 EMR 미리보기·복사 표면이 아예 없다**(해당 파일에
   `EmrPreview`/`복사` 문자열 0건). 즉 재진 화면에는 오염될 `O` 줄 자체가 없다.

따라서 이것은 "임상 경계를 사람 손으로 깨게 만드는 미구현"이 아니라, **다른
subsystem에서 값을 끌어오는 새 fetch 배선이 필요한 후속 작업**이다.
필요해질 때의 최소 배선은: `DoctorView`가 이미 가진 `priorVisits`
(`:2988-3016`)에서 최신 no-submission visit의 workspace를 한 번 읽어
`summarizeRevisitQuickCheckKo`를 통과시킨 뒤 두 call site에 같은 식으로 넘기는 것.
지금 그것을 이 batch에서 하는 것은 범위 초과라는 구현자 판단에 동의한다.

**미배선 입력이 부재 시 오해 소지를 만들 수 있는가 — 없다(실측).**
`revisitRecapText`가 `undefined`/`null`/`''`/공백일 때 `O/S`는
`onsetDurationText`만 담고(`emrPreview.ts:296-300`의 `osParts` join),
`; `구분자도 라벨도 남지 않는다. 단독으로 주면 `O/S: 경과 요약값`만 나온다.
**단, 이 유예가 `HANDOFF.md`/`DECISIONS.md` 어디에도 기록돼 있지 않다** → C-4.

### 8. [LOW] `lbpDirectionalResponse` 유효성 가드 — **RESOLVED**

`emrPreview.ts:82`에서 `isValidLbpDirectionalResponse`를 import, `:224-229`에서
`isValid… && !== 'NOT_ASSESSED'`로 조건 교체. 실측:
`'NOT_A_REAL_VALUE'` / `'NOT_ASSESSED'` / `undefined` / `null` → 전부 `O:`(빈 줄),
`'FLEXION_FAVORABLE'` → `O: 허리 움직임 반응: 숙이면(굴곡) 호전`.
뮤턴트 `M8revert`(옛 truthy 조건으로 원복) → **KILLED**:
`FAIL: defect #8: an invalid lbpDirectionalResponse value never produces an empty
"허리 움직임 반응: " clause on O`.

### 9. [LOW] 개행 든 레거시 처치 값 손실 — **RESOLVED**

`FinalAssessmentCard.tsx:183-190`이 `<textarea rows={1}>`로 복원됐다.
`workspace.css:486-496`는 element-agnostic이고(`font-family: inherit` 포함),
같은 워크스페이스의 다른 textarea가 쓰는 `.workspace__noteInput`(`:466-475`)과
규칙이 동일하다 — 시각적 이질감 없음. 자유입력 칸 **개수는 그대로 1개**(§14.2 준수).
뮤턴트 `M9revert`(`<input type="text">`로 원복) → **KILLED**:
`AssertionError [ERR_ASSERTION]: the 기타 field must be a <textarea>, not an
<input>, so a legacy value's newline survives editing`.

### 10. [LOW] 라운드트립 주석이 사실과 다름 — **RESOLVED, 정정문도 사실임을 실측 확인**

`FinalAssessmentCard.tsx:95-102`의 새 주석이 드는 세 예시를 그대로 실행했다:

| 입력 | 실측 라운드트립 | 주석의 주장 |
|---|---|---|
| `약침, 침` | `침, 약침` | "chips are re-emitted in the fixed canonical order" ✅ |
| `침, 도수치료, 부항` | `침, 부항, 도수치료` | "non-chip text is always moved after the chips" ✅ |
| ` 침 ,  부항 ` | `침, 부항` | "comma-adjacent whitespace is normalized" ✅ |

그리고 `침 맞고 나서 어지러움` / `침\n부항 후 호전` / `침·부항` /
`한약(십전대보탕) 처방`은 여전히 chip으로 재해석되지 않고 기타 칸에 원문 그대로,
라운드트립도 바이트 동일. **내용 손실 0건**이라는 정정문의 핵심 주장도 참이다.
거짓 주석을 다른 거짓 주석으로 바꾸지 않았다.

### 11. [LOW] `HANDOFF.md`/`DECISIONS.md` 미갱신 + 커밋 제목 — **PARTIALLY RESOLVED**

`9bad12a`가 한 것: `CLAUDE.md`에 규칙 추가(§B 참고), delta review 원문을
`docs/LBP_V1_BATCH4_OPUS_DELTA_REVIEW_v0.1.md`로 보존.
**하지 않은 것**: `git diff --stat dd60c0e..9bad12a -- HANDOFF.md DECISIONS.md` →
**빈 출력**. `HANDOFF.md`의 Next Recommended Action은 여전히 round 18 / PR #24 /
HEAD `7930cc1`를 가리키고, Batch 4는 "다음에 할 일"로만 등장한다(`:61`, `:291`, `:411` 등).
`DECISIONS.md`에도 §14.5 중단 근거 항목이 없다 — dead code가 왜 계속 dead인지의
근거가 코드·문서 어디에도 없는 상태 그대로다.
defect #11이 제시한 기계적 재확인 기준("`HANDOFF.md`의 Next Recommended Action이
이 리뷰의 defect 목록을 가리킬 것")은 **미충족** → C-4.
(`CLAUDE.md`가 "HANDOFF와 Git이 어긋나면 즉시 HANDOFF를 고친다"고 못박고 있으므로,
이것은 문서 위생이 아니라 이 저장소의 명문 규칙 위반이다.)

### 12. [LOW] `EmrPreviewCard` 안내문이 틀린 곳을 가리킴 — **PARTIALLY RESOLVED**

herbal 절반은 실제로 참이 됐다(defect #1 (f) 참고). fixture/preview 모드와
`patient_id` 없는 레코드에서는 여전히 존재하지 않는 섹션을 가리킨다 → C-5.

---

## B. 새 `CLAUDE.md` 규칙 평가 (요청 항목 6)

규칙 본문: `CLAUDE.md:130-141`.

### B-1. 세 사건을 실제로 잡았겠는가 — **3건 중 1.5건만 잡는다**

| 사건 | 규칙이 발동하는가 | 근거 |
|---|---|---|
| Batch 2.6 **D-1** | **예** | 초진에서 "중복"으로 지운 컨트롤 + 재진 화면 미확인. 트리거 문구("컨트롤·버튼·표시를 중복/불필요로 판단해 제거")와 열거 대상(초진/재진/…)에 정확히 걸린다. |
| Batch 2.6 **N-2** | **아니오** | N-2는 *제거*가 아니라 **D-1을 고치는 수정이 mount latch를 파생식으로 바꾸면서** 생긴 회귀다. 지운 "컨트롤·버튼·표시"가 없다. 커밋 메시지는 세 건을 "the same failure: a control was removed as duplicated"로 묶지만, N-2는 그 형태가 아니다. |
| Batch 4 **D-1** | **예** | 복사 버튼 제거 + herbal/mixed/fixture 화면 미확인. |
| Batch 4 **D-2** | **경계** | 지운 것은 컨트롤이 아니라 **텍스트 소스(`buildEmrSummary`)**다. "그 필드를 읽거나 쓰는 모든 화면"을 넓게 읽으면 걸리지만, 트리거 문장은 여전히 "컨트롤·버튼·표시의 제거"를 말한다. |

**결정적 증거**: 규칙이 겨냥한 바로 그 실패가 **규칙이 추가되기 한 커밋 전에 다시
일어났다**(C-1: herbal을 `buildEmrSummary`에서 떼어내면서 3필드 대체 경로 미확인).
`7219f2c`의 커밋 메시지는 매우 상세하지만, **자기가 새로 지운 경로(herbal ←
`emrSummary.ts`)에 대한 화면별 열거는 한 줄도 없다** — "sourced from
buildHerbalWorkspaceEmrPreview (untouched, per §14.7)"라고만 적혀 있고, 그 함수가
`ClinicianJudgment` 3필드도 recorder structured note도 담지 않는다는 사실은
언급되지 않는다.

### B-2. 검증 가능한가 — **절반만**

"확인 결과를 브리프나 커밋 메시지에 적는다"는 리뷰어가 눈으로 확인할 수 있는
유일한 부분이고, 그 점에서 장식은 아니다. 그러나 (a) 무엇을 적어야 통과인지의
형식이 없어 "확인했다"는 한 줄로도 형식상 충족되고, (b) 기계적으로 돌릴 수 있는
체크가 없다 — 이 저장소는 정확히 그런 종류(소스 텍스트 단언)를 이미 갖추고 있는데
규칙이 그것을 요구하지 않는다.

### B-3. 더 날카로운 문안 (제안)

```
- **경로를 지우거나 다른 것으로 교체하기 전에, 그 경로가 나르던 값 하나하나에
  대해 화면별 대체 경로를 표로 적는다.** "중복/불필요"로 판단한 컨트롤·버튼·표시의
  제거뿐 아니라, **어떤 값이 화면에 도달하던 경로(요약 함수·조립기·데이터 소스)를
  다른 것으로 갈아끼우는 경우에도 똑같이 적용된다.**
  1. (출력 방향) 옛 경로가 나르던 **필드를 전부 열거**하고, 각 필드 × 각 화면
     (초진 / 재진 / 한약 / mixed / fixture 미리보기)에 대해 새 경로에서 그 값이
     어디로 가는지 — 또는 "의도적으로 버림 + 그 근거" — 를 **한 행씩** 적는다.
     "확인했다" 한 줄은 충족으로 보지 않는다.
  2. (입력 방향) 화면에서 **아직 편집 가능한 필드**가 새 경로 이후에도 어딘가
     출력·저장에 도달하는지 반대 방향으로도 확인한다. 쓰기는 되는데 읽히지 않는
     필드를 남기지 않는다 — 남긴다면 그 편집 UI를 함께 닫는다.
  3. (표시 조건) 어떤 칸의 표시 조건을 latch에서 파생식으로(또는 그 반대로)
     바꿀 때는, 편집 도중 값이 빈 문자열이 되는 순간 칸이 사라지지 않는지
     확인한다(Batch 2.6 N-2).
  4. 위 표를 커밋 메시지(또는 브리프)에 남기고, **지운 경로 1개당 소스 텍스트
     단언 1개**를 `tests/`에 추가한다 — 산문 주장 대신 테스트로 검증되게 한다.
  이 규칙은 같은 사고가 **네 번** 난 뒤에 이 형태가 됐다: Batch 2.6 D-1(제거),
  Batch 2.6 N-2(고치는 수정이 만든 회귀), Batch 4 D-1/D-2(복사 경로 통합),
  Batch 4 closing C-1(D-1을 고치면서 한약 진료에 D-2를 재현). 네 번 다
  "지운 쪽 화면에서는 옳았다". 확인해야 하는 것은 **지우지 않은 쪽 화면**이다.
```

핵심 변경 3가지: **트리거를 "제거"에서 "제거 또는 교체"로 넓혔고**(D-2/C-1을 포함),
**N-2를 커버하는 3항을 별도로 세웠고**(제거가 아니므로 1항으로는 안 걸린다),
**"필드 × 화면" 표 + 경로당 테스트 1개**라는 검증 가능한 산출물을 요구한다.

---

## C. 남은 결함 (번호순)

### C-1. [HIGH, 차단] herbal-only 레코드의 종결 EMR 텍스트가 원장이 직접 타이핑한 JudgmentPanel 3필드를 다시 조용히 누락한다 — defect #2가 herbal 프로필에 재현됨

- **위치**: `src/doctor/DoctorView.tsx:3198-3209`
  (`buildHerbalEmrTextForRecord` — `selectedRecord?.judgment`를 인자로 넘기지 않는다),
  `:3216`(dispatcher가 herbal을 이 함수로만 보낸다),
  잃은 값의 편집 UI는 `src/doctor/JudgmentPanel.tsx:424-435`,
  옛 출력 경로는 `src/doctor/emrSummary.ts:26-28`,
  대체된 조립기는 `src/doctor/workspace/emrPreview.ts:313-350`
  (인자 7개 전부 workspace 필드, `ClinicianJudgment`를 받지 않는다).
- **왜 문제인가**:
  - `dd60c0e`(Batch 4 이전)에서 herbal 레코드는 **`buildEmrSummary`로 seed**됐고
    (`git show dd60c0e:src/doctor/DoctorView.tsx`의 seed effect, `if (!latest) return`
    아래), 그 함수는 `revised_after_exam`/`final_treatment_axis`/
    `prescription_direction`을 `Assessment`/`치료·처방`/`계획` 줄로 실었다.
    이제 herbal은 그 경로에서 완전히 분리됐고, 새 조립기에는 그 세 값이 들어갈
    자리가 없다.
  - **JudgmentPanel은 viewProfile 게이트가 없다** — `DoctorView.tsx`의
    `<ReferenceAccordion title="명리·감사 기록">` 안에서 모든 프로필에 렌더된다
    (`viewProfile` 게이트는 `:4380`/`:4542`/`:4687`의 명리 표면에만 걸려 있고
    JudgmentPanel 블록에는 없다). 즉 한약 진료에서도 원장이 계속 타이핑할 수 있는데,
    그 값이 EMR 복사 텍스트에 **영영 실리지 않는다**.
  - 이것은 defect #2와 **글자 그대로 같은 형태**이고, `9bad12a`가 방금 추가한
    규칙이 잡았어야 할 사례다. 영향 범위는 "녹음이 있는 herbal 레코드"
    (녹음 없는 herbal은 Batch 4 이전에도 상자 자체가 없었다)이며, 그 경우
    recorder structured note(`경과`/`주요 문진`/`진찰 소견`)도 함께 사라진다
    — 후자는 herbal 블록에 대응 자리가 없어 논쟁의 여지가 있으나,
    **원장 타이핑 3필드는 논쟁의 여지가 없다.**
- **최소 수정** (§14.7을 지키면서 — `buildHerbalWorkspaceEmrPreview`는 손대지 않는다):
  `buildEmrTextForRecord()`의 **herbal 분기에서만** 3개 절을 뒤에 덧붙인다
  (mixed는 pain 블록이 이미 싣고 있으므로 중복시키지 않는다).

  ```ts
  function buildHerbalEmrTextForRecord(): string {
    const base = buildHerbalWorkspaceEmrPreview({ …현행 그대로… })
    const j = selectedRecord?.judgment
    const extra: string[] = []
    if (j?.revised_after_exam?.trim()) extra.push(`원장 평가: ${j.revised_after_exam.trim()}`)
    if (j?.final_treatment_axis?.trim()) extra.push(`치료/처방 방향: ${j.final_treatment_axis.trim()}`)
    if (j?.prescription_direction?.trim()) extra.push(`진료 계획: ${j.prescription_direction.trim()}`)
    return extra.length ? `${base}\r\n${extra.join('\r\n')}` : base
  }
  ```

  라벨은 pain composer(`emrPreview.ts:258/261/277`)와 **같은 문자열을 쓴다** —
  두 프로필의 EMR을 읽는 사람이 같은 값을 다른 이름으로 보지 않게.
  빈 값은 기존 규칙대로 절 자체를 생략(위 `?.trim()` 가드).
  대안은 §D의 PO 판단 항목 참고.
- **기계적 재확인 기준**:
  1. `tests/doctor.spec.mjs`의 §14.3 블록에 소스 텍스트 단언 추가 —
     `buildHerbalEmrTextForRecord()` 본문이 `revised_after_exam` /
     `final_treatment_axis` / `prescription_direction` 세 문자열을 모두 참조할 것.
  2. mixed 중복 금지 단언 — dispatcher의 mixed 분기 결과에서 `원장 평가:`가
     정확히 1회만 나타날 것(문자열 카운트).
  3. **뮤턴트**: 세 절 중 하나를 지우면 (1)이 실패해야 한다.

### C-2. [MEDIUM, 차단] 종결 seed effect의 dep에 `microFollowUpResponse`가 빠져 있어, 두 복사 지점의 텍스트가 비결정적으로 갈린다

- **위치**: `src/doctor/DoctorView.tsx:3244`
  (`}, [payloadShapeOk, viewProfile, selectedRecord?.id, selectedRecord?.updated_at])`,
  `// eslint-disable-next-line react-hooks/exhaustive-deps`),
  읽는 값은 `:3183`, 값의 출처는 `:3020-3042`의 비동기 fetch.
- **왜 문제인가**: micro follow-up은 **네트워크 fetch**로 도착하고, seed effect는
  레코드가 도착한 커밋에서 **즉시** 돈다 — 그 시점의 `microFollowUpResponse`는
  항상 `null`이다(목록으로 돌아갈 때 `:3023`이 리셋하므로 이전 환자 값이 새는
  일은 **없다** — 확인함). 이후 fetch가 resolve해도 dep가 안 바뀌어 종결 텍스트는
  갱신되지 않는다. 반면 참고 자료의 `EmrPreviewCard`는 prop을 실시간으로 렌더하므로
  **그 절을 보여준다.** CD-2.7-2가 "두 곳이 절대 다르지 않다"고 선언한 바로 그
  성질이 깨진다.
  더 나쁜 것은 **비결정성**이다: 첫 열람 시 `new → viewed` 상태 쓰기가
  `updated_at`을 올려 seed effect를 한 번 더 돌리는데(`:2968-2971`), 그 시점에
  fetch가 끝났는지는 경합이다 — 같은 레코드를 두 번 열면 종결 텍스트가 다를 수 있다.
  임상 안전(`O` 경계) 위반은 아니다(환자 자가보고 인용이 `S`에서 빠질 뿐, 없는
  사실이 지어지지는 않는다). 그러나 EMR에 붙여넣는 텍스트의 내용이 타이밍에
  좌우된다.
- **최소 수정**: dep 배열에 `microFollowUpResponse` 한 항목 추가.
  defect #4 가드가 그대로 앞을 막으므로(원장이 손댔으면 `emrText !== lastGenerated`)
  **수동 편집을 덮어쓸 위험은 새로 생기지 않는다.**
- **기계적 재확인 기준**: `tests/doctor.spec.mjs`의 seed-effect 정규식(현재
  `\}, \[payloadShapeOk, viewProfile, selectedRecord\?\.id,
  selectedRecord\?\.updated_at\]\)`)을 `microFollowUpResponse`를 포함하도록 갱신하고,
  dep에서 그것을 빼면 실패하게 한다.

### C-3. [MEDIUM, 비차단] defect #4의 회귀 가드 중 한 단언이 공허하다

- **위치**: `tests/doctor.spec.mjs` — `firstIfIdx !== -1 && firstSetEmrTextIdx !== -1
  && firstIfIdx < firstSetEmrTextIdx` 단언.
- **실증**: 뮤턴트 **M4subtle**(`const generated = …` 바로 뒤에
  `setEmrText(generated)` 한 줄 추가 — ref 로직은 남겨둠) → `test:doctor`
  **960 passed, 0 failed, SURVIVED**. 이 뮤턴트는 defect #4를 완전히 되돌린다.
- **최소 수정**: 위치 비교 대신 **중첩 깊이**를 본다 — seed effect 본문에서
  선행 `if (!payloadShapeOk) return` 줄을 제거한 나머지 안에서,
  중괄호 깊이 0(= effect 본문 최상위)에 있는 `setEmrText(` 등장 횟수가 0일 것.
  (또는 더 단순하게: `setEmrText(` 각 등장 직전 200자 안에
  `emrSeedRef.current` 가 반드시 있을 것.)
- **기계적 재확인 기준**: 위 단언을 넣은 뒤 M4subtle을 재적용하면 실패해야 한다.

### C-4. [LOW, 비차단] defect #11이 절반만 닫혔다 — `HANDOFF.md` / `DECISIONS.md` 미갱신

- **근거**: `git diff --stat dd60c0e..9bad12a -- HANDOFF.md DECISIONS.md` → 빈 출력.
  `HANDOFF.md`의 Next Recommended Action은 round 18 / PR #24 / HEAD `7930cc1`을
  가리키고 Batch 4는 "다음에 할 일"로만 등장한다.
- **최소 수정**: (a) `HANDOFF.md`를 현재 상태로 갱신 — Batch 4 구현 완료,
  Opus delta FAIL → fix → **closing FAIL(C-1/C-2)**, §14.5 CRM은 명시적 유예,
  §14.1 `revisitRecapText`는 배선 유예(사유: `visitWorkspace.ts` 소유, 새 fetch 필요).
  (b) `DECISIONS.md`에 §14.5 중단 근거를 1항목으로 남긴다 —
  `applyNextReassessmentPlanToEpisode`(`src/crm/episode.ts:66`)의 호출처가
  `tests/crm-schema.spec.mjs:230` 하나뿐인 이유가 코드 어디에도 없다.
- **기계적 재확인 기준**: `HANDOFF.md`의 Next Recommended Action이 이 closing
  리뷰의 C-1/C-2를 가리킬 것.

### C-5. [LOW, 비차단] fixture/preview 모드와 `patient_id` 없는 레코드에는 EMR 복사 지점이 하나도 없고, 안내문이 존재하지 않는 섹션을 가리킨다

- **위치**: `src/doctor/workspace/EmrPreviewCard.tsx:26`
  (`복사는 「다음」 레인의 「종결」 섹션에서 합니다.`), 종결 게이트는
  `src/doctor/DoctorView.tsx:3629`(`mode === 'server' && selectedRecord?.patient_id`).
- **왜 낮은가**: 상자가 비지 않고 "복사됨" 거짓 신호도 없다 — 읽기 전용 textarea를
  손으로 선택해 복사할 수 있을 뿐 버튼이 없다. `patient_id`는 신규 제출에서 항상
  생성되므로(`server/store.js:299-325`) 실제 대상은 링크 이전의 레거시 레코드다.
- **최소 수정**: `EmrPreviewCard`가 `copyHint?: string`을 prop으로 받아 호출부가
  문구를 정하게 하고, 종결이 렌더되지 않는 호출 맥락에서는 안내문을 생략한다.
- **기계적 재확인 기준**: `HerbalWorkspace`/`PainWorkspace`가 넘기는 hint가
  prop으로 주어짐을 소스 텍스트로 단언.

---

## D. 불변식 · 감사 항목 (전부 PASS)

| 항목 | 결과 |
|---|---|
| 삭제·약화·skip된 단언 | **0건.** 제거된 `-` 단언은 정확히 6개이며 **전부 같은 줄 인덱스에 대한 더 넓은 정확일치로 교체**됐다(`filledLines[1]`~`[5]` + O/S 단언). `skip`/`only`/`todo`/삭제된 `test()` 블록 0건. 단언 총수 순증(947→960, 272→274, 231→239) |
| FROZEN zero-diff (`git diff --stat origin/main -- src/spec index.html src/App.tsx "tablet core"`) | **빈 출력** ✅ |
| `server/**`, `src/crm/**` | 델타에 **없음** ✅ |
| `patientCarePlanPreview.ts` / `provenance.ts` / `lbpExerciseEligibility.ts` / `lbpExerciseRecommendation.ts` / `revisitQuickCheck.ts` / `lbpWorkingHypothesis.ts` | 전부 **무수정** ✅ |
| `LbpAwaitingCapabilitySection` | 델타 diff에 문자열 등장 0회 ✅ |
| 스키마·영속 필드 변경 | **없음** — `persistence.ts`/`finalAssessment.ts`/`judgment.ts` 전부 델타에 없음. 신규 3+2 composer 입력은 전부 optional 함수 인자이며 저장되지 않는다 ✅ |
| 감사 §G 12개 불가침 | **전부 무손상.** 이 델타가 건드린 소스 6개 중 §G 대상은 `PainWorkspace.tsx`(G5) 하나뿐이고, 그 hunk는 `@@ -660`, `@@ -680`, `@@ -704` 셋 — 전부 prop 배선이며 G5가 지목한 `:167` 영역과 무관. `provenance.ts`/`ObjectiveExamFindingsCard`/`FollowUpTargetPicker`/`RevisitWorkspace`/`ConflictBanner`/`revisitQuickCheck` 전부 델타에 없음. `EmrPreviewCard`의 `제안이 자동으로 확정 소견이 되지 않음` 배지 존치(`:23`) ✅ |
| §14.5 CRM 여전히 중단 | ✅ `POST /api/crm/episodes`(생성)과 pause/complete/reopen 3액션 외에 episode 쓰기 라우트 없음(`server/index.js:1729-1880`). `applyNextReassessmentPlanToEpisode`의 호출처는 `tests/crm-schema.spec.mjs:230` 하나 그대로. 델타에 CRM 코드 0줄 |
| 자유입력 칸 순증 | **0** — `<input type="text">` 1개가 `<textarea rows={1}>` 1개로 바뀌었을 뿐 ✅ |
| `buildHerbalWorkspaceEmrPreview` §14.7 | `dd60c0e`판과 **바이트 동일** ✅ |
| 실 복사 버튼 개수 | `grep -rn "EMR용 복사" src/` = 2건(주석 1 + 버튼 1) → **버튼 1개** ✅ |

**뮤턴트 총계(전부 /tmp 사본, 삭제 완료)**: 13개 중 **12 KILLED, 1 SURVIVED(M4subtle → C-3)**.
KILLED: M6, M6b, **M6c(신규 제3 경로)**, MD2leak, MdropPlan, MdropRecap,
MdropMicro, M8revert, M3revert, M9revert, M4revert, M1revert, MdropKey, MherbalDispatch.

---

## CLINICAL DECISION REQUIRED

### 1. (기존, non-blocking) 빈 `O:` 줄의 차트 문구

직전 리뷰와 **동일하며 변한 것이 없다.** §14.1이 "6줄 항상 출력 / 빈 값을
없음·정상으로 쓰지 않는다"를 이미 결정했고 구현은 그 결정을 정확히 따른다.
고칠 코드 없음. 선택지는 둘뿐:

- **(현행 유지)** `O:` — 날조 위험 0, "미기재 vs 정상" 혼동 위험 낮음(비영).
- **(대안)** `O: (미기재)` — 혼동 제거. 단 **여섯 키 전부**에 같은 규칙을 적용해야
  하고, 문구는 반드시 **기재 상태**를 말해야 한다.
  `없음`/`정상`/`특이소견 없음`은 어떤 경우에도 불가.

**현행 유지가 기본값**이며 이 항목은 Batch 4를 막지 않는다.

### 2. (신규, C-1에 딸린 선택) 한약 진료에서 JudgmentPanel 3필드를 어떻게 할 것인가

C-1은 코드 결함이지만, **어느 방향으로 닫을지는 PO 판단**이다. 두 가지가 다 정당하다:

- **(A) 한약 EMR 출력에 3필드를 싣는다** (§C-1의 최소 수정). 한약 진료에서도
  원장이 그 칸을 계속 쓴다면 이쪽이 맞다.
- **(B) 한약 레코드에서는 그 3칸을 아예 닫는다.** 한약 레인은 이미 자체
  `최종 변증·병기 / 치법 / 처방·계획 메모 / 추적할 증상`을 갖고 있고 그 값들은
  EMR에 실린다. JudgmentPanel의 3필드가 한약에서 사실상 중복이라면, 편집 UI를
  프로필 게이트로 닫는 편이 "쓰기는 되는데 읽히지 않는 필드"를 없애는 더 깨끗한
  해법이다.

**허용되지 않는 유일한 선택지는 현행(쓸 수는 있는데 어디에도 실리지 않음)이다.**
어느 쪽을 택하든 (A)의 라벨은 pain과 동일 문자열이어야 하고, (B)를 택하면
`DECISIONS.md`에 "한약에서 이 3필드를 닫은 이유"를 남겨야 한다.

---

## 조치 불요 관찰 (참고)

1. **`src/doctor/emrSummary.ts`는 이제 프로덕션에서 완전히 미참조 모듈이다.**
   `grep -rn "emrSummary" src/`에 남은 것은 주석뿐이고, 유일한 소비자는
   `tests/emrSummary.spec.mjs`(14 단언)다. 모듈 헤더(`emrPreview.ts:6-11`)가 그
   사실을 정직하게 적어 두었다. 삭제하라는 뜻이 아니다 — **C-1이 (A)로 닫히면
   그 3필드의 라벨 정의가 두 곳(`emrSummary.ts`와 `emrPreview.ts`)에 존재하게
   되므로, 어느 쪽이 정본인지 주석 한 줄로 못박아 두는 편이 낫다.**
2. **`O/S` 키는 이제 의도적으로 provenance가 섞인 유일한 키다**
   (태블릿 발병·기간 + 재진 경과 요약). 파일 헤더(`emrPreview.ts:26-29`)가 그것을
   명시하고, ONE ABSOLUTE RULE은 `O`만 규율하므로 규정 위반이 아니다. 다만 앞으로
   `O/S`에 무언가를 더할 때 "여긴 원래 섞이는 키니까"가 `O`로 번지지 않도록,
   `O` 정확일치 단언(defect #6로 강화됨)을 계속 최전선으로 둘 것.
3. **`.workspace__finalAssessment__interventionOther`는 element-agnostic**이라
   `<textarea>` 복원으로 시각적 회귀가 없다(`font-family: inherit` 포함, 같은
   워크스페이스의 `.workspace__noteInput`과 규칙 동일). `resize` 규칙이 없는 것도
   기존 note box들과 같다.
4. **`activeProfile`(수동 전환) vs `viewProfile`(파생)** 차이는 그대로다 —
   참고 자료 카드는 원장이 탭을 수동 전환할 수 있고 종결은 파생 프로필을 따른다.
   의도된 override이며, C-1이 닫히면 두 텍스트의 내용 차이는 이 한 경우로 국한된다.
5. **`mergeLbpExamSuggestions`가 종결 경로에 적용되지 않는 점**도 그대로다 —
   병합 항목은 `NOT_YET_CHECKED`로 시작해 출력에서 제외되므로 텍스트 차이 없음.
   향후 병합이 결과값을 seed하게 바뀌면 즉시 두 경로가 갈라진다.
6. **`7219f2c`의 커밋 메시지는 이례적으로 정직하다** — defect #7을 "deliberately
   left unwired"로 명시하고, 뮤턴트를 하나씩 되돌려 관측했다고 적었으며, 실제로
   내가 재현한 결과와 일치한다. C-1은 은폐가 아니라 **열거 누락**이다. §B-3의
   문안이 요구하는 "필드 × 화면 표"가 있었다면 커밋 작성 중에 걸렸을 사안이다.

---

## 재확인 체크리스트 (C-1/C-2 수정 후 이것만 돌리면 된다)

```
npx tsc -b
npm run build
npm run test:emrSummary
npm run test:doctor-workspace
npm run test:workspace-round3
npm run test:lbp-working-hypothesis
npm run test:crm-schema
npm run test:doctor
git diff --stat origin/main -- src/spec index.html src/App.tsx "tablet core"   # 빈 출력
grep -rc "EMR용 복사" src/                                                      # 버튼 1개
git diff --stat dd60c0e..HEAD -- HANDOFF.md DECISIONS.md                       # 더 이상 비어 있으면 안 됨 (C-4)
```

그리고 세 뮤턴트를 재적용해 전부 실패하는지 확인한다:

```
# C-1: buildHerbalEmrTextForRecord()의 세 절 중 하나 삭제        -> test:doctor FAIL
# C-2: seed effect dep에서 microFollowUpResponse 제거            -> test:doctor FAIL
# C-3: `const generated = …` 뒤에 setEmrText(generated) 한 줄 추가 -> test:doctor FAIL
```
