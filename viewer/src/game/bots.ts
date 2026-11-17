// Bot pilots: local-only company while no real pilot shares the universe.
// They fly to commits and fight aliens, but never shoot you, contest the gate or reach the relay and boards.
import { ALIENS, HULLS, SUN_R, explode, type Alien, type HullId, type Planet, type Sim } from "./sim.ts";

export interface Bot {
  id: number; name: string; color: string; hull: HullId;
  x: number; z: number; a: number; vx: number; vz: number; hp: number;
  fireCool: number; score: number; kills: number;
  /** Commits this bot already flew through (they stay for you: each pilot collects their own). */
  got: WeakSet<object>;
  goal: { p: Planet; sat?: Planet["sats"][number]; ang?: number } | null; think: number;
}

const NAMES = ["Lyra", "Vega", "Orion", "Atlas", "Juno", "Rigel"];
const COLORS = ["#ffb547", "#7dffb4", "#ff7fbf", "#74e2ff", "#b18cff", "#ff8a5c"];
const HULL_IDS: HullId[] = ["dart", "wasp", "titan"];
const TAU = Math.PI * 2;
const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Replace the bots with `n` new ones. Ids are negative so they can never clash with relay ids. */
export function spawnBots(sim: Sim, n: number, rnd = Math.random) {
  const start = Math.floor(rnd() * NAMES.length);
  sim.bots = Array.from({ length: n }, (_, i) => {
    const a = rnd() * TAU, r = 45 + rnd() * 40, k = (start + i) % NAMES.length;
    return { id: -(i + 1), name: NAMES[k], color: COLORS[k], hull: HULL_IDS[(start + i) % 3], x: Math.cos(a) * r, z: Math.sin(a) * r, a: a + Math.PI / 2,
      vx: 0, vz: 0, hp: 100, fireCool: 1, score: 0, kills: 0, got: new WeakSet(), goal: null, think: 0 };
  });
}
export const clearBots = (sim: Sim) => { sim.bots = []; };

const satPos = (p: Planet, s: Planet["sats"][number]) => ({ x: p.x + Math.cos(s.a) * s.r, z: p.z + Math.sin(s.a) * s.r });

/** Pick where to go next: an uncollected commit not right next to you, else a lap around a random planet. */
function chooseGoal(sim: Sim, b: Bot, rnd: () => number): Bot["goal"] {
  let best: Bot["goal"] = null, bestD = Infinity;
  for (const p of sim.planets) for (const s of p.sats) {
    if (s.done || b.got.has(s)) continue;
    const at = satPos(p, s);
    if (dist(at, sim.ship) < 40) continue; // leave the ones near you alone
    const d = dist(at, b); if (d < bestD) { bestD = d; best = { p, sat: s }; }
  }
  if (best) return best;
  const p = sim.planets[Math.floor(rnd() * sim.planets.length)];
  return p ? { p, ang: rnd() * TAU } : null;
}

export function stepBots(sim: Sim, dt: number, rnd = Math.random) {
  for (const b of sim.bots) {
    const hull = HULLS[b.hull];
    // Fight: the nearest alien within range, circling it at a safe distance.
    let foe: Alien | null = null, fd = 60;
    for (const a of sim.aliens) { const d = dist(a, b); if (a.hp > 0 && !a.held && d < fd) { foe = a; fd = d; } }
    let tx: number, tz: number, face: number;
    if (foe) {
      const ang = Math.atan2(foe.z - b.z, foe.x - b.x);
      tx = foe.x - Math.cos(ang + .7) * 24; tz = foe.z - Math.sin(ang + .7) * 24; face = ang;
      b.fireCool -= dt;
      if (b.fireCool <= 0 && Math.abs(wrap(ang - b.a)) < .25) {
        b.fireCool = hull.fire * 2.2; // slower trigger than a human, so they help without carrying you
        // Aim at where the alien will be (the nose is already within ~14 degrees, so this reads as a normal shot).
        const t = fd / 115, lead = Math.atan2(foe.z + foe.vz * t - b.z, foe.x + foe.vx * t - b.x);
        sim.bullets.push({ x: b.x + Math.cos(lead) * 2.5, z: b.z + Math.sin(lead) * 2.5, vx: Math.cos(lead) * 115, vz: Math.sin(lead) * 115, life: .85, from: "ally", owner: b.id, dmg: hull.dmg, big: hull.dmg > 1 });
      }
    } else {
      b.think -= dt;
      const g = b.goal;
      if (!g || b.think <= 0 || (g.sat && (g.sat.done || b.got.has(g.sat)))) { b.goal = chooseGoal(sim, b, rnd); b.think = 8 + rnd() * 6; }
      const goal = b.goal;
      if (!goal) { tx = b.x; tz = b.z; }
      else if (goal.sat) ({ x: tx, z: tz } = satPos(goal.p, goal.sat));
      else { goal.ang = (goal.ang ?? 0) + dt * .25; tx = goal.p.x + Math.cos(goal.ang) * (goal.p.R + 10); tz = goal.p.z + Math.sin(goal.ang) * (goal.p.R + 10); }
      face = Math.atan2(b.vz, b.vx);
      if (goal?.sat && Math.hypot(tx - b.x, tz - b.z) < 2.6) {
        b.got.add(goal.sat); b.score += 25; explode(sim, tx, tz, "#ffcf6e", 10, 4); b.goal = null;
      }
    }
    // Steer toward the target point, keeping clear of the sun and planets.
    let dx = tx - b.x, dz = tz - b.z;
    const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
    const push = (o: { x: number; z: number }, r: number) => {
      const d = dist(b, o) || .01; if (d < r) { const k = (r - d) / r * 3; dx += (b.x - o.x) / d * k; dz += (b.z - o.z) / d * k; }
    };
    push({ x: 0, z: 0 }, SUN_R + 12);
    for (const p of sim.planets) push(p, p.R + 5);
    const slow = Math.min(1, dl / 10); // ease in on the target
    b.vx += dx * hull.acc * dt; b.vz += dz * hull.acc * dt;
    const drag = Math.exp(-1.4 * dt); b.vx *= drag; b.vz *= drag;
    const max = hull.max * (.6 + .4 * slow), sp = Math.hypot(b.vx, b.vz);
    if (sp > max) { b.vx *= max / sp; b.vz *= max / sp; }
    b.x += b.vx * dt; b.z += b.vz * dt;
    if (sp > 1 || foe) b.a += Math.max(-5 * dt, Math.min(5 * dt, wrap(face - b.a)));
  }
}

/** Credit a bot when its shot finishes an alien (called by the simulation). */
export function creditBot(sim: Sim, owner: number | undefined, a: Alien) {
  const b = owner != null && owner < 0 ? sim.bots.find(x => x.id === owner) : undefined;
  if (b && a.hp <= 0) { b.kills++; b.score += ALIENS[a.kind].pts; }
}
