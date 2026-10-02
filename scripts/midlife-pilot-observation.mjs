#!/usr/bin/env node
/**
 * 갱년기(Midlife) 파일럿 — 관찰 항목 자동 집계 (원장이 손으로 세지 않는다).
 *
 * 첫 5–10명 파일럿에서 PO가 확인하기로 한 것(HANDOFF 최신 78, 명세 §10) 중 기록에서 셀 수 있는
 * 것을 이미 저장된 제출 기록 + 재진 링크 응답에서 센다.
 *   ① 태블릿 소요시간 — 초진 3–5분 목표(제출 시각 − 문진 시작 시각), 갱년기 모듈 시간,
 *      화면별 머문 시간(가장 오래 걸리는 화면 = 다음에 줄일 후보). 스톱워치가 필요 없다:
 *      태블릿이 문항마다 `metadata.answers[id].answered_at`을 이미 남긴다.
 *   ② 안전 — 판정 분포(`safety_flags.midlife.status`, 태블릿이 제출 때 계산한 값 그대로),
 *      MID_08 SOP 중단(`metadata.questionnaire_halted`) 건수.
 *   ③ 원장 기록 — 원장 화면 저장, 생애단계 선택, 4주 목표(FollowUpTarget `midlife_goal:*`),
 *      외부 평가 상태 분포·미해결, 주차 review 기록.
 *   ④ 재진 PRO — 재진 링크에서 MID_05·06·07을 답한 방문.
 *
 * 개인정보: 이름·전화·생년월일·자유서술·메모를 출력하지 않는다. 출력은 건수·비율·시간·문항 id·
 * 코드값뿐이다. 원장 자유서술(가설)은 "비어 있지 않은가"만 보고 내용은 읽어 쓰지 않는다
 * (`tests/midlife-pilot-observation.spec.mjs`가 강제).
 *
 * 실행(원장 PC에서 — 클라우드 세션에는 환자 기록이 없다):
 *   npm run pilot:midlife-observation
 *   SAMINDANG_DATA_DIR=D:\경로\submissions npm run pilot:midlife-observation
 *   (재진 링크 응답은 같은 폴더 옆의 `../micro-follow-up` — 서버와 같은 배치)
 */

import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { DETAIL_CHECK_MIDLIFE_QUESTION_IDS, isMidlifeSubmissionResponses } from '../server/detailCheck.js'

/**
 * 판정 임계값 — **제안값**이다. 임상 임계값이 아니라 "이 숫자가 나오면 그 항목을 다시 본다"는
 * 회의 소집 기준이다. 바꾸면 테스트도 같이 바꾼다.
 */
export const THRESHOLDS = Object.freeze({
  /** 이 미만이면 모든 비율·중앙값은 방향 참고용. */
  MIN_N: 10,
  /** 태블릿 전체 소요시간 중앙값이 이 분(分)을 넘으면 → 문항 줄이기 검토(PO 목표 초진 3–5분). */
  TOTAL_MEDIAN_MAX_MIN: 5,
  /** 이 분 이상은 대기·자리 비움으로 보고 시간 집계에서 뺀다(별도 건수로만 보인다). */
  ABANDONED_MIN: 30,
  /** 갱년기 제출 중 원장 화면 저장이 이 % 미만이면 → 열지 않은/저장 안 된 기록이 많다. */
  WORKSPACE_SAVED_MIN_PCT: 80,
  /** 저장된 기록 중 4주 목표 설정이 이 % 미만이면 → CARE PLAN 목표 고르기 동선 재검토. */
  GOAL_SET_MIN_PCT: 70,
  /** 재진 PRO 판정 대상: 초진 후 이 일수가 지난 갱년기 제출만(첫 review가 2주차). */
  PRO_ELIGIBLE_DAYS: 14,
  /** 그중 재진 PRO 응답이 이 % 미만이면 → 재진 링크 발급·응답 경로 확인. */
  PRO_FOLLOWUP_MIN_PCT: 50,
})

// src/doctor/workspace/midlifeCare.ts / src/spec/midlifeLogic.ts 와 같은 값.
// 테스트가 TS 원본과 값이 같은지 대조한다(한쪽만 바뀌면 조용히 잘못 세지 않게).
export const SAFETY_STATUSES = ['URGENT_REVIEW', 'PRIORITY_EVALUATION', 'CLEAR', 'INCOMPLETE']
export const REFERRAL_STATUSES = ['recommended', 'ordered', 'pending', 'completed', 'result_reviewed']
export const MIDLIFE_GOAL_ID_PREFIX = 'midlife_goal:'
const SELF_HARM_HALT_REASON = 'midlife_self_harm_sop'

const SAFETY_LABEL = {
  URGENT_REVIEW: 'URGENT',
  PRIORITY_EVALUATION: '우선 외부평가',
  CLEAR: '해당 없음',
  INCOMPLETE: '계산 불가',
  MISSING: '판정 없음(옛 기록)',
}
const REFERRAL_LABEL = {
  recommended: '권고함',
  ordered: '의뢰함',
  pending: '결과 대기',
  completed: '검사 완료(결과 미확인)',
  result_reviewed: '결과 확인함',
}

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

/** 정렬된 배열의 분위수(선형 보간 없음 — 가장 가까운 순위). */
export function quantile(sorted, q) {
  if (sorted.length === 0) return null
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))
  return sorted[idx]
}

function fmtMin(ms) {
  if (ms == null) return '  -  '
  const totalSec = Math.round(ms / 1000)
  return `${Math.floor(totalSec / 60)}분 ${String(totalSec % 60).padStart(2, '0')}초`
}

function timeOf(iso) {
  if (typeof iso !== 'string') return null
  const t = Date.parse(iso)
  return Number.isFinite(t) ? t : null
}

/**
 * 문항별 머문 시간: 응답 시각을 오름차순으로 늘어놓고 바로 앞 응답(첫 문항은 문진 시작)과의 차.
 * 뒤로 가서 고친 답은 응답 시각이 뒤로 밀려 음수·이상값이 생길 수 있어 0 미만은 버린다.
 */
export function dwellByQuestion(metadata) {
  const start = timeOf(metadata?.session_started_at)
  const answers = isRecord(metadata?.answers) ? metadata.answers : {}
  const rows = Object.entries(answers)
    .map(([id, a]) => [id, timeOf(a?.answered_at)])
    .filter(([, t]) => t != null)
    .sort((a, b) => a[1] - b[1])
  const dwell = new Map()
  let prev = start
  for (const [id, t] of rows) {
    if (prev != null && t - prev >= 0) dwell.set(id, t - prev)
    prev = t
  }
  return dwell
}

export async function runMidlifePilotObservation(dataDir = process.env.SAMINDANG_DATA_DIR ?? './.data/submissions', now = Date.now()) {
  const FOLLOW_UP_DIR = path.resolve(dataDir, '..', 'micro-follow-up')

  let files
  try {
    files = (await readdir(dataDir)).filter((f) => f.endsWith('.json'))
  } catch (e) {
    console.error(`\n❌ 제출 기록 폴더를 열 수 없습니다: ${path.resolve(dataDir)}`)
    console.error(`   (${e.code ?? e.message})\n`)
    console.error('   이 스크립트는 원장님 로컬 PC에서 실행해야 합니다 —')
    console.error('   클라우드 세션에는 환자 기록이 없습니다(있어서도 안 됩니다).')
    console.error('   데이터 폴더가 다른 곳이면:')
    console.error('     SAMINDANG_DATA_DIR=D:\\경로\\submissions npm run pilot:midlife-observation\n')
    process.exitCode = 1
    return
  }

  // ---- 집계 ---------------------------------------------------------------
  let total = 0
  let unreadable = 0
  let midlifeTotal = 0
  const midlifeVisitIds = new Set()
  /** 초진 후 PRO_ELIGIBLE_DAYS가 지나 2주차 재진 PRO가 있어야 할 방문. */
  const proEligibleVisitIds = new Set()

  const totalDurations = []
  const moduleDurations = []
  let abandoned = 0
  let noTiming = 0
  const dwellLists = new Map()

  const safety = Object.fromEntries([...SAFETY_STATUSES, 'MISSING'].map((s) => [s, 0]))
  let halted = 0

  let withWorkspace = 0
  let lifeStageChosen = 0
  let goalSet = 0
  let hypothesisWritten = 0
  let withReferral = 0
  let referralTotal = 0
  let referralUnresolved = 0
  const referralStatus = Object.fromEntries(REFERRAL_STATUSES.map((s) => [s, 0]))
  let withReview = 0

  for (const f of files) {
    let record
    try {
      record = JSON.parse(await readFile(path.join(dataDir, f), 'utf8'))
    } catch {
      unreadable++
      continue
    }
    const submission = record?.submission
    if (!isRecord(submission)) continue
    total++
    const responses = isRecord(submission.responses) ? submission.responses : {}
    if (!isMidlifeSubmissionResponses(responses)) continue
    midlifeTotal++
    const end = timeOf(record.created_at)
    if (typeof record.visit_id === 'string') {
      midlifeVisitIds.add(record.visit_id)
      if (end != null && now - end >= THRESHOLDS.PRO_ELIGIBLE_DAYS * 86_400_000) proEligibleVisitIds.add(record.visit_id)
    }

    // ① 소요시간
    const metadata = isRecord(submission.metadata) ? submission.metadata : {}
    const start = timeOf(metadata.session_started_at)
    if (start == null || end == null || end < start) {
      noTiming++
    } else if (end - start >= THRESHOLDS.ABANDONED_MIN * 60_000) {
      abandoned++
    } else {
      totalDurations.push(end - start)
      const dwell = dwellByQuestion(metadata)
      let moduleMs = 0
      for (const [id, ms] of dwell) {
        if (!id.startsWith('MID_')) continue
        moduleMs += ms
        if (!dwellLists.has(id)) dwellLists.set(id, [])
        dwellLists.get(id).push(ms)
      }
      if (moduleMs > 0) moduleDurations.push(moduleMs)
    }

    // ② 안전
    const st = isRecord(responses.safety_flags) && isRecord(responses.safety_flags.midlife) ? responses.safety_flags.midlife.status : undefined
    safety[SAFETY_STATUSES.includes(st) ? st : 'MISSING']++
    if (isRecord(metadata.questionnaire_halted) && metadata.questionnaire_halted.reason === SELF_HARM_HALT_REASON) halted++

    // ③ 원장 기록
    const ws = isRecord(record.workspace) ? record.workspace : null
    if (!ws) continue
    withWorkspace++
    const care = isRecord(ws.midlifeCare) ? ws.midlifeCare : {}
    if (typeof care.lifeStage === 'string' && care.lifeStage !== '') lifeStageChosen++
    if (typeof care.hypothesis === 'string' && care.hypothesis.trim() !== '') hypothesisWritten++
    const targets = Array.isArray(ws.herbalFollowUpTargets) ? ws.herbalFollowUpTargets : []
    if (targets.some((t) => isRecord(t) && typeof t.id === 'string' && t.id.startsWith(MIDLIFE_GOAL_ID_PREFIX))) goalSet++
    const referrals = Array.isArray(care.referrals) ? care.referrals.filter(isRecord) : []
    if (referrals.length > 0) withReferral++
    for (const r of referrals) {
      const s = REFERRAL_STATUSES.includes(r.status) ? r.status : 'recommended'
      referralStatus[s]++
      referralTotal++
      if (s !== 'result_reviewed') referralUnresolved++
    }
    const reviews = Array.isArray(care.reviews) ? care.reviews.filter(isRecord) : []
    if (reviews.some((r) => (typeof r.reviewedOn === 'string' && r.reviewedOn !== '') || typeof r.courseVsExpected === 'string')) withReview++
  }

  // ---- ④ 재진 PRO ----------------------------------------------------------
  const proIds = [...DETAIL_CHECK_MIDLIFE_QUESTION_IDS]
  let followUpFiles = []
  let followUpDirMissing = false
  try {
    followUpFiles = (await readdir(FOLLOW_UP_DIR)).filter((f) => f.endsWith('.json'))
  } catch {
    followUpDirMissing = true
  }
  const proAnsweredVisits = new Set()
  let proResponses = 0
  let proEligibleAnswered = 0
  for (const f of followUpFiles) {
    let resp
    try {
      resp = JSON.parse(await readFile(path.join(FOLLOW_UP_DIR, f), 'utf8'))
    } catch {
      continue
    }
    if (!isRecord(resp) || !midlifeVisitIds.has(resp.visit_id)) continue
    const answers = Array.isArray(resp.detailAnswers) ? resp.detailAnswers : []
    const answered = answers.some((a) => isRecord(a) && proIds.includes(a.questionId) && a.value !== undefined && a.value !== null && a.value !== '')
    if (answered) {
      proResponses++
      proAnsweredVisits.add(resp.visit_id)
    }
  }

  for (const v of proAnsweredVisits) if (proEligibleVisitIds.has(v)) proEligibleAnswered++

  // ---- 출력 -----------------------------------------------------------------
  const timed = totalDurations.length
  const sortedTotal = [...totalDurations].sort((a, b) => a - b)
  const sortedModule = [...moduleDurations].sort((a, b) => a - b)
  const medianTotal = quantile(sortedTotal, 0.5)

  console.log('\n' + '='.repeat(58))
  console.log('  갱년기 파일럿 — 관찰 항목 자동 집계')
  console.log('='.repeat(58))
  console.log(`  데이터 폴더 : ${path.resolve(dataDir)}`)
  console.log(`  전체 제출   : ${total}건${unreadable ? ` (읽을 수 없는 파일 ${unreadable}건 제외)` : ''}`)
  console.log(`  갱년기 제출 : ${midlifeTotal}건`)

  if (midlifeTotal === 0) {
    console.log('\n  ⚠️  갱년기 제출 기록이 0건입니다. 집계할 파일럿 데이터가 아직 없습니다.\n')
    return
  }

  console.log('\n  ── ① 태블릿 소요시간 (목표: 초진 3–5분) ' + '─'.repeat(16))
  console.log(`  시간 집계 대상 ${timed}건  (시각 없음 ${noTiming}건, ${THRESHOLDS.ABANDONED_MIN}분 이상 대기·자리 비움 ${abandoned}건 제외)`)
  if (timed > 0) {
    console.log(`  전체 문진   중앙값 ${fmtMin(medianTotal)} · 75% ${fmtMin(quantile(sortedTotal, 0.75))} · 최장 ${fmtMin(sortedTotal[sortedTotal.length - 1])}`)
    console.log(`  3분 이내 ${String(sortedTotal.filter((ms) => ms <= 180_000).length).padStart(4)}건 ${pct(sortedTotal.filter((ms) => ms <= 180_000).length, timed)}`)
    console.log(`  5분 이내 ${String(sortedTotal.filter((ms) => ms <= 300_000).length).padStart(4)}건 ${pct(sortedTotal.filter((ms) => ms <= 300_000).length, timed)}`)
    if (sortedModule.length > 0) console.log(`  갱년기 모듈(MID_*) 중앙값 ${fmtMin(quantile(sortedModule, 0.5))}`)
    const slow = [...dwellLists.entries()]
      .map(([id, list]) => [id, quantile([...list].sort((a, b) => a - b), 0.5), list.length])
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
    if (slow.length > 0) {
      console.log('  가장 오래 머문 갱년기 화면(중앙값) — 다음에 줄일 후보:')
      for (const [id, ms, n] of slow) console.log(`    ${id.padEnd(8)} ${String(Math.round(ms / 1000)).padStart(4)}초  (${n}건)`)
    }
  }

  console.log('\n  ── ② 안전 ' + '─'.repeat(46))
  for (const s of [...SAFETY_STATUSES, 'MISSING']) {
    if (s === 'MISSING' && safety[s] === 0) continue
    console.log(`  ${SAFETY_LABEL[s].padEnd(14)} ${String(safety[s]).padStart(4)}건 ${pct(safety[s], midlifeTotal)}`)
  }
  console.log(`  MID_08 SOP로 문진 중단 ${String(halted).padStart(4)}건  (건별 동선·호출 시간은 SOP 운영 메모에 손으로 적는다)`)

  console.log('\n  ── ③ 원장 기록 ' + '─'.repeat(42))
  console.log(`  원장 화면 저장됨 ${String(withWorkspace).padStart(4)}건 ${pct(withWorkspace, midlifeTotal)}  (아래 비율의 분모)`)
  console.log(`  생애단계 선택    ${String(lifeStageChosen).padStart(4)}건 ${pct(lifeStageChosen, withWorkspace)}`)
  console.log(`  가설 기록        ${String(hypothesisWritten).padStart(4)}건 ${pct(hypothesisWritten, withWorkspace)}`)
  console.log(`  4주 목표 설정    ${String(goalSet).padStart(4)}건 ${pct(goalSet, withWorkspace)}`)
  console.log(`  주차 review 기록 ${String(withReview).padStart(4)}건 ${pct(withReview, withWorkspace)}`)
  console.log(`  외부 평가 1건 이상 ${String(withReferral).padStart(4)}건 ${pct(withReferral, withWorkspace)} — 외부 평가 ${referralTotal}건, 미해결 ${referralUnresolved}건`)
  for (const s of REFERRAL_STATUSES) {
    if (referralStatus[s] > 0) console.log(`    ${REFERRAL_LABEL[s].padEnd(16)} ${String(referralStatus[s]).padStart(4)}건`)
  }

  console.log('\n  ── ④ 재진 PRO(MID_05·06·07 재질문) ' + '─'.repeat(20))
  if (followUpDirMissing) {
    console.log(`  재진 링크 응답 폴더가 없습니다: ${FOLLOW_UP_DIR} (아직 응답 0건이면 정상)`)
  } else {
    console.log(`  응답 ${proResponses}건 · 응답한 갱년기 방문 ${proAnsweredVisits.size}건`)
    console.log(`  초진 ${THRESHOLDS.PRO_ELIGIBLE_DAYS}일 경과 방문 ${proEligibleVisitIds.size}건 중 응답 ${proEligibleAnswered}건 ${pct(proEligibleAnswered, proEligibleVisitIds.size)}`)
  }

  // ---- 판정 -------------------------------------------------------------
  console.log('\n  ── 판정 (임계값은 제안값) ' + '─'.repeat(31))
  const warn = []
  if (midlifeTotal < THRESHOLDS.MIN_N) {
    warn.push(`갱년기 기록이 ${midlifeTotal}건입니다 (기준 ${THRESHOLDS.MIN_N}건). 아래 숫자는 방향 참고용으로만 보십시오.`)
  }
  if (medianTotal != null && medianTotal > THRESHOLDS.TOTAL_MEDIAN_MAX_MIN * 60_000) {
    warn.push(
      `태블릿 전체 소요시간 중앙값이 ${fmtMin(medianTotal)}입니다 (목표 ${THRESHOLDS.TOTAL_MEDIAN_MAX_MIN}분 이내).\n` +
        '     위 "가장 오래 머문 화면"부터 문항 줄이기를 검토하십시오.',
    )
  }
  if (pctNum(withWorkspace, midlifeTotal) < THRESHOLDS.WORKSPACE_SAVED_MIN_PCT) {
    warn.push(
      `원장 화면 저장이 ${pctNum(withWorkspace, midlifeTotal).toFixed(1)}%입니다 (기준 ${THRESHOLDS.WORKSPACE_SAVED_MIN_PCT}%).\n` +
        '     열지 않았거나 저장되지 않은 기록이 많습니다 — 원장 화면 데이터 소스가 "서버 제출목록"인지 확인하십시오.',
    )
  }
  if (withWorkspace > 0 && pctNum(goalSet, withWorkspace) < THRESHOLDS.GOAL_SET_MIN_PCT) {
    warn.push(
      `4주 목표 설정이 ${pctNum(goalSet, withWorkspace).toFixed(1)}%입니다 (기준 ${THRESHOLDS.GOAL_SET_MIN_PCT}%).\n` +
        '     CARE PLAN "4주 목표 고르기"가 진료 흐름에서 빠지고 있습니다 — 위치·기본 펼침을 재검토하십시오.',
    )
  }
  if (proEligibleVisitIds.size > 0 && pctNum(proEligibleAnswered, proEligibleVisitIds.size) < THRESHOLDS.PRO_FOLLOWUP_MIN_PCT) {
    warn.push(
      `초진 ${THRESHOLDS.PRO_ELIGIBLE_DAYS}일이 지난 갱년기 방문 중 재진 PRO 응답이 ${pctNum(proEligibleAnswered, proEligibleVisitIds.size).toFixed(1)}%입니다 (기준 ${THRESHOLDS.PRO_FOLLOWUP_MIN_PCT}%).\n` +
        '     재진 링크가 발급되지 않았거나 환자가 답하지 않은 방문이 많습니다 — 발급 경로를 확인하십시오.',
    )
  }
  if (referralUnresolved > 0) {
    warn.push(`결과를 확인하지 않은 외부 평가가 ${referralUnresolved}건 있습니다 — 원장 화면 REFERRAL 카드에서 하나씩 닫으십시오.`)
  }
  if (warn.length === 0) {
    console.log('  ✅ 경고 없음.')
  } else {
    for (const w of warn) console.log(`  ⚠️  ${w}`)
  }
  console.log('\n  손으로 적는 항목(SOP 양성 사례 동선·호출 시간, 환자 반응)은 SOP 운영 메모에 적습니다.\n')
}

// CLI: `node scripts/midlife-pilot-observation.mjs` — import될 때는 실행하지 않는다.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runMidlifePilotObservation().catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
}
