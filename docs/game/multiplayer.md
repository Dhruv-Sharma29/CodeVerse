# Multiplayer protocol

The relay (`viewer/server/multiplayer.mjs`) is a WebSocket server at **`/api/play`**. It validates
and forwards messages between pilots in the same universe. It runs no game logic and stores
nothing on disk.

## Rooms

A room is one universe:

- `trending`: the hub
- `u:<login>`: a GitHub account, lowercase, matching `^u:[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$`

A client is in at most one room. Joining another room leaves the previous one.

## What is shared

| Shared with the room | Local to each pilot |
|---|---|
| Ship position, heading, velocity, hull points (10 Hz) | Aliens and waves |
| Shots (as they are fired) | Score, kills, charge, commits |
| Held and flung planets (10 Hz while active) | Tutorial progress |
| Supernovas, explosions | Particles and effects |
| Name, colour, hull | |

The gate and the comet need no messages: every client computes them from the room name and the clock.

## Messages

All messages are JSON objects with a `t` field.

### Client → server

| `t` | Fields | Effect |
|---|---|---|
| `join` | `room`, `name`, `color`, `hull` | Enter a room. Replies `welcome`; others get `joined`. |
| `state` | `x`, `z`, `a`, `vx`, `vz`, `hp` | Ship state, relayed as `state` |
| `shot` | `x`, `z`, `a` | Relayed as `shot` |
| `grab` | `planet`, `x`, `z`, `vx`, `vz`, `held` | Planet throw, relayed as `grab` |
| `nova` | `x`, `z` | Relayed as `nova` |
| `boom` | `x`, `z` | Relayed as `boom` |
| `rooms` | — | Replies with `rooms`; allowed before joining (the lobby uses it) |

### Server → client

| `t` | Fields |
|---|---|
| `welcome` | `id`, `room`, `peers: [{ id, name, color, hull, state }]` |
| `joined` | `id`, `name`, `color`, `hull` |
| `left` | `id` |
| `state`, `shot`, `grab`, `nova`, `boom` | The sender's fields plus `id` |
| `rooms` | `rooms: [{ room, count }]`, busiest 12 |
| `error` | `message` (invalid room, room full) |

## Validation and limits

| Rule | Value |
|---|---|
| Message size | 1,024 bytes; larger messages are dropped |
| Rate | 40 messages per second per client; extra messages are dropped |
| Pilots per room | 24 |
| Connections per server | 400 |
| Names | Letters, digits, space, `_ . -`; at most 18 characters; default `Pilot` |
| Colours | `#rrggbb`, otherwise `#74e2ff` |
| Hulls | `dart`, `wasp` or `titan`, otherwise `dart` |
| Numbers | Finite, clamped, rounded to two decimals |
| Liveness | Ping every 20 s; silent connections are closed |

Upgrade requests on other paths are ignored, so Vite's hot-reload socket keeps working.

The client (`src/game/net.ts`) reconnects with exponential backoff capped at 15 seconds and
re-sends its last `join` after reconnecting.

## Trust model

Clients are not trusted to be honest about gameplay: a modified client could report any position
or throw any planet in its room. Because scores are not stored or ranked, the relay only enforces
shape and rate limits. Persistent leaderboards would need server-side simulation or verification.

## Scaling

Rooms live in one process's memory. Running several instances would split pilots across them; that
needs a shared pub/sub (for example Redis) behind the relay. Tests: `viewer/tests/multiplayer.test.mjs`.
