# Session Schema

> Canonical file system structure for team sessions. All agents MUST follow this schema.

## Session Root

```
team-session/{team-name}/
```

Where `{team-name}` = `YYYYMMDD-{slug}` (e.g., `20260424-vector-search`)

## File Structure

```
team-session/{team-name}/
│
├── [PLANNING PHASE - root level]
├── requirements.md          ← team-designer (write phase)
├── design.md                ← team-planner
├── team-plan.md             ← team-planner
├── team-scope.json          ← team-planner (hook config)
├── plan-review.md           ← team-plan-reviewer
│
├── [RESEARCH - subfolders by agent name]
├── researcher/
│   └── findings.md          ← team-researcher
│
├── [EXECUTION - subfolders by agent name]
├── architect/
│   └── brief.md             ← team-architect (module deep-dive)
│
├── coder-{name}/
│   └── progress.md          ← team-coder (each coder gets own folder)
│
├── spec-reviewer/
│   └── spec-review-{task-id}.md  ← team-spec-reviewer
│
├── reviewer/
│   └── review-{task-id}.md  ← team-reviewer
│
├── tester/
│   └── test-plan.md         ← team-tester
│   └── test-results.md
│
├── auditor/
│   └── audit-notes.md       ← team-auditor
│
├── security-auditor/
│   └── security-audit.md    ← team-security-auditor
│
├── verifier/
│   └── verification.md      ← team-verifier
│
├── finisher/
│   └── cleanup-report.md    ← team-finisher
│
├── [DEBUGGING - root level]
├── investigation.md         ← team-investigator (phase 1)
├── patterns.md              ← team-investigator (phase 2)
├── hypotheses.md            ← team-investigator (phase 3)
├── root-cause.md            ← team-investigator (conclusion)
├── evidence/                ← team-investigator (raw output)
│   └── {timestamp}-{label}.txt
│
└── [VALIDATION]
    └── validation-report.md ← lead (phase N+2)
```

## Rules

### 1. Planning artifacts go to root

These files are read by ALL agents:
- `requirements.md` — WHAT (acceptance criteria)
- `design.md` — HOW (architecture)
- `team-plan.md` — TASKS (assignments)

Root level = high visibility, easy to find.

### 2. Agent output goes to `{agent-type}/`

Each agent writes to its own subfolder:
```
{session_path}{agent-type}/
```

Examples:
- `team-session/20260424-feature/researcher/findings.md`
- `team-session/20260424-feature/coder-alice/progress.md`
- `team-session/20260424-feature/auditor/audit-notes.md`

### 3. Multiple instances use `{agent-type}-{name}/`

When same agent type runs multiple times:
- `coder-alice/` — first coder
- `coder-bob/` — second coder
- `spec-reviewer/spec-review-T1.md` — one file per task

### 4. Read from known paths, write to your folder

| Agent | Reads | Writes to |
|-------|-------|-----------|
| team-designer | (prompt only) | `requirements.md` (root) |
| team-researcher | codebase, knowledge tools | `researcher/findings.md` |
| team-planner | `requirements.md`, `researcher/findings.md` | `design.md`, `team-plan.md` (root) |
| team-plan-reviewer | `requirements.md`, `design.md`, `team-plan.md` | `plan-review.md` (root) |
| team-architect | `design.md`, `team-plan.md` | `architect/brief.md` |
| team-coder | `design.md`, `team-plan.md`, `architect/brief.md` | `coder-{name}/progress.md` |
| team-spec-reviewer | `requirements.md`, coder output | `spec-reviewer/spec-review-{task}.md` |
| team-reviewer | coder output, spec-reviewer output | `reviewer/review-{task}.md` |
| team-tester | `design.md`, coder output | `tester/test-plan.md`, `tester/test-results.md` |
| team-auditor | `design.md`, coder output | `auditor/audit-notes.md` |
| team-verifier | all source files | `verifier/verification.md` |
| team-finisher | auditor output, coder output | `finisher/cleanup-report.md` |

### 5. Phase gates check file existence

| After Phase | Required Files |
|-------------|----------------|
| Planning | `requirements.md`, `design.md`, `team-plan.md`, `plan-review.md` |
| Research | `researcher/findings.md` |
| Implementation | `coder-*/progress.md` for each assigned coder |
| Review | `spec-reviewer/spec-review-*.md`, `reviewer/review-*.md` |
| Finalization | `verifier/verification.md`, `finisher/cleanup-report.md` |

## File Content Templates

### requirements.md

```markdown
# Requirements: {Feature Name}

Created: {date}
Status: Approved

## Problem
## Requirements (Must Have / Nice to Have / Out of Scope)
## Chosen Approach
## Acceptance Criteria (Given/When/Then table)
## Constraints
## Decisions Made (table)
## Open Questions (table)
```

### design.md

```markdown
# Design: {Feature Name}

Created: {date}
Requirements: team-session/{team-name}/requirements.md

## Components
## Interfaces (TypeScript signatures)
## Data Flow
## Patterns
## Risks (table with severity)
## Decisions Made (table)
## Requirement Traceability (AC-* to components)
## Validation Strategy
```

### team-plan.md

```yaml
# YAML frontmatter
name: "{team-name}"
version: 1
packages: ["@scope/pkg"]
phases: N
delegate_mode: true
```

```markdown
## Team Structure (table)
## File Ownership Matrix
## Tasks (T-1, T-2, ...)
## Phase Transitions
## Orchestration Flow
## Agent Prompts
## Verification Commands
```

### progress.md (coder)

```markdown
# Progress: {agent-name}

## Completed
- T-X: {what was done}

## In Progress
- T-Y: {current status}

## Blocked
- T-Z: {why blocked}

## Files Modified
- `path/to/file.ts` — {what changed}

STATUS: CLEAN | PARTIAL | ERRORS_REMAINING: N
```

### findings.md (researcher)

```markdown
# Research Findings: {topic}

## Summary
## Key Findings (with file paths, code snippets)
## Patterns Discovered
## Recommendations
## Open Questions

STATUS: CLEAN | PARTIAL | ERRORS_REMAINING: N
```

## Using This Schema

Every team agent prompt MUST include:

```markdown
## Session Path

Session path: `team-session/{team-name}/`

Read schema: `${CLAUDE_PLUGIN_ROOT}/team-templates/SESSION-SCHEMA.md`
Write your output to: `{session_path}{your-folder}/`
```

Agents use `write-findings` and `read-findings` skills for I/O.
