# ELBOW_V1 Tablet Question Set v0.1 — Opus 재검수

**검수 완료일**: 2026-08-25
**검수자**: Opus
**대상 문서**: `ELBOW_V1_Tablet_Question_Set_v0.1.md`
**판정**: **CLINICAL DECISION REQUIRED**

이번 검수는 사용자가 지정한 10개 확인 항목만을 대상으로, Tablet 문서의 실제 텍스트(§3–§11)를 원문 대조해 진행했다. Opus v0.1의 E1–E10 clinical tier 자체는 재해석하지 않았다 — 발견된 문제는 전부 Tablet 문서 내부의 섹션 간 정합성 문제이지, 새로운 임상 판단이 아니다.

---

# 검증 결과

## 1. ELBOW_08 infection OR 조건이 AND gate로 변질되지 않았는가 — **확인됨, PASS**

`ELBOW_08`은 `single_choice`(§4, L259)이며 `SYSTEMIC_OR_RAPIDLY_SPREADING` 옵션 문구(L265)는 "열·오한이나 몸 상태가 매우 안 좋음이 함께 있거나, 발적·부기가 몇 시간~하루 사이 눈에 띄게 커지고 있음"으로, 한국어 "-이나/-거나" 구조가 정확히 OR다. `LOCALIZED_STABLE` 옵션(L264)은 반대로 "전신 증상은 없으며 빠르게 커지지도 않음"(두 조건 모두 부재)일 때만 선택하도록 정의되어 있어, 2×2(전신증상 유/무 × 빠른확산 유/무) 공간 중 3개 셀이 urgent, 1개 셀만 stable로 정확히 분리된다. 이는 AND gate가 아니라 의도된 OR 결합이며, 설계 노트(L275)도 이를 명시한다. **수정 불필요.**

## 2. ELBOW_02A 자연정복 탈구 YES → URGENT_REVIEW 적절성 — **확인됨, PASS**

`show_when`이 `IS_PRIMARY_ELBOW_SAFETY`로 ELBOW_01(외상 인지 여부)과 무관하게 무조건 노출되고(L158), Safety Engine URGENT_REVIEW 목록 3번(L471)에 `ELBOW_02A == YES`가 명시되어 있다. v0.1 검수 E2가 요구한 "현재 변형/맥박 정상이어도 자연정복 양성은 동일하게 URGENT"(L169)도 그대로 반영됐다. **수정 불필요.**

## 3. ELBOW_09/09A: sensory-only stable은 escalation 없이 CONSIDER만, progressive는 REVIEW+neuro+expedited — **부분 확인, 결정 필요**

Safety status 계산(§10) 자체는 정확하다. `ELBOW_09 = YES + ELBOW_09A = [NONE]`은 REVIEW_REQUIRED 목록에서 명시적으로 제외되어 있고(L489, "ELBOW_09A == `[NONE]`은 **제외**"), progressive(concrete positive) 또는 불확실(UNKNOWN/invalid/missing)은 모두 REVIEW_REQUIRED로 fail-closed 처리된다(L488-489). `neuro_assessment_required` flag도 concrete positive와 UNKNOWN/invalid/missing 두 경로 모두를 정확히 포함한다(L522-523).

**그러나 `expedited_referral_consider` flag 정의(§11, L513-517)가 §5 자신의 결정(L309)과 어긋난다.** §5 Semantics는 "`ELBOW_09 = YES` + `ELBOW_09A` UNKNOWN/missing/malformed → REVIEW_REQUIRED + `neuro_assessment_required=true` + **`expedited_referral_consider=true`**(진행 여부가 불확실하면 배제 불가로 fail-closed)"라고 명시적으로 약속했다(L309). 그런데 §11의 실제 flag 목록(L517)은 "ELBOW_09 == YES + ELBOW_09A concrete positive"만 `expedited_referral_consider` 트리거로 나열하고, 같은 줄 바로 위 KNEE류 missing-예외 각주(L519, "missing... expedited flag를 임의로 true로 만들지 않는다")가 ELBOW_04/05/06에는 맞지만 **ELBOW_09A의 UNKNOWN/invalid/missing 분기에는 적용되면 안 되는데, §11 목록에서 이 분기가 통째로 빠져 있어** 결과적으로 §5가 약속한 flag가 §11에서 누락된 것과 같은 효과가 난다.

실제 피해 범위는 제한적이다 — `REVIEW_REQUIRED`와 `neuro_assessment_required`는 이 경로에서 여전히 정확히 발동하므로 환자가 안전망 밖으로 완전히 빠지지는 않는다. 하지만 "얼마나 빨리 봐야 하는가"를 원장에게 알려주는 `expedited_referral_consider` 신호가 정확히 이 애매한 진행 여부 케이스에서 조용히 빠지는 것은, KNEE_V1 재검수(v0.2) 당시 §11/§12가 서로 다른 조건을 말했던 것과 같은 종류의 섹션 간 불일치이며, 그때와 동일한 기준으로 판단하면 이번에도 **차단 사유**로 취급해야 한다.

**결정 필요(최소 수정):** §11의 `expedited_referral_consider=true` 목록에 "ELBOW_09 == YES + ELBOW_09A UNKNOWN/invalid/missing" 조건을 추가해 §5의 원래 결정과 일치시킨다. `neuro_assessment_required`가 이미 올바르게 이 분기를 포함하고 있으므로, 그와 동일한 조건을 `expedited_referral_consider`에도 그대로 복사하면 된다 — 새로운 임상 판단이 아니라 문서 자체의 자기모순을 해소하는 것이다.

## 4. ELBOW_06 mechanical lock → REVIEW + expedited 적절성 — **확인됨, PASS**

L233("YES/UNKNOWN → REVIEW_REQUIRED + `expedited_referral_consider=true`(KNEE K4 정례와 대칭 확정)"), Safety Engine REVIEW_REQUIRED 목록(L485), Flags 목록(L516) 세 곳 모두 일관되게 REVIEW+expedited이며 URGENT_REVIEW 목록(L469-474)에는 ELBOW_06이 없다. KNEE K4와 정확히 대칭이다. **수정 불필요.**

## 5. ELBOW_11 cardiac screen에 movement/rest AND 조건이 없는가 — **확인됨, PASS**

옵션 4개(L348-351: 가슴 통증/답답함, 숨참, 식은땀, 메스꺼움) 어디에도 움직임·자세·안정시 여부를 묻는 수식어가 없다. Semantics(L356)는 "any concrete positive → URGENT_REVIEW"로 단일조건이며, "금지" 섹션(L361-362)이 이를 명시적으로 재확인한다. **수정 불필요.**

## 6. 심장 연관통이 별도 MUST_EXCLUDE domain으로 분리됐는가 — **확인됨, PASS**

§9 Hypothesis Contract의 MUST_EXCLUDE 목록(L432-441)에 `MUST_EXCLUDE_CARDIAC_REFERRED_PAIN`이 독립 항목으로 존재하고, 근골격계 연관통 `REFERRED_OR_PROXIMAL_SOURCE`는 Supportive/differential 목록(L451)에 별도로 남아 있다 — 두 도메인이 섞이지 않았다. **수정 불필요.**

## 7. ELBOW/FOREARM/DIFFUSE/UNKNOWN 노출, WRIST_HAND만 제외 — **확인됨, PASS**

`IS_PRIMARY_ELBOW_SAFETY`(L78-81) 정의가 `ELBOW_00 in [ELBOW, FOREARM, DIFFUSE_OR_MULTIPLE, UNKNOWN]`로 정확히 일치하고, `WRIST_HAND`만 제외된다. `ELBOW_00`이 safety 계산 자체의 입력으로 쓰이지 않는다는 F1류 invariant도 명시(L85)되어 있고, 실제로 §10 Safety Engine의 URGENT/REVIEW 조건 어디에도 `ELBOW_00`의 특정 값이 직접 등장하지 않는다(노출 게이트로만 작동, 안전 tier 계산 입력이 아님을 코드 레벨 서술과 일치하게 유지). **수정 불필요.**

## 8. UNKNOWN/missing/malformed fail-open 경로 — **부분 확인, 문서 정밀도 수정 필요(비-차단성이나 명시 요구)**

§3(개별 문항 semantics)와 §10(Safety Engine 요약) 두 곳을 항목별로 대조했다. `ELBOW_01/03/04/05/06/07/08/09/10/11` 전부 §10 요약 bullet에 "UNKNOWN/invalid/missing"이 완전히 명시되어 있고 §3의 개별 semantics와 일치한다.

**단, `ELBOW_02`와 `ELBOW_02A`의 §10 요약 bullet(L480-481)만 "UNKNOWN/invalid"라고만 적혀 있고 "missing"이라는 단어가 빠져 있다.** §3 자신의 개별 semantics(L152, L168)는 두 필드 모두 "UNKNOWN/missing/malformed → REVIEW_REQUIRED"라고 정확히 서술하므로, 이 문서가 실제로 의도하는 계산 로직 자체에는 fail-open이 없다 — §10 요약표만 다른 9개 bullet과 다르게 축약된 것이다. 그러나 KNEE_V1 통합 때 §11 요약표만 보고 구현하다가 실제로 fail-open이 발생했던 전례(당시 KNEE_03/04에 `required: true`가 빠졌던 사례)를 고려하면, Sonnet 구현자가 §10만 보고 "missing"을 빠뜨릴 위험은 실질적이다.

**결정 필요(최소 수정, 비차단성 문서 정밀도):** §10의 `ELBOW_02`/`ELBOW_02A` bullet을 다른 9개 항목과 동일하게 "UNKNOWN/invalid/missing"으로 명시적으로 통일한다.

## 9. 최대 18문항 branch가 safety/fatigue 관점에서 허용 가능한가 — **확인됨, PASS**

문서에 정의된 전체 고유 문항 ID를 직접 세어 §17의 계산을 검증했다 — ELBOW_00(1) + 무조건 노출 12개(01,02,02A,06,07,08,09,10,11,12,13,14) + trauma 조건부 4개(03,04,05,15) + ulnar 조건부 1개(09A) = 18, 이는 이 문서에 정의된 전체 고유 문항 수(18개)와 정확히 일치한다 — 즉 "최대 branch"는 문서에 존재하는 모든 문항이 동시에 열리는 경로를 뜻하며 계산 오류가 없다. KNEE_V1의 이미 CLOSED된 18문항 규모와 동일하고, "safety는 fatigue 때문에 suppress하지 않는다"는 이 세션 전체의 기존 원칙을 그대로 따른다. **수정 불필요.**

## 10. 기존 LBP/NECK/SHOULDER/KNEE CLOSED 결정 변경 여부 — **확인됨, PASS**

`git show --stat`으로 이번 문서를 만든 커밋을 직접 확인했다 — `docs/ELBOW_V1_Tablet_Question_Set_v0.1.md` 신규 파일 1개(701줄 추가)만 존재하고, 그 외 어떤 파일도 변경되지 않았다. LBP/NECK/SHOULDER/KNEE 관련 코드·문서는 이번 작업에서 물리적으로 건드려지지 않았다. **수정 불필요.**

---

# 종합 판정

10개 항목 중 8개(1/2/4/5/6/7/9/10)는 원문 대조 결과 정확히 반영되어 **PASS**. 2개 항목(3/8)에서 섹션 간 내부 불일치를 발견했다 — 둘 다 이미 §3/§5가 올바르게 서술한 결정이 §10/§11 요약표로 옮겨지는 과정에서 축약되며 생긴 문서 정합성 문제이지, 새로운 임상 판단이나 E1–E10 tier의 재해석이 아니다.

**차단 사유 요약:**
1. §11 `expedited_referral_consider` 목록에 "ELBOW_09 YES + ELBOW_09A UNKNOWN/invalid/missing" 분기가 빠져 있다 — §5 자신의 명시적 결정과 불일치. `neuro_assessment_required`와 동일한 조건을 추가할 것.
2. §10의 `ELBOW_02`/`ELBOW_02A` bullet에 "missing"이 다른 9개 항목과 다르게 빠져 있다 — §3의 올바른 semantics와 일치하도록 표기를 통일할 것.

두 수정 모두 기계적이며(문구 추가/통일), 임상 threshold나 tier 자체를 바꾸지 않는다.

## 최종 판정

> # **CLINICAL DECISION REQUIRED**

위 2건이 반영된 개정판에 대해서만 재검수 후 `PASS / CLINICAL DECISIONS CLOSED`로 진행 가능하다. 그 전에는 Fable 통합계획, TypeScript/UI/테스트 구현, production code 수정을 진행하지 않는다.

---

## 다음 단계

§11 expedited_referral_consider 수정 + §10 ELBOW_02/02A 표기 통일 → **ELBOW_V1 Tablet Question Set v0.1.1**(또는 동등 개정) → Opus 최종 재검수(이 2건만 확인) → CLINICAL DECISIONS CLOSED → Fable 통합 계획 → Sonnet 구현 → 전체 회귀 → PASS / FROZEN
