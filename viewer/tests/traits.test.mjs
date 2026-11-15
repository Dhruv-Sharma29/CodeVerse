import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ISSUE, STAR, isFresh, issueRockCount, planetTrait } from '../src/game/traits.ts';
import { createSim, emptyInput, step } from '../src/game/sim.ts';

const repo = (over = {}) => ({ id: 1, name: 'r', full_name: 'o/r', description: '', language: 'Go', stargazers_count: 500, forks_count: 1, size: 9000, pushed_at: '', default_branch: 'main', fork: false, archived: false, open_issues_count: 40, ...over });

test('languages map to planet physics', () => {
  assert.equal(planetTrait('Rust').kind, 'heavy');
  assert.equal(planetTrait('TypeScript').kind, 'bouncy');
  assert.equal(planetTrait('Python').kind, 'light');
  assert.equal(planetTrait(null).kind, 'normal');
  assert.ok(planetTrait('Rust').fling < 1 && planetTrait('Python').fling > 1);
});

test('issue rocks scale with open issues; stars and activity are read from the repo', () => {
  assert.equal(issueRockCount(0), 0); assert.equal(issueRockCount(undefined), 0);
  assert.ok(issueRockCount(3) >= 2 && issueRockCount(3) < issueRockCount(200));
  assert.equal(issueRockCount(100000), 10);
  const now = Date.parse('2026-11-16T00:00:00Z');
  assert.equal(isFresh(repo({ pushed_at: '2026-11-10T00:00:00Z' }), now), true);
  assert.equal(isFresh(repo({ pushed_at: '2026-01-01T00:00:00Z' }), now), false);
  assert.equal(isFresh(repo({ monthlyStars: 900 }), now), true);
});

const world = over => { const sim = createSim({ room: 'u:o', title: 't', subtitle: '', owner: 'o', repos: [repo(over)] }); sim.waveTimer = 99; sim.aliens.length = 0; return sim; };

test('shooting an issue rock closes it for score and charge', () => {
  const sim = world(), p = sim.planets[0], rock = p.rocks[0];
  Object.assign(sim.ship, { x: p.x + 80, z: p.z + 80, inv: 9 });
  const rx = p.x + Math.cos(rock.a) * rock.r, rz = p.z + Math.sin(rock.a) * rock.r;
  sim.bullets.push({ x: rx, z: rz, vx: 0, vz: 0, life: .5, from: 'me' });
  const ev = [], score = sim.score; step(sim, emptyInput(), 1 / 60, ev);
  assert.ok(ev.some(e => e.type === 'issue'));
  assert.equal(rock.alive, false);
  assert.equal(sim.score - score, ISSUE.points);
});

test('flying through a star gives a shield and repairs, then it recharges', () => {
  const sim = world(), p = sim.planets[0];
  sim.ship.hp = 40;
  const ev = [];
  for (let i = 0; i < 3 && !ev.some(e => e.type === 'star'); i++) {
    Object.assign(sim.ship, { x: p.x + Math.cos(p.star.a) * p.star.r, z: p.z + Math.sin(p.star.a) * p.star.r, vx: 0, vz: 0 });
    step(sim, emptyInput(), 1 / 60, ev);
  }
  assert.ok(ev.some(e => e.type === 'star'));
  assert.ok(Math.abs(sim.ship.hp - (40 + STAR.heal)) < .5, `hull ${sim.ship.hp}`); // plus a frame of regen
  assert.ok(sim.ship.inv >= STAR.shield - .1);
  assert.ok(p.star.cool > STAR.respawn - 1);
});

test('a bouncy planet ricochets off the sun instead of stopping dead', () => {
  const sim = world({ language: 'JavaScript' }), p = sim.planets[0];
  Object.assign(sim.ship, { x: 300, z: 300, inv: 9 });
  Object.assign(p, { mode: 'flung', modeT: 0, x: 8 + p.R + 1.5, z: 0, vx: -60, vz: 0 });
  for (let i = 0; i < 10; i++) step(sim, emptyInput(), 1 / 60, []);
  assert.ok(p.vx > 40, `bounced outward: vx ${p.vx}`);
});
