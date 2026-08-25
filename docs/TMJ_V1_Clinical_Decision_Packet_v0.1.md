# TMJ_V1 — Clinical Decision Packet v0.1

작성일: 2026-08-25  
근거 SSOT: `docs/TMJ_V1_Evidence_Matrix_v0.1_HANDOFF.md`  
상태: **CLINICAL DECISION REQUIRED**

> Production TypeScript/UI/test 구현은 T1–T8이 CLOSED되기 전까지 시작하지 않는다.

---

## T1. `head_face_jaw` downstream discriminator

**질문**  
기존 `PAIN_01 === head_face_jaw` 아래 `HFJ_00`을 추가해 다음을 구분할 것인가?

- JAW_TMJ_MASTICATORY
- HEADACHE_CRANIAL
- FACIAL_NEURALGIC
- DENTAL_OR_ORAL
- DIFFUSE_OR_MULTIPLE
- UNKNOWN

**추천**: YES.

`HFJ_00`은 visibility/tagging only. 어떤 값도 safety tier를 직접 만들지 않는다.

---

## T2. Protected facial/jaw safety exposure

**질문**  
TMJ_V1의 protected non-headache facial/jaw safety를 아래에 노출할 것인가?

- JAW_TMJ_MASTICATORY
- FACIAL_NEURALGIC
- DENTAL_OR_ORAL
- DIFFUSE_OR_MULTIPLE
- UNKNOWN

**추천**: YES.

`HEADACHE_CRANIAL`은 향후 HEADACHE_V1에서 dedicated safety를 만들 가능성이 있어 일단 TMJ-specific protected 질문은 제외하되, Core global safety는 그대로 유지한다.

---

## T3. Acute trauma / dislocation emergency

**질문**  
다음 patient-reported concrete condition을 standalone `URGENT_REVIEW` 후보로 둘 것인가?

- jaw가 현재 열린 채/비정상 위치로 고정되어 돌아오지 않음
- severe facial/jaw trauma + gross deformity
- uncontrolled heavy oral bleeding
- breathing/swallowing compromise associated with facial/oral swelling or injury

**추천**: YES — OR semantics.

Trauma + new bite change 또는 marked functional loss만 있는 경우는 `REVIEW_REQUIRED + trauma_or_dislocation_assessment_required`, 자동 URGENT는 금지.

---

## T4. Dental/deep infection boundary

**질문**  
다음을 구분할 것인가?

A. airway/swallow/eye compromise, large/spreading swelling, severe systemic illness → `URGENT_REVIEW`

B. localized tooth/gum pain-swelling, bad taste/pus history, fever without above emergency features → `REVIEW_REQUIRED + dental_or_oral_assessment_required + infection_assessment_required`

**추천**: YES.

Patient answer만으로 `dental abscess` 확진 생성 금지.

---

## T5. Giant-cell arteritis safety

**질문**  
최종 payload 계산 시 연령을 재사용해 `age >= 50 + new jaw claudication/scalp-temporal pain pattern`을 최소 `REVIEW_REQUIRED + gca_assessment_required + expedited_referral_consider`로 둘 것인가?

**추천**: YES.

추가로 위 pattern + new/transient visual disturbance/diplopia/visual loss가 있으면 `URGENT_REVIEW`로 올리는 안을 추천.

주의: tablet module 진행 중 age가 아직 수집되지 않았다면 GCA history question 자체는 age와 무관하게 넓게 묻거나, final computation에서만 age modifier를 적용해야 한다. `age unknown`을 자동 negative로 두지 않는다.

---

## T6. Persistent facial numbness / neurologic concern

**질문**  
새롭거나 지속되는 facial numbness 또는 patient-reported focal neurologic change를 `REVIEW_REQUIRED + neuro_assessment_required + expedited_referral_consider`로 둘 것인가?

**추천**: YES.

Major acute neurologic deficit 또는 Core global neurologic emergency가 있으면 기존 urgent pathway가 우선.

---

## T7. Stable mechanical TMD carve-out

**질문**  
다음만 있는 경우 protected safety가 모두 명시적으로 negative라면 REVIEW를 만들지 않을 것인가?

- jaw pain with chewing
- stiffness
- painful click/pop
- intermittent locking that spontaneously resolves
- clenching/grinding context
- painless click alone

**추천**: YES.

이들은 phenotype/supportive history이며 TMD subtype 확진이 아니다. 특히 painless clicking alone은 NIDCR에 따라 escalation 금지.

반대로 `currently locked and cannot reopen/close normally`는 T3/TMJ functional safety로 별도 처리.

---

## T8. Fail-closed + chart/runtime contract

**질문**  
모든 protected TMJ/facial safety input에 strict runtime validation을 mandatory로 둘 것인가?

**추천**: YES.

- UNKNOWN != NO
- missing != negative
- malformed != valid negative
- empty multi-choice != NONE
- NONE/UNKNOWN + positive 혼합 = invalid
- shown protected invalid → 최소 REVIEW_REQUIRED
- optional phenotype missing은 escalation 금지
- single-choice runtime allowlist + multi-choice allowlist/exclusivity regression을 최초 구현부터 포함

Chart boundary:
- patient response → C/C, O/S, S까지만
- objective ROM/occlusion/cranial nerve/dental/imaging/definitive diagnosis는 clinician-confirmed data만 O에 기록

---

# Proposed closure

T1–T8을 추천안대로 승인하면:

`PASS / CLINICAL DECISIONS CLOSED`

다음 순서:

Tablet Question Set → Opus final verification → Fable integration plan → Sonnet implementation → regression → PASS/FROZEN.

현재는 **CLINICAL DECISION REQUIRED**.
