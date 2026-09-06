# Plugin Distribution: Technical Reference

Notes on distributing `claude-plugin-pnpm` via the Claude Code marketplace, sourced directly from GitHub (npm publishing is retired).

## Distribution model

`.claude/` in the monorepo is the single source of truth. `build-plugin.mjs` regenerates the publishable shell (`packages/claude-plugin-pnpm/`) from it, and `shared-sync-package.yaml` subtree-splits that shell to the public repo `samelie/claude-plugin-pnpm`. The marketplace sources the plugin from the repo itself — no npm package.

### Installing

```bash
# add the marketplace (clones the GitHub repo), then install the plugin
/plugin marketplace add samelie/claude-plugin-pnpm
/plugin install claude-plugin-pnpm@adddog-tools
```

## Marketplace Setup

### marketplace.json

Lives at `.claude-plugin/marketplace.json` in the repo root. The plugin code IS the marketplace repo root (co-located with `.claude-plugin/plugin.json`), so the plugin `source` is the relative path `"./"`.

```json
{
  "name": "adddog-tools",
  "owner": { "name": "adddog" },
  "plugins": [
    {
      "name": "claude-plugin-pnpm",
      "source": "./",
      "version": "0.6.0",
      "description": "..."
    }
  ]
}
```

Constraints (each of these has broken installs before):

- `owner` MUST be an object (`{ "name": "..." }`), never a bare string.
- `source: "./"` resolves against the cloned marketplace repo root. Only relative-path sources may be bare strings; `github`/`git`/`npm` sources are objects whose discriminator key is `source` (not `type`) — e.g. `{ "source": "github", "repo": "owner/repo" }`.
- **`version` is required for cache keying.** Claude Code keys the plugin cache on `cache/<marketplace>/<plugin>/<version>/`. Without a version (here or in `plugin.json`), the cache is never populated and `CLAUDE_PLUGIN_ROOT` resolves to an empty dir. `build-plugin.mjs` stamps this version from `package.json`, in lockstep with `plugin.json`.

### Updating consumers

After changing `.claude/`:

1. Bump `version` in `packages/claude-plugin-pnpm/package.json` — the single version source, stamped into both `plugin.json` and `marketplace.json`.
2. Regenerate + commit: `pnpm -F @adddog/claude-plugin-pnpm build:plugin`.
3. Push to `main` → `sync-public-packages` mirrors the shell to `samelie/claude-plugin-pnpm`.
4. Consumers run `/plugin marketplace update adddog-tools` then `/reload-plugins`.

If the cache isn't refreshing: `rm -rf ~/.claude/plugins/cache/adddog-tools/`

## Hook Scripts

### Shebangs

**Use `#!/usr/bin/env bash`, never `#!/bin/bash`.** NixOS does not have `/bin/bash`. The `env` lookup resolves bash via `$PATH`, which works on NixOS, macOS, and standard Linux.

### `CLAUDE_PLUGIN_ROOT`

Shipped hook commands reference scripts via `${CLAUDE_PLUGIN_ROOT}/hooks/` (the generator path-translates `${CLAUDE_PLUGIN_ROOT}/` → `${CLAUDE_PLUGIN_ROOT}/` on build). This variable is set by Claude Code to the plugin's installation directory.

### Testing hooks locally

When developing, `CLAUDE_PLUGIN_ROOT` points to the local package directory. Test hooks with:

```bash
echo '{"tool_name":"Edit","tool_input":{"file_path":"src/foo.ts"}}' | bash hooks/check-team-scope
```
