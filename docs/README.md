# CodeVerse documentation

## Game

| Document | What it covers |
|---|---|
| [getting-started.md](getting-started.md) | Install, run, build, environment variables, troubleshooting |
| [game/gameplay.md](game/gameplay.md) | Ships, aliens, waves, scoring, the hyperjump gate, the first-flight tutorial |
| [architecture.md](architecture.md) | Pages, simulation, 3D scene, relay and data sources, and how they connect |
| [game/simulation.md](game/simulation.md) | The step loop, entities, tuning tables, collision rules, tests |
| [game/multiplayer.md](game/multiplayer.md) | Relay protocol: rooms, messages, validation, limits, what is shared |
| [deployment.md](deployment.md) | Production server, Vercel, hosting the relay |
| [contributing.md](contributing.md) | Workflow, required checks, conventions |

## Explorer, analyzer and Oracle

| Document | What it covers |
|---|---|
| [explorer.md](explorer.md) | The non-game explorer at `/explorer/`, the local history viewer |
| [analyzer.md](analyzer.md) | The Python `codeverse analyze` exporter |
| [bundle-schema.md](bundle-schema.md) | JSON contract between the analyzer and the local history viewer |
| [oracle.md](oracle.md) | Commit messages, diffs and optional cited AI explanations |
| [github-proxy.md](github-proxy.md) | The optional server-side GitHub proxy |

## Planning

| Document | What it covers |
|---|---|
| [PLAN.md](PLAN.md) | Original build plan: product definition, architecture, roadmap, risks |
| [social-layer.md](social-layer.md) | **Proposal.** Sharing, profiles and discovery, with cost and consent constraints |

## Status at a glance

**Built:** the multiplayer game at `/` (three ships, four alien types, gravity beam, supernova,
moving hyperjump gate, lobby and tutorial, WebSocket relay); the GitHub explorer at `/explorer/`;
the local history viewer; the `codeverse analyze` exporter; the commit Oracle.

**Not built:** server-authoritative aliens, persistent scores or accounts, a hosted relay on the
production deployment, and the proposals in [social-layer.md](social-layer.md).

## Conventions

- Decorative and analytical encodings stay separate. In the explorer, rings are decoration; size, colour and heat carry data.
- Honest names: "test presence", not "coverage"; "likely bug-fix commits", not "bugs".
- No provider secrets in browser code. Tokens and keys live server-side.
