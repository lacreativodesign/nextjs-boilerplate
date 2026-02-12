# ADR-0002: Shift quality gates to CI and pre-commit

## Status
Accepted

## Context
Code quality checks were inconsistent between local development and PR validation.

## Decision
Introduce deterministic gates:
- ESLint strict rules
- Prettier formatting checks
- lint-staged + Husky pre-commit
- test coverage thresholds (Jest)
- bundle-size and license compliance scripts

## Consequences
- PRs fail fast for code smells and formatting regressions.
- Local hooks reduce avoidable CI failures.
- Governance checks are traceable and automatable.
