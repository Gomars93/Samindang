/**
 * Follow-up Session (round 3: secure revisit linkage) -- DOCTOR-side types
 * only. The raw capability token itself is never a persisted/typed value
 * here beyond the brief moment it's returned from starting/reissuing a
 * session (see DoctorView's local component state) -- the server never
 * stores or returns it again after that single response.
 */

export type FollowUpSessionStatus = 'ACTIVE' | 'CONSUMED' | 'INVALIDATED'

export type FollowUpTargetSnapshotItem = {
  id: string
  label: string
}

/** Doctor-facing read of the current token's metadata -- never the raw token. */
export type FollowUpSessionInfo = {
  status: FollowUpSessionStatus
  issuedAt: string
  expiresAt: string
  targets: FollowUpTargetSnapshotItem[]
}

/** Result of starting/reissuing a session -- the ONLY place the raw token is ever available to the client. */
export type IssuedFollowUpSession = {
  token: string
  expiresAt: string
  targets: FollowUpTargetSnapshotItem[]
}

export type RevisitStatus = 'NOT_STARTED' | 'WAITING_FOR_PATIENT' | 'COMPLETED' | 'EXPIRED'

/** One row in the Doctor Queue for a no-submission revisit visit. */
export type RevisitQueueItem = {
  visitId: string
  patientId: string
  createdAt: string
  updatedAt: string
  status: RevisitStatus
  /** Operational review flag only (new symptom / adverse effect reported) -- never a diagnostic/safety classification. */
  needsAttention: boolean
}

export const REVISIT_STATUS_LABEL: Record<RevisitStatus, string> = {
  NOT_STARTED: '재진 · 시작 전',
  WAITING_FOR_PATIENT: '재진 · 환자 입력 대기',
  COMPLETED: '재진 · 간단 추적 완료',
  EXPIRED: '재진 · 링크 만료(재발급 필요)',
}
