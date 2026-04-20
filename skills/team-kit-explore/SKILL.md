---
name: team-kit-explore
description: "Dispatch instructions for approach exploration. Lead invokes this after clarify, dispatches designer(phase: explore) to propose options."
---

# team-kit-explore — Dispatch Designer for Approach Exploration

This skill tells the lead HOW to run the explore phase. Designer does codebase research and proposes approaches — lead stays lean.

## When to Use

After `team-kit-clarify` completes (or when problem was already well-scoped). Before planner runs.

**Purpose**: Surface alternatives. Get user buy-in before investing in detailed planning.

## Dispatch Flow

```
dispatch designer(phase: "explore", context: {requirements})
designer explores codebase, returns 2-3 approaches
present approaches to user
user selects approach
record selection for planner
```

### Step 1: Dispatch Designer

```javascript
Agent({
  subagent_type: "claude-plugin-pnpm:team-designer",
  description: "Explore implementation approaches",
  prompt: `
Phase: explore

Requirements:
- Packages: ${requirements.packages.join(', ')}
- Deliverables: ${requirements.deliverables.join(', ')}
- Acceptance criteria: ${requirements.acceptance_criteria.join(', ')}
- Constraints: ${requirements.constraints.join(', ')}

Problem context:
${clarify_context.previous_answers.map(a => `Q: ${a.question}\nA: ${a.answer}`).join('\n\n')}

Explore codebase using investigation-methodology. Propose 2-3 approaches with tradeoffs.
`
})
```

### Step 2: Present Approaches

Designer returns approaches in format:
```markdown
## Approaches

**A: [Name]**
- Pro: ...
- Con: ...

**B: [Name]**
- Pro: ...
- Con: ...

## Recommendation: [A/B/C] — [reason]
```

Present to user exactly as returned, then ask:

> Which approach? (A/B/C, or describe alternative)

### Step 3: Record Selection

After user selects, record for planner:

```javascript
explore_result = {
  chosen_approach: "A: [Name]",
  approach_description: "...",
  key_decisions: [
    "Use Redis for caching",
    "Cache at controller level"
  ],
  constraints_to_honor: [
    "backwards compatible",
    "<50ms p99 latency"
  ]
}
```

### Step 4: Confirm Key Decisions

If designer flagged decisions to confirm, verify with user:

> Before proceeding, confirm:
> - Cache at controller level (not service level)?
> - Redis (not in-memory)?

Adjust `key_decisions` based on user response.

## Exit Condition

Exploration complete when:
1. 2-3 approaches presented
2. User selected one
3. Key decisions confirmed

Then output:

```markdown
Approach selected: **[Name]**

Key decisions:
- [decision 1]
- [decision 2]

Constraints:
- [constraint 1]
- [constraint 2]

Proceeding to planning phase.
```

## Context for Next Phase

Pass to planner (via `team-kit-create` Step 4):

```javascript
planner_input = {
  task_description: original_problem,
  chosen_approach: explore_result.chosen_approach,
  key_decisions: explore_result.key_decisions,
  constraints: explore_result.constraints_to_honor,
  requirements: clarify_context.resolved,
  clarify_answers: clarify_context.previous_answers
}
```

## Anti-Patterns

| Don't | Do |
|-------|-----|
| Lead explores codebase | Dispatch designer to explore |
| Skip user selection | Always get explicit choice |
| Proceed with ambiguous selection | Clarify before continuing |
| Invent approaches without research | Designer uses investigation-methodology |

## Alternative Handling

If user doesn't like any approach:

> "None of these fit. I want [alternative description]"

Options:
1. **Minor variation**: Record as chosen approach with modifications
2. **Major difference**: Re-dispatch designer with new constraints

```javascript
// Re-dispatch with user's direction
Agent({
  subagent_type: "claude-plugin-pnpm:team-designer",
  description: "Explore approaches - revised",
  prompt: `
Phase: explore

Previous approaches rejected. User wants: ${user_alternative}

Requirements: ${requirements}

Propose 2-3 NEW approaches that align with user's direction.
`
})
```
