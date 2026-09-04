# LBP v1 Batch 4 + Batch 4.1(A/B/C/D) 통합 closing 재검수 (Opus)

# 판정: **FAIL** — 게이트를 닫지 않는다.

> **판정 이력.** §1~§8은 1차 closing 재검수(`61dca0a~1..bf7f8b7`, 판정 FAIL)다.
> 그 FAIL에 대한 수정(`289a800..2e0a8a0`, 테스트/문서만)의 **delta 재검수는
> §9**에 있다 — **판정 역시 FAIL이며, 게이트는 여전히 CLOSED가 아니다.**
> 기록된 변이 4개(m6/a4/m7/c9)는 이번엔 전부 죽지만, 같은 계약을 침해하는
> 변종 4개가 새로 생존한다(§9.2.2, 신규 결함 H-3/M-4/M-5).

**작성일:** 2026-09-04
**작성 역할:** Opus (Tech Lead / 임상 권위자 / 독립 검수자)
**검수 대상:** `61dca0a~1..bf7f8b7` (18 커밋, 26파일, +4841/−1324)
**브랜치:** `claude/clinical-os-lbp-architecture-xym6po`
**검수 중 HEAD 이동:** 검수 도중 `22b1b20`(docs only, §18 파일럿 계획)이 추가됐다.
코드 diff는 0줄이므로 아래 코드 검증 결과는 그대로 유효하다.

---

## 0. 판정 요지 — 무엇이 FAIL인가, 무엇은 아닌가

**프로덕션 코드는 오늘 기준 옳다.** 임상 안전 항목 A-1~A-5를 전부 코드로
확인했고, 위반을 하나도 찾지 못했다. `O | 객관적 소견`에 도달하는 값은 4개
소스뿐이며 전부 원장 입력이고, 환자 자가보고는 `S`/`O/S`로만 간다.
`UNKNOWN`/미평가가 `없음`으로 둔갑하는 경로도 없다. 안전 필드
(`lbp_objective_motor_deficit`/`shoulder_objective_cuff_weakness`)의 편집·저장·
409·인증만료·레코드전환 초기화 경로는 전부 살아 있다.

**FAIL인 것은 그 사실을 지키는 장치다.** 이 배치의 완료 조건은 이 저장소가
스스로 정한 대로 "테스트 통과"가 아니라 **"변이를 넣으면 단언이 죽는 것"**이다
(`DECISIONS.md` 2026-09-04 "테스트 규약 2건", §15.7, §14.6). 그 기준으로
**변이 3개가 전체 스위트를 통과했고, 그중 2개는 `O` 경계 위에서 살아남았다.**

- **H-1** — `PhysicalExamSuggestion.reasonFacts`(파일 스스로 "patient/derived
  facts only"라고 정의하고, 실제 프로덕션 값에 `…(환자 응답)` 문자열이 들어
  있는 필드)를 `O` 줄에 덧붙이는 변이가 `npm run test:all` 전체를 통과한다.
- **H-2** — `LBP_OBJECTIVE_MOTOR_DEFICIT_LABEL`에 `UNKNOWN: '없음'`을 추가하는
  변이 — 즉 "아직 확인 못함"을 EMR에 "없음"으로 기록하는, 2.5b 규칙이 막으려는
  바로 그 동작 — 이 전체 스위트를 통과한다.

두 변이 모두 `DECISIONS.md` 규약 2("안전 경계는 '금지 라벨이 없다'가 아니라
'그 줄 전체가 정확히 이것이다'로 잠근다")가 **막으려던 함정의 다음 변종**이다.
규약 2는 "라벨 없는 우회로"를 닫았지만, **exact-match fixture의 하위 필드가
비어 있으면 그 하위 필드에 대한 커버리지는 여전히 0**이라는 사실은 닫지
못했다. `filled` fixture는 `reasonFacts: []`, `previous: null`,
`lbpObjectiveMotorDeficit: 'NONE'`이다.

**닫는 데 필요한 작업은 작다** — 단언 3~4개(대략 20줄)와 fixture 하위 필드
채우기. 설계 변경도, 프로덕션 코드 변경도 필요 없다. 그러나 이 프로젝트에서
같은 계열의 사고가 다섯 번 났고 그중 네 번을 이 검수가 잡았으며, 이번 배치가
**규약을 만든 바로 다음 배치**라는 점에서, "코드는 맞으니 통과"로 닫는 것은
이 게이트의 존재 이유를 부정한다.

---

## 1. 결함 목록

| # | 심각도 | 항목 | 파일 |
|---|---|---|---|
| H-1 | **HIGH** | `O` 경계: 검사 항목 절 내부(`reasonFacts`)에 커버리지 0 — 변이 생존 | `src/doctor/workspace/emrPreview.ts:118-134`, `tests/lbp-working-hypothesis.spec.mjs:584-651` |
| H-2 | **HIGH** | `UNKNOWN` 미평가 → `없음` 변이 생존 (안전 필드, 라벨표 커버리지 0) | `src/doctor/workspace/emrPreview.ts:165-168`, `tests/lbp-working-hypothesis.spec.mjs` |
| M-1 | MEDIUM | rule 4(`previous`를 오늘 결과로 출력 금지) 변이 생존 | `src/doctor/workspace/emrPreview.ts:136-149` |
| M-2 | MEDIUM | 삭제된 32테스트 중 "인증만료 인라인 복구" 행의 대체 단언이 실제로는 없다 — 변이 생존 | `src/doctor/ObjectiveExamFindingsCard.tsx:283`, `tests/save-conflict.spec.mjs:429-433` |
| M-3 | MEDIUM | PHI 카나리아 간헐 실패 **원인 규명 완료** — PHI 누출 아님, UUID 부분문자열 충돌(0.90%/run) | `tests/server.spec.mjs:937` |
| L-1 | LOW | `revisitRecapText`는 타입·테스트만 있고 **호출자 0** — §14.1의 `O/S` 정의 절반 미구현 | `src/doctor/workspace/emrPreview.ts:184-185` |
| L-2 | LOW | `learning_case`/`debrief`에 deprecated 주석 누락(4.1-A/C 필드는 다 붙어 있음) | `src/doctor/judgment.ts:72-73` |
| L-3 | LOW | `emrPreview.ts` 헤더의 "never two different ones" 주장이 코드보다 강하다 | `src/doctor/workspace/emrPreview.ts:11-17` |
| L-4 | LOW | `openPostTreatmentIds`가 레코드 전환 시 초기화되지 않는다 | `src/doctor/workspace/FollowUpTargetPicker.tsx:92` |
| L-5 | LOW | `.gitignore`에 삭제된 `tests/.judgment-panel-bundle.cjs` 항목 잔존 | `.gitignore` |
| L-6 | LOW | 이전 closing review의 미이행 항목: `DECISIONS.md`에 §14.5 중단 근거 항목이 아직 없다 | `DECISIONS.md` |

---

### H-1 [HIGH] `O` 경계가 "검사 결과" 절 **내부**에 대해서는 전혀 잠겨 있지 않다

**무엇이 문제인가.**
`buildPainWorkspaceEmrPreview`의 `O` 줄은 exact-match 단언 4곳으로 잠겨 있다고
브리프와 `DECISIONS.md` 규약 2가 주장한다. 그러나 잠긴 것은 **절의 개수와
모양**이지, 각 절이 자기 항목의 어떤 하위 필드를 찍는지가 아니다.
`examFindingsLines()`는 `i.title`/status/laterality/`i.result.note`만 쓰는데,
**같은 항목 객체에 `reasonFacts`가 붙어 있다.**

`src/doctor/workspace/examSuggestion.ts:29-33`:
```ts
export type ExamSuggestionReason = {
  text: string
  /** Where this reasoning fact came from — almost always PATIENT_FACT or DERIVED. */
  provenance: Provenance
}
```
실제 프로덕션 값(`src/doctor/workspace/lbpExamSuggestions.ts:153,161`):
```
{ text: '하지 통증·저림/신경증상 보고(환자 응답)', provenance: 'PATIENT_FACT' }
{ text: '서 있거나 걸을수록 엉덩이·다리 증상 악화(환자 응답)', provenance: 'PATIENT_FACT' }
```
즉 **문자열 안에 `(환자 응답)`이라고 적혀 있는 값**이다. 이게 `O`에 도달하면
파일 헤더의 ONE ABSOLUTE RULE 위반이다.

**재현 (변이 m6).** `examFindingsLines`의 반환줄에 한 줄 추가:
```ts
const why = i.reasonFacts.length ? ` (${i.reasonFacts.map((f) => f.text).join(', ')})` : ''
return `${i.title}: ${EXAM_CHECK_STATUS_LABEL[status]}${lat}${note}${why}`
```
결과:
```
=== MUTATION m6 (reasonFacts -> O) FULL SUITE applied to src/doctor/workspace/emrPreview.ts ===
RESULT: SURVIVED (exit 0) <<<<<<<<<< MUTANT NOT KILLED
```
`npm run test:all` 전체 통과. 원인은 `tests/lbp-working-hypothesis.spec.mjs:589`의
`filled` fixture가 `reasonFacts: []`이기 때문이다 — 규약 2가 명시한
"fixture에서 입력을 빼면 그 입력에 대한 변이를 더 이상 잡지 못한다"의
**하위 필드 버전**이다.

**왜 지금 중요한가.** "이 검사를 왜 하는가"를 EMR에 함께 남기자는 요청은
언제든 나올 수 있는 자연스러운 요구이고(화면에는 이미 `왜 확인?`으로 노출된다),
그 순간 구현자는 초록색 스위트를 근거로 안전하다고 판단하게 된다.

**권고 수정.** `filled` fixture의 exam/reassessment 항목에
`reasonFacts: [{ text: '<환자 자가보고 카나리아>', provenance: 'PATIENT_FACT' }]`를
넣고, 기존 `O` exact-match 단언을 그대로 통과시킨다(= 카나리아가 `O`에
나타나지 않음을 exact-match가 증명). 추가로
`oBoundaryInput`에 `reasonFacts`가 채워진 examSuggestion 1개를 넣어
`O: `(bare)를 단언한다.

---

### H-2 [HIGH] `UNKNOWN`(아직 확인 못함)을 `없음`으로 기록하는 변이가 살아남는다

**무엇이 문제인가.**
`emrPreview.ts:164`의 주석은 rule 2를 이렇게 선언한다:
> `'UNKNOWN'` and undefined both mean "not yet assessed" … and are omitted —
> only an actually-recorded finding renders … never rendered as "음성"/"없음".

라벨표는 `NONE`/`SEVERE_OR_PROGRESSIVE` 두 키만 갖고 있어 오늘은 옳다. 그러나
**`'UNKNOWN'`을 넘긴 fixture가 저장소 전체에 하나도 없다.**
`allEmptyInput`은 이 키를 아예 생략하므로 `undefined` 분기만 잠긴다.

**재현 (변이 a4).**
```ts
const LBP_OBJECTIVE_MOTOR_DEFICIT_LABEL = {
  NONE: '없음',
  SEVERE_OR_PROGRESSIVE: '심하거나 빠르게 진행함',
  UNKNOWN: '없음',          // <-- 변이
}
```
결과:
```
=== MUTATION a4 applied to src/doctor/workspace/emrPreview.ts ===
RESULT: SURVIVED (exit 0) <<<<<<<<<< MUTANT NOT KILLED
```
`npm run test:all` 전체 통과. 이 변이가 프로덕션에 들어가면 **원장이 아직
진찰하지 않은 상태가 차트에 "객관적 근력저하: 없음"으로 기록된다** — 미평가를
음성으로 둔갑시키는, 이 저장소가 2.5b에서 규칙으로 못 박은 바로 그 유형이며,
해당 필드는 `URGENT_REVIEW`에 영향을 주는 안전 필드다.

**대조군(정상 동작 확인).** 같은 자리에 `NOT_PERFORMED`/`LIMITED`를
`음성/정상`으로 바꾸는 변이(a3)와, 인식 못 하는 status를 `NEGATIVE`로
fallback 시키는 변이(a5)는 **둘 다 죽었다**. 즉 `ExamCheckStatus` 6상태 쪽
경계는 제대로 잠겨 있고, 이 라벨표만 비어 있다.

**권고 수정.** 단언 1개:
```js
const unknownText = buildPainWorkspaceEmrPreview({ ...allEmptyInput, primaryConcern: '요통', lbpObjectiveMotorDeficit: 'UNKNOWN' })
assert("rule 2: 'UNKNOWN'(아직 확인 못함)은 O에 어떤 형태로도 나타나지 않는다 -- O stays bare",
  unknownText.split('\r\n').find((l) => l.startsWith('O:')) === 'O:')
```

---

### M-1 [MEDIUM] rule 4(`previous`를 오늘 결과로 출력 금지)가 잠겨 있지 않다

`reassessmentFindingsLines`의 주석은 "only `result` (today's), never
`previous`"라고 선언한다. `filled` fixture의 재검 항목은 `previous: null`이라
이 규칙에 대한 커버리지가 0이다.

**재현 (변이 m7).** `result`가 아직 `NOT_YET_CHECKED`이면 `previous.status`를
대신 출력하도록 바꿈 → `npm run test:all` **SURVIVED (exit 0)**.

임상적 의미: 지난 방문의 `양성`이 오늘 재검 결과인 것처럼 EMR에 기록된다.
`reassessmentExam.ts` 파일 헤더가 "a prior POSITIVE/NEGATIVE is never copied
forward as if it were already re-confirmed"라고 못 박은 바로 그 동작이다.

**권고.** `filled`의 재검 항목에 `previous: { status: 'POSITIVE', … }`를
채우고(오늘 `result`와 다른 값으로), 기존 `O` exact-match가 `previous` 값을
포함하지 않음을 그대로 증명하게 한다.

---

### M-2 [MEDIUM] 삭제된 32테스트의 매핑 표 중 한 행에는 실제 대체 단언이 없다

`tests/save-conflict.spec.mjs:429-433`의 매핑 표는 이렇게 적는다:
```
DoctorTokenSetup shown inline for kind==='auth'  | ObjectiveExamFindingsCard still has this: `{authError &&
                                                 | <DoctorTokenSetup authFailed .../>}` (unchanged by this
                                                 | batch -- not retested here since this batch did not touch it)
```
표의 제목은 "Where that property **lives now**"이고 다른 행들은 전부 실제
테스트 이름을 가리킨다. 이 행만 **소스에 그 줄이 있다**는 진술이며, 그 줄을
지키는 단언은 저장소 어디에도 없다.

**재현 (변이 c9).** `src/doctor/ObjectiveExamFindingsCard.tsx:283`
`{authError && <DoctorTokenSetup authFailed onSet={() => setAuthError(false)} />}`
한 줄 삭제 → `npm run test:all` **SURVIVED (exit 0)**.

`JudgmentPanel` 제거로 이 카드는 **judgment의 유일한 클라이언트 writer**가
됐다(§17.3). 그 화면에서 토큰이 만료됐을 때의 인라인 복구 경로가 회귀 없이
사라질 수 있는 상태다(다른 4곳에 `DoctorTokenSetup`이 있어 완전 잠김은 아니다 —
그래서 HIGH가 아니라 MEDIUM).

**권고.** `cardSrc`에 대한 소스 단언 1줄
(`assert.match(cardSrc, /\{authError && <DoctorTokenSetup/)`) 추가 후,
매핑 표의 해당 행을 그 테스트 이름으로 교체한다. CLAUDE.md "지운 경로 1개당
소스 단언 1개"를 문자 그대로 충족시키는 방법이다.

---

### M-3 [MEDIUM] PHI 카나리아 간헐 실패 — **원인 규명 완료. PHI 누출이 아니다.**

`tests/server.spec.mjs:937`:
```js
assert('audit log: no phone digits from the canary submission leak in', !auditRaw.includes('9999'))
```
`auditRaw`는 **audit.log 파일 전체 텍스트**다. 그 시점에 파일에는 이미 여러
제출·방문의 `submission_id`/`visit_id`가 들어 있고, 이들은 `randomUUID()`
(16진수)다. `'9999'`는 16진수 부분문자열로 우연히 등장할 수 있다.

**실측(계측 사본으로 1회 실행, 원복 완료):**
```
PROBE lines=99 uuids=28 hexchars=1008 has9999=false
```
**몬테카를로(실제 `crypto.randomUUID()`, 28개 × 200,000회):**
```
Monte Carlo: P(a 28-UUID audit log contains "9999") = 0.00897 (1793/200000)
=> expected spurious failures per 100 full test:all runs: 0.90
```
즉 **full run당 약 0.9%의 오경보율**이다. "1회 실패 후 8회 재실행 미재현"은
이 확률과 정확히 일치하는 패턴이며(9회 중 1회 이상 실패 확률 ≈ 7.8%),
`ts`(ISO 타임스탬프)로는 연속 `9` 4개가 나올 수 없으므로 UUID가 유일한 후보다.
실제 PHI가 샜다면 **간헐이 아니라 항상** 실패한다.

**게이트를 막아야 하는가: 아니다.** 그러나 파일럿 전에 고쳐야 한다 —
PHI 카나리아가 1%씩 거짓 경보를 내면 팀이 그 실패를 무시하도록 학습된다.
바로 옆의 `PRIVACY_CANARY` 마커 단언은 같은 문제가 없고(16진수로 만들 수 없는
문자열), 라인별 allowed-keys 단언도 이미 통과하므로 안전 속성 자체는 이중으로
지켜지고 있다.

**권고 수정.** id 필드를 제외하고 스캔한다:
```js
const nonIdText = allLines.map((l) => JSON.stringify({ ...l, submission_id: undefined, visit_id: undefined })).join('\n')
assert('audit log: no phone digits from the canary submission leak in (id 필드 제외 — UUID 우연 충돌 방지)', !nonIdText.includes('9999'))
```

---

### L-1 `revisitRecapText`: 타입·문서·테스트는 있고 **호출자는 0**

§14.1은 `O/S`를 "태블릿 발병 시점/기간 + **(재진) 경과 요약**"으로 정의하고,
`emrPreview.ts:184`의 doc comment도 그렇게 적는다. `tests/lbp-working-hypothesis.spec.mjs:605,690`이
동작을 단언한다. 그런데:
```
$ grep -rn "revisitRecapText" src/
src/doctor/workspace/emrPreview.ts:185:  revisitRecapText?: string | null
src/doctor/workspace/emrPreview.ts:276:  if (input.revisitRecapText?.trim()) osParts.push(input.revisitRecapText.trim())
```
`PainWorkspace.tsx:700`도 `DoctorView.tsx:3180`도 이 키를 넘기지 않는다.
`summarizeRevisitQuickCheckKo`의 유일한 호출처는 `RevisitWorkspace.tsx:474`
(화면 표시용)이다. **재진 레코드의 EMR에는 경과 요약이 들어가지 않는다.**

이미 `HANDOFF.md:398`의 백로그에 "`revisitRecapText` 배선"으로 올라와 있어
새 발견은 아니다. 다만 (a) §14.1의 키 정의가 절반만 구현됐고, (b) 프로덕션
경로가 한 번도 태우지 않는 입력에 대해 테스트가 초록색을 내고 있다는 점은
기록해 둔다. 파일럿 전 필수는 아니다.

---

### L-2 `learning_case` / `debrief`에 deprecated 주석 누락

`judgment.ts`는 4.1-A(`saju_only_prediction` 외 3개)와 4.1-C(`innate_features`/
`symptom_links`)에는 필드별 "deprecated, 새 코드에서 읽지 말 것" 주석을 달았다.
4.1-D가 UI를 지운 `learning_case`(:72)와 `debrief`(:73)에는 없다. 다음 사람이
`learning_case`를 "살아 있는 필드"로 읽고 다시 배선할 수 있다. §17.4가 요구한
"타입은 전부 유지"는 지켜졌으나 그 근거 표기는 두 필드에서 빠졌다.

### L-3 `emrPreview.ts` 헤더의 주장이 코드보다 강하다

헤더(:11-17)는 "the exact same text `EmrPreviewCard` shows … One composed
text, two read sites, **never two different ones**"라고 단정한다. 실제로는
- `PainWorkspace.tsx:700` — **라이브 in-memory** `workspaceState`로 조립
- `DoctorView.tsx:3180` — `deserializeWorkspaceState(selectedRecord?.workspace)`,
  즉 **서버에 저장된** workspace로 조립

두 텍스트는 autosave 디바운스(`SAVE_DEBOUNCE_MS = 900`) + 왕복 동안 다르고,
autosave가 conflict/실패로 fail-closed면 그동안 계속 다르다. 시드 effect와
`요약 다시 만들기` escape hatch, 그리고 workspace의 `saveStatus`/ConflictBanner가
완화하고 있으므로 실동작 위험은 낮지만, **헤더의 단정은 다음 사람에게
"이 둘은 정의상 같다"로 읽힌다.** 문구를 "동일한 composer, 서로 다른 시점의
state"로 정정할 것을 권고한다.

### L-4 `openPostTreatmentIds`가 레코드 전환 시 초기화되지 않는다

`FollowUpTargetPicker.tsx:92`의 `useState<Set<string>>`는 target **id** 기준이고
`resetKey`를 받지 않는다. 환자 A에서 `pain_intensity`의 `직후 값 기록`을 펼친
뒤 환자 B로 전환하면, B의 같은 id target도 펼쳐진 채로 시작한다. **값은 props에서
오므로 환자 간 값 누수는 없다** — 펼침 여부만 이월된다. 다만 이 저장소는
`ObjectiveExamFindingsCard`의 m4에서 정확히 같은 패턴(첫 mount만 읽는 state)을
안전 문제로 고친 이력이 있으므로 기록해 둔다.

### L-5 `.gitignore` 잔존 항목

`tests/.judgment-panel-bundle.cjs`가 아직 `.gitignore`에 있다. `package.json`의
esbuild 스텝은 제대로 제거됐고 파일도 생성되지 않는다(확인:
`ls tests/.judgment-panel-bundle.cjs` → No such file). 순수 위생 문제.

### L-6 이전 closing review의 미이행 remediation

`docs/LBP_V1_BATCH4_OPUS_CLOSING_REVIEW_v0.1.md:496-498`은 "(b) `DECISIONS.md`에
§14.5 중단 근거를 1항목으로 남긴다"를 요구했다. `grep -n "14.5" DECISIONS.md`
→ 해당 항목 없음. `HANDOFF.md:396-398` 백로그에는 있다. 커밋 `61dca0a`의
**제목**은 여전히 `… CRM reassess_due wiring`이라 구현된 것처럼 읽히고
(본문 §14.5는 정확히 "미구현"이라고 적는다), 커밋은 불변이므로 `DECISIONS.md`
항목이 그 오독을 막는 유일한 장치다.

---

## 2. A~E 항목별 확인 결과 (근거 포함)

### A. 임상 안전

#### A-1 `O | 객관적 소견` 경계 — **제품 PASS / 검증 FAIL(H-1)**

**(i) `O`에 push되는 모든 소스가 원장 확인 소견인가 — 전수 확인.**
`emrPreview.ts:200-222`, push 지점은 정확히 4개:

| # | push 문 | 소스 | 원장 입력인가 | 근거 |
|---|---|---|---|---|
| 1 | `검사 결과: …` | `PhysicalExamSuggestion.result` (`status`/`laterality`/`note`) + `title` | ✅ | `examSuggestion.ts:35-42` — `note`는 "Free-text clinician note … Never auto-filled", `recordedAt`은 "when the clinician entered this result". `title`은 `lbpExamSuggestions.ts`의 고정 문자열 표 |
| 2 | `허리 움직임 반응: …` | `LbpDirectionalResponse` 고정 라벨 | ✅ | 원장이 chip으로 고르는 관찰 기록. `NOT_ASSESSED`·무효값은 omit(defect #8) |
| 3 | `오늘 재검 소견: …` | `ReassessmentExamItem.result` | ✅ | `reassessmentExam.ts:30-31` — `source`는 항상 `OBSERVED`, `result`는 항상 `NOT_YET_CHECKED`에서 시작 |
| 4 | `객관적 근력저하: …` | `ClinicianJudgment.lbp_objective_motor_deficit` | ✅ | `judgment.ts` 헤더 "원장이 진찰 후 입력", 환자 LBP_02와 **별개 필드** |

**(ii) 환자 자가보고 입력이 전부 `S`/`O/S`로만 가는가 — 전수 확인.**
composer의 환자 유래 입력은 5개: `onsetDurationText`(O/S),
`revisitRecapText`(O/S), `aggravatingText`(S), `impactText`(S),
`microFollowUpText`(S). 전부 `osParts`/`sParts`로만 push된다.
호출부(`DoctorView.tsx:3180-3201`, `PainWorkspace.tsx:700-715`)에서도
`examSuggestions`/`reassessment`/`lbpDirectionalResponse`/
`lbpObjectiveMotorDeficit` 외에는 `O`로 가는 인자가 없다.

**변이 테스트(라벨 있이/없이 각각) — 6/6 KILLED.** §4 표 참조.
그러나 **하위 필드 변이 m6은 살아남았다 → H-1.**

**fixture 실측(46개 전수 렌더).** 예: fixture [8] LBP —
```
C/C: 아픈 곳이 있어요
O/S: 3개월~1년
S: 악화요인: 움직일 때 악화; 일상 영향: 많이 불편해요
O:
A:
P:
```
6키 고정, 순서 정확, `O` bare. fixture [45] mixed도 동일 + 한약 블록 별도.

#### A-2 안전 필드 저장 경로 — **PASS**

- **편집 UI 생존.** 46 fixture 전수 렌더에서 `객관적 하지 근력저하 소견 (LBP)`
  라디오 3개(`없음`/`심하거나 빠르게 진행함`/`아직 확인 못함`)가 LBP·HIP
  프로필 17개 fixture에 렌더된다. `객관적 회전근개 근력저하 소견 (SHOULDER)`도
  fixture [9],[10]에 렌더(`없음`/`외상 후 새로 생긴 근력저하 확인됨`/`아직 확인 못함`).
- **before/after 실측 비교**: 이 두 문자열의 렌더 횟수가 `2 → 1`로 줄었다.
  사라진 1개는 JudgmentPanel의 **읽기 전용 echo**이고, 남은 1개가 **편집 가능한
  카드**다 — §17.4 표대로다. 편집 컨트롤은 하나도 사라지지 않았다.
- **저장 경로.** `DoctorView.tsx:3333-3359` `handleSaveObjectiveExamField`:
  `source` 구성 → `base = selectedRecord?.judgment ?? null` →
  `{ ...(base ?? createEmptyJudgment(source)), [field]: value }` →
  `saveJudgmentToServer(selectedId, next, selectedRecord?.updated_at)`.
  **기존 judgment의 다른 필드를 보존**하며, CAS 기준을 매 저장마다 최신
  `selectedRecord`에서 읽는다.
- **409 충돌.** 자동 retry/merge 없음(`saveJudgmentToServer` 호출 1회 —
  `save-conflict.spec.mjs`가 정규식으로 고정). conflict 시 로컬 선택 유지 +
  ConflictBanner, `최신 내용 불러오기` → `handleReloadObjectiveExamConflict`가
  서버 값을 verbatim 채택. LBP/SHOULDER conflict state 분리.
- **레코드 전환 초기화.** `ObjectiveExamFindingsCard.tsx:112-126` —
  `resetKey`(= `unifiedResetKey`) 변화 시 render-time에 두 값·두 status·
  `authError`·두 conflict를 전부 재시드. `doctor-reset-key.spec.mjs:380-410`이 고정.
- **인증 만료.** `{authError && <DoctorTokenSetup authFailed …/>}` 존재.
  **단, 이 줄을 지켜주는 단언이 없다 → M-2.**
- `DoctorWorkspace.tsx:588-596`에서 `onSave`/`onReloadConflict`/`resetKey`가
  전달되고, `DoctorView.tsx:4310-4311`에서 서버 모드일 때만 핸들러가 붙는다.

#### A-3 `ExamCheckStatus` 6상태 — **PASS**

`provenance.ts:126-137`의 라벨 6개는 서로 다르며 `LIMITED`=`제한적 시행(판단 유보)`,
`NOT_PERFORMED`=`시행 못 함`, `NOT_YET_CHECKED`=`아직 확인 안 됨`.
composer는 `NOT_YET_CHECKED`와 **인식 불가 status**를 둘 다 omit하고, 나머지는
자기 라벨로 출력한다. 변이 a3(`NOT_PERFORMED`/`LIMITED` → `음성/정상`)과
a5(무효 status → `NEGATIVE` fallback)는 **둘 다 KILLED**.

#### A-4 UNKNOWN/미평가가 정상으로 취급되는 경로 — **제품 PASS / 검증 FAIL(H-2)**

새로 생긴 경로는 없다. `lbpObjectiveMotorDeficit`은 `UNKNOWN`/`undefined`에서
라벨이 `undefined`가 되어 push 자체가 일어나지 않는다. 그러나 `UNKNOWN`
분기를 지키는 단언이 없어 변이 a4가 생존한다(H-2).

#### A-5 환자 개인정보 — **PASS**

- 새 fixture `src/doctor/fixtures.ts:1376-1409`는 합성 데이터다(이름 `유하준`,
  `BIRTH_01: '19820730'`, 전화 미지정 → 기존 46개 fixture와 동일한 합성 관례).
  실제 환자 값의 흔적 없음.
- `git log 61dca0a~1..HEAD` 커밋 메시지, `docs/`의 새 문서 4종, `HANDOFF.md`/
  `DECISIONS.md` 추가분 — 전부 필드명·구조 수준 논의. 실제 답변값 없음.
- `.data/`, `.env` 커밋 없음(diffstat 26파일 전부 소스/테스트/문서).

### B. 제거 안전 규칙 준수 (CLAUDE.md 4항)

#### B-6 필드 × 화면 표 vs 실제 코드 — **PASS (grep 재확인 완료)**

설계 문서의 "의도적 폐기" 주장을 믿지 않고 직접 grep했다:

| 필드 | `src/` 내 잔존 위치 | 표의 주장과 일치? |
|---|---|---|
| `saju_only_prediction` | `judgment.ts` ×4 (타입/기본값/주석) | ✅ 완전 폐기 |
| `revised_after_exam` | `judgment.ts` ×2, `emrSummary.ts` ×1(사문), `emrPreview.ts` ×1(**주석**) | ✅ 실행 경로 0 |
| `final_treatment_axis` | 동일 | ✅ |
| `prescription_direction` | 동일 | ✅ |
| `innate_features` | `judgment.ts` ×5 | ✅ |
| `symptom_links` | `judgment.ts` ×4 | ✅ |
| `learning_case` | `judgment.ts` ×2, `DoctorView.tsx` ×2(**주석만**) | ✅ (주석 누락은 L-2) |
| `debrief` | `judgment.ts` ×4, `DoctorView.tsx` ×2(주석), `finalAssessment.ts` ×1(무관 식별자) | ✅ |
| `DEBRIEF_QUESTIONS` | `judgment.ts` 정의 + `DoctorView.tsx` 주석 | ✅ 렌더 0 |
| `outlineQuestion` | **0** | ✅ |
| `judgmentRecordedFieldCount` | `DoctorView.tsx` ×2(주석만) | ✅ |
| `MyungriCompactCard`/`sajuStatusLine`/`myungriGroupCount` | 정의 + 주석. **호출 0** | ✅ §15.5대로 |
| `buildEmrSummary` | `emrSummary.ts` 자기 정의 + 주석. **import 0** | ✅ |

§15.5가 요구한 "각 export 상단 주석(되살릴 때 `viewProfile !== 'pain'` 게이트
복원)"도 세 export 모두에 실제로 붙어 있다(`DoctorView.tsx:709-715, 740-748, 1929-1933`).

#### B-7 §17.0 유형의 6번째 사고 — **찾지 못했다 (fixture 실측 + before/after diff)**

§17.0을 잡아낸 방법(fixture를 렌더해 원장이 보는 글자를 직접 읽기)을
**두 단계로 강화해서** 수행했다.

**(1) 현재 렌더 46 fixture 전수 문자열 검색**
```
NEEDLE "사주": 0/46 fixtures
NEEDLE "명리": 0/46 fixtures
NEEDLE "디브리핑": 0/46 fixtures
NEEDLE "학습 케이스": 0/46 fixtures
NEEDLE "원장 판단 기록": 0/46 fixtures
NEEDLE "설명 개요": 0/46 fixtures
NEEDLE "선천 특징": 0/46 fixtures
NEEDLE "출생 시간대": 9/46 fixtures  (herbal 8 + mixed 1 — pain 0)
```

**(2) 배치 전(`61dca0a~1`) 번들을 별도 worktree에서 빌드해 같은 46 fixture를
렌더하고, 화면 문자열 집합을 diff했다.** "지운 쪽이 아니라 안 지운 쪽"을
기계적으로 강제하는 방법이다. 사라진 줄 전부를 분류한 결과:

| 사라진 줄 (fixture 수) | 대체 경로 | 판정 |
|---|---|---|
| 사주 4문항·선천 특징·증상 연결·설명 개요·1분 디브리핑·학습 케이스·`기록`·`원장 판단 기록` (45) | 의도적 폐기 (PO 결정) | ✅ 설계대로 |
| 옛 EMR 라벨 15종(`진찰 소견:`/`Assessment:`/`시행/예정 처치:`/`치료 목표:` …) (37) | 6키 절로 전부 이동 — **15개 전부 새 포맷의 절에 1:1 대응 확인** | ✅ 손실 0 |
| `EMR용 복사` (45) | §14.3 — fixture/preview 모드엔 종결이 없어 복사 버튼도 없음 | ✅ 설계대로 |
| `객관적 하지 근력저하 소견 (원장 진찰, LBP): …` (17), 회전근개 (2) | **읽기 전용 echo만** 제거. 편집 카드는 그대로 (2→1) | ✅ §17.4대로 |
| 명리 원국/일간/오행/한열조습/계산주의/정규화 날짜 (8) | `원본 JSON`에 잔존, 계산·저장 유지 | ✅ §15.4대로 |
| `출생시간대` + `태어난 시간대를 선택해주세요.` (8) | `출생 시간대`(원장용 라벨) 9개로 대체 | ✅ |
| **`기간` / `일상 영향` 라벨 (herbal fixture 0/6/7에서 1→0)** | **추적 조사함** — 값은 두 곳에 그대로 남아 있다: lane1 요약(`1~3개월 · 3~4일`)과 `문진 원본 > 주호소`(`언제부터 불편하셨나요? / 1~3개월`, `일상생활에 얼마나 영향을 주나요? / 많이 불편해요`). 사라진 것은 제거된 `명리 검토 > 현재 문진 요약` **3번째 열의 중복 라벨**뿐 | ✅ 손실 0 |

**결론: 화면에서 사라졌는데 대체가 없는 값은 하나도 찾지 못했다.**
(한계: `renderToStaticMarkup`은 접힌 `<details>` 내용도 마크업으로 내보내므로
"보이지 않지만 DOM에 있는" 것과 "보이는" 것을 구분하지 못한다. 다만 이번
검사의 결론은 전부 **부재**(0회) 또는 **값의 잔존 위치 확인**이라 이 한계에
영향받지 않는다.)

#### B-8 입력 방향 — **PASS (1건 관찰)**

배치 이후 편집 가능한 필드 중 어디에도 읽히지 않는 것:
- `ClinicianJudgment`의 deprecated 7필드: **편집 UI가 0개**이므로 "쓰이는데 안
  읽히는" 상태가 아니다(원래 문제의 반대 — 완전 제거). 타입 유지 근거는
  `server/**` FROZEN + `tests/server.spec.mjs` zero-diff로 실증됨.
- `outlineQuestion`: 완전 제거(저장 경로가 애초에 없었음).
- **반대 방향 1건**: `revisitRecapText`는 읽는 쪽(composer)은 있는데 **쓰는 쪽이
  없다** → L-1.

### C. 테스트 비공허성

#### C-9 "없다"를 주장하는 단언 — **8/8 KILLED (제거 단언 자체는 비공허)**

`doctor.spec.mjs`의 제거 단언들은 전부 **렌더된 `html`** 대상이라 규약 1(esbuild
이스케이핑)에 걸리지 않는다. 확인 차 8개에 대해 "제거를 되돌린" 변이를 넣었고
전부 죽었다(§4 표 c1~c8).

이번 배치가 새로 추가한 단언 중 **`.cjs`/`.mjs` 번들 텍스트에 한글 리터럴로
검사하는 것은 0건**이다(diff 전수 검색). T3만 번들 대상인데 ASCII 식별자
(`clinicianJudgmentAssessment` 등)라 규약 1의 영향 밖이다.
`esbuildEscapeNeedle` 헬퍼는 유일한 호출처(`.judgment-panel-bundle.cjs`)가
사라져 함께 제거됐고, 그 근거가 `doctor-reset-key.spec.mjs:24-33`에 남아 있다.

**그러나** 위 3개 변이(m6/m7/a4)가 살아남았다 → H-1/H-2/M-1. 즉
**"제거를 주장하는 단언"은 튼튼하고, "안전 경계를 주장하는 단언"에 구멍이 있다.**

#### C-10 삭제된 32테스트의 대체 커버리지 — **대체로 PASS, 1행 FAIL(M-2)**

- `save-conflict.spec.mjs:380-440`의 매핑 표가 지목하는
  `독립 검수 HIGH-2: ObjectiveExamFindingsCard stale-write conflict` 섹션은
  `:1031-1125`에 **실제로 존재하며 테스트 9개**를 담고 있다. `git log -L`로
  확인한 결과 그 섹션의 최종 수정은 `d82f397`(2026-09-01)이고
  `git merge-base --is-ancestor d82f397 61dca0a~1` → **이 배치 이전부터 있던 것**이다.
  주장대로다.
- `N/A` 논거 검토:
  - "handleRecord fails closed on a pending conflict" → 즉시저장 설계에는
    `기록` 버튼도 pending-conflict 게이트도 없다. **타당.** 같은 속성("절대
    조용히 덮어쓰지 않는다")은 `setConflict(null)` → save 순서 단언으로 유지.
  - "version-sync effect / pristine draft" → 즉시저장에는 보호할 draft가 없다.
    **타당.** 표도 "genuinely does not carry over, not merely untested"라고
    정직하게 적는다.
  - "successful save snapshots the LIVE judgment" → `finalizeJudgment`를 부르지
    않으므로 스냅샷 개념 자체가 없다. **타당.**
  - "DoctorTokenSetup shown inline for kind==='auth'" → **부당.** 대체 테스트가
    없다(M-2).
- `doctor-reset-key.spec.mjs` −10: T1/T2/T13/T14 + #9는 "파일 자체가 없다"는
  **더 강한 사실** 2개(파일 부재 + `package.json`에 esbuild 스텝 부재 +
  `DoctorView.tsx`에 `JudgmentPanel` 문자열 0)로 대체됐다. §17.5의 "정정,
  단순 삭제 아님" 지시를 지켰다. **타당.**

#### C-11 기존 단언 약화 여부 — **PASS**

`doctor.spec.mjs`에서 갱신된 것들은 전부 **강화 또는 반전**이다:
- T23이 "still renders"(4건)에서 "no longer renders"로 **반전**(§17.5 지시대로).
  삭제가 아니라 반전이라 "한때 보존하기로 했다가 결정이 바뀌었다"는 이력이 남는다.
- T18(`명리·감사 기록` 존재)이 `!includes('명리·감사 기록')` +
  `!includes('디브리핑·학습 기록')` 2건으로 **확장**.
- T28이 신설되어 전 프로필 렌더 결과에 `사주`/`명리` 문자열 **0회**를 전역으로
  잠갔다 — §17.0을 놓치게 만든 검사를 정확히 겨냥한 것으로, 이번 배치에서
  가장 가치 있는 단언이다.
- `duplication audit`가 `기간` 라벨 3회 → **2회 exact**로 강화(제거된 명리 열 반영).
- 약화된 단언은 발견하지 못했다.

### D. 아키텍처·범위

- **D-12 3단 구조 / 화면 분리 — PASS.** `src/spec/**` zero-diff. 변경 파일 26개
  중 소스는 전부 `src/doctor/**`. `src/screens`·`src/components`·`src/saju`·
  `src/crm`·`src/lib` 무변경. patient/doctor 분리 유지.
- **D-13 범위 초과 — PASS(정당화됨).**
  - `fixtures.ts`에 mixed 프로필 fixture 1개 추가: §16.6 T8이 요구하는
    커버리지이고, 기존에 `PAIN_01` + `HERBAL_ADDON_ACTIVE:'yes'` 조합 fixture가
    없었음을 주석이 근거와 함께 밝힌다. 프로덕션 번들에 들어가지만 46개 기존
    fixture와 동일한 취급이다. **정당.**
  - `LBP_MOTOR_DEFICIT_OPTIONS`/`SHOULDER_CUFF_WEAKNESS_OPTIONS`의
    `JudgmentPanel.tsx` → `judgment.ts` 이전: 값·라벨 byte-for-byte 동일.
    이걸 하지 않았으면 §17.3이 지키려던 **안전 카드가 컴파일 에러로 사라졌을
    것이다**(설계 규칙 2가 이 사건에서 나왔다). **정당하고 필수.**
- **D-14 FROZEN zero-diff — PASS.**
  ```
  $ git diff --stat 61dca0a~1..HEAD -- 'src/spec/**' index.html src/App.tsx 'server/**' 'tablet core/**' tests/server.spec.mjs
  (출력 없음)
  ```
- **D-15 죽은 코드 판단 — 대체로 PASS.**
  - `emrSummary.ts`: import 0, 데이터 소스 0. 헤더에 "이중 사문" 명시. 남긴
    판단은 **타당**(삭제는 분리 가능 항목이고, `tests/emrSummary.spec.mjs`가
    아직 그 모듈을 직접 검증한다). 다만 파일럿 이후 정리 대상.
  - `MyungriCompactCard`/`sajuStatusLine`/`myungriGroupCount`: 렌더 0.
    §15.5의 "남긴다" 근거(12차/13차 하드닝 회귀 테스트가 컴포넌트를 직접
    렌더해 계속 지킨다 — `doctor.spec.mjs:837-853, 2864-2977`) 확인. **타당.**
  - `applyNextReassessmentPlanToEpisode`: 호출자 **여전히 0**. §14.5는
    "서버 스키마 변경 없이 불가능하면 중단하고 보고한다"고 했고 커밋 본문이
    정확히 그렇게 보고했다. **판단 타당.** 단 커밋 제목과 `DECISIONS.md`
    공백은 L-6.

### E. 알려진 미해결

**E-16 PHI 카나리아 간헐 실패 — 원인 규명 완료(M-3).** 위 M-3 참조.
**게이트를 막지 않는다** — PHI 누출이 아니라 `!auditRaw.includes('9999')`가
랜덤 UUID 28개가 든 파일 전체를 스캔하는 데서 오는 0.9%/run 오경보다.
파일럿 착수 전에는 고쳐야 한다(카나리아 불신 학습 방지).

---

## 3. 테스트·빌드 실행 결과 (실측)

```
$ npm run test:all   (1회차)
...
SUMMARY: 17 assertions passed, 0 failed (total 17)
EXIT=0
"OK: " 라인 수: 4952

$ npm run test:all   (2회차)
...
SUMMARY: 17 assertions passed, 0 failed (total 17)
EXIT=0
"OK: " 라인 수: 4952        ← 1회차와 완전 동일 (비결정성 없음)
```
주요 스위트 요약(1회차, 2회차 동일):
```
1154 integration · 246 crm-store · 126 audit-registry · 90 save-conflict
1041 doctor · 276 doctor-workspace · 179 workspace-round3
145 revisit-quick-check · 239 lbp-working-hypothesis · 12 doctor-reset-key
73 view_profile matrix · 93 saju
```
카나리아 단언은 두 번 모두 통과:
```
run1:5782  OK: audit log: no phone digits from the canary submission leak in
run2:5782  OK: audit log: no phone digits from the canary submission leak in
```

```
$ npm run build
✓ 285 modules transformed.
dist/assets/index-DJcZKDOx.js   693.12 kB │ gzip: 216.97 kB
✓ built in 1.86s
```
(`tsc -b` 통과. 청크 크기 경고는 이 배치 이전부터 있던 것.)

---

## 4. 변이 테스트 전체 기록

모든 변이는 스크립트로 적용 → 대상 스위트 실행 → **무조건 원복** → `git status`
확인의 순서로 수행했다. 최종 상태: `git status --short` 출력 없음(clean),
`git worktree list`에 임시 worktree 없음, `tests/.r20-audit-probe.mjs` 삭제 완료.

### 4.1 `O` 경계 (A-1) — 대상 `emrPreview.ts`, 스위트 `test:lbp-working-hypothesis`

| # | 변이 | 결과 | 죽인 단언 |
|---|---|---|---|
| m1 | `oParts.push(\`악화요인: ${input.aggravatingText.trim()}\`)` (**라벨 있이**) | **KILLED** | `T11/§14.1 filled example (defect #6, all 4 O clauses populated): O carries exactly the 4 clinician-confirmed sources … and nothing patient-reported` |
| m2 | `oParts.push(input.aggravatingText.trim())` (**라벨 없이**) | **KILLED** | 동일 |
| m3 | `oParts.push(input.microFollowUpText.trim())` (라벨 없이) | **KILLED** | 동일 |
| m4 | `oParts.push(input.onsetDurationText.trim())` (라벨 없이) | **KILLED** | 동일 |
| m5 | `oParts.push(input.impactText.trim())` (라벨 없이) | **KILLED** | 동일 |
| m5b | `oParts.push(input.revisitRecapText.trim())` (라벨 없이) | **KILLED** | 동일 |
| **m6** | `examFindingsLines`에 `reasonFacts` 텍스트 덧붙임 | **SURVIVED** (`test:all` 전체) | — → **H-1** |
| **m7** | `reassessmentFindingsLines`가 `previous.status`를 오늘 결과로 출력 | **SURVIVED** (`test:all` 전체) | — → **M-1** |

### 4.2 미평가/상태 라벨 (A-3/A-4) — 대상 `emrPreview.ts`, 스위트 `test:all`

| # | 변이 | 결과 |
|---|---|---|
| a3 | `NOT_PERFORMED`/`LIMITED` → `음성/정상`으로 출력 | **KILLED** |
| **a4** | `LBP_OBJECTIVE_MOTOR_DEFICIT_LABEL`에 `UNKNOWN: '없음'` 추가 | **SURVIVED** → **H-2** |
| a5 | 인식 불가 status를 `NEGATIVE`로 fallback (omit 대신) | **KILLED** |

### 4.3 제거 단언 비공허성 (C-9) — 대상 `DoctorView.tsx`, 스위트 `test:doctor`

c1~c7은 `원본 JSON` 아코디언 직전에 `<p className="mutant-probe">…</p>`를
삽입해 "제거를 되돌린" 상태를 만든 것이다.

| # | 되돌린 문자열 | 결과 | 죽인 단언 |
|---|---|---|---|
| c1 | `1분 디브리핑 (선택)` | **KILLED** | `T23 (reversed): "1분 디브리핑" disclosure no longer renders` |
| c2 | `사주만 보고 어떤 임상문제를 예상했는가?` | **KILLED** | `T25: DEBRIEF_QUESTIONS[1] … does not render (herbal profile)` |
| c3 | `명리 검토` | **KILLED** | `T28: "명리" does not render anywhere (herbal profile)` |
| c4 | `핵심 선천 특징` | **KILLED** | `T13: 핵심 선천 특징 no longer renders (herbal profile)` |
| c5 | `설명 개요` | **KILLED** | `T14: "설명 개요" disclosure summary no longer renders` |
| c6 | `디브리핑·학습 기록` | **KILLED** | `T27: "디브리핑·학습 기록" accordion does not render (herbal profile)` |
| c7 | `학습 케이스` | **KILLED** | `T23 (reversed): "학습 케이스" toggle no longer renders` |
| c8 | `viewProfile !== 'pain'` 게이트를 `true`로 (BIRTH_* 노출) | **KILLED** | `T9: pain record shows no 출생 시간대 label` |

### 4.4 삭제된 32테스트의 대체 커버리지 (C-10) — 대상 `ObjectiveExamFindingsCard.tsx`, 스위트 `test:all`

| # | 변이 | 결과 |
|---|---|---|
| **c9** | `{authError && <DoctorTokenSetup authFailed …/>}` 줄 삭제 | **SURVIVED** → **M-2** |

### 4.5 PHI 카나리아 원인 규명 (E-16)

`tests/server.spec.mjs`의 계측 사본(`tests/.r20-audit-probe.mjs`, `.gitignore`의
`tests/.r20-*` 규칙에 걸려 추적되지 않음, 실행 후 삭제)으로 1회 실행:
```
PROBE lines=99 uuids=28 hexchars=1008 has9999=false
```
몬테카를로(실제 `crypto.randomUUID()`):
```
Monte Carlo: P(a 28-UUID audit log contains "9999") = 0.00897 (1793/200000)
=> expected spurious failures per 100 full test:all runs: 0.90
```

---

## 5. 살아남은 변이 (surviving mutants) — 그 자체가 결함

| 변이 | 침해되는 계약 | 계약이 적힌 곳 | 결함 |
|---|---|---|---|
| **m6** | `O` 줄에 환자 자가보고가 어떤 형태로도 들어가지 않는다 | `emrPreview.ts` 헤더 ONE ABSOLUTE RULE, §14.1, 전 부위 문서 공통 | H-1 |
| **a4** | 미평가(`UNKNOWN`)를 `음성`/`없음`으로 렌더하지 않는다 | `emrPreview.ts` rule 2, Batch 2.5b | H-2 |
| **m7** | 재검 항목의 `previous`를 오늘 결과인 것처럼 출력하지 않는다 | `emrPreview.ts` rule 4, `reassessmentExam.ts` 헤더 | M-1 |
| **c9** | 안전 필드 저장 화면에서 인증 만료 시 인라인 복구 경로가 있다 | `save-conflict.spec.mjs:429` 매핑 표 | M-2 |

**세 개가 같은 원인이다**: exact-match fixture가 항목 객체의 **하위 필드**를
비워 둔 채로 만들어졌다(`reasonFacts: []`, `previous: null`,
`lbpObjectiveMotorDeficit`에 `'UNKNOWN'` 없음). `DECISIONS.md` 규약 2의
경고("fixture에서 입력을 빼면 그 입력에 대한 변이를 더 이상 잡지 못한다")를
**한 단계 아래로 확장**해야 한다:

> **규약 2 확장안**: 안전 경계를 exact-match로 잠글 때, fixture는 그 줄에
> 도달할 수 있는 객체의 **모든 하위 필드를 비어 있지 않게** 채운다. 비워 둔
> 하위 필드는 그 필드에 대한 커버리지가 0이라는 뜻이며, exact-match는 그
> 사실을 감춘다.

---

## 6. 설계자(Fable)가 놓친 것 / 구현자(Sonnet)가 놓친 것

### 설계자(Fable)
- **§15.7/§16.6/§17.6의 mutation 요구가 "제거 단언"에만 걸려 있었다.**
  T1~T6·T13~T15·T18·T24~T28 전부에 "변이 필수"를 붙였고 실제로 전부 비공허하다
  (c1~c8로 재확인). 그러나 **유지 단언(T11 `O` 경계, T12 6키)에는 변이 요구를
  붙이지 않았다.** 그 결과 이 배치에서 가장 안전에 가까운 단언 두 개(H-1/H-2)가
  검증 없이 통과했다. §17.0의 교훈("표를 채우는 것과 화면을 읽는 것은 다르다")의
  테스트 판본이 필요하다: **"제거를 검증하는 것과 유지를 검증하는 것은 다르다."**
- **§14.1이 `O/S`에 "(재진) 경과 요약"을 넣기로 했는데 배선 조건을 명시하지
  않았다.** 그 결과 타입과 테스트만 생기고 호출자가 없다(L-1).
- **C-10 매핑 표의 한 행이 "테스트가 있다"가 아니라 "소스에 줄이 있다"였다.**
  표의 다른 12행은 전부 테스트 이름을 가리키는데 이 행만 형식이 다르다.
  "not retested here since this batch did not touch it"라는 문구가
  **원래 그 속성을 지키던 테스트를 이 배치가 지웠다**는 사실과 모순된다(M-2).

### 구현자(Sonnet)
- **`filled` fixture의 하위 필드를 비워 둔 채로 만들었다.** delta review defect
  #6에서 "O의 4개 절을 전부 채워라"는 지적을 받고 절 4개는 채웠지만, 각 절이
  꺼내 쓰는 **객체 자체의 하위 필드**(`reasonFacts`, `previous`)는 비워 뒀다.
  기술적으로는 지시를 이행했으나 지시의 목적("변이가 발화할 수 있게 하라")은
  한 층 아래에서 다시 깨졌다.
- **`revisitRecapText`를 composer에만 넣고 호출부에 넣지 않았다**(L-1).
  타입·주석·테스트 3종은 완비했는데 배선 1줄이 없다. `HANDOFF.md` 백로그에
  올려둔 것은 정직하다.
- **`learning_case`/`debrief`의 deprecated 주석 누락**(L-2) — 4.1-A/4.1-C 필드는
  전부 붙였는데 4.1-D 필드 2개만 빠졌다.
- `openPostTreatmentIds`에 `resetKey`를 연결하지 않았다(L-4).

### 두 역할 다 잘한 것 (기록해 둘 것)
- **T28**(`전 프로필 렌더에 `사주`/`명리` 0회`)은 §17.0을 놓치게 만든 검사를
  정확히 겨냥한 전역 잠금이고, 내 독립 렌더 검사와 결과가 일치했다.
- `LBP_MOTOR_DEFICIT_OPTIONS` 이전을 구현 중에 발견해 처리한 것은 §17.3이
  지키려던 안전 경로를 컴파일 에러로 잃을 뻔한 것을 막았다(설계 규칙 2).
- §14.4의 `치료 직후 값` 가시성을 mount latch가 아닌 파생식 +
  첫 키스트로크 latch로 구현한 것은 Batch 2.6 N-2를 정확히 회피한다.
- §14.5를 무리해서 "연결한 척"하지 않고 중단하고 보고한 것은 옳다.

---

## 7. 파일럿 착수 전 필수 vs 나중에 해도 되는 것

### 파일럿 착수 전 **반드시** (= 이 게이트를 닫는 조건)
1. **H-1** — `filled`/`oBoundaryInput` fixture의 exam·reassessment 항목에
   `reasonFacts`를 환자 자가보고 카나리아로 채우고, 기존 `O` exact-match가
   그대로 통과함을 보인다. **변이 m6이 죽는 것을 확인하고 기록한다.**
2. **H-2** — `lbpObjectiveMotorDeficit: 'UNKNOWN'` 케이스에 대해
   `O:`(bare) 단언 1개 추가. **변이 a4가 죽는 것을 확인하고 기록한다.**
3. **M-1** — `filled`의 재검 항목에 `previous`를 오늘 `result`와 다른 값으로
   채운다. **변이 m7이 죽는 것을 확인하고 기록한다.**
4. **M-2** — `ObjectiveExamFindingsCard`의 인증 복구 렌더에 대한 소스 단언 1줄
   추가 + `save-conflict.spec.mjs` 매핑 표의 해당 행을 그 테스트 이름으로 교체.
   **변이 c9가 죽는 것을 확인한다.**
5. **M-3** — 카나리아 단언을 id 필드 제외 스캔으로 바꾼다. PHI 누출이 아님을
   `DECISIONS.md`/`HANDOFF.md`의 백로그 항목에 원인과 함께 확정 기록한다
   (현재는 "원인 미규명"으로 남아 있다).
6. **규약 2 확장안**(§5 말미)을 `DECISIONS.md`에 1항목으로 남긴다 — 이 배치에서
   같은 함정의 **하위 필드 변종**이 3번 재현됐으므로, 다음 배치가 같은 곳에
   빠지지 않게 하는 유일한 장치다.

위 6건은 전부 **테스트/문서 변경**이며 프로덕션 코드 수정이 없다.
`docs/…_v0.1.md` §18.2의 "착수 전 전제"에 6번 항목으로 추가할 것을 권고한다.

### 나중에 해도 되는 것
- **L-1** `revisitRecapText` 배선 — 재진 EMR에 경과 요약이 필요하다는 것이
  파일럿에서 실제로 확인되면 그때 붙인다. **파일럿의 관찰 항목으로 삼는 것이
  오히려 낫다**(§18.6의 "안 채운 칸"이 다음 배치의 입력이라는 원칙과 같다).
- **L-2** deprecated 주석 2개 추가.
- **L-3** `emrPreview.ts` 헤더 문구 정정("동일 composer, 서로 다른 시점의 state").
- **L-4** `FollowUpTargetPicker`에 `resetKey` 연결.
- **L-5** `.gitignore` 잔존 항목 제거.
- **L-6** `DECISIONS.md`에 §14.5 중단 근거 1항목.
- `src/doctor/emrSummary.ts` + `tests/emrSummary.spec.mjs` 삭제(§15.3 권고) —
  파일럿 이후.

### 확신이 없는 것 (그대로 적는다)
- **L-3의 실제 위험도.** 종결의 EMR 텍스트가 참고 자료의 미리보기보다 오래된
  상태로 복사될 수 있는 창(autosave 실패/충돌이 지속되는 동안)이 실제 진료에서
  얼마나 자주 열리는지 나는 모른다. `saveStatus`와 ConflictBanner가 원장에게
  보이므로 완전한 침묵은 아니지만, **"저장 실패 상태에서 EMR을 복사한다"는
  시나리오는 파일럿에서 의도적으로 한 번 관찰할 가치가 있다.**
- **`renderToStaticMarkup` 기반 화면 실측의 한계.** 접힌 `<details>`와
  CSS로 숨긴 요소를 구분하지 못한다. 이번 결론은 전부 "0회 등장" 또는 "값의
  잔존 위치 확인"이라 영향받지 않지만, 앞으로 "보이는가"를 검증해야 하는
  항목에는 이 방법을 쓸 수 없다.
- **B-7에서 6번째 사고를 찾지 못했다는 것이 "없다"는 뜻은 아니다.**
  내가 쓴 방법(배치 전/후 46 fixture 렌더 문자열 집합 diff)은 fixture가
  도달하는 화면 상태에 대해서만 완전하다. **서버 모드에서만 렌더되는 영역
  (종결 섹션, 재진 워크스페이스, 이전 방문 카드, 메시징)은 이 방법의 사각지대**이며,
  그 영역은 소스 읽기와 기존 테스트로만 확인했다. 파일럿의 §18.4 기록 6종이
  바로 그 사각지대를 메우는 수단이다.

---

## 8. 게이트 상태

- Batch 4 + Batch 4.1(A/B/C/D) 게이트: **CLOSED 아님.**
- 재검수 재요청 조건: §7의 필수 6건 완료 + 그 6건에 대한 **변이 사망 기록**.
  프로덕션 코드가 바뀌지 않으므로 재검수는 delta(테스트 diff + 변이 기록
  재현)만으로 충분하다 — 전체 재검수를 다시 돌릴 필요는 없다.
- Sonnet 자가검증도 Fable 독립검증도 게이트가 아니라는 원칙(2.5b 교훈)은
  이번에도 유효했다. **두 검증 모두 통과한 상태에서 안전 경계 위의 변이 2개가
  살아 있었다.**

---

## 9. Delta 재검수 (2026-09-04)

# 판정: **FAIL** — Batch 4 + 4.1 게이트를 닫지 않는다.

**검수 대상:** `289a800..HEAD`(현 HEAD `2e0a8a0`), 6파일 +324/−8.
**검수 역할:** Opus (독립 검수자). **코드는 한 줄도 고치지 않았다** — 변이는 전부
스크립트로 적용 후 무조건 원복, 매번 `git status --short` 빈 출력 확인.

### 9.0 판정 요지

**§7이 요구한 5건은 형식적으로 전부 이행됐고, 기록된 변이 4개(m6/a4/m7/c9)는
이번엔 전부 죽는다.** 그 사실은 아래 §9.2에 실패 메시지 원문과 함께 기록했다.
프로덕션 코드는 `src/` zero-diff — 직전 검수의 제품 PASS 판정은 그대로 유효하다.

**그런데도 FAIL인 이유:** 수정이 **"그 변이 하나"만 죽이는 좁은 단언**이었다.
같은 계약을 침해하는 변종을 직접 고안해 넣었더니 **4개가 전체 스위트를
통과했고, 그중 2개는 다시 `O` 경계 위**다.

| 변종 | 무엇을 하는가 | 결과 |
|---|---|---|
| **v2** | `reasonFacts` 중 `provenance === 'DERIVED'`인 것만 `O`에 덧붙임 | **SURVIVED (`test:all`)** |
| **v3** | **아직 시행 안 한**(`NOT_YET_CHECKED`) 검사 항목의 `reasonFacts`를 `O`에 새 절로 덧붙임 | **SURVIVED (`test:all`)** |
| **v6** | 재검 항목의 오늘 결과가 비어 있으면 `previous`를 대신 출력 | **SURVIVED (`test:all`)** |
| **v9** | 렌더 줄은 그대로 두고 `result.kind === 'auth'` 분기가 `authError`를 켜지 않게 함 | **SURVIVED (`test:all`)** |

v2/v3는 **환자 유래 텍스트가 `O | 객관적 소견`에 도달하는 경로**다. 특히 **v3는
프로덕션의 기본 상태**를 겨냥한다 — 생성된 모든 검사 항목은
`NOT_YET_CHECKED`에서 시작하고(`emptyExamResult()`,
`tests/lbp-exam-suggestions.spec.mjs:339`), 화면은 그 항목에 대해 이미
`왜 확인?`으로 `reasonFacts`를 노출한다. **이번 fixture는 드문 상태(기록 완료된
검사)만 덮고, 흔한 상태(미시행 검사)를 비워 뒀다.** 직전 검수가 H-1의 동기로
적은 시나리오("이 검사를 왜 하는가를 EMR에 함께 남기자는 요청") 그 자체다.

v6은 **직전 검수 §1의 M-1 본문이 글자 그대로 서술한 변이**다("`result`가 아직
`NOT_YET_CHECKED`이면 `previous.status`를 대신 출력하도록 바꿈"). 새 fixture는
오늘 `result`를 `POSITIVE`로 채웠기 때문에 그 fallback이 **발화조차 하지
않는다.** 죽은 것은 §7 표에 적힌 무조건 스왑 형태뿐이다.

**이번 사고는 직전 검수가 지적한 것과 똑같은 형태다.** 규약 2 확장("하위 필드를
비워 두지 않는다")을 지켜 `reasonFacts`/`previous`를 채웠지만, **채운 값이 그
필드가 가질 수 있는 모양 중 하나뿐**이었다 — `PATIENT_FACT` 1개, 기록 완료된
결과 1개. 규약이 한 단계 더 아래에서 다시 깨졌다. 이것이 다섯 번째 반복이다.

**남은 작업은 여전히 작다** — fixture 항목 2~3개와 단언 3~4개, 프로덕션 코드
변경 0.

---

### 9.1 범위 확인 (요구 항목 5)

```
$ git diff --stat 289a800..HEAD -- 'src/**' 'index.html' 'server/**' 'tablet core/**'
(출력 없음)
```
`src/` **zero-diff 사실이다.** 변경 파일은 `tests/` 3개 + `DECISIONS.md` +
`HANDOFF.md` + `docs/LBP_PRODUCTION_V1_MINIMAL_ARCHITECTURE_v0.1.md`뿐이며
`.data/`·`.env` 없음. 범위 초과 변경은 찾지 못했다.

**빌드·스위트(실측):**
```
$ npm run test:all   (1회차)  EXIT=0   "OK: " 4956줄
$ npm run test:all   (2회차)  EXIT=0   "OK: " 4956줄   ← 완전 동일, 비결정성 없음
$ npm run build                EXIT=0  (tsc -b + vite build, 1.95s)
```
4956 = 직전 4952 + 신규 단언 4개. 구현자 보고와 일치한다.

---

### 9.2 변이 테스트 전체 기록

모든 변이: 스크립트 적용 → 스위트 실행 → **무조건 원복** → `git status --short`
빈 출력 확인. 최종 상태 clean, 임시 worktree 없음, 임시 파일 없음.

#### 9.2.1 직전 검수가 살아남았다고 기록한 변이 4개 — **4/4 KILLED**

| # | 변이 | 결과 | 죽인 단언 / 실패 메시지 원문 |
|---|---|---|---|
| **m6** | `examFindingsLines`의 `.map()` 반환에 `reasonFacts` 텍스트를 덧붙임 | **KILLED** | `Error: FAIL: T11/§14.1 filled example (defect #6, all 4 O clauses populated): O carries exactly the 4 clinician-confirmed sources (검사 결과/허리 움직임 반응/오늘 재검 소견/객관적 근력저하) and nothing patient-reported` |
| **a4** | `LBP_OBJECTIVE_MOTOR_DEFICIT_LABEL`에 `UNKNOWN: '없음'` 추가 | **KILLED** | `Error: FAIL: H-2: rule 2 -- 'UNKNOWN' (아직 확인 못함) never appears on O in any form -- O stays bare` |
| **m7** | `reassessmentFindingsLines`가 `i.result.status` 대신 `i.previous?.status`를 출력 | **KILLED** | m6과 동일(T11 exact-match) |
| **c9** | `ObjectiveExamFindingsCard.tsx:283`의 `{authError && <DoctorTokenSetup … />}` 한 줄 삭제 | **KILLED** | `AssertionError [ERR_ASSERTION]: The input did not match the regular expression /\{authError && <DoctorTokenSetup authFailed onSet=\{\(\) => setAuthError\(false\)\} \/>\}/` |

#### 9.2.2 변종 변이 — **10개 중 6 KILLED / 4 SURVIVED**

`SURVIVED` 판정은 전부 **`npm run test:all` 전체**로 재확인했다(대상 스위트만이
아니라 전체 통과를 확인). `KILLED`는 해당 스위트에서의 사망으로 충분하다.

| # | 계열 | 변종 내용 | 결과 | 죽인 단언 / 비고 |
|---|---|---|---|---|
| v1 | m6 | `reasonFacts` 전부를 **라벨 없이 별도 `O` 절**로 push | **KILLED** | T11 exact-match |
| **v2** | m6 | `provenance === 'DERIVED'`인 `reasonFacts`만 `검사 결과` 절에 덧붙임 | **SURVIVED (test:all)** | → **H-3** |
| **v3** | m6 | `NOT_YET_CHECKED` 항목의 `reasonFacts`를 `확인 필요 사유:` 절로 `O`에 push | **SURVIVED (test:all)** | → **H-3** |
| v4 | a4 | 라벨표는 그대로 두고 `oParts.push(\`객관적 근력저하: ${motorDeficitLabel ?? '없음'}\`)`로 fallback | **KILLED** | `Error: FAIL: H-2: rule 2 -- 'UNKNOWN' …` |
| v5 | a4 | `ExamCheckStatus`의 다른 미평가 상태(`NOT_YET_CHECKED`)를 `음성/정상`으로 매핑 | **KILLED** | `AssertionError: no exam-findings clause at all when every exam is NOT_YET_CHECKED` (`tests/doctor-workspace.spec.mjs:478`) — 이 경계는 이 배치 밖에서 이미 잠겨 있다 |
| **v6** | m7 | 오늘 `result`가 `NOT_YET_CHECKED`일 때만 `previous.status`를 대신 출력(= 직전 검수 §1 M-1이 서술한 형태) | **SURVIVED (test:all)** | → **M-4** |
| v7 | m7 | `previous`를 `O`가 아닌 **`A` 키**로 유출(`재검 소견:` 절) | **KILLED** | `Error: FAIL: §14.1 filled example: A carries 최종 임상 판단 + 치료 초점 (Batch 4.1-A: 원장 평가/치료·처방 방향 clauses removed)` |
| v8 | c9 | 렌더는 남기되 `{false && authError && …}`로 무력화 | **KILLED** | c9와 동일 정규식 |
| **v9** | c9 | 렌더 줄은 그대로, `result.kind === 'auth'` 분기가 `setAuthError(true)` 대신 `setAuthError(false)` | **SURVIVED (test:all)** | → **M-5** |
| r1 | M-3 역방향 | `server/index.js`의 `SUBMISSION_CREATED` audit 호출에 실제 전화번호 값을 **비-id 필드(`status`)**로 실어 보냄 | **KILLED** | `Error: FAIL: audit log: no phone digits from the canary submission leak in (id fields excluded from the scan -- see DECISIONS.md 2026-09-04 M-3)` |
| r2 | M-3 역방향 | 같은 값을 **`visit_id` 필드**에 실어 보냄 | **SURVIVED** | → **M-6**(가림 확인, 게이트 비차단) |

#### 9.2.3 신규 단언의 비공허성 검증(별도 프로브)

m6은 T11에서 먼저 죽기 때문에, **격리 H-1 블록의 단언이 스스로 값을 하는지**를
따로 확인했다. T11과 H-1 양성 대조 단언을 임시로 무력화한 상태에서 m6을 적용:

```
Error: FAIL: H-1: reasonFacts' patient-self-report canary text never appears
anywhere in the output, even though the item's own finding does
```
→ **격리 블록은 공허하지 않다.** (프로브는 즉시 원복, `git status` 빈 출력 확인.)

---

### 9.3 신규 결함

| # | 심각도 | 항목 | 파일 |
|---|---|---|---|
| **H-3** | **HIGH** | H-1 수정이 `reasonFacts`의 **한 가지 모양만** 잠갔다 — `DERIVED` 사실(v2)과 **미시행 항목**의 사실(v3)이 `O`로 새는 변이가 생존 | `tests/lbp-working-hypothesis.spec.mjs:600, 777-800` |
| **M-4** | MEDIUM | M-1 수정이 rule 4의 **무조건 스왑만** 잠갔다 — 오늘 결과가 빈칸일 때 `previous`를 끌어오는 형태(v6, M-1 본문이 서술한 바로 그 형태)가 생존 | `tests/lbp-working-hypothesis.spec.mjs:627` |
| **M-5** | MEDIUM | M-2 수정이 **렌더 줄만** 잠갔다 — 그 줄을 켜는 트리거(`kind === 'auth'` → `setAuthError(true)`)를 지키는 단언이 없어 v9가 생존 | `src/doctor/ObjectiveExamFindingsCard.tsx:157`, `tests/save-conflict.spec.mjs:1144` |
| **M-6** | MEDIUM(게이트 비차단) | M-3의 id 필드 **통째 제외**가 "id 필드에 PHI를 넣는" 변이 종류를 영구히 가린다(r2 생존) | `tests/server.spec.mjs:948-951` |
| L-7 | LOW | `HANDOFF.md`의 "이 문서 커밋 기준 HEAD는 이 커밋 직전 `289a800`"이 실제와 두 커밋 어긋난다(직전 커밋은 `771d47e`) | `HANDOFF.md` |

#### H-3 [HIGH] `reasonFacts` 잠금이 한 가지 모양뿐이다

새 fixture는 `reasonFacts`를 **`{ text: <canary>, provenance: 'PATIENT_FACT' }`
1개**로, 그리고 그 항목의 `result.status`를 **`NEGATIVE`(기록 완료)**로 채웠다.
그 두 좌표를 벗어나면 커버리지가 다시 0이다.

**(a) provenance 축 — v2.** `examSuggestion.ts:51`은 `reasonFacts`를 "patient/
derived facts only"라고 정의하고, `provenance.ts`는 `DERIVED`를 "이미 승인·CLOSED
된 코드가 태블릿 답변으로부터 계산한 것"으로 정의한다. 프로덕션에 실제 값이
있다 — `lbpExamSuggestions.ts:172`
`{ text: '양쪽 다리 증상(시스템 계산 — 신경학적 기저검사 필요)', provenance: 'DERIVED' }`.
파일 헤더의 ONE ABSOLUTE RULE은 "Everything **derived from a tablet answer** …
feeds `S`/`O/S` only"라고 적으므로 이 값이 `O`에 도달하면 그 규칙 위반이다.
그런데 저장소 전체에 `provenance: 'DERIVED'`인 `reasonFacts`를
`buildPainWorkspaceEmrPreview`에 넘기는 fixture가 **하나도 없다.**

**(b) 항목 상태 축 — v3(더 중요).** `generateLbpExamSuggestions`가 만드는 모든
항목은 `NOT_YET_CHECKED`에서 시작한다. 화면(`ExamSuggestionCard.tsx:110-113`)은
바로 그 미시행 항목에 대해 `reasonFacts`를 `왜 확인?`으로 이미 보여준다. 즉
**원장이 화면에서 보는 "왜 확인?" 텍스트를 EMR에도 넣자**는 것이 가장 자연스러운
다음 요청이고, 그 변이가 지금 전체 스위트를 통과한다.

```
=== MUTATION v3 (NOT_YET_CHECKED 항목의 reasonFacts -> O) / npm run test:all ===
RESULT: SURVIVED (exit 0) <<<<<<<<<< MUTANT NOT KILLED
```

**권고(프로덕션 코드 변경 0):**
1. `filled`의 `e1`과 격리 H-1 항목의 `reasonFacts`에 **`provenance: 'DERIVED'`
   카나리아를 두 번째 원소로** 추가한다(기존 exact-match 기대값은 그대로 통과해야 한다).
2. `oBoundaryInput` 계열에 **`result.status: 'NOT_YET_CHECKED'` + `reasonFacts`
   카나리아**인 exam 항목 1개를 넣고 `O:`(bare) + `!text.includes(canary)`를 단언한다.
   — 이렇게 하면 §9.4(a)의 "exam 항목을 추가하면 `O`가 bare일 수 없다"는 제약도
   함께 해소된다(미시행 항목은 `O`에 절을 만들지 않는다).

#### M-4 [MEDIUM] rule 4가 여전히 한쪽만 잠겨 있다

새 fixture는 `previous.status: 'NEGATIVE'` / 오늘 `result.status: 'POSITIVE'`다.
`previous`를 **무조건** 쓰는 변이는 exact-match가 잡는다. 그러나 실제 사고 형태는
"기록된 오늘 결과를 덮어쓰는 것"이 아니라 **"빈칸을 지난 값으로 채우는 것"**이고,
그 형태(v6)는 오늘 `result`가 `POSITIVE`라 발화하지 않는다.
`reassessmentExam.ts` 헤더가 금지하는 문장 그대로다 — "a prior POSITIVE/NEGATIVE
is never copied forward **as if it were already re-confirmed**".

**권고:** 재검 항목을 하나 더 두거나 별도 블록을 만들어
`result.status: 'NOT_YET_CHECKED'` + `previous.status: 'POSITIVE'`를 넘기고,
`O`에 `오늘 재검 소견` 절이 **생기지 않음**(O bare)을 단언한다.

#### M-5 [MEDIUM] M-2가 렌더만 잠그고 트리거를 잠그지 않았다

새 소스 단언은 `{authError && <DoctorTokenSetup …/>}` 줄의 존재만 고정한다.
`handleChange`의 `else if (result.kind === 'auth') { setStatus('error');
setAuthError(true) }`에서 `true`를 `false`로 바꾸면 **줄은 그대로 남은 채 인증
만료 인라인 복구 경로 전체가 죽고**, 전체 스위트가 통과한다(v9).

이것은 구현자가 매핑 표 두 번째 행에 **정직하게 미검증으로 남긴** 성질과 같은
자리다(§9.4(b) 참조). 정직한 표기는 옳지만, 이 성질은 **삭제된 32테스트가 원래
지키던 것**이므로 CLAUDE.md의 "지운 경로 1개당 소스 단언 1개"는 아직 미충족이다.

**권고:** `save-conflict.spec.mjs`에 `handleChange` 슬라이스 대상 단언 1~2줄
(`assert.match(fn, /result\.kind === 'auth'[\s\S]*setAuthError\(true\)/)` 및
성공/충돌 분기의 `setAuthError(false)`) 추가 후 매핑 표 두 번째 행을 그 테스트
이름으로 교체.

---

### 9.4 M-3 검출력 판정 — **수정은 옳다. 진단도 이제 실증됐다.**

#### (i) 제외한 두 필드가 정말 서버 생성 UUID뿐인가 — **코드로 확인함**

`server/audit.js:102-126`의 `logEvent`는 고정 6키(`ts`/`event`/`submission_id`/
`actor`/`status?`/`visit_id?`)만 쓴다. 두 id의 출처를 전수 확인했다:

| 경로 | 값의 출처 | 판정 |
|---|---|---|
| 생성 시 | `server/store.js:297` `const id = randomUUID()`, `server/visitStore.js:110,114` `randomUUID()` | 서버 생성 UUID |
| 읽기/갱신 시(`index.js:602/618/639/670/1150/1229/1306/1388/1420` 등, `id = parts[2]`) | URL 경로 세그먼트(클라이언트 제공)지만 **모든 호출이 조회 성공(`record`/`visit`이 실재) 뒤에만 audit를 쓴다** — 존재하는 레코드 id와 문자열이 일치해야 하므로 결국 서버 생성 UUID | 서버 생성 UUID |
| 클라이언트가 id를 정하는 생성 경로 | 없음(`episode_id`만 caller-controlled이며 audit 6키에 들어가지 않는다) | 해당 없음 |

즉 **오늘 이 두 필드에 UUID 외의 것이 들어갈 경로는 없다.**

#### (ii) 원래 의도의 검출력이 유지되는가 — **역방향 변이로 실증(r1 KILLED)**

`server/index.js`의 `SUBMISSION_CREATED` audit 호출에 카나리아 제출의 실제
전화번호 값을 **비-id 필드**로 실어 보냈더니 새 단언이 그대로 죽었다.
`JSON.stringify({ ...l, submission_id: undefined, visit_id: undefined })`는 나머지
키를 전부 그대로 직렬화하므로, "예상 키든 아니든 어떤 비-id 필드로도 전화번호가
새지 않는다"는 원래 속성은 **전부 보존된다.**

#### (iii) 오경보율 — **직접 측정(15회 + 40회)**

```
$ npm run test:server × 15   →  PASS=15 FAIL=0
```
0.9%/run 기준선에서 15회는 표본이 약하므로, **옛 형태(`auditRaw.includes('9999')`,
id 포함 전체 스캔)가 같은 실행에서 발화했을지를 비단언 프로브로 함께 기록**하고
40회를 더 돌렸다(프로브는 실행 후 원복, `git status` 빈 출력 확인):

```
N=40
old (id-inclusive) form would have failed: 1/40
new (id-excluded)  form actually failed:   0/40
audit-log id 문자수/run: 3616 (모든 실행 동일)
```

**이 1건이 결정적 증거다.** 그 실행에서 `auditRaw`에는 `9999`가 있었지만
`nonIdAuditText`에는 없었다 — 즉 `9999`는 **id 필드 안**에 있었다. 몬테카를로
추정이 아니라 실제 실행에서 "PHI 없음 + 옛 형태 발화"가 재현된 것이며, 직전
검수의 진단(UUID hex 우연 충돌)을 실증한다. **새 형태는 55회 연속 오경보 0.**

#### (iv) id 필드에 PHI가 들어갈 수 있는 경로 — **오늘은 없다. 그러나 가려진다(M-6).**

r2(전화번호를 `visit_id`에 이어붙이는 변이)는 **생존**한다. (i)에서 확인했듯
오늘 그런 코드 경로는 없으므로 **게이트를 막지 않는다.** 다만 이 제외는 그
변이 종류를 영구히 보이지 않게 만든다.

**권고(비차단, 비용 2줄):** 통째 제외 대신 **모양 단언 + 전체 스캔**으로 바꾼다.
```js
const idVals = allLines.flatMap((l) => [l.submission_id, l.visit_id]).filter((v) => v != null)
assert('audit log: 두 id 필드는 서버 생성 UUID 형태만 갖는다(PHI가 들어오면 여기서 죽는다)',
  idVals.every((v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v)))
```
이러면 오경보는 사라지면서 id 필드의 PHI도 계속 잡힌다.

---

### 9.5 기존 단언 약화 여부 — **약화 없음 (PASS)**

- **`filled` fixture에 채운 값이 기대값을 바꿨는가: 아니다.** delta의 `-`줄은
  `reasonFacts: []`, `previous: null`, save-conflict 매핑 표 주석 3줄,
  그리고 M-3 단언 1줄뿐이다. **exact-match 기대 문자열은 한 글자도 바뀌지
  않았다** — `filledLines[3]`은 여전히
  `'O: 검사 결과: SLR(하지직거상) 검사: 음성/정상; 허리 움직임 반응: 숙이면(굴곡) 호전; 오늘 재검 소견: SLR(하지직거상) 재검: 양성/이상 소견; 객관적 근력저하: 없음'`이다.
  즉 카나리아를 넣고도 출력이 그대로라는 것을 exact-match가 증명하는 구조이며,
  "테스트를 통과시키려고 기대값을 맞춘" 흔적은 없다. **이 부분은 정확히 옳게 했다.**
- **신규 단언의 공허성:** 4개 전부 죽는 변이를 확인했다 — H-2는 a4/v4,
  M-2는 c9/v8, M-3는 r1, 격리 H-1 2개는 §9.2.3의 전용 프로브. `없다`를 주장하는
  단언은 3개(H-1 canary, H-2 bare, M-3)인데 모두 **짝이 되는 긍정 대조**가 있다
  (H-1은 같은 블록의 `O: 검사 결과: …` exact-match, H-2/M-3은 변이 사망).
- **규약 1(esbuild 이스케이핑) 저촉 0.** 신규 단언 중 번들 텍스트 대상은 없다 —
  lbp 쪽은 함수의 런타임 출력, M-2는 `fs.readFileSync`한 raw `.tsx` 소스다.
- **규약 2 및 이번 확장분:** 확장 규약의 **문구**는 지켰으나(하위 필드를 채웠다)
  **목적**은 미달이다 — 채운 값이 그 필드가 가질 수 있는 모양 중 하나뿐이었다
  (H-3/M-4). 규약을 한 번 더 조여야 한다:
  > **규약 2 확장 ②**: 하위 필드를 채울 때는 **그 필드의 판별자(discriminator)가
  > 갖는 값마다**(provenance 종류, 항목 상태 `NOT_YET_CHECKED` 대 기록완료,
  > `previous` 유무 × 오늘 `result` 유무) 각각 한 좌표씩 fixture를 둔다.
  > "채웠다"는 그 필드에 대한 커버리지가 아니라 **채운 그 한 좌표에 대한
  > 커버리지**다.

---

### 9.6 의도적 편차 2건에 대한 판단

**(a) `oBoundaryInput`에 직접 넣지 않고 별도 H-1 블록을 만든 것 — 논거는
맞지만 불완전하다. 이 편차가 H-3(v3)를 만들었다.**

"exam 항목을 추가하면 `O`가 bare일 수 없다"는 **기록 완료된 상태의 항목에
대해서만** 참이다. `result.status: 'NOT_YET_CHECKED'`인 항목은
`examFindingsLines`의 filter에서 걸러지므로 `O`는 **bare로 남는다**. 즉 직전
검수의 권고(=`oBoundaryInput`에 `reasonFacts`를 채운 항목을 넣고 `O:` bare 단언)는
**미시행 항목으로 그대로 이행 가능했고**, 그렇게 했다면 v3가 지금 죽었을 것이다.
별도 블록 자체는 좋은 추가(격리 방어)이지만 **원 권고의 대체가 아니라 보완**이었다.

**(b) `save-conflict.spec.mjs` 매핑 표 두 번째 행을 미검증으로 남긴 것 —
정직한 표기는 옳다. 그러나 그 정직함이 게이트를 통과시키는 근거는 아니다.**

거짓 주장("not retested here")을 사실 그대로 고친 것은 이 배치에서 가장 잘한
일 중 하나다. 다만 그 행이 서술하는 성질은 **삭제된 32테스트가 원래 지키던
것**이고, CLAUDE.md 4항은 "지운 경로 1개당 소스 텍스트 단언 1개"를 요구한다.
v9가 전체 스위트를 통과하는 이상 이 행은 **"N/A(원래 없던 것)"가 아니라
"아직 미이행"**이다. 다만 **이 한 건만으로 FAIL을 내지는 않는다** — H-3/M-4가
없었다면 M-5는 "다음 배치"로 넘길 수 있는 크기다.

---

### 9.7 문서 정합성 (요구 항목 4)

- **`DECISIONS.md` 규약 2 확장 기록 — 정확하고 잘 쓰였다.** 원인("exact-match는
  fixture가 비워 둔 하위 필드의 커버리지 0을 감춘다")이 정확히 서술돼 있다.
  다만 §9.5가 지적한 대로 **한 단계 더**(판별자 축) 조여야 한다.
- **M-3 "원인 규명 완료" 기록 — 정확하다.** §9.4(iii)의 40회 프로브가 이를
  실측으로 뒷받침한다(옛 형태 1/40 발화, 그 발화가 id 필드 안이었음). 다만
  `DECISIONS.md`의 "uuids=28 … 0.90%/run" 수치는 직전 검수의 1회 계측을 그대로
  옮긴 것으로, 이번 실측 환경에서는 id 문자수 3616/run이었다. **결론은
  동일**하며(원인·수정 모두 유효) 수치 차이는 표본/계측 방식 차이다.
- **변이 재검증 기록(`DECISIONS.md`/`HANDOFF.md`의 표) — 서술된 형태에 대해서는
  전부 사실이다.** 나도 같은 변이를 넣어 같은 실패 메시지를 재현했다. 다만
  `m7` 행이 서술하는 변이 형태는 §7 표의 형태이지 **§1 M-1 본문의 형태가
  아니며**(후자는 v6, 여전히 생존), 문서는 그 차이를 드러내지 않는다.
  "M-1 수정 완료"라는 표기는 **부분적으로만 사실**이다.
- **§18.2에 7번 전제를 추가한 것 — 옳다.** 단, 그 조문("결함 5건이 전부 수정되고
  변이 4개가 죽는 것이 확인")은 **문자 그대로는 이제 참**이지만 그 취지(구멍이
  닫혔다)는 아직 거짓이다. 이번 재검수 결과에 맞춰 조문을 "…및 이후 재검수가
  제기한 변종이 전부 죽는 것"으로 조이는 것을 권고한다.
- **L-7:** `HANDOFF.md` 최신 19 항목의 "이 문서 커밋 기준 HEAD는 이 커밋 직전
  `289a800`"은 실제와 다르다. 이 HANDOFF 커밋(`2e0a8a0`) 직전은 `771d47e`이고
  `289a800`은 그보다 3커밋 앞이다. CLAUDE.md("Git이 항상 맞다") 기준 정정 대상.

---

### 9.8 게이트를 닫기 위해 남은 것 (전부 테스트/문서, 프로덕션 코드 변경 0)

1. **H-3(a)** `filled`와 격리 H-1 항목의 `reasonFacts`에 `provenance: 'DERIVED'`
   카나리아 원소 추가 → **v2가 죽는 것을 확인·기록.**
2. **H-3(b)** `result.status: 'NOT_YET_CHECKED'` + `reasonFacts` 카나리아인 exam
   항목으로 `O:`(bare) + 카나리아 부재 단언 추가 → **v3가 죽는 것을 확인·기록.**
3. **M-4** `result.status: 'NOT_YET_CHECKED'` + `previous.status: 'POSITIVE'`인
   재검 항목으로 `O:`(bare) 단언 추가 → **v6이 죽는 것을 확인·기록.**
4. **M-5** `handleChange`의 `kind === 'auth'` → `setAuthError(true)` 소스 단언
   추가 + 매핑 표 두 번째 행 교체 → **v9가 죽는 것을 확인·기록.**
5. **규약 2 확장 ②**(§9.5 말미)를 `DECISIONS.md`에 1항목으로 남긴다.
6. **L-7** `HANDOFF.md`의 HEAD 표기 정정.

**비차단(파일럿 전 권고):** **M-6** — M-3의 id 필드 통째 제외를 UUID 모양 단언 +
전체 스캔으로 교체(§9.4 iv).

---

### 9.9 파일럿 착수 가부 — **불가**

§18.2의 7개 전제 기준:

| # | 전제 | 판정 | 근거 |
|---|---|---|---|
| 1 | Batch 4 게이트 CLOSED | ❌ | 이 재검수 판정 FAIL |
| 2 | 로컬 handoff 서버 LAN 전용 | 판정 보류 | 이번 delta에 `server/**` 변경 0. 운영 확인 사항이며 코드 검수로 답할 수 없다 |
| 3 | `.data/` 미커밋 | ✅ | delta에 `.data/`·`.env` 없음, `git status` clean |
| 4 | 환자 설명·동의 | 판정 보류 | 소프트웨어 밖(PO 책임) |
| 5 | `URGENT_REVIEW` 시 원장 행동 규약 문서화 | 판정 보류 | 소프트웨어 밖(PO 책임) |
| 6 | 중단 절차 | 판정 보류 | 소프트웨어 밖(PO 책임) |
| 7 | 게이트 차단 결함 5건 수정 + 변이 4개 사망 확인 | ⚠️ 형식 충족·취지 미달 | 변이 4개는 죽는다(§9.2.1). 그러나 같은 계약의 변종 4개가 생존(§9.2.2) — 7번이 막으려던 구멍(`O` 경계, 미평가-정상 혼동)이 아직 열려 있다 |

**1번이 ❌이므로 파일럿 착수 불가.** §9.8의 6건(작업량: fixture 원소 3개 +
단언 4~5개 + 문서 2항목)을 마치고 그에 대한 변이 사망 기록을 남기면,
다시 delta 재검수만으로 게이트를 닫을 수 있다.

---

### 9.10 확신이 없는 것 (그대로 적는다)

- **v2(DERIVED-only)의 실제 위험도는 v3보다 낮다.** 누군가 `reasonFacts`를 `O`에
  넣으면서 `provenance`로 걸러 `DERIVED`만 넣을 이유는 잘 떠오르지 않는다.
  내가 이것을 결함으로 올린 근거는 "이 시나리오가 일어난다"가 아니라
  **"그 필드의 절반에 대한 커버리지가 0이고, 채우는 비용이 배열 원소 1개"**라는
  것이다. **v3와 M-4는 그렇지 않다** — 둘 다 프로덕션의 기본 상태를 겨냥하고,
  둘 중 하나만으로도 나는 FAIL을 냈을 것이다.
- **어디서 멈춰야 하는지에 대한 원칙적 답을 나는 갖고 있지 않다.** 하위 필드,
  그 하위 필드의 판별자, 그 판별자의 조합… 무한 후퇴가 가능하다. 내가 쓴
  기준은 "**프로덕션에 실재하는 값이 그 좌표를 통과하는가**"였다 —
  `DERIVED` reasonFacts는 `lbpExamSuggestions.ts:172`에 실재하고,
  `NOT_YET_CHECKED` + `reasonFacts`는 모든 생성 항목의 초기 상태이며,
  `previous` 있고 오늘 결과 비어 있음은 재진 워크스페이스의 정상 상태다.
  이 기준이 옳다고 확신하지는 못하지만, **적어도 이번 4개 변종은 그 기준을
  통과했고 그래서 올렸다.**
- **M-5(v9)를 단독으로 만났다면 나는 FAIL을 내지 않았을 것이다.** 구현자가
  스스로 미검증이라고 적어 둔 자리이고, `DoctorTokenSetup`이 다른 4곳에 있어
  완전 잠김이 아니다. 지금 §9.8에 넣은 것은 다른 3건을 고치러 같은 파일을
  어차피 열기 때문이다.
- **`server/**` 검토는 audit 경로에 한정했다.** id 필드의 출처를 전수 확인했지만,
  그것은 `submission_id`/`visit_id`가 audit에 도달하는 경로에 대한 것이지
  서버 전반에 대한 재검수가 아니다(이번 delta에 `server/**` 변경이 0이므로
  범위 밖으로 두었다).
