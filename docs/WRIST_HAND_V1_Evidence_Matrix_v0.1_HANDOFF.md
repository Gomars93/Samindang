# WRIST_HAND_V1 — Evidence Matrix v0.1 HANDOFF

작성일: 2026-08-25
상태: **EVIDENCE COMPLETE / OPUS CLINICAL REVIEW REQUIRED**
대상: 삼인당 Clinical OS — MSK Wrist/Hand module
기준 브랜치: `clinical/wrist-hand-v1-review`
기준 main: `b4d578f80929df566b9575b1f58d26ccdbce39e3` (ELBOW_V1 merge 이후)

> 이 문서는 근거·임상결정 후보를 정리하는 단계다. Tablet Question Set, TypeScript/UI/테스트 구현은 아직 시작하지 않는다.

---

# 0. Model orchestration

- **Opus**: 임상/근거 reviewer. 아래 W1–W10을 검수하고 `PASS / CLINICAL DECISIONS CLOSED` 또는 `CLINICAL DECISION REQUIRED`를 출력한다.
- **Fable**: Opus CLOSED 이후 실제 repo audit + shared `arm_hand` router 통합계획.
- **Sonnet**: CLOSED 결정과 Fable 계획을 literal port. safety threshold 독자 변경 금지.

흐름:

```text
Evidence Matrix (이 문서)
→ Opus clinical review
→ Tablet Question Set
→ Opus final verification
→ CLINICAL DECISIONS CLOSED
→ Fable integration
→ Sonnet implementation
→ regression
→ WRIST_HAND_V1: PASS / FROZEN
```

---

# 1. Actual repo constraint — ELBOW_V1 이후의 arm_hand routing

현재 `PAIN_01`에는 wrist/hand 전용 top-level choice가 없다. `arm_hand` 아래에서 ELBOW_V1이 만든 공통 region discriminator를 사용한다.

현재 실제 repo:

```text
PAIN_01 == 'arm_hand'
  ↓
ELBOW_00 / variable: arm_hand_region_discriminator

values:
- ELBOW
- FOREARM
- WRIST_HAND
- DIFFUSE_OR_MULTIPLE
- UNKNOWN
```

현재 ELBOW protected safety는:

```text
ELBOW / FOREARM / DIFFUSE_OR_MULTIPLE / UNKNOWN
→ ELBOW safety 노출

WRIST_HAND
→ ELBOW safety 제외
```

따라서 WRIST_HAND_V1은 **새 router를 또 만들지 않고 기존 `arm_hand_region_discriminator`를 재사용**하는 방향이 기본 후보다.

중요 원칙:
- router는 tagging/visibility만 담당
- router 값 자체가 safety tier를 직접 만들지 않음
- WRIST/HAND clinical logic은 ELBOW logic과 독립 모듈
- shared upper-limb UX는 통합하되 임상 도메인은 분리

---

# 2. Evidence sources

## E1. ACR Appropriateness Criteria — Acute Hand and Wrist Trauma
- Topic: Acute Hand and Wrist Trauma
- 핵심:
  - 급성 blunt/penetrating hand/wrist trauma의 초기 영상은 radiography가 usually appropriate.
  - initial radiographs가 negative/equivocal인데 임상적으로 손상이 의심되면 repeat radiographs 10–14 days, MRI without contrast, 또는 CT without contrast가 usually appropriate.
  - fracture가 확인되고 tendon/ligament injury가 의심되면 US/MRI/MR arthrography 등이 다음 검사로 적절할 수 있음.
- WRIST_HAND_V1 적용:
  - Tablet이 fracture rule을 자동 확정하지 않는다.
  - trauma + marked functional loss / deformity / focal high-risk pattern은 clinician review + imaging consideration으로 연결.
  - occult scaphoid concern은 “X-ray 음성=배제”로 처리하지 않음.

## E2. ACR Appropriateness Criteria — Chronic Hand and Wrist Pain (Revised 2023)
- 핵심:
  - chronic hand/wrist pain의 initial imaging은 radiography area of interest가 usually appropriate.
  - chronic wrist pain에서 radiographs가 normal/nonspecific이면 MRI without contrast 또는 MR arthrography가 usually appropriate.
  - old scaphoid fracture에서 nonunion/malunion/osteonecrosis/post-traumatic OA 평가 시 MRI/CT가 중요.
- 적용:
  - chronic phenotype은 tablet diagnosis가 아니라 location/load/neurologic/mechanical pattern 수집까지.
  - persistent mechanical symptoms / ROM block / post-traumatic chronic pain은 selective imaging escalation 후보.

## E3. AAOS 2024 — Management of Carpal Tunnel Syndrome CPG
- Published/Adopted: 2024
- scope: adult patients with complaints attributable to CTS; diagnosis/treatment guidance.
- 적용:
  - median-distribution sensory symptoms만으로 확진하지 않음.
  - progressive weakness / thenar wasting / dropping objects는 단순 stable sensory phenotype과 분리.
  - patient-reported pattern은 `CARPAL_TUNNEL_PATTERN_CONSIDER`; objective motor deficit는 clinician confirmation.

## E4. AAOS/ASSH 2020–2021 — Management of Distal Radius Fractures CPG
- 성인 acute distal radius fracture 치료를 다룸.
- 적용:
  - acute trauma + wrist deformity/major function loss는 fracture pathway.
  - Tablet이 alignment/operative criteria를 계산하지 않음.
  - 치료·수술 적응 자동화 금지.

## E5. de Quervain tenosynovitis — 2023 Systematic Review & Network Meta-analysis
- Challoumas et al., JAMA Network Open 2023
- PMID 37889490, DOI 10.1001/jamanetworkopen.2023.37001
- 적용:
  - radial wrist/thumb-side load pattern은 phenotype support.
  - Finkelstein/Eichhoff 등 clinician-side provocative test를 단독 확진으로 사용하지 않음.
  - Tablet은 radial styloid/thumb-side pain + lifting/gripping/thumb motion pattern까지만.

## E6. Pyogenic flexor tenosynovitis / deep hand infection
- Draeger & Bynum, JAAOS 2012, PMID 22661567
- Hyatt & Bagg, Orthop Clin North Am 2017, PMID 28336044
- recent review: PFT can rapidly threaten tendon/digit function; timely diagnosis/treatment important.
- Kanavel signs are clinician exam concepts: flexor sheath tenderness, flexed resting posture, pain with passive extension, fusiform swelling.
- 적용:
  - Tablet에서 Kanavel score 자동화 금지.
  - penetrating injury + rapidly worsening swollen painful finger / severe pain on straightening / systemic illness는 urgent infection pathway 후보.

## E7. Hand infection imaging/review literature
- Patel et al., Radiographics 2014, PMID 25384296
- deep-space infection, septic arthritis, osteomyelitis, flexor tenosynovitis 등 hand infection의 morbidity가 큼.
- 적용:
  - rapidly spreading redness/swelling, systemic illness, purulent/open wound, severe finger infection pattern은 routine MSK pathway보다 우선.

---

# 3. v1 scope

## Included
1. acute hand/wrist fracture-dislocation concern
2. occult scaphoid / carpal fracture concern after trauma
3. distal radius fracture concern
4. acute tendon injury / laceration with loss of active motion
5. neurovascular compromise after trauma
6. pyogenic flexor tenosynovitis / deep hand infection concern
7. septic wrist/hand joint or rapidly spreading soft-tissue infection concern
8. carpal tunnel / median neuropathy pattern
9. ulnar neuropathy at wrist/hand differential
10. de Quervain / radial styloid tendon pattern
11. trigger finger / stenosing flexor tenosynovitis pattern
12. thumb CMC / degenerative hand-wrist pattern
13. TFCC / ulnar-sided wrist mechanical-load pattern
14. ganglion / localized mass as nonurgent differential
15. cervical/proximal referred contribution
16. inflammatory/systemic multi-joint alternative

## Explicitly excluded from v1
- pediatric hand/wrist trauma
- post-op hand therapy protocols
- fracture classification automation
- operative indication automation
- tendon tear percentage automation
- CTS severity grade automation based solely on questionnaire
- electrodiagnostic interpretation automation
- rheumatoid/inflammatory arthritis diagnosis scoring
- Dupuytren disease detailed staging
- complex regional pain syndrome auto-diagnosis
- sports return-to-play protocols

---

# 4. Proposed clinical architecture

```text
Core global safety
→ existing arm_hand region discriminator
→ Trauma / deformity / distal NV
→ Open wound / tendon-function loss
→ Infection / hot-red-swollen / rapidly spreading / flexor-sheath pattern
→ Occult fracture / scaphoid-risk pattern
→ Progressive neurologic deficit
→ True mechanical lock / fixed ROM loss
→ Location + load + sensory pattern
→ selective clinician exam
→ hypotheses
→ management / exercise
→ reassessment
```

Safety first. Phenotype questions cannot hide protected safety.

---

# 5. Candidate safety contract

Candidate status:

```text
wrist_hand_safety_status:
CLEAR
REVIEW_REQUIRED
URGENT_REVIEW
```

Candidate clinician-facing flags:

```text
fracture_imaging_consider
expedited_referral_consider
neuro_assessment_required
infection_assessment_required
tendon_injury_assessment_required
```

Flags are not additional safety tiers.

---

# 6. Safety hypotheses / escalation candidates

## 6.1 Acute deformity / neurovascular compromise
Patient-facing concepts:
- obvious wrist/hand/finger deformity or joint still out
- hand/fingers suddenly cold, pale, blue
- sudden major new loss of distal sensation or motor function after injury

Candidate:
- concrete positive → `URGENT_REVIEW`
- hypothesis: `MUST_EXCLUDE_FRACTURE_DISLOCATION_OR_NEUROVASCULAR_INJURY`
- unknown/missing/malformed protected safety → never CLEAR

## 6.2 Acute trauma + major functional loss
Concepts:
- fall/direct blow/twist/crush/penetrating trauma
- after injury cannot meaningfully grip/use wrist/hand/finger

Candidate:
- trauma + marked function loss → `REVIEW_REQUIRED + fracture_imaging_consider`
- no auto diagnosis

## 6.3 Occult scaphoid/carpal fracture concern
Clinical issue:
- radiograph can be initially negative/equivocal in acute suspected hand/wrist trauma; ACR supports repeat radiographs 10–14 days, MRI, or CT as appropriate next studies.

Tablet candidate:
- fall onto hand / acute trauma
- radial-sided wrist/thumb-base pain after trauma
- persistent marked pain despite initial normal X-ray (if patient knows)

Candidate:
- `REVIEW_REQUIRED + fracture_imaging_consider`
- do not ask patient to self-palpate anatomical snuffbox as a diagnostic test
- clinician side: snuffbox/scaphoid tubercle tenderness + axial thumb load only as part of assessment, not single-test diagnosis
- hypothesis: `MUST_EXCLUDE_OCCULT_SCAPHOID_OR_CARPAL_FRACTURE`

## 6.4 Open wound / tendon injury
Concepts:
- cut/penetrating wound across wrist/hand/finger
- after wound, inability to actively bend or straighten a finger/thumb

Candidate:
- major active-motion loss after laceration/penetration → `REVIEW_REQUIRED + expedited_referral_consider + tendon_injury_assessment_required`
- if associated uncontrolled bleeding / gross NV compromise / severe open injury → URGENT through global/trauma pathway
- hypothesis: `MUST_EXCLUDE_FLEXOR_OR_EXTENSOR_TENDON_INJURY`

## 6.5 Infection / pyogenic flexor tenosynovitis
Candidate red flags:
- rapidly increasing redness/swelling
- hot, severely painful hand/wrist/finger + fever/chills/systemic illness
- penetrating wound/bite + worsening swelling/pain
- finger diffusely swollen, tends to stay flexed, severe pain when straightening

Candidate:
- systemic illness OR rapidly spreading infection pattern → `URGENT_REVIEW + infection_assessment_required`
- flexor-sheath infection pattern after penetrating injury → `URGENT_REVIEW + infection_assessment_required`
- localized stable superficial swelling without systemic/rapid progression → `REVIEW_REQUIRED` candidate
- hypothesis: `MUST_EXCLUDE_DEEP_HAND_INFECTION_OR_PYOGENIC_FLEXOR_TENOSYNOVITIS`

Important:
- Tablet does not count Kanavel signs as a diagnostic score.
- passive extension pain/tenderness are clinician-side if not safely self-reported.

## 6.6 Progressive median/ulnar motor deficit
Stable sensory phenotype:
- thumb/index/middle sensory symptoms → CTS/median pattern support
- ring/small finger symptoms → ulnar pattern support

High-priority progression concepts:
- newly worsening grip/pinch weakness
- dropping objects
- visible thenar/interosseous wasting
- loss of thumb opposition or finger ab/adduction function

Candidate:
- stable sensory-only → `CONSIDER` only, not automatic safety REVIEW
- progressive motor deficit / visible wasting → `REVIEW_REQUIRED + neuro_assessment_required + expedited_referral_consider`
- uncertain progression while sensory symptoms positive → fail-closed candidate similar ELBOW E5; Opus decision required

## 6.7 True mechanical lock / fixed motion block
Examples:
- wrist/finger actually locks/catches or cannot move through range because mechanically blocked, not merely painful
- trigger finger locking may be common/nonurgent, while post-traumatic fixed block may need higher priority

Proposed distinction:
- finger triggering/catching that releases → phenotype (`TRIGGER_FINGER_PATTERN_CONSIDER`), no automatic expedited referral
- fixed post-traumatic mechanical block / unreduced joint / persistent inability to move → REVIEW or URGENT depending deformity/NV

This distinction requires Opus closure.

---

# 7. Nonurgent phenotype / differential matrix

## 7.1 Carpal tunnel / median neuropathy
Support:
- thumb/index/middle ± radial half ring finger tingling/numbness
- nocturnal symptoms
- symptoms with prolonged wrist position / repetitive hand use
- dropping objects/weakness changes priority only if progressive/objective concern

Hypothesis:
- `CARPAL_TUNNEL_OR_MEDIAN_NEUROPATHY`

Clinician exam candidates:
- median sensory distribution
- thenar strength/atrophy
- provocative tests as adjunct
- cervical/proximal differential
- EDX/US only when clinically indicated; no automatic questionnaire diagnosis

## 7.2 Ulnar neuropathy at wrist/hand
Support:
- ring/small finger sensory symptoms
- hand intrinsic weakness pattern
- distinguish from ELBOW cubital tunnel and cervical source

Hypothesis:
- `ULNAR_NEUROPATHY_WRIST_HAND`

## 7.3 de Quervain / radial wrist tendon pattern
Support:
- radial styloid/thumb-side pain
- thumb movement, lifting/carrying, gripping aggravation

Hypothesis:
- `DE_QUERVAIN_RADIAL_TENDON_PATTERN`

Clinician:
- palpation and provocative maneuvers adjunct only

## 7.4 Trigger finger
Support:
- finger/thumb catching, clicking, locking during flexion/extension
- morning stiffness/catching

Hypothesis:
- `TRIGGER_FINGER_PATTERN`

Safety distinction:
- ordinary trigger/catching ≠ traumatic fixed mechanical block

## 7.5 Thumb CMC / degenerative hand-wrist pattern
Support:
- thumb-base pain
- pinch/grip/load pattern
- chronic course

Hypothesis:
- `THUMB_CMC_OR_DEGENERATIVE_PATTERN`

No X-ray finding = symptom severity assumption.

## 7.6 TFCC / ulnar-sided wrist pattern
Support:
- ulnar-sided wrist pain
- rotation, gripping, weight-bearing through wrist
- clicking/mechanical symptoms

Hypothesis:
- `ULNAR_SIDED_WRIST_TFCC_OR_MECHANICAL_PATTERN`

No tablet structural diagnosis.

## 7.7 Ganglion / localized mass
Support:
- localized lump that changes size
- mechanical discomfort

Hypothesis:
- `GANGLION_OR_LOCALIZED_MASS_CONSIDER`

Red flags if rapidly enlarging, inflamed, neurologic compromise, atypical systemic features → clinician review.

## 7.8 Referred/systemic alternative
- neck/shoulder symptoms, multi-level sensory changes
- bilateral/multi-joint inflammatory pattern
- prolonged morning stiffness / multiple swollen joints

Hypotheses:
- `REFERRED_OR_PROXIMAL_SOURCE`
- `SYSTEMIC_OR_INFLAMMATORY_CONTRIBUTION`

---

# 8. Selective clinician exam — patient tablet에서 생성 금지

Base:
- inspection: deformity, swelling, wound, skin change
- wrist AROM/PROM flex/ext/radial-ulnar deviation
- forearm pronation/supination if relevant
- finger/thumb active motion
- grip/pinch functional assessment
- distal perfusion + median/ulnar/radial sensory/motor when trauma/neuro concern

Trauma/fracture selective:
- distal radius/ulna bony tenderness
- scaphoid/snuffbox/scaphoid tubercle assessment
- carpal alignment / finger rotation / joint stability as indicated

Tendon selective:
- isolated flexor/extensor tendon function
- tenodesis cascade if appropriate

Neuro selective:
- thenar/intrinsic strength, opposition/abduction
- sensory distribution
- proximal/cervical differential

Infection selective:
- wound entry point
- erythema spread
- fluctuance
- flexor sheath tenderness
- pain with passive extension
- fusiform swelling

Prohibited:
- patient answer alone → O objective finding
- Finkelstein/Tinel/Phalen/Kanavel single finding = diagnosis
- MRI/X-ray finding = symptom source certainty

---

# 9. Reassessment candidates

Every visit:
- Pain NRS
- Target Function 0–10

Conditional:
- grip/pinch tolerance
- wrist/finger ROM
- swelling
- locking/catching frequency
- sensory distribution
- weakness/dropping objects
- wound/infection progression

Response states remain:

```text
RESPONDING
PARTIAL_RESPONSE
NON_RESPONSE
DETERIORATION
DISCHARGE
```

`DETERIORATION` → safety/diagnosis/referral reassessment.

---

# 10. Exercise/management contract candidate

Not diagnosis → exercise automatic mapping.

Inputs:
- target function
- irritability
- ROM/movement response
- load tolerance
- objective strength when measured
- neurologic status
- safety
- patient goal

OS output:
- candidate 2–3
- clinician approve/remove/replace
- final 1–2

Possible domains after safety CLEAR:
- wrist ROM/graded loading
- grip/pinch capacity
- thumb tendon graded loading
- tendon-gliding/nerve-gliding only when clinically appropriate
- proximal/scapular support when relevant
- graded task exposure

No routine exercise recommendation if safety != CLEAR.

---

# 11. OPEN Opus decisions — W1 to W10

## W1 — Region routing boundary
Existing shared router values:
`ELBOW / FOREARM / WRIST_HAND / DIFFUSE_OR_MULTIPLE / UNKNOWN`.

Proposed WRIST/HAND protected safety exposure options:

A. `WRIST_HAND / DIFFUSE_OR_MULTIPLE / UNKNOWN` only
B. `FOREARM / WRIST_HAND / DIFFUSE_OR_MULTIPLE / UNKNOWN`

Rationale for B: distal radius/wrist trauma may be perceived as distal forearm; avoids boundary fail-open, but duplicates some ELBOW safety in FOREARM.

**Opus decision required: A vs B.**

## W2 — Acute deformity / NV tier
Proposed:
- gross deformity / still-out joint / cold-pale-blue digits / major acute distal sensory-motor loss → `URGENT_REVIEW`
- unknown/missing protected response → at least REVIEW_REQUIRED

Confirm.

## W3 — Occult scaphoid/carpal fracture
Proposed:
- trauma + radial-sided wrist/thumb-base pain or persistent severe wrist pain after negative/equivocal initial radiograph → `REVIEW_REQUIRED + fracture_imaging_consider`
- no auto URGENT without deformity/NV/open injury

Confirm threshold and whether “initial X-ray reportedly normal” should be a patient-facing branch or clinician history only.

## W4 — Laceration/penetration + tendon-function loss
Proposed:
- inability to actively bend/straighten digit/thumb after laceration → `REVIEW_REQUIRED + expedited_referral_consider + tendon_injury_assessment_required`
- not automatic URGENT unless major open injury/bleeding/NV compromise

Confirm.

## W5 — Deep infection / flexor tenosynovitis tier
Proposed:
- fever/systemic illness OR rapidly spreading redness/swelling → URGENT
- penetrating wound/bite + rapidly worsening swollen painful finger with severe pain on straightening / flexed resting posture → URGENT
- localized stable superficial swelling without systemic/rapid progression → REVIEW

Confirm and decide whether bite wound itself should trigger REVIEW even before infection signs.

## W6 — Median/ulnar neuropathy calibration
Proposed:
- stable sensory-only pattern → CONSIDER only
- progressive weakness/dropping objects/visible wasting → REVIEW + neuro + expedited
- sensory positive + progression UNKNOWN/missing → REVIEW + neuro + expedited fail-closed

Confirm whether CTS/ulnar wrist share same progressive-motor threshold.

## W7 — Mechanical lock distinction
Proposed:
- ordinary trigger finger catching/locking that releases → phenotype only
- fixed post-traumatic joint block or unreduced joint → REVIEW/URGENT through trauma/deformity pathway

Confirm no blanket `mechanical lock = expedited` rule for WRIST_HAND because trigger finger is common/nonurgent.

## W8 — Infection question burden
Should septic wrist/hand joint and flexor-sheath/deep infection be:
- separate protected questions (clear semantics, more burden), or
- one infection gate + targeted follow-up (lower burden)?

Preferred candidate: one broad infection gate + targeted flexor-sheath follow-up when finger pattern/penetration present.

## W9 — Referred/systemic screen
Proposed:
- do not reuse NECK question array
- use minimal wrist/hand-specific proximal/multi-joint screen
- no cardiac screen duplicated here unless Core already handles global chest/breathing safety adequately; unlike elbow/shoulder, isolated wrist/hand pain is a low-yield cardiac referred site.

Opus decision: confirm no WRIST/HAND-specific cardiac screen, with Core global safety passthrough retained.

## W10 — Fail-closed semantics
Protected safety:
- UNKNOWN != NO
- missing != NO
- malformed != NONE
- empty multi-select != NONE
- positive + NONE/UNKNOWN mixed → invalid → minimum REVIEW_REQUIRED

Optional phenotype missing does not escalate safety.

Confirm.

---

# 12. Proposed hypothesis enums

MUST_EXCLUDE:

```text
MUST_EXCLUDE_FRACTURE_DISLOCATION_OR_NEUROVASCULAR_INJURY
MUST_EXCLUDE_OCCULT_SCAPHOID_OR_CARPAL_FRACTURE
MUST_EXCLUDE_FLEXOR_OR_EXTENSOR_TENDON_INJURY
MUST_EXCLUDE_DEEP_HAND_INFECTION_OR_PYOGENIC_FLEXOR_TENOSYNOVITIS
MUST_EXCLUDE_PROGRESSIVE_MEDIAN_OR_ULNAR_NEUROPATHY
```

Supportive/differential:

```text
CARPAL_TUNNEL_OR_MEDIAN_NEUROPATHY
ULNAR_NEUROPATHY_WRIST_HAND
DE_QUERVAIN_RADIAL_TENDON_PATTERN
TRIGGER_FINGER_PATTERN
THUMB_CMC_OR_DEGENERATIVE_PATTERN
ULNAR_SIDED_WRIST_TFCC_OR_MECHANICAL_PATTERN
GANGLION_OR_LOCALIZED_MASS_CONSIDER
REFERRED_OR_PROXIMAL_SOURCE
SYSTEMIC_OR_INFLAMMATORY_CONTRIBUTION
```

States stay:

```text
MUST_EXCLUDE
HIGHER_SUPPORT
CONSIDER
LOWER_SUPPORT
```

---

# 13. Evidence-to-design rules

1. ACR imaging criteria support imaging escalation, not diagnosis automation.
2. AAOS CTS guideline supports evidence-based CTS evaluation, not questionnaire-only diagnosis.
3. Acute tendon laceration, deep infection, neurovascular compromise are time-sensitive clinician pathways.
4. de Quervain/trigger/TFCC/CMC are pattern-level hypotheses on tablet.
5. Objective exam remains clinician-confirmed only.
6. Safety protected questions cannot be suppressed for fatigue.
7. Existing frozen modules LBP/NECK/SHOULDER/KNEE/ELBOW remain untouched unless a demonstrated safety regression exists.

---

# 14. Review output required

Opus should review **W1–W10 only** and create:

`docs/WRIST_HAND_V1_Opus_Clinical_Review_v0.1.md`

Final verdict exactly one:

```text
PASS / CLINICAL DECISIONS CLOSED
```

or

```text
CLINICAL DECISION REQUIRED
```

If decision required, each finding must include:
- current problem
- safety impact
- minimal required fix
- no implementation/style expansion

**Tablet Question Set / Fable integration / TypeScript/UI/tests are blocked until this review gate is resolved.**
