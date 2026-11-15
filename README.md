# CodeVerse Orbit

> Fly through GitHub, together.

CodeVerse Orbit is a multiplayer space game set inside real GitHub data. Repositories are planets,
recent commits are collectibles in orbit around them, and every GitHub user or organization is a
universe you can hyperjump into.

Everyone starts in the **trending hub**: GitHub's monthly trending repositories circling a shared
sun. Find the hyperjump gate on the outer rim, type any username, and warp into their universe.
Other pilots in the same universe fly beside you in real time.

The original, calmer **explorer** is still part of the app at `/explorer/`.

**Live:** <https://codeverse-orbit.vercel.app> (multiplayer goes through a relay hosted on Render; see [Deployment](docs/deployment.md))

## Features

- **Real data, real places.** Universes are built from GitHub's public API: trending repositories, or a user's own repositories ranked by importance. Planet colour and surface come from the repository's language.
- **Hyperjump gate.** Each universe has one gate in an outer band past the last planet. It moves to a new random spot every three minutes, the same spot for every pilot, and an on-screen arrow always points to it.
- **Three ships.** *Dart* (balanced), *Wasp* (fast, rapid fire, light hull) and *Titan* (armoured, three-way heavy cannon), in six colours, previewed in a 3D hangar.
- **Four alien types.** Saucers strafe and shoot, hunters ram, swarmer drones weave in packs, and every fifth wave a mothership boss rings the area with fire and launches swarmers.
- **Gravity beam.** Grab a planet or an alien, drag it, and fling it. Flung planets smash aliens and knock other planets out of orbit, and every pilot in the universe sees it.
- **The CodeVerse comet.** One comet crosses every universe on a new random path every two minutes. Fly near it for a link to this repository, and through it for a bonus.
- **Commits as power.** Fly through a planet's gold satellites to collect its real recent commits. They charge a supernova that clears the area.
- **Onboarding.** A lobby over the live universe, then a six-step first flight that ticks off as you actually do each thing.
- **Multiplayer.** A small WebSocket relay syncs ships, shots, flung planets and supernovas, up to 24 pilots per universe.
- **Touch support.** On-screen stick plus Fire, Grab and Nova buttons.

## Quick start

Requires Node.js 22.6 or newer.

```bash
cd viewer
npm install --legacy-peer-deps
npm run dev
```

Open <http://localhost:5173/> for the game or <http://localhost:5173/explorer/> for the explorer.
To try multiplayer, open the game in a second tab and pick a different callsign.

| Key | Action |
|---|---|
| W / S | Thrust where the nose points / reverse |
| A / D | Strafe (with a mouse) or turn (keyboard only) |
| Mouse, click or Space | Aim and fire |
| Shift | Boost |
| E or hold right-click | Gravity beam: hold to grab, release to fling |
| Q | Supernova, when the bar is full |
| H | Controls sheet |

## Documentation

| Guide | What it covers |
|---|---|
| [Getting started](docs/getting-started.md) | Install, run, build, environment variables, troubleshooting |
| [Gameplay](docs/game/gameplay.md) | Ships, aliens, waves, scoring, the gate, the first flight |
| [Architecture](docs/architecture.md) | How the pages, simulation, scene, relay and data fit together |
| [Simulation](docs/game/simulation.md) | The game loop, entities, tuning tables and tests |
| [Multiplayer protocol](docs/game/multiplayer.md) | Rooms, messages, validation, limits, what is and isn't shared |
| [Deployment](docs/deployment.md) | `npm start`, Vercel, and hosting the relay |
| [Contributing](docs/contributing.md) | Workflow, checks, code conventions |
| [Explorer](docs/explorer.md) | The non-game explorer at `/explorer/`, the local history viewer, the Oracle |
| [Analyzer](docs/analyzer.md) | The Python exporter for full local Git history |

The full index is in [docs/README.md](docs/README.md).

## Repository layout

```
├── viewer/                  Web app (Vite + React + React Three Fiber)
│   ├── index.html           The game, served at /
│   ├── explorer/index.html  The explorer, served at /explorer/ and /@handle
│   ├── src/game/            Game: simulation, 3D scene, UI, tutorial, networking
│   ├── src/github/          GitHub client, planet styling, explorer UI
│   ├── src/scene/           Shared shader planets and sun
│   ├── server/              Node server: GitHub proxy, trending, Oracle, multiplayer relay
│   ├── api/                 Vercel serverless functions
│   └── tests/               node:test suites
├── analyzer/                Python package: Git history → JSON bundle
├── docs/                    Documentation
└── game/                    Earlier single-file prototype (snapshot data, no multiplayer)
```

## Verification

```bash
cd viewer
npx tsc -b
npm run lint
npm test
npm run build
```

CI runs the same steps on every push and pull request, plus the analyzer's `pytest` suite.

## Known limits

- The relay keeps rooms in one process's memory. Multiplayer needs the included Node server (`npm run dev`, `npm run preview`, `npm start`) or the standalone relay (`npm run relay`, deployed on Render for the live site). Without either, the game runs solo and says so in the HUD.
- On Render's free plan the relay sleeps when idle; the first connection after that can take up to a minute.
- Aliens are simulated on each player's machine; two pilots in one universe fight different alien waves.
- GitHub's unauthenticated API rate limit applies when loading universes and commits.
- The gate's position is computed from each player's clock, so a clock that is minutes off shows an outdated spot.
