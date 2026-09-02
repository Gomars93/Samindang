# LBP Action-Adaptive Engine Prototype v0.1

Status: **DRAFT EXPERIMENT / NOT PRODUCTION**  
Scope: Doctor-side pure logic + synthetic stress fixtures only  
Tablet questionnaire: **NO CHANGE**  
FROZEN `src/spec/*Logic.ts`, `src/spec/*Adapter.ts`: **NO CHANGE**  
Doctor UI / CRM / EMR / rehab production path: **NO CONNECTION**

## 1. Product rule being tested

> 정확히 무엇인지 끝까지 맞히기보다, 지금 무엇을 알아야 실제 관리전략이 달라지는지 먼저 판단한다.

A new question/exam is allowed only if its result can materially change at least one of:

1. 안전성
2. 치료 타깃
3. 재활운동 선택
4. 재평가 지표
5. 영상/의뢰 판단

If it changes none of these, the experimental engine must not generate it.

## 2. Minimum-sufficient principles

- `미평가`는 `정상/음성`이 아니다.
- `불명확`은 `정상/음성`이 아니다.
- 일반적인 불명확 하나로 검사를 연쇄 확장하지 않는다.
- Safety-critical uncertainty는 기존 FROZEN safety contract를 우선한다.
- 질환 안전과 치료 안전을 분리한다.
  - disease safety not CLEAR → routine pathway보다 safety review 우선
  - treatment safety not CLEAR → 임상평가는 계속 가능하되 최종 치료계획 확정은 의료진 확인 필요
- Hip / SIJ는 직렬 감별이 아니다. 단서가 있으면 독립적으로 열릴 수 있고 동시에 기여할 수 있다.
- 비반응만으로 모든 미평가 영역을 자동으로 열지 않는다.
- 치료/운동 노출이 부족한 경우를 자동 NON_RESPONSE로 계산하지 않는다.
- 숫자형 response threshold는 이 prototype에서 계산하지 않는다.
- 단순 환자는 `추가 확인 0개`가 정상 출력일 수 있다.
- 원장 수동 판단/override는 항상 가능해야 한다.

## 3. 왜 raw tablet/DoctorPayload adapter를 아직 만들지 않는가

현재 목적은 clinical rule과 질문 연쇄를 stress-test하는 것이다. Raw payload 연결까지 동시에 하면:

- PR #23의 미병합 tablet 변경과 결합될 수 있고,
- production 데이터 경로와 DRAFT clinical semantics가 섞이며,
- rule 문제와 adapter 문제를 구분하기 어려워진다.

따라서 v0.1은 normalized synthetic context만 받는다. 실제 환자 경로 adapter는 clinical row 승인 후 별도 단계다.

## 4. 현재 시험하는 action checks

- 하지증상 여부 짧게 확인
- 하지 신경학적 기본검사
- 하지직거상 또는 슬럼프검사
- 실제 보행 가능시간·거리 확인
- 목표 기능 하나 정하기
- 목표 동작 재현
- 허리 움직임에 따른 증상반응
- 고관절 빠른 선별
- 천장관절 기여 확인

각 check 객체는 반드시:

- 왜 지금 필요한지
- 무엇을 바꾸는지 (`changesManagement`)
- 어떤 기존 정보 때문에 떴는지 (`sourceFacts` + provenance)
- 간단한 검사방법
- 이번 환자에서 확인하는 이유

를 가진다.

## 5. 의도적으로 아직 하지 않는 것

- 최종 진단 자동확정
- `협착증`, `디스크`, `SIJ dysfunction` 등 병명 자동확정
- 특정 단일검사로 diagnosis confirmation
- 실제 patient fact → production exam recommendation mapping
- NRS/Target Function 숫자로 RESPONDING/NON_RESPONSE 자동분류
- diagnosis → exercise hard mapping
- 실제 rehab 40개 library 자동 selector
- CRM/EMR 자동 write
- Doctor UI 렌더링
- 태블릿 문항 변경

## 6. Stress scenarios

자동 fixture는 다음을 포함한다.

1. 단순 축성 요통
2. 목표 기능 누락
3. 하지증상 자체가 불명확
4. 신경근성 단서
5. 보행 제한형 하지증상
6. 고관절 기여 단서
7. 천장관절 기여 단서
8. Hip + SIJ 동시 단서
9. 충분한 노출 뒤 비반응 + 기존 Hip 단서
10. 충분한 노출 뒤 비반응이지만 다른 단서 없음
11. 치료/운동 노출 부족
12. 신경긴장검사 불명확
13. 객관적 신경검사 불명확
14. treatment safety review와 disease safety 분리
15. disease safety review
16. 악화/새 신경증상
17. severe/progressive objective deficit와 CLEAR safety 불일치 방어
18. 이미 충분히 평가된 단순 환자 → 추가 확인 0개
19. 일부러 모든 단서를 겹친 adversarial multi-cue 환자

## 7. 첫 번째로 예상하는 충돌

`radicular + walking-limited + hip cue + SIJ cue`가 동시에 있는 복합환자는 정당한 후보가 3개를 넘을 수 있다.

v0.1은 이를 임의로 숨기지 않는다. Stress fixture에서 **over-questioning collision을 의도적으로 노출**한다.

다음 리뷰에서 결정할 문제는 `무조건 3개 cap`이 아니라:

- 한 검사가 여러 management question을 함께 해결할 수 있는가?
- 같은 방문에서 반드시 확인할 것과 이후로 미뤄도 되는 것을 어떻게 구분할 것인가?
- Hip/SIJ 단서가 다른 더 중요한 확인 뒤에도 실제로 관리전략을 바꾸는가?
- 이미 확보된 정보로 후보 하나를 안전하게 제거할 수 있는가?

이다.

## 8. Production 진입 조건

이 branch/PR 자체를 production CDS로 merge-ready라고 간주하지 않는다.

Production wiring 전에 최소한:

1. stress result 검토
2. 과잉추천/누락 defect family 수정
3. 실제 LBP decision rows를 임상적으로 검토
4. 승인 row와 code의 1:1 test
5. FROZEN zero-diff 확인
6. real DoctorPayload adapter 별도 검토
7. hypothesis/rehab selector 임상 승인
8. Doctor UI는 한글 중심 + hover/touch 도움말 + progressive disclosure로 별도 설계
9. CI/Preview/실기기 QA

가 필요하다.
