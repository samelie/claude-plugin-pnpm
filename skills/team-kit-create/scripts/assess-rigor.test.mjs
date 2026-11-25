import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { assess, BUDGETS, checkRecorded, countRows, parseSignals, recordedRigor } from './assess-rigor.mjs';

const script = fileURLToPath(new URL('./assess-rigor.mjs', import.meta.url));

const findings = ({ packages = 2, risk = 'none', seam = 'no', persisted = 'no', external = 'no', wire = 'no', rows = 5 } = {}) => `# Findings

## §3 Existing vs Build-New

${Array.from({ length: rows }, (_, index) => `| deliverable ${index} | extend |`).join('\n')}

## §4 Affected Areas

prose only

## §8 Unconfirmed

none

## Rigor signals

packages: ${packages} — packages/a, packages/b
risk-class: ${risk} — checked for deploys, paid calls, frozen files
cross-lane-seam: ${seam} — src/a.ts:1
persisted-data: ${persisted} — src/a.ts:2
external-behavior: ${external} — src/a.ts:3
unverified-wire-shape: ${wire} — src/a.ts:4
`;

test('narrow work with no shared surface is low', () => {
  assert.equal(assess(findings()).level, 'low');
});

test('low boundary sits at 3 packages and 20 rows', () => {
  assert.equal(assess(findings({ packages: 3, rows: 20 })).level, 'low');
  assert.equal(assess(findings({ packages: 4, rows: 20 })).level, 'medium');
  assert.equal(assess(findings({ packages: 3, rows: 21 })).level, 'medium');
});

test('any shared surface lifts narrow work to medium', () => {
  for (const key of ['seam', 'persisted', 'external']) {
    const result = assess(findings({ [key]: 'yes' }));
    assert.equal(result.level, 'medium');
    assert.equal(result.floor, 'low');
  }
});

test('high boundary sits at 10 packages, without raising the floor; rows never reach high', () => {
  assert.equal(assess(findings({ packages: 9, rows: 49 })).level, 'medium');
  assert.deepEqual([assess(findings({ packages: 10 })).level, assess(findings({ packages: 10 })).floor], ['high', 'low']);
  assert.deepEqual([assess(findings({ rows: 50 })).level, assess(findings({ rows: 50 })).floor], ['medium', 'low']);
  assert.equal(assess(findings({ rows: 400 })).level, 'medium');
});

test('a risk class or an unverified wire shape floors the level at medium and never reaches high alone', () => {
  for (const risk of ['frozen-artifact', 'unforgeable-witness', 'live-state', 'paid-irreversible', 'live-state,paid-irreversible']) {
    assert.deepEqual([assess(findings({ risk })).level, assess(findings({ risk })).floor], ['medium', 'medium']);
  }
  assert.deepEqual([assess(findings({ wire: 'yes' })).level, assess(findings({ wire: 'yes' })).floor], ['medium', 'medium']);
});

test('size still reaches high beside a hazard, and the hazard keeps the medium floor', () => {
  const big = assess(findings({ risk: 'live-state', packages: 12 }));
  assert.deepEqual([big.level, big.floor], ['high', 'medium']);
  assert.deepEqual(big.reasons, ['12 packages, 5 rows', 'risk class live-state']);
  const wide = assess(findings({ wire: 'yes', packages: 10 }));
  assert.deepEqual([wide.level, wide.floor], ['high', 'medium']);
  assert.deepEqual(assess(findings({ risk: 'live-state', seam: 'yes' })).reasons, ['2 packages, 5 rows', 'cross-lane-seam', 'risk class live-state']);
});

test('unreadable signals fail closed to high', () => {
  const good = findings();
  const broken = {
    'no section': '# Findings\n\n## §3 Existing vs Build-New\n\n| a | b |\n',
    'no evidence': good.replace('packages: 2 — packages/a, packages/b', 'packages: 2'),
    'bad count': good.replace('packages: 2', 'packages: few'),
    'unknown class': good.replace('risk-class: none', 'risk-class: scary'),
    'bad flag': good.replace('cross-lane-seam: no', 'cross-lane-seam: maybe'),
    'missing flag': good.replace('persisted-data: no — src/a.ts:2\n', ''),
    'none with a class': good.replace('risk-class: none', 'risk-class: none,live-state'),
    'repeated signal': good.replace('risk-class: none', 'risk-class: live-state — deploy step\nrisk-class: none'),
    'second section': `${good}\n## Rigor signals\n\npackages: 1 — packages/a\n`,
  };
  for (const [name, text] of Object.entries(broken)) {
    const result = assess(text);
    assert.deepEqual([result.level, result.floor], ['high', 'high'], name);
    assert.ok(result.reasons.length > 0, name);
  }
});

test('a sweep with no countable rows fails closed to high', () => {
  assert.deepEqual([assess(findings({ rows: 0 })).level, assess(findings({ rows: 0 })).floor], ['high', 'high']);
});

test('rows count both sections, stop at the next section, and ignore prose', () => {
  const text = '## §3 Existing vs Build-New\n| a |\n- b\nprose\n## §4 Affected Areas\n### sub\n- c\n## §5 Risks\n| not counted |\n';
  assert.equal(countRows(text), 3);
});

test('parsed signals keep risks and flags', () => {
  const { signals, errors } = parseSignals(findings({ risk: 'live-state', seam: 'yes' }));
  assert.deepEqual(errors, []);
  assert.deepEqual(signals.risks, ['live-state']);
  assert.equal(signals['cross-lane-seam'], true);
  assert.equal(signals['persisted-data'], false);
});

test('recorded level parses pending, raised and pinned lines', () => {
  assert.deepEqual(recordedRigor('Rigor: pending   <!-- note -->'), { level: 'pending', pinned: false });
  assert.deepEqual(recordedRigor('x\nRigor: high (raised from low: premise strike)\ny'), { level: 'high', pinned: false });
  assert.deepEqual(recordedRigor('Rigor: low (pinned by user)'), { level: 'low', pinned: true });
  assert.equal(recordedRigor('no line here'), null);
});

test('seal check rejects a level below the assessment and accepts one at or above it', () => {
  const medium = findings({ packages: 5 });
  assert.equal(checkRecorded(medium, 'Rigor: low').ok, false);
  assert.equal(checkRecorded(medium, 'Rigor: medium').ok, true);
  assert.equal(checkRecorded(medium, 'Rigor: high (raised from medium: premise strike)').ok, true);
  assert.equal(checkRecorded(medium, 'Rigor: pending').ok, false);
});

test('a session with no Rigor line runs every gate and passes', () => {
  assert.equal(checkRecorded('', '# Map: old\nBudget: rounds 0/6').ok, true);
});

test('a user pin may go below the assessment but never below the risk floor', () => {
  assert.equal(checkRecorded(findings({ packages: 12 }), 'Rigor: low (pinned by user)').ok, true);
  assert.equal(checkRecorded(findings({ risk: 'live-state' }), 'Rigor: low (pinned by user)').ok, false);
  assert.equal(checkRecorded(findings({ risk: 'live-state', packages: 12 }), 'Rigor: medium (pinned by user)').ok, true);
  assert.equal(checkRecorded(findings({ risk: 'live-state', packages: 12 }), 'Rigor: medium').ok, false);
  assert.equal(checkRecorded('no signals at all', 'Rigor: medium (pinned by user)').ok, false);
});

test('budgets rise with the level and high matches the SKILL.md loop budgets', () => {
  assert.deepEqual(BUDGETS.high, { rounds: 6, planRevisions: 3, dispatches: 30 });
  for (const key of Object.keys(BUDGETS.high)) {
    assert.ok(BUDGETS.low[key] < BUDGETS.medium[key] && BUDGETS.medium[key] < BUDGETS.high[key], key);
  }
});

test('a latitude block is legal at every recorded level and never without a Rigor line', () => {
  const plan = '---\nname: x\nlatitude:\n  coder-a:\n    tasks: [T-1 a]\n---\n';
  const low = findings();
  assert.equal(checkRecorded(low, 'Rigor: low', plan).ok, true);
  assert.equal(checkRecorded(findings({ packages: 5 }), 'Rigor: medium', plan).ok, true);
  assert.equal(checkRecorded(low, 'Rigor: high (raised from low: premise strike)', plan).ok, true);
  assert.equal(checkRecorded(low, '# Map: no level line', plan).ok, false);
  assert.equal(checkRecorded(low, 'Rigor: high', '---\nname: x\n---\nthe word latitude: inside a sentence\n').ok, true);
});

test('cli prints the level and enforces the seal check', async () => {
  const session = await mkdtemp(join(tmpdir(), 'assess-rigor-'));
  try {
    const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
    const missing = run(session);
    assert.equal(missing.status, 0);
    assert.match(missing.stdout, /^RIGOR: high — missing ## Rigor signals section/);
    await mkdir(join(session, 'researcher'));
    await writeFile(join(session, 'researcher/research-findings.md'), findings({ packages: 5 }));
    assert.match(run(session).stdout, /^RIGOR: medium — 5 packages, 5 rows; no risk class\nBUDGET: rounds 4 · plan revisions 2 · dispatches 24\n$/);
    await writeFile(join(session, 'map.md'), '# Map: no level line\n');
    await writeFile(join(session, 'team-plan.md'), '---\nlatitude:\n---\n');
    assert.equal(run(session, '--check').status, 1);
    await writeFile(join(session, 'map.md'), 'Rigor: high\n');
    assert.equal(run(session, '--check').status, 0);
    await rm(join(session, 'team-plan.md'));
    await writeFile(join(session, 'map.md'), 'Rigor: low\n');
    const below = run(session, '--check');
    assert.equal(below.status, 1);
    assert.match(below.stdout, /^FAIL: low is below required medium/);
    await writeFile(join(session, 'map.md'), 'Rigor: medium\n');
    assert.equal(run(session, '--check').status, 0);
    assert.equal(run('relative/path').status, 1);
    assert.equal(run(session, '--nope').status, 1);
  } finally {
    await rm(session, { recursive: true, force: true });
  }
});

test('cli runs through a symlink to the script (the .agents skill path)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'assess-rigor-link-'));
  try {
    const link = join(dir, 'assess-rigor.mjs');
    await symlink(script, link);
    const viaLink = spawnSync(process.execPath, [link, dir], { encoding: 'utf8' });
    assert.equal(viaLink.status, 0);
    assert.match(viaLink.stdout, /^RIGOR: high — missing ## Rigor signals section/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
