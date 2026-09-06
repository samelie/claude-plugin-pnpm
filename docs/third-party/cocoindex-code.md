# cocoindex-code

AST-based semantic code search. ~70% token savings vs grep.

## Repo

https://github.com/cocoindex-io/cocoindex-code

> **Not** `cocoindex-claude` — that's a separate repo (a skill for *authoring* CocoIndex
> data pipelines). This tool is `cocoindex-code`, AST code search.

## Install

**Use the `[full]` extra.** Our `~/.cocoindex_code/global_settings.yml` is set to local
embeddings (`provider=sentence-transformers`, `all-MiniLM-L6-v2`). The slim package omits
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
# Initialize project
ccc init    # creates .cocoindex_code/settings.yml
ccc index   # build search index

# Search
ccc search "authentication middleware"
```

## Skill/CLI vs MCP — prefer the CLI

Both paths hit the same daemon and index. **Default to the `ccc` skill (Bash CLI).**

| | skill / CLI (`ccc search`) | MCP (`mcp__cocoindex-code__search`) |
|---|---|---|
| Reach | every agent — all have Bash | DEFAULT agent only; custom `agentType`s can't (`team-kit-run` rule 3) |
| Version safety | fresh process per call, always matches install | long-lived process pinned to session-start binary |
| Tool surface | none — Bash already granted | eager schema load in agents granting `mcp__cocoindex-code__*` |
| Filters | `--lang`, `--path`, `--limit`, `--offset`, `--refresh`, `--json` | `languages`, `paths`, `limit`, `offset`, `refresh_index` |

Parity is total, so nothing is lost by using the CLI.

⚠️ **After upgrading `ccc` mid-session the MCP path breaks** — the `ccc mcp` process still runs the
old client and every query returns zero results with
`Daemon version mismatch (daemon=<new>, client=<old>)`. `ccc daemon restart` does **not** fix it
(the daemon is the new side). Reconnect via `/mcp`, or restart the session if that returns `-32000`.
The CLI is unaffected.

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
Re-validate any pattern change with `ccc doctor` (its File Walk is read-only) before `ccc index`.

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
