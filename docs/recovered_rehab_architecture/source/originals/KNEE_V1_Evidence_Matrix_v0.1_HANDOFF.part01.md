  민감도·특이도가 검사별/상황별로 다르고 완벽하지 않음.

본 모듈 적용:
- pivot/pop/rapid swelling/giving-way history + clinician exam 조합
- Lachman 하나로 자동확진 금지

## E5. Knee ligament rehabilitation — JOSPT 2017 CPG
**Logerstedt DS, et al. Knee Stability and Movement Coordination Impairments: Knee Ligament Sprain Revision 2017. JOSPT. PMID 29089004.**

적용:
- ligament sprain의 function / stability / movement-coordination 관점
- rehab progression 및 functional reassessment의 기반

## E6. Patellofemoral pain — JOSPT 2019 + BJSM 2024 Best Practice
**Willy RW, et al. Patellofemoral Pain. JOSPT 2019. PMID 31475628.**
**Neal BS, et al. Best practice guide for patellofemoral pain. BJSM 2024. PMID 39401870.**

핵심:
- anterior/peripatellar pain
- squat, stairs, running, jumping, prolonged sitting 등 patellofemoral loading에서 악화 가능
- treatment는 education + knee-targeted ± hip-targeted exercise를 중심
- adjunct는 환자 presentation에 맞춰 선택

본 모듈 적용:
- “연골연화증”/“슬개골 정렬 문제” 하나로 자동 구조설명 금지
- load-related anterior knee pain phenotype으로 다룸

## E7. Patellar tendinopathy — Dutch multidisciplinary guideline 2024
**Dutch multidisciplinary guideline on anterior knee pain: PFP and patellar tendinopathy. PMID 39045713.**

핵심:
- PFP/PT 모두 initial treatment는 exercise therapy
- PT에서 routine imaging의 추가가치는 제한적
- exercise 후 nonresponse 시 추가 치료 고려

본 모듈 적용:
- tendon pain = 무조건 휴식 금지
- load-tolerance 기반 progression
- imaging으로 tendon abnormality를 증상 원인으로 자동 귀속 금지

## E8. Acute fracture / imaging — ACR Acute Trauma to the Knee
ACR:
- acute fall/twisting trauma + focal tenderness, effusion 또는 inability to bear weight가 있으면 radiography가 초기 영상으로 적절
- Ottawa/Pittsburgh-type decision rules는 영상 필요성 판단에 도움
- gross deformity, unreliable exam, high fracture risk 등에서는 clinical judgment가 우선

본 모듈 적용:
- tablet이 Ottawa Knee Rule 전체를 자가판정하게 하지 않음
- trauma + weight-bearing failure / focal bony concern → clinician fracture assessment

## E9. Septic arthritis — SANJO 2023
**Ravn C, et al. Guideline for management of septic arthritis in native joints. 2023. PMID 36756304.**

적용:
- hot/swollen painful native joint + systemic/infection context는 routine MSK pathway보다 septic arthritis evaluation 우선
- patient self-report만으로 확진하지 않음

## E10. DVT — NICE NG158
DVT symptoms:
- swollen or painful leg
- clinical assessment 후 의심 시 2-level Wells score 사용

본 모듈 적용:
- unilateral calf/whole-leg swelling, DVT risk context를 knee pain으로 오인하지 않게 safety branch
- tablet에서 Wells score 전체를 자동 계산할지 여부는 Opus 검수 후 결정

## E11. Extensor mechanism rupture
2024 review:
- complete patellar tendon rupture는 acute overload 후 발생 가능
- inability to actively extend knee가 핵심 clinical clue
- complete rupture는 timely surgical repair가 중요

본 모듈 적용:
- acute trauma + inability straight-leg raise / active extension loss는 must-not-miss
- 단순 quadriceps weakness와 구분하도록 clinician objective confirmation 필요

---

# 3. Safety Architecture v0.1

제안 상태:

`knee_safety_status`
- `CLEAR`
- `REVIEW_REQUIRED`
- `URGENT_REVIEW`

별도 clinician-facing flag 후보:
- `expedited_referral_consider`
- `fracture_imaging_consider`
- `dvt_assessment_required`

정확한 severity tier는 Opus에서 닫는다.

---

## A. Septic arthritis / acute hot swollen joint

환자 후보:
- 갑자기 또는 빠르게 악화되는 무릎 통증
- 심한 부종
- 발적/열감
- 발열/오한/전신쇠약
- 최근 수술/관절주사/침습시술
- 면역억제

clinician:
- effusion / warmth / erythema
- active/passive ROM intolerance
- systemic status
- aspiration/lab/referral decision

제안:
`MUST_EXCLUDE_SEPTIC_ARTHRITIS`

**Opus 결정 필요:**
clear infection phenotype을 `URGENT_REVIEW` 실시간 인터럽트로 둘지.

---

## B. Major trauma / fracture / dislocation / neurovascular injury

환자 후보:
- fall/direct blow/twisting high-force trauma
- gross deformity
- inability to bear weight
- large rapid swelling
- distal numbness/weakness
- cold/pale foot

clinician:
- bony tenderness
- neurovascular status
- radiograph indication
- ligament/multiligament assessment after urgent pathology excluded

제안:
- deformity / cold-pale limb / major distal neurovascular change → `URGENT_REVIEW`
- trauma + inability to bear weight / focal bony tenderness concern → `REVIEW_REQUIRED + fracture_imaging_consider`

**중요:** spontaneously reduced knee dislocation / multiligament injury는 외형이 정상이어도 vascular risk가 있을 수 있어
“현재 변형 없음 = 안전”으로 처리하지 않는다.

---

## C. Extensor mechanism rupture concern

환자 후보:
- acute trauma / sudden eccentric load
- sudden anterior knee pain
- 이후 active knee extension 또는 straight-leg raise가 현저히 불가능

clinician:
- straight-leg raise
- active extension / extensor lag
- palpable tendon defect
- patellar position
- imaging/referral as needed

제안:
