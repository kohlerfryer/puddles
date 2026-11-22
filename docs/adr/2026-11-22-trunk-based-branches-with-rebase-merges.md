# Trunk-based branches with rebase merges

## Decision

- `main` is the only long-lived branch. It is protected and always green.
- Each issue gets one short-lived branch (`agent/<issue>-<slug>` or `mk/<slug>`) and one PR.
- PRs are rebase-merged, keeping every small commit on a linear `main`. Branches are deleted on merge.
- Product milestones are marked with tags, not release branches.

## Why

- Agents work best on small, isolated changes that merge quickly; long-lived branches pile up conflicts between parallel agents.
- The commit history is part of the portfolio. Rebase merges keep each focused commit visible, which squash merges would hide.

## Rejected

- **Git flow with `develop` and release branches.** Overhead with no benefit for a single-owner project that ships continuously.
- **Squash merges.** Simpler history, but loses the per-commit story of how agent work was shaped.
