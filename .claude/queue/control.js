#!/usr/bin/env node
/**
 * Queue control CLI.
 *   node .claude/queue/control.js status|start|stop|next|reset|list
 *   node .claude/queue/control.js supervisor-on|supervisor-off
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PROJECT_ROOT, TASKS_DIR, defaultState, loadState, saveState } from './lib.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const RUN_NEXT = path.join(__dirname, 'run-next.js')

function runRunner(extraArgs) {
  try {
    execFileSync(process.execPath, [RUN_NEXT, ...extraArgs], {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
    })
  } catch (err) {
    // run-next.js already printed its own reason; just propagate the exit code.
    process.exit(typeof err.status === 'number' ? err.status : 1)
  }
}

function cmdStatus() {
  console.log(JSON.stringify(loadState(), null, 2))
}

function cmdStart() {
  const state = loadState()
  state.active = true
  state.auto_advance = true
  saveState(state)
  console.log('queue: active=true, auto_advance=true. Starting runner (Ctrl+C to abort)...')
  runRunner([])
}

function cmdStop() {
  const state = loadState()
  state.active = false
  saveState(state)
  console.log('queue: active=false. Stop hook and any future runner invocation are now no-ops.')
}

function cmdNext() {
  const state = loadState()
  if (!state.active) {
    state.active = true
    saveState(state)
    console.log('queue: was inactive, set active=true for this single run.')
  }
  console.log('queue: running exactly one task (--once)...')
  runRunner(['--once'])
}

function cmdReset() {
  saveState(defaultState())
  console.log('queue: state.json reset to defaults (active=false, auto_advance=false, no current task).')
}

function cmdList() {
  const state = loadState()
  const done = new Set((state.completed_tasks || []).map((t) => t.task))
  const files = existsSync(TASKS_DIR)
    ? readdirSync(TASKS_DIR).filter((f) => f.endsWith('.md')).sort()
    : []
  if (files.length === 0) {
    console.log('(no task files in .claude/queue/tasks/)')
    return
  }
  for (const f of files) {
    const tag = f === state.current_task ? 'CURRENT' : done.has(f) ? 'done' : 'pending'
    console.log(`${tag.padEnd(8)} ${f}`)
  }
}

function cmdSupervisorOn() {
  if (!process.env.OPENAI_API_KEY) {
    console.log(
      'queue: OPENAI_API_KEY is not set in this environment. Refusing to enable the supervisor.\n' +
        'Set it for this PowerShell session only (never commit it):\n' +
        '  $env:OPENAI_API_KEY="..."',
    )
    process.exit(1)
  }
  const state = loadState()
  state.supervisor_enabled = true
  saveState(state)
  console.log(
    'queue: supervisor_enabled=true. Task completions will now be reviewed by the OpenAI ' +
      'supervisor after local tsc/build + checklist pass. (API key value is never logged.)',
  )
}

function cmdSupervisorOff() {
  const state = loadState()
  state.supervisor_enabled = false
  saveState(state)
  console.log('queue: supervisor_enabled=false. Local tsc/build + checklist verification still applies.')
}

const [, , cmd] = process.argv
const commands = {
  status: cmdStatus,
  start: cmdStart,
  stop: cmdStop,
  next: cmdNext,
  reset: cmdReset,
  list: cmdList,
  'supervisor-on': cmdSupervisorOn,
  'supervisor-off': cmdSupervisorOff,
}

if (!commands[cmd]) {
  console.log(
    'usage: node .claude/queue/control.js <status|start|stop|next|reset|list|supervisor-on|supervisor-off>',
  )
  process.exit(1)
}
commands[cmd]()
