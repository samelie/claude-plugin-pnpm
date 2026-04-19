---
name: teamkit-clarify
description: "Extract requirements from vague problems. Lead invokes when problem scope is unclear. One question at a time methodology."
---

# teamkit-clarify — Requirements Extraction

Turn vague problems into clear requirements through focused questioning.

## When to Use

Lead invokes this when problem is vague/broad — cannot answer:
- What packages/modules are affected?
- What are the concrete deliverables?
- What are the acceptance criteria?

## Methodology

### One Question at a Time

Do NOT ask multiple questions in one message. Each question gets its own turn.

**Why**: Multiple questions overwhelm. Users skip some, answer others poorly. Single questions get focused answers.

### Multiple Choice Preferred

When possible, offer options:

> "Is this a new feature, refactor, or bugfix?
> A) New feature
> B) Refactor existing code
> C) Bugfix
> D) Other (describe)"

**Why**: Easier to answer, surfaces options user might not have considered, faster convergence.

### Open-Ended When Necessary

Some questions need free-form answers:

> "What problem does this solve for users?"

Use open-ended for: purpose, constraints, context. Use multiple choice for: scope, priority, preferences.

## Question Sequence

### 1. Purpose (start here)

> "What problem does this solve?"

or

> "What should be different after this is done?"

### 2. Affected Packages

> "Which packages are affected?
> A) [list detected from context]
> B) Not sure yet
> C) Other (specify)"

### 3. Deliverables

> "What are the concrete outputs?
> A) New files/modules
> B) Modified existing code
> C) Configuration changes
> D) All of the above"

Then follow up for specifics.

### 4. Constraints

> "Any hard constraints?
> A) Must be backwards compatible
> B) Performance critical
> C) Security sensitive
> D) No special constraints
> E) Multiple (specify)"

### 5. Success Criteria

> "How do we know it's done?
> A) Tests pass
> B) Specific behavior works
> C) Metrics improve
> D) Other (describe)"

### 6. Priority / Scope

> "What's the scope?
> A) Minimal — just the core requirement
> B) Complete — include edge cases, error handling
> C) Comprehensive — production-ready with docs"

## Exit Condition

Clarification complete when lead can answer ALL:

| Question | Answer |
|----------|--------|
| What packages/modules? | [list] |
| What deliverables? | [list] |
| What acceptance criteria? | [list] |
| Any constraints? | [list or none] |

When complete:

> "Requirements clear. Proceeding to approach exploration."

Then invoke `teamkit-explore`.

## Anti-Patterns

| Don't | Do |
|-------|-----|
| Ask 3 questions at once | One question per message |
| Jump to solution | Understand problem first |
| Assume scope | Ask explicitly |
| Skip constraints | Always ask |
| Long open-ended questions | Short, focused questions |

## Example Session

**Lead**: "What problem does this solve?"

**User**: "Need to add caching to the API layer"

**Lead**: "Which packages are affected?
A) @scope/api-server
B) @scope/api-server + @scope/cache-utils
C) Not sure yet"

**User**: "B"

**Lead**: "Any hard constraints?
A) Must be backwards compatible
B) Performance critical (specify target)
C) No special constraints"

**User**: "A and B — need <50ms p99 latency"

**Lead**: "How do we know it's done?
A) Cache hit rate >80%
B) Latency <50ms p99
C) Specific endpoints cached
D) All of the above"

**User**: "D"

**Lead**: "Requirements clear:
- Packages: @scope/api-server, @scope/cache-utils
- Deliverables: Caching layer for API endpoints
- Constraints: Backwards compatible, <50ms p99
- Success: Cache hit >80%, latency <50ms, all specified endpoints cached

Proceeding to approach exploration."
