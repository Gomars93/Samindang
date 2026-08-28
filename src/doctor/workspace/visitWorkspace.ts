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
import type { FollowUpTarget, PainFinalAssessment, NextReassessmentPlan } from './finalAssessment'
import { emptyPainFinalAssessment, emptyNextReassessmentPlan } from './finalAssessment'
import type { PainCarePlan } from './carePlan'
import { emptyPainCarePlan } from './carePlan'
import type { StructuredReassessment } from './reassessmentExam'
import { emptyStructuredReassessment } from './reassessmentExam'

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

function isArray(v: unknown): v is unknown[] {
  return Array.isArray(v)
}
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

/** Never throws -- same defensive per-field degrade pattern as persistence.ts's deserializeWorkspaceState. */
export function deserializeVisitWorkspaceState(raw: unknown): VisitWorkspaceState {
  const empty = emptyVisitWorkspaceState()
  if (!isRecord(raw)) return empty
  return {
    schema_version: typeof raw.schema_version === 'string' ? raw.schema_version : empty.schema_version,
    finalAssessment: isRecord(raw.finalAssessment)
      ? { ...empty.finalAssessment, ...(raw.finalAssessment as Partial<PainFinalAssessment>) }
      : empty.finalAssessment,
    carePlan: isRecord(raw.carePlan) ? { ...empty.carePlan, ...(raw.carePlan as Partial<PainCarePlan>) } : empty.carePlan,
    followUpTargets: isArray(raw.followUpTargets) ? (raw.followUpTargets as FollowUpTarget[]) : empty.followUpTargets,
    nextReassessmentPlan: isRecord(raw.nextReassessmentPlan)
      ? { ...empty.nextReassessmentPlan, ...(raw.nextReassessmentPlan as Partial<NextReassessmentPlan>) }
      : empty.nextReassessmentPlan,
    reassessment: isRecord(raw.reassessment)
      ? {
          ...empty.reassessment,
          ...(raw.reassessment as Partial<StructuredReassessment>),
          items: isArray((raw.reassessment as Record<string, unknown>).items)
            ? ((raw.reassessment as Record<string, unknown>).items as StructuredReassessment['items'])
            : empty.reassessment.items,
        }
      : empty.reassessment,
    updated_at: typeof raw.updated_at === 'string' ? raw.updated_at : null,
  }
}

/** True only when at least one field actually differs -- used to skip a no-op save (mirrors persistence.ts's workspaceStateEquals). */
export function visitWorkspaceStateEquals(a: VisitWorkspaceState, b: VisitWorkspaceState): boolean {
  const { updated_at: _a, ...restA } = a
  const { updated_at: _b, ...restB } = b
  return JSON.stringify(restA) === JSON.stringify(restB)
}
