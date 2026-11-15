# Getting started

## Requirements

- Node.js **22.6+** (the tests use native TypeScript stripping; CI uses Node 22)
- npm
- Optional: Python 3.12 and [uv](https://docs.astral.sh/uv/) for the [analyzer](analyzer.md)

## Run the game locally

```bash
cd viewer
npm install --legacy-peer-deps
npm run dev
```

| Address | Page |
|---|---|
| <http://localhost:5173/> | The game |
| <http://localhost:5173/explorer/> | The explorer |
| <http://localhost:5173/@torvalds> | The explorer, opened on a profile |

The dev server also serves the GitHub proxy, the trending endpoint, the Oracle, and the
multiplayer relay at `/api/play`, so multiplayer works locally out of the box. Open a second tab to
fly with yourself.

`--legacy-peer-deps` is needed because some React Three Fiber packages have not yet declared
support for React 19 in their peer ranges.

## Production build

```bash
npm run build      # type-checks, then builds both pages into dist/
npm start          # serves dist/ plus all APIs and the relay on http://127.0.0.1:4173
```

`PORT` and `HOST` change the address. `npm run preview` (Vite's preview server) also includes the relay.

## Environment variables

None are required to play. All are server-side except `VITE_RELAY_URL`, which is built into the page and is not secret.

| Variable | Used by | Purpose |
|---|---|---|
| `PORT`, `HOST` | `npm start`, `npm run relay` | Listen address (default `127.0.0.1:4173`; relay `0.0.0.0:8787`) |
| `VITE_RELAY_URL` | Build of the game | `wss://` address of a separately hosted relay; empty uses the page's own server |
| `RELAY_ORIGINS` | `npm run relay` | Page origins allowed to connect to the standalone relay |
| `GITHUB_TOKEN` | GitHub proxy | Optional. Raises the shared GitHub rate limit; see [github-proxy.md](github-proxy.md) |
| `NVIDIA_API_KEY` or `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL` | Oracle | Optional AI commit explanations; see [oracle.md](oracle.md) |
| `CODEVERSE_ORACLE_ENABLED` | Oracle on Vercel | Must be `true` to enable the Oracle there |

Never put keys in client code or commit `.env`; it is git-ignored.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| HUD says "Solo: multiplayer server offline" | The page is served without the Node server (for example static hosting). Use `npm run dev`, `npm run preview` or `npm start`. |
| A universe fails to load with a rate-limit message | GitHub's unauthenticated limit (60 requests/hour per IP) is used up. Wait, or configure the proxy with a token. |
| `npm` errors about `package.json` | Run commands from the `viewer/` folder. |
| Blank page in dev after editing many files | Reload once; Vite's hot reload can lose track of moved exports. |
