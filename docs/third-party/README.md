# Third-Party Tools

Claude Code plugins and MCP servers this project depends on.

## Tools

| Tool | Type | Repo | Purpose |
|------|------|------|---------|
| [context-mode](./context-mode.md) | Plugin | mksglu/context-mode | Context window protection via FTS5 knowledge base |
| [caveman](./caveman.md) | Plugin | JuliusBrussee/caveman | Token-optimized communication mode |
| [cocoindex-code](./cocoindex-code.md) | MCP Server | cocoindex-io/cocoindex-code | AST-based semantic code search |

## Management

Use the `/update-deps` skill to check versions and update.

```bash
# Check all versions
"check third-party versions"

# Update all
"update all plugins"

# Update specific
"update context-mode"
```

## Install Locations

| Tool | Location |
|------|----------|
| context-mode | `~/.claude/plugins/marketplaces/context-mode` |
| caveman | `~/.claude/plugins/marketplaces/caveman` |
| cocoindex-code | `~/.local/bin/ccc` (via uv) |
