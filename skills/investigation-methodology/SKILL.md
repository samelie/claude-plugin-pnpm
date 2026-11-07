---
name: investigation-methodology
description: "Investigation procedure for research agents — knowledge tools before file reads, rg vs ccc routing by question shape, evidence rules, no-edit rule for read-only roles. Preloaded into every team-* role, plus `researcher`, via its `skills:` field; Claude can also load it on demand (hidden from the / menu)."
user-invocable: false
---

# Investigation Methodology

Scope: open-ended exploration and unfamiliar code — not trivial lookups or edits to a file you already know.

## 1. MANDATORY: Query knowledge tools BEFORE code reading

Do not fall back to reading files one by one until you complete these — in this order.

⚠ **There is no `Grep` or `Glob` tool while you hold Bash** — native macOS/Linux builds replaced both with embedded `ugrep`/`bfs` reached through Bash (CHANGELOG 2.1.117), so a `tools:` line naming them is inert. Search with `rg` / `find` via Bash — but only *after* the steps below.

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

Fall back to Read (or `rg`/`find` via Bash) only when you need exact content in context.

**Running product / rendered UI** (measurer role) → start the dev server via Bash, verify with the `spyglass` skill — autonomous only on a LOCAL dev URL the run started (localhost / 127.0.0.1 / private dev host), `--isolated`, `--forbid-mechanism web_search`, `--driver claude` (never codex — overrides an ambient `SPYGLASS_DRIVER`; the codex driver needs human sign-off per the spyglass skill), explicit `--model` (haiku first, per the spyglass escalation ladder; autonomous escalation stops at `sonnet` — an `opus` errand needs human sign-off) / `--max-turns` / `--timeout-ms`; at most 2 paid retries. Authenticated (browser-shepherd), external / production URLs and remote mutation need human sign-off. Deterministic scripted steps → Playwright MCP direct.

## 3. Rules

- Read-only roles (no `Edit` in your frontmatter `tools:`): do NOT modify source code — you investigate only. Roles holding `Edit` (coder, tester, finisher) apply this procedure to the investigation part of their task, not as an edit ban.
- Show evidence — file paths, line numbers, code snippets. Don't just state conclusions.
- If you hit a dead end, document what you tried and why it didn't work.
- Be thorough but focused. Investigate what was asked, don't scope-creep.
