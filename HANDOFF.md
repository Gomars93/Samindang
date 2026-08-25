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
- ChatGPT 검수에서 지적된 **로컬 큐(`run-next.js`) main/master 실행 차단
  하드 가드**는 코드 작성 완료, 커밋(`7484a1f`), push 완료, **PR #4**로 올라가
  있다. 단 아직 merge되지 않아 `main`의 실제 파일에는 반영되지 않은 상태다 —
  merge 전까지는 큐가 여전히 무방비 상태이니 주의.
- **ChatGPT가 PR #1을 재검수했다** (2026-08-25, 기준 커밋 `9491f98`): 판정은
  "APPROVE에 가까움, 그러나 아직 HOLD". 1차 검수 지적사항은 모두 반영됐으나,
  merge 전에 남은 것 3가지 — (1) 아래 Last Commit 섹션 참고: 이 파일이 자기
  자신의 tip SHA를 하드코딩하면 그 문구를 고치는 커밋이 다시 새 tip을 만들어
  영원히 한 커밋 뒤처지는 구조적 문제가 있어 표기 방식을 바꿈, (2) PR #1의
  GitHub 본문(description) 자체가 최초 상태 그대로 stale — 최신화 필요, (3)
  병합 순서: `main` branch protection이 `build-and-test` status check를
  필수로 요구하는데 CI workflow는 아직 PR #3에만 있고 main에 merge되지 않아
  PR #1에는 check run이 0개다 — 그래서 **PR #3(CI)을 먼저 merge → PR #1
  브랜치를 main과 동기화해 CI가 실제로 돌게 함 → PR #1 merge** 순서가 맞다
  (기존 "PR #1 먼저" 순서는 틀렸음, 아래 Next Recommended Action 참고).

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
  관련 항목 반영, push 완료(`120a4ec`).
- 로컬 큐(`run-next.js`)에 main/master 실행 거부 하드 가드 추가 완료, push
  완료(`7484a1f`), **PR #4**로 올라가 있음.

## In Progress
- (없음 — 다음 액션은 ChatGPT 재검수 요청, 아래 Next Recommended Action 참고)

## Remaining
- PR #1의 GitHub description(본문)이 최초 상태 그대로 stale하다 — 최신화 필요
  (ChatGPT 재검수 지적사항 2번). 코드/문서 파일 내용과는 무관, PR 본문 텍스트만
  해당.
- **병합 순서(ChatGPT 재검수 지적사항 3번, 기존 권장 순서에서 변경됨):**
  1. **PR #3(CI)을 먼저 merge** — `main` branch protection이 이미
     `build-and-test`를 필수 status check로 요구하는데, CI workflow 자체가
     아직 PR #3에만 있고 main에는 없어서 PR #1에 check run이 0개 뜨는 상태.
  2. PR #3 merge 후 PR #1 브랜치를 main과 동기화(rebase 또는 merge)해서
     CI가 실제로 돌게 한다.
  3. CI green 확인 후 PR #1 merge.
  4. PR #4(큐 main-guard) merge.
  5. PR #2(NECK/LBP) — merge 전 최신 tip(`f8a4892`) 기준으로 build/test
     재검증 필요.
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
`claude/chore-collab-setup` (PR #1 — HANDOFF.md 갱신 중, 코드 변경 없음)

## Last Commit
**주의(ChatGPT 재검수 지적사항):** PR #1(`claude/chore-collab-setup`)의 현재
head SHA는 여기 하드코딩하지 않는다 — 이 문서를 고치는 커밋 자체가 새 tip을
만들기 때문에, 하드코딩하는 순간 그 값은 항상 한 커밋 뒤처진 stale한 값이
된다. 실제 head는 항상 `git rev-parse origin/claude/chore-collab-setup` 또는
GitHub PR #1 페이지에서 직접 확인한다.

- `main` tip: `405293d`
- PR #1(`claude/chore-collab-setup`): **마지막으로 ChatGPT가 검수한 기준
  커밋 = `9491f98`** (2026-08-25, 판정: APPROVE에 가까움/HOLD — 남은 조건은
  위 Current State 참고). 실제 최신 head는 위 명령으로 재확인.
- PR #2(`claude/google-drive-samindang-access-bm2327`) tip(참고용, merge 전
  git으로 재확인): `f8a4892` (이 세션이 마지막으로 검증한 `3e53a7f` 이후
  로컬 큐가 SHOULDER_V1 관련 커밋을 추가함 — merge 전 재검증 필요)
- PR #3(`claude/chore-ci-workflow`) tip(참고용): `0ae4ace`
- PR #4(`claude/fix-queue-main-guard`) tip(참고용): `7484a1f` (신규, 큐 main-guard)

## Known Risks
- `tablet core/` Python 의존성이 문서화/고정되어 있지 않음 (requirements.txt 부재).
- ESLint/Prettier 등 lint 설정이 없음 — `tsc --strict`만으로 타입 검증.
- 환자 개인정보(문진/사주 출생정보)를 다루는 시스템이므로, 향후 모든 작업에서
  실제 값이 로그/커밋/PR/문서에 남지 않도록 주의.
- 저장소가 Public이다 (의도된 결정, `DECISIONS.md` 참고) — 실제 환자
  데이터/시크릿을 실수로 커밋하면 즉시 공개된다는 점을 매 PR에서 재확인해야
  한다 (PR 템플릿의 Patient-data/PHI impact 항목).
- 로컬 큐 main-guard 코드는 PR #4에만 존재하고 아직 `main`에 merge되지
  않았다 — merge 전까지는 큐가 여전히 main에서 실행 가능한 상태이니, 그
  사이에는 큐를 수동으로 활성화하지 않도록 주의.
- 모델 role routing(Opus/Sonnet/Fable 자동 호출)은 아직 수동이다 —
  `CLAUDE.md` "역할은 선언만으로 실행되지 않는다" 참고.
- PR #2 브랜치에 이 세션이 마지막으로 검증한 커밋(`3e53a7f`) 이후 로컬 큐가
  추가 커밋(`f8a4892`, SHOULDER_V1 관련으로 추정)을 쌓았다 — merge 전 반드시
  최신 tip 기준으로 build/test 재검증 필요.

## Next Recommended Action
1. PR #1의 GitHub description을 현재 상태(파일 4개, +448 lines, ChatGPT 접근/
   재검수 완료, Known risks에 Public repo 항목 등)로 최신화한다.
2. **PR #3(CI)을 먼저 merge**한다.
3. PR #1 브랜치를 main과 동기화해 CI(`build-and-test`)가 실제로 통과하는 것을
   확인한다.
4. PR #1을 merge한다.
5. PR #4(큐 main-guard) → PR #2(NECK/LBP, merge 전 `f8a4892` 기준 재검증)
   순서로 진행한다.

(기존에 "PR #1 → PR #3 → PR #4 → PR #2" 순서로 적혀 있었으나, ChatGPT
재검수에서 CI 부재 문제가 지적되어 PR #3을 최우선으로 변경함.)
