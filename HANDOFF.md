# Current Handoff

## Objective
Claude Code(Opus/Sonnet) + GitHub + ChatGPT 멀티에이전트 협업 체계를 이 저장소에
구축한다 (`CLAUDE.md` Team Roles/Git Workflow 참고). 문서/워크플로 세팅, CI/branch
protection, ChatGPT 연동까지 마쳤고 지금은 ChatGPT의 첫 독립 검수 피드백을
반영하는 단계다. 별도로 이미 완료되어 있던 NECK/LBP 임상 모듈 작업을 main에
병합하는 것이 남은 큰 축이다.

## Current State
- `main`은 안정 상태: 빌드/테스트 전부 통과.
- GitHub 저장소 default branch는 `main`으로 정정되어 있다 (`DECISIONS.md` 참고).
- **`main` branch protection이 실제로 활성화되어 있다**: PR 필수, status check
  `build-and-test`(GitHub Actions CI) 필수, 대화 해결 필수, force push/브랜치
  삭제 금지. 승인(approve) 요건은 의도적으로 꺼져 있다 — 이 저장소가 1인
  계정이라 PR 작성자 본인 승인이 인정되지 않는 GitHub 특성 때문 (아래 참고).
- **CI(GitHub Actions, `.github/workflows/ci.yml`)가 존재하고 PR #3에서 실제로
  Success(35초)로 통과 확인됨** — build, `npm run test:all`, `tablet core`
  pytest를 PR/main push마다 자동 실행한다.
- **ChatGPT(GitHub App "ChatGPT Codex Connector")가 이 저장소에 연결되어
  있다.** 접근 범위는 "Only select repositories → Gomars93/Samindang" 1개로
  한정 확인됨. 실제로 PR #1의 제목/상태/mergeable/diff/본문을 정확히 읽어오는
  것을 이 세션에서 직접 검증했다.
- **ChatGPT가 PR #1을 독립 검수하고 REQUEST CHANGES 판정을 냈다** (2026-08-25).
  이 커밋은 그 피드백 중 merge 전 필수로 지목된 항목(HANDOFF 최신화, 역할
  routing이 수동이라는 명시, Queue complete ≠ Merge ready 구분, PR template
  임상/보안 체크리스트 추가, public repo 결정 기록)을 반영한 것이다.
- `main`에는 아직 NECK_V1/LBP_V1 임상 안전 모듈이 없다 — PR #2로 올라가 있고
  build/test green이지만 아직 병합되지 않았다.
- 로컬 `.claude/queue/run-next.js`가 `main`/`master` 브랜치에서 실행되는 것을
  막는 하드 가드가 아직 없다는 것이 ChatGPT 검수에서 지적되었다 — 별도 PR로
  바로 뒤이어 처리 중(진행 상황은 아래 In Progress 참고).

## Completed
- GitHub 저장소 default branch를 `main`으로 정정.
- `claude/google-drive-samindang-access-bm2327` 브랜치에 NECK_V1+LBP_V1 임상
  안전 모듈 구현 완료(기존 작업, 이 세션에서 새로 만든 것 아님) — **PR #2**로
  올라가 있음. build/test 이 세션에서 재검증 완료(green).
- 로컬 협업 문서(`CLAUDE.md`, `HANDOFF.md`, `DECISIONS.md`, PR 템플릿) 작성 —
  **PR #1**로 올라가 있음.
- CI 워크플로(`.github/workflows/ci.yml`) 추가 — **PR #3**로 올라가 있음, CI
  자체는 이미 Success로 통과 확인됨.
- `main` branch protection 설정 완료 (PR 필수 + CI 통과 필수 + 대화 해결 필수,
  force push/삭제 금지, 승인 요건은 의도적으로 미설정).
- ChatGPT GitHub 연동 완료 및 실제 PR 읽기 검증 완료.
- ChatGPT의 PR #1 첫 독립 검수 완료(REQUEST CHANGES) 및 지적사항 중 문서
  관련 항목 반영(이 커밋).

## In Progress
- ChatGPT가 PR #1 검수에서 지적한 나머지 항목 처리 중:
  - 로컬 큐(`run-next.js`)에 main/master 실행 거부 하드 가드 추가 — 별도
    branch/PR로 진행 (문서 PR과 코드 PR을 분리하는 Git Workflow 원칙 유지).
  - 반영 완료 후 ChatGPT에게 PR #1 재검수 요청 예정.

## Remaining
- PR #1 수정 커밋을 push하고 ChatGPT 재검수 → 승인되면 사용자가 최종 merge.
- PR #2(NECK/LBP)를 언제 merge할지 사용자 결정 필요 (build/test green,
  기능적으로 완결 상태).
- PR #3(CI)을 언제 merge할지 사용자 결정 필요 (CI 자체는 이미 Success 확인됨,
  단 PR #3이 merge되어야 branch protection의 status check가 이후 PR에도
  일관되게 요구된다).
- 로컬 큐 main-guard PR 완료 후 별도 검수/merge.
- Python 쪽 의존성 고정 파일(`requirements.txt` 등) 부재 — 재현 가능한 환경을
  위해 추가 검토 필요 (아래 Known Risks 참고).

## Blockers
- 이 클라우드 세션에는 GitHub 쓰기 인증(gh CLI, credential helper)이 여전히
  설정되어 있지 않다 — push/PR 생성/수정은 로컬 Claude Code(로컬 GitHub MCP
  도구 보유)를 통해 처리한다. 이 세션은 git patch 파일을 만들어 전달하는
  방식으로 작업을 넘긴다.

## Relevant Files
- `CLAUDE.md` — 협업 규칙 전체 (문서 간 우선순위, 역할 routing 원칙,
  Queue complete ≠ Merge ready 포함)
- `.github/workflows/ci.yml` — CI 정의
- `.github/pull_request_template.md` — 임상/보안 체크리스트 포함된 PR 템플릿
- `.claude/queue/README.md`, `.claude/queue/run-next.js` — 기존 로컬 자동실행
  큐 시스템 (main-guard 추가 작업 대상)
- `docs/PROJECT_PLAN_GAP_AUDIT.md`, `docs/RUNBOOK_LOCAL_HANDOFF.md` — 기존
  기획/운영 문서
- `tablet core/` — 문진 임상 로직 원본(Python/YAML) + 자체 테스트

## Tests / Verification
- `main`(commit `405293d`) 기준: `npm install`, `npm run build`,
  `npm run test:all`(9개 스위트, 0 failed), `tablet core/tests`(pytest, 80
  passed) — 이 세션에서 직접 실행 확인.
- `claude/google-drive-samindang-access-bm2327`(NECK/LBP, PR #2) 기준: build
  통과(113 모듈), `npm run test:all`(11개 스위트, LBP 46건/NECK 81건 포함) 전부
  통과, 0 failed — 이 세션에서 직접 실행 확인.
- PR #3의 CI 실행 결과: GitHub Actions에서 Success, 35초 — 직접 확인.

## Current Branch
`claude/chore-collab-setup` (PR #1, ChatGPT 검수 반영 커밋 추가 중)

## Last Commit
- `main` tip: `405293d`
- PR #1(`claude/chore-collab-setup`) tip: 이 커밋(ChatGPT 검수 반영)
- PR #2(`claude/google-drive-samindang-access-bm2327`) tip: `3e53a7f`
- PR #3(`claude/chore-ci-workflow`) tip: `0ae4ace`

## Known Risks
- `tablet core/` Python 의존성이 문서화/고정되어 있지 않음 (requirements.txt 부재).
- ESLint/Prettier 등 lint 설정이 없음 — `tsc --strict`만으로 타입 검증.
- 환자 개인정보(문진/사주 출생정보)를 다루는 시스템이므로, 향후 모든 작업에서
  실제 값이 로그/커밋/PR/문서에 남지 않도록 주의.
- 저장소가 Public이다 (의도된 결정, `DECISIONS.md` 참고) — 실제 환자
  데이터/시크릿을 실수로 커밋하면 즉시 공개된다는 점을 매 PR에서 재확인해야
  한다 (PR 템플릿의 Patient-data/PHI impact 항목).
- 로컬 큐가 아직 main에서 실행되는 것을 코드 레벨로 막지 못한다 (수정 진행 중).
- 모델 role routing(Opus/Sonnet/Fable 자동 호출)은 아직 수동이다 —
  `CLAUDE.md` "역할은 선언만으로 실행되지 않는다" 참고.

## Next Recommended Action
로컬 큐 main-guard 수정을 완료해 별도 PR로 올리고, 그 다음 이 PR(#1)의 수정
커밋을 push한 뒤 ChatGPT에게 재검수를 요청한다. ChatGPT가 승인하면 사용자가
PR #1 → PR #3(CI) → PR #2(NECK/LBP) 순서로 병합하는 것을 권장한다(문서/CI가
먼저 자리잡아야 이후 PR들이 그 규칙 아래에서 검수되기 때문).
