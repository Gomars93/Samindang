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
import { createStore } from '../server/store.js'
import { purgeAuditLog } from '../server/audit.js'
import { acquireOwnerLock, OwnerLockConflictError, requirePositiveMs } from '../server/ownerLock.js'

const dataDir = process.env.SAMINDANG_DATA_DIR ?? './.data/submissions'
const dataRoot = path.join(dataDir, '..')
const identityDir = path.join(dataRoot, 'crm-identity')
const crmDir = path.join(dataRoot, 'crm')
const yes = process.argv.includes('--yes')

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
  let ownerLock
  try {
    const staleAfterMs = requirePositiveMs('SAMINDANG_OWNER_LOCK_STALE_MS', 90000)
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
      let answer
      try {
        answer = await rl.question(
          `This will PERMANENTLY delete ALL stored submissions in "${dataDir}".\nType DELETE to confirm: `,
        )
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
    console.log(
      `Purged ${count} file(s) from "${dataDir}" and its sibling stores (visits/, recorder-results/, micro-follow-up/, follow-up-sessions/, stations/), cleared the audit log, and removed "${crmDir}" and "${identityDir}".`,
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
