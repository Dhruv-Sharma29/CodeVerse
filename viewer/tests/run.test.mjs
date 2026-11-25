import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSim, emptyInput, step, topCause } from '../src/game/sim.ts';

const repo = (id, name) => ({ id, name, full_name: `o/${name}`, description: null, language: 'Go', stargazers_count: 10, forks_count: 1, pushed_at: '', default_branch: '', fork: false, archived: false });
const universe = { room: 'trending', title: 't', subtitle: '', owner: null, repos: [repo(1, 'a')] };
const tick = sim => step(sim, emptyInput(), 1 / 60, []);
const respawn = sim => { for (let i = 0; i < 200 && sim.ship.dead > 0; i++) tick(sim); };

test('the run record: what downed you most, and the best wave reached', () => {
  const sim = createSim(universe); sim.planets.length = 0;
  Object.assign(sim, { waveTimer: 999 });
  assert.equal(topCause(sim), null);
  for (let i = 0; i < 2; i++) {                                     // flown into the sun twice
    Object.assign(sim.ship, { x: 3, z: 0, vx: 0, vz: 0, hp: 5, inv: 0 }); tick(sim); respawn(sim);
  }
  Object.assign(sim.ship, { x: 100, z: 100, hp: 5, inv: 0 });        // shot by a saucer once
  sim.bullets.push({ x: 100, z: 100, vx: 0, vz: 0, life: 1, from: 'alien' }); tick(sim); respawn(sim);
  assert.deepEqual(sim.downs, { 'the sun': 2, 'alien fire': 1 });
  assert.equal(topCause(sim), 'the sun');
  assert.equal(sim.deaths, 3);

  Object.assign(sim, { waveFloor: 7, waveTimer: 0 }); sim.aliens = []; tick(sim);
  assert.equal(sim.bestWave, 7);
});
