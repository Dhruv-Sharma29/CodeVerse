import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyHits, createSim, emptyInput, hosting, isGuest, setHost, step, takeSnap } from '../src/game/sim.ts';

const repo = (id, name) => ({ id, name, full_name: `o/${name}`, description: null, language: 'Go', stargazers_count: 10, forks_count: 1, pushed_at: '', default_branch: '', fork: false, archived: false });
const universe = { room: 'trending', title: 't', subtitle: '', owner: null, repos: [repo(1, 'a')] };
const remote = (id, x, z) => ({ id, name: 'p', color: '#fff', x, z, a: 0, vx: 0, vz: 0, hp: 100, tx: x, tz: z, seen: 0 });

/** Host (relay id 1) and guest (id 2) in one universe, with each other as remotes. */
function pair() {
  const host = createSim(universe), guest = createSim(universe);
  for (const s of [host, guest]) { s.planets.length = 0; s.ship.inv = 999; }
  host.myId = 1; guest.myId = 2;
  host.remotes.set(2, remote(2, guest.ship.x, guest.ship.z)); guest.remotes.set(1, remote(1, host.ship.x, host.ship.z));
  setHost(host, 1); setHost(guest, 1);
  return { host, guest };
}
const tick = (sim, input = emptyInput()) => { const ev = []; step(sim, input, 1 / 60, ev); return ev; };

test('the host runs the wave and the guest sees the same aliens', () => {
  const { host, guest } = pair();
  assert.ok(hosting(host) && isGuest(guest));
  host.waveTimer = 0; tick(host);
  assert.ok(host.aliens.length > 0);
  for (let i = 0; i < 300; i++) tick(guest);
  assert.equal(guest.aliens.length, 0, 'a guest never spawns its own wave');
  guest.snap = takeSnap(host);
  const ev = tick(guest);
  assert.deepEqual(guest.aliens.map(a => [a.id, a.kind]), host.aliens.map(a => [a.id, a.kind]));
  assert.equal(guest.wave, host.wave);
  assert.ok(ev.some(e => e.type === 'wave'));
});

test("a guest's kill is decided by the host and credited to the guest alone", () => {
  const { host, guest } = pair();
  host.waveTimer = 0; tick(host);
  host.aliens = host.aliens.slice(0, 1);
  const target = host.aliens[0];
  Object.assign(target, { x: guest.ship.x + 20, z: guest.ship.z, vx: 0, vz: 0, hp: 1, shield: undefined, kind: 'swarmer' });
  guest.snap = takeSnap(host); tick(guest);
  const a = guest.aliens[0];
  // The guest shoots it: it pops at once on the guest's screen, but the points wait for the host.
  for (let i = 0; i < 30 && guest.aliens.length; i++) { Object.assign(a, { x: guest.ship.x + 20, z: guest.ship.z, vx: 0, vz: 0 }); tick(guest, { ...emptyInput(), fire: true, aim: { x: a.x, z: a.z } }); }
  assert.equal(guest.aliens.length, 0);
  assert.equal(guest.score, 0);
  assert.ok(guest.outHits.length >= 2);
  applyHits(host, 2, guest.outHits.splice(0));
  assert.equal(target.hp, -99);
  assert.equal(host.score, 0, 'the host gets nothing for it');
  guest.snap = takeSnap(host);
  const ev = tick(guest);
  assert.equal(guest.score, 40); assert.equal(guest.kills, 1);
  assert.ok(ev.some(e => e.type === 'kill'));
});

test('aliens chase whichever pilot is nearest, and a new host keeps the aliens it mirrored', () => {
  const { host, guest } = pair();
  host.waveTimer = 0; tick(host);
  host.aliens = host.aliens.filter(a => a.kind === 'saucer').slice(0, 1);
  const a = host.aliens[0];
  Object.assign(host.remotes.get(2), { x: 200, z: 0, tx: 200, tz: 0 });
  Object.assign(a, { x: 180, z: 0, vx: 0, vz: 0, cool: 99 });
  Object.assign(host.ship, { x: -200, z: 0 });
  for (let i = 0; i < 60; i++) tick(host);
  assert.ok(Math.hypot(a.x - 200, a.z) < 30, 'it closed on the guest, not the far-away host');

  guest.snap = takeSnap(host); tick(guest);
  guest.remotes.clear(); setHost(guest, 2);           // the host left: the guest takes over
  assert.ok(!isGuest(guest));
  assert.equal(guest.aliens.length, 1);
  assert.ok(guest.nextAlien > a.id);
});
