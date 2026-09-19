"""Export local Git history in the JSON format consumed by the spike viewer."""

from __future__ import annotations

import json
import os
import subprocess
import tempfile
from pathlib import Path

from codeverse.history import iter_commits


def build_bundle(repo: str | Path, rev: str = "HEAD") -> dict:
    repo = Path(repo).expanduser().resolve()
    if not repo.is_dir():
        raise ValueError(f"Repository directory does not exist: {repo}")
    # Resolve before invoking log: user input must describe one commit, not log options.
    result = subprocess.run(
        ["git", "rev-parse", "--verify", "--end-of-options", f"{rev}^{{commit}}"],
        cwd=repo, capture_output=True, text=True,
    )
    if result.returncode:
        raise ValueError(f"Cannot resolve revision {rev!r}. Check the Git repository has commits.")
    root = subprocess.check_output(
        ["git", "rev-parse", "--show-toplevel"], cwd=repo, text=True,
    ).strip()
    node_ids: dict[str, int] = {}
    author_ids: dict[str, int] = {}
    commits, events = [], []
    loc: dict[str, int] = {}

    def node(path: str) -> int:
        return node_ids.setdefault(path, len(node_ids))

    for ci, commit in enumerate(iter_commits(root, result.stdout.strip())):
        author = author_ids.setdefault(commit.author, len(author_ids))
        # Preserve empty commits too, so event indices always match commit indices.
        commits.append([commit.sha, commit.timestamp, author])
        for change in commit.changes:
            nid = node(change.path)
            old = node(change.old_path) if change.old_path is not None else -1
            delta = (change.added or 0) - (change.deleted or 0)
            op = {"A": 0, "C": 0, "M": 1, "T": 1, "D": 2, "R": 3}[change.status]
            if op == 2:
                loc.pop(change.path, None)
                lines = 0
            else:
                previous = loc.pop(change.old_path, 0) if op == 3 else loc.get(change.path, 0)
                if op == 0:
                    previous = 0
                lines = max(0, previous + delta)
                loc[change.path] = lines
            events.append([ci, nid, op, lines, old if op == 3 else -1])

    return {"schemaVersion": 1, "repo": Path(root).name, "nodes": list(node_ids),
            "authors": list(author_ids), "commits": commits, "events": events}


def write_bundle(bundle: dict, output: str | Path) -> Path:
    """Replace the destination atomically, leaving an existing bundle intact on failure."""
    output = Path(output).expanduser().resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    temp = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=output.parent,
                                         prefix=f".{output.name}.", delete=False) as f:
            temp = f.name
            json.dump(bundle, f, ensure_ascii=True, separators=(",", ":"), allow_nan=False)
            f.write("\n")
        os.replace(temp, output)
    finally:
        if temp is not None and os.path.exists(temp):
            os.unlink(temp)
    return output
