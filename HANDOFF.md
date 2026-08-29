# Current Handoff

## Objective (CRM v0.3.1 round 8 — durable dedup crash window 제거, 이번 세션)
Gomars93의 다음 지시: round 7에서 공개했던 알려진 한계 — `createTaskStored()`가
Task 파일을 먼저 쓰고 `dedup/<hash>.json` 포인터를 나중에 쓰는데, Task
rename이 성공한 직후 dedup 포인터가 기록되기 전에 프로세스가 죽으면
재시도가 포인터를 못 찾아 같은 `dedup_key`에 대해 두 번째 non-terminal
Task를 만들 수 있었다(process 내부 `dedup:${hash}` 락은 재시작을 넘어서
보호하지 못함) — 를 이번 라운드에서 닫는다. store 경계에서, 클리닉
데이터를 다루지 않는 새 데이터베이스/제품 레이어 없이 가장 단순하고
견고한 파일 기반 접근으로 고칠 것. 요구 불변식: task 생성 도중 어느
crash/restart 지점에서든 같은 `dedup_key`에 대한 재시도는 정확히 하나의
authoritative non-terminal Task로 수렴해야 한다. 요구된 회귀/failure-injection
증명 6가지: (1) Task durability 이후·dedup pointer durability 이전 지점에서
중단, (2) 새 `createCrmStore()` 인스턴스로 재시작 시뮬레이션, (3) 같은
source event/contact point로 재시도, (4) 그 dedup key에 대해 authoritative
non-terminal Task가 정확히 하나만 존재하고 API가 중복을 새로 만들지 않고
그것을 반환/재사용함을 확인, (5) CANCELLED/SUPERSEDED terminal semantics는
불변 — 이전 authoritative Task가 terminal이면 정말 새 Task가 만들어질 수
있어야 함, (6) 파일명/로그/audit에 raw phone/PHI 미도입, Safety
invariant/expectedVersion/claim lease/first_seen_at/Episode-derived patient
identity/Test 0 PENDING gate 전부 온전. 이번 라운드도 범위를 좁게 유지 —
CRM UI 없음, 임상 threshold/매핑/identity-policy/provider 변경 없음. tsc/
build/build:preview/test:all/tablet-core 재실행, CI + preview 확인, FROZEN
zero-diff 검증. **PR #24는 여전히 DO NOT MERGE.**

## Objective (CRM v0.3.1 round 7 — Task 환자 정체성을 Episode에서 파생시켜 identity 불변식 강제, 이전 세션)
Gomars93의 다음 지시: `POST /api/crm/tasks`가 `episode_id`의 존재만 확인하고
요청 body의 `patient_uuid`를 그대로 CrmTask에 영속화하고 있었는데, 이러면
`body.patient_uuid !== episode.patient_uuid`인 stale/malicious 요청이
Episode.patient_uuid = A인데 CrmTask.patient_uuid = B인 정체성 불일치
레코드를 만들 수 있었다. `groupTasksForCommunication()`이 `task.patient_uuid`
기준으로 그룹핑하므로 이 불일치는 환자 단위 communication을 실제로
오배송시킬 수 있는 결함이었다. 지시된 수정 방향: UI 검증을 추가하는 게
아니라 "제2의 쓰기 가능한 정체성" 자체를 없앤다 — `createTaskStored()`가
스스로 Episode를 로드해서 `patient_uuid`를 Episode에서 파생시키고,
클라이언트가 보낸 값은 authority로 쓰지 않는다. store/API 경계에서 patient
A의 Episode에 patient B를 섞은 mismatched 요청으로 cross-patient Task가
절대 만들어지지 않음과, 이후 patient-level grouping이 A로 정확히
귀속됨을 회귀 테스트로 증명해야 한다. expectedVersion/SAFETY
invariant/restart durability/claim lease/`first_seen_at`/do-not-contact/Test 0
PENDING gate는 전부 그대로 보존. 별도로 이미 공개된 task-file→dedup-pointer
crash window는 이번 라운드 범위 밖(한 번에 하나의 이슈만). CRM UI는 이번
라운드에도 시작하지 않는다. **PR #24는 여전히 DO NOT MERGE.**

## Objective (CRM v0.3.1 round 6 — 안정화된 Episode/CrmTask 상태 머신을 서버 persistence에 올림, 이전 세션)
Gomars93의 다음 지시: CRM UI를 시작하기 전에, round 1-5에서 순수 함수로만
검증된 Episode/CrmTask 상태 머신을 서버 영속화 계층(파일 기반 store) +
원장 인증 API로 올린다. 순수 엔진 함수(`src/crm/{types,taskEngine,episode}.ts`)를
재사용하고 라우트에서 전이 로직을 다시 구현하지 않는다. CRM UI는 이번
라운드에도 시작하지 않는다. 임상 threshold/매핑/메시징 provider 선택
없음, FROZEN zero-diff 유지, 전체 검증 스위트 재실행, subagent 미사용
확인. 10개 acceptance criteria: (1) 원본 phone 필드 없이 Episode/CrmTask
영속화, patient_uuid/Sigma 매핑은 참조만, (2) 모든 mutating 라우트가
expectedVersion을 요구하고 stale write에 conflict 반환, (3) task 생성이
프로세스 재시작을 넘어서도 dedup key/source-event 규칙에 대해 idempotent,
(4) SAFETY invariant가 persistence/restart 후에도 유지(직원 resolve
불가, snooze 불가, episode completion이 open Safety를 취소 못함), (5)
`first_seen_at`은 persisted queue item이 실제로 노출될 때 정확히 한 번만
기록, (6) claim lease 만료/재개가 restart 후에도 동작, 영구 CLAIMED
lock 없음, (7) review-open은 여전히 persisted task에서 파생, Episode
review boolean이나 제2의 mutable truth 재도입 금지, (8) 커뮤니케이션
그룹핑은 read/orchestration projection으로만 남고 underlying task를
mutate/complete하지 않음, (9) Test 0은 여전히 PENDING, reservation
suppression은 여전히 OFF, Care Gap/LOST/contact/SLA 숫자 기본값 발명
금지, (10) restart + concurrency/failure-injection 테스트를 store/API
경계에 추가, 중단된 write가 반쪽짜리 Episode/Task pair를 남기거나 open
Safety task를 조용히 잃어버리지 않음을 증명. **PR #24는 여전히 DO NOT
MERGE.**

## Objective (CRM v0.3.1 round 5 — communication grouping을 patient-level로 수정, 이전 세션)
Gomars93의 다음 지시: `groupTasksForCommunication()`이 `${patient_uuid}|
${episode_id}` 조합으로 그룹핑하고 있었는데, 승인된 CRM 설계는 커뮤니케이션
suppression/orchestration이 **여러 Episode를 가로지르는 환자 단위**여야
한다. 같은 patient의 medication Episode와 pain Episode가 같은 접촉 창구에
동시에 걸리면 두 개의 별도 outreach로 쪼개지는 버그였다 — 기존 Test 10은
episode 하나만 써서 이걸 못 잡았다. 그룹 키에서 `episode_id`를 빼고
`patient_uuid`만으로 묶되(1번), SAFETY_REVIEW는 여전히 완전 제외(2번),
그룹핑은 task/episode identity를 병합하지 않고 DONE으로 표시하지도 않는
순수 배송/orchestration 뷰로 유지(3번), `contact_mode`를 그룹 키에 함께
넣어 OUTBOUND_ALLOWED와 IN_PERSON_ONLY가 절대 한 그룹에 섞이지 않도록
했다(5번). 결과는 아래 Completed — CRM v0.3.1 Round 5 참고. 서버 영속화/UI는
이번 라운드에도 시작하지 않았다(6번). **PR #24는 여전히 DO NOT MERGE.**

## Objective (CRM v0.3.1 round 4 — review-open state를 task에서 파생시켜 이중 진실 제거, 이전 세션)
Gomars93의 다음 지시: `Episode.clinical_review_open`/`safety_review_open`
boolean이 이미 `CrmTask.status` + `task_type`에 존재하는 열림/닫힘 상태를
중복 저장하고 있었는데, `createCrmTask()`/`resolveTask()`가 그 boolean들을
원자적으로 갱신하지 않았다 — 서버 영속화가 붙으면 "열린 SAFETY task인데
episode.safety_review_open=false" 같은 드리프트가 가능한 두 번째 쓰기 가능한
진실이 된다. 지시대로 두 boolean을 **Episode에서 완전히 제거**하고,
task 목록에서 파생하는 함수(`isReviewOpen`/`deriveEpisodeReviewState`)로
대체했다 — "UI 편의를 위한 두 번째 mutable truth를 추가하지 말라"는 지시를
필드를 아예 없애는 방식으로 만족시켰다. `care_gap`/`reassess_due`는 그대로
Episode operational flag로 남겼다(지시 2번). 결과는 아래 Completed — CRM
v0.3.1 Round 4 참고. 서버 영속화/UI는 이번 라운드에도 시작하지 않았다(지시
4번). **PR #24는 여전히 DO NOT MERGE.**

## Objective (CRM v0.3.1 round 3 — first_seen_at가 실제 큐 노출 시점을 재도록 수정, 이전 세션)
Gomars93의 round 1 재검수 코멘트 두 번째(round 2와 별도 코멘트, 같은 `de216fc`
HEAD를 리뷰): `createCrmTask()`가 `first_seen_at`을 생성 시각(`input.now`)으로
채우고 있었고 타입도 non-null `string`이었다. 그러면 `created_at → first_seen_at`
지연이 영구히 0이 되어, v0.3.1이 요구하는 "Clinical/Safety task가 담당 원장에게
제때 도달했는가" 측정이 이 스키마가 영속화된 뒤에도 원천적으로 불가능해진다.
지시대로 `first_seen_at`을 `null`에서 시작하게 바꾸고, `markTaskSeen()`을
새로 추가해 첫 실제 노출 시점만 기록(멱등, 이후 재호출은 최초 값 보존)하도록
했다. claimTask/acknowledged_at과 결합하지 않았다 — 보기/claim/확인/해결은
서로 다른 지연 측정 지점이라는 지시를 그대로 따랐다. 결과는 아래 Completed —
CRM v0.3.1 Round 3 참고. **PR #24는 여전히 DO NOT MERGE.**

## Objective (CRM v0.3.1 round 2 — SAFETY_REVIEW hardening at cancelTask/supersedeTask, 이전 세션)
Gomars93의 round 1 재검수(99/100)가 지적한 단일 갭: `completeEpisode()`/
`snoozeTask()`는 SAFETY_REVIEW를 올바르게 보호하지만, 범용 프리미티브
`cancelTask()`/`supersedeTask()`는 task_type 검사가 없어서 **직접 호출하면**
열린 Safety task를 조용히 취소/대체할 수 있었다. 오늘 존재하는 호출부(round
1의 `completeEpisode`, `supersedeFutureRoutineTasksOnCarePlanChange`,
`recalculateMedicationTasksOnStartShift`)는 전부 ROUTINE만 필터링해서 호출하므로
우연히 안전했지만, 그건 호출자의 습관에 의존한 안전이지 불변식이 아니었다.
지시대로 **프리미티브 자체**에서 SAFETY_REVIEW를 거부하도록 고쳤다(throw,
status/version 불변). 결과는 아래 Completed — CRM v0.3.1 Round 2 참고. **PR
#24는 여전히 DO NOT MERGE.**

## Objective (CRM v0.3.1 round 1 — non-clinical Episode/Task 스키마 + 상태전이 회귀 테스트, 이전 세션)
Gomars93가 PR #24 댓글로 지시한 CRM v0.3.1 첫 라운드: **비임상** Episode/Task
데이터 모델(Episode lifecycle, CRM task 20개 필드/상태/reason_code, 안전(Safety)
불변식, dedup/idempotency, claim lease, 우선순위 큐, medication course provenance)
을 스키마 + 순수 상태전이 함수 + Tests 1-20 회귀 스위트로 구현한다. Care Gap
예약 suppression은 Test 0(Naver→Sigma 예약 반영 live 검증, Naver 연동이 아직
라이브가 아니라 보류)이 VERIFIED로 나올 때까지 비활성 상태로만 스키마에
존재한다 — 실제로 켜지 않았고 fallback 예약 데이터나 threshold를 발명하지
않았다. 이번 라운드 범위는 **순수 데이터 모델 + 테스트뿐**이며, 서버 영속화
라우트와 새 UI는 만들지 않았다(기존 `CarePlanCard`/`NextReassessmentPlanCard`를
그대로 재사용하라는 지시와 일치 — 두 번째 Care Plan 입력 화면을 만들지 않음).
결과는 아래 Completed — CRM v0.3.1 Round 1 참고. **PR #24는 여전히 DO NOT
MERGE.**

## Objective (round 17 — 환자 문진 정보량 감사(Primary vs Additional), 이전 세션)
PR #24의 열일곱 번째 리뷰(Gomars93)가 지정한 **단일 과제**: 대표 프로필별로 현재
환자 문진 흐름의 정보량(화면 수 / 탭 수 / branch depth / 섹션별 부담)을 **재현
가능하게 측정**하고, **정확한 중복 또는 표현(presentation) 수준의 중복만** —
질문 의미·threshold·promotion/safety 규칙·프로필 라우팅·저장 provenance를 전혀
바꾸지 않고 제거 가능한 것만 — 골라낸다. 안전하게 제거 가능한 것이 명확히
증명되면 가장 영향이 큰 하나를 구현하고 before/after를 테스트에 고정한다.
다음 감축이 임상 규칙 변경을 요구하면 **규칙을 발명하지 말고 그 경계를 보고**한다.
결과: **안전하게 제거 가능한 표현 수준 중복은 발견되지 않았다** — 아래
Completed — Round 17 참고. **PR #24는 여전히 DO NOT MERGE.**

## Objective (round 16 — 태블릿 뷰포트 수용 기준을 CI에서 강제, 이전 세션)
PR #24의 열여섯 번째 리뷰(Gomars93, 99/100)가 지적한 **단 하나의 남은 갭**:
round 15의 실제 렌더링 측정이 로컬에서만 돈다는 것. CI에는 CSS 소스 순서 가드만
있어서, 가드의 텍스트 형태를 유지하면서 렌더링 높이는 회귀시키는 변경이 가능하다.
리뷰 지시: **저장소/러너에 이미 있는 브라우저·런타임을 재사용**하고, 이것 하나를
위해 무거운 브라우저 스택을 추가하지 말 것. 결과는 아래 Completed — Round 16 참고.
**PR #24는 여전히 DO NOT MERGE.**

## Objective (round 15 — 실제 태블릿 뷰포트 밀도 확인, 이전 세션)
PR #24의 열다섯 번째 리뷰(Gomars93)가 지정한 **단일 과제**: round 14의 밀도
증명이 1440×900에서만 이루어졌는데, 그 CSS는 1100px 미만에서 판단/처치/재검 3필드를
1열로 떨어뜨린다. 실제 목표 태블릿 크기(1024×768 가로, 834×1112 세로)에서 기본
임상 흐름이 여전히 ≤1.5 viewport인지 **측정**하고, 넘으면 **반응형 레이아웃만**
고친다(필드 삭제·임상 기본값·chip·어휘 발명·threshold/매핑 변경 금지). 측정 결과와
회귀 체크는 아래 Completed — Round 15 참고. **PR #24는 여전히 DO NOT MERGE.**

## Objective (round 14 — 오늘 확인할 것 / 오늘 판단·처치 압축, 이전 세션)
PR #24의 열네 번째 리뷰(Gomars93)가 승인한 좁은 UI 라운드: (1) `오늘 확인할 것`의
기본 빈 상태를 한 줄 요약 + `빠른 입력` 하나로, (2) `오늘 판단·처치`를 핵심 3
액션(판단 / 처치 / 재검)으로 압축하고 `치료 초점`·상세 메모는 접되 값이 있으면
자동으로 펼침, (3) 항상 열려 있는 입력 수와 기본 노출 높이를 줄이되 기록된
내용은 절대 숨기지 않기. 새 임상 threshold/판단/권고 없음. `3935778` 대비
실측 결과는 아래 Completed — Round 14 참고. **PR #24는 여전히 DO NOT MERGE.**

## Objective (round 13 — Doctor Preview 최종 비임상 단순화, 이전 세션)
PR #24의 열세 번째 리뷰(Gomars93)가 승인한 마지막 비임상 단순화 라운드:
(1) preview/QA 전용 컨트롤을 일반 임상 화면에서 제거, (2) `오늘 확인할 것`을
자유 입력 우선에서 **탭 우선**으로, (3) `오늘 판단·처치`의 기본 노출을 핵심
3필드로, (4) `다음 액션`의 반복되는 빈 행을 한 줄로. 제품 규칙: "기본
화면에서 지우더라도 원장의 다음 행동이 달라지지 않는다면 기본에서 빼고,
필요하면 명시적 2차 동작 뒤에 둔다." 새 임상 threshold/판단/권고 없음.
`ebfad17` 대비 실측 결과는 아래 Completed — Round 13 참고.
**PR #24는 여전히 DO NOT MERGE.**

## Objective (round 8 — 전달 채널 무관 Micro Follow-up + 원내 태블릿 스테이션, 이전 세션)
사용자가 승인한 제품 방향: 모든 재진을 클리닉 태블릿으로 강제하지 않되,
접수 병목을 실제로 줄이도록 Micro Follow-up의 **전달 채널을
delivery_mode로 추상화**한다. 이번 라운드에서 실제로 구현한 채널은 두
개(CLINIC_TABLET, PERSONAL_QR)이며, STAFF_ASSISTED는 별도 임상 프로토콜이
아니라 **입력 주체(provenance)**로만 구현했고, PREVISIT_LINK는 데이터/UI
훅만 두고 문자·카카오 연동은 하지 않았다(승인된 외부 발송 제공자가 아직
없음 — 유일하게 남은 human blocker). 새 임상 threshold/판단 없음.
상세는 아래 Completed — Round 8 참고. **PR #24는 여전히 DO NOT MERGE.**

## Objective (round 7 — round 6 리뷰 3차 엔지니어링 수정, 이전 세션)
PR #24에 대한 세 번째 follow-up review(Gomars93, "Round 6 re-review")가
"이전 blocker는 크게 개선됐지만 3개 비임상 엔지니어링 이슈가 남아있다"며
지적한 항목 — (1) 보안/정확성: phase 3(old 토큰 무효화) 쓰기가 실패하면
old 토큰이 여전히 공개적으로 사용 가능한 상태로 남을 수 있음(pointer는
전환됐지만 public resolve/consume이 pointer가 아니라 토큰 레코드 자신의
status만 신뢰), (2) 프라이버시: `FollowUpScreen`이 여전히 자신의 child
state(`activeToken`)에 평문 토큰을 들고 있음(round 6는 부모 state만
비웠음), (3) 교차 레코드 stale data: `RevisitWorkspace`가 새
visitId/patientId 로드 시작 시 이전 레코드의 prior 관련 state를 리셋하지
않아, 새 prior-detail fetch가 실패하면 이전 환자 데이터가 새 환자
화면에 남을 수 있음 — 을 수정한다. 새 임상 판단 없음. 상세는 아래
Completed — Round 7 참고. **PR #24는 여전히 DO NOT MERGE.**

## Objective (round 6 — round 5 리뷰 2차 엔지니어링 수정, 이전 세션)
PR #24에 대한 두 번째 follow-up review(Gomars93, "Round 5 follow-up")가
round 5의 수정이 "prior 6 blockers는 해결됐지만 재검토에서 2차
엔지니어링 gap을 발견"했다며 지적한 7개 항목 — 재발급 실패 안전성,
startRevisit의 부분쓰기 정리, 응답 수락의 멱등성, 중복 클릭 방지,
재진의 재진(revisit-of-revisit) 이전 맥락 완전성, React 메모리에서 토큰
해제, 오래된 주석 — 을 수정한다. 새 임상 판단 없음. 상세는 아래
Completed — Round 6 참고. **PR #24는 여전히 DO NOT MERGE.**

## Objective (round 5 — round 4 리뷰 엔지니어링 수정, 이전 세션)
PR #24에 대한 GitHub PR review(Gomars93, round 4 follow-up)가 지적한 6개
엔지니어링 정합성 문제 — 새 임상 판단 없음, 전부 원자성/내구성/SSOT/종단
연결/데이터 형식/프라이버시 문제 — 를 수정한다. 상세는 아래 Completed —
Round 5 참고. **PR #24는 여전히 DO NOT MERGE.**

## Objective (round 4 — 재진 태블릿 연결, 이전 세션)
round 3에서 "OPERATIONAL INTEGRATION REQUIRED"로 남겨뒀던 Micro
Follow-up의 실제 gap — 환자가 태블릿에서 직접 답할 방법이 없던 문제 —
을 닫는다. 사용자가 명시적으로 승인한 보안/제품 방향(일회용 capability
token, 이름/전화/생년월일 매칭 절대 금지, doctor 토큰은 환자 태블릿에
절대 전달 안 함)에 따라 구현. 상세 설계 근거는 `DECISIONS.md`의
"2026-08-28 — 재진 태블릿 연결" 항목 참고. **PR #24는 여전히 DO NOT
MERGE.**

## Objective (round 1-3, 이전 세션들)
PR #24 "Doctor Clinical Workspace" — 태블릿 문진 결과를 단순 요약 화면이
아니라, 원장이 실제로 "가능성을 좁혀주고, 놓치면 안 되는 확인점을 보여주는"
진료 워크스페이스로 확장하는 작업. 사용자가 명시적으로 지시한 원칙: 새
임상 threshold/진단/변증/처방 로직은 절대 발명하지 않고, 그 외 정보구조·
UX·상태모델·영속화·테스트·문서·미리보기 배포까지는 자율적으로 끝까지
구현한다. **PR #24는 DO NOT MERGE — 사용자 명시 지시.**

이 문서는 세 라운드에 걸친 작업을 기록한다: round 1(초기 구현, Phase
0-19), round 2(85점 상태에서 시작해 임상 판단이 필요 없는 범위 내에서
최고점을 목표로 한 심화 감사/영속화/UX 정밀화), round 3(`docs/
CLINICAL_OS_NORTH_STAR.md`의 임상 여정 — Initial Assessment → Clinical
Decision → Treatment → Care Plan/Rehab → Micro Follow-up → Structured
Reassessment → Plan Update → repeat — 를 따라 매 단계에서 임상 판단이
필요 없는 부분을 전부 구현).

## Current State
- 작업 브랜치: `feat/doctor-clinical-workspace` (PR #24). Round 3 작업
  시작 시점 HEAD: `c4f355a`(`docs/CLINICAL_OS_NORTH_STAR.md` 추가 커밋).
  Round 4(재진 태블릿 연결) 작업 시작 시점 HEAD: `6939748`. 정확한 현재
  SHA는 `git rev-parse feat/doctor-clinical-workspace`로 확인.
- **round 4에서 실제로 검증한 것 (이번 세션)**: `npx tsc -b --force`(0
  에러), `npm run build`/`npm run build:preview`(둘 다 성공), `npm run
  test:all`(전체 green — 신규 `tests/follow-up-session.spec.mjs` 113
  assertion 포함), `cd "tablet core" && python3 -m pytest tests/ -q`(80
  passed), `git diff origin/main -- 'src/spec/*Logic.ts'
  'src/spec/*Adapter.ts'`(empty), 그리고 실제 로컬 handoff 서버 + vite
  dev server + Playwright 헤드리스 Chromium으로 재진 흐름 전체를 실제
  브라우저에서 왕복 검증(27개 체크 전부 통과 — 아래 Tests / Verification
  참고).
- **CLOSED/FROZEN `src/spec/*Logic.ts`/`*Adapter.ts`는 네 라운드 모두 단
  한 줄도 건드리지 않았다** — `git diff origin/main -- 'src/spec/*Logic.ts'
  'src/spec/*Adapter.ts'`가 매 커밋마다 비어있음을 확인.
- Round 3에서 이 세션이 직접 실행한 전체 로컬 검증: `npx tsc -b --force`
  (0 에러), `npm run build`/`npm run build:preview`(둘 다 성공),
  `npm run test:all`(전체 green, 2507 assertion — 신규 `test:workspace-
  round3` 52개 + `test:server` 신규 assertion 다수 포함), `cd "tablet
  core" && python3 -m pytest tests/ -q`(80 passed), 실제 로컬 handoff
  서버 + vite dev server를 띄우고 Playwright 헤드리스 브라우저로 실제
  save/reload/재선택까지 왕복 검증(아래 Tests / Verification 참고).

## Completed — Round 1/2 (요약, 상세는 git log 참고)
Round 1: Provenance 데이터 모델, Doctor Workspace shell, Pain/Herbal
Workspace V2, synthetic 시나리오 7종, 실제 헤드리스 브라우저 시각 QA(버그
2건 발견·수정), 실제 앱을 빌드하는 미리보기 배포.
Round 2: 서버 영속화(`WorkspaceState` + `PUT /api/submissions/:id/
workspace`), 여성·생식 정보 조건부 표시, 한약 기본 체크리스트, view_profile
16-case 감사, 프로필 오버라이드 UX, 접근성(tablist/tab/tabpanel), 병기
후보→최종 판단 가져오기, 재평가 기준값/직후값, 중복 UI 제거.

## Completed — Round 3 (이번 세션, North Star Phase A-M)
1. **Care Plan(Phase A/J)** — `src/doctor/workspace/carePlan.ts`
   (`PainCarePlan`/`HerbalCarePlan`, 각 6개 필드), `CarePlanCard.tsx`,
   `WorkspaceState.painCarePlan`/`herbalCarePlan`로 영속화. 환자 전달용
   미리보기(`patientCarePlanPreview.ts` + `PatientCarePlanPreviewCard.tsx`,
   복사/인쇄 버튼, 인쇄는 격리된 `window.open` 팝업 — 메인 앱 CSS/DOM에
   전혀 관여하지 않음)는 Myungri/미확정 제안/내부 추론을 절대 포함하지
   않는다(소스 레벨 가드 테스트로 확인).
2. **NextReassessmentPlan(Phase B)** — `finalAssessment.ts`에 타입 추가
   (`UNSET`/`DATE`/`VISIT_COUNT`/`CLINICIAN_DECIDES`, 기본값 없음),
   `NextReassessmentPlanCard.tsx`, 기존 "재평가 대상"(follow-up target)
   과는 별개 필드로 영속화.
3. **실제 종단 환자 연결(Phase C)** — 기존 서버를 먼저 재감사(이미
   explicit random `patient_id`/`visit_id`/`submission_id`, 이름/전화/
   생년월일 매칭 절대 금지 원칙이 `visitStore.js`에 이미 존재함을 확인
   후 그 위에 최소 확장만 추가):
   - `server/visitStore.js`: `listVisitsForPatient(patientId)`(엄격한
     문자열 동등 비교만).
   - `server/store.js`: `getPatientHistory(patientId, excludeVisitId)` —
     RAW 값만 반환(재평가 대상, 최종 판단 요약, 다음 재평가 계획), 계산된
     호전/악화 판단 없음.
   - `GET /api/patients/:patientId/history` (신규 doctor-guarded 라우트,
     `requireDoctor` + Origin allowlist 둘 다 적용 — 처음엔 Origin guard
     의 `doctorRoute` 판별 목록에서 빠뜨렸다가 신규 서버 테스트로 즉시
     발견/수정).
   - `src/doctor/workspace/longitudinal.ts`(클라이언트 타입),
     `PriorVisitHistoryCard.tsx`(기본 접힘 `<details>`, raw 값만 표시).
   - `DoctorView.tsx`가 `selectedRecord.patient_id`/`visit_id`를 기준으로
     `getPatientHistory`를 fetch해 `priorVisits`로 전달.
4. **Structured Reassessment(Phase E)** — `reassessmentExam.ts`
   (`ReassessmentExamItem`: `previous`는 읽기전용 원본 스냅샷, `result`는
   항상 `NOT_YET_CHECKED`로 시작 — 절대 자동 복사하지 않음, 테스트로
   POSITIVE/NEGATIVE 양쪽 다 확인), `StructuredReassessmentCard.tsx`.
   기존 `ExamSuggestionCard`/`ClinicianObservationChecklist`에 "재검
   항목으로 추가" 명시적 클릭 버튼 추가.
5. **Clinical Loop Status(Phase G)** — `ClinicalLoopStatus.tsx`, 원장
   전용 완료 상태 큐(●/○), 점수화·게이미피케이션 아님.
6. **Additional Concern(Phase H)** — `additionalConcern.ts`(routing의
   `additional_module`/`additional_detail_concern`을 읽기만 하는 순수
   projection), `AdditionalConcernCard.tsx`, "오늘 상세평가 필요로 표시"
   수동 플래그(routing을 절대 변경하지 않음 — 소스 레벨 가드 테스트).
7. **Rehab Suggestion 프레임워크(Phase I)** — `rehabSuggestion.ts`(SHAPE만
   정의, `DoctorPayload`에서 계산하는 함수 없음 — 소스 레벨 가드 테스트),
   `RehabSuggestionCard.tsx`(ACCEPT/HOLD/REJECT + "치료 계획에 가져오기"
   는 ACCEPTED일 때만). 프로덕션은 항상 빈 배열, `workspaceFixtures.ts`에
   SYNTHETIC 라벨 붙은 예시 1건만 미리보기용으로 추가.
8. **Micro Follow-up(Phase D)** — `src/doctor/workspace/microFollowUp.ts`
   (데이터 모델, 이전 방문 Follow-up Target에서 최대 3개 후보 생성, 새
   임상 threshold 없음), `server/microFollowUpStore.js`(visit당 파일
   1개), `POST`/`GET /api/visits/:id/micro-follow-up`(둘 다
   doctor-guarded — 아래 Known Risks 참고), `MicroFollowUpCard.tsx`
   (`추가 확인 필요` 배지는 새 증상/이상반응 보고 시에만, 임상 해석
   없음).
9. **QA 중 발견한 실제 버그 1건 수정**: `FollowUpTargetPicker.tsx`가
   렌더링하는 `REPEAT_VISIT_AUTO_COMPARE_STATUS` 문자열이 영어 내부
   추적 문구 "OPERATIONAL INTEGRATION REQUIRED"를 그대로 원장 화면에
   노출하고 있었다(round 2부터 존재하던 문제, 실제 헤드리스 브라우저
   QA로 처음 발견). 순수 한국어 문구로 교체하고, 7개 시나리오 전체에서
   이 영어 문구가 다시 나타나지 않는지 확인하는 회귀 테스트를 추가했다.
10. 실제 로컬 handoff 서버 + vite dev server + Playwright 헤드리스
    브라우저로 desktop/landscape(1280×800)/portrait(800×1280) 3개
    뷰포트, fixtures 모드(Pain/Herbal 시나리오)와 실제 server 모드(진짜
    제출 페이로드로 시딩 — `buildResponsePayload`/`buildRoutingPayload`/
    `computeFlags`/`computeSaju` 프로덕션 빌더 그대로 사용) 양쪽 검증.
    Care Plan 저장 → 새로고침 → 재선택까지 실제로 값이 남아있음을
    확인(가장 중요한 영속화 증거).

## In Progress
- (없음 — round 17의 측정/검증 전부 완료. Push 후 CI 재확인만 남음.)

## Completed — CRM v0.3.1 Round 8 (durable dedup crash window 제거, 이번 세션)
**`server/crmStore.js`의 `createTaskStored()` 재작성**: 쓰기 순서를
뒤집었다 — 이제 dedup 포인터(`dedup/<hash>.json`)를 **먼저** 쓰고 Task
파일을 나중에 쓴다. 포인터 파일의 내용도 `{task_id}`에서
`{task}`(계산된 Task 객체 전체 스냅샷)로 바꿔, 포인터 자체가 "durable
intent record"가 되도록 했다. 동작:
- 포인터가 없으면(완전히 새 생성이거나 이전 authoritative Task가
  terminal이라 재발급하는 경우): `createCrmTask()`로 Task를 계산 →
  포인터에 그 전체 스냅샷을 먼저 커밋 → 그다음 Task 파일을 쓴다.
- 포인터가 있고 그 `task.task_id`가 가리키는 Task 파일이 실제로
  존재하면: 기존과 동일하게 non-terminal이면 dedupe, terminal이면
  아래 "포인터 없음"과 같은 경로로 재발급.
- **포인터는 있는데 그 Task 파일이 존재하지 않으면**(바로 이 라운드가
  닫는 crash window: 포인터는 커밋됐지만 Task 파일 쓰기 전에 프로세스가
  죽은 상태) — 이번 호출의 입력을 다시 조합해 새 Task를 만드는 게
  아니라, 포인터에 이미 저장된 스냅샷을 **그대로 재생**해서 Task 파일에
  쓴다. 어떤 재시도가 몇 번 오든, 그 dedup_key에 대해 처음 커밋된
  포인터의 task_id/내용만이 유일한 진실이 된다.

기존에는 순서가 반대(Task 먼저, 포인터 나중)였다 — Task rename 성공
직후·포인터 기록 전에 죽으면 재시도가 포인터를 못 찾고 완전히 새
task_id로 두 번째 non-terminal Task를 만들어버리는 게 실제 버그였다.
이번 재작성으로 그 창이 구조적으로 사라진다: 포인터가 없으면 Task도
아직 하나도 없다는 뜻이고(항상 포인터가 먼저 커밋되므로), 포인터가
있는데 Task 파일이 없다면 그건 "완료되지 않은 동일한 시도"라는 뜻이지
"새 생성"이 아니다.

**`tests/crm-store.spec.mjs`**: Part 4(기존 create-failure 테스트, 새
쓰기 순서에 맞게 주석/단언 갱신 — 포인터가 이제 살아남는다는 것과 재시도가
ORIGINAL task_id를 회수한다는 것을 명시적으로 확인)와 신규 Part
7(review의 6개 요구사항을 그대로 구현, 14 assertion)을 추가. 총
**53 assertion**(39 → 53). Part 7은: (1) Task 쓰기만 막아 정확히
"포인터 커밋 후·Task 커밋 전" 지점에서 중단, (2) 새
`createCrmStore()` 인스턴스로 실제 재시작 시뮬레이션, (3) 캐시된
in-memory 상태 없이 같은 source event로(호출자의 자기 자신은 매번
새 랜덤 task_id를 보내는 실제 조건 그대로) 재시도, (4) 정확히 하나의
authoritative non-terminal Task만 디스크에 존재하고 API가 ORIGINAL
task_id를 재사용함을 확인, (5) 그 Task를 DONE으로 resolve한 뒤 같은
dedup key로 다시 생성하면 정말 새 task_id가 발급됨(terminal
재발급 semantics 불변)을 확인, (6) 포인터/Task 어디에도 raw phone 패턴이
없음을 확인.

**검증 (이번 세션이 직접 실행):** `npx tsc -b --force`(0 에러), `npm run
build`/`npm run build:preview`(둘 다 성공), `npm run test:all`(전체
green, exit 0 — CRM 스토어 스위트 53 assertion 포함), `cd "tablet core"
&& python3 -m pytest tests/ -q`(80 passed), `git diff origin/main --
'src/spec/*Logic.ts' 'src/spec/*Adapter.ts'`(empty, FROZEN
zero-diff). CRM UI는 지시대로 이번 라운드에도 시작하지 않았다. Test 0
여전히 PENDING, Care Gap suppression 여전히 비활성, 새 임상
로직/threshold/identity-policy/provider 선택 없음.

**Subagent 사용 안 함** — 이 라운드는 단일 세션에서 수행.

## Completed — CRM v0.3.1 Round 7 (Task 정체성을 Episode에서 파생, 이전 세션)
**`server/crmStore.js`의 `createTaskStored()`**: 함수 진입 시 즉시
`getEpisode(rawInput.episode_id)`로 Episode를 로드해서 없으면
`CrmNotFoundError`, 있으면 `{ ...rawInput, patient_uuid: episode.patient_uuid }`로
`patient_uuid`를 무조건 덮어쓴다. 이후 dedup_key 계산과
`createCrmTask()` 호출 전부 이 보정된 input을 쓰므로, 순수 엔진
(`src/crm/taskEngine.ts`)은 손대지 않고 store 경계에서만 "제2의 쓰기
가능한 정체성"을 제거했다. `server/index.js`의 라우트는 여전히
`patient_uuid`를 body에서 읽어 요청 형태를 검사하지만(빈 문자열이면
400), 그 값은 이제 persist 되는 값에 어떤 authority도 갖지 않는다 —
주석으로 명시.

**`tests/crm-store.spec.mjs`**: Part 5(store 경계, 6 assertion)와
Part 6(실제 HTTP `/api/crm/tasks` 경계, 6 assertion)를 추가, 총
**39 assertion**(28 → 39). Part 5는 patient A의 Episode에 patient B의
`patient_uuid`를 실은 요청이 A로 정확히 저장됨, dedup_key도 파생된
정체성(A) 기준으로 계산되어 올바른 재호출이 같은 task로 dedupe됨,
`groupTasksForCommunication()`이 A로 정확히 귀속됨, 존재하지 않는
`episode_id`는 `CrmNotFoundError`로 fail-closed됨(고아 task 없음)을
확인한다. Part 6는 같은 시나리오를 `createApp()`으로 띄운 실제 HTTP
서버에 대해 반복 — `POST /api/crm/tasks`가 mismatched body로도 201을
반환하되(요청 자체는 well-formed) 저장된 task는 patient A를 갖고,
이후 `GET`으로도 A가 확인됨을 증명한다.

**`server/index.js`**: `/api/crm/tasks` POST 핸들러의 주석을 갱신해
`body.patient_uuid`가 더 이상 authority가 아님을 명시.

이 라운드가 함께 공개한 task-file→dedup-pointer crash window(round 6
HANDOFF/DECISIONS에 이미 기록)는 지시대로 이번 라운드 범위 밖 —
건드리지 않았다.

**검증 (이번 세션이 직접 실행):** `npx tsc -b --force`(0 에러), `npm run
build`/`npm run build:preview`(둘 다 성공), `npm run test:all`(전체
green, exit 0 — CRM 스토어 스위트 39 assertion 포함), `cd "tablet core"
&& python3 -m pytest tests/ -q`(80 passed), `git diff origin/main --
'src/spec/*Logic.ts' 'src/spec/*Adapter.ts'`(empty, FROZEN
zero-diff). CRM UI는 지시대로 이번 라운드에도 시작하지 않았다. Test 0
여전히 PENDING, Care Gap suppression 여전히 비활성, 새 임상
로직/threshold/provider 선택 없음.

**Subagent 사용 안 함** — 이 라운드는 단일 세션에서 수행.

## Completed — CRM v0.3.1 Round 6 (서버 persistence + 원장 API, 이전 세션)
**신규 `server/crmStore.js`**: `src/crm/{types,taskEngine,episode}.ts`의
순수 함수를 직접 import해서 재사용 — 이 서버는 원래 `node
server/index.js`로 빌드 단계 없이 바로 실행하는 계약이라(`index.js`
헤더 주석), 별도 esbuild 프리빌드 단계를 두지 않고 Node v22의 네이티브
TypeScript 타입 스트리핑을 그대로 활용했다. 단, Node의 ESM 리졸버는
tsc/vite와 달리 상대 import에 확장자를 요구하므로, `src/crm/` 내부
상대 import 5곳(`taskEngine.ts`/`episode.ts`/`medicationCourse.ts`)에
`.ts` 확장자를 명시적으로 붙였다(tsconfig의 기존
`allowImportingTsExtensions: true`로 이미 합법).

파일 배치는 이 저장소의 다른 store와 동일한 관례: entity당 1파일
(`episodes/<id>.json`, `tasks/<id>.json`), `dedup/<sha256(dedup_key)>.json
-> {task_id}` 포인터 파일로 idempotency를 프로세스 재시작 너머까지
durable하게 보장(순수 엔진의 in-memory `existingTasks[]` 배열 대신).
claim lease 만료는 백그라운드 타이머 없이 read-time에 lazy하게
self-heal(`followUpSessionStore.js`의 토큰 만료와 동일한 모델).
`completeEpisodeStored`는 completeEpisode()가 실제로 바꾼 task들을
episode 레코드보다 먼저 쓰고, 그 사이에 끊기면 episode는 여전히
ACTIVE로 남아 안전하게 재시도 가능하다(§10 참고). `cancelTask`/
`supersedeTask`는 순수 엔진 시그니처 자체에 expectedVersion이 없지만,
모든 mutating 라우트가 버전 검사를 하도록 하는 요구(§2)를 store
경계에서 균일하게 확장해 만족시켰다(같은 `CrmConflictError` 사용).

**`server/index.js`**: `POST/GET /api/crm/episodes[/:id[/tasks]]`,
`POST /api/crm/episodes/:id/{pause,complete,reopen}`, `POST/GET
/api/crm/tasks[/:id]`, `POST
/api/crm/tasks/:id/{resolve,snooze,cancel,supersede,claim,seen}` —
전부 기존 `requireDoctor`/`isOriginAllowedForDoctor` 가드 재사용(원장
전용, 신규 인증 메커니즘 없음), 모든 mutating 라우트가 body의
`expectedVersion`(숫자)을 요구하고 없으면 400. `mapCrmError()`가
`CrmConflictError`→409, `CrmNotFoundError`→404, 그 외 순수 엔진의
거부(예: `safety_review_cannot_be_cancelled`)→400(자신의 message
그대로)으로 매핑 — 예상된 정상 거부를 500으로 뭉개지 않는다. `seen`
액션도 다른 mutating 액션들과 동일하게 `safeAudit({event:
'crm_task_seen', ...})`을 남기도록 맞췄다(기존 `submission_viewed`
감사 로그 관례와 일관).

**신규 `tests/crm-store.spec.mjs`**(§10 요구사항): 빌드 단계 없이
`node tests/crm-store.spec.mjs`로 바로 실행. 4개 파트, 28
assertion — (1) restart: 완전히 새로운 `createCrmStore()` 인스턴스가
공유 상태 없이 이전 인스턴스가 쓴 Episode/Task/dedup 인덱스/claim
lease 자가치유를 그대로 관측, (2) concurrency: cancel/snooze/supersede
전부 stale expectedVersion에 conflict, 동시에 발사한 두 개의 claim
요청 중 정확히 하나만 성공하고 나머지는 conflict(잃어버린 update
없음), (3) failure-injection:
`tests/follow-up-session.spec.mjs`에서 이미 쓰던 기법(정확한 tmp write
경로에 실제 디렉터리를 놓아 genuine EISDIR을 유발)으로
`completeEpisodeStored`의 최종 episode 쓰기를 막아, 중단 후에도
episode가 ACTIVE로 남고(COMPLETED로 잘못 넘어가지 않음) 이미 취소된
ROUTINE task는 그대로이며, 열린 SAFETY_REVIEW task는 완전히 손대지
않은 채 남는다는 것을 확인 — 이후 차단을 풀고 재시도하면
COMPLETED로 안전하게 수렴, (4) task 생성 자체가 중단됐을 때도 고아
task 파일이나 phantom dedup이 남지 않고 깨끗하게 재시도됨을 확인.

**알려진 한계 (이번 라운드 범위 밖, 투명하게 기록)**: `createTaskStored`가
task 파일을 쓴 직후, dedup 포인터 파일을 쓰기 전에 프로세스가 죽으면,
그 사이의 아주 좁은 창에서는 재시도가 dedup 인덱스를 못 찾아 같은
dedup_key를 가진 두 번째 task를 만들 수 있다. §10이 명시적으로 요구한
범위는 "Episode/Task pair"와 "Safety task 손실"이며 이 시나리오는
거기 해당하지 않아 이번 라운드에서 고치지 않았다 — 다음 라운드에서
필요하면(예: task 쓰기와 dedup 쓰기를 하나의 원자적 단계로 묶기)
다룰 수 있다.

**`package.json`**: `test:crm-store` 스크립트 추가, `test:all` 체인에
`test:crm-schema` 다음 순서로 연결.

**`tests/server.spec.mjs`**: 기존 "26개 doctor-guarded 라우트" 카운트
assertion을 CRM 라우트 코드 블록 7개 추가분을 반영해 33으로 갱신(라우트
코드 자체가 정확한지 검증하는 회귀 테스트이므로, 새 라우트를 추가하면
반드시 이 숫자를 함께 갱신해야 한다는 걸 이번에 직접 확인함).

**검증 (이번 세션이 직접 실행):** `npx tsc -b --force`(0 에러), `npm run
build`/`npm run build:preview`(둘 다 성공), `npm run test:all`(전체
green, exit 0 — CRM 스토어 스위트 28 assertion 포함), `cd "tablet core"
&& python3 -m pytest tests/ -q`(80 passed), `git diff origin/main --
'src/spec/*Logic.ts' 'src/spec/*Adapter.ts'`(empty, FROZEN
zero-diff). 로컬 HTTP 스모크 테스트(스크래치패드, 저장소에 커밋 안 함)로
episode/task 생성→claim→seen→get→no-auth-403(단, loopback이라
403 대신 200 — auth.js의 문서화된 loopback OR token 모델대로 정상
동작)→stale-version-409 흐름을 직접 확인. CRM UI는 지시대로 이번
라운드에도 시작하지 않았다. Test 0 여전히 PENDING, Care Gap
suppression 여전히 비활성, 새 임상 로직/threshold/provider 선택 없음.

**Subagent 사용 안 함** — 이 라운드는 단일 세션에서 수행.

## Completed — CRM v0.3.1 Round 5 (커뮤니케이션 그룹핑 patient-level화, 이전 세션)
`src/crm/taskEngine.ts`: `groupTasksForCommunication()`의 그룹 키를
`${patient_uuid}|${episode_id}`에서 `${patient_uuid}|${contact_mode}`로
변경 — episode_id를 뺐으므로 같은 환자의 서로 다른 Episode(예: 복약
Episode + 통증 Episode) task가 이제 하나의 outreach 그룹으로 묶인다.
반환 타입을 `CrmTask[][]`에서 `CommunicationGroup[]`
(`{patient_uuid, contact_mode, tasks}`)로 바꿔, 그룹이 어떤 환자·어떤
contact_mode인지 호출부가 재추론하지 않고 바로 알 수 있게 했다.
`contact_mode`를 그룹 키에 유지했으므로(그대로 유지, 새로 추가한 게
아니라 이번에 episode_id를 뺀 자리에 이미 있던 것을 계속 활용) 같은
환자라도 do_not_contact(IN_PERSON_ONLY) task와 outbound-allowed task는
여전히 서로 다른 그룹으로 분리된다 — outbound 메시지가 in-person 전용
task를 절대 끌어들이지 못한다.

SAFETY_REVIEW는 이전과 동일하게 완전히 별도로 반환되며(`safetyExcluded`),
grouping 자체는 여전히 순수 배송/orchestration 뷰일 뿐 task나 Episode를
병합하거나 DONE으로 표시하지 않는다(함수 구현에 그런 부수효과가 없음).

`tests/crm-schema.spec.mjs`: 기존 Test 10을 새 반환 shape(`g.tasks`)에
맞게 갱신, "Round 5 review fix" 블록 9개 assertion 추가 — 같은 환자의
서로 다른 두 episode_id에서 온 task가 한 그룹으로 묶임, 그 그룹이
episode_id 두 개를 모두 보존함(병합 아님), SAFETY_REVIEW는 여전히
제외됨, grouping이 task 상태를 바꾸지 않음, do_not_contact task는
outbound-allowed 그룹과 절대 섞이지 않고 별도 그룹으로 분리됨.

총 **95 assertion**(기존 86 + 신규 9), 전부 통과.

**검증 (이번 세션이 직접 실행):** `npx tsc -b --force`(0 에러), `npm run
build`/`npm run build:preview`(둘 다 성공), `npm run test:all`(전체 green, CRM
스위트 95 assertion), `cd "tablet core" && python3 -m pytest tests/ -q`(80
passed), `git diff origin/main -- 'src/spec/*Logic.ts' 'src/spec/*Adapter.ts'`
(empty, FROZEN zero-diff). 서버 영속화/UI는 지시대로 이번 라운드에도
시작하지 않았다. Test 0 여전히 PENDING, Care Gap suppression 여전히
비활성, 새 임상 로직/threshold/provider 선택 없음.

**Subagent 사용 안 함** — 이 라운드는 단일 세션에서 수행.

## Completed — CRM v0.3.1 Round 4 (review-open 단일 진실 소스화, 이전 세션)
`src/crm/types.ts`: `Episode`에서 `clinical_review_open`/`safety_review_open`
필드를 완전히 제거(타입 정의와 `newEpisode()` 둘 다). 코드베이스 전체를
grep해 이 두 필드를 실제로 읽거나 쓰는 곳이 정의 자리 두 곳뿐이었음을
확인했다 — 즉 애초에 아무도 갱신하지 않던, 순수하게 위험한 죽은 필드였다.

`src/crm/taskEngine.ts`: `isReviewOpen(tasks, episodeId, taskType)`와
`deriveEpisodeReviewState(tasks, episodeId)`를 새로 추가. "열림"은 해당
episode의 해당 task_type 중 하나라도 terminal 상태(DONE/CANCELLED/
SUPERSEDED)가 아닌 것이 있으면 true — OPEN/CLAIMED/IN_PROGRESS/SNOOZED는
전부 열림으로 센다. Episode 객체가 아니라 task 목록 + episode_id만 받으므로
호출 시점에 항상 최신 task 상태를 반영하며, 별도로 갱신해야 할 캐시가 없다.

`tests/crm-schema.spec.mjs`에 "Round 4 review fix" 블록 11개 assertion 추가,
지시받은 4가지를 정확히 검증:
1. CLINICAL_REVIEW/SAFETY_REVIEW task 생성 → 파생 상태가 열림으로 바뀜.
2. CLINICAL_REVIEW를 resolve/cancel하면 파생 상태가 닫힘(다른 task_type엔
   영향 없음도 확인); SAFETY_REVIEW는 clinician resolve로만 닫힘.
3. `completeEpisode()`로 Episode를 COMPLETED 처리해도 열린 SAFETY_REVIEW의
   파생 상태는 여전히 열림(episode.ts round 1의 "SAFETY는 보존" 로직과 일치).
4. 오래된 버전으로 resolve를 시도하면 `CrmConflictError`로 거부되고, 별도
   flag가 없으므로 파생 상태는 실패한 쓰기 전후로 정확히 동일함을 확인 —
   "flag/task mismatch가 애초에 불가능함"을 구조로 증명.

총 **86 assertion**(기존 75 + 신규 11), 전부 통과.

**검증 (이번 세션이 직접 실행):** `npx tsc -b --force`(0 에러), `npm run
build`/`npm run build:preview`(둘 다 성공), `npm run test:all`(전체 green, CRM
스위트 86 assertion), `cd "tablet core" && python3 -m pytest tests/ -q`(80
passed), `git diff origin/main -- 'src/spec/*Logic.ts' 'src/spec/*Adapter.ts'`
(empty, FROZEN zero-diff). 서버 영속화/UI 배선은 지시대로 이번 라운드에도
시작하지 않았다. Test 0 여전히 PENDING, Care Gap suppression 여전히 비활성,
새 임상 로직/threshold/provider/신원 변경 없음.

**Subagent 사용 안 함** — 이 라운드는 단일 세션에서 수행.

## Completed — CRM v0.3.1 Round 3 (first_seen_at 큐-노출 시맨틱, 이전 세션)
`src/crm/types.ts`: `CrmTask.first_seen_at`을 `string`(non-null)에서 `string |
null`로 변경. `src/crm/taskEngine.ts`: `createCrmTask()`가 이제 `first_seen_at:
null`로 시작(과거엔 `input.now`); 새 함수 `markTaskSeen(task, expectedVersion,
now)` 추가 — `first_seen_at`이 이미 채워져 있으면 아무것도 하지 않고(멱등,
최초 타임스탬프 보존), 채워지지 않았을 때만 `now`로 설정. 버전 검사가 항상
먼저 실행되므로(round 2의 resolveTask와 같은 원칙) 오래된 expectedVersion으로
호출하면 이미 seen 여부와 무관하게 `CrmConflictError`가 난다.

`claimTask()`는 손대지 않았다 — `acknowledged_at`은 여전히 claim 시점에
독립적으로 채워진다. "보기/claim/확인/해결은 서로 다른 시점"이라는 지시를
지키기 위해 두 필드를 결합하지 않았다.

`tests/crm-schema.spec.mjs`에 "Round 3 review fix" 블록 8개 assertion 추가:
새 task는 `first_seen_at === null`, 첫 view는 설정, 반복 view는 최초 값을
덮어쓰지 않음(같은 버전 = no-op), 오래된 버전은 충돌, claim만으로는
`first_seen_at`이 채워지지 않고 `acknowledged_at`은 독립적으로 채워짐을 확인.
총 **75 assertion**(기존 67 + 신규 8), 전부 통과.

**검증 (이번 세션이 직접 실행):** `npx tsc -b --force`(0 에러), `npm run
build`/`npm run build:preview`(둘 다 성공), `npm run test:all`(전체 green, CRM
스위트 75 assertion), `cd "tablet core" && python3 -m pytest tests/ -q`(80
passed), `git diff origin/main -- 'src/spec/*Logic.ts' 'src/spec/*Adapter.ts'`
(empty, FROZEN zero-diff). 새 임상 로직/threshold/provider/UI/문서 없음, Test 0
여전히 PENDING, Care Gap suppression 여전히 비활성 — 지시 그대로.

**Subagent 사용 안 함** — 이 라운드는 단일 세션에서 수행.

## Completed — CRM v0.3.1 Round 2 (SAFETY_REVIEW 하드닝, 이전 세션)
`src/crm/taskEngine.ts`의 `cancelTask()`/`supersedeTask()`에 `task_type ===
'SAFETY_REVIEW'`면 throw하는 가드를 추가했다(`safety_review_cannot_be_cancelled`
/ `safety_review_cannot_be_superseded`). `resolveTask()`(clinician-only)와
`snoozeTask()`(항상 거부)가 이미 갖고 있던 것과 같은 방어를, 마지막 두 프리미티브
에도 채워 넣었다 — "Safety는 clinician resolution 외에는 절대 사라지지 않는다"는
불변식이 이제 호출부 습관이 아니라 프리미티브 자체에서 강제된다.

기존 호출부 3곳(`completeEpisode`, `supersedeFutureRoutineTasksOnCarePlanChange`,
`recalculateMedicationTasksOnStartShift`)은 전부 ROUTINE만 필터링해서 호출하므로
이 변경으로 동작이 바뀌지 않는다 — 회귀 없음.

`tests/crm-schema.spec.mjs`에 "Round 2 review fix" 블록 9개 assertion 추가:
`cancelTask()`/`supersedeTask()`를 SAFETY_REVIEW task에 **직접** 호출하면 거부되고
(throw), 거부된 시도 후 status/version이 정확히 그대로임을 확인. 대조군으로
ROUTINE/CLINICAL_REVIEW task에는 정상 동작함도 확인(가드가 SAFETY_REVIEW에만
특정됨을 증명). 총 **67 assertion**(기존 58 + 신규 9), 전부 통과.

**검증 (이번 세션이 직접 실행):** `npx tsc -b --force`(0 에러), `npm run
build`/`npm run build:preview`(둘 다 성공), `npm run test:all`(전체 green, CRM
스위트 67 assertion), `cd "tablet core" && python3 -m pytest tests/ -q`(80
passed), `git diff origin/main -- 'src/spec/*Logic.ts' 'src/spec/*Adapter.ts'`
(empty, FROZEN zero-diff). 새 임상 로직/threshold/provider/UI/문서 없음 — 지시
그대로.

**Subagent 사용 안 함** — 이 라운드는 단일 세션에서 수행.

## Completed — CRM v0.3.1 Round 1 (non-clinical Episode/Task 스키마, 이전 세션)
새 디렉터리 `src/crm/`(React 없음, 서버 없음, 네트워크 없음 — 순수 타입 +
상태전이 함수). 기존 `NextReassessmentPlan`(`finalAssessment.ts`)을 타입만
재사용하고 병행 스키마를 만들지 않았다.

- `types.ts` — `Episode`(status ACTIVE|PAUSED|COMPLETED|LOST, REOPENED는 상태가
  아니라 event), `CrmTask`(20개 provenance/timing 필드 + 이번 라운드가 다른
  요구사항 때문에 추가로 필요했던 `version`/`dedup_key`/`contact_mode` 3개,
  근거를 파일 상단 주석에 명시), `RESERVATION_SUPPRESSION_STATE` (기본값
  `PENDING_TEST_0` — VERIFIED가 아니면 `isReservationSuppressionActive()`는
  항상 false).
- `taskEngine.ts` — `createCrmTask`(SAFETY_REVIEW는 승인된 upstream 신호 또는
  명시적 인간 요청 없이는 생성 자체가 거부됨, dedup은 patient_uuid+episode_id+
  task_type+source_event_id+contactPointKey), `claimTask`/`releaseExpiredClaim`
  (lease, 영구 lock 아님), `resolveTask`(버전 불일치는 DONE 여부와 무관하게
  항상 먼저 검사 → 동시성 충돌이 조용히 덮어써지지 않음; staff는 Safety를
  resolve 불가), `snoozeTask`(Safety는 거부), `cancelTask`/`supersedeTask`
  (terminal 상태는 멱등), `sortCrmTaskQueue`(SAFETY > CLINICAL > ROUTINE,
  이후 overdue → due_at → created_at, SLA 하드코딩 없음), `resolveTaskOwner`
  (owner 없으면 호출자가 넘긴 coverage queue로 — 이름/스케줄 하드코딩 없음),
  `groupTasksForCommunication`(SAFETY_REVIEW는 항상 그룹 밖), `assertNoRawPhone`
  (전화번호 형태 문자열을 dedup key 등에 넣으려 하면 거부).
- `episode.ts` — `pauseEpisode`(task 일절 안 건드림 — pause 시 auto-cancel
  없음), `completeEpisode`(열린 SAFETY_REVIEW/CLINICAL_REVIEW는 보존, 열린
  ROUTINE만 취소), `reopenEpisode`(LOST에서만 가능, REOPENED event 기록),
  `applyNextReassessmentPlanToEpisode`(CLINICIAN_DECIDES/UNSET → reassess_due
  false, 자동 task 없음), `supersedeFutureRoutineTasksOnCarePlanChange`,
  `resolveConsecutiveHerbalCourseEpisode`(선택 없이 호출하면 throw — CRM이
  대신 결정하지 않음).
- `medicationCourse.ts` — 날짜/기간을 추론하지 않음, timeline anchor 우선순위
  start > dispensed > prescribed, 시작일 변경 시 이 course에 연결된 아직 열린
  ROUTINE task만 superseded(DONE은 그대로), 대체 due_at은 호출자가 제공(SLA
  오프셋 하드코딩 없음).
- `tests/crm-schema.spec.mjs` — 지시받은 Tests 1-20을 정확히 그 순서/이름으로
  구현, **58 assertion 전부 통과**. `npm run test:all`에 `test:crm-schema`로
  연결(test:questionnaire-volume 다음, test:body-map 이전).

**이번 라운드에서 만들지 않은 것 (의도적 경계):** 서버 영속화 라우트(`server/
crmStore.js` 등)와 새 UI 화면. 지시가 "기존 CarePlanCard/NextReassessmentPlanCard
재사용, 두 번째 Care Plan 입력 화면 금지"였고 서버/UI 배선은 스코프에
명시되지 않았으므로, 이번 라운드는 스키마+테스트로 한정했다 — Remaining
항목에 다음 라운드 후보로 기록.

**검증 (이번 세션이 직접 실행):** `npx tsc -b --force`(0 에러), `npm run
build`/`npm run build:preview`(둘 다 성공), `npm run test:all`(전체 green,
새 `tests/crm-schema.spec.mjs` 58 assertion 포함), `cd "tablet core" &&
python3 -m pytest tests/ -q`(80 passed), `git diff origin/main -- 'src/spec/
*Logic.ts' 'src/spec/*Adapter.ts'`(empty, FROZEN zero-diff). 새 esbuild
bundle 4개(`tests/.crm-*-bundle.mjs`)는 기존 라운드들과 같은 컨벤션으로
`.gitignore`에 등록(재생성 산출물, 소스 아님).

**Test 0 상태:** PENDING — Naver 예약 연동이 아직 라이브가 아니므로 PR #24
댓글에서 이미 BLOCKED로 보고했다. Care Gap 예약 suppression은 여전히
`PENDING_TEST_0`로 비활성.

**Subagent 사용 안 함** — 이 라운드는 단일 세션에서 수행.

## Completed — Round 17 (환자 문진 정보량 감사, 이전 세션)

### 측정 도구 (`tests/questionnaire-volume.spec.mjs`, 신규, CI 포함)
브라우저 없이 **실제 `visibleQuestions` 엔진**으로 대표 프로필을 끝까지 걸어가며
화면 수·탭 수·branch depth·섹션별 부담을 재고, 그 값을 테스트에 고정한다.

**응답 정책(숫자의 의미를 정하는 부분이라 명시한다)**: 각 프로필은 라우팅을
정의하는 답(신원/방문목적/주호소/추가상세)만 고정하고, 나머지는 **greedy
minimum-burden** 규칙으로 답한다 — 가능한 답을 모두 시도해 **남는 질문 수가 가장
적은 답**을 고르고, 동률이면 스펙 순서. 이름 기반 휴리스틱도, "이 선택지가 무해할
것"이라는 가정도 없다. 따라서 아래 수치는 **하한(floor)** 이다: 안전 관련 양성
응답을 하면 화면이 늘어난다(설계대로). greedy는 화면 단위이므로 전역 최단은 아닐
수 있으나, 값이 안정적이고 비교 가능하다 — 회귀 가드에는 그게 필요하다.

**탭 모델**: 한 화면에 질문 하나이고 자동 진행이 없으므로(App.tsx는 `goNext`를
버튼에만 연결) 화면당 최소 선택 1 + 다음 1. 다중선택은 선택 수 + 다음. 직원 확인
인터럽트는 1탭 추가.

### 측정 결과 (하한)

| 프로필 | 화면 | 탭 | primary / additional / shared |
| --- | --- | --- | --- |
| pain_fast · 요통(LBP) | 23 | 46 | 9 / 0 / 14 |
| pain_fast · 무릎 | 29 | 60 | 15 / 0 / 14 |
| pain_fast · 팔·손 | 28 | 56 | 14 / 0 / 14 |
| pain_fast · 요통 + **추가상세(수면)** | 25 | 50 | 9 / **3** / 13 |
| symptom · 수면 | 17 | 34 | 3 / 0 / 14 |
| herbal · 증상치료(소화) | 25 | 51 | 3 / 0 / 22 |
| pain_fast · 요통(남성) | 22 | 44 | 9 / 0 / 13 |

### 가장 중요한 발견: 부담은 Additional이 아니라 **공통 꼬리**에 있다
리뷰의 프레이밍은 "Primary vs Additional 정보량"이었지만, 데이터는 다른 곳을
가리킨다. **추가 상세상담을 하나 더 붙여도 화면은 23 → 25, 단 +2**다. 반면
**모든 프로필에서 공통(shared) 화면이 13~22개**로, 최단 경로 부담의 절반 이상을
차지한다. 즉 Primary/Additional 구조 자체는 이미 저렴하다.

### 안전하게 제거 가능한 표현 수준 중복: **없음**
세 가지 형태를 전수 검사했고 전부 0이었다:

1. **한 세션 안에서 같은 질문 문구 + 같은 선택지가 두 번** → 7개 프로필 전부 0건.
2. **선택지가 1개뿐인 화면**(정보 없는 탭) → 전부 0건.
3. **스펙 전체에서 문구가 완전히 같은 질문 쌍** → `ELBOW_00`/`AF_00` 한 쌍뿐인데,
   각각 팔·손 / 다리·발 하위 라우터로 **선택지가 다르고 한 세션에 동시에 보이지
   않는다**. 같은 문장, 다른 질문 — 중복이 아니다. 테스트에 이름으로 허용해뒀다
   (침묵이 아니라 명시로).

셋 다 회귀 가드로 고정했다. 앞으로 하나라도 생기면 이 테스트가 그것을 지목한다.

### 경계 보고 (여기서 멈춘다)
남은 감축은 전부 임상/저장 규칙을 건드려야 한다 — 규칙을 발명하지 않고 보고한다:

- **병력정보 6화면**(`MED_USE` / `HISTORY_01` / `ALLERGY_01` / `SURGERY_01` /
  `WOMEN_SAFETY_01` / `TEST_01`)이 모든 프로필에 그대로 붙는다. 이 중 4개는
  선택지가 `없어요 / 있어요 / 잘 모르겠어요`로 **완전히 동일**하다. 하나의
  다중선택으로 합치면 3화면·6탭이 줄지만, 각각이 **자기 변수와 provenance로
  저장되고 일부는 safety gate의 입력**이다 → 내용·provenance 변경. **승인 필요.**
- **herbal 프로필의 `CONST_DIGESTION`과 GI 모듈(GI_01~03)** 이 같은 주제를
  각각 묻는다. 목적이 다르다(모듈 상세 vs 체질 기준선). 어느 쪽을 빼도 저장되는
  것과 한약 패턴 데이터가 달라진다 → **임상 판단 필요.**
- **무릎 29화면 / 60탭**이 최대치이고 그중 15개가 Pain 모듈이다. 줄이려면 안전
  질문 커버리지를 바꿔야 한다 → **임상 판단 필요.**

### 감사 도구에서 잡은 내 버그 1건
`modulesActivated`는 라우터 **라벨**('Pain','Sleep','GI')을 주는데
`MODULE_QUESTION_IDS`는 **키**('pain','sleep','digestion')로 색인된다.
소문자 변환은 둘은 우연히 맞고 나머지는 조용히 틀린다 — herbal 프로필이
`primary 0 · shared 25`로 잘못 보고됐다. `MODULE_ROUTES`를 역으로 뒤집어
스펙이 실제로 정의한 매핑을 쓰도록 고쳤다(`primary 3 · shared 22`).

### 모델 routing에 대한 정직한 기록
이번에도 **서브에이전트를 하나도 띄우지 않았다.** 단일 세션이 전부 수행했다.

## Completed — Round 16 (태블릿 뷰포트 수용 기준의 CI 강제, 이전 세션)

### 새 의존성 0개로 CI에서 실제 렌더링을 측정한다
`tests/tablet-viewport.spec.mjs`(신규)가 **CI 러너에 이미 설치된 Chrome**을
DevTools Protocol로 직접 몰고, node 22의 전역 `WebSocket`과 `node:http` 기반
40줄짜리 정적 서버만 쓴다. Playwright도 Puppeteer도 브라우저 다운로드도 없다.
`package.json`은 스크립트 두 줄만 늘었고 `devDependencies`는 그대로다.

이 저장소의 기존 관례를 그대로 따른 것이다 — `tests/bodymap-assets.spec.mjs`도
체크 하나를 위해 의존성을 받지 않고 PNG 디코더를 직접 썼다.

측정 대상은 프로덕션 형태 기본 레코드이며, 3개 뷰포트에서 로컬 Playwright QA와
**완전히 같은 수치**를 낸다(1028 / 1110 / 1192px). 검증하는 것:

- (a) 임상 흐름 높이 ≤ 1.5 viewport **+ 뷰포트별 절대 상한**
- (b) 가로 오버플로 0px
- (c) 최소 인터랙티브 타깃 ≥ 36px
- (d) 기본 노출 자유 입력이 정확히 3개(판단/처치/재검)
- (e) 미기록 체크리스트가 접힌 상태로 **남아있고**, 요약이 미확인 건수를 말하며,
  `빠른 입력` 버튼이 탭 가능한 크기로 실제 보인다

### 왜 이 방식인가
- 브라우저를 찾지 못했을 때 **CI에서는 실패**한다(`process.env.CI`). 정작 중요한
  머신에서 조용히 스킵하는 수용 증명은 증명이 아니다. 로컬에서는 눈에 보이는
  SKIP만 찍고 통과시켜, Chrome 없는 기여자를 막지 않는다.
- round 13이 fixture 픽커를 preview 컨텍스트 뒤로 숨겼으므로, 테스트는
  `VITE_PREVIEW_MODE=true`로 임시 디렉터리에 빌드해서 잰다. 프로덕션 빌드에는
  레코드로 가는 UI 경로가 **의도적으로** 없기 때문이다.
- 닫힌 `<details>`는 Chromium에서 여전히 0이 아닌 rect를 보고하므로 열린 입력
  개수는 `checkVisibility()`로 센다(round 14에서 실제로 당한 문제).

### 비공허성 확인
round 15의 900~1100px 오버라이드를 지우면 가로 1024가 1192px = **1.55×**로
측정되고 새 테스트가 정확한 메시지로 실패하는 것을 확인한 뒤 되돌렸다. 즉 이
테스트는 CSS 텍스트 형태가 아니라 **렌더링된 높이**를 지킨다.

### 남은 한계 (정직하게)
CI 러너 이미지가 Chrome을 빼면 이 테스트는 실패한다 — 조용히 통과하는 것보다
낫다고 판단했다. `CHROME_BIN`으로 경로를 지정할 수 있다.

### 모델 routing에 대한 정직한 기록
이번에도 **서브에이전트를 하나도 띄우지 않았다.** 단일 세션이 전부 수행했다.

## Completed — Round 15 (실제 태블릿 뷰포트 밀도, 이전 세션)

### 측정 먼저 (프로덕션 형태 기본 레코드, 같은 스크립트)

| 뷰포트 | 수정 전 | 수정 후 | viewport 배수 |
| --- | --- | --- | --- |
| desktop 1440×900 | 1028px | 1028px | **1.14×** |
| tablet landscape 1024×768 | 1192px (**1.55×** — 목표 초과) | **1110px** | **1.45×** |
| tablet portrait 834×1112 | 1192px | 1192px | **1.07×** |

세 뷰포트 전부 가로 스크롤 0px, 최소 인터랙티브 타깃 36px, 미기록 체크리스트는
접힌 상태(삭제 아님), 열려 있는 자유 입력은 판단/처치/재검 3개뿐.

### 원인과 수정 (반응형 레이아웃만)
가로 1024만 목표를 넘겼다. 원인은 명확하다 — round 14가 넓은 화면에서 기본 3필드를
1행으로 배치했지만, **기존 1100px 브레이크포인트가 모든 final-assessment 그리드를
1열로 떨어뜨려서** 태블릿 가로에서는 3필드가 세로로 쌓였다(3행 = +156px). 세로
834는 같은 1192px이지만 화면이 높아 1.07×로 통과한다.

900~1100px 구간에 한해 기본 그리드를 **2열**로 유지하고 `재검`이 전체 폭을 차지하게
했다. 3열이 아니라 2열인 이유: 콘텐츠 폭 ~960px에서 3열은 필드당 약 310px이라 임상
판단을 타이핑하기에 좁다. 2열은 넉넉한 폭을 유지하면서 한 행을 없애고 빈 셀도 남기지
않는다. 필드·라벨·의미는 하나도 건드리지 않았다.

이 블록은 **1100px 쿼리보다 뒤에 와야 한다** — 두 선택자 모두 단일 클래스라 동일
specificity에서 소스 순서가 결정한다(round 12에서 실제로 당한 문제).

### 회귀가 조용히 되돌려지지 않도록
- `tests/doctor-workspace.spec.mjs`에 **소스 레벨 가드**를 추가했다: 오버라이드
  블록이 존재하고, 1100px 스택 규칙보다 **뒤에** 있고, 2열 + 전체폭 span을
  설정하는지 확인한다. 블록을 앞으로 옮겨보고 **실제로 실패하는 것을 확인**했다
  (비공허성). CI에서 돌아간다.
- 헤드리스 태블릿 QA 스크립트(3뷰포트 × 6체크 = **18개**)에 측정 높이 상한을
  박아뒀다. 브라우저가 없으면 돌릴 수 없으므로 CI 가드는 위의 소스 레벨 테스트다.

### 하지 않은 것
목표를 넘긴 것은 가로 1024 하나뿐이었고 그것만 고쳤다. 리뷰의 "이미 통과하면
불필요한 변경을 하지 말라"에 따라 다른 뷰포트·다른 카드는 손대지 않았다.

### 모델 routing에 대한 정직한 기록
이번에도 **서브에이전트를 하나도 띄우지 않았다.** 단일 세션이 측정·수정·검증을
전부 수행했으므로 3-모델 파이프라인을 수행했다고 기록하지 않는다.

## Completed — Round 14 (오늘 확인할 것 / 오늘 판단·처치 압축, 이전 세션)

### 1. `오늘 확인할 것` — 아무것도 기록되지 않았으면 한 줄
설진/맥진/복진/추가문진 네 줄이 전부 미기록일 때, 화면은 "넷 다 아직 안 했다"는
사실 하나를 카드 하나 분량으로 말하고 있었다. 이제 그 사실은 한 줄
(`설진 · 맥진 · 복진 · 추가 문진 — 4건 미확인`)로 읽히고, 줄들은 `빠른 입력`을
눌러야 나온다. **한 줄이라도 기록이 있으면 접히지 않는다** — 접힘은 모드가 아니라
"비어있음"의 성질이다. 펼침은 렌더 안에서 단방향이라, 입력 중 마지막 값을 지워도
손 밑에서 줄이 닫히지 않는다. 기본 체크리스트 높이 **269px → 36px**.

### 2. `오늘 판단·처치` — 핵심 3필드
Herbal 카드는 텍스트영역 **4개가 동시에 열려 있던 마지막 자리**였다. Pain 카드와
같은 분리를 적용했다. 어느 필드가 무엇인지는 이름이 아니라 **무엇을 기록하는가**로
정했다:

- 판단 = 최종 변증·병기, 처치 = 처방·계획, 재검 = 추적할 증상 → 기본 노출
- 치법 = Pain의 `치료 초점`에 해당하는 "치료의 원칙" → 접힘, 값이 있으면 자동 펼침

`처방/계획 메모`는 이름에 "메모"가 있지만 **환자가 실제로 받는 것을 기록하는 유일한
필드**라 기본에 남겼다. 이걸 접었다면 상세가 아니라 처치를 숨긴 것이 된다.

**처치용 chip/tap은 넣지 않았다.** 리뷰는 "이미 승인된 기존 치료 라벨·데이터를
재사용할 수 있는 경우에만"이라는 조건을 달았는데, 이 저장소에는 그런 어휘가 없다 —
`TREATMENT_*` 상수는 전부 LBP/NECK 안전 게이트이고, coreSpec의 `주사·약침`은
"다른 곳에서 받은 치료"를 묻는 **환자 문진 선택지**이지 이 한의원이 시행하는 처치
목록이 아니다. 없는 어휘를 만드는 것은 이 라운드가 금지한 환자사실 → 치료 매핑
그 자체다.

### 3. 브라우저 QA가 잡은 내 실수 1건
분리만 해서는 **높이가 오히려 42px 늘었다.** `.workspace__finalAssessment__fields`가
2열 그리드라, 4필드도 3필드도 똑같이 2행을 쓰고 거기에 disclosure 상자가 얹혔기
때문이다. 마크업 테스트로는 절대 안 잡힌다(클래스는 다 맞으니까). 실측이 잡았고,
두 가지로 고쳤다: 기본 3필드를 넓은 화면에서 **1행(3열)**으로 배치(1100px 미만은
기존대로 1열), 그리고 카드 안에 들어가는 secondary disclosure를 **테두리 없는
컴팩트 형태**로(상자 안 상자 제거, 닫힘 높이 40px → 28px).

### 측정 결과 (`3935778` 대비, 1440×900, 같은 스크립트)

| 레코드 | round 13 | round 14 | 차이 |
| --- | --- | --- | --- |
| 기본(합성 데이터 없음, 프로덕션 형태) | 1248px | **1028px** | −220px |
| SYNTHETIC · 단순 기계적 요통 | 1966px | 1884px | −82px |
| SYNTHETIC · 요통 + 다리 증상 | 1956px | 1874px | −82px |
| SYNTHETIC · 어깨(불확실/재검) | 1983px | 1901px | −82px |
| SYNTHETIC · 소화·피로 | 1636px | 1460px | −176px |
| SYNTHETIC · 수면·열감/발한 | 1362px | 1322px | −40px |
| SYNTHETIC · 혼합/모순 | 1448px | 1408px | −40px |
| SYNTHETIC · 요통 + 한약 추가문진 | 1568px | 1486px | −82px |

기본 레코드 1.39 → **1.14 viewport**, 전체 콘텐츠 대비 기본 노출 비율 42% →
**39%** — round 11이 세운 30~40% 목표에 처음으로 들어왔다. 회귀는 한 레코드도 없다.

### 모델 routing에 대한 정직한 기록
리뷰가 Fable(총괄)/Opus(UI·임상경계 검수)/Sonnet(구현) 분담을 다시 권고했고
"서브에이전트를 실제로 띄우지 않았으면 그렇다고 명확히 말하라"고 했다.
**하나도 띄우지 않았다.** 단일 세션이 전부 수행했으므로 3-모델 파이프라인을
수행했다고 기록하지 않는다.

## Completed — Round 13 (Doctor Preview 최종 비임상 단순화, 이전 세션)

기본 임상 화면에서 "지금 행동을 바꾸지 않는 것"을 한 겹 더 걷어냈다.
새 임상 규칙 없음, 데이터 삭제 없음.

### 1. preview/QA 컨트롤을 임상 화면에서 뺐다
`DoctorView.tsx`에 `isDoctorPreviewContext()`를 추가했다 —
`import.meta.env.DEV` 또는 `VITE_PREVIEW_MODE === 'true'`일 때만 참이다
(이미 있던 preview 빌드 관례를 그대로 쓴다. 항상 켜진 새 플래그가 아니다).
데이터 소스 스위치(fixtures/server)와 fixture 픽커는 이 컨텍스트에서만
렌더된다. 프로덕션 빌드의 기본값은 `server` 모드다. `initialFixtureIndex`
prop도 기본값 0을 없애서 "명시적으로 넘겼다 = preview다"라는 신호가 되게
했다(테스트/미리보기 배포는 그대로 동작).

### 2. `오늘 확인할 것`을 탭 우선으로 바꿨다
- **진찰 제안 카드**: 결과를 기록하면 좌우 버튼 + 자유 입력이 항상 펼쳐져
  있어서, 원장이 할 말을 다 한 뒤에도 카드가 "채워야 할 폼"처럼 보였다.
  좌우·메모를 `상세·메모 추가` 뒤로 넣되, **둘 중 하나라도 값이 있으면
  처음부터 열린 상태로 렌더**한다(압축이 이미 쓴 내용을 숨기는 일 없음).
- **설진/맥진/복진/추가문진 체크리스트**: 네 줄 전부 항상 열린 자유
  입력이었다. 가장 흔한 경우("봤고, 특이사항 없음")를 **탭 한 번**으로
  만들고, 자유 입력은 `메모`를 눌러야 열린다. 이미 자유 텍스트가 있는
  줄은 열린 채로 렌더된다.
- **일부러 하지 않은 것**: 리뷰가 제안한 `확인` / `특이없음` 리라벨링 중
  진찰 카드 쪽은 적용하지 않았다. 그 버튼들의 승인된 의미는
  `양성/이상 소견` / `음성/정상`이고, 이름을 바꾸면 **원장이 무엇을
  주장하는지가 달라진다** — 이번 라운드가 금지한 임상적 재해석이다.
  대신 입력 표면만 압축했다(근거는 `ExamSuggestionCard.tsx` 주석에 기록).
- `특이없음` 버튼은 **라벨과 저장되는 문자열이 완전히 같다**(round 10의
  "carry-forward 라벨은 쓰는 것과 일치해야 한다" 규칙을 그대로 적용).
  추론·점수화·재서술 없음. `확인`(소견 없이 '봤다'만 기록) 버튼은 넣지
  않았다 — 아무 소견도 없는 '완료' 표시는 기록이 아니고, 위의
  `확인 필요 N건` 카운터가 이미 미확인을 추적한다.

### 3. `다음 액션` 빈 상태를 한 줄로
아무것도 기록되지 않았을 때 `아직 기록 없음` 3행이 같은 말을 세 번 하고
카드 하나만큼 자리를 먹었다. 한 줄(`다음 액션 미설정 — …`)로 줄이되,
**셋 중 하나라도 값이 생기면 즉시 전체 읽기로 돌아온다** — 접힘은
모드가 아니라 "비어있음"의 성질이다.

### 측정 결과 (정직하게)
`ebfad17`(round 12 HEAD)와 working tree를 각각 빌드해 1440×900에서
같은 방식으로 측정했다. 임상 워크플로 높이:

| 레코드 | before(ebfad17) | after | 차이 |
| --- | --- | --- | --- |
| 기본(합성 데이터 없음, 프로덕션 형태) | 1320px | 1248px | −72px |
| SYNTHETIC · 단순 기계적 요통 | 2032px | 1966px | −66px |
| SYNTHETIC · 요통 + 다리 증상 | 2021px | 1956px | −65px |
| SYNTHETIC · 어깨(불확실/재검) | 2049px | 1983px | −66px |
| SYNTHETIC · 소화·피로 | 1706px | 1636px | −70px |
| SYNTHETIC · 수면·열감/발한 | 1430px | 1362px | −68px |
| SYNTHETIC · 혼합/모순 | 1513px | 1448px | −65px |
| SYNTHETIC · 요통 + 한약 추가문진 | 1633px | 1568px | −65px |

기본 레코드 기준 1.47 → **1.39 viewport**, 전체 콘텐츠 대비 기본 노출
비율 43% → **42%**. 기본 화면에 열린 채로 있던 자유 입력 상자는
**4개 → 0개**.

**과장하지 않고 적는다**: 라운드당 −65~72px, 약 3~5% 감소다. round 11이
이미 큰 덩어리(원문 문진/페이로드/EMR 프리뷰/명리)를 자료 탭으로 옮긴
뒤라, 이번 라운드에 남아 있던 것은 "폼처럼 보이던 입력 표면"뿐이었다.
방향은 맞고 회귀도 없지만, round 11급의 감소는 아니다.

### 모델 routing에 대한 정직한 기록
리뷰가 Fable/Opus/Sonnet 분담을 다시 언급했으나, 이번 라운드도
**서브에이전트를 하나도 띄우지 않았다** — 단일 세션이 전부 수행했다.
`CLAUDE.md`의 "역할은 선언만으로 실행되지 않는다" 규칙대로, 3-모델
파이프라인을 수행했다고 기록하지 않는다.

## Completed — Round 12 (Doctor Preview UI 폴리시, 이전 세션)

round 11의 구조 압축 위에 가독성·위계·클릭 효율만 손봤다. 제품 범위 추가 없음.

### 위계
- **네 계층에 이름을 붙였다** — `오늘 한눈에 → 오늘 확인할 것 → 오늘 판단·처치
  → 다음 액션`. 카드가 아니라 **텍스트 라벨**이라, 테두리·배경·중첩을 하나도
  더하지 않고 순서가 읽힌다.
- **읽기 전용 vs 원장 입력을 시각적으로 분리했다.** 읽기 전용(한눈에/다음
  액션/간단 재확인/이전 방문)은 페이지 배경 위, 원장이 타이핑하는 영역
  (최종 판단/Follow-up/관리 계획/재검)은 raised surface + primary 좌측 accent.
  라벨을 읽지 않아도 구분된다.
- **가장 시끄럽던 테두리를 줄였다** — `.workspace__finalAssessment`의 4면
  2px primary box를 1px 일반 테두리 + 좌측 accent로. 위 규칙이 이미 입력
  영역임을 표시하므로 상자까지 소리칠 필요가 없다.
- 안전은 위치와 좌측 danger accent 하나로 먼저 읽히게 두고, h3만 danger
  색으로. 채우기·굵기 추가 없음(“dominant but not noisy”).
- `자료 보기`/`명리` 탭을 더 작고 흐리게 — `진료`만 굵게.

### 밀도
`.workspace` gap 18→10px, 카드 padding 16/18→12/16, radius 14→12,
disclosure summary 12→8px(터치 타깃은 40px 유지), NEXT ACTION 행 padding
6→3px. 임상 흐름 높이는 **1321px → 1320px**로 사실상 동일(1.47 viewport) —
줄인 여백을 계층 라벨이 가져갔다. **위로 회귀하지 않는다**는 요구는 충족.

### 이번 라운드에 브라우저 QA가 잡은 내 실수 1건
읽기 전용/입력 구분 규칙을 파일 **앞쪽**에 썼는데, 뒤에 오는 카드별
background/border 규칙이 같은 specificity로 덮어써서 **두 영역이 완전히
동일하게 렌더**됐다. 마크업에는 클래스가 다 있으니 마크업 테스트로는
잡히지 않는다. computed style을 읽는 브라우저 체크가 잡았고, 규칙을 파일
끝으로 옮겨 해결했다(이유를 주석에 남김).

### 모델 routing에 대한 정직한 기록
리뷰가 Fable(오케스트레이션)/Opus(IA·회귀 검수)/Sonnet(구현) 분담을
권고했으나, `CLAUDE.md`의 "역할은 선언만으로 실행되지 않는다" 규칙대로
이 라운드는 **단일 세션이 전부 수행**했다. 서브에이전트를 띄우지 않았으므로
3-모델 파이프라인을 수행했다고 기록하지 않는다.

## Completed — Round 11 (Doctor Preview v2 — 10초 임상 화면, 이전 세션)

기본 원장 화면이 "정보 보관소"가 아니라 **임상 행동 화면**이 되도록 기본
노출 정보를 대폭 줄였다. 데이터는 하나도 삭제하지 않았다.

### 기록 화면을 3개 surface로 분리
`진료`(기본) / `자료 보기` / `명리`. 이전에는 워크스페이스 아래로 전체
문진 transcript, 약물·병력, 명리, 녹취·EMR, 레거시 판단 폼, 원본 JSON이
한 페이지에 세로로 쌓여 있었다. 이제 `진료`에는 임상 흐름만 있고 나머지는
클릭 한 번 거리에 있다. 명리는 임상 워크스페이스 안에서 **완전히** 사라졌다
(herbal 워크스페이스 안에 접혀 있던 `명리 참고` 블록도 제거 — 이제 별도
surface에만 존재한다).

비활성 surface는 `hidden`으로 두고 unmount 하지 않는다. 이유는 상태 보존이
먼저다 — EMR 요약이나 판단 폼을 반쯤 입력하고 다른 화면을 봤다 돌아왔을 때
내용이 남아야 한다. 기본 화면의 *보이는* 정보량과 스크롤 길이는 `hidden`
만으로 이미 달성되므로, unmount는 얻는 것 없이 상태만 잃는다.

### 워크스페이스를 4계층으로 압축
1. **오늘 한눈에** — 주호소/기간/악화요인/안전상태. 안전은 무조건 기본 노출.
2. **오늘 확인할 것** — 내용이 있을 때만 렌더. production 제안 목록은 임상
   승인 전까지 비어 있으므로, 빈 "추천" 블록이 매번 자리를 차지하지 않는다.
3. **오늘 판단·처치** — 기본은 판단/처치/재검 3개. `치료 초점`은 접힘
   (이미 내용이 있으면 자동으로 펼쳐짐 — 기록된 것이 숨는 일은 없다).
   Follow-up Target 선택이 바로 아래.
4. **다음 액션** — 기록된 값을 읽어주는 compact 카드. 전체 Care Plan 폼과
   다음 재평가 계획은 disclosure 하나 뒤.

기본에서 내린 것: Clinical Loop 체크리스트(매 방문 필수처럼 보였음), 이전
방문 상세, 환자 전달문 미리보기, EMR 미리보기 → 워크스페이스 참고 drawer 1개.

### 실제 브라우저로 측정한 결과 (fixtures, 1440×900)
- 임상 흐름: **1321px = 1.47 viewport** (목표 1–1.5 이내)
- 기본 화면은 전체 콘텐츠 높이의 **약 43%**
- 기본 화면에 보이는 section 5개 / 참고 surface 10개

### 이번 라운드에 QA가 잡은 내 실수 1건
참고 drawer를 만들면서 `EmrPreviewCard`를 drawer 안에 넣고 원본을 지우려
했는데, `replace(..., 1)`이 **drawer 안에 새로 넣은 쪽**을 지워 원본이 밖에
남았다. 그 결과 EMR 미리보기(266px)가 기본 화면에 그대로 노출됐다. 마크업
테스트는 통과했고(존재는 하니까), **브라우저 높이 측정이 잡았다.**

## Completed — Round 10 (round 9 re-review 5차 수정, 이번 세션)

리뷰가 지적한 3건. 모두 비임상 정확성/provenance 문제다.

### 1. 스테이션 간 "이동"은 물리적으로 단일 스테이션이 아니었다
round 9는 같은 visit을 들고 있는 다른 스테이션을 **해제한 뒤** 대상
스테이션에 같은 visit/token을 설치했다. 그러나 옛 태블릿이 이미 폴링으로
raw token을 가져간 뒤에는 폴링을 멈추므로, **서버 레코드를 지워도 그
물리적 화면에 남아있는 capability는 회수되지 않는다.** 즉 "성공한 이동"이
같은 살아있는 토큰을 두 화면에 남길 수 있었다. 게다가 대상 스테이션 쓰기가
해제 이후 실패하면, 재사용(reused) 세션은 롤백 대상이 아니므로 어느
스테이션에도 배정되지 않은 채 살아남았다.

수정: **이동을 수행하지 않고 거절한다** (`visit_assigned_elsewhere`, 409).
직원이 옛 스테이션을 먼저 초기화해야 하고, 초기화는 capability를 실제로
회수하므로 다음 배정은 새 capability를 발급한다. 거절은 보상 트랜잭션이
필요 없다 — 성공할 것이 아니면 아무것도 건드리지 않는다.

테스트: (a) 옛 태블릿이 이미 토큰을 가져간 상태에서의 이동 → 409이고 옛
태블릿이 그대로 유지된다, 초기화 후 배정하면 **회수된 토큰의 재생이 아니라
새 토큰**을 받는다. (b) 재사용 세션 재핸드 중 대상 스테이션 쓰기 실패 →
원래 배정과 capability가 그대로 남고 두 번째 재진이 생기지 않는다.

### 2. 초기화 vs 제출 경합 — 취소가 배정 해제보다 먼저여야 한다
round 9의 `resetStation`은 배정을 먼저 지우고 스테이션 락을 놓은 뒤
best-effort로 토큰을 무효화했다. 그 사이 stale 태블릿이 POST를 보내 visit
락을 먼저 잡으면, **직원이 이미 초기화를 누른 뒤에 답변이 수락**될 수 있었다.

수정: **취소를 먼저, 배정 해제를 나중에.** 두 실패 모양의 비대칭이 이유다 —
"바쁜 스테이션에 죽은 토큰"은 눈에 보이고 재시도하면 되지만, "초기화 후
수락된 응답"은 조용한 기록 오염이다. 배정 해제는 `clearAssignment(stationId,
expectedVisitId)`로 조건부가 되어, 취소가 visit 락을 기다리는 동안 정당하게
들어온 새 세션을 실수로 지우지 않는다.

역방향도 같은 순서가 처리한다: 제출이 이미 visit 락을 쥐고 있으면
`invalidateActiveForVisit`가 기다렸다가 CONSUMED를 발견하고 건드리지 않는다 —
이미 수락된 답변은 경합에서 진 초기화에 의해 절대 되돌려지지 않는다.

테스트: 스테이션 쓰기 실패를 주입해 **순서를 결정적으로 고정**했다(벽시계
경합 없음). 취소-우선이면 "죽은 토큰 + 여전히 바쁜 스테이션"이 관측되고,
해제-우선이었다면 "살아있는 토큰 + 해제된 스테이션"이 관측된다. 이 테스트가
구(舊) 순서에 대해 실제로 실패하는 것을 확인했다. 더해서 (i) 초기화가 권한을
잡은 뒤 stale 토큰은 절대 201을 받지 못하고 응답도 저장되지 않는다,
(ii) 이미 수락된 제출은 이후 초기화가 삭제·변경하지 않고 CONSUMED를
INVALIDATED로 덮어쓰지도 않는다, (iii) 진짜 동시 실행에 대해서는 **순서에
무관한 불변식**("거절된 제출이 저장된 응답을 남기는 일은 없다")으로 검증한다.

### 3. carry-forward 라벨과 실제 기록 대상이 어긋났다
`이전 판단 유지` 버튼이 이전 `finalAssessment` 전체를 복사해
`interventionPerformedOrPlanned`(시행/예정 처치)와 `immediateRetestTarget`
(즉시 재검 대상)까지 채웠다. 판단을 확인하는 것처럼 보이는 클릭 하나로
**오늘의 처치 기록이 생성될 수 있었다.** 임계값 문제가 아니라 provenance
문제다.

수정: 라벨이 긋는 선을 따라 소스를 분리했다.
- `이전 판단 유지` → 최종 임상 판단 + 치료 초점. 그 외 아무것도 쓰지 않는다.
- `이전 처치·관리계획 유지` → 시행/예정 처치 + 즉시 재검 대상 + 관리 계획
  전체. 두 필드가 `finalAssessment`에, 나머지가 `carePlan`에 저장되지만
  이 액션은 **저장 위치가 아니라 의미**를 따라간다.
치료-계획 액션의 blank 가드는 두 객체 전부를 확인하므로 절반만 덮어쓰는 일이
없다. 버튼 title에 각각이 채우는 필드를 명시했다.

테스트: 소스 분리·적용 결과·소스 레벨 가드(판단 함수 본문이
`interventionPerformedOrPlanned`/`immediateRetestTarget`/`carePlan`을
언급조차 하지 않음)까지 고정했고, 브라우저 E2E에도 "이전 방문에 처치 텍스트가
실제로 있는 상태에서 판단 버튼을 눌러도 오늘의 시행/예정 처치·즉시 재검
대상이 비어 있다"를 추가했다. (기존 E2E fixture는 이전 처치 텍스트가 비어
있어 이 검사가 공허했기 때문에, fixture에 처치/관리목표를 채워 넣었다.)

## Completed — Round 9 (round 8 re-review 4차 수정, 이번 세션)

리뷰가 지적한 3건의 엔지니어링 정확성 문제 + 이미 승인된 제품 후속 1건.

### 1. 포인터 권한 TOCTOU 경합 (보안/정확성)
round 7에서 by-visit 포인터를 확인하도록 고쳤지만, **확인과 행위가
`issueToken`의 포인터 교체와 서로 배타적이지 않았다.** 옛 토큰 요청이
"아직 유효한" 포인터를 읽고 → 그 사이 재발급이 포인터를 교체하고 →
이미 진행 중이던 옛 요청이 응답 저장과 CONSUMED 전환을 그대로 끝낼 수
있었다(phase 3은 그 토큰 락을 기다리다 CONSUMED를 보고 무효화를 건너뜀).

수정: 해시로 레코드에 직접 접근하는 **모든 공개 경로**(`resolveToken`,
`consumeTokenWithAction`, `markStarted`)가 `visit:<visit_id>` 락을
먼저 잡고 그 안에서 포인터를 다시 읽는다. 락 순서는 항상 visit → token
으로, `issueToken`의 phase 3 및 `invalidateActiveForVisit`과 동일해
순환이 없다. 잠금 없는 선행 읽기는 **어떤 visit 락을 잡을지 알아내는
용도로만** 쓰고 판단에는 쓰지 않는다(레코드의 visit_id는 불변).

결정적(비타이밍) 경합 테스트 3종 추가 — `withLock`이 호출 시점에 맵
엔트리를 동기적으로 설치하므로 먼저 호출된 쪽이 반드시 먼저 락을 잡는다:
(a) 교체가 이기면 옛 토큰은 fail closed 하고 **actionFn을 아예 실행하지
않는다**(고아 응답이 저장되지 않는다), (b) 수락이 먼저 락을 잡으면
재발급이 실제로 **대기**하고 이미 제출된 답변이 그대로 확정된다,
(c) 읽기 경로도 교체 후 ACTIVE가 아닌 INVALIDATED로 보고한다.
수정 전 코드에 대해 이 테스트가 실제로 실패하는 것을 확인했다(공허하지
않은 회귀 가드).

### 2. 스테이션 배정 경합 / 유일성
- **poll이 assign과 직렬화되지 않았다**: 디스크 메타데이터는 새 배정인데
  in-memory 토큰은 아직 이전 것인 순간에 폴링이 들어오면 **새 배정
  메타데이터 아래 이전 토큰**을 태블릿에 넘길 수 있었다. 이제
  `assignedTokens`가 `{visit_id, token}`을 **함께** 보관하고,
  `pollAssignment`가 `assignSession`/`clearAssignment`와 같은
  `station:<id>` 락 안에서 돌며 visit_id 일치를 확인한다 — 찢어진 쌍은
  WAITING으로 fail closed.
- **visit당 스테이션 유일성이 없었다**: `startRevisit`이 같은 환자/같은
  전달 방식의 재요청을 같은 visit·같은 토큰으로 dedup 하므로, 태블릿 A
  직후 태블릿 B에 배정하면 **하나의 살아있는 토큰이 두 태블릿에** 남을
  수 있었다. 이제 store 전역 `assign:all` 락 안에서 같은 visit을 들고
  있는 다른 스테이션을 먼저 **해제**한다(토큰 무효화가 아니라 단순
  해제 — 지금 넘기려는 바로 그 세션이므로).
- **사용 중인 태블릿 인수 금지**: `StationScreen`은 환자가 질문을 연
  뒤에는 폴링을 멈추므로, 직원이 "재배정"해도 **그 물리적 화면은 바뀌지
  않는다** — 태블릿을 다음 환자에게 건네면 이전 환자 세션이 그대로 보인다.
  파일럿에서는 리뷰 제안대로 **거절**(409 `station_busy`)을 택했다.
  같은 visit의 재배정(같은 세션 다시 건네기)만 허용한다. 원장 UI도
  사용 중 태블릿을 선택 불가로 표시한다.
- **직원 초기화는 이제 능력을 실제로 회수한다**: `resetStation`이 배정
  해제와 함께 그 visit의 토큰을 무효화하고 dedup 캐시도 비운다. 폴링을
  멈춘 채 남아있는 화면이 회수된 세션에 제출할 수 없다.

### 3. `assignRevisitToStation` 부분 실패 원자성
스테이션 쓰기가 실패하거나 `station_busy`로 거절되면, 그 전에 만들어진
재진 visit + 살아있는 토큰이 큐에 고아로 남았다. 이제 두 실패 모양
모두에서 롤백한다. **단, `started.reused`가 true인 경우(dedup 재생)는
절대 롤백하지 않는다** — 그 재진은 이전의 의도적인 행동에 속하며 이미
QR이 떠 있거나 다른 태블릿에 배정되어 있을 수 있다.
실제 파일시스템 실패 주입 테스트 추가(스테이션 레코드의 `.tmp` 경로만
막아 EISDIR 유발) — 고아가 남지 않고, 실패 후 재시도가 **회수된 세션의
재생이 아니라 진짜 쓸 수 있는 새 세션**을 받는 것까지 확인.

### 4. 일상 재진 UI 압축 (이미 승인된 제품 후속)
`RevisitWorkspace`가 Structured Reassessment + 최종 판단 + Care Plan +
Follow-up Target + 다음 재평가 계획을 전부 "반드시 채워야 할 것처럼"
펼쳐두고 있었다. 임상 로직은 전혀 건드리지 않고:
- **환자가 보고한 변화를 맨 위에서 먼저** 읽도록 유지/강조.
- 새 `src/doctor/workspace/revisitCarryForward.ts` — `이전 판단 유지` /
  `이전 처치·관리계획 유지` / `기존 Follow-up Target 유지`. **클릭할
  때만** 적용되고, 오늘 이미 입력된 내용은 절대 덮어쓰지 않는다.
- **이전 객관 소견은 절대 이어가지 않는다**: Structured Reassessment
  항목·진찰 결과·Follow-up Target의 **이전 측정값(baseline/치료직후)**
  은 carry-forward 대상에서 구조적으로 제외했다(Target은 "이걸 계속
  추적한다"는 선택만 id/label로 넘어가고 오늘 값은 빈칸에서 시작).
- Structured Reassessment / 다음 재평가 계획은 `<details>`로 접었다
  (내용이 이미 있으면 자동으로 펼쳐지므로 기록된 것이 숨지 않는다).
- 제출 문진이 Pain/Herbal 두 벌 필드를 갖는 것에 반해 재진은 generic
  한 벌이므로, 두 계열의 임상가 작성 텍스트를 **줄바꿈으로 합쳐** 넘긴다
  (어떤 텍스트도 조용히 버리지 않는다). 점수화·임계값·재해석 없음.

## Completed — Round 8 (전달 채널 무관 Micro Follow-up + 원내 태블릿, 이번 세션)

### 실제 접수 워크플로 (클릭 단위)
1. 직원이 원장 화면에서 **기존 환자 기록을 선택**한다(이름/전화 매칭
   아님 — 이미 화면에 있는 그 환자의 patient_id를 그대로 씀).
2. "재진 간단 문진" 패널에서 **전달 방식**을 고른다(기본값 = 원내 태블릿).
3. 태블릿 드롭다운에서 기기를 고르고 **"이 태블릿에 배정"** 1클릭.
4. 환자에게 그 태블릿을 그냥 건네준다. 환자는 이름·전화·생년월일을 입력
   하지 않고, QR도 스캔하지 않고, 큰 버튼/짧은 입력만 한다.
5. 제출하면 태블릿이 스스로 "감사합니다" → 대기 화면으로 돌아간다.
원장 개입이 필요 없다.

### 태블릿(스테이션) 워크플로
- 직원이 태블릿을 한 번만 **등록**한다(예: 접수 태블릿 1) → 1회용 페어링
  링크가 화면에 뜬다(이 화면을 벗어나면 다시 볼 수 없음).
- 그 링크를 **해당 태블릿에서 한 번** 열면 기기 credential이
  localStorage에 저장되고 URL에서 즉시 지워진다. 이후 태블릿은 계속
  대기 화면에 머문다.
- 대기 화면에는 **환자 식별정보가 일절 없다**(poll 응답 자체에 없음).
- 배정되면 폴링으로 받아 기존 `FollowUpScreen`을 그대로 렌더한다 — 질문
  흐름을 복제하지 않으므로 QR 경로와 **완전히 동일한 코드/동일한 저장
  데이터**가 된다.

### 구현 항목
1. **delivery_mode** (CLINIC_TABLET/PERSONAL_QR/STAFF_ASSISTED/
   PREVISIT_LINK) — 순수 운영 메타데이터. allowlist 검증, 인식 불가 값은
   null로 정규화(링크 발급을 절대 막지 않음). 질문·추적 대상·threshold·
   라우팅에 아무 영향 없음.
2. **운영 타임스탬프** — session_created_at / assigned_at /
   patient_started_at / submitted_at. 재진 큐가 이제 "환자 입력 대기"와
   "환자 작성 중"(IN_PROGRESS)을 구분한다.
3. **inputProvenance** (PATIENT_SELF / STAFF_ASSISTED) — 둘 다 여전히
   **환자가 보고한 사실**이며 원장 관찰 소견이 아니다. 공개 환자 경로는
   PATIENT_SELF를 하드코딩하므로 클라이언트가 직원 귀속을 주장할 수
   없고, STAFF_ASSISTED는 직원 인증된 저장 경로에서만 설정된다.
4. **`server/stationStore.js`(신규)** — 태블릿 = 256bit 기기 credential
   (해시만 저장, 평문은 페어링 링크로 1회만 반환), 기존 capability-token
   모델과 동일한 패턴. 스테이션당 배정 1건, 재배정 시 밀려난 세션 토큰을
   무효화(단, **배정 성공 후에 무효화** — round 6의 순서 원칙 그대로).
   **raw 토큰은 메모리에만 두고 디스크에 절대 쓰지 않는다.**
5. **라우트** — 직원용 register/list/assign/reset은 기존 doctor 가드
   (개수 22→26), 태블릿 자신의 poll/complete는 기기 credential로만 인증
   하고 `{status, token}`만 반환(환자 식별정보 없음).
6. **클라이언트** — `src/lib/stationClient.ts`(serverClient/doctorToken
   미import, 소스 레벨 테스트로 고정), `src/screens/StationScreen.tsx`
   (키오스크), `#station` / 1회용 `#station-setup=` 라우트.
7. **QR** — `qrcode` 의존성 추가(프로덕션 취약점 0건),
   `FollowUpQrCode.tsx`가 **텍스트로 이미 보이는 그 opaque 링크만**
   인코딩. 클라이언트에서만 생성(서버가 이미지를 저장하지 않음).
8. **접수 UI** — 전달 방식 선택 → 태블릿 배정/QR/대필 안내/내원 전 링크
   분기, 태블릿 관리 패널, 재진 큐 행에 전달 방식·태블릿명·대필 표시.

### 이번 라운드에 실제 브라우저 QA가 잡은 진짜 버그 1건
`x-station-credential`이 CORS preflight의 `Access-Control-Allow-Headers`
에 없어서 **브라우저에서만** 스테이션 폴링이 전부 차단되고 있었다(HTTP
레벨 테스트는 node fetch라 preflight를 하지 않아 통과했다). 헤드리스
브라우저 E2E가 아니었으면 배포 후에야 발견됐을 종류의 버그다.

`tests/station.spec.mjs`(신규, 55 assertion, `test:all`에 편입). 실제
헤드리스 브라우저 QA 2종: 재진 39개 체크 + 스테이션 26개 체크 전부 통과.

## Completed — Round 7 (round 6 리뷰 3차 엔지니어링 수정, 이번 세션)
"Round 6 re-review"가 지적한 3개 항목을 전부 수정했다. 새 임상
threshold/추론/라우팅은 추가하지 않았다.

1. **pointer 권위(pointer authority) 강제** —
   `server/followUpSessionStore.js`의 `resolveToken`/
   `consumeTokenWithAction`이 이제 토큰 레코드를 해시로 직접 읽은 뒤,
   해당 visit의 by-visit pointer가 실제로 이 토큰 해시를 가리키는지
   검증한다. `status`가 자신의 파일에 여전히 ACTIVE로 남아있어도(round
   6의 phase 3 무효화 쓰기가 실패한 경우) pointer가 다른 토큰을 가리키면
   INVALIDATED로 취급한다. `resolveToken`(읽기전용 공개 GET)은 이
   보정을 응답에만 반영하고 디스크에 쓰지 않으며, `consumeTokenWithAction`
   은 이미 보유한 락 안에서 잘못된 on-disk status를 self-heal(보정하여
   저장)한다. "pointer 전환은 성공, old 토큰 무효화 쓰기만 실패"를
   정밀 failure injection으로 재현해 old GET/POST가 fail closed(
   INVALIDATED)되고 new 토큰은 계속 정상 동작함을 검증.
2. **FollowUpScreen 자신의 state에서도 토큰 제거** — round 6는
   `App.tsx`(부모)의 `followUpToken`만 비웠고, `FollowUpScreen.tsx`
   내부의 `const [activeToken] = useState(token)`(마운트 시점에 고정된
   자신만의 사본)은 완료 화면이 떠 있는 동안 계속 평문 토큰을 들고
   있었다. `handleSubmit` 성공 직후 `setActiveToken(null)`을 호출해
   이 사본도 명시적으로 비운다 — 이 시점 이후로는 `activeToken`을 다시
   읽는 코드가 없으므로(최초 fetch effect는 마운트 시 1회만 실행,
   submit 호출은 이미 인자로 값을 넘긴 뒤) 완료 화면 렌더링에 영향
   없음.
3. **RevisitWorkspace 레코드별 state 리셋** — 새 visitId/patientId
   로드 effect 시작 시(비동기 fetch 전에) `priorHistory`/
   `priorSubmission`/`priorVisitWorkspace`/`microFollowUpResponse`를
   전부 null로 리셋하도록 추가했다. 기존에는 로딩 스피너가 "성공"
   케이스에서만 이전 값을 가려줬을 뿐, 새 레코드의 prior-detail fetch가
   실패하면 loading=false 이후 이전 환자의 데이터가 그대로 화면에
   남을 수 있었다. 실제 헤드리스 브라우저로 재진1→재진2→(재진1의 자체
   prior-detail fetch를 강제 실패시키며)재진1로 전환해도 재진2의
   Care Plan 텍스트가 재진1의 "이전 방문 참고" 영역에 새지 않음을
   확인.

`tests/follow-up-session.spec.mjs` 151 → 158 assertion(pointer 권위
failure injection 7건 추가). 실제 헤드리스 브라우저 QA 38 → 39
체크(교차 레코드 stale-data 검증 1건 추가).

## Completed — Round 6 (round 5 리뷰 2차 엔지니어링 수정, 이전 세션)
"Round 5 follow-up" 리뷰가 지적한 7개 항목을 전부 수정했다. 새 임상
threshold/추론/라우팅은 추가하지 않았다.

1. **재발급(reissue) 실패 안전성** — `server/followUpSessionStore.js`의
   `issueToken`을 "old 토큰 무효화 → new 토큰/pointer 쓰기" 순서에서
   "new 토큰 레코드 쓰기(phase 1, old는 완전히 안 건드림) → pointer를
   new로 원자적 전환(phase 2) → 성공 후에만 old를 best-effort 무효화
   (phase 3)"으로 재작성. phase 2가 실패하면 phase 1에서 방금 쓴 new
   토큰 레코드를 즉시 삭제(cleanup)하고 rethrow — old 토큰/링크는 어느
   실패 지점에서도 절대 파괴되지 않는다. (a) new 토큰 쓰기 실패, (b)
   pointer 쓰기 실패 두 지점 모두 실제 파일시스템 failure injection으로
   검증.
2. **startRevisit의 부분쓰기 정리** — 위 1번 수정으로 `issueToken` 자체가
   all-or-nothing이 되어, `startRevisit`의 기존 rollback(방금 만든 visit
   삭제)이 어떤 실패 지점에서도 visit/토큰/pointer 아티팩트를 전혀 남기지
   않음을 재확인.
3. **응답 수락의 멱등성** — `server/microFollowUpStore.js`의
   `saveResponse`를 visit_id당 write-once로 변경: 이미 저장된 응답이
   있으면 새 입력을 무시하고 기존 레코드를 그대로 반환한다. round 5가
   만든 "저장 성공 → 토큰 CONSUMED 쓰기 실패" 창에서, 재시도가 이미
   저장된 첫 응답을 덮어쓰는 문제를 닫는다. 저장 성공 직후 CONSUMED
   쓰기만 실패하도록 정밀 failure injection(해당 토큰의 `.tmp` 쓰기
   대상만 차단, 다른 토큰 읽기는 전혀 방해하지 않음)으로 검증 — 재시도가
   첫 응답을 덮어쓰지 않음을 확인.
4. **중복 재진 생성 방지** — `server/store.js`의 `startRevisit`이
   patient_id별로 직렬화(lock)되고, 짧은 in-memory dedup 윈도우 내에서
   해당 환자의 직전 재진이 아직 "응답 없음"(pending) 상태면 새 visit을
   만들지 않고 SAME 결과(같은 visit, 같은 토큰)를 재사용한다. 이미 응답이
   저장된(완료된) 재진에는 적용되지 않음 — round 5의 longitudinal
   시나리오(재진1 완료 → 재진2 시작)가 여전히 정상 동작함을 재확인.
   `src/doctor/DoctorView.tsx`의 "재진 간단 문진 시작" 버튼도 요청
   진행 중에는 비활성화(방어 계층 추가). 실제 동시(Promise.all) 호출
   테스트로 정확히 visit 1개만 생성됨을 검증.
5. **재진의 재진(revisit-of-revisit) 이전 맥락 완전성** —
   `RevisitWorkspace.tsx`가 이전 방문이 submission-backed일 때만
   `getSubmission`으로 상세를 불러오던 것을, 이전 방문이 그 자체로
   재진(no-submission revisit)일 때도 `getVisit`으로 그 visit-owned
   워크스페이스를 읽기 전용으로 불러오도록 확장 — 재진1의 Care
   Plan/재검(Structured Reassessment) 상세가 재진2에서 사라지지 않는다.
6. **React 메모리에서 토큰 해제** — round 5가 URL/history는 스크럽했지만
   `App.tsx`의 `followUpToken` 상태 자체는 그대로 남아있던 문제. 제출
   성공 시 `FollowUpScreen`이 `onCompleted` 콜백으로 부모의 토큰 상태를
   null로 만들고, `followUpActive`라는 별도 플래그로 "이 라우트를 계속
   보여줄지"를 분리해 완료 화면이 사라지지 않게 했다. `FollowUpScreen`
   자신은 마운트 시점의 토큰을 내부 state로 고정해 이후 부모의 null화가
   자신의 fetch effect를 재실행시키지 않도록 함.
7. **오래된 주석 정리** — `microFollowUp.ts`/`MicroFollowUpCard.tsx`/
   `FollowUpTargetPicker.tsx`/`DoctorView.tsx`/`serverClient.ts`의
   "OPERATIONAL INTEGRATION REQUIRED"/환자 화면 없음 시절 주석을 round
   4 이후의 실제 상태(환자 화면 존재, 별도 capability-token 경로)로
   갱신. 코드 주석만 — 새 문서 없음.

`tests/follow-up-session.spec.mjs` 134 → 151 assertion(재발급 failure
injection 2건, 멱등성 failure injection 1건, 동시-시작 1건 추가),
`tests/server.spec.mjs`도 write-once 회귀 테스트 추가(211 → 213
assertion). 실제 헤드리스 브라우저 QA 29 → 38 체크(중복클릭 disable,
재진의 재진 맥락, 완료 후 새로고침 시 폼 미노출 추가).

## Completed — Round 5 (round 4 리뷰 엔지니어링 수정, 이전 세션)
GitHub PR review(round 4 follow-up)가 지적한 6개 항목 + edge tightening을
전부 수정했다. 새 임상 threshold/추론/라우팅은 추가하지 않았다.

1. **startRevisit 원자성** — `server/store.js`의 `startRevisit`이
   visit 생성 → target 도출 → 토큰 발급을 try/catch로 감싸, 토큰 발급
   실패 시 방금 만든 visit을 롤백 삭제(`server/visitStore.js`의
   `deleteVisitForRollbackOnly` — HTTP 라우트로는 절대 노출되지 않는
   rollback 전용 함수)하고 rethrow. 고아 visit이 남지 않음을 파일시스템
   레벨 failure injection 테스트로 확인.
2. **환자 응답 내구성** — `server/followUpSessionStore.js`에
   `consumeTokenWithAction(rawToken, actionFn)` 추가: 토큰 상태를 락 안에서
   검증 → `actionFn`(내구성 저장, 예: micro-follow-up 저장)을 먼저 실행 →
   성공해야만 토큰을 CONSUMED로 마킹. 저장이 실패하면 토큰은 여전히
   ACTIVE로 남아 같은 링크로 재시도 가능(응답 유실 없음). `consumeToken`은
   이제 이 함수의 얇은 wrapper. `submitFollowUpSession`이 이 경로를 사용.
   failure injection으로 저장 실패 → 토큰 미소비 확인 → 재시도 성공까지
   테스트로 확인.
3. **워크스페이스 단일 진실 공급원(SSOT)** — `saveVisitWorkspace`가
   `record | null` 대신 `{ok:true, record} | {ok:false, reason:'not_found'
   |'submission_backed'}`를 반환하도록 변경(store 레벨 강제). `PUT /api/
   visits/:id/workspace` 라우트도 `submission_id !== null`인 visit을 409로
   거부(HTTP 레벨 강제 — defense in depth). Submission-backed 초진은
   `submission.workspace`만, no-submission 재진은 `visit.workspace`만 쓴다.
4. **재진 간 종단 연결** — `getPatientHistory`가 이제 `submission_id`
   유무로 분기해 no-submission 재진도 히스토리에 포함(이전엔 스킵되어
   재진 #2가 재진 #1이 아니라 초진의 오래된 target을 보는 버그가 있었음).
   프로필(Pain/Herbal)에 무관하게 항상 올바른 최근 target을 주는 신규
   통합 필드 `follow_up_targets`(서버)/`followUpTargets`(클라이언트) 추가
   — submission visit은 pain+herbal target 연결, revisit은 자신의
   generic target 목록. `deriveMicroFollowUpCandidates`/
   `RevisitWorkspace.tsx`/`PriorVisitHistoryCard.tsx` 전부 이 필드로
   전환. 리뷰가 요구한 정확한 회귀 시나리오(초진 target A → 재진1 환자가
   A 현재값 입력 + 원장이 target B 선택 → 재진2는 A가 아닌 B를 받아야
   함, 이전 방문은 불변)를 전용 테스트로 고정.
5. **Micro Follow-up target 답변 형식** — target별 답변이 이제
   좋아짐/비슷함/나빠짐 단일 선택이 아니라 자유 텍스트로 CURRENT 원본
   값을 그대로 받는다(예: "통증 4", "40분") — threshold/추론 없음.
   전반적 변화(좋아짐/비슷함/나빠짐)는 별도의 항상 존재하는 필드로 유지.
   `FollowUpScreen.tsx`에 `TextInputField` 적용.
6. **제출 후 토큰 프라이버시** — 환자 제출 성공 시 `history.replaceState`
   로 현재 URL에서 `#follow-up=<token>`을 제거한 뒤 `history.pushState`로
   그 깨끗한 URL을 한 번 더 쌓아, 뒤로가기/새로고침으로도 URL에 토큰이나
   history 어디에도 남지 않게 했다(기존 "뒤로가기가 채워진 답변을 다시
   보여주지 않는" wall 패턴과 호환). 실제 헤드리스 브라우저로 제출 후
   URL에 토큰 문자열이 전혀 없음을 확인.

Edge tightening(같은 라운드에서 안전하게 처리):
- `saveVisitWorkspace`를 store 레벨에서도 submission-backed visit에 대해
  거부(위 3번과 동일 변경).
- `GET`/`POST /api/follow-up-session/:token`이 잘못된 percent-encoding
  (`decodeURIComponent` throw)을 500이 아닌 기존 INVALID/404 경로로 처리
  (`safeDecodeToken` 헬퍼, `server/index.js`).
- `cleanupOlderThan`이 이제 가리키는 토큰 파일이 사라진 stale
  `by-visit/<visit_id>.json` 포인터 파일도 함께 정리(이전엔 영구 누적).
- Herbal 재진 필드가 이미 Pain 관련 라벨을 UI에 노출하지 않음을 확인
  (`PainFinalAssessmentCard`/`PainCarePlanCard`의 실제 렌더 텍스트는
  이미 완전히 profile-neutral 한국어 — 코드 변경 불필요, 감사만 수행).

## Completed — Round 4 (재진 태블릿 연결, 이번 세션)
round 3의 Remaining #3(Micro Follow-up 환자 태블릿 직접 제출 gap)을
사용자가 승인한 방향대로 닫았다. 설계 근거/대안 검토는 `DECISIONS.md`의
"2026-08-28 — 재진 태블릿 연결" 항목 참고.

1. **서버: 일회용 capability-token 저장소** —
   `server/followUpSessionStore.js`(신규). `randomBytes(32)` 발급, SHA-256
   해시만 저장(평문은 발급 응답 한 번만 존재), visit_id 1개에 고정,
   target 스냅샷은 발급 시점에 캡처(공개 POST가 라벨을 절대 재신뢰하지
   않음), consume은 ACTIVE→CONSUMED 1회만 성공(이중제출 실패), reissue는
   구토큰을 자동 무효화.
2. **서버: 재진 개설 + 토큰 발급 원자적 흐름** — `server/store.js`의
   `startRevisit`/`deriveMicroFollowUpCandidates`/`reissueFollowUpSession`/
   `submitFollowUpSession`/`listRevisitQueue`. 후보 target은 그 환자의
   직전 submission-backed 방문 Follow-up Target에서 최대 3개, 재랭킹
   없음, 없으면 빈 배열(질문 발명 안 함).
3. **서버: 공개 patient 라우트** — `GET`/`POST /api/follow-up-session/
   :token`(doctor 인증/Origin allowlist 전혀 없음 — 환자 자신의 기기).
   GET은 target id/label/상태/만료만 반환(patient_id/이름/전화/사주/
   원장 노트 전부 미포함). 실패한 공개 시도에 대한 간단한 in-memory
   rate limit 추가(새 의존성 없음).
4. **서버: doctor 라우트 6개 추가** — `PUT /api/visits/:id/workspace`,
   `GET /api/visits/revisits`, `POST /api/patients/:id/start-revisit`,
   `GET`/`POST(reissue)`/`POST(invalidate) /api/visits/:id/follow-up-
   session`. 전부 기존과 동일한 `requireDoctor`+Origin allowlist 가드
   (`tests/server.spec.mjs`가 doctor-guarded 라우트 정확히 22개임을 고정).
5. **서버: follow-up-session 전용 보존기한** — `cleanupFollowUpSessions()`
   가 `SAMINDANG_RETENTION_DAYS`와 완전히 분리된 별도 스위치
   (`SAMINDANG_FOLLOWUP_TOKEN_RETENTION_HOURS`, 기본 24h)로 동작 —
   구현 중 결합 버그를 스스로 발견해 커밋 전 분리 수정(DECISIONS.md 참고).
6. **클라이언트: visit-owned WorkspaceState** — `src/doctor/workspace/
   visitWorkspace.ts`(신규) + `RevisitWorkspace.tsx`(신규, DoctorWorkspace
   와 구조적으로 별개 컴포넌트 — 문진 없는 재진을 가짜 DoctorPayload로
   위장하지 않음). 세 구역 분리 렌더: 오늘 환자 입력(Micro Follow-up) /
   이전 방문 참고(읽기 전용) / 오늘 원장 입력(오늘의 새 판단, visit-owned
   저장).
7. **클라이언트: DoctorView 재진 큐 + 발급 UI** — "재진 목록(N)" 섹션
   (`재진 · 환자 입력 대기`/`재진 · 간단 추적 완료`/`재진 · 링크 만료`
   라벨, "추가 확인 필요" 배지는 operational flag일 뿐), "재진 간단 문진
   시작" 버튼, 발급된 링크 표시(만료 시각, 복사, 재발급, 무효화). 후보
   target이 0개면 원장에게 그 사실을 정직하게 안내(질문 발명 안 함).
8. **클라이언트: 환자용 Micro Follow-up 화면** — `src/screens/
   FollowUpScreen.tsx`(신규) + `src/lib/followUpClient.ts`(신규,
   `serverClient.ts`/`doctorToken.ts`를 절대 import하지 않는 별개 파일 —
   doctor 토큰이 환자 흐름에 절대 섞일 수 없다는 것을 소스 레벨에서
   보장, 테스트로 고정). `#follow-up=<token>` 해시 라우트(`App.tsx`).
   완료 화면 도달 후 뒤로가기가 채워진 답변을 다시 보여주지 못하게 막는
   기존 문진 프라이버시 패턴을 동일하게 적용.
9. **테스트** — `tests/follow-up-session.spec.mjs`(신규, 113 assertion):
   토큰 무작위성/형식, 평문 미저장, visit 범위, 무효/만료/소비 거부,
   교차환자 격리, 재발급 시 구토큰 무효화, GET의 신원정보 미노출, POST의
   라벨 변조 불가, doctor 토큰 부재(소스 레벨), 이름/전화/생년월일
   미사용, CORS/바디크기/rate-limit 가드, 보존기한 분리까지 전부 회귀
   테스트로 고정.
10. **실제 헤드리스 브라우저 E2E QA** — 로컬 handoff 서버 + vite dev
    server + Playwright Chromium으로 재진 전체 흐름을 실제로 왕복
    (아래 Tests / Verification 참고, 27개 체크 전부 통과). 이 QA 과정에서
    시딩용 가짜 responses 객체가 DoctorView를 크래시시키는 문제를 2회
    발견 → 실제 프로덕션 빌더로 만든 기존 `src/doctor/fixtures.ts`의
    LBP/NECK fixture를 그대로 재사용하도록 QA 스크립트를 고쳐 해결(이
    자체는 QA 스크립트의 문제였지 프로덕션 코드의 버그는 아니었음).

## Remaining — 원장(임상)/제품/보안 결정이 필요한 항목만
1. `docs/clinical-decision-tables/PAIN_EXAM_RECOMMENDATION_TEMPLATE.md`/
   `HERBAL_PATTERN_CANDIDATE_TEMPLATE.md`에 실제 규칙을 원장이 작성/승인
   (round 1부터 이어지는 항목, round 4에서도 변경 없음).
2. `docs/DOCTOR_WORKSPACE_VIEW_PROFILE_MATRIX.md`의 PRODUCT DECISION
   REQUIRED 항목(Pain Additional module SafetyPanel 간극) — round 2부터
   이어지는 항목, round 4에서도 변경 없음.
3. **(round 3, round 4에서도 미해결) 재진 시 실제 문진 재연결** —
   `visitStore.js`의 신원 원칙(새 제출 = 항상 새 patient_id) 때문에,
   같은 환자가 실제 태블릿으로 새 "전체 문진"을 다시 제출해도 이전
   patient_id와 자동으로 이어지지 않는다(이번 라운드의 "재진 간단 문진"
   경로는 원장이 명시적으로 patient_id를 지정하므로 이 문제가 없다 —
   여기서 미해결인 건 어디까지나 환자가 처음부터 새 전체 문진을 다시
   시작하는 경우다). "이 태블릿 제출을 기존 patient_id에 붙인다"는 판단
   자체가 이름/전화 매칭 없이는 자동화할 수 없는 신원 문제라 새 매칭
   로직을 발명하지 않았다.
4. QR 코드 생성 — 사용자가 "선택 사항, 지연시키지 말 것"으로 명시했으므로
   v1 스코프에서 의도적으로 제외(직접 링크 텍스트만). 실제 클리닉 운영
   시 QR이 필요하면 별도 라운드에서 추가.
5. PR #24는 사용자가 직접 검토 후 merge 여부를 결정한다 — 이 세션은
   merge하지 않는다.

## Blockers
- 없음 (엔지니어링 관점). 위 Remaining 항목은 전부 임상/제품/보안
  판단이라 이 세션이 자체적으로 해소할 수 없는 항목이며, 차단이 아니라
  다음 human action이다.

## Relevant Files (round 8 신규/주요 변경)
- `server/stationStore.js`(신규), `server/followUpSessionStore.js`
  (delivery_mode, patient_started_at, markStarted), `server/store.js`
  (assignRevisitToStation/completeStationAssignment, 큐 운영 메타데이터),
  `server/microFollowUpStore.js`(inputProvenance), `server/index.js`
  (스테이션 라우트 6개 + CORS allow-headers에 x-station-credential).
- `src/lib/stationClient.ts`(신규), `src/screens/StationScreen.tsx`(신규),
  `src/doctor/workspace/FollowUpQrCode.tsx`(신규), `src/App.tsx`
  (#station / #station-setup 라우트), `src/doctor/DoctorView.tsx`(접수
  UI), `src/doctor/workspace/followUpSession.ts`(DeliveryMode/
  InputProvenance/StationInfo 타입), `src/lib/serverClient.ts`(스테이션
  API), `src/doctor/doctor.css` + `src/styles.css`(키오스크/스테이션).
- `tests/station.spec.mjs`(신규, 55 assertion), `package.json`
  (`test:station`, `qrcode` 의존성).

## Relevant Files (round 7 신규/주요 변경)
- `server/followUpSessionStore.js`(`currentPointerHash`/
  `withPointerAuthority` 신규, `resolveToken`/`consumeTokenWithAction`이
  둘 다 사용).
- `src/screens/FollowUpScreen.tsx`(`setActiveToken(null)` 추가),
  `src/doctor/workspace/RevisitWorkspace.tsx`(load effect 시작 시
  prior 관련 state 전부 리셋).
- `tests/follow-up-session.spec.mjs`(151 → 158 assertion, pointer 권위
  Part 2.7 신규).

## Relevant Files (round 6 신규/주요 변경)
- `server/followUpSessionStore.js`(`issueToken` 재작성 — 2-phase 안전한
  swap), `server/store.js`(`startRevisit` dedup 캐시,
  `submitFollowUpSession` 주석 갱신), `server/microFollowUpStore.js`
  (`saveResponse` write-once).
- `src/doctor/DoctorView.tsx`(`startRevisitPending` 상태, 버튼 비활성화),
  `src/doctor/workspace/RevisitWorkspace.tsx`(재진-소유 이전 워크스페이스
  읽기 전용 로드 + 신규 recap 함수), `src/App.tsx`(`followUpActive`
  분리, `onCompleted` 콜백), `src/screens/FollowUpScreen.tsx`
  (`activeToken` 마운트시 고정, `onCompleted` 호출).
- `src/doctor/workspace/microFollowUp.ts`/`MicroFollowUpCard.tsx`/
  `FollowUpTargetPicker.tsx`/`src/lib/serverClient.ts`(오래된 주석 갱신).
- `tests/follow-up-session.spec.mjs`(134 → 151 assertion),
  `tests/server.spec.mjs`(211 → 213 assertion, write-once 회귀 추가).

## Relevant Files (round 5 신규/주요 변경)
- `server/store.js`(`startRevisit` 롤백, `submitFollowUpSession`이
  `consumeTokenWithAction` 사용, `getPatientHistory` 재작성,
  `deriveMicroFollowUpCandidates` 단순화), `server/visitStore.js`
  (`saveVisitWorkspace` 판별 결과 반환, `deleteVisitForRollbackOnly` 신규),
  `server/followUpSessionStore.js`(`consumeTokenWithAction` 신규,
  `cleanupOlderThan`의 stale pointer 정리), `server/index.js`
  (`safeDecodeToken`, workspace 라우트 판별 결과 분기).
- `src/doctor/workspace/longitudinal.ts`(`followUpTargets` 필드),
  `src/lib/serverClient.ts`(`follow_up_targets` 매핑),
  `src/doctor/workspace/RevisitWorkspace.tsx`/`PriorVisitHistoryCard.tsx`
  (신규 필드로 전환).
- `src/screens/FollowUpScreen.tsx`(target 자유텍스트 입력, 제출 후 URL
  토큰 scrub), `src/styles.css`(`.followUp__targetHint`).
- `tests/follow-up-session.spec.mjs`(113 → 134 assertion).

## Relevant Files (round 4 신규/주요 변경)
- `server/followUpSessionStore.js`(신규, capability-token 저장소),
  `server/store.js`(`startRevisit`/`deriveMicroFollowUpCandidates`/
  `reissueFollowUpSession`/`submitFollowUpSession`/`listRevisitQueue`/
  `cleanupFollowUpSessions`/`saveVisitWorkspace`), `server/visitStore.js`
  (`saveVisitWorkspace`, visit record에 `workspace: null` 필드 추가),
  `server/index.js`(doctor 라우트 6개 + 공개 patient 라우트 2개 +
  rate limit + 보존기한 훅).
- `src/doctor/workspace/visitWorkspace.ts`(신규),
  `src/doctor/workspace/followUpSession.ts`(신규, 클라이언트 타입),
  `src/doctor/workspace/RevisitWorkspace.tsx`(신규).
- `src/lib/serverClient.ts`(`getVisit`/`saveVisitWorkspace`/`startRevisit`/
  `reissueFollowUpSession`/`invalidateFollowUpSession`/
  `getFollowUpSessionStatus`/`listRevisitQueue` 추가),
  `src/lib/followUpClient.ts`(신규, 공개 patient 전용 클라이언트 —
  serverClient.ts/doctorToken.ts 미import).
- `src/doctor/DoctorView.tsx`(재진 큐 섹션, 재진 선택/워크스페이스 렌더,
  "재진 간단 문진 시작"/재발급/무효화/링크복사 UI), `src/doctor/doctor.css`
  (`.doctor__revisitSession*`), `src/doctor/workspace/workspace.css`
  (`.workspace__revisit*`).
- `src/screens/FollowUpScreen.tsx`(신규, 환자용 Micro Follow-up 화면),
  `src/App.tsx`(`#follow-up=<token>` 해시 라우트), `src/styles.css`
  (`.followUp*`).
- `tests/follow-up-session.spec.mjs`(신규, 113 assertion),
  `tests/server.spec.mjs`(doctor-guarded 라우트 카운트 16→22 갱신).

## Relevant Files (round 3 신규/주요 변경)
- `src/doctor/workspace/carePlan.ts`, `CarePlanCard.tsx`,
  `patientCarePlanPreview.ts`, `PatientCarePlanPreviewCard.tsx` — Phase A/J.
- `src/doctor/workspace/finalAssessment.ts` — `NextReassessmentPlan` 타입
  추가(Phase B), `REPEAT_VISIT_AUTO_COMPARE_STATUS` 한국어 문구로 수정.
- `src/doctor/workspace/NextReassessmentPlanCard.tsx` — Phase B.
- `server/visitStore.js`(`listVisitsForPatient`), `server/store.js`
  (`getPatientHistory`), `server/index.js`(`GET /api/patients/:id/
  history`), `src/doctor/workspace/longitudinal.ts`,
  `PriorVisitHistoryCard.tsx`, `src/lib/serverClient.ts`
  (`getPatientHistory`) — Phase C.
- `src/doctor/workspace/reassessmentExam.ts`,
  `StructuredReassessmentCard.tsx` — Phase E.
- `src/doctor/workspace/ClinicalLoopStatus.tsx` — Phase G.
- `src/doctor/workspace/additionalConcern.ts`, `AdditionalConcernCard.tsx`
  — Phase H.
- `src/doctor/workspace/rehabSuggestion.ts`, `RehabSuggestionCard.tsx` —
  Phase I.
- `src/doctor/workspace/microFollowUp.ts`, `server/microFollowUpStore.js`,
  `MicroFollowUpCard.tsx`, `src/lib/serverClient.ts`
  (`getMicroFollowUpResponse`/`saveMicroFollowUpResponse`) — Phase D.
- `src/doctor/workspace/persistence.ts` — `WorkspaceState` 스키마
  `1.0.0` → `1.1.0`(모든 신규 필드 추가, 방어적 역직렬화로 구버전 레코드
  안전하게 로드 — 테스트로 확인).
- `src/doctor/workspace/DoctorWorkspace.tsx`/`PainWorkspace.tsx`/
  `HerbalWorkspace.tsx` — 위 전부를 배선.
- `src/doctor/DoctorView.tsx` — `priorVisits`/`microFollowUpResponse`
  fetch 효과 추가.
- `tests/workspace-round3.spec.mjs`(신규, 52 assertion),
  `tests/server.spec.mjs`(longitudinal + micro-follow-up 블록 신규
  추가), `tests/doctor-workspace.spec.mjs`(OPERATIONAL INTEGRATION
  REQUIRED 문구 회귀 가드 7개 시나리오 전체 추가).

## Tests / Verification
- **Round 17 기준 이 세션이 직접 실행**: `npm run test:all`(전체 green — 신규
  `tests/questionnaire-volume.spec.mjs` **36 assertion** 포함), `npm run build`
  (성공), FROZEN diff empty(0 라인). 문진 스펙/로직은 한 줄도 바뀌지 않았다 —
  이번 라운드의 변경은 신규 테스트 파일 1개와 `package.json` 스크립트 배선뿐.
- **Round 16 기준 이 세션이 직접 실행**: `npm run test:all`(전체 green — 신규
  `tests/tablet-viewport.spec.mjs` **24 assertion** 포함), `npm run build`/
  `npm run build:preview`(성공), FROZEN diff empty(0 라인).
- **Round 16 비공허성 확인**: round 15의 CSS 오버라이드를 지우면 신규 CI
  테스트가 가로 1024에서 1.55×로 실패하는 것을 확인한 뒤 되돌렸다.
- **Round 15 기준 이 세션이 직접 실행**: `npm run test:all`(전체 green —
  `tests/doctor-workspace.spec.mjs` 54→**55** assertion), `npm run build`/
  `npm run build:preview`(성공), pytest 80 passed, FROZEN diff empty(0 라인).
- **Round 15 헤드리스 브라우저 QA 4종**: 태블릿 밀도 측정 **18개**(신규, 3뷰포트)
  + preview 42개 + 재진 49개 + 스테이션 30개 전부 통과.
- **Round 15 비공허성 확인**: 태블릿 오버라이드 블록을 1100px 쿼리 앞으로 옮기면
  새 소스 레벨 가드가 실제로 실패하는 것을 확인한 뒤 되돌렸다.
- **Round 14 기준 이 세션이 직접 실행**: `npx tsc -b`(0 에러),
  `npm run build`/`npm run build:preview`(성공), `npm run test:all`(전체 green —
  `tests/doctor-workspace.spec.mjs` 52→**54** assertion), pytest 80 passed,
  FROZEN diff empty(0 라인).
- **Round 14 헤드리스 브라우저 QA 3종**: preview 측정 **42개**(round 13의 35개 +
  빈 체크리스트 접힘/요약문구/빠른 입력 복원 3, 기록 있는 체크리스트 미접힘 1,
  판단·처치 3필드 + 치법 disclosure 2) + 재진 49개 + 스테이션 30개 전부 통과.
- **Round 14 before/after 측정**: `3935778`의 round-13 수치와 같은 스크립트로 비교
  (위 표 참고). 기본 레코드 1248px → 1028px, 기본 노출 비율 42% → 39%.
- **Round 13 기준 이 세션이 직접 실행**: `npx tsc -b`(0 에러),
  `npm run build`/`npm run build:preview`(성공), `npm run test:all`(전체
  green — `tests/doctor-workspace.spec.mjs` 49→**52** assertion), FROZEN
  diff empty(0 라인).
- **Round 13 헤드리스 브라우저 QA 3종**: preview 측정 **35개**(round 12의
  28개 + QA 컨트롤 게이팅 3, 다음 액션 빈 상태 압축 2, 진찰 카드 탭
  우선/메모 온디맨드 2) + 재진 49개 + 스테이션 30개 전부 통과.
- **Round 13 before/after 측정**: `ebfad17`을 실제로 체크아웃해 같은
  스크립트로 재측정한 뒤 working tree와 비교했다(위 표 참고). 기본 레코드
  1320px → 1248px, 열린 자유 입력 상자 4개 → 0개.
- **Round 12 기준 이 세션이 직접 실행**: `npx tsc -b --force`(0 에러),
  `npm run build`/`npm run build:preview`(성공), `npm run test:all`(전체
  green), pytest 80 passed, FROZEN diff empty.
- **Round 12 헤드리스 브라우저 QA 3종**: preview 측정 **28개**(round 11의
  16개 + 계층 라벨 순서, 읽기전용/입력 computed-style 구분, 탭 위계, 환자
  전환 시 진료 복귀 + 이전 환자 UI 상태 미유출, 같은 기록 내 탭 전환 시
  미저장 입력 보존, 태블릿 가로/세로 가로스크롤·터치타깃) + 재진 49개 +
  스테이션 30개 전부 통과.
- **Round 11 기준 이 세션이 직접 실행**: `npx tsc -b --force`(0 에러),
  `npm run build`/`npm run build:preview`(성공), `npm run test:all`(전체
  green — `tests/doctor.spec.mjs` 664, `tests/doctor-workspace.spec.mjs` 49,
  `tests/station.spec.mjs` 100, `follow-up-session` 167, `workspace-round3`
  97, `server` 213), pytest 80 passed, FROZEN diff empty.
- **Round 11 헤드리스 브라우저 QA 3종**: 신규 preview-v2 측정 16개 체크 +
  재진 49개 + 스테이션 30개 전부 통과.
- **Round 10 기준 이 세션이 직접 실행**: `npx tsc -b --force`(0 에러),
  `npm run build`/`npm run build:preview`(둘 다 성공),
  `npm run test:all`(전체 green — `tests/station.spec.mjs` 100 assertion,
  `tests/follow-up-session.spec.mjs` 167, `tests/workspace-round3.spec.mjs`
  97, `tests/server.spec.mjs` 213), `cd "tablet core" && python3 -m pytest
  tests/ -q`(80 passed), FROZEN diff empty.
- **Round 10 실제 헤드리스 브라우저 E2E QA 2종**: 재진 흐름 49개 체크 +
  스테이션 흐름 30개 체크 전부 통과.
- **비공허성 확인**: round 10의 초기화 순서 테스트가 구(舊) clear-first
  순서에 대해 실제로 실패하는 것을 확인했다(round 9의 TOCTOU 테스트와
  같은 방식).
- **Round 9 기준 이 세션이 직접 실행**: `npx tsc -b --force`(0 에러),
  `npm run build`/`npm run build:preview`(둘 다 성공),
  `npm run test:all`(전체 green — `tests/station.spec.mjs` 75 assertion,
  `tests/follow-up-session.spec.mjs` 167, `tests/workspace-round3.spec.mjs`
  81, `tests/server.spec.mjs` 213), `cd "tablet core" && python3 -m pytest
  tests/ -q`(80 passed), FROZEN diff empty.
- **Round 9 실제 헤드리스 브라우저 E2E QA 2종**: 재진 흐름 45개 체크 +
  스테이션 흐름 30개 체크 전부 통과. 이번 라운드에 추가된 브라우저
  체크 — 사용 중인 태블릿이 select에서 선택 불가로 표시되고, 서버가
  409 `station_busy`로 거절하며, 거절된 인수 시도 후에도 그 태블릿이
  기존 환자를 계속 서빙한다; 재진 워크스페이스에 carry-forward 3버튼이
  뜨고 `이전 판단 유지` 한 번으로 오늘 판단이 채워지며 버튼이 스스로
  비활성화되고, **그 순간에도 오늘 재검(Structured Reassessment)은
  비어 있다**(이전 객관 소견 미복사).
- **E2E가 이번 라운드에 실제로 잡은 회귀 1건**: UI 재구성 과정에서
  `오늘 원장 입력` 섹션 제목이 사라졌다(3분할 provenance 경계 표기의
  손실). E2E가 즉시 실패시켜 복구했다.
- **Round 8 기준 이 세션이 직접 실행**: `npx tsc -b --force`(0 에러),
  `npm run build`/`npm run build:preview`(둘 다 성공, qrcode 포함),
  `npm run test:all`(전체 green — 신규 `tests/station.spec.mjs` 55
  assertion 포함), `cd "tablet core" && python3 -m pytest tests/ -q`(80
  passed), `git diff origin/main -- 'src/spec/*Logic.ts'
  'src/spec/*Adapter.ts'`(empty).
- **Round 8 실제 헤드리스 브라우저 E2E QA 2종**: 재진 링크 흐름 39개
  체크 + 스테이션 흐름 26개 체크 전부 통과. 스테이션 QA가 검증한 것 —
  직원이 태블릿 등록 → 1회용 페어링 링크를 별도 브라우저 페이지(태블릿
  역할, portrait 800×1280)에서 열어 credential 저장 + URL에서 즉시 제거
  → 대기 화면에 환자 식별정보 없음 → 직원이 기존 환자를 그 태블릿에 배정
  → 태블릿이 폴링으로 받아 질문 표시(그 환자의 이전 추적 항목만, 원장
  최종판단·환자 이름 없음) → 환자 제출 → 감사합니다 → 자동으로 대기
  화면 복귀 → 새로고침해도 완료된 답변이 되살아나지 않음 → 다른 환자를
  배정해도 이전 환자 데이터가 전혀 남지 않음 → 재진 큐에 전달 방식/
  태블릿명 표시 → PERSONAL_QR 모드가 실제 QR 이미지를 렌더.
- **Round 7 기준 이 세션이 직접 실행**: `npx tsc -b --force`(0 에러),
  `npm run build`/`npm run build:preview`(둘 다 성공), `npm run
  test:all`(전체 green — `tests/follow-up-session.spec.mjs` 158
  assertion[round 6의 151에서 pointer 권위 failure injection 7건
  추가]), `cd "tablet core" && python3 -m pytest tests/ -q`(80
  passed), `git diff origin/main -- 'src/spec/*Logic.ts'
  'src/spec/*Adapter.ts'`(empty).
- **Round 7 실제 헤드리스 브라우저 E2E QA**: 39개 체크 전부 통과(round
  6의 38개에 교차 레코드 stale-data 검증 1건 추가 — 재진1→재진2→[재진1
  자체 prior-detail fetch 강제 실패]→재진1 전환 시 재진2의 Care Plan
  텍스트가 재진1의 "이전 방문 참고" 영역에 새지 않음을 확인).
- **Round 6 기준 이 세션이 직접 실행**: `npx tsc -b --force`(0 에러),
  `npm run build`/`npm run build:preview`(둘 다 성공), `npm run
  test:all`(전체 green — `tests/follow-up-session.spec.mjs` 151
  assertion[round 5의 134에서 재발급 failure injection 2건/멱등성
  failure injection 1건/동시-시작 1건 추가], `tests/server.spec.mjs`
  213 assertion[write-once 회귀 2건 추가]), `cd "tablet core" &&
  python3 -m pytest tests/ -q`(80 passed), `git diff origin/main --
  'src/spec/*Logic.ts' 'src/spec/*Adapter.ts'`(empty).
- **Round 6 실제 헤드리스 브라우저 E2E QA**: 38개 체크 전부 통과(round
  5의 29개에 추가 — 중복클릭 시 버튼 비활성화 + 서버에 요청 정확히
  1번만 도달, 재진1에서 입력한 Care Plan 텍스트/신규 재평가 대상이
  재진2의 "이전 방문 참고"에 그대로 나타남[재진의 재진 종단 연결],
  완료 후 새로고침해도 문진 폼/이전 target 라벨이 다시 나타나지
  않음[React 메모리 토큰 해제]).
- **Round 5 기준 이 세션이 직접 실행**: `npx tsc -b --force`(0 에러),
  `npm run build`/`npm run build:preview`(둘 다 성공), `npm run
  test:all`(전체 green — `tests/follow-up-session.spec.mjs` 134
  assertion, round 4의 113에서 신규 원자성/내구성/SSOT/종단연결/malformed
  percent-encoding/stale pointer 정리 테스트 추가), `cd "tablet core" &&
  python3 -m pytest tests/ -q`(80 passed), `git diff origin/main --
  'src/spec/*Logic.ts' 'src/spec/*Adapter.ts'`(empty).
- **Round 5 실제 헤드리스 브라우저 E2E QA**(Playwright, 로컬 handoff
  서버 + vite dev server + 실제 Chromium, `/opt/pw-browsers`): 29개
  체크 전부 통과(round 4의 27개에 target 자유텍스트 입력 확인 + 제출 후
  URL에 토큰 미노출 확인 2건 추가). 검증한 것 — 원장이 실제 제출을 열고
  "재진 간단 문진
  시작" 클릭 → 새 visit_id + 1회용 링크 발급(만료 시각 표시) → 그 링크를
  별도 브라우저 페이지(환자 기기 역할, portrait 800×1280)로 열어 Micro
  Follow-up 질문(직전 Follow-up Target 2개 + 전반적 변화 + 새 증상 +
  이상반응) 응답 → 제출 → 완료 화면 → 뒤로가기가 채워진 답변을 다시
  보여주지 않음 → 원장 재진 큐가 "재진 · 간단 추적 완료"로 갱신 → 재진
  워크스페이스가 오늘 환자 입력/이전 방문 참고(읽기 전용)/오늘 원장
  입력 3구역으로 렌더 → 페이지 새로고침 후에도 재진 상태 유지 → 재발급이
  구 링크를 무효화하고 새 링크가 동작 → 원장의 수동 무효화가 링크를
  차단 → 서로 다른 환자(A/B) 전환 시 서로의 이전 최종판단/추적항목
  텍스트가 전혀 새지 않음. 이 QA 과정에서 시딩용 가짜 `responses`
  객체가 DoctorView를 크래시시키는 문제(HANDOFF 위 Completed 10번)를
  실제로 발견해, 프로덕션 빌더로 만든 기존 `src/doctor/fixtures.ts`
  fixture를 그대로 재사용하도록 QA 스크립트 자체를 고쳐 해결했다(QA
  스크립트만의 문제였음 — 프로덕션 코드 변경 없음).
- Round 3 기준 이 세션이 직접 실행: `npx tsc -b --force`(0 에러),
  `npm run build`/`npm run build:preview`(둘 다 성공), `npm run
  test:all`(전체 green, 2507 assertion), `cd "tablet core" && python3
  -m pytest tests/ -q`(80 passed), `git diff origin/main -- 'src/spec/
  *Logic.ts' 'src/spec/*Adapter.ts'`(empty, FROZEN zero-diff 확인).
- 실제 헤드리스 브라우저 시각 QA(Playwright, `/opt/pw-browsers/
  chromium`): desktop(1440×900)/landscape(1280×800)/portrait(800×1280)
  3개 뷰포트 × fixtures 모드(Pain/Herbal 시나리오) + 실제 로컬 서버를
  띄운 server 모드(진짜 제출 페이로드로 시딩, 프로덕션 빌더 그대로
  사용). Care Plan 텍스트 입력 → 자동저장("저장됨") → 페이지 새로고침 →
  재선택 → 입력했던 텍스트가 그대로 남아있음을 실제로 확인. Micro
  Follow-up 카드가 새 증상 보고 시 자동으로 펼쳐지고 "추가 확인 필요"
  배지가 뜨는 것 확인. Rehab 섹션이 Pain에서만 보이고 Herbal에서는
  전혀 안 보임을 확인. 이 QA 중 위 9번(영어 문구 leak) 버그를 실제로
  발견 → 수정 → 재QA로 사라짐을 확인.

## Current Branch
`feat/doctor-clinical-workspace` (PR #24, DO NOT MERGE).

## Known Risks
- Round 2와 동일: `ClinicianJudgment`(명리 감사 기록)와 `WorkspaceState`
  는 여전히 별도 레코드 필드. Pain/Herbal 결정지원 제안 항목은 여전히
  프로덕션에서 빈 배열(계산 로직 미구현, 의도된 상태). view_profile
  매트릭스의 PRODUCT DECISION REQUIRED 간극도 그대로.
- (round 3에서 신규, round 4에서 해결됨) Micro Follow-up 환자 태블릿
  직접 제출 gap은 이번 라운드에서 닫혔다 — 자세한 내용은 위 Completed
  Round 4 참고.
- (신규, round 3, round 4에서도 미해결) `GET /api/patients/:id/history`
  는 "전체 문진을 처음부터 다시 시작하는" 재진의 경우 여전히 빈
  `visits: []`를 돌려줄 수 있다 — 현재 태블릿의 "전체 문진" 제출 경로가
  재진 환자에게 기존 patient_id를 자동으로 재사용하지 않기 때문(위
  Remaining 3번 참고). "재진 간단 문진"(이번 라운드가 만든 경로)은
  원장이 명시적으로 patient_id를 지정하므로 이 문제가 없다. 이 자체는
  버그가 아니라 기존 신원 원칙의 자연스러운 결과.
- (신규, round 4) follow-up-session 토큰의 in-memory rate limiter와
  실패-시도 카운터는 프로세스 재시작 시 초기화된다(기존 `activeVisit.js`
  와 동일한 이 저장소의 기존 전제 — 단일 프로세스가 데이터 디렉터리
  하나를 소유). 파일럿 등급 LAN 서버라는 이 시스템 전체의 기존 보안
  모델과 일관됨.
- (신규, round 6) `startRevisit`의 중복-시작 dedup 캐시도 동일하게
  in-memory·프로세스 단일 소유 전제(재시작 시 초기화, 여러 서버 프로세스
  간 공유 안 함)를 따른다 — 위 rate limiter와 같은 기존 전제의 자연스러운
  확장이지 새로운 리스크가 아니다.
- 환자 개인정보(문진/사주 출생정보)를 다루는 시스템이므로, 향후 모든
  작업에서 실제 값이 로그/커밋/PR/문서에 남지 않도록 주의. 이번 라운드도
  follow-up-session 감사 로그는 visit_id + event type만 남기고 토큰
  평문/답변 내용은 절대 남기지 않는다(테스트로 확인).
- 모델 role routing(Opus/Sonnet/Fable 자동 호출)은 아직 수동이다.

## Next Recommended Action
1. push 직후 실제 GitHub Actions(CI + Doctor Workspace Preview 배포)
   결과를 재확인한다.
2. CRM v0.3.1 round 1(Episode/Task 스키마 + Tests 1-20)이 구현되었으니
   review author(Gomars93)가 새 HEAD를 재확인.
3. Test 0(Naver→Sigma 예약 반영 live 검증)는 Naver 연동이 라이브가 될 때까지
   PENDING. 라이브 전환 후 실제 예약 5건으로 재시도.
4. CRM round 2 후보(승인 시): 서버 영속화 라우트(`server/crmStore.js` 등) +
   Doctor Workspace 큐 UI 배선. 이번 라운드는 지시대로 스키마+테스트만
   구현했으므로, 이 다음 단계는 별도 승인 후 진행.
5. 원장/제품 담당자가 위 Remaining 1-3번(임상 결정표 승인, SafetyPanel
   간극, 전체 문진 재연결 정책)을 검토. Remaining 4번(QR)은 필요 시에만.
6. PR #24는 사용자가 직접 검토 후 merge 여부를 결정한다.
