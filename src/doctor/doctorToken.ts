/**
 * LAN에서 다른 workstation의 서버(예: A PC 브라우저 -> B PC server/index.js)에
 * 접근할 때 보낼 x-doctor-token. 빌드에 넣지 않는다(Vite env 금지) — 탭에서
 * 런타임에 한 번 입력받아 sessionStorage에만 저장한다. 탭/세션이 끝나면
 * 사라진다(workstation.ts의 localStorage와 다르게 영구 저장하지 않음).
 * 값을 콘솔/로그에 출력하지 않는다.
 */
const STORAGE_KEY = 'samindang.doctor.token'

function hasSessionStorage(): boolean {
  return typeof sessionStorage !== 'undefined'
}

export function getStoredDoctorToken(): string | null {
  if (!hasSessionStorage()) return null
  const raw = sessionStorage.getItem(STORAGE_KEY)
  return raw && raw.trim() !== '' ? raw : null
}

export function setStoredDoctorToken(token: string): void {
  if (!hasSessionStorage()) return
  sessionStorage.setItem(STORAGE_KEY, token)
}

export function clearStoredDoctorToken(): void {
  if (!hasSessionStorage()) return
  sessionStorage.removeItem(STORAGE_KEY)
}
