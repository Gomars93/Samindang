/**
 * 로컬 핸드오프 서버(server/index.js) 클라이언트. `VITE_SAMINDANG_SERVER_URL`이
 * 설정되지 않으면 서버 미구성 상태로 동작한다 — 이 경우 어떤 네트워크 요청도
 * 시도하지 않는다(오늘까지의 동작 그대로).
 */
import type { ClinicianJudgment } from '../doctor/judgment'

const BASE_URL = import.meta.env.VITE_SAMINDANG_SERVER_URL as string | undefined
const TIMEOUT_MS = 8000

export function isServerConfigured(): boolean {
  return typeof BASE_URL === 'string' && BASE_URL.trim() !== ''
}

export type ServerResult<T> = { ok: true; data: T } | { ok: false; error: string }

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<ServerResult<T>> {
  if (!isServerConfigured()) return { ok: false, error: '서버가 설정되지 않았습니다.' }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { 'content-type': 'application/json', ...init.headers },
    })
    if (!res.ok) {
      const body = await res.json().catch(() => null)
      return { ok: false, error: body?.error ?? `서버 오류 (${res.status})` }
    }
    const data = (await res.json()) as T
    return { ok: true, data }
  } catch (err) {
    const msg = err instanceof Error && err.name === 'AbortError' ? '요청 시간 초과' : '서버에 연결할 수 없습니다.'
    return { ok: false, error: msg }
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
