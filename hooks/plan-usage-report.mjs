#!/usr/bin/env node
// summarizes team-session/_observability/plan-usage.ndjson (written by record-plan-usage.mjs), so
// nobody has to read the raw log into a context.
// node plan-usage-report.mjs              all efforts: largest by tokens, then every role
// node plan-usage-report.mjs <session>    one effort: roles, plan coverage, unread tasks, largest results

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const sessionsDir = join(root, 'team-session');
const logFile = join(sessionsDir, '_observability', 'plan-usage.ndjson');
const wanted = process.argv[2] ?? null;

if (!existsSync(logFile)) {
  console.log(`no log yet: ${logFile}`);
  process.exit(0);
}

const agents = new Map();
const tools = new Map();
for (const line of readFileSync(logFile, 'utf8').split('\n')) {
  let row;
  try {
    row = JSON.parse(line);
  } catch {
    continue;
  }
  if (wanted && row.session !== wanted) continue;
  // last row wins: a resumed or blocked agent logs again at each stop
  if (row.type === 'agent') agents.set(row.agent, row);
  if (row.type === 'tool') tools.set(`${row.agent}:${row.seq}`, row);
}

const median = (values) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};
const short = (n) => {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  return n >= 1e3 ? `${Math.round(n / 1e3)}k` : `${n}`;
};
const expand = (spec = '') => {
  const lines = [];
  for (const part of spec.split(',').filter(Boolean)) {
    const [a, b = a] = part.split('-').map(Number);
    for (let n = a; n <= b; n += 1) lines.push(n);
  }
  return lines;
};
const groupBy = (rows, key) => {
  const groups = new Map();
  for (const row of rows) {
    const k = key(row) ?? '(none)';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(row);
  }
  return groups;
};
const sum = (rows, field) => rows.reduce((total, row) => total + (row[field] ?? 0), 0);

const rows = [...agents.values()];
const roles = [...groupBy(rows, (row) => row.role).entries()].sort(
  (a, b) => sum(b[1], 'cache_read') - sum(a[1], 'cache_read'),
);

if (!wanted) {
  console.log(`plan usage: ${rows.length} agents`);
  console.log('largest efforts (agents, cached input, output):');
  const efforts = [...groupBy(rows, (row) => row.session).entries()]
    .sort((a, b) => sum(b[1], 'cache_read') - sum(a[1], 'cache_read'))
    .slice(0, 10);
  for (const [session, group] of efforts) {
    console.log(`  ${session}: ${group.length}, ${short(sum(group, 'cache_read'))}, ${short(sum(group, 'output'))}`);
  }
}

const planFile = wanted ? ['team-plan.md', 'fix-plan.md'].map((name) => join(sessionsDir, wanted, name)).find((path) => existsSync(path)) : null;
const planLines = planFile && existsSync(planFile) ? readFileSync(planFile, 'utf8').trimEnd().split('\n') : null;
// create-stage agents read the whole plan by design, which would hide what a run uses
const RUN_ROLES = /(^|:)team-(coder|tester|verifier|measurer|spec-reviewer|reviewer|finisher|security-auditor)$/;

if (wanted) {
  const shas = new Set(rows.map((row) => row.plan_sha).filter(Boolean));
  console.log(`plan usage ${wanted}: ${rows.length} agents, ${shas.size} plan version(s)`);
}
console.log('role: agents, median peak context, cached input, output, median plan lines seen');
for (const [role, group] of roles) {
  const seenShare = planLines
    ? `, ${median(group.map((row) => (expand(row.seen?.plan).length / planLines.length) * 100)).toFixed(1)}%`
    : '';
  console.log(
    `  ${role}: ${group.length}, ${short(median(group.map((row) => row.peak_ctx)))}, ${short(sum(group, 'cache_read'))}, ${short(sum(group, 'output'))}${seenShare}`,
  );
}

if (wanted) {
  // rows logged before the hook read the dispatch header fall back to the lead's description
  const AUDITOR_STEPS = [
    [/^revise contract|\bdefine\b/i, 'define'],
    [/\bSAT\b/, 'sat'],
    [/grade/i, 'grade'],
    [/audit/i, 'audit'],
    [/approach/i, 'approach'],
    [/contract/i, 'define'],
  ];
  const ROLE_STEPS = { 'team-design-critic': 'design-critique', 'team-plan-reviewer': 'plan-review' };
  const stepOf = (row) => {
    const role = String(row.role).replace(/^.*:/, '');
    const desc = row.desc ?? '';
    const step =
      row.phase ??
      (role === 'team-planner' ? (/revision/i.test(desc) ? 'revision' : 'plan') : null) ??
      (role === 'team-goal-auditor' ? AUDITOR_STEPS.find(([pattern]) => pattern.test(desc))?.[1] : null) ??
      ROLE_STEPS[role] ??
      role.replace(/^team-/, '');
    return step.split(' ')[0];
  };
  const CREATE_ROLES = /(^|:)team-(designer|researcher|planner|goal-auditor|design-critic|plan-reviewer)$/;
  const RUN_STEPS = new Set(['grade', 'persona', 'triage']);
  const create = rows
    // a planner prompt that names one task id gets tagged with it; the planner is create work regardless
    .filter((row) => CREATE_ROLES.test(String(row.role)) && (!row.task || /team-planner$/.test(String(row.role))))
    .map((row) => ({ ...row, step: stepOf(row) }))
    .filter((row) => !RUN_STEPS.has(row.step));
  if (create.length) {
    console.log('create steps: agents, cached input');
    const steps = [...groupBy(create, (row) => row.step).entries()].sort(
      (a, b) => sum(b[1], 'cache_read') - sum(a[1], 'cache_read'),
    );
    for (const [step, group] of steps) console.log(`  ${step}: ${group.length}, ${short(sum(group, 'cache_read'))}`);
    // the loop cost: everything that finished after the first plan did
    const firstPlan = create.filter((row) => row.step === 'plan').sort((a, b) => a.ts.localeCompare(b.ts))[0];
    if (firstPlan) {
      const total = sum(create, 'cache_read');
      const after = sum(
        create.filter((row) => row.ts > firstPlan.ts),
        'cache_read',
      );
      const share = total ? Math.round((after / total) * 100) : 0;
      console.log(`create after the first plan: ${short(after)} of ${short(total)} (${share}%)`);
    }
    // what one more round costs, for the Loop budgets card: the latest plan revision and every create pass after it
    const planners = create.filter((row) => row.step === 'plan' || row.step === 'revision').sort((a, b) => a.ts.localeCompare(b.ts));
    const latest = planners.at(-1);
    if (planners.length > 1) {
      const round = create.filter((row) => row.ts >= latest.ts);
      console.log(`last round (from ${latest.phase ?? latest.step}): ${round.length} agents, ${short(sum(round, 'cache_read'))}`);
    }
  }
}

const kinds = {};
for (const row of rows) for (const [kind, n] of Object.entries(row.chars ?? {})) kinds[kind] = (kinds[kind] ?? 0) + n;
const totalChars = Object.values(kinds).reduce((a, b) => a + b, 0);
if (totalChars) {
  const shares = Object.entries(kinds)
    .sort((a, b) => b[1] - a[1])
    .map(([kind, n]) => `${kind} ${Math.round((n / totalChars) * 100)}%`);
  console.log(`tool output by source: ${shares.join(', ')}`);
}

// rows logged before the hook dropped command setup head as `cd`
const SUBCOMMAND = new Set(['git', 'gh', 'pnpm', 'npx', 'kubectl', 'pulumi', 'uv', 'docker']);
const SCRIPT = new Set(['node', 'python3', 'python', 'tsx', 'bash', 'sh']);
const headOf = (target) => {
  const [first = '-', ...rest] = target.split(/;|&&|\|/)[0].trim().split(/\s+/);
  if (!SUBCOMMAND.has(first) && !SCRIPT.has(first)) return first;
  for (let i = 0; i < rest.length; i += 1) {
    if (/^-[ec]$/.test(rest[i])) return `${first} ${rest[i]}`;
    if (/^(-F|--filter|-C|--dir)$/.test(rest[i])) i += 1;
    else if (!rest[i].startsWith('-')) return `${first} ${SCRIPT.has(first) ? rest[i].split('/').at(-1) : rest[i]}`;
  }
  return first;
};
const shell = new Map();
for (const row of tools.values()) {
  if (row.tool !== 'Bash') continue;
  const head = headOf(row.target ?? '');
  shell.set(head, (shell.get(head) ?? 0) + row.chars);
}
const shellTotal = [...shell.values()].reduce((a, b) => a + b, 0);
if (shellTotal) {
  const shares = [...shell.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([head, n]) => `${head} ${Math.round((n / shellTotal) * 100)}%`);
  console.log(`shell results by command: ${shares.join(', ')}`);
}

if (planLines) {
  // lines count from the current plan: an earlier revision's reads can land a few lines off
  const readers = new Map();
  for (const row of rows.filter((r) => RUN_ROLES.test(String(r.role)))) {
    for (const n of expand(row.seen?.plan)) {
      if (n <= planLines.length) readers.set(n, (readers.get(n) ?? 0) + 1);
    }
  }
  const heads = [];
  planLines.forEach((line, i) => {
    if (/^(## |### T-)/.test(line)) heads.push({ name: line.replace(/\s+\(.*$/, ''), start: i + 1 });
  });
  const sections = heads.map((head, i) => {
    const end = heads[i + 1]?.start ?? planLines.length + 1;
    const counts = [];
    for (let n = head.start; n < end; n += 1) counts.push(readers.get(n) ?? 0);
    return { name: head.name, total: end - head.start, read: counts.filter(Boolean).length, top: Math.max(0, ...counts) };
  });
  const tasks = sections.filter((s) => s.name.startsWith('### '));
  console.log(`plan lines seen by run agents: ${readers.size} of ${planLines.length}`);
  console.log('plan sections, run agents (lines seen/total, most readers):');
  for (const s of sections.filter((x) => x.name.startsWith('## '))) {
    console.log(`  ${s.name.slice(3)}: ${s.read}/${s.total}, ${s.top}`);
  }
  const unread = tasks.filter((s) => s.top === 0).map((s) => s.name.slice(4).split(' ')[0]);
  console.log(`tasks never read: ${unread.length ? unread.join(' ') : 'none'} (of ${tasks.length})`);
}

const largest = [...tools.values()].sort((a, b) => b.chars - a.chars).slice(0, 5);
if (largest.length) {
  console.log('largest tool results (chars, role, tool, target):');
  for (const row of largest) {
    console.log(`  ${short(row.chars)}, ${row.role}, ${row.tool}, ${row.target ?? '-'}`);
  }
}
