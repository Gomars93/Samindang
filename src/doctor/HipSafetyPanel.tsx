import { computeHipFlags } from '../spec/hipLogic'
import { toHipStateFromDoctorPayload } from '../spec/hipAdapter'
import type { DoctorPayload } from './types'

/** 실제 제출은 서브모듈이 완전히 빈 객체일 수 없다 -- DoctorView.tsx의 동명 헬퍼와 동일한 이유. */
function isNonEmptyObject(value: unknown): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && Object.keys(value).length > 0
}

/**
 * 8차 독립 리뷰 HIGH-1: 아래 toHipStateFromDoctorPayload가
 * payload.flags.general_red를 그대로 신뢰해 hipLogic.ts의
 * `core_safety_already_urgent`로 넘긴다 -- flags가 레거시/손상 데이터라
 * general_red가 undefined(falsy)가 되면 실제 core 응급 red flag가 있어도
 * 이 패널이 "안전"으로 조용히 뒤집힌다(policy 2/3 위반, 치료 락도 함께
 * 풀림). 7차가 CommonSafetyBanner/PainWorkspace 히어로 지표에는 이
 * 가드를 달았지만 이 SafetyPanel들은 빠뜨렸다 -- DoctorView.tsx/
 * CommonSafetyBanner.tsx의 동명 헬퍼와 동일한 이유로 로컬 사본을 둔다.
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
 * 8차 독립 리뷰 HIGH-3: 7개 키가 전부 boolean이어도 실제 responses와
 * 모순되면(수기 편집/버전 skew로 flags를 재계산하지 않은 레코드)
 * general_red를 그대로 신뢰할 수 없다 -- DoctorView.tsx의 동명 헬퍼와
 * 동일한 계산식.
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
 * HIP_V1 DoctorView safety panel (고관절/사타구니).
 *
 * Presentation-only: recomputes the already CLOSED module flags from the
 * submitted payload and never invents an objective gait/ROM/neuro finding,
 * imaging result, or definitive diagnosis (fracture, stress fracture,
 * infection). HIP shares the `low_back_pelvis` population with LBP by
 * design (H1/H7) -- this panel renders alongside (never instead of)
 * LbpSafetyPanel, and its own gate (`safety_flags.hip === null`) is
 * independent of LBP's, so both can be non-null simultaneously for a
 * HIP_GROIN_DOMINANT patient.
 *
 * Kept in a separate file, matching AnkleFootSafetyPanel.tsx/
 * TmjSafetyPanel.tsx's precedent, so DoctorView wiring stays a minimal
 * import + render change.
 */
export function HipSafetyPanel({ payload }: { payload: DoctorPayload }) {
  // 무관함(null)과 계산 불가(applicable하지만 손상)를 분리 -- 5차 독립
  // 리뷰 HIGH-2, DoctorView.tsx의 SafetyPanel들과 동일한 원칙.
  if (payload.responses.safety_flags.hip == null) return null
  if (!isNonEmptyObject(payload.responses.modules.hip) || !isFlagsUsable(payload.flags, payload.responses)) {
    return <SafetyDataUnavailableNotice label="고관절/사타구니(HIP)" />
  }

  const state = toHipStateFromDoctorPayload(payload.responses, payload.flags.general_red)
  const flags = computeHipFlags(state)
  const locked = flags.hip_safety_status !== 'CLEAR'

  return (
    <div className={`doctor__lbpSafety doctor__lbpSafety--${flags.hip_safety_status.toLowerCase()}`}>
      <span className="doctor__safetyGlance__title">안전 확인 — 고관절/사타구니(HIP)</span>
      <div className="doctor__safetyGlance__items">
        <span className="doctor__safetyChip">
          <strong>안전 확인</strong> {STATUS_LABEL[flags.hip_safety_status]}
        </span>
        <span className="doctor__safetyChip">
          <strong>신속 의뢰 고려</strong> {flags.expedited_referral_consider ? '예' : '아니요'}
        </span>
        <span className="doctor__safetyChip">
          <strong>골절 영상검사 고려</strong> {flags.fracture_imaging_consider ? '예' : '아니요'}
        </span>
        <span className="doctor__safetyChip">
          <strong>피로골절 평가 필요</strong> {flags.stress_fracture_assessment_required ? '예' : '아니요'}
        </span>
        <span className="doctor__safetyChip">
          <strong>감염 평가 필요</strong> {flags.infection_assessment_required ? '예' : '아니요'}
        </span>
        <span className="doctor__safetyChip">
          <strong>신경학적 평가 필요</strong> {flags.neuro_assessment_required ? '예' : '아니요'}
        </span>
        <span className="doctor__safetyChip">
          <strong>부하운동 잠금</strong> {flags.loading_exercise_lock ? '예' : '아니요'}
        </span>
      </div>
      {flags.stress_fracture_assessment_required && (
        <p className="doctor__derivedNote">
          피로골절을 확진하는 것이 아니라 clinician-side 평가/영상검사 판단이 필요한 패턴 신호입니다 — 확인 전까지 일상적인 부하운동 추천은 잠깁니다.
        </p>
      )}
      {flags.infection_assessment_required && (
        <p className="doctor__derivedNote">
          환자 문진만으로 감염을 확진하지 않습니다 — 발열이 없다고 해서 감염 가능성이 배제되지 않습니다.
        </p>
      )}
      {flags.fracture_imaging_consider && (
        <p className="doctor__derivedNote">
          환자보고 이전 X-ray 결과는 참고 맥락일 뿐이며 이번 영상검사 필요성이나 안전 확인 단계를 낮추지 않습니다.
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
