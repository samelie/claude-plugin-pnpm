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
├── [ORIGINAL REQUEST - persisted immediately, never modified]
├── prompt.md                ← lead (raw user request + initial context)
│
├── [DESIGNER PHASES - progressive refinement]
├── designer/
│   ├── clarify.md           ← team-designer (clarify phase, Q&A + resolved reqs)
│   ├── explore.md           ← team-designer (explore phase, reads clarify.md)
│   ├── present.md           ← team-designer (present phase, reads clarify + explore)
│   └── refine.md            ← team-designer (refine phase, post-research grilling + decisions)
│
├── [PLANNING PHASE - root level]
├── requirements.md          ← team-designer (write phase, updated by refine phase)
├── design.md                ← team-planner (reads requirements.md + refine.md)
├── team-plan.md             ← team-planner (reads requirements.md + refine.md)
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
│   └── results.md           ← team-verifier
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
    └── validation-report.md ← team-verifier (phase N+2)
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
| lead | user request | `prompt.md` (root, once, never modified) |
| team-designer (clarify) | (prompt only) | `designer/clarify.md` |
| team-designer (explore) | `designer/clarify.md` | `designer/explore.md` |
| team-designer (present) | `designer/clarify.md`, `designer/explore.md` | `designer/present.md` |
| team-designer (write) | all `designer/*.md` | `requirements.md` (root) |
| team-researcher | `requirements.md`, codebase, knowledge tools | `researcher/findings.md` |
| team-designer (refine) | `requirements.md`, `researcher/findings.md`, `prompt.md` | `designer/refine.md` + updates `requirements.md` |
| team-planner | `requirements.md`, `researcher/findings.md`, `designer/refine.md` | `design.md`, `team-plan.md` (root) |
| team-plan-reviewer | `requirements.md`, `design.md`, `team-plan.md` | `plan-review.md` (root) |
| team-architect | `design.md`, `team-plan.md` | `architect/brief.md` |
| team-coder | `design.md`, `team-plan.md`, `architect/brief.md` | `coder-{name}/progress.md` |
| team-spec-reviewer | `requirements.md`, coder output | `spec-reviewer/spec-review-{task-id}.md` |
| team-reviewer | coder output, spec-reviewer output | `reviewer/review-{task-id}.md` |
| team-tester | `design.md`, coder output | `tester/test-plan.md`, `tester/test-results.md` |
| team-auditor | `design.md`, coder output | `auditor/audit-notes.md` |
| team-verifier | all source files | `verifier/results.md`, `validation-report.md` (phase N+2) |
| team-finisher | auditor output, coder output | `finisher/cleanup-report.md` |

### 5. Phase gates check file existence

| After Phase | Required Files |
|-------------|----------------|
| Prompt | `prompt.md` |
| Planning | `requirements.md`, `design.md`, `team-plan.md`, `plan-review.md` |
| Research | `researcher/findings.md` |
| Refine | `designer/refine.md`, updated `requirements.md` |
| Implementation | `coder-*/progress.md` for each assigned coder |
| Review | `spec-reviewer/spec-review-*.md`, `reviewer/review-*.md` |
| Finalization | `verifier/results.md`, `finisher/cleanup-report.md` |

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

### prompt.md (lead)

```markdown
# Original Request

Date: {date}
Session: {team-name}

## Raw Prompt

{exact user input, unmodified}

## Initial Context

{branch, recent work, what user was doing when request was made}
```

### refine.md (designer)

```markdown
# Refine: {Feature Name}

Created: {date}
Phase: refine
Reads: requirements.md, researcher/findings.md, prompt.md
Status: in-progress | complete
Round: {N}/10
Mode: semi-autonomous
Self-resolved: {count}
Human-resolved: {count}

## Research Insights Applied

| Finding | From | Impact on Requirements | Action |
|---------|------|----------------------|--------|

## Q&A Log

| # | Question | Recommended Answer | Answer | Source | Requirement Updated |
|---|----------|--------------------|--------|--------|---------------------|

Source values: `user (round N)` or `self-resolved (round N)`

## Decisions Made (Refine Phase)

| Decision | Rationale | Source |
|----------|-----------|--------|

## Requirements.md Changes

| Section | Change | Reason |
|---------|--------|--------|

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
