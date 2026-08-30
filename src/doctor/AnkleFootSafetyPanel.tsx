import { computeAnkleFootFlags } from '../spec/ankleFootLogic'
import { toAnkleFootStateFromDoctorPayload } from '../spec/ankleFootAdapter'
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
 * ANKLE_FOOT_V1 DoctorView safety panel.
 *
 * This component is intentionally presentation-only: it recomputes the already
 * CLOSED module flags from the submitted payload and never invents a diagnosis,
 * Ottawa result, Wells score, Thompson result, or objective finding.
 *
 * It is kept in a separate file so the final DoctorView wiring can be a minimal
 * import + render change after this component has independently type-checked.
 */
export function AnkleFootSafetyPanel({ payload }: { payload: DoctorPayload }) {
  // 무관함(null)과 계산 불가(applicable하지만 손상)를 분리 -- 5차 독립
  // 리뷰 HIGH-2, DoctorView.tsx의 SafetyPanel들과 동일한 원칙.
  if (payload.responses.safety_flags.ankle_foot == null) return null
  if (!isNonEmptyObject(payload.responses.modules.ankle_foot)) {
    return <SafetyDataUnavailableNotice label="발목/발(ANKLE/FOOT)" />
  }

  const state = toAnkleFootStateFromDoctorPayload(payload.responses, payload.flags.general_red)
  const flags = computeAnkleFootFlags(state)
  const locked = flags.ankle_foot_safety_status !== 'CLEAR'

  return (
    <div className={`doctor__lbpSafety doctor__lbpSafety--${flags.ankle_foot_safety_status.toLowerCase()}`}>
      <span className="doctor__safetyGlance__title">안전 확인 — 발목/발(ANKLE/FOOT)</span>
      <div className="doctor__safetyGlance__items">
        <span className="doctor__safetyChip">
          <strong>안전 확인</strong> {STATUS_LABEL[flags.ankle_foot_safety_status]}
        </span>
        <span className="doctor__safetyChip">
          <strong>신속 의뢰 고려</strong> {flags.expedited_referral_consider ? '예' : '아니요'}
        </span>
        <span className="doctor__safetyChip">
          <strong>골절·영상 평가 고려</strong> {flags.fracture_imaging_consider ? '예' : '아니요'}
        </span>
        <span className="doctor__safetyChip">
          <strong>아킬레스건 평가 필요</strong> {flags.achilles_rupture_assessment_required ? '예' : '아니요'}
        </span>
        <span className="doctor__safetyChip">
          <strong>감염/당뇨발 평가 필요</strong> {flags.infection_assessment_required ? '예' : '아니요'}
        </span>
        <span className="doctor__safetyChip">
          <strong>DVT 평가 필요</strong> {flags.dvt_assessment_required ? '예' : '아니요'}
        </span>
        <span className="doctor__safetyChip">
          <strong>신경학적 평가 필요</strong> {flags.neuro_assessment_required ? '예' : '아니요'}
        </span>
      </div>
      {flags.dvt_assessment_required && (
        <p className="doctor__derivedNote">
          DVT 가능성을 확정한 것이 아니라 clinician-side 평가/Wells 확인이 필요합니다.
        </p>
      )}
      {flags.achilles_rupture_assessment_required && (
        <p className="doctor__derivedNote">
          환자 문진만으로 파열을 확정하지 않습니다 — Thompson test 및 국소 진찰은 clinician 확인 영역입니다.
        </p>
      )}
      {flags.fracture_imaging_consider && (
        <p className="doctor__derivedNote">
          환자보고 체중부하/기능 정보는 영상 평가 고려 신호이며 Ottawa rule 결과를 자동 생성하지 않습니다.
        </p>
      )}
      {locked && (
        <p className="doctor__derivedNote">
          안전 확인 전까지 일상적인 운동/도수치료 추천은 잠급니다.
        </p>
      )}
    </div>
  )
}
