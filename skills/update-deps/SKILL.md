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

# Truth source — package.json can lag (caveman stays 0.1.0 even at latest; upstream tags by git hash):
claude plugin list 2>/dev/null | grep -iE "context-mode|claude-mem|caveman"

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

**Preferred — `claude plugin update` (non-interactive, no `rm`, works in-session).** This is the
clean upgrade path for ALL marketplace plugins. Restart afterward to apply.

```bash
claude plugin marketplace update                 # refresh all manifests (or name: thedotmack|caveman|context-mode)
claude plugin update context-mode@context-mode
claude plugin update claude-mem@thedotmack       # bypasses the broken interactive installer
claude plugin update caveman@caveman             # bypasses the rm-rf policy block
claude plugin list                               # verify (truth source; package.json can lag)
```

⚠️ **`rm -rf ~/.claude/plugins/...` is BLOCKED by the Bash security deny-pattern (`rm -rf:*`)** — the
agent CANNOT run the cache/marketplace-clear flow below; it errors out. Use the CLI path above. The
per-plugin sections that follow are **fallbacks** for a from-scratch reinstall when a plugin is broken
or missing — and their `rm` steps must be run by a human via `!`.

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

Easiest: `claude plugin update claude-mem@thedotmack` (CLI path above).

⚠️ The installer script is **interactive** — it reads `/dev/tty` and FAILS headless when the agent
runs it (`bash: /dev/tty: Device not configured`). Only works when a **human** runs it via `!`:
```bash
! curl -fsSL https://install.cmem.ai/openclaw.sh | bash -s -- --upgrade
```

Manual fallback (human-only — `rm -rf` is policy-blocked for the agent):
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

Easiest: `claude plugin update caveman@caveman` (CLI path above), then verify cleanup (below).

Reinstall from scratch (human-only — cache-clear `rm -rf` is policy-blocked for the agent):
```bash
! rm -rf ~/.claude/plugins/cache/caveman/ ~/.claude/plugins/marketplaces/caveman/
claude plugin marketplace add JuliusBrussee/caveman
claude plugin install caveman@caveman
```

**After any caveman install/update/restart, run the cleanup CHECK below.**

## Caveman Post-Install Cleanup

**As of caveman 1.9.0 this is normally a NO-OP** — the new layout no longer ships the conflicting
cavecrew agents/skill (verified Jun 2026: a fresh `claude plugin update caveman` leaves no
`plugins/caveman/agents/` and no `cavecrew` dir).

⚠️ **Do NOT blind-delete dirs named `agents`.** The old `find -name "agents"` rule is WRONG for ≥1.9.0
— the new skill ships a legit `skills/caveman/agents/openai.yaml` example that the rule would nuke.
Conflicts are specifically the **cavecrew** skill + the 3 cavecrew agent files, nothing else.

**Detect first — only clean if real cavecrew artifacts exist:**
```bash
CAVEMAN_MKT=~/.claude/plugins/marketplaces/caveman
CAVEMAN_CACHE=~/.claude/plugins/cache/caveman
found=$( { ls -d "$CAVEMAN_MKT"/plugins/caveman/agents 2>/dev/null; \
           find "$CAVEMAN_MKT" "$CAVEMAN_CACHE" -iname 'cavecrew' 2>/dev/null; } )
if [ -z "$found" ]; then echo "✓ no cavecrew conflicts (caveman ≥1.9.0) — nothing to strip";
else printf '⚠ stale cavecrew artifacts present:\n%s\n' "$found"; fi
```

If conflicts ARE found (old caveman), strip them. NOTE: `rm -rf` is policy-blocked for the agent —
a **human** runs this via `!`:
```bash
! CAVEMAN_MKT=~/.claude/plugins/marketplaces/caveman; CAVEMAN_CACHE=~/.claude/plugins/cache/caveman; \
  rm -rf "$CAVEMAN_MKT"/plugins/caveman/agents/ "$CAVEMAN_MKT"/plugins/caveman/skills/cavecrew/ \
         "$CAVEMAN_MKT"/.{agents,junie,roo,kiro}/skills/cavecrew/; \
  find "$CAVEMAN_CACHE" -iname cavecrew -exec rm -rf {} + 2>/dev/null; \
  echo "cavecrew artifacts stripped."
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

Run all updates at once — **CLI-based, non-interactive, no `rm`** (the agent can run this directly).
Restart at the end to apply plugin updates.

```bash
#!/bin/bash
echo "=== Plugins (claude plugin update — no rm, no interactive installer) ==="
claude plugin marketplace update
for p in context-mode@context-mode claude-mem@thedotmack caveman@caveman; do
  claude plugin update "$p" || echo "update $p failed"
done
# context-mode: if hooks break post-update, run /context-mode:ctx-upgrade (rebuilds + reconfigures hooks + doctor)

echo "=== cocoindex-code (full = local-embedding deps) ==="
uv tool install --upgrade 'cocoindex-code[full]' \
  || echo "Cocoindex update failed - try: uv tool install 'cocoindex-code[full]'"
ccc daemon restart || true   # daemon caches old deps; must restart

echo "=== rtk ==="
brew upgrade rtk || echo "rtk update failed - try: brew install rtk or curl install"

claude plugin list           # verify plugin versions
echo "=== Done. Restart Claude Code to apply plugin updates. ==="
echo "Then run the Caveman cleanup CHECK — normally a no-op on caveman ≥1.9.0."
```

**After restart:** run the detect block under "Caveman Post-Install Cleanup". On caveman ≥1.9.0 it
reports `✓ no cavecrew conflicts` and stops — no `rm` needed. Only if stale cavecrew artifacts are
found does a human run the strip command via `!`.

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
| [caveman](https://context7.com/juliusbrussee/caveman) | `/juliusbrussee/caveman` | `claude plugin update caveman@caveman`; cavecrew cleanup is a no-op since 1.9.0 — verify only |

```bash
# Fetch latest install docs for all deps (use before updating this skill)
# context7 MCP: mcp__context7__query-docs with libraryId and query "installation update upgrade"
```
