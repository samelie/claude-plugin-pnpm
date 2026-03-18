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

# Non-team conversations: always approve
if [ ! -f ".claude/team-scope.json" ]; then
  echo '{"decision": "approve"}'
  exit 0
fi

# Team context: read stop event payload, check for incomplete task mentions
INPUT=$(cat)
RESULT=$(echo "$INPUT" | python3 -c "
import sys, json, re
try:
    data = json.load(sys.stdin)
    text = json.dumps(data)
    if re.search(r'(incomplete|in.progress|pending|not.done)', text, re.I):
        print('INCOMPLETE')
    else:
        print('OK')
except:
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
