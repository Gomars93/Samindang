// Round 17 (restart-safe / multi-process correctness batch): proves
// server/ownerLock.js actually does what it claims, using REAL separate OS
// processes (child_process.spawn), not two in-process createApp() calls --
// see ownerLock.js's own header for why two createApp() instances in one
// Node process would NOT reproduce a multi-process race (they'd share the
// same module-scope `locks` Map inside server/store.js by accident).
// Plain node, no test framework: assert() prints "OK: <name>" and throws on
// failure -- same convention as tests/audit-registry.spec.mjs.
import { spawn, execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { createPatientIdentityStore } from '../server/patientIdentityStore.js'

let passCount = 0
function assert(name, cond) {
  if (!cond) throw new Error(`FAIL: ${name}`)
  passCount++
  console.log(`OK: ${name}`)
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const serverEntry = path.join(repoRoot, 'server', 'index.js')

async function readJsonOrNull(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'))
  } catch (err) {
    if (err.code === 'ENOENT') return null
    throw err
  }
}

function spawnServer(dataDir, extraEnv = {}) {
  const child = spawn(
    process.execPath,
    [serverEntry],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        SAMINDANG_DATA_DIR: dataDir,
        SAMINDANG_PORT: '0',
        SAMINDANG_HOST: '127.0.0.1',
        SAMINDANG_DOCTOR_TOKEN: 'test-doctor-token',
        ...extraEnv,
      },
    },
  )
  const state = { stdout: '', stderr: '', exitCode: null, exitSignal: null }
  child.stdout.on('data', (d) => { state.stdout += d.toString() })
  child.stderr.on('data', (d) => { state.stderr += d.toString() })
  child.on('exit', (code, signal) => {
    state.exitCode = code
    state.exitSignal = signal
  })
  return { child, state }
}

function waitUntil(predicate, { timeoutMs = 10000, intervalMs = 30 } = {}) {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const tick = () => {
      if (predicate()) return resolve()
      if (Date.now() - start > timeoutMs) return reject(new Error(`timeout waiting for condition (waited ${timeoutMs}ms)`))
      setTimeout(tick, intervalMs)
    }
    tick()
  })
}

async function waitForListening(proc) {
  await waitUntil(() => proc.state.stdout.includes('listening on') || proc.state.exitCode !== null)
}

async function waitForExit(proc, timeoutMs = 10000) {
  await waitUntil(() => proc.state.exitCode !== null, { timeoutMs })
}

// Closing-review finding: earlier revisions of this file never killed a
// still-running spawned server if a later assertion in the same block
// threw -- main().catch only sets process.exitCode, so a genuine
// regression here (a real bug this file exists to catch) could leave
// orphan `node server/index.js` processes running AND hang the whole
// test:all chain (and, in the local queue, the Stop-hook runner)
// indefinitely instead of failing fast. Every block below now tracks its
// spawned processes and force-kills any still alive in a finally, on
// EITHER a clean finish or a thrown assertion failure.
function killIfAlive(proc) {
  if (proc?.state?.exitCode === null && proc?.child && !proc.child.killed) {
    try {
      proc.child.kill('SIGKILL')
    } catch {
      // already gone
    }
  }
}

async function main() {
  /* =====================================================================
     Part 1: pre-fix-style reproduction -- prove the underlying race this
     batch's owner lock exists to prevent is REAL at the store layer, not
     speculative. server/patientIdentityStore.js itself has no
     multi-process guard (only the CLI boot path -- server/index.js's
     isMain() -- acquires the owner lock), so racing two separate
     processes directly against the store can reproduce the exact
     corruption a double-started server would otherwise cause: two
     different patient_uuids both durably claiming one sigma_chart_no,
     breaking the approved 1:1 identity policy.
     ===================================================================== */
  {
    const dataRoot = await mkdtemp(path.join(tmpdir(), 'samindang-ownerlock-race-'))
    try {
      const identityDir = path.join(dataRoot, 'crm-identity')
      const chartNo = 'CN-RACE-0001'
      const goAt = Date.now() + 400 // shared future instant both children spin-wait for

      const raceScript = `
        import { createPatientIdentityStore } from ${JSON.stringify(path.join(repoRoot, 'server', 'patientIdentityStore.js'))}
        const store = createPatientIdentityStore(${JSON.stringify(identityDir)})
        const patientUuid = process.env.RACE_PATIENT_UUID
        const goAt = Number(process.env.RACE_GO_AT)
        while (Date.now() < goAt) { /* spin-wait for the shared instant */ }
        try {
          const result = await store.linkPatientIdentity({
            patientUuid,
            chartNo: ${JSON.stringify(chartNo)},
            patientName: 'race-test-patient',
            confirmedBy: 'race-test-staff',
            now: new Date().toISOString(),
          })
          console.log(JSON.stringify({ ok: true, result }))
        } catch (err) {
          console.log(JSON.stringify({ ok: false, error: err.message }))
        }
      `

      function spawnRacer(patientUuid) {
        return spawn(process.execPath, ['--input-type=module', '-e', raceScript], {
          cwd: repoRoot,
          env: { ...process.env, RACE_PATIENT_UUID: patientUuid, RACE_GO_AT: String(goAt) },
        })
      }

      const uuidA = 'aaaaaaaa-0000-0000-0000-000000000001'
      const uuidB = 'bbbbbbbb-0000-0000-0000-000000000002'
      const [outA, outB] = await Promise.all(
        [spawnRacer(uuidA), spawnRacer(uuidB)].map(
          (child) =>
            new Promise((resolve, reject) => {
              let out = ''
              let err = ''
              child.stdout.on('data', (d) => { out += d.toString() })
              child.stderr.on('data', (d) => { err += d.toString() })
              child.on('exit', (code) => {
                if (code !== 0) return reject(new Error(`racer exited ${code}: ${err}`))
                resolve(out.trim())
              })
            }),
        ),
      )
      const resultA = JSON.parse(outA)
      const resultB = JSON.parse(outB)

      // The durable ground truth after both processes have raced: read the
      // reverse chart_no -> patient_uuid pointer directly, and both link
      // records, without going through any lock at all (this reproduction's
      // whole point is that no lock exists at this layer).
      const identityStore = createPatientIdentityStore(identityDir)
      const resolvedA = await identityStore.getIdentityByPatientUuid(uuidA)
      const resolvedB = await identityStore.getIdentityByPatientUuid(uuidB)
      const bothLinked = resolvedA !== null && resolvedB !== null
      const bothClaimChartNo = bothLinked && resolvedA.sigma_chart_no === chartNo && resolvedB.sigma_chart_no === chartNo

      // Closing-review finding: this race has THREE possible outcomes, not
      // two, and which one occurs is genuinely nondeterministic (depends on
      // OS scheduling of two spin-waiting processes) -- observed to flip
      // across repeated runs on the same machine. (a) both succeed and both
      // durably claim the same chart_no (silent duplicate, violating the
      // approved 1:1 identity policy). (b) the loser crashes with a raw
      // filesystem error (e.g. ENOENT on a shared tmp filename torn between
      // the two processes' concurrent atomicWrites) instead of the clean,
      // expected conflict. (c) the OS happens to schedule the two processes
      // serially enough that the store's own in-process lock (which each
      // process still has, just not shared with the other) produces the
      // textbook-correct outcome: one succeeds, the other cleanly rejects
      // with IdentityConflictError('chart_already_linked'). Outcome (c) is
      // NOT evidence the race is safe -- it is only evidence this
      // particular run happened not to interleave badly -- so a test that
      // FAILS on (c) is asserting the code behaved better than required,
      // which is a liability (a flaky failure that teaches nothing). This
      // test instead accepts all three as "the race produced a real,
      // recognized outcome" and only fails on something outside that set
      // (e.g. an uncaught exception shape neither process reported at
      // all), while still logging which outcome occurred so a human
      // reading CI output can see whether the race actually manifested.
      const cleanConflict = /chart_already_linked/
      const cleanlySerialized =
        (resultA.ok && !resultB.ok && cleanConflict.test(resultB.error)) ||
        (resultB.ok && !resultA.ok && cleanConflict.test(resultA.error))
      const crashedInsteadOfCleanConflict =
        (!resultA.ok && !cleanConflict.test(resultA.error)) || (!resultB.ok && !cleanConflict.test(resultB.error))
      console.log(
        `  (race reproduction) A: ${JSON.stringify(resultA)}  B: ${JSON.stringify(resultB)}  bothClaimChartNo=${bothClaimChartNo} crashedInsteadOfCleanConflict=${crashedInsteadOfCleanConflict} cleanlySerialized=${cleanlySerialized}`,
      )
      assert(
        'pre-fix reproduction: racing two processes directly against patientIdentityStore (no owner lock at this layer) produces one of the three known outcomes for this unlocked path -- a duplicate chart_no claim, an uncontrolled crash, or (nondeterministically, when the OS happens to serialize the two processes) a clean conflict; the first two are exactly the corruption class the owner lock exists to prevent at the server-boot layer (see Part 2), and this assertion never fails merely because a given run got lucky',
        bothClaimChartNo || crashedInsteadOfCleanConflict || cleanlySerialized,
      )
    } finally {
      await rm(dataRoot, { recursive: true, force: true })
    }
  }

  /* =====================================================================
     Part 2: two REAL server processes racing to boot against the same
     data dir. The owner lock must let exactly one through and refuse the
     other with a clear, operator-readable reason -- never both, never
     neither.
     ===================================================================== */
  {
    const dataRoot = await mkdtemp(path.join(tmpdir(), 'samindang-ownerlock-boot-'))
    let first, second
    try {
      const dataDir = path.join(dataRoot, 'submissions')

      first = spawnServer(dataDir)
      await waitForListening(first)
      assert('boot-race: first process reaches "listening"', first.state.exitCode === null && first.state.stdout.includes('listening on'))

      second = spawnServer(dataDir)
      await waitForExit(second)
      assert('boot-race: second process on the SAME data dir refuses and exits non-zero', second.state.exitCode !== 0)
      assert(
        'boot-race: refusal message names the conflict as an owner-lock issue',
        second.state.stderr.includes('already owned by another live process'),
      )
      assert('boot-race: refusal message never reached the point of also listening', !second.state.stdout.includes('listening on'))

      const lockAfterRefusal = await readJsonOrNull(path.join(dataRoot, 'owner.lock'))
      assert('boot-race: owner.lock still identifies the FIRST process as owner after the refused second attempt', lockAfterRefusal?.pid === first.child.pid)

      first.child.kill('SIGTERM')
      await waitForExit(first)
      assert('boot-race: first process exits cleanly on SIGTERM', first.state.exitCode === 0)
      const lockAfterGracefulExit = await readJsonOrNull(path.join(dataRoot, 'owner.lock'))
      assert('boot-race: graceful shutdown releases (removes) the owner lock file', lockAfterGracefulExit === null)
    } finally {
      killIfAlive(first)
      killIfAlive(second)
      await rm(dataRoot, { recursive: true, force: true })
    }
  }

  /* =====================================================================
     Part 3: SIGKILL (no graceful shutdown at all) leaves the lock file
     behind with a now-dead pid. A later process must NOT be blocked
     forever by it -- once its renewed_at is older than staleAfterMs, a new
     process takes over via the settle-and-reconfirm sequence in
     ownerLock.js.
     ===================================================================== */
  {
    const dataRoot = await mkdtemp(path.join(tmpdir(), 'samindang-ownerlock-takeover-'))
    let victim, tooSoon, rescuer
    try {
      const dataDir = path.join(dataRoot, 'submissions')
      // Small windows so this test doesn't take production's real 15s/90s.
      const fastEnv = { SAMINDANG_OWNER_LOCK_HEARTBEAT_MS: '150', SAMINDANG_OWNER_LOCK_STALE_MS: '450', SAMINDANG_OWNER_LOCK_SETTLE_MS: '50' }

      victim = spawnServer(dataDir, fastEnv)
      await waitForListening(victim)
      assert('takeover: victim process reaches "listening"', victim.state.stdout.includes('listening on'))
      const lockBeforeKill = await readJsonOrNull(path.join(dataRoot, 'owner.lock'))
      assert('takeover: owner.lock exists and names the victim pid before the kill', lockBeforeKill?.pid === victim.child.pid)

      victim.child.kill('SIGKILL')
      await waitUntil(() => victim.state.exitSignal === 'SIGKILL' || victim.state.exitCode !== null)

      // A second process started immediately (before staleAfterMs elapses)
      // must still refuse -- SIGKILL alone does not make the lock stale, only
      // the elapsed time since the last heartbeat does.
      tooSoon = spawnServer(dataDir, fastEnv)
      await waitForExit(tooSoon, 3000)
      assert('takeover: a process started immediately after SIGKILL (lock not yet stale) still refuses', tooSoon.state.exitCode !== 0)

      // Now actually wait out the stale window, then a new process must take
      // over successfully.
      await new Promise((resolve) => setTimeout(resolve, 700))
      rescuer = spawnServer(dataDir, fastEnv)
      await waitForListening(rescuer)
      assert('takeover: a process started after staleAfterMs elapses successfully takes over and listens', rescuer.state.stdout.includes('listening on'))

      const lockAfterTakeover = await readJsonOrNull(path.join(dataRoot, 'owner.lock'))
      assert('takeover: owner.lock now names the rescuer pid, not the dead victim', lockAfterTakeover?.pid === rescuer.child.pid)
      // Closing-review finding: this used to duplicate the pid check above
      // under a "fresh renewed_at" label without ever looking at
      // renewed_at. Actually compare timestamps.
      assert(
        'takeover: owner.lock has a genuinely fresher renewed_at from the rescuer, not a stale copy of the victim\'s',
        new Date(lockAfterTakeover?.renewed_at).getTime() > new Date(lockBeforeKill?.renewed_at).getTime(),
      )

      rescuer.child.kill('SIGTERM')
      await waitForExit(rescuer)
    } finally {
      killIfAlive(victim)
      killIfAlive(tooSoon)
      killIfAlive(rescuer)
      await rm(dataRoot, { recursive: true, force: true })
    }
  }

  /* =====================================================================
     Part 3b (closing-review finding, round 17 self-review): the ORIGINAL
     takeover logic (atomicWrite then immediately self-read) was NOT
     mutual exclusion -- two processes racing one stale lock could each
     rename in turn and each read back their OWN nonce before observing
     the other's later write, so BOTH proceeded to listen(). Confirmed
     empirically (outside this suite, via a standalone repro script) at
     roughly a 45% collision rate for two processes with zero settling.
     The fix adds a settle-then-reconfirm step (see ownerLock.js). This
     test seeds a stale lock directly (no victim process needed) and races
     several real processes against it at once -- exactly one must end up
     listening, and it must be the one owner.lock actually names.

     Second-round closing-review finding (NEW-4): an earlier version of
     this test spawned all N processes back-to-back with no arrival
     synchronization. Verified (via 20 repeated runs against a
     deliberately-reverted, known-buggy ownerLock.js) that plain spawn
     order alone reliably let the first-spawned process win outright
     BEFORE the others even attempted their takeover -- every "loser" in
     19 of 20 runs refused via the plain isFresh() guard (arriving after
     the winner had already renewed the lock), never reaching the
     settle-and-reconfirm code this test exists to validate at all. That
     made the test pass almost regardless of whether the fix was present:
     it caught the reverted bug in only 1 of 20 runs. Fixed by having
     every racer spin-wait for the same future instant (server/index.js's
     SAMINDANG_OWNER_LOCK_TEST_RACE_AT hook, same spin-wait technique as
     Part 1's patientIdentityStore race above) immediately before it
     attempts to acquire the lock, so their takeover attempts genuinely
     land within the same settle window -- and by asserting on WHY each
     loser exited, not just that it exited, so a loser that failed for an
     unrelated reason cannot be silently miscounted as a correct refusal.

     Third-round closing-review finding: under real CPU contention (a
     2-vCPU CI runner is the concrete case that matters here -- this
     repo's own ubuntu-latest), NO synchronization barrier can force every
     one of N racing processes to reach their own EEXIST-and-stale check
     within the same tiny window every single run -- reproduced via
     `taskset -c 0,1` simulating 2 vCPU: the headline safety invariant
     (exactly one winner, every loser recognized) held 100% of the time,
     but the specific "at least one loser reached settle-reconfirm, not
     everyone just refused via the plain isFresh guard" check -- a
     TEST-QUALITY assertion proving this test isn't vacuous, not a
     correctness invariant -- flaked in roughly 1 of 5 runs under
     contention: legitimately, sometimes the first racer's takeover
     completes fast enough that every other racer's own initial read
     already sees a freshly-renewed lock and correctly refuses via
     isFresh, without any of them ever entering the settle-reconfirm race
     at all. That is not a bug (the SAME reason a real accidental
     double-start is unlikely to see this specific window either) --
     failing the whole test run over it would be exactly the "a test
     asserting corruption occurred is a liability if the underlying
     behavior has multiple legitimate outcomes" trap Part 1's own comment
     above already warns against. Fixed by retrying ONLY that
     non-vacuousness check across a few fresh attempts (fresh seeded lock
     + fresh N racers each time) -- the correctness invariants (exactly
     one winner; every loser's refusal reason recognized; owner.lock names
     the actual winner) are asserted, with NO retry tolerance, on EVERY
     attempt, so a genuine regression still fails on attempt 1 exactly as
     before.
     ===================================================================== */
  {
    const isFreshRefusal = /already owned by another live process/
    // Fourth-round closing-review finding (N3): a racer that briefly wins
    // the takeover (prints "listening on", counted at that instant by the
    // waitUntil below) can still lose ownership moments later via its own
    // heartbeat's read-verify-first check (ownerLock.js's documented,
    // bounded-by-heartbeatMs residual two-owner window -- see that
    // function's own comment) if another racer's takeover landed in the
    // narrow gap between this one's read and its renew. That is CORRECT
    // self-termination, not a bug -- but its stderr ("fatal: lost
    // ownership of the data directory lock...") matched neither pattern
    // below, so it was miscounted as "an unrelated crash" by the
    // recognized-reason check. Recognized here as a third legitimate
    // outcome.
    const settleRefusal = /lost the race to take over|lost ownership of the data directory lock/
    const N = 5
    // Re-tuned (third-round closing-review re-check): 3 attempts was not
    // enough headroom under the 2-vCPU `taskset` simulation of this repo's
    // actual CI runner -- observed the per-attempt miss rate is higher
    // under real contention than on an unloaded dev machine, so 3
    // consecutive misses were not rare enough. 8 attempts (each only ~1-2s)
    // keeps the correctness invariants' zero-tolerance re-checked on every
    // attempt while pushing the chance of the non-vacuousness check never
    // firing at all down to noise; re-verified 10/10 clean runs under
    // `taskset -c 0,1` (2 vCPU) and 5/5 under `taskset -c 0` (1 vCPU).
    const maxAttempts = 8
    let sawSettlePath = false
    let attemptsUsed = 0
    for (let attempt = 1; attempt <= maxAttempts && !sawSettlePath; attempt++) {
      attemptsUsed = attempt
      const dataRoot = await mkdtemp(path.join(tmpdir(), 'samindang-ownerlock-multitakeover-'))
      const racers = []
      try {
        const dataDir = path.join(dataRoot, 'submissions')
        const lockPath = path.join(dataRoot, 'owner.lock')
        // Seed a stale lock (pid that cannot possibly be a live racer here,
        // renewed_at far in the past relative to staleAfterMs below).
        await writeFile(
          lockPath,
          JSON.stringify({ pid: 999999, hostname: 'seed', nonce: randomUUID(), acquired_at: new Date(0).toISOString(), renewed_at: new Date(0).toISOString() }),
          'utf8',
        )
        const fastEnv = { SAMINDANG_OWNER_LOCK_HEARTBEAT_MS: '150', SAMINDANG_OWNER_LOCK_STALE_MS: '200', SAMINDANG_OWNER_LOCK_SETTLE_MS: '150' }
        // Every racer spin-waits (inside its own process, before calling
        // acquireOwnerLock) until this shared future instant -- gives Node's
        // own module-load/import time for all N children to converge on
        // roughly the same moment before any of them touches the lock file,
        // instead of relying on OS spawn-order luck.
        const raceAt = Date.now() + 500

        for (let i = 0; i < N; i++) racers.push(spawnServer(dataDir, { ...fastEnv, SAMINDANG_OWNER_LOCK_TEST_RACE_AT: String(raceAt) }))
        // Wait for every racer to reach a settled state: either listening,
        // or exited (refused the race).
        await Promise.all(racers.map((r) => waitUntil(() => r.state.stdout.includes('listening on') || r.state.exitCode !== null, { timeoutMs: 10000 })))

        const winners = racers.filter((r) => r.state.stdout.includes('listening on') && r.state.exitCode === null)
        const losers = racers.filter((r) => !(r.state.stdout.includes('listening on') && r.state.exitCode === null))

        const losersViaIsFresh = losers.filter((r) => isFreshRefusal.test(r.state.stderr))
        const losersViaSettle = losers.filter((r) => settleRefusal.test(r.state.stderr))
        const losersUnrecognized = losers.filter((r) => !isFreshRefusal.test(r.state.stderr) && !settleRefusal.test(r.state.stderr))
        console.log(
          `  (multi-takeover attempt ${attempt}/${maxAttempts}) ${winners.length} winner(s) of ${N}, pids=[${winners.map((w) => w.child.pid).join(',')}]; losers: ${losersViaIsFresh.length} via isFresh, ${losersViaSettle.length} via settle-reconfirm, ${losersUnrecognized.length} unrecognized`,
        )
        // Correctness invariants -- hard failures, no retry, on EVERY attempt.
        assert(`multi-takeover (attempt ${attempt}): exactly ONE of ${N} processes racing a stale lock ends up listening (found ${winners.length})`, winners.length === 1)
        assert(`multi-takeover (attempt ${attempt}): the other ${N - 1} processes all refused/exited (found ${losers.length} losers)`, losers.length === N - 1)
        assert(
          `multi-takeover (attempt ${attempt}): every loser refused for a RECOGNIZED owner-lock reason (isFresh guard or settle-reconfirm), not an unrelated crash the test would otherwise silently miscount as a correct refusal`,
          losersUnrecognized.length === 0,
        )
        const lockAfterRace = await readJsonOrNull(lockPath)
        assert(`multi-takeover (attempt ${attempt}): owner.lock names the actual winning process`, lockAfterRace?.pid === winners[0]?.child.pid)

        // Non-vacuousness check -- allowed to retry (see the comment block
        // above): only recorded here, asserted once after the loop.
        if (losersViaSettle.length >= 1) sawSettlePath = true
      } finally {
        for (const r of racers) killIfAlive(r)
        await rm(dataRoot, { recursive: true, force: true })
      }
    }
    assert(
      `multi-takeover: across ${attemptsUsed} attempt(s), the spin-wait barrier eventually forced at least one loser through the settle-and-reconfirm code path (not every racer merely refused via the earlier isFresh guard on every attempt) -- this is the specific code this test exists to exercise`,
      sawSettlePath,
    )
  }

  /* =====================================================================
     Part 4: scripts/purge-data.mjs must refuse while a real server holds a
     fresh lock (deleting everything out from under a live process is
     exactly the scenario this refusal exists to prevent), and must
     succeed once that server has cleanly stopped.
     ===================================================================== */
  {
    const dataRoot = await mkdtemp(path.join(tmpdir(), 'samindang-ownerlock-purge-'))
    let server
    try {
      const dataDir = path.join(dataRoot, 'submissions')

      server = spawnServer(dataDir)
      await waitForListening(server)

      let purgeThrew = false
      let purgeStderr = ''
      try {
        execFileSync(process.execPath, [path.join(repoRoot, 'scripts', 'purge-data.mjs'), '--yes'], {
          cwd: repoRoot,
          env: { ...process.env, SAMINDANG_DATA_DIR: dataDir },
        })
      } catch (err) {
        purgeThrew = true
        purgeStderr = String(err.stderr ?? '')
      }
      assert('purge-refusal: purge-data.mjs refuses (non-zero exit) while the server holds a fresh owner lock', purgeThrew)
      assert('purge-refusal: refusal message names the live pid', purgeStderr.includes(String(server.child.pid)))

      server.child.kill('SIGTERM')
      await waitForExit(server)

      // Now the lock is gone (graceful release) -- purge must succeed.
      let purgeSecondThrew = false
      try {
        execFileSync(process.execPath, [path.join(repoRoot, 'scripts', 'purge-data.mjs'), '--yes'], {
          cwd: repoRoot,
          env: { ...process.env, SAMINDANG_DATA_DIR: dataDir },
        })
      } catch {
        purgeSecondThrew = true
      }
      assert('purge-refusal: purge-data.mjs succeeds once the server has cleanly stopped and released the lock', !purgeSecondThrew)
    } finally {
      killIfAlive(server)
      await rm(dataRoot, { recursive: true, force: true })
    }
  }

  /* =====================================================================
     Part 5 (second-round closing-review finding, NEW-1): a malformed/
     non-positive SAMINDANG_OWNER_LOCK_STALE_MS must be REJECTED, not
     silently treated as "everything is always stale". An earlier version
     of purge-data.mjs only checked Number.isFinite before passing the
     value through -- 0 and negative numbers pass that check, and
     ownerLock.js's isFresh() computes `ageMs < staleAfterMs`, so a
     threshold of 0 made every lock (including a genuinely live server's)
     read as stale. Verified to actually purge a live server's data before
     this fix; must now refuse loudly instead, with the live server
     completely unaffected.
     ===================================================================== */
  {
    const dataRoot = await mkdtemp(path.join(tmpdir(), 'samindang-ownerlock-stalems-'))
    let server
    try {
      const dataDir = path.join(dataRoot, 'submissions')
      server = spawnServer(dataDir)
      await waitForListening(server)

      for (const badValue of ['0', '-1', '90s', '']) {
        let threw = false
        let stderr = ''
        try {
          execFileSync(process.execPath, [path.join(repoRoot, 'scripts', 'purge-data.mjs'), '--yes'], {
            cwd: repoRoot,
            env: { ...process.env, SAMINDANG_DATA_DIR: dataDir, SAMINDANG_OWNER_LOCK_STALE_MS: badValue },
          })
        } catch (err) {
          threw = true
          stderr = String(err.stderr ?? '')
        }
        assert(`stale-ms-validation: SAMINDANG_OWNER_LOCK_STALE_MS=${JSON.stringify(badValue)} makes purge-data.mjs refuse (non-zero exit) instead of treating the lock as always-stale`, threw)
        assert(
          `stale-ms-validation: the refusal for ${JSON.stringify(badValue)} names it as an invalid value, not a false "already owned" report`,
          stderr.includes('is not a valid positive number of milliseconds'),
        )
      }

      assert('stale-ms-validation: the live server is still running and untouched after all the rejected purge attempts', server.state.exitCode === null)
      const lockStillLive = await readJsonOrNull(path.join(dataRoot, 'owner.lock'))
      assert('stale-ms-validation: owner.lock still names the live server -- none of the rejected attempts took it', lockStillLive?.pid === server.child.pid)

      // Fourth-round closing-review finding (N1): the malformed-value loop
      // above never covered the actual round-4 HIGH finding -- a SMALL but
      // otherwise VALID positive value (e.g. "90", the single most
      // plausible typo for the 90000ms default: an operator thinking in
      // seconds) still passed `requirePositiveMs` and, before the
      // pid-liveness probe was added, still made this live server's lock
      // read as stale and get purged. Verified empirically before that fix
      // existed: this exact env var + a live server -> data deleted, server
      // still running with a now-nonexistent data directory underneath it.
      // Must now refuse via the liveness probe -- deliberately checking a
      // DIFFERENT refusal message than the malformed-value loop above
      // (that one says "is not a valid positive number", this one names a
      // live pid), because "90" is not malformed at all.
      let smallThrew = false
      let smallStderr = ''
      try {
        execFileSync(process.execPath, [path.join(repoRoot, 'scripts', 'purge-data.mjs'), '--yes'], {
          cwd: repoRoot,
          env: { ...process.env, SAMINDANG_DATA_DIR: dataDir, SAMINDANG_OWNER_LOCK_STALE_MS: '90' },
        })
      } catch (err) {
        smallThrew = true
        smallStderr = String(err.stderr ?? '')
      }
      assert('stale-ms-validation: SAMINDANG_OWNER_LOCK_STALE_MS="90" (valid but too small) still refuses against a live server -- this is the round-4 HIGH finding\'s exact reproduction', smallThrew)
      assert(
        'stale-ms-validation: the "90" refusal names a live pid (the threshold-agnostic liveness probe), not the malformed-value message -- "90" is not malformed',
        smallStderr.includes('is a live process') && !smallStderr.includes('is not a valid positive number of milliseconds'),
      )
      assert('stale-ms-validation: the live server is still running after the "90" purge attempt too', server.state.exitCode === null)
      const lockAfterSmall = await readJsonOrNull(path.join(dataRoot, 'owner.lock'))
      assert('stale-ms-validation: owner.lock still names the live server after the "90" attempt', lockAfterSmall?.pid === server.child.pid)
    } finally {
      killIfAlive(server)
      await rm(dataRoot, { recursive: true, force: true })
    }
  }

  /* =====================================================================
     Part 6 (second-round closing-review finding, NEW-2/NEW-3): the lock
     purge-data.mjs acquires for itself must be released on EVERY exit
     path, not just a clean successful purge -- an operator aborting the
     confirmation prompt, or a genuine error partway through deletion. An
     earlier version only released after success, leaving a stale-naming
     lock behind (naming this now-exited process) that wedged a real
     server out for up to staleAfterMs on either kind of exit.
     ===================================================================== */
  {
    // 6a: abort at the confirmation prompt (answer anything but DELETE).
    // The confirmation prompt only appears in the real TTY-interactive
    // path (no --yes) -- exercised here via `script`(1), which ubuntu-
    // latest (this repo's CI runner) ships as part of util-linux, to give
    // the child process a real pty the way an operator's terminal would.
    const dataRoot = await mkdtemp(path.join(tmpdir(), 'samindang-ownerlock-abortleak-'))
    try {
      const dataDir = path.join(dataRoot, 'submissions')
      await rm(dataDir, { recursive: true, force: true })
      await mkdir(dataDir, { recursive: true })

      const scriptCmd = `SAMINDANG_DATA_DIR=${JSON.stringify(dataDir)} ${JSON.stringify(process.execPath)} ${JSON.stringify(path.join(repoRoot, 'scripts', 'purge-data.mjs'))}`
      let abortExitCode = null
      try {
        execFileSync('script', ['-qec', scriptCmd, '/dev/null'], { cwd: repoRoot, input: 'NO\n', env: process.env })
      } catch (err) {
        abortExitCode = err.status
      }
      assert('abort-leak: aborting the confirmation prompt (answering NO) exits non-zero', abortExitCode !== null && abortExitCode !== 0)

      const lockAfterAbort = await readJsonOrNull(path.join(dataRoot, 'owner.lock'))
      assert('abort-leak: owner.lock is fully released (removed) after an aborted purge, not left behind naming the exited process', lockAfterAbort === null)

      // A real server must be able to start IMMEDIATELY afterward -- no
      // staleAfterMs wait required, because there is no leftover lock to
      // wait out.
      const server = spawnServer(dataDir)
      try {
        await waitForListening(server)
        assert('abort-leak: a real server starts immediately after an aborted purge (no stale-lock wait needed)', server.state.stdout.includes('listening on'))
      } finally {
        killIfAlive(server)
        if (server.state.exitCode === null) await waitForExit(server, 3000).catch(() => {})
      }
    } finally {
      await rm(dataRoot, { recursive: true, force: true })
    }
  }
  {
    // 6b: a genuine error partway through deletion (here: a pre-existing
    // regular file where visits/ needs to be a directory, so
    // store.purgeAll() itself throws ENOTDIR/EEXIST) must still release
    // the lock this script took, not leave it behind because the throw
    // unwound past the point that used to call release().
    const dataRoot = await mkdtemp(path.join(tmpdir(), 'samindang-ownerlock-throwleak-'))
    try {
      const dataDir = path.join(dataRoot, 'submissions')
      await mkdir(dataDir, { recursive: true })
      // Block visits/ (a sibling of submissions/) with a plain file so
      // store.purgeAll() -> visitStore.purgeAll()'s own mkdir/readdir
      // genuinely throws instead of silently no-op'ing.
      await writeFile(path.join(dataRoot, 'visits'), '')

      let threw = false
      try {
        execFileSync(process.execPath, [path.join(repoRoot, 'scripts', 'purge-data.mjs'), '--yes'], {
          cwd: repoRoot,
          env: { ...process.env, SAMINDANG_DATA_DIR: dataDir },
        })
      } catch {
        threw = true
      }
      assert('throw-leak: purge-data.mjs genuinely throws (non-zero exit) when a sibling store directory is blocked', threw)

      const lockAfterThrow = await readJsonOrNull(path.join(dataRoot, 'owner.lock'))
      assert('throw-leak: owner.lock is still released (removed) even though the purge itself failed partway through', lockAfterThrow === null)
    } finally {
      await rm(dataRoot, { recursive: true, force: true })
    }
  }

  /* =====================================================================
     Part 6c (third/fourth-round closing-review finding): Ctrl-C (SIGINT)
     and Ctrl-D (EOF) AT the confirmation prompt specifically -- not just
     answering something other than "DELETE" (6a already covers that) --
     must not hang purge-data.mjs while it holds the owner lock it already
     acquired. `await rl.question(...)` alone does not settle on either
     signal; fixed by racing the question against the readline interface's
     own 'SIGINT'/'close' events. Sent as real terminal control bytes (not
     a closed pipe) via the same `script`(1) pty technique 6a uses, since
     a plain non-TTY pipe never reaches the interactive prompt at all (the
     isTTY guard refuses first).
     ===================================================================== */
  for (const [label, byte] of [['Ctrl-D (EOF)', '\x04'], ['Ctrl-C (SIGINT)', '\x03']]) {
    const dataRoot = await mkdtemp(path.join(tmpdir(), 'samindang-ownerlock-signalabort-'))
    try {
      const dataDir = path.join(dataRoot, 'submissions')
      await mkdir(dataDir, { recursive: true })

      // 15s outer guard (not tighter): this block runs right after Part
      // 3b's multi-takeover races (up to 8 attempts * 5 processes each),
      // and under real CPU contention a `timeout` this tight flaked once
      // in 8 runs of a `taskset -c 0,1` (2 vCPU) simulation -- the fix
      // itself is not CPU-bound (it only needs the process to be
      // scheduled at all to handle the signal), so a generous guard still
      // fails fast on a genuine hang while tolerating scheduler noise.
      const scriptCmd = `timeout 15 ${JSON.stringify(process.execPath)} ${JSON.stringify(path.join(repoRoot, 'scripts', 'purge-data.mjs'))}`
      let exitCode = null
      try {
        execFileSync('script', ['-qec', scriptCmd, '/dev/null'], {
          cwd: repoRoot,
          input: byte,
          env: { ...process.env, SAMINDANG_DATA_DIR: dataDir },
        })
      } catch (err) {
        exitCode = err.status
      }
      assert(`signal-abort (${label}): purge-data.mjs exits promptly (not "timeout 15" killing a hang) and non-zero`, exitCode !== null && exitCode !== 0 && exitCode !== 124)

      const lockAfterSignal = await readJsonOrNull(path.join(dataRoot, 'owner.lock'))
      assert(`signal-abort (${label}): owner.lock is released (removed), not left behind heartbeating while the process hung`, lockAfterSignal === null)
    } finally {
      await rm(dataRoot, { recursive: true, force: true })
    }
  }

  console.log(`\n${passCount} owner-lock assertions passed.`)
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
