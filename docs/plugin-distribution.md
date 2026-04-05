# Plugin Distribution: Technical Reference

Notes on distributing adddog-team-kit via npm and Claude Code marketplace.

## npm Distribution

Published as `@adddog/adddog-team-kit` on npm. The `files` array in `package.json` controls what's included in the tarball.

### Installing

```bash
claude plugin add @adddog/adddog-team-kit
```

Or via marketplace:
```bash
claude plugin marketplace add adddog-tools
```

## Marketplace Setup

### marketplace.json

Every plugin entry MUST have a `version` field. Without it, Claude Code will not populate the plugin cache.

```json
{
  "name": "adddog-tools",
  "owner": { "name": "adddog" },
  "plugins": [
    {
      "name": "adddog-team-kit",
      "source": { "source": "npm", "package": "@adddog/adddog-team-kit", "version": ">=0.0.1" },
      "description": "Multi-agent team planning"
    }
  ]
}
```

**The `version` field is required.** Claude Code uses it to key the cache directory (`cache/<marketplace>/<plugin>/<version>/`). Without it, the cache is never populated, and `CLAUDE_PLUGIN_ROOT` resolves to an empty directory.

### Updating Consumers

After making changes:

1. Bump version in `plugin.json`
2. Publish to npm: `pnpm publish`
3. Consumers run `/plugin marketplace update` then `/reload-plugins`

If the cache isn't refreshing: `rm -rf ~/.claude/plugins/cache/adddog-tools/`

## Hook Scripts

### Shebangs

**Use `#!/usr/bin/env bash`, never `#!/bin/bash`.** NixOS does not have `/bin/bash`. The `env` lookup resolves bash via `$PATH`, which works on NixOS, macOS, and standard Linux.

### `CLAUDE_PLUGIN_ROOT`

All hook commands reference scripts via `${CLAUDE_PLUGIN_ROOT}/hooks/`. This variable is set by Claude Code to the plugin's installation directory.

### Testing hooks locally

When developing, `CLAUDE_PLUGIN_ROOT` points to the local package directory. Test hooks with:

```bash
echo '{"tool_name":"Edit","tool_input":{"file_path":"src/foo.ts"}}' | bash hooks/check-team-scope
```
