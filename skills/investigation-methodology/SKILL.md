---
name: investigation-methodology
description: Shared investigation methodology for research agents. Preloaded via agent `skills` field — not user-invocable.
user-invocable: false
disable-model-invocation: true
---

# Investigation Methodology

## 1. MANDATORY: Query knowledge tools BEFORE code reading

Do not fall back to reading files one by one until you complete these — in this order.

⚠ **Do not assume you hold `Grep` or `Glob`.** Measured 2026-09-14 on both the native and workflow lanes: a role declaring them in its `tools:` line still gets `No such tool available`, while an `mcp__*` glob on that same line projected fine — a `tools:` line is honoured only PARTIALLY. The harness's own error text then points you at Bash `grep`, which is why that is the habit to resist here. Use Bash `grep`/`find` as the fallback, but only *after* the steps below.

### Context-Mode (session knowledge base — indexed tool output)
- `ctx_search(queries: ["<term1>", "<term2>"])` — search previously indexed content from this session
- `ctx_batch_execute` — run exploratory commands (git log, grep, etc.) + search in ONE call
- If output was large and indexed earlier, search it instead of re-running commands

### CocoIndex Code (code retrieval — routed by question shape, not a ladder)
- **Concept → location, name unknown** → `ccc search "<concept>"`. Run 4-5 queries covering different aspects.
- **Exact symbol / who-calls-X** → `ccc grep '<sym>(\(ARGS*\))'`. Structural by-example, syntax-aware, no index, no daemon, reads the working tree — never stale. Metavariables `\NAME` / `\(ARGS*\)`; flags `--lang`, `--path`. **Add `--lang` only when you know the target's language** — it is a FILTER, not a hint, and a wrong one returns a confident "No matches found". The run lane is `.js`/`.mjs`/`.json`, so `--lang typescript` silently finds nothing there; omit it and let the pattern compile per language.
- ⚠ **`ccc search` is embedding-only — no lexical channel, no symbol index.** An exact identifier returns plausible-looking WRONG files at normal-looking scores, never "no results". Measured: `ccc search "assessSourceHealth"` returned five personal health-insurance documents (0.402-0.430) and zero code; `ccc grep 'assessSourceHealth(\(ARGS*\))' --lang typescript` returned the definition and its call sites in 3.70 s. **If you can spell the name, use `ccc grep`.**
- What `ccc grep` cannot do: multi-hop flow A→B→C; disambiguating same-named symbols across packages (it over-reports); following interface dispatch, aliased imports, or re-exports; any ranking. `ccc search` needs the local `[full]` install (embeddings); `ccc grep` is immune to that failure.
- Both are CLI — every agent with Bash reaches them today. `mcp__cocoindex-code__search` is the same `search` and nothing else: the MCP server exposes ONE of the CLI's ten verbs, cannot reach `ccc grep`, and breaks after a mid-session `ccc` upgrade — see `.claude/docs/third-party/cocoindex-code.md`
- Useful flags: `--path` (glob, e.g. `"src/utils/*"`), `--lang`, `--limit`, `--offset`, `--json`

### Cross-reference
- Context-Mode = *what happened this session* (command output, indexed docs, fetched URLs)
- CocoIndex = *what exists in code* (implementations, types, call sites)

## 2. THEN explore the codebase

Use context-mode tools to keep raw output out of context:
- `ctx_execute(language, code)` — run commands, only stdout summary enters context
- `ctx_execute_file(path, language, code)` — process files without loading full content
- `ctx_fetch_and_index(url)` — fetch docs/URLs, index for later search

Fallback to Read, Glob, Grep only when you need exact content in context (e.g., for editing). Use Bash only for mutations (git commit, file writes).

## 3. Rules

- Do NOT modify source code. You investigate only. You lack Edit on purpose.
- Show evidence — file paths, line numbers, code snippets. Don't just state conclusions.
- If you hit a dead end, document what you tried and why it didn't work.
- Be thorough but focused. Investigate what was asked, don't scope-creep.
