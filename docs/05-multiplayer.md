# 05 — Multiplayer protocol

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
| Shots (as they are fired), with damage | Charge, commits |
| Score and dogfight wins (10 Hz, self-reported) | |
| Dogfight kill announcements, emotes, pings | |
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
| `state` | `x`, `z`, `a`, `vx`, `vz`, `hp`, `s` (score), `k` (dogfight wins) | Ship state, relayed as `state` |
| `shot` | `x`, `z`, `a`, `d` (damage 1 or 2) | Relayed as `shot` |
| `killed` | `by` | Sent by a pilot who was shot down in a dogfight; relayed to the whole room (sender included) as `killed` with `id` and `by`, only if `by` is in the room |
| `emote` | `e` (0–5) | Relayed as `emote` |
| `ping` | `x`, `z` | Relayed as `ping`; each client labels it from its own copy of the world |
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
| `state`, `shot`, `grab`, `nova`, `boom`, `emote`, `ping` | The sender's fields plus `id` |
| `killed` | `id` (shot down), `by` (winner) |
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
| Origins | Optional allow-list (`RELAY_ORIGINS` on the standalone relay); other pages get 403 |

Upgrade requests on other paths are ignored, so Vite's hot-reload socket keeps working.

The client (`src/game/net.ts`) reconnects with exponential backoff capped at 15 seconds and
re-sends its last `join` after reconnecting.

## Dogfights

There is no peace mode: a shot or supernova from any other pilot in the room can damage you. Each
client owns its own ship: the pilot who gets hit detects the hit and applies the damage, and when
shot down announces `killed` with the winner's id. The winner's client then credits itself +300
score and a dogfight win. The respawn shield blocks damage for a few seconds after respawning.

## Stats

The standalone relay serves `GET /stats`: aggregate, anonymous counters (connections, sessions,
joins, joins with company, hyperjumps per session, peak pilots, busiest universe, pilots flagged by
the checks below) and which leaderboard store is in use. See [06](06-deployment.md#measuring-it).

## Leaderboards

`GET /board?room=<universe>` returns `{ day, room, all, daily }`: the all-time top 10 (best run)
and today's top 10 in that universe, as `{ name, score }`. The relay records runs itself from the
`state` messages it already relays (`server/board.mjs`). Storage is Upstash Redis when
`UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are set, otherwise memory (lost on restart).

## Trust model

Clients are not trusted to be honest about gameplay: a modified client could report any position
or throw any planet in its room. For the leaderboards the relay checks every `state` message
(`CHECK` in `server/multiplayer.mjs`):

- **Score growth:** a budget of 80 points a second, with bursts up to 4,000 (a mothership, a
  daily reward). A larger jump fails.
- **Speed:** above 130 fails (boost tops out near 95).
- **Hull:** above the hull's maximum fails.

A pilot who fails is still relayed but is left off the boards for the rest of the connection.
These checks stop typed-in scores and obvious speed or health hacks. They do not stop a client
that ignores hits (damage is decided by the victim's client) or that earns points slightly faster
than possible. That would need the server to run the simulation. The limits are estimates; the
`flagged` count in `/stats` shows whether they catch honest pilots.

## Scaling

Rooms live in one process's memory. Running several instances would split pilots across them; that
needs a shared pub/sub (for example Redis) behind the relay. Tests: `viewer/tests/multiplayer.test.mjs`.
