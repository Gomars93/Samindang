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
//     먼저 lock이 fresh(살아있는 프로세스가 소유 중)인지 확인해 fresh면
//     통째로 거부한다(살아있는 서버 밑에서 디스크를 통째로 지우면 그
//     프로세스의 in-memory 상태와 디스크가 어긋난다); stale하거나 없으면
//     진행하고, 끝에 남은 stale lock 파일도 같이 지운다.
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
import { readOwnerLockStatus, ownerLockPath } from '../server/ownerLock.js'

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
  // in-memory state that no longer matches an empty disk. Refuse while the
  // lock is fresh; an operator must stop the server first (a stale/absent
  // lock, e.g. after a clean shutdown or a crash past staleAfterMs, does
  // not block this).
  const { record, fresh } = await readOwnerLockStatus(dataDir)
  if (fresh) {
    console.error(
      `refusing to purge: a live server process (pid=${record.pid}, host=${record.hostname}, renewed_at=${record.renewed_at}) currently owns "${dataDir}". Stop the server first, then re-run this script.`,
    )
    process.exit(1)
  }

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
      process.exit(1)
    }
  }

  const store = createStore(dataDir)
  const count = await store.purgeAll()
  await purgeAuditLog(dataDir)
  await rm(crmDir, { recursive: true, force: true })
  await rm(identityDir, { recursive: true, force: true })
  // A leftover lock file here can only be a stale one (fresh ones already
  // refused above) -- garbage from a crashed process, safe to remove as
  // part of "delete everything".
  await rm(ownerLockPath(dataDir), { force: true })
  console.log(
    `Purged ${count} file(s) from "${dataDir}" and its sibling stores (visits/, recorder-results/, micro-follow-up/, follow-up-sessions/, stations/), cleared the audit log, and removed "${crmDir}" and "${identityDir}".`,
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
