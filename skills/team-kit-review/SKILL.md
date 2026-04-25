---
name: team-kit-review
description: "Post-plan review checklist for design.md + team-plan.md. QB or lead invokes after design presentation approved."
---

# team-kit-review — Post-Plan Review

Verify design.md + team-plan.md are complete and consistent before execution.

## When to Use

Invoke after `team-kit-present` completes (all sections approved).

**Purpose**: Catch issues that slip through section-by-section approval — placeholders, inconsistencies, ambiguities that only appear when viewing the whole.

## Review Options

| Option | When to Use | How |
|--------|-------------|-----|
| **Agent review** (recommended) | Fresh eyes, no planning bias | Dispatch `team-plan-reviewer` |
| **Inline review** | Quick self-check, simple plans | Run checklist below |

### Option A: Dispatch Agent (Recommended)

Fresh context = better review. Agent reads documents without planning conversation bias.

```javascript
Agent({
  subagent_type: "claude-plugin-pnpm:team-plan-reviewer",
  model: "sonnet",
  description: "Review plan artifacts",
  prompt: `
Review the team plan for completeness, consistency, and clarity.

## Session Path

Session path: \`team-session/${team_name}/\`

Read and review:
- requirements.md
- design.md
- team-plan.md

Write findings to: plan-review.md
`
})
```

Agent writes `plan-review.md` with verdict. If APPROVED → proceed to file review gate. If ISSUES FOUND → fix or re-run planner.

### Option B: Inline Review

Run checklist below yourself. Use when plan is simple or time-constrained.

## Checklist

Run each check against both `design.md` and `team-plan.md`:

### 1. Placeholder Scan

Search for incomplete content:

| Pattern | Example |
|---------|---------|
| `TBD` | "Error handling: TBD" |
| `TODO` | "TODO: add validation" |
| `...` (as placeholder) | "implements: ..." |
| `[placeholder]` | "returns [type]" |
| Incomplete sections | Section header with no content |
| Vague requirements | "add appropriate error handling" |

**Action**: If found → fix inline or flag for planner revision.

### 2. Internal Consistency

Check that parts align:

| Check | What to verify |
|-------|----------------|
| Architecture ↔ Tasks | Every component in design.md has corresponding task(s) |
| Tasks ↔ File Ownership | Every file mentioned in tasks has an owner |
| Dependencies ↔ Phases | blockedBy dependencies respect phase ordering |
| Agent count ↔ Task count | Reasonable distribution, no agent overloaded |

**Action**: If inconsistent → reconcile or flag.

### 3. Type Consistency

Verify names match across documents:

| Check | Example issue |
|-------|---------------|
| Function names | `clearLayers()` in design, `clearFullLayers()` in task |
| Type names | `CacheConfig` in design, `CacheOptions` in task |
| Method signatures | Different parameter counts |
| Module names | `cache-utils` vs `cacheUtils` |

**Action**: If mismatch → pick one, update all references.

### 4. Ambiguity Check

Could any requirement be interpreted two ways?

| Ambiguous | Clear |
|-----------|-------|
| "Handle errors appropriately" | "Throw CacheError on connection failure, return null on miss" |
| "Add logging" | "Log cache hits/misses at debug level using existing logger" |
| "Similar to existing pattern" | [actual code reference with file:line] |

**Action**: If ambiguous → make explicit.

### 5. Scope Check

Is this focused enough for single execution?

| Signal | Action |
|--------|--------|
| 10+ tasks | Consider splitting into phases or sub-plans |
| Multiple independent features | Should be separate team plans |
| Tasks span unrelated packages | Verify they're actually connected |

**Action**: If too broad → recommend decomposition.

## Output Format

```markdown
## Plan Review

**Status**: Approved | Issues Found

**Issues** (if any):
- [Section/File]: [specific issue] — [why it matters]
- [Section/File]: [specific issue] — [why it matters]

**Fixed inline**:
- [what was fixed]

**Recommendations** (advisory, don't block):
- [suggestion]
```

## Decision Criteria

| Condition | Decision |
|-----------|----------|
| No issues found | Approved |
| Minor issues, fixed inline | Approved (note fixes) |
| Issues require planner revision | Issues Found — lead decides: fix inline or re-run planner |
| Scope too broad | Issues Found — recommend decomposition |

## Exit Condition

Review complete when:
1. All 5 checks run
2. Issues either fixed or escalated to lead
3. Status determined (Approved / Issues Found)

If Approved:

> "Plan review passed. Proceeding to file review gate."

Then `team-kit-create` presents files for user review before spawn prompt.

If Issues Found:

> "Plan review found issues:
> - [list]
>
> Fix inline or re-run planner?"

Wait for lead/user decision.

## Anti-Patterns

| Don't | Do |
|-------|-----|
| Skip checks for "simple" plans | Run all 5 checks every time |
| Block on style preferences | Only block on real issues |
| Miss cross-document inconsistencies | Check design.md AND team-plan.md |
| Let placeholders through | Zero tolerance for TBD/TODO |
| Approve ambiguous requirements | Make them explicit |
