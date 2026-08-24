# Samindang

## Installed Claude Code skill: humanize-korean

This project vendors the `humanize-korean` skill from
[epoko77-ai/im-not-ai](https://github.com/epoko77-ai/im-not-ai) (v2.3.2, MIT
license) so it works out of the box for anyone opening this repo in Claude
Code — no separate plugin marketplace install step required.

It rewrites AI-drafted Korean text (ChatGPT/Claude/Gemini drafts) into more
natural-sounding Korean by fixing translation-ese phrasing, mechanical
parallelism, overused AI stock phrases, passive-voice overuse, etc., while
leaving facts, numbers, proper nouns, and direct quotes untouched.

### Usage

In a Claude Code session in this repo, either:

- Natural language: "이 AI 글 자연스럽게 윤문해줘: [text]"
- Slash command: `/humanize [text or file path]`
- Re-run a pass: `/humanize-redo "번역투만 다시"`

### What was installed

| Path | Purpose |
|---|---|
| `.claude/skills/humanize-korean/` | Main orchestrator skill (SKILL.md + reference rulebook/taxonomy) |
| `.claude/skills/humanize/` | `/humanize` entry-point skill |
| `.claude/skills/humanize-redo/` | `/humanize-redo` re-pass skill |
| `.claude/agents/` | The 4 subagents the skill actually calls at runtime (`humanize-monolith`, `humanize-diagnostician`, `humanize-finalizer`, `korean-ai-tell-taxonomist`) |
| `scripts/` | Deterministic Python helpers the skill shells out to (scoring shim, change-rate/structure gates, chunk reassembly, text sanitization) |
| `.claude-plugin/plugin.json` | Plugin marker the skill's `${SKILL_ROOT}` path-resolution logic looks for |
| `.claude-plugin/LICENSE-im-not-ai` | Upstream MIT license, preserved per license terms |

Only the runtime-used subset of upstream's 9 agents was installed (matching
upstream's own default `install.sh` scope) — 5 release-tooling agents were
left out since they're unrelated to running the skill.

### Updating

To pick up a newer upstream release, re-sync `.claude/skills/humanize-korean`,
`.claude/skills/humanize`, `.claude/skills/humanize-redo`, `scripts/`, and the
four `.claude/agents/*.md` files listed above from
https://github.com/epoko77-ai/im-not-ai.
