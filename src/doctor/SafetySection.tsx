/**
 * Doctor View 재설계 v0.2 §11.3 — 통합 안전 확인 섹션.
 *
 * 부위별 안전 모듈 행(§11.2 게이트로 골라 정렬된 것, safetyModules.ts) +
 * 일반 안전정보(비-부위 6종, 기존 safetyGlanceItems 계승) + 응답 모순
 * 행(리스트 최상단 amber, §11.3)을 한 섹션에 담는다. 10종 개별 패널을
 * 스택하던 기존 구조를 대체한다.
 */
import { answerLabel, optionLabels } from './labels'
import { computeSafetyModuleRows, type SafetyClinicianInputs } from './safetyModules'
import { SafetyModuleRowView } from './SafetyModuleRowView'
import type { DoctorPayload } from './types'

type Responses = DoctorPayload['responses']

/** §PART2 "안전정보 한눈에" 계승 — 복용약/병력/임신·수유/알레르기 등 실제 값이 있는 것만. */
function safetyGlanceItems(r: Responses, flags: DoctorPayload['flags']): { key: string; label: string; text: string }[] {
  const items: { key: string; label: string; text: string }[] = []

  const medUse = r.medication.medication_use
  if (medUse === 'yes' || medUse === 'unknown') {
    const types = answerLabel('MED_TYPES', r.medication.medication_types)
    items.push({
      key: 'medication',
      label: '복용약',
      text: `${answerLabel('MED_USE', medUse)}${types ? ` — ${types}` : ''}`,
    })
  }

  const historyFlags = ((r.medical_history.medical_history_flags as string[] | null) ?? []).filter((v) => v !== 'none')
  if (historyFlags.length > 0) {
    items.push({ key: 'history', label: '주요 병력', text: optionLabels('HISTORY_01', historyFlags).join(', ') })
  }

  const derived = r.reproductive_status.derived
  if (derived.pregnant || derived.pregnancy_possible || derived.postpartum_1y || derived.breastfeeding) {
    const parts = [
      derived.pregnant && '임신 중',
      derived.pregnancy_possible && '임신 가능성',
      derived.postpartum_1y && '출산 후 1년 이내',
      derived.breastfeeding && '모유수유 중',
    ].filter((v): v is string => Boolean(v))
    items.push({ key: 'reproductive', label: '임신/수유', text: parts.join(', ') })
  }

  if (r.allergy.allergy_yn === 'yes') {
    items.push({ key: 'allergy', label: '알레르기', text: answerLabel('ALLERGY_02', r.allergy.allergy_detail) || '있음' })
  }

  if (flags.requires_staff_check) {
    items.push({ key: 'redflag', label: '위험신호', text: '있음 — 위 안전 확인 배너 참고' })
  }

  if (flags.sleep_disorder_priority_review) {
    items.push({
      key: 'sleep_disorder_priority',
      label: '수면장애 선별',
      text: `우선 확인 필요 — ${answerLabel('MS_05', r.modules.sleep.menopause.sleep_disorder_screen)}`,
    })
  } else if (flags.sleep_disorder_review) {
    items.push({
      key: 'sleep_disorder',
      label: '수면장애 선별',
      text: `확인 필요 — ${answerLabel('MS_05', r.modules.sleep.menopause.sleep_disorder_screen)}`,
    })
  }

  if (r.surgery_history.surgery_yn === 'yes') {
    items.push({ key: 'surgery', label: '수술·입원력', text: '있음 — 종류/시기 확인' })
  }

  if (r.free_text.free_text_yn === 'yes') {
    items.push({ key: 'free_text', label: '추가 전달사항', text: '있음 — 진료 중 확인' })
  }

  const otherDetailFlags: string[] = []
  if (r.visit_goal.primary_symptom === 'other') otherDetailFlags.push('기타 주호소')
  if (((r.secondary_concerns.secondary_concerns as string[] | null) ?? []).includes('other')) {
    otherDetailFlags.push('기타 동반증상')
  }
  if (((r.modules.sleep.awakening_reasons as string[] | null) ?? []).includes('other')) {
    otherDetailFlags.push('기타 수면 원인')
  }
  if (r.modules.pain.primary_location === 'other') otherDetailFlags.push('기타 통증 부위')
  if (r.modules.pain.radiation === 'other') otherDetailFlags.push('기타 방사통 부위')
  if (((r.modules.women.problems as string[] | null) ?? []).includes('other')) {
    otherDetailFlags.push('기타 여성 건강 상담')
  }
  if (((r.modules.pregnancy.concerns as string[] | null) ?? []).includes('other')) {
    otherDetailFlags.push('기타 임신 상담')
  }
  if (((r.modules.postpartum.problems as string[] | null) ?? []).includes('other')) {
    otherDetailFlags.push('기타 산후 상담')
  }
  if (otherDetailFlags.length > 0) {
    items.push({ key: 'other_detail', label: '기타 확인', text: `${otherDetailFlags.join(', ')} — 진료 중 확인` })
  }

  return items
}

export function SafetySection({
  payload,
  clinicianInputs,
}: {
  payload: DoctorPayload
  clinicianInputs?: SafetyClinicianInputs
}) {
  const rows = computeSafetyModuleRows(payload, clinicianInputs)
  const glanceItems = safetyGlanceItems(payload.responses, payload.flags)
  const responseConsistencyReview = Boolean(payload.flags.response_consistency_review)

  return (
    <section className="doctor__section doctor__safetySection">
      <h2>안전 확인</h2>

      {rows.length === 0 && glanceItems.length === 0 && !responseConsistencyReview && (
        <p className="doctor__safetyGlance doctor__safetyGlance--empty">특이 안전정보 없음</p>
      )}

      {rows.map((row) => (
        <SafetyModuleRowView key={row.key} row={row} />
      ))}

      {(glanceItems.length > 0 || responseConsistencyReview) && (
        <div className="doctor__safetyGeneral">
          <span className="doctor__safetyGlance__title">일반 안전정보</span>
          <div className="doctor__safetyGlance__items">
            {responseConsistencyReview && (
              <span className="doctor__safetyChip doctor__safetyChip--amber">
                <strong>응답 모순</strong> 생리 상태(MS_01)와 임신/폐경 관련 응답이 서로 다릅니다 — 자동 수정하지 않음
              </span>
            )}
            {glanceItems.map((it) => (
              <span key={it.key} className="doctor__safetyChip">
                <strong>{it.label}</strong> {it.text}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
