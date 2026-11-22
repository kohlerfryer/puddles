---
name: review-pr
description: Review a PR against its issue and the repo standards with fresh eyes. Use for /review-pr <number> and in the agent review workflow.
---

# Review a PR

Review as someone who didn't write it.

1. Read the PR (`gh pr view <n>`, `gh pr diff <n>`), its linked issue, `AGENTS.md`, `docs/coding-standards.md`, and ADRs touching the changed areas.
2. Check, in order:
   - **Correctness:** run `/code-review` on the diff for bugs. Confirm each finding before reporting it.
   - **Acceptance criteria:** every one is met and proven by a test that would fail without the change.
   - **Scope:** nothing beyond the issue; no speculative options, dead code, commented-out code, or `TODO` without an issue.
   - **Fit:** matches the patterns around it; no new dependency without a reason.
   - **Gates:** no loosened limits, coverage exclusions, or unexplained suppressions.
   - **Risk:** say whether it should be `risk:high` (gates, agent config, ADRs, `shared/`, dependencies, > 400 lines, deleted tests).
3. Post the result with `gh pr review <n>`: `--approve` when nothing blocks, otherwise `--request-changes` with each issue as `file:line`: problem and fix. Style preferences that the linters don't enforce are comments, not blockers.
