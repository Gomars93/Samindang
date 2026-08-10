// "지금 진료실에 누가 있는가" — workstation(원장 PC/브라우저)별로 프로세스
// 메모리에만 존재하는 값이다. 디스크에 절대 저장하지 않는다 — 서버 재시작은
// 항상 이 값을 모두 비운다(이게 의도된 동작이다: 재시작 후 예전 활성 방문이
// 되살아나면 안 된다).
//
// 여러 원장 workstation(예: DOCTOR-A, DOCTOR-B)이 동시에 서로 다른 환자를
// 진료 중일 수 있으므로, 단일 값이 아니라 workstation_id로 키가 나뉜 맵이다.
// workstation_id를 생략한 호출은 DEFAULT_WORKSTATION_ID로 취급한다 — 기존
// single-workstation 호출/테스트가 그대로 동작하기 위한 하위호환 경로다.
//
// 이것은 ClinicAI 같은 미래의 외부 녹음/기록 시스템(그리고 이제는 다른 원장
// workstation의 Doctor 화면)이 "지금 이 workstation에서 진료 중인 환자가
// 누구인지" 폴링할 수 있게 하는 연결점(server/index.js의
// GET /api/current-visit)일 뿐이다 — 녹음/전사 관련 로직은 이 저장소 어디에도
// 없다.
const activeVisits = new Map() // workstation_id -> entry

export const DEFAULT_WORKSTATION_ID = 'default'

const DEFAULT_TTL_MINUTES = 30

// 환자 식별정보(이름/전화 등)를 절대 담지 않는다 — 형식만 검증한다.
const WORKSTATION_ID_RE = /^[A-Za-z0-9_-]{1,32}$/

export function isValidWorkstationId(id) {
  return typeof id === 'string' && WORKSTATION_ID_RE.test(id)
}

function resolveWorkstationId(workstationId) {
  return workstationId === undefined || workstationId === null || workstationId === ''
    ? DEFAULT_WORKSTATION_ID
    : workstationId
}

function ttlMinutes() {
  const raw = Number(process.env.SAMINDANG_ACTIVE_VISIT_TTL_MINUTES ?? DEFAULT_TTL_MINUTES)
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TTL_MINUTES
}

/**
 * @param {{ id: string, patient_id: string, submission_id: string|null }} visit
 * @param {string} [workstationId]
 */
export function activateVisit(visit, workstationId) {
  const key = resolveWorkstationId(workstationId)
  const iso = new Date().toISOString()
  const entry = {
    patient_id: visit.patient_id,
    visit_id: visit.id,
    submission_id: visit.submission_id,
    active_since: iso,
    last_touched: iso,
  }
  activeVisits.set(key, entry)
  return entry
}

export function clearActiveVisit(workstationId) {
  activeVisits.delete(resolveWorkstationId(workstationId))
}

// 만료를 읽을 때마다(lazy) 확인한다 — setInterval을 따로 두지 않는다.
// 이유: 진료 하나가 TTL 안에 끝나는 게 보통이고, 폴링 주기가 짧아 다음
// 읽기에서 바로 만료가 반영되면 충분하다. 실시간 타이머보다 테스트하기도 더
// 결정적이다(실제 시간 대신 last_touched 값만 조작하면 됨). 각 workstation의
// TTL은 서로 완전히 독립이다 — Map 키가 다르므로 한 workstation의 만료가
// 다른 workstation의 entry에 영향을 줄 수 없다.
//
// ponytail: last_touched는 활성화 시점 이후로 갱신되지 않는다(읽기가 TTL을
// 연장하지 않음) — 진료가 TTL(기본 30분)보다 길어지면 만료된다. 필요해지면
// "터치"(heartbeat) 엔드포인트를 추가한다.
export function getActiveVisit(workstationId) {
  const key = resolveWorkstationId(workstationId)
  const entry = activeVisits.get(key)
  if (!entry) return null
  const ageMs = Date.now() - new Date(entry.last_touched).getTime()
  if (ageMs > ttlMinutes() * 60 * 1000) {
    activeVisits.delete(key)
    return null
  }
  return entry
}

// 테스트 전용 훅: 실제 타이머 없이 TTL 만료를 결정적으로 재현하기 위해
// last_touched를 과거로 되돌린다. production 코드 경로에서는 절대 호출되지
// 않는다 — server/index.js는 이 함수를 import하지 않는다.
export function __setLastTouchedForTest(iso, workstationId) {
  const entry = activeVisits.get(resolveWorkstationId(workstationId))
  if (entry) entry.last_touched = iso
}
