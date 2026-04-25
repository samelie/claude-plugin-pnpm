# @adddog/claude-plugin-pnpm

Claude Code plugin for pnpm monorepo workflows — team agents, workspace operations, and cross-session memory.

## Dependencies

This plugin relies on four open-source projects for enhanced functionality. See [`docs/third-party/`](./docs/third-party/) for detailed documentation.

| Tool | Purpose | Repo |
|------|---------|------|
| context-mode | Context window protection via FTS5 | [mksglu/context-mode](https://github.com/mksglu/context-mode) |
| claude-mem | Cross-session memory | [thedotmack/claude-mem](https://github.com/thedotmack/claude-mem) |
| caveman | Token-optimized communication | [JuliusBrussee/caveman](https://github.com/JuliusBrussee/caveman) |
| cocoindex-code | AST-based code search | [cocoindex-io/cocoindex-code](https://github.com/cocoindex-io/cocoindex-code) |

Use `/third-party-manager` skill to check versions, update, and verify installations.

---

### claude-mem

Cross-session memory and observation capture for Claude Code.

- **Repo**: https://github.com/thedotmack/claude-mem
- **Docs**: https://claude-mem.ai

#### Install

```bash
# Recommended — interactive setup
npx claude-mem install

# Or one-liner (auto-detects deps)
curl -fsSL https://install.cmem.ai/openclaw.sh | bash
```

#### Upgrade

```bash
curl -fsSL https://install.cmem.ai/openclaw.sh | bash -s -- --upgrade
```

#### Manual Setup

```bash
git clone https://github.com/thedotmack/claude-mem.git
cd claude-mem
bun install && bun run build
bun run cursor:setup  # interactive config
```

Provider config goes in `~/.claude-mem/settings.json`:

```json
{
  "CLAUDE_MEM_PROVIDER": "gemini",
  "CLAUDE_MEM_GEMINI_API_KEY": "YOUR_KEY"
}
```

---

### cocoindex-code

AST-based semantic code search — 70% token savings vs grep.

- **Repo**: https://github.com/cocoindex-io/cocoindex-code
- **Docs**: https://cocoindex.io

#### Install

```bash
# pipx (recommended)
pipx install cocoindex-code

# or uv
uv tool install --upgrade cocoindex-code --prerelease explicit --with "cocoindex>=1.0.0a24"
```

#### Upgrade

```bash
pipx upgrade cocoindex-code
```

#### Initialize Project

```bash
ccc init    # creates .cocoindex_code/settings.yml
ccc index   # build search index
```

#### Docker (alternative)

```bash
docker run -d --name cocoindex-code \
  --volume "$(pwd):/workspace" \
  --volume cocoindex-db:/db \
  --volume cocoindex-model-cache:/root/.cache \
  ghcr.io/cocoindex-io/cocoindex-code:latest

docker exec -it cocoindex-code ccc index
```

---

### context-mode

Context window protection via FTS5 knowledge base.

- **Repo**: https://github.com/mksglu/context-mode

Installed via Claude Code marketplace. Key tools:
- `ctx_batch_execute` — run commands, auto-index
- `ctx_search` — FTS5 search
- `ctx_execute` / `ctx_execute_file` — sandbox execution

---

### caveman

Token-optimized communication mode (~75% reduction).

- **Repo**: https://github.com/JuliusBrussee/caveman

Installed via Claude Code marketplace. Usage:
```bash
/caveman full    # enable
"stop caveman"   # disable
```

---

## Setup

### Fork Mode (Cost Optimization)

For ~10x cost reduction on parallel agents, enable fork subagents:

```bash
# Add to ~/.zshrc or ~/.bashrc
export CLAUDE_CODE_FORK_SUBAGENT=1
```

Use by saying "fork" in team requests: `"as a team (fork), implement..."`

See `FRAMEWORK.md` for full fork documentation.

---

## Plugin Usage

See `CLAUDE.md` for team agents and workflow documentation.

### Quick Start

```bash
# Team planning (triggers team-kit)
"as a team, refactor the auth middleware"

# Workspace operations
pnpm -F "@adddog/claude-plugin-pnpm" lint
pnpm -F "@adddog/claude-plugin-pnpm" types
```

### Skills

| Skill | Purpose |
|-------|---------|
| `team-kit-create` | Multi-agent team planning |
| `workspace-fix` | Fix lint/types/knip in workspace packages |
| `changeset` | Generate changesets from git diff |
| `ship` | Changeset + git workflow |
| `third-party-manager` | Check/update/verify plugin dependencies |

### Agents

| Agent | Role |
|-------|------|
| `team-designer` | Requirements gathering |
| `planner` | Design + task decomposition |
| `team-coder` | Implementation |
| `team-reviewer` | Code review |
| `team-verifier` | Lint/types/tests |

---

## Hacks

Workarounds for upstream bugs. Check dates — may be fixed upstream.

### claude-mem port mismatch (2026-04-22)

**Issue**: Hook health check uses hardcoded port calc `37700 + $(id -u) % 100`, but service default is `37777`. Causes "UserPromptSubmit hook error" on every prompt.

**Symptom**:
```
UserPromptSubmit hook error
Failed with non-blocking status code: No stderr output
```

**Fix**: Set port in `~/.claude-mem/settings.json` to match hook calc:

```json
{
  "CLAUDE_MEM_WORKER_PORT": "37701"
}
```

Then restart service:
```bash
pkill -f worker-service
# Service auto-restarts on next Claude Code session, or:
node ~/.claude/plugins/marketplaces/thedotmack/plugin/scripts/bun-runner.js \
  ~/.claude/plugins/marketplaces/thedotmack/plugin/scripts/worker-service.cjs start
```

**Upstream**: https://github.com/thedotmack/claude-mem — hook should read settings instead of hardcoding port calc.
