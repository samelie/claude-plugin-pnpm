#!/usr/bin/env node
// SubagentStop hook: team role agents must end with a terminal STATUS line.
// contract (code.claude.com/docs/en/hooks.md → Stop and SubagentStop decision control):
//   allow = exit 0, no decision on stdout
//   block = exit 0 + stdout {"decision":"block","reason":"..."}; reason is delivered to the
//           subagent as its next instruction
// enforced only for team role agents, keyed on payload agent_type (team-*, optionally
// plugin-scoped `<plugin>:team-*`). agent_type carries the custom agentType in both lanes —
// native dispatch and workflow agent({agentType}) (probe PR-3b, 2.1.296); default workflow
// agents report `workflow-subagent` and are not enforced.
// fail-open everywhere: unparseable stdin, missing/empty last_assistant_message (a schema
// agent ends on a StructuredOutput call with no text), stop_hook_active (already continuing
// because of a stop hook — never block twice; the platform also caps at 8 consecutive blocks
// (changelog 2.1.143, CLAUDE_CODE_STOP_HOOK_BLOCK_CAP)).
// never set onFailure:"block" on this hook — a crashing SubagentStop hook would trap agents.

const OBSERVERS = new Set(['intent-keeper', 'coder-guard'])
const TEAM_ROLE = /^(?:[\w.-]+:)?(team-[a-z0-9-]+)$/i
// terminal verdicts only — IN_PROGRESS is the non-terminal progress.md marker, not a verdict
const TERMINAL = /STATUS:\s*\**\s*(CLEAN|PARTIAL|DONE_WITH_CONCERNS|BLOCKED|NEEDS_CONTEXT|ERRORS_REMAINING)\b/i

const REASON = "Missing terminal STATUS line. Your final message must end with one of: "
  + "'STATUS: CLEAN', 'STATUS: ERRORS_REMAINING: <count> <what>', "
  + "'STATUS: PARTIAL — completed N/M, remaining: <list>', 'STATUS: DONE_WITH_CONCERNS — <concerns>', "
  + "'STATUS: BLOCKED — <what blocks you>', or 'STATUS: NEEDS_CONTEXT — <what you need>'."

// mirrors stage-templates.js statusLineOf: the agent's own last STATUS line, not a quoted peer's
const statusLineOf = (text) => {
  const anchored = text.split('\n').map(l => l.trim()).filter(l => /^\**\s*STATUS:/i.test(l))
  if (anchored.length) return anchored[anchored.length - 1]
  const idx = text.toUpperCase().lastIndexOf('STATUS:')
  return idx < 0 ? null : text.slice(idx, idx + 120)
}

const decide = (raw) => {
  let payload
  try {
    payload = JSON.parse(raw)
  } catch {
    return null
  }
  if (!payload || typeof payload !== 'object' || payload.stop_hook_active === true) return null
  const role = TEAM_ROLE.exec(String(payload.agent_type ?? ''))
  if (!role || OBSERVERS.has(role[1].toLowerCase())) return null
  const text = typeof payload.last_assistant_message === 'string' ? payload.last_assistant_message : ''
  if (!text.trim()) return null
  const line = statusLineOf(text)
  if (line && TERMINAL.test(line)) return null
  return { decision: 'block', reason: REASON }
}

const main = async () => {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  const verdict = decide(Buffer.concat(chunks).toString('utf8'))
  if (verdict) process.stdout.write(JSON.stringify(verdict))
}

// exitCode, not process.exit(): stdout to a pipe is async on macOS and exit() can truncate it
main()
  .catch(() => {})
  .finally(() => { process.exitCode = 0 })
