# 06 — Deployment

## Option 1: Node server (full features)

```bash
cd viewer
npm ci --legacy-peer-deps
npm run build
PORT=8080 HOST=0.0.0.0 npm start
```

`server/start.mjs` serves both pages from `dist/` and every API, including the multiplayer relay.
Any host that runs a long-lived Node process and supports WebSockets works (a VM, a container
platform, Fly.io, Railway, Render and similar). Put it behind HTTPS; the client automatically uses
`wss://` on HTTPS pages.

Routing in the production server:

| Request | Served |
|---|---|
| `/` | Game |
| `/explorer` or `/explorer/` | Explorer |
| `/@handle` (browser navigation) | Explorer with profile metadata |
| Other paths without a file extension | Game |
| `/assets/*`, other files | Static files from `dist/` |

## Option 2: Vercel (current production)

The repository includes `vercel.json` and serverless functions in `viewer/api/` for trending, the
GitHub proxy, profile pages, share images and the Oracle. Set the project's root directory to
`viewer`.

Hosting settings live outside Git. When folders move, check them: after the app moved from
`spike/viewer/` to `viewer/`, every production deploy failed until the Root Directory setting was
updated ([10](10-implementation-notes.md)).

Vercel functions cannot hold WebSocket connections, so the website on Vercel connects to a
separately hosted relay (Option 3). Without one, the game runs solo and the HUD says so.

Hosting-side settings and secrets are never changed automatically by this repository.

## Option 3: Relay on Render (multiplayer for the Vercel site)

`viewer/server/relay.mjs` is the relay on its own: a tiny HTTP server with `/health` and the
WebSocket at `/api/play`. `render.yaml` at the repository root describes it as a free Render web
service.

1. In Render: **New → Blueprint**, choose this repository, and apply `render.yaml`. It creates
   `codeverse-relay` with root directory `viewer`, `npm ci --omit=dev --legacy-peer-deps`, and
   `node server/relay.mjs`.
2. Note the service address, for example `https://codeverse-relay.onrender.com`, and check it end
   to end from `viewer/`: `npm run check:relay -- https://codeverse-relay.onrender.com`. It tests
   `/health`, a WebSocket from the site's origin, and that other origins are refused.
3. In Vercel → project → Settings → Environment Variables, add
   `VITE_RELAY_URL = wss://codeverse-relay.onrender.com/api/play` for Production, then redeploy.
   It is read at build time, so a redeploy is required.

| Relay variable | Purpose |
|---|---|
| `RELAY_ORIGINS` | Comma-separated page origins allowed to connect (`https://codeverse-orbit.vercel.app`). Empty allows any origin. |
| `PORT` | Set by Render |

**Free plan behaviour:** the service sleeps after about 15 minutes without traffic and takes up to a
minute to wake. Two things handle that:

- **Keep-warm schedule.** `.github/workflows/keep-relay-warm.yml` pings `/health` every 10 minutes
  from 02:00 to 18:59 UTC (07:30–00:29 IST), about 530 instance hours a month. Free instance hours
  (750/month) are shared by every free service in the Render workspace; running the ping 24/7 would
  use ~730–744 and leave almost nothing for others, and Render suspends free services once the hours
  run out. Change the `cron` line to widen or narrow the window. GitHub can delay scheduled runs at
  busy times and pauses schedules after 60 days without repository activity. It can also be run by
  hand from the Actions tab.
- **Waking in the game.** On page load the game sends a request to the relay's `/health` to start it
  waking. If it isn't connected within 3.5 seconds, the lobby and HUD say the server is waking, the
  client retries every 3 seconds for up to 90, and players can launch and play solo meanwhile.
  Other pilots appear once it is up.

A paid instance stays awake without any of this. Preview deployments on other origins are refused by `RELAY_ORIGINS`
and run solo unless you add their origins.

## Measuring it

- **Relay counters:** `GET /stats` on the relay (for example
  `https://codeverse-relay.onrender.com/stats`) returns aggregate counters since the relay last
  started: connections, sessions (connections that launched into a universe), joins, joins where
  someone was already there, hyperjumps per session, the share of joins with company, peak pilots
  online and the busiest universe. Nothing about any pilot is collected; it resets when the free
  relay sleeps or restarts.
- **Page views:** the game page loads Vercel Web Analytics (cookieless) on
  `codeverse-orbit.vercel.app` only. It counts once Web Analytics is enabled for the project in the
  Vercel dashboard. Custom events would need a paid Vercel plan, which is why the multiplayer
  numbers come from the relay instead.

## Health checks

- `GET /` returns the game page.
- The standalone relay answers `GET /health` with `ok`.
- A WebSocket to `/api/play` receives no message until it sends `join` or `rooms`; send `{"t":"rooms"}` and expect a `rooms` reply.
