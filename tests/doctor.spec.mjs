// Doctor-view fixture + label-resolution suite.
// Run via `npm run test:doctor` (bundles src/doctor/fixtures.ts and
// src/doctor/labels.ts with esbuild first, same style as the other suites).
// Plain node, no test framework: assert() prints "OK: <name>" and throws on failure.

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
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
import { deriveSafetyOverview } from './.doctor-safety-overview-bundle.mjs'
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
 * 2b. MENOPAUSE_SLEEP v0.2 Compact fixture: doctor-facing flags render,
 *     no diagnosis label leaks, no immediate StaffCheck coupling.
 * ------------------------------------------------------------------- */

{
  const f = byName('여성 수면 주호소 + 갱년기 연동')
  assert('MS fixture: sleep_disorder_priority_review flag set (witnessed_apnea)', f.payload.flags.sleep_disorder_priority_review === true)
  assert('MS fixture: requires_staff_check stays false (no auto navigation)', f.payload.flags.requires_staff_check === false)
  assert(
    'MS fixture: modules.sleep.menopause.stage recorded',
    f.payload.responses.modules.sleep.menopause.stage === 'cycle_changing',
  )

  const html = renderDoctorView('여성 수면 주호소 + 갱년기 연동')
  assert('MS fixture: DoctorView renders 수면장애 선별 chip', html.includes('수면장애 선별'))
  assert('MS fixture: chip shows priority wording', html.includes('우선 확인 필요'))
  assert('MS fixture: no OSA/무호흡증/하지불안증후군 diagnosis label leaks', !/무호흡증|하지불안증후군|OSA|RLS/.test(html))

  // 10-second summary danger chip surfaces the priority sleep-disorder review too.
  assert('MS fixture: 10초 요약 안전이슈 chip shows 수면장애 우선확인', html.includes('수면장애 우선확인'))

  // Clinician-readable MENOPAUSE_SLEEP narrative summary (raw dump 대신).
  assert('MS fixture: renders 갱년기 수면 narrative summary block', html.includes('doctor__msSummary--sleep'))
  assert('MS fixture: narrative mentions 생리 상태', html.includes('생리: 생리 주기가 전과 달라지고 있어요'))
  assert('MS fixture: narrative mentions 야간 열감/발한', html.includes('야간 열감/발한: 일주일에 여러 번 있어요'))
  assert('MS fixture: narrative combines sleep time/awakenings/return-to-sleep on one line', /수면: 5~6시간 \/ 각성 2~3번 \/ 재입면 30~60분/.test(html))
}

// Male sleep-primary patient (no menopause gate) must not render the narrative block.
{
  const f = byName('수면 주호소 + 동반 소화/통증')
  assert('male sleep fixture: menopause gate never answered', f.payload.responses.modules.sleep.menopause.gate_context === null)
  const html = renderDoctorView('수면 주호소 + 동반 소화/통증')
  assert('male sleep fixture: no 갱년기 수면 narrative block rendered', !html.includes('doctor__msSummary--sleep'))
}

/* ---------------------------------------------------------------------
 * 2c. LBP_V1 primary-pain fixture: safety panel renders, primary_module
 *     stays 'Pain' (never repurposed, Opus review S9), Suggested Exam
 *     card renders, no patient-facing diagnosis/probability leaks.
 * ------------------------------------------------------------------- */

{
  const f = byName('허리 통증 주호소 (LBP, 확인 필요)')
  assert('LBP fixture: primary_module stays Pain', f.payload.routing.primary_module === 'Pain')
  assert('LBP fixture: primary_module_detail is LBP', f.payload.routing.primary_module_detail === 'LBP')
  assert(
    'LBP fixture: lbp_safety_status is REVIEW_REQUIRED (bilateral + NUMBNESS)',
    f.payload.responses.safety_flags.lbp?.lbp_safety_status === 'REVIEW_REQUIRED',
  )
  assert(
    'LBP fixture: leg_symptom_present is YES',
    f.payload.responses.safety_flags.lbp?.leg_symptom_present === 'YES',
  )
  assert(
    'LBP fixture: does NOT trigger requires_staff_check (LBP_04=NONE, non-urgent review only)',
    f.payload.flags.requires_staff_check === false,
  )

  const html = renderDoctorView('허리 통증 주호소 (LBP, 확인 필요)')
  assert('LBP fixture: renders 안전 확인 — 허리 panel title', html.includes('안전 확인 — 허리'))
  assert('LBP fixture: shows 확인 필요 status', html.includes('확인 필요'))
  assert('LBP fixture: renders 신경근성 증상 가능성 chip', html.includes('신경근성 증상 가능성'))
  assert('LBP fixture: renders 추가 권장 검사 card', html.includes('추가 권장 검사'))
  assert(
    'LBP fixture: checklist item 17/18 — REVIEW_REQUIRED locks routine recommendation UI note',
    html.includes('안전 확인 전까지 일상적인 운동/치료 추천은 잠깁니다'),
  )
  assert('LBP fixture: PAIN_01 question text renders (module detail includes LBP fields)', html.includes('가장 불편한 한 곳을 눌러주세요'))
  assert('LBP fixture: LBP_01 question text renders', html.includes('허리 통증이나 불편감이 가장 멀리'))
  assert(
    'LBP fixture: no patient-facing diagnosis/probability language (예: 추간판탈출증/디스크/확률)',
    !/추간판탈출증|디스크\s*진단|확률\s*\d/.test(html),
  )
}

/* ---------------------------------------------------------------------
 * 2c-1b. Doctor View 재설계 v0.2 A5/Opus B3 regression: 주호소가 비-통증
 *        (수면)인데 추가 상세상담으로 LBP_01-14를 응답한 환자.
 *        safety_flags.lbp는 non-null이지만 routing.primary_module_detail은
 *        계속 null이다(additional_module_detail만 'LBP') — 안전 확인
 *        리스트/진찰 소견 radio가 primary_module_detail 리터럴로
 *        게이트되면 이 환자의 LBP 안전 정보가 원장 화면에서 통째로
 *        사라진다. P2가 safety_flags.<module> !== null 게이트로 통합 안전
 *        리스트를 도입하면서 구조적으로 이미 해소됐음을 여기서 고정한다
 *        (claude/fix-lbp-safety-panel-gate 브랜치의 독립 fixture/테스트와
 *        no-op 수렴을 의도).
 * ------------------------------------------------------------------- */

{
  const name = '수면 주호소 + 추가 상세상담(허리 통증, LBP 안전확인 게이트 회귀)'
  const f = byName(name)
  assert('B3 regression fixture: primary_module_detail is null (primary concern is sleep, not pain)', f.payload.routing.primary_module_detail === null)
  assert('B3 regression fixture: additional_module_detail is LBP', f.payload.routing.additional_module_detail === 'LBP')
  assert('B3 regression fixture: safety_flags.lbp is non-null despite primary_module_detail being null', f.payload.responses.safety_flags.lbp !== null)
  assert(
    'B3 regression fixture: lbp_safety_status is REVIEW_REQUIRED (bilateral + NUMBNESS, same pattern as primary-LBP fixture)',
    f.payload.responses.safety_flags.lbp?.lbp_safety_status === 'REVIEW_REQUIRED',
  )

  const html = renderDoctorView(name)
  assert('B3 regression: 안전 확인 — 허리(LBP) row renders despite null primary_module_detail', html.includes('안전 확인 — 허리'))
  assert('B3 regression: LBP exam input (객관적 하지 근력저하 소견) renders in JudgmentPanel', html.includes('객관적 하지 근력저하 소견'))
}

/* ---------------------------------------------------------------------
 * 2c-2. Tablet UX v2.1 §11-§24: Primary/Additional Detailed Concern/
 *       Reference Symptoms render as three distinct DoctorView sections.
 * ------------------------------------------------------------------- */

{
  const name = '허리 통증 주호소 + 추가 상세상담(수면) + 참고 증상(소화·기타)'
  const f = byName(name)
  assert('v2.1 fixture: routing.additional_module is Sleep', f.payload.routing.additional_module === 'Sleep')
  assert('v2.1 fixture: routing.additional_detail_concern is sleep', f.payload.routing.additional_detail_concern === 'sleep')
  assert(
    'v2.1 fixture: routing.reference_symptoms includes digestion and other',
    (f.payload.routing.reference_symptoms ?? []).includes('digestion') &&
      (f.payload.routing.reference_symptoms ?? []).includes('other'),
  )
  assert('v2.1 fixture: primary_module_detail stays LBP (primary is pain)', f.payload.routing.primary_module_detail === 'LBP')
  assert('v2.1 fixture: additional_module_detail is null (additional is sleep, not pain)', f.payload.routing.additional_module_detail === null)

  const html = renderDoctorView(name)
  assert('v2.1 fixture: renders 추가 상세상담 section heading', html.includes('추가 상세상담'))
  assert('v2.1 fixture: 추가 상세상담 shows the chosen category label (잠)', /추가 상세상담[\s\S]{0,400}잠/.test(html))
  assert('v2.1 fixture: renders the additional module\'s full detail (SLEEP_01 question text)', html.includes('잠에서 불편한 점이 있나요'))
  assert('v2.1 fixture: renders 참고 증상 section heading', html.includes('참고 증상'))
  assert('v2.1 fixture: 참고 증상 shows the reference category chip (속·소화)', /참고 증상[\s\S]{0,600}속·소화/.test(html))
  assert('v2.1 fixture: renders the "기타 참고증상 있음" cue', html.includes('기타 참고증상 있음'))
  assert(
    'v2.1 fixture: reference symptoms never render as a diagnosis (only the informational note text, no red/danger banner class nearby)',
    !/doctor__banner--danger[\s\S]{0,50}참고 증상|참고 증상[\s\S]{0,50}doctor__banner--danger/.test(html),
  )
  // Doctor View redesign v0.2 §3: legacy 동반문제 섹션은 데이터가 있을 때만
  // 렌더한다(항상-빈 섹션 상주 금지) — 이 fixture는 새 방식(추가 상세상담/
  // 참고 증상)만 쓰므로 legacy secondary_concerns가 비어 있고, 섹션 자체가
  // 통째로 렌더되지 않아야 한다(예전처럼 "동반문제 없음" 안내문을 보여주지 않는다).
  assert('v2.1 fixture: legacy 동반문제 section is entirely absent when empty (§3)', !html.includes('>동반문제<'))
}

/* ---------------------------------------------------------------------
 * 2d. NECK_V1 primary-pain fixture: safety panel renders, primary_module
 *     stays 'Pain', primary_module_detail is 'NECK', manipulation-lock
 *     note is distinct from LBP's exercise/treatment lock note (D8),
 *     Suggested Exam card renders, no patient-facing diagnosis leaks.
 * ------------------------------------------------------------------- */

{
  const f = byName('목 통증 주호소 (NECK, 확인 필요)')
  assert('NECK fixture: primary_module stays Pain', f.payload.routing.primary_module === 'Pain')
  assert('NECK fixture: primary_module_detail is NECK', f.payload.routing.primary_module_detail === 'NECK')
  assert(
    'NECK fixture: neck_safety_status is REVIEW_REQUIRED (HAND_CLUMSINESS, non-urgent)',
    f.payload.responses.safety_flags.neck?.neck_safety_status === 'REVIEW_REQUIRED',
  )
  assert(
    'NECK fixture: neck_treatment_safety_status is CLEAR',
    f.payload.responses.safety_flags.neck?.neck_treatment_safety_status === 'CLEAR',
  )
  assert(
    'NECK fixture: radicular_support is HIGHER_SUPPORT (HAND_FINGERS + PARESTHESIA)',
    f.payload.responses.safety_flags.neck?.radicular_support === 'HIGHER_SUPPORT',
  )
  assert(
    'NECK fixture: does NOT trigger requires_staff_check (non-urgent review only)',
    f.payload.flags.requires_staff_check === false,
  )

  const html = renderDoctorView('목 통증 주호소 (NECK, 확인 필요)')
  assert('NECK fixture: renders 안전 확인 — 목 panel title', html.includes('안전 확인 — 목'))
  assert('NECK fixture: shows 확인 필요 status', html.includes('확인 필요'))
  assert('NECK fixture: renders 신경근성 증상(방사통) 지지도 chip', html.includes('신경근성 증상(방사통) 지지도'))
  assert('NECK fixture: renders 경인성 두통 패턴 chip (N11=YES)', html.includes('경인성 두통 패턴'))
  assert('NECK fixture: renders 추가 권장 검사 card', html.includes('추가 권장 검사'))
  assert(
    'NECK fixture: disease-safety lock note renders (exercise lock)',
    html.includes('안전 확인 전까지 일상적인 운동 추천은 잠깁니다'),
  )
  assert(
    'D8: disease-safety non-CLEAR also locks manipulation, distinct wording from LBP exercise/treatment note',
    html.includes('안전 확인 전까지 경추 HVLA/추나 조작·견인 제안도 함께 잠깁니다'),
  )
  assert('NECK fixture: PAIN_01 question text renders (module detail includes NECK fields)', html.includes('가장 불편한 한 곳을 눌러주세요'))
  assert('NECK fixture: NECK_02 question text renders', html.includes('다음 증상이 있나요? 최근 새로 생긴 것뿐 아니라'))
  assert(
    'NECK fixture: no patient-facing diagnosis/probability language (예: 경추디스크/척수병증 진단/확률)',
    !/경추\s*디스크|척수병증\s*진단|확률\s*\d/.test(html),
  )
}

/* ---------------------------------------------------------------------
 * 2e. SHOULDER_V1 primary-pain fixture: primary_module_detail is
 *     'SHOULDER' (NS01=SHOULDER_DOMINANT), shoulder_safety_status is
 *     REVIEW_REQUIRED (not URGENT -- F3/decision §11: SH03 acute cuff
 *     concern alone never auto-escalates), expedited_referral_consider
 *     renders with its distinct wording, canonical NECK safety is
 *     CLEAR(this fixture's safety issue is shoulder-only -- the mirror
 *     image of the NECK fixture above, which is neck-only), and NECK's
 *     own safety panel/fields do NOT spuriously appear for a
 *     shoulder-only safety issue.
 * ------------------------------------------------------------------- */

{
  const f = byName('어깨 통증 주호소 (SHOULDER, 신속 의뢰 고려)')
  assert('SHOULDER fixture: primary_module stays Pain', f.payload.routing.primary_module === 'Pain')
  assert('SHOULDER fixture: primary_module_detail is SHOULDER', f.payload.routing.primary_module_detail === 'SHOULDER')
  assert(
    'SHOULDER fixture: shoulder_safety_status is REVIEW_REQUIRED (SH03 acute cuff concern, not urgent)',
    f.payload.responses.safety_flags.shoulder?.shoulder_safety_status === 'REVIEW_REQUIRED',
  )
  assert(
    'SHOULDER fixture: shoulder_safety_status is NOT URGENT_REVIEW (F3/decision §11)',
    f.payload.responses.safety_flags.shoulder?.shoulder_safety_status !== 'URGENT_REVIEW',
  )
  assert(
    'SHOULDER fixture: expedited_referral_consider is true (SH03=YES)',
    f.payload.responses.safety_flags.shoulder?.expedited_referral_consider === true,
  )
  assert(
    'SHOULDER fixture: canonical neck_safety_status is CLEAR (this fixture is a shoulder-only safety issue)',
    f.payload.responses.safety_flags.neck?.neck_safety_status === 'CLEAR',
  )
  assert(
    'SHOULDER fixture: does NOT trigger requires_staff_check (REVIEW_REQUIRED only, no URGENT interrupt condition met)',
    f.payload.flags.requires_staff_check === false,
  )

  const html = renderDoctorView('어깨 통증 주호소 (SHOULDER, 신속 의뢰 고려)')
  assert('SHOULDER fixture: renders 안전 확인 — 어깨 panel title', html.includes('안전 확인 — 어깨'))
  assert('SHOULDER fixture: shows 확인 필요 status', html.includes('확인 필요'))
  assert(
    'SHOULDER fixture: renders 신속 전문의 평가/의뢰 고려 chip (expedited_referral_consider)',
    html.includes('신속 전문의 평가/의뢰 고려'),
  )
  assert('SHOULDER fixture: renders 추가 권장 검사 card', html.includes('추가 권장 검사'))
  assert(
    'SHOULDER fixture: disease-safety lock note renders',
    html.includes('안전 확인 전까지 일상적인 운동/도수치료 추천은 잠깁니다'),
  )
  assert('SHOULDER fixture: PAIN_01 question text renders', html.includes('가장 불편한 한 곳을 눌러주세요'))
  assert('SHOULDER fixture: NS01 question text renders', html.includes('현재 가장 주된 불편은 어디인가요'))
  assert('SHOULDER fixture: SH01 question text renders', html.includes('어깨에 외상이 있었나요'))
  assert(
    'SHOULDER fixture: F1 -- NeckSafetyPanel STILL renders (canonical NECK safety is computed unconditionally, gated on safety_flags.neck, not on primary_module_detail) and correctly shows CLEAR for this shoulder-only issue',
    html.includes('안전 확인 — 목(NECK)'),
  )
  assert(
    'SHOULDER fixture: no patient-facing diagnosis/probability language (예: 회전근개파열 진단/확률)',
    !/회전근개\s*파열\s*진단|확률\s*\d/.test(html),
  )
}

/* ---------------------------------------------------------------------
 * 2f. KNEE_V1 primary-pain fixture: primary_module_detail is 'KNEE',
 *     demonstrates both closed decisions in one fixture -- K5 DVT
 *     de-escalation (KNEE_06=YES + KNEE_06A=[NONE] alone does NOT create
 *     REVIEW_REQUIRED/dvt_assessment_required) and K9's occult
 *     hip-fracture referred option (the sole positive finding here,
 *     REVIEW_REQUIRED + fracture_imaging_consider, no new tier).
 * ------------------------------------------------------------------- */

{
  const f = byName('무릎 통증 주호소 (KNEE, 고관절 연관통 의심)')
  assert('KNEE fixture: primary_module stays Pain', f.payload.routing.primary_module === 'Pain')
  assert('KNEE fixture: primary_module_detail is KNEE', f.payload.routing.primary_module_detail === 'KNEE')
  assert(
    'KNEE fixture: knee_safety_status is REVIEW_REQUIRED (KNEE_08 hip/groin option, not urgent)',
    f.payload.responses.safety_flags.knee?.knee_safety_status === 'REVIEW_REQUIRED',
  )
  assert(
    'KNEE fixture: knee_safety_status is NOT URGENT_REVIEW',
    f.payload.responses.safety_flags.knee?.knee_safety_status !== 'URGENT_REVIEW',
  )
  assert(
    'K5 CRITICAL: dvt_assessment_required is false (KNEE_06=YES + KNEE_06A=[NONE] alone does not trigger it)',
    f.payload.responses.safety_flags.knee?.dvt_assessment_required === false,
  )
  assert(
    'K9: fracture_imaging_consider is true (KNEE_08 hip/groin/weight-bearing option)',
    f.payload.responses.safety_flags.knee?.fracture_imaging_consider === true,
  )
  assert(
    'KNEE fixture: expedited_referral_consider is false (KNEE_04/05 both NO)',
    f.payload.responses.safety_flags.knee?.expedited_referral_consider === false,
  )
  assert(
    'KNEE fixture: does NOT trigger requires_staff_check (REVIEW_REQUIRED only, no URGENT interrupt condition met)',
    f.payload.flags.requires_staff_check === false,
  )

  const html = renderDoctorView('무릎 통증 주호소 (KNEE, 고관절 연관통 의심)')
  assert('KNEE fixture: renders 안전 확인 — 무릎 panel title', html.includes('안전 확인 — 무릎'))
  assert('KNEE fixture: shows 확인 필요 status', html.includes('확인 필요'))
  assert('KNEE fixture: renders 골절·영상 평가 고려 chip with 예', /골절·영상 평가 고려<\/strong> (?:<!-- -->)?예/.test(html))
  // Doctor View 재설계 v0.2 §11.3: 계산 플래그는 true인 것만 렌더한다 —
  // K5 de-escalation의 증거는 이제 "아니요" 텍스트가 아니라 칩 자체의 부재다.
  assert(
    'KNEE fixture: 계산 플래그가 true만 렌더 — DVT 평가 필요 chip은 아예 렌더되지 않음 (K5 de-escalation)',
    !html.includes('DVT 평가 필요'),
  )
  assert(
    'KNEE fixture: disease-safety lock note renders',
    html.includes('안전 확인 전까지 일상적인 운동/도수치료 추천은 잠깁니다'),
  )
  assert('KNEE fixture: renders 추가 권장 검사 card', html.includes('추가 권장 검사'))
  assert('KNEE fixture: PAIN_01 question text renders', html.includes('가장 불편한 한 곳을 눌러주세요'))
  assert('KNEE fixture: KNEE_02A question text renders', html.includes('저절로 제자리로 돌아온 적이 있나요'))
  assert('KNEE fixture: KNEE_08 hip/groin option label renders', html.includes('엉덩이·사타구니 통증'))
  assert(
    'KNEE fixture: no patient-facing diagnosis/probability language (예: 고관절 골절 진단/확률)',
    !/고관절\s*골절\s*진단|확률\s*\d/.test(html),
  )
}

/* ---------------------------------------------------------------------
 * 2g. ELBOW_V1 primary-pain fixture: primary_module_detail is 'ELBOW',
 *     demonstrates both a genuine positive tier (ELBOW_04 distal biceps
 *     concern -> REVIEW_REQUIRED + expedited_referral_consider) and E5's
 *     stable sensory-only de-escalation (ELBOW_09=YES + ELBOW_09A=[NONE]
 *     must not independently add REVIEW_REQUIRED or
 *     neuro_assessment_required -- the fixture's only safety contribution
 *     comes from ELBOW_04).
 * ------------------------------------------------------------------- */

{
  const f = byName('팔꿈치 통증 주호소 (ELBOW, 신속 의뢰 고려)')
  assert('ELBOW fixture: primary_module stays Pain', f.payload.routing.primary_module === 'Pain')
  assert('ELBOW fixture: primary_module_detail is ELBOW', f.payload.routing.primary_module_detail === 'ELBOW')
  assert(
    'ELBOW fixture: elbow_safety_status is REVIEW_REQUIRED (ELBOW_04 distal biceps concern, not urgent)',
    f.payload.responses.safety_flags.elbow?.elbow_safety_status === 'REVIEW_REQUIRED',
  )
  assert(
    'ELBOW fixture: elbow_safety_status is NOT URGENT_REVIEW',
    f.payload.responses.safety_flags.elbow?.elbow_safety_status !== 'URGENT_REVIEW',
  )
  assert(
    'ELBOW fixture: expedited_referral_consider is true (ELBOW_04=YES)',
    f.payload.responses.safety_flags.elbow?.expedited_referral_consider === true,
  )
  assert(
    'E5 CRITICAL: neuro_assessment_required is false (ELBOW_09=YES + ELBOW_09A=[NONE] alone does not trigger it)',
    f.payload.responses.safety_flags.elbow?.neuro_assessment_required === false,
  )
  assert(
    'ELBOW fixture: fracture_imaging_consider is false (ELBOW_03=NO)',
    f.payload.responses.safety_flags.elbow?.fracture_imaging_consider === false,
  )
  assert(
    'ELBOW fixture: infection_assessment_required is false (ELBOW_07=NO, ELBOW_08=NONE)',
    f.payload.responses.safety_flags.elbow?.infection_assessment_required === false,
  )
  assert(
    'ELBOW fixture: does NOT trigger requires_staff_check (REVIEW_REQUIRED only, no URGENT interrupt condition met)',
    f.payload.flags.requires_staff_check === false,
  )

  const html = renderDoctorView('팔꿈치 통증 주호소 (ELBOW, 신속 의뢰 고려)')
  assert('ELBOW fixture: renders 안전 확인 — 팔꿈치 panel title', html.includes('안전 확인 — 팔꿈치'))
  assert('ELBOW fixture: shows 확인 필요 status', html.includes('확인 필요'))
  assert('ELBOW fixture: renders 신속 의뢰 고려 chip with 예', /신속 의뢰 고려<\/strong> (?:<!-- -->)?예/.test(html))
  // v0.2 §11.3: true만 렌더 — E5 de-escalation은 이제 칩 부재로 증명한다.
  assert('ELBOW fixture: 계산 플래그가 true만 렌더 — 신경학적 평가 필요 chip 부재 (E5 de-escalation)', !html.includes('신경학적 평가 필요'))
  assert(
    'ELBOW fixture: disease-safety lock note renders',
    html.includes('안전 확인 전까지 일상적인 운동/도수치료 추천은 잠깁니다'),
  )
  assert('ELBOW fixture: renders 추가 권장 검사 card', html.includes('추가 권장 검사'))
  assert('ELBOW fixture: PAIN_01 question text renders', html.includes('가장 불편한 한 곳을 눌러주세요'))
  assert('ELBOW fixture: ELBOW_00 question text renders', html.includes('지금 가장 불편한 부위는 어디에 가장 가깝나요'))
  assert('ELBOW fixture: ELBOW_02A question text renders', html.includes('저절로 제자리로 돌아온 적이 있나요'))
  assert(
    'ELBOW fixture: no patient-facing diagnosis/probability language (예: 이두근 파열 진단/확률)',
    !/이두근\s*파열\s*진단|확률\s*\d/.test(html),
  )
}

/* ---------------------------------------------------------------------
 * 2h. WRIST_HAND_V1: two fixtures.
 *
 * (1) WRIST_HAND-only, stable sensory-only (WH_08=MEDIAN_DISTRIBUTION +
 *     WH_08A=[NONE]) with everything else valid-negative -- the carve-out
 *     is the ONLY thing standing between this fixture and REVIEW_REQUIRED,
 *     so a bugged carve-out would flip the overall tier here (not just a
 *     flag), a stronger regression signal than isolating the flag alone.
 * (2) FOREARM overlap -- this repo's first case where two protected-safety
 *     modules are simultaneously non-null for one patient. WH_04=YES
 *     (occult fracture pattern) is the fixture's only positive finding;
 *     WH_04A=DONE_TOLD_NORMAL demonstrates the non-gating X-ray context
 *     (Fable plan §9) end-to-end through the real payload and UI.
 * ------------------------------------------------------------------- */

{
  const f = byName('손목 통증 주호소 (WRIST_HAND, 안정형 감각이상)')
  assert('WRIST_HAND fixture: primary_module stays Pain', f.payload.routing.primary_module === 'Pain')
  assert('WRIST_HAND fixture: primary_module_detail is WRIST_HAND', f.payload.routing.primary_module_detail === 'WRIST_HAND')
  assert('WRIST_HAND fixture: safety_flags.elbow is null (ELBOW_00=WRIST_HAND excludes ELBOW safety)', f.payload.responses.safety_flags.elbow === null)
  assert(
    'E5-analog CRITICAL: wrist_hand_safety_status is CLEAR (WH_08=MEDIAN_DISTRIBUTION + WH_08A=[NONE] stable sensory-only, no other positive finding)',
    f.payload.responses.safety_flags.wrist_hand?.wrist_hand_safety_status === 'CLEAR',
  )
  assert(
    'E5-analog CRITICAL: neuro_assessment_required is false (stable sensory-only de-escalation)',
    f.payload.responses.safety_flags.wrist_hand?.neuro_assessment_required === false,
  )
  assert(
    'WRIST_HAND fixture: expedited_referral_consider is false',
    f.payload.responses.safety_flags.wrist_hand?.expedited_referral_consider === false,
  )
  assert(
    'WRIST_HAND fixture: does NOT trigger requires_staff_check',
    f.payload.flags.requires_staff_check === false,
  )

  const html = renderDoctorView('손목 통증 주호소 (WRIST_HAND, 안정형 감각이상)')
  assert('WRIST_HAND fixture: renders 안전 확인 — 손목/손 panel title', html.includes('안전 확인 — 손목/손'))
  assert('WRIST_HAND fixture: status chip shows CLEAR label (안전)', /<strong>안전 확인<\/strong> (?:<!-- -->)?안전(?:<!-- -->)?<\/span>/.test(html))
  // v0.2 §11.3: true만 렌더 — E5-analog de-escalation은 이제 칩 부재로 증명한다.
  assert('WRIST_HAND fixture: 계산 플래그가 true만 렌더 — 신경학적 평가 필요 chip 부재 (stable sensory-only)', !html.includes('신경학적 평가 필요'))
  assert('WRIST_HAND fixture: does NOT render 안전 확인 — 팔꿈치 panel (ELBOW safety is null)', !html.includes('안전 확인 — 팔꿈치'))
  assert('WRIST_HAND fixture: PAIN_01 question text renders', html.includes('가장 불편한 한 곳을 눌러주세요'))
  assert('WRIST_HAND fixture: WH_08 question text renders', html.includes('손가락 저림이나 감각이상이 있다면'))
  assert(
    'WRIST_HAND fixture: no patient-facing diagnosis/probability language (예: 수근관증후군 진단/확률)',
    !/수근관증후군\s*진단|확률\s*\d/.test(html),
  )
}

{
  const f = byName('전완 통증 주호소 (FOREARM, 팔꿈치+손목 동시 노출)')
  assert('FOREARM fixture: primary_module_detail is ELBOW (priority order, display-only)', f.payload.routing.primary_module_detail === 'ELBOW')
  assert(
    'FOREARM CRITICAL: safety_flags.elbow !== null AND safety_flags.wrist_hand !== null simultaneously',
    f.payload.responses.safety_flags.elbow !== null && f.payload.responses.safety_flags.wrist_hand !== null,
  )
  assert('FOREARM fixture: elbow_safety_status is CLEAR (all ELBOW_* valid-negative)', f.payload.responses.safety_flags.elbow?.elbow_safety_status === 'CLEAR')
  assert(
    'FOREARM fixture: wrist_hand_safety_status is REVIEW_REQUIRED (WH_04=YES occult fracture pattern)',
    f.payload.responses.safety_flags.wrist_hand?.wrist_hand_safety_status === 'REVIEW_REQUIRED',
  )
  assert(
    'FOREARM fixture: fracture_imaging_consider is true (WH_04=YES)',
    f.payload.responses.safety_flags.wrist_hand?.fracture_imaging_consider === true,
  )
  assert(
    'FOREARM fixture: does NOT trigger requires_staff_check (REVIEW_REQUIRED only)',
    f.payload.flags.requires_staff_check === false,
  )

  const html = renderDoctorView('전완 통증 주호소 (FOREARM, 팔꿈치+손목 동시 노출)')
  assert('FOREARM CRITICAL: renders BOTH 안전 확인 — 팔꿈치 AND 안전 확인 — 손목/손 panels', html.includes('안전 확인 — 팔꿈치') && html.includes('안전 확인 — 손목/손'))
  assert('FOREARM fixture: renders 골절·영상 평가 고려 chip with 예', /골절·영상 평가 고려<\/strong> (?:<!-- -->)?예/.test(html))
  assert(
    'FOREARM fixture: WH_04A non-gating X-ray context renders as a patient-reported note',
    html.includes('X-ray 촬영, 정상이라고 들었음(환자 보고)') && html.includes('안전 판정에는 영향을 주지 않는 환자 보고 정보입니다'),
  )
  assert(
    'FOREARM CRITICAL: WH_04A DONE_TOLD_NORMAL does not suppress the REVIEW_REQUIRED status or fracture flag',
    html.includes('확인 필요') && /골절·영상 평가 고려<\/strong> (?:<!-- -->)?예/.test(html),
  )
  assert('FOREARM fixture: ELBOW_00 question text renders', html.includes('지금 가장 불편한 부위는 어디에 가장 가깝나요'))
  assert('FOREARM fixture: WH_04 question text renders', html.includes('엄지손가락 뿌리 가까운 부위가 계속 아픈가요'))
}

/* ---------------------------------------------------------------------
 * 2i. TMJ_V1: 14 fixtures covering T1-T8. Payload-level checks for all
 *     14; HTML render checks for the clinically critical subset (urgent
 *     tiers, GCA age modifier, dental/infection distinction, and the
 *     HEADACHE_CRANIAL exclusion -- T2's "no invented TMJ panel"
 *     guarantee).
 * ------------------------------------------------------------------- */

{
  const f = byName('턱관절 통증 주호소 (TMJ, 안전 확인 완료)')
  assert('TMJ clear fixture: primary_module_detail is TMJ', f.payload.routing.primary_module_detail === 'TMJ')
  assert('TMJ clear fixture: tmj_safety_status is CLEAR', f.payload.responses.safety_flags.tmj?.tmj_safety_status === 'CLEAR')
  assert('TMJ clear fixture: does NOT trigger requires_staff_check', f.payload.flags.requires_staff_check === false)

  const html = renderDoctorView('턱관절 통증 주호소 (TMJ, 안전 확인 완료)')
  assert('TMJ clear fixture: renders 안전 확인 — 턱관절/얼굴 panel title', html.includes('안전 확인 — 턱관절/얼굴'))
  assert('TMJ clear fixture: status chip shows CLEAR label (안전)', /<strong>안전 확인<\/strong> (?:<!-- -->)?안전(?:<!-- -->)?<\/span>/.test(html))
  assert('TMJ clear fixture: PAIN_01 question text renders', html.includes('가장 불편한 한 곳을 눌러주세요'))
  assert('TMJ clear fixture: HFJ_00 question text renders', html.includes('머리·얼굴·턱 중 지금 가장 불편한 부위나 양상은 어디에 가깝나요'))
}

{
  const f = byName('턱관절 통증 주호소 (TMJ, 안정형 기계적 표현형/무통 클릭)')
  assert('T7 CRITICAL: stable mechanical phenotype (protected negative) is CLEAR', f.payload.responses.safety_flags.tmj?.tmj_safety_status === 'CLEAR')
}

{
  const f = byName('턱관절 통증 주호소 (TMJ, 현재 고정된 잠김)')
  assert('TMJ current-lock fixture: tmj_safety_status is REVIEW_REQUIRED', f.payload.responses.safety_flags.tmj?.tmj_safety_status === 'REVIEW_REQUIRED')
  assert('TMJ current-lock fixture: trauma_or_dislocation_assessment_required is true', f.payload.responses.safety_flags.tmj?.trauma_or_dislocation_assessment_required === true)
  assert('TMJ current-lock fixture: does NOT trigger requires_staff_check (review only)', f.payload.flags.requires_staff_check === false)
}

{
  const f = byName('턱관절 통증 주호소 (TMJ, 외상 후 교합 변화)')
  assert('T3 CRITICAL: trauma+bite-change alone is REVIEW, not URGENT', f.payload.responses.safety_flags.tmj?.tmj_safety_status === 'REVIEW_REQUIRED')
  assert('T3: trauma_or_dislocation_assessment_required is true', f.payload.responses.safety_flags.tmj?.trauma_or_dislocation_assessment_required === true)

  const html = renderDoctorView('턱관절 통증 주호소 (TMJ, 외상 후 교합 변화)')
  assert('TMJ bite-change fixture: renders 외상·탈구 평가 필요 chip with 예', /외상·탈구 평가 필요<\/strong> (?:<!-- -->)?예/.test(html))
}

{
  const f = byName('턱관절 통증 주호소 (TMJ, 턱 고정 비정상 위치 응급)')
  assert('T3 CRITICAL: jaw stuck open is URGENT_REVIEW (standalone)', f.payload.responses.safety_flags.tmj?.tmj_safety_status === 'URGENT_REVIEW')
  // Note: module-level tmj_safety_status URGENT is independent of Core's
  // requires_staff_check (SAFETY_01/GI_03/BOWEL_03 only, see computeFlags in
  // coreSpec.ts) -- the real-time interrupt for a module urgent fires via
  // STAFF_CHECK_TRIGGERS.TMJ_01(r) at answer-time (verified in
  // tests/integration.spec.mjs Q-D1), not via a persistent submitted-payload
  // flag. Same pattern already established for ELBOW/KNEE/WRIST_HAND.

  const html = renderDoctorView('턱관절 통증 주호소 (TMJ, 턱 고정 비정상 위치 응급)')
  assert('TMJ jaw-stuck-open fixture: status chip shows 긴급 확인 필요', /<strong>안전 확인<\/strong> (?:<!-- -->)?긴급 확인 필요/.test(html))
  assert('TMJ jaw-stuck-open fixture: routine-treatment lock note renders', html.includes('안전 확인 전까지 일상적인 운동/도수치료 추천은 잠깁니다'))
}

{
  const f = byName('치아·구강 통증 주호소 (TMJ, 국소 치아 감염 의심)')
  assert('T4 CRITICAL: localized dental concern is REVIEW, not URGENT', f.payload.responses.safety_flags.tmj?.tmj_safety_status === 'REVIEW_REQUIRED')
  assert('T4: dental_or_oral_assessment_required is true', f.payload.responses.safety_flags.tmj?.dental_or_oral_assessment_required === true)
  assert('T4: infection_assessment_required is true', f.payload.responses.safety_flags.tmj?.infection_assessment_required === true)

  const html = renderDoctorView('치아·구강 통증 주호소 (TMJ, 국소 치아 감염 의심)')
  assert('TMJ localized-dental fixture: renders 치과·구강 평가 필요 chip with 예', /치과·구강 평가 필요<\/strong> (?:<!-- -->)?예/.test(html))
  assert('TMJ localized-dental fixture: renders 감염 평가 필요 chip with 예', /감염 평가 필요<\/strong> (?:<!-- -->)?예/.test(html))
  assert(
    'TMJ localized-dental fixture: no patient-facing abscess diagnosis language',
    !/농양\s*진단|농양(?:으로|이라고)?\s*확진|확률\s*\d/.test(html),
  )
}

{
  const f = byName('치아·구강 통증 주호소 (TMJ, 확산성 치과 응급)')
  assert('T4 CRITICAL: spreading dental/oral emergency is URGENT_REVIEW', f.payload.responses.safety_flags.tmj?.tmj_safety_status === 'URGENT_REVIEW')
  assert('T4: infection_assessment_required is true', f.payload.responses.safety_flags.tmj?.infection_assessment_required === true)
}

{
  const f = byName('얼굴 감각 이상 주호소 (TMJ, 국소 신경학적 변화)')
  assert('T6: facial numbness is REVIEW, not URGENT', f.payload.responses.safety_flags.tmj?.tmj_safety_status === 'REVIEW_REQUIRED')
  assert('T6: neuro_assessment_required is true', f.payload.responses.safety_flags.tmj?.neuro_assessment_required === true)
  assert('T6: expedited_referral_consider is true', f.payload.responses.safety_flags.tmj?.expedited_referral_consider === true)

  const html = renderDoctorView('얼굴 감각 이상 주호소 (TMJ, 국소 신경학적 변화)')
  assert('TMJ facial-numbness fixture: renders 신경학적 평가 필요 chip with 예', /신경학적 평가 필요<\/strong> (?:<!-- -->)?예/.test(html))
  assert('TMJ facial-numbness fixture: renders 신속 의뢰 고려 chip with 예', /신속 의뢰 고려<\/strong> (?:<!-- -->)?예/.test(html))
}

{
  const f = byName('턱관절 통증 주호소 (TMJ, 50세 이상 GCA 의심 패턴)')
  assert('T5 CRITICAL: age>=50 GCA-compatible pattern alone is REVIEW, not URGENT', f.payload.responses.safety_flags.tmj?.tmj_safety_status === 'REVIEW_REQUIRED')
  assert('T5: gca_assessment_required is true', f.payload.responses.safety_flags.tmj?.gca_assessment_required === true)
  assert('T5: expedited_referral_consider is true', f.payload.responses.safety_flags.tmj?.expedited_referral_consider === true)

  const html = renderDoctorView('턱관절 통증 주호소 (TMJ, 50세 이상 GCA 의심 패턴)')
  assert('TMJ GCA fixture: renders 측두동맥염(GCA) 평가 필요 chip with 예', /측두동맥염\(GCA\) 평가 필요<\/strong> (?:<!-- -->)?예/.test(html))
  assert(
    'TMJ GCA fixture: no patient-facing GCA diagnosis language',
    !/측두동맥염\s*진단|측두동맥염(?:으로|이라고)?\s*확진(?!이\s*아니)|확률\s*\d/.test(html),
  )
}

{
  const f = byName('턱관절 통증 주호소 (TMJ, GCA 의심+시야 증상 응급)')
  assert('T5 CRITICAL: GCA-compatible pattern + visual disturbance, age>=50 -> URGENT_REVIEW', f.payload.responses.safety_flags.tmj?.tmj_safety_status === 'URGENT_REVIEW')
}

{
  const f = byName('턱관절 통증 주호소 (TMJ, 나이 미상 GCA 의심 패턴)')
  assert(
    'T5 CRITICAL: age unknown + GCA-compatible pattern fails closed to REVIEW (not negative, not URGENT)',
    f.payload.responses.safety_flags.tmj?.tmj_safety_status === 'REVIEW_REQUIRED',
  )
  assert('T5: age-unknown gca_assessment_required is still true (not treated as negative)', f.payload.responses.safety_flags.tmj?.gca_assessment_required === true)
}

{
  const f = byName('두통 주호소 (TMJ population, HEADACHE_CRANIAL 제외)')
  assert('T2 CRITICAL: HEADACHE_CRANIAL -> safety_flags.tmj === null', f.payload.responses.safety_flags.tmj === null)
  assert("T2 CRITICAL: HEADACHE_CRANIAL -> primary_module_detail === null (not 'TMJ', no invented HEADACHE_V1 threshold)", f.payload.routing.primary_module_detail === null)

  const html = renderDoctorView('두통 주호소 (TMJ population, HEADACHE_CRANIAL 제외)')
  assert('T2 CRITICAL: HEADACHE_CRANIAL fixture does NOT render any TMJ safety panel', !html.includes('안전 확인 — 턱관절/얼굴'))
  assert('T2: HFJ_00 question text still renders (routing question itself is always shown)', html.includes('머리·얼굴·턱 중 지금 가장 불편한 부위나 양상은 어디에 가깝나요'))
}

{
  const f = byName('머리·얼굴·턱 통증 주호소 (TMJ, HFJ 부위 미상 라우팅)')
  assert('T1: HFJ_00=UNKNOWN still exposes TMJ protected safety -- primary_module_detail is TMJ', f.payload.routing.primary_module_detail === 'TMJ')
  assert('T1: HFJ_00=UNKNOWN, protected negative -> CLEAR', f.payload.responses.safety_flags.tmj?.tmj_safety_status === 'CLEAR')
}

{
  const f = byName('턱관절 통증 주호소 (TMJ, malformed 응답 회귀)')
  assert(
    'T8 CRITICAL: malformed TMJ_01 (NONE mixed with an out-of-allowlist value) fails closed, never CLEAR',
    f.payload.responses.safety_flags.tmj?.tmj_safety_status !== 'CLEAR',
  )
}

/* ---------------------------------------------------------------------
 * 2j. HIP_V1: 15 fixtures covering H1-H8. HIP shares the `low_back_pelvis`
 *     population with FROZEN LBP by design (H1/H7) -- the critical
 *     regression boundary here is that both LbpSafetyPanel and
 *     HipSafetyPanel must render simultaneously for a HIP-route patient
 *     without either suppressing the other, and HipSafetyPanel must NOT
 *     render for a LOW_BACK_DOMINANT patient (H1) or any non-low_back_pelvis
 *     patient. Payload-level checks for all 15; HTML render checks for the
 *     clinically critical subset (urgent tiers, stress-fracture lock,
 *     LBP+HIP coexistence, and the LOW_BACK_DOMINANT exclusion).
 * ------------------------------------------------------------------- */

{
  const f = byName('고관절 통증 주호소 (HIP, 안전 확인 완료)')
  assert('HIP clear fixture: hip_safety_status is CLEAR', f.payload.responses.safety_flags.hip?.hip_safety_status === 'CLEAR')
  assert('HIP clear fixture: does NOT trigger requires_staff_check', f.payload.flags.requires_staff_check === false)

  const html = renderDoctorView('고관절 통증 주호소 (HIP, 안전 확인 완료)')
  assert('HIP clear fixture: renders 안전 확인 — 고관절/사타구니 panel title', html.includes('안전 확인 — 고관절/사타구니'))
  assert('HIP clear fixture: status chip shows CLEAR label (안전)', /<strong>안전 확인<\/strong> (?:<!-- -->)?안전(?:<!-- -->)?<\/span>/.test(html))
  assert('HIP clear fixture: also renders 안전 확인 — 허리 (LBP panel) simultaneously', html.includes('안전 확인 — 허리'))
  assert('HIP clear fixture: HIP_00 question text renders', html.includes('허리·골반 부위 중 지금 가장 불편한 곳은 어디에 가깝나요'))
}

{
  const f = byName('고관절 통증 주호소 (HIP, 최근 외상 여부 미상)')
  assert('H8: HIP_01 UNKNOWN fails closed to REVIEW_REQUIRED (never a valid negative)', f.payload.responses.safety_flags.hip?.hip_safety_status === 'REVIEW_REQUIRED')
}

{
  const f = byName('고관절 통증 주호소 (HIP, 관절 변형 응급)')
  assert('H2 CRITICAL: HIP_02 gross deformity is URGENT_REVIEW', f.payload.responses.safety_flags.hip?.hip_safety_status === 'URGENT_REVIEW')
  // Note: module-level hip_safety_status URGENT is independent of Core's
  // requires_staff_check (SAFETY_01/GI_03/BOWEL_03 only, see computeFlags in
  // coreSpec.ts) -- the real-time interrupt for a module urgent fires via
  // STAFF_CHECK_TRIGGERS.HIP_02(r) at answer-time (verified in
  // tests/integration.spec.mjs R-D1), not via a persistent submitted-payload
  // flag. Same pattern already established for TMJ/ELBOW/KNEE/WRIST_HAND.

  const html = renderDoctorView('고관절 통증 주호소 (HIP, 관절 변형 응급)')
  assert('HIP deformity fixture: status chip shows 긴급 확인 필요', /<strong>안전 확인<\/strong> (?:<!-- -->)?긴급 확인 필요/.test(html))
  assert('HIP deformity fixture: routine-treatment lock note renders', html.includes('안전 확인 전까지 일상적인 운동/도수치료 추천은 잠깁니다'))
}

{
  const f = byName('고관절 통증 주호소 (HIP, 외상 후 다리 신경 손상 응급)')
  assert('H2 CRITICAL: traumatic major distal neuro deficit is standalone URGENT_REVIEW', f.payload.responses.safety_flags.hip?.hip_safety_status === 'URGENT_REVIEW')
}

{
  const f = byName('고관절 통증 주호소 (HIP, 외상 없는 다리 신경 증상)')
  assert('H2: same major neuro finding WITHOUT trauma is REVIEW, not URGENT', f.payload.responses.safety_flags.hip?.hip_safety_status === 'REVIEW_REQUIRED')
  assert('H2: neuro_assessment_required is true', f.payload.responses.safety_flags.hip?.neuro_assessment_required === true)
  assert('H2: expedited_referral_consider is true', f.payload.responses.safety_flags.hip?.expedited_referral_consider === true)
}

{
  const f = byName('고관절 통증 주호소 (HIP, 외상 후 보행 곤란 + 이전 X-ray 정상)')
  assert('H3 CRITICAL: post-traumatic marked walking difficulty is REVIEW, not URGENT', f.payload.responses.safety_flags.hip?.hip_safety_status === 'REVIEW_REQUIRED')
  assert('H3: fracture_imaging_consider is true', f.payload.responses.safety_flags.hip?.fracture_imaging_consider === true)
  assert('H3: expedited_referral_consider is true', f.payload.responses.safety_flags.hip?.expedited_referral_consider === true)
  assert(
    'H4 CRITICAL: prior "told normal" X-ray context does NOT lower safety or suppress fracture_imaging_consider',
    f.payload.responses.safety_flags.hip?.fracture_imaging_consider === true && f.payload.responses.safety_flags.hip?.hip_safety_status !== 'CLEAR',
  )

  const html = renderDoctorView('고관절 통증 주호소 (HIP, 외상 후 보행 곤란 + 이전 X-ray 정상)')
  assert('HIP walking-difficulty fixture: renders 골절 영상검사 고려 chip with 예', /골절 영상검사 고려<\/strong> (?:<!-- -->)?예/.test(html))
  assert(
    'H4: prior-imaging-context derived note renders (context only, never objective imaging data)',
    html.includes('환자보고 이전 X-ray 결과는 참고 맥락일 뿐이며'),
  )
}

{
  const f = byName('고관절 통증 주호소 (HIP, 피로골절 의심 패턴)')
  assert('H5 CRITICAL: full stress-fracture compatible pattern is REVIEW, not URGENT', f.payload.responses.safety_flags.hip?.hip_safety_status === 'REVIEW_REQUIRED')
  assert('H5: stress_fracture_assessment_required is true', f.payload.responses.safety_flags.hip?.stress_fracture_assessment_required === true)
  assert('H5: fracture_imaging_consider is true', f.payload.responses.safety_flags.hip?.fracture_imaging_consider === true)
  assert('H5: loading_exercise_lock is true', f.payload.responses.safety_flags.hip?.loading_exercise_lock === true)

  const html = renderDoctorView('고관절 통증 주호소 (HIP, 피로골절 의심 패턴)')
  assert('HIP stress-fracture fixture: renders 피로골절 평가 필요 chip with 예', /피로골절 평가 필요<\/strong> (?:<!-- -->)?예/.test(html))
  assert('HIP stress-fracture fixture: renders 부하운동 잠금 chip with 예', /부하운동 잠금<\/strong> (?:<!-- -->)?예/.test(html))
  assert(
    'HIP stress-fracture fixture: no patient-facing stress-fracture diagnosis language',
    !/피로골절(?:으로|이라고)?\s*확진(?!이\s*아니)|피로골절\s*진단|확률\s*\d/.test(html),
  )
}

{
  const f = byName('고관절 통증 주호소 (HIP, 부분 피로골절 패턴/자동 진단 아님)')
  assert('H5 CRITICAL: partial pattern does NOT auto-diagnose a stress fracture', f.payload.responses.safety_flags.hip?.stress_fracture_assessment_required === false)
  assert('H5: partial pattern remains a protected non-negative history (still REVIEW)', f.payload.responses.safety_flags.hip?.hip_safety_status === 'REVIEW_REQUIRED')
}

{
  const f = byName('고관절 통증 주호소 (HIP, 국소 감염 의심)')
  assert('H6: localized/stable infection concern is REVIEW, not URGENT', f.payload.responses.safety_flags.hip?.hip_safety_status === 'REVIEW_REQUIRED')
  assert('H6: infection_assessment_required is true', f.payload.responses.safety_flags.hip?.infection_assessment_required === true)
}

{
  const f = byName('고관절 통증 주호소 (HIP, 전신 증상 동반 감염 응급)')
  assert('H6 CRITICAL: systemic/rapidly worsening (opaque OR enum) is URGENT_REVIEW', f.payload.responses.safety_flags.hip?.hip_safety_status === 'URGENT_REVIEW')
  assert('H6: infection_assessment_required is true', f.payload.responses.safety_flags.hip?.infection_assessment_required === true)

  const html = renderDoctorView('고관절 통증 주호소 (HIP, 전신 증상 동반 감염 응급)')
  assert('HIP infection fixture: renders 감염 평가 필요 chip with 예', /감염 평가 필요<\/strong> (?:<!-- -->)?예/.test(html))
  assert(
    'HIP infection fixture: no patient-facing infection diagnosis language, fever absence never framed as a rule-out',
    !/감염\s*진단|발열이\s*없으므로/.test(html),
  )
}

{
  const f = byName('고관절 통증 주호소 (HIP, 비외상성 진행성 신경 증상)')
  assert('H2: non-traumatic progressive distal numbness/weakness (HIP_06) is REVIEW, not URGENT', f.payload.responses.safety_flags.hip?.hip_safety_status === 'REVIEW_REQUIRED')
  assert('H2: neuro_assessment_required is true', f.payload.responses.safety_flags.hip?.neuro_assessment_required === true)
  assert('H2: expedited_referral_consider is true', f.payload.responses.safety_flags.hip?.expedited_referral_consider === true)
}

{
  const f = byName('고관절 통증 주호소 (HIP+LBP 동시 노출)')
  assert('H1/H7 CRITICAL: LBP+HIP simultaneous -- safety_flags.lbp !== null', f.payload.responses.safety_flags.lbp !== null)
  assert('H1/H7 CRITICAL: LBP+HIP simultaneous -- safety_flags.hip !== null', f.payload.responses.safety_flags.hip !== null)
  assert('H1/H7: LBP finding not suppressed by HIP -- lbp_safety_status REVIEW_REQUIRED', f.payload.responses.safety_flags.lbp?.lbp_safety_status === 'REVIEW_REQUIRED')
  assert('H1/H7: HIP finding not suppressed by LBP -- hip_safety_status REVIEW_REQUIRED', f.payload.responses.safety_flags.hip?.hip_safety_status === 'REVIEW_REQUIRED')
  assert("H7 CRITICAL: primary_module_detail stays 'LBP' even with HIP-specific safety simultaneously active", f.payload.routing.primary_module_detail === 'LBP')

  const html = renderDoctorView('고관절 통증 주호소 (HIP+LBP 동시 노출)')
  assert('H1/H7 CRITICAL: both 안전 확인 — 허리 and 안전 확인 — 고관절/사타구니 panels render simultaneously', html.includes('안전 확인 — 허리') && html.includes('안전 확인 — 고관절/사타구니'))
}

{
  const f = byName('고관절 통증 주호소 (HIP, Core 전신 응급 동시)')
  assert('Core urgent dominates: general_red alone drives hip_safety_status URGENT_REVIEW via passthrough', f.payload.responses.safety_flags.hip?.hip_safety_status === 'URGENT_REVIEW')
  assert('Core urgent also independently sets requires_staff_check', f.payload.flags.requires_staff_check === true)
}

{
  const f = byName('허리 통증 주호소 (HIP population, LOW_BACK_DOMINANT 제외)')
  assert('H1 CRITICAL: LOW_BACK_DOMINANT -> safety_flags.hip === null (no invented HIP safety)', f.payload.responses.safety_flags.hip === null)
  assert('H1: FROZEN safety_flags.lbp stays non-null/unaffected', f.payload.responses.safety_flags.lbp !== null)
  assert("H7 CRITICAL: primary_module_detail stays 'LBP' (never repurposed for HIP tagging)", f.payload.routing.primary_module_detail === 'LBP')

  const html = renderDoctorView('허리 통증 주호소 (HIP population, LOW_BACK_DOMINANT 제외)')
  assert('H1 CRITICAL: LOW_BACK_DOMINANT fixture does NOT render any HIP safety panel', !html.includes('안전 확인 — 고관절/사타구니'))
  assert('H1: 안전 확인 — 허리 (LBP panel) still renders normally, unaffected', html.includes('안전 확인 — 허리'))
  assert('H1: HIP_00 question text still renders (routing question itself is always shown)', html.includes('허리·골반 부위 중 지금 가장 불편한 곳은 어디에 가깝나요'))
}

{
  const f = byName('고관절 통증 주호소 (HIP, malformed 응답 회귀)')
  assert(
    'H8 CRITICAL: malformed HIP_02 (NONE mixed with an out-of-allowlist value) fails closed, never CLEAR',
    f.payload.responses.safety_flags.hip?.hip_safety_status !== 'CLEAR',
  )
}

{
  // Unrelated patient (non-low_back_pelvis) must never show a HIP panel.
  const html = renderDoctorView('팔꿈치 통증 주호소 (ELBOW, 신속 의뢰 고려)')
  assert('HIP panel does NOT render for an unrelated (ELBOW) patient', !html.includes('안전 확인 — 고관절/사타구니'))
}

/* ---------------------------------------------------------------------
 * Recorder/EMR section only renders in server mode (fixtures mode has no
 * real visit_id to poll recorder-results for) — must not appear/crash here.
 * ------------------------------------------------------------------- */

{
  const html = renderDoctorView('수면 주호소 + 동반 소화/통증')
  assert('fixtures mode: no 진료 녹취·요약 section (no real visit_id to poll)', !html.includes('진료 녹취·요약'))
}

// 명리 핵심요약 compact card: pure re-arrangement of already-computed saju
// fields, no invented 오행/한열조습 interpretation (delta task 3).
{
  const f = byName('여성 수면 주호소 + 갱년기 연동')
  const html = renderDoctorView('여성 수면 주호소 + 갱년기 연동')
  assert('myungri compact card: renders', html.includes('doctor__msSummary--myungri'))
  assert('myungri compact card: shows 명리 핵심 title', html.includes('명리 핵심'))
  assert(
    '오행/한열조습 marked as undetermined, not computed',
    (html.match(/해석 규칙 미확정/g) || []).length >= 2,
  )
  const dayStemPattern = new RegExp(`일간: (<!--\\s*-->)?${f.payload.myungri_calculation.pillars.day.charAt(0)}`)
  assert('day stem shown matches first char of day pillar', dayStemPattern.test(html))

  const partial = byName('체중 관리') // birth time unknown fixture
  const partialHtml = renderDoctorView('체중 관리')
  assert(
    'time-unknown fixture: compact card says 3주 6자 (no fabricated hour pillar)',
    partialHtml.includes('3주 6자')
  )
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
//
// Tablet UX v2.2 §13-19: HERB_*/CONST_* systemic block이 이제
// questionnaireMode==='expanded'|'herbal_addon'일 때만 보이므로(그 외에는
// pruneStaleResponses가 null로 되돌린다), 이 섹션이 "채워진" 케이스를
// 대표하려면 pain_fast인 '수면 주호소 + 동반 소화/통증'(VISIT_01:'symptom')
// 대신 실제로 expanded인 '체질·보약'(VISIT_01:'constitution', CONST_*/
// HERB_* 응답 포함) fixture를 써야 한다.
{
  const html = renderDoctorView('체질·보약')
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

// 13i. 중복 감사(§PART9): "1~3개월"(주호소 duration 답) 텍스트는 정확히 4번 —
//      Doctor View 재설계 v0.2 §4 Patient Header 밴드(신규, 기간·빈도 한 줄),
//      10초 요약 카드, 기존 주호소 섹션, 기존 명리 검토의 "현재 문진 요약" 열.
{
  const html = renderDoctorView('수면 주호소 + 동반 소화/통증')
  const durationLabel = optionLabel('VISIT_03_SYMPTOM_DURATION', '1_3m')
  const count = html.split(durationLabel).length - 1
  assert(
    'duplication audit: duration label renders exactly 4 times (patient header + summary + 주호소 + myungri column)',
    count === 4,
  )
}

/* ---------------------------------------------------------------------
 * 14. ClinicAI 연결점 배지("현재 진료 중으로 표시됨"): fixtures 모드에서는
 *     실제 서버 방문이 없으므로 어떤 fixture를 렌더해도 절대 나타나지
 *     않는다. 서버 모드에서 열린 레코드에 visit_id가 있을 때만 렌더하는
 *     조건은 effect가 실행되지 않는 SSR(renderToString)로는 직접 재현할
 *     수 없으므로(fetch가 필요한 useEffect라 fixtures-only 렌더 경로에는
 *     아예 존재하지 않는다), 소스 코드에 그 조건이 실제로 존재하는지도
 *     같이 확인한다.
 * ------------------------------------------------------------------- */

{
  const BADGE_TEXT = '현재 진료 중으로 표시됨'
  for (const f of DOCTOR_FIXTURES) {
    const html = renderDoctorView(f.name)
    assert(`fixtures mode ("${f.name}"): activation badge never renders`, !html.includes(BADGE_TEXT))
  }

  const doctorViewSrc = await readFile(
    fileURLToPath(new URL('../src/doctor/DoctorView.tsx', import.meta.url)),
    'utf8',
  )
  assert(
    'DoctorView source: activation badge is gated on server mode + selectedRecord.visit_id (not just fixtures)',
    doctorViewSrc.includes("mode === 'server' && selectedRecord?.visit_id") &&
      doctorViewSrc.includes(BADGE_TEXT),
  )
}

{
  const html = renderDoctorView('수면 주호소 + 동반 소화/통증')
  assert('SSR (no localStorage): workstation badge shows "설정 필요", not a stale id', html.includes('워크스테이션 설정 필요'))
  assert('SSR (no localStorage): workstation setup banner renders (localStorage absence handled safely, no throw)', html.includes('워크스테이션 설정 필요'))
}

/* =======================================================================
 * P2 — Doctor View 재설계 v0.2 §11.1: deriveSafetyOverview 단일 출처
 * node 테스트. 각 모듈 URGENT fixture -> 'URGENT', REVIEW/locked ->
 * 'REVIEW', 응답 모순 -> 'REVIEW'.
 * ===================================================================== */

// 15a. 모듈 URGENT(requires_staff_check와 독립) -> overview === 'URGENT'
//      (Opus B1 시나리오: 무릎 패혈성 관절염류 — 여기서는 실제로 존재하는
//      HIP/TMJ URGENT fixture로 재현한다. 둘 다 requires_staff_check는
//      false다 — 모듈 URGENT는 StaffCheck 인터스티셜로만 처리되고
//      persisted 플래그에는 반영되지 않기 때문이다).
{
  const hipUrgent = byName('고관절 통증 주호소 (HIP, 관절 변형 응급)')
  assert('B1 시나리오: HIP URGENT fixture는 requires_staff_check가 false다', hipUrgent.payload.flags.requires_staff_check === false)
  assert(
    "deriveSafetyOverview: 모듈 URGENT(HIP)만 있어도 overview === 'URGENT' (requires_staff_check와 무관, B1 fix)",
    deriveSafetyOverview(hipUrgent.payload) === 'URGENT',
  )

  const tmjUrgent = byName('턱관절 통증 주호소 (TMJ, 턱 고정 비정상 위치 응급)')
  assert('TMJ URGENT fixture는 requires_staff_check가 false다', tmjUrgent.payload.flags.requires_staff_check === false)
  assert("deriveSafetyOverview: 모듈 URGENT(TMJ)만 있어도 overview === 'URGENT'", deriveSafetyOverview(tmjUrgent.payload) === 'URGENT')

  const coreUrgent = byName('고관절 통증 주호소 (HIP, Core 전신 응급 동시)')
  assert(
    "deriveSafetyOverview: requires_staff_check === true 단독으로도 overview === 'URGENT'",
    deriveSafetyOverview(coreUrgent.payload) === 'URGENT',
  )
}

// 15b. 모듈 REVIEW_REQUIRED -> overview === 'REVIEW'
{
  const lbpReview = byName('허리 통증 주호소 (LBP, 확인 필요)')
  assert("deriveSafetyOverview: 모듈 REVIEW_REQUIRED(LBP) -> overview === 'REVIEW'", deriveSafetyOverview(lbpReview.payload) === 'REVIEW')
}

// 15c. CLEAR only -> overview === 'CLEAR' (모든 안전 모듈이 CLEAR고 다른
//      REVIEW/URGENT 사유가 없는 fixture).
{
  const clearFixture = byName('턱관절 통증 주호소 (TMJ, 안전 확인 완료)')
  assert(
    "deriveSafetyOverview: 안전 사유가 전혀 없으면 overview === 'CLEAR'",
    deriveSafetyOverview(clearFixture.payload) === 'CLEAR',
  )
}

// 15d. 응답 모순(response_consistency_review) -> overview === 'REVIEW'.
//      현재 fixtures.ts에 이 플래그를 실제로 세팅하는 fixture가 없으므로
//      (MS_01/임신·폐경 응답을 의도적으로 어긋나게 만들어야 함), selector가
//      순수 함수라는 점을 이용해 실제 fixture 하나를 얕은 복제 후 그 필드
//      하나만 뒤집어 계약(§11.1 "|| flags.response_consistency_review")을
//      직접 검증한다 — 다른 필드는 전부 실제 production payload 그대로다.
{
  const base = byName('수면 주호소 + 동반 소화/통증')
  assert('기저 fixture는 response_consistency_review가 false다', base.payload.flags.response_consistency_review === false)
  assert("기저 fixture 자체는 overview === 'CLEAR'", deriveSafetyOverview(base.payload) === 'CLEAR')
  const withInconsistency = { ...base.payload, flags: { ...base.payload.flags, response_consistency_review: true } }
  assert(
    "deriveSafetyOverview: flags.response_consistency_review === true -> overview === 'REVIEW'",
    deriveSafetyOverview(withInconsistency) === 'REVIEW',
  )
}

/* =======================================================================
 * Doctor View 재설계 v0.2 A6/Opus MAJOR — overview 테스트 커버리지.
 * 15a(HIP/TMJ)/15b(LBP REVIEW)에 이어, 나머지 6개 모듈(LBP/NECK/SHOULDER/
 * KNEE/ELBOW/WRIST_HAND) 각각 실제 concrete urgent 트리거 fixture로
 * URGENT를 확인하고, bumpToReview(치료 lock만으로 REVIEW로 올라가는)
 * 갈래와 sleep_disorder 2갈래를 각각 확인한다.
 * ===================================================================== */

// 15e. 6개 모듈 각각 concrete urgent 트리거 -> overview === 'URGENT'.
{
  const cases = [
    ['허리 통증 주호소 (LBP, CES 응급)', 'LBP'],
    ['목 통증 주호소 (NECK, 신경학적 응급)', 'NECK'],
    ['어깨 통증 주호소 (SHOULDER, 외상 변형 응급)', 'SHOULDER'],
    ['무릎 통증 주호소 (KNEE, 변형 응급)', 'KNEE'],
    ['팔꿈치 통증 주호소 (ELBOW, 변형 응급)', 'ELBOW'],
    ['손목 통증 주호소 (WRIST_HAND, 변형 응급)', 'WRIST_HAND'],
  ]
  for (const [name, label] of cases) {
    const f = byName(name)
    assert(
      `deriveSafetyOverview: ${label} concrete urgent 트리거 -> overview === 'URGENT'`,
      deriveSafetyOverview(f.payload) === 'URGENT',
    )
  }
}

// 15f. bumpToReview 갈래 — disease status는 CLEAR지만 treatment lock만
//      걸린 경우도 overview === 'REVIEW'다(모듈 행 레벨과 동일 규칙을
//      overview에서도 재확인). LBP/NECK 각 1건.
{
  const lbpPregnant = DOCTOR_FIXTURES.find(
    (f) => f.payload.responses.safety_flags.lbp?.lbp_safety_status === 'CLEAR' && f.payload.responses.safety_flags.lbp?.treatment_safety_status === 'REVIEW_REQUIRED',
  )
  assert('bumpToReview 갈래 fixture 존재(LBP: disease CLEAR + treatment REVIEW_REQUIRED)', Boolean(lbpPregnant))
  if (lbpPregnant) {
    assert(
      "deriveSafetyOverview: LBP disease CLEAR + treatment REVIEW_REQUIRED -> overview === 'REVIEW' (bumpToReview)",
      deriveSafetyOverview(lbpPregnant.payload) === 'REVIEW',
    )
  }

  const neckLocked = byName('목 통증 주호소 (NECK, 골다공증 병력 — 치료 안전만 확인 필요)')
  assert(
    'bumpToReview 갈래 fixture(NECK): disease CLEAR + treatment REVIEW_REQUIRED',
    neckLocked.payload.responses.safety_flags.neck?.neck_safety_status === 'CLEAR' &&
      neckLocked.payload.responses.safety_flags.neck?.neck_treatment_safety_status === 'REVIEW_REQUIRED',
  )
  assert(
    "deriveSafetyOverview: NECK disease CLEAR + treatment REVIEW_REQUIRED -> overview === 'REVIEW' (bumpToReview)",
    deriveSafetyOverview(neckLocked.payload) === 'REVIEW',
  )
}

// 15g. sleep_disorder 2갈래(§11.1) 각 1건 -> overview === 'REVIEW'.
{
  const base = byName('수면 주호소 + 동반 소화/통증')
  assert("기저 fixture 자체는 sleep_disorder_review가 false다", base.payload.flags.sleep_disorder_review === false)
  assert("기저 fixture 자체는 sleep_disorder_priority_review가 false다", base.payload.flags.sleep_disorder_priority_review === false)

  const withSleepReview = { ...base.payload, flags: { ...base.payload.flags, sleep_disorder_review: true } }
  assert(
    "deriveSafetyOverview: flags.sleep_disorder_review === true -> overview === 'REVIEW'",
    deriveSafetyOverview(withSleepReview) === 'REVIEW',
  )

  const withSleepPriorityReview = { ...base.payload, flags: { ...base.payload.flags, sleep_disorder_priority_review: true } }
  assert(
    "deriveSafetyOverview: flags.sleep_disorder_priority_review === true -> overview === 'REVIEW'",
    deriveSafetyOverview(withSleepPriorityReview) === 'REVIEW',
  )
}

/* =======================================================================
 * v0.2 A3/Opus MAJOR — 안전 문진 미응답 fail-open 수정: red_flag_general이
 * 전부 null이고 부위별 안전 모듈이 하나도 계산되지 않은 payload는
 * 'CLEAR'가 아니라 'UNKNOWN'이어야 한다("확인한 적 없음" ≠ "확인해서
 * 안전함").
 * ===================================================================== */
{
  const name = '안전 문진 미응답 (레코드 손상/부분 제출 가정)'
  const f = byName(name)
  assert('UNKNOWN fixture: red_flag_general === null', f.payload.responses.safety_flags.red_flag_general === null)
  assert(
    'UNKNOWN fixture: 부위별 안전 모듈이 전부 null(어떤 모듈도 계산되지 않음)',
    ['lbp', 'hip', 'neck', 'shoulder', 'knee', 'elbow', 'wrist_hand', 'ankle_foot', 'tmj'].every(
      (k) => f.payload.responses.safety_flags[k] === null,
    ),
  )
  assert(
    "deriveSafetyOverview: red_flag_general===null && 모듈 전부 null -> overview === 'UNKNOWN' (fail-open 수정)",
    deriveSafetyOverview(f.payload) === 'UNKNOWN',
  )

  const html = renderDoctorView(name)
  assert('UNKNOWN 안전 미응답: 헤더에 "안전 확인됨"이 렌더되지 않는다(fail-open 회귀 가드)', !html.includes('안전 확인됨'))
  assert('UNKNOWN 안전 미응답: 헤더에 중립 "안전정보 없음" pill이 렌더된다', html.includes('안전정보 없음'))
}

/* =======================================================================
 * P2 — 안전 우선 순서(§8.4 방식): 렌더된 HTML 문자열 인덱스로 "안전 블록이
 * 명리보다 항상 앞선다"를 검증한다(13a의 §8.4 등가). DOM 순서 ≠ 시각 순서인
 * 2컬럼 레이아웃에서도 성립해야 하는 불변식(invariant 2)이다.
 * ===================================================================== */

{
  const html = renderDoctorView('허리 통증 주호소 (LBP, 확인 필요)')
  const safetySectionIdx = html.indexOf('doctor__safetySection')
  const myungriIdx = html.indexOf('명리 검토')
  assert('§8.4: 통합 안전 확인 블록 마크업이 명리 검토보다 앞선다', safetySectionIdx !== -1 && myungriIdx !== -1 && safetySectionIdx < myungriIdx)
}

{
  // 헤더 안전 pill(doctor__patientHeader 안)과 P6의 sticky 안전 pill
  // 스트립(§8.3, doctor__patientHeader보다도 먼저 — topbar 바로 다음)
  // 둘 다 좌측 첫 안전 블록(doctor__safetySection)보다 먼저 나온다.
  // 스트립이 patientHeader보다 앞에 오므로 문서 안에서 'doctor__safetyPill'
  // 문자열의 첫 occurrence는 이제 스트립 쪽이다 — patientHeader 안의
  // pill은 patientHeader 열림 태그 뒤에서 다시 찾는다.
  const html = renderDoctorView('허리 통증 주호소 (LBP, 확인 필요)')
  const patientHeaderIdx = html.indexOf('doctor__patientHeader')
  const stripPillIdx = html.indexOf('doctor__safetyPill')
  const headerPillIdx = html.indexOf('doctor__safetyPill', patientHeaderIdx)
  const safetySectionIdx = html.indexOf('doctor__safetySection')
  assert('§8.4: sticky 안전 pill 스트립(§8.3)이 doctor__patientHeader보다 먼저 나온다', stripPillIdx !== -1 && stripPillIdx < patientHeaderIdx)
  assert(
    '§8.4: 헤더 안전 pill이 좌측 통합 안전 블록보다 먼저 나온다',
    headerPillIdx !== -1 && safetySectionIdx !== -1 && headerPillIdx < safetySectionIdx,
  )
  assert('§8.4: 헤더 안전 pill이 doctor__patientHeader 안에 있다', patientHeaderIdx !== -1 && patientHeaderIdx < headerPillIdx)
}

/* =======================================================================
 * P2 — 목록 화면(§8.2) overview 배지 어서션은 tests/server.spec.mjs로
 * 옮긴다(서버 목록 응답이 overview 필드의 유일한 출처이므로).
 * ===================================================================== */

/* =======================================================================
 * P3 — 레일: 오늘 확인 목록(§11.4), 진찰 소견 독립 블록(§11.2), 저장 상태
 * 머신(§11.7, onSave 계약 변경 + 거짓 문구 제거), EMR 시트(§11.5), 진료
 * 완료 버튼(§11.8).
 * ===================================================================== */

const judgmentPanelSrc = await readFile(
  fileURLToPath(new URL('../src/doctor/JudgmentPanel.tsx', import.meta.url)),
  'utf8',
)
const doctorViewFullSrc = await readFile(
  fileURLToPath(new URL('../src/doctor/DoctorView.tsx', import.meta.url)),
  'utf8',
)
const todayChecklistSrc = await readFile(
  fileURLToPath(new URL('../src/doctor/TodayChecklist.tsx', import.meta.url)),
  'utf8',
)

// 16a. §11.7 거짓 문구 제거: "아직 저장되지 않음"은 어디에도 남아있지 않다.
{
  assert(
    'JudgmentPanel.tsx: "아직 저장되지 않음" 거짓 문구가 완전히 제거됨',
    !judgmentPanelSrc.includes('아직 저장되지 않음'),
  )
  assert('DoctorView.tsx: "아직 저장되지 않음" 문구 없음', !doctorViewFullSrc.includes('아직 저장되지 않음'))
}

// 16b. §11.7 onSave 계약: (j) => Promise<SaveResult>로 변경되었고, handleRecord가 await한다.
{
  assert(
    'JudgmentPanel: onSave 시그니처가 Promise<SaveResult>를 반환하도록 선언됨',
    judgmentPanelSrc.includes('onSave?: (judgment: ClinicianJudgment) => Promise<SaveResult>'),
  )
  assert('JudgmentPanel: handleRecord가 onSave를 await한다', judgmentPanelSrc.includes('await onSave(finalized)'))
  assert(
    'JudgmentPanel: 저장 상태 머신 4단계(idle/saving/saved/error)가 정의됨',
    judgmentPanelSrc.includes("phase: 'idle'") &&
      judgmentPanelSrc.includes("phase: 'saving'") &&
      judgmentPanelSrc.includes("phase: 'saved'") &&
      judgmentPanelSrc.includes("phase: 'error'"),
  )
  assert(
    'DoctorView: onSave가 서버 200(result.ok)에서만 { ok: true }를 돌려준다',
    doctorViewFullSrc.includes('return { ok: true }') && doctorViewFullSrc.includes('return { ok: false, error: result.error }'),
  )
}

// 16c. §11.7 Ctrl/Cmd+Enter는 판단 폼(doctor__section--judgment) 내부에만 바인딩되고, 전역(window/document) 바인딩이 없다.
{
  assert(
    'JudgmentPanel: keydown 핸들러가 판단 폼 section에 바인딩됨(전역 아님)',
    judgmentPanelSrc.includes('doctor__section--judgment" onKeyDown={handleFormKeyDown}'),
  )
  assert(
    'JudgmentPanel: window/document에 전역 키 바인딩을 추가하지 않는다',
    !judgmentPanelSrc.includes('window.addEventListener') && !judgmentPanelSrc.includes('document.addEventListener'),
  )
  assert(
    'JudgmentPanel: Ctrl/Cmd+Enter 판정 로직 존재',
    judgmentPanelSrc.includes("e.key === 'Enter'") && judgmentPanelSrc.includes('e.metaKey || e.ctrlKey'),
  )
}

// 16d. fixtures 미리보기: 저장 상태 머신 대신 상주 배지가 모든 fixture에서 항상 보인다.
{
  for (const f of DOCTOR_FIXTURES) {
    const html = renderDoctorView(f.name)
    assert(`fixtures 미리보기("${f.name}"): "미리보기 — 저장되지 않음" 상주 배지 렌더`, html.includes('미리보기 — 저장되지 않음'))
  }
}

// 16e. 진찰 소견은 JudgmentPanel 안에서 "원장 판단 기록"과 분리된 독립 <section>이다.
{
  const html = renderDoctorView('허리 통증 주호소 (LBP, 확인 필요)')
  const examIdx = html.indexOf('진찰 소견')
  // "원장 판단 기록"이라는 문구는 명리 검토 섹션의 안내문("아래 원장 판단
  // 기록에 원장이 직접 기록합니다")에도 인용구로 등장한다 — 실제 heading은
  // <h2>원장 판단 기록</h2> 태그로만 잡는다.
  const judgmentHeadingIdx = html.indexOf('<h2>원장 판단 기록</h2>')
  assert('LBP fixture: "진찰 소견" 블록 렌더', examIdx !== -1)
  assert('LBP fixture: "진찰 소견"이 "원장 판단 기록"보다 먼저 온다(독립 블록, 판단 폼 앞)', examIdx < judgmentHeadingIdx)
  const examSectionOpen = html.lastIndexOf('<section', examIdx)
  const judgmentSectionOpen = html.lastIndexOf('<section', judgmentHeadingIdx)
  assert(
    'LBP fixture: 진찰 소견과 원장 판단 기록이 서로 다른 <section> 태그 안에 있다(같은 section이 아님)',
    examSectionOpen !== judgmentSectionOpen,
  )
  assert('LBP fixture: 객관적 하지 근력저하 소견 컨트롤이 진찰 소견 블록 안에 있다', html.indexOf('객관적 하지 근력저하') > examIdx)
}

// 16f. 오늘 확인 목록(§11.4): 권장 검사가 있는 fixture는 항목이 렌더되고,
//      아무 것도 없는 fixture는 블록 자체가 렌더되지 않는다(빈 블록 금지).
{
  const html = renderDoctorView('허리 통증 주호소 (LBP, 확인 필요)')
  assert('LBP fixture: "오늘 확인" 블록 렌더', html.includes('>오늘 확인<'))
  assert('LBP fixture: 권장 검사 항목(하지 근절(myotome) 근력 검사) 체크리스트에 렌더', html.includes('하지 근절(myotome) 근력 검사'))
  assert('LBP fixture(fixtures 모드): 체크박스가 disabled', /doctor__checklist[\s\S]*?<input[^>]*type="checkbox"[^>]*disabled/.test(html))
  assert('LBP fixture(fixtures 모드): "진행 메모" 카운터는 렌더되지 않음(체크 불가 상태에서 무의미)', !html.includes('진행 메모'))

  const emptyHtml = renderDoctorView('수면 주호소 + 동반 소화/통증')
  assert(
    '권장 검사/미확인 항목이 전혀 없는 fixture: "오늘 확인" 블록 자체가 렌더되지 않는다',
    !emptyHtml.includes('>오늘 확인<'),
  )
}

// 16g. invariant 5: TodayChecklist는 안전 계산 경로(selector)를 절대 쓰지 않는다 — 소스 레벨 회귀 가드.
{
  assert(
    'TodayChecklist.tsx: deriveSafetyOverview를 호출하지 않는다(체크 상태가 안전 pill에 영향 주면 안 됨)',
    !todayChecklistSrc.includes('deriveSafetyOverview('),
  )
  assert(
    'TodayChecklist.tsx: computeSafetyModuleRows를 직접 계산하지 않는다(props로 받은 rows만 읽는다)',
    !todayChecklistSrc.includes('computeSafetyModuleRows('),
  )
}

// 16h. EMR 요약 열기 버튼/진료 완료 버튼은 fixtures 모드에서 절대 렌더되지 않는다.
{
  for (const f of DOCTOR_FIXTURES) {
    const html = renderDoctorView(f.name)
    assert(`fixtures 모드("${f.name}"): "EMR 요약 열기" 버튼 미렌더`, !html.includes('EMR 요약 열기'))
    assert(`fixtures 모드("${f.name}"): "진료 완료" 버튼 미렌더`, !html.includes('>진료 완료<'))
  }
}

// 16i. §11.5 EMR 시트 자동 덮어쓰기 금지 계약이 소스에 존재한다(편집 중이면 pending으로 보류).
{
  assert(
    'DoctorView: emrEdited가 true면 자동 교체 대신 pendingEmrText로 보류한다',
    doctorViewFullSrc.includes('if (emrEdited) {') && doctorViewFullSrc.includes('setPendingEmrText(nextText)'),
  )
  assert(
    'EmrSheet.tsx: pendingNewSummary 스트립에 "내 편집 유지"/"새 요약으로 교체" 두 액션이 있다',
    (await readFile(fileURLToPath(new URL('../src/doctor/EmrSheet.tsx', import.meta.url)), 'utf8')).includes(
      '내 편집 유지',
    ),
  )
}

/* =======================================================================
 * P4 — 문진 핵심(§4 Level2): 유의미 응답 우선 + 원시 응답 전체 펼치기.
 * ===================================================================== */

// 17a. LBP fixture: 상세 증상(문진 핵심) 섹션이 "원시 응답 전체 보기" 펼치기를 갖고,
//      그 안에 전체 필드가 원래 순서 그대로 다시 렌더된다(데이터 손실 없음, 의도된 중복).
{
  const html = renderDoctorView('허리 통증 주호소 (LBP, 확인 필요)')
  assert('LBP fixture: "문진 핵심" 섹션 제목 렌더', html.includes('문진 핵심'))
  assert('LBP fixture: "원시 응답 전체 보기" 펼치기 렌더', html.includes('원시 응답 전체 보기'))

  // 새 DOM 기준 중복 감사(13i 등가): LBP_01 질문 문구는 "문진 핵심"(유의미
  // 응답 우선 그룹)과 "원시 응답 전체 보기"(원본 순서) 양쪽에 정확히 한 번씩,
  // 총 2번 나온다 — 의도된 중복이며 그 이상/이하는 회귀다. (문구 자체는 2c의
  // "LBP fixture: LBP_01 question text renders" 어서션과 같은 리터럴이다.)
  const lbp01Question = '허리 통증이나 불편감이 가장 멀리'
  const count = html.split(lbp01Question).length - 1
  assert('중복 감사(새 DOM 기준): LBP_01 질문 문구는 정확히 2번(문진 핵심 + 원시 전체 보기)', count === 2)
}

// 17b. "문진 핵심"의 양성/구체 응답은 Body-strong(doctorField__value--strong) 클래스를 갖는다.
{
  const html = renderDoctorView('허리 통증 주호소 (LBP, 확인 필요)')
  assert('LBP fixture: doctorField__value--strong 클래스가 렌더됨(양성 응답 강조)', html.includes('doctorField__value--strong'))
}

// 17c. "추가 상세상담" 블록도 같은 규칙(문진 핵심과 동일 §4 Level2)을 따른다 —
//      원시 응답 전체 보기 펼치기가 그 블록 안에도 존재한다.
{
  const html = renderDoctorView('허리 통증 주호소 + 추가 상세상담(수면) + 참고 증상(소화·기타)')
  const additionalIdx = html.indexOf('추가 상세상담')
  const rawToggleIdx = html.indexOf('원시 응답 전체 보기', additionalIdx)
  assert('v2.1 fixture: 추가 상세상담 블록 안에도 "원시 응답 전체 보기" 펼치기가 있다', rawToggleIdx !== -1)
}

// 17d. "안 물어봄 = 미렌더" 규칙은 그대로다 — P4 재정렬이 primaryModuleFields가
//      아예 반환하지 않는 다른 모듈의 질문 문구를 새로 렌더하기 시작하지
//      않았는지 확인한다(예: Sleep 주호소 fixture에는 LBP 전용 질문이 전혀
//      없어야 한다 — "원시 응답 전체 보기"가 생겼다고 안 물어본 질문까지
//      끌어오면 안 된다).
{
  const html = renderDoctorView('수면 주호소 + 동반 소화/통증')
  assert(
    'Sleep 주호소 fixture: LBP 전용 질문 문구(LBP_01)는 어디에도 렌더되지 않는다(안 물어봄 = 미렌더 유지)',
    !html.includes('허리 통증이나 불편감이 가장 멀리'),
  )
}

/* =========================================================================
 * P5 — 참고 접기: 명리 compact + 3열 감사 뷰 통합, 방어 문구 보존.
 * ===================================================================== */

// 18a. 명리 compact 카드 + "▸ 상세 감사 뷰" 펼치기가 하나의 섹션 안에
//      공존한다 — MyungriCompactCard(방어 문구 포함)와 3열 감사 뷰가
//      더 이상 별도 섹션 2개로 이중화되어 있지 않다.
{
  const html = renderDoctorView('허리 통증 주호소 (LBP, 확인 필요)')
  const myungriSectionIdx = html.indexOf('doctor__section--myungri')
  assert('명리 검토 섹션(doctor__section--myungri) 렌더', myungriSectionIdx !== -1)
  const compactIdx = html.indexOf('doctor__msSummary--myungri', myungriSectionIdx)
  const auditIdx = html.indexOf('doctor__myungriAudit', myungriSectionIdx)
  assert('P5: compact 카드(doctor__msSummary--myungri)가 명리 검토 섹션 안에 있다', compactIdx !== -1 && compactIdx > myungriSectionIdx)
  assert('P5: "▸ 상세 감사 뷰" 펼치기(doctor__myungriAudit)가 같은 섹션 안에 있다', auditIdx !== -1 && auditIdx > myungriSectionIdx)
  assert('P5: compact 카드가 감사 뷰 펼치기보다 먼저 나온다(요약 먼저, 상세는 펼쳐서)', compactIdx < auditIdx)
  assert('P5: "▸ 상세 감사 뷰" summary 문구 렌더', html.includes('▸ 상세 감사 뷰'))
  // 방어 문구 보존(Opus N11) — MyungriCompactCard가 이미 담당하므로 그대로 유지되는지 확인.
  assert('P5: "오행 분포: 해석 규칙 미확정" 방어 문구 보존', html.includes('오행 분포: 해석 규칙 미확정'))
  assert('P5: "한열조습: 해석 규칙 미확정" 방어 문구 보존', html.includes('한열조습: 해석 규칙 미확정'))
  assert('P5: "계산 완료 ≠ 임상 해석 완료" 방어 문구 보존(3열 감사 뷰 안)', html.includes('계산 완료 ≠'))
  // 감사 뷰 폴드 안에 3열 그리드(judgment__reviewGrid)가 그대로 있다 —
  // 콘텐츠 자체는 삭제가 아니라 이동임을 확인.
  const reviewGridIdx = html.indexOf('judgment__reviewGrid', myungriSectionIdx)
  assert('P5: 3열 감사 뷰(judgment__reviewGrid)가 doctor__myungriAudit 펼치기 안에 있다', reviewGridIdx !== -1 && reviewGridIdx > auditIdx)
}

// 18b. 정책 대기 amber 경고 문구는 펼치기 여부와 무관하게 항상 보인다 —
//      doctor__myungriAudit(감사 뷰) 밖, 명리 검토 섹션 최상위에 위치.
{
  const pendingFixture = DOCTOR_FIXTURES.find((f) => f.payload.myungri_calculation.policy.pending_approval.length > 0)
  assert('정책 대기(pending_approval) fixture가 존재한다', Boolean(pendingFixture))
  if (pendingFixture) {
    const html = renderDoctorView(pendingFixture.name)
    const auditIdx = html.indexOf('doctor__myungriAudit')
    const pendingIdx = html.indexOf('doctor__warning--pending')
    assert('P5: 정책 대기 amber 경고(doctor__warning--pending) 렌더', pendingIdx !== -1)
    assert('P5: 정책 대기 경고가 "▸ 상세 감사 뷰" 펼치기보다 먼저(밖에) 나온다 — 접혀 있어도 항상 보임', auditIdx !== -1 && pendingIdx < auditIdx)
  }
}

// 18c. 전신·한약 참고: 기존 preview+details 패턴 유지 + Level 4 "참고"
//      그룹(명리 검토 바로 앞)으로 이동 — 더 이상 "문진 핵심" 바로
//      아래(Level 2 한복판)에 있지 않다.
{
  const html = renderDoctorView('체질·보약')
  const constDetailsIdx = html.indexOf('doctor__constDetails')
  const myungriSectionIdx = html.indexOf('doctor__section--myungri')
  const primaryModuleIdx = html.indexOf('문진 핵심')
  assert('전신·한약 참고(doctor__constDetails) 렌더', constDetailsIdx !== -1)
  assert('P5: 전신·한약 참고가 문진 핵심보다 뒤에 있다(Level 2 한복판에서 이동)', constDetailsIdx > primaryModuleIdx)
  assert('P5: 전신·한약 참고가 명리 검토 섹션 바로 앞(Level 4 참고 그룹)에 있다', constDetailsIdx !== -1 && myungriSectionIdx !== -1 && constDetailsIdx < myungriSectionIdx)
}

// 18d. §8.4 순서 불변식은 P5 이후에도 유지된다 — 안전 블록이 명리보다
//      여전히 앞선다(위 §8.4 테스트와 별개로, 이동한 전신·한약 참고까지
//      포함한 전체 재확인).
{
  // 전신·한약 참고는 값이 없으면 doctor__constDetails(<details>) 자체를
  // 만들지 않으므로(§3 "빈 값은 줄을 만들지 않는다"), 이 순서 확인은
  // 항상 렌더되는 "전신·한약 참고" 제목 텍스트로 한다.
  const html = renderDoctorView('허리 통증 주호소 (LBP, 확인 필요)')
  const safetySectionIdx = html.indexOf('doctor__safetySection')
  const constitutionHeadingIdx = html.indexOf('전신·한약 참고')
  const myungriSectionIdx = html.indexOf('doctor__section--myungri')
  assert('P5 이후에도 안전 블록이 전신·한약 참고보다 앞선다', safetySectionIdx !== -1 && constitutionHeadingIdx !== -1 && safetySectionIdx < constitutionHeadingIdx)
  assert('P5 이후에도 안전 블록이 명리 검토보다 앞선다', safetySectionIdx < myungriSectionIdx)
}

/* =========================================================================
 * P6 — 반응형(§8.3/§10): sticky 안전 pill 스트립 + bottom sheet 판단
 * 입력 + 48px 터치 타겟(CSS 존재 확인). 실제 뷰포트 전환은 브라우저가
 * 필요하므로 SSR로는 "요소가 렌더되는지/CSS가 존재하는지"만 검증한다.
 * ===================================================================== */

const doctorCssSrc = await readFile(fileURLToPath(new URL('../src/doctor/doctor.css', import.meta.url)), 'utf8')

// 19a. sticky 안전 pill 스트립: patientHeader보다 먼저 렌더되고, overview
//      상태를 반영한다(§8.3 와이어프레임: Top bar -> pill 스트립 ->
//      Patient Header).
{
  const html = renderDoctorView('허리 통증 주호소 (LBP, 확인 필요)')
  const stripIdx = html.indexOf('doctor__safetyPillStrip')
  const patientHeaderIdx = html.indexOf('doctor__patientHeader')
  assert('P6: sticky 안전 pill 스트립(doctor__safetyPillStrip) 렌더', stripIdx !== -1)
  assert('P6: pill 스트립이 patientHeader보다 먼저 나온다', stripIdx < patientHeaderIdx)
  assert('P6: pill 스트립 안에 확인 필요 pill이 있다(LBP REVIEW fixture)', html.indexOf('확인 필요', stripIdx) !== -1 && html.indexOf('확인 필요', stripIdx) < patientHeaderIdx)
}

// 19b. bottom sheet 진입점: "판단 입력" primary 버튼 + 레일 시트 헤더(닫기
//      버튼 포함)가 렌더된다. EMR·진료 완료는 여전히 레일(=시트) 안에
//      상주하므로(§8.3 "sheet 하단 보조 버튼") 별도 이동 없이 같은 DOM을
//      재사용한다.
{
  const html = renderDoctorView('허리 통증 주호소 (LBP, 확인 필요)')
  assert('P6: 하단 고정 "판단 입력" primary 버튼 렌더', html.includes('doctor__bottomBar__primary') && html.includes('판단 입력'))
  assert('P6: 레일 시트 헤더("판단 입력" 타이틀 + 닫기 버튼) 렌더', html.includes('doctor__railSheetHeader') && html.includes('doctor__railSheetCloseBtn'))
  // 시트가 처음부터 열려 있으면 안 된다(judgmentSheetOpen 초기값 false) — backdrop이 기본 렌더되지 않는다.
  assert('P6: 초기 렌더에서 backdrop(doctor__railSheetBackdrop)이 렌더되지 않는다(시트 기본 닫힘)', !html.includes('doctor__railSheetBackdrop'))
  assert('P6: 레일에 --sheetOpen modifier가 기본으로 붙지 않는다(닫힌 상태 기본값)', !html.includes('doctor__rail--sheetOpen'))
}

// 19c. 대응 콘텐츠 없으면 하단 버튼 미렌더 원칙은 EMR/오늘 확인에만
//      적용된다(§11.4/§11.5) — "판단 입력" 버튼은 판단 폼이 항상
//      존재하므로 showingRecord인 모든 fixture에서 항상 렌더된다.
{
  for (const f of DOCTOR_FIXTURES) {
    const html = renderDoctorView(f.name)
    assert(`fixtures 모드("${f.name}"): "판단 입력" 하단 버튼 항상 렌더(판단 폼은 절대 비지 않음)`, html.includes('doctor__bottomBar__primary'))
  }
}

// 19d. 48px 터치 타겟 + 8px 항목 간 CSS가 1024–1279 구간에 한정되어
//      존재한다(소스 레벨 확인 — 실제 계산된 스타일은 브라우저가 필요).
{
  const tabletTierMatch = doctorCssSrc.match(/@media \(min-width: 1024px\) and \(max-width: 1279px\) \{([\s\S]*?)\n\}/)
  assert('doctor.css: 1024–1279 구간 한정 미디어쿼리 존재', Boolean(tabletTierMatch))
  assert('doctor.css: 해당 구간에 min-width/min-height: 48px 터치 타겟 규칙 존재', tabletTierMatch !== null && /min-width:\s*48px/.test(tabletTierMatch[1]) && /min-height:\s*48px/.test(tabletTierMatch[1]))
  assert('doctor.css: 해당 구간에 8px 항목 간격(gap) 규칙 존재', tabletTierMatch !== null && /gap:\s*8px/.test(tabletTierMatch[1]))
}

// 19e. 컬럼별 독립 overflow 금지 + html.doctor-mode 전역 규칙 무변경
//      (invariant 11) — P6가 추가한 bottom sheet/backdrop은 고정
//      오버레이 chrome이지 `.doctor__mainCol`의 컬럼이 아니므로, 그
//      컬럼 자체에는 여전히 overflow 선언이 없어야 한다.
{
  const mainColBlock = doctorCssSrc.match(/\.doctor__mainCol\s*\{([^}]*)\}/)
  assert('doctor.css: .doctor__mainCol 규칙 존재', Boolean(mainColBlock))
  assert('doctor.css: .doctor__mainCol에 overflow(auto/scroll) 선언이 없다(invariant 11)', mainColBlock !== null && !/overflow\s*:\s*(auto|scroll)/.test(mainColBlock[1]))
}

/* =========================================================================
 * P7 — 상태·마감: 스켈레톤(스피너 금지), 서버 오류 amber 스트립(다시
 * 시도 + 예시 데이터로 보기), auth 오류 DoctorTokenSetup(이미 목록 화면
 * 상단), viewport-budget은 tests/doctor-viewport-budget.spec.mjs로 분리.
 * ===================================================================== */

// 20a. 스켈레톤 컴포넌트가 소스에 존재하고, 스피너(doctor__spinner)를
//      쓰지 않는다. listLoading/record-loading은 서버 모드 async 상태라
//      SSR fixtures 렌더로는 재현되지 않으므로(§11.6 표 — "로딩" 행 자체가
//      서버 모드 전용) 소스 레벨로 확인한다.
{
  assert('DoctorView.tsx: ListSkeleton 컴포넌트 정의됨(목록 스켈레톤, 행 3개)', doctorViewFullSrc.includes('function ListSkeleton()'))
  assert('DoctorView.tsx: ListRowSkeleton이 3번 렌더된다(행 3개)', (doctorViewFullSrc.match(/<ListRowSkeleton \/>/g) || []).length === 3)
  assert('DoctorView.tsx: DetailSkeleton 컴포넌트 정의됨(상세 스켈레톤, 헤더+안전+레일)', doctorViewFullSrc.includes('function DetailSkeleton()'))
  assert(
    'DoctorView.tsx: 목록 로딩 시 스피너 텍스트("불러오는 중…") 대신 ListSkeleton을 쓴다',
    doctorViewFullSrc.includes('<ListSkeleton />') && !doctorViewFullSrc.includes('>불러오는 중…</p>'),
  )
  assert('DoctorView.tsx: 스켈레톤 렌더 경로에 doctor__spinner(스피너) 클래스를 쓰지 않는다', !/function (List|Detail)(Row)?Skeleton[\s\S]*?doctor__spinner/.test(doctorViewFullSrc))
}

// 20b. 서버 오류 amber 스트립: doctor__banner--warning(red 아님) +
//      "다시 시도" + "예시 데이터로 보기" 인라인 액션(fixtures 전환).
{
  assert('DoctorView.tsx: 서버 오류 배너가 doctor__banner--warning(amber)을 쓴다 — 임상 URGENT(red)와 구분', doctorViewFullSrc.includes('doctor__banner doctor__banner--warning'))
  assert('DoctorView.tsx: 서버 오류 배너에 "다시 시도" 버튼 존재', doctorViewFullSrc.includes('다시 시도'))
  assert('DoctorView.tsx: 서버 오류 배너에 "예시 데이터로 보기" 인라인 액션 존재', doctorViewFullSrc.includes('예시 데이터로 보기'))
  {
    // "예시 데이터로 보기"는 위 주석 설명(§3 인용)과 실제 버튼 라벨 둘 다에
    // 등장한다 — 버튼 라벨(마지막 occurrence)을 기준으로 확인한다.
    const previewLabelIdx = doctorViewFullSrc.lastIndexOf('예시 데이터로 보기')
    const setModeIdx = doctorViewFullSrc.lastIndexOf("setMode('fixtures')", previewLabelIdx)
    assert(
      "DoctorView.tsx: \"예시 데이터로 보기\" 버튼 바로 앞(같은 button 블록)에서 setMode('fixtures')를 호출한다",
      previewLabelIdx !== -1 && setModeIdx !== -1 && previewLabelIdx - setModeIdx < 300,
    )
  }
}

// 20c. auth 오류 → 목록 화면 상단 DoctorTokenSetup — 이미 그렇다(§11.6
//      확인만). 레일이 없는 시점(목록 화면)에 카드가 뜬다는 계약을
//      소스 레벨로 재확인한다.
{
  const authBannerIdx = doctorViewFullSrc.indexOf("serverError?.kind === 'auth'")
  assert('DoctorView.tsx: auth 오류 분기 존재', authBannerIdx !== -1)
  const doctorTokenSetupIdx = doctorViewFullSrc.indexOf('<DoctorTokenSetup', authBannerIdx)
  assert('DoctorView.tsx: auth 오류 시 DoctorTokenSetup 카드를 렌더한다', doctorTokenSetupIdx !== -1 && doctorTokenSetupIdx - authBannerIdx < 200)
  // "레일 아님" — DoctorTokenSetup 렌더 지점이 doctor__pageSection 안(목록 화면 상단)에 있고, aside(레일) 밖이다.
  const railOpenIdx = doctorViewFullSrc.indexOf('<aside className={`doctor__rail')
  assert('DoctorView.tsx: DoctorTokenSetup은 레일(aside) 이전(목록 화면 상단)에 렌더된다 — 레일 아님', railOpenIdx !== -1 && doctorTokenSetupIdx < railOpenIdx)
}

console.log(`\n${passCount} assertions passed, 0 failed (total ${passCount})`)
