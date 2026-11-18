import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PERKS, SHIELD_HP, alienHp, createSim, emptyInput, step } from '../src/game/sim.ts';

const repo = (id, name) => ({ id, name, full_name: `o/${name}`, description: null, language: 'Go', stargazers_count: 10, forks_count: 1, pushed_at: '', default_branch: '', fork: false, archived: false });
const universe = { room: 'trending', title: 't', subtitle: '', owner: null, repos: [repo(1, 'a'), repo(2, 'b')] };
const run = (sim, seconds, input = emptyInput(), ev = []) => { for (let t = 0; t < seconds; t += 1 / 60) step(sim, input, 1 / 60, ev); return ev; };
const saucer = (x, z, extra = {}) => ({ id: 1, kind: 'saucer', x, z, vx: 0, vz: 0, hp: 3, max: 3, cool: 99, held: false, flung: 0, spin: 0, orbitDir: 1, t: 0, hitCool: 0, ...extra });

test('after wave 5 aliens get tougher and some saucers carry shields', () => {
  assert.equal(alienHp('saucer', 5), 3);
  assert.equal(alienHp('saucer', 10), 5);                     // +15% a wave past wave 5
  const sim = createSim(universe);
  Object.assign(sim, { wave: 8, waveTimer: 0 });              // the next wave spawned is wave 9
  run(sim, 1 / 60);
  const saucers = sim.aliens.filter(a => a.kind === 'saucer');
  assert.ok(saucers.every(a => a.hp === alienHp('saucer', 9)));
  assert.ok(saucers.some(a => a.shield === SHIELD_HP) && saucers.some(a => !a.shield));
});

test('a shield soaks bullets but not a supernova', () => {
  const sim = createSim(universe);
  sim.waveTimer = 999;
  Object.assign(sim.ship, { x: 200, z: 200, vx: 0, vz: 0, a: 0 });
  sim.aliens.push(saucer(214, 200, { shield: SHIELD_HP }));
  run(sim, .35, { ...emptyInput(), fire: true, aim: { x: 214, z: 200 } });
  assert.equal(sim.aliens[0].hp, 3);                          // hull untouched while the shield holds
  assert.ok(sim.aliens[0].shield < SHIELD_HP);
  sim.charge = 100;
  run(sim, 1, { ...emptyInput(), nova: true });
  assert.ok(sim.aliens.every(a => a.hp <= 0) || sim.aliens.length === 0);
});

test('the hull repairs only between waves', () => {
  const sim = createSim(universe);
  sim.waveTimer = 999; sim.planets.length = 0;
  Object.assign(sim.ship, { x: 200, z: 200, vx: 0, vz: 0, hp: 50, lastHit: -99 });
  sim.aliens.push(saucer(260, 260));
  run(sim, 2);
  assert.equal(Math.round(sim.ship.hp), 50);
  sim.aliens.length = 0;
  run(sim, 2);
  assert.ok(sim.ship.hp > 60);
});

test('being shot down costs one level of a perk you have', () => {
  const sim = createSim(universe);
  sim.waveTimer = 999;
  Object.assign(sim.perks, { rapid: 2, hull: 1 });
  Object.assign(sim.ship, { hp: 1, inv: 0 });
  sim.bullets.push({ x: sim.ship.x - 1, z: sim.ship.z, vx: 60, vz: 0, life: 1, from: 'alien' });
  const ev = run(sim, .1);
  const dead = ev.find(e => e.type === 'dead');
  assert.ok(dead && dead.lost in PERKS);
  assert.equal(sim.perks.rapid + sim.perks.hull, 2);
});
