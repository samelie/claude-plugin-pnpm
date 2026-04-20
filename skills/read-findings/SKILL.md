---
name: read-findings
description: "Read agent findings from the team session directory. Triggers: read findings, read session, read team output, check progress"
---

# /read-findings [session-path/]<agent-name>

Read markdown files from another agent's session output.

## Usage

```
/read-findings architect                                       # uses $SESSION_PATH/architect/
/read-findings team-session/20260420-feature/architect         # explicit path
/read-findings */progress.md                                   # glob across all agents in session
```

## Path Resolution

The skill determines the session directory in this order:

1. **Explicit path provided** — if path contains team-session/, use it directly
   - `team-session/20260420-feature/architect` → reads from there
   
2. **SESSION_PATH from prompt** — if lead provided session path in your prompt, use it
   - Look for "Session path:" or "Read from:" in your instructions
   - Example: "Session path: `team-session/20260420-cs-submittals/`"
   - Reads: `{session_path}/{agent-name}/*.md`

3. **Fallback to symlink** — if `team-session/` symlink exists, use it
   - Reads: `team-session/{agent-name}/*.md`
   - ⚠️ This only works for single active session

## Steps

1. **Parse path** — extract session path and agent name from argument
2. **Resolve full path** — `{session_path}/{agent-name}/`
3. **Check directory exists** — if not, report agent hasn't written output yet
4. **Read all .md files** — glob `*.md` in the directory
5. **Present content** — display each file with filename as header

## Glob Patterns

```
/read-findings */progress.md      # progress.md from ALL agents in session
/read-findings coder-*            # all coder agent directories
/read-findings architect/*.md     # all files from architect (explicit)
```

## Example

Lead prompt includes:
> Session path: `team-session/20260420-cs-submittals/`

Agent runs:
```
/read-findings researcher
```

Result: reads all .md files from `team-session/20260420-cs-submittals/researcher/`

## Rules

- This is a read-only skill — never modify files
- Handle missing directories gracefully — target agent may not have written yet
- If no session path can be determined, warn and ask lead for clarification
- **IMPORTANT**: If lead provided explicit session path in your prompt, USE IT

## For Leads

When spawning agents, ALWAYS include session path in the prompt:

```
Session path: `team-session/{team-name}/`
Read other agents' output from this session directory.
```

This ensures all agents read from the same team folder.
