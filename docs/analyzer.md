# Analyzer

The analyzer is a Python package (`analyzer/`, import name `codeverse`) that turns a local Git
repository into a JSON bundle for the [local history viewer](explorer.md#local-history-viewer).
It is independent of the game.

## Setup

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

See [bundle-schema.md](bundle-schema.md) for the JSON contract.
