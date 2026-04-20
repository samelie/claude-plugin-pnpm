---
name: team-kit-clarify
description: "Dispatch instructions for requirements clarification. Lead invokes this, then dispatches designer(phase: clarify) in a loop until requirements are clear."
---

# team-kit-clarify — Dispatch Designer for Clarification

This skill tells the lead HOW to orchestrate the clarify loop. The lead stays lean — designer agents do the heavy lifting.

## When to Use

Problem is vague/broad — lead cannot answer:
- What packages/modules are affected?
- What are the concrete deliverables?
- What are the acceptance criteria?

## Dispatch Loop

```
while requirements unclear:
    dispatch designer(phase: "clarify", context: {problem, previous_answers})
    designer returns ONE question
    present question to user
    collect answer
    add to previous_answers
    evaluate: are requirements clear now?
```

### Step 1: Dispatch Designer

```javascript
Agent({
  subagent_type: "claude-plugin-pnpm:team-designer",
  description: "Clarify requirements - question {N}",
  prompt: `
Phase: clarify

Problem: ${problem_description}

Previous answers:
${previous_answers.map(a => `Q: ${a.question}\nA: ${a.answer}`).join('\n\n')}

Generate ONE focused question to clarify requirements.
`
})
```

### Step 2: Present Question

Designer returns a question. Present it to user exactly as returned.

### Step 3: Collect Answer

Wait for user response. Add to context:

```javascript
previous_answers.push({
  question: designer_question,
  answer: user_response
})
```

### Step 4: Evaluate

After each answer, check if lead can now answer ALL:

| Question | Status |
|----------|--------|
| What packages/modules? | ✓ known / ? unclear |
| What deliverables? | ✓ known / ? unclear |
| What acceptance criteria? | ✓ known / ? unclear |
| Any constraints? | ✓ known / ? unclear |

**If all ✓**: Exit loop, proceed to explore phase.
**If any ?**: Loop back to Step 1.

## Exit Condition

When requirements are clear, summarize for user:

```markdown
Requirements clear:
- **Packages**: [list]
- **Deliverables**: [list]
- **Acceptance criteria**: [list]
- **Constraints**: [list or "none"]

Proceeding to approach exploration.
```

Then invoke `team-kit-explore`.

## Context Accumulation

Lead maintains state between dispatches:

```javascript
clarify_context = {
  problem: "original problem description",
  previous_answers: [
    { question: "...", answer: "..." },
    { question: "...", answer: "..." }
  ],
  resolved: {
    packages: ["@scope/pkg1", "@scope/pkg2"],
    deliverables: ["new API endpoint", "cache layer"],
    acceptance_criteria: ["<50ms p99 latency"],
    constraints: ["backwards compatible"]
  }
}
```

This context passes to designer each dispatch AND to explore phase when complete.

## Anti-Patterns

| Don't | Do |
|-------|-----|
| Lead asks questions directly | Dispatch designer to generate question |
| Lead does codebase research | Designer does exploration in clarify phase |
| Batch multiple dispatches | One dispatch, one question, one answer |
| Skip to explore early | Verify ALL requirements clear first |

## Example Flow

```
Lead: dispatch designer(clarify, {problem: "add caching to API"})
Designer returns: "What problem does this solve for users?"
Lead: presents question to user
User: "API is slow, need to cache responses"
Lead: adds to context, evaluates (packages unclear)

Lead: dispatch designer(clarify, {problem, answers: [...]})
Designer returns: "Which packages? A) api-server B) api-server + cache-utils C) unsure"
Lead: presents question
User: "B"
Lead: adds to context, evaluates (acceptance criteria unclear)

Lead: dispatch designer(clarify, {problem, answers: [...]})
Designer returns: "How do we know it's done? A) cache hit >80% B) latency <50ms C) both"
Lead: presents question
User: "C"
Lead: adds to context, evaluates (all clear!)

Lead: "Requirements clear. Proceeding to approach exploration."
Lead: invokes team-kit-explore
```
