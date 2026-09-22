import type { Repository } from "./api";

export function seedFor(text: string) {
  let hash = 2166136261;
  for (const ch of text) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619);
  return (hash >>> 0) / 4294967296;
}
const DAY_MS = 24 * 60 * 60 * 1000;
export type ActivityBand = "recent" | "active" | "quiet" | "stale" | "unknown";

export function activityEncoding(pushedAt: string | null | undefined, now = Date.now()) {
  const pushed = pushedAt ? Date.parse(pushedAt) : Number.NaN;
  if (!Number.isFinite(pushed)) return { band: "unknown" as ActivityBand, intensity: .18, label: "Push date unavailable" };
  const ageDays = Math.max(0, (now - pushed) / DAY_MS);
  if (ageDays <= 30) return { band: "recent" as ActivityBand, intensity: 1, label: "Pushed within 30 days" };
  if (ageDays <= 90) return { band: "active" as ActivityBand, intensity: .68, label: "Pushed 31–90 days ago" };
  if (ageDays <= 365) return { band: "quiet" as ActivityBand, intensity: .38, label: "Pushed 91–365 days ago" };
  return { band: "stale" as ActivityBand, intensity: .14, label: "Pushed over 365 days ago" };
}

export function archiveEncoding(archived: boolean | undefined) {
  return archived
    ? { scale: .58, surfaceKind: 3, dark: "#000106", land: "#080914", glow: "#77708e", rings: false }
    : { scale: 1, surfaceKind: null, dark: null, land: null, glow: null, rings: null };
}

export function starEncoding(stars: number | undefined) {
  const count = Math.max(0, stars ?? 0);
  if (count === 0) return { sparks: 0, intensity: .12 };
  return {
    sparks: Math.min(7, Math.max(1, Math.ceil(Math.log10(count + 1) * 2))),
    intensity: Math.min(1, .28 + Math.log10(count + 1) * .2),
  };
}

export function repositoryImportance(repo: Partial<Pick<Repository, "stargazers_count" | "forks_count" | "pushed_at">>, now = Date.now()) {
  const stars = Math.log10(Math.max(0, repo.stargazers_count ?? 0) + 1);
  const forks = Math.log10(Math.max(0, repo.forks_count ?? 0) + 1);
  const activity = activityEncoding(repo.pushed_at, now).intensity;
  return Math.min(1, stars / 5 * .5 + forks / 4 * .2 + activity * .3);
}
const palettes: Record<string, [string, string, string, number]> = {
  TypeScript: ["#102c58", "#438bae", "#87e4f3", 0],
  JavaScript: ["#402222", "#c99857", "#ffe0a0", 1],
  Python: ["#142e29", "#67967d", "#b8ead6", 0],
  Rust: ["#431815", "#ba6841", "#f7b07c", 2],
  Go: ["#183444", "#71b7c1", "#baf8f9", 1],
  C: ["#282634", "#8e8595", "#cbd7ef", 2],
  "C++": ["#291d3a", "#8e79ae", "#e2c5ff", 2],
  Java: ["#451c17", "#b97145", "#ffd49e", 1],
  HTML: ["#411b25", "#ba646b", "#ffc5ba", 2],
  CSS: ["#27204d", "#a282cd", "#d5c1ff", 1],
  Shell: ["#2f2940", "#8f8ca4", "#d7cdef", 2],
  Swift: ["#46261d", "#cd9160", "#ffe0b0", 1],
  "Jupyter Notebook": ["#402c17", "#c08d40", "#ffe9bd", 0],
};
export function planetStyle(repo: Pick<Repository, "name" | "language" | "size" | "id"> & Partial<Pick<Repository, "stargazers_count" | "forks_count" | "pushed_at" | "archived">>, now = Date.now()) {
  const seed = seedFor(`${repo.id}/${repo.name}`);
  const [dark, land, glow, kind] = palettes[repo.language ?? ""] ?? palettes[Object.keys(palettes)[Math.floor(seedFor(repo.language ?? "Mixed") * Object.keys(palettes).length)]];
  const archive = archiveEncoding(repo.archived);
  const activity = activityEncoding(repo.pushed_at, now);
  return {
    dark: archive.dark ?? dark, land: archive.land ?? land, glow: archive.glow ?? glow,
    kind: archive.surfaceKind ?? kind, seed,
    radius: (0.68 + repositoryImportance(repo, now) * 1.02) * archive.scale,
    rings: archive.rings ?? (kind === 1 || seed > .77),
    activity,
    archived: Boolean(repo.archived),
  };
}
