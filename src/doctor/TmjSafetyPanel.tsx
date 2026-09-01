import { computeTmjFlags } from '../spec/tmjLogic'
import { toTmjStateFromDoctorPayload } from '../spec/tmjAdapter'
import { ageFromDoctorPayload } from '../spec/lbpAdapter'
import type { DoctorPayload } from './types'

/** 실제 제출은 서브모듈이 완전히 빈 객체일 수 없다 -- DoctorView.tsx의 동명 헬퍼와 동일한 이유. */
function isNonEmptyObject(value: unknown): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && Object.keys(value).length > 0
}

/**
 * 8차 독립 리뷰 HIGH-1: toTmjStateFromDoctorPayload가
 * payload.flags.general_red를 그대로 신뢰한다 -- HipSafetyPanel.tsx의
 * 동명 헬퍼와 동일한 이유로 로컬 사본을 둔다.
 */
const REQUIRED_FLAG_KEYS = [
  'general_red',
  'gi_needs_review',
  'bowel_needs_review',
  'sleep_disorder_review',
  'sleep_disorder_priority_review',
  'response_consistency_review',
  'requires_staff_check',
] as const

/**
 * 8차 독립 리뷰 HIGH-3: HipSafetyPanel.tsx의 동명 헬퍼와 동일한 이유/
 * 계산식.
 */
function isFlagsConsistentWithResponses(flags: Record<string, unknown>, r: DoctorPayload['responses']): boolean {
  const redFlagGeneral = r.safety_flags?.red_flag_general
  const generalRedExpected = Array.isArray(redFlagGeneral) && redFlagGeneral.some((v) => v !== 'none')
  if (flags.general_red !== generalRedExpected) return false
  const giExpected = r.modules?.gi?.unable_to_eat_or_drink === 'yes'
  if (flags.gi_needs_review !== giExpected) return false
  const bowelExpected = r.modules?.bowel?.blood_or_black_stool === 'yes'
  if (flags.bowel_needs_review !== bowelExpected) return false
  // 9차 독립 리뷰 HIGH-1: DoctorView.tsx의 동명 헬퍼와 동일한 이유로
  // 나머지 4개 키도 재계산해 대조한다.
  const requiresStaffCheckExpected = generalRedExpected || giExpected || bowelExpected
  if (flags.requires_staff_check !== requiresStaffCheckExpected) return false

  const sleepScreen = r.modules?.sleep?.menopause?.sleep_disorder_screen
  const sleepScreenArr = Array.isArray(sleepScreen) ? sleepScreen : []
  const sleepDisorderReviewExpected =
    sleepScreenArr.includes('loud_snoring') || sleepScreenArr.includes('restless_legs_pattern')
  if (flags.sleep_disorder_review !== sleepDisorderReviewExpected) return false
  const sleepDisorderPriorityReviewExpected =
    sleepScreenArr.includes('witnessed_apnea') || sleepScreenArr.includes('choking_gasping')
  if (flags.sleep_disorder_priority_review !== sleepDisorderPriorityReviewExpected) return false

  const ms01 = r.modules?.sleep?.menopause?.stage
  const womenSafety = r.reproductive_status?.reproductive_status
  const womenSafetyHas = (v: string) => Array.isArray(womenSafety) && womenSafety.includes(v)
  const responseConsistencyReviewExpected =
    (ms01 === 'amenorrhea_12m_plus' && (womenSafetyHas('pregnant') || womenSafetyHas('pregnancy_possible'))) ||
    (ms01 === 'still_regular' && womenSafetyHas('menopause'))
  if (flags.response_consistency_review !== responseConsistencyReviewExpected) return false

  return true
}

function isFlagsUsable(flags: unknown, r: DoctorPayload['responses']): boolean {
  if (typeof flags !== 'object' || flags === null || Array.isArray(flags)) return false
  const f = flags as Record<string, unknown>
  if (!REQUIRED_FLAG_KEYS.every((key) => typeof f[key] === 'boolean')) return false
  return isFlagsConsistentWithResponses(f, r)
}

/**
 * "이 부위는 이 레코드와 무관하다"와 "관련은 있지만 계산 불가"를 구분한다
 * -- DoctorView.tsx의 동명 헬퍼와 동일한 이유(5차 독립 리뷰 HIGH-2).
 */
function SafetyDataUnavailableNotice({ label }: { label: string }) {
  return (
    <div className="doctor__lbpSafety doctor__lbpSafety--unavailable">
      <span className="doctor__safetyGlance__title">안전 확인 — {label}</span>
      <p className="doctor__derivedNote">
        저장된 응답 일부가 없거나 형식이 예상과 달라(레거시/손상 데이터로 보임) 안전 상태를 자동으로 계산할 수 없습니다 — 원장 확인 필요.
      </p>
    </div>
  )
}

const STATUS_LABEL = {
  CLEAR: '안전',
  REVIEW_REQUIRED: '확인 필요',
  URGENT_REVIEW: '긴급 확인 필요',
} as const

/**
 * TMJ_V1 DoctorView safety panel (턱관절/얼굴).
 *
 * This component is intentionally presentation-only: it recomputes the already
 * CLOSED module flags from the submitted payload and never invents a diagnosis,
 * abscess confirmation, GCA diagnosis, occlusion/ROM/cranial-nerve finding, or
 * imaging result. `age` reuses the existing authoritative
 * `ageFromDoctorPayload` convention (src/spec/lbpAdapter.ts) -- no new age
 * calculation rule.
 *
 * It is kept in a separate file so the final DoctorView wiring can be a minimal
 * import + render change, matching AnkleFootSafetyPanel.tsx's precedent.
 */
export function TmjSafetyPanel({ payload }: { payload: DoctorPayload }) {
  // 무관함(null)과 계산 불가(applicable하지만 손상)를 분리 -- 5차 독립
  // 리뷰 HIGH-2, DoctorView.tsx의 SafetyPanel들과 동일한 원칙.
  if (payload.responses.safety_flags.tmj == null) return null
  if (!isNonEmptyObject(payload.responses.modules.tmj) || !isFlagsUsable(payload.flags, payload.responses)) {
    return <SafetyDataUnavailableNotice label="턱관절/얼굴(TMJ)" />
  }

  const age = ageFromDoctorPayload(payload.responses)
  const state = toTmjStateFromDoctorPayload(payload.responses, payload.flags.general_red, age)
  const flags = computeTmjFlags(state)
  const locked = flags.tmj_safety_status !== 'CLEAR'

  return (
    <div className={`doctor__lbpSafety doctor__lbpSafety--${flags.tmj_safety_status.toLowerCase()}`}>
      <span className="doctor__safetyGlance__title">안전 확인 — 턱관절/얼굴(TMJ)</span>
      <div className="doctor__safetyGlance__items">
        <span className="doctor__safetyChip">
          <strong>안전 확인</strong> {STATUS_LABEL[flags.tmj_safety_status]}
        </span>
        <span className="doctor__safetyChip">
          <strong>신속 의뢰 고려</strong> {flags.expedited_referral_consider ? '예' : '아니요'}
        </span>
        <span className="doctor__safetyChip">
          <strong>외상·탈구 평가 필요</strong> {flags.trauma_or_dislocation_assessment_required ? '예' : '아니요'}
        </span>
        <span className="doctor__safetyChip">
          <strong>치과·구강 평가 필요</strong> {flags.dental_or_oral_assessment_required ? '예' : '아니요'}
        </span>
        <span className="doctor__safetyChip">
          <strong>감염 평가 필요</strong> {flags.infection_assessment_required ? '예' : '아니요'}
        </span>
        <span className="doctor__safetyChip">
          <strong>측두동맥염(GCA) 평가 필요</strong> {flags.gca_assessment_required ? '예' : '아니요'}
        </span>
        <span className="doctor__safetyChip">
          <strong>신경학적 평가 필요</strong> {flags.neuro_assessment_required ? '예' : '아니요'}
        </span>
      </div>
      {flags.gca_assessment_required && (
        <p className="doctor__derivedNote">
          측두동맥염(GCA) 확진이 아니라 clinician-side 평가/의뢰 판단이 필요한 패턴 신호입니다 — 생년월일 미상인 경우도 negative로 처리하지 않습니다.
        </p>
      )}
      {flags.dental_or_oral_assessment_required && (
        <p className="doctor__derivedNote">
          환자 문진만으로 치아 농양·감염을 확진하지 않습니다 — 구강 진찰은 clinician 확인 영역입니다.
        </p>
      )}
      {flags.trauma_or_dislocation_assessment_required && (
        <p className="doctor__derivedNote">
          환자보고 교합 변화/개폐구 기능 정보는 평가 필요 신호이며 객관적 ROM·정복 여부를 자동 판정하지 않습니다.
        </p>
      )}
      {locked && (
        <p className="doctor__derivedNote">
          안전 확인 전까지 일상적인 운동/도수치료 추천은 잠깁니다.
        </p>
      )}
    </div>
  )
}
