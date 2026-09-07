# SHOULDER_V1 — Evidence Matrix v0.1 HANDOFF

작성일: 2026-08-25  
상태: **DRAFT — Evidence Matrix complete / clinical review required / tablet questions not yet started**  
대상: 삼인당 Clinical OS — MSK Shoulder module

> 핵심 원칙  
> **Safety → Pain/Function → Trauma/Instability → Active vs Passive ROM → Strength/Load response → Cervical/Non-shoulder contribution → Hypothesis → Selective Exam → Exercise/Management → Reassessment**
>
> 단일 이학검사로 진단 확정 금지.  
> 구조영상 소견을 증상의 원인으로 자동 확정 금지.  
> 운동은 진단명에 고정하지 않고 **기능 + irritability + ROM pattern + strength/load response + instability + safety + 목표**로 선택한다.

---

# 0. Model Orchestration — 필수 작업 규칙

## Opus — 임상·근거 검수자
역할:
- Evidence Matrix와 safety domain 검수
- 근거-주장 매핑 검토
- 누락/과잉탐지, 진단 과확정, 단일검사 오용 검출
- clinical decision sign-off

금지:
- 구현 세부를 임의로 재설계하지 않음
- `CLOSED`된 임상결정을 임의 변경하지 않음
- 불충분한 근거를 확정 cutoff/확률로 만들지 않음

출력:
- `PASS`
- `CLINICAL DECISION REQUIRED`

## Fable — 장기 통합 리드
**Opus clinical gate 통과 후에만 사용.**

역할:
- repo 전체 구조 audit
- Core / Tablet / Doctor / Sigma / SHOULDER module 통합 감독
- 최소 변경, 회귀 방지
- 모듈 경계 유지

금지:
- CLOSED clinical decision 재해석
- Shoulder 때문에 Core를 광범위하게 재작성
- LBP/NECK 로직에 불필요한 회귀 발생

## Sonnet — 구현 워커
역할:
- YAML / TypeScript / Python / UI / test 구현
- Fable이 정한 통합 범위 안에서 작업
- CLOSED safety semantics를 literal하게 포트

금지:
- 임상 결정 독자 변경
- fail-closed 완화
- 테스트를 우회해 PASS 만들기

권장 순서:

```text
Evidence Matrix
→ Opus clinical review
→ Tablet Question Set
→ Opus review
→ Clinical decisions CLOSED
→ Fable integration lead
→ Sonnet implementation
→ full regression
→ PASS / FROZEN
```

**현재는 코드 구현 단계가 아니다.**

---

# 1. Scope

SHOULDER_V1의 1차 목표는 “어깨 통증의 정확한 구조진단 자동화”가 아니다.

목표는:

1. 놓치면 안 되는 shoulder/non-shoulder safety를 먼저 분리
2. 환자에게 필요한 최소 정보를 태블릿에서 확보
3. 원장 진찰에서 **active vs passive ROM / strength / instability / cervical contribution**을 효율적으로 확인
4. 진단확률 대신 clinician hypothesis support를 제공
5. 기능·부하반응 기반 재활로 연결

주요 임상 phenotype:
- rotator cuff–related shoulder pain / RC tendinopathy spectrum
- acute traumatic rotator cuff tear concern
- adhesive capsulitis / frozen shoulder pattern
- glenohumeral OA pattern
- traumatic instability / recurrent instability
- atraumatic instability / movement-control deficit
- AC joint or other local contribution
- cervical / neurologic contribution
- systemic / referred non-MSK pain

### 현 repo routing 주의 — 임상결정 아님
현재 `PAIN_01 === 'neck_shoulder'`가 NECK_V1 진입 게이트로 사용되고 있으므로,
SHOULDER 실제 통합 때는 **목 우세 vs 어깨 우세를 구분하는 module sub-gate**가 필요할 가능성이 높다.

이 문제는 이번 Evidence Matrix에서 Core를 변경하지 않는다.
Fable 통합 단계에서 기존 NECK 회귀 없이 최소범위 routing을 설계한다.

---

# 2. Current high-value evidence base

## E1. Rotator cuff tendinopathy — 2025 JOSPT/APTA CPG
**Desmeules F, et al. Rotator Cuff Tendinopathy Diagnosis, Nonsurgical Medical Care, and Rehabilitation: A Clinical Practice Guideline. J Orthop Sports Phys Ther. 2025;55(4):235-274. PMID 40165544. DOI 10.2519/jospt.2025.13182.**

적용:
- suspected RC tendinopathy
- calcific RC tendinopathy
- partial-thickness tear 포함
- full-thickness tear는 이 CPG의 주 대상이 아님

핵심:
- comprehensive history + physical exam
- AROM/PROM 객관 측정
- shoulder strength 객관 측정 권고
- initial uncomplicated RC tendinopathy에서 영상으로 진단 확정하려 하지 않음
- appropriate nonsurgical care에도 개선이 없으면 최대 약 12주 시점에 imaging/specialist consideration
- active rehabilitation (motor-control / resistance training 포함 가능)을 초기 치료의 중심으로 권고
- painful arc / Hawkins-Kennedy 같은 검사는 보조적 진단 정보로 사용하되 전체 임상맥락 필요

## E2. Rotator cuff injuries — AAOS 2025
**AAOS. Management of Rotator Cuff Injuries Evidence-Based Clinical Practice Guideline. 2025.**

적용:
- adult rotator cuff injury spectrum
- 특히 full-thickness tear management evidence의 현재 주요 정형외과 근거

주의:
- tablet이 tear 여부나 수술 적응증을 자동 확정하는 근거로 사용하지 않음
- acute trauma + marked new weakness/functional loss는 별도 urgent clinical assessment domain으로 다룸

## E3. Subacromial pain — BESS 2025
**Pandey RA, Singh HP, BESS Subacromial Pain Working Group. BESS Patient Care Pathway: Subacromial Pain. Shoulder & Elbow. 2025;17(6):713-724. PMID 41245988. DOI 10.1177/17585732251374282.**

적용:
- subacromial pain management의 최신 pathway
- terminology/diagnostic criteria 자체에 heterogeneity가 큼을 명시

따라서:
- “impingement” 하나로 구조 원인을 고정하지 않음
- RC-related/subacromial phenotype을 broader clinical pattern으로 취급

## E4. Primary frozen shoulder — Korean guideline 2025
**Lee BC, et al. Clinical Practice Guidelines for Diagnosis and Non-Surgical Treatment of Primary Frozen Shoulder. Ann Rehabil Med. 2025;49(3):113-138. PMID 40602400. DOI 10.5535/arm.250057.**

적용:
- primary frozen shoulder
- 진단은 주로 history + physical exam
- progressive pain + motion restriction pattern

## E5. Shoulder red flags / primary care pathway — BESS/BOA
**Rees JL, et al. Shoulder Pain: Diagnosis, Treatment and Referral Guidelines for Primary, Community and Intermediate Care. 2020/2021.**
