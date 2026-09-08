#!/usr/bin/env node
/**
 * 부위 운동 파일럿 — 관찰 항목 자동 집계 (원장이 손으로 세지 않는다).
 *
 * `docs/NECK_EXERCISE_DECISIONS_v1.0_CLOSED.md` §10의 관찰 7항목 중 기록에서 셀 수 있는
 * 것(2·3·4·5·7)을 이미 저장된 제출 기록 + 재질문 응답에서 센다. 손으로만 되는 것
 * (1 카드 문장 수정, 6 원문 대조)은 `docs/NECK_PILOT_OBSERVATION_LOG_v1.0.md`의 표에 적는다.
 *
 * 부위 무관: 부위별로 다른 것은 (a) 어느 기록이 이 부위 기록인가(`drivingRegion`, 화면과
 * 같은 규칙), (b) 팩의 신경 검사 id·Core 운동·방향성 조건 규칙, (c) 재질문 id 표뿐이다.
 * 전부 팩·서버 표에서 읽는다 — 이 파일에 부위 이름이 하드코딩되지 않는다.
 *
 * 개인정보: 이름·전화·생년월일·자유서술·메모를 읽지도 출력하지도 않는다. 세는 것은
 * 선택지 코드값·검사 상태 코드·운동 id·채택 상태뿐이다(`tests/region-pilot-observation.spec.mjs`가 강제).
 *
 * 실행:
 *   npm run pilot:region-observation -- neck
 *   SAMINDANG_DATA_DIR=D:\경로\submissions npm run pilot:region-observation -- neck
 *   (재질문 응답은 같은 폴더 옆의 `../micro-follow-up` — 서버와 같은 배치)
 */

import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { drivingRegion } from './.region-routing-bundle.mjs'
import { REGION_KEYS, REGION_LABEL_KO } from './.region-pack-bundle.mjs'
import { REGION_PACKS } from './.region-packs-index-bundle.mjs'
import { DETAIL_CHECK_REGION_QUESTION_IDS } from '../server/detailCheck.js'
import { runStageDistribution } from './region-stage-distribution.mjs'

const DATA_DIR = process.env.SAMINDANG_DATA_DIR ?? './.data/submissions'

/**
 * 판정 임계값 — **제안값**이다(`docs/NECK_PILOT_OBSERVATION_LOG_v1.0.md` §3). 바꾸면 테스트도 같이 바꾼다.
 * 임상 임계값이 아니라 "이 숫자가 나오면 v1.1에서 그 항목을 다시 본다"는 회의 소집 기준이다.
 */
export const THRESHOLDS = Object.freeze({
  /** 이 미만이면 모든 비율은 방향 참고용. */
  MIN_JUDGED: 10,
  /** 방향성 반응 기록 중 굴곡 호전이 이 % 이상인데 굴곡 호전형 후보가 팩에 없으면 → 추가 검토. */
  FLEXION_NO_CANDIDATE_PCT: 20,
  /** 원장 화면이 저장된 기록 중 신경 검사 전부 기록 비율이 이 % 미만이면 → 미기록 안내문 효과 재검토. */
  NEURO_ALL_RECORDED_MIN_PCT: 70,
  /** 방향성 조건부 운동이 이 건수 이상 후보로 떴는데 */
  DIRECTIONAL_MIN_SHOWN: 5,
  /** 채택률이 이 % 미만이면 → v1.1 유지/삭제 결정 자료. */
  DIRECTIONAL_ACCEPT_MIN_PCT: 20,
  /** 부위 제출 대비 재질문 응답(부위 문항 답변 있음)이 이 % 미만이면 → 재질문 발급·응답 경로 확인. */
  DETAIL_ANSWERED_MIN_PCT: 50,
  /** 부위 제출 중 원장 화면 저장이 이 % 미만이면 → 열지 않은/저장 안 된 기록이 많다. */
  WORKSPACE_SAVED_MIN_PCT: 80,
})

// `lbpExamSuggestions.ts` LbpDirectionalResponse의 6값 전부 — 'UNCLEAR'(불명확)를
// 빠뜨리면 원장이 '불명확'으로 저장한 기록이 '미시행'으로 집계되어 파일럿의
// 방향성 시행률이 실제보다 낮게 읽힌다(2026-09-08 Fable 독립 검수 F-3).
const DIRECTIONAL_VALUES = ['NOT_ASSESSED', 'FLEXION_FAVORABLE', 'EXTENSION_FAVORABLE', 'NO_CLEAR_DIRECTION', 'DISTAL_WORSENING', 'UNCLEAR']
const DIRECTIONAL_LABEL = {
  NOT_ASSESSED: '미시행',
  FLEXION_FAVORABLE: '굴곡 호전',
  EXTENSION_FAVORABLE: '신전 호전',
  NO_CLEAR_DIRECTION: '뚜렷한 방향 없음',
  DISTAL_WORSENING: '원위부 악화',
  UNCLEAR: '불명확',
}
const ADOPTION_STATUSES = ['SUGGESTED', 'ACCEPTED', 'HELD', 'REJECTED']

function isRecord(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function pct(n, total) {
  if (total === 0) return '  0.0%'
  return `${((n / total) * 100).toFixed(1).padStart(5)}%`
}

function pctNum(n, total) {
  return total === 0 ? 0 : (n / total) * 100
}

function regionNameKo(region) {
  return region === 'lbp' ? '요통' : REGION_LABEL_KO[region]
}

/** 요통은 옛 필드, 그 외 부위는 `regionClinical[region]` — `regionClinicalState.ts`와 같은 규칙. */
function directionalOf(workspace, region) {
  if (!isRecord(workspace)) return null
  const raw = region === 'lbp' ? workspace.lbpDirectionalResponse : workspace.regionClinical?.[region]?.directionalResponse
  return DIRECTIONAL_VALUES.includes(raw) ? raw : 'NOT_ASSESSED'
}

function examStatusOf(workspace, examId) {
  const list = Array.isArray(workspace?.painExamSuggestions) ? workspace.painExamSuggestions : []
  const hit = list.find((e) => isRecord(e) && e.id === examId)
  const status = hit?.result?.status
  return typeof status === 'string' ? status : 'NOT_YET_CHECKED'
}

export async function runPilotObservation(region) {
  if (!REGION_KEYS.includes(region)) {
    console.error(`\n❌ 알 수 없는 부위 '${region}'. 가능한 값: ${REGION_KEYS.join(', ')}`)
    console.error('   예: npm run pilot:region-observation -- neck\n')
    process.exitCode = 1
    return
  }
  const pack = REGION_PACKS[region]
  if (!pack) {
    console.error(`\n❌ '${region}' 부위 팩이 없습니다.\n`)
    process.exitCode = 1
    return
  }
  const NAME = regionNameKo(region)
  const FOLLOW_UP_DIR = path.resolve(DATA_DIR, '..', 'micro-follow-up')

  let files
  try {
    files = (await readdir(DATA_DIR)).filter((f) => f.endsWith('.json'))
  } catch (e) {
    console.error(`\n❌ 제출 기록 폴더를 열 수 없습니다: ${path.resolve(DATA_DIR)}`)
    console.error(`   (${e.code ?? e.message})\n`)
    console.error('   이 스크립트는 원장님 로컬 PC에서 실행해야 합니다 —')
    console.error('   클라우드 세션에는 환자 기록이 없습니다(있어서도 안 됩니다).')
    console.error('   데이터 폴더가 다른 곳이면:')
    console.error(`     SAMINDANG_DATA_DIR=D:\\경로\\submissions npm run pilot:region-observation -- ${region}\n`)
    process.exitCode = 1
    return
  }

  // ---- 집계 ---------------------------------------------------------------
  let total = 0
  let unreadable = 0
  let regionTotal = 0
  let withWorkspace = 0
  const directionalCount = Object.fromEntries(DIRECTIONAL_VALUES.map((v) => [v, 0]))
  const neuroIds = [...(pack.neuroExamIds ?? [])]
  let neuroAllRecorded = 0
  let neuroNoneRecorded = 0
  let neuroAnyPositive = 0
  const adoption = new Map(pack.coreExercises.map((m) => [m.exerciseId, Object.fromEntries(ADOPTION_STATUSES.map((s) => [s, 0]))]))
  let anyAccepted = 0
  const regionVisitIds = new Set()

  for (const f of files) {
    let record
    try {
      record = JSON.parse(await readFile(path.join(DATA_DIR, f), 'utf8'))
    } catch {
      unreadable++
      continue
    }
    const submission = record?.submission
    if (!isRecord(submission)) continue
    total++
    const responses = submission.responses ?? {}
    if (drivingRegion(responses) !== region) continue
    regionTotal++
    if (typeof record.visit_id === 'string') regionVisitIds.add(record.visit_id)

    const workspace = isRecord(record.workspace) ? record.workspace : null
    if (!workspace) continue
    withWorkspace++

    directionalCount[directionalOf(workspace, region)]++

    if (neuroIds.length > 0) {
      const statuses = neuroIds.map((id) => examStatusOf(workspace, id))
      const recorded = statuses.filter((s) => s !== 'NOT_YET_CHECKED').length
      if (recorded === neuroIds.length) neuroAllRecorded++
      if (recorded === 0) neuroNoneRecorded++
      if (statuses.some((s) => s === 'POSITIVE')) neuroAnyPositive++
    }

    const suggestions = Array.isArray(workspace.painRehabSuggestions) ? workspace.painRehabSuggestions : []
    let accepted = false
    for (const s of suggestions) {
      if (!isRecord(s) || !adoption.has(s.id)) continue
      const status = ADOPTION_STATUSES.includes(s.status) ? s.status : 'SUGGESTED'
      adoption.get(s.id)[status]++
      if (status === 'ACCEPTED') accepted = true
    }
    if (accepted) anyAccepted++
  }

  // ---- 재질문 응답(세부문진) ------------------------------------------------
  const regionQuestionIds = [...(DETAIL_CHECK_REGION_QUESTION_IDS[region] ?? [])]
  let followUpFiles = []
  let followUpDirMissing = false
  try {
    followUpFiles = (await readdir(FOLLOW_UP_DIR)).filter((f) => f.endsWith('.json'))
  } catch {
    followUpDirMissing = true
  }
  let followUpForRegion = 0
  let followUpAnswered = 0
  for (const f of followUpFiles) {
    let resp
    try {
      resp = JSON.parse(await readFile(path.join(FOLLOW_UP_DIR, f), 'utf8'))
    } catch {
      continue
    }
    if (!isRecord(resp) || !regionVisitIds.has(resp.visit_id)) continue
    followUpForRegion++
    const answers = Array.isArray(resp.detailAnswers) ? resp.detailAnswers : []
    const answered = answers.some((a) => isRecord(a) && regionQuestionIds.includes(a.questionId) && typeof a.value === 'string' && a.value !== '')
    if (answered) followUpAnswered++
  }

  // ---- 출력 -----------------------------------------------------------------
  const judged = withWorkspace
  console.log('\n' + '='.repeat(58))
  console.log(`  ${NAME} 운동 파일럿 — 관찰 항목 자동 집계`)
  console.log('='.repeat(58))
  console.log(`  데이터 폴더 : ${path.resolve(DATA_DIR)}`)
  console.log(`  전체 제출   : ${total}건${unreadable ? ` (읽을 수 없는 파일 ${unreadable}건 제외)` : ''}`)
  console.log(`  ${NAME} 주호소 : ${regionTotal}건`)
  console.log(`  원장 화면 저장됨 : ${withWorkspace}건 ${pct(withWorkspace, regionTotal)}  (아래 비율의 분모)`)

  if (regionTotal === 0) {
    console.log(`\n  ⚠️  ${NAME} 제출 기록이 0건입니다. 집계할 파일럿 데이터가 아직 없습니다.\n`)
    return
  }

  console.log('\n  ── ② 방향성 반응 (원장 기록) ' + '─'.repeat(29))
  for (const v of DIRECTIONAL_VALUES) {
    console.log(`  ${DIRECTIONAL_LABEL[v].padEnd(12)} ${String(directionalCount[v]).padStart(4)}건 ${pct(directionalCount[v], judged)}`)
  }
  const assessed = judged - directionalCount.NOT_ASSESSED

  console.log('\n  ── ③ 신경 검사 기록 ' + '─'.repeat(37))
  if (neuroIds.length === 0) {
    console.log('  이 팩에는 신경 검사 id(neuroExamIds)가 없습니다.')
  } else {
    console.log(`  대상 검사: ${neuroIds.join(', ')}`)
    console.log(`  전부 기록됨      ${String(neuroAllRecorded).padStart(4)}건 ${pct(neuroAllRecorded, judged)}`)
    console.log(`  하나도 기록 안 됨 ${String(neuroNoneRecorded).padStart(4)}건 ${pct(neuroNoneRecorded, judged)}`)
    console.log(`  POSITIVE 있음    ${String(neuroAnyPositive).padStart(4)}건 ${pct(neuroAnyPositive, judged)}  (운동 추천 차단)`)
  }

  console.log('\n  ── ⑦ 운동 후보 채택 (운동 id별) ' + '─'.repeat(25))
  console.log('  ' + 'id'.padEnd(16) + '후보'.padStart(5) + '채택'.padStart(6) + '보류'.padStart(6) + '배제'.padStart(6) + '미결'.padStart(6) + '  비고')
  const ruleById = new Map((pack.eligibilityRules ?? []).map((r) => [r.exerciseId, r]))
  const directionalRows = []
  for (const meta of pack.coreExercises) {
    const c = adoption.get(meta.exerciseId)
    const shown = ADOPTION_STATUSES.reduce((n, s) => n + c[s], 0)
    const rule = ruleById.get(meta.exerciseId)
    const remark = rule?.requiredDirectionalResponse ? `방향성 조건부(${DIRECTIONAL_LABEL[rule.requiredDirectionalResponse]})` : ''
    if (rule?.requiredDirectionalResponse) directionalRows.push({ id: meta.exerciseId, shown, accepted: c.ACCEPTED })
    console.log(
      '  ' + meta.exerciseId.padEnd(16) + String(shown).padStart(5) + String(c.ACCEPTED).padStart(6) + String(c.HELD).padStart(6) +
        String(c.REJECTED).padStart(6) + String(c.SUGGESTED).padStart(6) + (remark ? `  ${remark}` : ''),
    )
  }
  console.log(`  운동 1개 이상 채택된 기록: ${anyAccepted}건 ${pct(anyAccepted, judged)}`)

  console.log('\n  ── ⑤ 재질문(세부문진) 응답 ' + '─'.repeat(31))
  if (regionQuestionIds.length === 0) {
    console.log('  이 부위의 재질문 문항이 서버 표에 없습니다.')
  } else if (followUpDirMissing) {
    console.log(`  재질문 응답 폴더가 없습니다: ${FOLLOW_UP_DIR} (아직 응답 0건이면 정상)`)
  } else {
    console.log(`  대상 문항: ${regionQuestionIds.join(', ')}`)
    console.log(`  ${NAME} 방문의 재질문 응답  ${String(followUpForRegion).padStart(4)}건`)
    console.log(`  부위 문항 답변 있음      ${String(followUpAnswered).padStart(4)}건 ${pct(followUpAnswered, regionTotal)}  (분모: ${NAME} 제출 전체 — 발급 안 된 방문 포함, 거친 비율)`)
  }

  // ---- 판정 -------------------------------------------------------------
  console.log('\n  ── 판정 (임계값은 제안값, 로그 문서 §3) ' + '─'.repeat(16))
  const warn = []
  if (judged < THRESHOLDS.MIN_JUDGED) {
    warn.push(`원장 화면이 저장된 ${NAME} 기록이 ${judged}건입니다 (기준 ${THRESHOLDS.MIN_JUDGED}건). 아래 비율은 방향 참고용으로만 보십시오.`)
  }
  if (regionTotal > 0 && pctNum(withWorkspace, regionTotal) < THRESHOLDS.WORKSPACE_SAVED_MIN_PCT) {
    warn.push(
      `원장 화면 저장이 ${pctNum(withWorkspace, regionTotal).toFixed(1)}%입니다 (기준 ${THRESHOLDS.WORKSPACE_SAVED_MIN_PCT}%).\n` +
        '     열지 않았거나 저장되지 않은 기록이 많습니다 — 파일럿 기록 절차를 확인하십시오.',
    )
  }
  const hasFlexionCandidate = (pack.eligibilityRules ?? []).some((r) => r.requiredDirectionalResponse === 'FLEXION_FAVORABLE')
  if (assessed > 0 && !hasFlexionCandidate && pctNum(directionalCount.FLEXION_FAVORABLE, assessed) >= THRESHOLDS.FLEXION_NO_CANDIDATE_PCT) {
    warn.push(
      `방향성 반응이 기록된 ${assessed}건 중 굴곡 호전이 ${pctNum(directionalCount.FLEXION_FAVORABLE, assessed).toFixed(1)}%입니다 ` +
        `(기준 ${THRESHOLDS.FLEXION_NO_CANDIDATE_PCT}%).\n     이 팩에는 굴곡 호전형 후보가 없습니다 — v1.1에서 굴곡 호전형 운동 추가를 검토하십시오.`,
    )
  }
  if (neuroIds.length > 0 && judged > 0 && pctNum(neuroAllRecorded, judged) < THRESHOLDS.NEURO_ALL_RECORDED_MIN_PCT) {
    warn.push(
      `신경 검사 전부 기록 비율이 ${pctNum(neuroAllRecorded, judged).toFixed(1)}%입니다 (기준 ${THRESHOLDS.NEURO_ALL_RECORDED_MIN_PCT}%).\n` +
        '     미기록 안내문이 검사를 유도하지 못하고 있습니다 — 문구·위치를 다시 보십시오.',
    )
  }
  for (const row of directionalRows) {
    if (row.shown >= THRESHOLDS.DIRECTIONAL_MIN_SHOWN && pctNum(row.accepted, row.shown) < THRESHOLDS.DIRECTIONAL_ACCEPT_MIN_PCT) {
      warn.push(
        `${row.id}: 후보 ${row.shown}건 중 채택 ${row.accepted}건 (${pctNum(row.accepted, row.shown).toFixed(1)}%, 기준 ${THRESHOLDS.DIRECTIONAL_ACCEPT_MIN_PCT}%).\n` +
          '     방향성 조건부 운동의 채택률이 낮습니다 — v1.1 유지/삭제 결정 자료로 쓰십시오.',
      )
    }
  }
  if (regionQuestionIds.length > 0 && !followUpDirMissing && regionTotal > 0 && pctNum(followUpAnswered, regionTotal) < THRESHOLDS.DETAIL_ANSWERED_MIN_PCT) {
    warn.push(
      `재질문 부위 문항 응답이 ${NAME} 제출 대비 ${pctNum(followUpAnswered, regionTotal).toFixed(1)}%입니다 (기준 ${THRESHOLDS.DETAIL_ANSWERED_MIN_PCT}%).\n` +
        '     재질문이 발급되지 않았거나 환자가 답하지 않은 방문이 많습니다 — 발급 경로를 확인하십시오.',
    )
  }
  if (warn.length === 0) {
    console.log('  ✅ 경고 없음.')
  } else {
    for (const w of warn) console.log(`  ⚠️  ${w}`)
  }
  console.log('\n  손으로 적는 항목(카드 문장 수정, 원문 대조)은 docs/NECK_PILOT_OBSERVATION_LOG_v1.0.md 표에 적습니다.')

  // ---- ④ 단계 분포 — 기존 회고 파일럿 본체 재사용 ----------------------------
  await runStageDistribution(region)
}

// CLI: `node scripts/region-pilot-observation.mjs <region>` — import될 때는 실행하지 않는다.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runPilotObservation(process.argv[2] ?? '').catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
}
