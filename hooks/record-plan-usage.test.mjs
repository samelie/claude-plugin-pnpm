import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const hook = join(here, 'record-plan-usage.mjs');
const report = join(here, 'plan-usage-report.mjs');
const SESSION = '20261104-fixture';
const planLine = (n) => `the plan's own sentence number ${n} is long enough to fingerprint`;
const PLAN = [
  '---',
  'name: fixture',
  '---',
  '## Shared Rules',
  planLine(5),
  '## Tasks',
  '### T-1 first-task',
  planLine(8),
  'short line',
  '### T-2 second-task',
  planLine(11),
  planLine(12),
  '### T-3 unread-task',
  planLine(14),
].join('\n');

const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), 'plan-usage-'));
  const dir = join(root, 'team-session', SESSION);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'team-plan.md'), PLAN);
  return { root, planFile: join(dir, 'team-plan.md') };
};

const numbered = (from, to) =>
  PLAN.split('\n')
    .slice(from - 1, to)
    .map((line, i) => `${String(from + i).padStart(6)}\t${line}`)
    .join('\n');

const lines = {
  prompt: (text) => ({ type: 'user', message: { content: text } }),
  usage: (id, usage, content = []) => ({ type: 'assistant', uuid: id, message: { id, model: 'claude-test', usage, content } }),
  use: (id, name, input) => ({ type: 'tool_use', id, name, input }),
  result: (id, content) => ({
    type: 'user',
    timestamp: '2026-11-04T00:00:00.000Z',
    message: { content: [{ type: 'tool_result', tool_use_id: id, content }] },
  }),
};

// runs the worker directly unless `hooked`, which takes the route a real stop takes
const run = (root, payload, { script = hook, args, meta, hooked = false } = {}) => {
  if (meta && payload.agent_transcript_path) {
    writeFileSync(payload.agent_transcript_path.replace(/\.jsonl$/, '.meta.json'), JSON.stringify(meta));
  }
  const direct = script === hook && !hooked;
  return spawnSync('node', [script, ...(direct ? ['--now', JSON.stringify(payload)] : (args ?? []))], {
    input: typeof payload === 'string' ? payload : JSON.stringify(payload),
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
    encoding: 'utf8',
  });
};

const FINAL = { type: 'assistant', message: { content: [{ type: 'text', text: 'done' }] } };

const transcriptAt = (root, records, name = 'agent-a.jsonl', { finished = true } = {}) => {
  const file = join(root, name);
  const all = finished ? [...records, FINAL] : records;
  writeFileSync(file, all.map((r) => JSON.stringify(r)).join('\n') + '\n');
  return file;
};

const logFile = (root) => join(root, 'team-session', '_observability', 'plan-usage.ndjson');

const waitForLog = async (root, ms = 6000) => {
  const deadline = Date.now() + ms;
  while (!existsSync(logFile(root)) && Date.now() < deadline) await delay(50);
  return existsSync(logFile(root));
};

const logged = (root) =>
  readFileSync(join(root, 'team-session', '_observability', 'plan-usage.ndjson'), 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));

const agentRow = (rows) => rows.filter((r) => r.type === 'agent').at(-1);
const prompt = `Task: T-1. Session path: team-session/${SESSION}/`;

test('counts each api response once and records context sizes', () => {
  const { root } = fixture();
  const a = { input_tokens: 10, cache_creation_input_tokens: 100, cache_read_input_tokens: 0, output_tokens: 5 };
  const b = { input_tokens: 1, cache_creation_input_tokens: 50, cache_read_input_tokens: 200, output_tokens: 7 };
  const file = transcriptAt(root, [lines.prompt(prompt), lines.usage('m1', a), lines.usage('m1', a), lines.usage('m2', b), lines.usage('m2', b)]);
  run(root, { agent_transcript_path: file, agent_id: 'a', agent_type: 'team-coder' });
  const row = agentRow(logged(root));
  assert.equal(row.turns, 2);
  assert.equal(row.cache_read, 200);
  assert.equal(row.cache_write, 150);
  assert.equal(row.output, 12);
  assert.equal(row.first_ctx, 110);
  assert.equal(row.peak_ctx, 251);
});

test('a Read of the plan records exact lines, short lines included', () => {
  const { root, planFile } = fixture();
  const file = transcriptAt(root, [
    lines.prompt(prompt),
    lines.usage('m1', { output_tokens: 1 }, [lines.use('r1', 'Read', { file_path: planFile, offset: 7, limit: 3 })]),
    lines.result('r1', numbered(7, 9)),
  ]);
  run(root, { agent_transcript_path: file, agent_id: 'a', agent_type: 'team-coder' });
  const rows = logged(root);
  const tool = rows.find((r) => r.type === 'tool');
  assert.deepEqual(tool.seen, { plan: '7-9' });
  assert.equal(tool.target, `team-session/${SESSION}/team-plan.md`);
  assert.equal(agentRow(rows).seen.plan, '7-9');
  assert.ok(agentRow(rows).plan_sha);
});

test("a direct run's fix-plan.md is the plan when no team-plan.md exists", () => {
  const { root, planFile } = fixture();
  renameSync(planFile, planFile.replace('team-plan.md', 'fix-plan.md'));
  const output = `${planLine(11)}\n${planLine(12)}`;
  const file = transcriptAt(root, [
    lines.prompt(prompt),
    lines.usage('m1', { output_tokens: 1 }, [lines.use('b1', 'Bash', { command: 'sed -n 11,12p $S/fix-plan.md' })]),
    lines.result('b1', [{ type: 'text', text: output }]),
  ]);
  run(root, { agent_transcript_path: file, agent_id: 'a', agent_type: 'team-coder' });
  const row = agentRow(logged(root));
  assert.equal(row.seen.plan, '11-12');
  assert.ok(row.plan_sha);
});

test('a shell read with no literal path is found from the text it returned', () => {
  const { root } = fixture();
  const output = `$S/team-plan.md\n${planLine(11)}\n12:${planLine(12)}\nunrelated output line that is long enough to index`;
  const file = transcriptAt(root, [
    lines.prompt(prompt),
    lines.usage('m1', { output_tokens: 1 }, [lines.use('b1', 'Bash', { command: 'sed -n 11,12p $S/team-plan.md' })]),
    lines.result('b1', [{ type: 'text', text: output }]),
  ]);
  run(root, { agent_transcript_path: file, agent_id: 'a', agent_type: 'team-coder' });
  const rows = logged(root);
  assert.deepEqual(rows.find((r) => r.type === 'tool').seen, { plan: '11-12' });
  const { chars } = agentRow(rows);
  assert.ok(chars.plan > 0);
  assert.ok(chars.bash > 0);
  assert.equal(chars.plan + chars.bash, output.length);
});

test('the log holds no prompt or file text, and commands lose their values', () => {
  const { root, planFile } = fixture();
  const secret = 'abcDEF123456789012345678901234567890';
  const file = transcriptAt(root, [
    lines.prompt(`${prompt} PROMPT-SENTINEL`),
    lines.usage('m1', { output_tokens: 1 }, [
      lines.use('r1', 'Read', { file_path: planFile }),
      lines.use('b1', 'Bash', { command: `TOKEN=hunter2 curl -H "Bearer ${secret}" https://x.test` }),
    ]),
    lines.result('r1', numbered(1, 14)),
    lines.result('b1', 'RESULT-SENTINEL output'),
  ]);
  run(root, { agent_transcript_path: file, agent_id: 'a', agent_type: 'team-coder' });
  const raw = readFileSync(join(root, 'team-session', '_observability', 'plan-usage.ndjson'), 'utf8');
  for (const absent of ['PROMPT-SENTINEL', 'RESULT-SENTINEL', "plan's own sentence", 'hunter2', secret]) {
    assert.ok(!raw.includes(absent), `log leaked ${absent}`);
  }
});

test('a command logs what it ran, not its setup or heredoc body, and the report groups it', () => {
  const { root } = fixture();
  const dir = join(root, 'team-session', SESSION);
  const commands = {
    b1: `cd ${dir} && S=${dir}; sed -n 1,5p $S/team-plan.md`,
    b2: `cat > /tmp/x.mjs <<'EOF'\nconst body = 'BODY-SENTINEL';\nEOF\nnode /tmp/x.mjs`,
    b3: `rg -n foo ${dir}/design.md`,
    b4: 'cd somewhere',
    b5: `cd ${root} && ${'echo long '.repeat(40)}`,
    b6: 'pnpm -F "@x/y" test',
    b7: `sed -i '' 's/^- old sentence/new FILE-SENTINEL text/' "$S/notes.md"`,
  };
  const ids = Object.keys(commands);
  const file = transcriptAt(root, [
    lines.prompt(prompt),
    lines.usage('m1', { output_tokens: 1 }, ids.map((id) => lines.use(id, 'Bash', { command: commands[id] }))),
    ...ids.map((id) => lines.result(id, id === 'b6' ? 'xxxxxx' : 'x')),
  ]);
  run(root, { agent_transcript_path: file, agent_id: 'a', agent_type: 'team-coder' });
  const rows = logged(root);
  const targets = rows.filter((r) => r.type === 'tool').map((r) => r.target);
  assert.deepEqual(targets.slice(0, 4), [
    'sed -n 1,5p $S/team-plan.md',
    'cat > /tmp/x.mjs <<EOF; node /tmp/x.mjs',
    'rg -n foo $S/design.md',
    'cd somewhere',
  ]);
  assert.ok(targets[4].startsWith('echo long'));
  assert.ok(targets[4].length <= 120);
  assert.equal(targets[6], `sed -i '' '…' "$S/notes.md"`);
  for (const absent of ['BODY-SENTINEL', 'FILE-SENTINEL']) assert.ok(!JSON.stringify(rows).includes(absent), `log leaked ${absent}`);
  const out = run(root, '', { script: report, args: [SESSION] }).stdout;
  assert.match(out, /shell results by command: pnpm test 50%, sed 17%, cat 8%, rg 8%, cd 8%, echo 8%/);
});

test('prints nothing and exits 0 on every input, so it costs no tokens and blocks nothing', () => {
  const { root } = fixture();
  const file = transcriptAt(root, [lines.prompt(prompt), lines.usage('m1', { output_tokens: 1 })]);
  const cases = [
    'not json',
    {},
    { agent_transcript_path: join(root, 'missing.jsonl') },
    { agent_transcript_path: file, agent_id: 'a', agent_type: 'team-coder' },
  ];
  for (const payload of cases) {
    for (const hooked of [true, false]) {
      if (!hooked && typeof payload === 'string') continue;
      const result = run(root, payload, { hooked });
      assert.equal(result.status, 0);
      assert.equal(result.stdout, '');
      assert.equal(result.stderr, '');
    }
  }
});

test('a real stop returns at once, and the row still arrives', async () => {
  const { root } = fixture();
  const usage = { cache_read_input_tokens: 500, output_tokens: 5 };
  const file = transcriptAt(root, [lines.prompt(prompt), lines.usage('m1', usage)]);
  const started = Date.now();
  const result = run(root, { agent_transcript_path: file, agent_id: 'a', agent_type: 'team-coder', last_assistant_message: 'x'.repeat(50000) }, { hooked: true });
  assert.equal(result.status, 0);
  assert.ok(Date.now() - started < 2000);
  assert.ok(await waitForLog(root));
  assert.equal(agentRow(logged(root)).cache_read, 500);
});

test('waits for a last response written after the stop', async () => {
  const { root } = fixture();
  const first = { input_tokens: 1, cache_creation_input_tokens: 100, output_tokens: 5 };
  const last = { input_tokens: 1, cache_read_input_tokens: 100, cache_creation_input_tokens: 40, output_tokens: 9 };
  const file = transcriptAt(
    root,
    [
      lines.prompt(prompt),
      lines.usage('m1', first, [lines.use('b1', 'Bash', { command: 'ls' })]),
      lines.result('b1', 'x'),
    ],
    'agent-a.jsonl',
    { finished: false },
  );
  run(root, { agent_transcript_path: file, agent_id: 'a', agent_type: 'team-coder' }, { hooked: true });
  await delay(400);
  assert.ok(!existsSync(logFile(root)), 'wrote before the last response arrived');
  appendFileSync(file, `${JSON.stringify(lines.usage('m2', last, [{ type: 'text', text: 'done' }]))}\n`);
  assert.ok(await waitForLog(root));
  const row = agentRow(logged(root));
  assert.equal(row.turns, 2);
  assert.equal(row.peak_ctx, 141);
  assert.equal(row.cache_read, 100);
});

test('an agent killed mid-tool still logs once the wait runs out', () => {
  const { root } = fixture();
  const file = transcriptAt(
    root,
    [lines.prompt(prompt), lines.usage('m1', { output_tokens: 1 }, [lines.use('b1', 'Bash', { command: 'ls' })])],
    'agent-a.jsonl',
    { finished: false },
  );
  const started = Date.now();
  run(root, { agent_transcript_path: file, agent_id: 'a', agent_type: 'team-coder' });
  assert.ok(Date.now() - started < 4500);
  assert.equal(agentRow(logged(root)).turns, 1);
});

test('does nothing without a team-session directory', () => {
  const root = mkdtempSync(join(tmpdir(), 'plan-usage-none-'));
  const file = transcriptAt(root, [lines.prompt(prompt)]);
  const result = run(root, { agent_transcript_path: file, agent_id: 'a' });
  assert.equal(result.status, 0);
  assert.throws(() => logged(root));
});

test('an agent outside any session logs its agent row only', () => {
  const { root } = fixture();
  const file = transcriptAt(root, [
    lines.prompt('no session named here'),
    lines.usage('m1', { output_tokens: 1 }, [lines.use('b1', 'Bash', { command: 'ls' })]),
    lines.result('b1', 'x'),
  ]);
  run(root, { agent_transcript_path: file, agent_id: 'a', agent_type: 'general-purpose' });
  const rows = logged(root);
  assert.deepEqual(rows.map((r) => r.type), ['agent']);
  assert.equal(rows[0].session, null);
});

test('observers log the agent row only, because they stop dozens of times', () => {
  const { root } = fixture();
  const file = transcriptAt(root, [
    lines.prompt(prompt),
    lines.usage('m1', { output_tokens: 1 }, [lines.use('b1', 'Bash', { command: 'ls' })]),
    lines.result('b1', 'x'),
  ]);
  run(root, { agent_transcript_path: file, agent_id: 'a', agent_type: 'claude-plugin-pnpm:coder-guard' });
  assert.deepEqual(logged(root).map((r) => r.type), ['agent']);
});

test('the task comes from the description, else from a lone id in the prompt', () => {
  const { root } = fixture();
  const file = transcriptAt(root, [lines.prompt(`team-session/${SESSION}/ see T-4 and T-5`)]);
  run(root, { agent_transcript_path: file, agent_id: 'a', agent_type: 'team-coder' }, { meta: { description: 'coder T-9 scaffold' } });
  assert.equal(agentRow(logged(root)).task, 'T-9');
  const none = transcriptAt(root, [lines.prompt(`team-session/${SESSION}/ see T-4 and T-5`)], 'agent-b.jsonl');
  run(root, { agent_transcript_path: none, agent_id: 'b', agent_type: 'team-coder' });
  assert.equal(agentRow(logged(root)).task, null);
  const lone = transcriptAt(root, [lines.prompt(prompt)], 'agent-c.jsonl');
  run(root, { agent_transcript_path: lone, agent_id: 'c', agent_type: 'team-coder' });
  assert.equal(agentRow(logged(root)).task, 'T-1');
});

test('a create agent logs its step from the dispatch header, and the report prices each step', () => {
  const { root } = fixture();
  const at = `Session path: team-session/${SESSION}/`;
  const dispatches = [
    ['d', 'team-designer', `Phase: discovery\n${at}`, 1000, 'discovery'],
    ['p', 'team-planner', `Step 4c planner dispatch.\n${at}`, 1000, 'plan'],
    ['s', 'team-goal-auditor', `Fresh-check: sat\nPhase: sat\n${at}`, 3000, 'sat'],
    ['r', 'team-planner', `Plan revision 2 of 3, fired by SAT.\n${at}`, 2000, 'revision 2'],
    ['f', 'team-goal-auditor', `Phase: define (revision paired with plan revision 2)\n${at}`, 1000, 'define'],
    ['c', 'team-coder', `Task: T-1. ${at}`, 500, null],
  ];
  for (const [id, role, text, cached, phase] of dispatches) {
    const file = transcriptAt(root, [lines.prompt(text), lines.usage(`m-${id}`, { cache_read_input_tokens: cached })], `agent-${id}.jsonl`);
    run(root, { agent_transcript_path: file, agent_id: id, agent_type: role });
    assert.equal(agentRow(logged(root)).phase, phase, role);
  }
  // a row logged before the hook read the header carries the lead's description only
  const old = { type: 'agent', ts: '2999-01-01T00:00:00.000Z', session: SESSION, agent: 'o', role: 'team-goal-auditor', task: null, desc: 'SAT attempt 3 on revision 3', cache_read: 1000 };
  appendFileSync(logFile(root), `${JSON.stringify(old)}\n`);
  const out = run(root, '', { script: report, args: [SESSION] }).stdout;
  assert.match(out, /create steps: agents, cached input\n {2}sat: 2, 4k\n {2}revision: 1, 2k\n/);
  assert.doesNotMatch(out, /coder: 1, 500\n/);
  assert.match(out, /create after the first plan: 7k of 9k \(78%\)/);
  assert.match(out, /last round \(from revision 2\): 3 agents, 4k/);
});

test('a hand-piped payload names the session for the lead', () => {
  const { root } = fixture();
  const file = transcriptAt(root, [lines.prompt('nothing here names it')]);
  run(root, { agent_transcript_path: file, agent_id: 'lead', agent_type: 'lead', session: SESSION });
  assert.equal(agentRow(logged(root)).session, SESSION);
});

test('the report counts a twice-stopped agent once and stays small', () => {
  const { root, planFile } = fixture();
  const usage = { cache_read_input_tokens: 1000, output_tokens: 10 };
  const file = transcriptAt(root, [
    lines.prompt(prompt),
    lines.usage('m1', usage, [lines.use('r1', 'Read', { file_path: planFile, offset: 7, limit: 3 })]),
    lines.result('r1', numbered(7, 9)),
  ]);
  const payload = { agent_transcript_path: file, agent_id: 'a', agent_type: 'team-coder' };
  run(root, payload);
  run(root, payload);
  assert.equal(logged(root).filter((r) => r.type === 'tool').length, 2);
  const out = run(root, '', { script: report, args: [SESSION] }).stdout;
  assert.match(out, /1 agents, 1 plan version/);
  assert.match(out, /team-coder: 1, 1k, 1k, 10/);
  assert.match(out, /tasks never read: T-2 T-3 \(of 3\)/);
  assert.match(out, /plan lines seen by run agents: 3 of 14/);
  assert.ok(out.length < 2000, `report is ${out.length} chars`);
  const all = run(root, '', { script: report }).stdout;
  assert.match(all, /largest efforts/);
  assert.match(all, new RegExp(`${SESSION}: 1, 1k, 10`));
});

test('plan coverage counts run agents, not create-stage readers of the whole plan', () => {
  const { root, planFile } = fixture();
  const file = transcriptAt(root, [
    lines.prompt(prompt),
    lines.usage('m1', { output_tokens: 1 }, [lines.use('r1', 'Read', { file_path: planFile })]),
    lines.result('r1', numbered(1, 14)),
  ]);
  run(root, { agent_transcript_path: file, agent_id: 'a', agent_type: 'team-plan-reviewer' });
  const out = run(root, '', { script: report, args: [SESSION] }).stdout;
  assert.match(out, /team-plan-reviewer: 1, 0, 0, 1, 100\.0%/);
  assert.match(out, /plan lines seen by run agents: 0 of 14/);
  assert.match(out, /tasks never read: T-1 T-2 T-3 \(of 3\)/);
});

test('the report says so when no log exists', () => {
  const root = mkdtempSync(join(tmpdir(), 'plan-usage-empty-'));
  const out = run(root, '', { script: report }).stdout;
  assert.match(out, /no log yet/);
});
