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

// 19차 독립 리뷰 LOW-9: `patient_uuid`가 문자열이 아니면 `.length`/
// `.slice`에서 그대로 throw했다 -- 이 컴포넌트는 error boundary 밖에서
// 마운트된다.
function truncateUuid(uuid: unknown): string {
  if (typeof uuid !== 'string') return '확인 필요'
  return uuid.length <= 8 ? uuid : `${uuid.slice(0, 8)}…`
}

function patientLabel(task: CrmTask, identities: Record<string, ResolvedPatientIdentity>): string {
  const identity = typeof task.patient_uuid === 'string' ? identities[task.patient_uuid] : undefined
  if (identity?.resolved) return `${identity.patient_name} · ${identity.sigma_chart_no}`
  return `환자 ${truncateUuid(task.patient_uuid)}`
}

function dueStateLabel(task: CrmTask, nowIso: string): string {
  if (!task.due_at) return ''
  const overdue = task.due_at < nowIso
  const when = new Date(task.due_at).toLocaleString('ko-KR')
  return overdue ? `기한 지남 · ${when}` : `기한 ${when}`
}

/**
 * 18차 독립 리뷰 LOW-8: 이 컴포넌트는 서버가 검증 없이 그대로 보내는
 * CrmTask 필드를 그대로 신뢰했다 -- `task.task_type`이 문자열이 아니면
 * `.toLowerCase()`에서 그대로 throw했고(listCrmTasks가 `tasks` 배열
 * 자체는 이제 검증하지만 개별 필드까지는 검증하지 않는다), 알려지지
 * 않은 task_type/reason_code/status는 label map에서 undefined가 되어
 * bare JSX child로는 조용히 빈 칸을 렌더했다(리터럴 "undefined"는
 * 아니지만, 손상된 값을 조용히 숨기는 것도 이 배치가 막으려는
 * fail-silent다).
 */
function isValidTaskType(v: unknown): v is CrmTask['task_type'] {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(CRM_TASK_TYPE_LABEL, v)
}
function isValidReasonCode(v: unknown): v is CrmTask['reason_code'] {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(CRM_REASON_CODE_LABEL, v)
}
function isValidTaskStatus(v: unknown): v is CrmTask['status'] {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(CRM_TASK_STATUS_LABEL, v)
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
              className={`doctorField doctor__todayQueue__row doctor__todayQueue__row--${
                isValidTaskType(task.task_type) ? task.task_type.toLowerCase() : 'unknown'
              }`}
              data-patient-uuid={task.patient_uuid}
            >
              <span className="doctorField__label">
                {isValidTaskType(task.task_type) ? CRM_TASK_TYPE_LABEL[task.task_type] : '확인 필요'} ·{' '}
                {isValidReasonCode(task.reason_code) ? CRM_REASON_CODE_LABEL[task.reason_code] : '확인 필요'}
              </span>
              <span className="doctorField__value">
                {isValidTaskStatus(task.status) ? CRM_TASK_STATUS_LABEL[task.status] : '확인 필요'}
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
