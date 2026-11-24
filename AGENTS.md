# AGENTS.md

## Project Instructions

- Puddles is a kids' webcam game: a duck reacts to objects held up to the camera. The real deliverable is a portfolio: one LoRA-tuned SmolVLM measured against frontier baselines, built with gated agentic workflows. Product spec: [PRD](https://claude.ai/artifact/PQUr3xFBaaxoWcRiiREpic).
- All work is tracked on GitHub: one issue → one branch → one PR that says `Closes #<n>`. The board is the "Puddles Features" project. Read `docs/workflow.md` before planning or ticketing.
- Read `docs/coding-standards.md` before writing code. Never mark work done without a green `just check`.
- Read the ADRs below that touch your area. If the task conflicts with one, stop and say which.
- Never push to `main`, force-push, or weaken a gate (CI workflows, lint, type, coverage or complexity settings, thresholds, exclusion lists). Those changes go in their own PR for human review.
- Write the failing test first, then the code.
- No dead or commented-out code, no speculative abstractions or options nobody asked for, no `TODO` without an issue number. Match the patterns already in the file.
- No new dependency without a one-line reason in the PR.

## Repo Shape

- `server/puddles_server/`: FastAPI app. `/react` runs the `ReactionModel` named by `PUDDLES_MODEL` (`fake` by default; `smolvlm` names the object with base SmolVLM and fills a template; `smolvlm-json` has base SmolVLM write the whole reaction, the eval baseline). Tests in `server/tests/`.
- `game/`: Vite + TypeScript game. Logic in `src/core/` (pure, tested, no PixiJS or DOM); drawing and input in `src/render/` (PixiJS, MediaPipe; no tests, excluded from coverage). Tests sit next to code as `*.test.ts`.
- `shared/`: contracts used across game, server and evals. `reaction.schema.json` is the reaction format and `puddles_prompt.md` the VLM prompt; game types are generated from it (`pnpm -C game gen:types`, checked by `just generated`).
- `scripts/`: repo tooling in Python, with tests in `scripts/tests/`.
- `docs/spec/m3-kernel.md`: the kernel and plugin architecture M3 builds toward; read it before M3 work. `docs/art/`: reference art.
- `docs/adr/`: decisions. `docs/workflow.md`, `docs/coding-standards.md`.
- Python 3.12 via `uv`; Node via `pnpm` inside `game/`. TypeScript is pinned to 6.x.

## Commands

```bash
just install                 # deps from lockfiles + git hooks
just check                   # every gate; CI runs the same thing
just lint | types | complexity | dupes | deadcode | test
just check-files <paths>     # fast lint/types/complexity on specific files
just fix                     # auto-format and auto-fix lint
just report                  # every gate; violations as file:line:rule in .quality/report.json
just bench-vlm <folder>      # bench SmolVLM on a folder of photos (installs the vlm group)
just new <kind> <id>         # scaffold a plugin that passes the harness (spec §14)
```

The ML libraries live in the optional `vlm` dependency group; `just check` never needs them. To run the server on base SmolVLM (downloads the weights from Hugging Face on first run):

```bash
PUDDLES_MODEL=smolvlm uv run --group vlm uvicorn --app-dir server puddles_server.app:app
```

Hooks in `.claude/settings.json` check each edited file, block finishing while `just check` fails, and deny force-pushes, pushes to `main` and `--no-verify`. In CI agent runs they also deny edits to gate files.

Repo skills: `/plan-milestone`, `/create-tickets`, `/work-issue <n>`, `/review-pr <n>`.

## Commits and PRs

- Branch: `agent/<issue>-<slug>` for agent work, `mk/<slug>` for the owner's.
- Commits: one short line per distinct batch of changes; each commit must pass `just check` on its own. Agent commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (this repo overrides the global no-attribution rule).
- PRs: say what changed, why, how it was tested, agent notes and what was not done. Label `agent-authored`, plus `risk:high` when the PR touches gates, agent config, ADRs, the shared schema or dependencies. PRs are rebase-merged.
- Owner and lead work follows the same flow: start from an issue and run `/review-pr` on your own diff before opening the PR.

## Escalation

Stop, label the issue `needs-human` and comment why when: acceptance criteria are unclear, an ADR conflicts, CI fails 3 times in a row, review passes 2 rounds, or the diff grows past 400 non-test lines (tests don't count; never trim tests to fit).

## Decisions

- Trunk-based branches with rebase merges: `docs/adr/2026-11-22-trunk-based-branches-with-rebase-merges.md`
- Risk decides who merges: `docs/adr/2026-11-22-risk-decides-who-merges.md`
- Agents run in GitHub Actions on the Claude subscription: `docs/adr/2026-11-22-agents-run-in-github-actions-on-the-subscription.md`
- Agent commits carry a Claude co-author trailer: `docs/adr/2026-11-22-agent-commits-carry-a-co-author-trailer.md`
- TypeScript stays on 6.x until typescript-eslint supports 7: `docs/adr/2026-11-22-typescript-stays-on-6.md`
- Game logic in core, drawing in render: `docs/adr/2026-11-22-game-logic-in-core-drawing-in-render.md`
- Base SmolVLM runs now, behind a swappable model: `docs/adr/2026-11-23-base-smolvlm-behind-a-swappable-model.md`
- One small kernel, four plugin kinds, events only (spec: `docs/spec/m3-kernel.md`): `docs/adr/2026-11-23-one-kernel-four-plugin-kinds.md`
