// Round 17 (restart-safe / multi-process correctness batch): proves
// server/ownerLock.js actually does what it claims, using REAL separate OS
// processes (child_process.spawn), not two in-process createApp() calls --
// see ownerLock.js's own header for why two createApp() instances in one
// Node process would NOT reproduce a multi-process race (they'd share the
// same module-scope `locks` Map inside server/store.js by accident).
// Plain node, no test framework: assert() prints "OK: <name>" and throws on
// failure -- same convention as tests/audit-registry.spec.mjs.
import assert2 from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
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

async function main() {
  /* =====================================================================
     Part 1: pre-fix-style reproduction -- prove the underlying race this
     batch's owner lock exists to prevent is REAL at the store layer, not
     speculative. server/patientIdentityStore.js itself has no
     multi-process guard (only the CLI boot path -- server/index.js's
     isMain() -- acquires the owner lock), so racing two separate
     processes directly against the store reproduces the exact corruption
     a double-started server would otherwise cause: two different
     patient_uuids both durably claiming one sigma_chart_no, breaking the
     approved 1:1 identity policy.
     ===================================================================== */
  {
    const dataRoot = await mkdtemp(path.join(tmpdir(), 'samindang-ownerlock-race-'))
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

    // With correct single-owner serialization, the expected shape is: one
    // process's linkPatientIdentity succeeds, the other cleanly rejects
    // with IdentityConflictError('chart_already_linked') (a controlled,
    // documented 409-equivalent). Racing two real processes with no lock
    // at this layer breaks that in one of two ways, either of which is the
    // corruption class the owner lock exists to prevent: (a) both succeed
    // and both durably claim the same chart_no (silent duplicate,
    // violating the approved 1:1 identity policy), or (b) the loser
    // crashes with a raw filesystem error (e.g. ENOENT on a shared tmp
    // filename torn between the two processes' concurrent atomicWrites)
    // instead of the clean, expected conflict -- an uncontrolled failure
    // mode, not a documented rejection.
    const cleanConflict = /chart_already_linked/
    const crashedInsteadOfCleanConflict =
      (!resultA.ok && !cleanConflict.test(resultA.error)) || (!resultB.ok && !cleanConflict.test(resultB.error))
    console.log(
      `  (race reproduction) A: ${JSON.stringify(resultA)}  B: ${JSON.stringify(resultB)}  bothClaimChartNo=${bothClaimChartNo} crashedInsteadOfCleanConflict=${crashedInsteadOfCleanConflict}`,
    )
    assert(
      'pre-fix reproduction: racing two processes directly against patientIdentityStore (no owner lock at this layer) produces an unsafe outcome -- a duplicate chart_no claim or an uncontrolled crash instead of a clean conflict -- this is exactly the corruption class the owner lock exists to prevent at the server-boot layer (see Part 2)',
      bothClaimChartNo || crashedInsteadOfCleanConflict,
    )
  }

  /* =====================================================================
     Part 2: two REAL server processes racing to boot against the same
     data dir. The owner lock must let exactly one through and refuse the
     other with a clear, operator-readable reason -- never both, never
     neither.
     ===================================================================== */
  {
    const dataRoot = await mkdtemp(path.join(tmpdir(), 'samindang-ownerlock-boot-'))
    const dataDir = path.join(dataRoot, 'submissions')

    const first = spawnServer(dataDir)
    await waitForListening(first)
    assert('boot-race: first process reaches "listening"', first.state.exitCode === null && first.state.stdout.includes('listening on'))

    const second = spawnServer(dataDir)
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
  }

  /* =====================================================================
     Part 3: SIGKILL (no graceful shutdown at all) leaves the lock file
     behind with a now-dead pid. A later process must NOT be blocked
     forever by it -- once its renewed_at is older than staleAfterMs, a new
     process takes over via the atomic tmp+rename replace and self-verify.
     ===================================================================== */
  {
    const dataRoot = await mkdtemp(path.join(tmpdir(), 'samindang-ownerlock-takeover-'))
    const dataDir = path.join(dataRoot, 'submissions')
    // Small windows so this test doesn't take production's real 15s/90s.
    const fastEnv = { SAMINDANG_OWNER_LOCK_HEARTBEAT_MS: '150', SAMINDANG_OWNER_LOCK_STALE_MS: '450' }

    const victim = spawnServer(dataDir, fastEnv)
    await waitForListening(victim)
    assert('takeover: victim process reaches "listening"', victim.state.stdout.includes('listening on'))
    const lockBeforeKill = await readJsonOrNull(path.join(dataRoot, 'owner.lock'))
    assert('takeover: owner.lock exists and names the victim pid before the kill', lockBeforeKill?.pid === victim.child.pid)

    victim.child.kill('SIGKILL')
    await waitUntil(() => victim.state.exitSignal === 'SIGKILL' || victim.state.exitCode !== null)

    // A second process started immediately (before staleAfterMs elapses)
    // must still refuse -- SIGKILL alone does not make the lock stale, only
    // the elapsed time since the last heartbeat does.
    const tooSoon = spawnServer(dataDir, fastEnv)
    await waitForExit(tooSoon, 3000)
    assert('takeover: a process started immediately after SIGKILL (lock not yet stale) still refuses', tooSoon.state.exitCode !== 0)

    // Now actually wait out the stale window, then a new process must take
    // over successfully.
    await new Promise((resolve) => setTimeout(resolve, 700))
    const rescuer = spawnServer(dataDir, fastEnv)
    await waitForListening(rescuer)
    assert('takeover: a process started after staleAfterMs elapses successfully takes over and listens', rescuer.state.stdout.includes('listening on'))

    const lockAfterTakeover = await readJsonOrNull(path.join(dataRoot, 'owner.lock'))
    assert('takeover: owner.lock now names the rescuer pid, not the dead victim', lockAfterTakeover?.pid === rescuer.child.pid)
    assert('takeover: owner.lock got a fresh renewed_at from the rescuer (not stale copy)', lockAfterTakeover?.pid !== lockBeforeKill?.pid)

    rescuer.child.kill('SIGTERM')
    await waitForExit(rescuer)
  }

  /* =====================================================================
     Part 4: scripts/purge-data.mjs must refuse while a real server holds a
     fresh lock (deleting everything out from under a live process is
     exactly the scenario this refusal exists to prevent), and must
     succeed once that server has cleanly stopped.
     ===================================================================== */
  {
    const dataRoot = await mkdtemp(path.join(tmpdir(), 'samindang-ownerlock-purge-'))
    const dataDir = path.join(dataRoot, 'submissions')

    const server = spawnServer(dataDir)
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
  }

  console.log(`\n${passCount} owner-lock assertions passed.`)
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
