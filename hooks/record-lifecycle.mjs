#!/usr/bin/env node
// SubagentStart / SubagentStop hook: observability ledger for agent lifecycle.
// appends one ndjson line per event to team-session/_observability/lifecycle.ndjson; pairs with
// record-failure.mjs so agent start/stop stays visible even when a heavy agent skips its STATUS line.
// fires for native subagents and workflow agents: agent_type is `workflow-subagent` for default
// workflow agents, the custom agentType for agent({agentType}) (probes PR-4, PR-3b, 2.1.296).
// payload keys: agent_id, agent_type, agent_transcript_path — no agent_name.
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
