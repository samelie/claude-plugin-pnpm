# Approval provenance and reuse

Apply at requirements presentation, design presentation, resume and final handoff. Existing user authorization persists; higher-priority user instructions govern the workflow.

## Record what was covered

Use the existing Approval Log and map decision link, not a parallel ledger. Record section/proposition, exact user turn or durable locator, covered content/version, current status and any delta. Hashes identify the inspected snapshot; they do not prove consent or determine whether a change needs new consent.

- Distinguish user-required outcomes, source-defined facts, agent assumptions and chosen execution methods. A source document is not itself a user approval. An entire section cannot be marked user-covered when only some propositions are covered.
- Reuse approval when the cited user turn covers the current proposition and its scope. Do not ask the user to approve the same scope in new words. Preserve per-section bookkeeping even when one user turn covers several sections.
- Unseen commitments stay uncovered. Choosing an approach does not approve a later invented threshold, exclusion, external action or expanded autonomy.
- A contextual "continue" carries existing authorization forward. It does not, by itself, authorize new commitments. An explicit scoped instruction or waiver may cover several gates; cite it and honor its actual scope.

## Classify changes before asking

| Change | Action |
|---|---|
| Identical content | Reuse recorded approval. |
| Editorial: spelling, formatting, citation repair with unchanged claim | Record changed snapshot and why meaning is unchanged; no new user approval. Revalidate affected evidence. |
| Implementation choice within authorized outcomes, constraints and autonomy | Record method/rationale and verify it; do not label it a new user requirement or ask for redundant approval. |
| Material change outside existing authorization: outcome, scope, tradeoff, exclusion, acceptance threshold, cost/external action or autonomy | Present only that delta with recommendation and implications; wait for the needed decision before dependent work. Continue independent authorized work. |
| Evidence contradicts a premise supporting an approved decision | Identify the exact premise and linked decision. Ask only if the decision now needs a material choice; a corrected incidental fact does not erase unrelated approval. |

When classification is uncertain, compare the proposed behavior and commitments against the cited authorization. Ask only for the unresolved material choice, never because bytes differ.

## Approval is separate from verification

Every edit to a reviewed input makes its old hash stale, including editorial edits. Refresh affected checks and persist the new reviewed snapshot. A changed acceptance contract requires regrading against that contract; never relabel an old verdict with a new hash. Approval reuse does not bypass review, and renewed review does not require renewed user consent unless the change exceeds authorization.

For a sealed execution manifest, preserve revision lineage, prior attempts and consumed repair budgets. Rebind only after recording the change classification and completing affected validation; do not edit history to hide drift. Runtime checks may deliberately fail closed until that reconciliation is recorded.
