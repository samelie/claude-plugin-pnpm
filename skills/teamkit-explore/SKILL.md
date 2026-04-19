---
name: teamkit-explore
description: "Propose 2-3 implementation approaches with tradeoffs. Lead invokes after requirements are clear, before planner runs."
---

# teamkit-explore — Approach Exploration

Explore implementation approaches before committing to a design.

## When to Use

Lead invokes after requirements are clear (post `teamkit-clarify` or when problem was already well-scoped).

**Purpose**: Prevent planner from locking into wrong approach. Surface alternatives. Get user buy-in before investing in detailed design.

## Methodology

### 1. Gather Context

Use investigation-methodology to explore codebase:

```
Claude-Mem   → past work on similar problems
CocoIndex   → existing patterns, implementations
Arcana      → architectural decisions, gotchas
Context-Mode → indexed session content
```

**Delegation**: For complex exploration, dispatch `team-researcher` (background) while preparing approach options.

### 2. Identify Approaches

From context, identify 2-3 viable approaches. Each approach should be:
- **Distinct** — not minor variations of same idea
- **Viable** — could actually work given constraints
- **Concrete** — specific enough to compare

### 3. Analyze Tradeoffs

For each approach, identify:
- **Pros** — what it does well
- **Cons** — downsides, risks, costs
- **Fit** — how well it matches requirements/constraints

### 4. Form Recommendation

Pick one approach and articulate why:
- Best fit for requirements
- Lowest risk
- Most aligned with existing patterns
- Fastest to implement

## Presentation Format

```markdown
Based on codebase exploration, here are 3 approaches:

**A: [Name]**
[1-2 sentence description]
- Pro: [benefit]
- Pro: [benefit]
- Con: [downside]

**B: [Name]**
[1-2 sentence description]
- Pro: [benefit]
- Con: [downside]
- Con: [downside]

**C: [Name]**
[1-2 sentence description]
- Pro: [benefit]
- Pro: [benefit]
- Con: [downside]

**Recommendation: A**
[Why this approach best fits requirements. Reference specific constraints or patterns from codebase.]

Which approach?
```

## Recording Selection

After user selects, record for planner:

```markdown
**Chosen approach**: [Name]
**Key decisions**:
- [decision 1]
- [decision 2]
**Constraints to honor**:
- [constraint from requirements]
```

This becomes input to planner in `teamkit-create` Step 3.

## Exit Condition

Exploration complete when:
1. 2-3 approaches presented with tradeoffs
2. Recommendation given with reasoning
3. User selected an approach
4. Selection recorded

Then:

> "Approach selected: [Name]. Proceeding to research and planning."

## When to Skip

Skip approach exploration when:
- Only one viable approach exists (document why)
- User explicitly requests specific approach
- Problem is so constrained alternatives don't exist

Even then, briefly state: "Only one viable approach given [constraint]. Proceeding with [approach]."

## Anti-Patterns

| Don't | Do |
|-------|-----|
| Present 5+ approaches | 2-3 max — decision fatigue |
| Minor variations as distinct approaches | Meaningfully different options |
| Skip recommendation | Always give your pick + why |
| Vague descriptions | Concrete, comparable approaches |
| Ignore existing patterns | Reference codebase conventions |
| Rush to planning | Get explicit user selection |

## Example Approaches

**For "add caching to API layer":**

**A: In-Memory LRU Cache**
Use `lru-cache` package, cache at handler level.
- Pro: Simple, no external dependencies
- Pro: Sub-millisecond lookup
- Con: Lost on restart, no cross-instance sharing

**B: Redis Cache Layer**
Add Redis, cache at service layer with TTL.
- Pro: Persistent, shared across instances
- Pro: Rich data structures
- Con: Operational complexity, network latency

**C: HTTP Cache Headers**
Use Cache-Control headers, let CDN/browser cache.
- Pro: No server-side code
- Pro: Scales infinitely
- Con: Less control, cache invalidation harder

**Recommendation: B**
Requirements specify cross-instance sharing (multiple pods) and specific TTL control. Redis fits best. Existing `@scope/cache-utils` already has Redis client patterns.
