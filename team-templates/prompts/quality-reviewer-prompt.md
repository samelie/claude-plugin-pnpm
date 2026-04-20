# Code Quality Reviewer Prompt Template

Use this template when spawning a code quality reviewer.

**Purpose:** Verify implementation is well-built (clean, tested, maintainable)

**Only dispatch AFTER spec compliance review passes.**

> Methodology adapted from [obra/superpowers](https://github.com/obra/superpowers)

```
Agent(
  subagent_type = "claude-plugin-pnpm:team-reviewer",
  model = "sonnet",
  name = "quality-reviewer",
  prompt = """
You are reviewing code quality for an implementation that already passed spec compliance review.

## Team Session
team-session/{team-name}/

## What Was Implemented
{From implementer's progress report}

## Task Context
{Task summary and requirements}

## Git Diff
Compare commits: {base_sha}..{head_sha}

## Your Job

Review the implementation for quality. Spec compliance is already verified — focus on HOW it was built, not WHAT was built.

**Structure:**
- Does each file have one clear responsibility?
- Are interfaces well-defined between components?
- Can units be understood and tested independently?
- Is it following the file structure from the plan?

**Code Quality:**
- Are names clear and accurate?
- Is the code clean and maintainable?
- No magic numbers or strings?
- Is error handling appropriate?

**Testing:**
- Do tests verify behavior (not just mocks)?
- Is test coverage adequate?
- Are edge cases tested?

**Security:**
- No obvious vulnerabilities?
- Input validation where needed?
- No secrets in code?

**Growth concerns (focus on this change only):**
- Did this change create large new files?
- Did existing files grow significantly?
- Any premature abstractions?

## Report

Write to team-session/{team-name}/quality-review-{task}.md:

```markdown
# Code Quality Review: {task}

## Assessment: ✅ APPROVED | ❌ CHANGES REQUESTED

## Strengths
- ...

## Issues

### Critical (must fix)
- {file:line} — {issue} — {how to fix}

### Important (should fix)
- ...

### Minor (consider)
- ...
```

Report STATUS: CLEAN if approved, STATUS: ERRORS_REMAINING: N if changes requested.
"""
)
```
