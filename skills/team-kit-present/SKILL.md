---
name: team-kit-present
description: "Present design section-by-section with approval gates. Lead invokes after planner returns design.md + team-plan.md."
---

# team-kit-present — Section-by-Section Design Approval

Present design incrementally, get user approval at each stage.

## When to Use

Lead invokes after planner returns `design.md` + `team-plan.md`.

**Purpose**: Catch misunderstandings early. Don't wait until full design is presented to discover component A is wrong. Incremental approval = incremental correction.

## Methodology

Present design in 4 sections. Each section gets explicit approval before proceeding.

### Section 1: Components / Architecture

Present the high-level structure:

```markdown
## Components

Here's the component structure from the design:

| Component | Role |
|-----------|------|
| [Name] | [1-line description] |
| [Name] | [1-line description] |

**Interactions**: [brief description of how components connect]

Does this structure look right?
```

**If rejected**: Ask what's wrong → revise design.md → re-present section.

**If approved**: Proceed to Section 2.

### Section 2: Data Flow / Interfaces

Present how data moves and key interfaces:

```markdown
## Data Flow

[Brief description of data flow between components]

**Key interfaces**:
- `[FunctionName](args): ReturnType` — [purpose]
- `[TypeName]` — [what it represents]

Does this match your expectations?
```

**If rejected**: Clarify misunderstanding → revise → re-present.

**If approved**: Proceed to Section 3.

### Section 3: File Ownership

Present the ownership matrix from team-plan.md:

```markdown
## File Ownership

| Agent | Files Owned |
|-------|-------------|
| [agent-a] | `packages/pkg-a/src/**` |
| [agent-b] | `packages/pkg-b/src/**` |

No overlaps. Each file has exactly one owner.

Approve ownership distribution?
```

**If rejected**: Discuss concerns → adjust assignments → re-present.

**If approved**: Proceed to Section 4.

### Section 4: Task List

Present tasks from team-plan.md:

```markdown
## Tasks

| ID | Title | Phase | Agent | Blocked By |
|----|-------|-------|-------|------------|
| T1 | [title] | 1 | [agent] | none |
| T2 | [title] | 1 | [agent] | none |
| T3 | [title] | 2 | [agent] | T1, T2 |

**Phase 1**: [count] tasks (parallel)
**Phase 2**: [count] tasks (after phase 1)

Approve task breakdown?
```

**If rejected**: Discuss → revise tasks → re-present.

**If approved**: All sections complete.

## Exit Condition

Presentation complete when ALL sections approved:

```
[ ] Components/Architecture — approved
[ ] Data Flow/Interfaces — approved
[ ] File Ownership — approved
[ ] Task List — approved
```

Then:

> "Design approved. Proceeding to post-plan review."

Invoke `team-kit-review`.

## Handling Rejection

When user rejects a section:

1. **Ask specifically**: "What's wrong with [section]?"
2. **Clarify**: Ensure you understand the issue
3. **Decide action**:
   - Minor fix → edit design.md/team-plan.md inline
   - Major issue → may need to re-run planner with feedback
4. **Re-present**: Show revised section, get approval

Don't proceed to next section until current is approved.

## Presentation Tips

- **Keep it scannable** — tables, bullet points, not walls of text
- **Reference files** — "Full details in `design.md` lines 45-60"
- **Highlight decisions** — "Chose X over Y because [reason]"
- **Invite questions** — "Any concerns before we proceed?"

## Anti-Patterns

| Don't | Do |
|-------|-----|
| Present entire design at once | Section by section |
| Move on without explicit approval | Wait for "yes" or "approved" |
| Ignore partial rejection | Address every concern |
| Re-present unchanged content | Show what changed |
| Skip sections for "simple" designs | All 4 sections, every time |
