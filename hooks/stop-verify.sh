#!/usr/bin/env bash
# Stop hook: approve immediately for non-team conversations;
# in team context, check for incomplete task indicators.
#
# Wire in hooks.json:
#   "Stop": [{
#     "matcher": "*",
#     "hooks": [{"type": "command", "command": "bash ${CLAUDE_PLUGIN_ROOT}/hooks/stop-verify.sh", "timeout": 10}]
#   }]

set -euo pipefail

# Non-team conversations: always approve.
# Team context is detected by any team-session/*/team-scope.json existing.
SCOPE_DIR="${CLAUDE_PROJECT_DIR:-.}/team-session"
SCOPE_FILE=$(find "$SCOPE_DIR" -maxdepth 3 -name 'team-scope.json' -type f 2>/dev/null | head -1)
if [ -z "$SCOPE_FILE" ]; then
  echo '{"decision": "approve"}'
  exit 0
fi

# Team context: read stop event payload, check for incomplete task mentions
INPUT=$(cat)
RESULT=$(echo "$INPUT" | python3 -c "
import sys, json, re
try:
    data = json.load(sys.stdin)
    # Anti-loop guard (canonical): if this Stop hook already fired this cycle,
    # NEVER block again — otherwise the block reason text ('incomplete') re-enters
    # the payload and self-perpetuates forever.
    if data.get('stop_hook_active'):
        print('OK'); sys.exit(0)
    text = json.dumps(data)
    # Only genuine team-protocol incompletion markers block — NOT arbitrary prose.
    # (The old regex matched words like 'pending'/'in progress'/'incomplete' anywhere
    # in the payload, so ordinary completion talk tripped it.)
    if re.search(r'STATUS:[ ]*(ERRORS_REMAINING|PARTIAL)', text):
        print('INCOMPLETE')
    else:
        print('OK')
except Exception:
    print('OK')
" 2>/dev/null)

if [[ "$RESULT" == "OK" || -z "$RESULT" ]]; then
  echo '{"decision": "approve"}'
else
  cat <<EOF
{"decision": "block", "reason": "Tasks appear incomplete. Check TaskList before stopping."}
EOF
fi
exit 0
