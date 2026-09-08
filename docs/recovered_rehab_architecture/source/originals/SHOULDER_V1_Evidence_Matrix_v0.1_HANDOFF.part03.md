태블릿만으로 자동 확정하지 않는다.

---

# 9. Imaging Principle

## Uncomplicated suspected RC tendinopathy
2025 JOSPT CPG:
- 초기 관리에서 영상검사로 RC tendinopathy를 확인하려 하지 않음
- 적절한 비수술 관리에도 개선되지 않으면 최대 약 12주 시점에서 imaging/specialist assessment 고려 가능

## Acute trauma
ACR 2024:
- fracture/dislocation/acute cuff tear/labral concern에 따라 영상 선택이 달라짐
- SHOULDER tablet이 영상검사를 자동처방하지 않음

## Frozen shoulder / OA
- clinical pattern + 필요 시 plain radiography 등으로 다른 bony/mechanical disorder를 배제/확인
- 영상결과를 증상 원인으로 자동 귀속하지 않음

---

# 10. Exercise / Rehabilitation Architecture

SHOULDER_V1도 기존 원칙 유지:

**Clinical OS 후보 2–3개 → 원장 승인/삭제/교체 → 최종 1–2개**

## 입력
- target function
- irritability
- active vs passive ROM
- strength
- load response
- instability
- movement-control
- patient goal
- safety

## Domain
- education / activity-load modification
- mobility
- rotator-cuff resistance
- scapular motor control / endurance
- kinetic-chain integration
- overhead graded exposure
- instability/stability control
- functional reaching/lifting tolerance

## RC-related
2025 CPG를 따라 active rehabilitation을 중심으로 하되:
- motor control
- resistance exercise
- various loads
중 환자 반응과 기능에 따라 선택.

## Frozen shoulder
- phase/irritability와 통증반응에 맞춘 mobility
- “세게 늘릴수록 좋다” 금지

## Instability
- passive stretching 중심이 아니라 control/stability/graded function을 우선 고려

## 금지
- “회전근개 = 밴드 외회전” 자동처방
- “오십견 = 무조건 강한 ROM”
- “충돌증후군 = 견봉 공간을 넓히는 운동” 같은 단순 구조기전 설명
- safety review 전에 routine exercise progression

---

# 11. Reassessment

모든 재진:
1. Pain NRS
2. Target Function 0–10

조건부:
- active elevation / target ROM
- passive ER or global PROM when mobility deficit
- strength/load tolerance when RC phenotype
- instability/subluxation episodes
- distal neuro change
- night pain은 보조적 증상 추적이며 단독 safety marker가 아님

Response state:
- `RESPONDING`
- `PARTIAL_RESPONSE`
- `NON_RESPONSE`
- `DETERIORATION`
- `DISCHARGE`

`DETERIORATION`
→ safety / diagnosis / referral reassessment.

---

# 12. Evidence → Claim Mapping

| Source | Supports | Do not over-extend |
|---|---|---|
| Desmeules 2025 JOSPT RC CPG | RC assessment, ROM/strength measurement, initial no-routine-imaging, active rehab, 12wk escalation context | full-thickness traumatic tear/surgery decisions |
| AAOS 2025 RC Injury CPG | adult RC injury/full-thickness tear management evidence | tablet diagnosis automation |
| BESS 2025 Subacromial Pain | modern subacromial pain pathway; terminology heterogeneity | one structural cause for all “impingement” pain |
| Lee et al 2025 Frozen Shoulder CPG | primary frozen shoulder clinical diagnosis/nonsurgical management | OA or secondary frozen shoulder automatically |
| BESS/BOA Shoulder Pain guideline | urgent shoulder red flags, primary-care differential | local Korean referral timing verbatim |
| ACR Acute Shoulder Pain 2024 | imaging context after acute injury | automatic imaging ordering |
| AHA/ACC Chest Pain 2021 | shoulder/arm discomfort can be anginal equivalent | every left shoulder pain as cardiac |
| BESS instability pathways | traumatic vs atraumatic instability framework | acute unreduced dislocation provocative testing |

---

# 13. Opus가 이번 단계에서 판정할 임상결정

Evidence Matrix 단계에서 아래만 닫는다.

## S1. Safety severity mapping
다음을 앱의 `URGENT_REVIEW`로 직접 인터럽트할지:
- suspected infection
- unreduced traumatic dislocation
- possible fracture with neurovascular concern
- acute cardiac/non-MSK emergency pattern

그리고 acute traumatic cuff tear는:
- `URGENT_REVIEW`
vs
- `REVIEW_REQUIRED + EXPEDITED_REFERRAL`
중 어떤 semantics가 적절한가?

## S2. Systemic inflammatory / PMR gate
어깨 모듈에서 어느 수준까지 tablet safety로 받을지,
원장 history로 남길지를 결정.

## S3. Cervical reuse
distal neuro / neck-linked symptom이 있는 shoulder 환자에서
NECK_V1 safety engine을 재사용하는 구조가 임상적으로 타당한지 확인.

## S4. Passive ROM discriminator
`active + passive global restriction`, 특히 passive ER 제한을
frozen shoulder/OA support로 사용하되 확진하지 않는 calibration이 적절한지 확인.

## S5. RC diagnostic calibration
painful arc / Hawkins-Kennedy / strength test를
단일 확진이 아닌 support/contradiction으로만 쓰는 것이 적절한지 확인.

## S6. Instability scope
traumatic/atraumatic instability를 SHOULDER_V1 안에 포함하되
acute dislocation safety와 만성/recurrent instability rehabilitation을 분리하는 구조가 적절한지 확인.

## S7. Non-MSK referred pain
cardiac/referred-pain safety를 Common Core가 아니라 SHOULDER module에서
어느 정도 중복 보호할지 결정.

---

# 14. Gate

현재:

```text
