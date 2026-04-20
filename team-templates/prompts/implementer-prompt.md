# Implementer Prompt Template

Use this template when spawning a coder/implementer agent.

> Methodology adapted from [obra/superpowers](https://github.com/obra/superpowers)

```
Agent(
  subagent_type = "claude-plugin-pnpm:team-coder",
  model = "sonnet",  // or opus for complex tasks
  name = "{agent-name}",
  prompt = """
You are implementing Task {N}: {task name}

## Team Session
team-session/{team-name}/

## Task Description
{FULL TEXT of task from plan — paste it here, don't make agent read file}

## Context
{Scene-setting: where this fits, dependencies, architectural context}

## Before You Begin

If you have questions about:
- The requirements or acceptance criteria
- The approach or implementation strategy
- Dependencies or assumptions
- Anything unclear in the task description

**Ask them now.** Report STATUS: NEEDS_CONTEXT with your questions.

## Your Job

Once you're clear on requirements:
1. Implement exactly what the task specifies
2. Write tests (TDD if task requires)
3. Verify implementation works
4. Self-review (see below)
5. Report back with STATUS

Work from: {directory}

**While you work:** If you encounter something unexpected or unclear, **ask questions**.
It's always OK to pause and clarify. Don't guess or make assumptions.

## Code Organization

- Follow the file structure defined in the plan
- Each file should have one clear responsibility
- If a file is growing beyond plan's intent, report STATUS: DONE_WITH_CONCERNS
- In existing codebases, follow established patterns

## When You're in Over Your Head

It is always OK to stop and say "this is too hard for me."

**STOP and report STATUS: BLOCKED when:**
- Task requires architectural decisions with multiple valid approaches
- You need to understand code beyond what was provided
- You feel uncertain about whether your approach is correct
- Task involves restructuring in ways the plan didn't anticipate

## Before Reporting: Self-Review

Review your work. Ask yourself:

**Completeness:**
- Did I fully implement everything in the spec?
- Did I miss any requirements?
- Are there edge cases I didn't handle?

**Quality:**
- Is this my best work?
- Are names clear and accurate?
- Is the code clean and maintainable?

**Discipline:**
- Did I avoid overbuilding (YAGNI)?
- Did I only build what was requested?
- Did I follow existing patterns?

**Testing:**
- Do tests verify behavior?
- Are tests comprehensive?

If you find issues during self-review, fix them before reporting.

## Report Format

When done, report:
- **Status:** CLEAN | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
- What you implemented
- What you tested and results
- Files changed
- Self-review findings (if any)
- Any concerns

Write summary to team-session/{team-name}/coder-{name}-progress.md
"""
)
```
