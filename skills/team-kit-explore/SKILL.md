---
name: team-kit-explore
description: "Dispatch instructions for approach exploration. Lead invokes this after clarify, dispatches designer(phase: explore) to propose options."
---

# team-kit-explore — Dispatch Designer for Approach Exploration

This skill tells the lead HOW to run the explore phase. Designer does codebase research and proposes approaches — lead stays lean.

## When to Use

After `team-kit-clarify` completes (or when problem was already well-scoped). Before present phase.

**Purpose**: Surface alternatives. Get user buy-in before investing in detailed planning.

## Artifact Chain

```
designer/clarify.md (input) → designer/explore.md (output)
```

Designer reads `clarify.md` for resolved requirements, writes `explore.md` with approaches + chosen approach.

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
  subagent_type: "claude-plugin-pnpm:team-designer",
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

Designer returns approaches and writes `designer/explore.md`. Present to user, then ask:

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

## Exit Condition

Exploration complete when:
1. 2-3 approaches presented
2. User selected one (recorded in `designer/explore.md`)
3. Key decisions confirmed (recorded in `designer/explore.md`)

Then:

```markdown
Approach selected: **[Name]** (see \`designer/explore.md\`)

Proceeding to requirements presentation.
```

Proceed to designer(present) phase — Step 3b in `team-kit-create`.

## Alternative Handling

If user doesn't like any approach:

> "None of these fit. I want [alternative description]"

Options:
1. **Minor variation**: Update `designer/explore.md` with modifications
2. **Major difference**: Re-dispatch designer with new constraints

```javascript
Agent({
  subagent_type: "claude-plugin-pnpm:team-designer",
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
