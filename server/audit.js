// 최소 append-only 운영 audit 로그. 제출/조회/상태변경/판단저장 "이벤트가
// 있었다"는 사실만 남긴다 — 절대 payload 내용(성함/전화번호/생년월일/약물·
// 병력/토큰)을 쓰지 않는다. 한 줄 = JSON 객체 1개(JSON Lines).
//
// 위치: SAMINDANG_DATA_DIR의 형제 경로(../audit.log) — 기본 구성에서는
// `.data/audit.log`가 되어 기존 `.gitignore`의 `.data/` 규칙에 이미
// 포함된다. 자세한 내용/보존 정책은 docs/RUNBOOK_LOCAL_HANDOFF.md 참고.
//
// Audit registry batch (round 16): AUDIT_EVENTS/AUDIT_ACTORS are the single
// source of truth for every legal event/actor name -- server/index.js
// imports these constants and never writes a raw string literal for
// `event`/`actor`. This exists because `patient_identity_linked` was
// silently dropped for an entire round: logEvent() throws on an
// unregistered name, but safeAudit() (server/index.js) catches that throw
// and only console.errors it, so an unregistered event vanishes from the
// audit trail with no visible production failure. A scattered/duplicated
// allowlist makes that easy to repeat by typo; importing these constants
// at every call site makes a stray literal or misspelling a lint-visible
// (grep-checkable, and asserted by tests/audit-registry.spec.mjs's static check)
// problem instead of a silent runtime drop. logEvent's own contract is
// unchanged: still throws on anything not in this registry, still only
// ever writes the same 6 fixed keys below -- this registry adds NAMES
// only, never new fields, so it does not loosen the PII-minimization
// guarantee.
import { appendFile, mkdir, unlink } from 'node:fs/promises'
import path from 'node:path'

export const AUDIT_EVENTS = Object.freeze({
  // 제출(questionnaire submission) 생명주기
  SUBMISSION_CREATED: 'submission_created',
  SUBMISSION_DUPLICATE: 'submission_duplicate',
  SUBMISSION_VIEWED: 'submission_viewed',
  STATUS_CHANGED: 'status_changed',
  JUDGMENT_SAVED: 'judgment_saved',
  WORKSPACE_SAVED: 'workspace_saved',
  // 방문(visit) 생명주기. GET /api/current-visit(ClinicAI 폴링용)는
  // 읽기라서 로그하지 않는다 -- audit는 상태변경만 남긴다.
  VISIT_CREATED: 'visit_created',
  VISIT_ACTIVATED: 'visit_activated',
  VISIT_CLEARED: 'visit_cleared',
  VISIT_WORKSPACE_SAVED: 'visit_workspace_saved',
  // 원내 태블릿 스테이션(round 8)
  STATION_REGISTERED: 'station_registered',
  STATION_ASSIGNED: 'station_assigned',
  STATION_RESET: 'station_reset',
  STATION_COMPLETED: 'station_completed',
  // 재진/후속 follow-up session 토큰 생명주기
  FOLLOW_UP_SESSION_ISSUED: 'follow_up_session_issued',
  FOLLOW_UP_SESSION_REISSUED: 'follow_up_session_reissued',
  FOLLOW_UP_SESSION_INVALIDATED: 'follow_up_session_invalidated',
  FOLLOW_UP_SESSION_SUBMITTED: 'follow_up_session_submitted',
  // 녹음/Micro Follow-up 저장
  RECORDER_RESULT_SAVED: 'recorder_result_saved',
  MICRO_FOLLOW_UP_SAVED: 'micro_follow_up_saved',
  // CRM v0.3.1 Episode/Task 생명주기
  CRM_EPISODE_CREATED: 'crm_episode_created',
  CRM_EPISODE_PAUSED: 'crm_episode_paused',
  CRM_EPISODE_COMPLETED: 'crm_episode_completed',
  CRM_EPISODE_REOPENED: 'crm_episode_reopened',
  CRM_TASK_CREATED: 'crm_task_created',
  CRM_TASK_RESOLVED: 'crm_task_resolved',
  CRM_TASK_SNOOZED: 'crm_task_snoozed',
  CRM_TASK_CANCELLED: 'crm_task_cancelled',
  CRM_TASK_SUPERSEDED: 'crm_task_superseded',
  CRM_TASK_CLAIMED: 'crm_task_claimed',
  CRM_TASK_SEEN: 'crm_task_seen',
  // Medication/Herbal-course batch: check-task creation reuses
  // CRM_TASK_CREATED above (it is a genuine CrmTask, created through the
  // same createTaskStored path) -- these two are for the MedicationCourse
  // record itself, which is a distinct entity.
  CRM_MEDICATION_COURSE_CREATED: 'crm_medication_course_created',
  CRM_MEDICATION_COURSE_START_SHIFTED: 'crm_medication_course_start_shifted',
  // Identity Production Batch: 영구적인 신원 연결(patient_uuid <->
  // sigma_chart_no) 확정 이벤트.
  PATIENT_IDENTITY_LINKED: 'patient_identity_linked',
  // Quick Revisit 발송(SOLAPI 스캐폴드): 사람(doctor/staff)이 직접 트리거한
  // 행위만 감사 대상 -- 자동 백오프 재시도, provider webhook 배달 상태
  // 갱신은 messaging/*.json 레코드 자체의 attempt/status 이력으로 이미
  // 추적되므로 audit.log에는 중복 기록하지 않는다(범위를 의도적으로 좁힘).
  MESSAGE_QUEUED: 'message_queued',
  MESSAGE_RETRIED: 'message_retried',
  MESSAGE_CANCELLED: 'message_cancelled',
})
const ALLOWED_EVENTS = new Set(Object.values(AUDIT_EVENTS))

export const AUDIT_ACTORS = Object.freeze({
  PATIENT: 'patient',
  DOCTOR: 'doctor',
  // 녹음(recorder) 파이프라인 자체가 남기는 이벤트 -- 사람이 아니라
  // 서버 내부 처리 주체이므로 patient/doctor 어느 쪽도 아니다.
  RECORDER: 'recorder',
})
const ALLOWED_ACTORS = new Set(Object.values(AUDIT_ACTORS))

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
    //
    // At-least-once semantics: a legitimate client retry that a store's
    // own dedup logic (crmStore.js's dedup pointer, patientIdentityStore's
    // pending marker) replays without re-doing the underlying write is
    // expected to skip re-calling this too (the call site checks the
    // store's own "was this a replay" signal before auditing) -- but if a
    // retry ever does reach here twice for the one real event, a
    // duplicate append is an accepted cost, never data loss or corruption.
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
