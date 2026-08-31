/**
 * P1 (Core Reduction Phase 6 gate / Phase 5 Synthesis §2.3): the unified
 * "오늘" Queue. Pure UI SYNTHESIS only -- this merges/sorts three ALREADY-
 * FETCHED client-side lists (submissions/revisits/CRM tasks) into one
 * display order. It never talks to the network, never merges the three
 * BACKEND stores (server/store.js's submissions, visitStore.js's revisit
 * visits, crmStore.js's tasks stay three separate files/routes, unchanged),
 * and never computes or imports any clinical threshold (no
 * src/spec/*Logic.ts/*Adapter.ts import here, ever -- FROZEN).
 *
 * Badge provenance:
 *  - submission rows: `safety_badge`, already derived SERVER-SIDE from
 *    stored values only (server/store.js's deriveSafetyBadge) -- this
 *    module just reads that string, it does not recompute anything.
 *  - revisit/CRM rows: ALWAYS 'NONE' ("▦ 안전 계산 없음") -- neither source
 *    has a questionnaire-derived safety computation at all (a revisit's
 *    Micro Follow-up is a fixed 4-question check-in, not the full safety
 *    questionnaire; a CRM task is operational, not clinical). Asserting a
 *    CLEAR/URGENT/REVIEW badge for either would be inventing a safety
 *    conclusion this codebase never computed -- see Phase 6 Gate B-1.
 *
 * Sort semantics (Phase 5 §2.3: "URGENT → 오늘 예정 → 신규 → 나머지",
 * completed folded): this codebase's only rows with a genuine "scheduled
 * for a date" concept are CRM tasks with a `due_at` -- submissions and
 * revisits are event-driven (a patient submitted / a link was issued), not
 * date-scheduled. "오늘 예정" is therefore interpreted here as "a CRM task
 * whose due_at falls on today's date" (UTC calendar day, same ISO-string
 * comparison convention server/store.js's nextUpdatedAt already uses --
 * no timezone/business-hours logic is invented). This is a documented
 * interpretation of an otherwise-underspecified term, not a clinical
 * judgment call.
 *
 * The sort is a single STABLE pass keyed only on a small integer tier --
 * within a tier, rows keep the RELATIVE order they arrived in from their
 * OWN source. This is what lets a CRM row's position stay governed by
 * `sortCrmTaskQueue()` (server-authoritative, TodayQueueSection's own
 * "never client-side re-sort" invariant) even after interleaving with
 * submission/revisit rows -- two CRM rows in the same tier can never swap
 * places relative to each other here.
 */
import type { SubmissionSummary, ResolvedPatientIdentity } from '../lib/serverClient'
import type { RevisitQueueItem, RevisitResolvedIdentity } from './workspace/followUpSession'
import type { CrmTask } from '../crm/types'

export type TodayQueueBadge = 'URGENT' | 'REVIEW' | 'CLEAR' | 'NONE'

/**
 * Phase 7 §6.1/§6.2 (3중 인코딩, 색-단독 금지): URGENT/CLEAR는 채워진 원
 * 그대로, 확인 필요는 원과 형태가 다른 세모(▲)로 -- 같은 위험도 계열이라도
 * 글리프 모양 자체가 달라야 색맹/저채도 화면에서도 구분된다(Phase 9 QA
 * 발견 #1 후속 수정, VisitSummaryAside.tsx의 LANE1_STATUS_GLYPH와 동일
 * 관례). 스크린리더용 텍스트 라벨("확인 필요")은 항상 함께 표시된다.
 */
export const TODAY_QUEUE_BADGE_LABEL: Record<TodayQueueBadge, string> = {
  URGENT: '🔴 URGENT',
  REVIEW: '🟡▲ 확인 필요',
  CLEAR: '🟢 CLEAR',
  NONE: '▦ 안전 계산 없음',
}

const KNOWN_BADGES = new Set<TodayQueueBadge>(['URGENT', 'REVIEW', 'CLEAR', 'NONE'])

/** Fail-closed for a wrong-typed/unknown wire value -- never silently CLEAR. */
function normalizeSubmissionBadge(v: unknown): TodayQueueBadge {
  return typeof v === 'string' && KNOWN_BADGES.has(v as TodayQueueBadge) ? (v as TodayQueueBadge) : 'REVIEW'
}

export type TodayQueueRowKind = 'submission' | 'revisit' | 'crm'

export type TodayQueueRow = {
  key: string
  kind: TodayQueueRowKind
  badge: TodayQueueBadge
  /** MicroFollowUp/CRM operational "needs a look" flag -- PATIENT_FACT, never a diagnostic/safety classification (same rule as the underlying sources). Mandatory, non-foldable marker when true. */
  needsAttention: boolean
  /** "이유": 새 문진 / 재검 예정 / 연락·확인. */
  reason: string
  /** Fixed accompanying note for a revisit row -- "문진 없음 — 안전 계산 없음" (never omitted, never implies a safety computation exists). */
  reasonNote: string | null
  displayName: string
  chartNo: string | null
  identityUnresolved: boolean
  /** Only set when identityUnresolved -- the patient_uuid to hand PatientIdentityLinkAction. */
  patientUuidForIdentityLink: string | null
  timeIso: string | null
  completed: boolean
  scheduledToday: boolean
  isNew: boolean
  submissionId?: string
  revisitVisitId?: string
  revisitPatientId?: string
  /** One row per patient's CRM tasks -- >1 means this row represents several tasks (grouped/expandable), never silently drops the rest. */
  crmTaskIds?: string[]
  crmPatientUuid?: string
}

function utcDateOnly(iso: string | null | undefined): string | null {
  if (typeof iso !== 'string') return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

function submissionReason(status: SubmissionSummary['status']): string {
  return status === 'completed' ? '문진 완료' : '새 문진'
}

function submissionRow(s: SubmissionSummary): TodayQueueRow {
  const completed = s.status === 'completed'
  return {
    key: `submission:${s.id}`,
    kind: 'submission',
    badge: normalizeSubmissionBadge(s.safety_badge),
    needsAttention: false,
    reason: submissionReason(s.status),
    reasonNote: null,
    displayName: typeof s.patient_label === 'string' && s.patient_label.trim() !== '' ? s.patient_label : '확인 필요',
    chartNo: null,
    identityUnresolved: false,
    patientUuidForIdentityLink: null,
    timeIso: typeof s.created_at === 'string' ? s.created_at : null,
    completed,
    scheduledToday: false,
    isNew: s.status === 'new',
    submissionId: s.id,
  }
}

function revisitRow(rv: RevisitQueueItem): TodayQueueRow {
  const resolved: RevisitResolvedIdentity = rv.resolvedIdentity
  return {
    key: `revisit:${rv.visitId}`,
    kind: 'revisit',
    badge: 'NONE',
    needsAttention: rv.needsAttention,
    reason: '재검 예정',
    // P0-6/Phase 3 §4-a integration blocker #3: a revisit row's screen has
    // NO questionnaire, hence no safety_flags at all -- always say so
    // explicitly, never let the row's badge alone imply "checked and
    // clear".
    reasonNote: '문진 없음 — 안전 계산 없음',
    displayName: resolved.resolved ? resolved.patient_name : '신원 확인 필요',
    chartNo: resolved.resolved ? resolved.sigma_chart_no : null,
    identityUnresolved: !resolved.resolved,
    patientUuidForIdentityLink: resolved.resolved ? null : rv.patientId,
    timeIso: typeof rv.createdAt === 'string' ? rv.createdAt : null,
    completed: rv.status === 'COMPLETED',
    scheduledToday: false,
    isNew: false,
    revisitVisitId: rv.visitId,
    revisitPatientId: rv.patientId,
  }
}

function crmGroupRow(
  patientUuid: string,
  tasks: CrmTask[],
  identities: Record<string, ResolvedPatientIdentity>,
  today: string | null,
): TodayQueueRow {
  const identity = identities[patientUuid]
  // Earliest actionable timestamp in the group -- prefer due_at (an
  // explicit scheduled date) over created_at (merely "when it entered the
  // queue"), matching this module's own "오늘 예정" interpretation above.
  const timestamps = tasks
    .map((t) => t.due_at ?? t.created_at)
    .filter((v): v is string => typeof v === 'string')
    .sort()
  const timeIso = timestamps[0] ?? null
  const dueDates = tasks.map((t) => utcDateOnly(t.due_at)).filter((v): v is string => v != null)
  const scheduledToday = today != null && dueDates.some((d) => d === today)
  return {
    key: `crm:${patientUuid}`,
    kind: 'crm',
    badge: 'NONE',
    needsAttention: false,
    reason: '연락·확인',
    reasonNote: null,
    displayName: identity?.resolved ? identity.patient_name : '신원 확인 필요',
    chartNo: identity?.resolved ? identity.sigma_chart_no : null,
    identityUnresolved: !identity?.resolved,
    patientUuidForIdentityLink: identity?.resolved ? null : patientUuid,
    timeIso,
    completed: false, // listCrmTasks()/listActionableTasks() already excludes terminal (DONE/CANCELLED/SUPERSEDED) statuses -- nothing here is ever "completed".
    scheduledToday,
    isNew: false,
    crmTaskIds: tasks.map((t) => t.task_id),
    crmPatientUuid: patientUuid,
  }
}

/**
 * Tier order: URGENT(0) < 오늘 예정(1) < 신규(2) < 나머지(3) < 완료(4). A
 * single stable sort by this integer alone preserves each source's own
 * original relative order within a tier (see file header).
 */
function tierOf(row: TodayQueueRow): number {
  if (row.completed) return 4
  if (row.badge === 'URGENT') return 0
  if (row.scheduledToday) return 1
  if (row.isNew) return 2
  return 3
}

export function buildTodayQueueRows({
  submissions,
  revisits,
  crmTasks,
  patientIdentities,
  now,
}: {
  submissions: SubmissionSummary[]
  revisits: RevisitQueueItem[]
  /** null = no successful CRM fetch yet this session (never rendered as "0 tasks"). */
  crmTasks: CrmTask[] | null
  patientIdentities: Record<string, ResolvedPatientIdentity>
  /** ISO timestamp used for the "오늘 예정" calendar-day comparison -- injected, never `new Date()` read internally, so this stays deterministic/testable. */
  now: string
}): TodayQueueRow[] {
  const today = utcDateOnly(now)

  // Defensive against a non-array caller mistake (e.g. a still-initial
  // `undefined` state slipping through before the first poll resolves) --
  // fails closed to "nothing from this source" rather than throwing.
  const submissionRows = (Array.isArray(submissions) ? submissions : [])
    .filter((s): s is SubmissionSummary => s != null && typeof s === 'object')
    .map(submissionRow)
  const revisitRows = (Array.isArray(revisits) ? revisits : [])
    .filter((r): r is RevisitQueueItem => r != null && typeof r === 'object')
    .map(revisitRow)

  const crmGroups = new Map<string, CrmTask[]>()
  const crmOrder: string[] = []
  for (const t of Array.isArray(crmTasks) ? crmTasks : []) {
    if (t == null || typeof t !== 'object' || typeof t.patient_uuid !== 'string') continue
    if (!crmGroups.has(t.patient_uuid)) {
      crmGroups.set(t.patient_uuid, [])
      crmOrder.push(t.patient_uuid)
    }
    crmGroups.get(t.patient_uuid)!.push(t)
  }
  // crmOrder preserves the FIRST-SEEN position of each patient group in
  // the server-authoritative sortCrmTaskQueue() order -- never re-derived
  // from anything else.
  const crmRows = crmOrder.map((uuid) => crmGroupRow(uuid, crmGroups.get(uuid)!, patientIdentities, today))

  const combined = [...submissionRows, ...revisitRows, ...crmRows]
  // Array.prototype.sort is a stable sort in every JS engine this project
  // targets (ES2019+) -- rows with an equal tierOf() keep their position
  // from `combined` above, i.e. their own source's original order.
  return combined
    .map((row, index) => ({ row, index }))
    .sort((a, b) => tierOf(a.row) - tierOf(b.row) || a.index - b.index)
    .map(({ row }) => row)
}
