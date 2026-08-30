import { computeTmjFlags } from '../spec/tmjLogic'
import { toTmjStateFromDoctorPayload } from '../spec/tmjAdapter'
import { ageFromDoctorPayload } from '../spec/lbpAdapter'
import type { DoctorPayload } from './types'

/** 실제 제출은 서브모듈이 완전히 빈 객체일 수 없다 -- DoctorView.tsx의 동명 헬퍼와 동일한 이유. */
function isNonEmptyObject(value: unknown): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && Object.keys(value).length > 0
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
  if (payload.responses.safety_flags.tmj == null || !isNonEmptyObject(payload.responses.modules.tmj)) return null

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
