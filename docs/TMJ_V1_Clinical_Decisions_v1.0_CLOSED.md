# TMJ_V1 — Clinical Decisions v1.0 CLOSED

작성일: 2026-08-26
기준 문서:
- `docs/TMJ_V1_Evidence_Matrix_v0.1_HANDOFF.md`
- `docs/TMJ_V1_Clinical_Decision_Packet_v0.1.md`

최종 상태: **PASS / CLINICAL DECISIONS CLOSED**

## Approval record

2026-08-26 사용자가 Clinical Decision Packet v0.1의 **T1–T8 추천안을 전부 승인**했다. 아래 결정은 이후 Tablet Question Set, final verification, Fable integration, production implementation의 authoritative clinical contract다.

## CLOSED decisions

- **T1 HFJ downstream discriminator** — `PAIN_01 === head_face_jaw` 아래 `HFJ_00`을 사용한다: `JAW_TMJ_MASTICATORY / HEADACHE_CRANIAL / FACIAL_NEURALGIC / DENTAL_OR_ORAL / DIFFUSE_OR_MULTIPLE / UNKNOWN`. `HFJ_00`은 visibility/tagging only이며 safety tier를 직접 만들지 않는다.
- **T2 Protected exposure** — TMJ/facial protected safety는 `JAW_TMJ_MASTICATORY / FACIAL_NEURALGIC / DENTAL_OR_ORAL / DIFFUSE_OR_MULTIPLE / UNKNOWN`에 노출한다. `HEADACHE_CRANIAL`은 향후 dedicated HEADACHE_V1 후보이며 Core global safety만 유지한다.
- **T3 Acute trauma/dislocation emergency** — current unreduced abnormal jaw position, severe facial/jaw trauma + gross deformity, uncontrolled heavy oral bleeding, breathing/swallowing compromise는 각각 standalone `URGENT_REVIEW` 후보(OR semantics). Trauma + new bite change/marked functional loss만 있으면 `REVIEW_REQUIRED + trauma_or_dislocation_assessment_required`, 자동 URGENT 금지.
- **T4 Dental/deep infection** — airway/swallow/eye compromise, large/spreading swelling, severe systemic illness는 `URGENT_REVIEW`. localized tooth/gum pain-swelling, pus/bad taste history, fever without emergency features는 `REVIEW_REQUIRED + dental_or_oral_assessment_required + infection_assessment_required`. patient response만으로 abscess 확진 금지.
- **T5 GCA safety** — final payload에서 `age >= 50 + new jaw claudication/scalp-temporal pain pattern`은 최소 `REVIEW_REQUIRED + gca_assessment_required + expedited_referral_consider`; 같은 pattern에 new/transient visual disturbance/diplopia/visual loss가 더해지면 `URGENT_REVIEW`. age unknown은 negative가 아니다.
- **T6 Facial neurologic concern** — new/persistent facial numbness 또는 patient-reported focal neurologic change는 `REVIEW_REQUIRED + neuro_assessment_required + expedited_referral_consider`. acute major neurologic emergency는 existing Core urgent pathway 우선.
- **T7 Stable mechanical TMD carve-out** — chewing pain, stiffness, painful click/pop, intermittent spontaneously resolving lock, clenching/grinding context, painless click alone은 protected safety가 명시적으로 negative이면 safety escalation을 만들지 않는다. current fixed lock은 T3 functional safety로 별도 처리.
- **T8 Fail-closed/chart boundary** — protected inputs strict runtime validation mandatory. `UNKNOWN != NO`, missing/malformed/empty는 valid negative가 아니며 shown protected invalid는 최소 `REVIEW_REQUIRED`. optional phenotype missing은 escalation 금지. patient response는 C/C·O/S·S까지만, objective ROM/occlusion/CN/dental/imaging/definitive diagnosis는 clinician-confirmed data만 O에 기록한다.

## Boundaries

- HEADACHE_V1 threshold를 이 모듈에서 선점하지 않는다.
- 기존 CLOSED/FROZEN MSK module threshold 수정 금지.

다음 gate: **Tablet Question Set → final verification → Fable integration plan → implementation → regression → PASS/FROZEN**.
