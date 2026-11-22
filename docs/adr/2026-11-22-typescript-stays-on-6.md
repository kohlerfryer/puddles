# TypeScript stays on 6.x until typescript-eslint supports 7

## Decision

The game pins TypeScript to 6.x. Upgrade to 7 only when typescript-eslint supports it, since type-aware lint rules are part of the quality gates.

## Why

TypeScript 7 installed by default, but typescript-eslint refuses to run against it, which would disable the strict type-checked lint rules and the complexity limits.

## Rejected

- **TypeScript 7 without type-aware linting.** Faster compiler, but loses the gates the workflow depends on.
