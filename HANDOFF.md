# Current Handoff

## Objective
PR #24 "Doctor Clinical Workspace" — 태블릿 문진 결과를 단순 요약 화면이
아니라, 원장이 실제로 "가능성을 좁혀주고, 놓치면 안 되는 확인점을 보여주는"
진료 워크스페이스로 확장하는 작업. 사용자가 명시적으로 지시한 원칙: 새
임상 threshold/진단/변증/처방 로직은 절대 발명하지 않고, 그 외 정보구조·
UX·상태모델·영속화·테스트·문서·미리보기 배포까지는 자율적으로 끝까지
구현한다. **PR #24는 DO NOT MERGE — 사용자 명시 지시.**

이 문서는 두 라운드에 걸친 작업을 기록한다: round 1(초기 구현, Phase 0-19)
과 round 2(85점 상태에서 시작해 임상 판단이 필요 없는 범위 내에서 최고점을
목표로 한 심화 감사/영속화/UX 정밀화).

## Current State
- 작업 브랜치: `feat/doctor-clinical-workspace` (PR #24). HEAD:
  `34ae45d` (round 2 최신 커밋 — 정확한 SHA는
  `git rev-parse feat/doctor-clinical-workspace`로 확인, 이 문서를 고치는
  커밋 자체가 새 tip을 만들기 때문에 여기서는 짧은 SHA만 기록한다).
- **CLOSED/FROZEN `src/spec/*Logic.ts`/`*Adapter.ts`는 두 라운드 모두 단
  한 줄도 건드리지 않았다** — `git diff origin/main -- 'src/spec/*Logic.ts'
  'src/spec/*Adapter.ts'`가 매 커밋마다 비어있음을 확인.
- Round 2에서 이 세션이 직접 실행한 전체 로컬 검증: `npx tsc -b --force`
  (0 에러), `npm run build`/`npm run build:preview`(둘 다 성공),
  `npm run test:all`(전체 green — 신규 `test:view-profile-matrix` 포함),
  `cd "tablet core" && python3 -m pytest tests/ -q`(80 passed).
- Round 2 실제 GitHub Actions 실행 확인은 이 커밋을 push한 뒤 별도로
  재확인 필요(아래 Next Recommended Action 참고) — round 1의 CI/배포
  검증은 이미 완료됐었지만 round 2 커밋에 대해서는 아직 재확인 전이다.

## Completed — Round 1 (요약, 상세는 git log의 이전 4개 커밋 참고)
Provenance 데이터 모델, Doctor Workspace shell, Pain/Herbal Workspace V2,
synthetic 시나리오 7종, 임상 결정 테이블 거버넌스 문서 2건, 실제 헤드리스
브라우저 시각 QA(버그 2건 발견·수정), 실제 앱을 빌드하는 미리보기 배포로
전환.

## Completed — Round 2 (이번 세션)
1. **영속화(최우선 과제)** — 원장이 입력한 워크스페이스 상태(검사 결과,
   한약 병기 후보 검토, 임상 관찰, 두 Final Assessment 카드, 두 재평가
   대상 목록)가 이제 서버에 저장된다.
   - `server/store.js`/`server/index.js`: 기존 submission record에
     `workspace` 형제 필드 추가, `PUT /api/submissions/:id/workspace`
     (judgment 라우트와 동일한 `requireDoctor` 가드 + per-id lock +
     submission/myungri/judgment 불변 검증 패턴).
   - `src/doctor/workspace/persistence.ts` — `WorkspaceState` 타입 +
     방어적 역직렬화(손상된/레거시 payload에도 절대 throw하지 않음).
   - `DoctorWorkspace.tsx`가 모든 클리니션 입력 state를 소유(Pain/
     HerbalWorkspace는 이제 완전히 controlled)하고, 서버 모드에서만
     마지막 편집 후 ~900ms 뒤 자동 저장(debounce)하며, 저장중/저장됨/
     실패 상태를 명시적으로 노출한다(실패를 저장됨으로 속이지 않음).
     Fixtures/미리보기 모드는 서버를 절대 호출하지 않는다.
   - 레코드 전환 리셋 키를 `session_id` 단독에서 서버 record id(없으면
     session_id로 폴백)로 강화 — 더 강한 non-patient-identifying 식별자.
2. **여성·생식 정보 조건부 표시** — `reproductive_status.derived.source`가
   null이 아닐 때만(WOMEN_SAFETY_01 응답 또는 산후/임신 모듈에서 파생된
   사실이 실제로 있을 때만) 표시. HerbalWorkspace 자체 섹션과, 이번 라운드
   시각 QA로 발견한 DoctorView의 별도 레거시 "여성 안전정보" 섹션 둘 다
   적용.
3. **한약 워크스페이스 기본 체크리스트** — "오늘 반드시 확인"이 프로덕션
   에서도 설진/맥진/복진/추가 확인문진 4개 기본 항목으로 채워진다(이전엔
   SYNTHETIC 미리보기에서만). 환자 응답 기반 추론이 아니라 매 방문 고정
   템플릿이므로 임상 판단 발명이 아니다.
4. **view_profile 결정 매트릭스** — `docs/DOCTOR_WORKSPACE_VIEW_PROFILE_
   MATRIX.md`에 16개 실제 라우팅 조합을 감사, `deriveViewProfile()`
   (DoctorView 측)과 `doctorViewProfile()`(coreSpec 정본)이 구조적으로
   동일함을 증명(`tests/doctor-view-profile-matrix.spec.mjs`), 기존
   매핑을 그대로 유지. 발견된 기존(PR #24 이전부터 존재) 안전패널 게이팅
   간극(Pain이 Additional module일 때 관련 SafetyPanel이 안 보이는 문제)
   은 PRODUCT DECISION REQUIRED로 문서화만 하고 임의로 고치지 않음.
5. **프로필 오버라이드 UX** — "자동 분류"와 "현재 보는 화면"을 명확히
   분리, 수동 전환 시 "수동 보기 · 원래 자동 분류: ..." 배너 + 되돌리기
   버튼 노출. 전환은 routing/derivation을 절대 변경하지 않음(표시 전용).
6. **접근성** — 혼합 탭에 `tablist`/`tab`/`tabpanel` 전체 ARIA 배선
   (`aria-controls`/`aria-labelledby`, roving tabindex, Left/Right/Home/
   End 키보드 네비게이션).
7. **한약 병기 후보 → 최종 판단 가져오기** — "원장 채택" 상태가 된 후보에만
   "최종 판단에 가져오기" 버튼 노출, 명시적 클릭 필요, 이동 후에도 자유
   편집 가능(자동 확정 절대 없음).
8. **재평가 대상 기준값/직후값** — `FollowUpTarget`에 선택적
   `baseline`/`postTreatmentValue`(Pain만) 필드 추가.
9. **PainWorkspace 중복 제거** — "상세 응답" 그리드 삭제(DoctorView의
   기존 "상세 증상" 섹션이 이미 동일 목록을 표시하고 있었음 — 순수
   중복이었고 Final Assessment까지의 스크롤만 늘리고 있었음).
10. 실제 헤드리스 브라우저 시각 QA 재실행 — override 배너, 탭 키보드
    네비게이션(ArrowRight로 실제 포커스/aria-selected 이동 확인), 후보
    채택→가져오기 플로우, 재평가 기준값 입력 필드 모두 실제 클릭/키보드
    조작으로 검증(스크린샷 다수 확보).

## In Progress
- (없음 — round 2의 모든 항목이 완료되고 로컬 검증 통과. Push 후 CI
  재확인만 남음.)

## Remaining — 원장(임상) 결정이 필요한 항목만
1. `docs/clinical-decision-tables/PAIN_EXAM_RECOMMENDATION_TEMPLATE.md`에
   실제 `patient_fact → suggested_exam` 규칙을 원장이 작성/승인.
2. `docs/clinical-decision-tables/HERBAL_PATTERN_CANDIDATE_TEMPLATE.md`에
   실제 `patient_fact → candidate_pattern` 규칙을 원장이 작성/승인.
3. 위 두 문서가 승인되면, `examSuggestion.ts`/`patternCandidate.ts`에
   계산 함수 추가 + `DoctorView.tsx`의 `synthetic={...}` 전달부를 실제
   계산 결과로 교체 — 인터페이스는 이미 이 지점에 맞춰 설계됨.
4. `docs/DOCTOR_WORKSPACE_VIEW_PROFILE_MATRIX.md`의 PRODUCT DECISION
   REQUIRED 항목(Pain이 Additional module일 때 해당 지역 SafetyPanel이
   안 보이는 기존 간극) — 원장/제품 결정이 필요하고, 이 세션은 안전
   관련 렌더링 로직을 임의로 확장하지 않았다.
5. (OPERATIONAL, 임상 판단 아님) 재진 자동 비교를 실제로 켜려면 안전한
   환자/방문 식별자 인프라가 먼저 필요.
6. PR #24는 사용자가 직접 검토 후 merge 여부를 결정한다 — 이 세션은
   merge하지 않는다.

## Blockers
- 없음 (엔지니어링 관점). 위 Remaining 1-2, 4번은 임상/제품 판단이라
  이 세션이 자체적으로 해소할 수 없는 항목이며, 차단이 아니라 다음
  human action이다.

## Relevant Files
- `src/doctor/workspace/persistence.ts` — WorkspaceState 타입/역직렬화
  (신규, round 2).
- `server/store.js`(`saveWorkspace`), `server/index.js`(workspace 라우트).
- `src/doctor/workspace/DoctorWorkspace.tsx` — 이제 모든 클리니션 입력
  state의 단일 소유자 + debounce 자동저장.
- `src/doctor/workspace/PainWorkspace.tsx`/`HerbalWorkspace.tsx` — 이제
  fully controlled, 자체 state 없음.
- `docs/DOCTOR_WORKSPACE_VIEW_PROFILE_MATRIX.md` — view_profile 16-case
  감사 + PRODUCT DECISION REQUIRED 항목.
- `docs/DOCTOR_CLINICAL_WORKSPACE_PREVIEW.md` — 실제 현재 구현 상태로
  다시 작성됨(이전엔 "production 미변경" 등 stale 서술이 있었음).
- `docs/clinical-decision-tables/*_TEMPLATE.md` — 원장 승인 대기 스키마
  (round 2에서 내용 변경 없음, 그대로 유지).
- `tests/doctor-view-profile-matrix.spec.mjs`(신규), `tests/server.spec.mjs`
  §workspace 블록(신규 12 assertion), `tests/doctor-workspace.spec.mjs`
  §6b(신규 9 assertion), `tests/doctor.spec.mjs` §14(신규 2 assertion).

## Tests / Verification
- Round 2 HEAD(`34ae45d`) 기준 이 세션이 직접 실행: `npx tsc -b --force`
  (0 에러), `npm run build`(성공), `npm run build:preview`(성공),
  `npm run test:all`(전체 green, 신규 `test:view-profile-matrix` 73개
  assertion/16 케이스 포함, `test:server` 186개로 증가), `cd "tablet
  core" && python3 -m pytest tests/ -q`(80 passed), `git diff origin/main
  -- 'src/spec/*Logic.ts' 'src/spec/*Adapter.ts'`(empty, FROZEN
  zero-diff 확인).
- 실제 헤드리스 브라우저 시각 QA(round 2 신규 기능 대상): override 배너
  표시/리셋, 탭 키보드 네비게이션(프로그래매틱하게 aria-selected 실제
  변경 확인), 후보 채택→"최종 판단에 가져오기" 클릭까지 전체 플로우,
  재평가 기준값/직후값 입력 필드 노출 — 전부 정상 동작 확인, 스크린샷
  다수 확보(`/tmp/.../scratchpad/doctor-qa/r2-*.png`, 세션 로컬이라 repo
  에는 없음).

## Current Branch
`feat/doctor-clinical-workspace` (PR #24, DO NOT MERGE).

## Last Commit
`34ae45d` — "feat(doctor-workspace): server persistence, view_profile
audit, workflow polish (round 2)". 이 HANDOFF/DECISIONS 갱신 커밋이 그
바로 다음이다.

## Known Risks
- `PainFinalAssessment`/`HerbalFinalAssessment`(원장 최종 판단/치료계획)
  는 이제 서버에 저장되지만(round 2), `ClinicianJudgment`(명리 감사
  기록)와는 여전히 별도 레코드 필드다 — 의도된 설계(judgment의 read-
  modify-write 사이클과 섞이지 않도록)이지만, 두 시스템이 같은 제출건에
  대해 각자 저장된다는 점은 향후 UI가 둘을 동시에 보여줄 때 유의해야
  한다.
- Pain/Herbal 결정지원(`PhysicalExamSuggestion`/`HerbalPatternCandidate`)
  은 실제 환자 데이터에서는 여전히 아무 항목도 제안하지 않는다 — 계산
  로직이 의도적으로 미구현 상태(Remaining 1-3 참고).
- `docs/DOCTOR_WORKSPACE_VIEW_PROFILE_MATRIX.md`에 기록된 PRODUCT
  DECISION REQUIRED 간극(Pain Additional module + SafetyPanel 미노출)은
  드물지만 실재하는 라우팅 조합이다 — 원장이 실제로 이런 조합의 환자를
  만나면, 해당 지역 안전 패널이 워크스페이스에 안 보일 수 있음을 알아야
  한다.
- 재진 자동 비교는 여전히 UI만 있고 실제 비교 로직은 없음(OPERATIONAL
  INTEGRATION REQUIRED로 화면에 정직하게 표시됨).
- 환자 개인정보(문진/사주 출생정보)를 다루는 시스템이므로, 향후 모든
  작업에서 실제 값이 로그/커밋/PR/문서에 남지 않도록 주의.
- 모델 role routing(Opus/Sonnet/Fable 자동 호출)은 아직 수동이다.

## Next Recommended Action
1. 원장이 `docs/clinical-decision-tables/PAIN_EXAM_RECOMMENDATION_TEMPLATE.md`
   와 `HERBAL_PATTERN_CANDIDATE_TEMPLATE.md`를 검토하고, 실제 진료 규칙
   최소 1-2개씩을 이 스키마에 맞춰 작성/승인하는 것이 다음 단일 human
   action이다.
2. `docs/DOCTOR_WORKSPACE_VIEW_PROFILE_MATRIX.md`의 PRODUCT DECISION
   REQUIRED 항목(Pain Additional module SafetyPanel 간극)에 대해 원장/
   제품 결정 — 고칠지, 언제 고칠지, 얼마나 급한지.
3. push 직후 실제 GitHub Actions(CI + Doctor Workspace Preview 배포)
   결과를 재확인한다(이 세션이 로컬에서는 전부 통과시켰지만, 실제 CI
   실행 자체는 push 이후에만 관찰 가능).
4. PR #24는 사용자가 직접 검토 후 merge 여부를 결정한다.
