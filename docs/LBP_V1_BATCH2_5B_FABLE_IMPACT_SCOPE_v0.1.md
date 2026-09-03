# LBP v1 Batch 2.5b — `ExamCheckStatus` 6상태 확장: 영향 범위 설계 (Fable)

- **문서 종류**: 착수 전 영향 범위 설계 (구현 아님). Sonnet 착수 조건.
- **대상 gap**: G15 (`docs/LBP_PRODUCTION_V1_MINIMAL_ARCHITECTURE_v0.1.md`
  §C3 / G15) — "structured 결과는 정상/이상/불명확/**제한/미시행**/미평가를
  절대 합치지 않는다"는 CLOSED 원칙(§0-2 step 6, §8-5) 대비 production
  `ExamCheckStatus`가 4값뿐.
- **왜 Fable이 먼저 쓰는가**: `ExamCheckStatus`는 LBP 전용이 아니라 **전 부위
  공유 타입**(`src/doctor/workspace/provenance.ts`)이고, 그 값을 읽는 곳이
  EMR 텍스트·재진 이월 텍스트·환자용 미리보기 경계에 걸쳐 있다. 값 하나를
  추가하는 것은 1줄이지만, "미확인을 음성으로 찍지 않는다"는 이 저장소에서
  가장 안전 민감한 불변식을 6상태로 다시 진술하는 일이다
  (`DECISIONS.md` 2026-09-02/03: "전 부위 공유 타입이라 착수 전 Fable이
  영향 범위를 먼저 설계 검토").
- **선행 배치와의 관계**: Batch 2.5a의 capability 3상태(CD-3)는
  `'YES'|'NO'|'UNKNOWN'`(`src/doctor/workspace/PainWorkspace.tsx:178`)로
  **다른 타입**이다. 2.5b는 그것을 건드리지 않는다.

---

## 0. 결론 요약 (먼저)

1. **추가는 additive 2값**: `LIMITED`, `NOT_PERFORMED`. 기존 4값의 의미·라벨·
   glyph·직렬화 형식은 **한 글자도 바꾸지 않는다.**
2. **두 신규 값은 "기록된 사실"이다 — pending이 아니다.** 즉 EMR/재진 이월
   텍스트에 **나타나야** 하고, "아직 확인 안 됨" 카운터에서는 **빠져야** 한다.
   기존 6개 필터가 전부 `status !== 'NOT_YET_CHECKED'` 형태이므로 이 동작은
   **코드 변경 없이 자동으로 맞는다** — 이것이 이 확장을 안전하게 만드는
   핵심이고, 동시에 "테스트 없이는 우연히 맞은 것과 구별되지 않는다"는
   위험의 근원이다(§4 T-2).
3. **두 신규 값은 어떤 판단의 근거로도 쓰이지 않는다.** 현재 결과값을 읽어
   *추론하는* 곳은 단 한 곳(`lbpExerciseRecommendation.ts:300`,
   `=== 'POSITIVE'`)뿐이고 그 비교는 이미 배타적이라 **변경 불필요**. 신규
   값에 새 임상 의미를 부여하는 것은 이 batch 범위 밖이다.
4. **손으로 쓴 `STATUS_OPTIONS` 배열 3곳이 이 batch의 유일한 실질적 결함
   위험이다.** 값을 추가해도 tsc가 잡아주지 않고 조용히 "새 상태를 화면에서
   고를 수 없는" 상태가 된다. → `provenance.ts`로 단일 export 승격 + 커버리지
   테스트(§4 T-1).
5. **사람 판단 필요 3건(§3)**: (CD-2.5b-1) 두 값의 한국어 라벨 —
   기존 `LbpDirectionalResponse`가 이미 **"미시행"을 다른 뜻으로 쓰고 있다**;
   (CD-2.5b-2) `NOT_PERFORMED`에 사유 메모를 요구할지; (CD-2.5b-3) 버튼 6개를
   한 줄에 둘지.
6. **마이그레이션 불필요, 서버 zero-diff.** 단 **역방향(구버전 클라이언트가
   신규 값을 읽는 경우) 열화 경로는 실재한다**(§5).

---

## 1. 타입 정의 변경 (1파일)

`src/doctor/workspace/provenance.ts`

| 위치 | 현재 | 변경 |
|---|---|---|
| `:101` `ExamCheckStatus` | 4값 | `\| 'LIMITED' \| 'NOT_PERFORMED'` 추가 (POSITIVE·NEGATIVE·UNCLEAR·LIMITED·NOT_PERFORMED·NOT_YET_CHECKED 순서) |
| `:103` `EXAM_CHECK_STATUS_LABEL` | `Record<ExamCheckStatus, string>` | 2 key 추가 — **tsc가 강제**(누락 시 build 실패) |
| `:120` `EXAM_CHECK_STATUS_GLYPH` | `Record<ExamCheckStatus, string>` | 2 key 추가 — **tsc가 강제** |
| `:128` `isExamChecked` | 정의만 있고 **호출처 0** (dead export) | §2.4 참고 |
| `:144` `isValidExamStatus` | `hasOwnProperty(EXAM_CHECK_STATUS_LABEL, status)` | **변경 없음** — LABEL 맵에 key가 생기면 자동으로 valid가 된다 |
| 신규 | — | `export const EXAM_CHECK_STATUS_OPTIONS: ExamCheckStatus[]` (§2.1) |

`Record<ExamCheckStatus, string>` 두 개가 **컴파일 타임 exhaustiveness
게이트**다. 값만 추가하고 라벨/glyph를 잊는 사고는 `tsc -b`에서 막힌다.

### glyph 제약 (Core Reduction P2, Phase 7 UI spec §6.3)
색만으로 구분하지 않는다 = 신규 2값도 **서로 다르고, 기존 4개와도 다른**
glyph가 필요하다. 현재 `✓`(양성) `–`(음성) `?`(불명확) `·`(미확인).
- 제안: `LIMITED: '△'`, `NOT_PERFORMED: '⊘'`.
- **`✕`는 쓰지 않는다** — 음성/정상(`–`)과 혼동될 위험이 실재한다.

---

## 2. 호출처 전수 목록 (`ExamCheckStatus` 20 참조 + 상태 리터럴 사용처)

### 2.1 손으로 쓴 상태 옵션 배열 — **유일한 must-fix**

| 파일 | 현재 |
|---|---|
| `src/doctor/workspace/ExamSuggestionCard.tsx:19` | `const STATUS_OPTIONS: ExamCheckStatus[] = ['POSITIVE','NEGATIVE','UNCLEAR','NOT_YET_CHECKED']` |
| `src/doctor/workspace/StructuredReassessmentCard.tsx:20` | 위와 동일한 리터럴 (복제) |

`ExamCheckStatus[]`는 **부분집합도 통과**하는 타입이다. 값을 추가하고 이
배열을 안 고치면 tsc·build·기존 테스트 전부 통과하면서 화면에는 신규 2개
버튼이 안 나온다 — 즉 "G15를 닫았다고 문서에 쓰고 실제로는 안 닫힌" 상태가
된다.

**설계**: `provenance.ts`에 단일 정의로 승격하고 두 카드가 이를 import.

```ts
/** 화면에 노출되는 상태 버튼의 정렬 순서. 여기 없는 값은 원장이 고를 수 없다. */
export const EXAM_CHECK_STATUS_OPTIONS: ExamCheckStatus[] = [
  'POSITIVE', 'NEGATIVE', 'UNCLEAR', 'LIMITED', 'NOT_PERFORMED', 'NOT_YET_CHECKED',
]
```

타입만으로는 누락을 못 잡으므로 **테스트로 강제**한다(§4 T-1). 이 승격은
"의미 없는 broad refactor"가 아니라 이 batch의 실패 모드를 제거하는 최소
변경이며, 두 파일의 동일 리터럴 복제를 1곳으로 줄인다.

### 2.2 "기록되었는가" 필터 — **변경 없음이 정답**

여섯 곳 모두 `isValidExamStatus(...) && status !== 'NOT_YET_CHECKED'`:

| 파일 | 용도 |
|---|---|
| `emrPreview.ts:60` | `examFindingsLines` → EMR "진찰 소견" |
| `emrPreview.ts:75` | `reassessmentFindingsLines` → EMR "재검 소견" |
| `RevisitWorkspace.tsx:133` | `priorVisitRecapLines` (직전 문진 방문의 소견 이월) |
| `RevisitWorkspace.tsx:180` | `priorVisitRecapLinesFromVisitWorkspace` (문진 없는 재진의 재검 소견 이월) |
| `examSuggestion.ts:67` | `isExamPending` → `groupExamSuggestions().stillPending` |
| `reassessmentExam.ts:50` | `isReassessmentPending` |

`LIMITED`/`NOT_PERFORMED`는 이 필터를 **통과**한다 →
- EMR: `제한` / `미시행`이 사실로 기록된다 ✅ (§C3의 "제한/미시행은 사실로
  기록" 요구)
- pending: 신규 값은 "아직 확인 안 됨" 카운터에서 빠진다 ✅
- **음성으로 찍히는 경로는 없다** — 라벨은 `EXAM_CHECK_STATUS_LABEL[status]`로
  그대로 출력되며 "음성/정상" 문자열은 `NEGATIVE`에만 붙는다 ✅

즉 원하는 동작이 이미 구조적으로 보장된다. **그래서 이 batch의 구현 diff는
작고, 검증 비중이 크다.**

### 2.3 결과값으로 *추론하는* 곳 — 1곳, 변경 없음

`src/doctor/workspace/lbpExerciseRecommendation.ts:300`
```ts
const neurodynamicConcordant = neurodynamicExam?.result.status === 'POSITIVE'
```
`LIMITED`(예: 통증으로 SLR 각도까지 못 감)와 `NOT_PERFORMED`는 `false`로
떨어진다 = "unknown은 근거가 아니다"(architecture §2.3) 준수. **손대지 않는다.**
단 `:214`, `:297`의 주석은 열거형(`NOT_YET_CHECKED / NEGATIVE / UNCLEAR`)을
쓰고 있어 6상태 기준으로 **주석만** 갱신 대상이다(Batch 3의 "주석 한 절"
FAIL 사례 재발 방지).

### 2.4 `isExamChecked` (provenance.ts:128) — 호출처 0

dead export다(전 저장소 grep 결과 정의 1건). 6상태에서 이 이름은
"POSITIVE/NEGATIVE만 참인가?"로 오해될 여지가 커진다.
**권고: 삭제하지 않고 의미를 명시하는 주석 보강 + 이름 유지.** 삭제는
unrelated cleanup이고, §2.2의 6개 인라인 조건을 여기로 통합하는 것은 이
batch에서 회귀 위험만 늘린다(6곳 각각 `isValidExamStatus` 가드와 붙어 있음).
→ **비차단 백로그**로 남긴다.

### 2.5 상태를 *쓰는* 곳 (기록 시점) — 동작 확인 필요, 코드 변경 없음

| 파일 | 현재 | 6상태에서 |
|---|---|---|
| `ExamSuggestionCard.tsx:124` | `recordedAt: s === 'NOT_YET_CHECKED' ? null : now` | 신규 2값은 timestamp를 받는다 ✅ (원장이 "제한/미시행"을 판단한 시각은 실재하는 사실) |
| `StructuredReassessmentCard.tsx:68` | 동일 | 동일 ✅ |
| `ExamSuggestionCard.tsx:40`, `:134`, `:151` | `pending = status === 'NOT_YET_CHECKED'`; `!pending`일 때만 상세·메모 토글과 `재검 항목으로 추가` 노출 | 신규 2값에서 메모/재검 승격이 **열린다** ✅ 의도된 동작(§3 CD-2.5b-2 참고) |
| `StructuredReassessmentCard.tsx:31,118` | 동일 패턴 | 동일 ✅ |
| `DoctorWorkspace.tsx:403-414` | exam → 재검 승격 시 `previous.status`에 현재 status 복사 | 신규 값도 그대로 이전 소견으로 보존 ✅ |
| `reassessmentExam.ts:35` `reassessmentExamItemFromPrevious` | 오늘 결과는 **항상** `NOT_YET_CHECKED` | `previous.status`가 `LIMITED`여도 자동 복사 금지 유지 ✅ (§4 T-4) |

### 2.6 기본값/템플릿 — 변경 없음

`examSuggestion.ts:45` `emptyExamResult()`, `persistence.ts:83`
`PREVIOUS_EXAM_VALUE_TEMPLATE`, `visitWorkspace.ts:33` 모두 기본값
`NOT_YET_CHECKED` 유지. **신규 값이 기본값이 되는 경로는 없어야 한다.**

### 2.7 무관 — 같은 단어를 쓰지만 다른 타입 (혼동 금지 목록)

| 위치 | 타입 | 왜 무관 |
|---|---|---|
| `lbpExamSuggestions.ts:210-225` | `LbpDirectionalResponse` (`NOT_ASSESSED`/`UNCLEAR` 등) | 허리 움직임 방향 반응. 별도 enum, 별도 validator(`isValidLbpDirectionalResponse`) |
| `lbpExerciseEligibility.ts:111-116` | `LbpEligibilityDirectionalResponse` | 위의 엔진 입력 사본 |
| `lbpEligibilityContext.ts:96-100` | 위 두 개의 변환 | — |
| `PainWorkspace.tsx:178` | capability 3상태 `YES/NO/UNKNOWN` (CD-3) | Batch 2.5a. exam 결과가 아니라 "이 자세가 지금 가능한가" |
| `provenance.ts:86` | `PatientResponseState` | 환자 응답 4상태. **이 batch에서 건드리지 않는다** |

⚠️ **`lbpExamSuggestions.ts:219`가 `NOT_ASSESSED`의 라벨로 이미 "미시행"을
쓰고 있다.** → §3 CD-2.5b-1.

### 2.8 fixture / 테스트 데이터

`workspaceFixtures.ts:87~144` (7건), `tests/lbp-exercise-recommendation.spec.mjs:104`,
`tests/workspace-round3.spec.mjs:234` 등. 기존 fixture는 **그대로 유지**
(회귀 기준선). 신규 값은 §4의 새 테스트에서만 주입한다.

---

## 3. 사람(PO) 판단 필요 — CLINICAL DECISION REQUIRED

### CD-2.5b-1 — 두 값의 한국어 라벨 (**차단**)
문제: `LbpDirectionalResponse.NOT_ASSESSED`의 라벨이 이미 **"미시행"**이고,
그 뜻은 "허리 움직임 검사를 아직 안 해봄"(= 미평가)이다. 여기에
`ExamCheckStatus.NOT_PERFORMED`도 "미시행"으로 붙이면, 같은 원장 화면에서
같은 단어가 (a) 미평가와 (b) "시행하지 않기로 판단한 사실"을 동시에 가리킨다.
이것은 이 저장소가 반복해서 막아온 라벨 붕괴 클래스다.

| 안 | LIMITED | NOT_PERFORMED | 부수 변경 |
|---|---|---|---|
| **A (권고)** | `제한적 시행(판단 유보)` | `시행 못 함` | 없음. `LbpDirectionalResponse` 라벨 그대로 |
| B | `제한` | `미시행` | `LbpDirectionalResponse.NOT_ASSESSED` 라벨을 `미시행` → `미평가`로 변경(이미 배포된 라벨 수정) |
| C | `제한` | `미시행` | 부수 변경 없음 = **같은 단어 두 뜻 허용** (권고하지 않음) |

권고 근거: A는 기존 화면을 하나도 안 건드리면서 뜻이 겹치지 않는다.
"시행 못 함"은 §C3의 "미시행"과 의미적으로 동일하고 원장이 실제로 쓰는 말에
더 가깝다. **최종 자구는 원장(PO) 결정.**

### CD-2.5b-2 — `NOT_PERFORMED`에 사유 메모를 요구할지 (**차단**)
"시행 못 함"이 사유 없이 기록되면 다음 방문에서 그 항목을 다시 시도해야
하는지 판단할 수 없다. 그런데 현재 메모는 항상 선택(optional)이고, 필수화는
빠른 point-of-care 입력이라는 기존 설계 전제와 충돌한다.
- **권고: 필수화하지 않는다.** 대신 `NOT_PERFORMED`를 고르면 상세·메모
  토글을 **자동으로 펼친다**(현재도 `!pending`이면 노출 가능 상태). 강제 없이
  사유 기록을 유도하고, 비워도 저장은 된다.
- 대안: 필수화(입력 마찰 증가), 또는 아무 것도 안 함(사유 유실).

### CD-2.5b-3 — 버튼 6개의 배치 (**비차단, 기본값으로 진행 가능**)
`.workspace__examCard__statusRow`는 `flex-wrap: wrap`이고 버튼은
`min-height 36px`(재진 shell에서 44/48px, `doctor.css:426-443`)이다.
6개면 태블릿 폭에서 2줄로 감기며, exam 카드마다 세로 높이가 늘어난다.
- **권고(기본값): 한 줄 그룹 유지 + §2.1 순서**(정상/이상/불명확을 앞에,
  제한·시행 못 함을 뒤에, 미확인을 맨 끝). 자주 쓰는 3개가 항상 첫 줄에
  오도록 순서로 해결하고 CSS는 건드리지 않는다.
- 대안: 신규 2개를 "기타" 2차 그룹으로 분리(클릭 1회 증가, 코드/CSS 증가).

---

## 4. 완료 검증 테스트 세트 (Sonnet 필수 구현)

기존 스위트 위치: 상태 옵션·EMR·이월 = `tests/doctor-workspace.spec.mjs`,
승격/직렬화 = `tests/workspace-round3.spec.mjs`,
추론 = `tests/lbp-exercise-recommendation.spec.mjs`.
**새 spec 파일을 만들지 않고 위 3개에 추가**한다(신규 npm script 불필요).

| ID | 테스트 | 방어 대상 |
|---|---|---|
| **T-1** | `EXAM_CHECK_STATUS_OPTIONS`가 `EXAM_CHECK_STATUS_LABEL`의 **모든 key를 정확히 한 번씩** 포함(길이·집합 동시 비교). 그리고 `ExamSuggestionCard`/`StructuredReassessmentCard` 렌더 HTML에 6개 라벨이 **전부** 등장 | §2.1의 조용한 옵션 누락 |
| **T-2** | EMR 미리보기: `LIMITED` 1건 + `NOT_PERFORMED` 1건 + `NOT_YET_CHECKED` 1건 → 앞의 두 항목 title·라벨은 **등장**, 미확인 항목 title은 **부재**, 텍스트 어디에도 `음성/정상` **부재** | "제한/미시행이 사실로 기록" + "미확인≠음성" 동시 |
| **T-3** | 두 신규 값이 pending에서 제외됨: `isExamPending`/`isReassessmentPending` false, `groupExamSuggestions().stillPending` 미포함, `StructuredReassessmentCard` 카운터 감소 | pending과 recorded의 경계 |
| **T-4** | `reassessmentExamItemFromPrevious(previous.status='LIMITED')` → 오늘 `result.status === 'NOT_YET_CHECKED'` (`NOT_PERFORMED`도 동일) | 이전 소견 자동 복사 금지가 신규 값에도 적용 |
| **T-5** | 재진 이월 2경로(`priorVisitRecapLines`, `…FromVisitWorkspace`)에서 신규 값이 라벨로 출력되고, 리터럴 `undefined` 부재 | 15차 MEDIUM-2 회귀 |
| **T-6** | 직렬화 round-trip: `LIMITED`/`NOT_PERFORMED` 보존; **구 4값 레코드 round-trip 결과 무변화**(하위 호환) | 마이그레이션 없음 주장의 근거 |
| **T-7** | `isValidExamStatus('LIMITED')`/`('NOT_PERFORMED')` true, `'MAYBE'`/`''`/`null`/객체 false | validator 확장 |
| **T-8** | 추천 엔진: `neurodynamicExam.result.status`가 `LIMITED`, `NOT_PERFORMED`일 때 `directlySupported === false` (POSITIVE만 true) | unknown을 근거로 쓰지 않음 |
| **T-9** | glyph 6개가 **서로 다름**(집합 크기 6), 전부 비어있지 않음 | 색 무의존 요건(P2) |
| **T-10** | 기본값 회귀: `emptyExamResult()`, `PREVIOUS_EXAM_VALUE_TEMPLATE`, `visitWorkspace` 기본 status가 여전히 `NOT_YET_CHECKED` | 신규 값이 기본값으로 새지 않음 |

**뮤테이션 검증(이 저장소 관례)**: 최소 아래 6종을 각각 심고 위 테스트가
**반드시 실패**함을 확인한 뒤 되돌린다 — ① `EXAM_CHECK_STATUS_OPTIONS`에서
`NOT_PERFORMED` 제거 ② `emrPreview.ts:60` 필터를
`(s === 'POSITIVE' || s === 'NEGATIVE')`로 축소 ③ `isExamPending`을
`status === 'NOT_YET_CHECKED' || status === 'NOT_PERFORMED'`로 확대
④ `LIMITED` 라벨을 `'음성/정상'`으로 교체 ⑤ `neurodynamicConcordant`를
`!== 'NOT_YET_CHECKED'`로 완화 ⑥ `LIMITED` glyph를 `NEGATIVE`와 동일하게.

**게이트**: `tsc -b` + `vite build` + `npm run test:all` PASS,
그리고 `src/spec/*Logic.ts`·`*Adapter.ts`(FROZEN)·`tablet core/`·`server/`
**zero-diff**.

---

## 5. 위험 (숨어 있는 것 포함)

1. **역방향 호환이 진짜 위험이다(마이그레이션은 위험이 아니다).**
   저장은 `sanitizeShape`가 status를 "문자열이면 통과"시키고, 유효성은
   `isValidExamStatus`가 `EXAM_CHECK_STATUS_LABEL` key 존재로 판정한다
   (`provenance.ts:144`). 따라서 신버전이 만든 `LIMITED` 레코드를 **구버전
   클라이언트**가 읽으면 → invalid → EMR에서 **조용히 누락**되고 화면에는
   `확인 필요(값 형식 오류)`로 뜬다. 데이터가 깨지는 게 아니라 **소견 한 줄이
   사라진다.** 임상 LAN 단일 배포이므로 완화책은 "태블릿·원장 화면을 같은
   빌드로 동시 배포" 하나뿐이며, **롤백 시에도 같은 일이 생긴다.** 배포
   메모에 명시할 것.
2. **`server/`에 이 enum 참조가 0건**임을 확인했다 → workspace blob은 서버에
   불투명(opaque). 서버 변경 없음이 **가정이 아니라 확인된 사실**이다.
3. **선택지가 6개가 되면 원장이 `불명확`과 `제한`을 구분하지 않고 쓴다.**
   기술적 위험이 아니라 데이터 품질 위험이고, 코드로 막을 수 없다. 라벨 자구
   (CD-2.5b-1)와 각 카드 ⓘ 도움말이 유일한 방어선이다. 파일럿에서 실제 입력
   분포를 보고 판단할 항목.
4. **대부분이 놓치는 지점**: 이 batch의 실질적 diff는 10줄 남짓인데, 위험은
   전부 *바꾸지 않은 코드*에 있다 — 인라인
   `!== 'NOT_YET_CHECKED'` 6곳이 신규 값에 대해 "우연히 맞는" 상태다.
   지금 맞다는 것과 앞으로 유지된다는 것은 다르므로, T-2/T-3이 그 우연을
   **명시적 계약으로 고정**하는 것이 이 batch의 실제 산출물이다.
5. `DoctorWorkspace.tsx:416-424` (`:420`) — 한약 관찰(`ClinicianObservationItem`)을 재검
   항목으로 승격할 때 `status: 'UNCLEAR'`를 자리표시자로 쓴다. 자유 텍스트
   관찰인데 "불명확"으로 기록되는 기존 오용이며, `LIMITED`/`NOT_PERFORMED`
   **어느 것도 이 자리에 맞지 않는다.** 이 batch에서 손대지 않고
   **백로그**로 기록한다.

---

## 6. Sonnet 착수 범위 (이 목록 밖은 금지)

**수정 허용 파일 6개**
1. `src/doctor/workspace/provenance.ts` — 타입 2값, LABEL 2 key, GLYPH 2 key,
   `EXAM_CHECK_STATUS_OPTIONS` 신규, 주석
2. `src/doctor/workspace/ExamSuggestionCard.tsx` — 로컬 `STATUS_OPTIONS` 제거
   → import (+ CD-2.5b-2 승인 시 `NOT_PERFORMED` 선택 시 상세 토글 자동 open)
3. `src/doctor/workspace/StructuredReassessmentCard.tsx` — 동일
4. `src/doctor/workspace/lbpExerciseRecommendation.ts` — **주석만**(`:214`,
   `:297` 열거형 6상태 반영). 로직 무변경
5. `tests/doctor-workspace.spec.mjs` — T-1, T-2, T-3, T-5, T-9
6. `tests/workspace-round3.spec.mjs` — T-4, T-6, T-7, T-10
   / `tests/lbp-exercise-recommendation.spec.mjs` — T-8

**금지**: `PatientResponseState` 확장, `LbpDirectionalResponse`/capability
3상태 수정(CD-2.5b-1에서 B안이 승인된 경우만 라벨 1줄 예외), `isExamChecked`
호출처 통합, CSS 변경(CD-2.5b-3 기본값 채택 시), 신규 npm script, 신규 spec
파일, FROZEN/`tablet core/`/`server/` 수정, 신규 값에 임상 의미 부여
(자동 escalation·점수·추천 근거화).

**착수 조건**: CD-2.5b-1, CD-2.5b-2 PO 승인. CD-2.5b-3은 권고 기본값으로
진행 가능.

**커밋 분할**: (1) provenance 타입/라벨/glyph/OPTIONS + 두 카드 import 전환,
(2) 테스트 T-1~T-10, (3) 주석 갱신. 하나의 논리적 변경 = 하나의 커밋.
