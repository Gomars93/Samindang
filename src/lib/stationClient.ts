/**
 * Clinic tablet STATION client (round 8: delivery-channel-agnostic Micro
 * Follow-up). Deliberately a SEPARATE file from serverClient.ts, and it
 * imports NOTHING from that file nor from the doctor-token module --
 * exactly the same structural guarantee followUpClient.ts makes, and
 * verified by the same kind of source-level test: a doctor token can never
 * be attached to a station request, regardless of what happens to be in
 * session storage on the device.
 *
 * A station credential authenticates the DEVICE, never a patient. It is
 * paired once (via a one-time `#station-setup=<credential>` link staff
 * opens on the tablet) and then persisted in localStorage, because the
 * tablet is a fixed piece of clinic equipment that must survive reboots
 * without a staff member re-pairing it every morning. That is a different
 * lifetime from the patient capability token, which is deliberately
 * single-use and never persisted anywhere on the client.
 *
 * The two endpoints here are the ONLY ones a station ever calls with its
 * credential. Everything the patient actually answers goes through
 * followUpClient.ts with the one-time capability token the poll hands back
 * -- the station is purely a delivery channel, not a second submission
 * path with its own rules.
 */
const BASE_URL = import.meta.env.VITE_SAMINDANG_SERVER_URL as string | undefined
const TIMEOUT_MS = 8000
const CREDENTIAL_STORAGE_KEY = 'samindang.station.credential'

export function isStationServerConfigured(): boolean {
  return typeof BASE_URL === 'string' && BASE_URL.trim() !== ''
}

export function getStationCredential(): string | null {
  try {
    return window.localStorage.getItem(CREDENTIAL_STORAGE_KEY)
  } catch {
    // Private mode / storage disabled -- the station simply reports itself
    // unpaired rather than crashing the kiosk.
    return null
  }
}

export function setStationCredential(credential: string): boolean {
  try {
    window.localStorage.setItem(CREDENTIAL_STORAGE_KEY, credential)
    return true
  } catch {
    return false
  }
}

export function clearStationCredential(): void {
  try {
    window.localStorage.removeItem(CREDENTIAL_STORAGE_KEY)
  } catch {
    // no-op
  }
}

export type StationClientResult<T> = { ok: true; data: T } | { ok: false; error: string }

async function request<T>(path: string, init: RequestInit = {}): Promise<StationClientResult<T>> {
  if (!isStationServerConfigured()) return { ok: false, error: '서버가 설정되지 않았습니다.' }
  const credential = getStationCredential()
  if (!credential) return { ok: false, error: '이 태블릿은 아직 등록되지 않았습니다.' }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { 'content-type': 'application/json', 'x-station-credential': credential, ...init.headers },
    })
    const body = await res.json().catch(() => null)
    if (!res.ok) return { ok: false, error: `오류 (${res.status})` }
    return { ok: true, data: body as T }
  } catch {
    return { ok: false, error: '서버에 연결할 수 없습니다.' }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * The station's own poll. The server returns ONLY a status and (when
 * assigned) the one-time capability token -- never patient_id, name,
 * phone, DOB, or the target labels themselves. The station passes that
 * token straight to followUpClient.ts, exactly as a patient's own phone
 * would with a QR-delivered link.
 */
export type StationAssignmentView = { status: 'WAITING' } | { status: 'ASSIGNED'; token: string }

export function pollStationAssignment(): Promise<StationClientResult<StationAssignmentView>> {
  return request<StationAssignmentView>('/api/station/assignment')
}

/** Clears this station's assignment server-side once the patient has submitted. */
export function completeStationAssignment(): Promise<StationClientResult<{ ok: true }>> {
  return request('/api/station/complete', { method: 'POST' })
}
