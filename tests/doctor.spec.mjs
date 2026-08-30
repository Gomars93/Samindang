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
import {
  DoctorView,
  isDoctorPayloadShapeUsable,
  DoctorRecordFallback,
  frequencyField,
  aggravatingField,
  primaryModuleFields,
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
  assert('v2.1 fixture: 동반문제 section shows the legacy-compat empty state (동반문제 없음)', /동반문제<\/h2>[\s\S]{0,400}동반문제 없음/.test(html))
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

// 13i. 중복 감사(§PART9): "1~3개월"(주호소 duration 답) 텍스트는 정확히 2번 —
//      기존 주호소 섹션, 명리 검토의 "현재 문진 요약" 열. PR #24부터 herbal
//      hero는 duration을 별도로 보여주지 않으므로(herbal 프로필의 10초
//      요약은 전신 증상 우선 -- pain hero만 duration을 보여준다) 예상
//      횟수가 이전 3회에서 2회로 줄었다 -- 이는 의도된 아키텍처 변경이다.
{
  const html = renderDoctorView('수면 주호소 + 동반 소화/통증')
  const durationLabel = optionLabel('VISIT_03_SYMPTOM_DURATION', '1_3m')
  const count = html.split(durationLabel).length - 1
  assert('duplication audit: duration label renders exactly 2 times (주호소 + myungri column)', count === 2)
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
  assert('round 11: the record offers a 진료 / 자료 보기 surface switch', html.includes('doctor__recordTabs') && html.includes('자료 보기'))
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
  /* ---- Myungri is a SEPARATE surface, never inside the clinical flow.
     For a herbal/mixed record it exists as its own panel; for a pain
     record it does not exist at all (the standing Phase 2 invariant). ---- */
  const herbal = renderDoctorView('수면 주호소 + 동반 소화/통증')
  const herbalReferenceStart = herbal.indexOf('doctor__referenceNote')
  const myungriIdx = herbal.indexOf('명리 검토')
  assert('round 11: a herbal record still has its Myungri content', myungriIdx !== -1)
  assert('round 11: Myungri is NOT on the default clinical surface', myungriIdx > herbalReferenceStart)
  assert('round 11: the clinical workspace itself contains no Myungri block', !herbal.includes('workspace__myungri'))

  const pain = renderDoctorView('허리 통증 주호소 (LBP, 확인 필요)')
  assert('round 11: a pain record offers no Myungri surface at all', !pain.includes('명리 검토'))
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
    'resilience: saju.policy.pending_approval is read through asArray() at every render/JudgmentPanel-prop site',
    (src.match(/asArray(?:<string>)?\(saju\.policy\.pending_approval\)/g) ?? []).length >= 3,
  )
  assert(
    'resilience: r.reproductive_status.derived is optional-chained before .source is read',
    /r\.reproductive_status\.derived\?\.source/.test(src),
  )
  assert(
    'resilience: saju.normalized?.solarDate is optional-chained before its .year/.month/.day are read',
    /saju\.normalized\?\.solarDate/.test(src),
  )
  assert(
    'resilience: MyungriCompactCard checks saju.pillars?.day (not just saju.pillars) before calling .charAt on it',
    /if \(!saju\.pillars\?\.day\)/.test(src),
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
    "resilience: every simple regional SafetyPanel gate (Neck/Knee/Elbow/WristHand) uses nullish (== null) and additionally requires its own modules.<region> submodule via isNonEmptyObject() -- a legacy record with safety_flags.<region> entirely absent (undefined, not null), or modules.<region> present but empty, must not fail the strict === null check open",
    ['neck', 'knee', 'elbow', 'wrist_hand'].every((region) =>
      new RegExp(`safety_flags\\.${region} == null \\|\\|.{0,80}isNonEmptyObject\\(payload\\.responses\\.modules\\.${region}\\)`, 's').test(
        src,
      ),
    ),
  )
  assert(
    'resilience: NeckSafetyPanel additionally requires reproductive_status.derived and a null-or-string-array medical_history_flags -- neckAdapter.ts (frozen) mapPregnancyStatus/mapMajorHistory crash on the missing/wrong-typed forms of each',
    /safety_flags\.neck == null \|\|\s*\n\s*!isNonEmptyObject\(payload\.responses\.modules\.neck\) \|\|\s*\n\s*!payload\.responses\.reproductive_status\.derived \|\|\s*\n\s*!isNullOrStringArray\(payload\.responses\.medical_history\.medical_history_flags\)/.test(
      src,
    ),
  )
  assert(
    'resilience: ShoulderSafetyPanel additionally requires modules.neck (not just modules.shoulder) via isNonEmptyObject(), plus the same reproductive_status.derived/medical_history_flags checks as NeckSafetyPanel -- shoulderAdapter.ts (frozen) internally calls toNeckStateFromDoctorPayload, so computing shoulder state without any of these crashes inside that frozen adapter',
    /safety_flags\.shoulder == null \|\|\s*\n\s*!isNonEmptyObject\(payload\.responses\.modules\.shoulder\) \|\|\s*\n\s*!isNonEmptyObject\(payload\.responses\.modules\.neck\) \|\|\s*\n\s*!payload\.responses\.reproductive_status\.derived \|\|\s*\n\s*!isNullOrStringArray\(payload\.responses\.medical_history\.medical_history_flags\)/.test(
      src,
    ),
  )
  assert(
    "resilience: the LbpSafetyPanel gate additionally requires modules.lbp (via isNonEmptyObject), reproductive_status.derived, and a null-or-string-array medical_history_flags -- not just primary_module_detail === 'LBP'",
    /primary_module_detail !== 'LBP' \|\|\s*\n\s*!isNonEmptyObject\(payload\.responses\.modules\.lbp\) \|\|\s*\n\s*!payload\.responses\.reproductive_status\.derived \|\|\s*\n\s*!isNullOrStringArray\(payload\.responses\.medical_history\.medical_history_flags\)/.test(
      src,
    ),
  )
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
 * ---------------------------------------------------------------------- */
{
  const hipSrc = await readFile(fileURLToPath(new URL('../src/doctor/HipSafetyPanel.tsx', import.meta.url)), 'utf8')
  assert(
    'resilience: HipSafetyPanel gate uses nullish (== null) and additionally requires a non-empty modules.hip',
    /safety_flags\.hip == null \|\| !isNonEmptyObject\(payload\.responses\.modules\.hip\)\) return null/.test(hipSrc),
  )

  const tmjSrc = await readFile(fileURLToPath(new URL('../src/doctor/TmjSafetyPanel.tsx', import.meta.url)), 'utf8')
  assert(
    'resilience: TmjSafetyPanel gate uses nullish (== null) and additionally requires a non-empty modules.tmj',
    /safety_flags\.tmj == null \|\| !isNonEmptyObject\(payload\.responses\.modules\.tmj\)\) return null/.test(tmjSrc),
  )

  const ankleSrc = await readFile(
    fileURLToPath(new URL('../src/doctor/AnkleFootSafetyPanel.tsx', import.meta.url)),
    'utf8',
  )
  assert(
    'resilience: AnkleFootSafetyPanel gate uses nullish (== null) and additionally requires a non-empty modules.ankle_foot',
    /safety_flags\.ankle_foot == null \|\|\s*\n\s*!isNonEmptyObject\(payload\.responses\.modules\.ankle_foot\)/.test(ankleSrc),
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
    'r.safety_flags.red_flag_general',
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
  assert('resilience fallback: shows the known status', html.includes('viewed'))
  assert('resilience fallback: never mentions pain/herbal/mixed view-profile labels', !/통증|한약·전신|혼합/.test(html))

  const recordWithoutPatient = { ...recordWithPatient, patient_id: undefined }
  const htmlNoPatient = renderToString(React.createElement(DoctorRecordFallback, { record: recordWithoutPatient }))
  assert(
    'resilience fallback: without patient_id, still renders the banner without throwing',
    htmlNoPatient.includes('상세 임상 화면을 표시할 수 없습니다'),
  )

  const htmlNoRecord = renderToString(React.createElement(DoctorRecordFallback, { record: undefined }))
  assert('resilience fallback: record=undefined still renders without throwing', htmlNoRecord.includes('상세 임상 화면을 표시할 수 없습니다'))
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
  assert(
    'resilience: server-mode boundary key is derived from the selected record id',
    /key=\{mode === 'server' \? \(selectedRecord\?\.id \?\? 'none'\) : /.test(src),
  )
  assert(
    'resilience: fixtures-mode boundary key changes with both fixtureIndex and workspaceScenarioId ' +
      '(switching fixture/scenario must remount and clear any stale error state -- a constant key would ' +
      "leave one fixture's error banner stuck over the next fixture's healthy content)",
    /: `fixtures:\$\{fixtureIndex\}:\$\{workspaceScenarioId\}`\}/.test(src),
  )
  assert(
    'resilience: !payloadShapeOk renders DoctorRecordFallback instead of the normal tab content',
    /\{!payloadShapeOk \? \(\s*<DoctorRecordFallback/.test(src),
  )
}

console.log(`\n${passCount} assertions passed, 0 failed (total ${passCount})`)
