# Opus delta review — LBP v1 Batch 4 (`61dca0a` over `dd60c0e`)

**Scope**: EMR 고정 6키(§14.1) + CD-2.7-1/-2/-3(§14.2/14.3/14.4) + CRM 최소 연동(§14.5, 중단됨)
**Repo**: `/home/user/Samindang`, branch `claude/clinical-os-lbp-architecture-xym6po`, HEAD `61dca0a` (working tree clean, unmodified by this review)
**Mutants**: built and destroyed in a throwaway `git archive` copy under `/tmp/.../scratchpad/mutant-repo`, since deleted.

---

## Disposition: **FAIL**

**임상 핵심 항목은 통과했다.** 이 batch의 유일한 임상 안전 항목인 `O` 경계는
정방향·역방향 모두 무손상이고, 6키 골격·빈 값 규칙·2.5b/2.5c 보존 동작도 전부
살아 있다. 정보 손실도 **`buildPainWorkspaceEmrPreview` 안에서는** 0건이다.

FAIL 사유는 전부 **§14.3의 종결 재배선**에서 나왔다. 복사 지점을 하나로 모으면서
그 하나가 **일부 레코드에서 빈 상자가 되거나, 원장이 직접 타이핑한 값을 조용히
누락**한다. 두 건 모두 Batch 2.6이 명시적으로 승계하라고 적어 둔 **D-1 교훈**
("지우기 전에 그 필드를 쓰는 모든 화면에 대체 경로가 있는지 확인한다",
`DECISIONS.md:2278-2283`)에 정면으로 걸린다.

- **D-1(HIGH)**: herbal-only / mixed 레코드 — 종결 EMR 상자가 항상 보이지만 비어
  있고, 복사 버튼이 빈 문자열을 복사한 뒤 "복사됨"을 띄운다. 동시에 herbal EMR
  미리보기는 유일한 복사 경로(카드 버튼)를 잃었다.
- **D-2(HIGH)**: pain/mixed 레코드 — 종결 EMR 텍스트가 `revised_after_exam` /
  `final_treatment_axis` / `prescription_direction`(원장이 JudgmentPanel에 직접
  타이핑하는 값, 화면에서 여전히 편집 가능)을 조용히 떨어뜨린다.

나머지는 MEDIUM 4건 + LOW 5건. 전부 국소 수정으로 닫힌다.

**실행 결과**: `npx tsc -b` PASS(exit 0), `npm run build` PASS,
`test:emrSummary` 14/14, `test:doctor-workspace` 272, `test:workspace-round3` 179,
`test:lbp-working-hypothesis` 231, `test:crm-schema` 95, `test:doctor` 947/947. 전부 PASS.

---

## A. `O` 경계 — 전수 감사 (PASS)

### A-1. `O` 줄에 도달할 수 있는 모든 값 (전수, 샘플링 아님)

`buildPainWorkspaceEmrPreview`가 `oParts`에 push하는 지점은 정확히 4곳이다
(`src/doctor/workspace/emrPreview.ts:186-197`). 그 외 경로는 없다 — `oParts`는
지역 배열이고 `emrPreview.ts:241`에서 한 번만 읽힌다.

| # | O 절 | 값의 출처 | 원장 확인값인가 |
|---|---|---|---|
| 1 | `검사 결과:` (`:187-188`) | `PhysicalExamSuggestion.result.status/laterality/note` | **예** |
| 2 | `허리 움직임 반응:` (`:189-191`) | `WorkspaceState.lbpDirectionalResponse` | **예** |
| 3 | `오늘 재검 소견:` (`:192-193`) | `ReassessmentExamItem.result` (`previous`는 절대 아님) | **예** |
| 4 | `객관적 근력저하:` (`:194-197`) | `ClinicianJudgment.lbp_objective_motor_deficit` | **예** |

**#1 — 6개 `ExamCheckStatus` 값 전부가 원장 입력인가: 예.**
`provenance.ts:95-98`의 타입 자체가 *"Same three-plus-one distinction for anything
the CLINICIAN could examine"*로 정의돼 있고, 6개 값(`POSITIVE`/`NEGATIVE`/
`UNCLEAR`/`LIMITED`/`NOT_PERFORMED`/`NOT_YET_CHECKED`) 어느 것도 태블릿 응답에서
파생되지 않는다. `examSuggestion.ts:45` `emptyExamResult()`는 항상
`NOT_YET_CHECKED`로 시작하고, `note`에는 *"Free-text clinician note, optional.
Never auto-filled."*(`examSuggestion.ts:37`), `recordedAt`은 *"ISO timestamp of
when the clinician entered this result"*(`examSuggestion.ts:39-41`)로 못박혀 있다.
`lbpExamSuggestions.ts`가 태블릿 응답에서 만드는 것은 **어떤 검사를 제안할지**
(제목/우선순위/사유)뿐이고 `result`는 손대지 않는다. 그리고 composer는
`isValidExamStatus`로 한 번 더 걸러 인식 못 하는 status는 아예 출력하지 않는다
(`emrPreview.ts:114`, `:129`).

**#2 — `허리 움직임 반응`: 원장 입력.**
`PainWorkspace.tsx:132-143`의 버튼 행(`role="group" aria-label="허리 움직임 반응
선택"`)에서 원장이 직접 누르며, 바로 위에 "어떻게/왜" 진찰 안내
(`LBP_DIRECTIONAL_RESPONSE_HELP` — "서서 허리를 굽히고…")가 붙어 있는 **진찰
행위** 항목이다. 상태는 `DoctorWorkspace.tsx:610-613`의
`setWorkspaceState`로만 바뀐다. 태블릿 응답에서 유도되는 경로는 없다.
기본값 `NOT_ASSESSED`는 `emrPreview.ts:189`에서 명시적으로 배제된다.

**#3 — 오늘 재검 소견: 원장 입력, `previous` 누출 없음.**
`reassessmentExam.ts:5-6, 27-32, 45`: *"today's result ALWAYS starts
NOT_YET_CHECKED"*, *"The prior visit's… value… never auto-copied into `result`"*.
composer의 rule 4(`emrPreview.ts:127`)가 `result`만 읽는다. 나는 이전 값
(`previous.note='이전 양성'`)이 채워진 fixture로 직접 확인했고, 오늘 값이
`NOT_YET_CHECKED`인 동안 `이전 양성`은 출력 텍스트 어디에도 나타나지 않았다.

**#4 — `lbp_objective_motor_deficit`: 원장 입력, LBP_02와 별개.**
`judgment.ts:55`가 `'NONE' | 'SEVERE_OR_PROGRESSIVE' | 'UNKNOWN'`으로 정의하고,
편집 UI는 `ObjectiveExamFindingsCard.tsx`(감사 §G-2 불가침 항목, "원장이 진찰 후
입력")다. 환자의 LBP_02 자가보고 약감과는 완전히 분리된 별개 필드다.
`LBP_OBJECTIVE_MOTOR_DEFICIT_LABEL`(`emrPreview.ts:155-158`)은 `Partial<Record<>>`
이므로 `'UNKNOWN'`과 `undefined` 둘 다 label이 `undefined`가 되어 **출력되지
않는다** — "미평가"를 "없음"으로 찍는 경로가 없다. 실측으로 확인
(`lbpObjectiveMotorDeficit: 'UNKNOWN'` → `O:` 빈 줄).

### A-2. 역방향 — `O/S`·`S`에 원장 소견이 잘못 섞여 있지 않은가 (PASS)

`O/S`에 도달하는 값은 `input.onsetDurationText` **하나뿐**(`emrPreview.ts:239`),
`S`에 도달하는 값은 `aggravatingText`/`impactText` **둘뿐**(`emrPreview.ts:201-202,
240`)이다. 세 값의 실제 인자를 두 호출부에서 모두 추적했다:

- `onsetDurationText` = `durationFrequencyText(r, routing.primary_module)`
  (`DoctorView.tsx:572-580`) — `r.visit_goal.chief_duration` + `frequencyField(...)`,
  전부 `Responses`(태블릿) 전용.
- `aggravatingText` = `aggravatingSummaryText(routing.primary_module, r.modules)`
  (`DoctorView.tsx:583-592`) — `Responses['modules']`만 읽는다.
- `impactText` = `answerLabel('VISIT_04_SYMPTOM_IMPACT', r.visit_goal.chief_impact)`
  — 태블릿 문항 하나.

세 함수 모두 `WorkspaceState`/`ClinicianJudgment`를 인자로도 클로저로도 받지
않는다. **원장 소견이 환자 자가보고로 오분류되는 경로는 없다.** 경계는 양방향
모두 새지 않는다.

### A-3. 뮤테이션 — 구현자의 필수 뮤턴트 재현 + 내가 만든 추가 누출 경로

`git archive 61dca0a` 사본에서 baseline(231/272 통과) 확인 후 실행:

| # | 뮤턴트 | 결과 |
|---|---|---|
| M1 | (구현자 필수) `oParts.push(input.aggravatingText)` 추가 → `emrPreview.ts:186` 블록 | **KILLED** — `FAIL: §14.1 filled example: O carries the clinician exam finding … and nothing patient-reported` |
| M2 | (구현자 필수) `parseInterventionValue`의 `otherTokens` 수집 제거 | **KILLED** — `AssertionError: the legacy free-text value is preserved verbatim in the 기타 box, not dropped` |
| M3 | (내가 추가) 승인 chip `'테이핑'`을 목록에서 제거 | **KILLED** — `AssertionError: exactly the 8 PO-approved words render, in the fixed order` |
| M4 | (내가 추가) 6키 순서 치환 (`S`↔`O`) | **KILLED** — `FAIL: §14.1 6-key skeleton: … in order (C/C, O/S, S, O, A, P)` |
| M5 | (내가 추가) 환자 `impactText`를 `검사 결과:` 절 **안에** 밀어넣기 | **KILLED** — filled fixture의 정확일치 단언이 잡음 |
| **M6** | (내가 추가) 환자 `onsetDurationText`를 `오늘 재검 소견:` 절 안에 밀어넣기 | **SURVIVED** — 3개 스위트 전부 PASS |
| **M6b** | (내가 추가) 환자 `aggravatingText`를 `허리 움직임 반응:` 절 안에 밀어넣기 | **SURVIVED** — 3개 스위트 전부 PASS |
| M7 | (내가 추가) N-2 sticky-open latch 제거 | **KILLED** — `AssertionError: N-2 PRIMARY regression guard…` |

**M6/M6b가 이 batch 테스트의 유일한 실질적 구멍이다** → defect #6.
원인: O 경계를 지키는 단언이 두 개인데 둘 다 같은 사각을 갖는다.
`oBoundaryInput`(`tests/lbp-working-hypothesis.spec.mjs`)은 **원장 O 값이 하나도
없는** 레코드라 `O:`가 비어 있는지만 보고, `filled` fixture는 `examSuggestions` +
`lbpObjectiveMotorDeficit`만 채워져 있어 **`reassessment`와
`lbpDirectionalResponse` 절은 어느 단언에서도 실행되지 않는다.** 그 두 절에
환자값을 붙이는 누출은 통과한다.

**A 판정: PASS.** 경계 자체는 정방향·역방향 모두 정확하고, 구현자의 필수
뮤턴트도 실제로 죽는다. 구멍은 경계가 아니라 **테스트 커버리지**에 있다.

---

## B. 재포맷을 통한 정보 손실 (composer 내부 PASS / 종결 화면 FAIL)

### B-1. `buildPainWorkspaceEmrPreview` 내부 — 손실 0건

`dd60c0e`판과 `61dca0a`판을 같은 fully-populated 입력(POSITIVE+LIMITED+
NOT_PERFORMED+NOT_YET_CHECKED 검사 4개, carePlan 5필드, reassessment,
nextReassessmentPlan, followUpTarget baseline+직후, 그리고 신규 3개 태블릿 값)으로
나란히 실행해 사실 단위로 대조했다.

기존 17줄 → 신규 6키 매핑 (전부 보존):

| 구 라인 | 신 위치 |
|---|---|
| 주호소 | `C/C` |
| 진찰 소견 | `O` → `검사 결과:` |
| 허리 움직임 반응 | `O` |
| 임상 가설 (raw) | `A` 첫 절 |
| Assessment | `A` → `최종 임상 판단:` |
| 치료 초점 | `A` |
| 시행/예정 처치 · 즉시 재검 대상 | `P` |
| 오늘 재검 소견 | `O` |
| 최종 재평가 | `A` |
| 치료 목표 / 재활 목표 / 집에서 할 일 / 주의사항 / 다음 방문 확인 | `P` |
| 재평가 대상 · 다음 상세 재평가 | `P` |

**사라진 사실: 없음. 새로 실린 사실: 4개** — `1~3개월 · 매일`(O/S),
`앉아 있을 때 악화`·`가벼운 지장`(S), `심하거나 빠르게 진행함`(O).

유일한 *형태* 변화는, 이전에는 빈 carePlan 필드도 `치료 목표:`처럼 라벨만 있는
빈 줄로 보였는데 이제는 `P`에서 아예 빠진다는 것이다. §14.1이 "6줄만"을 명시적
목표로 못박았으므로 **수용 가능한 손실**이다.

### B-2. 보존 동작 재확인 — 전부 생존

- `NOT_YET_CHECKED` 미출력: 확인 (`emrPreview.ts:114`, `:129`). 실측에서 제목
  `대기검사`가 출력 어디에도 없음.
- `LIMITED`/`NOT_PERFORMED` 기록 사실로 출력: 확인. 실측 출력에
  `제한검사: 제한적 시행(판단 유보) — 통증으로 부분만; 미시행검사: 시행 못 함`.
  **라벨 문자열 원문 그대로** (`provenance.ts:135-136`).
- 임상 가설: UNJUDGED 패턴 생략 / 전부 UNJUDGED면 절 자체가 사라짐 — 갱신된
  두 단언이 그대로 지키고 있고(`tests/lbp-working-hypothesis.spec.mjs`
  `withoutHypothesis`/`withBlankHypothesis`), `임상 가설: 임상 가설:` 이중 접두
  방지 단언도 유지.
- `제한적 시행(판단 유보)` / `시행 못 함` 라벨: `provenance.ts` 무수정
  (delta에 `provenance.ts` 없음), 실측 출력에서 원문 확인.

### B-3. 종결 화면의 정보 손실 — **여기가 FAIL이다** (→ defect #2)

§14.3이 pain-derived 레코드의 종결 EMR 텍스트 소스를 `emrSummary.ts`에서
`buildPainWorkspaceEmrPreview`로 통째로 갈아끼웠다(`DoctorView.tsx:3152-3171,
3199-3208`). `emrSummary.ts:21-29`가 내던 7줄 중 **6개 항목이 pain/mixed
레코드에서 갈 곳을 잃었다**:

| 잃은 값 | 출처 | 원장이 직접 타이핑하는가 |
|---|---|---|
| `경과` | `structuredNote.history` | 아니오 (recorder) |
| `주요 문진` | `structuredNote.key_findings` | 아니오 (recorder) |
| `진찰 소견` | `structuredNote.assessment` | 아니오 (recorder) |
| **`Assessment`** | `judgment.revised_after_exam` | **예** |
| **`치료/처방`** | `judgment.final_treatment_axis` | **예** |
| **`계획`** | `judgment.prescription_direction` | **예** |

뒤 3개는 `JudgmentPanel.tsx:424-435`에서 **지금도 편집 가능**하고, JudgmentPanel은
`DoctorView.tsx:4765`에서 viewProfile 게이트 없이 렌더된다. 즉 원장은 pain
레코드에서도 「최종 치료 축」·「처방 방향」을 계속 입력할 수 있는데, 그 값이
이제 EMR 복사 텍스트에 **영영 실리지 않는다**. §14.3은 "포맷을 6키로 바꾼다"만
말했지 "원장이 타이핑한 판단 3필드를 버린다"고는 하지 않았다.
이는 Batch 2.6 D-1과 동일한 형태의 회귀다.

---

## C. 빈 키 규칙 vs 날조 금지 규칙 (PASS, 단 문구는 PO 판단 사항)

전부 빈 레코드 — 단, `carePlan`/`reassessment`/`nextReassessmentPlan` 객체는
**존재하되 전 필드가 빈** 최악 케이스, 검사·재검 항목은 `NOT_YET_CHECKED`,
재검 항목의 `previous`는 `POSITIVE '이전 양성'`, `lbpDirectionalResponse`는
`'NOT_ASSESSED'`, `lbpObjectiveMotorDeficit`는 `'UNKNOWN'` — 로 직접 실행:

```
"C/C:\r\nO/S:\r\nS:\r\nO:\r\nA:\r\nP:"
```

정확히 6줄, 정확한 순서, **`없음`/`정상`/`음성`/`미평가`/`아직 확인` 어느 것도
출력되지 않았고 `이전 양성`도 새어나오지 않았다.** 부정 소견으로 읽힐 문자열은
0개다. C의 기계적 요건은 충족.

**임상적 판단 (요청받은 부분):** 빈 `O:` 줄이 "진찰했고 정상이었다"로 오독될
위험은 **낮지만 0은 아니다.** 한의원 차트에서 SOAP의 `O:`가 비어 있는 것은 보통
"안 적었다"로 읽힌다 — 정상이었다면 `SLR 음성`처럼 무언가가 적혀 있을 것이기
때문이다. 다만 이 텍스트는 EMR에 붙여넣어 **다른 사람**(대진의, 심사, 훗날의
본인)이 읽는 산출물이고, 그 독자에게는 "빈칸 = 미기재"라는 맥락이 없다.

§14.1이 이미 "빈 값을 '없음'/'정상'으로 쓰지 않는다"를 못박았으므로 지금 구현이
**옳다** — 고칠 코드는 없다. 다만 모호함을 완전히 없애고 싶다면 유일하게 안전한
문구는 **소견이 아니라 기재 상태를 말하는 표지**다: `O: (미기재)` 또는
`O: (기록 없음)`. `없음`/`정상`/`특이소견 없음`은 전부 금지선을 넘는다.
이건 코드 결함이 아니라 **차트 문구 결정**이므로 아래 `CLINICAL DECISION
REQUIRED`에 non-blocking으로 올렸다.

---

## D. 종결 재배선 (§14.3) — **FAIL** (이 delta의 최대 구조 변경)

이 화면은 `mode === 'server' && selectedRecord?.patient_id`(`DoctorView.tsx:3592`)
게이트 안에 있어 **workspace 테스트 harness로도 doctor.spec.mjs harness로도
렌더되지 않는다.** 아래 판정은 전부 **소스 제어흐름 추적**이며, 실행으로
확인한 것이 아니다 — 명시한다.

### D-1. 두 복사 경로가 같은 텍스트를 내는가 — **구조적으로는 예, 실무상 어긋날 수 있음**

인자 대조 (`DoctorView.tsx:3153-3170` vs `DoctorWorkspace.tsx:813-828`):
`primaryConcern`/`onsetDurationText`/`aggravatingText`/`impactText`는 **문자 그대로
같은 식**이고, `lbpObjectiveMotorDeficit`도 server 모드에서 동일 값
(`DoctorView.tsx:3169` vs `:4236-4237`)이다. 나머지 7개는 한쪽이
`deserializeWorkspaceState(selectedRecord.workspace)`(**저장된** 상태), 다른 쪽이
`workspaceState`(**메모리** 상태)다.

어긋나는 창(window) 3가지:
1. **미저장 편집** — autosave 디바운스 900ms(`DoctorWorkspace.tsx:92`) + 왕복
   지연 동안 두 텍스트가 다르다. `mergeLbpExamSuggestions`(`DoctorWorkspace.tsx:137`)
   가 초기 상태에만 적용되고 저장 전에는 종결 쪽에 없다는 차이도 있으나, 병합된
   항목은 `NOT_YET_CHECKED`라 어차피 출력되지 않으므로 **텍스트 차이는 없다**.
2. **profile 수동 전환** — 참고 자료 카드는 `activeProfile`(수동 전환 가능),
   종결은 `viewProfile`(파생)로 갈린다. pain 레코드를 herbal 탭으로 넘겨보면
   카드는 herbal 미리보기, 종결은 pain 6키를 낸다. 의도된 override이므로 결함은
   아니지만 "두 곳이 항상 같다"는 §14.3 서술은 이 경우 성립하지 않는다.
3. **원장의 수동 편집** → defect #4 참조.

§14.6이 요구한 "두 경로의 텍스트가 동일함을 단언"하는 테스트는 **존재하지 않는다**
(defect #5).

### D-2. herbal-only 레코드가 여전히 `emrSummary.ts` 출력을 받고, 비지 않는가 — **아니오. 회귀.**

제어흐름:
- `emrText` 초기값 `''` (`DoctorView.tsx:2747`).
- recorder effect (`:3182-3197`): `viewProfile==='pain'||'mixed'`면 return →
  herbal은 통과. 그러나 `const latest = recorderResults?.[0] ?? null; if (!latest)
  return` → **녹음이 없으면 seed 안 됨.**
- pain effect (`:3200-3208`): herbal이면 즉시 return.
- 결과: **녹음 없는 herbal 레코드 → `emrText === ''`.**
- 그런데 §14.3이 이 상자를 `recorderResults?.[0] &&` 분기 **밖으로** 꺼내
  무조건 렌더로 바꿨다(`:3862-3884`). 예전에는 이 상태에서 상자 자체가 없었다.
- `handleCopyEmr`(`:3242-3264`)에 빈 값 가드가 없다 → `writeText('')` 성공 →
  `setCopyStatus('copied')` → 화면에 **"복사됨"**.
- `handleRebuildEmrSummary`(`:3226-3241`)는 herbal에서
  `if (!recorderResults?.[0]) return` → **아무 일도 안 하고 조용히 끝난다.**

동시에 `EmrPreviewCard`가 복사 버튼을 전역적으로 잃었으므로(HerbalWorkspace도
같은 컴포넌트를 쓴다 — `HerbalWorkspace.tsx:286`), **herbal EMR 미리보기
(변증·병기/치법/처방·계획/추적 증상)는 복사 경로가 하나도 남지 않았다.**
`mixed` 레코드는 더 나쁘다: 종결이 pain 6키만 내므로 한약 쪽 절반은 어디서도
복사할 수 없다. 카드에 새로 붙은 안내문 "복사는 「다음」 레인의 「종결」
섹션에서 합니다"(`EmrPreviewCard.tsx:22`)는 herbal 카드에서 **틀린 안내**다.

→ defect #1 (HIGH).

### D-3. `workspace`가 null/손상일 때 안전하게 저하되는가 — **예 (PASS)**

`deserializeWorkspaceState`(`persistence.ts`)는 `if (!isRecord(raw)) return empty`로
시작하고, 각 필드를 `sanitizeShape`/`sanitizeArray`/`isValidLbpDirectionalResponse`
(`:328-330`)로 개별 정화한다. `selectedRecord?.workspace`가 `undefined`/`null`/
문자열/부분 손상 JSON이면 `emptyWorkspaceState()`가 나오고, 종결 텍스트는 태블릿
payload로 채워진 `C/C`/`O/S`/`S` + 빈 `O`/`A`/`P`가 된다. throw 경로 없음.

### D-4. 무조건 렌더가 빈/오해 소지 상자를 새로 노출했는가 — **예** → D-2 = defect #1.

---

## E. §14.2 처치 chip (기능 PASS / 구현 결함 2건)

8개 승인 어휘(`FinalAssessmentCard.tsx:88`)가 `침 / 약침 / 부항 / 추나 / 물리치료 /
한약 / 테이핑 / 운동처방` 고정 순서로 렌더, 복수선택, 저장은 여전히 단일 `string`
필드(`composeInterventionValue`), 스키마·영속 필드 변경 없음 — 전부 확인.

### E-1. 라운드트립 실측 (직접 실행)

`parseInterventionValue`/`composeInterventionValue`를 번들해 11개 케이스 실행:

| 입력 | chips | 기타 | 라운드트립 |
|---|---|---|---|
| `침 맞고 나서 어지러움` | `[]` | `침 맞고 나서 어지러움` | **동일** ✅ |
| `침` | `[침]` | `` | 동일 |
| `침, 약침, 추나` | `[침,약침,추나]` | `` | 동일 |
| `약침, 침` | `[약침,침]` | `` | `침, 약침` (순서 정규화) |
| `침, 도수치료, 부항` | `[침,부항]` | `도수치료` | `침, 부항, 도수치료` (재배열) |
| `침 3회, 부항` | `[부항]` | `침 3회` | `부항, 침 3회` (재배열) |
| ` 침 ,  부항 ` | `[침,부항]` | `` | `침, 부항` (공백 정규화) |
| `침\n부항 후 호전` | `[]` | `침\n부항 후 호전` | 동일 |
| `침·부항` | `[]` | `침·부항` | 동일 |
| `한약(십전대보탕) 처방` | `[]` | `한약(십전대보탕) 처방` | 동일 |

**요청받은 핵심 케이스 `"침 맞고 나서 어지러움"`은 통과한다** — `침` chip으로
재해석되지 않고 기타 칸에 원문 그대로 남는다. 원인은 comma 토큰 단위 정확일치
(`known.has(t)`, `:104`)이지 부분문자열 매칭이 아니기 때문. 8개 어휘가 조용히
흡수하는 케이스는 없었다.

**내용 손실은 어느 케이스에도 없다.** 다만 재배열/공백 정규화는 발생하며,
이는 `FinalAssessmentCard.tsx:96`의 주석 *"Round-tripping … reproduces the
original string exactly"*가 **사실과 다르다**는 뜻이다(→ defect #10, LOW).
정규화는 원장이 chip이나 기타를 실제로 건드릴 때만 저장값에 반영되고
(`InterventionChipField`는 렌더만으로 `onChange`를 호출하지 않는다), 렌더만으로
저장값이 재작성되지는 않는다 — 이 점은 올바르다.

### E-2. 뮤턴트

- M2(레거시 보존 로직 제거) → **KILLED**. 구현자의 필수 뮤턴트 재현 성공.
- M3(승인 chip 하나 삭제) → **KILLED**.

### E-3. 결함 2건

- **defect #3 (MEDIUM)**: chip 그룹이 `<label>` 안에 들어 있다
  (`FinalAssessmentCard.tsx:133-166`). HTML에서 `<button>`은 labelable element이고
  label의 labeled control은 **첫 번째 labelable 자손** — 즉 `침` 버튼이다.
  따라서 `<span>시행/예정 처치</span>` 캡션(또는 label 안의 빈 여백)을 누르면
  **침 chip이 토글된다.** 태블릿 터치 화면에서 진료기록에 시술 항목이 오입력되는
  경로다. 이 저장소의 다른 chip 행은 전부 `<div>` 안에 있다
  (`ExamSuggestionCard.tsx:122`, `StructuredReassessmentCard.tsx:60`) — 이 하나만
  패턴에서 벗어나 있다.
- **defect #9 (LOW)**: 기타 칸이 `<input type="text">`(`:159-165`)인데, 이전
  `interventionPerformedOrPlanned` 편집기는 `<textarea rows={2}>`였다. 개행이 든
  레거시 값(`"침\n부항 후 호전"`)은 `parse`는 보존하지만 브라우저의 input value
  sanitization이 렌더 시 개행을 제거하므로, 원장이 기타 칸에 **한 글자라도 치는
  순간** `e.target.value`(정규화된 값)가 저장되어 개행이 소실되고 두 조각이
  구분자 없이 붙는다. **harness에 jsdom이 없어 실행 검증은 못 했다** — HTML
  표준의 value sanitization 규칙에 근거한 판정이다.

---

## F. §14.4 치료 직후 값 (PASS)

- 기본 숨김 + `직후 값 기록` 토글: `FollowUpTargetPicker.tsx:157-175`. 확인.
- 이미 값이 있으면 자동 표시: 가시성이 **파생식**
  `openPostTreatmentIds.has(t.id) || t.postTreatmentValue.trim() !== ''`
  (`:158`)로 매 렌더 계산된다. mount latch 아님 — §14.4 요구사항 충족.
- **N-2 경로 검증**: `setPostTreatmentValue`(`:88-91`)가 `updateField` 전에
  `openPostTreatmentField(id)`를 부르므로, **토글을 한 번도 안 눌렀고 값이
  있어서만 열려 있던** 입력칸을 지워 `''`로 만들어도 id가 open set에 들어가
  계속 보인다.

**교체된 테스트가 실제로 N-2 경로를 덮는가 — 예.** 새 `PRIMARY case` 테스트
(`tests/doctor-workspace.spec.mjs`)는 `postTreatmentValue: '5'`로 seed하고
(`openPostTreatmentIds`는 비어 있음), 토글이 0개임을 sanity 확인한 뒤 `''`로
지운다 — 정확히 N-2의 형태다. 내가 만든 M7(`openPostTreatmentField(id)` 호출만
제거)이 **바로 이 테스트에서 죽었다**:
`N-2 PRIMARY regression guard: clearing an already-recorded value back to ''
must not unmount the input mid-edit`. 두 번째 테스트(토글로 연 뒤 지우기)는
M7로 죽지 않으므로, 구현자가 "첫 테스트가 불충분했다"고 판단하고 PRIMARY
케이스를 추가한 것은 **정확한 진단이었다.**

---

## G. §14.5 CRM 중단 (중단 판단 PASS)

구현자의 3가지 근거를 코드에서 각각 확인했다:

1. **Episode 영속은 서버 전용.** `server/crmStore.js:73-105`가 파일-per-id로
   `episodes/<id>.json`을 쓰고, 클라이언트가 쓸 수 있는 경로는 HTTP 라우트뿐이다.
2. **workspace 저장 경로가 `episode_id`를 모른다.** `PUT /api/submissions/:id/
   workspace`(`server/index.js:651`)는 submission id만 받고, 클라이언트 콜백
   (`DoctorView.tsx:4256-4288`)도 `saveWorkspaceStateToServer(selectedId, state,
   expectedUpdatedAt)`뿐이다. episode 개념이 아예 없다.
3. **일반 episode update 라우트가 없다.** episode 쓰기 라우트는
   `POST /api/crm/episodes`(생성)과 `POST /api/crm/episodes/:id/{pause|complete|
   reopen}`(`server/index.js:1863-1900`) 세 액션뿐이다. `crmStore.js`에도
   `pauseEpisodeStored`/`completeEpisodeStored`/`reopenEpisodeStored`만 있고
   `applyNextReassessmentPlanToEpisode`를 감싼 stored 함수가 없다. 저장소 전체에서
   그 함수의 호출처는 `tests/crm-schema.spec.mjs:230` 하나다.

**client-only wiring이 존재하는가 — 아니오.** 클라이언트가 episode를 *찾을* 수는
있다(`GET /api/crm/episodes?patient_uuid=…` → `listEpisodesByPatient`,
`MedicationCourseSection.tsx:200-206`이 실제로 그렇게 한다). 하지만 찾은 뒤
`reassess_due`를 **쓸 수 있는 라우트가 없다.** 클라이언트 메모리에서만 계산하면
새로고침에 사라지고, CRM task 큐는 서버 파일을 읽으므로 아무 효과가 없다 —
"연결됐다"는 착시만 만든다. §14.5가 "서버 스키마 변경 없음이 가능한지 먼저
확인하고, 불가능하면 중단하고 보고한다"고 명시했으므로 **중단은 올바른 판단이다.**

단, 커밋 제목이 `… CRM reassess_due wiring`이라고 **구현된 것처럼** 적혀 있다
(본문에는 중단이 정확히 적혀 있다) → defect #11.

---

## H. 불변식 (PASS)

| 항목 | 결과 |
|---|---|
| FROZEN zero-diff (`git diff --stat origin/main -- src/spec index.html src/App.tsx "tablet core"`) | **빈 출력** ✅ |
| `server/**` (delta) | **무수정** ✅ |
| `patientCarePlanPreview.ts` / `provenance.ts` / `lbpExerciseEligibility.ts` / `lbpExerciseRecommendation.ts` / `revisitQuickCheck.ts` / `lbpWorkingHypothesis.ts` / `src/crm/**` | **무수정** ✅ |
| `LbpAwaitingCapabilitySection` | delta에 문자열 등장 0회 ✅ |
| `buildHerbalWorkspaceEmrPreview` | `emrPreview.ts:248-285` 무수정 (구 버전과 바이트 동일) ✅ |
| 새 자유입력 칸 | 순증 0 — 처치 `<textarea>` 1개 제거 / 기타 `<input>` 1개 추가, §14.2가 명시 승인. §14.4는 target당 −1칸 ✅ |
| 스키마·영속 필드 변경 | 없음 — `PainFinalAssessment.interventionPerformedOrPlanned`는 계속 `string`, `persistence.ts` 무수정 ✅ |
| 감사 §G 12개 불가침 | 전부 무손상. 확인한 것 중: #3 6상태(`provenance.ts` 무수정), #6 `제안이 자동으로 확정 소견이 되지 않음` 배지 존치(`EmrPreviewCard.tsx:19`), #8 `REPEAT_VISIT_AUTO_COMPARE_STATUS` 줄 존치(`FollowUpTargetPicker.tsx:181`), #11 ConflictBanner/preConflictDraft 무수정 ✅ |

CSS 변경(`workspace.css`)은 순수 시각 항목이며 무언가를 숨기는 규칙은 없다.
`.workspace__copyFeedback`/`.workspace__copyError` 셀렉터가 고아가 됐으나 무해.

---

## I. 테스트 비공허성 (부분 PASS)

### I-1. 뮤턴트 — A-3 표 참조

구현자 뮤턴트 2건 재현 성공(둘 다 KILLED). 내가 만든 4건 중 M3/M4/M7 KILLED,
**M6/M6b SURVIVED**(→ defect #6).

### I-2. 삭제된 `-` 단언 전수 검토 — **약화 없음**

test diff에서 사라진 단언은 정확히 5개다. 각각:

1. `assert.ok(textareaChunk.includes('진찰 소견:'))` → `includes('O:')` **+ 새
   단언** `!includes('검사 결과:')`. 옛 단언은 "라벨 줄이 존재"만 봤는데 새 쌍은
   "고정 키가 존재" + "미검사 상태에서 검사 절이 아예 없음"을 본다. **더 강함.**
2. `assert.ok(emrTextOnly.includes('Assessment:'))` → `includes('A:')`. 등가.
3. `Assessment:` 뒤가 비었는지 보는 정규식 → `!includes('최종 임상 판단:')`.
   단독으로는 "A가 정확히 비었는지"를 덜 본다. **그러나**
   `tests/lbp-working-hypothesis.spec.mjs`의 신규 골격 테스트가
   `allEmpty === 'C/C:\r\nO/S:\r\nS:\r\nO:\r\nA:\r\nP:'` 정확일치로 그것을 더 강하게
   덮는다(M4로 실증). **순증.**
4. `임상 가설 line` 3개 단언(`withoutHypothesis`/`withBlankHypothesis`/
   `renders exactly one`) → 문구만 "line"→"clause"로 바꾼 동일 단언 + 추가로
   `A: 임상 가설: …` 접두까지 고정. **더 강함.**
5. `hypIdx < assessmentIdx`(두 줄의 순서) → `aLine.indexOf('임상 가설:') <
   aLine.indexOf('최종 임상 판단:')` + `!includes('Assessment:')`. 같은 순서
   보장을 한 줄 안에서 하고, 옛 라벨 잔존까지 막는다. **더 강함.**

**결론: 갱신된 두 단언은 옛 단언이 지키던 것을 하나도 잃지 않았다.**

### I-3. §14.6이 요구했으나 구현되지 않은 테스트 — defect #5

§14.6 "EMR 복사 단일화" 항목은 세 가지를 요구한다:
(a) 참고 자료 안 복사 버튼 0개, (b) **종결 섹션에 1개**,
(c) **두 경로의 텍스트가 동일함을 단언**.

(a)만 구현됐다. (b)/(c)는 없다. 그런데 test 파일 주석이
*"its coverage lives as source-text assertions in tests/doctor.spec.mjs instead"*
라고 적고 있는데, **`tests/doctor.spec.mjs`는 이 delta에서 수정되지 않았고**
(`git diff --stat dd60c0e..61dca0a -- tests/doctor.spec.mjs` 빈 출력) 해당 파일에
`buildPainWorkspaceEmrPreview`/`emrSummaryText`/`EMR용 복사` 관련 단언이 하나도
없다. **주석이 존재하지 않는 커버리지를 있다고 진술한다.** Batch 2.6 N-3의 교훈
("잘못된 전제가 주석으로 남는다")과 같은 형태다.

---

## J. 구체적 결함

### 1. [HIGH] 녹음 없는 herbal-only 레코드에서 종결 EMR 상자가 비어 있고, 복사 버튼이 빈 문자열을 복사한 뒤 "복사됨"을 띄운다. 동시에 herbal EMR 미리보기가 유일한 복사 경로를 잃었다

- **위치**: `src/doctor/DoctorView.tsx:3862-3884`(무조건 렌더),
  `:3182-3197`(recorder effect가 herbal+무녹음에서 seed 안 함),
  `:3226-3241`(rebuild가 조용히 no-op), `:3242-3264`(복사에 빈 값 가드 없음),
  `src/doctor/workspace/EmrPreviewCard.tsx:22`(herbal 카드에도 뜨는 틀린 안내문),
  `src/doctor/workspace/HerbalWorkspace.tsx:286`.
- **왜 문제인가**: 이 상자는 §14.3이 만든 **유일한 EMR 복사 지점**이다. herbal
  레코드(및 mixed의 한약 절반)에서 그 지점이 빈 채로 "복사됨"을 확인해 준다.
  원장은 붙여넣기 전까지 아무것도 복사되지 않았음을 알 수 없다. 예전에는 이
  상태에서 상자 자체가 없었고 카드 복사 버튼이 있었으므로, **순수한 회귀**다.
  Batch 2.6 D-1과 같은 형태: 지운 경로의 대체 경로가 모든 화면에 있는지 확인하지
  않았다.
- **최소 수정 (택1, 상위가 바람직)**:
  - (a) herbal/mixed용 종결 텍스트도 조립한다 —
    `viewProfile !== 'pain'`일 때 `buildHerbalWorkspaceEmrPreview(...)`를
    `deserializeWorkspaceState(selectedRecord?.workspace)`로 부르고
    (mixed면 pain 6키 뒤에 CRLF+CRLF로 이어붙임), `handleRebuildEmrSummary`도
    같은 분기를 타게 한다.
  - (b) 최소한: `emrText.trim() === ''`이면 종결 EMR 블록을 렌더하지 않는다
    (또는 복사 버튼을 `disabled`로 두고 "복사할 내용이 없습니다" 안내).
    그리고 `EmrPreviewCard`의 안내문을 prop으로 받아 herbal에서는 다른 문구를
    쓰거나, herbal 카드에 한해 복사 버튼을 남긴다.
- **기계적 재확인 기준**: `tests/doctor.spec.mjs`에 소스-텍스트 단언 추가 —
  (i) 종결 EMR 블록이 `emrText`가 빈 상태에서 렌더되지 않거나 복사 버튼이
  disabled인 분기가 소스에 존재할 것, (ii) `handleRebuildEmrSummary`가
  herbal 경로에서 `buildHerbalWorkspaceEmrPreview`를 부를 것. 그리고
  `grep -c "EMR용 복사" src/` 가 계속 1일 것(또는 herbal 카드 예외를 택하면 2).

### 2. [HIGH] pain/mixed 레코드의 종결 EMR 텍스트가 원장이 직접 타이핑한 JudgmentPanel 3필드를 조용히 누락한다

- **위치**: `src/doctor/DoctorView.tsx:3200-3208`(pain effect가 recorder effect를
  완전히 대체), `:3226-3231`(rebuild도 동일), 잃은 값은
  `src/doctor/emrSummary.ts:26-28`, 편집 UI는 `src/doctor/JudgmentPanel.tsx:424-435`.
- **왜 문제인가**: `revised_after_exam`(Assessment) / `final_treatment_axis`
  (치료·처방) / `prescription_direction`(계획)은 **원장이 지금도 화면에서 입력할
  수 있는** 값이고, JudgmentPanel은 viewProfile 게이트 없이 렌더된다
  (`DoctorView.tsx:4765`). 입력은 되는데 출력 경로가 없는 필드가 3개 생겼다.
  §14.3은 "포맷을 6키로 바꾼다"만 승인했지 이 3필드 폐기를 승인하지 않았다.
  recorder 3필드(`history`/`key_findings`/`structuredNote.assessment`) 손실은
  §14.1의 6키 표에 대응 자리가 없으므로 논쟁의 여지가 있으나, **원장 타이핑
  3필드는 명백히 `A`/`P` 키에 속한다.**
- **최소 수정**: `buildPainWorkspaceEmrPreview`의 입력에 optional
  `clinicianJudgmentAssessment` / `clinicianJudgmentTreatment` /
  `clinicianJudgmentPlan`(전부 원장 타이핑값, `A`/`A`/`P`)을 추가하고
  `DoctorView.tsx:3153-3170`에서 `selectedRecord?.judgment`의 세 필드를 넘긴다.
  `A`에는 `최종 임상 판단:` 뒤에, `P`에는 `시행/예정 처치:` 앞/뒤에 절로 붙인다.
  **`O`에는 절대 넣지 않는다**(전부 원장값이지만 진찰 소견이 아니라 판단·계획이다).
  빈 값은 기존 규칙대로 절 자체를 생략.
- **기계적 재확인 기준**: `tests/lbp-working-hypothesis.spec.mjs`에 세 필드를
  채운 입력으로 `A:`/`P:` 줄에 각 문자열이 나타나고 `O:` 줄에는 나타나지 않음을
  단언하는 테스트 1개. 뮤턴트: 세 인자 중 하나를 드롭하면 실패해야 한다.

### 3. [MEDIUM] 처치 chip 그룹이 `<label>` 안에 있어, 필드 캡션을 누르면 `침` chip이 토글된다

- **위치**: `src/doctor/workspace/FinalAssessmentCard.tsx:133-166`
  (`<label …><span>시행/예정 처치</span><div role="group">…<button>침</button>…`).
- **왜 문제인가**: HTML에서 `<button>`은 labelable element이고, label의 labeled
  control은 첫 번째 labelable 자손이다. 따라서 캡션(또는 label 내부 여백)을 누르면
  `침` 버튼에 activation이 전달되어 **의도 없이 시술 항목이 기록/해제된다.**
  태블릿 터치 UI라 오탭 확률이 데스크톱보다 높고, 결과는 진료기록의 처치 항목
  오기재다. 이 저장소의 다른 chip 행은 전부 `<div>`를 쓴다
  (`ExamSuggestionCard.tsx:122`, `StructuredReassessmentCard.tsx:60`).
- **최소 수정**: `<label>`을 `<div className="workspace__finalAssessment__field
  workspace__finalAssessment__field--intervention">`로 바꾸고, 캡션 `<span>`에
  `id`를 주어 chip `<div role="group">`의 `aria-label`을 `aria-labelledby`로
  대체(또는 현행 `aria-label` 유지). 기타 `<input>`은 이미 자체 `aria-label`을
  가지고 있어 접근성 손실 없음.
- **기계적 재확인 기준**: `tests/doctor-workspace.spec.mjs`에 단언 추가 —
  chip 그룹의 모든 조상 중 `type === 'label'`인 노드가 0개일 것.
  뮤턴트: `<div>`를 `<label>`로 되돌리면 실패해야 한다.

### 4. [MEDIUM] 종결 EMR textarea의 수동 편집이 workspace autosave마다 조용히 덮어써진다

- **위치**: `src/doctor/DoctorView.tsx:3200-3208`
  (`useEffect(… setEmrText(buildPainEmrTextForRecord()) …,
  [payloadShapeOk, viewProfile, selectedRecord?.id, selectedRecord?.updated_at])`).
- **왜 문제인가**: 이 필드의 라벨은 `EMR용 요약 (plain text, 직접 수정 가능)`
  (`:3865-3866`)이다. workspace를 한 글자만 고쳐도 900ms 뒤 autosave가
  `setSelectedRecord(result.data)`(`:4265`)로 `updated_at`을 바꾸고, 이 effect가
  무조건 재실행되어 원장이 방금 손본 EMR 문장을 통째로 되돌린다. **기존 recorder
  effect는 `emrSeedRecordingIdRef`(`:3188-3189`)로 "새 recording_id일 때만
  덮어쓴다"는 명시적 seed-once 가드를 갖고 있었는데, 새 effect에는 대응 가드가
  없다.** 감사 §G-11이 지키라고 한 원칙("원장이 방금 친 내용이 사라지지 않게
  한다")과 같은 계열의 손실이다.
- **최소 수정**: seed 서명 ref를 둔다 —
  `const painEmrSeedRef = useRef<string | null>(null)`, effect 안에서
  `const sig = `${selectedRecord?.id}:${selectedRecord?.updated_at}``를 만들되
  `selectedRecord?.id`가 **바뀐 경우에만** 무조건 재seed하고, 같은 레코드에서
  `updated_at`만 바뀐 경우에는 `emrText`가 직전 생성값과 동일할 때에만 재생성한다
  (원장이 손댔으면 유지). 「요약 다시 만들기」 버튼이 이미 명시적 재생성 경로다.
- **기계적 재확인 기준**: `tests/doctor.spec.mjs`에 소스 단언 —
  pain EMR seed effect 본문에 ref 가드가 존재하고 `setEmrText`가 무조건 호출되지
  않을 것. 가드를 제거하면 실패해야 한다.

### 5. [MEDIUM] §14.6이 요구한 "종결 복사 버튼 1개" / "두 경로 텍스트 동일" 테스트가 없고, 주석이 없는 커버리지를 있다고 진술한다

- **위치**: `tests/doctor-workspace.spec.mjs` — §14.3 블록 상단 주석
  (*"its coverage lives as source-text assertions in tests/doctor.spec.mjs
  instead"*). `tests/doctor.spec.mjs`는 이 delta에서 무수정이고 해당 단언 0개.
- **최소 수정**: (a) 주석을 사실대로 고치거나, (b) `tests/doctor.spec.mjs`에
  DoctorView 번들 소스 텍스트 단언 2개 추가 —
  (i) `EMR용 복사` 리터럴이 소스에 정확히 1회 등장, (ii) 종결 경로의
  `buildPainWorkspaceEmrPreview` 호출 인자 목록이 `PainWorkspace.tsx`의 호출 인자
  목록과 같은 키 집합일 것(정규식/키 추출 비교).
- **기계적 재확인 기준**: 위 단언이 존재하고, `EmrPreviewCard`에 복사 버튼을
  되돌리면 (i)이 실패할 것.

### 6. [MEDIUM] O 경계 테스트의 사각 — `오늘 재검 소견` / `허리 움직임 반응` 절에 붙는 누출은 살아남는다

- **위치**: `tests/lbp-working-hypothesis.spec.mjs` — `oBoundaryInput`(원장 O 값이
  전무), `filled` fixture(`examSuggestions` + `lbpObjectiveMotorDeficit`만 존재,
  `reassessment`/`lbpDirectionalResponse` 없음).
- **실증**: M6(`onsetDurationText`를 `오늘 재검 소견:` 절에 삽입)과
  M6b(`aggravatingText`를 `허리 움직임 반응:` 절에 삽입) 모두
  `test:lbp-working-hypothesis`(231) · `test:doctor-workspace`(272) ·
  `test:workspace-round3`(179)를 **전부 통과했다.**
- **최소 수정**: `filled` fixture에 `reassessment`(오늘 result가 기록된 항목 1개)와
  `lbpDirectionalResponse`(non-`NOT_ASSESSED`)를 추가해 O 4절이 전부 켜진 상태로
  정확일치 단언을 확장하거나, O 줄 전용 단언을 하나 더 둔다 —
  "O 4절이 전부 채워지고 태블릿 3값도 전부 채워진 입력에서, `O:` 줄이
  `onsetDurationText`/`aggravatingText`/`impactText` 중 어느 문자열도 포함하지
  않는다".
- **기계적 재확인 기준**: 위 단언을 추가한 뒤 M6과 M6b를 재적용하면 **둘 다
  실패해야** 한다.

### 7. [MEDIUM] §14.1의 `O/S` "(재진) 경과 요약"과 `S` "micro follow-up"이 구현되지 않았다

- **위치**: `src/doctor/workspace/emrPreview.ts:239`(O/S는 `onsetDurationText`
  하나뿐), `:200-202`(S는 악화요인·일상 영향 둘뿐). §14.1 표는 O/S를
  "태블릿 발병 시점/기간 **+ (재진) 경과 요약**", S를
  "환자 자가보고(태블릿 응답, **micro follow-up**)"로 정의한다.
- **왜 문제인가**: 재진 레코드에서 `O/S`가 초진과 똑같은 기간 문구만 담아
  사실상 비어 보인다. 원장이 경과를 손으로 채우려다 `O`에 적으면 이 batch의
  유일한 임상 안전 항목이 사람 손으로 깨진다. 필요한 요약 함수는 이미 존재한다
  (`revisitQuickCheck.ts:357 summarizeRevisitQuickCheckKo`,
  `microFollowUp.ts:165 microFollowUpQuoteLine`) — 둘 다 환자 자가보고 요약이므로
  `O/S`/`S`행이 올바른 자리다. 회귀는 아니고 §14.1 미구현이다.
- **최소 수정**: optional 입력 `revisitRecapText?: string | null`(→ O/S 뒤에 이어
  붙임)과 `microFollowUpText?: string | null`(→ S에 절로 추가)을 추가하고 두 호출부
  (`DoctorView.tsx:3153-3170`, `PainWorkspace.tsx:686-711`)에서 같은 식으로 넘긴다.
  **`O`에는 절대 넣지 않는다.**
- **기계적 재확인 기준**: 두 값이 `O/S`/`S`에 나타나고 `O:` 줄에는 나타나지 않음을
  단언하는 테스트 1개 + defect #6의 확장된 O 단언이 이 두 값도 함께 금지할 것.

### 8. [LOW] `lbpDirectionalResponse`만 composer 내부 유효성 가드가 없다

- **위치**: `src/doctor/workspace/emrPreview.ts:189-191`. 같은 함수가 검사 status·
  laterality에는 `isValidExamStatus`/`isValidLaterality`(`:114, :118, :129, :133`)를
  방어적으로 쓰는데, `lbpDirectionalResponse`에는 `NOT_ASSESSED` 비교만 있다.
  `lbpDirectionalResponseLabel`(`lbpExamSuggestions.ts:233-235`)은 미지 값에 `''`를
  반환하므로 `O` 줄에 `허리 움직임 반응: ` 라는 **빈 소견**이 실린다(내 실측으로
  재현).
- **완화 요인**: 실제 두 호출부는 모두 `deserializeWorkspaceState`를 거치고
  `persistence.ts:328-330`이 `isValidLbpDirectionalResponse`로 정화하므로 **현재는
  도달 불가**다. 다만 composer는 export된 공개 함수이고 `O` 줄은 이 시스템에서
  가장 안전에 민감한 한 줄이다.
- **최소 수정**: `emrPreview.ts`에서 `isValidLbpDirectionalResponse`를 import해
  조건을 `isValidLbpDirectionalResponse(input.lbpDirectionalResponse) &&
  input.lbpDirectionalResponse !== 'NOT_ASSESSED'`로 바꾼다(1줄).
- **기계적 재확인 기준**: `lbpDirectionalResponse: 'NOT_A_REAL_VALUE'`로 부르면
  `O:`가 바로 그대로 나온다는 단언 1개.

### 9. [LOW] 개행이 든 레거시 처치 값이 기타 칸 첫 타이핑 시 손실된다

- **위치**: `src/doctor/workspace/FinalAssessmentCard.tsx:159-165`(`<input
  type="text">`). 이전 편집기는 `<textarea rows={2}>`(구 `TextFields`)였다.
- **최소 수정**: 기타 칸을 `<textarea rows={1}>`로 되돌린다(§14.2의 "기타 1칸"
  요건에 위배되지 않는다 — 칸 수는 그대로 1개다). CSS 셀렉터
  `.workspace__finalAssessment__interventionOther`는 그대로 쓸 수 있다.
- **기계적 재확인 기준**: `initialWorkspaceState`에 `'침\n부항 후 호전'`을 넣고
  기타 필드 노드의 `type`이 `'textarea'`이며 `props.value`가 개행을 포함함을 단언.
- **미검증 고지**: harness에 jsdom이 없어 브라우저의 input value sanitization을
  실행으로 확인하지 못했다. HTML 표준 규칙에 근거한 판정이다.

### 10. [LOW] 라운드트립 주석이 사실과 다르다

- **위치**: `src/doctor/workspace/FinalAssessmentCard.tsx:96`
  (*"Round-tripping through `composeInterventionValue` with no chip/기타 edit
  reproduces the original string exactly (comma-split/rejoin is lossless for that
  case)."*).
- **반례(실측)**: `'침, 도수치료, 부항'` → `'침, 부항, 도수치료'`,
  `'약침, 침'` → `'침, 약침'`, `' 침 ,  부항 '` → `'침, 부항'`.
  **내용 손실은 없고 재배열·공백 정규화뿐**이지만, 주석이 "exactly"라고 말한다.
  Batch 2.6 N-3의 교훈("잘못된 전제를 주석으로 남기지 않는다").
- **최소 수정**: 주석을 "내용은 무손실이나 chip은 정규 순서로, 나머지는 뒤로
  재배열되며 comma 주변 공백이 정규화된다"로 정정.
- **기계적 재확인 기준**: 위 세 케이스를 그대로 단언하는 테스트 1개.

### 11. [LOW] `HANDOFF.md` / `DECISIONS.md` 미갱신, 커밋 제목이 미구현 항목을 구현된 것처럼 적는다

- **근거**: `git diff --stat dd60c0e..61dca0a -- HANDOFF.md DECISIONS.md docs/`
  → 빈 출력. 커밋 제목 말미가 `… CRM reassess_due wiring`인데 본문 §14.5는
  "중단하고 보고함 — 미구현"이다.
- **왜 문제인가**: `CLAUDE.md`의 Review Protocol 5/6과 Definition of Done이
  HANDOFF 갱신을 요구한다. 또 `CLAUDE.md`는 "HANDOFF와 Git이 어긋나면 Git이 맞고,
  발견 즉시 HANDOFF를 고친다"고 못박고 있다. 커밋 제목은 그 Git 기록 자체를
  잘못 말하고 있다.
- **최소 수정**: `HANDOFF.md`를 현재 상태(Batch 4 구현 완료, §14.5 중단, Opus
  delta FAIL)로 갱신하고, §14.5 중단 사유를 `DECISIONS.md`에 1항목으로 남긴다
  (dead code가 왜 계속 dead인지의 근거가 코드 어디에도 없다). 커밋 제목은
  이미 push된 경우 정정 커밋/PR 본문에서 명시.
- **기계적 재확인 기준**: `HANDOFF.md`의 Next Recommended Action이 이 리뷰의
  defect 목록을 가리킬 것.

### 12. [LOW] `EmrPreviewCard`의 새 안내문이 herbal / fixture 모드에서 틀린 곳을 가리킨다

- **위치**: `src/doctor/workspace/EmrPreviewCard.tsx:22`
  (`복사는 「다음」 레인의 「종결」 섹션에서 합니다.`). 이 카드는
  `PainWorkspace.tsx:800`과 `HerbalWorkspace.tsx:286` 양쪽에서 쓰인다.
- **왜 문제인가**: herbal에서는 종결 상자가 이 카드와 **다른 내용**(또는 빈 값)을
  담는다(defect #1). fixture/preview 모드(`mode !== 'server'`)에서는 종결 섹션이
  아예 렌더되지 않으므로 존재하지 않는 곳을 가리킨다.
- **최소 수정**: 안내문을 prop(`copyHint?: string`)으로 받아 호출부가 정하게 하고,
  herbal에서는 defect #1의 해법에 맞춘 문구를 쓴다.
- **기계적 재확인 기준**: `HerbalWorkspace`가 렌더한 카드의 hint 문자열이
  `PainWorkspace`의 것과 다름을 단언(또는 defect #1 (a) 해법을 택하면 동일해도 됨).

---

## CLINICAL DECISION REQUIRED (non-blocking, PO 문구 결정 1건)

**빈 `O:` 줄의 차트 문구.** §14.1이 이미 "6줄 항상 출력 / 빈 값을 없음·정상으로
쓰지 않는다"를 결정했고 구현은 그 결정을 정확히 따른다. 코드 결함은 없다.
다만 이 텍스트는 EMR에 붙여넣어 **원장 본인이 아닌 사람**(대진의, 심사, 훗날의
기록 열람자)이 읽는 산출물이고, 그 독자에게는 "빈칸 = 미기재"라는 맥락이 없다.
PO가 판단할 선택지는 둘뿐이다:

- **(현행 유지)** `O:` — 날조 위험 0, 미기재/정상 혼동 위험 낮음(비영).
- **(대안)** `O: (미기재)` — 혼동 제거. 단 여섯 키 전부에 같은 규칙을 적용해야
  하고(한 키만 다르면 그 자체가 신호가 된다), 문구는 반드시 **기재 상태**를
  말해야 한다. `없음` / `정상` / `특이소견 없음`은 어떤 경우에도 불가.

Fable/Sonnet이 임의로 정할 문제가 아니라 PO 결정 사항이므로, 지금은 **현행 유지가
기본값**이고 이 항목이 Batch 4를 막지 않는다.

---

## 조치 불요 관찰 (참고)

1. **`buildHerbalWorkspaceEmrPreview`는 바이트 단위로 무수정**이다(§14.1 범위 밖
   규정 준수). 다만 defect #1이 해결될 때 이 함수가 종결 경로로 호출되더라도
   **함수 자체는 손대지 않는 것**이 §14.7 준수의 조건이다.
2. **참고 자료 접힘 안의 `PatientCarePlanPreviewCard` 복사·인쇄 버튼은 그대로다.**
   §14.6의 "참고 자료 안에 복사 버튼 0개"는 EMR 복사를 뜻하므로 환자 안내문
   복사는 해당 없음 — 유지가 맞다.
3. **`activeProfile`(수동 전환) vs `viewProfile`(파생) 게이트 차이**로 참고 자료
   카드와 종결이 서로 다른 부위를 보여줄 수 있다(D-1 (2)). 의도된 override이고
   종결이 파생 프로필을 따르는 것이 옳으므로 결함으로 올리지 않았다.
4. **`.workspace__copyFeedback` / `.workspace__copyError` CSS가 고아**가 됐다
   (`EmrPreviewCard`의 복사 UI 제거). 무해하며, defect #1을 (a)로 풀면 다시
   필요해질 수 있으므로 지금 지우지 않는 편이 낫다.
5. **`mergeLbpExamSuggestions`가 종결 경로에는 적용되지 않는다**
   (`DoctorWorkspace.tsx:137` vs `DoctorView.tsx:3155`). 병합 결과 항목은 항상
   `NOT_YET_CHECKED`로 시작해 EMR 출력에서 제외되므로 **텍스트 차이는 없다** —
   확인했고 결함이 아니다. 다만 향후 병합이 결과값을 seed하게 바뀌면 즉시
   두 경로가 갈라진다.
6. **종결 섹션 전체가 `mode === 'server' && selectedRecord?.patient_id` 안에
   있어 어떤 테스트 harness에서도 렌더되지 않는다.** §14.3 판정 중 D-1/D-2/D-4는
   전부 소스 추적이며 실행 검증이 아니다. defect #1·#2·#4를 고칠 때
   `tests/doctor.spec.mjs`의 소스-텍스트 단언 관례를 반드시 함께 쓸 것 —
   이 화면은 그 관례 없이는 영구히 무검증 영역으로 남는다.

---

## 재확인 체크리스트 (수정 후 이것만 돌리면 된다)

```
npx tsc -b
npm run build
npm run test:emrSummary
npm run test:doctor-workspace
npm run test:workspace-round3
npm run test:lbp-working-hypothesis
npm run test:crm-schema
npm run test:doctor
git diff --stat origin/main -- src/spec index.html src/App.tsx "tablet core"   # 빈 출력이어야 함
grep -c "EMR용 복사" -r src/                                                     # defect #1 해법에 따라 1 또는 2
```

그리고 **뮤턴트 M6/M6b를 재적용해 둘 다 실패하는지** 확인한다(defect #6):

```
# emrPreview.ts:193  오늘 재검 소견 절 뒤에  ${input.onsetDurationText ? ` (경과: ${input.onsetDurationText})` : ''}  삽입
# emrPreview.ts:190  허리 움직임 반응 절 뒤에 ${input.aggravatingText ? ` / 악화요인 ${input.aggravatingText}` : ''}   삽입
npm run test:lbp-working-hypothesis   # 둘 다 FAIL 이어야 한다
```
