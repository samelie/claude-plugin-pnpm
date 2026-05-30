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

## Usage

```bash
# Initialize project
ccc init    # creates .cocoindex_code/settings.yml
ccc index   # build search index

# Search
ccc search "authentication middleware"
```

## MCP Integration

Exposed via MCP server `cocoindex-code`:
- `mcp__cocoindex-code__search` — semantic code search

## Config

Project settings in `.cocoindex_code/settings.yml`:

```yaml
include:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.vue"
exclude:
  - "**/node_modules/**"
  - "**/dist/**"
```

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
