import { useEffect, useRef, useState } from 'react'
import { SECONDARY_SHORT_SCREENS } from '../spec/coreSpec'
import { answerLabel, optionLabels, questionLabel } from './labels'
import { DOCTOR_FIXTURES } from './fixtures'
import { JudgmentPanel } from './JudgmentPanel'
import { DOCTOR_SECTION_ORDER } from './sectionOrder'
import type { ClinicianJudgment } from './judgment'
import type { DoctorPayload } from './types'
import type { AnswerValue } from '../types'
import {
  getSubmission,
  listSubmissions,
  saveJudgment as saveJudgmentToServer,
  setSubmissionStatus,
  type SubmissionRecord,
  type SubmissionSummary,
} from '../lib/serverClient'
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

/** routing.primary_module(예: 'Sleep') -> 해당 모듈 상세 문항 목록. */
function primaryModuleFields(primaryModule: string | null, m: Responses['modules']) {
  switch (primaryModule) {
    case 'Sleep':
      return [
        { qid: 'SLEEP_01', value: m.sleep.problems },
        { qid: 'SLEEP_02', value: m.sleep.frequency_per_week },
        { qid: 'SLEEP_03', value: m.sleep.awakening_reasons },
        { qid: 'SLEEP_03A', value: m.sleep.awakening_other },
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
export function DoctorView() {
  useEffect(() => {
    document.documentElement.classList.add('doctor-mode')
    return () => document.documentElement.classList.remove('doctor-mode')
  }, [])

  const [mode, setMode] = useState<'fixtures' | 'server'>('fixtures')
  const [fixtureIndex, setFixtureIndex] = useState(0)

  const [submissions, setSubmissions] = useState<SubmissionSummary[]>([])
  const [serverError, setServerError] = useState<string | null>(null)
  const [listLoading, setListLoading] = useState(true)
  const [retryNonce, setRetryNonce] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedRecord, setSelectedRecord] = useState<SubmissionRecord | null>(null)
  const viewedRef = useRef<Set<string>>(new Set())

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

  const fixture = DOCTOR_FIXTURES[fixtureIndex]
  const payload = mode === 'server' && selectedRecord ? recordToPayload(selectedRecord) : fixture.payload
  const r = payload.responses
  const { flags, routing } = payload
  const saju = payload.myungri_calculation

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
      </header>

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
        <div className="doctor__grid">
          <div className="doctorField">
            <span className="doctorField__label">주호소</span>
            <span className="doctorField__value">{primaryConcernLabel(r)}</span>
          </div>
          <Field qid="VISIT_03_SYMPTOM_DURATION" value={r.visit_goal.chief_duration} />
          <Field qid="VISIT_04_SYMPTOM_IMPACT" value={r.visit_goal.chief_impact} />
          <Field qid="VISIT_02A_SYMPTOM_OTHER" value={r.visit_goal.primary_symptom_other} />
        </div>
      </section>

      <section className="doctor__section">
        <h2>동반문제</h2>
        <div className="doctor__grid">
          <Field qid="SECONDARY_01" value={r.secondary_concerns.secondary_concerns as string[] | null} />
          <Field qid="SECONDARY_01A" value={r.secondary_concerns.secondary_other_text} />
          {secondaryModuleFields(r).map((f) => (
            <Field key={f.qid} qid={f.qid} value={f.value} />
          ))}
        </div>
      </section>

      <section className="doctor__section">
        <h2>상세 증상{routing.primary_module ? ` — ${routing.primary_module}` : ''}</h2>
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
        <h2>전신·한약 참고</h2>
        <div className="doctor__grid">
          <Field qid="CONST_ENERGY" value={r.constitution_basics.energy_recovery} />
          <Field qid="CONST_SLEEP" value={r.constitution_basics.sleep_basic} />
          <Field qid="CONST_DIGESTION" value={r.constitution_basics.digestion_basic} />
          <Field qid="CONST_BOWEL" value={r.constitution_basics.bowel_basic} />
          <Field qid="HERB_APPETITE" value={r.constitution_basics.appetite_level} />
          <Field qid="HERB_THERMAL" value={r.constitution_basics.thermal_tendency} />
          <Field qid="HERB_THIRST" value={r.constitution_basics.thirst_level} />
          <Field qid="HERB_SWEAT" value={r.constitution_basics.sweat_pattern} />
        </div>
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
              <p className="doctor__warning">
                주의: 야자시/조자시 또는 진태양시 정책이 아직 확정되지 않아 이
                값이 바뀔 수 있습니다. 대기 항목: {saju.policy.pending_approval.join(', ')}.
                원장이 확정하면 값이 바뀔 수 있습니다 — 자세한 내용은
                docs/MYUNGRI_CALCULATION_POLICY_PENDING.md 참고.
              </p>
            )}
          </div>

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
      </section>

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
            ? (judgment: ClinicianJudgment) => {
                saveJudgmentToServer(selectedId, judgment)
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
