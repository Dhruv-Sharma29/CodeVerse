import { useMemo } from "react";
import { useStore } from "../store";
import { computeStateAt } from "../timeline";

function useNodeStats(nodeId: number | null) {
  const bundle = useStore((s) => s.bundle)!;
  const commitIndex = useStore((s) => Math.floor(s.commitIndex));

  return useMemo(() => {
    if (nodeId === null) return null;
    const path = bundle.nodes[nodeId];
    let commits = 0;
    const authors = new Set<number>();
    let lastAuthor = -1;
    let lastCommitIdx = -1;
    for (const [ci, nid] of bundle.events) {
      if (nid !== nodeId || ci > commitIndex) continue;
      commits++;
      const authorIdx = bundle.commits[ci][2];
      authors.add(authorIdx);
      if (ci > lastCommitIdx) {
        lastCommitIdx = ci;
        lastAuthor = authorIdx;
      }
    }
    const state = computeStateAt(bundle, commitIndex);
    return {
      path,
      loc: state.loc[nodeId],
      alive: state.alive[nodeId] === 1,
      commits,
      authorCount: authors.size,
      lastAuthor: lastAuthor >= 0 ? bundle.authors[lastAuthor] : "—",
    };
  }, [bundle, commitIndex, nodeId]);
}

export function InfoPanel() {
  const selected = useStore((s) => s.selected);
  const hovered = useStore((s) => s.hovered);
  const stats = useNodeStats(selected ?? hovered);

  if (!stats) {
    return (
      <div className="info-panel info-panel-empty">
        <p>Hover a planet to preview it. Click to pin.</p>
      </div>
    );
  }

  return (
    <div className="info-panel">
      <div className="info-path">{stats.path}</div>
      <dl>
        <dt>Status</dt>
        <dd>{stats.alive ? "alive" : "deleted (ghost)"}</dd>
        <dt>Lines</dt>
        <dd>{Math.round(stats.loc).toLocaleString()}</dd>
        <dt>Commits touching this file</dt>
        <dd>{stats.commits.toLocaleString()}</dd>
        <dt>Contributors</dt>
        <dd>{stats.authorCount}</dd>
        <dt>Last touched by</dt>
        <dd>{stats.lastAuthor}</dd>
      </dl>
    </div>
  );
}
