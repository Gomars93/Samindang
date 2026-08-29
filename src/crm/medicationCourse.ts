/**
 * CRM v0.3.1 — medication course provenance. No date/duration is ever
 * inferred; every timing field is either what the source system reported
 * or null.
 */
import type { CrmTask } from './types.ts'
import { supersedeTask } from './taskEngine.ts'

export type MedicationCourse = {
  course_id: string
  episode_id: string
  patient_uuid: string
  source: string
  source_id: string
  prescribed_at: string | null
  dispensed_at: string | null
  medication_start_at: string | null
  planned_duration_days: number | null
  source_timestamp: string
}

/** Timeline anchor priority: start > dispensed > prescribed. Never falls back to "now" or an assumed date. */
export function medicationTimelineAnchor(course: MedicationCourse): string | null {
  return course.medication_start_at ?? course.dispensed_at ?? course.prescribed_at ?? null
}

/**
 * On a start-date shift, still-open ROUTINE tasks tied to this course are
 * superseded (DONE ones are left untouched by supersedeTask's own guard)
 * and the caller's computeDueAt provides the replacement due dates — no
 * SLA offset is hardcoded in this module.
 */
export function recalculateMedicationTasksOnStartShift(
  tasks: CrmTask[],
  course: MedicationCourse,
  computeDueAt: (course: MedicationCourse) => Array<{ task_id: string; due_at: string }>,
): { superseded: CrmTask[]; recalculated: Array<{ task_id: string; due_at: string }> } {
  const linked = tasks.filter((t) => t.source_id === course.course_id && t.task_type === 'ROUTINE')
  const superseded = linked.map((t) => supersedeTask(t))
  const recalculated = computeDueAt(course)
  return { superseded, recalculated }
}
