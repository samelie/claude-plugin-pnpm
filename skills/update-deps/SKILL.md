---
name: update-deps
description: "Check and force-update Claude Code plugin dependencies. Use when marketplace update fails or you need latest versions of context-mode, claude-mem, caveman, cocoindex-code."
triggers:
  - update deps
  - update plugins
  - update dependencies
  - force update
  - plugin versions
---

# Update Dependencies

Force-update Claude Code plugin dependencies when marketplace update fails.

## Dependencies Tracked

| Dependency | Type | Source | Install Location |
|------------|------|--------|------------------|
| context-mode | plugin | mksglu/context-mode | ~/.claude/plugins/marketplaces/context-mode |
| claude-mem | plugin | thedotmack/claude-mem | ~/.claude/plugins/marketplaces/thedotmack |
| caveman | plugin | JuliusBrussee/caveman | ~/.claude/plugins/marketplaces/caveman |
| cocoindex-code | MCP server | cocoindex-io/cocoindex-code | ~/.local/bin/ccc |

## Check Current Versions

Run these to see installed versions:

```bash
# Plugin versions (check git commit/tag in cache)
ls -la ~/.claude/plugins/cache/context-mode/
ls -la ~/.claude/plugins/cache/thedotmack/claude-mem/
ls -la ~/.claude/plugins/cache/caveman/

# Cocoindex version
ccc --version 2>/dev/null || echo "ccc not found"
```

## Check Latest Upstream Versions

```bash
# Latest releases
gh release view --repo mksglu/context-mode --json tagName -q .tagName 2>/dev/null || echo "No releases, check main branch"
gh release view --repo thedotmack/claude-mem --json tagName -q .tagName 2>/dev/null || echo "No releases, check main branch"
gh release view --repo JuliusBrussee/caveman --json tagName -q .tagName 2>/dev/null || echo "No releases, check main branch"
gh release view --repo cocoindex-io/cocoindex-code --json tagName -q .tagName
```

## Force Update Plugins

When marketplace update fails, force update by clearing cache:

### context-mode
```bash
rm -rf ~/.claude/plugins/cache/context-mode/
rm -rf ~/.claude/plugins/marketplaces/context-mode/
# Then restart Claude Code - it will re-fetch from GitHub
```

### claude-mem
```bash
rm -rf ~/.claude/plugins/cache/thedotmack/
rm -rf ~/.claude/plugins/marketplaces/thedotmack/
# Then restart Claude Code
```

### caveman
```bash
rm -rf ~/.claude/plugins/cache/caveman/
rm -rf ~/.claude/plugins/marketplaces/caveman/
# Then restart Claude Code
```

## Force Update Cocoindex

Cocoindex is installed via `uv` (Python):

```bash
# Update to latest
uv tool upgrade cocoindex-code

# Or force reinstall
uv tool uninstall cocoindex-code
uv tool install cocoindex-code

# Verify
ccc --version
```

## Full Update Script

Run all updates at once:

```bash
#!/bin/bash
set -e

echo "=== Clearing plugin caches ==="
rm -rf ~/.claude/plugins/cache/context-mode/
rm -rf ~/.claude/plugins/cache/thedotmack/
rm -rf ~/.claude/plugins/cache/caveman/

echo "=== Clearing marketplace caches ==="
rm -rf ~/.claude/plugins/marketplaces/context-mode/
rm -rf ~/.claude/plugins/marketplaces/thedotmack/
rm -rf ~/.claude/plugins/marketplaces/caveman/

echo "=== Updating cocoindex-code ==="
uv tool upgrade cocoindex-code 2>/dev/null || echo "Cocoindex update failed - try: uv tool install cocoindex-code"

echo "=== Done ==="
echo "Restart Claude Code to fetch latest plugin versions."
```

## Troubleshooting

### Plugin not updating after cache clear
1. Check `~/.claude/settings.json` has correct `extraKnownMarketplaces` config
2. Verify GitHub repo is accessible: `gh repo view mksglu/context-mode`
3. Check for rate limiting: `gh api rate_limit`

### Cocoindex binary not found
```bash
# Check if uv tools bin is in PATH
echo $PATH | tr ':' '\n' | grep -E "local/bin|uv"

# Reinstall with uv
uv tool install cocoindex-code

# Check symlink
ls -la ~/.local/bin/ccc
```

### Hook errors after update
If seeing "UserPromptSubmit hook error" after update:
1. Check hook scripts exist in new plugin version
2. Run hook manually to see error: `node ~/.claude/plugins/marketplaces/context-mode/hooks/userpromptsubmit.mjs`

## Resources

- [context-mode docs](https://github.com/mksglu/context-mode)
- [claude-mem docs](https://context7.com/thedotmack/claude-mem)
- [cocoindex-code docs](https://github.com/cocoindex-io/cocoindex-code)
- [Claude Code plugin system](https://context7.com/websites/code_claude)
