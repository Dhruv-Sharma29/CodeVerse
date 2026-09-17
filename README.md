# 🌌 CODEVERSE

> Your codebase is bigger than a folder. Explore it. Understand it. Watch it evolve.

Turn any Git repository into a living 3D universe. **Status:** Phase 0 spike. See [docs/PLAN.md](docs/PLAN.md).

## Dev setup

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

## Viewer (Phase 0 spike)

```bash
cd spike/viewer
npm install --legacy-peer-deps
npm run dev
```

Opens a 3D universe of whatever repo is in `public/repo.json` (regenerate it from `01_phase0_history_spike.ipynb`). Drag to orbit, scroll to zoom, click a planet to pin its info panel, and use the timeline at the bottom to scrub or replay the repo's history.

**Known issue:** Bloom/postprocessing (`@react-three/postprocessing`) is currently disabled in `App.tsx` — combined with the ~5k-instance planet mesh it rendered solid black with no console error in one tested environment (looked like a corrupted/NaN'd render target, possibly software-GPU-specific). Untested on a real discrete GPU; worth revisiting before Phase 2 polish.
