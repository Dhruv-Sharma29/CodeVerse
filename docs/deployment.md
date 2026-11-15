# Deployment

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

**Free plan behaviour:** the service sleeps after about 15 minutes without traffic. The first pilot
afterwards waits up to a minute while it wakes; the game shows "Connecting…" and retries on its own.
A paid instance stays awake. Preview deployments on other origins are refused by `RELAY_ORIGINS`
and run solo unless you add their origins.

## Health checks

- `GET /` returns the game page.
- The standalone relay answers `GET /health` with `ok`.
- A WebSocket to `/api/play` receives no message until it sends `join` or `rooms`; send `{"t":"rooms"}` and expect a `rooms` reply.
