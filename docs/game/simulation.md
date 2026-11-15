# Simulation

`viewer/src/game/sim.ts` holds every game rule. It has no React or three.js imports, so the
browser and the Node tests run the same code.

## API

| Export | Purpose |
|---|---|
| `createSim(universe)` | New simulation for a universe: planets on orbits, ship at the spawn point, gate placed |
| `step(sim, input, dt, events)` | Advance one frame; pushes `SimEvent`s describing what happened |
| `emptyInput()` | Neutral input object |
| `leavePortal(sim)` | Move the ship out of the gate after the dialog closes |
| `remoteGrab(sim, msg)` | Apply another pilot's planet throw |
| `explode(sim, x, z, colour, …)` | Particles and flash |
| `gateSpot(room, edge, epoch)` | Deterministic gate position |
| `HULLS`, `ALIENS` | Tuning tables for ships and aliens |

## Step order

1. **Gate:** if the three-minute window changed (and the hyperjump dialog isn't open), move the gate and emit `gate`.
2. **Planets:** orbit, held, flung, returning, or moved by a remote pilot.
3. **Ship:** facing (mouse aim, auto-aim on touch, or keyboard turn), thrust along the nose, drag, speed cap, engine trail, sun and edge limits, planet collision, firing, supernova, nearest planet, commits, gate entry.
4. **Gravity beam:** grab, hold (spring toward a point in front of the ship, damped relative to the ship, kept clear of it), or fling.
5. **Aliens:** spawn the next wave when clear; per-kind behaviour; separation from each other; planet avoidance and collision.
6. **Bullets, supernovas, particles, flashes.**

## Coordinates and units

The play field is the x–z plane; y is only visual height. Angles are radians with `0` along +x.
Distances are world units: the sun's radius is 8, the gate's radius is 6, and planet orbits start at
46 and are spaced 24 apart. The edge of the map is the last orbit plus 90, and at least 320.

## Damage model

- Bullets deal their `dmg` (1, or 2 from the Titan).
- "Instant" sources — held or flung planets, supernovas, flung-alien blasts — call `damageAlien(…, 99)`. Normal aliens die; the mothership takes a capped 12 at most every 0.6 s.
- `killAlien` awards score and charge only when the kill is credited to this pilot.

## Tests

`viewer/tests/orbitSim.test.mjs` covers:

- shooting kills and scores; aim assist
- grabbing and flinging a planet
- the gate triggering once, sitting in the outer band, and being deterministic per room and window
- supernova clearing aliens
- ship-relative thrust
- hull firepower (Titan's spread)
- the mothership arriving on wave 5 and taking capped heavy damage
- aliens not passing through planets
- the ship never entering a planet it is holding

Run them with `npm test` from `viewer/`.
