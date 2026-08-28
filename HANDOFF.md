# Current Handoff

## Objective
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
  이 문서를 고치는 커밋 자체가 새 tip을 만들기 때문에 여기서는 시작
  시점 SHA만 기록 — 정확한 현재 SHA는 `git rev-parse
  feat/doctor-clinical-workspace`로 확인.
- **CLOSED/FROZEN `src/spec/*Logic.ts`/`*Adapter.ts`는 세 라운드 모두 단
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
- (없음 — round 3의 모든 Phase A-M 구현 완료, 로컬 검증 전부 통과.
  Push 후 CI 재확인만 남음.)

## Remaining — 원장(임상)/제품/보안 결정이 필요한 항목만
1. `docs/clinical-decision-tables/PAIN_EXAM_RECOMMENDATION_TEMPLATE.md`/
   `HERBAL_PATTERN_CANDIDATE_TEMPLATE.md`에 실제 규칙을 원장이 작성/승인
   (round 1부터 이어지는 항목, round 3에서도 변경 없음).
2. `docs/DOCTOR_WORKSPACE_VIEW_PROFILE_MATRIX.md`의 PRODUCT DECISION
   REQUIRED 항목(Pain Additional module SafetyPanel 간극) — round 2부터
   이어지는 항목, round 3에서도 변경 없음.
3. **(신규, round 3) Micro Follow-up 환자 입력/전달 경로** —
   `src/doctor/workspace/microFollowUp.ts` 파일 상단 주석에 상세 기록.
   요약: 이 서버의 모든 라우트(Recorder 워크스테이션의 POST 포함)는
   동일한 doctor 토큰을 요구하고, 태블릿 앱은 그 토큰을 절대 가진 적이
   없다(`src/App.tsx`가 doctor-token-gated 읽기를 참조하지 않음을
   테스트로 보장). 재진 환자에게 실제로 짧은 체크인 질문을 태블릿에서
   직접 받으려면 (a) 태블릿에 doctor-token-gated 접근을 새로 허용하거나
   (b) URL 파라미터/QR/lookup 토큰 같은 새 식별자 체계를 만들어야 하는데,
   둘 다 이 세션이 임의로 정할 수 없는 보안/제품 결정이다. 지금은 원장/
   직원이 인증된 세션에서 대신 입력하는 것만 가능(라우트/저장/표시는
   전부 완성).
4. **(신규, round 3) 재진 시 실제 문진 재연결** — `visitStore.js`의
   신원 원칙(새 제출 = 항상 새 patient_id) 때문에, 같은 환자가 실제
   태블릿으로 새 문진을 다시 제출해도 이전 patient_id와 자동으로 이어
   지지 않는다. `GET /api/patients/:id/history`는 이미 구현했지만,
   "이 태블릿 제출을 기존 patient_id에 붙인다"는 판단 자체가 이름/전화
   매칭을 쓰지 않고는 자동화할 수 없는 신원 문제라 원장/직원이 명시적
   `POST /api/visits`(기존 patient_id 지정)로 재진을 만드는 현재 방식을
   그대로 유지했다 — 새 매칭 로직을 발명하지 않음.
5. PR #24는 사용자가 직접 검토 후 merge 여부를 결정한다 — 이 세션은
   merge하지 않는다.

## Blockers
- 없음 (엔지니어링 관점). 위 Remaining 항목은 전부 임상/제품/보안
  판단이라 이 세션이 자체적으로 해소할 수 없는 항목이며, 차단이 아니라
  다음 human action이다.

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
- (신규, round 3) Micro Follow-up은 데이터 모델/서버/원장 UI까지 전부
  완성됐지만, 환자가 태블릿에서 직접 답하는 화면은 없다 — 위 Remaining
  3번 참고.
- (신규, round 3) `GET /api/patients/:id/history`는 실제로는 대부분의
  경우 빈 `visits: []`를 돌려줄 것이다 — 현재 태블릿 제출 경로가 재진
  환자에게 기존 patient_id를 자동으로 재사용하지 않기 때문(위 Remaining
  4번 참고). 이 자체는 버그가 아니라 기존 신원 원칙의 자연스러운 결과.
- 환자 개인정보(문진/사주 출생정보)를 다루는 시스템이므로, 향후 모든
  작업에서 실제 값이 로그/커밋/PR/문서에 남지 않도록 주의.
- 모델 role routing(Opus/Sonnet/Fable 자동 호출)은 아직 수동이다.

## Next Recommended Action
1. push 직후 실제 GitHub Actions(CI + Doctor Workspace Preview 배포)
   결과를 재확인한다.
2. 원장/제품 담당자가 위 Remaining 1-4번(임상 결정표 승인, SafetyPanel
   간극, Micro Follow-up 환자 입력 경로, 재진 재연결 정책)을 검토.
3. PR #24는 사용자가 직접 검토 후 merge 여부를 결정한다.
