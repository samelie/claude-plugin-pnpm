#!/usr/bin/env node
// structural check of the run graph project-plan.mjs makes of a session (team-kit-create step 7, team-kit-run
// AUTHOR step). three outcomes. FAIL (exit 1): a defect certain from the plan's text: a task with no
// requirement, a blocking AC no task maps to, a dependency on an unknown id, a dependency cycle, two tasks that
// can run in parallel owning an overlapping path, a task with no AFK / HITL type. PARTIAL (exit 0, the line
// `WARN: partial projection — author from team-plan.md`): anything read with less than certainty, an error of
// these scripts included. OK (exit 0, `OK: run graph …`): every task heading, field table and task-table row
// projected once and every reference resolved; only then may a run author from the graph. with --graph, also
// that the graph file still equals the plan in every key; a file of another schema, or one that differs only in
// its session dir, plan path or warnings, is partial. read-only.
// node check-run-graph.mjs <abs session dir> [--graph <file>]    exit 0 pass or partial, 1 at least one FAIL, 2 usage

import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// realpath: node resolves the entry's symlinks in import.meta.url, and a mismatch would skip the gate with exit 0
const isMain = () => {
  try {
    return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
};
// a sibling module that is missing or does not load is an error of these scripts, never a defect of the plan: the
// entry point reports it as partial, exit 0, no stack. imported by another module, the error is that module's
const siblings = await Promise.all([import('./check-contract.mjs'), import('./project-plan.mjs')]).catch((error) => (isMain() ? { error } : Promise.reject(error)));
const [{ parseAcs, splitCells }, { PARTIAL = 'partial: ', acKey, declaredIds, idsIn, ownedBy, prefixOf, projectSession }] = siblings.error ? [{}, {}] : siblings;

export const USAGE = 'usage: check-run-graph.mjs <abs session dir> [--graph <file>]';
export const PARTIAL_LINE = 'WARN: partial projection — author from team-plan.md';
// a graph file written by a projector of another schema: nothing in it is compared
export const OLD_GRAPH_LINE = 'WARN: partial — graph file is from an older projector, re-project';
const EXIT = Object.freeze({ OK: 0, FAIL: 1, USAGE: 2 });
// failures name at most this many items, then an ellipsis
const NAME_LIMIT = 5;
const named = (items) => [...items.slice(0, NAME_LIMIT), ...(items.length > NAME_LIMIT ? ['…'] : [])].join(', ');
const unique = (items) => [...new Set(items)];
const usage = (why) => ({ code: EXIT.USAGE, lines: [`USAGE: ${why}`, USAGE] });
const readText = (path) => {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
};

// every alternative of a brace pattern: a/{b,c}.ts → a/b.ts, a/c.ts. null when there are more than `limit`: nine
// groups of eight are 134 million paths, which no plan owns one by one
export const expandBraces = (glob, limit = Infinity) => {
  const done = [];
  const open = [glob];
  while (open.length) {
    const each = open.pop();
    const m = /\{([^{}]*)\}/.exec(each);
    if (!m) done.push(each);
    else for (const alt of m[1].split(',').reverse()) open.push(`${each.slice(0, m.index)}${alt}${each.slice(m.index + m[0].length)}`);
    // every pattern still open gives at least one path
    if (done.length + open.length > limit) return null;
  }
  return done;
};
// the alternatives one task's owned patterns may expand to before its overlaps are left unchecked
const BRACE_LIMIT = 1024;
// the tasks a graph may hold before the checks that compare each with each are left out: no plan is this long
const TASK_LIMIT = 4000;
// the pairs of owned patterns the overlap check may compare before it is left out: 3,900 tasks of eight paths each
// are 486 million pairs, which take minutes
const PATTERN_LIMIT = 50000000;
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// one spelling per path: repo-relative, the session dir as one token, lower case (the checkout sits on a
// case-insensitive volume)
export const normalizerOf = ({ repo = null, session = null } = {}) => {
  const sessionForms = [session && escape(session), repo && session?.startsWith(`${repo}/`) && escape(session.slice(repo.length + 1)), '<session>', '\\$\\{?ABS_SESSION\\}?'].filter(Boolean);
  const sessionRe = new RegExp(`^(?:${sessionForms.map((form) => (form === '<session>' ? '<session>' : form)).join('|')})(?=/|$)`);
  // `asWritten` keeps the case, for a message; paths are compared in lower case
  return (glob, asWritten = false) => {
    let path = glob.trim().replace(/^\.\//, '');
    path = path.replace(sessionRe, '<session>');
    for (const root of [repo, '$REPO', '${REPO}'].filter(Boolean)) if (path.startsWith(`${root}/`)) path = path.slice(root.length + 1).replace(sessionRe, '<session>');
    return asWritten ? path : path.toLowerCase();
  };
};
// the checkout these scripts sit in: .claude/skills/team-kit-create/scripts
const CHECKOUT = (() => {
  try {
    return dirname(dirname(dirname(dirname(dirname(realpathSync(fileURLToPath(import.meta.url)))))));
  } catch {
    return null;
  }
})();
// R-10: the checkout a session sits in, whose root an absolute owned path is compared from: the nearest directory,
// from the session up, that holds a .claude, the way the projector finds the roster, so a staged copy of this script
// and the installed one read the same paths. the checkout these scripts sit in when none does
export const checkoutOf = (session) => {
  for (let dir = session; ; dir = dirname(dir)) {
    if (existsSync(join(dir, '.claude'))) return dir;
    if (dir === dirname(dir)) return CHECKOUT;
  }
};
const WILD = /[*?[]/;
// whether two path segments can name the same name: equal literals, or compatible text before the first
// wildcard and after the last one
const segmentsOverlap = (p, q) => {
  if (!WILD.test(p) && !WILD.test(q)) return p === q;
  const head = (s) => s.slice(0, s.search(WILD) < 0 ? s.length : s.search(WILD));
  const tail = (s) => (WILD.test(s) ? s.slice(Math.max(s.lastIndexOf('*'), s.lastIndexOf('?'), s.lastIndexOf(']')) + 1) : s);
  const [hp, hq, tp, tq] = [head(p), head(q), tail(p), tail(q)];
  return (hp.startsWith(hq) || hq.startsWith(hp)) && (tp.endsWith(tq) || tq.endsWith(tp));
};
// a trailing slash owns the directory: dir/ reads as dir/**
const segmentsOf = (glob) => glob.replace(/\/$/, '/**').split('/').filter(Boolean);
// whether two owned patterns (already normalised) can name the same path. a ** facing a ** consumes its
// partner, so `a/**/x-*/**` and `a/**/y-*/**` stay apart as their author meant
export const globsOverlap = (a, b) => {
  const [x, y] = [segmentsOf(a), segmentsOf(b)];
  // each pair of places is walked once: many ** against many segments would otherwise branch without end
  const seen = new Map();
  const step = (i, j) => {
    if (i === x.length && j === y.length) return true;
    if (x[i] === '**' && y[j] === '**') return walk(i + 1, j + 1);
    if (x[i] === '**') return walk(i + 1, j) || (j < y.length && walk(i, j + 1));
    if (y[j] === '**') return walk(i, j + 1) || (i < x.length && walk(i + 1, j));
    if (i === x.length || j === y.length) return false;
    return segmentsOverlap(x[i], y[j]) && walk(i + 1, j + 1);
  };
  const walk = (i, j) => {
    const key = i * (y.length + 1) + j;
    if (!seen.has(key)) seen.set(key, step(i, j));
    return seen.get(key);
  };
  return walk(0, 0);
};

// the first cycle of the task graph as a list of ids, or null
export const findCycle = (tasks) => {
  const deps = new Map(tasks.map((task) => [task.id, task.deps.filter((dep) => tasks.some((other) => other.id === dep))]));
  const state = new Map();
  const stack = [];
  const visit = (id) => {
    state.set(id, 'open');
    stack.push(id);
    for (const dep of deps.get(id) ?? []) {
      if (state.get(dep) === 'open') return [...stack.slice(stack.indexOf(dep)), dep];
      if (!state.has(dep)) {
        const found = visit(dep);
        if (found) return found;
      }
    }
    stack.pop();
    state.set(id, 'done');
    return null;
  };
  for (const { id } of tasks) {
    if (state.has(id)) continue;
    const found = visit(id);
    if (found) return found;
  }
  return null;
};

// a templated id matches its instances: T-43-R<m−1>a and T-43-R<m>a are one family member
export const canonical = (id) => id.replace(/<[^<>]*>/g, '<>');
// the tasks a dependency names: the task itself, the task a sub-id belongs to (T-18-fix-n → T-18), or every
// member of a family it names (T-39 → T-39-B<k>)
export const resolveDep = (dep, tasks) => {
  const key = canonical(dep);
  const exact = tasks.filter((task) => canonical(task.id) === key);
  if (exact.length) return exact.map((task) => task.id);
  const owner = tasks.filter((task) => key.startsWith(`${canonical(task.id)}-`)).sort((a, b) => b.id.length - a.id.length)[0];
  if (owner) return [owner.id];
  return tasks.filter((task) => canonical(task.id).startsWith(`${key}-`)).map((task) => task.id);
};
// the graph with every dependency resolved to task ids; human steps and unknown ids drop out
const resolved = (tasks) => tasks.map((task) => ({ ...task, deps: unique(task.deps.flatMap((dep) => resolveDep(dep, tasks)).filter((id) => id !== task.id)) }));

// for each task, every task it waits on, directly or through others
const ancestorsOf = (tasks) => {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const memo = new Map();
  const walk = (id) => {
    if (memo.has(id)) return memo.get(id);
    const all = new Set();
    memo.set(id, all);
    for (const dep of byId.get(id)?.deps ?? []) {
      if (!byId.has(dep)) continue;
      all.add(dep);
      for (const up of walk(dep)) all.add(up);
    }
    return all;
  };
  for (const { id } of tasks) walk(id);
  return memo;
};

// the cell of one column of each AC row (by AC id), from the tables parseAcs reads
export const columnOf = (dod, name) => {
  const cells = new Map();
  let at = -1;
  for (const line of dod.split(/\r?\n/).map((row) => row.trimStart())) {
    if (!line.startsWith('|')) {
      at = line.trim() ? -1 : at;
      continue;
    }
    const cellsOf = splitCells(line);
    const header = cellsOf.map((cell) => cell.toLowerCase());
    if (['id', 'kind', 'blocking'].every((label) => header.includes(label))) {
      at = header.indexOf(name);
      continue;
    }
    if (at >= 0 && cellsOf[0] && !cellsOf.every((cell) => /^:?-+:?$/.test(cell))) cells.set(acKey(cellsOf[0].replace(/[*`]/g, '')), cellsOf[at] ?? '');
  }
  return cells;
};
export const mapsToOf = (dod) => columnOf(dod, 'maps_to');

// the owner a task writes as: its agent cell, its agent_type where it writes no agent (a substep owes one of the
// two), and one lead for every undispatched step, the orchestrator's and the human's alike
const ownerOf = (task) => (task.kind === 'lead' ? 'lead' : (task.agent ?? task.agentType ?? '').toLowerCase().replace(/\s+/g, ' ').trim());
// `Phase 1` and `1` are one phase: the label as the plan writes it, compared in lower case
const phaseLabel = (task) => (task.phase ?? '').replace(/[*`]/g, '').trim().replace(/^phase\s+/i, '');
// R-8: the id token a phase label leads with, as [family, id]. `1 build`, `01`, `1.`, `P1`, `Ph1`, `Phase-1` and `#1`
// lead with the number 1; `A — build` with the letter a; `W1 build`, `Wave 1 review` and `gate G2` with ['w', 1],
// ['wave', 1] and ['gate g', 2]. `build`, `implement` and `a build phase` lead with none
const phaseLead = (label) => {
  const number = /^(?:phase|ph|p)?[\s#._:-]*(\d+)/i.exec(label);
  if (number) return ['', Number(number[1])];
  const letter = /^([A-Z])(?![A-Za-z0-9])|^([a-z])(?=$|\s*[—–:.)-])/.exec(label);
  if (letter) return ['a', (letter[1] ?? letter[2]).toLowerCase()];
  const code = /^([A-Za-z]+(?:[\s#._:-]+[A-Za-z]{1,3})?)[\s#._:-]*(\d+)/.exec(label);
  return code ? [code[1].toLowerCase().replace(/[\s#._:-]+/g, ' '), Number(code[2])] : null;
};
// two labels that differ are certain to name two phases when they lead with two id tokens of one family that differ
// (`1` and `2 review`, `A` and `B`, `Wave 1` and `Wave 2`), or when neither leads with one and each holds a word the
// other lacks (`implement` and `review`). one token with two tails (`A — build` and `A — review`, `1` and `1 build`),
// tokens of two families (`P1` and `1` are one token; `W1` and `1`, `1` and `I`), `1` and `build`, `build` and
// `build (W1)` may name one phase
const phasesApart = (a, b) => {
  const [x, y] = [phaseLead(a), phaseLead(b)];
  if (x && y) return x[0] === y[0] && x[1] !== y[1];
  if (x || y) return false;
  const [p, q] = [a, b].map((label) => label.toLowerCase().match(/[a-z0-9]+/g) ?? []);
  return p.some((word) => !q.includes(word)) && q.some((word) => !p.includes(word));
};
// a maps_to cell that names the create lane, whose ACs no run task owes: `create`, `create lane (D-8)`, `create:
// design.md (C-6)`, `no run task`. the word inside a sentence (`the coder will create it`) names no lane
const CREATE_LANE = /^(?:[—–-]\s*)?create(?:[- ](?:lane|seal|chain))?\s*(?:$|[:;,.(—–-])|(?<![\w-])create[- ]lane(?![\w-])|(?<![\w-])no run (?:task|effect)(?![\w-])/i;
// the fields a partial warning doubts, by its wording; a warning that names no field doubts the whole task. `guess`:
// the owned paths were read by a guess (a cell split by position, shared with other fields or by sub-ids)
const FIELD_WORDS = [
  ['requirement', /requirement/i],
  ['type', /\btype\b/i],
  ['deps', /blockedby|dependenc|\bdeps\b/i],
  ['files', /files_owned/i],
  ['guess', /files_owned\b.*(?:split by|shares a cell)/i],
  ['phase', /\bphase\b/i],
  ['agent', /\bagent(_type)?\b/i],
];
const OTHER_FIELDS = /\b(verify|evidence_producer|workkind|estimated)\b/i;
// task id → the fields doubted for it: `partial: T-1, T-2 — why`
export const doubtsOf = (warnings) => {
  const doubts = new Map();
  for (const warning of warnings.filter((w) => w.startsWith(PARTIAL))) {
    const [ids, why = ''] = warning.slice(PARTIAL.length).split(' — ');
    const fields = FIELD_WORDS.filter(([, pattern]) => pattern.test(why)).map(([field]) => field);
    const which = fields.length ? fields : OTHER_FIELDS.test(why) ? ['other'] : ['all'];
    for (const id of ids.split(', ')) doubts.set(id, new Set([...(doubts.get(id) ?? []), ...which]));
  }
  return doubts;
};

// the lines of a graph: FAIL for what is certain, WARN partial for what is not; dod is the definition-of-done.md
// text or null, plan the team-plan.md text
export const checkGraph = (graph, dod = null, plan = '') => {
  const lines = graph.warnings.map((warning) => `WARN: ${warning}`);
  const doubt = (why) => lines.push(`WARN: ${PARTIAL}${why}`);
  const { tasks } = graph;
  if (!tasks.length) return lines;
  // a doubt is per field: a requirement read with doubt leaves the task's type, owned paths and deps checked
  const doubts = doubtsOf(graph.warnings);
  const doubtOn = (id, ...fields) => Boolean(doubts.get(id)?.has('all') || fields.some((field) => doubts.get(id)?.has(field)));
  // a task, table or row the parser could not read, or a Requirement it read with doubt, may be what maps an AC
  const coverageDoubt = graph.warnings.some((w) => w.startsWith(PARTIAL) && /not projected|projected \d+ times|not split into tasks/.test(w)) || tasks.some((task) => doubtOn(task.id, 'requirement'));
  const ids = new Set(tasks.map((task) => task.id));
  const human = new Set(graph.humanSteps);

  const noRequirement = tasks.filter((task) => !doubtOn(task.id, 'requirement') && !task.requirement.length).map((task) => task.id);
  if (noRequirement.length) lines.push(`FAIL: ${noRequirement.length} task(s) with no Requirement (${named(noRequirement)}) — map every task to at least one AC`);
  const noType = tasks.filter((task) => !doubtOn(task.id, 'type') && !task.type).map((task) => task.id);
  if (noType.length) lines.push(`FAIL: ${noType.length} task(s) with no AFK / HITL type (${named(noType)}) — write type AFK or HITL`);

  const declared = new Set([...declaredIds(plan)].map(canonical));
  const exact = new Set(tasks.map((task) => canonical(task.id)));
  const unknown = [];
  // the projector doubts the deps of a task whose dependency the plan declares or names as a step; any other
  // id that is no task and no human step is unknown, however often prose mentions it
  for (const task of tasks.filter((t) => !doubtOn(t.id, 'deps'))) {
    for (const dep of task.deps) {
      if (human.has(dep) || exact.has(canonical(dep))) continue;
      if (declared.has(canonical(dep))) {
        doubt(`${task.id} → ${dep}: the plan declares ${dep} but projects no task for it`);
        continue;
      }
      unknown.push(`${task.id} → ${dep}`);
    }
  }
  if (unknown.length) lines.push(`FAIL: ${unknown.length} dependency(ies) on an unknown id (${named(unknown)}) — name a task of this plan or a step of its human-gated checklist`);

  // the cycle and overlap checks compare every task with every other: past this many they are not run, a doubt
  const large = tasks.length > TASK_LIMIT;
  if (large) doubt(`${tasks.length} tasks, more than ${TASK_LIMIT} — the cycle and overlap checks are not run`);
  const graphOf = large ? [] : resolved(tasks);
  const cycle = findCycle(graphOf);
  if (cycle && cycle.every((id) => !doubtOn(id, 'deps'))) lines.push(`FAIL: dependency cycle ${cycle.join(' → ')} — break it in blockedBy`);
  else if (!large) {
    if (cycle) doubt(`dependency cycle ${cycle.join(' → ')} runs through a task read with less than certainty`);
    const repo = graph.session ? checkoutOf(graph.session) : CHECKOUT;
    const normal = normalizerOf({ repo, session: graph.session });
    const ancestors = ancestorsOf(cycle ? graphOf.map((task) => ({ ...task, deps: [] })) : graphOf);
    const overlaps = [];
    const shared = [];
    const phased = [];
    const worded = [];
    // each owned pattern as compared (lower case) and as shown; a task whose brace patterns expand past the limit
    // has its overlaps left unchecked, which is a doubt
    const wide = [];
    const globs = new Map();
    const expand = (patterns) => {
      const all = [];
      for (const glob of patterns) {
        const each = expandBraces(glob, BRACE_LIMIT - all.length);
        if (each === null) return null;
        all.push(...each);
      }
      return all;
    };
    for (const task of tasks) {
      const all = expand(task.filesOwned);
      if (all === null) wide.push(task.id);
      globs.set(task.id, (all ?? []).map((glob) => ({ key: normal(glob), text: normal(glob, true) })));
    }
    if (wide.length) doubt(`${wide.length} task(s) whose files_owned brace patterns expand to more than ${BRACE_LIMIT} paths (${named(wide)}) — their overlaps are not checked`);
    // several ids written in one heading or one cell share a line and are one declared fan-out; the rows of a task
    // table and the prose substeps of a heading stand each on their own line, and two substeps written on one
    // line of prose are no fan-out
    const planLines = plan.split(/\r?\n/);
    const fanOut = (a, b) => a.line === b.line && (!plan || /^\s*(?:#{1,6}\s|\|)/.test(planLines[a.line - 1] ?? ''));
    // R-3: a files_owned doubt says the list may be incomplete: the spans read outside asides still take part, so an
    // overlap between two paths that were read is reported. two kinds stay out: a cell split by a guess may hold
    // another task's paths, and a cell with no backtick span names its paths in bare words. R-3a: the overlap is a
    // certain defect only between two clean cells, backtick spans and separators and nothing else. where either cell
    // holds an aside or words beside its spans, whatever they say (`src/** (no edits)`, `src/** except src/b/**`), a
    // span may not be owned: that overlap is named as a doubt, with or without a doubt on the field
    const read = tasks.map((task) => (task.filesOwnedText || doubtOn(task.id, 'files') ? ownedBy(task.filesOwnedText) : 'spans'));
    const out = tasks.map((task, k) => doubtOn(task.id, 'phase', 'agent', 'deps', 'guess') || read[k] === 'none' || wide.includes(task.id));
    const labels = tasks.map(phaseLabel);
    const sizes = tasks.map((task, k) => (out[k] ? 0 : globs.get(task.id).length));
    const total = sizes.reduce((sum, size) => sum + size, 0);
    const compared = (total * total - sizes.reduce((sum, size) => sum + size * size, 0)) / 2;
    if (compared > PATTERN_LIMIT) doubt(`${total} owned patterns in ${tasks.length} tasks, more than ${PATTERN_LIMIT} pairs to compare — the overlap check is not run`);
    for (let i = 0; i < tasks.length && compared <= PATTERN_LIMIT; i += 1) {
      for (let j = i + 1; j < tasks.length; j += 1) {
        const [a, b] = [tasks[i], tasks[j]];
        const [pa, pb] = [labels[i].toLowerCase(), labels[j].toLowerCase()];
        // phases run in order (FRAMEWORK.md → phases are sequential). two labels that differ and may still name
        // one phase (`P1` and `1`, `1` and `1 build`) are not certain to: their overlap is a doubt, never skipped
        const onePhase = pa && pb && pa !== pb && !phasesApart(labels[i], labels[j]);
        if (out[i] || out[j] || fanOut(a, b) || (pa && pb && pa !== pb && !onePhase)) continue;
        if (cycle || ancestors.get(a.id).has(b.id) || ancestors.get(b.id).has(a.id)) continue;
        const pair = globs.get(a.id).flatMap((x) => globs.get(b.id).filter((y) => globsOverlap(x.key, y.key)).map((y) => (x.text === y.text ? x.text : `${x.text} ~ ${y.text}`)));
        if (!pair.length) continue;
        // one owner's two tasks may run one after the other: not certain to collide
        (onePhase ? phased : ownerOf(a) === ownerOf(b) ? shared : read[i] === 'words' || read[j] === 'words' ? worded : overlaps).push(`${a.id} + ${b.id}: ${pair[0]}`);
      }
    }
    if (overlaps.length) lines.push(`FAIL: ${overlaps.length} pair(s) of tasks that can run in parallel own an overlapping path (${named(overlaps)}) — order them with blockedBy or split files_owned`);
    if (shared.length) doubt(`${shared.length} pair(s) of one owner's unordered tasks own an overlapping path (${named(shared)})`);
    if (phased.length) doubt(`${phased.length} pair(s) of tasks own an overlapping path and write their phase in two ways that may name one phase (${named(phased)})`);
    if (worded.length) doubt(`${worded.length} pair(s) of tasks that can run in parallel own an overlapping path, one of them beside words that may say it is not owned (${named(worded)})`);
  }

  if (dod === null) doubt('no definition-of-done.md — blocking AC coverage not checked');
  else {
    const acs = parseAcs(dod);
    if (!acs) doubt('definition-of-done.md has no AC table with id, kind and blocking columns — blocking AC coverage not checked');
    else {
      const mapsTo = mapsToOf(dod);
      const mapped = new Set(tasks.flatMap((task) => task.acs));
      const families = new Set([...ids, ...human].map(prefixOf));
      const orphans = [];
      const unsure = [];
      // a blocking cell spelled `Y` or `blocking` is blocking, `N` is not; any other cell parseAcs cannot read is
      // a doubt
      const spelled = columnOf(dod, 'blocking');
      const cellOf = (row) => (spelled.get(acKey(row.id)) ?? '').replace(/[*`]/g, '').trim();
      const isBlocking = (row) => row.blocking || /^(?:y|blocking)$/i.test(cellOf(row));
      const unread = acs.filter((row) => row.unread && !isBlocking(row) && !/^n$/i.test(cellOf(row))).map((row) => acKey(row.id));
      if (unread.length) doubt(`${unread.length} AC row(s) whose blocking cell is not read (${named(unread)})`);
      for (const ac of acs.filter(isBlocking)) {
        const key = acKey(ac.id);
        const cell = (mapsTo.get(key) ?? '').replace(/[*`]/g, '').trim();
        // the grade-seal-gate row is closed by the seal, a create-lane AC by the create lane: no run task owes them.
        // a cell that also names an id of a task family which is no task (`T-9 (create the parser)`) is not understood
        const stray = idsIn(cell).some((id) => families.has(prefixOf(id)) && !ids.has(id) && !human.has(id));
        if (mapped.has(key) || /grade-seal-gate/i.test(ac.id) || (!stray && CREATE_LANE.test(cell))) continue;
        if (idsIn(cell).some((id) => ids.has(id))) continue;
        // an AC whose id is no id-shaped token (`constructor`) cannot be matched in a Requirement: a doubt
        (!cell || /^(none|n\/a|—|-)$/i.test(cell)) && !coverageDoubt && idsIn(key).length ? orphans.push(key) : unsure.push(key);
      }
      if (orphans.length) lines.push(`FAIL: ${orphans.length} blocking AC(s) no task maps to (${named(orphans)}) — name each in the Requirement of the task that delivers it, or that task in its maps_to`);
      if (unsure.length) doubt(`${unsure.length} blocking AC(s) map to no projected task by id (${named(unsure)})`);
    }
  }
  return lines;
};

// json with object keys sorted, so a graph file rewritten with its keys in another order is the same graph
export const stable = (value) =>
  JSON.stringify(value, (_, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]])) : v));

// the drift lines between a graph file and the current projection. a file of another schema is from an older
// projector: a doubt, never a defect. on a file of this schema every key is compared: the whole of every task,
// their order, every graph-level key, and any key the projector does not write
export const driftOf = (saved, graph) => {
  const lines = [];
  if (!saved || typeof saved !== 'object' || Array.isArray(saved) || !Object.hasOwn(saved, 'schema')) return ['FAIL: the graph file is not a run graph — re-project'];
  if (saved.schema !== graph.schema) return [OLD_GRAPH_LINE];
  if (!Array.isArray(saved.tasks)) return [`FAIL: the graph file is not a schema ${graph.schema} run graph — re-project`];
  const edited = saved.plan?.sha256 !== undefined && saved.plan.sha256 !== graph.plan.sha256;
  if (edited) lines.push('FAIL: team-plan.md changed since the graph file was projected (sha256 differs) — re-project');
  const keyOf = (tasks) => tasks.map((task) => task?.id);
  const dupes = (tasks) => unique(keyOf(tasks).filter((id, i, all) => all.indexOf(id) !== i));
  if (dupes(saved.tasks).length) lines.push(`FAIL: the graph file holds duplicate task ids (${named(dupes(saved.tasks))})`);
  const before = new Map(saved.tasks.map((task) => [task?.id, task]));
  const now = new Map(graph.tasks.map((task) => [task.id, task]));
  const missing = [...now.keys()].filter((id) => !before.has(id));
  const extra = [...before.keys()].filter((id) => !now.has(id));
  const changed = [...now.keys()].filter((id) => before.has(id) && stable(before.get(id)) !== stable(now.get(id)));
  if (missing.length) lines.push(`FAIL: ${missing.length} plan task(s) missing from the graph file (${named(missing)})`);
  if (extra.length) lines.push(`FAIL: ${extra.length} graph task(s) not in the plan (${named(extra)})`);
  if (changed.length) lines.push(`FAIL: ${changed.length} task(s) differ from the plan (${named(changed)})`);
  if (!missing.length && !extra.length && keyOf(saved.tasks).join('\n') !== keyOf(graph.tasks).join('\n')) lines.push('FAIL: the graph file orders the tasks differently from the plan');
  const unknown = Object.keys(saved).filter((key) => !Object.hasOwn(graph, key));
  if (unknown.length) lines.push(`FAIL: the graph file holds key(s) the projector does not write (${named(unknown)})`);
  // R-6: the session dir, the path of the plan and the warnings change when a session is read at another path or the
  // roster changes, the plan being what it was: a difference in these alone is a graph to re-project, no defect
  const moved = Boolean(saved.plan) && typeof saved.plan === 'object' && stable({ ...saved.plan, path: null }) === stable({ ...graph.plan, path: null });
  let stale = false;
  for (const key of Object.keys(graph).filter((name) => name !== 'tasks')) {
    // an edited plan is named above by its hash
    if ((key === 'plan' && edited) || stable(saved[key]) === stable(graph[key])) continue;
    if (key === 'session' || key === 'warnings' || (key === 'plan' && moved)) stale = true;
    else lines.push(`FAIL: the graph file's ${key} differ from the plan`);
  }
  if (stale) lines.push(OLD_GRAPH_LINE);
  return lines;
};

// opts.roster replaces the agent definitions read from the checkout (tests)
export const checkRunGraph = (sessionDir, opts = {}) => {
  const projected = projectSession(sessionDir, { roster: opts.roster });
  if (projected.code === EXIT.USAGE) return usage(projected.lines[0].replace(/^USAGE: /, ''));
  const { graph } = projected;
  const text = opts.graph ? readText(opts.graph) : null;
  if (opts.graph && text === null) return usage(`graph file not found: ${opts.graph}`);
  let lines = [];
  try {
    lines = checkGraph(graph, readText(join(graph.session, 'definition-of-done.md')), readText(graph.plan.path) ?? '');
    if (opts.graph) {
      let saved = null;
      try {
        saved = JSON.parse(text);
      } catch {
        saved = null;
      }
      lines.push(...driftOf(saved, graph));
    }
  } catch (error) {
    // an error of this script is no defect of the plan: partial, never a crash and never a FAIL
    lines = [`WARN: ${PARTIAL}check-run-graph.mjs — internal error: ${error?.message ?? error}`];
  }
  const failed = lines.some((line) => line.startsWith('FAIL: '));
  const partial = !graph.tasks.length || lines.some((line) => line.startsWith(`WARN: ${PARTIAL}`) || line === OLD_GRAPH_LINE);
  if (partial) lines.push(PARTIAL_LINE);
  else if (!failed) lines.push(`OK: run graph — ${graph.tasks.length} tasks, ${graph.phases.length} phases${opts.graph ? ', graph file equals the plan' : ''}`);
  return { code: failed ? EXIT.FAIL : EXIT.OK, lines };
};

export const parseArgs = (argv) => {
  const opts = {};
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--graph') {
      if (!argv[i + 1]) return { error: '--graph needs a file' };
      opts.graph = argv[(i += 1)];
    } else if (argv[i].startsWith('-')) return { error: `unknown flag: ${argv[i]}` };
    else positional.push(argv[i]);
  }
  if (positional.length !== 1) return { error: positional.length ? `extra argument: ${positional.slice(1).join(' ')}` : 'session dir missing' };
  return { sessionDir: positional[0], opts };
};

if (isMain()) {
  try {
    if (siblings.error) throw siblings.error;
    const parsed = parseArgs(process.argv.slice(2));
    const result = parsed.error ? usage(parsed.error) : checkRunGraph(parsed.sessionDir, parsed.opts);
    const out = result.code === EXIT.USAGE ? console.error : console.log;
    for (const line of result.lines) out(line);
    process.exitCode = result.code;
  } catch (error) {
    // never a stack and never a failing exit for an error of this script; the first line of its message says it
    console.log(`WARN: ${PARTIAL}check-run-graph.mjs — internal error: ${String(error?.message ?? error).split('\n')[0]}`);
    console.log(PARTIAL_LINE);
    process.exitCode = EXIT.OK;
  }
}
