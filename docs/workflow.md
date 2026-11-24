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
| New dependencies, secrets, billing | Diffs growing past 400 non-test lines |

When escalating, the agent stops, labels the issue `needs-human`, and comments with what it needs.

## Risk

A PR is `risk:high` if any of these hold. `scripts/risk.py` decides, reading the high-risk paths from `.github/CODEOWNERS`. Agents and reviewers can raise the risk level by adding the `risk:high` label; nothing lowers it.

- Touches `.github/`, `.claude/`, `AGENTS.md`, `docs/adr/` or `shared/`
- Touches lint, type, test or coverage settings, thresholds or exclusion lists
- Touches dependency manifests or lockfiles
- Touches eval thresholds or the test set
- Changes more than 400 lines, not counting tests or lockfiles
- Deletes tests, lowers coverage, or adds a lint or type suppression
- The review agent flags it

Everything else is `risk:low`.

The `risk gate` workflow runs on every PR update and review. Low risk: it adds `risk:low` and turns on rebase auto-merge, so the PR merges once the required checks pass. High risk: it adds `risk:high`, turns auto-merge off, and fails until the owner approves (PRs the owner authored pass, since GitHub doesn't allow self-approval). A separate `tests touched` check fails when source code changes without any test changing.

## CI

| Check | When | Fails on |
| --- | --- | --- |
| `just check` | every PR, push to `main`, nightly | any gate in `docs/coding-standards.md` |
| Diff coverage | PRs | under 90% of changed lines covered |
| `tests touched` | PRs | source changed without a test changing |
| `risk gate` | PRs and reviews | high risk without the owner's approval |
| `secrets scan` | every run | gitleaks finds a secret in history |
| `dependency review` | PRs | a new dependency with a moderate or worse vulnerability |

When CI fails on `main`, the `main red` workflow opens one `needs-human` issue naming the commit. Fix forward or revert in a PR; agents don't start new work while it's open.

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

Agents set the board status with `gh project item-edit` as they work (see the `/work-issue` skill). The project's built-in workflows cover the rest; turn these on once in the project's Workflows settings:

- **Auto-add to project:** issues from `kohlerfryer/puddles`, so new tickets land on the board.
- **Item closed** and **Pull request merged:** set Status to Done.
- **Pull request linked to issue:** set Status to In review.

## Repository settings

`main` is protected by the ruleset in `.github/rulesets/main.json`: PRs only, linear history, no force pushes or deletion, the `just check` status check, resolved review threads, and code-owner review for the high-risk paths in `.github/CODEOWNERS`. Only rebase merges are allowed, and branches are deleted on merge. The owner applies changes to these with `just github-settings`. Admins can bypass the review rule on their own PRs, since GitHub doesn't let authors approve their own work.

New issues use the Task form in `.github/ISSUE_TEMPLATE/task.yml`, which requires the Definition of Ready fields. PRs start from `.github/pull_request_template.md`.

## Running agents

Two workflows run Claude Code with `anthropics/claude-code-action`, authenticated with the owner's subscription token (`CLAUDE_CODE_OAUTH_TOKEN` secret):

- **`agent implement`** starts when the owner labels an issue `agent:ready`, when the owner or the manager routine merges to `main`, every 15 minutes, or by hand. A push only re-dispatches the workflow by hand, since `claude-code-action` refuses push events. Auto-merges by `github-actions[bot]` don't trigger workflows, so slots they free are filled by the next 15-minute run. `scripts/agent_dispatch.py` picks the oldest ready issues whose `Blocked by` issues are closed, filling free slots up to 4 in progress, unless a "main is red" issue is open. An issue may list the files or folders it changes on a `Touches: path/one, path/two/` line; dispatch never starts it while an in-progress or just-picked issue touches an overlapping path, and says which issue it waits for. Issues without the line never wait on paths. The agent runs `/work-issue` and opens a PR as `claude[bot]`. A failed or timed-out run labels the issue `needs-human`, and each run's summary shows the agent's report. Before picking, dispatch closes `agent:in-progress` issues whose PR merged after their latest in-progress label, because GitHub doesn't apply `Closes #n` when `github-actions[bot]` performs the auto-merge. Dispatch runs one at a time; every dispatch starts as many unblocked issues as there are free slots, each in its own parallel job.
- **`agent review`** runs `/review-pr` on every non-draft PR from the owner or `claude[bot]`. The verdict is posted by `github-actions[bot]`, since `claude[bot]` can't review its own PRs. Requesting changes fails the required `agent review` check, which blocks auto-merge. On agent PRs, an agent then fixes the points and pushes, which triggers a fresh review. After 2 fix rounds the PR is labeled `needs-human`.

Limits and controls:

- Each run has a turn limit and a timeout, and the model is pinned in the workflow.
- Agent steps set `PUDDLES_AGENT=ci`, so the guard hook stops them merging PRs or editing gate files.
- Only the owner's `agent:ready` label starts work from an issue event; agents never start agents.
- Setting the repository variable `AGENTS_PAUSED=true` stops both workflows. While paused, the review check is skipped, so the owner should hold merges.
- The game's own Claude API calls (teacher labels, frontier baselines) use a separate API key with a spend cap. Play itself is fully offline.

## Learning loop

Every `human-revised` PR ends with an update to `AGENTS.md` or `docs/coding-standards.md`, so the same mistake doesn't happen twice. Each milestone gets a short retro on what agents got wrong and which rules changed.

## Status

| Piece | Issue |
| --- | --- |
| `just check` gates and CI | #1 (done) |
| These docs and ADRs | #2 (done) |
| Claude Code hooks and commands | #3 (done) |
| Templates, CODEOWNERS, ruleset, board automation | #4 (done) |
| Risk gate, auto-merge, extra CI checks | #5 (done) |
| Agent implement and review workflows | #6 (done) |

