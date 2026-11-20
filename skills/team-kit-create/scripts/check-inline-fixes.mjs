#!/usr/bin/env node
// seal check shared by create step 7 and run boot (claude lane): every `silent` row a verdict file lists
// is closed in inline-fixes.md, by a lead edit that applies the row's own Fix text or by a live user
// decision that names it, and every `## Run watch` row reached run-watch.md (references/acceptance.md →
// Finding classes). efforts dated before the change keep the older boot rule.
// node check-inline-fixes.mjs <abs session dir>    exit 0 sealed, 1 open, 2 usage

import { existsSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const VERDICTS = ['definition-of-done.md', 'goal-auditor/sat.md', 'goal-auditor/goal-audit.md', 'plan-review.md'];
// the files an inline fix may edit: the contract, never a verdict or the ledger
export const CONTRACT = ['team-plan.md', 'design.md', 'requirements.md', 'definition-of-done.md'];
// sessions dated earlier sealed under the old boot rule (goal-audit CLEAN, sat CLEAN or skipped), unless
// they already carry a new-rule artifact: an effort planned under the new rules is checked by them
export const NEW_RULE_FROM = '20261106';
export const NEW_RULE_ARTIFACTS = ['inline-fixes.md', 'run-watch.md'];
// a shorter text could match by accident and close a finding nobody fixed
const MIN_TEXT = 8;

const nonEmpty = (text) => text.split('\n').map((line) => line.trimEnd()).filter((line) => line.trim());
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const unquote = (s) => s.trim().replace(/^`+|`+$/g, '').trim();
const bare = (s) => s.replace(/[`*]/g, '').trim();
// a pipe inside a markdown table cell is written `\|`
const unpipe = (s) => s.replaceAll('\\|', '|');
const cellsOf = (line) => line.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((cell) => cell.trim());
const isSeparator = (line) => /^\|?\s*:?-{3,}/.test(line.trim());

// rows of every markdown table whose class cell reads `silent`, with the row's own Fix cell
export const silentRows = (text) => {
  const rows = [];
  const lines = text.split('\n');
  for (let i = 1; i < lines.length; i += 1) {
    if (!lines[i].trim().startsWith('|') || !isSeparator(lines[i]) || !lines[i - 1].trim().startsWith('|')) continue;
    const header = cellsOf(lines[i - 1]).map((cell) => bare(cell).toLowerCase());
    const fixAt = header.findIndex((name) => /^(inline )?fix\b/.test(name));
    for (let j = i + 1; j < lines.length && lines[j].trim().startsWith('|'); j += 1) {
      const cells = cellsOf(lines[j]);
      if (!cells.some((cell) => bare(cell).toLowerCase() === 'silent')) continue;
      rows.push({ id: bare(cells[0]), row: unpipe(lines[j]), fix: fixAt >= 0 ? unpipe(cells[fixAt] ?? '') : '' });
    }
  }
  return rows;
};

// `- <verdict> <id> — <file> — was: <old text, or (insert)> — now reads: <new text>`
export const parseFixes = (text) =>
  nonEmpty(text).flatMap((line) => {
    const m = /^- (\S+) (\S+) — (\S+) — was: (.+?) — now reads: (.+)$/.exec(line);
    return m ? [{ verdict: m[1], id: m[2], file: m[3], was: unquote(m[4]), now: unquote(m[5]) }] : [];
  });

// `- <verdict> <id> — accepted: D-n`
export const parseAccepted = (text) =>
  nonEmpty(text).flatMap((line) => {
    const m = /^- (\S+) (\S+) — accepted: (D-\d+)$/.exec(line);
    return m ? [{ verdict: m[1], id: m[2], decision: m[3] }] : [];
  });

// a live user decision naming the finding; a prompt.md waiver or afk never accepts for the user (references/afk.md → Budget)
export const userAccepts = (map, decision, id) =>
  nonEmpty(map).some(
    (line) =>
      new RegExp(`^[\\s|*-]*${escape(decision)}\\b`).test(line) &&
      new RegExp(`(^|[^\\w-])${escape(id)}([^\\w-]|$)`).test(line) &&
      /Source: user\b/.test(line) &&
      !/Source: user\b[^|;]*\b(waiver|prompt\.md|afk)\b/i.test(line),
  );

// `- <verdict> <id> — <task> / <AC clause> — symptom: … — hint: …`
export const parseWatched = (text) =>
  new Set(nonEmpty(text).flatMap((line) => {
    const m = /^- (\S+) (\S+) — .+ — symptom: \S.* — hint: \S/.exec(line);
    return m ? [`${m[1]} ${bare(m[2])}`] : [];
  }));

// first cell of each table row or bullet under `## Run watch`, up to the next heading
export const runWatchIds = (text) => {
  const ids = [];
  let inside = false;
  for (const line of nonEmpty(text)) {
    if (/^#{1,6} /.test(line)) {
      inside = /^#{1,6} Run watch\b/i.test(line);
      continue;
    }
    if (!inside || isSeparator(line) || !/^\s*[|-]/.test(line)) continue;
    const first = bare(line.replace(/^[\s|-]+/, '').split(/\s*\|\s*|\s+—\s+|\s+/)[0] ?? '').replace(/:$/, '');
    if (!first || /^(id|#|finding|none|no|\(none\)|\{.*)$/i.test(first)) continue;
    ids.push(first);
  }
  return ids;
};

// why a fix line does not close its row, or null when it does
const fixFailure = (session, row, fix) => {
  if (fix.now.length < MIN_TEXT) return `now-reads text is under ${MIN_TEXT} characters`;
  if (!row.fix.includes(fix.now)) return "now-reads text is not in the row's own Fix cell";
  if (/^[\w./-]+\.[a-z]{1,5}$/i.test(fix.now)) return 'now-reads text is a file name, not a fix';
  if (row.row.replace(row.fix, '').includes(fix.now)) return 'now-reads text is quoted in the row as current text';
  if (!CONTRACT.includes(fix.file)) return `${fix.file} is not a contract file (${CONTRACT.join(', ')})`;
  const path = join(session, fix.file);
  if (!existsSync(path)) return `${fix.file} not found`;
  const content = readFileSync(path, 'utf8');
  if (!content.includes(fix.now)) return `${fix.file} does not contain the fix`;
  if (fix.was === '(insert)') return null;
  if (!row.row.includes(fix.was)) return 'was text is not quoted in the row';
  // the swap guard: the old text may sit in the Fix cell only as part of the new text
  if (row.fix.includes(fix.was) && !fix.now.includes(fix.was)) return 'was text comes from the Fix cell';
  if (content.replaceAll(fix.now, '').includes(fix.was)) return `${fix.file} still contains the was text`;
  return null;
};

const checkVerdict = (session, verdict, { fixes, accepted, watched, map }) => {
  const path = join(session, verdict);
  if (!existsSync(path)) return [`${verdict}: missing`];
  const text = readFileSync(path, 'utf8');
  const lines = nonEmpty(text);
  const status = lines.at(-1)?.trim() ?? '';
  const errors = runWatchIds(text)
    .filter((id) => !watched.has(`${verdict} ${id}`))
    .map((id) => `${verdict}: Run watch ${id} is not in run-watch.md with a symptom and a hint`);

  const clean = /^STATUS: CLEAN\b/.test(status);
  const open = /^STATUS: ERRORS_REMAINING: (\d+)\b/.exec(status);
  // a one-line skip file (SKILL.md Step 4d-b) carries no STATUS of its own
  const skipped = verdict === 'goal-auditor/sat.md' && lines.length <= 2 && /proportionality skip/i.test(text);
  if (!clean && !open && !skipped) return [...errors, `${verdict}: last line "${status.slice(0, 60)}" is neither CLEAN nor ERRORS_REMAINING`];
  if (clean && verdict === 'plan-review.md') {
    const ready = lines.filter((line) => line.trim() === 'Readiness: READY').length;
    if (ready !== 1) errors.push(`${verdict}: CLEAN needs exactly one "Readiness: READY" line, found ${ready}`);
  }

  // ledger lines for other passes or ids are ignored: only the rows this verdict lists can be closed
  const rows = silentRows(text);
  for (const row of rows) {
    const mine = fixes.filter((fix) => fix.verdict === verdict && fix.id === row.id);
    const why = mine.map((fix) => fixFailure(session, row, fix));
    const fixed = why.some((reason) => reason === null);
    const ok = fixed || accepted.some((a) => a.verdict === verdict && a.id === row.id && userAccepts(map, a.decision, row.id));
    if (!ok) errors.push(`${verdict}: silent ${row.id} is open${why.length ? ` (${why.filter(Boolean).join('; ')})` : ''}`);
  }
  if (open && rows.length < Number(open[1])) errors.push(`${verdict}: STATUS counts ${open[1]} silent finding(s) but the tables list ${rows.length} silent row(s)`);
  return errors;
};

// the boot rule before 2026-11-06: goal-audit reads CLEAN, sat reads CLEAN or carries the skip
const checkLegacy = (session) => {
  const last = (name) => {
    const path = join(session, name);
    return existsSync(path) ? { text: readFileSync(path, 'utf8'), status: nonEmpty(readFileSync(path, 'utf8')).at(-1)?.trim() ?? '' } : null;
  };
  const audit = last('goal-auditor/goal-audit.md');
  const sat = last('goal-auditor/sat.md');
  const errors = [];
  if (audit?.status !== 'STATUS: CLEAN') errors.push('goal-auditor/goal-audit.md: not CLEAN (legacy rule)');
  if (!sat || (sat.status !== 'STATUS: CLEAN' && !/proportionality skip/i.test(sat.text))) errors.push('goal-auditor/sat.md: neither CLEAN nor skipped (legacy rule)');
  return errors;
};

export const checkSeal = (sessionPath) => {
  const session = resolve(sessionPath);
  const dated = /^(\d{8})-/.exec(basename(session))?.[1];
  const planned = NEW_RULE_ARTIFACTS.some((name) => existsSync(join(session, name)));
  if (dated && dated < NEW_RULE_FROM && !planned) {
    const errors = checkLegacy(session);
    return { ok: errors.length === 0, errors, legacy: true };
  }
  const read = (name) => (existsSync(join(session, name)) ? readFileSync(join(session, name), 'utf8') : '');
  const ledger = read('inline-fixes.md');
  const context = { fixes: parseFixes(ledger), accepted: parseAccepted(ledger), watched: parseWatched(read('run-watch.md')), map: read('map.md') };
  const errors = VERDICTS.flatMap((verdict) => checkVerdict(session, verdict, context));
  return { ok: errors.length === 0, errors, legacy: false };
};

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const session = process.argv[2];
  if (!session) {
    console.error('usage: check-inline-fixes.mjs <abs session dir>');
    process.exit(2);
  }
  const { ok, errors, legacy } = checkSeal(session);
  for (const error of errors) console.log(error);
  const rule = legacy ? ' (legacy rule: sealed before 2026-11-06)' : '';
  console.log(ok ? `sealed${rule}` : `open: ${errors.length}${rule}`);
  process.exit(ok ? 0 : 1);
}
