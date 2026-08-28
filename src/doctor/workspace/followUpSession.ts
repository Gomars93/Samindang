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

export type RevisitStatus = 'NOT_STARTED' | 'WAITING_FOR_PATIENT' | 'IN_PROGRESS' | 'COMPLETED' | 'EXPIRED'

/**
 * Round 8: how a session's one-time link is meant to reach the patient.
 * PURE OPERATIONAL METADATA -- it never changes the questions asked, the
 * Follow-up Targets selected, any threshold, or any routing. The same
 * Micro Follow-up protocol runs identically down every channel.
 */
export type DeliveryMode = 'CLINIC_TABLET' | 'PERSONAL_QR' | 'STAFF_ASSISTED' | 'PREVISIT_LINK'

export const DELIVERY_MODE_LABEL: Record<DeliveryMode, string> = {
  CLINIC_TABLET: '원내 태블릿',
  PERSONAL_QR: '환자 휴대폰 QR',
  STAFF_ASSISTED: '직원 대면 대필',
  PREVISIT_LINK: '내원 전 링크',
}

/**
 * Round 8: who physically entered the answers. NOT the clinical Provenance
 * enum -- both values are still patient-reported facts. STAFF_ASSISTED
 * means staff read the same fixed questions aloud and typed the patient's
 * own words; it must never be read as a clinician-observed finding.
 */
export type InputProvenance = 'PATIENT_SELF' | 'STAFF_ASSISTED'

export const INPUT_PROVENANCE_LABEL: Record<InputProvenance, string> = {
  PATIENT_SELF: '환자 직접 입력',
  STAFF_ASSISTED: '직원 대필(환자 구술)',
}

/** One row in the Doctor Queue for a no-submission revisit visit. */
export type RevisitQueueItem = {
  visitId: string
  patientId: string
  createdAt: string
  updatedAt: string
  status: RevisitStatus
  /** Operational review flag only (new symptom / adverse effect reported) -- never a diagnostic/safety classification. */
  needsAttention: boolean
  /** Round 8 operational metadata below -- never clinical. */
  deliveryMode: DeliveryMode | null
  stationName: string | null
  inputProvenance: InputProvenance | null
  sessionCreatedAt: string | null
  assignedAt: string | null
  patientStartedAt: string | null
  submittedAt: string | null
}

export const REVISIT_STATUS_LABEL: Record<RevisitStatus, string> = {
  NOT_STARTED: '재진 · 시작 전',
  WAITING_FOR_PATIENT: '재진 · 환자 입력 대기',
  IN_PROGRESS: '재진 · 환자 작성 중',
  COMPLETED: '재진 · 간단 추적 완료',
  EXPIRED: '재진 · 링크 만료(재발급 필요)',
}

/** A registered clinic tablet. The device credential is never part of this shape. */
export type StationInfo = {
  stationId: string
  name: string
  createdAt: string
  assignment: { visitId: string; deliveryMode: string; status: string; assignedAt: string } | null
}
