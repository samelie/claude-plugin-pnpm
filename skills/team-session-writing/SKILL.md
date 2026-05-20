---
name: team-session-writing
description: "Compressed writing style for team-session documents. All team agents reference this when writing to team-session/. Tables over prose, fragments OK, no fluff, technically exact. Every token costs context for downstream agents."
---

# Team Session Writing Style

Apply `caveman:caveman` principles to document writing. Session docs are read by multiple agents — every unnecessary token degrades downstream quality.

## Rules

- Tables over prose. If data has 2+ dimensions → table.
- Fragments OK. No full sentences when fragment is clear.
- Drop articles (a/an/the), filler, hedging.
- Short synonyms: fix not "implement a solution for", use not "utilize".
- Technical terms exact. Never abbreviate package names, file paths, type names.
- Code blocks unchanged — no compression inside fences.
- One line per fact. No paragraphs unless explaining WHY.
- Headers for structure, not decoration. Skip if section has <3 lines.
- Bullet lists over numbered lists unless order matters.

## Pattern

```
## Section Name

| Column | Column |
|--------|--------|
| data   | data   |

- Key point. [file path or evidence]
- Key point → consequence.
```

Not:

```
## Section Name

In this section, we will discuss the various aspects of the implementation
that are relevant to the team. The following table provides a comprehensive
overview of the key components and their respective roles in the system.
```

## File-Specific Guidance

### clarify.md

```markdown
## Resolved

| Requirement | Answer | Source |
|-------------|--------|--------|
| Packages affected | @scope/pkg-a, @scope/pkg-b | Q2 |
| Deliverables | new API endpoint, cache layer | Q1 |

## Q&A Log

| # | Question | Answer |
|---|----------|--------|
| 1 | What problem for users? | API slow, need cached responses |
| 2 | Which packages? | api-server + cache-utils |
```

### explore.md

```markdown
## Chosen: A — Redis Cache Layer

## Approaches

| Approach | Pro | Con |
|----------|-----|-----|
| A: Redis cache | Fast, proven | Infra dependency |
| B: In-memory | No infra | Lost on restart |

## Key Decisions

- Cache at controller level (not service)
- Redis (not in-memory)
- TTL: 5min default

## Constraints

- Backwards compatible
- <50ms p99 latency
```

### present.md

```markdown
## Approval Log

| Section | Status | Notes |
|---------|--------|-------|
| Problem | Approved | — |
| Requirements | Revised | Added cache invalidation to must-have |
| Approach | Approved | — |
| Acceptance criteria | Approved | — |
| Constraints | Approved | — |

## Revisions

### Requirements (revision 1)
- Added: cache invalidation on write → must-have
- Reason: user clarified stale data unacceptable
```

### requirements.md

Follow template in `SESSION-SCHEMA.md`. Same compressed style — tables for decisions, Given/When/Then for acceptance criteria, no prose padding.
