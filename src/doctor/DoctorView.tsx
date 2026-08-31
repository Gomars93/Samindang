import { useEffect, useRef, useState } from 'react'
import { SECONDARY_SHORT_SCREENS } from '../spec/coreSpec'
import { answerLabel, optionLabel, optionLabels, questionLabel } from './labels'
import { DOCTOR_FIXTURES } from './fixtures'
import { JudgmentPanel, type SaveResult } from './JudgmentPanel'
import { TodayChecklist } from './TodayChecklist'
import { EmrSheet } from './EmrSheet'
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
import { DoctorTokenSetup, DoctorTokenClearButton } from './DoctorTokenSetup'
import { getStoredDoctorToken } from './doctorToken'
import { ageFromDoctorPayload } from '../spec/lbpAdapter'
import { SafetySection } from './SafetySection'
import { deriveSafetyOverview } from './safetyOverview'
import { computeSafetyModuleRows, type SafetyClinicianInputs } from './safetyModules'
import { STATUS_ICON } from './SafetyModuleRowView'
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
  strong = false,
}: {
  qid: string
  value: AnswerValue | undefined
  label?: string
  /** v0.2 §9.3/P4 — "문진 핵심"의 양성/구체 응답을 Body-strong(15px/700)으로 강조한다. */
  strong?: boolean
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
      <span
        className={`doctorField__value${isEmptyAnswer ? ' doctorField__value--muted' : ''}${
          strong && !isEmptyAnswer ? ' doctorField__value--strong' : ''
        }`}
      >
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

/**
 * v0.2 §4 Level2/P4 — "유의미 응답 우선" 정렬의 기준. `Field` 컴포넌트가
 * 값 하나만 보고 내리는 "안 물어봄(미렌더)/none·unknown(muted)/그 외(양성·
 * 구체)" 판정을 그룹 정렬을 위해 미리 한 번 더 계산한다 — 새 판정 규칙이
 * 아니라 Field의 기존 로직을 재사용한 것뿐이다(중복 계산이지만 계산
 * 자체는 FROZEN 임상 로직이 아니라 이 렌더 계층의 표시 규칙이다).
 */
function fieldSignificance(value: AnswerValue | undefined): 'meaningful' | 'muted' | 'empty' {
  if (value === null || value === undefined) return 'empty'
  if (typeof value === 'string' && value.trim() === '') return 'empty'
  if (Array.isArray(value) && value.length === 0) return 'empty'
  const isEmptyAnswer = Array.isArray(value)
    ? value.length === 1 && (value[0] === 'none' || value[0] === 'unknown')
    : value === 'none' || value === 'unknown'
  return isEmptyAnswer ? 'muted' : 'meaningful'
}

type ModuleField = { qid: string; value: AnswerValue }

/**
 * "양성/구체 응답 → 우선 표시, none/unknown → muted 후순위" 정렬(§4 Level2).
 * "안 물어봄 = 미렌더" 규칙은 건드리지 않는다 — empty 값도 그대로 배열에
 * 남겨서 Field 자신이 null을 반환하게 둔다(순서만 바꾸는 것이지, 여기서
 * 새로 필터링하지 않는다). Array.prototype.sort는 안정 정렬이므로 같은
 * 그룹 안에서는 원래 순서가 유지된다.
 */
function sortFieldsBySignificance(fields: ModuleField[]): ModuleField[] {
  const rank = (f: ModuleField) => {
    const sig = fieldSignificance(f.value)
    return sig === 'meaningful' ? 0 : sig === 'muted' ? 1 : 2
  }
  return [...fields].sort((a, b) => rank(a) - rank(b))
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

function sexLabel(sex: AnswerValue | undefined): string | null {
  if (sex === 'male') return '남성'
  if (sex === 'female') return '여성'
  return null
}

/**
 * v0.2 §4 Level 1 — Patient Header 밴드. 이름·끝4자리·성별/나이(파생)만
 * 노출한다. **차트번호·직전 방문·NRS는 표시하지 않는다** (invariant 8 —
 * Sigma 연동 필드/이력 데이터 모델이 아직 없다). 안전 종합 pill과 응답
 * 모순 배지는 P2에서 `deriveSafetyOverview`에 연결한다 — 이 컴포넌트는
 * 그 값을 optional prop으로만 받고, 아직 넘어오지 않으면(P1) 아무것도
 * 렌더하지 않는다.
 */
function PatientHeader({
  payload,
  overview,
  responseConsistencyReview,
}: {
  payload: DoctorPayload
  overview?: 'URGENT' | 'REVIEW' | 'CLEAR' | 'UNKNOWN'
  responseConsistencyReview?: boolean
}) {
  const r = payload.responses
  const age = ageFromDoctorPayload(r)
  const sex = sexLabel(r.patient.patient_sex)
  const durFreq = durationFrequencyText(r, payload.routing.primary_module)

  return (
    <div className="doctor__patientHeader">
      <div className="doctor__patientHeader__identity">
        <strong>{r.patient.patient_name || '—'}</strong>
        <span>· {r.patient.phone_last4 || '----'}</span>
        {sex && <span>· {sex}</span>}
        {typeof age === 'number' && (
          <span>
            {sex ? '' : '· '}
            {age}세 <span className="doctor__patientHeader__calcTag">계산</span>
          </span>
        )}
        {overview === 'URGENT' && (
          <span className="doctor__safetyPill doctor__safetyPill--urgent_review">{STATUS_ICON.URGENT_REVIEW} 긴급 확인</span>
        )}
        {overview === 'REVIEW' && (
          <span className="doctor__safetyPill doctor__safetyPill--review_required">{STATUS_ICON.REVIEW_REQUIRED} 확인 필요</span>
        )}
        {overview === 'CLEAR' && <span className="doctor__safetyPill doctor__safetyPill--clear">✓ 안전 확인됨</span>}
        {/*
          v0.2 A3/Opus MAJOR(fail-open 미응답): 안전 문진 자체에 응답이
          전혀 없는 상태(UNKNOWN)를 "안전 확인됨"으로 잘못 보여주지 않는다.
          mint/초록 계열을 쓰지 않는 중립 회색 pill — "확인함"이 아니라
          "확인할 근거가 아직 없음"임을 색으로도 구분한다.
        */}
        {overview === 'UNKNOWN' && <span className="doctor__safetyPill doctor__safetyPill--unknown">— 안전정보 없음</span>}
        {responseConsistencyReview && (
          <span className="doctor__safetyPill doctor__safetyPill--review_required">⚠ 응답 모순 — 확인 필요</span>
        )}
      </div>
      <div className="doctor__patientHeader__row">
        <span className="doctor__patientHeader__chief">{primaryConcernLabel(r)}</span>
      </div>
      {durFreq && <span className="doctor__patientHeader__durFreq">{durFreq}</span>}
    </div>
  )
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

/**
 * Tablet UX v2.1 §18-§19: REFERENCE_SYMPTOMS_01은 "있다는 사실"만 전달되는
 * flag다 -- 'none'은 표시하지 않는다(선택 안 함과 동일하게 취급).
 */
function referenceSymptomKeys(routing: DoctorPayload['routing']): string[] {
  const raw = (routing.reference_symptoms as string[] | null) ?? []
  return raw.filter((k) => k !== 'none')
}

/**
 * Tablet UX v2.2 §33: questionnaire_mode 배지 라벨. 요청에 나온 3개 문구만
 * 정확히 쓴다 -- pain_fast는 primary_concern이 실제로 'pain'일 때만
 * "통증 Fast Track"으로 표시하고(symptom_consult/women/weight 등 비-통증
 * pain_fast 케이스는 "통증"이 부정확하므로 배지를 아예 표시하지 않는다),
 * expanded/herbal_addon은 항상 표시한다.
 */
function questionnaireModeLabel(routing: DoctorPayload['routing']): string | null {
  const mode = routing.questionnaire_mode
  if (mode === 'expanded') return '한약 Expanded'
  if (mode === 'herbal_addon') return '한약 추가문진 완료'
  if (mode === 'pain_fast' && routing.primary_concern === 'pain') return '통증 Fast Track'
  return null
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
/**
 * `primaryModuleDetail`은 오늘은 'LBP' | null만 존재한다 (routing.primary_module_detail,
 * coreSpec.ts). `primaryModule`은 여전히 'Pain'으로 고정 -- DoctorView는
 * 'Pain' 리터럴로 여러 곳을 분기하므로 절대 재사용하지 않는다
 * (LBP_INTEGRATION_PLAN_DRAFT.md §9/S9).
 */
function primaryModuleFields(
  primaryModule: string | null,
  m: Responses['modules'],
  primaryModuleDetail: string | null = null,
) {
  switch (primaryModule) {
    case 'Sleep':
      return [
        { qid: 'SLEEP_01', value: m.sleep.problems },
        { qid: 'SLEEP_02', value: m.sleep.frequency_per_week },
        { qid: 'SLEEP_03', value: m.sleep.awakening_reasons },
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
        { qid: 'PAIN_02', value: m.pain.pain_qualities },
        { qid: 'PAIN_04', value: m.pain.radiation },
        ...(primaryModuleDetail === 'LBP'
          ? [
              { qid: 'LBP_01', value: m.lbp.distal_extent },
              { qid: 'LBP_02', value: m.lbp.leg_neuro_symptoms },
              { qid: 'LBP_03', value: m.lbp.leg_side },
              { qid: 'LBP_04', value: m.lbp.ces_screen },
              { qid: 'LBP_05', value: m.lbp.current_redflag_screen },
              { qid: 'LBP_06', value: m.lbp.trauma_safety },
              { qid: 'LBP_07', value: m.lbp.recurrence },
              { qid: 'LBP_08', value: m.lbp.claudication_walking },
              { qid: 'LBP_09', value: m.lbp.claudication_relief },
              { qid: 'LBP_10', value: m.lbp.onset_before_45 },
              { qid: 'LBP_11', value: m.lbp.inflammatory_screen },
              { qid: 'LBP_12', value: m.lbp.recovery_expectation },
              { qid: 'LBP_13', value: m.lbp.fear_avoidance },
              { qid: 'LBP_14', value: m.lbp.work_impact },
            ]
          : []),
        /**
         * HIP_V1: HIP shares the `low_back_pelvis` population with LBP by
         * design (H1/H7) -- gated on `m.pain.primary_location ===
         * 'low_back_pelvis'` (same population test as the LBP block above),
         * NOT on `primaryModuleDetail` alone, since a HIP_GROIN_DOMINANT
         * patient's HIP_00-06 raw answers must stay visible alongside LBP's
         * regardless of the (unchanged, LBP-only) `primaryModuleDetail` tag.
         */
        ...(m.pain.primary_location === 'low_back_pelvis'
          ? [
              { qid: 'HIP_00', value: m.hip.region_discriminator },
              { qid: 'HIP_01', value: m.hip.recent_trauma },
              { qid: 'HIP_02', value: m.hip.limb_threatening_screen },
              { qid: 'HIP_03', value: m.hip.post_trauma_walking },
              { qid: 'HIP_03A', value: m.hip.prior_imaging_context },
              { qid: 'HIP_04', value: m.hip.stress_fracture_pattern },
              { qid: 'HIP_05', value: m.hip.infection_screen },
              { qid: 'HIP_06', value: m.hip.progressive_neuro_screen },
            ]
          : []),
        /**
         * SHOULDER_V1 통합 후: `primaryModuleDetail === 'NECK'` 대신
         * `m.pain.primary_location === 'neck_shoulder'`로 게이트한다. NS01이
         * SHOULDER_DOMINANT로 태깅해도 canonical NECK_01-05는 여전히
         * 응답되어 있으므로(F1), primary 태그로만 게이트하면 그 환자의
         * NECK 원시 응답이 이 필드 목록에서 사라진다 — NeckSafetyPanel과
         * 동일한 이유의 동일한 수정.
         */
        ...(m.pain.primary_location === 'neck_shoulder'
          ? [
              { qid: 'NECK_01', value: m.neck.recent_significant_trauma },
              { qid: 'NECK_02', value: m.neck.cord_concern_screen },
              { qid: 'NECK_02A', value: m.neck.cord_symptom_course },
              { qid: 'NECK_03A', value: m.neck.sudden_unusual_severe_neck_pain },
              { qid: 'NECK_03B', value: m.neck.thunderclap_headache_screen },
              { qid: 'NECK_04', value: m.neck.vascular_associated_screen },
              { qid: 'NECK_05', value: m.neck.systemic_redflag_screen },
              { qid: 'NECK_06', value: m.neck.primary_side },
              { qid: 'NECK_07', value: m.neck.distal_extent },
              { qid: 'NECK_08', value: m.neck.arm_symptom_side },
              { qid: 'NECK_09', value: m.neck.arm_neuro_symptoms },
              { qid: 'NECK_10', value: m.neck.headache_present },
              { qid: 'NECK_10A', value: m.neck.new_or_changed_headache },
              { qid: 'NECK_11', value: m.neck.headache_neck_link },
              { qid: 'NECK_12', value: m.neck.sustained_posture_aggravation },
            ]
          : []),
        /**
         * SHOULDER_V1: 같은 이유로 `primaryModuleDetail`이 아니라
         * `m.pain.primary_location === 'neck_shoulder'`로 게이트 -- SH01-05는
         * NS01이 NECK_DOMINANT여도 항상 응답되어 있다(F1).
         */
        ...(m.pain.primary_location === 'neck_shoulder'
          ? [
              { qid: 'NS01', value: m.shoulder.primary_focus },
              { qid: 'SH01', value: m.shoulder.recent_trauma },
              { qid: 'SH02', value: m.shoulder.trauma_emergency_screen },
              { qid: 'SH03', value: m.shoulder.acute_traumatic_cuff_concern },
              { qid: 'SH04', value: m.shoulder.infection_emergency_screen },
              { qid: 'SH05', value: m.shoulder.nonmechanical_cardiac_gap_screen },
              { qid: 'SH06', value: m.shoulder.bilateral_similar_stiff_pain },
              { qid: 'SH07', value: m.shoulder.primary_side },
              { qid: 'SH08', value: m.shoulder.load_related_pattern },
              { qid: 'SH09', value: m.shoulder.instability_present },
              { qid: 'SH09A', value: m.shoulder.instability_onset_type },
            ]
          : []),
        /**
         * KNEE_V1: `PAIN_01`의 `knee`는 `low_back_pelvis`/`neck_shoulder`와
         * 상호 배타적인 single_choice 값이라(공유 population 없음, Opus v0.2
         * K9), `primaryModuleDetail === 'KNEE'` 게이트와
         * `m.pain.primary_location === 'knee'` 게이트가 항상 동일한 결과를
         * 낸다 -- LBP/NECK/SHOULDER처럼 두 게이트가 어긋날 여지가 없다.
         */
        ...(m.pain.primary_location === 'knee'
          ? [
              { qid: 'KNEE_01', value: m.knee.recent_trauma_or_sudden_load },
              { qid: 'KNEE_02', value: m.knee.deformity_neurovascular_screen },
              { qid: 'KNEE_02A', value: m.knee.spontaneously_reduced_dislocation_screen },
              { qid: 'KNEE_03', value: m.knee.post_trauma_weight_bearing_failure },
              { qid: 'KNEE_04', value: m.knee.extensor_mechanism_concern },
              { qid: 'KNEE_05', value: m.knee.true_locked_extension_block },
              { qid: 'KNEE_06', value: m.knee.unilateral_leg_dvt_symptom_screen },
              { qid: 'KNEE_06A', value: m.knee.dvt_risk_context },
              { qid: 'KNEE_06B', value: m.knee.dvt_pe_associated_screen },
              { qid: 'KNEE_07', value: m.knee.septic_joint_emergency_screen },
              { qid: 'KNEE_08', value: m.knee.referred_non_knee_redflag_screen },
              { qid: 'KNEE_09', value: m.knee.primary_side },
              { qid: 'KNEE_10', value: m.knee.pain_location_pattern },
              { qid: 'KNEE_11', value: m.knee.load_provocation_pattern },
              { qid: 'KNEE_12', value: m.knee.morning_stiffness_duration },
              { qid: 'KNEE_13', value: m.knee.giving_way_instability },
              { qid: 'KNEE_14', value: m.knee.patellar_instability_history },
              { qid: 'KNEE_15', value: m.knee.rapid_post_trauma_effusion },
            ]
          : []),
        /**
         * ELBOW_V1: unlike LBP/NECK/SHOULDER/KNEE, `m.pain.primary_location
         * === 'arm_hand'`는 `primaryModuleDetail === 'ELBOW'`와 항상
         * 일치하지 않는다 -- `arm_hand`는 elbow/forearm/wrist/hand를 모두
         * 포함하고, `ELBOW_00 === 'WRIST_HAND'`인 환자는 ELBOW_01-15를 본
         * 적이 없어 `primaryModuleDetail`이 `null`이다(Fable plan §2.2).
         * 그런 환자는 아래 필드가 전부 raw-null로 렌더되므로(질문 자체를
         * 못 봤으니 응답이 없다) 안전하다 -- KNEE류의 F1 primary-tag 어긋남
         * 문제와는 다른 종류이며, 별도 게이트가 필요하지 않다.
         */
        ...(m.pain.primary_location === 'arm_hand'
          ? [
              { qid: 'ELBOW_00', value: m.elbow.region_discriminator },
              { qid: 'ELBOW_01', value: m.elbow.recent_trauma_or_sudden_load },
              { qid: 'ELBOW_02', value: m.elbow.deformity_neurovascular_screen },
              { qid: 'ELBOW_02A', value: m.elbow.spontaneously_reduced_dislocation_screen },
              { qid: 'ELBOW_03', value: m.elbow.post_trauma_functional_loss },
              { qid: 'ELBOW_04', value: m.elbow.distal_biceps_concern },
              { qid: 'ELBOW_05', value: m.elbow.distal_triceps_concern },
              { qid: 'ELBOW_06', value: m.elbow.true_locked_rom_block },
              { qid: 'ELBOW_07', value: m.elbow.septic_joint_emergency_screen },
              { qid: 'ELBOW_08', value: m.elbow.posterior_bursal_screen },
              { qid: 'ELBOW_09', value: m.elbow.ulnar_sensory_screen },
              { qid: 'ELBOW_09A', value: m.elbow.ulnar_motor_progression_screen },
              { qid: 'ELBOW_10', value: m.elbow.referred_proximal_screen },
              { qid: 'ELBOW_11', value: m.elbow.cardiac_associated_screen },
              { qid: 'ELBOW_12', value: m.elbow.pain_location_pattern },
              { qid: 'ELBOW_13', value: m.elbow.primary_side },
              { qid: 'ELBOW_14', value: m.elbow.load_activity_pattern },
              { qid: 'ELBOW_15', value: m.elbow.rapid_post_trauma_swelling },
            ]
          : []),
        /**
         * WRIST_HAND_V1: same `m.pain.primary_location === 'arm_hand'` gate
         * as ELBOW above (NOT `primaryModuleDetail`) -- for the same
         * reason: an ELBOW-only patient (`ELBOW_00 === 'ELBOW'`) shares
         * this `arm_hand` tag but never saw WH_01-14, so those fields
         * render safely as raw-null. `region_discriminator` is
         * deliberately NOT repeated here -- it already appears once in the
         * ELBOW block above (`ELBOW_00`), reading the same shared router
         * value from `m.elbow.region_discriminator` (Fable plan §11).
         */
        ...(m.pain.primary_location === 'arm_hand'
          ? [
              { qid: 'WH_01', value: m.wrist_hand.recent_trauma },
              { qid: 'WH_02', value: m.wrist_hand.deformity_neurovascular_open_injury_screen },
              { qid: 'WH_03', value: m.wrist_hand.post_trauma_major_function_loss },
              { qid: 'WH_04', value: m.wrist_hand.post_trauma_radial_thumb_base_pain },
              { qid: 'WH_04A', value: m.wrist_hand.prior_xray_context },
              { qid: 'WH_05', value: m.wrist_hand.post_trauma_fixed_motion_block },
              { qid: 'WH_06', value: m.wrist_hand.wound_exposure },
              { qid: 'WH_06A', value: m.wrist_hand.post_wound_active_motion_loss },
              { qid: 'WH_07', value: m.wrist_hand.infection_broad_screen },
              { qid: 'WH_07A', value: m.wrist_hand.flexor_sheath_followup },
              { qid: 'WH_08', value: m.wrist_hand.distal_sensory_pattern },
              { qid: 'WH_08A', value: m.wrist_hand.motor_progression_screen },
              { qid: 'WH_09', value: m.wrist_hand.pain_location_pattern },
              { qid: 'WH_10', value: m.wrist_hand.load_activity_pattern },
              { qid: 'WH_11', value: m.wrist_hand.trigger_catching_pattern },
              { qid: 'WH_12', value: m.wrist_hand.localized_mass_pattern },
              { qid: 'WH_13', value: m.wrist_hand.referred_systemic_pattern },
              { qid: 'WH_14', value: m.wrist_hand.primary_side },
            ]
          : []),
        /**
         * TMJ_V1: same `m.pain.primary_location === 'head_face_jaw'` gate
         * pattern as ELBOW/WRIST_HAND above (NOT `primaryModuleDetail`) --
         * a HEADACHE_CRANIAL-tagged patient shares this `head_face_jaw`
         * tag but never saw TMJ_01-05 (T2), so those fields render safely
         * as raw-null.
         */
        ...(m.pain.primary_location === 'head_face_jaw'
          ? [
              { qid: 'HFJ_00', value: m.tmj.region_discriminator },
              { qid: 'TMJ_01', value: m.tmj.trauma_dislocation_screen },
              { qid: 'TMJ_02', value: m.tmj.dental_infection_screen },
              { qid: 'TMJ_03', value: m.tmj.gca_history_screen },
              { qid: 'TMJ_04', value: m.tmj.facial_neuro_screen },
              { qid: 'TMJ_05', value: m.tmj.current_lock_screen },
            ]
          : []),
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
        { qid: 'WOMEN_02', value: m.women.menstrual_status },
        { qid: 'WOMEN_03', value: m.women.menopause_symptoms },
      ]
    case 'Pregnancy':
      return [
        { qid: 'PREGNANCY_01', value: m.pregnancy.status },
        { qid: 'PREGNANCY_02', value: m.pregnancy.trimester },
        { qid: 'PREGNANCY_03', value: m.pregnancy.concerns },
      ]
    case 'Postpartum':
      return [
        { qid: 'POSTPARTUM_01', value: m.postpartum.time_since_delivery },
        { qid: 'POSTPARTUM_02', value: m.postpartum.problems },
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

/**
 * v0.2 §4 Level2/P4 — "문진 핵심" 필드 그룹. 유의미 응답(양성/구체)을
 * Body-strong으로 먼저 보여주고, muted(none/unknown)는 뒤로 미룬다. 원본
 * 순서 그대로의 전체 목록은 "원시 응답 전체 보기" 펼치기 안에 별도로 둔다
 * (데이터 손실 없음 — 유의미 응답은 위/아래 두 곳에 의도적으로 중복
 * 렌더된다, 기존 "10초 요약" 카드와 같은 종류의 중복 패턴).
 */
function ModuleFieldGroup({ fields }: { fields: ModuleField[] }) {
  if (fields.length === 0) return null
  const sorted = sortFieldsBySignificance(fields)
  return (
    <>
      <div className="doctor__grid">
        {sorted.map((f) => (
          <Field key={f.qid} qid={f.qid} value={f.value} strong />
        ))}
      </div>
      <details className="doctor__secDetails doctor__rawFieldsToggle">
        <summary>원시 응답 전체 보기</summary>
        <div className="doctor__grid">
          {fields.map((f) => (
            <Field key={f.qid} qid={f.qid} value={f.value} />
          ))}
        </div>
      </details>
    </>
  )
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
export function relativeTime(iso: string): string {
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
 * v0.2 §8.2 — 목록 정렬: URGENT 최상단 → 신규 → 최신순, 완료는 별도
 * 접힘 그룹. 서버 응답(created_at desc)을 그대로 신뢰하지 않고 여기서
 * 다시 명시적으로 정렬한다 — 정렬 규칙이 이 함수 하나에만 존재해야
 * 다음에 필드가 늘어도 규칙이 흩어지지 않는다.
 */
function sortSubmissionsForList(
  submissions: SubmissionSummary[],
): { active: SubmissionSummary[]; completed: SubmissionSummary[] } {
  const active = submissions.filter((s) => s.status !== 'completed')
  const completed = submissions.filter((s) => s.status === 'completed')
  const rank = (s: SubmissionSummary) => (s.overview === 'URGENT' ? 0 : s.status === 'new' ? 1 : 2)
  const sorted = [...active].sort((a, b) => {
    const r = rank(a) - rank(b)
    if (r !== 0) return r
    return a.created_at < b.created_at ? 1 : -1
  })
  return { active: sorted, completed }
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
  const [serverError, setServerError] = useState<{ message: string; kind: 'auth' | 'network' | 'other' } | null>(
    null,
  )
  const [listLoading, setListLoading] = useState(true)
  const [retryNonce, setRetryNonce] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedRecord, setSelectedRecord] = useState<SubmissionRecord | null>(null)
  const viewedRef = useRef<Set<string>>(new Set())
  // ⚙ 도구 메뉴의 "원본 데이터 보기"가 스크롤해서 열어주는 대상.
  const rawJsonRef = useRef<HTMLDetailsElement>(null)
  const [workstationId, setWorkstationId] = useState<string | null>(() => getStoredWorkstationId())
  // tokenVersion bumps whenever the sessionStorage doctor token is set/cleared
  // from this screen, forcing a re-render (poll effect below depends on it
  // too, so a fresh/cleared token retries immediately).
  const [tokenVersion, setTokenVersion] = useState(0)
  const hasDoctorToken = getStoredDoctorToken() !== null

  // 병목 9: 제출목록 카드의 EMR 준비 배지/미확인 dot/토스트. recorder_ready는
  // 서버가 실제 방문 데이터로 계산해 내려주는 값이라(store.js), 여기서는
  // "이전 폴링과 비교해 새로 true가 된 id"만 판정한다 — 클라이언트가
  // 스스로 processing 상태를 추정하지 않는다. 첫 폴링 결과는 기준점으로만
  // 쓰고 토스트를 띄우지 않는다(마운트 시점에 이미 준비된 건들이 전부
  // "새 도착"으로 잘못 뜨는 것을 막기 위함).
  const knownReadyIdsRef = useRef<Set<string> | null>(null)
  const [unreadReadyIds, setUnreadReadyIds] = useState<Set<string>>(new Set())
  const [readyToast, setReadyToast] = useState<{ id: string; patientLabel: string } | null>(null)

  const [recorderResults, setRecorderResults] = useState<RecorderResult[] | null>(null)
  const [recorderResultsError, setRecorderResultsError] = useState<string | null>(null)
  const [emrText, setEmrText] = useState('')
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle')
  // 같은 recording_id로 폴링이 다시 돌아와도 EMR 텍스트를 다시 만들지
  // 않기 위한 최신 seed 기준점(새 recording_id가 오면 편집 중일 때는
  // 자동으로 덮어쓰지 않는다 — v0.2 §11.5, 아래 seed effect 참고).
  const emrSeedRecordingIdRef = useRef<string | null>(null)
  // v0.2 §11.5 — EMR 시트: 레일에는 버튼만 두고, 실제 편집/복사는 이
  // overlay 시트에서 한다. emrEdited는 "사용자가 textarea를 한 번이라도
  // 편집했는가"를 추적해 자동 덮어쓰기 여부를 가른다. pendingEmrText는
  // 편집 중에 새 recording_id가 도착했을 때 즉시 반영하지 않고 보류해 둔
  // 텍스트 — amber 스트립의 "새 요약으로 교체"를 누르면 이걸로 교체한다.
  const [emrSheetOpen, setEmrSheetOpen] = useState(false)
  const [emrEdited, setEmrEdited] = useState(false)
  const [pendingEmrText, setPendingEmrText] = useState<string | null>(null)
  // v0.2 §11.8 — 진료 완료 버튼(상단바, 서버 모드 + 상세 열림 시). 기존
  // setSubmissionStatus 계약을 재사용한다(신규 서버 계약 없음).
  const [completing, setCompleting] = useState(false)
  const [completeError, setCompleteError] = useState<string | null>(null)

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

        const readyIds = new Set(result.data.filter((s) => s.recorder_ready).map((s) => s.id))
        if (knownReadyIdsRef.current === null) {
          knownReadyIdsRef.current = readyIds
        } else {
          const known = knownReadyIdsRef.current
          const newlyReady = [...readyIds].filter((id) => !known.has(id))
          if (newlyReady.length > 0) {
            setUnreadReadyIds((prev) => {
              const next = new Set(prev)
              newlyReady.forEach((id) => next.add(id))
              return next
            })
            const firstId = newlyReady[0]
            setReadyToast({
              id: firstId,
              patientLabel:
                newlyReady.length === 1
                  ? (result.data.find((s) => s.id === firstId)?.patient_label ?? '')
                  : `${newlyReady.length}건`,
            })
          }
          knownReadyIdsRef.current = readyIds
        }
      } else {
        setServerError({ message: result.error, kind: result.kind })
      }
      setListLoading(false)
    }

    poll()
    const timer = setInterval(poll, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [mode, retryNonce, tokenVersion])

  // 서버 모드: 선택한 제출건 상세를 불러오고, 처음 열 때만 'viewed'로 표시한다.
  useEffect(() => {
    if (mode !== 'server' || !selectedId) {
      setSelectedRecord(null)
      return
    }
    let cancelled = false
    setUnreadReadyIds((prev) => {
      if (!prev.has(selectedId)) return prev
      const next = new Set(prev)
      next.delete(selectedId)
      return next
    })
    getSubmission(selectedId).then((result) => {
      if (cancelled) return
      if (result.ok) {
        setSelectedRecord(result.data)
        if (!viewedRef.current.has(selectedId)) {
          viewedRef.current.add(selectedId)
          setSubmissionStatus(selectedId, 'viewed')
        }
      } else {
        setServerError({ message: result.error, kind: result.kind })
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
      setEmrEdited(false)
      setPendingEmrText(null)
      setEmrSheetOpen(false)
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

  // 비차단 토스트 1회: 몇 초 뒤 스스로 사라진다(닫기 버튼 없이도 화면을 막지 않음).
  useEffect(() => {
    if (!readyToast) return
    const t = setTimeout(() => setReadyToast(null), 6000)
    return () => clearTimeout(t)
  }, [readyToast])

  // v0.2 §11.5 — 새 recording 결과가 도착했을 때만 EMR 요약 텍스트를 다시
  // 만든다. **자동 덮어쓰기 금지**: 사용자가 textarea를 한 번이라도
  // 편집했으면(emrEdited) 새 recording_id가 와도 즉시 반영하지 않고
  // pendingEmrText에 보류한다 — 시트의 amber 스트립("새 요약 도착")에서
  // 원장이 명시적으로 "내 편집 유지"/"새 요약으로 교체"를 고른다. 편집한
  // 적이 없으면 기존대로 자동 seed한다.
  // emrEdited는 의도적으로 deps에서 뺐다 — 이 effect는 "새 recording_id가
  // 도착한 시점"에만 실행되어야 하고, 그 순간의 emrEdited 값(가장 최근
  // 렌더의 최신 값)만 읽으면 된다. 사용자가 편집 여부를 바꿀 때마다 이
  // effect가 다시 도는 것은 의도가 아니다.
  useEffect(() => {
    const latest = recorderResults?.[0] ?? null
    if (!latest) return
    if (emrSeedRecordingIdRef.current === latest.recording_id) return
    emrSeedRecordingIdRef.current = latest.recording_id
    const nextText = buildEmrSummary({
      primaryConcern: primaryConcernLabel(r),
      structuredNote: latest.structured_note,
      judgment: selectedRecord?.judgment ?? null,
    })
    if (emrEdited) {
      setPendingEmrText(nextText)
    } else {
      setEmrText(nextText)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // 수동 재조립은 명시적 escape hatch다 — 재조립한 순간부터는 최신
    // 상태와 다시 동기화된 것이므로 "편집 중" 표시와 보류 중이던 자동
    // 요약을 함께 지운다.
    setEmrEdited(false)
    setPendingEmrText(null)
  }

  /** v0.2 §11.5 — 시트 textarea 편집. 사용자가 직접 고친 것만 emrEdited를 세운다. */
  function handleEmrTextChange(next: string) {
    setEmrText(next)
    setEmrEdited(true)
  }

  /** amber 스트립 — "내 편집 유지": 보류 중이던 새 요약을 버리고 지금 텍스트를 그대로 둔다. */
  function handleKeepMyEmrEdit() {
    setPendingEmrText(null)
  }

  /** amber 스트립 — "새 요약으로 교체": 보류 중이던 새 요약을 적용하고 편집 상태를 초기화한다. */
  function handleReplaceEmrWithNewSummary() {
    if (pendingEmrText === null) return
    setEmrText(pendingEmrText)
    setPendingEmrText(null)
    setEmrEdited(false)
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

  const showingRecord = mode === 'fixtures' || Boolean(selectedRecord)

  // v0.2 §11.1 — 안전 상태 단일 출처. 헤더 pill·URGENT 배너·통합 안전
  // 리스트가 전부 이 selector 하나만 읽는다(invariant). 원장 진찰 입력
  // (lbp_objective_motor_deficit/shoulder_objective_cuff_weakness)은 서버
  // 모드에서만 존재한다 — fixtures 미리보기는 "아직 진찰 전"으로 취급한다.
  const clinicianInputs: SafetyClinicianInputs = {
    lbpObjectiveMotorDeficit: mode === 'server' ? selectedRecord?.judgment?.lbp_objective_motor_deficit : undefined,
    shoulderObjectiveCuffWeakness:
      mode === 'server' ? selectedRecord?.judgment?.shoulder_objective_cuff_weakness : undefined,
  }
  const safetyOverview = showingRecord ? deriveSafetyOverview(payload, clinicianInputs) : undefined
  // v0.2 §11.4: 오늘 확인 목록(TodayChecklist)이 examCodes를 읽기 위해 같은
  // computeSafetyModuleRows 결과를 재사용한다 — 안전 계산 경로를 새로
  // 만들지 않는다(invariant). urgentModuleRows는 이 배열의 부분집합이다.
  const safetyRows = showingRecord ? computeSafetyModuleRows(payload, clinicianInputs) : []
  const urgentModuleRows = safetyRows.filter((row) => row.status === 'URGENT_REVIEW')

  async function handleCompleteVisit() {
    if (!selectedId) return
    setCompleting(true)
    setCompleteError(null)
    const result = await setSubmissionStatus(selectedId, 'completed')
    setCompleting(false)
    if (result.ok) {
      setSelectedId(null)
    } else {
      setCompleteError(result.error)
    }
  }

  return (
    <div className="doctor">
      {readyToast && (
        <div className="doctor__toast" role="status">
          {readyToast.patientLabel} — EMR 복사 준비됨
        </div>
      )}
      {/*
        v0.2 §8.1/§3: 상단바(44px) — 데이터 소스/fixture 픽커/토큰 clear/
        원본 JSON 이동은 전부 ⚙ 도구 메뉴 안으로 옮겼다(Opus N6/N7). 워크
        스테이션 배지는 meta 영역에 남긴다.
      */}
      <header className="doctor__topbar">
        {mode === 'server' && selectedRecord && (
          <button type="button" className="doctor__topbar__back" onClick={() => setSelectedId(null)}>
            ← 목록
          </button>
        )}
        <h1 className="doctor__topbar__title">
          {showingServerList ? `진료 전 요약 — 제출목록 (${submissions.length})` : '진료 전 요약'}
        </h1>
        {showingServerList && newCount > 0 && <span className="doctor__newBadge">신규 {newCount}</span>}
        {/*
          v0.2 §11.8 — 진료 완료 버튼: 서버 모드 + 상세 열림 시에만.
          setSubmissionStatus(id, 'completed') 기존 계약 재사용(신규 계약
          없음). in_consultation 자동 전이는 PO 승인 대기 항목이라 구현하지
          않는다 — 열람 시 'viewed' 세팅만 기존대로 유지된다.
        */}
        {mode === 'server' && selectedRecord && (
          <button type="button" className="doctor__completeBtn" onClick={handleCompleteVisit} disabled={completing}>
            {completing ? '처리 중…' : '진료 완료'}
          </button>
        )}
        {completeError && <span className="doctor__completeError">진료 완료 처리 실패 — {completeError}</span>}
        <div className="doctor__topbar__spacer" />
        <div className="doctor__topbar__meta">
          <span className="doctor__workstationBadge">
            {workstationId ? `WS-${workstationId}` : '워크스테이션 설정 필요'}
          </span>
          {mode === 'server' && selectedRecord?.visit_id && (
            <span className="doctor__activeVisitBadge">현재 진료 중으로 표시됨</span>
          )}
        </div>
        <details className="doctor__toolsMenu">
          <summary className="doctor__toolsMenu__trigger" aria-label="도구 메뉴">
            ⚙
          </summary>
          <div className="doctor__toolsMenu__panel">
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
            {mode === 'server' && hasDoctorToken && (
              <DoctorTokenClearButton
                onClear={() => {
                  setTokenVersion((n) => n + 1)
                  setRetryNonce((n) => n + 1)
                }}
              />
            )}
            {showingRecord && (
              <button
                type="button"
                className="judgment__recordBtn"
                onClick={() => {
                  const el = rawJsonRef.current
                  if (!el) return
                  el.open = true
                  el.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }}
              >
                원본 데이터 보기
              </button>
            )}
          </div>
        </details>
      </header>

      {showingRecord && (
        <PatientHeader payload={payload} overview={safetyOverview} responseConsistencyReview={flags.response_consistency_review} />
      )}

      <div className="doctor__pageSection">
        {!workstationId && <WorkstationSetup onSet={setWorkstationId} />}

        {mode === 'server' && serverError?.kind === 'auth' && (
          <DoctorTokenSetup
            authFailed
            onSet={() => {
              setTokenVersion((n) => n + 1)
              setRetryNonce((n) => n + 1)
            }}
          />
        )}

        {mode === 'server' && serverError && serverError.kind !== 'auth' && (
          <div className="doctor__banner doctor__banner--danger">
            <strong>서버에 연결할 수 없습니다</strong>
            <p>
              {serverError.message} — 로컬 핸드오프 서버(server/index.js)가 실행 중인지,
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
              (() => {
                const { active, completed } = sortSubmissionsForList(submissions)
                return (
                  <>
                    <div className="doctor__grid">
                      {active.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          className={`doctorField doctor__row${s.status === 'new' ? ' doctor__row--new' : ''}`}
                          onClick={() => setSelectedId(s.id)}
                        >
                          <span className="doctorField__label">
                            {s.status === 'new' && <span className="doctor__newDot" aria-hidden="true" />}
                            {unreadReadyIds.has(s.id) && (
                              <span className="doctor__newDot doctor__newDot--ready" aria-hidden="true" />
                            )}
                            {/*
                              v0.2 A8/Opus MINOR: `requires_staff_check`
                              전용 구 배지("⚠ 안전 확인 필요")는 아래
                              `s.overview` 배지(모듈 URGENT까지 반영하는
                              단일 출처)와 같은 정보를 중복 표시했다 —
                              overview 배지로 통일하고 제거한다.
                            */}
                            {s.patient_label}
                            {s.overview === 'URGENT' && (
                              <span className="doctor__listOverview doctor__listOverview--urgent">
                                {STATUS_ICON.URGENT_REVIEW} 긴급 확인
                              </span>
                            )}
                            {s.overview === 'REVIEW' && (
                              <span className="doctor__listOverview doctor__listOverview--review">
                                {STATUS_ICON.REVIEW_REQUIRED} 확인 필요
                              </span>
                            )}
                          </span>
                          <span className="doctorField__value">
                            {statusLabel(s.status)} · {relativeTime(s.created_at)} ({new Date(s.created_at).toLocaleString('ko-KR')})
                            {s.recorder_ready && <span className="doctor__emrReadyBadge">✓ EMR 복사 준비됨</span>}
                          </span>
                        </button>
                      ))}
                    </div>
                    {completed.length > 0 && (
                      <details className="doctor__secDetails">
                        <summary>오늘 완료 {completed.length}건</summary>
                        <div className="doctor__grid">
                          {completed.map((s) => (
                            <button
                              key={s.id}
                              type="button"
                              className="doctorField doctor__row"
                              onClick={() => setSelectedId(s.id)}
                            >
                              <span className="doctorField__label">
                                {s.patient_label}
                                {/*
                                  v0.2 A8/Opus MINOR: 완료 그룹도 overview
                                  배지를 유지한다(강조만 낮춤,
                                  `--completed` modifier) — 완료된 방문이라도
                                  안전 확인 이력 자체가 사라지면 안 된다.
                                */}
                                {s.overview === 'URGENT' && (
                                  <span className="doctor__listOverview doctor__listOverview--urgent doctor__listOverview--completed">
                                    {STATUS_ICON.URGENT_REVIEW} 긴급 확인
                                  </span>
                                )}
                                {s.overview === 'REVIEW' && (
                                  <span className="doctor__listOverview doctor__listOverview--review doctor__listOverview--completed">
                                    {STATUS_ICON.REVIEW_REQUIRED} 확인 필요
                                  </span>
                                )}
                              </span>
                              <span className="doctorField__value">
                                {statusLabel(s.status)} · {relativeTime(s.created_at)} (
                                {new Date(s.created_at).toLocaleString('ko-KR')})
                              </span>
                            </button>
                          ))}
                        </div>
                      </details>
                    )}
                  </>
                )
              })()
            )}
          </section>
        )}
      </div>

      {showingRecord && (
      <>
      <div className="doctor__layout">
      <div className="doctor__mainCol">
      <TenSecondSummary payload={payload} />

      {/*
        v0.2 §11.1/Opus B1: URGENT 배너는 이제 `deriveSafetyOverview`
        하나만 읽는다 — 기존 `flags.requires_staff_check`(general/GI/Bowel
        red flag 전용) 배너 내용은 그대로 유지하되, 모듈별 URGENT_REVIEW
        (예: 무릎 패혈성 관절염 KNEE_07)도 이 밴드 안으로 통합한다. 이전에는
        모듈 URGENT가 목록/헤더 어디에도 반영되지 않아 "안전 확인됨"으로
        잘못 보일 수 있었다(B1 시나리오).
      */}
      {safetyOverview === 'URGENT' && (
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
            {urgentModuleRows.map((row) => (
              <li key={row.key}>{row.label}: 긴급 확인 필요</li>
            ))}
          </ul>
        </div>
      )}

      <SafetySection payload={payload} clinicianInputs={clinicianInputs} />

      {/*
        Tablet UX v2.2 §33: 현재 questionnaire mode를 작게 표시한다 --
        진단/임상 판단이 아닌 운영 참고 메타데이터이며, 위 safety
        panel/banner들보다 절대 강조되지 않는다(순서상으로도 그 아래,
        스타일상으로도 muted). §33 예시 3개 라벨만 정확히 쓴다 --
        symptom_consult/women/weight 등 pain이 아닌 pain_fast 케이스는
        "통증"이라는 단어가 부정확하므로 아예 배지를 표시하지 않는다.
      */}
      {questionnaireModeLabel(routing) && (
        <p className="doctor__modeBadge">진료 문진 — {questionnaireModeLabel(routing)}</p>
      )}

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
        </div>
      </section>

      {/*
        Tablet UX v2.1 §11-§24: 문진 구조를 3구역으로 명확히 분리한다 --
        주호소(위)는 항상 FULL module, 추가 상세상담(아래, 최대 1개)도
        명시 선택 시 FULL module, 참고 증상(아래, 복수 가능)은 module을
        절대 열지 않는 "있다는 사실"만 전달되는 flag다(§19 HARD RULE).
        참고 증상은 절대 진단처럼 보이면 안 되고, 기존 urgent safety
        panel보다 강조되지 않는다(§23) -- muted/작은 chip으로만 표시한다.
      */}
      {/*
        v0.2 §3: 항상-빈 legacy 섹션 3종은 데이터가 있을 때만 렌더한다 —
        새 문진에서는 구조적으로 항상 비어 있는 섹션이 매번 자리를 차지하지
        않게 한다. "없음" 안내문 자체를 지우는 것이지, 값이 있을 때의
        표시(§PART4 칩 등)는 그대로다.
      */}
      {routing.additional_module && (
        <section className="doctor__section">
          <h2>추가 상세상담</h2>
          <div className="doctor__chiefPrimary">
            <span className="doctor__chiefPrimary__label">추가 상세상담</span>
            <span className="doctor__chiefPrimary__value">
              {optionLabel('ADDITIONAL_DETAIL_01', routing.additional_detail_concern)}
            </span>
          </div>
          <ModuleFieldGroup
            fields={primaryModuleFields(routing.additional_module, r.modules, routing.additional_module_detail)}
          />
        </section>
      )}

      {referenceSymptomKeys(routing).length > 0 && (
        <section className="doctor__section">
          <h2>참고 증상</h2>
          <p className="doctor__derivedNote">
            환자가 선택한 참고용 정보입니다 — 진단이나 객관적 소견이 아니며, 필요 시 진료 중 확인하세요.
          </p>
          <div className="doctor__secChips">
            {referenceSymptomKeys(routing).map((k) => (
              <span key={k} className="doctor__secChip doctor__secChip--reference">
                <strong>{optionLabel('REFERENCE_SYMPTOMS_01', k)}</strong>
              </span>
            ))}
          </div>
          {referenceSymptomKeys(routing).includes('other') && (
            <p className="doctor__derivedNote">기타 참고증상 있음 — 진료 중 확인</p>
          )}
        </section>
      )}

      {secondaryChipsData(r).length > 0 && (
        <section className="doctor__section">
          <h2>동반문제</h2>
          <p className="doctor__derivedNote">
            이전 방식(SECONDARY_01)으로 저장된 문진의 하위호환 표시입니다. 새 문진은 위 "추가
            상세상담"/"참고 증상"으로 대체되어 이 구역이 대부분 비어 있습니다.
          </p>
          <div className="doctor__secChips">
            {secondaryChipsData(r).map((c) => (
              <span key={c.key} className="doctor__secChip" title={c.answerText}>
                <strong>{c.categoryLabel}</strong>
                <span className="doctor__secChip__text">{c.answerText || '—'}</span>
              </span>
            ))}
          </div>
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
      )}

      <section className="doctor__section">
        <h2 className="doctor__section__h2--sub">
          문진 핵심{routing.primary_module ? ` — ${routing.primary_module}` : ''}
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
        {(() => {
          const fields = primaryModuleFields(routing.primary_module, r.modules, routing.primary_module_detail)
          if (fields.length === 0) {
            return (
              <div className="doctor__grid">
                <p className="doctor__empty">이번 방문에는 해당 상세 Module이 없습니다.</p>
              </div>
            )
          }
          return <ModuleFieldGroup fields={fields} />
        })()}
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
            {primaryModuleFields(routing.primary_module, r.modules, routing.primary_module_detail)
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

      <details className="doctor__raw" ref={rawJsonRef}>
        <summary>원본 응답 보기 (JSON)</summary>
        <pre>{JSON.stringify(payload, null, 2)}</pre>
      </details>
      </div>

      {/*
        v0.2 §7/§8.1/§11 Level 3 — "행동" 영역. 레일 콘텐츠를 §8.1 예산
        (≤560px 목표)에 맞춰 압축했다: 오늘 확인(체크리스트) → 진찰 소견 →
        오늘 판단(compact) → EMR 열기 버튼. 진료 녹취·EMR 편집 자체는 더
        이상 레일에 상주하지 않고 시트(EmrSheet, 이 컴포넌트 바깥에 별도로
        렌더)로 옮겼다 — 레일에는 버튼 + 상태 dot만 남는다.
      */}
      <aside className="doctor__rail">
      <TodayChecklist
        payload={payload}
        rows={safetyRows}
        interactive={mode === 'server'}
        scopeKey={mode === 'server' ? selectedRecord?.visit_id ?? selectedId ?? undefined : undefined}
      />

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
        // v0.2 §11.2/Opus B3: primary_module_detail 게이트는 fail-open
        // 결함이었다(주호소가 비-통증이고 "추가 상세상담=허리"인 환자는
        // safety_flags.lbp가 계산되는데도 이 컨트롤이 렌더되지 않았다).
        // SHOULDER는 이미 같은 패턴으로 safety_flags 기준이었다.
        showLbpExam={payload.responses.safety_flags.lbp !== null}
        showShoulderExam={payload.responses.safety_flags.shoulder !== null}
        previewMode={mode === 'fixtures'}
        onSave={
          mode === 'server' && selectedId
            ? async (judgment: ClinicianJudgment): Promise<SaveResult> => {
                // v0.2 A4/Opus MAJOR: 저장 직전, 방금 입력된(아직
                // selectedRecord에 반영되지 않은) 진찰 소견을 반영해
                // deriveSafetyOverview를 다시 계산한다 — 위 `clinicianInputs`
                // (렌더용)는 selectedRecord?.judgment 기준이라 이번 저장으로
                // 새로 바뀐 값보다 한 박자 stale하므로 재사용하지 않는다.
                const freshClinicianInputs: SafetyClinicianInputs = {
                  lbpObjectiveMotorDeficit: judgment.lbp_objective_motor_deficit,
                  shoulderObjectiveCuffWeakness: judgment.shoulder_objective_cuff_weakness,
                }
                const judgmentToSave: ClinicianJudgment = {
                  ...judgment,
                  derived_safety_overview: deriveSafetyOverview(payload, freshClinicianInputs),
                }
                // selectedRecord를 갱신해야 selectedRecord?.judgment(EMR 요약 seed
                // effect와 "요약 다시 만들기" 버튼이 읽는 값)가 저장 직후 최신이
                // 된다 — 이걸 빼면 재열람 전까지 계속 stale한 judgment를 읽는다.
                const result = await saveJudgmentToServer(selectedId, judgmentToSave)
                if (result.ok) {
                  setSelectedRecord(result.data)
                  return { ok: true }
                }
                return { ok: false, error: result.error }
              }
            : undefined
        }
      />

      {/*
        v0.2 §11.5 — EMR 요약 열기 버튼 + 상태 dot만 레일에 둔다. recorder
        결과가 없는 방문(초진 대부분, fixtures 전부)에는 이 버튼 자체를
        렌더하지 않는다(빈 블록 금지).
      */}
      {mode === 'server' && selectedRecord?.visit_id && recorderResults && recorderResults.length > 0 && (
        <div className="doctor__emrOpenRow">
          <button type="button" className="doctor__emrOpenBtn" onClick={() => setEmrSheetOpen(true)}>
            EMR 요약 열기
          </button>
          <span className="doctor__emrStatusDot" aria-hidden="true" />
          <span className="doctor__emrStatusText">
            {pendingEmrText !== null ? '새 요약 도착' : '준비됨'}
          </span>
        </div>
      )}
      </aside>
      </div>

      <EmrSheet
        open={emrSheetOpen}
        onClose={() => setEmrSheetOpen(false)}
        recorderResults={recorderResults}
        recorderResultsError={recorderResultsError}
        recorderUpdatedLabel={recorderResults?.[0] ? relativeTime(recorderResults[0].updated_at) : null}
        emrText={emrText}
        onEmrTextChange={handleEmrTextChange}
        onCopy={handleCopyEmr}
        onRebuild={handleRebuildEmrSummary}
        copyStatus={copyStatus}
        pendingNewSummary={pendingEmrText !== null}
        onKeepMine={handleKeepMyEmrEdit}
        onReplaceWithNew={handleReplaceEmrWithNewSummary}
      />
      </>
      )}
    </div>
  )
}
