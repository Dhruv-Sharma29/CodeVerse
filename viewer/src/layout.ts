import type { Bundle, LayoutNode } from "./types";

// Deterministic string -> [0,1) hash (xmur3 + mulberry32-ish mixing). Not cryptographic,
// just needs to be stable and well distributed so identical layouts reproduce every run.
function hash01(str: string, seed = 0): number {
  let h = 1779033703 ^ seed;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822519);
  h = Math.imul(h ^ (h >>> 13), 3266489917);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const LANG_COLORS: Record<string, string> = {
  py: "#3572A5",
  ts: "#3178c6",
  tsx: "#3178c6",
  js: "#f1e05a",
  jsx: "#f1e05a",
  mjs: "#f1e05a",
  json: "#e8a33d",
  md: "#b8b8b8",
  mdx: "#b8b8b8",
  yml: "#9e6bd6",
  yaml: "#9e6bd6",
  toml: "#9e6bd6",
  html: "#e34c26",
  css: "#563d7c",
  scss: "#c6538c",
  go: "#00ADD8",
  rs: "#dea584",
  java: "#b07219",
  c: "#555555",
  cpp: "#f34b7d",
  h: "#555555",
  sh: "#89e051",
  txt: "#8a8a8a",
  cfg: "#8a8a8a",
  ini: "#8a8a8a",
  lock: "#5c5c5c",
  svg: "#ff9d00",
  png: "#ff9d00",
  jpg: "#ff9d00",
  jpeg: "#ff9d00",
  gitignore: "#5c5c5c",
};
const DEFAULT_COLOR = "#9aa5b1";

function colorFor(path: string): string {
  const base = path.split("/").pop() ?? path;
  const dot = base.lastIndexOf(".");
  const ext = dot >= 0 ? base.slice(dot + 1).toLowerCase() : base.toLowerCase();
  return LANG_COLORS[ext] ?? DEFAULT_COLOR;
}

const TAU = Math.PI * 2;

/** Stable, hierarchical, deterministic layout over the union of every path ever seen (see PLAN.md §4.6). */
export function buildLayout(bundle: Bundle): { nodes: LayoutNode[]; galaxyNames: string[]; galaxyPos: [number, number, number][] } {
  const { nodes } = bundle;

  // 1. peak LOC per node (max size the file ever reached) -> drives orbit ordering + scale
  const peakLoc = new Float32Array(nodes.length);
  for (const [, nodeId, , loc] of bundle.events) {
    if (loc > peakLoc[nodeId]) peakLoc[nodeId] = loc;
  }

  // 2. group into galaxies (top-level dir) -> systems (2nd-level dir)
  const galaxyOf: string[] = [];
  const systemOf: string[] = [];
  for (const path of nodes) {
    const parts = path.split("/");
    galaxyOf.push(parts.length > 1 ? parts[0] : "(root)");
    systemOf.push(parts.length > 2 ? `${parts[0]}/${parts[1]}` : galaxyOf[galaxyOf.length - 1]);
  }

  const galaxySize = new Map<string, number>();
  galaxyOf.forEach((g, i) => galaxySize.set(g, (galaxySize.get(g) ?? 0) + peakLoc[i] + 10));
  const galaxyNames = [...galaxySize.keys()].sort((a, b) => (galaxySize.get(b)! - galaxySize.get(a)!));
  const galaxyIndex = new Map(galaxyNames.map((g, i) => [g, i]));

  const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
  const galaxyPos: [number, number, number][] = galaxyNames.map((g, i) => {
    const weight = galaxySize.get(g)!;
    const r = 14 + 9 * Math.sqrt(i + 1) + Math.sqrt(weight) * 0.05;
    const a = i * GOLDEN_ANGLE;
    const y = (hash01(g, 7) - 0.5) * 14;
    return [Math.cos(a) * r, y, Math.sin(a) * r];
  });

  // system centers, relative to their galaxy, on a spiral arm
  const systemCenter = new Map<string, [number, number, number]>();
  for (let i = 0; i < nodes.length; i++) {
    const key = systemOf[i];
    if (systemCenter.has(key)) continue;
    const gi = galaxyIndex.get(galaxyOf[i])!;
    const [gx, gy, gz] = galaxyPos[gi];
    const depth = key.split("/").length;
    const armAngle = hash01(key, 1) * TAU + hash01(galaxyOf[i], 2) * 3;
    const armRadius = 2 + depth * 2.2 + hash01(key, 3) * 3.5;
    const spiralTwist = armRadius * 0.35;
    systemCenter.set(key, [
      gx + Math.cos(armAngle + spiralTwist * 0.02) * armRadius,
      gy + (hash01(key, 4) - 0.5) * 2.5,
      gz + Math.sin(armAngle + spiralTwist * 0.02) * armRadius,
    ]);
  }

  // planets orbit their system center
  const layout: LayoutNode[] = nodes.map((path, i) => {
    const [sx, sy, sz] = systemCenter.get(systemOf[i])!;
    const angle = hash01(path, 11) * TAU;
    const orbit = 1.2 + hash01(path, 12) * 3.2;
    const yJitter = (hash01(path, 13) - 0.5) * 2.2;
    return {
      galaxy: galaxyIndex.get(galaxyOf[i])!,
      pos: [sx + Math.cos(angle) * orbit, sy + yJitter, sz + Math.sin(angle) * orbit],
      peakLoc: peakLoc[i],
      color: colorFor(path),
      depth: path.split("/").length,
    };
  });

  return { nodes: layout, galaxyNames, galaxyPos };
}

export type Layout = ReturnType<typeof buildLayout>;

/** Bounding sphere over every node + galaxy marker, so the camera can frame the whole
 *  universe regardless of repo size instead of relying on hand-tuned distances. */
export function layoutBounds(layout: Layout): { center: [number, number, number]; radius: number } {
  let cx = 0, cy = 0, cz = 0, count = 0;
  for (const n of layout.nodes) {
    cx += n.pos[0]; cy += n.pos[1]; cz += n.pos[2]; count++;
  }
  if (count === 0) return { center: [0, 0, 0], radius: 10 };
  cx /= count; cy /= count; cz /= count;

  let maxDist = 1;
  for (const n of layout.nodes) {
    const dx = n.pos[0] - cx, dy = n.pos[1] - cy, dz = n.pos[2] - cz;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d > maxDist) maxDist = d;
  }
  return { center: [cx, cy, cz], radius: maxDist };
}
