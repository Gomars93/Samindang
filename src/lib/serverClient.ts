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
  RevisitResolvedIdentity,
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

/**
 * 18차 독립 리뷰: rounds 16-17이 `getPatientHistory`/`listRevisitQueue`/
 * `listStations`에 각자 반복해 추가한 "wire body가 기대한 shape이 아니면
 * fail-closed ok:false"의 공통 형태를 하나로 묶는다 -- 이 배치가 같은
 * 클래스의 버그를 라운드마다 형제 함수 하나씩 찾아낸 패턴 자체가, 이제는
 * 매번 개별적으로 가드를 손으로 반복하는 대신 공유 헬퍼로 막을 시점임을
 * 보여준다. 아래의 모든 목록/맵 조회 함수가 이 헬퍼를 거친다.
 */
function invalidResponseShape(): { ok: false; error: string; kind: 'other' } {
  return { ok: false, error: '서버 응답 형식이 올바르지 않습니다.', kind: 'other' }
}

/**
 * 19차 독립 리뷰 HIGH-1: `Array.isArray`는 배열임만 보장할 뿐 원소의
 * shape은 보장하지 않는다 -- `{tasks:[null]}`/`{episodes:[123]}` 같은
 * 값은 18차의 Array.isArray 가드를 그대로 통과했고, 소비하는 컴포넌트
 * (MedicationCourseSection.tsx)가 각 원소의 필드(`t.status`,
 * `e.status`, `course.course_id` 등)에 그대로 접근해 throw했다 -- 그
 * 컴포넌트는 DoctorRecordFallback(에러 바운더리 자신의 fallback prop)
 * 안에서도 렌더되므로, 그 throw는 React가 잡을 수 없는 지점에서
 * 일어나 화면 전체가 하얗게 죽는다. getPatientHistory가 이미 쓰던
 * "null/객체가 아닌 원소는 제거" 패턴을 공유 헬퍼로 승격한다.
 */
function filterValidObjectElements<T>(arr: unknown[]): T[] {
  return arr.filter((v): v is T => v != null && typeof v === 'object')
}

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
  // P1 (Core Reduction Phase 6 gate / Phase 5 Synthesis §2.3): 통합 "오늘"
  // Queue 배지 -- server/store.js의 deriveSafetyBadge가 이미 저장된 값만
  // 읽어 파생한다(새 임상 계산 없음, FROZEN import 없음). 'unknown'과 같은
  // 이유로 여기서도 union 타입으로 값을 강제하지 않는다 -- 렌더 지점
  // (DoctorView.tsx)이 알려진 4값이 아니면 안전한 기본값으로 fail-close한다.
  safety_badge?: 'URGENT' | 'REVIEW' | 'CLEAR' | 'NONE'
}

export function listSubmissions(): Promise<ServerResult<SubmissionSummary[]>> {
  // 18차 독립 리뷰 HIGH-2: 이 함수는 원래 wire body를 검증 없이 그대로
  // 반환했다 -- 배열이 아닌 값이 오면 DoctorView.tsx의 `poll()`이 `.filter`
  // 에서 그대로 throw했고(HIGH-1의 listCrmTasks/listRevisitQueue와 동일한
  // 클래스), 그 poll() 호출부는 catch가 없어 `setListLoading(false)`가
  // 영원히 실행되지 않았다(제출목록이 "불러오는 중…"에 무한히 멈춤). 게다가
  // `submissions.filter(...)`가 컴포넌트 렌더 본문에서도 무조건 호출되므로
  // (DoctorView.tsx), 매 렌더마다 크래시하며 그 크래시는 어떤 error
  // boundary도 감싸지 않는 지점이다.
  return request<SubmissionSummary[]>('/api/submissions').then((result) => {
    if (!result.ok) return result
    if (!Array.isArray(result.data)) return invalidResponseShape()
    // 19차 독립 리뷰 HIGH-1: 원소 자체가 null이면
    // `submissions.filter((s) => s.status === 'new')`(DoctorView.tsx 렌더
    // 본문에서 무조건 호출됨)에서 그대로 throw했다.
    return { ok: true, data: filterValidObjectElements<SubmissionSummary>(result.data) }
  })
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
  // 20차 독립 리뷰 HIGH-1: 이 함수는 검증 없는 bare passthrough였다 --
  // DoctorRecordFallback(error boundary 자신의 fallback prop)이 이
  // 결과를 그대로 렌더하므로, 컨테이너가 손상되면 React가 잡을 수 없는
  // 위치에서 크래시했다. 컨테이너만 방어한다(개별 필드 타입은
  // DoctorView.tsx의 렌더 지점에서 formatTimestamp/statusLabel/
  // safeStringOrFallback으로 각각 방어).
  return request<SubmissionRecord>(`/api/submissions/${id}`).then((result) => {
    if (!result.ok) return result
    if (result.data == null || typeof result.data !== 'object') return invalidResponseShape()
    return result
  })
}

export function setSubmissionStatus(
  id: string,
  status: SubmissionSummary['status'],
): Promise<ServerResult<SubmissionRecord>> {
  // 21차 독립 리뷰 MEDIUM-2: getSubmission과 동일한 sink(selectedRecord)로
  // 흘러가는데도 컨테이너 가드가 없었다.
  return request<SubmissionRecord>(`/api/submissions/${id}/status`, {
    method: 'POST',
    body: JSON.stringify({ status }),
  }).then((result) => {
    if (!result.ok) return result
    if (result.data == null || typeof result.data !== 'object') return invalidResponseShape()
    return result
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
  // 18차 독립 리뷰 LOW-7: 다른 목록 조회 함수들과 동일한 클래스 -- `results`가
  // 배열이 아니면 호출부(DoctorView.tsx의 poll)가 그대로 throw했다.
  return request<{ results: RecorderResult[] }>(`/api/visits/${encodeURIComponent(visitId)}/recorder-results`).then(
    (result) => {
      if (!result.ok) return result
      if (!Array.isArray(result.data?.results)) return invalidResponseShape()
      // 19차 독립 리뷰 HIGH-1: 다른 목록 함수들과 동일한 이유 -- 원소 자체가
      // null이면 렌더 시 필드 접근에서 throw했다.
      return { ok: true, data: { results: filterValidObjectElements<RecorderResult>(result.data.results) } }
    },
  )
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
  return request<{ response: unknown }>(`/api/visits/${encodeURIComponent(visitId)}/micro-follow-up`).then((result) => {
    if (!result.ok) return result
    // 19차 독립 리뷰 MEDIUM-4: `result.data`가 null/객체가 아니면 이전엔
    // 호출부(DoctorView.tsx)의 `result.data.response` 접근에서 그대로
    // throw했다. `response` 필드 자체는 null이 유효한 값(아직 응답 없음)
    // 이므로 그 값 자체는 재검증하지 않는다 -- 컨테이너만 방어한다.
    if (result.data == null || typeof result.data !== 'object') return invalidResponseShape()
    return result as ServerResult<{ response: import('../doctor/workspace/microFollowUp').MicroFollowUpResponse | null }>
  })
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
    // 17차 독립 리뷰 FINDING-2: 16차의 Array.isArray 가드는 `visits`
    // 자체가 배열이 아닌 경우만 막았을 뿐, `result.data`가 null이거나
    // `visits`의 개별 원소가 null인 경우는 여전히 `.patient_id`/
    // `v.visit_id` 접근에서 그대로 throw했다 -- 이 함수의 유일한 다른
    // 호출부(DoctorView.tsx의 이전 방문 이력 조회)는 `.catch` 없이
    // 호출되므로, 그 reject가 조용히 사라지고 실제로는 이전 방문이 있는
    // 환자가 "이전 방문 없음"으로 보였다(fail-silent, fail-closed 아님).
    if (result.data == null || typeof result.data !== 'object') {
      return { ok: false, error: '서버 응답 형식이 올바르지 않습니다.', kind: 'other' }
    }
    return {
      ok: true,
      data: {
        patientId: result.data.patient_id ?? patientId,
        visits: (Array.isArray(result.data.visits) ? result.data.visits : [])
          .filter((v): v is PatientHistoryWire['visits'][number] => v != null && typeof v === 'object')
          .map((v) => ({
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

/**
 * 플로우 정렬 4/5: turns the patient-facing care-plan text the doctor is
 * looking at into a read-only capability link (POST
 * /api/submissions/:id/care-plan-link). The raw token is returned exactly
 * once, like startRevisit/reissueFollowUpSession -- a reload cannot recover
 * it; the doctor simply issues again (which invalidates the previous link).
 */
export type IssuedCarePlanLink = { token: string; expiresAt: string }

export function issueCarePlanLink(submissionId: string, carePlanText: string): Promise<ServerResult<IssuedCarePlanLink>> {
  return request<{ token: string; expires_at: string }>(`/api/submissions/${encodeURIComponent(submissionId)}/care-plan-link`, {
    method: 'POST',
    body: JSON.stringify({ care_plan_text: carePlanText }),
  }).then((result) => {
    if (!result.ok) return result
    if (typeof result.data?.token !== 'string' || typeof result.data?.expires_at !== 'string') return invalidResponseShape()
    return { ok: true, data: { token: result.data.token, expiresAt: result.data.expires_at } }
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
    // 19차 독립 리뷰 LOW-7: `session`이 null/객체가 아닌데도 truthy인 원시값
    // (예: 문자열/숫자)이면 이전엔 `s.status` 등에서 그대로 throw했다 -- 이
    // 함수를 실제로 호출하는 코드는 현재 src/ 어디에도 없지만("exhaustive
    // sweep" 주장을 정확히 하려면 이 함수도 빠뜨려선 안 된다), 다른 목록
    // 함수들과 동일한 방어를 갖춘다.
    const s = result.data?.session
    if (s != null && typeof s !== 'object') return invalidResponseShape()
    return {
      ok: true,
      data: s ? { status: s.status, issuedAt: s.issued_at, expiresAt: s.expires_at, targets: s.targets } : null,
    }
  })
}

// P0-6 (Core Reduction Phase 6 gate): defensively re-validates
// resolved_identity's shape instead of trusting it wholesale -- same
// exhaustive-element-shape discipline as filterValidObjectElements below
// (a malformed/legacy element must fail closed to "unresolved", never be
// passed through as if it were a real name/chart_no).
function normalizeRevisitResolvedIdentity(v: unknown): RevisitResolvedIdentity {
  if (v != null && typeof v === 'object') {
    const obj = v as Record<string, unknown>
    if (obj.resolved === true && typeof obj.sigma_chart_no === 'string' && typeof obj.patient_name === 'string') {
      return { resolved: true, sigma_chart_no: obj.sigma_chart_no, patient_name: obj.patient_name }
    }
    if (obj.resolved === false) {
      return { resolved: false, reason: typeof obj.reason === 'string' ? obj.reason : 'no_mapping' }
    }
  }
  return { resolved: false, reason: 'no_mapping' }
}

type RevisitQueueWire = Array<{
  visit_id: string
  patient_id: string
  created_at: string
  updated_at: string
  status: RevisitStatus
  // P0-6 (Core Reduction Phase 6 gate): server/store.js's listRevisitQueue
  // now attaches this (patient_id EXACT match against patientIdentityStore
  // only -- never name/phone). Left as `unknown` here on purpose --
  // normalizeRevisitResolvedIdentity above is the single point that
  // re-validates it, same "don't trust the wire shape" discipline as
  // filterValidObjectElements.
  resolved_identity?: unknown
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
    // 17차 독립 리뷰 FINDING-1: getPatientHistory에 16차가 추가한
    // Array.isArray 가드의 형제 지점 -- 이 함수는 DoctorView.tsx의 상시
    // poll() 첫 await라서, 배열이 아닌 wire body가 여기서 그대로 throw하면
    // poll() 전체(이후의 listStations/listCrmTasks/listPatientIdentities
    // 포함)가 매 interval마다 반복 실패하고, poll()이 catch 없이 호출돼
    // 아무 에러 상태도 세팅되지 않는다 -- 오래된 CRM Today Queue가 새로고침
    // 실패를 전혀 알리지 않은 채 "지금의 authoritative 목록"인 것처럼 계속
    // 렌더된다(이 파일의 다른 곳이 명시적으로 금지하는 바로 그 상황).
    if (!Array.isArray(result.data)) return { ok: false, error: '서버 응답 형식이 올바르지 않습니다.', kind: 'other' }
    // 19차 독립 리뷰 HIGH-1: 원소 자체가 null이면 아래 .map()의 필드 접근
    // (r.visit_id 등)에서 그대로 throw했다.
    return {
      ok: true,
      data: filterValidObjectElements<RevisitQueueWire[number]>(result.data).map((r) => ({
        visitId: r.visit_id,
        patientId: r.patient_id,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        status: r.status,
        resolvedIdentity: normalizeRevisitResolvedIdentity(r.resolved_identity),
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
    // 17차 독립 리뷰 FINDING-1: listRevisitQueue와 동일한 이유/수정 -- 이
    // 함수도 DoctorView.tsx의 상시 poll()에서 호출된다.
    if (!Array.isArray(result.data?.stations)) return { ok: false, error: '서버 응답 형식이 올바르지 않습니다.', kind: 'other' }
    // 19차 독립 리뷰 HIGH-1: 원소 자체가 null이면 mapStation() 내부의 필드
    // 접근에서 그대로 throw했다.
    return { ok: true, data: filterValidObjectElements<StationWire>(result.data.stations).map(mapStation) }
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
  // 18차 독립 리뷰 HIGH-1: 이 함수는 wire body를 검증 없이 그대로 반환했다
  // -- `tasks`가 배열이 아니면 DoctorView.tsx의 poll()이 이미
  // `setCrmTasks(crmResult.data.tasks)`로 손상된 값을 커밋한 뒤에야
  // `.map()`에서 throw했고(17차가 추가한 poll().catch가 그 throw를 조용히
  // 삼켜버려 사용자에게 아무 신호도 남기지 않는다), null인 경우엔
  // "지금 처리할 CRM 항목이 없습니다"라는 명시적 all-clear로 렌더돼
  // "손상되어 못 읽음"과 "정말 할 일 없음"을 구별할 수 없게 만들었다
  // (governing task 정책 1/2 위반). 여기서 fail-closed로 막으면
  // DoctorView.tsx의 기존 `else` 분기(setCrmTasks(null) +
  // setCrmTasksError(...))가 그대로 발동한다.
  return request<{ tasks: CrmTask[] }>(`/api/crm/tasks${suffix}`).then((result) => {
    if (!result.ok) return result
    if (!Array.isArray(result.data?.tasks)) return invalidResponseShape()
    // 19차 독립 리뷰 HIGH-1: 원소 자체가 null이면 TodayQueueSection.tsx의
    // 필드 접근(task.task_id 등)에서 그대로 throw했다 -- 이 컴포넌트는
    // error boundary 밖에서 마운트된다.
    return { ok: true, data: { tasks: filterValidObjectElements<CrmTask>(result.data.tasks) } }
  })
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
  // 18차 독립 리뷰 MEDIUM-3: 이 함수의 결과는 MedicationCourseSection.tsx를
  // 거쳐 DoctorRecordFallback(DoctorRecordErrorBoundary의 fallback prop
  // 자체)에서도 렌더된다 -- React는 fallback 렌더 도중의 throw를 잡지
  // 못하므로, 이 배치가 손상된 레코드를 위해 만든 안전한 착지 화면 자체가
  // 크래시할 수 있었다. 여기서 fail-closed로 막아 그 경로에 절대 도달하지
  // 않도록 한다.
  return request<{ episodes: Episode[] }>(`/api/crm/episodes?${qs.toString()}`).then((result) => {
    if (!result.ok) return result
    if (!Array.isArray(result.data?.episodes)) return invalidResponseShape()
    // 19차 독립 리뷰 HIGH-1: 배열 원소 자체가 null/원시값이면 원소별 필드
    // 접근에서 그대로 throw했다.
    return { ok: true, data: { episodes: filterValidObjectElements<Episode>(result.data.episodes) } }
  })
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
  return request<Episode>('/api/crm/episodes', {
    method: 'POST',
    body: JSON.stringify({ patient_uuid: patientUuid, owner_clinician: ownerClinician, episode_id: episodeId }),
  }).then((result) => {
    if (!result.ok) return result
    // 19차 독립 리뷰 LOW-6: getMicroFollowUpResponse와 동일한 이유 --
    // MedicationCourseSection.tsx의 handleCreateEpisode가 `result.data`를
    // 컨테이너 검증 없이 바로 스프레드/필드 접근한다.
    if (result.data == null || typeof result.data !== 'object') return invalidResponseShape()
    return result
  })
}

export function listEpisodeTasks(episodeId: string): Promise<ServerResult<{ tasks: CrmTask[] }>> {
  // 18차 독립 리뷰 MEDIUM-3: listEpisodesByPatient와 동일한 이유 --
  // MedicationCourseSection.tsx(DoctorRecordFallback 내부)가 이 결과도
  // 검증 없이 소비한다.
  return request<{ tasks: CrmTask[] }>(`/api/crm/episodes/${encodeURIComponent(episodeId)}/tasks`).then((result) => {
    if (!result.ok) return result
    if (!Array.isArray(result.data?.tasks)) return invalidResponseShape()
    // 19차 독립 리뷰 HIGH-1: listEpisodesByPatient와 동일한 이유.
    return { ok: true, data: { tasks: filterValidObjectElements<CrmTask>(result.data.tasks) } }
  })
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
  // 18차 독립 리뷰 MEDIUM-3: listEpisodesByPatient와 동일한 이유 --
  // MedicationCourseSection.tsx(DoctorRecordFallback 내부)가 이 결과도
  // 검증 없이 소비한다.
  return request<{ courses: MedicationCourseRecord[] }>(
    `/api/crm/episodes/${encodeURIComponent(episodeId)}/medication-courses`,
  ).then((result) => {
    if (!result.ok) return result
    if (!Array.isArray(result.data?.courses)) return invalidResponseShape()
    // 19차 독립 리뷰 HIGH-1: listEpisodesByPatient와 동일한 이유.
    return { ok: true, data: { courses: filterValidObjectElements<MedicationCourseRecord>(result.data.courses) } }
  })
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
  return request<{ course: unknown; deduped: boolean }>('/api/crm/medication-courses', {
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
  }).then((result) => {
    if (!result.ok) return result
    // 19차 독립 리뷰 LOW-6: createEpisode와 동일한 이유 -- handleCreateCourse가
    // `result.data.course`를 검증 없이 바로 필드 접근/스프레드한다.
    if (result.data == null || typeof result.data !== 'object' || result.data.course == null || typeof result.data.course !== 'object') {
      return invalidResponseShape()
    }
    return result as ServerResult<{ course: MedicationCourseRecord; deduped: boolean }>
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
  // 18차 독립 리뷰 MEDIUM-4: `identities`는 배열이 아니라 uuid로 키가 잡힌
  // 맵이라서 Array.isArray로는 검증할 수 없다 -- null/배열/원시값이 오면
  // 이전엔 검증 없이 그대로 반환됐고, DoctorView.tsx가 그 값을 바로
  // `setPatientIdentities`에 넘겨(null이 지나가면 TodayQueueSection.tsx의
  // `identities[uuid]` 조회가 그대로 throw, 컴포넌트가 렌더 도중 죽는다)
  // 이전 poll의 환자 이름이 화면에 그대로 남는(cross-patient 정보가 아니라
  // stale 정보지만, round 14 주석이 명시적으로 금지한 상황) 결과로
  // 이어질 수 있었다.
  return request<{ identities: Record<string, ResolvedPatientIdentity> }>(
    `/api/crm/patient-identities?${qs.toString()}`,
  ).then((result) => {
    if (!result.ok) return result
    const identities = result.data?.identities
    if (identities == null || typeof identities !== 'object' || Array.isArray(identities)) return invalidResponseShape()
    // 19차 독립 리뷰 LOW-8: 맵 자체는 검증했지만 개별 값이 null/객체가
    // 아닐 수 있다 -- 현재 소비부(TodayQueueSection.tsx)는 optional
    // chaining(`?.resolved`)으로 우연히 안전하지만, 그 방어에만 기대지
    // 않고 여기서도 걸러낸다.
    const cleaned: Record<string, ResolvedPatientIdentity> = {}
    for (const [uuid, value] of Object.entries(identities)) {
      if (value != null && typeof value === 'object') cleaned[uuid] = value
    }
    return { ok: true, data: { identities: cleaned } }
  })
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
  return request<MessageRecord>(`/api/visits/${encodeURIComponent(visitId)}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      patient_id: params.patientId,
      phone: params.phone,
      follow_up_token: params.followUpToken,
      link: params.link,
      channel: params.channel,
    }),
  }).then((result) => {
    if (!result.ok) return result
    // 20차 독립 리뷰 LOW-3: MessagingPanel.tsx의 upsertMessage가
    // `result.data`를 검증 없이 그대로 메시지 목록 state에 밀어넣는다 --
    // 그 다음 렌더에서 `m.message_id` 등 필드 접근이 그대로 throw할 수
    // 있었다. retryRevisitMessage/cancelRevisitMessage도 동일.
    if (result.data == null || typeof result.data !== 'object') return invalidResponseShape()
    return result
  })
}

export function listVisitMessages(visitId: string): Promise<ServerResult<{ messages: MessageRecord[] }>> {
  // 18차 독립 리뷰 MEDIUM-5: MessagingPanel.tsx가 이 결과를 `.catch` 없이
  // 소비하고, DoctorRecordErrorBoundary 밖에서 마운트된다.
  return request<{ messages: MessageRecord[] }>(`/api/visits/${encodeURIComponent(visitId)}/messages`).then(
    (result) => {
      if (!result.ok) return result
      if (!Array.isArray(result.data?.messages)) return invalidResponseShape()
      // 19차 독립 리뷰 HIGH-1: 원소 자체가 null이면 MessagingPanel.tsx의
      // 필드 접근(m.channel 등)에서 그대로 throw했다.
      return { ok: true, data: { messages: filterValidObjectElements<MessageRecord>(result.data.messages) } }
    },
  )
}

export function retryRevisitMessage(messageId: string, phone: string, link: string): Promise<ServerResult<MessageRecord>> {
  // 20차 독립 리뷰 LOW-3: queueRevisitMessage와 동일한 이유.
  return request<MessageRecord>(`/api/messages/${encodeURIComponent(messageId)}/retry`, {
    method: 'POST',
    body: JSON.stringify({ phone, link }),
  }).then((result) => {
    if (!result.ok) return result
    if (result.data == null || typeof result.data !== 'object') return invalidResponseShape()
    return result
  })
}

export function cancelRevisitMessage(messageId: string): Promise<ServerResult<MessageRecord>> {
  // 20차 독립 리뷰 LOW-3: queueRevisitMessage와 동일한 이유.
  return request<MessageRecord>(`/api/messages/${encodeURIComponent(messageId)}/cancel`, { method: 'POST' }).then((result) => {
    if (!result.ok) return result
    if (result.data == null || typeof result.data !== 'object') return invalidResponseShape()
    return result
  })
}
