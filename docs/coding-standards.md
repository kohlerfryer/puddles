# Coding standards

Every standard here is enforced by a tool in `just check`. Hooks, pre-push and CI run the same command, so a rule that isn't automated doesn't belong in this file.

## Limits

| Check | Python | TypeScript | Limit |
| --- | --- | --- | --- |
| Lint | ruff (E, F, I, N, B, UP, SIM, RUF, PL, C90, PGH) | typescript-eslint `strict-type-checked` + `stylistic-type-checked` | 0 warnings |
| Format | `ruff format` | prettier | no diff |
| GitHub workflows | actionlint (all of `.github/workflows/`) | | 0 errors |
| Types | `mypy --strict` | `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` | no untyped `any` |
| Cyclomatic complexity | ruff `C901` | eslint `complexity` | 10 per function |
| Cognitive complexity | complexipy | `sonarjs/cognitive-complexity` | 15 per function |
| Function size | ruff `PLR0915` | `max-lines-per-function` | 40 statements / 50 lines |
| Parameters | ruff `PLR0913`, `PLR0917` | `max-params` | 5 / 4 |
| Nesting depth | ruff `PLR1702` | `max-depth` | 3 |
| Branches and returns | ruff `PLR0912`, `PLR0911` | covered by complexity | 10 / 5 |
| File size | `scripts/file_length.py` | `max-lines` | 300 lines |
| Duplication | jscpd | jscpd | ≤ 3% |
| Dead code | vulture | knip (files, exports, dependencies) | none |
| Coverage | pytest-cov | vitest v8 | ≥ 85% lines and branches |
| Diff coverage (PRs) | diff-cover on both reports | diff-cover | ≥ 90% of changed lines |

Settings live in `pyproject.toml`, `game/eslint.config.js`, `game/tsconfig.json`, `game/vitest.config.ts`, `game/knip.json` and `.jscpd.json`. TypeScript tests are exempt from the function-length limit (a `describe` block is one long function); Python tests are exempt from the magic-number rule.

## Coverage scope

Logic is always measured: the script runner, validator, state machine, server and scripts. Rendering and entry code, such as PixiJS drawing and `game/src/main.ts`, is excluded by an explicit list in the coverage settings. Changing that list is a high-risk change.

## Rules about the rules

- **Ratchet.** Limits only get stricter. Loosening one is a high-risk PR with a reason.
- **Suppressions.** An inline disable must name the rule and give a reason: `# noqa: PLR0913  # mirrors the external API` or `// eslint-disable-next-line max-params -- mirrors the external API`. Today, a bare `# noqa` or `# type: ignore` fails ruff, and an eslint disable without a description fails eslint. Requiring a reason on Python suppressions, and marking any new suppression high risk, comes with the risk gate (#5).
- **No gate edits in feature work.** Changes to these settings go in their own PR.

## Commands

| Command | What it runs |
| --- | --- |
| `just check` | everything below |
| `just lint` | format checks, ruff, eslint (including TypeScript complexity and size), actionlint |
| `just types` | mypy, tsc |
| `just complexity` | complexipy, Python file length |
| `just dupes` | jscpd |
| `just deadcode` | vulture, knip |
| `just test` | pytest and vitest with coverage thresholds |
| `just check-files <paths>` | fast lint, types and complexity for specific files |
| `just fix` | auto-format and auto-fix |
| `just diff-coverage [base]` | coverage of lines changed since `base` (default `origin/main`) |
| `just report` | every gate, writing `.quality/report.json` with each violation's file, line and rule |

In Claude Code, a hook runs `just check-files` after every edit and reports violations straight back, and Claude can't finish a task while `just check` fails (after 3 blocked attempts it must escalate with `needs-human`).
