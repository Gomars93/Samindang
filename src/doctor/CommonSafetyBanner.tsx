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

/**
 * 레거시/손상된 제출은 배열이어야 할 필드가 문자열/객체 등 다른 타입으로
 * 저장돼 있을 수 있다 -- nullish 병합만으로는 안 막힌다(값 자체가 존재하고
 * truthy면 그대로 통과한다), 그리고 문자열이면 `.includes()`가 던지지 않고
 * 부분 문자열 매치로 사실을 지어낼 수도 있다. 배열이 아니면 무조건 빈
 * 배열로 취급한다.
 */
function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

/**
 * MED_USE/ALLERGY_01/SURGERY_01/FREE_01(coreSpec.ts)은 전부 `required: true`,
 * `showIf` 없이 모든 환자에게 항상 나오는 단일선택 문항이고 값 집합이
 * 고정돼 있다 -- 그래서 실제 제출은 이 필드들이 절대 null이거나 이
 * 목록 밖의 값일 수 없다. null/다른 값이면 "환자가 없다고 답함"이 아니라
 * 레거시/손상 데이터다.
 */
function isUnreadableYesNoUnknown(value: unknown, allowed: readonly string[]): boolean {
  return value != null && !allowed.includes(value as string)
}

const YES_UNKNOWN_NONE = ['yes', 'unknown', 'none'] as const
const YES_NONE = ['yes', 'none'] as const

/**
 * 6차 독립 리뷰 MEDIUM-2: `safetyGlanceItems`가 빈 배열을 반환하는 이유가
 * "정말로 안전 이슈가 없음"과 "안전 관련 필드 자체를 읽을 수 없음"(레거시/
 * 손상 데이터) 둘 다일 수 있는데, 호출부는 이를 구분하지 않고 항상
 * "특이 안전정보 없음"(긍정적 확인 문구)을 그렸다 -- 이미 검증된
 * asArray/optional-chaining 방어는 크래시만 막을 뿐, 각 항목 체크가
 * `=== 'yes'`류 비교라서 null/wrong-typed 값은 그냥 "아니요"와 동일하게
 * 조용히 넘어간다(이 배치가 막으려는 fail-open 그 자체). medical_history_flags
 * 는 항상 배열이어야 하므로 truthy인데 배열이 아니면 손상.
 * reproductive_status.derived는 남성 등 정상적으로 null일 수 있으므로
 * 이 판정에서 제외한다(false positive 방지).
 */
function hasUnreadableSafetyField(r: Responses): boolean {
  return (
    isUnreadableYesNoUnknown(r.medication.medication_use, YES_UNKNOWN_NONE) ||
    isUnreadableYesNoUnknown(r.allergy.allergy_yn, YES_UNKNOWN_NONE) ||
    isUnreadableYesNoUnknown(r.surgery_history.surgery_yn, YES_UNKNOWN_NONE) ||
    isUnreadableYesNoUnknown(r.free_text.free_text_yn, YES_NONE) ||
    (r.medical_history.medical_history_flags != null && !Array.isArray(r.medical_history.medical_history_flags))
  )
}

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

  const historyFlags = asArray<string>(r.medical_history.medical_history_flags).filter(
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
  if (asArray<string>(r.secondary_concerns.secondary_concerns).includes('other')) {
    otherDetailFlags.push('기타 동반증상')
  }
  if (asArray<string>(r.modules.sleep?.awakening_reasons).includes('other')) {
    otherDetailFlags.push('기타 수면 원인')
  }
  if (r.modules.pain?.primary_location === 'other') otherDetailFlags.push('기타 통증 부위')
  if (r.modules.pain?.radiation === 'other') otherDetailFlags.push('기타 방사통 부위')
  if (asArray<string>(r.modules.women?.problems).includes('other')) {
    otherDetailFlags.push('기타 여성 건강 상담')
  }
  if (asArray<string>(r.modules.pregnancy?.concerns).includes('other')) {
    otherDetailFlags.push('기타 임신 상담')
  }
  if (asArray<string>(r.modules.postpartum?.problems).includes('other')) {
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
    if (hasUnreadableSafetyField(r)) {
      return (
        <p className="doctor__safetyGlance doctor__safetyGlance--unavailable">
          안전정보 일부를 읽을 수 없습니다(레거시/손상 데이터로 보임) — 원장 확인 필요
        </p>
      )
    }
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
    asArray<string>(r.safety_flags.red_flag_general).filter((v) => v !== 'none'),
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
