# Samindang LBP_V1 — Evidence Matrix v1.0

기준일: 2026-08-24  
용도: 태블릿 LBP micro-module + clinician exam selector + hypothesis model의 근거 추적.

## 1. Safety / serious pathology

| 설계 요소 | 근거 | 구현 결정 |
|---|---|---|
| 대체진단/serious pathology screen | NICE NG59: LBP 평가에서 cancer, infection, trauma, inflammatory disease 등 alternative diagnosis 고려. 비전문의 환경 routine imaging은 권고하지 않음. | 태블릿은 진단 대신 risk flag만 생성. Safety positive/uncertain이면 routine recommender 잠금. |
| CES | NICE NG127 1.7.3: severe LBP radiating leg pain + new bladder/bowel/sexual disturbance 또는 new perineal numbness는 즉시 CES assessment. VA/DoD 2022도 urinary retention/incontinence, saddle anesthesia, severe/progressive LE deficit 등을 red flag로 제시. | `lbp_ces_screen`은 required + critical. Positive=URGENT_REVIEW, UNKNOWN=REVIEW_REQUIRED. |
| fracture/infection/malignancy context | VA/DoD 2022 red flag table + NICE NG59 alternative diagnosis framework. | Core의 cancer/osteoporosis를 재활용하고, LBP에서는 current infection/fever, long steroid/immunosuppression, unexplained weight loss를 추가. Trauma는 Core onset_pattern이 미상일 때만 fallback 질문. |

## 2. Leg symptoms / radicular hypothesis

- 환자 보고 `SUBJECTIVE_WEAKNESS`는 객관적 motor deficit과 분리한다.
- distal symptoms / paresthesia / numbness는 clinician-facing `RADICULAR_INVOLVEMENT: CONSIDER`를 올릴 수 있으나 진단 확정은 하지 않는다.
- 객관적 motor/sensory/reflex + concordant neurodynamic 결과를 원장 단계에서 추가한다.
- 단일 SLR 양성만으로 disc/radiculopathy를 확정하지 않는다.

## 3. Neurogenic claudication hypothesis

근거:
- LSS clinical syndrome에서 walking/standing provocation, sitting 또는 flexion relief가 유용한 history feature로 반복 보고됨.
- JAMA systematic review: seated pain absence, flexion improvement, bilateral symptoms, neurogenic claudication 등이 likelihood를 높임.
- International Delphi: leg/buttock pain while walking, flexion relief, shopping-cart/bicycle relief, sensory/motor disturbance while walking 등이 핵심 history item.

구현:
- 다리/둔부 증상이 있는 환자에게만 walking/standing aggravation 질문.
- YES일 때만 sitting/flexion relief 질문.
- 결과는 `NEUROGENIC_CLAUDICATION_PATTERN: CONSIDER/HIGHER_SUPPORT` 보조자료이며 태블릿 진단명으로 노출하지 않는다.

## 4. Inflammatory back pain / axial SpA screen

NICE NG65 1.1.5:
- LBP onset <45세 + duration >3개월이 전제.
- second-half-of-night waking, buttock pain, improvement with movement, rapid NSAID response, family history, arthritis, enthesitis, psoriasis 등 추가 기준.

구현:
- `M3_PLUS`에서 onset-before-45 가능성을 확인.
- eligible일 때만 1개 multi-choice screen 노출.
- criteria count는 clinician review용으로만 사용하고 환자에게 진단명/확률을 표시하지 않는다.

## 5. SIJ contribution

Saueressig et al., JOSPT 2021 meta-analysis (PMID 34210160):
- SIJ provocation cluster LR+ 약 2.13, LR- 약 0.33; evidence certainty 매우 낮음.

구현:
- 태블릿에서 SIJ를 별도 진단 분기하지 않는다.
- 원장이 임상적으로 의심할 때 provocation cluster를 선택적으로 시행.
- positive cluster도 `SIJ_CONTRIBUTION: CONSIDER` 이상으로 자동 확정하지 않는다.

## 6. Exercise / activity

JOSPT 2021 LBP CPG (PMID 34719942):
- chronic LBP에서 trunk strengthening/endurance, specific trunk activation, aerobic/general exercise 등 여러 형태의 운동을 지지.
- 하나의 운동 유형을 모든 환자에게 일률 적용하는 구조는 근거와 맞지 않음.

NICE NG59:
- self-management, normal activity 지속 권고.
- exercise 선택 시 개인의 needs/preferences/capabilities 고려.

구현:
- `diagnosis -> exercise` 직접 매핑 금지.
- `target function + irritability + movement response + neuro status + patient goal`로 2~3개 후보를 rank.
- 원장이 승인/교체한 뒤 환자에게 1~2개 제공.

## 7. Primary references

1. NICE. Low back pain and sciatica in over 16s: assessment and management (NG59). https://www.nice.org.uk/guidance/ng59/chapter/recommendations
2. VA/DoD. Clinical Practice Guideline for the Diagnosis and Treatment of Low Back Pain (2022). https://www.healthquality.va.gov/guidelines/Pain/lbp/index.asp
3. NICE. Suspected neurological conditions: recognition and referral (NG127), recommendation 1.7.3. https://www.nice.org.uk/guidance/ng127/chapter/Recommendations-for-adults-aged-over-16
4. NICE. Spondyloarthritis in over 16s: diagnosis and management (NG65), recommendation 1.1.5. https://www.nice.org.uk/guidance/ng65/chapter/Recommendations
5. George SZ, et al. Interventions for the Management of Acute and Chronic Low Back Pain: Revision 2021. J Orthop Sports Phys Ther. 2021;51(11):CPG1-CPG60. PMID: 34719942.
6. Saueressig T, et al. Diagnostic Accuracy of Clusters of Pain Provocation Tests for Detecting Sacroiliac Joint Pain. J Orthop Sports Phys Ther. 2021;51(9):422-431. PMID: 34210160.
7. Suri P, et al. Does this older adult with lower extremity pain have the clinical syndrome of lumbar spinal stenosis? JAMA. 2010. PMID: 21156951.
8. Tomkins-Lane C, et al. Consensus on the Clinical Diagnosis of Lumbar Spinal Stenosis. Spine. 2016. PMID: 26839989.

## 8. Evidence scope warning

이 문서는 clinician decision support 설계를 위한 근거 추적표다. 개별 문항 또는 검사 하나를 진단 확정 규칙으로 사용하지 않는다. 실제 진료에서 red flag 양성/불확실, 진행성 신경학적 결손, 감염/암/골절 등 specific pathology가 의심되면 자동 추천보다 임상평가와 적절한 의뢰/검사가 우선한다.
