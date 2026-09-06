# Explore — Dispatch Designer for Approach Exploration (Step 3 detail)

How the lead runs the explore phase. Designer does codebase research and proposes approaches — lead stays lean.

## When to Use

After the clarify loop completes (Step 2c), or when problem was already well-scoped. Before present phase.

**Purpose**: Surface alternatives. Get user buy-in before investing in detailed planning.

## Prototype instead of prose when the question is "how should it feel"

Prose approaches make the user arbitrate an abstraction — "Approach B: a normalized event log" reads fine and hides every decision that matters. When the differentiator is shape rather than architecture (how output looks, how an API reads, what the user sees, how a message is worded), have the designer produce the **cheapest concrete artifact** for the leading approaches and present that instead: an outline, a stub signature, a sample payload, a faked response, a CLI transcript.

Write them to `designer/prototypes/{slug}.{ext}` and link from `explore.md`. Throwaway by construction — they exist to be reacted to, not kept, and cost far less than discovering the mismatch after the plan is sealed. Same exit is available mid-discovery (`references/discovery.md` → exit 3).

Keep prose when the tradeoff is genuinely architectural — coupling, blast radius, migration cost. Those don't get clearer as a mockup.

## Artifact Chain

```
designer/clarify.md (input) → designer/explore.md (output)
```

Designer reads `clarify.md` for resolved requirements, writes `explore.md` with approaches + chosen approach.

> `session_path` is ALWAYS absolute (see Step 0b).

## Dispatch Flow

```
dispatch designer(phase: "explore", session_path)
designer reads designer/clarify.md, explores codebase, returns 2-3 approaches
designer writes designer/explore.md
present approaches to user
user selects approach
lead updates designer/explore.md with selection (or re-dispatches)
```

### Step 1: Dispatch Designer

```javascript
Agent({
  subagent_type: "team-designer",
  description: "Explore implementation approaches",
  prompt: `
Phase: explore
Session path: \`${session_path}\`

Read \`${session_path}designer/clarify.md\` for resolved requirements and Q&A context.
Explore codebase using investigation-methodology. Propose 2-3 approaches with tradeoffs.
Write output to \`${session_path}designer/explore.md\`.
`
})
```

### Step 2: Present Approaches

Designer returns approaches and writes `designer/explore.md`. Present to user (remote mode: via the `hitl-question` protocol — SKILL.md → Remote Mode), then ask:

> Which approach? (A/B/C, or describe alternative)

### Step 3: Record Selection

After user selects, designer updates `designer/explore.md` with chosen approach. If lead handles the update directly:

```markdown
## Chosen: A — {Name}
```

At top of `designer/explore.md`.

### Step 4: Confirm Key Decisions

If designer flagged decisions to confirm, verify with user:

> Before proceeding, confirm:
> - Cache at controller level (not service level)?
> - Redis (not in-memory)?

Update `designer/explore.md` Key Decisions section.

### Step 5: Mint Premises

The pick just happened at the LEAST-informed moment of the pipeline (deep research is Step 4a/4b). Make its footing falsifiable: decompose the chosen approach's rationale into **premises** — the assumptions that, if wrong, unmake the choice. One line each, kebab-slugged, phrased so a research finding could contradict it.

**Who mints**: one short post-selection designer dispatch (phase: explore, task: "mint premises for the chosen approach; append `## Premises` to `designer/explore.md`") — the designer holds the rationale. For a small pick whose rationale the lead can decompose in four lines, lead-inline is fine; the table is what matters, not the author.

```markdown
## Premises

| Premise | Assumption (falsifiable) | Supports | Status |
|---------|--------------------------|----------|--------|
| P-1 single-writer-ok | contention on the hot path is low enough for one writer | D-1 approach-pick | holds |
| P-2 queue-supports-delay | @adddog/queue supports delayed redelivery | D-1 approach-pick | holds |
```

Lead copies the table to `map.md` **Premises** (Status initialized `holds`; lifecycle: `holds` → `STRUCK (link)` → `re-scoped (link)` / `withdrawn (link)` / back to `holds` if the human holds the decision). Discovery diffs every new finding against it (standing lens — `references/discovery.md`); a contradiction is a premise strike the human re-decides. **Proportionality**: mint only when alternatives were real — a 6-file refactor with one obvious route gets no premise table (and discovery's lens is then a no-op). "Because the user asked for it" is not a premise; "because X is true of the codebase/vendor/library" is.

## Exit Condition

Exploration complete when:
1. 2-3 approaches presented
2. User selected one (recorded in `designer/explore.md`)
3. Key decisions confirmed (recorded in `designer/explore.md`)
4. Premises minted (or skipped with the one-line proportionality reason) and copied to `map.md`

Then:

```markdown
Approach selected: **[Name]** (see \`designer/explore.md\`)

Proceeding to requirements presentation.
```

Proceed to designer(present) phase — Step 3b in the main SKILL.md.

## Alternative Handling

If user doesn't like any approach:

> "None of these fit. I want [alternative description]"

Options:
1. **Minor variation**: Update `designer/explore.md` with modifications
2. **Major difference**: Re-dispatch designer with new constraints

```javascript
Agent({
  subagent_type: "team-designer",
  description: "Explore approaches - revised",
  prompt: `
Phase: explore
Session path: \`${session_path}\`

Previous approaches rejected. User wants: ${user_alternative}
Read \`${session_path}designer/clarify.md\` for requirements.
Read existing \`${session_path}designer/explore.md\` for rejected approaches.
Propose 2-3 NEW approaches that align with user's direction.
Overwrite \`${session_path}designer/explore.md\`.
`
})
```

## Anti-Patterns

| Don't | Do |
|-------|-----|
| Lead explores codebase | Dispatch designer to explore |
| Skip user selection | Always get explicit choice |
| Keep chosen approach in memory only | Write to `designer/explore.md` |
| Proceed with ambiguous selection | Clarify before continuing |
| Invent approaches without research | Designer uses investigation-methodology |
| Pass clarify context inline | Designer reads `designer/clarify.md` from disk |
