# KNEE_V1 — Opus Final Clinical Verification

**검수 완료일**: 2026-08-25
**검수자**: Opus
**대상 문서**: `KNEE_V1_Tablet_Question_Set_v0.1.1_Amendment_CLOSED_CANDIDATE.md` §A6 (4개 verification)
**판정**: **PASS / CLINICAL DECISIONS CLOSED**

이번 검수는 §A6의 4개 verification만 확인한다. 새 임상 설계나 code 구현은 수행하지 않았다. Opus v0.2에서 이미 CLOSED된 K1–K4/K6–K8/C1/C2/문항부담은 재해석하지 않았고, A5가 명시한 대로 이번 amendment가 실제로 그 항목들을 건드리지 않았는지도 원문 대조로 확인했다.

---

# A6 검증 결과

## 1. K5 — KNEE_06 YES + KNEE_06A NONE이 단독 REVIEW를 더 이상 만들지 않는가 — **확인됨**

A1의 §11 교체문을 원문 대조했다. 기존 "`KNEE_06 YES` 단독 → `REVIEW_REQUIRED`" 항목이 명시적으로 제거되었고, 남은 5개 조건(`KNEE_06 UNKNOWN/invalid/missing` / `KNEE_06 YES + KNEE_06A concrete risk` / `KNEE_06 YES + KNEE_06A UNKNOWN/invalid/missing` / `KNEE_06A UNKNOWN/invalid/missing when shown` / `KNEE_06B UNKNOWN/invalid/missing when shown`) 중 어느 것도 "`KNEE_06 YES` + `KNEE_06A` 명시적 `NONE`" 조합을 포함하지 않는다 — v0.2가 요구한 정확한 combined-condition 정렬이다. §12의 `dvt_assessment_required` 조건은 애초부터(v0.1 단계에서) 이미 이 combined-condition 로직이었고 이번에 변경되지 않았으므로 §11/§12 간 불일치도 해소됐다.

이 de-escalation이 안전망을 뚫지 않는다는 점도 확인했다: KNEE_06B(PE-type 교차확인)의 `show_when`은 `KNEE_06A` 값과 무관하게 `KNEE_06 in [YES, UNKNOWN]`에만 걸려 있으므로, 위험인자를 전부 `NONE`으로 부인한 환자도 PE 동반증상 질문은 그대로 받고, 양성이면 여전히 독립적으로 `URGENT_REVIEW`가 발동한다.

## 2. K9 — 신규 hip/groin/weight-bearing 옵션이 gap을 메우고 기존 flag를 재사용하는가 — **확인됨**

A2를 원문 대조했다. `KNEE_08`에 `NEW_HIP_GROIN_PAIN_OR_WEIGHT_BEARING_DIFFICULTY_NOT_EXPLAINED_BY_KNEE` 옵션이 추가되어, v0.2가 지적한 "occult hip fracture가 knee pain으로 오인되는" 경로(신경학적 결손이 없어 기존 3개 옵션 중 어디에도 걸리지 않던 경로)를 이제 직접 포착한다. Positive 시 `REVIEW_REQUIRED` + 기존 `fracture_imaging_consider` flag를 재사용하며(§12에 조건 추가), 새로운 safety status tier나 새로운 flag를 만들지 않았다. Hypothesis 귀속도 새 enum이 아니라 C1에서 이미 CLOSED된 `MUST_EXCLUDE_FRACTURE_OR_NEUROVASCULAR_INJURY`를 그대로 사용한다.

Tier 자체(`REVIEW_REQUIRED`, `URGENT`가 아님)도 확인했다: 이 옵션이 포착하려는 시나리오는 정의상 "occult"(외형상 명백한 변형·신경혈관 손상이 없는) 사례이므로, K2에서 이미 CLOSED된 "외상+체중부하 곤란 = REVIEW+영상고려, 명백한 변형/신경혈관 손상만 URGENT" 원칙과 정확히 같은 시간 프레임(hours가 아니라 days)이다. 새로운 tier 판단이 아니라 기존 K2 tier의 정합적 확장이다.

## 3. fail-closed — KNEE_03/KNEE_04 required 고정으로 missing-answer 경로가 닫혔는가 — **확인됨**

A3을 원문 대조했다. `KNEE_03`, `KNEE_04` 정의에 `required: true`가 명시적으로 추가되어 `KNEE_05`와 동일한 패턴이 됐다. A4의 REVIEW_REQUIRED 재정의 목록도 두 필드 모두 "YES/UNKNOWN/invalid/**missing** when shown"으로 갱신되어, 노출된 상태에서의 무응답 진행 경로가 spec 레벨에서 문서화상으로도 막혔다. 이 repo의 기존 UI 계약(`disabled={!answered}`, `required: true`일 때 하드블록)과 결합하면 실제 구현 단계에서도 스킵이 불가능해진다.

## 4. 새 fail-open 또는 safety tier drift가 생기지 않았는가 — **확인됨, drift 없음**

A4(변경 후 전체 safety engine)를 처음부터 다시 읽어 URGENT_REVIEW 5개 조건과 REVIEW_REQUIRED 13개 조건 전체를 v0.2 이전 원본과 항목 단위로 대조했다:

- URGENT_REVIEW 목록(Core already urgent / KNEE_02 / KNEE_02A==YES / KNEE_06B PE-positive / KNEE_07==YES) — A1~A3 변경 이전과 완전히 동일. 변경 없음.
- REVIEW_REQUIRED 목록 — A1이 손댄 DVT 관련 5개 bullet, A3가 손댄 KNEE_03/04의 "missing" 추가만 달라졌고, 나머지(KNEE_01/02/02A/05/07/08 관련 bullet)는 원문 그대로다.
- A2가 추가한 KNEE_08 신규 옵션은 이미 있던 "KNEE_08 any concrete positive" 포괄 조건에 자연스럽게 편입되어 별도 bullet이 필요 없었고, 실제로 별도 bullet을 만들지 않았다 — 개념 복제(같은 안전 개념을 별도 threshold로 중복 선언하는 것) 없음.
- A5가 "건드리지 않음"이라 선언한 K1/K2/K3-K4/C1/C2/K6-K8/문항부담 관련 텍스트를 v0.1.1 문서 전체에서 확인했고, A1~A3의 실제 diff 범위(§11 DVT bullet 5개, §12 fracture flag 1개, KNEE_03/04 required 플래그 2개, KNEE_08 옵션 1개)가 그 선언과 정확히 일치함을 확인했다. 이 6개 항목 밖의 그 어떤 tier·enum·flag·문항도 변경되지 않았다.
- 새로 추가된 KNEE_08 옵션, KNEE_06 DVT 조건 어디에도 이중조건(AND-gate)이 도입되지 않았다 — SHOULDER SH05의 F2 패턴이 반복되지 않았다.

**결론: drift 없음, 신규 fail-open 없음.**

---

# 최종 판정

> # **PASS / CLINICAL DECISIONS CLOSED**

`KNEE_V1_Tablet_Question_Set_v0.1.1_Amendment_CLOSED_CANDIDATE.md`(A1–A5)와, 그 하위에서 유지되는 `KNEE_V1_Tablet_Question_Set_v0.1.md`의 나머지 전체 조항이 **KNEE_V1의 CLOSED clinical decision**이다. 이 시점 이후 이 문서들의 임상결정·safety threshold·tier·hypothesis enum은 재해석 대상이 아니며, Fable 통합 계획과 Sonnet 구현 단계에서 그대로 literal port 되어야 한다.

이번 세션에서 code 구현은 수행하지 않았다 — 다음 단계는 Fable의 repo 통합 계획 수립이다.

---

# Current Gate

```text
LBP_V1       PASS / FROZEN + Opus audit PASS
NECK_V1      PASS / FROZEN
SHOULDER_V1  PASS / FROZEN

KNEE Evidence Matrix v0.1               COMPLETE
Opus clinical review v0.1               COMPLETE
Tablet Question Set v0.1                COMPLETE
Opus re-review v0.2                     COMPLETE — 3 blocking fixes identified
v0.1.1 Amendment CLOSED CANDIDATE       COMPLETE — 3 fixes incorporated
Opus final verification                 COMPLETE — PASS / CLINICAL DECISIONS CLOSED
Code implementation                     NOT STARTED
```

다음 단일 과제:

> **Fable: KNEE_V1 repo 통합 계획 수립 (`PAIN_01 === 'knee'` routing, Core `SAFETY_01`과 KNEE targeted safety 중복 최소화, LBP/NECK/SHOULDER 회귀 0)**
