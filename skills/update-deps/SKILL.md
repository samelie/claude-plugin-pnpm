---
name: update-deps
description: "Check and force-update Claude Code plugin dependencies. Use when marketplace update fails or you need latest versions of context-mode, claude-mem, caveman, cocoindex-code, rtk."
triggers:
  - update deps
  - update plugins
  - update dependencies
  - force update
  - plugin versions
  - update rtk
  - rtk update
---

# Update Dependencies

Force-update Claude Code plugin dependencies when marketplace update fails.

## Dependencies Tracked

| Dependency | Type | Source | Install Location |
|------------|------|--------|------------------|
| context-mode | plugin | mksglu/context-mode | ~/.claude/plugins/marketplaces/context-mode |
| claude-mem | plugin | thedotmack/claude-mem | ~/.claude/plugins/marketplaces/thedotmack |
| caveman | plugin | JuliusBrussee/caveman | ~/.claude/plugins/marketplaces/caveman |
| cocoindex-code | MCP server (Python) | cocoindex-io/cocoindex-code | ~/.local/bin/ccc |
| rtk | CLI tool (Rust) | rtk-ai/rtk | homebrew or ~/.local/bin/rtk |

## Check Current Versions

```bash
# Plugin versions — read from marketplace package.json (cache dirs unreliable)
node -e "console.log('context-mode:', require('$HOME/.claude/plugins/marketplaces/context-mode/package.json').version)" 2>/dev/null || echo "context-mode: not installed"
node -e "console.log('claude-mem:', require('$HOME/.claude/plugins/marketplaces/thedotmack/package.json').version)" 2>/dev/null || echo "claude-mem: not installed"
node -e "console.log('caveman:', require('$HOME/.claude/plugins/marketplaces/caveman/package.json').version)" 2>/dev/null || echo "caveman: not installed"

# Cocoindex — no --version flag; use uv tool list
uv tool list 2>/dev/null | grep cocoindex-code || echo "cocoindex-code: not installed"

# rtk
rtk --version 2>/dev/null || echo "rtk: not installed"
```

## Check Latest Upstream Versions

```bash
gh release view --repo mksglu/context-mode --json tagName -q .tagName 2>/dev/null || echo "No releases, check main branch"
gh release view --repo thedotmack/claude-mem --json tagName -q .tagName 2>/dev/null || echo "No releases, check main branch"
gh release view --repo JuliusBrussee/caveman --json tagName -q .tagName 2>/dev/null || echo "No releases, check main branch"
gh release view --repo cocoindex-io/cocoindex-code --json tagName -q .tagName
gh release view --repo rtk-ai/rtk --json tagName -q .tagName
```

## Force Update Plugins

When marketplace update fails, force update by clearing cache + marketplace, then restart.

### context-mode

Easiest: run `/context-mode:ctx-upgrade` skill (handles everything).

Manual fallback:
```bash
rm -rf ~/.claude/plugins/cache/context-mode/
rm -rf ~/.claude/plugins/marketplaces/context-mode/
# Alternative: npm update -g context-mode
# Then restart Claude Code — re-fetches from GitHub
```

Reinstall from scratch:
```bash
/plugin marketplace add mksglu/context-mode
/plugin install context-mode@context-mode
```

### claude-mem

Easiest: upgrade via installer script:
```bash
curl -fsSL https://install.cmem.ai/openclaw.sh | bash -s -- --upgrade
```

Manual fallback:
```bash
rm -rf ~/.claude/plugins/cache/thedotmack/
rm -rf ~/.claude/plugins/marketplaces/thedotmack/
# Then restart Claude Code
```

Reinstall from scratch:
```bash
/plugin marketplace add thedotmack/claude-mem
/plugin install claude-mem
```

### caveman

```bash
rm -rf ~/.claude/plugins/cache/caveman/
rm -rf ~/.claude/plugins/marketplaces/caveman/
```

Reinstall from scratch:
```bash
claude plugin marketplace add JuliusBrussee/caveman
claude plugin install caveman@caveman
```

**IMPORTANT: After any caveman install/update/restart, ALWAYS run the cleanup below.**

## Caveman Post-Install Cleanup

Caveman ships bundled artifacts that conflict with our own definitions. **You MUST execute the cleanup script below** — do not just display it.

Conflicts:
- **plugins/caveman/agents/** — cavecrew-builder, cavecrew-investigator, cavecrew-reviewer
- **plugins/caveman/skills/cavecrew/** — cavecrew delegation skill
- **.junie/skills/cavecrew/**, **.roo/skills/cavecrew/**, **.kiro/skills/cavecrew/** — IDE-specific copies

**EXECUTE this cleanup every time caveman is installed or updated:**

```bash
CAVEMAN_MKT=~/.claude/plugins/marketplaces/caveman
CAVEMAN_CACHE=~/.claude/plugins/cache/caveman

rm -rf "$CAVEMAN_MKT/plugins/caveman/agents/" "$CAVEMAN_MKT/plugins/caveman/skills/cavecrew/" "$CAVEMAN_MKT/.agents/skills/cavecrew/" "$CAVEMAN_MKT/.junie/skills/cavecrew/" "$CAVEMAN_MKT/.roo/skills/cavecrew/" "$CAVEMAN_MKT/.kiro/skills/cavecrew/"
for d in $(find "$CAVEMAN_CACHE" -type d \( -name "agents" -o -name "cavecrew" \) 2>/dev/null); do rm -rf "$d"; done

echo "Caveman agents + cavecrew skill stripped."
```

**Also run on session start if agents dir exists** (catches missed cleanups):
```bash
[ -d ~/.claude/plugins/marketplaces/caveman/plugins/caveman/agents ] && {
  CAVEMAN_MKT=~/.claude/plugins/marketplaces/caveman
  rm -rf "$CAVEMAN_MKT/plugins/caveman/agents/" "$CAVEMAN_MKT/plugins/caveman/skills/cavecrew/" "$CAVEMAN_MKT/.agents/skills/cavecrew/" "$CAVEMAN_MKT/.junie/skills/cavecrew/" "$CAVEMAN_MKT/.roo/skills/cavecrew/" "$CAVEMAN_MKT/.kiro/skills/cavecrew/"
  echo "Caveman: late cleanup applied."
}
```

## Force Update Cocoindex

Cocoindex is installed via `uv` (Python). **Note**: `ccc` has no `--version` flag — use `uv tool list` or `ccc doctor` to verify.

**MUST install the `[full]` extra.** Our `~/.cocoindex_code/global_settings.yml` uses local
embeddings (`provider=sentence-transformers`). The slim package lacks `torch`+`sentence-transformers`
→ daemon throws `ModuleNotFoundError: No module named 'sentence_transformers'` and search silently
returns zero results. (Do **not** use the old `--prerelease explicit --with "cocoindex>=1.0.0a24"`
flags — stale, and they install slim.)

```bash
# Update to latest (full = local-embedding deps)
uv tool install --upgrade 'cocoindex-code[full]'

# Or force reinstall
uv tool uninstall cocoindex-code
uv tool install 'cocoindex-code[full]'

# Alternative: pipx
pipx install 'cocoindex-code[full]'    # first install
pipx upgrade cocoindex-code            # upgrade

# REQUIRED after install/upgrade — daemon caches old deps (uptime can be days)
ccc daemon restart

# Verify — Model Check (indexing/query) must be [OK], not ModuleNotFoundError
uv tool list | grep cocoindex-code
ccc doctor
```

### Verify Cocoindex — leading-edge + health

One block: confirms we run the **latest** release AND that the embedding model
actually loads (the silent-failure mode). Copy-paste:

```bash
INSTALLED=$(uv tool list 2>/dev/null | grep -oE 'cocoindex-code v[0-9.]+' | grep -oE '[0-9.]+$')
LATEST=$(gh release view --repo cocoindex-io/cocoindex-code --json tagName -q .tagName 2>/dev/null | tr -d 'v')
echo "cocoindex-code  installed=${INSTALLED:-MISSING}  latest=${LATEST:-?}"

# Leading edge?
if [ -n "$INSTALLED" ] && [ "$INSTALLED" = "$LATEST" ]; then
  echo "✓ leading edge"
else
  echo "✗ behind / missing — uv tool install --upgrade 'cocoindex-code[full]' && ccc daemon restart"
fi

# Healthy? (embedding deps loaded — slim install fails here)
DOC=$(ccc doctor 2>&1)
if echo "$DOC" | grep -q "ModuleNotFoundError"; then
  echo "✗ embedding deps MISSING (slim install) — uv tool install --upgrade 'cocoindex-code[full]' && ccc daemon restart"
elif echo "$DOC" | grep -q "\[OK\] Model Check"; then
  echo "✓ embedding model loads (Model Check OK)"
else
  echo "⚠ ccc doctor inconclusive — inspect manually"
fi
```

Pass criteria: `✓ leading edge` **and** `✓ embedding model loads`. Anything else → run the upgrade line.

## Force Update rtk

rtk (Rust Token Killer) filters CLI output for LLM context savings.

### Homebrew (recommended)
```bash
brew upgrade rtk

# Or reinstall
brew reinstall rtk

# Verify
rtk --version
```

### Quick Install (alternative)
```bash
curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/master/install.sh | sh

# Verify
rtk --version
```

### Cargo (from source)
```bash
cargo install --git https://github.com/rtk-ai/rtk rtk
```

## Full Update Script

Run all updates at once. **Two-phase**: clear caches + update CLIs, then restart, then strip agents.

### Phase 1: Clear + Update (run before restart)

```bash
#!/bin/bash
set -e

echo "=== Clearing plugin caches ==="
rm -rf ~/.claude/plugins/cache/context-mode/
rm -rf ~/.claude/plugins/cache/thedotmack/
rm -rf ~/.claude/plugins/cache/caveman/

echo "=== Clearing marketplace installs ==="
rm -rf ~/.claude/plugins/marketplaces/context-mode/
rm -rf ~/.claude/plugins/marketplaces/thedotmack/
rm -rf ~/.claude/plugins/marketplaces/caveman/

echo "=== Updating cocoindex-code ==="
uv tool install --upgrade 'cocoindex-code[full]' 2>/dev/null \
  || echo "Cocoindex update failed - try: uv tool install 'cocoindex-code[full]'"
ccc daemon restart 2>/dev/null || true   # daemon caches old deps; must restart

echo "=== Updating rtk ==="
brew upgrade rtk 2>/dev/null || echo "rtk update failed - try: brew install rtk or curl install"

echo "=== Done Phase 1 ==="
echo "Now restart Claude Code, then run Phase 2 to strip caveman agents."
```

### Phase 2: Caveman cleanup (MUST execute after restart)

**EXECUTE this automatically** — do not wait for user to ask:

```bash
CAVEMAN_MKT=~/.claude/plugins/marketplaces/caveman
CAVEMAN_CACHE=~/.claude/plugins/cache/caveman

rm -rf "$CAVEMAN_MKT/plugins/caveman/agents/" "$CAVEMAN_MKT/plugins/caveman/skills/cavecrew/" "$CAVEMAN_MKT/.agents/skills/cavecrew/" "$CAVEMAN_MKT/.junie/skills/cavecrew/" "$CAVEMAN_MKT/.roo/skills/cavecrew/" "$CAVEMAN_MKT/.kiro/skills/cavecrew/"
for d in $(find "$CAVEMAN_CACHE" -type d \( -name "agents" -o -name "cavecrew" \) 2>/dev/null); do rm -rf "$d"; done
echo "Caveman agents + cavecrew skill stripped."
```

## Troubleshooting

### Plugin not updating after cache clear
1. Check `~/.claude/settings.json` has correct `extraKnownMarketplaces` config
2. Verify GitHub repo accessible: `gh repo view mksglu/context-mode`
3. Check rate limiting: `gh api rate_limit`

### Cocoindex binary not found
```bash
# Check PATH includes uv tools bin
echo $PATH | tr ':' '\n' | grep -E "local/bin|uv"

# Check install status
uv tool list | grep cocoindex-code

# Run diagnostics
ccc doctor

# Reinstall (full = local-embedding deps)
uv tool install 'cocoindex-code[full]'
ccc daemon restart

# Check symlink
ls -la ~/.local/bin/ccc
```

### Cocoindex search returns nothing / ModuleNotFoundError: sentence_transformers

Global config uses local `sentence-transformers` embeddings but the slim package is installed
(no `torch`/`sentence-transformers`). Fix:
```bash
uv tool install --upgrade 'cocoindex-code[full]'
ccc daemon restart          # stale daemon keeps old deps loaded
ccc doctor                  # Model Check (indexing/query) must be [OK]
```

### Hook errors after update
If seeing "UserPromptSubmit hook error" after update:
1. Check hook scripts exist in new plugin version
2. Run hook manually: `node ~/.claude/plugins/marketplaces/context-mode/hooks/userpromptsubmit.mjs`
3. Try `/context-mode:ctx-doctor` for full diagnostics

### rtk not found or wrong version
```bash
which rtk
rtk --version

# If wrong rtk (reachingforthejack/rtk instead of rtk-ai/rtk)
brew uninstall rtk
brew install rtk-ai/rtk/rtk

# Or use curl installer
curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/master/install.sh | sh
```

### rtk gain command not working
Wrong rtk package (Rust Type Kit vs Token Killer). Reinstall from rtk-ai/rtk repo.

## Resources & Context7 Library IDs

When updating this skill, fetch latest docs via context7 MCP to verify install/update commands are current.

| Dependency | Context7 Library ID | Quick Update Tip |
|------------|-------------------|------------------|
| [context-mode](https://context7.com/mksglu/context-mode) | `/mksglu/context-mode` | `/ctx-upgrade` skill |
| [claude-mem](https://context7.com/thedotmack/claude-mem) | `/thedotmack/claude-mem` | `install.cmem.ai --upgrade` |
| [cocoindex-code](https://context7.com/cocoindex-io/cocoindex-code) | `/cocoindex-io/cocoindex-code` | `ccc doctor` for diagnostics |
| [rtk](https://context7.com/rtk-ai/rtk) | `/rtk-ai/rtk` | `rtk gain` for savings analytics |
| [caveman](https://context7.com/juliusbrussee/caveman) | `/juliusbrussee/caveman` | strip agents after every update |

```bash
# Fetch latest install docs for all deps (use before updating this skill)
# context7 MCP: mcp__context7__query-docs with libraryId and query "installation update upgrade"
```
