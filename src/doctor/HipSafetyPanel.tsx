import { computeHipFlags } from '../spec/hipLogic'
import { toHipStateFromDoctorPayload } from '../spec/hipAdapter'
import type { DoctorPayload } from './types'

/** 실제 제출은 서브모듈이 완전히 빈 객체일 수 없다 -- DoctorView.tsx의 동명 헬퍼와 동일한 이유. */
function isNonEmptyObject(value: unknown): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && Object.keys(value).length > 0
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
  if (!isNonEmptyObject(payload.responses.modules.hip)) {
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
