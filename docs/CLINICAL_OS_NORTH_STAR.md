# 삼인당 Clinical OS — North Star

상태: PRODUCT PRINCIPLE / canonical

## 한 문장 정의

> **삼인당 Clinical OS는 환자가 진료를 받고 다음 진료를 받을 때까지 생기는 의료적 공백을 연결하고, 매 방문마다 환자와 의료진의 다음 행동을 명확하게 만드는 시스템이다.**

## North Star Question

> **모든 진료가 끝날 때, 환자와 의료진 모두 다음에 무엇을 해야 하고 무엇을 확인해야 하는지 알고 있는가?**

이 질문에 YES가 되도록 만드는 것이 제품의 최우선 목적이다.

Clinical OS는 정보를 많이 수집하는 시스템이 아니라, 다음 행동을 위해 정보를 압축하는 시스템이다.

## 해결해야 하는 핵심 의료 공백

1. **놓치지 않는다** — Safety / critical information
2. **다음에 무엇을 확인할지 알려준다** — clinical decision support
3. **치료 방향을 공유한다** — care plan
4. **집에서 무엇을 할지 연결한다** — rehab / home management
5. **변화를 측정한다** — micro follow-up
6. **치료 방향이 맞는지 다시 판단한다** — structured reassessment

## Standard Clinical Journey

```text
Initial Assessment
        ↓
Clinical Decision
        ↓
Treatment
        ↓
Care Plan / Rehab
        ↓
Micro Follow-up
        ↓
Structured Reassessment
        ↓
Plan Update
        ↺
```

## 제품 원칙

- **Primary = Depth** — 주호소는 충분히 깊게 평가한다.
- **Additional = Coverage** — 추가 문제는 놓치지 않을 만큼 선별하고 필요할 때만 깊게 간다.
- **재진은 매번 짧게, 주기적으로 깊게** — 일반 재진은 Micro Follow-up, 일정 시점에는 Structured Reassessment.
- 의사결정지원은 최종 판단을 대신하지 않는다. 가능성을 좁히고 놓치면 안 되는 확인점을 보여준다.
- 환자 자가보고(PROM)와 의료진 객관적 관찰은 구분한다.
- UNKNOWN ≠ NO, NOT EXAMINED ≠ NEGATIVE.
- 진료는 Treatment에서 끝나지 않고 Care Plan / Rehab으로 이어진다.
- 모든 방문은 다음 방문을 준비한다. 오늘의 Follow-up Target과 Reassessment Plan이 다음 방문의 입력 구조가 된다.

## 기능 추가 Gate

새 기능은 아래 질문을 통과해야 한다.

1. 어떤 의료적 공백을 메우는가?
2. 환자 또는 의료진의 다음 행동을 더 명확하게 만드는가?
3. 같은 목적을 더 적은 질문·더 적은 클릭으로 달성할 수 있는가?
4. 환자 문진이나 원장 화면을 불필요하게 두껍게 만들지 않는가?

답이 불명확하면 제품 Core가 아니다.

## Core vs Infrastructure

Clinical OS Core:
- Safety
- Clinical Decision Support
- Care Plan
- Rehab / Home Management
- Micro Follow-up
- Structured Reassessment

Supporting Infrastructure:
- tablet questionnaire
- routing / view_profile
- provenance
- persistence
- EMR generation
- preview / QA
- Myungri reference
- analytics

> **Infrastructure가 Clinical Journey보다 앞서지 않는다.**

## 현재 개발 우선순위

초진/Doctor Workspace 기반은 이미 강하다. 앞으로는 문진을 더 두껍게 만드는 것보다 후반부를 연결하는 데 우선순위를 둔다.

1. Initial Assessment에서 Primary/Additional 정보량 최적화
2. Clinical Decision 실제 승인 규칙 연결
3. Treatment → Care Plan / Rehab 연결
4. Follow-up Target → 다음 방문 Micro Follow-up 연결
5. Baseline → Micro Follow-up → Structured Reassessment longitudinal view
6. Reassessment → Plan Update 루프 완성

임상 threshold, 검사 추천 mapping, 변증 mapping, 재활 추천 mapping은 clinician-approved rule 없이는 발명하지 않는다.
