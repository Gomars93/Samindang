// Doctor-view fixture + label-resolution suite.
// Run via `npm run test:doctor` (bundles src/doctor/fixtures.ts and
// src/doctor/labels.ts with esbuild first, same style as the other suites).
// Plain node, no test framework: assert() prints "OK: <name>" and throws on failure.

import React from 'react'
import { renderToString } from 'react-dom/server'
import { DOCTOR_FIXTURES } from './.doctor-fixtures-bundle.mjs'
import { optionLabel, optionLabels } from './.doctor-labels-bundle.mjs'
import {
  createEmptyJudgment,
  validateJudgment,
  finalizeJudgment,
} from './.doctor-judgment-bundle.mjs'
import { DOCTOR_SECTION_ORDER } from './.doctor-sectionorder-bundle.mjs'
import { DoctorView } from './.doctor-view-bundle.cjs'

let passCount = 0

function assert(name, cond) {
  if (!cond) {
    throw new Error(`FAIL: ${name}`)
  }
  passCount++
  console.log(`OK: ${name}`)
}

function byName(name) {
  const f = DOCTOR_FIXTURES.find((x) => x.name === name)
  if (!f) throw new Error(`fixture not found: ${name}`)
  return f
}

/* ---------------------------------------------------------------------
 * 1. Every fixture is a fully-formed payload with all top-level keys.
 * ------------------------------------------------------------------- */

assert('7 fixtures are defined', DOCTOR_FIXTURES.length >= 7)

for (const f of DOCTOR_FIXTURES) {
  const p = f.payload
  assert(`${f.name}: has responses`, p.responses && typeof p.responses === 'object')
  assert(`${f.name}: has flags`, p.flags && typeof p.flags === 'object')
  assert(`${f.name}: has routing`, p.routing && typeof p.routing === 'object')
  assert(`${f.name}: has myungri_calculation`, p.myungri_calculation && typeof p.myungri_calculation === 'object')
  assert(`${f.name}: has questionnaire_version`, typeof p.questionnaire_version === 'string')
  assert(`${f.name}: has session_id`, typeof p.session_id === 'string')
}

/* ---------------------------------------------------------------------
 * 2. Safety fixture actually requires staff check.
 * ------------------------------------------------------------------- */

{
  const f = byName('안전 확인 필요')
  assert('safety fixture: requires_staff_check === true', f.payload.flags.requires_staff_check === true)
  assert('safety fixture: general_red flag set (SAFETY_01)', f.payload.flags.general_red === true)
  assert('safety fixture: bowel_needs_review flag set (BOWEL_03)', f.payload.flags.bowel_needs_review === true)
}

/* ---------------------------------------------------------------------
 * 3. Pregnancy fixture: myungri present + reproductive status derived
 *    from the pregnancy module (not the general safety question).
 * ------------------------------------------------------------------- */

{
  const f = byName('임신 상담')
  assert('pregnancy fixture: myungri_calculation present', !!f.payload.myungri_calculation)
  assert(
    'pregnancy fixture: reproductive_status.derived.source === pregnancy_module',
    f.payload.responses.reproductive_status.derived.source === 'pregnancy_module',
  )
  assert(
    'pregnancy fixture: derived.pregnant === true',
    f.payload.responses.reproductive_status.derived.pregnant === true,
  )
}

/* ---------------------------------------------------------------------
 * 4. Time-unknown fixture (체중 관리) -> myungri partial, hour pillar null.
 * ------------------------------------------------------------------- */

{
  const f = byName('체중 관리')
  assert('time-unknown fixture: status === partial', f.payload.myungri_calculation.status === 'partial')
  assert('time-unknown fixture: pillars.hour === null', f.payload.myungri_calculation.pillars.hour === null)
}

/* ---------------------------------------------------------------------
 * 5. 자시(ja) fixture -> pending_approval includes day_boundary.
 * ------------------------------------------------------------------- */

{
  const f = byName('안전 확인 필요')
  assert(
    'ja-time fixture: policy.pending_approval includes day_boundary',
    f.payload.myungri_calculation.policy.pending_approval.includes('day_boundary'),
  )
  assert(
    'ja-time fixture: flags.in_jasi_window === true',
    f.payload.myungri_calculation.flags.in_jasi_window === true,
  )
}

/* ---------------------------------------------------------------------
 * 6. Lunar-leap fixture actually resolves via BIRTH_02A/BIRTH_02 = lunar/yes.
 * ------------------------------------------------------------------- */

{
  const f = byName('여성 건강 주호소')
  assert(
    'lunar-leap fixture: birth_calendar_type is lunar',
    f.payload.responses.birth_info.birth_calendar_type === 'lunar',
  )
  assert('lunar-leap fixture: lunar_leap_month is yes', f.payload.responses.birth_info.lunar_leap_month === 'yes')
  assert(
    'lunar-leap fixture: myungri_calculation resolved',
    f.payload.myungri_calculation.status === 'resolved',
  )
}

/* ---------------------------------------------------------------------
 * 7. Label-resolution helper: never leaks a raw enum where a Korean label
 *    is expected. Spot-check across several different questions/answers.
 * ------------------------------------------------------------------- */

{
  const cases = [
    { qid: 'ID_03', value: 'male', expected: '남성' },
    { qid: 'ID_03', value: 'female', expected: '여성' },
    { qid: 'VISIT_02_SYMPTOM_MAIN', value: 'sleep', expected: '잠이 불편해요' },
    { qid: 'SLEEP_01', value: 'night_awakenings', expected: '자다가 자주 깨요' },
    { qid: 'SAFETY_01', value: 'none', expected: '해당 없음' },
    { qid: 'SECONDARY_01', value: 'none', expected: '없음' },
    { qid: 'MED_USE', value: 'unknown', expected: '잘 모르겠어요' },
    { qid: 'BOWEL_03', value: 'yes', expected: '네' },
  ]
  for (const c of cases) {
    const got = optionLabel(c.qid, c.value)
    assert(
      `optionLabel(${c.qid}, ${c.value}) resolves to Korean label, not the raw enum`,
      got === c.expected && got !== c.value,
    )
  }

  const arr = optionLabels('SLEEP_01', ['sleep_onset', 'night_awakenings'])
  assert(
    'optionLabels resolves every item in an array (no raw enum leaks)',
    arr.join(',') === '잠들기 어려워요,자다가 자주 깨요',
  )

  // Free-text / numeric questions have no options -> the raw value is the
  // correct "label" (there is nothing to translate); confirm the helper
  // doesn't crash and doesn't invent a label for those.
  assert('optionLabel falls back to raw value for free-text questions', optionLabel('ID_01', '김민준') === '김민준')
}

/* ---------------------------------------------------------------------
 * 8. createEmptyJudgment fills provenance from the payload, leaves
 *    interpretive fields empty, recorded_at/transcript_import null.
 * ------------------------------------------------------------------- */

{
  const f = byName('안전 확인 필요')
  const saju = f.payload.myungri_calculation
  const sourcePayload = {
    session_id: f.payload.session_id,
    questionnaire_version: f.payload.questionnaire_version,
    myungri_algorithm_version: saju.policy.algorithm_version,
    myungri_library_version: saju.engine.library_version,
    myungri_status: saju.status,
    myungri_pending_approval: saju.policy.pending_approval,
  }
  const j = createEmptyJudgment(sourcePayload)

  assert('createEmptyJudgment: schema_version set', j.schema_version === '1.0.0')
  assert('createEmptyJudgment: recorded_at null', j.recorded_at === null)
  assert('createEmptyJudgment: transcript_import null', j.transcript_import === null)
  assert('createEmptyJudgment: source.session_id from payload', j.source.session_id === f.payload.session_id)
  assert(
    'createEmptyJudgment: source.questionnaire_version from payload',
    j.source.questionnaire_version === f.payload.questionnaire_version,
  )
  assert(
    'createEmptyJudgment: source.myungri_algorithm_version from payload',
    j.source.myungri_algorithm_version === saju.policy.algorithm_version,
  )
  assert('createEmptyJudgment: source.myungri_status from payload', j.source.myungri_status === saju.status)
  assert(
    'createEmptyJudgment: source.myungri_pending_approval from payload (day_boundary)',
    j.source.myungri_pending_approval.includes('day_boundary'),
  )
  assert('createEmptyJudgment: innate_features empty', j.innate_features.length === 0)
  assert('createEmptyJudgment: symptom_links empty', j.symptom_links.length === 0)
  assert('createEmptyJudgment: learning_case false', j.learning_case === false)
  assert('createEmptyJudgment: debrief null', j.debrief === null)

  /* -------------------------------------------------------------------
   * 9. validateJudgment enforces the max-3 / max-2 caps with Korean errors.
   * ----------------------------------------------------------------- */

  const tooManyInnate = { ...j, innate_features: ['a', 'b', 'c', 'd'], symptom_links: [] }
  const rInnate = validateJudgment(tooManyInnate)
  assert('validateJudgment: rejects 4 innate_features', rInnate.ok === false)
  assert(
    'validateJudgment: 4 innate_features error is Korean',
    rInnate.errors.some((e) => /핵심 선천 특징/.test(e)),
  )

  const tooManySymptom = { ...j, innate_features: [], symptom_links: ['a', 'b', 'c'] }
  const rSymptom = validateJudgment(tooManySymptom)
  assert('validateJudgment: rejects 3 symptom_links', rSymptom.ok === false)
  assert(
    'validateJudgment: 3 symptom_links error is Korean',
    rSymptom.errors.some((e) => /현재 증상과 연결되는 핵심/.test(e)),
  )

  const okCounts = { ...j, innate_features: ['a', 'b', 'c'], symptom_links: ['a', 'b'] }
  const rOk = validateJudgment(okCounts)
  assert('validateJudgment: accepts 3 innate_features and 2 symptom_links', rOk.ok === true && rOk.errors.length === 0)

  /* -------------------------------------------------------------------
   * 10. finalizeJudgment sets ISO recorded_at, drops empty strings,
   *     and does not mutate the input.
   * ----------------------------------------------------------------- */

  const beforeFinalize = { ...j, innate_features: ['간 기운이 강함', '', '  '], symptom_links: ['', '수면 문제'] }
  const frozenCopy = JSON.parse(JSON.stringify(beforeFinalize))
  const finalized = finalizeJudgment(beforeFinalize)

  assert('finalizeJudgment: recorded_at is ISO string', !Number.isNaN(Date.parse(finalized.recorded_at)))
  assert(
    'finalizeJudgment: drops empty-string entries from innate_features',
    finalized.innate_features.length === 1 && finalized.innate_features[0] === '간 기운이 강함',
  )
  assert(
    'finalizeJudgment: drops empty-string entries from symptom_links',
    finalized.symptom_links.length === 1 && finalized.symptom_links[0] === '수면 문제',
  )
  assert(
    'finalizeJudgment: does not mutate the input object',
    JSON.stringify(beforeFinalize) === JSON.stringify(frozenCopy),
  )

  /* -------------------------------------------------------------------
   * 11. ClinicianJudgment key set matches the documented contract exactly
   *     (no machine-generated interpretation field ever sneaks in).
   * ----------------------------------------------------------------- */

  const expectedKeys = [
    'schema_version',
    'recorded_at',
    'source',
    'innate_features',
    'symptom_links',
    'saju_only_prediction',
    'revised_after_exam',
    'final_treatment_axis',
    'prescription_direction',
    'learning_case',
    'debrief',
    'transcript_import',
  ].sort()
  assert(
    'ClinicianJudgment: key set exactly matches the documented contract',
    JSON.stringify(Object.keys(j).sort()) === JSON.stringify(expectedKeys),
  )
}

/* ---------------------------------------------------------------------
 * 12. Section ordering: safety banner and medication/history must render
 *     before the myungri review block, and judgment_record comes last.
 * ------------------------------------------------------------------- */

{
  const idx = (id) => DOCTOR_SECTION_ORDER.indexOf(id)
  assert('DOCTOR_SECTION_ORDER: safety_banner before myungri_review', idx('safety_banner') < idx('myungri_review'))
  assert(
    'DOCTOR_SECTION_ORDER: medication_history before myungri_review',
    idx('medication_history') < idx('myungri_review'),
  )
  assert(
    'DOCTOR_SECTION_ORDER: judgment_record after myungri_review',
    idx('judgment_record') > idx('myungri_review'),
  )
}

/* ---------------------------------------------------------------------
 * 13. DoctorView redesign — "10초 요약" card, safety-glance, secondary
 *     concern chips, collapsible sections, judgment-panel collapse.
 *     Rendered server-side with renderToString (same instance of React
 *     that DoctorView.tsx was bundled against, so no invalid-hook-call).
 * ------------------------------------------------------------------- */

function fixtureIndexByName(name) {
  const i = DOCTOR_FIXTURES.findIndex((f) => f.name === name)
  if (i === -1) throw new Error(`fixture not found: ${name}`)
  return i
}

function renderDoctorView(fixtureName) {
  return renderToString(React.createElement(DoctorView, { initialFixtureIndex: fixtureIndexByName(fixtureName) }))
}

/** <details class="X">…</details> 범위(문자열 index)를 돌려준다. 중첩 details 없는 경우에만 안전. */
function detailsRange(html, classMarker) {
  const attrIdx = html.indexOf(classMarker)
  assert(`detailsRange: marker found (${classMarker})`, attrIdx !== -1)
  const openIdx = html.lastIndexOf('<details', attrIdx)
  const closeIdx = html.indexOf('</details>', attrIdx)
  assert(`detailsRange: <details> open tag found (${classMarker})`, openIdx !== -1)
  assert(`detailsRange: </details> close tag found (${classMarker})`, closeIdx !== -1)
  return [openIdx, closeIdx]
}

// 13a. 6개 요약 카테고리가 안전 배너보다 먼저, 그리고 서로 순서대로 나온다.
{
  const html = renderDoctorView('수면 주호소 + 동반 소화/통증')
  const labels = ['주호소', '기간/빈도', '핵심 악화·유발요인', '동반문제', '안전이슈', '명리 계산']
  const idx = labels.map((l) => html.indexOf(l))
  idx.forEach((i, n) => assert(`10초 요약: category "${labels[n]}" present`, i !== -1))
  for (let i = 1; i < idx.length; i++) {
    assert(`10초 요약: "${labels[i - 1]}" before "${labels[i]}"`, idx[i - 1] < idx[i])
  }
  const firstSectionIdx = html.indexOf('환자 기본')
  assert('10초 요약: entire card is before the first regular section (환자 기본)', idx[idx.length - 1] < firstSectionIdx)
}

// 13b. requires_staff_check 픽스처: 요약 카드의 안전이슈 줄이 비어있지 않고
//      상세 안전 배너보다 먼저 나오며, 안전정보 한눈에 블록에 항목이 있다.
{
  const html = renderDoctorView('안전 확인 필요')
  const summarySafetyIdx = html.indexOf('안전이슈')
  // 픽스처 선택 드롭다운에도 "안전 확인 필요"라는 fixture 이름이 나오므로,
  // 배너 본문에만 있는 고유 문구로 위치를 잡는다.
  const bannerIdx = html.indexOf('환자가 아래 내용을 문진에서 보고했습니다')
  assert('safety fixture: summary card 안전이슈 present', summarySafetyIdx !== -1)
  assert('safety fixture: summary card 안전이슈 before detailed danger banner', summarySafetyIdx < bannerIdx)
  assert('safety fixture: 안전정보 한눈에 renders at least one item', html.includes('doctor__safetyChip'))
}

// 13c. 안전 이슈 없는 픽스처: "안전이슈 없음"이 muted로만 표시되고 danger 배너 클래스는 전혀 없다.
{
  const html = renderDoctorView('수면 주호소 + 동반 소화/통증')
  assert('benign fixture: no doctor__banner--danger anywhere', !html.includes('doctor__banner--danger'))
  assert('benign fixture: summary card shows muted 안전이슈 chip', html.includes('doctor__tenSecChip--muted'))
  assert('benign fixture: summary card 안전이슈 text says 없음', html.includes('안전이슈') && html.includes('없음'))
}

// 13d. status === 'partial' 픽스처: 요약 카드 명리 줄에 상태가 드러나고,
//      그 문구가 원장 판단 기록(JudgmentPanel) 안에서는 나타나지 않는다.
{
  const f = byName('체중 관리')
  assert('weight fixture: myungri status is partial', f.payload.myungri_calculation.status === 'partial')
  const html = renderDoctorView('체중 관리')
  const sajuIdx = html.indexOf('부분 계산')
  assert('partial fixture: summary card saju line mentions 부분/시주 미상', sajuIdx !== -1)
  const judgmentIdx = html.indexOf('원장 판단 기록')
  assert('partial fixture: summary saju text renders before 원장 판단 기록 section (not inside it)', sajuIdx < judgmentIdx)
}

// 13e. pending_approval 픽스처: 경고가 danger 배너와 다른 클래스로 눈에 띄게 표시된다.
{
  const html = renderDoctorView('안전 확인 필요')
  assert('pending-approval fixture: warning text present', html.includes('정책이 아직 확정되지 않아'))
  assert('pending-approval fixture: uses doctor__warning--pending class', html.includes('doctor__warning--pending'))
  const pendingTextIdx = html.indexOf('주의: 야자시')
  const nearby = html.slice(Math.max(0, pendingTextIdx - 300), pendingTextIdx)
  assert('pending-approval fixture: nearby markup is not the red danger banner class', !nearby.includes('doctor__banner--danger'))
}

// 13f. 동반문제: 정확히 2개의 칩, "자세히" 펼치면 전체 답변 텍스트가 존재한다(데이터 손실 없음).
{
  const html = renderDoctorView('수면 주호소 + 동반 소화/통증')
  const chipCount = (html.match(/class="doctor__secChip"/g) ?? []).length
  assert('secondary concerns: exactly 2 chips render', chipCount === 2)
  assert('secondary concerns: 자세히 details toggle exists', html.includes('doctor__secDetails'))
  const giAnswer = optionLabels('GI_01', ['indigestion', 'reflux']).join(', ')
  assert('secondary concerns: full answer text still present (progressive disclosure)', html.includes(giAnswer))
}

// 13g. 전신·한약 참고: 값이 있으면 <details>로 감싸고, summary가 비어있지 않다.
{
  const html = renderDoctorView('수면 주호소 + 동반 소화/통증')
  assert('constitution section: wrapped in doctor__constDetails when populated', html.includes('doctor__constDetails'))
  const [openIdx, closeIdx] = detailsRange(html, 'doctor__constDetails')
  const summaryMatch = html.slice(openIdx, closeIdx).match(/<summary>([^<]*)<\/summary>/)
  assert('constitution section: summary preview non-empty', !!summaryMatch && summaryMatch[1].trim() !== '')
}

// 13h. JudgmentPanel: 핵심 필드는 details 밖, 나머지 4개는 details 안에 접혀 있다(기본 접힘).
{
  const html = renderDoctorView('수면 주호소 + 동반 소화/통증')
  const [openIdx, closeIdx] = detailsRange(html, 'judgment__secondaryFields')
  const innateIdx = html.indexOf('핵심 선천 특징')
  const symptomLinkIdx = html.indexOf('현재 증상과 연결되는 핵심')
  assert('judgment panel: 핵심 선천 특징 renders outside the collapsed details', innateIdx !== -1 && innateIdx < openIdx)
  assert(
    'judgment panel: 현재 증상과 연결되는 핵심 renders outside the collapsed details',
    symptomLinkIdx !== -1 && symptomLinkIdx < openIdx,
  )
  for (const label of ['사주만 보고 예상한', '문진·맥·설·복진 후 수정된 판단', '최종 치료축', '처방 방향']) {
    const i = html.indexOf(label)
    assert(`judgment panel: "${label}" present`, i !== -1)
    assert(`judgment panel: "${label}" falls inside the collapsed details`, i > openIdx && i < closeIdx)
  }
}

// 13i. 중복 감사(§PART9): "1~3개월"(주호소 duration 답) 텍스트는 정확히 3번 —
//      새 10초 요약 카드, 기존 주호소 섹션, 기존 명리 검토의 "현재 문진 요약" 열.
{
  const html = renderDoctorView('수면 주호소 + 동반 소화/통증')
  const durationLabel = optionLabel('VISIT_03_SYMPTOM_DURATION', '1_3m')
  const count = html.split(durationLabel).length - 1
  assert('duplication audit: duration label renders exactly 3 times (summary + 주호소 + myungri column)', count === 3)
}

console.log(`\n${passCount} assertions passed, 0 failed (total ${passCount})`)
