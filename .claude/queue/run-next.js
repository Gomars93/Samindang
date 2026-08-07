#!/usr/bin/env node
/**
 * External queue runner. NOT invoked by the Stop hook (see verify-queue.js
 * header for why) — invoked manually via `node .claude/queue/control.js
 * start` / `next`, or directly.
 *
 * Owns the actual `claude` child-process spawning, so the Stop hook itself
 * never blocks on a long-running child session. Loops across tasks only
 * when state.auto_advance is true; each loop iteration re-reads
 * state.json, because the *child* Claude session's own Stop hook
 * (verify-queue.js, running inside that child) is what advances
 * current_task / completed_tasks / active after a task finishes — this
 * process just watches state.json and launches the next one.
 *
 * Safety:
 *   - refuses to run at all if state.active is false
 *   - refuses to run if another runner already holds state.runner_active
 *   - aborts before the first task if the working tree is unexpectedly
 *     dirty (does not touch/reset it)
 *   - hard per-invocation cap MAX_CONSECUTIVE_TASKS (circuit breaker,
 *     independent of the Stop hook's own max_retries-per-task breaker)
 *   - all subprocess calls use spawnSync/execFileSync with argument
 *     arrays (never a shell string), so Korean/space-containing paths and
 *     prompts are passed safely
 *   - tags the spawned `claude` process env with SAMINDANG_QUEUE_CHILD=1
 *     (see lib.js) so nothing inside that session can mistake itself for
 *     the top-level runner
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  CHILD_ENV_MARKER,
  PROJECT_ROOT,
  REPORTS_DIR,
  TASKS_DIR,
  ensureReportsDir,
  findNextPendingTask,
  loadState,
  saveState,
} from './lib.js'

const MAX_CONSECUTIVE_TASKS = 10
const MAX_BUDGET_USD_PER_TASK = 3

function log(msg) {
  process.stdout.write(`[run-next] ${msg}\n`)
}

/**
 * Resolve an absolute claude CLI path without relying on this process's
 * PATH. Tries, in order: explicit override env var, the known
 * ~/.local/bin install location, `where`/`which`, then finally the bare
 * command name as a last resort (may fail at spawn time if PATH really
 * doesn't have it — that failure is reported, not hidden).
 */
function resolveClaudeBinary() {
  const override = process.env.SAMINDANG_QUEUE_CLAUDE_BIN
  if (override && existsSync(override)) return { bin: override, via: 'SAMINDANG_QUEUE_CLAUDE_BIN' }

  const home = os.homedir()
  const localBin = path.join(home, '.local', 'bin', process.platform === 'win32' ? 'claude.exe' : 'claude')
  if (existsSync(localBin)) return { bin: localBin, via: '~/.local/bin' }

  try {
    const finder = process.platform === 'win32' ? 'where.exe' : 'which'
    const out = execFileSync(finder, ['claude'], { encoding: 'utf8' })
      .split(/\r?\n/)
      .find((line) => line.trim().length > 0)
    if (out && existsSync(out.trim())) return { bin: out.trim(), via: finder }
  } catch {
    /* fall through to last resort */
  }

  return { bin: 'claude', via: 'PATH (unresolved — best effort, may fail)' }
}

function checkCleanTree() {
  try {
    const out = execFileSync('git', ['status', '--porcelain'], {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
    })
    return out.trim().length === 0
  } catch (err) {
    log(`git status check failed: ${err.message}`)
    return false
  }
}

function runOneTask(taskFile, claudeBin) {
  const taskPath = path.join(TASKS_DIR, taskFile)
  const taskBody = readFileSync(taskPath, 'utf8')
  const prompt =
    `You are executing a queued task from the local automation queue.\n` +
    `Task file: .claude/queue/tasks/${taskFile}\n\n` +
    `${taskBody}\n\n` +
    `Implement this task fully. Keep existing app behavior intact unless the ` +
    `task says otherwise. Update the checklist boxes in the task file ` +
    `("- [ ]" -> "- [x]") as you complete each item. Make sure "npx tsc -b" ` +
    `and "npx vite build" both pass before you stop.`

  ensureReportsDir()
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const logPath = path.join(REPORTS_DIR, `${taskFile.replace(/\.md$/, '')}-run-${stamp}.log`)

  log(`launching claude for ${taskFile} via ${claudeBin}`)
  const result = spawnSync(
    claudeBin,
    [
      '-p', prompt,
      '-c',
      '--permission-mode', 'acceptEdits',
      '--output-format', 'text',
      '--max-budget-usd', String(MAX_BUDGET_USD_PER_TASK),
    ],
    {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
      env: { ...process.env, [CHILD_ENV_MARKER]: '1' },
    },
  )

  const combined =
    `exit code: ${result.status}\n\n` +
    `--- stdout ---\n${result.stdout || ''}\n\n` +
    `--- stderr ---\n${result.stderr || ''}\n`
  writeFileSync(logPath, combined)
  log(`claude run finished for ${taskFile}: exit=${result.status}, log=${path.relative(PROJECT_ROOT, logPath)}`)
  return result.status === 0
}

function main() {
  if (process.env[CHILD_ENV_MARKER] === '1') {
    log('refusing to run: already inside a queue-spawned child session (SAMINDANG_QUEUE_CHILD=1).')
    process.exit(1)
  }

  const once = process.argv.includes('--once')

  let state = loadState()
  if (!state.active) {
    log('queue inactive (state.active=false) — refusing to run.')
    process.exit(1)
  }
  if (state.runner_active) {
    log('another runner already active (state.runner_active=true) — refusing to run concurrently.')
    process.exit(1)
  }

  if (!checkCleanTree()) {
    state.active = false
    state.last_error =
      'run-next: aborted before starting, working tree was unexpectedly dirty (pre-existing uncommitted changes). ' +
      'Review/commit/stash manually, then re-activate the queue.'
    saveState(state)
    log(state.last_error)
    process.exit(1)
  }

  const { bin: claudeBin, via } = resolveClaudeBinary()
  log(`resolved claude CLI: ${claudeBin} (via ${via})`)

  state.runner_active = true
  state.last_error = null
  saveState(state)

  let ranCount = 0
  try {
    for (;;) {
      state = loadState()
      if (!state.active) {
        log('queue deactivated, stopping.')
        break
      }

      let taskFile = state.current_task
      if (!taskFile) {
        taskFile = findNextPendingTask(state)
        if (!taskFile) {
          log('no pending tasks, stopping.')
          break
        }
        state.current_task = taskFile
        saveState(state)
      }

      if (ranCount >= MAX_CONSECUTIVE_TASKS) {
        state.last_error = `run-next: hit MAX_CONSECUTIVE_TASKS (${MAX_CONSECUTIVE_TASKS}) in this invocation, stopping for manual review.`
        saveState(state)
        log(state.last_error)
        break
      }

      const ok = runOneTask(taskFile, claudeBin)
      ranCount += 1
      if (!ok) {
        log(
          `claude exited non-zero for ${taskFile}. Checking state.json — its own Stop hook ` +
            `should have recorded a retry or deactivated the queue on failure.`,
        )
      }

      if (once) {
        log('--once flag set, stopping after one task.')
        break
      }

      state = loadState()
      if (!state.auto_advance) {
        log('auto_advance is false, stopping after one task.')
        break
      }
      // Loop continues: the child session's own Stop hook already advanced
      // current_task (or cleared it / deactivated the queue on failure).
    }
  } finally {
    state = loadState()
    state.runner_active = false
    saveState(state)
  }
}

main()
