#!/usr/bin/env node
//
// SubagentStart / SubagentStop hook: observability ledger for agent lifecycle.
//
// Appends one ndjson line per lifecycle event to
// team-session/_observability/lifecycle.ndjson. Schema-free lifecycle signal for
// the workflow path — pairs with record-failure.mjs to give the workflow a view of
// agent start/stop even when a heavy agent skips its STATUS line.
//
// Handles both SubagentStart and SubagentStop hook JSON on stdin. Derives the
// team-session dir from cwd. If no team-session dir exists, no-ops. NEVER throws,
// NEVER blocks (always exit 0).
//
// HONESTY (open item D7): these events are DOCUMENTED to fire for native subagents.
// Whether they fire for Workflow-tool agents is UNVERIFIED.

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
    event: payload.hook_event_name ?? payload.hookEventName ?? payload.event ?? null,
    agent_id: payload.agent_id ?? payload.subagent_id ?? null,
    agent_type: payload.agent_type ?? payload.subagent_type ?? null,
    agent_transcript_path:
      payload.agent_transcript_path ?? payload.transcript_path ?? null,
  };

  try {
    appendFileSync(join(obsDir, 'lifecycle.ndjson'), JSON.stringify(line) + '\n');
  } catch {
    // swallow — never block
  }
}

main()
  .catch(() => {})
  .finally(() => process.exit(0));
