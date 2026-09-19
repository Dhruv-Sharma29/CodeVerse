import type { Repository } from "./api";

export function seedFor(text: string) {
  let hash = 2166136261;
  for (const ch of text) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619);
  return (hash >>> 0) / 4294967296;
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
export function planetStyle(repo: Pick<Repository, "name" | "language" | "size" | "id"> & { stargazers_count?: number }) {
  const seed = seedFor(`${repo.id}/${repo.name}`);
  const [dark, land, glow, kind] = palettes[repo.language ?? ""] ?? palettes[Object.keys(palettes)[Math.floor(seedFor(repo.language ?? "Mixed") * Object.keys(palettes).length)]];
  return { dark, land, glow, kind, seed, radius: Math.min(1.7, 0.65 + Math.log10(Math.max(repo.size ?? repo.stargazers_count ?? 1, 1)) * .22), rings: kind === 1 || seed > .77 };
}
