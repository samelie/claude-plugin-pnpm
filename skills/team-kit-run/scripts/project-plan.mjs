#!/usr/bin/env node
// run-graph projector for a sealed build effort (team-kit-run AUTHOR step): reads team-plan.md as planners
// write it (FRAMEWORK.md → Task Definition Format, plus the shapes real plans use: several ids on one
// heading with `<id>: …` cells, prose substeps `**T-9-spec** — Phase …; Agent …`, a field paragraph
// under a heading with no table, a table with one row per task, dotted substep ids `T-3.quality`, a template
// row `T-n.spec, n ∈ {2, 3}`), run-watch.md and definition-of-done.md, and prints the graph (schema 2) as json. the
// rows of a table of id patterns (`Id pattern`) and a heading that starts with a placeholder id and has no fields are
// template references, outside the graph. a
// substep (the id of a task plus one `.word` or `-word`) takes its phase, requirement, type and estimate from that
// task where it states none; HITL only when the lead or the human owns it.
// anything read with less than certainty becomes a `partial: <ids> — why` warning, which keeps
// check-run-graph.mjs from passing the graph: a field table, a row of a task table (one cut off its table
// included) or a task-family id of a heading that ends up in no task, a line that starts with such an id and states
// fields or stands in no block, and text keyed to a row task outside its row, which is in no block, is named in one,
// never dropped. read-only unless --out is given.
// node project-plan.mjs <abs session dir> [--out <file>]    exit 0 projected (or warnings), 2 usage (a wrong --out too)

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// realpath: node resolves the entry's symlinks in import.meta.url, and a mismatch would skip the run with exit 0
const isMain = () => {
  try {
    return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
};
// a sibling module that is missing or does not load is an error of these scripts, never a defect of the plan: the
// entry point reports it as partial, exit 0, no stack. imported by another module, the error is that module's
const contract = await import('./check-contract.mjs').catch((error) => (isMain() ? { error } : Promise.reject(error)));
const { parseAcs, splitCells } = contract;

export const USAGE = 'usage: project-plan.mjs <abs session dir> [--out <file>]';
// 2: a row of a task table is one task with its own line and block; schema 1 gave every row its heading's
export const SCHEMA = 2;
// a warning that starts with this marks the projection partial: the orchestrator authors from the plan
export const PARTIAL = 'partial: ';
const EXIT = Object.freeze({ OK: 0, USAGE: 2 });
export const KINDS = ['code', 'review', 'verify', 'grade', 'measure', 'finish', 'lead', 'other'];
// agentType → kind; anything not listed is other, an undispatched lead or human step is lead
const KIND_OF = {
  'team-coder': 'code',
  'team-tester': 'code',
  'team-spec-reviewer': 'review',
  'team-reviewer': 'review',
  'team-security-auditor': 'review',
  'team-verifier': 'verify',
  'team-codex-verifier': 'verify',
  'team-goal-auditor': 'grade',
  'team-measurer': 'measure',
  'team-finisher': 'finish',
  none: 'lead',
  orchestrator: 'lead',
  lead: 'lead',
  'in-session': 'lead',
  human: 'lead',
};
// a word of an agent_type cell that marks a step the lead or the human runs: no dispatch
const LEAD_WORD = /(?<![\w-])(none|lead|orchestrator|in-session|human)(?![\w-])/i;
// words a lead cell writes beside its marker that name nobody: `lead session`, `the run lead`
const LEAD_FILLER = ['session', 'run', 'main', 'the', 'own', 'seam', 'step'];
// words of an agent_type cell that say the owner is not decided
const UNDECIDED = /(?<!\w)(?:tbd|todo|tba|yet)(?!\w)|\?/i;
// agent types every session has beside the definitions under .claude/agents
const BUILT_IN = ['general-purpose', 'Explore', 'Plan', 'claude', 'default'];
const FIELDS = ['agent_type', 'evidence_producer', 'files_owned', 'blockedby', 'requirement', 'workkind', 'estimated', 'phase', 'agent', 'verify', 'type'];
// the fields FRAMEWORK.md → Task Definition Format says every task must include, as a plan labels them. workKind
// is a codex-plan field; blockedBy is doubted where the dependencies are read
const MANDATORY = { phase: 'Phase', agent: 'Agent', agent_type: 'agent_type', evidence_producer: 'evidence_producer', requirement: 'Requirement', files_owned: 'files_owned', verify: 'verify', type: 'type', estimated: 'Estimated' };
// a column label real plans shorten
const ALIASES = { est: 'estimated', 'est.': 'estimated', estimate: 'estimated' };
// R-4: the labels a table of rows gives its columns beside the field names: `Owner` is who runs the row, `Evidence`
// its evidence_producer, `Evidence + verify` that and its verify in one cell
const COLUMNS = { owner: ['agent'], evidence: ['evidence_producer'], 'evidence_+_verify': ['evidence_producer', 'verify'] };
// the labels of the column that names each row's task, alone or first in a shared label (`ID / workKind`)
const ID_LABELS = ['id', 'task', 'substep', 'step'];
// the fields only a task has: a table of fields with none of these columns is a roster or a list of steps
const TASK_ONLY = ['blockedby', 'requirement', 'files_owned'];
// the fields a list of numbered steps does not write: under a column labelled as an id column any of them makes
// each row a task, named when its cell holds no id
const STEP_FREE = [...TASK_ONLY, 'agent_type', 'evidence_producer', 'phase', 'estimated'];
// one character of an id: a letter or digit, a `<m>` placeholder of a templated id, or a dot before a digit (T-1.1)
const ATOM = String.raw`(?:[A-Za-z0-9]|<[a-z][^<>\s]{0,4}>|\.(?=\d))`;
// an id: T-01, T-3g, T-7-spec, T-0r, T-S7, T-1.1, RV-1, DP-2r, H-2b, T-43-R<m>, and the template's T1
const ID_SRC = String.raw`(?<![A-Za-z0-9.-])[A-Z][A-Za-z]{0,4}-?[0-9A-Z]${ATOM}*(?:-${ATOM}+)*`;
const AFTER_ID = String.raw`(?=$|[\s:*·(—,;.])`;
const ID_AT_START = new RegExp(`^${ID_SRC}${AFTER_ID}`);
// the suffix of a dotted substep id (T-3.quality, T-1.spec). it is read as part of the id at an id position (a
// heading, an id cell) and where the plan declares that id; anywhere else `T-3.md` is a file name
const DOT_TAIL = /^\.[A-Za-z][A-Za-z0-9]*(?!\.?[A-Za-z0-9])/;
// AC-1..AC-6, AC-1 … AC-16, AC-1–4
const RANGE = /(?<![A-Za-z0-9-])([A-Z][A-Za-z]{0,4}-)(\d+)\s*(?:\.\.|…|–)\s*(?:\1)?(\d+)(?![A-Za-z0-9.])/g;
const CONDITION = /\b(when|if|unless|cond\w*)\b/i;
// `T-n.spec, n ∈ {2, 3}` and `T-n.quality, same n`: the template rows plans dated 20261119 and later write
const TEMPLATE = /^([A-Z][A-Za-z]{0,4}-)([a-z])((?:[.-][A-Za-z0-9]+)*),\s*(?:\2\s*∈\s*\{([^{}]*)\}|same\s+\2)$/;
// a cell of a table row that points at another row for its value
const ANOTHER_ROW = /^(?:as above|as before|same as\b|same form\b|ditto\b)/i;
// a count or a continuation right after an id (`T-2 ×3`, `T-2, etc.`, `T-2 onwards`, `T-1.spec per task`): the row
// stands for more tasks than the one it names
const MULTIPLE = /^[\s,(]*(?:×|\d+\s*×|etc(?![\w-])|onwards?(?![\w-])|ff(?![\w-])|and\s+(?:following|so\s+on|up|later|onwards?)(?![\w-])|per\s+\w|for\s+each(?![\w-])|each(?![\w-])|every(?![\w-])|…|\.\.\.)/i;
const FIELD_LABELS = 'agent_type|evidence_producer|files_owned|blockedBy|blocked by|Requirement|workKind|Estimated|Phase|Agent|verify|type';

const linesOf = (text) => text.split(/\r?\n/);
// the characters of a line that are read, and the prose substeps of one heading that are: no plan comes near either
// (the longest line of the plans dated 202611 holds 4,567 characters), and a cell of a million ids or brackets, or
// thousands of substeps that each carry the heading's block, would take minutes to read
const LINE_LIMIT = 20000;
const SUBSTEP_LIMIT = 100;
// the lines as they are parsed: no byte-order mark, no carriage return, a line past LINE_LIMIT cut there
const plainOf = (lines) => lines.map((line, i) => (i ? line : line.replace(/^﻿/, '')).replace(/\r$/, '').slice(0, LINE_LIMIT));
const bare = (cell) => cell.replace(/[*`]/g, '').trim();
const unique = (items) => [...new Set(items)];
const isId = (token) => /\d|-/.test(token);
const escape = (text) => text.replace(/[.*+?^$\{}()|[\]\\]/g, '\\$&');
// the family of an id: T- for T-3g, T for the template's T1, so a T0 in prose is no dependency of a T-n plan.
// total: an id with no dash and no digit after its letters (QA.1, TA<m>-1) is its own family up to there
export const prefixOf = (id) => /^[A-Z][A-Za-z]*?(?:-|(?=[^A-Za-z]))/.exec(id)?.[0] ?? id;
const readText = (path) => {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
};
// the outermost parenthesised asides of a text as [from, to], the nested ones inside them left out; a bracket with
// no partner opens none. one pass, so a cell of nested brackets costs its length
const asidesOf = (text) => {
  const open = [];
  const asides = [];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '(') open.push(i);
    else if (text[i] === ')' && open.length) {
      const from = open.pop();
      while (asides.length && asides.at(-1)[0] > from) asides.pop();
      asides.push([from, i]);
    }
  }
  return asides;
};
// the text with its parenthesised asides blanked, nested ones included: each outermost pair becomes one space, a
// bracket with no partner stays. `stays` keeps the asides it accepts as they are written
const blankAsides = (text, stays = () => false) => {
  let [out, at] = ['', 0];
  for (const [from, to] of asidesOf(text)) if (!stays(from, to)) [out, at] = [`${out}${text.slice(at, from)} `, to + 1];
  return out + text.slice(at);
};
export const withoutAsides = (text) => blankAsides(text);

// every id token of a text in order with its place, a range expanded in place. `dotted` says which dotted substep
// ids the plan declares: only those are read whole
const idSpans = (text, dotted = null) => {
  const expanded = text.replace(RANGE, (whole, prefix, from, to) => {
    const [a, b] = [Number(from), Number(to)];
    if (b < a || b - a > 200) return whole;
    return Array.from({ length: b - a + 1 }, (_, i) => `${prefix}${a + i}`).join(', ');
  });
  const spans = [];
  for (const m of expanded.matchAll(new RegExp(ID_SRC, 'g'))) {
    if (!isId(m[0])) continue;
    const tail = dotted ? (DOT_TAIL.exec(expanded.slice(m.index + m[0].length))?.[0] ?? '') : '';
    const id = tail && dotted(m[0] + tail) ? m[0] + tail : m[0];
    spans.push({ id, at: m.index, end: m.index + id.length });
  }
  return { expanded, spans };
};
export const idsIn = (text, dotted = null) => idSpans(text, dotted).spans.map((span) => span.id);
// the id a text starts with, a dotted substep suffix included: `T-14.spec (covers T-10..T-14)` → T-14.spec
export const idAtStart = (text) => {
  const id = ID_AT_START.exec(text)?.[0];
  if (!id || !isId(id)) return null;
  const tail = DOT_TAIL.exec(text.slice(id.length))?.[0] ?? '';
  return tail && new RegExp(`^${AFTER_ID}`).test(text.slice(id.length + tail.length)) ? id + tail : id;
};
// the AC ids a requirement text maps: outside its asides, `AC-n` or an id the definition of done lists
export const acsIn = (text, known = new Set()) => unique(idsIn(withoutAsides(text)).filter((id) => /^AC-/.test(id) || known.has(id)));
// the AC id a definition-of-done id cell names: `AC-13 paused-run-closed-first` → AC-13
export const acKey = (cell) => idsIn(cell)[0] ?? cell;

// the parts of a field text split on any separator outside backtick spans
export const splitParts = (text, separator = /^(?:;\s|\s·\s|,\s+then\s)/) => {
  const parts = [''];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '`') {
      const size = /^`+/.exec(text.slice(i))[0].length;
      const close = text.indexOf('`'.repeat(size), i + size);
      const end = close < 0 ? i + size : close + size;
      parts[parts.length - 1] += text.slice(i, end);
      i = end - 1;
      continue;
    }
    const m = separator.exec(text.slice(i));
    if (m) {
      parts.push('');
      i += m[0].length - 1;
    } else parts[parts.length - 1] += text[i];
  }
  return parts.map((part) => part.trim()).filter(Boolean);
};

// the ids a heading names: `T-1 slug`, `T-1: Title`, several joined by ` · ` or ` / `, a `(+ T-26p, …)` list or a
// `(… T-27 → T-27v)` chain of the main id's stages. `inferred` marks an id read from an aside, `unclaimed` lists
// the main id's sub-ids an aside names in a form not read (`(substeps T-36-initial, T-36-regrade)`)
export const headingIds = (line) => {
  const m = /^(#{2,5})\s+(.*)$/.exec(line);
  if (!m) return null;
  const text = m[2].replace(/^\*\*|\*\*$/g, '');
  const paren = text.search(/\s*\(/);
  const heads = (paren < 0 ? text : text.slice(0, paren)).split(/\s+[·/]\s+/);
  const named = [];
  for (const part of heads) {
    const clean = part.replace(/^\*\*/, '');
    const id = idAtStart(clean);
    if (!id) break;
    const title = clean.slice(id.length).replace(/^\*\*/, '').replace(/^[\s:—-]+/, '').trim();
    const first = title.split(/\s+/)[0] ?? '';
    named.push({ id, title, slug: /^[A-Za-z0-9][\w.-]*$/.test(first) ? first : null });
  }
  if (!named.length) return null;
  const main = named[0];
  const family = (id) => prefixOf(id) === prefixOf(main.id);
  const plus = /[(;]\s*\+\s*([^);]*)/.exec(text);
  for (const item of plus ? plus[1].split(/,\s*/) : []) {
    const id = idAtStart(item.trim());
    if (id && family(id) && !named.some((n) => n.id === id)) named.push({ id, title: main.title, slug: main.slug, inferred: true });
  }
  const chain = /\(([^)]*→[^)]*)\)/.exec(text)?.[1].split(/\s*→\s*/).map((link) => link.trim().split(/\s+/).at(-1)) ?? [];
  chain.forEach((link, k) => {
    if (link === main.id || !link.startsWith(main.id) || named.some((n) => n.id === link)) return;
    const before = chain[k - 1];
    named.push({ id: link, title: main.title, slug: main.slug, inferred: true, after: before && before.startsWith(main.id) ? before : main.id });
  });
  const unclaimed = paren < 0 ? [] : unique(idsIn(text.slice(paren)).filter((id) => id !== main.id && id.startsWith(main.id) && !named.some((n) => n.id === id)));
  return { level: m[1].length, named, unclaimed };
};

const labelOf = (text) => bare(text).toLowerCase().replace(/[\s-]+/g, '_');
// the fields a label part names, a shortened label included; `column` reads the labels of a table of rows too
const partKeys = (part, column = false) => {
  if (column && Object.hasOwn(COLUMNS, part)) return COLUMNS[part];
  const key = Object.hasOwn(ALIASES, part) ? ALIASES[part] : FIELDS.find((name) => part === name);
  return key ? [key] : [];
};
// the field keys of a label; `type / Estimated` names two
const keysOf = (label, column = false) => labelOf(label).split(/_?\/_?/).flatMap((part) => partKeys(part, column));

// the marks a field record carries beside its values: the keys read by a guess, the keys stated more than once, the
// keys read from a column labelled Owner
const marksOf = (fields) => {
  for (const mark of ['guessed', 'twice', 'owner']) if (!Object.hasOwn(fields, mark)) Object.defineProperty(fields, mark, { value: new Set(), enumerable: false });
  return fields;
};
// put a cell under the field keys its label names. a `type / Estimated` label over `AFK / 30 min` splits by
// position; a cell that does not split into as many parts goes whole to each key, recorded as a guess. one part
// that names two fields (`Evidence + verify`) gives its cell to both
const assign = (fields, label, value, column = false) => {
  const parts = labelOf(label).split(/_?\/_?/);
  const values = value.split(/\s+\/\s+/);
  const split = parts.length > 1 && values.length === parts.length;
  marksOf(fields);
  parts.forEach((part, k) => {
    for (const key of partKeys(part, column)) {
      const text = split ? values[k] : value;
      // a field stated a second time is not read: the first value stays, a second one that differs is a doubt
      if (Object.hasOwn(fields, key)) {
        if (bare(text) && bare(text) !== bare(fields[key])) fields.twice.add(key);
        continue;
      }
      fields[key] = text;
      if (column && part === 'owner') fields.owner.add(key);
      if (parts.length > 1 && !split) fields.guessed.add(key);
    }
  });
};

// the lines of the fenced code blocks, fence lines included, and whether a fence is still open at the end. a fence
// closes only on its own character, at least as long, with no info string; the info string of a backtick fence
// holds no backtick, so a line that starts with an inline ```span``` opens nothing. a marker inside an html comment
// (`comments` reads them) opens nothing, and one indented four columns or more opens a fence only inside a list
// item: under plain text it is the content of an indented code block. `nested` holds [fence line, line] for a
// line inside a fence that would open one of its own (```bash inside ```): its closing line ends the outer
// fence early, so where that fence ends is not certain
export const fenceScan = (lines, comments = null) => {
  const inside = new Set();
  const nested = [];
  const width = (indent) => indent.replace(/\t/g, '    ').length;
  let open = null;
  // the smallest indent of the list items above, back to the last unindented line that is no list item
  let list = Infinity;
  lines.forEach((line, i) => {
    const m = /^(\s*)(`{3,}|~{3,})(.*)$/.exec(line);
    const opens = m && !(m[2][0] === '`' && m[3].includes('`'));
    if (open) {
      inside.add(i);
      if (!m || m[2][0] !== open.mark || m[2].length < open.size) return;
      if (!m[3].trim()) open = null;
      else if (opens && !nested.some(([at]) => at === open.at)) nested.push([open.at, i]);
      return;
    }
    if (comments?.open()) return void comments.read(line, i);
    if (opens && (width(m[1]) < 4 || list < width(m[1]))) {
      inside.add(i);
      open = { mark: m[2][0], size: m[2].length, at: i };
      return;
    }
    comments?.read(line, i);
    const item = /^(\s*)(?:[-*+]|\d+[.)])\s/.exec(line);
    if (item) list = Math.min(list, width(item[1]));
    else if (line.trim() && !/^\s/.test(line)) list = Infinity;
  });
  return { inside, open: Boolean(open), openedAt: open ? open.at : -1, nested };
};
// indices of the lines inside a fenced code block: a `# comment` there is no heading
export const fencedLines = (lines) => fenceScan(lines).inside;

// html comments, read line by line outside the code fences: `inside` holds the lines a comment covers whole (a task
// commented out is no task). a `<!--` inside a code span is text. `openedAt` is the line of a comment that never
// closes, or -1
const commentReader = () => {
  const inside = new Set();
  let open = false;
  let openedAt = -1;
  const read = (line, i) => {
    const marked = open || line.includes('<!--');
    let rest = open ? line : line.replace(/(`+)[^`]*?\1/g, (span) => '.'.repeat(span.length));
    let visible = '';
    while (rest) {
      const at = rest.indexOf(open ? '-->' : '<!--');
      if (at < 0) {
        if (!open) visible += rest;
        break;
      }
      if (!open) visible += rest.slice(0, at);
      rest = rest.slice(at + (open ? 3 : 4));
      open = !open;
      if (open) openedAt = i;
    }
    if (marked && !visible.trim()) inside.add(i);
  };
  return { inside, read, open: () => open, openedAt: () => (open ? openedAt : -1) };
};

// the yaml frontmatter: its lines, the index of its closing line, and whether it opens and never closes. a `---`
// found past a heading or a table is a rule of the body, not the end of the frontmatter
const frontmatterOf = (lines) => {
  if (lines[0]?.trim() !== '---') return { lines: [], end: -1, unclosed: false };
  const end = lines.findIndex((line, i) => i > 0 && line.trim() === '---');
  const body = end < 0 ? [] : lines.slice(1, end);
  if (end < 0 || body.some((line) => /^#{2,6}\s|^\|/.test(line))) return { lines: [], end: -1, unclosed: true };
  return { lines: body, end, unclosed: false };
};

// the lines no structure is read from: inside a code fence, an html comment or the frontmatter. fences and comments
// are read in one pass, so a marker of one inside the other opens nothing. `unclosed` holds the line of a fence
// and of a comment that never closes: every line after it is skipped. `nested`: see fenceScan
const scanOf = (plain) => {
  const front = frontmatterOf(plain);
  const comment = commentReader();
  const fence = fenceScan(plain, comment);
  const skip = new Set([...fence.inside, ...comment.inside]);
  for (let i = 0; i <= front.end; i += 1) skip.add(i);
  return { front, comments: comment.inside, skip, nested: fence.nested, unclosed: [['code fence', fence.openedAt], ['html comment', comment.openedAt()]].filter(([, at]) => at >= 0) };
};

// a line without its quote and list-item prefix: `> | Field |`, `- | Field |`, an indented `| Field |`
const unwrap = (line) => line.replace(/^\s*(?:>\s?)*(?:(?:[-*+]|\d+[.)])\s+)?/, '');
// the heading a line holds, however it is written: any level, indented, inside a quote or a list item, or
// underlined; null when the line is no heading
const headingAt = (plain, skip, i) => {
  const atx = /^(#{1,6})\s+(.*)$/.exec(plain[i].replace(/^ {0,3}(?:>\s?)*(?:(?:[-*+]|\d+[.)])\s+)?/, ''));
  if (atx) return { level: atx[1].length, text: atx[2] };
  const alone = i === 0 || skip.has(i - 1) || !plain[i - 1].trim();
  const under = i + 1 < plain.length && !skip.has(i + 1) ? /^(=+|-{2,})\s*$/.exec(plain[i + 1]) : null;
  return alone && under && /^[^\s|#>*+-]/.test(plain[i]) ? { level: under[1][0] === '=' ? 1 : 2, text: plain[i] } : null;
};

const isRule = (line) => /^\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/.test(line);
// the tables of the plan: a header row, a delimiter row and the rows under them, each with its line index. `view`
// is how a line is looked at (as written, or without its quote and list prefix)
const tablesOf = (lines, skip, view = (line) => line) => {
  const tables = [];
  for (let i = 0; i + 1 < lines.length; i += 1) {
    if (skip.has(i) || skip.has(i + 1) || !view(lines[i]).startsWith('|') || !isRule(view(lines[i + 1]))) continue;
    const table = { at: i, header: splitCells(view(lines[i])), rows: [] };
    let row = i + 2;
    for (; row < lines.length && !skip.has(row) && view(lines[row]).startsWith('|'); row += 1) table.rows.push({ at: row, cells: splitCells(view(lines[row])) });
    table.idAt = idColumn(table);
    tables.push(table);
    i = row - 1;
  }
  return tables;
};
const fieldKeys = (header) => header.flatMap((label) => keysOf(label, true));
// a table whose header row names the fields (`| Phase | Agent | agent_type | … |`): each row holds one task
const isTaskTable = (table) => fieldKeys(table.header).length >= 3;
// an id cell that writes a template the id grammar does not read: `T-n.spec, n ∈ {2, 3}`, `T-R{n}-fix`
const templateLike = (cell) => /^[A-Z][A-Za-z]{0,4}-[a-z](?![A-Za-z0-9])/.test(cell) || (!idAtStart(cell) && /^[A-Z][A-Za-z]{0,4}-?[\w.-]*[{<]/.test(cell));
// the column that names each row's task, or -1: the task is then named by the heading. a column labelled as one
// (`ID`, `Substep`); one labelled `Task ID`, `Task name` or `Id pattern` where a row starts with an id; or, in a
// table of fields, the first column under a label that names no field (`#`) where a row starts with an id. a
// labelled column that holds no id at all in a table with none of the STEP_FREE columns (`| Step | Agent | verify |
// type |` over the rows `1`, `2`) names no task: a list of steps, not tasks. with one of them (`| Task | Phase |
// agent_type | … |`) the rows are tasks whose id cell names no id: each is named
const idColumn = (table) => {
  const cells = (k) => table.rows.map((row) => bare(row.cells[k] ?? ''));
  const leads = (k) => cells(k).some((cell) => Boolean(idAtStart(cell)) || templateLike(cell));
  const name = (label) => labelOf(label).split(/_?\/_?/)[0];
  const tasklike = fieldKeys(table.header).some((key) => TASK_ONLY.includes(key));
  const exact = table.header.findIndex((label, k) => ID_LABELS.includes(name(label)) && (tasklike || leads(k) || cells(k).some((cell) => idsIn(cell).length)));
  if (exact >= 0) return exact;
  const worded = table.header.findIndex((label, k) => /^(?:(?:task|step|substep)_(?:id|name|no|number)|id_(?:pattern|template))$/.test(name(label)) && leads(k));
  if (worded >= 0) return worded;
  const labelled = fieldKeys(table.header).some((key) => STEP_FREE.includes(key)) ? table.header.findIndex((label) => ID_LABELS.includes(name(label))) : -1;
  if (labelled >= 0) return labelled;
  return isTaskTable(table) && !keysOf(table.header[0] ?? '', true).length && leads(0) ? 0 : -1;
};
// R-5a: a table whose id column is labelled a pattern (`Id pattern`) lists id patterns the plan declares, the ids a
// conditional template will take (`T-R{n}-fix`): its rows are no tasks and stand outside the graph
const isPatternTable = (table) => table.idAt >= 0 && /(?<![A-Za-z])patterns?(?![A-Za-z])/i.test(bare(table.header[table.idAt] ?? ''));
// the value columns of a field table: [] for `| Field | Value |`, the ids for one column per id of the heading
// (`| Field | T-15a | T-15b |`), null when the table is no field table of that heading
const fieldColumns = (table, group) => {
  const [first, ...rest] = table.header.map(bare);
  if (labelOf(first ?? '') !== 'field') return null;
  if (rest.length === 1 && labelOf(rest[0]) === 'value') return [];
  return rest.length > 1 && new Set(rest).size === rest.length && rest.every((id) => group.includes(id)) ? rest : null;
};
// a table that reads as some task's field table, whoever owns it: its rows name fields
const isFieldLike = (table) => {
  const [first, ...rest] = table.header.map(bare);
  // `| Field | Value | Notes |` is one too, though no heading owns a table with a column past its values
  const shaped = (rest.length >= 1 && labelOf(rest[0]) === 'value') || (rest.length > 1 && rest.every((cell) => idAtStart(cell) === cell));
  return labelOf(first ?? '') === 'field' && shaped && table.rows.some((row) => keysOf(row.cells[0] ?? '').length);
};
// the rows of a field table as field → raw cell. with one value column the cells past it are part of the value, so
// a pipe left unescaped in a command stays in it
const fieldsOf = (table, at = 1) => {
  const fields = marksOf({});
  let above = [];
  for (const { cells } of table.rows) {
    const value = table.header.length > 2 ? (cells[at] ?? '') : cells.slice(1).join(' | ');
    // a row with no label continues the field above it: that value is not read
    if (!bare(cells[0] ?? '')) {
      if (bare(value)) for (const key of above) fields.twice.add(key);
      continue;
    }
    assign(fields, cells[0], value);
    above = keysOf(cells[0]);
  }
  return fields;
};
// the phase a heading names: `## Phase 2 — build` → 2, `### P1 — session-only` → P1. a phase has a number:
// `## Phase overview` and `### Phase out the legacy API` name none
const headingPhase = (line) => {
  const m = /^#{1,6}\s+\**(?:Phase\s+([A-Za-z]?\d[\w.-]*)|(P\d+[a-z]?)(?=$|[\s:*—(·-]))/i.exec(line);
  return m ? (m[1] ?? m[2]).replace(/[.-]+$/, '') : null;
};

// fields written as prose: `Phase 6; blockedBy T-15; Agent orchestrator; …` or `Phase P4 · Agent lead · …`
export const inlineFields = (text) => {
  const fields = marksOf({});
  for (const part of splitParts(text, /^(?:;\s|\s·\s|\.\s+(?=[A-Z]))/)) {
    const m = new RegExp(`^(${FIELD_LABELS})\\b\\s*:?\\s*`, 'i').exec(part);
    // a bare `AFK` or `25 min` part is the type or the estimate with its label left out
    if (!m && /^(AFK|HITL)\b/.test(part) && !('type' in fields)) fields.type = part;
    if (!m && /^\d+\s*min\b/.test(part) && !('estimated' in fields)) fields.estimated = part;
    if (!m) continue;
    const key = keysOf(m[1])[0];
    const value = part.slice(m[0].length).trim();
    if (key && !(key in fields)) fields[key] = value;
    else if (key && value && bare(value) !== bare(fields[key])) fields.twice.add(key);
  }
  return fields;
};

// the fields a line states with no `label:` at its start, each with the values it gives: the name and its value
// right after it (`This task is also blockedBy T-3`, `files_owned also src/b.ts`, `type HITL`). a bare mention
// (`inside its files_owned`) states nothing
const statedIn = (line) => {
  // what follows the first mention of a field name, the marks that close it left out
  const after = (name) => {
    const m = new RegExp(`(?<![\\w-])${name}(?![\\w-])[\`*]*`, 'i').exec(line);
    return m ? line.slice(m.index + m[0].length) : '';
  };
  const value = (name, shape) => new RegExp(`^\\s*(?:[:=]\\s*|(?:also|is|are|adds?|includes?|plus|becomes)\\s+){0,2}[\`*]*(${shape})`, 'i').exec(after(name))?.[1];
  const stated = [];
  // the ids listed right after the name: `blockedBy T-3 and T-4`, and after a none that goes on (`blockedBy none,
  // except T-3`). `blockedBy the last grade` names none
  const deps = [];
  const listed = after('blocked ?by').replace(/^\s*(?:[:=]\s*|(?:also|is|are)\s+){0,2}[\`*]*/, '').replace(/^(?:none|n\/a)(?![\w-])[\s,;:—–-]*(?:(?:except|but|until|once|after)\s+)?/i, '');
  for (let rest = listed, id = idAtStart(rest); id; id = idAtStart(rest)) {
    deps.push(id);
    rest = rest.slice(id.length).replace(/^[\`*]*\s*(?:,|and\b|\+|&)?\s*[\`*]*/, '');
  }
  if (deps.some((id) => !/^AC-/.test(id))) stated.push(['blockedby', deps.filter((id) => !/^AC-/.test(id))]);
  const shapes = { files_owned: String.raw`[\w.<$~-]+/[^\s\`*,;)]*|[\w-]+(?:\.[\w-]+)+`, agent_type: String.raw`team-[a-z-]*[a-z]|none\b|lead\b|orchestrator\b`, type: String.raw`(?:AFK|HITL)(?![\w-])`, requirement: String.raw`AC-[\w.-]*\w`, phase: String.raw`[A-Za-z]?\d[\w.]*` };
  for (const [key, shape] of Object.entries(shapes)) {
    // a phase is stated with a colon or an `is`, or by a line that starts with it (`Phase 2 in practice.`): `Phase 2`
    // inside a sentence is a mention
    const led = key === 'phase' && (/^\s*(?:[:=]|is\b)/i.test(after(key)) || /^\s*(?:[-*+]\s+)?[`*]*phase(?![\w-])/i.test(line));
    const found = key === 'phase' ? led && value(key, shape) : value(key, shape);
    if (found) stated.push([key, [found]]);
  }
  return stated;
};


// the fields a block writes on a prose line: a `label:` at the start of a line (`files_owned: … · verify: …` under a
// table) and, for the task `loose` describes, a field stated anywhere in a line (statedIn) with a value the table
// does not hold (`holds`): a line that repeats the table says nothing new. `marks` holds the ids of the prose
// substeps read as tasks of their own: the fields of their paragraphs are theirs, and a line that starts with
// another id (`- S-4 seal (…; blockedBy T-27)`) states that step's. such a line is not read, so a field it holds is
// doubted, never silently dropped
const proseFields = (block, loose = null) => {
  const lines = linesOf(block);
  const fenced = fencedLines(lines);
  const label = `\\**(${FIELD_LABELS})\\**\\s*:`;
  const keys = new Set();
  const own = new Set();
  let paragraph = [];
  const close = () => {
    if (paragraph.some((i) => loose?.marks.some((id) => lines[i].includes(`**${id}**`)))) for (const i of paragraph) own.add(i);
    paragraph = [];
  };
  lines.forEach((line, i) => (line.trim() ? paragraph.push(i) : close()));
  close();
  lines.forEach((line, i) => {
    if (fenced.has(i) || line.startsWith('|')) return;
    if (new RegExp(`^\\s*(?:[-*]\\s+)?${label}`, 'i').test(line)) for (const m of line.matchAll(new RegExp(`(?:^\\s*(?:[-*]\\s+)?|\\s·\\s|;\\s)${label}`, 'gi'))) keys.add(keysOf(m[1])[0]);
    const lead = loose && idAtStart(bare(unwrap(line)).replace(/^\[[ xX]\]\s+/, ''));
    if (!loose || own.has(i) || (lead && lead !== loose.id && !lead.startsWith(`${loose.id}-`) && !lead.startsWith(`${loose.id}.`))) return;
    for (const [key, values] of statedIn(line)) if (values.some((value) => !loose.holds(key, value))) keys.add(key);
  });
  return keys;
};

// the part of a cell meant for one id of a several-id heading. a `<id>:` label or an `(<id>)` suffix is certain;
// a `→` chain or one part per id in heading order is a guess
export const cellFor = (cell, id, group) => {
  if (group.length < 2 || cell === undefined) return { text: cell, guessed: false };
  const parts = splitParts(cell).map((part) => {
    const lead = new RegExp(`^(${ID_SRC})\\s*(?::|→)\\s*`).exec(part);
    if (lead && group.includes(lead[1])) return { id: lead[1], text: part.slice(lead[0].length) };
    const tail = new RegExp(`\\s*\\((${ID_SRC})\\)\\s*$`).exec(part);
    if (tail && group.includes(tail[1])) return { id: tail[1], text: part.slice(0, tail.index) };
    return { id: null, text: part };
  });
  if (parts.some((part) => part.id)) return { text: parts.filter((part) => part.id === id).map((part) => part.text).join('; '), guessed: false };
  const chain = cell.split(/\s*→\s*/);
  const at = chain.findIndex((link) => link.trim() === id);
  if (chain.length > 1 && at >= 0) return { text: at > 0 ? chain[at - 1] : '', guessed: true };
  for (const separator of [/^\s·\s/, /^;\s/]) {
    const split = splitParts(cell, separator);
    if (split.length === group.length) return { text: split[group.indexOf(id)], guessed: true };
  }
  return { text: cell, guessed: false };
};

// whether a backtick span of a files_owned cell is a path: no command, no bare `$VAR` (`$ABS_SESSION/…` and
// `$REPO/…` are paths). a path may hold spaces inside its directory names (`~/Library/Application Support/x/**`)
const isPath = (span) => {
  if (span.startsWith('$') && !/^\$\{?[A-Z_]+\}?\//.test(span)) return false;
  // a negated glob (`!src/x.ts`) owns nothing; a comma outside a brace group joins two paths
  let flat = span;
  for (let before = ''; before !== flat; ) [before, flat] = [flat, flat.replace(/\{[^{}]*\}/g, '')];
  if (span.startsWith('!') || flat.includes(',')) return false;
  // two paths in one span (`a.ts;b.ts`, `a.ts<br>b.ts`), a line range (`a.ts:10-20`) and the directory the plan
  // stands in (`.`) are no one plain path. a pipe is a character of a name (`src/a\|b.ts`), unless a path of its own,
  // one that ends in an extension or a star, stands on each side of it (`a.ts\|b.ts`)
  const piped = span.split(/\\?\|/);
  if (/;|<br\s*\/?>/i.test(span) || (piped.length > 1 && piped.every((part) => /(?:\.\w+|\*)$/.test(part))) || /:\d+(?:[-–,:]\d+)*$/.test(span) || /^\.{1,2}\/?$/.test(span)) return false;
  if (!/\s/.test(span)) return true;
  // a space sits between the capitalised words of one directory name (`Application Support`): `a.ts b.ts`,
  // `x.md · y.md` and `pkg/a src/b/**` are no single path
  const parts = span.split('/');
  return parts.length > 2 && !/\s/.test(parts[0]) && !/\s/.test(parts.at(-1)) && parts.every((part) => !/\s/.test(part) || /^[A-Z0-9][A-Za-z0-9_-]*(?: [A-Z0-9][A-Za-z0-9_-]*)+$/.test(part));
};
// the backtick spans of a text and the text outside them: a run of backticks, text with none in it, and as many
// backticks again. each span leaves one space in `outside`, at its place in `places`. scanned by hand: a pattern
// with a back-reference goes quadratic on a long run of backticks
const spanScan = (text) => {
  const spans = [];
  const places = [];
  let outside = '';
  for (let i = 0; i < text.length; ) {
    let open = i;
    while (text[open] === '`') open += 1;
    if (open === i) {
      outside += text[i];
      i += 1;
      continue;
    }
    let end = open;
    while (end < text.length && text[end] !== '`') end += 1;
    let close = end;
    while (text[close] === '`') close += 1;
    const size = Math.min(open - i, close - end);
    if (end === open || !size) {
      outside += text.slice(i, open);
      i = open;
      continue;
    }
    spans.push(text.slice(open, end).trim());
    outside += `${text.slice(i, open - size)} `;
    places.push(outside.length - 1);
    i = end + size;
  }
  return { spans, places, outside };
};
// whether a text holds more than the marks that separate the spans of a files_owned cell
const worded = (text) => text.replace(/<br\s*\/?>/gi, ' ').replace(/[\s,;·+]/g, '') !== '';
// an aside of a files_owned cell that is no commentary, so a doubt on the field: one that takes away from what the
// spans own (`(except src/b/**)`, `(excluding the lock file)`) reads like the same words outside it, and one that
// opens with a word that adds (`(+ its tests)`, `(and README.md)`) names files the cell does not list
const NARROWS = /(?<![\w-])(?:except|excluding|not|but)(?![\w-])/i;
const WIDENS = /^\(\s*(?:[+&]|(?:plus|and|also)(?![\w-]))/i;
// a note that ends a span (`src/t1.ts (shared)`): an aside of the cell written inside the ticks
const NOTED = /^(.*?\S)\s+(\([^()/*]*\))$/;
// R-3a: how the overlap check takes a files_owned cell. `none`: no span, its paths are bare words. `spans`: a clean
// cell, backtick spans and separators and nothing else, so a span that was read is owned for certain. `words`:
// anything else stands in it, which may say a span is not owned: an aside, beside the ticks or inside them, whatever
// its words are (`(no edits)`, `(read)`, `(except src/b/**)`), words outside the spans (`reads src/x.ts only`), a
// negated span (`!src/x.ts`). no list of words decides it
export const ownedBy = (cell) => {
  const { spans, outside } = spanScan(cell ?? '');
  if (!spans.length) return 'none';
  return worded(outside) || spans.some((span) => span.startsWith('!') || NOTED.test(span)) ? 'words' : 'spans';
};
// glob patterns of a files_owned cell: its backtick spans outside asides. `unsure` when the cell holds any text
// outside its spans but a separator or an aside that holds no span, no slash and no glob star and neither takes away
// nor adds (R-2), a span was set aside (a command, a `$VAR`, a span inside an aside), or it starts with none and
// then names a path. an explicit none is a value
export const globsOf = (cell) => {
  if (!cell) return { globs: [], unsure: false };
  const { spans: all, places, outside } = spanScan(cell);
  // an explicit none is a value; what it adds outside an aside (`none, except src/b/x.ts`) is text like any other
  if (isNone(cell)) return { globs: [], unsure: all.length > 0 || withoutAsides(bare(cell)).replace(/^(?:none|n\/a)\b/i, '').replace(/[\s.,;·—–-]/g, '') !== '' };
  // the asides are read on the text outside the spans, so a bracket inside a span opens none
  const asides = asidesOf(outside);
  const spansIn = (from, to) => places.filter((at) => from < at && at < to).length;
  const pathOf = (span) => {
    const noted = NOTED.exec(span);
    return noted && !NARROWS.test(noted[2]) && !WIDENS.test(noted[2]) ? noted[1] : span;
  };
  const kept = unique(all.map(pathOf).filter((span, k) => span && !asides.some(([from, to]) => from < places[k] && places[k] < to) && isPath(span)));
  // an aside beside the spans is commentary, the way an agent_type cell reads one, unless it may name a path, takes
  // away from the spans or adds to them
  const loud = (from, to) => spansIn(from, to) > 0 || [/[/*]/, NARROWS, WIDENS].some((mark) => mark.test(outside.slice(from, to + 1)));
  const prose = worded(blankAsides(outside, loud));
  if (all.length) return { globs: kept, unsure: prose || kept.length < unique(all).length };
  return { globs: unique(cell.split(/\s+/).map((word) => word.replace(/^[(]+|[,;.)]+$/g, '')).filter((word) => /[/*]/.test(word) || /^[\w.-]+\.[A-Za-z0-9]+$/.test(word))), unsure: true };
};

// prototype-safe: an agent_type cell `constructor` is other, never a function
export const kindOf = (agentType) => (Object.hasOwn(KIND_OF, agentType ?? '') ? KIND_OF[agentType] : 'other');
// the agent an agent_type cell names, and why that reading is not certain. certain: one agent name with nothing
// beside it but an aside, or a lead marker and no agent. `known` holds the agent definitions of the checkout; null
// when none was found, and then only the shape of the cell is checked
export const agentOf = (cell, known = null) => {
  const text = bare(cell ?? '');
  if (!text) return { agentType: null, why: null };
  const defined = (name) => BUILT_IN.includes(name) || Boolean(known?.has(name));
  const wordsOf = (part) => [...part.matchAll(/(?<![\w-])[A-Za-z][\w-]*(?![\w-])/g)].map((m) => m[0]);
  const outside = withoutAsides(text).trim();
  // R-12: the bare word `claude` that stands only inside an aside is the cli (`human; paid claude -p haiku`), not a
  // second agent
  const cli = wordsOf(outside).includes('claude') ? null : 'claude';
  const agents = unique(wordsOf(text).filter((word) => word !== cli && (/^team-[a-z][a-z-]*[a-z]$/.test(word) || defined(word))));
  // a dash before an aside is a none: `— (HITL)`
  const lead = isNone(text) ? 'none' : (LEAD_WORD.exec(text)?.[1].toLowerCase() ?? (outside && isNone(outside) ? 'none' : null));
  if (agents.length > 1) return { agentType: agents[0], why: `names several agents (${agents.join(', ')})` };
  if (agents.length === 1) {
    const [name] = agents;
    // which of the two owns the step is a reader's call; the graph keeps the one written first
    const first = lead === 'none' || text.search(LEAD_WORD) < text.indexOf(name) ? lead : name;
    if (lead) return { agentType: first, why: `names ${name} beside a lead marker (${lead})` };
    if (outside.split(name).join(' ').replace(/[\s.,;:·—-]/g, '')) return { agentType: name, why: `holds prose beside ${name}` };
    return { agentType: name, why: known && !defined(name) ? `names ${name}, which is no agent definition under .claude/agents` : null };
  }
  // a word that leaves the owner open (`none - tbd`, `orchestrator (?)`) names nobody for certain, in an aside too
  if (lead && UNDECIDED.test(text)) return { agentType: lead, why: 'names no single agent' };
  // a cell that starts with none or a dash says no agent, whatever it adds after a separator (`none — in-session
  // lead`). words that go on from none (`none yet`, `none of the above`) and a question mark are prose
  if (lead && /^(?:(?:none|n\/a)\s*(?:$|[—–:(,;.·-])|[—–]|-(?=\s|$))/i.test(text) && !outside.includes('?')) return { agentType: lead, why: null };
  // one owner written in a few words (`lead session (not dispatched)`): certain when nothing but lead markers and
  // their filler stands outside the asides. a word that names somebody else (`codex (no human)`, `fresh subagent —
  // never the orchestrator`) or a list of owners is a doubt
  const strangers = wordsOf(outside).filter((word) => !new RegExp(`^${LEAD_WORD.source}$`, 'i').test(word) && !LEAD_FILLER.includes(word.toLowerCase()));
  if (lead && !strangers.length && !/[·;,/+→?]/.test(outside)) return { agentType: lead, why: null };
  if (/^[A-Za-z][\w-]*$/.test(outside)) return { agentType: outside, why: lead ? `names ${outside} beside a lead marker (${lead})` : known ? `names ${outside}, which is no agent definition under .claude/agents` : null };
  return { agentType: lead ?? text.split(/\s+/)[0], why: 'names no single agent' };
};
// a type cell that names HITL anywhere is HITL: `AFK (HITL for the deploy step)` holds a human step
export const typeOf = (cell) => (/\bHITL\b/.test(cell ?? '') ? 'HITL' : /\bAFK\b/.test(cell ?? '') ? 'AFK' : null);
const isNone = (cell) => /^(?:none\b|n\/a\b|—\s*$|-\s*$|$)/i.test(bare(cell ?? ''));
const isUnset = (cell) => isNone(cell) || /^(tbd|todo|tba|\?+)\.?$/i.test(bare(cell ?? ''));
// a top-level split of a requirement cell: commas and semicolons outside parentheses
const requirementItems = (cell) => {
  const items = [''];
  let depth = 0;
  for (const ch of bare(cell)) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth = Math.max(0, depth - 1);
    if (depth === 0 && (ch === ',' || ch === ';')) items.push('');
    else items[items.length - 1] += ch;
  }
  return items.map((item) => item.trim()).filter(Boolean);
};

// the raw text of a top-level yaml key and its indented lines, from the first line that opens it
export const yamlBlock = (lines, key) => {
  const start = lines.findIndex((line) => line.startsWith(`${key}:`));
  if (start < 0) return null;
  let end = start + 1;
  while (end < lines.length && (lines[end] === '' || /^\s/.test(lines[end])) && !/^\s*```/.test(lines[end])) end += 1;
  while (end > start + 1 && !lines[end - 1].trim()) end -= 1;
  return lines.slice(start, end).join('\n');
};

// the section the templates prescribe for what a human runs: a title that starts, after its number, with
// `Human-gated checklist` (`## 6. Human-gated prod checklist (HITL)`). a title that merely holds the word human
// (`## Phase 2 — human-readable report`) or mentions the checklist (`## Phase 2 — after the human-gated checklist`)
// declares no step
const isHumanHeading = (line) => /^#{1,2}\s+(?:§?\s*\d+[.):]?\s+)?\**human[- ]gated\s+(?:[\w-]+\s+){0,2}checklists?\b/i.test(line);
// ids of the plan's human-gated checklist sections: their headings and the first cell of their table rows.
// list items are left out: their prose names conditions (OP-11, P-2) that are no step
export const humanStepsOf = (lines, skip = fencedLines(lines)) => {
  const steps = [];
  let inside = false;
  for (const [i, line] of lines.entries()) {
    if (skip.has(i)) continue;
    if (/^#{1,2}\s/.test(line)) inside = isHumanHeading(line);
    if (!inside) continue;
    const lead = /^#{3,5}\s/.test(line) ? line.replace(/^#+\s+/, '') : line.startsWith('|') ? (splitCells(line)[0] ?? '') : null;
    if (lead) steps.push(...idsIn(bare(lead)).filter((id) => !/^AC-/.test(id)));
  }
  return unique(steps);
};

// ids the plan declares anywhere outside fences and comments: every id a heading names, the lead id of a table
// row's first cell, the ids of its id cell (a dotted substep suffix included), and the id a list item of the
// human-gated checklist starts with (`- [ ] H-1 — go for the push`: no human step, yet no unknown id either)
export const declaredIds = (text) => {
  const ids = new Set();
  const plain = plainOf(linesOf(text));
  const { skip } = scanOf(plain);
  let human = false;
  plain.forEach((line, i) => {
    if (skip.has(i)) return;
    if (/^#{1,2}\s/.test(line)) human = isHumanHeading(line);
    const item = human ? /^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?(.*)$/.exec(line) : null;
    const listed = item && idAtStart(bare(item[1]));
    if (listed) ids.add(listed);
    const heading = headingAt(plain, skip, i);
    const lead = heading ? heading.text : unwrap(line).startsWith('|') ? (splitCells(unwrap(line))[0] ?? '') : null;
    if (lead === null) return;
    const id = idAtStart(bare(lead));
    if (id) ids.add(id);
    if (heading) for (const named of idsIn(heading.text)) ids.add(named);
  });
  for (const table of tablesOf(plain, skip, unwrap)) {
    const at = table.idAt;
    for (const { cells } of at < 0 ? [] : table.rows) {
      const cell = bare(cells[at] ?? '');
      for (const id of [idAtStart(cell), ...idsIn(cell)]) if (id) ids.add(id);
    }
  }
  return ids;
};

// run-watch rows by the task ids they name
const runWatchOf = (text, ids) => {
  const rows = new Map();
  if (!text) return {};
  const known = new Set(ids);
  for (const line of linesOf(text)) {
    if (!/^\s*(?:[-*]\s|\|)/.test(line) || /^\|[\s:|-]+\|?\s*$/.test(line)) continue;
    for (const id of unique(idsIn(line, (token) => known.has(token)).filter((token) => known.has(token)))) rows.set(id, [...(rows.get(id) ?? []), line.trim()]);
  }
  return Object.fromEntries(rows);
};

// one task, plus the reasons it was read with less than certainty. `context` is the text around a table row, where
// a field the row lacks may be written; `prose` marks fields read from prose, `row` a row of a task table, `parent`
// the task a substep extends
const taskOf = ({ id, title, slug, after, line, block, context = block, fields, group, dodIds, known = null, doubts = [], prose = false, row = false, marks = null, parent = null }) => {
  const reasons = [...doubts];
  const cells = {};
  for (const key of FIELDS) {
    const { text, guessed } = cellFor(fields[key], id, group);
    if (guessed) reasons.push(`its ${key} cell was split by position`);
    if (fields.guessed?.has(key)) reasons.push(`its ${key} shares a cell with other fields`);
    cells[key] = text;
  }
  const lacks = (key) => cells[key] === undefined || !bare(cells[key]);
  // R-4: what a substep takes from the task it extends, and what it does not owe: a field that task gives, the
  // second of Agent and agent_type (one owner is owed), files_owned (with none it owns nothing)
  const taken = new Set(parent ? ['phase', 'requirement', 'type', 'estimated'].filter(lacks) : []);
  const given = (key) => (key === 'requirement' ? parent.requirement.length > 0 : parent[key] !== null);
  const spared = (key) => Boolean(parent) && (taken.has(key) ? given(key) : (key === 'agent' && !lacks('agent_type')) || (key === 'agent_type' && !lacks('agent')) || key === 'files_owned');
  // a cell labelled for sub-ids of this task (`T-56b.1: …; T-56b.2: …`) splits work the graph does not split
  const subLabel = new RegExp(`(?:^|[;·]\\s*)${escape(id)}[.-][A-Za-z0-9.]+\\s*:`);
  const labelled = FIELDS.filter((key) => subLabel.test(fields[key] ?? ''));
  if (labelled.length) reasons.push(`its ${labelled.join(', ')} cell(s) are split by sub-ids the graph does not hold`);
  // a row cell that points at another row (`as above`) holds no value of its own
  if (row) for (const key of FIELDS) if (ANOTHER_ROW.test(bare(cells[key] ?? ''))) reasons.push(`its ${MANDATORY[key] ?? key} cell refers to another row ("${ANOTHER_ROW.exec(bare(cells[key]))[0]}")`);
  // R-4a: a substep that writes no agent_type and names its owner in a column labelled Owner: that cell is read as
  // its agent_type, so a roster name gives the agentType and the kind, a lead marker the kind lead, anything else the
  // doubt an agent_type cell gets
  const byOwner = Boolean(parent) && lacks('agent_type') && !lacks('agent') && Boolean(fields.owner?.has('agent'));
  const agent = agentOf(byOwner ? cells.agent : cells.agent_type, known);
  if (agent.why) reasons.push(`its ${byOwner ? 'Owner cell, read as its agent_type,' : 'agent_type cell'} ${agent.why}`);
  // a HITL task is a step a human takes: a substep takes HITL from it only when the lead or the human owns the
  // substep too, by its agent_type, else by its Agent or Owner cell. one an agent is dispatched for is HITL or AFK
  // only where it says so: with no type of its own its type is a doubt, never the task's HITL
  const led = kindOf(lacks('agent_type') ? agentOf(cells.agent, known).agentType : agent.agentType) === 'lead';
  const untyped = taken.has('type') && parent.type === 'HITL' && !led;
  if (untyped) reasons.push('it states no type and its task is HITL, which a dispatched substep does not take');
  const requirementCell = cells.requirement ?? '';
  const filesOwnedText = cells.files_owned ?? null;
  const owned = globsOf(filesOwnedText);
  if (owned.unsure) reasons.push('files_owned is prose or holds a span that is no path');
  const typeCell = cells.type;
  // HITL wins, so the human sees the step; which part the plan meant for whom is a reader's call
  if (/\bAFK\b/.test(typeCell ?? '') && /\bHITL\b/.test(typeCell ?? '')) reasons.push('its type cell names both AFK and HITL, read as HITL');
  // `afk` is readable, yet not the spelling the contract writes: read with a doubt, never a missing type
  const loose = typeOf(typeCell) ? null : typeOf((typeCell ?? '').toUpperCase());
  if (loose) reasons.push(`its type cell writes ${loose} in another case, read as ${loose}`);
  // a row whose cells are shifted (an unescaped pipe, a missing cell) holds its type under another label
  if (row && typeCell !== undefined && !typeOf(typeCell) && !loose && /\b(AFK|HITL)\b/.test(linesOf(block)[2] ?? '')) reasons.push('the type is written outside the type cell of its row');
  if (fenceScan(linesOf(block), commentReader()).open) reasons.push('its block cuts through a code fence');
  // a mandatory field the task lacks is a doubt on that field, never a defect: it may be written where no field is
  // read. no Requirement or type field, yet the text around names ACs or AFK / HITL: written elsewhere
  const elsewhere = { requirement: /\bAC-\w/.test(context) && 'its Requirement is written outside a Requirement field', type: /\b(AFK|HITL)\b/.test(context) && 'the type is written outside a type field' };
  // whether the table already holds a value a line of the text states. an id of another family is no dependency
  // read from this field, and the task's own id is none
  const holds = (key, value) => {
    const cell = bare(cells[key] ?? '');
    if (key === 'blockedby') return value === id || prefixOf(value) !== prefixOf(id) || idsIn(cell, () => true).includes(value);
    if (key === 'type') return typeOf(cell) === value.toUpperCase();
    return new RegExp(`(?<![\\w.])${escape(value)}(?![\\w.])`, 'i').test(cell);
  };
  const onLine = proseFields(block, marks && { marks, holds, id });
  const absent = [];
  for (const key of Object.keys(MANDATORY)) {
    // an unset Requirement or type is a defect the check fails, so for these two only a missing field is a doubt
    const judged = key === 'requirement' || key === 'type';
    if (judged && !taken.has(key) ? fields[key] !== undefined : !lacks(key)) continue;
    // a field a prose line of the block writes is named below, whoever owes it
    if (spared(key) && !onLine.has(key)) continue;
    if (judged && !taken.has(key) && elsewhere[key]) reasons.push(elsewhere[key]);
    else if (!(judged && prose)) absent.push(key);
  }
  if (lacks('workkind') && onLine.has('workkind')) absent.push('workkind');
  const names = (keys) => keys.map((key) => MANDATORY[key] ?? (key === 'workkind' ? 'workKind' : 'blockedBy')).join(', ');
  const [written, nowhere] = [absent.filter((key) => onLine.has(key)), absent.filter((key) => !onLine.has(key))];
  if (written.length) reasons.push(`its ${names(written)} is written on a prose line, outside the table`);
  if (nowhere.length) reasons.push(`it has no ${names(nowhere)} field`);
  // a field the table states and a prose line states again: which one holds is a reader's call
  const twice = FIELDS.filter((key) => onLine.has(key) && fields[key] !== undefined && !absent.includes(key));
  if (twice.length) reasons.push(`its ${names(twice)} is written in the table and again on a prose line`);
  // two rows or two columns with one label, a row with no label under a field, a prose label met twice
  const repeated = FIELDS.filter((key) => fields.twice?.has(key));
  if (repeated.length) reasons.push(`its ${names(repeated)} is written more than once: only the first is read`);
  const acs = acsIn(requirementCell, dodIds);
  if (!isUnset(requirementCell) && !acs.length && !/grade-seal-gate/i.test(requirementCell)) reasons.push('its Requirement names no AC');
  // `AC-1 to AC-3`, `AC-1 through AC-3`, `AC-1—AC-3`: a range in a form that is not expanded
  if (/\bAC-\w+\s*(?:\bto\b|\bthrough\b|\bthru\b|—)\s*(?:AC-\w|\d)/i.test(withoutAsides(requirementCell))) reasons.push('its Requirement names a range of ACs in a form that is not expanded');
  const unlisted = dodIds.size ? acs.filter((ac) => !dodIds.has(ac)) : [];
  if (unlisted.length) reasons.push(`its Requirement names ${unlisted.join(', ')}, which definition-of-done.md does not list`);
  const text = (key) => (lacks(key) ? null : bare(cells[key]));
  const task = {
    id,
    slug,
    title,
    line,
    phase: taken.has('phase') ? parent.phase : text('phase'),
    agent: text('agent'),
    agentType: agent.agentType,
    kind: kindOf(agent.agentType),
    type: taken.has('type') ? (untyped ? null : parent.type) : (typeOf(typeCell) ?? loose),
    deps: [],
    requirement: taken.has('requirement') ? [...parent.requirement] : isUnset(requirementCell) ? [] : requirementItems(requirementCell),
    acs: taken.has('requirement') ? [...parent.acs] : acs,
    filesOwned: owned.globs,
    filesOwnedText,
    verify: cells.verify ?? null,
    evidenceProducer: cells.evidence_producer ?? null,
    workKind: text('workkind'),
    estimated: taken.has('estimated') ? parent.estimated : text('estimated'),
    block,
  };
  return { task, depsText: after ?? cells.blockedby ?? null, reasons };
};

// substeps written in a heading's prose: `**T-9-spec** — Phase 4; …`, each a sub-id of the heading's own id. under
// a heading that is no task itself, a substep that leaves out its phase or requirement takes the one before it
// ("Requirement as T-9-spec" says so); a field taken that way is a guess. under a heading that is a task (`owned`),
// what a substep leaves out comes from that task (R-4). `at` is the place of the mark in the body
const substepsOf = (body, main, owned = false) => {
  const marks = [...body.matchAll(new RegExp(`\\*\\*(${ID_SRC}(?:\\.[A-Za-z][A-Za-z0-9]*)?)\\*\\*\\s*(?:—|:|-)\\s*`, 'g'))].filter((m) => m[1].startsWith(`${main}-`) || m[1].startsWith(`${main}.`));
  const steps = marks.map((m, k) => ({ id: m[1], at: m.index, fields: inlineFields(body.slice(m.index + m[0].length, marks[k + 1]?.index ?? body.length)), doubts: [] }));
  // a mark is a substep when its prose names who runs it or what it waits on, or at least two fields of its own:
  // a bold id followed by a remark is a mention
  for (const step of steps) step.reads = 'blockedby' in step.fields || 'agent' in step.fields || Object.keys(step.fields).length >= 2;
  steps.forEach((step, k) => {
    const prev = steps[k - 1]?.fields;
    if (!owned && prev && !('phase' in step.fields) && 'phase' in prev) {
      step.fields.phase = prev.phase;
      step.doubts.push('its phase is taken from the substep before it');
    }
    const req = step.fields.requirement;
    const named = req && /^as\s+(\S+)/i.exec(req.trim())?.[1];
    if (prev && named && named === steps[k - 1].id) step.fields.requirement = prev.requirement;
    else if (!owned && prev && req === undefined && 'requirement' in prev) {
      step.fields.requirement = prev.requirement;
      step.doubts.push('its requirement is taken from the substep before it');
    }
    for (const key of owned ? ['blockedby'] : ['type', 'requirement', 'blockedby']) if (!(key in step.fields)) step.doubts.push(`its prose names no ${key}`);
  });
  return steps.filter((step) => step.reads);
};

// the top-level parts of a cell: split on `,` `;` `·` outside parentheses and backtick spans
const topParts = (cell) => {
  const parts = [''];
  let depth = 0;
  for (let i = 0; i < cell.length; i += 1) {
    const ch = cell[i];
    if (ch === '`') {
      const close = cell.indexOf('`', i + 1);
      const end = close < 0 ? cell.length : close + 1;
      parts[parts.length - 1] += cell.slice(i, end);
      i = end - 1;
      continue;
    }
    if (ch === '(') depth += 1;
    if (ch === ')') depth = Math.max(0, depth - 1);
    if (depth === 0 && /[,;·]/.test(ch)) parts.push('');
    else parts[parts.length - 1] += ch;
  }
  return parts.map((part) => part.trim()).filter(Boolean);
};
// what a text holds beside its ids and the words that join them (the commas are an expanded range's)
const besideIds = (text, dotted) => {
  const { expanded, spans } = idSpans(text, dotted);
  const blanked = spans.reduceRight((out, span) => `${out.slice(0, span.at)} ${out.slice(span.end)}`, expanded);
  // a full stop that ends the cell is punctuation, not prose
  return blanked.replace(new RegExp(ID_SRC, 'g'), ' ').replace(/\band\b|[+&,]/g, '').trim().replace(/^\.$/, '');
};
// the ids of a blockedBy cell as hard edges, and what in it is not one
const readDeps = (cell, self, dotted) => {
  const ids = (text) => idsIn(text, dotted);
  // a part that carries a condition, in an aside or not (`T-2 (if green)`, `T-30 when …`), is no hard edge: read
  // as one it would close a cycle the plan never runs
  const parts = topParts(cell);
  const conditional = unique(parts.filter((part) => CONDITION.test(part)).flatMap(ids)).filter((id) => id !== self);
  const kept = parts.filter((part) => !CONDITION.test(part));
  // an id in an aside is commentary (`T-5 (lane order: runs before T-6)`), and an id inside prose
  // (`re-run after T-36`) may be no edge at all: both are left to the reader of the plan
  const aside = unique(
    kept.flatMap((part) => {
      const outside = new Set(ids(withoutAsides(part)));
      return ids(part).filter((id) => !outside.has(id));
    }),
  );
  const prose = unique(kept.filter((part) => besideIds(withoutAsides(part), dotted)).flatMap((part) => ids(withoutAsides(part))));
  return { hard: kept.map(withoutAsides).join(', '), conditional, aside, prose };
};
// `T-1-T-3`: two ids of one family joined by a hyphen, which reads as a range or as a sub-id
const rangeLike = (id) => {
  const whole = new RegExp(`^${ID_SRC}$`);
  const at = id.indexOf(`-${prefixOf(id)}`, 1);
  return at > 0 && whole.test(id.slice(0, at)) && whole.test(id.slice(at + 1));
};

// the agent definitions of the checkout a session sits in: the nearest directory, from the session up, that has a
// .claude/agents, so a staged copy of this script and the live one read the same roster. null when none has one
export const rosterOf = (session) => {
  for (let dir = session; ; dir = dirname(dir)) {
    try {
      return readdirSync(join(dir, '.claude', 'agents')).filter((name) => name.endsWith('.md')).map((name) => name.slice(0, -3));
    } catch {
      if (dir === dirname(dir)) return null;
    }
  }
};

export const projectText = ({ text, session = null, path = null, runWatch = null, dod = null, roster = null }) => {
  const written = text.split('\n');
  const offsets = [0];
  for (const line of written) offsets.push(offsets.at(-1) + line.length + 1);
  // the plan's own bytes from one line up to another
  const raw = (from, to) => text.slice(offsets[from], Math.min(offsets[to], text.length));
  const plain = plainOf(written);
  const warnings = [];
  const partial = (ids, why) => warnings.push(`${PARTIAL}${[].concat(ids).join(', ')} — ${why}`);
  const at = (i) => `team-plan.md:${i + 1}`;
  const known = roster === null ? null : new Set(roster);
  const dodAcs = dod === null ? null : parseAcs(dod);
  const dodIds = new Set((dodAcs ?? []).map((ac) => acKey(ac.id)));
  const { front, comments, skip, nested, unclosed } = scanOf(plain);
  written.forEach((line, i) => {
    if (!skip.has(i) && line.replace(/\r$/, '').length > LINE_LIMIT) partial(at(i), `its line holds ${line.length} characters, read only up to ${LINE_LIMIT}`);
  });
  const heads = [];
  plain.forEach((line, i) => {
    const level = skip.has(i) ? null : /^(#{1,6})\s/.exec(line)?.[1].length;
    if (level) heads.push({ i, level, ids: level >= 2 && level <= 5 ? headingIds(line) : null });
  });
  const humanSection = new Set();
  let inHuman = false;
  plain.forEach((line, i) => {
    if (!skip.has(i) && /^#{1,2}\s/.test(line)) inHuman = isHumanHeading(line);
    if (inHuman) humanSection.add(i);
  });
  const tables = tablesOf(plain, skip);
  const idHeads = heads.filter((head) => head.ids);
  const nextHead = (i, stops) => (heads.find((other) => other.i > i && stops(other)) ?? { i: plain.length }).i;
  // the lines under a heading, the ones no structure is read from blanked
  const bodyOf = (head, end) => plain.slice(head.i + 1, end).map((line, k) => (skip.has(head.i + 1 + k) ? '' : line));
  // the text of the section a line stands in: from the heading above it to the next one
  const sectionOf = (i) => raw((heads.findLast((head) => head.i < i) ?? { i: 0 }).i, nextHead(i, () => true));
  // the phase of the nearest enclosing heading that names one
  const phaseAbove = (i) => {
    let level = 7;
    for (const head of heads.filter((other) => other.i < i).reverse()) {
      if (head.level >= level) continue;
      level = head.level;
      const phase = headingPhase(plain[head.i]);
      if (phase) return phase;
    }
    return null;
  };

  // pass 1: the forms read with certainty. first the task tables with an id column: each row is one task wherever
  // the table stands, its block the header, the delimiter and that row. a row that does not name one task (a
  // template in a form not read, several ids, no id) is named in a warning, never skipped
  const rows = [];
  const patterns = [];
  const declared = declaredIds(text);
  const unread = (row, cell, why) => partial(at(row.at), `${why} — row not projected: "${cell.slice(0, 60)}"`);
  for (const table of tables.filter((candidate) => isTaskTable(candidate) && candidate.idAt >= 0 && !isPatternTable(candidate))) {
    const idAt = table.idAt;
    const shared = labelOf(table.header[idAt]).includes('/');
    const top = raw(table.at, table.at + 2);
    const context = sectionOf(table.at);
    // the phase comes from a Phase column, else from the enclosing phase heading
    const phase = fieldKeys(table.header).includes('phase') ? null : phaseAbove(table.at);
    const fieldsOfRow = (cells) => {
      const fields = {};
      table.header.forEach((label, k) => {
        if (cells[k] !== undefined) assign(fields, label, cells[k], true);
      });
      if (phase) fields.phase = phase;
      return fields;
    };
    const sets = new Map();
    for (const row of table.rows) {
      // a line break in the id cell separates as a space does
      const cell = bare(row.cells[idAt] ?? '').replace(/<br\s*\/?>/gi, ' ').trim();
      const doubts = row.cells.length === table.header.length ? [] : [`its row has ${row.cells.length} cells for ${table.header.length} columns`];
      const entry = { line: row.at + 1, block: top + raw(row.at, row.at + 1), context, doubts, row: true };
      const template = TEMPLATE.exec(cell);
      if (template) {
        // one task per member of the stated set, the variable substituted in every cell (`T-n` and `<n>`)
        const [, prefix, variable, suffix, list] = template;
        const members = list === undefined ? sets.get(prefix + variable) : list.split(',').map((item) => item.trim());
        if (!members?.length || members.some((item) => !/^\d+[a-z]?$/.test(item)) || new Set(members).size !== members.length) {
          sets.delete(prefix + variable);
          if (suffix) patterns.push(new RegExp(`^${escape(prefix)}[0-9A-Za-z]+${escape(suffix)}$`));
          unread(row, cell, 'its id cell is a template over a set that is not read');
          continue;
        }
        sets.set(prefix + variable, members);
        // the variable written in a form that is not substituted (`T-{n}`, `$n`) would stay literal in every member
        const literal = new RegExp(`\\{${variable}\\}|\\$${variable}(?![A-Za-z0-9])`);
        if (row.cells.some((value, k) => k !== idAt && literal.test(value))) {
          if (suffix) patterns.push(new RegExp(`^${escape(prefix)}[0-9A-Za-z]+${escape(suffix)}$`));
          unread(row, cell, `its cells name the variable in a form that is not substituted ({${variable}} or $${variable})`);
          continue;
        }
        const token = new RegExp(`(?<![A-Za-z0-9])${escape(prefix + variable)}(?![A-Za-z0-9])`, 'g');
        for (const member of members) {
          const id = `${prefix}${member}${suffix}`;
          const cells = row.cells.map((value) => value.replace(token, () => prefix + member).replaceAll(`<${variable}>`, member));
          rows.push({ ...entry, id, title: null, slug: null, fields: fieldsOfRow(cells), group: [id], member: true });
        }
        continue;
      }
      const lead = idAtStart(cell);
      if (/^[A-Z][A-Za-z]{0,4}-[a-z](?![A-Za-z0-9])/.test(cell) || (!lead && /∈|[{<]/.test(cell))) {
        const shape = /^([A-Z][A-Za-z]{0,4}-)[a-z]((?:[.-][A-Za-z0-9]+)+)/.exec(cell);
        if (shape) patterns.push(new RegExp(`^${escape(shape[1])}[0-9A-Za-z]+${escape(shape[2])}$`));
        unread(row, cell, 'its id cell is a template in a form that is not read');
        continue;
      }
      if (!lead) {
        for (const id of idsIn(cell)) declared.add(id);
        unread(row, cell, 'its id cell names no id at its start');
        continue;
      }
      const rest = cell.slice(lead.length);
      const beside = withoutAsides(rest);
      // a set or a variable after the id: a template the grammar read as one literal id (`T-N.spec, N ∈ {1, 2}`)
      if (/∈|[{<]|\bsame\s+[A-Za-z]\b/.test(beside)) {
        const shape = /^([A-Z][A-Za-z]{0,4}-)[A-Za-z0-9]+((?:[.-][A-Za-z0-9]+)+)/.exec(cell);
        if (shape) patterns.push(new RegExp(`^${escape(shape[1])}[0-9A-Za-z]+${escape(shape[2])}$`));
        unread(row, cell, 'its id cell is a template in a form that is not read');
        continue;
      }
      // more ids than one: another id of the family anywhere in the cell (a range, a chain, a list with no
      // separator), or an id of any family after a separator
      const family = unique(idsIn(withoutAsides(cell), () => true)).filter((id) => id !== lead && prefixOf(id) === prefixOf(lead));
      const listed = beside.split(shared ? /[,;·&+→]|\band\b/ : /[,;·/&+→]|\band\b/).slice(1).map((part) => idAtStart(part.trim())).filter((id) => id && !/^AC-/.test(id));
      // an aside that adds an id of the family (`T-2 (also T-3)`) names a second task; one that describes the row
      // (`T-9.spec (covers T-2..T-3)`) does not
      const added = [...rest.matchAll(/\(\s*(?:also|and|plus|with|\+|&)\s*([^()]*)\)/gi)].flatMap((m) => idsIn(m[1], () => true)).filter((id) => id !== lead && prefixOf(id) === prefixOf(lead));
      const others = unique([...family, ...listed, ...added]);
      if (others.length || /^\s*(?:\.\.|…|–|—|to\b|through\b|thru\b)\s*\d+[a-z]?\s*$/i.test(beside)) {
        for (const id of [lead, ...others]) declared.add(id);
        unread(row, cell, `its id cell names several ids (${[lead, ...others].join(', ')}${others.length ? '' : ', a range'})`);
        continue;
      }
      // a template or a multiple in other words: the one capital letter of the id named again (`T-N.spec (N = 1, 2)`,
      // `T-X.spec for each task X`), a star on the id (`T-2*`), a count or a continuation right after it
      const letter = /^[A-Z][A-Za-z]{0,4}-([A-Z])(?![A-Za-z0-9])/.exec(lead)?.[1];
      const again = Boolean(letter) && new RegExp(`(?<![A-Za-z0-9-])${letter}(?![A-Za-z0-9-])`).test(rest);
      const starred = (row.cells[idAt] ?? '').replace(/\*\*|`/g, '').trim().startsWith(`${lead}*`);
      if (again || starred || MULTIPLE.test(rest)) {
        unread(row, cell, 'its id cell reads as a template or as several tasks, in a form that is not read');
        continue;
      }
      const title = (shared ? rest.split(/\s+\/\s+/)[0] : rest).trim();
      rows.push({ ...entry, id: lead, title, slug: title.split(/\s+/)[0] || null, fields: fieldsOfRow(row.cells), group: [lead] });
    }
  }
  // then each id heading's own table: its field table, else a task table with no id column (the heading names the
  // task of each row). a heading ends at the next heading of its level or above, or at the next id heading
  for (const head of idHeads) {
    head.group = head.ids.named.map((named) => named.id);
    head.stop = nextHead(head.i, (other) => other.level <= head.level || Boolean(other.ids));
    const inside = tables.filter((table) => table.at > head.i && table.at < head.stop);
    // a task table with a header and no row names no task, and a phase heading (`### P1 — build`) names none by a
    // table of rows: only a field table makes it one
    const byRows = headingPhase(plain[head.i]) ? null : inside.find((table) => isTaskTable(table) && table.idAt < 0 && table.rows.length);
    head.own = inside.find((table) => fieldColumns(table, head.group)) ?? byRows ?? null;
  }
  // pass 2: prose forms, only under a heading of a known task family
  const families = new Set([...idHeads.filter((head) => head.own).flatMap((head) => head.group), ...rows.map((row) => row.id)].map(prefixOf));
  const paragraphOf = (body) => inlineFields((body.join('\n').trim().split(/\n\s*\n/)[0] ?? '').replace(/\n/g, ' '));
  for (const head of idHeads.filter((candidate) => !candidate.own && families.has(prefixOf(candidate.group[0])))) {
    const body = bodyOf(head, head.stop);
    const fields = paragraphOf(body);
    const paragraph = Object.keys(fields).length >= 4 && 'blockedby' in fields && ('agent' in fields || 'agent_type' in fields);
    head.prose = substepsOf(body.join('\n'), head.group[0]).length ? 'substeps' : paragraph ? 'paragraph' : null;
  }
  const projects = (head) => Boolean(head.own || head.prose);
  // each task as it will be read: a substep is read after the task it extends
  const specs = [];
  // a task's block runs to the next heading of its level or above, or to the next heading that projects as a task:
  // a deeper heading that is no task (`#### E2E checks`) stays inside, so a block never swallows a following task
  // and never loses its own tail
  for (const head of idHeads.filter(projects)) {
    head.end = nextHead(head.i, (other) => other.level <= head.level || Boolean(other.ids && projects(other)));
    const main = head.ids.named[0];
    const base = { line: head.i + 1, block: raw(head.i, head.end), dodIds, known };
    const body = bodyOf(head, head.end);
    const doubts = (named) => [
      ...(named.inferred ? ['its id is read from an aside of the heading'] : []),
      ...(prefixOf(named.id).replace(/-$/, '').length >= 3 ? [`${named.id} may be a name, not a task id`] : []),
    ];
    // the prose substeps read as tasks of their own: a field their paragraphs state is theirs, any other line of
    // the block that states one is doubted for the heading's task
    const found = substepsOf(body.join('\n'), main.id, Boolean(head.own));
    const steps = found.length > SUBSTEP_LIMIT ? [] : found;
    if (found.length > SUBSTEP_LIMIT) partial(head.group, `${found.length} prose substeps under its heading, more than ${SUBSTEP_LIMIT} — not projected`);
    const marks = steps.map((step) => step.id);
    // a prose substep stands on the line of its own mark: two of them are no fan-out written in one heading
    const substeps = () => {
      const text = body.join('\n');
      let [line, from] = [head.i + 1, 0];
      return steps.map((step) => {
        for (let next = text.indexOf('\n', from); next >= 0 && next < step.at; next = text.indexOf('\n', from)) [line, from] = [line + 1, next + 1];
        return { ...base, line: line + 1, id: step.id, title: main.title, slug: main.slug, fields: step.fields, group: [step.id], doubts: step.doubts, prose: !head.own };
      });
    };
    if (head.prose === 'paragraph') {
      for (const named of head.ids.named) specs.push({ ...named, ...base, fields: paragraphOf(body), group: head.group, doubts: ['its fields are read from a prose paragraph'] });
      continue;
    }
    const columns = head.own && fieldColumns(head.own, head.group);
    if (columns) {
      for (const named of head.ids.named) {
        const column = columns.indexOf(named.id);
        const fields = columns.length ? (column < 0 ? {} : fieldsOf(head.own, column + 1)) : fieldsOf(head.own);
        specs.push({ ...named, ...base, fields, group: columns.length ? [named.id] : head.group, doubts: doubts(named), marks });
      }
      if (head.ids.unclaimed.length) partial(head.ids.unclaimed, `sub-ids the ${head.group[0]} heading names are not split into tasks (${at(head.i)})`);
      head.warned = head.ids.unclaimed;
    } else if (head.own) {
      for (const row of head.own.rows) {
        const fields = {};
        head.own.header.forEach((label, k) => {
          if (row.cells[k] !== undefined) assign(fields, label, row.cells[k], true);
        });
        for (const named of head.ids.named) specs.push({ ...named, ...base, fields, group: head.group, doubts: doubts(named), marks });
      }
    }
    // substeps written in the prose of a heading are tasks, under a field table too
    specs.push(...substeps());
  }
  for (const row of rows) specs.push({ ...row, dodIds, known });
  // R-4: a substep is a task whose id is the id of one projected task plus one `.word` or `-word` suffix. its
  // parent has the shorter id, so the tasks are read by the length of their ids and stay in the order of the plan
  const times = new Map();
  for (const spec of specs) times.set(spec.id, (times.get(spec.id) ?? 0) + 1);
  const built = new Map();
  const read = new Array(specs.length);
  for (const k of specs.map((_, n) => n).sort((a, b) => specs[a].id.length - specs[b].id.length)) {
    const { member, ...spec } = specs[k];
    const above = /^(.+)[.-][A-Za-z][A-Za-z0-9]*$/.exec(spec.id)?.[1];
    const parent = above !== undefined && times.get(above) === 1 ? built.get(above).task : null;
    read[k] = { ...taskOf({ ...spec, parent }), member: Boolean(member) };
    built.set(spec.id, read[k]);
  }
  read.sort((a, b) => a.task.line - b.task.line);
  const tasks = read.map((entry) => entry.task);
  // R-11: a task whose own heading, or a heading that encloses it, holds the word withdrawn may not be a live task: it
  // is projected and named. `said` holds, per heading, the line of the nearest such heading from itself up, or -1
  const said = [];
  const nest = [];
  heads.forEach((head, k) => {
    while (nest.length && heads[nest.at(-1)].level >= head.level) nest.pop();
    said.push(/\bwithdrawn\b/i.test(plain[head.i]) ? head.i : nest.length ? said[nest.at(-1)] : -1);
    nest.push(k);
  });
  let over = -1;
  for (const { task, reasons } of read) {
    while (over + 1 < heads.length && heads[over + 1].i < task.line) over += 1;
    if (over >= 0 && said[over] >= 0) reasons.push(`its heading or a heading above it says withdrawn (${at(said[over])}): it may not be a live task`);
    // R-13: an id that holds a placeholder stands for a template the graph cannot enumerate: the task is projected and named
    if (/[<{]/.test(task.id)) reasons.push('its id holds a placeholder: one graph task stands for a template the graph cannot enumerate');
  }
  const taskIds = new Set(tasks.map((task) => task.id));
  // only the human-gated checklist declares human steps, and a projected task id is never one
  const humanSteps = humanStepsOf(plain, skip).filter((id) => !taskIds.has(id));
  const human = new Set(humanSteps);
  const prefixes = new Set([...taskIds, ...humanSteps].map(prefixOf));
  // an id of a task family that is no task and no human step
  const unprojected = (id) => prefixes.has(prefixOf(id)) && !/^AC-/.test(id) && !taskIds.has(id) && !human.has(id);
  // a dotted substep id is read whole where the plan declares it: a task, an id cell, a template row not read
  const dotted = (id) => taskIds.has(id) || declared.has(id) || patterns.some((pattern) => pattern.test(id));

  // completeness, checked apart from how the headings were read. every id heading of a task family is a task,
  // unless it only groups tasks: a level-2 heading over its sub-ids (`## T-1 …` over `### T-1-source`), a heading
  // of any level over the deeper task headings of its sub-ids (`### T-1 build (logical group)` over `####
  // T-1-contracts`: its own text is keyed to no task, R-7), or a heading over a task table whose rows are the tasks
  const groups = (id) => tasks.some((task) => task.id.startsWith(`${id}-`) || task.id.startsWith(`${id}.`));
  // whether a deeper heading inside the section of the heading at line i projects a sub-id of this id as a task. the
  // section is walked from its own heading on: a plan of many headings costs each of them its own section only
  const order = new Map(heads.map((head, k) => [head.i, k]));
  const leads = (i, level, id) => {
    for (let k = order.has(i) ? order.get(i) + 1 : heads.findIndex((other) => other.i > i); k >= 0 && k < heads.length && heads[k].level > level; k += 1) {
      const other = heads[k];
      if (other.ids && projects(other) && other.group.some((sub) => sub.startsWith(`${id}-`) || sub.startsWith(`${id}.`))) return true;
    }
    return false;
  };
  // every table, read as written or inside a quote or a list item, and the lines they cover
  const strict = new Set(tables.map((table) => table.at));
  const everyTable = [...tables, ...tablesOf(plain, skip, unwrap).filter((candidate) => !strict.has(candidate.at))].sort((a, b) => a.at - b.at);
  const tabled = new Set(everyTable.flatMap((table) => [table.at, table.at + 1, ...table.rows.map((row) => row.at)]));
  // an id that is itself a task (a table row projects it) groups nothing: the text under its heading is that task's
  const container = (head) => head.group.some((id) => (head.level === 2 && groups(id)) || (!taskIds.has(id) && leads(head.i, head.level, id)));
  // the rows under the heading are its own ids or sub-ids: rows of another task do not make it a group
  const holdsRows = (head) => rows.some((row) => row.line - 1 > head.i && row.line - 1 < head.stop && head.group.some((id) => row.id === id || row.id.startsWith(`${id}-`) || row.id.startsWith(`${id}.`)));
  for (const head of idHeads.filter((candidate) => !projects(candidate) && !humanSection.has(candidate.i) && !container(candidate) && !holdsRows(candidate))) {
    // R-5a: a heading that starts with a placeholder id (`### T-R<n>-review`) and projects nothing is a template
    // reference, read like one that starts with `T-R{n}-review`: it names no task
    const named = head.group.filter((id) => !id.includes('<') || taskIds.has(id));
    if (!named.some((id) => prefixes.has(prefixOf(id)))) continue;
    // a task a table row projects, with a heading of its own: what stands under that heading is in no block
    if (named.every((id) => taskIds.has(id))) partial(named, `its heading has no field table: the text under it is in no block (${at(head.i)})`);
    else partial(named, `heading has no field table — not projected (${at(head.i)})`);
  }
  const counts = new Map();
  for (const task of tasks) counts.set(task.id, (counts.get(task.id) ?? 0) + 1);
  for (const [id, n] of counts) if (n > 1) partial(id, `projected ${n} times — ids must be unique`);
  // every field table and every task table belongs to a projected task: a second table under a task heading, a
  // table under a heading that names no task, a table inside a quote or a list item is named
  const owned = new Set(idHeads.filter(projects).map((head) => head.own));
  const under = (i) => idHeads.find((head) => projects(head) && head.i < i && i < head.end);
  const stray = (table, what) => {
    const head = under(table.at);
    if (head) partial(head.group, `a second ${what} under its heading is not projected (${at(table.at)})`);
    else partial(at(table.at), `${what} under no task heading — not projected`);
  };
  // the ids a template token stands for: `T-n.spec` → T-<any>.spec, `T-R{n}-fix` → T-R<any>-fix
  const membersOf = (token) => new RegExp(`^${token.split(/\{[^{}]*\}|<[^<>]*>|(?<=^[A-Z][A-Za-z]{0,4}-)[a-z](?![A-Za-z0-9])/).map(escape).join('[0-9A-Za-z]+')}$`);
  // a template of a task family that no projected task is a member of
  const unexpanded = (token) => {
    const members = membersOf(token);
    return prefixes.has(/^[A-Z][A-Za-z]{0,4}-?/.exec(token)?.[0] ?? '') && ![...taskIds].some((id) => members.test(id));
  };
  for (const table of everyTable) {
    const idAt = table.idAt;
    // R-5a: a table of id patterns holds no task, whatever its columns: a pattern in its id cell is named nowhere. an
    // id with no placeholder there is an id like any other: a task, a human step, or named
    const patterned = isPatternTable(table);
    if (owned.has(table)) continue;
    if (isFieldLike(table)) stray(table, 'field table');
    // a table of fields with no id column and no blockedBy, Requirement or files_owned is a roster, not tasks
    else if (isTaskTable(table) && !patterned && (idAt < 0 ? Boolean(under(table.at)) || fieldKeys(table.header).some((key) => TASK_ONLY.includes(key)) : !strict.has(table.at))) stray(table, 'task table');
    else if (idAt >= 0 && (patterned || !isTaskTable(table))) {
      // a task-family id in the id cell of any other table is a task or a human step
      const cells = table.rows.map((row) => bare(row.cells[idAt] ?? ''));
      const named = unique(cells.map((cell) => idAtStart(cell)).filter((id) => id && !(patterned && id.includes('<')) && unprojected(id)));
      if (named.length) partial(named, `named in an id cell but not projected (${at(table.at)})`);
      // a template row of a table that is no task table (`| Substep | owner | blockedBy |`) is in no task either
      const templates = patterned ? [] : unique(cells.filter(templateLike).map((cell) => /^[^\s,;]+/.exec(cell)[0]).filter(unexpanded));
      if (templates.length) partial(templates, `template(s) named in an id cell but not projected (${at(table.at)})`);
    }
  }
  // a line that reads as a table row and stands in no table (after a blank line, a prose line or a comment, under a
  // header with no delimiter row, written without its leading pipe) is in no task: one that starts with a
  // task-family id or names a field is named. a line outside every table and every task block that starts with the
  // id of a row task holds text for that task, and a row's block is its row: that text is in no block
  const rowIds = new Set(rows.map((row) => row.id));
  const keyed = new Map();
  const cut = new Map();
  // beside a table of row tasks, from the heading above it to the next heading, a sentence that names a row task is
  // keyed to it too (`Every substep is AFK. T-2.spec also checks the migrations.`, `Order: T-1 → T-2`), and a field
  // stated there for the rows (`Every task in this table is type: HITL.`, `All rows below are also blockedBy T-0.`)
  // is not read: a doubt on that field for every row of the table (R-7). a line between two tables stands under the
  // one and above the other
  const underRows = new Map();
  const aboveRows = new Map();
  const rowTables = tables.filter((table) => isTaskTable(table) && table.idAt >= 0 && !isPatternTable(table));
  const endOf = (table) => table.rows.at(-1)?.at ?? table.at + 1;
  rowTables.forEach((table, k) => {
    const to = Math.min(nextHead(table.at, () => true), rowTables[k + 1]?.at ?? Infinity);
    for (let i = endOf(table) + 1; i < to; i += 1) underRows.set(i, table);
    const from = Math.max((heads.findLast((head) => head.i < table.at) ?? { i: -1 }).i, k ? endOf(rowTables[k - 1]) : -1);
    for (let i = from + 1; i < table.at; i += 1) aboveRows.set(i, table);
  });
  const beside = (i) => underRows.has(i) || aboveRows.has(i);
  // beside its table a row task is named wherever its id stands in a line (`For T-2: …`, `blockedBy for T-3 is also
  // T-2`); anywhere else only by a line that starts with it
  const keyedIn = (i, text) => (beside(i) ? idsIn(bare(text), dotted) : [idAtStart(bare(text))]).filter((id) => id && rowIds.has(id));
  // the fields a prose line states: a name no word of prose shares (`blockedBy for T-3 is also T-2`), a label with
  // its colon, a name with its value right after it (`Every row is type HITL`), a label that opens a line about the
  // rows (`Phase for these rows: 2`), a bare AFK or HITL said of them (`Every row is HITL`). a word of prose that
  // happens to be a label (`holds the affected phase`) states nothing
  const namedIn = (line) => {
    const marked = [...line.matchAll(new RegExp(`(?<![\\w-])(?:(blocked ?by|files_owned|agent_type|evidence_producer|workKind)(?![\\w-])|(${FIELD_LABELS})\\**\`?\\s*[:=])`, 'gi'))].map((m) => keysOf((m[1] ?? m[2]).replace(/\s+/g, ''))[0]);
    const opens = /\b(?:rows?|tasks?|substeps?|table)\b/i.test(line) ? keysOf(new RegExp(`^\\s*(?:[-*+]\\s+)?\\**(${FIELD_LABELS})(?![\\w-])`, 'i').exec(line)?.[1] ?? '') : [];
    const typed = /(?<![\w-])(?:is|are|as)\s+[`*]*(?:AFK|HITL)(?![\w-])/.test(line) ? ['type'] : [];
    return unique([...marked, ...statedIn(line).map(([key]) => key), ...opens, ...typed].filter(Boolean));
  };

  const stated = { under: new Map(), above: new Map() };
  const loose = new Map();
  plain.forEach((line, i) => {
    if (skip.has(i) || tabled.has(i) || humanSection.has(i) || !line.trim() || /^#{1,6}\s/.test(line)) return;
    const inner = unwrap(line);
    const cells = splitCells(inner);
    const first = bare(cells[0] ?? '').replace(/<br\s*\/?>/gi, ' ').trim();
    const id = idAtStart(first);
    if (inner.startsWith('|') || cells.length > 2) {
      if (isRule(inner)) return;
      // the id may stand after a number (`| 3. T-3 c | …`) or in the cell after a column of numbers (`| 2 | T-3 c |
      // …` cut off a table with a `#` column); a cell after words (`| V-28 seal check | T-3 runs it |`) names no row
      const later = inner.startsWith('|') ? cells.slice(1, 3).filter((_, k) => cells.slice(0, k + 1).every((cell) => !/[A-Za-z]/.test(cell))).map((cell) => bare(cell).replace(/<br\s*\/?>/gi, ' ').trim()) : [];
      const orphan = [first, ...later].map((cell) => cell.replace(/^\(?#?\d+[.)]?\s+(?=[A-Z])/, '')).find((cell) => {
        const lead = idAtStart(cell);
        return lead ? prefixes.has(prefixOf(lead)) && !/^AC-/.test(lead) && !human.has(lead) : templateLike(cell) && prefixes.has(/^[A-Z][A-Za-z]{0,4}-?/.exec(cell)[0]);
      });
      if (orphan !== undefined) partial(at(i), `a table row outside any table — row not projected: "${orphan.slice(0, 60)}"`);
      else if (inner.startsWith('|') && keysOf(cells[0] ?? '').length) {
        const head = under(i) ?? i;
        cut.set(head, [...(cut.get(head) ?? []), i]);
      }
      return;
    }
    const named = unique(keyedIn(i, cells.join(' | ')));
    if (named.length && !under(i)) for (const each of named) keyed.set(each, [...(keyed.get(each) ?? []), i]);
    const labels = beside(i) && !(id && rowIds.has(id)) ? namedIn(line) : [];
    for (const [where, zone] of [['under', underRows], ['above', aboveRows]]) if (labels.length && !under(i) && zone.has(i)) stated[where].set(zone.get(i), [...(stated[where].get(zone.get(i)) ?? []), [i, labels]]);
    // a step written as a list item or a paragraph that starts with an id of a task family and is no task (`- T-5:
    // spec review — agent_type …; blockedBy T-1`) is in no task: named when it states a field or stands in no block
    const step = headingAt(plain, skip, i) ? null : idAtStart(first.replace(/^\[[ xX]\]\s+/, ''));
    const fields = Boolean(step) && unprojected(step) && namedIn(line).length > 0;
    if (step && unprojected(step) && (fields || !under(i))) loose.set(step, [...(loose.get(step) ?? []), [i, fields]]);
  });
  for (const [where, byTable] of Object.entries(stated)) {
    for (const [table, lines] of byTable) {
      const ids = rows.filter((row) => row.line - 1 > table.at && row.line - 1 <= (table.rows.at(-1)?.at ?? table.at)).map((row) => row.id);
      const labels = unique(lines.flatMap(([, keys]) => keys)).map((key) => MANDATORY[key] ?? (key === 'workkind' ? 'workKind' : 'blockedBy'));
      if (ids.length) partial(unique(ids), `${labels.join(', ')} is written on a prose line ${where} its table, which is not read (${lines.slice(0, 3).map(([i]) => at(i)).join(', ')})`);
    }
  }
  const places = (where) => `${where.slice(0, 3).map(at).join(', ')}${where.length > 3 ? ', …' : ''}`;
  for (const [head, where] of cut) partial(typeof head === 'number' ? at(head) : head.group, `${where.length} field row(s) outside any table — not projected (${places(where)})`);
  for (const [id, where] of keyed) partial(id, `text keyed to it stands outside its table row, in no block (${places(where)})`);
  for (const [id, where] of loose) partial(id, `a line starts with it and ${where.some(([, fields]) => fields) ? 'states fields of its own' : 'stands in no task block'} — not projected (${places(where.map(([i]) => i))})`);
  // every task-family id a heading names, at any level and any place in it, is a task or a human step. the ids an
  // id heading leads with are settled above; a level-2 heading groups the sub-ids of an id wherever it names it, and
  // so does a heading of any level over the deeper task headings of those sub-ids
  const byLine = new Map(idHeads.map((head) => [head.i, head]));
  plain.forEach((line, i) => {
    const heading = skip.has(i) ? null : headingAt(plain, skip, i);
    if (!heading) return;
    const head = byLine.get(i);
    const settled = new Set(head ? [...head.group, ...(head.warned ?? [])] : []);
    const { expanded, spans } = idSpans(heading.text, dotted);
    // R-5: an id that holds a placeholder (`T-R{n}-review`, `T-43-R<m>a`) is a template reference, not a task id: in a
    // heading that is no task heading it names no task. a conditional template stays outside the graph
    const reference = (span) => span.id.includes('<') || /^[{<]/.test(expanded.slice(span.end));
    const grouped = (id) => (heading.level === 2 && groups(id)) || leads(i, heading.level, id);
    const ids = unique(spans.filter((span) => !reference(span) && unprojected(span.id) && !settled.has(span.id) && !grouped(span.id)).map((span) => span.id));
    // a template over a variable the id grammar does not read (`### T-n.spec, n ∈ {1, 2}`) that no task expands
    const templates = [...heading.text.matchAll(/(?<![A-Za-z0-9.-])[A-Z][A-Za-z]{0,4}-[a-z](?![A-Za-z0-9])(?:[.-][A-Za-z0-9]+)*/g)].map((m) => m[0]).filter(unexpanded);
    const named = unique([...ids, ...templates]);
    if (named.length) partial(named, `named in a heading but not projected (${at(i)})`);
    // a heading that names a row task and does not hold its row (`#### Notes for T-2`): the text under it is keyed
    // to that task and stands in no block
    const to = nextHead(i, (other) => other.level <= heading.level);
    const apart = unique(spans.map((span) => span.id).filter((id) => rowIds.has(id) && !settled.has(id) && !rows.some((row) => row.id === id && row.line - 1 > i && row.line - 1 < to)));
    if (apart.length && !under(i)) partial(apart, `a heading names it outside its table row: the text under that heading is in no block (${at(i)})`);
  });

  const canonical = (id) => id.replace(/<[^<>]*>/g, '<>');
  const exact = new Set([...taskIds].map(canonical));
  for (const { task, depsText, reasons, member } of read) {
    if (depsText === null || !bare(depsText)) reasons.push('it has no blockedBy field');
    else if (isNone(depsText)) {
      // `none — once T-2 has merged`: a cell that starts with none and then names an id
      const named = unique(idsIn(depsText, dotted)).filter((id) => !/^AC-/.test(id) && id !== task.id);
      if (named.length) reasons.push(`blockedBy starts with none and then names ${named.join(', ')}`);
    } else {
      const { hard, conditional, aside, prose } = readDeps(depsText, task.id, dotted);
      const ids = idsIn(hard, dotted).filter((id) => !/^AC-/.test(id) && id !== task.id);
      const previous = ids.filter((id) => /<[^<>]*[−-]\s*1>/.test(id));
      const foreign = ids.filter((id) => !prefixes.has(prefixOf(id)));
      task.deps = unique(ids.filter((id) => prefixes.has(prefixOf(id)) && !previous.includes(id)));
      const commentary = aside.filter((id) => !/^AC-/.test(id) && id !== task.id && prefixes.has(prefixOf(id)));
      if (commentary.length) reasons.push(`blockedBy names ${commentary.join(', ')} only in an aside, left out of deps`);
      const inProse = prose.filter((id) => task.deps.includes(id));
      if (inProse.length) reasons.push(`blockedBy names ${inProse.join(', ')} inside prose, read as deps`);
      if (conditional.length) reasons.push(`conditional dependency(ies) left out of deps: ${conditional.join(', ')}`);
      if (previous.length) reasons.push(`previous-iteration dependency(ies) left out of deps: ${previous.join(', ')}`);
      if (foreign.length) reasons.push(`blockedBy names ${foreign.join(', ')}, of no task family`);
      if (!task.deps.length && !conditional.length && !previous.length && !foreign.length) reasons.push(`blockedBy names no task: "${bare(depsText).slice(0, 60)}"`);
      const ranged = task.deps.filter((dep) => !taskIds.has(dep) && !human.has(dep) && rangeLike(dep));
      if (ranged.length) reasons.push(`blockedBy names ${ranged.join(', ')}, which reads as a range or as a sub-id`);
      for (const dep of task.deps) {
        if (taskIds.has(dep) || human.has(dep)) continue;
        if (dep.includes('<')) reasons.push(`blockedBy names templated ${dep}`);
        // the plan declares it (a heading, a table-row id, a template row not read), names it as a step inside
        // the task it extends (`T-11a → T-11b` in T-11's block), or names the family of a templated task (T-39
        // for T-39-B<k>)
        else if (exact.has(canonical(dep)) || dotted(dep) || tasks.some((t) => dep !== t.id && dep.startsWith(t.id) && t.block.includes(dep)) || [...taskIds].some((id) => id.startsWith(`${dep}-`))) reasons.push(`blockedBy names ${dep}, which the plan names but does not project as a task`);
        // an id that exists only once the template row is expanded (`T-n-1` → T-2-1) is a doubt, never an unknown id
        else if (member) reasons.push(`blockedBy names ${dep}, which its template row gives and no task has`);
      }
    }
  }
  // one line per task and reason; the members of one template row share theirs
  const lines = [];
  const shared = new Map();
  for (const { task, reasons, member } of read) {
    for (const why of unique(reasons)) {
      const key = `${task.line} ${why}`;
      if (member && shared.has(key)) shared.get(key).push(task.id);
      else {
        lines.push({ ids: [task.id], why });
        if (member) shared.set(key, lines.at(-1).ids);
      }
    }
  }
  for (const { ids, why } of lines) partial(ids, why);
  if (!tasks.length) partial('team-plan.md', 'no task could be projected');
  if (dod !== null && !dodAcs) warnings.push('definition-of-done.md has no AC table with id, kind and blocking columns');
  if (front.unclosed) partial('team-plan.md', 'its frontmatter opens and does not close — latitude and autonomy are not taken from it');
  // whatever follows a fence or a comment that never closes is read as its content: a task there is not projected
  for (const [what, line] of unclosed) partial('team-plan.md', `a ${what} opened at ${at(line)} never closes — what follows it is not projected`);
  // a fence that holds a line opening a fence of its own ends where that one closes: what stands between that line
  // and the next fence marker may be read as code, or code as plan
  for (const [fence, line] of nested) partial('team-plan.md', `the code fence opened at ${at(fence)} holds a line that opens a fence of its own (${at(line)}) — where it ends is not certain`);

  // R-1: autonomy is the frontmatter key when the frontmatter has one, else the plan's one `autonomy:` block outside
  // it, written in a code fence or not. two of them there, one that differs from the frontmatter and two frontmatter
  // keys that differ are no certain reading; so is a line of prose or a key with nothing under it. a line indented
  // under prose is no block, and an html comment holds none
  const starts = plain.flatMap((line, i) => (i > front.end && !comments.has(i) && line.startsWith('autonomy:') ? [i] : []));
  const blockAt = (i) => yamlBlock(plain.slice(i), 'autonomy');
  const same = (block) => block.split('\n').map((line) => line.trim()).filter(Boolean).join('\n');
  const inFront = yamlBlock(front.lines, 'autonomy');
  const first = starts.length ? blockAt(starts[0]) : null;
  const prose = first !== null && !first.includes('\n') && !/^autonomy:\s*\S+$/.test(first.trim());
  const autonomy = inFront ?? (prose ? null : first);
  if (inFront === null) {
    if (prose) partial('team-plan.md', `autonomy is written as a line of prose, not as a block (${at(starts[0])}) — not taken`);
    else if (starts.length > 1) partial('team-plan.md', `autonomy is written ${starts.length} times in the body (${starts.map(at).join(', ')}) — the first is taken`);
  } else {
    // front.lines starts at the second line of the plan
    const again = front.lines.flatMap((line, i) => (line.startsWith('autonomy:') && same(yamlBlock(front.lines.slice(i), 'autonomy')) !== same(inFront) ? [i + 1] : []));
    if (again.length) partial('team-plan.md', `autonomy is written twice in the frontmatter, differently (${at(again[0])}) — the first is taken`);
    // stated in the frontmatter and again, differently, in the body: which one holds is a reader's call
    const other = starts.find((i) => same(blockAt(i)) !== same(inFront));
    if (other !== undefined) partial('team-plan.md', `autonomy is written in the frontmatter and again, differently, in the body (${at(other)}) — the frontmatter is taken`);
  }
  return {
    schema: SCHEMA,
    session,
    plan: { path, sha256: createHash('sha256').update(text).digest('hex'), bytes: Buffer.byteLength(text) },
    phases: unique(tasks.map((task) => task.phase).filter((phase) => phase !== null)),
    tasks,
    hitl: tasks.filter((task) => task.type === 'HITL').map((task) => task.id),
    humanSteps,
    latitude: yamlBlock(front.lines, 'latitude'),
    autonomy,
    runWatch: runWatchOf(runWatch, [...taskIds]),
    warnings,
  };
};

const usage = (why) => ({ code: EXIT.USAGE, lines: [`USAGE: ${why}`, USAGE] });

// the graph of a session dir, or a usage result. `roster` replaces the agent definitions read from the checkout
export const projectSession = (sessionDir, { roster } = {}) => {
  if (typeof sessionDir !== 'string' || !isAbsolute(sessionDir)) return usage('session dir must be an absolute path');
  let stat = null;
  try {
    stat = statSync(sessionDir);
  } catch {
    stat = null;
  }
  if (!stat?.isDirectory()) return usage(`session dir not found: ${sessionDir}`);
  const session = resolve(sessionDir);
  const path = join(session, 'team-plan.md');
  const text = readText(path);
  const extra = { runWatch: readText(join(session, 'run-watch.md')), dod: readText(join(session, 'definition-of-done.md')) };
  let graph = null;
  try {
    graph = projectText({ text: text ?? '', session, path, ...extra, roster: roster === undefined ? rosterOf(session) : roster });
  } catch (error) {
    // an error of this script is no defect of the plan: the projection is partial, never a crash
    graph = { ...projectText({ text: '', session, path }), warnings: [`${PARTIAL}team-plan.md — internal error: ${error?.message ?? error}`] };
    graph.plan = { path, sha256: createHash('sha256').update(text ?? '').digest('hex'), bytes: Buffer.byteLength(text ?? '') };
  }
  if (text === null) {
    graph.plan = { path, sha256: null, bytes: 0 };
    graph.warnings.unshift(`${PARTIAL}team-plan.md — missing or unreadable`);
  }
  return { code: EXIT.OK, graph };
};

export const parseArgs = (argv) => {
  const opts = {};
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--out') {
      if (!argv[i + 1]) return { error: '--out needs a file' };
      opts.out = argv[(i += 1)];
    } else if (argv[i].startsWith('-')) return { error: `unknown flag: ${argv[i]}` };
    else positional.push(argv[i]);
  }
  if (positional.length !== 1) return { error: positional.length ? `extra argument: ${positional.slice(1).join(' ')}` : 'session dir missing' };
  return { sessionDir: positional[0], opts };
};

// print the graph, or write it to the --out file. a file that cannot be written is a wrong --out, not a projection:
// the caller gets a usage result, never an exit 0 with no file
const emit = (result, out) => {
  const json = `${JSON.stringify(result.graph, null, 2)}\n`;
  if (!out) {
    process.stdout.write(json);
    return result;
  }
  try {
    mkdirSync(dirname(resolve(out)), { recursive: true });
    writeFileSync(out, json);
    return result;
  } catch (error) {
    return usage(`--out file cannot be written: ${error?.message ?? error}`);
  }
};

if (isMain()) {
  try {
    if (contract.error) throw contract.error;
    const parsed = parseArgs(process.argv.slice(2));
    const projected = parsed.error ? usage(parsed.error) : projectSession(parsed.sessionDir);
    const result = projected.code === EXIT.OK ? emit(projected, parsed.opts.out) : projected;
    if (result.code === EXIT.USAGE) for (const line of result.lines) console.error(line);
    process.exitCode = result.code;
  } catch (error) {
    // never a stack and never a failing exit for an error of this script; the first line of its message says it
    console.error(`WARN: ${PARTIAL}project-plan.mjs — internal error: ${String(error?.message ?? error).split('\n')[0]}`);
    process.exitCode = EXIT.OK;
  }
}
