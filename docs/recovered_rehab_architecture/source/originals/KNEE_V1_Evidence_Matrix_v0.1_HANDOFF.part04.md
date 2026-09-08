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

---

# 14. Opus Clinical Review — 이번 단계에서 닫을 질문

## K1. Septic knee severity
SHOULDER의 infection과 동일하게:
- hot/swollen joint + systemic/infection pattern
을 `URGENT_REVIEW` real-time interrupt로 둘지.

## K2. Trauma severity
다음을 구분하는 구조가 적절한지:
- gross deformity / distal neurovascular compromise
  → `URGENT_REVIEW`
- trauma + inability weight-bear / fracture concern
  → `REVIEW_REQUIRED + fracture_imaging_consider`

spontaneously reduced knee dislocation/multiligament injury를 놓치지 않기 위해
추가 patient discriminator가 필요한지.

## K3. Extensor mechanism
acute trauma + inability active extension/SLR concern을:
- `URGENT_REVIEW`
vs
- `REVIEW_REQUIRED + expedited_referral_consider`
중 어느 tier로 둘지.

## K4. True locked knee
true mechanical extension block을:
- 일반 REVIEW
vs
- `REVIEW_REQUIRED + expedited_referral_consider`
로 둘지.

## K5. DVT safety
tablet에서:
- unilateral calf/leg swelling + risk context까지만 수집하고
- Wells는 clinician-side로 둘지

또한 DVT concern의 상태를:
- `URGENT_REVIEW`
vs
- `REVIEW_REQUIRED + dvt_assessment_required`
로 둘지.

## K6. OA clinical pattern
NICE의 age>=45 + activity pain + morning stiffness <=30min을
`HIGHER_SUPPORT`에만 사용하고 자동확진하지 않는 calibration이 적절한지.

## K7. Meniscus
AAOS 2024 acute isolated CPG를 acute branch에만 제한하고,
degenerative meniscus를 별도 phenotype으로 분리한 것이 적절한지.

## K8. PFP / tendon scope
PFP와 patellar tendinopathy를 KNEE_V1에 포함하되,
환자 태블릿에서는 location/load behavior만 수집하고
구체 진단은 clinician exam으로 남기는 것이 적절한지.

## K9. Referred hip/lumbar contribution
KNEE 환자에서 hip/lumbar referred screen을 어느 정도 common safety/phenotype로 재사용할지,
별도 KNEE용 중복 문항을 만들지 않을지 검토.

---

# 15. Gate

현재:

```text
LBP_V1       PASS / FROZEN + Opus audit PASS
NECK_V1      PASS / FROZEN
SHOULDER_V1  PASS / FROZEN

KNEE_V1 Evidence Matrix v0.1: COMPLETE
Clinical decisions: OPEN — Opus review required
Tablet Question Set: NOT STARTED
Code implementation: NOT STARTED
```

다음 단일 과제:

> **Opus clinical review of KNEE_V1 Evidence Matrix v0.1**

결과가 나오면 그 clinical decisions를 반영해
**KNEE_V1 Tablet Question Set v0.1**로 진행한다.
