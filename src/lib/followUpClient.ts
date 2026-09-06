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

const VALID_STATES: ReadonlySet<string> = new Set(['ACTIVE', 'EXPIRED', 'CONSUMED', 'INVALIDATED', 'INVALID'])

// GET /api/follow-up-session/:token deliberately answers an unresolvable
// token with HTTP 404 + { status: 'INVALID' } (see server/index.js), not
// just a plain 200 -- INVALID/EXPIRED/CONSUMED/INVALIDATED are all expected,
// well-defined outcomes of this endpoint, differing only by HTTP status
// code, not by shape. The shared `request()` helper above treats any
// non-2xx as a generic failure and discards the parsed body, which made
// FollowUpScreen's own UNAVAILABLE_MESSAGE.INVALID branch unreachable for
// exactly the case that matters most (a mistyped/garbage/never-issued
// link) -- it always fell through to the generic "cannot connect" screen
// instead. This dedicated path treats any body carrying a recognized
// `status` enum value as real data regardless of HTTP status; only a
// response with no such body (a genuine network/timeout/5xx) is a failure.
export async function getFollowUpSession(token: string): Promise<FollowUpClientResult<FollowUpSessionPublicView>> {
  if (!isFollowUpServerConfigured()) return { ok: false, error: '서버가 설정되지 않았습니다.', kind: 'other' }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${BASE_URL}/api/follow-up-session/${encodeURIComponent(token)}`, {
      signal: controller.signal,
      headers: { 'content-type': 'application/json' },
    })
    const body: PublicGetWire | null = await res.json().catch(() => null)
    if (body && typeof body.status === 'string' && VALID_STATES.has(body.status)) {
      return { ok: true, data: { status: body.status, targets: body.targets, expiresAt: body.expires_at } }
    }
    return { ok: false, error: `오류 (${res.status})`, kind: 'other' }
  } catch (err) {
    const msg = err instanceof Error && err.name === 'AbortError' ? '요청 시간 초과' : '서버에 연결할 수 없습니다.'
    return { ok: false, error: msg, kind: 'network' }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 플로우 정렬 4/5: public READ-ONLY care-plan page (GET /api/care-plan/:token).
 * Same status enum and same "any recognized status body is data regardless
 * of HTTP code" handling as getFollowUpSession above. `carePlanText` is
 * present only while ACTIVE and is the clinician-approved patient-facing
 * text snapshotted at issuance -- nothing else ever comes back.
 */
export type CarePlanLinkPublicView = {
  status: FollowUpSessionPublicState
  carePlanText?: string
  expiresAt?: string
}

type CarePlanGetWire = { status: FollowUpSessionPublicState; care_plan_text?: string; expires_at?: string }

export async function getCarePlanLink(token: string): Promise<FollowUpClientResult<CarePlanLinkPublicView>> {
  if (!isFollowUpServerConfigured()) return { ok: false, error: '서버가 설정되지 않았습니다.', kind: 'other' }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${BASE_URL}/api/care-plan/${encodeURIComponent(token)}`, {
      signal: controller.signal,
      headers: { 'content-type': 'application/json' },
    })
    const body: CarePlanGetWire | null = await res.json().catch(() => null)
    if (body && typeof body.status === 'string' && VALID_STATES.has(body.status)) {
      return {
        ok: true,
        data: {
          status: body.status,
          carePlanText: typeof body.care_plan_text === 'string' ? body.care_plan_text : undefined,
          expiresAt: body.expires_at,
        },
      }
    }
    return { ok: false, error: `오류 (${res.status})`, kind: 'other' }
  } catch (err) {
    const msg = err instanceof Error && err.name === 'AbortError' ? '요청 시간 초과' : '서버에 연결할 수 없습니다.'
    return { ok: false, error: msg, kind: 'network' }
  } finally {
    clearTimeout(timer)
  }
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
