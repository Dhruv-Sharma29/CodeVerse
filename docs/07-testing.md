# 07 — Testing

**72 tests in `viewer/`, 5 in `analyzer/`, no network calls.** Every suite runs in plain Node
(22.6+, native TypeScript stripping) or `pytest`. CI runs all of them, plus type-checking, lint and
the production build, on every push and pull request.

```console
$ cd viewer
$ npx tsc -b && npm run lint && npm test && npm run build
$ cd ../analyzer && uv run pytest tests -q
```

## What is covered

| Suite | Tests | What it pins down |
|---|---|---|
| `orbitSim.test.mjs` | 12 | The game rules: shooting and aim assist, gravity grab and fling, gate placement and triggering, comet path and once-per-crossing bonus, supernova, ship-relative thrust, hull firepower, the mothership's capped damage, aliens not passing through planets, the ship never entering a held planet, dogfight damage from any other pilot, kill credit, and the respawn shield |
| `multiplayer.test.mjs` | 3 | The relay: rooms are separate, names and colours are cleaned, invalid rooms are refused, leaving is broadcast, hulls fall back, the origin allow-list refuses other sites, dogfight state, kill announcements and emotes are relayed and validated |
| `net.test.mjs` | 2 | The client connection: a sleeping hosted relay reports "waking" without flicker and then goes online; a refused local server reports "offline" |
| `orbitalPhysics.test.mjs` | 2 | Explorer orbits and collision separation |
| `github.test.mjs` | 21 | GitHub client, profile routes, profile share metadata |
| `oracle.test.mjs` | 11 | The Oracle's evidence bounds, citations, budgets and origin checks |
| `bundle.test.mjs`, `labelLayout.test.mjs`, `moons.test.mjs`, `githubProxy.test.mjs`, `githubMoonFallback.test.mjs`, `githubClientProxy.test.mjs` | 21 | Explorer bundle loading, label layout, moons and the GitHub proxy |

## Checks that are not unit tests

Some things only show up in a real browser or on the real hosting, so they were checked by hand
and are listed here so nobody mistakes them for automated coverage:

- **Rendering.** Lobby, hangar preview, combat with every alien type, the mothership bar, the gate
  arrow, the comet, the waking message, and the phone layout were checked visually.
- **Two pilots.** Two browser tabs as two pilots: seeing each other, hyperjumping together, a thrown
  planet moving on the other screen, dogfight damage arriving through the relay (100 → 76 for three
  hits), and the kill feed on both sides.
- **Deployed relay.** `npm run check:relay -- <url>` tests `/health`, a WebSocket from the site's
  origin, and refusal of other origins. It passed against the Render relay.

## What is not tested

- Several real players at once, and the relay under load.
- Frame rate on low-end phones, especially with a mothership on screen.
- GitHub's markup changing under the trending scraper (it fails visibly, but the failure is not
  rehearsed in a test).
