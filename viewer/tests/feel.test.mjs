import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEAD, readPad } from '../src/game/gamepad.ts';
import { CHORDS, arpeggio, midiHz } from '../src/game/music.ts';
import { createSim, emptyInput, step } from '../src/game/sim.ts';

const pad = (axes = [0, 0, 0, 0], pressed = []) => ({ axes, buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i), value: pressed.includes(i) ? 1 : 0 })) });

test('gamepad: dead zone, sticks to move and aim, standard buttons', () => {
  assert.deepEqual(readPad(pad([DEAD / 2, 0, 0, 0])).move, { x: 0, z: 0 });
  assert.equal(readPad(pad()).active, false);
  const full = readPad(pad([1, 0, 0, -1], [7, 6, 0]));
  assert.equal(full.move.x, 1); assert.deepEqual(full.aim, { x: 0, z: -1 });
  assert.ok(full.fire && full.grab && full.boost && full.active);
  const face = readPad(pad(undefined, [3, 2, 1, 8]));
  assert.ok(face.nova && face.ping && face.dock && face.board && !face.fire);
});

test('music: chords and arpeggio are in tune and climb an octave', () => {
  assert.equal(midiHz(69), 440);
  assert.ok(Math.abs(midiHz(57) - 220) < 1e-9);
  const a = arpeggio(CHORDS[0]);
  assert.equal(a.length, 8);
  assert.equal(a[4] - a[0], 12);
});

test('hits leave floating numbers, and being shot down remembers the shooter until respawn', () => {
  const sim = createSim({ room: 'trending', title: 't', subtitle: '', owner: '', repos: [] });
  sim.waveTimer = 99; sim.aliens.length = 0;
  sim.aliens.push({ id: 1, kind: 'saucer', x: 100, z: 0, vx: 0, vz: 0, hp: 3, max: 3, cool: 9, held: false, flung: 0, spin: 0, orbitDir: 1, t: 0, hitCool: 0 });
  Object.assign(sim.ship, { x: 60, z: 60, inv: 9 });
  sim.bullets.push({ x: 100, z: 0, vx: 0, vz: 0, life: .5, from: 'me' });
  step(sim, emptyInput(), 1 / 60, []);
  assert.equal(sim.floats.at(-1)?.text, '−1');
  sim.remotes.set(7, { id: 7, name: 'Rival', color: '#f00', x: 40, z: 0, a: 0, vx: 0, vz: 0, hp: 100, tx: 40, tz: 0, seen: 0 });
  Object.assign(sim.ship, { x: 60, z: 0, vx: 0, vz: 0, inv: 0, hp: 5 });
  sim.bullets.push({ x: 58.5, z: 0, vx: 115, vz: 0, life: .85, from: 'ally', owner: 7, dmg: 1 });
  step(sim, emptyInput(), 1 / 60, []);
  assert.equal(sim.killedBy, 7);
  for (let i = 0; i < 200; i++) step(sim, emptyInput(), 1 / 60, []);
  assert.equal(sim.killedBy, null);
  assert.ok(sim.floats.length === 0, 'floating text fades away');
});
