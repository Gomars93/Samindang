/**
 * Visit-owned clinician workspace (round 3: revisit linkage). Used ONLY for
 * a no-questionnaire revisit visit (submission_id === null) -- persisted
 * via PUT /api/visits/:id/workspace, a route distinct from the existing
 * submission-owned PUT /api/submissions/:id/workspace.
 *
 * Deliberately reuses the SAME field shapes as the submission-owned
 * WorkspaceState (PainFinalAssessment/PainCarePlan/FollowUpTarget/
 * NextReassessmentPlan/StructuredReassessment) rather than inventing a
 * parallel Pain/Herbal-branched type: a revisit has no questionnaire, so
 * there is no `primary_module`/`routing` to derive a Pain-vs-Herbal
 * profile from in the first place. The revisit workspace is one generic
 * set of clinician fields -- matching the North Star's "every visit
 * short" principle for a quick tracking visit. This is a data-shape
 * choice, not a new clinical distinction.
 */
import { followUpTarget, type FollowUpTarget, type PainFinalAssessment, type NextReassessmentPlan } from './finalAssessment'
import { emptyPainFinalAssessment, emptyNextReassessmentPlan } from './finalAssessment'
import type { PainCarePlan } from './carePlan'
import { emptyPainCarePlan } from './carePlan'
import { reassessmentExamItemFromPrevious, type StructuredReassessment, type PreviousExamValue } from './reassessmentExam'
import { emptyStructuredReassessment } from './reassessmentExam'
import { sanitizeArray, sanitizeShape, isSanitizeRecord } from './sanitize'

const FOLLOW_UP_TARGET_TEMPLATE: FollowUpTarget = followUpTarget('', '')
const REASSESSMENT_ITEM_TEMPLATE: StructuredReassessment['items'][number] = reassessmentExamItemFromPrevious(
  '',
  '',
  null,
)
const PREVIOUS_EXAM_VALUE_TEMPLATE: PreviousExamValue = {
  status: 'NOT_YET_CHECKED',
  laterality: null,
  note: '',
  recordedAt: null,
}

/**
 * 13차 독립 리뷰 자체 회귀분석: persistence.ts의 동명 헬퍼와 동일한 이유/
 * 수정 -- `previous: PreviousExamValue | null`은 템플릿 기본값 자체가
 * null이라 sanitizeShape의 null-템플릿 분기(string/number/null만 통과)를
 * 통과하지 못해 진짜 객체 raw도 조용히 null로 떨어졌다.
 */
function sanitizeReassessmentItem(raw: unknown): StructuredReassessment['items'][number] {
  const item = sanitizeShape(REASSESSMENT_ITEM_TEMPLATE, raw)
  const rawPrevious = isSanitizeRecord(raw) ? raw.previous : undefined
  return {
    ...item,
    previous: isSanitizeRecord(rawPrevious) ? sanitizeShape(PREVIOUS_EXAM_VALUE_TEMPLATE, rawPrevious) : null,
  }
}

function sanitizeStructuredReassessment(empty: StructuredReassessment, raw: unknown): StructuredReassessment {
  const base = sanitizeShape(empty, raw)
  const rawItems = isSanitizeRecord(raw) ? raw.items : undefined
  return { ...base, items: Array.isArray(rawItems) ? rawItems.map(sanitizeReassessmentItem) : [] }
}

export const VISIT_WORKSPACE_SCHEMA_VERSION = '1.0.0'

export type VisitWorkspaceState = {
  schema_version: string
  finalAssessment: PainFinalAssessment
  carePlan: PainCarePlan
  followUpTargets: FollowUpTarget[]
  nextReassessmentPlan: NextReassessmentPlan
  reassessment: StructuredReassessment
  updated_at: string | null
}

export function emptyVisitWorkspaceState(): VisitWorkspaceState {
  return {
    schema_version: VISIT_WORKSPACE_SCHEMA_VERSION,
    finalAssessment: emptyPainFinalAssessment(),
    carePlan: emptyPainCarePlan(),
    followUpTargets: [],
    nextReassessmentPlan: emptyNextReassessmentPlan(),
    reassessment: emptyStructuredReassessment(),
    updated_at: null,
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

/**
 * 13차 독립 리뷰 HIGH-2: persistence.ts의 동명 함수와 동일한 취약점(컨테이너만
 * 검증하고 leaf/원소는 검증하지 않음)이 여기도 그대로 있었다 -- 재진(no-
 * submission revisit) 전용 workspace도 같은 인증되지 않은 PUT 경로로
 * 저장되므로 동일한 fix를 적용한다.
 */
export function deserializeVisitWorkspaceState(raw: unknown): VisitWorkspaceState {
  const empty = emptyVisitWorkspaceState()
  if (!isRecord(raw)) return empty
  return {
    schema_version: typeof raw.schema_version === 'string' ? raw.schema_version : empty.schema_version,
    finalAssessment: sanitizeShape(empty.finalAssessment, raw.finalAssessment),
    carePlan: sanitizeShape(empty.carePlan, raw.carePlan),
    followUpTargets: sanitizeArray(FOLLOW_UP_TARGET_TEMPLATE, raw.followUpTargets),
    nextReassessmentPlan: sanitizeShape(empty.nextReassessmentPlan, raw.nextReassessmentPlan),
    reassessment: sanitizeStructuredReassessment(empty.reassessment, raw.reassessment),
    updated_at: typeof raw.updated_at === 'string' ? raw.updated_at : null,
  }
}

/** True only when at least one field actually differs -- used to skip a no-op save (mirrors persistence.ts's workspaceStateEquals). */
export function visitWorkspaceStateEquals(a: VisitWorkspaceState, b: VisitWorkspaceState): boolean {
  const { updated_at: _a, ...restA } = a
  const { updated_at: _b, ...restB } = b
  return JSON.stringify(restA) === JSON.stringify(restB)
}
