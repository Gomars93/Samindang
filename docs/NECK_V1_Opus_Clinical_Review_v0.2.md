# NECK_V1 Tablet v0.2 — Opus 재검수 결과

**검수 완료일**: 2026-08-25
**검수자**: Opus
**판정**: **PASS — 조건부 (erratum 2건 반영 후 CLOSED)**
**대상 문서**: `NECK_V1_Tablet_Question_Set_v0.2_Clinical_Decisions_Closed.md`

---

## 판정 요약

D1–D11 **11건 모두 의도대로 정확히 반영**되었다. 일부는 원 권고보다 나은 형태로 구현되었다(D5의 "강한 충격" 문구 전면 제거, D8의 독립 섹션 승격, D9의 매핑표 실장).

다만 §15 Q2("새 fail-open 경로가 생기지 않았는가")에 대한 답은 **"1건 발생"**이다. v0.2에서 신설된 N10A가 비-safety 문항의 특정 값에 게이트되어, `CLEAR` 경로 위에 구멍이 남았다.

**두 건 모두 새로운 임상판단이 필요하지 않다.** 이미 CLOSED된 결정(D7·D2)을 문서 자체의 invariant(`UNKNOWN != NO`)에 맞게 술어만 교정하는 기계적 erratum이다. 임상 게이트를 다시 열지 않는다. E1·E2 반영 시점에 CLOSED로 확정되며, 별도 검수 라운드는 불필요하다.

---

## §15 검증질문 답변

| # | 질문 | 답 |
|---|---|---|
| 1 | D1–D11이 의도대로 반영되었는가 | **예 — 11/11** |
| 2 | 새 fail-open이 생기지 않았는가 | **아니오 — 1건 발생 (E1)** |
| 3 | N03A/N03B/N04 urgent 계층이 일관적인가 | **예** — 단, invalid 취급에 순서 역전 1건 (E2) |
| 4 | N05 contract가 generic negative 확대해석을 막는가 | **예 — 명세 수준에서 차단 완료** |
| 5 | disease/treatment/조작 lock이 충분히 분리되었는가 | **예** |
| 6 | 추가 문항 후 fatigue budget이 허용 가능한가 | **예 — E1·E2는 예산에 실질 영향 없음** |

---

## Part 1 — 차단 erratum 2건

### E1. N10A가 비-safety 문항의 YES에만 게이트되어 CLEAR 경로에 구멍이 남는다

**근거:**
N10A는 `priority: critical / safety`, `required_when_shown: true`인 안전 문항이나, 게이트는:
```
show_when: neck_headache_present == YES
```
N10(`neck_headache_present`)은 안전 문항이 아니고 `UNKNOWN` 옵션을 가지며, §5 안전 엔진에 전혀 등장하지 않는다.

**결함 경로:**
```
N10 = UNKNOWN
  → N10A 미개방 (required_when_shown이므로 미충족 아님)
  → §5에 N10 UNKNOWN 항목 없음
  → 나머지 safety 전부 valid negative이면 → CLEAR
```

신규/변화 두통 안전망이 배치되지 않은 채 CLEAR에 도달한다. §5의 `UNKNOWN != NO` invariant를 게이트 층위에서 위반.

**N02A와 다른 이유:** N02A의 게이트(`N02 has any concrete positive`)가 참이면 이미 최소 REVIEW_REQUIRED가 확정된 분기 안이라 안전하다. N10A만 유일하게 CLEAR 경로 위에 놓인 조건부 안전 문항.

**잔여 위험:** N03B·N04는 무조건 표시라 최고 acuity 두통은 이미 포착됨. E1이 놓치는 것은 thunderclap도 국소신경증상도 없는 아급성 신규/변화 두통(GCA·종괴·약물과용두통 등).

**최소 수정안:**
```
show_when: neck_headache_present in [YES, UNKNOWN]
```
N11(phenotype 문항)은 `== YES` 그대로 유지. 시간 영향: N10=UNKNOWN 부분집합에만 +5s.

---

### E2. N04 soft 계층에서 invalid가 UNKNOWN보다 관대하게 취급된다

**근거:**
```
URGENT_REVIEW if: N04 soft positive AND N03A in [YES, UNKNOWN]
```
`in [YES, UNKNOWN]` 리터럴 열거이므로 N03A가 invalid/missing이면 이 조건 미충족.

| N03A 상태 | soft positive 동반 시 |
|---|---|
| YES | URGENT_REVIEW |
| UNKNOWN | URGENT_REVIEW |
| **invalid/missing** | **URGENT 미도달** |
| NO | REVIEW_REQUIRED |

CLEAR로 새지는 않는다(N03A invalid가 별도 라인에서 REVIEW_REQUIRED를 독립 발생). **fail-open이 아니라 triage 등급의 순서 역전** — 정보가 더 나쁜 상태(invalid)가 더 관대한 결과를 받는다.

**최소 수정안:**
```
N03A_is_valid_negative := (N03A == NO and N03A is valid)
URGENT if: N04 soft positive AND NOT N03A_is_valid_negative
```
시간 영향: 0 (semantics only).

---

## Part 2 — 비차단 구현 노트 6건

| ID | 내용 | 비고 |
|---|---|---|
| NB1 | N02 `NEW_BLADDER_BOWEL_CHANGE`의 "최근" 한정어는 stem과 별개로 보존할 것 | 고령층 만성 배뇨증상 오탐 방지 |
| NB2 | `radicular_support` 매핑이 전사(total)가 아님 (일부 조합 미정의) | 안전 영향 없음, Doctor View 표시 공백만 |
| NB3 | N05 `PRIOR_CANCER`: `HISTORY_01=['none']`을 dedicated negative로 읽지 말 것 | contract는 이미 차단, 구현 시 재확인 필요 |
| NB4 | N01 age/osteoporosis modifier의 운용 위치 명확화 | 현재 stem 하에서는 실질 분기 없음 — 중복 구현 금지 |
| NB5 | N09 "clinician review 필요 시 flag"는 prose-conditional | 술어 명시 또는 삭제 |
| NB6 | §8 exam selector 발화조건 미기술 | 안전 lock 아님, 구현 전 확정 필요 |

---

## Part 3 — D1–D11 반영 확인

| ID | 반영 | 비고 |
|---|---|---|
| D1 | ✅ 정확 | N02 stem 현재상태 전환 + N02A 신설, downgrade 차단 명시 |
| D2 | ✅ 정확 | 무조건 표시 + hard/soft 계층 |
| D3 | ✅ 정확 | N03A/N03B 분리, 단독 URGENT 금지 명문화 |
| D4 | ✅ 정확 (강화) | "증상 축 일부만"으로 보수화 |
| D5 | ✅ 정확 (개선) | 3개월 window + 판단주체 원장 이관 |
| D6 | ✅ 정확 | 규칙 추가 + stem 수정 그대로 채택 |
| D7 | ✅ 결정 반영 / ⚠️ 게이트 결함 | 문항·semantics 정확, 게이트 술어만 E1 |
| D8 | ✅ 정확 (강화) | 독립 섹션 승격, 우선순위 명문화 |
| D9 | ✅ 정확 | item-level 매핑표 + fail-closed 기본값 |
| D10 | ✅ 정확 | fail-closed invariant + 자동 CLEAR 금지 |
| D11 | ✅ 정확 | evidence→claim 표 + 사용 제한 열 |

**11/11 수용 및 정확 반영.**

---

## Part 4 — CLEAR 도달 경로 재검증 (E1·E2 반영 후)

```
N01  = NO (valid)
N02  = [NONE] (valid)
N03A = NO (valid)
N03B = NO (valid)
N04  = [NONE] (valid)
N05  = 모든 required item valid negative
N10A = NO (valid)  ← E1 적용 후 N10 ∈ [YES, UNKNOWN]에서 개방
```

CLEAR 경로 위에 미배치 안전 문항 없음 확인. fatigue 예산 영향 무시 가능(§12 추정치 유지, 180s 예산 내).

---

## 결론

v0.1 검수의 4대 차단 사유(D2 UNKNOWN fail-open / D8 조작 lock 부재 / D9 Core reuse 미정의 / D10 treatment safety invariant 부재) 모두 해소.

> ## **PASS — 조건부**
>
> **E1·E2를 반영하면 그 시점에 `CLINICAL DECISIONS CLOSED`가 확정되며, Fable 통합 계획 착수 가능.**
>
> 재검수 라운드 불필요 — E1·E2는 새 임상판단을 요구하지 않는 기계적 erratum. 단, 반영 전에는 Sonnet 구현 착수 금지.

## 다음 단계

1. v0.2에 E1·E2 반영 → v0.2.1
2. CLINICAL DECISIONS CLOSED 확정
3. Fable — repo 통합 계획 (LBP_V1의 2-layer 구조 재사용 검토 권고)
4. Sonnet — 구현 + 회귀
5. PASS / FROZEN
