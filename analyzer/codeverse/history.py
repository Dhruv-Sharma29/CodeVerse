"""Stream a repository's first-parent Git history into a flat file-event timeline."""

from __future__ import annotations

import subprocess
from collections.abc import Iterator
from dataclasses import dataclass, field
from pathlib import Path

RS, US, NUL = "\x1e", "\x1f", "\0"

LOG_CMD = [
    "git", "log",
    "--first-parent", "--diff-merges=first-parent",
    "--reverse", "-M", "--raw", "--numstat", "-z",
    f"--format={RS}%H{US}%an{US}%ae{US}%at{US}%s",
]


@dataclass(slots=True)
class FileChange:
    path: str
    status: str  # A, M, D, R, T (type change) or C (copy)
    added: int | None  # None for binary files
    deleted: int | None
    old_path: str | None = None  # set when the change is a rename


@dataclass(slots=True)
class Commit:
    sha: str
    author: str
    email: str
    timestamp: int
    subject: str
    changes: list[FileChange] = field(default_factory=list)


def _int(s: str) -> int | None:
    return None if s == "-" else int(s)


def _parse_commit(chunk: str) -> Commit:
    header, _, body = chunk.partition(NUL)
    sha, author, email, ts, subject = header.split(US, 4)
    commit = Commit(sha, author, email, int(ts), subject)

    tokens = iter(body.split(NUL))
    raw: list[tuple[str, str, str | None]] = []  # (status, path, old_path)
    stats: list[tuple[int | None, int | None]] = []
    for tok in tokens:
        tok = tok.lstrip("\n")
        if not tok:
            continue
        if tok.startswith(":"):  # --raw record: ":modes shas STATUS" then 1 or 2 paths
            status = tok.rsplit(" ", 1)[1][0]
            if status in "RC":
                old, new = next(tokens), next(tokens)
                raw.append((status, new, old))
            else:
                raw.append((status, next(tokens), None))
        else:  # --numstat record; renames put both paths in following tokens
            added, deleted, path = tok.split("\t", 2)
            if not path:
                next(tokens), next(tokens)
            stats.append((_int(added), _int(deleted)))
    for (status, path, old), (added, deleted) in zip(raw, stats, strict=True):
        commit.changes.append(FileChange(path, status, added, deleted, old_path=old))
    return commit


def iter_commits(repo: str | Path, rev: str = "HEAD") -> Iterator[Commit]:
    """Yield commits oldest → newest along the first-parent chain."""
    proc = subprocess.Popen(
        [*LOG_CMD, rev],
        cwd=repo,
        stdout=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    assert proc.stdout is not None
    buf = ""
    for block in iter(lambda: proc.stdout.read(1 << 16), ""):
        buf += block
        *complete, buf = buf.split(RS)
        for chunk in complete:
            if chunk.strip():
                yield _parse_commit(chunk)
    if buf.strip():
        yield _parse_commit(buf)
    if proc.wait() != 0:
        raise RuntimeError(f"git log failed in {repo}")


def events_frame(repo: str | Path, rev: str = "HEAD"):
    """One row per (commit, file) change, as a pandas DataFrame.

    op is A (added), M (modified), D (deleted) or R (renamed); loc is the file's
    running line count after the change.
    """
    import pandas as pd

    rows = []
    loc: dict[str, int] = {}  # path -> current line count (approximate for binaries)
    for idx, c in enumerate(iter_commits(repo, rev)):
        for ch in c.changes:
            delta = (ch.added or 0) - (ch.deleted or 0)
            op = "M" if ch.status == "T" else ch.status
            if op == "C":
                op, lines = "A", delta
            elif op == "R":
                lines = loc.pop(ch.old_path, 0) + delta
            elif op == "D":
                loc.pop(ch.path, None)
                lines = 0
            else:
                lines = loc.get(ch.path, 0) + delta
            if op != "D":
                loc[ch.path] = lines = max(lines, 0)
            rows.append(
                (idx, c.sha, c.timestamp, c.author, ch.path, ch.old_path, op,
                 ch.added, ch.deleted, lines)
            )
    return pd.DataFrame(
        rows,
        columns=["commit_idx", "sha", "timestamp", "author", "path", "old_path",
                 "op", "added", "deleted", "loc"],
    ).assign(timestamp=lambda d: pd.to_datetime(d.timestamp, unit="s"))
