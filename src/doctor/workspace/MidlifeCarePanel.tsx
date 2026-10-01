/**
 * Midlife Doctor View — Figma `02 · Midlife Care v0.1` / Doctor View · Midlife · 1440 (40:49) 구조.
 *
 *   상단 Clinical Snapshot : 주기 · 주요 증상 · 가장 힘든 문제 · 안전 칩 · 미해결/재검토 경고
 *   좌측  : LIFE STAGE · TOP SYMPTOMS · BASELINE PRO
 *   우측  : DIAGNOSTIC HYPOTHESIS · REFUTATION TRIGGER · REFERRAL / UNRESOLVED · CARE PLAN / NEXT REVIEW
 *
 * 환자 응답 칸은 읽기 전용, 원장 칸은 전부 직접 입력이다. 자동 진단·점수·추천 문구를
 * 만들지 않는다. 파생 표시는 `midlifeCare.ts`의 두 규칙(미해결 경고, 연속 2회 이탈 →
 * 가설 재검토)과 안전 판정뿐이다.
 *
 * PO 재검수(2026-09-29, PR #59):
 *  - BASELINE PRO는 **환자가 입력한 값만** 보인다 — 초진은 태블릿, 이후는 재진 링크에서
 *    환자가 다시 답한 MID_05·06·07(`midlifeProReports`). 원장이 숫자를 옮겨 적는 칸은 없다.
 *    재진 값은 주차 칸에 억지로 넣지 않고 실제 날짜(+N주)로 보인다 — 늦게 온 환자의 값이
 *    엉뚱한 주차에 들어가는 오분류를 막는다. 원장 review는 경과 판정·기록일만.
 *  - CARE PLAN의 4주 목표는 기존 `FollowUpTarget`(`herbalFollowUpTargets`)에 저장된다 —
 *    다음 재진 링크의 Micro Follow-up 후보로 이어진다(`midlifeCare.ts` 4주 care goal 절).
 *  - Figma BASELINE PRO의 "다음 행동 이해" 행은 그리지 않는다(MID_15 삭제 유지, PO 2026-09-29).
 */
import { useState } from 'react'
import { answerLabel } from '../labels'
import type { DoctorPayload } from '../types'
import type { MidlifeProReport } from './longitudinal'
import type { FollowUpTarget } from './finalAssessment'
import { toMidlifeStateFromDoctorPayload } from '../../spec/midlifeAdapter'
import { computeMidlifeSafety, MIDLIFE_PRIORITY_REASON_LABEL, MIDLIFE_URGENT_REASON_LABEL } from '../../spec/midlifeLogic'
import {
  MIDLIFE_CARE_GOAL_MAX,
  MIDLIFE_COURSE_LABEL,
  MIDLIFE_COURSE_VALUES,
  MIDLIFE_LIFE_STAGES,
  MIDLIFE_LIFE_STAGE_LABEL,
  MIDLIFE_REFERRAL_STATUSES,
  MIDLIFE_REFERRAL_STATUS_LABEL,
  MIDLIFE_REVIEW_WEEKS,
  emptyMidlifeReview,
  isReferralUnresolved,
  midlifeGoalOptions,
  midlifeHypothesisReopen,
  midlifeUnresolvedSummary,
  newMidlifeReferral,
  normalizeReviews,
  sanitizeScore,
  selectedMidlifeGoals,
  toggleMidlifeGoal,
  type MidlifeCareRecord,
  type MidlifeCourseVsExpected,
  type MidlifeLifeStage,
  type MidlifeReferral,
  type MidlifeReview,
  type MidlifeReviewWeek,
} from './midlifeCare'

type MidlifeModule = Record<string, unknown>

function midlifeModule(payload: DoctorPayload): MidlifeModule {
  const m = (payload.responses as { modules?: { midlife?: unknown } }).modules?.midlife
  return typeof m === 'object' && m !== null && !Array.isArray(m) ? (m as MidlifeModule) : {}
}

/** 저장된 응답을 환자가 본 라벨로. 값이 없으면 "—" — 없는 답을 지어내지 않는다. */
function label(qid: string, value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (Array.isArray(value)) {
    if (!value.every((v) => typeof v === 'string')) return '확인 필요(값 형식 오류)'
    return value.length > 0 ? answerLabel(qid, value as string[]) : '—'
  }
  if (typeof value !== 'string' && typeof value !== 'number') return '확인 필요(값 형식 오류)'
  return answerLabel(qid, value) || '—'
}

function scoreText(v: unknown): string {
  const s = sanitizeScore(v)
  return s === null ? '—' : `${s}/10`
}

/** 환자 PRO 3축 -- 초진(태블릿 moduleField)과 재진 보고(reportKey)가 같은 문항 id(MID_05·06·07)다. */
const PRO_ROWS: { title: string; moduleField: string; reportKey: 'primarySymptom' | 'sleepSatisfaction' | 'functionInterference' }[] = [
  { title: '주증상', moduleField: 'primary_symptom_0_10', reportKey: 'primarySymptom' },
  { title: '수면 만족도', moduleField: 'sleep_satisfaction_0_10', reportKey: 'sleepSatisfaction' },
  { title: '일상 기능 방해', moduleField: 'function_interference_0_10', reportKey: 'functionInterference' },
]

/** 표에 보이는 최근 재진 보고 수 -- 1440 폭에서 표가 넘치지 않게. */
const MAX_REPORT_COLUMNS = 4

const DAY_MS = 24 * 60 * 60 * 1000

/** "M/D" + (초진일을 알면) "+N주". 날짜를 못 읽으면 "날짜 불명" -- 지어내지 않는다. */
function reportHeading(createdAt: string, baselineMs: number | null): { date: string; weeks: string | null } {
  const t = Date.parse(createdAt)
  if (Number.isNaN(t)) return { date: '날짜 불명', weeks: null }
  const d = new Date(t)
  const date = `${d.getMonth() + 1}/${d.getDate()}`
  if (baselineMs === null || t < baselineMs) return { date, weeks: null }
  return { date, weeks: `+${Math.round((t - baselineMs) / (7 * DAY_MS))}주` }
}

function newReferralId(): string {
  return `mlref-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

export function MidlifeCarePanel({
  payload,
  value,
  onChange,
  proReports = [],
  followUpTargets = [],
  onChangeFollowUpTargets,
}: {
  payload: DoctorPayload
  value: MidlifeCareRecord
  onChange: (next: MidlifeCareRecord) => void
  /** 재진 링크에서 환자가 다시 답한 PRO(`PatientHistoryResult.midlifeProReports`). 없으면 초진만. */
  proReports?: MidlifeProReport[]
  /** 4주 목표가 저장되는 기존 FollowUpTarget 배열(갱년기 = 한약 프로필 → herbalFollowUpTargets). */
  followUpTargets?: FollowUpTarget[]
  onChangeFollowUpTargets?: (next: FollowUpTarget[]) => void
}) {
  const m = midlifeModule(payload)
  const safety = computeMidlifeSafety(toMidlifeStateFromDoctorPayload(payload.responses))
  const unresolved = midlifeUnresolvedSummary(value.referrals)
  const reopen = midlifeHypothesisReopen(value.reviews)
  const reproductive = (payload.responses as { reproductive_status?: { reproductive_status?: unknown } }).reproductive_status
    ?.reproductive_status

  const set = (patch: Partial<MidlifeCareRecord>) => onChange({ ...value, ...patch })

  const updateReferral = (id: string, patch: Partial<MidlifeReferral>) =>
    set({
      referrals: value.referrals.map((r) =>
        r.id === id ? { ...r, ...patch, updatedAt: patch.status !== undefined ? new Date().toISOString() : r.updatedAt } : r,
      ),
    })

  const reviewFor = (week: MidlifeReviewWeek): MidlifeReview =>
    value.reviews.find((r) => r.week === week) ?? emptyMidlifeReview(week)
  // 입력 칸이 보여주는 주차 -- 화면 상태일 뿐 저장하지 않는다. 기본은 "다음 review"로 잡아둔 주차.
  const [activeWeek, setActiveWeek] = useState<MidlifeReviewWeek>(value.nextReviewWeek ?? MIDLIFE_REVIEW_WEEKS[0])
  const active = reviewFor(activeWeek)
  const updateReview = (week: MidlifeReviewWeek, patch: Partial<MidlifeReview>) =>
    set({ reviews: normalizeReviews([...value.reviews.filter((r) => r.week !== week), { ...reviewFor(week), ...patch }]) })

  // 재진 PRO 보고: 초진 이후 것만, 날짜 오름차순, 최근 MAX_REPORT_COLUMNS개.
  const startedRaw = (payload.metadata as { session_started_at?: unknown } | undefined)?.session_started_at
  const baselineMs = typeof startedRaw === 'string' && !Number.isNaN(Date.parse(startedRaw)) ? Date.parse(startedRaw) : null
  const reports = (Array.isArray(proReports) ? proReports : [])
    .filter((r) => baselineMs === null || Date.parse(r.createdAt) >= baselineMs)
    .slice()
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
    .slice(-MAX_REPORT_COLUMNS)

  const goals = selectedMidlifeGoals(followUpTargets)
  const goalIds = new Set(goals.map((g) => g.id))
  const goalsFull = goals.length >= MIDLIFE_CARE_GOAL_MAX
  // 접힘 초기값은 마운트 때 한 번만 정한다(latch) -- 편집 도중 값이 비는 순간 칸이
  // 닫혀 사라지지 않게(CLAUDE.md 경로 규칙 3항). 이후엔 원장이 여닫는다.
  const [goalPickerOpen] = useState(() => goals.length === 0)
  const [courseOpen] = useState(() => value.reviews.some((r) => r.courseVsExpected !== null || r.reviewedOn !== ''))
  const courseSummary = MIDLIFE_REVIEW_WEEKS.map((w) => {
    const c = reviewFor(w).courseVsExpected
    return `${w}주 ${c ? MIDLIFE_COURSE_LABEL[c] : '—'}`
  }).join(' · ')

  const safetyTone =
    safety.status === 'URGENT_REVIEW' ? 'urgent' : safety.status === 'CLEAR' ? 'clear' : safety.status === 'INCOMPLETE' ? 'unknown' : 'priority'
  const safetyChip =
    safety.status === 'URGENT_REVIEW'
      ? 'URGENT — 레인1 먼저 확인'
      : safety.status === 'PRIORITY_EVALUATION'
        ? '우선 외부평가 필요'
        : safety.status === 'CLEAR'
          ? '긴급 Red flag 없음'
          : '안전 판정 불가 — 확인 필요'
  const headline = [label('MID_01', m.cycle_change), label('MID_04', m.top_symptoms)].join(' · ')

  return (
    <section className="workspace__block midlife" aria-labelledby="midlife-h3" data-midlife-panel>
      <h3 id="midlife-h3">갱년기 진료 요약</h3>

      {/* ---------- Clinical Snapshot ---------- */}
      <div className="midlife__cell midlife__snapshot" data-midlife-card="snapshot">
        <span className="midlife__eyebrow">MIDLIFE · 초진</span>
        <div className="midlife__snapshotHead">
          <div>
            <p className="midlife__headline">{headline}</p>
            <p className="midlife__muted">
              가장 힘든 문제: {label('MID_13', m.patient_priority_1)} · 일상 기능 방해 {scoreText(m.function_interference_0_10)}
            </p>
          </div>
          <span className={`midlife__chip midlife__tone--${safetyTone}`} data-midlife-safety-chip={safety.status}>
            {safetyChip}
          </span>
        </div>
        {(safety.urgentReasons.length > 0 || safety.priorityReasons.length > 0) && (
          <p className="midlife__muted" data-midlife-safety-reasons>
            {[
              ...safety.urgentReasons.map((r) => MIDLIFE_URGENT_REASON_LABEL[r]),
              ...safety.priorityReasons.map((r) => MIDLIFE_PRIORITY_REASON_LABEL[r]),
            ].join(' · ')}
          </p>
        )}
        {unresolved.topWarning && (
          <p className="midlife__alert midlife__alert--urgent" role="alert" data-midlife-alert="urgent-unresolved">
            긴급 외부평가 미해결 {unresolved.urgentUnresolved}건 — 일반 care plan보다 먼저 정리하세요.
          </p>
        )}
        {unresolved.needsCleanup && (
          <p className="midlife__alert midlife__alert--cleanup" data-midlife-alert="cleanup">
            비긴급 미해결 {unresolved.nonUrgentUnresolved}건 — 새 치료 변경 전에 정리가 필요합니다.
          </p>
        )}
        {reopen && (
          <p className="midlife__alert midlife__alert--reopen" data-midlife-alert="reopen">
            경과가 연속 2회 예상과 달랐습니다 — 진단 가설을 다시 검토하세요.
          </p>
        )}
      </div>

      <div className="midlife__grid">
        {/* ---------- 좌측 ---------- */}
        <div className="midlife__col">
          <div className="midlife__cell" data-midlife-card="life-stage">
            <span className="midlife__cellTitle">LIFE STAGE</span>
            <span className="midlife__cellSub">지금 어느 전환 단계인가?</span>
            <dl className="midlife__facts">
              <dt>마지막 월경</dt>
              <dd>{label('MID_02', m.last_menstrual_period)}</dd>
              <dt>최근 12개월</dt>
              <dd>{label('MID_01', m.cycle_change)}</dd>
              <dt>호르몬치료/피임</dt>
              <dd>{label('MID_03', m.hormone_or_contraception_use)}</dd>
              <dt>임신·수유 등</dt>
              <dd>{label('WOMEN_SAFETY_01', reproductive)}</dd>
            </dl>
            <label className="midlife__field midlife__field--inline">
              <span>원장 판단</span>
              <select
                value={value.lifeStage}
                onChange={(e) => set({ lifeStage: e.target.value as MidlifeLifeStage })}
                aria-label="생애단계(원장 판단)"
              >
                {MIDLIFE_LIFE_STAGES.map((s) => (
                  <option key={s} value={s}>
                    {MIDLIFE_LIFE_STAGE_LABEL[s]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="midlife__cell" data-midlife-card="top-symptoms">
            <span className="midlife__cellTitle">TOP SYMPTOMS</span>
            <span className="midlife__cellSub">환자가 가장 바꾸고 싶은 것</span>
            <dl className="midlife__facts">
              <dt>1순위</dt>
              <dd>{label('MID_13', m.patient_priority_1)}</dd>
              <dt>2순위</dt>
              <dd>{label('MID_14', m.patient_priority_2)}</dd>
              <dt>가장 불편(최대 2)</dt>
              <dd>{label('MID_04', m.top_symptoms)}</dd>
              <dt>기존 진료</dt>
              <dd>{label('MID_10', m.recent_provider_use)}</dd>
              <dt>최근 검사</dt>
              <dd>{label('MID_11', m.existing_test_results)}</dd>
            </dl>
          </div>

          <div className="midlife__cell" data-midlife-card="baseline-pro">
            <span className="midlife__cellTitle">BASELINE PRO</span>
            <span className="midlife__cellSub">이번 치료의 고정 기준 — 환자 입력값만(원장 재입력 없음)</span>
            <table className="midlife__pro">
              <thead>
                <tr>
                  <th scope="col">항목</th>
                  <th scope="col">초진</th>
                  {reports.map((r) => {
                    const h = reportHeading(r.createdAt, baselineMs)
                    return (
                      <th scope="col" key={r.visitId} data-midlife-report={r.visitId}>
                        {h.date}
                        {h.weeks && <span className="midlife__weeks">{h.weeks}</span>}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {PRO_ROWS.map((row) => (
                  <tr key={row.reportKey}>
                    <th scope="row">{row.title}</th>
                    <td data-midlife-baseline={row.reportKey}>{scoreText(m[row.moduleField])}</td>
                    {reports.map((r) => (
                      <td key={r.visitId}>{scoreText(r[row.reportKey])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {reports.length === 0 && (
              <p className="midlife__muted" data-midlife-pro-empty>
                재진 링크에서 환자가 다시 답하면 여기에 날짜별로 자동으로 쌓입니다.
              </p>
            )}
          </div>
        </div>

        {/* ---------- 우측 ---------- */}
        <div className="midlife__col">
          <div className="midlife__cell" data-midlife-card="hypothesis">
            <span className="midlife__cellTitle">DIAGNOSTIC HYPOTHESIS</span>
            <span className="midlife__cellSub">현재 가장 가능성이 높은 설명</span>
            {reopen && <p className="midlife__badge midlife__badge--reopen">재검토(reopen)</p>}
            <textarea
              aria-label="진단 가설"
              rows={2}
              value={value.hypothesis}
              onChange={(e) => set({ hypothesis: e.target.value })}
            />
          </div>

          <div className="midlife__cell" data-midlife-card="refutation">
            <span className="midlife__cellTitle midlife__cellTitle--warn">REFUTATION TRIGGER</span>
            <span className="midlife__cellSub">이 설명을 다시 열어야 하는 조건</span>
            <textarea
              aria-label="반증 trigger"
              rows={2}
              placeholder="이 소견이 나오면 가설을 버린다"
              value={value.refutationTrigger}
              onChange={(e) => set({ refutationTrigger: e.target.value })}
            />
          </div>

          <div className="midlife__cell" data-midlife-card="referral">
            <span className="midlife__cellTitle">REFERRAL / UNRESOLVED</span>
            <span className="midlife__cellSub">외부평가와 미해결 항목</span>
            {value.referrals.length === 0 && <p className="midlife__muted">기록된 외부평가 없음</p>}
            <ul className="midlife__referrals">
              {value.referrals.map((r) => (
                <li
                  key={r.id}
                  className={isReferralUnresolved(r) ? 'midlife__referral midlife__referral--open' : 'midlife__referral'}
                  data-midlife-referral={r.status}
                >
                  <input
                    aria-label="외부평가 내용"
                    placeholder="예: 자궁내막 평가 의뢰"
                    value={r.label}
                    onChange={(e) => updateReferral(r.id, { label: e.target.value })}
                  />
                  <select
                    aria-label="긴급도"
                    value={r.urgency}
                    onChange={(e) => updateReferral(r.id, { urgency: e.target.value as MidlifeReferral['urgency'] })}
                  >
                    <option value="non_urgent">비긴급</option>
                    <option value="urgent">긴급</option>
                  </select>
                  <select
                    aria-label="진행 상태"
                    value={r.status}
                    onChange={(e) => updateReferral(r.id, { status: e.target.value as MidlifeReferral['status'] })}
                  >
                    {MIDLIFE_REFERRAL_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {MIDLIFE_REFERRAL_STATUS_LABEL[s]}
                      </option>
                    ))}
                  </select>
                  <input
                    aria-label="외부평가 메모"
                    placeholder="메모"
                    value={r.note}
                    onChange={(e) => updateReferral(r.id, { note: e.target.value })}
                  />
                  <button
                    type="button"
                    className="midlife__remove"
                    onClick={() => set({ referrals: value.referrals.filter((x) => x.id !== r.id) })}
                  >
                    삭제
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="midlife__add"
              onClick={() => set({ referrals: [...value.referrals, newMidlifeReferral(newReferralId())] })}
            >
              + 외부평가 추가
            </button>
          </div>

          <div className="midlife__cell" data-midlife-card="care-plan">
            <span className="midlife__cellTitle">CARE PLAN / NEXT REVIEW</span>
            <span className="midlife__cellSub">이번 4주 무엇을 맡고 언제 다시 볼까?</span>
            <dl className="midlife__facts">
              <dt>4주 목표</dt>
              <dd data-midlife-goal-summary>{goals.length > 0 ? goals.map((g) => g.label).join(' + ') : '미정'}</dd>
            </dl>
            <details className="midlife__disclosure" open={goalPickerOpen}>
              <summary>
                4주 목표 고르기 <span className="midlife__muted">(최대 {MIDLIFE_CARE_GOAL_MAX}개 · 다음 재진 확인 항목으로 이어짐)</span>
              </summary>
              <div className="midlife__goals" role="group" aria-label="4주 목표" data-midlife-goals>
                {midlifeGoalOptions().map((g) => {
                  const on = goalIds.has(g.id)
                  return (
                    <button
                      key={g.id}
                      type="button"
                      aria-pressed={on}
                      disabled={!onChangeFollowUpTargets || (!on && goalsFull)}
                      onClick={() => onChangeFollowUpTargets?.(toggleMidlifeGoal(followUpTargets, g))}
                    >
                      {g.label}
                    </button>
                  )
                })}
              </div>
            </details>
            <dl className="midlife__facts">
              <dt>2주 확인</dt>
              <dd>악화 · 안전 · 순응</dd>
              <dt>4주 재평가</dt>
              <dd>PRO + 외부결과</dd>
            </dl>
            <label className="midlife__field">
              <span>예상 경과</span>
              <input
                aria-label="예상 경과"
                placeholder="예: 2–4주 내 새벽 각성 빈도 감소 예상"
                value={value.expectedCourse}
                onChange={(e) => set({ expectedCourse: e.target.value })}
              />
            </label>
            <label className="midlife__field">
              <span>다음 review</span>
              <select
                aria-label="다음 review 주차"
                value={value.nextReviewWeek ?? ''}
                onChange={(e) =>
                  set({ nextReviewWeek: e.target.value === '' ? null : (Number(e.target.value) as MidlifeReviewWeek) })
                }
              >
                <option value="">미정</option>
                {MIDLIFE_REVIEW_WEEKS.map((w) => (
                  <option key={w} value={w}>
                    {w}주
                  </option>
                ))}
              </select>
            </label>

            {/* 경과 기록(원장 판단만): 주차별 "예상 대비" 판정 -- 연속 2회 이탈이면 가설 재검토. */}
            <details className="midlife__disclosure" open={courseOpen} data-midlife-course-details>
              <summary>
                경과 기록 <span className="midlife__muted">{courseSummary}</span>
              </summary>
              <table className="midlife__pro midlife__course" data-midlife-course>
                <thead>
                  <tr>
                    <th scope="col">경과</th>
                    {MIDLIFE_REVIEW_WEEKS.map((w) => (
                      <th scope="col" key={w}>
                        {w}주
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th scope="row">예상 대비</th>
                    {MIDLIFE_REVIEW_WEEKS.map((w) => {
                      const c = reviewFor(w).courseVsExpected
                      return <td key={w}>{c ? MIDLIFE_COURSE_LABEL[c] : '—'}</td>
                    })}
                  </tr>
                </tbody>
              </table>
              <div className="midlife__weekBar">
                <div className="midlife__weekTabs" role="group" aria-label="기록할 review 주차">
                  {MIDLIFE_REVIEW_WEEKS.map((w) => (
                    <button key={w} type="button" aria-pressed={w === activeWeek} onClick={() => setActiveWeek(w)}>
                      {w}주 기록
                    </button>
                  ))}
                </div>
                <input
                  type="date"
                  aria-label={`${activeWeek}주 기록일`}
                  value={active.reviewedOn}
                  onChange={(e) => updateReview(activeWeek, { reviewedOn: e.target.value })}
                />
                <select
                  aria-label={`${activeWeek}주 경과`}
                  value={active.courseVsExpected ?? ''}
                  onChange={(e) =>
                    updateReview(activeWeek, {
                      courseVsExpected: e.target.value === '' ? null : (e.target.value as MidlifeCourseVsExpected),
                    })
                  }
                >
                  <option value="">경과 —</option>
                  {MIDLIFE_COURSE_VALUES.map((c) => (
                    <option key={c} value={c}>
                      {MIDLIFE_COURSE_LABEL[c]}
                    </option>
                  ))}
                </select>
              </div>
            </details>
            {value.expectedCourse.trim() === '' && value.reviews.some((r) => r.courseVsExpected !== null) && (
              <p className="midlife__muted">예상 경과가 비어 있어 "예상 대비" 판정의 기준이 기록되지 않았습니다.</p>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
