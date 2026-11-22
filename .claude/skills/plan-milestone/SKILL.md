---
name: plan-milestone
description: Turn the PRD and specs into a milestone plan for the owner to approve. Use for /plan-milestone or before creating tickets for a new milestone.
---

# Plan a milestone

1. Read `AGENTS.md`, `docs/workflow.md`, the ADR index, and the PRD sections for the milestone (the link is in `AGENTS.md`).
2. List what already exists: `gh issue list --state all --limit 100` and the "Puddles Features" project.
3. Write the plan:
   - **Goal:** the product milestone it delivers (P0–P3) and its pass signal.
   - **Slices:** an ordered list of PR-sized pieces (each under ~400 lines), each with a one-line outcome and what it depends on.
   - **Spikes first:** anything uncertain becomes a time-boxed spike with a pass rule and a fallback.
   - **Risks:** what could change the plan, and which slices are `risk:high`.
4. Present the plan in chat and stop. Do not create issues until the owner approves; then use `/create-tickets`.
