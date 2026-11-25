import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { after } from 'node:test';
import * as projector from './project-plan.mjs';
import {
  KINDS,
  PARTIAL,
  SCHEMA,
  USAGE,
  acsIn,
  cellFor,
  globsOf,
  headingIds,
  idsIn,
  parseArgs,
  prefixOf,
  projectSession,
  projectText,
  typeOf,
} from './project-plan.mjs';

// the exports gate-1 hardening adds, read off the namespace so this file still loads beside an older projector
const { agentOf, fenceScan, idAtStart, rosterOf } = projector;

const script = fileURLToPath(new URL('./project-plan.mjs', import.meta.url));
// every fixture session sits under one temp checkout that has its own .claude/agents: no result depends on what
// stands above the machine's temp directory
const ROSTER = ['team-coder', 'team-tester', 'team-verifier', 'team-reviewer', 'team-spec-reviewer', 'team-goal-auditor', 'researcher'];
const root = mkdtempSync(join(tmpdir(), 'project-plan-'));
after(() => rmSync(root, { recursive: true, force: true }));
mkdirSync(join(root, '.claude', 'agents'), { recursive: true });
mkdirSync(join(root, 'team-session'));
for (const name of ROSTER) writeFileSync(join(root, '.claude', 'agents', `${name}.md`), `# ${name}\n`);
const session = (files = {}) => {
  const dir = mkdtempSync(join(root, 'team-session', 'fx-'));
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(join(dir, name, '..'), { recursive: true });
    writeFileSync(join(dir, name), text);
  }
  return dir;
};
const cli = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });

// FRAMEWORK.md → Task Definition Format, as the template writes it
const task = ({ id, title = 'slug', phase = '1', agent = 'coder-a', agentType = '`team-coder`', requirement = 'AC-1', blockedBy = 'none', files = '`src/a/**`', type = 'AFK', bold = true, typeLabel = 'type' }) => {
  const label = (name) => (bold ? `**${name}**` : name);
  return [
    `### ${id} ${title}`,
    '',
    '| Field | Value |',
    '|-------|-------|',
    `| ${label('Phase')} | ${phase} |`,
    `| ${label('Agent')} | ${agent} |`,
    `| ${label('agent_type')} | ${agentType} |`,
    `| ${label('evidence_producer')} | ${id} → \`<session>/${agent}/progress.md\` |`,
    `| ${label('Requirement')} | ${requirement} |`,
    `| ${label('blockedBy')} | ${blockedBy} |`,
    `| ${label('files_owned')} | ${files} |`,
    `| ${label('verify')} | \`pnpm -F "@x/a" test\` |`,
    ...(type === null ? [] : [`| ${label(typeLabel)} | ${type} |`]),
    `| ${label('Estimated')} | 20 min |`,
    '',
    `Do the ${id} work.`,
    '',
    '#### Acceptance criteria',
    '- [ ] it works',
    '',
  ].join('\n');
};
const plan = (tasks, { head = [], tail = [] } = {}) =>
  ['---', 'name: fixture', 'latitude:', '  coder-a:', '    open: helper layout', '---', '', '# Team Plan: fixture', '', ...head, '## Tasks', '', ...tasks, ...tail, '## Verification Inventory', '', 'none', ''].join('\n');
const partials = (graph) => graph.warnings.filter((w) => w.startsWith(PARTIAL));
const doubts = (graph, id) => partials(graph).filter((w) => w.startsWith(`${PARTIAL}${id} — `));

const BASIC = plan([
  task({ id: 'T-1', title: 'core-lib', files: '`src/a/**`, `src/b/{x,y}.ts`', requirement: 'AC-1, AC-2' }),
  task({ id: 'T-2', title: 'proofs', agent: 'tester', agentType: '`team-tester`', blockedBy: 'T-1', files: '`test/**`' }),
  task({ id: 'T-3', title: 'verify-dod', phase: '2', agent: 'verifier', agentType: 'team-verifier', blockedBy: 'T-1, T-2', files: '`<session>/verifier/**`', requirement: 'AC-1..AC-3' }),
]);

test('a FRAMEWORK-format plan projects to schema 2 with byte-equal blocks and no doubt', () => {
  const graph = projectText({ text: BASIC, session: '/s', path: '/s/team-plan.md' });
  assert.equal(graph.schema, SCHEMA);
  assert.equal(SCHEMA, 2);
  assert.deepEqual(graph.tasks.map((t) => t.id), ['T-1', 'T-2', 'T-3']);
  assert.deepEqual(graph.phases, ['1', '2']);
  const [t1, t2, t3] = graph.tasks;
  assert.deepEqual([t1.slug, t1.agentType, t1.kind, t1.type, t1.deps], ['core-lib', 'team-coder', 'code', 'AFK', []]);
  assert.deepEqual(t1.acs, ['AC-1', 'AC-2']);
  assert.deepEqual(t1.filesOwned, ['src/a/**', 'src/b/{x,y}.ts']);
  assert.equal(t1.estimated, '20 min');
  assert.deepEqual(t2.deps, ['T-1']);
  assert.deepEqual([t3.deps, t3.kind, t3.acs], [['T-1', 'T-2'], 'verify', ['AC-1', 'AC-2', 'AC-3']]);
  for (const t of graph.tasks) {
    assert.ok(KINDS.includes(t.kind));
    const at = BASIC.indexOf(`### ${t.id} `);
    assert.equal(BASIC.slice(at, at + t.block.length), t.block);
    assert.equal(BASIC.split('\n')[t.line - 1], t.block.split('\n')[0]);
  }
  assert.ok(!t3.block.includes('## Verification Inventory'));
  assert.ok(BASIC.includes(graph.tasks.map((t) => t.block).join('')));
  assert.equal(graph.latitude, 'latitude:\n  coder-a:\n    open: helper layout');
  assert.equal(graph.plan.bytes, Buffer.byteLength(BASIC));
  assert.match(graph.plan.sha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(graph.warnings, []);
});

test('crlf plans keep their bytes in the block', () => {
  const text = BASIC.replace(/\n/g, '\r\n');
  const graph = projectText({ text });
  assert.equal(graph.tasks.length, 3);
  for (const t of graph.tasks) assert.ok(text.includes(t.block) && t.block.includes('\r\n'));
  assert.deepEqual(graph.tasks[2].deps, ['T-1', 'T-2']);
});

test('ids as real plans write them; dots and suffixes stay (#2), ranges expand (#5)', () => {
  assert.deepEqual(idsIn('T-01, T-3g · T-7-spec and T-0r; T-S7, RV-1, DP-2r, H-2b'), ['T-01', 'T-3g', 'T-7-spec', 'T-0r', 'T-S7', 'RV-1', 'DP-2r', 'H-2b']);
  assert.deepEqual(idsIn('T-1.1, T-1.2 and T-1.'), ['T-1.1', 'T-1.2', 'T-1']);
  assert.deepEqual(idsIn('H-1..H-3'), ['H-1', 'H-2', 'H-3']);
  assert.deepEqual(acsIn('AC-1–4'), ['AC-1', 'AC-2', 'AC-3', 'AC-4']);
  assert.deepEqual(acsIn('AC-1 … AC-3, AC-6b (CON-17)'), ['AC-1', 'AC-2', 'AC-3', 'AC-6b']);
  assert.deepEqual(acsIn('FR-2, DoD-3', new Set(['DoD-3'])), ['DoD-3']);
  assert.deepEqual(idsIn('T-43-R<m−1>a CLEAN'), ['T-43-R<m−1>a']);
  assert.deepEqual(headingIds('### T-1 close-paused-run').named, [{ id: 'T-1', title: 'close-paused-run', slug: 'close-paused-run' }]);
  assert.deepEqual(headingIds('### T-1.1 sub-step').named.map((n) => n.id), ['T-1.1']);
  assert.deepEqual(headingIds('### T1: Core library').named.map((n) => [n.id, n.title]), [['T1', 'Core library']]);
  assert.deepEqual(headingIds('#### RV-1 spec-review · RQ-1 quality-review').named.map((n) => n.id), ['RV-1', 'RQ-1']);
  assert.deepEqual(headingIds('### T-10a / T-10b / T-10c harness-check').named.map((n) => n.id), ['T-10a', 'T-10b', 'T-10c']);
  assert.deepEqual(headingIds('### T-26 g0-door (+ T-26p probe, T-26a analyst)').named.map((n) => [n.id, Boolean(n.inferred)]), [['T-26', false], ['T-26p', true], ['T-26a', true]]);
  assert.deepEqual(headingIds('### T-20 dlv-green (+ D-27 after)').named.map((n) => n.id), ['T-20']);
  assert.deepEqual(headingIds('### T-27 docs-fix (planned F-1: T-27 → T-27v → T-27a)').named.map((n) => [n.id, n.after]), [['T-27', undefined], ['T-27v', 'T-27'], ['T-27a', 'T-27v']]);
  assert.deepEqual(headingIds('### T-36 final-grade (substeps T-36-initial, T-36-regrade)').unclaimed, ['T-36-initial', 'T-36-regrade']);
  assert.equal(headingIds('### Tester (T-10, T-11)'), null);
  assert.equal(headingIds('## Tasks'), null);
});

test('cells of a several-id heading: labels are certain, position is a guess', () => {
  const group = ['T-25', 'T-27'];
  assert.deepEqual(cellFor('T-25: T-67 · T-27: T-16', 'T-27', group), { text: 'T-16', guessed: false });
  assert.deepEqual(cellFor('team-spec-reviewer (T-25); team-reviewer (T-27)', 'T-25', group), { text: 'team-spec-reviewer', guessed: false });
  assert.deepEqual(cellFor('`a/**` · `b/**`', 'T-27', group), { text: '`b/**`', guessed: true });
  assert.deepEqual(cellFor('T-24 → T-25 → T-27', 'T-27', group), { text: 'T-25', guessed: true });
  assert.deepEqual(cellFor('AC-1, AC-2', 'T-27', group), { text: 'AC-1, AC-2', guessed: false });
  assert.deepEqual(cellFor('anything', 'T-1', ['T-1']), { text: 'anything', guessed: false });
});

test('owned globs: backtick spans outside asides; prose or a set-aside span is unsure (#8)', () => {
  // rule D: text outside the spans is a doubt, the spans beside it are kept
  assert.deepEqual(globsOf('the closure record, `<session>/terminal.md`, `<session>/runtime/**`'), { globs: ['<session>/terminal.md', '<session>/runtime/**'], unsure: true });
  assert.deepEqual(globsOf('`<session>/terminal.md`, `<session>/runtime/**`; `a/**` · `b/**`'), { globs: ['<session>/terminal.md', '<session>/runtime/**', 'a/**', 'b/**'], unsure: false });
  assert.deepEqual(globsOf('`a/**`; its own Mac `mktemp -d` dir `$T`'), { globs: ['a/**'], unsure: true });
  assert.deepEqual(globsOf('`$ABS_SESSION/out/**`'), { globs: ['$ABS_SESSION/out/**'], unsure: false });
  assert.deepEqual(globsOf('`src/main.rs` (all under `backend-rs/`)'), { globs: ['src/main.rs'], unsure: true });
  assert.deepEqual(globsOf('src/a.ts and more'), { globs: ['src/a.ts'], unsure: true });
  assert.deepEqual(globsOf('none'), { globs: [], unsure: false });
});

test('a type cell that names HITL anywhere is HITL (#6)', () => {
  assert.equal(typeOf('AFK (HITL for the deploy step)'), 'HITL');
  assert.equal(typeOf('not AFK — HITL'), 'HITL');
  assert.equal(typeOf('AFK'), 'AFK');
  assert.equal(typeOf('see notes'), null);
  const graph = projectText({ text: plan([task({ id: 'T-1', type: 'AFK (fix) → HITL push' })]) });
  assert.deepEqual(graph.hitl, ['T-1']);
});

test('unprojected headings and duplicate ids are partial (#1, #2)', () => {
  const mid = projectText({ text: plan([task({ id: 'T-1' }), '### T-2 listed\n\n- Phase: 1\n- Agent: coder-b\n\n', task({ id: 'T-3' })]) });
  assert.deepEqual(mid.tasks.map((t) => t.id), ['T-1', 'T-3']);
  assert.match(doubts(mid, 'T-2')[0], /heading has no field table — not projected/);
  const dup = projectText({ text: plan([task({ id: 'T-1' }), task({ id: 'T-1', title: 'again' })]) });
  assert.match(doubts(dup, 'T-1').join('\n'), /projected 2 times/);
  const dotted = projectText({ text: plan([task({ id: 'T-1.1' }), task({ id: 'T-1.2', blockedBy: 'T-1.1' })]) });
  assert.deepEqual(dotted.tasks.map((t) => [t.id, t.deps]), [['T-1.1', []], ['T-1.2', ['T-1.1']]]);
  assert.deepEqual(partials(dotted), []);
  const container = projectText({ text: plan(['## T-1 group\n\nintro\n\n', task({ id: 'T-1-a' })]) });
  assert.deepEqual(partials(container), []);
});

test('a blockedBy that names something but resolves to nothing is partial (#4)', () => {
  for (const cell of ['X-7', 'T2', 't-9', 'after the freeze']) {
    const graph = projectText({ text: plan([task({ id: 'T-1' }), task({ id: 'T-2', blockedBy: cell })]) });
    assert.deepEqual(graph.tasks[1].deps, [], cell);
    assert.equal(doubts(graph, 'T-2').length, 1, cell);
  }
});

test('conditional, aside, prose and templated dependencies are partial (#8)', () => {
  const cases = [
    ['T-1 (if green)', [], /conditional/],
    ['T-1 when ready', [], /conditional/],
    ['T-1 (lane order: runs before T-3)', ['T-1'], /only in an aside/],
    ['T-1; re-run after any correction or after T-3', ['T-1', 'T-3'], /inside prose/],
    ['T-1 and (m > 1) T-2-R<m−1>a', ['T-1'], /previous-iteration/],
  ];
  for (const [cell, deps, why] of cases) {
    const graph = projectText({ text: plan([task({ id: 'T-1' }), task({ id: 'T-2', blockedBy: cell }), task({ id: 'T-3', blockedBy: 'T-2' })]) });
    assert.deepEqual(graph.tasks[1].deps, deps, cell);
    assert.match(doubts(graph, 'T-2').join('\n'), why, cell);
  }
  const plainRange = projectText({ text: plan([task({ id: 'T-1' }), task({ id: 'T-2' }), task({ id: 'T-3', blockedBy: 'T-1..T-2' })]) });
  assert.deepEqual([plainRange.tasks[2].deps, partials(plainRange)], [['T-1', 'T-2'], []]);
});

test('requirements: asides do not map, unset is empty, non-AC prose is partial (#5, #7)', () => {
  const graph = projectText({
    text: plan([
      task({ id: 'T-1', requirement: 'AC-1 (AC-2 is out of scope)' }),
      task({ id: 'T-2', requirement: 'TBD' }),
      task({ id: 'T-3', requirement: 'FR-2' }),
      task({ id: 'T-4', requirement: "the DoD's grade-seal-gate row" }),
    ]),
  });
  const [t1, t2, t3, t4] = graph.tasks;
  assert.deepEqual([t1.acs, t2.requirement, t3.acs, t4.acs], [['AC-1'], [], [], []]);
  assert.deepEqual(partials(graph).map((w) => w.split(' — ')[0]), [`${PARTIAL}T-3`]);
});

test('labels and forms real plans use: type / Estimated, sub-id cells, heading asides (#8)', () => {
  const graph = projectText({
    text: plan([
      task({ id: 'T-1', typeLabel: 'type / Estimated', type: 'AFK / 20 min' }),
      task({ id: 'T-2', files: 'T-2.1: `a/**`; T-2.2: `b/**`' }),
      task({ id: 'T-3', title: 'final-grade (substeps T-3-initial, T-3-regrade)' }),
    ]),
  });
  assert.equal(graph.tasks[0].type, 'AFK');
  assert.deepEqual(doubts(graph, 'T-1'), []);
  assert.match(doubts(graph, 'T-2').join('\n'), /split by sub-ids/);
  assert.match(partials(graph).join('\n'), /T-3-initial, T-3-regrade — sub-ids the T-3 heading names/);
});

test('prose that only looks like a task is not one (#11)', () => {
  const graph = projectText({
    text: plan([
      task({ id: 'T-1' }),
      '### T-2 notes\n\n**T-2-a** — Phase 1; Agent coder; blockedBy T-1; Requirement AC-1\n\nBackground: as discussed in **RFC-12** - Agent X; Phase 3; blockedBy T-1\n\n',
      '### Q-1 question about scope\n\nPhase 2. Agent lead. blockedBy none. Requirement AC-1.\n\n',
      '### USB-3 port plan\n\n| Field | Value |\n|---|---|\n| Phase | 1 |\n| Agent | ops |\n| Requirement | AC-1 |\n| blockedBy | none |\n| type | AFK |\n\n',
    ]),
  });
  assert.deepEqual(graph.tasks.map((t) => t.id), ['T-1', 'T-2-a', 'USB-3']);
  assert.match(doubts(graph, 'T-2-a').join('\n'), /names no type/);
  assert.match(doubts(graph, 'USB-3').join('\n'), /may be a name/);
});

test('the shapes real plans use beside the template', () => {
  const text = plan(
    [
      task({ id: 'T-1', title: 'core', bold: false }),
      [
        '### T-2 review',
        '',
        'Two substeps. **T-2-spec** — Phase 2; Agent spec-reviewer; agent_type `team-spec-reviewer`; evidence_producer T-2-spec → `<session>/spec/review.md`; Requirement AC-1; blockedBy T-1; files_owned `<session>/spec/**`; verify `rg -q x; true`; type AFK; Estimated 25 min. **T-2-quality** — Phase 2; Agent reviewer; agent_type `team-reviewer`; evidence_producer T-2-quality → `<session>/rev/review.md`; Requirement as T-2-spec; blockedBy T-2-spec; files_owned `<session>/rev/**`; verify `true`; AFK; 20 min.',
        '',
      ].join('\n'),
      [
        '### T-3 grade-seal-closure',
        '',
        'Phase 3; blockedBy T-2-quality; Agent orchestrator; agent_type none; evidence_producer T-3 → `team-kit-seals/x/GRADE-SEAL.md`; Requirement the grade-seal-gate row; files_owned `team-kit-seals/x/**`; verify `true`. Steps: seal it. Type AFK (no push). Estimated 15 min.',
        '',
      ].join('\n'),
      [
        '### T-4 rows (two substeps)',
        '| ID | Phase | Agent | agent_type | evidence_producer | Requirement | blockedBy | files_owned | verify | type | Estimated |',
        '|---|---|---|---|---|---|---|---|---|---|---|',
        '| T-4-a draft | 4 | planner | team-planner | T-4-a → `A/a.md` | AC-1 | T-3 | `A/a.md` | `true` | AFK | 10 min |',
        '| T-4-b check | 4 | auditor | team-goal-auditor | T-4-b → `A/b.md` | AC-1 | T-4-a | `A/b.md` | `true` | AFK | 10 min |',
        '',
      ].join('\n'),
      task({ id: 'T-5', blockedBy: 'T-4-b, H-1' }),
    ],
    {
      head: ['## Autonomy', '', '```yaml', 'autonomy:', '  loop_caps:', '    review_fix_rounds: 10', '```', ''],
      tail: ['## Human-gated checklist', '', '| Item | Ask |', '|---|---|', '| H-1 | go for the push |', '', '### H-2 switch (type: HITL; user)', '', 'the user switches', ''],
    },
  );
  const graph = projectText({ text, runWatch: '# Run watch\n\n- definition-of-done.md RW-1 — AC-1 / T-2-spec, T-5 — symptom: x\n' });
  const byId = Object.fromEntries(graph.tasks.map((t) => [t.id, t]));
  assert.deepEqual(Object.keys(byId), ['T-1', 'T-2-spec', 'T-2-quality', 'T-3', 'T-4-a', 'T-4-b', 'T-5']);
  assert.deepEqual([byId['T-2-quality'].phase, byId['T-2-quality'].requirement, byId['T-2-quality'].type, byId['T-2-quality'].deps], ['2', ['AC-1'], 'AFK', ['T-2-spec']]);
  assert.equal(byId['T-2-spec'].verify, '`rg -q x; true`');
  assert.equal(byId['T-2-spec'].block, byId['T-2-quality'].block);
  // rule E: a table row is a task with its own line and block
  assert.notEqual(byId['T-4-a'].block, byId['T-4-b'].block);
  assert.equal(text.split('\n')[byId['T-4-b'].line - 1], byId['T-4-b'].block.split('\n')[2]);
  assert.deepEqual([byId['T-3'].type, byId['T-3'].kind, byId['T-3'].deps], ['AFK', 'lead', ['T-2-quality']]);
  assert.deepEqual([byId['T-4-b'].kind, byId['T-4-b'].deps, byId['T-4-b'].filesOwned], ['grade', ['T-4-a'], ['A/b.md']]);
  assert.deepEqual(byId['T-5'].deps, ['T-4-b', 'H-1']);
  assert.deepEqual(graph.humanSteps, ['H-1', 'H-2']);
  assert.equal(graph.autonomy, 'autonomy:\n  loop_caps:\n    review_fix_rounds: 10');
  assert.deepEqual(Object.keys(graph.runWatch), ['T-2-spec', 'T-5']);
  // the substeps and the table rows are certain; the field paragraph is not
  assert.deepEqual(partials(graph).map((w) => w.split(' — ')[0]), [`${PARTIAL}T-3`]);
});

test('an unreadable plan or heading is a warning, never an error', () => {
  const empty = projectText({ text: '# Team Plan\n\nprose only\n' });
  assert.deepEqual(empty.tasks, []);
  assert.match(partials(empty)[0], /no task could be projected/);
  const result = projectSession(session({}));
  assert.equal(result.code, 0);
  assert.match(result.graph.warnings[0], /team-plan.md — missing or unreadable/);
});

test('cli: prints json and writes nothing unless --out is given', () => {
  const dir = session({ 'team-plan.md': BASIC });
  const before = readdirSync(dir);
  const result = cli(dir);
  assert.equal(result.status, 0);
  assert.deepEqual(JSON.parse(result.stdout).tasks.map((t) => t.id), ['T-1', 'T-2', 'T-3']);
  assert.deepEqual(readdirSync(dir), before);
  const out = join(dir, 'runtime', 'run-graph.json');
  const written = cli(dir, '--out', out);
  assert.equal(written.status, 0);
  assert.equal(written.stdout, '');
  assert.equal(JSON.parse(readFileSync(out, 'utf8')).plan.sha256, JSON.parse(result.stdout).plan.sha256);
  assert.equal(cli(session({})).status, 0);
});

test('cli: usage exits 2 and a symlinked entry still runs', () => {
  const dir = session({ 'team-plan.md': BASIC });
  for (const args of [[], ['relative/dir'], [join(dir, 'no-such-dir')], [dir, '--force'], [dir, dir], [dir, '--out']]) {
    const result = cli(...args);
    assert.equal(result.status, 2, args.join(' '));
    assert.equal(result.stdout, '');
    assert.ok(result.stderr.includes(USAGE), result.stderr);
  }
  assert.deepEqual(parseArgs([dir, '--out', '/tmp/x.json']), { sessionDir: dir, opts: { out: '/tmp/x.json' } });
  const link = join(session({}), 'project-plan.mjs');
  symlinkSync(script, link);
  const linked = spawnSync(process.execPath, [link, dir], { encoding: 'utf8' });
  assert.equal(linked.status, 0);
  assert.equal(JSON.parse(linked.stdout).tasks.length, 3);
});

test('a # line inside a code fence is no heading: the block runs to the next task heading (#1, #4)', () => {
  const fenced = task({ id: 'T-1' }).replace('Do the T-1 work.', 'Run:\n\n```sh\n# 6 samples, n = 1..6\n## not a section\necho ok\n```\n\nAbort / rollback: revert.');
  const text = plan([fenced, task({ id: 'T-2', blockedBy: 'T-1' })], { tail: ['## Human-gated checklist', '', '```', '# H-9 not a step', '```', ''] });
  const graph = projectText({ text });
  const [t1, t2] = graph.tasks;
  assert.ok(t1.block.includes('Abort / rollback: revert.'));
  assert.ok(t1.block.includes('#### Acceptance criteria'));
  assert.equal(text.indexOf(t2.block), text.indexOf(t1.block) + t1.block.length);
  assert.deepEqual(graph.humanSteps, []);
  assert.deepEqual(partials(graph), []);
  const cut = projectText({ text: plan([task({ id: 'T-1' }).replace('Do the T-1 work.', '```sh\nnever closed')]) });
  assert.match(doubts(cut, 'T-1').join('\n'), /cuts through a code fence/);
});

test('a type cell naming both AFK and HITL is HITL with a doubt (#7)', () => {
  const graph = projectText({ text: plan([task({ id: 'T-1', type: 'AFK (HITL for the deploy step)' })]) });
  assert.deepEqual(graph.hitl, ['T-1']);
  assert.match(doubts(graph, 'T-1').join('\n'), /names both AFK and HITL/);
});

test('an AC a task names but definition-of-done.md does not list is a doubt (#8)', () => {
  const dod = '| id | kind | blocking |\n|---|---|---|\n| AC-1 a | deterministic | true |\n';
  const graph = projectText({ text: plan([task({ id: 'T-1', requirement: 'AC-1, AC-2' })]), dod });
  assert.match(doubts(graph, 'T-1').join('\n'), /names AC-2, which definition-of-done.md does not list/);
  assert.deepEqual(partials(projectText({ text: plan([task({ id: 'T-1' })]), dod })), []);
});

test('a shared-cell column splits by position; a Requirement stated outside the table is a doubt, not a gap', () => {
  const text = plan([
    task({ id: 'T-1' }),
    [
      '### T-2 review-plan-contract',
      'Each row is an owned substep; `type: AFK`, requirements AC-1–4 for every row.',
      '| ID | Phase / task_name / agent_type | blockedBy | files_owned | type / Estimated |',
      '|---|---|---|---|---|',
      '| T-2-critique stress | review / design-critic / team-design-critic | T-1 | `S/c.md` | AFK / 20 min |',
      '| T-2-define contract | review / contract-author | T-2-critique | `S/d.md` | AFK |',
      '',
    ].join('\n'),
  ]);
  const graph = projectText({ text });
  const [, critique, define] = graph.tasks;
  assert.deepEqual([critique.id, critique.phase, critique.agentType, critique.type, critique.estimated], ['T-2-critique', 'review', 'team-design-critic', 'AFK', '20 min']);
  assert.match(doubts(graph, 'T-2-critique').join('\n'), /Requirement is written outside a Requirement field/);
  assert.match(doubts(graph, 'T-2-define').join('\n'), /phase shares a cell with other fields/);
  assert.equal(define.type, 'AFK');
});

// gate-1 hardening: rules A to L of gate1-hardening/design.md, each case an inline plan

const ROW_HEAD = ['| ID | Phase | Agent | agent_type | evidence_producer | Requirement | blockedBy | files_owned | verify | type | Estimated |', '|---|---|---|---|---|---|---|---|---|---|---|'];
const row = ({ id, phase = '1', agent = 'coder-a', agentType = '`team-coder`', requirement = 'AC-1', blockedBy = 'none', files = '`src/a/**`', type = 'AFK' }) =>
  `| ${id} | ${phase} | ${agent} | ${agentType} | ${id.split(' ')[0]} → \`out/${agent}.md\` | ${requirement} | ${blockedBy} | ${files} | \`true\` | ${type} | 10 min |`;
// the field table of a task without its heading line
const tableOf = (opts) => task(opts).split('\n').slice(1).join('\n');
const ids = (graph) => graph.tasks.map((t) => t.id);
const byId = (graph, id) => graph.tasks.find((t) => t.id === id);

test('rule E: a row of a task table is one task: its line, a block of header, delimiter and row, its phase', () => {
  const text = plan([
    ['### P1 — build', '', ...ROW_HEAD, row({ id: 'T-1 first' }), row({ id: 'T-2 second', agent: 'coder-b', blockedBy: 'T-1', files: '`src/b/**`' }), ''].join('\n'),
    ['## Phase 2 — close', '', '### Wave A', '', '| ID | Agent | agent_type | evidence_producer | Requirement | blockedBy | files_owned | verify | type | Est. |', '|---|---|---|---|---|---|---|---|---|---|', '| T-3 third | coder-c | `team-coder` | T-3 → `out/c.md` | AC-1 | T-2 | `src/c/**` | `true` | AFK | 10 min |', ''].join('\n'),
    ['### P3 — grade', '', '| ID | Agent / agent_type | evidence_producer | Requirement | blockedBy | files_owned | verify | type | Est. |', '|---|---|---|---|---|---|---|---|---|', '| G-1 grade | orchestrator / none | G-1 → `out/g.md` | AC-1 | T-3 | `out/g.md` | `true` | AFK | 5 min |', ''].join('\n'),
  ]);
  const graph = projectText({ text });
  assert.deepEqual(ids(graph), ['T-1', 'T-2', 'T-3', 'G-1']);
  assert.deepEqual(partials(graph), []);
  const lines = text.split('\n');
  for (const t of graph.tasks) {
    const [header, rule, own, rest] = t.block.split('\n');
    assert.equal(lines[t.line - 1], own, t.id);
    assert.ok(own.startsWith(`| ${t.id} `) && rest === '', t.id);
    assert.ok(lines.includes(header) && header.startsWith('| ID |') && /^\|-/.test(rule), t.id);
  }
  assert.equal(new Set(graph.tasks.map((t) => t.block)).size, 4);
  assert.equal(new Set(graph.tasks.map((t) => t.line)).size, 4);
  // a Phase column, else the enclosing phase heading: `## Phase 2 — close` over `### Wave A`, `### P3 — grade`
  assert.deepEqual(graph.tasks.map((t) => t.phase), ['1', '1', '2', 'P3']);
  assert.deepEqual(graph.phases, ['1', '2', 'P3']);
  assert.deepEqual([byId(graph, 'T-1').slug, byId(graph, 'T-3').estimated, byId(graph, 'G-1').agentType, byId(graph, 'G-1').kind, byId(graph, 'G-1').agent], ['first', '10 min', 'none', 'lead', 'orchestrator']);
  // a block is three lines of the plan and nothing more, so the graph grows with the rows, not with rows times table
  assert.deepEqual(graph.tasks.map((t) => t.block.length), graph.tasks.map((t) => [0, 1, 2].reduce((n, k) => n + t.block.split('\n')[k].length + 1, 0)));
  const crlf = text.replace(/\n/g, '\r\n');
  for (const t of projectText({ text: crlf }).tasks) for (const line of t.block.split('\n').slice(0, 3)) assert.ok(line.endsWith('\r') && crlf.includes(`${line}\n`), t.id);
});

test('rule E: a task table projects wherever it stands (fx 111, 114, 115)', () => {
  const noId = projectText({ text: plan([['### Build tasks', '', ...ROW_HEAD, row({ id: 'T-1 first' }), row({ id: 'T-2 second', blockedBy: 'T-1', files: '`src/b/**`' }), ''].join('\n')]) });
  assert.deepEqual([ids(noId), partials(noId)], [['T-1', 'T-2'], []]);
  const two = projectText({ text: plan([['### P1 — build', '', ...ROW_HEAD, row({ id: 'T-1 first' }), '', 'Reviews:', '', ...ROW_HEAD, row({ id: 'T-2 review', blockedBy: 'T-1', files: '`review/**`' }), ''].join('\n')]) });
  assert.deepEqual([ids(two), partials(two)], [['T-1', 'T-2'], []]);
  const under = projectText({ text: plan([task({ id: 'T-1' }), ['Sub-steps of T-1:', '', ...ROW_HEAD, row({ id: 'T-1a spec-review', blockedBy: 'T-1', files: '`review/spec.md`' }), row({ id: 'T-1b quality-review', blockedBy: 'T-1a', files: '`review/q.md`' }), ''].join('\n'), task({ id: 'T-3', blockedBy: 'T-1b' })]) });
  assert.deepEqual([ids(under), partials(under)], [['T-1', 'T-1a', 'T-1b', 'T-3'], []]);
  assert.deepEqual(byId(under, 'T-3').deps, ['T-1b']);
});

test('rule A: a row that names no single task is named in a warning, never skipped (fx 112, 113, 116)', () => {
  const table = (second) => plan([['### P1 — build', '', ...ROW_HEAD, row({ id: 'T-1 first' }), second, row({ id: 'T-3 third', blockedBy: 'T-2', files: '`src/c/**`' }), ''].join('\n')]);
  for (const [cell, why] of [['2 review', /names no id at its start/], ['Task T-2 review', /names no id at its start/], ['T-2, T-2b pair', /names several ids \(T-2, T-2b\)/]]) {
    const graph = projectText({ text: table(row({ id: cell })) });
    assert.deepEqual(ids(graph), ['T-1', 'T-3'], cell);
    const named = partials(graph).filter((w) => /^partial: team-plan\.md:\d+ — .* — row not projected: "/.test(w));
    assert.equal(named.length, 1, cell);
    assert.match(named[0], why, cell);
    assert.ok(named[0].includes(`"${cell}`), cell);
  }
  // an id the unread row names is declared: a dependency on it is a doubt, never an unknown id
  assert.match(doubts(projectText({ text: table(row({ id: 'Task T-2 review' })) }), 'T-3').join('\n'), /names T-2, which the plan names but does not project/);
  const stray = projectText({ text: table(row({ id: 'T-2 second' }).replace('| `true` |', '| pnpm test | tee log |')) });
  assert.deepEqual(ids(stray), ['T-1', 'T-2', 'T-3']);
  assert.match(doubts(stray, 'T-2').join('\n'), /its row has 12 cells for 11 columns/);
});

test('rule A: a task heading in a form that is not read is named, with the field table it leaves behind (F2)', () => {
  const body = tableOf({ id: 'T-2', blockedBy: 'T-1', files: '`src/b/**`' });
  const wrapped = (prefix, first) => [first, ...body.split('\n').map((line) => (prefix + line).trimEnd())].join('\n') + '\n';
  const forms = {
    '###### T-2 review': null,
    'T-2 review\n----------': null,
    ' ### T-2 review': null,
    '### Task T-2: review': null,
    '### `T-2` review': null,
    '### [x] T-2 review': null,
    '### 2. T-2 review': null,
    '### T-2) review': null,
    '### t-2 review': null,
    '### T-2a/T-2b review pair': null,
    '> ### T-2 review': wrapped('> ', '> ### T-2 review'),
    '- ### T-2 review': wrapped('  ', '- ### T-2 review'),
  };
  for (const [heading, block] of Object.entries(forms)) {
    const graph = projectText({ text: plan([task({ id: 'T-1' }), block ?? `${heading}\n${body}`, task({ id: 'T-3', blockedBy: 'T-1', files: '`src/c/**`' })]) });
    assert.deepEqual(ids(graph), ['T-1', 'T-3'], heading);
    assert.ok(partials(graph).some((w) => /field table under (its|no task) heading|second field table under its heading/.test(w) && /not projected/.test(w)), `${heading}: ${partials(graph).join(' | ')}`);
    if (!/t-2/.test(heading)) assert.ok(partials(graph).some((w) => /^partial: T-2\S*(?:, T-2\S*)* — named in a heading but not projected/.test(w)), `${heading}: ${partials(graph).join(' | ')}`);
  }
  // several ids in a form that reads only the first: the others are named
  for (const [heading, lost] of [['### T-2, T-2b review pair', 'T-2b'], ['### T-2..T-4 three reviewers', 'T-3, T-4']]) {
    const graph = projectText({ text: plan([task({ id: 'T-1' }), `${heading}\n${body}`]) });
    assert.deepEqual(ids(graph), ['T-1', 'T-2'], heading);
    assert.deepEqual(partials(graph).map((w) => w.split(' — ')[0]), [`${PARTIAL}${lost}`], heading);
  }
  const h6 = projectText({ text: plan([task({ id: 'T-1' }), `###### T-2 review\n${body}`]) });
  assert.match(partials(h6).join('\n'), /partial: T-1 — a second field table under its heading is not projected \(team-plan\.md:\d+\)/);
  const lower = projectText({ text: plan([task({ id: 'T-1' }), `### t-2 review\n${body}`]) });
  assert.match(partials(lower).join('\n'), /partial: team-plan\.md:\d+ — field table under no task heading — not projected/);
  // controls: the forms gate 1 reads stay certain
  for (const heading of ['## T-2 review', '##### T-2 review', '### **T-2** review', '### T-2: Review']) {
    const graph = projectText({ text: plan([task({ id: 'T-1' }), `${heading}\n${body}`]) });
    assert.deepEqual([ids(graph), partials(graph)], [['T-1', 'T-2'], []], heading);
  }
});

test('rule A: a second table under a task heading is named; prose substeps under a field table are tasks (F5)', () => {
  const second = tableOf({ id: 'T-2', agentType: '`team-coder`', blockedBy: 'T-1, T-3', files: '`src/c/**`', type: 'HITL' });
  const two = projectText({ text: plan([task({ id: 'T-1' }), `${task({ id: 'T-2', agentType: '`team-reviewer`', blockedBy: 'T-1', files: '`review/**`' })}Branch else:\n${second}`, task({ id: 'T-3', files: '`src/c/**`' })]) });
  assert.deepEqual([byId(two, 'T-2').agentType, byId(two, 'T-2').type, byId(two, 'T-2').deps], ['team-reviewer', 'AFK', ['T-1']]);
  assert.deepEqual(partials(two).map((w) => w.replace(/\d+\)$/, 'N)')), [`${PARTIAL}T-2 — a second field table under its heading is not projected (team-plan.md:N)`]);
  const substeps = [
    '**T-1-spec** — Phase 1; Agent spec-reviewer; agent_type team-spec-reviewer; evidence_producer T-1-spec → `review/spec.md`; blockedBy T-1; Requirement AC-1; files_owned `review/spec.md`; verify `true`; type AFK; Estimated 10 min',
    '',
    '**T-1-quality** — Phase 1; Agent reviewer; agent_type team-reviewer; evidence_producer T-1-quality → `review/q.md`; blockedBy T-1-spec; Requirement AC-1; files_owned `review/q.md`; verify `true`; type AFK; Estimated 10 min',
    '',
  ].join('\n');
  const underTable = projectText({ text: plan([task({ id: 'T-1' }) + substeps, task({ id: 'T-3', blockedBy: 'T-1-quality', files: '`src/c/**`' })]) });
  assert.deepEqual([ids(underTable), partials(underTable)], [['T-1', 'T-1-spec', 'T-1-quality', 'T-3'], []]);
  assert.deepEqual([byId(underTable, 'T-1-quality').deps, byId(underTable, 'T-1-quality').kind], [['T-1-spec'], 'review']);
  // a data-model table above the task's own field table is no field table (fx 43)
  const model = projectText({ text: plan([`### T-1 store\n\n| Field | Type | Notes |\n|---|---|---|\n| id | string | key |\n| type | enum | kind of row |\n\n${tableOf({ id: 'T-1' })}`]) });
  assert.deepEqual([ids(model), model.tasks[0].type, model.tasks[0].phase, partials(model)], [['T-1'], 'AFK', '1', []]);
  // a task-family id in the id cell of a table that is no task table is a task, or it is named
  const cells = projectText({ text: plan([task({ id: 'T-1' }), '| Substep | Evidence |\n|---|---|\n| T-1.1 capture | `out/a` |\n| T-1.2 compare | `out/b` |\n']) });
  assert.deepEqual(partials(cells).map((w) => w.replace(/\d+\)$/, 'N)')), [`${PARTIAL}T-1.1, T-1.2 — named in an id cell but not projected (team-plan.md:N)`]);
  // a task table with no id column: a second one under a task heading, or one under a heading that names no task,
  // is named; a roster (no blockedBy, Requirement or files_owned column) is no task table
  const idless = ['| Phase | Agent | agent_type | Requirement | blockedBy | files_owned |', '|---|---|---|---|---|---|', '| 1 | coder-b | team-coder | AC-1 | none | `src/b/**` |', ''].join('\n');
  const again = projectText({ text: plan([task({ id: 'T-1' }) + idless]) });
  assert.deepEqual(partials(again).map((w) => w.replace(/\d+\)$/, 'N)')), [`${PARTIAL}T-1 — a second task table under its heading is not projected (team-plan.md:N)`]);
  const orphan = projectText({ text: plan([task({ id: 'T-1' }), `### Extra work\n\n${idless}`]) });
  assert.deepEqual(partials(orphan).map((w) => w.split(' — ').slice(1).join(' — ')), ['task table under no task heading — not projected']);
  const roster = projectText({ text: plan([task({ id: 'T-1' })], { head: ['## Team', '', '| Agent | agent_type | Model | Role | Phase |', '|---|---|---|---|---|', '| coder-a | team-coder | sonnet | builds | 1 |', ''] }) });
  assert.deepEqual(partials(roster), []);
  // a task a table row projects, described again under a heading of its own: that text is in no block
  const described = projectText({ text: plan([['### Build tasks', '', ...ROW_HEAD, row({ id: 'T-1 first' }), ''].join('\n'), '### T-1 first\n\nSteps for the coder.\n']) });
  assert.deepEqual([ids(described), partials(described).map((w) => w.replace(/\d+\)$/, 'N)'))], [['T-1'], [`${PARTIAL}T-1 — its heading has no field table: the text under it is in no block (team-plan.md:N)`]]);
});

test('rule A: an id a heading names at any place is a task, a human step, or the group of its sub-ids', () => {
  const sub = task({ id: 'T-1-a' });
  for (const [heading, named] of [['## T-1 group', null], ['## §4 T-1 prepare-contract', null], ['T-1 group\n---------', null], ['### §4 T-1 prepare-contract', 'T-1'], ['### Reviewer (T-1-a, T-9-review)', 'T-9-review'], ['# Plan for T-7 and T-1-a', 'T-7']]) {
    const graph = projectText({ text: [heading, '', 'intro', '', sub].join('\n') });
    assert.deepEqual(ids(graph), ['T-1-a'], heading);
    assert.deepEqual(partials(graph).map((w) => w.replace(/\(team-plan\.md:\d+\)/, '(L)')), named ? [`${PARTIAL}${named} — named in a heading but not projected (L)`] : [], heading);
  }
});

test('rule B: only the human-gated checklist declares human steps, and a projected task is never one (F1)', () => {
  const noTable = '### T-2 report-review\n\nReview everything T-1 wrote, by hand.\n\n';
  const titled = projectText({ text: plan([task({ id: 'T-1' }), `## Phase 2 — human-readable report\n\n${noTable}`, task({ id: 'T-3', phase: '2', blockedBy: 'T-2', files: '`src/c/**`' })]) });
  assert.deepEqual([ids(titled), titled.humanSteps], [['T-1', 'T-3'], []]);
  assert.match(doubts(titled, 'T-2').join('\n'), /heading has no field table — not projected/);
  assert.match(doubts(titled, 'T-3').join('\n'), /names T-2, which the plan names but does not project/);
  const bare = (head) => [...head, task({ id: 'T-1' }), noTable, task({ id: 'T-3', blockedBy: 'T-2', files: '`src/c/**`' })].join('\n');
  for (const head of [['# Team Plan: human review queue', ''], ['---', 'name: fx', '# human gates: none', '---', '']]) {
    const graph = projectText({ text: bare(head) });
    assert.deepEqual(graph.humanSteps, [], head[0]);
    assert.match(doubts(graph, 'T-2').join('\n'), /not projected/, head[0]);
  }
  const changelog = projectText({ text: plan([task({ id: 'T-1' }), task({ id: 'T-3', blockedBy: 'T-9', files: '`src/c/**`' })], { tail: ['## Human-readable changelog', '', '| Item | Note |', '|---|---|', '| T-9 | dropped in revision 2 |', ''] }) });
  assert.deepEqual(changelog.humanSteps, []);
  assert.equal(doubts(changelog, 'T-3').length, 1);
  const checklist = projectText({
    text: plan([task({ id: 'T-1', blockedBy: 'H-1, H-2' })], { tail: ['## 9. Human-gated checklist (HITL)', '', task({ id: 'H-1', agentType: 'none — human (HITL)', files: 'none', type: 'HITL' }), '| Item | Ask |', '|---|---|', '| H-2 | go for the push |', ''] }),
  });
  assert.deepEqual([ids(checklist), checklist.humanSteps, byId(checklist, 'T-1').deps, partials(checklist)], [['T-1', 'H-1'], ['H-2'], ['H-1', 'H-2'], []]);
});

test('rule C: an agent_type cell names exactly one agent or a lead marker; anything else is a doubt (F3)', () => {
  const known = new Set(ROSTER);
  const certain = [
    ['`team-coder`', 'team-coder', 'code'],
    ['team-verifier (sonnet / medium)', 'team-verifier', 'verify'],
    ['`team-goal-auditor` (explicit `grade` phase, fresh context)', 'team-goal-auditor', 'grade'],
    ['default', 'default', 'other'],
    ['Explore', 'Explore', 'other'],
    ['researcher', 'researcher', 'other'],
    ['none', 'none', 'lead'],
    ['none — human (HITL)', 'none', 'lead'],
    ['— (HITL)', 'none', 'lead'],
    ['Orchestrator', 'orchestrator', 'lead'],
    ['Lead session (not dispatched)', 'lead', 'lead'],
    ['— not dispatched (human)', 'human', 'lead'],
    ['(run lead, in-session)', 'lead', 'lead'],
    ['in-session orchestrator (no dispatch)', 'in-session', 'lead'],
    ['orchestrator (in-session seam)', 'orchestrator', 'lead'],
    ['none — in-session HITL checklist (not dispatched)', 'none', 'lead'],
    ["none — HITL, lead's own session, never dispatched", 'none', 'lead'],
    ["— not dispatched (main session after the human's recorded go)", 'human', 'lead'],
    ['— (lead-executed, D-15)', 'none', 'lead'],
  ];
  for (const [cell, agentType, kind] of certain) {
    const graph = projectText({ text: plan([task({ id: 'T-1', agentType: cell })]), roster: ROSTER });
    assert.deepEqual([graph.tasks[0].agentType, graph.tasks[0].kind, partials(graph)], [agentType, kind, []], cell);
  }
  const doubted = [
    ['team-codr', 'team-codr', 'other', /names team-codr, which is no agent definition/],
    ['persona', 'persona', 'other', /names persona, which is no agent definition/],
    ['constructor', 'constructor', 'other', /no agent definition/],
    ['in-session orchestrator; T-10c `team-verifier` (native seam dispatch)', 'in-session', 'lead', /names team-verifier beside a lead marker/],
    ['none + `team-verifier`', 'none', 'lead', /beside a lead marker/],
    ['`team-spec-reviewer` → `team-reviewer`', 'team-spec-reviewer', 'review', /names several agents \(team-spec-reviewer, team-reviewer\)/],
    ['default model via team-coder', 'default', 'other', /names several agents/],
    ['team-coder for the fix', 'team-coder', 'code', /holds prose beside team-coder/],
    ['persona · orchestrator · grade (opus / xhigh)', 'orchestrator', 'lead', /names no single agent/],
    ['as named per substep (E1..E7)', 'as', 'other', /names no single agent/],
    // a lead word inside an aside, negated or beside a name that is no definition is no certain lead step (RC-5, RS-3)
    ['persona-reviewer (reports to lead)', 'persona-reviewer', 'other', /names persona-reviewer beside a lead marker \(lead\)/],
    ['codex (no human)', 'codex', 'other', /names codex beside a lead marker \(human\)/],
    ['codex-worker (not the lead)', 'codex-worker', 'other', /names codex-worker beside a lead marker \(lead\)/],
    ['fresh subagent — never the orchestrator', 'orchestrator', 'lead', /names no single agent/],
    ['custom-agent, none of the team ones', 'none', 'lead', /names no single agent/],
  ];
  for (const [cell, agentType, kind, why] of doubted) {
    const graph = projectText({ text: plan([task({ id: 'T-1', agentType: cell })]), roster: ROSTER });
    assert.deepEqual([graph.tasks[0].agentType, graph.tasks[0].kind], [agentType, kind], cell);
    assert.ok(Object.hasOwn(graph.tasks[0], 'kind') && KINDS.includes(graph.tasks[0].kind), cell);
    assert.equal(doubts(graph, 'T-1').length, 1, cell);
    assert.match(doubts(graph, 'T-1')[0], why, cell);
    assert.match(doubts(graph, 'T-1')[0], /agent_type/, cell);
  }
  // no roster found: only the shape is checked
  assert.deepEqual(partials(projectText({ text: plan([task({ id: 'T-1', agentType: 'team-codr' })]) })), []);
  for (const cell of ['team-codr', 'persona', 'constructor']) assert.deepEqual(agentOf(cell), { agentType: cell, why: null });
  // a name beside a lead word is a doubt whatever the roster holds
  assert.deepEqual(agentOf('codex (no human)'), { agentType: 'codex', why: 'names codex beside a lead marker (human)' });
  for (const [cell, agentType] of certain) assert.deepEqual(agentOf(cell, known), { agentType, why: null }, cell);
  // the roster is the nearest .claude/agents above the session
  const root = session({ '.claude/agents/team-coder.md': '# coder\n', '.claude/agents/notes.txt': 'x', 'team-session/fx/team-plan.md': plan([task({ id: 'T-1', agentType: 'team-codr' }), task({ id: 'T-2' })]) });
  assert.deepEqual(rosterOf(join(root, 'team-session', 'fx')), ['team-coder']);
  const found = projectSession(join(root, 'team-session', 'fx')).graph;
  assert.deepEqual(partials(found).map((w) => w.split(' — ')[0]), [`${PARTIAL}T-1`]);
  assert.deepEqual(partials(projectSession(join(root, 'team-session', 'fx'), { roster: null }).graph), []);
});

test('rule D: a mandatory field the task lacks is a doubt on that field; an explicit none is a value (F6)', () => {
  const drop = (text, ...labels) => text.split('\n').filter((line) => !labels.some((label) => line.startsWith(`| **${label}** `))).join('\n');
  const missing = projectText({ text: plan([drop(task({ id: 'T-1' }), 'Phase', 'agent_type', 'files_owned')]) });
  assert.deepEqual(doubts(missing, 'T-1'), [`${PARTIAL}T-1 — it has no Phase, agent_type, files_owned field`]);
  assert.deepEqual([missing.tasks[0].phase, missing.tasks[0].agentType, missing.tasks[0].filesOwned], [null, null, []]);
  const others = projectText({ text: plan([drop(task({ id: 'T-1' }), 'Agent', 'evidence_producer', 'verify', 'Estimated')]) });
  assert.deepEqual(doubts(others, 'T-1'), [`${PARTIAL}T-1 — it has no Agent, evidence_producer, verify, Estimated field`]);
  // no Requirement or type field at all is a doubt; the unset value of one stays the check's defect
  const bareTask = projectText({ text: plan([drop(task({ id: 'T-1', requirement: 'R-1' }), 'Requirement', 'type')]) });
  assert.deepEqual(doubts(bareTask, 'T-1'), [`${PARTIAL}T-1 — it has no Requirement, type field`]);
  assert.deepEqual(partials(projectText({ text: plan([task({ id: 'T-1', requirement: 'TBD', type: 'see notes' })]) })), []);
  // labels that are no field name read as missing fields (fx 46); a blank line cuts the table (fx 44)
  const camel = projectText({ text: plan([task({ id: 'T-1' }).replace('**agent_type**', 'agentType').replace('**files_owned**', 'filesOwned')]) });
  assert.deepEqual(doubts(camel, 'T-1'), [`${PARTIAL}T-1 — it has no agent_type, files_owned field`]);
  const cut = projectText({ text: plan([task({ id: 'T-1' }).replace('| **files_owned**', '\n| **files_owned**')]) });
  assert.deepEqual(doubts(cut, 'T-1').map((w) => w.split(' — ')[1]).sort(), ['4 field row(s) outside any table', 'it has no files_owned, verify, Estimated field', 'the type is written outside a type field']);
  assert.deepEqual(partials(projectText({ text: plan([task({ id: 'T-1', files: 'none', blockedBy: 'none' }).replace('`pnpm -F "@x/a" test`', 'none')]) })), []);
  assert.match(doubts(projectText({ text: plan([task({ id: 'T-1', files: '' })]) }), 'T-1').join('\n'), /it has no files_owned field/);
  // the gpu-broker form: fields on a prose line under a one-row table are named, never dropped (S-8)
  const prose = ['### T-4 broker-enforcement', '| Phase | Agent | agent_type | type | Est | blockedBy | Requirement |', '|---|---|---|---|---|---|---|', '| 1 | coder-broker | team-coder | AFK | 30 min | none | AC-1 |', '', 'files_owned: `src/a.py`, `tests/test_a.py` · evidence_producer: `coder-broker/progress.md` · verify: `UT-broker`', '', 'Admission as design.md.', ''].join('\n');
  const broker = projectText({ text: plan([prose]) });
  assert.deepEqual([ids(broker), broker.tasks[0].estimated, broker.tasks[0].filesOwned, broker.tasks[0].verify], [['T-4'], '30 min', [], null]);
  assert.deepEqual(doubts(broker, 'T-4'), [`${PARTIAL}T-4 — its evidence_producer, files_owned, verify is written on a prose line, outside the table`]);
  // a field the table states and a prose line states again is a doubt: the line is not read
  const twice = projectText({ text: plan([task({ id: 'T-1' }).replace('Do the T-1 work.', 'blockedBy: T-9 · files_owned: `src/z/**`')]) });
  assert.deepEqual(doubts(twice, 'T-1'), [`${PARTIAL}T-1 — its files_owned, blockedBy is written in the table and again on a prose line`]);
  assert.deepEqual([twice.tasks[0].deps, twice.tasks[0].filesOwned], [[], ['src/a/**']]);
});

test('rule D: files_owned: text outside the spans is a doubt, a backticked path may hold spaces (F6, S-11, R-8)', () => {
  const cases = [
    ['`src/a.ts` and src/shared.ts, plus its test file', ['src/a.ts'], true],
    ['`src/**` except `src/legacy/**`', ['src/**', 'src/legacy/**'], true],
    ['`a/**` (see `b/**`)', ['a/**'], true],
    ['git commits on `main` only', ['main'], true],
    ['Ryzen `…/runs/T1-*/**`', ['…/runs/T1-*/**'], true],
    ['none — writes `x/**`', [], true],
    ['`~/Library/Application Support/lancedb-kb/**`', ['~/Library/Application Support/lancedb-kb/**'], false],
    ['`src/a.ts src/b.ts`', [], true],
    ['`out/x.md · out/y.md`', [], true],
    ['`a/**`, `b/**`; `c/**` · `d/**`<br>`e/**`', ['a/**', 'b/**', 'c/**', 'd/**', 'e/**'], false],
    ['none (read-only)', [], false],
    ['—', [], false],
    ['n/a.', [], false],
    // none and then a path, a span that reads as two paths, a negated glob (RS-6, RC-9, RC-14)
    ['none, except src/b/x.ts', [], true],
    ['none in the repo', [], true],
    ['`src/x.ts,src/t1.ts`', [], true],
    ['`pkg/a src/t1/**`', [], true],
    ['`src/**`, `!src/t1.ts`', ['src/**'], true],
    ['`src/{a,b}/{c,d}.ts`', ['src/{a,b}/{c,d}.ts'], false],
    ['``src/a.ts`` ```src/b.ts```', ['src/a.ts', 'src/b.ts'], false],
    ['`src/a.ts` ``', ['src/a.ts'], true],
  ];
  for (const [cell, globs, unsure] of cases) assert.deepEqual(globsOf(cell), { globs, unsure }, cell);
  // a long run of backticks is scanned once (RS-13)
  assert.deepEqual(globsOf('`'.repeat(200000) + 'src/a.ts`'), { globs: ['src/a.ts'], unsure: true });
});

test('rule G: a fence closes only on its own character, at least as long, with no info string; html comments are skipped (F7)', () => {
  const tick = '```';
  const nested = task({ id: 'T-1' }).replace('Do the T-1 work.', ['Coder prompt:', '', tick + '`markdown', 'Run this:', tick + 'bash', '# install deps', 'pnpm i', tick, tick + '`', '', 'Abort / rollback: revert. ROLLBACK-MARKER'].join('\n'));
  const wrapped = projectText({ text: plan([nested, task({ id: 'T-2', blockedBy: 'T-1' })]) });
  assert.deepEqual([ids(wrapped), partials(wrapped)], [['T-1', 'T-2'], []]);
  assert.ok(wrapped.tasks[0].block.includes('ROLLBACK-MARKER') && wrapped.tasks[0].block.includes('#### Acceptance criteria'));
  const example = [tick + '`markdown', tick + 'markdown', task({ id: 'T-99', files: '`example/x.ts`' }), tick, tick + '`'].join('\n');
  const phantom = projectText({ text: plan([task({ id: 'T-1' }).replace('Do the T-1 work.', `Plan format example:\n\n${example}\n\nEnd of T-1.`), task({ id: 'T-2', blockedBy: 'T-1' })]) });
  assert.deepEqual([ids(phantom), partials(phantom)], [['T-1', 'T-2'], []]);
  const tilde = projectText({ text: plan([task({ id: 'T-1' }).replace('Do the T-1 work.', ['~~~sh', '# comment', '### T-7 fake', tick, 'echo', '~~~', '', 'TAIL-MARKER'].join('\n')), task({ id: 'T-2', blockedBy: 'T-1' })]) });
  assert.deepEqual([ids(tilde), partials(tilde)], [['T-1', 'T-2'], []]);
  assert.ok(tilde.tasks[0].block.includes('TAIL-MARKER'));
  const inline = projectText({ text: plan([task({ id: 'T-1' }).replace('Do the T-1 work.', tick + 'pnpm test' + tick + ' must pass before review.'), task({ id: 'T-2', blockedBy: 'T-1' })]) });
  assert.deepEqual([ids(inline), partials(inline)], [['T-1', 'T-2'], []]);
  const commented = projectText({ text: plan([task({ id: 'T-1' }), `<!--\n${task({ id: 'T-9', files: '`src/z/**`' })}-->\n`, '<!-- ### T-8 dropped -->\n', task({ id: 'T-2', blockedBy: 'T-1' }), 'A `<!--` in a code span opens nothing.\n', task({ id: 'T-3', blockedBy: 'T-2' })]) });
  assert.deepEqual([ids(commented), partials(commented)], [['T-1', 'T-2', 'T-3'], []]);
  // a fence or a comment that never closes swallows what follows it: named, never an OK on the tasks before it
  for (const [opener, what] of [[tick + 'sh\necho', 'code fence'], ['<!-- dropped for now', 'html comment']]) {
    const open = projectText({ text: plan([task({ id: 'T-1' }), `## Notes\n\n${opener}\n`, task({ id: 'T-2', blockedBy: 'T-1' })]) });
    assert.deepEqual(ids(open), ['T-1'], what);
    assert.deepEqual(partials(open).map((w) => w.replace(/md:\d+/, 'md:N')), [`${PARTIAL}team-plan.md — a ${what} opened at team-plan.md:N never closes — what follows it is not projected`], what);
  }
  assert.deepEqual([...fenceScan([tick + tick[0] + 'markdown', tick + 'bash', '# c', tick, tick + tick[0], 'after']).inside], [0, 1, 2, 3, 4]);
  assert.deepEqual([...fenceScan(['~~~', tick, '# c', '~~~~', 'after']).inside], [0, 1, 2, 3]);
  assert.deepEqual([fenceScan([tick + 'sh', tick + 'yaml', 'x']).open, fenceScan([tick + 'pnpm test' + tick + ' must pass', '# h']).inside.size], [true, 0]);
});

test('rule F: no heading crashes the projector; id-prefix parsing is total (F8)', () => {
  assert.deepEqual(['QA.1', 'TA<m>-1', 'T-3g', 'T1', 'USB-3', 'T-3.quality', 'X'].map(prefixOf), ['QA', 'TA', 'T-', 'T', 'USB-', 'T-', 'X']);
  for (const id of ['QA.1', 'TA<m>-1']) {
    const text = plan([task({ id: 'T-1' }), task({ id, title: 'smoke-review', blockedBy: 'T-1' })]);
    const graph = projectText({ text });
    assert.deepEqual(ids(graph), ['T-1', id]);
    const run = cli(session({ 'team-plan.md': text }));
    assert.deepEqual([run.status, run.stderr, JSON.parse(run.stdout).tasks.length], [0, '', 2], id);
  }
  // an error of the script itself is a partial projection with the message, never a throw
  const dir = session({ 'team-plan.md': BASIC });
  const broken = projectSession(dir, { roster: { [Symbol.iterator]: () => { throw new Error('boom'); } } });
  assert.equal(broken.code, 0);
  assert.deepEqual([broken.graph.tasks, broken.graph.warnings, broken.graph.schema], [[], [`${PARTIAL}team-plan.md — internal error: boom`], SCHEMA]);
  assert.match(broken.graph.plan.sha256, /^[0-9a-f]{64}$/);
});

test('rule H: a dotted substep id is an id where the plan declares it; a file name is not (R-7, S-4)', () => {
  const dotted = projectText({ text: plan([task({ id: 'T-1' }), task({ id: 'T-1.spec', title: 'spec-review', agentType: 'team-spec-reviewer', blockedBy: 'T-1', files: '`reviews/spec-T-1.md`' }), task({ id: 'T-2', blockedBy: 'T-1.spec, T-1 (after `runs/T-1.json` exists)', files: '`src/b/**`' })]), runWatch: '- RW-1 — T-1.spec — symptom: x\n- RW-2 — `runs/T-1.json` — symptom: y\n' });
  assert.deepEqual([ids(dotted), byId(dotted, 'T-2').deps, byId(dotted, 'T-1.spec').deps, partials(dotted)], [['T-1', 'T-1.spec', 'T-2'], ['T-1.spec', 'T-1'], ['T-1'], []]);
  assert.deepEqual(Object.keys(dotted.runWatch), ['T-1.spec', 'T-1']);
  const letter = projectText({ text: plan([task({ id: 'T-1.a' }), task({ id: 'T-2', blockedBy: 'T-1.a', files: '`src/b/**`' })]) });
  assert.deepEqual([ids(letter), letter.tasks[1].deps, partials(letter)], [['T-1.a', 'T-2'], ['T-1.a'], []]);
  // a dotted id the plan declares nowhere reads as its task plus prose: a doubt, never an unknown id
  const undeclared = projectText({ text: plan([task({ id: 'T-1' }), task({ id: 'T-2', blockedBy: 'T-1.quality', files: '`src/b/**`' })]) });
  assert.deepEqual(undeclared.tasks[1].deps, ['T-1']);
  assert.match(doubts(undeclared, 'T-2').join('\n'), /names T-1 inside prose, read as deps/);
  assert.deepEqual(idsIn('T-3.quality, T-3.md and T-4.spec', (id) => id === 'T-3.quality'), ['T-3.quality', 'T-3', 'T-4']);
  assert.deepEqual(idsIn('T-3.quality, runs/T-3.json'), ['T-3', 'T-3']);
  assert.deepEqual([idAtStart('T-14.spec (covers T-10..T-14)'), idAtStart('T-2..T-4 three'), idAtStart('T-1. Title'), idAtStart('T-1.a first'), idAtStart('T-3.spec.md'), idAtStart('t-2')], ['T-14.spec', 'T-2', 'T-1', 'T-1.a', 'T-3', null]);
});

test('rule H: a blockedBy cell that starts with none and then names an id is a doubt (F10); a hyphen range too (fx 71)', () => {
  for (const cell of ['None — once T-1 has merged', 'n/a until T-1 lands', 'none (after T-1)', 'none; runtime operations after T-1-contract']) {
    const graph = projectText({ text: plan([task({ id: 'T-1' }), task({ id: 'T-2', blockedBy: cell, files: '`src/b/**`' })]) });
    assert.deepEqual(graph.tasks[1].deps, [], cell);
    assert.equal(doubts(graph, 'T-2').length, 1, cell);
    assert.match(doubts(graph, 'T-2')[0], /blockedBy starts with none and then names T-1/, cell);
  }
  for (const cell of ['none', 'None', 'n/a', '—', '-', 'none (first task)']) assert.deepEqual(partials(projectText({ text: plan([task({ id: 'T-1' }), task({ id: 'T-2', blockedBy: cell, files: '`src/b/**`' })]) })), [], cell);
  assert.match(doubts(projectText({ text: plan([task({ id: 'T-1', blockedBy: '' })]) }), 'T-1').join('\n'), /it has no blockedBy field/);
  const ranged = projectText({ text: plan([task({ id: 'T-1' }), task({ id: 'T-2', files: '`b/**`' }), task({ id: 'T-3', files: '`c/**`' }), task({ id: 'T-4', blockedBy: 'T-1-T-3', files: '`d/**`' })]) });
  assert.match(doubts(ranged, 'T-4').join('\n'), /blockedBy names T-1-T-3, which reads as a range or as a sub-id/);
});

const SUBSTEP_HEAD = ['### Review substeps (every implementation task)', '', '| Substep | agent_type | blockedBy | files_owned | verify |', '|---|---|---|---|---|'];
const REVIEWED = [task({ id: 'T-2' }), task({ id: 'T-3', blockedBy: 'T-2.quality', files: '`src/b/**`' }), task({ id: 'T-4', blockedBy: 'T-3.quality', files: '`src/c/**`' })];

test('rule I: a template row over a stated set expands to one task per member, the variable substituted in every cell', () => {
  const rows = [
    '| T-n.spec, n ∈ {2, 3} | `team-spec-reviewer` | T-n | `out/spec-review-T-<n>.md` | `rg -q CLEAN out/spec-review-T-n.md` |',
    '| T-n.quality, same n | `team-reviewer` | T-n.spec | `out/review-T-n.md` | `tail -n 1 out/review-T-n.md` |',
    '| T-9.spec (covers T-2..T-3) | `team-spec-reviewer` | T-3.quality | `out/spec-review-T-9.md` | as above |',
  ];
  const text = plan([...REVIEWED, [...SUBSTEP_HEAD, ...rows, ''].join('\n')]);
  const graph = projectText({ text, roster: ROSTER });
  assert.deepEqual(ids(graph), ['T-2', 'T-3', 'T-4', 'T-2.spec', 'T-3.spec', 'T-2.quality', 'T-3.quality', 'T-9.spec']);
  const [spec2, spec3, quality2, quality3] = ['T-2.spec', 'T-3.spec', 'T-2.quality', 'T-3.quality'].map((id) => byId(graph, id));
  assert.deepEqual([spec2.deps, spec3.deps, quality2.deps, quality3.deps], [['T-2'], ['T-3'], ['T-2.spec'], ['T-3.spec']]);
  assert.deepEqual([spec2.filesOwned, spec3.verify, quality2.verify, quality3.filesOwned], [['out/spec-review-T-2.md'], '`rg -q CLEAN out/spec-review-T-3.md`', '`tail -n 1 out/review-T-2.md`', ['out/review-T-3.md']]);
  assert.deepEqual([spec2.agentType, spec2.kind, quality3.agentType, spec2.title, spec2.slug], ['team-spec-reviewer', 'review', 'team-reviewer', null, null]);
  // the block is the header, the delimiter and the template row as written; the members share its line
  assert.equal(spec2.block, spec3.block);
  assert.deepEqual(spec2.block.split('\n'), [SUBSTEP_HEAD[2], SUBSTEP_HEAD[3], rows[0], '']);
  assert.deepEqual([spec2.line, quality2.line], [spec3.line, quality3.line]);
  assert.equal(text.split('\n')[quality2.line - 1], rows[1]);
  // the dotted ids resolve, so the plan's own dependencies stand without a doubt
  assert.deepEqual([byId(graph, 'T-3').deps, byId(graph, 'T-4').deps, doubts(graph, 'T-3'), doubts(graph, 'T-4')], [['T-2.quality'], ['T-3.quality'], [], []]);
  // R-4: a substep takes Phase, Requirement, type and Estimated from its task and owes one owner; what it still
  // owes is doubted in one line per row, never a defect. T-9.spec has no task T-9: it owes every field
  assert.deepEqual([spec2.phase, spec2.requirement, spec2.acs, spec2.type, spec2.estimated, spec2.agent], ['1', ['AC-1'], ['AC-1'], 'AFK', '20 min', null]);
  const lacks = 'it has no Phase, Agent, evidence_producer, Requirement, type, Estimated field';
  assert.deepEqual(partials(graph), [`${PARTIAL}T-2.spec, T-3.spec — it has no evidence_producer field`, `${PARTIAL}T-2.quality, T-3.quality — it has no evidence_producer field`, `${PARTIAL}T-9.spec — its verify cell refers to another row ("as above")`, `${PARTIAL}T-9.spec — ${lacks}`]);
});

test('rule I: a template row in any other form is named in a warning, and its ids are doubts, never unknown', () => {
  const refused = {
    'T-n.spec, n ∈ {2, 3} and each fired T-Rn': /template in a form that is not read/,
    'T-n.spec, n ∈ {2..3}': /template over a set that is not read/,
    'T-n.spec, n ∈ {a, b}': /template over a set that is not read/,
    'T-n.spec, n ∈ {2, 2}': /template over a set that is not read/,
    'T-n.spec for n in 2, 3': /template in a form that is not read/,
    'T-n.spec, m ∈ {2, 3}': /template in a form that is not read/,
    'T-n.spec, same n': /template over a set that is not read/,
    'T-R{n}-spec': /template in a form that is not read/,
    'T-2.spec, T-3.spec (both)': /names several ids \(T-2\.spec, T-3\.spec\)/,
  };
  for (const [cell, why] of Object.entries(refused)) {
    const text = plan([...REVIEWED, [...SUBSTEP_HEAD, `| ${cell} | \`team-spec-reviewer\` | T-n | \`out/spec-T-n.md\` | \`true\` |`, '| T-n.quality, same n | `team-reviewer` | T-n.spec | `out/review-T-n.md` | `true` |', ''].join('\n')]);
    const graph = projectText({ text });
    assert.deepEqual(ids(graph), ['T-2', 'T-3', 'T-4'], cell);
    const named = partials(graph).filter((w) => /^partial: team-plan\.md:\d+ — .* — row not projected: "/.test(w));
    assert.equal(named.length, 2, `${cell}: ${partials(graph).join(' | ')}`);
    assert.match(named[0], why, cell);
    assert.match(named[1], /T-n\.quality, same n/, cell);
    // T-3 waits on T-2.quality, which the refused rows would have named
    assert.match(doubts(graph, 'T-3').join('\n'), /names T-2\.quality, which the plan names but does not project|names T-2 inside prose/, cell);
  }
});

test('rule J: a deeper heading ends a task block only when it projects as a task (F11)', () => {
  const sub = task({ id: 'T-1' }) + ['#### E2E checks', '', 'Run the e2e suite. E2E-MARKER', '', '#### S3 upload', '', 'Abort / rollback: delete the object. ROLLBACK-MARKER', '', ''].join('\n');
  const text = plan([sub, task({ id: 'T-2', blockedBy: 'T-1', files: '`src/b/**`' })]);
  const graph = projectText({ text });
  assert.deepEqual([ids(graph), partials(graph)], [['T-1', 'T-2'], []]);
  assert.ok(graph.tasks[0].block.includes('E2E-MARKER') && graph.tasks[0].block.trimEnd().endsWith('ROLLBACK-MARKER'));
  assert.equal(text.indexOf(graph.tasks[1].block), text.indexOf(graph.tasks[0].block) + graph.tasks[0].block.length);
  // a deeper heading that is a task of its own still ends the block
  const nested = projectText({ text: plan([task({ id: 'T-1' }) + task({ id: 'T-1a', blockedBy: 'T-1', files: '`src/b/**`' }).replace('### T-1a', '#### T-1a')]) });
  assert.deepEqual([ids(nested), nested.tasks[0].block.includes('#### T-1a'), partials(nested)], [['T-1', 'T-1a'], false, []]);
});

test('rule K, R-1: autonomy is the frontmatter key, else the one block of the body, fenced or not; an unclosed frontmatter is a doubt (F13)', () => {
  const tick = '```';
  const fence = (mode) => ['## Autonomy', '', tick + 'yaml', 'autonomy:', `  mode: ${mode}`, '  direct_human_gates: [push]', tick, ''];
  const real = ['## autonomy', '', 'autonomy:', '  mode: gated', '  direct_human_gates: [push]', ''];
  // the one block of the plan is taken where 36 of 52 real plans write it: inside a code fence
  const fenced = projectText({ text: plan([task({ id: 'T-1' })], { head: fence('gated') }) });
  assert.deepEqual([fenced.autonomy, partials(fenced)], ['autonomy:\n  mode: gated\n  direct_human_gates: [push]', []]);
  // two blocks outside the frontmatter, one of them fenced, are no certain reading
  const both = projectText({ text: plan([task({ id: 'T-1' })], { head: [...fence('full-auto-example'), ...real] }) });
  assert.deepEqual(partials(both).map((w) => w.replace(/md:\d+/g, 'md:N')), [`${PARTIAL}team-plan.md — autonomy is written 2 times in the body (team-plan.md:N, team-plan.md:N) — the first is taken`]);
  // the frontmatter key is taken; a fenced block that says the same is no doubt, one that differs is
  const front = (mode) => ['---', 'name: fx', 'latitude:', '  scope: narrow', 'autonomy:', '  mode: gated', '  direct_human_gates: [push]', '---', '', ...fence(mode), task({ id: 'T-1' })].join('\n');
  const fromFront = projectText({ text: front('gated') });
  assert.deepEqual([fromFront.autonomy, fromFront.latitude, partials(fromFront)], ['autonomy:\n  mode: gated\n  direct_human_gates: [push]', 'latitude:\n  scope: narrow', []]);
  const differs = projectText({ text: front('full-auto') });
  assert.deepEqual([differs.autonomy, partials(differs).map((w) => w.replace(/md:\d+/, 'md:N'))], ['autonomy:\n  mode: gated\n  direct_human_gates: [push]', [`${PARTIAL}team-plan.md — autonomy is written in the frontmatter and again, differently, in the body (team-plan.md:N) — the frontmatter is taken`]]);
  // two keys in the frontmatter that differ (V2-13); the same key twice states nothing new
  const twice = (second) => projectText({ text: ['---', 'name: fx', 'autonomy:', '  mode: gated', 'latitude:', '  scope: narrow', 'autonomy:', `  mode: ${second}`, '---', '', task({ id: 'T-1' })].join('\n') });
  assert.deepEqual([twice('full-auto').autonomy, partials(twice('full-auto'))], ['autonomy:\n  mode: gated', [`${PARTIAL}team-plan.md — autonomy is written twice in the frontmatter, differently (team-plan.md:7) — the first is taken`]]);
  assert.deepEqual(partials(twice('gated')), []);
  // a block inside an html comment is none
  const commented = projectText({ text: plan([task({ id: 'T-1' })], { head: ['<!--', 'autonomy:', '  mode: old', '-->', '', ...real] }) });
  assert.deepEqual([commented.autonomy, partials(commented)], ['autonomy:\n  mode: gated\n  direct_human_gates: [push]', []]);
  const unclosed = projectText({ text: ['---', 'name: fx', 'latitude:', '  scope: narrow', '', '# Team Plan: fx', '', '## Tasks', '', task({ id: 'T-1' })].join('\n') });
  assert.deepEqual([ids(unclosed), unclosed.latitude], [['T-1'], null]);
  assert.deepEqual(partials(unclosed), [`${PARTIAL}team-plan.md — its frontmatter opens and does not close — latitude and autonomy are not taken from it`]);
  // a byte-order mark hides neither the frontmatter nor the first heading (fx 31, 32)
  const marked = projectText({ text: `\uFEFF${BASIC}` });
  assert.deepEqual([ids(marked), marked.latitude, partials(marked)], [['T-1', 'T-2', 'T-3'], 'latitude:\n  coder-a:\n    open: helper layout', []]);
  const first = projectText({ text: `\uFEFF${task({ id: 'T-1' })}${task({ id: 'T-2', blockedBy: 'T-1' })}` });
  assert.deepEqual([ids(first), first.tasks[1].deps, first.tasks[0].block.startsWith('\uFEFF### T-1'), partials(first)], [['T-1', 'T-2'], ['T-1'], true, []]);
});

// fix round 1: the findings of the three reviews of the hardening build (RC-, RS-, RR- ids), each case an inline plan

const ROWS = [row({ id: 'T-1 first' }), row({ id: 'T-2 second', blockedBy: 'T-1', files: '`src/b/**`' }), row({ id: 'T-3 third', blockedBy: 'T-2', files: '`src/c/**`' })];
const lineOf = (text, line) => `team-plan.md:${text.split('\n').indexOf(line) + 1}`;

test('rule A: a row cut off its table is named, never dropped (RC-1, RS-1)', () => {
  const cut = {
    'a blank line': [...ROW_HEAD, ROWS[0], ROWS[1], '', ROWS[2]],
    'a prose line': [...ROW_HEAD, ROWS[0], ROWS[1], 'Added late:', ROWS[2]],
    'a commented-out row': [...ROW_HEAD, ROWS[0], ROWS[1], `<!-- ${row({ id: 'T-9 dropped' })} -->`, ROWS[2]],
  };
  for (const [what, lines] of Object.entries(cut)) {
    const text = plan([['### P1 — build', '', ...lines, ''].join('\n')]);
    const graph = projectText({ text });
    assert.deepEqual(ids(graph), ['T-1', 'T-2'], what);
    assert.deepEqual(partials(graph), [`${PARTIAL}${lineOf(text, ROWS[2])} — a table row outside any table — row not projected: "T-3 third"`], what);
  }
  // a header with no delimiter row, and a table written without its leading pipes, are no table: each row is named
  const open = (line) => line.replace(/^\| ?/, '').replace(/ ?\|$/, '');
  const unread = { 'no delimiter row': [ROW_HEAD[0], ROWS[1], ROWS[2]], 'no leading pipes': [open(ROW_HEAD[0]), open(ROW_HEAD[1]), open(ROWS[1]), open(ROWS[2])] };
  for (const [what, lines] of Object.entries(unread)) {
    const graph = projectText({ text: plan([task({ id: 'T-1' }), ['### P2 — review', '', ...lines, ''].join('\n')]) });
    assert.deepEqual(ids(graph), ['T-1'], what);
    assert.deepEqual(partials(graph).map((w) => w.replace(/md:\d+/, 'md:N')), ['T-2 second', 'T-3 third'].map((cell) => `${PARTIAL}team-plan.md:N — a table row outside any table — row not projected: "${cell}"`), what);
  }
  // a template row cut off its table is a row in no task too
  const template = projectText({ text: plan([...REVIEWED, [...SUBSTEP_HEAD, '', '| T-n.spec, n ∈ {2, 3} | `team-spec-reviewer` | T-n | `out/spec-T-n.md` | `true` |', ''].join('\n')]) });
  assert.ok(partials(template).some((w) => /^partial: team-plan\.md:\d+ — a table row outside any table — row not projected: "T-n\.spec, n ∈ \{2, 3\}"$/.test(w)), partials(template).join(' | '));
  // a field row cut off its table is named, even when the table above already holds that field
  const again = projectText({ text: plan([task({ id: 'T-1' }).replace('\nDo the T-1 work.', '\n| **files_owned** | `src/z/**` |\n\nDo the T-1 work.')]) });
  assert.deepEqual([again.tasks[0].filesOwned, partials(again).map((w) => w.replace(/md:\d+/, 'md:N'))], [['src/a/**'], [`${PARTIAL}T-1 — 1 field row(s) outside any table — not projected (team-plan.md:N)`]]);
  // controls: a whole table, a row of the human-gated checklist, a rule line
  assert.deepEqual(partials(projectText({ text: plan([['### P1 — build', '', ...ROW_HEAD, ...ROWS, ''].join('\n')], { tail: ['## Human-gated checklist', '', '| Item | Ask |', '|---|---|', '| H-1 | go |', '', '| T-3 | then the human checks T-3 |', '', '|---|---|', ''] }) })), []);
});

test('rule D: text keyed to a row task outside its row is in no block and is named (RR-1)', () => {
  const table = ['### P1 — build', '', ...ROW_HEAD, ...ROWS, ''];
  const keyed = ['T-1 (binding, production): job A runs first. KEYED-MARKER', '- T-2: blockedBy T-1 as well; files_owned also `src/shared.ts`.', '**T-3** — run it twice.'];
  // under the table a sentence that starts with a row id is keyed too; under another heading only a line is
  const sentence = 'Every row is AFK. T-2 also checks the migrations; T-3 the auth.';
  const text = plan([[...table, ...keyed.flatMap((line) => [line, '']), '1. T-3: and once more.', '', sentence, '', '### Notes', '', 'Summary. T-2 ships last.', ''].join('\n')]);
  const graph = projectText({ text });
  assert.deepEqual(ids(graph), ['T-1', 'T-2', 'T-3']);
  assert.ok(text.includes('KEYED-MARKER') && !JSON.stringify(graph.tasks).includes('KEYED-MARKER'));
  const place = (line) => lineOf(text, line);
  // under its table a row id is keyed wherever it stands in a line (`blockedBy T-1 as well`), and a bare AFK there
  // states the type of the rows (V1-3)
  assert.deepEqual(partials(graph), [
    `${PARTIAL}T-1, T-2, T-3 — type is written on a prose line under its table, which is not read (${place(sentence)})`,
    `${PARTIAL}T-1 — text keyed to it stands outside its table row, in no block (${place(keyed[0])}, ${place(keyed[1])})`,
    `${PARTIAL}T-2 — text keyed to it stands outside its table row, in no block (${place(keyed[1])}, ${place(sentence)})`,
    `${PARTIAL}T-3 — text keyed to it stands outside its table row, in no block (${place(keyed[2])}, ${place('1. T-3: and once more.')}, ${place(sentence)})`,
  ]);
  // controls: the table alone, a line inside the block of a heading task. an id inside a sentence under the table
  // is keyed too (V1-3): the line is in no block
  assert.deepEqual(partials(projectText({ text: plan([table.join('\n')]) })), []);
  assert.deepEqual(partials(projectText({ text: plan([[...table, 'Order: after T-1 comes T-2, then T-3.', ''].join('\n')]) })).map((w) => w.split(' — ')[0]), [`${PARTIAL}T-1`, `${PARTIAL}T-2`, `${PARTIAL}T-3`]);
  const inBlock = projectText({ text: plan([table.join('\n'), task({ id: 'T-4', blockedBy: 'T-3', files: '`src/d/**`' }).replace('Do the T-4 work.', 'T-3 hands its output to this task.')]) });
  assert.deepEqual([ids(inBlock), partials(inBlock)], [['T-1', 'T-2', 'T-3', 'T-4'], []]);
  // the members of a template row are row tasks too
  const member = projectText({ text: plan([...REVIEWED, [...SUBSTEP_HEAD, '| T-n.spec, n ∈ {2, 3} | `team-spec-reviewer` | T-n | `out/spec-T-n.md` | `true` |', '', 'T-2.spec also checks the migrations.', ''].join('\n')]), roster: ROSTER });
  assert.match(doubts(member, 'T-2.spec').join('\n'), /text keyed to it stands outside its table row, in no block/);
});

test('rule A, rule I: an id cell that names a range, a second id or a template is named, never read as its first id (RC-2, RS-2)', () => {
  const table = (cell) => plan([['### P1 — build', '', ...ROW_HEAD, ROWS[0], row({ id: cell, blockedBy: 'T-1', files: '`src/b/**`' }), ''].join('\n')]);
  const several = {
    'T-2..T-4 build': 'T-2, T-3, T-4',
    'T-2 – T-4': 'T-2, T-3, T-4',
    'T-2 to T-4': 'T-2, T-4',
    'T-2 to 4': 'T-2, a range',
    'T-2 T-3': 'T-2, T-3',
    'T-2<br>T-3': 'T-2, T-3',
    'T-2 → T-2v': 'T-2, T-2v',
    'T-2, RV-2': 'T-2, RV-2',
    'T-2 / RV-2': 'T-2, RV-2',
  };
  for (const [cell, named] of Object.entries(several)) {
    const graph = projectText({ text: table(cell) });
    assert.deepEqual(ids(graph), ['T-1'], cell);
    assert.equal(partials(graph).length, 1, `${cell}: ${partials(graph).join(' | ')}`);
    assert.ok(partials(graph)[0].includes(`its id cell names several ids (${named}) — row not projected`), `${cell}: ${partials(graph)[0]}`);
  }
  for (const cell of ['T-Rn.fix, n ∈ {1, 2}', 'T-N.spec, N ∈ {1, 2}', 'T-2.spec, same n']) {
    const graph = projectText({ text: table(cell) });
    assert.deepEqual(ids(graph), ['T-1'], cell);
    assert.deepEqual(partials(graph).map((w) => w.split(' — ')[1]), ['its id cell is a template in a form that is not read'], cell);
  }
  // controls: a title, an aside, a dotted id and an AC in the title stay one task
  for (const cell of ['T-2 second', 'T-2 second (covers T-3..T-5)', 'T-2.spec review', 'T-2 proof of AC-3']) {
    const graph = projectText({ text: table(cell) });
    assert.deepEqual([ids(graph).length, partials(graph)], [2, []], cell);
  }
});

test('rule D: a field written more than once is a doubt on that field, the first value stays (RC-3, RS-5)', () => {
  const second = (after, line) => task({ id: 'T-2', blockedBy: 'T-1', files: '`src/b/**`' }).replace(new RegExp(`(\\| \\*\\*${after}\\*\\* [^\\n]*\\n)`), `$1${line}\n`);
  const cases = [
    ['Estimated', '| **files_owned** | `src/a/**` |', 'files_owned'],
    ['files_owned', '| | `src/a/**` |', 'files_owned'],
    ['Estimated', '| **blockedBy** | T-3 |', 'blockedBy'],
    ['Phase', '| **Requirement** | AC-9 |', 'Requirement'],
  ];
  for (const [after, line, field] of cases) {
    const graph = projectText({ text: plan([task({ id: 'T-1' }), second(after, line), task({ id: 'T-3', files: '`src/c/**`' })]) });
    assert.deepEqual([byId(graph, 'T-2').filesOwned, byId(graph, 'T-2').deps, byId(graph, 'T-2').acs], [['src/b/**'], ['T-1'], field === 'Requirement' ? ['AC-9'] : ['AC-1']], line);
    assert.deepEqual(partials(graph), [`${PARTIAL}T-2 — its ${field} is written more than once: only the first is read`], line);
  }
  // the same value written twice states nothing new
  assert.deepEqual(partials(projectText({ text: plan([task({ id: 'T-1' }), second('Estimated', '| **blockedBy** | T-1 |')]) })), []);
  // two columns of a task table with one label, and a label met twice in a prose substep
  const head = ROW_HEAD.map((line, k) => line.replace(k ? /^\|---/ : '| blockedBy |', k ? '|---|---' : '| blockedBy | blockedBy |'));
  const columns = projectText({ text: plan([['### P1 — build', '', ...head, ROWS[0].replace('| none |', '| none | none |'), ROWS[1].replace('| T-1 |', '| none | T-1 |'), ''].join('\n')]) });
  assert.deepEqual([byId(columns, 'T-2').deps, partials(columns)], [[], [`${PARTIAL}T-2 — its blockedBy is written more than once: only the first is read`]]);
  const prose = '**T-1-spec** — Phase 1; Agent rev; agent_type team-reviewer; evidence_producer T-1-spec → `r.md`; blockedBy T-1; blockedBy T-9; Requirement AC-1; files_owned `r.md`; verify `true`; type AFK; Estimated 5 min\n\n';
  assert.deepEqual(partials(projectText({ text: plan([task({ id: 'T-1' }) + prose]) })), [`${PARTIAL}T-1-spec — its blockedBy is written more than once: only the first is read`]);
});

test('rule A: a table that holds tasks under another label, in a compact form or beside the field table is read or named (RC-4, RS-9, RC-21)', () => {
  // the id column under another label: the rows are the tasks, never the phase heading above them
  for (const label of ['Task ID', 'Task name', '#']) {
    const head = ROW_HEAD.map((line) => line.replace('| ID |', `| ${label} |`));
    const graph = projectText({ text: plan([task({ id: 'T-1' }), ['### P2 — more', '', ...head, row({ id: 'T-9 extra', phase: '2', blockedBy: 'T-1', files: '`src/c/**`' }), ''].join('\n')]) });
    assert.deepEqual([ids(graph), byId(graph, 'T-9').phase, byId(graph, 'T-9').deps, partials(graph)], [['T-1', 'T-9'], '2', ['T-1'], []], label);
  }
  // a table of fields whose first cells start with task ids is no roster: its rows project, with their doubts
  const rosterLike = projectText({ text: plan([task({ id: 'T-1' }), ['### Phase 2 follow-ups', '', '| Task name | Phase | Agent | agent_type | evidence_producer | verify | type | Estimated |', '|---|---|---|---|---|---|---|---|', '| T-2 review the parser | 2 | rev | `team-reviewer` | self | `true` | AFK | 5 min |', ''].join('\n')]) });
  assert.deepEqual([ids(rosterLike), doubts(rosterLike, 'T-2').map((w) => w.split(' — ')[1])], [['T-1', 'T-2'], ['it has no Requirement, files_owned field', 'it has no blockedBy field']]);
  // a phase heading over a one-row table with no id column names no task P1
  const phaseHead = projectText({ text: plan([task({ id: 'T-1' }), ['### P1 — build', '', '| Phase | Agent | agent_type | type | Est | blockedBy | Requirement |', '|---|---|---|---|---|---|---|', '| 1 | coder-b | team-coder | AFK | 30 min | none | AC-1 |', ''].join('\n')]) });
  assert.deepEqual([ids(phaseHead), partials(phaseHead).map((w) => w.split(' — ').slice(1).join(' — '))], [['T-1'], ['task table under no task heading — not projected']]);
  // a list of numbered steps is no task table: nothing to name
  const steps = projectText({ text: plan([task({ id: 'T-1' })], { tail: ['## Rollback', '', '| Step | Agent | verify | type |', '|---|---|---|---|', '| 1 | lead | `git status` | manual |', '| 2 | lead | `git revert` | manual |', ''] }) });
  assert.deepEqual(partials(steps), []);
  // template rows in a table with fewer than three fields are named. an Owner column is a field (R-4), read as the
  // agent_type of a substep (R-4a): with it the same rows are read
  const compact = (owner) => projectText({ text: plan([...REVIEWED, ['### Review substeps', '', `| Substep |${owner ? ' Owner |' : ''} blockedBy | verify |`, `|---|${owner ? '---|' : ''}---|---|`, `| T-n.spec, n ∈ {2, 3} |${owner ? ' spec reviewer |' : ''} T-n | \`true\` |`, `| T-n.quality, same n |${owner ? ' reviewer |' : ''} T-n.spec | \`true\` |`, ''].join('\n')]) });
  assert.ok(partials(compact(false)).some((w) => /^partial: T-n\.spec, T-n\.quality — template\(s\) named in an id cell but not projected \(team-plan\.md:\d+\)$/.test(w)), partials(compact(false)).join(' | '));
  assert.deepEqual([ids(compact(true)).slice(3), byId(compact(true), 'T-2.spec').agent, partials(compact(true))], [['T-2.spec', 'T-3.spec', 'T-2.quality', 'T-3.quality'], 'spec reviewer', [`${PARTIAL}T-2.spec, T-3.spec — its Owner cell, read as its agent_type, names no single agent`, `${PARTIAL}T-2.spec, T-3.spec — it has no evidence_producer field`, `${PARTIAL}T-2.quality, T-3.quality — it has no evidence_producer field`]]);
  // R-5a: under an `Id pattern` column the rows are id patterns the plan declares, outside the graph with no line
  const pattern = projectText({ text: plan([task({ id: 'T-1' })], { tail: ['## Repair template', '', '| Step | Id pattern | Agent / `agent_type` | Content |', '|---|---|---|---|', '| collect | `T-R{n}-collect` | orchestrator (HITL) | captures |', '| fix | `T-R{n}-fix` | owning coder / `team-coder` | the fix |', ''] }) });
  assert.deepEqual([ids(pattern), partials(pattern)], [['T-1'], []]);
  // a template whose members are tasks is expanded: naming it again in another table is no doubt
  const expanded = [...SUBSTEP_HEAD, '| T-n.spec, n ∈ {2, 3} | `team-spec-reviewer` | T-n | `out/spec-T-n.md` | `true` |', '', '| Substep | Evidence |', '|---|---|', '| T-n.spec | `out/spec-T-n.md` |', ''].join('\n');
  assert.ok(!partials(projectText({ text: plan([...REVIEWED, expanded]) })).some((w) => /template\(s\)/.test(w)));
  // a heading that is a template no task expands, over a table with no id column
  const heading = projectText({ text: plan([task({ id: 'T-1' }), ['### T-n.spec, n ∈ {1, 2}', '', '| Phase | Agent | agent_type | evidence_producer | verify | type | Estimated |', '|---|---|---|---|---|---|---|', '| 1 | rev | `team-spec-reviewer` | self | `true` | AFK | 5 min |', ''].join('\n')]) });
  assert.deepEqual(partials(heading).map((w) => w.replace(/md:\d+/, 'md:N')), [`${PARTIAL}T-n.spec — named in a heading but not projected (team-plan.md:N)`]);
  // a second field table with a column past its values is a field table all the same
  const notes = ['Branch if G-3 fires:', '', '| Field | Value | Notes |', '|---|---|---|', '| blockedBy | T-1, T-3 | waits on T-3 too |', '| type | HITL | human step |', ''].join('\n');
  const second = projectText({ text: plan([task({ id: 'T-1' }), task({ id: 'T-2', blockedBy: 'T-1', files: '`src/b/**`' }) + notes]) });
  assert.deepEqual([byId(second, 'T-2').deps, byId(second, 'T-2').type, partials(second).map((w) => w.replace(/\d+\)$/, 'N)'))], [['T-1'], 'AFK', [`${PARTIAL}T-2 — a second field table under its heading is not projected (team-plan.md:N)`]]);
});

test('rule A: a heading over rows is a group only for rows that are its own ids or sub-ids; a table with no row names no task (RS-4)', () => {
  // the group heading the confirmed plans write, with an intro and a checklist of its own, stays no task and no doubt
  const grouped = ['### T-4 rows', '', 'Each row is an owned substep.', '', ...ROW_HEAD, row({ id: 'T-4-a draft', blockedBy: 'T-1' }), row({ id: 'T-4-b check', blockedBy: 'T-4-a', files: '`src/b/**`' }), '- [ ] every finding has a retained disposition', ''];
  assert.deepEqual(partials(projectText({ text: plan([task({ id: 'T-1' }), grouped.join('\n')]) })), []);
  const named = (lines) => partials(projectText({ text: plan([task({ id: 'T-1' }), lines.join('\n')]) })).map((w) => w.replace(/ \(team-plan\.md:\d+\)$/, ''));
  // rows of another task do not make the heading a group
  assert.deepEqual(named(['### T-7 deploy the thing', '', ...ROW_HEAD, row({ id: 'T-8 extra', blockedBy: 'T-1', files: '`src/c/**`' }), '']), [`${PARTIAL}T-7 — heading has no field table — not projected`]);
  // a task table with a header and no row names no task
  assert.deepEqual(named(['### T-5 extra', '', '| Phase | Agent | agent_type | evidence_producer | verify | type | Estimated |', '|---|---|---|---|---|---|---|', '', 'To be filled in.', '']), [`${PARTIAL}T-5 — heading has no field table — not projected`]);
});

test('rule G: a fence marker inside a comment or an indented code block opens nothing; a fence that holds an opening line is named (RC-6)', () => {
  const tick = '```';
  const fenced = (id, blockedBy) => task({ id, blockedBy }).replace(`Do the ${id} work.`, `Run:\n\n${tick}bash\npnpm test\n${tick}`);
  const inComment = projectText({ text: plan([task({ id: 'T-1' }), `<!--\nold example:\n${tick}\n-->\n`, fenced('T-2', 'T-1'), task({ id: 'T-3', blockedBy: 'T-2' }).replace('Do the T-3 work.', 'Done. <!-- reviewed -->'), task({ id: 'T-4', blockedBy: 'T-3' })]) });
  assert.deepEqual([ids(inComment), partials(inComment)], [['T-1', 'T-2', 'T-3', 'T-4'], []]);
  const indented = projectText({ text: plan([task({ id: 'T-1' }).replace('Do the T-1 work.', `Old syntax (an indented code block, not a fence):\n\n    ${tick}\n    legacy`), fenced('T-2', 'T-1'), task({ id: 'T-3', blockedBy: 'T-2' })]) });
  assert.deepEqual([ids(indented), partials(indented)], [['T-1', 'T-2', 'T-3'], []]);
  // inside a list item an indented marker is a fence: the heading it holds is code
  const listed = projectText({ text: plan([task({ id: 'T-1' }).replace('Do the T-1 work.', `1. run this:\n\n    ${tick}sh\n### T-9 fake\n    ${tick}\n\nEnd.`), task({ id: 'T-2', blockedBy: 'T-1' })]) });
  assert.deepEqual([ids(listed), partials(listed)], [['T-1', 'T-2'], []]);
  // a lone marker swallows the next task up to the closing line of that task's own fenced block: named
  const lone = projectText({ text: plan([task({ id: 'T-1' }).replace('Do the T-1 work.', `Old:\n${tick}\nlegacy`), fenced('T-2', 'T-1'), task({ id: 'T-3', blockedBy: 'T-1' })]) });
  assert.deepEqual(ids(lone), ['T-1', 'T-3']);
  assert.deepEqual(partials(lone).map((w) => w.replace(/md:\d+/g, 'md:N')), [`${PARTIAL}team-plan.md — the code fence opened at team-plan.md:N holds a line that opens a fence of its own (team-plan.md:N) — where it ends is not certain`]);
  assert.deepEqual(fenceScan([tick, tick + 'bash', 'x', tick]).nested, [[0, 1]]);
  assert.deepEqual([fenceScan(['    ' + tick, 'x']).inside.size, fenceScan(['- item', '    ' + tick, 'x']).inside.size, fenceScan(['   ' + tick, 'x']).inside.size], [0, 2, 2]);
});

test('rule E: a phase heading names a number; prose substeps stand each on the line of their own mark (RC-7, RS-7, RS-17)', () => {
  const head = ROW_HEAD.map((line) => line.replace('| Phase ', '').replace(/^\|---/, ''));
  const under = (heading) => projectText({ text: plan([[heading, '', ...head, ROWS[0].replace('| 1 ', ''), ''].join('\n')]) });
  for (const [heading, phase] of [['## Phase 2a — close', '2a'], ['### P3b W3b docs (AFK)', 'P3b'], ['### Phase P1 — entry', 'P1']]) assert.deepEqual([under(heading).tasks[0].phase, partials(under(heading))], [phase, []], heading);
  for (const heading of ['## Phase overview', '### Phase out the legacy API', '## Phase transitions']) assert.deepEqual([under(heading).tasks[0].phase, partials(under(heading))], [null, [`${PARTIAL}T-1 — it has no Phase field`]], heading);
  const substeps = ['**T-1-spec** — Phase 1; Agent spec-reviewer; agent_type team-spec-reviewer; evidence_producer T-1-spec → `review/spec.md`; blockedBy T-1; Requirement AC-1; files_owned `review/shared.md`; verify `true`; type AFK; Estimated 10 min', '', '**T-1-quality** — Phase 1; Agent reviewer; agent_type team-reviewer; evidence_producer T-1-quality → `review/q.md`; blockedBy T-1; Requirement AC-1; files_owned `review/shared.md`; verify `true`; type AFK; Estimated 10 min', ''];
  const text = plan([task({ id: 'T-1' }) + substeps.join('\n')]);
  const graph = projectText({ text });
  assert.deepEqual(ids(graph), ['T-1', 'T-1-spec', 'T-1-quality']);
  for (const id of ['T-1-spec', 'T-1-quality']) assert.ok(text.split('\n')[byId(graph, id).line - 1].startsWith(`**${id}**`), id);
  assert.equal(new Set(graph.tasks.map((t) => t.line)).size, 3);
  assert.equal(byId(graph, 'T-1-spec').block, byId(graph, 'T-1').block);
});

test('rule B: the checklist section is the one whose title starts with the phrase; an id its list item names is declared (RC-10, RS-16, RS-17)', () => {
  const bullets = '### T-2 migrate\n\n- Phase: 2\n- agent_type: team-coder\n- blockedBy: T-1\n\nDo it.\n\n';
  const mention = projectText({ text: plan([task({ id: 'T-1' }), `## Phase 2 — after the human-gated checklist\n\n${bullets}`, task({ id: 'T-3', phase: '2', blockedBy: 'T-2', files: '`src/c/**`' })]) });
  assert.deepEqual([ids(mention), mention.humanSteps], [['T-1', 'T-3'], []]);
  assert.match(doubts(mention, 'T-2').join('\n'), /heading has no field table — not projected/);
  for (const title of ['## Human-gated checklist', '## 6. Human-gated prod checklist (HITL)', '## §10 Human-gated checklist — exact commands', '## 6 Human-gated checklists', '# Human gated checklist (you, in order)']) {
    const graph = projectText({ text: plan([task({ id: 'T-1', blockedBy: 'H-1' })], { tail: [title, '', '| Item | Ask |', '|---|---|', '| H-1 | go for the push |', ''] }) });
    assert.deepEqual([graph.humanSteps, graph.tasks[0].deps, partials(graph)], [['H-1'], ['H-1'], []], title);
  }
  // a step the checklist names in a list item is no human step, yet the plan declares it: a doubt, never unknown
  const listed = projectText({ text: plan([task({ id: 'T-1', blockedBy: 'H-1, H-2' })], { tail: ['## Human-gated checklist', '', '| Item | Ask |', '|---|---|', '| H-2 | go |', '', '- [ ] H-1 — go for the push', ''] }) });
  assert.deepEqual([listed.humanSteps, listed.tasks[0].deps], [['H-2'], ['H-1', 'H-2']]);
  assert.deepEqual(doubts(listed, 'T-1'), [`${PARTIAL}T-1 — blockedBy names H-1, which the plan names but does not project as a task`]);
  assert.ok(projector.declaredIds(['## Human-gated checklist', '', '1. [x] H-7 done', '', '## Notes', '', '- H-8 is not one'].join('\n')).has('H-7'));
  assert.ok(!projector.declaredIds(['## Human-gated checklist', '', '1. [x] H-7 done', '', '## Notes', '', '- H-8 is not one'].join('\n')).has('H-8'));
});

test('rule K, R-1: autonomy is taken from one block of the body: a second block and a line of prose are no certain reading, a line indented under prose is no block (RC-11, RS-17)', () => {
  const real = ['## Contract', '', 'autonomy:', '  mode: gated', ''];
  const example = ['An autonomy block looks like this:', '', '    autonomy:', '      mode: full-auto-example', ''];
  const read = (head) => projectText({ text: plan([task({ id: 'T-1' })], { head }) });
  assert.deepEqual([read([...example, ...real]).autonomy, partials(read([...example, ...real]))], ['autonomy:\n  mode: gated', []]);
  // R-1: the indented lines are no block: the plan states no autonomy, and nothing is in doubt
  assert.deepEqual([read(example).autonomy, partials(read(example))], [null, []]);
  const twice = read([...real, '## Later', '', 'autonomy:', '  mode: full-auto', '']);
  assert.equal(twice.autonomy, 'autonomy:\n  mode: gated');
  assert.deepEqual(partials(twice).map((w) => w.replace(/md:\d+/g, 'md:N')), [`${PARTIAL}team-plan.md — autonomy is written 2 times in the body (team-plan.md:N, team-plan.md:N) — the first is taken`]);
  for (const line of ['autonomy: see design.md, nothing set here', 'autonomy:']) {
    const prose = read(['## Contract', '', line, '', 'The lead decides.', '']);
    assert.deepEqual([prose.autonomy, partials(prose).map((w) => w.replace(/md:\d+/, 'md:N'))], [null, [`${PARTIAL}team-plan.md — autonomy is written as a line of prose, not as a block (team-plan.md:N) — not taken`]], line);
  }
  assert.deepEqual([read(['autonomy: gated', '']).autonomy, partials(read(['autonomy: gated', '']))], ['autonomy: gated', []]);
});

test('rule I: a template row expands only when every cell can be read: a variable left literal, an id only the expansion gives (RS-8, RC-13, RS-15)', () => {
  const table = (...rows) => projectText({ text: plan([...REVIEWED, [...SUBSTEP_HEAD, ...rows, ''].join('\n')]), roster: ROSTER });
  // `{n}` and `$n` are not substituted: the row is refused, never expanded with the variable left in every member
  for (const cell of ['`out/review-T-{n}.md`', '`out/review-$n.md`']) {
    const literal = table('| T-n.spec, n ∈ {2, 3} | `team-spec-reviewer` | T-n | ' + cell + ' | `true` |');
    assert.deepEqual(ids(literal), ['T-2', 'T-3', 'T-4'], cell);
    assert.ok(partials(literal).some((w) => /^partial: team-plan\.md:\d+ — its cells name the variable in a form that is not substituted \(\{n\} or \$n\) — row not projected: "T-n\.spec, n ∈ \{2, 3\}"$/.test(w)), `${cell}: ${partials(literal).join(' | ')}`);
    assert.match(doubts(literal, 'T-3').join('\n'), /names T-2\.quality, which the plan names but does not project|names T-2 inside prose/, cell);
  }
  // `T-n-1` becomes T-2-1, an id only the expansion gives: a doubt on the dependencies, never an unknown id
  const minus = table('| T-n.spec, n ∈ {2, 3} | `team-spec-reviewer` | T-n-1 | `out/spec-T-n.md` | `true` |', '| T-n.quality, same n | `team-reviewer` | T-n.spec | `out/review-T-n.md` | `true` |');
  assert.deepEqual([byId(minus, 'T-2.spec').deps, byId(minus, 'T-3.spec').deps], [['T-2-1'], ['T-3-1']]);
  assert.match(doubts(minus, 'T-2.spec').join('\n'), /blockedBy names T-2-1, which its template row gives and no task has/);
  assert.match(doubts(minus, 'T-3.spec').join('\n'), /blockedBy names T-3-1, which its template row gives and no task has/);
  // a refused row forgets its set: `same n` after it is refused too, whatever an earlier row stated
  const forgot = table('| T-n.spec, n ∈ {2, 3} | `team-spec-reviewer` | T-n | `out/spec-T-n.md` | `true` |', '| T-n.quality, n ∈ {a, b} | `team-reviewer` | T-n.spec | `out/review-T-n.md` | `true` |', '| T-n.final, same n | `team-reviewer` | T-n.quality | `out/final-T-n.md` | `true` |');
  assert.deepEqual(ids(forgot), ['T-2', 'T-3', 'T-4', 'T-2.spec', 'T-3.spec']);
  assert.deepEqual(partials(forgot).filter((w) => /row not projected/.test(w)).map((w) => w.split(' — ')[1]), ['its id cell is a template over a set that is not read', 'its id cell is a template over a set that is not read']);
});

test('rule D: a type in another case, a type under another label of its row, a prose substep with no blockedBy are read with a doubt (RC-14, RS-10)', () => {
  const lower = projectText({ text: plan([task({ id: 'T-1', type: 'afk' })]) });
  assert.deepEqual([lower.tasks[0].type, partials(lower)], ['AFK', [`${PARTIAL}T-1 — its type cell writes AFK in another case, read as AFK`]]);
  assert.equal(projectText({ text: plan([task({ id: 'T-1', type: 'Hitl (human)' })]) }).tasks[0].type, 'HITL');
  // an unescaped pipe and a missing last cell: eleven cells for eleven columns, the type one column on
  const shifted = projectText({ text: plan([['### P1 — build', '', ...ROW_HEAD, ROWS[0].replace('| `true` |', '| pnpm test | tee log |').replace(/ 10 min \|$/, ''), ''].join('\n')]) });
  assert.deepEqual([shifted.tasks[0].type, shifted.tasks[0].estimated], [null, 'AFK']);
  assert.match(doubts(shifted, 'T-1').join('\n'), /the type is written outside the type cell of its row/);
  // a bold sub-id followed by fields is a substep, with the doubt on what it leaves out; one followed by a remark is not
  const marks = '**T-1-spec** — Phase 1; agent_type team-spec-reviewer; Requirement AC-1; files_owned `review/spec.md`; type AFK\n\n**T-1-note** — see the design.\n\n';
  const substep = projectText({ text: plan([task({ id: 'T-1' }) + marks]) });
  assert.deepEqual([ids(substep), byId(substep, 'T-1-spec').agentType, byId(substep, 'T-1-spec').filesOwned], [['T-1', 'T-1-spec'], 'team-spec-reviewer', ['review/spec.md']]);
  assert.ok(doubts(substep, 'T-1-spec').includes(`${PARTIAL}T-1-spec — its prose names no blockedby`), doubts(substep, 'T-1-spec').join(' | '));
});

test('cli: a graph file that cannot be written exits 2 with the reason; an error outside the projection is partial, exit 0, no stack (RC-15, RS-12, RS-15)', () => {
  const dir = session({ 'team-plan.md': BASIC });
  const run = cli(dir, '--out', dir);
  assert.deepEqual([run.status, run.stdout], [2, '']);
  assert.match(run.stderr, /^USAGE: --out file cannot be written: EISDIR/);
  assert.ok(run.stderr.includes(USAGE) && !/\n\s+at /.test(run.stderr));
  // resolve() throws for this one session: the error reaches the catch of the entry point
  const boom = session({ 'boom/team-plan.md': BASIC });
  const preload = 'data:text/javascript,' + encodeURIComponent('import path from "node:path";import { syncBuiltinESMExports } from "node:module";const real = path.resolve;path.resolve = (...args) => { if (String(args[0]).endsWith("boom")) throw new Error("resolve failed"); return real(...args); };syncBuiltinESMExports();');
  const broken = spawnSync(process.execPath, ['--import', preload, script, join(boom, 'boom')], { encoding: 'utf8' });
  assert.deepEqual([broken.status, broken.stdout, broken.stderr], [0, '', `WARN: ${PARTIAL}project-plan.mjs — internal error: resolve failed\n`]);
});

test('rule D: a field stated in prose under a table of row tasks is a doubt on that field for its rows (RR-1)', () => {
  const table = ['### P1 — build', '', ...ROW_HEAD, ...ROWS, ''];
  const all = projectText({ text: plan([[...table, 'Every task in this table is `type: HITL`, Requirement = AC-2.', ''].join('\n')]) });
  assert.deepEqual(all.tasks.map((t) => t.type), ['AFK', 'AFK', 'AFK']);
  assert.deepEqual(partials(all).map((w) => w.replace(/md:\d+/, 'md:N')), [`${PARTIAL}T-1, T-2, T-3 — type, Requirement is written on a prose line under its table, which is not read (team-plan.md:N)`]);
  // the nearest table above owns the line; a line keyed to one row is named for that row alone; under the next
  // heading nothing is stated for the table
  const second = ['Reviews:', '', ...ROW_HEAD, row({ id: 'T-4 review', blockedBy: 'T-3', files: '`review/**`' }), '', 'type: HITL for the review.', '', 'T-4: verify: by hand.', ''];
  const two = projectText({ text: plan([[...table, ...second, '### Notes', '', 'type: every task above is AFK.', ''].join('\n')]) });
  assert.deepEqual(partials(two).map((w) => w.replace(/md:\d+/, 'md:N')), [`${PARTIAL}T-4 — type is written on a prose line under its table, which is not read (team-plan.md:N)`, `${PARTIAL}T-4 — text keyed to it stands outside its table row, in no block (team-plan.md:N)`]);
});

test('rule H: a full stop that ends a blockedBy cell is punctuation, not prose (RC-17)', () => {
  const graph = projectText({ text: plan([task({ id: 'T-1' }), task({ id: 'T-1.spec', agentType: 'team-spec-reviewer', blockedBy: 'T-1.', files: '`reviews/x.md`' }), task({ id: 'T-2', blockedBy: 'T-1, T-1.spec.', files: '`src/b/**`' })]) });
  assert.deepEqual([byId(graph, 'T-1.spec').deps, byId(graph, 'T-2').deps, partials(graph)], [['T-1'], ['T-1', 'T-1.spec'], []]);
  // words beside the id stay a doubt
  assert.match(doubts(projectText({ text: plan([task({ id: 'T-1' }), task({ id: 'T-2', blockedBy: 'T-1 done.', files: '`src/b/**`' })]) }), 'T-2').join('\n'), /names T-1 inside prose/);
});

test('rule A: a table with a labelled id column and a field a list of steps does not write names each row that holds no id (V1-1)', () => {
  const wide = ['### P2 — review', '', '| Task | Phase | Agent | agent_type | evidence_producer | verify | type | Estimated |', '|---|---|---|---|---|---|---|---|', '| review the parser | 2 | rev | `team-reviewer` | self | `true` | AFK | 5 min |', '| verify the parser | 2 | ver | `team-verifier` | self | `true` | AFK | 5 min |', ''];
  const steps = ['### P2 — review', '', '| Step | Agent | agent_type | verify | type |', '|---|---|---|---|---|', '| 1 | rev | `team-reviewer` | `true` | AFK |', '| 2 | ver | `team-verifier` | `true` | HITL |', ''];
  const labelled = ['### P2 — review', '', '| ID | Phase | Agent | agent_type | evidence_producer | verify | type | Estimated |', '|---|---|---|---|---|---|---|---|', '| review the parser | 2 | rev | `team-reviewer` | self | `true` | AFK | 5 min |', ''];
  for (const [table, cells] of [[wide, ['review the parser', 'verify the parser']], [steps, ['1', '2']], [labelled, ['review the parser']]]) {
    const graph = projectText({ text: plan([task({ id: 'T-1' }), table.join('\n')]) });
    assert.deepEqual([ids(graph), partials(graph).map((w) => w.split(' — ').slice(1).join(' — '))], [['T-1'], cells.map((cell) => `its id cell names no id at its start — row not projected: "${cell}"`)], table[2]);
  }
});

test('rule D: under a table of row tasks a field named with no colon and a row id anywhere in a line are doubts (V1-3)', () => {
  const table = ['### P1 — build', '', ...ROW_HEAD, ...ROWS, ''];
  const why = (lines) => partials(projectText({ text: plan([[...table, ...lines, ''].join('\n')]) })).map((w) => w.replace(/ \(team-plan\.md:[^)]*\)$/, ''));
  const stated = {
    'blockedBy for the rows is also the seed.': 'blockedBy',
    'Each row is blocked by the seed.': 'blockedBy',
    'Every task in this table also has files_owned `src/x.ts`.': 'files_owned',
    'Every row is type HITL.': 'type',
    'Every row is HITL.': 'type',
    'Requirement for all rows: AC-2.': 'Requirement',
    'agent_type for all rows is `team-verifier`.': 'agent_type',
    'Phase for these rows: 2.': 'Phase',
  };
  for (const [line, field] of Object.entries(stated)) assert.deepEqual(why([line]), [`${PARTIAL}T-1, T-2, T-3 — ${field} is written on a prose line under its table, which is not read`], line);
  for (const line of ['For T-2: run the review twice.', 'Task T-2: run the review twice.', '(T-2) run the review twice.', '[T-2] run the review twice.']) assert.deepEqual(why([line]), [`${PARTIAL}T-2 — text keyed to it stands outside its table row, in no block`], line);
  // a heading that names a row task and does not hold its row
  assert.deepEqual(why(['#### Notes for T-2', '', 'Run the review twice.']), [`${PARTIAL}T-2 — a heading names it outside its table row: the text under that heading is in no block`]);
  // controls: prose that names no field and no row, a word of prose that happens to be a label; the heading that
  // holds the rows
  for (const line of ['Reviews run one after the other.', '- [ ] Every finding has a disposition; an unresolved finding holds the affected phase.', 'The reviewers verify each finding by its type.', '- [ ] the HITL go is recorded before the agent starts.']) assert.deepEqual(why([line]), [], line);
  assert.deepEqual(partials(projectText({ text: plan([['### P1 — build of T-1 and T-2', '', ...ROW_HEAD, ...ROWS, ''].join('\n')]) })), []);
});

test('rule D: a field stated with no colon in the text of a field-table task is a doubt; a bare mention and a prose substep are not (V1-3)', () => {
  const said = (text) => task({ id: 'T-2', blockedBy: 'T-1', files: '`src/b/**`' }).replace('Do the T-2 work.', text);
  const cases = {
    'This task is also blockedBy T-3.': 'blockedBy',
    'It is blocked by T-3 as well.': 'blockedBy',
    'files_owned also `src/a/x.ts`.': 'files_owned',
    'Its type is HITL.': 'type',
    'Requirement also AC-2.': 'Requirement',
    'agent_type is `team-verifier` on the host.': 'agent_type',
  };
  for (const [text, field] of Object.entries(cases)) {
    const graph = projectText({ text: plan([task({ id: 'T-1' }), said(text), task({ id: 'T-3', files: '`src/c/**`' })]) });
    assert.deepEqual(doubts(graph, 'T-2'), [`${PARTIAL}T-2 — its ${field} is written in the table and again on a prose line`], text);
  }
  // a bare mention states nothing, and a line that repeats the table says nothing new
  for (const text of ['Stay inside its `files_owned`; the blockedBy order is as written.', 'No file outside files_owned changes.', 'This type of review is new in Phase 2.', 'Its type is AFK and it is blockedBy T-1; T-9 is blockedBy T-2.', 'Requirement AC-1, files_owned `src/b/**`.', 'Substep **T-2-check** (`team-verifier`, blockedBy T-2, evidence `verifier/T-2-check.md`).', 'It is blockedBy the last grade of T-9.', '- T-1 (lead, blockedBy T-9; files_owned `src/z/**`): the seal.']) assert.deepEqual(partials(projectText({ text: plan([task({ id: 'T-1' }), said(text)]) })), [], text);
  // the paragraph of a prose substep states that substep's fields, not the heading task's
  const marks = '**T-1-spec** — Phase 1; agent_type team-spec-reviewer; Requirement AC-1; blockedBy T-1; files_owned `review/spec.md`; type AFK\n\n';
  assert.deepEqual(doubts(projectText({ text: plan([task({ id: 'T-1' }) + marks]) }), 'T-1'), []);
});

test('rule A: a line that starts with an id of a task family which is no task is named when it states a field or stands in no block (V1-4)', () => {
  const base = [task({ id: 'T-1' }), task({ id: 'T-2', blockedBy: 'T-1', files: '`src/b/**`' })];
  const named = (line) => partials(projectText({ text: plan(base, { tail: ['## Reviews', '', line, ''] }) })).map((w) => w.replace(/ \(team-plan\.md:[^)]*\)$/, ''));
  const fields = `${PARTIAL}T-5 — a line starts with it and states fields of its own — not projected`;
  const outside = `${PARTIAL}T-5 — a line starts with it and stands in no task block — not projected`;
  for (const line of ['- T-5: spec review — agent_type team-spec-reviewer; blockedBy T-1; files_owned `reviews/t5.md`; type AFK', 'T-5 — spec review. agent_type: team-spec-reviewer. blockedBy: T-1. type: AFK.']) assert.deepEqual(named(line), [fields], line);
  for (const line of ['* **T-5** spec review (team-spec-reviewer, after T-1)', '1. T-5 spec review by the reviewer', '**T-5 (spec review)** is done by the reviewer after T-1.', '- [ ] T-5 spec review (reviewer)', 'T-5\n: spec review by the reviewer after T-1']) assert.deepEqual(named(line), [outside], line);
  // inside a task's block the line is in a block: named only when it states a field
  const inside = (line) => partials(projectText({ text: plan([base[0], base[1].replace('Do the T-2 work.', line)]) })).filter((w) => w.startsWith(`${PARTIAL}T-5 — `)).length;
  assert.deepEqual([inside('T-5 grade-seal (lead, blockedBy T-2): run the seal.'), inside('T-5 is the step after this one.'), inside('- T-5 (`team-verifier`, after T-2): run the verify command; record rc + output.')], [1, 0, 0]);
  // controls: a task, an AC and an id of no task family at the start of a line
  for (const line of ['- T-2 ships last.', 'AC-1 is the only blocking criterion.', 'RFC-12 describes the format.']) assert.deepEqual(named(line), [], line);
});

test('rule I: a template or a multiple written in other words is named, never one literal task (V1-6)', () => {
  const why = (cell) => partials(projectText({ text: plan([task({ id: 'T-1' }), ['### P2 — more', '', ...ROW_HEAD, row({ id: cell, phase: '2', blockedBy: 'T-1', files: '`src/c/**`' }), ''].join('\n')]) })).map((w) => w.split(' — ')[1]);
  for (const cell of ['T-N.spec (N = 1, 2)', 'T-X.spec for each task X', 'T-1.spec per task', 'T-2 ×3 b', 'T-2* b', 'T-2, etc.', 'T-2 onwards', 'T-2 ff.', 'T-2 (×3: a, b, c)']) assert.deepEqual(why(cell), ['its id cell reads as a template or as several tasks, in a form that is not read'], cell);
  assert.deepEqual(why('T-2 (also T-3) b'), ['its id cell names several ids (T-2, T-3)']);
  // controls: a bold id, a title that holds such a word further on, an aside that describes the row
  for (const cell of ['**T-2** b', 'T-2 check every route', 'T-2 x86 build', 'T-2 second (covers T-3..T-5)', 'T-A lane']) assert.deepEqual(why(cell), [], cell);
});

test('rule A: a row cut off its table is named when its id stands in a later cell or after a number (V1-7)', () => {
  const why = (graph) => partials(graph).map((w) => w.split(' — ').slice(1).join(' — '));
  const head = ROW_HEAD.map((line, k) => (k ? `|---${line}` : `| # ${line}`));
  const second = projectText({ text: plan([['### P1 — build', '', ...head, `| 1 ${ROWS[0]}`, '', `| 2 ${ROWS[1]}`, ''].join('\n')]) });
  assert.deepEqual([ids(second), why(second)], [['T-1'], ['a table row outside any table — row not projected: "T-2 second"']]);
  const numbered = projectText({ text: plan([['### P1 — build', '', ...ROW_HEAD, ROWS[0], '', ROWS[1].replace('| T-2 second', '| 2. T-2 second'), ''].join('\n')]) });
  assert.deepEqual([ids(numbered), why(numbered)], [['T-1'], ['a table row outside any table — row not projected: "T-2 second"']]);
});

test('rule D: a span that holds two paths, a line range or the directory itself is no plain path (V1-8)', () => {
  for (const cell of ['`src/x.ts;src/t1.ts`', '`src/x.ts<br>src/t1.ts`', '`src/x.ts\\|src/t1.ts`', '`src/t1.ts:10-20`', '`src/t1.ts:12`', '`.`', '`./`']) assert.deepEqual(globsOf(cell), { globs: [], unsure: true }, cell);
  assert.deepEqual(globsOf('`src/a/{x,y}.ts`, `docs/**`'), { globs: ['src/a/{x,y}.ts', 'docs/**'], unsure: false });
});

test('rule C: words that go on from none and a question mark are prose, a doubt on agentType (V1-9)', () => {
  for (const cell of ['none yet', 'none of the above', 'lead?', 'none?', 'n/a yet']) assert.equal(agentOf(cell, new Set(ROSTER)).why, 'names no single agent', cell);
  for (const cell of ['none', 'none (HITL)', 'none — in-session lead', 'none — HITL checklist item', 'none; the lead commits', 'n/a', '— (HITL)']) assert.deepEqual(agentOf(cell, new Set(ROSTER)), { agentType: 'none', why: null }, cell);
  assert.deepEqual([agentOf('— not dispatched (human; host build)', new Set(ROSTER)), agentOf('lead session (not dispatched)', new Set(ROSTER))], [{ agentType: 'human', why: null }, { agentType: 'lead', why: null }]);
});

test('rule K, R-1: autonomy stated in the frontmatter and again, differently, in the body is no certain reading; a key indented under prose is no block (V1-16)', () => {
  const body = plan([task({ id: 'T-1' })]);
  const front = body.replace('latitude:', 'autonomy:\n  mode: gated\nlatitude:');
  const both = projectText({ text: front.replace('## Tasks', 'autonomy:\n  mode: full-auto\n\n## Tasks') });
  assert.deepEqual([both.autonomy, partials(both).map((w) => w.replace(/md:\d+/, 'md:N'))], ['autonomy:\n  mode: gated', [`${PARTIAL}team-plan.md — autonomy is written in the frontmatter and again, differently, in the body (team-plan.md:N) — the frontmatter is taken`]]);
  // the same block again is no doubt, in a fence or not; a fenced block that differs is one (R-1)
  assert.deepEqual(partials(projectText({ text: front.replace('## Tasks', 'autonomy:\n  mode: gated\n\n## Tasks') })), []);
  assert.deepEqual(partials(projectText({ text: front.replace('## Tasks', '```yaml\nautonomy:\n  mode: gated\n```\n\n## Tasks') })), []);
  assert.deepEqual(partials(projectText({ text: front.replace('## Tasks', '```yaml\nautonomy:\n  mode: full-auto\n```\n\n## Tasks') })).map((w) => w.split(' — ')[1].replace(/md:\d+/, 'md:N')), ['autonomy is written in the frontmatter and again, differently, in the body (team-plan.md:N)']);
  // R-1: a key indented under prose is a key of something else: no block, not taken, no doubt
  const nested = projectText({ text: body.replace('## Tasks', 'Settings:\n\n  autonomy:\n    mode: nested-example\n\n## Tasks') });
  assert.deepEqual([nested.autonomy, partials(nested)], [null, []]);
});

test('quality: a line, a nest of brackets and a run of prose substeps past any plan are bounded and named (V1-12)', () => {
  const started = Date.now();
  const long = projectText({ text: plan([task({ id: 'T-1' }), task({ id: 'T-2', blockedBy: 'T-1', files: `\`src/b/${'x'.repeat(30000)}.ts\`` })]) });
  assert.deepEqual(partials(long).filter((w) => /characters/.test(w)).map((w) => w.replace(/md:\d+/, 'md:N').replace(/holds \d+/, 'holds N')), [`${PARTIAL}team-plan.md:N — its line holds N characters, read only up to 20000`]);
  // a long line inside a code fence is no line of the plan
  assert.deepEqual(partials(projectText({ text: plan([task({ id: 'T-1' }) + ['```json', 'x'.repeat(30000), '```', ''].join('\n')]) })), []);
  const nested = projectText({ text: plan([task({ id: 'T-1' }), task({ id: 'T-2', blockedBy: `T-1 ${'('.repeat(9000)}later${')'.repeat(9000)}`, files: '`src/b/**`' }), task({ id: 'T-3', blockedBy: 'T-1 '.repeat(4000), files: '`src/c/**`' })]) });
  assert.deepEqual([byId(nested, 'T-2').deps, byId(nested, 'T-3').deps], [['T-1'], ['T-1']]);
  const marks = Array.from({ length: 150 }, (_, k) => `**T-1-s${k}** — Phase 1; agent_type team-coder; blockedBy T-1; Requirement AC-1; type AFK\n`).join('\n');
  const many = projectText({ text: plan([task({ id: 'T-1' }) + marks]) });
  // each substep left out is a line that starts with an id of the family and states fields: named too
  assert.deepEqual([ids(many), partials(many)[0], partials(many).length], [['T-1'], `${PARTIAL}T-1 — 150 prose substeps under its heading, more than 100 — not projected`, 151]);
  assert.ok(Date.now() - started < 20000, `${Date.now() - started} ms`);
  // brackets nested and brackets with no partner blank as before
  assert.deepEqual([projector.withoutAsides('a (b (c) d) e'), projector.withoutAsides('a ( b (c) d'), projector.withoutAsides('(a ) b ) (c')], ['a   e', 'a ( b   d', '  b ) (c']);
});

// fix round 3: the lead rulings R-1 to R-10 of gate1-hardening/design.md and the findings V2-1 to V2-13 of the second
// verify, each case an inline plan

test('R-2: an aside beside the spans of files_owned is no doubt unless it may name a path; words outside spans and asides stay one (RR-5, RS-19)', () => {
  for (const cell of ['`a/**` (new)', '`a/**` (attempt n; T-42 wrote attempt 1)', '(mkdir) `a/**`', '`a/**` (shared read; owned by the coder)']) assert.deepEqual(globsOf(cell), { globs: ['a/**'], unsure: false }, cell);
  for (const cell of ['`a/**` (and `b/**`)', '`a/**` (also src/b/x.ts)', '`a/**` (every *.md under it)', 'conditional `a/**`', 'Ryzen `a/**` (new)', '`a/**` only']) assert.deepEqual(globsOf(cell), { globs: ['a/**'], unsure: true }, cell);
  // a bracket inside a span opens no aside: a route group is a path, a note that ends the span is one, and a path
  // written inside the brackets is not cut out of its span (V2-7)
  assert.deepEqual(globsOf('`src/app/(group)/page.tsx`'), { globs: ['src/app/(group)/page.tsx'], unsure: false });
  assert.deepEqual(globsOf('`src/t1.ts (shared)`'), { globs: ['src/t1.ts'], unsure: false });
  assert.deepEqual(globsOf('`src/x.ts (and src/t1.ts)`'), { globs: [], unsure: true });
  // a pipe is a character of a name, as gate 1 read it (V2-11); two paths joined by one are no single path (V1-8)
  assert.deepEqual(globsOf('`src/a\\|b.ts`, `src/x|y.ts`'), { globs: ['src/a\\|b.ts', 'src/x|y.ts'], unsure: false });
  assert.deepEqual(globsOf('`src/x.ts|src/t1.ts`'), { globs: [], unsure: true });
  const graph = projectText({ text: plan([task({ id: 'T-1', files: '`src/a/**` (attempt n; T-9 wrote attempt 1)' })]) });
  assert.deepEqual([graph.tasks[0].filesOwned, partials(graph)], [['src/a/**'], []]);
  // how the overlap check takes a cell (R-3, R-3a): spans and separators alone are owned for certain, a cell with an
  // aside or words is not, a cell with no span stays out
  assert.deepEqual(['`a/**` (and `b/**`)', '`a/**`; `mktemp -d`', '`src/**` except `src/b/**`', 'reads `src/x.ts` only', '`src/**`, `!src/t1.ts`', 'the verifier folder'].map(projector.ownedBy), ['words', 'spans', 'words', 'words', 'words', 'none']);
});

test('R-2: an aside that takes away from the spans reads like the same words outside it, one that opens with a word that adds is a doubt on files (V3-2, V3-4)', () => {
  const narrows = ['`a/**` (except `a/b/**`)', '`a/**` (not a/b/**)', '`a/**` (except the lock file)', '`a/**` (excluding generated code)', '`a/**` (all of it but the lock file)'];
  const widens = ['`a/**` (+ its tests)', '`a/**` (+ PLN-22 conditional files)', '`a/**` (plus the fixtures)', '`a/**` (and README.md)', '`a/**` (also its snapshot)', '`a/**` (& the lock file)'];
  for (const cell of [...narrows, ...widens]) assert.deepEqual(globsOf(cell), { globs: ['a/**'], unsure: true }, cell);
  // R-3a: the overlap check takes a span beside an aside as one that may not be owned, whatever the aside says
  assert.deepEqual([narrows.map(projector.ownedBy), widens.map(projector.ownedBy)], [narrows.map(() => 'words'), widens.map(() => 'words')]);
  // a word that merely holds one of them, or one that adds past the start of the aside, is commentary (R-2): no doubt
  // on the field, and an aside all the same for the overlap check (R-3a)
  for (const cell of ['`a/**` (notes and fixtures)', '`a/**` (android only)', '`a/**` (button styles)', '`a/**` (new; nothing else)']) assert.deepEqual([globsOf(cell), projector.ownedBy(cell)], [{ globs: ['a/**'], unsure: false }, 'words'], cell);
  // the same note written inside the ticks is no note that ends a path
  for (const cell of ['`src/** (except tests)`', '`src/a.ts (+ its tests)`']) assert.deepEqual(globsOf(cell), { globs: [], unsure: true }, cell);
  const graph = projectText({ text: plan([task({ id: 'T-1', files: '`src/a.ts` (+ its tests)' }), task({ id: 'T-2', files: '`src/**` (except `src/b/**`)' }), task({ id: 'T-3', files: '`src/c.ts` (new)' })]) });
  assert.deepEqual([graph.tasks.map((t) => t.filesOwned), partials(graph)], [[['src/a.ts'], ['src/**'], ['src/c.ts']], ['T-1', 'T-2'].map((id) => `${PARTIAL}${id} — files_owned is prose or holds a span that is no path`)]);
});

test('R-4: a substep takes Phase, Requirement, type and Estimated from its task, owes one owner and owns nothing without files_owned (RR-3, RS-19)', () => {
  const head = ['### Review substeps', '', '| Substep | agent_type | blockedBy | Evidence | verify |', '|---|---|---|---|---|'];
  const rows = ['| T-n.spec, n ∈ {2, 3} | `team-spec-reviewer` | T-n | `out/spec-T-n.md` | `rg -q CLEAN out/spec-T-n.md` |', '| T-n.quality, same n | `team-reviewer` | T-n.spec | `out/review-T-n.md` | `rg -q CLEAN out/review-T-n.md` |'];
  const tasks = [task({ id: 'T-2', phase: '2', requirement: 'AC-1, AC-2' }), task({ id: 'T-3', phase: '3', blockedBy: 'T-2.quality', files: '`src/b/**`' })];
  const graph = projectText({ text: plan([...tasks, [...head, ...rows, ''].join('\n')]), roster: ROSTER });
  assert.deepEqual([ids(graph), partials(graph), graph.phases], [['T-2', 'T-3', 'T-2.spec', 'T-3.spec', 'T-2.quality', 'T-3.quality'], [], ['2', '3']]);
  const read = (from, id) => {
    const t = byId(from, id);
    return [t.phase, t.requirement, t.acs, t.type, t.estimated, t.agent, t.agentType, t.filesOwned, t.evidenceProducer, t.verify, t.deps];
  };
  assert.deepEqual(read(graph, 'T-2.spec'), ['2', ['AC-1', 'AC-2'], ['AC-1', 'AC-2'], 'AFK', '20 min', null, 'team-spec-reviewer', [], '`out/spec-T-2.md`', '`rg -q CLEAN out/spec-T-2.md`', ['T-2']]);
  assert.deepEqual(read(graph, 'T-3.quality'), ['3', ['AC-1'], ['AC-1'], 'AFK', '20 min', null, 'team-reviewer', [], '`out/review-T-3.md`', '`rg -q CLEAN out/review-T-3.md`', ['T-3.spec']]);
  // an Owner column is the owner, read as the agent_type of a substep that writes none (R-4a), `Evidence + verify`
  // both fields in one cell; what the substep states itself stays
  const joint = ['### Review substeps', '', '| Substep | Owner | blockedBy | files_owned | Evidence + verify | type |', '|---|---|---|---|---|---|', '| T-2.spec | team-spec-reviewer | T-2 | `out/spec.md` | `rg -q CLEAN out/spec.md` | HITL |', ''].join('\n');
  const owned = projectText({ text: plan([tasks[0], joint]), roster: ROSTER });
  assert.deepEqual([partials(owned), byId(owned, 'T-2.spec').kind, read(owned, 'T-2.spec')], [[], 'review', ['2', ['AC-1', 'AC-2'], ['AC-1', 'AC-2'], 'HITL', '20 min', 'team-spec-reviewer', 'team-spec-reviewer', ['out/spec.md'], '`rg -q CLEAN out/spec.md`', '`rg -q CLEAN out/spec.md`', ['T-2']]]);
  // a substep under a heading of its own, and one written in the prose of its task
  const own = '### T-2-regrade regrade (T-2 substep)\n\n| Field | Value |\n|---|---|\n| agent_type | `team-goal-auditor` |\n| evidence_producer | `out/grade-2.md` |\n| blockedBy | T-2 |\n| verify | `true` |\n\nGrade again.\n\n';
  const heading = projectText({ text: plan([tasks[0], own]), roster: ROSTER });
  assert.deepEqual([partials(heading), read(heading, 'T-2-regrade').slice(0, 5)], [[], ['2', ['AC-1', 'AC-2'], ['AC-1', 'AC-2'], 'AFK', '20 min']]);
  const marks = '**T-2-spec** — agent_type team-spec-reviewer; evidence_producer T-2-spec → `review/spec.md`; blockedBy T-2; verify `true`\n\n';
  const prose = projectText({ text: plan([tasks[0] + marks]), roster: ROSTER });
  assert.deepEqual([partials(prose), read(prose, 'T-2-spec').slice(0, 5)], [[], ['2', ['AC-1', 'AC-2'], ['AC-1', 'AC-2'], 'AFK', '20 min']]);
  // what a substep owes is still doubted: one owner, blockedBy, evidence_producer, verify
  const bare = ['### Review substeps', '', '| Substep | Phase | Requirement | type | Estimated |', '|---|---|---|---|---|', '| T-2.spec | 2 | AC-1 | AFK | 5 min |', ''].join('\n');
  assert.deepEqual(partials(projectText({ text: plan([tasks[0], bare]) })), [`${PARTIAL}T-2.spec — it has no Agent, agent_type, evidence_producer, verify field`, `${PARTIAL}T-2.spec — it has no blockedBy field`]);
  // no substep: an id whose task is not projected, an id two suffixes away from one. they owe every field
  const lacks = 'it has no Phase, Agent, Requirement, files_owned, type, Estimated field';
  const apart = projectText({ text: plan([tasks[0], [...head, '| T-9.spec | `team-spec-reviewer` | T-2 | `out/a.md` | `true` |', '| T-2-dod-checks | `team-verifier` | T-2 | `out/b.md` | `true` |', ''].join('\n')]), roster: ROSTER });
  assert.deepEqual(partials(apart), [`${PARTIAL}T-9.spec — ${lacks}`, `${PARTIAL}T-2-dod-checks — ${lacks}`]);
  // a task that has none to give leaves the usual doubt on the substep: the check fails neither for it
  const noType = task({ id: 'T-2' }).split('\n').filter((line) => !line.startsWith('| **type** ')).join('\n');
  const none = projectText({ text: plan([noType, [...head, '| T-2.spec | `team-spec-reviewer` | T-2 | `out/a.md` | `true` |', ''].join('\n')]), roster: ROSTER });
  assert.deepEqual(partials(none), [`${PARTIAL}T-2 — it has no type field`, `${PARTIAL}T-2.spec — it has no type field`]);
});

test('R-4: a substep takes HITL from its task only when the lead or the human owns it; one an agent is dispatched for, with no type of its own, is a doubt on type (V3-1)', () => {
  const human = task({ id: 'T-2', phase: '7', agent: 'operator', agentType: 'none (HITL)', requirement: 'AC-1, AC-2', type: 'HITL' });
  const table = (head, ...rows) => ['## Verify substeps', '', head, head.replace(/[^|]+/g, '---'), ...rows, ''].join('\n');
  const untyped = (id) => `${PARTIAL}${id} — it states no type and its task is HITL, which a dispatched substep does not take`;
  const read = (graph, id) => [byId(graph, id).type, byId(graph, id).phase, byId(graph, id).acs, byId(graph, id).agentType];
  // the owner is read from agent_type, else from the Agent or Owner cell; phase and requirement are still the task's
  const shared = projectText({ text: plan([human, table('| Substep | Owner / `agent_type` | blockedBy | Evidence | verify |', '| T-2-verify | verifier / `team-verifier` | T-2 | `out/verify.md` | `true` |', '| T-2-confirm | operator / none (HITL) | T-2-verify | `out/confirm.md` | `true` |')]), roster: ROSTER });
  assert.deepEqual([partials(shared), shared.hitl, read(shared, 'T-2-verify'), read(shared, 'T-2-confirm')], [[untyped('T-2-verify')], ['T-2', 'T-2-confirm'], [null, '7', ['AC-1', 'AC-2'], 'team-verifier'], ['HITL', '7', ['AC-1', 'AC-2'], 'none']]);
  const owner = projectText({ text: plan([human, table('| Substep | Owner | blockedBy | Evidence | verify |', '| T-2-verify | verifier | T-2 | `out/verify.md` | `true` |', '| T-2-confirm | human | T-2-verify | `out/confirm.md` | `true` |')]), roster: ROSTER });
  // R-4a: the Owner cell is read as the agent_type: `verifier` is no agent definition, `human` is a lead marker
  const noAgent = `${PARTIAL}T-2-verify — its Owner cell, read as its agent_type, names verifier, which is no agent definition under .claude/agents`;
  assert.deepEqual([partials(owner), owner.hitl, byId(owner, 'T-2-verify').type, byId(owner, 'T-2-confirm').kind], [[noAgent, untyped('T-2-verify')], ['T-2', 'T-2-confirm'], null, 'lead']);
  // AFK or HITL where the substep says so
  const stated = projectText({ text: plan([human, table('| Substep | agent_type | blockedBy | Evidence | verify | type |', '| T-2-verify | `team-verifier` | T-2 | `out/verify.md` | `true` | AFK |', '| T-2-watch | `team-verifier` | T-2 | `out/watch.md` | `true` | HITL |')]), roster: ROSTER });
  assert.deepEqual([partials(stated), stated.hitl, byId(stated, 'T-2-verify').type], [[], ['T-2', 'T-2-watch'], 'AFK']);
  // a substep under a heading of its own, one written in the prose of its task, the members of a template row
  const own = '### T-2-regrade regrade (T-2 substep)\n\n| Field | Value |\n|---|---|\n| agent_type | `team-goal-auditor` |\n| evidence_producer | `out/grade-2.md` |\n| blockedBy | T-2 |\n| verify | `true` |\n\nGrade again.\n\n';
  const marks = '**T-2-spec** — agent_type team-spec-reviewer; evidence_producer T-2-spec → `review/spec.md`; blockedBy T-2; verify `true`\n\n';
  const member = table('| Substep | agent_type | blockedBy | Evidence | verify |', '| T-n.spec, n ∈ {2, 3} | `team-spec-reviewer` | T-n | `out/spec-T-n.md` | `true` |');
  const forms = projectText({ text: plan([human + marks, own, task({ id: 'T-3', phase: '8', blockedBy: 'T-2', files: '`src/b/**`' }), member]), roster: ROSTER });
  assert.deepEqual([partials(forms), forms.hitl, ['T-2-spec', 'T-2-regrade', 'T-2.spec', 'T-3.spec'].map((id) => byId(forms, id).type)], [['T-2-spec', 'T-2-regrade', 'T-2.spec'].map(untyped), ['T-2'], [null, null, null, 'AFK']]);
});

test('R-7: a heading of any level whose id only prefixes the deeper task headings under it groups them and gives no line (V3-5)', () => {
  const leaf = (fields) => task(fields).replace(/^### /, '#### ').replace('#### Acceptance criteria', '##### Acceptance criteria');
  const leaves = [leaf({ id: 'T-1-a' }), leaf({ id: 'T-1-b', blockedBy: 'T-1-a', files: '`src/b/**`' })];
  const named = (graph) => partials(graph).map((w) => w.replace(/\(team-plan\.md:\d+\)/, '(L)'));
  for (const heading of ['### T-1 build (logical group; no separate dispatch)', '### T-1 build', '### Group T-1 (no separate dispatch)']) {
    const graph = projectText({ text: plan([heading, '', 'The leaves below run in order.', '', ...leaves, '### T-2 verify (logical group; no separate dispatch)', '', leaf({ id: 'T-2-a', blockedBy: 'T-1-b', files: '`src/c/**`' })]) });
    assert.deepEqual([ids(graph), named(graph)], [['T-1-a', 'T-1-b', 'T-2-a'], []], heading);
  }
  // no group: the sub-ids stand at its own level, under another heading of its level, or are no sub-ids of its id
  const level = projectText({ text: plan(['### T-1 build (logical group)', '', ...leaves.map((text) => text.replace(/^#### /, '### '))]) });
  assert.deepEqual([ids(level), named(level)], [['T-1-a', 'T-1-b'], [`${PARTIAL}T-1 — heading has no field table — not projected (L)`]]);
  const apart = projectText({ text: plan(['### T-1 build (logical group)', '', 'Nothing here.', '', '### Leaves', '', ...leaves]) });
  assert.deepEqual(named(apart), [`${PARTIAL}T-1 — heading has no field table — not projected (L)`]);
  const other = projectText({ text: plan(['### T-9 build (logical group)', '', ...leaves, '### Group T-8 (no separate dispatch)', '', leaf({ id: 'T-2-a', files: '`src/c/**`' })]) });
  assert.deepEqual(named(other), [`${PARTIAL}T-9 — heading has no field table — not projected (L)`, `${PARTIAL}T-8 — named in a heading but not projected (L)`]);
  // an id that is itself a task (a table row projects it) groups nothing: the text under its heading is keyed to it
  const rowed = projectText({ text: plan([['### P1 — build', '', ...ROW_HEAD, row({ id: 'T-1 build' }), ''].join('\n'), '### T-1 build notes', '', 'Runs first.', '', leaf({ id: 'T-1-a', blockedBy: 'T-1', files: '`src/b/**`' })]) });
  assert.deepEqual([ids(rowed), named(rowed)], [['T-1', 'T-1-a'], [`${PARTIAL}T-1 — its heading has no field table: the text under it is in no block (L)`]]);
});

test('R-5: an id that holds a placeholder is a template reference: a heading that is no task heading names no task with it (RR-7)', () => {
  const under = (heading) => projectText({ text: plan([task({ id: 'T-1' })], { tail: [heading, '', 'Prompt text.', ''] }) });
  for (const heading of ['### Quality reviewer (T-1, T-R{n}-review)', '### Repair investigator (T-R{n}-triage)', '### Verifier (T-1, T-9-R<m>a)', '## Repair template T-R<N>-fix (conditional)']) assert.deepEqual(partials(under(heading)), [], heading);
  // an id with no placeholder stays named, and a template heading that carries a field table leaves the table named
  assert.deepEqual(partials(under('### Quality reviewer (T-1, T-9-review)')).map((w) => w.replace(/ \(team-plan\.md:\d+\)$/, '')), [`${PARTIAL}T-9-review — named in a heading but not projected`]);
  const tabled = projectText({ text: plan([task({ id: 'T-1' }), `### T-R{n}-fix fix round\n${tableOf({ id: 'T-9', blockedBy: 'T-1', files: '\`src/b/**\`' })}`]) });
  assert.deepEqual(partials(tabled).map((w) => w.split(' — ').slice(1).join(' — ')), ['field table under no task heading — not projected']);
});

test('R-7: a field or a row id written above a table of row tasks is a doubt, as under it; section text keyed to no task is none (V2-1)', () => {
  const why = (above, more = []) => partials(projectText({ text: plan([['### P1 — build', '', ...above, '', ...ROW_HEAD, ...ROWS, '', ...more].join('\n')]) })).map((w) => w.replace(/ \(team-plan\.md:[^)]*\)$/, ''));
  const stated = { 'All rows below are also blockedBy T-0.': 'blockedBy', 'Every row below is type HITL.': 'type', 'Every row: `type: AFK`, requirements AC-1–4.': 'type', 'agent_type for all rows is `team-verifier`.': 'agent_type' };
  for (const [line, field] of Object.entries(stated)) assert.deepEqual(why([line]), [`${PARTIAL}T-1, T-2, T-3 — ${field} is written on a prose line above its table, which is not read`], line);
  assert.deepEqual(why(['Order: T-1 → T-2 → T-3.']), ['T-1', 'T-2', 'T-3'].map((id) => `${PARTIAL}${id} — text keyed to it stands outside its table row, in no block`));
  for (const line of ['Each row is an owned substep.', 'The reviewers work in the order of the table.', '- [ ] every finding has a retained disposition']) assert.deepEqual(why([line]), [], line);
  // a line between two tables stands under the one and above the other
  const second = ['Every row is type HITL.', '', ...ROW_HEAD, row({ id: 'T-4 review', blockedBy: 'T-3', files: '`review/**`' }), ''];
  assert.deepEqual(why([], second), [`${PARTIAL}T-1, T-2, T-3 — type is written on a prose line under its table, which is not read`, `${PARTIAL}T-4 — type is written on a prose line above its table, which is not read`]);
});

test('rule D: a phase that opens a line and a blockedBy that goes on from none are stated on that line (V2-4)', () => {
  const said = (text) => task({ id: 'T-2', blockedBy: 'T-1', files: '`src/b/**`' }).replace('Do the T-2 work.', text);
  for (const [text, field] of [['Phase 2 in practice.', 'Phase'], ['- Phase 3 once the seed lands.', 'Phase'], ['blockedBy none, except T-3.', 'blockedBy']]) {
    const graph = projectText({ text: plan([task({ id: 'T-1' }), said(text), task({ id: 'T-3', files: '`src/c/**`' })]) });
    assert.deepEqual(doubts(graph, 'T-2'), [`${PARTIAL}T-2 — its ${field} is written in the table and again on a prose line`], text);
  }
  for (const text of ['Phase 1 as planned.', 'This runs in Phase 2 of the rollout.', 'Phases 2 and 3 build on it.', 'It is blockedBy none of the reviews.']) assert.deepEqual(partials(projectText({ text: plan([task({ id: 'T-1' }), said(text)]) })), [], text);
});

test('rule C: a lead cell that leaves the owner open is no certain lead step (V2-8)', () => {
  for (const cell of ['none - tbd', 'N/A — tbd', 'none · tbd', 'none-yet', 'orchestrator (?)', 'lead (TBD)', 'none — todo']) assert.equal(agentOf(cell, new Set(ROSTER)).why, 'names no single agent', cell);
  for (const cell of ['none — in-session lead', 'orchestrator (in-session seam)', 'none - not dispatched']) assert.deepEqual(agentOf(cell, new Set(ROSTER)).why, null, cell);
});

test('R-3a: the overlap check takes a files_owned cell as clean only when it holds backtick spans and separators, nothing else (V4-1)', () => {
  for (const cell of ['`a/**`', '`a/**`, `b/x.ts`; `c/**` · `d/**`', '`a/**` + `b/**`', '`a/**`<br>`b/**`', '`a/**`, `mktemp -d`', '`src/app/(group)/page.tsx`']) assert.equal(projector.ownedBy(cell), 'spans', cell);
  // an aside, whatever its words are, beside the ticks or inside them; words outside the spans; a negated span
  const asides = ['(no edits in this task)', '(no edits)', '(read)', '(read-only)', '(shared read)', '(new)', '(except generated)', '(not the lock file)', '(+ its tests)', '(see `docs/x.md`)'];
  for (const cell of [...asides.map((aside) => `\`a/**\` ${aside}`), '(mkdir) `a/**`', '`a/x.ts (shared)`', '`a/x.ts (read-only)`', 'reads `a/x.ts` only', '`a/**`, `!a/t1.ts`']) assert.equal(projector.ownedBy(cell), 'words', cell);
  for (const cell of ['the verifier folder', 'none', '', null]) assert.equal(projector.ownedBy(cell), 'none', String(cell));
  // what the aside says still decides whether the field itself is doubted (R-2): that reading is unchanged
  assert.deepEqual(['(no edits)', '(read)', '(except generated)', '(+ its tests)'].map((aside) => globsOf(`\`a/**\` ${aside}`).unsure), [false, false, true, true]);
});

test('R-5a: the rows of a table whose id column is labelled a pattern are id patterns, outside the graph with no line; a heading that starts with a <n> id reads like one that starts with a {n} id (V4-2, V4-4)', () => {
  const repair = (label, ...rows) => ['## Repair template (conditional; a failed verify / review loop)', '', `| Step | ${label} | Agent / \`agent_type\` | Content | Evidence |`, '|---|---|---|---|---|', ...rows, '', 'Each fix-forward push consumes one round; T-R{n}-push re-attempts after T-1.', ''];
  const collect = '| collect | `T-R{n}-collect` | orchestrator (HITL, read-only host) | captures | raw captures |';
  const fix = '| fix | `T-R{n}-fix` | owning coder / `team-coder` | the fix | `coder/progress.md` |';
  const review = '| review | `T-R<n>-review` | reviewer / `team-reviewer` | fix diff review | `reviewer/review.md` |';
  const lined = (graph) => partials(graph).map((w) => w.replace(/team-plan\.md:\d+/, 'L'));
  const read = (...tail) => projectText({ text: plan([task({ id: 'T-1' })], { tail }), roster: ROSTER });
  for (const label of ['Id pattern', 'ID pattern', '`Id` pattern']) assert.deepEqual([ids(read(...repair(label, collect, fix, review))), lined(read(...repair(label, collect, fix, review)))], [['T-1'], []], label);
  // the same rows under an ordinary id column are template rows, each named (rule I); `T-R<n>-review` is an id there
  const ordinary = read(...repair('ID', collect, fix));
  assert.deepEqual([ids(ordinary), lined(ordinary)], [['T-1'], ['T-R{n}-collect', 'T-R{n}-fix'].map((cell) => `${PARTIAL}L — its id cell is a template in a form that is not read — row not projected: "${cell}"`)]);
  assert.deepEqual(ids(read(...repair('ID', review))), ['T-1', 'T-R<n>-review']);
  // an id with no placeholder in a pattern column is an id like any other: a task, or named
  assert.deepEqual(lined(read(...repair('Id pattern', collect, '| again | T-1 | orchestrator | re-run | record |'))), []);
  assert.deepEqual(lined(read(...repair('Id pattern', collect, '| push | T-9 | orchestrator (HITL) | the push | record |'))), [`${PARTIAL}T-9 — named in an id cell but not projected (L)`]);
  // a heading that starts with a <n> id and has no fields of its own names no task, as one that starts with a {n} id
  for (const heading of ['### T-R<n>-review', '### T-R<n>-fix repair template (conditional)', '#### T-9-R<m>a', '### T-R{n}-review']) assert.deepEqual([ids(read(heading, '', 'Review of round n.', '')), lined(read(heading, '', 'Review of round n.', ''))], [['T-1'], []], heading);
  // with a field table of its own it is a task, as real plans write a templated task, and it is named: the graph cannot
  // enumerate a template (R-13); an id with no placeholder stays named
  const tabled = projectText({ text: plan([task({ id: 'T-1' }), `### T-9-R<m>a fix round\n${tableOf({ id: 'T-9-R<m>a', blockedBy: 'T-1', files: '\`src/b/**\`' })}`]) });
  assert.deepEqual([ids(tabled), partials(tabled)], [['T-1', 'T-9-R<m>a'], [`${PARTIAL}T-9-R<m>a — its id holds a placeholder: one graph task stands for a template the graph cannot enumerate`]]);
  assert.deepEqual(lined(read('### T-9-review', '', 'Review.', '')), [`${PARTIAL}T-9-review — heading has no field table — not projected (L)`]);
});

test('R-11: a task whose own heading or an enclosing heading holds the word withdrawn is projected with a named doubt (V4-3)', () => {
  const leaf = (fields) => task(fields).replace(/^### /, '#### ').replace('#### Acceptance criteria', '##### Acceptance criteria');
  const own = task({ id: 'T-2', title: 'data-disk-format — withdrawn r11 (D-24; never run; r10 text kept as history)', files: '`src/b/**`' });
  const section = ['## 13 Withdrawn r11 (D-24 + D-25) — r10 tasks never dispatched', '', 'Moved here verbatim so no run lane reads them as tasks.', '', leaf({ id: 'T-3', files: '`src/c/**`' }), '### Rows', '', ...ROW_HEAD, row({ id: 'T-4 extra', files: '`src/d/**`' }), ''];
  const live = ['## Later tasks', '', task({ id: 'T-5', files: '`src/e/**`' })];
  const graph = projectText({ text: plan([task({ id: 'T-1' }), own], { tail: [...section, ...live] }), roster: ROSTER });
  const lines = graph.warnings.map((w) => w.replace(/team-plan\.md:(\d+)/, (_, n) => `L:${graph.tasks.find((t) => t.line === Number(n))?.id ?? 'section'}`));
  assert.deepEqual(ids(graph), ['T-1', 'T-2', 'T-3', 'T-4', 'T-5']);
  assert.deepEqual(lines, [['T-2', 'T-2'], ['T-3', 'section'], ['T-4', 'section']].map(([id, at]) => `${PARTIAL}${id} — its heading or a heading above it says withdrawn (L:${at}): it may not be a live task`));
  // the doubt is on the whole task: the line names no field
  assert.ok(!/requirement|type|blockedby|deps|files_owned|phase|agent|verify|evidence_producer|workkind|estimated/i.test(lines[0].split(' — ')[1]));
  // a heading that says it of another thing, in a word that only holds it, says nothing
  for (const title of ['slug', 'withdrawal-form', 'unwithdrawn-state']) assert.deepEqual(partials(projectText({ text: plan([task({ id: 'T-1', title })]) })), [], title);
});

test("R-4a: a substep's Owner column is read as its agent_type: a roster name sets agentType and kind, a lead marker gives kind lead, anything else is the agent_type doubt (V4-5)", () => {
  const table = (head, ...rows) => ['### Review substeps', '', head, head.replace(/[^|]+/g, '---'), ...rows, ''].join('\n');
  const tasks = [task({ id: 'T-1' }), task({ id: 'T-2', blockedBy: 'T-1', files: '`src/b/**`' })];
  const head = '| Substep | Owner | blockedBy | Evidence + verify |';
  const read = (rows, roster = ROSTER, columns = head) => projectText({ text: plan([...tasks, table(columns, ...rows)]), ...(roster ? { roster } : {}) });
  const owners = (graph) => graph.tasks.filter((t) => /[.-][a-z]+$/.test(t.id)).map((t) => [t.id, t.agent, t.agentType, t.kind]);
  const graph = read(['| T-1.spec | team-spec-reviewer | T-1 | `out/spec.md`; `true` |', '| T-1.quality | `team-reviewer` (fresh) | T-1.spec | `out/q.md`; `true` |', '| T-2.confirm | lead | T-2 | `out/c.md`; `true` |', '| T-2-sign | human (HITL) | T-2.confirm | `out/s.md`; `true` |']);
  assert.deepEqual([partials(graph), owners(graph)], [[], [['T-1.spec', 'team-spec-reviewer', 'team-spec-reviewer', 'review'], ['T-1.quality', 'team-reviewer (fresh)', 'team-reviewer', 'review'], ['T-2.confirm', 'lead', 'lead', 'lead'], ['T-2-sign', 'human (HITL)', 'human', 'lead']]]);
  // anything else is the doubt an agent_type cell gets, on agentType and kind
  const doubted = [['spec reviewer', 'names no single agent'], ['verifier', 'names verifier, which is no agent definition under .claude/agents'], ['team-spec-reviewer + team-reviewer', 'names several agents (team-spec-reviewer, team-reviewer)'], ['team-reviewer or the lead', 'names team-reviewer beside a lead marker (lead)']];
  for (const [cell, why] of doubted) assert.deepEqual(partials(read([`| T-1.spec | ${cell} | T-1 | \`out/spec.md\`; \`true\` |`])), [`${PARTIAL}T-1.spec — its Owner cell, read as its agent_type, ${why}`], cell);
  // no roster found: only the shape of the cell is checked, as for an agent_type cell
  const shape = read(['| T-1.spec | verifier | T-1 | `out/spec.md`; `true` |'], null);
  assert.deepEqual([partials(shape), owners(shape)], [[], [['T-1.spec', 'verifier', 'verifier', 'other']]]);
  // the label as real plans share it: an owner written beside the substep id is its owner column
  const beside = read(['| T-1.spec / team-spec-reviewer | T-1 | `out/spec.md`; `true` |', '| T-1.sign / human | T-1.spec | `out/s.md`; `true` |'], ROSTER, '| Substep / owner | blockedBy | Evidence + verify |');
  assert.deepEqual([partials(beside), owners(beside)], [[], [['T-1.spec', 'team-spec-reviewer', 'team-spec-reviewer', 'review'], ['T-1.sign', 'human', 'human', 'lead']]]);
  // an agent_type the substep writes itself is the one read: the Owner cell stays its agent
  const both = read(['| T-1.spec | reviewer-a | `team-spec-reviewer` | T-1 | `out/spec.md`; `true` |'], ROSTER, '| Substep | Owner | agent_type | blockedBy | Evidence + verify |');
  assert.deepEqual([partials(both), owners(both)], [[], [['T-1.spec', 'reviewer-a', 'team-spec-reviewer', 'review']]]);
  // a row that is no substep owes its own agent_type: an Owner cell is not read as one
  const apart = read(['| T-9.spec | team-spec-reviewer | T-1 | `out/spec.md`; `true` |']);
  assert.deepEqual([byId(apart, 'T-9.spec').agentType, partials(apart)], [null, [`${PARTIAL}T-9.spec — it has no Phase, agent_type, Requirement, files_owned, type, Estimated field`]]);
});

test('R-12: inside an aside the bare word claude is the cli, not a second agent (V4-6)', () => {
  const known = new Set(ROSTER);
  const certain = [
    ['— not dispatched (human; paid `claude -p` haiku, ≈ $0.01)', 'human', 'lead'],
    ['— not dispatched (human; CON-17 client cutover; paid `claude -p` haiku)', 'human', 'lead'],
    ['none (the human pastes it into claude)', 'none', 'lead'],
    ['`team-coder` (runs `claude -p` for the summary)', 'team-coder', 'code'],
  ];
  for (const [cell, agentType, kind] of certain) {
    assert.deepEqual(agentOf(cell, known), { agentType, why: null }, cell);
    const graph = projectText({ text: plan([task({ id: 'T-1', agentType: cell })]), roster: ROSTER });
    assert.deepEqual([graph.tasks[0].agentType, graph.tasks[0].kind, partials(graph)], [agentType, kind, []], cell);
  }
  // outside an aside it is the built-in agent: alone the agent of the cell, beside another name or a lead marker a doubt
  assert.deepEqual([agentOf('claude', known), agentOf('claude (headless)', known)], [{ agentType: 'claude', why: null }, { agentType: 'claude', why: null }]);
  assert.deepEqual([agentOf('team-coder + claude', known).why, agentOf('human, then claude', known).why, agentOf('claude (then claude -p again)', known).why], ['names several agents (team-coder, claude)', 'names claude beside a lead marker (human)', null]);
  // any other agent name inside an aside is still a second agent
  assert.deepEqual([agentOf('team-coder (or team-tester)', known).why, agentOf('human (via general-purpose)', known).why], ['names several agents (team-coder, team-tester)', 'names general-purpose beside a lead marker (human)']);
});
