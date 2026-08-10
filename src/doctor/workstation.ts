/**
 * 이 브라우저/PC의 진료 워크스테이션 identity. localStorage에 최초 1회
 * 저장하고, 이후 브라우저 재시작에도 그대로 유지한다. A/B/C를 코드에
 * 하드코딩하지 않는다 — 프리셋 목록은 VITE_SAMINDANG_WORKSTATIONS로
 * 바꿀 수 있다. 절대 환자 이름/원장 실명/전화/이메일 등 PII를 담지 않는다
 * (형식 검증만, 의미 검증은 하지 않는다 — PII 금지는 UI 안내 문구와 이
 * 문서로 지킨다).
 */
const STORAGE_KEY = 'samindang.doctor.workstation_id'

// server/activeVisit.js의 WORKSTATION_ID_RE와 반드시 동일하게 유지한다.
const WORKSTATION_ID_RE = /^[A-Za-z0-9_-]{1,32}$/

export function isValidWorkstationId(id: string): boolean {
  return WORKSTATION_ID_RE.test(id)
}

function hasLocalStorage(): boolean {
  return typeof localStorage !== 'undefined'
}

export function getStoredWorkstationId(): string | null {
  if (!hasLocalStorage()) return null
  const raw = localStorage.getItem(STORAGE_KEY)
  return raw && isValidWorkstationId(raw) ? raw : null
}

export function setStoredWorkstationId(id: string): void {
  if (!isValidWorkstationId(id)) throw new Error('invalid workstation id')
  if (!hasLocalStorage()) return
  localStorage.setItem(STORAGE_KEY, id)
}

export function presetWorkstationIds(): string[] {
  const raw = import.meta.env.VITE_SAMINDANG_WORKSTATIONS as string | undefined
  const parsed = (raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return parsed.length > 0 ? parsed : ['DOCTOR-A', 'DOCTOR-B']
}
