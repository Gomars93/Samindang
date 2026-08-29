/**
 * CRM v0.3.1 round 13: read-only "Today Queue" surface. Purely
 * presentational for task data -- no task fetching, no task-action click
 * handlers (resolve/claim/snooze/etc.), no /seen or any other task side
 * effect. Renders tasks in exactly the order the server returned them
 * (sortCrmTaskQueue's own priority order) -- this component never sorts,
 * groups, filters, or otherwise re-derives ordering client-side.
 *
 * `tasks === null` means "no successful fetch yet reflected" (initial state
 * or a failed refetch that the caller explicitly cleared) -- distinct from
 * `tasks === []` ("fetched successfully, queue is empty"), so a stale list
 * from a prior successful fetch can never be shown after an error.
 *
 * Round 14: `identities` (patient_uuid -> resolved Sigma name/chart_no) is
 * an optional enrichment layer, not a second source of truth -- when a
 * patient_uuid is missing from the map, or the map itself is empty, the
 * row falls back to the truncated UUID exactly as round 13 did. No lookup
 * or identity resolution happens in this component; the caller (DoctorView)
 * is responsible for clearing `identities` on a failed fetch so a stale
 * resolved name can never outlive the poll that produced it.
 *
 * Identity Production Batch: an unresolved row also renders
 * PatientIdentityLinkAction, the one explicit, human-confirmed way to
 * create a link (see that file for the actual POST call and its own
 * isolation/no-double-submit guarantees -- this file only threads the
 * `onIdentityLinked` callback through so a successful link can update the
 * caller's `identities` map immediately, without waiting for the next
 * poll).
 */
import type { CrmTask } from '../crm/types'
import type { ResolvedPatientIdentity } from '../lib/serverClient'
import { CRM_TASK_TYPE_LABEL, CRM_REASON_CODE_LABEL, CRM_TASK_STATUS_LABEL } from '../crm/labels'
import { PatientIdentityLinkAction } from './PatientIdentityLinkAction'

export type TodayQueueSectionProps = {
  tasks: CrmTask[] | null
  loading: boolean
  error: string | null
  identities?: Record<string, ResolvedPatientIdentity>
  onIdentityLinked?: (patientUuid: string, identity: ResolvedPatientIdentity) => void
}

function truncateUuid(uuid: string): string {
  return uuid.length <= 8 ? uuid : `${uuid.slice(0, 8)}…`
}

function patientLabel(task: CrmTask, identities: Record<string, ResolvedPatientIdentity>): string {
  const identity = identities[task.patient_uuid]
  if (identity?.resolved) return `${identity.patient_name} · ${identity.sigma_chart_no}`
  return `환자 ${truncateUuid(task.patient_uuid)}`
}

function dueStateLabel(task: CrmTask, nowIso: string): string {
  if (!task.due_at) return ''
  const overdue = task.due_at < nowIso
  const when = new Date(task.due_at).toLocaleString('ko-KR')
  return overdue ? `기한 지남 · ${when}` : `기한 ${when}`
}

export function TodayQueueSection({ tasks, loading, error, identities = {}, onIdentityLinked }: TodayQueueSectionProps) {
  const now = new Date().toISOString()
  return (
    <section className="doctor__section doctor__todayQueue">
      <h2>오늘 할 일 CRM{tasks ? ` (${tasks.length})` : ''}</h2>
      {error ? (
        <p className="doctor__empty doctor__todayQueue__error">CRM 큐를 불러오지 못했습니다: {error}</p>
      ) : loading && !tasks ? (
        <p className="doctor__empty">불러오는 중…</p>
      ) : !tasks || tasks.length === 0 ? (
        <p className="doctor__empty">지금 처리할 CRM 항목이 없습니다.</p>
      ) : (
        <div className="doctor__grid doctor__todayQueue__grid">
          {tasks.map((task) => (
            <div
              key={task.task_id}
              className={`doctorField doctor__todayQueue__row doctor__todayQueue__row--${task.task_type.toLowerCase()}`}
            >
              <span className="doctorField__label">
                {CRM_TASK_TYPE_LABEL[task.task_type]} · {CRM_REASON_CODE_LABEL[task.reason_code]}
              </span>
              <span className="doctorField__value">
                {CRM_TASK_STATUS_LABEL[task.status]}
                {task.claimed_by ? ` · 담당: ${task.claimed_by}` : ''}
                {task.owner_clinician ? ` · 소속: ${task.owner_clinician}` : ''}
                {task.due_at ? ` · ${dueStateLabel(task, now)}` : ''}
              </span>
              <span className="doctorField__value doctorField__value--muted" title={task.patient_uuid}>
                {patientLabel(task, identities)}
              </span>
              {!identities[task.patient_uuid]?.resolved && onIdentityLinked && (
                <PatientIdentityLinkAction
                  patientUuid={task.patient_uuid}
                  onLinked={onIdentityLinked}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
