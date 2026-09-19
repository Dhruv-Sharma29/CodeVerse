# 🌌 CODEVERSE

> Your codebase is bigger than a folder. Explore it. Understand it. Watch it evolve.

Explore GitHub as a living planetary system: monthly trending repositories, any public handle, and real commit history. **Status:** GitHub explorer + local history prototype. See [docs/PLAN.md](docs/PLAN.md).

## GitHub explorer

```bash
cd spike/viewer
npm install --legacy-peer-deps
npm run dev
```

The opening universe uses **GitHub’s monthly trending feed**, preserving its
ranking and showing star gains for the month. Enter a GitHub username (or profile
URL) to map their public repositories into planets. Users and organizations are
supported. Filter by repository or language, move between eight-planet sectors,
and load additional repository pages when available.

Select a planet to inspect up to **60 recent default-branch commits** as satellites.
Click a satellite, choose a commit in the list, or play the timeline. Pausing loads
its additions, deletions, and changed files. The first eight files are displayed
from up to 100 fetched; GitHub links open the complete commit. This view is recent
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

## Analyzer dev setup

```bash
cd analyzer
uv sync                     # Python 3.12 venv + all deps (analyzer + Jupyter)
cp ../.env.example ../.env  # then put your NVIDIA key in ../.env
uv run codeverse llm-check  # should print: CODEVERSE online
uv run jupyter lab ../notebooks
```

In Jupyter, pick the **Python (codeverse)** kernel. The `codeverse` package is installed in editable mode, and the notebooks use `%autoreload`, so edits in `analyzer/codeverse/` show up without restarting the kernel.

| Notebook | What it does |
|---|---|
| `00_setup_llm.ipynb` | Env check, Nemotron chat/stream, generate-code-then-test loop |
| `01_phase0_history_spike.ipynb` | Clone repo → history events → growth/hotspot charts → `spike/out/<repo>.json` |

## Layout

```
codeverse/
├── docs/
│   └── PLAN.md              full build plan (read this first)
├── .env / .env.example      LLM config (.env is gitignored)
├── analyzer/                Python package `codeverse`
│   └── codeverse/
│       ├── llm.py           OpenAI-compatible client (NVIDIA NIM default): chat, stream, extract_code
│       ├── history.py       git log → commits / file-event DataFrame (renames, deletes, LOC)
│       └── cli.py           `codeverse` CLI
├── notebooks/                see table above
└── spike/                    Phase 0 "is it beautiful?" spike (see PLAN.md §9)
    ├── repos/                cloned repos to analyze (gitignored)
    ├── out/                  exported spike JSON bundles (e.g. fastapi.json)
    └── viewer/                Vite + React Three Fiber 3D viewer
        └── public/repo.json   bundle the viewer loads (copy from spike/out/)
```

## Analyze a local repository

Export a viewer-ready JSON bundle directly from Git. This command does not use the
LLM, need an API key, or send repository content to a server.

```bash
cd analyzer
uv run codeverse analyze /path/to/repository -o ../spike/out/my-repo.json
# Optional: stop at a particular tag, branch, or commit
uv run codeverse analyze /path/to/repository --rev v1.0 -o ../spike/out/v1.json
```

The exporter records first-parent history, including merges and empty commits,
renames, deletions, and contributor display names. Contributor email addresses and
file contents are not exported. Line counts are estimates from Git's line deltas;
binary files have a line count of zero. Remote URLs must be cloned locally first.
The current format is JSON, not the planned `.codeverse` archive format.

## Viewer (Phase 0 spike)

```bash
cd spike/viewer
npm install --legacy-peer-deps
npm run dev
```

Choose **Open repository bundle** and select the exported JSON file. The viewer reads it locally in your browser, validates its structure, and supports switching repositories without reloading. Bundles are limited to 50 MB and 50,000 paths. Existing notebook exports remain compatible. An optional `public/repo.json` still loads automatically when present. Drag to orbit, scroll to zoom, click a planet to pin its info panel, and use the timeline at the bottom to scrub or replay the repo's history.

**Known issue:** Bloom/postprocessing (`@react-three/postprocessing`) is currently disabled in `App.tsx` — combined with the ~5k-instance planet mesh it rendered solid black with no console error in one tested environment (looked like a corrupted/NaN'd render target, possibly software-GPU-specific). Untested on a real discrete GPU; worth revisiting before Phase 2 polish.

## Verification

```bash
cd analyzer
uv run pytest tests -q
cd ../spike/viewer
npm test                 # Node.js 22.6+ (native TypeScript stripping)
npm run build
npm run lint
```

See [docs/bundle-schema.md](docs/bundle-schema.md) for the JSON contract.
