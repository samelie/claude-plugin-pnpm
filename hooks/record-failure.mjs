#!/usr/bin/env node
// PostToolUseFailure hook: observability ledger for tool failures.
// appends one ndjson line per failure to team-session/_observability/failures.ndjson — a
// schema-free failure signal that survives a heavy agent skipping its STATUS line (run rule 9).
// fires for native subagents and workflow agents: the ledger carries `workflow-subagent` and
// custom agentType rows (probe PR-4, 2.1.296).
// no-ops when cwd has no team-session/. never throws, never blocks (always exit 0).

import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function main() {
  let raw = '';
  try {
    raw = await readStdin();
  } catch {
    return; // can't read stdin — give up silently
  }

  let payload = {};
  try {
    payload = JSON.parse(raw);
  } catch {
    payload = {}; // unparseable — still try to record a minimal line below
  }

  const teamSessionDir = join(process.cwd(), 'team-session');
  if (!existsSync(teamSessionDir)) return;

  const obsDir = join(teamSessionDir, '_observability');
  try {
    mkdirSync(obsDir, { recursive: true });
  } catch {
    return; // can't create dir — give up silently
  }

  const line = {
    ts: new Date().toISOString(),
    agent_type: payload.agent_type ?? payload.subagent_type ?? null,
    tool_name: payload.tool_name ?? null,
    error:
      payload.error ??
      payload.tool_error ??
      payload.tool_response?.error ??
      payload.message ??
      null,
    session_id: payload.session_id ?? null,
  };

  try {
    appendFileSync(join(obsDir, 'failures.ndjson'), JSON.stringify(line) + '\n');
  } catch {
    // swallow — never block
  }
}

main()
  .catch(() => {})
  .finally(() => process.exit(0));
