/**
 * CRM v0.3.1 — task state transitions, dedup/idempotency, and queue
 * ordering. Pure functions only; every mutator returns a new object
 * rather than mutating its input, so a caller whose persistence step
 * fails never has a half-applied change to reconcile.
 */
import type { CrmTask, CrmTaskType, CrmTaskStatus, CrmReasonCode, ContactMode } from './types.ts'

const RAW_PHONE_PATTERN = /(?:\+?82[-\s]?)?0?1[016789][-\s]?\d{3,4}[-\s]?\d{4}/

/** Refuses any value shaped like a Korean mobile number — used everywhere a caller-supplied string could end up in a dedup key, log, or fixture. */
export function assertNoRawPhone(value: string, field: string): void {
  if (RAW_PHONE_PATTERN.test(value)) {
    throw new Error(`refusing to store a raw phone-shaped value in ${field}`)
  }
}

export function computeDedupKey(input: {
  patient_uuid: string
  episode_id: string
  task_type: CrmTaskType
  source_event_id: string
  contactPointKey: string
}): string {
  assertNoRawPhone(input.contactPointKey, 'dedup_key.contactPointKey')
  return [input.patient_uuid, input.episode_id, input.task_type, input.source_event_id, input.contactPointKey].join('|')
}

/**
 * Safety task creation is only legal from an already-approved upstream
 * signal or an explicit human request — CRM itself never decides that
 * something is dangerous. createCrmTask enforces this by requiring one of
 * these whenever task_type is SAFETY_REVIEW.
 */
export type SafetyAuthorization =
  | { kind: 'UPSTREAM_APPROVED_SIGNAL'; sourceType: string; sourceId: string }
  | { kind: 'EXPLICIT_HUMAN_REQUEST'; requestedBy: string }

/** Generic patient-reported discomfort defaults to CLINICAL_REVIEW; only an explicit SafetyAuthorization can produce SAFETY_REVIEW. CRM must never infer danger. */
export function taskTypeForPatientReportedConcern(hasSafetyAuthorization: boolean): CrmTaskType {
  return hasSafetyAuthorization ? 'SAFETY_REVIEW' : 'CLINICAL_REVIEW'
}

export type CreateCrmTaskInput = {
  task_id: string
  patient_uuid: string
  episode_id: string
  task_type: CrmTaskType
  reason_code: CrmReasonCode
  source_type?: string | null
  source_id?: string | null
  source_event_id: string
  source_timestamp?: string | null
  due_at?: string | null
  owner_clinician: string | null
  now: string
  /** A stable, non-PII representation of the intended contact channel (never a raw phone number). Defaults to 'DEFAULT'. */
  contactPointKey?: string
  do_not_contact?: boolean
  safetyAuthorization?: SafetyAuthorization
}

/** Idempotent: a second call with the same dedup-key inputs returns the existing task instead of creating a duplicate. */
export function createCrmTask(
  input: CreateCrmTaskInput,
  existingTasks: CrmTask[],
): { task: CrmTask; deduped: boolean } {
  if (input.task_type === 'SAFETY_REVIEW' && !input.safetyAuthorization) {
    throw new Error('safety_review_requires_authorization')
  }
  const contactPointKey = input.do_not_contact ? 'IN_PERSON_ONLY' : (input.contactPointKey ?? 'DEFAULT')
  const dedup_key = computeDedupKey({
    patient_uuid: input.patient_uuid,
    episode_id: input.episode_id,
    task_type: input.task_type,
    source_event_id: input.source_event_id,
    contactPointKey,
  })
  const existing = existingTasks.find(
    (t) => t.dedup_key === dedup_key && t.status !== 'CANCELLED' && t.status !== 'SUPERSEDED',
  )
  if (existing) return { task: existing, deduped: true }

  const contact_mode: ContactMode = input.do_not_contact ? 'IN_PERSON_ONLY' : 'OUTBOUND_ALLOWED'
  const task: CrmTask = {
    task_id: input.task_id,
    patient_uuid: input.patient_uuid,
    episode_id: input.episode_id,
    task_type: input.task_type,
    reason_code: input.reason_code,
    source_type: input.source_type ?? null,
    source_id: input.source_id ?? null,
    source_event_id: input.source_event_id,
    source_timestamp: input.source_timestamp ?? null,
    created_at: input.now,
    due_at: input.due_at ?? null,
    assigned_to: null,
    owner_clinician: input.owner_clinician,
    status: 'OPEN',
    claimed_by: null,
    claimed_at: null,
    claim_expires_at: null,
    first_seen_at: null,
    acknowledged_at: null,
    resolved_at: null,
    contact_mode,
    dedup_key,
    version: 1,
  }
  return { task, deduped: false }
}

export class CrmConflictError extends Error {
  constructor(taskId: string) {
    super(`stale write rejected for task ${taskId}`)
    this.name = 'CrmConflictError'
  }
}

function checkVersion(task: CrmTask, expectedVersion: number): void {
  if (task.version !== expectedVersion) throw new CrmConflictError(task.task_id)
}

/** A lease, not a permanent lock — releaseExpiredClaim reclaims it after claim_expires_at. */
export function claimTask(task: CrmTask, expectedVersion: number, claimedBy: string, now: string, leaseMs: number): CrmTask {
  checkVersion(task, expectedVersion)
  if (task.status !== 'OPEN' && task.status !== 'SNOOZED') {
    throw new Error(`cannot claim task in status ${task.status}`)
  }
  return {
    ...task,
    status: 'CLAIMED',
    claimed_by: claimedBy,
    claimed_at: now,
    claim_expires_at: new Date(Date.parse(now) + leaseMs).toISOString(),
    acknowledged_at: task.acknowledged_at ?? now,
    version: task.version + 1,
  }
}

/**
 * Records the first actual queue/view exposure, distinct from claiming or
 * acknowledging -- a clinician can see a task in a list well before they
 * claim or acknowledge it, and created_at -> first_seen_at is the latency
 * this exists to measure. Idempotent: once set, a later call preserves
 * the original timestamp rather than overwriting it.
 */
export function markTaskSeen(task: CrmTask, expectedVersion: number, now: string): CrmTask {
  checkVersion(task, expectedVersion)
  if (task.first_seen_at !== null) return task
  return { ...task, first_seen_at: now, version: task.version + 1 }
}

/** No-op unless the claim has actually expired; DONE/OPEN/etc. tasks pass through untouched. */
export function releaseExpiredClaim(task: CrmTask, now: string): CrmTask {
  if (task.status !== 'CLAIMED') return task
  if (!task.claim_expires_at || task.claim_expires_at > now) return task
  return { ...task, status: 'OPEN', claimed_by: null, claimed_at: null, claim_expires_at: null, version: task.version + 1 }
}

export type ActorRole = 'CLINICIAN' | 'STAFF'

/**
 * The version check always runs first, even when the task is already
 * DONE: a stale caller whose expectedVersion no longer matches must see a
 * conflict (someone else changed it since they last read it), not a
 * silent no-op. Only once the version matches does an already-DONE task
 * short-circuit to a harmless no-op -- DONE is immutable, never a second
 * transition.
 */
export function resolveTask(task: CrmTask, expectedVersion: number, actorRole: ActorRole, now: string): CrmTask {
  checkVersion(task, expectedVersion)
  if (task.status === 'DONE') return task
  if (task.task_type === 'SAFETY_REVIEW' && actorRole !== 'CLINICIAN') {
    throw new Error('safety_review_resolution_requires_clinician')
  }
  return { ...task, status: 'DONE', resolved_at: now, version: task.version + 1 }
}

/**
 * Wraps resolveTask with the "failed save must not display DONE" rule:
 * the returned promise rejects before ever handing back a DONE task if
 * persist() throws, so a caller that only updates its own store on a
 * resolved promise can never show DONE for an unsaved change.
 */
export async function resolveTaskWithPersistence(
  task: CrmTask,
  expectedVersion: number,
  actorRole: ActorRole,
  now: string,
  persist: (updated: CrmTask) => Promise<void>,
): Promise<CrmTask> {
  const updated = resolveTask(task, expectedVersion, actorRole, now)
  await persist(updated)
  return updated
}

/** SAFETY_REVIEW can never be snoozed — it must stay visible in the queue rather than disappearing until a chosen time. */
export function snoozeTask(task: CrmTask, expectedVersion: number, until: string): CrmTask {
  checkVersion(task, expectedVersion)
  if (task.task_type === 'SAFETY_REVIEW') {
    throw new Error('safety_review_cannot_be_snoozed')
  }
  return { ...task, status: 'SNOOZED', due_at: until, version: task.version + 1 }
}

/**
 * SAFETY_REVIEW can never be cancelled by this generic primitive -- only
 * clinician resolution (resolveTask) may close it. The guard lives here,
 * not just at today's call sites (completeEpisode,
 * supersedeFutureRoutineTasksOnCarePlanChange, recalculateMedicationTasksOnStartShift
 * all happen to filter to ROUTINE first), so a future caller cannot
 * accidentally soft-delete an open Safety task by reaching for this
 * helper directly. Terminal statuses are otherwise left alone rather than
 * re-cancelled, so a batch operation can be applied to a mixed-status list
 * safely.
 */
export function cancelTask(task: CrmTask): CrmTask {
  if (task.task_type === 'SAFETY_REVIEW') {
    throw new Error('safety_review_cannot_be_cancelled')
  }
  if (task.status === 'DONE' || task.status === 'CANCELLED' || task.status === 'SUPERSEDED') return task
  return { ...task, status: 'CANCELLED', version: task.version + 1 }
}

/** Same invariant as cancelTask, for the same reason: SAFETY_REVIEW is refused at the primitive, not left to callers to remember. */
export function supersedeTask(task: CrmTask): CrmTask {
  if (task.task_type === 'SAFETY_REVIEW') {
    throw new Error('safety_review_cannot_be_superseded')
  }
  if (task.status === 'DONE' || task.status === 'CANCELLED' || task.status === 'SUPERSEDED') return task
  return { ...task, status: 'SUPERSEDED', version: task.version + 1 }
}

/** A lookup failure must never resolve, cancel, or supersede a task on its own — it stays exactly as-is for a human or a retry to handle. */
export function onSigmaLookupFailure(task: CrmTask): CrmTask {
  return task
}

const TERMINAL_TASK_STATUSES: ReadonlySet<CrmTaskStatus> = new Set(['DONE', 'CANCELLED', 'SUPERSEDED'])

/**
 * Whether an episode has an open Clinical or Safety review, derived from
 * the tasks themselves rather than a separately persisted flag -- see the
 * comment on Episode in types.ts for why. "Open" means any task of that
 * type in that episode is not yet in a terminal status; OPEN, CLAIMED,
 * IN_PROGRESS and SNOOZED all count as open.
 */
export function isReviewOpen(tasks: CrmTask[], episodeId: string, taskType: 'CLINICAL_REVIEW' | 'SAFETY_REVIEW'): boolean {
  return tasks.some((t) => t.episode_id === episodeId && t.task_type === taskType && !TERMINAL_TASK_STATUSES.has(t.status))
}

export function deriveEpisodeReviewState(
  tasks: CrmTask[],
  episodeId: string,
): { clinical_review_open: boolean; safety_review_open: boolean } {
  return {
    clinical_review_open: isReviewOpen(tasks, episodeId, 'CLINICAL_REVIEW'),
    safety_review_open: isReviewOpen(tasks, episodeId, 'SAFETY_REVIEW'),
  }
}

const TASK_TYPE_PRIORITY: Record<CrmTaskType, number> = { SAFETY_REVIEW: 0, CLINICAL_REVIEW: 1, ROUTINE: 2 }

/** SAFETY > CLINICAL > ROUTINE; within a priority, overdue first, then due_at ascending, then created_at ascending. No SLA duration is hardcoded here — due_at is always caller-supplied. */
export function compareCrmTasksForQueue(a: CrmTask, b: CrmTask, now: string): number {
  const priorityDelta = TASK_TYPE_PRIORITY[a.task_type] - TASK_TYPE_PRIORITY[b.task_type]
  if (priorityDelta !== 0) return priorityDelta
  const overdueA = a.due_at !== null && a.due_at < now
  const overdueB = b.due_at !== null && b.due_at < now
  if (overdueA !== overdueB) return overdueA ? -1 : 1
  const dueA = a.due_at ?? '9999-12-31T23:59:59.999Z'
  const dueB = b.due_at ?? '9999-12-31T23:59:59.999Z'
  if (dueA !== dueB) return dueA < dueB ? -1 : 1
  return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0
}

export function sortCrmTaskQueue(tasks: CrmTask[], now: string): CrmTask[] {
  return [...tasks].sort((a, b) => compareCrmTasksForQueue(a, b, now))
}

/** Falls back to a caller-configured coverage queue identifier when no clinician owns the task yet — never a hardcoded name or schedule. */
export function resolveTaskOwner(task: CrmTask, coverageQueue: string | null): string | null {
  return task.owner_clinician ?? coverageQueue
}

export function tasksForOwner(tasks: CrmTask[], ownerClinician: string, coverageQueue: string | null): CrmTask[] {
  return tasks.filter((t) => resolveTaskOwner(t, coverageQueue) === ownerClinician)
}

export type CommunicationGroup = {
  patient_uuid: string
  contact_mode: ContactMode
  tasks: CrmTask[]
}

/**
 * Communication/outreach orchestration is patient-level, not episode-
 * level: a patient's medication-course task and an unrelated pain-episode
 * task can land in the same contact window and belong in one message, so
 * grouping keys on patient_uuid alone (not episode_id) -- this is a
 * delivery/orchestration view only, it never merges task or Episode
 * identity, and it never marks anything DONE.
 *
 * SAFETY_REVIEW is always excluded and returned separately so it can
 * never be folded into a grouped message or otherwise made to disappear.
 *
 * Groups are additionally split by contact_mode so an outbound message
 * can never be assembled from a mix of OUTBOUND_ALLOWED and
 * IN_PERSON_ONLY tasks -- a do_not_contact task for a patient still
 * groups with that patient's other do_not_contact tasks, just never with
 * their outbound-allowed ones.
 */
export function groupTasksForCommunication(tasks: CrmTask[]): { groups: CommunicationGroup[]; safetyExcluded: CrmTask[] } {
  const safetyExcluded = tasks.filter((t) => t.task_type === 'SAFETY_REVIEW')
  const groupable = tasks.filter((t) => t.task_type !== 'SAFETY_REVIEW')
  const byKey = new Map<string, CommunicationGroup>()
  for (const t of groupable) {
    const key = `${t.patient_uuid}|${t.contact_mode}`
    const existing = byKey.get(key)
    if (existing) {
      existing.tasks.push(t)
    } else {
      byKey.set(key, { patient_uuid: t.patient_uuid, contact_mode: t.contact_mode, tasks: [t] })
    }
  }
  return { groups: Array.from(byKey.values()), safetyExcluded }
}
