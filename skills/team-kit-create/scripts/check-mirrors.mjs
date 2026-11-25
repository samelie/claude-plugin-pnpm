#!/usr/bin/env node
// mirror check: the kit states some rules in several files (skill, references, role files, templates). each such
// fact is declared once in mirror-facts.json, read from its machine source where one exists, and verified at every
// site the registry names, so a copy that disagrees fails here instead of waiting for a reviewer.
// read-only. prints one line per fact, `OK: <fact> — <n> sites` or `FAIL: <fact> — <file>:<line>: <what>`, each
// followed by the sites it checked, indented.
// node check-mirrors.mjs [--root <abs repo root>]    exit 0 every fact holds, 1 at least one FAIL, 2 usage

import { readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const USAGE = 'usage: check-mirrors.mjs [--root <abs repo root>]';
const EXIT = Object.freeze({ OK: 0, FAIL: 1, USAGE: 2 });
const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ROOT = resolve(HERE, '..', '..', '..', '..');
export const REGISTRY_PATH = join(HERE, 'mirror-facts.json');

const readText = (path) => {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
};
const isDir = (path) => {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
};

// markdown dressing and hand-wrapping are layout, not content: a phrase straddling a line break, in bold or in a
// code span (escaped inside a prompt template) still counts
export const flat = (text) => text.replace(/\\`/g, '`').replace(/[`*]/g, '').replace(/\s+/g, ' ');
const loose = (text) => text.replace(/-/g, ' ').replace(/:(?=\s|$)/g, '');
const escapeRe = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// a token next to a word character or a hyphen is part of a longer word (measured: inside unmeasured:, grill in grill-me)
export const hasToken = (hay, token) => new RegExp(
  `(?<![A-Za-z0-9_-])${escapeRe(token)}${/[A-Za-z0-9]$/.test(token) ? '(?![A-Za-z0-9_-])' : ''}`,
).test(hay);
const lineAt = (text, index) => text.slice(0, index).split('\n').length;

// flat(text) with, per character, the index of the raw character it came from, so a match on the flat text maps
// back to a raw offset and line
const FLAT_CACHE = new Map();
export const flatIndex = (text) => {
  if (FLAT_CACHE.has(text)) return FLAT_CACHE.get(text);
  let out = '';
  const from = [];
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (c === '`' || c === '*' || (c === '\\' && text[i + 1] === '`')) continue;
    if (/\s/.test(c)) {
      if (out.endsWith(' ')) continue;
      out += ' ';
    } else out += c;
    from.push(i);
  }
  // one entry per distinct text: a run reads each file once, a test suite reads a few mutants of each
  if (FLAT_CACHE.size > 500) FLAT_CACHE.clear();
  FLAT_CACHE.set(text, { out, from });
  return { out, from };
};

// the text a site points at: anchor to end anchor, or the anchor's line plus lines - 1 more, or the whole file.
// anchors match on flat text, so re-wrapping or bolding inside an anchor still finds it
export const regionOf = (text, site) => {
  if (!site.at) return { text, line: 1 };
  const { out, from } = flatIndex(text);
  const needle = flat(site.at).trim();
  const at = out.indexOf(needle);
  if (at < 0) return { error: `anchor not found: "${site.at.slice(0, 80)}" — the site moved or was reworded: restore the text or re-anchor the site in mirror-facts.json` };
  const start = from[at];
  const line = lineAt(text, start);
  if (site.to) {
    const end = out.indexOf(flat(site.to).trim(), at + needle.length);
    if (end < 0) return { error: `end anchor not found after "${site.at.slice(0, 50)}": "${site.to.slice(0, 60)}" — the site moved or was reworded`, line };
    return { text: text.slice(start, from[end]), line };
  }
  const lineStart = text.lastIndexOf('\n', start) + 1;
  return { text: text.slice(lineStart).split('\n').slice(0, site.lines ?? 1).join('\n'), line };
};

const hashOf = (text) => createHash('sha256').update(text).digest('hex').slice(0, 16);

// the fresh-check declarations: the one json-tagged fence of fresh-checks.md
export const parseJsonFence = (text) => {
  const fences = [...text.matchAll(/^```json[^\n]*\n([\s\S]*?)\n```/gm)];
  if (fences.length !== 1) throw new Error(`expected exactly one json-tagged code fence, found ${fences.length}`);
  return JSON.parse(fences[0][1]);
};
const skipLinesOf = (check) => (check.skipWhenArtifactLine === null ? [] : [check.skipWhenArtifactLine].flat());
const freshView = (json) => ({
  ids: json.checks.map((check) => check.id),
  byId: Object.fromEntries(json.checks.map((check) => [check.id, check])),
  skipLines: json.checks.flatMap(skipLinesOf),
});

// sources are read from the tree under check, never copied into the registry. one that cannot be read fails every
// fact that needs it: that is how a tree from before the source existed fails loud
export const loadSources = async (root, declared) => {
  const out = {};
  for (const [name, spec] of Object.entries(declared)) {
    const path = join(root, spec.file);
    const text = readText(path);
    if (text === null) {
      out[name] = { error: 'source missing', file: spec.file };
      continue;
    }
    try {
      if (spec.type === 'module') {
        // the content hash defeats the module cache: a changed source in the same process is a new module
        out[name] = { file: spec.file, value: { ...(await import(`${pathToFileURL(realpathSync(path)).href}?mirror=${hashOf(text)}`)) } };
      } else if (spec.type === 'jsonFence') out[name] = { file: spec.file, value: freshView(parseJsonFence(text)) };
      else if (spec.type === 'regexAlternatives') {
        const m = new RegExp(spec.pattern, 'm').exec(text);
        if (!m) throw new Error(`no match for /${spec.pattern}/`);
        out[name] = { file: spec.file, value: m[1].split(spec.split ?? '|').filter((item) => !(spec.drop ?? []).includes(item)) };
      } else throw new Error(`unknown source type ${spec.type}`);
    } catch (error) {
      out[name] = { error: error.message, file: spec.file };
    }
  }
  return out;
};

const sourceError = (file, message) => Object.assign(new Error(message), { sourceFile: file });

// "source.path.to.value", optionally "/divisor"
export const resolveRef = (sources, ref) => {
  const [path, divisor] = ref.split('/');
  const [name, ...keys] = path.split('.');
  const source = sources[name];
  if (!source) throw sourceError('mirror-facts.json', `unknown source ${name} in ${ref}`);
  if (source.error) throw sourceError(source.file, `source unreadable (${ref}): ${source.error}`);
  let value = source.value;
  for (const key of keys) {
    if (value === null || value === undefined || !(key in Object(value))) throw sourceError(source.file, `source has no ${ref}`);
    value = value[key];
  }
  return divisor ? value / Number(divisor) : value;
};

const fileOf = (registry, name) => registry.files[name] ?? name;
const NUMBERS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];

// every file under the scan's roots, relative to root, in a stable order
export const scanFiles = (root, scan) => {
  const out = [];
  const walk = (dir, spec) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (spec.recursive) walk(path, spec);
      } else if (spec.ext.some((ext) => entry.name.endsWith(ext)) && entry.name.startsWith(spec.prefix ?? '')) {
        out.push(relative(root, path).split(sep).join('/'));
      }
    }
  };
  for (const spec of scan) if (isDir(join(root, spec.dir))) walk(join(root, spec.dir), spec);
  return out;
};

// a declared read entry as it reads in prose: a plain path by its file name, a glob by everything before its first
// star (experiments/X-*.md and experiments/X-*/* both read experiments/X-)
export const fileToken = (entry) => (entry.includes('*') ? entry.slice(0, entry.indexOf('*')) : entry.split('/').at(-1));
const mapSection = (entry) => (entry.startsWith('map.md#') ? entry.slice('map.md#'.length) : null);

const eachSite = (fact, registry, read, each) => {
  const problems = [];
  const sites = [];
  for (const site of fact.sites) {
    const file = fileOf(registry, site.file);
    const text = read(file);
    if (text === null) {
      sites.push({ file, line: 0, note: 'missing' });
      problems.push({ file, msg: 'file missing' });
      continue;
    }
    const region = regionOf(text, site);
    sites.push({ file, line: region.line ?? 1, note: site.note ?? '' });
    if (region.error) problems.push({ file, line: region.line, msg: `${fact.id} site ${region.error}` });
    else problems.push(...each(site, region).map((p) => ({ file, line: region.line, ...p })));
  }
  return { problems, sites };
};

// restate "full": every declared file and map.md section, and no file or section of another check. "sections": the
// map.md part only. pointer: names fresh-checks.md → <id>
const checkReadset = ({ fact, registry, sources, read }) => {
  const fresh = resolveRef(sources, 'freshChecks');
  const check = fresh.byId[fact.check];
  if (!check) throw sourceError(sources.freshChecks.file, `no declared check ${fact.check}`);
  const sections = check.allow.map(mapSection).filter(Boolean);
  const own = [...new Set([...check.allow, ...check.deny].filter((entry) => !mapSection(entry)).map(fileToken))];
  const allows = Object.values(fresh.byId).flatMap((c) => c.allow);
  const vocabulary = [...new Set(allows.filter((e) => !mapSection(e) && !e.includes('*')).map(fileToken))];
  const known = [...new Set([...registry.mapSections, ...allows.map(mapSection).filter(Boolean)])];
  return eachSite(fact, registry, read, (site, region) => {
    const hay = flat(region.text);
    const out = [];
    if (site.pointer && !hay.includes(`fresh-checks.md → ${fact.check}`)) out.push({ msg: `missing pointer "fresh-checks.md → ${fact.check}"` });
    if (site.restate === 'full') {
      for (const token of own) if (!hasToken(hay, token)) out.push({ msg: `missing read-set file ${token} (declared: ${check.allow.join(', ')})` });
      for (const token of vocabulary) if (!own.includes(token) && hasToken(hay, token)) out.push({ msg: `extra file ${token}: not in the ${fact.check} read-set` });
    }
    // "the two map.md sections", "read four files": a count word restates the size of the set
    for (const m of hay.matchAll(/\b(one|two|three|four|five|six|seven|eight|nine|\d+) (map\.md sections|files)\b/gi)) {
      const want = m[2] === 'files' ? check.allow.length : sections.length;
      if (NUMBERS.indexOf(m[1].toLowerCase()) !== want && Number(m[1]) !== want) out.push({ msg: `"${m[0]}": the ${fact.check} read-set has ${want} ${m[2]}` });
    }
    if (site.restate) {
      for (const name of sections) if (!hasToken(hay, name)) out.push({ msg: `missing map.md section "${name}"` });
      for (const name of known) if (!sections.includes(name) && hasToken(hay, name)) out.push({ msg: `extra map.md section "${name}": not in the ${fact.check} read-set` });
    }
    return out;
  });
};

// a number stated in prose equals the constant it restates. without an anchor, every statement in the file counts
const checkValues = ({ fact, registry, sources, read }) => eachSite(fact, registry, read, (site, region) => {
  const expect = site.expect.map((ref) => resolveRef(sources, ref));
  const matches = [...flat(region.text).matchAll(new RegExp(site.re, 'g'))];
  if (!matches.length) return [{ msg: `no statement matching /${site.re}/ (the source says ${expect.join(', ')})` }];
  return matches.flatMap((m) => m.slice(1).flatMap((got, i) => (Number(got) === expect[i] ? [] : [{
    msg: `stale value: "${m[0].trim()}" states ${got}, the source (${site.expect[i]}) says ${expect[i]}`,
  }])));
});

// tokens declared in the registry or read from a source list. a site's need entries pick the token they equal, or
// else every token containing them (a need that picks nothing is stale); strip drops a suffix, loose reads hyphens
// as spaces and drops a trailing colon, lineStart wants each token at a line start; ordered wants source order
const checkTokens = ({ fact, registry, sources, read }) => {
  const all = fact.source ? resolveRef(sources, fact.source) : fact.tokens;
  return eachSite(fact, registry, read, (site, region) => {
    const out = [];
    const chosen = [];
    for (const need of site.need ?? all) {
      const exact = all.filter((token) => token === need);
      const hit = exact.length ? exact : all.filter((token) => token.includes(need));
      if (!hit.length) out.push({ msg: `stale registry need "${need}": no ${fact.source ?? 'declared'} token contains it (${all.join(' | ')})` });
      chosen.push(...hit.filter((token) => !chosen.includes(token)));
    }
    const strip = (token) => (site.strip && token.endsWith(site.strip) ? token.slice(0, -site.strip.length) : token);
    const norm = (text) => (site.loose ? loose(text) : text);
    const hay = norm(flat(region.text));
    const lines = region.text.split('\n').map((line) => norm(flat(line)).trim());
    let from = 0;
    for (const token of chosen.map(strip)) {
      const want = norm(token);
      if (site.lineStart ? !lines.some((line) => line.startsWith(want)) : !hasToken(hay, want)) {
        out.push({ msg: `missing "${token}"` });
        continue;
      }
      if (!fact.ordered) continue;
      const at = hay.slice(from).search(new RegExp(`(?<![A-Za-z0-9_-])${escapeRe(want)}`));
      if (at < 0) out.push({ msg: `"${token}" out of order (source order: ${chosen.map(strip).join(' → ')})` });
      else from += at + want.length;
    }
    return out;
  });
};

// the items a site lists equal the source list: nothing missing, nothing extra
const checkSet = ({ fact, registry, sources, read }) => {
  const expect = resolveRef(sources, fact.source);
  return eachSite(fact, registry, read, (site, region) => {
    const got = [...(site.raw ? region.text : flat(region.text)).matchAll(new RegExp(site.extract, 'g'))]
      .flatMap((m) => (site.split ? m[1].split(site.split) : [m[1]])).map((item) => item.trim()).filter((item, i, all) => all.indexOf(item) === i);
    return [
      ...expect.filter((item) => !got.includes(item)).map((item) => ({ msg: `missing ${item}` })),
      ...got.filter((item) => !expect.includes(item)).map((item) => ({ msg: `extra or stale ${item}: not in ${fact.source}` })),
    ];
  });
};

// a scan's file list less the fact's exclusions; an exclusion that matches nothing is itself a failure
const scanned = (fact, registry, root) => {
  const all = scanFiles(root, registry.scans[fact.scan]);
  const exclusions = (fact.exclusions ?? []).map((e) => ({ ...e, re: new RegExp(e.re) }));
  const problems = exclusions.filter((e) => !all.some((file) => e.re.test(file)))
    .map((e) => ({ file: 'mirror-facts.json', msg: `exclusion ${e.re} matches no scanned file: a stale exclusion silently shrinks the scan` }));
  const list = all.filter((file) => !exclusions.some((e) => e.re.test(file)));
  if (!list.length) problems.push({ file: 'mirror-facts.json', msg: `scan ${fact.scan} found no file under ${registry.scans[fact.scan].map((s) => s.dir).join(', ')}` });
  return { list, problems };
};

// the whole file flattened, so a phrase re-wrapped across lines is still one phrase; hit returns [index, msg] pairs
const eachFile = (fact, registry, read, root, hit) => {
  const { list, problems } = scanned(fact, registry, root);
  for (const file of list) {
    const text = read(file) ?? '';
    const { out, from } = flatIndex(text);
    for (const [index, msg] of hit(out)) problems.push({ file, line: lineAt(text, from[index] ?? 0), msg });
  }
  return { problems, sites: [{ scan: fact.scan, count: list.length }], count: list.length };
};

// every value the pattern captures across the scanned files is a member of the source list
const checkMember = ({ fact, registry, sources, read, root }) => {
  const expect = resolveRef(sources, fact.source);
  return eachFile(fact, registry, read, root, (hay) => [...hay.matchAll(new RegExp(fact.extract, 'g'))]
    .filter((m) => !expect.includes(m[1])).map((m) => [m.index, `"${m[0]}" names ${m[1]}, not a declared id (${expect.join(', ')})`]));
};

// stale phrases: one FAIL per hit, with the reason the phrase is stale. a phrase may take its alternatives from a
// source list ({alts} in its pattern), so the banned set follows the code that rejects it
const checkBanned = ({ fact, registry, sources, read, root }) => {
  const unreadable = [];
  const phrases = fact.phrases.flatMap((phrase) => {
    try {
      const re = phrase.source ? phrase.re.replace('{alts}', resolveRef(sources, phrase.source).map(escapeRe).join('|')) : phrase.re;
      return [{ ...phrase, re: new RegExp(re, `g${phrase.flags ?? ''}`) }];
    } catch (error) {
      // the other phrases still scan: one missing source must not hide every stale phrase
      unreadable.push({ file: error.sourceFile ?? 'mirror-facts.json', msg: `phrase ${phrase.id}: ${error.message}` });
      return [];
    }
  });
  const result = eachFile(fact, registry, read, root, (hay) => phrases.flatMap((phrase) => [...hay.matchAll(phrase.re)]
    .map((m) => [m.index, `stale phrase ${phrase.id}: ${phrase.why}`])));
  return { ...result, problems: [...unreadable, ...result.problems] };
};

export const CHECKERS = { readset: checkReadset, values: checkValues, tokens: checkTokens, set: checkSet, member: checkMember, banned: checkBanned };

export const readRegistry = (path = REGISTRY_PATH) => JSON.parse(readFileSync(path, 'utf8'));

export const checkMirrors = async (root = DEFAULT_ROOT, registry = readRegistry()) => {
  if (typeof root !== 'string' || !isAbsolute(root)) return { code: EXIT.USAGE, lines: ['USAGE: --root must be an absolute path', USAGE] };
  if (!isDir(root)) return { code: EXIT.USAGE, lines: [`USAGE: root not found: ${root}`, USAGE] };
  const sources = await loadSources(root, registry.sources);
  const cache = new Map();
  const read = (file) => {
    if (!cache.has(file)) cache.set(file, readText(join(root, file)));
    return cache.get(file);
  };
  const lines = [];
  let failed = 0;
  for (const fact of registry.facts) {
    let result;
    try {
      result = CHECKERS[fact.kind]({ fact, registry, sources, read, root });
    } catch (error) {
      result = { problems: [{ file: error.sourceFile ?? 'mirror-facts.json', msg: error.message }], sites: [] };
    }
    if (result.problems.length) {
      failed += 1;
      const seen = new Set();
      for (const p of result.problems) {
        const line = `FAIL: ${fact.id} — ${p.file}${p.line ? `:${p.line}` : ''}: ${p.msg}`;
        if (!seen.has(line)) lines.push(line);
        seen.add(line);
      }
    } else lines.push(`OK: ${fact.id} — ${result.count ?? result.sites.length} sites`);
    for (const s of result.sites) lines.push(s.scan ? `  scan ${s.scan}: ${s.count} files` : `  ${s.file}:${s.line}${s.note ? ` (${s.note})` : ''}`);
  }
  lines.push(`${registry.facts.length - failed} of ${registry.facts.length} facts hold`);
  return { code: failed ? EXIT.FAIL : EXIT.OK, lines };
};

export const parseArgs = (argv) => {
  if (!argv.length) return { root: DEFAULT_ROOT };
  if (argv[0] === '--root' && argv.length === 2) return { root: argv[1] };
  return { error: argv[0] === '--root' ? 'one value after --root' : `unknown argument: ${argv[0]}` };
};

// realpath: node resolves the entry's symlinks in import.meta.url, and a mismatch would skip the check with exit 0
const isMain = () => {
  try {
    return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
};

if (isMain()) {
  const args = parseArgs(process.argv.slice(2));
  const result = args.error ? { code: EXIT.USAGE, lines: [`USAGE: ${args.error}`, USAGE] } : await checkMirrors(args.root);
  process.stdout.write(`${result.lines.join('\n')}\n`);
  process.exitCode = result.code;
}
