import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { checkDesignCritique, validateDesignCritique } from './check-design-critique.mjs';
import { sessionAfk, withAfk } from './check-design-critique.mjs';

const header = '| ID | Severity | Route | Clause | Location | Quote | Failure scenario | Recommendation — rationale | Proof checked |\n|----|----|----|----|----|----|----|----|----|';
const finding = (id = 'DC-1', severity = 'Major', route = 'planner') => `| ${id} contract-break | ${severity} | ${route} | C-6 | design.md:API | "returns synchronously" | HTTP request times out before the response arrives | await the HTTP result — preserves the promised response | src/api.mjs:12 opened |`;
const report = (rows = [finding()], status = 'STATUS: ERRORS_REMAINING: 1', verdict = 'BLOCKING') => `# Design Critique: sample\n\nCritique: ${verdict}\n\n## Findings\n\n${header}\n${rows.join('\n')}\n\n## Not applicable\n\n- cost: no paid calls.\n\n${status}\n`;
const design = (rows = ['| DC-1 contract-break — fixed: await the HTTP response before returning | preserves the synchronous caller contract | design critique DC-1 |']) => `# Design\n\n## Decisions Made\n\n| Decision | Rationale | From |\n|----|----|----|\n${rows.join('\n')}\n`;
const map = (gist, detail = 'user message 2026-10-26: "accept this material tradeoff"') => `# Map\n\n## Decisions so far\n\n| Decision | Gist | Detail in |\n|----|----|----|\n| D-1 contract-choice | ${gist} | ${detail} |\n`;
const userGist = 'DC-1 contract-break — rejected; Rationale: retain the chosen HTTP architecture; Source: user';
const acknowledgement = '; Material acknowledgement: accepted; Critic rationale: synchronous callers cannot await HTTP; Rejection rationale: user accepts an asynchronous caller migration';
const good = () => ({ critique: report(), design: design() });
const rejects = (input, pattern) => {
  const result = validateDesignCritique(input);
  assert.equal(result.ok, false, JSON.stringify(result));
  if (pattern) assert.match(result.errors.join('\n'), pattern);
};

test('fixed planner finding passes without a new user decision', () => {
  assert.equal(validateDesignCritique(good()).ok, true);
});

test('five pending finding IDs reproduce the former grep bypass and fail', () => {
  const ids = Array.from({ length: 5 }, (_, index) => `DC-${index + 1}`);
  rejects({ critique: report(ids.map((id) => finding(id, 'Blocker')), 'STATUS: ERRORS_REMAINING: 5'),
    design: design(ids.map((id) => `| ${id} pending, not fixed or rejected | pending, not fixed or rejected | planner |`)) }, /disposition/);
});

test('duplicate and conflicting design rows fail', () => {
  for (const second of [design().split('\n').find((line) => line.startsWith('| DC-1')), '| DC-1 contract-break — rejected | keeps the existing API contract | design critique DC-1 |']) {
    rejects({ ...good(), design: design([design().split('\n').find((line) => line.startsWith('| DC-1')), second]) }, /exactly one disposition/);
  }
});

test('empty, pending and generic change/rationale placeholders fail', () => {
  for (const change of ['TODO', 'pending implementation', '<what changed>']) {
    rejects({ ...good(), design: design([`| DC-1 contract-break — fixed: ${change} | preserves the promised API contract | design critique DC-1 |`]) });
  }
  rejects({ ...good(), design: design(['| DC-1 contract-break — rejected | | design critique DC-1 |']) });
  rejects({ ...good(), design: design(['| DC-1 contract-break — rejected | TBD | design critique DC-1 |']) });
});

test('concise precise changes, rationales and user locators are valid', () => {
  assert.equal(validateDesignCritique({ ...good(), design: design(['| DC-1 contract-break — fixed: `await` removed | sync API | design critique DC-1 |']) }).ok, true);
  const input = { critique: report([finding('DC-1', 'Major', 'human')], 'STATUS: BLOCKED — 1 finding(s) need a human decision'), design: design([]) };
  const gist = 'DC-1 contract-break — fixed: `await` removed; Rationale: sync API; Source: user';
  assert.equal(validateDesignCritique({ ...input, map: map(gist, 'user:turn-42') }).ok, true);
  for (const locator of ['', 'TODO', 'pending', '<user response>']) rejects({ ...input, map: map(gist, locator) });
});

test('code syntax and domain vocabulary are not template or pending markers', () => {
  for (const change of ['return { ms }', 'reject x < 0 or x > 10', 'test pending transactions before commit', 'pending transactions are tested before commit', '`return { ms }`']) {
    assert.equal(validateDesignCritique({ ...good(), design: design([`| DC-1 contract-break — fixed: ${change} | preserve pending transactions | design critique DC-1 |`]) }).ok, true, change);
  }
  for (const change of ['TODO: implement the fix', 'TBD', 'pending', 'pending implementation', 'not yet fixed', 'to be determined', '<what changed>', '{what changed}']) {
    rejects({ ...good(), design: design([`| DC-1 contract-break — fixed: ${change} | sync API | design critique DC-1 |`]) });
  }
  assert.equal(validateDesignCritique({ ...good(), critique: report().replace('"returns synchronously"', '{ ms }') }).ok, true);
});

test('fabricated or mismatched critique citations fail', () => {
  rejects({ ...good(), design: design(['| DC-1 contract-break — rejected | preserves the existing API contract | design critique DC-2 |']) }, /source must/);
  rejects({ ...good(), design: design(['| DC-1 contract-break — rejected | preserves the existing API contract | map D-1 |']) }, /source must/);
});

test('rejected Major inside planner authority needs no material approval', () => {
  assert.equal(validateDesignCritique({ ...good(), design: design(['| DC-1 contract-break — rejected | callers already await this documented response | design critique DC-1 |']) }).ok, true);
});

test('planner dispositions reject explicit conflicting map dispositions', () => {
  for (const [severity, action, gist] of [
    ['Major', 'fixed: await the HTTP response before returning', userGist],
    ['Major', 'rejected', 'DC-1 contract-break — fixed: await the HTTP response before returning; Rationale: preserve the contract; Source: user'],
    ['Blocker', 'fixed: await the HTTP response before returning', userGist],
  ]) {
    rejects({ critique: report([finding('DC-1', severity)]), design: design([`| DC-1 contract-break — ${action} | preserve the contract | design critique DC-1 |`]), map: map(gist) }, /duplicate\/conflicting/);
  }
});

test('ordinary map references do not duplicate planner dispositions', () => {
  assert.equal(validateDesignCritique({ ...good(), map: map('DC-1 explains the original contract risk; Source: planner') }).ok, true);
  assert.equal(validateDesignCritique({ ...good(), map: '# Map\n\n## Notes\n\nNo decisions recorded.\n' }).ok, true);
});

test('rejected Blocker requires explicit material acknowledgement with both rationales', () => {
  const input = { critique: report([finding('DC-1', 'Blocker')]), design: design(['| DC-1 contract-break — rejected | requires updating the asynchronous callers | design critique DC-1 |']) };
  rejects(input, /Decisions so far|material user acknowledgement/);
  rejects({ ...input, map: map(userGist) }, /both concrete rationales/);
  rejects({ ...input, map: map(userGist + acknowledgement.replace('Critic rationale:', 'Other rationale:')) }, /both concrete rationales/);
  assert.equal(validateDesignCritique({ ...input, map: map(userGist + acknowledgement) }).ok, true);
});

test('human finding uses one bound Source: user map decision instead of design row', () => {
  const input = { critique: report([finding('DC-1', 'Major', 'human')], 'STATUS: BLOCKED — 1 finding(s) need a human decision'), design: design([]) };
  rejects(input, /linked user decision/);
  rejects({ ...input, map: map(userGist.replace('Source: user', 'Source: planner')) }, /Source: user/);
  rejects({ ...input, map: map(userGist, 'design critique DC-1') }, /user response locator/);
  assert.equal(validateDesignCritique({ ...input, map: map(userGist) }).ok, true);
  rejects({ ...input, map: map(userGist), design: design() }, /duplicate\/conflicting/);
});

test('human-only dispositions do not require a design decisions table', () => {
  const input = { critique: report([finding('DC-1', 'Major', 'human')], 'STATUS: BLOCKED — 1 finding(s) need a human decision'), map: map(userGist) };
  assert.equal(validateDesignCritique({ ...input, design: '# Design\n\n## Architecture\n\nHTTP API.\n' }).ok, true);
  assert.equal(validateDesignCritique(input).ok, true);
  rejects({ ...input, design: design(['| DC-1 contract-break — rejected | keep HTTP | design critique DC-1 |']) }, /duplicate\/conflicting/);
  rejects({ ...good(), design: '# Design\n\n## Architecture\n\nHTTP API.\n' }, /Decisions Made/);
});

test('human Blocker cannot bypass the material acknowledgement', () => {
  const input = { critique: report([finding('DC-1', 'Blocker', 'human')], 'STATUS: BLOCKED — 1 finding(s) need a human decision'), design: design([]) };
  rejects({ ...input, map: map(userGist) }, /both concrete rationales/);
  assert.equal(validateDesignCritique({ ...input, map: map(userGist + acknowledgement) }).ok, true);
});

test('duplicate, skipped, malformed, dropped and unknown-severity finding rows fail', () => {
  for (const rows of [[finding(), finding()], [finding('DC-2')], [finding().replace('| Major |', '| Critical |')], [finding().replace('| planner |', '| unknown |')], [finding().replace(' | src/api.mjs:12 opened |', ' |')], ['DC-1 Major planner outside table']]) {
    rejects({ ...good(), critique: report(rows) });
  }
  rejects({ ...good(), critique: report().replace('## Not applicable', `## Dropped findings\n\n${finding('DC-2', 'Blocker')}\n\n## Not applicable`) }, /outside Findings/);
});

test('verdict and terminal status must agree exactly with findings and human counts', () => {
  for (const critique of [report([finding()], 'STATUS: CLEAN'), report([finding()], 'STATUS: ERRORS_REMAINING: 2'), report([finding()], 'STATUS: ERRORS_REMAINING: 1', 'CLEAR'), report() + 'after status\n', report().replace('Critique: BLOCKING', 'Critique: BLOCKING extra'), report().replace('Critique: BLOCKING', 'Critique: BLOCKING\nCritique: CLEAR'), report().replace('STATUS:', '**STATUS:'), '']) {
    rejects({ ...good(), critique });
  }
});

test('clear findings and Nits pass with no dispositions', () => {
  for (const rows of [[], [finding('DC-1', 'Nit')]]) {
    assert.equal(validateDesignCritique({ critique: report(rows, 'STATUS: CLEAN', 'CLEAR') }).ok, true);
  }
  assert.equal(validateDesignCritique({ critique: report([], 'STATUS: CLEAN', 'CLEAR').replace('## Not applicable', 'Claims tested and found sound (no finding):\n\n- The budget calculation holds.\n\n## Not applicable') }).ok, true);
});

test('the rigor skip form holds only while map.md reads Rigor: low', () => {
  const critique = '# Design Critique: sample\nRunner: skipped — rigor low: no cross-lane seam\nSTATUS: DONE_WITH_CONCERNS — design critique skipped: rigor low, no cross-lane seam\n';
  const low = validateDesignCritique({ critique, map: '# Map: x\nRigor: low\n' });
  assert.equal(low.ok, true);
  assert.equal(low.skipped, true);
  assert.equal(low.skipReason, 'rigor low');
  assert.equal(validateDesignCritique({ critique, map: 'Rigor: low (pinned by user)\n' }).ok, true);
  for (const map of ['', 'Rigor: medium\n', 'Rigor: high (raised from low: premise strike)\n', 'Rigor: pending\n']) {
    const result = validateDesignCritique({ critique, map });
    assert.equal(result.ok, false);
    assert.equal(result.skipped, false);
  }
  for (const bad of [critique + 'Critique: CLEAR\n', critique.replace('DONE_WITH_CONCERNS', 'CLEAN'), critique.replace('rigor low: no', 'rigor medium: no')]) {
    assert.equal(validateDesignCritique({ critique: bad, map: 'Rigor: low\n' }).ok, false);
  }
});

test('only the exact recorded role-not-installed skip is supported', () => {
  const critique = '# Design Critique: sample\nRunner: skipped — team-design-critic not installed\nSTATUS: DONE_WITH_CONCERNS — design critique skipped: team-design-critic not installed\n';
  assert.deepEqual(validateDesignCritique({ critique }), { ok: true, skipped: true, errors: [], findings: 0 });
  for (const bad of [critique + 'Critique: CLEAR\n', critique.replace('DONE_WITH_CONCERNS', 'CLEAN'), critique.replace('not installed', 'temporarily unavailable'), critique.replace('# Design Critique: sample\n', '')]) rejects({ critique: bad });
});

test('file API and executable CLI check real temporary session files', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'design-critique-'));
  try {
    await mkdir(join(directory, 'design-critic'));
    await writeFile(join(directory, 'design-critic/design-critique.md'), report());
    await writeFile(join(directory, 'design.md'), design());
    assert.equal((await checkDesignCritique(directory)).ok, true);
    const script = fileURLToPath(new URL('./check-design-critique.mjs', import.meta.url));
    assert.equal(spawnSync(process.execPath, [script, directory], { encoding: 'utf8' }).status, 0);
    await writeFile(join(directory, 'design.md'), design(['| DC-1 pending | no disposition yet | planner |']));
    assert.equal(spawnSync(process.execPath, [script, directory], { encoding: 'utf8' }).status, 1);
    assert.equal(spawnSync(process.execPath, [script, 'relative-path'], { encoding: 'utf8' }).status, 1);
    assert.equal(spawnSync(process.execPath, [script], { encoding: 'utf8' }).status, 1);
    await assert.rejects(checkDesignCritique('relative-path'), /absolute/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

const afkDetail = 'afk-adoptions.md#a-1-contract-choice — UNRATIFIED (afk, 2026-10-29)';
const afkGist = userGist.replace('Source: user', 'Source: afk; Gate: create Step 4c-a design critique');
const humanInput = () => ({ critique: report([finding('DC-1', 'Major', 'human')], 'STATUS: BLOCKED — 1 finding(s) need a human decision'), design: design([]) });
const blockerInput = () => ({ critique: report([finding('DC-1', 'Blocker')]), design: design(['| DC-1 contract-break — rejected | requires updating the asynchronous callers | design critique DC-1 |']) });
const underAfk = (input) => withAfk(true, () => validateDesignCritique(input));
const afkLayout = async (config) => {
  const directory = await mkdtemp(join(tmpdir(), 'design-critique-afk-'));
  const project = join(directory, 'proj');
  const session = join(project, 'team-session', 's');
  await mkdir(session, { recursive: true });
  await mkdir(join(project, '.claude'));
  if (config !== undefined) await writeFile(join(project, '.claude/team-kit.local.json'), config);
  return { directory, project, session };
};

test('afk=true accepts a Source: afk human-route record with an afk-adoptions locator', () => {
  const result = underAfk({ ...humanInput(), map: map(afkGist, afkDetail) });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(underAfk({ ...humanInput(), map: map(afkGist.replace('rejected', 'fixed: await the HTTP response before returning'), 'afk-adoptions.md#a-12-http-contract-v2 — UNRATIFIED (afk, 2026-10-30)') }).ok, true);
});

test('afk=false rejects the same Source: afk record as today', () => {
  const input = { ...humanInput(), map: map(afkGist, afkDetail) };
  rejects(input, /needs Source: user/);
  assert.deepEqual(withAfk(false, () => validateDesignCritique(input)), validateDesignCritique(input));
  underAfk(input);
  rejects(input, /needs Source: user/);
});

test('Source: user human-route record passes with afk on and off', () => {
  const input = { ...humanInput(), map: map(userGist) };
  assert.equal(validateDesignCritique(input).ok, true);
  assert.equal(underAfk(input).ok, true);
  assert.equal(withAfk(false, () => validateDesignCritique(input)).ok, true);
  assert.match(underAfk({ ...input, map: map(userGist, 'design critique DC-1') }).errors.join('\n'), /user response locator/);
});

test('afk=true rejects Source: afk without the UNRATIFIED afk-adoptions locator or a concrete rationale', () => {
  for (const detail of ['user:turn-42', 'afk-adoptions.md#a-1-contract-choice', 'afk-adoptions.md#a-1-contract-choice — RATIFIED (afk, 2026-10-29)', 'afk-adoptions.md#a-0-contract-choice — UNRATIFIED (afk, 2026-10-29)', 'afk-adoptions.md#a-1-Contract_Choice — UNRATIFIED (afk, 2026-10-29)', 'afk-adoptions.md#a-1-contract-choice — UNRATIFIED (afk, 29-10-2026)']) {
    const result = underAfk({ ...humanInput(), map: map(afkGist, detail) });
    assert.equal(result.ok, false, detail);
    assert.match(result.errors.join('\n'), /afk decision needs locator/, detail);
  }
  for (const gist of [afkGist.replace('Rationale: retain the chosen HTTP architecture', 'Rationale: TODO'), afkGist.replace('; Rationale: retain the chosen HTTP architecture', '')]) {
    const result = underAfk({ ...humanInput(), map: map(gist, afkDetail) });
    assert.equal(result.ok, false, gist);
    assert.match(result.errors.join('\n'), /afk decision needs concrete Rationale/, gist);
  }
  assert.match(underAfk({ ...humanInput(), map: map(afkGist.replace('Source: afk', 'Source: planner'), afkDetail) }).errors.join('\n'), /needs Source: user/);
});

test('afk=true accepts an afk rejected-Blocker acknowledgement with both rationales', () => {
  assert.equal(underAfk({ ...blockerInput(), map: map(afkGist + acknowledgement, afkDetail) }).ok, true);
  assert.match(underAfk({ ...blockerInput(), map: map(afkGist, afkDetail) }).errors.join('\n'), /both concrete rationales/);
  assert.match(underAfk({ ...blockerInput(), map: map(afkGist + acknowledgement.replace('Rejection rationale:', 'Other rationale:'), afkDetail) }).errors.join('\n'), /both concrete rationales/);
  assert.match(underAfk({ ...blockerInput(), map: map(afkGist + acknowledgement, 'user:turn-42') }).errors.join('\n'), /afk decision needs locator/);
  rejects({ ...blockerInput(), map: map(afkGist + acknowledgement, afkDetail) }, /needs Source: user/);
});

test('session afk resolves from the project config beside team-session and fails safe elsewhere', async () => {
  const cases = [['{"afk": true}', true], ['{"afk": true, "autoRun": false}', true], ['{"afk": false, "autoRun": true}', false], ['{"afk": "true"}', false], ['{"afk": true,}', false], ['[true]', false], ['', false], [undefined, false]];
  for (const [config, expected] of cases) {
    const { directory, project, session } = await afkLayout(config);
    try {
      assert.equal(sessionAfk(session), expected, String(config));
      assert.equal(sessionAfk(`${session}/`), expected, String(config));
      assert.equal(sessionAfk(join(project, 'team-session')), false, String(config));
      assert.equal(sessionAfk(join(session, 'nested')), false, String(config));
    } finally { await rm(directory, { recursive: true, force: true }); }
  }
  const { directory, project } = await afkLayout('{"afk": true}');
  try {
    await mkdir(join(project, 'elsewhere', 's'), { recursive: true });
    assert.equal(sessionAfk(join(project, 'elsewhere', 's')), false);
    assert.equal(sessionAfk(join(directory, 'missing', 'team-session', 's')), false);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('CLI accepts Source: afk only while the session project config resolves afk=true', async () => {
  const { directory, project, session } = await afkLayout('{"afk": true}');
  try {
    await mkdir(join(session, 'design-critic'));
    await writeFile(join(session, 'design-critic/design-critique.md'), humanInput().critique);
    await writeFile(join(session, 'map.md'), map(afkGist, afkDetail));
    const script = fileURLToPath(new URL('./check-design-critique.mjs', import.meta.url));
    const result = await checkDesignCritique(session);
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.afk, true);
    const on = spawnSync(process.execPath, [script, session], { encoding: 'utf8' });
    assert.equal(on.status, 0, on.stderr);
    assert.equal(on.stdout.split('\n')[0], 'NOTE: afk=true (.claude/team-kit.local.json) — Source: afk UNRATIFIED records accepted');
    assert.match(on.stdout, /^PASS: 1 findings have structurally valid dispositions/m);
    await rm(join(project, '.claude/team-kit.local.json'));
    const off = spawnSync(process.execPath, [script, session], { encoding: 'utf8' });
    assert.equal(off.status, 1);
    assert.doesNotMatch(off.stdout, /NOTE: afk=true/);
    assert.match(off.stderr, /needs Source: user/);
    assert.equal('afk' in (await checkDesignCritique(session)), false);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
