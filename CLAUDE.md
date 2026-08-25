# CLAUDE.md — 삼인당 태블릿 문진 프로젝트 운영 규칙

이 문서는 이 저장소에서 작업하는 모든 Claude 세션(Opus/Sonnet, 로컬/클라우드 무관)이
작업 시작 전에 반드시 읽어야 하는 문서다. `HANDOFF.md`, `DECISIONS.md`와 함께
프로젝트의 Single Source of Truth 역할을 한다.

## Project Overview

삼인당(한의원) 환자 태블릿 문진 + 원장(doctor) 대시보드 시스템.

- 환자용: React + Vite + TypeScript 태블릿 문진 앱 (`src/`, `index.html`).
  주호소(요통/LBP, 목통증/NECK 등)별 분기 로직은 `src/spec/`,
  임상 판단 로직 원본은 `tablet core/`(Python, YAML 스펙 + 시뮬레이션 검증)에 있다.
- 원장용: `src/doctor/` — 문진 결과 요약, 임상 판단(JudgmentPanel), EMR 요약 생성.
- 사주(명리) 계산: `src/saju/` — deterministic 계산만 수행, LLM이 임상 규칙을
  창작하지 않는다 (`docs/PROJECT_PLAN_GAP_AUDIT.md` 참고).
- 로컬 handoff 서버: `server/` (Node) — 클리닉 LAN 전용, 인터넷 비노출 전제.
  환자 데이터는 `.data/`에 파일로 저장되며 **git에 절대 커밋하지 않는다**
  (`docs/RUNBOOK_LOCAL_HANDOFF.md` 참고).
- 기획/임상 문서: `docs/`, `tablet core/*.md` — Master Spec, 임상 검토, 통합 리포트 등
  기존 문서가 이미 다수 존재한다. **새 기획 문서를 만들기 전에 반드시 `docs/`와
  `tablet core/`를 먼저 검색해 중복 여부를 확인한다.**

## 기존 로컬 자동화 시스템 (`.claude/queue/`)

이 저장소에는 이미 **Stop hook 기반 로컬 task 큐 자동실행 시스템**이 구축되어
있다 (`.claude/settings.json` + `.claude/queue/`). 사용자의 로컬 Windows 머신에서
`claude` CLI를 자동으로 이어 실행하며, task 완료 시 자체적으로
`git commit -m "queue: complete <task>"` 체크포인트 커밋을 만든다.

이 문서가 정의하는 "Opus/Sonnet/ChatGPT 협업 체계"는 **이 큐 시스템을 대체하지
않는다.** 큐 시스템은 로컬 세션 내에서 task를 이어 실행하는 실행 메커니즘이고,
이 문서의 역할 구분은 "누가 무엇을 검수/승인하는가"에 대한 상위 협업 원칙이다.
둘이 동시에 활성화되어 있을 때:

- 큐 시스템의 checkpoint commit도 이 문서의 Git Workflow(하나의 논리적 작업 =
  하나의 branch, PR을 통한 main 병합)를 따라야 한다. 큐가 `main`이나 다른
  작업자의 feature 브랜치 위에서 직접 도는 일이 없도록 큐 실행 전 반드시
  `git branch --show-current`로 현재 브랜치를 확인한다.
- 원격 저장소 설정(branch protection 등)을 변경하는 작업 중에는 큐의
  `auto_advance`를 잠시 꺼둔다(사용자에게 확인 요청).

## Team Roles

- **사용자(Product Owner)**: 무엇을 만들지 결정, 중요한 설계 변경 승인, 최종
  merge/배포 판단.
- **Opus (Tech Lead / Architect)**: 요구사항 분석, 아키텍처 설계, 작업 단위 분해,
  위험요소 판단, 구현 전후 중요 검수. 단순 구현을 불필요하게 직접 하지 않는다.
  구조적 변경이 필요하면 먼저 `DECISIONS.md`에 남길 계획을 작성한다.
- **Sonnet (Primary Developer)**: 실제 코드 구현, 테스트, 버그 수정, 일반적인
  리팩터링, lint/typecheck/build 검증, 작업 branch 관리. 승인되지 않은 범위까지
  임의로 확장하지 않으며 unrelated code를 수정하지 않는다.
- **Fable (Escalation Specialist)**: 상시 사용하지 않는다. 아래 Escalation Rules
  조건에 해당할 때만 후보로 판단한다.
- **ChatGPT (Independent Reviewer)**: Claude 내부 검수와 별개의 독립 검수자.
  GitHub에 push된 PR/commit/diff/HANDOFF.md/DECISIONS.md/주요 소스/테스트 결과를
  기준으로 요구사항 누락, regression 위험, architecture 문제, 과도한 변경,
  테스트 부족, edge case, 보안, 유지보수성, 다음 단계를 검토한다.

## Startup Protocol

Claude Code가 작업을 시작할 때 순서:

1. `CLAUDE.md` 확인 (이 문서)
2. `HANDOFF.md` 확인 — 현재 목표/진행상태/blocker
3. 관련 `DECISIONS.md` 항목 확인
4. `git branch --show-current`로 현재 브랜치 확인
5. `git status`로 working tree 확인 (dirty하면 이유 파악 후 진행)
6. 이번 세션의 목표를 명확히 하기 (HANDOFF의 Next Recommended Action과 일치하는지)
7. 필요한 관련 코드만 읽기 — 전체 코드베이스를 무작정 훑지 않는다

## Implementation Rules

- unrelated code 수정 금지
- 기존 architecture(문진 spec/adapter/logic 3단 구조, doctor/patient 화면 분리 등)
  임의 변경 금지
- 대규모 변경 전 `DECISIONS.md`에 계획 기록
- secret(API key, token 등) 출력 또는 commit 금지
- `.env`, `.data/`(환자 데이터) commit 금지 — 이미 `.gitignore`에 등록되어 있으나
  실수로 `git add -A` 시 포함되지 않는지 매번 `git status`로 확인
- 테스트를 우회해서 통과시키지 않기, failing test 삭제로 문제 해결하지 않기
- 의미 없는 broad refactor 금지
- 환자 개인정보(문진 답변, 사주 출생정보 등)를 로그, 커밋 메시지, PR 설명,
  DECISIONS.md, HANDOFF.md 어디에도 실제 값으로 남기지 않는다 — 구조/필드명
  수준에서만 논의한다

## Git Workflow

```
main                              (protected, Single Source of Truth)
 ↑ PR (ChatGPT + 사용자 리뷰)
feature / fix / chore branch      (claude/feat-xxx, claude/fix-xxx,
                                    claude/refactor-xxx, claude/chore-xxx)
```

- main에서 직접 개발하지 않는다. main에 직접 push하지 않는다.
- 하나의 논리적 작업은 하나의 branch, 하나의 commit에는 하나의 논리적 변경만.
- unrelated changes를 섞지 않는다.
- branch 이름: `claude/feat-...`, `claude/fix-...`, `claude/refactor-...`,
  `claude/chore-...` (기존 저장소 관례이자 이 문서 기준 표준).

## Review Protocol

작업 완료 후:

1. self-review (diff 전체 재확인)
2. 관련 테스트 실행 (`npm run test:all` 또는 변경 범위에 맞는 `test:<module>`;
   `tablet core/` Python 변경 시 `tablet core/tests/` 실행)
3. 가능한 lint/typecheck/build 실행 (`npm run build` = `tsc -b && vite build`)
4. diff 확인
5. `HANDOFF.md` 갱신
6. 필요 시 `DECISIONS.md` 갱신
7. commit
8. push
9. PR 생성 또는 갱신 (`.github/pull_request_template.md` 사용)

## Escalation Rules (Fable)

다음 경우에만 escalation 후보로 판단한다:

- 같은 문제를 2회 이상 수정했지만 해결되지 않음
- 원인 불명의 상태 손상
- concurrency / race condition
- 광범위한 architectural refactor
- 핵심 파일 다수에 걸친 구조 변경
- migration 또는 backward compatibility 위험
- 기존 설계를 근본적으로 재검토해야 함
- Opus와 ChatGPT(외부 리뷰) 결과가 크게 충돌
- 장시간 자율 분석이 필요한 문제

## Definition of Done

작업 완료는 코드 작성 완료가 아니다. 최소 기준:

- 요구사항 구현
- relevant tests 통과
- 기존 기능 regression 여부 확인
- diff 검토
- `HANDOFF.md` 갱신
- 필요 시 `DECISIONS.md` 갱신
- GitHub push
- PR 상태 정리 (신규 생성 또는 기존 PR 갱신, ChatGPT 리뷰 가능한 상태)
