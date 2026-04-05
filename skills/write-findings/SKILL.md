---
name: write-findings
description: "Write agent findings to the team session directory. Triggers: write findings, save output, report to session, write to session"
---

# /write-findings <filename>

Write a markdown file to `team-session/{your-name}/` to share findings with other agents.

## Usage

```
/write-findings design.md         # write design.md to your session dir
/write-findings progress.md       # write progress.md to your session dir
```

## Steps

1. **Determine agent name** — use the agent's own name (from its frontmatter `name` field) as the subdirectory
2. **Ensure directory exists** — create `team-session/{agent-name}/` if it doesn't exist
3. **Write the file** — write the content to `team-session/{agent-name}/<filename>`
4. **Confirm** — report the file path written

## Rules

- Always write to `team-session/{your-name}/` — never write to another agent's directory
- Use markdown format for all output files
- Include a timestamp in the file content when appropriate
- If team-session/ doesn't exist, warn that no session is active and the session-start hook may not have run
