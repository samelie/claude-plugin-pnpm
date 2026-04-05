---
name: summarize-session
description: "Summarize a team session — read all agent outputs and produce a consolidated summary. Triggers: summarize session, session summary, team summary, wrap up session"
---

# /summarize-session

Read all agent outputs from the current team session and produce a consolidated summary.

## Steps

1. **Check session exists** — verify `team-session/` symlink exists
2. **Read session metadata** — read `team-session/meta.json` for start time
3. **Discover agent outputs** — glob `team-session/*/` to find all agent directories
4. **Read each agent's output** — for each directory, read all `.md` files
5. **Synthesize summary** — produce a structured summary

## Output Format

```markdown
# Team Session Summary
**Started:** {timestamp from meta.json}
**Agents:** {count}

## Agent Reports

### {agent-name}
**Status:** {STATUS from their output}
**Output files:** {list}
**Key findings:** {1-3 bullet summary}

### {next agent}
...

## Overall Assessment
{2-3 sentences on what was accomplished, what remains}

## Action Items
- [ ] {items that need follow-up}
```

## Rules

- Read-only — don't modify any agent output files
- Include STATUS from each agent's output
- Be concise — summarize, don't restate everything
- Flag any agents that reported ERRORS_REMAINING or PARTIAL
