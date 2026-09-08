# Opus Bounded Clinical Validation — LBP Exercise Eligibility v0.1 — 2026-09-02

**리뷰어:** Opus (실제 모델 호출, Fable 세션의 subagent invocation; session https://claude.ai/code/session_019JGkicU3oJZVyPn7fMqPS9)
**목적:** Batch 2(운동 추천) 진입 전 production dependency gate (아키텍처 문서 §5 Batch 2 (2), G7).
**결과 요약:** PASS WITH REQUIRED FIXES — BLOCKER 3(RF-1/2/3), HIGH 5, MEDIUM/LOW 5, CLINICAL DECISION REQUIRED 2(CD-1, CD-2 → Product Owner).

---

# Opus Bounded Clinical Validation — LBP Exercise Eligibility v0.1

**범위:** Batch 2 선행 검증(아키텍처 §5, G7). 읽기 전용. 저장소 파일 무수정.
**검증 대상 (research branch, `origin/claude/feat-lbp-action-adaptive-engine-prototype`, head `b099417`):**
`src/doctor/workspace/lbpExerciseEligibility.v01.experimental.ts` (이하 **ELIG**),
`lbpExerciseCoreMetadata.v01.experimental.ts` (**META**),
`lbpExerciseLibrary.v01.experimental.ts` (**LIB**),
`tests/lbp-exercise-eligibility.experimental.spec.mjs` (**T1**),
`tests/lbp-exercise-core20.vignettes.experimental.spec.mjs` (**T2**).
**검증 방법:** 정적 독해 + 규칙 엔진을 실제 번들해 blank/edge context로 20개 전 항목 실행(경로: scratchpad, 저장소 미변경).

---

## Disposition: **PASS WITH REQUIRED FIXES**

규칙 계층의 임상적 골격(안전 우선순위 3단, 방향성 반응 gate, 하드/회귀 분리, UNKNOWN 비정상화 의도)은 CLOSED 문서(`LBP_REHAB_STRATEGY_DECISION_v0.1.md`)와 일치하며, 재작성이 필요한 설계 결함은 없다. 그러나 **production 의존 전에 반드시 고쳐야 할 blocker 3개**(RF-1 신경상태 UNKNOWN 우회, RF-2 routineCareAllowed 출처, RF-3 treatment safety 미반영)와 임상적으로 잘못 분류된 요구조건 다수가 있다. 현 상태 그대로 Batch 2 adapter를 붙이면 **가장 흔한 실제 상황(아무것도 확인되지 않은 초진)에서 8개 운동이 "시작 가능(regression)"으로 추천된다.**

---

## 1. Safety dominance

**Verdict: PASS (19/20), REG_01은 조건부 수용 — 표현 계층 조건 부과.**

`evaluateLbpExerciseEligibility`의 검사 순서는 ELIG:165 → :175 → :185 → :195 → :212 → :223 → :236 → :246이며, 세 개의 안전 gate가 **모든 START 상태보다 위**에 있다:

| gate | 위치 | 적용 범위 |
|---|---|---|
| `routineCareAllowed === false` → STOP_REVIEW | ELIG:165 | **20/20 무조건** ✓ |
| `neuroStatus === 'NEW_OR_WORSENING'` → STOP_REVIEW | ELIG:175 | `requiresStableNeuro` 19/20 ✓ |
| `distalSymptomResponse === 'WORSENING'` → STOP_REVIEW | ELIG:185 | `stopOnDistalWorsening` 19/20 ✓ |

`rule()` 기본값(ELIG:95-96)이 둘 다 `true`이므로 명시적으로 끈 항목만 예외다. 실행 확인: `routineCareAllowed:false`는 20/20 STOP_REVIEW(T1:48-51과 일치).

**LBP_REG_01(ELIG:143-146)의 두 예외 판정 — 임상적으로 수용 가능하나 무해하지는 않다.**
- `stopOnDistalWorsening: false`: 호흡·이완(META:263-272)은 기계적 부하가 없어 원위부 증상에 직접 영향을 주지 않는다. 자율신경 조절을 원위부 악화 시점에 중단시킬 임상 근거가 없다. **의도된 예외로 타당.**
- `requiresStableNeuro: false`: **이쪽이 문제다.** `NEW_OR_WORSENING`과 `routineCareAllowed=false`가 항상 동시에 오지 않는다. `clinician_objective_motor_deficit === 'SEVERE_OR_PROGRESSIVE'`는 `src/spec/lbpLogic.ts:217`을 통해 URGENT_REVIEW를 만들지만, **Batch 3의 "새/악화 신경증상" chip은 FROZEN safety에 되먹임이 없다**(아키텍처 G12가 아직 미구현). 실행 확인:

```
REG_01, neuroStatus=NEW_OR_WORSENING, routineCareAllowed=true → START_AS_WRITTEN
```

즉 재진에서 원장이 "새 신경증상 있음"을 기록한 직후, 화면에 초록색 "지금 시작 가능" 카드가 하나 남는다. 규칙 계층에서 고칠 문제는 아니다(호흡을 금지할 이유가 없음). **표현 계층에서 막아야 한다 → RF-3b.**

`requiresStableNeuro=false` / `stopOnDistalWorsening=false`인 다른 운동은 없다. LBP_REG_01이 유일한 예외이며 이는 의도와 일치한다.

---

## 2. UNKNOWN ≠ normal, 그리고 검사 순서

**Verdict: FAIL — 순서는 결함이며 production 전 반드시 고쳐야 한다.**

**(a) capability UNKNOWN → START_AS_WRITTEN 없음: PASS.** `capabilityValue`(ELIG:151-156)는 미기재를 UNKNOWN으로 fail-closed 처리하고, hard(ELIG:212)·regressible(ELIG:223) 둘 다 `!== 'YES'`로 판정한다. UNKNOWN capability가 있는 한 START_AS_WRITTEN에 도달할 수 없다.

**(b) neuroStatus UNKNOWN → DEFER: 조건부만 PASS.** 전 capability를 YES로 채우고 neuro만 UNKNOWN으로 두면 19/20이 DEFER_NOT_READY(REG_01만 START_AS_WRITTEN, 예외 정의대로). 여기까지는 T1:54-58의 주장과 일치한다.

**(c) 순서는 결함이다 — 이론이 아니라 실측이다.**
regression 반환(ELIG:226-234)이 neuro-UNKNOWN 검사(ELIG:236-244)보다 **앞**에 있어서, regressible 요구조건이 하나라도 미충족이면 신경 gate에 도달하지 못한다. adapter 기본 상태(routineCareAllowed=true, neuro UNKNOWN, capabilities 전부 UNKNOWN, directional NOT_ASSESSED)로 20개를 실행한 결과:

```
START_WITH_REGRESSION 8 : LUMBAR_02, LUMBAR_03, HIP_MOB_01, DEEP_TRUNK_01,
                          TRUNK_END_01, HIP_STR_03, FUNC_01, EXPOSURE_03
DEFER_NOT_READY      12
```

아키텍처 §2.2는 `eligible(START_AS_WRITTEN/START_WITH_REGRESSION)`을 `RehabSuggestion[]`으로 넘긴다. 따라서 **신경학적 상태가 한 번도 확인되지 않은 초진 환자에게 8개 운동이 추천 후보로 올라온다.** 이는 ELIG 파일 헤더(:16 "UNKNOWN never becomes normal/ready"), 아키텍처 §2.3, 그리고 CLOSED 문서의 명시적 금지 항목("hidden conversion of unknown/unassessed into normal/eligible", `LBP_REHAB_STRATEGY_DECISION_v0.1.md` "Explicitly rejected designs")을 동시에 위반한다.

T1이 이걸 못 잡는 이유: 유일한 neuro-UNKNOWN 테스트(T1:54-58)가 `LBP_NEURAL_01` — regressible이 비어 있는(ELIG:133) 항목이라 반드시 :236에 도달한다. **테스트가 결함을 구조적으로 회피하고 있다** → RF-11.

→ **RF-1 (BLOCKER).**

**(d) distalSymptomResponse UNKNOWN은 아예 분기가 없다.** ELIG:185는 `=== 'WORSENING'`만 본다. UNKNOWN은 STABLE_OR_IMPROVING과 완전히 동일하게 통과한다. 초진에서는 "운동 반응"이 아직 존재하지 않으므로 이 자체가 즉시 위험은 아니지만, **재진에서 원장이 반응을 기록하지 않은 경우와 "안정적"이 구분되지 않는다.** → RF-12.

---

## 3. Directional rules

**Verdict: PASS (규칙 계층), 단 adapter 제약 1건 필수.**

- `requiredDirectionalResponse`를 가진 규칙은 **DIR_02(ELIG:111-113, EXTENSION), DIR_03(:114-116, EXTENSION), DIR_04(:117-119, FLEXION) 3개뿐**이다. 나머지 17개 규칙은 `options`에 이 필드를 전달하지 않으며, 조용히 방향 gate가 걸린 항목은 없다. ✓
- NOT_ASSESSED / UNCLEAR: ELIG:195-210에서 DEFER_NOT_READY로 떨어지고, 이유 문구도 "아직 확인되지 않았습니다"(미확인)와 "맞지 않습니다"(불일치)를 정확히 분기한다(ELIG:203-205). ✓ T1:76-96이 이를 검증한다.
- NO_CLEAR_DIRECTION 역시 불일치로 DEFER. ✓

**단, capability 계층에 두 번째(암묵) 방향 gate가 존재한다.** `EXTENSION_EXPOSURE_TOLERATED`(DIR_03, ELIG:114), `FLEXION_EXPOSURE_TOLERATED`(DIR_04 ELIG:117, **EXPOSURE_01 ELIG:138**)가 그것이다. DIR_03/04는 이중 gate라 무해하지만, **EXPOSURE_01(숙이기 단계적 노출)에 방향 반응을 파생시키면 임상적으로 정반대가 된다** — graded exposure는 굴곡 반응이 "유리해서" 하는 것이 아니라 회피 때문에 하는 것이다(META:245, `GRADED_EXPOSURE_RETURN` 정의). adapter가 `FLEXION_EXPOSURE_TOLERATED`를 `directionalResponse`에서 파생하면 이 운동 계열이 잘못된 이유로 사라진다. → **RF-9.**

---

## 4. 20행 hard/regressible 분류 vs META의 startingCriteria/stopReview

**Verdict: PASS WITH REQUIRED FIXES — 20행 중 8행에서 META가 규칙보다 강하다.**

전 행 대조 결과. ✓ = 일관, ⚠ = META가 더 강함(규칙이 덜 막음), △ = 규칙이 더 강함(보수적, 수용).

| # | 운동 | 규칙(ELIG) | 판정 | 근거 |
|---|---|---|---|---|
| 1 | ACT_01 | hard SAFE_WALKING+CAN_SELF_PACE (:105) | ✓ | META:75 두 조건과 1:1 대응 |
| 2 | ACT_02 | hard CAN_SELF_PACE / **regr SAFE_WALKING** (:106) | ⚠ **RF-4** | ACT_01은 hard인데 여기선 regressible. META:89 저장 회귀("구간 짧게, 휴식 늘림")는 *보행 자체가 불안전한* 상태를 해결하지 못한다. 실측: `SAFE_WALKING:'NO'` → START_WITH_REGRESSION |
| 3 | LUMBAR_02 | regr QUADRUPED (:108) | ⚠ **RF-6** | META:95 "네발기기 자세를 유지할 수 있음"은 자세 전제조건. META:99 회귀("범위 축소/골반만")는 전부 네발기기 안에 머문다 |
| 4 | LUMBAR_03 | regr SUPINE (:109) | ✓ | META:109 회귀가 "무릎 아래/사이 지지물" — supine 내성 자체를 실제로 개선 |
| 5 | DIR_02 | regr PRONE + EXT_FAVORABLE (:111) | ✓/△ | 회귀 `prone lying`(META:119)은 신전 부하를 실제로 낮춤. META:115는 "원위부 증가 없음"인데 규칙은 FAVORABLE을 요구 → 보수적, 수용 |
| 6 | DIR_03 | hard EXT_EXPOSURE + EXT_FAVORABLE (:114) | ✓ | META:125의 "기저 신경학적 안정" → `requiresStableNeuro` 기본 true로 커버 |
| 7 | DIR_04 | hard FLEX_EXPOSURE + FLEX_FAVORABLE (:117) | △ | META:135는 "유리하거나 **최소한 악화시키지 않는**"인데 규칙은 FAVORABLE만. 보수적 → 수용, 단 no-action 관찰 참조 |
| 8 | HIP_MOB_01 | regr STANDING+BALANCE (:121) | ✓ | META:149 회귀 "벽/의자 지지, 보폭 축소"가 결손을 직접 상쇄 |
| 9 | DEEP_TRUNK_01 | regr SUPINE (:123) | ⚠ **RF-10** | META:155 시작조건의 핵심은 supine이 아니라 **"편안하게 호흡하면서"**이고 META:158 중단기준이 **"숨을 참아야만 유지 가능"**인데, 규칙은 `NATURAL_BREATHING_TOLERATED`를 전혀 참조하지 않는다(이 capability는 REG_01에만 쓰임) |
| 10 | DEEP_TRUNK_03 | hard LOW_LOAD_TRUNK / regr SUPINE (:124) | ⚠ **RF-6** | META:165 "바로 누운 자세에서…"— heel slide는 supine이 구조적 전제 |
| 11 | TRUNK_03 | hard LOW_LOAD_TRUNK / regr QUADRUPED (:125) | ⚠ **RF-6** | META:175 "네발기기에서 균형을 유지할 수 있음". 회귀(META:179 "팔만/다리만")도 전부 네발기기 유지 |
| 12 | TRUNK_END_01 | regr SUPINE (:126) | ⚠ **RF-6** | META:185 "바로 누워 무릎을 세운 자세가 가능". bridge는 supine 없이 성립 불가. 실측: `SUPINE:'NO'` → START_WITH_REGRESSION |
| 13 | HIP_STR_03 | regr STANDING+BALANCE (:128) | ⚠(경) | META:198 중단기준 첫 줄이 **"균형 상실 위험"**. 회귀 "양손 지지"(META:199)가 상당 부분 상쇄하므로 RF는 아니나, 고령 인구에서 UNKNOWN 기본값과 겹치면 부담 |
| 14 | FUNC_01 | regr STANDING+BALANCE (:129) | ⚠ **RF-5 (강함)** | META:205 두 번째 시작조건 **"낙상 위험이나 심한 기립성 증상이 별도 평가 없이 남아 있지 않음"**은 회귀로 완화되는 종류가 아니라 hard gate다. META:208 중단기준도 "현저한 어지럼 또는 균형 상실". 규칙은 이를 **전혀 표현하지 않는다.** 실측: 기립·균형 둘 다 `'NO'`여도 START_WITH_REGRESSION |
| 15 | FUNC_05 | **hard HIP_HINGE_CONTROL** / regr STANDING (:130) | △ **RF-7 (순환)** | META:215 시작조건은 "서서 균형 유지" + "고관절 뒤로 보내는 작은 범위에서 관리 가능"뿐. **FUNC_05가 곧 hip hinge 기술 연습**(META:216 "기술 연습부터 시작")인데 hip hinge control을 hard로 요구하면 그 기술을 배우려는 환자에게 영원히 도달 불가 |
| 16 | LOAD_02 | hard HINGE+LOAD_READY (:131) | ⚠(경) **RF-7b** | META:225와 정확히 대응하나 regressible이 비어 META:229 회귀("부하 제거, 시작 위치 높이기")에 도달할 경로가 없다. T2:132는 REGRESS를 기대 — 규칙이 절대 못 내는 값 |
| 17 | NEURAL_01 | hard NEURAL_SLIDER + 명시 플래그 (:133-136) | ✓ | META:235 "기저 신경학적 상태가 안정적" ↔ `requiresStableNeuro`, META:238 원위부 확산 ↔ `stopOnDistalWorsening`. 20행 중 가장 정확 |
| 18 | EXPOSURE_01 | hard FLEX_EXPOSURE, stopDistal 명시 (:138-140) | ✓ | META:245 "현재 safety gate가 routine exposure를 허용" ↔ `routineCareAllowed` |
| 19 | EXPOSURE_03 | regr SITTING (:141) | ✓ | META:259 회귀("노출시간 축소, 자세변경 허용")가 결손을 직접 상쇄 |
| 20 | REG_01 | hard NATURAL_BREATHING, 두 플래그 off (:143-146) | ✓ | §1 참조 |

**공통 원인:** *자세 내성(QUADRUPED/SUPINE/PRONE)*과 *안전 전제(균형·낙상)*가 "저장된 회귀로 완화 가능한 것"과 구분 없이 regressible에 들어갔다. 회귀 문구가 자세를 바꾸지 못하는 경우 START_WITH_REGRESSION은 **환자가 물리적으로 취할 수 없는 자세의 운동을 "시작 가능"으로 표시**한다.

또한 META 20행 중 13행의 `stopReviewKo`에 "새로운 또는 진행하는 신경증상"이 들어 있고, 이는 `requiresStableNeuro` 기본 true로 정확히 커버된다(REG_01 제외) ✓. 반면 **궤적형 중단기준**(ACT_02 META:88 "보행 허용량이 세션마다 뚜렷하게 감소", EXPOSURE_03 META:258 "휴식 후에도 기저 수준으로 회복되지 않음")은 규칙이 표현할 수 없다 — Batch 3 재평가 3-tuple의 소비자이며, v1 결함이 아니라 **명시적 미커버 영역**으로 기록해 둘 것.

---

## 5. Starting dose / progression 안전성 (고령·저체력 1차 진료 인구)

**Verdict: PASS — 임상적으로 위험한 기본 용량은 없다.**

20행 전부 검토. 용량은 일관되게 보수적이고, 다수가 절대값이 아니라 **상대값**으로 쓰여 있다("현재 허용량에 따라 더 짧게"(META:76), "현재 편안히 가능한 시간보다 짧은 구간으로"(META:256)) — 고령 인구에 이상적인 형태다. 특히 잘 쓰인 항목:

- DEEP_TRUNK_01(META:157-158): 자연호흡 유지 + "허리통증을 억지로 참기 위한 최대수축이 아님" 명시.
- NEURAL_01(META:240): **"sustained tensioner로 자동 전환하지 않음"** — 신경가동에서 가장 흔한 악화 경로를 선제 차단. 20행 중 가장 안전하게 쓰인 progression.
- REG_01(META:267-269): "통증이 반드시 감소해야 성공으로 보지 않음", "깊이·속도를 강제하지 않음".
- LOAD_02(META:226, 230): 기술 연습 → 가동범위 → 반복수 → 부하, 한 번에 한 요소.

**용량 자체가 unsafe한 행은 없음.** 다만 이 인구에서 실제 사고로 이어질 수 있는 **구조적 공백 2건**:

1. **바닥/침상 이동(floor transfer)이 어느 행에도 전제조건으로 없다.** 네발기기 4행·supine 4행은 모두 "그 자세를 유지할 수 있는가"만 묻고 **"그 자세로 내려가고 다시 일어날 수 있는가"**를 묻지 않는다. 슬관절 골관절염 유병률이 높은 한국 고령 1차 진료 인구에서 이 이동이 실제 낙상·통증 발생 지점이다. 비용이 낮은 해법: 새 capability 추가가 아니라 `QUADRUPED_TOLERATED`/`SUPINE_TOLERATED` **chip 라벨과 META 시작조건 문구에 "바닥/침상에 눕고(엎드리고) 다시 일어나기 포함"을 명시**. → RF-6에 동봉.
2. **중단기준이 환자에게 전달되지 않는다.** 아키텍처 §2.2는 채택 시 Care Plan에 "운동명+시작용량"만 append한다. META 20행 전부가 `stopReviewKo`를 갖고 있는데, **집에서 혼자 수행하는 시점에 그 안전망이 사라진다.** 이건 데이터 결함이 아니라 Batch 2 배선 결함이다. → **RF-8.**

부수 관찰: 협착증형(META 기준 아님, 태블릿 `claudication_walking === 'YES'`) 고령 환자에게 DIR_02/DIR_03(반복 신전)은 신경인성 파행을 악화시킬 수 있다. 현재는 `EXTENSION_FAVORABLE` 관찰 gate가 실질적으로 이를 막으므로 **추가 규칙은 불필요**하며, 진단명→운동 매핑 금지 원칙상 gate로 만들어서도 안 된다. 필요하면 카드의 "이유" 한 줄에 주의 문구로만.

---

## 6. v1 production adapter 매핑의 CLOSED 의미 충실성

**Verdict: PARTIAL — 4개 항목 중 2개는 충실, 2개는 그대로 구현하면 안전 결함.**

**(a) `neuroStatus`: 대체로 충실, 단 어휘 주의.**
`lbp_objective_motor_deficit === 'NONE'`(`src/doctor/JudgmentPanel.tsx:85` 라벨 "없음")은 원장이 실제로 진찰하고 음성으로 기록한 값이다. `undefined`는 "아직 진찰 안 함"(`src/doctor/judgment.ts:47-53`, yaml `default: not_yet_assessed`)이므로 UNKNOWN 처리가 정확하다. `SEVERE_OR_PROGRESSIVE` → NEW_OR_WORSENING도 정확하다.
**주의:** 이 필드는 *운동* 결손만 본다. META의 중단기준은 반복적으로 "새로운 저림·**감각저하**·근력저하"(META:118, :238)를 말한다. 아키텍처 §6-3이 별도 신경 기본검사 항목을 만들지 않기로 한 결과, `STABLE`은 "운동 결손 없음 + 새 신경증상 미보고"의 축약이다. **v1에서 수용 가능하다고 판단한다** — 단 UI/EMR 어디에도 "신경학적 정상/안정"으로 표기하지 말고 "객관적 근력저하 없음(확인함)"으로만 쓸 것. 이건 PO 결정 사항이 아니라 문구 제약이다.

**(b) `routineCareAllowed = FROZEN lbp_safety_status === 'CLEAR'`: 출처가 모호하고, 잘못 고르면 안전 결함이다. → RF-2 (BLOCKER).**
저장소에 `lbp_safety_status`는 **두 개** 존재한다.
- `payload.responses.safety_flags.lbp` — 제출 시점 스냅샷. `src/spec/coreSpec.ts:4766`이 `clinicianObjectiveMotorDeficit`을 **`undefined`로 고정**해 계산한다(같은 파일 주석: "Doctor View recomputes this fresh once a clinician enters that field").
- `DoctorView.tsx:900-901`의 재계산값 — `toLbpStateFromDoctorPayload(responses, lbpObjectiveMotorDeficit, age)` → `computeLbpFlags(...)`. `LbpSafetyPanel`이 화면에 보여주는 값.

**스냅샷을 쓰면 원장이 "심하거나 빠르게 진행함"을 기록해도 `routineCareAllowed`가 true로 남는다.** 안전 패널은 URGENT_REVIEW를 띄우는데 운동 추천은 계속 살아 있는 상태가 된다. `lbpLogic.ts:217`의 escalation 전체가 무력화된다. Batch 1의 `lbpExamSuggestions.ts:128`이 이미 스냅샷을 읽고 있으므로(확인 항목 제안이라 위험도는 낮음) 같은 실수가 복사될 가능성이 매우 높다.

**(c) `treatment_safety_status`가 매핑에서 빠져 있다. → RF-3 (BLOCKER).**
`src/spec/lbpLogic.ts:277-279` 주석은 명시적이다: *"contraindication-sensitive treatment/**exercise** must not be finalized without clinician approval when treatment_safety_status !== CLEAR … only gates recommendation finalization."* 운동 추천을 Care Plan으로 채택하는 것이 바로 recommendation finalization이다. 제안된 매핑은 disease safety만 본다 — 임신 관련 치료 안전 잠금이 통째로 누락된다. FROZEN spec이 이미 요구하고 있는 사항이므로 새 임상 의미 신설이 아니다.

**(d) `directionalResponse`: 타입이 서로 다르고, 값 하나가 표현 불가. → RF-9.**
Batch 1의 `LbpDirectionalResponse`(`src/doctor/workspace/lbpExamSuggestions.ts:188-194`)는 6값이고 `DISTAL_WORSENING`을 포함한다. ELIG:45-50의 동명 타입은 5값이며 **`DISTAL_WORSENING`이 없다.** Batch 2에서 ELIG를 같은 디렉터리로 복사하면 **동일 이름 export 2개가 공존**한다(컴파일 에러는 아니지만 import 혼동이 사실상 보장된다). 또한 `DISTAL_WORSENING`은 `distalSymptomResponse:'WORSENING'`으로만 번역되고 `directionalResponse` 쪽에는 대응값이 없으므로 adapter가 명시적으로 정해야 한다.
부수 확인: 단일 chip이라 두 필드가 서로 모순될 수 없다 ✓. `DISTAL_WORSENING` 시 DIR_02/03/04는 distal 검사(:185)가 방향 검사(:195)보다 먼저라 DEFER가 아니라 **STOP_REVIEW**로 간다 — 더 강한 쪽이므로 정상.

**(e) capabilities: UNKNOWN 기본 + TF 일치 후보에만 chip 노출 → 아키텍처 §2.3에 충실 ✓.** 단 RF-1이 선행되지 않으면 이 설계의 보호 효과가 8개 항목에서 무효화된다.

**PO 결정 필요:** CD-1, CD-2 참조.

---

## 7. 구체적 결함

| # | 결함 | 위치 |
|---|---|---|
| D1 | neuro-UNKNOWN gate 우회(regression 선행). 8/20이 blank context에서 START_WITH_REGRESSION | ELIG:226-234 vs :236-244 |
| D2 | T1의 유일한 neuro-UNKNOWN 테스트가 regressible이 빈 항목을 골라 D1을 구조적으로 회피 | T1:54-58 |
| D3 | **T2 vignette가 엔진과 전혀 연결되어 있지 않다.** 두 기대값은 규칙 표가 원리적으로 낼 수 없는 값이다 — ACT_01=REGRESS(T2:72, :92)인데 `regressibleRequirements: []`(ELIG:105), LOAD_02=REGRESS(T2:132)인데 `[]`(ELIG:131). T2는 META 필드의 존재 여부만 assert하므로 통과한다 | T2:33-188, :207-226 |
| D4 | FUNC_05가 자기 자신이 가르치는 기술(`HIP_HINGE_CONTROL`)을 hard로 요구 — 순환. META:215는 요구하지 않음 | ELIG:130 |
| D5 | ACT_02가 `SAFE_WALKING`을 regressible로 둠(ACT_01은 hard). 저장 회귀가 이 결손을 상쇄하지 못함 | ELIG:106 |
| D6 | `distalSymptomResponse: 'UNKNOWN'`이 `STABLE_OR_IMPROVING`과 구분 없이 통과 | ELIG:185 |
| D7 | 타입명 충돌 `LbpDirectionalResponse`(멤버 집합 불일치, `DISTAL_WORSENING` 표현 불가) | ELIG:45 vs `src/doctor/workspace/lbpExamSuggestions.ts:188` |
| D8 | Core-20 외 id 전달 시 `throw`(런타임 크래시) | ELIG:163 |
| D9 | 규칙 id 집합 == Core-20 metadata id 집합 assertion 없음. 한 행만 누락돼도 D8 경로로 크래시 | T1:41-45 |

**크래시·잘못된 ID 참조는 없다.** `rule()`(ELIG:87)과 `row()`(META:56)의 모듈 로드시 검증은 fail-fast로 잘 설계되어 있고, 실제로 카탈로그 57/도메인 13/Core-20/규칙 20 모두 일치함을 실행 확인했다. LIB의 57개 라벨과 `LBP_TRUNK_03 = Bird-dog` 원문 보존도 정확하다.

---

## Required fixes

**BLOCKER — Batch 2 adapter 작성 전에 해결**

1. **RF-1 · ELIG:236-244 → :225와 :226 사이로 이동**하고 반환 payload에 `regressionRequirements: regressionNeeds`를 포함시킨다. 즉 `const regressionNeeds = ...` 계산 직후, `if (regressionNeeds.length > 0)` **앞**에 neuro-UNKNOWN 검사를 둔다. hard 검사(:212)보다 뒤에 두는 이유는 `missingHardRequirements`(capability chip 렌더 데이터)를 잃지 않기 위함이다. 이동 후 blank context 결과는 20/20 DEFER_NOT_READY여야 한다.
2. **RF-2 · Batch 2 `lbpEligibilityContext.ts`** — `routineCareAllowed`를 `payload.responses.safety_flags.lbp`가 **아니라** `DoctorView.tsx:900-901`과 동일한 재계산 경로(`computeLbpFlags(toLbpStateFromDoctorPayload(responses, lbpObjectiveMotorDeficit, age))`)에서 얻는다. adapter 상단에 이 이유를 주석으로 고정할 것(`coreSpec.ts:4757-4765` 주석 참조). 관련 회귀 테스트 1개: `lbp_objective_motor_deficit='SEVERE_OR_PROGRESSIVE'` → 20/20 STOP_REVIEW.
3. **RF-3 · 동일 adapter** — `treatmentSafetyLocked(flags)`(`src/spec/lbpLogic.ts:279`)가 true이면 운동 추천을 Care Plan으로 **채택할 수 없게** 한다(권장 기본값: 카드는 렌더하되 채택 버튼 비활성 + "치료 안전 확인 필요" 배너). CD-2 참조.
   **RF-3b ·** `neuroStatus === 'NEW_OR_WORSENING'`이면 eligibility 결과와 무관하게 **운동 블록 전체를 접고 safety refresh 배너로 대체**한다(REG_01의 의도된 예외가 초록 카드로 오독되지 않도록). 아키텍처 G12와 같은 배선이므로 Batch 3까지 미루지 말 것.

**HIGH**

4. **RF-4 · ELIG:106** → `rule('LBP_ACT_02', ['CAN_SELF_PACE', 'SAFE_WALKING'], [])`. ACT_01과 동일 기준.
5. **RF-5 · ELIG:129** → FUNC_01에 낙상·기립성 안전 전제를 hard로 표현한다. 최소 변경: `rule('LBP_FUNC_01', ['BALANCE_WITH_SUPPORT'], ['SUPPORTED_STANDING_TOLERATED'])`. (새 capability를 만들지 않고 기존 `BALANCE_WITH_SUPPORT`를 META:205의 "낙상 위험이 별도 평가 없이 남아 있지 않음"의 대리로 승격 — chip 라벨에 이 의미를 명시.)
6. **RF-6 · 자세 내성 4행을 hard로 승격** — ELIG:108 LUMBAR_02 → `hard ['QUADRUPED_TOLERATED']`, ELIG:125 TRUNK_03 → `hard ['LOW_LOAD_TRUNK_CONTROL','QUADRUPED_TOLERATED']`, ELIG:124 DEEP_TRUNK_03 → `hard ['LOW_LOAD_TRUNK_CONTROL','SUPINE_TOLERATED']`, ELIG:126 TRUNK_END_01 → `hard ['SUPINE_TOLERATED']`. (LUMBAR_03(:109)·DEEP_TRUNK_01(:123)은 회귀가 실제로 상쇄하므로 **그대로 둔다**.) 함께: `QUADRUPED_TOLERATED`/`SUPINE_TOLERATED`/`PRONE_TOLERATED` chip 라벨에 "그 자세로 내려가고 다시 일어나기 포함"을 명시(§5-1).
7. **RF-7 · ELIG:130** → `rule('LBP_FUNC_05', ['SUPPORTED_STANDING_TOLERATED'], ['HIP_HINGE_CONTROL'])`. META:219 회귀("벽에 엉덩이 터치, 막대기 cue, 작은 가동범위")가 정확히 hinge control 부족에 대응하는 저장 회귀다.
   **RF-7b · ELIG:131** → `rule('LBP_LOAD_02', ['HIP_HINGE_CONTROL'], ['LOAD_READY'])`. META:229 회귀("부하 제거, 시작 위치 높이기")가 LOAD_READY 부족의 정확한 해법이고, T2:132의 임상 기대와도 일치한다. (안전 잠금은 `routineCareAllowed`가 이미 담당.)
8. **RF-8 · Batch 2 채택 배선** — 아키텍처 §2.2의 "운동명+시작용량 append"를 **"운동명 + `startingDoseKo` + `stopReviewKo` 전체"** append로 바꾼다. `progressionKo`는 절대 넣지 않는다(진행은 방문 시 원장 결정). `emrPreview`/`homeActionPlan` 양쪽 동일.

**MEDIUM / LOW**

9. **RF-9 · adapter 계약 3줄 고정** — (i) `FLEXION_EXPOSURE_TOLERATED`/`EXTENSION_EXPOSURE_TOLERATED`를 `directionalResponse`에서 **파생하지 않는다**(원장 chip 확인만); (ii) Batch-1 `DISTAL_WORSENING` → `{ directionalResponse: 'UNCLEAR', distalSymptomResponse: 'WORSENING' }`로 명시 번역; (iii) 복사 시 ELIG:45의 타입을 `LbpEligibilityDirectionalResponse`로 개명해 `lbpExamSuggestions.ts:188`과의 충돌 제거.
10. **RF-10 · ELIG:123** → `rule('LBP_DEEP_TRUNK_01', ['NATURAL_BREATHING_TOLERATED'], ['SUPINE_TOLERATED'])`. META:155/:158이 요구하는 조건.
11. **RF-11 · 테스트** — (a) T1에 "regressible 결손 + neuroStatus UNKNOWN → DEFER_NOT_READY" 케이스 추가(RF-1 회귀 방지, 예: `LBP_FUNC_01`); (b) T1에 규칙 id 집합 === `LBP_CORE_EXERCISE_METADATA` id 집합 assertion 추가(D9); (c) **T2를 `evaluateLbpExerciseEligibility`에 실제로 연결**하거나, 연결하지 않을 경우 파일 상단에 "이 파일의 disposition은 엔진 출력이 아니라 임상 기대치이며 규칙 표와 자동 대조되지 않는다"를 명시(D3). RF-7b 반영 시 T2:132는 자동 정합, T2:72/:92(ACT_01 REGRESS)는 **vignette 쪽을 DEFER로 수정**한다(ACT_01의 hard 두 개는 안전 조건이므로 규칙을 풀지 않는다).
12. **RF-12 · ELIG:185 주석 + adapter** — `distalSymptomResponse`의 UNKNOWN은 "초진에는 운동 반응이 아직 존재하지 않음"을 뜻한다고 파일에 기록하고, adapter가 `NOT_ASSESSED`를 절대 `STABLE_OR_IMPROVING`으로 번역하지 않도록(UNKNOWN 유지) 고정한다. Batch 3에서 재진 반응이 미기록이면 UNKNOWN으로 남긴다.
13. **RF-13 · 추천 모듈** — `evaluateLbpExerciseEligibility` 호출 전 `getLbpExerciseEligibilityRule(id)`로 가드해 카탈로그 57 순회 시 throw를 방지(D8).

---

## CLINICAL DECISION REQUIRED

**CD-1 — UNKNOWN capability를 START_WITH_REGRESSION으로 볼 것인가, DEFER로 볼 것인가.**
`capabilityValue`(ELIG:212, :223)는 `'NO'`(확인했고 못 함)와 `'UNKNOWN'`(확인 안 함)을 구분하지 않는다. 아키텍처 §2.3은 "UNKNOWN capability를 DEFER/REGRESSION으로 돌려준다"며 REGRESSION을 허용하지만, CLOSED 문서(`LBP_REHAB_STRATEGY_DECISION_v0.1.md`)는 "not assessed / unknown / not performed / limited must never be interpreted as normal"과 "hidden conversion of unknown/unassessed into normal/eligible" 금지를 명시한다. **두 문서가 실제로 충돌하며, CLAUDE.md상 CLOSED 임상 의미는 구현 중 재해석 대상이 아니다.**
- 영향: RF-1 적용 후에도, 원장이 근력저하 카드를 채워 `neuroStatus=STABLE`이 되면 capability가 전부 UNKNOWN인 상태에서 8개 운동이 다시 START_WITH_REGRESSION으로 올라온다.
- **권고 기본값:** `'NO'` → START_WITH_REGRESSION(알려진 제한에 대해 저장된 회귀를 씀 — 원래 의도), `'UNKNOWN'` → DEFER_NOT_READY + `missingHardRequirements`/`regressionRequirements`에 해당 capability를 담아 **"확인하면 시작 가능" chip으로 렌더**. 임상 흐름은 끊기지 않는다: 후보 카드는 그대로 보이고, 원장이 chip 1~2개를 탭하면 즉시 START로 승격된다. 클릭 1~2회 증가와 "미확인을 시작 가능으로 표시하지 않음" 사이의 교환이며, **후자가 CLOSED 원칙에 부합한다.**
- PO가 결정할 것: 이 추가 탭을 수용할지, 아니면 §2.3을 근거로 현행 REGRESSION 동작을 유지할지. 후자를 택하면 CLOSED 문서에 명시적 예외 항목을 append해야 하며(조용한 재해석 금지), 운동 카드에 "이 조건은 아직 확인되지 않았습니다" 문구를 필수로 표시해야 한다.

**CD-2 — `treatment_safety_status !== 'CLEAR'`(주로 임신) 환자에게 운동 블록을 어떻게 보일 것인가.**
FROZEN spec(`lbpLogic.ts:277-279`)은 "채택(finalization)을 막아야 한다"까지만 규정하고 화면 처리는 규정하지 않는다.
- **권고 기본값:** 블록을 **숨기지 않고** 렌더하되 채택 버튼을 비활성화하고 "치료 안전 확인 후 채택 가능" 배너를 띄운다(원장이 무엇이 후보인지는 볼 수 있어야 하고, 숨기면 안전 이유가 보이지 않는다). 대안은 disease safety와 동일하게 `routineCareAllowed=false`로 접어 STOP_REVIEW 처리하는 것이며, 이는 더 단순하지만 임신 환자에게 운동 자체가 금기라는 잘못된 신호를 준다.

---

## No-action observations

- **DIR_02/DIR_04가 META보다 엄격하다**(META:115/:135는 "악화시키지 않음"까지 허용, 규칙은 FAVORABLE 요구). 보수적 방향이므로 수정하지 않는다. 부작용: `NO_CLEAR_DIRECTION` 환자에게 방향성 계열 3개가 전부 사라진다 — v1에서는 의도된 절제로 수용하되, 파일럿에서 "단순 요통인데 줄 게 없다"가 반복되면 별도 Product Decision으로 재검토.
- **LBP_REG_01의 `stopOnDistalWorsening: false`는 옳다.** T1:111-117의 assertion도 유지한다(단 RF-3b가 표현 계층을 막는다는 주석을 붙일 것).
- **`rule()`/`row()`의 모듈 로드시 throw(ELIG:87, META:56)는 좋은 fail-fast**이며 현재 20/20·57/57 모두 충족됨을 실행 확인했다. 유지.
- **`LBP_NEURAL_01`이 20행 중 임상적으로 가장 정확하게 인코딩된 행**이다(META:240의 tensioner 자동 전환 금지 포함). 다른 행 수정 시 기준으로 삼을 것.
- **`LBP_EXPOSURE_03`의 상대 용량**("현재 편안히 가능한 시간보다 짧은 구간", META:256)은 고령·저체력 인구에 가장 안전한 처방 형태다. 향후 신규 metadata 작성 시 이 패턴을 기본으로.
- **Batch 1 `lbpExamSuggestions.ts:128`도 RF-2와 동일한 스냅샷을 읽는다.** 확인 항목 제안은 치료 blocker가 아니므로 v1 결함으로 올리지 않으나, RF-2 수정 시 같은 헬퍼를 재사용해 함께 정리하면 비용이 거의 없다.
- **궤적형 중단기준**(ACT_02 META:88, EXPOSURE_03 META:258, FUNC_01 META:208의 "일어설수록 증가")은 v1 규칙 계층에서 표현 불가하며 Batch 3 재평가 3-tuple의 소비 대상이다. 미커버 영역으로 명시 기록 권고.
- **협착증형 고령 환자의 반복 신전**은 `EXTENSION_FAVORABLE` 관찰 gate가 실질적으로 차단한다. 진단명→운동 매핑 금지 원칙상 추가 규칙을 만들지 않는다.