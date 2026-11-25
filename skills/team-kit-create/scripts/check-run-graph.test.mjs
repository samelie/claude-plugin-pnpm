import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { after } from 'node:test';
import * as check from './check-run-graph.mjs';
import { PARTIAL_LINE, USAGE, canonical, checkRunGraph, driftOf, expandBraces, findCycle, globsOverlap, mapsToOf, normalizerOf, parseArgs, resolveDep } from './check-run-graph.mjs';

// the exports gate-1 hardening adds, read off the namespace so this file still loads beside an older check
const { OLD_GRAPH_LINE, checkoutOf, columnOf } = check;
const script = fileURLToPath(new URL('./check-run-graph.mjs', import.meta.url));
const projector = fileURLToPath(new URL('./project-plan.mjs', import.meta.url));
const checkout = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../..');
// every fixture session sits under one temp checkout that has its own .claude/agents: no result depends on what
// stands above the machine's temp directory
const ROSTER = ['team-coder', 'team-tester', 'team-verifier', 'team-reviewer', 'team-spec-reviewer'];
const root = mkdtempSync(join(tmpdir(), 'check-run-graph-'));
after(() => rmSync(root, { recursive: true, force: true }));
mkdirSync(join(root, '.claude', 'agents'), { recursive: true });
mkdirSync(join(root, 'team-session'));
for (const name of ROSTER) writeFileSync(join(root, '.claude', 'agents', `${name}.md`), `# ${name}\n`);
const session = (files = {}) => {
  const dir = mkdtempSync(join(root, 'team-session', 'fx-'));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  return dir;
};
const cli = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });

const task = ({ id, phase = '1', agent = 'coder-a', agentType = 'team-coder', requirement = 'AC-1', blockedBy = 'none', files = '`src/a/**`', type = 'AFK' }) =>
  [
    `### ${id} slug`,
    '',
    '| Field | Value |',
    '|---|---|',
    `| **Phase** | ${phase} |`,
    `| **Agent** | ${agent} |`,
    `| **agent_type** | ${agentType} |`,
    `| **evidence_producer** | ${id} → \`<session>/${agent}/progress.md\` |`,
    `| **Requirement** | ${requirement} |`,
    `| **blockedBy** | ${blockedBy} |`,
    `| **files_owned** | ${files} |`,
    `| **verify** | \`true\` |`,
    `| **type** | ${type} |`,
    `| **Estimated** | 20 min |`,
    '',
    `Do ${id}.`,
    '',
  ].join('\n');
const plan = (tasks, tail = []) => ['# Team Plan', '', '## Tasks', '', ...tasks, ...tail].join('\n');
const dod = (rows) =>
  ['# DoD', '', '| id | statement | maps_to | kind | verify | blocking |', '|---|---|---|---|---|---|', ...rows.map(([id, mapsTo, blocking = 'true']) => `| ${id} | it holds | ${mapsTo} | deterministic | \`true\` | ${blocking} |`), ''].join('\n');

const CLEAN = [
  task({ id: 'T-1', files: '`src/a/**`' }),
  task({ id: 'T-2', agent: 'coder-b', files: '`src/b/**`', requirement: 'AC-2' }),
  task({ id: 'T-3', agent: 'tester', agentType: 'team-tester', blockedBy: 'T-1, T-2', files: '`src/a/test/**`' }),
  task({ id: 'T-4', phase: '2', agent: 'verifier', agentType: 'team-verifier', blockedBy: 'T-3, H-1', files: '`<session>/verifier/**`', requirement: 'AC-1, AC-2' }),
];
const HUMAN = ['## Human-gated checklist', '', '| Item | Ask |', '|---|---|', '| H-1 | go |', ''];
const DOD = dod([['AC-1 first-thing', 'T-1, T-3'], ['AC-2 second-thing', 'T-2'], ['AC-3 advisory', '—', 'false']]);
const fixture = (tasks = CLEAN, dodText = DOD, tail = HUMAN) => session({ 'team-plan.md': plan(tasks, tail), ...(dodText === null ? {} : { 'definition-of-done.md': dodText }) });
const fails = (result) => result.lines.filter((line) => line.startsWith('FAIL: '));
const isPartial = (result) => result.code === 0 && result.lines.at(-1) === PARTIAL_LINE && !result.lines.some((line) => line.startsWith('OK: '));

test('a clean plan passes with one OK line', () => {
  const result = checkRunGraph(fixture());
  assert.deepEqual(result.lines, ['OK: run graph — 4 tasks, 2 phases']);
  assert.equal(result.code, 0);
  const run = cli(fixture());
  assert.equal(run.status, 0);
  assert.match(run.stdout, /^OK: run graph/m);
});

// each defect is certain from the plan's text: exit 1
const DEFECTS = {
  'a task whose Requirement is TBD (#7)': [[task({ id: 'T-1', requirement: 'TBD' }), ...CLEAN.slice(1)], /no Requirement \(T-1\)/],
  'a blocking AC no task maps to': [CLEAN, /blocking AC\(s\) no task maps to \(AC-9\)/, dod([['AC-1 x', 'T-1'], ['AC-2 y', 'T-2'], ['AC-9 orphan', '—']])],
  'a dependency on an id the plan names nowhere else': [[...CLEAN, task({ id: 'T-5', agent: 'coder-c', files: '`src/c/**`', blockedBy: 'T-1x' })], /unknown id \(T-5 → T-1x\)/],
  'a dependency cycle': [[task({ id: 'T-1', blockedBy: 'T-3' }), ...CLEAN.slice(1)], /dependency cycle T-1 → T-3 → T-1/],
  'two parallel tasks of two owners owning an overlapping path': [[...CLEAN, task({ id: 'T-5', agent: 'coder-c', files: '`src/b/{x,y}.ts`' })], /T-2 \+ T-5: src\/b\/\*\* ~ src\/b\/x\.ts/],
  'a type cell with neither AFK nor HITL': [[...CLEAN.slice(0, 3), task({ id: 'T-4', phase: '2', agent: 'verifier', blockedBy: 'T-3', files: '`v/**`', type: 'see notes' })], /no AFK \/ HITL type \(T-4\)/],
};
for (const [name, [tasks, pattern, dodText = DOD]] of Object.entries(DEFECTS)) {
  test(`exit 1 on ${name}`, () => {
    const dir = fixture(tasks, dodText);
    const result = checkRunGraph(dir);
    assert.equal(result.code, 1, result.lines.join('\n'));
    assert.equal(fails(result).length, 1, result.lines.join('\n'));
    assert.match(fails(result)[0], pattern);
    assert.ok(!result.lines.some((line) => line.startsWith('OK: ')));
    assert.equal(cli(dir).status, 1);
  });
}

// what the parser cannot read with certainty: no FAIL, no OK, the partial line
const DOUBTS = {
  'an unprojected heading (#1)': [[CLEAN[0], '### T-2 listed\n\n- Phase: 1\n\n', ...CLEAN.slice(2)]],
  'a duplicate id (#2)': [[...CLEAN, task({ id: 'T-4', phase: '2', agent: 'verifier', blockedBy: 'T-3', files: '`w/**`' })]],
  'a blockedBy naming an id of no task family (#4)': [[...CLEAN, task({ id: 'T-5', agent: 'coder-c', files: '`src/c/**`', blockedBy: 'X-7' })]],
  'a blockedBy in lower case (#4)': [[...CLEAN, task({ id: 'T-5', agent: 'coder-c', files: '`src/c/**`', blockedBy: 't-9' })]],
  'a conditional cycle (#8)': [[task({ id: 'T-1', blockedBy: 'T-3 when ready' }), ...CLEAN.slice(1)]],
  'a cycle through an aside (#8)': [[task({ id: 'T-1', blockedBy: 'none' }), task({ id: 'T-2', agent: 'coder-b', files: '`src/b/**`', requirement: 'AC-2', blockedBy: 'T-1 (runs before T-3)' }), ...CLEAN.slice(2)]],
  'a Requirement holding only non-AC ids (#7)': [[...CLEAN.slice(0, 3), task({ id: 'T-4', phase: '2', agent: 'verifier', blockedBy: 'T-3', files: '`v/**`', requirement: 'FR-2' })]],
  'one owner\'s unordered tasks sharing a path': [[...CLEAN, task({ id: 'T-5', agent: 'coder-b', files: '`src/b/x.ts`' })]],
  'an unknown dep the plan declares in a table row (#3)': [[...CLEAN, task({ id: 'T-5', agent: 'coder-c', files: '`src/c/**`', blockedBy: 'T-1b' }), '| Step | What |\n|---|---|\n| T-1b | substep of T-1 |\n']],
  'an unknown dep named as a step inside the task it extends (#3)': [[task({ id: 'T-1' }).replace('Do T-1.', 'Do T-1a, then T-1b.'), ...CLEAN.slice(1), task({ id: 'T-5', agent: 'coder-c', files: '`src/c/**`', blockedBy: 'T-1b' })]],
  'a cycle through a task whose deps are doubted (#6)': [[task({ id: 'T-1', blockedBy: 'T-3; re-run after T-2' }), ...CLEAN.slice(1)]],
  'a type cell naming both AFK and HITL (#7)': [[...CLEAN.slice(0, 3), task({ id: 'T-4', phase: '2', agent: 'verifier', blockedBy: 'T-3', files: '`v/**`', type: 'AFK (HITL for the push)' })]],
  'a Requirement naming an AC the DoD does not list (#8)': [[...CLEAN.slice(0, 3), task({ id: 'T-4', phase: '2', agent: 'verifier', blockedBy: 'T-3', files: '`v/**`', requirement: 'AC-1, AC-77' })]],
  'a task block cut through a code fence (#1)': [[...CLEAN, '### T-5 fenced\n\n| Field | Value |\n|---|---|\n| **Phase** | 9 |\n| **Agent** | ops |\n| **Requirement** | AC-1 |\n| **blockedBy** | none |\n| **type** | AFK |\n\n~~~sh\nrun it\n']],
  'an AC whose maps_to is prose (#9)': [CLEAN, dod([['AC-1 x', 'T-1'], ['AC-2 y', 'T-2'], ['AC-7 z', 'the inventory row']])],
  'an owned-path cell in prose (#8)': [[...CLEAN.slice(0, 3), task({ id: 'T-4', phase: '2', agent: 'verifier', blockedBy: 'T-3', files: 'the verifier folder' })]],
  'no definition-of-done.md': [CLEAN, null],
};
for (const [name, [tasks, dodText = DOD]] of Object.entries(DOUBTS)) {
  test(`partial, exit 0, no OK on ${name}`, () => {
    const dir = fixture(tasks, dodText);
    const result = checkRunGraph(dir);
    assert.deepEqual(fails(result), [], result.lines.join('\n'));
    assert.ok(isPartial(result), result.lines.join('\n'));
    assert.equal(cli(dir).status, 0);
  });
}

test('create-lane and grade-seal-gate ACs are no orphans (#9)', () => {
  const result = checkRunGraph(fixture(CLEAN, dod([['AC-1 x', 'T-1'], ['AC-2 y', 'T-2'], ['AC-8 review-seal', 'create lane — no run task'], ['AC-9 grade-seal-gate', '—']])));
  assert.deepEqual(result.lines, ['OK: run graph — 4 tasks, 2 phases']);
});

test('paths and phases are normalised before the overlap test (#10)', () => {
  const pair = (a, b, phases = ['1', '1']) => [task({ id: 'T-1', files: a, phase: phases[0] }), task({ id: 'T-2', agent: 'coder-b', requirement: 'AC-2', files: b, phase: phases[1] })];
  const cases = [
    [`\`${root}/pkg/a.ts\``, '`pkg/a.ts`'],
    ['`<session>/out/**`', '`$ABS_SESSION/out/x.md`'],
    ['`./src/a.ts`', '`src/a.ts`'],
    ['`src/A/x.ts`', '`src/a/x.ts`'],
    ['`src/a/`', '`src/a/x.ts`'],
    ['`src/a.ts`', '`src/a.ts`', ['Phase 1', '1']],
  ];
  for (const [a, b, phases] of cases) {
    const result = checkRunGraph(fixture(pair(a, b, phases), DOD, []));
    assert.equal(result.code, 1, `${a} ${b}: ${result.lines.join(' | ')}`);
    assert.match(fails(result)[0], /overlapping path/);
  }
  const apart = checkRunGraph(fixture(pair('`src/a.ts`', '`src/a.ts`', ['1', '2']), DOD, []));
  assert.deepEqual(fails(apart), []);
  // R-10: an absolute path is read from the checkout the session sits in, the nearest directory above it that holds
  // a .claude, wherever the script itself stands; from the script's own checkout when none does
  assert.deepEqual([checkoutOf(join(root, 'team-session', 'fx')), checkoutOf('/')], [root, realpathSync(checkout)]);
  assert.ok(isOk(checkRunGraph(fixture(pair(`\`${checkout}/pkg/a.ts\``, '`pkg/a.ts`'), DOD, [])), 2));
  const normal = normalizerOf({ repo: '/r', session: '/r/team-session/x' });
  assert.equal(normal('/r/team-session/x/out/a.md'), '<session>/out/a.md');
  assert.equal(normal('team-session/x/out/a.md'), '<session>/out/a.md');
  assert.equal(normal('${ABS_SESSION}/out/a.md'), '<session>/out/a.md');
});

test('graph helpers', () => {
  assert.deepEqual(expandBraces('a/{b,c}/{d,e}.ts'), ['a/b/d.ts', 'a/b/e.ts', 'a/c/d.ts', 'a/c/e.ts']);
  assert.ok(globsOverlap('src/**', 'src/a/b.ts'));
  assert.ok(globsOverlap('src/*.ts', 'src/a.ts'));
  assert.ok(!globsOverlap('src/*.ts', 'src/a.md'));
  assert.ok(!globsOverlap('s/attempts/**/ma1-*/**', 's/attempts/**/ma2-*/**'));
  assert.ok(!globsOverlap('src/a.ts', 'src/b.ts'));
  assert.deepEqual(findCycle([{ id: 'A', deps: ['B'] }, { id: 'B', deps: ['C'] }, { id: 'C', deps: [] }]), null);
  assert.deepEqual(findCycle([{ id: 'A', deps: ['B'] }, { id: 'B', deps: ['A'] }]), ['A', 'B', 'A']);
  const tasks = [{ id: 'T-18' }, { id: 'T-39-B<k>' }, { id: 'T-39-B<k>a' }];
  assert.equal(canonical('T-39-B<k−1>a'), 'T-39-B<>a');
  assert.deepEqual(resolveDep('T-39-B<k−1>a', tasks), ['T-39-B<k>a']);
  assert.deepEqual(resolveDep('T-18-fix-n', tasks), ['T-18']);
  assert.deepEqual(resolveDep('T-39', tasks), ['T-39-B<k>', 'T-39-B<k>a']);
  assert.deepEqual(resolveDep('T-7', tasks), []);
  assert.deepEqual([...mapsToOf(DOD)], [['AC-1', 'T-1, T-3'], ['AC-2', 'T-2'], ['AC-3', '—']]);
});

test('drift: --graph compares every task field and the order (#3)', () => {
  const dir = fixture();
  const graphFile = join(dir, 'graph.json');
  assert.equal(spawnSync(process.execPath, [projector, dir, '--out', graphFile]).status, 0);
  const same = checkRunGraph(dir, { graph: graphFile });
  assert.equal(same.code, 0, same.lines.join('\n'));
  assert.match(same.lines.at(-1), /graph file equals the plan$/);

  const saved = JSON.parse(readFileSync(graphFile, 'utf8'));
  const variant = (name, change) => {
    const file = join(dir, name);
    const copy = structuredClone(saved);
    change(copy);
    writeFileSync(file, JSON.stringify(copy));
    return checkRunGraph(dir, { graph: file });
  };
  const expect = (result, pattern) => {
    assert.equal(result.code, 1, result.lines.join('\n'));
    assert.ok(fails(result).some((line) => pattern.test(line)), result.lines.join('\n'));
  };
  expect(variant('missing.json', (g) => g.tasks.splice(1, 1)), /1 plan task\(s\) missing from the graph file \(T-2\)/);
  expect(variant('extra.json', (g) => g.tasks.push({ ...g.tasks[0], id: 'T-9' })), /graph task\(s\) not in the plan \(T-9\)/);
  expect(variant('deps.json', (g) => (g.tasks[2].deps = ['T-1'])), /1 task\(s\) differ from the plan \(T-3\)/);
  expect(variant('type.json', (g) => (g.tasks[0].type = 'HITL')), /differ from the plan \(T-1\)/);
  expect(variant('owned.json', (g) => g.tasks[1].filesOwned.push('src/**')), /differ from the plan \(T-2\)/);
  expect(variant('acs.json', (g) => (g.tasks[1].acs = [])), /differ from the plan \(T-2\)/);
  expect(variant('order.json', (g) => g.tasks.reverse()), /orders the tasks differently/);
  expect(variant('dup.json', (g) => g.tasks.push(g.tasks[0])), /duplicate task ids \(T-1\)/);

  const text = readFileSync(join(dir, 'team-plan.md'), 'utf8');
  const at = text.indexOf('Do T-3.');
  writeFileSync(join(dir, 'team-plan.md'), `${text.slice(0, at)}do${text.slice(at + 2)}`);
  const changed = checkRunGraph(dir, { graph: graphFile });
  expect(changed, /1 task\(s\) differ from the plan \(T-3\)/);
  expect(changed, /sha256 differs/);
  assert.equal(cli(dir, '--graph', graphFile).status, 1);
  writeFileSync(join(dir, 'broken.json'), '{ not json');
  assert.equal(checkRunGraph(dir, { graph: join(dir, 'broken.json') }).code, 1);
});

test('never blocks: an unreadable plan or dod is partial and exit 0', () => {
  for (const dir of [session({}), session({ 'team-plan.md': '# Team Plan\n\nprose only\n' })]) {
    const result = checkRunGraph(dir);
    assert.ok(isPartial(result), result.lines.join('\n'));
    assert.equal(cli(dir).status, 0);
  }
  const oddDod = checkRunGraph(fixture(CLEAN, '# DoD\n\nno table\n'));
  assert.ok(isPartial(oddDod));
});

test('read-only, usage exits 2, a symlinked entry still runs', () => {
  const dir = fixture();
  const before = readdirSync(dir);
  assert.equal(cli(dir).status, 0);
  assert.deepEqual(readdirSync(dir), before);
  for (const args of [[], ['relative/dir'], [join(dir, 'no-such-dir')], [dir, '--seal'], [dir, dir], [dir, '--graph'], [dir, '--graph', join(dir, 'absent.json')]]) {
    const result = cli(...args);
    assert.equal(result.status, 2, args.join(' '));
    assert.equal(result.stdout, '');
    assert.ok(result.stderr.includes(USAGE), result.stderr);
  }
  assert.deepEqual(parseArgs([dir, '--graph', '/g.json']), { sessionDir: dir, opts: { graph: '/g.json' } });
  const link = join(session({}), 'check-run-graph.mjs');
  symlinkSync(script, link);
  assert.equal(spawnSync(process.execPath, [link, fixture([task({ id: 'T-1', requirement: 'none' })])]).status, 1);
});

test('a prose mention does not make an unknown dependency a doubt (#3)', () => {
  const result = checkRunGraph(fixture([...CLEAN, task({ id: 'T-5', agent: 'coder-c', files: '`src/c/**`', blockedBy: 'T-9' }), 'T-9 was dropped in revision 2.\n']));
  assert.equal(result.code, 1);
  assert.match(fails(result)[0], /unknown id \(T-5 → T-9\)/);
});

test('a doubt is per field: a doubted requirement leaves overlap, type and deps checked (#2, #6)', () => {
  const doubted = { id: 'T-5', agent: 'coder-c', requirement: 'FR-1' };
  const cases = [
    [task({ ...doubted, files: '`src/a/x.ts`' }), /overlapping path \(T-1 \+ T-5/],
    [task({ ...doubted, files: '`src/c/**`', type: 'see notes' }), /no AFK \/ HITL type \(T-5\)/],
    [task({ ...doubted, files: '`src/c/**`', blockedBy: 'T-99' }), /unknown id \(T-5 → T-99\)/],
  ];
  for (const [extra, pattern] of cases) {
    const result = checkRunGraph(fixture([...CLEAN, extra]));
    assert.equal(result.code, 1, result.lines.join('\n'));
    assert.ok(fails(result).some((line) => pattern.test(line)), result.lines.join('\n'));
    assert.ok(result.lines.includes(PARTIAL_LINE));
  }
});

test('drift: the graph-level fields are compared, key order is not (#5, #6)', () => {
  const dir = fixture(CLEAN, DOD, [...HUMAN, '## Autonomy', '', 'autonomy:', '  loop_caps: 3', '']);
  const graphFile = join(dir, 'graph.json');
  assert.equal(spawnSync(process.execPath, [projector, dir, '--out', graphFile]).status, 0);
  const saved = JSON.parse(readFileSync(graphFile, 'utf8'));
  const run = (name, copy) => {
    writeFileSync(join(dir, name), JSON.stringify(copy));
    return checkRunGraph(dir, { graph: join(dir, name) });
  };
  for (const [key, value] of [['hitl', ['T-1']], ['humanSteps', []], ['autonomy', 'autonomy:\n  loop_caps: 30']]) {
    const result = run(`${key}.json`, { ...saved, [key]: value });
    assert.equal(result.code, 1, key);
    assert.ok(fails(result).some((line) => line.includes(`graph file's ${key} differ`)), result.lines.join('\n'));
  }
  const reordered = Object.fromEntries(Object.entries(saved).reverse());
  reordered.tasks = saved.tasks.map((t) => Object.fromEntries(Object.entries(t).reverse()));
  const same = run('reordered.json', reordered);
  assert.equal(same.code, 0, same.lines.join('\n'));
});

// gate-1 hardening: rules A to L of gate1-hardening/design.md, each case an inline plan

const isOk = (result, tasks) => result.code === 0 && result.lines.length === 1 && result.lines[0].startsWith(`OK: run graph — ${tasks} tasks, `);
const tableOf = (opts) => task(opts).split('\n').slice(1).join('\n');
const ROW_HEAD = ['| ID | Phase | Agent | agent_type | evidence_producer | Requirement | blockedBy | files_owned | verify | type | Estimated |', '|---|---|---|---|---|---|---|---|---|---|---|'];
const row = ({ id, phase = '1', agent = 'coder-a', agentType = 'team-coder', requirement = 'AC-1', blockedBy = 'none', files = '`src/a/**`', type = 'AFK' }) =>
  `| ${id} | ${phase} | ${agent} | ${agentType} | ${id.split(' ')[0]} → \`out/${agent}.md\` | ${requirement} | ${blockedBy} | ${files} | \`true\` | ${type} | 10 min |`;
// the tasks of CLEAN with one of them replaced or followed by more text
const withTask = (id, change) => CLEAN.map((text) => (text.startsWith(`### ${id} `) ? change(text) : text));
const tick = '```';

// H-1: each recorded false OK is now partial, a certain FAIL, or OK on the right graph
const NO_LONGER_OK = {
  'F1 a title that holds the word human hides an unprojected task': [[CLEAN[0], '## Phase 1b — human-readable report\n', '### T-5 report\n\nby hand\n\n', ...CLEAN.slice(1)]],
  'F1 an id in a table under such a title is no human step': [[...CLEAN.slice(0, 3), task({ id: 'T-4', phase: '2', agent: 'verifier', agentType: 'team-verifier', blockedBy: 'T-3, T-9', files: '`v/**`' })], DOD, ['## Human-readable changelog', '', '| Item | Note |', '|---|---|', '| T-9 | dropped |', '']],
  'F2 a task under a level-6 heading': [[...CLEAN, `###### T-5 slug\n${tableOf({ id: 'T-5', agent: 'coder-c', files: '`src/c/**`' })}`]],
  'F2 a task under an underlined heading': [[...CLEAN, `T-5 slug\n------\n${tableOf({ id: 'T-5', agent: 'coder-c', files: '`src/c/**`' })}`]],
  'F2 a heading that names two ids with a comma': [[...CLEAN, `### T-5, T-5b pair\n${tableOf({ id: 'T-5', agent: 'coder-c', files: '`src/c/**`' })}`]],
  'F3 an agent_type that is no agent definition': [[...CLEAN, task({ id: 'T-5', agent: 'coder-c', agentType: 'team-codr', files: '`src/c/**`' })]],
  'F3 an agent_type cell naming a lead and an agent': [[...CLEAN, task({ id: 'T-5', agent: 'orchestrator', agentType: 'in-session orchestrator; T-5c `team-verifier` (native seam dispatch)', files: '`src/c/**`' })]],
  'F5 a second field table under a task heading': [[...CLEAN, `${task({ id: 'T-5', agent: 'coder-c', files: '`src/c/**`' })}Branch else:\n${tableOf({ id: 'T-5', agent: 'coder-c', files: '`src/a/**`', type: 'HITL' })}`]],
  'F5 a row of a task table whose id cell does not parse': [[...CLEAN, ['### P9 — more', '', ...ROW_HEAD, row({ id: '5 extra', agent: 'coder-c', files: '`src/c/**`' }), ''].join('\n')]],
  'F6 a path written bare beside a backtick span': [[task({ id: 'T-1', files: '`src/a/**` and src/b/shared.ts, plus its test file' }), ...CLEAN.slice(1)]],
  'F6 a task with no files_owned, agent_type and Phase rows': [[...CLEAN, '### T-5 slug\n\n| Field | Value |\n|---|---|\n| **Agent** | coder-c |\n| **evidence_producer** | T-5 → `x` |\n| **Requirement** | AC-1 |\n| **blockedBy** | none |\n| **verify** | `true` |\n| **type** | AFK |\n| **Estimated** | 5 min |\n']],
  'F6 rows labelled filesOwned and agentType': [[...CLEAN, task({ id: 'T-5', agent: 'coder-c' }).replace('**files_owned**', 'filesOwned').replace('**agent_type**', 'agentType')]],
  'F10 a blockedBy that starts with none and names a task': [[...CLEAN, task({ id: 'T-5', agent: 'coder-c', files: '`src/c/**`', blockedBy: 'None — once T-2 has merged' })]],
  'R-1 an autonomy example in a fence beside the block of the plan': [CLEAN, DOD, [...HUMAN, '## Autonomy', '', tick + 'yaml', 'autonomy:', '  mode: full-auto-example', tick, '', 'autonomy:', '  mode: gated', '']],
  'F13 a frontmatter that never closes': [['---', 'latitude:', '  scope: narrow', '', ...CLEAN], DOD, HUMAN, true],
  'refuter: review substeps in a template row that is not read': [[...CLEAN, ['### Review substeps', '', '| Substep | agent_type | blockedBy | files_owned | verify |', '|---|---|---|---|---|', '| T-n.spec, n ∈ {1, 2} and each fired T-Rn | team-spec-reviewer | T-n | `out/spec-T-n.md` | `true` |', '| T-n.quality, same n | team-reviewer | T-n.spec | `out/review-T-n.md` | `true` |', ''].join('\n')]],
  'refuter: a substep table that is no task table': [[...CLEAN, '| Substep | Evidence | Est |\n|---|---|---|\n| T-3.1 capture | `out/a` | 5 min |\n| T-3.2 compare | `out/b` | 5 min |\n']],
  'refuter: files_owned, evidence_producer and verify on a prose line under a one-row table (gpu-broker)': [[...CLEAN, ['### T-5 broker', '| Phase | Agent | agent_type | type | Est | blockedBy | Requirement |', '|---|---|---|---|---|---|---|', '| 1 | coder-c | team-coder | AFK | 30 min | none | AC-1 |', '', 'files_owned: `src/a/x.ts` · evidence_producer: `coder-c/progress.md` · verify: `UT-broker`', ''].join('\n')]],
};
for (const [name, [tasks, dodText = DOD, tail = HUMAN, raw = false]] of Object.entries(NO_LONGER_OK)) {
  test(`partial, exit 0, no OK on ${name}`, () => {
    const dir = raw ? session({ 'team-plan.md': [...tasks, ...tail].join('\n'), 'definition-of-done.md': dodText }) : fixture(tasks, dodText, tail);
    const result = checkRunGraph(dir, { roster: ROSTER });
    assert.deepEqual(fails(result), [], result.lines.join('\n'));
    assert.ok(isPartial(result), result.lines.join('\n'));
  });
}

test('false-OK classes that are now a certain FAIL: overlap between the rows of one table, a blocking cell spelled Y', () => {
  const rows = (second) => ['### P1 — build', '', ...ROW_HEAD, row({ id: 'T-1 a', files: '`src/a.ts`' }), row({ id: 'T-2 b', agent: 'coder-b', requirement: 'AC-2', files: '`src/a.ts`', ...second }), ''].join('\n');
  const overlap = checkRunGraph(fixture([rows({})], DOD, []));
  assert.equal(overlap.code, 1, overlap.lines.join('\n'));
  assert.match(fails(overlap)[0], /1 pair\(s\) of tasks that can run in parallel own an overlapping path \(T-1 \+ T-2: src\/a\.ts\)/);
  assert.ok(isOk(checkRunGraph(fixture([rows({ blockedBy: 'T-1' })], DOD, [])), 2));
  assert.ok(isOk(checkRunGraph(fixture([rows({ phase: '2' })], DOD, [])), 2));
  const spelled = ['# DoD', '', '| id | statement | kind | blocking | maps_to |', '|---|---|---|---|---|', '| AC-1 | a | deterministic | yes | T-1 |', '| AC-2 | b | deterministic | true | T-2 |', '| AC-7 | c | deterministic | Y | |', '| AC-8 | d | deterministic | **blocking** | |', '| AC-9 | e | deterministic | N | |', ''].join('\n');
  const orphans = checkRunGraph(fixture(CLEAN, spelled));
  assert.equal(orphans.code, 1, orphans.lines.join('\n'));
  assert.match(fails(orphans)[0], /2 blocking AC\(s\) no task maps to \(AC-7, AC-8\)/);
  assert.deepEqual([...columnOf(spelled, 'blocking').values()], ['yes', 'true', 'Y', '**blocking**', 'N']);
  // any other spelling the contract parser cannot read is a doubt
  const odd = checkRunGraph(fixture(CLEAN, spelled.replace('| Y |', '| mostly |').replace('| **blocking** |', '| no |')));
  assert.deepEqual(fails(odd), []);
  assert.ok(isPartial(odd) && odd.lines.some((line) => /1 AC row\(s\) whose blocking cell is not read \(AC-7\)/.test(line)), odd.lines.join('\n'));
});

test('false-OK classes that now give OK on the right graph: fences, comments, sub-headings, row tables', () => {
  const example = [tick + '`markdown', tick + 'markdown', task({ id: 'T-99', agent: 'coder-z', files: '`src/a/**`' }), tick, tick + '`', ''].join('\n');
  const cases = {
    'a task inside a nested fence is no task': [...withTask('T-1', (text) => text + example), ],
    'a # comment inside a nested fence ends no block': withTask('T-1', (text) => `${text}${tick}\`markdown\n${tick}bash\n# install\n${tick}\n${tick}\`\n`),
    'a task inside an html comment is no task': [...CLEAN, `<!--\n${task({ id: 'T-9', agent: 'coder-z', files: '`src/a/**`' })}-->\n`],
    'an id-like sub-heading ends no block': withTask('T-1', (text) => `${text}#### E2E checks\n\nRun it.\n\n#### S3 upload\n\nUpload it.\n\n`),
    'a data-model table above the field table': withTask('T-2', (text) => text.replace('| Field | Value |', '| Field | Type | Notes |\n|---|---|---|\n| type | enum | kind |\n\n| Field | Value |')),
  };
  for (const [name, tasks] of Object.entries(cases)) {
    const result = checkRunGraph(fixture(tasks));
    assert.deepEqual(result.lines, ['OK: run graph — 4 tasks, 2 phases'], `${name}: ${result.lines.join(' | ')}`);
  }
  // R-1: the one autonomy block of a plan is taken from inside its code fence, where the real plans write it (F13)
  const fenced = fixture(CLEAN, DOD, [...HUMAN, '## Autonomy', '', tick + 'yaml', 'autonomy:', '  mode: gated', tick, '']);
  assert.deepEqual(checkRunGraph(fenced).lines, ['OK: run graph — 4 tasks, 2 phases']);
  assert.equal(JSON.parse(spawnSync(process.execPath, [projector, fenced], { encoding: 'utf8' }).stdout).autonomy, 'autonomy:\n  mode: gated');
  const phases = [['### P1 — build', '', ...ROW_HEAD.map((line) => line.replace('| Phase ', '').replace(/^\|---/, '')), row({ id: 'T-1 a' }).replace('| 1 ', ''), row({ id: 'T-2 b', agent: 'coder-b', requirement: 'AC-2', files: '`src/b/**`' }).replace('| 1 ', ''), ''].join('\n'), ['### P2 — verify', '', ...ROW_HEAD.map((line) => line.replace('| Phase ', '').replace(/^\|---/, '')), row({ id: 'T-3 c', agent: 'verifier', agentType: 'team-verifier', blockedBy: 'T-1, T-2', files: '`out/**`' }).replace('| 1 ', ''), ''].join('\n')];
  assert.deepEqual(checkRunGraph(fixture(phases, DOD, [])).lines, ['OK: run graph — 3 tasks, 2 phases']);
  // the members of one template cell are one declared fan-out; the same tasks as rows of their own are not
  const head = ROW_HEAD.map((line) => line.replace('| ID |', '| Substep |'));
  const fanOut = ['### Review substeps', '', ...head, row({ id: 'T-n.spec, n ∈ {1, 2}', agent: 'spec-reviewer', agentType: 'team-spec-reviewer', blockedBy: 'T-n', files: '`out/reviews/**`' }).replace('T-n.spec, → ', 'T-n.spec → '), ''].join('\n');
  assert.deepEqual(checkRunGraph(fixture([...CLEAN, fanOut])).lines, ['OK: run graph — 6 tasks, 2 phases']);
  const apart = ['### Review substeps', '', ...head, row({ id: 'T-1.spec', agent: 'spec-reviewer', agentType: 'team-spec-reviewer', blockedBy: 'T-1', files: '`out/reviews/**`' }), row({ id: 'T-2.spec', agent: 'spec-reviewer', agentType: 'team-spec-reviewer', blockedBy: 'T-2', files: '`out/reviews/**`' }), ''].join('\n');
  const shared = checkRunGraph(fixture([...CLEAN, apart]));
  assert.ok(isPartial(shared) && shared.lines.some((line) => /1 pair\(s\) of one owner's unordered tasks own an overlapping path \(T-1\.spec \+ T-2\.spec/.test(line)), shared.lines.join('\n'));
});

// H-3: none of these holds a certain defect: exit 0, no FAIL line
const NO_FAIL = {
  'an underlined heading named as a dependency (fx 02b)': [[...CLEAN.slice(0, 3), `T-5 slug\n------\n${tableOf({ id: 'T-5', agent: 'coder-c', files: '`src/c/**`' })}`, task({ id: 'T-4', phase: '2', agent: 'verifier', agentType: 'team-verifier', blockedBy: 'T-3, T-5', files: '`v/**`' })]],
  'an indented heading named as a dependency (fx 03b)': [[...CLEAN.slice(0, 3), ` ### T-5 slug\n${tableOf({ id: 'T-5', agent: 'coder-c', files: '`src/c/**`' })}`, task({ id: 'T-4', phase: '2', agent: 'verifier', agentType: 'team-verifier', blockedBy: 'T-3, T-5', files: '`v/**`' })]],
  'a `Task T-5:` heading named as a dependency (fx 06b)': [[...CLEAN.slice(0, 3), `### Task T-5: slug\n${tableOf({ id: 'T-5', agent: 'coder-c', files: '`src/c/**`' })}`, task({ id: 'T-4', phase: '2', agent: 'verifier', agentType: 'team-verifier', blockedBy: 'T-3, T-5', files: '`v/**`' })]],
  'a `[x] T-5` heading named as a dependency (fx 08b)': [[...CLEAN.slice(0, 3), `### [x] T-5 slug\n${tableOf({ id: 'T-5', agent: 'coder-c', files: '`src/c/**`' })}`, task({ id: 'T-4', phase: '2', agent: 'verifier', agentType: 'team-verifier', blockedBy: 'T-3, T-5', files: '`v/**`' })]],
  'a range written with a hyphen (fx 71)': [[...CLEAN.slice(0, 3), task({ id: 'T-4', phase: '2', agent: 'verifier', agentType: 'team-verifier', blockedBy: 'T-1-T-3', files: '`v/**`' })]],
  'an owned path with an exception in prose (fx 51)': [[task({ id: 'T-1', files: '`src/**` except `src/b/**`' }), ...CLEAN.slice(1)]],
  'a path a task only reads (fx 52)': [[...CLEAN, task({ id: 'T-5', agent: 'coder-c', files: 'reads `src/b/x.ts` only' })]],
  'an unescaped pipe in a row of a task table (fx 116)': [[...CLEAN, ['### P9 — more', '', ...ROW_HEAD, row({ id: 'T-5 extra', agent: 'coder-c', files: '`src/c/**`' }).replace('| \`true\` |', '| pnpm test | tee log |'), ''].join('\n')]],
  'two steps of the in-session orchestrator owning one path (single-layer-vm-lane before D-20)': [[...CLEAN, task({ id: 'T-9', phase: '3', agent: 'orchestrator', agentType: 'in-session orchestrator (no dispatch)', blockedBy: 'T-4', files: '`<session>/orchestrator/**`', type: 'HITL' }), task({ id: 'T-10', phase: '3', agent: 'orchestrator (T-10a, T-10b); verifier (T-10c)', agentType: 'in-session orchestrator; T-10c `team-verifier` (native seam dispatch)', blockedBy: 'T-4', files: '`<session>/orchestrator/**`', type: 'HITL' })]],
  'two lead steps owning one path': [[...CLEAN, task({ id: 'T-9', phase: '3', agent: 'orchestrator', agentType: 'in-session orchestrator (no dispatch)', blockedBy: 'T-4', files: '`<session>/orchestrator/**`', type: 'HITL' }), task({ id: 'T-10', phase: '3', agent: 'lead', agentType: 'none', blockedBy: 'T-4', files: '`<session>/orchestrator/**`', type: 'HITL' })]],
  'a task with no Requirement row (rule D)': [[...CLEAN, task({ id: 'T-5', agent: 'coder-c', files: '`src/c/**`', requirement: 'R-1' }).replace(/\| \*\*Requirement\*\* [^\n]*\n/, '')]],
  'a task with no type row (rule D)': [[...CLEAN, task({ id: 'T-5', agent: 'coder-c', files: '`src/c/**`', type: 'x' }).replace(/\| \*\*type\*\* [^\n]*\n/, '')]],
  'a compact review-substep table with dotted ids (S-10)': [[...CLEAN, task({ id: 'T-5', agent: 'coder-c', files: '`src/c/**`', blockedBy: 'T-1.quality' }), ['### Review substeps', '', '| Substep | agent_type | blockedBy | Evidence | verify |', '|---|---|---|---|---|', '| T-n.spec, n ∈ {1, 2} | team-spec-reviewer | T-n | `out/spec-T-n.md` | `true` |', '| T-n.quality, same n | team-reviewer | T-n.spec | `out/review-T-n.md` | as above |', ''].join('\n')]],
};
for (const [name, [tasks, dodText = DOD]] of Object.entries(NO_FAIL)) {
  test(`exit 0 and no FAIL on ${name}`, () => {
    const dir = fixture(tasks, dodText);
    const result = checkRunGraph(dir, { roster: ROSTER });
    assert.deepEqual([result.code, fails(result)], [0, []], result.lines.join('\n'));
    assert.ok(isPartial(result), result.lines.join('\n'));
    assert.equal(cli(dir).status, 0);
  });
}

test('no false FAIL: a range of ACs in a form that is not expanded, a byte-order mark, a schema table (fx 32, 43, 90-93)', () => {
  const blocking = ['# DoD', '', '| id | statement | kind | blocking |', '|---|---|---|---|', '| AC-1 | a | deterministic | yes |', '| AC-2 | b | deterministic | yes |', '| AC-3 | c | deterministic | yes |', ''].join('\n');
  const pair = (requirement) => [task({ id: 'T-1', requirement }), task({ id: 'T-2', agent: 'coder-b', files: '`src/b/**`', requirement })];
  for (const requirement of ['AC-1 to AC-3', 'AC-1 through AC-3', 'AC-1—AC-3', 'AC-1-3']) {
    const result = checkRunGraph(fixture(pair(requirement), blocking, []));
    assert.deepEqual([result.code, fails(result)], [0, []], `${requirement}: ${result.lines.join(' | ')}`);
    assert.ok(isPartial(result), requirement);
  }
  for (const requirement of ['AC-1..AC-3', 'AC-1–3', 'AC-1, AC-2, AC-3']) assert.ok(isOk(checkRunGraph(fixture(pair(requirement), blocking, [])), 2), requirement);
  // a range that maps nothing certain still fails where the defect is certain: AC-3 has no task at all
  const orphan = checkRunGraph(fixture(pair('AC-1, AC-2'), blocking, []));
  assert.match(fails(orphan)[0], /1 blocking AC\(s\) no task maps to \(AC-3\)/);
  const marked = session({ 'team-plan.md': `﻿${CLEAN.join('\n')}\n${HUMAN.join('\n')}`, 'definition-of-done.md': DOD });
  assert.deepEqual(checkRunGraph(marked).lines, ['OK: run graph — 4 tasks, 2 phases']);
});

test('H-2: no input makes either CLI exit non-zero without a FAIL line, or print a stack (F8)', () => {
  const texts = [
    plan([CLEAN[0], task({ id: 'QA.1', agent: 'coder-b', files: '`src/b/**`' })]),
    plan([CLEAN[0], task({ id: 'TA<m>-1', agent: 'coder-b', files: '`src/b/**`' })]),
    '### \n| | |\n|-|-|\n||\n',
    '|\n|\n|\n',
    '### T-1 x\n| Field | Value |\n|---|---|\n| blockedBy | T-1-T-1, T-1.x, <a>, constructor, __proto__ |\n| agent_type | __proto__ |\n| Requirement | constructor |\n| type | toString |\n',
    '### constructor-1 x\n| ID | Phase | Agent | agent_type |\n|---|---|---|---|\n| T-n.x, n ∈ {} | | | |\n| T-n.x, same n | | | |\n| | | | |\n',
    '---\nlatitude:\n' + '#'.repeat(7) + ' x\n<!--\n' + tick + '\n',
    '﻿',
    '',
  ];
  for (const [k, text] of texts.entries()) {
    const dir = session({ 'team-plan.md': text, 'definition-of-done.md': DOD, 'run-watch.md': '- T-1 __proto__ constructor\n| T-1 |\n' });
    for (const run of [cli(dir), spawnSync(process.execPath, [projector, dir], { encoding: 'utf8' })]) {
      assert.ok(run.status === 0 || (run.status === 1 && /^FAIL: /m.test(run.stdout)), `text ${k}: exit ${run.status} ${run.stderr}`);
      assert.ok(!/\n\s+at /.test(run.stderr) && !/Error/.test(run.stderr), `text ${k}: ${run.stderr}`);
    }
  }
  for (const text of texts.slice(0, 2)) {
    const run = cli(session({ 'team-plan.md': text, 'definition-of-done.md': DOD }));
    assert.deepEqual([run.status, run.stderr], [0, '']);
    assert.match(run.stdout, /^(OK: run graph|WARN: partial)/);
  }
  // an error of the scripts themselves is a partial result with the message
  const broken = checkRunGraph(fixture(), { roster: { [Symbol.iterator]: () => { throw new Error('boom'); } } });
  assert.deepEqual(broken, { code: 0, lines: ['WARN: partial: team-plan.md — internal error: boom', PARTIAL_LINE] });
  // a graph file that is json and no graph never throws
  const dir = fixture();
  for (const text of ['{"schema":2,"tasks":[null,5,"x",{"id":null}]}', '{"schema":2,"tasks":{}}', '{"schema":2,"tasks":[],"plan":7,"warnings":{"a":1}}']) {
    writeFileSync(join(dir, 'odd.json'), text);
    const result = checkRunGraph(dir, { graph: join(dir, 'odd.json') });
    assert.equal(result.code, 1, text);
    assert.ok(fails(result).length > 0, text);
  }
});

test('rule L: a graph file of another schema is partial and exit 0, never FAIL; no graph at all stays a FAIL', () => {
  const dir = fixture();
  const graphFile = join(dir, 'graph.json');
  assert.equal(spawnSync(process.execPath, [projector, dir, '--out', graphFile]).status, 0);
  const saved = JSON.parse(readFileSync(graphFile, 'utf8'));
  assert.equal(saved.schema, 2);
  for (const [name, old] of Object.entries({ 'schema 1': { ...saved, schema: 1 }, 'schema 1, other tasks': { ...saved, schema: 1, tasks: [], warnings: ['x'] }, 'schema 3': { ...saved, schema: 3 }, 'schema null': { schema: null } })) {
    writeFileSync(join(dir, 'old.json'), JSON.stringify(old));
    const result = checkRunGraph(dir, { graph: join(dir, 'old.json') });
    assert.deepEqual(result, { code: 0, lines: [OLD_GRAPH_LINE, PARTIAL_LINE] }, name);
    const run = cli(dir, '--graph', join(dir, 'old.json'));
    assert.deepEqual([run.status, run.stdout], [0, `${OLD_GRAPH_LINE}\n${PARTIAL_LINE}\n`], name);
  }
  assert.equal(OLD_GRAPH_LINE, 'WARN: partial — graph file is from an older projector, re-project');
  // a defect of the plan is still a FAIL beside an old graph file
  const bad = fixture([task({ id: 'T-1', requirement: 'TBD' }), ...CLEAN.slice(1)]);
  writeFileSync(join(bad, 'old.json'), JSON.stringify({ ...saved, schema: 1 }));
  const both = checkRunGraph(bad, { graph: join(bad, 'old.json') });
  assert.deepEqual([both.code, fails(both).length, both.lines.includes(OLD_GRAPH_LINE)], [1, 1, true]);
  for (const text of ['[]', '{}', 'null', '"x"', '7', '{ not json', '{"tasks":[]}']) {
    writeFileSync(join(dir, 'none.json'), text);
    const result = checkRunGraph(dir, { graph: join(dir, 'none.json') });
    assert.deepEqual([result.code, fails(result)], [1, ['FAIL: the graph file is not a run graph — re-project']], text);
  }
  assert.deepEqual(driftOf({ schema: 2 }, saved), ['FAIL: the graph file is not a schema 2 run graph — re-project']);
});

test('rule L, R-6: on a schema-2 graph file every key is compared, an unknown one included; session, plan.path and warnings alone are a graph to re-project (F12, RS-20)', () => {
  const dir = fixture(CLEAN, DOD, [...HUMAN, '## Autonomy', '', 'autonomy:', '  loop_caps: 3', '']);
  const graphFile = join(dir, 'graph.json');
  writeFileSync(join(dir, 'run-watch.md'), '- RW-1 — T-1 — symptom: x\n');
  assert.equal(spawnSync(process.execPath, [projector, dir, '--out', graphFile]).status, 0);
  const saved = JSON.parse(readFileSync(graphFile, 'utf8'));
  assert.deepEqual(Object.keys(saved), ['schema', 'session', 'plan', 'phases', 'tasks', 'hitl', 'humanSteps', 'latitude', 'autonomy', 'runWatch', 'warnings']);
  const run = (copy) => {
    writeFileSync(join(dir, 'copy.json'), JSON.stringify(copy));
    return checkRunGraph(dir, { graph: join(dir, 'copy.json') });
  };
  assert.deepEqual(run(saved).lines, ['OK: run graph — 4 tasks, 2 phases, graph file equals the plan']);
  // another value of the same type, whatever the value is
  const other = (value) => (typeof value === 'string' ? `${value}x` : typeof value === 'number' ? value + 1 : Array.isArray(value) ? [...value, 'x'] : value === null ? 'x' : { ...value, x: ['y'] });
  // R-6: the session dir, the path of the plan and the warnings differ when a session is read at another path or the
  // roster changes: alone they are the re-project doubt, exit 0; beside another difference the FAIL stands
  const stale = { code: 0, lines: [OLD_GRAPH_LINE, PARTIAL_LINE] };
  for (const key of Object.keys(saved).filter((name) => name !== 'tasks' && name !== 'schema')) {
    for (const copy of [{ ...saved, [key]: other(saved[key]) }, Object.fromEntries(Object.entries(saved).filter(([name]) => name !== key))]) {
      const result = run(copy);
      if (key === 'session' || key === 'warnings') assert.deepEqual(result, stale, key);
      else assert.deepEqual([result.code, fails(result)], [1, [`FAIL: the graph file's ${key} differ from the plan`]], key);
    }
  }
  assert.deepEqual(run({ ...saved, plan: { ...saved.plan, path: '/elsewhere/team-plan.md' } }), stale);
  assert.deepEqual(run({ ...saved, session: '/elsewhere', plan: { ...saved.plan, path: '/elsewhere/team-plan.md' }, warnings: ['partial: T-9 — x'] }), stale);
  assert.deepEqual(fails(run({ ...saved, plan: { ...saved.plan, bytes: saved.plan.bytes + 1 } })), ["FAIL: the graph file's plan differ from the plan"]);
  const moved = run({ ...saved, session: '/elsewhere', hitl: ['T-1'] });
  assert.deepEqual([moved.code, fails(moved), moved.lines.includes(OLD_GRAPH_LINE)], [1, ["FAIL: the graph file's hitl differ from the plan"], true]);
  assert.deepEqual(fails(run({ ...saved, plan: { ...saved.plan, sha256: '0'.repeat(64) } })), ['FAIL: team-plan.md changed since the graph file was projected (sha256 differs) — re-project']);
  assert.deepEqual(fails(run({ ...saved, overrides: { 'T-1': { type: 'AFK' } }, note: 1 })), ['FAIL: the graph file holds key(s) the projector does not write (overrides, note)']);
  for (const key of Object.keys(saved.tasks[0])) {
    const tasks = saved.tasks.map((t, k) => (k ? t : { ...t, [key]: key === 'id' ? t.id : other(t[key]) }));
    if (key !== 'id') assert.deepEqual(fails(run({ ...saved, tasks })), ['FAIL: 1 task(s) differ from the plan (T-1)'], key);
  }
  assert.deepEqual(fails(run({ ...saved, tasks: saved.tasks.map((t, k) => (k ? t : { ...t, override: true })) })), ['FAIL: 1 task(s) differ from the plan (T-1)']);
  assert.deepEqual(fails(run({ ...saved, tasks: saved.tasks.map((t, k) => (k ? t : Object.fromEntries(Object.entries(t).filter(([name]) => name !== 'block')))) })), ['FAIL: 1 task(s) differ from the plan (T-1)']);
});

// fix round 1: the findings of the three reviews of the hardening build (RC-, RS-, RR- ids), each case an inline plan

test('rule E: two phase labels that may name one phase leave an overlap a doubt, never skipped (RC-7)', () => {
  const doubt = /1 pair\(s\) of tasks own an overlapping path and write their phase in two ways that may name one phase \(T-1 \+ T-2: src\/shared\.ts\)/;
  // T-1 is a row under `### P1 — build` and takes its phase from the heading; T-2 writes Phase 1 in its field table
  const head = ROW_HEAD.map((line) => line.replace('| Phase ', '').replace(/^\|---/, ''));
  const rowTask = ['### P1 — build', '', ...head, row({ id: 'T-1 a', files: '`src/shared.ts`' }).replace('| 1 ', ''), ''].join('\n');
  const other = (phase) => task({ id: 'T-2', agent: 'coder-b', requirement: 'AC-2', phase, files: '`src/shared.ts`' });
  for (const tasks of [[rowTask, other('1')], [task({ id: 'T-1', files: '`src/shared.ts`' }), other('1 — build')]]) {
    const result = checkRunGraph(fixture(tasks, DOD, []));
    assert.deepEqual(fails(result), [], result.lines.join('\n'));
    assert.ok(isPartial(result) && result.lines.some((line) => doubt.test(line)), result.lines.join('\n'));
  }
  // labels that name two numbers keep the tasks apart; one label is a certain overlap. `1b` beside `P1` leads with
  // the same number: a doubt (V1-2)
  assert.ok(isOk(checkRunGraph(fixture([rowTask, other('2')], DOD, [])), 2));
  assert.ok(doubt.test(checkRunGraph(fixture([rowTask, other('1b')], DOD, [])).lines.join('\n')));
  assert.equal(checkRunGraph(fixture([rowTask, other('P1')], DOD, [])).code, 1);
});

test('rule E: two prose substeps are no fan-out: their overlap is a certain defect (RC-8, RS-7)', () => {
  const substep = (id, agent, blockedBy = 'T-1', end = '\n\n') => `**${id}** — Phase 1; Agent ${agent}; agent_type team-coder; evidence_producer ${id} → ` + '`out/' + agent + '.md`' + `; blockedBy ${blockedBy}; Requirement AC-1; files_owned ` + '`src/shared.ts`; verify `true`' + `; type AFK; Estimated 5 min${end}`;
  const overlap = /1 pair\(s\) of tasks that can run in parallel own an overlapping path \(T-1-fixa \+ T-1-fixb: src\/shared\.ts\)/;
  const apart = checkRunGraph(fixture(withTask('T-1', (text) => text + substep('T-1-fixa', 'coder-x') + substep('T-1-fixb', 'coder-y'))));
  assert.equal(apart.code, 1, apart.lines.join('\n'));
  assert.match(fails(apart)[0], overlap);
  // two marks on one line of prose are no heading and no cell either
  const oneLine = checkRunGraph(fixture(withTask('T-1', (text) => text + 'Two substeps. ' + substep('T-1-fixa', 'coder-x', 'T-1', '. ') + substep('T-1-fixb', 'coder-y'))));
  assert.equal(oneLine.code, 1, oneLine.lines.join('\n'));
  assert.match(fails(oneLine)[0], overlap);
  assert.ok(isOk(checkRunGraph(fixture(withTask('T-1', (text) => text + substep('T-1-fixa', 'coder-x') + substep('T-1-fixb', 'coder-y', 'T-1-fixa')))), 6));
  // the ids of one heading stay one declared fan-out
  const pair = task({ id: 'T-5', agent: 'coder-c', files: '`src/c/**`' }).replace('### T-5 slug', '### T-5 · T-6 pair');
  const grouped = checkRunGraph(fixture([...CLEAN, pair]));
  assert.ok(grouped.code === 0 && !grouped.lines.some((line) => /overlapping path/.test(line)), grouped.lines.join('\n'));
});

test('a blocking AC whose maps_to names an unknown task beside the word create, or whose id is no id, is a doubt (RC-12, RC-14)', () => {
  const create = checkRunGraph(fixture(CLEAN, dod([['AC-1 x', 'T-1'], ['AC-2 y', 'T-2'], ['AC-8 parser', 'T-9 (create the parser)']])));
  assert.deepEqual(fails(create), []);
  assert.ok(isPartial(create) && create.lines.some((line) => /1 blocking AC\(s\) map to no projected task by id \(AC-8\)/.test(line)), create.lines.join('\n'));
  // the create lane's own cell stays no orphan, an id of no task family beside it included
  assert.deepEqual(checkRunGraph(fixture(CLEAN, dod([['AC-1 x', 'T-1'], ['AC-2 y', 'T-2'], ['AC-8 review-seal', 'create lane (D-3) — no run task']]))).lines, ['OK: run graph — 4 tasks, 2 phases']);
  const words = checkRunGraph(fixture(CLEAN, dod([['AC-1 x', 'T-1'], ['AC-2 y', 'T-2'], ['constructor', '—'], ['toString', '']])));
  assert.deepEqual(fails(words), []);
  assert.ok(isPartial(words) && words.lines.some((line) => /2 blocking AC\(s\) map to no projected task by id \(constructor, toString\)/.test(line)), words.lines.join('\n'));
});

test('no input runs without end: a brace pattern past the limit and a plan past the task limit are doubts, a walk over many ** ends (RC-16, RS-11)', () => {
  const bomb = '`src/' + '{a,b,c,d,e,f,g,h}'.repeat(9) + '/x.ts`';
  const wide = checkRunGraph(fixture([task({ id: 'T-1', files: bomb }), ...CLEAN.slice(1)]));
  assert.deepEqual(fails(wide), []);
  assert.ok(isPartial(wide) && wide.lines.some((line) => /1 task\(s\) whose files_owned brace patterns expand to more than 1024 paths \(T-1\) — their overlaps are not checked/.test(line)), wide.lines.join('\n'));
  assert.equal(expandBraces('a/' + '{b,c}'.repeat(30), 1024), null);
  assert.deepEqual(expandBraces('a/{b,{c,d}}.ts'), ['a/b.ts', 'a/c.ts', 'a/b.ts', 'a/d.ts']);
  assert.equal(expandBraces('a/{b,c}/{d,e}.ts', 4).length, 4);
  assert.equal(globsOverlap('a/' + Array.from({ length: 18 }, () => '**').join('/x/') + '/z.ts', 'a/' + 's/'.repeat(36) + 'y.ts'), false);
  assert.ok(globsOverlap('a/**/x/**/z.ts', 'a/b/x/c/d/z.ts'));
  const many = ['### P1 — build', '', ...ROW_HEAD, ...Array.from({ length: 4001 }, (_, k) => row({ id: `T-${k + 1} x`, files: '`src/' + k + '/**`' })), ''].join('\n');
  const large = checkRunGraph(fixture([many], DOD, []));
  assert.deepEqual(fails(large), []);
  assert.ok(isPartial(large) && large.lines.some((line) => /4001 tasks, more than 4000 — the cycle and overlap checks are not run/.test(line)), large.lines.slice(0, 3).join('\n'));
});

test('an overlap names its paths as the plan writes them; a pair is skipped for a doubted agent (RR-9, RS-15)', () => {
  const cased = checkRunGraph(fixture([task({ id: 'T-1', files: '`A/Goal/sat.md`' }), task({ id: 'T-2', agent: 'coder-b', requirement: 'AC-2', files: '`a/goal/SAT.md`' })], DOD, []));
  assert.match(fails(cased)[0], /\(T-1 \+ T-2: A\/Goal\/sat\.md ~ a\/goal\/SAT\.md\)/);
  // T-2 and T-5 own an overlapping path with no order between them: certain for two known owners, a doubt when
  // the agent of one is read with a doubt
  const pair = (agentType) => [...CLEAN, task({ id: 'T-5', agent: 'coder-c', agentType, files: '`src/b/x.ts`' })];
  const certain = checkRunGraph(fixture(pair('team-coder')));
  assert.equal(certain.code, 1, certain.lines.join('\n'));
  assert.match(fails(certain)[0], /T-2 \+ T-5: src\/b\/\*\* ~ src\/b\/x\.ts/);
  const doubted = checkRunGraph(fixture(pair('team-codr')));
  assert.deepEqual(fails(doubted), [], doubted.lines.join('\n'));
  assert.ok(isPartial(doubted) && doubted.lines.some((line) => /T-5 — its agent_type cell names team-codr, which is no agent definition/.test(line)));
});

test('rule F: an error inside the check and one outside it are partial, exit 0, no stack (RS-15)', () => {
  const dir = fixture();
  // a graph file nested too deep to compare: the comparison throws, the check reports it and does not fail
  const deep = join(dir, 'deep.json');
  writeFileSync(deep, `{"schema":2,"tasks":[{"id":"T-1","deps":${'['.repeat(200000)}${']'.repeat(200000)}}]}`);
  const inside = checkRunGraph(dir, { graph: deep });
  assert.equal(inside.code, 0);
  assert.equal(inside.lines.length, 2, inside.lines.join('\n').slice(0, 400));
  assert.match(inside.lines[0], /^WARN: partial: check-run-graph\.mjs — internal error: /);
  assert.equal(inside.lines[1], PARTIAL_LINE);
  // resolve() throws for this one session: the error reaches the catch of the entry point
  const boom = join(root, 'team-session', 'boom');
  mkdirSync(boom);
  writeFileSync(join(boom, 'team-plan.md'), plan(CLEAN, HUMAN));
  const preload = 'data:text/javascript,' + encodeURIComponent('import path from "node:path";import { syncBuiltinESMExports } from "node:module";const real = path.resolve;path.resolve = (...args) => { if (String(args[0]).endsWith("boom")) throw new Error("resolve failed"); return real(...args); };syncBuiltinESMExports();');
  const outside = spawnSync(process.execPath, ['--import', preload, script, boom], { encoding: 'utf8' });
  assert.deepEqual([outside.status, outside.stderr, outside.stdout], [0, '', `WARN: partial: check-run-graph.mjs — internal error: resolve failed\n${PARTIAL_LINE}\n`]);
});

test('the fixture sessions read the roster of their own temp checkout, whatever stands above the temp directory (RS-14)', () => {
  const dir = fixture([...CLEAN, task({ id: 'T-5', agent: 'coder-c', agentType: 'team-codr', files: '`src/c/**`' })]);
  const result = checkRunGraph(dir);
  assert.ok(isPartial(result) && result.lines.some((line) => /T-5 — its agent_type cell names team-codr, which is no agent definition under \.claude\/agents/.test(line)), result.lines.join('\n'));
  assert.deepEqual(readdirSync(join(dir, '..', '..', '.claude', 'agents')).sort(), ROSTER.map((name) => `${name}.md`).sort());
});

test('rule E: two labels that lead with one number, or of which one is the other plus words, leave an overlap a doubt (V1-2)', () => {
  const doubt = /1 pair\(s\) of tasks own an overlapping path and write their phase in two ways that may name one phase \(T-1 \+ T-2: src\/shared\.ts\)/;
  const pair = (a, b) => checkRunGraph(fixture([task({ id: 'T-1', phase: a, files: '`src/shared.ts`' }), task({ id: 'T-2', agent: 'coder-b', requirement: 'AC-2', phase: b, files: '`src/shared.ts`' })], DOD, []));
  for (const [a, b] of [['1', '1 build'], ['1', '01'], ['1', '1.'], ['1', '1 / build'], ['1', 'Phase-1'], ['1', 'Ph1'], ['1', '#1'], ['1', '1 [build]'], ['2', '2 review'], ['8 review', '8 verify'], ['1', '1b'], ['2', '2 → p3'], ['1', 'one'], ['1', 'build'], ['build', '1 build'], ['build', 'build (W1)']]) {
    const result = pair(a, b);
    assert.ok(fails(result).length === 0 && isPartial(result) && result.lines.some((line) => doubt.test(line)), `${a} | ${b}: ${result.lines.join('\n')}`);
  }
  // a row under `### Phase 2 — review` beside a field table that writes `2 review`
  const head = ROW_HEAD.map((line) => line.replace('| Phase ', '').replace(/^\|---/, ''));
  const rowTask = ['### Phase 2 — review', '', ...head, row({ id: 'T-1 a', files: '`src/shared.ts`' }).replace('| 1 ', ''), ''].join('\n');
  const mixed = checkRunGraph(fixture([rowTask, task({ id: 'T-2', agent: 'coder-b', requirement: 'AC-2', phase: '2 review', files: '`src/shared.ts`' })], DOD, []));
  assert.ok(fails(mixed).length === 0 && isPartial(mixed) && mixed.lines.some((line) => doubt.test(line)), mixed.lines.join('\n'));
  // labels that lead with two numbers, and names that each hold a word the other lacks, are two phases: no overlap
  // between them
  for (const [a, b] of [['1', '2'], ['1 build', '2 review'], ['P1', 'P2 — review'], ['1.2', '2.1'], ['1', '10'], ['P1 contract (W1)', 'P3 review (W1)'], ['implement', 'isolated-validation'], ['gate G1', 'gate G2']]) assert.ok(isOk(pair(a, b), 2), `${a} | ${b}`);
  // one label is one phase: a certain overlap
  assert.equal(pair('1 build', '1 build').code, 1);
});

test('a blocking AC is excused only by a maps_to cell that names the create lane, not by the word create (V1-10)', () => {
  const run = (cell) => checkRunGraph(fixture(CLEAN, dod([['AC-1 first-thing', 'T-1, T-3'], ['AC-2 second-thing', 'T-2'], ['AC-4 planned', cell]])));
  for (const cell of ['the coder will create it', 'created later', 'see the create notes']) {
    const result = run(cell);
    assert.ok(isPartial(result) && result.lines.includes('WARN: partial: 1 blocking AC(s) map to no projected task by id (AC-4)'), `${cell}: ${result.lines.join('\n')}`);
  }
  for (const cell of ['create', 'create lane (D-8)', 'create-lane process', '— create lane (D-8): nothing external', 'create: design.md (C-6, C-9)', 'create seal (PP-2)', 'no run task', 'no run effect (create-lane)']) assert.ok(isOk(run(cell), 4), cell);
});

test('rule F: an entry point whose sibling module is missing is partial, exit 0, no stack (V1-13)', () => {
  const alone = mkdtempSync(join(root, 'alone-'));
  for (const file of [script, projector]) writeFileSync(join(alone, file.split('/').at(-1)), readFileSync(file));
  const dir = fixture();
  const checked = spawnSync(process.execPath, [join(alone, 'check-run-graph.mjs'), dir], { encoding: 'utf8' });
  assert.deepEqual([checked.status, checked.stderr], [0, '']);
  const lines = checked.stdout.trimEnd().split('\n');
  assert.ok(lines.length === 2 && /^WARN: partial: check-run-graph\.mjs — internal error: Cannot find module .*check-contract\.mjs/.test(lines[0]) && lines[1] === PARTIAL_LINE, checked.stdout);
  const projected = spawnSync(process.execPath, [join(alone, 'project-plan.mjs'), dir], { encoding: 'utf8' });
  assert.deepEqual([projected.status, projected.stdout], [0, '']);
  assert.match(projected.stderr, /^WARN: partial: project-plan\.mjs — internal error: Cannot find module [^\n]*check-contract\.mjs[^\n]*\n$/);
});

// fix round 3: the lead rulings R-1 to R-10 of gate1-hardening/design.md and the findings of the second verify

test('R-3: a files_owned doubt never excuses an overlap between two paths that were read (RR-4)', () => {
  const with5 = (files, agent = 'coder-c') => checkRunGraph(fixture([...CLEAN, task({ id: 'T-5', agent, files })]));
  const pair = 'T-2 \\+ T-5: src/b/\\*\\* ~ src/b/x\\.ts';
  // the list may be incomplete (a span set aside): the spans read still collide, the cell being spans and separators
  for (const files of ['`src/b/x.ts`, `mktemp -d`', '`src/b/x.ts`; `$T`', '`src/b/x.ts` · `a.ts b.ts`']) {
    const result = with5(files);
    assert.equal(result.code, 1, `${files}: ${result.lines.join(' | ')}`);
    assert.match(fails(result)[0], new RegExp(`1 pair\\(s\\) of tasks that can run in parallel own an overlapping path \\(${pair}\\)`), files);
    assert.ok(result.lines.includes('WARN: partial: T-5 — files_owned is prose or holds a span that is no path'), files);
    // one owner gets the same-owner line
    const own = with5(files, 'coder-b');
    assert.ok(fails(own).length === 0 && isPartial(own) && own.lines.some((line) => new RegExp(`1 pair\\(s\\) of one owner's unordered tasks own an overlapping path \\(${pair}\\)`).test(line)), `${files}: ${own.lines.join(' | ')}`);
  }
  // words beside the spans, an aside of any kind (R-3a: one that adds, one that may name a path, one that takes away)
  // or a negated span may say a span is not owned: the overlap is named as a doubt, exit 0
  for (const files of ['reads `src/b/x.ts` only', '`src/b/x.ts`, `!src/b/y.ts`', '`src/b/x.ts` except `src/b/x.ts` on the host', '`src/b/x.ts` (except `src/b/x.ts` on the host)', '`src/b/x.ts` (not src/b/x.ts on the host)', '`src/b/x.ts` (excluding its generated half)', '`src/b/x.ts` (and `docs/**`)', '`src/b/x.ts` (also docs/x.md)', '`src/b/x.ts` (+ its tests)']) {
    const result = with5(files);
    assert.ok(result.lines.includes('WARN: partial: T-5 — files_owned is prose or holds a span that is no path'), files);
    assert.ok(fails(result).length === 0 && isPartial(result) && result.lines.some((line) => new RegExp(`1 pair\\(s\\) of tasks that can run in parallel own an overlapping path, one of them beside words that may say it is not owned \\(${pair}\\)`).test(line)), `${files}: ${result.lines.join(' | ')}`);
  }
  // paths read by a guess stay out: bare words, a cell split by position
  const bare = with5('src/b/x.ts and its test');
  assert.ok(fails(bare).length === 0 && isPartial(bare) && !bare.lines.some((line) => /overlapping path/.test(line)), bare.lines.join(' | '));
  const split = checkRunGraph(fixture([...CLEAN, task({ id: 'T-5', agent: 'coder-c', files: '`src/b/x.ts` · `src/c/**`' }).replace('### T-5 slug', '### T-5 · T-6 pair')]));
  assert.ok(fails(split).length === 0 && isPartial(split) && !split.lines.some((line) => /overlapping path/.test(line)), split.lines.join(' | '));
});

test('R-4: a compact review-substep table that states what a substep owes prints OK on the right graph (RR-3)', () => {
  const table = (head, ...rows) => ['### Review substeps', '', head, head.replace(/[^|]+/g, '---'), ...rows, ''].join('\n');
  const base = [...CLEAN.slice(0, 2), task({ id: 'T-3', agent: 'tester', agentType: 'team-tester', blockedBy: 'T-1.quality, T-2.quality', files: '`src/a/test/**`' }), CLEAN[3]];
  const compact = table('| Substep | agent_type | blockedBy | Evidence | verify |', '| T-n.spec, n ∈ {1, 2} | team-spec-reviewer | T-n | `out/spec-T-n.md` | `true` |', '| T-n.quality, same n | team-reviewer | T-n.spec | `out/review-T-n.md` | `true` |');
  const dir = fixture([...base, compact]);
  assert.deepEqual(checkRunGraph(dir, { roster: ROSTER }).lines, ['OK: run graph — 8 tasks, 2 phases']);
  const graph = JSON.parse(spawnSync(process.execPath, [projector, dir], { encoding: 'utf8' }).stdout);
  assert.deepEqual(graph.tasks.filter((t) => t.id.includes('.')).map((t) => [t.id, t.phase, t.type, t.acs, t.deps, t.filesOwned, t.agentType, t.evidenceProducer]), [
    ['T-1.spec', '1', 'AFK', ['AC-1'], ['T-1'], [], 'team-spec-reviewer', '`out/spec-T-1.md`'],
    ['T-2.spec', '1', 'AFK', ['AC-2'], ['T-2'], [], 'team-spec-reviewer', '`out/spec-T-2.md`'],
    ['T-1.quality', '1', 'AFK', ['AC-1'], ['T-1.spec'], [], 'team-reviewer', '`out/review-T-1.md`'],
    ['T-2.quality', '1', 'AFK', ['AC-2'], ['T-2.spec'], [], 'team-reviewer', '`out/review-T-2.md`'],
  ]);
  // a task with no type is the defect; the substep that would take it is a doubt, not a second one
  const untyped = checkRunGraph(fixture([task({ id: 'T-1', type: 'see notes' }), ...base.slice(1), compact]), { roster: ROSTER });
  assert.deepEqual(fails(untyped), ['FAIL: 1 task(s) with no AFK / HITL type (T-1) — write type AFK or HITL']);
  // V3-1: under a HITL task a dispatched substep that states no type is a doubt on type: no FAIL, no human step
  const hitl = fixture([task({ id: 'T-1', type: 'HITL' }), ...base.slice(1), compact]);
  const gated = checkRunGraph(hitl, { roster: ROSTER });
  const noHitl = (id) => `WARN: partial: ${id} — it states no type and its task is HITL, which a dispatched substep does not take`;
  assert.deepEqual([fails(gated), isPartial(gated), gated.lines.slice(0, -1)], [[], true, [noHitl('T-1.spec'), noHitl('T-1.quality')]]);
  assert.deepEqual(JSON.parse(spawnSync(process.execPath, [projector, hitl], { encoding: 'utf8' }).stdout).hitl, ['T-1']);
  // a substep with no agent is owned by its agent_type: one type twice is one owner, two types are two
  const owning = (second) => checkRunGraph(fixture([...base, table('| Substep | agent_type | blockedBy | files_owned | Evidence | verify |', '| T-1.spec | team-spec-reviewer | T-1 | `out/reviews.md` | `out/reviews.md` | `true` |', '| T-1.quality | team-reviewer | T-1.spec | `out/q1.md` | `out/q1.md` | `true` |', '| T-2.quality | team-reviewer | T-2.spec | `out/q2.md` | `out/q2.md` | `true` |', second)]), { roster: ROSTER });
  const same = owning('| T-2.spec | team-spec-reviewer | T-2 | `out/reviews.md` | `out/reviews.md` | `true` |');
  assert.ok(fails(same).length === 0 && isPartial(same) && same.lines.includes("WARN: partial: 1 pair(s) of one owner's unordered tasks own an overlapping path (T-1.spec + T-2.spec: out/reviews.md)"), same.lines.join(' | '));
  const other = owning('| T-2.spec | team-verifier | T-2 | `out/reviews.md` | `out/reviews.md` | `true` |');
  assert.match(fails(other)[0], /1 pair\(s\) of tasks that can run in parallel own an overlapping path \(T-1\.spec \+ T-2\.spec: out\/reviews\.md\)/);
});

test('R-7: a group heading over the deeper task headings of its sub-ids gives no line at any level: the plan prints OK on the right graph (V3-5)', () => {
  const leaf = (fields) => task(fields).replace(/^### /, '#### ');
  const leaves = [leaf({ id: 'T-1-a' }), leaf({ id: 'T-1-b', agent: 'coder-b', requirement: 'AC-2', blockedBy: 'T-1-a', files: '`src/b/**`' })];
  const dir = fixture(['### T-1 build (logical group; no separate dispatch)', '', ...leaves, '### T-2 verify (logical group; no separate dispatch)', '', leaf({ id: 'T-2-a', agent: 'verifier', agentType: 'team-verifier', blockedBy: 'T-1-b', files: '`<session>/verifier/**`' })], DOD, []);
  assert.deepEqual(checkRunGraph(dir, { roster: ROSTER }).lines, ['OK: run graph — 3 tasks, 1 phases']);
  const graph = JSON.parse(spawnSync(process.execPath, [projector, dir], { encoding: 'utf8' }).stdout);
  assert.deepEqual(graph.tasks.map((t) => [t.id, t.deps, t.agentType, t.filesOwned]), [['T-1-a', [], 'team-coder', ['src/a/**']], ['T-1-b', ['T-1-a'], 'team-coder', ['src/b/**']], ['T-2-a', ['T-1-b'], 'team-verifier', ['<session>/verifier/**']]]);
  // the same heading over sub-ids of its own level is no group: it stays named
  const level = checkRunGraph(fixture(['### T-1 build (logical group; no separate dispatch)', '', ...leaves.map((text) => text.replace(/^#### /, '### '))], DOD, []), { roster: ROSTER });
  assert.ok(isPartial(level) && level.lines.some((line) => /^WARN: partial: T-1 — heading has no field table — not projected/.test(line)), level.lines.join('\n'));
});

test('R-8: two phase labels are two phases when their leading id tokens differ, or when neither has one and each holds a word the other lacks (V2-2)', () => {
  const doubt = /1 pair\(s\) of tasks own an overlapping path and write their phase in two ways that may name one phase \(T-1 \+ T-2: src\/shared\.ts\)/;
  const pair = (a, b) => checkRunGraph(fixture([task({ id: 'T-1', phase: a, files: '`src/shared.ts`' }), task({ id: 'T-2', agent: 'coder-b', requirement: 'AC-2', phase: b, files: '`src/shared.ts`' })], DOD, []));
  // one leading token with two tails, and tokens of two families, may name one phase
  for (const [a, b] of [['A — build', 'A — review'], ['Phase A build', 'Phase A review'], ['Wave 1 build', 'Wave 1 review'], ['W1 build', 'W1 review'], ['W1', 'W1b'], ['M1 build', 'M1 verify'], ['Step 8 review', 'Step 8 verify'], ['Sprint 1 build', 'Sprint 1 test'], ['W1', '1'], ['1', 'I'], ['Wave 1', 'Step 2']]) {
    const result = pair(a, b);
    assert.ok(fails(result).length === 0 && isPartial(result) && result.lines.some((line) => doubt.test(line)), `${a} | ${b}: ${result.lines.join('\n')}`);
  }
  for (const [a, b] of [['A', 'B'], ['A — build', 'B — review'], ['Wave 1 build', 'Wave 2 build'], ['W1', 'W2 review'], ['Step 8', 'Step 9'], ['build', 'review']]) assert.ok(isOk(pair(a, b), 2), `${a} | ${b}`);
});

test('no input runs without end: more owned patterns than the overlap check compares are a doubt (V2-12)', () => {
  const files = (k) => Array.from({ length: 8 }, (_, n) => '`src/' + k + '/' + n + '.ts`').join(', ');
  const many = ['### P1 — build', '', ...ROW_HEAD, ...Array.from({ length: 2000 }, (_, k) => row({ id: `T-${k + 1} x`, files: files(k) })), ''].join('\n');
  const result = checkRunGraph(fixture([many], DOD, []));
  assert.deepEqual(fails(result), []);
  assert.ok(isPartial(result) && result.lines.includes('WARN: partial: 16000 owned patterns in 2000 tasks, more than 50000000 pairs to compare — the overlap check is not run'), result.lines.slice(0, 3).join('\n'));
});

test('R-3a: an overlap is a certain defect only between two clean cells; beside an aside or words, whatever they say, it is the named doubt (V4-1)', () => {
  const second = (files) => task({ id: 'T-2', agent: 'coder-b', files, requirement: 'AC-2' });
  const run = (files2, files5, agent = 'coder-c') => checkRunGraph(fixture([CLEAN[0], second(files2), ...CLEAN.slice(2), task({ id: 'T-5', agent, files: files5 })]));
  const pair = 'T-2 + T-5: src/b/** ~ src/b/x.ts';
  const worded = `WARN: partial: 1 pair(s) of tasks that can run in parallel own an overlapping path, one of them beside words that may say it is not owned (${pair})`;
  // an aside that says the span is not written, in any words, and one that says anything else: no doubt on the field
  // (R-2), so the overlap line is the only one, whichever of the two cells holds the aside
  for (const aside of ['(no edits in this task)', '(no edits)', '(read)', '(read-only)', '(shared read)', '(new)', '(owned by the coder lane)']) {
    assert.deepEqual([run('`src/b/**`', `\`src/b/x.ts\` ${aside}`).lines, run(`\`src/b/**\` ${aside}`, '`src/b/x.ts`').lines], [[worded, PARTIAL_LINE], [worded, PARTIAL_LINE]], aside);
    assert.equal(run('`src/b/**`', `\`src/b/x.ts\` ${aside}`).code, 0, aside);
  }
  // the same note written inside the ticks, and beside a second clean span
  for (const files of ['`src/b/x.ts (shared)`', '`src/b/x.ts` (read), `out/t5.md`', '(read) `src/b/x.ts`']) assert.deepEqual(run('`src/b/**`', files).lines, [worded, PARTIAL_LINE], files);
  // two clean cells: the certain defect, as before
  const clean = run('`src/b/**`', '`src/b/x.ts`, `out/t5.md`');
  assert.deepEqual([clean.code, clean.lines], [1, [`FAIL: 1 pair(s) of tasks that can run in parallel own an overlapping path (${pair}) — order them with blockedBy or split files_owned`]]);
  // one owner keeps the same-owner line, an order between the two or no shared path leaves the plan OK
  assert.deepEqual(run('`src/b/**`', '`src/b/x.ts` (read)', 'coder-b').lines, [`WARN: partial: 1 pair(s) of one owner's unordered tasks own an overlapping path (${pair})`, PARTIAL_LINE]);
  assert.ok(isOk(run('`src/b/**`', '`src/c/x.ts` (read)'), 5));
  assert.ok(isOk(checkRunGraph(fixture([...CLEAN, task({ id: 'T-5', agent: 'coder-c', files: '`src/b/x.ts` (read)', blockedBy: 'T-2' })])), 5));
});

test('R-5a: a conditional repair template whose ids are patterns, in a table or at the start of a heading, leaves the plan OK on the graph of its tasks (V4-2, V4-4)', () => {
  const repair = (label) => ['## Repair template (conditional; any step off its expected state, or a failed verify / review loop)', '', `| Step | ${label} | Agent / \`agent_type\` | Content | Evidence |`, '|---|---|---|---|---|', '| collect | `T-R{n}-collect` | orchestrator (HITL, read-only host) | captures | raw captures |', '| triage | `T-R{n}-triage` | repair-investigator / `team-investigator` | root cause | `investigator/root-cause-R{n}.md` |', '| fix | `T-R{n}-fix` | owning coder / `team-coder` | the fix | `coder-{lane}/progress.md` |', '| push | `T-R{n}-push` | orchestrator (HITL) | the re-attempt | `run/repair-{n}/record.md` |', '', 'Each fix-forward push consumes one round. `T-R{n}-push` re-attempts the failed step of T-4.', '', '### T-R<n>-review', '', 'Review of round n: the fix diff.', ''];
  const dir = fixture(CLEAN, DOD, [...HUMAN, ...repair('Id pattern')]);
  assert.deepEqual(checkRunGraph(dir, { roster: ROSTER }).lines, ['OK: run graph — 4 tasks, 2 phases']);
  const graph = JSON.parse(spawnSync(process.execPath, [projector, dir], { encoding: 'utf8' }).stdout);
  assert.deepEqual([graph.tasks.map((t) => t.id), graph.humanSteps, graph.warnings], [['T-1', 'T-2', 'T-3', 'T-4'], ['H-1'], []]);
  // the same rows under an ordinary id column are template rows: named, the plan partial (rule I)
  const named = checkRunGraph(fixture(CLEAN, DOD, [...HUMAN, ...repair('ID')]), { roster: ROSTER });
  assert.deepEqual([fails(named), isPartial(named), named.lines.filter((line) => /its id cell is a template in a form that is not read — row not projected/.test(line)).length], [[], true, 4]);
});

test('R-11: a task under a heading that says withdrawn is named and gives no certain defect; the same task under a live heading does (V4-3)', () => {
  const gone = (title) => task({ id: 'T-5', agent: 'coder-c', files: '`src/b/x.ts`', blockedBy: 'T-99', type: 'see notes' }).replace('### T-5 slug', `#### T-5 ${title}`);
  const under = (section, title) => checkRunGraph(fixture(CLEAN, DOD, [...HUMAN, section, '', gone(title)]), { roster: ROSTER });
  const doubt = /^WARN: partial: T-5 — its heading or a heading above it says withdrawn \(team-plan\.md:\d+\): it may not be a live task$/;
  for (const [section, title] of [['## 13 Withdrawn r11 (D-24) — r10 tasks never dispatched', 'data-online'], ['## 13 History', 'data-online — withdrawn r11 (never run; r10 text kept as history)']]) {
    const result = under(section, title);
    assert.deepEqual([result.code, fails(result), isPartial(result), result.lines.filter((line) => doubt.test(line)).length], [0, [], true, 1], `${section} | ${title}: ${result.lines.join(' | ')}`);
  }
  const live = under('## 13 More tasks', 'data-online');
  assert.deepEqual([live.code, fails(live).map((line) => line.split(' (')[0])], [1, ['FAIL: 1 task(s) with no AFK / HITL type', 'FAIL: 1 dependency(ies) on an unknown id', 'FAIL: 1 pair(s) of tasks that can run in parallel own an overlapping path']]);
});

test("R-4a: a compact substep table that names each owner in an Owner column prints OK with each owner's agent type and kind (V4-5)", () => {
  const table = (...rows) => ['### Review substeps', '', '| Substep | Owner | blockedBy | Evidence + verify |', '|---|---|---|---|', ...rows, ''].join('\n');
  const rows = ['| T-1.spec | team-spec-reviewer | T-1 | `out/spec-T-1.md`; `true` |', '| T-1.quality | team-reviewer | T-1.spec | `out/q-T-1.md`; `true` |', '| T-2.confirm | lead | T-2 | `out/c-T-2.md`; `true` |'];
  const dir = fixture([...CLEAN, table(...rows)]);
  assert.deepEqual(checkRunGraph(dir, { roster: ROSTER }).lines, ['OK: run graph — 7 tasks, 2 phases']);
  const graph = JSON.parse(spawnSync(process.execPath, [projector, dir], { encoding: 'utf8' }).stdout);
  assert.deepEqual(graph.tasks.filter((t) => t.id.includes('.')).map((t) => [t.id, t.agent, t.agentType, t.kind, t.type, t.deps]), [
    ['T-1.spec', 'team-spec-reviewer', 'team-spec-reviewer', 'review', 'AFK', ['T-1']],
    ['T-1.quality', 'team-reviewer', 'team-reviewer', 'review', 'AFK', ['T-1.spec']],
    ['T-2.confirm', 'lead', 'lead', 'lead', 'AFK', ['T-2']],
  ]);
  // an owner that is no agent definition is the agent_type doubt: the plan is partial, never OK on an agent type of null
  const unknown = checkRunGraph(fixture([...CLEAN, table('| T-1.spec | spec-reviewer | T-1 | `out/spec-T-1.md`; `true` |')]), { roster: ROSTER });
  assert.deepEqual([fails(unknown), unknown.lines], [[], ['WARN: partial: T-1.spec — its Owner cell, read as its agent_type, names spec-reviewer, which is no agent definition under .claude/agents', PARTIAL_LINE]]);
});
