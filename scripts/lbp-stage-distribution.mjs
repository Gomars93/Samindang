#!/usr/bin/env node
/**
 * 요통 운동 단계 — 회고 파일럿 (분포 확인).
 *
 * 목적: 이미 받아둔 문진 제출 기록에 현재의 단계 배정 규칙을 그대로 돌려서
 * "실제 환자에게 이 규칙이 어떤 분포를 만드는가"를 본다. **환자를 새로
 * 모집하지 않는다. 원장이 손으로 입력할 것도 없다.**
 *
 * 왜 필요한가: 단위 테스트는 "규칙이 정해진 대로 작동하는가"만 본다.
 * "그 규칙이 임상 현실과 맞는가"는 분포로만 알 수 있다. 예컨대 환자의
 * 80%가 한 단계로 몰리면 그 축은 죽은 것이고, 규칙을 다시 만들어야 한다.
 *
 * 개인정보: 이름·전화·생년월일·자유서술 답변을 일절 읽지 않고 출력하지
 * 않는다. 세는 것은 선택지 코드값뿐이다.
 *
 * 실행:
 *   npm run pilot:lbp-stage
 *   SAMINDANG_DATA_DIR=/경로/submissions npm run pilot:lbp-stage
 */

import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import {
  suggestLbpExerciseStage,
  lbpStageInputFromPayload,
  LBP_EXERCISE_STAGE_LABEL_KO,
} from './.lbp-exercise-stage-bundle.mjs'

const DATA_DIR = process.env.SAMINDANG_DATA_DIR ?? './.data/submissions'

function pct(n, total) {
  if (total === 0) return '  0.0%'
  return `${((n / total) * 100).toFixed(1).padStart(5)}%`
}

function bar(n, total, width = 30) {
  if (total === 0) return ''
  return '█'.repeat(Math.round((n / total) * width))
}

async function main() {
  let files
  try {
    files = (await readdir(DATA_DIR)).filter((f) => f.endsWith('.json'))
  } catch (e) {
    console.error(`\n❌ 제출 기록 폴더를 열 수 없습니다: ${path.resolve(DATA_DIR)}`)
    console.error(`   (${e.code ?? e.message})\n`)
    console.error('   이 스크립트는 원장님 로컬 PC에서 실행해야 합니다 —')
    console.error('   클라우드 세션에는 환자 기록이 없습니다(있어서도 안 됩니다).')
    console.error('   데이터 폴더가 다른 곳이면:')
    console.error('     SAMINDANG_DATA_DIR=D:\\경로\\submissions npm run pilot:lbp-stage\n')
    process.exitCode = 1
    return
  }

  const stageCount = { 0: 0, 1: 0, 2: 0, 3: 0 }
  const baseCount = { 1: 0, 2: 0, 3: 0 }
  let total = 0
  let lbpTotal = 0
  let unusable = 0
  let acuteDemotions = 0
  let recurrenceDemotions = 0
  let fearCaps = 0
  let hasRecurrenceField = 0
  let unreadable = 0

  for (const f of files) {
    let record
    try {
      record = JSON.parse(await readFile(path.join(DATA_DIR, f), 'utf8'))
    } catch {
      unreadable++
      continue
    }
    const submission = record?.submission
    if (!submission || typeof submission !== 'object') continue
    total++

    // 요통 주호소만 — 다른 부위는 이 규칙의 대상이 아니다.
    const responses = submission.responses ?? {}
    if (responses?.pain?.primary_location !== 'low_back_pelvis') continue
    lbpTotal++

    const lbp = responses?.safety_flags?.lbp ?? {}
    if (typeof lbp.recurrence_interval === 'string') hasRecurrenceField++

    const res = suggestLbpExerciseStage(lbpStageInputFromPayload(submission))
    if (res.suggestedStage === null) {
      unusable++
      continue
    }
    stageCount[res.suggestedStage]++
    if (res.baseStage != null) baseCount[res.baseStage]++
    for (const r of res.reasons) {
      if (r.kind === 'DEMOTION' && r.text.includes('1주')) acuteDemotions++
      if (r.kind === 'DEMOTION' && r.text.includes('재발')) recurrenceDemotions++
      if (r.kind === 'CAP') fearCaps++
    }
  }

  const judged = lbpTotal - unusable

  console.log('\n' + '='.repeat(58))
  console.log('  요통 운동 단계 — 회고 파일럿 분포')
  console.log('='.repeat(58))
  console.log(`  데이터 폴더 : ${path.resolve(DATA_DIR)}`)
  console.log(`  전체 제출   : ${total}건${unreadable ? ` (읽을 수 없는 파일 ${unreadable}건 제외)` : ''}`)
  console.log(`  요통 주호소 : ${lbpTotal}건`)
  console.log(`  단계 판정됨 : ${judged}건 (판단 불가 ${unusable}건)`)

  if (lbpTotal === 0) {
    console.log('\n  ⚠️  요통 제출 기록이 0건입니다.')
    console.log('     회고 파일럿을 돌릴 데이터가 아직 없습니다 —')
    console.log('     실환자 파일럿으로 바로 가야 합니다.\n')
    return
  }

  console.log('\n  ── 최종 제안 단계 ' + '─'.repeat(38))
  for (const s of [0, 1, 2, 3]) {
    const n = stageCount[s]
    console.log(
      `  ${LBP_EXERCISE_STAGE_LABEL_KO[s].padEnd(18)} ${String(n).padStart(4)}건 ${pct(n, judged)}  ${bar(n, judged)}`,
    )
  }

  console.log('\n  ── 격하 전 기본 단계 (일상지장도만) ' + '─'.repeat(21))
  for (const s of [1, 2, 3]) {
    const n = baseCount[s]
    console.log(
      `  ${LBP_EXERCISE_STAGE_LABEL_KO[s].padEnd(18)} ${String(n).padStart(4)}건 ${pct(n, judged)}  ${bar(n, judged)}`,
    )
  }

  console.log('\n  ── 규칙별 발동 횟수 ' + '─'.repeat(36))
  console.log(`  발병 1주 이내 격하   ${String(acuteDemotions).padStart(4)}건 ${pct(acuteDemotions, judged)}`)
  console.log(`  3개월 내 재발 격하   ${String(recurrenceDemotions).padStart(4)}건 ${pct(recurrenceDemotions, judged)}`)
  console.log(`  공포회피 상한        ${String(fearCaps).padStart(4)}건 ${pct(fearCaps, judged)}`)

  // ---- 판정 -------------------------------------------------------------
  console.log('\n  ── 판정 ' + '─'.repeat(48))
  const warn = []

  if (hasRecurrenceField === 0 && lbpTotal > 0) {
    warn.push(
      '재발 간격(LBP_07B) 답변이 있는 기록이 0건입니다 — 이 문항 도입 전에\n' +
        '     받은 기록이라 "3개월 내 재발 격하"가 한 번도 발동하지 않았습니다.\n' +
        '     위의 재발 격하 0건은 규칙이 안 걸린 게 아니라 입력이 없는 것입니다.',
    )
  }
  if (judged > 0) {
    const zeroPct = (stageCount[0] / judged) * 100
    if (zeroPct > 30) {
      warn.push(
        `0단계가 ${zeroPct.toFixed(1)}%입니다 (기준 30%). 환자 3명 중 1명 이상이\n` +
          '     운동을 못 받습니다 — 격하 규칙이 과한지 재검토가 필요합니다.',
      )
    }
    for (const s of [0, 1, 2, 3]) {
      const p = (stageCount[s] / judged) * 100
      if (p > 80) {
        warn.push(
          `${LBP_EXERCISE_STAGE_LABEL_KO[s]}에 ${p.toFixed(1)}%가 몰렸습니다 (기준 80%).\n` +
            '     단계를 나누는 의미가 사실상 없습니다 — 배정 축을 다시 봐야 합니다.',
        )
      }
    }
  }
  if (lbpTotal > 0 && (unusable / lbpTotal) * 100 > 10) {
    warn.push(
      `판단 불가가 ${((unusable / lbpTotal) * 100).toFixed(1)}%입니다 (기준 10%).\n` +
        '     일상생활 지장도(VISIT_04) 미응답이 많다는 뜻입니다.',
    )
  }
  if (judged < 20) {
    warn.push(
      `판정 건수가 ${judged}건으로 적습니다. 분포를 신뢰하려면 최소 20~30건은\n` +
        '     필요합니다 — 지금 숫자는 방향 참고용으로만 보십시오.',
    )
  }

  if (warn.length === 0) {
    console.log('  ✅ 편중·미응답 경고 없음. 이 규칙으로 다음 단계(최소 화면)로 진행 가능.')
  } else {
    for (const w of warn) console.log(`  ⚠️  ${w}`)
  }
  console.log('')
}

main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
