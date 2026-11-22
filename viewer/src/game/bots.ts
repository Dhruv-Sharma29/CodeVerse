// Bot pilots: local-only rivals while no real pilot shares the universe.
// They race you for commits, hunt aliens for points and pick fights with you; you can shoot them down.
// They never contest the gate, take the bounty, or reach the relay and the leaderboards.
import { ALIENS, HULLS, SUN_R, explode, floatText, type Alien, type HullId, type Planet, type Sim, type SimEvent } from "./sim.ts";

export interface Bot {
  id: number; name: string; color: string; hull: HullId;
  x: number; z: number; a: number; vx: number; vz: number; hp: number;
  fireCool: number; score: number; kills: number;
  /** Seconds until a downed bot comes back (0 while flying). */
  dead: number;
  /** Seconds left of chasing you after you shot it. */
  grudge: number;
  goal: { p: Planet; sat?: Planet["sats"][number]; ang?: number } | null; think: number;
}

/** Points for shooting a bot down (a real pilot is worth PVP.killScore). */
export const BOT_KILL = 150;
/** How sharp the bots are: 0 up to wave 3, rising to 1 at wave 15. Sharper bots lead their shots more, wobble less and fire faster. */
export const botSkill = (wave: number) => Math.min(1, Math.max(0, (wave - 3) / 12));
const NAMES = ["Lyra", "Vega", "Orion", "Atlas", "Juno", "Rigel"];
const COLORS = ["#ffb547", "#7dffb4", "#ff7fbf", "#74e2ff", "#b18cff", "#ff8a5c"];
const HULL_IDS: HullId[] = ["dart", "wasp", "titan"];
const TAU = Math.PI * 2;
const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

function place(b: Bot, rnd: () => number) {
  const a = rnd() * TAU, r = 60 + rnd() * 50;
  Object.assign(b, { x: Math.cos(a) * r, z: Math.sin(a) * r, a: a + Math.PI / 2, vx: 0, vz: 0, hp: 100, dead: 0, grudge: 0, goal: null, fireCool: 1 });
}

/** Replace the bots with `n` new ones. Ids are negative so they can never clash with relay ids. */
export function spawnBots(sim: Sim, n: number, rnd = Math.random) {
  const start = Math.floor(rnd() * NAMES.length);
  sim.bots = Array.from({ length: n }, (_, i) => {
    const k = (start + i) % NAMES.length;
    // Ids from -1001 down: never -1, the id you have while offline.
    const b: Bot = { id: -(1001 + i), name: NAMES[k], color: COLORS[k], hull: HULL_IDS[(start + i) % 3], x: 0, z: 0, a: 0, vx: 0, vz: 0, hp: 100,
      fireCool: 1, score: 0, kills: 0, dead: 0, grudge: 0, goal: null, think: 0 };
    place(b, rnd);
    return b;
  });
}
export const clearBots = (sim: Sim) => { sim.bots = []; };
/** The flying bot with this id, if any. */
export const liveBot = (sim: Sim, id: number | undefined) => id != null && id < 0 ? sim.bots.find(b => b.id === id && b.hp > 0) : undefined;

const satPos = (p: Planet, s: Planet["sats"][number]) => ({ x: p.x + Math.cos(s.a) * s.r, z: p.z + Math.sin(s.a) * s.r });

/** Next errand: the nearest commit nobody has taken yet (a race with you), else a lap around a random planet. */
function chooseGoal(sim: Sim, b: Bot, rnd: () => number): Bot["goal"] {
  let best: Bot["goal"] = null, bestD = Infinity;
  for (const p of sim.planets) for (const s of p.sats) {
    if (s.done) continue;
    const d = dist(satPos(p, s), b); if (d < bestD) { bestD = d; best = { p, sat: s }; }
  }
  if (best) return best;
  const p = sim.planets[Math.floor(rnd() * sim.planets.length)];
  return p ? { p, ang: rnd() * TAU } : null;
}

function fire(sim: Sim, b: Bot, ang: number) {
  const hull = HULLS[b.hull];
  sim.bullets.push({ x: b.x + Math.cos(ang) * 2.5, z: b.z + Math.sin(ang) * 2.5, vx: Math.cos(ang) * 115, vz: Math.sin(ang) * 115, life: .85, from: "ally", owner: b.id, dmg: hull.dmg, big: hull.dmg > 1 });
}

export function stepBots(sim: Sim, dt: number, rnd = Math.random) {
  const s = sim.ship, youOk = s.dead <= 0 && s.inv <= .3; // no picking on you while docked or shielded
  const skill = botSkill(sim.wave);
  for (const b of sim.bots) {
    if (b.dead > 0) { b.dead -= dt; if (b.dead <= 0) place(b, rnd); continue; }
    const hull = HULLS[b.hull];
    b.grudge = Math.max(0, b.grudge - dt); b.fireCool -= dt;
    // Targets: the nearest alien (points), or you when you're closer than any alien or it holds a grudge.
    let foe: Alien | null = null, fd = 60;
    for (const a of sim.aliens) { const d = dist(a, b); if (a.hp > 0 && !a.held && d < fd) { foe = a; fd = d; } }
    const pd = dist(s, b), duel = youOk && pd < 50 && (pd < fd || b.grudge > 0);
    let tx: number, tz: number, face: number;
    if (duel || foe) {
      const t = duel ? s : foe!, d = duel ? pd : fd, ang = Math.atan2(t.z - b.z, t.x - b.x);
      tx = t.x - Math.cos(ang + .7) * 24; tz = t.z - Math.sin(ang + .7) * 24; face = ang;
      if (b.fireCool <= 0 && Math.abs(wrap(ang - b.a)) < .25) {
        // Aliens get a full lead. Against you, early bots lead by half and wobble so a moving pilot can dodge;
        // by wave 15 they lead further, wobble a little less and fire about 35% faster: tough, still dodgeable.
        const lead = (duel ? .5 + .25 * skill : 1) * d / 115, err = duel ? (rnd() - .5) * .14 * (1 - .3 * skill) : 0;
        b.fireCool = hull.fire * (duel ? 2.6 - .7 * skill : 2.2 - .5 * skill);
        fire(sim, b, Math.atan2(t.z + t.vz * lead - b.z, t.x + t.vx * lead - b.x) + err);
      }
    } else {
      b.think -= dt;
      const g = b.goal;
      if (!g || b.think <= 0 || g.sat?.done) { b.goal = chooseGoal(sim, b, rnd); b.think = 8 + rnd() * 6; }
      const goal = b.goal;
      if (!goal) { tx = b.x; tz = b.z; }
      else if (goal.sat) ({ x: tx, z: tz } = satPos(goal.p, goal.sat));
      else { goal.ang = (goal.ang ?? 0) + dt * .25; tx = goal.p.x + Math.cos(goal.ang) * (goal.p.R + 10); tz = goal.p.z + Math.sin(goal.ang) * (goal.p.R + 10); }
      face = Math.atan2(b.vz, b.vx);
      if (goal?.sat && Math.hypot(tx - b.x, tz - b.z) < 2.6) { // got there first: the commit is gone
        goal.sat.done = true; b.score += 25; explode(sim, tx, tz, b.color, 14, 5); b.goal = null;
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
    // Solid to your ship: push apart half each and bounce, like two hulls meeting.
    if (s.dead <= 0) {
      const d = dist(b, s) || .001, min = 3.2;
      if (d < min) {
        const ux = (s.x - b.x) / d, uz = (s.z - b.z) / d, over = (min - d) / 2;
        s.x += ux * over; s.z += uz * over; b.x -= ux * over; b.z -= uz * over;
        const vn = (s.vx - b.vx) * ux + (s.vz - b.vz) * uz;
        if (vn < 0) { s.vx -= .75 * vn * ux; s.vz -= .75 * vn * uz; b.vx += .75 * vn * ux; b.vz += .75 * vn * uz; }
      }
    }
    if (sp > 1 || duel || foe) b.a += Math.max(-5 * dt, Math.min(5 * dt, wrap(face - b.a)));
  }
}

/** Your shot or nova hit a bot. Downing it scores BOT_KILL; it comes back after five seconds. */
export function damageBot(sim: Sim, b: Bot, dmg: number, ev: SimEvent[]) {
  b.hp -= dmg; b.grudge = 8;
  floatText(sim, b.x, b.z, `−${dmg}`, "#ff8a9a"); ev.push({ type: "pvpHit", id: b.id });
  if (b.hp <= 0) {
    b.hp = 0; b.dead = 5; sim.score += BOT_KILL; // not a dogfight win: those are against real pilots
    explode(sim, b.x, b.z, b.color, 70, 13); ev.push({ type: "botDown", name: b.name });
  }
}

/** Credit a bot when its shot finishes an alien (called by the simulation). */
export function creditBot(sim: Sim, owner: number | undefined, a: Alien) {
  const b = owner != null && owner < 0 ? sim.bots.find(x => x.id === owner) : undefined;
  if (b && a.hp <= 0) { b.kills++; b.score += ALIENS[a.kind].pts; }
}

