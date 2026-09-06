# claude-mem

Cross-session memory and observation capture. Persists learnings across Claude Code sessions.

## Repo

https://github.com/thedotmack/claude-mem

## Install

```bash
# Recommended
npx claude-mem install

# Or one-liner
curl -fsSL https://install.cmem.ai/openclaw.sh | bash
```

## Upgrade

```bash
curl -fsSL https://install.cmem.ai/openclaw.sh | bash -s -- --upgrade
```

## Key Features

- `capture` — save observations with semantic tags
- `search` — vector search across past observations
- `get_observations` — retrieve by ID
- Worker service for background embedding

## Config

Settings in `~/.claude-mem/settings.json`:

```json
{
  "CLAUDE_MEM_PROVIDER": "gemini",
  "CLAUDE_MEM_GEMINI_API_KEY": "YOUR_KEY",
  "CLAUDE_MEM_WORKER_PORT": "37701"
}
```

## Known Issues

### Port mismatch (2026-04-22)

Hook hardcodes port calc `37700 + $(id -u) % 100`, but service default is `37777`.

**Fix**: Set port in settings to match hook:
```json
{
  "CLAUDE_MEM_WORKER_PORT": "37701"
}
```

Then restart:
```bash
pkill -f worker-service
```

## Resources

- [GitHub](https://github.com/thedotmack/claude-mem)
- [Docs](https://claude-mem.ai)
