# context-mode

Context window protection via FTS5 knowledge base. Keeps raw tool output out of Claude's context.

## Repo

https://github.com/mksglu/context-mode

## Install

Via Claude Code marketplace (auto-installed with plugin config).

Manual:
```bash
cd ~/.claude/plugins/marketplaces
git clone https://github.com/mksglu/context-mode.git context-mode
```

## Key Features

- `ctx_batch_execute` — run commands, auto-index output
- `ctx_search` — FTS5 search over indexed content
- `ctx_execute` / `ctx_execute_file` — run code in sandbox, index results
- `ctx_fetch_and_index` — fetch URLs, index content

## Config

Settings in `~/.claude/plugins/marketplaces/context-mode/config/`:
- `ctx_config.yaml` — MCP server settings
- `fts5.db` — SQLite knowledge base

## Troubleshooting

### Hook errors
```bash
node ~/.claude/plugins/marketplaces/context-mode/hooks/userpromptsubmit.mjs
```

### Database corruption
```bash
rm ~/.claude/plugins/marketplaces/context-mode/config/fts5.db
# Rebuilt on next ctx_batch_execute
```

## Resources

- [GitHub](https://github.com/mksglu/context-mode)
- [ctx_stats skill](../skills/ctx-stats/)
