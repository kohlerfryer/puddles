# Game logic lives in core, drawing lives in render

## Decision

- `game/src/core/` holds all game logic as plain TypeScript with no PixiJS or DOM imports: the world model, validator, script runner, idle behaviour, physics wrapper and gesture detection. It is unit-tested and measured for coverage.
- `game/src/render/` only draws and reads input (PixiJS, camera). It is excluded from coverage and from the tests-touched check, together with `game/src/main.ts`.
- Each verb is a tested plan in `core/`: given the duck's state, the world and a target, it returns timed movements. Rendering plays those plans and never decides behaviour.
- Matter.js runs inside `core/` because it works headlessly, so sticker physics is tested.
- Libraries: PixiJS for drawing, Matter.js for stickers, MediaPipe Tasks Vision for pose and hands in the browser. They are added up front because CI agents can't edit dependency manifests.

## Why

- PixiJS needs a GPU, so drawing code can't be unit-tested in CI. Keeping it thin means almost everything that can break is covered.
- Verbs as data make Puddles' behaviour testable and easy for agents to extend one verb at a time.

## Rejected

- **Testing rendering with screenshots or a headless GPU.** Slow and flaky for a placeholder-art game.
- **Putting behaviour in PixiJS display objects.** Untestable, and it mixes what Puddles does with how it looks.
