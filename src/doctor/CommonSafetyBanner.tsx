/**
 * Common Safety area — extracted unchanged from DoctorView.tsx's inline
 * urgent-redflag banner + "안전정보 한눈에" (SafetyGlance) block (PR #24
 * Phase 2). Same computed inputs (DoctorPayload) and same rendered output
 * as before the extraction; this file only moves the code so the new
 * Doctor Workspace shell can render it once, above every profile/tab,
 * instead of it living inline in one giant component.
 *
 * This is presentation-only. It reads already-computed flags/responses; it
 * does not compute anything new and does not decide any clinical meaning.
 */
import { answerLabel, optionLabels } from './labels'
import type { AnswerValue } from '../types'
import type { DoctorPayload } from './types'

type Responses = DoctorPayload['responses']

function safetyGlanceItems(
  r: Responses,
  flags: DoctorPayload['flags'],
): { key: string; label: string; text: string }[] {
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

  const historyFlags = ((r.medical_history.medical_history_flags as string[] | null) ?? []).filter(
    (v) => v !== 'none',
  )
  if (historyFlags.length > 0) {
    items.push({ key: 'history', label: '주요 병력', text: optionLabels('HISTORY_01', historyFlags).join(', ') })
  }

  const derived = r.reproductive_status.derived
  if (derived && (derived.pregnant || derived.pregnancy_possible || derived.postpartum_1y || derived.breastfeeding)) {
    const parts = [
      derived.pregnant && '임신 중',
      derived.pregnancy_possible && '임신 가능성',
      derived.postpartum_1y && '출산 후 1년 이내',
      derived.breastfeeding && '모유수유 중',
    ].filter((v): v is string => Boolean(v))
    items.push({ key: 'reproductive', label: '임신/수유', text: parts.join(', ') })
  }

  if (r.allergy.allergy_yn === 'yes') {
    items.push({
      key: 'allergy',
      label: '알레르기',
      text: answerLabel('ALLERGY_02', r.allergy.allergy_detail) || '있음',
    })
  }

  // 위험신호는 배너에서 이미 전체 내용을 보여준다 — 여기서는 같은 문장을
  // 반복하지 않고, 위에 배너가 있다는 것만 짧게 가리킨다.
  if (flags.requires_staff_check) {
    items.push({ key: 'redflag', label: '위험신호', text: '있음 — 위 안전 확인 배너 참고' })
  }

  // MENOPAUSE_SLEEP MS_05: 진단명 노출 없이 원장 확인용으로만 표시한다(delta 3장).
  if (flags.sleep_disorder_priority_review) {
    items.push({
      key: 'sleep_disorder_priority',
      label: '수면장애 선별',
      text: `우선 확인 필요 — ${answerLabel('MS_05', r.modules.sleep?.menopause?.sleep_disorder_screen)}`,
    })
  } else if (flags.sleep_disorder_review) {
    items.push({
      key: 'sleep_disorder',
      label: '수면장애 선별',
      text: `확인 필요 — ${answerLabel('MS_05', r.modules.sleep?.menopause?.sleep_disorder_screen)}`,
    })
  }

  if (flags.response_consistency_review) {
    items.push({
      key: 'response_consistency',
      label: '응답 확인 필요',
      text: '생리 상태(MS_01)와 임신/폐경 관련 응답이 서로 다릅니다 — 자동 수정하지 않음',
    })
  }

  /**
   * Routing/UX v2 §20-21: 자유입력을 줄인 대신 clinician confirmation cue를
   * 강화한다. 환자 선택만으로 진단/객관적 소견을 만들지 않고 "확인
   * 필요"/"진료 중 확인" 수준으로만 표시한다. 기존 urgent safety
   * panel/redflag보다 강하게 보이면 안 되므로 이 함수의 기존 항목들
   * 뒤에(가장 낮은 우선순위로) 추가한다 -- §21 우선순위(1.safety/urgent
   * 2.medication/allergy 3.surgery/history 4.추가 전달사항 5.기타 상세)
   * 중 1~2는 위에 이미 있고, 여기서는 3~5만 이 순서로 덧붙인다.
   */
  if (r.surgery_history.surgery_yn === 'yes') {
    items.push({ key: 'surgery', label: '수술·입원력', text: '있음 — 종류/시기 확인' })
  }

  if (r.free_text.free_text_yn === 'yes') {
    items.push({ key: 'free_text', label: '추가 전달사항', text: '있음 — 진료 중 확인' })
  }

  // "기타" 선택 확인 필요 항목들을 하나의 배지로 묶는다 -- 필드마다 따로
  // 배지를 만들면 노란 배지가 난립한다(§21).
  const otherDetailFlags: string[] = []
  if (r.visit_goal.primary_symptom === 'other') otherDetailFlags.push('기타 주호소')
  if (((r.secondary_concerns.secondary_concerns as string[] | null) ?? []).includes('other')) {
    otherDetailFlags.push('기타 동반증상')
  }
  if (((r.modules.sleep?.awakening_reasons as string[] | null) ?? []).includes('other')) {
    otherDetailFlags.push('기타 수면 원인')
  }
  if (r.modules.pain?.primary_location === 'other') otherDetailFlags.push('기타 통증 부위')
  if (r.modules.pain?.radiation === 'other') otherDetailFlags.push('기타 방사통 부위')
  if (((r.modules.women?.problems as string[] | null) ?? []).includes('other')) {
    otherDetailFlags.push('기타 여성 건강 상담')
  }
  if (((r.modules.pregnancy?.concerns as string[] | null) ?? []).includes('other')) {
    otherDetailFlags.push('기타 임신 상담')
  }
  if (((r.modules.postpartum?.problems as string[] | null) ?? []).includes('other')) {
    otherDetailFlags.push('기타 산후 상담')
  }
  if (otherDetailFlags.length > 0) {
    items.push({ key: 'other_detail', label: '기타 확인', text: `${otherDetailFlags.join(', ')} — 진료 중 확인` })
  }

  return items
}

function SafetyGlance({ r, flags }: { r: Responses; flags: DoctorPayload['flags'] }) {
  const items = safetyGlanceItems(r, flags)
  if (items.length === 0) {
    return <p className="doctor__safetyGlance doctor__safetyGlance--empty">특이 안전정보 없음</p>
  }
  return (
    <div className="doctor__safetyGlance">
      <span className="doctor__safetyGlance__title">안전정보 한눈에</span>
      <div className="doctor__safetyGlance__items">
        {items.map((it) => (
          <span key={it.key} className="doctor__safetyChip">
            <strong>{it.label}</strong> {it.text}
          </span>
        ))}
      </div>
    </div>
  )
}

function answerLabelFor(qid: string, value: AnswerValue | undefined): string {
  return answerLabel(qid, value)
}

/**
 * Common Safety — always rendered above any workspace tab, in every
 * view_profile (pain/herbal/mixed). Never gated behind a tab: a safety
 * flag must never be one click away from being missed (governing task
 * Phase 2).
 */
export function CommonSafetyBanner({ payload }: { payload: DoctorPayload }) {
  const r = payload.responses
  const { flags } = payload

  const generalFlagLabels = optionLabels(
    'SAFETY_01',
    ((r.safety_flags.red_flag_general as string[] | null) ?? []).filter((v) => v !== 'none'),
  )

  return (
    <div className="doctor__commonSafety" aria-label="공통 안전 확인">
      {flags.requires_staff_check && (
        <div className="doctor__banner doctor__banner--danger">
          <strong>안전 확인 필요</strong>
          <p>
            환자가 아래 내용을 문진에서 보고했습니다. 이는 진단이 아니며, 진료
            전 직원/원장의 확인이 필요합니다.
          </p>
          <ul>
            {generalFlagLabels.length > 0 && (
              <li>공통 위험 신호(SAFETY_01): {generalFlagLabels.join(', ')}</li>
            )}
            {flags.gi_needs_review && (
              <li>
                소화 문진(GI_03) 응답: &ldquo;
                {answerLabelFor('GI_03', r.modules.gi?.unable_to_eat_or_drink)}&rdquo;
              </li>
            )}
            {flags.bowel_needs_review && (
              <li>
                대변 문진(BOWEL_03) 응답: &ldquo;
                {answerLabelFor('BOWEL_03', r.modules.bowel?.blood_or_black_stool)}&rdquo;
              </li>
            )}
          </ul>
        </div>
      )}

      <SafetyGlance r={r} flags={flags} />
    </div>
  )
}
