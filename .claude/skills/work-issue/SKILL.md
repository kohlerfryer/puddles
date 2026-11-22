---
name: work-issue
description: Implement one GitHub issue end to end, test-first, ending in a PR. Use for /work-issue <number> or when an agent picks up an agent:ready issue.
---

# Work an issue

1. **Read.** `gh issue view <n>`. Stop if it lacks testable acceptance criteria or a `Blocked by` issue is still open. Read `AGENTS.md`, `docs/coding-standards.md` and every ADR touching the area.
2. **Claim.** Add `agent:in-progress`, remove `agent:ready`, and set the board Status to In progress.
3. **Branch.** `git switch main && git pull --rebase && git switch -c agent/<n>-<slug>`.
4. **Test first.** Write a failing test for each acceptance criterion, run it, and see it fail for the right reason.
5. **Implement** the smallest change that passes. Stay inside the issue's scope; note anything else as a follow-up instead of doing it.
6. **Gate.** `just check` must pass. On failure, run `just report` and fix each violation it lists. Never loosen a limit or add a suppression to get green.
7. **Commit** in focused batches: one short line each, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Each commit must pass on its own.
8. **PR.** Push and run `gh pr create` with `Closes #<n>` and sections: What changed, Why, How it was tested, Agent notes, Not done. Labels: `agent-authored`, plus `risk:high` if it touches gates, agent config, ADRs, `shared/` or dependencies. Set the board Status to In review.

Escalate instead of pushing on: label `needs-human` and comment why when the criteria are unclear, an ADR conflicts, CI fails 3 times, or the diff grows past 400 lines.
