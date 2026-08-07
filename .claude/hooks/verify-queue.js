#!/usr/bin/env node
/**
 * Stop hook for the local task queue (.claude/queue).
 *
 * No-ops completely when the queue is inactive (state.active === false) or
 * when there is no current_task — existing Claude Code behavior is
 * untouched in that case.
 *
 * This hook only ever does synchronous state bookkeeping (verify, report,
 * retry/circuit-break, checkpoint commit, pick next task). It never spawns
 * `claude` itself — that is deliberately left to queue/run-next.js so a
 * Stop hook can never block on (or recursively trigger) a long-running
 * child Claude session. See .claude/queue/README.md "Stop hook과
 * auto-advance 연결" for the reasoning.
 *
 * When active + a current_task is set: runs `tsc -b` then `vite build`
 * (invoked directly via node against node_modules/*, not `npx`, so it does
 * not depend on PATH), writes a report to .claude/queue/reports/, and:
 *   - verify fails, retries < max_retries  -> exit 2 (blocks Stop, stderr
 *     tells Claude what failed so it can fix the same task)
 *   - verify fails, retries >= max_retries -> deactivates the queue and
 *     allows Stop (circuit breaker, no infinite loop)
 *   - verify passes but the task file still has unchecked `- [ ]` items
 *     -> exit 2 (keep working on the same task)
 *   - verify passes and no unchecked items -> checkpoint-commits, records
 *     completion, and (if auto_advance) picks the next pending task file
 *     into current_task; allows Stop either way
 *
 * stop_hook_active (set by Claude Code when this hook already blocked once
 * this turn) is always honored as an immediate allow, to prevent recursive
 * blocking.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import {
  PROJECT_ROOT,
  REPORTS_DIR,
  TASKS_DIR,
  ensureReportsDir,
  findNextPendingTask,
  loadState,
  saveState,
} from '../queue/lib.js'

function readStdinJson() {
  try {
    const raw = readFileSync(0, 'utf8')
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

/** exit 0 = allow Claude to stop normally (no-op or task cleared) */
function allow(message) {
  if (message) process.stdout.write(message + '\n')
  process.exit(0)
}

/** exit 2 = block Stop; stderr text is fed back to Claude to act on */
function block(reason) {
  process.stderr.write(reason + '\n')
  process.exit(2)
}

function runNodeScript(scriptRelPath, args) {
  const scriptPath = path.join(PROJECT_ROOT, scriptRelPath)
  try {
    const out = execFileSync(process.execPath, [scriptPath, ...args], {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
      stdio: 'pipe',
    })
    return { ok: true, output: out }
  } catch (err) {
    const output = `${err.stdout || ''}${err.stderr || ''}` || String(err.message || err)
    return { ok: false, output }
  }
}

function countUnchecked(taskBody) {
  const matches = taskBody.match(/^\s*-\s*\[ \]/gm)
  return matches ? matches.length : 0
}

/**
 * Best-effort checkpoint commit after a task fully passes. Never throws —
 * a commit failure is logged to state.last_error but does not block Stop.
 * Stages the whole working tree (`git add -A`); .gitignore already keeps
 * node_modules, dist, env files, and the queue's own state.json / reports
 * out, so this never commits secrets or runtime queue state.
 */
function gitCheckpointCommit(taskFile, state) {
  try {
    const status = execFileSync('git', ['status', '--porcelain'], {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
    })
    if (status.trim().length === 0) return // nothing to commit
    execFileSync('git', ['add', '-A'], { cwd: PROJECT_ROOT, encoding: 'utf8' })
    execFileSync('git', ['commit', '-m', `queue: complete ${taskFile}`], {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
    })
  } catch (err) {
    state.last_error = `checkpoint commit failed for ${taskFile}: ${String(err.message || err).slice(0, 500)}`
  }
}

function main() {
  const input = readStdinJson()
  const state = loadState()

  // Queue not turned on -> do not touch normal Claude Code behavior.
  if (!state.active) allow()

  // Claude Code already re-invoked us once this turn after a block;
  // never block twice in a row (hard infinite-loop guard).
  if (input.stop_hook_active) allow()

  // Active but nothing queued -> nothing to verify.
  if (!state.current_task) allow()

  const taskFile = state.current_task
  const taskPath = path.join(TASKS_DIR, taskFile)
  if (!existsSync(taskPath)) {
    state.active = false
    state.current_task = null
    state.last_error = `task file missing: ${taskFile}`
    saveState(state)
    allow(`queue: task file missing (${taskFile}). Queue deactivated; check .claude/queue/state.json.`)
  }

  state.retries = state.retries || {}
  const attempt = (state.retries[taskFile] || 0) + 1

  const tsc = runNodeScript('node_modules/typescript/bin/tsc', ['-b'])
  const build = tsc.ok
    ? runNodeScript('node_modules/vite/bin/vite.js', ['build'])
    : { ok: false, output: '(skipped: tsc failed)' }

  const pass = tsc.ok && build.ok

  ensureReportsDir()
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const reportName = `${taskFile.replace(/\.md$/, '')}-attempt${attempt}-${stamp}.md`
  const reportBody = [
    `# Verify report: ${taskFile}`,
    ``,
    `- time: ${new Date().toISOString()}`,
    `- attempt: ${attempt} / ${state.max_retries}`,
    `- tsc: ${tsc.ok ? 'PASS' : 'FAIL'}`,
    `- build: ${build.ok ? 'PASS' : 'FAIL'}`,
    `- overall: ${pass ? 'PASS' : 'FAIL'}`,
    ``,
    '## tsc output',
    '```',
    (tsc.output || '(no output)').slice(-4000),
    '```',
    '',
    '## build output',
    '```',
    (build.output || '(no output)').slice(-4000),
    '```',
    '',
  ].join('\n')
  writeFileSync(path.join(REPORTS_DIR, reportName), reportBody)

  state.history.push({
    task: taskFile,
    report: reportName,
    pass,
    attempt,
    at: new Date().toISOString(),
  })

  if (!pass) {
    state.retries[taskFile] = attempt
    if (attempt >= state.max_retries) {
      state.active = false
      state.last_error = `task ${taskFile} failed verification ${attempt}/${state.max_retries} times (max retries reached).`
      saveState(state)
      allow(
        `queue: task ${taskFile} failed verification ${attempt}/${state.max_retries} times. ` +
          `Queue deactivated for manual review. Report: .claude/queue/reports/${reportName}`,
      )
    }
    saveState(state)
    block(
      `Task queue verification FAILED (attempt ${attempt}/${state.max_retries}) for ${taskFile}.\n` +
        `tsc: ${tsc.ok ? 'PASS' : 'FAIL'} / build: ${build.ok ? 'PASS' : 'FAIL'}\n` +
        `Fix the issue introduced for this task, then stop again to re-verify.\n` +
        `Full report: .claude/queue/reports/${reportName}\n\n` +
        `--- tail of failing output ---\n${(tsc.ok ? build.output : tsc.output).slice(-1500)}`,
    )
  }

  // Passed verification. Reset retry counter and any stale error for this task.
  delete state.retries[taskFile]
  state.last_error = null

  const taskBody = readFileSync(taskPath, 'utf8')
  const unchecked = countUnchecked(taskBody)
  if (unchecked > 0) {
    saveState(state)
    block(
      `Task queue verification passed for ${taskFile}, but ${unchecked} checklist item(s) ` +
        `are still unchecked ("- [ ]"). Continue working on the remaining items in this task, ` +
        `then stop again.`,
    )
  }

  // Fully complete: record it, checkpoint-commit, then decide what's next.
  state.completed_tasks.push({ task: taskFile, at: new Date().toISOString() })
  gitCheckpointCommit(taskFile, state)

  if (state.auto_advance) {
    const next = findNextPendingTask(state)
    state.current_task = next
    if (!next) state.active = false
    saveState(state)
    allow(
      next
        ? `queue: task ${taskFile} verified and complete. auto_advance is on, next task: ${next}. ` +
          `Run "node .claude/queue/run-next.js" (or "control.js start") to execute it.`
        : `queue: task ${taskFile} verified and complete. No pending tasks left, queue deactivated.`,
    )
  }

  state.current_task = null
  saveState(state)
  allow(
    `queue: task ${taskFile} verified and complete. current_task cleared (auto_advance is off). ` +
      `Set state.json.current_task to the next task file to continue the queue.`,
  )
}

main()
