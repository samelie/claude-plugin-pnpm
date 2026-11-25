#!/usr/bin/env node
// SubagentStop hook: audit log of what each agent read from the contract and where its tokens went.
// parses the finished agent's transcript once and appends rows to
// team-session/_observability/plan-usage.ndjson. it prints nothing, so it adds no tokens to any context.
// rows hold line ranges and sizes, never file or prompt text. never throws, never blocks (always exit 0).
// a resumed or blocked agent stops more than once: plan-usage-report.mjs keeps its last agent row and
// one tool row per (agent, seq). observers stop dozens of times, so they log the agent row only.
// the lead is not a subagent: to log it, pipe this payload by hand with `session` and `agent_type: "lead"`.

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const WORKER = '--now';
const SETTLE_MS = 3000;
const POLL_MS = 100;
const OBSERVERS = /(^|:)(coder-guard|intent-keeper)$/;
// a direct /team-kit-run task has no create lane: its plan is fix-plan.md
const DOCS = { plan: ['team-plan.md', 'fix-plan.md'], design: ['design.md'], dod: ['definition-of-done.md'], requirements: ['requirements.md'] };
// shorter lines (table rules, fences, labels) match other files by accident
const MIN_MATCH = 30;
const NUMBERED = /^\s*(\d+)[\t→]/;
const PREFIX = /^(?:\s*\d+[\t→:-]|[^\s:]+:\d+[:-])/;

const textOf = (content) => {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map((part) => part?.text ?? '').join('\n');
};

const ranges = (numbers) => {
  const sorted = [...numbers].sort((a, b) => a - b);
  const out = [];
  for (const n of sorted) {
    const last = out[out.length - 1];
    if (last && last[1] === n - 1) last[1] = n;
    else out.push([n, n]);
  }
  return out.map(([a, b]) => (a === b ? `${a}` : `${a}-${b}`)).join(',');
};

const indexDoc = (text) => {
  const map = new Map();
  text.split('\n').forEach((line, i) => {
    const key = line.trim();
    if (key.length < MIN_MATCH) return;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(i + 1);
  });
  return map;
};

// matches returned text, not the command: `sed -n 5,9p $S/team-plan.md` names no path a log could read
const matchText = (text, map) => {
  const seen = new Set();
  let chars = 0;
  let last = 0;
  for (const line of text.split('\n')) {
    let key = line.trim();
    if (!map.has(key)) key = line.replace(PREFIX, '').trim();
    const places = map.get(key);
    if (!places) continue;
    const place = places.find((n) => n > last) ?? places[0];
    seen.add(place);
    last = place;
    chars += key.length;
  }
  return { seen, chars };
};

const numberedLines = (text) => {
  const seen = new Set();
  for (const line of text.split('\n')) {
    const hit = NUMBERED.exec(line);
    if (hit) seen.add(Number(hit[1]));
  }
  return seen;
};

// setup ahead of the real command: `S=<dir>;`, `G=<file> cmd`, `cd <dir> &&`
const SETUP = [
  /^(?:export\s+)?[A-Za-z_]\w*=(?:"[^"]*"|'[^']*'|\$\([^()]*\)|(?!\$\()[^\s;&|]*)\s*(?:&&|;)?\s*/,
  /^cd(?:\s+(?:"[^"]*"|'[^']*'|[^\s;&|]+))?\s*(?:&&|;)\s*/,
];
const HEREDOC = /<<-?\s*(['"]?)([A-Za-z_]\w*)\1([^\n]*)\n(?:[\s\S]*?\n)?[ \t]*\2[ \t]*(?=\n|$)/g;
const TARGET_MAX = 120;

// the log outlives the transcript, so a command's values and heredoc bodies never reach it.
// setup goes first: cut inside a `cd` path, the target hides what ran
const scrub = (command, root = null, sessionDir = null) => {
  // quoted prose or code (`sed 's/a b/c d/'`, `node -e '…'`) is file text; quoted paths have no spaces
  let text = command
    .replace(HEREDOC, '<<$2$3')
    .replace(/'[^']*'|"[^"]*"/g, (quoted) => (quoted.length >= 24 && /\s/.test(quoted) ? `${quoted[0]}…${quoted[0]}` : quoted));
  if (sessionDir) text = text.split(`${sessionDir}/`).join('$S/');
  if (root) text = text.split(`${root}/`).join('');
  text = text.replace(/\s*\n\s*/g, '; ').trim();
  for (let before = null; before !== text; ) {
    before = text;
    for (const setup of SETUP) {
      const rest = text.replace(setup, '');
      if (rest) text = rest;
    }
  }
  return text
    .replace(/\s+/g, ' ')
    .replace(/=\S+/g, '=…')
    .replace(/(?<![/\w-])[A-Za-z0-9_-]{24,}(?![/\w-])/g, '…')
    .slice(0, TARGET_MAX);
};

const sessionOf = (prompt, sessionsDir) => {
  const counts = new Map();
  for (const [, id] of prompt.matchAll(/team-session\/([A-Za-z0-9._-]+)/g)) {
    if (id !== '_observability') counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const ordered = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return ordered.find(([id]) => existsSync(join(sessionsDir, id)))?.[0] ?? null;
};

const taskOf = (description, prompt) => {
  const named = /\bT-[A-Za-z0-9][\w.-]*/.exec(description ?? '');
  if (named) return named[0];
  const ids = new Set(prompt.match(/\bT-\d+[a-z]?(?:\.\d+)?\b/g) ?? []);
  return ids.size === 1 ? [...ids][0] : null;
};

// the create step, from the header line every create dispatch carries (`Fresh-check: sat`,
// `Phase: define`, `Plan revision 7 of 7`); null for run-lane work, whose role and task say enough
const phaseOf = (prompt, role) => {
  const head = prompt.slice(0, 1500);
  const fresh = /Fresh-check:\s*`?([a-z-]+)/i.exec(head)?.[1]?.toLowerCase();
  if (fresh) return fresh === 'goal-audit' ? 'audit' : fresh;
  const phase = /^\W*phase\W*[:=]\s*`?([a-z-]+)/im.exec(head)?.[1];
  if (phase) return phase.toLowerCase();
  if (/\bGRADE phase\b/.test(head)) return 'grade';
  if (/\bTriage assessor\b/.test(head)) return 'triage';
  if (!String(role).endsWith('team-planner')) return null;
  // `Plan revision 7 of 7`, `planner revision 3 (final)`, `Plan revision (revision 2 of 3)`, `Step 4c — generate the plan`
  const lead = head.slice(0, 300);
  const revision = /\bplan(?:ner)? revision\b\D{0,12}?(\d+)/i.exec(lead)?.[1];
  if (revision) return `revision ${revision}`;
  return /\bStep 4c\b/.test(lead) ? 'plan' : null;
};

const kindOfPath = (path, root, sessionDir) => {
  if (sessionDir && path.startsWith(sessionDir)) return 'session';
  if (path.startsWith(join(root, '.claude'))) return 'kit';
  return path.startsWith(root) ? 'repo' : 'other';
};

const parse = (file) => {
  const records = [];
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    try {
      const record = JSON.parse(line);
      if (record.type === 'user' || record.type === 'assistant') records.push(record);
    } catch {
      // partial or blank line
    }
  }
  return records;
};

const metaOf = (transcript) => {
  try {
    return JSON.parse(readFileSync(transcript.replace(/\.jsonl$/, '.meta.json'), 'utf8'));
  } catch {
    return {};
  }
};

// the agent's last response reaches the transcript just after this hook fires, so a read at stop
// time misses its usage and understates peak context. a killed agent never writes one, so the wait is bounded.
const settle = async (transcript) => {
  const deadline = Date.now() + SETTLE_MS;
  for (;;) {
    const records = parse(transcript);
    const last = records.at(-1);
    const done = last?.type === 'assistant' && !last.message?.content?.some?.((part) => part?.type === 'tool_use');
    if (done || Date.now() >= deadline) return records;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
};

const build = (payload, root, records) => {
  const transcript = payload.agent_transcript_path;
  const meta = metaOf(transcript);
  const role = payload.agent_type ?? meta.agentType ?? null;
  const agent = payload.agent_id ?? null;
  const sessionsDir = join(root, 'team-session');
  const prompt = textOf(records.find((r) => r.type === 'user')?.message?.content);
  const session = payload.session ?? sessionOf(prompt, sessionsDir);
  const task = taskOf(meta.description, prompt);
  const sessionDir = session ? join(sessionsDir, session) : null;

  const docs = {};
  let planSha = null;
  for (const [kind, names] of Object.entries(DOCS)) {
    const file = sessionDir && names.map((name) => join(sessionDir, name)).find((path) => existsSync(path));
    if (!file) continue;
    const text = readFileSync(file, 'utf8');
    docs[kind] = { file, map: indexDoc(text) };
    if (kind === 'plan') planSha = createHash('sha256').update(text).digest('hex').slice(0, 12);
  }

  const usage = new Map();
  const uses = new Map();
  const seen = Object.fromEntries(Object.keys(docs).map((kind) => [kind, new Set()]));
  const chars = {};
  const add = (kind, n) => {
    if (n > 0) chars[kind] = (chars[kind] ?? 0) + n;
  };
  const toolRows = [];
  let firstCtx = 0;
  let peakCtx = 0;
  let model = null;

  for (const record of records) {
    const message = record.message ?? {};
    if (record.type === 'assistant') {
      // one api response spans several transcript lines that repeat its usage
      if (message.usage) usage.set(message.id ?? record.uuid, message.usage);
      if (message.model) model = message.model;
    }
    if (!Array.isArray(message.content)) continue;
    for (const part of message.content) {
      if (part?.type === 'tool_use') uses.set(part.id, part);
      if (part?.type !== 'tool_result') continue;
      const use = uses.get(part.tool_use_id);
      if (!use) continue;
      const input = use.input ?? {};
      const text = textOf(part.content);
      const hits = {};
      const path = typeof input.file_path === 'string' ? input.file_path : null;
      let rest = text.length;
      if (use.name === 'Read' && path) {
        const kind = Object.keys(docs).find((k) => docs[k].file === path);
        if (kind) {
          hits[kind] = numberedLines(text);
          add(kind, text.length);
        } else {
          add(kindOfPath(path, root, sessionDir), text.length);
        }
        rest = 0;
      } else if (use.name === 'Edit' || use.name === 'Write') {
        add('edit', text.length);
        rest = 0;
      } else {
        for (const [kind, doc] of Object.entries(docs)) {
          const match = matchText(text, doc.map);
          if (match.seen.size === 0) continue;
          hits[kind] = match.seen;
          add(kind, match.chars);
          rest -= match.chars;
        }
        add(use.name === 'Bash' ? 'bash' : 'other', rest);
      }
      const rowSeen = {};
      for (const [kind, lines] of Object.entries(hits)) {
        for (const n of lines) seen[kind].add(n);
        if (lines.size > 0) rowSeen[kind] = ranges(lines);
      }
      if (!session || OBSERVERS.test(String(role))) continue;
      const target = path
        ? relative(root, path)
        : typeof input.command === 'string'
          ? scrub(input.command, root, sessionDir)
          : null;
      toolRows.push({
        type: 'tool',
        ts: record.timestamp ?? null,
        session,
        agent,
        role,
        task,
        seq: toolRows.length + 1,
        tool: use.name,
        target,
        chars: text.length,
        ...(Object.keys(rowSeen).length ? { seen: rowSeen } : {}),
      });
    }
  }

  let input = 0;
  let cacheWrite = 0;
  let cacheRead = 0;
  let output = 0;
  for (const u of usage.values()) {
    const a = u.input_tokens ?? 0;
    const b = u.cache_creation_input_tokens ?? 0;
    const c = u.cache_read_input_tokens ?? 0;
    input += a;
    cacheWrite += b;
    cacheRead += c;
    output += u.output_tokens ?? 0;
    const ctx = a + b + c;
    if (!firstCtx) firstCtx = ctx;
    peakCtx = Math.max(peakCtx, ctx);
  }

  const agentRow = {
    type: 'agent',
    ts: new Date().toISOString(),
    session,
    agent,
    role,
    task,
    desc: meta.description ?? null,
    phase: phaseOf(prompt, role),
    model,
    turns: usage.size,
    tools: uses.size,
    first_ctx: firstCtx,
    peak_ctx: peakCtx,
    input,
    cache_write: cacheWrite,
    cache_read: cacheRead,
    output,
    chars,
    seen: Object.fromEntries(
      Object.entries(seen)
        .filter(([, lines]) => lines.size > 0)
        .map(([kind, lines]) => [kind, ranges(lines)]),
    ),
    plan_sha: planSha,
  };
  return [...toolRows, agentRow];
};

const record = async (payload) => {
  if (!payload.agent_transcript_path) return;
  const root = process.env.CLAUDE_PROJECT_DIR || payload.cwd || process.cwd();
  if (!existsSync(join(root, 'team-session'))) return;
  const rows = build(payload, root, await settle(payload.agent_transcript_path));
  const dir = join(root, 'team-session', '_observability');
  mkdirSync(dir, { recursive: true });
  // one write, so parallel agents stopping together cannot interleave rows
  appendFileSync(join(dir, 'plan-usage.ndjson'), rows.map((row) => JSON.stringify(row)).join('\n') + '\n');
};

const main = async () => {
  if (process.argv[2] === WORKER) return record(JSON.parse(process.argv[3]));
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const { agent_transcript_path, agent_id, agent_type, session, cwd } = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  // hands off and returns at once, so the agent's stop never waits on the settle window
  const fields = JSON.stringify({ agent_transcript_path, agent_id, agent_type, session, cwd });
  spawn(process.execPath, [fileURLToPath(import.meta.url), WORKER, fields], { detached: true, stdio: 'ignore' }).unref();
};

main()
  .catch(() => {})
  .finally(() => process.exit(0));
