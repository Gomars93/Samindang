# Opus Closing Review — LBP Production v1 Batch 2 (860fdf0..c23c3d0) — 2026-09-02

**리뷰어:** Opus (실제 모델 호출, Fable 세션의 subagent invocation; session https://claude.ai/code/session_019JGkicU3oJZVyPn7fMqPS9)
**결과:** PASS — 결함 1~9 해소(BLOCKER CD-1 위반은 엔진·추천·UI 3계층 probe + mutation 검증으로 해소 확인), FROZEN zero-diff, test:all·build PASS. 잔여: §C(i) 회귀 채택 문구 구분자, §C(ii) 회귀 문구 테스트 — 둘 다 v1에서 도달 불가 경로라 비차단, **CD-3를 3상태 chip으로 결정할 경우 Batch 2.5 선행 필수**. displayNameKo 20개는 PO 명명 승인 대상(§F 제안 5건).

---

I have everything I need. Here is the closing review.

---

# LBP v1 Batch 2 — Opus Closing Review (`860fdf0..c23c3d0`)

검증 실행 결과 (모두 repo 무수정, working tree clean, HEAD `c23c3d0`):
`npx tsc -b` **exit 0** · `test:lbp-exercise-eligibility` **22 PASS** · `test:lbp-exercise-recommendation` **17 PASS** · `test:doctor-workspace` **219 assertions PASS** · `test:workspace-round3` **133 PASS** · (추가) `test:lbp-exercise-core20-vignettes` PASS · `test:lbp-exercise-library` 6 PASS · `test:lbp-exam-suggestions` 25 PASS · `npm run test:all` **exit 0** · `npm run build` PASS.
FROZEN zero-diff: `git diff --stat origin/main -- src/spec index.html src/App.tsx server "tablet core"` = 빈 출력 ✓.

## A. 결함 1–9 판정

| # | 판정 | 근거 (file:line) |
|---|---|---|
| **1** BLOCKER/CD-1 | **RESOLVED** | `lbpExerciseEligibility.ts:339`가 `=== 'NO'`로, `:341-343`이 `unconfirmedRegressible`(`=== 'UNKNOWN'`)로 분리. `:368-375`의 DEFER 분기가 `:377`의 START_WITH_REGRESSION **앞**에 위치. neuro-UNKNOWN 분기(`:359`)는 두 집합을 합쳐 chip 정보 보존. adapter는 여전히 YES∣UNKNOWN만 생성(`lbpEligibilityContext.ts:158-162`) |
| **2** RF-8 회귀 용량 | RESOLVED WITH ISSUE | `lbpExerciseRecommendation.ts:438-439`(`regressionSuffix`), `:378`(카드 `쉬운 단계:` sourceFact), `:387`+`rehabSuggestion.ts:67`+`persistence.ts:75`(구조적 `regressed` 플래그, 제목 문자열 파싱 없음), `:445` 호출부. **이슈 2건 → C절** |
| **3** 한국어 운동명 | **RESOLVED** | `lbpExerciseCoreMetadata.ts` 20행 전부 `displayNameKo` 추가, `lbpExerciseRecommendation.ts:224`(카드 제목)·`:439`(채택 문구)만 사용. 카탈로그 `canonicalName`은 `lbpExerciseLibrary.ts`에 원문 그대로 보존 ✓ |
| **4** 3개 + 더 보기 | **RESOLVED** | `PainWorkspace.tsx:473`(상수 3), `:537-538`(slice, 버림 없음), `:566-571`(`<details><summary>더 보기 (N)</summary>`) |
| **5** chip 확인 취소 | **RESOLVED** | `DoctorWorkspace.tsx:720-727` 대칭 toggle, `:714` 원본 배열 전달, `PainWorkspace.tsx:234-249` `aria-pressed="true"` "확인됨" chip 행 + `:207-209` 미지 capability 방어 필터 |
| **6** UNCLEAR 접힘 | **RESOLVED** | `lbpEligibilityContext.ts:143-149` — `UNCLEAR`도 `UNKNOWN`, `NO_CLEAR_DIRECTION`은 근거 주석과 함께 `STABLE_OR_IMPROVING` 유지 |
| **7** 비-LBP 채택 버튼 | RESOLVED WITH ISSUE | `DoctorWorkspace.tsx:698-710` `isLbpRecord ? … : undefined`. **SYNTHETIC 잔여분 → C절** |
| **8** LUMBAR_02 도달불가 | **RESOLVED** | `lbpExerciseRecommendation.ts:61` export + `:52-59` 근거 주석, `tests/lbp-exercise-recommendation.spec.mjs`의 `deepEqual(unreachableIds, ['LBP_LUMBAR_02'])` 고정 테스트 |
| **9** 잠금 배너 위치 | **RESOLVED** | `PainWorkspace.tsx:560-562` — `rehabSuggestions.length > 0` 블록 **밖**, 섹션 최상단 공통 |

## B. Probe 재실행 (엔진 직접 번들, 독립 실행)

```
[caps 전부 UNKNOWN, neuro STABLE]        {"DEFER_NOT_READY":20}   START_WITH_REGRESSION = 0 ✓
[caps 전부 명시 'UNKNOWN']               {"DEFER_NOT_READY":20}   START_WITH_REGRESSION = 0 ✓
[caps 전부 'NO']  {"DEFER_NOT_READY":16,"START_WITH_REGRESSION":4}
   LBP_LUMBAR_03←SUPINE_TOLERATED | LBP_HIP_MOB_01←SUPPORTED_STANDING,BALANCE
   LBP_HIP_STR_03←SUPPORTED_STANDING,BALANCE | LBP_EXPOSURE_03←SITTING_TOLERATED
```
추천 레벨(실제 payload, `lbp_tf_walking` 선택, 확인 0건): `blocked=null`, **`readyCandidates=[]`**, `awaitingCapabilityCandidates=[ACT_01, ACT_02, HIP_MOB_01, TRUNK_END_01, HIP_STR_03, NEURAL_01]` ✓. 동일 조건 전부 확인 시 READY 6개 전원 `START_AS_WRITTEN`.
→ **CD-1 옵션 B 준수 확인. 회귀 계층은 엔진 수준에서 정확히 RF 매핑대로 살아 있음**(delta review에서 누출됐던 바로 그 4개가 `'NO'`에서만 재현).

**테스트 비-공허성(mutation 검증):** scratchpad 사본에서 defect 1 수정을 되돌린 mutant를 빌드해 실행 → all-UNKNOWN에서 `START_WITH_REGRESSION = 4 ["LBP_LUMBAR_03","LBP_HIP_MOB_01","LBP_HIP_STR_03","LBP_EXPOSURE_03"]`, 그리고 `LOAD_02/LOAD_READY=UNKNOWN`·`FUNC_01/SUPPORTED_STANDING=UNKNOWN`·`FUNC_05/HIP_HINGE=UNKNOWN` 모두 `START_WITH_REGRESSION` 반환. 즉 새로 추가된 4개 negative assertion은 counterexample에서 **실제로 실패한다** ✓. defect 3/6/8 테스트도 구성상 비-공허(pre-fix 값에서 각각 Latin 검출/`STABLE_OR_IMPROVING`/집합 불일치로 실패).

## C. 새 결함 도입 여부 — 2건 (모두 v1 비차단, PASS 유지)

- **(i) 회귀 채택 문구의 구분자 부재 — CD-3 진행 시 반드시 선행 수정.** `lbpExerciseRecommendation.ts:439`는 `${startingDoseKo}${regressionSuffix} 중단·재검토:`로 잇는데, Core-20 20행의 `regressionKo`가 **전부 종결부호 없이** 끝난다. 실제 출력: `"…평지·느린 속도·휴식 지점을 사용 중단·재검토: …"` → 환자가 "휴식 지점을 사용 **중단**"으로 읽을 수 있다(의도의 정반대). HIP_STR_03/FUNC_01(`…반복수 감소 중단·재검토`), EXPOSURE_03(`…걷기 구간을 허용 중단·재검토`)도 동일. **v1에서는 `START_WITH_REGRESSION`이 구조적으로 도달 불가(§CD-3)라 환자에게 출력되지 않으므로 게이트를 막지 않는다.** 최소 수정: `:439`를 `` `… ${meta.startingDoseKo}${regressionSuffix ? regressionSuffix + '.' : ''} 중단·재검토: …` `` 또는 `쉬운 단계`를 별도 줄로 분리. 기계적 재확인: 20 id × `buildLbpAdoptionText(id,{regressed:true})`에 대해 `/[^.。]\s중단·재검토/` 가 0건일 것.
- **(ii) defect 2에 회귀 방지 테스트가 없다.** `regressionSuffix`(`:438`)·카드 sourceFact(`:378`)·`regressed` 플래그(`:387`, `:445`)를 되돌려도 현재 테스트는 전부 통과한다 — 유일한 관련 assertion인 `defect 3` 테스트는 `{regressed:true}` 출력의 **Latin 문자 부재만** 검사하고 `regressionKo` 포함 여부는 검사하지 않는다. 최소 수정: `tests/lbp-exercise-recommendation.spec.mjs`에 (a) `buildLbpAdoptionText(id,{regressed:true})`가 `meta.regressionKo`를 포함하고 plain 변형은 포함하지 않을 것, (b) `START_WITH_REGRESSION` 후보의 `candidateToRehabSuggestion(...).regressed === true` 및 sourceFacts에 `쉬운 단계:` 존재, (c) `appendLbpAdoptionText`가 `suggestion.regressed`를 읽을 것(제목에서 `(쉬운 단계로 시작)`을 지운 뒤에도 회귀 문구가 남는지)을 추가.
- **defect 7 잔여분(별건, 무해):** `isLbpRecord`는 `payload.responses.safety_flags.lbp != null`이므로 **SYNTHETIC LBP 프리뷰(`PAIN_SCENARIO_1`)에서는 여전히 true**다. 프리뷰의 `(예시) 코어 안정화 홈 운동`을 ACCEPTED로 바꾸면 채택 버튼이 나타나고 `"(예시) … — (예시) …"`가 Care Plan에 append된다(`buildLbpAdoptionText`가 null → 제목/목표 fallback). 실제 제출 렌더에는 `synthetic` prop이 전달되지 않으므로 환자 경로 영향 없음. 완전 정합을 원하면 `:699`를 `!synthetic && isLbpRecord`로. **선택 사항.**

## D. 범위/불변조건 재확인

FROZEN zero-diff ✓ · scope creep 없음(변경 13파일 전부 Batch 2 범위 + gitignore/package.json은 신규 테스트 번들 2개 등록뿐) · `<PainExerciseSection` 렌더 사이트 정확히 1곳(`DoctorWorkspace.tsx:674`, 판단·처치 레인, `PainFinalAssessmentCard` 직후) · `progressionKo`는 코드 어디에서도 읽히지 않음(전체 참조가 타입/주석/테스트 금지 assertion뿐) · 채택은 `status==='ACCEPTED'` + 명시적 `onClick`에서만(`RehabSuggestionCard.tsx:95-101`), 자동 경로 없음 · `treatmentSafetyLocked`는 카드는 남기고 버튼만 `disabled`(CD-2 유지) · 새 태블릿 문항 없음 · `mergeLbpRehabSuggestions`는 `regressed`를 fresh 값으로 갱신하고 결정된 stale 항목만 스냅샷 유지(기존 절충 그대로).

**한국어 표시 필드 Latin 스캔 (20행 × displayNameKo/startingDoseKo/stopReviewKo/regressionKo = 80필드): 검출 0건** ✓

## E. 메타데이터 번역 8건 — 의미 보존 검증

`git diff 860fdf0..c23c3d0 -- lbpExerciseCoreMetadata.ts`의 숫자 토큰 추출 결과 변경분에 나타난 수치는 `3~5` 2회(삭제/추가 동일 줄)뿐 — **용량·횟수·시간 어느 것도 변경되지 않음**. 8건 모두 순수 번역으로 판정:

| 위치 | 원문 → 번역 | 판정 |
|---|---|---|
| DIR_02 `regressionKo` | prone lying → 엎드려 눕기 자세 | ✓ |
| DIR_03 `regressionKo` | prone-on-elbows → 팔꿈치 괴고 엎드리기 자세 | ✓ (DIR_02 표시명과 일관) |
| TRUNK_03 `stopReviewKo` | 뚜렷한 distal symptom 증가 → 뚜렷한 하지 원위부 증상 증가 | ✓ 요통 맥락에서 distal=하지 원위부, 타 행 표현과 일치. 기준 강도 불변 |
| TRUNK_END_01 `regressionKo` | 짧은 isometric hold → 짧게 등척성으로 유지 | ✓ 용어 정확(다만 §F 참고) |
| FUNC_05 `regressionKo` | 막대기 cue → 막대기로 자세 안내 | ✓ 의미 보존(접촉점 특정성은 원문에도 없었음) |
| LOAD_02 `regressionKo` | hip hinge 기술 연습 → 고관절 접기 기술 연습 | ✓ FUNC_05 표시명과 일관 |
| NEURAL_01 `regressionKo` | 한 관절의 excursion → 한 관절의 움직임 폭 | ✓ |
| EXPOSURE_01 `startingDoseKo` | 3~5회 controlled exposure → 3~5회 통제된 노출 | ✓ 횟수 동일 |

**semantic drift 없음.** (`startingCriteriaKo`/`acceptableResponseKo`/`progressionKo`에는 여전히 영어가 남아 있으나 이들은 환자·채택 문구에 노출되지 않는 원장용 필드로, 이번 요구사항 범위 밖 — 의도적 미변경으로 수용.)

## F. `displayNameKo` 20개 임상 검토 (PO 명명 승인용)

오기재(misdescribe)로 판단되는 이름 **없음**. PO에게 함께 올릴 개선 제안 5건:

1. **`LBP_DEEP_TRUNK_01` "배에 힘주기(코어 브레이싱)" — 가장 유의미한 건.** 해당 행의 `acceptableResponseKo`는 명시적으로 *"허리통증을 억지로 참기 위한 최대수축이 아님"*, `startingDoseKo`는 *"편안한 호흡을 유지하며"*다. "배에 힘주기"는 고령 환자가 **최대 수축 + 호흡 정지**로 수행하기 쉬운 이름이라 시작 기준과 반대 방향으로 작동할 수 있다. 제안: **"배에 살짝 힘주기"** 또는 "숨 쉬면서 배에 살짝 힘주기".
2. `LBP_DIR_03` "반복 허리 젖히기" — 자세(엎드려/서서)가 특정되지 않는다. regression이 "팔꿈치 괴고 엎드리기"인 점으로 보아 prone 계열. 제안: "엎드려 반복 허리 젖히기".
3. `LBP_DIR_04` "누워서·앉아서 숙이기" — 누운 자세에서 "숙이기"는 실제로 무릎 당기기에 가깝다. 제안: "누워서·앉아서 굽히기".
4. `LBP_EXPOSURE_03` "앉아 있기 시간 늘리기" — `startingDoseKo`는 *현재 편안한 시간보다 **짧은** 구간*부터 시작하라고 지시한다. 이름이 목표를 말하고 용량이 시작점을 말하는 구조라 과수행 여지가 있다. 제안: "앉아 있기 단계적으로 늘리기".
5. 굽힘 계열 3개(`DIR_04` 숙이기 / `EXPOSURE_01` 숙이기 단계적 시도 / `FUNC_05` 고관절 접기 동작)가 같은 목록에 동시 노출되면 환자 혼동 가능. PO 검토 시 함께 볼 것.
   (그 외 `LBP_LUMBAR_02` "고양이·낙타 자세"는 정지 자세가 아닌 반복 움직임이므로 "…움직임"이 더 정확하나 관용적 표기로 수용 가능.)

---

# Closing disposition: **PASS**

게이트 종료. 결함 1–9 전부 해소(1·3·4·5·6·8·9 완전, 2·7은 v1 도달 불가/프리뷰 한정 잔여 이슈만 남음), BLOCKER인 CD-1 위반은 엔진·추천·UI 3계층에서 독립 probe로 해소 확인. FROZEN zero-diff·scope creep 없음·전체 테스트 및 build 통과. **CD-3는 Batch 2.5로 명시 이월** — `DECISIONS.md:1724-1730`에 PO 결정 대기로 기록되어 있으며 Batch 2 병합의 전제조건이 아니다. Batch 2는 PO의 PR/merge 판단으로 넘어가도 좋다.

**PR 생성 전 필수 1건 (코드 아님, CLAUDE.md Definition of Done):** `HANDOFF.md:3, 17-28`이 아직 *"Sonnet fix 진행 중"*, *"다음 행동: Sonnet fix 커밋 → Opus closing"*으로 되어 있다. 실제 Git은 fix가 `c23c3d0`으로 커밋되고 closing review까지 끝난 상태다. HANDOFF를 실제 상태(= Batch 2 fix 완료·closing PASS·다음은 PO의 PR/merge 판단 및 CD-3 결정)로 갱신한 뒤 PR을 올릴 것.

**Batch 2.5 진입 시 선행 필수 (CD-3를 3상태 chip으로 결정하는 경우에만):** §C(i) 구분자 수정 — 이것 없이 `START_WITH_REGRESSION`을 활성화하면 환자 take-home 문구가 "…휴식 지점을 사용 중단·재검토"로 출력된다. §C(ii) 회귀 문구 테스트도 같은 PR에 포함할 것.

---

# CLINICAL DECISION REQUIRED

**CD-3 외 신규 없음.** CD-3(capability chip 3상태 `확인함/지금은 안 됨/미확인` 도입 여부)는 `DECISIONS.md` 2026-09-02 항목에 PO 결정 대기로 이미 기록되어 있고, 본 리뷰는 그 판단을 바꿀 새 근거를 찾지 못했다(권고 기본값 유지: **Batch 2.5에서 3상태 도입**, `'NO'` 확인 UI가 생기는 즉시 §B의 4개 회귀가 정상 작동함을 실측으로 확인).

**PO 승인 대기(임상 규칙 아님, 명명):** `displayNameKo` 20개 — §F의 5건 제안과 함께 검토 요청. 특히 1번(`LBP_DEEP_TRUNK_01`)은 이름이 시작 기준과 상충할 소지가 있어 우선 검토 권장.

# No-action observations

- `START_WITH_REGRESSION`은 v1에서 **구조적으로 도달 불가**임이 재확인됨(`lbpEligibilityContext.ts:158-162`가 YES∣UNKNOWN만 생성). 이는 CD-1 옵션 B의 의도된 결과이며 defect 1 수정의 부작용이 아니다. 관련 코드 경로(§C(i)(ii))는 CD-3 대비로 남겨두고 삭제하지 말 것.
- vignette 하네스의 `START_WITH_REGRESSION: 5`는 엔진을 호출하지 않는 손으로 쓴 임상 기대표이며 `'NO'` 상황을 기술한다 — defect 1 수정 후에도 유효한 교차 확인점, 수정 불필요.
- 목표기능 미선택 힌트 분기(`PainWorkspace.tsx:517-536`)는 조기 return이라 그 상태에서는 "확인된 준비 조건" 취소 chip이 렌더되지 않는다. 원장이 capability를 확인한 뒤 목표기능을 모두 해제한 극단 경로에서만 발생하고 확인 값 자체는 보존되므로 무해.
- 잠금 배너가 `<section>` 밖 최상단 `<p>`로 올라갔다(`:560`). 두 그룹 공통 표시라는 목적에는 맞으나, 시각적으로 섹션 헤더보다 위에 뜬다 — PO가 실제 태블릿에서 한 번 확인하면 좋다.
- `.gitignore`/`package.json` 변경은 신규 테스트 번들 2개(`lbpEligibilityContext`, `lbpExerciseCoreMetadata`) 등록뿐으로, 소스 산출물이 커밋되지 않도록 정상 처리되어 있다.
- `regressed`는 optional(`rehabSuggestion.ts:67`) + 템플릿 기본값 `false`(`persistence.ts:75`)로 이전 저장본과 호환된다 — `workspace-round3` 133 PASS로 확인.