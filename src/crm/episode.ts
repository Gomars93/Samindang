/**
 * CRM v0.3.1 — Episode lifecycle. Reuses NextReassessmentPlan from the
 * Doctor Workspace's finalAssessment module rather than defining a
 * parallel reassessment-plan shape.
 */
import type { Episode, CrmTask } from './types'
import type { NextReassessmentPlan } from '../doctor/workspace/finalAssessment'
import { cancelTask, supersedeTask } from './taskEngine'

function checkEpisodeVersion(episode: Episode, expectedVersion: number): void {
  if (episode.version !== expectedVersion) {
    throw new Error(`stale write rejected for episode ${episode.episode_id}`)
  }
}

/** Pausing never touches tasks — no auto-cancel on pause, by requirement. */
export function pauseEpisode(episode: Episode, expectedVersion: number, now: string): Episode {
  checkEpisodeVersion(episode, expectedVersion)
  return { ...episode, status: 'PAUSED', updated_at: now, version: episode.version + 1 }
}

/**
 * Completion cancels only still-open ROUTINE tasks belonging to this
 * episode. SAFETY_REVIEW and CLINICAL_REVIEW are preserved untouched —
 * an episode being marked complete is not evidence that a safety concern
 * resolved itself.
 */
export function completeEpisode(
  episode: Episode,
  expectedVersion: number,
  tasks: CrmTask[],
  now: string,
): { episode: Episode; tasks: CrmTask[] } {
  checkEpisodeVersion(episode, expectedVersion)
  const updatedTasks = tasks.map((t) => {
    if (t.episode_id !== episode.episode_id) return t
    if (t.task_type !== 'ROUTINE') return t
    return cancelTask(t)
  })
  return {
    episode: { ...episode, status: 'COMPLETED', updated_at: now, version: episode.version + 1 },
    tasks: updatedTasks,
  }
}

/** Only a LOST episode can be reopened; REOPENED is recorded as an event, never as a persistent status. */
export function reopenEpisode(episode: Episode, expectedVersion: number, now: string): Episode {
  checkEpisodeVersion(episode, expectedVersion)
  if (episode.status !== 'LOST') throw new Error('only a LOST episode can be reopened')
  return {
    ...episode,
    status: 'ACTIVE',
    updated_at: now,
    events: [...episode.events, { type: 'REOPENED', at: now }],
    version: episode.version + 1,
  }
}

/**
 * CLINICIAN_DECIDES (and the initial UNSET) mean "no auto task, flag
 * clears, episode may remain ACTIVE" — the UI must keep showing "재평가
 * 시점 미정 · 원장 판단" rather than implying the plan is settled. Any
 * other status (a literal date or visit count) sets reassess_due until a
 * future round clears it on a completed reassessment.
 */
export function applyNextReassessmentPlanToEpisode(episode: Episode, plan: NextReassessmentPlan, now: string): Episode {
  const nextReassessDue = plan.status !== 'CLINICIAN_DECIDES' && plan.status !== 'UNSET'
  if (episode.reassess_due === nextReassessDue) return episode
  return { ...episode, reassess_due: nextReassessDue, updated_at: now, version: episode.version + 1 }
}

/** A Care Plan change supersedes this episode's still-open ROUTINE tasks; DONE/CANCELLED/SUPERSEDED tasks are left exactly as they are. */
export function supersedeFutureRoutineTasksOnCarePlanChange(tasks: CrmTask[], episodeId: string): CrmTask[] {
  return tasks.map((t) => {
    if (t.episode_id !== episodeId || t.task_type !== 'ROUTINE') return t
    return supersedeTask(t)
  })
}

export type HerbalContinuationChoice = 'CONTINUE_EPISODE' | 'NEW_EPISODE'

/** CRM never auto-decides a consecutive herbal course's episode — a null choice is a programming error, not a default. */
export function resolveConsecutiveHerbalCourseEpisode(
  choice: HerbalContinuationChoice | null,
  currentEpisodeId: string,
  newEpisodeIdIfNew: string,
): string {
  if (choice === null) throw new Error('consecutive_herbal_course_requires_explicit_choice')
  return choice === 'CONTINUE_EPISODE' ? currentEpisodeId : newEpisodeIdIfNew
}
