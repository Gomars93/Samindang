/**
 * P1 (Core Reduction Phase 6 gate / Phase 5 Synthesis §2.3): the unified
 * "오늘" Queue -- replaces the three separate 제출목록/재진 목록/CRM Today
 * Queue sections with ONE list. UI SYNTHESIS ONLY: the three backend
 * sources (server/store.js submissions, visitStore.js revisit visits,
 * crmStore.js tasks) are untouched, still fetched by DoctorView.tsx's own
 * three separate polls -- this component only renders the already-merged
 * row order src/doctor/todayQueue.ts's buildTodayQueueRows() computed.
 *
 * Click handling stays split by row kind (submission/revisit) exactly as
 * before -- CRM rows are never clickable, matching TodayQueueSection's own
 * long-standing "purely presentational" contract, which this component
 * inherits rather than reopening.
 */
import type { TodayQueueRow } from './todayQueue'
import { TODAY_QUEUE_BADGE_LABEL } from './todayQueue'
import type { SubmissionSummary, ResolvedPatientIdentity } from '../lib/serverClient'
import type { CrmTask } from '../crm/types'
import { REVISIT_STATUS_LABEL, DELIVERY_MODE_LABEL, INPUT_PROVENANCE_LABEL, type RevisitQueueItem } from './workspace/followUpSession'
import { PatientIdentityLinkAction } from './PatientIdentityLinkAction'
import { formatTimestamp, relativeTime } from './DoctorView'

function safeStringOrFallback(value: unknown): string {
  return typeof value === 'string' ? value : '확인 필요'
}

function BadgeChip({ badge }: { badge: TodayQueueRow['badge'] }) {
  return (
    <span className={`doctor__todayQueue__badge doctor__todayQueue__badge--${badge.toLowerCase()}`}>
      {TODAY_QUEUE_BADGE_LABEL[badge]}
    </span>
  )
}

function FreshnessNotice({
  label,
  lastGoodAt,
  onRetry,
}: {
  label: string
  lastGoodAt: string | null
  onRetry: () => void
}) {
  return (
    <p className="doctor__todayQueue__stale" role="status">
      ⟳ {label} 갱신 실패 · 마지막 확인 {lastGoodAt ? new Date(lastGoodAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '없음'}
      <button type="button" className="doctor__todayQueue__staleRetry" onClick={onRetry}>
        다시 시도
      </button>
    </p>
  )
}

function SubmissionRowDetail({
  row,
  source,
  isUnreadReady,
}: {
  row: TodayQueueRow
  source: SubmissionSummary | undefined
  isUnreadReady: boolean
}) {
  return (
    <>
      {row.needsAttention && <span className="doctor__todayQueue__needsAttention">⚠ 추가 확인 필요</span>}
      <span className="doctorField__value">
        {isUnreadReady && <span className="doctor__newDot doctor__newDot--ready" aria-hidden="true" />}
        {relativeTime(row.timeIso)} ({formatTimestamp(row.timeIso)}) [문진]
        {source?.recorder_ready && <span className="doctor__emrReadyBadge">✓ EMR 복사 준비됨</span>}
      </span>
    </>
  )
}

function RevisitRowDetail({ row, source }: { row: TodayQueueRow; source: RevisitQueueItem | undefined }) {
  return (
    <>
      {row.needsAttention && <span className="doctor__todayQueue__needsAttention">⚠ 추가 확인 필요</span>}
      <span className="doctorField__value">
        {relativeTime(row.timeIso)} ({formatTimestamp(row.timeIso)}) [재진]
        {source && ` · ${REVISIT_STATUS_LABEL[source.status]}`}
        {source?.deliveryMode &&
          Object.prototype.hasOwnProperty.call(DELIVERY_MODE_LABEL, source.deliveryMode) &&
          ` · ${DELIVERY_MODE_LABEL[source.deliveryMode]}`}
        {source?.stationName && ` · ${source.stationName}`}
        {source?.inputProvenance === 'STAFF_ASSISTED' && ` · ${INPUT_PROVENANCE_LABEL.STAFF_ASSISTED}`}
      </span>
      <p className="doctor__todayQueue__reasonNote">{row.reasonNote}</p>
    </>
  )
}

function CrmRowDetail({ row, tasks }: { row: TodayQueueRow; tasks: CrmTask[] }) {
  return (
    <>
      <span className="doctorField__value">
        {relativeTime(row.timeIso)} ({formatTimestamp(row.timeIso)}) [연락·확인]
        {tasks.length > 1 && ` · ${tasks.length}건`}
        {tasks.length === 1 && tasks[0] && ` · ${tasks[0].task_type} · ${tasks[0].reason_code} · ${tasks[0].status}`}
      </span>
      {tasks.length > 1 && (
        <details className="doctor__todayQueue__crmExpand">
          <summary>{tasks.length}건 펼치기</summary>
          <ul>
            {tasks.map((t) => (
              <li key={t.task_id}>
                {t.task_type} · {t.reason_code} · {t.status}
                {t.due_at && ` · ${formatTimestamp(t.due_at)}`}
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  )
}

export function TodayUnifiedQueueSection({
  rows,
  submissionsById,
  revisitsByVisitId,
  crmTasksByPatient,
  onOpenSubmission,
  onOpenRevisit,
  onIdentityLinked,
  submissionsFreshness,
  revisitsFreshness,
  crmFreshness,
  crmLoading,
  listLoading,
  unreadReadyIds,
}: {
  rows: TodayQueueRow[]
  submissionsById: Map<string, SubmissionSummary>
  revisitsByVisitId: Map<string, RevisitQueueItem>
  crmTasksByPatient: Map<string, CrmTask[]>
  onOpenSubmission: (id: string) => void
  onOpenRevisit: (visitId: string, patientId: string) => void
  onIdentityLinked: (patientUuid: string, identity: ResolvedPatientIdentity) => void
  submissionsFreshness: { failed: boolean; lastGoodAt: string | null; onRetry: () => void }
  revisitsFreshness: { failed: boolean; lastGoodAt: string | null; onRetry: () => void }
  crmFreshness: { failed: boolean; lastGoodAt: string | null; onRetry: () => void }
  crmLoading: boolean
  /** True while the submissions list has never resolved yet -- same "불러오는 중" gate the old 제출목록 section used. */
  listLoading: boolean
  /** Submission ids whose EMR-ready result arrived since the clinician last looked at the list -- same dot the old 제출목록 section rendered. */
  unreadReadyIds: Set<string>
}) {
  const active = rows.filter((r) => !r.completed)
  const completed = rows.filter((r) => r.completed)

  function renderRow(row: TodayQueueRow) {
    // Reuses TodayQueueSection's own row class (`.doctor__todayQueue__row`)
    // -- this list absorbed that section, and tests/patient-identity-
    // link-e2e.spec.mjs's real-browser selectors target this exact class
    // to find an unresolved row's PatientIdentityLinkAction.
    const rowClass = `doctorField doctor__row doctor__todayQueue__row${row.needsAttention ? ' doctor__row--new' : ''}`
    if (row.kind === 'submission') {
      const source = row.submissionId ? submissionsById.get(row.submissionId) : undefined
      return (
        <div key={row.key} className={rowClass}>
          <button
            type="button"
            className="doctor__revisitRow__openBtn"
            onClick={() => row.submissionId && onOpenSubmission(row.submissionId)}
          >
            <span className="doctorField__label">
              <BadgeChip badge={row.badge} /> {safeStringOrFallback(row.displayName)}
            </span>
            <SubmissionRowDetail row={row} source={source} isUnreadReady={row.submissionId ? unreadReadyIds.has(row.submissionId) : false} />
          </button>
        </div>
      )
    }
    if (row.kind === 'revisit') {
      const source = row.revisitVisitId ? revisitsByVisitId.get(row.revisitVisitId) : undefined
      return (
        <div key={row.key} className={rowClass}>
          <button
            type="button"
            className="doctor__revisitRow__openBtn"
            onClick={() => row.revisitVisitId && row.revisitPatientId && onOpenRevisit(row.revisitVisitId, row.revisitPatientId)}
          >
            <span className="doctorField__label">
              <BadgeChip badge={row.badge} /> {safeStringOrFallback(row.displayName)}
              {row.chartNo && ` · ${row.chartNo}`}
            </span>
            <RevisitRowDetail row={row} source={source} />
          </button>
          {row.identityUnresolved && row.patientUuidForIdentityLink && (
            <PatientIdentityLinkAction patientUuid={row.patientUuidForIdentityLink} onLinked={onIdentityLinked} />
          )}
        </div>
      )
    }
    // crm -- structure mirrors the absorbed TodayQueueSection's own row
    // (label = badge + 이유, value = task detail, a SEPARATE muted value =
    // resolved identity or "신원 확인 필요") rather than folding identity
    // into the label, so the identity display keeps the exact
    // `.doctorField__value--muted` shape tests/patient-identity-link-
    // e2e.spec.mjs's real-browser assertions already target.
    const tasks = row.crmPatientUuid ? crmTasksByPatient.get(row.crmPatientUuid) ?? [] : []
    return (
      <div key={row.key} className={rowClass} data-patient-uuid={row.crmPatientUuid}>
        <span className="doctorField__label">
          <BadgeChip badge={row.badge} /> {row.reason}
        </span>
        <CrmRowDetail row={row} tasks={tasks} />
        <span className="doctorField__value doctorField__value--muted">
          {safeStringOrFallback(row.displayName)}
          {row.chartNo && ` · ${row.chartNo}`}
        </span>
        {row.identityUnresolved && row.patientUuidForIdentityLink && (
          <PatientIdentityLinkAction patientUuid={row.patientUuidForIdentityLink} onLinked={onIdentityLinked} />
        )}
      </div>
    )
  }

  return (
    <section className="doctor__section doctor__todayQueue doctor__todayQueue--unified">
      <h2>오늘 ({active.length})</h2>

      {submissionsFreshness.failed && (
        <FreshnessNotice label="문진 목록" lastGoodAt={submissionsFreshness.lastGoodAt} onRetry={submissionsFreshness.onRetry} />
      )}
      {revisitsFreshness.failed && (
        <FreshnessNotice label="재진 목록" lastGoodAt={revisitsFreshness.lastGoodAt} onRetry={revisitsFreshness.onRetry} />
      )}
      {crmFreshness.failed && <FreshnessNotice label="CRM 목록" lastGoodAt={crmFreshness.lastGoodAt} onRetry={crmFreshness.onRetry} />}

      {(crmLoading || listLoading) && active.length === 0 ? (
        <p className="doctor__empty">불러오는 중…</p>
      ) : active.length === 0 ? (
        <p className="doctor__empty">지금 확인할 항목이 없습니다.</p>
      ) : (
        <div className="doctor__grid doctor__todayQueue__grid">{active.map(renderRow)}</div>
      )}

      {completed.length > 0 && (
        <details className="doctor__todayQueue__completed">
          <summary>완료 ({completed.length})</summary>
          <div className="doctor__grid doctor__todayQueue__grid">{completed.map(renderRow)}</div>
        </details>
      )}
    </section>
  )
}
