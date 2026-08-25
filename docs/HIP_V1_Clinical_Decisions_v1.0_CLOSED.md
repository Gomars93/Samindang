# HIP_V1 — Clinical Decisions v1.0 CLOSED

작성일: 2026-08-26
기준 문서:
- `docs/HIP_V1_Evidence_Matrix_v0.1_HANDOFF.md`
- `docs/HIP_V1_Clinical_Decision_Packet_v0.1.md`

최종 상태: **PASS / CLINICAL DECISIONS CLOSED**

## Approval record

2026-08-26 사용자가 Clinical Decision Packet v0.1의 **H1–H8 추천안을 전부 승인**했다. 아래 결정은 이후 Tablet Question Set, final verification, Fable integration, production implementation의 authoritative clinical contract다.

## CLOSED decisions

- **H1 Shared routing/LBP overlap** — 기존 `PAIN_01 === low_back_pelvis`의 FROZEN LBP protected safety는 항상 유지한다. `HIP_00`은 `LOW_BACK_DOMINANT / BUTTOCK_PELVIS_DOMINANT / HIP_GROIN_DOMINANT / SIMILAR_OR_MULTIPLE / UNKNOWN`으로 구분하며 HIP-specific safety는 `BUTTOCK_PELVIS_DOMINANT / HIP_GROIN_DOMINANT / SIMILAR_OR_MULTIPLE / UNKNOWN`에서 추가 노출한다. `HIP_00` 자체는 safety tier를 직접 만들지 않는다.
- **H2 Acute traumatic major neurologic deficit** — acute hip/pelvic trauma + new major distal sensory/motor loss는 standalone `URGENT_REVIEW`. non-traumatic progressive deficit은 `REVIEW_REQUIRED + expedited_referral_consider`. patient report를 objective neurologic finding으로 변환하지 않는다.
- **H3 Suspected acute hip fracture tier** — trauma + new hip/groin pain + marked weight-bearing/walking difficulty는 `REVIEW_REQUIRED + fracture_imaging_consider + expedited_referral_consider`. gross deformity/unreduced joint/acute neurovascular compromise/severe open injury 같은 limb-threatening feature가 별도로 있을 때만 `URGENT_REVIEW`.
- **H4 Prior X-ray context** — patient-reported prior normal X-ray는 optional context only. safety tier나 `fracture_imaging_consider`를 낮추지 못하며 objective imaging finding으로 변환하지 않는다.
- **H5 Femoral neck stress-fracture screen** — compatible atraumatic/insidious hip-groin pattern + repetitive load increase + progressive weight-bearing pain/walking intolerance는 protected concern으로 `REVIEW_REQUIRED + stress_fracture_assessment_required + fracture_imaging_consider`. concern 해소 전 routine loading exercise는 lock. 자동 진단 금지.
- **H6 Serious infection architecture** — `SYSTEMIC_OR_RAPIDLY_WORSENING`은 opaque OR semantics. systemic illness **OR** rapidly worsening severe hip/groin pain 중 하나의 concrete positive면 `URGENT_REVIEW + infection_assessment_required`. fever absence로 rule-out 금지.
- **H7 LBP zero-regression** — HIP route가 어떤 경우에도 LBP questions/safety/flags를 숨기거나 약화하지 않는다. `IS_PRIMARY_LBP`와 LBP logic 수정 금지. HIP engine은 독립 additive engine으로 둔다.
- **H8 Strict fail-closed runtime** — protected inputs는 strict runtime validation mandatory. `UNKNOWN != NO`, missing/malformed/empty는 valid negative가 아니며 shown protected invalid는 최소 `REVIEW_REQUIRED`. optional phenotype missing은 escalation 금지. 최초 구현부터 allowlist/exclusivity 및 malformed regression을 포함한다.

## Boundaries

- patient responses만으로 `O | 객관적 소견`/확진/영상소견 생성 금지.
- 기존 CLOSED/FROZEN LBP/NECK/SHOULDER/KNEE/ELBOW/WRIST_HAND threshold 수정 금지.

다음 gate: **Tablet Question Set → final verification → Fable integration plan → implementation → full regression → PASS/FROZEN**.
