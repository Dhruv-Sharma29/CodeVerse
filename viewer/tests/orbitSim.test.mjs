import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSim, emptyInput, step, gateSpot } from '../src/game/sim.ts';

const repo = (id, name) => ({ id, name, full_name: `o/${name}`, description: null, language: 'Go', stargazers_count: 10, forks_count: 1, pushed_at: '', default_branch: '', fork: false, archived: false });
const universe = { room: 'trending', title: 't', subtitle: '', owner: null, repos: [repo(1, 'a'), repo(2, 'b'), repo(3, 'c')] };
const run = (sim, input, seconds, ev = []) => { for (let t = 0; t < seconds; t += 1 / 60) step(sim, input, 1 / 60, ev); return ev; };

test('shooting kills an alien in front of the ship and scores', () => {
  const sim = createSim(universe);
  Object.assign(sim.ship, { x: 0, z: 30, vx: 0, vz: 0 });
  sim.aliens.push({ id: 1, kind: 'hunter', x: 18, z: 30, vx: 0, vz: 0, hp: 1, cool: 9, held: false, flung: 0, spin: 0, orbitDir: 1 });
  const ev = run(sim, { ...emptyInput(), fire: true, aim: { x: 18, z: 30 } }, .4);
  assert.ok(ev.some(e => e.type === 'kill'));
  assert.equal(sim.score, 60);
});

test('gravity grab holds a planet and flings it on release', () => {
  const sim = createSim(universe);
  const p = sim.planets[0];
  Object.assign(sim.ship, { x: p.x + p.R + 6, z: p.z, vx: 0, vz: 0 });
  run(sim, { ...emptyInput(), grab: true, aim: { x: p.x, z: p.z } }, .1);
  assert.equal(p.mode, 'held');
  run(sim, emptyInput(), 1 / 60);
  assert.equal(p.mode, 'flung');
  assert.ok(Math.hypot(p.vx, p.vz) > 50);
});

test('flying into the portal raises a hyperjump event once', () => {
  const sim = createSim(universe);
  sim.portalCool = 0; Object.assign(sim.ship, { x: sim.portal.x, z: sim.portal.z, vx: 0, vz: 0 });
  const ev = run(sim, emptyInput(), .5);
  assert.equal(ev.filter(e => e.type === 'portal').length, 1);
});

test('a supernova destroys every alien in its blast radius', () => {
  const sim = createSim(universe);
  sim.charge = 100; Object.assign(sim.ship, { x: 0, z: 40, vx: 0, vz: 0 });
  for (let i = 0; i < 5; i++) sim.aliens.push({ id: i, kind: 'saucer', x: 30 * Math.cos(i), z: 40 + 30 * Math.sin(i), vx: 0, vz: 0, hp: 3, cool: 9, held: false, flung: 0, spin: 0, orbitDir: 1 });
  run(sim, { ...emptyInput(), nova: true }, 1 / 60);
  run(sim, emptyInput(), 1);
  assert.equal(sim.aliens.length, 0);
  assert.equal(sim.kills, 5);
});

test('keyboard thrust follows the ship nose, not the screen', () => {
  const sim = createSim({ room: 'trending', title: 't', subtitle: '', owner: '', repos: [] });
  sim.aliens.length = 0;
  Object.assign(sim.ship, { x: 60, z: 0, vx: 0, vz: 0, a: 0, inv: 9 }); // nose points +x
  const input = { ...emptyInput(), relative: true, move: { x: 0, z: -1 } }; // W held
  for (let i = 0; i < 20; i++) step(sim, input, 1 / 60, []);
  assert.ok(sim.ship.vx > 10 && Math.abs(sim.ship.vz) < 1, `moved along nose: ${sim.ship.vx}, ${sim.ship.vz}`);
});

test('the hyperjump gate sits in the outer band, random per universe and time window', () => {
  const a = gateSpot('trending', 400, 7), b = gateSpot('trending', 400, 8), c = gateSpot('u:torvalds', 400, 7);
  for (const g of [a, b, c]) { const r = Math.hypot(g.x, g.z); assert.ok(r > 400 - 23 && r < 400 - 13, `rim radius ${r}`); }
  assert.deepEqual(gateSpot('trending', 400, 7), a); // same for every pilot
  assert.notDeepEqual([a.x, a.z], [b.x, b.z]); assert.notDeepEqual([a.x, a.z], [c.x, c.z]);
});

test('hulls change handling and firepower; the titan fires a heavy three-way spread', () => {
  const sim = createSim({ room: 'trending', title: 't', subtitle: '', owner: '', repos: [] });
  sim.aliens.length = 0; sim.waveTimer = 99; sim.ship.hull = 'titan';
  Object.assign(sim.ship, { x: 60, z: 0, a: 0, fireCool: 0 });
  step(sim, { ...emptyInput(), fire: true }, 1 / 60, []);
  assert.equal(sim.bullets.length, 3);
  assert.ok(sim.bullets.every(b => b.dmg === 2));
});

test('every fifth wave brings a mothership that shrugs off one planet hit and survives it', () => {
  const sim = createSim({ room: 'trending', title: 't', subtitle: '', owner: '', repos: [] });
  sim.wave = 4; sim.waveTimer = 0; sim.aliens.length = 0;
  const ev = []; step(sim, emptyInput(), 1 / 60, ev);
  const boss = sim.aliens.find(a => a.kind === 'mothership');
  assert.ok(boss && ev.some(e => e.type === 'wave' && e.boss));
  const before = boss.hp;
  sim.novas.push({ x: boss.x, z: boss.z, t: .5, mine: true, hit: new Set() });
  step(sim, emptyInput(), 1 / 60, []);
  assert.equal(before - boss.hp, 12); // capped heavy hit, not an instant kill
});

test('aliens cannot fly through planets', async () => {
  const { createSim: make } = await import('../src/game/sim.ts');
  const repo = { name: 'r', full_name: 'o/r', owner: { login: 'o' }, language: 'TypeScript', stargazers_count: 10, forks_count: 1, size: 100, description: '', html_url: '', fork: false };
  const sim = make({ room: 'trending', title: 't', subtitle: '', owner: '', repos: [repo] });
  const p = sim.planets[0]; sim.waveTimer = 99; sim.aliens.length = 0;
  Object.assign(sim.ship, { x: p.x + 40, z: p.z, inv: 99 });
  sim.aliens.push({ id: 1, kind: 'hunter', x: p.x - 30, z: p.z, vx: 34, vz: 0, hp: 1, max: 1, cool: 9, held: false, flung: 0, spin: 0, orbitDir: 1, t: 0, hitCool: 0 });
  let minGap = Infinity;
  for (let i = 0; i < 180; i++) { step(sim, emptyInput(), 1 / 60, []); const a = sim.aliens[0]; if (!a) break; minGap = Math.min(minGap, Math.hypot(a.x - p.x, a.z - p.z) - p.R); }
  assert.ok(minGap >= 1.9, `alien got inside the planet: gap ${minGap}`);
});

test('flying forward while holding a planet never puts the ship inside it', () => {
  const repo = { name: 'r', full_name: 'o/r', owner: { login: 'o' }, language: 'Go', stargazers_count: 10, forks_count: 1, size: 5000, description: '', html_url: '', fork: false };
  const sim = createSim({ room: 'trending', title: 't', subtitle: '', owner: '', repos: [repo] });
  const p = sim.planets[0]; sim.waveTimer = 99; sim.aliens.length = 0;
  Object.assign(sim.ship, { x: p.x - p.R - 10, z: p.z, a: 0, vx: 0, vz: 0, inv: 99 });
  const input = { ...emptyInput(), grab: true, relative: true, boost: true, move: { x: 0, z: -1 } }; // grab + full thrust forward
  let worst = Infinity;
  for (let i = 0; i < 240; i++) { step(sim, input, 1 / 60, []); worst = Math.min(worst, Math.hypot(sim.ship.x - p.x, sim.ship.z - p.z) - p.R); }
  assert.equal(p.mode, 'held');
  assert.ok(worst >= 2, `ship got inside the held planet: gap ${worst}`);
});

test('the comet follows a seeded random chord per universe and pays out once per crossing', async () => {
  const { cometAt, COMET_PERIOD } = await import('../src/game/sim.ts');
  const t0 = 50 * COMET_PERIOD;
  const start = cometAt('trending', 400, t0), mid = cometAt('trending', 400, t0 + COMET_PERIOD / 2);
  assert.ok(Math.hypot(start.x, start.z) > 400, 'enters from beyond the rim');
  assert.ok(Math.hypot(mid.x - start.x, mid.z - start.z) > 200, 'moves across the map');
  assert.deepEqual(cometAt('trending', 400, t0), start); // same for every pilot
  const other = cometAt('u:torvalds', 400, t0), next = cometAt('trending', 400, t0 + COMET_PERIOD);
  assert.notDeepEqual([other.x, other.z], [start.x, start.z]);
  assert.notDeepEqual([next.x, next.z], [start.x, start.z]);

  const sim = createSim({ room: 'trending', title: 't', subtitle: '', owner: '', repos: [] });
  sim.waveTimer = 99; sim.aliens.length = 0;
  const caught = [];
  for (let i = 0; i < 3; i++) {
    Object.assign(sim.ship, { x: sim.comet.x, z: sim.comet.z, vx: sim.comet.vx, vz: sim.comet.vz, inv: 9 });
    const ev = []; step(sim, emptyInput(), 1 / 60, ev); caught.push(ev.filter(e => e.type === 'comet').length);
  }
  assert.deepEqual(caught, [1, 0, 0]);
  assert.equal(sim.score, 250);
});

test("dogfights: any other pilot's shots hurt (no peace mode), and the kill names the shooter", async () => {
  const { PVP } = await import('../src/game/sim.ts');
  const sim = createSim({ room: 'trending', title: 't', subtitle: '', owner: '', repos: [] });
  sim.waveTimer = 99; sim.aliens.length = 0;
  Object.assign(sim.ship, { x: 60, z: 0, vx: 0, vz: 0, inv: 0, hp: 100 });
  const shoot = owner => sim.bullets.push({ x: 58.5, z: 0, vx: 115, vz: 0, life: .85, from: 'ally', owner, dmg: 1 });

  shoot(42); step(sim, emptyInput(), 1 / 60, []);
  assert.equal(sim.ship.hp, 100, 'a shot from someone no longer in the universe does nothing');

  sim.remotes.set(7, { id: 7, name: 'Rival', color: '#f00', x: 40, z: 0, a: 0, vx: 0, vz: 0, hp: 100, tx: 40, tz: 0, seen: 0 });
  shoot(7); step(sim, emptyInput(), 1 / 60, []);
  assert.equal(sim.ship.hp, 100 - PVP.bullet);

  sim.ship.hp = 5; sim.ship.inv = 0;
  const ev = []; shoot(7); step(sim, emptyInput(), 1 / 60, ev);
  assert.deepEqual(ev.find(e => e.type === 'dead'), { type: 'dead', by: 7 });

  Object.assign(sim.ship, { dead: 0, hp: 100, inv: 2.5 }); // respawn shield
  shoot(7); step(sim, emptyInput(), 1 / 60, []);
  assert.equal(sim.ship.hp, 100, 'the respawn shield blocks damage');
});
