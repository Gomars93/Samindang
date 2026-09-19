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

## 통증 진료 모델 — Task–Load–Capacity

2026-09-19 원장(PO) 결정. 통증 진료의 상위 모델은 다음 한 줄이다.

> **Task → Load(부하 분배) → Capacity(감당 능력) → Response → Recovery**

치료 목표는 **구조를 고치는 것이 아니라, 환자가 못 하는 실제 동작(target task)을
제한하는 수정 가능한 병목을 줄이고 그 task에서 감당 가능한 부하를 올리는 것**이다.
정렬·퇴행·영상 소견을 통증의 단독 원인으로 두지 않는다.

치료수단은 세 층으로 배치한다.

| 층 | 목적 | 해당 술기(현재 지식베이스 기준) |
|---|---|---|
| **1층** Symptom modulation | 움직일 수 있는 상태 만들기 | 침·약침·부항 |
| **2층** Functional bottleneck modification | movement option 확보, 국소 mechanical sensitivity 조절 | 추나·도침·매선 |
| **3층** Capacity building | 실제 부하를 더 많이·오래·반복해서 견디게 하기 | 재활(task-specific graded loading) |

모든 시술은 **target task 재현 → 시술 → 동일 task 즉시 retest**를 중심에 둔다.
**즉시 호전은 임상적으로 유용하지만 인과 증명이 아니다.**

### 이 모델이 기존 원칙과 만나는 지점

- 성공의 정의가 바뀐다 — "통증 점수가 내려갔는가"가 아니라 **"같은 task에서 감당
  부하가 늘었는가"**. Micro Follow-up과 Structured Reassessment가 재는 대상이 이것이다.
- **새 척도를 늘리는 방향이 아니다.** 기능 추가 Gate 4("문진을 불필요하게 두껍게
  만들지 않는가")는 그대로 적용된다. 2026-09-06 "새 척도 0개" 결정도 유효하다.

### 용어 가이드

| 쓰지 않는다 | 대신 쓴다 |
|---|---|
| 틀어진 걸 바로잡았다 / 관절을 제자리에 넣었다 | 그 동작에서 더 편하게 움직일 선택지를 늘렸다 |
| 유착을 끊어서 좋아졌다 / 섬유화 때문에 재발한다 | 국소 민감도가 낮아져 그 동작의 허용 범위가 늘었다 |
| 코어가 약해서 허리가 아프다 | 이 task의 부하를 지금 capacity가 감당하지 못한다 |
| 구조를 회복시킨다 | 그 task의 감당 부하를 올린다 |
| (즉시 호전을 두고) 원인을 찾았다 | 다음 운동을 고르는 단서를 얻었다 |

**환자에게 쓰지 않는 문장 5개** (출처: `DR_07_재활_v1.md` §10.2, 2026-09-19 검수 완료)

1. "코어가 약해서 허리가 아픈 겁니다."
2. "골반이 틀어져서 이 근육이 과부하된 겁니다."
3. "오늘 이 동작이 바로 좋아졌으니 원인을 찾았습니다."
4. "아프더라도 4점까지는 무조건 안전합니다."
5. "침/추나로 풀어놓고 운동하면 그 상태가 고정됩니다."

### task-specific loading을 정당화하는 방식

**"일반 운동보다 우월하다"고 쓰지 않는다.** region-specific exercise와 general
exercise를 직접 비교한 18 RCT / n=1,719에서 통증·장애에 **유의한 차이가 없었다**
(Desmeules F et al. 2021, *Arch Phys Med Rehabil*, PMID 33684362).

정당화 근거는 우월성이 아니라 **용량·전이(transfer)·성과 측정을 환자의 target task에
정렬시킨다**는 것이다. 이 구분을 문서·화면·환자 설명 어디에서도 흐리지 않는다.

### 통증 허용치를 숫자로 고정하지 않는다

`0~4/10` 같은 고정 규칙을 전신 근골격계에 적용할 근거는 없다
(`DR_07_재활_v1.md` §1-6, §11-5). 숫자를 띄워야 한다면 **그것이 삼인당 정책값이며
RCT 검증 규칙이 아님을 함께 띄운다.** 유일한 예외는 건병증 맥락의
`≤5/10 + 다음날 아침 회복`이며(Silbernagel 2007, PMID 17307888), 이는
`ankleFoot.ts` `AF_TEND_01` 한 곳에만 있다.

**진행 판단의 1차 게이트는 그 자리 통증 점수가 아니라 다음날 아침 회복 패턴이다.**

## 제품 원칙

- **Primary = Depth** — 주호소는 충분히 깊게 평가한다.
- **Additional = Coverage** — 추가 문제는 놓치지 않을 만큼 선별하고 필요할 때만 깊게 간다.
- **재진은 매번 짧게, 주기적으로 깊게** — 일반 재진은 Micro Follow-up, 일정 시점에는 Structured Reassessment.
- 의사결정지원은 최종 판단을 대신하지 않는다. 가능성을 좁히고 놓치면 안 되는 확인점을 보여준다.
- 환자 자가보고(PROM)와 의료진 객관적 관찰은 구분한다.
- UNKNOWN ≠ NO, NOT EXAMINED ≠ NEGATIVE.
- 진료는 Treatment에서 끝나지 않고 Care Plan / Rehab으로 이어진다.
- 모든 방문은 다음 방문을 준비한다. 오늘의 Follow-up Target과 Reassessment Plan이 다음 방문의 입력 구조가 된다.
- **통증 진료의 성공은 구조 정상화가 아니라 target task의 감당 부하 증가다** (위 Task–Load–Capacity 절).

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
