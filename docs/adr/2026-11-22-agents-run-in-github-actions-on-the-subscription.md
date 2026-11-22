# Agents run in GitHub Actions on the Claude subscription

## Decision

- Implementation and review agents run in GitHub Actions with `anthropics/claude-code-action`, triggered by issue labels and PR events.
- They authenticate with the owner's Claude subscription token, not an API key.
- Runs are capped: limited concurrency, turn limits, timeouts, and a repository variable that pauses all agents.
- The game's own Claude API calls (teacher labels, frontier baselines) use a separate API key with a spend cap.

## Why

- Work moves forward without the owner's machine being on, and every run is logged next to the PR it produced.
- The subscription already covers Claude Code usage; API billing would add cost for the same work.

## Rejected

- **Local agent loop only.** Easier to start, but ties progress to the owner's laptop and leaves no CI audit trail.
- **API key for agents.** Pay-per-use on top of an existing subscription.
