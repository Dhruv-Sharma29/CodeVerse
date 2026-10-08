import { useStore } from "../store";

export function Legend() {
  const bundle = useStore((s) => s.bundle)!;
  return (
    <div className="legend">
      <div className="legend-title">🌌 CODEVERSE</div>
      <div className="legend-repo">{bundle.repo}</div>
      <div className="legend-stats">
        {bundle.nodes.length.toLocaleString()} files ever · {bundle.commits.length.toLocaleString()} commits ·{" "}
        {bundle.authors.length.toLocaleString()} contributors
      </div>
      <div className="legend-hint">drag to orbit · scroll to zoom · click a planet</div>
    </div>
  );
}
