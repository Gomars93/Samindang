# ANKLE_FOOT_V1 — Clinical Decision Packet v0.1

작성일: 2026-08-25  
근거 SSOT: `docs/ANKLE_FOOT_V1_Evidence_Matrix_v0.1_HANDOFF.md`  
상태: **CLINICAL DECISION REQUIRED**

> 목적: Evidence Matrix 전체를 다시 읽지 않아도 임상 threshold 결정만 빠르게 검수할 수 있게 A1–A8을 압축한다. Production 구현은 이 결정들이 CLOSED되기 전까지 금지한다.

---

## A1. Routing / protected safety exposure

**질문**  
`PAIN_01 === leg_foot` 아래 `AF_00`을 두고, 아래 모든 유효 region에서 ANKLE_FOOT protected safety를 노출할 것인가?

- LOWER_LEG_CALF
- ANKLE
- HEEL_POSTERIOR_ANKLE
- FOOT_TOES
- DIFFUSE_OR_MULTIPLE
- UNKNOWN

**추천**: YES.

**이유**: LOWER_LEG_CALF를 제외하면 Achilles proximal symptom 및 DVT safety gap이 생길 수 있다. `AF_00` 자체는 visibility/tagging 전용이며 safety tier를 직접 만들지 않는다.

---

## A2. Acute major distal neurologic deficit

**질문**  
급성 외상 맥락에서 새로 생긴 뚜렷한 distal sensory/motor loss를 standalone `URGENT_REVIEW`로 둘 것인가?

**추천**: YES.

- acute trauma + major new distal sensory/motor loss → URGENT
- non-traumatic progressive deficit → REVIEW + expedited
- patient report는 objective neurologic exam이 아님

---

## A3. Ottawa boundary

**질문**  
Tablet의 weight-bearing/4-step report를 fracture review signal로 사용하되 Ottawa Ankle/Foot Rule 자체는 자동 계산하지 않을 것인가?

**추천**: YES.

- trauma + cannot bear weight / cannot take 4 steps → REVIEW + fracture_imaging_consider
- bony tenderness는 clinician exam
- tablet은 `Ottawa positive/negative`를 생성하지 않음
- rule-negative를 tablet alone으로 사용하지 않음

---

## A4. Midfoot / Lisfranc history

**질문**  
환자가 인지한 `발바닥 중간의 새 멍`을 supportive **S(환자보고)** 로 수집할 수 있게 할 것인가?

**추천**: YES.

- acute midfoot trauma + significant dysfunction/weight-bearing difficulty → REVIEW + fracture_imaging_consider
- plantar bruising report는 supportive history
- objective plantar ecchymosis sign 또는 Lisfranc diagnosis로 변환 금지

---

## A5. Acute Achilles rupture concern

**질문**  
아래 둘 중 하나만 concrete positive여도 REVIEW를 만들 것인가?

1. sudden pop/snap behind ankle or calf
2. new marked loss of push-off / toe-rise ability after acute event

**추천**: YES — OR semantics.

결과:

- REVIEW_REQUIRED
- achilles_rupture_assessment_required = true
- expedited_referral_consider = true
- 자동 URGENT 금지(S1 limb-threatening criteria가 별도로 있으면 그 경로 우선)
- Thompson/palpable gap은 clinician exam

---

## A6. Diabetes / Charcot context source

**질문**  
현재 foot safety symptom은 ANKLE_FOOT module에서 묻고, diabetes/renal/neuropathy context는 기존 병력 정보를 재사용할 것인가?

**추천**: YES.

- 문진 중복 최소화
- hot/red/swollen/color-changed foot은 module에서 수집
- diabetes/neuropathy/renal context와 결합한 Charcot/diabetic-foot concern은 final computation/doctor review에서 처리
- sepsis/ischaemia/deep infection/gangrene concrete concern은 history 단계까지 기다리지 않고 URGENT pathway

---

## A7. DVT boundary

**질문**  
새로운 unilateral calf/lower-leg swelling-pain pattern만으로 `REVIEW_REQUIRED + dvt_assessment_required`를 만들고 Wells score는 clinician-only로 둘 것인가?

**추천**: YES.

- tablet은 DVT likely/unlikely를 생성하지 않음
- clinician history + physical examination 후 NICE 2-level Wells 적용
- chest pain/dyspnea/haemoptysis/collapse는 기존 Core global safety 사용

---

## A8. Fail-closed runtime contract

**질문**  
WRIST_HAND에서 발견된 malformed runtime input 문제를 반복하지 않도록 ANKLE_FOOT protected inputs에 처음부터 strict validation을 mandatory로 둘 것인가?

**추천**: YES.

Protected rule:

- UNKNOWN != NO
- missing != negative
- malformed != valid negative
- empty multi-select != NONE
- NONE/UNKNOWN + positive 혼합 = invalid
- protected invalid → 최소 REVIEW_REQUIRED
- conditional protected question은 shown일 때만 missing/empty escalation
- optional phenotype missing은 escalation 금지

Implementation requirement after closure:

- single-choice runtime allowlist validation
- multi-choice allowlist + exclusivity validation
- malformed regression tests를 최초 구현부터 포함

---

# Proposed closure

A1–A8을 모두 추천안대로 승인하면 다음 상태로 이동 가능:

`PASS / CLINICAL DECISIONS CLOSED`

그 다음 순서:

Tablet Question Set → final clinical verification → Fable integration plan → Sonnet implementation → full regression → PASS/FROZEN.

현재는 **CLINICAL DECISION REQUIRED**이며 production code는 금지한다.
