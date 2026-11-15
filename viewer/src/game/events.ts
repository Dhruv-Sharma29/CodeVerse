// World events. Like the gate and the comet, everything here is computed from the universe name and
// the clock, so every pilot sees the same storm, the same daily challenge, with no server state.
import { seedFor } from "../github/planetStyle.ts";

const TAU = Math.PI * 2;

/**
 * Seeded random in [0, 1). seedFor's hash barely changes when only the last characters of the key
 * change (storm:...:1, storm:...:2), which clumped meteor start times; an integer finalizer
 * (from murmur3/splitmix) spreads it evenly.
 */
export function rand(key: string): number {
  let h = Math.floor(seedFor(key) * 4294967296) >>> 0;
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15; h = Math.imul(h, 0x846ca68b); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Meteor storm: 40 s of meteors every 10 minutes, announced 10 s before. */
export const STORM = { period: 600_000, warn: 10_000, length: 40_000, count: 320, speed: 140, r: 2.4, damage: 20, points: 50 };
export interface Meteor { id: number; x: number; z: number; vx: number; vz: number }
export type StormPhase = "calm" | "warning" | "active";

export function stormPhase(now: number): StormPhase {
  const t = now % STORM.period;
  return t < STORM.length ? "active" : t > STORM.period - STORM.warn ? "warning" : "calm";
}

/**
 * Meteors in flight at `now` for this universe. Each enters past the rim at a seeded moment and angle
 * and crosses towards a seeded point inside the planets' area, so the whole map is covered.
 */
export function stormMeteors(room: string, edge: number, now: number): Meteor[] {
  const epoch = Math.floor(now / STORM.period), t = now % STORM.period;
  if (t > STORM.length + 12_000) return [];
  const out: Meteor[] = [], R = edge + 40;
  for (let i = 0; i < STORM.count; i++) {
    const age = (t - rand(`storm:${room}:${epoch}:${i}`) * STORM.length) / 1000;
    if (age < 0) continue;
    const a = rand(`${i}:${epoch}:${room}:storm`) * TAU, sx = Math.cos(a) * R, sz = Math.sin(a) * R;
    const ta = rand(`aim:${room}:${i}:${epoch}`) * TAU, tr = Math.sqrt(rand(`${epoch}:aim:${i}:${room}`)) * edge * .8;
    const tx = Math.cos(ta) * tr, tz = Math.sin(ta) * tr, d = Math.hypot(tx - sx, tz - sz) || 1;
    const vx = (tx - sx) / d * STORM.speed, vz = (tz - sz) / d * STORM.speed, x = sx + vx * age, z = sz + vz * age;
    if (age > 1 && Math.hypot(x, z) > R + 5) continue; // already left the map
    out.push({ id: epoch * 1000 + i, x, z, vx, vz });
  }
  return out;
}

/** Bounty: with two or more pilots, the top scorer (at least `min`) is worth `bonus` extra when shot down. */
export const BOUNTY = { min: 1000, bonus: 500 };
export function bountyHolder(scores: { id: number; score: number }[]): number | null {
  if (scores.length < 2) return null;
  const top = scores.reduce((a, b) => (b.score > a.score ? b : a));
  return top.score >= BOUNTY.min && scores.filter(s => s.score === top.score).length === 1 ? top.id : null;
}

/** Hold the gate: a ring around the hyperjump gate that scores while you are alone in it. */
export const HOLD = { r: 22, rate: 15 };

/** Well-known public GitHub accounts the daily challenge picks from. */
export const DAILY_ACCOUNTS = ["torvalds", "vercel", "facebook", "microsoft", "google", "sindresorhus", "gaearon", "yyx990803",
  "rust-lang", "golang", "denoland", "nodejs", "python", "kubernetes", "tensorflow", "openai", "anthropics", "github", "apple", "mrdoob"];
export type DailyGoal = { kind: "commits" | "kills" | "meteors"; n: number; text: string };
const GOALS: DailyGoal[] = [
  { kind: "commits", n: 10, text: "Collect 10 commits" },
  { kind: "kills", n: 25, text: "Shoot down 25 aliens" },
  { kind: "commits", n: 15, text: "Collect 15 commits" },
  { kind: "kills", n: 40, text: "Shoot down 40 aliens" },
];
export const DAILY_REWARD = 1000;

/** Today's challenge (UTC day): the same account and goal for every pilot. */
export function dailyChallenge(date: Date) {
  const day = date.toISOString().slice(0, 10);
  const login = DAILY_ACCOUNTS[Math.floor(rand(`daily:${day}`) * DAILY_ACCOUNTS.length)];
  const goal = GOALS[Math.floor(rand(`goal:${day}`) * GOALS.length)];
  return { day, login, room: `u:${login}`, goal };
}
