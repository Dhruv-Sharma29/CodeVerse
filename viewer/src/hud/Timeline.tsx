import { useStore } from "../store";

function formatDate(t: number): string {
  return new Date(t * 1000).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function Timeline() {
  const bundle = useStore((s) => s.bundle)!;
  const commitIndex = useStore((s) => s.commitIndex);
  const maxCommitIndex = useStore((s) => s.maxCommitIndex);
  const playing = useStore((s) => s.playing);
  const speed = useStore((s) => s.speed);
  const setCommitIndex = useStore((s) => s.setCommitIndex);
  const togglePlay = useStore((s) => s.togglePlay);
  const setSpeed = useStore((s) => s.setSpeed);
  const restartEvolution = useStore((s) => s.restartEvolution);

  const idx = Math.floor(commitIndex);
  const commit = bundle.commits[Math.min(idx, bundle.commits.length - 1)];
  const [sha, t, authorIdx] = commit;

  return (
    <div className="timeline">
      <div className="timeline-info">
        <span className="sha" title={sha}>{sha.slice(0, 10)}</span>
        <span className="date">{formatDate(t)}</span>
        <span className="author">{bundle.authors[authorIdx]}</span>
        <span className="counter">
          commit {idx + 1} / {maxCommitIndex + 1}
        </span>
      </div>
      <input
        className="timeline-slider"
        aria-label="Commit in repository history"
        type="range"
        min={0}
        max={maxCommitIndex}
        step={1}
        value={idx}
        onChange={(e) => setCommitIndex(Number(e.target.value))}
      />
      <div className="timeline-controls">
        <button onClick={restartEvolution} title="Replay from the first commit">
          ⏮ Play Evolution
        </button>
        <button onClick={togglePlay}>{playing ? "⏸ Pause" : "▶ Play"}</button>
        <select aria-label="Playback speed" value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
          <option value={6}>1×</option>
          <option value={24}>4×</option>
          <option value={80}>15×</option>
          <option value={300}>50×</option>
        </select>
      </div>
    </div>
  );
}
