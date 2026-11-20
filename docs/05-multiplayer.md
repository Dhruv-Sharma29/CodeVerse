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
| Ship position, heading, velocity, hull points (10 Hz) | Perks and upgrades |
| Aliens, their shots and kills (10 Hz, from the host) | |
| Shots (as they are fired), with damage | Charge, commits |
| Score, dogfight wins and wave number (10 Hz, self-reported) | |
| Dogfight kill announcements, emotes, pings | |
| Held and flung planets (10 Hz while active) | Tutorial progress |
| Supernovas, explosions | Particles and effects |
| Name, colour, hull | |

The gate and the comet need no messages: every client computes them from the room name and the clock.

## Shared aliens

The relay names one pilot per room the **host**: the first pilot in, then the longest-staying one when
the host leaves. The host's client runs the aliens for everyone:

- Waves spawn on the host, and aliens chase whichever live pilot is nearest. Each extra pilot in the
  room adds half a wave of aliens and a quarter more mothership hull (at most three times the solo wave,
  and at most 56 aliens when the wave starts, so it fits in one snapshot).
- Ten times a second the host sends an `aliens` snapshot: every alien, the shots aliens fired since the
  last one, and the aliens that died with who killed them.
- Everyone else draws the host's aliens and moves them on between snapshots. Their own hits (bullets,
  held or flung planets, and an alien ramming them) go to the host as `ahit`. A hit alien pops at once on
  the shooter's screen; the host decides the kill and the snapshot credits the pilot who landed it, so a
  kill is never counted twice. Supernovas need no report: every client already sees them.
- Each pilot still owns their ship: alien shots and rams are checked against your own ship by your client.
- When the host leaves, the next host carries on with the aliens it was already drawing.

A friend who joins you on wave 5 is on wave 5 at once. On a relay without hosts (an older deploy),
each pilot runs their own aliens and the wave number alone is shared: your next wave jumps to the
highest wave anyone in the room has reached.

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
| `aliens` | `w` (wave), `a`, `b`, `d` (flat number lists, see below) | From the host only; relayed as `aliens`. `a`: `[id, kind, x, z, vx, vz, hp, max, shield]` per alien (at most 60); `b`: `[x, z, vx, vz, life]` per new alien shot (at most 48); `d`: `[id, kind, by, charge]` per death (at most 60). Kinds: 0 saucer, 1 hunter, 2 swarmer, 3 mothership |
| `ahit` | `h`: `[alienId, damage]` pairs, at most 40 (damage −1: it rammed you) | Sent to the host alone, as `ahit` with the sender's `id` |
| `rooms` | — | Replies with `rooms`; allowed before joining (the lobby uses it) |

### Server → client

| `t` | Fields |
|---|---|
| `welcome` | `id`, `room`, `peers: [{ id, name, color, hull, state }]`, `host` (who runs the aliens) |
| `host` | `id`: the new host, after the old one left |
| `joined` | `id`, `name`, `color`, `hull` |
| `left` | `id` |
| `state`, `shot`, `grab`, `nova`, `boom`, `emote`, `ping` | The sender's fields plus `id` |
| `killed` | `id` (shot down), `by` (winner) |
| `rooms` | `rooms: [{ room, count }]`, busiest 12 |
| `error` | `message` (invalid room, room full) |

## Validation and limits

| Rule | Value |
|---|---|
| Message size | 1,024 bytes (8,192 for the host, whose alien snapshots are larger); larger messages are dropped |
| Rate | 60 messages per second per client; extra messages are dropped |
| Pilots per room | 24 |
| Connections per server | 400 |
| Names | Letters, digits, space, `_ . -`; at most 18 characters; default `Pilot` |
| Colours | `#rrggbb`, otherwise `#74e2ff` |
| Hulls | `dart`, `wasp` or `titan`, otherwise `dart` |
| Numbers | Finite, clamped, rounded to two decimals |
| Liveness | Ping every 20 s; silent connections are closed |
| One pilot per browser | Joins carry a pilot id kept in the browser. A newer connection with the same id replaces the old one at once (a dropped connection not yet timed out, or the game open in another tab), so nobody sees a frozen double; the replaced tab stops reconnecting and says so |
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
- **Hull:** above the hull's maximum with full hull plating (160%) fails.

A pilot who fails is still relayed but is left off the boards for the rest of the connection.
These checks stop typed-in scores and obvious speed or health hacks. They do not stop a client
that ignores hits (damage is decided by the victim's client) or that earns points slightly faster
than possible. That would need the server to run the simulation. The limits are estimates; the
`flagged` count in `/stats` shows whether they catch honest pilots.

## Scaling

Rooms live in one process's memory. Running several instances would split pilots across them; that
needs a shared pub/sub (for example Redis) behind the relay. Tests: `viewer/tests/multiplayer.test.mjs`.
