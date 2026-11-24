# One small kernel, four plugin kinds, events only

## Decision

- Puddles is a small closed kernel (clock, event log, registry, guardian, executor, save, replay) plus plugins of four kinds: **sense**, **brain**, **skill** and **content** (data packs: props, places, scenes, characters, personalities, bit packs, art and sound packs).
- Plugins talk only through typed events defined in `shared/`; no plugin imports another. Each plugin is a folder with a versioned manifest and its own tests, plus automatic contract tests.
- Every brain output passes the guardian (kid safety, vetted requests, content, privacy, budgets, wellbeing) before anything plays.
- Objects held up to the window become in-world props: library match, then archetype + color, then photo sticker as a fallback.
- Learning is a feature-based bandit over behaviors, rewarded by smile change after each bit; never by session length.
- We migrate in place (strangler pattern) and keep the game playable after every PR. Full spec: `docs/spec/m3-kernel.md`.

## Why

- Open-source contributions stay small and safe: most of them are data or one plugin folder.
- Safety, privacy and determinism live in one place, so brains and content can change freely.
- Replay and a headless simulator make brains, the bandit and new skills testable in CI.

## Rejected

- **Restart in a new repository.** Loses the working agent workflow, tests and the visible history.
- **A full game engine switch (Godot, Phaser now).** Rendering is thin; the value is in `core/`. Revisit Phaser only if `render/` grows a lot.
- **Full reinforcement learning.** Too little data per family; kept as simulator-only future work.
- **Optimizing time on screen.** A dark pattern for kids.
