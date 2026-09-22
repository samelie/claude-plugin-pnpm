# TypeScript Rules

Rules for all TypeScript code written by team agents.

## Style

- Functional style — factory functions, closures, composition
- No classes unless the framework requires them
- Maximize use of generics and type inference
- Prefer `const` declarations
- Use arrow functions for callbacks and short functions

## Types

- Let TypeScript infer types where possible — don't annotate the obvious
- Export types from the module that owns them
- Use `type` imports (`import type { Foo }`) for type-only imports
- Prefer interfaces for object shapes, type aliases for unions/intersections

## Imports & modules

- No barrel exports — never aggregate re-exports (`export * from './x'`)
- Reserve `index.ts` for the package entry only (`src/index.ts`); no `index.ts` in subdirectories
- Always prefer deep imports — import from the module that defines the symbol, not an aggregating index

## Comments

- Single-line only: `// my comment`
- All lowercase characters — no capitalization
- No JSDoc-style comments (`/** */`)
- No block comments (`/* */`)
- No example comments or usage demonstrations
- Only comment caveats, architectural interlockings, and non-obvious behavior
- Remove comments that restate what the code says

## Patterns

- Match existing codebase conventions — don't introduce new patterns
- Read existing code before modifying
- Code snippets in task descriptions are sketches — adapt to real types/signatures
- Use `pnpm -F "<pkg>"` for all package commands

## Reuse & duplication

- Before writing a generic utility (date, string, array, path, retry, etc.), check whether an equivalent already exists in another workspace package and prefer reusing it
- Not mandatory — never add a new cross-package dependency just to reuse a trivial helper; reuse only when the dependency is already natural or present
