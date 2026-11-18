import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PERKS, choosePerk, createSim, emptyInput, maxHp, offerPerks, step } from '../src/game/sim.ts';

const repo = (id, name) => ({ id, name, full_name: `o/${name}`, description: null, language: 'Go', stargazers_count: 10, forks_count: 1, pushed_at: '', default_branch: '', fork: false, archived: false });
const universe = { room: 'trending', title: 't', subtitle: '', owner: null, repos: [repo(1, 'a'), repo(2, 'b')] };

test('clearing a wave offers three different perks once; picking one applies it', () => {
  const sim = createSim(universe);
  Object.assign(sim, { wave: 1, waveTimer: 99 });           // wave 1 over, no aliens left
  const ev = [];
  step(sim, emptyInput(), 1 / 60, ev);
  assert.equal(ev.filter(e => e.type === 'perks').length, 1);
  assert.equal(new Set(sim.offer).size, 3);
  step(sim, emptyInput(), 1 / 60, ev);
  assert.equal(ev.filter(e => e.type === 'perks').length, 1); // not offered again for the same wave

  const notOffered = Object.keys(PERKS).find(k => !sim.offer.includes(k));
  assert.equal(choosePerk(sim, notOffered), false);
  sim.offer = ['hull', 'rapid', 'nova'];
  sim.ship.hp = 10;
  assert.equal(choosePerk(sim, 'hull'), true);
  assert.equal(sim.offer, null);
  assert.equal(maxHp(sim), 120);                            // dart 100 + 20%
  assert.equal(sim.ship.hp, 120);                           // fully repaired
});

test('maxed perks are never offered, and rapid fire shortens the gun cooldown', () => {
  const sim = createSim(universe);
  Object.assign(sim.perks, { rapid: 3, beam: 3, nova: 3 });
  for (let i = 0; i < 20; i++) assert.deepEqual(offerPerks(sim).sort(), ['engine', 'hull']);
  sim.perks.rapid = 2;
  step(sim, { ...emptyInput(), fire: true, aim: { x: 50, z: 0 } }, 1 / 60, []);
  assert.ok(Math.abs(sim.ship.fireCool - .13 * .85 ** 2) < 1e-9);
});

test('unclaimed upgrades stack up and are offered oldest first', () => {
  const sim = createSim(universe);
  const clear = wave => { Object.assign(sim, { wave, waveTimer: 99 }); step(sim, emptyInput(), 1 / 60, []); };
  clear(3); clear(4); clear(5);
  assert.deepEqual(sim.owed, [3, 4, 5]);
  assert.equal(choosePerk(sim, sim.offer[0]), true);
  assert.deepEqual(sim.owed, [4, 5]);
  assert.equal(sim.offer.length, 3);                        // wave 4's offer shows next
  choosePerk(sim, sim.offer[0]); choosePerk(sim, sim.offer[0]);
  assert.deepEqual(sim.owed, []);
  assert.equal(sim.offer, null);
});
