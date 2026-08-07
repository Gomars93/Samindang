# 로컬 작업 큐 (Stop hook + auto-advance runner)

`.claude/settings.json`에 등록된 `Stop` hook(`.claude/hooks/verify-queue.js`)이
Claude가 응답을 끝내려 할 때마다 실행된다. 큐가 꺼져 있으면 아무 일도 하지
않는다 — 기존 Claude Code 동작 그대로.

이번 단계부터는 task가 끝나면 **다음 task를 자동으로 골라 이어서 실행**할
수 있다(`auto_advance` 켰을 때만). 단, task를 고르는 것(Stop hook의 일)과
`claude`를 실제로 새로 실행하는 것(`run-next.js`의 일)은 의도적으로
분리되어 있다 — 아래 "설계: 왜 Stop hook이 claude를 직접 실행하지 않는가"
참고.

## 구조

```
.claude/
  settings.json          # Stop hook 등록 (프로젝트 로컬, 전역 아님)
  hooks/
    verify-queue.js       # 검증 + 재시도 + 완료판정 + 다음 task 선택 + checkpoint commit
  queue/
    lib.js                 # 공용 state 입출력 / task 탐색 (hook·runner·control 공유)
    run-next.js             # claude CLI resolver + 실제 claude 실행 + auto-advance 루프
    control.js               # CLI: status/start/stop/next/reset/list
    state.json               # 큐 상태 (런타임, git에서 제외)
    tasks/                    # task 정의 파일 (*.md)
    reports/                  # 검증 리포트 + runner 로그 (런타임, git에서 제외)
    README.md                 # 이 문서
```

## state.json 필드

```json
{
  "active": false,        // true여야 hook/runner가 동작
  "auto_advance": false,  // true면 task 완료 시 다음 task를 자동 선택
  "runner_active": false, // run-next.js 중복 실행 방지 lock
  "current_task": null,   // tasks/ 안의 파일명
  "max_retries": 3,       // 같은 task 검증 실패 허용 횟수
  "retries": {},          // task별 현재 실패 횟수 (내부용)
  "completed_tasks": [],  // 완료된 task 기록
  "history": [],          // 매 검증 실행 로그(report 파일명 포함)
  "last_error": null,     // 가장 최근 에러/중단 사유 (사람이 읽는 진단용)
  "updated_at": null
}
```

## queue start / stop / status / list 사용법

```
node .claude/queue/control.js status   # state.json 전체 출력
node .claude/queue/control.js list     # tasks/ 목록 + pending/CURRENT/done 표시
node .claude/queue/control.js start    # active+auto_advance 켜고 run-next.js 실행(자동 이어달리기)
node .claude/queue/control.js next     # 정확히 task 1개만 실행(auto_advance 안 켬)
node .claude/queue/control.js stop     # active=false. hook/runner 즉시 no-op
node .claude/queue/control.js reset    # state.json을 기본값으로 완전 초기화
```

`start`/`next`는 내부적으로 `run-next.js`를 자식 프로세스로 실행하고
stdio를 그대로 이어붙인다(`stdio: 'inherit'`) — 터미널에서 실시간으로
출력이 보이고 Ctrl+C로 중단할 수 있다.

## 시작 방법 (단계별)

1. `queue/tasks/`에 task 파일을 만든다(`0001-`, `0002-`... 오름차순
   파일명. 완료 조건은 `- [ ]` 체크리스트로 적는다. `0000-example-task.md`는
   설명용 템플릿이라 자동 선택 대상에서 제외된다).
2. `node .claude/queue/control.js next`로 task 1개만 먼저 시험 실행해보고
   report/log를 확인한다.
3. 문제없으면 `state.json`의 `auto_advance`를 켜거나
   `node .claude/queue/control.js start`로 여러 task를 이어서 돌린다.

## 완료 판정 (기존 방식 유지)

- task markdown에 `- [ ]`가 하나라도 남아있으면 미완료로 본다.
- Claude가 항목을 끝낼 때마다 `- [x]`로 갱신해야 한다.
- `tsc -b` PASS + `vite build` PASS + 체크리스트 0개 남음 → 완료.

## 동작 방식 (Stop hook 판단 순서)

1. `state.active`가 `false` → 즉시 통과(exit 0), 아무것도 안 함.
2. Claude Code가 넘겨주는 입력의 `stop_hook_active`가 `true` → 즉시 통과
   (무한루프 방지 하드가드).
3. `current_task`가 `null` → 즉시 통과(할 일 없음).
4. `tsc -b` → 통과 시 `vite build` (둘 다 `npx` 대신 `node_modules/*`를
   `node`로 직접 실행 — PATH에 `npx`가 없어도 동작).
5. 결과를 `queue/reports/*.md`에 저장, `state.json.history`에 기록.
6. **검증 실패**: `max_retries` 미만이면 exit 2로 Stop을 막고 실패 내용을
   Claude에게 전달. `max_retries` 도달 시 `active:false`(회로 차단) +
   `last_error` 기록 후 정상 통과.
7. **검증 성공 + 체크리스트 남음**: exit 2로 계속 작업시킴. 이 시점에
   `retries`/`last_error`는 초기화된다.
8. **검증 성공 + 체크리스트 전부 완료**:
   - `completed_tasks`에 기록
   - **checkpoint commit**: working tree에 변경사항이 있으면
     `git add -A` + `git commit -m "queue: complete <task filename>"`
     (커밋 실패는 `last_error`에만 기록, Stop은 막지 않음)
   - `auto_advance`가 `true`면 `tasks/`에서 다음 미완료 task를 오름차순으로
     찾아 `current_task`에 지정(없으면 `active:false`)
   - `auto_advance`가 `false`면 기존처럼 `current_task`를 `null`로 비움
   - 어느 쪽이든 Stop 자체는 항상 통과(exit 0) — **Stop hook은 다음
     `claude`를 직접 실행하지 않는다.**

## 설계: 왜 Stop hook이 claude를 직접 실행하지 않는가

Stop hook 안에서 `claude -p ...`를 spawn하면:

- hook이 그 자식 세션이 끝날 때까지 오래 blocking되어 현재 세션의
  lifecycle과 충돌할 위험이 있고,
- 그 자식 세션도 끝날 때 자기 Stop hook을 또 실행하므로, 잘못 짜면
  hook 안에서 hook을 계속 spawn하는 재귀 구조가 될 수 있다.

그래서 **Stop hook은 상태만 갱신**(다음 task 선택까지)하고, 실제 `claude`
실행은 별도 프로세스인 `run-next.js`가 맡는다. `run-next.js`는 사람이(또는
나중에 supervisor가) 명시적으로 실행하는 진입점이고, 자기 자신의 루프
안에서 "child 세션이 끝남 → state.json 다시 읽음(그 사이 Stop hook이 이미
다음 task를 정해뒀음) → 다음 child 실행"을 반복한다. 재귀는 여전히
`SAMINDANG_QUEUE_CHILD=1` 환경변수로 한 번 더 막아둔다 — `run-next.js`는
시작하자마자 자기 env에 이 값이 이미 있으면(= 자신이 큐가 띄운 child 세션
안에서 또 실행된 것) 즉시 거부한다.

## runner / lock 구조

- `run-next.js`는 시작 시 `state.runner_active`가 이미 `true`면 즉시
  거부(중복 실행 방지). 시작하면서 `true`로 바꾸고, `finally`에서 항상
  `false`로 되돌린다(정상 종료/에러/Ctrl+C 무관).
- 시작 전 `git status --porcelain`으로 작업트리 확인 — 예상치 못하게
  dirty하면(이전에 커밋 안 된 변경이 남아있으면) **아무 task도 시작하지
  않고** `active:false` + `last_error`만 남기고 종료(자동 `git reset
  --hard`/`git clean` 같은 파괴적 명령은 어디에도 없음).
- 한 번의 `run-next.js` 실행 안에서 최대 `MAX_CONSECUTIVE_TASKS`(기본
  10)개까지만 연속 실행. 도달하면 사람이 다시 `start`를 눌러야 이어진다.
- task별 실패 circuit break은 기존 Stop hook의 `max_retries`(3) 그대로 —
  `run-next.js`는 `state.active`가 꺼진 것을 보고 루프를 멈출 뿐, 자체
  재시도 로직은 없다.
- `claude` 호출은 전부 `spawnSync(bin, [...args])` 형태의 인자 배열이며
  셸 문자열 조립을 하지 않는다 — 한글/공백이 섞인 프로젝트 경로나 task
  프롬프트도 별도 이스케이프 없이 안전하다.

## Claude CLI resolver

`claude` 실행 파일은 이 환경에서 `where.exe claude` / `Get-Command claude`
로 확인한 결과 `C:\Users\<user>\.local\bin\claude.exe` (v2.1.218)이며, 전역
PATH에도 이미 잡혀 있었다(이전 조사에서 실패로 보였던 것은 PowerShell 버전
확인 명령이 같은 체인에서 먼저 실패해 전체 exit code가 1이 된 것일 뿐,
`claude` 자체 문제는 아니었다). `run-next.js`는 그래도 PATH에 의존하지
않도록 아래 순서로 절대경로를 찾는다:

1. `SAMINDANG_QUEUE_CLAUDE_BIN` 환경변수(있으면 최우선, 오버라이드용)
2. `~/.local/bin/claude.exe` (Windows) / `~/.local/bin/claude` (그 외) —
   실제 설치 위치
3. `where.exe claude` / `which claude` 출력
4. 위 전부 실패 시 `"claude"` 문자열 그대로(마지막 수단, 실패하면
   spawn 시점에 에러로 드러남 — 조용히 숨기지 않음)

전역 PATH나 사용자 전역 Claude 설정은 건드리지 않는다.

## git checkpoint 방식

- task가 **완전히 통과**할 때만 커밋한다(체크리스트 0개 + tsc/build PASS).
- `git add -A` 후 `git commit -m "queue: complete <task filename>"`.
  `.gitignore`가 `node_modules`/`dist`/`.env*`/`.claude/queue/state.json`/
  `.claude/queue/reports/*`를 이미 제외하므로 이 파일들은 커밋되지 않는다.
- 커밋할 변경사항이 없으면(예: 순수 검증만 다시 돈 경우) 아무것도 하지
  않는다.
- 커밋이 실패해도(예: git 설정 문제) Stop 자체는 막지 않고 `last_error`에
  이유만 남긴다.
- `git reset --hard`, `git clean -fd` 등 파괴적 명령은 큐 코드 어디에도
  없다. 문제가 생기면 `git log`/`git diff`로 직접 확인하고 되돌린다.
- checkpoint commit은 그 시점의 working tree 전체를 스테이지한다 — task와
  무관하게 미리 존재하던 dirty 파일이 있었다면 함께 커밋된다(단, 큐
  시작 전 dirty-tree 체크가 이런 상황을 미리 막아준다).

## 상태 확인 / 복구 방법

- `node .claude/queue/control.js status` — 전체 state 확인
- `node .claude/queue/control.js list` — task별 pending/CURRENT/done
- `queue/reports/<task>-attempt<N>-<timestamp>.md` — 검증 실행 tsc/build
  전체 출력
- `queue/reports/<task>-run-<timestamp>.log` — `run-next.js`가 실행한
  `claude` 세션의 stdout/stderr 전체
- hook이 계속 막혀서 못 벗어날 때: `node .claude/queue/control.js stop`
  (또는 `state.json`에서 직접 `"active": false`)
- 특정 task 재시도 횟수만 리셋: `state.json.retries`에서 해당 키 삭제
- 완전 초기화: `node .claude/queue/control.js reset`
- git으로 되돌리기: baseline commit 이후 각 task가 체크포인트 커밋으로
  남으므로 `git log --oneline`으로 어디까지 갔는지 보고 필요하면
  `git revert`/`git reset <commit>`(하드 리셋은 신중히, 사람이 직접)으로
  되돌린다.

## 아직 없는 것 (다음 단계)

- OpenAI API로 완료보고를 검수해 다음 task를 자동 **생성**하는 supervisor
  (지금은 task 파일을 사람이 미리 작성해야 함)
- `run-next.js` 루프의 `-c`(`--continue`) 사용이 "이전 대화 없음" 상황에서
  실제로 어떻게 동작하는지는 라이브로 검증하지 않았다(현재 세션을 실수로
  이어받는 위험을 피하려 스모크 테스트는 `-c` 없이 진행함) — `auto_advance`를
  켜고 무인 실행하기 전에 `control.js next`로 한 번은 사람이 지켜보는 것을
  권장.
