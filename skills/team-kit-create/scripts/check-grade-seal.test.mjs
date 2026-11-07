import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { after } from 'node:test';
import { checkGradeSeal } from './check-grade-seal.mjs';
import { buildBundle, gradeSealTag, sha256File } from './grade-seal-lib.mjs';

const sealScript = fileURLToPath(new URL('./grade-seal.mjs', import.meta.url));
const checkScript = fileURLToPath(new URL('./check-grade-seal.mjs', import.meta.url));
const runLink = fileURLToPath(new URL('../../team-kit-run/scripts/check-grade-seal.mjs', import.meta.url));
const EFFORT = 'fx-effort';
const GRADE_REL = 'goal-auditor/final-grade.md';
// the DEFINITION-OF-DONE.md template row (team-plan.md T-8 hunk 2) verbatim, placeholders filled
const TEMPLATE_ROW = (session) =>
  `| AC-5 grade-seal-gate | After the final grade, graded inputs that live only under untracked \`team-session/\` are in a grade seal committed on \`main\`: the grade file's inventory is \`shasum -a 256\` lines (\`<64-hex>  <path>\`, path absolute under the repo root or repo-relative, never session-relative); the post-grade seal task runs \`.claude/skills/team-kit-run/scripts/grade-seal.mjs\` and commits every path it wrote, path-limited on \`main\`; this verify runs after that commit, never in the pre-grade validate stage (\`.claude/skills/team-kit-create/references/grade-seal.md\` → Lifecycle) | T-9 | deterministic | \`node .claude/skills/team-kit-run/scripts/check-grade-seal.mjs ${session}\` → exit 0 | true |`;
// the restore command grade-seal.md → Verify from the seal pins
const RESTORE = (repo, sealRel) => `git -C ${repo} show main:${sealRel}/inputs.tar.zst | zstd -dc | /usr/bin/tar -xkf - -C ${repo} -s ',^\\./_grade/,./,'`;

const bases = [];
after(() => {
  for (const base of bases) rmSync(base, { recursive: true, force: true });
});

const git = (cwd, ...args) => {
  const r = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
};
const put = (abs, text) => {
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, text);
  return abs;
};
const commitPaths = (repo, paths, message = 'seal') => {
  git(repo, 'add', '--', ...paths);
  git(repo, 'commit', '-q', '-m', message, '--', ...paths);
};

// repo with docs/tracked.md committed twice (v1, v2), a gitignored session holding two inputs, a closure record
// and optionally a dod carrying the grade-seal-gate row
const fixture = ({ dod = true } = {}) => {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'check-grade-seal-')));
  bases.push(base);
  // scripts under test get their own TMPDIR: grade-seal.test.mjs (run in parallel) watches the shared one
  const tmp = join(base, 'tmp');
  mkdirSync(tmp);
  const repo = join(base, 'repo');
  mkdirSync(repo);
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, 'config', 'user.email', 't@t');
  git(repo, 'config', 'user.name', 't');
  git(repo, 'config', 'commit.gpgsign', 'false');
  put(join(repo, '.gitignore'), 'team-session/\n');
  put(join(repo, 'docs/tracked.md'), 'tracked v1\n');
  commitPaths(repo, ['.gitignore', 'docs/tracked.md'], 'init');
  const v1 = git(repo, 'rev-parse', 'HEAD');
  put(join(repo, 'docs/tracked.md'), 'tracked v2\n');
  commitPaths(repo, ['docs/tracked.md'], 'v2');
  const session = join(repo, 'team-session', EFFORT);
  const inputs = [put(join(session, 'inputs/a.json'), '{"a":1}\n'), put(join(session, 'inputs/b.json'), '{"b":2}\n')];
  put(join(session, 'build-state.md'), '# build state\n\nclosed\n');
  if (dod) put(join(session, 'definition-of-done.md'), `# DoD\n\n| AC | statement | maps_to | type | verify | blocking |\n|---|---|---|---|---|---|\n${TEMPLATE_ROW(session)}\n`);
  return { base, tmp, repo, session, inputs, tracked: join(repo, 'docs/tracked.md'), v1 };
};

const writeGrade = (f, paths = [...f.inputs, f.tracked], extra = '') =>
  put(join(f.session, GRADE_REL), `# Final grade\n\n## Appendix A\n\n${paths.map((p) => `${sha256File(p)}  ${p}`).join('\n')}\n${extra}`);
const run = (args, f) => spawnSync(process.execPath, args, { encoding: 'utf8', env: f ? { ...process.env, TMPDIR: f.tmp } : process.env });
const check = (f, ...args) => run([checkScript, f.session, ...args], f);
const outOf = (r) => `${r.stdout}${r.stderr}`;
const seal = (f) => {
  const r = run([sealScript, f.session, '--disposition', 'fixture closed'], f);
  assert.equal(r.status, 0, outOf(r));
  return r.stdout.split('\n').filter((l) => l.startsWith('WROTE ')).map((l) => l.slice(6));
};
const sealRelOf = (f) => `team-kit-seals/${EFFORT}/${gradeSealTag(GRADE_REL, sha256File(join(f.session, GRADE_REL)))}`;
const sealed = (opts) => {
  const f = fixture(opts);
  writeGrade(f);
  commitPaths(f.repo, seal(f));
  return { f, sealRel: sealRelOf(f) };
};
const expectExit = (r, code, re) => {
  assert.equal(r.status, code, outOf(r));
  if (re) assert.match(outOf(r), re);
};
const editCommitted = (f, rel, edit) => {
  const abs = join(f.repo, rel);
  writeFileSync(abs, edit(readFileSync(abs, 'utf8')));
  commitPaths(f.repo, [rel], `edit ${rel}`);
};

test('CK-1 gated dod row + untracked input + no seal exits 1 naming the path', () => {
  const f = fixture();
  writeGrade(f);
  const r = check(f);
  expectExit(r, 1, /FAIL: no grade seal at team-kit-seals\/fx-effort\/final-grade-[0-9a-f]{12}/);
  assert.match(r.stdout, /FAIL: untracked-only input: team-session\/fx-effort\/inputs\/a\.json/);
  assert.doesNotMatch(r.stdout, /untracked-only input: docs\/tracked\.md/);
});

test('CK-2 gated + committed seal exits 0', () => {
  const { f } = sealed();
  const r = check(f);
  expectExit(r, 0, /^OK: grade seal verified fx-effort final-grade-[0-9a-f]{12} \(3 inputs: 2 bundled, 1 tracked\)$/m);
  assert.match(r.stdout, /^INFO: closure record sha matches seal$/m);
  assert.match(r.stdout, /^INFO: origin\/main contains seal commit: unknown$/m);
});

test('CK-3 tampered bundle exits 1 bundle sha mismatch', () => {
  const { f, sealRel } = sealed();
  const rel = `${sealRel}/inputs.tar.zst`;
  appendFileSync(join(f.repo, rel), Buffer.from([0]));
  commitPaths(f.repo, [rel], 'tamper');
  expectExit(check(f), 1, /FAIL: bundle sha mismatch/);
});

test('CK-4 gated + no parseable inventory exits nonzero (1)', () => {
  const f = fixture();
  put(join(f.session, GRADE_REL), `# Final grade\n\n- inputs: see appendix\n${sha256File(f.inputs[0])} ${f.inputs[0]}\n`);
  const r = check(f);
  expectExit(r, 1, /FAIL: no parseable shasum -a 256 inventory lines in team-session\/fx-effort\/goal-auditor\/final-grade\.md/);
  assert.notEqual(r.status, 0);
});

test('CK-5 seal untracked exits 1; seal staged only exits 1', () => {
  const f = fixture();
  writeGrade(f);
  const written = seal(f);
  expectExit(check(f), 1, /FAIL: grade seal not committed on main \(untracked or staged only\)/);
  git(f.repo, 'add', '--', ...written);
  expectExit(check(f), 1, /FAIL: grade seal not committed on main \(untracked or staged only\)/);
});

test('CK-6 bad args exit 2 (none, relative, missing dir, extra positional, unknown flag)', () => {
  const f = fixture();
  writeGrade(f);
  for (const args of [[], ['team-session/fx-effort'], [join(f.repo, 'team-session/nope')], [f.session, f.session], [f.session, '--bogus']]) {
    const r = run([checkScript, ...args], f);
    assert.equal(r.status, 2, `${args.join(' ')}: ${outOf(r)}`);
    assert.match(r.stderr, /^usage: check-grade-seal\.mjs/m);
  }
});

test('CK-7 ungated exits 3 and prints not gated + grade-seal-gate', () => {
  const f = fixture({ dod: false });
  put(join(f.session, 'definition-of-done.md'), '# DoD\n\n| AC-1 other | x | T-1 | deterministic | y | true |\n');
  writeGrade(f);
  const r = check(f);
  expectExit(r, 3, /^not gated: fx-effort — definition-of-done\.md carries no grade-seal-gate row and team-kit-seals\/fx-effort\/ holds no grade seal$/m);
  assert.match(r.stdout, /grade-seal-gate/);
});

test('CK-8 seal-gated effort without dod row exits 0', () => {
  const { f } = sealed({ dod: false });
  expectExit(check(f), 0, /^OK: grade seal verified/m);
});

test('CK-9 tracked row pointing at non-matching commit exits 1', () => {
  const { f, sealRel } = sealed();
  editCommitted(f, `${sealRel}/GRADE-SEAL.md`, (t) => t.replace(/^[0-9a-f]{40}(\t[0-9a-f]{64}\tdocs\/tracked\.md)$/m, `${f.v1}$1`));
  expectExit(check(f), 1, /FAIL: tracked content at [0-9a-f]{12} does not match: docs\/tracked\.md/);
});

test('CK-10 grade file changed after seal exits 1', () => {
  const { f } = sealed();
  appendFileSync(join(f.session, GRADE_REL), '\nregraded note\n');
  expectExit(check(f), 1, /FAIL: no grade seal at /);
});

test('CK-11 member sha mismatch with consistent bundle sha exits 1', () => {
  const { f, sealRel } = sealed();
  const rel = (abs) => abs.slice(f.repo.length + 1);
  const original = readFileSync(f.inputs[0]);
  writeFileSync(f.inputs[0], '{"a":"forged"}\n');
  const out = join(f.repo, sealRel, 'inputs.tar.zst');
  const sharedTmp = process.env.TMPDIR;
  process.env.TMPDIR = f.tmp;
  let b;
  try {
    b = buildBundle(f.repo, f.inputs.map(rel), [rel(join(f.session, GRADE_REL)), rel(join(f.session, 'build-state.md'))], out);
  } finally {
    if (sharedTmp === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = sharedTmp;
  }
  writeFileSync(f.inputs[0], original);
  const recRel = `${sealRel}/GRADE-SEAL.md`;
  writeFileSync(join(f.repo, recRel), readFileSync(join(f.repo, recRel), 'utf8').replace(/^Bundle sha256: .*$/m, `Bundle sha256: ${b.sha256}`).replace(/^Bundle bytes: .*$/m, `Bundle bytes: ${b.bytes}`));
  commitPaths(f.repo, [`${sealRel}/inputs.tar.zst`, recRel], 'forge member');
  const r = check(f);
  expectExit(r, 1, /FAIL: bundled input sha differs from MANIFEST\.sha256: team-session\/fx-effort\/inputs\/a\.json/);
  assert.doesNotMatch(r.stdout, /bundle sha mismatch/);
});

test('CK-12 missing INDEX row exits 1', () => {
  const { f } = sealed();
  editCommitted(f, 'team-kit-seals/INDEX.md', (t) => t.split('\n').filter((l) => !l.startsWith(`| ${EFFORT} |`)).join('\n'));
  expectExit(check(f), 1, /FAIL: team-kit-seals\/INDEX\.md on main holds no row/);
});

test('CK-13 closure record drift prints INFO and exits 0', () => {
  const { f } = sealed();
  appendFileSync(join(f.session, 'build-state.md'), '\n| AC-5 grade-seal-gate | passed |\n');
  const r = check(f);
  expectExit(r, 0, /^INFO: closure record sha drift \(expected after a post-grade gate verdict; reseal only per grade-seal\.md → Reseal\)$/m);
});

test('CK-14 invocation through team-kit-run symlink resolves lib and exits 2 on no args', () => {
  assert.ok(existsSync(runLink), runLink);
  assert.equal(realpathSync(runLink), realpathSync(checkScript));
  const r = run([runLink]);
  expectExit(r, 2, /^usage: check-grade-seal\.mjs/m);
  assert.doesNotMatch(r.stderr, /ERR_MODULE_NOT_FOUND/);
});

test('CK-15 lifecycle: gated fixture fails before the grade exists, passes after grade, seal, commit with grade bytes untouched; regrade fails until resealed, then passes', () => {
  const f = fixture();
  expectExit(check(f), 1, /FAIL: grade file team-session\/fx-effort\/goal-auditor\/final-grade\.md absent/);
  const grade = writeGrade(f);
  const gradeSha = sha256File(grade);
  commitPaths(f.repo, seal(f));
  expectExit(check(f), 0, /^OK: grade seal verified/m);
  assert.equal(sha256File(grade), gradeSha);
  writeGrade(f, [...f.inputs, f.tracked], '\n## Regrade\n\nsecond attempt\n');
  assert.notEqual(sha256File(grade), gradeSha);
  expectExit(check(f), 1, /FAIL: no grade seal at /);
  commitPaths(f.repo, seal(f));
  expectExit(check(f), 0, /^OK: grade seal verified/m);
});

test('CK-16 seal committed on main with worktree seal deleted stays gated and exits 0', () => {
  const { f } = sealed({ dod: false });
  rmSync(join(f.repo, 'team-kit-seals', EFFORT), { recursive: true });
  expectExit(check(f), 0, /^OK: grade seal verified/m);
});

test('CK-17 session wiped: --from-seal exits 0; documented restore command then normal check exits 0', () => {
  const { f, sealRel } = sealed();
  const shas = [...f.inputs, join(f.session, GRADE_REL), join(f.session, 'build-state.md')].map((p) => [p, sha256File(p)]);
  rmSync(f.session, { recursive: true });
  expectExit(check(f, '--from-seal'), 0, /^OK: grade seal verified .* \[from seal\]$/m);
  expectExit(check(f, '--from-seal', sealRel.split('/').at(-1)), 0, /^INFO: verified from seal \(session files not read\)$/m);
  const r = spawnSync('/bin/sh', ['-c', RESTORE(f.repo, sealRel)], { encoding: 'utf8' });
  assert.equal(r.status, 0, outOf(r));
  for (const [p, sha] of shas) assert.equal(sha256File(p), sha, p);
  assert.equal(existsSync(join(f.repo, '_grade')), false);
  expectExit(check(f), 0, /^OK: grade seal verified fx-effort final-grade-[0-9a-f]{12} \(3 inputs/m);
});

test('CK-18 committed bundle over cap exits 1 (checkGradeSeal maxBundleBytes)', () => {
  const { f } = sealed();
  const r = checkGradeSeal(f.session, { maxBundleBytes: 10 });
  assert.equal(r.code, 1, r.lines.join('\n'));
  assert.match(r.lines.join('\n'), /FAIL: bundle \d+ B exceeds cap 10 B — do not push; re-present storage \(D-4\)/);
  assert.equal(checkGradeSeal(f.session, { maxBundleBytes: 50_000_001 }).code, 2);
});

test('CK-19 grade file absent in normal mode exits 1 naming the lifecycle and --from-seal', () => {
  const f = fixture();
  const r = check(f);
  expectExit(r, 1, /grade-seal\.md → Lifecycle/);
  assert.match(r.stdout, /--from-seal/);
});

test('CK-20 manifest edited and re-committed on main after the seal exits 1 naming MANIFEST', () => {
  const { f, sealRel } = sealed();
  editCommitted(f, `${sealRel}/MANIFEST.sha256`, (t) => t.split('\n').filter((l) => !l.includes('inputs/b.json')).join('\n'));
  expectExit(check(f), 1, /FAIL: MANIFEST\.sha256 on main differs from the inventory/);
});
