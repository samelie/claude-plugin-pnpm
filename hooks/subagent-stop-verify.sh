#!/usr/bin/env bash
# SubagentStop hook: verify agent reported STATUS before stopping.
#
# Checks that the agent's final output contains a STATUS: line
# (CLEAN, ERRORS_REMAINING, or PARTIAL).
#
# This hook blocks agents from going idle without reporting their status,
# which prevents the lead/QB from losing track of work.
#
# Wire in settings.local.json:
#   "SubagentStop": [{
#     "matcher": "*",
#     "hooks": [{"type": "command", "command": "bash ${CLAUDE_PLUGIN_ROOT}/hooks/subagent-stop-verify.sh", "timeout": 10}]
#   }]

set -euo pipefail

# Read the stop context from stdin
INPUT=$(cat)

# Extract the agent's last message/output
# The exact format depends on Claude Code's SubagentStop event payload.
# We check if the input contains a STATUS: line anywhere.
HAS_STATUS=$(echo "$INPUT" | python3 -c "
import sys, json, re

try:
    data = json.load(sys.stdin)
    # Check in various possible fields for the STATUS line
    text = json.dumps(data)
    pattern = r'STATUS:\s*(CLEAN|ERRORS_REMAINING|PARTIAL)'
    if re.search(pattern, text):
        print('YES')
    else:
        print('NO')
except:
    # If we can't parse, don't block
    print('YES')
" 2>/dev/null)

if [[ "$HAS_STATUS" == "YES" || -z "$HAS_STATUS" ]]; then
  # STATUS found or couldn't parse (fail-open)
  cat <<EOF
{
  "decision": "approve"
}
EOF
  exit 0
fi

# No STATUS line found — block the stop
cat <<EOF
{
  "decision": "block",
  "reason": "Missing STATUS line. Before stopping, your final message must end with one of: 'STATUS: CLEAN', 'STATUS: ERRORS_REMAINING: <count> errors in <packages>', or 'STATUS: PARTIAL — completed N/M tasks, remaining: <list>'."
}
EOF
