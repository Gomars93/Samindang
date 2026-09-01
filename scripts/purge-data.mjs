#!/usr/bin/env node
// 파일럿 종료 후 전체 삭제. 파괴적 작업이므로:
//   - 대화형 실행에서는 "DELETE"를 정확히 입력해야 지운다.
//   - 비대화형(TTY 없음)에서는 --yes 없이는 무조건 거부한다.
// 사용: npm run purge:data  (또는  node scripts/purge-data.mjs --yes)
//
// Data purge/audit batch: 전체 인벤토리(무엇이 어디서 어떻게 지워지는지)를
// 여기 한 곳에 적어 감사 가능하게 유지한다 -- 새 저장소 디렉터리를 추가하는
// 다음 라운드는 반드시 이 목록과 tests/crm-store.spec.mjs의 purge-data
// 드리프트 가드 테스트를 함께 갱신해야 한다.
//   - submissions/, recorder-results/, micro-follow-up/,
//     follow-up-sessions/{tokens,by-visit}/, stations/  -- store.purgeAll()
//     (server/store.js)를 통해 삭제
//   - visits/ (재진 visit + 임상의가 저장한 visit workspace 메모)
//     -- store.purgeAll() -> visitStore.purgeAll()로 위임 (이 배치에서 추가)
//   - crm/{episodes,tasks,dedup}/ (CRM Episode/Task, 환자 uuid·사유코드 포함)
//     -- crmStore가 createStore() 바깥에서 별도 생성되므로(server/index.js)
//     여기서 명시적으로 rm -rf (이 배치에서 추가)
//   - crm-identity/{links,by-chart,pending}/ (Sigma chart_no + 확정 이름 --
//     PHI) -- patientIdentityStore도 별도 생성되므로 명시적으로 rm -rf
//     (Identity Production Batch에서 추가)
//   - messaging/ (Quick Revisit 발송 MessageRecord -- 전화번호는 애초에
//     저장하지 않음, patient_id + follow-up 토큰 해시만) -- messagingStore도
//     별도 생성되므로 명시적으로 rm -rf (SOLAPI 스캐폴드 배치에서 추가)
//   - audit.log -- purgeAuditLog()(server/audit.js)
//   - owner.lock (round 17, 서버 프로세스가 이 데이터 디렉터리를 자신이
//     소유 중임을 나타내는 파일 -- server/ownerLock.js) -- 이 스크립트는
//     purge를 시작하기 전에 이 lock을 자기 자신이 직접 획득한다(살아있는
//     서버가 있으면 여기서 거부됨). 단순 "확인 후 진행"이 아니라 실제로
//     lock을 쥐고 있는 동안만 purge를 진행하는 이유: 확인과 삭제 사이에
//     실제 서버가 떠서 이 lock을 가져가 버리는 TOCTOU를 막기 위함 --
//     purge가 lock을 쥐고 있는 동안은 실제 서버도 시작을 거부당한다.
//     purge가 끝나면 자신이 쥔 lock을 해제(=lock 파일 삭제)한다.
//
// 명시적 목록 방식을 택한 이유: dataDir(SAMINDANG_DATA_DIR)는 운영자가
// 임의 경로로 지정할 수 있어(RUNBOOK 참고) 그 상위 디렉터리를 통째로
// "스캔 후 제외 목록 빼고 삭제"하면 운영자의 무관한 파일까지 지울 위험이
// 있다 -- 기본 구성(./.data)에서만 전용 디렉터리가 보장된다. 대신
// "새 저장소 디렉터리를 빠뜨릴 위험"은 드리프트 가드 테스트로 방어한다.
import { createInterface } from 'node:readline/promises'
import { rm } from 'node:fs/promises'
import path from 'node:path'
import { hostname } from 'node:os'
import { createStore } from '../server/store.js'
import { purgeAuditLog } from '../server/audit.js'
import { acquireOwnerLock, OwnerLockConflictError, readOwnerLockStatus, releaseAnyLockNamedThisProcess, requirePositiveMs } from '../server/ownerLock.js'

// Third-round closing-review finding: a raw pid-liveness probe, independent
// of whatever SAMINDANG_OWNER_LOCK_STALE_MS is configured to. Returns true
// only when a process with this pid genuinely exists RIGHT NOW -- signal 0
// sends no actual signal, it only tests existence/permission. EPERM means
// the process exists but this user can't signal it (still alive -- treat
// as alive, the conservative direction for a destructive script); ESRCH
// means it does not exist (dead, safe to treat as no live owner).
function isPidAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return err.code === 'EPERM'
  }
}

const dataDir = process.env.SAMINDANG_DATA_DIR ?? './.data/submissions'
const dataRoot = path.join(dataDir, '..')
const identityDir = path.join(dataRoot, 'crm-identity')
const crmDir = path.join(dataRoot, 'crm')
const messagingDir = path.join(dataRoot, 'messaging')
const yes = process.argv.includes('--yes')

// Module-scope (not a local in main()) so the signal handlers below can see
// it, whatever point in main()'s execution a signal arrives at.
let ownerLock = null

// Fourth-round closing-review re-check: an earlier version only listened
// for 'SIGINT' on the readline interface itself, registered from inside
// the confirmation-prompt block. That has a real gap -- it only exists
// while a question is actually pending, and there is a window right
// AFTER the lock is acquired but BEFORE that listener is registered
// (during the pid-liveness check, staleAfterMs validation, etc.) where a
// Ctrl-C falls through to Node's own default SIGINT disposition instead,
// which terminates the process without running this script's `finally`
// (the same class of problem `process.exit()` causes elsewhere in this
// file). Reproduced empirically: flaked in roughly 1 of 5 real runs even
// on an idle machine. A single PROCESS-level handler, registered here
// before any async work starts, closes that specific gap.
//
// Fifth-round closing-review finding (F5, comment-accuracy): the previous
// version of this comment claimed Node's documented default is for a
// readline `Interface` with no 'SIGINT' listener of its own to let the
// signal "reach `process` normally" -- verified against Node 22's actual
// readline source that this is backwards: with no rl-level 'SIGINT'
// listener, readline instead closes the interface itself and rejects the
// pending `question()` with an AbortError, entirely at the JS layer,
// WITHOUT the OS ever delivering a process-level SIGINT at all (the
// terminal is in raw mode while a prompt is active, so the OS never
// generates SIGINT for Ctrl-C in the first place -- readline reads the
// raw byte and decides what to do with it in JS). So this process-level
// handler only ever fires in the window BEFORE the prompt puts the
// terminal into raw mode (exactly the gap described above); WHILE a
// question is actually pending, Ctrl-C is caught by readline's own
// 'close' event instead, which the `Promise.race` below already handles.
// Both windows are covered, by two different mechanisms, not one.
//
// Fifth-round closing-review finding (F1, HIGH -- the actual bug, not just
// a comment): registering this handler does NOT by itself guarantee
// `ownerLock` (the module-scope variable above) is non-null by the time a
// signal arrives. On the stale-lock TAKEOVER path specifically,
// acquireOwnerLock() durably WRITES the lock file to disk (naming this
// process's real pid) and then deliberately sleeps out settleMs
// (currently 350ms) before it verifies and RETURNS -- and only that
// return assigns the local `ownerLock` here. A signal landing inside that
// settle window previously found `ownerLock` still null and skipped
// release entirely, leaking a lock that genuinely exists on disk and
// names this (about-to-exit) pid -- reproduced: a real server refused to
// start afterward, citing that now-dead pid, for up to staleAfterMs (90s
// default). Fixed by falling back to a direct disk check: if the current
// lock file on disk names OUR OWN pid, only this process could have
// written it (pids are unique among concurrently-live processes), so it
// is unambiguously safe to remove even without the handle/nonce
// acquireOwnerLock() would otherwise have returned.
// Sixth-round closing-review finding (HIGH -- same leak class as F1,
// different window): an earlier version of this function `return`ed right
// after calling `ownerLock.release()`, on the theory that a non-null
// handle always means release() can finish the job. It cannot, in one
// specific case: ownerLock.js's release() marks itself `released = true`
// SYNCHRONOUSLY, before its own first `await` (the read-then-unlink that
// actually removes the file) -- so a signal landing in that gap (measured
// ~4ms, not a theoretical microsecond window: reproduced 19-20% of the
// time in a targeted sweep) finds `ownerLock` already non-null, calls
// release() a second time, gets an instant early-return (release() treats
// itself as already in-progress/done), and an unconditional `return` here
// would then skip the disk-based fallback entirely -- leaking a lock
// naming this process's now-dead pid, later refusing a real server exactly
// like the original F1 bug.
//
// Seventh-round closing-review finding (hostname guard, and the retry
// loop): the hostname check and the short-retry disk fallback are now
// shared with server/index.js's identical signal-handling need (see
// releaseAnyLockNamedThisProcess's own comment in server/ownerLock.js for
// the narrow rename-in-flight race the retries close) -- centralized
// there instead of duplicated per-caller, the same reasoning as
// `requirePositiveMs` above.
async function releaseAnyLockWeMightHold() {
  await releaseAnyLockNamedThisProcess(dataDir, ownerLock)
}

// Fifth-round closing-review finding (F3): only SIGINT was handled -- the
// same leak class (a durably-written lock this process can no longer
// release through its normal `finally`) is equally reachable via
// SIGTERM (`kill <pid>` default, a supervisor/systemd stop) or SIGHUP (a
// closed terminal), both at least as likely as an operator's own Ctrl-C
// in a real deployment. Reproduced: a plain `kill` while this script held
// the prompt-stage lock left it behind. Same handler, all three signals.
//
// Fifth-round closing-review finding (F4): `process.on` does not
// serialize handler invocations, and `release()` (server/ownerLock.js)
// marks itself released synchronously before its own first `await` -- so
// two signals arriving close together could both pass the `if (ownerLock)`
// check before either finishes, and the second `process.exit()` could
// fire before the first invocation's actual unlink lands. Guarded with a
// plain reentrancy flag; the exit code still reflects whichever signal
// arrived first.
let exiting = false
const SIGNAL_EXIT_CODES = { SIGINT: 130, SIGTERM: 143, SIGHUP: 129 }
for (const sig of Object.keys(SIGNAL_EXIT_CODES)) {
  process.on(sig, () => {
    if (exiting) return
    exiting = true
    ;(async () => {
      await releaseAnyLockWeMightHold()
      process.exit(SIGNAL_EXIT_CODES[sig])
    })()
  })
}

async function main() {
  if (!process.stdin.isTTY && !yes) {
    console.error('refusing to run non-interactively without --yes (e.g. `node scripts/purge-data.mjs --yes`)')
    process.exit(1)
  }

  // Round 17: a live server process owns this data dir (server/ownerLock.js)
  // and holds in-memory state (pending writes, dedup caches, active-visit
  // pointers) this script knows nothing about. Deleting everything out from
  // under it would not just lose data on disk -- an in-flight request could
  // resurrect a file mid-purge, or the server could keep serving stale
  // in-memory state that no longer matches an empty disk.
  //
  // Closing-review finding: an earlier version of this check only READ the
  // lock's freshness once (via readOwnerLockStatus) and proceeded if it
  // looked stale -- a plain check-then-act with a real TOCTOU window: a
  // server could start and take the lock at any point between this
  // script's check and its actual deletion. Fix: this script now ACQUIRES
  // the same owner lock itself (the same primitive a real server uses) for
  // the duration of the purge. That closes the window in both directions
  // -- a server already live makes this call fail with
  // OwnerLockConflictError (refuse, exactly as before), and holding the
  // lock for the purge's own duration means a server trying to start
  // WHILE this script is deleting also correctly refuses (it would see a
  // lock this script freshly holds). It also automatically reads the same
  // SAMINDANG_OWNER_LOCK_STALE_MS the server itself honors (an earlier
  // version hardcoded its own default and could diverge from an operator
  // who raised the server's window), since it goes through the identical
  // acquireOwnerLock() staleness logic instead of a second, separately
  // maintained copy of it.
  //
  // Second-round closing-review finding (NEW-1, HIGH/data-loss): an
  // earlier version of this block only checked `Number.isFinite` on
  // SAMINDANG_OWNER_LOCK_STALE_MS before passing it through --
  // `Number("0")` and negative values ARE finite, and ownerLock.js's
  // isFresh() computes `ageMs < staleAfterMs`, so a threshold of 0 (or
  // negative) makes EVERY lock read as stale regardless of age. Verified
  // empirically: with SAMINDANG_OWNER_LOCK_STALE_MS=0, this script
  // successfully purged a data directory while a real server process was
  // still live and serving requests against it -- exactly the corruption
  // this lock exists to prevent, and strictly worse than the TOCTOU it was
  // written to close, because it doesn't even need a race: a single
  // mistyped env var is enough. `requirePositiveMs` (shared with
  // server/index.js, see its own comment) rejects zero/negative/malformed
  // values outright instead of silently treating them as "always stale".
  //
  // Third-round closing-review finding: requirePositiveMs alone does NOT
  // close this hazard, only narrows it -- it rejects non-positive/malformed
  // values, but a SMALL positive one (SAMINDANG_OWNER_LOCK_STALE_MS=90, the
  // single most plausible typo for the 90000ms default: an operator
  // thinking in seconds) still passes validation and still makes a
  // genuinely live server's lock read as stale. Verified empirically. No
  // threshold value chosen here can be "safe" for every possible operator
  // mistake, so add an independent, threshold-agnostic check: read the
  // CURRENT lock record (regardless of its staleness) before attempting
  // any takeover, and if it names a pid that is actually alive on THIS
  // host right now, refuse outright -- no staleAfterMs value can override
  // this. (A different hostname means this check cannot verify liveness
  // locally; falls through to the staleness-based path below, same as
  // before this fix -- this repo's local-LAN single-host deployment model,
  // per docs/RUNBOOK_LOCAL_HANDOFF.md, makes that the rare case, not the
  // common one.) This is a defense-in-depth layer, not a replacement for
  // acquireOwnerLock's own staleness logic below -- it does not protect
  // against a stale-lock's pid being reused by an unrelated process by the
  // time this check runs (the same inherent limitation any pidfile-based
  // check has), which is exactly why the staleness/takeover path still
  // exists as the primary mechanism for a genuinely dead owner.
  //
  // Deliberately checked in this order -- `staleAfterMs` validated FIRST,
  // liveness probed SECOND: a malformed/non-positive env var gets its own
  // specific, actionable message ("is not a valid positive number of
  // milliseconds") rather than being masked by the generic liveness
  // refusal below when a live server also happens to be present (this
  // ordering has its own regression test, see the "the refusal ... names
  // it as an invalid value, not a false already-owned report" assertions
  // in tests/owner-lock.spec.mjs). Both checks still run, and both still
  // refuse, before any takeover is ever attempted -- the diagnostic
  // clarity only changes which message the operator sees first, never
  // whether the purge is allowed to proceed.
  const staleAfterMs = requirePositiveMs('SAMINDANG_OWNER_LOCK_STALE_MS', 90000)

  const { record: currentLock } = await readOwnerLockStatus(dataDir, {})
  if (currentLock && currentLock.hostname === hostname() && isPidAlive(currentLock.pid)) {
    console.error(
      `refusing to purge: pid ${currentLock.pid} on this host is a live process (owner.lock names it) -- this refusal does not depend on SAMINDANG_OWNER_LOCK_STALE_MS, so a misconfigured threshold cannot bypass it. Stop the server first, then re-run this script.`,
    )
    process.exitCode = 1
    return
  }

  try {
    ownerLock = await acquireOwnerLock(dataDir, { staleAfterMs })
  } catch (err) {
    if (err instanceof OwnerLockConflictError) {
      console.error(`refusing to purge: ${err.message.replace('refusing to start a second process against the same data directory', 'stop the server first, then re-run this script')}`)
    } else {
      console.error(`refusing to purge: could not acquire the data directory owner lock -- ${err.message}`)
    }
    process.exitCode = 1
    return
  }

  // Second-round closing-review finding (NEW-2/NEW-3): everything from
  // here on must release the lock this script itself took above on EVERY
  // exit path -- an operator aborting the confirmation prompt, or any
  // error during the actual deletion -- not just the success path. An
  // earlier version only released after a clean run, so an abort or a
  // mid-purge throw left a fresh lock naming this (by-then-exited) process
  // behind, wedging the real server out with a misleading "already owned
  // by another live process" refusal for up to staleAfterMs (90s default).
  // `process.exitCode = 1; return` (not `process.exit(1)`) is deliberate
  // in every branch below the try -- `process.exit()` terminates
  // immediately and does NOT run a pending `finally` block, which would
  // silently reintroduce the exact same lock leak.
  try {
    if (!yes) {
      const rl = createInterface({ input: process.stdin, output: process.stdout })
      let answer = null
      try {
        // Third-round closing-review finding: `await rl.question(...)`
        // alone never settles on Ctrl-D (EOF/stdin closed) at this prompt
        // -- reproduced: the process stays alive indefinitely, and because
        // the owner lock is already held and heartbeating (acquired
        // above), that means a real server is wedged out INDEFINITELY,
        // not just for staleAfterMs, until someone finds and kills this
        // orphaned process. Race the question against readline's own
        // 'close' event so EOF is treated the same as answering anything
        // other than "DELETE" (abort, fall through to the shared `finally`
        // below that releases the lock) instead of hanging forever while
        // holding it. Ctrl-C (SIGINT) is deliberately NOT raced here --
        // see the module-level `process.on('SIGINT', ...)` handler's own
        // comment for why a readline-scoped listener has a real gap a
        // process-level one does not.
        answer = await Promise.race([
          rl.question(`This will PERMANENTLY delete ALL stored submissions in "${dataDir}".\nType DELETE to confirm: `),
          new Promise((resolve) => {
            rl.once('close', () => resolve(null))
          }),
        ])
      } finally {
        rl.close()
      }
      if (answer !== 'DELETE') {
        console.log('Aborted — no data was deleted.')
        process.exitCode = 1
        return
      }
    }

    const store = createStore(dataDir)
    const count = await store.purgeAll()
    await purgeAuditLog(dataDir)
    await rm(crmDir, { recursive: true, force: true })
    await rm(identityDir, { recursive: true, force: true })
    await rm(messagingDir, { recursive: true, force: true })
    console.log(
      `Purged ${count} file(s) from "${dataDir}" and its sibling stores (visits/, recorder-results/, micro-follow-up/, follow-up-sessions/, stations/), cleared the audit log, and removed "${crmDir}", "${identityDir}", and "${messagingDir}".`,
    )
  } finally {
    // Release the lock this script itself took above -- this both removes
    // the lock file (part of "delete everything") on the success path and
    // ends the takeover window a real server could otherwise be refused
    // during on any other exit from the block above.
    await ownerLock.release()
  }
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
