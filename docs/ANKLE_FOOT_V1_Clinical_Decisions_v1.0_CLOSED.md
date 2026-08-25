# ANKLE_FOOT_V1 — Clinical Decisions v1.0 CLOSED

작성일: 2026-08-26
기준 문서:
- `docs/ANKLE_FOOT_V1_Evidence_Matrix_v0.1_HANDOFF.md`
- `docs/ANKLE_FOOT_V1_Clinical_Decision_Packet_v0.1.md`

최종 상태: **PASS / CLINICAL DECISIONS CLOSED**

## Approval record

2026-08-26 사용자가 Clinical Decision Packet v0.1의 **A1–A8 추천안을 전부 승인**했다. 아래 결정은 이후 Tablet Question Set, Opus final verification, Fable integration, production implementation의 authoritative clinical contract다.

## CLOSED decisions

- **A1 Routing** — `PAIN_01 === leg_foot` 아래 `AF_00`을 사용한다. `LOWER_LEG_CALF / ANKLE / HEEL_POSTERIOR_ANKLE / FOOT_TOES / DIFFUSE_OR_MULTIPLE / UNKNOWN`에서 ANKLE_FOOT protected safety를 노출한다. `AF_00` 자체는 visibility/tagging 전용이며 safety tier를 직접 만들지 않는다.
- **A2 Acute major distal neurologic deficit** — acute trauma + new major distal sensory/motor loss는 standalone `URGENT_REVIEW`. non-traumatic progressive deficit은 `REVIEW_REQUIRED + expedited_referral_consider`. patient report를 objective neurologic finding으로 변환하지 않는다.
- **A3 Ottawa boundary** — trauma + cannot bear weight / cannot take 4 steps는 `REVIEW_REQUIRED + fracture_imaging_consider`. Ottawa Ankle/Foot Rule은 tablet에서 자동 계산하지 않는다. bony tenderness는 clinician exam이다.
- **A4 Midfoot/Lisfranc history** — patient-reported new plantar bruising은 supportive `S` history로 수집 가능하다. acute midfoot trauma + significant dysfunction/weight-bearing difficulty는 `REVIEW_REQUIRED + fracture_imaging_consider`. objective plantar ecchymosis sign 또는 Lisfranc diagnosis로 변환하지 않는다.
- **A5 Acute Achilles rupture concern** — sudden pop/snap behind ankle/calf **OR** new marked loss of push-off/toe-rise after acute event 중 하나만 concrete positive여도 `REVIEW_REQUIRED + achilles_rupture_assessment_required + expedited_referral_consider`. 자동 URGENT 금지. Thompson test/palpable gap은 clinician exam이다.
- **A6 Diabetes/Charcot context** — foot safety symptoms는 ANKLE_FOOT module에서 수집하고 diabetes/renal/neuropathy context는 기존 병력 정보를 재사용한다. sepsis/ischaemia/deep infection/gangrene concrete concern은 history 단계까지 기다리지 않고 urgent pathway를 사용한다.
- **A7 DVT boundary** — new unilateral calf/lower-leg swelling-pain pattern은 `REVIEW_REQUIRED + dvt_assessment_required`. Wells score 및 DVT likely/unlikely 분류는 clinician-only. chest pain/dyspnea/haemoptysis/collapse는 기존 Core global safety를 사용한다.
- **A8 Fail-closed runtime contract** — protected inputs는 strict runtime validation mandatory. `UNKNOWN != NO`, missing/malformed/empty는 negative로 취급하지 않으며 invalid protected input은 최소 `REVIEW_REQUIRED`. conditional protected question은 shown일 때만 missing/empty escalation. optional phenotype missing은 escalation 금지. 최초 구현부터 single-choice allowlist, multi-choice allowlist/exclusivity, malformed regression tests를 포함한다.

## Boundaries

- patient responses만으로 `O | 객관적 소견` 생성 금지.
- definitive diagnosis, Ottawa positive/negative, Wells score, Thompson test result 자동 생성 금지.
- 기존 CLOSED/FROZEN LBP/NECK/SHOULDER/KNEE/ELBOW/WRIST_HAND clinical threshold 수정 금지.

다음 gate: **Tablet Question Set → Opus final verification → Fable integration plan → implementation → full regression → PASS/FROZEN**.
