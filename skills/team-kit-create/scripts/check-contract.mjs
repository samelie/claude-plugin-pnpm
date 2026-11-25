#!/usr/bin/env node
// contract check for an effort whose map.md header carries a `Shape:` line (SKILL.md step 7 runs it with
// --seal, any earlier phase may run it without): the mechanical rows of the plan contract, so no llm gate
// has to count them. build: the slice budget (plan bytes, blocking acs, or a live user `D-n slice-budget`
// row), a basis on every premise, the sat.md verify dry-run, map.md next slices and the STATUS line of
// every verdict file. experiment: the card fields, and at the seal each card's results and STATUS line
// plus decision.md (references/experiment.md). read-only. prints one line per result: `OK:`,
// `FAIL: <what> — <how to fix>`, `WARN:`, `INFO:`, or the single `not gated:` line.
// node check-contract.mjs <abs session dir> [--seal]    exit 0 pass or not gated, 1 at least one FAIL, 2 usage

import { readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { basename, isAbsolute, join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { userAccepts } from './check-inline-fixes.mjs';

export const USAGE = 'usage: check-contract.mjs <abs session dir> [--seal]';
const EXIT = Object.freeze({ OK: 0, FAIL: 1, USAGE: 2 });
// the slice budget: a contract over either bound splits, or carries a live user grant
export const MAX_PLAN_BYTES = 60000;
export const MAX_BLOCKING_ACS = 12;
export const VERDICTS = [
  'design-critic/design-critique.md',
  'verification-approach.md',
  'definition-of-done.md',
  'goal-auditor/sat.md',
  'goal-auditor/goal-audit.md',
  'plan-review.md',
  'designer/frame-check.md',
];
export const CARD_FIELDS = ['Question:', 'Decides:', 'Measures:', 'Stop rule:', 'Side:'];
const SAT = 'goal-auditor/sat.md';
// the row as SKILL.md → loop budgets writes it: a failure that only said "grant row" was met with rows no rule reads
const SPLIT = 'split into slices (map.md Next slices) or record a live user grant row "| D-n slice-budget | <what was granted>; Source: user, <date> | map.md |" in map.md Decisions so far';
const SAT_GUIDE = '.claude/skills/team-kit-create/references/acceptance.md → Step 1b';
const CARD_GUIDE = '.claude/skills/team-kit-create/references/experiment.md';
// failures and warnings name at most this many rows, then an ellipsis
const NAME_LIMIT = 3;

const usage = (why) => ({ code: EXIT.USAGE, lines: [`USAGE: ${why}`, USAGE] });
const linesOf = (text) => text.split(/\r?\n/);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const named = (items) => [...items.slice(0, NAME_LIMIT), ...(items.length > NAME_LIMIT ? ['…'] : [])].join(', ');
const bare = (cell) => cell.replace(/[*`]/g, '').trim();
const statOf = (path) => {
  try {
    return statSync(path);
  } catch {
    return null;
  }
};
const readText = (path) => {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
};
const isFile = (path) => Boolean(statOf(path)?.isFile());
// a file under the session dir: a path that climbs out of it does not count
const fileInSession = (session, rel) => {
  const path = resolve(session, rel);
  return path.startsWith(`${session}${sep}`) && isFile(path);
};

// index of the backtick run of exactly `size` that closes a code span, or -1
const closingFence = (line, from, size) => {
  const runs = /`+/g;
  runs.lastIndex = from;
  for (let m = runs.exec(line); m; m = runs.exec(line)) if (m[0].length === size) return m.index;
  return -1;
};

// cells of one table line, trimmed. a `\|` and a pipe inside a backtick code span are cell text, not
// separators. a backslash escapes nothing else: authors nest backticks as \` inside a span, and reading that
// as an escape would pair every later backtick of the row wrongly
export const splitCells = (line) => {
  const cells = [''];
  for (let i = 0; i < line.length; i += 1) {
    if (line[i] === '|') {
      cells.push('');
      continue;
    }
    let text = line[i];
    if (text === '\\' && line[i + 1] === '|') text = '\\|';
    else if (text === '`') {
      const size = /^`+/.exec(line.slice(i))[0].length;
      const close = closingFence(line, i + size, size);
      // an unclosed run is literal text: the pipes after it still separate
      text = line.slice(i, close < 0 ? i + size : close + size);
    }
    cells[cells.length - 1] += text;
    i += text.length - 1;
  }
  // what precedes a leading pipe and follows a trailing pipe is not a cell
  if (!cells[0].trim()) cells.shift();
  if (cells.length && !cells.at(-1).trim()) cells.pop();
  return cells.map((cell) => cell.trim());
};

const isSeparatorRow = (line) => {
  const cells = line.startsWith('|') ? splitCells(line) : [];
  return cells.length > 0 && cells.every((cell) => /^:?-+:?$/.test(cell));
};

// a line starting with `<!--` is a comment, and so is the block it opens up to the line holding `-->`.
// an opener that never closes is a comment alone: a cut-off one must not hide the rows under it
const withoutComments = (lines) => {
  const kept = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (!lines[i].startsWith('<!--')) kept.push(lines[i]);
    else if (!lines[i].includes('-->')) {
      const close = lines.findIndex((line, at) => at > i && line.includes('-->'));
      if (close > i) i = close;
    }
  }
  return kept;
};

const SHAPE = /^Shape: (build|experiment|campaign|pending)\b/;
// a header line that sets out to be the marker and is not one: a typo, a dressed label, an unknown shape
const SHAPE_LIKE = /^[\s>*_`-]*shape\b[*_`]*\s*:/i;
// the map header: the lines before the first `## ` line
const headerOf = (map) => {
  const lines = linesOf(map);
  const end = lines.findIndex((line) => line.startsWith('## '));
  return end < 0 ? lines : lines.slice(0, end);
};

// the Shape marker of the map header, or null. for readers that only show the shape (scoreboard.mjs): a
// line the gate cannot read is no shape to them
export const parseShape = (map) => headerOf(map).map((line) => SHAPE.exec(line)).find(Boolean)?.[1] ?? null;

// what the gate makes of the header: the shape, 'unreadable' when a shape-like line stands before any
// marker, or null. only a map with no shape-like line at all predates the slice contract: a typo that read
// as "not gated" let an over-budget contract seal
export const readShape = (map) => {
  for (const line of headerOf(map)) {
    const m = SHAPE.exec(line);
    if (m) return m[1];
    if (SHAPE_LIKE.test(line)) return 'unreadable';
  }
  return null;
};

// content lines of the `## <name>` section, up to the next `## ` line, comments dropped; null without the
// heading. a heading that repeats adds its lines, so no row hides in a second copy
export const sectionLines = (text, name) => {
  const lines = [];
  let found = false;
  let inside = false;
  for (const line of linesOf(text)) {
    if (line.startsWith('## ')) {
      inside = line.trimEnd() === `## ${name}`;
      found ||= inside;
    } else if (inside) lines.push(line);
  }
  return found ? withoutComments(lines) : null;
};

// the table row at or after `from`, or -1 when the table has ended. blank lines inside a table do not end
// it, unless what follows them opens another table with a header and its separator
const nextRow = (lines, from) => {
  let at = from;
  while (lines[at] === '') at += 1;
  if (!lines[at]?.startsWith('|')) return -1;
  return at > from && isSeparatorRow(lines[at + 1] ?? '') ? -1 : at;
};

// the ac rows of every table whose header row names id, kind and blocking, in file order; null when no
// table has that header. columns map by header name, so extra and reordered columns are fine, and an
// indented table is still the table. a row is an ac when its id cell holds anything once `*`, backticks
// and whitespace are stripped: auditors also write `**AC-1**`, `AC-P0`, `AC-a` and `DoD-1`, and split one
// contract over several tables. `deterministic` is every kind not plainly semantic or needs-human, so
// `det`, `D` and a mixed kind still owe the dry-run. `unread` marks a blocking cell that says neither yes
// nor no, and any row a stray pipe has shifted off its header
export const parseAcs = (dod) => {
  const lines = linesOf(dod).map((line) => line.trimStart());
  let acs = null;
  for (let i = 0; i + 1 < lines.length; i += 1) {
    if (!lines[i].startsWith('|') || !isSeparatorRow(lines[i + 1])) continue;
    const header = splitCells(lines[i]).map((cell) => cell.toLowerCase());
    const [idAt, kindAt, blockingAt] = ['id', 'kind', 'blocking'].map((name) => header.indexOf(name));
    if (idAt < 0 || kindAt < 0 || blockingAt < 0) continue;
    acs ??= [];
    for (let row = nextRow(lines, i + 2); row >= 0; row = nextRow(lines, row + 1)) {
      i = row;
      const cells = splitCells(lines[row]);
      const id = bare(cells[idAt] ?? '');
      if (!id || isSeparatorRow(lines[row])) continue;
      const [kind, blocking] = [kindAt, blockingAt].map((at) => bare(cells[at] ?? ''));
      acs.push({
        id,
        blocking: /^(true|yes)\b/i.test(blocking),
        deterministic: /deterministic/i.test(kind) || !/^(semantic|needs-human)\b/i.test(kind),
        unread: cells.length !== header.length || !/^(true|yes|false|no|n\/a|human-gate)\b|^$/i.test(blocking),
      });
    }
  }
  return acs;
};

// the blocking count the slice budget is checked against: the grade-seal-gate row every dod carries is not
// counted (DEFINITION-OF-DONE.md rule 9). one row is set aside, so a second one that borrows the name counts
export const countBudgetAcs = (acs) => {
  const blocking = acs.filter((ac) => ac.blocking);
  return blocking.length - (blocking.some((ac) => ac.id.includes('grade-seal-gate')) ? 1 : 0);
};

// a row that names the grant only to refuse, revoke or defer it
const UNGRANTED = /\b(declin\w*|refus\w*|reject\w*|revok\w*|denied|not granted|pending|awaiting)\b/i;
// a delegate or the original prompt is not the live user: `Source: user-delegated`, `Source: user prompt`
const NOT_THE_USER = /Source: user(-\w|\s+prompt\b)/i;

// the D-n of a live user grant for an over-budget contract, or null. user authority is judged as for an
// accepted inline finding (userAccepts, check-inline-fixes.mjs): the row cites `Source: user`, and a
// prompt.md waiver or afk never grants for the user
export const findGrant = (map) => {
  for (const line of sectionLines(map, 'Decisions so far') ?? []) {
    if (!line.startsWith('|')) continue;
    const m = /^(D-\d+) slice-budget\b/.exec(splitCells(line)[0] ?? '');
    if (m && userAccepts(line, m[1], 'slice-budget') && !UNGRANTED.test(line) && !NOT_THE_USER.test(line)) return m[1];
  }
  return null;
};

// every P-n row of the Premises table with its status: the cell under the Status header, so a trailing
// notes cell cannot stand in for it, else the last cell
export const premiseRows = (map) => {
  const rows = (sectionLines(map, 'Premises') ?? []).filter((line) => line.startsWith('|'));
  const at = splitCells(rows[0] ?? '').findIndex((cell) => /^(status|state)\b/i.test(bare(cell)));
  return rows.flatMap((line) => {
    const cells = splitCells(line);
    const id = /^P-\d+/.exec(bare(cells[0] ?? ''))?.[0];
    return id ? [{ id, status: cells[at >= 0 && at < cells.length ? at : cells.length - 1] }] : [];
  });
};

// null when the status names its basis or records how a strike ended, else 'struck' or 'basis'
export const premiseFailure = (status) => {
  // the latest strike decides: a basis or an earlier resolution does not answer it. `holds` ends a strike
  // only as the lifecycle writes it (`→ holds`, `holds (human held)`): "no longer holds" is the strike
  // itself, and a resolution still being asked for ("not yet", "pending", a question) is none
  const struck = status.lastIndexOf('STRUCK');
  if (struck >= 0) {
    const tail = status.slice(struck + 'STRUCK'.length);
    return !/\b(not yet|pending|awaiting|whether|tbd)\b|\?/i.test(tail) && /re-scoped|withdrawn|→\s*holds\b|holds \(human/.test(tail) ? null : 'struck';
  }
  // the unfilled template (`read: <file:line>`) is no basis, and a premise that ended without a strike says
  // so first or after an arrow: "may need to be re-scoped later" has not ended
  // `unmeasured:` owes the reason no autonomous run exists: a deferral ("minted before research", "pending",
  // "not yet") is the absence of a basis, unless a read or measured basis stands beside it
  const deferred = /\bunmeasured:\s*(minted before research|pending|tbd|todo|not yet|later)\b/i.test(status) && !/\b(read|measured):\s*[^\s<]/.test(status);
  if (deferred) return 'basis';
  return /\b(read|measured|unmeasured):\s*[^\s<]/.test(status) || /^(re-scoped|withdrawn)\b|→\s*(re-scoped|withdrawn)\b/.test(status) ? null : 'basis';
};

// the file a `measured:` basis cites: the first backticked token after it, else its first word, without
// trailing punctuation or a `:line` suffix. null when the status has no measured basis
export const measuredPath = (status) => {
  const rest = /\bmeasured:\s*(\S.*)$/.exec(status)?.[1];
  if (rest === undefined) return null;
  const token = /`([^`]+)`/.exec(rest)?.[1] ?? /^\S+/.exec(rest)[0];
  return token.replace(/[.,;:!?)\]}'"]+$/, '').replace(/:\d+(-\d+)?$/, '');
};

// 'ok', 'missing' (no heading), 'empty' (neither a result row nor the none-runnable line) or 'short' (fewer
// result rows than the `need` deterministic blocking acs: the dry-run is one row per ac)
export const dryRunState = (sat, need = 1) => {
  const lines = sectionLines(sat, 'Verify dry-run');
  if (!lines) return 'missing';
  if (lines.some((line) => line.startsWith('none runnable — '))) return 'ok';
  // the table without its header and separator
  const rows = lines.filter((line) => line.startsWith('|') && !isSeparatorRow(line)).length - 1;
  if (rows >= need) return 'ok';
  return rows > 0 ? 'short' : 'empty';
};

const nonEmpty = (text) => linesOf(text).filter((line) => line.trim());
const lastLine = (text) => nonEmpty(text).at(-1) ?? '';
// bold-wrapped, indented or mid-sentence does not count: the last non-empty line itself starts with the marker
export const closesWithStatus = (text) => lastLine(text).startsWith('STATUS: ');
// the one-line skip file check-inline-fixes.mjs exempts from the STATUS rule, by the predicate it uses
// (`skipped` in its checkVerdict): a sat.md of at most two non-empty lines that says proportionality skip
export const isSatSkip = (name, text) => name === SAT && nonEmpty(text).length <= 2 && /proportionality skip/i.test(text);

// a slice line says something: not a comment, not a lone dash, not a placeholder for the cut still to come
const isSliceLine = (line) => /[\p{L}\p{N}]/u.test(line) && !/^\s*<!--/.test(line) && !/\b(pending|tbd|todo|placeholder)\b/i.test(line);

// what a card holds beyond its template: `missing` fields have no text of their own after the label (a
// `<placeholder>` is none), `results` is real content under `## Results`, `closed` is a STATUS line that
// picked one status (the template line lists all three between pipes)
export const parseCard = (text) => {
  const lines = linesOf(text);
  const filled = (field) => lines.some((line) => line.startsWith(field) && /\S/.test(line.slice(field.length).replace(/<[^>]*>/g, '')));
  return {
    missing: CARD_FIELDS.filter((field) => !filled(field)),
    results: (sectionLines(text, 'Results') ?? []).some((line) => line.trim() && !/^<.*>$/.test(line.trim())),
    closed: closesWithStatus(text) && !lastLine(text).includes(' | '),
  };
};

// experiments/X-*.md files; a card's capture directory shares the prefix and is not a card
const cardNames = (dir) => {
  try {
    return readdirSync(dir).filter((name) => /^X-.*\.md$/.test(name) && isFile(join(dir, name))).sort();
  } catch {
    return [];
  }
};

const budgetLine = (measure, budget, within, grant) => {
  if (within) return `OK: ${measure} (budget ${budget})`;
  // a live user grant waives the budget and nothing else
  return grant ? `INFO: over the slice budget under ${grant} — ${measure} (budget ${budget})` : `FAIL: ${measure}, over the slice budget of ${budget} — ${SPLIT}`;
};

// a plan in an effort of another shape: the build rows that would have sized it never ran
const strayPlan = (session, shape) => (isFile(join(session, 'team-plan.md')) ? [`FAIL: team-plan.md sits in a Shape: ${shape} effort — a plan seals only under Shape: build`] : []);

const checkBuild = ({ session, map, seal }) => {
  const lines = [];
  const problem = seal ? 'FAIL' : 'WARN';
  const missing = (name) => `FAIL: ${name} is missing — the seal of a build contract needs team-plan.md, definition-of-done.md and ${SAT}`;
  const grant = findGrant(map);
  const verdicts = new Map(VERDICTS.map((name) => [name, readText(join(session, name))]));

  const plan = statOf(join(session, 'team-plan.md'));
  if (plan?.isFile()) lines.push(budgetLine(`team-plan.md is ${plan.size} bytes`, `${MAX_PLAN_BYTES} bytes`, plan.size <= MAX_PLAN_BYTES, grant));
  else if (seal) lines.push(missing('team-plan.md'));

  const dod = verdicts.get('definition-of-done.md');
  const acs = dod === null ? null : parseAcs(dod);
  if (dod === null) {
    if (seal) lines.push(missing('definition-of-done.md'));
  } else if (!acs) {
    lines.push(`${problem}: cannot count blocking ACs: no AC table header with id, kind and blocking columns — use the DEFINITION-OF-DONE.md header`);
  } else {
    const counted = countBudgetAcs(acs);
    const gate = counted < acs.filter((ac) => ac.blocking).length ? ', the grade-seal-gate row not counted' : '';
    lines.push(budgetLine(`definition-of-done.md has ${plural(counted, 'blocking AC')}${gate}`, MAX_BLOCKING_ACS, counted <= MAX_BLOCKING_ACS, grant));
    const unread = acs.filter((ac) => ac.unread).map((ac) => ac.id.slice(0, 30));
    if (unread.length) lines.push(`${problem}: cannot read the blocking cell of ${plural(unread.length, 'AC row')} (${named(unread)}) — write true or false; a row with more or fewer cells than its header has a stray pipe to escape as \\| or keep inside backticks`);
  }

  if (sectionLines(map, 'Premises') === null && linesOf(map).some((line) => /^#{2,3} .*premises\b/i.test(line))) {
    lines.push('FAIL: map.md has a premises heading the gate cannot read — name the section exactly "## Premises"');
  } else {
    const premises = premiseRows(map).map(({ id, status }) => {
      const cited = measuredPath(status);
      return { id, cited, why: premiseFailure(status) ?? (cited !== null && !fileInSession(session, cited) ? 'measured' : null) };
    });
    for (const { id, cited, why } of premises) {
      if (why === 'struck') lines.push(`FAIL: premise ${id} is struck and unresolved — take the strike to the user, then record "→ re-scoped (link)", "→ withdrawn (link)" or "→ holds (human held)" after STRUCK in its Status cell`);
      if (why === 'basis') lines.push(`FAIL: premise ${id} has no basis — its Status cell needs read: <file:line>, measured: <card> or unmeasured: <why no autonomous run exists>`);
      if (why === 'measured') lines.push(`FAIL: premise ${id}: measured basis names no existing file ("${cited.slice(0, 60)}") — cite the card or findings file by its path under the session dir, in backticks or as the first word after measured:`);
    }
    if (premises.every(({ why }) => !why)) lines.push(premises.length ? `OK: ${plural(premises.length, 'premise')} with a basis or a resolved strike` : 'OK: no premises minted');
  }

  const sat = verdicts.get(SAT);
  const owed = acs?.filter((ac) => ac.blocking && ac.deterministic).length ?? 0;
  // the one-line skip has neither a dry-run nor a STATUS line, and a shaped map owes both once a row is owed
  const skipOwing = sat !== null && owed > 0 && isSatSkip(SAT, sat) && !closesWithStatus(sat);
  if (sat === null) {
    if (seal) lines.push(missing(SAT));
  } else if (skipOwing) {
    lines.push(`FAIL: ${SAT} is the one-line proportionality skip, but the DoD holds ${plural(owed, 'deterministic blocking AC')} — a map with a Shape line owes "## Verify dry-run" and a closing STATUS line even under the skip: ${SAT_GUIDE}`);
  } else if (owed) {
    const state = dryRunState(sat, owed);
    const gap = {
      missing: 'has no "## Verify dry-run" section',
      empty: 'has a "## Verify dry-run" section with neither a result table nor a "none runnable — <reason>" line',
      short: `has a "## Verify dry-run" table with fewer result rows than the DoD's ${plural(owed, 'deterministic blocking AC')}`,
    }[state];
    lines.push(state === 'ok' ? `OK: ${SAT} carries the Verify dry-run` : `FAIL: ${SAT} ${gap} — one row per deterministic blocking AC, so re-dispatch the SAT pass: ${SAT_GUIDE}`);
  }

  if (seal) {
    const next = sectionLines(map, 'Next slices');
    if (!next) lines.push('FAIL: map.md has no "## Next slices" section — add it with the slices that follow, or "none — this contract covers the Destination"');
    else if (!next.some(isSliceLine)) lines.push('FAIL: map.md Next slices names no slice — list the slices that follow, or write "none — this contract covers the Destination"');
    else lines.push('OK: map.md Next slices is filled');
  }

  const closed = [];
  for (const [name, text] of verdicts) {
    if (text === null || (name === SAT && skipOwing)) continue;
    if (closesWithStatus(text)) {
      closed.push(name);
      continue;
    }
    if (isSatSkip(name, text)) {
      lines.push(`INFO: ${name} is the one-line proportionality skip — it carries no STATUS line of its own`);
      continue;
    }
    const last = lastLine(text);
    const found = last ? `its last non-empty line is "${last.slice(0, 60)}"` : 'the file is empty';
    lines.push(`FAIL: ${name} does not end with a STATUS line: ${found} — re-dispatch its producer; the last non-empty line must start with "STATUS: ", unbolded, nothing after it`);
  }
  if (closed.length) lines.push(`OK: a STATUS line closes ${closed.join(', ')}`);
  return lines;
};

// before the seal a card needs its fields, and its STATUS line once it has results. the seal closes the
// effort: every card ran and closed, decision.md says what they settled, and no plan sits beside them
const checkExperiment = ({ session, seal }) => {
  const dir = join(session, 'experiments');
  const cards = cardNames(dir);
  const fields = CARD_FIELDS.join(', ');
  const lines = [];
  if (!cards.length) lines.push(seal ? `FAIL: no experiment card — write experiments/X-{n}-{slug}.md with ${fields} lines (${CARD_GUIDE})` : 'INFO: no experiment card yet (experiments/X-*.md)');
  for (const name of cards) {
    const { missing, results, closed } = parseCard(readText(join(dir, name)) ?? '');
    const fails = [];
    if (missing.length) fails.push(`FAIL: experiments/${name} has no filled line starting with ${missing.join(', ')} — a card carries ${fields} lines, each with its own text (${CARD_GUIDE})`);
    if (seal && !results) fails.push(`FAIL: experiments/${name} has no content under "## Results" — a sealed experiment records what every card measured`);
    if ((seal || results) && !closed) fails.push(`FAIL: experiments/${name} does not end with a STATUS line of its own — close it with "STATUS: CLEAN", "STATUS: PARTIAL — <what was not measured>" or "STATUS: BLOCKED — <the missing precondition>"`);
    lines.push(...(fails.length ? fails : [`OK: experiments/${name} carries every card field${results ? ' and its Results end with a STATUS line' : ''}`]));
  }
  if (!seal) return lines;
  lines.push(isFile(join(session, 'decision.md')) ? 'OK: decision.md closes the experiment' : `FAIL: decision.md is missing — an experiment closes with decision.md in the session root: the decision and the cards behind it (${CARD_GUIDE})`);
  return [...lines, ...strayPlan(session, 'experiment')];
};

const CHECKS = {
  build: checkBuild,
  experiment: checkExperiment,
  campaign: ({ session, seal }) => {
    const stray = seal ? strayPlan(session, 'campaign') : [];
    return stray.length ? stray : ['OK: campaign — nothing to gate'];
  },
  // the shape decides which rows apply, so a pending one is checked no further
  pending: ({ seal }) => [seal ? 'FAIL: Shape is pending — set the map.md Shape line to build, experiment or campaign before the seal' : 'INFO: Shape pending — triage has not picked a shape yet'],
  unreadable: ({ map }) => {
    const line = headerOf(map).find((candidate) => SHAPE_LIKE.test(candidate)) ?? '';
    return [`FAIL: map.md Shape line is unreadable ("${line.trim().slice(0, 60)}") — write "Shape: build", "Shape: experiment" or "Shape: campaign" at the start of a header line`];
  },
};

export const checkContract = (sessionDir, opts = {}) => {
  if (typeof sessionDir !== 'string' || !isAbsolute(sessionDir)) return usage('session dir must be an absolute path');
  if (!statOf(sessionDir)?.isDirectory()) return usage(`session dir not found: ${sessionDir}`);
  const session = resolve(sessionDir);
  const map = readText(join(session, 'map.md'));
  const shape = map === null ? null : readShape(map);
  if (!shape) return { code: EXIT.OK, lines: [`not gated: ${basename(session)} — map.md carries no Shape line (the effort predates the slice contract)`] };
  const lines = CHECKS[shape]({ session, map, seal: Boolean(opts.seal) });
  return { code: lines.some((line) => line.startsWith('FAIL: ')) ? EXIT.FAIL : EXIT.OK, lines };
};

export const parseArgs = (argv) => {
  const opts = {};
  const positional = [];
  for (const arg of argv) {
    if (arg === '--seal') opts.seal = true;
    else if (arg.startsWith('-')) return { error: `unknown flag: ${arg}` };
    else positional.push(arg);
  }
  if (positional.length !== 1) return { error: positional.length ? `extra argument: ${positional.slice(1).join(' ')}` : 'session dir missing' };
  return { sessionDir: positional[0], opts };
};

// realpath: node resolves the entry's symlinks in import.meta.url, and a mismatch would skip the gate with exit 0
const isMain = () => {
  try {
    return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
};

if (isMain()) {
  const parsed = parseArgs(process.argv.slice(2));
  const result = parsed.error ? usage(parsed.error) : checkContract(parsed.sessionDir, parsed.opts);
  const out = result.code === EXIT.USAGE ? console.error : console.log;
  for (const line of result.lines) out(line);
  process.exitCode = result.code;
}
