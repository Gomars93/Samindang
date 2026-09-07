# Recovered source extract — KNEE_V1

Source artifact: `KNEE_V1_Evidence_Matrix_v0.1_HANDOFF.md` (2026-08-25)

Status: historical recovered draft excerpt. This does not imply a production exercise library or recommender existed in GitHub.

# 11. Exercise / Rehabilitation Architecture

KNEE도 동일:

**Clinical OS 후보 2–3개 → 원장 승인/삭제/교체 → 최종 1–2개**

입력:
- target function
- irritability
- ROM
- effusion
- strength
- load response
- instability
- movement control
- patient goal
- safety

Domain:
- activity / aerobic
- mobility
- quadriceps strength
- hamstring/calf/hip strength
- neuromuscular / balance
- sit-to-stand / squat / stair tolerance
- gait/load progression
- PF-specific graded loading
- tendon load progression
- ligament return-to-function
- graded exposure

### 금지
- OA = quad exercise 1개 고정
- PFP = VMO isolation hard-code
- meniscus = 무조건 회전 금지
- ACL = diagnosis만으로 동일 rehab
- tendon = 무조건 rest
- safety/locking/extensor rupture concern에서 routine progression

---

# 12. Reassessment

모든 재진:
1. Pain NRS
2. Target Function 0–10

조건부:
- walking tolerance
- sit-to-stand/stair score
- ROM/extension
- effusion
- instability/giving-way episodes
- locking/catching
- standardized tendon/PF load response
- strength/function

Response:
- `RESPONDING`
- `PARTIAL_RESPONSE`
- `NON_RESPONSE`
- `DETERIORATION`
- `DISCHARGE`

`DETERIORATION`
→ safety / diagnosis / referral reassessment.

---

# 13. Evidence → Claim Mapping

| Evidence | Supports | Do not over-extend |
|---|---|---|
| NICE NG226 | clinical OA pattern, no routine imaging, exercise/function-centered care | atypical/inflammatory knee automatically as OA |
| AAOS Knee OA 2021 | nonarthroplasty adult OA management | imaging severity = symptom severity |
| AAOS Acute Meniscus 2024 | acute isolated tear diagnosis/management, combined exam, MRI, displaced tear urgency | chronic/degenerative/root/ACL-associated tear |
| AAOS ACL 2022 | ACL management framework | tablet diagnosis or automatic surgery decision |
| JOSPT Ligament 2017 | stability/movement-coordination rehab framework | acute vascular/multiligament safety |
| Willy 2019 / Neal 2024 PFP | PFP phenotype + education/exercise | every anterior knee pain as PFP |
| Dutch PFP/PT 2024 | exercise-first PFP/PT, limited imaging value in PT | rupture or acute traumatic tendon injury |
| ACR Acute Knee Trauma | trauma imaging context / radiograph indications | self-administered Ottawa rule as diagnosis |
| SANJO 2023 | septic native-joint evaluation | hot joint self-report alone = confirmed infection |
| NICE NG158 | DVT signs/symptoms + clinician Wells pathway | tablet Wells score without clinical exam |
| Acute patellar tendon rupture review 2024 | active-extension loss as key clue, timely repair importance | partial vs complete rupture self-diagnosis |