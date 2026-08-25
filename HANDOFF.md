# Current Handoff

## Objective
Claude Code(Opus/Sonnet) + GitHub + ChatGPT 멀티에이전트 협업 체계를 이 저장소에
구축한다 (`CLAUDE.md` Team Roles/Git Workflow 참고). 문서/워크플로 세팅과, 별도로
이미 완료되어 있던 NECK/LBP 임상 모듈 작업을 main에 병합하는 것이 현재 두 축이다.

## Current State
- `main`은 안정 상태: 빌드/테스트 전부 통과 (아래 Tests/Verification 참고).
- `main`에는 아직 NECK_V1/LBP_V1 임상 안전 모듈이 없다. 해당 작업은
  `claude/google-drive-samindang-access-bm2327` 브랜치에 완료되어 있으나
  **아직 PR/merge되지 않았다.**
- GitHub 저장소의 default branch가 한동안 `main`이 아닌 오래된 브랜치
  (`claude/im-not-ai-skill-install-a4ryil`, main보다 51 커밋 뒤처짐)로 잘못
  설정되어 있었음 — 2026-08-25에 사용자가 `main`으로 정정 완료 (`DECISIONS.md` 참고).

## Completed
- GitHub 저장소 default branch를 `main`으로 정정.
- `claude/google-drive-samindang-access-bm2327` 브랜치에 NECK_V1(목통증) +
  LBP_V1(요통) 임상 안전 모듈 구현 완료 (main 대비 19개 파일, +5170/−8;
  `src/spec/lbpLogic.ts`, `src/spec/neckLogic.ts`, adapter, doctor UI 확장,
  대응 테스트 포함). 이 세션에서 새로 만든 것은 아니고 기존에 완료되어 있던
  작업임 — merge만 남음.
- 로컬 협업 문서 체계 초안 작성: `CLAUDE.md`, `HANDOFF.md`(이 문서),
  `DECISIONS.md`, `.github/pull_request_template.md`
  (브랜치: `claude/chore-collab-setup`, main에서 분기).

## In Progress
- 협업 환경 구축 Phase 3 이후: Git workflow 정리, GitHub branch protection 점검,
  ChatGPT 저장소 접근(읽기) 확인.

## Remaining
- `claude/chore-collab-setup` 브랜치 push + PR 생성 (사용자 승인 필요).
- `claude/google-drive-samindang-access-bm2327`(NECK/LBP) 브랜치의 PR 생성 및
  main 병합 — 이 문서 작성 시점 기준 아직 아무 PR도 열려 있지 않음.
- GitHub branch protection 설정 여부 확인 및 필요 시 안내 (Phase 4).
- ChatGPT가 이 저장소의 PR/diff/commit을 실제로 읽을 수 있는지 확인 (Phase 5).
- Python 쪽 의존성 고정 파일(`requirements.txt` 등) 부재 — 재현 가능한 환경을
  위해 추가 검토 필요 (아래 Known Risks 참고).

## Blockers
- 이 클라우드 세션에는 GitHub 쓰기 인증(gh CLI, credential helper)이 설정되어
  있지 않다. 현재는 공개 clone(읽기)만 가능하며, push/PR 생성 전에 인증 방법을
  사용자와 정해야 한다.
- 로컬 `.claude/queue/` 자동실행 시스템이 활성 상태일 경우, GitHub 원격 설정
  변경(Phase 4) 작업과 겹치지 않도록 그 시점에 일시 정지 필요.

## Relevant Files
- `CLAUDE.md` — 협업 규칙 전체
- `.claude/queue/README.md` — 기존 로컬 자동실행 큐 시스템 설명
- `docs/PROJECT_PLAN_GAP_AUDIT.md`, `docs/RUNBOOK_LOCAL_HANDOFF.md` — 기존 기획/운영 문서
- `package.json` — build/test 스크립트 전체 목록
- `tablet core/` — 문진 임상 로직 원본(Python/YAML) + 자체 테스트

## Tests / Verification
2026-08-25, `main`(commit `405293d`) 기준, 이 세션에서 직접 실행하여 확인:
- `npm install` 성공 (70 packages)
- `npm run build` (`tsc -b && vite build`) — 통과
- `npm run test:all` (9개 test:* 스크립트 순차 실행) — 전부 통과, 0 failed
- `tablet core/tests/` (pytest, 5개 파일) — 80 passed, 0 failed
  (참고: 이 환경에 `pyyaml`, `pytest`가 기본 설치되어 있지 않아 이 세션에서
  직접 설치했음 — 저장소 자체에 Python 의존성 고정 파일이 없음)

`claude/google-drive-samindang-access-bm2327`(NECK/LBP) 브랜치는 이번 세션에서
빌드/테스트를 다시 돌려보지 않았다 — 그 브랜치를 PR로 올릴 때 별도 검증 필요.

## Current Branch
`claude/chore-collab-setup` (main에서 분기, 이 문서들만 포함)

## Last Commit
- `main` tip: `405293d` "Add tablet core v1.4 spec deliverables (Core repair + LBP_V1 integration)"
- `claude/google-drive-samindang-access-bm2327` tip: `6abedd5` "Integrate NECK_V1 (neck pain) clinical safety module" (main에 아직 병합 안 됨)

## Known Risks
- GitHub 쓰기 인증 미구성 — push/PR 생성 전 해결 필요.
- `tablet core/` Python 의존성이 문서화/고정되어 있지 않음 (requirements.txt 부재).
- ESLint/Prettier 등 lint 설정이 없음 — `tsc --strict`만으로 타입 검증.
- 환자 개인정보(문진/사주 출생정보)를 다루는 시스템이므로, 향후 모든 작업에서
  실제 값이 로그/커밋/PR/문서에 남지 않도록 주의 (`CLAUDE.md` Implementation Rules 참고).
- 로컬 큐 자동실행 시스템과 이 문서의 PR 기반 워크플로가 동시에 돌 때의 조율
  방식이 아직 실전 검증되지 않음.

## Next Recommended Action
`claude/chore-collab-setup` 브랜치를 push하고 PR을 생성한다 (사용자 승인 후).
그 다음 우선순위는 `claude/google-drive-samindang-access-bm2327`(NECK/LBP) 브랜치의
PR을 열어 main에 병합하는 것 — 이미 완료된 작업이 오래 미병합 상태로 남아있는
리스크가 가장 크다.
