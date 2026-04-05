---
name: read-findings
description: "Read agent findings from the team session directory. Triggers: read findings, read session, read team output, check progress"
---

# /read-findings <path>

Read markdown files from `team-session/<path>/` to retrieve another agent's output.

## Usage

```
/read-findings architect          # read from team-session/architect/
/read-findings coder-1            # read from team-session/coder-1/
/read-findings */progress.md      # read progress.md from all agents
```

## Steps

1. **Resolve path** — if `<path>` is provided, look in `team-session/<path>/`. If `*` is used, glob across all subdirectories.
2. **Check directory exists** — if `team-session/<path>/` doesn't exist, report that no findings are available for that agent yet.
3. **Read all .md files** — glob `team-session/<path>/*.md` and read each file.
4. **Present content** — display each file's contents with its filename as a header.

## Rules

- This is a read-only skill — never modify files in team-session/
- If the team-session/ symlink doesn't exist, inform the agent that no session is active
- Handle missing directories gracefully — the target agent may not have written output yet
