# Workflow

Agents do most of the work. Humans approve plans, approve tickets, review high-risk PRs and run playtests. Everything else is automated and enforced, so no rule depends on an agent remembering it.

```
1 Plan ──► [human approves] ──► 2 Tickets (Backlog, agent:draft)
   ──► [human moves to Ready, agent:ready] ──► 3 Implement (branch, test-first, PR)
   ──► 4 Gates (just check in CI) ──► 5 Agent review (fresh context, ≤ 2 rounds)
   ──► 6 Risk gate ─┬─ risk:low  ──► auto-merge (rebase)
                    └─ risk:high ──► [human reviews] ──► merge
   ──► 7 Milestone playtest [human]
```

## Steps

1. **Plan.** Claude turns the PRD and specs into a milestone plan: what ships, in what order, with the risks. The owner approves it.
2. **Tickets.** Claude creates GitHub issues from the plan and adds them to the "Puddles Features" project in Backlog, labeled `agent:draft`. An issue is ready only when it has a goal, acceptance criteria, a test plan, out-of-scope notes and a size.
3. **Approve.** The owner moves approved cards to Ready, which adds `agent:ready`. This is the main way the owner steers the work.
4. **Implement.** An agent takes a ready issue, creates `agent/<issue>-<slug>`, writes failing tests first, makes them pass, and opens a PR that says `Closes #<n>`.
5. **Gates.** CI runs `just check` (see `docs/coding-standards.md`). A red check blocks the merge.
6. **Agent review.** A separate review run with fresh context reads the PR against the issue and the standards. It can request up to 2 rounds of fixes.
7. **Risk gate.** A script labels the PR `risk:low` or `risk:high`. Low-risk PRs auto-merge when gates and review pass. High-risk PRs wait for the owner.
8. **Playtest.** At each product milestone (P0–P3 in the PRD), the owner plays with real kids and records notes in `docs/playtests/`.

## When a human is involved

| Always | Only when escalated |
| --- | --- |
| Approving milestone plans and ADRs | Unclear acceptance criteria |
| Moving tickets to Ready | ADR conflicts |
| Reviewing `risk:high` PRs | CI failing 3 times in a row |
| Milestone playtests | Review going past 2 rounds |
| New dependencies, secrets, billing | Diffs growing past 400 lines |

When escalating, the agent stops, labels the issue `needs-human`, and comments with what it needs.

## Risk

A PR is `risk:high` if any of these hold. Agents can raise the risk level, never lower it.

- Touches `.github/`, `.claude/`, `AGENTS.md`, `docs/adr/` or `shared/`
- Touches lint, type, test or coverage settings, thresholds or exclusion lists
- Touches dependency manifests or lockfiles
- Touches eval thresholds or the test set
- Changes more than 400 lines
- Deletes tests, lowers coverage, or adds a lint or type suppression
- The review agent flags it

Everything else is `risk:low`.

## Branching

- Trunk-based: `main` is protected and always green.
- One issue, one short-lived branch, one PR.
- PRs are rebase-merged so `main` keeps a linear history of small commits. Branches are deleted on merge.
- Product milestones are tagged `p0`, `p1`, and so on.

## Board and labels

| Board status | Meaning | Label |
| --- | --- | --- |
| Backlog | Drafted, waiting for approval | `agent:draft` |
| Ready | Approved for an agent | `agent:ready` |
| In progress | An agent or human is working on it | `agent:in-progress` |
| In review | PR open | |
| Done | Merged | |

Other labels: `needs-human`, `risk:low`, `risk:high`, `agent-authored`, `human-revised` (agent output the owner rejected or reshaped).

## Running agents

- Agents run in GitHub Actions with `anthropics/claude-code-action`, authenticated with the owner's Claude subscription token.
- At most 2 agent runs at once, each with a turn limit and a timeout.
- Setting the repository variable `AGENTS_PAUSED=true` stops all agent workflows.
- Only issues and comments from the owner can start an agent.
- The game's own Claude API calls (teacher labels, frontier baselines) use a separate API key with a spend cap. Play itself is fully offline.

## Learning loop

Every `human-revised` PR ends with an update to `AGENTS.md` or `docs/coding-standards.md`, so the same mistake doesn't happen twice. Each milestone gets a short retro on what agents got wrong and which rules changed.

## Status

| Piece | Issue |
| --- | --- |
| `just check` gates and CI | #1 (done) |
| These docs and ADRs | #2 |
| Claude Code hooks and commands | #3 |
| Templates, CODEOWNERS, ruleset, board automation | #4 |
| Risk gate, auto-merge, extra CI checks | #5 |
| Agent implement and review workflows | #6 |

Until #5 and #6 land, the owner merges every PR by hand.
