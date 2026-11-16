# 07 — Testing

**105 tests in `viewer/`, 5 in `analyzer/`, no network calls.** Every suite runs in plain Node
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
| `orbitSim.test.mjs` | 13 | The game rules: shooting and aim assist, gravity grab and fling, gate placement and triggering, comet path and once-per-crossing bonus, supernova, ship-relative thrust, hull firepower, the mothership's capped damage, aliens not passing through planets, the ship never entering a held planet, dogfight damage from any other pilot, kill credit, the respawn shield, and ping labels, per-pilot caps and expiry |
| `multiplayer.test.mjs` | 5 | The relay: rooms are separate, names and colours are cleaned, invalid rooms are refused, leaving is broadcast, hulls fall back, the origin allow-list refuses other sites, dogfight state, kill announcements, emotes and pings are relayed and validated, and `/stats` counts sessions, company and hyperjumps without pilot data |
| `events.test.mjs` | 6 | World events: storm schedule and determinism, meteor hits and shooting, the bounty pick, hold-the-gate scoring and contesting, the daily challenge, and evenly spread seeded randomness |
| `traits.test.mjs` | 5 | Real-data planets: language physics, issue-rock counts, activity glow, closing an issue, star shields, and bouncy planets ricocheting |
| `feel.test.mjs` | 3 | Gamepad mapping and dead zone, music tuning, floating damage numbers, and the follow-cam's memory of who shot you down |
| `tilt.test.mjs` | 3 | Tilt-to-steer: portrait and both landscape orientations map to the same screen directions; dead zone and linear ramp |
| `invite.test.mjs` | 1 | Invite links: a valid GitHub login opens that universe; anything else falls back to the trending hub |
| `board.test.mjs` | 4 | Leaderboards and checks: honest runs reach both boards (the daily board counts only points earned in that universe), invalid rooms are refused, score jumps, speed and hull hacks are flagged and left off, the Upstash pipeline commands, and the keep-warm window |
| `settings.test.mjs` | 3 | Settings: rebinding swaps a taken key and refuses reserved keys, saved bindings fall back safely, and Auto quality picks Low only on small touch devices |
| `net.test.mjs` | 2 | The client connection: a sleeping hosted relay reports "waking" without flicker and then goes online; a refused local server reports "offline" |
| `orbitalPhysics.test.mjs` | 2 | Explorer orbits and collision separation |
| `github.test.mjs` | 22 | GitHub client (including README decoding for docking), profile routes, profile share metadata |
| `readme.test.mjs` | 3 | Docking's README excerpt: no badges, headings, HTML, code or lists; one solid paragraph; clean cuts |
| `oracle.test.mjs` | 11 | The Oracle's evidence bounds, citations, budgets and origin checks |
| `bundle.test.mjs`, `labelLayout.test.mjs`, `moons.test.mjs`, `githubProxy.test.mjs`, `githubMoonFallback.test.mjs`, `githubClientProxy.test.mjs` | 22 | Explorer bundle loading, label layout, moons and the GitHub proxy |

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

- Tilt-to-steer and the motion permission prompt on a real phone (the maths is unit-tested; the
  sensors and iOS permission flow need a device).
- Full screen and the home-screen install on real phones.
- A physical gamepad (the mapping is unit-tested against the standard layout) and how the music sounds.

- Several real players at once, and the relay under load.
- Frame rate on low-end phones, especially with a mothership on screen.
- GitHub's markup changing under the trending scraper (it fails visibly, but the failure is not
  rehearsed in a test).
