# caveman

Token-optimized communication mode. ~75% token reduction via compressed speech patterns.

## Repo

https://github.com/JuliusBrussee/caveman

## Install

Via Claude Code marketplace (auto-installed with plugin config).

Manual:
```bash
cd ~/.claude/plugins/marketplaces
git clone https://github.com/JuliusBrussee/caveman.git caveman
```

## Usage

```bash
# Enable
/caveman full

# Levels
/caveman lite   # Light compression
/caveman full   # Drop articles, fragments OK
/caveman ultra  # Maximum compression

# Disable
"stop caveman" or "normal mode"
```

## How It Works

Caveman mode injects a system prompt via hook that instructs Claude to:
- Drop articles (a/an/the)
- Drop filler words (just/really/basically)
- Drop pleasantries (sure/certainly)
- Use fragments
- Use short synonyms

Code blocks and security warnings remain normal.

## Config

Hook-based, no config required. Mode persists per-session.

## Skills

| Skill | Purpose |
|-------|---------|
| `caveman` | Enable mode |
| `caveman-commit` | Compressed commit messages |
| `caveman-review` | Compressed code review |
| `compress` | Compress memory files |

## Resources

- [GitHub](https://github.com/JuliusBrussee/caveman)
