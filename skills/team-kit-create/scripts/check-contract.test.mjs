import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { after } from 'node:test';
import {
  CARD_FIELDS,
  MAX_BLOCKING_ACS,
  MAX_PLAN_BYTES,
  USAGE,
  VERDICTS,
  checkContract,
  closesWithStatus,
  countBudgetAcs,
  dryRunState,
  findGrant,
  isSatSkip,
  measuredPath,
  parseAcs,
  parseArgs,
  parseCard,
  parseShape,
  premiseFailure,
  premiseRows,
  readShape,
  sectionLines,
  splitCells,
} from './check-contract.mjs';

const script = fileURLToPath(new URL('./check-contract.mjs', import.meta.url));
const clean = 'STATUS: CLEAN';
const NONE = 'none — this contract covers the Destination';
const AC_HEADER = '| id | statement | maps_to | kind | verify | blocking |';
const GRANT = '| D-7 slice-budget | one contract for the whole migration; Source: user, 2026-11-18 | map.md |';
const HOW_TO_SPLIT = 'split into slices (map.md Next slices) or record a live user grant row "| D-n slice-budget | <what was granted>; Source: user, <date> | map.md |" in map.md Decisions so far';
const CARD = 'experiments/X-1-pg17-tmpfs.md';
const DECISION = '# Decision\n\ntmpfs: adopt it for the kernel suite (X-1).\n';
const NEAR_MISSES = ['Shape: Build', 'Shape: builds', 'Shape:build', ' Shape: build', '**Shape:** build', '- Shape: build', '> Shape: build', 'shape: build', 'Shape: buld', 'Shape: spike'];
// references/experiment.md → the card, as it stands before anyone fills it
const TEMPLATE_CARD = [
  '# X-1 pg17-tmpfs',
  'Question: <one sentence a run can answer>',
  'Decides: <the D-n or P-n it settles, and what happens on each outcome>',
  'Measures: <what is recorded, on which surface or data, how many samples>',
  'Stop rule: <the threshold, or the time and cost box — fixed before any result>',
  'Side: autonomous | human-gated — <why>',
  '',
  '## Commands',
  '| # | command | rc | artifact |',
  '',
  '## Results',
  '<raw first: paths, counts, bytes. derived second>',
  '',
  '## Reading',
  '<what this settles, what it does not, the next card if any>',
  '',
  'STATUS: CLEAN | PARTIAL — <what was not measured> | BLOCKED — <the missing precondition>',
  '',
].join('\n');

const made = [];
after(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

const map = ({ shape = 'build', decisions = [], premises = [], next = [NONE] } = {}) =>
  [
    '# Map: fixture',
    '',
    'Destination: the fixture seals',
    'Rigor: low',
    ...(shape ? [`Shape: ${shape}   <!-- Step 1 writes build | experiment | campaign -->`] : []),
    '',
    '## Decisions so far',
    '',
    '<!-- one line per settled decision -->',
    '| Decision | Gist | Detail in |',
    '|----------|------|-----------|',
    ...decisions,
    '',
    '## Premises',
    '',
    '| Premise | Assumption (falsifiable) | Supports | Status |',
    '|---------|--------------------------|----------|--------|',
    '<!-- P-9 commented-example | never checked | D-1 approach-pick | holds -->',
    ...premises,
    '',
    ...(next ? ['## Next slices', '', '<!-- in-scope outcomes this effort does not seal, one line each -->', ...next, ''] : []),
    '## Out of scope',
    '',
  ].join('\n');
const premise = (n, status) => `| P-${n} slug-${n} | assumption ${n} | D-1 approach-pick | ${status} |`;
const acRow = (n, { kind = 'deterministic', blocking = 'true', verify = '`pnpm -F @scope/api test` → exit0' } = {}) =>
  `| AC-${n} slug-${n} | statement ${n} | T-${n} | ${kind} | ${verify} | ${blocking} |`;
const acRows = (count, over) => Array.from({ length: count }, (_, i) => acRow(i + 1, over));
// semantic rows owe no dry-run: the tests about counting use them
const semantic = (count, over) => acRows(count, { kind: 'semantic', ...over });
const separator = (header) => header.replace(/[^|]+/g, '---');
const dod = (rows = [acRow(1)], header = AC_HEADER) => `# Definition of Done\n\n## Acceptance Criteria\n\n${header}\n${separator(header)}\n${rows.join('\n')}\n\n${clean}\n`;
const dryRun = (rows = 1) =>
  ['| AC | command | rc | reading |', '|---|---|---|---|', ...Array.from({ length: rows }, (_, i) => `| AC-${i + 1} | \`pnpm -F @scope/api test\` | 1 | red-as-expected |`)].join('\n');
const sat = (body = dryRun()) => `# SAT\n\n## Clauses\n\nAC-1 c1: reachable\n\n${body === null ? '' : `## Verify dry-run\n\n${body}\n\n`}## Recommendation\n\nseal\n\n${clean}\n`;
const verdict = (ending = clean) => `# Verdict\n\nbody\n\n${ending}\n`;
const card = ({ drop = null, results = null } = {}) =>
  [
    '# X-1 pg17-tmpfs',
    ...CARD_FIELDS.filter((field) => field !== drop).map((field) => `${field} text`),
    '',
    ...(results === null ? [] : ['## Commands', '', '| # | command | rc | artifact |', '', '## Results', '', 'raw: 12 rows, 4096 bytes', '', '## Reading', '', 'tmpfs wins', '', results]),
    '',
  ].join('\n');

// a build session that passes every row; a null value leaves the file out
const session = (files = {}) => {
  const dir = mkdtempSync(join(tmpdir(), 'check-contract-'));
  made.push(dir);
  const all = { 'map.md': map(), 'team-plan.md': '# Plan\n', 'definition-of-done.md': dod(), 'goal-auditor/sat.md': sat(), ...files };
  for (const [path, text] of Object.entries(all)) {
    if (text === null) continue;
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
};
const experiment = (cards = { 'X-1-pg17-tmpfs.md': card() }, extra = {}) => ({
  'map.md': map({ shape: 'experiment', next: null }),
  'team-plan.md': null,
  'definition-of-done.md': null,
  'goal-auditor/sat.md': null,
  ...Object.fromEntries(Object.entries(cards).map(([name, text]) => [`experiments/${name}`, text])),
  ...extra,
});
const run = (files, opts) => checkContract(session(files), opts);
const passes = (files, opts) => {
  const { code, lines } = run(files, opts);
  assert.equal(code, 0, lines.join('\n'));
  return lines.join('\n');
};
const fails = (files, pattern, opts) => {
  const { code, lines } = run(files, opts);
  assert.equal(code, 1, lines.join('\n'));
  assert.match(lines.filter((line) => line.startsWith('FAIL: ')).join('\n'), pattern);
  return lines.join('\n');
};
const cli = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });

test('an effort without a Shape line, or without map.md, is not gated', () => {
  const over = { 'team-plan.md': 'x'.repeat(MAX_PLAN_BYTES + 1) };
  const line = (dir) => `not gated: ${basename(dir)} — map.md carries no Shape line (the effort predates the slice contract)`;
  const unshaped = session({ ...over, 'map.md': map({ shape: null }) });
  assert.deepEqual(checkContract(unshaped, { seal: true }), { code: 0, lines: [line(unshaped)] });
  assert.deepEqual(checkContract(`${unshaped}/`), { code: 0, lines: [line(unshaped)] });
  const mapless = session({ ...over, 'map.md': null });
  assert.deepEqual(checkContract(mapless, { seal: true }), { code: 0, lines: [line(mapless)] });
  // the marker counts only in the header, above the first section
  const late = session({ ...over, 'map.md': '# Map\n\n## Notes\n\nShape: build\n' });
  assert.deepEqual(checkContract(late), { code: 0, lines: [line(late)] });
});

test('the Shape marker is read as pinned, and a line that only looks like one is unreadable', () => {
  for (const shape of ['build', 'experiment', 'campaign', 'pending']) {
    assert.equal(parseShape(map({ shape })), shape);
    assert.equal(readShape(map({ shape })), shape);
  }
  assert.equal(parseShape('# Map\nShape: build'), 'build');
  for (const line of NEAR_MISSES) {
    // a reader that only shows the shape sees none; the gate sees a marker it cannot read
    assert.equal(parseShape(`# Map\n${line}\n`), null, line);
    assert.equal(readShape(`# Map\n${line}\n`), 'unreadable', line);
  }
  // prose that mentions a shape is no marker, and neither is anything below the first section
  const unmarked = ['# Map\nSummary: pick a Shape: build or experiment\n', '# Map\nShape of the work: wide\n', '# Map\n\n## Notes\n\nShape: Build\n', '# Map\n<!-- Shape: set at triage -->\n'];
  for (const text of unmarked) assert.equal(readShape(text), null, text);
  // the first shape-like line decides
  assert.equal(readShape('# Map\nShape: build\n- Shape: campaign\n'), 'build');
  assert.equal(readShape('# Map\n- Shape: campaign\nShape: build\n'), 'unreadable');
});

test('a Shape line the gate cannot read fails closed instead of passing as an ungated effort', () => {
  const over = { 'team-plan.md': 'x'.repeat(MAX_PLAN_BYTES + 1), 'definition-of-done.md': dod(acRows(13)) };
  for (const line of NEAR_MISSES) {
    const files = { ...over, 'map.md': map({ shape: null }).replace('Rigor: low', `Rigor: low\n${line}`) };
    for (const opts of [{}, { seal: true }]) {
      const { code, lines } = run(files, opts);
      assert.equal(code, 1, line);
      assert.equal(lines.length, 1, lines.join('\n'));
      assert.match(lines[0], /^FAIL: map\.md Shape line is unreadable \(".+"\) — write "Shape: build", "Shape: experiment" or "Shape: campaign" at the start of a header line$/);
    }
  }
});

test('a complete build contract seals, one OK line per row', () => {
  const files = { 'map.md': map({ premises: [premise(1, 'holds — read: src/queue.ts:41')] }), 'plan-review.md': verdict() };
  assert.deepEqual(run(files, { seal: true }), {
    code: 0,
    lines: [
      'OK: team-plan.md is 7 bytes (budget 60000 bytes)',
      'OK: definition-of-done.md has 1 blocking AC (budget 12)',
      'OK: 1 premise with a basis or a resolved strike',
      'OK: goal-auditor/sat.md carries the Verify dry-run',
      'OK: map.md Next slices is filled',
      'OK: a STATUS line closes definition-of-done.md, goal-auditor/sat.md, plan-review.md',
    ],
  });
});

test('plan size: team-plan.md passes at the byte budget and fails one byte over, naming the size and both ways out', () => {
  assert.match(passes({ 'team-plan.md': 'x'.repeat(MAX_PLAN_BYTES) }), /^OK: team-plan\.md is 60000 bytes \(budget 60000 bytes\)$/m);
  // the way out shows the grant row as the rule reads it, Source: user included
  const out = fails({ 'team-plan.md': 'x'.repeat(MAX_PLAN_BYTES + 1) }, /^FAIL: team-plan\.md is 60001 bytes/);
  assert.ok(out.split('\n').includes(`FAIL: team-plan.md is 60001 bytes, over the slice budget of 60000 bytes — ${HOW_TO_SPLIT}`), out);
  // bytes, not characters: an em dash is three
  fails({ 'team-plan.md': '—'.repeat(20001) }, /^FAIL: team-plan\.md is 60003 bytes/m);
  // a plan not written yet is no finding before the seal
  assert.doesNotMatch(passes({ 'team-plan.md': null }), /team-plan\.md/);
});

test('blocking ACs: 12 pass and 13 fail; advisory rows are not counted', () => {
  assert.match(passes({ 'definition-of-done.md': dod(semantic(MAX_BLOCKING_ACS)) }), /^OK: definition-of-done\.md has 12 blocking ACs \(budget 12\)$/m);
  const out = fails({ 'definition-of-done.md': dod(semantic(MAX_BLOCKING_ACS + 1)) }, /^FAIL: definition-of-done\.md has 13 blocking ACs/);
  assert.ok(out.split('\n').includes(`FAIL: definition-of-done.md has 13 blocking ACs, over the slice budget of 12 — ${HOW_TO_SPLIT}`), out);
  const advisory = Array.from({ length: 9 }, (_, i) => acRow(13 + i, { kind: 'semantic', blocking: 'false' }));
  assert.match(passes({ 'definition-of-done.md': dod([...semantic(12), ...advisory]) }), /has 12 blocking ACs/);
});

test('blocking ACs: the grade-seal-gate row is not counted against the budget', () => {
  const gate = '| AC-13 grade-seal-gate | graded inputs are in a grade seal on main | T-9 | semantic | `check-grade-seal.mjs` → exit0 | true |';
  const twelve = dod([...semantic(12), gate]);
  assert.match(passes({ 'definition-of-done.md': twelve }), /^OK: definition-of-done\.md has 12 blocking ACs, the grade-seal-gate row not counted \(budget 12\)$/m);
  fails({ 'definition-of-done.md': dod([...semantic(13), gate]) }, /^FAIL: definition-of-done\.md has 13 blocking ACs, the grade-seal-gate row not counted, over the slice budget of 12 — /);
  assert.equal(countBudgetAcs(parseAcs(twelve)), 12);
  // one gate row is set aside, not every row that borrows the name
  assert.equal(countBudgetAcs(parseAcs(dod([...semantic(11), gate, gate.replace('AC-13', 'AC-14')]))), 12);
  // an advisory gate row was never in the count
  assert.equal(countBudgetAcs(parseAcs(dod([...semantic(2), gate.replace('| true |', '| false |')]))), 2);
  assert.equal(countBudgetAcs([]), 0);
});

test('the blocking and kind cells are read as pinned', () => {
  const blocking = ['true', 'TRUE', '**true**', '`true`', 'yes', 'YES', 'true (post-deploy)'];
  const advisory = ['false', 'no', 'n/a', 'human-gate', 'false (advisory)', ''];
  const acs = parseAcs(dod([...blocking, ...advisory].map((cell, i) => acRow(i + 1, { blocking: cell }))));
  assert.deepEqual(acs.map((ac) => ac.blocking), [...blocking.map(() => true), ...advisory.map(() => false)]);
  assert.deepEqual(acs.map((ac) => ac.unread), acs.map(() => false));
  // every kind that is not plainly semantic or needs-human owes the dry-run
  const owing = ['deterministic', 'Deterministic', 'deterministic (absence)', '**deterministic**', '`deterministic`', 'det', 'D', 'semantic + deterministic', 'det, then a semantic review', ''];
  const exempt = ['semantic', 'Semantic (floor)', '**semantic**', 'needs-human'];
  const byKind = parseAcs(dod([...owing, ...exempt].map((kind, i) => acRow(i + 1, { kind }))));
  assert.deepEqual(byKind.map((ac) => ac.deterministic), [...owing.map(() => true), ...exempt.map(() => false)]);
  assert.deepEqual(byKind.slice(0, 2).map((ac) => ac.id), ['AC-1 slug-1', 'AC-2 slug-2']);
});

test('blocking ACs: a blocking cell that says neither yes nor no is no count', () => {
  const cells = ['✓', '_true_', '[x]', 'Y', 'required', 'blocking: true', 'truthy', 'not true'];
  const unread = dod(cells.map((cell, i) => acRow(i + 1, { kind: 'semantic', blocking: cell })));
  assert.deepEqual(parseAcs(unread).map((ac) => [ac.blocking, ac.unread]), cells.map(() => [false, true]));
  const message = 'cannot read the blocking cell of 8 AC rows (AC-1 slug-1, AC-2 slug-2, AC-3 slug-3, …) — write true or false';
  // a warning while the contract is still being written, a failure at the seal
  assert.ok(passes({ 'definition-of-done.md': unread }).split('\n').some((line) => line.startsWith(`WARN: ${message}`)));
  const sealed = fails({ 'definition-of-done.md': unread }, /^FAIL: cannot read the blocking cell of 8 AC rows/m, { seal: true });
  assert.ok(sealed.split('\n').some((line) => line.startsWith(`FAIL: ${message}`)), sealed);
  // an unescaped pipe shifts the columns: whatever lands under blocking is not the blocking cell
  const shifted = dod([acRow(1, { kind: 'semantic' }), '| AC-2 | a | b, a pipe in prose | T-1 | semantic | true | true |']);
  assert.deepEqual(parseAcs(shifted).map((ac) => ac.unread), [false, true]);
  fails({ 'definition-of-done.md': shifted }, /^FAIL: cannot read the blocking cell of 1 AC row \(AC-2\) — /m, { seal: true });
  assert.doesNotMatch(passes({}, { seal: true }), /^WARN: /m);
});

test('blocking ACs: a blank line or an indented row does not end the table', () => {
  const rows = semantic(13);
  const gapped = dod([...rows.slice(0, 6), '', ...rows.slice(6, 9), '', '  ', ...rows.slice(9)]);
  const indented = dod(rows.map((row, i) => (i === 4 ? ` ${row}` : row)));
  const nested = dod(rows).split('\n').map((line) => (line.startsWith('|') ? `    ${line}` : line)).join('\n');
  for (const text of [gapped, indented, nested]) {
    assert.equal(parseAcs(text).filter((ac) => ac.blocking).length, 13);
    fails({ 'definition-of-done.md': text }, /^FAIL: definition-of-done\.md has 13 blocking ACs/);
  }
  // rows after a blank line that open with their own header and separator are another table
  const other = `# DoD\n\n${AC_HEADER}\n${separator(AC_HEADER)}\n${semantic(2).join('\n')}\n\n| deliverable | AC | blocking |\n|---|---|---|\n| token rejection | AC-1 | true |\n\n${clean}\n`;
  assert.deepEqual(parseAcs(other).map((ac) => ac.id), ['AC-1 slug-1', 'AC-2 slug-2']);
});

test('blocking ACs: a DoD without the AC header warns before the seal and fails at it', () => {
  const message = 'cannot count blocking ACs: no AC table header with id, kind and blocking columns — use the DEFINITION-OF-DONE.md header';
  const headers = [
    '| ID | Kind; grader | Blocking statement and producing evidence |',
    '| id | statement | maps_to | kind | verify | blocking now |',
    '| **id** | statement | maps_to | **kind** | verify | **blocking** |',
  ];
  for (const header of headers) {
    const files = { 'definition-of-done.md': dod(acRows(13), header) };
    assert.ok(passes(files).split('\n').includes(`WARN: ${message}`), header);
    assert.ok(fails(files, /cannot count blocking ACs/, { seal: true }).split('\n').includes(`FAIL: ${message}`), header);
  }
  // a header row is one a separator row follows
  assert.equal(parseAcs(`${AC_HEADER}\n${acRow(1)}\n`), null);
});

test('AC columns map by header name, whatever their order or count', () => {
  const header = '| ID | Statement (PASS) | Kind | Blocking | maps_to | verify | evidence | depends_on |';
  const row = (n, blocking, kind = 'deterministic') => `| AC-${n} | s | ${kind} | ${blocking} | T-1 | \`cmd\` → exit0 | verifier/results.md | AC-1 |`;
  assert.deepEqual(parseAcs(dod([row(1, 'true'), row(2, 'false'), row(3, 'true', 'semantic')], header)), [
    { id: 'AC-1', blocking: true, deterministic: true, unread: false },
    { id: 'AC-2', blocking: false, deterministic: true, unread: false },
    { id: 'AC-3', blocking: true, deterministic: false, unread: false },
  ]);
  const wide = dod(Array.from({ length: 13 }, (_, i) => row(i + 1, 'true')), header);
  fails({ 'definition-of-done.md': wide }, /has 13 blocking ACs/);
});

test('an escaped pipe and a pipe inside backticks stay inside their cell', () => {
  assert.deepEqual(splitCells('| a \\| b | `x | y` | c |'), ['a \\| b', '`x | y`', 'c']);
  assert.deepEqual(splitCells('| ``a ` | b`` | c'), ['``a ` | b``', 'c']);
  // an unclosed backtick is literal text
  assert.deepEqual(splitCells('| it`s | fine |'), ['it`s', 'fine']);
  // \` inside a span still closes it: the backticks after it keep their pairs
  assert.deepEqual(splitCells('| `AC-6 \\`needs-human\\` x` | `a|b` |'), ['`AC-6 \\`needs-human\\` x`', '`a|b`']);
  assert.deepEqual(splitCells('a | b'), ['a', 'b']);
  assert.deepEqual(splitCells('| a |  |'), ['a', '']);
  assert.deepEqual(splitCells(''), []);
  const verify = '`rg -c "a|b" x.md` → 2, or `grep "a\\|b" x.md`; a \\| b';
  const acs = parseAcs(dod([acRow(1, { verify, blocking: 'false' }), acRow(2, { verify })]));
  assert.deepEqual(acs.map((ac) => [ac.blocking, ac.unread]), [[false, false], [true, false]]);
});

test('blocking ACs: every id shape and every AC table counts', () => {
  const ids = ['**AC-1**', 'AC-P0 plan-sealed', 'AC-a no-tunnel', 'DoD-1', '`AC-5 gate`', '**AC-E0b** ⟳'];
  const shaped = (kind) => ids.map((id) => `| ${id} | s | T-1 | ${kind} | \`cmd\` | **true** |`);
  // an id cell that is empty once its dressing is stripped is no AC, and neither is a stray separator row
  const blanks = ['|  | a continuation line | T-1 | semantic | `cmd` | true |', '| ** ** | s | T-1 | semantic | `cmd` | true |', separator(AC_HEADER)];
  assert.deepEqual(parseAcs(dod([...shaped('semantic'), ...blanks])).map((ac) => [ac.id, ac.blocking]), [
    ['AC-1', true],
    ['AC-P0 plan-sealed', true],
    ['AC-a no-tunnel', true],
    ['DoD-1', true],
    ['AC-5 gate', true],
    ['AC-E0b ⟳', true],
  ]);
  const laneB = (rows) => `\n## Lane B\n\n${AC_HEADER}\n${separator(AC_HEADER)}\n${rows.join('\n')}\n\n${clean}\n`;
  const out = fails({ 'definition-of-done.md': `${dod(semantic(9))}${laneB(shaped('semantic').slice(0, 4))}` }, /^FAIL: definition-of-done\.md has 13 blocking ACs, over the slice budget of 12 — /);
  assert.doesNotMatch(out, /^WARN: /m);
  assert.match(passes({ 'definition-of-done.md': `${dod(semantic(9))}${laneB(shaped('semantic').slice(0, 3))}` }), /^OK: definition-of-done\.md has 12 blocking ACs \(budget 12\)$/m);
  // the dry-run is owed for the same rows: a bold-id deterministic AC in a second table asks for it
  const first = dod(semantic(1));
  fails({ 'definition-of-done.md': `${first}${laneB(shaped('deterministic').slice(0, 1))}`, 'goal-auditor/sat.md': sat(null) }, /^FAIL: goal-auditor\/sat\.md has no "## Verify dry-run" section — /);
  passes({ 'definition-of-done.md': first, 'goal-auditor/sat.md': sat(null) });
});

test('grant: a live user slice-budget row downgrades both budget failures to INFO', () => {
  const over = { 'team-plan.md': 'x'.repeat(MAX_PLAN_BYTES + 1), 'definition-of-done.md': dod(semantic(13)) };
  assert.equal(run(over, { seal: true }).lines.filter((line) => line.startsWith('FAIL: ')).length, 2);
  const out = passes({ ...over, 'map.md': map({ decisions: ['| D-3 approach-pick | queue first; Source: user — clarify answer | design.md |', GRANT] }) }, { seal: true }).split('\n');
  assert.ok(out.includes('INFO: over the slice budget under D-7 — team-plan.md is 60001 bytes (budget 60000 bytes)'), out.join('\n'));
  assert.ok(out.includes('INFO: over the slice budget under D-7 — definition-of-done.md has 13 blocking ACs (budget 12)'), out.join('\n'));
  assert.equal(findGrant(map({ decisions: [GRANT] })), 'D-7');
  // what follows the Source clause is not part of it
  assert.equal(findGrant(map({ decisions: ['| D-4 slice-budget | one contract; Source: user — checkpoint answer; afk stays off | map.md |'] })), 'D-4');
});

test('grant: a row that is not a live user grant waives nothing', () => {
  const over = { 'team-plan.md': 'x'.repeat(MAX_PLAN_BYTES + 1) };
  const rows = [
    '| D-7 slice-budget | the lead judged one contract enough | map.md |',
    // only the first cell names the grant, undressed: another decision that mentions it is none
    '| D-7 approach-pick | one queue; D-7 slice-budget was not asked for; Source: user — clarify answer | map.md |',
    '| D-7 slice-budgets | Source: user — clarify answer | map.md |',
    '| **D-7 slice-budget** | one contract; Source: user, 2026-11-18 | map.md |',
    '| note | D-7 slice-budget; Source: user | map.md |',
    '<!-- | D-7 slice-budget | a commented example; Source: user | map.md | -->',
    // the user-authority rule of userAccepts: a waiver, prompt.md or afk never grants for the user
    '| D-7 slice-budget | one contract; Source: user (prompt.md take-all instruction) | map.md |',
    '| D-7 slice-budget | one contract; Source: user waiver in the brief | map.md |',
    '| D-7 slice-budget | one contract; Source: user — AFK default | map.md |',
    '| D-7 slice-budget | one contract; Source: users agreed | map.md |',
    // a delegate or the original prompt is not the live user
    '| D-7 slice-budget | one contract; Source: user-delegated | map.md |',
    '| D-7 slice-budget | one contract; Source: user-proxy, 2026-11-18 | map.md |',
    '| D-7 slice-budget | one contract; Source: user prompt | map.md |',
    // a row that names the grant only to refuse, revoke or defer it
    '| D-7 slice-budget | user DECLINED the over-budget grant (Source: user) | map.md |',
    '| D-7 slice-budget | REVOKED by D-9 (Source: user) | map.md |',
    '| D-7 slice-budget | asked at the checkpoint, awaiting answer — Source: user | map.md |',
    '| D-7 slice-budget | over-budget seal not granted; Source: user, 2026-11-18 | map.md |',
    '| D-7 slice-budget | grant pending; Source: user | map.md |',
  ];
  for (const row of rows) fails({ ...over, 'map.md': map({ decisions: [row] }) }, /^FAIL: team-plan\.md is 60001 bytes/);
  // a comment that does not close on its line runs to the one that does
  fails({ ...over, 'map.md': map({ decisions: ['<!-- an example grant:', GRANT, '-->'] }) }, /^FAIL: team-plan\.md is 60001 bytes/);
  // the same row outside Decisions so far
  fails({ ...over, 'map.md': map({ premises: [GRANT] }) }, /^FAIL: team-plan\.md is 60001 bytes/);
});

test('grant: a grant waives the budget and nothing else', () => {
  const uncountable = { 'map.md': map({ decisions: [GRANT] }), 'definition-of-done.md': dod(acRows(2), '| id | statement |') };
  fails(uncountable, /^FAIL: cannot count blocking ACs/, { seal: true });
  fails({ 'map.md': map({ decisions: [GRANT], premises: [premise(1, 'holds')] }) }, /^FAIL: premise P-1 has no basis/);
});

test('premises: every premise names its basis, and a bare holds fails', () => {
  const based = ['holds — read: src/queue.ts:41', `holds — measured: ${CARD}`, 'unmeasured: no autonomous run reaches production', 'read:src/a.ts:1'];
  assert.match(passes({ [CARD]: card(), 'map.md': map({ premises: based.map((status, i) => premise(i + 1, status)) }) }), /^OK: 4 premises with a basis or a resolved strike$/m);
  const out = fails({ 'map.md': map({ premises: [premise(1, based[0]), premise(2, 'holds')] }) }, /^FAIL: premise P-2 has no basis — its Status cell needs read: <file:line>, measured: <card> or unmeasured: <why no autonomous run exists>$/m);
  assert.doesNotMatch(out, /P-1|^OK: \d+ premise/m);
  // the unfilled template and a word about some later re-scope are no basis
  const bare = ['holds', 'read:', 'measured: ', 'unread: x', 'reads: x', '', 'holds — read: <file:line>', 'unmeasured: <why no autonomous run exists>', 'holds — may need to be re-scoped later', 'not withdrawn'];
  for (const status of bare) assert.equal(premiseFailure(status), 'basis', status);
  for (const status of ['re-scoped (D-9)', 'withdrawn (D-9)', 'holds → re-scoped (D-9)', 'holds →withdrawn']) assert.equal(premiseFailure(status), null, status);
  // a comment cut off above a row does not hide it
  fails({ 'map.md': map({ premises: ['<!-- status = holds + its basis', premise(2, 'holds')] }) }, /^FAIL: premise P-2 has no basis — /);
  // minting premises is optional: no row, or no section, passes
  assert.match(passes({}), /^OK: no premises minted$/m);
  assert.match(passes({ 'map.md': '# Map\n\nShape: build\n\n## Notes\n' }), /^OK: no premises minted$/m);
});

test('premises: a measured basis names a file that exists under the session', () => {
  const files = (status) => ({ [CARD]: card(), 'researcher/findings.md': '# Findings\n', 'map.md': map({ premises: [premise(1, status)] }) });
  const cited = [
    `holds — measured: ${CARD}`,
    `holds. Basis — measured: \`${CARD}\` (2026-11-18: 3 runs)`,
    'holds (measured; bears). Basis — measured: `researcher/findings.md`; server side unmeasured: not built',
    `measured: ${CARD}.`,
    `measured: ${CARD}:12-40, cold cache`,
  ];
  for (const status of cited) passes(files(status));
  // a file that exists outside the session is not the effort's own measurement
  const unfound = ['holds — measured: experiments/X-9-nope.md', 'holds — measured: X-1', `measured: \`experiments/X-9-nope.md\`, see ${CARD}`, 'measured: ../outside.md', `measured: ${script}`, 'measured: experiments', 'measured: on the tmpfs run, 3 samples'];
  for (const status of unfound) fails(files(status), /^FAIL: premise P-1: measured basis names no existing file \(".+"\) — /);
  // read and unmeasured stay text: nothing is looked up for them
  passes(files('holds — read: src/no-such-file.ts:1'));
  passes(files('unmeasured: experiments/X-9-nope.md cannot run without the prod token'));
  assert.equal(measuredPath('holds — read: a.ts:1'), null);
  assert.equal(measuredPath('server side unmeasured: not built'), null);
  assert.equal(measuredPath('holds (`x.md`). Basis — measured: `researcher/findings.md` (file side)'), 'researcher/findings.md');
  assert.equal(measuredPath('measured: experiments/X-1-a.md, then `raw.txt`'), 'raw.txt');
  assert.equal(measuredPath('measured: experiments/X-1-a.md).'), 'experiments/X-1-a.md');
});

test('premises: a struck premise fails until the strike is resolved', () => {
  fails({ 'map.md': map({ premises: [premise(3, 'STRUCK (researcher/r2.md)')] }) }, /^FAIL: premise P-3 is struck and unresolved — /);
  // saying what no longer holds is the strike itself, not its resolution
  fails({ 'map.md': map({ premises: [premise(3, 'STRUCK — no longer holds')] }) }, /^FAIL: premise P-3 is struck and unresolved — /);
  passes({ 'map.md': map({ premises: [premise(3, 'STRUCK (researcher/r2.md) → re-scoped (D-9)')] }) });
  passes({ 'map.md': map({ premises: [premise(3, 'STRUCK (researcher/r2.md) → holds (human held)')] }) });
  const resolved = ['STRUCK (x) → re-scoped (y)', 'STRUCK (x) → withdrawn (y)', 'STRUCK (x) → holds (human held)', 'STRUCK (x) →holds', 'STRUCK (x); holds (human held, D-9)', 'STRUCK (x), then re-scoped (y)'];
  for (const status of resolved) assert.equal(premiseFailure(status), null, status);
  const unresolved = ['STRUCK', 'STRUCK — no longer holds', 'STRUCK (x): the claim holds only on arm64', 'STRUCK (x) → holdsteady', 'STRUCK (x) → holding'];
  for (const status of unresolved) assert.equal(premiseFailure(status), 'struck', status);
  // a resolution still being asked for is none
  const asked = [
    'STRUCK (link) — not yet re-scoped',
    'STRUCK (link) → pending user: re-scoped / withdrawn / holds (human held)?',
    'STRUCK (link) — ask user whether to mark it withdrawn',
    'STRUCK (link) → re-scoped (TBD)',
    'STRUCK (link) → awaiting the user: withdrawn or re-scoped',
  ];
  for (const status of asked) assert.equal(premiseFailure(status), 'struck', status);
  // the latest strike decides, whatever stands before it
  for (const status of ['holds — read: a.ts:1 → STRUCK (x)', 're-scoped (y) → STRUCK (z)', 'STRUCK (x) → holds (human held) → STRUCK (z)']) {
    assert.equal(premiseFailure(status), 'struck', status);
  }
});

test('premise rows come from the Premises section only, with the Status column as status', () => {
  const text = map({
    decisions: ['| P-7 misplaced | not a premise | holds |'],
    premises: [
      premise(1, 'holds — read: a.ts:1'),
      '| P-2 short | holds |',
      '| **P-3 bold** | x | D-1 | holds — read: b.ts:2 |',
      '| `P-4` | x | D-1 | holds |',
      '| note | P-5 is not the first cell | D-1 | holds |',
      'P-6 is prose, not a row | holds',
    ],
  });
  assert.deepEqual(premiseRows(text), [
    { id: 'P-1', status: 'holds — read: a.ts:1' },
    { id: 'P-2', status: 'holds' },
    { id: 'P-3', status: 'holds — read: b.ts:2' },
    { id: 'P-4', status: 'holds' },
  ]);
  // the status is the cell under the Status header: a trailing notes cell cannot stand in for it
  const noted = '# Map\n\nShape: build\n\n## Premises\n\n| Premise | Assumption | **Status** | Notes |\n|---|---|---|---|\n| P-1 a | x | STRUCK (r2) | read: x.ts:12 |\n| **P-2** b | y | holds | read: y.ts:3 |\n';
  assert.deepEqual(premiseRows(noted), [
    { id: 'P-1', status: 'STRUCK (r2)' },
    { id: 'P-2', status: 'holds' },
  ]);
  const out = fails({ 'map.md': noted }, /^FAIL: premise P-1 is struck and unresolved — /);
  assert.match(out, /^FAIL: premise P-2 has no basis — /m);
});

test('premises: a premises heading the gate cannot read fails instead of reading as none minted', () => {
  for (const heading of ['## Premises (frozen at seal)', '### Premises', '## Working premises', '## premises']) {
    const text = map({ premises: [premise(1, 'holds')] }).replace('## Premises', heading);
    const out = fails({ 'map.md': text }, /^FAIL: map\.md has a premises heading the gate cannot read — name the section exactly "## Premises"$/);
    assert.doesNotMatch(out, /no premises minted/);
  }
});

test('a section runs from its ## heading to the next one, comments dropped', () => {
  const text = ['# T', 'intro', '## A', 'a1', '<!-- note -->', '### sub', 'a2', '<!-- open', 'hidden', 'closed --> tail', 'a3', '## B', 'b1', '## A', 'a4'].join('\n');
  assert.deepEqual(sectionLines(text, 'A'), ['a1', '### sub', 'a2', 'a3', 'a4']);
  assert.deepEqual(sectionLines(text, 'B'), ['b1']);
  assert.equal(sectionLines(text, 'C'), null);
  assert.equal(sectionLines(text, 'sub'), null);
  assert.deepEqual(sectionLines('## A  \r\nx\r\n', 'A'), ['x', '']);
  assert.equal(sectionLines('## A (old)\nx', 'A'), null);
  // an opener that never closes hides nothing below it
  assert.deepEqual(sectionLines('## A\n<!-- cut off\nx\n## B\ny -->', 'A'), ['x']);
});

test('sat dry-run: every deterministic blocking AC needs its row in the sat.md Verify dry-run', () => {
  assert.match(passes({}), /^OK: goal-auditor\/sat\.md carries the Verify dry-run$/m);
  passes({ 'goal-auditor/sat.md': sat('none runnable — every verify cell needs the image T-4 builds') });
  fails({ 'goal-auditor/sat.md': sat(null) }, /^FAIL: goal-auditor\/sat\.md has no "## Verify dry-run" section — .*\.claude\/skills\/team-kit-create\/references\/acceptance\.md → Step 1b$/m);
  fails({ 'goal-auditor/sat.md': sat('| AC | command |\n|---|---|') }, /^FAIL: goal-auditor\/sat\.md has a "## Verify dry-run" section with neither a result table nor .*acceptance\.md → Step 1b$/m);
  // one row for three ACs is not the dry-run, and neither are three lines that happen to start with a pipe
  const three = { 'definition-of-done.md': dod(acRows(3)) };
  fails({ ...three, 'goal-auditor/sat.md': sat(dryRun(1)) }, /^FAIL: goal-auditor\/sat\.md has a "## Verify dry-run" table with fewer result rows than the DoD's 3 deterministic blocking ACs — /);
  fails({ ...three, 'goal-auditor/sat.md': sat('| a |\n| b |\n| c |') }, /fewer result rows than the DoD's 3 deterministic blocking ACs/);
  passes({ ...three, 'goal-auditor/sat.md': sat(dryRun(3)) });
  passes({ ...three, 'goal-auditor/sat.md': sat('none runnable — the image is not built yet') });
  // a kind written short, dressed or mixed still owes it
  for (const kind of ['det', 'D', '**deterministic**', 'semantic + deterministic']) {
    fails({ 'definition-of-done.md': dod([acRow(1, { kind })]), 'goal-auditor/sat.md': sat(null) }, /^FAIL: goal-auditor\/sat\.md has no "## Verify dry-run" section — /);
  }
  for (const heading of ['### Verify dry-run', '## Verify dry-run (SAT)', '## verify dry-run', ' ## Verify dry-run']) assert.equal(dryRunState(`${heading}\n\n${dryRun()}\n`), 'missing', heading);
  assert.equal(dryRunState(`## Verify dry-run  \n\nnone runnable — the image is not built yet\n\n${clean}\n`), 'ok');
  // a table under a later heading is not the dry-run
  assert.equal(dryRunState(`## Verify dry-run\n\n## Clauses\n\n${dryRun()}\n`), 'empty');
  for (const body of ['none runnable', '- none runnable — x', 'None runnable — x', '']) assert.equal(dryRunState(`## Verify dry-run\n\n${body}\n`), 'empty', body);
  assert.equal(dryRunState(`## Verify dry-run\n\n${dryRun(2)}\n`, 3), 'short');
  assert.equal(dryRunState(`## Verify dry-run\n\n${dryRun(3)}\n`, 3), 'ok');
});

test('sat dry-run: without a deterministic blocking AC, or without sat.md, the dry-run is not asked for', () => {
  const none = dod([acRow(1, { kind: 'semantic' }), acRow(2, { blocking: 'false' }), acRow(3, { kind: 'needs-human' })]);
  assert.doesNotMatch(passes({ 'definition-of-done.md': none, 'goal-auditor/sat.md': sat(null) }, { seal: true }), /dry-run/);
  assert.doesNotMatch(passes({ 'goal-auditor/sat.md': null }), /dry-run/);
});

test('next slices: the seal needs a slice line or the none line; before the seal it is not checked', () => {
  assert.doesNotMatch(passes({ 'map.md': map({ next: null }) }), /Next slices/);
  fails({ 'map.md': map({ next: null }) }, /^FAIL: map\.md has no "## Next slices" section — /, { seal: true });
  // a comment, a lone dash or a placeholder for the cut still to come names no slice
  const empty = [[], ['<!--', NONE, '-->', '   '], ['   <!-- none yet -->'], ['-'], ['—'], ['TBD'], ['todo: cut the slices'], ["pending the planner's slice cut"], ['- (placeholder)']];
  for (const next of empty) fails({ 'map.md': map({ next }) }, /^FAIL: map\.md Next slices names no slice — /, { seal: true });
  // a comment after content leaves the line content, and one real line is enough
  for (const next of [[NONE], ['- slice 2: billing export; needs the ledger table this one ships'], [`${NONE}   <!-- lead, 2026-11-18 -->`], ['TBD', '- slice 2: the read path']]) {
    assert.match(passes({ 'map.md': map({ next }) }, { seal: true }), /^OK: map\.md Next slices is filled$/m);
  }
});

test('STATUS lines: every verdict file that exists ends with its own STATUS line', () => {
  // spelled out: a file dropped from the list is a failing test, not a check that quietly shrank
  assert.deepEqual(VERDICTS, [
    'design-critic/design-critique.md',
    'verification-approach.md',
    'definition-of-done.md',
    'goal-auditor/sat.md',
    'goal-auditor/goal-audit.md',
    'plan-review.md',
    'designer/frame-check.md',
  ]);
  const all = Object.fromEntries(VERDICTS.map((name) => [name, verdict(`${clean}\n\n  \n`)]));
  assert.ok(passes(all).split('\n').includes(`OK: a STATUS line closes ${VERDICTS.join(', ')}`));
  const endings = ['**STATUS: CLEAN**', 'STATUS: CLEAN\n\nSee the findings above.', 'The verdict is STATUS: CLEAN', ' STATUS: CLEAN', 'STATUS:CLEAN', '`STATUS: CLEAN`', ''];
  VERDICTS.forEach((name, i) => {
    const out = fails({ [name]: verdict(endings[i]) }, /does not end with a STATUS line: its last non-empty line is "/);
    assert.ok(out.split('\n').some((line) => line.startsWith(`FAIL: ${name} does not end with a STATUS line: `)), out);
  });
  fails({ 'plan-review.md': ' \n\n' }, /^FAIL: plan-review\.md does not end with a STATUS line: the file is empty — /m);
  for (const text of ['STATUS: CLEAN', 'a\nSTATUS: ERRORS_REMAINING: 2\n\n \t\n', 'a\r\nSTATUS: CLEAN\r\n']) assert.equal(closesWithStatus(text), true, text);
  for (const text of ['', '**STATUS: CLEAN**', 'STATUS: CLEAN\ndone', '> STATUS: CLEAN']) assert.equal(closesWithStatus(text), false, text);
});

test('STATUS lines: the one-line sat.md proportionality skip is exempt only while no dry-run is owed', () => {
  const skip = 'Proportionality skip: no blocking AC grades a frozen artifact, a witness, production state or paid work.\n';
  const unowed = { 'definition-of-done.md': dod(semantic(1)) };
  const out = passes({ ...unowed, 'goal-auditor/sat.md': skip }, { seal: true }).split('\n');
  assert.ok(out.includes('INFO: goal-auditor/sat.md is the one-line proportionality skip — it carries no STATUS line of its own'), out.join('\n'));
  assert.ok(out.includes('OK: a STATUS line closes definition-of-done.md'), out.join('\n'));
  // two non-empty lines are still the skip form; a third makes it a verdict that closes itself
  passes({ ...unowed, 'goal-auditor/sat.md': `# SAT\n\n${skip}` }, { seal: true });
  fails({ ...unowed, 'goal-auditor/sat.md': `# SAT\n\n${skip}\nexecutor feasibility: checked\n` }, /^FAIL: goal-auditor\/sat\.md does not end with a STATUS line/);
  // a short sat.md that does not say so is no skip
  fails({ ...unowed, 'goal-auditor/sat.md': '# SAT\n\nnothing to check\n' }, /^FAIL: goal-auditor\/sat\.md does not end with a STATUS line/);
  // the exemption is sat.md's alone
  fails({ ...unowed, 'plan-review.md': skip }, /^FAIL: plan-review\.md does not end with a STATUS line/);
  // once the DoD holds a deterministic blocking AC the skip owes both, and one FAIL says so: no line calls it fine
  for (const opts of [{}, { seal: true }]) {
    const owed = run({ 'goal-auditor/sat.md': skip }, opts);
    assert.equal(owed.code, 1);
    const about = owed.lines.filter((line) => line.includes('sat.md'));
    assert.equal(about.length, 1, owed.lines.join('\n'));
    assert.match(about[0], /^FAIL: goal-auditor\/sat\.md is the one-line proportionality skip, but the DoD holds 1 deterministic blocking AC — a map with a Shape line owes "## Verify dry-run" and a closing STATUS line even under the skip: /);
  }
  assert.equal(isSatSkip('goal-auditor/sat.md', skip), true);
  assert.equal(isSatSkip('goal-auditor/sat.md', verdict()), false);
  assert.equal(isSatSkip('goal-auditor/goal-audit.md', skip), false);
});

test('seal files: the seal needs team-plan.md, definition-of-done.md and goal-auditor/sat.md, one FAIL each', () => {
  const unwritten = { 'team-plan.md': null, 'definition-of-done.md': null, 'goal-auditor/sat.md': null };
  const out = fails(unwritten, /^FAIL: team-plan\.md is missing — /, { seal: true });
  assert.deepEqual(out.split('\n').flatMap((line) => /^FAIL: (\S+) is missing — /.exec(line)?.[1] ?? []), ['team-plan.md', 'definition-of-done.md', 'goal-auditor/sat.md']);
  // before the seal an unwritten file is no finding
  assert.deepEqual(run({ ...unwritten, 'map.md': map({ next: null }) }), { code: 0, lines: ['OK: no premises minted'] });
});

test('seal shape: a pending Shape fails the seal and is only a note before it', () => {
  const pending = { 'map.md': map({ shape: 'pending' }), 'team-plan.md': 'x'.repeat(MAX_PLAN_BYTES + 1) };
  assert.deepEqual(run(pending), { code: 0, lines: ['INFO: Shape pending — triage has not picked a shape yet'] });
  const sealed = run(pending, { seal: true });
  assert.equal(sealed.code, 1);
  assert.equal(sealed.lines.length, 1);
  assert.match(sealed.lines[0], /^FAIL: Shape is pending — /);
});

test('experiment: a card written before its run passes until the seal', () => {
  // the fields are filled and nothing has run: the Results heading is there, with nothing under it and no STATUS
  const before = [...card().trimEnd().split('\n'), '', '## Commands', '', '| # | command | rc | artifact |', '', '## Results', '', '## Reading', ''].join('\n');
  for (const text of [card(), before]) {
    assert.deepEqual(run(experiment({ 'X-1-pg17-tmpfs.md': text })), { code: 0, lines: ['OK: experiments/X-1-pg17-tmpfs.md carries every card field'] });
  }
  const sealed = fails(experiment({ 'X-1-pg17-tmpfs.md': before }), /^FAIL: experiments\/X-1-pg17-tmpfs\.md has no content under "## Results" — /, { seal: true });
  assert.match(sealed, /^FAIL: experiments\/X-1-pg17-tmpfs\.md does not end with a STATUS line of its own — /m);
  assert.match(sealed, /^FAIL: decision\.md is missing — /m);
});

test('experiment: cards that ran and closed, with decision.md, seal', () => {
  const done = { 'X-1-a.md': card({ results: 'STATUS: PARTIAL — the cold-cache run was not measured' }), 'X-2-b.md': card({ results: clean }) };
  assert.deepEqual(run(experiment(done, { 'decision.md': DECISION }), { seal: true }), {
    code: 0,
    lines: [
      'OK: experiments/X-1-a.md carries every card field and its Results end with a STATUS line',
      'OK: experiments/X-2-b.md carries every card field and its Results end with a STATUS line',
      'OK: decision.md closes the experiment',
    ],
  });
  // each of the three is owed at the seal: the decision, results on every card, and their STATUS line
  fails(experiment(done), /^FAIL: decision\.md is missing — /, { seal: true });
  fails(experiment(done, { 'decision.md/notes.txt': 'a directory is no decision' }), /^FAIL: decision\.md is missing — /, { seal: true });
  fails(experiment({ ...done, 'X-3-c.md': card() }, { 'decision.md': DECISION }), /^FAIL: experiments\/X-3-c\.md has no content under "## Results" — /, { seal: true });
  fails(experiment({ 'X-1-a.md': card({ results: 'tmpfs wins by 3x' }) }, { 'decision.md': DECISION }), /^FAIL: experiments\/X-1-a\.md does not end with a STATUS line of its own — /, { seal: true });
});

test('experiment: a card missing a field fails and names it, and a template line is no field', () => {
  for (const field of CARD_FIELDS) {
    const out = fails(experiment({ 'X-1-a.md': card({ drop: field }) }), /^FAIL: experiments\/X-1-a\.md has no filled line starting with /);
    assert.ok(out.includes(`has no filled line starting with ${field} — `), out);
  }
  // a field counts only at the start of a line
  const dressed = card().replace('Side:', '- Side:').replace('Question:', '**Question:**');
  fails(experiment({ 'X-1-a.md': dressed, 'X-2-b.md': card() }), /^FAIL: experiments\/X-1-a\.md has no filled line starting with Question:, Side: — /);
  assert.deepEqual(parseCard('Question: q\nSide: autonomous — read-only\n').missing, ['Decides:', 'Measures:', 'Stop rule:']);
  // the template pasted as it stands, and five labels with nothing after them, are no card
  assert.deepEqual(parseCard(TEMPLATE_CARD), { missing: ['Question:', 'Decides:', 'Measures:', 'Stop rule:'], results: false, closed: false });
  assert.deepEqual(parseCard(CARD_FIELDS.join('\n')).missing, CARD_FIELDS);
  for (const opts of [{}, { seal: true }]) {
    fails(experiment({ 'X-1-a.md': TEMPLATE_CARD }, { 'decision.md': DECISION }), /^FAIL: experiments\/X-1-a\.md has no filled line starting with Question:, Decides:, Measures:, Stop rule: — /, opts);
  }
});

test('experiment: a card with results must end with a STATUS line of its own', () => {
  // bold, prose, and the template line that still lists every status between pipes
  for (const ending of ['**STATUS: CLEAN**', 'tmpfs wins by 3x', 'STATUS: CLEAN | PARTIAL — <what was not measured> | BLOCKED — <the missing precondition>']) {
    fails(experiment({ 'X-1-a.md': card({ results: ending }) }), /^FAIL: experiments\/X-1-a\.md does not end with a STATUS line of its own — /);
  }
  // without results nothing has to close the card
  assert.deepEqual(parseCard(card()), { missing: [], results: false, closed: false });
  assert.equal(parseCard('### Results\n\nraw: 3 rows\n').results, false);
  assert.equal(parseCard('## Results  \n\nraw: 3 rows\n').results, true);
  // a heading alone, or over its template line, is no result
  assert.equal(parseCard('## Results\n\n## Reading\n\ntmpfs wins\n').results, false);
  assert.equal(parseCard('## Results\n<raw first: paths, counts, bytes. derived second>\n').results, false);
});

test('experiment: the seal needs a card, and the build rows do not apply', () => {
  assert.deepEqual(run(experiment({})), { code: 0, lines: ['INFO: no experiment card yet (experiments/X-*.md)'] });
  fails(experiment({}, { 'decision.md': DECISION }), /^FAIL: no experiment card — write experiments\/X-\{n\}-\{slug\}\.md with Question:, Decides:, Measures:, Stop rule:, Side: lines/, { seal: true });
  // notes, a capture directory and a directory named like a card are not cards
  const strays = { 'decision.md': DECISION, 'experiments/notes.md': 'free text', 'experiments/X-1-pg17-tmpfs/raw.txt': 'raw', 'experiments/X-2-dir.md/raw.txt': 'raw' };
  fails(experiment({}, strays), /^FAIL: no experiment card — /, { seal: true });
  // an over-budget DoD, a bare premise and an unclosed review are build rows: an experiment does not answer for them
  const buildOnly = {
    'map.md': map({ shape: 'experiment', next: null, premises: [premise(1, 'holds')] }),
    'definition-of-done.md': dod(acRows(MAX_BLOCKING_ACS + 1)),
    'plan-review.md': verdict('**STATUS: CLEAN**'),
    'decision.md': DECISION,
  };
  const done = { 'X-1-pg17-tmpfs.md': card({ results: clean }) };
  assert.equal(run(experiment(done, buildOnly), { seal: true }).code, 0);
  // a plan is the one build file it answers for: it seals only under Shape: build
  const withPlan = experiment(done, { ...buildOnly, 'team-plan.md': '# Plan\n' });
  assert.equal(run(withPlan).code, 0);
  fails(withPlan, /^FAIL: team-plan\.md sits in a Shape: experiment effort — a plan seals only under Shape: build$/m, { seal: true });
});

test('campaign gates nothing but a plan at the seal', () => {
  const planless = { 'map.md': map({ shape: 'campaign' }), 'team-plan.md': null, 'definition-of-done.md': dod(acRows(40)) };
  for (const opts of [{}, { seal: true }]) assert.deepEqual(run(planless, opts), { code: 0, lines: ['OK: campaign — nothing to gate'] });
  // the shape by value: a campaign marker over a build-sized plan does not seal as nothing to gate
  const withPlan = { ...planless, 'team-plan.md': 'x'.repeat(200000) };
  assert.deepEqual(run(withPlan), { code: 0, lines: ['OK: campaign — nothing to gate'] });
  assert.deepEqual(run(withPlan, { seal: true }), { code: 1, lines: ['FAIL: team-plan.md sits in a Shape: campaign effort — a plan seals only under Shape: build'] });
});

test('a relative, missing or non-directory session and an unknown flag are usage errors', () => {
  const dir = session();
  // '.' exists, and is still no absolute path
  for (const bad of ['relative/dir', '.', join(dir, 'no-such-dir'), join(dir, 'map.md'), '', undefined]) {
    const result = checkContract(bad, { seal: true });
    assert.equal(result.code, 2, String(bad));
    assert.equal(result.lines.at(-1), USAGE);
  }
  assert.deepEqual(parseArgs([dir]), { sessionDir: dir, opts: {} });
  assert.deepEqual(parseArgs(['--seal', dir]), { sessionDir: dir, opts: { seal: true } });
  assert.deepEqual(parseArgs([dir, '--seal']), { sessionDir: dir, opts: { seal: true } });
  assert.match(parseArgs([dir, '--force']).error, /unknown flag: --force/);
  assert.match(parseArgs(['--seal']).error, /session dir missing/);
  assert.match(parseArgs([dir, dir]).error, /extra argument/);
});

test('the CLI exits 0 on a pass and on an ungated effort', () => {
  const sealed = cli(session(), '--seal');
  assert.equal(sealed.status, 0, sealed.stdout + sealed.stderr);
  assert.match(sealed.stdout, /^OK: team-plan\.md is 7 bytes/);
  assert.deepEqual(sealed.stdout.trimEnd().split('\n').filter((line) => !line.startsWith('OK: ')), []);
  const ungated = cli(session({ 'map.md': map({ shape: null }) }), '--seal');
  assert.equal(ungated.status, 0, ungated.stdout + ungated.stderr);
  assert.match(ungated.stdout, /^not gated: \S+ — map\.md carries no Shape line \(the effort predates the slice contract\)\n$/);
});

test('the CLI exits 1 on a FAIL line and 2 on a usage error', () => {
  const over = session({ 'team-plan.md': 'x'.repeat(MAX_PLAN_BYTES + 1) });
  const failed = cli(over);
  assert.equal(failed.status, 1, failed.stdout + failed.stderr);
  assert.match(failed.stdout, /^FAIL: team-plan\.md is 60001 bytes/);
  // through a symlink the gate still runs: a main-module check that missed would exit 0 without a line
  const link = join(session(), 'gate.mjs');
  symlinkSync(script, link);
  assert.equal(spawnSync(process.execPath, [link, over]).status, 1);
  for (const args of [[], ['relative/dir'], [join(over, 'no-such-dir')], [over, '--force'], [over, over]]) {
    const result = cli(...args);
    assert.equal(result.status, 2, args.join(' '));
    assert.equal(result.stdout, '');
    assert.ok(result.stderr.includes(USAGE), result.stderr);
  }
});

test('premises: an unmeasured basis that only defers the question is no basis', () => {
  for (const status of ['holds — unmeasured: minted before research', 'holds — unmeasured: pending the round-2 probe', 'holds — unmeasured: not yet checked', 'holds — unmeasured: TBD']) {
    fails({ 'map.md': map({ premises: [premise(1, status)] }) }, /^FAIL: premise P-1 has no basis — /);
  }
  passes({ 'map.md': map({ premises: [premise(1, 'holds — unmeasured: needs a paid vendor call (human-gated)')] }) });
  passes({ 'map.md': map({ premises: [premise(1, 'holds — read: src/a.ts:12; unmeasured: pending on the server side')] }) });
});
