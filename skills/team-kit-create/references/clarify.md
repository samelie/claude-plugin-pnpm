# Clarify Loop — Dispatch Designer for Clarification (Step 2c detail)

How the lead orchestrates the clarify loop. The lead stays lean — designer agents do the heavy lifting.

## When to Use

Use only when a material requirement is unresolved. Lead first reads frozen `prompt.md` and named evidence.
Skip the loop when purpose, affected packages/modules or assessment subject, deliverables, constraints, and acceptance criteria have
named evidence; populate Resolved and Destination with sources. Optional presentation preferences do not
enter clarification.

Clarify when lead cannot answer:
- What packages/modules are affected, or what is the assessment subject?
- What are the concrete deliverables?
- What are the acceptance criteria?

## Artifact

First invocation reads frozen `${session_path}prompt.md` and creates `designer/clarify.md`. Repeat
invocation reads frozen `prompt.md` plus existing `designer/clarify.md`, applies the latest answer,
appends its Q&A row, and updates Resolved. Read `map.md` only when dispatch names a destination or ledger
conflict.

> `session_path` is ALWAYS absolute (see Step 0b) — a relative path fails to resolve from a dispatched subagent's cwd.

## Dispatch Loop

```
while requirements unclear:
    dispatch designer(phase: "clarify", session_path)
    designer reads prompt.md + existing clarify.md (if any), generates at most ONE material question, updates clarify.md
    present question to user
    collect answer
    next dispatch: designer reads updated clarify.md from disk
    evaluate: are requirements clear now?
```

### Step 1: Dispatch Designer

```javascript
Agent({
  subagent_type: "team-designer",
  description: "Clarify requirements - question {N}",
  prompt: `
Phase: clarify
Session path: \`${session_path}\`

Problem: ${problem_description}

Read frozen \`${session_path}prompt.md\`.
Read existing \`${session_path}designer/clarify.md\` if it exists.
User's latest answer: "${user_answer}"
Update clarify.md with new Q&A entry and update Resolved table.
Generate at most ONE focused material question — WITH your recommended answer. If all material inputs are
resolved from the prompt, artifact, and evidence, ask zero questions and mark clarify complete.
Look up any fact the environment can settle instead of asking it.
`
})
```

> Follow [runtime.md](runtime.md) for dispatch naming and observer behavior. Deterministic checks remain
> mandatory even when an observer is available.

**Question craft lives in the `grilling` skill** (preloaded on the designer): recommended answer with every question — the user decides, not thinks. Same rule the `discovery` phase runs on.

**First material question names the destination.** Ask only when the frozen prompt and evidence do not
already settle it. Write the resolved destination and source to `map.md` immediately.

## Decision card

Transport every user-facing choice intact. Native interaction uses its eligible question tool; remote mode
uses its HITL protocol; otherwise present the same card inline. Never replace a card with a bare A/B/C ask.

```markdown
## Decision: {id + slug}

Scope: {shared outcome and boundary}

| Option | Concrete output | Main tradeoff |
|--------|-----------------|---------------|
| A | {output} | {tradeoff} |
| B | {output} | {tradeoff} |

Recommended: {option} — {reason}
Question: {one material judgment}
```

### Step 2: Present Question

Designer returns a decision card or zero-question completion and writes `designer/clarify.md`. Present the
card intact; use the transport named in [runtime.md](runtime.md).

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

**If the loop is running long without converging**: that is usually fog, not a bad question — more rounds will not fix it. Route it:

| Signal | Action |
|--------|--------|
| a specific question can't be phrased sharply yet | `map.md` **Not yet specified**, keep going |
| the user rules something out | `map.md` **Out of scope** + reason, keep going |
| MOST open questions are unsharp, or the destination itself is contested | stop — this is a campaign, not a plan. Go to SKILL.md Step 2d (chart-only mode) |

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

Then proceed to Step 3 (explore) — read `references/explore.md`.

## Anti-Patterns

| Don't | Do |
|-------|-----|
| Lead asks questions directly | Dispatch designer to generate question |
| Lead does codebase research | Designer does exploration in clarify phase |
| Batch multiple dispatches | One dispatch, one question, one answer |
| Skip to explore early | Verify ALL requirements clear first |
| Keep state only in memory | Designer reads/writes `designer/clarify.md` each dispatch |
| Pass inline context instead of session_path | Designer reads from disk |
| Assume observer naming rules | Follow `runtime.md`; run deterministic checks either way |
| Bare question or A/B/C ask | Preserve scope, outputs, tradeoffs, recommendation, and question |
| Ask what docs or code could settle | Look it up; ask only for judgment |
| Grind rounds on a question you can't phrase | Record as fog in `map.md`, move on |

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
Lead: proceeds to Step 3 (explore)
```
