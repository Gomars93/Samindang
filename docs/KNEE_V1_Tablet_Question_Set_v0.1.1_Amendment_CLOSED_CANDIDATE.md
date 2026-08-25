# KNEE_V1 Tablet Question Set v0.1.1 — Amendment / CLOSED CANDIDATE

작성일: 2026-08-25  
상태: **CLOSED CANDIDATE — final Opus verification required / production code blocked**  
대상: `KNEE_V1_Tablet_Question_Set_v0.1.md`

상위 문서:
- `KNEE_V1_Evidence_Matrix_v0.1_HANDOFF.md`
- `KNEE_V1_Opus_Clinical_Review_v0.1.md`
- `KNEE_V1_Tablet_Question_Set_v0.1.md`
- `KNEE_V1_Opus_Clinical_Review_v0.2.md`

이 문서는 Opus v0.2 재검수에서 남은 **3개 차단항목만** 규범적으로 수정한다. 아래에 명시하지 않은 v0.1의 임상결정·문항·tier·flag·금지사항은 그대로 유지한다. 최종 Opus PASS 전에는 `CLINICAL DECISIONS CLOSED`를 선언하지 않으며 KNEE production code를 구현하지 않는다.

---

# A1. K5 DVT calibration — §11을 §12 combined-condition 로직과 통일

## 변경 전 문제
v0.1 §11은 `KNEE_06 YES` 자체를 `REVIEW_REQUIRED`로 두어, KNEE_06A에서 위험맥락을 명시적으로 `NONE`으로 답한 경우에도 routine knee pathway가 잠기는 과잉경고 경로가 있었다.

## 최종 후보 규칙
`KNEE_06 = UNKNOWN / invalid / missing`
- → `REVIEW_REQUIRED`

`KNEE_06 = YES` 이면서 KNEE_06A에 concrete risk가 하나 이상 있음
- → `REVIEW_REQUIRED`
- → `dvt_assessment_required = true`

`KNEE_06 = YES` 이면서 KNEE_06A가 `UNKNOWN / invalid / missing`
- → `REVIEW_REQUIRED`
- → `dvt_assessment_required = true`

`KNEE_06 = YES` 이면서 KNEE_06A가 명시적 `NONE`
- → **이 경로만으로는 `REVIEW_REQUIRED`를 만들지 않는다.**
- → `dvt_assessment_required = false`
- 단, KNEE_06B 및 다른 safety gate는 독립적으로 그대로 적용한다.

KNEE_06B:
- PE-type concrete positive → `URGENT_REVIEW`
- `UNKNOWN / invalid / missing` → `REVIEW_REQUIRED`
- `NONE` → 다른 safety 결과에 따름

Wells score는 계속 clinician-side에서만 계산한다.

### v0.1 §11 교체문
`REVIEW_REQUIRED` 목록의 DVT 부분을 다음으로 교체한다.

```text
- KNEE_06 UNKNOWN/invalid/missing
- KNEE_06 YES + KNEE_06A concrete risk
- KNEE_06 YES + KNEE_06A UNKNOWN/invalid/missing
- KNEE_06A UNKNOWN/invalid/missing when shown
- KNEE_06B UNKNOWN/invalid/missing when shown
```

다음 항목은 제거한다.

```text
- KNEE_06 YES 단독 → REVIEW_REQUIRED
```

---

# A2. K9 occult hip-fracture referred pattern — KNEE_08 옵션 1개 추가

v0.1의 KNEE_08은 신경학적/마미증후군 계열 referred pathology는 포착하지만, Opus가 K9의 원래 rationale로 명시한 **고관절 골절 또는 고관절 병변이 무릎통증으로 오인되는 경로**를 충분히 포착하지 못했다.

## KNEE_08 신규 옵션

```text
NEW_HIP_GROIN_PAIN_OR_WEIGHT_BEARING_DIFFICULTY_NOT_EXPLAINED_BY_KNEE
```

환자 문구:

> 무릎 증상과 함께 새로 생긴 엉덩이·사타구니 통증이 있거나, 무릎만으로 설명하기 어려울 정도로 다리에 체중을 싣기 힘든가요?

KNEE_08 최종 options:

```text
NEW_SENSORY_CHANGE
NEW_WEAKNESS
NEW_BLADDER_BOWEL_CONTROL_CHANGE
NEW_HIP_GROIN_PAIN_OR_WEIGHT_BEARING_DIFFICULTY_NOT_EXPLAINED_BY_KNEE
NONE
UNKNOWN
```

## semantics
- 기존 3개 neuro/referred concrete positive → `REVIEW_REQUIRED` + `MUST_EXCLUDE_SYSTEMIC_OR_REFERRED_PATHOLOGY`
- 신규 hip/groin/weight-bearing option positive → `REVIEW_REQUIRED`
- 신규 option positive → `fracture_imaging_consider = true`
- 신규 option positive → `MUST_EXCLUDE_FRACTURE_OR_NEUROVASCULAR_INJURY` 범주로 표시
- `UNKNOWN / invalid / missing` → `REVIEW_REQUIRED`
- 새로운 safety tier 또는 새로운 flag는 만들지 않는다.

## §12 fracture flag 추가

`fracture_imaging_consider = true` 조건에 다음을 추가한다.

```text
- KNEE_08 includes NEW_HIP_GROIN_PAIN_OR_WEIGHT_BEARING_DIFFICULTY_NOT_EXPLAINED_BY_KNEE
```

---

# A3. fail-closed — KNEE_03 / KNEE_04 하드 required 명시

Opus v0.2가 확인한 구현계약상 `required`가 명시되지 않은 문항은 UI에서 답변 없이 넘어갈 수 있다. 따라서 protected safety follow-up인 KNEE_03과 KNEE_04에 `required: true`를 명시한다.

## KNEE_03

```text
variable: knee_post_trauma_weight_bearing_failure
required: true
show_when: KNEE_01 in [YES, UNKNOWN]
```

## KNEE_04

```text
variable: knee_extensor_mechanism_concern
required: true
show_when: KNEE_01 in [YES, UNKNOWN]
```

### invariant
- shown safety follow-up은 답변 없이 진행할 수 없다.
- missing != NO
- UNKNOWN != NO
- malformed != NONE
- required safety missing/malformed → 최소 `REVIEW_REQUIRED`

---

# A4. 변경 후 Safety Engine 요약

## URGENT_REVIEW
1. Core global safety already urgent
2. KNEE_02 concrete positive
3. KNEE_02A == YES
4. KNEE_06B any concrete PE-type positive
5. KNEE_07 == YES

## REVIEW_REQUIRED
URGENT가 아니면서 다음 중 하나:
- any required safety answer missing/malformed
- KNEE_01 UNKNOWN
- KNEE_02 UNKNOWN/invalid
- KNEE_02A UNKNOWN/invalid
- KNEE_03 YES/UNKNOWN/invalid/missing when shown
- KNEE_04 YES/UNKNOWN/invalid/missing when shown
- KNEE_05 YES/UNKNOWN/invalid
- KNEE_06 UNKNOWN/invalid/missing
- KNEE_06 YES + KNEE_06A concrete risk
- KNEE_06 YES + KNEE_06A UNKNOWN/invalid/missing
- KNEE_06A UNKNOWN/invalid/missing when shown
- KNEE_06B UNKNOWN/invalid/missing when shown
- KNEE_07 UNKNOWN/invalid
- KNEE_08 any concrete positive / UNKNOWN / invalid / missing

## CLEAR
모든 required safety source가 valid하고 위 URGENT/REVIEW 조건이 하나도 없을 때만.

---

# A5. 이번 수정에서 건드리지 않은 CLOSED 후보 결정

다음은 Opus v0.2에서 PASS되어 재설계하지 않는다.

- K2: KNEE_02A unconditional exposure, YES → URGENT_REVIEW
- K3/K4 clinical tier: extensor concern / true locked knee → REVIEW_REQUIRED + expedited referral
- C2: KNEE_06B에 움직임-무관 등 추가 AND gate 없음
- C1: `MUST_EXCLUDE_FRACTURE_OR_NEUROVASCULAR_INJURY` 유지
- K1: septic knee → URGENT_REVIEW
- K6–K8 phenotype calibration
- maximum branch 18 screens 및 safety는 fatigue 때문에 suppress하지 않는 원칙

---

# A6. Final Opus Verification Gate

이번 최종 검수는 새로운 임상 설계를 요구하지 않는다. 아래 3개 수정이 v0.2 결정과 정확히 일치하는지만 확인한다.

1. **K5** — KNEE_06 YES + KNEE_06A NONE이 더 이상 단독 REVIEW를 만들지 않고, combined-condition으로 정렬됐는가?
2. **K9** — KNEE_08 신규 hip/groin/weight-bearing option이 occult hip-fracture/referred gap을 메우고 기존 `fracture_imaging_consider`를 재사용하는가?
3. **fail-closed** — KNEE_03 / KNEE_04가 `required: true`로 고정되어 missing-answer 진행 경로가 닫혔는가?
4. 위 수정으로 새 fail-open 또는 safety tier drift가 생기지 않았는가?

최종 출력은 둘 중 하나:

```text
PASS / CLINICAL DECISIONS CLOSED
```

또는

```text
CLINICAL DECISION REQUIRED
```

PASS 전에는 Fable/Sonnet 구현으로 넘어가지 않는다.

---

# Current Gate

```text
LBP_V1       PASS / FROZEN + Opus audit PASS
NECK_V1      PASS / FROZEN
SHOULDER_V1  PASS / FROZEN

KNEE Evidence Matrix v0.1               COMPLETE
Opus clinical review v0.1               COMPLETE
Tablet Question Set v0.1                COMPLETE
Opus re-review v0.2                     COMPLETE — 3 blocking fixes
v0.1.1 Amendment CLOSED CANDIDATE       COMPLETE — 3 fixes incorporated
Clinical decisions                      OPEN — final Opus verification required
Code implementation                     NOT STARTED / BLOCKED
```
