/**
 * 로컬 핸드오프 서버(server/index.js) 클라이언트. `VITE_SAMINDANG_SERVER_URL`이
 * 설정되지 않으면 서버 미구성 상태로 동작한다 — 이 경우 어떤 네트워크 요청도
 * 시도하지 않는다(오늘까지의 동작 그대로).
 */
import type { ClinicianJudgment } from '../doctor/judgment'
import { getStoredDoctorToken } from '../doctor/doctorToken'

const BASE_URL = import.meta.env.VITE_SAMINDANG_SERVER_URL as string | undefined
const TIMEOUT_MS = 8000

export function isServerConfigured(): boolean {
  return typeof BASE_URL === 'string' && BASE_URL.trim() !== ''
}

export type ServerResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; kind: 'auth' | 'network' | 'other' }

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
      return { ok: false, error: body?.error ?? `서버 오류 (${res.status})`, kind }
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
  requires_staff_check: boolean
  // recorder-results가 이 방문에 적어도 하나 도착했다는 실제 서버 상태(추정 아님).
  recorder_ready: boolean
  // Doctor View 재설계 v0.2 §8.2 — 목록 행 배지. 저장된 submission의
  // safety_flags.*/requires_staff_check로만 서버(store.js)가 파생한다(새
  // 임상 계산 아님). 저장 shape이 갖춰지지 않은 레코드는 null(보류).
  overview: 'URGENT' | 'REVIEW' | 'CLEAR' | null
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

export function saveJudgment(
  id: string,
  judgment: ClinicianJudgment,
): Promise<ServerResult<SubmissionRecord>> {
  return request(`/api/submissions/${id}/judgment`, {
    method: 'PUT',
    body: JSON.stringify(judgment),
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
