---
name: third-party-manager
description: "Install, update, and verify third-party Claude Code plugins and MCP servers. Checks upstream versions, updates to latest, validates installation."
triggers:
  - third-party
  - manage plugins
  - check plugin versions
  - update plugins
  - verify plugins
  - plugin status
  - third party tools
---

# Third-Party Manager

Manage Claude Code plugin dependencies: context-mode, claude-mem, caveman, cocoindex-code.

## Tools Tracked

| Tool | Type | Repo | Install Method |
|------|------|------|----------------|
| context-mode | Plugin | mksglu/context-mode | Marketplace |
| claude-mem | Plugin | thedotmack/claude-mem | Marketplace |
| caveman | Plugin | JuliusBrussee/caveman | Marketplace |
| cocoindex-code | MCP | cocoindex-io/cocoindex-code | uv/pipx |

## Commands

### Check All Versions

When user asks to check versions, run:

```bash
echo "=== INSTALLED VERSIONS ==="

echo -e "\n--- context-mode ---"
if [ -d ~/.claude/plugins/marketplaces/context-mode ]; then
  cd ~/.claude/plugins/marketplaces/context-mode && git log -1 --format="%h %s (%ci)" 2>/dev/null || echo "Not a git repo"
else
  echo "NOT INSTALLED"
fi

echo -e "\n--- claude-mem ---"
if [ -d ~/.claude/plugins/marketplaces/thedotmack ]; then
  cd ~/.claude/plugins/marketplaces/thedotmack && git log -1 --format="%h %s (%ci)" 2>/dev/null || echo "Not a git repo"
else
  echo "NOT INSTALLED"
fi

echo -e "\n--- caveman ---"
if [ -d ~/.claude/plugins/marketplaces/caveman ]; then
  cd ~/.claude/plugins/marketplaces/caveman && git log -1 --format="%h %s (%ci)" 2>/dev/null || echo "Not a git repo"
else
  echo "NOT INSTALLED"
fi

echo -e "\n--- cocoindex-code ---"
ccc --version 2>/dev/null || echo "NOT INSTALLED"

echo -e "\n=== UPSTREAM VERSIONS ==="

echo -e "\n--- context-mode (mksglu/context-mode) ---"
gh api repos/mksglu/context-mode/commits/main --jq '.sha[:7] + " " + .commit.message[:50] + " (" + .commit.committer.date[:10] + ")"' 2>/dev/null || echo "Failed to fetch"

echo -e "\n--- claude-mem (thedotmack/claude-mem) ---"
gh api repos/thedotmack/claude-mem/commits/main --jq '.sha[:7] + " " + .commit.message[:50] + " (" + .commit.committer.date[:10] + ")"' 2>/dev/null || echo "Failed to fetch"

echo -e "\n--- caveman (JuliusBrussee/caveman) ---"
gh api repos/JuliusBrussee/caveman/commits/main --jq '.sha[:7] + " " + .commit.message[:50] + " (" + .commit.committer.date[:10] + ")"' 2>/dev/null || echo "Failed to fetch"

echo -e "\n--- cocoindex-code (cocoindex-io/cocoindex-code) ---"
gh release view --repo cocoindex-io/cocoindex-code --json tagName,publishedAt --jq '.tagName + " (" + .publishedAt[:10] + ")"' 2>/dev/null || echo "No releases"
```

### Update Specific Tool

#### Update context-mode
```bash
echo "Updating context-mode..."
cd ~/.claude/plugins/marketplaces/context-mode && git pull origin main
echo "Done. Restart Claude Code to apply."
```

#### Update claude-mem
```bash
echo "Updating claude-mem..."
cd ~/.claude/plugins/marketplaces/thedotmack && git pull origin main
pkill -f worker-service 2>/dev/null || true
echo "Done. Restart Claude Code to apply."
```

#### Update caveman
```bash
echo "Updating caveman..."
cd ~/.claude/plugins/marketplaces/caveman && git pull origin main
echo "Done. Restart Claude Code to apply."
```

#### Update cocoindex-code
```bash
echo "Updating cocoindex-code..."
uv tool upgrade cocoindex-code 2>/dev/null || pipx upgrade cocoindex-code
ccc --version
echo "Done."
```

### Update All

```bash
#!/bin/bash
set -e

echo "=== Updating all third-party tools ==="

echo -e "\n--- context-mode ---"
if [ -d ~/.claude/plugins/marketplaces/context-mode ]; then
  cd ~/.claude/plugins/marketplaces/context-mode && git pull origin main
else
  echo "Not installed, skipping"
fi

echo -e "\n--- claude-mem ---"
if [ -d ~/.claude/plugins/marketplaces/thedotmack ]; then
  cd ~/.claude/plugins/marketplaces/thedotmack && git pull origin main
  pkill -f worker-service 2>/dev/null || true
else
  echo "Not installed, skipping"
fi

echo -e "\n--- caveman ---"
if [ -d ~/.claude/plugins/marketplaces/caveman ]; then
  cd ~/.claude/plugins/marketplaces/caveman && git pull origin main
else
  echo "Not installed, skipping"
fi

echo -e "\n--- cocoindex-code ---"
uv tool upgrade cocoindex-code 2>/dev/null || pipx upgrade cocoindex-code 2>/dev/null || echo "Not installed via uv/pipx"

echo -e "\n=== Done ==="
echo "Restart Claude Code to apply plugin updates."
```

### Force Reinstall (if corrupted)

```bash
#!/bin/bash
TOOL=$1

case $TOOL in
  context-mode)
    rm -rf ~/.claude/plugins/cache/context-mode/
    rm -rf ~/.claude/plugins/marketplaces/context-mode/
    echo "Cleared. Restart Claude Code to reinstall."
    ;;
  claude-mem)
    pkill -f worker-service 2>/dev/null || true
    rm -rf ~/.claude/plugins/cache/thedotmack/
    rm -rf ~/.claude/plugins/marketplaces/thedotmack/
    echo "Cleared. Restart Claude Code to reinstall."
    ;;
  caveman)
    rm -rf ~/.claude/plugins/cache/caveman/
    rm -rf ~/.claude/plugins/marketplaces/caveman/
    echo "Cleared. Restart Claude Code to reinstall."
    ;;
  cocoindex-code)
    uv tool uninstall cocoindex-code 2>/dev/null || pipx uninstall cocoindex-code
    uv tool install cocoindex-code 2>/dev/null || pipx install cocoindex-code
    ccc --version
    ;;
  *)
    echo "Unknown tool: $TOOL"
    echo "Options: context-mode, claude-mem, caveman, cocoindex-code"
    ;;
esac
```

### Verify Installation

```bash
#!/bin/bash
echo "=== Verification ==="

errors=0

echo -e "\n--- context-mode ---"
if [ -d ~/.claude/plugins/marketplaces/context-mode ]; then
  if [ -f ~/.claude/plugins/marketplaces/context-mode/.claude-plugin/manifest.json ]; then
    echo "✓ Installed"
  else
    echo "✗ Missing manifest"
    errors=$((errors + 1))
  fi
else
  echo "✗ Not installed"
  errors=$((errors + 1))
fi

echo -e "\n--- claude-mem ---"
if [ -d ~/.claude/plugins/marketplaces/thedotmack ]; then
  if [ -f ~/.claude/plugins/marketplaces/thedotmack/.claude-plugin/manifest.json ]; then
    echo "✓ Installed"
    if pgrep -f worker-service > /dev/null; then
      echo "✓ Worker running"
    else
      echo "⚠ Worker not running"
    fi
  else
    echo "✗ Missing manifest"
    errors=$((errors + 1))
  fi
else
  echo "✗ Not installed"
  errors=$((errors + 1))
fi

echo -e "\n--- caveman ---"
if [ -d ~/.claude/plugins/marketplaces/caveman ]; then
  if [ -f ~/.claude/plugins/marketplaces/caveman/.claude-plugin/manifest.json ]; then
    echo "✓ Installed"
  else
    echo "✗ Missing manifest"
    errors=$((errors + 1))
  fi
else
  echo "✗ Not installed"
  errors=$((errors + 1))
fi

echo -e "\n--- cocoindex-code ---"
if command -v ccc &> /dev/null; then
  echo "✓ Installed: $(ccc --version 2>/dev/null)"
else
  echo "✗ Not installed"
  errors=$((errors + 1))
fi

echo -e "\n=== Summary ==="
if [ $errors -eq 0 ]; then
  echo "All tools installed correctly."
else
  echo "$errors tool(s) have issues."
fi
```

## Troubleshooting

### Plugin not updating
1. Check git remote: `cd ~/.claude/plugins/marketplaces/<tool> && git remote -v`
2. Try force reinstall (see above)

### Rate limiting
```bash
gh api rate_limit --jq '.resources.core'
```

### Hook errors after update
Run hook manually to see error:
```bash
node ~/.claude/plugins/marketplaces/<tool>/hooks/userpromptsubmit.mjs
```

## Resources

- Docs: `docs/third-party/`
- [context-mode](https://github.com/mksglu/context-mode)
- [claude-mem](https://github.com/thedotmack/claude-mem)
- [caveman](https://github.com/JuliusBrussee/caveman)
- [cocoindex-code](https://github.com/cocoindex-io/cocoindex-code)
