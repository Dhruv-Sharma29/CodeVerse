# 08 — Explorer and local history viewer

The explorer is CodeVerse's original, calmer view: browse GitHub as a planetary system without the
game. It lives at **`/explorer/`**. Profile links (`/@handle`) open it directly with that user's
universe and share-card metadata. The game at `/` reuses its shader planets and GitHub client.

## GitHub explorer

```bash
cd viewer
npm install --legacy-peer-deps
npm run dev   # then open http://localhost:5173/explorer/
```

The opening universe uses **GitHub’s monthly trending feed**, preserving its
ranking and showing star gains for the month. Enter a GitHub username (or profile
URL) to map their public repositories into planets. Users and organizations are
supported. Filter by repository or language, move between eight-planet sectors,
and load additional repository pages when available.

Select a planet to inspect up to **60 recent default-branch commits** as satellites.
Click a satellite, choose a commit in the list, or play the timeline. Pausing loads
its additions, deletions, and changed files. The first eight files are displayed
from up to 100 fetched; **Read message, code & AI explanation** opens the full message, all returned files, and their line-numbered text diffs. GitHub links open the complete commit. This view is recent
history, not a complete repository analysis. Import a local JSON bundle for the
existing full first-parent history viewer.

Planets use deterministic procedural terrain, oceans, ice, cloud patterns, gas
bands, atmosphere rims, and optional decorative rings. Language determines the
palette and surface family. Size uses repository KB for profiles and total stars
for trending, where GitHub does not publish repository size. Planet identities
stay consistent when filtering. Rotation can be paused; reduced-motion preferences
are respected at startup. Every 3D action also has an ordinary list control.

**Data and limits:** profile/commit requests go directly to GitHub’s public REST
API, with five-minute in-memory caching and readable rate-limit errors. No token
is required or stored. Monthly trending is fetched through a fixed local endpoint
(`/api/trending`), cached for 30 minutes; it does not accept arbitrary upstream URLs.
GitHub has no official trending REST endpoint, so this adapter parses the public
monthly trending page and fails visibly if its markup changes. It does not substitute
a “new repositories sorted by stars” search for actual monthly trending.

**Production preview:** `npm run build && npm start` serves the built viewer and
trending endpoint on `http://127.0.0.1:4173`. `PORT` and `HOST` are configurable.
A static-only deployment needs an equivalent `/api/trending` backend; the included
Node server and Vite dev/preview server already provide it.

## Local history viewer

```bash
cd viewer
npm install --legacy-peer-deps
npm run dev   # then open http://localhost:5173/explorer/
```

Choose **Open repository bundle** and select the exported JSON file. The viewer reads it locally in your browser, validates its structure, and supports switching repositories without reloading. Bundles are limited to 50 MB and 50,000 paths. Existing notebook exports remain compatible. An optional `public/repo.json` still loads automatically when present. Drag to orbit, scroll to zoom, click a planet to pin its info panel, and use the timeline at the bottom to scrub or replay the repo's history.

**Known issue:** Bloom/postprocessing (`@react-three/postprocessing`) is currently disabled in `App.tsx` — combined with the ~5k-instance planet mesh it rendered solid black with no console error in one tested environment (looked like a corrupted/NaN'd render target, possibly software-GPU-specific). Untested on a real discrete GPU; worth revisiting before Phase 2 polish.

## Optional AI: the Oracle

The **AI explanation** tab in the commit inspector can explain the selected public
commit using its message and actual patch excerpts, with source citations and
qualified intent. Model calls happen only after **Explain this commit** is clicked.
The key stays on the server; normal GitHub exploration needs no AI configuration.

Local setup reuses `NVIDIA_API_KEY` (or `LLM_API_KEY`), `LLM_BASE_URL`, and `LLM_MODEL`
from the root `.env`. Vercel additionally requires `CODEVERSE_ORACLE_ENABLED=true`
in its server environment. No deployment or hosting-secret changes are automatic.
See [oracle.md](oracle.md) for setup, evidence limits, and request budgets.
