import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  ABSENT,
  COLUMNS,
  UNKNOWN,
  USAGE,
  bornMs,
  buildRow,
  countAsks,
  countBlockingAcs,
  firstRunMs,
  isCreateRow,
  median,
  medianLine,
  parseAcLedger,
  parseArgs,
  parseHeader,
  readCreateTokens,
  scoreboard,
  startMs,
  summarize,
} from './scoreboard.mjs';
// the seal gate: scoreboard counts blocking acs and splits table cells with its parsers
import { checkContract, splitCells } from './check-contract.mjs';

const script = fileURLToPath(new URL('./scoreboard.mjs', import.meta.url));
// the report whose create-step rule isCreateRow mirrors
const report = fileURLToPath(new URL('../../../hooks/plan-usage-report.mjs', import.meta.url));
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
// 2026-11-10 09:30 utc
const T0 = Date.UTC(2026, 10, 10, 9, 30);
const NOW = T0 + 3 * DAY;
const LOG = join('team-session', '_observability', 'plan-usage.ndjson');

const agentRow = (over = {}) =>
  JSON.stringify({ type: 'agent', ts: '2026-11-10T10:00:00.000Z', session: '20261110-full', agent: 'a1', role: 'team-designer', phase: null, task: null, desc: null, peak_ctx: 0, output: 0, cache_read: 1_000_000, ...over });

// efforts: { name: { 'rel/path': text or { text, mtime, born } } }, times in ms. a birthtime cannot be set
// on disk, so the returned stat reports each fixture file's born over the real one
const fixture = (efforts, logLines) => {
  const root = mkdtempSync(join(tmpdir(), 'scoreboard-'));
  const births = new Map();
  mkdirSync(join(root, 'team-session'));
  for (const [effort, files] of Object.entries(efforts)) {
    for (const [rel, spec] of Object.entries(files)) {
      const { text = '', mtime = T0, born = mtime } = typeof spec === 'string' ? { text: spec } : spec;
      const path = join(root, 'team-session', effort, rel);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, text);
      utimesSync(path, new Date(mtime), new Date(mtime));
      births.set(path, born);
    }
  }
  if (logLines) {
    mkdirSync(dirname(join(root, LOG)), { recursive: true });
    writeFileSync(join(root, LOG), `${logLines.join('\n')}\n`);
  }
  const stat = (path) => {
    const st = statSync(path);
    return births.has(path) ? { size: st.size, mtimeMs: st.mtimeMs, birthtimeMs: births.get(path) } : st;
  };
  return { root, stat, dir: (effort) => join(root, 'team-session', effort) };
};
const run = ({ root, stat }, ...argv) => scoreboard(['--root', root, ...argv], { stat, now: NOW });
const efforts = async (fx, ...argv) => JSON.parse((await run(fx, '--json', ...argv)).lines.join('\n')).rows.map((row) => row.effort);

const mapText = (header, body = '') => `# Map: demo\n\nDestination: a thing\n${header.join('\n')}\n\n## Notes\n${body}`;
const DOD_HEAD = '| id | statement | maps_to | kind | verify | blocking |\n|---|---|---|---|---|---|';
const ac = (id, blocking = 'true', statement = 'does the thing') => `| ${id} | ${statement} | T-1 | deterministic | \`pnpm test\` | ${blocking} |`;
const dod = (rows, head = DOD_HEAD) => `# Definition of done\n\n## Acceptance Criteria\n\n${head}\n${rows.join('\n')}\n\nSTATUS: CLEAN\n`;
const LEDGER_HEAD = '| AC | State | Grader | Verdict / evidence |\n|---|---|---|---|';
const ledger = (rows, head = LEDGER_HEAD) => `# Build state\n\n## Rounds\n| verify rounds | 1 | 0 |\n\n## AC ledger\n${head}\n${rows.join('\n')}\n\n## Rulings\n`;

const FULL = {
  // born before its last edit: the start is the birth, not the mtime
  'prompt.md': { text: 'build the thing', mtime: T0 + 2 * HOUR, born: T0 },
  'map.md': {
    text: mapText(
      ['Phase: SEALED (Step 7) | awaiting launch', 'Updated: 2026-11-10', 'Rigor: high', 'Shape: build'],
      '| D-1 | pick a; Source: user — clarify answer | x |\n| D-2 | pick b; Source: user | x |\n| D-3 | c; Source: requirements | x |\n',
    ),
    mtime: T0 + 13 * HOUR,
    born: T0 + 600_000,
  },
  // sealed at its last write, not at its birth: 12 h 34 min reads 12.6
  'plan-review.md': { text: 'Readiness: READY\n\nSTATUS: CLEAN\n', mtime: T0 + 12 * HOUR + 34 * MINUTE, born: T0 + 11 * HOUR },
  // 61.6 kb rounds up and 2.3 kb rounds down
  'team-plan.md': 'p'.repeat(61_600),
  'definition-of-done.md': dod([ac('AC-1'), ac('AC-2'), ac('AC-3', 'false')]).padEnd(2_300, '\n'),
  'build-state.md': { text: ledger(['| AC-1 | passed | T-9 | PASS |', '| AC-2 | PASS | T-9 | ok |', '| AC-3 | pending | T-9 | — |']), mtime: T0 + 31 * HOUR, born: T0 + 30 * HOUR },
  // not a run-lane directory
  'researcher/findings.md': { mtime: T0 + HOUR },
  // 20 h 32 min reads 20.5
  'coder-a/t1/notes.md': { mtime: T0 + 20 * HOUR + 32 * MINUTE },
  'verifier/results-1.md': { mtime: T0 + 40 * HOUR },
};
const FULL_ROW = {
  effort: '20261110-full',
  shape: 'build',
  rigor: 'high',
  start: '2026-11-10 09:30',
  seal_h: 12.6,
  first_run_h: 20.5,
  create_mtok: 6.5,
  plan_kb: 62,
  dod_kb: 2,
  blocking_acs: 2,
  acs_passed: '2/3',
  asks: 2,
  phase: 'SEALED (Step 7) | awaiting launch',
};
const MAP_ONLY = { 'map.md': { text: mapText(['Phase: clarify', 'Rigor: pending', 'Shape: experiment']), mtime: T0 + 3 * HOUR, born: T0 + HOUR } };
const MAP_ONLY_ROW = {
  effort: 'map-only',
  shape: 'experiment',
  rigor: 'pending',
  start: '2026-11-10 10:30',
  seal_h: ABSENT,
  first_run_h: ABSENT,
  create_mtok: ABSENT,
  plan_kb: ABSENT,
  dod_kb: ABSENT,
  blocking_acs: ABSENT,
  acs_passed: ABSENT,
  asks: 0,
  phase: 'clarify',
};
const LOG_LINES = [
  agentRow({ agent: 'a1', cache_read: 9_000_000 }),
  'not json {',
  // the same agent stopped again: this row replaces the one above
  agentRow({ agent: 'a1', cache_read: 4_540_000 }),
  agentRow({ agent: 'a2', role: 'team-planner', task: 'T-3', cache_read: 2_000_000 }),
  agentRow({ agent: 'a3', role: 'team-coder', task: 'T-3', cache_read: 64_000_000 }),
  agentRow({ agent: 'a4', role: 'team-goal-auditor', phase: 'grade', cache_read: 128_000_000 }),
  JSON.stringify({ type: 'tool', agent: 'a1', seq: 1, tool: 'Bash', chars: 10 }),
  agentRow({ agent: 'a5', session: 'other', cache_read: 256_000_000 }),
  // a row cut short mid-write
  agentRow({ agent: 'a6', cache_read: 512_000_000 }).slice(0, -9),
];

test('the map header gives shape, rigor and a phase cut to 40 characters; lines after the first ## are not header', () => {
  const text = mapText(
    // a key counts only at the start of its line
    ['Summary: reach Phase: two with Rigor: low and Shape: none', 'Phase: SEALED (Step 7) — handoff to `/team-kit-run`, launch pending', 'Updated: 2026-11-10', 'Rigor: high (user-pinned)', 'Shape: experiment'],
    'Shape: campaign\nRigor: low\nPhase: body\n',
  );
  assert.deepEqual(parseHeader(text), { shape: 'experiment', rigor: 'high', phase: 'SEALED (Step 7) — handoff to `/team-kit-' });
  assert.equal(parseHeader(text).phase.length, 40);
  assert.deepEqual(parseHeader('Rigor: high\r\nPhase: run \r\n'), { shape: null, rigor: 'high', phase: 'run' });
  // the rigor word stops at punctuation, and a word the seal gate does not know as a shape reads as none
  assert.deepEqual(parseHeader('Rigor: high; Codex all applicable gates.\nShape: spike\n'), { shape: null, rigor: 'high', phase: null });
  assert.equal(parseHeader('Shape: campaign   <!-- set at triage -->\n').shape, 'campaign');
  // cut by code point: the 40th character is kept whole
  assert.equal(parseHeader(`Phase: ${'a'.repeat(39)}😀b`).phase, `${'a'.repeat(39)}😀`);
});

test('a legacy map without a Shape line, or without any of the three, reads null', () => {
  assert.deepEqual(parseHeader(mapText(['Phase: run', 'Rigor: pending'])), { shape: null, rigor: 'pending', phase: 'run' });
  assert.deepEqual(parseHeader(mapText(['Updated: 2026-11-10'], 'Shape: build\n')), { shape: null, rigor: null, phase: null });
  assert.deepEqual(parseHeader('# Map\nPhase: \n  Shape: indented\n'), { shape: null, rigor: null, phase: null });
});

test('asks counts every Source: user in the map', () => {
  assert.equal(countAsks('# Map\n'), 0);
  assert.equal(countAsks('| D-1 | a; Source: user — x | D-2 b; Source: user |\n- D-3 c; Source: user (prompt.md)\n- D-4 d; Source: requirements\n'), 3);
});

test('blocking acs are the true/yes rows of every id/kind/blocking table, whatever the id', () => {
  const rows = [
    ac('AC-1 first'),
    ac('AC-2 second', '**true**'),
    ac('AC-3', 'Yes (seal-time)'),
    ac('AC-4', 'false'),
    ac('AC-5', 'human-gate'),
    ac('AC-6', 'true', 'pipes `a | b` and \\| stay in the statement'),
    ac('AC-7a', '`true`'),
    ac('AC-8', 'trueish'),
    ac('G-1 advisory gate', 'false'),
    // a continuation row carries no id and is no criterion of its own
    ac('', 'true', 'second half of the statement above'),
  ];
  assert.equal(countBlockingAcs(dod(rows)), 5);
  assert.equal(countBlockingAcs(dod([ac('AC-1', 'false'), ac('AC-2', 'false (advisory)')])), 0);
  // columns are found by name, in any order and case
  assert.equal(countBlockingAcs('| Blocking | Kind | ID | statement |\n|---|---|---|---|\n| yes | semantic | AC-1 | x |\n| no | semantic | AC-2 | y |\n'), 1);
  // letter ids, other prefixes and ids in markup count like any other row
  assert.equal(countBlockingAcs(dod([ac('AC-1'), ac('AC-a no-tunnel'), ac('AC-P0 plan-sealed'), ac('DoD-1'), ac('**AC-2**'), ac('`AC-3 gate`'), ac('TS-1', 'false')])), 6);
  // a contract split over several tables is one contract; a table with another header is not part of it
  const tables = `| inv | statement |\n|---|---|\n| AC-9 | true |\n\n${DOD_HEAD}\n${ac('AC-1')}\n\n### run lane\n\n${DOD_HEAD}\n${ac('AC-2', 'false')}\n${ac('TS-1 host-runs')}\n`;
  assert.equal(countBlockingAcs(tables), 2);
  // a header is the row directly above a separator row: the same cells elsewhere start no table
  const loose = `| id | kind | blocking |\n| AC-1 | semantic | true |\n| AC-2 | semantic | true |\n\n| id | kind | blocking |\n|:-|-|-:|\n| AC-3 | semantic | true |\n`;
  assert.equal(countBlockingAcs(loose), 1);
});

test('blocking acs read null only when no table has the id/kind/blocking header', () => {
  assert.equal(countBlockingAcs('# DoD\n\nprose only\n'), null);
  assert.equal(countBlockingAcs('| id | statement | blocking |\n|---|---|---|\n| AC-1 | x | true |\n'), null);
  assert.equal(countBlockingAcs('| criterion | kind | blocking |\n|---|---|---|\n| AC-1 | semantic | true |\n'), null);
  // the header alone is a table with nothing blocking in it
  assert.equal(countBlockingAcs(`${DOD_HEAD}\n`), 0);
});

test('the grade-seal-gate row is set aside, as the slice budget sets it aside', () => {
  assert.equal(countBlockingAcs(dod([ac('AC-1'), ac('AC-2'), ac('AC-3 grade-seal-gate')])), 2);
  assert.equal(countBlockingAcs(dod([ac('AC-1'), ac('AC-2 grade-seal-gate', 'false')])), 1);
});

test('blocking_acs is the number the seal gate prints for the same contract', () => {
  const second = [ac('TS-1 host-runs'), ac('AC-3', 'false'), ac('AC-9 grade-seal-gate')];
  const contract = `${dod([ac('AC-1'), ac('AC-a letter id'), ac('**AC-2**')])}\n### run lane\n\n${DOD_HEAD}\n${second.join('\n')}\n`;
  const fx = fixture({ gated: { 'prompt.md': '', 'map.md': mapText(['Phase: plan', 'Rigor: high', 'Shape: build']), 'definition-of-done.md': contract } });
  const printed = checkContract(fx.dir('gated')).lines.map((line) => /definition-of-done\.md has (\d+) blocking ACs?\b/.exec(line)?.[1]).find(Boolean);
  assert.ok(printed, 'check-contract.mjs printed no blocking ac count for a build effort');
  assert.equal(Number(printed), 4);
  assert.equal(buildRow(fx.dir('gated'), { stat: fx.stat }).blocking_acs, Number(printed));
});

test('the common ledger shape gives passed over rows', () => {
  const rows = [
    '| AC-1 geo-radius | passed | T-12 | PASS — `grade.md` |',
    '| AC-2 | **PASS** | T-12 | ok |',
    '| AC-3a | pending | T-13 | — |',
    '| AC-3b | failed (1) + needs-human | T-13 | — |',
    '| AC-4 | needs-human · pending-user | — | — |',
    '| seal | pending | lead | — |',
  ];
  assert.deepEqual(parseAcLedger(ledger(rows)), { passed: 2, total: 5 });
  // the state column is found by its header: a needs-human kind is not a state
  const kinds = ledger(['| AC-1 | true | needs-human | passed (local) | lead | — |', '| AC-2 | false | semantic | pending | lead | — |'], '| AC | blocking | kind | state | grader | verdict |\n|---|---|---|---|---|---|');
  assert.deepEqual(parseAcLedger(kinds), { passed: 1, total: 2 });
  // a table that names acs without a state column is not a ledger
  const tasks = '| consumer / AC | task | result path |\n|---|---|---|\n| AC-1 | T-1 | coder/t1.md |\n\n';
  assert.deepEqual(parseAcLedger(`${tasks}${ledger(['| AC-1 | passed | T-9 | PASS |'])}`), { passed: 1, total: 1 });
  assert.deepEqual(parseAcLedger(ledger(['| AC-1 | pass-flagged | PASS |', '| AC-2 | fail | — |'], '| criterion | **Status** | verdict |\n| --- | --- | --- |')), { passed: 1, total: 2 });
  // a pipe inside a code span before the state column does not shift it
  assert.deepEqual(parseAcLedger(ledger(['| AC-1 | `jq .a | wc -l` | passed |', '| AC-2 | `true` | pending |'], '| AC | check | state |\n|---|---|---|')), { passed: 1, total: 2 });
  // rows under a header-like line with no separator row are not a table
  assert.equal(parseAcLedger('| AC | State |\n| AC-0 | pending |\n| AC-1 | passed |\n'), null);
});

test('a ledger that cannot be read with confidence gives null', () => {
  assert.equal(parseAcLedger('# Build state\n\n- AC-1 passed\n- AC-2 pending\n'), null);
  assert.equal(parseAcLedger(ledger(['| AC-1..AC-27 | pending | — | — |', '| AC-28 | pending | — | — |'])), null);
  assert.equal(parseAcLedger(ledger(['| AC-1 confirm-gate, AC-2 review | pending | — | — |'])), null);
  assert.equal(parseAcLedger(ledger(['| AC-1 | passed | — | — |', '| AC-2 | DEFER | — | — |'])), null);
  assert.equal(parseAcLedger(ledger(['| AC-1 | passed | — | — |', '| AC-2 |  | — | — |'])), null);
  assert.equal(parseAcLedger(ledger(['| AC-1 | passed | — | — |', '| AC-1 | failed | — | — |'])), null);
  assert.equal(parseAcLedger(ledger(['| AC-D1 tmdb-proxy | passed | — | — |'])), null);
  assert.equal(parseAcLedger(ledger(['| AC-1 | passed | — | — |', '| **AC-2** | passed | — | — |'])), null);
  assert.equal(parseAcLedger(`${ledger(['| AC-1 | passed | — | — |'])}${ledger(['| AC-2 | passed | — | — |'])}`), null);
  assert.equal(parseAcLedger(ledger(['| T-1 | passed | — | — |'])), null);
});

const createCases = [
  [{ agent: 'a01', role: 'team-designer', phase: 'clarify', cache_read: 1e6 }, true],
  [{ agent: 'a02', role: 'team-researcher', cache_read: 2e6 }, true],
  [{ agent: 'a03', role: 'team-researcher', task: 'T-3', cache_read: 64e6 }, false],
  // a planner prompt that names one task id is still create work
  [{ agent: 'a04', role: 'team-planner', task: 'T-9', desc: 'plan the work', cache_read: 4e6 }, true],
  [{ agent: 'a05', role: 'team-planner', desc: 'plan revision 2', cache_read: 8e6 }, true],
  [{ agent: 'a06', role: 'team-goal-auditor', phase: 'grade', cache_read: 128e6 }, false],
  // rows logged before the phase field: the description decides
  [{ agent: 'a07', role: 'team-goal-auditor', desc: 'grade the run', cache_read: 256e6 }, false],
  [{ agent: 'a08', role: 'team-goal-auditor', desc: 'SAT pass', cache_read: 16e6 }, true],
  [{ agent: 'a09', role: 'team-goal-auditor', phase: 'persona', cache_read: 512e6 }, false],
  [{ agent: 'a10', role: 'team-researcher', phase: 'triage', cache_read: 1024e6 }, false],
  [{ agent: 'a11', role: 'team-coder', cache_read: 2048e6 }, false],
  [{ agent: 'a12', role: 'claude-plugin-pnpm:team-plan-reviewer', cache_read: 32e6 }, true],
  [{ agent: 'a13', role: 'my-team-planner', cache_read: 4096e6 }, false],
  [{ agent: 'a14', role: 'team-goal-auditor', phase: 'grade 2', cache_read: 8192e6 }, false],
  [{ agent: 'a15', role: 'intent-keeper', cache_read: 16384e6 }, false],
].map(([over, create]) => [JSON.parse(agentRow({ session: 'e1', ...over })), create]);
// the create rows carry 1, 2, 4, 8, 16 and 32 million tokens: any other total names the row that leaked
const CREATE_TOTAL = 63e6;

test('isCreateRow keeps create-lane roles, the planner whatever its task, and drops run steps', () => {
  for (const [row, create] of createCases) assert.equal(isCreateRow(row), create, `${row.agent} ${row.role}`);
  assert.equal(isCreateRow({}), false);
});

test('isCreateRow agrees with the create steps plan-usage-report.mjs prints', { skip: existsSync(report) ? false : 'plan-usage-report.mjs not found' }, async () => {
  const lines = createCases.map(([row]) => JSON.stringify(row));
  const { root } = fixture({}, [agentRow({ session: 'e1', agent: 'a01', cache_read: 999e6 }), ...lines, agentRow({ session: 'e2', agent: 'b01', cache_read: 7e6 })]);
  const result = spawnSync(process.execPath, [report, 'e1'], { cwd: root, env: { ...process.env, CLAUDE_PROJECT_DIR: root }, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const out = result.stdout.split('\n');
  const at = out.indexOf('create steps: agents, cached input');
  assert.notEqual(at, -1, result.stdout);
  const steps = [];
  for (let i = at + 1; /^  \S+: \d+, /.test(out[i] ?? ''); i += 1) steps.push(/^  (\S+): (\d+), /.exec(out[i]).slice(1));
  assert.deepEqual(steps.map(([step]) => step).sort(), ['clarify', 'plan', 'plan-review', 'researcher', 'revision', 'sat']);
  assert.equal(steps.reduce((sum, [, agents]) => sum + Number(agents), 0), createCases.filter(([, create]) => create).length);
  assert.match(result.stdout, /^create after the first plan: \S+ of 63\.0M /m);
  const tokens = await readCreateTokens(join(root, LOG));
  assert.deepEqual([...tokens], [['e1', CREATE_TOTAL], ['e2', 7e6]]);
});

test('the log is read line by line: the last row per agent wins and an unparseable line is skipped', async () => {
  const { root } = fixture({}, LOG_LINES);
  assert.deepEqual([...(await readCreateTokens(join(root, LOG)))], [['20261110-full', 6_540_000], ['other', 256_000_000]]);
});

test('a missing log reads null, and the row then shows ? for create_mtok', async () => {
  const fx = fixture({ '20261110-full': FULL });
  assert.equal(await readCreateTokens(join(fx.root, LOG)), null);
  assert.equal(buildRow(fx.dir('20261110-full'), { stat: fx.stat, tokens: null }).create_mtok, UNKNOWN);
  const { lines } = await run(fx);
  assert.equal(splitCells(lines[2])[COLUMNS.indexOf('create_mtok')], '?');
  assert.equal(lines.at(-1), 'median: seal_h 12.6 · first_run_h 20.5 · create_mtok - · plan_kb 62 · blocking_acs 2 (n=1/1/0/1/1 each)');
  assert.equal(JSON.parse((await run(fx, '--json')).lines[0]).rows[0].create_mtok, null);
});

test('median takes the middle value, or the mean of the middle two', () => {
  assert.equal(median([]), null);
  assert.equal(median([5]), 5);
  assert.equal(median([9, 1, 5]), 5);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([10, 9, 100]), 10);
  const values = [3, 1, 2];
  median(values);
  assert.deepEqual(values, [3, 1, 2]);
});

test('the summary counts only rows that carry a number', () => {
  const rows = [
    { seal_h: 1.5, first_run_h: ABSENT, create_mtok: UNKNOWN, plan_kb: 80, blocking_acs: 12 },
    { seal_h: 2.5, first_run_h: 3, create_mtok: UNKNOWN, plan_kb: 81, blocking_acs: UNKNOWN },
    { seal_h: ABSENT, first_run_h: 4, create_mtok: UNKNOWN, plan_kb: ABSENT, blocking_acs: 14 },
  ];
  const medians = summarize(rows);
  assert.deepEqual(medians, { seal_h: 2, first_run_h: 3.5, create_mtok: null, plan_kb: 80.5, blocking_acs: 13, n: { seal_h: 2, first_run_h: 2, create_mtok: 0, plan_kb: 2, blocking_acs: 2 } });
  assert.equal(medianLine(medians), 'median: seal_h 2.0 · first_run_h 3.5 · create_mtok - · plan_kb 80.5 · blocking_acs 13 (n=2/2/0/2/2 each)');
});

test('a birth time of 0 or later than the mtime falls back to the mtime', () => {
  assert.equal(bornMs({ birthtimeMs: 100, mtimeMs: 500 }), 100);
  assert.equal(bornMs({ birthtimeMs: 500, mtimeMs: 500 }), 500);
  assert.equal(bornMs({ birthtimeMs: 0, mtimeMs: 500 }), 500);
  assert.equal(bornMs({ birthtimeMs: 900, mtimeMs: 500 }), 500);
});

test('the start is the birth of prompt.md, then of map.md; a directory with neither is not an effort', () => {
  const fx = fixture({
    both: { 'prompt.md': { mtime: T0 + 5 * HOUR, born: T0 }, 'map.md': { mtime: T0 - HOUR } },
    'map-only': MAP_ONLY,
    notes: { 'notes.md': '' },
  });
  assert.equal(startMs(fx.dir('both'), fx.stat), T0);
  assert.equal(startMs(fx.dir('map-only'), fx.stat), T0 + HOUR);
  assert.equal(startMs(fx.dir('notes'), fx.stat), null);
  assert.equal(startMs(fx.dir('missing'), fx.stat), null);
  assert.equal(buildRow(fx.dir('notes'), { stat: fx.stat }), null);
});

test('the first run is the earliest birth among build-state.md and run-lane files, three levels deep', () => {
  const files = {
    'prompt.md': '',
    'researcher/findings.md': { mtime: T0 + HOUR },
    // a file, not a directory
    'verifier.md': { mtime: T0 + 3 * HOUR },
    'coder-a/l1.md': { mtime: T0 + 9 * HOUR },
    'coder-a/x/y/l3.md': { mtime: T0 + 12 * HOUR, born: T0 + 7 * HOUR },
    'coder-a/x/y/z/l4.md': { mtime: T0 + 2 * HOUR },
    'experiments-notes/e.md': { mtime: T0 + 8 * HOUR },
  };
  const walked = fixture({ e: files });
  assert.equal(firstRunMs(walked.dir('e'), walked.stat), T0 + 7 * HOUR);
  const ledgered = fixture({ e: { ...files, 'build-state.md': { mtime: T0 + 6 * HOUR, born: T0 + 5 * HOUR } } });
  assert.equal(firstRunMs(ledgered.dir('e'), ledgered.stat), T0 + 5 * HOUR);
  const none = fixture({ e: { 'prompt.md': '', 'researcher/findings.md': '' } });
  assert.equal(firstRunMs(none.dir('e'), none.stat), null);
});

test('the walk stops at 2000 files, taken in name order', () => {
  const files = Object.fromEntries(Array.from({ length: 2000 }, (_, i) => [`coder/f${String(i).padStart(4, '0')}.md`, { mtime: T0 + 9 * HOUR }]));
  const fx = fixture({ e: { 'prompt.md': '', ...files, 'coder/z-early.md': { mtime: T0 + HOUR } } });
  assert.equal(firstRunMs(fx.dir('e'), fx.stat), T0 + 9 * HOUR);
});

test('an effort with every file fills every column', async () => {
  const fx = fixture({ '20261110-full': FULL }, LOG_LINES);
  const tokens = await readCreateTokens(join(fx.root, LOG));
  assert.deepEqual(buildRow(fx.dir('20261110-full'), { stat: fx.stat, tokens }), FULL_ROW);
});

test('an effort with only map.md starts at the map and shows - for every absent source', async () => {
  const fx = fixture({ 'map-only': MAP_ONLY }, LOG_LINES);
  const tokens = await readCreateTokens(join(fx.root, LOG));
  assert.deepEqual(buildRow(fx.dir('map-only'), { stat: fx.stat, tokens }), MAP_ONLY_ROW);
});

test('plan_kb and dod_kb are decimal kb, the unit of the 60000-byte slice budget', () => {
  const fx = fixture({
    // one byte over the budget reads 60: in kib it would read 59 and look within it
    over: { 'prompt.md': '', 'team-plan.md': 'p'.repeat(60_001), 'definition-of-done.md': 'd'.repeat(1_499) },
    under: { 'prompt.md': '', 'team-plan.md': 'p'.repeat(59_499), 'definition-of-done.md': 'd'.repeat(1_500) },
  });
  const over = buildRow(fx.dir('over'), { stat: fx.stat });
  const under = buildRow(fx.dir('under'), { stat: fx.stat });
  assert.deepEqual([over.plan_kb, over.dod_kb], [60, 1]);
  assert.deepEqual([under.plan_kb, under.dod_kb], [59, 2]);
});

test('a legacy effort without a Shape line shows - for shape; one without a map shows - for the map columns', () => {
  const fx = fixture({
    legacy: { 'prompt.md': '', 'map.md': mapText(['Phase: run', 'Rigor: high'], 'Shape: build\n') },
    bare: { 'prompt.md': '' },
  });
  const legacy = buildRow(fx.dir('legacy'), { stat: fx.stat });
  assert.deepEqual([legacy.shape, legacy.rigor, legacy.phase, legacy.asks], [ABSENT, 'high', 'run', 0]);
  const bare = buildRow(fx.dir('bare'), { stat: fx.stat });
  assert.deepEqual([bare.shape, bare.rigor, bare.phase, bare.asks], [ABSENT, ABSENT, ABSENT, ABSENT]);
});

test('a contract or a ledger that is there but cannot be read shows ?, and so does a span that runs backwards', () => {
  const fx = fixture({
    odd: {
      'prompt.md': { mtime: T0 },
      'definition-of-done.md': '# DoD\n\n| criterion | evidence |\n|---|---|\n| works | log |\n',
      'build-state.md': { text: ledger(['| AC-1..AC-9 | pending | — | — |']), mtime: T0 + HOUR },
      // older than the prompt: copied in, or the prompt was written again
      'plan-review.md': { mtime: T0 - 2 * HOUR },
      'runtime/copied.log': { mtime: T0 - 50 * HOUR },
    },
    // two minutes early rounds to zero hours
    near: { 'prompt.md': { mtime: T0 }, 'build-state.md': { mtime: T0 - 120_000 } },
  });
  const odd = buildRow(fx.dir('odd'), { stat: fx.stat });
  assert.deepEqual([odd.dod_kb, odd.blocking_acs, odd.acs_passed, odd.seal_h, odd.first_run_h], [0, UNKNOWN, UNKNOWN, UNKNOWN, UNKNOWN]);
  const near = buildRow(fx.dir('near'), { stat: fx.stat });
  assert.ok(Object.is(near.first_run_h, 0));
});

test('--since keeps efforts that start on or after the date, sorted by start; the default window is 21 days', async () => {
  const fx = fixture({
    'c-new': { 'prompt.md': { mtime: T0 + 2 * DAY } },
    'a-mid': { 'prompt.md': { mtime: T0 } },
    'b-old': { 'prompt.md': { mtime: T0 - 30 * DAY } },
    // with now three days after T0 the default window opens at 2026-10-23 00:00 utc
    'd-edge': { 'map.md': { mtime: Date.UTC(2026, 9, 23) } },
    'e-before-edge': { 'prompt.md': { mtime: Date.UTC(2026, 9, 23) - 1000 } },
    _hidden: { 'prompt.md': '' },
    '.dot': { 'prompt.md': '' },
    notes: { 'notes.md': '' },
  });
  writeFileSync(join(fx.root, 'team-session', 'FREEZE-WINDOWS.md'), 'none\n');
  assert.deepEqual(await efforts(fx), ['d-edge', 'a-mid', 'c-new']);
  assert.deepEqual(await efforts(fx, '--since', '2026-11-10'), ['a-mid', 'c-new']);
  assert.deepEqual(await efforts(fx, '--since', '2026-11-11'), ['c-new']);
  assert.deepEqual(await efforts(fx, '--since', '2026-10-23'), ['d-edge', 'a-mid', 'c-new']);
  assert.deepEqual(await efforts(fx, '--since', '2026-01-01'), ['b-old', 'e-before-edge', 'd-edge', 'a-mid', 'c-new']);
  assert.deepEqual(await efforts(fx, '--since', '2027-01-01'), []);
});

test('--effort shows one effort whatever its age, unless --since is given too', async () => {
  const fx = fixture({ 'a-mid': { 'prompt.md': { mtime: T0 } }, 'a-mid-2': { 'prompt.md': { mtime: T0 } }, 'b-old': { 'prompt.md': { mtime: T0 - 30 * DAY } } });
  assert.deepEqual(await efforts(fx, '--effort', 'b-old'), ['b-old']);
  // the whole name, not a prefix
  assert.deepEqual(await efforts(fx, '--effort', 'a-mid'), ['a-mid']);
  assert.deepEqual(await efforts(fx, '--effort', 'b-old', '--since', '2026-11-01'), []);
  assert.deepEqual(await efforts(fx, '--effort', 'a-mid', '--since', '2026-11-01'), ['a-mid']);
  assert.deepEqual(await efforts(fx, '--effort', 'nope'), []);
  const empty = await run(fx, '--effort', 'nope');
  assert.deepEqual([empty.code, empty.lines.length, empty.lines.at(-1)], [0, 4, 'median: seal_h - · first_run_h - · create_mtok - · plan_kb - · blocking_acs - (n=0/0/0/0/0 each)']);
});

test('the default output is a markdown table sorted by start, a blank line and the median line', async () => {
  const fx = fixture({ 'map-only': MAP_ONLY, '20261110-full': FULL }, LOG_LINES);
  const { code, lines } = await run(fx);
  assert.equal(code, 0);
  assert.equal(lines.length, 6);
  assert.deepEqual(splitCells(lines[0]), COLUMNS);
  assert.match(lines[1], /^\| -{3,} \| -{3,} \| -{3,} \| -{3,} \| -{2,}: \| /);
  // the pipe in the phase is escaped, so the row keeps its thirteen cells
  assert.deepEqual(splitCells(lines[2]), ['20261110-full', 'build', 'high', '2026-11-10 09:30', '12.6', '20.5', '6.5', '62', '2', '2', '2/3', '2', 'SEALED (Step 7) \\| awaiting launch']);
  // numbers sit against the right edge of their column, text against the left
  assert.match(lines[2], /\| build +\| high +\|/);
  assert.match(lines[2], /\| {2,}12\.6 \| {2,}20\.5 \|/);
  assert.deepEqual(splitCells(lines[3]), COLUMNS.map((column) => String(MAP_ONLY_ROW[column])));
  // every table line is as wide as the header, so the pipes line up in a terminal
  assert.equal(new Set(lines.slice(0, 4).map((line) => line.length)).size, 1);
  assert.equal(lines[4], '');
  assert.equal(lines[5], 'median: seal_h 12.6 · first_run_h 20.5 · create_mtok 6.5 · plan_kb 62 · blocking_acs 2 (n=1/1/1/1/1 each)');
});

test('--json prints one object: rows keyed by the columns, numbers as numbers, missing values null, medians with their counts', async () => {
  const fx = fixture({ 'map-only': MAP_ONLY, '20261110-full': FULL }, LOG_LINES);
  const { code, lines } = await run(fx, '--json');
  assert.equal(code, 0);
  assert.equal(lines.length, 1);
  const out = JSON.parse(lines[0]);
  assert.deepEqual(Object.keys(out), ['rows', 'medians']);
  assert.deepEqual(out.rows.map((row) => Object.keys(row)), [COLUMNS, COLUMNS]);
  assert.deepEqual(out.rows[0], FULL_ROW);
  assert.deepEqual(out.rows[1], Object.fromEntries(COLUMNS.map((column) => [column, MAP_ONLY_ROW[column] === ABSENT ? null : MAP_ONLY_ROW[column]])));
  assert.equal(out.rows[1].seal_h, null);
  assert.deepEqual(out.medians, { seal_h: 12.6, first_run_h: 20.5, create_mtok: 6.5, plan_kb: 62, blocking_acs: 2, n: { seal_h: 1, first_run_h: 1, create_mtok: 1, plan_kb: 1, blocking_acs: 1 } });
});

test('arguments: the default root is the repo that holds this script; an unknown flag, a bad date or a missing value is an error', () => {
  const opts = parseArgs([], NOW);
  assert.ok(existsSync(join(opts.root, '.claude', 'skills', 'team-kit-create', 'scripts', 'scoreboard.mjs')));
  assert.deepEqual([opts.sinceMs, opts.effort, opts.json], [Date.UTC(2026, 9, 23), null, false]);
  assert.deepEqual(parseArgs(['--since', '2026-11-08', '--effort', 'x', '--json', '--root', '/tmp/r'], NOW), { root: '/tmp/r', sinceMs: Date.UTC(2026, 10, 8), effort: 'x', json: true });
  assert.equal(parseArgs(['--effort', 'x'], NOW).sinceMs, -Infinity);
  for (const argv of [['--bogus'], ['-h'], ['extra'], ['--since'], ['--since', '2026-13-45'], ['--since', '2026-02-31'], ['--since', '11/08/2026'], ['--since', '2026-11-08T00:00'], ['--effort'], ['--root', '']]) {
    assert.ok(parseArgs(argv, NOW).error, argv.join(' '));
  }
});

test('a usage error returns code 2 with the usage line and reads nothing', async () => {
  assert.deepEqual(await scoreboard(['--bogus']), { code: 2, lines: ['USAGE: unknown flag: --bogus', USAGE] });
  assert.deepEqual(await scoreboard(['--since', '2026-02-31']), { code: 2, lines: ['USAGE: bad date: 2026-02-31 (want YYYY-MM-DD)', USAGE] });
  const { root } = fixture({});
  assert.deepEqual(await scoreboard(['--root', join(root, 'missing')]), { code: 2, lines: [`USAGE: no team-session/ under ${join(root, 'missing')}`, USAGE] });
});

const cli = (...argv) => spawnSync(process.execPath, [script, ...argv], { encoding: 'utf8' });

test('the CLI prints the table and exits 0; a usage error goes to stderr with exit 2', () => {
  const { root } = fixture({ 'a-mid': { 'prompt.md': { mtime: T0 } } });
  const ok = cli('--root', root, '--since', '2026-11-01');
  assert.deepEqual([ok.status, ok.stderr], [0, '']);
  const lines = ok.stdout.split('\n');
  assert.deepEqual(splitCells(lines[0]), COLUMNS);
  assert.deepEqual(splitCells(lines[2]).slice(0, 4), ['a-mid', '-', '-', '2026-11-10 09:30']);
  assert.deepEqual(lines.slice(3), ['', 'median: seal_h - · first_run_h - · create_mtok - · plan_kb - · blocking_acs - (n=0/0/0/0/0 each)', '']);
  const json = cli('--root', root, '--since', '2026-11-01', '--json');
  assert.equal(json.status, 0);
  assert.equal(JSON.parse(json.stdout).rows[0].effort, 'a-mid');
  for (const argv of [['--bogus'], ['--since', '2026-13-45'], ['--root', join(root, 'missing')]]) {
    const bad = cli(...argv);
    assert.deepEqual([bad.status, bad.stdout], [2, ''], argv.join(' '));
    assert.ok(bad.stderr.includes(USAGE), bad.stderr);
  }
});

test('the CLI runs the same through a symlink', () => {
  const { root } = fixture({ 'a-mid': { 'prompt.md': { mtime: T0 } } });
  // node resolves the entry's symlinks in import.meta.url: a main-module check on the unresolved path
  // would skip the cli, print nothing and exit 0
  const link = join(mkdtempSync(join(tmpdir(), 'scoreboard-link-')), 'board.mjs');
  symlinkSync(script, link);
  const linked = (...argv) => spawnSync(process.execPath, [link, ...argv], { encoding: 'utf8' });
  const argv = ['--root', root, '--since', '2026-11-01'];
  const direct = cli(...argv);
  const through = linked(...argv);
  assert.notEqual(through.stdout, '');
  assert.deepEqual([through.status, through.stdout, through.stderr], [direct.status, direct.stdout, direct.stderr]);
  const bad = linked('--bogus');
  assert.equal(bad.status, cli('--bogus').status);
  assert.ok(bad.stderr.includes(USAGE), bad.stderr);
});

test('a run leaves the tree as it found it', () => {
  const { root } = fixture({ '20261110-full': FULL, 'map-only': MAP_ONLY }, LOG_LINES);
  const snapshot = () =>
    readdirSync(root, { recursive: true })
      .sort()
      .map((rel) => {
        const st = statSync(join(root, rel));
        return `${rel} ${st.size} ${st.mtimeMs}`;
      });
  const before = snapshot();
  assert.equal(cli('--root', root, '--since', '2026-11-01').status, 0);
  assert.equal(cli('--root', root, '--json').status, 0);
  assert.deepEqual(snapshot(), before);
});
