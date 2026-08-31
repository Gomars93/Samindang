/**
 * 로컬 핸드오프 서버(server/index.js) 클라이언트. `VITE_SAMINDANG_SERVER_URL`이
 * 설정되지 않으면 서버 미구성 상태로 동작한다 — 이 경우 어떤 네트워크 요청도
 * 시도하지 않는다(오늘까지의 동작 그대로).
 */
import type { ClinicianJudgment } from '../doctor/judgment'
import type { WorkspaceState } from '../doctor/workspace/persistence'
import type { VisitWorkspaceState } from '../doctor/workspace/visitWorkspace'
import type {
  DeliveryMode,
  FollowUpSessionInfo,
  InputProvenance,
  IssuedFollowUpSession,
  RevisitQueueItem,
  RevisitStatus,
  StationInfo,
} from '../doctor/workspace/followUpSession'
import type { CrmTask, Episode } from '../crm/types'
import type { MedicationCourse } from '../crm/medicationCourse'
import type { MessageChannel, MessageRecord } from '../messaging/types'
import { getStoredDoctorToken } from '../doctor/doctorToken'

const BASE_URL = import.meta.env.VITE_SAMINDANG_SERVER_URL as string | undefined
const TIMEOUT_MS = 8000

export function isServerConfigured(): boolean {
  return typeof BASE_URL === 'string' && BASE_URL.trim() !== ''
}

export type ServerResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; kind: 'auth' | 'network' | 'other'; errorBody?: Record<string, unknown> }

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<ServerResult<T>> {
  if (!isServerConfigured()) return { ok: false, error: '서버가 설정되지 않았습니다.', kind: 'other' }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  // LAN Doctor access (e.g. A PC's browser reaching B PC's server): loopback
  // has no token requirement, but a cross-machine request needs the same
  // x-doctor-token the server checks in requireDoctor(). Read at request time
  // (not module load) so a token set/cleared mid-session takes effect
  // immediately. Harmless to send on every request — the server only
  // inspects this header on doctor routes.
  const token = getStoredDoctorToken()
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        ...(token ? { 'x-doctor-token': token } : {}),
        ...init.headers,
      },
    })
    if (!res.ok) {
      const body = await res.json().catch(() => null)
      const kind = res.status === 401 || res.status === 403 ? 'auth' : 'other'
      // errorBody carries any extra fields a route attached beyond `error`
      // (e.g. patient-identity's 409 existing_sigma_chart_no/patient_name)
      // -- callers that don't need it simply never read it.
      return { ok: false, error: body?.error ?? `서버 오류 (${res.status})`, kind, errorBody: body ?? undefined }
    }
    const data = (await res.json()) as T
    return { ok: true, data }
  } catch (err) {
    const msg = err instanceof Error && err.name === 'AbortError' ? '요청 시간 초과' : '서버에 연결할 수 없습니다.'
    return { ok: false, error: msg, kind: 'network' }
  } finally {
    clearTimeout(timer)
  }
}

// duplicate: true는 이 payload가 이전에 이미 저장된 session_id로 재전송됐다는
// 뜻이다 — 서버가 새 레코드를 만들지 않고 기존 것을 그대로 돌려준 것이므로,
// 태블릿 쪽에서는 평범한 성공과 완전히 동일하게 처리한다(에러 아님).
export type SubmitResult = { id: string; created_at: string; duplicate?: boolean }

export function submitQuestionnaire(payload: unknown): Promise<ServerResult<SubmitResult>> {
  return request('/api/submissions', { method: 'POST', body: JSON.stringify(payload) })
}

export type SubmissionSummary = {
  id: string
  created_at: string
  updated_at: string
  status: 'new' | 'viewed' | 'in_consultation' | 'completed'
  patient_label: string
  primary_concern: string | null
  // 8차 독립 리뷰 MEDIUM-2: 'unknown'은 저장된 flags가 레거시/손상
  // 데이터라 서버가 이 값을 신뢰할 수 없다고 판단했다는 뜻이다(server/
  // store.js의 isFlagsUsable) -- false와 절대 같은 의미가 아니다.
  requires_staff_check: boolean | 'unknown'
  // recorder-results가 이 방문에 적어도 하나 도착했다는 실제 서버 상태(추정 아님).
  recorder_ready: boolean
}

export function listSubmissions(): Promise<ServerResult<SubmissionSummary[]>> {
  return request('/api/submissions')
}

export type SubmissionRecord = {
  id: string
  created_at: string
  updated_at: string
  status: SubmissionSummary['status']
  patient_label: string
  // 이번 스프린트 이전에 저장된 레코드에는 없을 수 있다(하위 호환) — 그런
  // 경우 원장 화면은 방문 활성화를 건너뛰고 배지도 띄우지 않는다.
  patient_id?: string
  visit_id?: string
  submission: Record<string, unknown>
  myungri: unknown
  judgment: ClinicianJudgment | null
  // Doctor Clinical Workspace clinician-entered state (round 2 Phase 2).
  // Absent/undefined on records saved before this field existed — callers
  // must treat that identically to null (see deserializeWorkspaceState).
  workspace?: WorkspaceState | null
}

export function getSubmission(id: string): Promise<ServerResult<SubmissionRecord>> {
  return request(`/api/submissions/${id}`)
}

export function setSubmissionStatus(
  id: string,
  status: SubmissionSummary['status'],
): Promise<ServerResult<SubmissionRecord>> {
  return request(`/api/submissions/${id}/status`, {
    method: 'POST',
    body: JSON.stringify({ status }),
  })
}

// Round 17 (restart-safe / multi-process correctness): `expectedUpdatedAt`
// is an OPTIONAL compare-and-swap precondition (server/store.js's
// saveJudgment/saveWorkspace) -- omitted, this is the exact original
// unconditional last-write-wins call every existing caller already makes.
// A caller that DOES pass the `updated_at` it last read gets a 409 instead
// of silently overwriting a newer save (e.g. from a second open tab); the
// server's current record comes back as `errorBody.current` on that 409 --
// see ServerResult's own `errorBody` field, the same mechanism the
// patient-identity 409 route already uses. No UI currently opts into this
// (deciding how a conflict should surface to the clinician -- silent
// refresh, a banner, a merge view -- is a product/UX call, not made here);
// this plumbing exists so a future round can wire it in without touching
// the transport layer again.
export function saveJudgment(
  id: string,
  judgment: ClinicianJudgment,
  expectedUpdatedAt?: string,
): Promise<ServerResult<SubmissionRecord>> {
  return request(`/api/submissions/${id}/judgment`, {
    method: 'PUT',
    body: JSON.stringify(judgment),
    headers: expectedUpdatedAt ? { 'x-expected-updated-at': expectedUpdatedAt } : undefined,
  })
}

export function saveWorkspaceState(
  id: string,
  workspace: WorkspaceState,
  expectedUpdatedAt?: string,
): Promise<ServerResult<SubmissionRecord>> {
  return request(`/api/submissions/${id}/workspace`, {
    method: 'PUT',
    body: JSON.stringify(workspace),
    headers: expectedUpdatedAt ? { 'x-expected-updated-at': expectedUpdatedAt } : undefined,
  })
}

// ClinicAI 연결점(server/activeVisit.js)의 원장 화면 쪽 절반. "지금 이
// 방문을 진료 중으로 표시한다/표시를 지운다"만 한다 — 녹음/전사는 이 서버
// 어디에도 없다. workstation_id는 이 브라우저/PC의 진료 워크스테이션 id
// (src/doctor/workstation.ts)이며, 생략하면 서버가 "default" 키로 취급한다
// (단일 workstation 하위호환).
export type ActiveVisit = {
  active: true
  workstation_id: string
  patient_id: string
  visit_id: string
  submission_id: string | null
  active_since: string
}
export type CurrentVisitResult = ActiveVisit | { active: false; workstation_id: string }

export function activateVisit(visitId: string, workstationId?: string): Promise<ServerResult<CurrentVisitResult>> {
  return request(`/api/visits/${visitId}/activate`, {
    method: 'POST',
    body: JSON.stringify({ workstation_id: workstationId }),
  })
}

export function clearActiveVisit(workstationId?: string): Promise<ServerResult<{ ok: true; workstation_id: string }>> {
  return request('/api/current-visit/clear', {
    method: 'POST',
    body: JSON.stringify({ workstation_id: workstationId }),
  })
}

export function getCurrentVisit(workstationId?: string): Promise<ServerResult<CurrentVisitResult>> {
  const qs = workstationId ? `?workstation_id=${encodeURIComponent(workstationId)}` : ''
  return request(`/api/current-visit${qs}`)
}

// Recorder(A PC) -> B 서버로 전달된 전사/구조화 노트. B는 이 값을 절대
// 생성하지 않는다 — POST는 A(또는 그 downstream)가 직접 호출하고, Doctor
// 화면은 GET으로 읽기만 한다.
export type RecorderStructuredNote = {
  chief_complaint: string | null
  history: string | null
  key_findings: string | null
  assessment: string | null
  treatment: string | null
  plan: string | null
}

export type RecorderResult = {
  visit_id: string
  recording_id: string
  transcript: string | null
  structured_note: RecorderStructuredNote | null
  source: { workstation_id: string | null } | null
  created_at: string
  updated_at: string
}

export function getRecorderResults(visitId: string): Promise<ServerResult<{ results: RecorderResult[] }>> {
  return request(`/api/visits/${encodeURIComponent(visitId)}/recorder-results`)
}

// Round 3 Phase D(micro follow-up). Wire shape from server/microFollowUpStore.js
// mapped to src/doctor/workspace/microFollowUp.ts's MicroFollowUpResponse.
// Both routes below are doctor-guarded like every other route in this
// file -- this is the DOCTOR/staff-session read/save path. The patient's
// own device saves a MicroFollowUpResponse through a completely separate,
// un-doctor-token-gated route instead (see src/lib/followUpClient.ts's
// submitFollowUpSession, which this file never imports).
export function getMicroFollowUpResponse(
  visitId: string,
): Promise<ServerResult<{ response: import('../doctor/workspace/microFollowUp').MicroFollowUpResponse | null }>> {
  return request(`/api/visits/${encodeURIComponent(visitId)}/micro-follow-up`)
}

export function saveMicroFollowUpResponse(
  visitId: string,
  response: Pick<
    import('../doctor/workspace/microFollowUp').MicroFollowUpResponse,
    'targetRatings' | 'overallChange' | 'newSymptomReported' | 'newSymptomNote' | 'adverseEffectReported' | 'adverseEffectNote'
  >,
): Promise<ServerResult<import('../doctor/workspace/microFollowUp').MicroFollowUpResponse>> {
  return request(`/api/visits/${encodeURIComponent(visitId)}/micro-follow-up`, {
    method: 'POST',
    body: JSON.stringify(response),
  })
}

// Round 3 Phase C(longitudinal linkage). Wire shape from
// server/store.js's getPatientHistory (snake_case) mapped to the client's
// PatientHistoryResult (camelCase, src/doctor/workspace/longitudinal.ts).
// RAW facts only -- no computed improvement/percentage, ever.
type PatientHistoryWire = {
  patient_id: string | null
  visits: Array<{
    visit_id: string
    submission_id: string | null
    created_at: string
    primary_concern: string | null
    pain_follow_up_targets: import('../doctor/workspace/finalAssessment').FollowUpTarget[]
    herbal_follow_up_targets: import('../doctor/workspace/finalAssessment').FollowUpTarget[]
    follow_up_targets: import('../doctor/workspace/finalAssessment').FollowUpTarget[]
    pain_final_assessment_summary: string | null
    herbal_final_assessment_summary: string | null
    next_reassessment_plan: import('../doctor/workspace/finalAssessment').NextReassessmentPlan | null
  }>
}

export function getPatientHistory(
  patientId: string,
  excludeVisitId?: string,
): Promise<ServerResult<import('../doctor/workspace/longitudinal').PatientHistoryResult>> {
  const qs = excludeVisitId ? `?excludeVisitId=${encodeURIComponent(excludeVisitId)}` : ''
  return request<PatientHistoryWire>(`/api/patients/${encodeURIComponent(patientId)}/history${qs}`).then((result) => {
    if (!result.ok) return result
    return {
      ok: true,
      data: {
        patientId: result.data.patient_id ?? patientId,
        // 16차 독립 리뷰 MEDIUM-1: 서버가 언제나 배열을 보낸다는 보장에
        // 의존하지 않는다 -- 버전 skew/프록시 등으로 `visits`가 배열이
        // 아니면 이전엔 `.map`이 그대로 throw해 이 함수의 반환 Promise가
        // reject됐고, 호출부(RevisitWorkspace.tsx의 `load()`)는 그 reject를
        // 잡지 않아 로딩 스피너가 영원히 멈추지 않았다(고안된 fail-closed
        // loadError 경로로 아예 도달하지 못함).
        visits: (Array.isArray(result.data.visits) ? result.data.visits : []).map((v) => ({
          visitId: v.visit_id,
          submissionId: v.submission_id,
          createdAt: v.created_at,
          primaryConcern: v.primary_concern,
          painFollowUpTargets: v.pain_follow_up_targets,
          herbalFollowUpTargets: v.herbal_follow_up_targets,
          followUpTargets: v.follow_up_targets,
          painFinalAssessmentSummary: v.pain_final_assessment_summary,
          herbalFinalAssessmentSummary: v.herbal_final_assessment_summary,
          nextReassessmentPlan: v.next_reassessment_plan,
        })),
      },
    }
  })
}

// Round 3(revisit linkage). A visit record as visitStore.js stores it --
// `workspace` here is the VISIT-owned WorkspaceState (only meaningful when
// submission_id is null; see visitWorkspace.ts's file header for why this
// is a separate source of truth from the submission-owned one).
export type VisitRecord = {
  id: string
  patient_id: string
  created_at: string
  updated_at: string
  submission_id: string | null
  judgment_ref: 'submission' | null
  workspace: VisitWorkspaceState | null
}

export function getVisit(visitId: string): Promise<ServerResult<VisitRecord>> {
  return request(`/api/visits/${encodeURIComponent(visitId)}`)
}

// Round 17: same optional expectedUpdatedAt CAS precondition as
// saveJudgment/saveWorkspaceState above -- omitted, unchanged unconditional
// last-write-wins.
export function saveVisitWorkspace(
  visitId: string,
  workspace: VisitWorkspaceState,
  expectedUpdatedAt?: string,
): Promise<ServerResult<VisitRecord>> {
  return request(`/api/visits/${encodeURIComponent(visitId)}/workspace`, {
    method: 'PUT',
    body: JSON.stringify(workspace),
    headers: expectedUpdatedAt ? { 'x-expected-updated-at': expectedUpdatedAt } : undefined,
  })
}

// Round 3(revisit linkage): "재진 간단 문진 시작". The ONLY response that
// ever carries the raw one-time patient token -- never persisted, never
// returned again by any other endpoint. The caller must show/copy it
// immediately; a page reload cannot recover it (by design -- see
// DECISIONS.md's follow-up-session token entry).
type StartRevisitWire = {
  visit: VisitRecord
  token: string
  expires_at: string
  targets: Array<{ id: string; label: string }>
}

export function startRevisit(
  patientId: string,
  deliveryMode?: DeliveryMode,
): Promise<ServerResult<{ visit: VisitRecord; session: IssuedFollowUpSession }>> {
  return request<StartRevisitWire>(`/api/patients/${encodeURIComponent(patientId)}/start-revisit`, {
    method: 'POST',
    body: JSON.stringify({ delivery_mode: deliveryMode ?? null }),
  }).then((result) => {
    if (!result.ok) return result
    return {
      ok: true,
      data: {
        visit: result.data.visit,
        session: { token: result.data.token, expiresAt: result.data.expires_at, targets: result.data.targets },
      },
    }
  })
}

type ReissueWire = { token: string; expires_at: string; targets: Array<{ id: string; label: string }> }

export function reissueFollowUpSession(visitId: string): Promise<ServerResult<IssuedFollowUpSession>> {
  return request<ReissueWire>(`/api/visits/${encodeURIComponent(visitId)}/follow-up-session/reissue`, {
    method: 'POST',
  }).then((result) => {
    if (!result.ok) return result
    return { ok: true, data: { token: result.data.token, expiresAt: result.data.expires_at, targets: result.data.targets } }
  })
}

export function invalidateFollowUpSession(visitId: string): Promise<ServerResult<{ ok: true }>> {
  return request(`/api/visits/${encodeURIComponent(visitId)}/follow-up-session/invalidate`, { method: 'POST' })
}

type FollowUpSessionStatusWire = {
  session: { status: FollowUpSessionInfo['status']; issued_at: string; expires_at: string; targets: Array<{ id: string; label: string }> } | null
}

export function getFollowUpSessionStatus(visitId: string): Promise<ServerResult<FollowUpSessionInfo | null>> {
  return request<FollowUpSessionStatusWire>(`/api/visits/${encodeURIComponent(visitId)}/follow-up-session`).then((result) => {
    if (!result.ok) return result
    const s = result.data.session
    return {
      ok: true,
      data: s ? { status: s.status, issuedAt: s.issued_at, expiresAt: s.expires_at, targets: s.targets } : null,
    }
  })
}

type RevisitQueueWire = Array<{
  visit_id: string
  patient_id: string
  created_at: string
  updated_at: string
  status: RevisitStatus
  needs_attention: boolean
  delivery_mode: DeliveryMode | null
  station_name: string | null
  input_provenance: InputProvenance | null
  session_created_at: string | null
  assigned_at: string | null
  patient_started_at: string | null
  submitted_at: string | null
}>

export function listRevisitQueue(): Promise<ServerResult<RevisitQueueItem[]>> {
  return request<RevisitQueueWire>('/api/visits/revisits').then((result) => {
    if (!result.ok) return result
    return {
      ok: true,
      data: result.data.map((r) => ({
        visitId: r.visit_id,
        patientId: r.patient_id,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        status: r.status,
        needsAttention: r.needs_attention,
        deliveryMode: r.delivery_mode ?? null,
        stationName: r.station_name ?? null,
        inputProvenance: r.input_provenance ?? null,
        sessionCreatedAt: r.session_created_at ?? null,
        assignedAt: r.assigned_at ?? null,
        patientStartedAt: r.patient_started_at ?? null,
        submittedAt: r.submitted_at ?? null,
      })),
    }
  })
}

/* ---------- Round 8: clinic tablet stations (STAFF side only) ----------
 * The station's own two endpoints live in src/lib/stationClient.ts, which
 * deliberately imports nothing from this file -- a station device never
 * carries a doctor token. These functions are the RECEPTION side: register
 * a tablet, list tablets, assign a patient to one, reset one.
 */

type StationWire = {
  station_id: string
  name: string
  created_at: string
  assignment: { visit_id: string; delivery_mode: string; status: string; assigned_at: string } | null
}

function mapStation(s: StationWire): StationInfo {
  return {
    stationId: s.station_id,
    name: s.name,
    createdAt: s.created_at,
    assignment: s.assignment
      ? {
          visitId: s.assignment.visit_id,
          deliveryMode: s.assignment.delivery_mode,
          status: s.assignment.status,
          assignedAt: s.assignment.assigned_at,
        }
      : null,
  }
}

export function listStations(): Promise<ServerResult<StationInfo[]>> {
  return request<{ stations: StationWire[] }>('/api/stations').then((result) => {
    if (!result.ok) return result
    return { ok: true, data: result.data.stations.map(mapStation) }
  })
}

/**
 * Registers a clinic tablet. The returned `credential` is the ONLY time
 * this device secret is ever available -- the caller must immediately turn
 * it into the one-time `#station-setup=` pairing link and never store it.
 */
export function registerStation(
  name: string,
): Promise<ServerResult<{ credential: string; stationId: string; name: string }>> {
  return request<{ credential: string; station: { station_id: string; name: string } }>('/api/stations', {
    method: 'POST',
    body: JSON.stringify({ name }),
  }).then((result) => {
    if (!result.ok) return result
    return {
      ok: true,
      data: { credential: result.data.credential, stationId: result.data.station.station_id, name: result.data.station.name },
    }
  })
}

/**
 * THE reception action: start a revisit for an explicitly-selected existing
 * patient and hand it to a specific tablet. Deliberately returns no raw
 * token -- the tablet fetches its own capability through its device-
 * credentialed poll, so staff never handle the patient's capability at all.
 */
export function assignRevisitToStation(
  stationId: string,
  patientId: string,
  deliveryMode: DeliveryMode = 'CLINIC_TABLET',
): Promise<ServerResult<{ visit: VisitRecord; stationName: string }>> {
  return request<{ visit: VisitRecord; station: { station_id: string; name: string } }>(
    `/api/stations/${encodeURIComponent(stationId)}/assign`,
    { method: 'POST', body: JSON.stringify({ patient_id: patientId, delivery_mode: deliveryMode }) },
  ).then((result) => {
    if (!result.ok) return result
    return { ok: true, data: { visit: result.data.visit, stationName: result.data.station.name } }
  })
}

/** Staff manually returns a tablet to its waiting screen. */
export function resetStation(stationId: string): Promise<ServerResult<{ ok: true }>> {
  return request(`/api/stations/${encodeURIComponent(stationId)}/reset`, { method: 'POST' })
}

/**
 * CRM v0.3.1 round 13: read-only Today Queue fetch. Wire shape already
 * matches CrmTask exactly (see server/index.js's GET /api/crm/tasks), so
 * no field mapping is needed here -- unlike listRevisitQueue's snake_case
 * -> camelCase translation. Never sets first_seen_at; this is a plain GET.
 */
export function listCrmTasks(params?: {
  ownerClinician?: string
  coverageQueue?: string
}): Promise<ServerResult<{ tasks: CrmTask[] }>> {
  const qs = new URLSearchParams()
  if (params?.ownerClinician) qs.set('owner_clinician', params.ownerClinician)
  if (params?.coverageQueue) qs.set('coverage_queue', params.coverageQueue)
  const suffix = qs.toString() ? `?${qs.toString()}` : ''
  return request(`/api/crm/tasks${suffix}`)
}

/**
 * Medication/Herbal-course batch: Episode lookup by patient. episode_id is
 * a server-minted randomUUID with no separate index the client already
 * knows -- a UI that only has a patient_uuid (the identity it always
 * starts from) needs this to find or offer to create that patient's own
 * Episode(s) before it can attach a MedicationCourse.
 */
export function listEpisodesByPatient(patientUuid: string): Promise<ServerResult<{ episodes: Episode[] }>> {
  const qs = new URLSearchParams({ patient_uuid: patientUuid })
  return request(`/api/crm/episodes?${qs.toString()}`)
}

/**
 * Episode↔Medication association integrity batch: episodeId is an
 * OPTIONAL client-minted identity (same "mint once per draft, reuse across
 * retries" contract MedicationCourseSection.tsx already uses for
 * newCourseSourceId) -- passing the same id on a retry after a lost
 * response lets the server's create-if-absent semantics return the
 * already-created Episode instead of minting a second one. Omitting it
 * preserves the old server-minted-id behavior for any other caller.
 */
export function createEpisode(patientUuid: string, ownerClinician?: string, episodeId?: string): Promise<ServerResult<Episode>> {
  return request('/api/crm/episodes', {
    method: 'POST',
    body: JSON.stringify({ patient_uuid: patientUuid, owner_clinician: ownerClinician, episode_id: episodeId }),
  })
}

export function listEpisodeTasks(episodeId: string): Promise<ServerResult<{ tasks: CrmTask[] }>> {
  return request(`/api/crm/episodes/${encodeURIComponent(episodeId)}/tasks`)
}

// Wire shape from server/crmStore.js's createMedicationCourseStored --
// MedicationCourse (src/crm/medicationCourse.ts) plus the persistence
// fields every CRM store record carries (dedup_key/created_at/updated_at/
// version), none of which belong on the pure type itself.
export type MedicationCourseRecord = MedicationCourse & {
  dedup_key: string
  created_at: string
  updated_at: string
  version: number
}

export function listMedicationCoursesByEpisode(
  episodeId: string,
): Promise<ServerResult<{ courses: MedicationCourseRecord[] }>> {
  return request(`/api/crm/episodes/${encodeURIComponent(episodeId)}/medication-courses`)
}

export function getMedicationCourse(courseId: string): Promise<ServerResult<MedicationCourseRecord>> {
  return request(`/api/crm/medication-courses/${encodeURIComponent(courseId)}`)
}

/**
 * Creates a MedicationCourse. Idempotent across retries via the server's
 * own dedup pointer keyed on (episode_id, source, source_id) -- see
 * server/crmStore.js's createMedicationCourseStored. Never invents a
 * date/duration: every timing field here is either what the caller
 * explicitly supplies (a chart/EMR event, or an explicit clinician-entered
 * date) or omitted (null).
 */
export function createMedicationCourse(params: {
  episodeId: string
  // Episode↔Medication association integrity batch: the patient the Doctor
  // UI currently displays. Optional and additive -- the server only checks
  // it when supplied -- but the Doctor UI always has this in scope, so
  // supplying it here makes a stale/buggy client's episode_id (one
  // belonging to a DIFFERENT patient) a fail-closed rejection instead of a
  // silent cross-patient write. course.patient_uuid itself is still always
  // derived from the Episode, never trusted from this field.
  patientUuid: string
  source: string
  sourceId: string
  sourceTimestamp: string
  prescribedAt?: string | null
  dispensedAt?: string | null
  medicationStartAt?: string | null
  plannedDurationDays?: number | null
}): Promise<ServerResult<{ course: MedicationCourseRecord; deduped: boolean }>> {
  return request('/api/crm/medication-courses', {
    method: 'POST',
    body: JSON.stringify({
      episode_id: params.episodeId,
      patient_uuid: params.patientUuid,
      source: params.source,
      source_id: params.sourceId,
      source_timestamp: params.sourceTimestamp,
      prescribed_at: params.prescribedAt ?? null,
      dispensed_at: params.dispensedAt ?? null,
      medication_start_at: params.medicationStartAt ?? null,
      planned_duration_days: params.plannedDurationDays ?? null,
    }),
  })
}

export type MedicationCourseReasonCode = 'MEDICATION_START_CHECK' | 'MEDICATION_MID_CHECK' | 'MEDICATION_END_CHECK'

/**
 * Creates one MEDICATION_*_CHECK CrmTask against an existing course.
 * due_at must be an explicit date the caller (clinician/staff) supplies --
 * this client never computes one from "now" or the course's timeline, and
 * no product-specific or day-offset schedule lives here either.
 */
export function createMedicationCourseCheckTask(
  courseId: string,
  expectedVersion: number,
  reasonCode: MedicationCourseReasonCode,
  dueAt: string,
  doNotContact?: boolean,
): Promise<ServerResult<{ task: CrmTask; deduped: boolean }>> {
  return request(`/api/crm/medication-courses/${encodeURIComponent(courseId)}/check-tasks`, {
    method: 'POST',
    body: JSON.stringify({ expectedVersion, reason_code: reasonCode, due_at: dueAt, do_not_contact: doNotContact === true }),
  })
}

/**
 * Records an explicit medication_start_at change. replacementDueDates must
 * be supplied by the caller per surviving reason_code -- this client never
 * derives a due_at from the new start date either. The server rejects the
 * whole call (400) if any entry is malformed or a reason_code repeats,
 * rather than silently dropping it after already superseding the old task.
 */
export function shiftMedicationCourseStart(
  courseId: string,
  expectedVersion: number,
  medicationStartAt: string,
  replacementDueDates: Array<{ reasonCode: MedicationCourseReasonCode; dueAt: string; doNotContact?: boolean }>,
): Promise<ServerResult<{ course: MedicationCourseRecord; superseded: CrmTask[]; createdTasks: CrmTask[] }>> {
  return request(`/api/crm/medication-courses/${encodeURIComponent(courseId)}/shift-start`, {
    method: 'POST',
    body: JSON.stringify({
      expectedVersion,
      medication_start_at: medicationStartAt,
      replacement_due_dates: replacementDueDates.map((r) => ({
        reason_code: r.reasonCode,
        due_at: r.dueAt,
        do_not_contact: r.doNotContact === true,
      })),
    }),
  })
}

/**
 * CRM v0.3.1 round 14: resolved Sigma identity for one patient_uuid --
 * display-only (name + chart number), never RRN/phone. `resolved: false`
 * is an explicit, distinct state (no mapping yet, or the server otherwise
 * could not resolve it) -- it is never omitted and never guessed into a
 * fabricated name.
 */
export type ResolvedPatientIdentity =
  | { resolved: true; sigma_chart_no: string; patient_name: string }
  | { resolved: false; reason: string }

/**
 * Batch read for Today Queue enrichment -- one request covers every
 * task's patient_uuid instead of N+1 polling. Wire shape is already the
 * client shape (a map keyed by patient_uuid), so no translation needed.
 */
export function listPatientIdentities(
  patientUuids: string[],
): Promise<ServerResult<{ identities: Record<string, ResolvedPatientIdentity> }>> {
  const qs = new URLSearchParams()
  for (const uuid of patientUuids) qs.append('patient_uuid', uuid)
  return request(`/api/crm/patient-identities?${qs.toString()}`)
}

/**
 * Explicit clinician/staff confirmation action (never automatic name/
 * phone/RRN matching) that links a Clinical OS patient_uuid to a Sigma
 * chart_no + display name. 1:1 both directions is enforced server-side --
 * a conflict comes back as `ok:false` with `kind:'other'` (409), not a
 * silent success.
 */
export function linkPatientIdentity(params: {
  patientUuid: string
  chartNo: string
  patientName: string
  confirmedBy?: string
}): Promise<ServerResult<{ patient_uuid: string; sigma_chart_no: string; patient_name: string }>> {
  return request('/api/crm/patient-identity', {
    method: 'POST',
    body: JSON.stringify({
      patient_uuid: params.patientUuid,
      sigma_chart_no: params.chartNo,
      patient_name: params.patientName,
      confirmed_by: params.confirmedBy,
    }),
  })
}

/**
 * Quick Revisit outbound messaging (SOLAPI scaffold). Wire shape already
 * matches MessageRecord (src/messaging/types.ts) field-for-field, so no
 * translation is needed here -- unlike CrmTask above, this type was
 * designed alongside its own HTTP route rather than adapted from an
 * earlier shape.
 *
 * `phone` and `link` are deliberately required, explicit arguments on
 * every call here (queue AND retry) -- this server never stores a
 * patient's full phone number anywhere (see server/index.js's
 * messagingContactCache comment and patientIdentityStore.js's identity
 * policy), and the message text is built server-side from `link` (the
 * SAME one-time follow-up URL the copy-link/QR paths already build via
 * DoctorView.tsx's patientFollowUpLink) rather than persisted alongside
 * it. Both are sent once per request and never echoed back in any
 * response this client reads.
 */
export function queueRevisitMessage(
  visitId: string,
  params: { patientId: string; phone: string; followUpToken: string; link: string; channel?: MessageChannel },
): Promise<ServerResult<MessageRecord>> {
  return request(`/api/visits/${encodeURIComponent(visitId)}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      patient_id: params.patientId,
      phone: params.phone,
      follow_up_token: params.followUpToken,
      link: params.link,
      channel: params.channel,
    }),
  })
}

export function listVisitMessages(visitId: string): Promise<ServerResult<{ messages: MessageRecord[] }>> {
  return request(`/api/visits/${encodeURIComponent(visitId)}/messages`)
}

export function retryRevisitMessage(messageId: string, phone: string, link: string): Promise<ServerResult<MessageRecord>> {
  return request(`/api/messages/${encodeURIComponent(messageId)}/retry`, {
    method: 'POST',
    body: JSON.stringify({ phone, link }),
  })
}

export function cancelRevisitMessage(messageId: string): Promise<ServerResult<MessageRecord>> {
  return request(`/api/messages/${encodeURIComponent(messageId)}/cancel`, { method: 'POST' })
}
