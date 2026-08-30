# Current Handoff

## Objective (CRM v0.3.1 round 17 — Restart-safe / Multi-process Correctness Batch, 이번 세션)
Gomars93가 PR #24 댓글로 지시(GitHub-relayed comment). round 16(audit+purge,
CLOSED) 다음으로 가장 위험도 높은 non-clinical 파일럿 리스크: "기존
Doctor/CRM/재진 워크플로 전체에 걸친 restart-safe / multi-process 정합성
+ stale-state 복구"를 지시대로 **하나의 cohesive 배치**로 처리(locking/
stale read/recovery/브라우저 동작/회귀를 별도 마이크로 라운드로 쪼개지
않음). 요구 오케스트레이션 사이클(Fable 스코핑 → Sonnet 구현 → 진짜 Opus
독립 검수 → 수정 → 재검수 반복 → 전체 게이트)은 round 16과 동일. 하드
경계도 동일(FROZEN `src/spec/*Logic.ts`/`*Adapter.ts`, Test 0 PENDING,
Care Gap OFF, 임상/식별 정책 확장 없음). **PR #24는 여전히 DO NOT MERGE.**

**Fable 스코핑**(실제 `model:"fable"` 호출, 이번에도 진짜 사용): 이 저장소
모든 store가 "이 프로세스가 데이터 디렉터리를 혼자 소유한다"는 전제를
문서로만 적어놓고 한 번도 강제한 적이 없다는 걸 실제 코드 읽기로 확인 →
두 실 프로세스가 같은 데이터 디렉터리를 향하면(운영자 실수로 서버 중복
기동 등) `patientIdentityStore`(중복 chart_no 링크), `startRevisit`(중복
live follow-up 캡슐), `crmStore`의 CAS(잃어버린 update) 등 in-process
락 전부가 무력화됨을 구체적 시나리오로 증명 → W1~W6 작업 분해와 완료
기준 제시.

**구현(Sonnet, 이 세션)**:
- **W1** `server/ownerLock.js`(신규): 데이터 디렉터리별 exclusive-create +
  heartbeat lock/lease. `server/index.js`의 CLI 부팅 경로(`isMain()`)에만
  연결(기존 `checkDataDirsWritable`와 동일 위치) — `createApp()` 자체는
  건드리지 않아 수백 개 기존 in-process 테스트에 영향 없음. 두 번째 실
  프로세스는 거부, SIGKILL 후 stale lease는 원자적으로 인수. 실 자식
  프로세스로 재현하는 `tests/owner-lock.spec.mjs`(신규, 이후 closing-review
  fix loop 거쳐 37 assertion으로 확장):
  두 프로세스 부팅 경쟁, SIGKILL 인수, `scripts/purge-data.mjs` fresh-lock
  거부, 그리고 락 없이 직접 store를 두 프로세스로 경합시켜 실제 손상
  (chart_no 중복 클레임 또는 예기치 않은 crash)을 재현하는 pre-fix 증명.
- **W2** `server/store.js`의 `startRevisit`: in-memory dedup 캐시가
  5초 창을 넘기거나 재시작/프로세스 전환으로 사라지면, durable 상태를
  재조회해(`findPendingRevisitForPatient`) 아직 미응답인 재진 visit이
  있으면 새 visit을 만드는 대신 그 visit에 재발급한다 — staff의 명시적
  reset(`INVALIDATED` 세션)은 의도적으로 제외해 기존 reset→재배정 흐름은
  그대로 둔다. `reused`/`created` 두 개의 독립 플래그로 분리(하나로는
  "새 visit 없음"과 "새 토큰 없음"을 동시에 표현 못 해 audit 라인이
  실제로 하나 빠지는 걸 자체 테스트로 발견 → 수정).
- **W3** `server/followUpSessionStore.js`의 보존기한 정리: pointer 스윕이
  `issueToken`과 같은 `visit:<id>` 락 없이 read-check-unlink라서, 막
  재발급된 pointer를 정리가 지워버릴 수 있던 TOCTOU를 같은 락으로 닫음.
- **W4** `server/store.js`(saveJudgment/saveWorkspace)와
  `server/visitStore.js`(saveVisitWorkspace)에 옵션 `expectedUpdatedAt`
  CAS precondition 추가 — 안 넘기면 기존 unconditional last-write-wins과
  100% 동일(하위호환), 넘기고 어긋나면 409 + 서버의 현재 레코드를 그대로
  반환(재조회 없이 바로 최신 상태 확인 가능). HTTP 경계는 새 헤더
  `x-expected-updated-at`(CORS allow-headers에도 추가). `setStatus`는
  의도적으로 last-write-wins 그대로 유지(문서화만). 클라이언트
  `src/lib/serverClient.ts`의 `saveJudgment`/`saveWorkspaceState`/
  `saveVisitWorkspace`에 옵션 인자로 배관만 추가 — 실제 UI가 언제/어떻게
  충돌을 노출할지(자동 새로고침/배너/병합 뷰)는 별도 제품 판단이라 이번
  라운드에서 UI 배선까지는 하지 않음(의도적으로 미룸, 아래 참고).
- **W5** 이미 안전한 경로들의 실제 증명: `tests/station.spec.mjs`에 진짜
  재시작 테스트 추가(station의 `assignedTokens`가 in-memory-only로
  설계대로 재시작에 사라지고, durable 메타데이터로 busy 상태는 유지되며,
  reset 후 재배정이 정상 동작함을 실제 서버 재시작으로 증명).
  `tests/follow-up-session.spec.mjs`에 cleanup-vs-reissue 경쟁 증명(순서
  강제 없이 Promise.all로 실제 경합, 어느 쪽이 먼저든 pointer가 살아있는
  토큰을 항상 가리킴을 증명) 추가.
- **W6** 문서화만: `store.js`/`visitStore.js`/`index.js`의 단일 프로세스
  전제 주석을 "이제 ownerLock.js가 실제로 강제한다"로 갱신, orphan-visit
  crash window(createSubmission)와 retention 정리의 RMW 경쟁 가장자리를
  코드 주석으로 문서화(둘 다 benign/bounded, 코드 변경 없음).

**Closing-review fix loop (`fd9e49f` → `b3fe351` → 이번 커밋)**: 실제
`model:"opus"` 독립 검수(약 147k 토큰, 41 tool call, ~13분) 두 라운드가
발견한 결함을 순서대로 수정.

1라운드(`b3fe351`): owner-lock takeover 경쟁을 단일 self-read에서
settle-and-reconfirm으로, heartbeat의 맹목적 갱신을 read-verify-first로,
`findPendingRevisitForPatient`의 두 가지 오류(무관한 visit 재사용,
살아있는 세션 파괴)를 한 프레디케이트 강화로, `nextUpdatedAt`의 NaN
가드, `x-expected-updated-at`의 empty-header guaranteed-mismatch,
`SAMINDANG_OWNER_LOCK_*_MS` 미검증 등을 수정.

2라운드(이번 커밋): 1라운드 결과에 대한 재검수가 새로 찾은 결함들.
가장 심각한 것 — **`SAMINDANG_OWNER_LOCK_STALE_MS=0`(또는 음수)이
`purge-data.mjs`를 살아있는 서버의 데이터까지 지우게 만듦**(finite
체크만 하고 양수 체크를 안 해서 "모든 lock이 항상 stale"이 됨 — 실제로
재현·검증됨). `requirePositiveMs`를 `ownerLock.js`로 옮겨
`server/index.js`와 `purge-data.mjs`가 같은 검증을 공유하도록 고쳐
드리프트 자체를 봉쇄. 그 외: `purge-data.mjs`가 확인 프롬프트 취소나
purge 도중 에러 시 자신이 쥔 lock을 release 안 하고 `process.exit()`으로
바로 죽던 문제(lock을 90초까지 들고 있어 실서버가 막힘) — `process.exit`
대신 `process.exitCode` + `finally { await ownerLock.release() }` 구조로
전환(`process.exit()`은 pending finally를 건너뛴다는 점이 원인). 
owner-lock 2차 검증(settle 이후 두 번째 재확인)이 실제로는 중복 코드였던
것을 확인하고 단일 검증으로 정리, 주석을 정직하게 재작성(잔여 경쟁
윈도는 있음을 명시). `findPendingRevisitForPatient`의 `stillLive` 판정이
`consumeTokenWithAction`의 만료 판정과 부호가 달라(손상된 `expires_at`
값에서만 재현) 서로 모순되던 것을 동일 부호로 통일. 검수 도구 자체의
결함도 발견: multi-takeover 테스트가 프로세스 spawn 순서에 의존해 실제
버그를 20번 중 1번만 잡았던 것 — `server/index.js`에 테스트 전용
spin-wait 배리어(`SAMINDANG_OWNER_LOCK_TEST_RACE_AT`, 프로덕션에서는
절대 설정 안 됨)를 추가해 진짜 동시 경쟁을 강제, loser의 거부 사유까지
검증하도록 강화 — 그 과정에서 `checkDataDirsWritable`의 공유
`.write-probe` 파일명 경쟁(진짜 버그, 원래 15개 발견 목록에는 없었음)을
새로 발견해 프로세스별 고유 이름으로 수정. 재검증: reverted `ownerLock.js`
대상 10/10 재현(수정 전 1/20), `SAMINDANG_OWNER_LOCK_STALE_MS=0`/`-1`
실제 라이브 서버 대상 검증(더 이상 안 지워짐), abort/throw 양쪽 경로에서
lock release 확인 — `tests/owner-lock.spec.mjs` 20 → 37 assertion.
전체 게이트(tsc -b --force/build/build:preview/test:all ×2/tablet-core
pytest 80/FROZEN zero-diff) 전부 green.

3라운드(이번 커밋): 2라운드 결과에 대한 재검수(약 149k 토큰, 52 tool
call, ~17분)가 또 찾은 결함들 — "이 배치가 끝난 것으로 선언할 수 없다"는
판단과 함께. 가장 심각한 것 두 가지:
(a) `SAMINDANG_OWNER_LOCK_STALE_MS`는 양수 체크만으로는 부족 —
`=90`(90000ms 기본값을 초 단위로 착각한 가장 그럴듯한 오타) 같은
"유효하지만 너무 작은" 값도 여전히 라이브 서버의 lock을 stale로 읽어
`purge-data.mjs`가 실제로 지워버리는 걸 재현·확인. 어떤 threshold
값으로도 모든 오타를 막을 수 없으므로, threshold와 무관한 독립 방어층
추가: purge 전에 owner.lock이 가리키는 pid가 **이 호스트에서 실제로
살아있는지**(`process.kill(pid, 0)`) 직접 확인해 살아있으면 무조건 거부.
(b) multi-takeover 테스트의 spin-wait 배리어가 순수 busy-wait여서 CI의
2-vCPU 러너에서는 5개 프로세스가 동시에 스케줄되지 못해 결정적으로
실패함을 `taskset -c 0,1`로 재현 확인 — 이 커밋을 그대로 머지했으면 CI가
깨졌을 것. setTimeout으로 대기를 양보하고 마지막 15ms만 짧게 busy-spin하는
방식으로 교체, 그래도 남는 스케줄링 변동성(같은 검증 코드 경로를 매번
때리지는 못함)은 코드 자체의 결함이 아니라 "이 특정 비검증용 보조
assertion이 스케줄러에 의존한다"는 사실이므로, 정확성 불변식(정확히 1명
승자, 모든 loser가 인식된 사유로 거부)은 매 시도 무관용으로 유지한 채
"적어도 한 번은 settle-reconfirm 코드를 실제로 탔는가"만 최대 8회
재시도하도록 재구성(2-vCPU 시뮬레이션 10/10, 1-vCPU 5/5 재검증). 그 외:
`purge-data.mjs`의 확인 프롬프트가 Ctrl-C/Ctrl-D에서 lock을 쥔 채 무한히
멈춰있던 것(재현 확인)을 readline의 SIGINT/close 이벤트를 경합시켜
고침; owner-lock 2차 검증 제거가 사실 dead code가 아니라 실질적 보호
윈도였다는 걸 재검수가 지적해 주석을 재정정하고 그만큼 DEFAULT_SETTLE_MS
300→350 보정, `server/index.js` 자체 fallback(300)이 그 보정과
따로 놀던 걸 같이 고침. 전체 게이트 재실행 green(tsc/build/build:preview/
test:all ×3, 마지막 실패 1회는 기존에 문서화된 tablet-viewport.spec.mjs
Chrome-profile-cleanup ENOTEMPTY flake로 확인, tablet-core pytest 80,
FROZEN zero-diff), `tests/owner-lock.spec.mjs` 37 assertion(멀티테이크오버
재시도 횟수에 따라 실행마다 37~53 사이로 변동 가능 — CI는 개수가 아니라
pass/fail만 게이트).

4라운드(이번 커밋): 3라운드 결과에 대한 재검수(약 134k 토큰, 44 tool
call, ~17분) — 이번엔 두 HIGH 결함(STALE_MS=90 잔여 데이터 손실 경로,
CI 깨지는 busy-wait) 모두 **실제로 닫혔다고 확인**(리버트 재현 + 수정 후
재검증 둘 다 직접 실행해서 검증), 다만 병합 전 원해야 할 기계적 개선
3가지를 지적: (1) ownerLock.js 함수 본문 안에 "2차 검증은 dead code"라는
철회된 주장이 그대로 남아 헤더 주석과 자기모순 — 주석 재수정.
(2) multi-takeover 테스트에서 "인식된 거부 사유" 정규식이 heartbeat가
정상적으로 소유권 상실을 감지해 자진 종료하는 정상 케이스("fatal: lost
ownership of the data directory lock...")를 못 잡아 CPU 경쟁 상황에서
가짜 실패를 만들 수 있음(측정: 노이즈 있는 2-vCPU에서 7/10) — 정규식에
추가. (3) 이번 라운드의 두 핵심 수정(STALE_MS="90" 라이브 서버 거부,
Ctrl-C/Ctrl-D) 자체에 대한 회귀 테스트가 없었음 — 추가.
(2)+(3)을 구현하며 Ctrl-C 회귀 테스트가 아이들 상태에서도 약 1/5로
flaky한 걸 새로 발견: readline-scope `rl.once('SIGINT', ...)`는 lock
획득 이후 프롬프트 도달 전(pid-liveness 체크 등) 구간에서 SIGINT가 오면
못 잡는 진짜 gap이 있었음 — 프로세스 레벨 `process.on('SIGINT', ...)`
핸들러(스크립트 시작 시 바로 등록, held lock 있으면 release 후
`process.exit(130)`)로 교체해 근본적으로 해결(readline 쪽엔 EOF용
'close'만 남김, Node의 문서화된 권장 패턴과 일치). 재검증: Ctrl-C 8/8,
Ctrl-D 8/8 클린; `tests/owner-lock.spec.mjs` 20 → 45 assertion(정상
1회 실행 기준). 전체 게이트 재실행 green(tsc/build/build:preview/
test:all ×2, tablet-core pytest 80, FROZEN zero-diff), owner-lock
스위트 2-vCPU 시뮬레이션 8/8·정상 조건 5/5 클린 확인. 4라운드 재검수가
"두 HIGH 결함 모두 실제로 닫혔다"고 확인하며 "기계적 수정 3가지만 더 하면
루프를 닫으라"고 권고했고, 이전 커밋이 그 3가지를 반영.

5라운드(이번 커밋): 그 3가지 기계적 수정 자체에 대한 재검수(약 110k
토큰, 35 tool call, ~21분)가 **REQUEST CHANGES** — 새로 도입한
`process.on('SIGINT', ...)` 핸들러 자체에 진짜 결함 발견. HIGH: 이
핸들러는 `ownerLock`(module-scope 변수)이 실제로 할당된 이후에만 release를
시도하는데, stale-lock TAKEOVER 경로에서는 `acquireOwnerLock()`이 lock
파일을 디스크에 이미 durable하게 쓴 뒤에도 settle window(350ms) 동안
sleep하다가 그제서야 return(=`ownerLock` 할당) — 그 sleep 구간에 SIGINT가
오면 핸들러가 `ownerLock`이 아직 null이라고 보고 release를 건너뛰어,
디스크엔 이 프로세스의(곧 죽을) pid를 이름 붙인 lock이 실제로 남고,
그 뒤 진짜 서버가 그 죽은 pid를 근거로 시작을 거부당함 — 100~400ms
delay sweep으로 직접 재현·확인. 수정: `ownerLock`이 아직 없어도, 디스크의
현재 lock이 **자신의 pid**를 가리키면(동시에 살아있는 프로세스 중 pid는
유일하므로 그 lock을 쓴 건 자기 자신일 수밖에 없음) 직접 unlink하는
fallback 경로 추가 — 재검증 100~400ms 전 구간 100% 무결함(lockLeft=no).
그 외 지적: SIGTERM/SIGHUP 미처리(동일 클래스 결함, `kill <pid>` 기본
시그널이라 더 흔함) — 세 시그널 모두 같은 핸들러로 통일; 이중 시그널
재진입 시 release가 건너뛰어질 수 있는 이론적 gap — `exiting` 플래그로
방어(테스트로는 release 자체는 항상 성공, 드물게 exit() 자체만 느려지는
libuv 신호처리 quirk 하나 관찰 — 실제 lock 누수는 없어 낮은 우선순위로
문서화만); readline 관련 코멘트가 Node 22의 실제 기본 동작(프롬프트가
raw mode일 때 rl 자체 'SIGINT' 리스너가 없으면 readline이 자체적으로
close+AbortError 처리하고 OS SIGINT는 프로세스까지 아예 안 옴 — 이전
코멘트의 "프로세스로 전달된다"는 설명은 반대였음)과 달라 정정. 이 라운드
자체가 새로 만든 Ctrl-C 회귀 테스트(execFileSync의 input: 방식이 pty의
process-group 할당과 경합해 idle 상태에서도 ~20% 행 — `timeout`이 자식을
새 프로세스그룹에 넣어 신호가 엉뚱한 그룹에 전달될 수 있음)도 발견해
spawn 기반으로 재작성(프롬프트 텍스트가 실제로 stdout에 나타난 뒤에만
바이트 전송 — deterministic, 재검증 5/5·2-vCPU 8/8 클린), SIGTERM은
pty를 거치지 않는 별도 블록으로 분리(`script`(1) 래퍼 프로세스에 대한
kill이 안쪽 node 프로세스까지 안 감을 확인 후). `tests/owner-lock.spec.mjs`
45 → 49 assertion. 전체 게이트 재실행 green(tsc/build/build:preview/
test:all, tablet-core pytest 80, FROZEN zero-diff — test:all 전체 체인
중 1회는 무관한 기존 privacy-canary 테스트가 flake했으나 격리 실행
3/3·재실행 모두 clean으로 이 라운드 변경과 무관 확인), owner-lock
스위트 2-vCPU 8/8 클린.

6라운드(이번 커밋): 5라운드 결과(커밋 `816f27f`)에 대한 재검수가 그
`process.on('SIGINT'|'SIGTERM'|'SIGHUP', ...)` 핸들러 자체에서 또 다른
HIGH 결함을 발견 — 같은 누수 클래스(F1)의 **다른** 윈도. 핸들러의
`releaseAnyLockWeMightHold()`는 `if (ownerLock) { await
ownerLock.release().catch(()=>{}); return }`로, module-scope
`ownerLock`이 이미 할당돼 있으면(=정상 흐름 진행 중) release 호출 뒤
곧장 return했다. 그런데 `server/ownerLock.js`의 `release()`는 자신의
첫 `await`(실제 read-then-unlink) **이전에** `released = true`를
동기적으로 먼저 세팅한다 — 그 사이(측정 ~4ms) 신호가 재진입하면
release()를 두 번째로 호출한 것이 되어 "이미 처리 중"으로 즉시
early-return하고, 위의 `return`이 그 아래 디스크-기반 fallback을 통째로
건너뛰어, 디스크엔 이 프로세스의(곧 죽을) pid를 이름 붙인 lock이 실제로
남는다 — 100~400ms 딜레이 스윕으로 직접 재현(약 19~20% 확률). 수정:
`releaseAnyLockWeMightHold()`가 handle 유무와 무관하게 **항상** 디스크
체크로 fall through하도록 `return` 제거(release()가 실제로 끝난
경우엔 no-op, 안 끝난 경우에만 실질적으로 작동). 같은 재검수의 두 번째
지적(NEW-2): 이 디스크 fallback의 pid-일치 조건에 인접한 liveness
체크와 달리 hostname 검사가 없어, 공유 마운트에서 다른 호스트의
숫자상 우연히 같은 pid를 지워버릴 이론적 gap — `record.hostname ===
hostname()` 조건 추가로 인접 체크와 통일.

이 라운드 자체가 새 회귀 테스트(Part 6e, release() 자체가 실행 중인
윈도를 겨냥한 330~460ms 딜레이 스윕)를 작성하며 두 가지 테스트 전용
버그를 스스로 발견·수정했다(둘 다 프로덕션 코드와 무관, 검증 결과는
디버그 계측으로 직접 확인): (1) 새 Part 6e 블록이 자식 프로세스의
stdout/stderr을 드레인하지 않아 OS 파이프 버퍼가 차면 자식의 write()가
블록되어 `process.exit()`에 도달하지 못하는 고전적 child_process
교착 — 22-샘플 스윕이 5회 중 3회 행(hang)함을 재현, 드레인 추가로
1차 수정. (2) 드레인만으로는 불충분함을 재확인(같은 5회 중 2회 여전히
행) — 임시 계측(`SAMINDANG_DEBUG_SIGNAL` env var로 release()/시그널
핸들러/main() 각 단계에 타임스탬프 로그)으로 근본 원인을 확정: 자식
프로세스는 실제로 정상 종료했음(자신의 내부 로그가 `process.exit(0)`을
기록)에도 불구하고, **부모 테스트 프로세스의 `child.on('exit', ...)`
리스너가 발화하지 않아** `waitForExit`가 10초 타임아웃까지 영원히
대기함을 확인 — Node의 child_process 'exit' 이벤트가 SIGCHLD 기반
waitpid reap을 JS ChildProcess 객체에 매칭하는 내부 메커니즘인데, 이
테스트의 특정 spawn/kill cadence(짧은 간격으로 22개 프로세스를 연속
생성) 하에서 그 매칭이 이따금 누락됨 — `server/ownerLock.js`나
`scripts/purge-data.mjs`의 결함이 아니라 순수 테스트-하네스 신뢰성
문제(같은 계측으로 purge 스크립트 자신의 동작은 매번 올바름을 확인).
수정: 공용 `waitForExit` 헬퍼(9개 호출부 전체에 동일 이론적 노출이
있어 Part 6e만이 아니라 헬퍼 자체를 강화) 자체에 pid-liveness fallback
추가 — `state.exitCode !== null`(이벤트 발화) **또는**
`!isPidAlive(child.pid)`(OS가 pid 소멸을 직접 보고, purge-data.mjs의
동일 패턴 재사용) 중 하나만 참이면 대기 종료. 진단에 쓴 임시 계측
코드는 전부 되돌리고(`git status` 클린 확인) 실제 수정만 커밋에 남김.

재검증: (a) release()-윈도 수정 자체 — 되돌리면 Part 6e 스윕에서
2/16 누수, 복원하면 0/16. (b) waitForExit pid-liveness fallback —
수정 전 `node tests/owner-lock.spec.mjs` 단독 실행 6회 중 4회 행,
2-vCPU(`taskset -c 0,1`) 시뮬레이션 20회 연속(별도의 격리된 재현
스크립트) 행 재현 안 됨(수정 전 상태에서도 격리 시나리오 자체는
안정적이었고, 전체 스위트의 누적 프로세스/이벤트루프 상태에서만
드러남 — 그래서 반드시 전체 스위트로 재현해야 했음); 수정 후 전체
스위트 단독 실행 8/8 클린, `taskset -c 0,1` 시뮬레이션 5/5 클린(총
13/13). `tests/owner-lock.spec.mjs` 49 → 50 assertion. 전체 게이트
재실행 green — `npx tsc -b --force`(0 에러), `npm run build`/
`build:preview`(둘 다 성공), `npm run test:all`(파이프 없이 직접
exit code 캡처로 재확인 — 첫 실행 시 `| tail -120`로 잘못 캡처해
tail의 exit code(0)를 test:all 것으로 착각할 뻔한 자체 검증 실수를
발견·정정, 재실행 결과 실제 exit 0, 전체 로그 4687줄 중 FAIL 0건,
owner-lock 50/50 포함), `cd "tablet core" && python3 -m pytest
tests/ -q`(80 passed), `git diff origin/main -- 'src/spec/*Logic.ts'
'src/spec/*Adapter.ts'`(empty, FROZEN zero-diff).

7라운드(이번 커밋): 6라운드 결과(커밋 `6d25433`)에 대한 재검수(실제
Opus subagent 호출, 136k 토큰·42 tool call·약 17분, worktree 격리·읽기
전용 확인됨)가 6라운드의 핵심 수정 자체는 실제로 유효하다고 확인하면서
(되돌리면 161회 시도 중 3회 누수, 복원하면 0회 — 직접 재현),
**전혀 다른 지점에서 HIGH 결함**을 새로 발견: 이번 라운드까지 owner
lock 관련 signal-handler 수정은 전부 `scripts/purge-data.mjs`에만
적용돼 있었고, **실제 서버(`server/index.js`)의 부팅 경로는 정확히
같은 F1 결함 클래스(process.on('SIGINT'/'SIGTERM', ...)를
acquireOwnerLock() 이후, 심지어 server.listen() 이후에나 등록)가
그대로 남아 있었다** — stale-lock TAKEOVER 경로에서 acquireOwnerLock이
lock 파일을 디스크에 쓴 뒤 settle window(기본 350ms) 동안 sleep하다가
그제서야 return하는데, 그 사이 Ctrl-C 하면 아무 핸들러가 없어 lock이
그대로 남고, 재시작도 `purge-data.mjs`도 그 죽은 pid를 근거로 거부당함
— 실제 서버 프로세스로 delay sweep 재현: 21회 시도 중 18회 누수. 수정:
`purge-data.mjs`가 이미 하던 방식 그대로 — acquireOwnerLock 호출 전에
핸들러를 등록하고, 핸들 없을 때 디스크 직접 확인(자기 pid+hostname
일치 시 제거)하는 fallback을 `server/index.js`에도 포장(재검증:
같은 sweep 21회 전부 무결함).

이 수정 자체를 검증하려고 새로 만든 회귀 테스트(Part 3c, 서버 프로세스
대상 signal sweep)가 **자기 자신이 실제로 또 다른, 더 좁은 결함을
잡아냄**(19회 중 1회 누수) — acquireOwnerLock의 takeover
write(`writeFile(tmp)` 후 `rename(tmp, lockPath)`)가 signal handler와
별개의 async 체인이라, rename의 OS 레벨 syscall은 이미 디스크에
반영됐지만 그 JS Promise는 아직 resolve되지 않은 찰나에 신호가 오면,
fallback의 단발성 디스크 읽기가 그 순간의 상태를 못 보고 지나칠 수
있음 — 이후 `process.exit()`가 불려 그 pending Promise는 영영 재개되지
않음. 수정: 즉시 확인 + 50ms + 150ms 세 번의 디스크 재확인으로
바꾸고(이 로직은 `purge-data.mjs`와 `server/index.js` 양쪽에 동일하게
필요하므로 `server/ownerLock.js`에
`releaseAnyLockNamedThisProcess(dataDir, handle)`로 공용화 — 두
호출부의 로컬 복사본 삭제) 20회 연속 재검증(2-vCPU 시뮬레이션 5회
포함) 전부 0 누수로 확인.

같은 재검수가 6라운드의 테스트 하네스 변경(`waitForExit`의
pid-liveness fallback) 자체에 대해서도 별개의, 진짜 지적을 함: Node의
'exit' 이벤트는 시그널로 죽은 프로세스에 대해 `code=null`을 주는데(코드
호출로 종료가 아니라 시그널 종료이므로), 옛 술어(`exitCode !== null`
단독)는 이런 경우 절대 만족되지 않았을 것이고 — 이 재검수의 SIGKILL
표적 프로브로는 실제로 `waitForExit`가 이제 `!isPidAlive` fallback으로
빠르게(약 30ms) "완료"로 판정해버려, 만약 어떤 서버가 정상 거부 대신
시그널로 죽는 방향으로 회귀해도 `exitCode !== 0` 류의 단언이 조용히
계속 통과할 수 있는 이론적 gap을 지적(이 저장소의 실제 코드 경로에서
현재 활성으로 그런 오탐을 낸 적은 없음 — `spawnServer`/purge-data.mjs
양쪽 다 정상 경로에서는 시그널이 아니라 `process.exit()` 코드로
종료함, 재검수도 이를 인위적 SIGKILL 프로브로만 시연). 다만 애초에
이 라운드가 왜 pid-liveness fallback을 도입했는지(자식이 code=0으로
자연 종료했다는 자체 계측 로그를 남겼는데도 부모의 'exit' 이벤트가
관측되지 않은 것으로 보였던 원인) 재검수의 SIGKILL 프로브로는
재현/반증되지 않아 정확한 메커니즘은 여전히 확정하지 못했다 — 정직하게
인정하고, 서로 다른 두 안전장치(코드나 시그널 중 하나라도 관측되면
완료로 판정 + OS pid-liveness 재확인)를 배타적이지 않게 함께 유지하는
쪽으로 정리(관련 주석도 "Node의 exit 이벤트 자체가 발화 안 한다"는
단정을 걷어내고 재검수 결과를 정확히 반영하도록 수정). 임시(ad-hoc)
state 객체 3곳도 `exitSignal` 추적을 `spawnServer`와 동일하게 맞춤.

같은 재검수가 지적한 회귀 테스트 민감도 문제(Part 6e 스윕이 6ms 간격
22개 지점뿐이라, 프로덕션 수정을 되돌려도 10회 중 3회만 실제로
잡아냄 — 누수가 몰린 지점이 22개 중 단 2곳)도 반영: 2ms 간격 66개
지점으로 촘촘하게. HANDOFF의 "2/16" 표현도 스윕 1회당 신뢰도가
아니라 실제 측정치(10회 중 3회)를 정확히 반영하도록 이 항목에서
바로잡는다.

전체 게이트 재실행 green — `npx tsc -b --force`(0 에러), `npm run
build`/`build:preview`(둘 다 성공), `npm run test:all`(직접 exit code
확인, exit 0, 전체 로그 4689줄 중 FAIL 0건, owner-lock 51/51 — 신규
Part 3c 포함), `cd "tablet core" && python3 -m pytest tests/ -q`(80
passed), `git diff origin/main -- 'src/spec/*Logic.ts'
'src/spec/*Adapter.ts'`(empty, FROZEN zero-diff). `tests/
owner-lock.spec.mjs` 50 → 51 assertion(신규 Part 3c 서버 부팅 경로
sweep 1개 추가, 기존 assertion 개수는 스윕 표본 수에 따라 실행마다
소폭 변동 가능 — CI는 pass/fail만 게이트).

8라운드(이번 커밋): 7라운드 결과(커밋 `14ee716`)에 대한 재검수(실제
Opus subagent 호출, 148k 토큰·59 tool call·약 22분, worktree 격리·읽기
전용 확인됨)가 **핵심 프로덕션 수정(`server/index.js`의 조기 핸들러
등록) 자체는 실제로 완전하다고 확인**하면서도(직접 깨보려 시도했지만
못 깼음 — checkDataDirsWritable 구간의 raw-signal 종료 79건 전부 무해,
onLockLost와 shutdown()의 동시 실행도 안전, 이중 시그널 reentrancy도
방어됨을 개별 확인), **7라운드 자신이 만든 방어 장치 두 곳에서 새
결함**을 찾음:

(a) MEDIUM, 실측 확인 — 7라운드가 좁은 rename-in-flight 레이스를
막으려고 추가한 `[0, 50, 150]`ms 재시도 루프가 **handle이 이미 정상
release된 경우에도 무조건 실행**돼, 정상적인 signal 기반 종료
**전부**(Ctrl-C, `kill`, 재시작 등 사실상 모든 케이스)에 최대 200ms를
낭비하고 있었음 — 실측: SIGTERM→프로세스 종료가 7라운드 이전 약
9ms에서 이번 라운드 약 210ms로 23배 느려짐. 더 나쁜 건, 그 200ms 동안
서버는 여전히 listen 중이고 lock 파일은 이미 없는 상태라, 그 사이 두
번째 프로세스가 시작하면 자신이 유일한 소유자라고 믿어버리는 — 바로
이 모듈이 막으려는 그 two-owner 상태 — 새 창을 만들고 있었음. 수정:
`release()`가 "이번 호출이 실제로 authoritative 한
확인+unlink까지 직접 수행했는지"를 boolean으로 반환하도록 바꾸고,
`releaseAnyLockNamedThisProcess`는 handle의 release()가 실제로 그
작업을 했으면(true) 즉시 반환(재시도 불필요 — 그 promise가 resolve된
시점에 디스크 상태는 이미 확정), 다른 동시 호출이 이미 가로챘을
때만(false, handle 없을 때와 동일하게) 재시도 루프로 진입 — 6라운드가
막았던 이중 시그널 케이스는 여전히 정확히 이 경로로 보호됨. 재검증:
정상 SIGTERM 종료 지연 다시 약 8-11ms로 복귀, F-A/rename-in-flight
양쪽 재현 스윕 모두 0 누수 유지.

(b) MEDIUM, 실측 확인(가장 심각) — 7라운드가 새로 만든 Part 3c
서버-부팅-경로 sweep 자체가 **이 저장소의 실제 CI 하드웨어 프로파일
(`.github/workflows/ci.yml`의 `ubuntu-latest`, 2 vCPU)에서 조용히
무의미해짐**을 발견: 고정된 20-200ms 지연 스윕이었는데, 이 재검수가
`taskset -c 0,1` + CPU 부하 2-3개를 얹은 시뮬레이션에서 실제 takeover
write가 400-580ms대에야 일어남을 측정 — 즉 부하 있는 CI에서는 스윕의
모든 신호가 lock 파일이 아직 써지기도 전에 도착해, 지울 게 아예
없어서 항상 "0 leaked"로 통과함. 직접 재현: 7라운드 이전(버그가 있는)
`server/index.js`로 되돌린 뒤 같은 부하 조건에서 이 테스트를 그대로
실행 → 여전히 "0 leaked"로 green, 전체 스위트도 green — 즉 이 회귀
테스트가 정작 지키려는 HIGH 버그를 재도입해도 CI에서 못 잡는 상태였다.
수정: 고정 지연 대신 **실제로 관찰된 사건에 앵커** — lock 파일이
정말로 이 자식 프로세스의 pid를 갖게 된 순간(=takeover write가 실제로
반영된 순간)을 폴링으로 확인한 뒤에야 신호를 보내도록 재작성(부팅
속도가 얼마나 느리든 항상 window 안에 정확히 착지), 그 관찰 시점
이후 0-30ms 지터를 줘서 release() 실행 중 구간도 함께 샘플링. 또한
Part 3b의 `multi-takeover` 자체가 이미 쓰고 있던 "적어도 한 번은
실제로 그 코드 경로를 탔는가" 커버리지 자기점검 패턴을 그대로 이식 —
관찰 자체가 한 번도 안 됐으면 무조건 FAIL하도록 만들어, 이 테스트가
다시는 조용히 무의미해질 수 없게 함. 재검증: 같은 부하 조건에서
버그가 있는 `server/index.js`로 다시 되돌리면 이제 20/20 관찰·20/20
누수로 명확히 FAIL(전 라운드처럼 조용한 통과가 아니라); 수정된
`server/index.js`로는 20/20 관찰·0 누수로 17회 연속(2-vCPU 시뮬레이션
5회 포함) 클린.

같은 재검수가 지적한 LOW 항목(코멘트 정확성): 재시도 루프의 근거로
"rename의 OS syscall은 이미 디스크에 반영됐지만 JS Promise가 아직
resolve 안 된 상태에서 읽으면 놓칠 수 있다"는 설명은 POSIX rename(2)의
원자성과 모순됨(반영이 끝났다면 그 이후의 어떤 read도 놓칠 수 없음) —
실제로는 rename이 libuv 스레드풀에 아직 큐잉만 되어 완료 전인 상태를
가리키는 것이므로, 코드(재시도 자체)는 옳지만 근거 서술이 틀렸었다 —
정정. 이 잘못된 모델이 (a)의 "재시도는 어차피 드물게만 필요하니
비용이 미미하다"는 (틀린) 정당화로 이어졌던 것이므로 문서 정확성이
실질적으로 중요했다.

**재검수가 시도했지만 못 깬 것들**(정직하게 기록): `releaseAnyLockNamedThisProcess`가
다른 프로세스의 정당한 lock을 실수로 지울 가능성(pid+hostname 동시
일치가 필요해 불가능하다고 확인), `handle.release()`와 재시도 루프
자체의 디스크 읽기가 서로 겹쳐 잘못된 결과를 낼 가능성(release()를
완전히 await한 뒤에만 재시도가 시작되므로 겹침 없음), `onLockLost`
경로가 실수로 새 소유자의 lock을 지울 가능성(여전히 release 관련
함수를 전혀 호출하지 않음을 재확인), exitSignal-aware `waitForExit`
술어의 새로운 취약점(SIGKILL을 실제로 쓰는 유일한 테스트는 이미
exitSignal을 올바르게 확인하고 있었음을 재확인), `purge-data.mjs`
쪽 동작 변화(공용 함수로 바꾼 뒤에도 동일함을 재확인).

전체 게이트 재실행 green — `npx tsc -b --force`(0 에러), `npm run
build`/`build:preview`(둘 다 성공), `npm run test:all`(직접 exit code
확인, exit 0, FAIL 0건, owner-lock 52/52), `cd "tablet core" &&
python3 -m pytest tests/ -q`(80 passed), `git diff origin/main --
'src/spec/*Logic.ts' 'src/spec/*Adapter.ts'`(empty, FROZEN zero-diff).

9라운드(이번 커밋, Round 17 CLOSED): 8라운드 결과(커밋 `bff4f31`)에
대한 재검수(실제 Opus subagent 호출, 151k 토큰·84 tool call·약 42분,
worktree 격리·읽기 전용 확인됨)가 8라운드의 두 수정(F-2 무조건 재시도
제거, F-1 Part 3c 관찰-기반 앵커링)은 실제로 유효하다고 확인하면서도
(직접 shutdown 지연 재측정 8-11ms 유지, 버그 재도입 시 부하 상황에서도
Part 3c가 20/20 관찰·20/20 누수로 여전히 loud FAIL함을 자체
mutation으로 재확인), `releaseAnyLockNamedThisProcess`에서 **다섯
라운드 연속으로 같은 함수에서 나온 MEDIUM 결함**을 새로 찾음:
`release()`가 "이번 호출이 authoritative 작업을 직접 했다"고
true를 반환하면 재시도 루프를 즉시 건너뛰는데, 그 판단은 **이미
진행 중이던 heartbeat tick**(자신의 `readLock`/`atomicWrite`가
release()의 unlink보다 먼저 시작됐지만 나중에 끝나는 경우)까지
고려하지 않았음 — heartbeat 콜백은 자기 자신의 진입 시점에만
`released`를 확인하고, 그 이후의 await 지점들에서는 재확인하지
않으므로, release()가 unlink를 마친 *뒤에* 이미 시작돼 있던
heartbeat의 atomicWrite가 뒤늦게 완료돼 lock 파일을 되살릴 수 있음.
in-process 직접 재현(heartbeatMs=20, 신호를 heartbeat tick 발화
순간에 맞춰 조준): 85~88/300 누수, 창 폭 약 2ms(heartbeatMs=100
기준 정밀 스윕에서 tick 발화 시점 전후 0.5~1.5ms 구간에만 집중).
실서버 SIGTERM 종단간 재현에서도 동일 증상(죽은 pid를 근거로 재시작
거부)까지 확인. 이 결함은 기본 설정(heartbeatMs=15000)에서는 약
1/7500 확률로 드물지만, 소비자가 이 값을 낮추면 그만큼 확률이
올라가고 — 결과 자체는 5·6·7라운드가 반복해서 닫아온 것과 동일한
"죽은 pid로 재시작 거부" 증상이므로 correctness 결함으로 취급.

수정: `release()`가 `released=true`로 표시하고 unlink하기 *전에*,
이미 진행 중이던 heartbeat tick의 Promise(`beatInFlight`)를 먼저
기다려 완전히 끝내도록 함 — 그 이후에야 자신의 read+unlink를
수행하므로, 그 unlink가 정말로 "마지막 쓰기"임이 보장됨. 재검증:
in-process 재현 0/300(부하 없이도, `taskset -c 0,1`에서도), 실서버
SIGTERM 지연 재측정 median 9ms(8라운드가 없앤 200ms 재도입 없음),
새 회귀 테스트(heartbeat-in-flight sweep, 300 trial in-process
직접 `acquireOwnerLock`/`release()` 호출 — 이 파일의 "실제 별도
OS 프로세스만" 원칙은 멀티프로세스 가시성 문제를 위한 것이고 이
결함은 단일 프로세스 내부 async 인터리빙이라 원칙 예외로 명시하고
직접 호출 방식 채택, 이미 `patientIdentityStore.js`를 직접 import하는
기존 관례와 일치)가 수정 전 88/300, 수정 후 0/300으로 실제 버그
탐지력을 스스로 증명. 전체 스위트 15회(2-vCPU 시뮬레이션 5회 포함)
전부 clean, 매 실행 server-boot-path/heartbeat-in-flight/release-window
세 스윕 모두 0 누수.

전체 게이트 재실행 green — `npx tsc -b --force`(0 에러), `npm run
build`/`build:preview`(둘 다 성공), `npm run test:all`(직접 exit code
확인, exit 0, FAIL 0건, owner-lock 53/53), `cd "tablet core" &&
python3 -m pytest tests/ -q`(80 passed), `git diff origin/main --
'src/spec/*Logic.ts' 'src/spec/*Adapter.ts'`(empty, FROZEN zero-diff).

**Round 17 CLOSED (최종, 10라운드 재검수로 확정)**: 사용자 지시에 따른
hard-stop 정책("HIGH 또는 실제 correctness·data-loss·security·
cross-patient leak·restart durability·concurrency 결함만 재오픈,
MEDIUM/LOW/이론적 hardening/테스트 완성도 개선/성능/정리는 backlog로
기록 후 CLOSED, 단 기존 테스트가 HIGH급 버그를 놓쳐 false-green이 되는
것이 입증되면 correctness 문제로 간주")에 따라, 커밋 `f24df8b`를
대상으로 10번째 독립 Opus 재검수(실제 subagent 호출, 141k 토큰·76
tool call·약 38분, worktree 격리·읽기 전용 확인됨)를 수행 — **명시적
"VERDICT: no HIGH-severity defect found — Round 17 can close"** 판정.
이 라운드는 9라운드의 `beatInFlight` 수정 자체를 직접 깨보려 시도
(assignment window 250-trial fuzz 0 leaks, `onLost` 동시 실행
200/200 안전, settle-window와의 복합 시나리오는 구조적으로 불가능임을
확인)했고, 숫자 주장도 전부 자체 재현(수정 전 62~108/300 부하별 재현,
수정 후 0/300, 실서버 종단간 SIGTERM/이중 시그널 latency 6-9ms로
무회귀)했으며, false-green 여부도 명시적으로 검사(Part 3d는 자체
coverage guard가 없지만 부하를 걸어도 여전히 실제 버그를 감지함을
확인 — false-green 아님)했다. CI(`build-and-test`+`build-and-deploy`)
green, FROZEN zero-diff 확인됨.

이 재검수가 새로 찾은 것은 전부 LOW~MEDIUM이며 재오픈 기준(HIGH)에
못 미쳐 backlog로만 기록:
- **B1(신규, LOW)**: `beatInFlight`가 단일 슬롯이라 한 heartbeat tick의
  자체 fs 작업(readFile+writeFile+rename)이 `heartbeatMs`보다 오래
  걸려 두 tick이 겹치면 앞 tick의 `.finally()`가 뒤 tick의 참조를
  지워버릴 수 있음(주입 지연 실험으로 재현: 19-45ms 지연 시
  53~67/150 누수). 프로덕션 기본값(15000ms)에서 로컬 파일 하나에
  대한 fs 작업이 그만큼 걸릴 시나리오가 없고, 이 값을 낮추는 것은
  테스트만 하므로 트리거 가능성 없음 — 그대로 유지, 고칠 경우
  단일 슬롯 대신 in-flight beat 집합 추적으로 개선.
- **B2(신규, LOW-MEDIUM, false-green 아님으로 확인된 "누락된" 테스트)**:
  `beat()`의 실제 renewal 로직 자체(예: 본문을 즉시 return으로
  바꾸는 mutation)를 검증하는 테스트가 없어, heartbeat 갱신이 통째로
  죽어도 기존 53개 assertion이 전부 green — 실제 결과(살아있는
  서버 두 개가 같은 lock을 동시에 소유)까지 종단간 재현 확인. 다만
  이 gap은 `f24df8b`가 만든 것도 넓힌 것도 아니고(기존부터 있던
  누락), "있어야 할 테스트가 없다"는 커버리지 확장 요청이지 "있는
  테스트가 거짓으로 통과시킨다"는 것이 아니므로 hard-stop 정책의
  false-green 예외에 해당하지 않음 — 향후 별도 "heartbeat liveness"
  테스트 배치로 추천, 이번 라운드 재오픈 사유 아님.
- heartbeat의 read-verify와 atomicWrite 사이 TOCTOU(2라운드부터 문서화된
  기존 residual, heartbeatMs 경계의 two-owner 윈도) — 그대로 유지.
- `exiting`/`shuttingDown` reentrancy 플래그가 release() 자체가 멈추면
  이후 모든 시그널을 삼켜 SIGKILL만 탈출구가 되는 이론적 gap(8라운드
  재검수가 지적, 재현 시도 안 함) — LOW, 그대로 유지.
- atomicWrite의 write→rename 사이 신호로 orphan `.tmp` 파일이 남을 수
  있는 극희소 경로(7라운드 재검수가 1/258로 재현) — LOW, purge 인벤토리
  정확성 문제일 뿐 lock 정합성에는 영향 없음, 그대로 유지.

**Round 17은 여기서 최종 종료. 같은 owner-lock 주제를 추가로 파지
않고 승인된 다음 배치(PR #23↔#24 convergence)로 즉시 진행한다.**

**의도적으로 미룬 것**: Doctor Workspace/RevisitWorkspace React 클라이언트가
새 CAS precondition을 실제로 사용하도록 배선하는 일(충돌 시 UX가 어때야
하는지는 제품 판단) — server-side primitive는 이번 라운드에서 완성되어
테스트로 증명됐고, 클라이언트는 옵션 인자를 그냥 안 쓰면 기존과 100%
동일하게 동작한다.

## Objective (CRM v0.3.1 round 16 — Audit Integrity + Purge Completeness Batch, 이전 세션)
Gomars93가 PR #24 댓글로 지시(GitHub-relayed comment, 사용자 직접 입력
아님). round 15에서 발견된 두 gap을 닫는 후속 배치: (1) `safeAudit`의
silent-drop 실패 모드(logEvent가 등록 안 된 event/actor에 throw하는데
safeAudit이 그걸 console.error만 하고 삼켜서, 미등록 이벤트가 조용히
audit.log에서 사라짐 — round 15의 `patient_identity_linked` 유실이
이 패턴 때문이었고, 이번 라운드에서 `recorder_result_saved`도 같은
이유로 한 번도 기록된 적이 없었다는 걸 새로 발견)를 구조적으로 막기,
(2) `scripts/purge-data.mjs`(파일럿 종료 시 전체 삭제 스크립트)가
`visits/`/`crm/`을 빠뜨리고 있던 걸 닫고 실제로 모든 영속화 디렉터리를
지우는지 증명하기. 지시에 명시적으로 포함: Fable이 실제로 스코핑을
오케스트레이션(사용 안 했으면 그렇다고 명시), Sonnet 구현, **진짜 Opus
subagent 독립 검수**(주장만으로는 불충분, 실제 호출 안 했으면 정직하게
보고), Sonnet-수정 → Opus-재검수를 실질적 이슈가 안 남을 때까지 반복,
최종 게이트(tsc/build/build:preview/test:all/tablet-core pytest/실제
브라우저 QA/CI/Doctor Workspace Preview green), 기존 경계 불변(FROZEN
`src/spec/*Logic.ts`/`*Adapter.ts` zero-diff, Test 0 PENDING, Care Gap
OFF, 임상/신원 정책 확장 없음), 완료 시 정확한 HEAD·변경 파일·실제
Fable/Sonnet/Opus 사용 근거·테스트/실패주입/CI/Preview 결과·FROZEN
zero-diff·의도적으로 남긴 debt를 보고. **PR #24는 여전히 DO NOT MERGE.**

**구현**: `server/audit.js`에 `AUDIT_EVENTS`(32개)/`AUDIT_ACTORS`(3개)
frozen registry 신설, `server/index.js`의 35개 `safeAudit` 호출부 전부
raw string literal에서 상수 참조로 전환(zero raw literal 확인).
`recorder_result_saved` 호출의 `actor: 'recorder'`를 등록 후 실제로
한 번도 안 났던 이벤트가 나가게 수정. `store.js`(submissions),
`visitStore.js`, `microFollowUpStore.js`, `followUpSessionStore.js`,
`stationStore.js`의 `purgeAll()`을 개별 `unlink('*.json')` 루프에서
디렉터리 통째로 `rm(dir, {recursive:true,force:true})`로 재작성(atomicWrite가
crash 시 남기는 `*.json.tmp` orphan까지 지움 — `recorderResultStore`는
이미 이 패턴이었음). `checkDataDirsWritable`를 5개→8개 디렉터리로
확장(`stations`/`crm`/`crm-identity` 부팅 self-check 누락분 추가).
신규 `tests/audit-registry.spec.mjs`(79 assertion: 정적 drift-guard +
23개 실제 이벤트 workflow별 발생 증명 + 미등록 event/actor 계약 +
HTTP 경계 실failure 주입 + retry/dedup 시맨틱 + 50-동시요청 안전성).
`tests/crm-store.spec.mjs`의 purge-full 블록을 stations/recorder-results/
micro-follow-up/follow-up-sessions까지 시딩+삭제확인 하도록 확장
(212→224 assertion, 최종 라운드에서 orphan `*.json.tmp` 회귀 테스트
6쌍 추가분 포함).

**Fable/Opus 실사용**: 이번 라운드는 Fable(`model: "fable"`, Plan
subagent)로 실제 스코핑을 수행(round 15의 Identity Batch는 Fable을 안
썼다고 정직하게 보고했었음 — 이번엔 실제로 씀). 1차 Opus 독립 검수
(`model: "opus"`)가 실제 결함 A(station-assign 시 `assignRevisitToStation`이
내부적으로 `startRevisit`을 호출하는데 `reused` 플래그를 안 써서 신규
방문 생성 시 `visit_created`/`follow_up_session_issued`가 한 번도
안 남던 것)와 B(5개 store의 `purgeAll`이 `.json`만 지우고 orphan
`.json.tmp`는 살아남던 것), 그리고 C(checkDataDirsWritable 누락)/
D(purge-full 테스트 커버리지 gap)/E(오탈자 property reference가
드리프트가드를 통과하는 blind spot)/F(주석의 파일명 오기)를 발견 →
전부 수정 → 커밋 `5e946cd`. 2차(closing) Opus 독립 검수가 그 6개 수정을
전부 코드 읽기 + 인접 5개 테스트 스위트 + 3개의 손수 작성한 런타임
재현 스크립트로 재검증 → **"실질적 엔지니어링 이슈 없음"** 최종 판정,
단 두 항목을 지목: (a) finding B의 수정에 회귀 테스트가 없다(should-fix,
이번에 orphan `.json.tmp` 시딩+삭제확인 6쌍으로 닫음), (h) 이 HANDOFF.md가
round 15 이후 갱신 안 됨(should-fix, 이 항목 자체로 닫는 중). 나머지는
전부 nitpick(문서화 항목이거나 이번 배치 범위 밖의 판단 사항)으로,
코드는 건드리지 않고 여기 기록만 남긴다 — symlink로 구성된 store
디렉터리에서 `rm -rf`가 심볼릭 링크만 지우고 실제 데이터는 안 지울 수
있음(이 배포에서 그렇게 구성한 증거 없음), purge가 이제 첫 실패에서
fail-fast(예전엔 best-effort로 삼키고 계속 진행 — 더 시끄러워진 쪽이 개선),
purge-data.mjs가 보고하는 삭제 파일 수가 `.json`만 세서 실제보다 적게
나올 수 있음, 두 개의 `visit_created`/`follow_up_session_issued` 기록
경로(direct start-revisit vs station-assign)가 서로 다른 순서로 씀(인지상
사소함), 오탈자 drift-guard가 `server/index.js`만 검사(오늘은 그게
`AUDIT_EVENTS`/`AUDIT_ACTORS`를 쓰는 유일한 서버 모듈이라 충분하지만
향후 다른 모듈이 audit을 쓰기 시작하면 사각지대). `unlink` 미사용
import(`stationStore.js`)는 이번에 같이 지웠다.

**게이트**: 이 라운드가 직접 실행/확인 — `npx tsc -b --force`(0 에러),
`npm run build`/`build:preview`(둘 다 성공), `npm run test:all`(exit 0,
전체 green — crm-store 224/audit-registry 79 포함), `cd "tablet core" &&
python3 -m pytest tests/ -q`(80 passed), `git diff origin/main -- 'src/
spec/*Logic.ts' 'src/spec/*Adapter.ts'`(empty, FROZEN zero-diff), GitHub
Actions `build-and-test`/`build-and-deploy`(Doctor Workspace Preview)
둘 다 최신 푸시 commit에서 success. Test 0 여전히 PENDING, Care Gap
여전히 OFF, 임상 threshold/매핑/policy 확장 없음.

## Objective (CRM v0.3.1 round 15 — Identity Production Batch: 레거시 정합화 + 링크 UI + E2E 인수 + 독립 검수 수정, 이전 세션)
Gomars93가 PR #24 댓글로 round 14/재검토 위에 이어서 한 번에 지시한 단일
"Identity Production Batch": **Part A** 레거시(사전-pending-marker) 배포에
남은, pending marker가 아예 없는 orphan reservation을 위한 하위호환
lazy reconciliation(마이그레이션 프레임워크가 아니라 최소 lazy scan,
모호/손상/다중 소유는 추측하지 않고 fail closed) — `findLegacyOrphanedReservations`.
**Part B** 미해결 Today Queue 행에 대한 최소 사용 가능한 Doctor 링크
UI(명시적 확인, 성공 시 즉시 새로고침, 보이는 에러, 조용한 덮어쓰기 없음,
취소=변경 없음, 이중 제출 방지, cross-row 누출 없음) — 명시적으로
unlink/relink/change-mapping UI나 전화/RRN 필드, 새 identity inference는
추가하지 않음. **Part C** 실제 브라우저 E2E(데스크톱 1440×900, 태블릿
가로 1024×768, 태블릿 세로 834×1112)로 confirm 플로우 인수. **Part D**
Fable 오케스트레이션 → Sonnet 구현 → **실제 Opus subagent 독립 검수** →
Sonnet이 비임상 Opus 지적사항 전부 수정 → Opus 재검수 → 남는 실질적
엔지니어링 이슈가 없을 때까지 반복 → 전체 test/CI/Preview 게이트. 진짜
Opus 모델/subagent를 호출하지 않고서는 "Opus 검수했다"고 주장하지 않기 —
완료 보고서는 실제로 어떤 모델/subagent를 썼는지 사실대로 적어야 함.
최종 인수 게이트: tsc -b --force, build, build:preview, test:all,
tablet-core pytest, 실제 브라우저/E2E, 최신 CI green, 최신 Doctor
Workspace Preview green, FROZEN zero-diff, Test 0 PENDING, Care Gap OFF
유지. 승인 범위를 넘는 임상/메시징/provider/identity-policy 확장 없음 —
진짜로 막히는 단일 보호된 결정만 그 줄에 "HUMAN DECISION REQUIRED"로
표시하고 나머지 독립 엔지니어링 작업은 계속 진행. **PR #24는 여전히
DO NOT MERGE.**

## Objective (CRM v0.3.1 round 14 — Sigma 신원 연결 레이어 + Today Queue 사람이 읽을 수 있는 표시, 이전 세션)
Gomars93가 PR #24 댓글로 신원 정책을 승인하고 다음 라운드를 지시했다.
**승인된 정책**: Clinical OS는 기존 내부 random UUID(`patient_uuid`)를 계속
내부 키로 쓴다. 그 UUID에서 Sigma `chart_no`/patient_id로의 1:1 연결을
추가한다. Doctor용 CRM 화면은 **환자명 + 차트번호**를 표시할 수 있다.
RRN은 저장/매칭에 절대 쓰지 않는다. 전화번호는 큐 표시용 식별자로 쓰지
않는다(추후 아웃바운드 연락 플로우에서 필요하면 별도 보호되는 메시징/
provider 정책 아래 Sigma에서 그때그때 가져온다). 동명이인/재등록/모호한
환자를 절대 자동 병합하지 않는다 — 모호하거나 첫 연결은 사람의 명시적
확인이 있어야 하며, 실패 시 항상 fail closed. 연결된 Sigma chart_no가
암묵적으로 다른 Clinical OS UUID로 Task/Episode를 재배정하는 일이 없도록
cross-patient isolation을 유지한다.

**이번 라운드의 단일 과제**: 최소한의 안전한 Sigma 신원 연결 레이어를
구현하고, 이를 이용해 Today Queue를 사람이 읽을 수 있게 만든다. 인수
조건(8개): (1) `clinical_patient_uuid <-> sigma_chart_no` 최소 durable
매핑, 양방향 1:1, RRN/전화번호 저장 금지, (2) 기존 Episode/CrmTask의
`patient_uuid`는 계속 내부 authoritative FK로 유지 — 과거 task를 Sigma
ID로 재작성하지 않음, (3) doctor 인증된 서버 read/enrichment 경로가
저장된 매핑을 표시용 Sigma 사실(이름+차트번호)로 해석 — 조회/연결이
불가능하면 명시적 unresolved 상태를 반환하고 절대 추측하거나 다른
환자로 fallback하지 않음, (4) 읽기 전용 Today Queue가 검증된 경우
`환자명 · 차트번호`를 보여주고, 내부 UUID는 필요 시 비주요 진단/출처
정보로만 유지, (5) 링크 생성/변경은 서버 경계에서 명시적 임상의/직원
확인 행위여야 함 — fuzzy/이름만/전화만 자동 매칭 없음, 기존 매핑의
조용한 덮어쓰기 없음, 충돌은 눈에 보이게 거부, (6) 회귀 테스트가
증명해야 할 것: 중복 Sigma chart_no가 두 Clinical UUID에 연결될 수
없음, 한 Clinical UUID가 조용히 차트를 바꿀 수 없음, unresolved 조회가
다른 환자의 신원을 절대 보여주지 않음, stale/에러 응답이 이전 행의
이름을 흘리지 않음, 재시작 후 매핑 유지, cross-patient Task isolation
유지, (7) 이번 라운드는 신원/읽기 경로에만 집중 — 아웃바운드 메시징/
provider 선택/전화번호 저장/Care Gap suppression/임상 threshold·매핑/
task-action UI는 아직 추가하지 않음, (8) Test 0 여전히 PENDING, Care
Gap suppression 여전히 OFF, `src/spec/*Logic.ts`/`*Adapter.ts` zero-diff
유지, CRM/store/server/client 테스트 + test:all + CI + Doctor Workspace
Preview 재실행. 가장 작은 구현을 우선 — 새 identity framework나 새 제품
문서를 만들지 말 것. **PR #24는 여전히 DO NOT MERGE.**

## Objective (CRM v0.3.1 round 13 — Doctor 클라이언트에 첫 CRM UI(읽기 전용 Today Queue) 추가, 이전 세션)
Gomars93의 다음 지시: round 6-12에서 이미 만들어 검증한
`GET /api/crm/tasks`(round 11) 서버 read path 위에, 처음으로 **CRM UI
표면**을 붙인다 — Doctor 클라이언트 안에 컴팩트하고 **읽기 전용**인
"Today Queue"를 노출한다. 인수 조건(10개, 전부 만족): (1) 기존
`ServerResult`/doctor-token 패턴을 재사용하는 typed `serverClient`
wrapper, (2) 서버가 보낸 순서를 그대로 보존하는 단일 컴팩트 큐 화면 —
클라이언트 재정렬 금지, (3) Safety/Clinical/Routine 구분·reason
code·기한 상태/시각·status/claim 상태·owner를 10초 내에 읽을 수 있는
행, (4) 이미 저장된 `patient_uuid` 표시(짧게 truncate 가능, 전체 값은
접근 가능해야) 외의 환자 신원 해석 금지 — 이름/전화/생년월일/주민번호/
Sigma 조회/재진 환자 병합 없음, (5) 이번 라운드는 철저히 읽기 전용 —
액션 버튼 없음, 그리고 행을 렌더링하는 것만으로 `/seen`을 트리거해서는
안 됨(`first_seen_at`은 그대로 유지), (6) cross-record 안전 — 이전
성공적 fetch의 stale task가 refresh/error/disconnect 이후 현재
데이터인 것처럼 보여서는 안 됨, 진실한 loading/error/empty 상태,
새 선택 아래로 이전 선택의 detail이 새어나오지 않음, (7)
클라이언트 측 synthesis/자동 resolution/grouping/suppression/
threshold/매핑/identity-policy/provider 선택/Sigma-Naver 쓰기 금지,
(8) auth/network 에러의 진실성, 서버 순서 보존, terminal/미래-snoozed
항목을 클라이언트가 만들어낼 수 없음, Safety 구분성, 컴팩트 empty
상태, 전환 시 stale 콘텐츠 없음, 태블릿 뷰포트 안전성(가로 스크롤
없음)을 증명하는 회귀 테스트, (9) FROZEN zero-diff, Test 0 PENDING,
Care Gap OFF 유지, tsc/build/build:preview/test:all/tablet-core 전체
재검증 + 최신 CI/Doctor Workspace Preview, (10) 새 제품 문서 금지,
기존 HANDOFF만 필요 시 최소 갱신. 이번 라운드는 명시적으로 읽기
경로만 다룬다 — resolve/claim/snooze/cancel/supersede 같은 task-action
UI는 다음 라운드로 미룬다. **PR #24는 여전히 DO NOT MERGE.**

## Objective (CRM v0.3.1 round 12 — SNOOZED가 Today Queue에서 실제로 defer되도록 수정, 이전 세션)
Gomars93의 다음 지시: round 11의 `listActionableTasks()`가 non-terminal
상태를 전부 포함하고 있어서, Routine/Clinical task를 `SNOOZED`로 바꿔도
`GET /api/crm/tasks`가 즉시 그대로 보여주고 있었다 — task-engine 자체의
계약과 충돌한다: `SAFETY_REVIEW`는 정확히 "선택한 시점까지 사라지지
않고 계속 보여야 하기 때문에" snooze가 금지되어 있는데, 지금은
non-Safety snooze가 status/due_at은 바꾸면서도 Today Queue 관점에서는
아무 효과가 없었다. 이번 라운드에서는 이 queue-read semantics만
고치고 CRM UI는 시작하지 않는다. 인수 조건: (1) `due_at > now`인
SNOOZED Routine/Clinical은 `GET /api/crm/tasks`에서 빠짐, (2) 이미
저장된 `due_at <= now`가 되면 다시 actionable로 반환됨 — duration/SLA/
threshold/grace period/timezone 규칙 발명 금지, 이미 저장된 절대
timestamp를 server now와 비교만 할 것, (3) Safety는 약화되지 않음 —
SAFETY_REVIEW는 여전히 SNOOZED에 진입할 수 없고 clinician resolution까지
계속 보임, (4) terminal 제외/owner·coverage 필터링/큐 우선순위 정렬/
expired-claim self-heal/first_seen_at semantics/provenance/dedup·
idempotency/version-conflict 동작 전부 불변, (5) 미래-snoozed
Routine·Clinical이 숨겨지고 정확히 그 due_at에/이후에 다시 보이며,
listing이 first_seen_at을 mutate하거나 무언가를 조용히 resolve/cancel/
supersede하지 않음을 증명하는 실제 store + HTTP 회귀 추가, (6) 임상
threshold/매핑/red-flag/Additional Pain/identity-policy/provider 변경
없음, Sigma/Naver 쓰기 없음, Test 0 PENDING·Care Gap suppression OFF
유지, (7) FROZEN zero-diff, tsc/build/build:preview/test:all/tablet-core
+ 최신 CI/Preview 재실행. 가장 작은 구현을 우선 — 스케줄러/cron/새
status/새 제품 문서를 추가하지 말고 기존 Task semantics를
필터링/재사용할 것. **PR #24는 여전히 DO NOT MERGE.**

## Objective (CRM v0.3.1 round 11 — Today Queue read path(GET /api/crm/tasks) 추가, 이전 세션)
Gomars93의 다음 지시: persistence/authorization 라운드는 닫혔고, 이제
non-clinical operability의 다음 병목으로 이동한다. 지금 서버는
Episode-scoped task 조회(`GET /api/crm/episodes/:id/tasks`)와 단일
task 조회만 노출하고, doctor-인증된 컬렉션 read가 없어서 v0.3.1의
Today Queue 첫 화면을 구동할 수 없다. 순수 엔진에 이미 승인된 비임상
정렬 순서가 `sortCrmTaskQueue()`(`SAFETY_REVIEW > CLINICAL_REVIEW >
ROUTINE`, 그다음 overdue, `due_at`, `created_at`)로 존재하므로 라우트에서
그 로직을 재구현하지 말 것. 정확히 하나의 수직 서버 capability만
구현: **doctor-인증 `GET /api/crm/tasks`(actionable Today Queue
소스)**. 요구사항: (1) 새 store-level 컬렉션 리더가 persisted task를
로드하고 기존 `getTask()` 경로를 통해 claim-lease self-heal을 적용하며
actionable/non-terminal task만 반환할 것 — 컬렉션을 가져왔다고 해서
`first_seen_at`을 mutate하지 말 것(실제 UI 노출은 여전히 명시적
`/seen` 액션), (2) 기존 `sortCrmTaskQueue(tasks, now)`로 정렬 — 우선순위/순서
재구현 금지, SLA/threshold 값 추가 금지, (3) Safety를 평범한
최상위-우선순위 큐 항목으로 유지 — communication group에 절대
합치지 않고 auto-resolve/snooze/cancel하지 않음, (4) owner 필터를
노출한다면 기존 `resolveTaskOwner`/`tasksForOwner` semantics와
caller/설정된 coverage queue만 재사용 — 하드코딩된 clinician
이름/스케줄 금지, (5) 응답은 CRM task 메타데이터만 — Sigma 조회, 전화
resolution, raw phone, 환자 이름/DOB/RRN enrichment, provider 호출
전부 없음, (6) 실제 HTTP 회귀로 증명: auth 필수, terminal task 제외,
Safety→Clinical→Routine 정렬, overdue/due/created 정렬, 만료된 CLAIMED
lease가 listing 전에 self-heal, 큐를 가져와도 `first_seen_at`이
설정되지 않음, PHI/raw-phone 모양 문자열 미도입, (7) Test 0 PENDING,
reservation suppression OFF 유지 — Care Gap/LOST threshold, latency
SLA, 임상 매핑, identity-policy 결정, provider 선택, FROZEN 변경, CRM
UI 전부 이번 라운드 범위 밖, (8) tsc -b --force/build/build:preview/
test:all·tablet-core/CI/Preview 재실행, 정확한 변경 파일/assertion
개수/boundary 보고. 새 제품 문서 없음 — 코드/테스트 우선.
**PR #24는 여전히 DO NOT MERGE.**

## Objective (CRM v0.3.1 round 10 — Safety resolve authority를 server-derived로 강제, 이전 세션)
Gomars93의 다음 지시: `POST /api/crm/tasks/:id/resolve`가 `requireDoctor(req)`
가드는 통과하지만, 이후 `actorRole`을 `body?.actorRole === 'STAFF' ? 'STAFF'
: 'CLINICIAN'`로 요청 body에서 그대로 읽어 `resolveTaskStored()`에
넘기고 있었다. 순수 엔진은 STAFF가 SAFETY_REVIEW를 resolve하는 걸
올바르게 막지만, HTTP 경계에서는 같은 doctor route를 통과한 아무나
`actorRole`을 생략하거나 원하는 값으로 보내 CLINICIAN으로 취급될 수
있었다 — 즉 "Safety close 권한 = clinician만"이라는 불변식이 인증된
서버 authority가 아니라 수정 가능한 요청 필드로 강제되고 있었다. audit
actor 귀속도 같은 body 값 기준이었다. 지시된 유일한 과제: resolve
actor authority를 server-derived로 만들고 절대 request-body-derived로
두지 않을 것. 이번 라운드에서 새 staff 인증 체계를 만들지 않는다 —
`/api/crm/*`는 지금 전부 doctor-인증 표면이므로, 최소 안전 수정은
클라이언트 `actorRole`을 authority 입력으로 제거/무시/거부하고,
`requireDoctor()`의 인증된 컨텍스트 자체에서 `CLINICIAN`을 전달하며,
audit도 같은 server-derived 컨텍스트에서 기록할 것. 향후 staff resolve
경로가 필요하면 body flag가 아니라 별도로 인증/인가된 경계에 맡길 것.
요구된 HTTP 경계 회귀: (1) `actorRole: 'CLINICIAN'`이든 `'STAFF'`든
body로 보내도 authorization을 바꿀 수 없음, (2) 현재 doctor-인증 라우트가
server-derived clinician authority 하에서만 Safety를 resolve함, (3)
인증되지 않은 어떤 요청도 CRM task를 resolve할 수 없음, (4) 순수 엔진
Safety invariant는 그대로임, (5) PHI/raw-phone 로깅이나 FROZEN 변경
없음. CRM UI 없음, 임상 threshold/patient-fact→exam 규칙/한약·재활
매핑/red-flag 해석/Additional Pain promotion/patient identity
policy/messaging provider 변경 없음. Test 0 PENDING, Care Gap
suppression OFF 유지. tsc/build/build:preview/test:all/tablet-core +
최신 CI/preview 재실행. **PR #24는 여전히 DO NOT MERGE.**

## Objective (CRM v0.3.1 round 9 — legacy dedup 포인터 업그레이드 호환성, 이전 세션)
Gomars93의 다음 지시: round 8이 새 `{task}` 포맷을 도입하면서
`pointer?.task`만 인식하도록 짰는데, round 6/7 코드가 이미 만들어둔
레거시 `{task_id}`-only 포맷 포인터는 새 코드에게 "포인터 없음"으로
보인다 — 그러면 이미 활성 상태인 source event의 첫 재시도가 두 번째
non-terminal Task를 만들고 인덱스를 새 포맷으로 덮어써버려, round 8이
막으려던 바로 그 중복 상태를 이번엔 "동일 버전 내 crash"가 아니라
"소프트웨어 업그레이드"를 계기로 재현한다. 지시된 유일한 과제: 새
마이그레이션 프레임워크나 데이터베이스 없이 dedup 리더를 기존
`{task_id}` 포인터와 하위 호환되게 만들 것. 선호 형태: 레거시 포인터가
존재하는 Task를 가리키면 오늘과 같은 terminal/non-terminal semantics로
그 Task를 authoritative로 취급하고, 안전한 읽기 이후 선택적으로 포인터를
새 `{task}` intent 포맷으로 lazily 재기록. 레거시 포인터가 존재하지 않는
Task를 가리키면, 기존 불변식이 안전하다고 증명하지 않는 한 조용히 무관한
중복을 만들지 말고 명시적으로 실패/복구할 것. 요구된 회귀: 실제
Round-7 스타일 `{task_id}` 포인터 + non-terminal Task를 디스크에 심고,
현재 store를 restart/deploy 이후처럼 인스턴스화해서, 같은 source
event/contact point로 재시도해 (a) non-terminal Task가 정확히 하나만
남고, (b) 원본 task_id가 반환/dedupe되고, (c) patient identity가 여전히
Episode-derived이며, (d) PHI/raw-phone 문자열이 도입되지 않음을 증명.
레거시 포인터 + terminal Task가 기존 remint 동작을 그대로 보존하는 것도
같이 커버. CRM UI 없음, 임상 threshold/매핑/red-flag/Additional Pain
promotion/identity policy/messaging provider 변경 없음. FROZEN
zero-diff 유지, tsc/build/build:preview/test:all/tablet-core + 최신
CI/preview 재확인. 새 제품 문서 없음. **PR #24는 여전히 DO NOT MERGE.**

## Objective (CRM v0.3.1 round 8 — durable dedup crash window 제거, 이전 세션)
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

## Completed — CRM v0.3.1 Round 14 (Sigma 신원 연결 레이어 + Today Queue 사람이 읽을 수 있는 표시, 이번 세션)
**설계 결정, 명시적으로 기록**: 이 저장소에는 Sigma에 대한 라이브 API
클라이언트/인증정보가 전혀 없다(Test 0 — Naver→Sigma 예약 반영 검증 —
가 여전히 PENDING인 것과 같은 이유). 지시의 "Sigma lookup"을 이 서버가
스스로 Sigma에 네트워크 호출을 거는 것으로 해석해 존재하지 않는 API
스펙/인증 방식을 추측해 구현하는 대신, **사람(직원/임상의)이 Sigma를
직접 조회해 chart_no + 이름을 이 라운드의 명시적 확인 엔드포인트로
확정(confirm)하는 것**으로 구현했다 — round 8의 PREVISIT_LINK가 "SMS/
Kakao 연동을 발명하지 않는다"며 훅만 남겨둔 것과 같은 판단이다. 매핑
저장소(`patient_uuid <-> sigma_chart_no`) 자체는 지시 1번 문구 그대로
chart_no만 다루고, 표시용 이름은 같은 확인 행위에서 함께 확정되어 같은
레코드에 저장된다(둘 다 그 확인 시점 하나에서만 나올 수 있는 값이라
분리할 이유가 없다). 향후 실제 Sigma 조회 API가 승인되면 이 저장소의
스키마를 바꾸지 않고 확인 엔드포인트 앞단에 실제 조회를 끼워 넣을 수
있다.

**`server/patientIdentityStore.js`(신규)**: `crmStore.js`와 같은
file-per-entity + durable-pointer 관례(자체 `atomicWrite`/`readJson`/
`withLock`, 공유 유틸 없음). `links/<patient_uuid>.json`(레코드)과
`by-chart/<sha256(chart_no)>.json`(역방향 uniqueness 포인터) 두 디렉토리.
`linkPatientIdentity()`는 `identity:uuid:{uuid}` 락을 바깥, `identity:
chart:{hash}` 락을 안쪽으로 고정된 순서로 잡는다(이 store에서 두 락을
동시에 쓰는 유일한 지점이라 교착 위험 없음). 이미 링크된 uuid에 다시
링크 시도 -> `IdentityConflictError('already_linked')`, 이미 다른
uuid가 쓰는 chart_no에 링크 시도 -> `IdentityConflictError
('chart_already_linked')` — 둘 다 조용한 덮어쓰기가 아니라 예외. 크래시
안전성: chart 포인터를 먼저 쓰고 uuid 레코드를 나중에 쓴다(round 8의
dedup intent-first와 같은 이유) — 중간에 죽으면 chart_no는 예약된
채로 남지만 `getIdentityByPatientUuid`는 여전히 null을 반환해 fail
closed(Today Queue는 UUID fallback을 계속 보여줌), 재시도하면 같은
예약을 이어받아 정상적으로 완료된다(failure-injection 테스트로 증명).

**`server/index.js`**: `POST /api/crm/patient-identity`(명시적 확인
액션, doctor 인증, `store.visitExistsForPatient()`로 미지의 patient_uuid
거부 — round 6 Episode 생성과 동일한 규칙 재사용, `sigma_chart_no`/
`patient_name` 필수, 충돌 시 409 + reason)와 `GET
/api/crm/patient-identities`(patient_uuid 여러 개를 배치로 조회, 각
uuid에 대해 `{resolved:true, sigma_chart_no, patient_name}` 또는
`{resolved:false, reason:'no_mapping'}`을 **항상 명시적으로** 반환 —
키 자체를 생략하지 않아 클라이언트가 "매핑 없음"과 "응답에 없음"을
구분할 수 있다) 2개 라우트 추가. `confirmed_by`는 claimedBy와 같은
성격의 advisory 감사 라벨일 뿐 권한 판단에 쓰이지 않는다(이 배포는
직원별 계정이 아니라 공유 doctor token 하나뿐이라 서버가 그 이상의
신원을 스스로 유도할 수 없다).

**`src/lib/serverClient.ts`**: `listPatientIdentities(patientUuids)`
(배치 GET, wire shape이 이미 클라이언트 shape과 같아 매핑 불필요)와
`linkPatientIdentity({patientUuid, chartNo, patientName, confirmedBy?})`
(POST) 추가. `ResolvedPatientIdentity` 유니온 타입 export.

**`src/doctor/TodayQueueSection.tsx`**: 새 optional prop `identities:
Record<string, ResolvedPatientIdentity>`(기본값 `{}`). resolved된
patient_uuid는 `환자명 · 차트번호`를 보여주고, 없거나 `resolved:false`인
경우 round 13의 truncate-UUID fallback을 그대로 유지 — `title` 속성의
전체 UUID는 resolved 여부와 무관하게 항상 유지(비주요 진단 정보).
컴포넌트 자체는 여전히 fetch/클릭 핸들러가 전혀 없다 — enrichment
데이터는 순수하게 props로만 들어온다.

**`src/doctor/DoctorView.tsx`**: 새 state `patientIdentities`(기본값
`{}`). 기존 CRM task polling(5초 간격) 안에서, `crmTasks` fetch가
성공하면 그 응답의 patient_uuid 집합으로 `listPatientIdentities()`를
호출해 **전체 교체**(merge 아님)로 `patientIdentities`를 갱신한다 —
이전 poll에 있었지만 이번 poll에는 없는 uuid의 오래된 resolved 이름이
남아있을 수 없다. `crmTasks` fetch 자체가 실패하면 `patientIdentities`도
함께 `{}`로 비운다(round 13이 `crmTasks`에 적용한 것과 같은 엄격한
staleness 규칙). identity fetch 자체가 실패해도 `{}`로 비워 안전한
UUID fallback으로 떨어진다.

**의도적으로 하지 않은 것**: 연결(link) 생성 UI. 지시 5번은 "서버
경계에서 명시적 확인 행위"를 요구했고, 이는 POST 엔드포인트 자체가
doctor 인증 + 명시적 chart_no/patient_name 파라미터를 요구하는 것으로
이미 충족된다 — DoctorView에 확인 버튼/폼을 추가하라는 지시는 없었고,
round 13이 세운 "이번 라운드는 읽기 전용, task-action UI는 다음
라운드로" 원칙과 같은 이유로 이번 라운드에서는 만들지 않았다. 지금은
API를 직접 호출해야만 링크가 생기며, 실제 클리닉 운영에 필요한
링크-생성 UI는 다음 라운드의 몫으로 남긴다 — 그 전까지 Today Queue는
round 13과 동일하게 truncate-UUID를 계속 보여준다.

**`tests/crm-store.spec.mjs`**: 신규 Part 13(store-level uniqueness/
재시작 14 assertion + failure-injection 6 assertion + 실제 HTTP 경계 21
assertion, 총 41 assertion) — 1:1 양방향 uniqueness(같은 uuid 재링크 거부, 같은 chart_no
두번째 uuid 거부), 재시작 후 매핑 생존, 크래시 윈도우 fail-closed +
재시도 후 정확히 하나의 chart 포인터만 존재, RRN/phone 필드가 요청
body에 있어도 저장 파일 자체에 전혀 남지 않음(디스크 직접 확인),
evil-Origin 미인증 요청 403, 미지의 patient_uuid 400, 필수 필드 누락
400, 이미 링크된 patient_uuid 재링크 409, 다른 patient의 chart_no
가로채기 409, 배치 GET이 unresolved uuid를 명시적으로(생략하지 않고)
반환, cross-patient Task/Episode isolation(신원 링크가 다른 환자의
Task patient_uuid/status/first_seen_at을 절대 건드리지 않음, 링크
순서와 무관하게 서로의 신원이 서로에게 영향받지 않음)을 증명.

**`tests/server.spec.mjs`**: `requireDoctor` 라우트 그룹 카운트를
34 -> 36으로 갱신(새 라우트 2개, `crm x8` -> `crm x10`).

**`tests/today-queue.spec.mjs`**: 신규 5 assertion 추가(총 12 -> 17) —
resolved 신원이 `환자명 · 차트번호`로 표시, unresolved/누락 시 truncate-
UUID로 fallback(조작된 이름을 절대 만들어내지 않음), 다른 환자의
identities 항목이 이 task의 행에 새어나오지 않음(no cross-patient
identity), 두 환자의 신원이 서로 뒤바뀌지 않음. 기존 "no serverClient
reference" 소스 가드는 round 14가 추가한 type-only import를 반영해
"serverClient로의 참조는 전부 `import type`뿐이고 실제 함수 호출은
없음"으로 정교화했다.

**검증 (이번 세션이 직접 실행):** `npx tsc -b --force`(0 에러), `npm run
build`/`npm run build:preview`(둘 다 성공), `npm run test:all`(전체
green — 3160개 PASS/OK 라인, FAIL 0건, 신규 CRM identity 41 assertion +
Today Queue 5 assertion 포함), `cd "tablet core" && python3 -m pytest
tests/ -q`(80 passed), `git diff origin/main -- 'src/spec/*Logic.ts'
'src/spec/*Adapter.ts'`(empty, FROZEN zero-diff). Test 0 여전히 PENDING,
Care Gap suppression 여전히 비활성, 임상 threshold/매핑/red-flag
재해석/재활 매핑/Additional Pain 승격/provider 선택/Sigma-Naver 쓰기
없음. RRN은 스키마에 필드 자체가 없고, 전화번호는 이 라운드 어디에도
등장하지 않는다(입력 필드/저장 필드 모두 없음).

**Subagent 사용 안 함** — 이 라운드는 단일 세션에서 수행. 기존
crmStore.js/server/index.js/serverClient.ts/TodayQueueSection.tsx의
관례를 파악하기 위해 직접 Read/Grep으로 조사했다(round 13에서 이미
같은 구조를 직접 확인해둔 상태였다).

### Round 14 재검토 수정 (같은 세션 내에서 이어서 수행)

Gomars93의 재검토: 위 구현이 정상 경로에서는 맞게 동작하지만, 진짜
crash/재시작 무결성 결함이 하나 남아있다고 지적했다. **DO NOT MERGE.**

**결함**: `linkPatientIdentity()`가 `by-chart/<hash>.json` 예약을
`links/<uuid>.json` 레코드보다 먼저 쓴다. 기존 failure-injection
테스트는 재시도가 **같은** chart_no를 쓸 때만 복구를 증명했다. 실제
결함 경로: (1) `patient_uuid=A`를 `chart_no=X`에 링크 시도, (2) X의
역방향 포인터가 durable하게 쓰인 직후, `links/A.json`을 쓰기 전에
프로세스/파일시스템 장애 발생, (3) 재시작 후 운영자가 chart를
정정해서 A를 `chart_no=Y`로 재시도, (4) `links/A.json`이 여전히 없으므로
기존 코드는 Y를 예약하고 A→Y를 완료시키면서, orphan이 된 X→A 역방향
포인터는 디스크에 그대로 남는다. 이는 라운드가 명시한 "양방향 1:1"
불변식을 위반하고, A의 authoritative 링크가 이제 Y를 가리킴에도 X를
영구히 다른 환자가 못 쓰게 막을 수 있다.

**수정**: 세 번째 디렉토리 `pending/<patient_uuid>.json`을 추가해
"이 uuid가 마지막으로 시도한 chart_no"를 O(1)로 추적한다(by-chart/
전체를 스캔하지 않고). 쓰기 순서를 (1) `pending/<uuid>.json`(durable
intent, crmStore.js의 dedup intent-first와 같은 논리) → (2) by-chart
역방향 포인터 → (3) `links/<uuid>.json`(최종 authoritative 레코드) →
(4) pending 파일 best-effort 삭제로 재정렬했다. 같은 chart_no로
재시도하면 기존과 동일하게 self-heal한다. **다른** chart_no로 재시도하면,
`pending/<uuid>.json`이 이전 chart_no와의 불일치를 즉시 드러내고,
**그 chart_no 자신의 lock 아래에서**(항상 순차적으로, 두 chart lock을
동시에 잡는 경우는 이 store 어디에도 없음 — 교착 위험 없음) orphan
포인터를 회수(삭제)한 뒤에야 새 chart_no를 예약한다. 이미 확인했듯
`links/<uuid>.json`이 없다는 것 자체가 "이 예약은 완료된 적이 없다"는
뜻이라 안전하게 회수할 수 있고, 회수 로직은 방어적으로 포인터가 여전히
**같은** uuid를 가리킬 때만 삭제한다(다른 uuid가 소유한 포인터는 절대
건드리지 않음). 이렇게 **거부가 아니라 회수**를 택한 이유는 재검토가
요구한 "적절한 시점에 다른 환자가 해제된 chart X를 쓸 수 있어야 한다"는
조건을 만족시키기 위함이다 — 단순 거부만으로는 X가 영원히 A에게
묶인 채로 남는다.

**`tests/crm-store.spec.mjs`**: 기존 identity-crash 테스트에 pending
파일 정리 확인 assertion 1개 추가, 그리고 신규 2개 테스트 블록(총 14
assertion) — (1) "crash after X pointer → restart → retry same UUID
with Y" 정확히 재검토가 요구한 시나리오: stale 포인터가 회수되고,
authoritative 링크가 Y를 가리키며, chart-index에 정확히 하나의 포인터만
남고, **다른 환자가 실제로 해제된 X를 성공적으로 클레임**할 수 있음을
증명(10 assertion), (2) 방어 심층화 테스트 — A가 X를 회수하고 Y로
정정한 뒤 B가 정당하게 X를 클레임해도 A(Y)/B(X) 양쪽 레코드가 서로
간섭받지 않음을 증명(3 assertion). CRM store 스위트 총 assertion:
140 → 154.

**검증 (이번 세션이 직접 실행, 재검토 수정 반영):** `npx tsc -b
--force`(0 에러), `npm run build`/`npm run build:preview`(둘 다 성공),
`npm run test:all`(전체 green — 3174개 PASS/OK 라인, FAIL 0건, CRM
store 스위트 154 assertion 포함), `cd "tablet core" && python3 -m
pytest tests/ -q`(80 passed), `git diff origin/main -- 'src/spec/*
Logic.ts' 'src/spec/*Adapter.ts'`(empty, FROZEN zero-diff). 동시성
uniqueness, 일반 409 충돌, cross-patient Task/Episode isolation, 재시작
durability는 모두 기존 테스트 그대로 재확인됐다(회귀 없음). 링크 생성
UI는 지시대로 여전히 만들지 않았다 — 이번 수정은 무결성 결함
하나만 좁게 고쳤다.

**Subagent 사용 안 함** — 이 재검토 수정도 같은 세션에서 직접 수행.

## Completed — CRM v0.3.1 Round 15 (Identity Production Batch: 레거시 정합화 + 링크 UI + E2E + 독립 검수, 이번 세션)

Round 14 재검토 위에 이어서, Gomars93가 PR #24 댓글로 Part A/B/C/D를 한
묶음으로 지시했다(위 Objective 참고). **DO NOT MERGE.**

**Part A — 레거시 정합화 (`server/patientIdentityStore.js`)**:
`findLegacyOrphanedReservations(patientUuid, excludeChartNo)`를 추가 —
`by-chart/`를 잠금 없이 스캔해 이 uuid가 소유한, `excludeChartNo`가
아닌 포인터를 찾는다. `linkPatientIdentity`에서 pending marker가 없을
때(또는, 재검토 수정 이후: pending 경로로 회수되지 않은 모든 경우)
호출되며, 매치 0개면 정상 진행, 정확히 1개면 자신의 chart lock 아래서
소유권을 재확인한 뒤 회수, 2개 이상이면 `legacy_reservation_ambiguous`로
fail closed(아무 것도 건드리지 않음) — 마이그레이션 프레임워크가 아니라
최소 lazy scan.

**Part B — 링크 UI (`src/doctor/PatientIdentityLinkAction.tsx`,
`TodayQueueSection.tsx`, `DoctorView.tsx`)**: 미해결 Today Queue 행마다
"시그마 연결" 버튼 → 차트번호/환자명 입력 폼 → (재검토 수정 이후)
검토 단계("이 내용으로 연결"/"뒤로"/"취소") → 실제 POST. 성공 시
`onLinked` 콜백으로 즉시 로컬 상태 갱신(다음 poll을 기다리지 않음).
취소는 네트워크 호출 없이 폐기. 지시대로 unlink/relink/change-mapping
UI, 전화/RRN 필드, 새 identity inference는 추가하지 않았다.

**Part C — 실제 브라우저 E2E** (`tests/patient-identity-link-e2e.spec.mjs`,
신규): DevTools Protocol 기반(Playwright 미사용, 기존
`tests/tablet-viewport.spec.mjs` 컨벤션 재사용) 실제 Chrome + 실제
`server/index.js` 인스턴스 + 실제 production build로 confirm 플로우를
데스크톱 1440×900/태블릿 가로 1024×768/태블릿 세로 834×1112에서 검증.
`npm run test:identity-link-e2e`로 실행, `test:all`에 편입.

**Part D — 독립 검수 루프**: Agent 도구로 `model: "opus"`를 지정해 실제
Opus subagent를 호출(시뮬레이션이 아님 — 약 472초, 40회 tool call,
~160K 토큰 사용, `npm run test:crm-store`를 스스로 실행해 audit 버그를
런타임으로 직접 확인함). 총 11개 지적사항을 file:line 단위로 보고받음
(요약: audit 이벤트 미등록으로 조용히 드롭, 되돌릴 수 없는 링크에
사전 확인 단계 부재, chart_no 대소문자 정규화 누락, optimistic
업데이트와 in-flight poll의 race, 409 conflict body가 기존 링크
정보를 안 줌, legacy scan이 pending marker 존재만으로 스킵됨,
purge 스크립트가 crm-identity/를 안 지움, batch GET의 uuid 형식
미검증, 모듈 헤더 코멘트 stale화, E2E "즉시 반영" assertion의
타임아웃이 POLL_MS보다 느슨함, E2E가 NodeList index로 행을 선택 +
에러 텍스트를 정확히 검증 안 함).

**Sonnet 수정(11개 전부)**: `server/audit.js`에 `patient_identity_linked`
등록 + 회귀 테스트; `PatientIdentityLinkAction.tsx`에
idle→editing→reviewing→submitting 2단계 확인 상태 추가(포기 가능한
"뒤로"/"취소" 분리); `server/index.js`의 chartNo를
`.trim().toUpperCase()`로 정규화; `DoctorView.tsx`에
`patientIdentitiesSeqRef`(useRef 카운터)로 optimistic 업데이트가 느린
poll 응답에 덮어써지는 것 방지; `patientIdentityStore.js`의
`already_linked` throw에 `err.existingLink` 첨부 →
`server/index.js` 409 body에 `existing_sigma_chart_no`/
`existing_patient_name` 추가 → `serverClient.ts`의 `ServerResult`에
`errorBody` 필드 추가 → `labels.ts`의 "다른" 오표현 제거;
`linkPatientIdentity`를 재구조화해 legacy scan이 O(1) pending 경로로
회수되지 않은 모든 경우 실행되도록(단일 링크 호출 안에서 레거시
orphan과 pending orphan을 동시에 회수하는 `identity-legacy-plus-pending`
테스트로 증명); `scripts/purge-data.mjs`에 `crm-identity/` 삭제 추가 +
실제 스크립트를 `execFileSync`로 구동하는 회귀 테스트; batch GET
라우트에 `/^[0-9a-f-]{36}$/i` 형식 검증 추가(비정상 값은 조용히
드롭, 유효한 값은 영향 없음 — 회귀 테스트 포함); `TodayQueueSection.tsx`
행에 `data-patient-uuid` 추가 + E2E를 전면 이 속성 기반 선택으로
재작성 + 타임아웃을 2000ms로(POLL_MS=5000ms보다 충분히 타이트) +
중복-차트 에러 텍스트를 정확히 assert.

**테스트**: `tests/crm-store.spec.mjs`에 신규 assertion 다수(대소문자
충돌, 409 body 보강, `identity-legacy-plus-pending`, batch GET 형식
검증, purge-data 스크립트 실제 구동) — CRM store 스위트 총 assertion
154 → **181**. `tests/today-queue.spec.mjs`에 `data-patient-uuid`
검증 2건 추가 — 20 → **22**. `tests/patient-identity-link-e2e.spec.mjs`
전면 재작성(검토 단계 흐름 + data-patient-uuid 선택 + 정확한 에러
텍스트) — **22**개 실제 브라우저 assertion, 전부 통과.

**검증(이번 세션이 직접 실행)**: `npx tsc -b --force`(0 에러), `npm
run build`/`npm run build:preview`(둘 다 성공), `npm run test:all`
전체 green(재실행 확인 — 첫 실행에서 `tests/tablet-viewport.spec.mjs`의
Chrome 프로필 디렉터리 정리 중 `ENOTEMPTY`로 크래시했으나, 단독
재실행 시 즉시 24개 assertion 전부 통과해 일시적 인프라 flake로
확인됨; 이후 전체 재실행에서 처음부터 끝까지 green, exit code 0),
`cd "tablet core" && python3 -m pytest tests/ -q`(80 passed), `git
diff origin/main -- 'src/spec/*Logic.ts' 'src/spec/*Adapter.ts'`(empty,
FROZEN zero-diff). Test 0는 여전히 PENDING, Care Gap suppression은
여전히 OFF — 이번 배치가 건드리지 않음.

**두 번째(재검수) Opus subagent 호출** (commit `e491fb5` 대상, 실제로
`model: "opus"` 지정해 호출 — 약 407초, 29 tool call, ~128K 토큰,
`npm run test:crm-store`/`test:today-queue`/`test:identity-link-e2e`를
스스로 실행해 확인): 11개 중 8개는 완전히 해결로 판정, 2개는
불완전(#3 chart_no 대소문자: 기존 데이터 마이그레이션 없음 — 단
이 store 자체가 origin/main에 존재한 적이 없어 실제로는 마이그레이션할
데이터가 없음; #10 E2E 2000ms 타임아웃: POLL_MS=5000ms 대비 확률적
감지기일 뿐), 1개는 미해결(#9 모듈 헤더/JSDoc 코멘트 3곳이 여전히
예전 "pending marker 없을 때만" 게이팅을 설명 — 실제 코드는 재구조화
이후 무조건 실행). 그리고 새 이슈 8개: 되돌릴 수 없는 확인 단계가
서버가 실제로 저장하는(대소문자 정규화된) 값이 아니라 사용자가 입력한
원본 값을 보여줌(NEW-3, 실질적), `.catch()` 없는 promise 체인 —
예외 시 mode가 'submitting'에 영구히 고착되고 모든 버튼이 비활성화됨
(NEW-4), 뒤로/취소 버튼이 클래스를 공유해 E2E가 DOM 순서에 암묵적으로
의존(NEW-5), E2E의 always-true `check(name, true)` 2곳 — 실패해도
읽기 어려운 원시 스택트레이스로만 나타남(NEW-6), 컴포넌트 헤더
코멘트가 "patient_uuid로 keyed"라고 틀리게 적음(실제로는 task_id)
(NEW-7), 그리고 이 배치 범위 밖의 사전 존재 결함 2개 — audit.js에
`patient_identity_linked` 외 23개 이벤트명이 여전히 미등록으로 조용히
드롭됨(NEW-1), purge-data.mjs가 crm-identity/는 고쳤지만 `.data/visits/`
와 `.data/crm/`은 여전히 안 지움(NEW-2) — 및 이미 push된 커밋 메시지의
사소한 부정확 서술 1건(NEW-8, 코드 아님, 수정 안 함).

**Sonnet 2차 수정** (commit `602525e`): #9 스테일 코멘트 3곳 전면
재작성(무조건 실행되는 현재 동작 정확히 반영, "two sections" →
"three"로 수정) + #3에 "이 store는 origin/main에 존재한 적이 없어
마이그레이션 불필요, merge 전 바뀌면 추가할 것" 코멘트 추가(기능
마이그레이션은 만들지 않음 — 실제로 필요 없음) + #10 타임아웃을
900ms로(관측된 실제 latency <200ms) + NEW-6에 맞춰 두 개의 always-true
assertion을 try/catch로 감싸 진짜 named FAIL이 나오게 수정 + NEW-3에
맞춰 `PatientIdentityLinkAction.tsx`가 확인 단계 진입 시
`.trim().toUpperCase()`를 적용해(서버와 완전히 동일 정규화) 검토
화면이 실제로 저장될 값과 항상 일치하게 수정 + NEW-4에 맞춰 `.catch()`
추가(예외 시 mode를 'editing'으로 복귀 + 에러 표시) + NEW-5에 맞춰
뒤로/취소에 `data-action="back"`/`"discard"` 부여하고 E2E가 이를
사용하도록 수정 + NEW-7 코멘트 정정. NEW-1/NEW-2는 이 배치의 승인된
범위(신원 연결) 밖의 기존 결함이라 의도적으로 손대지 않고 완료
보고서에 후속 과제로 명시.

**세 번째(마감) Opus subagent 호출** (commit `602525e` 대상, 실제로
`model: "opus"` 지정해 호출 — 약 439초, 41 tool call, ~117K 토큰,
`git log origin/main -- server/patientIdentityStore.js`로 "이 store는
origin/main에 존재한 적 없음" 주장을 직접 검증하고, 계측된 스크래치
스크립트로 실제 optimistic-update latency를 직접 측정): #3/#9/NEW-3/
NEW-4/NEW-5/NEW-6/NEW-7 전부 완전히 해결로 판정. **#10 하나만 진짜
미해결로 판정** — 타임아웃 값(900ms)이 문제가 아니라, 검사 대상
셀렉터(`​.doctor__todayQueue__grid`의 textContent)가 잘못됐다는 정확한
지적: 검토 확인 화면 자체의 확인 문구("홍길동E2E / CN-E2E-REAL 로
연결하시겠습니까?")가 같은 grid 안에 렌더링되기 때문에, 확인 버튼을
누르기도 전에 이미 조건이 참이 되어버려 이 assertion이 사실상
무의미했다(직접 계측: 클릭 전부터 이미 참, 실제 optimistic-update
latency는 별도 계측으로 ~200ms 이내로 확인 — 즉 제품 코드 자체는
정확했고 테스트만 눈이 멀어 있었음). NEW-1/NEW-2의 "범위 밖" 처리에는
동의하되, NEW-2("파일럿 종료 후 완전 삭제"를 약속하는 스크립트가
`.data/visits/`·`.data/crm/`의 임상 메모/사유 코드를 남긴다)는 "머지
차단"이 아니라 "파일럿 종료 차단" 항목으로 명확히 추적돼야 한다고
지적. 새로 도입된 이슈는 없음.

**Sonnet 3차 수정** (같은 세션에서 이어서, 별도 커밋 예정): #10을 진짜로
고쳤다 — `.doctor__todayQueue__grid` 전체가 아니라 해당 행의
`.doctorField__value--muted`(resolved 라벨) + `.doctor__todayQueue__linkForm`이
사라졌는지를 함께 확인하도록 조건을 재작성. `npm run
test:identity-link-e2e` 재실행으로 22개 assertion 전부 그대로 통과
확인. 이로써 3라운드 Opus 독립 검수 루프에서 "실질적 이슈가 남지
않음"에 도달 — 남은 항목(NEW-1: 감사로그 이벤트 23개 추가 등록 필요,
NEW-2: purge-data.mjs가 `.data/visits/`·`.data/crm/`도 지우도록
확장 필요 — 파일럿 종료 전 필수)은 이 배치의 승인 범위 밖이므로
명시적으로 손대지 않고 다음 라운드 과제로 이 문서와 PR 보고서에
남긴다.

**최종 검증(3차 수정 반영, 이번 세션이 직접 실행)**: `npx tsc -b
--force`(0 에러), `npm run test:all` 전체 green(exit code 0, FAIL
0건 — 도중 실제 GitHub Actions CI에서 `tests/tablet-viewport.spec.mjs`의
동일한 Chrome 프로필 정리 `ENOTEMPTY` flake가 한 번 재현됐으나, 실패한
job을 1회 재실행해 즉시 green으로 확인됨), `cd "tablet core" &&
python3 -m pytest tests/ -q`(80 passed), `git diff origin/main --
'src/spec/*Logic.ts' 'src/spec/*Adapter.ts'`(empty, FROZEN zero-diff).
Test 0는 여전히 PENDING, Care Gap suppression은 여전히 OFF.

## Completed — CRM v0.3.1 Round 13 (Doctor 클라이언트 첫 CRM UI — 읽기 전용 Today Queue, 이전 세션)
**`src/lib/serverClient.ts`**: `listCrmTasks(params?: { ownerClinician?,
coverageQueue? })` 추가. `GET /api/crm/tasks`의 wire shape이 이미
`CrmTask[]`와 정확히 같아서(round 11에서 확정) `listRevisitQueue`류의
snake_case→camelCase 매핑이 필요 없다 — `listStations`처럼 단순
pass-through. 기존 `request<T>()`/`ServerResult`/doctor-token
패턴을 그대로 재사용, 새 인증/타임아웃 로직 없음.

**`src/crm/labels.ts`(신규)**: `CRM_TASK_TYPE_LABEL`/
`CRM_REASON_CODE_LABEL`/`CRM_TASK_STATUS_LABEL` 3개 한글 라벨 맵.
`src/doctor/workspace/followUpSession.ts`의 라벨-맵 관례를 그대로
따름 — 임상적 의미 없는 순수 표시 문자열.

**`src/doctor/TodayQueueSection.tsx`(신규)**: 순수 presentational
컴포넌트(`{ tasks, loading, error }` props만, fetch/클릭 핸들러/
`/seen` 호출 전혀 없음). `tasks === null`(유효한 fetch 없음, 초기
상태 또는 명시적으로 비운 실패한 refetch)과 `tasks === []`(성공적으로
비어있음)를 구분해 error/loading/empty/list 4가지 상태를 렌더링.
`tasks.map()`으로 주어진 순서 그대로 렌더링 — 컴포넌트 안에 `.sort()`
호출 없음. 각 행은 task_type·reason_code 라벨, status/claimed_by/
owner_clinician, `due_at` 기반 기한 상태(overdue 구분), truncate된
`patient_uuid`(전체 값은 `title` 속성)를 표시. SAFETY_REVIEW/
CLINICAL_REVIEW는 각각 별도 CSS class(`--safety_review`/
`--clinical_review`)로 시각 구분.

**`src/doctor/doctor.css`**: `.doctor__todayQueue__row`(테두리/패딩,
기존 `.doctor__row`와 달리 `cursor:pointer` 없음 — 이번 라운드는
클릭 불가), `--safety_review`(danger 테두리+배경), `--clinical_review`
(강조 좌측 테두리), `.doctor__todayQueue__error`(danger 색) 추가. 기존
`.doctor__grid`(`auto-fill, minmax(280px, 1fr)`)를 그대로 재사용 —
태블릿 뷰포트 대응을 위한 새 breakpoint/media query 없음(스타일시트
전체에서 유일한 반응형 장치가 이 grid 관례라 그대로 따름).

**`src/doctor/DoctorView.tsx`**: `crmTasks`/`crmTasksLoading`/
`crmTasksError` state 3개 추가. 기존 재진(revisit)/스테이션 polling
`useEffect`(5초 간격, `cancelled` 플래그로 stale-response 가드)에
`listCrmTasks()` 호출을 같은 cadence로 추가 — 새 폴링 인프라 없음.
**의도적으로 기존 재진 폴링보다 엄격한 규칙**: 실패한 fetch는
`crmTasks`를 `null`로 명시적으로 비우고 `crmTasksError`를 설정한다(기존
재진 폴링은 실패 시 이전 데이터를 그대로 둠) — round 13의 "stale
task가 현재 데이터인 것처럼 보이면 안 된다" 요구를 만족시키기 위한
의도적 차이. `TodayQueueSection`을 재진 목록 섹션 바로 아래, 동일한
가시성 조건(`mode==='server' && !selectedRecord && !selectedRevisit &&
!serverError`)으로 렌더링하되, 재진 목록과 달리 `tasks.length > 0`
게이트를 걸지 않아 컴팩트 empty state가 항상 안정적으로 보인다.

**`tests/today-queue.spec.mjs`(신규, `renderToString()` 기반, 12
assertion)** + `package.json`의 `test:today-queue` 스크립트(esbuild로
`TodayQueueSection.tsx`를 CJS 번들 후 실행) + `test:all`에 편입.
커버리지: loading/empty/error 상태의 진실성(에러 시 이전 tasks가
전달돼도 절대 렌더링되지 않음), 의도적으로 "잘못된" 우선순위 순서(
ROUTINE→SAFETY→CLINICAL)를 그대로 렌더링해 재정렬이 없음을 증명,
SAFETY_REVIEW/CLINICAL_REVIEW의 시각적 구분, patient_uuid truncate +
title 속성, 렌더링 결과에 `onclick` 속성 없음, 컴포넌트 소스에
fetch/serverClient/markTaskSeen/onClick 참조 없음(구조적으로 `/seen`을
트리거할 수 없음을 소스 레벨에서 증명), `.doctor__grid` 재사용(새
고정폭 레이아웃 없음).

**검증 (이번 세션이 직접 실행):** `npx tsc -b --force`(0 에러), `npm
run build`/`npm run build:preview`(둘 다 성공), `npm run test:all`(전체
green, exit 0 — 신규 `test:today-queue` 12 assertion 포함), `cd "tablet
core" && python3 -m pytest tests/ -q`(80 passed), `git diff origin/main
-- 'src/spec/*Logic.ts' 'src/spec/*Adapter.ts'`(empty, FROZEN
zero-diff). Test 0 여전히 PENDING, Care Gap suppression 여전히 비활성,
새 임상 로직/threshold/identity-policy/provider 선택/Sigma-Naver 쓰기
없음. Task action UI(resolve/claim/snooze 등)는 지시대로 다음
라운드로 미뤘다.

**Subagent 사용**: `DoctorView.tsx`/`serverClient.ts`/`doctor.css`의
기존 구조와 관례(재진 큐 polling 패턴, 라벨 맵 컨벤션, 렌더링 테스트
번들링 방식 등)를 파악하기 위해 Explore 타입 subagent 1개를 사용했다
— 조사/탐색 전용이었고 코드 작성은 이 subagent가 하지 않았다. 이후
모든 파일의 실제 내용은 이 세션이 직접 Read로 재확인했고, 코드/CSS/
테스트/문서 작성과 전체 검증 실행은 전부 이 세션이 직접 수행했다.

## Completed — CRM v0.3.1 Round 12 (SNOOZED가 Today Queue에서 실제로 defer됨, 이전 세션)
**`server/crmStore.js`의 `listActionableTasks()` 필터 한 줄 추가**:
terminal 제외 다음에 `if (task.status === 'SNOOZED' && task.due_at &&
task.due_at > now) continue`를 추가했다. 이미 저장된 절대 `due_at`
문자열을 `sortCrmTaskQueue()`가 overdue 판정에 쓰는 것과 동일한 문자열
비교로 `now`와 비교만 할 뿐, duration/SLA/grace period/timezone 규칙은
전혀 발명하지 않았다. `due_at === now`(정확히 그 시점)는 `>` 조건이
거짓이므로 포함됨 — "at/after" 경계가 inclusive. `SAFETY_REVIEW`는
순수 엔진의 `snoozeTask()`가 애초에 SNOOZED 진입을 거부하므로 이 분기에
도달할 수 없다 — Safety 약화 없음. task의 `status` 필드 자체를
되돌리지는 않는다(여전히 디스크에는 `SNOOZED`로 남음) — "가장 작은
구현" 요구대로 스케줄러/새 status 없이 read-time 필터링만으로 처리했고,
그 task가 due 시점 이후 큐에 다시 노출된다는 게 이번 라운드의 계약이다.

**`tests/crm-store.spec.mjs`**: 신규 Part 12(store-level 결정론적 경계
테스트 15 assertion + 실제 HTTP 경계 4 assertion)를 추가. 총 **99
assertion**(82 → 99). Store-level 블록은 `listActionableTasks(now,
...)`을 세 시점(`T0`, `snoozeUntil`, `snoozeUntil+60분`)에서 직접 호출해
경계를 정확히 검증: `due_at` 이전에는 빠짐, 정확히 그 시점과 이후에는
포함됨, SAFETY_REVIEW는 애초에 snooze 자체가 거부됨, listing이
`first_seen_at`을 건드리지 않고 status를 조용히 바꾸지 않음(디스크에서
직접 재확인). HTTP 블록은 실제 `POST .../snooze` → `GET
/api/crm/tasks` 흐름으로 동일 계약을 증명: 아주 먼 미래로 snooze한
task는 빠지고, 이미 지난 시각(`Date.now() - 1000`)으로 snooze한
task는 (실제 HTTP round trip이 걸리는 시간만으로) 다시 나타나며, 그
task의 `first_seen_at`은 여전히 null, 숨겨진 task는 디스크에서
`SNOOZED` 그대로임을 확인한다.

**검증 (이번 세션이 직접 실행):** `npx tsc -b --force`(0 에러), `npm run
build`/`npm run build:preview`(둘 다 성공), `npm run test:all`(전체
green, exit 0 — CRM 스토어 스위트 99 assertion 포함), `cd "tablet core"
&& python3 -m pytest tests/ -q`(80 passed), `git diff origin/main --
'src/spec/*Logic.ts' 'src/spec/*Adapter.ts'`(empty, FROZEN
zero-diff). `npm run test:crm-store`를 3회 연속 재실행해 타이밍
안정성을 재확인. CRM UI는 지시대로 이번 라운드에도 시작하지 않았다.
Test 0 여전히 PENDING, Care Gap suppression 여전히 비활성, 새 임상
로직/threshold/identity-policy/provider 선택 없음.

**Subagent 사용 안 함** — 이 라운드는 단일 세션에서 수행.

## Completed — CRM v0.3.1 Round 11 (Today Queue read path — GET /api/crm/tasks, 이전 세션)
**`server/crmStore.js`의 신규 `listActionableTasks(now, { ownerClinician,
coverageQueue })`**: `listTaskIds()`로 모든 task id를 나열하고 각각
`getTask(id, now)`로 읽는다 — 기존 claim-lease self-heal 경로를 그대로
타므로 만료된 CLAIMED task도 listing 전에 OPEN으로 self-heal된다.
`TERMINAL_TASK_STATUSES`에 속하는 task는 결과에서 제외한다.
`ownerClinician`이 주어지면 순수 엔진의 `tasksForOwner()`로 필터링
(내부적으로 `resolveTaskOwner()` semantics 재사용, 하드코딩 없음),
마지막으로 순수 엔진의 `sortCrmTaskQueue(tasks, now)`로 정렬해서
반환한다 — 정렬 로직은 이 함수 어디에도 재구현하지 않았다.
`first_seen_at`은 이 함수 어디에서도 쓰지 않는다(그 값은 여전히
`markTaskSeenStored()`만의 책임).

**`server/index.js`의 신규 `GET /api/crm/tasks`**(parts.length===3,
GET — 기존 `POST /api/crm/tasks`(생성)와 같은 path, 다른 method라서
자연스럽게 분리됨): `requireDoctor()` 가드 재사용, query string의
`owner_clinician`/`coverage_queue`를 선택적으로 읽어 store에
그대로 전달, 응답은 `{ tasks }` — Sigma 조회·전화 resolution·환자
이름/DOB/RRN enrichment·provider 호출 전부 없이 CRM task 메타데이터만
반환한다.

**`tests/crm-store.spec.mjs`**: 신규 Part 11(실제 HTTP
`GET /api/crm/tasks` 경계, 11 assertion)을 추가. 총 **82
assertion**(71 → 82). ROUTINE(미래 due_at)/ROUTINE(overdue due_at)/
CLINICAL_REVIEW/SAFETY_REVIEW/owner 있는 task/owner 없는 task/취소된
task/claim된 task를 만들어서 (1) auth 없이 GET하면 403(이 스위트가
이미 쓰는 evil-Origin 기법), (2) CANCELLED task가 결과에서 빠짐, (3)
SAFETY_REVIEW가 CLINICAL_REVIEW보다 먼저, CLINICAL_REVIEW가
ROUTINE보다 먼저 정렬됨, (4) overdue ROUTINE이 아직 안 된 ROUTINE보다
먼저 정렬됨, (5) claim lease를 **0분**으로 설정한 서버 인스턴스로
claim한 task가 (실제 HTTP round trip이 걸리는 최소한의 실제 시간만으로도)
이미 OPEN으로 self-heal된 채 listing됨을 확인, (6) 응답의 모든 task가
`first_seen_at === null`(단순 listing이 절대 노출로 취급되지 않음), (7)
응답 전체에 phone-shaped 문자열이 없음, (8-9) `owner_clinician` 쿼리
파라미터가 해당 clinician 소유 task는 포함하고 owner 없는 task는
제외함(coverage_queue 미설정 시)을 확인.

**`tests/server.spec.mjs`**: doctor-guarded 라우트 카운트를 33 → 34로
갱신(새 `GET /api/crm/tasks` 컬렉션 라우트 1개 추가).

**검증 (이번 세션이 직접 실행):** `npx tsc -b --force`(0 에러), `npm run
build`/`npm run build:preview`(둘 다 성공), `npm run test:all`(전체
green, exit 0 — CRM 스토어 스위트 82 assertion 포함), `cd "tablet core"
&& python3 -m pytest tests/ -q`(80 passed), `git diff origin/main --
'src/spec/*Logic.ts' 'src/spec/*Adapter.ts'`(empty, FROZEN
zero-diff). `npm run test:crm-store`를 3회 연속 재실행해 0분-lease
self-heal 테스트가 타이밍에 안정적임을 확인. CRM UI는 지시대로 이번
라운드에도 시작하지 않았다. Test 0 여전히 PENDING, Care Gap
suppression 여전히 비활성, 새 임상 로직/threshold/identity-policy/provider
선택 없음.

**Subagent 사용 안 함** — 이 라운드는 단일 세션에서 수행.

## Completed — CRM v0.3.1 Round 10 (Safety resolve authority server-derived화, 이전 세션)
**`server/index.js`의 `/api/crm/tasks/:id/resolve` 핸들러**: `const
actorRole = body?.actorRole === 'STAFF' ? 'STAFF' : 'CLINICIAN'`를
`const actorRole = 'CLINICIAN'`로 고정 — body에서 절대 읽지 않는다.
`/api/crm/*`가 지금 전부 doctor-인증 표면이라 이 라우트가 정직하게
주장할 수 있는 authority는 CLINICIAN뿐이고, 그건 이미 통과한
`requireDoctor()` 자체에서 나온다. audit도 `actor: 'doctor'`로
고정(더 이상 조건부 아님). 순수 엔진(`resolveTask()`의 SAFETY_REVIEW
가드)은 손대지 않았다 — store 경계에서 client 입력을 아예 제거하는
쪽으로 고쳤다. 향후 별도 인증된 staff resolve 경로가 필요하면 이 body
flag가 아니라 새 인증 경계로 만들어야 한다는 걸 코드 주석에 남겼다.

**`tests/crm-store.spec.mjs`**: 신규 Part 10(실제 HTTP `/api/crm/tasks/:id/resolve`
경계, 5 assertion)과 직후 store-level 확인 블록(2 assertion)을 추가.
Part 10은 SAFETY_REVIEW task를 만들고 (a) body에 `actorRole: 'STAFF'`를
보내도 doctor-인증 라우트가 그대로 resolve함(body 필드가 결과에 아무
영향 없음을 증명), (b) `actorRole: 'CLINICIAN'`을 명시해도 동일,
(c) `actorRole`을 아예 생략해도 동일, (d) evil Origin으로
인증되지 않은 시도는 403으로 거부됨(이 스위트와 `tests/server.spec.mjs`가
이미 쓰는 "loopback + evil Origin → 403" defense-in-depth 기법 재사용),
(e) 거부된 시도 이후 해당 task가 여전히 OPEN임을 확인. 직후 블록은
store를 직접 호출해 `resolveTaskStored(id, version, 'STAFF', now)`가
여전히 `safety_review_resolution_requires_clinician`으로 거부됨을
증명 — HTTP 라우트가 더 이상 `actorRole`을 노출하지 않더라도 순수
엔진 자체의 보호는 그대로 살아있다는 걸 별도로 확인한다.

**부수적으로 발견하고 고친 것: `tests/crm-store.spec.mjs`의 기존 phone-shaped-string
검사 2곳이 flaky했다.** round 8/9에서 추가한 "PHI/raw-phone 문자열
없음" 검사가 객체 전체를 `JSON.stringify`해서 정규식으로 검사하고
있었는데, 이 객체들에는 `randomUUID()`로 만든 32자리 hex 문자열(구분자
없이 연속)이 여러 개 들어있어서, 순전히 우연으로 8자리 이상 연속
숫자가 나오면 전화번호 모양 정규식과 우연히 매치될 수 있었다 — 실제로
이번 세션 중 한 번 발생해서 재현/확인했다(재실행하면 통과, 5회 연속
재실행으로 재확인). `containsPhoneShapedString()` 헬퍼를 추가해 검사
전에 UUID 모양 부분 문자열을 제거하도록 고쳐, 검사의 원래 의도(진짜
전화번호가 어딘가에 남아있으면 잡아낸다)는 유지하면서 무작위 UUID에
좌우되는 flakiness를 제거했다.

**검증 (이번 세션이 직접 실행):** `npx tsc -b --force`(0 에러), `npm run
build`/`npm run build:preview`(둘 다 성공), `npm run test:all`(전체
green, exit 0 — CRM 스토어 스위트 71 assertion 포함), `cd "tablet core"
&& python3 -m pytest tests/ -q`(80 passed), `git diff origin/main --
'src/spec/*Logic.ts' 'src/spec/*Adapter.ts'`(empty, FROZEN
zero-diff). `npm run test:crm-store`를 5회 연속 재실행해 flaky 수정이
실제로 안정화됐음을 확인. CRM UI는 지시대로 이번 라운드에도 시작하지
않았다. Test 0 여전히 PENDING, Care Gap suppression 여전히 비활성, 새
임상 로직/threshold/identity-policy/provider 선택 없음.

**Subagent 사용 안 함** — 이 라운드는 단일 세션에서 수행.

## Completed — CRM v0.3.1 Round 9 (legacy dedup 포인터 업그레이드 호환성, 이전 세션)
**`server/crmStore.js`의 `createTaskStored()` 재작성**: 포인터를
"`pointer?.task`가 있는지"가 아니라 `pointerTaskId = pointer?.task?.task_id
?? pointer?.task_id ?? null`로 읽어, 새 포맷(`{task: {...}}`)과 레거시
포맷(`{task_id: "..."}`) 둘 다 균일하게 처리한다. 이후 로직:
- `pointerTaskId`가 있고 그 Task가 디스크에 실제로 존재하면(레거시든
  새 포맷이든 상관없이): 기존과 동일한 terminal/non-terminal 판단.
  non-terminal이면 dedupe해서 반환하되, 그 포인터가 레거시
  포맷(`!pointer.task`)이었다면 이 시점에 `{task: onDisk}`로 lazily
  덮어써 다음부터는 이 경로를 다시 탈 필요가 없게 한다.
- `pointerTaskId`는 있는데 Task가 없고 **포인터가 새 포맷**이면: round
  8의 기존 crash-recovery 경로(포인터의 스냅샷을 그대로 재생) 그대로.
- `pointerTaskId`는 있는데 Task가 없고 **포인터가 레거시 포맷**이면:
  round 8 이전 쓰기 순서(Task 먼저, 포인터 나중)에서는 이 상태가 크래시
  로도 나올 수 없었다는 뜻이므로(외부 손상/삭제가 아니면 불가능),
  재생할 스냅샷도 없다 — "포인터 없음"과 똑같이 새 intent를 발급하는
  경로로 명시적으로 떨어뜨린다(조용한 fallthrough가 아니라 주석으로
  근거를 남긴 명시적 분기).

**`tests/crm-store.spec.mjs`**: 신규 Part 8(레거시 포인터 업그레이드,
9 assertion)과 Part 9(레거시 포인터가 존재하지 않는 Task를 가리키는
손상 케이스, 2 assertion)를 추가. 총 **64 assertion**(53 → 64). Part 8은
review가 요구한 그대로: 실제 store로 Task를 만든 뒤 그 dedup 포인터
파일만 레거시 `{task_id}` 포맷으로 직접 덮어써 "구버전이 남긴 데이터"를
그대로 재현 → 완전히 새로운 `createCrmStore()` 인스턴스(재시작
시뮬레이션)로 같은 source event를 재시도 → (a) non-terminal Task가
정확히 하나만 남음, (b) 원본 task_id가 dedupe되어 반환됨, (c)
patient_uuid가 여전히 Episode-derived, (d) 포인터가 새 포맷으로 lazily
업그레이드됨, (e) 어디에도 phone-shaped 문자열 없음을 확인. 이어서 그
Task를 DONE으로 resolve하고 포인터를 다시 레거시 포맷으로 강제 되돌린
뒤 재시도 — 기존 remint 동작(terminal Task는 재사용하지 않고 정말 새
task_id를 발급)이 레거시 경로에서도 그대로 유지됨을 확인. Part 9는
`computeDedupKey()`로 정확한 hash를 계산해, 존재하지 않는 task_id를
가리키는 레거시 포인터를 직접 심고, `createTaskStored`가 예외 없이
명시적으로 새 task를 발급하며 그 phantom task_id를 소급 생성하지
않음을 확인.

**검증 (이번 세션이 직접 실행):** `npx tsc -b --force`(0 에러), `npm run
build`/`npm run build:preview`(둘 다 성공), `npm run test:all`(전체
green, exit 0 — CRM 스토어 스위트 64 assertion 포함), `cd "tablet core"
&& python3 -m pytest tests/ -q`(80 passed), `git diff origin/main --
'src/spec/*Logic.ts' 'src/spec/*Adapter.ts'`(empty, FROZEN
zero-diff). CRM UI는 지시대로 이번 라운드에도 시작하지 않았다. Test 0
여전히 PENDING, Care Gap suppression 여전히 비활성, 새 임상
로직/threshold/identity-policy/provider 선택 없음.

**Subagent 사용 안 함** — 이 라운드는 단일 세션에서 수행.

## Completed — CRM v0.3.1 Round 8 (durable dedup crash window 제거, 이전 세션)
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

## PR #23 ↔ PR #24 Convergence Batch (Round 17 이후, 신규)

Round 17 종료 직후 승인된 다음 작업: PR #23("Tablet v2.3 UX/Routing
audit", `fix/tablet-v2-3-ux-and-routing-audit`)과 PR #24는 같은
`main@b845a877`에서 각자 독립적으로 분기했고 서로 병합되지 않았다.
지시에 따라 PR #23를 PR #24에 merge/rebase/통째로 cherry-pick하지
않고, **진짜로 빠져 있고 필요한 non-clinical 코드/테스트만 최소
범위로 이식**했다.

**이식한 것 (전부 non-clinical, presentation/UX 계층):**
- `src/types.ts`: `Question.unknownOption?` 필드 추가(opt-in, 미지정
  시 기존과 완전히 동일하게 렌더링).
- `src/components/TextInputField.tsx`/`QuestionScreen.tsx`: numeric/
  short_text 질문에 "잘 모르겠어요" 명시적 skip 버튼 지원.
- `src/spec/coreSpec.ts`: `SECONDARY_OPTIONS`에서 "없음"을 맨 앞으로
  재배치(SAFETY_01 등 안전문항은 전혀 건드리지 않음); 신규
  `LBP_01B_LEG_SCREEN`(다리 증상 유무 사전 확인, "없어요" 선택 시
  LBP_02/LBP_03에 FROZEN `computeLegState`가 요구하는 NONE/NONE 쌍을
  미리 채움)와 `LBP_10A_ONSET_AGE`(발병 시기를 decade 단위로 물어
  기존 LBP_10 YES/NO/UNKNOWN 계약에 매핑, 40대는 의도적으로 UNKNOWN
  fail-close); `shouldAutoAdvancePast()`라는 **navigation-layer
  전용 skip**을 도입해 이 화면들의 auto-fill/자동확인 값을 환자에게
  다시 보여주지 않으면서도 `showIf`/`visibleQuestions`/
  `pruneStaleResponses`는 전혀 건드리지 않음(FROZEN adapter가 읽는
  값의 무결성 유지가 최우선).
- `src/App.tsx`: 위 두 화면의 `setAnswer()` patch 로직 + `nextQuestion`/
  `goBack`의 `shouldAutoAdvancePast` 배선.
- `src/components/ScreenShell.tsx`/`styles.css`: scroll hint를 기존
  overlay pill(`.shell__scrollHint`, 콘텐츠 위에 겹쳐 그리던 방식)에서
  `.shell__scrollHintLane`(`.shell__main`의 flex 형제 엘리먼트, 구조적으로
  절대 겹칠 수 없음)로 교체 + 1회성 attention pulse 애니메이션 + 우측
  rail을 `railTop`/`railBottom`으로 재구성.
- `src/components/PreviewBanner.tsx`: `VITE_PREVIEW_PR`/`VITE_PREVIEW_SHA`
  설정 시 빌드 라벨을 덧붙이는 로직(현재 두 preview workflow 모두 이
  변수를 설정하지 않으므로 inert).

**의도적으로 이식하지 않고 HUMAN DECISION REQUIRED로 보류한 것:**
1. PR #23의 BodyMap PNG artwork 렌더링(front.png/back.png, inline SVG는
   손상 시 fallback) — PR #24는 여전히 기존 inline-SVG-only BodyMap을
   그대로 유지. PNG 채택 여부는 제품 판단.
2. PR #23의 landscape 전용 우측 rail `railSelection` 기능(Body Map
   선택 정보를 rail에 항상 표시) — 위 BodyMap 결정에 종속적이고, PR #24는
   이미 자체적인 `.bodyMap__selectedLabel`/`.bodyMap__selectedChip`
   메커니즘(스크롤 여부와 무관하게 동작)이 있어 우선순위가 낮음.
- `getBodyMapZoneLabel` export, `railSelection` prop 자체를 어디에도
  추가하지 않았다(App.tsx에서 관련 import/계산 코드 전부 제외).

**PR #23에 있었지만 이식하지 않은, 관련 없는 항목:** PR #23의
`tests/integration.spec.mjs` diff에는 이번 작업과 무관한 NECK/SHOULDER/
ANKLE_FOOT 모듈의 branch-visibility matrix 테스트, cross-region leak
audit(섹션 X/Y/Z/AA, 700줄 이상)도 섞여 있었다 — 이번 convergence
scope 밖이라 이식하지 않음(각 모듈이 필요하면 별도 배치로 논의).
PR #23의 BodyMap PNG asset 파이프라인(`package.json`의
`test:bodymap-assets` 스크립트, `.png=dataurl` esbuild loader),
numeric_scale grid CSS 개선(§16), landscape CTA 높이 축소(§16)도
이번 범위 밖(BodyMap 결정에 종속되거나, 이번 배치가 다루는 LBP/scroll-
hint 주제와 무관한 별도 폴리시)이라 제외.

**테스트:** `tests/integration.spec.mjs`의 낡은 W4(LBP_10 옛 문구
가정, 이제 obsolete)를 새 계약에 맞게 재작성하고, W6(LBP_01B_LEG_SCREEN
shim)/W7(LBP_10A_ONSET_AGE shim + `mapLbpOnsetDecadeToBefore45` 경계값,
40대 precision tradeoff 포함)/W8("없음" 재배치)/W11(실제
`nextQuestion` 알고리즘을 그대로 미러링한 forward-walk 시뮬레이션) 신규
추가. `tests/questionnaire-volume.spec.mjs`의 LBP 3개 프로필 pinned
screen/tap count를 +1/+2로 재측정해 갱신(LBP_01B_LEG_SCREEN이 실제
새 patient-facing 화면이라 floor가 늘어남; LBP_10A/LBP_10 쌍은 이
프로필들의 greedy walk가 chronic-onset 분기에 도달하지 않아 영향
없음을 직접 실행으로 확인). `tests/body-map.spec.mjs`의 옛
`.shell__scrollHint` 픽셀-매칵 overlap 회피 검증 2건을 새 구조적
불변식(`.shell__scrollHintLane`이 `</main>` 뒤의 flex 형제이고
position:absolute/sticky/fixed가 아님)으로 교체.

**Opus 검수(model:opus subagent) 결과:** blocking 없음, "commit/push
해도 안전"으로 판정. `showIf` 동일성, `mapLbpOnsetDecadeToBefore45`의
total function 여부, `isLbpLegAutofillActive`의 fail-safe 여부,
`LBP_01` extent-change guard의 정확성, grid2 레이아웃 실제 렌더 경로
등을 직접 코드로 검증. 단 1건의 HIGH를 "실제 배포된 버그가 아니라
검증 공백"으로 분류: W6/W7/W11 테스트가 App.tsx의 setAnswer 로직을
import가 아니라 손으로 복사해 재구현하고 있어, 만약 실제 App.tsx의
`LBP_03: 'NONE'` 절반이 삭제돼도 그 테스트들은 계속 green으로
남는다는 false-green 위험을 지적 — 이를 즉시 반영해
`tests/viewport-budget.spec.mjs`에 App.tsx 소스 자체를 정규식으로
검증하는 4개 assertion을 추가(기존 HERBAL_ADDON_FIELD 소스-검증
패턴과 동일 기법)하고, mutation test로 실제 그 정확한 회귀를
잡아내는 것까지 직접 확인 후 커밋에 포함시켰다.

Backlog(MEDIUM/LOW, 즉시 조치 불필요, 다음 라운드 후보):
- LBP_01B_LEG_SCREEN에서 이미 선택된 값("있어요"/"잘 모르겠어요")을
  다시 탭하면 이미 답변된 LBP_02/LBP_03이 불필요하게 초기화됨(복구
  가능하지만 낭비되는 재입력) — `value !== responses['LBP_01B_LEG_SCREEN']`
  가드 추가로 해결 가능.
- `questionnaire-volume.spec.mjs`의 walk는 `shouldAutoAdvancePast`를
  모델링하지 않아 실제 patient 체감 부담(BACK_ONLY+"없어요" 환자는
  오히려 화면이 1개 줄어듦)과 이 테스트가 측정하는 "engine-visible
  screen 수"가 다르다는 점을 diff 주석에 명시해 둠 — 향후 최적화 시
  착각하지 않도록 주의.
- `Question.unknownOption`/`.textField__unknownBtn`은 이번 배치에서
  실제로 사용하는 질문이 없어(LBP_10A_ONSET_AGE는 single_choice로
  구현됨) 현재 dead code에 가깝다 — 순수 additive/harmless지만 향후
  numeric 나이 입력이 필요한 다른 질문이 생기면 그때 쓰일 의도적
  scaffolding.
- BodyMap 화면에서 `.bodyMap__selectedChip`가 이제 `bottom: 0`(예전엔
  `84px`)이라 마지막 스크롤 콘텐츠와 더 가까워질 수 있음 — 실기기
  QA 권장(코드 결함은 아님).

**커밋/푸시:** `feat/doctor-clinical-workspace`에 직접 커밋+push,
main에는 절대 push하지 않음, merge하지 않음(HUMAN DECISION REQUIRED
2건은 PR 리뷰에서 사용자에게 별도로 명시).

### 후속 배치: BodyMap PNG artwork + railSelection + NECK/SHOULDER/ANKLE_FOOT 회귀 커버리지

위 배치를 PR #24 댓글로 리뷰한 Gomars93(OWNER)가 scope 정정을 지시:
BodyMap PNG artwork/rendering과 landscape `railSelection`은 현재 보호
정책상 HUMAN DECISION REQUIRED 대상이 **아니다** — region/zone identity,
선택 semantics, routing, threshold, safety 로직, 저장된 provenance가
전혀 안 바뀌는 한 non-clinical presentation/UX이므로 자율적으로
이식하거나 이미 동등/대체됨을 증명하라는 지시. NECK/SHOULDER/
ANKLE_FOOT의 PR #23 테스트 추가분도 "자동으로 범위 밖"이 아니라
회귀 커버리지로 재평가해, 진짜로 빠진 non-clinical 커버리지만
(clinical 로직을 건드리지 않고) 이식하라는 지시.

**실행 내용:**
- PR #23의 실제 커밋된 `src/assets/bodymap/front.png`/`back.png`를
  직접 diff/디코드해 검증(자체 제작 PNG chunk-integrity 체커 +
  from-scratch pixel decoder) — 구조적으로 유효한 PNG이고, 두 파일이
  pixel 단위로 서로 다름(408,960 바이트 중 38,605 바이트 차이)을
  직접 확인한 뒤에만 이식. PR #23 자체 커밋 히스토리에는 한때
  "corrupted" 버전과 "pixel-identical" 버전이 있었다는 기록이 있었으나,
  PR #23 최종 HEAD의 실제 파일은 이미 그 문제들이 해결된 상태였음을
  실측으로 확인 — 기록을 그대로 믿지 않고 직접 검증.
- `src/components/BodyMap.tsx`를 PR #23판(535줄)으로 전체 교체:
  PNG를 1차 artwork로, 기존 inline SVG(`Silhouette`, 이번에 매끄러운
  베지어 곡선 토르소/팔/다리로 재설계 + 목 연결부 추가 + 얼굴 cue
  완전 제거)는 PNG 로드 실패/손상 시 자동 fallback으로 유지
  (`Artwork()`, canvas 기반 pixel-variance 무결성 체크 — 손상된 PNG가
  Chromium에서 `onError`를 안 띄우는 실제 결함 케이스를 커버). 실제
  버그 수정도 포함: `knee`/`arm_hand`/`leg_foot`처럼 같은 view에 zone이
  2개 있는 값을 탭하면 기존 코드는 둘 다에 체크마크가 뜨는 버그가
  있었음 — `zoneKey()`/`defaultStrongZoneKey()`/`strongZoneKey`로 정확히
  탭한 zone 하나만 강조하도록 수정(같은 값의 다른 zone은 약한 tint만).
  `bodyMap__selectedChip`의 `aria-hidden="true"`도 `aria-live="polite"`로
  수정(기존엔 실제 상태 변경 정보가 스크린리더에 전혀 전달 안 됐음).
- `App.tsx`/`ScreenShell.tsx`: `railSelection` prop을 실제로 배선
  (landscape 우측 rail에 "선택한 부위: X" 상시 표시).
- `package.json`: `test:body-map`에 `--loader:.png=dataurl` 추가,
  신규 `test:bodymap-assets` 스크립트 + `test:all` 체인 편입.
- `tests/bodymap-assets.spec.mjs`(신규, PR #23 원본 그대로 318줄):
  PNG 구조적 무결성 + pixel 디코드 기반 front/back 구분 검증 +
  BodyMap.tsx/styles.css 소스 검증. 실제 커밋된 PNG 대상 17/17 통과.
- `tests/body-map.spec.mjs` 대폭 재작성(264줄 변경): "양쪽 무릎 동시
  체크마크" 버그의 회귀 테스트, Silhouette 재설계 검증, aria-live
  수정 검증 등 추가. 118/118 통과.
- `tests/integration.spec.mjs`에 PR #23의 X(NECK_V1 branch-visibility
  matrix)/Y(SHOULDER_V1)/Z(ANKLE_FOOT_V1, "가장 테스트가 얇은 모듈"
  audit finding 대응 + 전체 blank walk)/AA(9개 지역 모듈 상호
  cross-region leak audit) 섹션을 원본 그대로 추가(~400줄) — 이
  섹션들이 건드리는 `neckLogic.ts`/`shoulderLogic.ts`/
  `ankleFootLogic.ts`/`ankleFootAdapter.ts`는 PR #23 fork 시점과
  현재 origin/main 사이 완전히 동일함을 직접 diff로 재확인한 뒤 이식
  (clinical 로직 변경 전혀 없음). 1154/1154 통과.
- PR #23의 `numeric_scale` CSS grid 개선, landscape CTA 높이 축소
  테스트는 이번 topic(BodyMap/NECK/SHOULDER/ANKLE_FOOT)과 무관해
  여전히 범위 밖으로 판단, 이식하지 않음.

**Opus 최종 closing 검수(model:opus subagent, 이 배치의 최종 커밋
직전 상태 기준) 결과:** HIGH 1건 발견 — landscape에서
`.bodyMap__selectedLabel`/`.bodyMap__selectedChip`을 무조건 숨기는
CSS 규칙과, 아직 아무 부위도 선택하지 않았을 때(`typeof value !==
'string'`) `railSelection`이 `null`이 되는 App.tsx 로직이 겹쳐,
BodyMap 화면 최초 진입 시(landscape, 미선택 상태) 화면 어디에도
"부위를 선택해주세요" 안내가 뜨지 않는 실제 결함을 지적(부수적으로
스크린리더 aria-live 영역도 첫 선택 시 "이미 채워진 채 나타나는" 것이
되어 그 첫 변경을 announce하지 않는 접근성 문제 동반). **즉시 수정**:
`railSelection`을 `current.layout === 'body_map'`이면 무조건
non-null이 되도록 변경(값이 없으면 "부위를 선택해주세요" 텍스트),
`tests/viewport-budget.spec.mjs`에 이 정확한 회귀를 잡는 소스-레벨
assertion 2건 추가, 실제 헤드리스 브라우저로 landscape+미선택 상태에서
rail이 "부위를 선택해주세요"를 정확히 렌더링함을 재확인. 같은 리뷰가
지적한 non-blocking 항목(모두 backlog로 기록, 즉시 조치 없음): (1)
`bodymap-assets.spec.mjs`의 aria-hidden assertion에 있던 vacuous
`||` fallback 제거(수정 완료, 즉시 반영); (2) `.bodyMap__figure`
aspect-ratio(480/853)가 실제 PNG 치수(480/852)와 0.12% 오차(시각적
영향 없음, CSS 값 그대로 유지); (3) `decodePngPixels()`가 지원하지
않는 인코딩(interlaced/16-bit)에서는 조용히 SKIP만 하고 fail하지
않음(향후 강화 후보); (4) `zoneKey` 파싱이 PAIN_01 enum에 하이픈이
없다는 암묵적 전제에 의존(현재는 안전, 향후 강화 후보).

**실기기/브라우저 QA(헤드리스 Chromium, 직접 실행):** portrait에서
BodyMap 화면 진입 시 PNG 두 장(`naturalWidth=240`, fallback 미발동)
정상 렌더 확인; 무릎 zone 탭 시 체크마크 정확히 1개만 표시됨을 실제
클릭으로 확인(SSR 테스트가 아니라 실제 상호작용); landscape 전환 시
우측 rail에 "선택한 부위: 무릎"이 정확히 1회 표시되고 본문의
selectedChip은 `display: none`으로 확인; **HIGH 수정 후 재확인**:
landscape에서 미선택 상태로 최초 진입 시 rail이 "부위를 선택해주세요"를
정확히 표시함을 확인.

**전체 게이트:** `tsc -b --force`, `build`, `build:preview`(PNG가
해시된 자산으로 정상 번들링됨 확인), `test:all` 전체(신규
`test:bodymap-assets` 포함) 모두 green. FROZEN
`src/spec/*Logic.ts`/`*Adapter.ts`는 이번 배치가 **`src/spec/` 파일을
전혀 건드리지 않았음**(staged diff에 `src/spec/` 파일 0개, Opus가
직접 확인)과 `origin/main` 대비 zero-diff(브랜치 tip이 아니라
origin/main 직접 비교, 사용자 지시대로)를 함께 확인.

### PR23↔PR24 Convergence — 최종 CLOSED (HEAD `4117f1a` 기준 post-fix 재검수)

Gomars93가 이 HEAD(`4117f1a`)에 대해 다시 명시: 위 HIGH 수정 이전에 실행된
Opus 검수는 "post-fix closing review"로 인정되지 않으므로, **수정이
반영된 최종 커밋 상태 자체**를 대상으로 한 번 더 독립적인 `model:opus`
closing 재검수를 요구. 좁은 검수 범위: landscape/portrait의 최종
`railSelection`/BodyMap 상태, 미답변→답변 전환과 aria-live 동작,
same-view/both-view zone 강조, PNG→SVG fallback 무결성, NECK/SHOULDER/
ANKLE_FOOT 이식이 보호된 clinical semantics를 바꾸지 않았는지, PR23→PR24
분류 재확인.

**이번 라운드에서 HEAD `4117f1a` 위에서 직접 재실행/재확인한 것:**
- `git status` clean, `git diff origin/main -- 'src/spec/*Logic.ts'
  'src/spec/*Adapter.ts'` 재실행 → 빈 결과(변경 없음).
- `tsc -b --force`, `npm run build`, `npm run build:preview`,
  `npm run test:all`(전체 스위트) 모두 이 정확한 HEAD 위에서 재실행 →
  전부 green.
- `tablet core/` pytest 80개 전부 재실행 → 80 passed.
- 헤드리스 Chromium으로 4개 시나리오를 실제 클릭/네트워크 조작으로
  직접 재확인(SSR이 아니라 실제 상호작용):
  1) portrait 미답변 상태 → 무릎 zone 탭 → 답변 상태: 중앙 label이
     "부위를 선택해주세요" → "선택한 부위: 무릎"로 전환, `selectedChip`이
     `aria-live="polite"`로 렌더링됨을 확인.
  2) landscape 미답변 상태 → 무릎 zone 탭 → 답변 상태: rail이 "부위를
     선택해주세요" → "선택한 부위: 무릎"로 전환, `selectedChip`/
     `selectedLabel` 둘 다 답변 여부와 무관하게 `display: none`으로
     확인(중복 렌더링 없음, HIGH 수정이 실제로 동작함을 재확인).
  3) `neck_shoulder`(front+back 양쪽에 zone 존재) 탭 → 두 zone 모두
     `aria-pressed="true"`이지만 체크마크는 정확히 1개만 렌더링됨을
     확인(both-view 케이스에서도 strongZoneKey 로직이 정확).
  4) `front.png` 요청을 네트워크 레벨에서 강제로 abort → 실제로
     `.bodyMap__artwork--hidden`이 붙고 fallback SVG(`.bodyMap__silhouette`)
     가 정확히 1개 렌더링됨을 확인(onError 경로가 실전에서 실제로
     동작함, mock이 아니라 진짜 네트워크 실패로 검증).

**최종 Opus closing 재검수(model:opus subagent, HEAD `4117f1a` 자체를
대상, 이전 검수와 별개로 새로 실행) 결과: "CONVERGENCE BATCH CLOSED —
no blocking issues".** 검증 내용: `railSelection` fallback 문구가
`BodyMap.tsx`의 `selectedLabel` 문구와 codepoint 단위로 완전히 동일함을
직접 대조; landscape hide 규칙과 rail 활성화 규칙이 정확히 같은 media
query라서 "둘 다 숨겨지는" 뷰포트가 존재할 수 없음을 확인; portait에서는
`.shell__railRight` 자체가 `display:none`이라 중복 aria-live 영역이
없고, landscape에서는 rail이 첫 렌더부터 존재하는 채로 값만 바뀌므로
"이미 채워진 채 나타나는" 원래 결함 패턴이 재발하지 않음을 확인;
`ZONES` 배열 순서와 `defaultStrongZoneKey`/`Figure`의 index 계산이
일치함을 직접 코드로 추적해 knee(same-view)와 neck_shoulder(both-view)
모두 정확히 1개 zone만 strong이 됨을 검증; 실제 PNG 파일을 독립적으로
다시 디코드해 두 파일 모두 진짜 사람 형태의 실루엣을 담고 있고
(front 24319 non-background px, back 24150), alpha가 완전 불투명이라
`checkIntegrity`의 alpha-blind 방식이 false positive를 일으킬 수 없음을
확인; `git diff origin/main -- 'src/spec/*Logic.ts' 'src/spec/*Adapter.ts'`
재확인(빈 결과) + `git show 4117f1a --stat -- src/spec/`도 빈 결과임을
확인(coreSpec.ts의 기존 diff는 이전 커밋 935da2c에서 온 것이지 이번
커밋이 아님을 구분); PR23의 non-clinical 표면 중 이번 배치가 놓친 것이
없는지 `--diff-filter=D`로 재확인(없음).

Backlog로 남긴 non-blocking 4건(이전 라운드와 거의 동일, 즉시 조치
불필요): (1) `bodymap-assets.spec.mjs`의 aspect-ratio 주석이 "실제 PNG
치수와 일치"라고 잘못 설명하지만 실제로는 CSS 상수를 하드코딩 검증할
뿐 IHDR을 직접 읽지 않음(0.12% 오차, 시각적 영향 없음); (2) PNG
artwork의 명암 대비가 기존 SVG 실루엣보다 약 14% 더 흐림(1.20:1 vs
1.39:1, 둘 다 WCAG 기준 3:1 미달이라 이번에 새로 생긴 회귀는 아니지만
실기기 조명에서 한 번 육안 확인 권장); (3) `zoneKey` 파싱이 PAIN_01
enum에 하이픈이 없다는 암묵 전제에 의존(현재 안전); (4) `Artwork()`에
로드 타임아웃이 없어 요청이 영원히 멈추면 onLoad/onError 둘 다 발화하지
않을 수 있음(번들 자산이라 실무 영향 미미).

**결론: PR23 ↔ PR24 convergence batch 공식 CLOSED.** 이후 다음
승인된 배치(API-credential-free Quick Revisit + provider-neutral
SOLAPI 어댑터/mock/CRM delivery-state)로 즉시 이동.

## Quick Revisit 발송(SOLAPI 스캐폴드) — 구현 + 2차 클로징 리뷰 반영 완료

API-credential-free(실 SOLAPI 계정 없음, mock transport로 전 경로 검증)
전제로 재진 follow-up 링크를 카카오 알림톡(1순위)+SMS 폴백으로 발송하는
기능 신규 구현. 커밋: `853739b`(최초 구현) → `9ec656e`(HIGH 2건 수정:
링크 텍스트가 절대 실제로 전송되지 않던 버그, dedup 동시성 레이스) →
`ca00d23`(webhook HMAC 서명 인증 추가, HIGH SECURITY) →
`f018b77`(MEDIUM/LOW 백로그: link 형식 검증, contact cache eviction).

**신규/변경 파일**: `src/messaging/types.ts`, `server/solapiAdapter.js`,
`server/messagingStore.js`, `server/index.js`(라우트+
`messagingContactCache`+`buildRevisitMessageText`+webhook 서명 검증),
`src/lib/serverClient.ts`, `src/doctor/MessagingPanel.tsx`,
`src/doctor/DoctorView.tsx`(1줄), `scripts/purge-data.mjs`,
`tests/messaging.spec.mjs`(신규, 93 assertions), `tests/audit-registry.spec.mjs`,
`tests/crm-store.spec.mjs`, `tests/server.spec.mjs`.

**독립 검수 이력** (`model:opus` 백그라운드 에이전트, 총 2회):
1. `853739b`에 대한 1차 리뷰 → HIGH 2건 발견(위 참고) → `9ec656e`로 수정
   → 동일 에이전트가 `9ec656e`를 다시 독립 재검수(격리 워크트리에서 실제
   revert 테스트로 두 수정 모두 검증) → **CLOSABLE** 판정, MEDIUM/LOW
   4건 백로그 → `f018b77`로 반영.
2. Gomars93(OWNER)의 GitHub 리뷰(HEAD `853739bd` 기준, PR #24 코멘트)가
   별도로 5가지 지적을 제기 — 상세 대응은 PR #24의 해당 코멘트 참고,
   요약:
   - dedup 동시성(HIGH) → `9ec656e`로 이미 수정 완료(1차 리뷰와 동일 버그).
   - webhook 미인증(HIGH SECURITY) → `ca00d23`로 수정(HMAC-SHA256 서명
     검증, mock secret도 fail-closed).
   - 재시작 시 재시도 복구(HIGH) → **HUMAN DECISION REQUIRED로 명시
     플래그** (아래 참고, 코드는 변경하지 않음).
   - "2-3탭 Quick Revisit 문진" cohesive-scope gap → 조사 결과 이번
     SOLAPI 배치 이전 라운드(Round 3 Phase D, Round 8-2/8-9)에 이미
     구현·테스트 완료된 기능(`microFollowUp.ts`+`FollowUpScreen.tsx`+
     `STAFF_ASSISTED` provenance, `tests/station.spec.mjs:385-411`)임을
     확인 — 코드 변경 없이 근거 제시로 대응.
   - attempt identity across retry → 이미 안전한 설계였음을 확인,
     회귀 테스트만 추가(`ca00d23`).

**HUMAN DECISION REQUIRED (미해결, 코드 변경 보류 중)**: 재시작 후
자동 재시도 복구. 현재 설계는 전화번호/발송 텍스트를 프로세스 로컬
in-memory `messagingContactCache`에만 보관(디스크 미저장 — 이 저장소의
기존 신원 정책 "전화번호 절대 미저장"과 일치, `patientIdentityStore.js`
헤더 참고). 서버 재시작 시 이 캐시는 비워지고, 그 시점에 예정된 자동
재시도는 `FAILED/recipient_unresolvable`로 처리된다(무음 데이터 손실이
아니라 fail-closed — 메시지 레코드 자체는 디스크에 남고, 원장 UI에
"발송 실패"+재시도 버튼으로 계속 보인다). 즉 복구는 "직원이 알아채고
전화번호/링크를 다시 입력해 수동 재시도"하는 human-mediated 방식이며,
자동(무인) 재시도의 재시작 내구성은 없다. 이것이 배치가 요구하는
"restart 이후 retry/failure recovery"의 충분한 답인지, 아니면 (신원
정책을 건드리지 않는 범위에서) bounded/short-lived 방식의 자동 복구
메커니즘이 별도로 필요한지는 제품/보안 정책 판단이 필요해 코드로
임의 해결하지 않음 — PR #24 코멘트에 명시적으로 플래그해 두었다.

**검증 완료(각 커밋마다 개별 실행, 최종 HEAD `f018b77` 기준 재확인)**:
`tsc -b --force`, `npm run build`, `npm run build:preview`,
`npm run test:all`(전체 그린, `tests/messaging.spec.mjs` 93개 assertion
포함), `tablet core` pytest(80 passed), 실제 브라우저(Playwright,
Chromium) QA로 발송/폴백/재시도/취소 전 경로 실제 확인(HIGH-1 수정
전후 모두), `git diff origin/main -- 'src/spec/*Logic.ts'
'src/spec/*Adapter.ts'` = 항상 empty(FROZEN 무손상). CI/Preview green
(853739bd 기준 확인, 이후 커밋들도 push 후 CI green 통지 수신).

## Completed — Round 18 (stale-write 충돌 안전장치, 이번 세션)

**목표(오너 지시, Quick Revisit/SOLAPI 배치의 CLOSABLE 확인 직후 새로
지정)**: round 17이 서버에 이미 만들어둔 `expectedUpdatedAt`/409 CAS
1차조건(`saveJudgment`/`saveWorkspace`/`saveVisitWorkspace`, 이미
`tests/server.spec.mjs`·`tests/follow-up-session.spec.mjs`에서 HTTP
레벨로 검증됨)을 실제 Doctor Workspace/Revisit Workspace/JudgmentPanel
저장 경로에 배선한다 — 지금까지는 클라이언트가 이 헤더를 전혀 보내지
않아 실질적으로 last-write-wins였다.

- 새 공유 컴포넌트 `src/doctor/ConflictBanner.tsx`: fail-closed 배너 —
  절대 병합하지 않고, "최신 내용 불러오기" 1개 액션만 제공, 되돌리기 전
  화면에 있던 미저장 내용을 읽기전용 textarea로 보존(복사해서
  다시 입력 가능). `.doctor__banner--warning`(안전배너 `--danger`와
  절대 혼동되지 않는 별도 색상).
- `DoctorWorkspace.tsx`/`RevisitWorkspace.tsx`: 디바운스 autosave가
  마지막으로 확인한 `updated_at`을 CAS precondition으로 보내고, 409를
  받으면 재시도를 완전히 멈춘다(`if (conflict) return`) — 명시적
  reload 전까지. 레코드 전환 시 conflict/draft 상태 완전 초기화(환자
  간 누수 없음, 실제 브라우저 QA로 확인).
- `JudgmentPanel.tsx`: "기록" 버튼(디바운스 아님, 명시적 클릭)도 동일
  계약 — 거부된 저장은 "기록됨"으로 표시되지 않고, 원장이 입력 중이던
  판단/디브리핑 텍스트는 그대로 화면에 남는다.
- `DoctorView.tsx`: 세 저장 경로 모두 409의 `errorBody.current`를
  typed conflict outcome으로 변환.

**실제 브라우저 QA(2개 Playwright 브라우저 컨텍스트, 같은 제출건을
동시에 열고 편집)가 배치 완료 전 실제 버그 2건을 잡아냈다**(코드로
고치기 전에는 QA가 실제로 FAIL했음, 이후 재실행으로 확인):
1. 제출건을 처음 열 때 자동으로 붙는 "열람함(viewed)" 상태 기록도
   judgment/workspace 저장과 똑같이 `updated_at`을 올리는데
   (`store.js`의 `setStatus`), 그 응답을 `selectedRecord`에 반영하지
   않고 있었다 — 그 결과 어떤 제출건이든 "첫 자동저장"이 원장 자신의
   열람-표시 기록과 스스로 충돌(spurious 409)하는 구조였다. 단일
   원장·단일 탭 상황에서도 100% 재현.
2. 두 번째 탭이 이미 '열람됨' 상태인 제출건을 열어도 `viewedRef`가
   탭별 in-memory라 이를 몰라 열람-표시를 또 보내 `updated_at`을 한 번
   더 올렸다 — 직원이 원장이 이미 보고 있는 환자를 잠깐 열어보기만
   해도 원장 쪽 다음 저장이 충돌할 수 있는 구조.
둘 다 `DoctorView.tsx`에서 수정(status 응답을 `selectedRecord`에
반영 + 서버가 보고한 status가 여전히 'new'일 때만 열람-표시 전송).
수정 후 QA 재실행 결과: 정상 저장자는 깨끗이 저장, stale 저장자는
409로 안내 배너 + 원문 보존 + reload로 서버 최신본 복구(병합 없음),
다른 환자로 전환 시 배너/초안/텍스트 전혀 누수되지 않음 — 전부 확인.

1차 검증: `npx tsc -b --force`(0 errors), `npm run build`,
`npm run build:preview`, `npm run test:all`(새 `tests/save-conflict.spec.mjs`
25 assertions 포함 전체 green), `tablet core` pytest 80/80,
`git diff origin/main -- 'src/spec/*Logic.ts' 'src/spec/*Adapter.ts'` =
empty. 커밋 `f556574`.

### 독립 `model:opus` 클로징 리뷰 — NOT CLOSABLE 판정, HIGH 1건 포함 실제 버그 발견

`f556574` 위에서 실행한 독립 리뷰(실제 invocation, 코드 재분석 +
`tsc`/`build`/여러 테스트 스위트 직접 재실행으로 검증)가 **NOT CLOSABLE**
판정을 내렸다. 가장 중요한 발견:

**HIGH — 형제 패널 간 버전 토큰 세탁(version-token laundering)으로 인한
무음 데이터 손실 가능성.** `DoctorWorkspace.tsx`와 `JudgmentPanel.tsx`는
같은 제출건 레코드의 서로 다른 필드(`workspace` / `judgment`)를 각자
편집하지만, 1차 수정본의 "prop이 바뀌면 토큰만 채택" 로직은 **토큰만
갱신하고 그 토큰과 함께 온 실제 내용은 갱신하지 않았다.** 재현: 탭 B가
workspace 저장(v0→v1) → 탭 A가 JudgmentPanel에서 충돌(구버전 v0) →
reload → 재시도 성공(v1→v2, 이 성공 응답에는 B가 쓴 최신
workspace 내용도 고스란히 포함됨) → 탭 A의 DoctorWorkspace가 (자기
필드는 안 건드렸으니 "충돌 없음"으로 보고) 이 새 토큰 v2만 조용히
채택하면서 **자신이 처음에 들고 있던 낡은 workspace 내용은 그대로 유지**
→ 다음 저장 시 CAS는 통과하지만 실제로는 B가 쓴 내용을 무음으로
덮어씀. 정확히 이 배치가 막으려던 실패 모드가 다른 경로로 재현된 것.

수정: 토큰만 채택하는 대신 **"이 패널에 미저장 편집이 없을 때만, 토큰과
그 토큰이 가리키는 최신 내용을 함께" 채택**하도록 변경(양쪽 패널 동일
원칙). 편집 중이면 아무것도 하지 않고 저장 시점의 정상 CAS 체크가
잡도록 둔다(가끔의 오탐 충돌 배너는 안전한 실패 모드, 무음 덮어쓰기는
아니다).

**이 수정 자체에도 실증 QA로만 잡히는 2차 버그가 있었다**: 두 effect의
의존성 배열에 패널 자신의 콘텐츠 state(`workspaceState` /
`judgment`+`debrief`)를 넣어뒀더니, `handleReloadFromConflict`가
그 state를 바꾸는 순간 effect가 즉시 재실행되어 — 이번엔 "방금 reload로
정확히 갱신한 새 토큰"을 "아직 안 바뀐 낡은 prop 값"으로 다시
덮어써버려 reload 직후 재시도가 또 409나는 무한루프가 됐다. 의존성
배열에서 콘텐츠 state를 제거(effect는 오직 prop인
`initialRecordUpdatedAt`/`initialUpdatedAt`이 바뀔 때만 재실행, "pristine"
여부는 실행 시점에 클로저로 최신값을 읽음)하여 해결 — **이 2차 버그는
추론만으로는 못 잡고, 리뷰가 지목한 정확한 재현 시나리오를 실제
Playwright 2-컨텍스트 QA로 다시 돌려서야 발견됨.**

그 외 발견 및 조치:
- **MEDIUM — `JudgmentPanel`의 "기록" 클릭이 대기 중인 conflict를
  무시하고 재시도 가능했음** (DoctorWorkspace/RevisitWorkspace의 autosave
  effect와 달리 fail-closed 가드가 없었음). `handleRecord` 최상단에
  `if (conflict) return` 추가로 해결.
- **MEDIUM — `RevisitWorkspace`가 `getVisit` 실패 시 완전히 편집 가능한
  빈 폼으로 떨어지고, 첫 저장이 CAS precondition 없이(진짜 무조건
  last-write-wins) 나갔음** — 일시적 네트워크 실패에도 실제 저장된
  내용을 덮어쓸 수 있는 구조. `loadError` state 추가 — 로드 실패 시
  편집/저장 자체를 막고 "다시 시도" 액션만 제공하도록 수정.
- **LOW/기록만 — `RevisitWorkspace`의 `setRecorderPointer`(녹음 결과
  연결)가 CAS 가드 없이 같은 visit 레코드의 `updated_at`을 올릴 수 있는
  이론상 경로**(원장이 재진 화면을 열어둔 채 녹음 결과가 도착하는
  경우) — 위 Known Risks에 이미 기록됨. fail-safe(배너만 뜸, 데이터
  손실 없음)이므로 이번 배치에서 별도 코드 수정 없이 기록으로 처리.
- **LOW/기록만 — 자동저장 effect들에 in-flight 저장 가드가 없어, 저장이
  900ms 디바운스보다 오래 걸리면 자기 자신의 진행 중인 저장과 경합해
  불필요한 오탐 충돌이 생길 수 있음** — fail-closed(배너만 뜸)이라
  데이터 손실은 없음, 후속 과제로 기록.
- **LOW/기록만 — "열람함" 상태 쓰기 자체는 CAS 가드가 없음**(다른
  writer가 GET과 상태쓰기 사이에 끼어들 수 있는 좁은 창) — 위와 동일한
  결함 종류, 발생해도 fail-safe. 후속 과제로 기록.
- **LOW/기록만 — `tests/save-conflict.spec.mjs`는 소스 레벨 정적
  검사라 HIGH 버그(2차 버그 포함) 자체를 구조적으로 잡을 수 없음** —
  이 저장소가 jsdom+act() 신규 의존성을 의도적으로 피하는 것과 같은
  이유(patient-ux.spec.mjs 헤더 참고). 실제 인터랙티브 증명은 항상
  real-browser QA가 담당하며, 이번 라운드는 정확히 그 방식으로 HIGH
  버그와 2차 버그 둘 다 잡았다.

수정 후 재검증: `npx tsc -b --force`(0 errors), `npm run build`,
`npm run build:preview`, `npm run test:all`(`tests/save-conflict.spec.mjs`
29 assertions로 확장, 전체 green), `tablet core` pytest 80/80,
FROZEN diff empty. **리뷰가 지목한 정확한 재현 시나리오를 그대로 옮긴
전용 Playwright QA(탭 B workspace 저장 → 탭 A JudgmentPanel 충돌→reload→
재시도 성공 → 탭 A의 DoctorWorkspace가 B의 실제 내용을 올바르게 채택 →
탭 A가 그 위에 이어서 저장 → 서버에 B와 A의 내용이 모두 살아있는지
확인)을 실행해 전부 통과 확인.** 기존 2-컨텍스트 QA(단순 stale-writer
시나리오)도 재실행하여 회귀 없음 확인.

커밋: `f556574` → `7e4695e`(HIGH/MEDIUM 수정) → `48a5045`(HANDOFF만
갱신) → 2차 독립 클로징 리뷰 → `0ca7419`(아래 새 MEDIUM 수정).

### 2차 독립 `model:opus` 클로징 리뷰 — HIGH/기존 MEDIUM 2건은 닫힘 확인, 새 MEDIUM 1건 발견

`48a5045` 위에서 실행한 두 번째 독립 리뷰(실제 invocation, 정적 재분석에
그치지 않고 직접 QA를 재현/재실행해 동적으로 검증)는 위 HIGH 발견과 그
수정의 2차 버그, 그리고 두 MEDIUM 항목이 모두 실제로 닫혔음을 확인했다.
다만 그 수정 자체 안에서 **새로운 MEDIUM 1건**을 찾아냈다(추론이 아니라
직접 재현으로 확인됨):

**MEDIUM — `JudgmentPanel.tsx`의 `isDraftPristine()`이 첫 "기록" 저장 성공
직후부터 영구적으로 false가 됨.** `handleRecord`의 성공 분기가
`lastKnownJudgmentRef`에 `finalized`(방금 새로 찍힌 `recorded_at`을
포함)를 스냅샷했는데, 실제 화면(live) `judgment` state는 `finalized`로
갱신되는 곳이 어디에도 없다(`setJudgment(finalized)` 호출이 없음). 그
결과 `JSON.stringify(judgment) === JSON.stringify(lastKnownJudgmentRef...)`
비교가 **첫 저장 이후 영원히 거짓**이 되어, HIGH 수정이 도입한
"pristine일 때만 토큰+내용을 함께 채택" 버전-동기화 effect가 그 순간부터
완전히 무력화됨 — 이후로는 실제로는 아무 충돌도 없는 형제(sibling)
저장(예: 같은 탭의 DoctorWorkspace autosave)이 한 번이라도 끼어들면
JudgmentPanel의 다음 "기록" 클릭이 항상 오탐(false) 409로 막히는 구조.

수정(커밋 `0ca7419`): 성공 분기에서 `finalized` 대신 **live 상태 그대로인
`judgment`/`debrief` 변수**를 `lastKnownJudgmentRef`에 스냅샷하도록 변경
(`recorded_at` 등 `finalized`가 부여하는 파생 필드는 여기서 비교 기준에
포함시키지 않음). `tests/save-conflict.spec.mjs`에 이 정확한 계약을
고정하는 회귀 테스트 추가(성공 분기 소스가 `lastKnownJudgmentRef.current =
{ judgment, debrief }` 형태이고, `finalized`를 스냅샷하는 옛 형태가
아님을 검증).

전용 Playwright QA(단일 탭·단일 원장, 두 번째 writer 없음: 기록 1회
저장 성공 → 진료 탭에서 DoctorWorkspace 필드 편집+저장(형제 쓰기,
judgment는 안 건드림) → 자료 보기 탭으로 돌아와 판단을 다시 편집하고
"기록" 2회차 클릭 → 배너 없이 깨끗이 성공해야 함 → 서버에 2회차 판단
내용과 형제 workspace 편집이 모두 살아있는지 확인)으로 수정 전 실패,
수정 후 통과를 직접 확인. 기존 두 QA(단순 stale-writer 시나리오, HIGH
버그의 laundering 재현 시나리오)도 재실행하여 회귀 없음 확인.

재검증: `npx tsc -b --force`(0 errors), `npm run build`,
`npm run build:preview`, `npm run test:all`(`tests/save-conflict.spec.mjs`
30 assertions, 전체 green), `tablet core` pytest 80/80, FROZEN diff empty.

**3차 리뷰를 생략하기로 한 위 판단은 오너(Gomars93)가 PR #24 코멘트로
명시적으로 뒤집었다**: 이 저장소의 표준 규칙은 "Opus 발견 → Sonnet 수정 →
Opus 재검토"이며 수정 이후 재검토를 생략한 것 자체가 그 규칙 위반이라는
지적. 이에 따라 `4b2a418`(HANDOFF만 갱신) 위에서 `0ca7419` 수정과 그
주변 stale-write/version-sync 경로에 초점을 맞춘 **실제 3번째 독립
`model:opus` 리뷰**를 실행했다(실제 invocation, 다음 명령/파일을 직접
실행·판독해 검증 — `git log`/`git show 0ca7419`, `npx tsc -b --force`,
`npm run build`, `npm run test:all`(전체 green), `npm run test:save-conflict`
(30/30), `git diff origin/main -- 'src/spec/*Logic.ts' 'src/spec/*Adapter.ts'`
(empty) — 그리고 결정적으로, 저장소 자체가 소스-레벨 정적 검사만 갖고
있어 이런 종류의 버그를 구조적으로 잡지 못한다는 한계를 넘어서기 위해
리뷰가 직접 임시(저장소에 커밋하지 않는) Playwright 하네스를 만들어
수정 전(`48a5045`) 빌드와 수정 후(HEAD) 빌드를 같은 7개 시나리오로
차등 실행: 수정 전 빌드는 7개 중 5개(정확히 2차 리뷰가 지적한 증상과
HIGH의 laundering 재현 포함)에서 실제로 FAIL, 수정 후 빌드는 7개 전부
PASS — 이 fix가 실제로 문제를 해결했다는 것을 정적 재읽기가 아니라
동작 차이로 직접 증명함).

**판정: CLOSABLE.** 새 HIGH/MEDIUM 없음. `isDraftPristine()`이 라이브
상태 그대로를 비교 기준으로 삼도록 완전히 복구되었고, `DoctorWorkspace`/
`RevisitWorkspace`의 동등 비교 함수(`workspaceStateEquals`/
`visitWorkspaceStateEquals`)는 애초에 `updated_at`을 비교 전에
destructure로 제외하므로 같은 종류의 버그가 구조적으로 발생할 수 없음을
확인. `7e4695e`의 laundering 수정과 의존성 배열 수정도 이 리뷰의 새
시나리오(저장 연속 처리와 sync effect 사이의 순서, reload 이후
`lastKnownJudgmentRef` 정합성)로 재검증되어 이상 없음.

부수 지적 2건(코드 변경 필요, 둘 다 사소함) — 반영 완료:
1. `JudgmentPanel.tsx`의 `lastKnownJudgmentRef` 주석이 "서버의 judgment와
   현재 일치하는 값"이라고 설명했는데, `0ca7419` 이후로는 저장 성공
   직후에도 서버는 `finalized`(recorded_at 포함)를 갖고 이 ref는 그
   이전 라이브 상태를 갖는 것이 의도된 동작이라 주석이 부정확해짐 —
   "판단 편집 여부를 가리는 pristine 기준선"이라는 실제 의미로 주석
   교정(코드 동작 변경 없음).
2. 이 HANDOFF 섹션 자체가 "3차 리뷰 생략" 판단을 여전히 최신 사실인 것처럼
   기록하고 있었던 것 — 지금 이 갱신으로 해결.

재검증(주석 수정 이후): `npx tsc -b --force`(0 errors), `npm run build`,
`npm run test:save-conflict`(30/30), FROZEN diff empty.

## Completed — PR #23/#24 통합 리허설 (main 미변경, 로컬 임시 브랜치)

**목표(오너 지시)**: `fix/tablet-v2-3-ux-and-routing-audit`(#23, HEAD
`81252a8`, main 기준 17 커밋 선행)와 `feat/doctor-clinical-workspace`
(#24, HEAD `7930cc1`, main 기준 76 커밋 선행이지만 #23 기준으로는 17
커밋 뒤처짐)가 App.tsx/BodyMap.tsx/ScreenShell.tsx/TextInputField.tsx/
coreSpec.ts/styles.css/여러 테스트 파일/vite.config.ts/package.json에서
크게 겹쳐, 나중에 실제로 `#23 → main → #24` 순서로 병합할 때 현재
독립 CI로는 잡을 수 없는 실질적 충돌/회귀 위험이 있음을 로컬 리허설로
미리 검증. **main도, PR #23/#24 어느 브랜치도 건드리지 않음** —
로컬 전용 임시 브랜치(`integration-rehearsal-23-into-24`, 별도 git
worktree, push 안 함)에서만 수행.

**충돌 실태**: 겹치는 18개 파일 중 상당수(`App.tsx`의 railSelection
블록, `BodyMap.tsx`, `ScreenShell.tsx`, `QuestionScreen.tsx`,
`types.ts`, `body-map.spec.mjs`)는 main 대비 두 브랜치의 diff가
바이트 단위로 완전히 동일해 git이 충돌 없이 자동 병합함. 실제 충돌은
12개 파일(`styles.css`, `TextInputField.tsx`, `PreviewBanner.tsx`,
`vite.config.ts`, `package.json`, `.gitignore`,
`integration.spec.mjs`, `preview-build.spec.mjs`,
`viewport-budget.spec.mjs`, `bodymap-assets.spec.mjs` 등)에서
발생했고, 전부 양쪽 내용을 직접 읽고 수동 해결(대부분 #23이 이후
라운드에서 같은 테스트를 더 정교하게 다듬은 상위 호환 버전이라 #23
쪽을 채택; `viewport-budget.spec.mjs`는 양쪽이 서로 다른, 겹치지 않는
새 assertion을 각자 추가한 유일한 경우라 둘 다 보존).

**검증(리허설 브랜치에서 실행, 실제 명령/결과)**: `npx tsc -b --force`
(0 errors), `npm run build`/`npm run build:preview`(둘 다 성공),
`git diff -- 'src/spec/*Logic.ts' 'src/spec/*Adapter.ts'`를 main/#23
HEAD/#24 HEAD 세 기준 모두에 대해 실행 — 전부 empty(FROZEN 완전
유지), `npm run test:all` 전체 green(`tests/integration.spec.mjs`
1176/1176 — #23 PR 본문이 보고한 수치와 정확히 일치, `bodymap-assets`
17/17), `tablet core` pytest 80/80. 실제 브라우저 QA(Playwright, 통합
빌드로 직접 실행): 환자 태블릿 portrait(800×1280)/landscape
(1024×640) 첫 화면 가로 오버플로 없음, 원장 기본 워크스페이스 정상
렌더, station 등록/배정/리셋 API 정상, start-revisit 정상, round 18
stale-write 충돌(저장자 A 성공 → B 409+배너 → reload 복구) 정상 —
전부 통과.

**CI/Preview workflow 중복 점검**: `pr-23-preview.yml`(`/pr-23/`
하위경로)과 `doctor-workspace-preview.yml`(`/doctor-pr/` 하위경로)은
서로 다른 sub-path로 배포하고 동일한 `pages` concurrency group을
공유해 경합하지 않도록 이미 설계돼 있음을 확인 — 안전하게 공존 중이며
제거/수정 대상 아님.

**결론**: 실제 `#23 → main → #24` 병합 시점에는 이 리허설이 기록한
12개 충돌 파일과 해결 방향을 그대로 참고할 수 있다. main/PR 브랜치
자체는 이번 라운드에서 전혀 변경되지 않았으므로 이 섹션은 순수 기록
목적. Clinical CRM v0.3.1 CLOSED, Test 0 PENDING, Care Gap reservation
suppression OFF, 신원 원칙(랜덤 UUID + Sigma chart_no 1:1, RRN 없음,
전화번호 비-신원/비영구표시, 자동 병합 없음) 모두 리허설 중 실행된
`test:all`(crm-schema/crm-store/identity-link-e2e 포함)로 그대로
유지 확인.

## Completed — BizM 메시징 배치 (진행 중, 이번 세션)

**목표(오너 지시, PR #24 코멘트)**: SOLAPI 전용으로 짜여 있던 Quick
Revisit 발송 파이프라인을 provider-neutral하게 일반화하고, 오너가 실제로
선택·등록 중인 **BizM(비즈엠) Alimtalk**용 transport adapter를 구현하며,
BizM 템플릿 버튼 URL이 이후 바뀌지 않도록 안정적인 공개 후속 문진 URL
계약을 확립. 실제 라이브 발송/자격증명 없이, 코드 측 작업만 이번
배치 범위.

**Provider-neutral transport(A)**: `server/messagingTransport.js`(신규)가
단일 선택 지점 — `SAMINDANG_MESSAGING_PROVIDER=solapi`가 없으면 BizM이
기본값. 두 adapter(`server/bizmAdapter.js` 신규, `server/solapiAdapter.js`
유지)가 동일한 `{ send, state, provider }` 인터페이스를 구현해
`messagingStore.js`는 어느 provider가 활성인지 전혀 몰라도 됨. BizM의
실제 wire 포맷(요청 필드/인증/템플릿 변수 payload/콜백 시그니처)은 이
샌드박스에서 bizmsg.kr/kakaoenterprise.com 등으로 egress가 전부 차단되어
검증 불가 — `bizmAdapter.js` 헤더에 조사한 두 개의 상충하는 서드파티
오픈소스 SDK와, 무엇이 검증되지 않았는지를 명시. 확인 불가능한 부분(특히
SMS/LMS 폴백 존재 여부)은 fail-closed(BizM `FALLBACK_CHANNEL`은 빈 맵)로
처리. SOLAPI는 삭제하지 않고 명시적 legacy/opt-in 코드로 유지(기존
mock 기반 테스트 전부 그대로 통과).

**버그 발견 및 수정**: 일반화 과정에서 `messagingStore.js`가
`fallbackChannelMap`을 `resolveFallbackChannelMap()`(인자 없이,
`process.env`를 독립적으로 재조회)으로 계산하고 있어, 테스트가 명시적으로
`{transport: createSolapiTransport({})}`를 주입해도 실제 활성 provider
(BizM 기본값)의 빈 폴백 맵을 잘못 사용하는 버그를 발견 — 새로 추가한
`fallbackChannelMapForProvider(providerName)`(주입된 transport 자신의
`.provider` 필드를 신뢰)로 교체해 수정, `tests/messaging.spec.mjs`의
SOLAPI legacy 폴백 회귀 테스트로 확인.

**안정적 공개 후속 문진 URL(B)**: `src/lib/publicFollowUpUrl.ts`(신규)가
`patientFollowUpLink()`의 유일한 canonical builder. `window.location`
기반 추정을 프로덕션에서 완전히 제거 — `VITE_SAMINDANG_PUBLIC_FOLLOWUP_
BASE_URL`이 설정되지 않으면 프로덕션에서는 **명시적으로 `null`을
반환**(잘못된 origin으로 조용히 대체하지 않음), dev 서버에서만
`window.location` fallback 유지. `#follow-up=<token>` 라우트 계약은
그대로. `DoctorView.tsx`는 링크가 `null`이면 QR/복사/메시지 발송 UI를
숨기고 "설정되지 않음" 경고를 보여줌(원장에게 거짓 성공 표시 없음).

**`/followup/` 리허설 배포**: `.github/workflows/doctor-workspace-
preview.yml`에 기존 "라이브 root 미러 + 하위경로 추가" 기법을 재사용해
`/followup/` 빌드를 추가(서버 URL 미설정 — 실제 백엔드 절대 연결 안 됨,
NO-PHI). BizM 템플릿 개발/리허설 전용, 프로덕션 아님.

**실제 브라우저 QA로 발견·수정한 2번째 결함**: `src/lib/followUpClient.ts`의
공용 `request()` 헬퍼가 모든 비-2xx 응답을 무조건 일반 실패로 취급해
본문을 버리고 있었음 — 그런데 서버는 존재하지 않는/손상된 토큰을 HTTP
404 + `{status:'INVALID'}`로 응답(만료/사용됨/무효화는 HTTP 200이라
문제 없었음). 그 결과 `FollowUpScreen.tsx`의 `UNAVAILABLE_MESSAGE.INVALID`
분기가 도달 불가능했고, 잘못된/오타난 링크를 연 환자는 "유효하지 않은
링크입니다" 대신 막연한 "연결할 수 없습니다"를 보게 됨 — Playwright로
실제 서버+토큰 발급까지 재현해 발견. `getFollowUpSession`을 전용
fetch 경로로 분리해 HTTP 상태와 무관하게 인식 가능한 `status` enum이
있으면 실데이터로 취급하도록 수정(POST 제출 실패 경로는 건드리지
않음 — 진짜 실패로 유지하되, `FollowUpScreen.tsx`가 동일
`UNAVAILABLE_MESSAGE` 맵으로 raw enum 문자열 대신 한국어 메시지를
보여주도록 보강). 수정 후 실제 브라우저(모바일 뷰포트, 로컬 서버 +
`VITE_SAMINDANG_PUBLIC_FOLLOWUP_BASE_URL`로 설정한 별도 origin)로
valid→제출→URL/토큰 scrub→새로고침(미부활)→뒤로가기(미노출), consumed,
invalid 네 시나리오 모두 재확인 — 전부 통과. `/followup/` CI 동등
아티팩트(서버 미설정)도 모바일 뷰포트에서 가로 오버플로 없음, 정직한
연결 실패 상태, 토큰 미노출 확인.

**검증**: `npx tsc -b --force`(0 errors), `npm run build`/`build:preview`
(둘 다 성공), `npm run test:all`(exit 0, `tests/messaging.spec.mjs` 98개
+ `tests/messaging-bizm.spec.mjs` 25개 + `tests/public-followup-url.spec.mjs`
10개 신규/갱신 assertion 포함 전부 통과), `tablet core` pytest 80/80,
`git diff origin/main -- 'src/spec/*Logic.ts' 'src/spec/*Adapter.ts'`
0 lines(FROZEN 유지).

**메시징 파이프라인 안전성/durability 재검토(완료, 이번 세션)**:
오너 지시 Section C의 각 항목을 코드 레벨로 재확인.
- **cross-patient 누수**: `POST /api/visits/:id/messages`가 `visitRecord.
  patient_id !== patientId`를 이미 검사(round 18 이전 closing-review
  수정, 이번 배치로 변경 없음) — 재확인만.
- **idempotency/dedup**: `queueRevisitMessage`의 check-then-create가
  `dedup:${dedupKey}` 락으로 전체 원자화되어 있음(기존 수정, 변경 없음)
  — 재확인만.
- **재시작 durability**: `messagingContactCache`(phone/text/variables)는
  의도적으로 process-local, 재시작 시 초기화 — 재시작 후 due한 자동
  재시도는 `recipient_unresolvable`로 fail-closed, 수동 재시도로 staff가
  복구. 전화번호를 저장하지 않고는 닫을 수 없는 구조적 트레이드오프이므로
  **HUMAN DECISION REQUIRED로 그대로 유지**(위 Next Recommended Action
  0번, 이번 배치가 새로 만든 gap 아님 — BizM 일반화 이전부터 동일).
- **콜백 replay/out-of-order**: `handleDeliveryWebhook`은 `current.status
  !== 'SENT'`일 때만 no-op(늦게 도착한 콜백이 이미 재시도/폴백으로 대체된
  상태를 덮어쓰지 않음), 미지의 `provider_message_id`는 항상 no-op(에러
  아님) — 재확인만, 변경 없음.
- **provider timeout/5xx/429 분류**: `bizmAdapter.js`의 live `send()`가
  429/5xx를 retryable로, network error를 retryable로, 파싱 실패/누락된
  message id를 retryable로 정확히 분류함을 확인. SOLAPI와 동일하게 fetch
  자체에 명시적 애플리케이션 레벨 타임아웃은 없음(기존부터의 속성, 이번
  배치가 만든 gap 아님 — 별도 후속 과제로 남김, 오너 승인 필요).
- **폴백 이중발송 방지**: BizM `FALLBACK_CHANNEL`은 빈 맵이라 폴백 자체가
  전혀 시도되지 않음(이중발송 불가능). **실제 버그 발견 및 수정**:
  `messagingStore.js`가 `fallbackChannelMap`을 `resolveFallbackChannelMap()`
  (인자 없이 `process.env` 독립 재조회)로 계산해, 테스트가 명시적으로
  SOLAPI transport를 주입해도 실제 활성 provider(BizM 기본값)의 빈 폴백
  맵을 잘못 적용하는 버그 — `fallbackChannelMapForProvider(resolvedTransport.
  provider)`로 교체해 수정(위 "BizM 메시징 배치" 섹션에도 기록됨).
- **persistence/audit/purge integrity**: `safeAudit` 호출은 전부
  `{event, visit_id, actor}`만 남기고 `phone`/`text`/`variables`(raw
  token 포함)는 어디에도 로그/감사되지 않음을 확인. `purgeAll()`은
  변경 없음.
- **secret hygiene**: `BIZM_API_KEY`/`BIZM_SENDER_KEY`는 fetch
  Authorization 헤더에만 쓰이고 어디에도 `console.log`되지 않음을 확인
  (grep으로 전수 확인).
- **raw phone 미저장**: `MessageRecord`는 여전히 phone 필드 자체가 타입에
  없음(구조적 보장, 이번 배치로 변경 없음).
- **template/content mismatch 오류를 staff에게 명확히 노출**: **실제 gap
  발견 및 수정**: `MessageRecord.error_code`는 이미 sanitized(원본
  provider 응답/PHI 없음)로 설계돼 있었지만 `MessagingPanel.tsx`가 이를
  전혀 렌더링하지 않아, staff가 "발송 실패"만 보고 원인(예:
  `provider_http_400` vs `bizm_channel_unverified` vs 일시적 네트워크
  오류)을 구분할 수 없었음 — FAILED 상태일 때 `error_code`를 그대로
  노출하도록 추가.

두 건의 실제 수정(`fallbackChannelMapForProvider` 배선, `error_code`
노출) 모두 `npx tsc -b --force`/`npm run build`/`npm run test:all`
(exit 0)/`tablet core` pytest 80/80/FROZEN 0 lines로 재검증 완료.

## Completed — BizM 배치 독립 `model:opus` 리뷰 루프 (완료, 이번 세션)

**1차 독립 리뷰**(실제 subagent 호출, `model:opus`, 커밋 `6ec11eb` 대상):
읽기 전용으로 전체 diff를 직접 읽고 검증 명령을 실제로 실행 — FROZEN
diff 0 lines, `tsc -b`/`build` clean, `test:messaging` 98/98,
`test:messaging-bizm` 25/25, `test:public-followup-url` 10/10 확인 후
4건 발견:
- **MEDIUM**: 발송 큐 라우트(`POST /api/visits/:id/messages`)와 수동
  재시도 라우트(`POST /api/messages/:id/retry`) 둘 다, 전달받은
  `follow_up_token`(또는 재시도 시 `link`에 담긴 토큰)이 실제로 그
  visit_id 것인지 전혀 검증하지 않고 URL "모양"만 확인하고 있었음 —
  BizM에서는 링크 전체가 `variables.followup_token`만으로 재구성되므로
  이게 사실상 유일한 실질적 게이트였음.
- **LOW** x2: `runDueRetries`의 fail-closed 가드가 `variables.
  followup_token` 누락을 못 잡음; `fallbackChannelMapForProvider`가
  인식 불가 provider를 SOLAPI의 비어있지 않은 맵으로 fail-open 처리(게다가
  스토어 생성 시점에 한 번만 고정되어 있어 런타임에 provider가 바뀌면
  기존 레코드가 새 provider 맵으로 잘못 평가될 수 있었음).

**수정**(commit `0db44b5`): 두 라우트 모두 기존 공개 GET 라우트가 쓰는
동일한 읽기 전용 `store.resolveFollowUpSession(token)`으로 토큰이 실제
그 visit_id 것인지 확인(불일치/미해결 시 400, 레코드는 전혀 건드리지
않음); `runDueRetries` 가드에 `variables.followup_token` 존재 확인
추가; `fallbackChannelMapForProvider`의 인식 불가 provider 기본값을
BizM의 빈 맵으로 변경 + `attemptSend`에서 스토어 레벨이 아닌
`record.provider` 기준으로 매번 조회하도록 변경. 이 과정에서 기존
`tests/messaging.spec.mjs`/`tests/audit-registry.spec.mjs`의 수동 재시도
테스트 일부가 실제로는 한 번도 발급되지 않은 가짜 토큰을 `link`에
써왔다는 것도 드러나 실제 토큰을 재사용하도록 함께 수정, 새 회귀
테스트(큐/재시도 양쪽의 visit 불일치 거부, 거부된 재시도가 레코드를
건드리지 않음을 확인)도 추가.

**2차 독립 리뷰**(별도 subagent 호출, `model:opus`, 커밋 `0db44b5`
대상, 1차와 컨텍스트 공유 없음): `resolveFollowUpSession`이 반환할 수
있는 모든 경로(형식 오류/미존재/visit_id 불일치/throw)를 직접 추적,
`test:messaging` 103/103·`test:messaging-bizm` 25/25·
`test:public-followup-url` 10/10·`test:audit-registry` 88/88를 직접
재실행해 확인 — **CLEAN 판정(남은 HIGH/MEDIUM 없음)**. LOW 관찰 1건만
발견: `record.provider`의 기본값이 여전히 `'SOLAPI'`라서, `.provider`를
전혀 설정하지 않는(가상의) transport는 라벨도 SOLAPI로 찍히고 그 결과
SOLAPI의 비어있지 않은 폴백 맵을 그대로 받는 end-to-end fail-open이
남아 있었음(현재 실제 두 provider 모두 `.provider`를 항상 설정하므로
악용 불가하지만, 일관성 문제) — 즉시 수정해 기본값을 `'BIZM'`으로
통일(같은 세션에서 반영, 재검증: `tsc`/`test:messaging` 103/103·
`test:messaging-bizm` 25/25·`test:all`(exit 0)·pytest 80/80·FROZEN 0
lines 전부 통과).

**결론**: BizM 메시징 배치는 실제 독립 `model:opus` 리뷰(호출 증거:
두 차례의 별도 subagent 호출, 각각 읽기 전용으로 diff를 직접 읽고
검증 명령을 실제 실행) 기준 CLEAN. 남은 라이브 발송 요구사항은
BizM 실제 자격증명/템플릿 승인, 그리고 실제 프로덕션 host/backend
설정으로 좁혀진다 — 코드 측 작업은 이 배치 범위에서 완료.

## Completed — BizM 계약 검증 게이트 (HIGH 수정, 이번 세션)

**배경(오너의 두 번째 독립 검수, PR #24 코멘트)**: 오너가 HEAD `60bfdc1`
(위 CLEAN 판정 시점의 HEAD)의 `server/bizmAdapter.js`를 직접 다시
검토해 실제 프로덕션 위험을 발견 — `resolveBizmProviderState()`가
`BIZM_API_KEY`+`BIZM_SENDER_KEY`만 있으면 즉시 LIVE로 전환되는데, 이
어댑터 자신의 헤더가 "wire format UNVERIFIED"라고 명시하고 있음에도
그렇다. 즉 **자격증명만 등록하면 검증되지 않은 프로토콜로 실제 환자
트래픽이 나갈 수 있는 구조적 결함**(HIGH). 오너는 BizM 공식
result-code 문서(1차 문서 접근 — 이 샌드박스가 아니라 오너 본인 접근)를
근거로 다음도 함께 지적: 실제 요청 body는 JSON 객체가 아니라 **JSON
배열**이어야 함(`E100 InvalidJsonArray`), `profile`/템플릿 코드/실제
렌더링된 메시지 본문/<=20자 `msgId`/SMS 폴백 필드가 실제 계약에
존재함(`E102`~`E125`), 인증은 추측한 `Authorization: Bearer`가 아니라
`userid` 요청 헤더 방식(BizM 공식 개발 문서 확인).

**수정(`server/bizmAdapter.js` 전면 재작성)**:
1. **게이트 분리(핵심 수정)**: 기존 3-state를 4-state로 확장 —
   `PENDING_CREDENTIALS` / **`PENDING_CONTRACT`**(신규) / `MOCK` / `LIVE`.
   자격증명이 전부 있어도 사람이 명시적으로
   `SAMINDANG_BIZM_CONTRACT_VERIFIED='true'`를 설정하지 않으면
   `PENDING_CONTRACT`에 머물고, 이 상태는 `PENDING_CREDENTIALS`와
   동일하게 mock transport만 반환 — 자격증명만으로는 절대 LIVE에
   도달할 수 없다. 이 플래그는 코드가 자동으로 판단할 수 없고, 사람이
   BizM 인증된 콘솔/문서로 직접 대조 확인한 뒤에만 켜야 한다.
2. `BIZM_USER_ID`를 새 필수 자격증명으로 추가(오너 확인된 `userid`
   헤더 값), 라이브 전송 시 `Authorization: Bearer` 추측을 제거하고
   `userid` 헤더만 전송(`BIZM_API_KEY`의 실제 역할은 여전히 미확인이므로
   추측된 위치에 절대 넣지 않음 — 틀린 헤더를 발명하는 것이 자격증명을
   아직 배치하지 않는 것보다 위험하다고 판단, 대신 게이트 조건에는 계속
   포함해 모든 자격증명이 실제로 발급된 뒤에만 LIVE 도달 가능하게 유지).
3. 요청 body를 JSON 배열로 변경, 항목 필드를
   `profile`/`tmplCode`/`phn`/`message`(렌더링된 실제 텍스트)/
   `msgId`/`variables`로 구성 — 정확한 키 철자는 여전히 미확인(결과
   코드 이름의 가장 직접적인 해석일 뿐)이라고 헤더에 명시.
4. **provider-level idempotency**: `record.message_id`(UUID)에서
   결정적으로 유도한 <=20자 `msgId`(`sha256(message_id).slice(0,20)`)를
   매 전송에 포함 — 같은 메시지의 재시도는 항상 같은 msgId를 BizM에
   제시하므로, BizM의 실제 `E109 DuplicatedMsgId` 시맨틱이 맞다면
   provider 쪽에서도 이중 발송을 막는 두 번째 방어선이 생긴다. 이를 위해
   `messagingStore.js`의 `attemptSend`가 `resolvedTransport.send()`
   호출에 `messageId`를 새로 threading.
5. SMS/LMS 폴백은 여전히 미구현·`FALLBACK_CHANNEL={}` 유지 — 오너 지시
   그대로 "실제 계약이 검증된 뒤에만" 구현하기로 결정, BizM API에 SMS
   필드가 실제로 존재한다는 근거가 있어도 지금 구현하지 않음.
6. 웹훅 콜백은 여전히 이 서버 자체의 HMAC placeholder(BizM 실제 콜백
   계약 아님, 헤더에 이미 명시) — 변경 없음. LIVE가 새 게이트로 막혀
   있으므로 실제 `mockbizm_` 아닌 진짜 provider_message_id가 존재할 수
   없어, 가짜 콜백이 실제 발송과 혼동될 위험도 구조적으로 없음.

**타입/테스트**: `src/messaging/types.ts`의 `MessagingProviderState`에
`'PENDING_CONTRACT'` 추가. `tests/messaging-bizm.spec.mjs`에 4-state
전이 전체(신규 8개 assertion) + `globalThis.fetch` stub으로 실제
LIVE 코드 경로의 요청 모양을 검증하는 새 섹션(신규 17개 assertion:
JSON 배열, `userid` 헤더, `Authorization` 헤더 부재, `msgId` <=20자,
msgId 결정성, raw token이 msgId에 섞이지 않음 등) 추가 — 네트워크는
전혀 사용하지 않음(같은 파일 안에서 이미 fetch 응답을 stub).

**검증**: `npx tsc -b --force` clean, `npm run test:messaging-bizm` 46/46,
`npm run test:all`(exit 0), `npm run build`/`build:preview`, `tablet core`
pytest 80/80, FROZEN diff 0 lines — 전부 통과. 커밋 `660f5e2`로 푸시.

## Completed — BizM 계약 게이트 1차 독립 리뷰 + 오너 3차 증거 반영 (이번 세션)

**1차 독립 `model:opus` 리뷰**(실제 subagent 호출, 커밋 `660f5e2` 대상,
읽기 전용): 핵심 안전 수정(자격증명만으로는 LIVE 도달 불가)이 모든
호출 경로에서 실제로 성립함을 직접 코드 추적으로 확인 — HIGH/MEDIUM
없음, LOW 5건 + NIT 2건만 발견. 오너가 같은 시점에 PR 코멘트로 3차
증거(현재 유지보수 중인 `bizm` 2.5.1 서드파티 SDK — "SSOT 아님, 검색
힌트일 뿐"이라고 오너 스스로 명시 — 가 독립적으로 동일 프로덕션
host+path+`userid` 헤더 조합에 도달, 필드명 `tmplId`/`msg`/
`message_type` 제시)를 추가 제공 — 같은 수정 라운드에서 함께 반영.

**수정(`server/bizmAdapter.js`)**:
- 필드명을 3차 증거 기준으로 갱신: `tmplCode`→`tmplId`, `message`→`msg`,
  신규 `message_type: 'AT'` 필드 추가(필드 존재는 근거 있음, 값 'AT'
  자체는 이 페이로드에서 가장 근거가 약한 추측이라고 인라인 주석에
  명시).
- **LOW #4 수정(fallback msgId 충돌)**: `deriveBizmMsgId`가 이제
  `message_id`뿐 아니라 channel도 함께 해시 — 같은 시도 내 원본 채널과
  폴백 채널이 서로 다른 msgId를 받도록 해, 향후 실제 BizM SMS 계약이
  확인되어 폴백이 구현될 때 BizM 자신의 E109 DuplicatedMsgId가 정상
  전달되지 않은 폴백을 "중복"으로 오판·거부하는 것을 방지. 지금은
  BizM FALLBACK_CHANNEL이 비어 있어 도달 불가하지만 나중에 조용히
  터지지 않도록 지금 고침.
- **LOW #3 수정(잠재 crash)**: `messageId`가 누락되면 이전에는
  `createHash().update(undefined)`가 uncaught로 throw해 레코드가
  영원히 SENDING에 갇힐 수 있었음(현재 실제 호출부는 항상 messageId를
  주므로 도달 불가) — 이제 `bizm_missing_message_id`로 명시적으로
  fail-closed.
- **LOW #1 수정(stale 문서)**: `messagingTransport.js`의
  `resolveMessagingProviderState` 주석이 여전히 "tri-state"라고
  써 있던 것을 PENDING_CONTRACT 존재를 명시하도록 갱신.
- **LOW #5 수정(공허한 테스트 단언)**: msgId가 raw token을 "포함하지
  않는다"는 약한 체크 대신, 실제 sha256 공식과 정확히 일치하는지
  독립적으로 재계산해 단언하도록 강화. 채널 스코핑·messageId 누락
  가드에 대한 신규 테스트도 추가(`tests/messaging-bizm.spec.mjs`,
  46→51 assertion).
- LOW #2(`MessagingProviderState`가 TS 쪽에서 아무도 소비하지 않음)와
  LOW #6(헤더 존재 체크가 대소문자 case-sensitive) — #6은 테스트에서
  대소문자 무관 체크로 이미 함께 개선, #2는 실제 결함이 아니라
  관찰이므로 별도 코드 변경 없음.
- 헤더의 rounds 2-3 근거 구분을 CONFIRMED(1차 소스)/CORROBORATED(복수
  독립 소스, 여전히 미검증)/STILL UNCONFIRMED 세 단계로 명확히 재구성.

**검증**: `npx tsc -b --force` clean, `npm run test:messaging-bizm`
51/51, `npm run test:all`(exit 0), `npm run build`/`build:preview`,
`tablet core` pytest 80/80, FROZEN diff 0 lines — 전부 통과. 커밋
`c8b9a84`로 푸시.

## Completed — BizM 계약 게이트 2차 독립 리뷰 (완료, 이번 세션)

**2차 독립 `model:opus` 리뷰**(실제 subagent 호출, 커밋 `c8b9a84`
대상, 1차 리뷰와 컨텍스트 공유 없음): 1차 리뷰의 5개 LOW 발견 사항이
전부 실제로 수정됐는지 항목별로 직접 코드 추적·재검증 — channel-scoped
msgId(`deriveBizmMsgId(messageId, channel)`)가 실제 fallback 호출부까지
정확히 전달됨을 확인, missing-messageId 가드가 crypto 호출 전에 정확히
위치함을 확인, 필드명 갱신(`tmplCode`→`tmplId`, `message`→`msg`,
`message_type` 추가)이 실제로 전송되는 리터럴임을 grep으로 확인,
신규 테스트가 `deriveBizmMsgId`를 직접 import하지 않고 sha256 공식을
독립적으로 재구현해 진짜로 tautological하지 않음을 확인. `npm run
test:messaging`(SOLAPI+공유 스토어 회귀) 103/103도 직접 재실행해 확인.
**판정: CLEAN(남은 HIGH/MEDIUM 없음)**.

LOW/NIT 3건만 발견, 즉시 반영:
- **LOW(테스트 정직성)**: "채널이 다르면 msgId도 다르다"는 크로스채널
  테스트를 추가했다고 주석에 썼지만, 실제로는 `send()` 자신이
  KAKAO_ALIMTALK 이외 채널을 msgId 계산 이전 단계에서 이미 거부하므로
  이 경계에서는 진짜 크로스채널 테스트가 애초에 작성 불가능함(SMS/LMS
  계약이 확인되지 않아 그 채널로는 `send()`가 아예 진행되지 않음) —
  주석을 정직하게 정정: 실제 안전망은 정확한 해시 공식 단언(채널을
  빠뜨리면 그 단언이 깨짐)이라고 명시, 마지막 단언은 "같은 채널
  반복 전송 시 결정성 재확인"으로 재명명(이전 단언의 중복 아님 — 같은
  transport 인스턴스에서의 반복 전송 안정성을 별도로 확인).
- **NIT**: 헤더의 "Two rounds of research" 문구가 이미 Round 3까지
  진행된 뒤에도 그대로 남아 있던 것을 "Three rounds"로 수정.
- **LOW(수용, 코드 변경 없음)**: mock transport는 `messageId` 부재를
  검증하지 않음(LIVE transport만 검증) — 실제 호출부(`attemptSend`)가
  항상 messageId를 공급하므로 매우 이론적이라고 리뷰어 스스로도 평가;
  기존 SOLAPI mock과 동일하게 mock은 프로덕션 검증 로직을 거울처럼
  복제하지 않는다는 이 저장소의 기존 관례와 일치 — 별도 수정 없음.

**검증**: `npx tsc -b --force` clean, `npm run test:messaging-bizm`
51/51, `npm run test:all`(exit 0), `npm run build`/`build:preview`,
`tablet core` pytest 80/80, FROZEN diff 0 lines — 전부 통과.

**결론**: BizM 계약 검증 게이트 HIGH 수정은 실제 독립 `model:opus`
리뷰 2회(호출 증거: 서로 다른 두 subagent 호출, 각각 읽기 전용으로
diff와 코드를 직접 읽고 검증 명령을 실제 실행) 기준 CLEAN. 오너의
3차 증거(현재 SDK corroboration)까지 전부 반영 완료. 커밋 `67b9308`로
푸시, CI/Preview green 확인 완료.

## Completed — BizM button1/응답-실패 검증 HIGH 수정 (이번 세션)

**배경(오너의 세 번째 독립 검수)**: 오너가 HEAD `67b9308`를 다시 직접
검토해 새로운 HIGH를 발견 — 이 어댑터는 `msg`와 추측성
`variables:{followup_token}` 필드를 보낼 뿐, **`button1` 객체를 전혀
보내지 않았다.** 승인된 템플릿의 환자용 캡ability(재확인 링크)는 실제로
버튼에 있는데, BizM가 미등록·미확인 방식으로 `variables`를 등록된
버튼 URL에 자동 substitute한다는 근거가 전혀 없었다 — 실제 라이브
전송이라면 K108(버튼 불일치)로 실패하거나, 최악의 경우 실제 1회용
capability가 빠진 버튼이 그대로 전달될 위험. 오너는 새 증거(현재
유지보수 중인 `bizm` 2.5.1 Ruby gem 문서)로 `button1: {name, type:'WL',
url_mobile, url_pc}`를 실제로 구성해 보낸다는 것, `smsKind`/`msgSms`/
`smsSender` provider-side SMS 필드가 존재한다는 것을 재확인 — 여전히
"SSOT 아님"이지만 기존 `variables`-only 가정이 틀렸음을 보여주기에는
충분하다고 판단.

**수정 범위(오너 지시 그대로)**:
1. `PENDING_CONTRACT` 게이트는 그대로 유지(변경 없음).
2. **`link`(1회용 재확인 URL 원문)를 서버 파이프라인 전체에 새로
   threading**: `server/index.js`의 큐/재시도 라우트 → `messagingContact
   Cache` → `messagingStore.js`의 `queueRevisitMessage`/`attemptSend`/
   `retryMessage`/`runDueRetries` → `resolvedTransport.send()`까지.
   `bizmAdapter.js`의 라이브 `send()`가 이제 `link`를 받아 `button1.
   url_mobile`/`url_pc`에 그대로 렌더링(transient, 저장/로그 없음).
   `link` 누락 시 `bizm_missing_link`로 fail-closed(버튼 없는/깨진
   전송보다 안 보내는 게 낫다).
3. `variables` 필드는 라이브 요청에서 완전히 제거(미확인 자동
   substitution 가정에 의존하지 않음). 대신 `button1`이 실제 캡ability
   전달 경로.
4. **메시지 본문 분리**: 기존 공유 `text`(SMS/LMS용, 링크를 인라인
   포함)를 BizM `msg` 필드에 그대로 쓰지 않고, BizM 전용 정적·링크-없는
   텍스트(`BIZM_MESSAGE_TEXT`)를 새로 도입 — 원문 URL은 오직
   `button1`에만 존재해야 K105(템플릿/메시지 불일치) 위험과 raw token의
   `msg` 유출을 동시에 피할 수 있음(정확한 승인 템플릿 문구는 여전히
   미확인 placeholder로 명시). 신규 privacy 테스트로 raw token이
   `button1.url_mobile/url_pc`에만 존재하고 `msg`/`msgId`/그 외 필드
   어디에도 없음을 직접 검증.
5. **응답 실패 코드 검사 추가**: HTTP 200이라도 응답 배열 첫 항목의
   `code`/`result`/`resultCode`/`result_code` 값이 BizM 실제 result-code
   모양(`[A-Z]\d{3}`, 예: K108/E1xx)과 일치하면 무조건 실패로 처리 —
   기존에는 `providerMessageId`류 필드 존재 여부만 봤음. 정확한 SUCCESS
   코드 값은 여전히 미확인이므로 "성공 판정"이 아니라 "실패 모양 매칭"
   방식으로 구현(진짜 성공 응답이 이 패턴에 우연히 걸리지 않음을
   회귀 테스트로 확인 — `code:'0000'`은 4자리라 패턴에 안 걸림).
6. SMS/LMS 폴백은 변경 없음(여전히 미구현, `FALLBACK_CHANNEL={}`).
7. `src/lib/publicFollowUpUrl.ts`의 헤더 주석도 "버튼 URL은 템플릿
   승인 시점에 한 번만 등록된다"는 이제 틀린 것으로 밝혀진 가정을
   정정(안정적 base URL 요구사항 자체는 여전히 유효 — BizM 템플릿
   심사가 고정된 도메인+경로를 요구하는 것은 URL이 정적으로
   substitute되든 매 요청 button1으로 구성되든 마찬가지).

**테스트**: `tests/messaging-bizm.spec.mjs`에 button1 구성/필드
검증(name/type/url_mobile/url_pc), variables 필드 완전 부재 확인,
raw token이 button1 밖 어디에도 없음을 확인하는 privacy 테스트,
link 누락 시 fail-closed 테스트, HTTP 200+K108 실패 코드 검사 테스트,
진짜 성공 응답의 false-positive 없음 테스트, `messagingStore.js` 레벨의
`link` threading(큐+수동 재시도 양쪽) 테스트 추가 — 46→67 assertion.
`tests/messaging.spec.mjs`(SOLAPI+공유 스토어 HTTP 통합) 103/103도
회귀 없이 그대로 통과.

**1차 독립 `model:opus` 리뷰(완료) + 수정**: 실제 fresh subagent 호출로
`af9ef91`(button1/link/응답-실패 검사 구현) 검수. 발견 사항:
- **MEDIUM**: `runDueRetries`의 `link` threading에 대한 실질적 테스트
  커버리지가 전무했음 — 기존 유일한 호출은 문자열 하나만 넘기는
  resolveContact라서 fail-closed 분기만 trivially 맞았을 뿐, 성공
  경로를 전혀 증명하지 못했음. **수정**: `tests/messaging-bizm.spec.mjs`에
  새 "Part 4b" 블록 추가 — 스토어가 관리하는 on-disk JSON 레코드 파일을
  직접 backdate해 `next_retry_at`을 과거로 만드는 방식으로 실제
  `runDueRetries` 성공/실패 경로를 강제 재현: (a) `link` 포함 완전한
  contact → 자동 재시도가 실제 SENT로 성공하고 transport가 `link`를
  실제로 받았음을 확인, (b) `link`만 빠진 contact → transport를 아예
  호출하지 않고 `recipient_unresolvable`로 fail-closed함을 확인.
  46→67→78 assertion(신규 11개는 모두 위 (a)/(b) 경로).
- **LOW** (수정): `server/index.js`/`server/messagingStore.js`의
  `variables.followup_token` 관련 주석이 "BizM이 필요로 한다"는 이제
  틀린 서술을 그대로 두고 있었음 — "SOLAPI 전용, BizM은 더 이상
  `variables`를 전혀 사용하지 않음"으로 정정.
- **LOW** (accepted residual risk, 미수정): 실제 BizM SUCCESS 코드
  모양이 여전히 미확인이라, `BIZM_RESULT_FAILURE_CODE_RE`가 가상의
  `[A-Z]\d{3}` 모양 성공 코드(예: 'A000')를 오탐할 이론적 가능성은
  남아 있음 — 헤더에 명시적으로 disclosed, `PENDING_CONTRACT` 게이트가
  실거래 실행을 막고 있어 계정 접근 없이는 실제 성공 코드를 확인할
  방법이 없음. 추가 수정 보류.
- **LOW** (pre-existing, out of scope, 미수정): 큐 라우트의
  `messagingContactCache.set()`이 dedup 체크보다 먼저 일어나 같은
  visit/patient 내 토큰 재발급 재-POST가 아직 QUEUED인 레코드의 캐시된
  `link`를 덮어쓸 수 있음 — cross-patient 누출 없음, 감사-흔적 불일치
  수준. 이번 배치 범위 밖으로 판단.
- **NIT** (미수정, 불필요 판단): false-positive-safety 테스트가 4자리
  코드 하나만 쓰는데, 'A000' 모양 케이스를 추가해도 위에서 이미 disclosed된
  LOW를 재확인하는 것뿐이라 생략.

**검증(1차 리뷰 수정 반영 후)**: `npx tsc -b --force` clean,
`npm run test:messaging-bizm` 78/78, `npm run test:messaging` 103/103
(회귀 없음), `npm run test:all`(exit 0), `npm run build`/`build:preview`,
`tablet core` pytest 80/80, FROZEN diff 0 lines — 전부 통과.
(`2f83963` push, `c491390` HANDOFF 갱신 push.)

**2차(클로징) 독립 `model:opus` 리뷰(완료) + 수정**: 실제 fresh subagent
호출(148k 토큰, 21 tool call, ~4분)로 push된 HEAD(`c491390`)를 처음부터
재검수. 전체 판정: **NOT CLEAN — MEDIUM 2, LOW 3, NIT 2**. 핵심 기능
(button1 구성, link threading, fail-closed 가드, FROZEN 범위)은 정확하다고
확인했지만, 이 fix가 만든 근본적 변화 — **"환자에게 실제 전달되는 캡ability는
이제 `follow_up_token`이 아니라 `link`"** — 를 route 검증과 테스트 양쪽이
따라가지 못한 두 지점을 발견:

1. **MEDIUM (수정)**: `server/index.js`의 큐 라우트는 `follow_up_token`이
   visitId에 속하는지는 검증했지만, `link`에 실제로 임베딩된 토큰이 그
   `follow_up_token`과 같은지는 전혀 검증하지 않았음 — retry 라우트는
   이미 `extractFollowUpTokenFromLink(link)`로 토큰을 link에서 직접
   유도해서 이 문제가 구조적으로 없는데, 큐 라우트만 `follow_up_token`과
   `link`를 독립된 두 body 필드로 받아 각자 다른 정도로만 검증하던
   비대칭이 원인. 구체적 실패 시나리오: 오래된 DoctorView 상태가 visit
   B의 `link`를 들고 있는 채로 visit A의 새 `follow_up_token`을 가져와
   큐에 넣으면, 토큰은 A로 검증 통과하지만 button1에는 B의 살아있는
   1회용 링크가 그대로 나가 환자 A가 환자 B의 문진 세션에 들어갈 위험.
   **수정**: `isValidFollowUpLink(link)` 체크 직후,
   `extractFollowUpTokenFromLink(link) !== followUpToken` 검사를
   추가(retry 라우트의 기존 패턴과 동일한 논리) — 이제 뒤이은
   `resolveFollowUpSession(followUpToken).visit_id !== visitId` 체크가
   전이적으로 link까지 검증하게 됨.
2. **MEDIUM, 테스트 정직성 (수정)**: `tests/messaging-bizm.spec.mjs`
   Part 2b의 모든 `liveTransport.send(...)` 호출이 `text`를 전혀
   넘기지 않아서, "msg는 caller의 text가 아니라 BizM 정적 텍스트"라는
   assertion이 실제로는 `send()`가 `text`를 구조적으로 아예 안 읽는다는
   사실 때문에 통과했을 뿐 — 미래에 누군가 `msg: text ?? BIZM_MESSAGE_TEXT`
   같은 그럴듯한 리팩터를 넣어도 이 테스트가 여전히 통과했을 것(프로덕션
   경로 `attemptSend`는 항상 raw link가 인라인된 `text`를 넘기므로 실제
   PHI 유출로 이어짐). **수정**: 첫 `send()` 호출에 프로덕션과 동일한
   모양의 `CALLER_SUPPLIED_TEXT`(TEST_LINK 인라인)를 실제로 넘기고,
   `item.msg !== CALLER_SUPPLIED_TEXT` assertion을 추가해 caller의 text가
   진짜로 무시됨을 증명.
3. **LOW (accepted, 미수정)**: `BIZM_RESULT_FAILURE_CODE_RE`가 미확인의
   실제 SUCCESS 코드(예: 'A000' 모양)를 오탐할 이론적 가능성 — 1차 리뷰와
   동일한 LOW, 헤더에 이미 disclosed.
4. **LOW (accepted, 미수정)**: 동일 `MessageRecord`의 4번 재시도 전부가
   같은 msgId를 쓰는 것은 진짜 중복전송 방지(E109)뿐 아니라, 애매한
   응답(`provider_missing_message_id`, retryable) 이후의 정당한 재시도까지
   E109로 막을 수 있음 — 의료 시스템으로서는 안전한 방향(전송 안 됐다고
   과다 주장하지 않음)이지만 헤더에 이 트레이드오프를 명시하는 게 좋다는
   지적. 다음 라운드 documentation-only 후속으로 기록.
5. **LOW (pre-existing, out of scope, 미수정)**: 토큰 재발급/무효화가
   이미 QUEUED 상태인 `MessageRecord`를 건드리지 않아 죽은 링크가
   그대로 나갈 수 있음 — `link`로 바뀌기 전에도 `text` 경로로 동일하게
   존재하던 문제, 이번 배치가 새로 만든 게 아님.
6. **NIT (accepted, 미수정)**: `runDueRetries` 가드가 BizM이 더 이상
   쓰지 않는 `variables.followup_token`을 여전히 요구 — 오늘은 두
   라우트 모두 항상 이 필드를 채우므로 fail-closed로 안전하지만, 향후
   `variables` 완전 제거 시 자동 재시도가 전부 `recipient_unresolvable`로
   막힐 수 있는 결합.
7. **NIT (pre-existing, out of scope, 미수정)**: 재시도 라우트가
   `messagingContactCache.set()`을 `retryMessage()` 실패 가능성보다
   먼저 실행 — 실패해도 레코드가 terminal이라 sweep이 안 집어가서 실해는
   없음.

**MEDIUM #1/#2 수정에 대한 회귀 처리**: 큐 라우트에 새 검증을 추가하니
`tests/messaging.spec.mjs`(SOLAPI HTTP 통합), `tests/crm-store.spec.mjs`
(purge-full seed), `tests/audit-registry.spec.mjs`(감사 로그 seed) 세
파일에서 `link`가 `follow_up_token`과 의도적으로 다른 placeholder
토큰을 쓰던 자리들이 전부 새 400으로 막혀 실패 — 각 파일의 성공 경로
호출을 `linkFor(token)`(또는 동등한 인라인)로 토큰을 맞추도록 수정하고,
`tests/messaging.spec.mjs`에는 이 정확한 시나리오(follow_up_token은
맞는데 link가 다른 토큰을 담은 경우)를 검증하는 전용 테스트를 신규
추가(`validation: link embeds a DIFFERENT token than follow_up_token ->
400`) — 기존에 실패 경로 검증용으로만 쓰이던 `LINK` 상수를 이 신규
테스트에 재사용.

**2차 리뷰 수정에 대한 확인 재검수(완료)**: 2차 리뷰가 찾은 MEDIUM 2건의
수정(`13f5794`)이 실제로 문제를 닫았는지 검증하는 좁은 범위의 3차
독립 `model:opus` 호출(108k 토큰, 22 tool call, ~3분) — 두 MEDIUM 모두
**FULLY FIXED** 판정. 큐 라우트 검증은 route의 유일한 진입 경로를
전부 커버하고(dedup 경로 포함), `extractFollowUpTokenFromLink`의 정규식이
실제 토큰 형식(`randomBytes().toString('base64url')`, percent-encoding
불필요)과 클라이언트 파서(`src/App.tsx`)의 파싱 방식 둘 다와 일치함을
직접 fetch로 프로빙해 확인. retry 라우트는 애초에 token을 link에서
유도하므로 구조적으로 이 취약점이 불가능함도 재확인. `text`
assertion은 실제로 `msg: text ?? BIZM_MESSAGE_TEXT` 같은 가상의 회귀를
추적해 실패하게 됨을 확인. 세 테스트 파일(`messaging.spec.mjs`,
`crm-store.spec.mjs`, `audit-registry.spec.mjs`)의 5개 변경 호출 모두
실제 서버를 부팅해 응답 에러 문자열까지 직접 대조, 의도한 분기에
정확히 도달함을 확인. HIGH/MEDIUM 신규 발견 없음.

이 재검수가 새로 찾은 사소한 항목(수정 완료 1건 + accepted 2건):
- **LOW (수정)**: `tests/messaging-bizm.spec.mjs`의 `CALLER_SUPPLIED_TEXT`
  주석이 "매칭 production shape 정확히"라고 주장했지만, 실제
  `buildRevisitMessageText()`(server/index.js, closure-scoped라 import
  불가)의 3줄 출력과 달리 중간 줄(`아래 링크를 눌러...`)이 빠져 있었음 —
  assertion 자체의 유효성(raw link가 인라인되는가)에는 영향 없지만
  과장된 주장이었음. **수정**: 리터럴을 실제 3줄 출력과 정확히 일치하게
  고치고, "import할 수 없어 복제한 것이니 원본이 바뀌면 같이 갱신"으로
  주석 정정.
- **NIT (accepted, 미수정)**: 5개 큐 라우트 검증 테스트가 `status===400`
  만 확인하고 정확한 error 메시지는 확인하지 않음 — 향후 체크 순서가
  바뀌어도 "틀린 분기에서 우연히 400"을 못 잡을 수 있음.
- **LOW (accepted, pre-existing, out of scope, 미수정)**: dedup(200)
  큐 호출에서 `messagingContactCache.set()`이 `queueRevisitMessage()`
  보다 먼저 실행 — 같은 visit에 다른(유효한) 토큰으로 두 번째 호출이
  오면 캐시된 link가 첫 토큰 기준 `follow_up_token_hash`와 어긋날 수
  있음. cross-patient 누출 아님, audit-일관성 수준.

**최종 검증(comment fix 반영 후)**: `npx tsc -b --force` clean,
`npm run test:messaging-bizm` 79/79, `npm run test:messaging` 104/104,
`npm run test:all`(exit 0), `npm run build`/`build:preview`,
`tablet core` pytest 80/80, FROZEN diff 0 lines — 전부 통과. 세 번의
진짜 독립 `model:opus` 리뷰(1차 CLEAN+후속수정, 2차 NOT CLEAN+MEDIUM
2건 수정, 3차 확인 재검수 FULLY FIXED+사소한 수정 1건) 완료 — 오너
지시 7번 항목(Sonnet 구현 → 독립 리뷰 → 수정 → 독립 클로징 리뷰)
충족. **CLEAN.** push 완료 후 PR #24에 클로징 상태 코멘트 게시 예정.

## Completed — 메시지<->캡ability 무결성 배치 (진행 중, 이번 세션)

**배경(오너가 PR 코멘트로 직접 지시)**: button1/응답-실패 HIGH가
CLEAN으로 닫힌 직후, 오너가 저장소 전체를 우선순위 재검토해 새
HIGH를 지목 — `POST /api/visits/:visitId/messages`가
`messagingContactCache.set(visitId, {...})`를
`messagingStore.queueRevisitMessage()`보다 먼저 호출하는데,
`queueRevisitMessage()`의 dedup은 `(visit_id, 'REVISIT_LINK')` 키로만
판단하고 재요청의 `follow_up_token`이 기존 레코드와 같은 캡ability인지
전혀 확인하지 않음 — 같은 visit이 다른(유효한, 예: 재발급된)
토큰/링크로 다시 제출되면, durable 레코드는 OLD `follow_up_token_hash`
를 유지한 채 in-memory 재시도 캐시만 NEW 링크/토큰으로 덮어써져서,
나중 자동 재시도가 레코드의 hash/감사 의미와 어긋나는 캡ability를
보낼 수 있음. cross-patient 누출은 아니지만 message<->capability
무결성, dedup 의미론, 재시작/실패 추론, 감사 진실성을 깨는 결함.

**수정 범위(오너 지시 7개 항목)**:
1. `server/messagingStore.js`의 `queueRevisitMessage()`: dedup 히트 시
   `hashToken(followUpToken) !== existing.follow_up_token_hash`면
   `MessagingConflictError`를 던져 fail-closed — 일치할 때만 기존
   idempotent 반환 유지. raw token은 에러 메시지에도 노출 안 함.
2. `server/index.js`의 큐 라우트: `messagingContactCache.set()`을
   `queueRevisitMessage()` 호출 **뒤**로 옮기고 전체를 try/catch로
   감싸 `MessagingConflictError`를 기존 `mapMessagingError`로 409
   매핑 — 충돌 시 캐시는 완전히 안 건드림(구조적으로 그 라인에
   도달 불가).
3. 회귀 테스트: (a) `tests/messaging.spec.mjs` Part 1(store 직접 호출)에
   같은 visit + 다른 token → `MessagingConflictError` 던짐 + 기존
   레코드가 hash/version/updated_at/attempt_count 전부 불변임을 확인하는
   테스트 추가. (b) Part 2(HTTP)에 `POST .../follow-up-session/reissue`로
   진짜 다른 유효 토큰을 발급받아 같은 visit에 큐 요청 → 409 + 정확한
   에러 문자열 + durable 레코드(hash 포함) 완전 불변을 확인하는 테스트
   추가. 자동 재시도가 "캐시가 안 건드려졌으니 ORIGINAL 튜플을 쓴다"는
   부분은 코드 구조(디퍼드 캐시 쓰기 + 조기 throw)로 결정론적으로
   보장됨을 확인 — 실제 20초 타이머 자체를 기다리는 종단 테스트는
   과도한 비용 대비 가치 판단 하에 추가하지 않음(HANDOFF에 명시).
4. 기존 리뷰가 지적한 "5개 큐 라우트 400 테스트가 상태코드만 확인"
   NIT 해소: `linkTokenMismatch`/`unknownPatient`/`mismatched`/
   `wrongVisitToken`/`neverIssuedToken` 전부 정확한 `error` 문자열까지
   확인하도록 강화.
5. cancel/manual-retry의 캐시 삭제 경로 재점검: `retryMessage()`가
   throw(이미 SENT/DELIVERED/CANCELLED, max attempts 도달)하는
   케이스에서 retry 라우트가 `messagingContactCache.set()`을 호출 후
   호출하는 순서 문제 자체는 있으나, 이 store의 dedup 키가
   visit_id당 정확히 하나의 레코드만 허용하므로 그 캐시 엔트리는
   같은(이미 terminal인) 레코드에만 대응 — terminal 레코드는
   `runDueRetries`가 절대 재처리하지 않으므로 실질적 위험 없음(구체적
   결함 아님, "no broad rewrite" 지시에 따라 변경 안 함). `retryMessage()`
   자체가 재공급된 새 토큰으로 `follow_up_token_hash`를 갱신하지 않는
   것도 확인했으나, 이는 오너의 명시적 7항목 범위(큐 라우트의 dedup
   경로) 밖의 별도 설계 판단 영역으로 판단 — 이번 배치에서 손대지
   않음(HANDOFF에 명시적으로 기록, 필요시 별도 후속 항목으로).
6. BizM `PENDING_CONTRACT` 게이트, SMS/LMS OFF, identity policy, Test 0
   PENDING, Care Gap OFF 등 전부 변경 없음.
7. FROZEN `src/spec/*Logic.ts`/`*Adapter.ts` zero-diff 유지.

**검증(구현 직후, 1차 리뷰 이전)**: `npx tsc -b --force` clean, `npm
run test:messaging` 122/122, `npm run test:messaging-bizm` 79/79(무관,
회귀 없음), `npm run test:crm-store` 230/230, `npm run
test:audit-registry` 88/88, `npm run test:all`(exit 0), `npm run
build`/`build:preview`, `tablet core` pytest 80/80, FROZEN diff 0
lines — 전부 통과. (`2ef971f` push.)

**1차 독립 `model:opus` 리뷰(완료) + 수정**: 실제 fresh subagent
호출(153k 토큰, 28 tool call, ~8분)로 `2ef971f` 검수. 큐 라우트의
hash-비교/캐시-defer 핵심 수정 자체는 정확하다고 확인했지만, 이 배치가
"의도적으로 손대지 않기로 판단"했던 item 5(cancel/manual-retry 재점검)
영역에서 실제로 같은 결함 클래스(follow_up_token_hash 드리프트)가
manual retry 경로에도 존재함을 발견 — MEDIUM 2건:

1. **MEDIUM (수정)**: `retryMessage()`가 doctor가 재발급된(다른) 토큰을
   재공급해 수동 재시도할 때 — 실제로 그 새 토큰/링크로 진짜 전송이
   나가는데도 — `follow_up_token_hash`를 전혀 갱신하지 않아서, 큐
   라우트의 dedup-hash 수정이 막으려던 것과 정확히 같은 종류의
   드리프트가 "가장 실제 전송이 일어나는" 경로에 그대로 남아있었음.
   **수정**: `attemptSend(messageId, {..., followUpToken})`가
   SENDING 전환 원자적 쓰기와 함께 `followUpToken`이 주어지면
   `record.follow_up_token_hash`를 그 값의 해시로 갱신(전송 성공 여부와
   무관하게 — attempt_count/last_attempt_at과 동일하게 "이 시도가 실제로
   무엇을 썼는지"를 정직하게 기록). `retryMessage`가 이를 통과시키고,
   `server/index.js`의 retry 라우트가 이미 계산해둔
   `variables.followup_token`을 그대로 넘기도록 배선. 자동 재시도
   (`runDueRetries`)는 이 파라미터를 절대 넘기지 않음 — 캐시된 동일
   튜플을 재사용할 뿐이라 갱신할 새 정보가 없음.
2. **MEDIUM (테스트 정직성, 수정)**: Part 2의 큐-충돌 테스트가 이미
   SENT(terminal) 레코드를 사용했는데, `messagingContactCache`는 레코드가
   QUEUED이 아니게 되는 순간 삭제되므로, 그 테스트는 애초에 캐시가
   비어있는 상태에서 실행되어 "캐시 오염 방지"를 실제로는 전혀
   검증하지 못하고 있었음(오너 item 3의 "자동 재시도가 여전히 ORIGINAL
   튜플을 쓴다" 요구사항 미검증). **수정**: 격리된 별도 서버 인스턴스로
   새 Part 3 블록 추가 — phone suffix `9998`로 레코드를 QUEUED 상태로
   유지(캐시가 실제로 살아있음), reissue로 진짜 다른 유효 토큰을 받아
   충돌시킨 뒤, `SAMINDANG_MESSAGE_RETRY_INTERVAL_MS`(신규, 기본값
   20초 그대로, 테스트에서만 50ms로 축소) + on-disk `next_retry_at`
   backdating(messaging-bizm.spec.mjs Part 4b와 동일 기법)으로 실제
   자동 재시도 sweep을 강제 발동시켜, 그 재시도가 여전히 ORIGINAL
   전화번호(9998 결정론적 실패)를 썼음을 — 거부된 대체 전화번호로
   전송되지 않았음을 — 직접 관찰로 증명.
3. **LOW (accepted, 미수정)**: retry 라우트가
   `messagingContactCache.set()`을 `retryMessage()` 실패 가능성보다
   먼저 호출 — 이 store의 dedup 키가 visit_id당 정확히 하나의 레코드만
   허용해서 그 캐시 엔트리는 같은(이미 terminal일) 레코드에만 대응,
   terminal 레코드는 `runDueRetries`가 재처리하지 않아 실질적 위험
   없음(latent-only로 확인).
4. **LOW (accepted, 미수정)**: 큐 라우트의 idempotent replay(같은 토큰
   dedup hit)가 캐시를 동일한 데이터로만 재시딩한다는 게 코드로
   강제되어 있지는 않음 — 오늘은 호출부가 항상 같은 값을 넘기므로
   안전하지만 명시적 불변식은 아님.
5. **LOW (accepted, 미수정)**: cancel 라우트가 취소된 레코드의 캐시
   엔트리를 절대 비우지 않음 — CANCELLED는 terminal이라
   `runDueRetries`가 절대 안 건드리므로 실질적 위험 없음.
6. **NIT (accepted, 미수정)**: 새 409가 "이미 terminal인 레코드에
   reissue된 링크로 재발송할 방법이 없다"는 트레이드오프를 만드는데
   헤더에 이 트레이드오프가 명시되어 있지 않음.

findings 3-6은 오너의 "no broad rewrite" 지시와 리뷰어 자신의 권고에
따라 HANDOFF 문서화만으로 처리(코드 변경 없음).

**검증(1차 리뷰 수정 반영 후)**: `npx tsc -b --force` clean, `npm run
test:messaging` 136/136(신규: retry-hash unit 4개 + HTTP retry-hash
3개 + Part 3 cache-poisoning 종단 8개), `npm run test:messaging-bizm`
79/79, `npm run test:crm-store` 230/230, `npm run test:audit-registry`
88/88, `npm run test:all`(exit 0), `npm run build`/`build:preview`,
`tablet core` pytest 80/80, FROZEN diff 0 lines — 전부 통과.
(`87817b8` push, `a86a8cc` HANDOFF 갱신 push.)

**2차(클로징) 독립 `model:opus` 리뷰(완료) + 수정**: 실제 fresh
subagent 호출(187k 토큰, 48 tool call, ~18분)로 `a86a8cc` 검수 — 이번엔
자체적으로 mutation testing까지 수행(수정을 되돌려서 새 테스트가 실제로
실패하는지 확인). **전체 판정: CLEAN — HIGH/MEDIUM 없음.** 라운드1의
두 MEDIUM 모두 실제로 닫혔음을 mutation test로 직접 증명(`attemptSend`의
hash 갱신 줄을 지우면 → 신규 `retry-hash unit` 테스트가 즉시 실패;
캐시 defer-write를 되돌리면 → 신규 Part 3 종단 테스트가 즉시 실패).
LOW/NIT 4건, 전부 non-blocking:

1. **LOW (수정)**: retry 라우트가
   `messagingContactCache.set()`을 여전히 `retryMessage()` 호출보다
   먼저 실행 — 큐 라우트는 이미 이 순서를 고쳤는데 retry 라우트만
   남아있던 비대칭. 리뷰어가 이론적 레이스(재현은 못 했지만 추적은
   가능)를 지적: QUEUED이고 due인 레코드에 대해 doctor가 재발급 토큰
   B로 수동 재시도를 거는 바로 그 순간(line 924 실행 직후,
   `retryMessage`가 락을 잡기 전) 자동 sweep이 끼어들면, sweep이 방금
   캐시된 B 튜플로 전송을 완료해버리고, 그 후 실제 `retryMessage`
   호출은 (예: 동시에 다른 이유로) terminal/max-attempts 가드에 걸려
   `follow_up_token_hash`를 갱신하지 못한 채 끝날 수 있음 — 결과적으로
   레코드는 A를 가리키는데 실제로는 B가 전송된 상태. 확률은 극히
   낮지만(파일 read 한 줄 vs 20초 프로덕션 간격), 이 배치가 막으려는
   것과 정확히 같은 클래스의 결함이라 판단해 수정. **수정**: 큐
   라우트와 동일하게 `retryMessage()` 성공 이후로 캐시 쓰기를 이동.
2. **LOW (문서화만, 수정)**: `MessagingConflictError`가 이미 terminal인
   레코드에 대해 재발급된 토큰으로 재발송할 방법을 아예 막아버림 —
   실제 운영상 제약이지만, 이 수정 이전에도 그런 재발급은 어차피
   조용히 stale 200을 반환하며 아무것도 안 보냈으므로 회귀는 아님.
   `queueRevisitMessage()`의 헤더 주석에 이 트레이드오프를 명시.
3. **NIT (accepted, 미수정)**: `SAMINDANG_MESSAGE_RETRY_INTERVAL_MS`에
   소수(`0.5`) 같은 값을 넣으면 매우 짧은 sweep 간격이 되지만,
   `ownerLock.js`의 `requirePositiveMs`도 동일하게 소수를 허용 —
   기존 관례와 일치하므로 이번 배치에서 강화하지 않음.
4. **NIT (accepted, 미수정)**: `attemptSend`가 export되어 있어 이론상
   외부 호출자가 `retryMessage`의 terminal/max-attempts 가드를 우회해
   `followUpToken`으로 해시를 직접 덮어쓸 수 있음 — grep으로 확인한
   내부 호출부 3곳(`queueRevisitMessage`/`retryMessage`/`runDueRetries`)
   외에 실제 그런 호출자는 없음.

**최종 검증(2차 리뷰 수정 반영 후)**: `npx tsc -b --force` clean,
`npm run test:messaging` 136/136, `npm run test:messaging-bizm` 79/79,
`npm run test:all`(exit 0), `npm run build`/`build:preview`, `tablet
core` pytest 80/80, FROZEN diff 0 lines — 전부 통과. 두 번의 진짜 독립
`model:opus` 리뷰(1차 NOT CLEAN + MEDIUM 2건 수정, 2차 CLEAN +
mutation-test로 실제 검증 + LOW 1건 마저 수정) 완료 — 오너 지시
검수/역할 사이클(Sonnet 구현 → 독립 리뷰 → 수정 → 독립 클로징 리뷰)
충족. **CLEAN.**

## Completed — Medication/Herbal CRM 배치 (진행 중, 이번 세션)

**배경(오너가 PR 코멘트로 직접 지시)**: "generic Medication/Herbal CRM
loop를 조작화하되 임상 timing/제품 규칙은 창작하지 말 것" — 10개 항목
스펙(durable MedicationCourse persistence, doctor 인증 CRUD, 명시적
소스/사람 지정 due_at만 허용하는 MEDICATION_START/MID/END_CHECK task
연동, medication_start_at 변경 시 supersede/recalculate 계약, Doctor
CRM/Today Queue 압축 표면, 제품 무관 generic 처리, 기존 불변식 보존,
회귀/장애주입 커버리지, 실브라우저 QA, FROZEN zero-diff).

**구현(Sonnet)**: `src/crm/medicationCourse.ts`(타입), `server/crmStore.js`
(durable persistence: `createMedicationCourseStored`,
`createMedicationCourseCheckTaskStored`,
`shiftMedicationCourseStartStored` — intent-then-finalize 2단계 쓰기,
`medication-course:<id>` 락으로 동시 mutation 직렬화), `server/index.js`
(doctor 인증 HTTP 라우트 6개 + audit 이벤트), `src/lib/serverClient.ts` +
`src/doctor/MedicationCourseSection.tsx`(Doctor CRM UI), 회귀/장애주입
테스트(`tests/medication-course.spec.mjs`).

**1차 독립 `model:opus` 리뷰(완료) + 수정(`1df3e0e`)**: HIGH 1건
(`shiftMedicationCourseStartStored`와 `createMedicationCourseCheckTaskStored`
사이 TOCTOU — 같은 `medication-course:<id>` 락으로 닫음), MEDIUM 1건
(수동 코스 기록 재시도 시 `sourceId`가 매번 새로 생성돼 재시도 시
중복 생성 위험 — 초안당 한 번만 채번해 재사용) 수정.

**오너 2차 검수(GitHub PR 코멘트, commit `bff300c` 대상) — NOT CLEAN**:
"같은 배치 안에서 계속, 새 배치 시작 금지, merge/main push 금지" 명시.
발견 사항 2건(1건은 리뷰 시점 기준 `1df3e0e`가 이미 해결, 아래는 미해결
1건 + 이번 커밋에서 함께 발견/수정한 2건):

1. **HIGH (수정, `0d5464b`)**: `MedicationCourseSection.tsx`의
   `reloadEpisodeData` 내부 중첩 promise들이 patient/request 세대 가드
   없음 — patient A를 연 뒤 A의 course/task 응답이 도착하기 전에 B로
   전환하면, A의 늦은 응답이 B가 화면에 있는 동안 `setCourses`/`setTasks`
   를 호출할 수 있음(cross-patient stale-response leak). **수정**:
   `loadEpochRef`(useRef(0), patientUuid 변경마다 1회 증가) 도입 —
   초기 로드/중첩 course·task 읽기/네 개 mutating 액션의 reload 전부
   현재 epoch과 비교 후에만 `setState`. `DoctorView.tsx`의 기존
   `key={selectedRecord.patient_id}` 리마운트와 별개의 내부 방어선.
   신규 구조 가드 테스트 `tests/medication-course-ui.spec.mjs`(6개,
   loadEpochRef 선언/epoch 파라미터/가드 7곳/busy-release 가드 4곳/
   캡처 4곳/++ 1회 증가 확인) + 실제 Playwright 2-시나리오 QA:
   (a) A 지연 → B로 전환(B는 정상 로드) — A의 늦은 응답이 B 아래
   렌더된 적 없음, B 자체 데이터는 정상 표시. (b) A 지연 → B로 전환,
   **B 자신의 요청을 route.abort()로 진짜 실패**시킴 — A의 늦은 응답이
   B의 실패 상태 아래 fallback으로 렌더된 적 없음, 진짜
   `section.medCourse` 에러 상태(캐시/크래시 아님)가 표시됨을 확인.
2. **HIGH (이번 커밋에서 발견/수정)**: `server/index.js`
   shift-start 라우트의 `replacement_due_dates` 배열 강제변환이 배열이
   아닌 값(객체/문자열 등)을 전부 조용히 `[]`로 바꿔버려서, 뒤이은 두
   검증(`every`/중복 `reason_code` 체크)이 공허하게 통과 — 잘못된 형태의
   요청이 여전히 200과 함께 open task를 supersede함. **수정**: 원본
   미변환 값이 `null`/`undefined`가 아니면서 배열도 아닐 때 400으로
   즉시 거부, 그 이후에만 `[]` 강제변환 수행. 회귀 테스트
   `tests/audit-registry.spec.mjs`에 non-array 케이스 추가(400 확인 +
   course version 불변 확인).
3. **MEDIUM (이번 커밋에서 발견/수정)**: `createMedicationCourseCheckTaskStored`
   의 dedup이 `createTaskStored`의 공용 dedup key에 의존하는데, 이 키는
   `contactPointKey`(do_not_contact가 'IN_PERSON_ONLY'로 override)를
   포함 — check-task 생성은 `course.version`을 절대 올리지 않으므로,
   같은 `expectedVersion`+다른 `do_not_contact`로 순차 호출하면 서로
   다른 dedup key로 해시돼 같은 `(course, reason_code)`에 대해 서로
   다른 contact_mode의 task 두 개가 만들어질 수 있었음(한쪽은
   do-not-contact인데 다른 쪽이 실제로 연락 시도). **수정**:
   `createTaskStored` 호출 전에 같은 `(course_id, reason_code)`의
   non-terminal task를 먼저 조회 — 있으면 그 task의 기존 contact_mode를
   그대로 두고 `{deduped:true}` 반환, 공용 dedup 메커니즘의 contact-mode
   민감도를 이 경로에서만 우회(다른 task 타입의 기존 계약은 안 건드림).
   신규 테스트 `tests/medication-course.spec.mjs` Part 4d(5개 assertion:
   최초 생성/두 번째 호출 dedup/동일 task_id/기존 contact_mode 유지/
   디스크에 파일 정확히 1개).

**검증(이번 커밋 `0d5464b` 반영 후)**: `npx tsc -b --force` clean, `npm
run test:medication-course` 57/57, `npm run test:medication-course-ui`
6/6(신규), `npm run test:audit-registry` 106/106, `npm run
test:all`(exit 0, 전체 통과), `npm run build`/`build:preview` clean,
`tablet core` pytest 80/80, FROZEN diff 0 lines, 실브라우저 Playwright
patient A→B race QA 2-시나리오 전부 PASS(위 참고) — 전부 통과. push
완료. Clinical CRM v0.3.1 CLOSED, Test 0 PENDING, Care Gap suppression
OFF, identity policy·BizM PENDING_CONTRACT 등 기존 정책 변경 없음.
**1차 독립 `model:opus` 클로징 리뷰(완료, `0d5464b` 대상) + 수정(`d8e66d7`)**:
실제 fresh subagent 호출(약 109k 토큰, 20 tool call, ~5분)로 `0d5464b`
검수 — 세 가지 claim 전부 실제 코드 추적으로 검증(TOCTOU 우려 없음:
`createMedicationCourseCheckTaskStored`의 pre-check와 최종
`createTaskStored`가 같은 `medication-course:<id>` 락 안에서 원자적으로
실행됨 확인, non-array 거부는 모든 입력 형태 표로 검증). **판정: NOT
CLEAN** — MEDIUM 1건, LOW 2건, NIT 3건. 스코프 밖 변경 없음, FROZEN
zero-diff 확인.

1. **MEDIUM (수정)**: load-epoch effect의 상태 리셋 블록이 `busy`를
   리셋하지 않음 — 모든 `.finally()`의 `setBusy(false)`가 epoch-guard로
   막힌 지금, 이전 환자에서 아직 진행 중이던 mutating action이 응답을
   받아도(guard가 막아서) 새 환자의 `busy`를 절대 못 지움 →
   `DoctorView.tsx`의 `key={patient_id}` 리마운트가 없다면(바로 이
   가드가 "그 안전망이 약해져도" 방어하겠다고 명시한 시나리오) 새
   환자에서 모든 액션 버튼이 영구적으로 disabled됨. **수정**: effect의
   리셋 블록에 `setBusy(false)` 한 줄 추가(4개 `.finally()` guard는
   건드리지 않음 — 그건 정확하고 필요한 코드).
2. **LOW (수정)**: epoch guard로 교체하면서 기존 boolean `cancelled`
   플래그의 cleanup 함수가 통째로 사라짐 — unmount되는 인스턴스 자신의
   in-flight promise는 자기 ref가 마지막 epoch에 고정돼 있어 모든
   guard를 그대로 통과함(실제로는 `key=` 리마운트라 unmount 자체는
   일어나지만, 이 가드가 존재하는 이유와 같은 종류의 결함). **수정**:
   cleanup에서 `loadEpochRef.current += 1`로 epoch을 무효화.
3. **NIT (수정)**: `createMedicationCourseCheckTaskStored`의 pre-check가
   `(source_id, reason_code)`만 보고 `source_type`은 안 봄 — 이 함수가
   만드는 task 자신, UI의 필터 둘 다 `source_type === 'MEDICATION_COURSE'`
   를 포함하는 것과 비교해 더 느슨함(실제 충돌은 사실상 불가능하지만
   한 토큰짜리 수정). **수정**: 조건에 `t.source_type === 'MEDICATION_COURSE'`
   추가.
4. 나머지 2 NIT(`due_at` 조용한 폐기는 기존 동작, `stripComments`
   정규식 취약성)는 리뷰어 스스로 "optional polish"로 표시 — 코드
   변경 없이 기록만.

신규 `tests/medication-course-ui.spec.mjs` 3개 assertion 추가(9개로
확장): effect가 `busy`를 리셋하는지, cleanup이 epoch을 무효화하는지,
그리고 리뷰가 지적한 "guard 존재만으로는 위치를 증명 못 한다"는 맹점을
닫기 위해 각 guard가 `.then((result) => {` 콜백의 첫 문장으로 anchor돼
있는지.

**검증(`d8e66d7` 반영 후)**: `npx tsc -b --force` clean, `npm run
test:medication-course` 57/57, `npm run test:medication-course-ui`
9/9(신규 3개 포함), `npm run test:audit-registry` 106/106, `npm run
test:all`(exit 0), `npm run build`/`build:preview` clean, `tablet core`
pytest 80/80, FROZEN diff 0 lines — 전부 통과. push 완료. 이 라운드가
MEDIUM/LOW를 발견했으므로 오너 지시 사이클에 따라 2차 독립 클로징
리뷰가 필요 — 다음 단계.

**2차 독립 `model:opus` 클로징 리뷰(완료, `d8e66d7` 대상) + 수정(`e067c94`)**:
실제 fresh subagent 호출(약 94k 토큰, 23 tool call, ~5분)로 `d8e66d7`
검수. 세 claim(busy 리셋/cleanup epoch 무효화/source_type 추가) 전부
"실제로 깨보려고 시도했으나 못 깼음"으로 확인 — epoch 산술을 React
strict-mode 이중 호출까지 포함한 실제 A→B 시퀀스로 직접 추적, git
history(`bff300c`/`1df3e0e`부터)로 `source_type` 없는 legacy task가
한 번도 존재한 적 없음을 직접 확인. **판정: NOT CLEAN** — 세 claim
자체는 맞지만 같은 reset 블록이 여전히 불완전, 그리고 새 테스트
3개의 맹점.

1. **MEDIUM (수정)**: load-epoch effect의 reset 블록이 `busy`와 나머지
   11개 상태를 리셋하도록 고쳤지만, 새 코스 기록 폼의 draft 필드
   4개(`newPrescribedAt`/`newDispensedAt`/`newStartAt`/`newDurationDays`)
   는 여전히 리셋 안 됨 — `handleCreateCourse` 성공 시에만 지워짐.
   환자 A에서 새 코스 폼을 열고 날짜를 입력한 뒤 제출 없이 B로
   전환하면(폼 자체는 `showNewCourseForm`이 닫혀서 눈에 안 보임), B에서
   새로 연 폼에 A의 날짜가 그대로 남아있어 저장 한 번으로 A의 투약
   날짜가 B의 코스 레코드에 쓰일 수 있음. **수정**: effect의 리셋
   블록에 4개 setter 추가, 폼 취소 버튼 핸들러에도 동일 추가(한 환자
   안에서도 같은 종류의 stale draft 문제이므로).
2. **LOW ×2 (수정)**: guard-count/`.finally()`-count assertion이 "N개
   가드가 존재한다"만 증명하지, `.then((result) => {...})`나
   `.finally(() => {...})` 콜백의 **총 개수**가 그 값과 일치하는지는
   증명 못 함 — 새로 추가된 unguarded 콜백이 있어도 두 카운트 다
   그대로일 수 있음. **수정**: 각각 총 개수(7, 4)를 고정하는 assertion
   추가 — 앞으로 늘어나려면 guard 개수와 총 개수가 lockstep으로 함께
   늘어나야 함.
3. **LOW (수정)**: busy-reset assertion이 effect 본문 어디든
   `setBusy(false)`가 있으면 통과 — `listEpisodesByPatient().then()`
   콜백 안으로 옮기면(그러면 새 환자 로드가 끝나야만 풀리고,
   `!result.ok` 조기 리턴 경로에서는 아예 안 풀림) 여전히 통과함을
   실제로 확인. **수정**: `setActionError(null)` 바로 다음 문장으로
   anchor.
4. **NIT (수정)**: cleanup-invalidates-epoch assertion이 파일 전체에서
   매칭 — cleanup을 effect 밖 미사용 헬퍼로 옮겨도 통과함을 실제로
   확인. **수정**: busy-reset 테스트와 같은 effect-body 추출 재사용.
5. **NIT (수정)**: `shiftMedicationCourseStartStored`가 코스의 연결된
   task를 `(source_id, task_type)`로만 식별 — check-task dedup
   pre-check가 이제 쓰는 `(source_type, source_id, reason_code)`보다
   느슨함. git history로 `source_type` 없는 task가 나온 적 없음을
   확인(관찰 가능한 동작 변경 없음) 후 일관성만 맞춤.
6. **NIT (latent, 기록만)**: 리뷰가 지적한 나머지 두 항목(한 epoch
   안에서 동시 reload의 순서 비보장; `.then(async (result) => {`나
   `result =>` 같은 다른 형태는 정규식 assertion이 못 잡음)은 코드
   변경 없이 기록만 — 전자는 이 배치 이전부터 있던 self-healing
   동작, 후자는 현재 소스에 그런 형태가 없어 latent.

신규 `tests/medication-course-ui.spec.mjs` 3개 assertion 추가(12개로
확장): `.then`/`.finally` 총 개수 고정, busy-reset anchor 강화, 4개
draft 필드 리셋 확인, cleanup assertion을 effect-body 스코프로 강화.

**검증(`e067c94` 반영 후)**: `npx tsc -b --force` clean, `npm run
test:medication-course` 57/57, `npm run test:medication-course-ui`
12/12(신규 3개 포함), `npm run test:audit-registry` 106/106, `npm run
test:all`(exit 0), `npm run build`/`build:preview` clean, `tablet core`
pytest 80/80, FROZEN diff 0 lines — 전부 통과. push 완료. 2차 리뷰도
MEDIUM을 발견했으므로 3차 독립 클로징 리뷰가 필요 — 다음 단계.

**3차 독립 `model:opus` 클로징 리뷰(완료, `e067c94` 대상) + 수정(`898ccdc`)**:
실제 fresh subagent 호출(약 109k 토큰, 24 tool call, ~7분)로 `e067c94`
검수 — 이번엔 명시적으로 "reset 블록이 정말 완전한지, 아니면 세
번째로 빠진 게 있는지"를 소스에서 직접 재도출(prior 두 리뷰의 목록을
신뢰하지 않고)하도록 지시. **결론: reset 블록의 핵심 질문(16개
useState 전부 리셋되는지)은 이제 실제로 완전함 — 수동 열거와 기계적
diff 두 가지 독립적 방법으로 확인, `missing: []`.** 그러나 그 완전성을
**증명하는 테스트가 없었다**는 점과, 이번 라운드 자체의 NIT가 만든
회귀, 그리고 patient 전환과 무관한 same-patient stale-draft 결함
2건을 찾음. **판정: NOT CLEAN** — MEDIUM(테스트 품질) 1, LOW 4, NIT 2.

1. **MEDIUM (수정)**: 1·2차 리뷰가 각각 다른 필드(busy, 4개 draft
   필드)를 놓친 이유 — reset 블록이 "완전하다"는 걸 증명하는 테스트가
   한 번도 없었고, 각 라운드는 자기가 찾은 필드만 pin했음. **수정**:
   모든 `useState` 선언에서 setter 이름을 직접 추출해 reset 블록과
   diff하는 테스트로 교체 — 17번째 필드가 나중에 추가되고 reset이
   안 되면 즉시 실패(4차 리뷰를 기다릴 필요 없음). 새 코스 폼의
   취소 버튼도 4개 필드를 지우는지 별도로 검증하는 테스트 추가(이
   절반만 되돌려도 기존 assertion 전부 통과했었음 — 실제로 확인됨).
2. **LOW (수정)**: 2차 리뷰의 "`.then`/`.finally` 총 개수 고정" 수정이
   콜백 파라미터 이름만 바꿔도(`(res) =>` 등) 무력화됨을 실제로 확인
   — 카운트도 안 움직이고 unguarded completion point도 추가됨.
   **수정**: 특정 콜백 형태가 아니라 `.then(`/`.finally(` 토큰 자체를
   세도록 변경, `.catch(`/`await`가 0개인지도 pin(둘 다 기존
   `.then` 형태 assertion으로는 안 보임).
3. **LOW (수정)**: busy-reset assertion이 effect-body 스코프에서 파일
   전체 매칭으로 회귀함 — 재추출해서 원래대로 복구.
4. **LOW (자체 유발, 수정)**: `e067c94`의 "일관성" NIT가
   `shiftMedicationCourseStartStored`의 `linked` 필터에 `source_type`
   을 추가했지만, 같은 데이터를 쓰는
   `recalculateMedicationTasksOnStartShift`(`medicationCourse.ts`)의
   병렬 필터는 안 바꿔서 두 집합이 갈라짐 — `superseded`는
   느슨한 집합에서, `originalById`는 이제 좁아진 집합에서 나오므로,
   한쪽에만 있는 task가 `t !== originalById.get(t.task_id)`에서
   항상 true가 되어 실제로는 안 바뀐 DONE task가 "superseded"로
   잘못 분류될 수 있었음(DONE task immutability 위반). **수정**:
   `medicationCourse.ts:38`과 정확히 일치하도록 되돌림.
5. **LOW (수정)**: 복용 시작일 변경 draft가 `e067c94`가 새 코스 폼에서
   고친 것과 같은 "닫아도 안 지워지는 draft" 패턴을 그대로 갖고
   있었음 — 단, patient 전환 없이 같은 환자 안에서. `<details>`를
   접었다가 나중에 다시 펼치면 입력했다가 마음을 바꾼 날짜가 그대로
   남아있고 저장 버튼도 이미 활성화됨. **수정**: disclosure가 닫힐
   때(열릴 때가 아니라 — 실수로 접혔다 다시 열어도 작업 중이던 값은
   안 날아가도록) draft를 지움.
6. **NIT (수정)**: 확인 작업 예약의 사유 칩(chip)에는 draft를 버리는
   방법이 아예 없었음 — 잘못 누른 칩이 세션 내내 그대로 남음.
   **수정**: 이미 활성화된 칩을 다시 누르면 draft를 지우도록.

**검증(`898ccdc` 반영 후)**: `npx tsc -b --force` clean, `npm run
test:medication-course` 57/57, `npm run test:medication-course-ui`
14/14(신규 2개 포함), `npm run test:audit-registry` 106/106, `npm run
test:crm-schema` 95/95(되돌린 필터를 실제로 사용하는 스펙), `npm run
test:all`(exit 0), `npm run build`/`build:preview` clean, `tablet core`
pytest 80/80, FROZEN diff 0 lines — 전부 통과. push 완료.

**4차 독립 `model:opus` 클로징 리뷰(완료, `898ccdc` 대상) + 수정(`bd8d094`)**:
실제 fresh subagent 호출(약 113k 토큰, 17 tool call, ~6분)로 `898ccdc`
검수 — 지시대로 reset 블록 열거를 다시 처음부터 하지 않고, 이번
라운드가 새로 만든 6가지 변경(파생 완전성 테스트, 취소 핸들러
테스트, `.then`/`.finally`/`.catch`/`await` 토큰 카운트, crmStore
필터 되돌림, shift-draft `onToggle`, check-task 칩 toggle-off)에
집중. **판정: NOT CLEAN — 하지만 HIGH/MEDIUM 0건, 소스 버그 0건.**
LOW 4 / NIT 1, 전부 테스트 커버리지 자체의 빈틈(실제 소스 3개 수정은
전부 정확하다고 확인 — mutation 시도로 각각 검증).

1. **LOW (수정)**: 파생 완전성 테스트가 `decls.length`만 pin — 정규식이
   못 보는 destructuring 형태(멀티라인, `set` 접두사 아닌 setter명,
   `=` 뒤 줄바꿈)로 17번째 `useState`가 추가돼도 `decls.length`는
   그대로라 통과함(이 저장소엔 Prettier/ESLint 설정이 없어 그런
   포맷이 실제로 나올 수 있음을 확인). **수정**: `useState(`/`useState<`
   호출 부위 원시 개수와 교차 검증 추가.
2. **LOW (수정)**: 같은 테스트가 effect 본문 전체(비동기 `.then()`
   콜백 포함)에 대해 `missing`을 계산 — setter가 동기 reset 블록
   밖으로, `.then()`의 `!result.ok` 조기 리턴 이후로 옮겨져도
   `missing=[]`로 통과함을 실제로 확인. **수정**: effect의 동기
   prefix(자기 자신의 비동기 호출 이전)로만 범위 제한.
3. **NIT (수정)**: 취소 핸들러 보조 테스트가 `/g` 없이 `.match()` 사용
   — 같은 모양의 핸들러가 파일 앞쪽에 먼저 있으면 그걸 검증하고 진짜
   취소 버튼의 회귀는 못 잡음. **수정**: `matchAll` + "매치 정확히
   1개" assertion으로 전환.
4. **LOW ×2 (수정)**: 이번 라운드 자체의 두 소스 수정(shift-draft
   `onToggle` 클리어, check-task 칩 toggle-off)이 assertion 0개로
   나감 — 되돌려도 기존 테스트 전부 통과함을 실제로 확인. **수정**:
   각각 소스-레벨 assertion 1개씩 추가.

**검증(`bd8d094` 반영 후)**: `npx tsc -b --force` clean, `npm run
test:medication-course` 57/57, `npm run test:medication-course-ui`
16/16(신규 2개 포함), `npm run test:audit-registry` 106/106, `npm run
test:crm-schema` 95/95, `npm run test:all`(exit 0), `npm run
build`/`build:preview` clean, `tablet core` pytest 80/80, FROZEN diff
0 lines — 전부 통과. push 완료.

**5차 독립 `model:opus` 클로징 리뷰(완료, `bd8d094` 대상) + 수정(`0192384`)**:
fresh subagent 호출(약 104k 토큰, 22 tool call, scratch worktree로
17개 소스 mutation 실제 실행)로 `bd8d094` 검수. **HIGH/MEDIUM 0건,
소스 버그 0건**(4차와 동일 결론 재확인) — LOW 2 / NIT 3, 전부 4차
라운드가 새로 추가한 테스트 자체의 남은 빈틈.

1. **LOW (수정)**: 동기 prefix 절단 지점이 `listEpisodesByPatient(`
   문자열 하드코딩 — 그 위에 새 비동기 호출이 추가되면 그것까지
   "동기" 구간으로 삼켜져서, 그 새 호출의 `.then()` 안으로 옮겨진
   setter가 미검출됨을 실제 mutation으로 확인. **수정**: 하드코딩된
   함수명 대신 `.then(`/`.finally(`/`.catch(` 중 첫 등장 위치로 절단.
2. **LOW (수정)**: shift-draft `onToggle`/check-task 칩 toggle-off
   assertion 둘 다 여는 `if (...)` guard까지만 anchor — guard는
   맞지만 본문이 no-op이거나 잘못된 키를 지우는 mutation이 여전히
   통과함을 실제로 확인. **수정**: 각각 실제 `delete
   next[course.course_id]`까지 정규식 확장.
3. **NIT (수정)**: `useReducer`로 만들어진 17번째 patient-scoped
   상태는 모든 `useState` 파생 assertion에 안 보임 — `useReducer(`
   0개 pin 추가.
4. NIT ×2(주석 문구가 "unconditionally"를 과장, `useState[<(]`가
   워드 바운더리 없음)는 리뷰어 스스로 "결함 아님, safe 방향"으로
   표시 — 코드 변경 없이 기록만.

**검증(`0192384` 반영 후)**: `npx tsc -b --force` clean, `npm run
test:medication-course` 57/57, `npm run test:medication-course-ui`
16/16, `npm run test:audit-registry` 106/106, `npm run test:crm-schema`
95/95, `npm run test:all`(exit 0), `npm run build`/`build:preview`
clean, `tablet core` pytest 80/80, FROZEN diff 0 lines — 전부 통과.
push 완료.

**6차 독립 `model:opus` 클로징 리뷰(완료, `0192384` 대상) + 수정(`5ede4ac`)**:
fresh subagent 호출(24개 mutation 실행)로 `0192384` 검수 —
**소스(`MedicationCourseSection.tsx`/`crmStore.js`)는 3라운드 연속
결함 0건 재확인**, 리뷰어가 A→B 시나리오를 처음부터 직접 재추적해서
epoch guard + reset 블록이 실제로 stale render를 막는다는 결론에
독립적으로 동의(`DoctorView.tsx`의 `key=` remount가 커버하는 영역과
epoch guard가 커버하는 영역의 경계도 재확인). **판정: NOT CLEAN** —
LOW 1 / NIT 1, 전부 5차 라운드 자체의 남은 빈틈.

1. **LOW (수정)**: 5차가 "delete까지 확장"했다고 주장한 두
   assertion(shift-draft/check-task 칩) 둘 다 `[\s\S]*?` lazy
   bridge를 씀 — no-op된 핸들러 본문을 그냥 지나쳐서 파일 다른 곳의
   무관한 `delete`(서로 상대방 핸들러의 delete)와 매치됨을 실제
   mutation으로 확인. **수정**: lazy bridge 대신 각 핸들러 본문
   전체를 정확히 pin.
2. **NIT (수정)**: `.then`/`.finally`/`.catch`/`await` 어휘는
   Promise 기반 비동기 완료만 커버 — 타이머/microtask로 지연된
   setState는 어떤 라운드도 체크한 적 없는 별개의 미보호 형태.
   **수정**: `setTimeout(`/`setInterval(`/`queueMicrotask(`/
   `requestAnimationFrame(` 0개 pin 추가(현재 소스엔 없음, 회귀
   방지용).

**검증(`5ede4ac` 반영 후)**: `npx tsc -b --force` clean, `npm run
test:medication-course` 57/57, `npm run test:medication-course-ui`
17/17(신규 1개 포함), `npm run test:audit-registry` 106/106, `npm run
test:crm-schema` 95/95, `npm run test:all`(exit 0), `npm run
build`/`build:preview` clean, `tablet core` pytest 80/80, FROZEN diff
0 lines — 전부 통과. push 완료.

## Completed — Episode↔Medication association integrity 배치 (진행 중, 이번 세션)
**배경**: Medication/Herbal CRM 배치가 7차에서 CLEAN 판정으로 CLOSED된
직후, Gomars93가 PR #24 댓글로 **새 cohesive 배치**를 지시(그 배치를
재검수하지 말 것을 명시). Episode와 MedicationCourse 사이의 association
무결성에 관한 3개 항목:
1. Episode 생성이 HTTP/UI 경계에서 retry-idempotent하지 않음(응답
   유실 후 재시도가 중복 Episode를 만들 수 있음).
2. Episode가 2개 이상 존재할 때 Medication UI가 어느 것을 쓸지 조용히
   임의로 골라버림(오래된 Episode를 silent하게 선택).
3. MedicationCourse 생성이 episode_id가 현재 환자 컨텍스트에 속하는지
   검증하지 않음(cross-patient tamper 가능성).

명시적 non-goal: "환자당 Episode 1개"를 강제하지 않음, 새 임상 라벨/
우선순위를 발명하지 않음(다중 Episode는 여전히 정상). Clinical CRM
v0.3.1은 CLOSED 유지.

**구현(Sonnet, 이번 세션)**:
- **#1 (retry-idempotency)**: `POST /api/crm/episodes`가 이제 선택적
  `episode_id`(클라이언트가 미리 생성)를 받는다. `crmStore.js`의
  `createEpisode`는 기존에도 `episode_id` 기준 create-if-absent였으나
  반환값이 `{episode, created}`가 아닌 bare episode였음 — 다른
  `*Stored` 함수들의 관례에 맞춰 `{episode, created}`로 통일하고,
  라우트가 `created`일 때만 `CRM_EPISODE_CREATED` 감사 이벤트를
  발화(중복 호출이 감사 로그를 두 번 남기지 않음). 클라이언트
  (`MedicationCourseSection.tsx`)는 기존 `newCourseSourceId`와 같은
  "초안당 한 번 mint, 재시도마다 재사용, 성공 시에만 clear" 패턴을
  `newEpisodeRequestId`로 그대로 복제.
- **#2 (ambiguity picker)**: 자동 선택은 "Episode가 정확히 1개" 또는
  "여러 개 중 ACTIVE가 정확히 1개"일 때만 발동 — 그 외(ACTIVE 2개+,
  또는 비-ACTIVE만 2개+)는 `episodeId`를 `null`로 두고 명시적 선택
  UI(`.medCourse__episodeList`)를 렌더. 라벨은 기존 `EpisodeStatus`
  enum + `created_at` + `owner_clinician`만 사용(새 임상 라벨 없음).
  `handleSelectEpisode`도 다른 4개 변경 액션과 같은 load-epoch 캡처
  패턴을 따른다(구조적 테스트로 확인).
- **#3 (ownership check)**: `crmStore.js`에 새 `CrmOwnershipError`(409)
  추가. `createMedicationCourseStored`가 옵션 `expected_patient_uuid`를
  받아 `episode.patient_uuid`와 불일치하면 **어떤 write/audit
  이벤트도 없이** fail-closed. `expected_patient_uuid`는 완전히
  선택적(생략 시 기존 동작 100% 동일) — Doctor UI의 course 생성
  호출부만 실제로 채워서 넘기고, 다른 모든 API 호출부(기존 테스트
  포함)는 영향 없음. `patient_uuid` 자체는 여전히 `episode.
  patient_uuid`에서만 파생(derive) — `expected_patient_uuid`는
  신뢰의 원천이 아니라 별도의 assertion.

**테스트(신규)**:
- `tests/crm-store.spec.mjs`: episode retry-idempotency(순차 2회
  호출이 `created:true`→`created:false`로 수렴, `created_at` 보존,
  파일 1개만; 동시 2-way `Promise.all`이 정확히 1개만 `created:true`)
  + ownership check(불일치 시 `CrmOwnershipError`, course/dedup 파일
  0개; 일치·생략 시 정상 동작) — store 레벨 15개 신규 assertion,
  총 244/244 통과.
- `tests/audit-registry.spec.mjs`: HTTP 레벨 retry-idempotency(첫
  201, 재시도 200, 동일 episode_id/created_at, `crm_episode_created`
  감사 라인 정확히 1개) + HTTP 레벨 ownership 거부(cross-patient
  tamper → 409, `crm_medication_course_created` 감사 라인 0개 증가,
  대상 Episode 아래 course 0개) — 신규 9개 assertion, 총 114/114
  통과.
- `tests/medication-course-ui.spec.mjs`: 옛 `find(ACTIVE) ??
  episodes[0]` 무조건 자동선택이 제거됐음을 구조적으로 확인, 새
  unambiguous-only 자동선택 로직 pin, `episodeId === null` picker
  렌더 분기 존재 확인, picker가 새 임상 라벨을 발명하지 않고 기존
  status/created/owner만 쓰는지 확인, `handleSelectEpisode`의
  epoch 캡처 확인(기존 4개 액션 → 5개로 pin 갱신, `newEpisodeRequestId`
  추가로 `useState` 선언 수 16→17 pin 갱신) — 신규 7개 assertion,
  총 24/24 통과.

**실 브라우저 QA(데스크톱 1440×900 + 클리닉 태블릿 1024×768, Playwright,
`server/index.js` + `vite --host` 실제 기동)**: 실 questionnaire
builder(`buildResponsePayload`/`buildRoutingPayload`/`computeSaju` 등,
`src/doctor/fixtures.ts`와 동일한 조합)로 만든 두 명의 합성 환자로
검증(환자 A: Episode 1개, 환자 B: ACTIVE Episode 2개) — 실제 PHI
아님, 완전 합성.
- 환자 A(단일 Episode): 자동 선택, picker 없이 바로 코스 목록 —
  low-click 경로 보존 확인(양쪽 뷰포트).
- 환자 B(ACTIVE 2개): picker 렌더, 두 옵션 모두 표시, 클릭 시 정상
  코스 목록으로 전환 — 조용한 오선택 없음(양쪽 뷰포트, 수평 오버플로우
  0).
- A↔B 레이스: `/api/crm/episodes` 응답을 라우트 인터셉션으로 지연시켜
  B의 episodes fetch가 in-flight인 동안 A로 전환 → 최종 상태가 항상
  A의(단일 Episode, 자동선택) 상태로 수렴하고 B의 지연 응답이 이를
  덮어쓰지 않음을 확인(load-epoch guard 실동작 증명, 양쪽 뷰포트).
- Today Queue: 환자 B에서 명시적으로 고른(자동선택 아닌) Episode
  아래 check-task를 생성 → `GET /api/crm/tasks`와 Doctor 목록 화면의
  "오늘 할 일 CRM" 둘 다 해당 task를 올바른 episode_id/patient_uuid로
  정확히 반영함을 확인.
- purge 커버리지는 기존 `tests/crm-store.spec.mjs`의 purge-full
  테스트가 이미 `crm/` 전체 트리(episode/course dedup 아티팩트 포함)
  삭제를 검증 — 이번 배치가 새 디렉터리를 추가하지 않아 별도 코드
  변경 없이 그대로 커버됨, `npm run test:all` 재실행으로 재확인.

**QA 중 발견한 무관 이슈(코드 변경 안 함, 기록만)**: 극단적으로 빈
`responses`(`{ patient: {} }`, `routing: null`)로 seed한 제출 건을
Doctor 화면에서 열면 `deriveViewProfile`(`routing`이 null)과
`primaryConcernLabel`(`r.visit_goal`이 undefined) 등에서 렌더링
예외가 발생 — `PatientErrorBoundary`가 잡아 "문제가 발생했습니다"
화면으로 대체(크래시는 아님). 실제 태블릿 제출 흐름은 항상 전체
질문에 대한 값(질문마다 null이라도)을 채운 `Responses`를 서버로
보내므로 이 경로는 실사용에서 발생하지 않는다 — 이번 배치의 범위
밖(Episode/MedicationCourse와 무관)이라 코드는 건드리지 않음.

**검증**: `npx tsc -b --force` clean, `npm run test:all`(exit 0, 전체
스위트 통과 — crm-store 244/244, medication-course-ui 24/24,
audit-registry 114/114 포함), `npm run build`/`build:preview` clean,
`tablet core` pytest 80/80, `git diff origin/main -- src/spec/*Logic.ts
src/spec/*Adapter.ts` 0 lines(FROZEN 유지) — 전부 통과.

**1차 독립 `model:opus` 클로징 리뷰(완료, `55949f3` 대상) + 수정**: fresh
subagent 호출(35 tool call, ~7분)로 검수. **판정: NOT CLEAN** — HIGH 2 /
MEDIUM 2 / LOW 4 / NIT 1.

1. **HIGH(수정)**: `episode_id`가 이제 클라이언트가 지정할 수 있는데,
   라우트가 "비어있지 않은 문자열"만 검사하고 `crmStore.js`의
   `episodePath()`가 이를 그대로 `path.join(episodesDir, \`${id}.json\`)`에
   씀 — `episode_id: "../../submissions/<id>"`로 `.data/submissions/`의
   환자 제출 기록을 그대로 읽어올 수 있고, 존재하지 않는 대상이면 데이터
   루트 밖에 임의 파일을 쓸 수도 있음(리뷰어가 실제로 재현: 응답 본문에
   환자 이름/전화 등이 그대로 노출됨). 이 배치 이전엔 `episode_id`가
   항상 서버가 만든 `randomUUID()`라 도달 불가능했던 경로. **수정**:
   라우트에 이 파일의 기존 `recording_id` 안전 문자셋 검사와 동일한
   `/^[A-Za-z0-9_-]{1,128}$/` 검증 추가(불일치 시 400) — 클라이언트의
   두 id 생성 형태(`crypto.randomUUID()`, `id-<ts>-<rand>`) 모두 통과.
2. **HIGH(수정)**: `createEpisode`의 create-if-absent 경로가 `episode_id`
   로만 매칭하고 기존 레코드의 `patient_uuid`가 요청자의 것과 같은지
   확인하지 않음 — 다른 환자가 이미 쓰고 있는 id를 재사용하면 그 환자의
   Episode를 그대로 돌려받음(신규 배치가 course 생성에 추가한 ownership
   체크의 정확히 반대쪽 구멍, 새로 열린 caller-controlled 경로에만
   남아 있었음). **수정**: `existing.patient_uuid !== patient_uuid`면
   `CrmOwnershipError`(409)를 throw — 라우트도 `mapCrmError`로 감싸도록
   `try/catch` 추가.
3. **MEDIUM(검토 후 코드 변경 없음)**: `POST /api/crm/tasks`가
   caller가 보낸 `patient_uuid`를 `episode.patient_uuid`로 조용히
   덮어씀(reject가 아니라 derive) — round 7(CLOSED)이 의도적으로 설계·
   테스트한 "derive, don't trust" 패턴(`tests/crm-store.spec.mjs`의
   "identity: task persists with the EPISODE's patient_uuid" 블록,
   L444-445)과 정확히 같은 동작. 실제 데이터 손상 경로는 없음(파생된
   patient_uuid가 항상 진짜 소유자 Episode의 것과 일치) — course에
   추가한 새 "즉시 거부(409)" 방식은 오너가 명시적으로 지시한 범위
   (course 생성)를 넘어 여기까지 확장하면 (a) round 7의 기존 검증된
   설계·테스트를 뒤집고 (b) 오너의 "avoid broad API churn elsewhere"
   지시와 충돌 — 코드 변경하지 않기로 판단, 이 판단과 근거를 여기
   기록만.
4. **MEDIUM(수정)**: HTTP 레벨 ownership 거부 테스트의 tamper 본문에
   `source_id`/`source_timestamp`가 빠져 있어, ownership 체크를
   지워도 `createMedicationCourseStored`의 필수 필드 검사만으로
   똑같이 409 근처(사실은 400)가 나올 뻔함 — 즉 체크를 실제로
   구분하지 못하는 pass-by-construction. **수정**: 유효한 본문으로
   교체 + "같은 본문에 올바른 patient_uuid면 201로 성공"하는 대조
   assertion 추가.
5. **NIT(수정)**: "옛 자동선택 제거" 테스트의 두 regex 중 하나가
   옛 소스에도 매치되지 않는 vacuous 패턴(리뷰어가 `3bb07a5` 시점
   소스로 직접 확인) — 삭제, 실제로 옛 소스에 매치했던 나머지
   하나만 남김.
6. LOW 4건은 리뷰어가 "문서화된 트레이드오프" 또는 "결함 아님"으로
   분류(감사 이벤트가 진짜 크래시 창에서 유실될 수 있음은 이
   저장소의 기존 `!deduped` 관례의 자연스러운 확장, picker에
   "뒤로가기"가 없음은 UX nit, 자동선택 경계 로직은 직접 추적해
   정확함을 확인했지만 구조적 pin이라 회귀만 잡음) — 코드 변경
   없음.

**신규 회귀 테스트(HIGH 1/2 수정에 대응)**: `tests/crm-store.spec.mjs`에
클라이언트가 지정한 id가 다른 환자 소유일 때 `CrmOwnershipError`를
던지는지 확인하는 블록 추가(원본 Episode가 훼손되지 않음도 확인).
`tests/audit-registry.spec.mjs`에 traversal 모양 `episode_id` 5종
(`../../...`, URL-encoded, `a/b`, `a.json`, 빈 문자열)이 모두 400으로
거부됨(200도 500도 아님)과, 같은 id를 다른 환자로 재사용하면 409이고
응답 본문에 첫 환자의 Episode가 새지 않음을 확인하는 블록 추가.

**검증(수정 반영 후)**: `npx tsc -b --force` clean, `node
tests/crm-store.spec.mjs` 246/246, `node tests/audit-registry.spec.mjs`
123/123, `node tests/medication-course-ui.spec.mjs` 24/24, `npm run
test:all`(exit 0), `npm run build`/`build:preview` clean, `tablet core`
pytest 80/80, FROZEN diff 0 lines — 전부 통과.

**다음 단계**: 이번 라운드의 수정을 push한 뒤, 2차 독립 `model:opus`
클로징 리뷰(fresh subagent) 호출 — Medication/Herbal CRM 배치와 같은
"HIGH/MEDIUM 발견 시 재검수" 사이클. CLEAN 판정까지는 이 배치를
CLOSED로 선언하지 않는다.

**2차 독립 `model:opus` 클로징 리뷰(완료, `08eca1b` 대상) + 수정**: fresh
subagent 호출(44 tool call, ~10분)로 검수. **판정: NOT CLEAN** — HIGH 1 /
MEDIUM 1 / LOW·NIT 3.

1. **HIGH(수정)**: 1차 수정이 추가한 `episode_id` 안전 문자셋 검증이
   `POST /api/crm/episodes` 라우트 하나에만 있었음 — `POST /api/crm/
   tasks`와 `POST /api/crm/medication-courses`도 캐릭터가 body로 받은
   `episode_id`를 그대로 `crmStore.getEpisode()`(`path.join` 그대로
   사용)에 넘김. 리뷰어가 실제로 재현: `episode_id: "../../submissions/
   <id>"`로 `POST /api/crm/tasks`를 호출하면 201과 함께 그 제출 기록의
   `patient_uuid`가 그대로 Task에 박혀 실제로 파일이 써지고 Today
   Queue에 노출됨. `POST /api/crm/medication-courses`도 같은 경로로
   201 및 잘못된 환자로 course 저장. **이 primitive 자체는 이 배치
   이전(`3bb07a5`)부터 있던 것**(두 라우트 모두 `episode_id`가 항상
   "기존 Episode를 가리키는 참조"였고 한 번도 서버가 만든 값이 아니었음)
   — 하지만 1차 수정의 커밋 메시지와 HANDOFF가 "닫혔다"고 명시적으로
   주장했는데 실제로는 세 진입점 중 하나만 닫혔던 것은 이번 배치의
   책임. **수정**: `SAFE_CRM_ID_RE`(`/^[A-Za-z0-9_-]{1,128}$/`)를
   파일 상단 공유 상수로 추출, 세 곳(episodes 생성/tasks 생성/
   medication-courses 생성) 모두에 적용. `id`가 URL 경로 세그먼트에서
   오는 GET류 라우트(`parts[3]`)는 라우팅 자체가 `/`로 split하기
   때문에 그 값에 `/`가 담길 수 없어 구조적으로 traversal 불가능함을
   직접 추적해 확인 — 별도 수정 불필요.
2. **MEDIUM(1차 리뷰 항목 재확인)**: round 7의 "derive, don't trust"
   설계는 옳지만, "손상 경로가 없다"는 근거 자체가 이 HIGH가 열려
   있는 동안은 성립하지 않았음(episode_id가 실제 Episode가 아닌
   임의 파일을 가리킬 수 있었으므로 파생된 patient_uuid도 오염될 수
   있었음) — 리뷰어가 직접 확인. HIGH를 닫음으로써 근거가 다시
   성립. `POST /api/crm/tasks` 자체를 reject 방식으로 바꾸는 것은
   여전히 하지 않음(1차 판단 유지).
3. **LOW/NIT(코드 변경 없음, 기록만)**: 손상된 JSON 파일에 대한
   에러 응답이 500→400으로 바뀜(이 파일의 다른 라우트들과 일관된
   스타일, 실제 동작 변화지만 허용 가능한 트레이드오프로 리뷰어가
   직접 판단); 존재 여부를 create-on-probe로 알 수 있는 409-vs-201
   오라클(원장 인증+LAN 전용이라 낮은 위험, 허용 가능); regex가
   Windows 예약 파일명(`CON` 등)을 허용(실 클라이언트에서 도달
   불가능, 화장품 수준).

**신규 회귀 테스트**: `tests/audit-registry.spec.mjs`에 리뷰어의 실제
재현 시나리오(`../../submissions/<id>` 형태 `episode_id`로 `POST
/api/crm/tasks`와 `POST /api/crm/medication-courses` 둘 다 호출)를
그대로 옮긴 블록 추가 — 둘 다 400으로 거부되고, Today Queue에 유출된
Task가 생기지 않음을 확인.

**검증(수정 반영 후)**: `npx tsc -b --force` clean, `node
tests/crm-store.spec.mjs` 246/246, `node tests/audit-registry.spec.mjs`
126/126, `node tests/medication-course-ui.spec.mjs` 24/24, `npm run
test:all`(exit 0), `npm run build`/`build:preview` clean, `tablet core`
pytest 80/80, FROZEN diff 0 lines — 전부 통과.

**다음 단계**: push 후 3차 독립 `model:opus` 클로징 리뷰. CLEAN
판정까지는 이 배치를 CLOSED로 선언하지 않는다.

**3차 독립 `model:opus` 클로징 리뷰(완료, `97a9e8c` 대상)**: fresh
subagent 호출(59 tool call, ~11분)로 검수. **판정: 코드 기준
CLEAN** — HIGH/MEDIUM 0건. 리뷰어가 직접 재도출(이전 라운드 근거를
그대로 믿지 않고): raw socket으로 URL 경로 traversal 시도(`../../`,
`%2e%2e`, `%2f` 등) 전부 재현해 CRM 핸들러에 도달하지 않음을 확인
(WHATWG `URL`이 `%2e` dot-segment를 디코딩 전에 정규화하고, CRM id
세그먼트를 나중에 디코딩하는 코드가 없음을 직접 추적 — 2차 리뷰의
"라우팅이 `/`로 split해서 안전하다"는 근거가 불완전했음을 지적하되
결론 자체는 맞다고 독립 확인); `crmStore.*`의 client-supplied id
사용처 24곳 전수조사(episode_id 3곳 전부 가드됨, task_id/course_id는
항상 서버가 만든 randomUUID, source_id류는 전부 `hashDedupKey`로
해시된 뒤에만 경로에 쓰임); regex를 null byte/CRLF/fullwidth
solidus/RTL override/UNC 등으로 재차 adversarial 프로빙(전부 차단,
`path.win32.join`까지 대조); `97a9e8c`를 되돌려 새 회귀 테스트가
실제로 실패하는지 확인(1건씩 되돌려 각각 독립적으로 fail); 피커
로직/`handleSelectEpisode` epoch guard/ownership 체크의 TOCTOU를
다시 처음부터 추적(전부 문제 없음, `episode.patient_uuid`가
write-once임을 근거로 TOCTOU 불가능 확인).

LOW 2건(코드 아님, `HANDOFF.md` 자체의 stale 참조) — 아래 "## Current
Branch"의 HEAD가 `5ede4ac`로 남아 있던 것과 "## Next Recommended
Action"의 "미착수" 문구가 실제로는 이미 완료된 1~3차 리뷰와 모순된다는
지적. CLAUDE.md의 "HANDOFF가 실제 상태와 어긋나면 발견 즉시 고친다"
원칙에 따라 이번 갱신에서 바로 반영(아래 두 섹션). NIT 3건(URL-path id
는 길이 제한 없음 — 이 배치 이전부터 그랬고 정보 유출 없이 500으로
안전하게 끝남; 커밋 메시지의 안전 근거 서술이 완전하지 않음 — 코드는
맞으나 문서가 왜 맞는지 다 설명 못 함; picker 화면에 "에피소드 만들기"
버튼 없음 — 기존 auto-select 경로에도 없던 것과 동일, 회귀 아님) —
전부 코드 변경 없이 기록만.

**배치 판정**: 3라운드 연속 독립 `model:opus` 리뷰(1차 HIGH 2/
MEDIUM 2/NIT 1 → 수정, 2차 HIGH 1/MEDIUM 1(재확인) → 수정, 3차
코드 CLEAN) — 소스 결함 0건에 도달. Medication/Herbal CRM 배치의
7라운드 사이클과 동일한 엄격도. **배치 CLOSABLE** — PR #24에 클로징
코멘트 게시 진행. 병합 여부는 여전히 Gomars93이 직접 판단(**이
세션은 스스로 merge/main push하지 않는다**).

## Completed — malformed/legacy submission resilience 배치 (진행 중, 이번 세션)
**배경**: Episode↔Medication association integrity 배치가 CLOSABLE
선언된 직후, Gomars93가 PR #24 댓글로 새 저장소 전체 우선순위 배치를
지시. 그 배치의 real-browser QA 도중 발견했지만 범위 밖이라 코드
변경 없이 기록만 남겨뒀던 이슈 — `routing: null`이나 불완전한
`responses`를 가진 레거시/손상된 제출건을 Doctor 화면에서 열면
`deriveViewProfile`/`primaryConcernLabel` 등 수십 곳의 무조건적 필드
접근이 던져서 전역 `PatientErrorBoundary`가 받아 "문제가
발생했습니다" 화면으로 대체됨(크래시는 아니지만 그 기록을 사실상
볼 수 없게 만드는 파일럿 운영 결함) — 를 하나의 cohesive 배치로
닫으라는 지시. 명시적 요구사항: 사실을 지어내지 않고 fail-closed로
표시, A→B 전환 시 stale 상태 누출 없음, 보기만 해도 쓰기가 일어나지
않음, 3개 뷰포트(1440×900/1024×768/834×1112)에서 유용한 10초 샷,
회귀 테스트, 기존 정책(Clinical CRM v0.3.1 CLOSED, Test 0 PENDING,
Care Gap OFF, BizM PENDING_CONTRACT 등) 그대로 유지, FROZEN 검증.

**구현(Sonnet, 이번 세션)**: 문제의 근본 원인은 `DoctorView.tsx`의
`recordToPayload()`가 서버 레코드를 `DoctorPayload`로 그냥 `as`
캐스팅만 하고 런타임 검증을 전혀 안 한다는 것 — `routing`/`responses`/
`flags`/`myungri_calculation`은 전부 `buildRoutingPayload`/
`buildResponsePayload`/`computeFlags`/`computeSaju`(coreSpec.ts/
saju/index.ts) 한 번의 호출로 통째로 만들어지는 atomic한 객체라서,
실제 제출 흐름을 거친 레코드는 이 최상위 키들이 전부 있거나 전부
없다 — 부분적으로만 있는 경우는 레거시 스키마/손상/수기로 만든
요청뿐이다. 개별 leaf 필드를 일일이 검사하는 대신 "이 레코드로 상세
화면을 안전하게 그릴 수 있는가"만 판단하는 구조 검사
(`isDoctorPayloadShapeUsable`, 신규 export)를 만들고, 이 값
(`payloadShapeOk`)에 상세 렌더링 블록(임상/참고/명리 세 탭 +
JudgmentPanel + 원본 JSON) 전체를 게이트했다 — `deriveViewProfile`
호출 자체도 이 값이 true일 때만 실행(false면 절대 호출 안 함, routing
이 null이면 이 호출 자체가 던지므로). 새 `DoctorRecordErrorBoundary`
(신규 파일, `PatientErrorBoundary`와 같은 패턴이지만 이 레코드 하나의
상세 뷰만 격리 — 나머지 화면은 계속 정상 동작)를
`key={selectedRecord?.id ?? 'fixtures'}`로 감싸서, 구조 검사가 못 잡은
예외에 대한 2차 안전망 + 레코드 전환 시 이전 에러 상태가 새 레코드로
새지 않게 함. `DoctorRecordFallback`(신규, export)이 중립 shell을
그린다 — 이미 확인된 값(환자 라벨/제출 시각/상태)만 보여주고 어떤
임상 프로필도 추정하지 않으며, `patient_id`만 있으면 되는(payload와
무관한) CRM/투약 코스 섹션(`MedicationCourseSection`)을 그 안에서
그대로 계속 사용할 수 있게 했다 — 목록으로 돌아가는 버튼은 이미
헤더에 항상 떠 있어 중복 추가하지 않음. Micro Follow-up 발급, 재진
큐, 원내 태블릿 관리 등 payload와 무관한 기존 섹션은 이 게이트 밖에
그대로 둬서 전혀 영향받지 않는다.

**보기만 해도 쓰기가 일어나지 않음(요구사항 검토, 코드 변경 없음)**:
새 fallback/boundary는 순수 렌더링만 하고 어떤 저장 호출도 하지 않는다
— 확인 결과 이 파일에 기존부터 있던 "제출을 열면 status를 'new'→
'viewed'로 한 번 쓴다"(round 18, `setSubmissionStatus`)는 이 배치와
무관하게 모든 레코드(정상/손상 불문)에 이미 적용되는 사전 존재
동작이고, 손상된 `submission` blob 자체를 정규화/수정하지 않는다 —
그대로 유지, 범위 밖.

**신규 회귀 테스트(`tests/doctor.spec.mjs`에 추가, `npm run
test:doctor`)**: (1) 기존 7개 fixture 전체 + 새로 추가된 HIP/TMJ 등
전 fixture가 `isDoctorPayloadShapeUsable`을 통과함을 확인(이 검사가
정상 payload를 잘못 거부하지 않는다는 sanity) — 47개 assertion. (2)
mutation-style 가드: `routing`/`flags`/`responses`/`myungri_calculation`
전체 소실은 물론, `responses`의 16개 필수 namespace(`patient`,
`visit_goal`, `modules`, `safety_flags` 등, `buildResponsePayload`의
실제 최상위 키 전수) 각각을 하나씩만 지워도 독립적으로 거부됨을
확인 — 이 목록이 실제 무조건 읽히는 필드와 어긋나면 실패하는 테스트.
(3) `DoctorRecordFallback`을 `renderToString`으로 직접 렌더링해
"임상 프로필을 추정하지 않는다"는 문구, 알려진 환자 라벨/상태 노출,
patient_id 있고/없고 양쪽 다 예외 없이 렌더됨을 확인. (4) 구조적
가드: `DoctorView.tsx` 소스 자체가 실제로 `payloadShapeOk` 게이트,
`DoctorRecordErrorBoundary` wiring, record-id 키를 갖추고 있는지
regex로 확인(향후 편집이 이 배선을 조용히 제거하는 회귀를 잡음).

**실 브라우저 QA(데스크톱 1440×900 + 클리닉 태블릿 1024×768 + 새
834×1112, Playwright, 실제 `server/index.js` + `vite --host` 기동)**:
`routing`/`responses` 전부 누락된 합성 손상 제출건과, 실 questionnaire
builder로 만든 정상 LBP 제출건 둘 다로 검증(합성, 실제 PHI 아님).
손상 제출건: 전역 에러 화면 없이(`PatientErrorBoundary` 미발동,
`pageerror` 이벤트 0건) 중립 fallback이 즉시 렌더, 알려진 정보(환자
라벨/제출 시각/상태)만 표시, CRM 섹션("에피소드 만들기")이 그 아래
그대로 동작, 3개 뷰포트 전부 수평 오버플로우 0. 정상 제출건: 기존
동작 완전히 그대로(fallback 없음, 임상/참고 탭 정상, 세 뷰포트 모두
동일). A(손상)→B(정상) 레이스(A 클릭 직후 즉시 B로 전환): 최종
상태가 항상 B의 정상 상세 화면으로 수렴, A의 fallback이 새 레코드로
새지 않음(boundary의 key remount로 확인) — 세 뷰포트 전부 동일 결과.

**검증**: `npx tsc -b --force` clean, `npm run test:doctor` 747/747
(신규 assertion 포함), `npm run test:all`(exit 0), `npm run
build`/`build:preview` clean, `tablet core` pytest 80/80, `git diff
origin/main -- src/spec/*Logic.ts src/spec/*Adapter.ts` 0 lines(FROZEN
유지) — 전부 통과.

**1차 독립 `model:opus` 리뷰** (진짜 subagent 호출, 커밋 `109e024` 대상):
직접 실행으로 HIGH 1건을 증명했다 — `isDoctorPayloadShapeUsable`는
`responses.*` 각 namespace가 "plain object인지"만 1단계로 확인하고
그 안의 leaf는 전혀 보지 않는다(설계상 의도된 동작: leaf 수준 임상
추론을 하지 않기 위해). 그런데 DoctorView의 렌더 본문은 여러 곳에서
leaf를 무조건 역참조한다 — `routing.secondary_screens.length`,
`frequencyField`/`aggravatingField`가 읽는 `m.sleep`/`m.pain` 등 개별
서브모듈, `r.reproductive_status.derived.source`,
`saju.normalized.solarDate.*`, `saju.policy.pending_approval.length`.
리뷰어가 `server/index.js`가 실제로 받아들이는(모양만 맞고 속은 빈)
payload로 직접 실행해 재현: gate는 `true`를 반환하지만 렌더는
여전히 throw — `DoctorRecordErrorBoundary`도 이 throw를 못 잡는다
(DoctorView 자기 함수 본문 안의 inline 표현식이라 별도 자식
컴포넌트가 아님, 애초에 이 배치가 풀어야 했던 바로 그 문제).

**수정**: gate를 더 깊게 만드는 대신(leaf를 나열하기 시작하면
render와 계속 sync가 깨짐) 위 6곳의 실제 read 지점에 optional
chaining/`?? []` fallback을 추가했다(`frequencyField`/
`aggravatingField`는 서브모듈 자체가 없으면 `null` 반환,
`routing.secondary_screens ?? []`, `r.reproductive_status.derived?.source`,
`saju.normalized?.solarDate`, `saju.policy.pending_approval ?? []`).
임상적 의미는 전혀 만들지 않는다 — 그냥 "이 필드가 없으면 이
줄/문구를 생략한다"일 뿐.

**직접 실행으로 재검증하다가 실제 프로덕션 버그를 하나 더
발견했다**(리뷰가 지적한 것보다 근본적) — `REQUIRED_RESPONSE_KEYS`가
`buildResponsePayload`(coreSpec.ts)가 실제로 만드는 18개
최상위 namespace 중 2개, `secondary_modules`와 `constitution_basics`를
누락하고 있었다. 둘 다 다른 16개와 완전히 같은 방식으로(같은 함수
호출 안에서) atomic하게 만들어지는데 gate 목록에서 빠져 있었던 것 —
그래서 hollow-but-gate-passing payload를 실제 서버에 POST하고
브라우저로 열어보니 gate가 `true`를 반환한 뒤
`constitutionFields`(`r.constitution_basics.energy_recovery`)에서
그대로 throw, 전역 `PatientErrorBoundary`(&quot;문제가
발생했습니다&quot;)로 떨어지는 걸 실제로 재현했다. 이건 leaf 문제가
아니라 gate 자체가 원래 하려던 "top-level namespace 전부 있는지"
체크가 불완전했던 것이라, 다른 16개 옆에 두 키를 추가하는 게 정확한
수정이다(개별 접근부마다 optional chaining을 흩뿌리는 것보다 이
경우엔 gate 레벨 수정이 맞다 — 이 두 namespace도 atomic 원칙을
그대로 따르므로).

부수적으로 발견한 LOW 3건과 NIT 2건도 함께 수정: (1)
`DoctorRecordErrorBoundary`의 fixtures 모드 key가 상수 `'fixtures'`라
fixture/시나리오를 전환해도 remount가 안 되던 것 — server 모드처럼
`selectedRecord.id`에 대응하는 정체성이 필요해서 `` `fixtures:${fixtureIndex}:${workspaceScenarioId}` ``로 변경(실제
payload가 이 두 값에 의존하므로). (2) `DoctorRecordFallback`의 JSDoc이
"CRM 섹션은 밖에서 독립적으로 동작하니 여기서 안 만든다"고 써놓고
바로 아래서 만들고 있던 자기모순 — 주석을 실제 동작(정상 경로와
상호 배타적으로 여기서 직접 렌더링)에 맞게 고쳤다. (3) 같은
환자의 서로 다른 제출건 사이를 전환할 때 `MedicationCourseSection`이
이제 (record id로 keyed된) boundary 안에 있어 예전엔 없던 remount가
생기는 것은 인지하고 받아들인다 — 임상적 정확성엔 영향 없고(작성
중이던 CRM 폼 상태만 초기화됨), 이 batch의 핵심 안전 요구사항(레코드
전환 시 이전 에러 상태가 새지 않아야 함)과 직접 충돌하는 대안(record
id로 keyed되지 않은 더 좁은 boundary)을 만드는 것보다 낫다고 판단.
(4) 구조 검사 테스트의 정규식이 소스 텍스트의 줄바꿈/들여쓰기까지
그대로 매치해 포맷터 한 번에 깨지던 것, 그리고 fallback이 view-profile
라벨을 절대 언급 안 한다는 assertion이 사실 상 항상 참으로 통과하던
것(라벨 뒤에 없는 " 진료" 접미사를 붙여서 검사) — 둘 다 완화.

**신규/보강 회귀 테스트**(`tests/doctor.spec.mjs`): 리뷰가 실제로
실행한 것과 동일한 hollow-but-gate-passing payload를 재구성해
`isDoctorPayloadShapeUsable(...) === true`이면서 6개 leaf 표현식이
전부 throw하지 않음을 직접 assert, `frequencyField`/`aggravatingField`를
8개 primaryModule 전부에 대해 hollow modules로 직접 호출, gate의
mutation-guard 목록에 `secondary_modules`/`constitution_basics` 추가.
`npm run test:doctor` 767/767 통과(이전 747 + 신규 20).

**추가 실사용 검증**(단위 테스트만으로는 안 되는 부분): 로컬 서버를
띄우고 리뷰가 지적한 것과 정확히 같은 hollow payload(`responses`의
16개 namespace만 `{}`, `secondary_modules`/`constitution_basics`는
아예 없음)를 실제 `POST /api/submissions`로 넣은 뒤 Playwright로
Doctor 화면을 열어 수정 전/후를 직접 비교 — 수정 전:
`PatientErrorBoundary` 트리거 확인(`Cannot read properties of
undefined (reading 'energy_recovery')`), 수정 후: fallback 배너 +
CRM 섹션 정상 렌더, page error 0건, 전역 에러 화면 없음. 스크린샷으로
육안 확인 완료.

**재검증**: `npx tsc -b --force` clean, `npm run test:doctor` 767/767,
`npm run test:all`(exit 0, FAIL 0건), `npm run build`/`build:preview`
clean, `tablet core` pytest 80/80, `git diff origin/main --
src/spec/*Logic.ts src/spec/*Adapter.ts` 0 lines(FROZEN 유지) — 전부
통과.

**2차 독립 `model:opus` closing 리뷰** (진짜 subagent 호출, 커밋
`824c864` 대상): **NOT CLOSABLE 판정** — 1차 수정이 리뷰가 명시적으로
지적한 6곳만 고치고, 같은 패턴(`m.<서브모듈>.<leaf>` 무조건 역참조)의
자매 코드는 그대로 남겨뒀다는 걸 실행으로 증명했다. `DoctorView.tsx`
자기 렌더 본문에서 직접 호출되는(그래서 `DoctorRecordErrorBoundary`가
못 잡는) `primaryModuleFields`(12개 `primary_module` 값 중 11개가
`m.<서브모듈>`을 무조건 참조 — LBP/HIP/NECK/SHOULDER/KNEE/ELBOW/
WRIST_HAND/TMJ 각 지역 블록 포함)와 `menopauseSleepSummaryLines`
(`sleep.menopause` 무조건 참조)에서 실제로 동일한 클래스의 throw를
재현했다. 추가로 MEDIUM 4건: (M1) `?? []`는 필드가 아예 없을 때만
막고 값이 있지만 배열이 아닌 경우(레거시 데이터에서 흔함)는 못
막는다 — `routing.secondary_screens`/`saju.policy.pending_approval`/
`aggravatingField`의 `m.pain.pain_qualities` 등. (M2)
`MyungriCompactCard`가 정확히 같은 `pending_approval` 필드를 다른
곳에선 고쳐놓고 자기 자신은 안 고쳤고, `saju.pillars`가 `{}`(빈
객체, null이 아님)일 때 `.day.charAt(0)`이 던진다. (M3)
`CommonSafetyBanner.tsx`(별도 컴포넌트라 boundary가 잡긴 하지만,
잡히면 Common Safety 전체가 fallback 뒤로 숨어버려 이 배치의 상위
정책과 충돌)도 `reproductive_status.derived`/`modules.*` 여러 곳을
무조건 참조. (M4) 새로 추가한 leaf 테스트 4개가 실제 코드를 부르는
대신 가드 로직을 테스트 파일 안에서 재구현해서 항상 통과하는
vacuous 테스트였다(그 가드를 지워도 테스트가 그대로 통과함을 리뷰가
직접 확인).

**수정**: (1) `primaryModuleFields`의 11개 case 전부에 해당
서브모듈 존재 확인을 추가(없으면 그 case 전체를 `[]`로 반환 —
`frequencyField`/`aggravatingField`와 같은 "없으면 그 줄을 생략한다"
원칙), Pain case의 8개 지역 하위 블록(LBP/HIP/NECK/SHOULDER/KNEE/
ELBOW/WRIST_HAND/TMJ) 각각도 `primary_location` 태그 조건에
`&& m.<서브모듈>`을 추가. Sleep case의 MS_* 필드는 `m.sleep.menopause`
자체를 먼저 확인. (2) `menopauseSleepSummaryLines`에 `sleep?.menopause`
가드 추가. (3) 공유 `asArray<T>()` 헬퍼를 새로 만들어 "배열이 아니면
무조건 빈 배열"로 fail-closed하고, `routing.secondary_screens`/
`saju.policy.pending_approval`(렌더 3곳 + JudgmentPanel prop
전달)/`aggravatingField`의 `pain_qualities`/`secondaryModuleFields`/
`referenceSymptomKeys`/`sajuStatusLine`을 전부 이걸로 교체(`?? []`
전부 제거). (4) `MyungriCompactCard`: `saju.pillars?.day`로 가드,
`pending_approval`도 `asArray`로. (5) `CommonSafetyBanner.tsx`:
`derived` truthy 확인 후 `.pregnant` 등 읽기, `r.modules.*`
9곳 전부 optional chaining. (6) 리뷰 이후 직접 실사용 재현 중
**리뷰 범위 밖에서 두 곳을 추가로 발견**해서 같이 고쳤다 —
`HerbalWorkspace.tsx`의 `r.reproductive_status.derived.source`(가드
없음, `?.`로 수정)와 `r.modules.{sleep,gi,bowel,urinary,weight}`
5곳(전부 optional chaining), `PainWorkspace.tsx`의
`r.modules.lbp.recovery_expectation`(가드 없음, `?.` + `?? null`로
수정) — 이 두 파일은 별도 workspace 컴포넌트라 1차/2차 리뷰 모두
`DoctorView.tsx`/`CommonSafetyBanner.tsx` 범위 안에서만 봤다.
(7) 테스트: `primaryModuleFields`를 export해서 실제 함수를 hollow
`m={}`로 11개 primaryModule 전부 직접 호출(가드 재구현 아님),
Pain case의 지역 서브모듈 누락 케이스와 Sleep case의 menopause 누락
케이스도 직접 호출로 검증. 나머지(인라인 JSX라 export 불가능한
`routing.secondary_screens`/`saju.normalized`/`saju.policy.pending_approval`
가드, `SECONDARY_MODULE_VALUE`)는 소스 정규식으로 실제 코드에 그
표현식이 존재하는지 확인(이 파일이 boundary key에 이미 쓰던 것과
같은 기법). `CommonSafetyBanner.tsx`는 `tests/doctor-workspace.spec.mjs`에
같은 방식의 구조 검사 추가. `npm run test:doctor` 800/800(+33),
`npm run test:doctor-workspace` 57/57(+2).

**실사용 재검증**: 실제 서버에 리뷰가 재현한 것과 같은 hollow
payload(`routing.primary_module: 'Sleep'`, `responses.modules = {}`)를
POST하고 Doctor UI를 Playwright로 열어 수정 전/후 비교 — 수정 전:
`HerbalWorkspace`에서 throw → `DoctorRecordErrorBoundary`가 잡아서
fallback 표시(전역 크래시는 아니지만 임상 화면 전체가 숨겨짐), 수정
후: **fallback조차 필요 없이 정상 임상 워크스페이스가 그대로
렌더**되고 "전신 문진 응답이 없습니다"만 명시적으로 표시(사실을
지어내지 않음), page error 0건. 스크린샷으로 육안 확인 완료.

**재검증**: `npx tsc -b --force` clean, `npm run test:all`(exit 0,
FAIL 0건), `npm run build`/`build:preview` clean, `tablet core`
pytest 80/80, `git diff origin/main -- src/spec/*Logic.ts
src/spec/*Adapter.ts` 0 lines(FROZEN 유지) — 전부 통과.

**3차 독립 `model:opus` closing 리뷰** (진짜 subagent 호출, 커밋
`eec8308` 대상, `src/doctor/workspace/*.tsx` 전체를 명시적으로
훑어달라고 요청): **NOT CLOSABLE 판정, 또 새 HIGH 발견** —
`src/doctor/workspace/`는 이번엔 실제로 전부 훑었고(디렉터리의 모든
파일을 체크리스트로 나열해 각각의 결과를 보고함) 그 안에서는 문제
없음(2차에서 고친 두 사이트가 정확했고 그 외엔 클린)을 확인했지만,
정작 놓친 건 `src/doctor/DoctorView.tsx`/`HipSafetyPanel.tsx`/
`TmjSafetyPanel.tsx`/`AnkleFootSafetyPanel.tsx` 자체에 있던 9개
지역별 SafetyPanel(Neck/Shoulder/Knee/Elbow/WristHand/Hip/Tmj/
AnkleFoot/Lbp)의 게이트였다 — 전부 `safety_flags.<region> === null`
(엄격한 `===`)로 게이트하고 있었는데, "그 지역 모듈이 아예 존재하기
전에 만들어진 레거시 레코드"는 `safety_flags`에 그 키 자체가 없다
(`undefined`), `undefined === null`은 false라서 게이트가 열리지
않고 그대로 `responses.modules.<region>.*`을 무조건 읽어 던진다.
434/434 hollow 케이스로 직접 실행 재현, 8/8 지역에서 확인. Boundary가
잡긴 하지만(각 패널이 실제로 분리된 컴포넌트), 그 결과 안전 flag
전체를 포함한 임상 화면 전체가 fallback 뒤로 숨어버려 2차 리뷰가
`CommonSafetyBanner`에 대해 지적한 것과 동일한(오히려 더 넓은) 문제.
추가로 HIGH 1건 더: `CommonSafetyBanner.tsx`의 `asArray` 스윕이 그
파일 경계에서 멈췄었다 — `asArray`가 `DoctorView.tsx`의 모듈 전용
함수라 애초에 `CommonSafetyBanner.tsx`에서 참조할 수 없었고, 그
파일엔 여전히 7곳의 bare `?? []`가 남아 있었다(`.filter is not a
function`으로 직접 재현). 게다가 그중 `.includes('other')`를 쓰는
5곳은 wrong-typed 문자열 값에 대해 **크래시가 아니라 부분 문자열
매치로 실제로 없던 "기타 확인" 안전 항목을 지어내는** fail-open
버그였다(`'another_reason'.includes('other') === true`) — 이 배치가
막으려는 정책(사실을 지어내지 않는다)을 크래시보다 더 직접적으로
위반.

**수정**: (1) 9개 SafetyPanel 게이트 전부 nullish(`== null`)로
바꾸고 자기 자신의 `modules.<region>` 서브모듈 존재까지 요구하도록
확장(Lbp는 `primary_module_detail !== 'LBP'`에 `|| !modules.lbp`
추가). 그 과정에서 **직접 실행 재검증으로 리뷰도 못 본 문제를 하나
더 찾았다** — `shoulderAdapter.ts`(frozen)가 내부적으로
`neckAdapter.ts`의 `toNeckStateFromDoctorPayload`를 그대로 호출한다
(어깨/목이 `neck_shoulder` population을 공유하는 설계, SH01-05가
NS01 태그와 무관하게 항상 응답되어 있다는 기존 주석대로) — 그래서
`ShoulderSafetyPanel`은 `modules.shoulder`뿐 아니라 `modules.neck`도
있어야 안전하다. `modules.neck`만 지워도 `ShoulderSafetyPanel`이
크래시함을 직접 실행으로 재현 후, 게이트에 `|| !modules.neck` 추가.
(2) `CommonSafetyBanner.tsx`에 자체 `asArray` 헬퍼를 새로 만들고(파일
간 임포트 대신 이 파일 안에서 독립적으로 정의 — 이미 `Responses` 타입
alias도 두 파일에 각각 정의돼 있는 이 코드베이스의 기존 관례와 동일)
7곳 전부 교체. (3) 테스트: `tests/doctor-workspace.spec.mjs`에 리뷰가
제안한 정확히 그 형태의 일반 테스트 추가 — 7개 실제 시나리오 ×
9개 지역, 각각 `safety_flags.<region>`과 `modules.<region>`을 함께
지운 채로 `DoctorWorkspace`를 렌더링해서 던지지 않는지 확인하는
63개 조합 루프(개별 사이트를 하나씩 쫓는 대신 "이 클래스 전체"를
검증) — 이 루프가 실제로 `ShoulderSafetyPanel`의 새 크로스-어댑터
버그를 처음 잡아냈다(고쳤다고 생각했던 게이트가 여전히 부족했음을
증명). `HipSafetyPanel.tsx`/`TmjSafetyPanel.tsx`/
`AnkleFootSafetyPanel.tsx`(별도 파일)의 게이트와 `CommonSafetyBanner.tsx`의
`asArray` 사용을 각각 소스 정규식으로 검증. `menopauseSleepSummaryLines`
(2차에서 고쳤지만 그동안 테스트 커버리지가 없었던 것을 3차 리뷰가
지적) 자체 가드에 대한 정규식도 추가. `npm run test:doctor` 816/816
(+16), `npm run test:doctor-workspace` 120/120(+63).

**실사용 재검증**: 워크스페이스 시나리오 중 하나("어깨 통증(불확실/재검
필요)")를 실제 서버에 `modules.neck`+`safety_flags.neck`을 지운 채로
POST하고 Doctor UI를 Playwright로 열어 확인 — 수정 전: 크래시 →
`DoctorRecordErrorBoundary`가 잡아 fallback, 수정 후: **정상 임상
화면이 그대로 렌더**되고 어깨 안전 패널만 조용히 생략됨(사실을
지어내지 않고 "정보 없음"으로 fail-closed), page error 0건.
스크린샷으로 육안 확인 완료.

**재검증**: `npx tsc -b --force` clean, `npm run test:all`(exit 0,
FAIL 0건), `npm run build`/`build:preview` clean, `tablet core`
pytest 80/80, `git diff origin/main -- src/spec/*Logic.ts
src/spec/*Adapter.ts` 0 lines(FROZEN 유지) — 전부 통과.

**다음 단계**: 이번 수정 커밋을 push하고, 4차(closing) 독립
`model:opus` 리뷰를 새로 호출한다. 세 라운드 연속으로 "같은 클래스의
자매 코드를 놓친다"는 패턴이 반복됐으므로, 이번엔 "레거시 서브모듈
누락"류가 아닌 다른 각도(예: 여러 지역이 동시에 primary인 조합,
`primary_module_detail`과 `primary_location`이 실제로 어긋나는
케이스, 페이로드 크기/깊이 등 이 배치가 원래 요구했던 5번
항목-보안/pathological shape-의 재검토)까지 포함해 훑어달라고
요청한다. 4차 리뷰가 CLEAN이면 PR #24에 이 배치의 종료 상태
코멘트를 남긴다. DO NOT MERGE, DO NOT PUSH MAIN 그대로 유지 — 최종
merge 판단은 항상 사용자(Product Owner).

**4차 독립 `model:opus` closing 리뷰** (진짜 subagent 호출, 커밋
`9636d3f` 대상): **NOT CLOSABLE 판정** — "레거시 서브모듈 누락"류가
아닌 다른 각도로 훑어달라는 요청대로, 이번엔 네임스페이스는 전부
존재하지만 리프가 비어있거나(namespace-complete-but-leaf-hollow)
타입이 잘못된(wrong-typed leaf) 케이스에서 HIGH 2건을 직접 실행으로
증명했다 — 둘 다 `isDoctorPayloadShapeUsable`이 top-level 존재만
확인하도록 설계돼 있어(leaf까지 검사하면 임상 추론이 됨) 통과시키는
게 의도된 동작이라, 렌더 쪽에서 반드시 버텨야 하는 케이스. (HIGH-2)
frozen `lbpAdapter.ts`/`neckAdapter.ts`의 `mapPregnancyStatus`가
`reproductive_status.derived`가 존재해도 그 안의 `.source`를
무조건 읽는다 — `derived`가 없거나(namespace 삭제가 아니라 그
안의 leaf가 없는 경우) `null`이면 던짐, Lbp/Neck/Shoulder(어깨는
neckAdapter를 내부 호출하므로 전이) SafetyPanel 전부에서 재현.
(HIGH-3) 같은 두 adapter의 `mapMajorHistory`가
`medical_history.medical_history_flags` 배열의 각 원소에
무조건 `.toUpperCase()`를 호출한다 — `Array.isArray()`로 컨테이너만
확인하고 원소 타입은 확인하지 않는 이 배치의 기존 가드(`asArray`)로는
못 막는 클래스: 배열 자체는 있지만 원소 중 하나가 `null`/숫자/객체인
경우. MEDIUM 3건도 함께 지적: (M4) `DoctorView.tsx` 자기 자신의
`useEffect`(recorder 결과로 EMR 요약 텍스트를 시딩하는 effect, 2323행
근방) 가 `payloadShapeOk`와 무관하게 항상 실행되고 그 안에서
`primaryConcernLabel(r)`을 무조건 호출한다 — JSX 쪽 EMR 패널은
`payloadShapeOk`로 게이트돼 있지만 hook 자체는 조건부로 건너뛸 수
없으므로, payload가 malformed인 레코드에 recorder 결과가 먼저
도착하면(패널이 화면에 없어도) 이 effect가 `DoctorView`라는 부모
컴포넌트 안에서 직접 던진다 — `DoctorRecordErrorBoundary`는 자신의
자식 렌더만 잡으므로 이 예외는 그 경계를 완전히 우회한다(이 배치가
원래 막으려던 바로 그 문제 클래스가 effect 쪽 사각지대로 남아있던
것). (M5) 레코드 A→B 전환 시 recorder polling effect가
`emrText`/`recorderResults`/`emrSeedRecordingIdRef`를 "이번
레코드가 서버모드+visit_id 있음" 조건의 early-return 분기 안에서만
리셋해서, A/B 둘 다 visit_id가 있는 정상 케이스는 이 분기를 안
타 예전 값이 새 레코드 화면에 그대로 남을 수 있었다(boundary의
`key={selectedRecord?.id}`는 `DoctorView` 자신의 이 state를
remount하지 않으므로 못 잡음). (M6) 9개 SafetyPanel의
`isNonEmptyObject`류 게이트가 아직 없어 `modules.<region> = {}`
(네임스페이스는 있지만 완전히 빈 객체) 케이스가 열려 있었음. LOW/NIT
몇 건(saju.pillars.day/hour 비문자열, additionalConcern.ts 객체
truthy 체크, DoctorWorkspace.tsx NaN 무한 재렌더 위험 등)도 함께
보고됐으나 실사용 도달 불가능성이 높아 이번 라운드에선 HIGH/MEDIUM만
우선 처리.

**수정**: (1) `DoctorView.tsx`에 `isNullOrStringArray`/
`isNonEmptyObject` 헬퍼 추가. `LbpSafetyPanel`/`NeckSafetyPanel`
게이트에 `reproductive_status.derived` 존재 확인과
`medical_history_flags`가 null이거나 문자열만 담은 배열인지 확인을
추가(frozen adapter가 실제로 읽는 필드만 정확히 대응 —
`grep -ln "reproductive_status\|medical_history_flags\|mapPregnancyStatus\|mapMajorHistory" src/spec/*Adapter.ts`로
lbpAdapter.ts/neckAdapter.ts 둘뿐임을 먼저 확인한 뒤 범위를
Lbp/Neck/Shoulder로 정확히 좁힘). `ShoulderSafetyPanel`은 3차 리뷰가
이미 요구한 `modules.neck` 조건에 이 두 조건을 추가로 얹음(전이적
의존성이 같은 두 필드에도 적용되므로). Knee/Elbow/WristHand 게이트는
`isNonEmptyObject(modules.<region>)`로 M6 해결(이 세 지역은 저 두
필드를 안 읽으므로 그 이상은 불필요). `HipSafetyPanel.tsx`/
`TmjSafetyPanel.tsx`/`AnkleFootSafetyPanel.tsx`(별도 파일) 각각에
동일한 로컬 `isNonEmptyObject` 헬퍼를 추가해 같은 방식으로 M6 해결.
(2) M4: EMR 시딩 effect 맨 앞에 `if (!payloadShapeOk) return`
추가하고 의존성 배열에 `payloadShapeOk` 포함 — JSX 게이트와 hook을
동일한 조건으로 동기화. (3) M5: recorder polling effect의 리셋 3줄
(`setRecorderResults(null)`/`setRecorderResultsError(null)`/
`setEmrText('')`/`emrSeedRecordingIdRef.current = null`)을
early-return 분기 밖으로 빼서 effect가 실행될 때마다(즉
`[mode, selectedRecord?.visit_id]`가 바뀔 때마다) 무조건 먼저
실행되게 하고, 그 다음에만 `mode !== 'server' || !visit_id`를
확인해 새 poll을 시작할지 결정하도록 순서를 바꿈.

**신규/보강 회귀 테스트**: `tests/doctor.spec.mjs`에 9개 SafetyPanel
게이트 전체(Neck/Knee/Elbow/WristHand 공용 정규식 + Shoulder/Lbp
전용 다중 조건 정규식 + Hip/Tmj/AnkleFoot `isNonEmptyObject` 정규식)를
새 게이트 텍스트에 맞게 재작성하고, `isNonEmptyObject`/
`isNullOrStringArray` 헬퍼 정의 자체를 확인하는 정규식 2개 추가.
`npm run test:doctor` 819/819(+3). `tests/doctor-workspace.spec.mjs`에
7개 실제 시나리오 × 3개 mutation(① `reproductive_status.derived`
삭제 ② `derived = null` ③ `medical_history_flags`에 `null`/`42`/
객체가 섞인 배열)의 21개 신규 behavioral 테스트 추가(모두
`DoctorWorkspace`를 `renderToString`으로 직접 렌더링해 안 던지는지
확인) — 기존 63-조합 지역 삭제 루프가 이 두 클래스(네임스페이스는
있지만 leaf가 없거나 wrong-typed)를 커버하지 못했다는 걸 리뷰가
지적한 정확히 그 형태. `npm run test:doctor-workspace` 141/141(+21).
M4/M5는 `useEffect` 안 로직이라 `renderToString`(SSR, effect 미실행)
기반 테스트로는 검증 불가능해 별도 유닛 테스트를 만들지 않고 아래
실사용 재검증으로 직접 확인했다.

**실사용 재검증**(로컬 서버+`vite --host` 기동, Playwright): 실제
questionnaire builder 시나리오 기반 정상 제출건 2개(A/B, 서로 다른
가상 환자)와 `routing: null` + 극단적으로 sparse한 `responses`
(payloadShapeOk가 false가 되는 레거시/손상 케이스, C)를 실제
`POST /api/submissions`로 생성. C의 visit에 recorder 결과를
**페이지 로드 전에 미리** POST해 M4의 정확한 repro window(효과가
"malformed 레코드에 recorder 결과가 이미 도착해 있는" 상태에서
첫 poll이 즉시 실행되는 순간)를 재현 — 수정 후: C를 열어도 fail-closed
fallback("이 기록의 상세 임상 화면을 표시할 수 없습니다")이 정상
표시되고 `pageerror` 이벤트 0건. A에는 recorder 결과를 POST하고
Doctor UI에서 A를 열어 "자료 보기" 탭의 EMR 요약 textarea에 seed된
값(`구조화된 note.assessment`로 넣은 마커 문자열)이 정확히 나타남을
DOM에서 직접 확인 — 그 다음 목록으로 돌아가 recorder 결과가 아직
없는 B로 전환: 전환 직후(50ms 뒤)와 안정화 뒤(1.5초 뒤) 둘 다 A의
마커 문자열이 어디에도 남아있지 않음(M5 재검증) — B의 "진료 녹취·요약"
섹션은 정확히 "아직 결과 없음"으로 초기화된 상태를 보여줌. 전체 QA
동안 `pageerror` 이벤트 0건(콘솔에 뜬 유일한 에러는 무관한 favicon
404).

**재검증**: `npx tsc -b --force` clean, `npm run test:all`(exit 0,
FAIL 0건), `npm run build`/`build:preview` clean, `tablet core`
pytest 80/80, `git diff origin/main -- src/spec/*Logic.ts
src/spec/*Adapter.ts` 0 lines(FROZEN 유지) — 전부 통과.

**다음 단계**: 이번 수정 커밋을 push하고, 5차 독립 `model:opus`
리뷰를 새로 호출한다(자기 자신의 요약을 신뢰하지 말고 직접 실행해
깨보라는 요청 포함). CLEAN이면 PR #24에 이 배치의 종료 상태 코멘트를
남긴다. DO NOT MERGE, DO NOT PUSH MAIN 그대로 유지 — 최종 merge
판단은 항상 사용자(Product Owner).

## Current Branch
`feat/doctor-clinical-workspace` (PR #24, DO NOT MERGE). **이 절
자체는 Medication/Herbal CRM 배치가 CLOSED되던 시점(`5ede4ac`)의
기록이며 그대로 보존한다 — 그 뒤 Episode↔Medication association
integrity 배치가 이어져 실제 최신 HEAD는 맨 위 절을 참고할 것
(3차 독립 리뷰까지 CLEAN, `97a9e8c` 기준). 3차 독립 리뷰 자체가
바로 이 줄의 HEAD 기술이 stale해진 것을 LOW로 지적 — 발견 즉시
갱신).**

Medication/Herbal CRM 배치, 오너의 "NOT CLEAN" 2차 검수(`bff300c` 대상)
지적사항(`0d5464b`) + 1~7차 독립 클로징 리뷰 수정(`d8e66d7`/`e067c94`/
`898ccdc`/`bd8d094`/`0192384`/`5ede4ac`) — **7차에서 CLEAN 판정,
배치 CLOSABLE.** 4~6차 리뷰 셋 다 소스 버그 0건을 명시(6차는 A→B
시나리오를 직접 재추적해 독립 동의까지 포함) — 남은 건 테스트
커버리지 빈틈뿐이었고
매 라운드로 닫음.

**7차 독립 `model:opus` 클로징 리뷰(완료, `5ede4ac` 대상) — 최종
판정 CLEAN**: fresh subagent 호출(13개 regex mutation + 4개 신규
관점 검증)로 `5ede4ac` 검수. 6차가 찾은 두 lazy-bridge 문제 모두
실제로 닫혔음을 mutation으로 재확인(review 6가 쓴 정확히 같은
mutation 포함), timer/microtask pin도 정상 발화 확인(이 저장소의
다른 doctor UI 파일들에 실제로 존재하는 debounce-save `setTimeout`
패턴과 대조해 오탐 위험도 판단 — 감수할 만한 trade-off로 결론).
**소스는 4라운드 연속(4~7차) 결함 0건.** 이번 라운드가 처음
시도한 새 관점(`&lt;details&gt;`의 `onToggle`이 React 18에서 실제로
발화하는지 자체 검증 — non-delegated event set에 포함됨을 확인;
두 UX 수정의 접근성 — `aria-pressed` 정확히 갱신, focus loss 없음;
별도 파일 `tests/medication-course.spec.mjs`가 여전히 실제
`crmStore.js`를 import해 통과하는지; `HANDOFF.md` 6라운드 기록
자체의 내적 일관성) 전부 문제 없음. NIT 1건(두 새 regex가
`matchAll`+유일성 검증이 아니라서 이론상 "죽은 위치에 verbatim
복제된 핸들러" 같은 극히 인위적인 mutation엔 여전히 뚫림) —
리뷰어 스스로 "8차를 열 만한 기준을 못 넘는다"고 명시, 코드 변경
없이 기록만. **리뷰어 명시적 권고: "이 배치를 CLOSABLE로 선언하는
것이 지금 타당하다" — PR #24에 클로징 코멘트 게시 진행.**

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
- (신규, round 18) `RevisitWorkspace.tsx`는 visit 레코드의 `updated_at`을
  로드 시점에 한 번만 갱신한다(제출건의 "열람함" 버그와 달리, revisit을
  여는 동작 자체는 visit 레코드에 아무것도 쓰지 않으므로 같은 종류의
  버그는 없음을 확인함). 다만 `setRecorderPointer`(녹음 결과 연결)가
  같은 visit 레코드의 `updated_at`을 독립적으로 올릴 수 있는 이론상
  낮은 확률의 경로가 남아 있다 — 발생해도 데이터 손실 없이(fail-closed
  배너로) 안전하게 처리되며, 이 경로에 별도 캐시 무효화 로직을 추가하는
  것은 이번 배치 범위 밖(불필요한 복잡도)으로 판단.

## Next Recommended Action
(위 "Episode↔Medication association integrity 배치" 섹션 기준 갱신 —
1~3차 독립 `model:opus` 리뷰 전부 완료, 3차는 코드 기준 CLEAN(LOW
2건은 HANDOFF 기록 자체의 stale 참조였고 이 갱신으로 반영됨).
Medication/Herbal CRM 배치는 이미 CLOSED, 재검수 대상 아님.)
-2. **완료됨**: 이번 배치(Episode retry-idempotency, ambiguity
   picker, ownership check)의 독립 `model:opus` 리뷰 1~3차 모두
   실제로 호출·완료(`55949f3`→`08eca1b`→`97a9e8c`, HIGH 3건·MEDIUM
   2건 수정, 나머지는 판단 근거와 함께 기록). 3차 판정: 코드 CLEAN.
   **다음 단계**: PR #24에 클로징 상태 코멘트 게시, 그 다음은
   Gomars93이 검토·merge 여부 직접 판단. 이 세션은 스스로 merge하지
   않는다.
-1. **완료됨(Medication/Herbal CRM 배치)**: 7차 독립 `model:opus` 리뷰가 `5ede4ac`를 CLEAN으로
   판정(HIGH/MEDIUM/LOW 0건, NIT 1건은 "8차를 열 기준을 못 넘는다"고
   리뷰어 스스로 명시, 코드 변경 없이 기록만) — 소스는 4라운드 연속
   (4~7차) 결함 0건. 리뷰어가 명시적으로 "지금 CLOSABLE 선언이
   타당하다"고 권고. **다음 단계**: PR #24에 클로징 상태 코멘트
   게시(완료 예정, 이 세션에서 진행) — 그 다음은 Gomars93이 PR #24
   전체를 검토하고 merge 여부를 직접 판단. **이 세션은 절대 스스로
   merge/main push하지 않는다.**
0. **HUMAN DECISION REQUIRED**: 위 "Quick Revisit 발송" 섹션의 재시작-후-
   자동재시도 복구 방식 — 현재의 human-mediated 수동 재시도로 충분한지,
   아니면 신원 정책을 건드리지 않는 bounded/short-lived 자동 복구가
   별도로 필요한지 Gomars93의 판단이 필요. PR #24 코멘트에 상세 플래그.
   (이번 round 18과는 무관, 여전히 미해결.)
1. Round 18(stale-write CAS 배선)은 초기+클로징+3차 독립 `model:opus`
   리뷰를 모두 완료하고 모든 발견 사항(HIGH 1, MEDIUM 3)을 수정·재검증
   완료 — CLOSABLE로 판단(위 섹션 참고).
1-1. PR #23/#24 통합 리허설(로컬 임시 브랜치, main/두 PR 브랜치 모두
   미변경)을 완료 — 실제 병합 시점에 참고할 충돌 파일 목록과 해결
   방향을 HANDOFF에 기록(위 섹션 참고). 실제 병합은 Gomars93이 각
   PR을 검토·승인한 뒤 원하는 순서로 직접 진행.
2. Gomars93(PR 작성자/review author)가 이번 배치(HEAD `7930cc1`)와
   PR #24를 검토하고, 최종 merge 여부를 직접 판단한다 — 이 세션은
   절대 스스로 merge하지 않는다.
3. ~~round 17이 의도적으로 미룬 항목~~ → **round 18에서 완료**: Doctor
   Workspace/RevisitWorkspace/JudgmentPanel이 이제 실제로
   `expectedUpdatedAt`을 보내고 409를 fail-closed 배너(자동 병합 없음,
   명시적 reload만)로 처리한다.
4. Test 0(Naver→Sigma 예약 반영 live 검증)는 여전히 PENDING — Naver
   연동이 라이브가 될 때까지 보류, 라이브 전환 후 실제 예약 5건으로
   재시도.
5. round 16 closing review가 남긴 nitpick(문서화만, 코드 변경 없음)은
   여전히 급하지 않음.
6. 모델 role routing(Opus/Sonnet/Fable 자동 호출)은 여전히 수동.
7. PR #24는 여전히 사용자가 직접 검토 후 merge 여부를 결정한다.
