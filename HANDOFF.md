# Current Handoff

## Objective (round 8 — 전달 채널 무관 Micro Follow-up + 원내 태블릿 스테이션, 이번 세션)
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
- (없음 — round 9의 구현/테스트/QA 전부 완료. Push 후 CI 재확인만 남음.)

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
2. round 9(포인터 권한 TOCTOU + 스테이션 경합/유일성 + 배정 롤백 +
   일상 재진 UI 압축)가 구현되었으니 review author(Gomars93)가 새
   HEAD를 재확인.
3. 원장/제품 담당자가 위 Remaining 1-3번(임상 결정표 승인, SafetyPanel
   간극, 전체 문진 재연결 정책)을 검토. Remaining 4번(QR)은 필요 시에만.
4. PR #24는 사용자가 직접 검토 후 merge 여부를 결정한다.
