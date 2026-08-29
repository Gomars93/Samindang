#!/usr/bin/env node
// 파일럿 종료 후 전체 삭제. 파괴적 작업이므로:
//   - 대화형 실행에서는 "DELETE"를 정확히 입력해야 지운다.
//   - 비대화형(TTY 없음)에서는 --yes 없이는 무조건 거부한다.
// 사용: npm run purge:data  (또는  node scripts/purge-data.mjs --yes)
import { createInterface } from 'node:readline/promises'
import { rm } from 'node:fs/promises'
import path from 'node:path'
import { createStore } from '../server/store.js'
import { purgeAuditLog } from '../server/audit.js'

const dataDir = process.env.SAMINDANG_DATA_DIR ?? './.data/submissions'
// server/index.js stores the identity-linkage layer (patient_uuid <->
// sigma_chart_no + confirmed display name -- PHI) as a sibling of
// dataDir, same layout as audit.log. Independent-review finding: this
// script purged submissions/recorderResults/etc. and the audit log, but
// never this directory, silently leaving linked patient names behind
// after a pilot-end purge.
const identityDir = path.join(dataDir, '..', 'crm-identity')
const yes = process.argv.includes('--yes')

async function main() {
  if (!process.stdin.isTTY && !yes) {
    console.error('refusing to run non-interactively without --yes (e.g. `node scripts/purge-data.mjs --yes`)')
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
  await rm(identityDir, { recursive: true, force: true })
  console.log(
    `Purged ${count} submission file(s) from "${dataDir}", cleared the audit log, and removed "${identityDir}".`,
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
