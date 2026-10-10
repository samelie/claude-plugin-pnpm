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

### Code retrieval — `rg` + CocoIndex, routed by question shape (benchmark 2026-09-27)
Blind 12-task benchmark (`team-session/20260927-ccc-eval/grade.md`): ccc-only, rg-only and free-choice solvers all scored 100% recall/precision; rg-only was fastest (208 s vs 306 s ccc-only); `ccc search` used the fewest commands only on concept tasks. Free choice picked rg every time. Unknown-vocabulary concept search was NOT tested (every concept task shared words with its target) — the case semantic search exists for.
- **Exact symbol / who-calls-X / text** → `rg`. ⚠ `rg` skips dot-dirs (`.claude/`, `.agents/`) silently — `--hidden` or target the dir.
- **Concept → location, name unknown** → `ccc search "<concept>"`. Run 2-3 phrasings; read the top 2-3 hits (a near-miss ranked #1 on one task).
- **`ccc grep '<pattern>'`** — structural by-example, no index, no daemon, reads the working tree. Optional. **An empty result is unproven**: "No matches found" also comes back for patterns it cannot parse — `a\|b` alternation, hyphenated/phrase text, extglob in `--path`, string-literal placeholders (~34% of historical agent `ccc grep` calls hit this) — and for a wrong `--lang` (a FILTER, not a hint; `--lang typescript` finds nothing in `.js`/`.mjs`). Prove the pattern on one known hit before trusting a negative.
- **Shape questions** (await inside a loop, except with no re-raise) → neither tool expresses them; small AST script (ts-morph / Python `ast`) or read candidate regions.
- ⚠ **`ccc search` is embedding-only — no lexical channel, no symbol index.** An exact identifier returns plausible-looking WRONG files at normal-looking scores, never "no results". Measured: `ccc search "assessSourceHealth"` returned five personal health-insurance documents (0.402-0.430) and zero code. **If you can spell the name, `rg` it.**
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
