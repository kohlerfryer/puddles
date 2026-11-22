---
name: create-tickets
description: Create GitHub issues from an approved plan, ready for agents. Use for /create-tickets after the owner approves a milestone plan.
---

# Create tickets

Only run this for a plan the owner approved.

For each slice, create one issue with `gh issue create`, using exactly these sections:

```md
## Goal
One or two sentences on the outcome.

## Acceptance criteria
- [ ] Observable, testable statements

## Test plan
How the tests prove each criterion.

## Out of scope
What this issue must not touch.

Blocked by: #<n> (omit when none)
```

Then:

- Labels: `agent:draft`, plus `risk:high` when it touches gates, agent config, ADRs, `shared/` or dependencies.
- Milestone: the GitHub milestone for the plan (create it with `gh api repos/{owner}/{repo}/milestones` if missing).
- Board: `gh project item-add 1 --owner kohlerfryer --url <issue url>`, then set Status to Backlog, Size (XS–XL) and Priority with `gh project item-edit 1 --owner kohlerfryer --url <issue url> --field <name> --value <value>`.

An issue without testable acceptance criteria is not ready. Ask instead of guessing. Finish by listing the issues and asking the owner to move approved ones to Ready.
