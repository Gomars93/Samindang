import { useEffect, useRef, useState } from 'react'
import { SECONDARY_SHORT_SCREENS } from '../spec/coreSpec'
import { answerLabel, optionLabel, questionLabel } from './labels'
import { DOCTOR_FIXTURES } from './fixtures'
import { JudgmentPanel } from './JudgmentPanel'
import { DoctorRecordErrorBoundary } from './DoctorRecordErrorBoundary'
import { buildEmrSummary } from './emrSummary'
import { DOCTOR_SECTION_ORDER } from './sectionOrder'
import type { ClinicianJudgment } from './judgment'
import type { DoctorPayload } from './types'
import type { AnswerValue } from '../types'
import {
  activateVisit,
  clearActiveVisit,
  getMicroFollowUpResponse,
  getPatientHistory,
  getRecorderResults,
  getSubmission,
  assignRevisitToStation,
  invalidateFollowUpSession,
  listCrmTasks,
  listPatientIdentities,
  listRevisitQueue,
  listStations,
  listSubmissions,
  registerStation,
  reissueFollowUpSession,
  resetStation,
  saveJudgment as saveJudgmentToServer,
  saveWorkspaceState as saveWorkspaceStateToServer,
  setSubmissionStatus,
  startRevisit,
  type RecorderResult,
  type ResolvedPatientIdentity,
  type SubmissionRecord,
  type SubmissionSummary,
} from '../lib/serverClient'
import type { PatientHistoryResult } from './workspace/longitudinal'
import type { MicroFollowUpResponse } from './workspace/microFollowUp'
import type { DeliveryMode, RevisitQueueItem, StationInfo } from './workspace/followUpSession'
import { DELIVERY_MODE_LABEL, INPUT_PROVENANCE_LABEL, REVISIT_STATUS_LABEL } from './workspace/followUpSession'
import type { CrmTask } from '../crm/types'
import { TodayQueueSection } from './TodayQueueSection'

// Round 9: the first tablet that is not already serving a patient. A busy
// tablet cannot be assigned (the server refuses it with 409 station_busy --
// see server/stationStore.js), so it must never be the default selection.
function firstFreeStationId(stations: StationInfo[]): string {
  return stations.find((s) => !s.assignment)?.stationId ?? ''
}
import { FollowUpQrCode } from './workspace/FollowUpQrCode'
import { MessagingPanel } from './MessagingPanel'
import { RevisitWorkspace } from './workspace/RevisitWorkspace'
import { WorkstationSetup } from './WorkstationSetup'
import { getStoredWorkstationId } from './workstation'
import { DoctorTokenSetup, DoctorTokenClearButton } from './DoctorTokenSetup'
import { getStoredDoctorToken } from './doctorToken'
import { buildPublicFollowUpLink } from '../lib/publicFollowUpUrl'
import { computeLbpFlags, diseaseSafetyLocked, treatmentSafetyLocked, type LbpComputedFields } from '../spec/lbpLogic'
import { toLbpStateFromDoctorPayload, ageFromDoctorPayload } from '../spec/lbpAdapter'
import {
  computeNeckFlags,
  neckDiseaseSafetyLocked,
  neckManipulationLocked,
  type NeckComputedFields,
} from '../spec/neckLogic'
import { toNeckStateFromDoctorPayload } from '../spec/neckAdapter'
import { computeShoulderFlags, shoulderSafetyLocked, type ShoulderComputedFields } from '../spec/shoulderLogic'
import { toShoulderStateFromDoctorPayload } from '../spec/shoulderAdapter'
import { computeKneeFlags, kneeSafetyLocked, KNEE08_HIP_FRACTURE_OPTION, type KneeComputedFields } from '../spec/kneeLogic'
import { toKneeStateFromDoctorPayload } from '../spec/kneeAdapter'
import { computeElbowFlags, elbowSafetyLocked, type ElbowComputedFields } from '../spec/elbowLogic'
import { toElbowStateFromDoctorPayload } from '../spec/elbowAdapter'
import { computeWristHandFlags, wristHandSafetyLocked, type WristHandComputedFields } from '../spec/wristHandLogic'
import { toWristHandStateFromDoctorPayload } from '../spec/wristHandAdapter'
import { DoctorWorkspace } from './workspace/DoctorWorkspace'
import { MedicationCourseSection } from './MedicationCourseSection'
import { deserializeWorkspaceState } from './workspace/persistence'
import { deriveViewProfile } from './workspace/viewProfile'
import { WORKSPACE_SCENARIOS } from './workspace/workspaceFixtures'
import './doctor.css'

export { DOCTOR_SECTION_ORDER }

export type Responses = DoctorPayload['responses']

/**
 * 값 하나를 (질문 id 기준으로) 라벨을 붙여 렌더링한다.
 * - null/undefined(질문을 아예 보지 않음)면 아무것도 렌더링하지 않는다.
 * - 'none'/'unknown'(환자가 실제로 답한 값)은 흐리게 표시해 "안 물어봄"과
 *   구분한다. 절대 같은 모양으로 보이면 안 된다.
 */
export function Field({
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

export function primaryConcernLabel(r: Responses): string {
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
export function frequencyField(
  primaryModule: string | null,
  m: Responses['modules'],
): { qid: string; value: AnswerValue } | null {
  switch (primaryModule) {
    case 'Sleep':
      return m.sleep ? { qid: 'SLEEP_02', value: m.sleep.frequency_per_week } : null
    case 'Bowel':
      return m.bowel ? { qid: 'BOWEL_02', value: m.bowel.frequency } : null
    case 'Urinary':
      return m.urinary ? { qid: 'URINARY_02', value: m.urinary.burden_frequency } : null
    default:
      return null
  }
}

export function aggravatingField(
  primaryModule: string | null,
  m: Responses['modules'],
): { qid: string; value: AnswerValue } | null {
  switch (primaryModule) {
    case 'Sleep':
      return m.sleep ? { qid: 'SLEEP_03', value: m.sleep.awakening_reasons } : null
    case 'GI':
      return m.gi ? { qid: 'GI_02', value: m.gi.meal_relation } : null
    case 'Pain': {
      if (!m.pain) return null
      const qualities = asArray<string>(m.pain.pain_qualities).filter(
        (q) => q === 'movement_related' || q === 'rest_pain',
      )
      return qualities.length > 0 ? { qid: 'PAIN_02', value: qualities } : null
    }
    case 'Fatigue':
      return m.fatigue ? { qid: 'FATIGUE_02', value: m.fatigue.worst_time } : null
    case 'Stress':
      return m.stress ? { qid: 'STRESS_03', value: m.stress.associated_symptoms } : null
    case 'Weight':
      return m.weight ? { qid: 'WEIGHT_02', value: m.weight.contributing_factors } : null
    default:
      return null
  }
}

export function isEmptyValue(value: AnswerValue | null | undefined): boolean {
  if (value === null || value === undefined) return true
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'string') return value.trim() === ''
  return false
}

/**
 * 레거시/손상된 제출은 배열이어야 할 필드가 문자열/객체 등 다른 타입으로
 * 저장돼 있을 수 있다(`?? []`만으로는 안 막힘 -- 값 자체가 존재하고
 * truthy면 그대로 통과한다). 배열이 아니면 무조건 빈 배열로 취급한다 --
 * "값이 있다"고 추정하지 않고 "확인된 목록이 없다"로 fail-closed.
 */
function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

/**
 * `?? []`/asArray는 필드 자체가 빠졌거나 잘못된 타입인 경우만 막는다 --
 * 배열 "안"의 각 원소가 문자열이 아니면(레거시 데이터에서 숫자/null/객체가
 * 섞여 들어올 수 있음) 여전히 위험하다. lbpAdapter.ts/neckAdapter.ts(둘 다
 * frozen)의 `mapMajorHistory`가 `medical_history_flags`의 각 원소에
 * `.toUpperCase()`를 무조건 호출하므로, 그 필드를 쓰는 패널의 게이트는
 * "배열이면서 모든 원소가 문자열"까지 확인해야 안전하다.
 */
function isNullOrStringArray(value: unknown): boolean {
  if (value == null) return true
  return Array.isArray(value) && value.every((v) => typeof v === 'string')
}

/**
 * 실제 제출은 `buildResponsePayload`가 각 모듈 하위 키를 전부(응답 안 한
 * 것도 `null`로) 채워서 만들기 때문에, 서브모듈이 "존재는 하지만 완전히
 * 빈 객체"인 경우는 실제 제출 흐름에서 나올 수 없다 -- 레거시/손상된
 * 데이터에서만 나온다. 빈 객체를 그대로 통과시키면 모든 leaf가
 * `undefined`가 되어 "확인 안 됨"이 전부 "아니요"로 렌더되는 fail-open이
 * 생긴다(이 배치가 막으려는 것과 정확히 같은 문제). 서브모듈에 키가
 * 하나도 없으면 빈 것과 동일하게 취급한다.
 */
function isNonEmptyObject(value: unknown): boolean {
  return isPlainObject(value) && Object.keys(value).length > 0
}

/**
 * 5차 독립 리뷰 HIGH-2: 각 SafetyPanel의 게이트가 "이 부위는 이 레코드와
 * 무관하다"(정상, 조용히 아무것도 안 그림 -- 예: LBP 레코드에서 어깨 패널)와
 * "이 부위는 이 레코드와 관련 있지만 저장된 응답 일부가 없거나 손상돼
 * 안전 상태를 계산할 수 없다"(레거시/손상 데이터)를 똑같이 `return null`
 * 하나로 뭉뚱그리고 있었다 -- 그래서 후자가 "이 부위는 안전 확인할 것이
 * 없다"로 오인될 수 있었다(이 배치가 막으려는 정확히 그 fail-open: 계산이
 * 안 됐을 뿐인데 화면은 "특이 안전정보 없음"처럼 보임). 이 컴포넌트는
 * 계산된 안전 상태를 절대 추정/대체하지 않고 "확인 필요"만 명시적으로
 * 알린다 -- 각 게이트는 "무관함" 조건과 "손상됨" 조건을 분리해서, 후자일
 * 때만 이걸 렌더링해야 한다.
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

/** 요약 카드용 "기간 · 빈도" 한 줄. 둘 다 없으면 줄 자체를 생략한다. */
export function durationFrequencyText(r: Responses, primaryModule: string | null): string | null {
  const duration = r.visit_goal.chief_duration
  const durText = isEmptyValue(duration) ? null : answerLabel('VISIT_03_SYMPTOM_DURATION', duration)
  const freq = frequencyField(primaryModule, r.modules)
  const freqText = freq && !isEmptyValue(freq.value) ? answerLabel(freq.qid, freq.value) : null
  if (!durText && !freqText) return null
  if (durText && freqText) return `${durText} · ${freqText}`
  return durText ?? freqText
}

/** Pain은 요약 카드에서만 짧은 고정 문구를 쓴다(스펙 §PART1 rule 3). */
export function aggravatingSummaryText(primaryModule: string | null, m: Responses['modules']): string | null {
  const agg = aggravatingField(primaryModule, m)
  if (!agg) return null
  if (primaryModule === 'Pain') {
    return (agg.value as string[])
      .map((v) => (v === 'movement_related' ? '움직일 때 악화' : '가만히 있어도 아픔'))
      .join(', ')
  }
  return answerLabel(agg.qid, agg.value)
}

export function safetyIssueCategories(flags: DoctorPayload['flags']): string[] {
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
export function sajuStatusLine(saju: DoctorPayload['myungri_calculation']): {
  text: string
  tone: 'neutral' | 'warning' | 'unresolved'
} {
  if (saju.status === 'resolved') {
    if (asArray(saju.policy.pending_approval).length === 0) return { text: '계산 완료', tone: 'neutral' }
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
export function MyungriCompactCard({ saju }: { saju: DoctorPayload['myungri_calculation'] }) {
  if (!saju.pillars?.day) {
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
  const pendingLabels = asArray<string>(saju.policy.pending_approval).map((k) => PENDING_APPROVAL_LABELS[k] ?? k)

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
 * 10초 요약/안전정보 카드는 PR #24부터 src/doctor/CommonSafetyBanner.tsx +
 * src/doctor/workspace/PainWorkspace.tsx / HerbalWorkspace.tsx로 이동했다
 * (Doctor Clinical Workspace shell). 이 파일에 있던 TenSecondSummary /
 * safetyGlanceItems / SafetyGlance는 그쪽에서 동일한 계산 입력을 그대로
 * 재사용해 다시 구현되었으므로 여기서는 삭제한다 -- 계산 로직(위 export된
 * 헬퍼들)은 하나도 바뀌지 않았고, 렌더링 위치만 옮겨졌다.
 */

const LBP_SAFETY_STATUS_LABEL: Record<LbpComputedFields['lbp_safety_status'], string> = {
  CLEAR: '안전',
  REVIEW_REQUIRED: '확인 필요',
  URGENT_REVIEW: '긴급 확인 필요',
}

const LBP_TREATMENT_SAFETY_LABEL: Record<LbpComputedFields['treatment_safety_status'], string> = {
  CLEAR: '안전',
  REVIEW_REQUIRED: '확인 필요',
}

const LBP_EXAM_LABELS: Record<string, string> = {
  TARGET_FUNCTION_REPRODUCTION: '목표 기능 재현 검사',
  LUMBAR_ACTIVE_MOVEMENT_RESPONSE: '요추 능동 움직임 반응 검사',
  LOWER_EXTREMITY_MOTOR_MYOTOME: '하지 근절(myotome) 근력 검사',
  SENSORY_SCREEN: '감각 검사',
  REFLEX_SCREEN: '반사 검사',
  NEURODYNAMIC_TEST_AS_INDICATED: '신경역동학 검사(필요시)',
  GAIT_AND_WALKING_TOLERANCE: '보행 및 보행 내구성 검사',
  NEUROLOGIC_EXAM: '신경학적 검사',
  HIP_SCREEN_AS_INDICATED: '고관절 검사(필요시)',
  VASCULAR_SCREEN_AS_INDICATED: '혈관 검사(필요시)',
}

/**
 * lbp_v1.0.yaml의 clinician_exam_selector.rules를 그대로 옮긴다. SIJ/hip
 * cluster 제안처럼 "원장이 의심할 때만" 해당하는 항목은 데이터로 판단할 수
 * 없어 제외한다(그 부분까지 자동 제안하면 클리니션 판단을 대신하는 것이 됨).
 */
function suggestedExamCodes(flags: LbpComputedFields, claudicationWalking: AnswerValue): string[] {
  const codes: string[] = []
  if (flags.lbp_safety_status === 'CLEAR') {
    codes.push('TARGET_FUNCTION_REPRODUCTION', 'LUMBAR_ACTIVE_MOVEMENT_RESPONSE')
  }
  if (flags.leg_symptom_present === 'YES' || flags.leg_symptom_present === 'UNKNOWN' || flags.lbp_neuro_baseline_required) {
    for (const c of ['LOWER_EXTREMITY_MOTOR_MYOTOME', 'SENSORY_SCREEN', 'REFLEX_SCREEN']) {
      if (!codes.includes(c)) codes.push(c)
    }
  }
  if (flags.leg_symptom_present === 'YES' || flags.leg_symptom_present === 'UNKNOWN') {
    codes.push('NEURODYNAMIC_TEST_AS_INDICATED')
  }
  if (claudicationWalking === 'YES') {
    codes.push('GAIT_AND_WALKING_TOLERANCE', 'NEUROLOGIC_EXAM', 'HIP_SCREEN_AS_INDICATED', 'VASCULAR_SCREEN_AS_INDICATED')
  }
  return codes
}

/**
 * LBP_V1 안전 확인 패널. SafetyGlance(일반 red flag)와 별개 — 인터럽트하지
 * 않는다(LBP_04 URGENT 값만 STAFF_CHECK_TRIGGERS로 별도 인터럽트, coreSpec.ts
 * 참고). `payload.routing.primary_module_detail !== 'LBP'`면 아무것도
 * 렌더링하지 않는다.
 *
 * clinician_objective_motor_deficit은 이 화면이 아니라 JudgmentPanel에서
 * 입력·저장되므로(기존 judgment 저장 경로 재사용, 별도 저장 메커니즘 없음)
 * 여기서는 마지막으로 저장된 judgment 값을 읽기만 한다 — 서버 모드가 아니면
 * (fixtures) 항상 "아직 진찰 전"으로 취급한다.
 */
export function LbpSafetyPanel({
  payload,
  lbpObjectiveMotorDeficit,
}: {
  payload: DoctorPayload
  lbpObjectiveMotorDeficit: ClinicianJudgment['lbp_objective_motor_deficit']
}) {
  // "이 레코드는 LBP와 무관하다"(조용히 아무것도 안 그림)와 "LBP와
  // 관련은 있지만 계산에 필요한 하위 데이터가 손상/누락됐다"(명시적
  // 확인 필요 알림)를 분리한다 -- 5차 독립 리뷰 HIGH-2.
  //
  // applicability 신호는 safety_flags.lbp(coreSpec.ts:
  // `IS_PRIMARY_LBP(r) ? computeLbpFlags(...) : null`)여야 한다 --
  // `routing.primary_module_detail`이 아니다. `IS_PRIMARY_LBP`는
  // `IS_PRIMARY_PAIN(r) && PAIN_01 === 'low_back_pelvis'`이고
  // `IS_PRIMARY_PAIN`은 `primaryConcernKey==='pain' ||
  // hasDetailedConcern(r,'pain')` -- 즉 주호소가 아니라 "Additional
  // Detailed Concern"으로 pain/허리를 선택한 환자도 safety_flags.lbp가
  // 계산되지만 `primary_module_detail`은 그 경로에서 null로 남는다(그
  // 값은 `additional_module_detail`에만 채워짐). 그래서 이전 게이트는
  // 이미 계산된 실제 URGENT_REVIEW/REVIEW_REQUIRED조차 화면에서 완전히
  // 지워버렸다 -- 6차 독립 리뷰 HIGH-1(다른 8개 패널은 전부
  // safety_flags.<region>을 쓰므로 LBP만 유일한 예외였다).
  if (payload.responses.safety_flags.lbp == null) return null

  // lbpAdapter.ts(frozen)의 mapPregnancyStatus는 reproductive_status.derived
  // 를, mapMajorHistory는 medical_history.medical_history_flags의 각
  // 원소가 문자열이라고 무조건 가정한다 -- 둘 다 없으면(레거시 데이터)
  // 그 함수들 안에서 던진다.
  if (
    !isNonEmptyObject(payload.responses.modules.lbp) ||
    !payload.responses.reproductive_status.derived ||
    !isNullOrStringArray(payload.responses.medical_history.medical_history_flags)
  ) {
    return <SafetyDataUnavailableNotice label="허리(LBP)" />
  }

  const age = ageFromDoctorPayload(payload.responses)
  const state = toLbpStateFromDoctorPayload(payload.responses, lbpObjectiveMotorDeficit, age)
  const flags = computeLbpFlags(state)
  const locked = diseaseSafetyLocked(flags)
  const treatmentLocked = treatmentSafetyLocked(flags)
  const legSymptomLabel =
    flags.leg_symptom_present === 'YES' ? '있음' : flags.leg_symptom_present === 'NO' ? '없음' : '확인 필요'
  const examCodes = suggestedExamCodes(flags, payload.responses.modules.lbp.claudication_walking)

  return (
    <div className={`doctor__lbpSafety doctor__lbpSafety--${flags.lbp_safety_status.toLowerCase()}`}>
      <span className="doctor__safetyGlance__title">안전 확인 — 허리(LBP)</span>
      <div className="doctor__safetyGlance__items">
        <span className="doctor__safetyChip">
          <strong>안전 확인</strong> {LBP_SAFETY_STATUS_LABEL[flags.lbp_safety_status]}
        </span>
        <span className="doctor__safetyChip">
          <strong>치료 안전</strong> {LBP_TREATMENT_SAFETY_LABEL[flags.treatment_safety_status]}
        </span>
        <span className="doctor__safetyChip">
          <strong>신경근성 증상 가능성</strong> {legSymptomLabel}
        </span>
        {flags.lbp_neuro_baseline_required && (
          <span className="doctor__safetyChip">
            <strong>신경학적 기저검사</strong> 필요(양쪽 다리 통증만, 자동 긴급 아님)
          </span>
        )}
        {flags.lbp_inflammatory_pattern_consider && (
          <span className="doctor__safetyChip">
            <strong>염증성 패턴</strong> 고려(진단 아님)
          </span>
        )}
      </div>
      {locked && (
        <p className="doctor__derivedNote">
          안전 확인 전까지 일상적인 운동/치료 추천은 잠깁니다 — 아래 추가 권장 검사를 우선하세요.
        </p>
      )}
      {treatmentLocked && !locked && (
        <p className="doctor__derivedNote">
          치료 안전(임신 등) 확인 전까지 금기 민감 치료/운동은 원장 승인 없이 확정하지 않습니다.
        </p>
      )}
      {examCodes.length > 0 && (
        <div className="doctor__lbpExam">
          <span className="doctor__safetyGlance__title">추가 권장 검사</span>
          <ul>
            {examCodes.map((c) => (
              <li key={c}>{LBP_EXAM_LABELS[c] ?? c}</li>
            ))}
          </ul>
        </div>
      )}
      {/* TODO(LBP_V2): exercise_recommender_contract(순위 매긴 운동 추천 + 원장 승인)는
          아직 구현하지 않음 — required_before_ranking의 원장 입력(irritability/
          movement_response/neuro_status)이 없고, target_function 대리 지표(chief_impact)로는
          계약을 충실히 만족시키지 못해 v1 범위에서 제외 (LBP_INTEGRATION_PLAN_DRAFT.md §4/Scope). */}
    </div>
  )
}

const NECK_SAFETY_STATUS_LABEL: Record<NeckComputedFields['neck_safety_status'], string> = {
  CLEAR: '안전',
  REVIEW_REQUIRED: '확인 필요',
  URGENT_REVIEW: '긴급 확인 필요',
}

const NECK_TREATMENT_SAFETY_LABEL: Record<NeckComputedFields['neck_treatment_safety_status'], string> = {
  CLEAR: '안전',
  REVIEW_REQUIRED: '확인 필요',
}

const NECK_RADICULAR_LABEL: Record<NeckComputedFields['radicular_support'], string> = {
  HIGHER_SUPPORT: '가능성 높음(임상 확인 필요)',
  CONSIDER: '고려 대상',
  LOWER_SUPPORT: '가능성 낮음',
  UNDETERMINED: '미분류(추가 확인 필요)',
}

const NECK_EXAM_LABELS: Record<string, string> = {
  CERVICAL_AROM: '경추 능동 관절가동범위 검사',
  TARGET_FUNCTION_REPRODUCTION: '목표 기능 재현 검사',
  C5_T1_MOTOR: 'C5-T1 근절 근력 검사',
  DERMATOMAL_SENSORY: '피부분절 감각 검사',
  REFLEX_SCREEN: '반사 검사(이두근/상완요골근/삼두근)',
  SPURLING_TEST: 'Spurling 검사',
  DISTRACTION_TEST: '견인 검사(distraction)',
  ULNT_AS_INDICATED: '상지 신경역동학 검사(필요시)',
  GAIT_TANDEM: '보행/일자보행 검사',
  UE_LE_MOTOR_SENSORY: '상하지 근력·감각 검사',
  HYPERREFLEXIA_SCREEN: '반사항진 검사',
  HOFFMANN_TEST: 'Hoffmann 검사',
  BABINSKI_CLONUS_AS_INDICATED: 'Babinski/clonus 검사(필요시)',
  HAND_DEXTERITY: '손 정교운동 검사',
  UPPER_CERVICAL_EXAM: '상부 경추 검사',
  CFRT_CANDIDATE: '두개경부 굴곡회전 검사(CFRT) 후보',
  SHOULDER_AROM_PROM_RESISTED: '어깨 관절가동범위·저항 검사',
  CERVICAL_VS_SHOULDER_REPRODUCTION: '경추 vs 어깨 증상 재현 검사',
  DEEP_NECK_FLEXOR_ENDURANCE: '심부 목굴곡근 조절·지구력 검사',
  SCAPULAR_CONTROL_ENDURANCE: '견갑골 조절·지구력 검사',
  FUNCTIONAL_POSTURE_TOLERANCE: '기능적 자세 내구성 검사',
}

/**
 * v0.2.1 §8 Suggested Exam Selector의 firing 조건을 그대로 옮긴다. §8이
 * 명시한 발화 조건(NB6에서 지적된 미기술을 구현 시점에 확정한 것) 그대로:
 * uncomplicated는 safety CLEAR일 때만(LBP_V1과 동일한 선택), distal
 * arm/neuro는 N07 원위부 또는 N09 concrete positive, cord concern은 N02
 * concrete positive 또는 N02A WORSENING, headache는 N10 YES,
 * shoulder-dominant는 SHOULDER_UPPER_ARM + N09 NONE, sustained posture는
 * N12 YES.
 */
function suggestedNeckExamCodes(
  flags: NeckComputedFields,
  neck: DoctorPayload['responses']['modules']['neck'],
): string[] {
  const codes: string[] = []
  if (flags.neck_safety_status === 'CLEAR') {
    codes.push('CERVICAL_AROM', 'TARGET_FUNCTION_REPRODUCTION')
  }

  const extent = neck.distal_extent
  const neuro = neck.arm_neuro_symptoms
  const hasConcreteNeuro =
    Array.isArray(neuro) && neuro.some((v) => v === 'PARESTHESIA' || v === 'NUMBNESS' || v === 'SUBJECTIVE_WEAKNESS')
  const isNeuroNoneOnly = Array.isArray(neuro) && neuro.length === 1 && neuro[0] === 'NONE'

  if (extent === 'FOREARM' || extent === 'HAND_FINGERS' || hasConcreteNeuro) {
    for (const c of ['C5_T1_MOTOR', 'DERMATOMAL_SENSORY', 'REFLEX_SCREEN', 'SPURLING_TEST', 'DISTRACTION_TEST', 'ULNT_AS_INDICATED']) {
      if (!codes.includes(c)) codes.push(c)
    }
  }

  const cord = neck.cord_concern_screen
  const hasCordConcrete =
    Array.isArray(cord) &&
    cord.some((v) =>
      ['HAND_CLUMSINESS', 'GAIT_BALANCE_CHANGE', 'BILATERAL_OR_MULTI_LIMB_NEURO', 'RAPIDLY_WORSENING_LIMB_WEAKNESS', 'NEW_BLADDER_BOWEL_CHANGE'].includes(v),
    )
  if (hasCordConcrete || neck.cord_symptom_course === 'WORSENING') {
    for (const c of ['GAIT_TANDEM', 'UE_LE_MOTOR_SENSORY', 'HYPERREFLEXIA_SCREEN', 'HOFFMANN_TEST', 'BABINSKI_CLONUS_AS_INDICATED', 'HAND_DEXTERITY']) {
      if (!codes.includes(c)) codes.push(c)
    }
  }

  if (neck.headache_present === 'YES') {
    codes.push('UPPER_CERVICAL_EXAM', 'CFRT_CANDIDATE')
    if (!codes.includes('CERVICAL_AROM')) codes.push('CERVICAL_AROM')
  }

  if (extent === 'SHOULDER_UPPER_ARM' && isNeuroNoneOnly) {
    codes.push('SHOULDER_AROM_PROM_RESISTED', 'CERVICAL_VS_SHOULDER_REPRODUCTION')
  }

  if (neck.sustained_posture_aggravation === 'YES') {
    codes.push('DEEP_NECK_FLEXOR_ENDURANCE', 'SCAPULAR_CONTROL_ENDURANCE', 'FUNCTIONAL_POSTURE_TOLERANCE')
  }

  return codes
}

/**
 * NECK_V1 안전 확인 패널. LbpSafetyPanel과 동일한 원칙 — 인터럽트하지
 * 않는다(URGENT_REVIEW 값만 STAFF_CHECK_TRIGGERS로 별도 인터럽트,
 * coreSpec.ts 참고).
 *
 * 게이트를 `payload.responses.safety_flags.neck !== null`로 판정한다
 * (SHOULDER_V1 통합 전에는 `primary_module_detail !== 'NECK'`였음).
 * SHOULDER_V1이 도입되면서 `primary_module_detail`이 같은 `neck_shoulder`
 * 환자군에서도 `'SHOULDER'`가 될 수 있게 됐다 — 그 리터럴로 계속
 * 게이트했다면 SHOULDER_DOMINANT로 태깅된 환자의 canonical NECK safety
 * (양성이었을 수도 있는)가 이 패널에서 안 보이는, 바로 그 F1이 막으려던
 * 종류의 결함이 생겼을 것이다. `safety_flags.neck`은 NS01 값과 무관하게
 * `PAIN_01 === 'neck_shoulder'`인 모든 환자에게 항상 계산되므로(coreSpec.ts
 * buildResponsePayload 참고), 이 게이트는 기존 NECK-only 시나리오에서는
 * 완전히 동일하게 동작하고(그때는 safety_flags.neck !== null ⟺
 * primary_module_detail === 'NECK'였음) SHOULDER_DOMINANT 환자에서만
 * 추가로 렌더링된다 — 순수 additive, 회귀 없음.
 *
 * LBP와 달리 disease safety 계산에 원장 입력(clinician judgment)이 필요
 * 없다 — v0.2.1 §5는 순수하게 환자 응답 + Core reuse만으로 계산되므로
 * JudgmentPanel에 대응 필드를 추가하지 않았다.
 */
export function NeckSafetyPanel({ payload }: { payload: DoctorPayload }) {
  // safety_flags.neck는 이 레코드가 NECK/SHOULDER 부위와 관련 있는지의
  // applicability 신호다(위 클래스 doc comment 참고) -- null이면 조용히
  // 아무것도 안 그린다(무관함, 정상). 그 외 조건은 "관련은 있지만 계산
  // 불가"이므로 명시적 알림을 그린다 -- 5차 독립 리뷰 HIGH-2.
  if (payload.responses.safety_flags.neck == null) return null

  // neckAdapter.ts(frozen)의 mapPregnancyStatus/mapMajorHistory도 LBP와
  // 같은 두 필드를 무조건 가정한다 -- 위 LbpSafetyPanel과 동일한 이유.
  // mapMedication도 medication.medication_types의 각 원소에
  // .toUpperCase()를 무조건 호출한다(5차 독립 리뷰 HIGH-1) -- 원소가
  // 문자열이 아니면(레거시 데이터) 던진다.
  if (
    !isNonEmptyObject(payload.responses.modules.neck) ||
    !payload.responses.reproductive_status.derived ||
    !isNullOrStringArray(payload.responses.medical_history.medical_history_flags) ||
    !isNullOrStringArray(payload.responses.medication.medication_types)
  ) {
    return <SafetyDataUnavailableNotice label="목(NECK)" />
  }

  const state = toNeckStateFromDoctorPayload(payload.responses)
  const flags = computeNeckFlags(state)
  const locked = neckDiseaseSafetyLocked(flags)
  const manipulationLocked = neckManipulationLocked(flags)
  const examCodes = suggestedNeckExamCodes(flags, payload.responses.modules.neck)

  return (
    <div className={`doctor__lbpSafety doctor__lbpSafety--${flags.neck_safety_status.toLowerCase()}`}>
      <span className="doctor__safetyGlance__title">안전 확인 — 목(NECK)</span>
      <div className="doctor__safetyGlance__items">
        <span className="doctor__safetyChip">
          <strong>안전 확인</strong> {NECK_SAFETY_STATUS_LABEL[flags.neck_safety_status]}
        </span>
        <span className="doctor__safetyChip">
          <strong>치료 안전</strong> {NECK_TREATMENT_SAFETY_LABEL[flags.neck_treatment_safety_status]}
        </span>
        <span className="doctor__safetyChip">
          <strong>신경근성 증상(방사통) 지지도</strong> {NECK_RADICULAR_LABEL[flags.radicular_support]}
        </span>
        {flags.neck_neuro_baseline_required && (
          <span className="doctor__safetyChip">
            <strong>신경학적 기저검사</strong> 필요
          </span>
        )}
        {flags.cervicogenic_headache_pattern_consider && (
          <span className="doctor__safetyChip">
            <strong>경인성 두통 패턴</strong> 고려(진단 아님, CFRT 등 추가 검사 필요)
          </span>
        )}
        {flags.movement_coordination_deficit_consider && (
          <span className="doctor__safetyChip">
            <strong>자세 조절 저하</strong> 고려(진단 아님)
          </span>
        )}
      </div>
      {locked && (
        <p className="doctor__derivedNote">
          안전 확인 전까지 일상적인 운동 추천은 잠깁니다 — 아래 추가 권장 검사를 우선하세요.
        </p>
      )}
      {manipulationLocked && (
        <p className="doctor__derivedNote">
          {locked
            ? '안전 확인 전까지 경추 HVLA/추나 조작·견인 제안도 함께 잠깁니다.'
            : '치료 안전(항응고제·골다공증·출혈질환·임신 등) 확인 전까지 경추 HVLA/추나 조작·견인·침습적 치료는 원장 승인 없이 확정하지 않습니다.'}
        </p>
      )}
      {examCodes.length > 0 && (
        <div className="doctor__lbpExam">
          <span className="doctor__safetyGlance__title">추가 권장 검사</span>
          <ul>
            {examCodes.map((c) => (
              <li key={c}>{NECK_EXAM_LABELS[c] ?? c}</li>
            ))}
          </ul>
        </div>
      )}
      {/* TODO(NECK_V2): exercise_recommender_contract(순위 매긴 운동 추천 + 원장 승인)는
          LBP_V1과 동일한 이유로 v1 범위에서 제외 -- fail-closed lock만 구현
          (v0.2.1 §11, D6/checklist item 17-18과 동일한 판단). */}
    </div>
  )
}

const SHOULDER_SAFETY_STATUS_LABEL: Record<ShoulderComputedFields['shoulder_safety_status'], string> = {
  CLEAR: '안전',
  REVIEW_REQUIRED: '확인 필요',
  URGENT_REVIEW: '긴급 확인 필요',
}

const SHOULDER_EXAM_LABELS: Record<string, string> = {
  TARGET_FUNCTION_REPRODUCTION: '목표 기능 재현 검사',
  AROM_FLEXION_ABDUCTION_ER: '능동 관절가동범위 검사(굴곡/외전/외회전)',
  PROM_ELEVATION_ER_IR: '수동 관절가동범위 검사(거상/외회전/내회전)',
  CUFF_STRENGTH_ER_ABDUCTION_IR: '회전근개 근력 검사(외회전/외전-scaption/내회전)',
  DEFORMITY_NEUROVASCULAR_FIRST: '변형·신경혈관 우선 확인',
  ACTIVE_VS_PASSIVE_ELEVATION: '능동 vs 수동 거상 비교 검사',
  LAG_DROP_ARM_ADJUNCT: 'Lag/drop-arm 검사(보조)',
  APPREHENSION_RELOCATION_IF_SAFE: '불안정성 유발 검사(안전 확인 후에만)',
  MOVEMENT_CONTROL_ASSESSMENT: '움직임 조절 평가',
}

/**
 * v0.1.1 §7 Suggested Exam Selector의 firing 조건을 구현 시점에 확정한다
 * (NECK_V1의 NB6와 동일한 성격 — 스펙이 "무엇을 검사할지" 목록은 주지만
 * 정확한 트리거는 남겨둠). "Global passive restriction"(frozen
 * shoulder/OA 감별)과 "focal AC/local"은 태블릿에서 계산 가능한 명확한
 * trigger가 v0.1.1에 정의되어 있지 않아 자동 제안하지 않는다 — 원장
 * 판단에 맡긴다(§6이 이미 이 두 항목을 "Tablet에서 묻지 않음"으로
 * 분류). "Distal neuro / neck-linked"는 NeckSafetyPanel이 canonical NECK
 * 데이터로 이미 자체 권장 검사를 제공하므로 여기서 중복하지 않는다.
 */
function suggestedShoulderExamCodes(
  flags: ShoulderComputedFields,
  shoulder: DoctorPayload['responses']['modules']['shoulder'],
): string[] {
  const codes: string[] = []
  if (flags.shoulder_safety_status === 'CLEAR') {
    codes.push('TARGET_FUNCTION_REPRODUCTION', 'AROM_FLEXION_ABDUCTION_ER', 'PROM_ELEVATION_ER_IR', 'CUFF_STRENGTH_ER_ABDUCTION_IR')
  }

  const hadTrauma = shoulder.recent_trauma === 'YES'
  const hardTraumaPositive =
    Array.isArray(shoulder.trauma_emergency_screen) &&
    shoulder.trauma_emergency_screen.some((v) => v === 'DEFORMITY_OR_STILL_OUT' || v === 'NEW_NEUROVASCULAR_CHANGE')
  const acuteCuffConcern =
    shoulder.acute_traumatic_cuff_concern === 'YES' || shoulder.acute_traumatic_cuff_concern === 'UNKNOWN'
  if (hadTrauma && (hardTraumaPositive || acuteCuffConcern)) {
    codes.push('DEFORMITY_NEUROVASCULAR_FIRST', 'ACTIVE_VS_PASSIVE_ELEVATION', 'CUFF_STRENGTH_ER_ABDUCTION_IR', 'LAG_DROP_ARM_ADJUNCT')
  }

  if (shoulder.instability_present === 'YES') {
    codes.push('APPREHENSION_RELOCATION_IF_SAFE', 'MOVEMENT_CONTROL_ASSESSMENT')
  }

  return [...new Set(codes)]
}

/**
 * SHOULDER_V1 안전 확인 패널. NeckSafetyPanel과 동일한 원칙 — 인터럽트하지
 * 않는다(URGENT_REVIEW 값만 STAFF_CHECK_TRIGGERS로 별도 인터럽트,
 * coreSpec.ts 참고).
 *
 * 게이트는 `payload.responses.safety_flags.shoulder !== null`이다 —
 * `primary_module_detail === 'SHOULDER'`가 **아니다**. F1 invariant: SH01-05는
 * NS01 값과 무관하게 모든 `neck_shoulder` 환자에게 항상 노출/계산되므로,
 * 이 패널도 NS01이 `NECK_DOMINANT`/`SIMILAR`/`UNKNOWN`이어도 shoulder
 * safety가 양성이면 반드시 렌더링되어야 한다 — primary 태그로 게이트하면
 * F1이 막으려던 바로 그 결함(안전 정보가 태깅 때문에 숨겨짐)이 Doctor
 * View 레벨에서 재발한다.
 *
 * disease safety 계산에 원장 입력이 필요 없다(NECK과 동일) — 단
 * expedited_referral_consider의 세 번째 조건(원장 진찰에서 확인된 새
 * 회전근개 약화)만 JudgmentPanel의 `shoulder_objective_cuff_weakness`를
 * 읽어 반영한다(§11).
 */
export function ShoulderSafetyPanel({
  payload,
  shoulderObjectiveCuffWeakness,
}: {
  payload: DoctorPayload
  shoulderObjectiveCuffWeakness: ClinicianJudgment['shoulder_objective_cuff_weakness']
}) {
  // safety_flags.shoulder is the applicability signal (same convention as
  // NeckSafetyPanel) -- null means this record genuinely does not concern
  // the shoulder, so stay silent. Anything else below is "applicable but
  // not computable" and must show an explicit notice, not silence (5th
  // independent review HIGH-2).
  if (payload.responses.safety_flags.shoulder == null) return null

  // shoulderAdapter.ts internally calls toNeckStateFromDoctorPayload (shared
  // neck_shoulder safety logic, frozen) -- computing shoulder state without
  // modules.neck present crashes inside that frozen adapter, so this gate
  // must require both submodules, not just modules.shoulder. That frozen
  // path also reaches neckAdapter's mapPregnancyStatus/mapMajorHistory/
  // mapMedication, so it needs the same reproductive_status.derived/
  // medical_history_flags/medication_types checks as NeckSafetyPanel
  // itself (5th independent review HIGH-1: mapMedication's per-element
  // .toUpperCase() on medication_types was missed in round 4).
  if (
    !isNonEmptyObject(payload.responses.modules.shoulder) ||
    !isNonEmptyObject(payload.responses.modules.neck) ||
    !payload.responses.reproductive_status.derived ||
    !isNullOrStringArray(payload.responses.medical_history.medical_history_flags) ||
    !isNullOrStringArray(payload.responses.medication.medication_types)
  ) {
    return <SafetyDataUnavailableNotice label="어깨(SHOULDER)" />
  }

  const state = toShoulderStateFromDoctorPayload(
    payload.responses,
    payload.flags.general_red,
    shoulderObjectiveCuffWeakness,
  )
  const flags = computeShoulderFlags(state)
  const locked = shoulderSafetyLocked(flags)
  const examCodes = suggestedShoulderExamCodes(flags, payload.responses.modules.shoulder)

  return (
    <div className={`doctor__lbpSafety doctor__lbpSafety--${flags.shoulder_safety_status.toLowerCase()}`}>
      <span className="doctor__safetyGlance__title">안전 확인 — 어깨(SHOULDER)</span>
      <div className="doctor__safetyGlance__items">
        <span className="doctor__safetyChip">
          <strong>안전 확인</strong> {SHOULDER_SAFETY_STATUS_LABEL[flags.shoulder_safety_status]}
        </span>
        {flags.expedited_referral_consider && (
          <span className="doctor__safetyChip">
            <strong>신속 전문의 평가/의뢰 고려</strong> 급성 외상 후 회전근개 파열 가능성 평가 필요
          </span>
        )}
        {flags.pmr_or_systemic_inflammatory_pattern_consider && (
          <span className="doctor__safetyChip">
            <strong>양측성 염증 패턴</strong> 고려(진단 아님, PMR 등 전신질환 감별 필요)
          </span>
        )}
      </div>
      {locked && (
        <p className="doctor__derivedNote">
          안전 확인 전까지 일상적인 운동/도수치료 추천은 잠깁니다 — 아래 추가 권장 검사를 우선하세요.
        </p>
      )}
      {examCodes.length > 0 && (
        <div className="doctor__lbpExam">
          <span className="doctor__safetyGlance__title">추가 권장 검사</span>
          <ul>
            {examCodes.map((c) => (
              <li key={c}>{SHOULDER_EXAM_LABELS[c] ?? c}</li>
            ))}
          </ul>
        </div>
      )}
      {/* TODO(SHOULDER_V2): exercise_recommender_contract는 LBP_V1/NECK_V1과
          동일한 이유로 v1 범위에서 제외 -- fail-closed lock만 구현(§15). */}
    </div>
  )
}

const KNEE_SAFETY_STATUS_LABEL: Record<KneeComputedFields['knee_safety_status'], string> = {
  CLEAR: '안전',
  REVIEW_REQUIRED: '확인 필요',
  URGENT_REVIEW: '긴급 확인 필요',
}

const KNEE_EXAM_LABELS: Record<string, string> = {
  GAIT_WEIGHT_BEARING: '보행/체중부하 검사',
  KNEE_AROM_PROM_EXTENSION: '능동/수동 관절가동범위 검사(신전 포함)',
  EFFUSION_ASSESSMENT: '삼출(effusion) 평가',
  TARGET_FUNCTION_REPRODUCTION: '목표 기능 재현 검사',
  DISTAL_NEUROVASCULAR_EXAM: '원위부 신경혈관 검사',
  DEFORMITY_BONY_TENDERNESS: '변형·골압통 확인',
  FOCAL_BONY_TENDERNESS: '국소 골압통 확인',
  RADIOGRAPH_INDICATION_REVIEW: '방사선 촬영 필요성 검토',
  STRAIGHT_LEG_RAISE: '다리 들어올리기 검사(SLR)',
  ACTIVE_EXTENSION_EXTENSOR_LAG: '능동 신전/extensor lag 검사',
  EXTENSOR_MECHANISM_PALPATION: '신전기전 촉진',
  TRUE_MECHANICAL_BLOCK_VS_PAIN_LIMITED_ROM: '실제 기계적 차단 vs 통증성 ROM 제한 감별',
  JOINT_LINE_EXAM: '관절선 압통 검사',
  CLINICIAN_DVT_ASSESSMENT_WELLS: '원장 DVT 평가(Wells)',
  HIP_GROIN_EXAM: '고관절/서혜부 검사',
  WEIGHT_BEARING_ASSESSMENT: '체중부하 평가',
}

/**
 * Fable Integration Plan §5.4 Suggested Exam -- minimal mechanical mapping
 * only, CLOSED 문서가 직접 연결한 경우만 추천한다(SHOULDER의
 * suggestedShoulderExamCodes와 동일한 성격 -- 정확한 firing 조건은 구현
 * 시점에 확정). Meniscus/ligament/PF special test 목록은 raw pattern과
 * clinician judgment로 선택하는 영역이라 여기서 자동 제안하지 않는다(§6).
 */
function suggestedKneeExamCodes(
  flags: KneeComputedFields,
  knee: DoctorPayload['responses']['modules']['knee'],
): string[] {
  const codes: string[] = []
  if (flags.knee_safety_status === 'CLEAR') {
    codes.push('GAIT_WEIGHT_BEARING', 'KNEE_AROM_PROM_EXTENSION', 'EFFUSION_ASSESSMENT', 'TARGET_FUNCTION_REPRODUCTION')
  }

  const deformityNvConcern =
    (Array.isArray(knee.deformity_neurovascular_screen) &&
      knee.deformity_neurovascular_screen.some(
        (v) => v === 'GROSS_DEFORMITY_OR_STILL_OUT' || v === 'COLD_PALE_BLUE_FOOT' || v === 'MAJOR_NEW_DISTAL_NEURO_CHANGE',
      )) ||
    knee.spontaneously_reduced_dislocation_screen === 'YES'
  if (deformityNvConcern) {
    codes.push('DISTAL_NEUROVASCULAR_EXAM', 'DEFORMITY_BONY_TENDERNESS')
  }

  if (flags.fracture_imaging_consider) {
    codes.push('FOCAL_BONY_TENDERNESS', 'RADIOGRAPH_INDICATION_REVIEW')
  }

  if (knee.extensor_mechanism_concern === 'YES' || knee.extensor_mechanism_concern === 'UNKNOWN') {
    codes.push('STRAIGHT_LEG_RAISE', 'ACTIVE_EXTENSION_EXTENSOR_LAG', 'EXTENSOR_MECHANISM_PALPATION')
  }

  if (knee.true_locked_extension_block === 'YES' || knee.true_locked_extension_block === 'UNKNOWN') {
    codes.push('TRUE_MECHANICAL_BLOCK_VS_PAIN_LIMITED_ROM', 'JOINT_LINE_EXAM')
  }

  if (flags.dvt_assessment_required) {
    codes.push('CLINICIAN_DVT_ASSESSMENT_WELLS')
  }

  const hipGroinConcern =
    Array.isArray(knee.referred_non_knee_redflag_screen) &&
    knee.referred_non_knee_redflag_screen.includes(KNEE08_HIP_FRACTURE_OPTION)
  if (hipGroinConcern) {
    codes.push('HIP_GROIN_EXAM', 'WEIGHT_BEARING_ASSESSMENT')
  }

  return [...new Set(codes)]
}

/**
 * KNEE_V1 안전 확인 패널. NeckSafetyPanel/ShoulderSafetyPanel과 동일한 원칙
 * -- 인터럽트하지 않는다(URGENT_REVIEW 값만 STAFF_CHECK_TRIGGERS로 별도
 * 인터럽트, coreSpec.ts 참고). KNEE_V1은 다른 모듈 재사용이 없으므로 게이트는
 * 단순히 `safety_flags.knee !== null`이다 -- LBP/NECK/SHOULDER처럼
 * primary-tag와 safety-population이 어긋날 여지 자체가 없다(IS_PRIMARY_KNEE는
 * IS_PRIMARY_LBP/IS_PRIMARY_NECK와 완전히 독립).
 *
 * 이번 iteration에서는 clinician-entered objective field가 필요 없다(Fable
 * plan §3.2/§5.5) -- Wells/SLR/신경혈관 결과의 persistence schema는 아직
 * CLOSED되지 않았으므로 JudgmentPanel에 새 필드를 추가하지 않는다.
 */
export function KneeSafetyPanel({ payload }: { payload: DoctorPayload }) {
  // 무관함(null)과 계산 불가(applicable하지만 손상)를 분리 -- 5차 독립
  // 리뷰 HIGH-2, LbpSafetyPanel/NeckSafetyPanel과 동일한 원칙.
  if (payload.responses.safety_flags.knee == null) return null
  if (!isNonEmptyObject(payload.responses.modules.knee)) {
    return <SafetyDataUnavailableNotice label="무릎(KNEE)" />
  }

  const state = toKneeStateFromDoctorPayload(payload.responses, payload.flags.general_red)
  const flags = computeKneeFlags(state)
  const locked = kneeSafetyLocked(flags)
  const examCodes = suggestedKneeExamCodes(flags, payload.responses.modules.knee)

  return (
    <div className={`doctor__lbpSafety doctor__lbpSafety--${flags.knee_safety_status.toLowerCase()}`}>
      <span className="doctor__safetyGlance__title">안전 확인 — 무릎(KNEE)</span>
      <div className="doctor__safetyGlance__items">
        <span className="doctor__safetyChip">
          <strong>안전 확인</strong> {KNEE_SAFETY_STATUS_LABEL[flags.knee_safety_status]}
        </span>
        <span className="doctor__safetyChip">
          <strong>신속 의뢰 고려</strong> {flags.expedited_referral_consider ? '예' : '아니요'}
        </span>
        <span className="doctor__safetyChip">
          <strong>골절·영상 평가 고려</strong> {flags.fracture_imaging_consider ? '예' : '아니요'}
        </span>
        <span className="doctor__safetyChip">
          <strong>DVT 평가 필요</strong> {flags.dvt_assessment_required ? '예' : '아니요'}
        </span>
      </div>
      {flags.dvt_assessment_required && (
        <p className="doctor__derivedNote">
          DVT 가능성을 확정한 것이 아니라 clinician-side 평가/Wells 확인이 필요합니다.
        </p>
      )}
      {locked && (
        <p className="doctor__derivedNote">
          안전 확인 전까지 일상적인 운동/도수치료 추천은 잠깁니다 — 아래 추가 권장 검사를 우선하세요.
        </p>
      )}
      {examCodes.length > 0 && (
        <div className="doctor__lbpExam">
          <span className="doctor__safetyGlance__title">추가 권장 검사</span>
          <ul>
            {examCodes.map((c) => (
              <li key={c}>{KNEE_EXAM_LABELS[c] ?? c}</li>
            ))}
          </ul>
        </div>
      )}
      {/* TODO(KNEE_V2): exercise_recommender_contract는 LBP_V1/NECK_V1/SHOULDER_V1과
          동일한 이유로 v1 범위에서 제외 -- fail-closed lock만 구현(§13). */}
    </div>
  )
}

const ELBOW_SAFETY_STATUS_LABEL: Record<ElbowComputedFields['elbow_safety_status'], string> = {
  CLEAR: '안전',
  REVIEW_REQUIRED: '확인 필요',
  URGENT_REVIEW: '긴급 확인 필요',
}

const ELBOW_EXAM_LABELS: Record<string, string> = {
  ELBOW_AROM_PROM_FLEXION_EXTENSION: '능동/수동 관절가동범위 검사(굴곡-신전)',
  FOREARM_PRONATION_SUPINATION: '전완 회내/회외 검사',
  TARGET_FUNCTION_REPRODUCTION: '목표 기능 재현 검사',
  GRIP_FUNCTIONAL_LOAD: '악력/기능적 부하 검사',
  DEFORMITY_BONY_TENDERNESS: '변형·골압통 확인',
  DISTAL_NEUROVASCULAR_EXAM: '원위부 신경혈관 검사',
  RADIOGRAPH_INDICATION_REVIEW: '방사선 촬영 필요성 검토',
  HOOK_TEST: 'Hook test',
  RESISTED_SUPINATION_FLEXION: '저항 회외/굴곡 검사',
  TENDON_CONTOUR_GAP: '건 윤곽/결손 촉진',
  ACTIVE_EXTENSION_AGAINST_RESISTANCE: '저항 능동 신전 검사',
  EXTENSOR_LAG_PALPABLE_DEFECT: 'Extensor lag/촉지 가능한 결손 확인',
  TRUE_MECHANICAL_BLOCK_VS_PAIN_LIMITED_ROM: '실제 기계적 차단 vs 통증성 ROM 제한 감별',
  EFFUSION_ASSESSMENT: '삼출(effusion) 평가',
  ULNAR_SENSORY_DISTRIBUTION: '척골신경 감각분포 검사',
  INTRINSIC_HAND_STRENGTH_COORDINATION: '수내재근 근력/협조 검사',
}

/**
 * Fable Integration Plan §5.4 Suggested Exam -- minimal mechanical mapping
 * only, CLOSED 문서(§8)가 직접 연결한 경우만 추천한다(KNEE/SHOULDER의
 * suggested*ExamCodes와 동일한 성격 -- 정확한 트리거는 구현 시점에 확정해도
 * 되는 non-clinical 세부). ELBOW_11(심장 연관통)은 clinician physical exam
 * 항목이 아니라 응급 의뢰 신호이므로 여기 추천 목록에 넣지 않는다.
 */
function suggestedElbowExamCodes(
  flags: ElbowComputedFields,
  elbow: DoctorPayload['responses']['modules']['elbow'],
): string[] {
  const codes: string[] = []
  if (flags.elbow_safety_status === 'CLEAR') {
    codes.push('ELBOW_AROM_PROM_FLEXION_EXTENSION', 'FOREARM_PRONATION_SUPINATION', 'TARGET_FUNCTION_REPRODUCTION', 'GRIP_FUNCTIONAL_LOAD')
  }

  const deformityNvConcern =
    (Array.isArray(elbow.deformity_neurovascular_screen) &&
      elbow.deformity_neurovascular_screen.some(
        (v) => v === 'GROSS_DEFORMITY_OR_STILL_OUT' || v === 'COLD_PALE_BLUE_HAND' || v === 'MAJOR_NEW_DISTAL_NEURO_CHANGE',
      )) ||
    elbow.spontaneously_reduced_dislocation_screen === 'YES'
  if (deformityNvConcern) {
    codes.push('DEFORMITY_BONY_TENDERNESS', 'DISTAL_NEUROVASCULAR_EXAM')
  }

  if (flags.fracture_imaging_consider) {
    codes.push('RADIOGRAPH_INDICATION_REVIEW')
  }

  if (elbow.distal_biceps_concern === 'YES' || elbow.distal_biceps_concern === 'UNKNOWN') {
    codes.push('HOOK_TEST', 'RESISTED_SUPINATION_FLEXION', 'TENDON_CONTOUR_GAP')
  }

  if (elbow.distal_triceps_concern === 'YES' || elbow.distal_triceps_concern === 'UNKNOWN') {
    codes.push('ACTIVE_EXTENSION_AGAINST_RESISTANCE', 'EXTENSOR_LAG_PALPABLE_DEFECT')
  }

  if (elbow.true_locked_rom_block === 'YES' || elbow.true_locked_rom_block === 'UNKNOWN') {
    codes.push('TRUE_MECHANICAL_BLOCK_VS_PAIN_LIMITED_ROM', 'EFFUSION_ASSESSMENT')
  }

  if (flags.neuro_assessment_required) {
    codes.push('ULNAR_SENSORY_DISTRIBUTION', 'INTRINSIC_HAND_STRENGTH_COORDINATION')
  }

  return [...new Set(codes)]
}

/**
 * ELBOW_V1 안전 확인 패널. KneeSafetyPanel과 동일한 원칙 -- 인터럽트하지
 * 않는다(URGENT_REVIEW 값만 STAFF_CHECK_TRIGGERS로 별도 인터럽트,
 * coreSpec.ts 참고). ELBOW_V1은 다른 모듈 재사용이 없으므로 게이트는 단순히
 * `safety_flags.elbow !== null`이다 -- WRIST_HAND-only 환자는 ELBOW_01-15를
 * 본 적이 없어 이 값이 항상 null이므로, 이 패널이 그 환자에게 렌더되지
 * 않는 것이 정확한 동작이다(F1류 게이트가 아니라 진짜 "이 모듈이 이
 * 환자에게 적용되지 않음"이다 -- LBP/NECK/SHOULDER의 primary-tag-vs-
 * population 어긋남 문제와는 다른 종류).
 *
 * 이번 iteration에서는 clinician-entered objective field가 필요 없다(Fable
 * plan §3.2/§5.6) -- Wells류의 persistence schema가 아직 CLOSED되지
 * 않았으므로 JudgmentPanel에 새 필드를 추가하지 않는다.
 */
export function ElbowSafetyPanel({ payload }: { payload: DoctorPayload }) {
  // 무관함(null)과 계산 불가(applicable하지만 손상)를 분리 -- 5차 독립
  // 리뷰 HIGH-2, LbpSafetyPanel/NeckSafetyPanel과 동일한 원칙.
  if (payload.responses.safety_flags.elbow == null) return null
  if (!isNonEmptyObject(payload.responses.modules.elbow)) {
    return <SafetyDataUnavailableNotice label="팔꿈치(ELBOW)" />
  }

  const state = toElbowStateFromDoctorPayload(payload.responses, payload.flags.general_red)
  const flags = computeElbowFlags(state)
  const locked = elbowSafetyLocked(flags)
  const examCodes = suggestedElbowExamCodes(flags, payload.responses.modules.elbow)

  return (
    <div className={`doctor__lbpSafety doctor__lbpSafety--${flags.elbow_safety_status.toLowerCase()}`}>
      <span className="doctor__safetyGlance__title">안전 확인 — 팔꿈치(ELBOW)</span>
      <div className="doctor__safetyGlance__items">
        <span className="doctor__safetyChip">
          <strong>안전 확인</strong> {ELBOW_SAFETY_STATUS_LABEL[flags.elbow_safety_status]}
        </span>
        <span className="doctor__safetyChip">
          <strong>신속 의뢰 고려</strong> {flags.expedited_referral_consider ? '예' : '아니요'}
        </span>
        <span className="doctor__safetyChip">
          <strong>골절·영상 평가 고려</strong> {flags.fracture_imaging_consider ? '예' : '아니요'}
        </span>
        <span className="doctor__safetyChip">
          <strong>신경학적 평가 필요</strong> {flags.neuro_assessment_required ? '예' : '아니요'}
        </span>
        <span className="doctor__safetyChip">
          <strong>감염 평가 필요</strong> {flags.infection_assessment_required ? '예' : '아니요'}
        </span>
      </div>
      {locked && (
        <p className="doctor__derivedNote">
          안전 확인 전까지 일상적인 운동/도수치료 추천은 잠깁니다 — 아래 추가 권장 검사를 우선하세요.
        </p>
      )}
      {examCodes.length > 0 && (
        <div className="doctor__lbpExam">
          <span className="doctor__safetyGlance__title">추가 권장 검사</span>
          <ul>
            {examCodes.map((c) => (
              <li key={c}>{ELBOW_EXAM_LABELS[c] ?? c}</li>
            ))}
          </ul>
        </div>
      )}
      {/* TODO(ELBOW_V2): exercise_recommender_contract는 LBP_V1/NECK_V1/SHOULDER_V1/KNEE_V1과
          동일한 이유로 v1 범위에서 제외 -- fail-closed lock만 구현(§12). */}
    </div>
  )
}

const WRIST_HAND_SAFETY_STATUS_LABEL: Record<WristHandComputedFields['wrist_hand_safety_status'], string> = {
  CLEAR: '안전',
  REVIEW_REQUIRED: '확인 필요',
  URGENT_REVIEW: '긴급 확인 필요',
}

const WRIST_HAND_EXAM_LABELS: Record<string, string> = {
  WRIST_HAND_AROM_PROM: '손목/손가락 능동·수동 관절가동범위 검사',
  GRIP_PINCH_FUNCTIONAL: '악력/집는 힘 기능 평가',
  DEFORMITY_BONY_TENDERNESS: '변형·골압통 확인',
  DISTAL_NEUROVASCULAR_EXAM: '원위부 신경혈관 검사',
  RADIOGRAPH_INDICATION_REVIEW: '방사선 촬영 필요성 검토',
  SCAPHOID_SNUFFBOX_TENDERNESS: '주상골/스너프박스 압통 평가',
  FLEXOR_EXTENSOR_TENDON_INTEGRITY: '굴곡/신전건 기능 검사',
  WOUND_ERYTHEMA_SPREAD_ASSESSMENT: '상처/발적 확산 평가',
  FLEXOR_SHEATH_PALPATION: 'Flexor sheath(굴건막) 촉진',
  MEDIAN_ULNAR_SENSORY_DISTRIBUTION: '정중/척골신경 감각분포 검사',
  THENAR_INTRINSIC_STRENGTH: '무지대립근/수내재근 근력 검사',
}

const WRIST_HAND_XRAY_CONTEXT_LABEL: Record<string, string> = {
  NOT_DONE: '아직 X-ray를 찍지 않음(환자 보고)',
  DONE_TOLD_NORMAL: 'X-ray 촬영, 정상이라고 들었음(환자 보고)',
  DONE_TOLD_ABNORMAL: 'X-ray 촬영, 이상이 있다고 들었음(환자 보고)',
  DONE_RESULT_UNKNOWN: 'X-ray 촬영, 결과를 모름(환자 보고)',
  UNKNOWN: 'X-ray 여부 잘 모르겠다고 답변(환자 보고)',
}

/**
 * Fable Integration Plan §11 Suggested Exam -- minimal mechanical mapping
 * only, CLOSED 문서가 직접 연결한 경우만 추천한다(ELBOW/KNEE/SHOULDER의
 * suggested*ExamCodes와 동일한 성격 -- 정확한 트리거는 구현 시점에 확정해도
 * 되는 non-clinical 세부).
 */
function suggestedWristHandExamCodes(
  flags: WristHandComputedFields,
  wristHand: DoctorPayload['responses']['modules']['wrist_hand'],
): string[] {
  const codes: string[] = []
  if (flags.wrist_hand_safety_status === 'CLEAR') {
    codes.push('WRIST_HAND_AROM_PROM', 'GRIP_PINCH_FUNCTIONAL')
  }

  const deformityNvConcern =
    Array.isArray(wristHand.deformity_neurovascular_open_injury_screen) &&
    wristHand.deformity_neurovascular_open_injury_screen.some(
      (v) =>
        v === 'GROSS_DEFORMITY_OR_STILL_OUT' ||
        v === 'COLD_PALE_BLUE_DIGITS' ||
        v === 'MAJOR_NEW_DISTAL_NEURO_CHANGE' ||
        v === 'UNCONTROLLED_HEAVY_BLEEDING' ||
        v === 'SEVERE_OPEN_WOUND_WITH_DEEP_EXPOSURE',
    )
  if (deformityNvConcern) {
    codes.push('DEFORMITY_BONY_TENDERNESS', 'DISTAL_NEUROVASCULAR_EXAM')
  }

  if (flags.fracture_imaging_consider) {
    codes.push('RADIOGRAPH_INDICATION_REVIEW', 'SCAPHOID_SNUFFBOX_TENDERNESS')
  }

  if (flags.tendon_injury_assessment_required) {
    codes.push('FLEXOR_EXTENSOR_TENDON_INTEGRITY')
  }

  if (flags.infection_assessment_required) {
    codes.push('WOUND_ERYTHEMA_SPREAD_ASSESSMENT', 'FLEXOR_SHEATH_PALPATION')
  }

  if (flags.neuro_assessment_required) {
    codes.push('MEDIAN_ULNAR_SENSORY_DISTRIBUTION', 'THENAR_INTRINSIC_STRENGTH')
  }

  return [...new Set(codes)]
}

/**
 * WRIST_HAND_V1 안전 확인 패널. ElbowSafetyPanel과 동일한 원칙 -- 인터럽트하지
 * 않는다(URGENT_REVIEW 값만 STAFF_CHECK_TRIGGERS로 별도 인터럽트,
 * coreSpec.ts 참고). 게이트는 `safety_flags.wrist_hand !== null`이다 --
 * ELBOW-only 환자는 WH_01-14를 본 적이 없어 이 값이 항상 null이므로, 이
 * 패널이 그 환자에게 렌더되지 않는 것이 정확한 동작이다. FOREARM 환자는
 * ElbowSafetyPanel과 이 패널이 둘 다 렌더된다(의도된 overlap, Fable plan
 * §11).
 *
 * `region_discriminator`(ELBOW_00)는 `modules.elbow`에서만 읽는다 --
 * `modules.wrist_hand`에 중복 저장하지 않는다(같은 공유 router 값이므로).
 *
 * WH_04A(X-ray 이력)는 참고 정보로만 표시하고, 안전 판정에 영향을 주지
 * 않는다는 문구를 항상 함께 노출한다(Tablet §3/Fable plan §9 -- adapter가
 * 이 필드를 아예 읽지 않으므로 이 UI 문구는 실제 계산과 구조적으로
 * 일치한다).
 *
 * stable sensory-only(WH_08 concrete + WH_08A=[NONE])는 별도 UI 없이
 * neuro_assessment_required/expedited_referral_consider가 false인 정상
 * 결과로만 나타난다.
 *
 * 이번 iteration에서는 clinician-entered objective field가 필요 없다
 * (Fable plan §3.3) -- JudgmentPanel에 새 필드를 추가하지 않는다.
 */
export function WristHandSafetyPanel({ payload }: { payload: DoctorPayload }) {
  // 무관함(null)과 계산 불가(applicable하지만 손상)를 분리 -- 5차 독립
  // 리뷰 HIGH-2, LbpSafetyPanel/NeckSafetyPanel과 동일한 원칙.
  if (payload.responses.safety_flags.wrist_hand == null) return null
  if (!isNonEmptyObject(payload.responses.modules.wrist_hand)) {
    return <SafetyDataUnavailableNotice label="손목/손(WRIST/HAND)" />
  }

  const state = toWristHandStateFromDoctorPayload(payload.responses, payload.flags.general_red)
  const flags = computeWristHandFlags(state)
  const locked = wristHandSafetyLocked(flags)
  const wristHand = payload.responses.modules.wrist_hand
  const examCodes = suggestedWristHandExamCodes(flags, wristHand)
  const xrayContext = typeof wristHand.prior_xray_context === 'string' ? wristHand.prior_xray_context : null

  return (
    <div className={`doctor__lbpSafety doctor__lbpSafety--${flags.wrist_hand_safety_status.toLowerCase()}`}>
      <span className="doctor__safetyGlance__title">안전 확인 — 손목/손(WRIST/HAND)</span>
      <div className="doctor__safetyGlance__items">
        <span className="doctor__safetyChip">
          <strong>안전 확인</strong> {WRIST_HAND_SAFETY_STATUS_LABEL[flags.wrist_hand_safety_status]}
        </span>
        <span className="doctor__safetyChip">
          <strong>신속 의뢰 고려</strong> {flags.expedited_referral_consider ? '예' : '아니요'}
        </span>
        <span className="doctor__safetyChip">
          <strong>골절·영상 평가 고려</strong> {flags.fracture_imaging_consider ? '예' : '아니요'}
        </span>
        <span className="doctor__safetyChip">
          <strong>힘줄 손상 평가 필요</strong> {flags.tendon_injury_assessment_required ? '예' : '아니요'}
        </span>
        <span className="doctor__safetyChip">
          <strong>감염 평가 필요</strong> {flags.infection_assessment_required ? '예' : '아니요'}
        </span>
        <span className="doctor__safetyChip">
          <strong>신경학적 평가 필요</strong> {flags.neuro_assessment_required ? '예' : '아니요'}
        </span>
      </div>
      {locked && (
        <p className="doctor__derivedNote">
          안전 확인 전까지 일상적인 운동/도수치료 추천은 잠깁니다 — 아래 추가 권장 검사를 우선하세요.
        </p>
      )}
      {xrayContext && (
        <p className="doctor__derivedNote">
          {WRIST_HAND_XRAY_CONTEXT_LABEL[xrayContext] ?? xrayContext} — 안전 판정에는 영향을 주지 않는 환자 보고 정보입니다.
        </p>
      )}
      {examCodes.length > 0 && (
        <div className="doctor__lbpExam">
          <span className="doctor__safetyGlance__title">추가 권장 검사</span>
          <ul>
            {examCodes.map((c) => (
              <li key={c}>{WRIST_HAND_EXAM_LABELS[c] ?? c}</li>
            ))}
          </ul>
        </div>
      )}
      {/* TODO(WRIST_HAND_V2): exercise_recommender_contract는 LBP_V1/NECK_V1/SHOULDER_V1/KNEE_V1/
          ELBOW_V1과 동일한 이유로 v1 범위에서 제외 -- fail-closed lock만 구현. */}
    </div>
  )
}

/** 동반문제 카테고리(sleep/digestion/...) -> 짧은 화면 응답을 어디서 읽을지. */
const SECONDARY_MODULE_VALUE: Record<string, (sm: Responses['secondary_modules']) => AnswerValue> = {
  sleep: (sm) => sm.sleep?.problems ?? null,
  digestion: (sm) => sm.gi?.problems ?? null,
  bowel: (sm) => sm.bowel?.problems ?? null,
  pain: (sm) => sm.pain?.locations ?? null,
  urinary: (sm) => sm.urinary?.problems ?? null,
  fatigue: (sm) => sm.fatigue?.patterns ?? null,
  stress: (sm) => sm.stress?.problems ?? null,
  women: (sm) => sm.women?.problems ?? null,
  weight: (sm) => sm.weight?.goal ?? null,
}

function secondaryModuleFields(r: Responses) {
  const keys = asArray<string>(r.secondary_concerns.secondary_concerns)
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
    const keys = asArray<string>(r.secondary_concerns.secondary_concerns).filter(
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
  return asArray<string>(routing.reference_symptoms).filter((k) => k !== 'none')
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
  const ms = sleep?.menopause
  if (!ms) return null
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
export function primaryModuleFields(
  primaryModule: string | null,
  m: Responses['modules'],
  primaryModuleDetail: string | null = null,
) {
  switch (primaryModule) {
    case 'Sleep': {
      if (!m.sleep) return []
      const ms = m.sleep.menopause
      return [
        { qid: 'SLEEP_01', value: m.sleep.problems },
        { qid: 'SLEEP_02', value: m.sleep.frequency_per_week },
        { qid: 'SLEEP_03', value: m.sleep.awakening_reasons },
        ...(ms
          ? [
              { qid: 'MS_GATE_01', value: ms.gate_context },
              { qid: 'MS_01', value: ms.stage },
              { qid: 'MS_02', value: ms.night_vms_frequency },
              { qid: 'MS_03', value: ms.rumination_frequency },
              { qid: 'MS_04', value: ms.total_sleep_time },
              { qid: 'MS_05', value: ms.sleep_disorder_screen },
              { qid: 'MS_06', value: ms.awakenings },
              { qid: 'MS_07', value: ms.return_to_sleep },
            ]
          : []),
      ]
    }
    case 'GI': {
      if (!m.gi) return []
      return [
        { qid: 'GI_01', value: m.gi.problems },
        { qid: 'GI_02', value: m.gi.meal_relation },
        { qid: 'GI_03', value: m.gi.unable_to_eat_or_drink },
      ]
    }
    case 'Bowel': {
      if (!m.bowel) return []
      return [
        { qid: 'BOWEL_01', value: m.bowel.problems },
        { qid: 'BOWEL_02', value: m.bowel.frequency },
        { qid: 'BOWEL_03', value: m.bowel.blood_or_black_stool },
        { qid: 'BOWEL_04', value: m.bowel.straining },
      ]
    }
    case 'Urinary': {
      if (!m.urinary) return []
      return [
        { qid: 'URINARY_01', value: m.urinary.problems },
        { qid: 'URINARY_02', value: m.urinary.burden_frequency },
        { qid: 'URINARY_03', value: m.urinary.nocturia_count },
        { qid: 'URINARY_04', value: m.urinary.leakage_pattern },
      ]
    }
    case 'Pain': {
      if (!m.pain) return []
      return [
        { qid: 'PAIN_01', value: m.pain.primary_location },
        { qid: 'PAIN_02', value: m.pain.pain_qualities },
        { qid: 'PAIN_04', value: m.pain.radiation },
        ...(primaryModuleDetail === 'LBP' && m.lbp
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
        ...(m.pain.primary_location === 'low_back_pelvis' && m.hip
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
        ...(m.pain.primary_location === 'neck_shoulder' && m.neck
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
        ...(m.pain.primary_location === 'neck_shoulder' && m.shoulder
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
        ...(m.pain.primary_location === 'knee' && m.knee
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
        ...(m.pain.primary_location === 'arm_hand' && m.elbow
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
        ...(m.pain.primary_location === 'arm_hand' && m.wrist_hand
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
        ...(m.pain.primary_location === 'head_face_jaw' && m.tmj
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
    }
    case 'Fatigue': {
      if (!m.fatigue) return []
      return [
        { qid: 'FATIGUE_01', value: m.fatigue.patterns },
        { qid: 'FATIGUE_02', value: m.fatigue.worst_time },
        { qid: 'FATIGUE_03', value: m.fatigue.recovery_after_rest },
      ]
    }
    case 'Stress': {
      if (!m.stress) return []
      return [
        { qid: 'STRESS_01', value: m.stress.problems },
        { qid: 'STRESS_03', value: m.stress.associated_symptoms },
      ]
    }
    case 'Women': {
      if (!m.women) return []
      return [
        { qid: 'WOMEN_01', value: m.women.problems },
        { qid: 'WOMEN_02', value: m.women.menstrual_status },
        { qid: 'WOMEN_03', value: m.women.menopause_symptoms },
      ]
    }
    case 'Pregnancy': {
      if (!m.pregnancy) return []
      return [
        { qid: 'PREGNANCY_01', value: m.pregnancy.status },
        { qid: 'PREGNANCY_02', value: m.pregnancy.trimester },
        { qid: 'PREGNANCY_03', value: m.pregnancy.concerns },
      ]
    }
    case 'Postpartum': {
      if (!m.postpartum) return []
      return [
        { qid: 'POSTPARTUM_01', value: m.postpartum.time_since_delivery },
        { qid: 'POSTPARTUM_02', value: m.postpartum.problems },
        { qid: 'POSTPARTUM_03', value: m.postpartum.breastfeeding_status },
      ]
    }
    case 'Weight': {
      if (!m.weight) return []
      return [
        { qid: 'WEIGHT_01', value: m.weight.goal },
        { qid: 'WEIGHT_02', value: m.weight.contributing_factors },
        { qid: 'WEIGHT_03', value: m.weight.recent_weight_change },
        { qid: 'WEIGHT_04', value: m.weight.previous_attempts },
      ]
    }
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

// malformed/legacy submission resilience 배치: `recordToPayload`가 위에서
// `as DoctorPayload[...]`로 그냥 타입만 씌운 값은 실제로는 null/누락일 수
// 있다 -- `routing: null`(하위호환 저장 경로, server/index.js의
// `routing: body.routing ?? null` 참고)이나 손으로 만든/손상된
// `responses` 하나만 있어도, 이 파일의 수십 곳(`deriveViewProfile`,
// `primaryConcernLabel`, 각 부위 SafetyPanel, JudgmentPanel의 props 등)이
// 예외 없이 그 값을 그대로 읽어 렌더링 도중 던진다. 이 값들은 전부
// `buildResponsePayload`/`buildRoutingPayload`/`computeSaju`(coreSpec.ts/
// saju/index.ts) 한 번의 호출로 통째로 만들어지는 atomic한 객체라서, 실제
// 제출 흐름을 거친 레코드는 이 최상위 키들이 전부 있거나 전부 없다 --
// 부분적으로만 있는 경우는 레거시 스키마/손상/수기로 만든 요청뿐이다.
// 그래서 "전부 있는지"만 확인하면 되고(개별 leaf 필드까지 들어가지 않아도
// 됨), 새 임상 프로필/사실을 추론하지 않는다 -- 그냥 "이 레코드로 상세
// 화면을 안전하게 그릴 수 있는가"만 판단한다.
const REQUIRED_RESPONSE_KEYS = [
  'patient',
  'visit_goal',
  'primary_concern',
  'additional_detail_concern',
  'reference_symptoms',
  'secondary_concerns',
  'safety_flags',
  'modules',
  'secondary_modules',
  'constitution_basics',
  'medication',
  'medical_history',
  'allergy',
  'surgery_history',
  'reproductive_status',
  'recent_tests',
  'birth_info',
  'free_text',
] as const

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isDoctorPayloadShapeUsable(payload: DoctorPayload): boolean {
  if (!isPlainObject(payload.routing)) return false
  if (!isPlainObject(payload.flags)) return false
  const saju = payload.myungri_calculation as unknown
  if (!isPlainObject(saju)) return false
  if (!isPlainObject(saju.policy) || !isPlainObject(saju.engine) || !isPlainObject(saju.flags)) return false
  if (typeof saju.status !== 'string') return false
  const r = payload.responses as unknown
  if (!isPlainObject(r)) return false
  return REQUIRED_RESPONSE_KEYS.every((key) => isPlainObject(r[key]))
}

/**
 * 상세 임상 화면을 안전하게 그릴 수 없을 때(구조 검사 실패, 또는
 * `DoctorRecordErrorBoundary`가 예상 못한 예외를 잡았을 때) 보여주는 중립
 * fallback -- 실제로 확인된 값(환자 라벨/제출 시각/상태)만 그대로 보여주고,
 * 어떤 임상 프로필·판단도 추정해서 채우지 않는다. 목록으로 돌아가는
 * 버튼은 이 컴포넌트 밖(항상 렌더링되는 헤더)에 이미 있다. CRM/투약 코스
 * 섹션은 아래에서 patient_id만으로 이 컴포넌트가 직접 렌더링한다 --
 * 정상 경로(payloadShapeOk===true)의 원래 렌더 위치는 이 fallback이 보일
 * 때는 애초에 마운트되지 않으므로, 여기서 만들지 않으면 이 fallback이
 * 스스로 약속하는 "CRM 섹션은 계속 쓸 수 있다"가 거짓이 된다.
 */
export function DoctorRecordFallback({ record }: { record: SubmissionRecord | null | undefined }) {
  return (
    <div>
      <div className="doctor__banner doctor__banner--warning" role="alert">
        <strong>이 기록의 상세 임상 화면을 표시할 수 없습니다</strong>
        <p>
          제출 자료가 불완전하거나 예상한 형식과 다릅니다(레거시 형식이거나
          손상된 제출로 보입니다). 임상 프로필이나 판단을 추정해서 보여주지
          않습니다 — 아래 알려진 정보만 확인할 수 있습니다.
        </p>
        {record && (
          <ul>
            {record.patient_label && <li>환자: {record.patient_label}</li>}
            <li>제출 시각: {new Date(record.created_at).toLocaleString('ko-KR')}</li>
            <li>상태: {record.status}</li>
          </ul>
        )}
        <p>
          아래 CRM/투약 코스 섹션은 이 기록과 무관하게 계속 사용할 수
          있습니다. 상단의 &ldquo;목록으로&rdquo;를 눌러 다른 제출건을 선택할
          수도 있습니다.
        </p>
      </div>
      {/*
        malformed/legacy submission resilience 배치: patient_id만 있으면
        되는(payload/routing/responses와 무관한) 안전한 기능이라 이 fallback
        에서 독립적으로 렌더링한다 -- 정상 경로(아래 tab 콘텐츠 안,
        payloadShapeOk===true일 때만 마운트됨)의 렌더와는 서로 배타적이라
        동시에 두 인스턴스가 뜨지 않는다. CRM/투약 코스 추적을 이 기록의
        구조 문제 때문에 완전히 막을 이유가 없다.
      */}
      {record?.patient_id && <MedicationCourseSection key={record.patient_id} patientUuid={record.patient_id} />}
    </div>
  )
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
/*
 * Round 13: preview/QA controls do not belong on a real clinical screen.
 * The fixture picker, the SYNTHETIC scenario picker and the data-source
 * switch are development and QA affordances -- in a clinic they are noise
 * competing with the record, and worse, they invite a clinician to
 * accidentally leave the real submission list.
 *
 * They are gated on the repo's existing preview-context convention
 * (`import.meta.env.DEV || VITE_PREVIEW_MODE === 'true'`, the same test
 * PatientCompleteScreen already uses), so they stay fully available where
 * QA needs them -- the dev server and the deployed PR preview -- and
 * disappear from a production clinic build.
 *
 * `initialFixtureIndex` is also treated as a preview signal: it is only
 * ever passed by the fixture-rendering test harness, and honouring it
 * keeps those suites exercising the same component the clinic runs.
 */
function isDoctorPreviewContext(): boolean {
  const env = (import.meta as { env?: Record<string, unknown> }).env ?? {}
  return env.DEV === true || env.VITE_PREVIEW_MODE === 'true'
}

export function DoctorView({ initialFixtureIndex }: { initialFixtureIndex?: number } = {}) {
  useEffect(() => {
    document.documentElement.classList.add('doctor-mode')
    return () => document.documentElement.classList.remove('doctor-mode')
  }, [])

  // A clinic build has no data-source switch, so it must start on the real
  // submission list rather than stranding the clinician in fixture data.
  const showPreviewControls = isDoctorPreviewContext() || initialFixtureIndex !== undefined
  const [mode, setMode] = useState<'fixtures' | 'server'>(showPreviewControls ? 'fixtures' : 'server')
  const [fixtureIndex, setFixtureIndex] = useState(initialFixtureIndex ?? 0)
  // PR #24 Phase 12: SYNTHETIC/NO-PHI Doctor Workspace scenarios (with
  // illustrative exam-suggestion/pattern-candidate/evidence/observation
  // data attached) -- opt-in only, default '' means "off, use the plain
  // fixture above with no synthetic decision-support data" so production
  // rendering behavior (no `synthetic` passed to DoctorWorkspace) is
  // unaffected unless a reviewer explicitly picks one.
  const [workspaceScenarioId, setWorkspaceScenarioId] = useState('')

  const [submissions, setSubmissions] = useState<SubmissionSummary[]>([])
  const [serverError, setServerError] = useState<{ message: string; kind: 'auth' | 'network' | 'other' } | null>(
    null,
  )
  const [listLoading, setListLoading] = useState(true)
  const [retryNonce, setRetryNonce] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedRecord, setSelectedRecord] = useState<SubmissionRecord | null>(null)
  // Round 3 Phase C(longitudinal linkage). Fetched from the same exact
  // patient_id this submission's own record carries -- never derived from
  // name/phone/DOB. Reset to null on every selection change so a slow
  // network response for a previous patient can never be misattributed to
  // the one now on screen (guarded below by the `cancelled` flag too).
  const [priorVisits, setPriorVisits] = useState<PatientHistoryResult | null>(null)
  // Round 3 Phase D(micro follow-up). This visit's own short check-in
  // response, if one was ever saved for it -- either through a doctor/
  // staff session, or (since round 4) submitted directly by the patient's
  // own device via the one-time `#follow-up=<token>` link (see
  // microFollowUp.ts's doc comment for the two separate write paths).
  const [microFollowUpResponse, setMicroFollowUpResponse] = useState<MicroFollowUpResponse | null>(null)
  // Round 3(revisit linkage): Doctor Queue for no-submission revisit
  // visits, polled alongside `submissions` but kept in a SEPARATE list --
  // never merged into listSubmissions()'s own contract (see server/store.js's
  // listRevisitQueue doc comment). Selecting a revisit row is mutually
  // exclusive with selecting a submission row (see the two onClick handlers
  // below, each clears the other's selection).
  const [revisits, setRevisits] = useState<RevisitQueueItem[]>([])
  // CRM v0.3.1 round 13: Today Queue. `crmTasks === null` means "no
  // currently-valid fetch to show" (initial load, or a failed refetch that
  // was explicitly cleared) -- deliberately stricter than the revisits
  // polling above, which leaves stale data in place on a failed poll. A
  // stale CRM queue must never masquerade as the current authoritative
  // queue after a refresh/error/disconnect.
  const [crmTasks, setCrmTasks] = useState<CrmTask[] | null>(null)
  const [crmTasksLoading, setCrmTasksLoading] = useState(false)
  const [crmTasksError, setCrmTasksError] = useState<string | null>(null)
  // CRM v0.3.1 round 14: Sigma identity enrichment (display-only name +
  // chart number) for the Today Queue, keyed by patient_uuid. Empty object
  // is the safe default -- TodayQueueSection falls back to the truncated
  // UUID for any patient_uuid missing from this map, so an empty/cleared
  // map is never mistaken for "resolved to nothing."
  const [patientIdentities, setPatientIdentities] = useState<Record<string, ResolvedPatientIdentity>>({})
  // Independent-review finding (#4): a slower, already-in-flight poll's
  // identity fetch could resolve AFTER a newer optimistic update from
  // onIdentityLinked below and clobber it back to the pre-link state.
  // Bumped synchronously by onIdentityLinked; a poll only applies its
  // identity result if nothing bumped this between issuing the fetch and
  // it resolving -- otherwise it's discarded and the next poll (POLL_MS
  // later) picks up the current, now-consistent state instead.
  const patientIdentitiesSeqRef = useRef(0)
  const [selectedRevisit, setSelectedRevisit] = useState<{ visitId: string; patientId: string } | null>(null)
  // Round 6 review fix (duplicate-start prevention): disables "재진 간단
  // 문진 시작" while a request is in flight, so a double-click/impatient
  // re-click can't fire two overlapping requests from the UI side. The
  // server also now dedupes a rapid repeat call itself (server/store.js's
  // startRevisit), so this is defense in depth, not the only guard.
  const [startRevisitPending, setStartRevisitPending] = useState(false)
  // Round 8 (delivery-channel-agnostic Micro Follow-up): how staff intends
  // this session's link to reach the patient. CLINIC_TABLET is the default
  // because it is the elderly-friendly in-clinic path the clinic actually
  // runs on -- QR is the smartphone-capable fallback, not the primary.
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>('CLINIC_TABLET')
  const [stations, setStations] = useState<StationInfo[]>([])
  const [selectedStationId, setSelectedStationId] = useState<string>('')
  /*
   * Round 11 (Doctor Preview v2 -- 10-second clinical view): the record
   * used to render as ONE long vertical page -- clinical workspace, then
   * the whole questionnaire transcript, then meds/history, then Myungri,
   * then the recorder/EMR block, then the legacy judgment form, then the
   * raw JSON payload. Everything the clinician needed in the first ten
   * seconds was buried in an archive.
   *
   * The record is now three surfaces. `진료` is the default and holds
   * ONLY the clinical action flow. `자료` holds the reference material --
   * still complete, still editable, just not in the way. `명리` is fully
   * separated from the clinical workspace, per the standing rule that it
   * must never sit inside it.
   *
   * Nothing here deletes stored data: every block that moved is reachable
   * in one click, and the underlying record/persistence is untouched.
   *
   * Inactive surfaces stay MOUNTED behind `hidden` rather than being
   * unmounted. Two reasons, and the first is the one that matters:
   * a half-typed EMR summary or judgment entry must survive a glance at
   * another surface and back. The second is that `hidden` already achieves
   * what this round is actually asked for -- the default view's *visible*
   * information and scroll length -- so unmounting would buy nothing while
   * costing state. Tests that assert on rendered markup therefore keep
   * covering the whole record; the browser QA measures what is visible.
   */
  const [recordTab, setRecordTab] = useState<'clinical' | 'reference' | 'myungri'>('clinical')
  function openRecordTab(tab: 'clinical' | 'reference' | 'myungri') {
    setRecordTab(tab)
  }
  // Opening a different record always starts back on the clinical surface --
  // otherwise patient B would silently inherit patient A's "I was reading
  // the archive" position.
  useEffect(() => {
    setRecordTab('clinical')
  }, [selectedId, workspaceScenarioId, mode])
  // Round 9: a busy tablet cannot be assigned (the server refuses it with
  // 409 station_busy), so it must not be the default selection either.
  const selectedStationBusy = stations.some((st) => st.stationId === selectedStationId && Boolean(st.assignment))
  const [assignPending, setAssignPending] = useState(false)
  const [assignedStationName, setAssignedStationName] = useState<string | null>(null)
  // The one-time station pairing link, held ONLY in memory from the moment
  // registration returns it -- the server never returns this device
  // credential again (only its hash is stored), exactly like the patient
  // capability token.
  const [newStationPairing, setNewStationPairing] = useState<{ name: string; link: string } | null>(null)
  const [newStationName, setNewStationName] = useState('')
  const [stationError, setStationError] = useState<string | null>(null)
  // Local-only: the one-time patient link, held ONLY in this component's
  // memory from the moment "재진 간단 문진 시작"/"재발급" returns it. The
  // server never returns the raw token again after that single response
  // (see serverClient.ts's startRevisit/reissueFollowUpSession doc
  // comments) -- a page reload genuinely loses this, by design.
  const [issuedSession, setIssuedSession] = useState<
    { visitId: string; token: string; expiresAt: string; targetCount: number } | null
  >(null)
  const [revisitActionError, setRevisitActionError] = useState<string | null>(null)
  const [linkCopyStatus, setLinkCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle')
  const viewedRef = useRef<Set<string>>(new Set())
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

  // Round 3(revisit linkage): Doctor Queue polling for no-submission
  // revisit visits, same cadence as the submissions poll above so a
  // WAITING_FOR_PATIENT row flips to COMPLETED without a manual refresh.
  useEffect(() => {
    if (mode !== 'server') return
    let cancelled = false
    async function poll() {
      const result = await listRevisitQueue()
      if (cancelled) return
      if (result.ok) setRevisits(result.data)
      // Round 8: stations poll on the same cadence so an assigned tablet's
      // row reflects reality (assigned / freed) without a manual refresh.
      const stationResult = await listStations()
      if (cancelled) return
      if (stationResult.ok) {
        setStations(stationResult.data)
        setSelectedStationId((current) => current || firstFreeStationId(stationResult.data))
      }
      // CRM v0.3.1 round 13: Today Queue, same polling cadence. Unlike the
      // two polls above, a failed fetch here explicitly clears crmTasks to
      // null (never leaves a stale queue displayed as current) -- see the
      // crmTasks state declaration's comment for why this queue is held to
      // a stricter staleness rule.
      setCrmTasksLoading(true)
      const crmResult = await listCrmTasks()
      if (cancelled) return
      setCrmTasksLoading(false)
      if (crmResult.ok) {
        setCrmTasks(crmResult.data.tasks)
        setCrmTasksError(null)
        // Round 14: identity enrichment is derived from THIS fetch's own
        // task list, never from whatever the previous poll happened to
        // show -- so a task that just left the queue can't keep a stale
        // resolved name attached to a row that no longer exists. Skipped
        // entirely when there are no tasks (nothing to resolve).
        const uuids = [...new Set(crmResult.data.tasks.map((t) => t.patient_uuid))]
        if (uuids.length === 0) {
          setPatientIdentities({})
        } else {
          const seq = patientIdentitiesSeqRef.current
          const identityResult = await listPatientIdentities(uuids)
          if (cancelled) return
          // Replaced wholesale (never merged) on success, and cleared
          // entirely on failure -- a failed identity fetch must never
          // leave a previous poll's resolved name displayed as current,
          // same staleness rule as crmTasks itself. The safe fallback
          // (truncated UUID) is what TodayQueueSection renders for any
          // uuid missing from this map. Skipped if a newer optimistic
          // update (onIdentityLinked) landed while this fetch was in
          // flight -- see patientIdentitiesSeqRef's declaration.
          if (patientIdentitiesSeqRef.current === seq) {
            setPatientIdentities(identityResult.ok ? identityResult.data.identities : {})
          }
        }
      } else {
        setCrmTasks(null)
        setCrmTasksError(crmResult.error)
        setPatientIdentities({})
      }
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
        // Round 18: only mark 'viewed' if the record's server-reported
        // status is still 'new' -- viewedRef alone is per-tab in-memory
        // state, so a SECOND tab opening the same already-viewed submission
        // (e.g. a staff member glancing at a patient a doctor already has
        // open) previously had no way to know that and re-issued the exact
        // same status write anyway. That write is a no-op on `status` but
        // still bumps updated_at (store.js's setStatus), so it was pure
        // unforced version churn -- purely opening a submission a second
        // tab already viewed could spuriously conflict that first tab's
        // next save, with neither tab having edited anything yet.
        if (result.data.status === 'new' && !viewedRef.current.has(selectedId)) {
          viewedRef.current.add(selectedId)
          // This status write bumps the record's updated_at the
          // same as any other save (store.js's setStatus uses the same
          // nextUpdatedAt helper as saveJudgment/saveWorkspace) -- without
          // folding the fresh record back into selectedRecord here,
          // selectedRecord.updated_at stays pinned to the PRE-write value
          // for the rest of this record's lifetime in this tab, and the
          // very first CAS-guarded workspace/judgment save would then
          // always 409 against this component's OWN "mark as viewed"
          // write -- a false conflict with a single clinician in a single
          // tab, caught by real two-browser-context QA.
          setSubmissionStatus(selectedId, 'viewed').then((statusResult) => {
            if (cancelled) return
            if (statusResult.ok) setSelectedRecord(statusResult.data)
          })
        }
      } else {
        setServerError({ message: result.error, kind: result.kind })
      }
    })
    return () => {
      cancelled = true
    }
  }, [mode, selectedId])

  // Round 3 Phase C(longitudinal linkage): once the selected submission's
  // own patient_id is known, fetch that exact patient's other visits (RAW
  // facts only -- src/doctor/workspace/PriorVisitHistoryCard.tsx never
  // computes an improvement/percentage from this). Records saved before
  // patient_id existed have no linkage target, so priorVisits stays null.
  useEffect(() => {
    const patientId = mode === 'server' ? selectedRecord?.patient_id : undefined
    if (mode !== 'server' || !patientId) {
      setPriorVisits(null)
      return
    }
    let cancelled = false
    getPatientHistory(patientId, selectedRecord?.visit_id).then((result) => {
      if (cancelled) return
      if (result.ok) setPriorVisits(result.data)
    })
    return () => {
      cancelled = true
    }
  }, [mode, selectedRecord?.patient_id, selectedRecord?.visit_id])

  // Round 3 Phase D(micro follow-up): fetch this visit's own short
  // check-in response, if one exists, keyed to this visit_id only.
  useEffect(() => {
    const visitId = mode === 'server' ? selectedRecord?.visit_id : undefined
    if (mode !== 'server' || !visitId) {
      setMicroFollowUpResponse(null)
      return
    }
    let cancelled = false
    getMicroFollowUpResponse(visitId).then((result) => {
      if (cancelled) return
      if (result.ok) setMicroFollowUpResponse(result.data.response)
    })
    return () => {
      cancelled = true
    }
  }, [mode, selectedRecord?.visit_id])

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
  const activeScenario = WORKSPACE_SCENARIOS.find((s) => s.id === workspaceScenarioId) ?? null
  const payload =
    mode === 'server' && selectedRecord
      ? recordToPayload(selectedRecord)
      : (activeScenario?.payload ?? fixture.payload)
  const r = payload.responses
  const { routing } = payload
  const saju = payload.myungri_calculation
  // malformed/legacy submission resilience 배치: 아래 상세 렌더링 블록
  // 전체가 이 값에 게이트된다 -- false면 deriveViewProfile 자체도 절대
  // 호출하지 않는다(routing이 null이면 이 호출 자체가 던진다).
  const payloadShapeOk = isDoctorPayloadShapeUsable(payload)
  const viewProfile = payloadShapeOk ? deriveViewProfile(payload).derived : null

  // 진료 녹취·요약: 선택된 visit의 recorder 결과를 5초마다 폴링한다(기존
  // 목록 폴링과 동일한 최소 패턴 — v0.1은 websocket을 만들지 않는다).
  useEffect(() => {
    // malformed/legacy submission resilience 배치: 레코드 A -> B 전환처럼
    // 둘 다 visit_id를 갖는 경우(둘 다 이 if를 안 타는 경우)에도 A의
    // recorderResults/emrText/emrSeedRecordingIdRef가 B의 화면에 잠깐이라도
    // 남아있으면 안 된다 -- 이 effect는 [mode, selectedRecord?.visit_id]가
    // 바뀔 때마다 실행되므로, 무조건 리셋한 뒤에만 새 poll을 시작한다.
    setRecorderResults(null)
    setRecorderResultsError(null)
    setEmrText('')
    emrSeedRecordingIdRef.current = null
    if (mode !== 'server' || !selectedRecord?.visit_id) {
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

  // 새 recording 결과가 도착했을 때만 EMR 요약 텍스트를 다시 만든다.
  // 편집 중이어도 새 recording_id가 오면 항상 최신 결과로 덮어쓴다(의도된 동작).
  // malformed/legacy submission resilience 배치: 이 effect는 JSX 게이트(위
  // payloadShapeOk ? ... 분기)와 무관하게 항상 실행된다 -- hook은 조건부로
  // 건너뛸 수 없다. primaryConcernLabel(r)은 r.visit_goal.visit_goal을
  // 무조건 읽으므로, payloadShapeOk가 false인 레코드에서 recorder 결과가
  // 먼저 도착하면(EMR 패널 자체는 화면에 없어도) 이 effect가 부모
  // DoctorView 안에서 직접 던진다 -- DoctorRecordErrorBoundary는 자신의
  // 자식 렌더만 잡으므로 이 예외는 그 경계를 완전히 우회한다.
  useEffect(() => {
    if (!payloadShapeOk) return
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
  }, [payloadShapeOk, recorderResults, selectedRecord?.judgment])

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

  const showingServerList = mode === 'server' && !selectedRecord
  const newCount = submissions.filter((s) => s.status === 'new').length

  // Round 3(revisit linkage): "재진 간단 문진 시작". Uses the EXPLICIT
  // patient_id already carried by the currently-open submission record --
  // never derived from name/phone/DOB (same identity boundary as every
  // other revisit-creation path in this codebase).
  async function handleStartRevisit() {
    if (!selectedRecord?.patient_id) return
    if (startRevisitPending) return
    setStartRevisitPending(true)
    setRevisitActionError(null)
    try {
      const result = await startRevisit(selectedRecord.patient_id, deliveryMode)
      if (result.ok) {
        setIssuedSession({
          visitId: result.data.visit.id,
          token: result.data.session.token,
          expiresAt: result.data.session.expiresAt,
          targetCount: result.data.session.targets.length,
        })
        setLinkCopyStatus('idle')
        setRetryNonce((n) => n + 1)
      } else {
        setRevisitActionError(result.error)
      }
    } finally {
      setStartRevisitPending(false)
    }
  }

  async function handleReissueSession() {
    if (!issuedSession) return
    const result = await reissueFollowUpSession(issuedSession.visitId)
    if (result.ok) {
      setIssuedSession({
        visitId: issuedSession.visitId,
        token: result.data.token,
        expiresAt: result.data.expiresAt,
        targetCount: result.data.targets.length,
      })
      setLinkCopyStatus('idle')
    } else {
      setRevisitActionError(result.error)
    }
  }

  async function handleInvalidateSession() {
    if (!issuedSession) return
    const result = await invalidateFollowUpSession(issuedSession.visitId)
    if (result.ok) {
      setIssuedSession(null)
      setRetryNonce((n) => n + 1)
    } else {
      setRevisitActionError(result.error)
    }
  }

  // BizM batch: no longer derived from window.location.origin/pathname --
  // see src/lib/publicFollowUpUrl.ts's header for why a stable, explicitly
  // configured base is required for a real BizM Alimtalk template button
  // URL. Returns null when that base is not configured; every call site
  // below must render an explicit "설정되지 않음" state rather than ever
  // falling back to a guessed URL.
  function patientFollowUpLink(token: string): string | null {
    return buildPublicFollowUpLink(token)
  }

  /* ---------- Round 8: clinic tablet stations (reception surface) ---------- */

  function stationPairingLink(credential: string): string {
    return `${window.location.origin}${window.location.pathname}#station-setup=${credential}`
  }

  async function refreshStations() {
    const result = await listStations()
    if (result.ok) {
      setStations(result.data)
      // Keep a sensible default selected so the common case is one click.
      setSelectedStationId((current) => current || firstFreeStationId(result.data))
    }
  }

  async function handleRegisterStation() {
    const name = newStationName.trim()
    if (!name) return
    setStationError(null)
    const result = await registerStation(name)
    if (!result.ok) {
      setStationError(result.error)
      return
    }
    // Shown exactly once. Staff opens this on the tablet itself; the tablet
    // stores the credential and scrubs it from its own URL (see App.tsx).
    setNewStationPairing({ name: result.data.name, link: stationPairingLink(result.data.credential) })
    setNewStationName('')
    await refreshStations()
  }

  // THE front-desk action: assign this already-open patient's new revisit to
  // a specific tablet. patient_id comes from the record already on screen --
  // never matched from a name/phone/DOB, and the tablet never picks a
  // patient itself.
  async function handleAssignToStation() {
    if (!selectedRecord?.patient_id || !selectedStationId || assignPending) return
    setAssignPending(true)
    setRevisitActionError(null)
    try {
      const result = await assignRevisitToStation(selectedStationId, selectedRecord.patient_id, 'CLINIC_TABLET')
      if (result.ok) {
        setAssignedStationName(result.data.stationName)
        setIssuedSession(null)
        setRetryNonce((n) => n + 1)
        await refreshStations()
      } else {
        setRevisitActionError(result.error)
      }
    } finally {
      setAssignPending(false)
    }
  }

  async function handleResetStation(stationId: string) {
    setStationError(null)
    const result = await resetStation(stationId)
    if (!result.ok) {
      setStationError(result.error)
      return
    }
    setAssignedStationName(null)
    await refreshStations()
  }

  async function handleCopyPatientLink() {
    if (!issuedSession) return
    const link = patientFollowUpLink(issuedSession.token)
    if (link === null) {
      setLinkCopyStatus('error')
      return
    }
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(link)
        setLinkCopyStatus('copied')
        return
      }
      throw new Error('clipboard unavailable')
    } catch {
      // 클립보드 API가 없는 환경(HTTP/구형 브라우저)을 위한 폴백 — 기존
      // EMR 복사 폴백과 동일한 패턴.
      try {
        const ta = document.createElement('textarea')
        ta.value = link
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
        setLinkCopyStatus('copied')
      } catch {
        setLinkCopyStatus('error')
      }
    }
  }

  return (
    <div className="doctor">
      {readyToast && (
        <div className="doctor__toast" role="status">
          {readyToast.patientLabel} — EMR 복사 준비됨
        </div>
      )}
      <header className="doctor__header">
        <h1 className="doctor__title">진료 전 요약</h1>
        <span className="doctor__workstationBadge">
          {workstationId ? `진료 워크스테이션: ${workstationId}` : '워크스테이션 설정 필요'}
        </span>
        {mode === 'server' && hasDoctorToken && (
          <DoctorTokenClearButton
            onClear={() => {
              setTokenVersion((n) => n + 1)
              setRetryNonce((n) => n + 1)
            }}
          />
        )}
        {showPreviewControls && (
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
        )}
        {showPreviewControls && mode === 'fixtures' && (
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
        {showPreviewControls && mode === 'fixtures' && (
          <div className="doctor__pickerRow">
            <label htmlFor="doctor-workspace-scenario-select">
              Doctor Workspace 시나리오 (SYNTHETIC · NO-PHI)
            </label>
            <select
              id="doctor-workspace-scenario-select"
              value={workspaceScenarioId}
              onChange={(e) => setWorkspaceScenarioId(e.target.value)}
            >
              <option value="">(없음 — 위 fixture 그대로, decision-support 데이터 없음)</option>
              {WORKSPACE_SCENARIOS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
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
            <div className="doctor__grid">
              {submissions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`doctorField doctor__row${s.status === 'new' ? ' doctor__row--new' : ''}`}
                  onClick={() => {
                    setSelectedId(s.id)
                    setSelectedRevisit(null)
                    setIssuedSession(null)
                    setRevisitActionError(null)
                  }}
                >
                  <span className="doctorField__label">
                    {s.status === 'new' && <span className="doctor__newDot" aria-hidden="true" />}
                    {unreadReadyIds.has(s.id) && (
                      <span className="doctor__newDot doctor__newDot--ready" aria-hidden="true" />
                    )}
                    {s.patient_label} {s.requires_staff_check ? '⚠ 안전 확인 필요' : ''}
                  </span>
                  <span className="doctorField__value">
                    {statusLabel(s.status)} · {relativeTime(s.created_at)} ({new Date(s.created_at).toLocaleString('ko-KR')})
                    {s.recorder_ready && <span className="doctor__emrReadyBadge">✓ EMR 복사 준비됨</span>}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {/*
        Round 3(revisit linkage): "Doctor Queue" for no-submission revisit
        visits -- deliberately a SEPARATE section from 제출목록 above (never
        called a "submission" -- see the North Star's own wording). Hidden
        entirely when a submission or revisit is already open, same
        visibility rule as showingServerList.
      */}
      {mode === 'server' && !selectedRecord && !selectedRevisit && !serverError && revisits.length > 0 && (
        <section className="doctor__section">
          <h2>재진 목록 ({revisits.length})</h2>
          <div className="doctor__grid">
            {revisits.map((rv) => (
              <button
                key={rv.visitId}
                type="button"
                className={`doctorField doctor__row${rv.needsAttention ? ' doctor__row--new' : ''}`}
                onClick={() => {
                  setSelectedRevisit({ visitId: rv.visitId, patientId: rv.patientId })
                  setSelectedId(null)
                  setIssuedSession(null)
                  setRevisitActionError(null)
                }}
              >
                <span className="doctorField__label">
                  {REVISIT_STATUS_LABEL[rv.status]}
                  {rv.needsAttention && ' · 추가 확인 필요'}
                </span>
                <span className="doctorField__value">
                  {relativeTime(rv.createdAt)} ({new Date(rv.createdAt).toLocaleString('ko-KR')})
                  {/* Round 8 operational metadata -- never clinical. */}
                  {rv.deliveryMode && ` · ${DELIVERY_MODE_LABEL[rv.deliveryMode]}`}
                  {rv.stationName && ` · ${rv.stationName}`}
                  {rv.inputProvenance === 'STAFF_ASSISTED' && ` · ${INPUT_PROVENANCE_LABEL.STAFF_ASSISTED}`}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/*
        CRM v0.3.1 round 13: read-only Today Queue. Unlike 재진 목록 above,
        this section stays visible (with its own compact empty state) even
        when crmTasks is empty, so the clinician has a stable place to check
        rather than a section that silently disappears. TodayQueueSection is
        purely presentational -- no click handlers, no /seen call, no
        client-side re-sort of the server-ordered list.
      */}
      {mode === 'server' && !selectedRecord && !selectedRevisit && !serverError && (
        <TodayQueueSection
          tasks={crmTasks}
          loading={crmTasksLoading}
          error={crmTasksError}
          identities={patientIdentities}
          onIdentityLinked={(uuid, identity) => {
            // Round 14 identity batch: update immediately on a successful
            // confirm rather than waiting up to POLL_MS for the next poll
            // to reflect it -- the acceptance criteria requires the row
            // to refresh right away. Bump the sequence ref first so any
            // identity fetch already in flight discards its (now stale)
            // result instead of overwriting this optimistic update --
            // see patientIdentitiesSeqRef's declaration.
            patientIdentitiesSeqRef.current += 1
            setPatientIdentities((prev) => ({ ...prev, [uuid]: identity }))
          }}
        />
      )}

      {selectedRevisit && (
        <>
          <button
            type="button"
            className="judgment__recordBtn"
            onClick={() => {
              setSelectedRevisit(null)
              setIssuedSession(null)
              setRevisitActionError(null)
            }}
          >
            ← 목록으로
          </button>
          <RevisitWorkspace visitId={selectedRevisit.visitId} patientId={selectedRevisit.patientId} />
        </>
      )}

      {!selectedRevisit && (mode === 'fixtures' || selectedRecord) && (
      <>
      {/*
        Round 3(revisit linkage): the single doctor/staff action that
        creates the revisit visit + derives candidate targets (from this
        patient's own prior Follow-up Targets, max 3, no ranking) + issues
        a one-time capability token, all in one step (see
        server/store.js's startRevisit). Only offered from an open
        submission (mode==='server' && selectedRecord) since that's the
        only place patient_id is already on screen -- never derived from
        name/phone/DOB.
      */}
      {mode === 'server' && selectedRecord?.patient_id && (
        <section className="doctor__section doctor__revisitSession">
          <h2>재진 간단 문진 (Micro Follow-up)</h2>

          {/*
            Round 8: delivery mode is chosen FIRST, because it decides what
            the rest of this panel does -- assign a clinic tablet, show a
            QR, or (staff-assisted / pre-visit) just issue the link. It is
            operational metadata only: the questions, the Follow-up Targets,
            and everything clinical are identical down every channel.
          */}
          <div className="doctor__revisitSession__modes" role="group" aria-label="전달 방식">
            {(Object.keys(DELIVERY_MODE_LABEL) as DeliveryMode[]).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={deliveryMode === m}
                className={`workspace__followUpChip${deliveryMode === m ? ' workspace__followUpChip--active' : ''}`}
                onClick={() => {
                  setDeliveryMode(m)
                  setAssignedStationName(null)
                }}
              >
                {DELIVERY_MODE_LABEL[m]}
              </button>
            ))}
          </div>

          {deliveryMode === 'CLINIC_TABLET' ? (
            <div className="doctor__revisitSession__issued">
              {stations.length === 0 ? (
                <p className="doctor__revisitSession__hint">
                  등록된 원내 태블릿이 없습니다 — 아래 "원내 태블릿 관리"에서 먼저 등록해 주세요.
                </p>
              ) : (
                <>
                  <label className="doctorField__label" htmlFor="doctor-station-select">
                    배정할 태블릿
                  </label>
                  <select
                    id="doctor-station-select"
                    value={selectedStationId}
                    onChange={(e) => setSelectedStationId(e.target.value)}
                  >
                    {/* Round 9: a busy tablet is not selectable. The server
                        refuses it (409 station_busy) because the tablet stops
                        polling once a patient has the questions open, so a
                        takeover could not actually replace what is on that
                        physical screen -- staff must complete or reset it
                        first. Disabling the option makes the rule visible
                        instead of letting the click fail. */}
                    {stations.map((s) => (
                      <option key={s.stationId} value={s.stationId} disabled={Boolean(s.assignment)}>
                        {s.name}
                        {s.assignment ? ' (사용 중 — 아래에서 초기화 후 배정)' : ''}
                      </option>
                    ))}
                  </select>
                  <div className="doctor__revisitSession__actions">
                    <button
                      type="button"
                      className="judgment__recordBtn"
                      onClick={handleAssignToStation}
                      disabled={assignPending || !selectedStationId || selectedStationBusy}
                    >
                      {assignPending ? '배정 중…' : '이 태블릿에 배정'}
                    </button>
                  </div>
                  {assignedStationName && (
                    <p className="doctor__revisitSession__hint">
                      「{assignedStationName}」에 배정되었습니다 — 환자에게 그 태블릿을 건네주세요. 환자는 이름·전화번호를
                      입력하지 않습니다.
                    </p>
                  )}
                  <p className="doctor__revisitSession__hint">
                    사용 중인 태블릿에는 배정할 수 없습니다 — 아래 「원내 태블릿 관리」에서 초기화한 뒤 배정하세요.
                    초기화하면 그 태블릿이 들고 있던 링크는 즉시 무효화됩니다.
                  </p>
                </>
              )}
            </div>
          ) : !issuedSession ? (
            <>
              <button
                type="button"
                className="judgment__recordBtn"
                onClick={handleStartRevisit}
                disabled={startRevisitPending}
              >
                {startRevisitPending ? '처리 중…' : '재진 간단 문진 시작'}
              </button>
              <p className="doctor__revisitSession__hint">
                직전 방문의 추적 항목(최대 3개)을 바탕으로 환자용 1회용 링크를 발급합니다.
              </p>
            </>
          ) : (() => {
            // Computed once here (not re-called at every use site below) so
            // the QR/code display, copy-link button, and MessagingPanel's
            // `link` prop can never disagree on whether the public base is
            // configured -- see src/lib/publicFollowUpUrl.ts's header.
            const followUpLink = patientFollowUpLink(issuedSession.token)
            return (
            <div className="doctor__revisitSession__issued">
              <p>
                환자용 링크 (만료: {new Date(issuedSession.expiresAt).toLocaleString('ko-KR')})
              </p>
              {followUpLink === null ? (
                <p className="doctor__revisitSession__error" role="alert">
                  공개 후속 링크 기본 URL이 설정되지 않았습니다 — 관리자에게
                  VITE_SAMINDANG_PUBLIC_FOLLOWUP_BASE_URL 환경변수 설정을 요청하세요. 그때까지는 링크
                  복사·QR·문자/알림톡 발송을 사용할 수 없습니다.
                </p>
              ) : (
                <>
                  {deliveryMode === 'PERSONAL_QR' && <FollowUpQrCode url={followUpLink} />}
                  <code className="doctor__revisitSession__link">{followUpLink}</code>
                </>
              )}
              {issuedSession.targetCount === 0 && (
                <p className="doctor__revisitSession__hint">
                  이 환자는 이전 방문에 기록된 추적 항목이 없습니다 — 재확인 항목 없이 전반적 변화 · 새로운 증상 ·
                  이상반응만 묻는 링크가 발급되었습니다.
                </p>
              )}
              {deliveryMode === 'STAFF_ASSISTED' && (
                <p className="doctor__revisitSession__hint">
                  환자가 기기를 쓰기 어려운 경우, 직원이 이 링크를 열어 같은 질문을 읽어드리고 환자가 말한 답을 그대로
                  입력합니다. 답변은 여전히 <strong>환자가 보고한 사실</strong>이며, 원장이 관찰한 소견이 아닙니다.
                </p>
              )}
              {deliveryMode === 'PREVISIT_LINK' && (
                <p className="doctor__revisitSession__hint">
                  내원 전 전달용 링크입니다. 아래에서 문자/카카오 알림톡으로 바로 발송하거나, 이 링크를 직접 복사해
                  전달할 수 있습니다.
                </p>
              )}
              <div className="doctor__revisitSession__actions">
                <button type="button" className="judgment__recordBtn" onClick={handleCopyPatientLink}>
                  {linkCopyStatus === 'copied' ? '복사됨' : linkCopyStatus === 'error' ? '복사 실패' : '링크 복사'}
                </button>
                <button type="button" className="judgment__recordBtn" onClick={handleReissueSession}>
                  재발급
                </button>
                <button type="button" className="judgment__recordBtn" onClick={handleInvalidateSession}>
                  무효화
                </button>
              </div>
              {selectedRecord?.patient_id && followUpLink !== null && (
                <MessagingPanel
                  visitId={issuedSession.visitId}
                  patientId={selectedRecord.patient_id}
                  followUpToken={issuedSession.token}
                  link={followUpLink}
                />
              )}
            </div>
            )
          })()}
          {revisitActionError && <p className="doctor__revisitSession__error">{revisitActionError}</p>}

          {/*
            Round 8: station management. Registration hands back a device
            credential exactly once, rendered as a one-time pairing link
            that staff opens ON the tablet -- never stored anywhere here.
          */}
          <details className="doctor__revisitSession__stations">
            <summary>원내 태블릿 관리 ({stations.length})</summary>
            <div className="doctor__revisitSession__stationList">
              {stations.map((s) => (
                <div key={s.stationId} className="doctor__revisitSession__stationRow">
                  <span>
                    {s.name} — {s.assignment ? '환자 배정됨' : '대기 중'}
                  </span>
                  {s.assignment && (
                    <button type="button" className="judgment__recordBtn" onClick={() => handleResetStation(s.stationId)}>
                      대기 화면으로 되돌리기
                    </button>
                  )}
                </div>
              ))}
              <div className="doctor__revisitSession__actions">
                <input
                  type="text"
                  className="workspace__noteInput"
                  value={newStationName}
                  onChange={(e) => setNewStationName(e.target.value)}
                  placeholder="예: 접수 태블릿 1"
                  aria-label="새 태블릿 이름"
                />
                <button type="button" className="judgment__recordBtn" onClick={handleRegisterStation}>
                  태블릿 등록
                </button>
              </div>
              {newStationPairing && (
                <div className="doctor__revisitSession__issued">
                  <p>
                    「{newStationPairing.name}」 등록 링크 — <strong>이 화면을 벗어나면 다시 볼 수 없습니다.</strong> 해당
                    태블릿에서 이 주소를 한 번만 열어주세요.
                  </p>
                  <code className="doctor__revisitSession__link">{newStationPairing.link}</code>
                </div>
              )}
              {stationError && <p className="doctor__revisitSession__error">{stationError}</p>}
            </div>
          </details>
        </section>
      )}
      {/*
        malformed/legacy submission resilience 배치: 아래 nav+tab 콘텐츠
        전체(임상/참고/명리 세 표면 + JudgmentPanel + 원본 JSON)는
        payloadShapeOk에 게이트된다 -- 명리/참고 표면이 "profile이
        pain이 아닐 때만" 의미가 있는 것처럼, 이 구조 자체가 애초에
        구조가 온전한 payload를 전제하기 때문에 하나로 묶어서 판단한다.
        DoctorRecordErrorBoundary는 이 구조 검사가 못 잡은 예외(개별
        부위 SafetyPanel 내부의 미처 확인 못 한 필드 등)에 대한 2차
        안전망 -- key를 화면에 실제로 그려지는 payload의 정체성(server
        모드는 selectedRecord.id, fixtures 모드는 fixtureIndex +
        workspaceScenarioId)으로 둬서, 다른 레코드/시나리오로 전환하면
        이전 에러 상태가 새 payload로 새지 않고 완전히 새로 mount된다.
      */}
      <DoctorRecordErrorBoundary
        key={mode === 'server' ? (selectedRecord?.id ?? 'none') : `fixtures:${fixtureIndex}:${workspaceScenarioId}`}
        fallback={<DoctorRecordFallback record={mode === 'server' ? selectedRecord : undefined} />}
      >
      {!payloadShapeOk ? (
        <DoctorRecordFallback record={mode === 'server' ? selectedRecord : undefined} />
      ) : (
      <>
      {/*
        Round 11: the record's three surfaces. 진료 is the clinical action
        screen and the default; the other two hold everything that used to
        stack underneath it. Myungri only exists as a surface at all when
        the profile is not pain (the standing Phase 2 invariant).
      */}
      <nav className="doctor__recordTabs" role="tablist" aria-label="환자 기록 화면">
        <button
          type="button"
          role="tab"
          aria-selected={recordTab === 'clinical'}
          className={`doctor__recordTab${recordTab === 'clinical' ? ' doctor__recordTab--active' : ''}`}
          onClick={() => openRecordTab('clinical')}
        >
          진료
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={recordTab === 'reference'}
          className={`doctor__recordTab${recordTab === 'reference' ? ' doctor__recordTab--active' : ''}`}
          onClick={() => openRecordTab('reference')}
        >
          자료 보기
        </button>
        {viewProfile !== 'pain' && (
          <button
            type="button"
            role="tab"
            aria-selected={recordTab === 'myungri'}
            className={`doctor__recordTab${recordTab === 'myungri' ? ' doctor__recordTab--active' : ''}`}
            onClick={() => openRecordTab('myungri')}
          >
            명리
          </button>
        )}
      </nav>

      <div hidden={recordTab !== 'clinical'}>
      {/*
        key={payload.session_id}: DoctorWorkspace owns its own local state
        (profile override, mixed-mode active tab) seeded from the payload
        on mount. Without this key, switching the underlying record (a
        different real submission, or a different SYNTHETIC preview
        scenario/fixture) would keep the PREVIOUS record's already-mounted
        instance and its stale tab/profile choice -- same reasoning as the
        key on PainWorkspace/HerbalWorkspace inside DoctorWorkspace, and
        the pre-existing key on JudgmentPanel below.
      */}
      <DoctorWorkspace
        payload={payload}
        lbpObjectiveMotorDeficit={
          mode === 'server' ? selectedRecord?.judgment?.lbp_objective_motor_deficit : undefined
        }
        shoulderObjectiveCuffWeakness={
          mode === 'server' ? selectedRecord?.judgment?.shoulder_objective_cuff_weakness : undefined
        }
        synthetic={mode === 'fixtures' ? (activeScenario?.synthetic ?? undefined) : undefined}
        submissionId={mode === 'server' ? selectedId ?? undefined : undefined}
        initialWorkspaceState={mode === 'server' ? selectedRecord?.workspace ?? null : undefined}
        initialRecordUpdatedAt={mode === 'server' ? selectedRecord?.updated_at : undefined}
        priorVisits={mode === 'server' ? priorVisits : undefined}
        microFollowUpResponse={mode === 'server' ? microFollowUpResponse : undefined}
        onSaveWorkspace={
          mode === 'server' && selectedId
            ? async (state, expectedUpdatedAt) => {
                const result = await saveWorkspaceStateToServer(selectedId, state, expectedUpdatedAt ?? undefined)
                // selectedRecord갱신: 재열람 시(같은 세션 안에서 selectedId를 다시
                // 고를 때) 이미 저장된 workspace를 stale하지 않게 반영한다 — 기존
                // saveJudgmentToServer onSave 콜백과 동일한 이유(위 judgment 콜백
                // 주석 참고).
                if (result.ok) {
                  setSelectedRecord(result.data)
                  return { ok: true, updatedAt: result.data.updated_at }
                }
                // Round 18: a 409 stale-write conflict carries the server's
                // CURRENT record in errorBody.current (server/index.js's
                // saveWorkspace route) -- hand it back as a typed conflict so
                // DoctorWorkspace can offer an explicit reload instead of
                // silently retrying or overwriting. Any other failure
                // (network/auth/etc.) falls through to the plain error path,
                // unchanged from before this round.
                const current = result.errorBody?.current as SubmissionRecord | undefined
                if (current) {
                  return {
                    ok: false,
                    conflict: { current: deserializeWorkspaceState(current.workspace), currentUpdatedAt: current.updated_at },
                  }
                }
                return { ok: false }
              }
            : undefined
        }
      />

      {mode === 'server' && selectedRecord?.patient_id && (
        <MedicationCourseSection key={selectedRecord.patient_id} patientUuid={selectedRecord.patient_id} />
      )}

      </div>

      <div hidden={recordTab !== 'reference'}>
      <p className="doctor__referenceNote">
        아래는 참고 자료입니다 — 진료 화면에서 내려온 것일 뿐 사라진 것은 없고, 내용도 그대로 편집됩니다.
      </p>
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
          {/*
            PR #24 Phase 2 invariant: pain 프로필은 출생시간/명리 관련
            내용을 노출하지 않는다 -- 출생정보(BIRTH_*)는 herbal/mixed일
            때만 보인다.
          */}
          {viewProfile !== 'pain' && (
            <>
              <Field qid="BIRTH_01" label="생년월일" value={r.birth_info.birth_date} />
              <Field qid="BIRTH_02" value={r.birth_info.birth_calendar_type} />
              <Field qid="BIRTH_02A" value={r.birth_info.lunar_leap_month} />
              <Field qid="BIRTH_03" value={r.birth_info.birth_time_branch} />
              <Field qid="BIRTH_03A" value={r.birth_info.birth_time_confidence} />
            </>
          )}
        </div>
      </section>

      <section className="doctor__section">
        <h2>주호소</h2>
        <p className="doctor__derivedNote">
          시스템 라우팅 — 주호소 모듈: {routing.primary_module ?? '없음'} / 동반 화면:{' '}
          {asArray<string>(routing.secondary_screens).length > 0
            ? asArray<string>(routing.secondary_screens).join(', ')
            : '없음'}
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
      <section className="doctor__section">
        <h2>추가 상세상담</h2>
        {routing.additional_module ? (
          <>
            <div className="doctor__chiefPrimary">
              <span className="doctor__chiefPrimary__label">추가 상세상담</span>
              <span className="doctor__chiefPrimary__value">
                {optionLabel('ADDITIONAL_DETAIL_01', routing.additional_detail_concern)}
              </span>
            </div>
            <div className="doctor__grid">
              {primaryModuleFields(routing.additional_module, r.modules, routing.additional_module_detail).map(
                (f) => (
                  <Field key={f.qid} qid={f.qid} value={f.value} />
                ),
              )}
            </div>
          </>
        ) : (
          <p className="doctor__empty">추가 상세상담 없음</p>
        )}
      </section>

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
          {referenceSymptomKeys(routing).length === 0 && <p className="doctor__empty">참고 증상 없음</p>}
        </div>
        {referenceSymptomKeys(routing).includes('other') && (
          <p className="doctor__derivedNote">기타 참고증상 있음 — 진료 중 확인</p>
        )}
      </section>

      <section className="doctor__section">
        <h2>동반문제</h2>
        <p className="doctor__derivedNote">
          이전 방식(SECONDARY_01)으로 저장된 문진의 하위호환 표시입니다. 새 문진은 위 "추가
          상세상담"/"참고 증상"으로 대체되어 이 구역이 항상 비어 있습니다.
        </p>
        <div className="doctor__secChips">
          {secondaryChipsData(r).map((c) => (
            <span key={c.key} className="doctor__secChip" title={c.answerText}>
              <strong>{c.categoryLabel}</strong>
              <span className="doctor__secChip__text">{c.answerText || '—'}</span>
            </span>
          ))}
          {secondaryChipsData(r).length === 0 && <p className="doctor__empty">동반문제 없음</p>}
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
          {primaryModuleFields(routing.primary_module, r.modules, routing.primary_module_detail).map((f) => (
            <Field key={f.qid} qid={f.qid} value={f.value} />
          ))}
          {primaryModuleFields(routing.primary_module, r.modules, routing.primary_module_detail).length === 0 && (
            <p className="doctor__empty">이번 방문에는 해당 상세 Module이 없습니다.</p>
          )}
        </div>
      </section>

      {/* PR #24 Phase 2 invariant: pain 프로필은 herbal 전용 전신 정보를 노출하지 않는다. */}
      {viewProfile !== 'pain' && (
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
      )}

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

      {/*
        Round 2 Phase 3 (same fix as HerbalWorkspace's 여성·생식 정보):
        derived.source is non-null only when WOMEN_SAFETY_01 was actually
        asked/answered, or the postpartum/pregnancy module already supplied
        a derived fact -- for a male patient (or any patient where nothing
        reproductive was ever recorded) this is null, and showing a card
        full of "확인되지 않음" bullets is pure clutter, not information.
      */}
      {r.reproductive_status.derived?.source != null && (
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
      )}

      <section className="doctor__section">
        <h2>검사자료 / 원장에게 하고 싶은 말</h2>
        <div className="doctor__grid">
          <Field qid="TEST_01" value={r.recent_tests.recent_test_flag} />
          <Field qid="FREE_01" value={r.free_text.free_text_yn} />
        </div>
      </section>

      {/*
        PR #24 Phase 2 invariant: pain 프로필은 명리/출생시간 내용을 노출하지
        않는다. Round 11 goes further -- Myungri is not merely below the
        clinical workspace, it is a separate surface that the clinical flow
        never renders, per the standing rule that it must be completely
        separated from it.
      */}
      </div>

      {viewProfile !== 'pain' && (
      <div hidden={recordTab !== 'myungri'}>
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

            {saju.normalized?.solarDate && (
              <p className="doctor__derivedNote">
                정규화된 양력 날짜: {saju.normalized.solarDate.year}-
                {String(saju.normalized.solarDate.month).padStart(2, '0')}-
                {String(saju.normalized.solarDate.day).padStart(2, '0')} / 상태: {saju.status}
              </p>
            )}

            {asArray<string>(saju.policy.pending_approval).length > 0 && (
              <p className="doctor__warning doctor__warning--pending">
                주의: 야자시/조자시 또는 진태양시 정책이 아직 확정되지 않아 이
                값이 바뀔 수 있습니다. 대기 항목: {asArray<string>(saju.policy.pending_approval).join(', ')}.
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
      </div>
      )}

      <div hidden={recordTab !== 'reference'}>
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
          myungri_pending_approval: asArray<string>(saju.policy.pending_approval),
        }}
        initialJudgment={mode === 'server' ? selectedRecord?.judgment ?? null : null}
        initialUpdatedAt={mode === 'server' ? selectedRecord?.updated_at : undefined}
        /* 6차 독립 리뷰 HIGH-1/MEDIUM-1: LbpSafetyPanel과 동일한 applicability
           신호(safety_flags.<region>, nullish 비교)로 통일 -- routing 태그나
           strict !== null은 additional-detail 경로/레거시 undefined 키에서
           잘못된 값을 낸다. */
        showLbpExam={payload.responses.safety_flags.lbp != null}
        showShoulderExam={payload.responses.safety_flags.shoulder != null}
        onSave={
          mode === 'server' && selectedId
            ? async (judgment: ClinicianJudgment, expectedUpdatedAt: string | null) => {
                // selectedRecord를 갱신해야 selectedRecord?.judgment(EMR 요약 seed
                // effect와 "요약 다시 만들기" 버튼이 읽는 값)가 저장 직후 최신이
                // 된다 — 이걸 빼면 재열람 전까지 계속 stale한 judgment를 읽는다.
                const result = await saveJudgmentToServer(selectedId, judgment, expectedUpdatedAt ?? undefined)
                if (result.ok) {
                  setSelectedRecord(result.data)
                  return { ok: true as const, updatedAt: result.data.updated_at }
                }
                // Round 18: same 409-conflict translation as the workspace
                // save callback above -- see its comment.
                const current = result.errorBody?.current as SubmissionRecord | undefined
                if (current) {
                  return { ok: false as const, conflict: { current: current.judgment, currentUpdatedAt: current.updated_at } }
                }
                return { ok: false as const }
              }
            : undefined
        }
      />

      <details className="doctor__raw">
        <summary>원본 응답 보기 (JSON)</summary>
        <pre>{JSON.stringify(payload, null, 2)}</pre>
      </details>
      </div>
      </>
      )}
      </DoctorRecordErrorBoundary>
      </>
      )}
    </div>
  )
}
