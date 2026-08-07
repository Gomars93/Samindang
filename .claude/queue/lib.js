/**
 * Shared state/path helpers for the local task queue.
 * Imported by hooks/verify-queue.js, queue/run-next.js, queue/control.js.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const PROJECT_ROOT = path.resolve(__dirname, '..', '..')
export const QUEUE_DIR = path.join(PROJECT_ROOT, '.claude', 'queue')
export const STATE_PATH = path.join(QUEUE_DIR, 'state.json')
export const TASKS_DIR = path.join(QUEUE_DIR, 'tasks')
export const REPORTS_DIR = path.join(QUEUE_DIR, 'reports')

/** Set on the env of any `claude` process this queue spawns automatically.
 *  Any code path that might spawn another queue runner MUST check this
 *  first and refuse if it is already "1" — prevents a child session's own
 *  Stop hook from ever kicking off a second, nested run-next.js. */
export const CHILD_ENV_MARKER = 'SAMINDANG_QUEUE_CHILD'

/** filenames auto-discovery skips (template/example, not real work) */
const IGNORED_TASK_PATTERN = /^0000-example/i

export function defaultState() {
  return {
    active: false,
    auto_advance: false,
    runner_active: false,
    current_task: null,
    max_retries: 3,
    retries: {},
    completed_tasks: [],
    history: [],
    last_error: null,
    updated_at: null,
  }
}

export function loadState() {
  if (!existsSync(STATE_PATH)) return defaultState()
  try {
    return { ...defaultState(), ...JSON.parse(readFileSync(STATE_PATH, 'utf8')) }
  } catch {
    return defaultState()
  }
}

export function saveState(state) {
  state.updated_at = new Date().toISOString()
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + '\n')
}

/**
 * Next task file to run, ascending filename order, skipping the template
 * (0000-example-*), anything already in completed_tasks, and whatever is
 * currently set as current_task.
 */
export function findNextPendingTask(state) {
  if (!existsSync(TASKS_DIR)) return null
  const done = new Set((state.completed_tasks || []).map((t) => t.task))
  const files = readdirSync(TASKS_DIR)
    .filter((f) => f.endsWith('.md'))
    .filter((f) => !IGNORED_TASK_PATTERN.test(f))
    .filter((f) => !done.has(f))
    .filter((f) => f !== state.current_task)
    .sort((a, b) => a.localeCompare(b))
  return files[0] || null
}

export function ensureReportsDir() {
  mkdirSync(REPORTS_DIR, { recursive: true })
}
