import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSim, emptyInput, step } from '../src/game/sim.ts';
import { spawnBots, stepBots } from '../src/game/bots.ts';

const repo = (id, name) => ({ id, name, full_name: `o/${name}`, description: null, language: 'Go', stargazers_count: 10, forks_count: 1, pushed_at: '', default_branch: '', fork: false, archived: false });
const universe = { room: 'trending', title: 't', subtitle: '', owner: null, repos: [repo(1, 'a'), repo(2, 'b')] };
const run = (sim, seconds, input = emptyInput()) => { for (let t = 0; t < seconds; t += 1 / 60) { step(sim, input, 1 / 60, []); stepBots(sim, 1 / 60); } };

test('bots fly through commits away from you and score them, leaving them for you', () => {
  const sim = createSim(universe);
  Object.assign(sim, { waveTimer: 999 });
  const p = sim.planets[1];
  p.sats = [{ a: 0, r: p.R + 6, done: false, c: {} }];
  Object.assign(sim.ship, { x: -300, z: -300, vx: 0, vz: 0 });   // far away, so the bot may take it
  spawnBots(sim, 2, () => .5);
  assert.deepEqual(sim.bots.map(b => b.id), [-1, -2]);
  run(sim, 12);
  assert.ok(sim.bots.some(b => b.score === 25), 'a bot collected the commit');
  assert.equal(p.sats[0].done, false);                             // still there for you
});

test('bots shoot aliens and get the kill, but their shots never hurt you', () => {
  const sim = createSim(universe);
  Object.assign(sim, { waveTimer: 999 });
  spawnBots(sim, 1, () => .5);
  const b = sim.bots[0];
  Object.assign(b, { x: 100, z: 100, a: 0 });
  sim.aliens.push({ id: 1, kind: 'swarmer', x: 120, z: 100, vx: 0, vz: 0, hp: 1, max: 1, cool: 99, held: false, flung: 0, spin: 0, orbitDir: 1, t: 0, hitCool: 0 });
  Object.assign(sim.ship, { x: 140, z: 100, vx: 0, vz: 0, inv: 0 });  // right behind the alien, in the line of fire
  const hp = sim.ship.hp;
  sim.aliens[0].vx = sim.aliens[0].vz = 0;
  for (let t = 0; t < 2 && sim.aliens.some(a => a.hp > 0); t += 1 / 60) {
    sim.aliens.forEach(a => { if (a.hp > 0) { a.x = 120; a.z = 100; a.vx = a.vz = 0; } });  // pin it in place
    stepBots(sim, 1 / 60); step(sim, emptyInput(), 1 / 60, []);
  }
  assert.equal(b.kills, 1);
  assert.equal(b.score, 40);
  sim.bullets.push({ x: sim.ship.x - 3, z: sim.ship.z, vx: 115, vz: 0, life: .85, from: 'ally', owner: b.id, dmg: 2 }); // straight at you
  run(sim, .2);
  assert.equal(sim.ship.hp, hp);
});
