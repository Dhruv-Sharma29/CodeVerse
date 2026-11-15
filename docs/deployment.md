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

**Limitation:** Vercel functions cannot hold WebSocket connections, so `/api/play` is unavailable
and the game runs solo; the HUD says "Solo: multiplayer server offline". To get multiplayer on
Vercel, either:

- host the relay separately (Option 1 on a small server) and point the client at it, or
- replace the relay with a managed real-time service.

Neither is set up yet. Hosting-side settings and secrets are never changed automatically by this
repository.

## Health checks

- `GET /` returns the game page.
- A WebSocket to `/api/play` receives no message until it sends `join` or `rooms`; send `{"t":"rooms"}` and expect a `rooms` reply.
