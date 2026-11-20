import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { checkSeal, runWatchIds } from './check-inline-fixes.mjs';

const script = fileURLToPath(new URL('./check-inline-fixes.mjs', import.meta.url));
const clean = 'STATUS: CLEAN';
const OLD = 'tar -cf out.tar ./data';
const NEW = 'tar -C "$d" -cf out.tar data';
const header = '| id | clause / task | class | defect | fix |\n|---|---|---|---|---|';
const row = (id = 'S-1', fix = `\`${NEW}\` → T-58`, klass = 'silent') => `| ${id} | AC-3 c2 / T-58 | ${klass} | T-58 runs \`${OLD}\`, so members start with ./ | ${fix} |`;
const verdict = (rows = [row()], status = 'STATUS: ERRORS_REMAINING: 1', extra = '') => `# Verdict\n\n## Defects\n\n${header}\n${rows.join('\n')}\n${extra}\n${status}\n`;
const review = (body = 'Readiness: READY', status = clean) => `# Plan Review\n\n## Implementation Readiness\n\n${body}\n\n${status}\n`;
const before = `# Plan\n\nT-58: run \`${OLD}\`\n`;
const after = `# Plan\n\nT-58: run \`${NEW}\`\n`;
const fixLine = (over = {}) => {
  const f = { verdict: 'goal-auditor/sat.md', id: 'S-1', file: 'team-plan.md', was: `\`${OLD}\``, now: `\`${NEW}\``, ...over };
  return `- ${f.verdict} ${f.id} — ${f.file} — was: ${f.was} — now reads: ${f.now}\n`;
};

const session = (files = {}, name = null) => {
  const base = mkdtempSync(join(tmpdir(), 'inline-fixes-'));
  const dir = name ? join(base, name) : base;
  mkdirSync(join(dir, 'goal-auditor'), { recursive: true });
  const all = {
    'definition-of-done.md': `# DoD\n\n${clean}\n`,
    'goal-auditor/sat.md': `# SAT\n\n${clean}\n`,
    'goal-auditor/goal-audit.md': `# Audit\n\n${clean}\n`,
    'plan-review.md': review(),
    'inline-fixes.md': null,
    'run-watch.md': null,
    'team-plan.md': before,
    'map.md': '# Map\n',
    ...files,
  };
  for (const [path, text] of Object.entries(all)) if (text !== null) writeFileSync(join(dir, path), text);
  return dir;
};
const seals = (files, name) => assert.deepEqual(checkSeal(session(files, name)).errors, []);
const fails = (files, pattern, name) => {
  const result = checkSeal(session(files, name));
  assert.equal(result.ok, false, JSON.stringify(result));
  assert.match(result.errors.join('\n'), pattern);
};
const openSat = (over = {}) => ({ 'goal-auditor/sat.md': verdict(), 'team-plan.md': after, 'inline-fixes.md': fixLine(), ...over });

test('every verdict CLEAN and the review READY seals', () => {
  seals({});
});

test("a silent row closed with its own Fix text seals without a re-run, and tolerates trailing STATUS text", () => {
  seals(openSat());
  seals(openSat({ 'goal-auditor/sat.md': verdict([row()], 'STATUS: ERRORS_REMAINING: 1 silent') }));
  seals({ 'goal-auditor/sat.md': `# SAT\n\nSTATUS: CLEAN (2 loud under Run watch)\n` });
  seals(openSat({ 'inline-fixes.md': fixLine({ was: '(insert)' }) }));
});

test('a closure without the edit stays open', () => {
  // the defective text the row quotes, plan untouched
  fails(openSat({ 'team-plan.md': before, 'inline-fixes.md': fixLine({ now: `\`${OLD}\`` }) }), /not in the row's own Fix cell/);
  fails(openSat({ 'team-plan.md': before }), /does not contain the fix/);
  // old and new swapped when the Fix cell quotes both
  const both = row('S-1', `replace \`${OLD}\` with \`${NEW}\``);
  fails(openSat({ 'goal-auditor/sat.md': verdict([both]), 'team-plan.md': before, 'inline-fixes.md': fixLine({ was: `\`${NEW}\``, now: `\`${OLD}\`` }) }), /quoted in the row as current text/);
  // new text added but the old one left in place
  fails(openSat({ 'team-plan.md': `${before}${after}` }), /still contains the was text/);
});

test('a closure naming a verdict, the ledger or a location stays open', () => {
  fails(openSat({ 'inline-fixes.md': fixLine({ file: 'goal-auditor/sat.md' }) }), /not a contract file/);
  fails(openSat({ 'inline-fixes.md': fixLine({ file: 'inline-fixes.md' }) }), /not a contract file/);
  const located = row('S-1', `\`${NEW}\` → \`team-plan.md\` T-58`);
  fails(openSat({ 'goal-auditor/sat.md': verdict([located]), 'team-plan.md': `${after}see team-plan.md\n`, 'inline-fixes.md': fixLine({ was: '(insert)', now: 'team-plan.md' }) }), /a file name/);
});

test('every listed silent row must close, whatever the count says', () => {
  const second = row('S-5', 'none');
  fails(openSat({ 'goal-auditor/sat.md': verdict([row(), second], 'STATUS: ERRORS_REMAINING: 1') }), /silent S-5 is open/);
  fails(openSat({ 'goal-auditor/sat.md': verdict([row()], clean) , 'inline-fixes.md': '' }), /silent S-1 is open/);
  fails(openSat({ 'goal-auditor/sat.md': verdict([row()], 'STATUS: ERRORS_REMAINING: 2') }), /counts 2 silent finding\(s\) but the tables list 1/);
});

test('ledger lines for another pass are ignored and never close a different finding', () => {
  seals(openSat({ 'inline-fixes.md': `${fixLine()}${fixLine({ id: 'S-2' })}` }));
  const reused = row('S-1', '`tar -C "$d" -cf other.tar logs` → T-60');
  fails(openSat({ 'goal-auditor/sat.md': verdict([reused]) }), /silent S-1 is open/);
});

test('a live user decision naming the finding accepts it; a waiver, an unrelated row or an invented id does not', () => {
  const accept = '- goal-auditor/sat.md S-1 — accepted: D-12\n';
  const sat = verdict();
  const map = (text) => `# Map\n\n${text}\n`;
  seals({ 'goal-auditor/sat.md': sat, 'inline-fixes.md': accept, 'map.md': map('| D-12 accept-residue | sat S-1 runs as residue after we rejected the waiver route; Source: user — checkpoint answer 2026-11-05 | sat.md |') });
  seals({ 'goal-auditor/sat.md': sat, 'inline-fixes.md': accept, 'map.md': map('- **D-12** accept S-1 as residue; Source: user — "ship it with S-1 open"') });
  fails({ 'goal-auditor/sat.md': sat, 'inline-fixes.md': accept, 'map.md': map('| D-12 accept-residue | S-1 residue; Source: user (prompt.md take-all instruction) | sat.md |') }, /silent S-1 is open/);
  fails({ 'goal-auditor/sat.md': sat, 'inline-fixes.md': accept, 'map.md': map('| D-12 clarify | users want CSV; Source: user — clarify answer | requirements.md |') }, /silent S-1 is open/);
  fails({ 'goal-auditor/sat.md': sat, 'inline-fixes.md': '- goal-auditor/sat.md ZZZ — accepted: D-12\n', 'map.md': map('| D-12 x | ZZZ; Source: user — answer | x |') }, /silent S-1 is open/);
});

test('every Run watch row, table or bullet, must reach run-watch.md with a symptom and a hint', () => {
  const sat = (rows) => `# SAT\n\n## Run watch\n\n${rows}\n\n${clean}\n`;
  const table = '| id | AC clause / task | symptom | fix hint |\n|---|---|---|---|\n| `E2-1` | AC-4 / T-12 | host lacks `jq` | install jq in T-12 |';
  const watch = '- goal-auditor/sat.md E2-1 — T-12 / AC-4 — symptom: host lacks jq — hint: install jq in T-12\n';
  fails({ 'goal-auditor/sat.md': sat(table) }, /Run watch E2-1 is not in run-watch.md/);
  seals({ 'goal-auditor/sat.md': sat(table), 'run-watch.md': watch });
  fails({ 'goal-auditor/sat.md': sat(table), 'run-watch.md': '- goal-auditor/sat.md E2-1 — T-12\n' }, /Run watch E2-1/);
  fails({ 'goal-auditor/sat.md': sat('- E2-1 — T-12: host lacks jq; install it') }, /Run watch E2-1/);
});

test('Run watch ids skip headers, separators and placeholders', () => {
  const text = '## Run watch\n\n| id | AC | symptom | hint |\n|---|---|---|---|\n| **S-2** | AC-4 | x | y |\n- G-2 | T-4 | wrong flag | use --x |\n{`loud` findings only | … }\nNo loud findings.\n- none\n\n## Recommendation\n| S-9 | x |\n';
  assert.deepEqual(runWatchIds(text), ['S-2', 'G-2']);
});

test('a CLEAN review without exactly one READY line, a BLOCKED audit and a missing DoD or review stay open', () => {
  fails({ 'plan-review.md': review('Readiness: NOT READY') }, /exactly one "Readiness: READY"/);
  fails({ 'goal-auditor/goal-audit.md': '# Audit\n\nSTATUS: BLOCKED\n' }, /neither CLEAN nor ERRORS_REMAINING/);
  fails({ 'plan-review.md': null }, /plan-review.md: missing/);
  fails({ 'definition-of-done.md': null }, /definition-of-done.md: missing/);
});

test('an effort dated before the change keeps the old boot rule', () => {
  seals({ 'plan-review.md': null, 'goal-auditor/sat.md': `# SAT\n\n${clean}\n` }, '20261104-old-effort');
  fails({ 'goal-auditor/sat.md': verdict() }, /neither CLEAN nor skipped \(legacy rule\)/, '20261104-old-effort');
  seals({}, '20261106-new-effort');
  // planned under the new rules before the cutoff: its inline fixes count
  seals({ ...openSat(), 'plan-review.md': review() }, '20261105-mid-change-effort');
  fails({ 'goal-auditor/sat.md': verdict(), 'inline-fixes.md': '' }, /silent S-1 is open/, '20261105-mid-change-effort');
});

test('the CLI exits 0 when sealed, 1 when open, 2 without a session', () => {
  assert.equal(spawnSync(process.execPath, [script, session()]).status, 0);
  assert.equal(spawnSync(process.execPath, [script, session({ 'goal-auditor/sat.md': verdict() })]).status, 1);
  assert.equal(spawnSync(process.execPath, [script]).status, 2);
});
