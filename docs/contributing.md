# Contributing

## Workflow

1. Branch from `main`.
2. Make focused changes; keep game rules in `src/game/sim.ts` and rendering in `GameScene.tsx`.
3. Run the checks below before opening a pull request.
4. Describe what changed, how you tested it, and anything not verified (for example, only tested on desktop).

## Required checks

From `viewer/`:

```bash
npx tsc -b       # strict TypeScript
npm run lint     # oxlint: errors fail CI
npm test         # node:test suites in tests/
npm run build
```

For analyzer changes, from `analyzer/`: `uv run pytest tests -q`.

CI (`.github/workflows/`) runs all of these on every push and pull request.

## Conventions

- **Simulation first.** New mechanics go into `sim.ts` with a small test in `tests/orbitSim.test.mjs`. The scene only draws what the simulation says.
- **No per-frame React state.** Update three.js objects in `useFrame`; sample into React state at most ten times a second.
- **No randomness during render.** Seed it (`seedFor`) or compute it once; random values in render code re-run on every re-render and cause flicker.
- **Multiplayer changes** update the relay's validation, `tests/multiplayer.test.mjs`, and [game/multiplayer.md](game/multiplayer.md) together.
- **Secrets stay server-side.** No tokens or keys in client code.
- **Accessibility.** Interactive elements are buttons or inputs with labels; respect `prefers-reduced-motion`.
- **Comments explain why**, not what. Mark known shortcuts with a `ponytail:` comment naming the limit and the upgrade path.

## Docs

Update the matching page in `docs/` when behaviour, limits or setup change. Numbers in the docs
(speeds, limits, intervals) come from the code; check them when you change a constant.
