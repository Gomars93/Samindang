# SHOULDER_V1 Evidence Matrix v0.1 — Opus 임상·근거 검수

**검수 완료일**: 2026-08-25
**검수자**: Opus
**판정**: **CLINICAL DECISION REQUIRED**

---

## 판정 요약

Evidence Matrix의 전반적 구조와 근거 사용은 우수하다. 특히 §5(Active vs Passive ROM 분기), §6(RC 특수검사를 support/contradiction으로만 사용), §9(imaging principle)는 인용 근거(Desmeules 2025 JOSPT CPG, Lee 2025 frozen shoulder guideline)와 정확히 일치하며, 진단 확정·단일검사 확진·자동 영상처방을 모두 올바르게 배제하고 있다.

§13이 명시적으로 요청한 **S1~S7 중 2건(S1, S7)은 이번 단계에서 닫을 수 있는 구체적 결정이 필요**하고, 나머지는 대체로 타당하나 각각 경계 조건 1개씩을 명확히 해야 한다. 추가로 **enum 명명 불일치 1건**을 cross-cutting으로 발견했다.

---

# Part 1 — §13 질문별 판정 및 결정

## S1. Safety severity mapping — CLINICAL DECISION REQUIRED (결정 제시)

### 4개 URGENT 후보 — 전부 URGENT_REVIEW 적절

- suspected infection
- unreduced traumatic dislocation
- possible fracture with neurovascular concern
- acute cardiac/non-MSK emergency pattern

이 넷은 모두 "same-day emergency" 등급이며, 환자가 예정된 진료를 기다리지 말고 **지금 당장 직원 개입**이 필요한 유일한 범주다. LBP_V1의 CES, NECK_V1의 thunderclap headache/hard-tier vascular symptom과 동일한 판단 기준(시간 의존적 응급 = 실시간 인터럽트)을 그대로 적용하면 된다.

**PASS.**

### acute traumatic cuff tear — URGENT_REVIEW가 아니라 REVIEW_REQUIRED + EXPEDITED_REFERRAL

**근거:** BESS pathway(E5) 자체가 이 항목을 "urgent **specialist referral**"로 분류하지, 위 4개처럼 "same-day **emergency**"로 분류하지 않는다. 원본 근거가 이미 두 등급을 구분하고 있는데, 이를 앱의 단일 URGENT_REVIEW로 합치면 원본 근거의 severity 구분이 소실된다.

**실무적 근거:** URGENT_REVIEW(즉시 인터럽트)의 실질적 효과는 "환자를 예정된 진료 대신 응급실로 돌려보낼지"를 즉시 판단하게 만드는 것이다(LBP_04/NECK 하드티어와 동일 설계 의도). Acute traumatic cuff tear 환자는 이미 내원해 태블릿을 작성 중이며, 굳이 문진 흐름을 즉시 중단시키지 않아도 원장이 Doctor View를 여는 시점에 확인하면 충분하다 — 인터럽트를 늦춘다고 환자 예후가 달라지지 않는다.

### 최소 수정안

- `shoulder_safety_status`는 3-value(CLEAR/REVIEW_REQUIRED/URGENT_REVIEW) 그대로 유지 — 4번째 status 신설 금지.
- 대신 **별도 boolean/flag** `expedited_referral_consider`(LBP_V1의 `lbp_fracture_risk_age_modifier`와 동일한 패턴 — 원장 판단을 위한 clinician-facing 부가 flag이지 별도 상태값이 아님)를 두어, 이 flag가 true면 REVIEW_REQUIRED와 함께 Doctor View 최상단에 "신속 전문의 의뢰 고려"를 명시한다.

---

## S2. Systemic inflammatory / PMR gate — PASS (구체 calibration 제시)

**"야간통 단독은 malignancy red flag가 아니다"(line 289)라는 calibration은 그대로 유지 권고.** RC질환·frozen shoulder에서도 야간통이 매우 흔해, 이를 단독 red flag로 쓰면 alarm fatigue만 유발한다 — 정확한 판단이다.

**Tablet-level 캡처 범위:**

- domain D의 5개 항목(cancer history/unexplained weight loss/mass·swelling/systemic illness/PMR-like pattern)은 NECK_V1의 N05(systemic redflag screen)와 **구조적으로 거의 동일**하다 — cancer/발열·중증감염/면역억제/체중감소가 그대로 겹친다. Core reuse 원칙(NECK D9와 동일)을 적용해, 이미 확인된 항목은 재질문하지 않고 OR로만 추가한다.
- PMR-specific하게 SHOULDER에서만 필요한 증분 정보는 **"양쪽 어깨가 동시에·비슷하게 뻣뻣하거나 아픈지"** 1문항이다 — 이건 환자가 신뢰성 있게 자가보고 가능한 유일한 PMR discriminator(다발관절 활막염 촉진 등은 원장 전용, 이미 doc이 올바르게 clinician 항목으로 분류함).
- **결론:** 신규 domain을 만들 필요 없음. N05류 재사용 + 양측성 1문항 추가로 충분.

---

## S3. Cervical reuse — PASS (필수 제약조건 첨부)

**임상적으로 타당하다.** 경추 방사통/척수병증이 어깨 통증으로 발현하는 것은 흔한 임상 감별점이며, NECK_V1의 cord-concern screen(N02: 손 서투름/보행 변화/양측 다지 신경증상/급속 진행 마비/방광직장 변화)과 vascular-associated screen(N04)은 애초에 어깨 특이적이지 않은 전신·경추 안전망이므로 재사용이 자연스럽다.

**단, 구조적 제약 하나는 반드시 지켜져야 한다 — 이건 임상판단이 아니라 이 세션에서 이미 확립된 아키텍처 원칙이다:**

> 재사용은 **동일한 필드/threshold를 그대로 호출**하는 것이어야 하며, "비슷한 의미의 어깨용 신경증상 문항"을 새로 만들어 별도 재구현하면 안 된다.

이는 LBP_V1/NECK_V1 리뷰 전체에서 반복 확인된 실패 패턴(문서가 서로 다른 곳에서 같은 개념을 재정의하면 반드시 threshold가 미묘하게 어긋난다)과 동일하다. Fable 통합 단계에서 `neckLogic.ts`의 관련 함수를 **직접 호출**하도록 설계할 것 — SHOULDER 전용 재해석 금지.

또한 §1에서 이미 지적한 라우팅 문제(`PAIN_01 === 'neck_shoulder'`가 현재 NECK 진입 게이트)와 맞물려, "목 우세 vs 어깨 우세" sub-gate가 없으면 어깨 주호소 환자는 애초에 NECK_V1 화면 자체를 보지 않는다 — 재사용 메커니즘은 sub-gate 설계와 함께 검토되어야 하며 이는 Fable 통합 범위로 정확히 위임되어 있다(문서가 이미 명시).

**PASS, 통합 단계로 이관.**

---

## S4. Passive ROM discriminator — PASS

Passive ER 제한을 capsular pathology(frozen shoulder/GH OA)의 discriminator로, RC-related pain에서는 passive ROM이 상대적으로 보존된다는 calibration은 정확히 교과서적이며 Lee 2025 frozen shoulder guideline의 진단 접근(주로 임상적, ROM pattern 기반)과 일치한다. `CONSIDER`/`HIGHER_SUPPORT` 비확정 어휘 사용도 적절 — 그대로 유지 권고.

**비차단 note (Tablet 단계로 이관):** "global passive restriction"이 정확히 무엇을 의미하는지(ER 단독 제한 vs ER+외전+굴곡의 capsular pattern 전체)는 아직 정의되지 않았다. 단일 평면 제한만으로 frozen shoulder를 과다 지지하지 않도록, 다음 단계에서 "복수 평면 restriction"을 명시적으로 요구하는 방향을 권고한다.

---

## S5. RC diagnostic calibration — PASS

Painful arc/Hawkins-Kennedy/strength test를 support/contradiction 전용으로만 쓰고 단일 확진을 명시적으로 금지한 것은 2025 JOSPT CPG의 실제 권고와 정확히 부합한다. NECK_V1의 Spurling test 취급과 동일한 원칙 — 일관성 있음.

**PASS, 수정 불필요.**

---

## S6. Instability scope — PASS

"급성 미정복 탈구(safety, domain B)"와 "만성/재발성 instability(phenotype/rehab hypothesis)"를 분리한 구조는 NECK_V1이 N01(외상 안전)과 phenotype 문항을 분리한 것과 동일한 원칙이며 타당하다. Apprehension/relocation test를 "안전할 때만" 시행하도록 명시하고, 급성 미정복 탈구를 provocative test로 확인하려 하지 않는다는 원칙도 이미 명문화되어 있다.

**PASS, 수정 불필요.**

---

## S7. Non-MSK referred pain — CLINICAL DECISION REQUIRED (결정 제시)

**핵심 발견: 이 앱은 이미 전역 심장/흉통 안전망을 갖고 있다.** Core의 `SAFETY_01`(모든 환자에게 무조건 노출되는 공통 red flag)에 `chest_breathing` 옵션이 이미 존재하고, 이는 이미 `computeFlags().general_red`를 통해 실시간 인터럽트를 발생시킨다. 즉 SHOULDER 주호소 환자도 이미 이 전역 안전망을 통과한다.

**그런데 이 전역 net에는 명확한 gap이 있다.** E7이 정확히 지적하듯 anginal equivalent는 "가슴이 답답하다"는 언어 없이 순수하게 "어깨/팔이 불편하다"로만 표현될 수 있다. `SAFETY_01`의 옵션들은 흉부 중심(`chest_breathing`) 또는 명백한 국소 신경학적 소견(`focal_neuro`) 위주로 phrasing되어 있어, "가슴 언급 없는 어깨·팔 불편감 + 발한/호흡곤란/오심"이라는 정확히 이 시나리오를 놓칠 위험이 있다.

### 결정: SHOULDER 전체 심장 스크리닝을 새로 만들지 말고, 이 특정 gap만 메우는 1개 targeted 문항을 추가한다

- Core의 `SAFETY_01`을 재구현하거나 중복하지 않는다(이중 net은 서로 다른 threshold로 어긋날 위험만 키운다 — S3에서 지적한 것과 동일한 실패 패턴).
- 새 문항은 "이 어깨 불편감이 움직임·자세와 무관하게 나타나며, 가슴 답답함/식은땀/호흡곤란과 함께 있었는지"를 묻는다 — **비기계적(load-independent) 양상**을 명시적으로 걸어야 한다(기계적 통증은 load-related인 반면 anginal 통증은 대개 그렇지 않다는 것이 E7의 핵심 구분점).
- 이 문항의 양성 값은 **URGENT_REVIEW**(S1의 4개 URGENT 후보와 동일 tier) — 실시간 인터럽트로 연결한다.
- §4 표 마지막 행("systemic/referred pain인가?")과 §3 domain E를 이 새 문항이 채우는 것으로 정리하면 되며, 별도 domain 신설은 불필요하다.

---

# Part 2 — Cross-cutting 결함

## C1. Hypothesis enum 이름 불일치 (경미, 문서 정리 필요)

§8 Hypothesis Model은 domain D와 E를 각각 별도 enum으로 정의한다:

```
MUST_EXCLUDE_SYSTEMIC_OR_MALIGNANT_PATHOLOGY   (domain D)
MUST_EXCLUDE_NON_MSK_REFERRED_PATHOLOGY        (domain E)
```

그런데 §4 Evidence Matrix 표의 마지막 행은 이 둘을 **하나로 합친 제3의 이름** `MUST_EXCLUDE_NON_MSK_OR_SYSTEMIC`을 쓰고 있다.

이건 사소해 보이지만, LBP/NECK 리뷰 전체에서 반복 확인된 정확히 그 패턴이다 — 같은 개념이 문서 안에서 두 번 정의되면 구현 단계에서 반드시 한쪽이 드리프트한다. Malignancy(domain D)와 cardiac/referred(domain E)는 임상적으로 완전히 다른 workup 경로를 요구하므로, Doctor View에서 이 둘이 하나의 enum으로 뭉쳐지면 원장이 "왜 이게 떴는지" 구분할 수 없게 된다.

**수정안:** §4 표의 마지막 행을 domain D/E 각각에 대응하는 두 행으로 분리하거나, 최소한 §8의 두 실제 enum 이름 중 하나로 표기를 통일할 것.

## C2. §10 운동 lock — 현재 범위로 충분, 추가 결정 불필요

NECK_V1은 도수조작(HVLA)의 척추동맥박리 위험 때문에 별도 manipulation lock(D8)이 필수였다. SHOULDER의 mobilization/manual therapy는 그런 catastrophic risk profile을 갖지 않으므로, §10이 이미 명시한 "safety review 전 routine exercise progression 금지"와 instability 섹션의 "passive stretching보다 control/stability 우선"만으로 충분하다고 판단한다.

**추가 lock 도메인 신설 불필요 — 이 부분은 NECK와 달리 별도 결정이 필요 없다는 것 자체가 이번 검수의 결론이다.**

---

# Part 3 — 체크리스트

| ID | 항목 | 판정 | 신규 결정 |
|---|---|---|---|
| S1 | 응급 tier 매핑 | **결정 제시** | 4종 URGENT_REVIEW 확정 + acute cuff tear는 REVIEW_REQUIRED + `expedited_referral_consider` flag |
| S2 | PMR/systemic gate 범위 | PASS | N05류 Core reuse + 양측성 1문항 추가로 충분 |
| S3 | Cervical reuse 타당성 | PASS | 재사용은 반드시 동일 필드 직접 호출 — 재구현 금지 (Fable 이관) |
| S4 | Passive ROM discriminator | PASS | "global" 정의를 다음 단계에서 다중 평면으로 명확화 (비차단) |
| S5 | RC 특수검사 calibration | PASS | 수정 불필요 |
| S6 | Instability scope 분리 | PASS | 수정 불필요 |
| S7 | Non-MSK referred pain 중복 방지 | **결정 제시** | Core SAFETY_01 재사용 + targeted 1문항(load-independent+autonomic) 추가, URGENT_REVIEW tier |
| C1 | Hypothesis enum 명명 불일치 | 발견 | §4/§8 enum 이름 통일 |

---

# Part 4 — 결론

**근거 사용 수준은 이 시리즈(LBP_V1, NECK_V1)에서 가장 안정적이다.** 특히 §5-6-9(ROM 분기, 특수검사 calibration, imaging principle)는 수정 없이 그대로 다음 단계로 가져가도 좋다.

**차단 사유는 2건뿐이며, 둘 다 이번 리뷰에서 구체적으로 닫았다:**

- S1 — acute traumatic cuff tear의 severity tier를 원본 근거(BESS)가 실제로 구분하는 대로 되돌림
- S7 — Core의 기존 전역 심장 안전망과 SHOULDER 모듈이 중복·이원화되지 않으면서도, anginal equivalent가 "가슴" 언어 없이 어깨 통증으로만 발현하는 gap을 메우는 최소 문항 지정

---

## 최종 판정

> # **CLINICAL DECISION REQUIRED**

S1·S7(및 C1 명명 정리)이 다음 개정(Tablet Question Set v0.1 작성 시)에 반영되면, 그 문서에 대해 재검수 후 CLOSED로 진행 가능합니다. S2-S6는 제시된 calibration 그대로 채택해 진행해도 좋습니다.

---

## 다음 단계

각 결정 반영 → **SHOULDER_V1 Tablet Question Set v0.1** 작성 → Opus 재검수 → CLINICAL DECISIONS CLOSED → Fable 통합 계획(특히 S3의 NECK reuse 아키텍처, §1의 NECK/SHOULDER sub-gate 설계) → Sonnet 구현 → 전체 회귀 → PASS / FROZEN
