# Agent commits carry a Claude co-author trailer

## Decision

Every commit written by an agent ends with a `Co-Authored-By: Claude` trailer. This overrides the owner's global commit convention of no AI attribution, for this repo only. PRs also carry `agent-authored` or `human-revised` labels.

## Why

The project exists to show agentic development done well. Making agent authorship visible in history lets reviewers see how much was agent-written and how it was shaped.

## Rejected

- **No attribution.** Matches the global convention but hides the thing the portfolio demonstrates.
- **Labels only.** Visible on GitHub but lost from `git log` and any clone.
