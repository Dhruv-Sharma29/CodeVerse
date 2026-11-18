import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSim, emptyInput, step } from '../src/game/sim.ts';
import { BOT_KILL, spawnBots, stepBots } from '../src/game/bots.ts';

const repo = (id, name) => ({ id, name, full_name: `o/${name}`, description: null, language: 'Go', stargazers_count: 10, forks_count: 1, pushed_at: '', default_branch: '', fork: false, archived: false });
const universe = { room: 'trending', title: 't', subtitle: '', owner: null, repos: [repo(1, 'a'), repo(2, 'b')] };
const still = () => .5; // deterministic: no aim wobble
const tick = (sim, input = emptyInput(), ev = []) => { step(sim, input, 1 / 60, ev); stepBots(sim, 1 / 60, still); return ev; };
const alien = (kind, x, z) => ({ id: 1, kind, x, z, vx: 0, vz: 0, hp: 1, max: 1, cool: 99, held: false, flung: 0, spin: 0, orbitDir: 1, t: 0, hitCool: 0 });

test('bots race you for commits: a commit a bot reaches is gone', () => {
  const sim = createSim(universe);
  sim.waveTimer = 999;
  const p = sim.planets[1];
  p.sats = [{ a: 0, r: p.R + 6, done: false, c: {} }];
  Object.assign(sim.ship, { x: -300, z: -300, vx: 0, vz: 0 });
  spawnBots(sim, 2, still);
  assert.deepEqual(sim.bots.map(b => b.id), [-1001, -1002]);       // never -1, your id while offline
  for (let t = 0; t < 12; t += 1 / 60) tick(sim);
  assert.equal(p.sats[0].done, true);
  assert.ok(sim.bots.some(b => b.score === 25));
});

test('bots hunt aliens for points', () => {
  const sim = createSim(universe);
  sim.waveTimer = 999;
  spawnBots(sim, 1, still);
  const b = sim.bots[0];
  Object.assign(b, { x: 100, z: 100, a: 0 });
  Object.assign(sim.ship, { x: -200, z: -200 });                  // far away: the alien is the nearer target
  sim.aliens.push(alien('swarmer', 120, 100));
  for (let t = 0; t < 2 && sim.aliens.some(a => a.hp > 0); t += 1 / 60) {
    sim.aliens.forEach(a => { if (a.hp > 0) Object.assign(a, { x: 120, z: 100, vx: 0, vz: 0 }); });
    tick(sim);
  }
  assert.equal(b.kills, 1);
  assert.equal(b.score, 40);
});

test('a bot near you picks a fight, and shooting it down scores and it comes back', () => {
  const sim = createSim(universe);
  sim.waveTimer = 999; sim.planets.length = 0;
  Object.assign(sim.ship, { x: 100, z: 100, vx: 0, vz: 0, inv: 0, a: 0 });
  spawnBots(sim, 1, still);
  const b = sim.bots[0];
  Object.assign(b, { x: 125, z: 100, a: Math.PI, vx: 0, vz: 0 });
  const hp = sim.ship.hp;
  for (let t = 0; t < 1.5; t += 1 / 60) tick(sim);
  assert.ok(sim.ship.hp < hp, 'the bot shot you');

  Object.assign(sim.ship, { hp: 999, inv: 0 });
  const ev = [];
  for (let t = 0; t < 6 && b.dead <= 0; t += 1 / 60) {
    Object.assign(b, { x: sim.ship.x + 14, z: sim.ship.z, vx: 0, vz: 0 });       // hold it in your sights
    tick(sim, { ...emptyInput(), fire: true, aim: { x: b.x, z: b.z } }, ev);
  }
  assert.ok(ev.some(e => e.type === 'botDown'));
  assert.equal(sim.score, BOT_KILL);
  assert.equal(sim.pvpKills, 1);
  for (let t = 0; t < 5.2; t += 1 / 60) stepBots(sim, 1 / 60, still);
  assert.equal(b.hp, 100);                                            // back in the race
});

test('bots are solid: flying into one pushes you back instead of passing through', () => {
  const sim = createSim(universe);
  sim.waveTimer = 999; sim.planets.length = 0;
  spawnBots(sim, 1, still);
  const b = sim.bots[0];
  Object.assign(b, { x: 100, z: 100, vx: 0, vz: 0, a: 0 });
  Object.assign(sim.ship, { x: 90, z: 100, vx: 40, vz: 0, inv: 9 });
  let closest = Infinity;
  for (let t = 0; t < 1; t += 1 / 60) {
    Object.assign(b, { vx: 0, vz: 0 });
    tick(sim); closest = Math.min(closest, Math.hypot(b.x - sim.ship.x, b.z - sim.ship.z));
  }
  assert.ok(closest > 3, `got within ${closest.toFixed(2)}`);
  assert.ok(sim.ship.x < b.x, 'still on your side of the bot');
});
