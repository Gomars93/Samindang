/**
 * Midlife v0.2 Doctor View — 한 화면 7칸 (`docs/MIDLIFE_UI_IA_v0.2.md` §5).
 *
 *   상단 Clinical Snapshot : 생애단계 · 주요 증상 · 안전 · 미해결/재검토 경고
 *   좌측                  : ① Life-stage  ② Top 2 증상/환자 목표  ⑦ Baseline PRO + review
 *   우측                  : ④ 진단 가설  ⑤ 반증 trigger  ⑥ 외부평가/미해결  ⑦ 다음 review
 *   ③ Safety              : 스냅샷 맨 앞(레인1 `MidlifeSafetyPanel`과 같은 계산)
 *
 * 환자 응답 칸은 읽기 전용, 원장 칸은 전부 직접 입력이다. 자동 진단·점수·
 * 추천 문구를 만들지 않는다. 파생 표시는 `midlifeCare.ts`의 두 규칙
 * (미해결 경고, 연속 2회 이탈 → 가설 재검토)과 안전 판정뿐이다.
 */
import { useState } from 'react'
import { answerLabel } from '../labels'
import type { DoctorPayload } from '../types'
import { toMidlifeStateFromDoctorPayload } from '../../spec/midlifeAdapter'
import { computeMidlifeSafety, MIDLIFE_PRIORITY_REASON_LABEL, MIDLIFE_URGENT_REASON_LABEL } from '../../spec/midlifeLogic'
import {
  MIDLIFE_COURSE_LABEL,
  MIDLIFE_COURSE_VALUES,
  MIDLIFE_LIFE_STAGES,
  MIDLIFE_LIFE_STAGE_LABEL,
  MIDLIFE_REFERRAL_STATUSES,
  MIDLIFE_REFERRAL_STATUS_LABEL,
  MIDLIFE_REVIEW_WEEKS,
  emptyMidlifeReview,
  isReferralUnresolved,
  midlifeHypothesisReopen,
  midlifeUnresolvedSummary,
  newMidlifeReferral,
  normalizeReviews,
  sanitizeScore,
  type MidlifeCareRecord,
  type MidlifeCourseVsExpected,
  type MidlifeLifeStage,
  type MidlifePro,
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

const PRO_ROWS: { key: keyof MidlifePro; title: string; moduleField: string }[] = [
  { key: 'primarySymptom', title: '주 증상', moduleField: 'primary_symptom_0_10' },
  { key: 'sleepSatisfaction', title: '수면 만족', moduleField: 'sleep_satisfaction_0_10' },
  { key: 'functionInterference', title: '일상 지장', moduleField: 'function_interference_0_10' },
]

function newReferralId(): string {
  return `mlref-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

export function MidlifeCarePanel({
  payload,
  value,
  onChange,
}: {
  payload: DoctorPayload
  value: MidlifeCareRecord
  onChange: (next: MidlifeCareRecord) => void
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

  const safetyTone =
    safety.status === 'URGENT_REVIEW' ? 'urgent' : safety.status === 'CLEAR' ? 'clear' : safety.status === 'INCOMPLETE' ? 'unknown' : 'priority'

  return (
    <section className="workspace__block midlife" aria-labelledby="midlife-h3" data-midlife-panel>
      <h3 id="midlife-h3">갱년기 진료 요약</h3>

      {/* ---------- 상단 Clinical Snapshot ---------- */}
      <div className="midlife__snapshot" data-midlife-snapshot>
        <div className={`midlife__cell midlife__cell--safety midlife__tone--${safetyTone}`} data-midlife-cell="3">
          <span className="midlife__cellTitle">③ 안전</span>
          <strong>
            {safety.status === 'URGENT_REVIEW'
              ? 'URGENT'
              : safety.status === 'PRIORITY_EVALUATION'
                ? '우선 외부평가'
                : safety.status === 'CLEAR'
                  ? '안전'
                  : '계산 불가'}
          </strong>
          {(safety.urgentReasons.length > 0 || safety.priorityReasons.length > 0) && (
            <span className="midlife__muted">
              {[
                ...safety.urgentReasons.map((r) => MIDLIFE_URGENT_REASON_LABEL[r]),
                ...safety.priorityReasons.map((r) => MIDLIFE_PRIORITY_REASON_LABEL[r]),
              ].join(' · ')}
            </span>
          )}
        </div>
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
          <div className="midlife__cell" data-midlife-cell="1">
            <span className="midlife__cellTitle">① 생애단계</span>
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
            <dl className="midlife__facts">
              <dt>월경 변화(12개월)</dt>
              <dd>{label('MID_01', m.cycle_change)}</dd>
              <dt>마지막 월경</dt>
              <dd>{label('MID_02', m.last_menstrual_period)}</dd>
              <dt>호르몬제·피임</dt>
              <dd>{label('MID_03', m.hormone_or_contraception_use)}</dd>
              <dt>임신·수유 등</dt>
              <dd>{label('WOMEN_SAFETY_01', reproductive)}</dd>
            </dl>
          </div>

          <div className="midlife__cell" data-midlife-cell="2">
            <span className="midlife__cellTitle">② 주요 증상 · 환자 목표</span>
            <dl className="midlife__facts">
              <dt>가장 불편(최대 2)</dt>
              <dd>{label('MID_04', m.top_symptoms)}</dd>
              <dt>목표 1</dt>
              <dd>{label('MID_13', m.patient_priority_1)}</dd>
              <dt>목표 2</dt>
              <dd>{label('MID_14', m.patient_priority_2)}</dd>
              <dt>기존 진료</dt>
              <dd>{label('MID_10', m.recent_provider_use)}</dd>
              <dt>최근 검사</dt>
              <dd>{label('MID_11', m.existing_test_results)}</dd>
            </dl>
          </div>

          <div className="midlife__cell" data-midlife-cell="7">
            <span className="midlife__cellTitle">⑦ Baseline PRO · 주차 review</span>
            {/* 읽기 표: 초진(태블릿) + 기록된 주차를 숫자로만 -- 좁은 칸에서도 한 화면에 든다. */}
            <table className="midlife__pro">
              <thead>
                <tr>
                  <th scope="col">항목</th>
                  <th scope="col">초진</th>
                  {MIDLIFE_REVIEW_WEEKS.map((w) => (
                    <th scope="col" key={w}>
                      {w}주
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PRO_ROWS.map((row) => (
                  <tr key={row.key}>
                    <th scope="row">{row.title}</th>
                    <td data-midlife-baseline={row.key}>{scoreText(m[row.moduleField])}</td>
                    {MIDLIFE_REVIEW_WEEKS.map((w) => (
                      <td key={w}>{scoreText(reviewFor(w).pro[row.key])}</td>
                    ))}
                  </tr>
                ))}
                <tr>
                  <th scope="row">경과</th>
                  <td>—</td>
                  {MIDLIFE_REVIEW_WEEKS.map((w) => {
                    const c = reviewFor(w).courseVsExpected
                    return <td key={w}>{c ? MIDLIFE_COURSE_LABEL[c] : '—'}</td>
                  })}
                </tr>
              </tbody>
            </table>

            {/* 입력: 한 번에 한 주차만 -- 네 주차 × 다섯 칸을 한꺼번에 펼치면 한 화면을 넘는다. */}
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
            </div>
            <div className="midlife__reviewEdit" data-midlife-review-week={activeWeek}>
              {PRO_ROWS.map((row) => (
                <label key={row.key} className="midlife__field">
                  <span>{row.title}</span>
                  <select
                    aria-label={`${activeWeek}주 ${row.title}`}
                    value={active.pro[row.key] ?? ''}
                    onChange={(e) =>
                      updateReview(activeWeek, {
                        pro: { ...active.pro, [row.key]: e.target.value === '' ? null : Number(e.target.value) },
                      })
                    }
                  >
                    <option value="">—</option>
                    {Array.from({ length: 11 }, (_, i) => (
                      <option key={i} value={i}>
                        {i}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              <label className="midlife__field">
                <span>경과</span>
                <select
                  aria-label={`${activeWeek}주 경과`}
                  value={active.courseVsExpected ?? ''}
                  onChange={(e) =>
                    updateReview(activeWeek, {
                      courseVsExpected: e.target.value === '' ? null : (e.target.value as MidlifeCourseVsExpected),
                    })
                  }
                >
                  <option value="">—</option>
                  {MIDLIFE_COURSE_VALUES.map((c) => (
                    <option key={c} value={c}>
                      {MIDLIFE_COURSE_LABEL[c]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        </div>

        {/* ---------- 우측 ---------- */}
        <div className="midlife__col">
          <div className="midlife__cell" data-midlife-cell="4">
            <span className="midlife__cellTitle">④ 진단 가설</span>
            {reopen && <p className="midlife__badge midlife__badge--reopen">재검토(reopen)</p>}
            <textarea
              aria-label="진단 가설"
              rows={2}
              value={value.hypothesis}
              onChange={(e) => set({ hypothesis: e.target.value })}
            />
          </div>

          <div className="midlife__cell" data-midlife-cell="5">
            <span className="midlife__cellTitle">⑤ 반증 trigger</span>
            <textarea
              aria-label="반증 trigger"
              rows={2}
              placeholder="이 소견이 나오면 가설을 버린다"
              value={value.refutationTrigger}
              onChange={(e) => set({ refutationTrigger: e.target.value })}
            />
          </div>

          <div className="midlife__cell" data-midlife-cell="6">
            <span className="midlife__cellTitle">⑥ 외부평가 · 미해결</span>
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

          <div className="midlife__cell" data-midlife-cell="7-next">
            <span className="midlife__cellTitle">⑦ 예상 경과 · 다음 review</span>
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
            {value.expectedCourse.trim() === '' && value.reviews.some((r) => r.courseVsExpected !== null) && (
              <p className="midlife__muted">예상 경과가 비어 있어 "예상 대비" 판정의 기준이 기록되지 않았습니다.</p>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
