#!/usr/bin/env bash
# PreToolUse hook: enforce file edits stay within team's package scope.
#
# Reads allowed paths from .claude/team-scope.json
# Receives Edit/Write tool input on stdin (JSON with file_path field).
# Outputs hookSpecificOutput JSON to deny if file is outside scope.
#
# If no scope file exists, allows everything (hook is a no-op).
# If file_path can't be parsed from stdin, allows (fail-open).
#
# Wire in settings.local.json:
#   "PreToolUse": [{
#     "matcher": "Write|Edit",
#     "hooks": [{"type": "command", "command": "bash ${CLAUDE_PLUGIN_ROOT}/hooks/check-team-scope.sh", "timeout": 10}]
#   }]

set -euo pipefail

SCOPE_FILE=".claude/team-scope.json"

# No scope file = no enforcement
if [[ ! -f "$SCOPE_FILE" ]]; then
  exit 0
fi

# Read tool input from stdin
INPUT=$(cat)

# Extract file_path from tool input
# Edit tool: {"file_path": "...", "old_string": "...", "new_string": "..."}
# Write tool: {"file_path": "...", "content": "..."}
FILE_PATH=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    # tool input may be nested under 'tool_input' or at top level
    if 'tool_input' in data:
        print(data['tool_input'].get('file_path', ''))
    else:
        print(data.get('file_path', ''))
except:
    print('')
" 2>/dev/null)

# If we can't determine the file path, fail open
if [[ -z "$FILE_PATH" ]]; then
  exit 0
fi

# Check if file is within any allowed path pattern
MATCH=$(python3 -c "
import sys, json, fnmatch, os

scope_file = '$SCOPE_FILE'
file_path = '$FILE_PATH'

# Normalize to relative path from repo root
if os.path.isabs(file_path):
    # Try to make relative to cwd (repo root)
    try:
        file_path = os.path.relpath(file_path)
    except ValueError:
        pass

with open(scope_file) as f:
    scope = json.load(f)

allowed = scope.get('allowed_paths', [])

# If no allowed_paths defined, allow everything
if not allowed:
    print('ALLOW')
    sys.exit(0)

for pattern in allowed:
    if fnmatch.fnmatch(file_path, pattern):
        print('ALLOW')
        sys.exit(0)

# Also check without leading ./
clean_path = file_path.lstrip('./')
for pattern in allowed:
    clean_pattern = pattern.lstrip('./')
    if fnmatch.fnmatch(clean_path, clean_pattern):
        print('ALLOW')
        sys.exit(0)

print('DENY')
" 2>/dev/null)

if [[ "$MATCH" == "ALLOW" || -z "$MATCH" ]]; then
  exit 0
fi

# Deny — file is outside team scope
ALLOWED_PATHS=$(python3 -c "
import json
with open('$SCOPE_FILE') as f:
    print(json.dumps(json.load(f).get('allowed_paths', [])))
" 2>/dev/null)

cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "File '$FILE_PATH' is outside team scope. Allowed paths: $ALLOWED_PATHS"
  }
}
EOF
