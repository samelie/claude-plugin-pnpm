---
name: investigation-methodology
description: Shared investigation methodology for research agents. Preloaded via agent `skills` field — not user-invocable.
user-invocable: false
disable-model-invocation: true
---

# Investigation Methodology

## 1. MANDATORY: Query knowledge tools BEFORE code reading

Do not use Read, Grep, or Glob until you complete these — in this order:

### Claude-Mem (cross-session memory — what happened before)
- `search(query="<topic>", project="<project>")` — find past work, decisions, bugfixes
- `timeline(anchor=<id>)` — chronological context around a result
- `get_observations(ids=[...])` — full details for specific memory IDs
- Check if similar investigation was done in past sessions before duplicating work

### Context-Mode (session knowledge base — indexed tool output)
- `ctx_search(queries: ["<term1>", "<term2>"])` — search previously indexed content from this session
- `ctx_batch_execute` — run exploratory commands (git log, grep, etc.) + search in ONE call
- If output was large and indexed earlier, search it instead of re-running commands

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
- Claude-Mem = *what happened in past sessions* (tool usage, decisions, bugfixes, features)
- Context-Mode = *what happened this session* (command output, indexed docs, fetched URLs)
- CocoIndex = *what exists in code* (implementations, types, call sites)
- Arcana = *what was learned* (gotchas, decisions, curated knowledge)

## 2. THEN explore the codebase

Use context-mode tools to keep raw output out of context:
- `ctx_execute(language, code)` — run commands, only stdout summary enters context
- `ctx_execute_file(path, language, code)` — process files without loading full content
- `ctx_fetch_and_index(url)` — fetch docs/URLs, index for later search

Fallback to Read, Glob, Grep only when you need exact content in context (e.g., for editing). Use Bash only for mutations (git commit, file writes).

## 3. Store notable discoveries in Arcana

If you uncover gotchas, root causes, or architecture insights not already in Arcana, use `mcp__plugin_arcana_arcana__arcana_add_memory` to save them for future sessions.

## 4. Rules

- Do NOT modify source code. You investigate only. You lack Edit on purpose.
- Show evidence — file paths, line numbers, code snippets. Don't just state conclusions.
- If you hit a dead end, document what you tried and why it didn't work.
- Be thorough but focused. Investigate what was asked, don't scope-creep.
