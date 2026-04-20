---
name: brainstorm-session
description: "Use before any creative work - features, components, functionality. Explores intent, requirements, and design before implementation. Triggers: brainstorm, design, spec, requirements, what should we build, how should we approach"
---

# Brainstorm Session

> Methodology adapted from [obra/superpowers](https://github.com/obra/superpowers)

Turn ideas into fully formed specs through collaborative dialogue. Understand before building.

## Single-Agent vs Team Context

**Single-agent**: Use this skill directly. Follow all phases in one session.

**Team context**: Use `team-kit-create` instead. It dispatches `team-designer` agents with specific phases (clarify, explore, present, write). The lead stays lean while designer agents do the heavy lifting. See `team-kit-clarify` and `team-kit-explore` for dispatch patterns.

<HARD-GATE>
Do NOT write code, scaffold projects, or take implementation actions until you have presented a design and the user has approved it. This applies to EVERY project regardless of perceived simplicity.
</HARD-GATE>

## Anti-Pattern: "Too Simple To Need A Design"

Every project goes through this process. A todo list, a utility function, a config change — all of them. "Simple" projects are where unexamined assumptions cause the most wasted work. The spec can be short, but you MUST present it and get approval.

---

## Session Setup

Create session folder before starting:

```bash
mkdir -p team-session/$(date +%Y%m%d)-{feature-slug}
```

Replace `{feature-slug}` with kebab-case description. All artifacts go here.

---

## The Process

Complete each phase in order.

### Phase 1: Explore Context

Before asking questions:

1. Check existing files, docs, recent commits related to the topic
2. Understand current state of the codebase in this area
3. Note patterns, conventions, constraints already in place

Write initial findings to `team-session/{folder}/context.md`

### Phase 2: Clarifying Questions

**Rules:**
- ONE question at a time — don't overwhelm
- Multiple choice preferred — easier than open-ended
- Understand purpose, constraints, success criteria
- YAGNI ruthlessly — remove unnecessary features early

Keep asking until you can answer:
- What problem are we solving?
- Who is it for?
- What does success look like?
- What are the constraints?

### Phase 3: Propose Approaches

Present 2-3 different approaches:

```markdown
## Approach A: {name}

**How it works:** {description}

**Pros:**
- ...

**Cons:**
- ...

**Best when:** {scenario}

---

## Approach B: {name}
...

---

## Recommendation

I recommend **Approach {X}** because {reasoning}.
```

Get user selection before proceeding.

### Phase 4: Present Design

Present design in sections, scaled to complexity:

1. **Overview** — what we're building, one paragraph
2. **Components** — what pieces exist, how they interact
3. **Data Flow** — how data moves through the system
4. **API/Interface** — how users/code interacts with it
5. **Edge Cases** — what could go wrong, how we handle it

Get approval after each section. Revise if needed.

### Phase 5: Write Requirements

Write to `team-session/{folder}/requirements.md`:

```markdown
# Requirements: {Feature Name}

Created: {date}
Status: Draft | Approved

## Problem

{What problem are we solving}

## Solution

{High-level approach — the one user approved}

## Requirements

### Must Have
- ...

### Nice to Have
- ...

### Out of Scope
- ...

## Design

### Components
{from Phase 4}

### Data Flow
{from Phase 4}

### API/Interface
{from Phase 4}

## Edge Cases

{from Phase 4}

## Open Questions

{anything still unresolved}
```

### Phase 6: Requirements Self-Review

Before presenting to user, check:

| Check | Fix |
|-------|-----|
| Placeholders (TBD, TODO, ???) | Fill them in or flag as open question |
| Contradictions | Resolve inconsistencies |
| Ambiguity | Make vague statements specific |
| Scope creep | Remove features that weren't approved |
| Missing pieces | Add anything implied but not stated |

Fix issues inline. Don't present a spec with known problems.

### Phase 7: User Review

Ask user to review `requirements.md`:

> Spec written to `team-session/{folder}/requirements.md`.
> Please review and let me know if anything needs adjustment.
> Once approved, we can proceed to planning.

If changes requested → update spec → re-review.
If approved → update status to "Approved" → proceed.

---

## Team Escalation

For complex features needing multiple agents:

```
As a team, design {feature description}
```

This spawns `team-designer` who follows this methodology, then hands off to `planner`.

---

## Quick Reference

| Phase | Output | Gate |
|-------|--------|------|
| 1. Context | context.md | — |
| 2. Questions | — | Understand problem fully |
| 3. Approaches | — | User selects approach |
| 4. Design | — | User approves each section |
| 5. Write Requirements | requirements.md | — |
| 6. Self-Review | — | No placeholders/contradictions |
| 7. User Review | — | User approves spec |

---

## Session Folder Structure

```
team-session/YYYYMMDD-{feature}/
├── context.md    # Phase 1: existing state, patterns
└── requirements.md       # Phase 5: approved requirements + design
```

After spec approved, planner adds:
```
├── design.md     # Technical architecture
└── team-plan.md  # Executable plan
```
