# cocoindex-code

AST-based semantic code search. ~70% token savings vs grep.

## Repo

https://github.com/cocoindex-io/cocoindex-code

## Install

```bash
# pipx (recommended)
pipx install cocoindex-code

# or uv
uv tool install cocoindex-code
```

## Upgrade

```bash
pipx upgrade cocoindex-code
# or
uv tool upgrade cocoindex-code
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
