---
name: investigation-methodology
description: Shared investigation methodology for research agents. Preloaded via agent `skills` field — not user-invocable.
user-invocable: false
disable-model-invocation: true
---

# Investigation Methodology

## 1. MANDATORY: Query knowledge tools BEFORE code reading

Do not use Read, Grep, or Glob until you complete these — in this order:

### CocoIndex Code (semantic code search — what exists)
- `mcp__cocoindex-code__search` with query `"<concept>"` — finds code by meaning, not keywords
- Run 4-5 queries covering different aspects of the investigation
- Useful params: `paths` (glob filter, e.g. `["src/utils/*"]`), `languages` (e.g. `["typescript"]`), `limit` (default 5), `offset` (paginate)

### Arcana (project knowledge — what was learned)
- `mcp__plugin_arcana_arcana__arcana_search` with query `"<topic>"` — hybrid semantic+keyword
- `mcp__plugin_arcana_arcana__arcana_find` with query `"<topic>"` — pure semantic search
- `mcp__plugin_arcana_arcana__arcana_grep` with pattern `"<pattern>"` — exact matches in knowledge
- `mcp__plugin_arcana_arcana__arcana_read` on top results for full content

### Cross-reference
CocoIndex = *what exists in code* (implementations, types, call sites). Arcana = *what was learned* (gotchas, decisions, past session discoveries).

## 2. THEN explore the codebase

Use Read, Glob, Grep guided by knowledge tool results. Use Bash for git log, git blame, dependency graphs, running tests.

## 3. Store notable discoveries in Arcana

If you uncover gotchas, root causes, or architecture insights not already in Arcana, use `mcp__plugin_arcana_arcana__arcana_add_memory` to save them for future sessions.

## 4. Rules

- Do NOT modify source code. You investigate only. You lack Edit on purpose.
- Show evidence — file paths, line numbers, code snippets. Don't just state conclusions.
- If you hit a dead end, document what you tried and why it didn't work.
- Be thorough but focused. Investigate what was asked, don't scope-creep.
