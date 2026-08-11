import { useEffect, useRef, useState } from 'react'
import { SECONDARY_SHORT_SCREENS } from '../spec/coreSpec'
import { answerLabel, optionLabel, optionLabels, questionLabel } from './labels'
import { DOCTOR_FIXTURES } from './fixtures'
import { JudgmentPanel } from './JudgmentPanel'
import { buildEmrSummary } from './emrSummary'
import { DOCTOR_SECTION_ORDER } from './sectionOrder'
import type { ClinicianJudgment } from './judgment'
import type { DoctorPayload } from './types'
import type { AnswerValue } from '../types'
import {
  activateVisit,
  clearActiveVisit,
  getRecorderResults,
  getSubmission,
  listSubmissions,
  saveJudgment as saveJudgmentToServer,
  setSubmissionStatus,
  type RecorderResult,
  type SubmissionRecord,
  type SubmissionSummary,
} from '../lib/serverClient'
import { WorkstationSetup } from './WorkstationSetup'
import { getStoredWorkstationId } from './workstation'
import './doctor.css'

export { DOCTOR_SECTION_ORDER }

type Responses = DoctorPayload['responses']

/**
 * 값 하나를 (질문 id 기준으로) 라벨을 붙여 렌더링한다.
 * - null/undefined(질문을 아예 보지 않음)면 아무것도 렌더링하지 않는다.
 * - 'none'/'unknown'(환자가 실제로 답한 값)은 흐리게 표시해 "안 물어봄"과
 *   구분한다. 절대 같은 모양으로 보이면 안 된다.
 */
function Field({
  qid,
  value,
  label,
}: {
  qid: string
  value: AnswerValue | undefined
  label?: string
}) {
  if (value === null || value === undefined) return null
  if (typeof value === 'string' && value.trim() === '') return null
  if (Array.isArray(value) && value.length === 0) return null

  const displayLabel = label ?? questionLabel(qid)
  const isEmptyAnswer = Array.isArray(value)
    ? value.length === 1 && (value[0] === 'none' || value[0] === 'unknown')
    : value === 'none' || value === 'unknown'
  const text = answerLabel(qid, value)

  return (
    <div className="doctorField">
      <span className="doctorField__label">{displayLabel}</span>
      <span className={`doctorField__value${isEmptyAnswer ? ' doctorField__value--muted' : ''}`}>
        {text}
      </span>
    </div>
  )
}

function boolLabel(v: boolean | null): string {
  if (v === null) return '확인되지 않음'
  return v ? '예' : '아니요'
}

function sourceLabel(source: Responses['reproductive_status']['derived']['source']): string {
  switch (source) {
    case 'WOMEN_SAFETY_01':
      return '여성 안전 문진(WOMEN_SAFETY_01)'
    case 'pregnancy_module':
      return '임신 상세 문진(PREGNANCY_01)'
    case 'postpartum_module':
      return '산후 상세 문진(POSTPARTUM_01/03)'
    default:
      return '확인되지 않음'
  }
}

function primaryConcernLabel(r: Responses): string {
  const goal = r.visit_goal.visit_goal
  if (goal === 'symptom') return answerLabel('VISIT_02_SYMPTOM_MAIN', r.visit_goal.primary_symptom)
  if (goal === 'women') return answerLabel('VISIT_02_WOMEN', r.visit_goal.women_goal)
  if (goal === 'weight') return '체중 관리'
  if (goal === 'constitution') return answerLabel('VISIT_02_CONST', r.visit_goal.constitution_goal)
  return '—'
}

/**
 * "10초 요약" 카드 및 주호소 섹션이 공유하는 계산 규칙.
 * routing.primary_module 별로 "빈도"/"핵심 악화·유발요인"에 해당하는 필드는
 * 데이터 모델에 하나만 존재한다(모듈마다 다름) — 아래 두 테이블이 그 매핑의
 * 유일한 출처다. 여기 없는 모듈(Bowel/Urinary/Women/Pregnancy/Postpartum/
 * constitution 등)은 신뢰할 수 있는 단일 필드가 없어 의도적으로 생략한다.
 */
function frequencyField(
  primaryModule: string | null,
  m: Responses['modules'],
): { qid: string; value: AnswerValue } | null {
  switch (primaryModule) {
    case 'Sleep':
      return { qid: 'SLEEP_02', value: m.sleep.frequency_per_week }
    case 'Bowel':
      return { qid: 'BOWEL_02', value: m.bowel.frequency }
    case 'Urinary':
      return { qid: 'URINARY_02', value: m.urinary.burden_frequency }
    default:
      return null
  }
}

function aggravatingField(
  primaryModule: string | null,
  m: Responses['modules'],
): { qid: string; value: AnswerValue } | null {
  switch (primaryModule) {
    case 'Sleep':
      return { qid: 'SLEEP_03', value: m.sleep.awakening_reasons }
    case 'GI':
      return { qid: 'GI_02', value: m.gi.meal_relation }
    case 'Pain': {
      const qualities = ((m.pain.pain_qualities as string[] | null) ?? []).filter(
        (q) => q === 'movement_related' || q === 'rest_pain',
      )
      return qualities.length > 0 ? { qid: 'PAIN_02', value: qualities } : null
    }
    case 'Fatigue':
      return { qid: 'FATIGUE_02', value: m.fatigue.worst_time }
    case 'Stress':
      return { qid: 'STRESS_03', value: m.stress.associated_symptoms }
    case 'Weight':
      return { qid: 'WEIGHT_02', value: m.weight.contributing_factors }
    default:
      return null
  }
}

function isEmptyValue(value: AnswerValue | null | undefined): boolean {
  if (value === null || value === undefined) return true
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'string') return value.trim() === ''
  return false
}

/** 요약 카드용 "기간 · 빈도" 한 줄. 둘 다 없으면 줄 자체를 생략한다. */
function durationFrequencyText(r: Responses, primaryModule: string | null): string | null {
  const duration = r.visit_goal.chief_duration
  const durText = isEmptyValue(duration) ? null : answerLabel('VISIT_03_SYMPTOM_DURATION', duration)
  const freq = frequencyField(primaryModule, r.modules)
  const freqText = freq && !isEmptyValue(freq.value) ? answerLabel(freq.qid, freq.value) : null
  if (!durText && !freqText) return null
  if (durText && freqText) return `${durText} · ${freqText}`
  return durText ?? freqText
}

/** Pain은 요약 카드에서만 짧은 고정 문구를 쓴다(스펙 §PART1 rule 3). */
function aggravatingSummaryText(primaryModule: string | null, m: Responses['modules']): string | null {
  const agg = aggravatingField(primaryModule, m)
  if (!agg) return null
  if (primaryModule === 'Pain') {
    return (agg.value as string[])
      .map((v) => (v === 'movement_related' ? '움직일 때 악화' : '가만히 있어도 아픔'))
      .join(', ')
  }
  return answerLabel(agg.qid, agg.value)
}

function safetyIssueCategories(flags: DoctorPayload['flags']): string[] {
  const cats: string[] = []
  if (flags.general_red) cats.push('공통 위험신호')
  if (flags.gi_needs_review) cats.push('소화 문진')
  if (flags.bowel_needs_review) cats.push('대변 문진')
  // sleep_disorder_review(선별)/response_consistency_review는 진단이 아니라
  // 확인 요청 수준이므로 여기(위험이슈 danger chip)에는 올리지 않는다 —
  // SafetyGlance("안전정보 한눈에")에서 이미 노출된다. witnessed_apnea/
  // choking_gasping 목격 보고만 우선순위가 높아 여기 포함한다.
  if (flags.sleep_disorder_priority_review) cats.push('수면장애 우선확인')
  return cats
}

/** saju.status + 정책 대기 여부 -> "계산 완료/부분/불가" 짧은 상태 문구. 임상 해석과 무관한 계산 상태 표시일 뿐이다. */
function sajuStatusLine(saju: DoctorPayload['myungri_calculation']): {
  text: string
  tone: 'neutral' | 'warning' | 'unresolved'
} {
  if (saju.status === 'resolved') {
    if (saju.policy.pending_approval.length === 0) return { text: '계산 완료', tone: 'neutral' }
    return { text: '계산 완료 (정책 승인 대기 — 값 변경 가능)', tone: 'warning' }
  }
  if (saju.status === 'partial') return { text: '부분 계산 (시주 미상)', tone: 'warning' }
  return {
    text: `계산 불가${saju.unresolved_reason ? ` — ${saju.unresolved_reason}` : ''}`,
    tone: 'unresolved',
  }
}

const PENDING_APPROVAL_LABELS: Record<string, string> = {
  day_boundary: '야자시/조자시 경계',
  true_solar_time: '진태양시',
}

/**
 * 명리 핵심요약 — 상세 계산 영역(judgment__reviewGrid) 위에 얹는 compact card.
 * 여기 값은 전부 saju 엔진이 이미 계산해서 내려준 값(pillars/flags/policy)의
 * 재배열일 뿐이다. 오행 분포·한열조습처럼 엔진이 계산하지 않는 값은 절대
 * 새로 계산하지 않고 "해석 규칙 미확정" 문구로만 남긴다(원장 판단 영역).
 */
function MyungriCompactCard({ saju }: { saju: DoctorPayload['myungri_calculation'] }) {
  if (!saju.pillars) {
    return (
      <div className="doctor__msSummary doctor__msSummary--myungri">
        <strong className="doctor__msSummary__title">명리 핵심</strong>
        <p className="doctor__msSummary__line">
          계산 불가{saju.unresolved_reason ? ` — ${saju.unresolved_reason}` : ''}
        </p>
      </div>
    )
  }

  const dayStem = saju.pillars.day.charAt(0)
  const birthInfoLine = saju.flags.hour_unknown
    ? '출생시간 미상 · 3주 6자 기준 (시주 제외)'
    : '출생시간 확인됨 · 4주 8자'
  const pendingLabels = saju.policy.pending_approval.map((k) => PENDING_APPROVAL_LABELS[k] ?? k)

  return (
    <div className="doctor__msSummary doctor__msSummary--myungri">
      <strong className="doctor__msSummary__title">명리 핵심</strong>
      <p className="doctor__msSummary__line">
        원국: 연{saju.pillars.year} 월{saju.pillars.month} 일{saju.pillars.day} 시
        {saju.pillars.hour ?? '미상'}
      </p>
      <p className="doctor__msSummary__line">일간: {dayStem}</p>
      <p className="doctor__msSummary__line">출생정보: {birthInfoLine}</p>
      <p className="doctor__msSummary__line">오행 분포: 해석 규칙 미확정 · 원장 판단 영역</p>
      <p className="doctor__msSummary__line">한열조습: 해석 규칙 미확정 · 원장 판단 영역</p>
      <p className="doctor__msSummary__line">
        계산주의: {pendingLabels.length > 0 ? `${pendingLabels.join(', ')} 정책 승인 대기` : '없음'}
      </p>
    </div>
  )
}

/**
 * "10초 요약" 카드. §PART1 규칙을 그대로 구현 — 데이터가 없으면 그 줄 자체를
 * 만들지 않는다(해석/보간 없음). payload 안의 값만 조합한다.
 */
function TenSecondSummary({ payload }: { payload: DoctorPayload }) {
  const r = payload.responses
  const { flags, routing } = payload
  const saju = payload.myungri_calculation

  const durFreq = durationFrequencyText(r, routing.primary_module)
  const aggravatingText = aggravatingSummaryText(routing.primary_module, r.modules)
  const secondaryKeys = ((r.secondary_concerns.secondary_concerns as string[] | null) ?? []).filter(
    (k) => k !== 'none',
  )
  const secondaryLabels = optionLabels('SECONDARY_01', secondaryKeys).slice(0, 2)
  const safetyCats = safetyIssueCategories(flags)
  const safetyAnswered = !isEmptyValue(r.safety_flags.red_flag_general)
  const sajuLine = sajuStatusLine(saju)

  return (
    <section className="doctor__tenSec" aria-label="10초 요약">
      <div className="doctor__tenSec__row">
        <span className="doctor__tenSecChip">
          <span className="doctor__tenSecChip__label">주호소</span>
          <span className="doctor__tenSecChip__value">{primaryConcernLabel(r)}</span>
        </span>

        {durFreq && (
          <span className="doctor__tenSecChip">
            <span className="doctor__tenSecChip__label">기간/빈도</span>
            <span className="doctor__tenSecChip__value">{durFreq}</span>
          </span>
        )}

        {aggravatingText && (
          <span className="doctor__tenSecChip">
            <span className="doctor__tenSecChip__label">핵심 악화·유발요인</span>
            <span className="doctor__tenSecChip__value">{aggravatingText}</span>
          </span>
        )}

        {secondaryLabels.length > 0 && (
          <span className="doctor__tenSecChip">
            <span className="doctor__tenSecChip__label">동반문제</span>
            <span className="doctor__tenSecChip__value">{secondaryLabels.join(', ')}</span>
          </span>
        )}

        {safetyCats.length > 0 && (
          <span className="doctor__tenSecChip doctor__tenSecChip--danger">
            <span className="doctor__tenSecChip__label">안전이슈</span>
            <span className="doctor__tenSecChip__value">{safetyCats.join(', ')}</span>
          </span>
        )}
        {safetyCats.length === 0 && safetyAnswered && (
          <span className="doctor__tenSecChip doctor__tenSecChip--muted">
            <span className="doctor__tenSecChip__label">안전이슈</span>
            <span className="doctor__tenSecChip__value">없음</span>
          </span>
        )}

        <span className={`doctor__tenSecChip doctor__tenSecChip--${sajuLine.tone}`}>
          <span className="doctor__tenSecChip__label">명리 계산</span>
          <span className="doctor__tenSecChip__value">{sajuLine.text}</span>
        </span>
      </div>
    </section>
  )
}

/** §PART2 "안전정보 한눈에" — 복용약/병력/임신·수유/알레르기 중 실제 값이 있는 것만, 위험신호는 배너를 가리키는 짧은 포인터만. */
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
      text: `우선 확인 필요 — ${answerLabel('MS_05', r.modules.sleep.menopause.sleep_disorder_screen)}`,
    })
  } else if (flags.sleep_disorder_review) {
    items.push({
      key: 'sleep_disorder',
      label: '수면장애 선별',
      text: `확인 필요 — ${answerLabel('MS_05', r.modules.sleep.menopause.sleep_disorder_screen)}`,
    })
  }

  if (flags.response_consistency_review) {
    items.push({
      key: 'response_consistency',
      label: '응답 확인 필요',
      text: '생리 상태(MS_01)와 임신/폐경 관련 응답이 서로 다릅니다 — 자동 수정하지 않음',
    })
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

/** 동반문제 카테고리(sleep/digestion/...) -> 짧은 화면 응답을 어디서 읽을지. */
const SECONDARY_MODULE_VALUE: Record<string, (sm: Responses['secondary_modules']) => AnswerValue> = {
  sleep: (sm) => sm.sleep.problems,
  digestion: (sm) => sm.gi.problems,
  bowel: (sm) => sm.bowel.problems,
  pain: (sm) => sm.pain.locations,
  urinary: (sm) => sm.urinary.problems,
  fatigue: (sm) => sm.fatigue.patterns,
  stress: (sm) => sm.stress.problems,
  women: (sm) => sm.women.problems,
  weight: (sm) => sm.weight.goal,
}

function secondaryModuleFields(r: Responses) {
  const keys = ((r.secondary_concerns.secondary_concerns as string[] | null) ?? []) as string[]
  return keys
    .filter((k) => k !== 'none' && SECONDARY_SHORT_SCREENS[k])
    .map((k) => {
      const qid = SECONDARY_SHORT_SCREENS[k]
      const value = SECONDARY_MODULE_VALUE[k]?.(r.secondary_modules) ?? null
      return { qid, value }
    })
}

/** §PART4 동반문제 칩: 카테고리 라벨 + 짧은 화면 응답 요약(2개 제한은 SECONDARY_01의 max로 이미 강제됨). */
function secondaryChipsData(r: Responses) {
  return secondaryModuleFields(r).map((f, i) => {
    const keys = ((r.secondary_concerns.secondary_concerns as string[] | null) ?? []).filter(
      (k) => k !== 'none' && SECONDARY_SHORT_SCREENS[k],
    )
    const key = keys[i]
    return {
      key,
      qid: f.qid,
      categoryLabel: optionLabel('SECONDARY_01', key),
      answerText: answerLabel(f.qid, f.value),
    }
  })
}

/** §PART5 전신·한약 참고 필드 목록 — 미리보기(요약 2~3개)와 상세 펼치기가 이 목록을 공유한다. */
function constitutionFields(r: Responses) {
  return [
    { qid: 'CONST_ENERGY', value: r.constitution_basics.energy_recovery },
    { qid: 'CONST_SLEEP', value: r.constitution_basics.sleep_basic },
    { qid: 'CONST_DIGESTION', value: r.constitution_basics.digestion_basic },
    { qid: 'CONST_BOWEL', value: r.constitution_basics.bowel_basic },
    { qid: 'HERB_APPETITE', value: r.constitution_basics.appetite_level },
    { qid: 'HERB_THERMAL', value: r.constitution_basics.thermal_tendency },
    { qid: 'HERB_THIRST', value: r.constitution_basics.thirst_level },
    { qid: 'HERB_SWEAT', value: r.constitution_basics.sweat_pattern },
  ]
}

/**
 * MENOPAUSE_SLEEP v0.2 Compact 요약을 raw enum 나열이 아니라 진료용 문장으로 보여준다.
 * Gate를 통과하지 못했으면(남성, 또는 여성이라도 gate_context가 null/'no') null —
 * 이 경우 원래 Sleep Field 목록만 보이고 이 블록 자체가 생기지 않는다.
 */
function menopauseSleepSummaryLines(sleep: Responses['modules']['sleep']): string[] | null {
  const ms = sleep.menopause
  if (ms.gate_context !== 'yes' && ms.gate_context !== 'unsure') return null

  const lines: string[] = []
  if (!isEmptyValue(ms.stage)) lines.push(`생리: ${answerLabel('MS_01', ms.stage)}`)
  if (!isEmptyValue(ms.night_vms_frequency)) {
    lines.push(`야간 열감/발한: ${answerLabel('MS_02', ms.night_vms_frequency)}`)
  }
  if (!isEmptyValue(ms.rumination_frequency)) {
    lines.push(`밤중 생각: ${answerLabel('MS_03', ms.rumination_frequency)}`)
  }

  const sleepParts = [
    !isEmptyValue(ms.total_sleep_time) ? answerLabel('MS_04', ms.total_sleep_time) : null,
    !isEmptyValue(ms.awakenings) ? `각성 ${answerLabel('MS_06', ms.awakenings)}` : null,
    !isEmptyValue(ms.return_to_sleep) ? `재입면 ${answerLabel('MS_07', ms.return_to_sleep)}` : null,
  ].filter((v): v is string => Boolean(v))
  if (sleepParts.length > 0) lines.push(`수면: ${sleepParts.join(' / ')}`)

  const disorderScreen = ms.sleep_disorder_screen
  if (!isEmptyValue(disorderScreen)) {
    const isNoneOnly =
      Array.isArray(disorderScreen) && disorderScreen.length === 1 && disorderScreen[0] === 'none'
    lines.push(`수면 감별: ${isNoneOnly ? '특이사항 없음' : answerLabel('MS_05', disorderScreen)}`)
  }

  return lines.length > 0 ? lines : null
}

/** routing.primary_module(예: 'Sleep') -> 해당 모듈 상세 문항 목록. */
function primaryModuleFields(primaryModule: string | null, m: Responses['modules']) {
  switch (primaryModule) {
    case 'Sleep':
      return [
        { qid: 'SLEEP_01', value: m.sleep.problems },
        { qid: 'SLEEP_02', value: m.sleep.frequency_per_week },
        { qid: 'SLEEP_03', value: m.sleep.awakening_reasons },
        { qid: 'SLEEP_03A', value: m.sleep.awakening_other },
        { qid: 'MS_GATE_01', value: m.sleep.menopause.gate_context },
        { qid: 'MS_01', value: m.sleep.menopause.stage },
        { qid: 'MS_02', value: m.sleep.menopause.night_vms_frequency },
        { qid: 'MS_03', value: m.sleep.menopause.rumination_frequency },
        { qid: 'MS_04', value: m.sleep.menopause.total_sleep_time },
        { qid: 'MS_05', value: m.sleep.menopause.sleep_disorder_screen },
        { qid: 'MS_06', value: m.sleep.menopause.awakenings },
        { qid: 'MS_07', value: m.sleep.menopause.return_to_sleep },
      ]
    case 'GI':
      return [
        { qid: 'GI_01', value: m.gi.problems },
        { qid: 'GI_02', value: m.gi.meal_relation },
        { qid: 'GI_03', value: m.gi.unable_to_eat_or_drink },
      ]
    case 'Bowel':
      return [
        { qid: 'BOWEL_01', value: m.bowel.problems },
        { qid: 'BOWEL_02', value: m.bowel.frequency },
        { qid: 'BOWEL_03', value: m.bowel.blood_or_black_stool },
        { qid: 'BOWEL_04', value: m.bowel.straining },
      ]
    case 'Urinary':
      return [
        { qid: 'URINARY_01', value: m.urinary.problems },
        { qid: 'URINARY_02', value: m.urinary.burden_frequency },
        { qid: 'URINARY_03', value: m.urinary.nocturia_count },
        { qid: 'URINARY_04', value: m.urinary.leakage_pattern },
      ]
    case 'Pain':
      return [
        { qid: 'PAIN_01', value: m.pain.primary_location },
        { qid: 'PAIN_01A', value: m.pain.location_other },
        { qid: 'PAIN_02', value: m.pain.pain_qualities },
        { qid: 'PAIN_04', value: m.pain.radiation },
        { qid: 'PAIN_04A', value: m.pain.radiation_other },
      ]
    case 'Fatigue':
      return [
        { qid: 'FATIGUE_01', value: m.fatigue.patterns },
        { qid: 'FATIGUE_02', value: m.fatigue.worst_time },
        { qid: 'FATIGUE_03', value: m.fatigue.recovery_after_rest },
      ]
    case 'Stress':
      return [
        { qid: 'STRESS_01', value: m.stress.problems },
        { qid: 'STRESS_03', value: m.stress.associated_symptoms },
      ]
    case 'Women':
      return [
        { qid: 'WOMEN_01', value: m.women.problems },
        { qid: 'WOMEN_01A', value: m.women.other_text },
        { qid: 'WOMEN_02', value: m.women.menstrual_status },
        { qid: 'WOMEN_03', value: m.women.menopause_symptoms },
      ]
    case 'Pregnancy':
      return [
        { qid: 'PREGNANCY_01', value: m.pregnancy.status },
        { qid: 'PREGNANCY_02', value: m.pregnancy.trimester },
        { qid: 'PREGNANCY_03', value: m.pregnancy.concerns },
        { qid: 'PREGNANCY_03A', value: m.pregnancy.other_text },
      ]
    case 'Postpartum':
      return [
        { qid: 'POSTPARTUM_01', value: m.postpartum.time_since_delivery },
        { qid: 'POSTPARTUM_02', value: m.postpartum.problems },
        { qid: 'POSTPARTUM_02A', value: m.postpartum.other_text },
        { qid: 'POSTPARTUM_03', value: m.postpartum.breastfeeding_status },
      ]
    case 'Weight':
      return [
        { qid: 'WEIGHT_01', value: m.weight.goal },
        { qid: 'WEIGHT_02', value: m.weight.contributing_factors },
        { qid: 'WEIGHT_03', value: m.weight.recent_weight_change },
        { qid: 'WEIGHT_04', value: m.weight.previous_attempts },
      ]
    default:
      return []
  }
}

/** SubmissionRecord(서버) -> 화면이 이미 알고 있는 DoctorPayload 모양으로 변환. */
function recordToPayload(record: SubmissionRecord): DoctorPayload {
  const s = record.submission as Record<string, unknown>
  return {
    questionnaire_version: s.questionnaire_version as string,
    session_id: (s.session_id as string) ?? record.id,
    responses: s.responses as DoctorPayload['responses'],
    flags: s.flags as DoctorPayload['flags'],
    routing: s.routing as DoctorPayload['routing'],
    myungri_calculation: record.myungri as DoctorPayload['myungri_calculation'],
    metadata: (s.metadata as DoctorPayload['metadata']) ?? { session_started_at: null, answers: {} },
  }
}

const POLL_MS = 5000

function statusLabel(status: SubmissionSummary['status']): string {
  switch (status) {
    case 'new':
      return '신규'
    case 'viewed':
      return '확인함'
    case 'in_consultation':
      return '진료 중'
    case 'completed':
      return '완료'
    default:
      return status
  }
}

/** 상대 시간(예: '방금 전' / '3분 전' / '2시간 전' / '1일 전'). 절대 시각은 별도로 항상 같이 보여준다. */
function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diffMs / 60000)
  if (min < 1) return '방금 전'
  if (min < 60) return `${min}분 전`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}시간 전`
  const day = Math.floor(hr / 24)
  return `${day}일 전`
}

/**
 * 원장/직원용 진료 전 요약 화면. 진단·치료 추천을 하지 않는다 — 환자가 답한
 * 내용과, 라벨을 명확히 붙인 파생(계산된) 사실만 정리해서 보여준다.
 *
 * 데이터 소스는 두 가지: 예시 데이터(fixtures, 항상 동작)와 서버 제출목록
 * (server/index.js가 LAN에서 떠 있을 때만). 서버 모드는 실패해도 예시
 * 데이터로 안전하게 되돌아간다.
 */
export function DoctorView({ initialFixtureIndex = 0 }: { initialFixtureIndex?: number } = {}) {
  useEffect(() => {
    document.documentElement.classList.add('doctor-mode')
    return () => document.documentElement.classList.remove('doctor-mode')
  }, [])

  const [mode, setMode] = useState<'fixtures' | 'server'>('fixtures')
  const [fixtureIndex, setFixtureIndex] = useState(initialFixtureIndex)

  const [submissions, setSubmissions] = useState<SubmissionSummary[]>([])
  const [serverError, setServerError] = useState<string | null>(null)
  const [listLoading, setListLoading] = useState(true)
  const [retryNonce, setRetryNonce] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedRecord, setSelectedRecord] = useState<SubmissionRecord | null>(null)
  const viewedRef = useRef<Set<string>>(new Set())
  const [workstationId, setWorkstationId] = useState<string | null>(() => getStoredWorkstationId())

  const [recorderResults, setRecorderResults] = useState<RecorderResult[] | null>(null)
  const [recorderResultsError, setRecorderResultsError] = useState<string | null>(null)
  const [emrText, setEmrText] = useState('')
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle')
  // 같은 recording_id로 폴링이 다시 돌아와도 EMR 텍스트를 다시 만들지
  // 않기 위한 최신 seed 기준점(새 recording_id가 오면 편집 중이어도
  // 갱신됨 — 아래 seed effect 주석 참고).
  const emrSeedRecordingIdRef = useRef<string | null>(null)

  // 서버 모드: 목록을 5초마다 폴링한다. retryNonce가 바뀌면(에러 화면의
  // "다시 시도") 즉시 한 번 더 불러온다.
  useEffect(() => {
    if (mode !== 'server') return
    let cancelled = false
    setListLoading(true)

    async function poll() {
      const result = await listSubmissions()
      if (cancelled) return
      if (result.ok) {
        setSubmissions(result.data)
        setServerError(null)
      } else {
        setServerError(result.error)
      }
      setListLoading(false)
    }

    poll()
    const timer = setInterval(poll, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [mode, retryNonce])

  // 서버 모드: 선택한 제출건 상세를 불러오고, 처음 열 때만 'viewed'로 표시한다.
  useEffect(() => {
    if (mode !== 'server' || !selectedId) {
      setSelectedRecord(null)
      return
    }
    let cancelled = false
    getSubmission(selectedId).then((result) => {
      if (cancelled) return
      if (result.ok) {
        setSelectedRecord(result.data)
        if (!viewedRef.current.has(selectedId)) {
          viewedRef.current.add(selectedId)
          setSubmissionStatus(selectedId, 'viewed')
        }
      } else {
        setServerError(result.error)
      }
    })
    return () => {
      cancelled = true
    }
  }, [mode, selectedId])

  // ClinicAI 연결점: 서버 모드에서 제출건을 열면(그리고 visit_id가 있으면)
  // 그 방문을 "이 workstation에서 진료 중"으로 표시한다. 닫거나(목록으로/
  // 다른 건 선택) 컴포넌트가 unmount되면 표시를 지운다(effect cleanup 하나로
  // 두 상황을 다 처리). fixtures 모드에서는 실제 서버 방문이 없으므로 아예
  // 호출하지 않는다. workstationId가 아직 없으면(설정 전) 절대 activate를
  // 호출하지 않는다 — 잘못 default 키에 반영되는 것을 막기 위함.
  useEffect(() => {
    if (mode !== 'server' || !selectedRecord?.visit_id || !workstationId) return
    activateVisit(selectedRecord.visit_id, workstationId)
    return () => {
      // fire-and-forget: unmount/전환을 막지 않는다.
      clearActiveVisit(workstationId)
    }
  }, [mode, selectedRecord?.visit_id, workstationId])

  const fixture = DOCTOR_FIXTURES[fixtureIndex]
  const payload = mode === 'server' && selectedRecord ? recordToPayload(selectedRecord) : fixture.payload
  const r = payload.responses
  const { flags, routing } = payload
  const saju = payload.myungri_calculation

  // 진료 녹취·요약: 선택된 visit의 recorder 결과를 5초마다 폴링한다(기존
  // 목록 폴링과 동일한 최소 패턴 — v0.1은 websocket을 만들지 않는다).
  useEffect(() => {
    if (mode !== 'server' || !selectedRecord?.visit_id) {
      setRecorderResults(null)
      setRecorderResultsError(null)
      setEmrText('')
      emrSeedRecordingIdRef.current = null
      return
    }
    const visitId = selectedRecord.visit_id
    let cancelled = false

    async function poll() {
      const result = await getRecorderResults(visitId)
      if (cancelled) return
      if (result.ok) {
        setRecorderResults(result.data.results)
        setRecorderResultsError(null)
      } else {
        setRecorderResultsError(result.error)
      }
    }

    poll()
    const timer = setInterval(poll, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [mode, selectedRecord?.visit_id])

  // 새 recording 결과가 도착했을 때만 EMR 요약 텍스트를 다시 만든다.
  // 편집 중이어도 새 recording_id가 오면 항상 최신 결과로 덮어쓴다(의도된 동작).
  useEffect(() => {
    const latest = recorderResults?.[0] ?? null
    if (!latest) return
    if (emrSeedRecordingIdRef.current === latest.recording_id) return
    emrSeedRecordingIdRef.current = latest.recording_id
    setEmrText(
      buildEmrSummary({
        primaryConcern: primaryConcernLabel(r),
        structuredNote: latest.structured_note,
        judgment: selectedRecord?.judgment ?? null,
      }),
    )
  }, [recorderResults, selectedRecord?.judgment])

  useEffect(() => {
    if (copyStatus === 'idle') return
    const t = setTimeout(() => setCopyStatus('idle'), 2000)
    return () => clearTimeout(t)
  }, [copyStatus])

  // 수동 escape hatch: 원장이 진료 판단(JudgmentPanel)을 recorder 결과가 이미
  // seed된 뒤에 저장하면, 위 seed effect는 같은 recording_id에 대해 다시
  // 돌지 않으므로(의도된 동작 — 편집 중 텍스트 보존) Assessment/치료·처방/계획
  // 줄이 자동으로는 채워지지 않는다. 이 버튼은 현재 화면이 들고 있는
  // selectedRecord.judgment(클라이언트 상태)로 즉시 다시 조립한다.
  // ponytail: selectedRecord 자체를 강제로 재조회하지는 않는다 — 별도 refetch
  // nonce를 새로 만드는 건 이 fix 범위에는 과하다. 값이 서버에는 저장됐지만
  // 이 화면의 selectedRecord가 아직 그 값을 모른다면(다른 창에서 저장한 경우
  // 등) 버튼을 다시 눌러도 반영되지 않는다 — 그 경우 패널을 닫았다 열면 된다.
  function handleRebuildEmrSummary() {
    if (!recorderResults?.[0]) return
    setEmrText(
      buildEmrSummary({
        primaryConcern: primaryConcernLabel(r),
        structuredNote: recorderResults[0].structured_note,
        judgment: selectedRecord?.judgment ?? null,
      }),
    )
  }

  async function handleCopyEmr() {
    try {
      if (!navigator.clipboard) throw new Error('no clipboard api')
      await navigator.clipboard.writeText(emrText)
      setCopyStatus('copied')
      return
    } catch {
      // fall through to the manual-select fallback below
    }
    try {
      const ta = document.createElement('textarea')
      ta.value = emrText
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopyStatus('copied')
    } catch {
      setCopyStatus('error')
    }
  }

  const generalFlagLabels = optionLabels(
    'SAFETY_01',
    ((r.safety_flags.red_flag_general as string[] | null) ?? []).filter((v) => v !== 'none'),
  )

  const showingServerList = mode === 'server' && !selectedRecord
  const newCount = submissions.filter((s) => s.status === 'new').length

  return (
    <div className="doctor">
      <header className="doctor__header">
        <h1 className="doctor__title">진료 전 요약</h1>
        <span className="doctor__workstationBadge">
          {workstationId ? `진료 워크스테이션: ${workstationId}` : '워크스테이션 설정 필요'}
        </span>
        <div className="doctor__pickerRow">
          <label htmlFor="doctor-source-select">데이터 소스</label>
          <select
            id="doctor-source-select"
            value={mode}
            onChange={(e) => {
              const next = e.target.value as 'fixtures' | 'server'
              setMode(next)
              setSelectedId(null)
              setSelectedRecord(null)
            }}
          >
            <option value="fixtures">예시 데이터(fixtures)</option>
            <option value="server">서버 제출목록</option>
          </select>
        </div>
        {mode === 'fixtures' && (
          <div className="doctor__pickerRow">
            <label htmlFor="doctor-fixture-select">미리보기용 예시 데이터</label>
            <select
              id="doctor-fixture-select"
              value={fixtureIndex}
              onChange={(e) => setFixtureIndex(Number(e.target.value))}
            >
              {DOCTOR_FIXTURES.map((f, i) => (
                <option key={f.name} value={i}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {mode === 'server' && selectedRecord && (
          <button type="button" className="judgment__recordBtn" onClick={() => setSelectedId(null)}>
            목록으로
          </button>
        )}
        {mode === 'server' && selectedRecord?.visit_id && (
          <span className="doctor__activeVisitBadge">현재 진료 중으로 표시됨</span>
        )}
      </header>

      {!workstationId && <WorkstationSetup onSet={setWorkstationId} />}

      {mode === 'server' && serverError && (
        <div className="doctor__banner doctor__banner--danger">
          <strong>서버에 연결할 수 없습니다</strong>
          <p>
            {serverError} — 로컬 핸드오프 서버(server/index.js)가 실행 중인지,
            VITE_SAMINDANG_SERVER_URL 설정이 맞는지 확인하세요. 그동안 예시
            데이터로 화면을 확인할 수 있습니다.
          </p>
          <button type="button" className="judgment__recordBtn" onClick={() => setRetryNonce((n) => n + 1)}>
            다시 시도
          </button>
        </div>
      )}

      {showingServerList && !serverError && (
        <section className="doctor__section">
          <h2>
            제출목록 ({submissions.length})
            {newCount > 0 && <span className="doctor__newBadge">신규 {newCount}</span>}
          </h2>
          {listLoading && submissions.length === 0 ? (
            <p className="doctor__empty">불러오는 중…</p>
          ) : submissions.length === 0 ? (
            <p className="doctor__empty">아직 제출된 문진이 없습니다.</p>
          ) : (
            <div className="doctor__grid">
              {submissions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`doctorField doctor__row${s.status === 'new' ? ' doctor__row--new' : ''}`}
                  onClick={() => setSelectedId(s.id)}
                >
                  <span className="doctorField__label">
                    {s.status === 'new' && <span className="doctor__newDot" aria-hidden="true" />}
                    {s.patient_label} {s.requires_staff_check ? '⚠ 안전 확인 필요' : ''}
                  </span>
                  <span className="doctorField__value">
                    {statusLabel(s.status)} · {relativeTime(s.created_at)} ({new Date(s.created_at).toLocaleString('ko-KR')})
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {(mode === 'fixtures' || selectedRecord) && (
      <>
      <TenSecondSummary payload={payload} />

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
                {answerLabel('GI_03', r.modules.gi.unable_to_eat_or_drink)}&rdquo;
              </li>
            )}
            {flags.bowel_needs_review && (
              <li>
                대변 문진(BOWEL_03) 응답: &ldquo;
                {answerLabel('BOWEL_03', r.modules.bowel.blood_or_black_stool)}&rdquo;
              </li>
            )}
          </ul>
        </div>
      )}

      <SafetyGlance r={r} flags={flags} />

      <section className="doctor__section">
        <h2>환자 기본</h2>
        <div className="doctor__grid">
          <Field qid="ID_01" label="성함" value={r.patient.patient_name} />
          <Field qid="ID_02" label="휴대폰 끝 4자리" value={r.patient.phone_last4} />
          <Field qid="ID_03" label="성별" value={r.patient.patient_sex} />
          <Field qid="BIRTH_01" label="생년월일" value={r.birth_info.birth_date} />
          <Field qid="BIRTH_02" value={r.birth_info.birth_calendar_type} />
          <Field qid="BIRTH_02A" value={r.birth_info.lunar_leap_month} />
          <Field qid="BIRTH_03" value={r.birth_info.birth_time_branch} />
          <Field qid="BIRTH_03A" value={r.birth_info.birth_time_confidence} />
        </div>
      </section>

      <section className="doctor__section">
        <h2>주호소</h2>
        <p className="doctor__derivedNote">
          시스템 라우팅 — 주호소 모듈: {routing.primary_module ?? '없음'} / 동반 화면:{' '}
          {routing.secondary_screens.length > 0 ? routing.secondary_screens.join(', ') : '없음'}
        </p>
        <div className="doctor__chiefPrimary">
          <span className="doctor__chiefPrimary__label">주호소</span>
          <span className="doctor__chiefPrimary__value">{primaryConcernLabel(r)}</span>
        </div>
        <div className="doctor__grid">
          <Field qid="VISIT_03_SYMPTOM_DURATION" value={r.visit_goal.chief_duration} />
          {(() => {
            const freq = frequencyField(routing.primary_module, r.modules)
            return freq ? <Field key={freq.qid} qid={freq.qid} value={freq.value} /> : null
          })()}
          <Field qid="VISIT_04_SYMPTOM_IMPACT" value={r.visit_goal.chief_impact} />
          {(() => {
            const agg = aggravatingField(routing.primary_module, r.modules)
            return agg ? <Field key={agg.qid} qid={agg.qid} value={agg.value} /> : null
          })()}
          <Field qid="VISIT_02A_SYMPTOM_OTHER" value={r.visit_goal.primary_symptom_other} />
        </div>
      </section>

      <section className="doctor__section">
        <h2>동반문제</h2>
        <div className="doctor__secChips">
          {secondaryChipsData(r).map((c) => (
            <span key={c.key} className="doctor__secChip" title={c.answerText}>
              <strong>{c.categoryLabel}</strong>
              <span className="doctor__secChip__text">{c.answerText || '—'}</span>
            </span>
          ))}
          {secondaryChipsData(r).length === 0 && <p className="doctor__empty">동반문제 없음</p>}
        </div>
        <Field qid="SECONDARY_01A" value={r.secondary_concerns.secondary_other_text} />
        {secondaryModuleFields(r).length > 0 && (
          <details className="doctor__secDetails">
            <summary>자세히</summary>
            <div className="doctor__grid">
              <Field qid="SECONDARY_01" value={r.secondary_concerns.secondary_concerns as string[] | null} />
              {secondaryModuleFields(r).map((f) => (
                <Field key={f.qid} qid={f.qid} value={f.value} />
              ))}
            </div>
          </details>
        )}
      </section>

      <section className="doctor__section">
        <h2 className="doctor__section__h2--sub">
          상세 증상{routing.primary_module ? ` — ${routing.primary_module}` : ''}
        </h2>
        {routing.primary_module === 'Sleep' &&
          (() => {
            const lines = menopauseSleepSummaryLines(r.modules.sleep)
            if (!lines) return null
            return (
              <div className="doctor__msSummary doctor__msSummary--sleep">
                <strong className="doctor__msSummary__title">갱년기 수면</strong>
                {lines.map((line) => (
                  <p key={line} className="doctor__msSummary__line">
                    {line}
                  </p>
                ))}
              </div>
            )
          })()}
        <div className="doctor__grid">
          {primaryModuleFields(routing.primary_module, r.modules).map((f) => (
            <Field key={f.qid} qid={f.qid} value={f.value} />
          ))}
          {primaryModuleFields(routing.primary_module, r.modules).length === 0 && (
            <p className="doctor__empty">이번 방문에는 해당 상세 Module이 없습니다.</p>
          )}
        </div>
      </section>

      <section className="doctor__section">
        <h2 className="doctor__section__h2--sub">전신·한약 참고</h2>
        {(() => {
          const fields = constitutionFields(r)
          const populated = fields.filter((f) => !isEmptyValue(f.value))
          const body = (
            <div className="doctor__grid">
              {fields.map((f) => (
                <Field key={f.qid} qid={f.qid} value={f.value} />
              ))}
            </div>
          )
          if (populated.length === 0) return body
          const preview = populated
            .slice(0, 3)
            .map((f) => answerLabel(f.qid, f.value))
            .join(' · ')
          return (
            <details className="doctor__constDetails">
              <summary>{preview}</summary>
              {body}
            </details>
          )
        })()}
      </section>

      <section className="doctor__section">
        <h2>약물·병력·알레르기·수술</h2>
        <div className="doctor__grid">
          <Field qid="MED_USE" value={r.medication.medication_use} />
          <Field qid="MED_TYPES" value={r.medication.medication_types} />
          <Field qid="HISTORY_01" value={r.medical_history.medical_history_flags} />
          <Field qid="ALLERGY_01" value={r.allergy.allergy_yn} />
          <Field qid="ALLERGY_02" value={r.allergy.allergy_detail} />
          <Field qid="SURGERY_01" value={r.surgery_history.surgery_yn} />
          <Field qid="SURGERY_02" value={r.surgery_history.surgery_detail} />
        </div>
      </section>

      <section className="doctor__section">
        <h2>여성 안전정보</h2>
        <div className="doctor__grid">
          <Field
            qid="WOMEN_SAFETY_01"
            label="환자가 답한 것 (WOMEN_SAFETY_01)"
            value={r.reproductive_status.reproductive_status as string[] | null}
          />
        </div>
        <div className="doctor__derivedBox">
          <p className="doctor__derivedLabel">
            시스템이 계산한 것 — 출처: {sourceLabel(r.reproductive_status.derived.source)}
          </p>
          <ul>
            <li>임신 중: {boolLabel(r.reproductive_status.derived.pregnant)}</li>
            <li>임신 가능성: {boolLabel(r.reproductive_status.derived.pregnancy_possible)}</li>
            <li>출산 후 1년 이내: {boolLabel(r.reproductive_status.derived.postpartum_1y)}</li>
            <li>모유수유 중: {boolLabel(r.reproductive_status.derived.breastfeeding)}</li>
          </ul>
        </div>
      </section>

      <section className="doctor__section">
        <h2>검사자료 / 원장에게 하고 싶은 말</h2>
        <div className="doctor__grid">
          <Field qid="TEST_01" value={r.recent_tests.recent_test_flag} />
          <Field qid="FREE_01" value={r.free_text.free_text_yn} />
          <Field qid="FREE_02" value={r.free_text.free_text_detail} />
        </div>
      </section>

      <MyungriCompactCard saju={saju} />

      <section className="doctor__section doctor__section--myungri">
        <h2>명리 검토</h2>
        <p className="doctor__derivedLabel">
          왼쪽은 환자가 입력한 원본 정보, 오른쪽은 그 입력값으로부터 결정적으로
          계산된 사실입니다. 두 열은 서로 다른 것이며, 해석(십신·용신 등)은
          어디에도 포함하지 않습니다.
        </p>

        <div className="judgment__reviewGrid">
          <div className="judgment__reviewCol">
            <h3>원본 출생정보 — 환자 입력</h3>
            <div className="doctorField">
              <span className="doctorField__label">생년월일 (입력 그대로)</span>
              <span className="doctorField__value">{r.birth_info.birth_date ?? '—'}</span>
            </div>
            <Field qid="BIRTH_02" label="달력 종류" value={r.birth_info.birth_calendar_type} />
            <Field qid="BIRTH_02A" label="윤달 여부" value={r.birth_info.lunar_leap_month} />
            <Field qid="BIRTH_03" label="출생시간대" value={r.birth_info.birth_time_branch} />
            <Field qid="BIRTH_03A" label="시간 확신도" value={r.birth_info.birth_time_confidence} />
          </div>

          <span className="judgment__reviewArrow" aria-hidden="true">→</span>

          <div className="judgment__reviewCol">
            <h3>계산된 사실 — 시스템이 계산한 것</h3>

            {saju.status !== 'resolved' && (
              <p className="doctor__warning">
                상태: {saju.status === 'partial' ? '부분 계산됨 (시주 미상)' : '계산 불가'}
                {saju.unresolved_reason ? ` — ${saju.unresolved_reason}` : ''}
              </p>
            )}
            {saju.flags.hour_unknown && <p className="doctor__warning">시주 미상</p>}

            {saju.pillars && (
              <div className="doctor__pillars">
                <div className="doctor__pillar">
                  <span>연주</span>
                  <strong>{saju.pillars.year}</strong>
                </div>
                <div className="doctor__pillar">
                  <span>월주</span>
                  <strong>{saju.pillars.month}</strong>
                </div>
                <div className="doctor__pillar">
                  <span>일주</span>
                  <strong>{saju.pillars.day}</strong>
                </div>
                <div className="doctor__pillar">
                  <span>시주</span>
                  <strong>{saju.pillars.hour ?? '미상'}</strong>
                </div>
              </div>
            )}

            {saju.normalized && (
              <p className="doctor__derivedNote">
                정규화된 양력 날짜: {saju.normalized.solarDate.year}-
                {String(saju.normalized.solarDate.month).padStart(2, '0')}-
                {String(saju.normalized.solarDate.day).padStart(2, '0')} / 상태: {saju.status}
              </p>
            )}

            {saju.policy.pending_approval.length > 0 && (
              <p className="doctor__warning doctor__warning--pending">
                주의: 야자시/조자시 또는 진태양시 정책이 아직 확정되지 않아 이
                값이 바뀔 수 있습니다. 대기 항목: {saju.policy.pending_approval.join(', ')}.
                원장이 확정하면 값이 바뀔 수 있습니다 — 자세한 내용은
                docs/MYUNGRI_CALCULATION_POLICY_PENDING.md 참고.
              </p>
            )}
          </div>

          <span className="judgment__reviewArrow" aria-hidden="true">→</span>

          <div className="judgment__reviewCol">
            <h3>현재 문진 요약</h3>
            <div className="doctorField">
              <span className="doctorField__label">주호소</span>
              <span className="doctorField__value">{primaryConcernLabel(r)}</span>
            </div>
            <Field qid="VISIT_03_SYMPTOM_DURATION" label="기간" value={r.visit_goal.chief_duration} />
            <Field qid="VISIT_04_SYMPTOM_IMPACT" label="일상 영향" value={r.visit_goal.chief_impact} />
            {primaryModuleFields(routing.primary_module, r.modules)
              .slice(0, 3)
              .map((f) => (
                <Field key={f.qid} qid={f.qid} value={f.value} />
              ))}
          </div>
        </div>

        <p className="doctor__calcVsInterpret">
          ※ 위 &ldquo;계산된 사실&rdquo;은 사주 원국(연/월/일/시주) 산출이
          끝났다는 뜻일 뿐, 임상 해석이 끝났다는 뜻이 아닙니다. 계산 완료 ≠
          임상 해석 완료. 임상 해석(십신·용신 등 판단)은 아래 &ldquo;원장 판단
          기록&rdquo;에 원장이 직접 기록합니다.
        </p>
      </section>

      {mode === 'server' && selectedRecord?.visit_id && (
        <section className="doctor__section">
          <h2>진료 녹취·요약</h2>
          {recorderResultsError ? (
            <p className="doctor__warning">녹취 결과를 불러오지 못했습니다: {recorderResultsError}</p>
          ) : !recorderResults || recorderResults.length === 0 ? (
            <p className="doctor__empty">아직 결과 없음</p>
          ) : (
            <>
              <p className="doctor__derivedLabel">
                결과 있음 — 녹음 {recorderResults.length}건 (최신 갱신: {relativeTime(recorderResults[0].updated_at)})
              </p>
              {recorderResults.length > 1 && (
                <ul className="doctor__recorderLineage">
                  {recorderResults.map((res) => (
                    <li key={res.recording_id}>
                      {res.recording_id} · {relativeTime(res.updated_at)}
                    </li>
                  ))}
                </ul>
              )}
              <details className="doctor__secDetails">
                <summary>Transcript 원문</summary>
                <pre className="doctor__recorderTranscript">{recorderResults[0].transcript ?? '(없음)'}</pre>
              </details>
              <div className="judgment__field doctor__recorderEmrField">
                <label className="judgment__label" htmlFor="emrSummaryText">
                  EMR용 요약 (plain text, 직접 수정 가능)
                </label>
                <textarea
                  id="emrSummaryText"
                  className="judgment__textarea"
                  rows={8}
                  value={emrText}
                  onChange={(e) => setEmrText(e.target.value)}
                />
              </div>
              <div className="judgment__actions">
                <button type="button" className="judgment__recordBtn" onClick={handleCopyEmr}>
                  EMR용 복사
                </button>
                <button type="button" className="judgment__recordBtn" onClick={handleRebuildEmrSummary}>
                  요약 다시 만들기
                </button>
                {copyStatus === 'copied' && <span className="doctor__recorderCopyFeedback">복사됨</span>}
                {copyStatus === 'error' && (
                  <span className="doctor__warning">복사 실패 — 직접 선택해서 복사해주세요.</span>
                )}
              </div>
            </>
          )}
        </section>
      )}

      <JudgmentPanel
        key={payload.session_id}
        source={{
          session_id: payload.session_id,
          questionnaire_version: payload.questionnaire_version,
          myungri_algorithm_version: saju.policy.algorithm_version,
          myungri_library_version: saju.engine.library_version,
          myungri_status: saju.status,
          myungri_pending_approval: saju.policy.pending_approval,
        }}
        initialJudgment={mode === 'server' ? selectedRecord?.judgment ?? null : null}
        onSave={
          mode === 'server' && selectedId
            ? async (judgment: ClinicianJudgment) => {
                // selectedRecord를 갱신해야 selectedRecord?.judgment(EMR 요약 seed
                // effect와 "요약 다시 만들기" 버튼이 읽는 값)가 저장 직후 최신이
                // 된다 — 이걸 빼면 재열람 전까지 계속 stale한 judgment를 읽는다.
                const result = await saveJudgmentToServer(selectedId, judgment)
                if (result.ok) setSelectedRecord(result.data)
              }
            : undefined
        }
      />

      <details className="doctor__raw">
        <summary>원본 응답 보기 (JSON)</summary>
        <pre>{JSON.stringify(payload, null, 2)}</pre>
      </details>
      </>
      )}
    </div>
  )
}
