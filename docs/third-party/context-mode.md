# context-mode

Context window protection via FTS5 knowledge base. Keeps raw tool output out of agent context.

## Repo

https://github.com/mksglu/context-mode

## Codex install

Verified with Codex CLI 0.153.4 and context-mode 1.0.169.

```bash
codex plugin marketplace add mksglu/context-mode
codex plugin add context-mode@context-mode
```

The plugin supplies the skills and hooks. On 0.153.4 its MCP manifest appears in `codex mcp list`, but
the tools do not project into `codex exec`. Keep this explicit fallback in `~/.codex/config.toml`:

```toml
[features]
hooks = true

[mcp_servers.context-mode]
command = "/Users/selie/.nvm/versions/node/v25.9.0/bin/node"
args = ["/Users/selie/.codex/plugins/cache/context-mode/context-mode/1.0.169/start.mjs"]
cwd = "/Users/selie/.codex/plugins/cache/context-mode/context-mode/1.0.169"
default_tools_approval_mode = "approve"

[mcp_servers.context-mode.env]
CONTEXT_MODE_PLATFORM = "codex"
CONTEXT_MODE_DIR = "/Users/selie/.codex/context-mode"
```

Absolute commands are load-bearing under minimal-PATH launchers. The explicit `CONTEXT_MODE_DIR`
keeps Codex storage stable instead of relying on platform fallback behavior. `plugin_hooks` was removed
from Codex; do not add that feature flag.

`default_tools_approval_mode = "approve"` is also load-bearing for unattended workers. Without it,
read-only `ctx_stats` passes but `ctx_execute` fails with `MCP tool call requires approval` whenever
`approval_policy = "never"` is active.

`context-mode doctor` reports a duplicate-registration warning with this workaround. It is expected
until a plugin-only fresh-session probe can call `ctx_stats`.

## Claude Code install

Installed through the Claude Code marketplace and linked into the global npm bin on this machine.

## Key Features

- `ctx_batch_execute` — run commands, auto-index output
- `ctx_search` — FTS5 search over indexed content
- `ctx_execute` / `ctx_execute_file` — run code in sandbox, index results
- `ctx_fetch_and_index` — fetch URLs, index content

## Verify

```bash
codex mcp get context-mode
context-mode doctor
codex exec -c approval_policy="never" \
  'Run `ccc doctor` through context-mode ctx_execute with language shell; require exit 0.' < /dev/null
```

The last command must print `mcp: context-mode/ctx_execute (completed)` and healthy CocoIndex model/index
checks. `ctx_stats` and `codex mcp list` are insufficient: they do not exercise executable-tool approval.

TeamKit's `.codex/emit-role-args.mjs` carries the explicit server into per-worker `CODEX_HOME` configs
and links the `context-mode` and `ccc` skills. Every `.codex/agents/team-*.toml` role applies the same
routing contract: read/query/test/build/diff commands go through context-mode; CocoIndex stays CLI-only
and runs inside `ctx_execute`.

## Troubleshooting

### Hook errors

Run `context-mode doctor`. Every Codex hook and `[features].hooks` must pass.

### Database corruption
```bash
rm ~/.claude/plugins/marketplaces/context-mode/config/fts5.db
# Rebuilt on next ctx_batch_execute
```

## Resources

- [GitHub](https://github.com/mksglu/context-mode)
- [ctx_stats skill](../skills/ctx-stats/)
