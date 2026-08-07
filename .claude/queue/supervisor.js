/**
 * OpenAI supervisor integration.
 *
 * Called only from verify-queue.js, only after local verify (tsc/build +
 * checklist) has already fully passed, and only when
 * state.supervisor_enabled is true. Never touches app source — it only
 * reads context and returns a structured decision; verify-queue.js is the
 * one place that acts on that decision (commit / block / deactivate).
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import OpenAI from 'openai'
import { PROJECT_ROOT, REPORTS_DIR, TASKS_DIR } from './lib.js'
import { SUPERVISOR_DECISION_SCHEMA, SUPERVISOR_DECISION_SCHEMA_NAME, validateSupervisorDecision } from './supervisor-schema.js'

const PROMPT_PATH = path.join(PROJECT_ROOT, '.claude', 'queue', 'prompts', 'supervisor-system.md')

const DEFAULT_MODEL = 'gpt-5.1'
const REQUEST_TIMEOUT_MS = 30_000
const SDK_MAX_RETRIES = 2 // transient (429/5xx/timeout) retries only; SDK does not retry auth errors

/** Cumulative, cross-task safety cap independent of per-task retry budget. */
export const MAX_SUPERVISOR_CALLS_TOTAL = 30

const MAX_DIFF_CHARS = 8000
const MAX_OUTPUT_CHARS = 3000
const MAX_REPORT_CHARS = 4000
const MAX_TASK_MD_CHARS = 6000

const MASTER_SPEC_PATH_FRAGMENT = 'Master_Spec_v1.0'

function truncate(str, max) {
  if (!str) return ''
  return str.length > max ? `${str.slice(0, max)}\n...[truncated, ${str.length - max} more chars]` : str
}

/**
 * Best-effort extraction of Claude's own last assistant message from the
 * session transcript Claude Code hands the Stop hook (transcript_path in
 * stdin). Never throws; returns a placeholder if unavailable/unreadable.
 * Only the message TEXT is used — the transcript path itself (a filesystem
 * path under the user's home directory) is never sent anywhere.
 */
function extractCompletionReport(transcriptPath) {
  if (!transcriptPath || !existsSync(transcriptPath)) {
    return '(no completion report available: transcript_path missing)'
  }
  try {
    const lines = readFileSync(transcriptPath, 'utf8').split('\n').filter(Boolean)
    for (let i = lines.length - 1; i >= 0; i--) {
      let entry
      try {
        entry = JSON.parse(lines[i])
      } catch {
        continue
      }
      const message = entry?.message
      if (entry?.type === 'assistant' && message?.role === 'assistant' && Array.isArray(message.content)) {
        const text = message.content
          .filter((block) => block?.type === 'text' && typeof block.text === 'string')
          .map((block) => block.text)
          .join('\n')
          .trim()
        if (text) return truncate(text, MAX_REPORT_CHARS)
      }
    }
    return '(no completion report available: no assistant text message found in transcript)'
  } catch (err) {
    return `(no completion report available: ${String(err.message || err)})`
  }
}

/** git diff --stat / name list / capped patch, relative to HEAD, working tree only. */
function collectGitDiffSummary() {
  const run = (args) => {
    try {
      return execFileSync('git', args, { cwd: PROJECT_ROOT, encoding: 'utf8' })
    } catch (err) {
      return `(git ${args.join(' ')} failed: ${String(err.message || err)})`
    }
  }
  const stat = run(['diff', '--stat', 'HEAD'])
  const files = run(['diff', '--name-only', 'HEAD']).split('\n').filter(Boolean)
  const patch = truncate(run(['diff', 'HEAD']), MAX_DIFF_CHARS)
  const masterSpecChanged = files.some((f) => f.includes(MASTER_SPEC_PATH_FRAGMENT))
  return { stat: truncate(stat, MAX_OUTPUT_CHARS), files, patch, masterSpecChanged }
}

function buildUserPayload(ctx) {
  const checklistLines = (ctx.taskBody.match(/^\s*-\s*\[[ x]\].*$/gim) || []).join('\n')
  return [
    `## Task file: .claude/queue/tasks/${ctx.taskFile}`,
    truncate(ctx.taskBody, MAX_TASK_MD_CHARS),
    '',
    '## Acceptance checklist (as currently marked in the task file)',
    checklistLines || '(no checklist items found)',
    '',
    "## Claude's completion report (last assistant message)",
    ctx.completionReport,
    '',
    '## git diff --stat (working tree vs HEAD)',
    ctx.gitDiffStat,
    '',
    '## Changed files',
    ctx.changedFiles.length ? ctx.changedFiles.join('\n') : '(no files changed)',
    '',
    '## git diff (may be truncated)',
    '```diff',
    ctx.gitDiffPatch,
    '```',
    '',
    '## tsc output',
    '```',
    truncate(ctx.tscOutput, MAX_OUTPUT_CHARS),
    '```',
    '',
    '## vite build output',
    '```',
    truncate(ctx.buildOutput, MAX_OUTPUT_CHARS),
    '```',
    '',
    '## Queue state',
    `- current_task: ${ctx.taskFile}`,
    `- retry_count_for_this_task: ${ctx.retryCount}`,
    `- master_spec_changed: ${ctx.masterSpecChanged}`,
  ].join('\n')
}

/**
 * Runs one supervisor review call. Returns:
 *   { kind: 'decision', decision, raw }
 *   { kind: 'error', message }   -- auth/rate-limit/network/parse failure
 *   { kind: 'skipped', message } -- cumulative call cap reached
 * Mutates `state.supervisor_calls` on every actual API attempt so the
 * caller can persist it regardless of outcome.
 */
export async function runSupervisorReview(ctx, state) {
  if ((state.supervisor_calls || 0) >= MAX_SUPERVISOR_CALLS_TOTAL) {
    return { kind: 'skipped', message: `MAX_SUPERVISOR_CALLS_TOTAL (${MAX_SUPERVISOR_CALLS_TOTAL}) reached` }
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return { kind: 'error', message: 'OPENAI_API_KEY is not set in the environment' }
  }

  const model = process.env.OPENAI_SUPERVISOR_MODEL || DEFAULT_MODEL
  const systemPrompt = existsSync(PROMPT_PATH)
    ? readFileSync(PROMPT_PATH, 'utf8')
    : 'You are a strict code reviewer. Return only the structured decision.'

  const client = new OpenAI({ apiKey, maxRetries: SDK_MAX_RETRIES, timeout: REQUEST_TIMEOUT_MS })

  state.supervisor_calls = (state.supervisor_calls || 0) + 1

  let response
  try {
    response = await client.responses.create({
      model,
      input: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: buildUserPayload(ctx) },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: SUPERVISOR_DECISION_SCHEMA_NAME,
          schema: SUPERVISOR_DECISION_SCHEMA,
          strict: true,
        },
      },
    })
  } catch (err) {
    return { kind: 'error', message: `OpenAI API call failed: ${String(err.message || err)}` }
  }

  let parsed
  try {
    parsed = JSON.parse(response.output_text)
  } catch (err) {
    return { kind: 'error', message: `supervisor response was not valid JSON: ${String(err.message || err)}` }
  }

  const validation = validateSupervisorDecision(parsed)
  if (!validation.ok) {
    return { kind: 'error', message: `supervisor response failed validation: ${validation.reason}` }
  }

  return { kind: 'decision', decision: validation.decision, raw: response.output_text }
}

export function gatherSupervisorContext({ taskFile, taskBody, transcriptPath, tscOutput, buildOutput, retryCount }) {
  const diff = collectGitDiffSummary()
  return {
    taskFile,
    taskBody,
    completionReport: extractCompletionReport(transcriptPath),
    gitDiffStat: diff.stat,
    changedFiles: diff.files,
    gitDiffPatch: diff.patch,
    masterSpecChanged: diff.masterSpecChanged,
    tscOutput,
    buildOutput,
    retryCount,
  }
}

export function writeSupervisorReport(taskFile, attempt, outcome) {
  mkdirSync(REPORTS_DIR, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const name = `${taskFile.replace(/\.md$/, '')}-supervisor-attempt${attempt}-${stamp}.md`
  const body = [
    `# Supervisor report: ${taskFile}`,
    ``,
    `- time: ${new Date().toISOString()}`,
    `- attempt: ${attempt}`,
    `- outcome: ${outcome.kind}`,
    outcome.kind === 'decision' ? `- decision: ${outcome.decision.decision}` : `- message: ${outcome.message}`,
    ``,
    '## raw response',
    '```json',
    outcome.kind === 'decision' ? outcome.raw : '(none)',
    '```',
    '',
  ].join('\n')
  writeFileSync(path.join(REPORTS_DIR, name), body)
  return name
}

function slugify(title) {
  return (
    (title || 'task')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 40)
      .replace(/-+$/, '') || 'task'
  )
}

/** Creates .claude/queue/tasks/9NNN-supervisor-<slug>.md, returns the filename. */
export function createSupervisorTask(nextTask) {
  const existing = existsSync(TASKS_DIR) ? readdirSync(TASKS_DIR) : []
  const nums = existing
    .map((f) => f.match(/^9(\d{3})-supervisor-/))
    .filter(Boolean)
    .map((m) => Number(m[1]))
  const nextNum = nums.length ? Math.max(...nums) + 1 : 0
  const filename = `9${String(nextNum).padStart(3, '0')}-supervisor-${slugify(nextTask.title)}.md`
  const body = [
    `# ${nextTask.title || 'Supervisor-generated task'}`,
    '',
    '(auto-generated by OpenAI supervisor after a PASS decision)',
    '',
    nextTask.instructions_markdown || '- [ ] (no instructions provided)',
    '',
  ].join('\n')
  mkdirSync(TASKS_DIR, { recursive: true })
  writeFileSync(path.join(TASKS_DIR, filename), body)
  return filename
}

export function formatRevisionPrompt(decision) {
  const issueLines = decision.issues.length
    ? decision.issues
        .map((i) => `- [${i.severity}] ${i.file || '(no file)'}: ${i.description}\n  fix: ${i.required_fix}`)
        .join('\n')
    : '(no specific issues listed)'
  return (
    `Supervisor requested REVISE for this task.\n\n` +
    `Summary: ${decision.summary}\n\n` +
    `Issues:\n${issueLines}\n\n` +
    `Address these, keep the checklist boxes accurate, and make sure tsc/build still pass, then stop again.`
  )
}
