# Risk decides who merges

## Decision

- A deterministic script labels every PR `risk:low` or `risk:high`.
- Low-risk PRs merge automatically once the gates and the agent review pass.
- High-risk PRs wait for the owner's approval. High risk covers anything that could weaken the gates or change shared contracts: CI, agent config, ADRs, the shared schema, quality settings, dependencies, eval thresholds, large diffs, deleted tests, lowered coverage and new suppressions.
- Agents may raise the risk level and never lower it.

## Why

- The owner wants to be involved only where judgment matters. Reviewing every PR would turn the owner into the bottleneck and hide the point of the gates.
- Rules in a script are predictable and testable; an agent's own judgment of risk is not.

## Rejected

- **Owner reviews every PR.** Safe but slow, and doesn't show that the gates work.
- **Agents merge everything that passes CI.** An agent could loosen a gate and merge its own change.
