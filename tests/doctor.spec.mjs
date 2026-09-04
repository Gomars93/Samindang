// Doctor-view fixture + label-resolution suite.
// Run via `npm run test:doctor` (bundles src/doctor/fixtures.ts and
// src/doctor/labels.ts with esbuild first, same style as the other suites).
// Plain node, no test framework: assert() prints "OK: <name>" and throws on failure.

import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { DOCTOR_FIXTURES } from './.doctor-fixtures-bundle.mjs'
import { optionLabel, optionLabels } from './.doctor-labels-bundle.mjs'
import {
  createEmptyJudgment,
  validateJudgment,
  finalizeJudgment,
  DEBRIEF_QUESTIONS,
} from './.doctor-judgment-bundle.mjs'
import { DOCTOR_SECTION_ORDER } from './.doctor-sectionorder-bundle.mjs'
import {
  DoctorView,
  isDoctorPayloadShapeUsable,
  recordToPayload,
  DoctorRecordFallback,
  frequencyField,
  aggravatingField,
  primaryModuleFields,
  LbpSafetyPanel,
  NeckSafetyPanel,
  ShoulderSafetyPanel,
  KneeSafetyPanel,
  isUnreadableReproductiveDerived,
  MyungriCompactCard,
  sajuStatusLine,
} from './.doctor-view-bundle.cjs'

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
  assert(
    'v2.1 fixture: Core Reduction P4 — the 동반문제 legacy section does not render at all when there is no legacy SECONDARY_01 data (동반문제 legacy는 데이터 있을 때만)',
    !html.includes('<h2>동반문제</h2>'),
  )
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
  assert(
    'KNEE fixture: renders DVT 평가 필요 chip with 아니요 (K5 de-escalation)',
    /DVT 평가 필요<\/strong> (?:<!-- -->)?아니요/.test(html),
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
  assert('ELBOW fixture: renders 신경학적 평가 필요 chip with 아니요 (E5 de-escalation)', /신경학적 평가 필요<\/strong> (?:<!-- -->)?아니요/.test(html))
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
  assert('WRIST_HAND fixture: renders 신경학적 평가 필요 chip with 아니요 (stable sensory-only)', /신경학적 평가 필요<\/strong> (?:<!-- -->)?아니요/.test(html))
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
//
// Batch 4.1-B (§16.3/§15.4/§15.5): MyungriCompactCard has zero production
// render sites in DoctorView.tsx as of this batch (its accordion was
// removed entirely -- PO decision, separate 명리 program used instead).
// It is deliberately KEPT (not deleted) as a read-only display helper that
// hardened real crashes (12차/13차 독립 리뷰), so this test now renders it
// DIRECTLY (renderToString(React.createElement(MyungriCompactCard, ...)))
// instead of through the full DoctorView page -- same behavioral coverage,
// decoupled from whether anything currently calls it in production.
{
  const f = byName('여성 수면 주호소 + 갱년기 연동')
  const html = renderToString(React.createElement(MyungriCompactCard, { saju: f.payload.myungri_calculation }))
  assert('myungri compact card: renders', html.includes('doctor__msSummary--myungri'))
  assert('myungri compact card: shows 명리 핵심 title', html.includes('명리 핵심'))
  assert(
    '오행/한열조습 marked as undetermined, not computed',
    (html.match(/해석 규칙 미확정/g) || []).length >= 2,
  )
  const dayStemPattern = new RegExp(`일간: (<!--\\s*-->)?${f.payload.myungri_calculation.pillars.day.charAt(0)}`)
  assert('day stem shown matches first char of day pillar', dayStemPattern.test(html))

  const partial = byName('체중 관리') // birth time unknown fixture
  const partialHtml = renderToString(React.createElement(MyungriCompactCard, { saju: partial.payload.myungri_calculation }))
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

  /*
   * 10차 독립 리뷰 HIGH-1/HIGH-2/MEDIUM-2: AnswerValue의 타입
   * (string|number|string[]|null)은 검증되지 않은 저장 JSON에서 온
   * 값이므로 레거시/손상 데이터는 이를 지키지 않을 수 있다 -- 이전
   * 구현은 무조건 String(value)로 바꿔 "[object Object]"를 그대로
   * 반환했고, 이게 EMR 미리보기(실제 의무기록 붙여넣기 텍스트)/환자
   * 전달용 치료 계획/CommonSafetyBanner의 공통 위험 신호 배너까지
   * 흘러들어갔다(실제 라이브 리프로로 확인됨). string|number가 아니면
   * 원문을 지어내지 않고 명시적 실패 토큰을 반환해야 한다.
   */
  assert(
    'optionLabel never String()-coerces a wrong-typed (object) value into "[object Object]" (10th independent review HIGH-1/HIGH-2/MEDIUM-2)',
    optionLabel('SAFETY_01', { corrupted: true }) !== '[object Object]' &&
      !optionLabel('SAFETY_01', { corrupted: true }).includes('object Object'),
  )
  assert(
    'optionLabel returns an explicit fail-closed token for a wrong-typed value, not a fabricated label',
    optionLabel('SAFETY_01', { corrupted: true }).includes('확인 필요'),
  )
  assert(
    'optionLabels never leaks "[object Object]" for a wrong-typed array element',
    !optionLabels('SAFETY_01', [{ corrupted: true }]).join(',').includes('object Object'),
  )
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

// 13a. PR #24 Doctor Clinical Workspace shell: Common Safety renders before
//      the workspace hero, and the hero renders before the first regular
//      section (환자 기본). '수면 주호소 + 동반 소화/통증'은 pain 모듈을
//      전혀 열지 않으므로(primaryConcernKey==='sleep') herbal 프로필로
//      라우팅된다 -- 이 fixture로 herbal hero의 순서를 검증한다.
{
  const html = renderDoctorView('수면 주호소 + 동반 소화/통증')
  const commonSafetyIdx = html.indexOf('doctor__commonSafety')
  const heroIdx = html.indexOf('workspace__hero')
  const firstSectionIdx = html.indexOf('환자 기본')
  assert('workspace: Common Safety block present', commonSafetyIdx !== -1)
  assert('workspace: hero block present', heroIdx !== -1)
  assert('workspace: Common Safety renders before the hero', commonSafetyIdx < heroIdx)
  assert('workspace: hero renders before the first regular section (환자 기본)', heroIdx < firstSectionIdx)
  assert('workspace: herbal hero shows 상담 목적', html.includes('상담 목적'))
  assert('workspace: herbal hero shows 안전이슈 indicator', html.includes('안전이슈'))
}

// 13b. requires_staff_check 픽스처: Common Safety(위험 배너 + 안전정보
//      한눈에)가 워크스페이스 hero보다 먼저 나온다 -- PR #24 Phase 2
//      invariant("Common Safety는 절대 탭/hero 뒤에 숨지 않는다")가 실제
//      렌더 순서로 지켜지는지 확인한다.
{
  const html = renderDoctorView('안전 확인 필요')
  // 픽스처 선택 드롭다운에도 "안전 확인 필요"라는 fixture 이름이 나오므로,
  // 배너 본문에만 있는 고유 문구로 위치를 잡는다.
  const bannerIdx = html.indexOf('환자가 아래 내용을 문진에서 보고했습니다')
  const heroIdx = html.indexOf('workspace__hero')
  assert('safety fixture: detailed danger banner present', bannerIdx !== -1)
  assert('safety fixture: danger banner renders before the hero', bannerIdx !== -1 && bannerIdx < heroIdx)
  assert('safety fixture: 안전정보 한눈에 renders at least one item', html.includes('doctor__safetyChip'))
}

// 13c. 안전 이슈 없는 픽스처: danger 배너 클래스가 전혀 없고, hero의
//      안전이슈 표시가 "없음"(문진에서 SAFETY_01에 답은 했지만 위험신호
//      없음)으로 나온다.
{
  const html = renderDoctorView('수면 주호소 + 동반 소화/통증')
  assert('benign fixture: no doctor__banner--danger anywhere', !html.includes('doctor__banner--danger'))
  assert('benign fixture: hero 안전이슈 present', html.includes('안전이슈'))
  const safetyIdx = html.indexOf('안전이슈')
  const nearby = html.slice(safetyIdx, safetyIdx + 200)
  assert('benign fixture: nearby hero 안전이슈 value says 없음', nearby.includes('없음'))
}

// 13d. status === 'partial' 픽스처 (Batch 4.1-B 갱신, T6 companion): the
//      명리 accordion (and its summary card copy) is gone from the full
//      page entirely now -- its own status-line rendering is covered
//      directly by the "명리 핵심요약 compact card" unit test above
//      (renders MyungriCompactCard itself). What THIS test now pins is the
//      negative: the removed status text does not leak anywhere onto the
//      full page for a non-pain profile, same guarantee T6 makes for the
//      other removed strings.
{
  const f = byName('체중 관리')
  assert('weight fixture: myungri status is partial', f.payload.myungri_calculation.status === 'partial')
  const html = renderDoctorView('체중 관리')
  assert('T6 companion: partial-status summary text (부분 계산) no longer renders anywhere on the full page (명리 아코디언 제거)', !html.includes('부분 계산'))
}

// 13e. pending_approval 픽스처 (Batch 4.1-B 갱신, T6 companion): this
// doctor-facing "주의: 야자시/조자시..." warning lived ONLY inside the
// removed "명리 검토" reviewGrid's 계산된 사실 column (§15.4's own table:
// "계산주의(정책 승인 대기) ... 제거. 원본 JSON에 남음") -- it is gone from
// the rendered page entirely now, same as the rest of that grid. The
// underlying pending-approval data is untouched and still reaches
// `원본 JSON` (payload.myungri_calculation.policy.pending_approval) and
// JudgmentPanel's source (myungri_pending_approval) unchanged.
{
  const html = renderDoctorView('안전 확인 필요')
  assert('T6 companion: the removed pending-approval warning text no longer renders anywhere', !html.includes('정책이 아직 확정되지 않아'))
  assert('T6 companion: doctor__warning--pending class no longer renders anywhere', !html.includes('doctor__warning--pending'))
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

// 13h. Batch 4.1-A §15.2/§15.7 (T1/T2 against the full rendered DoctorView,
// complementing the bundle-text T1/T2 in doctor-reset-key.spec.mjs): the
// "사주 예상 → 수정 판단 → 치료축·처방 방향" collapsed input block
// (judgment__secondaryFields) and its 4 labeled fields are gone from the
// rendered output entirely.
//
// Batch 4.1-C (§16.1/§16.2): 핵심 선천 특징/현재 증상과 연결되는 핵심 (the
// two fields 4.1-A deliberately left alone) and the "설명 개요" disclosure
// that read them back are now ALSO gone -- T13/T14 here are the
// full-rendered-page complement of doctor-reset-key.spec.mjs's bundle-text
// T13/T14.
//
// Batch 4.1-D (§17.1/§17.2/§17.5): T23 used to pin the OPPOSITE side
// (CLAUDE.md's "표 규칙") -- what JudgmentPanel still had after 4.1-A/4.1-C
// must keep rendering (1분 디브리핑, 학습 케이스, the "기록" button). §17.0
// found that "still has" list was itself the problem: 1분 디브리핑's own 4
// questions are all 사주 questions, content-identical to what 4.1-A had
// already removed -- so T23, as written, was actively pinning the exact
// leak §17 exists to close. §17.5 requires REVERSING T23, not deleting it,
// so the history ("한때 보존하기로 했다가 결정이 바뀌었다") stays visible
// in the suite. T24-T28 below are the new removal assertions §17.6 asks
// for, exercised across every profile this suite can render (herbal/pain/
// mixed -- 재진 has no distinct DoctorView render path or fixture of its
// own: a follow-up visit renders through the exact same viewProfile-driven
// code JudgmentPanel/DoctorView never branched on visit count, so the pain
// fixture stands in for both 초진 and 재진 here).
{
  const html = renderDoctorView('수면 주호소 + 동반 소화/통증')
  assert('T1: judgment__secondaryFields details block no longer renders', !html.includes('judgment__secondaryFields'))
  assert('T1: "사주 예상 → 수정 판단" summary text no longer renders', !html.includes('사주 예상 → 수정 판단'))
  for (const label of ['사주만 보고 예상한', '문진·맥·설·복진 후 수정된 판단', '최종 치료축 (원장 입력)', '처방 방향 (원장 입력']) {
    assert(`T1: removed field label "${label}" no longer renders`, !html.includes(label))
  }
  assert('T2: "치료 우선순위·한약 방향" 설명개요 read-back no longer renders', !html.includes('치료 우선순위·한약 방향'))
  assert('T13: 핵심 선천 특징 no longer renders (herbal profile)', !html.includes('핵심 선천 특징'))
  assert('T13: 현재 증상과 연결되는 핵심 no longer renders (herbal profile)', !html.includes('현재 증상과 연결되는 핵심'))
  assert('T14: judgment__outline no longer renders', !html.includes('judgment__outline'))
  assert('T14: "설명 개요" disclosure summary no longer renders', !html.includes('설명 개요'))

  // T23 (REVERSED by Batch 4.1-D §17.5 -- was "still renders", now "no
  // longer renders"): 1분 디브리핑/학습 케이스/"기록" button are all gone.
  assert('T23 (reversed): "1분 디브리핑" disclosure no longer renders', !html.includes('1분 디브리핑'))
  assert('T23 (reversed): "학습 케이스" toggle no longer renders', !html.includes('학습 케이스'))
  assert('T23 (reversed): "기록" save button no longer renders', !html.includes('>기록</button>'))
}
{
  // T13/T14/T23 companions in pain profile too -- JudgmentPanel used to
  // render unconditionally regardless of viewProfile (unlike BIRTH_*, it
  // had no `viewProfile !== 'pain'` gate), so both removals and the
  // reversed T23 must hold there as well.
  const html = renderDoctorView('허리 통증 주호소 (LBP, 확인 필요)')
  assert('T13: 핵심 선천 특징 no longer renders (pain profile)', !html.includes('핵심 선천 특징'))
  assert('T13: 현재 증상과 연결되는 핵심 no longer renders (pain profile)', !html.includes('현재 증상과 연결되는 핵심'))
  assert('T14: judgment__outline no longer renders (pain profile)', !html.includes('judgment__outline'))
  assert('T23 (reversed): "1분 디브리핑" disclosure no longer renders (pain profile)', !html.includes('1분 디브리핑'))
  assert('T23 (reversed): "학습 케이스" toggle no longer renders (pain profile)', !html.includes('학습 케이스'))
  // The read-only echo ("객관적 하지 근력저하 소견 (원장 진찰, LBP):") is
  // gone (§17.2/§17.4) -- but the substring itself still renders, now from
  // the LIVE editable ObjectiveExamFindingsCard label ("객관적 하지
  // 근력저하 소견 (LBP)") in the 진료 tab, which is exactly T29 below.
  assert('T23 companion: 객관적 하지 근력저하 text still renders (pain profile, LBP fixture) -- now from the editable card only, see T29', html.includes('객관적 하지 근력저하'))
}

// ---------- Batch 4.1-D §17.6: T24-T28 (removal, rendered html) ----------
{
  const profiles = [
    ['herbal', '수면 주호소 + 동반 소화/통증'],
    ['pain (also stands in for 초진/재진 -- see comment above)', '허리 통증 주호소 (LBP, 확인 필요)'],
    ['mixed', '허리 통증 주호소 + 한약 추가문진 (mixed 프로필)'],
  ]
  for (const [label, fixtureName] of profiles) {
    const html = renderDoctorView(fixtureName)

    // T24: "1분 디브리핑" itself never renders, on any profile.
    assert(`T24: "1분 디브리핑" does not render (${label} profile)`, !html.includes('1분 디브리핑'))

    // T25: none of the 4 DEBRIEF_QUESTIONS strings render either -- content,
    // not just the box name (§17.0's own lesson: reading the box's NAME
    // was not enough, the leak was inside). Imported directly from
    // judgment.ts's own constant so a future wording change can't silently
    // de-fang this assertion.
    for (const [i, q] of DEBRIEF_QUESTIONS.entries()) {
      assert(`T25: DEBRIEF_QUESTIONS[${i}] ("${q}") does not render (${label} profile)`, !html.includes(q))
    }

    // T26: 학습 케이스 disclosure and its "★ 표시됨" flag are gone.
    assert(`T26: "학습 케이스" does not render (${label} profile)`, !html.includes('학습 케이스'))
    assert(`T26: "★ 표시됨" does not render (${label} profile)`, !html.includes('★ 표시됨'))

    // T27: the "디브리핑·학습 기록" accordion and the "원장 판단 기록"
    // section (JudgmentPanel's own <h2>) are both gone.
    assert(`T27: "디브리핑·학습 기록" accordion does not render (${label} profile)`, !html.includes('디브리핑·학습 기록'))
    assert(`T27: "원장 판단 기록" section does not render (${label} profile)`, !html.includes('원장 판단 기록'))

    // T28: 사주/명리 render zero times anywhere on the page, on every
    // profile -- the global lock §17.0's own miss (a per-box name check
    // that never read the box's CONTENT) asks for.
    assert(`T28: "사주" does not render anywhere (${label} profile)`, !html.includes('사주'))
    assert(`T28: "명리" does not render anywhere (${label} profile)`, !html.includes('명리'))
  }
}

// 13i. 중복 감사(§PART9): "1~3개월"(주호소 duration 답) 텍스트는 정확히 2번 —
//      기존 주호소 섹션과, Core Reduction P2부터는 진료 탭 V3 셸의 좌측 요약
//      ②주호소·기간 블록(Phase 7 §3.2, 상시 노출) -- 이는 의도된 아키텍처
//      변경이다: 좌측 요약은 스크롤 없이 항상 보이는 것이 바로 이 배치의
//      목적이다. PR #24부터 herbal hero는 duration을 별도로 보여주지
//      않으므로(herbal 프로필의 10초 요약은 전신 증상 우선 -- pain hero만
//      duration을 보여준다) 그 경로에서는 하나 늘지 않는다. Batch 4.1-B
//      (§16.3): 명리 검토의 "현재 문진 요약" 열(세 번째 출처)이 그 그리드째
//      제거되어, 이 fixture의 총 등장 횟수가 3에서 2로 줄었다.
{
  const html = renderDoctorView('수면 주호소 + 동반 소화/통증')
  const durationLabel = optionLabel('VISIT_03_SYMPTOM_DURATION', '1_3m')
  const count = html.split(durationLabel).length - 1
  assert('duplication audit: duration label renders exactly 2 times (좌측 요약 + 주호소; the former 명리 검토 column is gone)', count === 2)
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

// 14. Round 2 Phase 3: DoctorView's own (below-workspace) "여성 안전정보"
//     section only renders when reproductive_status.derived.source is
//     non-null -- a male patient (or any patient with nothing reproductive
//     recorded) must not see an empty "확인되지 않음" card. Same fix/same
//     signal as HerbalWorkspace's own conditional section, applied here
//     because this round's visual QA screenshot caught the identical
//     problem in this separate, pre-existing legacy section.
{
  const html = renderDoctorView('허리 통증 주호소 (LBP, 확인 필요)')
  assert('male patient fixture: 여성 안전정보 section is absent (nothing reproductive recorded)', !html.includes('여성 안전정보'))
}
{
  const html = renderDoctorView('여성 건강 주호소')
  assert('female patient fixture with WOMEN_SAFETY_01 answered: 여성 안전정보 section renders', html.includes('여성 안전정보'))
}

/*
 * 13차 독립 리뷰 LOW-3: the 여성 안전정보 card's render condition used to be
 * `derived?.source != null || (isUnreadableReproductiveDerived(r) &&
 * Array.isArray(raw))` -- a raw answer that exists but is not an array
 * (legacy single-select) combined with derived.source===null made BOTH
 * halves false, so the whole section (including the patient's own raw
 * answer) silently vanished instead of showing the "읽을 수 없음" notice.
 * DoctorView.tsx doesn't accept an arbitrary patched payload prop (only
 * initialFixtureIndex into the fixed DOCTOR_FIXTURES set), so this is
 * proven structurally against the source, matching this suite's established
 * fallback for code paths that aren't independently renderable (see the
 * 12th independent review HIGH-3 test below for the same pattern).
 */
{
  const doctorViewSrc = await readFile(
    fileURLToPath(new URL('../src/doctor/DoctorView.tsx', import.meta.url)),
    'utf8',
  )
  assert(
    '13차 독립 리뷰 LOW-3: 여성 안전정보 render gate no longer requires Array.isArray on the raw answer -- any non-null/non-undefined raw answer keeps the section visible when isUnreadableReproductiveDerived(r) is true',
    doctorViewSrc.includes(
      "(isUnreadableReproductiveDerived(r) &&\n          r.reproductive_status?.reproductive_status !== null &&\n          r.reproductive_status?.reproductive_status !== undefined)",
    ),
  )
}

/* =====================================================================
   Round 11 (Doctor Preview v2 -- 10-second clinical view). The record used
   to render as one long vertical page: clinical workspace, then the whole
   questionnaire transcript, then meds/history, then Myungri, then the
   recorder/EMR block, then the legacy judgment form, then the raw JSON.
   It is now three surfaces, and only the clinical one is visible by
   default. Nothing was deleted -- these tests pin BOTH halves of that.
   ===================================================================== */
{
  const html = renderDoctorView('허리 통증 주호소 (LBP, 확인 필요)')

  // The surfaces exist and 진료 is the one selected on open.
  // Core Reduction P4 (Phase 5 Synthesis v1.2 §2.11): '자료 보기' is
  // relabeled '참고' and now also holds the content that used to live under
  // a separate '명리' tab, as accordion groups (see the herbal-record block
  // below) -- the switch itself, and its behavior as "everything not
  // 진료", is otherwise unchanged from round 11.
  assert('round 11 (P4 relabel): the record offers a 진료 / 참고 surface switch', html.includes('doctor__recordTabs') && html.includes('참고'))
  const clinicalTabIdx = html.indexOf('doctor__recordTab--active')
  assert('round 11: 진료 is the surface selected on open', clinicalTabIdx !== -1 && html.slice(clinicalTabIdx, clinicalTabIdx + 120).includes('진료'))

  /* ---- what must NOT be on the default surface. Each of these is
     rendered inside a hidden panel, so "not default-visible" is checked by
     finding it AFTER the point where the reference surface begins. ---- */
  const referenceStart = html.indexOf('doctor__referenceNote')
  assert('round 11: the reference surface exists', referenceStart !== -1)

  const rawJsonIdx = html.indexOf('원본 응답 보기 (JSON)')
  assert('round 11: the raw JSON payload is NOT on the default clinical surface', rawJsonIdx > referenceStart)

  const transcriptIdx = html.indexOf('환자 기본')
  assert('round 11: the raw questionnaire transcript is NOT on the default clinical surface', transcriptIdx > referenceStart)

  const medsIdx = html.indexOf('약물·병력·알레르기·수술')
  assert('round 11: medication/history detail is NOT on the default clinical surface', medsIdx > referenceStart)

  /* ---- ...but every one of them is still rendered, one click away. ---- */
  assert('round 11: the raw JSON payload still exists (moved, not deleted)', rawJsonIdx !== -1)
  assert('round 11: the questionnaire detail still exists (moved, not deleted)', transcriptIdx !== -1)
  assert('round 11: medication/history detail still exists (moved, not deleted)', medsIdx !== -1)

  /* ---- safety must stay above every ordinary clinical block. ---- */
  const safetyIdx = html.indexOf('doctor__commonSafety')
  const judgmentIdx = html.indexOf('원장 최종 판단')
  assert('round 11: Common Safety still renders on the default clinical surface', safetyIdx !== -1 && safetyIdx < referenceStart)
  assert('round 11: safety comes before the clinician action area', safetyIdx < judgmentIdx)
}

{
  /*
   * T6 (Batch 4.1-B §16.3/§16.6, updating the round-11 test this used to
   * be): "Myungri is a SEPARATE surface" used to mean it lived in its own
   * accordion, reachable one click away for herbal/mixed records, never
   * inside the clinical flow. Batch 4.1-B goes further -- PO decision
   * 2026-09-04, separate 명리 program used instead -- the accordion
   * (MyungriCompactCard render site + "명리 검토" review grid: pillars,
   * 오행/한열조습 placeholder text, 일간 line) is REMOVED entirely, not
   * merely moved. It no longer renders for ANY profile, herbal/mixed
   * included -- there is no longer a Myungri panel to gate at all.
   */
  const herbal = renderDoctorView('수면 주호소 + 동반 소화/통증')
  const pain = renderDoctorView('허리 통증 주호소 (LBP, 확인 필요)')
  for (const [label, html] of [['herbal', herbal], ['pain', pain]]) {
    for (const needle of ['명리 검토', '오행 분포', '4주 8자', '일간:']) {
      assert(`T6: "${needle}" no longer renders anywhere on the full page (${label} profile)`, !html.includes(needle))
    }
  }
  assert('T6: the clinical workspace itself still contains no Myungri block (unaffected by this batch, still true)', !herbal.includes('workspace__myungri'))
}

/*
 * T7/T8/T9/T10/T20 (Batch 4.1-B §16.3/§15.4/§16.6): the doctor-facing
 * "출생 시간대" label added to 문진 원본 > 환자 기본's BIRTH_03 field --
 * this is the ONLY replacement the removed 명리 accordion gets (§15.4's
 * "간략하게" ask). These pin the regression the whole batch exists to
 * avoid: the removals above (T6/T13/T14/T15/T18) must not also take this
 * one field, or the herbal/mixed birth-time surface with it (PO decision
 * (1): 생년월일/양음력/윤달/시간 확신도 stay -- T20).
 */
{
  // T7: herbal record shows the label + the actual branch string (기본
  // fixture default BIRTH_03: 'o' via BASE_DEFAULTS -> '오시').
  const html = renderDoctorView('수면 주호소 + 동반 소화/통증')
  assert('T7: herbal record shows the 출생 시간대 label', html.includes('출생 시간대'))
  assert('T7: herbal record shows the branch string (오시)', html.includes('오시'))
}
{
  // T8: mixed record (viewProfile === 'mixed') shows the same thing --
  // this is the only DOCTOR_FIXTURES entry that derives to 'mixed' (see
  // fixtures.ts's own comment at that entry), so first pin the profile
  // itself didn't silently drift back to 'pain'/'herbal'.
  const name = '허리 통증 주호소 + 한약 추가문진 (mixed 프로필)'
  const f = byName(name)
  assert(
    'T8 sanity: the mixed fixture actually has pain content (primary_module Pain)',
    f.payload.routing.primary_module === 'Pain',
  )
  assert(
    'T8 sanity: the mixed fixture actually has systemic content (questionnaire_mode herbal_addon)',
    f.payload.routing.questionnaire_mode === 'herbal_addon',
  )
  const html = renderDoctorView(name)
  assert('T8: mixed record shows the 출생 시간대 label', html.includes('출생 시간대'))
  assert('T8: mixed record shows the branch string (인시)', html.includes('인시'))
}
{
  // T9: PR #24 Phase 2 invariant, still enforced after this batch -- a
  // pain record shows neither the label nor ANY BIRTH_* value (the whole
  // <>...</> block stays behind the unchanged `viewProfile !== 'pain'`
  // gate).
  const html = renderDoctorView('허리 통증 주호소 (LBP, 확인 필요)')
  assert('T9: pain record shows no 출생 시간대 label', !html.includes('출생 시간대'))
  // Full BIRTH_03 option labels (not bare branch names -- "미시" alone
  // collides with the unrelated "미시행" (NOT_ASSESSED) LBP exam label,
  // which legitimately renders in this pain fixture).
  for (const value of ['ja', 'chuk', 'in', 'myo', 'jin', 'sa', 'o', 'mi', 'sin', 'yu', 'sul', 'hae']) {
    const label = optionLabel('BIRTH_03', value)
    assert(`T9: pain record shows no birth-time-branch value (${label})`, !html.includes(label))
  }
}
{
  // T10: BIRTH_03 === 'unknown' fixture ('체중 관리') shows the muted
  // "잘 모르겠어요" answer, never a fabricated certainty phrase (the kind
  // MyungriCompactCard's now-gone birthInfoLine used to show, e.g.
  // "출생시간 확인됨").
  const html = renderDoctorView('체중 관리')
  assert('T10: unknown-birth-time fixture shows 잘 모르겠어요', html.includes('잘 모르겠어요'))
  assert('T10: no fabricated "출생시간 확인됨"-style certainty text anywhere', !html.includes('출생시간 확인됨'))
}
{
  // T20 (PO decision (1), kept -- §16.0): 생년월일/양력·음력/윤달/시간
  // 확신도 all still render for a herbal record. This is the "opposite
  // side" CLAUDE.md's 표 rule asks for: T6 proves the removed side is
  // gone, T20 proves the NOT-removed side wasn't taken with it.
  const html = renderDoctorView('여성 건강 주호소')
  assert('T20: herbal record still shows 생년월일 label', html.includes('생년월일'))
  assert('T20: herbal record still shows birth_calendar_type value (음력)', html.includes('음력'))
  assert('T20: herbal record still shows lunar_leap_month value (윤달이에요)', html.includes('윤달이에요'))
  assert('T20: herbal record still shows birth_time_confidence value (정확해요)', html.includes('정확해요'))
}

/* =========================================================================
 * Malformed/legacy submission resilience batch: `isDoctorPayloadShapeUsable`
 * is the single gate deciding whether DoctorView attempts its normal
 * detailed rendering (which reads dozens of nested fields unconditionally,
 * e.g. deriveViewProfile(payload), primaryConcernLabel(r), routing.*,
 * saju.policy.*) or falls back to a neutral "record incomplete" shell.
 * Every real fixture must pass it (else this batch would have broken
 * normal rendering), and deleting any ONE of the top-level keys it checks
 * must independently fail it (a mutation-style guard against the check
 * silently drifting out of sync with what DoctorView actually reads).
 * ======================================================================= */

{
  for (const f of DOCTOR_FIXTURES) {
    assert(`resilience: fixture "${f.name}" passes isDoctorPayloadShapeUsable`, isDoctorPayloadShapeUsable(f.payload) === true)
  }
}

/* -------------------------------------------------------------------------
 * 21차 독립 리뷰 HIGH-1: `recordToPayload`(SubmissionRecord -> DoctorPayload)는
 * DoctorView의 렌더 본문에서 `isDoctorPayloadShapeUsable`보다 먼저,
 * 무조건 호출된다 -- record.submission이 null/객체가 아니면
 * `s.questionnaire_version` 등 필드 접근에서 그대로 throw했다. 이 throw는
 * DoctorRecordFallback(안전한 착지 화면)에 도달하기도 전에
 * PatientErrorBoundary까지 뚫고 올라가 원장 화면 전체가 환자용 화면으로
 * 바뀐다 -- 20차가 고친 클래스보다 한 단계 앞선, 더 심각한 지점.
 * ---------------------------------------------------------------------- */
{
  const validPayload = byName('허리 통증 주호소 (LBP, 확인 필요)').payload
  const validRecord = {
    id: 'r-recordToPayload',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    status: 'new',
    patient_label: '(QA) recordToPayload',
    patient_id: 'patient-recordToPayload',
    submission: {
      questionnaire_version: validPayload.questionnaire_version,
      session_id: validPayload.session_id,
      responses: validPayload.responses,
      flags: validPayload.flags,
      routing: validPayload.routing,
      metadata: validPayload.metadata,
    },
    myungri: validPayload.myungri_calculation,
    judgment: null,
  }
  assert(
    'resilience recordToPayload: a genuine record produces a payload that passes isDoctorPayloadShapeUsable (sanity)',
    isDoctorPayloadShapeUsable(recordToPayload(validRecord)) === true,
  )

  for (const bad of [null, undefined, 'garbage-string', 123, [], true]) {
    let threw = false
    let payload = null
    try {
      payload = recordToPayload({ ...validRecord, submission: bad })
    } catch {
      threw = true
    }
    assert(`resilience recordToPayload HIGH-1: record.submission=${JSON.stringify(bad)} does not throw`, threw === false)
    assert(
      `resilience recordToPayload HIGH-1: record.submission=${JSON.stringify(bad)} yields a payload isDoctorPayloadShapeUsable rejects (fails closed to DoctorRecordFallback, not an uncatchable crash upstream of it)`,
      payload !== null && isDoctorPayloadShapeUsable(payload) === false,
    )
  }
}

{
  const base = byName('허리 통증 주호소 (LBP, 확인 필요)').payload
  assert('resilience: sanity -- the base fixture itself passes', isDoctorPayloadShapeUsable(base) === true)

  // Whole-namespace loss (the exact bug this batch fixes -- routing: null,
  // or a hand-built/legacy responses object missing entire namespaces).
  assert('resilience: routing=null is rejected', isDoctorPayloadShapeUsable({ ...base, routing: null }) === false)
  assert('resilience: routing=undefined is rejected', isDoctorPayloadShapeUsable({ ...base, routing: undefined }) === false)
  assert('resilience: flags=null is rejected', isDoctorPayloadShapeUsable({ ...base, flags: null }) === false)
  assert('resilience: responses=null is rejected', isDoctorPayloadShapeUsable({ ...base, responses: null }) === false)
  assert('resilience: responses={} (all namespaces missing) is rejected', isDoctorPayloadShapeUsable({ ...base, responses: {} }) === false)
  assert(
    'resilience: myungri_calculation=null is rejected',
    isDoctorPayloadShapeUsable({ ...base, myungri_calculation: null }) === false,
  )
  assert(
    'resilience: myungri_calculation missing .policy is rejected',
    isDoctorPayloadShapeUsable({ ...base, myungri_calculation: { ...base.myungri_calculation, policy: undefined } }) === false,
  )
  assert(
    'resilience: myungri_calculation missing .engine is rejected',
    isDoctorPayloadShapeUsable({ ...base, myungri_calculation: { ...base.myungri_calculation, engine: undefined } }) === false,
  )
  assert(
    'resilience: myungri_calculation.status not a string is rejected',
    isDoctorPayloadShapeUsable({ ...base, myungri_calculation: { ...base.myungri_calculation, status: 123 } }) === false,
  )

  // Mutation guard: each individual `responses` namespace the file's own
  // render code reads unconditionally (r.patient, r.visit_goal, r.modules,
  // etc.) must independently be required -- deleting just one must still
  // fail the check, proving the required-keys list actually covers it
  // rather than only catching the all-or-nothing case above.
  const requiredResponseKeys = [
    'patient',
    'visit_goal',
    'primary_concern',
    'additional_detail_concern',
    'reference_symptoms',
    'secondary_concerns',
    'safety_flags',
    'modules',
    'secondary_modules',
    'constitution_basics',
    'medication',
    'medical_history',
    'allergy',
    'surgery_history',
    'reproductive_status',
    'recent_tests',
    'birth_info',
    'free_text',
  ]
  for (const key of requiredResponseKeys) {
    const mutated = { ...base.responses }
    delete mutated[key]
    const payload = { ...base, responses: mutated }
    assert(`resilience: responses missing "${key}" alone is rejected`, isDoctorPayloadShapeUsable(payload) === false)
  }

  // An array where an object is expected must also be rejected (guards
  // against a malformed body that JSON-parses fine but has the wrong
  // shape for a specific field, not just a missing one).
  assert(
    'resilience: routing as an array (not an object) is rejected',
    isDoctorPayloadShapeUsable({ ...base, routing: [] }) === false,
  )
}

/* =========================================================================
 * Independent-review regression (2nd Opus review of commit 109e024): the
 * gate above only checks that each top-level `responses.*` namespace IS a
 * plain object -- by design it never inspects leaves inside them (that was
 * this batch's whole point: no leaf-level clinical inference). The review
 * proved by direct execution that a payload can pass the gate while still
 * being hollow enough (e.g. responses.modules = {}, routing = {} with no
 * secondary_screens, myungri_calculation with no normalized/pending_approval)
 * to crash several inline expressions in DoctorView's own render body --
 * uncatchable by DoctorRecordErrorBoundary, since these are plain JS
 * expressions evaluated as part of DoctorView's own function call, not a
 * separate child component's render. The fix was defensive reads at each
 * site (optional chaining / `?? []` fallbacks), not a stricter gate --
 * these tests reproduce the review's exact probes against the fixed code
 * so a future edit that removes one of those guards fails here.
 * ======================================================================= */

{
  const hollowModules = {}
  for (const primaryModule of ['Sleep', 'Bowel', 'Urinary', 'GI', 'Pain', 'Fatigue', 'Stress', 'Weight']) {
    let threw = false
    try {
      frequencyField(primaryModule, hollowModules)
      aggravatingField(primaryModule, hollowModules)
    } catch {
      threw = true
    }
    assert(`resilience: frequencyField/aggravatingField(${primaryModule}, {}) does not throw on a hollow modules namespace`, threw === false)
  }
  assert(
    'resilience: frequencyField(Sleep, {}) returns null rather than reading m.sleep.frequency_per_week off a missing submodule',
    frequencyField('Sleep', hollowModules) === null,
  )
  assert(
    'resilience: aggravatingField(Pain, {}) returns null rather than reading m.pain.pain_qualities off a missing submodule',
    aggravatingField('Pain', hollowModules) === null,
  )
}

{
  const requiredResponseKeys = [
    'patient',
    'visit_goal',
    'primary_concern',
    'additional_detail_concern',
    'reference_symptoms',
    'secondary_concerns',
    'safety_flags',
    'modules',
    'secondary_modules',
    'constitution_basics',
    'medication',
    'medical_history',
    'allergy',
    'surgery_history',
    'reproductive_status',
    'recent_tests',
    'birth_info',
    'free_text',
  ]
  const responses = Object.fromEntries(requiredResponseKeys.map((k) => [k, {}]))
  // A shape the LAN server will accept as-is (server/index.js only requires
  // questionnaire_version: string and truthy responses) with every
  // namespace the gate checks present, but every leaf inside them missing --
  // exactly the class of legacy/hand-crafted record the review reproduced.
  const hollowPayload = {
    session_id: 'resilience-hollow-leaves',
    questionnaire_version: '1.0',
    responses,
    flags: {},
    routing: {},
    myungri_calculation: { policy: {}, engine: {}, flags: {}, status: 'resolved' },
  }
  assert(
    'resilience: a hollow-but-namespace-complete payload still passes the gate ' +
      '(the gate cannot and should not reject this -- leaf-level defenses in the render are what has to hold)',
    isDoctorPayloadShapeUsable(hollowPayload) === true,
  )

  const r = hollowPayload.responses
  const { routing } = hollowPayload
  // Real code, not a re-implementation of the guard: this exercises the
  // actual exported `frequencyField`/`aggravatingField` against the hollow
  // `r.modules` object (a bare `{}`), which is exactly what the 2nd
  // independent review reproduced by direct execution against 109e024.
  const behavioralProbes = [
    ['frequencyField(routing.primary_module, r.modules)', () => frequencyField(routing.primary_module, r.modules)],
    ['aggravatingField(routing.primary_module, r.modules)', () => aggravatingField(routing.primary_module, r.modules)],
  ]
  for (const [label, fn] of behavioralProbes) {
    let threw = false
    try {
      fn()
    } catch {
      threw = true
    }
    assert(`resilience: ${label} does not throw for a hollow-but-gate-passing payload`, threw === false)
  }
}

/* -------------------------------------------------------------------------
 * 2nd independent review (closing review of 824c864) found that the leaf
 * fixes above covered only the two call sites the 1st review happened to
 * name, and reproduced a live crash inside `primaryModuleFields` (12
 * `routing.primary_module` values, 11 of which read an `m.<submodule>` that
 * can be legitimately absent) plus `menopauseSleepSummaryLines` (reads
 * `sleep.menopause` unconditionally) -- both are called directly from
 * DoctorView's own render body, so a throw there is NOT caught by
 * DoctorRecordErrorBoundary (same uncatchable-inline-expression class as
 * the original bug). `primaryModuleFields` is exported specifically so this
 * suite can call the REAL function against a hollow `m`, not re-implement
 * its guard here.
 * ---------------------------------------------------------------------- */
{
  const ALL_PRIMARY_MODULES = [
    'Sleep', 'GI', 'Bowel', 'Urinary', 'Pain', 'Fatigue', 'Stress', 'Women', 'Pregnancy', 'Postpartum', 'Weight',
  ]
  // m = {} : every submodule missing. Every primaryModule value must return
  // a safe (possibly empty) array, never throw.
  for (const mod of ALL_PRIMARY_MODULES) {
    let threw = false
    let result
    try {
      result = primaryModuleFields(mod, {}, null)
    } catch {
      threw = true
    }
    assert(`resilience: primaryModuleFields('${mod}', {}, null) does not throw on a fully hollow modules object`, threw === false)
    assert(`resilience: primaryModuleFields('${mod}', {}, null) returns an array`, Array.isArray(result))
  }
  // m.pain present but m.lbp/m.hip/m.neck/m.shoulder/m.knee/m.elbow/
  // m.wrist_hand/m.tmj all missing, primaryModuleDetail='LBP' -- reproduces
  // exactly the shape a legacy LBP submission that never got its regional
  // sub-answers persisted would have. The base PAIN_01/02/04 fields must
  // still come back; none of the region-specific blocks may throw.
  {
    let threw = false
    let result
    try {
      result = primaryModuleFields('Pain', { pain: { primary_location: 'low_back_pelvis' } }, 'LBP')
    } catch {
      threw = true
    }
    assert('resilience: primaryModuleFields Pain case with m.pain present but every region submodule missing does not throw', threw === false)
    assert(
      'resilience: primaryModuleFields Pain case still returns the base PAIN_01/02/04 fields when region submodules are missing',
      Array.isArray(result) && result.some((f) => f.qid === 'PAIN_01'),
    )
    assert(
      'resilience: primaryModuleFields Pain case omits LBP_* fields rather than inventing them when m.lbp is missing',
      !result.some((f) => f.qid.startsWith('LBP_')),
    )
  }
  // m.sleep present but m.sleep.menopause missing -- the exact shape that
  // crashed menopauseSleepSummaryLines/primaryModuleFields's MS_* fields in
  // the closing review's repro (fixture 0 with modules.sleep = {}).
  {
    let threw = false
    let result
    try {
      result = primaryModuleFields('Sleep', { sleep: { problems: null } }, null)
    } catch {
      threw = true
    }
    assert('resilience: primaryModuleFields Sleep case with m.sleep present but m.sleep.menopause missing does not throw', threw === false)
    assert(
      'resilience: primaryModuleFields Sleep case omits MS_* fields rather than inventing them when m.sleep.menopause is missing',
      Array.isArray(result) && !result.some((f) => f.qid.startsWith('MS_')),
    )
  }
}

/* -------------------------------------------------------------------------
 * Structural guards for the inline JSX leaf reads that can't be exercised
 * as standalone pure functions (they're single-use expressions inside
 * DoctorView's own JSX, not extracted helpers) -- confirms the fix in
 * 824c864/this round is actually still wired into the source, not just
 * present in a function this suite happens to import. Uses the same
 * source-regex technique already established for the boundary key checks
 * below, rather than re-implementing the guard logic here (the mistake the
 * closing review found in the previous version of this test).
 * ---------------------------------------------------------------------- */
{
  const src = await readFile(fileURLToPath(new URL('../src/doctor/DoctorView.tsx', import.meta.url)), 'utf8')
  assert(
    'resilience: a shared asArray() helper guards against both missing AND wrong-typed array fields (not just `?? []`, which lets a non-array truthy value through)',
    /function asArray<T>\(value: unknown\): T\[\] \{\s*\n\s*return Array\.isArray\(value\)/.test(src),
  )
  assert(
    'resilience: routing.secondary_screens is read through asArray(), not a bare `?? []`',
    /asArray<string>\(routing\.secondary_screens\)/.test(src),
  )
  assert(
    'resilience: saju.policy.pending_approval is read through asArray() at every render/judgment-save-source-prop site',
    (src.match(/asArray(?:<string>)?\(saju\.policy\.pending_approval\)/g) ?? []).length >= 3,
  )
  assert(
    'resilience: r.reproductive_status.derived is optional-chained before .source is read',
    /r\.reproductive_status\?\.derived\?\.source/.test(src),
  )
  // Batch 4.1-B: the "saju.normalized?.solarDate is optional-chained
  // before .year/.month/.day are read" guard used to live here -- its only
  // call site was the removed "명리 검토" reviewGrid's 정규화된 양력 날짜
  // line (the same block datePartText's only caller lived in, checked as
  // "T6 companion" above). No source for that guard to check remains.
  assert(
    // 12차 독립 리뷰 HIGH-3: truthy 체크(`!saju.pillars?.day`)는 day가
    // 존재하지만 wrong-typed(예: number)면 통과시켜 .charAt(0)에서 그대로
    // 크래시했다 -- 타입 검사(`typeof dayPillar !== 'string'`)로 교체.
    'resilience: MyungriCompactCard checks typeof saju.pillars?.day === "string" (not just truthy) before calling .charAt on it',
    /const dayPillar = saju\.pillars\?\.day\s*\n\s*if \(typeof dayPillar !== 'string'\)/.test(src),
  )
  assert(
    'resilience: primaryModuleFields Sleep case guards m.sleep.menopause before reading its MS_* leaves',
    /const ms = m\.sleep\.menopause\s*\n\s*return \[/.test(src) && /\.\.\.\(ms\s*\n\s*\? \[/.test(src),
  )
  assert(
    'resilience: menopauseSleepSummaryLines (a separate function from primaryModuleFields, used by the 10-second-summary card) also guards sleep?.menopause before reading its gate_context/stage/etc leaves',
    /const ms = sleep\?\.menopause\s*\n\s*if \(!ms\) return null/.test(src),
  )
  assert(
    'resilience: a shared asArray() -- isNonEmptyObject() -- helper exists guarding against a submodule that is technically present but completely empty (a shape real submissions cannot produce, since buildResponsePayload always fills every key even when unanswered -- an empty object only happens from legacy/hand-crafted data, and leaving it through renders every leaf as undefined, which several panels display as a definitive "아니요"/negative rather than "확인 필요")',
    /function isNonEmptyObject\(value: unknown\): boolean \{\s*\n\s*return isPlainObject\(value\) && Object\.keys\(value\)\.length > 0/.test(
      src,
    ),
  )
  assert(
    'resilience: a shared isNullOrStringArray() helper exists guarding array ELEMENTS, not just the array container -- lbpAdapter.ts/neckAdapter.ts (frozen) call .toUpperCase() unconditionally on each medical_history_flags element',
    /function isNullOrStringArray\(value: unknown\): boolean \{/.test(src) &&
      /return Array\.isArray\(value\) && value\.every\(\(v\) => typeof v === 'string'\)/.test(src),
  )
  assert(
    'resilience: a SafetyDataUnavailableNotice component exists (DoctorView.tsx) so "region not applicable" (silent null) and "region applicable but not computable" (explicit notice) are never conflated -- 5th independent review HIGH-2',
    /function SafetyDataUnavailableNotice\(\{ label \}: \{ label: string \}\) \{/.test(src) &&
      /안전 상태를 자동으로 계산할 수 없습니다/.test(src),
  )
  assert(
    "resilience: every simple regional SafetyPanel gate (Knee/Elbow/WristHand) splits applicability (safety_flags.<region> == null -> silent null) from malformed-data (modules.<region> empty -> explicit SafetyDataUnavailableNotice, never silence) -- a legacy record with safety_flags.<region> entirely absent must stay silent, but one with safety_flags.<region> present and modules.<region> empty must show the notice, not nothing",
    ['knee', 'elbow', 'wrist_hand'].every((region) =>
      new RegExp(
        `safety_flags\\.${region} == null\\) return null\\s*\\n[\\s\\S]*?if \\(!isNonEmptyObject\\(payload\\.responses\\.modules\\.${region}\\) \\|\\| !isFlagsUsable\\(payload\\.flags, payload\\.responses\\)\\) \\{\\s*\\n\\s*return <SafetyDataUnavailableNotice`,
      ).test(src),
    ),
  )
  assert(
    'resilience: NeckSafetyPanel splits applicability (safety_flags.neck == null -> silent null) from malformed-data, and additionally requires reproductive_status.derived, a null-or-string-array medical_history_flags, AND a null-or-string-array medication.medication_types (5th independent review HIGH-1: neckAdapter.ts frozen mapMedication calls .toUpperCase() on each medication_types element, missed by round 4) -- all four crash inside frozen neckAdapter.ts functions, and the malformed branch must render an explicit notice, not silence (HIGH-2)',
    /safety_flags\.neck == null\) return null/.test(src) &&
      /!isNonEmptyObject\(payload\.responses\.modules\.neck\) \|\|\s*\n\s*isUnreadableReproductiveDerived\(payload\.responses\) \|\|\s*\n\s*!isNullOrStringArray\(payload\.responses\.medical_history\.medical_history_flags\) \|\|\s*\n\s*!isNullOrStringArray\(payload\.responses\.medication\.medication_types\)\s*\n\s*\) \{\s*\n\s*return <SafetyDataUnavailableNotice/.test(
        src,
      ),
  )
  assert(
    'resilience: ShoulderSafetyPanel splits applicability (safety_flags.shoulder == null -> silent null) from malformed-data, and additionally requires modules.neck (not just modules.shoulder), reproductive_status.derived, medical_history_flags, AND medication.medication_types (transitively via frozen shoulderAdapter.ts calling neckAdapter.ts) -- the malformed branch must render an explicit notice, not silence',
    /safety_flags\.shoulder == null\) return null/.test(src) &&
      /!isNonEmptyObject\(payload\.responses\.modules\.shoulder\) \|\|\s*\n\s*!isNonEmptyObject\(payload\.responses\.modules\.neck\) \|\|\s*\n\s*isUnreadableReproductiveDerived\(payload\.responses\) \|\|\s*\n\s*!isNullOrStringArray\(payload\.responses\.medical_history\.medical_history_flags\) \|\|\s*\n\s*!isNullOrStringArray\(payload\.responses\.medication\.medication_types\) \|\|[\s\S]*?!isFlagsUsable\(payload\.flags, payload\.responses\)\s*\n\s*\) \{\s*\n\s*return <SafetyDataUnavailableNotice/.test(
        src,
      ),
  )
  assert(
    'resilience: the LbpSafetyPanel gate uses safety_flags.lbp (not routing.primary_module_detail) as its applicability signal -- safety_flags.lbp is computed whenever IS_PRIMARY_LBP holds, which also covers the Additional Detailed Concern route where primary_module_detail stays null (6th independent review HIGH-1) -- and separately splits malformed-data (modules.lbp/reproductive_status.derived/medical_history_flags -> explicit SafetyDataUnavailableNotice, not silence)',
    /safety_flags\.lbp == null\) return null/.test(src) &&
      /!isNonEmptyObject\(payload\.responses\.modules\.lbp\) \|\|\s*\n\s*isUnreadableReproductiveDerived\(payload\.responses\) \|\|\s*\n\s*!isNullOrStringArray\(payload\.responses\.medical_history\.medical_history_flags\)\s*\n\s*\) \{\s*\n\s*return <SafetyDataUnavailableNotice/.test(
        src,
      ),
  )
  // Batch 4.1-D (§17.1/§17.2): JudgmentPanel's own showLbpExam/
  // showShoulderExam props are gone along with the component. The SAME
  // applicability signal survives on ObjectiveExamFindingsCard's
  // showLbp/showShoulder props instead -- those are wired in
  // DoctorWorkspace.tsx (not DoctorView.tsx, where JudgmentPanel used to
  // live), so this guard is re-anchored on that file below.
  {
    const workspaceSrc = await readFile(fileURLToPath(new URL('../src/doctor/workspace/DoctorWorkspace.tsx', import.meta.url)), 'utf8')
    assert(
      'resilience: showLbp/showShoulder on ObjectiveExamFindingsCard (DoctorWorkspace.tsx) use the same nullish safety_flags.<region> applicability signal as their SafetyPanel gates -- routing tags or strict !== null give wrong answers on the Additional Detailed Concern route / legacy undefined keys (6th independent review HIGH-1/MEDIUM-1, carried forward by Batch 4.1-D §17.3 when the editable control moved off JudgmentPanel)',
      /showLbp=\{payload\.responses\.safety_flags\.lbp != null\}/.test(workspaceSrc) &&
        /showShoulder=\{payload\.responses\.safety_flags\.shoulder != null\}/.test(workspaceSrc),
    )
  }
  assert(
    "resilience: the LBP region sub-block additionally requires m.lbp, not just primaryModuleDetail === 'LBP'",
    /primaryModuleDetail === 'LBP' && m\.lbp\s*\n\s*\? \[/.test(src),
  )
  assert(
    'resilience: every other Pain-case region sub-block additionally requires its own submodule (m.hip/m.neck/m.shoulder/m.knee/m.elbow/m.wrist_hand/m.tmj), not just the primary_location tag',
    ['m.hip', 'm.neck', 'm.shoulder', 'm.knee', 'm.elbow', 'm.wrist_hand', 'm.tmj'].every((sub) =>
      new RegExp(`primary_location === '[a-z_]+' && ${sub.replace('.', '\\.')}\\s*\\n\\s*\\? \\[`).test(src),
    ),
  )
  assert(
    'resilience: SECONDARY_MODULE_VALUE lambdas optional-chain into each submodule (sm.sleep?., sm.gi?., etc.) rather than assuming it exists',
    /sleep: \(sm\) => sm\.sleep\?\.problems \?\? null/.test(src) && /weight: \(sm\) => sm\.weight\?\.goal \?\? null/.test(src),
  )
}

/* -------------------------------------------------------------------------
 * 3rd independent review: HipSafetyPanel.tsx/TmjSafetyPanel.tsx/
 * AnkleFootSafetyPanel.tsx are separate files (not DoctorView.tsx) with the
 * exact same strict `safety_flags.<region> === null` gate bug -- a legacy
 * record where that key is entirely absent (undefined, not null) reads
 * responses.modules.<region>.* unconditionally right after.
 *
 * 5th independent review HIGH-2: each also now splits applicability
 * (safety_flags.<region> == null -> silent null) from malformed-data
 * (modules.<region> empty -> explicit SafetyDataUnavailableNotice, never
 * silence).
 * ---------------------------------------------------------------------- */
{
  const hipSrc = await readFile(fileURLToPath(new URL('../src/doctor/HipSafetyPanel.tsx', import.meta.url)), 'utf8')
  assert(
    'resilience: HipSafetyPanel splits applicability (safety_flags.hip == null -> silent null) from malformed-data (modules.hip empty -> explicit SafetyDataUnavailableNotice) and defines its own local copy of that component',
    /safety_flags\.hip == null\) return null\s*\n\s*if \(!isNonEmptyObject\(payload\.responses\.modules\.hip\) \|\| !isFlagsUsable\(payload\.flags, payload\.responses\)\) \{\s*\n\s*return <SafetyDataUnavailableNotice/.test(
      hipSrc,
    ) && /function SafetyDataUnavailableNotice\(\{ label \}: \{ label: string \}\) \{/.test(hipSrc),
  )

  const tmjSrc = await readFile(fileURLToPath(new URL('../src/doctor/TmjSafetyPanel.tsx', import.meta.url)), 'utf8')
  assert(
    'resilience: TmjSafetyPanel splits applicability (safety_flags.tmj == null -> silent null) from malformed-data (modules.tmj empty -> explicit SafetyDataUnavailableNotice) and defines its own local copy of that component',
    /safety_flags\.tmj == null\) return null\s*\n\s*if \(!isNonEmptyObject\(payload\.responses\.modules\.tmj\) \|\| !isFlagsUsable\(payload\.flags, payload\.responses\)\) \{\s*\n\s*return <SafetyDataUnavailableNotice/.test(
      tmjSrc,
    ) && /function SafetyDataUnavailableNotice\(\{ label \}: \{ label: string \}\) \{/.test(tmjSrc),
  )

  const ankleSrc = await readFile(
    fileURLToPath(new URL('../src/doctor/AnkleFootSafetyPanel.tsx', import.meta.url)),
    'utf8',
  )
  assert(
    'resilience: AnkleFootSafetyPanel splits applicability (safety_flags.ankle_foot == null -> silent null) from malformed-data (modules.ankle_foot empty -> explicit SafetyDataUnavailableNotice) and defines its own local copy of that component',
    /safety_flags\.ankle_foot == null\) return null\s*\n\s*if \(!isNonEmptyObject\(payload\.responses\.modules\.ankle_foot\) \|\| !isFlagsUsable\(payload\.flags, payload\.responses\)\) \{\s*\n\s*return <SafetyDataUnavailableNotice/.test(
      ankleSrc,
    ) && /function SafetyDataUnavailableNotice\(\{ label \}: \{ label: string \}\) \{/.test(ankleSrc),
  )
}

/* -------------------------------------------------------------------------
 * 5th independent review HIGH-1/HIGH-2 -- behavioral proof, not just
 * source-regex: render the REAL LbpSafetyPanel/NeckSafetyPanel/
 * ShoulderSafetyPanel components against a real fixture mutated to be
 * "applicable but corrupt" (safety_flags.<region> stays a genuinely
 * computed non-null value -- exactly what a legacy pre-`derived` or
 * pre-`medication_types`-validation record looks like) and assert the
 * explicit "확인 필요"-style notice text is actually PRESENT in the
 * rendered HTML -- not merely that render didn't throw. A test asserting
 * only `!threw` would have passed on the pre-fix code too (it silently
 * returned null), which is exactly the bug HIGH-2 identified.
 * ---------------------------------------------------------------------- */
{
  const lbpFixture = byName('허리 통증 주호소 (LBP, 확인 필요)')
  const neckFixture = byName('목 통증 주호소 (NECK, 확인 필요)')
  const shoulderFixture = byName('어깨 통증 주호소 (SHOULDER, 신속 의뢰 고려)')

  const UNAVAILABLE_TEXT = '안전 상태를 자동으로 계산할 수 없습니다'

  // HIGH-2: reproductive_status.derived missing/null, everything else intact
  // (including a real, already-computed safety_flags.<region> status) must
  // show the explicit notice, not silently render nothing.
  {
    const p = structuredClone(lbpFixture.payload)
    p.responses.reproductive_status.derived = null
    const html = renderToString(
      React.createElement(LbpSafetyPanel, { payload: p, lbpObjectiveMotorDeficit: null }),
    )
    assert(
      'resilience behavioral: LbpSafetyPanel with reproductive_status.derived=null (applicable LBP record, real computed safety_flags.lbp) renders the explicit unavailable notice, not silence',
      html.includes(UNAVAILABLE_TEXT),
    )
  }
  {
    const p = structuredClone(neckFixture.payload)
    p.responses.reproductive_status.derived = null
    const html = renderToString(React.createElement(NeckSafetyPanel, { payload: p }))
    assert(
      'resilience behavioral: NeckSafetyPanel with reproductive_status.derived=null renders the explicit unavailable notice, not silence',
      html.includes(UNAVAILABLE_TEXT),
    )
  }

  // HIGH-1: medication.medication_types containing a non-string element --
  // frozen neckAdapter.ts's mapMedication calls .toUpperCase() on each
  // element unconditionally (missed by round 4, which only guarded
  // medical_history_flags's identical pattern).
  {
    const p = structuredClone(neckFixture.payload)
    p.responses.medication.medication_use = 'yes'
    p.responses.medication.medication_types = ['psych', 7, null, { a: 1 }]
    const html = renderToString(React.createElement(NeckSafetyPanel, { payload: p }))
    assert(
      'resilience behavioral: NeckSafetyPanel with medication_types containing non-string elements renders the explicit unavailable notice instead of throwing (5th independent review HIGH-1)',
      html.includes(UNAVAILABLE_TEXT),
    )
  }
  {
    const p = structuredClone(shoulderFixture.payload)
    p.responses.medication.medication_use = 'yes'
    p.responses.medication.medication_types = ['blood_thinner', 42]
    const html = renderToString(
      React.createElement(ShoulderSafetyPanel, { payload: p, shoulderObjectiveCuffWeakness: null }),
    )
    assert(
      'resilience behavioral: ShoulderSafetyPanel with medication_types containing a non-string element (transitively via frozen neckAdapter.ts) renders the explicit unavailable notice instead of throwing',
      html.includes(UNAVAILABLE_TEXT),
    )
  }

  // Sanity: the "genuinely not applicable" path must still stay silent
  // (empty render), proving the HIGH-2 fix did not turn every non-match
  // into a visible notice -- only the "applicable but corrupt" case should.
  // Applicability is safety_flags.lbp (post-6th-review-fix), not
  // routing.primary_module_detail -- so null out the former to simulate
  // a genuinely LBP-unrelated record.
  {
    const p = structuredClone(lbpFixture.payload)
    p.responses.safety_flags.lbp = null
    const html = renderToString(
      React.createElement(LbpSafetyPanel, { payload: p, lbpObjectiveMotorDeficit: null }),
    )
    assert(
      'resilience behavioral: LbpSafetyPanel for a record where LBP genuinely does not apply (safety_flags.lbp == null) still renders nothing (not the notice) -- applicability and malformed-data must stay distinct outcomes',
      html === '' && !html.includes(UNAVAILABLE_TEXT),
    )
  }

  // 6th independent review HIGH-1: a record that reached LBP via the
  // Additional Detailed Concern route (routing.primary_module_detail stays
  // null on that route; only routing.additional_module_detail is set) but
  // has a REAL, already-computed safety_flags.lbp (e.g. URGENT_REVIEW from
  // cauda-equina red flags) must still render that computed status -- not
  // silently disappear because the gate used to key off
  // primary_module_detail instead of safety_flags.lbp.
  {
    const p = structuredClone(lbpFixture.payload)
    p.routing.primary_module_detail = null
    p.routing.additional_module_detail = 'LBP'
    // safety_flags.lbp is untouched -- still the fixture's real computed
    // REVIEW_REQUIRED status, exactly as coreSpec.ts would compute it for
    // this route (IS_PRIMARY_LBP depends on hasDetailedConcern, not on
    // primary_module_detail).
    const html = renderToString(
      React.createElement(LbpSafetyPanel, { payload: p, lbpObjectiveMotorDeficit: null }),
    )
    assert(
      'resilience behavioral: LbpSafetyPanel renders the real computed safety_flags.lbp status even when routing.primary_module_detail is null (Additional Detailed Concern route) -- gate must key off safety_flags.lbp, not the routing tag (6th independent review HIGH-1)',
      html.includes('안전 확인') && html.includes('허리(LBP)') && !html.includes(UNAVAILABLE_TEXT) && html !== '',
    )
  }

  /* -----------------------------------------------------------------------
   * 8th independent review HIGH-1: ShoulderSafetyPanel/KneeSafetyPanel (and
   * by the same fix, ElbowSafetyPanel/WristHandSafetyPanel/HipSafetyPanel.
   * tsx/TmjSafetyPanel.tsx/AnkleFootSafetyPanel.tsx) pass
   * `payload.flags.general_red` straight into their region's
   * `core_safety_already_urgent` state -- with hollow/legacy `flags`,
   * `general_red` reads as `undefined` (falsy), so a record whose core
   * SAFETY_01 red flag genuinely computed URGENT_REVIEW could render as an
   * affirmative "안전" instead. Every one of these panels now also
   * requires `isFlagsUsable(payload.flags, payload.responses)` before
   * computing anything -- proven here by behavioral render, not just
   * source-regex, on the two panels this bundle re-exports.
   * ---------------------------------------------------------------------- */
  {
    const shoulderFixture2 = byName('어깨 통증 주호소 (SHOULDER, 신속 의뢰 고려)')
    const p = structuredClone(shoulderFixture2.payload)
    p.flags = {}
    const html = renderToString(
      React.createElement(ShoulderSafetyPanel, { payload: p, shoulderObjectiveCuffWeakness: null }),
    )
    assert(
      'resilience behavioral: ShoulderSafetyPanel with hollow flags ({}) renders the explicit unavailable notice instead of computing a safety status from an unreadable general_red (8th independent review HIGH-1)',
      html.includes(UNAVAILABLE_TEXT),
    )
  }
  {
    const kneeFixture = byName('무릎 통증 주호소 (KNEE, 고관절 연관통 의심)')
    const p = structuredClone(kneeFixture.payload)
    p.flags = {}
    const html = renderToString(React.createElement(KneeSafetyPanel, { payload: p }))
    assert(
      'resilience behavioral: KneeSafetyPanel with hollow flags ({}) renders the explicit unavailable notice instead of computing a safety status from an unreadable general_red (8th independent review HIGH-1)',
      html.includes(UNAVAILABLE_TEXT),
    )
  }

  /* -----------------------------------------------------------------------
   * 8th independent review HIGH-3: flags can be structurally valid (all 7
   * keys boolean) yet semantically stale relative to responses (a
   * hand-edited/version-skewed record whose flags were never recomputed).
   * isFlagsUsable now recomputes general_red/gi_needs_review/
   * bowel_needs_review from responses and rejects a mismatch.
   * ---------------------------------------------------------------------- */
  {
    const shoulderFixture3 = byName('어깨 통증 주호소 (SHOULDER, 신속 의뢰 고려)')
    const p = structuredClone(shoulderFixture3.payload)
    // Structurally-valid flags (all 7 keys booleans) but general_red is
    // asserted true while the real SAFETY_01 responses report no red flag
    // -- exactly the "stale flags" scenario HIGH-3 describes.
    p.flags.general_red = true
    const html = renderToString(
      React.createElement(ShoulderSafetyPanel, { payload: p, shoulderObjectiveCuffWeakness: null }),
    )
    assert(
      'resilience behavioral: ShoulderSafetyPanel treats structurally-valid but responses-inconsistent flags (general_red=true contradicting real SAFETY_01=none) as unusable, not as a trustworthy urgent signal (8th independent review HIGH-3)',
      html.includes(UNAVAILABLE_TEXT),
    )
  }

  /* -----------------------------------------------------------------------
   * 9th independent review HIGH-1: round 8's isFlagsConsistentWithResponses
   * only recomputed general_red/gi_needs_review/bowel_needs_review --
   * requires_staff_check (a pure OR of those three, coreSpec.ts:4069) and
   * the 3 remaining keys (sleep_disorder_review/sleep_disorder_priority_
   * review/response_consistency_review, all recomputable from MS_05/MS_01/
   * WOMEN_SAFETY_01) were left unchecked. A record whose general_red/gi/
   * bowel are each individually correct but whose requires_staff_check
   * doesn't match their OR is provably corrupt yet passed round 8's check.
   * ---------------------------------------------------------------------- */
  {
    const shoulderFixture4 = byName('어깨 통증 주호소 (SHOULDER, 신속 의뢰 고려)')
    const p = structuredClone(shoulderFixture4.payload)
    // general_red/gi_needs_review/bowel_needs_review are all individually
    // correct (still match the real 'none' SAFETY_01 answer) -- only
    // requires_staff_check is stale, hiding what should be a staff-check
    // banner. Round 8's check alone would call this flags object usable.
    p.flags.requires_staff_check = true
    const html = renderToString(
      React.createElement(ShoulderSafetyPanel, { payload: p, shoulderObjectiveCuffWeakness: null }),
    )
    assert(
      'resilience behavioral: ShoulderSafetyPanel treats a requires_staff_check that contradicts general_red||gi_needs_review||bowel_needs_review as unusable, even when those three fields are each individually correct (9th independent review HIGH-1)',
      html.includes(UNAVAILABLE_TEXT),
    )
  }
  {
    const shoulderFixture5 = byName('어깨 통증 주호소 (SHOULDER, 신속 의뢰 고려)')
    const p = structuredClone(shoulderFixture5.payload)
    p.responses.modules.sleep = {
      ...(p.responses.modules.sleep ?? {}),
      menopause: { ...(p.responses.modules.sleep?.menopause ?? {}), sleep_disorder_screen: ['witnessed_apnea'] },
    }
    // A real witnessed_apnea report should set sleep_disorder_priority_review
    // true (coreSpec.ts computeFlags) -- leaving it stale false here hides a
    // genuine priority sleep-disorder screen finding, the direction round 8
    // could not detect since it never looked at MS_05 at all.
    p.flags.sleep_disorder_priority_review = false
    const html = renderToString(
      React.createElement(ShoulderSafetyPanel, { payload: p, shoulderObjectiveCuffWeakness: null }),
    )
    assert(
      'resilience behavioral: ShoulderSafetyPanel treats sleep_disorder_priority_review=false as unusable when MS_05 reports witnessed_apnea (a real finding round 8 never cross-checked) (9th independent review HIGH-1)',
      html.includes(UNAVAILABLE_TEXT),
    )
  }

  /* -----------------------------------------------------------------------
   * 9th independent review HIGH-2/HIGH-3: reproductive_status.derived can
   * never be null in a real submission, and prior rounds' truthiness gate
   * (`!payload.responses.reproductive_status.derived`) let a structurally
   * valid but STALE derived object (never recomputed after WOMEN_SAFETY_01
   * changed) pass straight through into lbpAdapter.ts's (frozen)
   * mapPregnancyStatus, which converts anything that isn't `true`/`null`
   * into an explicit "not pregnant" -- fabricating a false treatment-safety
   * clearance for a genuinely reported pregnancy. isUnreadableReproductive
   * Derived now also recomputes pregnant/postpartum_1y/breastfeeding from
   * the raw WOMEN_SAFETY_01 answer when derived.source==='WOMEN_SAFETY_01'.
   * ---------------------------------------------------------------------- */
  {
    const lbpFixture2 = byName('허리 통증 주호소 (LBP, 확인 필요)')
    const p = structuredClone(lbpFixture2.payload)
    p.responses.reproductive_status.reproductive_status = ['pregnant']
    // Structurally valid derived (all fields correctly typed) but stale --
    // raw still reflects some earlier, different answer, and pregnant
    // was never recomputed to true.
    p.responses.reproductive_status.derived = {
      source: 'WOMEN_SAFETY_01',
      raw: ['menopause'],
      pregnant: false,
      pregnancy_possible: false,
      postpartum_1y: false,
      breastfeeding: false,
    }
    const html = renderToString(
      React.createElement(LbpSafetyPanel, { payload: p, lbpObjectiveMotorDeficit: null }),
    )
    assert(
      'resilience behavioral: LbpSafetyPanel renders the explicit unavailable notice (not a computed 치료 안전 status) when reproductive_status.derived is structurally valid but stale relative to a real reported pregnancy (9th independent review HIGH-2/HIGH-3)',
      html.includes(UNAVAILABLE_TEXT),
    )
  }

  /* -----------------------------------------------------------------------
   * 10th independent review LOW-1: isUnreadableReproductiveDerived's raw-vs-
   * derived consistency check (added in round 9 for HIGH-3) was
   * one-directional -- it only caught "raw asserts X but derived denies it".
   * The reverse ("derived asserts X but raw never reported it") returned
   * "consistent", so a stale derived object could FABRICATE a pregnancy/
   * postpartum/breastfeeding fact that was never actually reported (this
   * batch's core invariant #2: never invent a clinical fact). pregnant/
   * postpartum_1y/breastfeeding have no legitimate cross-module override
   * (unlike pregnancy_possible, which PREGNANCY_01==='possible' can
   * legitimately set true even without WOMEN_SAFETY_01 asserting it), so
   * this direction is unconditionally checked now.
   * ------------------------------------------------------------------- */
  {
    const lbpFixture3 = byName('허리 통증 주호소 (LBP, 확인 필요)')
    const p = structuredClone(lbpFixture3.payload)
    p.responses.reproductive_status.reproductive_status = ['none']
    p.responses.reproductive_status.derived = {
      source: 'WOMEN_SAFETY_01',
      raw: ['none'],
      pregnant: true,
      pregnancy_possible: false,
      postpartum_1y: false,
      breastfeeding: false,
    }
    assert(
      'resilience: isUnreadableReproductiveDerived catches a derived.pregnant=true that raw never reported (10th independent review LOW-1)',
      isUnreadableReproductiveDerived(p.responses) === true,
    )
  }
  {
    const lbpFixture4 = byName('허리 통증 주호소 (LBP, 확인 필요)')
    const p = structuredClone(lbpFixture4.payload)
    p.responses.reproductive_status.reproductive_status = ['none']
    p.responses.reproductive_status.derived = {
      source: 'WOMEN_SAFETY_01',
      raw: ['none'],
      pregnant: false,
      pregnancy_possible: false,
      postpartum_1y: true,
      breastfeeding: false,
    }
    assert(
      'resilience: isUnreadableReproductiveDerived catches a derived.postpartum_1y=true that raw never reported',
      isUnreadableReproductiveDerived(p.responses) === true,
    )
  }
  {
    // Sanity: a genuinely consistent derived (matches raw exactly) is still accepted.
    const lbpFixture5 = byName('허리 통증 주호소 (LBP, 확인 필요)')
    const p = structuredClone(lbpFixture5.payload)
    p.responses.reproductive_status.reproductive_status = ['pregnant']
    p.responses.reproductive_status.derived = {
      source: 'WOMEN_SAFETY_01',
      raw: ['pregnant'],
      pregnant: true,
      pregnancy_possible: false,
      postpartum_1y: false,
      breastfeeding: false,
    }
    assert(
      'resilience: isUnreadableReproductiveDerived does not false-positive on a genuinely consistent derived object',
      isUnreadableReproductiveDerived(p.responses) === false,
    )
  }

  /* -----------------------------------------------------------------------
   * 11th independent review MEDIUM-1: rounds 9/10 exempted
   * derived.source==='pregnancy_module'/'postpartum_module' entirely from
   * the raw-vs-derived consistency check, reasoning they "cannot be
   * recomputed from this field" -- but coreSpec.ts's deriveReproductiveStatus
   * (lines ~3820-3891) DOES compute both deterministically:
   * pregnancy_module only ever fires when visit_goal.women_goal==='pregnancy'
   * AND modules.pregnancy.status==='pregnant' (PREGNANCY_01), always
   * producing the fixed shape {raw:['pregnant'], pregnant:true,
   * pregnancy_possible:false, postpartum_1y:null, breastfeeding:null}.
   * postpartum_module only fires when visit_goal.women_goal==='postpartum',
   * with postpartum_1y/breastfeeding recomputed from
   * modules.postpartum.time_since_delivery/breastfeeding_status
   * (POSTPARTUM_01/03). A record claiming either source outside its real
   * context, or with a shape that doesn't match what those raw fields
   * actually recompute to, fabricates a pregnancy/postpartum fact that was
   * never reported.
   * ------------------------------------------------------------------- */
  {
    const pregnancyFixture = byName('임신 상담')
    assert(
      'resilience: isUnreadableReproductiveDerived accepts the genuine pregnancy_module derived object exactly as coreSpec.ts computed it (11th independent review MEDIUM-1)',
      isUnreadableReproductiveDerived(pregnancyFixture.payload.responses) === false,
    )
  }
  {
    // Same well-formed pregnancy_module shape, but spliced onto a record
    // whose visit_goal is NOT the pregnancy module (a plain LBP fixture) --
    // this is exactly the fabrication this fix closes.
    const lbpFixture6 = byName('허리 통증 주호소 (LBP, 확인 필요)')
    const p = structuredClone(lbpFixture6.payload)
    p.responses.reproductive_status.derived = {
      source: 'pregnancy_module',
      raw: ['pregnant'],
      pregnant: true,
      pregnancy_possible: false,
      postpartum_1y: null,
      breastfeeding: null,
    }
    assert(
      'resilience: isUnreadableReproductiveDerived rejects a derived.source="pregnancy_module" claimed outside any pregnancy visit context (11th independent review MEDIUM-1)',
      isUnreadableReproductiveDerived(p.responses) === true,
    )
  }
  {
    // Genuine pregnancy context, but the shape deviates from the one fixed
    // shape coreSpec.ts always produces for this source.
    const pregnancyFixture2 = byName('임신 상담')
    const p = structuredClone(pregnancyFixture2.payload)
    p.responses.reproductive_status.derived.breastfeeding = true
    assert(
      'resilience: isUnreadableReproductiveDerived rejects a pregnancy_module derived object that deviates from the one fixed shape coreSpec.ts always produces for it',
      isUnreadableReproductiveDerived(p.responses) === true,
    )
  }
  {
    const postpartumFixture = byName('산후 회복')
    assert(
      'resilience: isUnreadableReproductiveDerived accepts the genuine postpartum_module derived object exactly as coreSpec.ts recomputed it from POSTPARTUM_01/03 (11th independent review MEDIUM-1)',
      isUnreadableReproductiveDerived(postpartumFixture.payload.responses) === false,
    )
  }
  {
    const lbpFixture7 = byName('허리 통증 주호소 (LBP, 확인 필요)')
    const p = structuredClone(lbpFixture7.payload)
    p.responses.reproductive_status.derived = {
      source: 'postpartum_module',
      raw: ['6w_to_3m', 'yes'],
      pregnant: null,
      pregnancy_possible: null,
      postpartum_1y: true,
      breastfeeding: true,
    }
    assert(
      'resilience: isUnreadableReproductiveDerived rejects a derived.source="postpartum_module" claimed outside any postpartum visit context (11th independent review MEDIUM-1)',
      isUnreadableReproductiveDerived(p.responses) === true,
    )
  }
  {
    // Genuine postpartum context, but postpartum_1y contradicts what
    // POSTPARTUM_01='6w_to_3m' actually recomputes to (must be true).
    const postpartumFixture2 = byName('산후 회복')
    const p = structuredClone(postpartumFixture2.payload)
    p.responses.reproductive_status.derived.postpartum_1y = false
    assert(
      'resilience: isUnreadableReproductiveDerived rejects a postpartum_module derived.postpartum_1y that contradicts what POSTPARTUM_01 actually recomputes to',
      isUnreadableReproductiveDerived(p.responses) === true,
    )
  }

  /* -----------------------------------------------------------------------
   * 12차 독립 리뷰 HIGH-1: derived.source가 세 값(WOMEN_SAFETY_01/
   * pregnancy_module/postpartum_module) + null 중 무엇과도 일치하지 않는
   * wrong-typed/엉뚱한 값이면, 이전 구현은 어떤 if/else if 분기에도 안
   * 걸려 마지막 `return false`까지 통과했다 -- 즉 "정상"으로 판정되어
   * lbpAdapter.ts의 mapPregnancyStatus가 pregnant/pregnancy_possible을
   * false로 읽어, 실제 임신/수유를 보고한 환자에게 명시적 음성 소견을
   * 지어낼 수 있었다.
   * ------------------------------------------------------------------- */
  {
    const lbpFixture8 = byName('허리 통증 주호소 (LBP, 확인 필요)')
    const p = structuredClone(lbpFixture8.payload)
    p.responses.reproductive_status.reproductive_status = ['pregnant', 'breastfeeding']
    p.responses.reproductive_status.derived = {
      source: ['WOMEN_SAFETY_01'],
      raw: ['pregnant', 'breastfeeding'],
      pregnant: false,
      pregnancy_possible: false,
      postpartum_1y: false,
      breastfeeding: false,
    }
    assert(
      'resilience: isUnreadableReproductiveDerived rejects a wrong-typed (array) derived.source instead of matching no branch and falling through as "consistent" (12th independent review HIGH-1)',
      isUnreadableReproductiveDerived(p.responses) === true,
    )
  }
  {
    const lbpFixture9 = byName('허리 통증 주호소 (LBP, 확인 필요)')
    const p = structuredClone(lbpFixture9.payload)
    p.responses.reproductive_status.reproductive_status = ['pregnant']
    p.responses.reproductive_status.derived = {
      source: 'women_safety_01',
      raw: ['pregnant'],
      pregnant: false,
      pregnancy_possible: false,
      postpartum_1y: false,
      breastfeeding: false,
    }
    assert(
      'resilience: isUnreadableReproductiveDerived rejects a near-miss bogus string derived.source (12th independent review HIGH-1)',
      isUnreadableReproductiveDerived(p.responses) === true,
    )
  }

  /* -----------------------------------------------------------------------
   * 12차 독립 리뷰 HIGH-2: 이전 구현은 "source가 pregnancy_module/
   * postpartum_module이면 컨텍스트가 실제로 그런가"만 검사했지, 반대
   * 방향("컨텍스트가 실제로 임신/산후인데 source가 WOMEN_SAFETY_01이거나
   * null인가")은 전혀 검사하지 않았다 -- 실제 임신/산후 컨텍스트에서
   * source를 WOMEN_SAFETY_01로 남겨두고 모든 필드를 false로 채운
   * stale/조작된 레코드가 그대로 "정상"으로 통과해 동일한 허위 음성
   * 소견을 만들 수 있었다.
   * ------------------------------------------------------------------- */
  {
    const pregnancyFixture3 = byName('임신 상담')
    const p = structuredClone(pregnancyFixture3.payload)
    // 실제 임신 컨텍스트(visit_goal.women_goal==='pregnancy' &&
    // modules.pregnancy.status==='pregnant')는 그대로 두고, source만
    // WOMEN_SAFETY_01로 바꿔 컨텍스트↔source 반대 방향 불일치를 만든다.
    p.responses.reproductive_status.reproductive_status = ['none']
    p.responses.reproductive_status.derived = {
      source: 'WOMEN_SAFETY_01',
      raw: ['none'],
      pregnant: false,
      pregnancy_possible: false,
      postpartum_1y: false,
      breastfeeding: false,
    }
    assert(
      'resilience: isUnreadableReproductiveDerived rejects a genuine pregnancy context whose source is claimed to be WOMEN_SAFETY_01 instead of pregnancy_module (12th independent review HIGH-2)',
      isUnreadableReproductiveDerived(p.responses) === true,
    )
  }
  {
    const postpartumFixture3 = byName('산후 회복')
    const p = structuredClone(postpartumFixture3.payload)
    p.responses.reproductive_status.reproductive_status = ['none']
    p.responses.reproductive_status.derived = {
      source: 'WOMEN_SAFETY_01',
      raw: ['none'],
      pregnant: false,
      pregnancy_possible: false,
      postpartum_1y: false,
      breastfeeding: false,
    }
    assert(
      'resilience: isUnreadableReproductiveDerived rejects a genuine postpartum context whose source is claimed to be WOMEN_SAFETY_01 instead of postpartum_module (12th independent review HIGH-2)',
      isUnreadableReproductiveDerived(p.responses) === true,
    )
  }

  /* -----------------------------------------------------------------------
   * 13차 독립 리뷰 HIGH-1: coreSpec.ts deriveReproductiveStatus only ever
   * produces source==='WOMEN_SAFETY_01' when Array.isArray(answer) is true
   * -- that source paired with a non-array raw answer (a legacy
   * single-select string, e.g. 'pregnant') is a combination
   * deriveReproductiveStatus itself can never produce. The previous
   * implementation fell through the Array.isArray(rawAnswer) guard and
   * treated it as "consistent", letting an actually-reported pregnancy be
   * rendered as an explicit "임신 중: 아니요" negative.
   * ------------------------------------------------------------------- */
  {
    const lbpFixture10 = byName('허리 통증 주호소 (LBP, 확인 필요)')
    const p = structuredClone(lbpFixture10.payload)
    p.responses.reproductive_status.reproductive_status = 'pregnant'
    p.responses.reproductive_status.derived = {
      source: 'WOMEN_SAFETY_01',
      raw: 'pregnant',
      pregnant: false,
      pregnancy_possible: false,
      postpartum_1y: false,
      breastfeeding: false,
    }
    assert(
      'resilience: isUnreadableReproductiveDerived rejects source="WOMEN_SAFETY_01" paired with a non-array raw answer (legacy single-select) -- deriveReproductiveStatus can never produce this combination (13th independent review HIGH-1)',
      isUnreadableReproductiveDerived(p.responses) === true,
    )
  }

  /* -----------------------------------------------------------------------
   * 13차 독립 리뷰 LOW-3: a raw reproductive answer that exists (non-null,
   * non-undefined) but is not an array -- so deriveReproductiveStatus's
   * `Array.isArray(answer)` check fails and it produces the same
   * source:null/all-null object it would for a patient who was never asked
   * -- is NOT "doesn't apply", it is "answered but never processed". The
   * previous implementation treated source:null as always meaning
   * "genuinely not applicable" regardless of whether a raw answer existed,
   * silently dropping the patient's own reported (legacy-format) answer.
   * ------------------------------------------------------------------- */
  {
    const lbpFixture11 = byName('허리 통증 주호소 (LBP, 확인 필요)')
    const p = structuredClone(lbpFixture11.payload)
    p.responses.reproductive_status.reproductive_status = 'pregnant'
    p.responses.reproductive_status.derived = {
      source: null,
      raw: null,
      pregnant: null,
      pregnancy_possible: null,
      postpartum_1y: null,
      breastfeeding: null,
    }
    assert(
      'resilience: isUnreadableReproductiveDerived rejects a non-array raw answer that exists paired with derived.source===null -- this is "answered but unprocessed", not "doesn\'t apply" (13th independent review LOW-3)',
      isUnreadableReproductiveDerived(p.responses) === true,
    )
  }
  {
    // Sanity: a genuinely never-asked patient (raw is null, not merely
    // non-array) with source:null must still read as consistent/readable --
    // the LOW-3 fix must not turn every male-patient/no-report record into
    // a false "cannot read" warning.
    const lbpFixture12 = byName('허리 통증 주호소 (LBP, 확인 필요)')
    const p = structuredClone(lbpFixture12.payload)
    p.responses.reproductive_status.reproductive_status = null
    p.responses.reproductive_status.derived = {
      source: null,
      raw: null,
      pregnant: null,
      pregnancy_possible: null,
      postpartum_1y: null,
      breastfeeding: null,
    }
    assert(
      'resilience: isUnreadableReproductiveDerived does NOT false-positive when raw is genuinely null (never asked/answered) and source is null (13th independent review LOW-3 sanity check)',
      isUnreadableReproductiveDerived(p.responses) === false,
    )
  }

  /* -----------------------------------------------------------------------
   * 14차 독립 리뷰 HIGH-2: WOMEN_SAFETY_01은 coreSpec.ts에서 `required: true`
   * `multi_choice`이고, QuestionScreen.tsx의 isAnswered가
   * `Array.isArray(value) && value.length > 0`을 요구하므로 앱을 거친 실제
   * 제출은 이 배열이 절대 비어있거나 무효한 원소를 가질 수 없다 -- `[]`/
   * `["zzz"]`(옵션 목록에 없는 값)/`[{}]`(원소가 문자열이 아님)는 전부
   * deriveReproductiveStatus가 절대 만들 수 없는 손상이다. 이전 구현은
   * 멤버십만 검사해서(`rawSet.has(...)`) 이 세 경우 모두 어떤 검사도
   * 걸리지 않고 "정상"으로 통과시켰다 -- 화면에서 `["none"]`(진짜 미해당)과
   * 구별 불가능했다(governing task 정책 2 위반).
   * ------------------------------------------------------------------- */
  {
    const lbpFixture13 = byName('허리 통증 주호소 (LBP, 확인 필요)')
    const p = structuredClone(lbpFixture13.payload)
    p.responses.reproductive_status.reproductive_status = []
    p.responses.reproductive_status.derived = {
      source: 'WOMEN_SAFETY_01',
      raw: [],
      pregnant: false,
      pregnancy_possible: false,
      postpartum_1y: false,
      breastfeeding: false,
    }
    assert(
      'resilience: isUnreadableReproductiveDerived rejects an empty WOMEN_SAFETY_01 raw array -- QuestionScreen.tsx\'s isAnswered can never produce this through the app, so it is corruption, not "해당 없음" (14th independent review HIGH-2)',
      isUnreadableReproductiveDerived(p.responses) === true,
    )
  }
  {
    const lbpFixture14 = byName('허리 통증 주호소 (LBP, 확인 필요)')
    const p = structuredClone(lbpFixture14.payload)
    p.responses.reproductive_status.reproductive_status = ['zzz']
    p.responses.reproductive_status.derived = {
      source: 'WOMEN_SAFETY_01',
      raw: ['zzz'],
      pregnant: false,
      pregnancy_possible: false,
      postpartum_1y: false,
      breastfeeding: false,
    }
    assert(
      'resilience: isUnreadableReproductiveDerived rejects a WOMEN_SAFETY_01 raw array containing a value outside the declared option set (14th independent review HIGH-2)',
      isUnreadableReproductiveDerived(p.responses) === true,
    )
  }
  {
    const lbpFixture15 = byName('허리 통증 주호소 (LBP, 확인 필요)')
    const p = structuredClone(lbpFixture15.payload)
    p.responses.reproductive_status.reproductive_status = [{}]
    p.responses.reproductive_status.derived = {
      source: 'WOMEN_SAFETY_01',
      raw: [{}],
      pregnant: false,
      pregnancy_possible: false,
      postpartum_1y: false,
      breastfeeding: false,
    }
    assert(
      'resilience: isUnreadableReproductiveDerived rejects a WOMEN_SAFETY_01 raw array containing a non-string element (14th independent review HIGH-2)',
      isUnreadableReproductiveDerived(p.responses) === true,
    )
  }
  {
    // Sanity: a genuine negative (["none"]) must still read as consistent --
    // the HIGH-2 fix must not turn a real "해당 없음" answer into a false
    // "cannot read" warning.
    const lbpFixture16 = byName('허리 통증 주호소 (LBP, 확인 필요)')
    const p = structuredClone(lbpFixture16.payload)
    p.responses.reproductive_status.reproductive_status = ['none']
    p.responses.reproductive_status.derived = {
      source: 'WOMEN_SAFETY_01',
      raw: ['none'],
      pregnant: false,
      pregnancy_possible: false,
      postpartum_1y: false,
      breastfeeding: false,
    }
    assert(
      'resilience: isUnreadableReproductiveDerived does NOT false-positive on a genuine ["none"] answer (14th independent review HIGH-2 sanity check)',
      isUnreadableReproductiveDerived(p.responses) === false,
    )
  }

  /* -----------------------------------------------------------------------
   * 15차 독립 리뷰 HIGH-2: POSTPARTUM_01(time_since_delivery)/POSTPARTUM_03
   * (breastfeeding_status)는 postpartum 컨텍스트에서 항상 물어보는
   * `required: true` single_choice라서, 실제 제출은 이 값이 옵션 목록
   * 밖일 수 없다. 옵션 밖 문자열은 `POSTPARTUM_WITHIN_1Y.includes(...)`/
   * `=== 'yes' || === 'mixed'` 비교에서 그냥 false가 되므로, 14차가
   * WOMEN_SAFETY_01에 적용한 것과 동일한 클래스의 fail-open이
   * postpartum_module 분기에 그대로 남아있었다 -- 손상된 raw 답변에
   * 대해서도 "출산 후 1년 이내: 아니요/모유수유 중: 아니요"를 계산해
   * 보여줬다.
   * ------------------------------------------------------------------- */
  {
    const postpartumFixture4 = byName('산후 회복')
    const p = structuredClone(postpartumFixture4.payload)
    p.responses.modules.postpartum.time_since_delivery = 'ZZZ'
    // coreSpec.ts가 실제로 계산했다면 옵션 밖 값에 대해 postpartum_1y는
    // false가 된다 -- 이 test는 바로 그 "구조적으로는 자기 자신과
    // 일치하는" 손상 케이스를 재현한다.
    p.responses.reproductive_status.derived.postpartum_1y = false
    assert(
      'resilience: isUnreadableReproductiveDerived rejects an out-of-option-set POSTPARTUM_01(time_since_delivery) value instead of silently recomputing postpartum_1y=false from it (15th independent review HIGH-2)',
      isUnreadableReproductiveDerived(p.responses) === true,
    )
  }
  {
    const postpartumFixture5 = byName('산후 회복')
    const p = structuredClone(postpartumFixture5.payload)
    p.responses.modules.postpartum.breastfeeding_status = 'ZZZ'
    p.responses.reproductive_status.derived.breastfeeding = false
    assert(
      'resilience: isUnreadableReproductiveDerived rejects an out-of-option-set POSTPARTUM_03(breastfeeding_status) value instead of silently recomputing breastfeeding=false from it (15th independent review HIGH-2)',
      isUnreadableReproductiveDerived(p.responses) === true,
    )
  }
  {
    // Sanity: the genuine fixture (real option-set values) must still read
    // as consistent -- the HIGH-2 fix must not reject legitimate
    // POSTPARTUM_01/03 answers.
    const postpartumFixture6 = byName('산후 회복')
    assert(
      'resilience: isUnreadableReproductiveDerived does NOT false-positive on genuine in-option-set POSTPARTUM_01/03 values (15th independent review HIGH-2 sanity check)',
      isUnreadableReproductiveDerived(postpartumFixture6.payload.responses) === false,
    )
  }

  /* -----------------------------------------------------------------------
   * 16차 독립 리뷰 HIGH-1: coreSpec.ts deriveReproductiveStatus는
   * key==='pregnancy' && PREGNANCY_01==='possible'일 때 WOMEN_SAFETY_01
   * 응답에 'pregnancy_possible'이 없어도 pregnancy_possible을 true로
   * override한다(난임/임신 준비 상담에서 안전 정보 누락 방지) -- 지금까지의
   * 모든 raw-derived 일관성 검사는 이 override 방향을 전혀 검사하지 않아,
   * 손상된 derived.pregnancy_possible=false/null이 실제 override로 만들어진
   * true와 화면상 구별되지 않고 "정상" 판정을 받았다.
   * ------------------------------------------------------------------- */
  {
    const pregnancyFixture1 = byName('임신 상담')
    const p = structuredClone(pregnancyFixture1.payload)
    p.responses.modules.pregnancy.status = 'possible'
    p.responses.reproductive_status.reproductive_status = ['none']
    p.responses.reproductive_status.derived = {
      source: 'WOMEN_SAFETY_01',
      raw: ['none'],
      pregnant: false,
      // coreSpec.ts가 실제로 계산했다면 PREGNANCY_01==='possible' override로
      // true가 되어야 한다 -- 이 test는 그 override를 무시한 손상된 false를
      // 재현한다.
      pregnancy_possible: false,
      postpartum_1y: false,
      breastfeeding: false,
    }
    assert(
      'resilience: isUnreadableReproductiveDerived rejects a corrupted derived.pregnancy_possible=false when PREGNANCY_01==="possible" should have overridden it to true (16th independent review HIGH-1)',
      isUnreadableReproductiveDerived(p.responses) === true,
    )
  }
  {
    // Same override, but through the WOMEN_SAFETY_01===['unknown']-only
    // branch, whose expected pregnancy_possible was previously hardcoded to
    // null regardless of the module override.
    const pregnancyFixture2 = byName('임신 상담')
    const p = structuredClone(pregnancyFixture2.payload)
    p.responses.modules.pregnancy.status = 'possible'
    p.responses.reproductive_status.reproductive_status = ['unknown']
    p.responses.reproductive_status.derived = {
      source: 'WOMEN_SAFETY_01',
      raw: ['unknown'],
      pregnant: null,
      pregnancy_possible: null,
      postpartum_1y: null,
      breastfeeding: null,
    }
    assert(
      'resilience: isUnreadableReproductiveDerived rejects a corrupted derived.pregnancy_possible=null in the unknown-only branch when PREGNANCY_01==="possible" should have overridden it to true (16th independent review HIGH-1)',
      isUnreadableReproductiveDerived(p.responses) === true,
    )
  }
  {
    // Sanity: the genuine override-produced shape (pregnancy_possible=true
    // despite raw never including it) must NOT be rejected.
    const pregnancyFixture3 = byName('임신 상담')
    const p = structuredClone(pregnancyFixture3.payload)
    p.responses.modules.pregnancy.status = 'possible'
    p.responses.reproductive_status.reproductive_status = ['none']
    p.responses.reproductive_status.derived = {
      source: 'WOMEN_SAFETY_01',
      raw: ['none'],
      pregnant: false,
      pregnancy_possible: true,
      postpartum_1y: false,
      breastfeeding: false,
    }
    assert(
      'resilience: isUnreadableReproductiveDerived does NOT false-positive on the genuine PREGNANCY_01==="possible" module-override shape (16th independent review HIGH-1 sanity check)',
      isUnreadableReproductiveDerived(p.responses) === false,
    )
  }
  {
    // An out-of-option-set PREGNANCY_01 value must also fail closed (same
    // class of guard as POSTPARTUM_01/03 in round 15).
    const pregnancyFixture4 = byName('임신 상담')
    const p = structuredClone(pregnancyFixture4.payload)
    p.responses.modules.pregnancy.status = 'ZZZ'
    p.responses.reproductive_status.reproductive_status = ['none']
    p.responses.reproductive_status.derived = {
      source: 'WOMEN_SAFETY_01',
      raw: ['none'],
      pregnant: false,
      pregnancy_possible: false,
      postpartum_1y: false,
      breastfeeding: false,
    }
    assert(
      'resilience: isUnreadableReproductiveDerived rejects an out-of-option-set PREGNANCY_01(modules.pregnancy.status) value (16th independent review HIGH-1)',
      isUnreadableReproductiveDerived(p.responses) === true,
    )
  }
}

/* -------------------------------------------------------------------------
 * 12차 독립 리뷰 HIGH-3/MEDIUM-1: MyungriCompactCard/sajuStatusLine은
 * saju(myungri_calculation)의 pillars/normalized/unresolved_reason을
 * 검증 없이 렌더한다 -- server/index.js가 `body.myungri_calculation ??
 * null`로 저장하고 isDoctorPayloadShapeUsable은 top-level 키만 검사할 뿐
 * 이 leaf들은 검증하지 않는다. pillars.day가 wrong-typed(number)면
 * `!saju.pillars?.day`(truthy 체크)를 통과해 `.charAt(0)`에서 그대로
 * 크래시했고(HIGH-3, DoctorRecordErrorBoundary가 CommonSafetyBanner/모든
 * SafetyPanel까지 함께 감싸므로 전체 임상 화면이 날아간다), pillars.year/
 * normalized.solarDate.month 등이 wrong-typed면 "[object Object]"를 그대로
 * 노출했다(MEDIUM-1).
 * ---------------------------------------------------------------------- */
{
  const baseSaju = byName('허리 통증 주호소 (LBP, 확인 필요)').payload.myungri_calculation

  {
    const saju = structuredClone(baseSaju)
    saju.pillars.day = 42
    const html = renderToString(React.createElement(MyungriCompactCard, { saju }))
    assert(
      'resilience: MyungriCompactCard never crashes when saju.pillars.day is wrong-typed (number) -- shows the explicit fail-closed label instead of calling .charAt on a non-string (12th independent review HIGH-3)',
      html.includes('확인 필요(값 형식 오류)'),
    )
  }
  {
    const saju = structuredClone(baseSaju)
    saju.pillars.day = { corrupted: true }
    const html = renderToString(React.createElement(MyungriCompactCard, { saju }))
    assert(
      'resilience: MyungriCompactCard never crashes when saju.pillars.day is wrong-typed (object) (12th independent review HIGH-3)',
      html.includes('확인 필요(값 형식 오류)') && !html.includes('[object Object]'),
    )
  }
  {
    const saju = structuredClone(baseSaju)
    saju.pillars.year = ['甲', '子']
    const html = renderToString(React.createElement(MyungriCompactCard, { saju }))
    assert(
      'resilience: MyungriCompactCard never fabricates a plausible-looking pillar from a wrong-typed (array) saju.pillars.year -- shows the fail-closed label instead (12th independent review MEDIUM-1)',
      html.includes('확인 필요(값 형식 오류)') && !html.includes('甲子'),
    )
  }
  {
    // Batch 4.1-B (§16.3/§15.4): the "명리 검토"(judgment__reviewGrid)
    // inline block this sub-test used to structurally verify (정규화된
    // 양력 날짜 / pillars 그리드, via datePartText/computedText) was
    // removed from DoctorView.tsx entirely -- along with datePartText
    // itself, whose only caller that block was. Replaces the structural
    // regex checks (now meaningless: the text they matched no longer
    // exists) with confirmation that the dead helper was actually swept,
    // not just its call site -- a T6 companion (see T6 below for the
    // full removed-string list).
    const doctorViewSrc = await readFile(
      fileURLToPath(new URL('../src/doctor/DoctorView.tsx', import.meta.url)),
      'utf8',
    )
    assert(
      'T6 companion: DoctorView.tsx no longer defines datePartText (its only caller, the "명리 검토" reviewGrid, was removed with it)',
      !doctorViewSrc.includes('function datePartText('),
    )
  }
  {
    const saju = structuredClone(baseSaju)
    saju.status = 'unresolved'
    saju.pillars = null
    saju.unresolved_reason = { corrupted: true }
    const html = renderToString(React.createElement(MyungriCompactCard, { saju }))
    assert(
      'resilience: MyungriCompactCard never leaks "[object Object]" from a wrong-typed saju.unresolved_reason (12th independent review MEDIUM-1)',
      !html.includes('[object Object]'),
    )
    const line = sajuStatusLine(saju)
    assert(
      'resilience: sajuStatusLine never leaks "[object Object]" from a wrong-typed saju.unresolved_reason',
      !line.text.includes('[object Object]') && line.text.includes('확인 필요(값 형식 오류)'),
    )
  }

  /* ---------------------------------------------------------------------
   * 13차 독립 리뷰 MEDIUM-2: `asArray<string>(saju.policy.pending_approval)`
   * only validates the container is an array -- an individual element that
   * is wrong-typed (e.g. an object) passed straight through .join(', ')
   * would render "[object Object]" in the 계산주의 line. readableStringArray
   * now maps each non-string element to the fail-closed token first.
   * --------------------------------------------------------------------- */
  {
    const saju = structuredClone(baseSaju)
    saju.policy.pending_approval = ['day_boundary', { corrupted: true }, 42]
    const html = renderToString(React.createElement(MyungriCompactCard, { saju }))
    assert(
      'resilience: MyungriCompactCard never leaks "[object Object]" from a wrong-typed element inside saju.policy.pending_approval -- shows the fail-closed token for that element instead (13th independent review MEDIUM-2)',
      !html.includes('[object Object]') && html.includes('확인 필요(값 형식 오류)'),
    )
  }

  /* ---------------------------------------------------------------------
   * 13차 독립 리뷰 LOW-1: `saju.flags.hour_unknown`가 boolean이 아니면
   * (레거시 레코드는 flags 자체가 {}일 수 있음) 이전 구현은 falsy 값이면
   * 무조건 "출생시간 확인됨"으로 단정했다. 명시적 boolean일 때만 그
   * 사실을 말하고, 그 외엔 실패 토큰을 보여준다.
   * --------------------------------------------------------------------- */
  {
    const saju = structuredClone(baseSaju)
    saju.flags = {}
    const html = renderToString(React.createElement(MyungriCompactCard, { saju }))
    assert(
      'resilience: MyungriCompactCard never fabricates "출생시간 확인됨" when saju.flags.hour_unknown is missing (not boolean) -- shows the fail-closed token instead (13th independent review LOW-1)',
      !html.includes('출생시간 확인됨') && html.includes('확인 필요(값 형식 오류)'),
    )
  }
  {
    const saju = structuredClone(baseSaju)
    saju.flags = { hour_unknown: 'yes' }
    const html = renderToString(React.createElement(MyungriCompactCard, { saju }))
    assert(
      'resilience: MyungriCompactCard never fabricates a birth-time fact from a wrong-typed (string) hour_unknown -- shows the fail-closed token instead (13th independent review LOW-1)',
      !html.includes('출생시간 확인됨') && !html.includes('출생시간 미상') && html.includes('확인 필요(값 형식 오류)'),
    )
  }
  {
    const saju = structuredClone(baseSaju)
    saju.flags = { hour_unknown: true }
    const html = renderToString(React.createElement(MyungriCompactCard, { saju }))
    assert(
      'resilience: MyungriCompactCard shows the genuine 출생시간 미상 line when hour_unknown is really boolean true',
      html.includes('출생시간 미상'),
    )
  }
  {
    const saju = structuredClone(baseSaju)
    saju.flags = { hour_unknown: false }
    const html = renderToString(React.createElement(MyungriCompactCard, { saju }))
    assert(
      'resilience: MyungriCompactCard shows the genuine 출생시간 확인됨 line when hour_unknown is really boolean false',
      html.includes('출생시간 확인됨'),
    )
  }
}

/* -------------------------------------------------------------------------
 * 12차 독립 리뷰 HIGH-4/MEDIUM-2/LOW-1: DoctorView.tsx는
 * routing.primary_module/routing.additional_module을 검증 없이 직접
 * React 자식/템플릿 리터럴로 렌더한다(server/index.js가 `routing:
 * body.routing ?? null`로 저장, isDoctorPayloadShapeUsable은
 * isPlainObject(payload.routing)만 확인할 뿐 leaf는 검증하지 않는다).
 * wrong-typed 객체는 "Objects are not valid as a React child" 예외를
 * 던져 CommonSafetyBanner/모든 SafetyPanel을 포함한 전체 임상 화면을
 * 날렸고(HIGH-4), 배열은 React가 그대로 이어붙이거나(주호소 모듈:
 * PainSleep) 템플릿 리터럴에서 CSV로 새서(상세 증상 — Pain,Sleep)
 * 임상 텍스트에 원시 배열이 그대로 노출됐다(MEDIUM-2). LOW-1은
 * `routing.additional_module`의 truthy 체크가 wrong-typed 객체도
 * "있음"으로 통과시켜, 진료 탭(additionalConcern.ts, 타입 검사로 이미
 * null 반환)과 자료 탭이 같은 레코드에서 서로 모순되는 걸 막는다.
 * DoctorView.tsx 메인 렌더 블록은 별도 컴포넌트로 export되어 있지 않아
 * (MyungriCompactCard와 달리) 독립적으로 렌더할 수 없으므로, 실제 수정이
 * 소스에 반영됐는지 구조 확인으로 검증한다 -- behavioral 검증은 실사용
 * 재검증(live Playwright repro)으로 수행.
 * ---------------------------------------------------------------------- */
{
  const doctorViewSrc = await readFile(fileURLToPath(new URL('../src/doctor/DoctorView.tsx', import.meta.url)), 'utf8')
  assert(
    'resilience: DoctorView.tsx의 "시스템 라우팅 — 주호소 모듈" 줄이 computedText(routing.primary_module)을 거친다 (bare routing.primary_module 대신, 12th independent review HIGH-4/MEDIUM-2)',
    /시스템 라우팅 — 주호소 모듈: \{computedText\(routing\.primary_module\) \?\? '없음'\}/.test(doctorViewSrc),
  )
  assert(
    'resilience: DoctorView.tsx의 "상세 증상" 소제목이 computedText(routing.primary_module)을 거친다 (bare routing.primary_module 대신, 12th independent review HIGH-4/MEDIUM-2)',
    /상세 증상\{computedText\(routing\.primary_module\) \? ` — \$\{computedText\(routing\.primary_module\)\}` : ''\}/.test(
      doctorViewSrc,
    ),
  )
  assert(
    'resilience: DoctorView.tsx의 "추가 상세상담" 섹션이 typeof routing.additional_module === "string" 타입 검사를 쓴다 (truthy 체크 대신, 12th independent review LOW-1)',
    /typeof routing\.additional_module === 'string' && routing\.additional_module !== ''/.test(doctorViewSrc),
  )
  assert(
    'resilience: computedText는 string/number가 아니면(그리고 null/undefined도 아니면) 명시적 실패 토큰을 반환하고, 원문을 String()으로 지어내지 않는다',
    /function computedText\(value: unknown\): string \| null \{[\s\S]{0,200}return UNREADABLE_COMPUTED_VALUE/.test(
      doctorViewSrc,
    ),
  )

  /*
   * 13차 독립 리뷰 MEDIUM-2/MEDIUM-3: `asArray<string>(...)`는 컨테이너가
   * 배열인지만 검사할 뿐 원소 타입은 보장하지 않는다 -- routing.
   * secondary_screens/saju.policy.pending_approval처럼 검증되지 않은 저장
   * 데이터에서 온 배열을 그대로 .join(', ')하면 wrong-typed 원소가
   * "[object Object]"로 그대로 노출된다. MyungriCompactCard의 pendingLabels
   * 는 이미 위에서 behavioral하게 검증했으므로, DoctorView.tsx 메인 렌더
   * 블록에만 있는 나머지 호출부(secondary_screens join, judgment-save
   * source object에 넘기는 myungri_pending_approval -- Batch 4.1-D 이전엔
   * JudgmentPanel의 source prop도 같은 호출부였으나, §17.1/§17.2로 그
   * JSX 자체가 제거되면서 handleSaveObjectiveExamField의 source 객체가
   * 유일한 호출부로 남았다)는 구조 확인으로 보완한다. (Batch 4.1-B: 명리
   * 검토 grid 자신의 pending_approval join은 그 grid째로 제거됐다 -- 세
   * 번째 호출부는 더 이상 없다.)
   */
  assert(
    'resilience: routing.secondary_screens join이 readableStringArray를 거친다 (bare asArray().join() 대신, 13th independent review MEDIUM-2)',
    doctorViewSrc.includes("readableStringArray(asArray(routing.secondary_screens)).join(', ')"),
  )
  assert(
    'resilience: judgment-save source 객체(handleSaveObjectiveExamField, Batch 4.1-D 이전엔 JudgmentPanel의 source prop도 포함)에 넘기는 myungri_pending_approval이 readableStringArray를 거친다 (13th independent review MEDIUM-3)',
    doctorViewSrc.includes('myungri_pending_approval: readableStringArray(asArray(saju.policy.pending_approval)),'),
  )
}

/* -------------------------------------------------------------------------
 * 3rd independent review: CommonSafetyBanner.tsx had 7 bare `?? []` fallbacks
 * that stop a MISSING array field but let a wrong-typed (string/object)
 * truthy value straight through -- `.filter()` on a string throws, and
 * `.includes('other')` on a string silently substring-matches and FABRICATES
 * a "기타 확인" safety item that was never actually reported (fail-open,
 * which this batch's policy forbids more than a crash). All 7 sites must
 * route through the file's own asArray() helper.
 * ---------------------------------------------------------------------- */
{
  const bannerSrc = await readFile(
    fileURLToPath(new URL('../src/doctor/CommonSafetyBanner.tsx', import.meta.url)),
    'utf8',
  )
  assert(
    'resilience: CommonSafetyBanner.tsx defines its own asArray() helper (Array.isArray check, not just a nullish fallback)',
    /function asArray<T>\(value: unknown\): T\[\] \{\s*\n\s*return Array\.isArray\(value\)/.test(bannerSrc),
  )
  assert(
    'resilience: no bare `?? []` array fallback remains in CommonSafetyBanner.tsx (all routed through asArray())',
    !/\?\? \[\]/.test(bannerSrc),
  )
  const mustUseAsArray = [
    'r.medical_history.medical_history_flags',
    'r.secondary_concerns.secondary_concerns',
    'r.modules.sleep?.awakening_reasons',
    'r.modules.women?.problems',
    'r.modules.pregnancy?.concerns',
    'r.modules.postpartum?.problems',
    'r.safety_flags?.red_flag_general',
  ]
  for (const field of mustUseAsArray) {
    assert(
      `resilience: CommonSafetyBanner.tsx reads ${field} through asArray()`,
      bannerSrc.includes(`asArray<string>(${field})`),
    )
  }
}

/* -------------------------------------------------------------------------
 * DoctorRecordFallback: the neutral shell shown when the check above fails.
 * Must never invent a clinical profile/fact, must show only values already
 * present on the list-level record (patient_label/created_at/status), and
 * must still render the CRM/MedicationCourseSection entry point when a
 * patient_id is available (the one part of the screen that stays usable
 * regardless of how broken the submission payload is).
 * ---------------------------------------------------------------------- */

{
  const recordWithPatient = {
    id: 'r1',
    created_at: '2026-01-02T03:04:05.000Z',
    updated_at: '2026-01-02T03:04:05.000Z',
    status: 'viewed',
    patient_label: '(QA) 홍길동',
    patient_id: 'patient-uuid-1',
    submission: {},
    myungri: null,
    judgment: null,
  }
  const html = renderToString(React.createElement(DoctorRecordFallback, { record: recordWithPatient }))
  assert('resilience fallback: shows the "cannot display" heading', html.includes('상세 임상 화면을 표시할 수 없습니다'))
  assert('resilience fallback: explicitly states it does not guess a clinical profile', html.includes('추정해서 보여주지'))
  assert('resilience fallback: shows the known patient_label', html.includes('홍길동'))
  // 20차 독립 리뷰 MEDIUM-2: status는 이제 raw enum이 아니라 statusLabel()을
  // 거친 한국어 라벨로 렌더된다 -- 'viewed' -> '확인함'.
  assert('resilience fallback: shows the known status as its Korean label, not the raw enum', html.includes('확인함'))
  assert('resilience fallback: never mentions pain/herbal/mixed view-profile labels', !/통증|한약·전신|혼합/.test(html))

  const recordWithoutPatient = { ...recordWithPatient, patient_id: undefined }
  const htmlNoPatient = renderToString(React.createElement(DoctorRecordFallback, { record: recordWithoutPatient }))
  assert(
    'resilience fallback: without patient_id, still renders the banner without throwing',
    htmlNoPatient.includes('상세 임상 화면을 표시할 수 없습니다'),
  )

  const htmlNoRecord = renderToString(React.createElement(DoctorRecordFallback, { record: undefined }))
  assert('resilience fallback: record=undefined still renders without throwing', htmlNoRecord.includes('상세 임상 화면을 표시할 수 없습니다'))

  /* -----------------------------------------------------------------------
   * 20차 독립 리뷰 HIGH-1/MEDIUM-1/MEDIUM-2: this fallback is rendered BOTH
   * as DoctorRecordErrorBoundary's normal child AND as its own `fallback`
   * prop -- React cannot catch a throw during fallback rendering, so a
   * corrupted/legacy stored record whose patient_label/status/created_at
   * don't match SubmissionRecord's compile-time type used to crash here
   * uncatchably (propagating past this boundary to PatientErrorBoundary,
   * replacing the whole doctor workspace with the patient-facing screen).
   * These prove the fix: every field type this component reads is now
   * defended, not just the ones covered above.
   * -------------------------------------------------------------------- */
  const corruptedStatus = { ...recordWithPatient, status: { code: 'weird' } }
  const htmlCorruptedStatus = renderToString(React.createElement(DoctorRecordFallback, { record: corruptedStatus }))
  assert(
    'resilience fallback HIGH-1: an object status does not throw (React child requires string/number), falls back to "확인 필요"',
    htmlCorruptedStatus.includes('확인 필요'),
  )

  const corruptedPatientLabel = { ...recordWithPatient, patient_label: { name: 'x' } }
  const htmlCorruptedPatientLabel = renderToString(React.createElement(DoctorRecordFallback, { record: corruptedPatientLabel }))
  assert(
    'resilience fallback HIGH-1: an object patient_label does not throw, falls back to "확인 필요" instead of rendering the object',
    htmlCorruptedPatientLabel.includes('확인 필요') && !htmlCorruptedPatientLabel.includes('[object Object]'),
  )

  const missingCreatedAt = { ...recordWithPatient, created_at: undefined }
  const htmlMissingCreatedAt = renderToString(React.createElement(DoctorRecordFallback, { record: missingCreatedAt }))
  assert(
    'resilience fallback MEDIUM-1: a missing/invalid created_at renders "확인 필요", never the literal "Invalid Date"',
    htmlMissingCreatedAt.includes('확인 필요') && !htmlMissingCreatedAt.includes('Invalid Date'),
  )

  const unrecognizedStatus = { ...recordWithPatient, status: 'archived_legacy_value' }
  const htmlUnrecognizedStatus = renderToString(React.createElement(DoctorRecordFallback, { record: unrecognizedStatus }))
  assert(
    'resilience fallback MEDIUM-2: a string status outside the known enum falls back to "확인 필요", not the raw string leaked verbatim',
    htmlUnrecognizedStatus.includes('확인 필요') && !htmlUnrecognizedStatus.includes('archived_legacy_value'),
  )
}

/* -------------------------------------------------------------------------
 * Structural guard: DoctorView.tsx must actually gate its detailed render
 * on this check and wrap it in the error-boundary backstop -- proves the
 * wiring itself (not just the pure function in isolation) is present, and
 * catches a future edit that silently removes the gate while leaving the
 * exported function behind.
 * ---------------------------------------------------------------------- */

{
  const src = await readFile(fileURLToPath(new URL('../src/doctor/DoctorView.tsx', import.meta.url)), 'utf8')
  assert(
    'resilience: DoctorView computes payloadShapeOk from isDoctorPayloadShapeUsable before deriving the view profile',
    /const payloadShapeOk = isDoctorPayloadShapeUsable\(payload\)/.test(src) &&
      /const viewProfile = payloadShapeOk \? deriveViewProfile\(payload\)\.derived : null/.test(src),
  )
  assert(
    'resilience: the detailed record view is wrapped in DoctorRecordErrorBoundary',
    /<DoctorRecordErrorBoundary\s/.test(src) && src.includes('</DoctorRecordErrorBoundary>'),
  )
  // Core Reduction P2 (delta N-6, Phase 5 Synthesis v1.2 §2.8): the
  // boundary key is now the SAME unifiedResetKey DoctorWorkspace's
  // `resetKey` prop reads (originally also JudgmentPanel's `resetKey`
  // prop, until Batch 4.1-D §17.1/§17.2 removed that component and its
  // JSX entirely) -- one computation instead of independently-typed key
  // expressions that could silently drift apart.
  assert(
    'resilience: unifiedResetKey is computed once (submission:<id> in server mode, fixture:<index>:<scenario> in fixtures mode)',
    /const unifiedResetKey =\s*\n\s*mode === 'server' \? `submission:\$\{selectedRecord\?\.id \?\? 'none'\}` : `fixture:\$\{fixtureIndex\}:\$\{workspaceScenarioId\}`/.test(
      src,
    ),
  )
  assert(
    'resilience: server-mode boundary key is the unified reset key',
    /key=\{unifiedResetKey\}/.test(src),
  )
  assert(
    'resilience: DoctorWorkspace receives the SAME unifiedResetKey as its resetKey prop ' +
      '(a record switch must reset the shell and the error boundary in lockstep -- ' +
      'Batch 4.1-D §17.1/§17.2: JudgmentPanel used to be a second receiver of this same prop, now gone with the component)',
    (src.match(/resetKey=\{unifiedResetKey\}/g) ?? []).length >= 1,
  )
  assert(
    'resilience: !payloadShapeOk renders DoctorRecordFallback instead of the normal tab content',
    /\{!payloadShapeOk \? \(\s*<DoctorRecordFallback/.test(src),
  )
}

/* -------------------------------------------------------------------------
 * P0-3 (Core Reduction Phase 6 gate / Phase 3 Opus review §3-2 "MOVE"): the
 * revisit issuance section ("재진 간단 문진") used to render ABOVE the
 * clinical tabs -- i.e. above CommonSafetyBanner (Phase 3 §5-1: "안전
 * 배너가 스크롤 아래"). Core Reduction P3 (Phase 5 Synthesis v1.2 §2.7)
 * moves it again, this time INSIDE the 진료 탭의 다음 레인 -- built as
 * `nextLaneFooterNode` (DoctorView-owned state) and handed to
 * DoctorWorkspace as the `nextLaneFooter` prop, which that shell renders
 * inside `.doctor__visitLane--next` (after 레인1 안전 확인, never before
 * it) rather than DoctorView rendering the section as a direct sibling of
 * `</DoctorRecordErrorBoundary>` any more -- position only, the section's
 * own content/condition/handlers are unchanged (still gated on
 * mode==='server' && selectedRecord?.patient_id, still the same handlers).
 * ---------------------------------------------------------------------- */
{
  const src = await readFile(fileURLToPath(new URL('../src/doctor/DoctorView.tsx', import.meta.url)), 'utf8')
  assert(
    'P0-3/P3: the revisit issuance section is built as nextLaneFooterNode and handed to DoctorWorkspace as nextLaneFooter',
    src.includes('const nextLaneFooterNode =') && /nextLaneFooter=\{nextLaneFooterNode\}/.test(src),
  )
  assert(
    'P0-3/P3: the revisit issuance section is still gated on the exact same condition as before the move',
    /const nextLaneFooterNode =\s*\n\s*mode === 'server' && selectedRecord\?\.patient_id \? \(/.test(src) &&
      src.includes('<section className="doctor__section doctor__revisitSession doctor__nextIssuance">'),
  )
  const workspaceSrc = await readFile(
    fileURLToPath(new URL('../src/doctor/workspace/DoctorWorkspace.tsx', import.meta.url)),
    'utf8',
  )
  assert(
    'P0-3/P3: DoctorWorkspace renders {nextLaneFooter} inside the 다음 레인 (doctor__visitLane--next), after 레인1 안전 확인 -- never above CommonSafetyBanner',
    (() => {
      const lane1Idx = workspaceSrc.indexOf('doctor__visitLane--lane1')
      const nextLaneIdx = workspaceSrc.indexOf('doctor__visitLane--next')
      const footerIdx = workspaceSrc.indexOf('{nextLaneFooter}')
      return lane1Idx !== -1 && nextLaneIdx !== -1 && footerIdx !== -1 && lane1Idx < nextLaneIdx && nextLaneIdx < footerIdx
    })(),
  )
}

/* -------------------------------------------------------------------------
 * P0-5 (Core Reduction Phase 6 gate / Phase 3 Opus review §4-a): the
 * submissions list was an archive with no "this is done" action (only
 * 'viewed' was ever written). "진료 완료" reuses the EXISTING
 * VALID_STATUSES contract (setSubmissionStatus -> server/store.js's
 * setStatus) unchanged -- no new status value, and it must NOT introduce an
 * automatic 'in_consultation' transition (HUMAN DECISION #2 stays
 * untouched/out of scope).
 * ---------------------------------------------------------------------- */
{
  const src = await readFile(fileURLToPath(new URL('../src/doctor/DoctorView.tsx', import.meta.url)), 'utf8')
  const fnStart = src.indexOf('async function handleCompleteSubmission()')
  assert('P0-5: handleCompleteSubmission exists', fnStart !== -1)
  const fnBody = src.slice(fnStart, fnStart + 900)
  assert(
    'P0-5: handleCompleteSubmission calls setSubmissionStatus(selectedId, \'completed\') -- the existing VALID_STATUSES contract, no new status value',
    /setSubmissionStatus\(selectedId, 'completed'\)/.test(fnBody),
  )
  assert(
    'P0-5: handleCompleteSubmission never writes \'in_consultation\' (no auto-transition -- HUMAN DECISION #2 stays out of scope)',
    !fnBody.includes("'in_consultation'"),
  )
  assert(
    // Core Reduction P3 (§2.3/§2.7 "종결"): the button moved out of the
    // always-visible header into the 진료 탭의 다음 레인(nextLaneFooterNode),
    // next to the EMR review it now sits beside -- same condition, same
    // handler, position only.
    'P0-5/P3: the "진료 완료" button exists (now inside the 다음 레인 "종결" section), gated on server mode + an open record',
    /\{mode === 'server' && selectedRecord && selectedId && \(\s*<button[\s\S]{0,300}?onClick=\{handleCompleteSubmission\}/.test(
      src,
    ),
  )
}

/* -------------------------------------------------------------------------
 * P0-2 (Core Reduction Phase 6 gate / Phase 3 Opus review §3-6, 단순화
 * 금지선 5-1 "안전 입력이 비기본 탭에"): the LBP/SHOULDER objective exam
 * findings must be editable from the 진료 (clinical) tab, next to the
 * regional SafetyPanels they feed -- not only from '자료 보기'. Save path
 * unchanged: still ClinicianJudgment.lbp_objective_motor_deficit /
 * shoulder_objective_cuff_weakness, still through saveJudgment (PUT
 * /api/submissions/:id/judgment).
 * ---------------------------------------------------------------------- */
{
  const src = await readFile(fileURLToPath(new URL('../src/doctor/DoctorView.tsx', import.meta.url)), 'utf8')
  // Core Reduction P2: ObjectiveExamFindingsCard itself moved INSIDE
  // DoctorWorkspace.tsx's 레인2("확인") -- DoctorView.tsx no longer renders
  // the component directly, it only supplies the save handler via the
  // `onSaveObjectiveExam` prop (same handleSaveObjectiveExamField, same
  // condition as before this round's move).
  assert(
    'P0-2/P2: DoctorView.tsx no longer renders <ObjectiveExamFindingsCard> directly -- it passes onSaveObjectiveExam to DoctorWorkspace instead',
    !src.includes('<ObjectiveExamFindingsCard') &&
      /onSaveObjectiveExam=\{mode === 'server' && selectedId \? handleSaveObjectiveExamField : undefined\}/.test(src),
  )
  const workspaceSrc = await readFile(
    fileURLToPath(new URL('../src/doctor/workspace/DoctorWorkspace.tsx', import.meta.url)),
    'utf8',
  )
  assert(
    'P0-2/P2: ObjectiveExamFindingsCard is imported and rendered inside DoctorWorkspace.tsx\'s 레인2 ("확인"), after 레인1 안전 확인',
    workspaceSrc.includes("import { ObjectiveExamFindingsCard") &&
      (() => {
        const lane1Idx = workspaceSrc.indexOf('doctor__visitLane--lane1')
        const lane2Idx = workspaceSrc.indexOf('doctor__visitLane--lane2')
        const cardIdx = workspaceSrc.indexOf('<ObjectiveExamFindingsCard')
        return lane1Idx !== -1 && lane2Idx !== -1 && cardIdx !== -1 && lane1Idx < lane2Idx && lane2Idx < cardIdx
      })(),
  )
  assert(
    'P0-2: ObjectiveExamFindingsCard uses the SAME nullish safety_flags.<region> applicability signal JudgmentPanel\'s (now-removed, Batch 4.1-D §17.2) showLbpExam/showShoulderExam used to (6th independent review HIGH-1/MEDIUM-1)',
    /<ObjectiveExamFindingsCard[\s\S]{0,400}?showLbp=\{payload\.responses\.safety_flags\.lbp != null\}[\s\S]{0,200}?showShoulder=\{payload\.responses\.safety_flags\.shoulder != null\}/.test(
      workspaceSrc,
    ),
  )
  assert(
    'P0-2: handleSaveObjectiveExamField saves through saveJudgmentToServer (the SAME judgment persistence path, no new endpoint/data contract)',
    (() => {
      const fnStart = src.indexOf('async function handleSaveObjectiveExamField(')
      if (fnStart === -1) return false
      // 독립 검수 HIGH-2: 바로 다음 함수(handleReloadObjectiveExamConflict)를
      // 경계로 쓴다 -- 이전 경계 문자열('const showingServerList')은 이미
      // 이 파일 어디에도 존재하지 않아 indexOf가 -1을 반환했고(=이 함수부터
      // 파일 끝까지를 통째로 봄), 그래서 saveJudgmentToServer 호출 횟수
      // 카운트가 다른 곳(JudgmentPanel의 onSave)의 호출까지 같이 세고
      // 있었다.
      const fnEnd = src.indexOf('function handleReloadObjectiveExamConflict(', fnStart)
      const fn = src.slice(fnStart, fnEnd)
      // 독립 검수 HIGH-2: 이전에는 여기서 stale-write 409를 서버의 current
      // judgment로 rebase해 자동으로 한 번 더 저장했다(별도 `attempt()`
      // 클로저 + `expectedUpdatedAt` 파라미터). 그 자동 retry/merge를
      // 제거하면서 CAS 기준을 selectedRecord에서 직접 읽는 단일 호출로
      // 바뀌었다 -- 여전히 SAME saveJudgmentToServer 경로/데이터 계약이고,
      // 새 endpoint가 아니라는 이 테스트의 취지는 그대로 유지된다.
      return (
        fn.includes('saveJudgmentToServer(selectedId, next, selectedRecord?.updated_at)') &&
        fn.includes('createEmptyJudgment(source)') &&
        (fn.match(/saveJudgmentToServer\(/g) ?? []).length === 1
      )
    })(),
  )
  // Batch 4.1-D (§17.1/§17.2): the property this test pinned when it was
  // written -- "JudgmentPanel keeps a READ-ONLY echo of both fields,
  // information is not lost, only the editable control moved" -- was true
  // for 4.1-A through 4.1-C. This batch removes that read-only echo too,
  // deliberately: §17.2's own field × screen table records this as an
  // intentional loss (both fields are already visible, live, on their own
  // editable radios in ObjectiveExamFindingsCard right next to the safety
  // panel that reacts to them -- the echo was a literal duplicate, the
  // exact kind of thing the 화면 실측 감사 already flagged as 1순위).
  // `src/doctor/JudgmentPanel.tsx` no longer exists to read.
  assert(
    'P0-2 superseded by Batch 4.1-D §17.2: JudgmentPanel.tsx (and its read-only echo of both fields) no longer exists -- the fields are edited live on ObjectiveExamFindingsCard only, never duplicated elsewhere',
    !existsSync(fileURLToPath(new URL('../src/doctor/JudgmentPanel.tsx', import.meta.url))),
  )
}

/* -------------------------------------------------------------------------
 * Core Reduction P3 — Phase 7 UI spec §1.3-#1/#2/#3 (§2.7 발급 "다른 방법"
 * 자동 펼침). nextLaneFooterNode only ever builds in server mode with an
 * open submission (mode==='server' && selectedRecord?.patient_id) --
 * doctor.spec.mjs's renderDoctorView() helper runs in fixtures mode, which
 * can never reach that branch, so these are structural (source) checks,
 * the same style this file already uses for every other issuance-state
 * assertion in this section (see the P0-3 block above).
 * ---------------------------------------------------------------------- */
{
  const src = await readFile(fileURLToPath(new URL('../src/doctor/DoctorView.tsx', import.meta.url)), 'utf8')
  assert(
    '§1.3-#1/#2: activeSession and unconsumedToken are both derived from issuedSession !== null (the one in-memory signal this codebase holds for "a one-time patient link is outstanding")',
    src.includes('const activeSession = issuedSession !== null') && src.includes('const unconsumedToken = issuedSession !== null'),
  )
  assert(
    '§1.3-#1/#2: altMethodsAutoOpen is their OR, and the "다른 방법" details reads it as its open condition',
    src.includes('const altMethodsAutoOpen = activeSession || unconsumedToken') &&
      /className="doctor__nextIssuance__altMethods" open=\{altMethodsAutoOpen\}/.test(src),
  )
  assert(
    '§1.3-#3: with neither an active session nor an unconsumed token (issuedSession initial state is null), altMethodsAutoOpen evaluates false -- the details starts collapsed on the default (no-issuance-yet) path',
    src.includes(
      "const [issuedSession, setIssuedSession] = useState<\n    { visitId: string; token: string; expiresAt: string; targetCount: number } | null\n  >(null)",
    ) || /useState<\s*\{ visitId: string; token: string; expiresAt: string; targetCount: number \} \| null\s*>\(null\)/.test(src),
  )
}

/* -------------------------------------------------------------------------
 * Core Reduction P3 — Phase 7 UI spec §1.3-#15 (§2.10, delta N-4): 학습
 * 케이스 disclosure(Phase 1 audit row 81) used to open exactly when
 * judgment.learning_case === true.
 *
 * Batch 4.1-D (§17.1/§17.5, PO decision 2026-09-04): 학습 케이스 is unused
 * for now and removed from the screen entirely, along with the rest of
 * JudgmentPanel.tsx (§17.2). This §1.3-#15 property (an open={} condition
 * on a disclosure that no longer exists) is retired -- its removal is what
 * T26 in the render-level suite below pins (학습 케이스/★ 표시됨 render on
 * no profile). This structural check is kept as the source-level half of
 * that same fact, per CLAUDE.md's "지운 경로 1개당 소스 단언 1개".
 * ---------------------------------------------------------------------- */
{
  assert(
    '§1.3-#15 superseded by Batch 4.1-D §17.1: JudgmentPanel.tsx (and its judgment__learningCase disclosure) no longer exists',
    !existsSync(fileURLToPath(new URL('../src/doctor/JudgmentPanel.tsx', import.meta.url))),
  )
}

/* -------------------------------------------------------------------------
 * Core Reduction P6 — Phase 7 UI spec §9 "진료 화면 로딩 스켈레톤".
 *
 * `selectedRecordLoading` is useEffect/useState-driven (set on the fetch
 * effect's own start/settle), which renderToString cannot exercise (no
 * effects run in a static SSR pass, matching save-conflict.spec.mjs's own
 * documented reason for source-string coverage of comparable stateful
 * logic) -- these are source-string regressions on the state wiring itself,
 * plus a renderToString check that the skeleton's OWN markup (reachable
 * once the surrounding condition is true) carries no spinner class and
 * matches the aside+lane structure it stands in for.
 * ---------------------------------------------------------------------- */
{
  const src = await readFile(fileURLToPath(new URL('../src/doctor/DoctorView.tsx', import.meta.url)), 'utf8')
  assert(
    '§9 skeleton: selectedRecordLoading is set true when the record-fetch effect starts (mode===server && selectedId present)',
    /setSelectedRecordLoading\(true\)\s*\n\s*setUnreadReadyIds/.test(src),
  )
  assert(
    '§9 skeleton: selectedRecordLoading is cleared as soon as getSubmission settles, before branching on result.ok',
    /getSubmission\(selectedId\)\.then\(\(result\) => \{\s*\n\s*if \(cancelled\) return\s*\n\s*setSelectedRecordLoading\(false\)/.test(
      src,
    ),
  )
  assert(
    '§9 skeleton: selectedRecordLoading resets to false whenever there is no selectedId to fetch (mode switch / record closed)',
    /if \(mode !== 'server' \|\| !selectedId\) \{\s*\n\s*setSelectedRecord\(null\)\s*\n\s*setSelectedRecordLoading\(false\)/.test(
      src,
    ),
  )
  assert(
    '§9 skeleton: the 오늘 Queue gate excludes the loading window (never shows the stale list while a click is still resolving)',
    src.includes("mode === 'server' && !selectedRecord && !selectedRecordLoading && !selectedRevisit && !serverError"),
  )
  assert(
    '§9 skeleton: the skeleton itself mirrors the V3 shell structure (aside + main, not a standalone spinner element) and is gated on the same loading flag',
    /mode === 'server' && selectedRecordLoading && !selectedRevisit && !serverError[\s\S]{0,80}?className="doctor__visitShell doctor__skeleton"/.test(
      src,
    ),
  )
  assert(
    '§9 skeleton: renders the aside 5-block stack (identity/chief/delta/lane1/save, §3.2) and all 4 lanes (§2.3), never a spinner class',
    (() => {
      const start = src.indexOf('className="doctor__visitShell doctor__skeleton"')
      const end = src.indexOf('{selectedRevisit && (', start)
      const block = src.slice(start, end)
      const hasAllBlocks = [
        'doctor__skeleton__block--identity',
        'doctor__skeleton__block--chief',
        'doctor__skeleton__block--delta',
        'doctor__skeleton__block--lane1',
        'doctor__skeleton__block--save',
        'doctor__skeleton__lane--lane1',
        'doctor__skeleton__lane--lane2',
        'doctor__skeleton__lane--judgment',
        'doctor__skeleton__lane--next',
      ].every((cls) => block.includes(cls))
      return hasAllBlocks && !/spinner/i.test(block)
    })(),
  )
}

/* -------------------------------------------------------------------------
 * Core Reduction P6 — Phase 5 Synthesis v1.2 §5 메트릭 검증 (Phase 7 UI
 * spec가 정의한 화면 구조에 대한 회귀 고정). 3 뷰포트 horizontal overflow
 * 0은 tests/tablet-viewport.spec.mjs가 이미 실측으로 담당하므로 여기서는
 * 반복하지 않는다 -- 이 블록은 renderToString으로 확인 가능한 나머지
 * 4개 지표를 담는다.
 * ---------------------------------------------------------------------- */

// 기본 major section 4 (진료 레인 수): 안전 확인/확인/판단·처치/다음 --
// Phase 5 §1의 7개 mental-model 개념 중 5개(환자/확인/판단·처치/다음/
// 그 자신)가 이 4개 레인으로 접힌다는 구조 확정 자체를 고정한다.
{
  const html = renderDoctorView('허리 통증 주호소 (LBP, 확인 필요)')
  const laneCount = (html.match(/class="doctor__visitLane doctor__visitLane--\w+"/g) ?? []).length
  assert('metric: 기본 major section 4 -- 진료 화면은 정확히 4개의 doctor__visitLane을 렌더한다', laneCount === 4)
}

// 진입 조합 0: 프로필 자동분류 배너/세그먼트/혼합 탭 DOM이 어느 프로필
// 렌더에서도 등장하지 않는다(Core Reduction §2.4 제거 확정 — doctor-
// workspace.spec.mjs가 DoctorWorkspace 단독으로 이미 검증하지만, 여기서는
// DoctorView.tsx 전체 페이지 출력 기준으로 다시 고정한다).
{
  for (const name of ['허리 통증 주호소 (LBP, 확인 필요)', '수면 주호소 + 동반 소화/통증', '여성 건강 주호소']) {
    const html = renderDoctorView(name)
    assert(`metric: 진입 조합 0 -- "${name}" 페이지 전체에 워크스페이스 프로필 배너 없음`, !html.includes('워크스페이스 프로필'))
    assert(`metric: 진입 조합 0 -- "${name}" 페이지 전체에 workspace__profileBar 없음`, !html.includes('workspace__profileBar'))
    assert(`metric: 진입 조합 0 -- "${name}" 페이지 전체에 workspace__segmentedBtn 없음`, !html.includes('workspace__segmentedBtn'))
  }
}

// 기록 필드 접근 불가 0: Core Reduction P4가 참고 화면 아코디언으로 옮긴
// 그룹들이 실제로 렌더되는지 대표 fixture로 확인한다 -- "여성 건강
// 주호소"는 WOMEN_SAFETY_01이 실제로 응답된 herbal-profile 레코드라 여성
// 안전/약물·병력/검사자료/문진 원본을 한 fixture로 대부분 커버한다.
//
// T18 (Batch 4.1-B/4.1-C §16.6, updating the "명리" row this test used to
// have): the "명리" group is GONE (its accordion was removed in 4.1-B,
// §16.3) -- there is no longer a group by that name to assert into the
// list, and no representative field (사주 기둥 grid) to check for it
// either. The former "명리·감사 기록" group was renamed "디브리핑·학습
// 기록" (4.1-C, §16.4), then REMOVED ENTIRELY by Batch 4.1-D (§17.1/§17.2)
// -- there is no group by that name left either, so it drops out of the
// `groups` list below the same way "명리" did, and the "still renders"
// assertion this test used to end with is replaced by its own absence
// check (mirrors T27 in the §17.6 block above, at the "여성 건강 주호소"
// fixture specifically since that is the one this metric test already uses).
{
  const html = renderDoctorView('여성 건강 주호소')
  const groups = ['문진 원본', '약물·병력', '여성 안전', '검사자료', '이전 방문 원문', '원본 JSON']
  for (const g of groups) {
    assert(`metric: 기록 필드 접근 불가 0 -- 참고 화면에 "${g}" 아코디언 그룹이 렌더된다`, html.includes(g))
  }
  assert('T6 companion: metric fixture no longer offers a "명리" 아코디언 그룹', !html.includes('명리 검토'))
  assert('T18: metric fixture no longer has a group named "명리·감사 기록" (renamed, then removed)', !html.includes('명리·감사 기록'))
  assert('T27 companion: metric fixture no longer has a group named "디브리핑·학습 기록" either (Batch 4.1-D §17.1/§17.2 removed it entirely)', !html.includes('디브리핑·학습 기록'))
  // 그룹 프레임만이 아니라 그 안의 실제 값도 도달 가능해야 한다 -- 각
  // 그룹을 대표하는 실제 필드/값 하나씩.
  assert('metric: 기록 필드 접근 불가 0 -- 여성 안전 그룹 안의 WOMEN_SAFETY_01 원본 응답이 렌더된다', html.includes('환자가 답한 것 (WOMEN_SAFETY_01)'))
  assert('metric: 기록 필드 접근 불가 0 -- 원본 JSON 그룹 안의 실제 payload 덤프가 렌더된다', html.includes('&quot;session_id&quot;'))
}

// 기본 free-text 증가 0: tests/tablet-viewport.spec.mjs의
// EXPECTED_OPEN_INPUTS(=4, 판단/처치/재검 3 + §2.5 다음 방문 확인 메모 1)
// 가 실제 헤드리스 렌더로 이미 이 지표를 담당한다 -- 여기서는 그 계약이
// 소스에 그대로 남아있는지만 구조로 재확인한다(중복 실측 없이 드리프트
// 감시).
{
  const src = await readFile(fileURLToPath(new URL('../tests/tablet-viewport.spec.mjs', import.meta.url)), 'utf8')
  assert(
    'metric: 기본 free-text 증가 0 -- tablet-viewport.spec.mjs가 EXPECTED_OPEN_INPUTS=4로 기본 렌더 open input 개수를 계속 감시한다',
    /const EXPECTED_OPEN_INPUTS = 4/.test(src),
  )
}

// ==========================================================================
// LBP v1 Batch 4 §14.3/§14.6 -- 종결 EMR text (Opus delta review defects
// #1/#4/#5). This section renders only inside `mode === 'server' &&
// selectedRecord?.patient_id`, a fetch-driven screen this fixtures-only
// SSR harness cannot mount -- so, per Opus's own instruction, this stays
// source-text assertions against DoctorView.tsx/PainWorkspace.tsx/
// EmrPreviewCard.tsx's SOURCE rather than rendered behavior. This is the
// coverage tests/doctor-workspace.spec.mjs's own §14.3 block comment
// claimed already existed (Opus delta review defect #5 found it did not).
// ==========================================================================
{
  function stripComments(src) {
    return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  }

  // Balanced-bracket extraction of the object-literal substring passed to
  // `${fnName}({ ... })` -- tolerant of comments inside it (their brackets
  // may be interleaved but net out to zero over the whole call, which is
  // all a depth counter needs), robust to nested calls/ternaries in values.
  function extractCallArgBody(src, fnName) {
    const callIdx = src.indexOf(`${fnName}({`)
    if (callIdx === -1) throw new Error(`call to ${fnName}({ not found`)
    const bodyStart = src.indexOf('{', callIdx)
    let depth = 0
    let i = bodyStart
    for (; i < src.length; i++) {
      if (src[i] === '{') depth++
      else if (src[i] === '}') {
        depth--
        if (depth === 0) break
      }
    }
    if (depth !== 0) throw new Error(`unbalanced braces extracting ${fnName}({...}) call body`)
    return src.slice(bodyStart + 1, i)
  }

  // Splits an (already comment-stripped) object-literal body into its
  // top-level `key` or `key: value` entries, respecting nested
  // {}/()/[]/`` so a value containing its own commas (a nested call, a
  // template literal) is never split apart.
  function splitTopLevelEntries(body) {
    const parts = []
    let depth = 0
    let current = ''
    for (let i = 0; i < body.length; i++) {
      const c = body[i]
      if (c === '{' || c === '(' || c === '[') depth++
      else if (c === '}' || c === ')' || c === ']') depth--
      if (c === ',' && depth === 0) {
        parts.push(current)
        current = ''
      } else {
        current += c
      }
    }
    if (current.trim()) parts.push(current)
    return parts
  }

  function extractCallArgKeys(src, fnName) {
    const cleanedBody = stripComments(extractCallArgBody(src, fnName))
    return splitTopLevelEntries(cleanedBody)
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
      .map((entry) => {
        const colonIdx = entry.indexOf(':')
        return colonIdx === -1 ? entry : entry.slice(0, colonIdx).trim()
      })
      .filter((key) => /^[A-Za-z_$][\w$]*$/.test(key))
  }

  const doctorViewSrc = await readFile(fileURLToPath(new URL('../src/doctor/DoctorView.tsx', import.meta.url)), 'utf8')
  const emrPreviewCardSrc = await readFile(
    fileURLToPath(new URL('../src/doctor/workspace/EmrPreviewCard.tsx', import.meta.url)),
    'utf8',
  )
  const painWorkspaceSrc = await readFile(
    fileURLToPath(new URL('../src/doctor/workspace/PainWorkspace.tsx', import.meta.url)),
    'utf8',
  )

  // defect #1 (i) / defect #5 (i): exactly one real "EMR용 복사" button in
  // the whole app -- the 종결 button. EmrPreviewCard.tsx's own header
  // comment mentions the literal in quotes (describing the button it used
  // to carry, now removed) -- stripped out here so only rendered JSX text
  // counts.
  const emrCopyButtonOccurrencesInDoctorView = (doctorViewSrc.match(/EMR용 복사/g) ?? []).length
  assert(
    'defect #1/#5: "EMR용 복사" (the one copy button) appears exactly once in DoctorView.tsx',
    emrCopyButtonOccurrencesInDoctorView === 1,
  )
  assert(
    'defect #1/#5: EmrPreviewCard.tsx renders no "EMR용 복사" button at all (its header comment\'s mention of the retired button text does not count -- comments stripped before this check)',
    !stripComments(emrPreviewCardSrc).includes('EMR용 복사'),
  )

  // defect #1: the 종결 copy button disables itself whenever emrText is
  // empty, so no future path can ever report 복사됨 for a clipboard write
  // that copied nothing.
  assert(
    'defect #1: the 종결 EMR용 복사 button is disabled whenever emrText is empty (defence in depth)',
    /onClick=\{handleCopyEmr\}[\s\S]{0,40}disabled=\{!emrText\.trim\(\)\}/.test(doctorViewSrc),
  )

  // defect #1 (ii): handleRebuildEmrSummary routes through the shared
  // buildEmrTextForRecord() dispatcher (covers herbal too, not only
  // pain/mixed the way the pre-fix version did), and that dispatcher's
  // herbal path calls buildHerbalEmrTextForRecord(), which itself calls
  // buildHerbalWorkspaceEmrPreview -- the exact function name §14.7
  // forbids modifying, confirming the fix routes to it rather than
  // reimplementing it.
  const handleRebuildBody = doctorViewSrc.match(/function handleRebuildEmrSummary\(\) \{([\s\S]*?)\n  \}/)?.[1] ?? ''
  assert(
    'defect #1 (ii): handleRebuildEmrSummary calls the shared buildEmrTextForRecord() dispatcher',
    /buildEmrTextForRecord\(\)/.test(handleRebuildBody),
  )
  const dispatcherBody = doctorViewSrc.match(/function buildEmrTextForRecord\(\): string \{([\s\S]*?)\n  \}/)?.[1] ?? ''
  assert(
    "defect #1: the dispatcher routes viewProfile === 'herbal' to buildHerbalEmrTextForRecord()",
    /viewProfile === 'herbal'[\s\S]*?buildHerbalEmrTextForRecord\(\)/.test(dispatcherBody),
  )
  assert(
    "defect #1: the dispatcher routes viewProfile === 'mixed' to BOTH buildPainEmrTextForRecord() and buildHerbalEmrTextForRecord(), pain block first",
    /viewProfile === 'mixed'[\s\S]*?buildPainEmrTextForRecord\(\)[\s\S]*?buildHerbalEmrTextForRecord\(\)/.test(dispatcherBody),
  )
  const buildHerbalFnBody = doctorViewSrc.match(/function buildHerbalEmrTextForRecord\(\): string \{([\s\S]*?)\n  \}/)?.[1] ?? ''
  assert(
    'defect #1 (ii): buildHerbalEmrTextForRecord() calls buildHerbalWorkspaceEmrPreview (the untouched §14.7 function, not a reimplementation)',
    /buildHerbalWorkspaceEmrPreview\(/.test(buildHerbalFnBody),
  )

  // defect #4: the 종결 EMR seed effect guards setEmrText behind a ref
  // comparison -- a record switch always reseeds, but an
  // `updated_at`-only bump (a workspace autosave of the SAME record) only
  // reseeds when the textarea still holds exactly what the effect
  // generated last (i.e. the clinician has not typed a manual edit since).
  const seedEffectMatch = doctorViewSrc.match(
    /useEffect\(\(\) => \{\s*if \(!payloadShapeOk\) return\s*const recordId = selectedRecord\?\.id[\s\S]*?\}, \[payloadShapeOk, viewProfile, selectedRecord\?\.id, selectedRecord\?\.updated_at, microFollowUpResponse\]\)/,
  )
  assert(
    'defect #4/C-2: the 종결 EMR seed effect exists, keyed on [payloadShapeOk, viewProfile, selectedRecord?.id, selectedRecord?.updated_at, microFollowUpResponse] -- the micro follow-up response arrives via an async fetch after the record loads, so it must be a dep or the seed effect runs before it resolves and silently omits the S micro-follow-up clause that EmrPreviewCard renders live (Opus closing review C-2)',
    seedEffectMatch != null,
  )
  const seedEffectBody = seedEffectMatch?.[0] ?? ''
  assert(
    'defect #4: the seed effect compares against a ref (emrSeedRef.current.recordId / .lastGenerated), not an unconditional setEmrText',
    /emrSeedRef\.current\.recordId/.test(seedEffectBody) && /emrText === emrSeedRef\.current\.lastGenerated/.test(seedEffectBody),
  )
  // C-3 (Opus closing review): the previous version of this guard compared
  // string indices (`indexOf('if (') < indexOf('setEmrText(')`), which can
  // never fail -- the effect body always begins with
  // `if (!payloadShapeOk) return`, so ANY setEmrText( anywhere after it
  // (including a bare, unguarded one) satisfies that comparison. Opus's
  // M4subtle mutant proved it: inserting a bare `setEmrText(generated)`
  // immediately after `const generated = buildEmrTextForRecord()` --
  // fully reverting defect #4's guard while leaving the ref-comparison
  // logic intact elsewhere in the effect -- survived all 960 assertions.
  // Replacement: every setEmrText( occurrence in the seed effect must have
  // `emrSeedRef.current` within the 200 characters immediately preceding
  // it, i.e. it must sit inside a branch that already tested the ref.
  const setEmrTextIndices = []
  for (let searchFrom = 0; ; ) {
    const idx = seedEffectBody.indexOf('setEmrText(', searchFrom)
    if (idx === -1) break
    setEmrTextIndices.push(idx)
    searchFrom = idx + 1
  }
  assert(
    'C-3 sanity: the seed effect calls setEmrText( at least once',
    setEmrTextIndices.length > 0,
  )
  assert(
    'C-3: every setEmrText( call in the seed effect is guarded -- emrSeedRef.current appears within the 200 characters immediately preceding it (a bare setEmrText(generated) right after buildEmrTextForRecord(), with the ref logic left intact elsewhere -- Opus M4subtle -- must fail this)',
    setEmrTextIndices.every((idx) => seedEffectBody.slice(Math.max(0, idx - 200), idx).includes('emrSeedRef.current')),
  )

  // defect #5 (ii): the 종결 call site's argument key set accounts for
  // PainWorkspace.tsx's own buildPainWorkspaceEmrPreview call -- every key
  // PainWorkspace.tsx passes is also passed by 종결. Batch 4.1-A §15.3
  // removed the 3 former "defect #2" clinician-judgment-only keys
  // (clinicianJudgmentAssessment/Treatment/Plan) that used to be 종결's
  // only documented extra keys -- the two call sites' key sets are now
  // expected to match exactly, with zero undocumented extras on either
  // side. A key silently missing (or newly, silently added) on either
  // side fails this.
  const completionKeys = new Set(extractCallArgKeys(doctorViewSrc, 'buildPainWorkspaceEmrPreview'))
  const referenceKeys = new Set(extractCallArgKeys(painWorkspaceSrc, 'buildPainWorkspaceEmrPreview'))

  assert('defect #5 (ii) sanity: both call sites\' argument keys were actually extracted (non-empty)', completionKeys.size > 0 && referenceKeys.size > 0)
  const missingFromCompletion = [...referenceKeys].filter((k) => !completionKeys.has(k))
  assert(
    "defect #5 (ii): every key PainWorkspace.tsx passes to buildPainWorkspaceEmrPreview is also passed by 종결's own call (no silent drop)",
    missingFromCompletion.length === 0,
  )
  const extraInCompletion = [...completionKeys].filter((k) => !referenceKeys.has(k))
  assert(
    "Batch 4.1-A: 종결's call has zero extra keys beyond PainWorkspace.tsx's -- the former defect #2 clinician-judgment-only keys (clinicianJudgmentAssessment/Treatment/Plan) are gone from both call sites",
    extraInCompletion.length === 0,
  )

  // T3 (Batch 4.1-A §15.7): the removed clinicianJudgment* keys must not
  // appear anywhere in the bundled DoctorView.tsx runtime output (not just
  // absent from this one call site's source text -- the bundle is the
  // ground truth of what actually ships).
  const doctorViewBundleSrc = await readFile(
    fileURLToPath(new URL('./.doctor-view-bundle.cjs', import.meta.url)),
    'utf8',
  )
  for (const key of ['clinicianJudgmentAssessment', 'clinicianJudgmentTreatment', 'clinicianJudgmentPlan']) {
    assert(`T3: .doctor-view-bundle.cjs no longer contains "${key}"`, !doctorViewBundleSrc.includes(key))
  }

  // T5 (Batch 4.1-A §15.7)/T15 (Batch 4.1-C §16.1/§16.6): SUPERSEDED by
  // Batch 4.1-D. Both pinned that `judgmentRecordedFieldCount` -- the
  // "디브리핑·학습 기록" accordion's badge -- returned 0 for a judgment
  // where only some already-deprecated field was filled (saju_only_
  // prediction et al. for T5, innate_features/symptom_links for T15).
  // §17.1/§17.2 removes the function itself (its only caller, that
  // accordion, is gone -- see DoctorView.tsx's own comment at the removal
  // site), so there is no more return value to pin either. Checked at the
  // bundle level (ASCII identifier, not a Korean literal, so this is
  // load-bearing per DECISIONS.md's "테스트 규약 2건 확정" entry -- the
  // same bundle T3 above already reads).
  assert(
    'T5/T15 superseded by Batch 4.1-D §17.1/§17.2: .doctor-view-bundle.cjs no longer exports/defines judgmentRecordedFieldCount',
    !doctorViewBundleSrc.includes('judgmentRecordedFieldCount'),
  )

  // C-5 (Opus closing review): EmrPreviewCard's "복사는 「다음」 레인의
  // 「종결」 섹션에서 합니다." hint used to be hard-coded inside
  // EmrPreviewCard.tsx itself, so it rendered even in fixtures/preview
  // mode and for legacy records with no patient_id -- contexts where 종결
  // never renders (it is gated on `mode === 'server' &&
  // selectedRecord?.patient_id`). The fix makes it a `copyHint?: string`
  // prop the CALLER supplies, so the call site can omit it when 종결 is
  // not on screen.
  const herbalWorkspaceSrc = await readFile(
    fileURLToPath(new URL('../src/doctor/workspace/HerbalWorkspace.tsx', import.meta.url)),
    'utf8',
  )
  const doctorWorkspaceSrc = await readFile(
    fileURLToPath(new URL('../src/doctor/workspace/DoctorWorkspace.tsx', import.meta.url)),
    'utf8',
  )
  assert(
    'C-5: EmrPreviewCard.tsx declares copyHint as an optional prop (the caller decides, not a hard-coded string)',
    /copyHint\s*\?:\s*string/.test(emrPreviewCardSrc),
  )
  assert(
    'C-5: EmrPreviewCard.tsx renders the hint <p> only when copyHint is given (conditionally, not unconditionally)',
    /\{copyHint\s*&&\s*<p[\s\S]{0,80}>\{copyHint\}<\/p>\}/.test(emrPreviewCardSrc),
  )
  assert(
    'C-5: PainWorkspace.tsx forwards a copyHint prop into its EmrPreviewCard call',
    /<EmrPreviewCard\s+text=\{emrText\}\s+copyHint=\{copyHint\}\s*\/>/.test(painWorkspaceSrc),
  )
  assert(
    'C-5: HerbalWorkspace.tsx forwards a copyHint prop into its EmrPreviewCard call',
    /<EmrPreviewCard\s+text=\{emrText\}\s+copyHint=\{copyHint\}\s*\/>/.test(herbalWorkspaceSrc),
  )
  assert(
    "C-5: DoctorWorkspace.tsx derives the hint from `nextLaneFooter` (the exact same signal DoctorView.tsx gates 종결's own render on) rather than always supplying it, and passes it as copyHint to both PainWorkspaceNext and HerbalWorkspaceNext",
    /nextLaneFooter\s*!=\s*null\s*\?\s*'복사는 「다음」 레인의 「종결」 섹션에서 합니다\.'\s*:\s*undefined/.test(doctorWorkspaceSrc) &&
      (doctorWorkspaceSrc.match(/copyHint=\{emrPreviewCopyHint\}/g) ?? []).length === 2,
  )
}

console.log(`\n${passCount} assertions passed, 0 failed (total ${passCount})`)
