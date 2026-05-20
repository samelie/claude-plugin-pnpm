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

## Artifact

Designer writes/updates `${session_path}designer/clarify.md` each invocation. File accumulates Q&A pairs and a Resolved table.

## Dispatch Loop

```
while requirements unclear:
    dispatch designer(phase: "clarify", session_path)
    designer reads existing clarify.md (if any), generates ONE question, updates clarify.md
    present question to user
    collect answer
    next dispatch: designer reads updated clarify.md from disk
    evaluate: are requirements clear now?
```

### Step 1: Dispatch Designer

```javascript
Agent({
  subagent_type: "claude-plugin-pnpm:team-designer",
  description: "Clarify requirements - question {N}",
  prompt: `
Phase: clarify
Session path: \`${session_path}\`

Problem: ${problem_description}

Read existing \`${session_path}designer/clarify.md\` if it exists.
User's latest answer: "${user_answer}"
Update clarify.md with new Q&A entry and update Resolved table.
Generate ONE focused question to clarify requirements.
`
})
```

### Step 2: Present Question

Designer returns a question AND writes to `designer/clarify.md`. Present question to user exactly as returned.

### Step 3: Collect Answer

Wait for user response. Answer goes into next dispatch prompt — designer reads its own previous file plus the new answer.

### Step 4: Evaluate

After each answer, check if lead can now answer ALL:

| Question | Status |
|----------|--------|
| What packages/modules? | check clarify.md Resolved table |
| What deliverables? | check clarify.md Resolved table |
| What acceptance criteria? | check clarify.md Resolved table |
| Any constraints? | check clarify.md Resolved table |

**If all resolved**: Exit loop, proceed to explore phase.
**If any missing**: Loop back to Step 1.

## Exit Condition

When requirements are clear, summarize for user:

```markdown
Requirements clear (see \`designer/clarify.md\`):
- **Packages**: [from Resolved table]
- **Deliverables**: [from Resolved table]
- **Acceptance criteria**: [from Resolved table]
- **Constraints**: [from Resolved table]

Proceeding to approach exploration.
```

Then invoke `team-kit-explore`.

## Anti-Patterns

| Don't | Do |
|-------|-----|
| Lead asks questions directly | Dispatch designer to generate question |
| Lead does codebase research | Designer does exploration in clarify phase |
| Batch multiple dispatches | One dispatch, one question, one answer |
| Skip to explore early | Verify ALL requirements clear first |
| Keep state only in memory | Designer reads/writes `designer/clarify.md` each dispatch |
| Pass inline context instead of session_path | Designer reads from disk |

## Example Flow

```
Lead: dispatch designer(clarify, session_path, problem: "add caching to API")
Designer: creates designer/clarify.md, returns question "What problem for users?"
Lead: presents question to user
User: "API slow, need cached responses"

Lead: dispatch designer(clarify, session_path, answer: "API slow...")
Designer: reads designer/clarify.md, appends Q&A, returns "Which packages?"
Lead: presents question
User: "api-server + cache-utils"

Lead: dispatch designer(clarify, session_path, answer: "api-server + cache-utils")
Designer: reads designer/clarify.md, updates Resolved, returns "Success criteria?"
Lead: presents question
User: "cache hit >80%, latency <50ms"

Lead: reads designer/clarify.md Resolved table — all clear!
Lead: "Requirements clear. Proceeding to approach exploration."
Lead: invokes team-kit-explore
```
