import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOUNTY, HOLD, STORM, bountyHolder, dailyChallenge, stormMeteors, stormPhase } from '../src/game/events.ts';
import { createSim, emptyInput, step } from '../src/game/sim.ts';

test('meteor storms run 40 s every 10 minutes, the same meteors for every pilot', () => {
  const t0 = 1000 * STORM.period;
  assert.equal(stormPhase(t0 + 5_000), 'active');
  assert.equal(stormPhase(t0 + STORM.period - 5_000), 'warning');
  assert.equal(stormPhase(t0 + 120_000), 'calm');
  const a = stormMeteors('trending', 400, t0 + 20_000), b = stormMeteors('trending', 400, t0 + 20_000);
  assert.ok(a.length > 30, `meteors in flight: ${a.length}`);
  assert.deepEqual(a, b);
  assert.notDeepEqual(stormMeteors('u:torvalds', 400, t0 + 20_000).map(m => m.x), a.map(m => m.x));
  assert.equal(stormMeteors('trending', 400, t0 + 120_000).length, 0);
});

test('a meteor hit costs hull; shooting a meteor scores', () => {
  const realNow = Date.now, at = 1000 * STORM.period + 20_000; // 20 s into a storm
  try {
    Date.now = () => at;
    const sim = createSim({ room: 'trending', title: 't', subtitle: '', owner: '', repos: [] });
    sim.waveTimer = 99; sim.aliens.length = 0;
    const [m, m2] = stormMeteors(sim.universe.room, sim.edge, at);
    Object.assign(sim.ship, { x: m.x, z: m.z, vx: 0, vz: 0, inv: 0, hp: 100 });
    step(sim, emptyInput(), 1 / 60, []);
    assert.equal(sim.ship.hp, 100 - STORM.damage);
    assert.ok(sim.meteorsGone.has(m.id));
    // Shooting: a bullet of mine right on another meteor destroys it and scores.
    Object.assign(sim.ship, { x: m2.x + 200, z: m2.z + 200, inv: 9 });
    sim.bullets.push({ x: m2.x, z: m2.z, vx: 0, vz: 0, life: .5, from: 'me' });
    const ev = [], score = sim.score; step(sim, emptyInput(), 1 / 60, ev);
    assert.ok(ev.some(e => e.type === 'meteor'));
    assert.equal(sim.score - score, STORM.points);
  } finally { Date.now = realNow; }
});

test('the bounty goes to a clear top scorer once two pilots are present', () => {
  assert.equal(bountyHolder([{ id: 1, score: 5000 }]), null);
  assert.equal(bountyHolder([{ id: 1, score: BOUNTY.min - 1 }, { id: 2, score: 10 }]), null);
  assert.equal(bountyHolder([{ id: 1, score: 2400 }, { id: 2, score: 1800 }]), 1);
  assert.equal(bountyHolder([{ id: 1, score: 2400 }, { id: 2, score: 2400 }]), null);
});

test('holding the gate scores alone and stops when another pilot contests it', () => {
  const sim = createSim({ room: 'trending', title: 't', subtitle: '', owner: '', repos: [] });
  sim.waveTimer = 99; sim.aliens.length = 0;
  const g = sim.portal, spot = { x: g.x + (HOLD.r - 6), z: g.z };
  for (let i = 0; i < 120; i++) { Object.assign(sim.ship, { ...spot, vx: 0, vz: 0 }); step(sim, emptyInput(), 1 / 60, []); }
  assert.equal(sim.holding, 'holding');
  assert.ok(sim.score >= HOLD.rate * 2 - 1, `score ${sim.score}`);
  sim.remotes.set(9, { id: 9, name: 'R', color: '#f00', x: g.x - 10, z: g.z, a: 0, vx: 0, vz: 0, hp: 100, tx: g.x - 10, tz: g.z, seen: 0 });
  const held = sim.score;
  for (let i = 0; i < 60; i++) { Object.assign(sim.ship, { ...spot, vx: 0, vz: 0 }); step(sim, emptyInput(), 1 / 60, []); }
  assert.equal(sim.holding, 'contested');
  assert.equal(sim.score, held);
});

test('the daily challenge is the same all day and changes between days', () => {
  const a = dailyChallenge(new Date('2026-11-16T01:00:00Z')), b = dailyChallenge(new Date('2026-11-16T23:00:00Z'));
  assert.deepEqual(a, b);
  const week = new Set(Array.from({ length: 14 }, (_, i) => JSON.stringify(dailyChallenge(new Date(Date.UTC(2026, 10, 1 + i))))));
  assert.ok(week.size > 5);
  assert.match(a.room, /^u:/);
});

test('storm randomness is spread evenly (no clumping when keys differ only at the end)', async () => {
  const { rand } = await import('../src/game/events.ts');
  const buckets = new Array(10).fill(0);
  for (let i = 0; i < 1000; i++) buckets[Math.floor(rand(`storm:trending:1000:${i}`) * 10)]++;
  assert.ok(Math.min(...buckets) > 60 && Math.max(...buckets) < 140, buckets.join(' '));
});
