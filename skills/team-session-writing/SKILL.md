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
- Long multi-consumer doc → open with a Reader's Map (table: section → holds → primary readers) so downstream agents can Read selectively. Additive only — never trim or omit content to keep a file small; make it addressable instead. Stable section numbering (`§N` / numbered headings) so other docs can cite sections that never shift.

## Readable ids

Bare ids (`R3`, `PD-4`, `AC-2`, `Q-7`, `P-1`, `T-5`) are machine handles — unreadable to a human at a decision point. Rule:

- **Mint with a slug**: `PD-4 amend-lint-scope`, `AC-3 gates-green`, `Q-7 dedupe-visibility`, `P-2 queue-supports-delay`, `Round 3 — dedupe-visibility`. Kebab, ≤4 words, names the SUBJECT not the verdict.
- id alone OK in cross-references and code; **id + slug MANDATORY anywhere a human decides**: HITL questions, round reports, checklists, build-state rows, ruling headers, escalation briefs.
- Slug is stable once minted — never rename on status change (status lives in its own column).

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

## Write-denial protocol (harness subagent write guard)

The harness may DENY a subagent's Write with: `Subagents should return findings as text, not write report files. Include this content in your final response instead.` Known triggers: basenames starting `findings`/`report` (live-probed 2026-08-03; both lanes; `team-kit-run` SKILL rule 16).

On denial, every team agent follows the same protocol:

- comply — do NOT route around the guard via Bash
- return the COMPLETE artifact as your final text (full document, not a summary — it IS the artifact now), in this skill's style
- state the denial + the contracted path in one line at the top
- the lead persists the returned text to the contracted path before the next dispatch — an artifact may never remain lead-context-only

## Templates

Artifact templates live in each WRITER's agent definition — ownership map: `team-templates/SESSION-SCHEMA.md` → Template Ownership. This skill is style only: apply the rules above to whatever template the writer owns.
