# codeverse — Documentation

A multiplayer space game built from real GitHub data. Repositories are planets, recent commits
are collectibles, and every GitHub account is a universe you can hyperjump into with other pilots.
The original explorer is still part of the app at `/explorer/`.

These docs are the design record and the reference. Read them in order the first time; use them
as reference afterwards.

## Reading order

| # | Doc | What it settles |
|---|---|---|
| 00 | [Charter](00-charter.md) | Problem, scope, non-goals, what "done" means |
| 01 | [Getting started](01-getting-started.md) | Install, run, build, environment variables, troubleshooting |
| 02 | [Architecture](02-architecture.md) | Pages, modules, the frame loop, the server, design trade-offs |
| 03 | [Gameplay](03-gameplay.md) | Ships, aliens, waves, multiplayer, the gate, the comet, the first flight |
| 04 | [Simulation](04-simulation.md) | The step order, units, damage model, and what the tests pin down |
| 05 | [Multiplayer protocol](05-multiplayer.md) | Rooms, every message, validation, limits, dogfights, trust model |
| 06 | [Deployment](06-deployment.md) | Node server, Vercel, the Render relay, keeping it warm |
| 07 | [Testing](07-testing.md) | Every suite, the manual checks, and what is not tested |
| 08 | [Explorer](08-explorer.md) | The non-game explorer, the local history viewer, the Oracle |
| 09 | [Analyzer](09-analyzer.md) | The Python exporter for full local Git history |
| 10 | [Implementation notes](10-implementation-notes.md) | Where the build proved the plan or earlier code wrong, and why |
| 11 | [Contributing](11-contributing.md) | Workflow, required checks, conventions |

Reference: [bundle schema](bundle-schema.md) · [Oracle](oracle.md) · [GitHub proxy](github-proxy.md) ·
[original build plan](PLAN.md) · [social layer proposal](social-layer.md). What is not done is in
[`REMAINING.md`](../REMAINING.md).

## The one-paragraph version

Most "visualise your GitHub" projects stop at something you look at. This one is built around the
opposite assumption: the data becomes interesting when it is a **place other people are in**. That
means three things the visualisations skip. The game rules live in a plain simulation that runs the
same in the browser and in tests. Multiplayer is a stateless relay rather than a game server, so the
things everyone must agree on (the gate, the comet) are computed from the universe name and the clock
instead of being sent. And there is **no peace mode**: every pilot can fight every other pilot, with
each pilot's own client deciding when it was hit.

## Status

**Live and multiplayer on free hosting.** The game is served by Vercel and the relay by Render,
kept warm during waking hours in India. 94 tests in `viewer/`, 5 in `analyzer/`. See
[07](07-testing.md) for what is checked by hand and [`REMAINING.md`](../REMAINING.md) for what is not
done.

## Conventions used in these docs

- Numbers (speeds, limits, intervals) are taken from the code. When you change a constant, change
  the doc in the same commit.
- "Choice" and "constraint" are used deliberately: a choice could be reversed by deciding
  differently; a constraint needs money, infrastructure or a different design.
- Code snippets are illustrative. The authoritative rules live in `viewer/src/game/sim.ts` and the
  relay in `viewer/server/multiplayer.mjs`.
