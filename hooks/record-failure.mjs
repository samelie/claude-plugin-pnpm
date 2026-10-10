#!/usr/bin/env node
//
// PostToolUseFailure hook: observability ledger for tool failures.
//
// Appends one ndjson line per failure to team-session/_observability/failures.ndjson.
// Schema-free failure signal for the workflow path — addresses rule-9's blind spot
// where a heavy agent skips its STATUS line and the failure is otherwise invisible.
//
// Reads PostToolUseFailure hook JSON on stdin. Derives the team-session dir from cwd.
// If no team-session dir exists, no-ops. NEVER throws, NEVER blocks (always exit 0).
//
// HONESTY (open item D7): this hook is DOCUMENTED to fire for native subagents / Task
// tool invocations. Whether it fires for Workflow-tool agents is UNVERIFIED.

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

  // Derive team-session dir from cwd. No-op if absent.
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
