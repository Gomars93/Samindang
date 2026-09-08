# KNEE_V1 — Evidence Matrix v0.1 HANDOFF

작성일: 2026-08-25
상태: **DRAFT — Evidence Matrix complete / Opus clinical review required / tablet questions not yet started**
대상: 삼인당 Clinical OS — MSK Knee module

> 핵심 원칙
> **Safety → Trauma/Weight-bearing/Extensor mechanism → Effusion/Locking/Instability → Pain location + Load pattern → ROM → Ligament/Meniscus/PF/OA/Tendon hypotheses → Selective Exam → Exercise/Management → Reassessment**
>
> 단일 이학검사로 진단 확정 금지.
> MRI/방사선 소견을 증상의 원인으로 자동 확정 금지.
> 운동은 질환명으로 hard-code하지 않고 **기능 + irritability + ROM + strength + load response + instability + safety + 목표**로 선택한다.

---

# 0. Model Orchestration — 필수

## Opus — 임상·근거 검수자
역할:
- Evidence Matrix와 safety severity 검수
- red flag 누락/과잉탐지 확인
- 근거-주장 mapping 검토
- 단일검사 과확정/영상 과사용 검출
- clinical decision sign-off

출력:
- `PASS`
- `CLINICAL DECISION REQUIRED`

금지:
- 구현 세부를 임의 재설계하지 않음
- CLOSED decision을 임의 변경하지 않음
- 근거가 불충분한 cutoff/확률 생성 금지

## Fable — 장기 통합 리드
**Opus clinical gate 통과 후에만 사용.**

역할:
- repo 구조 audit
- Core / Tablet / Doctor / Sigma / KNEE module 통합 감독
- LBP/NECK/SHOULDER 회귀 0
- shared safety 재사용 여부 판단 및 최소 변경 통합

금지:
- CLOSED 임상결정 재해석
- KNEE 때문에 Core를 광범위하게 재작성
- 같은 safety 개념을 별도 threshold로 복제

## Sonnet — 구현 워커
역할:
- YAML / TypeScript / Python / UI / tests
- literal clinical logic + adapter 구현
- Fable 통합 계획 범위 안에서 실행

금지:
- 임상결정 독자 변경
- fail-closed 완화
- 테스트 우회

권장 순서:

```text
Evidence Matrix
→ Opus clinical review
→ Tablet Question Set
→ Opus re-review
→ Clinical decisions CLOSED
→ Fable integration
→ Sonnet implementation
→ full regression
→ KNEE_V1: PASS / FROZEN
```

**현재는 코드 구현 단계가 아니다.**

---

# 1. Scope

KNEE_V1의 목표는 “무릎 구조진단 자동화”가 아니다.

목표:
1. 놓치면 안 되는 knee/lower-limb safety를 먼저 분리
2. 외상성 손상과 비외상성 퇴행/과사용을 초기에 구분
3. 환자 태블릿에서는 locking / giving-way / effusion / weight-bearing / load pattern 등 신뢰성 높은 정보만 수집
4. 원장 진찰에서 ROM / effusion / ligament / meniscus / patellofemoral / extensor mechanism을 선택적으로 평가
5. 확률 대신 hypothesis support를 제공
6. 기능·부하반응 기반 재활로 연결

주요 phenotype:
- Knee osteoarthritis
- Patellofemoral pain
- Patellar tendinopathy / extensor-load pain
- Acute isolated meniscal injury
- Degenerative meniscal contribution
- ACL / collateral / other ligament injury
- Patellar instability/dislocation history
- Acute extensor mechanism rupture concern
- Hip/lumbar referred contribution
- Septic/inflammatory/systemic pathology
- DVT / vascular concern

---

# 2. Current High-Value Evidence Base

## E1. Knee OA — NICE NG226, 2022
**NICE. Osteoarthritis in over 16s: diagnosis and management. NG226.**

핵심:
- 45세 이상
- activity-related joint pain
- morning stiffness 없음 또는 30분 이하

이면 OA를 임상적으로 진단할 수 있으며 routine imaging은 불필요.
관리의 중심은:
- therapeutic exercise
- 필요 시 weight management
- information/support

본 모듈 적용:
- OA를 MRI/X-ray로 “확인해야만” 치료하는 구조 금지
- 증상과 physical function 중심으로 추적
- atypical feature가 있으면 alternative diagnosis 검토

## E2. Knee OA — AAOS 2021 / summary 2022
**AAOS Management of Osteoarthritis of the Knee (Non-Arthroplasty), 3rd ed.**

적용:
- symptomatic adult knee OA의 비수술 관리
- exercise/activity를 core management로 사용
- 영상/구조 severity만으로 기능을 결정하지 않음

## E3. Acute isolated meniscal pathology — AAOS 2024
**AAOS Clinical Practice Guideline for Management of Acute Isolated Meniscal Pathology. 2024.**

Scope 주의:
- **acute isolated meniscal injury**에 한정
- chronic/degenerative tear, root tear, ACL 동반손상, fracture/chondral injury에는 그대로 적용 금지

핵심:
- MRI가 acute meniscal tear 진단에 선호되는 imaging modality
- joint-line tenderness / McMurray / Thessaly는 이학검사로 활용 가능하고 조합 시 정확도가 좋아질 수 있음
- displaced/displacing tear가 ROM을 제한하는 경우 acute surgical intervention을 고려할 수 있음
- repair 가능성이 높은 symptomatic acute tear는 조기 수술 고려 가능

본 모듈 적용:
- mechanical locking/extension block을 단순 “반월상연골 증상”으로 방치하지 않음
- special test 하나로 tear 확진 금지

## E4. ACL — AAOS 2022
**AAOS Clinical Practice Guideline for Management of Anterior Cruciate Ligament Injuries. 2022.**

적용:
- ACL injury management
- skeletal maturity/activity level/context를 고려한 개별 판단
- 급성 외상 후 instability phenotype의 상위 근거

추가 진단정확도 근거:
- 2022 systematic reviews에서 Lachman / pivot shift / lever sign 등은 유용하지만
