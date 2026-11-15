// How a repository's real data changes its planet: language physics, issue asteroids, star shields.
import type { Repository } from "../github/api.ts";

export type TraitKind = "heavy" | "bouncy" | "light" | "normal";
export interface Trait { kind: TraitKind; label: string; fling: number; knock: number; reach: number; bounce: number; flight: number }

const HEAVY = new Set(["Rust", "C", "C++", "Go", "Zig", "Assembly", "Fortran", "Ada"]);
const BOUNCY = new Set(["JavaScript", "TypeScript", "CoffeeScript", "Vue", "Svelte", "Astro", "Elm"]);
const LIGHT = new Set(["Python", "Ruby", "Shell", "Lua", "Perl", "PHP", "Jupyter Notebook"]);

/**
 * Physics when the planet is flung. fling: throw speed factor; knock: how hard it shoves other
 * planets; reach: extra smash radius against aliens; bounce: velocity kept when it ricochets (0 = no
 * ricochet); flight: seconds before it heads back to its orbit.
 */
export function planetTrait(language: string | null): Trait {
  if (language && HEAVY.has(language)) return { kind: "heavy", label: "Heavy · hits hard", fling: .75, knock: 2, reach: 3, bounce: 0, flight: 3.8 };
  if (language && BOUNCY.has(language)) return { kind: "bouncy", label: "Bouncy · ricochets", fling: 1, knock: 1, reach: 0, bounce: .85, flight: 5.5 };
  if (language && LIGHT.has(language)) return { kind: "light", label: "Light · flies fast", fling: 1.3, knock: .8, reach: 0, bounce: 0, flight: 3.8 };
  return { kind: "normal", label: "Balanced", fling: 1, knock: 1, reach: 0, bounce: 0, flight: 3.8 };
}

/** Issue asteroids: more open issues, more rocks, up to 10. Repos without issue data get none. */
export function issueRockCount(openIssues: number | undefined): number {
  return !openIssues || openIssues < 1 ? 0 : Math.min(10, Math.ceil(Math.log2(openIssues + 1) * 1.6));
}
export const ISSUE = { points: 30, charge: 3, r: .9 };

/** Star shields: planets with enough stars carry a pickup that shields you briefly. */
export const STAR = { minStars: 50, shield: 5, heal: 25, respawn: 45, catch: 3.6 };

/** Recently active repositories glow: pushed in the last 14 days, or on the trending list. */
export function isFresh(repo: Repository & { monthlyStars?: number }, now: number): boolean {
  if ((repo.monthlyStars ?? 0) > 0) return true;
  const pushed = Date.parse(repo.pushed_at || "");
  return Number.isFinite(pushed) && now - pushed < 14 * 86_400_000;
}
