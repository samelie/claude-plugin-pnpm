# SCHEMA-CATALOG.md — Canonical workflow handoff schemas

Source of truth for the 5 schemas the workflow EXECUTE path (`/team-kit-run`) passes between stages. Names are LOCKED (`WORKFLOW-MERGE-PLAN.md` step 3). Sibling of `SESSION-SCHEMA.md` — that file defines the on-disk LAYOUT; this defines the DATA shapes.

## Two handoff models (coexist)

| Model | Mechanism | Use |
|-------|-----------|-----|
| FILE (legacy/team-style) | agent writes `{session}/{agent}/file.md`, peer reads via read-findings | bulk artifacts a downstream agent reads in full (design.md, findings.md, large diffs) |
| SCHEMA (workflow) | `agent(p,{schema})` returns tool-validated JSON in JS vars | DATA handoff between workflow stages — never enters main context |

Rule (`WORKFLOW-MERGE-PLAN.md` handoff rule): **schema for DATA; `team-session/` file (path passed IN the schema as `sessionFile`) only for BULK.** Every schema below carries `sessionFile` + a `status` enum (from the STATUS protocol) so both models coexist.

**Transport note (re-verified 2026-06-05 — supersedes the 0.3.3 caveat):** schema is RELIABLE on the current runtime — 4/4 heavy custom-agentType agents (each Read 5 large files) returned valid `StructuredOutput` (skip 0/4); the earlier "~5× skip / 1 fatal abort" claim did NOT reproduce. Heavy execution stages (research/coder/review/verify/finish) STILL DEFAULT to the FILE model + a `STATUS:` line — for **lean context + bulk handoff to disk**, NOT because schema breaks. A separate, still-live failure vector is TRANSPORT (stall-watchdog/rate-limit/subprocess) aborting a bare critical-path `await agent()` — wrap those in `tryAgent` (team-kit-run rule 11). The shapes below still define the on-disk artifact CONTENT.

## Universal invariants (every schema)

- `status`: `"clean" | "partial" | "errors_remaining"` — mirrors the agent STATUS protocol.
- `errorCount?`: number — present when `status: errors_remaining`.
- `sessionFile`: string — path to the bulk `.md` artifact in `team-session/{slug}/...` (BULK pointer, not the data itself).

## Inline-const ↔ canonical name map (team-kit-run stage templates)

| Inline const (legacy) | Stage | Canonical |
|-----------------------|-------|-----------|
| `FINDINGS_SCHEMA` | Research | **ResearchFindings** |
| `IMPL_SCHEMA` | Implement | **ImplResult** |
| `DIFF_SCHEMA` | Propose | **ImplResult** (`.diffs[]` variant — NOT a 6th schema) |
| `VERDICT_SCHEMA` | Review (spec + quality) | **ReviewVerdict** |
| `GATE_SCHEMA` | Finalize | **VerifyReport** |
| (none) | Validate | **ACEvidence** |

Use the canonical PascalCase names in new scripts.

---

## 1. ResearchFindings

Default-agent (path A) research/investigation output. Maps to `researcher/findings.md`.

```js
const ResearchFindings = {
  topic: 'string',
  summary: 'string',                                  // findings.md "Summary"
  keyFindings: [{ claim, evidence, file, lines, snippet }],  // "Key Findings" + file paths
  patterns: ['string'],                               // "Patterns Discovered"
  recommendations: ['string'],
  openQuestions: ['string'],
  sessionFile: 'string',                              // researcher/findings.md (bulk)
  status: 'clean|partial|errors_remaining', errorCount: 0,
}
```

## 2. ImplResult

team-coder output. Single-writer fills the top fields; propose-then-apply fills `diffs[]` and writes NO file. The apply stage MUST require `diffs` (minItems 1) and flag any proposer returning none — an optional `diffs` schema lets coders silently drop work (de-harness run 1). Same-path proposals are flagged for manual merge, never clobbered.

```js
const ImplResult = {
  taskId: 'string',                                   // T-N
  completed: ['string'], inProgress: ['string'],
  blocked: [{ taskId, reason }],
  filesModified: [{ path, change }],                  // "path — what changed"
  approach: 'string',
  deviations: [{ from, reason }],
  reviewerNotes: ['string'],                          // concerns for the reviewer
  diffs: [{ path, unifiedDiff /* or */ newContent }], // PROPOSE-THEN-APPLY variant only
  sessionFile: 'string',                              // coder-{name}/progress.md
  status: 'clean|partial|errors_remaining', errorCount: 0,
}
```

## 3. ReviewVerdict

Covers spec AND quality (and security/audit) — `reviewType` discriminates. Keep `issues[]` RICH (severity+file+line+problem+fix); do NOT flatten to a boolean.

```js
const ReviewVerdict = {
  reviewType: 'spec|quality|security|audit',
  decision: 'approved|approved_with_conditions|needs_revision|rejected',  // shinpr enum
  taskId: 'string',
  requirementsChecked: [{ requirement, status: 'pass|fail', notes }],     // spec table
  issues: [{ severity: 'critical|warning|suggestion', file, line, problem, fix }],
  missing: [{ location, what }], extra: [{ location, what }], misunderstandings: ['string'],
  failureModes: ['stub_detected|escalation|...'],     // named reject reasons → feed back to coder
  incompleteImplementations: ['string'],
  sessionFile: 'string',                              // reviewer/review-{task-id}.md | spec-reviewer/spec-review-{task-id}.md
  status: 'clean|errors_remaining', errorCount: 0,
}
```

## 4. VerifyReport

team-verifier output. Battle-tested (validated in real use). `failedGates` drives "re-run ONLY failed verifiers" convergence.

```js
const VerifyReport = {
  packagesChecked: ['string'],
  checks: [{
    check: 'lint|types|knip|test',
    status: 'pass|fail|warnings',
    errorCount: 0,
    errors: [{ file, line, rule, message }],
    warnings: [{ file, message, reasoning }],         // knip: with reasoning
  }],
  knip: { realIssues: [], suspectedFalsePositives: [] },  // knip false-positive skepticism
  failedGates: ['string'],                            // re-run only these
  sessionFile: 'string',                              // verifier/results.md
  status: 'clean|partial|errors_remaining', errorCount: 0,
}
```

## 5. ACEvidence

Validate stage (N+2). Automatable AC → workflow; `automatable:false` → routed to in-session manual.

```js
const ACEvidence = {
  criteria: [{
    acId: 'string',                                   // AC-1 ... (design.md traceability)
    statement: 'string',                              // Given/When/Then
    automatable: true,
    verdict: 'pass|fail|manual|blocked',
    command: 'string',                                // verification command
    evidence: 'string',                               // output / file:line proof
    components: ['string'],                            // AC-* → components traceability
  }],
  sessionFile: 'string',                              // validation-report.md
  status: 'clean|partial|errors_remaining', errorCount: 0,
}
```

---

## Canonical sessionFile paths (drift resolved)

| Schema | Canonical path |
|--------|----------------|
| ResearchFindings | `researcher/findings.md` |
| ImplResult | `coder-{name}/progress.md` |
| ReviewVerdict | `reviewer/review-{task-id}.md` (quality) · `spec-reviewer/spec-review-{task-id}.md` (spec) |
| VerifyReport | `verifier/results.md` |
| ACEvidence | `validation-report.md` (session root) |

Drift resolved (0.3.0): agent docs aligned to the canonical paths above — `team-reviewer` writes `reviewer/review-{task-id}.md` (was `findings.md`), `team-spec-reviewer` writes to the `spec-reviewer/` subdir (was session root), `team-security-auditor` writes `security-audit.md` (was `report.md`), and SESSION-SCHEMA verifier output is `verifier/results.md` (was `verification.md`).
