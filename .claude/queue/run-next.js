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

/**
 * `main`/`master`에서는 큐를 절대 실행하지 않는다. 이 프로젝트의 Git 워크플로는
 * main을 보호 브랜치(Single Source of Truth)로 취급하며, 모든 변경은 별도
 * feature 브랜치 + PR을 통해서만 들어온다 (CLAUDE.md 참고). 큐가 실수로 main에서
 * 실행되면 커밋이 보호 브랜치에 바로 쌓이게 되므로, 실행 전에 현재 브랜치를 확인해
 * main/master면 즉시 거부한다.
 *
 * 현재 브랜치를 확인할 수 없는 경우(detached HEAD, git 명령 실패 등)에도 이름을
 * 알 수 없는 것뿐이지 main이 아니라는 보장이 없으므로 안전하게 실행을 거부한다.
 */
function checkNotOnProtectedBranch() {
  let branch
  try {
    branch = execFileSync('git', ['branch', '--show-current'], {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
    }).trim()
  } catch (err) {
    log(`git branch --show-current failed: ${err.message}`)
    return { ok: false, branch: null }
  }

  if (!branch) {
    // detached HEAD 등 — 이름을 알 수 없다.
    return { ok: false, branch: null }
  }
  if (branch === 'main' || branch === 'master') {
    return { ok: false, branch }
  }
  return { ok: true, branch }
}

/**
 * 사람이 반드시 개입해야 하는 task인지 판단한다.
 * 실제 장비/네트워크 확인이나 원장의 임상·정책 결정이 필요한 task는 무인
 * 러너가 건드리면 안 된다. task 파일 본문에 `requires-human: true`가 있으면
 * 러너는 그 task를 실행하지 않고 멈춘다.
 */
function requiresHuman(taskBody) {
  return /^\s*requires-human:\s*true\s*$/im.test(taskBody)
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
  // 의도적으로 -c(--continue)를 쓰지 않는다. cwd가 이 프로젝트라 -c는 "이
  // 디렉터리의 가장 최근 대화"를 이어받는데, 그건 보통 사람이 쓰던 긴 세션이다.
  // task 파일은 그 자체로 완결된 브리프이므로 매 task를 새 세션으로 돌리는 것이
  // 더 싸고 더 예측 가능하다.
  const result = spawnSync(
    claudeBin,
    [
      '-p', prompt,
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

  const branchCheck = checkNotOnProtectedBranch()
  if (!branchCheck.ok) {
    state.active = false
    state.last_error = branchCheck.branch
      ? `run-next: aborted before starting, current branch is '${branchCheck.branch}' (protected). ` +
        `큐는 main/master에서 실행되지 않습니다. feature 브랜치(예: claude/fix-xxx)로 checkout한 뒤 다시 활성화하세요.`
      : 'run-next: aborted before starting, could not determine the current branch (e.g. detached HEAD). ' +
        'checkout a named feature branch, then re-activate the queue.'
    saveState(state)
    log(state.last_error)
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

      // 사람이 반드시 개입해야 하는 task는 무인으로 실행하지 않는다.
      const taskPathForGate = path.join(TASKS_DIR, taskFile)
      if (existsSync(taskPathForGate) && requiresHuman(readFileSync(taskPathForGate, 'utf8'))) {
        state.active = false
        state.last_error =
          `run-next: ${taskFile}는 사람의 확인이 필요한 task(requires-human)라 자동 실행하지 않고 멈춥니다. ` +
          `실제 장비/네트워크 확인 또는 원장 정책 결정이 끝난 뒤 사람이 직접 진행하세요.`
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
