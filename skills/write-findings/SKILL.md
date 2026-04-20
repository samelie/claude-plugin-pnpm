---
name: write-findings
description: "Write agent findings to the team session directory. Triggers: write findings, save output, report to session, write to session"
---

# /write-findings [session-path/]<filename>

Write a markdown file to share findings with other agents.

## Usage

```
/write-findings progress.md                                    # uses $SESSION_PATH/{your-name}/
/write-findings team-session/20260420-feature/progress.md      # explicit path
/write-findings design.md                                      # uses $SESSION_PATH/{your-name}/
```

## Path Resolution

The skill determines the output directory in this order:

1. **Explicit path provided** — if path contains `/`, use it directly
   - `team-session/20260420-feature/researcher/progress.md` → writes there
   
2. **SESSION_PATH from prompt** — if lead provided session path in your prompt, use it
   - Look for "Session path:" or "Write output to:" in your instructions
   - Example: "Session path: `team-session/20260420-cs-submittals/`"
   - Output: `{session_path}/{your-name}/{filename}`

3. **Fallback to symlink** — if `team-session/` symlink exists, use it
   - Output: `team-session/{your-name}/{filename}`
   - ⚠️ This only works for single active session

## Steps

1. **Parse path** — extract session path and filename from argument
2. **Determine agent name** — use your agent name as subdirectory
3. **Resolve full path** — `{session_path}/{agent-name}/{filename}`
4. **Ensure directory exists** — create parent directories if needed
5. **Write the file** — write content as markdown
6. **Confirm** — report the full file path written

## Example

Lead prompt includes:
> Session path: `team-session/20260420-cs-submittals/`

Agent runs:
```
/write-findings progress.md
```

Result:
```
team-session/20260420-cs-submittals/researcher/progress.md
```

## Rules

- Always write to `{session_path}/{your-name}/` — never to another agent's directory
- Use markdown format for all output files
- Include a timestamp in file content when appropriate
- If no session path can be determined, warn and ask lead for clarification
- **IMPORTANT**: If lead provided explicit session path in your prompt, USE IT

## For Leads

When spawning agents, ALWAYS include session path in the prompt:

```
Session path: `team-session/{team-name}/`
Write all output to this session directory.
```

This ensures all agents write to the same team folder.
