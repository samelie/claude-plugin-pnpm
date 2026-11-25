import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHECKERS, checkMirrors, fileToken, flat, hasToken, parseArgs, parseJsonFence, readRegistry, regionOf } from './check-mirrors.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..', '..');
const CLI = join(HERE, 'check-mirrors.mjs');
const REGISTRY = readRegistry();
const BEFORE_REDIRECTION = '1335ce35b';
// everything the registry reads: site files, sources (with what they import) and the scan roots
const COPIED = ['.claude/skills/team-kit-create', '.claude/skills/team-kit-run', '.claude/skills/team-kit-resume',
  '.claude/agents', '.claude/team-templates', '.claude/team-kit.md', '.claude/docs/teamkit-methodology.md'];

const scratch = (t) => {
  const root = mkdtempSync(join(tmpdir(), 'check-mirrors-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const rel of COPIED) cpSync(join(REPO, rel), join(root, rel), { recursive: true, dereference: true });
  return root;
};
const run = (args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
const fileOf = (name) => REGISTRY.files[name] ?? name;
const fails = (lines) => lines.filter((line) => line.startsWith('FAIL: '));

// applies every edit of a mutant (each anchor must sit exactly once in its file), runs the check, restores the bytes
const mutated = async (root, edits) => {
  const originals = new Map();
  try {
    for (const e of edits) {
      const path = join(root, fileOf(e.file));
      const text = readFileSync(path, 'utf8');
      if (!originals.has(path)) originals.set(path, text);
      assert.equal(text.split(e.from).length, 2, `the mutant text is not found exactly once in ${e.file}: ${e.from.slice(0, 80)}`);
      writeFileSync(path, text.replace(e.from, () => e.to));
    }
    return await checkMirrors(root);
  } finally {
    for (const [path, text] of originals) writeFileSync(path, text);
  }
};
// a mutant counts only through a FAIL line that is new against the unmutated copy, so unrelated drift can neither
// pass nor fail it
const newFails = (base, result, fact, file) => fails(result.lines)
  .filter((line) => line.startsWith(`FAIL: ${fact} — ${fileOf(file)}`) && !base.lines.includes(line));

test('registry: ids unique, kinds known, every site file and source on disk, every exclusion argued', () => {
  const ids = REGISTRY.facts.map((fact) => fact.id);
  assert.equal(new Set(ids).size, ids.length, 'a fact id is declared twice');
  assert.ok(ids.length >= 10, `only ${ids.length} facts registered`);
  for (const fact of REGISTRY.facts) {
    assert.ok(CHECKERS[fact.kind], `${fact.id}: unknown kind ${fact.kind}`);
    for (const site of fact.sites ?? []) assert.ok(existsSync(join(REPO, fileOf(site.file))), `${fact.id}: ${site.file} is not on disk`);
    for (const e of fact.exclusions ?? []) assert.ok(e.why.length > 40, `${fact.id}: exclusion ${e.re} carries no reason a reviewer can argue with`);
  }
  for (const [name, spec] of Object.entries(REGISTRY.sources)) assert.ok(existsSync(join(REPO, spec.file)), `source ${name} is not on disk`);
});

test('registry: every declared fresh check has a read-set fact', () => {
  const declared = parseJsonFence(readFileSync(join(REPO, REGISTRY.sources.freshChecks.file), 'utf8')).checks.map((c) => c.id);
  for (const id of declared) assert.ok(REGISTRY.facts.some((f) => f.kind === 'readset' && f.check === id), `${id} has no readset fact`);
});

test('helpers: layout is not content, a token is a whole word, anchors survive re-wrapping and bold', () => {
  assert.equal(flat('a **b**\n  `c` \\`d\\`'), 'a b c d');
  assert.equal(hasToken('unmeasured: x', 'measured:'), false);
  assert.equal(hasToken('read: x, measured: y', 'measured:'), true);
  assert.equal(hasToken('grilling', 'grill'), false);
  assert.equal(hasToken('grill-me', 'grill'), false);
  assert.equal(fileToken('designer/explore.md'), 'explore.md');
  assert.equal(fileToken('experiments/X-*/*'), 'experiments/X-');
  assert.deepEqual(regionOf('a\nb anchor\nc\nd', { at: 'anchor', lines: 2 }), { text: 'b anchor\nc', line: 2 });
  assert.deepEqual(regionOf('x\nthe **long**\nanchor here. tail', { at: 'the long anchor', to: '.' }), { text: 'the **long**\nanchor here', line: 2 });
  assert.match(regionOf('abc', { at: 'zzz' }).error, /anchor not found: "zzz" — the site moved or was reworded/);
  assert.throws(() => parseJsonFence('no fence'), /exactly one json-tagged/);
  assert.equal(parseArgs([]).error, undefined);
  assert.match(parseArgs(['--root']).error, /one value/);
  assert.match(parseArgs(['--nope']).error, /unknown argument/);
});

test('current tree: every fact holds and every site is named', async (t) => {
  const { code, lines } = await checkMirrors(REPO);
  t.diagnostic(lines.filter((line) => !line.startsWith('  ')).join('\n'));
  assert.deepEqual(fails(lines), [], 'drift in the tree (fix the prose, never the fact)');
  assert.equal(code, 0);
  for (const fact of REGISTRY.facts) {
    assert.ok(lines.some((line) => /^OK: (\S+) — \d+ sites$/.exec(line)?.[1] === fact.id), `${fact.id} printed no OK line`);
    for (const site of fact.sites ?? []) assert.ok(lines.some((line) => line.startsWith(`  ${fileOf(site.file)}:`)), `${fact.id}: site ${site.file} not printed`);
  }
});

// the 15 findings of the 2026-11-18 hand review (team-session/20261118-teamkit-redirection/review-rules.md),
// re-introduced as the reviewer did and each caught by a fact about the rule. caughtBy names the fact and file whose
// new FAIL line must appear
const REVIEW_FINDINGS = [
  { finding: '1', caughtBy: ['shape-gate', 'PLANNER'], edits: [
    { file: 'PLANNER', from: 'Only when `map.md` carries a `Shape:` line; a map without it keeps its plan as it is, so skip this check. One sealed contract', to: 'One sealed contract' },
    { file: 'PLANNER', from: '[ ] Slice budget (map.md carries a `Shape:` line): ', to: '[ ] Slice budget: ' },
    { file: 'PN', from: '- [ ] Slice budget (`map.md` carries a `Shape:` line): ', to: '- [ ] Slice budget: ' }] },
  { finding: '2 acceptance', caughtBy: ['shape-gate', 'ACC'], edits: [
    { file: 'ACC', from: '- Verify dry-run (lead: keep this bullet only when map.md carries a Shape line): write', to: '- Verify dry-run: write' }] },
  { finding: '2 goal-auditor', caughtBy: ['dry-run-on-request', 'GA'], edits: [
    { file: 'GA', from: 'and, when the dispatch asks for a Verify dry-run, record them in', to: 'and record them in' }] },
  { finding: '3', caughtBy: ['shape-gate', 'DS'], edits: [
    { file: 'DS', from: ' (only when `map.md` carries a `Shape:` line)', to: '' },
    { file: 'SKILL', from: '**Premises get a basis before the planner runs (maps with a `Shape:` line).**', to: '**Premises get a basis before the planner runs.**' }] },
  { finding: '4', caughtBy: ['broken-verify-silent', 'ACC'], edits: [
    { file: 'ACC', from: ' Exception: a blocking AC\'s own verify cell that the Verify dry-run finds broken is `silent` (Step 1b), since no run-time writer may edit the contract', to: '' }] },
  { finding: '5', caughtBy: ['define-next-slices', 'GA'], edits: [
    { file: 'ACC', from: 'Deferred work: read \\`${session_path}map.md\\` **Next slices** only, by section, never the whole map. A\ndeliverable queued there gets no AC here: Coverage Check row \\`deferred — Next slices\\`, prompt-prong cell\n\\`ungraded — deferred: Next slices\\`.\n', to: '' },
    { file: 'GA', from: ' When the dispatch names it, also\n`map.md` **Next slices** only: a deliverable queued there gets no AC here (Coverage Check row\n`deferred — Next slices`, prompt-prong cell `ungraded — deferred: Next slices`).', to: '' },
    { file: 'SCHEMA', from: '; `map.md` **Next slices ONLY** when the dispatch names it', to: '' }] },
  { finding: '6', caughtBy: ['validate-clause', 'FRAMEWORK'], edits: [
    { file: 'FRAMEWORK', from: 'one validate task executes every deterministic DoD verify cell except the `grade-seal-gate` row (the seal task runs that one after the grade) and records rc and evidence path per AC; semantic cells belong to the grade task.', to: 'it carries ONE task that executes every DoD verify cell.' }] },
  { finding: '7', caughtBy: ['banned-phrases', 'EXPL'], why: 'the phrase is built from the deferral list check-contract.mjs rejects, not from the old wording', edits: [
    { file: 'EXPL', from: 'otherwise it carries no basis yet and discovery owes one before fog-drain', to: 'else `unmeasured: minted before research`, which discovery replaces' }] },
  { finding: '9', caughtBy: ['experiment-runner', 'EXP'], edits: [
    { file: 'EXP', from: 'Runner: `team-researcher` (experiment mode), also when the surface is a running product.', to: 'Runner: `team-measurer` when the surface is a running product.' }] },
  { finding: '10', caughtBy: ['campaign-vs-slices', 'SKILL'], edits: [
    { file: 'SKILL', from: '`campaign`: foggy and bigger than one plan (a clear effort that needs more than one slice is `build` plus **Next slices**).', to: '`campaign`: bigger than one plan.' }] },
  { finding: '12a', caughtBy: ['slice-grant-row', 'SKILL'], edits: [
    { file: 'SKILL', from: 'needs a live user row in **Decisions so far** that reads `| D-n slice-budget | <what was granted>; Source: user, <date> | map.md |` (`check-contract.mjs` looks for that id, the slug and `Source: user`).', to: 'needs a live user `D-n slice-budget` row.' }] },
  { finding: '12b', caughtBy: ['sat-skip-owes-dry-run', 'SKILL'], edits: [
    { file: 'SKILL', from: '; a map with a `Shape:` line still owes the `## Verify dry-run` section and a closing STATUS line there', to: '' }] },
  { finding: '12c', caughtBy: ['slice-gate-row-not-counted', 'DOD'], edits: [
    { file: 'DOD', from: 'At most 12 blocking ACs, the `grade-seal-gate` row not counted.', to: 'At most 12 blocking ACs.' }] },
  { finding: '13 coder', caughtBy: ['concern-records', 'CODER'], edits: [
    { file: 'CODER', from: 'A choice your `latitude:` entry leaves open is still CLEAN: record it under `## Lane decisions`. An observation that needs no ruling is CLEAN too: record it under `## Reviewer Notes`.', to: 'A choice your `latitude:` entry leaves open, or an observation that needs no ruling, is still CLEAN: record it under `## Lane decisions`.' }] },
  { finding: '13 framework', caughtBy: ['concern-records', 'FRAMEWORK'], edits: [
    { file: 'FRAMEWORK', from: 'goes under `## Lane decisions`, and an observation that needs no ruling under `## Reviewer Notes`, both with', to: 'or an observation that needs no ruling goes under `## Lane decisions`, with' }] },
  { finding: '14a', caughtBy: ['readset:goal-audit', 'ACC'], edits: [
    { file: 'ACC', from: 'Read those map.md sections by line range', to: 'Read the two map.md sections by line range' }] },
  { finding: '14b', caughtBy: ['final-message-order', 'AFK'], edits: [
    { file: 'AFK', from: ' → `Found` → `Next` (the run', to: ' → `Found` (the run' }] },
  { finding: '14c', caughtBy: ['destination-header', 'FRESH'], edits: [
    { file: 'FRESH', from: 'Budget, Rigor, Shape lines)', to: 'Budget, Rigor lines)' }] },
  { finding: '15', caughtBy: ['rigor-pin-word', 'RIGOR'], edits: [
    { file: 'RIGOR', from: '`Rigor: medium (pinned by user; raised from <pin>: <risk class>)`', to: '`Rigor: medium (raised from <pin>: <risk class>)`' }] },
];
const OUT_OF_REACH = [
  { finding: '8', why: 'the refuter read-set lost experiments/X-* from the json, the table and SESSION-SCHEMA together: every copy still agrees with the source, and no mirror check can tell which content the source should hold' },
  { finding: '11', why: 'a defect in check-contract.mjs seal logic (empty card passes); there is no kit text to mirror, its own suite owns it' },
];

test('review findings: each hand-found defect, re-introduced, fails a fact about its rule', async (t) => {
  const root = scratch(t);
  const base = await checkMirrors(root);
  assert.equal(base.code, 0, `control: ${fails(base.lines).join('\n')}`);
  const score = [];
  for (const f of REVIEW_FINDINGS) {
    const [fact, file] = f.caughtBy;
    assert.notEqual(fact === 'banned-phrases' && !f.why, true, `finding ${f.finding}: a banned phrase needs a reason it is not the old wording`);
    const result = await mutated(root, f.edits);
    const hit = newFails(base, result, fact, file);
    assert.equal(result.code, 1, `finding ${f.finding}: re-introduced and still exits ${result.code}`);
    assert.ok(hit.length, `finding ${f.finding}: no new FAIL from ${fact} at ${file}:\n${fails(result.lines).join('\n')}`);
    score.push(`${f.finding} | ${fact} (${fileOf(file).split('/').at(-1)})`);
  }
  for (const o of OUT_OF_REACH) assert.ok(o.why.length > 40, `finding ${o.finding}: out of reach needs a reason`);
  const covered = new Set([...REVIEW_FINDINGS, ...OUT_OF_REACH].map((f) => f.finding.split(/[ a-c]/)[0]));
  for (let n = 1; n <= 15; n += 1) assert.ok(covered.has(String(n)), `review finding ${n} is neither re-introduced nor argued out of reach`);
  t.diagnostic(`${score.join('\n')}\n${OUT_OF_REACH.map((o) => `${o.finding} | out of reach: ${o.why}`).join('\n')}`);
});

// one changed site per fact, and the checker's own branches: a mutant here is what keeps each branch from being
// deleted or hard-coded without a red test
const MUTANTS = [
  { fact: 'readset:goal-audit', file: 'GA', from: 'the Destination, Out of scope and Next slices sections ONLY', to: 'the Destination and Out of scope sections ONLY' },
  { fact: 'readset:goal-audit', file: 'ACC', from: '**Destination**, **Out of scope** and **Next slices** are goal and scope statements — same class as `prompt.md`, and safe (an outcome queued in Next slices is deferred, not missing).', to: '**Destination** and **Out of scope** are goal and scope statements — same class as `prompt.md`.', why: 'sections-only restatement' },
  { fact: 'readset:plan-review', file: 'SCHEMA', from: 'Destination + Not yet specified + Out of scope + Next slices ONLY', to: 'Destination + Decisions so far + Not yet specified + Out of scope + Next slices ONLY' },
  { fact: 'readset:plan-review', file: 'SCHEMA', from: 'fresh — `fresh-checks.md` → plan-review', to: 'fresh', why: 'pointer' },
  { fact: 'readset:refuter', file: 'FRESH', from: '`researcher/research-findings*.md`, `experiments/X-*.md`, `experiments/X-*/*`, except', to: '`researcher/research-findings*.md`, except' },
  { fact: 'readset:design-critique', file: 'DC', from: '2. `{session_path}design.md`', to: '2. `{session_path}team-plan.md`' },
  { fact: 'readset:design-critique', file: 'SCHEMA', from: '| team-design-critic |', to: '| design critic |', expect: /anchor not found: "\| team-design-critic \|" — the site moved or was reworded/, why: 'a vanished anchor is loud' },
  { fact: 'readset:frame-check', file: 'DISC', from: 'reads ONLY `prompt.md` + `requirements.md` + `map.md` Premises', to: 'reads ONLY `prompt.md` + `requirements.md` + `map.md` Destination' },
  { fact: 'readset:frame-check', file: 'DS', from: '`${session_path}designer/explore.md` approaches', to: '`${session_path}map.md` **Decisions so far** approaches', why: 'the four-file restatement' },
  { fact: 'readset:sat', file: 'GA', from: '**Reads**: `definition-of-done.md`', to: '**Reads**: `prompt.md`, `definition-of-done.md`', why: 'extra file' },
  { fact: 'readset:sat', file: 'FRESH', from: '"allow": ["definition-of-done.md", "team-plan.md", "design.md", "requirements.md"]', to: '"allow": ["prompt.md", "definition-of-done.md", "team-plan.md", "design.md", "requirements.md"]', named: 'SKILL', why: 'the source moved, every copy is now stale' },
  { fact: 'slice-budget', file: 'DOD', from: 'At most 12 blocking ACs', to: 'At most 15 blocking ACs' },
  { fact: 'slice-budget', file: 'KIT', from: '60 KB plan', to: '40 KB plan' },
  { fact: 'slice-budget', file: 'CC', from: 'export const MAX_BLOCKING_ACS = 12;', to: 'export const MAX_BLOCKING_ACS = 10;', named: 'PLANNER', why: 'the constant moved, the prose did not' },
  { fact: 'rigor-budgets', file: 'RIGOR', from: '| 4 / 2 / 24 |', to: '| 4 / 2 / 20 |' },
  { fact: 'rigor-budgets', file: 'SKILL', from: '| dispatches | 30 |', to: '| dispatches | 32 |' },
  { fact: 'rigor-budgets', file: 'AR', from: 'dispatches: 30', to: 'dispatches: 40', named: 'RIGOR', why: 'read from the source, never hard-coded' },
  { fact: 'discovery-exits', file: 'DS', from: '| 2 | **research or experiment** |', to: '| 2 | **research** |' },
  { fact: 'discovery-exits', file: 'DISC', from: '| 4 | **grill**', to: '| 4 | **grill-me**', why: 'a hyphen extends the word' },
  { fact: 'discovery-exits', file: 'FRAMEWORK', from: 'prototype (cheap artifact to react to) | grill (human judgment, ONE per round)', to: 'grill (human judgment, ONE per round) | prototype (cheap artifact to react to)' },
  { fact: 'verify-dry-run', file: 'GA', from: '`green-already`', to: '`green-now`' },
  { fact: 'premise-basis', file: 'DISC', from: '`unmeasured: <why', to: '`unverified: <why' },
  { fact: 'premise-parser', file: 'CC', from: '!/\\b(read|measured):\\s*[^\\s<]/.test(status)', to: '!/\\b(read):\\s*[^\\s<]/.test(status)' },
  { fact: 'card-fields', file: 'EXP', from: 'Stop rule: <the threshold', to: 'Stop condition: <the threshold' },
  { fact: 'card-fields', file: 'EXP', from: '\nStop rule: <the threshold', to: '\n- Stop rule: <the threshold', why: 'lineStart' },
  { fact: 'verdict-files', file: 'SKILL', from: '`plan-review.md`, `designer/frame-check.md` — ends', to: '`plan-review.md` — ends' },
  { fact: 'verdict-files', file: 'SKILL', from: '`designer/frame-check.md` — ends', to: '`designer/frame-check.md`, `designer/extra.md` — ends', why: 'extra item' },
  { fact: 'validate-clause', file: 'PR', from: 'one validate task executes every deterministic DoD verify cell except', to: 'one validate task executes every DoD verify cell except' },
  { fact: 'skip-forms', file: 'CRITIQUE', from: '`Runner: skipped — rigor low: no cross-lane seam`', to: '`Runner: skipped — rigor is low`' },
  { fact: 'shapes', file: 'KIT', from: '`build`, `experiment` or `campaign`', to: '`build` or `experiment`' },
  { fact: 'shapes', file: 'METHOD', from: '(`build` / `experiment` / `campaign`)', to: '(`build` / `experiment` / `campaign` / `spike`)', why: 'an extra shape' },
  { fact: 'fresh-check-ids', file: 'FRESH', from: 'Fresh-check: <frame-check|sat|', to: 'Fresh-check: <frame-check|' },
  { fact: 'fresh-check-headers', file: 'SKILL', from: 'header `Fresh-check: plan-review`', to: 'header `Fresh-check: planreview`' },
  { fact: 'fresh-check-headers', file: 'PR', from: 'A dispatch headed `Fresh-check: plan-review`', to: 'A dispatch headed `Fresh-check:Plan-review`', why: 'no space, capitalised' },
  { fact: 'banned-phrases', file: 'ACC', from: 'Read those map.md sections by line range', to: 'Read the two\nmap.md sections by line range', why: 're-wrapped across lines' },
  { fact: 'banned-phrases', file: 'METHOD', from: 'a sealed contract is one slice', to: 'Read the two map.md sections; a sealed contract is one slice', why: 'methodology doc is scanned' },
];

test('mutants: one changed site makes the check exit 1 naming the fact and the file', async (t) => {
  const root = scratch(t);
  const base = await checkMirrors(root);
  assert.equal(base.code, 0, `control: the unmutated scratch copy must pass:\n${fails(base.lines).join('\n')}`);
  const facts = new Set();
  for (const m of MUTANTS) {
    const result = await mutated(root, [m]);
    const hit = newFails(base, result, m.fact, m.named ?? m.file);
    assert.equal(result.code, 1, `${m.fact}: mutating ${m.file} (${m.why ?? 'site'}) still exits ${result.code}`);
    assert.ok(hit.length, `${m.fact}: no new FAIL naming ${m.named ?? m.file} (${m.why ?? 'site'}):\n${fails(result.lines).join('\n')}`);
    if (m.expect) assert.ok(hit.some((line) => m.expect.test(line)), `${m.fact}: ${hit.join('\n')}`);
    facts.add(m.fact);
  }
  assert.ok(facts.size >= 10, `only ${facts.size} facts proven to bite`);
  t.diagnostic(`${MUTANTS.length} mutants over ${facts.size} facts`);
});

// ordinary edits that must not fail: re-wrapping, bold, an unrelated number beside a budget, correct sentences that
// share words with a stale phrase
const HARMLESS = [
  { why: 'unrelated KB figure in SKILL.md', edits: [{ file: 'SKILL', from: 'Per-gate caps (SAT 2, goal audit 2) still apply inside these.', to: 'Per-gate caps (SAT 2, goal audit 2) still apply inside these. context-mode cuts subagent outputs over 4 KB.' }] },
  { why: 'unrelated AC count on the budget line of team-kit.md', edits: [{ file: 'KIT', from: 'agent roster, dispatch contracts.', to: 'agent roster, dispatch contracts (dnd35 once sealed 38 blocking ACs).' }] },
  { why: 're-wrapped anchor', edits: [{ file: 'SKILL', from: 'Dispatch `team-goal-auditor` (phase: audit) with FRESH CONTEXT', to: 'Dispatch `team-goal-auditor` (phase: audit)\nwith FRESH CONTEXT' }] },
  { why: 'bold inside an anchor', edits: [{ file: 'DISC', from: '**Basis before fog-drain.**', to: '**Basis** before **fog-drain.**' }] },
  { why: 're-wrapped paragraph pushes the pointer down a line', edits: [{ file: 'GA', from: '`design.md`, `requirements.md` (for the frozen /\nforbidden set', to: '`design.md`,\n`requirements.md` (for the\nfrozen / forbidden set' }] },
  { why: 'bold term inside a restated read-set', edits: [{ file: 'PR', from: '2. `{session_path}requirements.md`', to: '2. **`{session_path}requirements.md`**' }] },
  { why: 'correct sentence naming team-measurer and a card', edits: [{ file: 'FRAMEWORK', from: '### Required verification coverage\n', to: '### Required verification coverage\n\nteam-measurer never runs an experiment card.\n' }] },
  { why: 'history sentence quoting the old rows rule', edits: [{ file: 'RIGOR', from: '| packages vs dispatches |', to: '| the old rule (50+ rows across `3 and `4) left | the high rule |\n| packages vs dispatches |' }] },
];

test('no false fails: ordinary edits keep every fact holding', async (t) => {
  const root = scratch(t);
  for (const h of HARMLESS) {
    const result = await mutated(root, h.edits);
    assert.deepEqual(fails(result.lines), [], `${h.why} made the check fail`);
    assert.equal(result.code, 0);
  }
  t.diagnostic(`${HARMLESS.length} harmless edits, 0 FAIL`);
});

test('a stale exclusion, a stale need and a missing source fail loud, never pass', async (t) => {
  const root = scratch(t);
  const registry = structuredClone(REGISTRY);
  registry.facts.find((f) => f.id === 'banned-phrases').exclusions.push({ re: '^nowhere/', why: 'x'.repeat(50) });
  registry.facts.find((f) => f.id === 'card-fields').sites.find((s) => s.need).need.push('Outcome');
  const stale = await checkMirrors(root, registry);
  assert.equal(stale.code, 1);
  assert.ok(stale.lines.some((l) => /^FAIL: banned-phrases — mirror-facts\.json: exclusion .* matches no scanned file/.test(l)));
  assert.ok(stale.lines.some((l) => /^FAIL: card-fields — .*stale registry need "Outcome"/.test(l)));
  rmSync(join(root, fileOf('CC')));
  const gone = await checkMirrors(root);
  assert.equal(gone.code, 1);
  assert.ok(gone.lines.some((l) => l.startsWith(`FAIL: verdict-files — ${fileOf('CC')}: source unreadable`)));
});

test('cli: exit codes, --root, and a run through a symlink still checks', (t) => {
  const root = scratch(t);
  const ok = run(['--root', root]);
  assert.equal(ok.status, 0, ok.stdout);
  assert.match(ok.stdout, /^OK: readset:goal-audit — \d+ sites$/m);
  assert.equal(run(['--root', 'relative/path']).status, 2);
  assert.equal(run(['--bogus']).status, 2);
  const link = join(root, 'linked-check-mirrors.mjs');
  symlinkSync(CLI, link);
  const viaLink = spawnSync(process.execPath, [link, '--root', root], { encoding: 'utf8' });
  assert.equal(viaLink.status, 0);
  assert.match(viaLink.stdout, /facts hold$/m);
});

test('not vacuous: the tree before the redirection fails', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'check-mirrors-before-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  try {
    // no pipe: a git failure must reach the skip, not leave an empty tree that fails for the wrong reason
    execFileSync('sh', ['-c', 'set -e; git -C "$1" archive -o "$3/a.tar" "$2" .claude; tar -xf "$3/a.tar" -C "$3"', 'sh', REPO, BEFORE_REDIRECTION, root], { stdio: 'pipe' });
  } catch (error) {
    t.skip(`git archive ${BEFORE_REDIRECTION} unavailable: ${String(error.stderr ?? error.message).trim()}`);
    return;
  }
  assert.ok(existsSync(join(root, fileOf('SKILL'))), 'the archive extracted no create skill');
  const result = run(['--root', root]);
  t.diagnostic(`${fails(result.stdout.split('\n')).length} FAIL lines`);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /^FAIL: discovery-exits — /m);
  assert.match(result.stdout, /^FAIL: banned-phrases — .*latitude-low-medium/m);
});
