# cocoindex-code

AST-based semantic code search. ~70% token savings vs grep.

## Repo

https://github.com/cocoindex-io/cocoindex-code

> **Not** `cocoindex-claude` — that's a separate repo (a skill for *authoring* CocoIndex
> data pipelines). This tool is `cocoindex-code`, AST code search.

## Install

**Use the `[full]` extra.** Our `~/.cocoindex_code/global_settings.yml` is set to local
embeddings (`provider=sentence-transformers`, `Qwen/Qwen3-Embedding-0.6B`, see
[Embedding model](#embedding-model-global-ryzen-built-index)). The slim package omits
`torch`+`sentence-transformers`, so the daemon fails with
`ModuleNotFoundError: No module named 'sentence_transformers'` and search silently returns
zero results.

```bash
# uv (recommended)
uv tool install --upgrade 'cocoindex-code[full]'

# or pipx
pipx install 'cocoindex-code[full]'
```

| Variant | Deps | Embeddings | Use |
|---------|------|------------|-----|
| `cocoindex-code[full]` | +torch +sentence-transformers (~1GB) | local, no API key, offline, private | **ours** — private monorepo |
| `cocoindex-code` (slim) | LiteLLM only | cloud provider + API key (code leaves machine) | not used |

After any install/upgrade, restart the daemon so it loads new deps:

```bash
ccc daemon restart
ccc doctor          # "Model Check (indexing/query)" must be [OK], not ModuleNotFoundError
ccc index           # (re)build this project's index
```

## Upgrade

```bash
uv tool install --upgrade 'cocoindex-code[full]'
ccc daemon restart
```

## ⚠️ Local patch to the vendored `ccc` skill — re-apply after any re-vendor

`.agents/skills/ccc/` is vendored from upstream and pinned in `skills-lock.json`
(`cocoindex-io/cocoindex-code`, `computedHash: 61ade5da…`). We carry **one** local fix:

> `references/management.md` — upstream documents `pipx install cocoindex-code` (slim). That variant
> omits `torch`+`sentence-transformers`, so against our local-embedding `global_settings.yml` the
> daemon raises `ModuleNotFoundError` and **search silently returns zero results**. We replaced it
> with `uv tool install --upgrade 'cocoindex-code[full]'` plus the daemon-restart/verify steps.

Re-vendoring (`npx skills add cocoindex-io/cocoindex-code`, or any lockfile sync) **overwrites this
and silently reintroduces the broken install**. Upstream fix isn't an option for us, so verify after
any re-vendor:

```bash
# must print nothing. any hit = the slim install regressed, re-apply the patch above.
grep -rn "pipx install cocoindex-code$" .agents/skills/ccc/
```

The lock's `computedHash` is stale against our patched tree by design — do not "fix" it by
re-vendoring without re-applying.

## Usage

```bash
# on the Mac (runs on the Ryzen over ssh, see below)
ccc search "authentication middleware"
ccc search --lang typescript --path 'packages/*' retry with backoff
ccc grep 'attemptRef'      # structural grep, local, no index
```

`ccc init` / `ccc index` never run on the Mac (refused); the Ryzen's `ccc-poll.timer` owns indexing.

## Skill + CLI only (no MCP server)

Use the `ccc` skill and CLI. The `cocoindex-code` MCP server was removed from `.mcp.json` on 2026-11-10 and
`ccc mcp` is refused on the Mac: it exposed 1 of the CLI's verbs, could not reach `ccc grep`, pinned a
long-lived client to the session-start binary (zero results after an upgrade), and forced a full index pass
(`refresh_index`, ≈22 s on the Ryzen) on every search. Do not re-add it. On Codex, run commands whose output
may exceed 20 lines through context-mode `ctx_execute` with `language: "shell"`, which keeps search output out
of the agent context. CLI filters: `--lang`, `--path`, `--limit`, `--offset`, `--json`.

## Config

Project settings in `.cocoindex_code/settings.yml`. Keys are `include_patterns` / `exclude_patterns`
(**not** `include` / `exclude`):

```yaml
include_patterns:
  - "**/*.ts"
  - "**/*.vue"
exclude_patterns:
  - "**/node_modules"
  - "**/dist"
```

`settings.yml` is **tracked in git**; the multi-GB index db is not. `.gitignore` deliberately uses:

```
/.cocoindex_code/*
!/.cocoindex_code/settings.yml
```

⚠️ `ccc init` re-broadens that to `/.cocoindex_code/`, which silently untracks the tuned patterns.
If you re-run it, restore the two-line form above.

Excludes carry machine-state/generated patterns (`**/.pulumi/**`, `**/generated/**/*.json`,
`**/tsconfig*.json`, …) — before these, JSON was 203k of 350k chunks and drowned out code hits.
Re-validate any pattern change behaviourally — **not** with `ccc doctor`, see below.

### Exclude patterns: `!` negation, and how to tell it worked

`exclude_patterns` supports **gitignore-style `!` negation** — vendor docstring, class
`PatternFilePathMatcher` at `cocoindex/resources/file.py:227`, globset semantics. A pattern beginning
with `!` un-excludes paths that would otherwise be excluded by a **preceding** pattern.

- **Negation is one-directional — narrow the negation, never carve out of a broad one.** A plain
  re-exclude placed *after* a negation does **not** re-exclude (tested in both orders). So we negate
  `!**/.codex/agents/**`; never `!**/.codex/**` plus a `.generated/` carve-out.
- **The matcher prunes DIRECTORIES.** An excluded directory takes its whole subtree with it, and
  `is_dir_included` is consulted separately from `is_file_included`. A negation must therefore admit the
  *directory* as well as the file, or the walk never descends far enough to reach it.

⚠️ **`**/.*` alone silently blinded ccc to the whole `.claude/` tree.** Measured 2026-09-14:
`ccc grep 'attemptRef'` returned a clean `No matches found` for a symbol present **124** times, and
`ccc search` answered confidently out of unrelated trees. **Neither failure mode ever says "excluded".**
That silence is the trap — it reads as "the tool is unreliable", not "your patterns are wrong".

**`ccc doctor` cannot verify a pattern change** — it reports no file count (`--verbose` only adds
tracebacks). The real oracle is behavioural: grep a symbol whose location you already know.

```bash
# must print the definition at stage-templates.js:82, not "No matches found"
ccc grep 'attemptRef'
```

`ccc grep` needs no index, so it answers immediately after an edit to `settings.yml`.

### Hygiene (adopted 2026-11-10)

`max_file_size: 256KB` plus excludes `**/fixtures/**`, `**/__fixtures__/**`, `**/generated/**`,
`**/snapshots/**`, placed first in `exclude_patterns`. Eval arm A1: same ranking, 71% fewer chunks,
4.6x faster build, 2x faster queries (`team-session/20261107-ccc-embed-eval/results.md`). Changing
excludes or `max_file_size` only deletes or adds files; it never re-embeds the rest. Plus 8 exact-path
excludes: files whose one chunk exceeds 7,936 tokens, which the Ryzen GPU cannot embed; failed files are
retried every pass, so leaving them in caused a GPU OOM storm per pass.

## Embedding model + where indexing runs (Ryzen only)

**The Mac never indexes or embeds.** Qwen3 embedding made the Mac mini unusable (2026-11-10). The Ryzen
(`desktop/nixos-ryzen/modules/ccc-index/`) polls GitHub `main` every 5 min and indexes each change on its GPU. On the Mac,
`~/.local/bin/ccc` is `mac_config/ccc-remote/ccc`: `search` / `status` / `doctor` run on the Ryzen over
ssh (≈0.7 s), `grep` runs locally, `index` / `init` / `reset` / `daemon` / `mcp` are refused. Search sees pushed `main`, not local uncommitted work. Ryzen offline → the front prints why; use `rg`.
After any `uv tool install ... cocoindex-code`, re-run `mac_config/ccc-remote/setup.sh` (uv rewrites the link).

The Ryzen's ccc home (`/data/ccc/home/global_settings.yml`, tracked as
`desktop/nixos-ryzen/modules/ccc-index/home/global_settings.yml`) is byte-identical to the eval build's (arm A2qr):

```yaml
embedding:
  provider: sentence-transformers
  model: Qwen/Qwen3-Embedding-0.6B
  indexing_params: {}
  query_params:
    prompt_name: query
```

- **The model is global per ccc home.** A project `settings.yml` cannot set it (an `embedding:` key there
  is silently ignored). Changing it re-embeds every project of that home in full on its next use, and the
  first search blocks until that ends.
- **Never set `embedding.device`.** The fingerprint is (model, device, trust_remote_code); the Ryzen
  build left device unset, so setting it on either machine forces a full re-embed.
- `query_params.prompt_name: query` is required for Qwen3; without it quality drops with no error.
- **The index stores no model name** (only `float[1024]` in the DDL). This section is the record: the
  Ryzen index was seeded 2026-11-10 from the eval build at `1fc2cbb82` (eval arm A2qr, job dirs since
  retired) and caught up on the Ryzen GPU.
- **Re-embed rule:** per relative path, (mtime, content hash). Same content = no embed, even from a copy
  made on another machine at another absolute path. Keep python 3.12.12, ccc 0.2.41 and cocoindex 1.0.24
  pinned (`desktop/nixos-ryzen/modules/ccc-index/py/uv.lock`): a different `process_file` AST or ccc version
  reprocesses every file.
- The Mac holds no index for the monorepo (its MiniLM backups and the stopped Qwen3 pass were deleted
  2026-11-10); `.cocoindex_code/` there keeps only the tracked `settings.yml`.

## Freshness

ccc 0.2.41 has no file watcher. The index moves only on: the first CLI search per daemon lifetime,
`ccc index`, or `ccc search --refresh`. Here the Ryzen's
`ccc-poll.timer` runs `ccc index` whenever `main` moved and logs one line per run
(`journalctl -u ccc-poll`); `ERRORS` there means files failed to embed (`ccc index` itself exits 0).

## Docker (alternative)

```bash
docker run -d --name cocoindex-code \
  --volume "$(pwd):/workspace" \
  --volume cocoindex-db:/db \
  --volume cocoindex-model-cache:/root/.cache \
  ghcr.io/cocoindex-io/cocoindex-code:latest

docker exec -it cocoindex-code ccc index
```

## Resources

- [GitHub](https://github.com/cocoindex-io/cocoindex-code)
- [Docs](https://cocoindex.io)
