// Orbit game simulation: plain mutable state stepped once per frame, outside React.
// The game plays on the x/z plane; the renderer adds height and effects.
import { planetStyle, seedFor } from "../github/planetStyle.ts";
import type { GitCommit, Repository } from "../github/api";

export interface Universe { room: string; title: string; subtitle: string; owner: string | null; repos: Repository[] }

export const SUN_R = 8;
export const SPAWN = { x: 0, z: 31 };
export const PORTAL_R = 6;
/** The hyperjump gate jumps to a new random spot this often. */
export const GATE_PERIOD = 180_000;
/**
 * Gate spot: a random point on the outer rim, past the last planet. Seeded by universe + time
 * window, so every pilot in a universe sees it in the same place without the server.
 * ponytail: relies on roughly synced clocks; a pilot whose clock is off by minutes sees the old spot.
 */
export function gateSpot(room: string, edge: number, epoch: number) {
  const a = seedFor(`${room}:${epoch}`) * TAU, r = edge - 14 - seedFor(`${epoch}:${room}`) * 8;
  return { x: Math.cos(a) * r, z: Math.sin(a) * r, r: PORTAL_R, epoch };
}
export const gateEpoch = () => Math.floor(Date.now() / GATE_PERIOD);

/** The CodeVerse comet crosses every universe once per period on a fresh random chord. */
export const COMET_PERIOD = 120_000;
export const COMET_CATCH = 6;
/**
 * Comet position at a moment: enters past the rim at a seeded angle and leaves on the far side,
 * on a seeded random chord. Same seed scheme as the gate, so all pilots see it in the same place.
 */
export function cometAt(room: string, edge: number, now: number) {
  const epoch = Math.floor(now / COMET_PERIOD), k = (now % COMET_PERIOD) / COMET_PERIOD;
  const a = seedFor(`comet:${room}:${epoch}`) * TAU, b = a + Math.PI + (seedFor(`${epoch}:comet:${room}`) - .5) * 1.8;
  const r = edge + 30, sx = Math.cos(a) * r, sz = Math.sin(a) * r, ex = Math.cos(b) * r, ez = Math.sin(b) * r, secs = COMET_PERIOD / 1000;
  return { x: sx + (ex - sx) * k, z: sz + (ez - sz) * k, vx: (ex - sx) / secs, vz: (ez - sz) / secs, epoch };
}
const TAU = Math.PI * 2;

export interface Sat { c: GitCommit; a: number; r: number; done: boolean }
export interface Planet {
  i: number; repo: Repository; R: number; orbit: number; ang: number; speed: number; glow: string;
  x: number; z: number; vx: number; vz: number; px: number; pz: number;
  mode: "orbit" | "held" | "flung" | "return" | "remote"; modeT: number;
  commits: GitCommit[] | null; loading: boolean; sats: Sat[];
}
export type AlienKind = "saucer" | "hunter" | "swarmer" | "mothership";
export interface Alien { id: number; kind: AlienKind; x: number; z: number; vx: number; vz: number; hp: number; max: number; cool: number; held: boolean; flung: number; spin: number; orbitDir: number; t: number; hitCool: number }
/** Per-kind tuning: hit radius, score, charge reward, explosion colour/size. */
export const ALIENS: Record<AlienKind, { hp: number; r: number; pts: number; charge: number; color: string; boom: number }> = {
  saucer: { hp: 3, r: 2.6, pts: 100, charge: 6, color: "#7dffb4", boom: 10 },
  hunter: { hp: 1, r: 2, pts: 60, charge: 6, color: "#ff6f7f", boom: 7 },
  swarmer: { hp: 1, r: 1.4, pts: 40, charge: 3, color: "#ffd36e", boom: 5 },
  mothership: { hp: 40, r: 6.5, pts: 1500, charge: 60, color: "#d36bff", boom: 30 },
};

export type HullId = "dart" | "wasp" | "titan";
export const HULLS: Record<HullId, { name: string; blurb: string; hp: number; acc: number; max: number; boost: number; fire: number; guns: 2 | 3; dmg: number; spread: number; trail: string }> = {
  dart: { name: "Dart", blurb: "Balanced. Twin blasters.", hp: 100, acc: 78, max: 46, boost: 74, fire: .13, guns: 2, dmg: 1, spread: 0, trail: "#74e2ff" },
  wasp: { name: "Wasp", blurb: "Fastest. Rapid fire, light hull.", hp: 70, acc: 102, max: 58, boost: 90, fire: .085, guns: 2, dmg: 1, spread: 0, trail: "#7dffb4" },
  titan: { name: "Titan", blurb: "Armoured. Three-way heavy cannon.", hp: 160, acc: 58, max: 38, boost: 60, fire: .3, guns: 3, dmg: 2, spread: .17, trail: "#ffb547" },
};
export const isHull = (h: unknown): h is HullId => typeof h === "string" && h in HULLS;
export interface Bullet { x: number; z: number; vx: number; vz: number; life: number; from: "me" | "ally" | "alien"; dmg?: number; big?: boolean }
export interface Particle { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; r: number; g: number; b: number }
export interface Flash { x: number; z: number; t: number; max: number; size: number; color: string }
export interface Nova { x: number; z: number; t: number; mine: boolean; hit: Set<Alien | Planet> }
export interface Remote { id: number; name: string; color: string; x: number; z: number; a: number; vx: number; vz: number; hp: number; tx: number; tz: number; seen: number }
export interface Input { move: { x: number; z: number }; aim: { x: number; z: number } | null; fire: boolean; grab: boolean; boost: boolean; nova: boolean; autoAim: boolean; relative?: boolean }
export type SimEvent =
  | { type: "commit"; planet: Planet; commit: GitCommit }
  | { type: "kill"; kind: Alien["kind"]; points: number }
  | { type: "hurt" } | { type: "dead" } | { type: "portal" } | { type: "gate" } | { type: "comet" } | { type: "wave"; n: number; boss: boolean }
  | { type: "load"; planet: Planet } | { type: "shot"; x: number; z: number; a: number }
  | { type: "nova"; x: number; z: number } | { type: "grab" } | { type: "fling" } | { type: "boom"; x: number; z: number };

export const emptyInput = (): Input => ({ move: { x: 0, z: 0 }, aim: null, fire: false, grab: false, boost: false, nova: false, autoAim: false });

export function createSim(universe: Universe) {
  const planets: Planet[] = universe.repos.map((repo, i) => {
    const st = planetStyle(repo);
    const orbit = 46 + i * 24 + st.seed * 8; // wide lanes: room to dogfight between planets
    return {
      i, repo, R: 1.4 + st.radius * 2.4, orbit, ang: st.seed * TAU, glow: st.glow,
      speed: .55 * Math.pow(46 / orbit, 1.5) * (i % 3 === 2 ? -1 : 1),
      x: 0, z: 0, vx: 0, vz: 0, px: 0, pz: 0, mode: "orbit", modeT: 0, commits: null, loading: false, sats: [],
    };
  });
  for (const p of planets) placeOnOrbit(p);
  const edge = Math.max(320, (planets.at(-1)?.orbit ?? 60) + 90); // outer band past the last planet holds the gate
  return {
    universe, planets, t: 0, edge,
    portal: gateSpot(universe.room, edge, gateEpoch()),
    comet: cometAt(universe.room, edge, Date.now()), cometCaught: -1, nearComet: false,
    ship: { hull: "dart" as HullId, x: SPAWN.x, z: SPAWN.z, vx: 0, vz: 10, a: Math.PI / 2, hp: 100, inv: 2, dead: 0, fireCool: 0, gun: 1, thrust: 0, lastHit: -9 },
    aliens: [] as Alien[], bullets: [] as Bullet[], particles: [] as Particle[], flashes: [] as Flash[], novas: [] as Nova[],
    remotes: new Map<number, Remote>(),
    grab: null as null | { planet?: Planet; alien?: Alien },
    score: 0, charge: 0, wave: 0, waveTimer: 4, kills: 0, deaths: 0, commits: 0, shake: 0, portalCool: 2.5, nextAlien: 1,
    near: null as Planet | null,
  };
}
export type Sim = ReturnType<typeof createSim>;

const orbitPos = (p: Planet) => ({ x: Math.cos(p.ang) * p.orbit + p.px, z: Math.sin(p.ang) * p.orbit + p.pz });
function placeOnOrbit(p: Planet) { const o = orbitPos(p); p.x = o.x; p.z = o.z; }
const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
const angleDiff = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
function hex(c: string) { const n = parseInt(c.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; }

export function explode(sim: Sim, x: number, z: number, color: string, n = 36, size = 9) {
  const [r, g, b] = hex(color);
  for (let i = 0; i < n && sim.particles.length < 1400; i++) {
    const a = Math.random() * TAU, v = 6 + Math.random() * 26, up = (Math.random() - .3) * 18;
    sim.particles.push({ x, y: 1, z, vx: Math.cos(a) * v, vy: up, vz: Math.sin(a) * v, life: .5 + Math.random() * .7, max: 1.2, r, g, b });
  }
  sim.flashes.push({ x, z, t: 0, max: .5, size, color });
}

function hurt(sim: Sim, amount: number, ev: SimEvent[]) {
  const s = sim.ship;
  if (s.inv > 0 || s.dead > 0) return;
  s.hp -= amount; s.inv = .12; s.lastHit = sim.t; sim.shake = Math.min(1, sim.shake + .45); ev.push({ type: "hurt" });
  if (s.hp <= 0) {
    s.hp = 0; s.dead = 2.6; sim.deaths++; sim.grab = null; sim.shake = 1;
    explode(sim, s.x, s.z, "#74e2ff", 90, 16); ev.push({ type: "dead" });
  }
}

function killAlien(sim: Sim, a: Alien, ev: SimEvent[], credit = true) {
  if (a.hp <= -99) return;
  a.hp = -99;
  const k = ALIENS[a.kind];
  explode(sim, a.x, a.z, k.color, a.kind === "mothership" ? 160 : 46, k.boom);
  if (a.kind === "mothership") { sim.shake = 1; for (let i = 0; i < 6; i++) explode(sim, a.x + (Math.random() - .5) * 14, a.z + (Math.random() - .5) * 14, "#ffb547", 30, 12); }
  if (credit) {
    sim.score += k.pts; sim.kills++; sim.charge = Math.min(100, sim.charge + k.charge);
    ev.push({ type: "kill", kind: a.kind, points: k.pts });
  }
}
/** Bullets chip away; "instant kill" sources (planets, novas, blasts) pass a big number. The boss takes those as capped, spaced-out hits. */
function damageAlien(sim: Sim, a: Alien, dmg: number, ev: SimEvent[], credit = true) {
  if (a.hp <= 0) return;
  if (a.kind === "mothership" && dmg > 2) {
    if (a.hitCool > 0) return;
    a.hitCool = .6; dmg = 12; sim.shake = Math.min(1, sim.shake + .4); explode(sim, a.x, a.z, "#ffb547", 40, 14);
  }
  a.hp -= dmg;
  if (a.hp <= 0) killAlien(sim, a, ev, credit);
}
function addAlien(sim: Sim, kind: AlienKind, x: number, z: number, hp = ALIENS[kind].hp) {
  const r = Math.hypot(x, z); if (r > sim.edge) { x *= sim.edge / r; z *= sim.edge / r; }
  sim.aliens.push({ id: sim.nextAlien++, kind, x, z, vx: 0, vz: 0, hp, max: hp, cool: 1.5 + Math.random() * 2, held: false, flung: 0, spin: Math.random() * TAU, orbitDir: Math.random() < .5 ? -1 : 1, t: Math.random() * 10, hitCool: 0 });
}

function spawnWave(sim: Sim, ev: SimEvent[]) {
  sim.wave++;
  const around = (d: number) => { const a = Math.random() * TAU, r = d + Math.random() * 25; return [sim.ship.x + Math.cos(a) * r, sim.ship.z + Math.sin(a) * r] as const; };
  const boss = sim.wave % 5 === 0;
  if (boss) {
    // Every fifth wave: a mothership that rings the area with fire and launches swarmers.
    const [x, z] = around(90); addAlien(sim, "mothership", x, z, 40 + sim.wave * 3);
    for (let i = 0; i < 2; i++) addAlien(sim, "saucer", ...around(70));
  } else {
    const n = Math.min(14, 2 + Math.floor(sim.wave * 1.6));
    const hunters = Math.min(n - 1, Math.floor(sim.wave / 2));
    for (let i = 0; i < n; i++) addAlien(sim, i < hunters ? "hunter" : "saucer", ...around(70));
    // From wave 3: packs of swarmer drones arriving together.
    const packs = sim.wave >= 3 ? 1 + Math.floor((sim.wave - 3) / 3) : 0;
    for (let p = 0; p < packs; p++) { const [x, z] = around(85); for (let i = 0; i < 6; i++) addAlien(sim, "swarmer", x + (Math.random() - .5) * 8, z + (Math.random() - .5) * 8); }
  }
  ev.push({ type: "wave", n: sim.wave, boss });
}

/** Push the ship back out of the portal after the hyperjump dialog closes. */
export function leavePortal(sim: Sim) {
  const s = sim.ship, g = sim.portal, d = Math.hypot(g.x, g.z) || 1, nx = -g.x / d, nz = -g.z / d; // back toward the sun
  s.x = g.x + nx * (g.r + 6); s.z = g.z + nz * (g.r + 6); s.vx = nx * 14; s.vz = nz * 14; sim.portalCool = 1.5;
}

export function step(sim: Sim, input: Input, dt: number, ev: SimEvent[]) {
  sim.t += dt;
  const epoch = gateEpoch();
  if (epoch !== sim.portal.epoch && sim.portalCool < 1e8) { sim.portal = gateSpot(sim.universe.room, sim.edge, epoch); ev.push({ type: "gate" }); }
  sim.comet = cometAt(sim.universe.room, sim.edge, Date.now());
  if (Math.random() < .6 && sim.particles.length < 1300) { // sparkle trail
    const c = sim.comet;
    sim.particles.push({ x: c.x + (Math.random() - .5) * 2, y: 1.5, z: c.z + (Math.random() - .5) * 2, vx: -c.vx * .4 + (Math.random() - .5) * 2, vy: (Math.random() - .5) * 2, vz: -c.vz * .4 + (Math.random() - .5) * 2, life: 1.4, max: 1.4, r: .75, g: .95, b: 1 });
  }
  sim.shake = Math.max(0, sim.shake - dt * 2.2);
  sim.portalCool -= dt;
  const s = sim.ship, alive = s.dead <= 0;

  // ---- planets
  for (const p of sim.planets) {
    p.ang += p.speed * dt;
    const decay = Math.exp(-1.6 * dt); p.px *= decay; p.pz *= decay;
    if (p.mode === "orbit") placeOnOrbit(p);
    else if (p.mode === "flung" || p.mode === "remote") {
      p.x += p.vx * dt; p.z += p.vz * dt;
      const drag = Math.exp(-(p.mode === "flung" ? .45 : 0) * dt); p.vx *= drag; p.vz *= drag;
      p.modeT += dt;
      if (p.mode === "flung" && p.modeT > 3.8) { p.mode = "return"; p.modeT = 0; }
      if (p.mode === "remote" && p.modeT > .8) { p.mode = "return"; p.modeT = 0; }
      if (p.mode === "flung") {
        for (const a of sim.aliens) if (a.hp > -99 && dist(p, a) < p.R + ALIENS[a.kind].r) damageAlien(sim, a, 99, ev);
        for (const q of sim.planets) {
          if (q === p) continue;
          const d = dist(p, q);
          if (d < p.R + q.R) {
            const nx = (q.x - p.x) / (d || 1), nz = (q.z - p.z) / (d || 1);
            q.px += nx * 6; q.pz += nz * 6; p.vx -= nx * 30; p.vz -= nz * 30;
            explode(sim, (p.x + q.x) / 2, (p.z + q.z) / 2, q.glow, 30, 10); sim.shake = Math.min(1, sim.shake + .4);
            ev.push({ type: "boom", x: p.x, z: p.z });
          }
        }
      }
      if (Math.hypot(p.x, p.z) < SUN_R + p.R) { const d = Math.hypot(p.x, p.z) || 1; p.vx = p.x / d * 30; p.vz = p.z / d * 30; }
    } else if (p.mode === "return") {
      const o = orbitPos(p), k = Math.min(1, dt * 2.6);
      p.x += (o.x - p.x) * k; p.z += (o.z - p.z) * k;
      if (dist(p, o) < .4) p.mode = "orbit";
    }
    for (const sat of p.sats) sat.a += dt * (1.1 + 4 / sat.r);
  }

  // ---- ship
  if (!alive) {
    s.dead -= dt;
    if (s.dead <= 0) Object.assign(s, { x: SPAWN.x, z: SPAWN.z, vx: 0, vz: 12, hp: HULLS[s.hull].hp, inv: 2.5, dead: 0 });
  } else {
    s.inv = Math.max(0, s.inv - dt);
    const hull = HULLS[s.hull];
    if (sim.t - s.lastHit > 4) s.hp = Math.min(hull.hp, s.hp + hull.hp * .04 * dt);
    // Facing first, so ship-relative thrust uses this frame's nose direction.
    const sp0 = Math.hypot(s.vx, s.vz);
    if (input.aim) s.a = Math.atan2(input.aim.z - s.z, input.aim.x - s.x);
    else if (input.autoAim) {
      let best: Alien | null = null;
      for (const a of sim.aliens) if (a.hp > 0 && !a.held && dist(s, a) < 65 && (!best || dist(s, a) < dist(s, best))) best = a;
      if (best) { const lead = dist(s, best) / 110; s.a = Math.atan2(best.z + best.vz * lead - s.z, best.x + best.vx * lead - s.x); }
      else if (sp0 > 3) s.a = Math.atan2(s.vz, s.vx);
    } else if (input.relative) s.a += input.move.x * 3.2 * dt; // keyboard only: A/D turn the ship
    else if (sp0 > 3) s.a = Math.atan2(s.vz, s.vx);

    let ix = input.move.x, iz = input.move.z;
    if (input.relative) {
      // W/S thrust along the nose; A/D strafe when the mouse aims, otherwise they only turn.
      const fwd = -iz, side = input.aim ? ix : 0, fx = Math.cos(s.a), fz = Math.sin(s.a);
      ix = fx * fwd - fz * side; iz = fz * fwd + fx * side;
    }
    const ml = Math.hypot(ix, iz);
    const mx = ml > 1 ? ix / ml : ix, mz = ml > 1 ? iz / ml : iz;
    const acc = hull.acc * (input.boost ? 1.9 : 1);
    s.vx += mx * acc * dt; s.vz += mz * acc * dt;
    const drag = Math.exp(-1.4 * dt); s.vx *= drag; s.vz *= drag;
    const max = input.boost ? hull.boost : hull.max, sp = Math.hypot(s.vx, s.vz);
    if (sp > max) { s.vx *= max / sp; s.vz *= max / sp; }
    s.thrust = Math.min(1, ml) * (input.boost ? 1.6 : 1);
    s.x += s.vx * dt; s.z += s.vz * dt;
    // Engine trail in the hull's colour.
    if (s.thrust > .15 && sim.particles.length < 1300) {
      const [r, g, b] = hex(hull.trail), bx = s.x - Math.cos(s.a) * 2.8, bz = s.z - Math.sin(s.a) * 2.8;
      sim.particles.push({ x: bx, y: 1.2, z: bz, vx: -Math.cos(s.a) * 8 + (Math.random() - .5) * 3, vy: 0, vz: -Math.sin(s.a) * 8 + (Math.random() - .5) * 3, life: .3 + s.thrust * .2, max: .5, r, g, b });
    }


    const d0 = Math.hypot(s.x, s.z);
    if (d0 < SUN_R + 1.6) { s.x *= (SUN_R + 1.6) / d0; s.z *= (SUN_R + 1.6) / d0; s.vx = s.x / d0 * 30; s.vz = s.z / d0 * 30; hurt(sim, 12, ev); }
    if (d0 > sim.edge) { s.vx -= s.x / d0 * 90 * dt; s.vz -= s.z / d0 * 90 * dt; }
    for (const p of sim.planets) {
      if (p.mode === "held" || p.mode === "flung") continue;
      const d = dist(s, p), min = p.R + 1.5;
      if (d < min) {
        const nx = (s.x - p.x) / (d || 1), nz = (s.z - p.z) / (d || 1);
        s.x = p.x + nx * min; s.z = p.z + nz * min;
        const vn = s.vx * nx + s.vz * nz; if (vn < 0) { s.vx -= 1.5 * vn * nx; s.vz -= 1.5 * vn * nz; }
      }
    }

    s.fireCool -= dt;
    if (input.fire && s.fireCool <= 0 && !sim.grab) {
      s.gun = -s.gun; s.fireCool = hull.fire;
      // Light aim assist: snap to an alien's lead point when the shot is already within ~8°.
      let fa = s.a;
      for (const a of sim.aliens) {
        const d = dist(s, a); if (a.hp <= 0 || a.held || d > 80) continue;
        const t = d / 115, lead = Math.atan2(a.z + a.vz * t - s.z, a.x + a.vx * t - s.x);
        if (angleDiff(lead, s.a) < .14) { fa = lead; break; }
      }
      const shots = hull.guns === 3 ? [-hull.spread, 0, hull.spread] : [0];
      for (const off of shots) {
        const sa = fa + off, cx = Math.cos(sa), sz = Math.sin(sa), side = hull.guns === 3 ? 0 : .8 * s.gun;
        const x = s.x + cx * 2.4 - sz * side, z = s.z + sz * 2.4 + cx * side;
        sim.bullets.push({ x, z, vx: cx * 115 + s.vx * .5, vz: sz * 115 + s.vz * .5, life: .85, from: "me", dmg: hull.dmg, big: hull.dmg > 1 });
        ev.push({ type: "shot", x, z, a: sa });
      }
    }
    if (input.nova && sim.charge >= 100) {
      sim.charge = 0; sim.novas.push({ x: s.x, z: s.z, t: 0, mine: true, hit: new Set() }); sim.shake = 1;
      ev.push({ type: "nova", x: s.x, z: s.z });
    }

    sim.near = null;
    for (const p of sim.planets) {
      const d = dist(s, p);
      if (d < p.R + 20 && (!sim.near || d - p.R < dist(s, sim.near) - sim.near.R)) sim.near = p;
      for (const sat of p.sats) {
        if (sat.done) continue;
        const sx = p.x + Math.cos(sat.a) * sat.r, sz2 = p.z + Math.sin(sat.a) * sat.r;
        if (Math.hypot(s.x - sx, s.z - sz2) < 2.6) {
          sat.done = true; sim.score += 25; sim.commits++; sim.charge = Math.min(100, sim.charge + 12);
          explode(sim, sx, sz2, "#ffcf6e", 18, 5); ev.push({ type: "commit", planet: p, commit: sat.c });
        }
      }
    }
    if (sim.near && sim.near.commits === null && !sim.near.loading) { sim.near.loading = true; ev.push({ type: "load", planet: sim.near }); }
    const dc = dist(s, sim.comet);
    sim.nearComet = dc < 28;
    if (dc < COMET_CATCH && sim.cometCaught !== sim.comet.epoch) {
      // Catching the comet: once per crossing, a burst of score and supernova charge.
      sim.cometCaught = sim.comet.epoch; sim.score += 250; sim.charge = Math.min(100, sim.charge + 25);
      explode(sim, sim.comet.x, sim.comet.z, "#e8fbff", 60, 14); ev.push({ type: "comet" });
    }
    if (dist(s, sim.portal) < sim.portal.r && sim.portalCool <= 0) { sim.portalCool = 1e9; s.vx = s.vz = 0; ev.push({ type: "portal" }); }
  }

  // ---- gravity grab
  if (sim.grab && (!input.grab || !alive)) {
    const dx = Math.cos(s.a), dz = Math.sin(s.a), g = sim.grab;
    const target = g.planet ?? g.alien!;
    target.vx = s.vx + dx * 85; target.vz = s.vz + dz * 85;
    if (g.planet) { g.planet.mode = "flung"; g.planet.modeT = 0; }
    if (g.alien) { g.alien.held = false; g.alien.flung = 2.4; }
    sim.grab = null; sim.shake = Math.min(1, sim.shake + .3); ev.push({ type: "fling" });
  } else if (!sim.grab && input.grab && alive) {
    let best: { planet?: Planet; alien?: Alien; d: number } | null = null;
    const consider = (o: { x: number; z: number }, d: number) => d < 18 || (d < 55 && angleDiff(Math.atan2(o.z - s.z, o.x - s.x), s.a) < .55);
    for (const p of sim.planets) { const d = dist(s, p) - p.R; if ((p.mode === "orbit" || p.mode === "return") && consider(p, d) && (!best || d < best.d)) best = { planet: p, d }; }
    for (const a of sim.aliens) { const d = dist(s, a); if (a.hp > 0 && a.kind !== "mothership" && a.flung <= 0 && consider(a, d) && (!best || d < best.d)) best = { alien: a, d }; }
    if (best) {
      sim.grab = best.planet ? { planet: best.planet } : { alien: best.alien };
      if (best.planet) { best.planet.mode = "held"; best.planet.vx = best.planet.vz = 0; }
      if (best.alien) best.alien.held = true;
      ev.push({ type: "grab" });
    }
  }
  if (sim.grab) {
    const o = sim.grab.planet ?? sim.grab.alien!, R = sim.grab.planet?.R ?? 2;
    const hx = s.x + Math.cos(s.a) * (7 + R * 1.4), hz = s.z + Math.sin(s.a) * (7 + R * 1.4);
    o.vx += (hx - o.x) * 34 * dt; o.vz += (hz - o.z) * 34 * dt;
    // Damp relative to the ship, so the held body travels with you instead of trailing into your path.
    const damp = Math.exp(-7 * dt); o.vx = s.vx + (o.vx - s.vx) * damp; o.vz = s.vz + (o.vz - s.vz) * damp;
    o.x += o.vx * dt; o.z += o.vz * dt;
    // Never let the held body overlap the ship: shove it out along the line between them.
    const gap = dist(o, s) || .001, min = R + 2.2;
    if (alive && gap < min) { o.x = s.x + (o.x - s.x) / gap * min; o.z = s.z + (o.z - s.z) / gap * min; }
    if (sim.grab.planet) for (const a of sim.aliens) if (a.hp > 0 && dist(o, a) < R + ALIENS[a.kind].r) damageAlien(sim, a, 99, ev);
  }

  // ---- aliens
  if (!sim.aliens.length) { sim.waveTimer -= dt; if (sim.waveTimer <= 0) { spawnWave(sim, ev); sim.waveTimer = 5; } }
  const target = alive ? s : SPAWN;
  for (const a of sim.aliens) {
    if (a.hp <= -99) continue;
    a.spin += dt * (a.kind === "saucer" ? 3 : a.kind === "mothership" ? .5 : 7); a.t += dt; a.hitCool -= dt;
    if (a.held) continue;
    if (a.flung > 0) {
      a.x += a.vx * dt; a.z += a.vz * dt; a.flung -= dt;
      let hit = a.flung <= 0 || Math.hypot(a.x, a.z) < SUN_R + 2;
      for (const p of sim.planets) if (dist(a, p) < p.R + 2) hit = true;
      for (const b of sim.aliens) if (b !== a && b.hp > 0 && dist(a, b) < 2 + ALIENS[b.kind].r) hit = true;
      if (hit) {
        killAlien(sim, a, ev);
        for (const b of sim.aliens) if (b.hp > 0 && dist(a, b) < 9 + ALIENS[b.kind].r) damageAlien(sim, b, 99, ev);
        explode(sim, a.x, a.z, "#ffb547", 60, 18); sim.shake = Math.min(1, sim.shake + .5);
        ev.push({ type: "boom", x: a.x, z: a.z });
      }
      continue;
    }
    const dx = target.x - a.x, dz = target.z - a.z, d = Math.hypot(dx, dz) || 1, nx = dx / d, nz = dz / d;
    if (a.kind === "saucer") {
      const radial = Math.max(-1, Math.min(1, (d - 24) / 10));
      a.vx += (nx * radial - nz * a.orbitDir * .9) * 34 * dt; a.vz += (nz * radial + nx * a.orbitDir * .9) * 34 * dt;
      const sp = Math.hypot(a.vx, a.vz); if (sp > 22) { a.vx *= 22 / sp; a.vz *= 22 / sp; }
      a.cool -= dt;
      if (alive && a.cool <= 0 && d < 62) {
        const lead = d / 48, tx = s.x + s.vx * lead * .7 - a.x, tz = s.z + s.vz * lead * .7 - a.z, tl = Math.hypot(tx, tz) || 1;
        sim.bullets.push({ x: a.x, z: a.z, vx: tx / tl * 48, vz: tz / tl * 48, life: 2.4, from: "alien" });
        a.cool = 1.3 + Math.random() * 1.3;
      }
    } else if (a.kind === "hunter") {
      a.vx += nx * 52 * dt; a.vz += nz * 52 * dt;
      const sp = Math.hypot(a.vx, a.vz); if (sp > 34) { a.vx *= 34 / sp; a.vz *= 34 / sp; }
      if (alive && d < 2.8) { hurt(sim, 15, ev); killAlien(sim, a, ev, false); continue; }
    } else if (a.kind === "swarmer") {
      // Weaving dive: hard to hit head-on, pops on contact.
      const weave = Math.sin(a.t * 5 + a.spin) * .9;
      a.vx += (nx - nz * weave) * 70 * dt; a.vz += (nz + nx * weave) * 70 * dt;
      const sp = Math.hypot(a.vx, a.vz); if (sp > 40) { a.vx *= 40 / sp; a.vz *= 40 / sp; }
      if (alive && d < 2.2) { hurt(sim, 8, ev); killAlien(sim, a, ev, false); continue; }
    } else {
      // Mothership: slow orbit at range, rings of fire, launches swarmers.
      const radial = Math.max(-1, Math.min(1, (d - 46) / 20));
      a.vx += (nx * radial - nz * a.orbitDir * .5) * 10 * dt; a.vz += (nz * radial + nx * a.orbitDir * .5) * 10 * dt;
      const sp = Math.hypot(a.vx, a.vz); if (sp > 9) { a.vx *= 9 / sp; a.vz *= 9 / sp; }
      a.cool -= dt;
      if (a.cool <= 0 && d < 110) {
        a.cool = a.hp < a.max / 2 ? 2 : 3; // angrier when damaged
        for (let i = 0; i < 16; i++) { const ang = i / 16 * TAU + a.spin; sim.bullets.push({ x: a.x + Math.cos(ang) * 6, z: a.z + Math.sin(ang) * 6, vx: Math.cos(ang) * 30, vz: Math.sin(ang) * 30, life: 3.2, from: "alien" }); }
      }
      if (a.t > 7 && sim.aliens.length < 30) { a.t = 0; for (let i = 0; i < 3; i++) addAlien(sim, "swarmer", a.x + (Math.random() - .5) * 10, a.z + (Math.random() - .5) * 10); }
    }
    const r = Math.hypot(a.x, a.z);
    if (r < SUN_R + 5) { a.vx += a.x / r * 60 * dt; a.vz += a.z / r * 60 * dt; }
    for (const b of sim.aliens) if (b !== a && b.hp > 0) { const db = dist(a, b); if (db < 5 && db > 0) { a.vx += (a.x - b.x) / db * 20 * dt; a.vz += (a.z - b.z) / db * 20 * dt; } }
    a.x += a.vx * dt; a.z += a.vz * dt;
    // Planets are solid: steer around them, and never end a step inside one.
    const ar = ALIENS[a.kind].r;
    for (const p of sim.planets) {
      if (p.mode === "held" || p.mode === "flung") continue; // those smash aliens instead
      const dp = dist(a, p) || .001, min = p.R + ar, px = (a.x - p.x) / dp, pz = (a.z - p.z) / dp;
      if (dp < min + 8) { const push = (1 - (dp - min) / 8) * 60 * dt; a.vx += px * push; a.vz += pz * push; }
      if (dp < min) {
        a.x = p.x + px * min; a.z = p.z + pz * min;
        const vn = a.vx * px + a.vz * pz; if (vn < 0) { a.vx -= 1.6 * vn * px; a.vz -= 1.6 * vn * pz; }
      }
    }
  }
  sim.aliens = sim.aliens.filter(a => a.hp > -99);

  // ---- bullets
  for (const b of sim.bullets) {
    b.x += b.vx * dt; b.z += b.vz * dt; b.life -= dt;
    if (Math.hypot(b.x, b.z) < SUN_R) { b.life = 0; continue; }
    for (const p of sim.planets) if (p.mode !== "held" && dist(b, p) < p.R) { b.life = 0; explode(sim, b.x, b.z, p.glow, 4, 2); break; }
    if (b.life <= 0) continue;
    if (b.from === "alien") {
      if (alive && dist(b, s) < 1.8) { b.life = 0; hurt(sim, 6, ev); }
    } else for (const a of sim.aliens) {
      if (a.hp > 0 && dist(b, a) < ALIENS[a.kind].r) {
        b.life = 0;
        if (a.kind !== "mothership") { a.vx += b.vx * .04; a.vz += b.vz * .04; }
        explode(sim, b.x, b.z, "#ffffff", 5, 2);
        damageAlien(sim, a, b.dmg ?? 1, ev, b.from === "me");
        break;
      }
    }
  }
  sim.bullets = sim.bullets.filter(b => b.life > 0);
  sim.aliens = sim.aliens.filter(a => a.hp > -99);

  // ---- supernovas (local and from other players)
  for (const n of sim.novas) {
    n.t += dt;
    const radius = novaRadius(n.t);
    for (const a of sim.aliens) if (!n.hit.has(a) && a.hp > 0 && dist(n, a) < radius) { n.hit.add(a); damageAlien(sim, a, 99, ev, n.mine); }
    for (const p of sim.planets) if (!n.hit.has(p) && dist(n, p) < radius) {
      n.hit.add(p);
      const d = dist(n, p) || 1, k = 14 * (1 - d / 100);
      if (k > 0) { p.px += (p.x - n.x) / d * k; p.pz += (p.z - n.z) / d * k; }
    }
  }
  sim.novas = sim.novas.filter(n => n.t < 1.6);
  sim.aliens = sim.aliens.filter(a => a.hp > -99);

  // ---- effects and remote players
  for (const p of sim.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vy -= 9 * dt; p.life -= dt; const k = Math.exp(-1.5 * dt); p.vx *= k; p.vz *= k; }
  sim.particles = sim.particles.filter(p => p.life > 0);
  for (const f of sim.flashes) f.t += dt;
  sim.flashes = sim.flashes.filter(f => f.t < f.max);
  for (const r of sim.remotes.values()) {
    r.tx += r.vx * dt; r.tz += r.vz * dt;
    const k = Math.min(1, dt * 10); r.x += (r.tx - r.x) * k; r.z += (r.tz - r.z) * k;
  }
}

export const novaRadius = (t: number) => 100 * (1 - Math.pow(1 - Math.min(1, t / .9), 3));

/** Apply another player's planet manipulation. */
export function remoteGrab(sim: Sim, m: { planet: number; x: number; z: number; vx: number; vz: number }) {
  const p = sim.planets[m.planet];
  if (!p || p === sim.grab?.planet) return;
  p.mode = "remote"; p.modeT = 0; p.x = m.x; p.z = m.z; p.vx = m.vx; p.vz = m.vz;
}
