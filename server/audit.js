// 최소 append-only 운영 audit 로그. 제출/조회/상태변경/판단저장 "이벤트가
// 있었다"는 사실만 남긴다 — 절대 payload 내용(성함/전화번호/생년월일/약물·
// 병력/토큰)을 쓰지 않는다. 한 줄 = JSON 객체 1개(JSON Lines).
//
// 위치: SAMINDANG_DATA_DIR의 형제 경로(../audit.log) — 기본 구성에서는
// `.data/audit.log`가 되어 기존 `.gitignore`의 `.data/` 규칙에 이미
// 포함된다. 자세한 내용/보존 정책은 docs/RUNBOOK_LOCAL_HANDOFF.md 참고.
import { appendFile, mkdir, unlink } from 'node:fs/promises'
import path from 'node:path'

const ALLOWED_EVENTS = new Set([
  'submission_created',
  'submission_duplicate',
  'submission_viewed',
  'status_changed',
  'judgment_saved',
  // 방문(visit) 상태변경 이벤트. GET /api/current-visit(ClinicAI 폴링용)는
  // 읽기라서 로그하지 않는다 — audit는 상태변경만 남긴다.
  'visit_created',
  'visit_activated',
  'visit_cleared',
])
const ALLOWED_ACTORS = new Set(['patient', 'doctor'])

export function auditLogPath(dataDir) {
  return path.join(dataDir, '..', 'audit.log')
}

export function createAuditLog(dataDir) {
  const logPath = auditLogPath(dataDir)

  async function logEvent({ event, submission_id, status, actor, visit_id }) {
    if (!ALLOWED_EVENTS.has(event)) {
      throw new Error(`invalid audit event: ${event}`)
    }
    if (!ALLOWED_ACTORS.has(actor)) {
      throw new Error(`invalid audit actor: ${actor}`)
    }
    // 딱 이 6개 키만(운영 메타데이터뿐) — 그 외 어떤 필드도(특히 payload
    // 조각이나 patient_id) 절대 추가하지 않는다. patient_id는 그 자체로
    // 민감정보는 아니지만, audit 로그는 "무슨 일이 있었는지"만 남기는
    // 최소화 원칙을 유지한다 — 어떤 환자인지는 남기지 않는다.
    const entry = { ts: new Date().toISOString(), event, submission_id, actor }
    if (status !== undefined) entry.status = status
    if (visit_id !== undefined) entry.visit_id = visit_id
    await mkdir(path.dirname(logPath), { recursive: true })
    await appendFile(logPath, `${JSON.stringify(entry)}\n`, 'utf8')
  }

  return { logEvent, logPath }
}

/** 파일럿 종료 후 전체 삭제(scripts/purge-data.mjs 전용). 없어도 조용히 넘어간다. */
export async function purgeAuditLog(dataDir) {
  await unlink(auditLogPath(dataDir)).catch(() => {})
}
