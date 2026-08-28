/**
 * PUBLIC patient-tablet client for the Micro Follow-up capability-token
 * endpoints (round 3: secure revisit linkage). Deliberately a SEPARATE
 * file from serverClient.ts and imports NOTHING from it or from
 * '../doctor/doctorToken' -- this is a structural guarantee (verifiable by
 * a source-level test) that a doctor token can never be attached to a
 * patient-tablet request, not just a runtime coincidence of what happens
 * to be in sessionStorage on this device.
 *
 * The only identifier this file ever sends is the opaque capability token
 * itself (from the URL hash, see src/screens/FollowUpScreen.tsx) -- never
 * a patient_id/visit_id, which this client never even receives back from
 * the server (see server/index.js's public GET/POST /api/follow-up-session/:token
 * response shapes).
 */
const BASE_URL = import.meta.env.VITE_SAMINDANG_SERVER_URL as string | undefined
const TIMEOUT_MS = 8000

export function isFollowUpServerConfigured(): boolean {
  return typeof BASE_URL === 'string' && BASE_URL.trim() !== ''
}

export type FollowUpClientResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; kind: 'network' | 'other' }

async function request<T>(path: string, init: RequestInit = {}): Promise<FollowUpClientResult<T>> {
  if (!isFollowUpServerConfigured()) return { ok: false, error: '서버가 설정되지 않았습니다.', kind: 'other' }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { 'content-type': 'application/json', ...init.headers },
    })
    const body = await res.json().catch(() => null)
    if (!res.ok) {
      return { ok: false, error: (body && typeof body.status === 'string' ? body.status : null) ?? `오류 (${res.status})`, kind: 'other' }
    }
    return { ok: true, data: body as T }
  } catch (err) {
    const msg = err instanceof Error && err.name === 'AbortError' ? '요청 시간 초과' : '서버에 연결할 수 없습니다.'
    return { ok: false, error: msg, kind: 'network' }
  } finally {
    clearTimeout(timer)
  }
}

export type FollowUpSessionPublicState = 'ACTIVE' | 'EXPIRED' | 'CONSUMED' | 'INVALIDATED' | 'INVALID'

export type FollowUpSessionPublicView = {
  status: FollowUpSessionPublicState
  /** Present only when status === 'ACTIVE'. Patient-safe target labels only -- never clinician notes/prior assessment/Myungri. */
  targets?: Array<{ id: string; label: string }>
  expiresAt?: string
}

type PublicGetWire = { status: FollowUpSessionPublicState; targets?: Array<{ id: string; label: string }>; expires_at?: string }

export function getFollowUpSession(token: string): Promise<FollowUpClientResult<FollowUpSessionPublicView>> {
  return request<PublicGetWire>(`/api/follow-up-session/${encodeURIComponent(token)}`).then((result) => {
    if (!result.ok) return result
    return { ok: true, data: { status: result.data.status, targets: result.data.targets, expiresAt: result.data.expires_at } }
  })
}

export type FollowUpSessionAnswers = {
  targetRatings: Array<{ targetId: string; patientReportedValue: string }>
  overallChange: string
  newSymptomReported: boolean
  newSymptomNote: string
  adverseEffectReported: boolean
  adverseEffectNote: string
}

export function submitFollowUpSession(
  token: string,
  answers: FollowUpSessionAnswers,
): Promise<FollowUpClientResult<{ ok: true }>> {
  return request(`/api/follow-up-session/${encodeURIComponent(token)}`, {
    method: 'POST',
    body: JSON.stringify(answers),
  })
}
