# Current Handoff

## Objective
PR #24 "Doctor Clinical Workspace" — 태블릿 문진 결과를 단순 요약 화면이
아니라, 원장이 실제로 "가능성을 좁혀주고, 놓치면 안 되는 확인점을 보여주는"
진료 워크스페이스로 확장하는 작업. 사용자가 명시적으로 지시한 원칙: 새
임상 threshold/진단/변증/처방 로직은 절대 발명하지 않고, 그 외 정보구조·
UX·상태모델·테스트·문서·미리보기 배포까지는 자율적으로 끝까지 구현한다.
**PR #24는 DO NOT MERGE — 사용자 명시 지시.**

## Current State
- `main` tip: 이 세션 시작 시점의 `origin/main` (FROZEN 파일 기준 diff
  확인용으로만 사용, 별도로 이 작업과 병합되지 않음).
- 작업 브랜치: `feat/doctor-clinical-workspace` (PR #24). HEAD:
  `5a854938fa9dcdec33fdf25d4df3294e06a555df`.
- 이번 세션에서 커밋된 5개:
  1. `8482e49` — 정적 mockup 미리보기 최초 추가 (이전 세션).
  2. `add7892` — Doctor Workspace shell, provenance 모델, pain/herbal
     workspace, view_profile.
  3. `e5831cd` — synthetic workspace 시나리오 7종 + CSS + 전용 테스트
     스위트(`tests/doctor-workspace.spec.mjs`).
  4. `48bb866` — 실제 브라우저 시각 QA로 발견한 버그 2건 수정(시나리오
     전환 시 결정지원 데이터 미갱신, `DoctorWorkspace`에 `key`를 걸었을 때
     DOM 루트가 중복 생성되던 React 재조정 문제 — React 공식 "adjusting
     state when a prop changes" 패턴으로 해결).
  5. `5a85493` — Phase 18: `doctor-workspace-preview.yml`을 정적 mockup
     복사에서 실제 앱 빌드(`npm run build:preview`)로 교체,
     `vite.config.ts`에 `VITE_PAGES_BASE_PATH` override 추가(서브패스
     배포용, 메인 미리보기와 완전히 분리), `@types/node` 추가.
- **CLOSED/FROZEN `src/spec/*Logic.ts`/`*Adapter.ts`는 이번 PR에서 단 한
  줄도 건드리지 않았다** — `git diff origin/main -- 'src/spec/*Logic.ts'
  'src/spec/*Adapter.ts'`가 매 커밋마다 비어있음을 확인.
- 전체 로컬 검증(HEAD `5a85493` 기준, 이 세션이 직접 실행): `npx tsc -b
  --force`(0 에러), `npm run build`(성공), `npm run test:preview-build`
  (27/27), `npm run test:all`(전체 green — `test:doctor-workspace` 27/27
  포함), `cd "tablet core" && python3 -m pytest tests/ -q`(80 passed).
- GitHub Actions(HEAD `5a85493`, 실제 실행 확인, 로컬 시뮬레이션 아님):
  `CI` workflow → success (run #127,
  https://github.com/Gomars93/Samindang/actions/runs/33090463940).
  `Deploy Doctor Workspace Preview` workflow → success (run #2,
  https://github.com/Gomars93/Samindang/actions/runs/33090461532).
  배포된 실제 프리뷰: `https://gomars93.github.io/Samindang/doctor-pr/`
  (`#doctor` 라우트로 자동 이동, fixtures 모드 전용 — server URL 미설정,
  NO-PHI/synthetic 데이터만).

## Completed
- Provenance 데이터 모델(`src/doctor/workspace/provenance.ts`) — 7종
  origin 태그 + 4-상태 patient/exam 상태(NOT_ASKED/NOT_YET_CHECKED가
  절대 음성으로 collapse되지 않도록 타입 레벨에서 강제).
- `DoctorWorkspace` shell — Common Safety(항상 탭 밖) → 프로필 세그먼트
  스위처(pain/herbal/mixed, 수동 override 가능) → Pain/Herbal 워크스페이스.
- Pain Workspace V2 — 10초 요약 hero, 기존 9개 지역 SafetyPanel 재사용
  (변경 없음), "지금 확인할 것"(`PhysicalExamSuggestion` 상태 버튼),
  지지/반증/미확인 패널, 상세 응답, "원장 최종 판단" 카드, 재평가 대상,
  EMR 미리보기.
- Herbal Workspace V2 — 전신 systemic grid + 안전이슈, 여성·생식/약물·
  병력, "핵심 병기 후보"(`HerbalPatternCandidate`), "오늘 반드시 확인"
  체크리스트, 명리는 항상 마지막·기본 접힘(`<details>`), "최종 변증·병기 —
  원장 판단" 카드, 재평가 대상, EMR 미리보기.
- 임상 결정 테이블 거버넌스 문서 2건(`docs/clinical-decision-tables/`) —
  `DRAFT`/`UNAPPROVED` 상태, example row 1개만 "EXAMPLE ONLY — NOT
  CLINICAL LOGIC"로 표시, 원장 승인 프로세스 명시.
- Synthetic 미리보기 시나리오 7종(pain×3/herbal×3/mixed×1), 모두
  SYNTHETIC/NO-PHI/NOT CLINICAL RULES 라벨.
- `tests/doctor-workspace.spec.mjs`(27 assertion) — profile 격리,
  provenance 배지, UNKNOWN/NOT_YET_CHECKED 비-음성 불변식, EMR 미확정
  라인 미노출, a11y(`role`/`aria-*`), 실제 서버 제출에는 synthetic 데이터
  전달 안 됨(하드 가드).
- 실제 헤드리스 브라우저 시각 QA — 3개 viewport(desktop 1600×1000/
  landscape 1180×820/portrait 810×1180) × 7개 시나리오 + mixed herbal 탭
  + 클리닉 인터랙션 루프 스크린샷. 이 과정에서 실제 버그 2건 발견·수정
  (재현 불가능했을 유형 — 위 Current State 참고).
- Phase 18 — 실제 앱 빌드를 배포하는 미리보기 workflow로 교체, 실제
  GitHub Actions 실행으로 성공 확인(로컬 시뮬레이션이 아님).

## In Progress
- (없음 — Phase 0~18 전부 완료, 로컬·CI 검증 및 실제 배포까지 확인됨.)

## Remaining — 원장(임상) 결정이 필요한 항목만
1. `docs/clinical-decision-tables/PAIN_EXAM_RECOMMENDATION_TEMPLATE.md`에
   실제 `patient_fact → suggested_exam` 규칙을 원장이 작성/승인
   (`clinical_status: DRAFT → APPROVED`, `approved_by` 기입).
2. `docs/clinical-decision-tables/HERBAL_PATTERN_CANDIDATE_TEMPLATE.md`에
   실제 `patient_fact → candidate_pattern` 규칙을 원장이 작성/승인.
3. 위 두 문서가 승인되면, 별도 엔지니어링 세션이
   `examSuggestion.ts`/`patternCandidate.ts`에 승인된 표를 그대로 옮기는
   계산 함수를 추가하고 `DoctorView.tsx`의 `synthetic={...}` 전달부를
   실제 계산 결과로 교체 — 인터페이스는 이미 이 지점에 맞춰 설계됨.
4. (OPERATIONAL, 임상 판단 아님) 재진 자동 비교를 실제로 켜려면 안전한
   환자/방문 식별자 인프라가 먼저 필요 — 현재는 `REPEAT_VISIT_AUTO_COMPARE_
   STATUS` 고정 문구로 정직하게 미구현 상태를 표시 중.
5. PR #24는 사용자가 직접 검토 후 merge 여부를 결정한다 — 이 세션은
   merge하지 않는다.

## Blockers
- 없음 (엔지니어링 관점). 위 Remaining 1-2번은 임상 판단이라 이 세션이
  자체적으로 해소할 수 없는 항목이며, 차단이 아니라 다음 human action이다.

## Relevant Files
- `src/doctor/workspace/provenance.ts` — provenance 타입 시스템 (신규).
- `src/doctor/workspace/DoctorWorkspace.tsx` — shell, view_profile
  스위칭, session 변경 시 render-time state reset 패턴.
- `src/doctor/workspace/PainWorkspace.tsx`,
  `src/doctor/workspace/HerbalWorkspace.tsx` — Phase 3/4 워크스페이스.
- `src/doctor/workspace/examSuggestion.ts`,
  `src/doctor/workspace/patternCandidate.ts` — 스키마만 존재, 프로덕션
  계산 함수 없음(의도적).
- `src/doctor/workspace/finalAssessment.ts` — 원장 최종 판단/재평가 대상,
  `REPEAT_VISIT_AUTO_COMPARE_STATUS`.
- `src/doctor/workspace/workspaceFixtures.ts` — 7개 SYNTHETIC 시나리오.
- `docs/clinical-decision-tables/*_TEMPLATE.md` — 원장 승인 대기 스키마.
- `src/spec/coreSpec.ts` — `DoctorViewProfile` 타입 추가(코어 스펙, FROZEN
  아님).
- `.github/workflows/doctor-workspace-preview.yml`, `vite.config.ts` —
  Phase 18 실제 빌드 배포.
- `DECISIONS.md` 2026-08-27 항목 — 이번 PR의 아키텍처 판단 전체 근거.

## Tests / Verification
- `feat/doctor-clinical-workspace` HEAD `5a85493` 기준 (이 세션이 직접
  실행): `npx tsc -b --force`(0 에러), `npm run build`(성공),
  `npm run test:preview-build`(27/27), `npm run test:all`(전체 green,
  `test:doctor-workspace` 27/27 포함), `cd "tablet core" && python3 -m
  pytest tests/ -q`(80 passed), `git diff origin/main -- 'src/spec/
  *Logic.ts' 'src/spec/*Adapter.ts'`(empty, FROZEN zero-diff 확인).
- GitHub Actions 실제 실행 확인(로컬 시뮬레이션 아님): `CI` run #127
  success, `Deploy Doctor Workspace Preview` run #2 success.
- 실제 헤드리스 브라우저 시각 QA: 3 viewport × 7 시나리오 + 인터랙션
  루프, 스크린샷 기반 — 버그 2건 발견·수정 완료.

## Current Branch
`feat/doctor-clinical-workspace` (PR #24, DO NOT MERGE).

## Last Commit
`5a854938fa9dcdec33fdf25d4df3294e06a555df` — "Phase 18: deploy real Doctor
Workspace build to preview (not static mockup)".

## Known Risks
- Pain/Herbal 결정지원(`PhysicalExamSuggestion`/`HerbalPatternCandidate`)은
  실제 환자 데이터에서는 아직 아무 항목도 제안하지 않는다 — 계산 로직이
  의도적으로 미구현 상태(위 Remaining 1-3 참고). 이 상태로 그대로 merge
  되면 원장은 화면상 "지금 확인할 것"/"핵심 병기 후보" 섹션이 항상 빈
  상태로 보인다는 점을 알아야 한다.
- `PainFinalAssessment`/`HerbalFinalAssessment`(원장 최종 판단/치료계획)는
  현재 클라이언트 로컬 state에만 존재하고 서버에 영속화되지 않는다 —
  탭을 닫거나 새로고침하면 사라진다. 프로덕션 투입 전에는 서버 저장
  플로우가 필요하다(별도 스코프로 `DECISIONS.md` 참고).
- 재진 자동 비교는 UI만 있고 실제 비교 로직은 없음(OPERATIONAL
  INTEGRATION REQUIRED로 화면에 정직하게 표시됨).
- 환자 개인정보(문진/사주 출생정보)를 다루는 시스템이므로, 향후 모든
  작업에서 실제 값이 로그/커밋/PR/문서에 남지 않도록 주의.
- 모델 role routing(Opus/Sonnet/Fable 자동 호출)은 아직 수동이다.

## Next Recommended Action
1. 원장이 `docs/clinical-decision-tables/PAIN_EXAM_RECOMMENDATION_TEMPLATE.md`
   와 `HERBAL_PATTERN_CANDIDATE_TEMPLATE.md`를 검토하고, 실제 진료 규칙
   최소 1-2개씩을 이 스키마에 맞춰 작성/승인하는 것이 다음 단일 human
   action이다 — 이게 채워지는 순간 Pain/Herbal 워크플로가 "빈 스캐폴딩"
   에서 "실제로 뭔가 제안하는 화면"으로 바뀐다.
2. 그 사이에도 실제 원장이 배포된 프리뷰(`https://gomars93.github.io/
   Samindang/doctor-pr/`)를 열어, 이번 세션의 시각 QA로는 잡을 수 없는
   실사용 관점의 10초 판독 가능성/밀도를 직접 확인하는 것을 권장한다.
3. `PainFinalAssessment`/`HerbalFinalAssessment`를 서버에 영속화할지
   여부는 별도 설계 결정이 필요하다(현재는 의도적으로 client-only).
4. PR #24는 사용자가 직접 검토 후 merge 여부를 결정한다.
